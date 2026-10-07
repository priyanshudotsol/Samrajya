'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { POWERS } from '@/lib/game/factions';
import type { RealmLayout } from '@/lib/realm/layout';
import { useRealmUi } from '@/lib/realm/ui-store';

import { Chhatri } from './parts';
import { Interactable } from './Interactable';
import { MAT, usePaint } from './paint';

const GRAIN = new THREE.MeshStandardMaterial({ color: '#d8b24a', roughness: 0.9, flatShading: true });

/** Kuru Fortress — tall stone fort-palace with chhatri domes. */
function KuruFortress() {
  const paint = usePaint();
  return (
    <group>
      <mesh material={MAT.sandstone} position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.5, 0.5]} />
      </mesh>
      <mesh material={MAT.stone} position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[0.4, 0.26, 0.36]} />
      </mesh>
      <mesh material={paint.roof} position={[0, 0.5, 0]}>
        <boxGeometry args={[0.66, 0.04, 0.54]} />
      </mesh>
      <Chhatri s={1.1} position={[-0.22, 0.5, 0.15]} />
      <Chhatri s={1.1} position={[0.22, 0.5, 0.15]} />
      <Chhatri s={1.4} position={[0, 0.75, 0]} />
    </group>
  );
}

/** Gaja Sena — a low-poly war elephant beside its stable. */
function GajaSena() {
  const paint = usePaint();
  const trunk = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (trunk.current) trunk.current.rotation.x = 0.3 + Math.sin(s.clock.elapsedTime * 1.5) * 0.2;
  });
  return (
    <group>
      <mesh material={MAT.wood} position={[-0.22, 0.17, -0.12]} castShadow>
        <boxGeometry args={[0.32, 0.34, 0.3]} />
      </mesh>
      <mesh material={paint.roof} position={[-0.22, 0.37, -0.12]} castShadow>
        <coneGeometry args={[0.26, 0.14, 4]} />
      </mesh>
      <group position={[0.12, 0, 0.08]} scale={0.9}>
        <mesh material={MAT.elephant} position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[0.22, 0.2, 0.36]} />
        </mesh>
        {[
          [-0.07, -0.12],
          [0.07, -0.12],
          [-0.07, 0.12],
          [0.07, 0.12],
        ].map(([x, z], i) => (
          <mesh key={i} material={MAT.elephant} position={[x, 0.11, z]} castShadow>
            <cylinderGeometry args={[0.035, 0.04, 0.22, 6]} />
          </mesh>
        ))}
        <mesh material={MAT.elephant} position={[0, 0.36, 0.22]} castShadow>
          <boxGeometry args={[0.18, 0.17, 0.13]} />
        </mesh>
        <mesh ref={trunk} material={MAT.elephant} position={[0, 0.3, 0.29]}>
          <cylinderGeometry args={[0.02, 0.035, 0.22, 5]} />
        </mesh>
        {/* ears + howdah */}
        {[-1, 1].map((s) => (
          <mesh key={s} material={MAT.elephant} position={[s * 0.1, 0.37, 0.18]} rotation={[0, s * 0.5, 0]}>
            <boxGeometry args={[0.02, 0.13, 0.1]} />
          </mesh>
        ))}
        <mesh material={paint.roof} position={[0, 0.43, -0.02]} castShadow>
          <boxGeometry args={[0.2, 0.08, 0.2]} />
        </mesh>
        <mesh material={MAT.gold} position={[0, 0.5, -0.02]}>
          <sphereGeometry args={[0.07, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </group>
    </group>
  );
}

/** Samudra Vyapar — a jetty with a trade ship. */
function SamudraVyapar() {
  const paint = usePaint();
  const ship = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (ship.current) {
      ship.current.rotation.z = Math.sin(s.clock.elapsedTime * 1.2) * 0.06;
      ship.current.position.y = 0.04 + Math.sin(s.clock.elapsedTime * 1.6) * 0.015;
    }
  });
  return (
    <group>
      <mesh material={MAT.water} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.04, 6]} />
      </mesh>
      <mesh material={MAT.wood} position={[-0.32, 0.06, 0]}>
        <boxGeometry args={[0.2, 0.04, 0.6]} />
      </mesh>
      <group ref={ship} position={[0.1, 0.04, 0]}>
        <mesh material={MAT.wood} position={[0, 0.05, 0]} castShadow>
          <boxGeometry args={[0.18, 0.08, 0.5]} />
        </mesh>
        <mesh material={MAT.wood} position={[0, 0.06, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.09, 0.12, 4]} />
        </mesh>
        <mesh material={MAT.wood} position={[0, 0.32, 0]}>
          <cylinderGeometry args={[0.01, 0.012, 0.5, 5]} />
        </mesh>
        <mesh material={paint.cloth} position={[0, 0.34, 0.01]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.3, 0.28]} />
        </mesh>
      </group>
    </group>
  );
}

