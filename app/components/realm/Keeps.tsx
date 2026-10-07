'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { styleMats, styleOf, type KeepKind, type TowerKind } from '@/lib/realm/styles';

import { Banner } from './Banners';
import { MAT, usePaint } from './paint';
import {
  AMALAKA_GEO,
  BARREL_GEO,
  BOX,
  Chhatri,
  DEULA_GEO,
  FINIAL_GEO,
  HALF_DOME,
  ONION_GEO,
  PILLAR_GEO,
  SHIKHARA_GEO,
  SPHERE,
  UNIT_BOX,
  UNIT_CONE4,
  UNIT_CYL,
} from './parts';

const dummy = new THREE.Object3D();

export const KEEP_NAMES: Record<KeepKind, string> = {
  fort: 'Kuru Red Fort',
  hall: 'Hall of Pillars',
  deula: 'Sun Temple',
  stupa: 'Great Stupa',
  gopuram: 'Royal Gopuram',
  shikhara: 'Mahakal Shikhara',
};

// ---------------------------------------------------------------------------------------------
// Keeps (one per founding kingdom). Local origin = keep tile top; +z faces the gate.
// ---------------------------------------------------------------------------------------------

/** Hastinapur: red-sandstone fort-palace with a marble onion dome and chhatris. */
function FortKeep({ territory }: { territory: number }) {
  const paint = usePaint();
  const m = styleMats(territory);
  return (
    <group>
      <mesh geometry={UNIT_BOX} material={m.wallDark} scale={[1.35, 0.22, 1.35]} castShadow receiveShadow />
      <mesh geometry={UNIT_BOX} material={m.wall} position={[0, 0.22, 0]} scale={[0.95, 0.78, 0.95]} castShadow receiveShadow />
      <mesh geometry={UNIT_BOX} material={paint.roof} position={[0, 0.94, 0]} scale={[1.04, 0.07, 1.04]} castShadow />
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          geometry={BOX}
          material={MAT.dark}
          position={[Math.sin((i * Math.PI) / 2) * 0.48, 0.62, Math.cos((i * Math.PI) / 2) * 0.48]}
          rotation={[0, (i * Math.PI) / 2, 0]}
          scale={[0.18, 0.24, 0.02]}
        />
      ))}
      <mesh geometry={UNIT_BOX} material={m.trim} position={[0, 1.0, 0]} scale={[0.62, 0.36, 0.62]} castShadow />
      <mesh geometry={ONION_GEO} material={m.trim} position={[0, 1.36, 0]} scale={0.95} castShadow />
      <mesh geometry={FINIAL_GEO} material={MAT.gold} position={[0, 2.1, 0]} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return <Chhatri key={i} s={0.9} slab={m.wallDark} dome={m.trim} position={[Math.cos(a) * 0.4, 1.0, Math.sin(a) * 0.4]} />;
      })}
      {/* minarets at the plinth corners */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <group key={`m${i}`} position={[Math.cos(a) * 0.86, 0.22, Math.sin(a) * 0.86]}>
            <mesh geometry={UNIT_CYL} material={m.wall} scale={[0.07, 0.95, 0.07]} castShadow />
            <Chhatri s={0.6} slab={m.wallDark} dome={m.trim} position={[0, 0.95, 0]} />
          </group>
        );
      })}
      <Banner position={[0, 2.15, 0]} pole={0.5} size={0.42} />
    </group>
  );
}

