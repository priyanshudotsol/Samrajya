'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import * as THREE from 'three';

import { applyTriplanar, triplanarMaterial } from '@/lib/realm/textures';

/**
 * Faction paint (docs/KINGDOM_UI.md §5.3 "colour takeover"): every owner-tinted material in the
 * realm reads one damped colour, so FALLEN just retargets it to the conqueror and roofs, banners,
 * tabards and the shield sweep over in ~1.5 s.
 */
export interface Paint {
  current: THREE.Color;
  target: THREE.Color;
  roof: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  tabard: THREE.MeshStandardMaterial;
  /** Shared wave clock for every banner material. */
  time: { value: number };
}

const PaintCtx = createContext<Paint | null>(null);

/** Adds a vertex-shader wave to a cloth material (banners/pennants). Geometry's x ∈ [0, w]. */
export function makeCloth(color: THREE.ColorRepresentation, time: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float wv = sin(position.x * 9.0 - uTime * 6.0 + position.y * 2.0);
         transformed.z += wv * 0.07 * position.x;
         transformed.y -= position.x * position.x * 0.12;`,
      );
  };
  m.customProgramCacheKey = () => 'samrajya-cloth';
  return m;
}

export function PaintProvider({ color, children }: { color: string; children: ReactNode }) {
  const paint = useMemo<Paint>(() => {
    const c = new THREE.Color(color);
    const time = { value: 0 };
    return {
      current: c.clone(),
      target: c.clone(),
      roof: applyTriplanar(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true }), 'plaster', { scale: 1.8, detail: 0.55 }),
      cloth: makeCloth(c, time),
      tabard: new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true }),
      time,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    paint.target.set(color);
  }, [color, paint]);

  useEffect(
    () => () => {
      paint.roof.dispose();
      paint.cloth.dispose();
      paint.tabard.dispose();
    },
    [paint],
  );

  useFrame((_, dt) => {
    paint.time.value += dt;
    easing.dampC(paint.current, paint.target, 0.45, dt);
    paint.roof.color.copy(paint.current);
    paint.cloth.color.copy(paint.current);
    paint.tabard.color.copy(paint.current);
  });

  return <PaintCtx.Provider value={paint}>{children}</PaintCtx.Provider>;
}

export function usePaint(): Paint {
  const p = useContext(PaintCtx);
  if (!p) throw new Error('usePaint outside PaintProvider');
  return p;
}

/** Cached per-colour cloth/tabard materials for other factions (enemy camps, satellites). */
const factionMats = new Map<string, { cloth: THREE.MeshStandardMaterial; tabard: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial }>();
export function factionMaterials(color: string, time: { value: number }) {
  let m = factionMats.get(color);
  if (!m) {
    m = {
      cloth: makeCloth(color, time),
      tabard: new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true }),
      roof: applyTriplanar(new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true }), 'plaster', { scale: 1.8, detail: 0.55 }),
    };
    factionMats.set(color, m);
  }
  return m;
}

/** Shared neutral materials (PBR: Poly Haven textures via a world-space triplanar patch). */
export const MAT = {
  stone: triplanarMaterial('stone', { color: '#d9c7a3', roughness: 0.9, flatShading: true }, { scale: 1.3 }),
  stoneDark: triplanarMaterial('stone', { color: '#a8916b', roughness: 0.95, flatShading: true }, { scale: 1.3 }),
  sandstone: triplanarMaterial('redstone', { color: '#c98f5a', roughness: 0.9, flatShading: true }, { scale: 1.2 }),
  marble: triplanarMaterial('marble', { color: '#f4ecdc', roughness: 0.35 }, { scale: 0.9, detail: 0.6, normal: 0.4 }),
  gold: new THREE.MeshStandardMaterial({ color: '#e7b25a', metalness: 1, roughness: 0.26, emissive: '#3a2408', emissiveIntensity: 0.25 }),
  wood: triplanarMaterial('wood', { color: '#7a4f2a', roughness: 0.9, flatShading: true }, { scale: 2.2, detail: 1 }),
  whitewash: triplanarMaterial('plaster', { color: '#efe3c8', roughness: 0.92 }, { scale: 1.6, detail: 0.7 }),
  canvas: new THREE.MeshStandardMaterial({ color: '#d9cba8', roughness: 1, flatShading: true }),
  ash: triplanarMaterial('cliff', { color: '#4a4440', roughness: 1, flatShading: true }, { scale: 1.2 }),
  fire: new THREE.MeshStandardMaterial({ color: '#ff8a2a', emissive: '#ff5a10', emissiveIntensity: 2.2, toneMapped: false }),
  diya: new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff9a2a', emissiveIntensity: 0, toneMapped: false }),
  dark: new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 1 }),
  elephant: new THREE.MeshStandardMaterial({ color: '#8e8a86', roughness: 0.9, flatShading: true }),
  water: new THREE.MeshStandardMaterial({ color: '#2f9fcf', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }),
  moon: new THREE.MeshStandardMaterial({ color: '#e8ecff', emissive: '#c9d0ff', emissiveIntensity: 1.4, toneMapped: false }),
};
