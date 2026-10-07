'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { play } from '@/lib/audio';
import { GATE_Z, wallPoint } from '@/lib/arena/formations';

import { shake } from '../realm/skyState';

const STONES = 14;
const ARROWS = 28;
const PUFFS = 14;
const dummy = new THREE.Object3D();
const STONE_GEO = new THREE.DodecahedronGeometry(0.07, 0);
const ARROW_GEO = new THREE.BoxGeometry(0.012, 0.012, 0.22);
const PUFF_GEO = new THREE.IcosahedronGeometry(0.18, 0);
const STONE_MAT = new THREE.MeshStandardMaterial({ color: '#6a6058', flatShading: true });
const ARROW_MAT = new THREE.MeshBasicMaterial({ color: '#2a1d14' });
const PUFF_MAT = new THREE.MeshStandardMaterial({ color: '#cbb89a', transparent: true, opacity: 0.6, depthWrite: false });

interface Flight {
  active: boolean;
  t: number;
  dur: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  arc: number;
}
const mkPool = (n: number): Flight[] =>
  Array.from({ length: n }, () => ({ active: false, t: 0, dur: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), arc: 1 }));

/** Catapult stones (parabolas, camp → wall) and arrow volleys (wall → assault), instanced. */
export function Projectiles({ sources, wallTop }: { sources: [number, number][]; wallTop: number }) {
  const stones = useRef<THREE.InstancedMesh>(null);
  const arrows = useRef<THREE.InstancedMesh>(null);
  const puffs = useRef<THREE.InstancedMesh>(null);
  const pools = useMemo(
    () => ({
      stones: mkPool(STONES),
      arrows: mkPool(ARROWS),
      puffs: Array.from({ length: PUFFS }, () => ({ t: 1, pos: new THREE.Vector3() })),
      nextStone: 0,
      nextArrow: 0,
      nextPuff: 0,
      soundAt: 0,
    }),
    [],
  );
  const prev = useMemo(() => new THREE.Vector3(), []);
  const cur = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    const now = state.clock.elapsedTime;
    // spawn
    if (sources.length && Math.random() < d * 2.2) {
      const f = pools.stones.find((s) => !s.active);
      if (f) {
        const [sx, sz] = sources[Math.floor(Math.random() * sources.length)];
        const a = Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const [wx, wz] = wallPoint(a);
        f.active = true;
        f.t = 0;
        f.dur = 1.1 + Math.random() * 0.4;
        f.from.set(sx, 0.4, sz);
        f.to.set(wx, wallTop, wz);
        f.arc = 2.2 + Math.random();
      }
    }
    if (Math.random() < d * 9) {
      const f = pools.arrows.find((s) => !s.active);
      if (f) {
        const a = Math.PI / 2 + (Math.random() - 0.5) * 1.4;
        const [wx, wz] = wallPoint(a);
        f.active = true;
        f.t = 0;
        f.dur = 0.6 + Math.random() * 0.3;
        f.from.set(wx, wallTop + 0.15, wz);
        f.to.set((Math.random() - 0.5) * 3, 0.3, GATE_Z + 1.2 + Math.random() * 1.5);
        f.arc = 0.8;
      }
    }

    const step = (pool: Flight[], mesh: THREE.InstancedMesh | null, onLand?: (p: THREE.Vector3) => void, orient = false) => {
      if (!mesh) return;
      pool.forEach((f, i) => {
        if (!f.active) {
          dummy.scale.setScalar(0.0001);
          dummy.position.set(0, -50, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          return;
        }
        const t0 = f.t / f.dur;
        f.t += d;
        const t = Math.min(1, f.t / f.dur);
        prev.lerpVectors(f.from, f.to, t0);
        prev.y += Math.sin(t0 * Math.PI) * f.arc;
        cur.lerpVectors(f.from, f.to, t);
        cur.y += Math.sin(t * Math.PI) * f.arc;
        dummy.position.copy(cur);
        dummy.scale.setScalar(1);
        if (orient) dummy.lookAt(cur.clone().add(cur.clone().sub(prev)));
        else dummy.rotation.set(now * 5 + i, now * 3, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (t >= 1) {
          f.active = false;
          onLand?.(f.to);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    };

    step(pools.stones, stones.current, (p) => {
      shake.value = Math.min(1.2, shake.value + 0.45);
      const puff = pools.puffs[pools.nextPuff++ % PUFFS];
      puff.t = 0;
      puff.pos.copy(p);
      if (now - pools.soundAt > 0.6) {
        pools.soundAt = now;
        play(Math.random() < 0.5 ? 'catapult' : 'clash');
      }
    });
    step(pools.arrows, arrows.current, undefined, true);

    if (puffs.current) {
      pools.puffs.forEach((p, i) => {
        p.t = Math.min(1, p.t + d * 1.4);
        const s = p.t >= 1 ? 0.0001 : 0.4 + p.t * 1.4;
        dummy.position.copy(p.pos);
        dummy.position.y += p.t * 0.4;
        dummy.rotation.set(0, i, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        puffs.current!.setMatrixAt(i, dummy.matrix);
      });
      puffs.current.instanceMatrix.needsUpdate = true;
      PUFF_MAT.opacity = 0.5;
    }
  });

  return (
    <group>
      <instancedMesh ref={stones} args={[STONE_GEO, STONE_MAT, STONES]} frustumCulled={false} castShadow />
      <instancedMesh ref={arrows} args={[ARROW_GEO, ARROW_MAT, ARROWS]} frustumCulled={false} />
      <instancedMesh ref={puffs} args={[PUFF_GEO, PUFF_MAT, PUFFS]} frustumCulled={false} />
    </group>
  );
}