/** Magadh: Mauryan timber hall of polished pillars, barrel roofs, an Ashokan lion pillar. */
function HallKeep({ territory }: { territory: number }) {
  const paint = usePaint();
  const m = styleMats(territory);
  const chakra = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (chakra.current) chakra.current.rotation.z += dt * 0.8;
  });
  const pillars = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) out.push([-0.6 + i * 0.24, -0.4 + j * 0.27]);
    return out;
  }, []);
  return (
    <group>
      <mesh geometry={UNIT_BOX} material={m.wallDark} scale={[1.55, 0.16, 1.2]} castShadow receiveShadow />
      {pillars.map(([x, z], i) => (
        <mesh key={i} geometry={PILLAR_GEO} material={m.trim} position={[x, 0.16, z]} scale={[2.2, 0.5, 2.2]} castShadow />
      ))}
      <mesh geometry={UNIT_BOX} material={MAT.wood} position={[0, 0.66, 0]} scale={[1.5, 0.08, 1.12]} castShadow />
      <mesh geometry={BARREL_GEO} material={paint.roof} position={[0, 0.74, 0]} scale={[1.5, 0.42, 0.56]} castShadow />
      {/* upper storey */}
      <mesh geometry={UNIT_BOX} material={m.wall} position={[0, 0.9, 0]} scale={[0.8, 0.34, 0.55]} castShadow />
      <mesh geometry={BARREL_GEO} material={paint.roof} position={[0, 1.24, 0]} scale={[0.9, 0.3, 0.32]} castShadow />
      {[-0.36, 0, 0.36].map((x) => (
        <mesh key={x} geometry={FINIAL_GEO} material={MAT.gold} position={[x, 1.6, 0]} />
      ))}
      {/* Ashokan lion pillar */}
      <group position={[0.72, 0, 0.85]}>
        <mesh geometry={UNIT_BOX} material={m.wallDark} scale={[0.2, 0.06, 0.2]} />
        <mesh geometry={UNIT_CYL} material={m.trim} position={[0, 0.06, 0]} scale={[0.045, 1.5, 0.045]} castShadow />
        <mesh material={MAT.gold} position={[0, 1.6, 0]} rotation={[Math.PI, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.09, 0.1, 10]} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            material={MAT.gold}
            position={[Math.cos((i * Math.PI) / 2) * 0.05, 1.71, Math.sin((i * Math.PI) / 2) * 0.05]}
            rotation={[0, (-i * Math.PI) / 2, 0]}
          >
            <boxGeometry args={[0.07, 0.11, 0.05]} />
          </mesh>
        ))}
        <mesh ref={chakra} material={MAT.gold} position={[0, 1.86, 0]}>
          <torusGeometry args={[0.07, 0.012, 5, 16]} />
        </mesh>
      </group>
      <Banner position={[-0.7, 0.16, -0.5]} pole={1.4} size={0.42} />
    </group>
  );
}

/** One stone chariot wheel with spokes. */
function Wheel({ r = 0.16 }: { r?: number }) {
  const m = MAT.stoneDark;
  return (
    <group>
      <mesh material={m}>
        <torusGeometry args={[r, r * 0.16, 5, 16]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} material={m} rotation={[0, 0, (i * Math.PI) / 4]}>
          <boxGeometry args={[r * 2, r * 0.1, r * 0.1]} />
        </mesh>
      ))}
      <mesh material={MAT.gold} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r * 0.22, r * 0.22, r * 0.25, 8]} />
      </mesh>
    </group>
  );
}

