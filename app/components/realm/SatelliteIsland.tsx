'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { KINGDOMS } from '@/lib/game/factions';
import { BIOMES } from '@/lib/realm/layout';
import { buildTerrain, miniTerrainSpec } from '@/lib/realm/terrain';

import { Interactable } from './Interactable';
import { cliffMaterial, makeTerrainMaterial, RimRocks } from './Island';
import { KeepModel } from './Keeps';
import { MAT } from './paint';

const SAT_DIST = 12.5;
const SAT_SCALE = 0.6;
const PLANK = new THREE.BoxGeometry(0.34, 0.04, 0.12);

/** A conquered territory floating beside the main island (60% scale), linked by a rope bridge. */
export function SatelliteIsland({
  territory,
  angle,
  onNavigate,
}: {
  territory: number;
  angle: number;
  onNavigate?: (t: number) => void;
}) {
  const biome = BIOMES[territory];
  const group = useRef<THREE.Group>(null);
  const cx = Math.cos(angle) * SAT_DIST;
  const cz = Math.sin(angle) * SAT_DIST;
  const spec = useMemo(() => miniTerrainSpec(biome, 500 + territory * 31), [biome, territory]);
  const geo = useMemo(() => buildTerrain(spec, 18, 72, 3.2), [spec]);
  useEffect(
    () => () => {
      geo.ground.dispose();
      geo.cliff.dispose();
    },
    [geo],
  );
  const groundMat = useMemo(() => makeTerrainMaterial(), []);
  useEffect(() => () => groundMat.dispose(), [groundMat]);
  const cliffMat = cliffMaterial(biome.cliff);

  useFrame((s) => {
    if (group.current) group.current.position.y = -0.3 + Math.sin(s.clock.elapsedTime * 0.6 + territory) * 0.15;
  });

  // Bridge from the main island edge to the satellite edge, sagging in the middle.
  const planks = useMemo(() => {
    const start = 6.0;
    const end = SAT_DIST - 2.4 * SAT_SCALE;
    const n = Math.round((end - start) / 0.16);
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      const d = start + (end - start) * t;
      return { x: Math.cos(angle) * d, z: Math.sin(angle) * d, y: 0.22 - Math.sin(t * Math.PI) * 0.45 - t * 0.3 };
    });
  }, [angle]);

  return (
    <group>
      {planks.map((p, i) => (
        <mesh key={i} geometry={PLANK} material={MAT.wood} position={[p.x, p.y, p.z]} rotation={[0, -angle + Math.PI / 2, 0]} />
      ))}
      <group ref={group} position={[cx, -0.3, cz]}>
        <Interactable
          id={`sat-${territory}`}
          label={KINGDOMS[territory].name}
          hint="Conquered territory · visit"
          labelY={2}
          onSelect={() => onNavigate?.(territory)}
        >
          <group scale={SAT_SCALE}>
            <mesh geometry={geo.ground} material={groundMat} receiveShadow />
            <mesh geometry={geo.cliff} material={cliffMat} castShadow />
            <RimRocks spec={spec} mat={cliffMat} count={22} />
            <group position={[0, 0.3, 0]} scale={0.85}>
              <KeepModel territory={territory} />
            </group>
          </group>
        </Interactable>
        <Html position={[0, 1.4, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap font-rozha text-xs text-text-highlight drop-shadow">
            {KINGDOMS[territory].name}
          </div>
        </Html>
      </group>
    </group>
  );
}
