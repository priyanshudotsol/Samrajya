'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { toast } from 'sonner';

import { useBattle } from '@/lib/arena/battleMachine';
import { addFloater, fx, hitstop, knockback, markSwing, type Floater } from '@/lib/arena/fx';
import { playSfx, setAmbience } from '@/lib/audio';
import { type CombatEvent, GATE_HP, GATE_POINT, weaponOf } from '@/lib/game/combat';
import { kingdomGlow } from '@/lib/game/factions';
import { GEAR, shortWallet } from '@/lib/game/units';
import { groundY, type RealmLayout } from '@/lib/realm/layout';
import { useGame } from '@/lib/store/game';
import type { Rally } from '@/lib/mock/mockGame';

import { shake } from '../realm/skyState';
import { vfx } from './Particles';

interface Arrow {
  mesh: THREE.Mesh;
  trail: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  born: number;
  dur: number;
  live: boolean;
  hit: boolean;
}

interface Sweep {
  mesh: THREE.Mesh;
  born: number;
  delay: number;
  tilt: number;
}

interface Ring {
  mesh: THREE.Mesh;
  born: number;
  dur: number;
  size: number;
}

/** Melee blows land this long after the click (the swing clip's impact frame). */
const IMPACT_MS = 190;
const ARROWS = 14;
const ARROW_GEO = new THREE.CylinderGeometry(0.012, 0.012, 0.34, 4).rotateX(Math.PI / 2);
const ARROW_MAT = new THREE.MeshBasicMaterial({ color: '#2b1d10', toneMapped: false });
const TRAIL_GEO = new THREE.CylinderGeometry(0.004, 0.018, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.5);
const TRAIL_MAT = new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
/** A crescent: thick in the middle of the arc, fading at both ends (vertex alpha via colour). */
function crescent(): THREE.BufferGeometry {
  const seg = 24;
  const g = new THREE.RingGeometry(0.18, 0.7, seg, 1, -1.1, 2.2).rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(-z, x); // -1.1..1.1
    const radial = Math.hypot(x, z);
    const along = 1 - Math.abs(a) / 1.1; // 0 at the ends, 1 in the middle
    const edge = Math.min(1, Math.max(0, (radial - 0.18) / 0.52)); // bright at the outer edge
    const v = Math.pow(along, 1.4) * (0.25 + 0.75 * edge * edge);
    colors.set([v, v, v], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
const SWEEP_GEO = crescent();
const RING_GEO = new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2);

/**
 * Combat feedback in the realm (docs/KINGDOM_UI.md §11.6): every swing animates its warrior and
 * draws a glowing slash; blows land with sparks (blocked / armour), blood and a white flash on the
 * wounded, floating numbers and recorded sounds, timed to the swing's impact frame; arrows fly
 * with a streak and thud; gates splinter and smoke; a Gaja's blow or a broken gate sends a
 * shockwave. The fight's intensity drives war drums and a shouting crowd under the music.
 */
export function CombatFx({ territory, layout }: { territory: number; layout: RealmLayout }) {
  const events = useGame((s) => s.events);
  const wallet = useGame((s) => s.wallet);
  const seen = useRef(0);
  const arrows = useRef<Arrow[]>([]);
  const sweeps = useRef<Sweep[]>([]);
  const rings = useRef<Ring[]>([]);
  const root = useRef<THREE.Group>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Recent combat in this realm (decays), drives the ambience. */
  const heat = useRef(0);
  const smokeAt = useRef(0);

  // pools
  useEffect(() => {
    const g = root.current;
    if (!g) return;
    arrows.current = Array.from({ length: ARROWS }, () => {
      const mesh = new THREE.Mesh(ARROW_GEO, ARROW_MAT);
      const trail = new THREE.Mesh(TRAIL_GEO, TRAIL_MAT);
      mesh.visible = trail.visible = false;
      g.add(mesh, trail);
      return { mesh, trail, from: new THREE.Vector3(), to: new THREE.Vector3(), born: 0, dur: 0.3, live: false, hit: false };
    });
    sweeps.current = Array.from({ length: 12 }, () => {
      const mesh = new THREE.Mesh(
        SWEEP_GEO,
        new THREE.MeshBasicMaterial({ color: '#fff6dc', vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      mesh.visible = false;
      g.add(mesh);
      return { mesh, born: -1e9, delay: 0, tilt: 0 };
    });
    rings.current = Array.from({ length: 6 }, () => {
      const mesh = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      mesh.visible = false;
      g.add(mesh);
      return { mesh, born: -1e9, dur: 0.5, size: 1 };
    });
    const t = timers.current;
    return () => {
      t.forEach(clearTimeout);
      g.clear();
      sweeps.current.forEach((s) => (s.mesh.material as THREE.Material).dispose());
      rings.current.forEach((s) => (s.mesh.material as THREE.Material).dispose());
    };
  }, []);

  useEffect(() => {
    if (!events.length) return;
    if (seen.current === 0) {
      seen.current = events[events.length - 1].id; // skip history
      return;
    }
    const fresh = events.filter((e) => e.id > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1].id;
    const nowMs = performance.now();
    const later = (ms: number, fn: () => void) => {
      const id = setTimeout(fn, ms);
      timers.current.push(id);
      if (timers.current.length > 200) timers.current.splice(0, 100);
    };
    const units = useGame.getState().units;
    for (const e of fresh) {
      if (e.territory !== territory) continue;
      const mine = e.by === wallet || e.target === wallet;
      const y = groundY(layout, e.x, e.z);
      const by = units.find((u) => u.wallet === e.by);
      const at = { x: e.x, z: e.z };
      heat.current = Math.min(1.5, heat.current + (e.kind === 'swing' ? 0.04 : 0.09));
      switch (e.kind) {
        case 'swing': {
          if (e.by !== wallet) markSwing(e.by, { heavy: e.heavy, combo: e.combo }); // yours animated on the click
          const face = by?.facing ?? 0;
          const sw = sweeps.current.reduce((o, s) => (s.born < o.born ? s : o), sweeps.current[0]);
          if (sw) {
            sw.born = nowMs;
            sw.delay = IMPACT_MS * (e.heavy ? 0.9 : 0.45);
            // alternate the arc blow by blow so a combo reads as left, right, overhead
            sw.tilt = e.combo === 2 ? 0.7 : e.combo === 3 ? -1.2 : (Math.random() - 0.5) * 0.9;
            const heavy = e.gear === GEAR.GAJA || !!e.heavy || e.combo === 3;
            sw.mesh.position.set(e.x + Math.sin(face) * 0.12, y + (heavy ? 0.4 : 0.3), e.z + Math.cos(face) * 0.12);
            sw.mesh.rotation.set(sw.tilt, face - Math.PI / 2, 0, 'YXZ');
            sw.mesh.scale.setScalar(heavy ? 1.5 : e.gear === GEAR.BHALA ? 1.25 : 1);
            (sw.mesh.material as THREE.MeshBasicMaterial).color.set(heavy ? '#ffcf8a' : '#fff6dc');
            sw.mesh.visible = true;
          }
          playSfx(e.gear === GEAR.GAJA || e.heavy ? 'heavy' : 'swing', { ...at, volume: mine ? 0.9 : 0.6 });
          break;
        }
        case 'hit':
        case 'block': {
          const blocked = e.kind === 'block';
          const dx = by ? Math.sin(by.facing) : 0;
          const dz = by ? Math.cos(by.facing) : 0;
          const ranged = e.gear === GEAR.DHANUSH;
          const big = !!e.heavy || e.combo === 3 || e.gear === GEAR.GAJA;
          later(ranged ? 0 : e.heavy ? IMPACT_MS * 1.6 : IMPACT_MS, () => {
            if (e.target) {
              fx.hitAt.set(e.target, performance.now());
              fx.blocked.set(e.target, blocked);
              // hitstop: both fighters freeze for a beat that grows with the blow
              hitstop(e.by, e.target, blocked ? 45 : e.heavy ? 150 : e.combo === 3 ? 110 : 70);
              // knockback: the wounded is shoved away from the blow (yours moves for real)
              const knock = e.knock ?? (blocked ? 0.08 : big ? 0.45 : 0.18);
              const fromX = by ? by.x : e.x - dx;
              const fromZ = by ? by.z : e.z - dz;
              if (e.target === wallet) window.dispatchEvent(new CustomEvent('samrajya:knock', { detail: { fromX, fromZ, dist: knock } }));
              else knockback(e.target, e.x, e.z, fromX, fromZ, knock);
              if (mine && big && !blocked) fx.punch = { at: performance.now(), amount: e.heavy ? 1 : 0.6 };
            }
            const hy = y + 0.3;
            if (blocked) {
              vfx.burst('sparks', e.x - dx * 0.12, hy + 0.05, e.z - dz * 0.12, { n: 22, dx: -dx, dz: -dz });
              vfx.burst('flash', e.x - dx * 0.12, hy + 0.05, e.z - dz * 0.12, { scale: 0.8 });
              playSfx('clash', { ...at, volume: mine ? 1 : 0.7 });
            } else {
              vfx.burst('blood', e.x, hy, e.z, { n: big ? 24 : e.damage && e.damage > 15 ? 14 : 9, dx, dz, scale: big ? 1.4 : 1 });
              vfx.burst('sparks', e.x, hy + 0.05, e.z, { n: big ? 16 : 6, dx, dz, scale: big ? 1.1 : 0.7 });
              vfx.burst('flash', e.x, hy, e.z, { scale: big ? 1.2 : 0.6 });
              if (big) {
                vfx.burst('dust', e.x, y + 0.04, e.z, { n: 8, dx, dz });
                ringAt(rings.current, e.x, y, e.z, e.heavy ? 1.1 : 0.7, 0.4);
              }
              playSfx(Math.random() < 0.5 ? 'plate' : 'punch', { ...at, volume: mine ? 1 : 0.7 });
              if (e.target === wallet || Math.random() < 0.45) playSfx('hurt', { ...at, volume: e.target === wallet ? 0.9 : 0.5, delay: 0.04 });
              if (e.gear === GEAR.GAJA) ringAt(rings.current, e.x, y, e.z, 0.9, 0.45);
            }
            addFloater({
              x: e.x,
              y: y + 0.8,
              z: e.z,
              text: blocked ? (e.heavy ? `GUARD BROKEN −${e.damage}` : `${e.damage} blocked`) : e.heavy ? `CRUSH −${e.damage}!` : e.combo === 3 ? `×3 −${e.damage}!` : `−${e.damage}`,
              color: e.target === wallet ? '#ff3b2f' : e.heavy ? '#ff9a3c' : e.by === wallet ? '#ffd36b' : '#ffffff',
              born: performance.now(),
              big: mine || big,
            } satisfies Floater);
            if (e.target === wallet) {
              shake.value = Math.min(1, shake.value + (blocked ? 0.25 : big ? 0.85 : 0.5));
              window.dispatchEvent(new CustomEvent('samrajya:hurt', { detail: { blocked, damage: e.damage ?? 0 } }));
            } else if (e.by === wallet) shake.value = Math.min(1, shake.value + (big ? 0.45 : 0.18));
          });
          break;
        }
        case 'kill': {
          later(IMPACT_MS + 60, () => {
            vfx.burst('blood', e.x, y + 0.3, e.z, { n: 18 });
            later(450, () => {
              vfx.burst('dust', e.x, y + 0.04, e.z, { n: 10, scale: 1.1 });
              playSfx('bodyfall', { ...at, volume: 0.7 });
            });
            playSfx('die', { ...at, volume: mine ? 1 : 0.65 });
            addFloater({ x: e.x, y: y + 1.0, z: e.z, text: e.by === wallet ? 'SLAIN' : '✝', color: kingdomGlow(e.byFaction), born: performance.now(), big: true });
            // a kill you were part of: slow motion and a punch-in
            if (mine) {
              fx.slowUntil = performance.now() + 550;
              fx.punch = { at: performance.now(), amount: 1 };
              shake.value = Math.min(1, shake.value + 0.6);
            }
            if (e.target) hitstop(e.by, e.target, 220);
            if (e.by === wallet && e.target) toast.success(`You ${weaponOf(e.gear).verb} ${shortWallet(e.target)}`);
          });
          break;
        }
        case 'arrow': {
          if (e.by !== wallet) markSwing(e.by);
          const a = arrows.current.find((x) => !x.live);
          if (a && e.x2 !== undefined && e.z2 !== undefined) {
            a.from.set(e.x, y + 0.42, e.z);
            a.to.set(e.x2, groundY(layout, e.x2, e.z2) + 0.3, e.z2);
            a.dur = Math.max(0.12, a.from.distanceTo(a.to) / 13);
            a.born = nowMs + 120; // released on the shot frame
            a.live = true;
            a.hit = false;
          }
          playSfx('bow', { ...at, volume: mine ? 0.9 : 0.6 });
          break;
        }
        case 'gate':
        case 'gate-broken': {
          const broken = e.kind === 'gate-broken';
          later(IMPACT_MS, () => {
            const gy = groundY(layout, GATE_POINT.x, GATE_POINT.z);
            vfx.burst('debris', GATE_POINT.x, gy + 0.35, GATE_POINT.z + 0.1, { n: broken ? 40 : 10, dz: 0.6, scale: broken ? 1.4 : 1 });
            vfx.burst('dust', GATE_POINT.x, gy + 0.1, GATE_POINT.z + 0.15, { n: broken ? 24 : 6, scale: broken ? 1.8 : 1 });
            if (broken) {
              vfx.burst('embers', GATE_POINT.x, gy + 0.3, GATE_POINT.z, { n: 30, scale: 1.5 });
              vfx.burst('flash', GATE_POINT.x, gy + 0.4, GATE_POINT.z, { scale: 2.2 });
              ringAt(rings.current, GATE_POINT.x, gy, GATE_POINT.z, 2.4, 0.8);
              playSfx('gatebreak', { volume: 1 });
              later(500, () => playSfx('warhorn', { volume: 0.8 }));
            } else {
              playSfx('gatehit', { x: GATE_POINT.x, z: GATE_POINT.z, volume: mine ? 1 : 0.7 });
            }
            addFloater({ x: e.x, y: y + 1.0, z: e.z, text: broken ? 'GATE BROKEN' : `gate −${e.damage}`, color: '#ffb347', born: performance.now(), big: broken || mine });
            shake.value = Math.min(1, shake.value + (broken ? 0.9 : mine ? 0.25 : 0.06));
          });
          break;
        }
        case 'respawn':
          if (e.by === wallet) {
            toast('You rise again in this realm');
            playSfx('unsheathe', { volume: 0.8 });
          }
          vfx.burst('dust', e.x, y + 0.05, e.z, { n: 8 });
          break;
      }
    }
  }, [events, territory, wallet, layout]);

  useFrame((st, dt) => {
    const d = Math.min(dt, 0.05);
    const nowMs = performance.now();
    // arrows: arc in, then thud
    for (const a of arrows.current) {
      if (!a.live) continue;
      const k = (nowMs - a.born) / 1000 / a.dur;
      if (k < 0) continue;
      if (k >= 1) {
        a.live = false;
        a.mesh.visible = a.trail.visible = false;
        if (!a.hit) {
          a.hit = true;
          vfx.burst('dust', a.to.x, a.to.y - 0.25, a.to.z, { n: 3, scale: 0.6 });
          playSfx('arrowhit', { x: a.to.x, z: a.to.z, volume: 0.5 });
        }
        continue;
      }
      a.mesh.visible = a.trail.visible = true;
      a.mesh.position.lerpVectors(a.from, a.to, k);
      a.mesh.position.y += Math.sin(k * Math.PI) * 0.22;
      a.mesh.lookAt(a.to.x, a.to.y + Math.cos(k * Math.PI) * 0.22, a.to.z);
      a.trail.position.copy(a.mesh.position);
      a.trail.quaternion.copy(a.mesh.quaternion);
      a.trail.scale.set(1, 1, Math.min(0.9, k * 3));
    }
    // slash crescents: sweep through the arc, flare, fade
    for (const s of sweeps.current) {
      const t = nowMs - s.born - s.delay;
      if (t < 0) {
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        continue;
      }
      const k = t / 240;
      if (k >= 1) {
        s.mesh.visible = false;
        continue;
      }
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75) * 0.95;
      s.mesh.rotation.z = (k - 0.5) * 0.6;
    }
    // shockwave rings
    for (const r of rings.current) {
      const k = (nowMs - r.born) / 1000 / r.dur;
      if (k >= 1 || k < 0) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.visible = true;
      r.mesh.scale.setScalar(0.2 + k * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
    }
    // a battered gate smokes; a broken one burns
    const gate = useGame.getState().gates[territory] ?? GATE_HP;
    if (gate < GATE_HP && nowMs > smokeAt.current) {
      const gy = groundY(layout, GATE_POINT.x, GATE_POINT.z);
      const broken = gate <= 0;
      smokeAt.current = nowMs + (broken ? 160 : gate < GATE_HP / 2 ? 450 : 900);
      vfx.burst('smoke', GATE_POINT.x + (Math.random() - 0.5) * 0.5, gy + 0.5, GATE_POINT.z, { n: broken ? 3 : 1, scale: broken ? 1.4 : 1 });
      if (broken || gate < GATE_HP / 3) vfx.burst('embers', GATE_POINT.x, gy + 0.2, GATE_POINT.z, { n: broken ? 4 : 1 });
    }
    // ambience: drums + crowd follow the heat of the fight (and the bell)
    heat.current = Math.max(0, heat.current - d * 0.12);
    const phase = useBattle.getState().phase;
    const bell = phase === 'CLASH' || phase === 'ROLL' ? 0.6 : phase === 'MUSTER' ? 0.35 : 0;
    const h = Math.max(heat.current, bell);
    setAmbience('drums', Math.min(0.55, h * 0.6));
    setAmbience('crowd', Math.min(0.5, Math.max(0, h - 0.08) * 0.55));
    void st;
  });

  useEffect(
    () => () => {
      setAmbience('drums', 0);
      setAmbience('crowd', 0);
    },
    [],
  );

  return <group ref={root} />;
}

function ringAt(rings: Ring[], x: number, y: number, z: number, size: number, dur: number) {
  const r = rings.reduce((o, s) => (s.born < o.born ? s : o), rings[0]);
  if (!r) return;
  r.born = performance.now();
  r.size = size;
  r.dur = dur;
  r.mesh.position.set(x, y + 0.03, z);
}

const BEACON_GEO = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8, 1, true);

/** Rally pings of the viewer's kingdom in this realm: a light pillar and a flag where to gather. */
export function Rallies({ territory, layout }: { territory: number; layout: RealmLayout }) {
  const rallies = useGame((s) => s.rallies);
  const me = useGame((s) => s.me);
  const faction = me && me.status === 'Active' ? me.faction : null;
  const mine = rallies.filter((r: Rally) => r.faction === faction && r.territory === territory && r.until > Date.now() / 1000);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((st) => {
    refs.current.forEach((m, i) => {
      if (!m) return;
      (m.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(st.clock.elapsedTime * 4 + i) * 0.15;
    });
  });
  if (faction === null) return null;
  return (
    <group>
      {mine.map((r, i) => {
        const y = groundY(layout, r.x, r.z);
        const color = kingdomGlow(r.faction);
        return (
          <group key={`${r.by}:${r.until}`} position={[r.x, y, r.z]}>
            <mesh
              ref={(m) => {
                refs.current[i] = m;
              }}
              geometry={BEACON_GEO}
              position={[0, 1.3, 0]}
            >
              <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <ringGeometry args={[0.35, 0.45, 32]} />
              <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export type { CombatEvent };