/** Kalinga: Konark sun temple — curved deula, stepped jagamohana, turning chariot wheels. */
function DeulaKeep({ territory }: { territory: number }) {
  const paint = usePaint();
  const m = styleMats(territory);
  const wheels = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    wheels.current?.children.forEach((w) => (w.rotation.z -= dt * 0.6));
  });
  const wheelSpots = useMemo(() => {
    const out: { p: [number, number, number]; ry: number }[] = [];
    for (const side of [-1, 1]) for (const z of [-0.42, 0, 0.42]) out.push({ p: [side * 0.72, 0.2, z], ry: Math.PI / 2 });
    return out;
  }, []);
  return (
    <group>
      <mesh geometry={UNIT_BOX} material={m.wallDark} scale={[1.4, 0.24, 1.45]} castShadow receiveShadow />
      <group ref={wheels}>
        {wheelSpots.map((w, i) => (
          <group key={i} position={w.p} rotation={[0, w.ry, 0]}>
            <Wheel r={0.17} />
          </group>
        ))}
      </group>
      {/* rekha deula (sanctum tower) */}
      <group position={[0, 0.24, -0.25]}>
        <mesh geometry={DEULA_GEO} material={m.wall} scale={[1.1, 1.15, 1.1]} castShadow />
        <mesh geometry={AMALAKA_GEO} material={m.trim} position={[0, 1.74, 0]} scale={[0.17, 0.07, 0.17]} castShadow />
        <mesh geometry={SPHERE} material={MAT.gold} position={[0, 1.83, 0]} scale={0.06} />
        <mesh geometry={FINIAL_GEO} material={MAT.gold} position={[0, 1.95, 0]} />
        <Banner position={[0, 1.95, 0]} pole={0.45} size={0.36} />
      </group>
      {/* jagamohana (porch) with a stepped pidha roof */}
      <group position={[0, 0.24, 0.4]}>
        <mesh geometry={UNIT_BOX} material={m.wall} scale={[0.72, 0.4, 0.62]} castShadow />
        <mesh geometry={BOX} material={MAT.dark} position={[0, 0.16, 0.315]} scale={[0.16, 0.26, 0.02]} />
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            geometry={UNIT_BOX}
            material={i % 2 ? m.trim : paint.roof}
            position={[0, 0.4 + i * 0.1, 0]}
            scale={[0.8 - i * 0.2, 0.08, 0.7 - i * 0.18]}
            castShadow
          />
        ))}
        <mesh geometry={UNIT_CONE4} material={m.wall} position={[0, 0.7, 0]} scale={[0.22, 0.22, 0.22]} />
      </group>
      {/* horses pulling the chariot */}
      {[-0.22, 0.22].map((x) => (
        <group key={x} position={[x, 0.24, 0.98]}>
          <mesh material={m.trim} position={[0, 0.12, 0]} castShadow>
            <boxGeometry args={[0.08, 0.09, 0.2]} />
          </mesh>
          <mesh material={m.trim} position={[0, 0.2, 0.1]} rotation={[0.6, 0, 0]}>
            <boxGeometry args={[0.05, 0.12, 0.06]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={m.trim} position={[0, 0.04, s * 0.07]}>
              <boxGeometry args={[0.06, 0.08, 0.03]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

const FLAG_COLORS = ['#2e6fd8', '#f4f4f4', '#d8322e', '#2ea84a', '#f2c230'];
const FLAG_GEO = new THREE.PlaneGeometry(0.07, 0.09);
const FLAG_MAT = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1 });
const MONK_GEO = new THREE.ConeGeometry(0.045, 0.2, 6).translate(0, 0.1, 0);
const MONK_MAT = new THREE.MeshStandardMaterial({ color: '#d9771e', roughness: 0.9, flatShading: true });

/** Strings of five-colour prayer flags from `top` down to each anchor, fluttering. */
export function PrayerFlags({ top, anchors }: { top: [number, number, number]; anchors: [number, number, number][] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const flags = useMemo(() => {
    const out: { x: number; y: number; z: number; ry: number }[] = [];
    for (const a of anchors) {
      const n = 9;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        out.push({
          x: top[0] + (a[0] - top[0]) * t,
          y: top[1] + (a[1] - top[1]) * t - Math.sin(t * Math.PI) * 0.12,
          z: top[2] + (a[2] - top[2]) * t,
          ry: Math.atan2(a[0] - top[0], a[2] - top[2]) + Math.PI / 2,
        });
      }
    }
    return out;
  }, [top, anchors]);
  useLayoutEffect(() => {
    const c = new THREE.Color();
    flags.forEach((_, i) => ref.current!.setColorAt(i, c.set(FLAG_COLORS[i % FLAG_COLORS.length])));
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [flags]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    flags.forEach((f, i) => {
      dummy.position.set(f.x, f.y - 0.045, f.z);
      dummy.rotation.set(Math.sin(t * 4 + i * 0.8) * 0.5, f.ry, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[FLAG_GEO, FLAG_MAT, flags.length]} frustumCulled={false} />;
}

/** Takshashila: white stupa with harmika and spinning parasols, toranas, flags, walking monks. */
function StupaKeep({ territory }: { territory: number }) {
  const paint = usePaint();
  const m = styleMats(territory);
  const spire = useRef<THREE.Group>(null);
  const monks = useRef<THREE.InstancedMesh>(null);
  useFrame((s, dt) => {
    if (spire.current) spire.current.rotation.y += dt * 0.5;
    const t = s.clock.elapsedTime;
    if (monks.current) {
      for (let i = 0; i < 4; i++) {
        const a = -t * 0.25 + (i * Math.PI) / 2;
        dummy.position.set(Math.cos(a) * 0.9, 0.24 + Math.abs(Math.sin(t * 6 + i)) * 0.015, Math.sin(a) * 0.9);
        dummy.rotation.set(0, -a, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        monks.current.setMatrixAt(i, dummy.matrix);
      }
      monks.current.instanceMatrix.needsUpdate = true;
    }
  });
  const anchors = useMemo<[number, number, number][]>(
    () => [0, 1, 2, 3].map((i) => [Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 1.0, 0.5, Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 1.0]),
    [],
  );
  return (
    <group>
      <mesh geometry={UNIT_BOX} material={m.wallDark} scale={[1.6, 0.12, 1.6]} castShadow receiveShadow />
      <mesh geometry={UNIT_BOX} material={m.wall} position={[0, 0.12, 0]} scale={[1.3, 0.12, 1.3]} castShadow receiveShadow />
      <mesh material={m.wall} position={[0, 0.34, 0]} castShadow>
        <cylinderGeometry args={[0.62, 0.64, 0.2, 20]} />
      </mesh>
      <mesh geometry={HALF_DOME} material={m.trim} position={[0, 0.44, 0]} scale={[0.6, 0.55, 0.6]} castShadow />
      {/* harmika + chhatravali */}
      <mesh geometry={UNIT_BOX} material={paint.roof} position={[0, 0.98, 0]} scale={[0.2, 0.14, 0.2]} castShadow />
      <group ref={spire} position={[0, 1.12, 0]}>
        <mesh geometry={PILLAR_GEO} material={MAT.gold} scale={[1, 0.62, 1]} />
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} material={MAT.gold} position={[0, 0.1 + i * 0.11, 0]} castShadow>
            <cylinderGeometry args={[0.16 - i * 0.026, 0.17 - i * 0.026, 0.025, 10]} />
          </mesh>
        ))}
      </group>
      {/* four toranas */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
          <group position={[0, 0.24, 0.72]}>
            {[-1, 1].map((s) => (
              <mesh key={s} geometry={UNIT_BOX} material={m.wallDark} position={[s * 0.13, 0, 0]} scale={[0.035, 0.32, 0.035]} />
            ))}
            {[0.26, 0.32].map((y) => (
              <mesh key={y} geometry={BOX} material={m.wallDark} position={[0, y, 0]} scale={[0.36, 0.025, 0.035]} />
            ))}
          </group>
        </group>
      ))}
      <PrayerFlags top={[0, 1.65, 0]} anchors={anchors} />
      <instancedMesh ref={monks} args={[MONK_GEO, MONK_MAT, 4]} castShadow frustumCulled={false} />
      <Banner position={[0.82, 0.24, 0.82]} pole={0.9} size={0.32} />
    </group>
  );
}

/** Vijayanagar: a stepped Dravidian gopuram over the gate, a vimana behind, granite boulders. */
function GopuramKeep({ territory }: { territory: number }) {
  const paint = usePaint();
  const m = styleMats(territory);
  return (
    <group>
      <mesh geometry={UNIT_BOX} material={m.wallDark} scale={[1.5, 0.12, 1.4]} castShadow receiveShadow />
      {/* gopuram, facing the gate */}
      <group position={[0, 0.12, 0.25]}>
        <mesh geometry={UNIT_BOX} material={m.wall} scale={[1.1, 0.42, 0.6]} castShadow />
        <mesh geometry={UNIT_BOX} material={MAT.dark} position={[0, 0, 0.301]} scale={[0.22, 0.32, 0.01]} />
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            geometry={UNIT_BOX}
            material={i % 2 ? m.trim : m.wall}
            position={[0, 0.42 + i * 0.17, 0]}
            scale={[1.0 - i * 0.14, 0.17, 0.56 - i * 0.06]}
            castShadow
          />
        ))}
        <mesh geometry={BARREL_GEO} material={paint.roof} position={[0, 1.27, 0]} scale={[0.5, 0.16, 0.14]} castShadow />
        {[-0.18, -0.09, 0, 0.09, 0.18].map((x) => (
          <mesh key={x} geometry={FINIAL_GEO} material={MAT.gold} position={[x, 1.48, 0]} scale={0.8} />
        ))}
      </group>
      {/* vimana (sanctum) */}
      <group position={[0, 0.12, -0.42]}>
        <mesh geometry={UNIT_BOX} material={m.wall} scale={[0.6, 0.36, 0.5]} castShadow />
        <mesh geometry={UNIT_CONE4} material={m.trim} position={[0, 0.36, 0]} scale={[0.38, 0.42, 0.34]} castShadow />
        <mesh geometry={HALF_DOME} material={paint.roof} position={[0, 0.76, 0]} scale={0.1} />
      </group>
      {/* pillared mandapa wings */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.62, 0.12, -0.25]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} geometry={PILLAR_GEO} material={m.trim} position={[(i % 2) * 0.2 - 0.1, 0, Math.floor(i / 2) * 0.3 - 0.15]} scale={[1.6, 0.3, 1.6]} />
          ))}
          <mesh geometry={UNIT_BOX} material={m.wall} position={[0, 0.3, 0]} scale={[0.3, 0.06, 0.42]} castShadow />
        </group>
      ))}
      {[
        [0.85, 0.7, 0.16],
        [-0.82, 0.62, 0.13],
        [0.6, -0.85, 0.12],
      ].map(([x, z, s], i) => (
        <mesh key={i} material={MAT.stoneDark} position={[x, 0.08, z]} scale={s} castShadow>
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
      <Banner position={[0, 1.6, 0.25]} pole={0.4} size={0.36} />
    </group>
  );
}

const DIYA = new THREE.SphereGeometry(1, 6, 4);

/** Avanti: dark nagara shikhara with clustered spires, a lamp tower and rings of lit diyas. */
function ShikharaKeep({ territory }: { territory: number }) {
  const paint = usePaint();
  const m = styleMats(territory);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const lampSpots = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      out.push([Math.cos(a) * 0.68, 0.24, Math.sin(a) * 0.68]);
    }
    // deepstambha (lamp tower) rings
    for (let k = 0; k < 4; k++)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + k * 0.5;
        out.push([0.75 + Math.cos(a) * 0.07, 0.4 + k * 0.22, 0.75 + Math.sin(a) * 0.07]);
      }
    return out;
  }, []);
  useLayoutEffect(() => {
    lampSpots.forEach((p, i) => {
      dummy.position.set(...p);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.022);
      dummy.updateMatrix();
      lamps.current!.setMatrixAt(i, dummy.matrix);
    });
    lamps.current!.instanceMatrix.needsUpdate = true;
  }, [lampSpots]);
  useFrame((s) => {
    // flicker
    if (lamps.current) (lamps.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.4 + Math.sin(s.clock.elapsedTime * 9) * 0.4;
  });
  const lampMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff9a2a', emissiveIntensity: 2.4, toneMapped: false }),
    [],
  );
  return (
    <group>
      <mesh geometry={UNIT_BOX} material={m.wallDark} scale={[1.45, 0.24, 1.45]} castShadow receiveShadow />
      <mesh geometry={UNIT_BOX} material={m.wall} position={[0, 0.24, 0.35]} scale={[0.6, 0.3, 0.5]} castShadow />
      <mesh geometry={UNIT_CONE4} material={paint.roof} position={[0, 0.54, 0.35]} scale={[0.4, 0.25, 0.36]} castShadow />
      <group position={[0, 0.24, -0.15]}>
        <mesh geometry={SHIKHARA_GEO} material={m.wall} scale={[1, 1.05, 1]} castShadow />
        {/* urushringas: smaller spires clinging to the main one */}
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          return (
            <mesh key={i} geometry={SHIKHARA_GEO} material={m.wall} position={[Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32]} scale={[0.45, 0.6, 0.45]} castShadow />
          );
        })}
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2;
          return (
            <mesh key={`b${i}`} geometry={SHIKHARA_GEO} material={m.trim} position={[Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3]} scale={[0.3, 0.42, 0.3]} castShadow />
          );
        })}
        <mesh geometry={AMALAKA_GEO} material={m.trim} position={[0, 2.12, 0]} scale={[0.13, 0.05, 0.13]} />
        {/* trishul */}
        <mesh geometry={PILLAR_GEO} material={MAT.gold} position={[0, 2.14, 0]} scale={[0.8, 0.4, 0.8]} />
        {[-1, 0, 1].map((s) => (
          <mesh key={s} geometry={FINIAL_GEO} material={MAT.gold} position={[s * 0.05, 2.6, 0]} scale={[0.6, 0.5, 0.6]} />
        ))}
        <mesh geometry={BOX} material={MAT.gold} position={[0, 2.53, 0]} scale={[0.12, 0.015, 0.015]} />
      </group>
      {/* deepstambha */}
      <mesh geometry={UNIT_CYL} material={m.wallDark} position={[0.75, 0.24, 0.75]} scale={[0.06, 0.9, 0.06]} castShadow />
      <instancedMesh ref={lamps} args={[DIYA, lampMat, lampSpots.length]} />
      <pointLight position={[0.75, 0.9, 0.75]} intensity={2} distance={3} color="#ffa347" />
      <Banner position={[-0.72, 0.24, 0.72]} pole={1.0} size={0.32} />
    </group>
  );
}

