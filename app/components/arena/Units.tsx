'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { Cluster, cameraState } from '@/lib/arena/cameraState';
import { control, drawn, isLocal, localPose } from '@/lib/arena/controller';
import { fx, HIT_FLASH_MS, HIT_SHOW_MS, knockOffset, SWING_SHOW_MS, timeScale } from '@/lib/arena/fx';
import { HEAVY_CHARGE_FULL } from '@/lib/game/combat';
import { playSfx } from '@/lib/audio';
import { kingdomGlow } from '@/lib/game/factions';
import { ACTION, hexDepth, isMarching, marchPose, type Unit, WALL_THICK } from '@/lib/game/units';
import { groundY, type RealmLayout } from '@/lib/realm/layout';
import { useGame } from '@/lib/store/game';

import { useCrowd } from './useCrowd';
import type { WarriorState } from './WarriorCrowd';
import { ARM_GEO, ARM_RAISED, ARM_REST, BODY_GEO, BODY_WHITE, commitSoldiers, GEAR_GEO, GEAR_MAT, swing, writeSoldier } from './soldier';

const MAX = 60;
/** Warriors are drawn larger than life so a fight reads at a glance next to the fort (§10.10). */
const WARRIOR_SCALE = 1.3;
const CHARGE_GEO = new THREE.RingGeometry(0.3, 0.38, 32).rotateX(-Math.PI / 2);
const CHARGE_MAT = new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
/** When each warrior started winding up a heavy blow (performance.now()). */
const chargeFrom = new Map<string, number>();
const RING_GEO = new THREE.RingGeometry(0.17, 0.22, 24).rotateX(-Math.PI / 2);
const RING_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });
const MINE_GEO = new THREE.RingGeometry(0.24, 0.3, 32).rotateX(-Math.PI / 2);
// your ring and the chevron over your head show through walls and towers
const MINE_MAT = new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, toneMapped: false });
const CHEVRON_GEO = new THREE.ConeGeometry(0.07, 0.14, 4).rotateX(Math.PI);
const CHEVRON_MAT = new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, toneMapped: false });
const FOE_GEO = new THREE.RingGeometry(0.26, 0.34, 32).rotateX(-Math.PI / 2);
const TARGET_MAT = new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
const HOVER_MAT = new THREE.MeshBasicMaterial({ color: '#ff8a7a', transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });
const GOAL_GEO = new THREE.RingGeometry(0.1, 0.16, 24).rotateX(-Math.PI / 2);
const GOAL_MAT = new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
const WHITE = new THREE.Color('#ffffff');
const flashCache = new Map<string, string>();
const flash = (k: number) => (c: string) => {
  const key = `${c}:${k}`;
  let v = flashCache.get(key);
  if (!v) {
    v = `#${tmpColor.set(c).lerp(WHITE, k).getHexString()}`;
    flashCache.set(key, v);
  }
  return v;
};
const FLASH_HI = flash(0.8);
const FLASH_LO = flash(0.4);
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

interface Pose {
  x: number;
  y: number;
  z: number;
  face: number;
  scale: number;
  action: number;
  moving: boolean;
  swingT: number;
  seen: number;
}

/**
 * Animation state: swings and flinches come from combat events (one blow per strike, also for
 * other players), guard / walk / run from the unit's action.
 */
const stateOf = (action: number, moving: boolean, swinging: boolean, flinching: boolean): WarriorState => {
  if (action === ACTION.DEAD) return 'dead';
  if (swinging) return 'attack';
  if (action === ACTION.DODGE) return 'dodge';
  if (flinching) return 'hit';
  switch (action) {
    case ACTION.CHARGE:
      return 'charge';
    case ACTION.ATTACK:
      return moving ? 'walk' : 'idle';
    case ACTION.BLOCK:
      return 'block';
    case ACTION.DEAD:
      return 'dead';
    case ACTION.RUN:
      return moving ? 'run' : 'idle';
    case ACTION.CLIMB:
    case ACTION.WALK:
      return moving ? 'walk' : 'idle';
    default:
      return moving ? 'walk' : 'idle';
  }
};

