'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { play } from '@/lib/audio';
import { useBattle, type BattlePhase } from '@/lib/arena/battleMachine';
import { camp, courtyard, GATE_Z } from '@/lib/arena/formations';
import { KINGDOMS, kingdomGlow } from '@/lib/game/factions';
import type { IncomingCamp } from '@/lib/realm/derive';
import { angleDist, GATE_ANGLE, groundY, WALL_RADIUS, type RealmLayout } from '@/lib/realm/layout';

import { useCrowd } from './useCrowd';
import type { WarriorState } from './WarriorCrowd';
import { ARM_GEO, ARM_RAISED, ARM_REST, ARM_STRIKE, BODY_GEO, BODY_WHITE, commitSoldiers, GEAR_GEO, GEAR_MAT, swing, writeSoldier } from './soldier';

/**
 * The battle as a fight (KINGDOM_UI §5): one soldier per member. Defenders file out of the gate,
 * attackers march round the island from their camps, then they pair off into sword duels.
 *
 * Nobody wins by luck of the animation: the result still comes from the VRF `BattleEntry`.
 * Before it lands, losses fall on both sides (weighted by the live odds, and never wiping a side
 * out). Once HELD / FALLEN is known, every loser is cut down in a duel; the winners then cheer
 * (HELD) or storm through the gate into the courtyard (FALLEN). With no defenders at home, the
 * walls' arrows (Projectiles) and the gate stand in for the army.
 */

const MAX = 60;
const FIELD_Z = GATE_Z + 1.75;
const DEF_LINE = GATE_Z + 1.05;
const ATT_LINE = GATE_Z + 2.7;
const DUEL_DIST = 0.42;
const SPARKS = 48;

interface Fighter {
  faction: number;
  def: boolean;
  slot: number;
  pos: THREE.Vector3;
  face: number;
  alive: boolean;
  /** Seconds since death (drives the fall). */
  dead: number;
  fallDir: number;
  opp: number;
  swingT: number;
  /** Seconds left in a forced strike (the killing blow). */
  strike: number;
  /** Courtyard spot once a conqueror is inside. */
  home: [number, number];
  /** Passed through the gate (conquerors) / out of it (defenders). */
  gateStage: number;
}

export interface MeleeSides {
  defender: number;
  defenders: number;
  camps: IncomingCamp[];
}

