'use client';

import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { GATE_Z } from '@/lib/arena/formations';
import { WALL_RADIUS } from '@/lib/realm/layout';
import { styleMats, styleOf, type MerlonKind } from '@/lib/realm/styles';
import { useRealmUi } from '@/lib/realm/ui-store';

import { Interactable } from './Interactable';
import { KEEP_NAMES, KeepModel, TowerCap } from './Keeps';
import { MAT, usePaint } from './paint';
import { BOX, UNIT_BOX, UNIT_CYL } from './parts';
import { skyState } from './skyState';

const dummy = new THREE.Object3D();
const DIYA_GEO = new THREE.SphereGeometry(1, 6, 4);

export { Chhatri, ONION_GEO } from './parts';

/** Unit merlon per style; scaled per instance. Origin at the base. */
const MERLON_GEO: Record<MerlonKind, THREE.BufferGeometry> = {
  kangura: new THREE.ConeGeometry(0.5, 1.4, 4).rotateY(Math.PI / 4).translate(0, 0.7, 0),
  stakes: new THREE.ConeGeometry(0.28, 2.2, 5).translate(0, 1.1, 0),
  block: UNIT_BOX,
  step: mergeGeometries([UNIT_BOX.clone().scale(1, 0.6, 1), UNIT_BOX.clone().scale(0.55, 1.2, 1)])!,
  round: new THREE.SphereGeometry(0.55, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  spike: new THREE.ConeGeometry(0.3, 2.4, 4).translate(0, 1.2, 0),
};
const SQUARE_SHAFT = new THREE.BoxGeometry(2, 1, 2).translate(0, 0.5, 0);

function Keep({ territory, onSelect }: { territory: number; onSelect: () => void }) {
  const kind = styleOf(territory).keep;
  return (
    <Interactable id="keep" label={KEEP_NAMES[kind]} hint="Defend this realm" labelY={2.9} onSelect={onSelect}>
      <group position={[0, 0.36, 0]}>
        <KeepModel territory={territory} />
      </group>
    </Interactable>
  );
}

/** Corners of the curtain wall (hexagon, gate mid-edge at +z). */
const CORNERS = Array.from({ length: 6 }, (_, k) => {
  const a = (k * Math.PI) / 3;
  return [Math.cos(a) * WALL_RADIUS, Math.sin(a) * WALL_RADIUS] as const;
});
const GATE_GAP = 0.62;

interface Segment {
  x: number;
  z: number;
  len: number;
  rot: number;
}

const SEGMENTS: Segment[] = (() => {
  const out: Segment[] = [];
  for (let k = 0; k < 6; k++) {
    const [x0, z0] = CORNERS[k];
    const [x1, z1] = CORNERS[(k + 1) % 6];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const rot = -Math.atan2(dz, dx);
    if (k === 1) {
      // gate edge: two halves leaving a gap in the middle
      const half = (len - GATE_GAP) / 2;
      const ux = dx / len;
      const uz = dz / len;
      for (const sgn of [-1, 1]) {
        const d = GATE_GAP / 2 + half / 2;
        out.push({ x: (x0 + x1) / 2 + ux * d * sgn, z: (z0 + z1) / 2 + uz * d * sgn, len: half, rot });
      }
    } else {
      out.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, len, rot });
    }
  }
  return out;
})();

const MERLONS = (() => {
  const out: { x: number; z: number; rot: number }[] = [];
  for (const s of SEGMENTS) {
    const n = Math.max(2, Math.round(s.len / 0.22));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      out.push({ x: s.x + Math.cos(-s.rot) * t * s.len, z: s.z + Math.sin(-s.rot) * t * s.len, rot: s.rot });
    }
  }
  return out;
})();

export const WALL_BASE_Y = 0.32;
export const wallVisualHeight = (wallHeight: number) => 0.32 + wallHeight * 1.3;

/** Curtain wall, corner towers with chhatris, toran gate and diyas. Height follows `wallHeight`. */
const MERLON_SCALE: Record<MerlonKind, [number, number, number]> = {
  kangura: [0.16, 0.1, 0.16],
  stakes: [0.14, 0.1, 0.14],
  block: [0.12, 0.1, 0.2],
  step: [0.14, 0.1, 0.2],
  round: [0.2, 0.2, 0.2],
  spike: [0.12, 0.1, 0.12],
};

