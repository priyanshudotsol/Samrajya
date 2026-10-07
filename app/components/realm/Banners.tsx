'use client';

import * as THREE from 'three';

import { MAT, usePaint } from './paint';

const CLOTH_GEO = new THREE.PlaneGeometry(1, 0.62, 10, 3).translate(0.5, 0, 0);
const POLE_GEO = new THREE.CylinderGeometry(0.012, 0.016, 1, 5).translate(0, 0.5, 0);

/**
 * A waving banner on a pole. Uses the owner's paint unless `material` is given
 * (enemy camps / marches pass their own faction cloth).
 */
export function Banner({
  position,
  pole = 0.6,
  size = 0.3,
  material,
  rotation = 0,
}: {
  position?: [number, number, number];
  pole?: number;
  size?: number;
  material?: THREE.Material;
  rotation?: number;
}) {
  const paint = usePaint();
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={POLE_GEO} material={MAT.wood} scale={[1, pole, 1]} castShadow />
      <mesh geometry={CLOTH_GEO} material={material ?? paint.cloth} position={[0.01, pole - size * 0.33, 0]} scale={size} castShadow />
      <mesh position={[0, pole + 0.02, 0]} material={MAT.gold}>
        <sphereGeometry args={[0.025, 6, 4]} />
      </mesh>
    </group>
  );
}