const polar = (r: number, a: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;

/** Splits the 60-instance budget across sides, keeping ≥1 per side that has anyone. */
function budget(defenders: number, camps: IncomingCamp[]): { d: number; a: number[] } {
  const total = defenders + camps.reduce((s, c) => s + c.troops, 0);
  const k = total > MAX ? MAX / total : 1;
  return {
    d: defenders > 0 ? Math.max(1, Math.floor(defenders * k)) : 0,
    a: camps.map((c) => Math.max(1, Math.floor(c.troops * k))),
  };
}

export function Melee({
  layout,
  sides,
  pDefend,
  startPhase,
}: {
  layout: RealmLayout;
  sides: MeleeSides;
  /** Live defend odds (before the VRF result is known). */
  pDefend: number;
  /** Phase when this battle mounted: MUSTER → attackers start at their camps. */
  startPhase: BattlePhase;
}) {
  const body = useRef<THREE.InstancedMesh>(null);
  const gear = useRef<THREE.InstancedMesh>(null);
  const arm = useRef<THREE.InstancedMesh>(null);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const label = useRef<HTMLDivElement>(null);

  const sim = useMemo(() => {
    const { d, a } = budget(sides.defenders, sides.camps);
    const fighters: Fighter[] = [];
    const yard = courtyard(d);
    for (let i = 0; i < d; i++) {
      const t = yard[i];
      fighters.push(mk(sides.defender, true, 0, t.x, t.z, 0));
    }
    sides.camps.forEach((c, slot) => {
      const fromCamp = startPhase === 'MUSTER';
      const spots = camp(a[slot], c.angle);
      for (let i = 0; i < a[slot]; i++) {
        if (fromCamp) {
          fighters.push(mk(c.faction, false, slot, spots[i].x, spots[i].z, spots[i].face));
        } else {
          // replay / late join: charge in from just beyond the field
          const x = (slot - (sides.camps.length - 1) / 2) * 1.2 + ((i % 5) - 2) * 0.22;
          const z = ATT_LINE + 1.6 + Math.floor(i / 5) * 0.25;
          fighters.push(mk(c.faction, false, slot, x, z, Math.PI));
        }
      }
    });
    fighters.forEach((f, i) => (f.home = [HOMES[i].x, HOMES[i].z]));
    return {
      fighters,
      startDef: fighters.filter((f) => f.def).length,
      startAtt: fighters.filter((f) => !f.def).length,
      killClock: 0,
      resultLosers: -1,
      sparks: Array.from({ length: SPARKS }, () => ({ t: 1, p: new THREE.Vector3(), v: new THREE.Vector3() })),
      nextSpark: 0,
      soundAt: 0,
      labelAt: 0,
    };
    // A battle's cast is set when it mounts (keyed by epoch:territory upstream); camps that
    // arrive during MUSTER are added in the frame loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const crowd = useCrowd();
  const sidesRef = useRef(sides);
  sidesRef.current = sides;

  useLayoutEffect(() => {
    const c = new THREE.Color();
    if (!body.current) return;
    sim.fighters.forEach((f, i) => body.current!.setColorAt(i, c.set(kingdomGlow(f.faction))));
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true;
  }, [sim, crowd]);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    const now = state.clock.elapsedTime;
    const { phase, entry } = useBattle.getState();
    const F = sim.fighters;
    if (phase === 'MUSTER') joinLate();
    const result = phase === 'HELD' || phase === 'FALLEN';
    const fighting = phase === 'CLASH' || phase === 'ROLL' || result;
    const winner = result && entry ? entry.winner : -1;
    const wins = (f: Fighter) => f.faction === winner;
    const enemies = (a: Fighter, b: Fighter) => (result ? wins(a) !== wins(b) : a.def !== b.def);

    // --- pairing ----------------------------------------------------------------------------
    if (fighting) {
      for (let i = 0; i < F.length; i++) {
        const f = F[i];
        if (!f.alive) continue;
        const o = f.opp >= 0 ? F[f.opp] : null;
        if (o && o.alive && enemies(f, o)) continue;
        f.opp = -1;
        let best = -1;
        let bestScore = Infinity;
        for (let j = 0; j < F.length; j++) {
          const g = F[j];
          if (j === i || !g.alive || !enemies(f, g)) continue;
          // prefer the nearest enemy who is not already in a duel
          const busy = g.opp >= 0 && g.opp !== i ? 1.5 : 0;
          const score = f.pos.distanceTo(g.pos) + busy;
          if (score < bestScore) {
            bestScore = score;
            best = j;
          }
        }
        f.opp = best;
        if (best >= 0 && F[best].opp < 0) F[best].opp = i;
      }
    }

    // --- casualties --------------------------------------------------------------------------
    const aliveDef = F.filter((f) => f.alive && f.def).length;
    const aliveAtt = F.filter((f) => f.alive && !f.def).length;
    if (result) {
      const losers = F.filter((f) => f.alive && !wins(f));
      if (sim.resultLosers < 0) sim.resultLosers = losers.length;
      if (losers.length) {
        sim.killClock += d;
        const interval = Math.max(0.12, 2.8 / Math.max(sim.resultLosers, 1));
        if (sim.killClock >= interval) {
          sim.killClock = 0;
          // a loser locked in a duel goes first, otherwise the one closest to a winner
          const engaged = losers.filter((f) => f.opp >= 0 && F[f.opp].alive && f.pos.distanceTo(F[f.opp].pos) < DUEL_DIST + 0.12);
          const victim = engaged[0] ?? (sim.resultLosers > 0 && !F.some((f) => f.alive && wins(f)) ? losers[0] : null);
          if (victim) kill(victim, victim.opp >= 0 ? F[victim.opp] : null);
        }
      }
    } else if (fighting) {
      sim.killClock += d;
      if (sim.killClock >= 0.9) {
        sim.killClock = 0;
        const pairs = F.filter((f) => f.alive && f.opp >= 0 && F[f.opp].alive && f.pos.distanceTo(F[f.opp].pos) < DUEL_DIST + 0.12);
        if (pairs.length) {
          // losses before the result follow the odds, biased towards the eventual loser if known
          let pDefDies = 1 - pDefend;
          if (entry) pDefDies = entry.winner === entry.defender ? 0.38 : 0.62;
          const defFloor = Math.ceil(sim.startDef * 0.45);
          const attFloor = Math.ceil(sim.startAtt * 0.45);
          const wantDef = Math.random() < pDefDies;
          const pool = pairs.filter((f) => f.def === wantDef);
          const victim = pool[Math.floor(Math.random() * pool.length)];
          if (victim && (victim.def ? aliveDef > defFloor : aliveAtt > attFloor)) kill(victim, F[victim.opp]);
        }
      }
    }

    function joinLate() {
      const camps = sidesRef.current.camps;
      camps.forEach((c, slot) => {
        if (F.some((f) => !f.def && f.faction === c.faction)) return;
        const n = Math.min(MAX - F.length, Math.max(1, c.troops));
        if (n <= 0) return;
        const spots = camp(n, c.angle);
        const col = new THREE.Color(kingdomGlow(c.faction));
        for (let i = 0; i < n; i++) {
          const f = mk(c.faction, false, slot, spots[i].x, spots[i].z, spots[i].face);
          f.home = [HOMES[F.length].x, HOMES[F.length].z];
          body.current?.setColorAt(F.length, col);
          F.push(f);
        }
        sim.startAtt += n;
        if (body.current?.instanceColor) body.current.instanceColor.needsUpdate = true;
      });
    }
    function kill(v: Fighter, by: Fighter | null) {
      v.alive = false;
      v.dead = 0;
      v.fallDir = by ? Math.atan2(v.pos.x - by.pos.x, v.pos.z - by.pos.z) : v.face + Math.PI;
      if (by) by.strike = 0.25;
      burst(v.pos, 7);
      if (now - sim.soundAt > 0.35) {
        sim.soundAt = now;
        play('clash');
      }
    }
    function burst(p: THREE.Vector3, n: number) {
      for (let k = 0; k < n; k++) {
        const s = sim.sparks[sim.nextSpark++ % SPARKS];
        s.t = 0;
        s.p.set(p.x, p.y + 0.2, p.z);
        s.v.set((Math.random() - 0.5) * 2.4, 1 + Math.random() * 1.6, (Math.random() - 0.5) * 2.4);
      }
    }

    // --- movement + pose ---------------------------------------------------------------------
    const meshes = { body: body.current, gear: gear.current, arm: arm.current };
    crowd?.begin();
    const nCamps = Math.max(sidesRef.current.camps.length, 1);
    for (let i = 0; i < F.length; i++) {
      const f = F[i];
      let armA = ARM_REST;
      let tilt = 0;
      let bob = 0;
      if (!f.alive) {
        f.dead += d;
        const k = Math.min(1, f.dead / 0.45);
        tilt = -1.5 * k * k;
        if (crowd) crowd.set(i, f.pos.x, f.pos.y, f.pos.z, f.fallDir + Math.PI, 'dead', kingdomGlow(f.faction));
        else writeSoldier(meshes, i, f.pos.x, f.pos.y - 0.02 * k, f.pos.z, f.fallDir + Math.PI, tilt, 1, ARM_REST - 0.6 * k);
        continue;
      }
      // where to go
      let tx = f.pos.x;
      let tz = f.pos.z;
      let faceTo: number | null = null;
      let duel = false;
      let cheer = false;
      const o = f.opp >= 0 ? F[f.opp] : null;
      if (!fighting) {
        // MUSTER: form the lines
        if (f.def) {
          const k = i;
          tx = ((k % 8) - 3.5) * 0.3;
          tz = DEF_LINE + Math.floor(k / 8) * 0.28;
          faceTo = 0;
        } else {
          const perRow = 5;
          const at = sidesRef.current.camps.findIndex((c) => c.faction === f.faction);
          if (at >= 0) f.slot = at;
          const idx = F.filter((g, j) => j < i && !g.def && g.faction === f.faction).length;
          tx = (f.slot - (nCamps - 1) / 2) * 1.5 + ((idx % perRow) - 2) * 0.28;
          tz = ATT_LINE + Math.floor(idx / perRow) * 0.3;
          faceTo = Math.PI;
        }
      } else if (o && o.alive) {
        const dx = o.pos.x - f.pos.x;
        const dz = o.pos.z - f.pos.z;
        const dist = Math.hypot(dx, dz) || 1;
        tx = o.pos.x - (dx / dist) * DUEL_DIST;
        tz = o.pos.z - (dz / dist) * DUEL_DIST;
        faceTo = Math.atan2(dx, dz);
        duel = dist < DUEL_DIST + 0.12;
      } else if (result && wins(f)) {
        cheer = true;
        if (phase === 'FALLEN' && !f.def) {
          // storm the gate, then take the courtyard
          if (f.gateStage === 0) {
            tx = Math.max(-0.2, Math.min(0.2, f.pos.x));
            tz = GATE_Z + 0.45;
            if (Math.hypot(tx - f.pos.x, tz - f.pos.z) < 0.15) f.gateStage = 1;
          } else if (f.gateStage === 1) {
            tx = Math.max(-0.2, Math.min(0.2, f.pos.x));
            tz = GATE_Z - 0.6;
            if (Math.hypot(tx - f.pos.x, tz - f.pos.z) < 0.15) f.gateStage = 2;
          } else {
            [tx, tz] = f.home;
          }
          cheer = f.gateStage === 2;
        }
      } else if (fighting && !f.def && aliveDef === 0) {
        // nobody home: hack at the gate
        tx = ((i % 5) - 2) * 0.13;
        tz = GATE_Z + 0.35 + Math.floor((i % 15) / 5) * 0.2;
        faceTo = Math.PI;
        duel = Math.hypot(tx - f.pos.x, tz - f.pos.z) < 0.1;
      }

      // defenders hold the field in front of the gate (the cinematic camera frames it)
      if (f.def && fighting && f.gateStage > 0 && !cheer) {
        tx = Math.max(-1.6, Math.min(1.6, tx));
        tz = Math.max(GATE_Z + 0.7, Math.min(GATE_Z + 3.0, tz));
      }
      // steering: attackers far round the island walk the outer ring towards the gate side
      const r = Math.hypot(f.pos.x, f.pos.z);
      const ang = Math.atan2(f.pos.z, f.pos.x);
      if (!f.def && f.gateStage === 0 && r > WALL_RADIUS + 1 && angleDist(ang, GATE_ANGLE) > 0.75) {
        const dir = Math.sin(GATE_ANGLE - ang) >= 0 ? 1 : -1;
        const [wx, wz] = polar(Math.max(4.6, Math.min(r, 5.3)), ang + dir * 0.55);
        tx = wx;
        tz = wz;
        faceTo = null;
      }
      // defenders leave through the gate
      if (f.def && f.gateStage === 0) {
        if (r < WALL_RADIUS + 0.15 && f.pos.z < GATE_Z + 0.2) {
          if (Math.abs(f.pos.x) > 0.22 || f.pos.z < GATE_Z - 0.5) {
            tx = Math.max(-0.18, Math.min(0.18, f.pos.x * 0.5));
            tz = Math.max(f.pos.z + 0.4, GATE_Z - 0.45);
          } else {
            tz = GATE_Z + 0.5;
          }
          faceTo = null;
        } else f.gateStage = 1;
      }

      const dx = tx - f.pos.x;
      const dz = tz - f.pos.z;
      const dist = Math.hypot(dx, dz);
      const speed = dist > 2 ? 2.8 : 1.5;
      const moving = dist > 0.03;
      if (moving) {
        const step = Math.min(dist, speed * d);
        f.pos.x += (dx / dist) * step;
        f.pos.z += (dz / dist) * step;
      }
      // separation (keep the crowd from stacking)
      for (let j = 0; j < F.length; j++) {
        if (j === i || !F[j].alive) continue;
        const ex = f.pos.x - F[j].pos.x;
        const ez = f.pos.z - F[j].pos.z;
        const e2 = ex * ex + ez * ez;
        if (e2 < 0.04 && e2 > 1e-6) {
          const e = Math.sqrt(e2);
          f.pos.x += (ex / e) * (0.2 - e) * 0.5;
          f.pos.z += (ez / e) * (0.2 - e) * 0.5;
        }
      }
      f.pos.y += (groundY(layout, f.pos.x, f.pos.z) - f.pos.y) * Math.min(1, d * 12);
      const want = faceTo ?? (moving ? Math.atan2(dx, dz) : f.face);
      const df = Math.atan2(Math.sin(want - f.face), Math.cos(want - f.face));
      f.face += df * Math.min(1, d * 10);

      if (f.strike > 0) {
        f.strike -= d;
        armA = f.strike > 0.12 ? ARM_RAISED : ARM_STRIKE;
      } else if (duel) {
        f.swingT += d * (1.2 + (i % 3) * 0.15);
        armA = swing(f.swingT);
        // clash of blades at the strike moment
        const ph = f.swingT - Math.floor(f.swingT);
        if (ph > 0.45 && ph < 0.45 + d * 1.4 && Math.random() < 0.35) burst(f.pos, 2);
      } else if (cheer) {
        armA = -2.9 + Math.sin(now * 8 + i) * 0.25;
        bob = Math.abs(Math.sin(now * 7 + i * 0.7)) * 0.1;
      } else if (moving) {
        armA = ARM_REST + Math.sin(now * 12 + i) * 0.3;
        bob = Math.abs(Math.sin(now * 12 + i)) * 0.03;
      }
      if (duel) tilt = 0.1;
      if (crowd) {
        const ws: WarriorState =
          f.strike > 0
            ? 'attack'
            : duel
              ? Math.floor(f.swingT) % 3 === 2
                ? 'block'
                : 'attack'
              : cheer
                ? 'cheer'
                : moving
                  ? speed > 2
                    ? 'run'
                    : 'walk'
                  : 'idle';
        crowd.set(i, f.pos.x, f.pos.y, f.pos.z, f.face, ws, kingdomGlow(f.faction));
      } else {
        writeSoldier(meshes, i, f.pos.x, f.pos.y + bob, f.pos.z, f.face, tilt, 1, armA);
      }
    }
    if (crowd) crowd.end(d);
    else commitSoldiers(meshes, F.length);

    // --- sparks ------------------------------------------------------------------------------
    const sp = sparks.current;
    if (sp) {
      const o = new THREE.Object3D();
      sim.sparks.forEach((s, k) => {
        if (s.t < 1) {
          s.t += d * 2.6;
          s.v.y -= d * 6;
          s.p.addScaledVector(s.v, d);
        }
        o.position.copy(s.p);
        o.scale.setScalar(s.t < 1 ? 0.02 * (1 - s.t) + 0.005 : 0.0001);
        o.updateMatrix();
        sp.setMatrixAt(k, o.matrix);
      });
      sp.instanceMatrix.needsUpdate = true;
    }

    // --- head count --------------------------------------------------------------------------
    if (label.current && now - sim.labelAt > 0.2) {
      sim.labelAt = now;
      const byFaction = new Map<number, number>();
      F.forEach((f) => f.alive && byFaction.set(f.faction, (byFaction.get(f.faction) ?? 0) + 1));
      const parts = [sides.defender, ...new Set(F.filter((f) => !f.def).map((f) => f.faction))].map(
        (fa) => `<span style="color:${kingdomGlow(fa)}">${KINGDOMS[fa].short} ${byFaction.get(fa) ?? 0}</span>`,
      );
      label.current.innerHTML = `⚔ ${parts.join(' · ')}`;
    }
  });

  return (
    <group>
      {crowd ? (
        <primitive object={crowd.group} />
      ) : (
        <>
          <instancedMesh ref={body} args={[BODY_GEO, BODY_WHITE, MAX]} castShadow frustumCulled={false} />
          <instancedMesh ref={gear} args={[GEAR_GEO, GEAR_MAT, MAX]} castShadow frustumCulled={false} />
          <instancedMesh ref={arm} args={[ARM_GEO, GEAR_MAT, MAX]} castShadow frustumCulled={false} />
        </>
      )}
      <instancedMesh ref={sparks} args={[SPARK_GEO, SPARK_MAT, SPARKS]} frustumCulled={false} />
      <Html position={[0, 1.5, FIELD_Z + 0.6]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={label} className="whitespace-nowrap bg-black/70 px-2 py-0.5 text-[12px] tabular-nums border border-border-tertiary" />
      </Html>
    </group>
  );
}

const SPARK_GEO = new THREE.OctahedronGeometry(1, 0);
/** Courtyard spots for conquerors, by fighter index. */
const HOMES = courtyard(MAX);
const SPARK_MAT = new THREE.MeshBasicMaterial({ color: '#ffd38a', toneMapped: false });

function mk(faction: number, def: boolean, slot: number, x: number, z: number, face: number): Fighter {
  return {
    faction,
    def,
    slot,
    pos: new THREE.Vector3(x, def ? 0.36 : 0.2, z),
    face,
    alive: true,
    dead: 0,
    fallDir: 0,
    opp: -1,
    swingT: Math.random(),
    strike: 0,
    home: [0, 0],
    gateStage: 0,
  };
}