function Walls({
  territory,
  wallHeight,
  broken,
  onSelectGate,
}: {
  territory: number;
  wallHeight: number;
  broken: boolean;
  onSelectGate: () => void;
}) {
  const paint = usePaint();
  const style = styleOf(territory);
  const mats = styleMats(territory);
  const wallGroup = useRef<THREE.Group>(null);
  const topGroup = useRef<THREE.Group>(null);
  const towerShafts = useRef<THREE.Group>(null);
  const merlonRef = useRef<THREE.InstancedMesh>(null);
  const diyaRef = useRef<THREE.InstancedMesh>(null);
  const doors = useRef<THREE.Group>(null);
  const h = useRef(wallVisualHeight(wallHeight));

  useLayoutEffect(() => {
    MERLONS.forEach((m, i) => {
      dummy.position.set(m.x, 0, m.z);
      dummy.rotation.set(0, m.rot, 0);
      dummy.scale.set(...MERLON_SCALE[style.merlon]);
      dummy.updateMatrix();
      merlonRef.current!.setMatrixAt(i, dummy.matrix);
    });
    merlonRef.current!.instanceMatrix.needsUpdate = true;
    MERLONS.forEach((m, i) => {
      if (i % 2) return;
      dummy.position.set(m.x * 0.985, 0.04, m.z * 0.985);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.035);
      dummy.updateMatrix();
      diyaRef.current!.setMatrixAt(i / 2, dummy.matrix);
    });
    diyaRef.current!.instanceMatrix.needsUpdate = true;
  }, [style.merlon]);

  useFrame((_, dt) => {
    const target = wallVisualHeight(wallHeight);
    easing.damp(h, 'current', target, 0.6, dt);
    const H = h.current;
    if (wallGroup.current) wallGroup.current.scale.y = H;
    if (topGroup.current) topGroup.current.position.y = WALL_BASE_Y + H;
    if (towerShafts.current) towerShafts.current.scale.y = H + 0.45;
    MAT.diya.emissiveIntensity = 0.2 + skyState.dusk * 3.2;
    if (doors.current) easing.damp(doors.current.rotation, 'x', broken ? -1.4 : 0, 0.25, dt);
  });

  const diyaCount = Math.ceil(MERLONS.length / 2);

  return (
    <group>
      <group ref={wallGroup} position={[0, WALL_BASE_Y, 0]}>
        {SEGMENTS.map((s, i) => (
          <mesh
            key={i}
            geometry={UNIT_BOX}
            material={mats.wall}
            position={[s.x, 0, s.z]}
            rotation={[0, s.rot, 0]}
            scale={[s.len, 1, 0.2]}
            castShadow
            receiveShadow
          />
        ))}
      </group>
      <group ref={topGroup} position={[0, WALL_BASE_Y + h.current, 0]}>
        <instancedMesh key={style.merlon} ref={merlonRef} args={[MERLON_GEO[style.merlon], mats.wallDark, MERLONS.length]} castShadow />
        <instancedMesh ref={diyaRef} args={[DIYA_GEO, MAT.diya, diyaCount]} />
      </group>
      {/* corner towers */}
      <group ref={towerShafts} position={[0, WALL_BASE_Y, 0]}>
        {CORNERS.map(([x, z], k) => (
          <mesh
            key={k}
            geometry={style.squareTowers ? SQUARE_SHAFT : UNIT_CYL}
            material={mats.wall}
            position={[x, 0, z]}
            rotation={[0, style.squareTowers ? -Math.atan2(z, x) : 0, 0]}
            scale={[style.towerR, 1, style.towerR]}
            castShadow
            receiveShadow
          />
        ))}
      </group>
      <TowerTops heightRef={h} territory={territory} />
      {/* toran gate */}
      <Interactable id="gate" label="Toran Gate" hint="Muster the attack" labelY={1.6} onSelect={onSelectGate} position={[0, WALL_BASE_Y, GATE_Z]}>
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={UNIT_BOX} material={mats.wallDark} position={[s * 0.38, 0, 0.06]} scale={[0.11, 1.15, 0.11]} castShadow />
        ))}
        <mesh geometry={BOX} material={mats.wallDark} position={[0, 1.18, 0.06]} scale={[0.98, 0.08, 0.14]} castShadow />
        <mesh position={[0, 0.72, 0.06]} material={mats.trim}>
          <torusGeometry args={[0.36, 0.035, 6, 18, Math.PI]} />
        </mesh>
        {[-0.3, -0.1, 0.1, 0.3].map((x) => (
          <mesh key={x} position={[x, 1.08, 0.14]} material={paint.roof} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.05, 0.13, 3]} />
          </mesh>
        ))}
        <group ref={doors} position={[0, 0, -0.02]}>
          <mesh geometry={UNIT_BOX} material={MAT.wood} scale={[0.58, 0.56, 0.06]} position={[0, 0, 0]} castShadow />
        </group>
      </Interactable>
    </group>
  );
}

function TowerTops({ heightRef, territory }: { heightRef: { current: number }; territory: number }) {
  const kind = styleOf(territory).tower;
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.position.y = WALL_BASE_Y + heightRef.current + 0.45;
  });
  return (
    <group ref={g}>
      {CORNERS.map(([x, z], k) => (
        <group key={k} position={[x, 0, z]}>
          <TowerCap kind={kind} territory={territory} banner={k % 2 === 0} />
        </group>
      ))}
    </group>
  );
}

export function Castle({ territory, wallHeight, broken }: { territory: number; wallHeight: number; broken: boolean }) {
  const setFocus = useRealmUi((s) => s.setFocus);
  return (
    <group>
      <Keep territory={territory} onSelect={() => setFocus({ kind: 'defend' })} />
      <Walls territory={territory} wallHeight={wallHeight} broken={broken} onSelectGate={() => setFocus({ kind: 'attack' })} />
    </group>
  );
}

/** Wall-walk height for troop formations. */
export const wallTopY = (wallHeight: number) => WALL_BASE_Y + wallVisualHeight(wallHeight);
