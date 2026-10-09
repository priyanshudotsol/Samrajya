'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { KINGDOMS, NEUTRAL_GLOW, PLAINS_INFO } from '@/lib/game/factions';
import { NEUTRAL, PLAINS } from '@/lib/game/types';
import { PLAINS_CIRCLE } from '@/lib/game/units';
import { generateRealm, groundY, type RealmLayout } from '@/lib/realm/layout';
import { useRealmUi } from '@/lib/realm/ui-store';
import { useGame } from '@/lib/store/game';

import { CombatFx, Rallies } from '../arena/CombatFx';
import { BattleParticles } from '../arena/Particles';
import { Units } from '../arena/Units';
import { Birds } from './Ambient';
import { CameraRig } from './CameraRig';
import { Island } from './Island';
import { PaintProvider } from './paint';
import { Clouds, RealmLighting } from './RealmLighting';

const STONE = new THREE.MeshStandardMaterial({ color: '#8d8476', roughness: 0.95 });
const DAIS = new THREE.MeshStandardMaterial({ color: '#a69a85', roughness: 0.9 });
const POLE = new THREE.MeshStandardMaterial({ color: '#4a3420', roughness: 0.8 });
const N_STONES = 12;

/**
 * The ring of standing stones in the middle of Kurukshetra (ARCHITECTURE §10.11): stand inside
 * it to claim the plains. A flat dais at the centre carries the holder's banner; the ring glows
 * in the holder's colour.
 */
function StoneCircle({ layout, color }: { layout: RealmLayout; color: string }) {
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const flag = useRef<THREE.Mesh>(null);
  const stones = useMemo(
    () =>
      Array.from({ length: N_STONES }, (_, i) => {
        const a = (i / N_STONES) * Math.PI * 2;
        const r = PLAINS_CIRCLE + 0.12;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const tall = i % 3 === 0 ? 0.95 : 0.7;
        return { x, z, y: groundY(layout, x, z), a, tall };
      }),
    [layout],
  );
  const cy = groundY(layout, 0, 0);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.opacity = 0.35 + Math.sin(clock.elapsedTime * 2) * 0.12;
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 1.7) * 0.25;
  });
  return (
    <group>
      {stones.map((s, i) => (
        <mesh key={i} material={STONE} position={[s.x, s.y + s.tall / 2, s.z]} rotation={[0, -s.a, (i % 2 ? 1 : -1) * 0.05]} castShadow receiveShadow>
          <boxGeometry args={[0.22, s.tall, 0.16]} />
        </mesh>
      ))}
      {/* the circle you must stand in */}
      <mesh position={[0, cy + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[PLAINS_CIRCLE - 0.06, PLAINS_CIRCLE + 0.02, 64]} />
        <meshBasicMaterial ref={glow} color={color} transparent opacity={0.4} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* the dais and the holder's banner */}
      <mesh material={DAIS} position={[0, cy + 0.04, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.42, 0.48, 0.08, 8]} />
      </mesh>
      <mesh material={POLE} position={[0, cy + 0.75, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.03, 1.4, 6]} />
      </mesh>
      <mesh ref={flag} position={[0.2, cy + 1.25, 0]} castShadow>
        <boxGeometry args={[0.38, 0.24, 0.015]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Kurukshetra's realm: the open plains, no fort; warriors fight over the stone circle. */
export function PlainsScene() {
  const game = useGame((s) => s.game);
  const units = useGame((s) => s.units);
  const lowPower = useRealmUi((s) => s.lowPower);
  const layout = useMemo(() => generateRealm(PLAINS), []);
  if (!game) return null;
  const holder = game.territoryOwner[PLAINS];
  const color = holder === NEUTRAL ? PLAINS_INFO.color : KINGDOMS[holder]?.color ?? NEUTRAL_GLOW;
  return (
    <PaintProvider color={color}>
      <RealmLighting biome={layout.biome} shadows={!lowPower} />
      <Clouds />
      <group>
        <Island layout={layout} ash={false} />
        <StoneCircle layout={layout} color={color} />
        <Birds seed={layout.seed} />
        {units.length > 0 && <Units territory={PLAINS} layout={layout} wallTop={0} />}
        <CombatFx territory={PLAINS} layout={layout} />
        <BattleParticles />
        <Rallies territory={PLAINS} layout={layout} />
      </group>
      <CameraRig />
    </PaintProvider>
  );
}