/** Which way a remote warrior rolls, from how it moves relative to where it faces. */
function dodgeDir(p: { x: number; z: number }, target: { x: number; z: number }, facing: number): 'F' | 'B' | 'L' | 'R' {
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  if (Math.hypot(dx, dz) < 0.02) return 'B';
  const a = Math.atan2(Math.sin(Math.atan2(dx, dz) - facing), Math.cos(Math.atan2(dx, dz) - facing));
  if (Math.abs(a) < Math.PI / 4) return 'F';
  if (Math.abs(a) > (3 * Math.PI) / 4) return 'B';
  return a > 0 ? 'L' : 'R';
}

/** Living units in this realm right now (marchers appear in the realm they are walking through). */
export function unitsIn(units: Unit[], territory: number, now: number): Unit[] {
  return units.filter((u) => u.hp > 0 && marchPose(u, now).at === territory);
}

/** Units drawn in this realm: the living plus the fallen still lying where they dropped. */
function drawnIn(units: Unit[], territory: number, now: number): Unit[] {
  return units.filter((u) => (u.hp > 0 || u.deadUntil > now) && marchPose(u, now).at === territory);
}

/**
 * Every warrior standing in this realm (docs/KINGDOM_UI.md §11.1): the viewer's from the local
 * controller, everyone else interpolated towards the feed. Rings mark factions; labels show
 * name, role, gear and wounds. Also feeds the camera director with the moving group.
 */
