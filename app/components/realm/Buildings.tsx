'use client';

import { useRef } from 'react';
import { Sparkles } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import * as THREE from 'three';

import type { RealmLayout } from '@/lib/realm/layout';
import { useRealmUi } from '@/lib/realm/ui-store';

import { Banner } from './Banners';
import { Interactable } from './Interactable';
import { MAT, usePaint } from './paint';

const dummy = new THREE.Object3D();
const BODY_GEO = new THREE.BoxGeometry(0.26, 0.2, 0.22).translate(0, 0.1, 0);
const ROOF_GEO = new THREE.ConeGeometry(0.2, 0.16, 4).rotateY(Math.PI / 4).translate(0, 0.28, 0);
const MAX_HOUSES = 18;
const PILE_GEO = new THREE.ConeGeometry(1, 1.2, 10).translate(0, 0.6, 0);

/** One house per member (max 18): whitewashed walls, roofs in the owner's colour. */
export function Houses({
  layout,
  count,
  ruined,
  myHouse,
}: {
  layout: RealmLayout;
  count: number;
  ruined: boolean;
  /** Show the gold marker over house 0 (the viewer is a member). */
  myHouse: boolean;
}) {
  const paint = usePaint();
  const bodies = useRef<THREE.InstancedMesh>(null);
  const roofs = useRef<THREE.InstancedMesh>(null);
  const scales = useRef<number[]>(Array(MAX_HOUSES).fill(0));
  const marker = useRef<THREE.Mesh>(null);
  const plots = layout.housePlots.slice(0, MAX_HOUSES);

  useFrame((state, dt) => {
    if (!bodies.current || !roofs.current) return;
    for (let i = 0; i < plots.length; i++) {
      const target = i < count ? 1 : 0;
      scales.current[i] += (target - scales.current[i]) * Math.min(1, dt * 4);
      const s = scales.current[i];
      const p = plots[i];
      dummy.position.set(p.x, 0.3, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(Math.max(s, 0.0001));
      dummy.updateMatrix();
      bodies.current.setMatrixAt(i, dummy.matrix);
      roofs.current.setMatrixAt(i, dummy.matrix);
    }
    bodies.current.instanceMatrix.needsUpdate = true;
    roofs.current.instanceMatrix.needsUpdate = true;
    if (marker.current) {
      marker.current.rotation.y += dt * 2;
      marker.current.position.y = 0.85 + Math.sin(state.clock.elapsedTime * 3) * 0.05;
    }
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[BODY_GEO, ruined ? MAT.ash : MAT.whitewash, plots.length]} castShadow receiveShadow />
      <instancedMesh ref={roofs} args={[ROOF_GEO, ruined ? MAT.ash : paint.roof, plots.length]} castShadow />
      {myHouse && count > 0 && plots[0] && (
        <mesh ref={marker} position={[plots[0].x, 0.85, plots[0].z]} material={MAT.gold}>
          <octahedronGeometry args={[0.08, 0]} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Treasury: the gold pile grows with SOL (tier 0 = empty floor) and one coin chest appears per
 * member who joined (max 12). Click → share info.
 */
export function Treasury({ layout, tier, chests }: { layout: RealmLayout; tier: number; chests: number }) {
  const setFocus = useRealmUi((s) => s.setFocus);
  const pile = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const s = tier === 0 ? 0.0001 : 1;
    if (pile.current) easing.damp3(pile.current.scale, [(0.12 + tier * 0.06) * s, (0.06 + tier * 0.07) * s, (0.12 + tier * 0.06) * s], 0.5, dt);
  });
  const { x, z } = layout.treasury;
  return (
    <Interactable id="treasury" label="Royal Treasury" hint={tier === 0 ? 'Empty · nobody has joined' : `Tier ${tier} of 5 · ${chests} chest${chests === 1 ? '' : 's'}`} labelY={1.1} position={[x, 0.34, z]} onSelect={() => setFocus({ kind: 'treasury' })}>
      <mesh material={MAT.sandstone} position={[0, 0.02, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.46, 0.05, 8]} />
      </mesh>
      <mesh ref={pile} geometry={PILE_GEO} material={MAT.gold} position={[0, 0.04, 0]} scale={[0.3, 0.3, 0.3]} castShadow />
      {/* coin chests */}
      {Array.from({ length: chests }, (_, i) => {
        const ring = i < 6 ? 0 : 1;
        const a = ((i % 6) / 6) * Math.PI * 2 + 0.4 + ring * 0.5;
        const r = 0.3 + ring * 0.12;
        return (
          <group key={i} position={[Math.cos(a) * r, 0.08 + ring * 0.02, Math.sin(a) * r]} rotation={[0, -a, 0]}>
            <mesh material={MAT.wood} castShadow>
              <boxGeometry args={[0.1, 0.07, 0.07]} />
            </mesh>
            <mesh material={MAT.gold} position={[0, 0.045, 0]}>
              <boxGeometry args={[0.104, 0.02, 0.074]} />
            </mesh>
          </group>
        );
      })}
      {tier > 0 && <Sparkles count={6 + tier * 6} scale={[0.8, 0.6 + tier * 0.1, 0.8]} position={[0, 0.35, 0]} size={2.5} speed={0.4} color="#ffd36b" />}
    </Interactable>
  );
}

/** Barracks (war camp) on the gate road. Click → attack panel. */
export function Barracks({ layout }: { layout: RealmLayout }) {
  const paint = usePaint();
  const setFocus = useRealmUi((s) => s.setFocus);
  const { x, z, rot } = layout.barracks;
  return (
    <Interactable id="barracks" label="Barracks" hint="Choose a target to attack" labelY={1.1} position={[x, 0.3, z]} rotation={[0, rot, 0]} onSelect={() => setFocus({ kind: 'attack' })}>
      <mesh material={MAT.sandstone} position={[0, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.32, 0.42]} />
      </mesh>
      <mesh material={paint.roof} position={[0, 0.36, 0]} castShadow>
        <boxGeometry args={[0.88, 0.07, 0.5]} />
      </mesh>
      {/* weapon rack */}
      {[-0.2, -0.1, 0, 0.1, 0.2].map((dx) => (
        <mesh key={dx} material={MAT.wood} position={[dx, 0.2, 0.3]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.015, 0.4, 0.015]} />
        </mesh>
      ))}
      <Banner position={[0.36, 0.38, 0]} pole={0.45} size={0.24} />
    </Interactable>
  );
}