const KEEPS: Record<KeepKind, (p: { territory: number }) => React.JSX.Element> = {
  fort: FortKeep,
  hall: HallKeep,
  deula: DeulaKeep,
  stupa: StupaKeep,
  gopuram: GopuramKeep,
  shikhara: ShikharaKeep,
};

/** The keep model of `territory`'s founding kingdom (no interaction; used by realm + satellites). */
export function KeepModel({ territory }: { territory: number }) {
  const K = KEEPS[styleOf(territory).keep];
  return <K territory={territory} />;
}

// ---------------------------------------------------------------------------------------------
// Corner tower caps
// ---------------------------------------------------------------------------------------------

/** Tower cap of the given kind; local origin = top of the tower shaft. */
export function TowerCap({ kind, territory, banner }: { kind: TowerKind; territory: number; banner: boolean }) {
  const paint = usePaint();
  const m = styleMats(territory);
  const flag = banner ? <Banner position={[0, 0.55, 0]} pole={0.3} size={0.22} /> : null;
  switch (kind) {
    case 'chhatri':
      return (
        <group>
          <mesh geometry={UNIT_BOX} material={m.wallDark} scale={[0.6, 0.06, 0.6]} castShadow />
          <Chhatri s={1.25} slab={m.wallDark} dome={m.trim} position={[0, 0.06, 0]} />
          {flag}
        </group>
      );
    case 'watchtower':
      return (
        <group>
          <mesh geometry={UNIT_BOX} material={MAT.wood} scale={[0.6, 0.05, 0.6]} castShadow />
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            return <mesh key={i} geometry={PILLAR_GEO} material={MAT.wood} position={[Math.cos(a) * 0.24, 0.05, Math.sin(a) * 0.24]} scale={[1.4, 0.26, 1.4]} />;
          })}
          <mesh geometry={UNIT_CONE4} material={paint.roof} position={[0, 0.3, 0]} scale={[0.46, 0.3, 0.46]} castShadow />
          {banner && <Banner position={[0, 0.6, 0]} pole={0.3} size={0.22} />}
        </group>
      );
    case 'deula':
      return (
        <group>
          <mesh geometry={UNIT_BOX} material={m.wallDark} scale={[0.58, 0.06, 0.58]} castShadow />
          <mesh geometry={DEULA_GEO} material={m.wall} position={[0, 0.06, 0]} scale={[0.6, 0.45, 0.6]} castShadow />
          <mesh geometry={AMALAKA_GEO} material={m.trim} position={[0, 0.74, 0]} scale={[0.09, 0.04, 0.09]} />
          {banner && <Banner position={[0, 0.76, 0]} pole={0.3} size={0.22} />}
        </group>
      );
    case 'pagoda':
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <group key={i} position={[0, i * 0.17, 0]}>
              <mesh geometry={UNIT_BOX} material={m.wall} scale={[0.36 - i * 0.08, 0.12, 0.36 - i * 0.08]} castShadow />
              <mesh geometry={UNIT_CONE4} material={paint.roof} position={[0, 0.1, 0]} scale={[0.4 - i * 0.08, 0.08, 0.4 - i * 0.08]} castShadow />
            </group>
          ))}
          <mesh geometry={PILLAR_GEO} material={MAT.gold} position={[0, 0.5, 0]} scale={[1, 0.2, 1]} />
          {banner && <Banner position={[0, 0.5, 0]} pole={0.3} size={0.22} />}
        </group>
      );
    case 'mandapa':
      return (
        <group>
          <mesh geometry={UNIT_BOX} material={m.wallDark} scale={[0.62, 0.06, 0.62]} castShadow />
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            return <mesh key={i} geometry={PILLAR_GEO} material={m.trim} position={[Math.cos(a) * 0.22, 0.06, Math.sin(a) * 0.22]} scale={[2, 0.24, 2]} />;
          })}
          <mesh geometry={UNIT_BOX} material={m.wall} position={[0, 0.3, 0]} scale={[0.6, 0.06, 0.6]} castShadow />
          <mesh geometry={UNIT_BOX} material={paint.roof} position={[0, 0.36, 0]} scale={[0.4, 0.07, 0.4]} castShadow />
          <mesh geometry={FINIAL_GEO} material={MAT.gold} position={[0, 0.52, 0]} />
          {banner && <Banner position={[0.2, 0.43, 0]} pole={0.3} size={0.22} />}
        </group>
      );
    case 'spire':
      return (
        <group>
          <mesh geometry={UNIT_BOX} material={m.wallDark} scale={[0.5, 0.06, 0.5]} castShadow />
          <mesh geometry={SHIKHARA_GEO} material={m.wall} position={[0, 0.06, 0]} scale={[0.5, 0.42, 0.5]} castShadow />
          <mesh position={[0, 0.98, 0]} material={MAT.diya} scale={0.045}>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
          {banner && <Banner position={[0.18, 0.06, 0.18]} pole={0.75} size={0.22} />}
        </group>
      );
  }
}