export function Units({ territory, layout, wallTop }: { territory: number; layout: RealmLayout; wallTop: number }) {
  const units = useGame((s) => s.units);
  const body = useRef<THREE.InstancedMesh>(null);
  const gear = useRef<THREE.InstancedMesh>(null);
  const arm = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const mine = useRef<THREE.Mesh>(null);
  const chevron = useRef<THREE.Mesh>(null);
  const targetRing = useRef<THREE.Mesh>(null);
  const hoverRing = useRef<THREE.Mesh>(null);
  const goalRing = useRef<THREE.Mesh>(null);
  const charges = useRef<THREE.InstancedMesh>(null);
  const poses = useRef<Map<string, Pose>>(new Map());
  const cluster = useMemo(() => new Cluster(), []);
  const crowd = useCrowd();
  const unitsRef = useRef(units);
  unitsRef.current = units;

  const here = useMemo(() => drawnIn(units, territory, Date.now() / 1000).slice(0, MAX), [units, territory]);

  useLayoutEffect(() => {
    if (!body.current) return;
    here.forEach((u, i) => body.current!.setColorAt(i, tmpColor.set(kingdomGlow(u.faction))));
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true;
  }, [here, crowd]);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    const now = Date.now() / 1000;
    const t = state.clock.elapsedTime;
    const list = drawnIn(unitsRef.current, territory, now).slice(0, MAX);
    const nowMs = performance.now();
    drawn.clear();
    let targetDrawn = false;
    let hoverDrawn = false;
    const meshes = { body: body.current, gear: gear.current, arm: arm.current };
    let nCharges = 0;
    crowd?.begin();
    cluster.reset();
    let mineDrawn = false;

    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      let p = poses.current.get(u.wallet);
      const target = marchPose(u, now);
      if (!p) {
        p = { x: target.x, y: groundY(layout, target.x, target.z), z: target.z, face: target.facing, scale: 0, action: u.action, moving: false, swingT: Math.random(), seen: t };
        poses.current.set(u.wallet, p);
      }
      p.seen = t;
      const local = isLocal(u) && localPose.at === territory;
      let moving: boolean;
      let action: number;
      if (local) {
        p.x = localPose.x;
        p.z = localPose.z;
        p.face = localPose.facing;
        moving = localPose.moving;
        action = localPose.action;
        mineDrawn = true;
      } else {
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        const dist = Math.hypot(dx, dz);
        const marching = isMarching(u, now);
        if (dist > 3 && !marching) {
          // teleport (routed, conquered, arrived)
          p.x = target.x;
          p.z = target.z;
          moving = false;
        } else if (dist > 0.015) {
          const speed = u.action === ACTION.RUN ? 3 : marching ? 2.2 : 1.9;
          const step = Math.min(dist, speed * d);
          p.x += (dx / dist) * step;
          p.z += (dz / dist) * step;
          moving = true;
          const want = Math.atan2(dx, dz);
          const df = Math.atan2(Math.sin(want - p.face), Math.cos(want - p.face));
          p.face += df * Math.min(1, d * 9);
        } else {
          moving = false;
          const df = Math.atan2(Math.sin(target.facing - p.face), Math.cos(target.facing - p.face));
          p.face += df * Math.min(1, d * 6);
        }
        action = u.action;
      }
      // height: ground, or the wall top while climbing through the wall band
      const onWall = action === ACTION.CLIMB && Math.abs(hexDepth(p.x, p.z)) < WALL_THICK / 2 + 0.12;
      const gy = onWall ? wallTop : groundY(layout, p.x, p.z);
      p.y += (gy - p.y) * Math.min(1, d * 10);
      p.scale += (WARRIOR_SCALE - p.scale) * Math.min(1, d * 4);
      // knockback on screen (your own warrior is shoved for real by the controller)
      const kb = local ? { dx: 0, dz: 0 } : knockOffset(u.wallet, nowMs);
      const px = p.x + kb.dx;
      const pz = p.z + kb.dz;
      if (u.hp <= 0) {
        action = ACTION.DEAD;
        moving = false;
      }
      p.moving = moving;
      p.action = action;
      const hitAge = nowMs - (fx.hitAt.get(u.wallet) ?? -1e9);
      const swingAge = nowMs - (fx.swingAt.get(u.wallet) ?? -1e9);
      const swinging = u.hp > 0 && swingAge < SWING_SHOW_MS;
      const flinching = u.hp > 0 && hitAge < HIT_SHOW_MS;
      // a remote swing faces where the blow went
      if (swinging && !local) {
        const df = Math.atan2(Math.sin(u.facing - p.face), Math.cos(u.facing - p.face));
        p.face += df * Math.min(1, d * 18);
      }
      // white flash on a wound (two steps, so the tint cache stays small)
      const color = hitAge < HIT_FLASH_MS ? (hitAge < HIT_FLASH_MS / 2 ? FLASH_HI : FLASH_LO)(kingdomGlow(u.faction)) : kingdomGlow(u.faction);
      if (local && moving) {
        p.swingT += d * (action === ACTION.RUN ? 3.6 : 2.6);
        if (p.swingT >= 1) {
          p.swingT -= 1;
          playSfx('step', { volume: action === ACTION.RUN ? 0.5 : 0.32 });
        }
      }
      drawn.set(u.wallet, { x: px, y: p.y, z: pz, faction: u.faction, alive: u.hp > 0 && !isMarching(u, now) });
      if (u.hp > 0 && u.wallet === control.target && targetRing.current) {
        targetRing.current.position.set(px, p.y + 0.02, pz);
        targetRing.current.scale.setScalar(1 + Math.sin(t * 8) * 0.08);
        targetDrawn = true;
      } else if (u.hp > 0 && u.wallet === control.hover && hoverRing.current) {
        hoverRing.current.position.set(px, p.y + 0.02, pz);
        hoverDrawn = true;
      }
      if (crowd) {
        crowd.set(
          i,
          px,
          p.y,
          pz,
          p.face,
          stateOf(action, moving, swinging, flinching),
          color,
          p.scale,
          0,
          u.gear,
          fx.swingN.get(u.wallet) ?? 0,
          fx.blocked.get(u.wallet) ?? false,
          {
            heavy: fx.heavy.get(u.wallet),
            combo: fx.combo.get(u.wallet),
            frozen: nowMs < (fx.freezeUntil.get(u.wallet) ?? 0),
            dodge: action === ACTION.DODGE ? (local ? localPose.dodge : dodgeDir(p, target, u.facing)) : undefined,
          },
        );
      } else {
        let armA = ARM_REST;
        let bob = 0;
        if (swinging) {
          p.swingT += d * 1.3;
          armA = swing(p.swingT);
        } else if (action === ACTION.BLOCK) armA = ARM_RAISED * 0.5;
        else if (moving) {
          armA = ARM_REST + Math.sin(t * 12 + i) * 0.3;
          bob = Math.abs(Math.sin(t * 12 + i)) * 0.03;
        }
        writeSoldier(meshes, i, px, p.y + bob, pz, p.face, moving ? 0.06 : 0, p.scale, armA);
      }
      // ring
      if (rings.current) {
        dummy.position.set(px, p.y + 0.012, pz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        rings.current.setMatrixAt(i, dummy.matrix);
        rings.current.setColorAt(i, tmpColor.set(color));
      }
      // a heavy wind-up: a burning ring grows under the warrior so everyone sees it coming
      if (action === ACTION.CHARGE && u.hp > 0 && charges.current) {
        const from = chargeFrom.get(u.wallet) ?? nowMs;
        chargeFrom.set(u.wallet, from);
        const k = Math.min(1, (nowMs - from) / (HEAVY_CHARGE_FULL * 1000));
        dummy.position.set(px, p.y + 0.02, pz);
        dummy.rotation.set(0, t * 3, 0);
        dummy.scale.setScalar(0.8 + k * 0.9 + (k >= 1 ? Math.sin(t * 30) * 0.06 : 0));
        dummy.updateMatrix();
        charges.current.setMatrixAt(nCharges++, dummy.matrix);
      } else chargeFrom.delete(u.wallet);
      if (!local) cluster.add(px, p.y, pz, moving);
      if (local && mine.current) {
        mine.current.position.set(p.x, p.y + 0.015, p.z);
        mine.current.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
        if (chevron.current) {
          chevron.current.position.set(p.x, p.y + 0.95 + Math.sin(t * 3) * 0.04, p.z);
          chevron.current.rotation.y = t * 2;
        }
        cameraState.mine.y = p.y;
      }
    }
    if (mine.current) mine.current.visible = mineDrawn;
    if (chevron.current) chevron.current.visible = mineDrawn;
    if (targetRing.current) targetRing.current.visible = targetDrawn;
    if (hoverRing.current) hoverRing.current.visible = hoverDrawn && !targetDrawn;
    if (goalRing.current) {
      const g = control.goal;
      goalRing.current.visible = !!g && mineDrawn;
      if (g) {
        goalRing.current.position.set(g.x, groundY(layout, g.x, g.z) + 0.02, g.z);
        goalRing.current.scale.setScalar(1 + Math.sin(t * 6) * 0.15);
      }
    }
    if (charges.current) {
      charges.current.count = nCharges;
      charges.current.instanceMatrix.needsUpdate = true;
    }
    // slow motion on a kill you were part of
    if (crowd) crowd.end(d * timeScale(nowMs));
    else commitSoldiers(meshes, list.length);
    if (rings.current) {
      rings.current.count = list.length;
      rings.current.instanceMatrix.needsUpdate = true;
      if (rings.current.instanceColor) rings.current.instanceColor.needsUpdate = true;
    }
    cluster.finish(cameraState.group);
    // forget poses of warriors who left this realm
    if (poses.current.size > list.length + 8) {
      for (const [w, p] of poses.current) if (t - p.seen > 5) poses.current.delete(w);
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
      <instancedMesh ref={rings} args={[RING_GEO, RING_MAT, MAX]} frustumCulled={false} />
      <mesh ref={mine} geometry={MINE_GEO} material={MINE_MAT} visible={false} renderOrder={20} />
      <mesh ref={chevron} geometry={CHEVRON_GEO} material={CHEVRON_MAT} visible={false} renderOrder={20} />
      <mesh ref={targetRing} geometry={FOE_GEO} material={TARGET_MAT} visible={false} />
      <mesh ref={hoverRing} geometry={FOE_GEO} material={HOVER_MAT} visible={false} />
      <mesh ref={goalRing} geometry={GOAL_GEO} material={GOAL_MAT} visible={false} />
      <instancedMesh ref={charges} args={[CHARGE_GEO, CHARGE_MAT, MAX]} frustumCulled={false} renderOrder={15} />
    </group>
  );
}
