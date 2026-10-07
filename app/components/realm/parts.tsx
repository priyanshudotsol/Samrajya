'use client';

import * as THREE from 'three';

import { MAT } from './paint';

/** Shared low-poly parts used by keeps, towers and landmarks. */
export const lathe = (pts: number[][], segs = 18) =>
  new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    segs,
  );

/** Onion dome profile. */
export const ONION_GEO = lathe([
  [0, 0],
  [0.28, 0],
  [0.35, 0.1],
  [0.38, 0.22],
  [0.33, 0.36],
  [0.2, 0.5],
  [0.08, 0.6],
  [0.02, 0.68],
  [0, 0.72],
]);
/** Odisha rekha deula: square plan, curving in towards the top (height 1.5, base r 0.42). */
export const DEULA_GEO = lathe(
  [
    [0, 0],
    [0.42, 0],
    [0.42, 0.3],
    [0.41, 0.6],
    [0.38, 0.9],
    [0.32, 1.15],
    [0.24, 1.35],
    [0.14, 1.48],
    [0, 1.5],
  ],
  8,
).rotateY(Math.PI / 8);
/** Nagara shikhara: taller and slimmer than the deula (height 2, base r 0.4). */
export const SHIKHARA_GEO = lathe(
  [
    [0, 0],
    [0.4, 0],
    [0.4, 0.25],
    [0.38, 0.7],
    [0.33, 1.1],
    [0.25, 1.5],
    [0.14, 1.85],
    [0, 2],
  ],
  12,
);
export const FINIAL_GEO = new THREE.ConeGeometry(0.03, 0.22, 6);
export const PILLAR_GEO = new THREE.CylinderGeometry(0.018, 0.018, 1, 5).translate(0, 0.5, 0);
export const HALF_DOME = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
export const UNIT_CYL = new THREE.CylinderGeometry(1, 1.08, 1, 10).translate(0, 0.5, 0);
export const UNIT_CONE4 = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
export const UNIT_CONE = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0);
/** Half cylinder lying along x (barrel vault / shala roof), flat side down. */
export const BARREL_GEO = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
export const AMALAKA_GEO = new THREE.CylinderGeometry(1, 1, 1, 14);
export const SPHERE = new THREE.SphereGeometry(1, 8, 6);

/** Chhatri: four pillars, a slab and a small dome. `s` = overall size. */
export function Chhatri({
  s = 1,
  position,
  slab = MAT.sandstone,
  dome = MAT.marble,
}: {
  s?: number;
  position?: [number, number, number];
  slab?: THREE.Material;
  dome?: THREE.Material;
}) {
  const r = 0.14 * s;
  return (
    <group position={position}>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh
            key={i}
            geometry={PILLAR_GEO}
            material={dome}
            position={[Math.cos(a) * r, 0, Math.sin(a) * r]}
            scale={[s, 0.22 * s, s]}
          />
        );
      })}
      <mesh geometry={BOX} material={slab} position={[0, 0.23 * s, 0]} scale={[0.36 * s, 0.035 * s, 0.36 * s]} />
      <mesh geometry={HALF_DOME} material={dome} position={[0, 0.245 * s, 0]} scale={0.15 * s} castShadow />
      <mesh geometry={FINIAL_GEO} material={MAT.gold} position={[0, 0.43 * s, 0]} scale={s} />
    </group>
  );
}