/** Vidya Reach — stupa beside a library tower. */
function VidyaReach() {
  const paint = usePaint();
  return (
    <group>
      <mesh material={MAT.sandstone} position={[0.1, 0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.34, 0.1, 12]} />
      </mesh>
      <mesh material={MAT.marble} position={[0.1, 0.1, 0]} castShadow>
        <sphereGeometry args={[0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={MAT.gold} position={[0.1, 0.4, 0]}>
        <boxGeometry args={[0.08, 0.06, 0.08]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} material={MAT.gold} position={[0.1, 0.47 + i * 0.05, 0]}>
          <cylinderGeometry args={[0.06 - i * 0.015, 0.06 - i * 0.015, 0.02, 8]} />
        </mesh>
      ))}
      <mesh material={MAT.stone} position={[-0.26, 0.3, -0.05]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.6, 8]} />
      </mesh>
      <mesh material={paint.roof} position={[-0.26, 0.66, -0.05]} castShadow>
        <coneGeometry args={[0.14, 0.18, 8]} />
      </mesh>
    </group>
  );
}

/** Annapurna Harvest — the stone temple chariot of Hampi, with grain stacks. */
function Annapurna() {
  const paint = usePaint();
  return (
    <group>
      <mesh material={MAT.sandstone} position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[0.32, 0.18, 0.4]} />
      </mesh>
      {[
        [-0.18, -0.12],
        [0.18, -0.12],
        [-0.18, 0.12],
        [0.18, 0.12],
      ].map(([x, z], i) => (
        <mesh key={i} material={MAT.stoneDark} position={[x, 0.09, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.04, 10]} />
        </mesh>
      ))}
      <mesh material={MAT.sandstone} position={[0, 0.4, 0]} castShadow>
        <coneGeometry args={[0.16, 0.34, 4]} />
      </mesh>
      <mesh material={paint.roof} position={[0, 0.27, 0]}>
        <boxGeometry args={[0.26, 0.04, 0.26]} />
      </mesh>
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} material={GRAIN} position={[x, 0.1, 0.22]} castShadow>
          <coneGeometry args={[0.08, 0.2, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/** Ratri Raid — moonlit observatory (Ujjain). */
function RatriRaid() {
  const paint = usePaint();
  const moon = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (moon.current) moon.current.position.y = 1.05 + Math.sin(s.clock.elapsedTime * 0.8) * 0.05;
  });
  return (
    <group>
      <mesh material={MAT.stone} position={[0, 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.28, 0.4, 12]} />
      </mesh>
      <mesh material={MAT.marble} position={[0, 0.4, 0]} castShadow>
        <sphereGeometry args={[0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={MAT.dark} position={[0, 0.52, 0.12]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.06, 0.2, 0.02]} />
      </mesh>
      {/* samrat yantra (sundial) ramp */}
      <mesh material={paint.roof} position={[0.32, 0.12, 0]} rotation={[0, 0, 0.6]} castShadow>
        <boxGeometry args={[0.04, 0.34, 0.2]} />
      </mesh>
      <mesh ref={moon} material={MAT.moon} position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.09, 12, 8]} />
      </mesh>
      <pointLight position={[0, 1, 0]} intensity={1.5} distance={3} color="#c9d0ff" />
    </group>
  );
}


const LANDMARKS = [KuruFortress, GajaSena, SamudraVyapar, VidyaReach, Annapurna, RatriRaid];

/** One landmark per power owned (KINGDOM_UI §4.2 `powers_mask`). Click → power description. */
export function Landmarks({ layout, powers }: { layout: RealmLayout; powers: number[] }) {
  const setFocus = useRealmUi((s) => s.setFocus);
  return (
    <group>
      {powers.map((p) => {
        const plot = layout.landmarkPlots[p];
        if (!plot) return null;
        const C = LANDMARKS[p];
        return (
          <Interactable
            key={p}
            id={`landmark-${p}`}
            label={POWERS[p].name}
            hint={POWERS[p].effect}
            labelY={1.2}
            position={[plot.x, 0.3, plot.z]}
            rotation={[0, plot.rot, 0]}
            onSelect={() => setFocus({ kind: 'landmark', power: p })}
          >
            <C />
          </Interactable>
        );
      })}
    </group>
  );
}
