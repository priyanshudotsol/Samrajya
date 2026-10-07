'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { mulberry32, type RealmLayout } from '@/lib/realm/layout';

import { MAT, usePaint } from './paint';

const dummy = new THREE.Object3D();
const WING_GEO = (() => {
  const g = new THREE.BufferGeometry();
  // two wings in a shallow V, beak towards +z
  const v = new Float32Array([0, 0, 0.06, -0.16, 0.02, -0.02, 0, 0, -0.04, 0, 0, 0.06, 0, 0, -0.04, 0.16, 0.02, -0.02]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();
const BIRD_MAT = new THREE.MeshBasicMaterial({ color: '#2a2420', side: THREE.DoubleSide });
const BIRDS = 12;

/** A flock circling high over the realm, wings flapping. */
export function Birds({ seed }: { seed: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const birds = useMemo(() => {
    const rand = mulberry32(seed + 31);
    return Array.from({ length: BIRDS }, () => ({ r: 5 + rand() * 4, h: 3.2 + rand() * 1.8, ph: rand() * Math.PI * 2, sp: 0.18 + rand() * 0.08, fl: 8 + rand() * 4 }));
  }, [seed]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    birds.forEach((b, i) => {
      const a = b.ph + t * b.sp;
      dummy.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 0.7 + i) * 0.25, Math.sin(a) * b.r);
      // heading along the circle (counter-clockwise seen from above)
      dummy.rotation.set(0, -a, Math.sin(t * 0.5 + i) * 0.2);
      const flap = Math.sin(t * b.fl + i);
      dummy.scale.set(1, 1 + flap * 3, 1);
      dummy.position.y += flap * 0.02;
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[WING_GEO, BIRD_MAT, BIRDS]} frustumCulled={false} />;
}

/** Little boats drifting round the realm's water tiles, sails in the owner's colour. */
export function Boats({ layout }: { layout: RealmLayout }) {
  const paint = usePaint();
  const spots = useMemo(() => layout.tiles.filter((t) => t.kind === 'water').slice(0, 6), [layout]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    spots.forEach((w, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = t * 0.35 + i * 1.7;
      g.position.set(w.x + Math.cos(a) * 0.35, w.h + 0.02 + Math.sin(t * 1.6 + i) * 0.015, w.z + Math.sin(a) * 0.35);
      g.rotation.set(0, -a, Math.sin(t * 1.2 + i) * 0.08);
    });
  });
  return (
    <group>
      {spots.map((w, i) => (
        <group key={`${w.q},${w.r}`} ref={(el) => void (refs.current[i] = el)}>
          <mesh material={MAT.wood} position={[0, 0.03, 0]} castShadow>
            <boxGeometry args={[0.1, 0.05, 0.28]} />
          </mesh>
          <mesh material={MAT.wood} position={[0, 0.16, 0]}>
            <cylinderGeometry args={[0.006, 0.008, 0.24, 4]} />
          </mesh>
          <mesh material={paint.roof} position={[0, 0.17, 0.005]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[0.16, 0.16, 0.006]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
