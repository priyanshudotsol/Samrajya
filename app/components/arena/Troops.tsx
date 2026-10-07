'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import * as THREE from 'three';

import type { Target } from '@/lib/arena/formations';

import { materialHex, useCrowd } from './useCrowd';
import type { WarriorState } from './WarriorCrowd';
import { ARM_GEO, ARM_REST, BODY_GEO, commitSoldiers, GEAR_GEO, GEAR_MAT, swing, writeSoldier, type SoldierMeshes } from './soldier';

export const MAX_TROOPS = 60;

/**
 * An instanced crowd of low-poly swordsmen (KINGDOM_UI §5.2). Each instance damps towards its
 * formation target, so swapping `targets` makes them walk there on their own. Targets may be
 * mutated in place every frame (patrols); `act: 1` makes a soldier swing its sword (sparring).
 */
export function Troops({
  targets,
  material,
  cheer = false,
  smooth = 0.7,
  maxSpeed = 1.8,
  spawn,
}: {
  targets: Target[];
  material: THREE.Material;
  cheer?: boolean;
  smooth?: number;
  maxSpeed?: number;
  /** Where new soldiers appear (default: at their target). */
  spawn?: [number, number, number];
}) {
  const body = useRef<THREE.InstancedMesh>(null);
  const gear = useRef<THREE.InstancedMesh>(null);
  const arm = useRef<THREE.InstancedMesh>(null);
  const state = useMemo(
    () => ({
      pos: Array.from({ length: MAX_TROOPS }, () => new THREE.Vector3()),
      face: new Float32Array(MAX_TROOPS),
      scale: new Float32Array(MAX_TROOPS),
      live: 0,
    }),
    [],
  );
  const crowd = useCrowd();
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  useEffect(() => {
    const n = Math.min(targets.length, MAX_TROOPS);
    for (let i = state.live; i < n; i++) {
      const t = targets[i];
      if (spawn) state.pos[i].set(spawn[0], spawn[1], spawn[2]);
      else state.pos[i].set(t.x, t.y, t.z);
      state.face[i] = t.face;
      state.scale[i] = 0;
    }
    state.live = Math.max(state.live, n);
  }, [targets, spawn, state]);

  useFrame((s, dt) => {
    const meshes: SoldierMeshes = { body: body.current, gear: gear.current, arm: arm.current };
    if (!meshes.body && !crowd) return;
    crowd?.begin();
    const hex = crowd ? materialHex(material) : '';
    const tg = targetsRef.current;
    const n = Math.min(state.live, MAX_TROOPS);
    const time = s.clock.elapsedTime;
    const d = Math.min(dt, 0.1);
    for (let i = 0; i < n; i++) {
      const t = tg[i];
      const p = state.pos[i];
      const tx = t ? t.x : p.x;
      const ty = t ? t.y : p.y;
      const tz = t ? t.z : p.z;
      const dx = tx - p.x;
      const dz = tz - p.z;
      // hidden soldiers jump straight to their target (looping marches respawn at the start)
      if (t && t.scale === 0 && state.scale[i] < 0.05) p.set(tx, ty, tz);
      const moving = dx * dx + dz * dz > 0.004 || t?.act === 2;
      easing.damp3(p, [tx, ty, tz], smooth, d, maxSpeed);
      const wantFace = moving && t?.act !== 2 ? Math.atan2(dx, dz) : t ? t.face : state.face[i];
      const obj = { a: state.face[i] };
      easing.dampAngle(obj, 'a', wantFace, 0.2, d);
      state.face[i] = obj.a;
      const sTarget = t ? t.scale : 0;
      state.scale[i] += (sTarget - state.scale[i]) * Math.min(1, d * 3);
      const sparring = !moving && t?.act === 1;
      const bob = moving
        ? Math.abs(Math.sin(time * 11 + i)) * 0.035
        : cheer
          ? Math.abs(Math.sin(time * 7 + i * 0.7)) * 0.12
          : Math.sin(time * 1.5 + i) * 0.004;
      const armAngle = sparring
        ? swing(time * 0.9 + (i % 2) * 0.5)
        : cheer
          ? -2.9 + Math.sin(time * 7 + i) * 0.2
          : moving
            ? ARM_REST + Math.sin(time * 11 + i) * 0.25
            : ARM_REST;
      if (crowd) {
        const ws: WarriorState = sparring ? (i % 3 === 2 ? 'block' : 'attack') : cheer ? 'cheer' : moving ? (maxSpeed > 2.5 ? 'run' : 'walk') : 'idle';
        crowd.set(i, p.x, p.y, p.z, state.face[i], ws, hex, state.scale[i]);
      } else {
        writeSoldier(meshes, i, p.x, p.y + bob, p.z, state.face[i], moving ? 0.08 : 0, state.scale[i], armAngle);
      }
    }
    if (crowd) crowd.end(d);
    else commitSoldiers(meshes, n);
  });

  if (crowd) return <primitive object={crowd.group} />;
  return (
    <group>
      <instancedMesh ref={body} args={[BODY_GEO, material, MAX_TROOPS]} castShadow frustumCulled={false} />
      <instancedMesh ref={gear} args={[GEAR_GEO, GEAR_MAT, MAX_TROOPS]} castShadow frustumCulled={false} />
      <instancedMesh ref={arm} args={[ARM_GEO, GEAR_MAT, MAX_TROOPS]} castShadow frustumCulled={false} />
    </group>
  );
}
