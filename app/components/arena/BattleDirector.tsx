'use client';

import { useMemo, useRef } from 'react';
import { Sparkles } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { useBattle } from '@/lib/arena/battleMachine';
import { GATE_Z } from '@/lib/arena/formations';
import { wheelFor } from '@/lib/arena/odds';
import type { IncomingCamp } from '@/lib/realm/derive';
import { CAMP_RADIUS, type RealmLayout } from '@/lib/realm/layout';
import { useGame } from '@/lib/store/game';

import { wallTopY } from '../realm/Castle';
import { MAT } from '../realm/paint';
import { Projectiles } from './Projectiles';
import { RuneWheel } from './RuneWheel';

const dummy = new THREE.Object3D();
const FLAME_GEO = new THREE.ConeGeometry(0.08, 0.28, 5).translate(0, 0.14, 0);
const SMOKE_GEO = new THREE.IcosahedronGeometry(0.2, 0);
const SMOKE_MAT = new THREE.MeshStandardMaterial({ color: '#3a3634', transparent: true, opacity: 0.55, depthWrite: false });

/** Roof fires (FALLEN) and smoke columns (eliminated). */
function Fire({ spots, smoke }: { spots: [number, number, number][]; smoke: boolean }) {
  const flames = useRef<THREE.InstancedMesh>(null);
  const puffs = useRef<THREE.InstancedMesh>(null);
  const SMOKES = smoke ? 40 : 0;
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (flames.current) {
      spots.forEach(([x, y, z], i) => {
        const f = 0.7 + Math.sin(t * 13 + i * 3.1) * 0.2 + Math.sin(t * 7 + i) * 0.15;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, t + i, Math.sin(t * 5 + i) * 0.15);
        dummy.scale.set(f, f * (1.1 + Math.sin(t * 9 + i) * 0.3), f);
        dummy.updateMatrix();
        flames.current!.setMatrixAt(i, dummy.matrix);
      });
      flames.current.instanceMatrix.needsUpdate = true;
    }
    if (puffs.current) {
      for (let i = 0; i < SMOKES; i++) {
        const src = spots[i % spots.length];
        const life = (t * 0.35 + i / SMOKES) % 1;
        dummy.position.set(src[0] + Math.sin(i + t * 0.3) * life * 0.4, src[1] + 0.2 + life * 2.6, src[2] + life * 0.5);
        dummy.scale.setScalar(0.4 + life * 1.6);
        dummy.rotation.set(i, i * 2, 0);
        dummy.updateMatrix();
        puffs.current.setMatrixAt(i, dummy.matrix);
      }
      puffs.current.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group>
      <instancedMesh ref={flames} args={[FLAME_GEO, MAT.fire, spots.length]} frustumCulled={false} />
      {smoke && <instancedMesh ref={puffs} args={[SMOKE_GEO, SMOKE_MAT, SMOKES]} frustumCulled={false} />}
      {spots.slice(0, 3).map(([x, y, z], i) => (
        <pointLight key={i} position={[x, y + 0.4, z]} intensity={4} distance={4} color="#ff6a1a" />
      ))}
    </group>
  );
}

/**
 * Arena cinematics inside the realm canvas (KINGDOM_UI §5): volleys + dust in CLASH, the VRF
 * rune wheel in ROLL, gold on HELD, fire (and smoke if eliminated) on FALLEN. Troop formations
 * and the camera are driven by the same battle phase in Garrison / EnemyCamps / CameraRig.
 */
export function BattleDirector({
  layout,
  camps,
  wallHeight,
  houseCount,
}: {
  layout: RealmLayout;
  camps: IncomingCamp[];
  wallHeight: number;
  houseCount: number;
}) {
  const phase = useBattle((s) => s.phase);
  const entry = useBattle((s) => s.entry);
  const snapshot = useBattle((s) => s.snapshot);
  const skipping = useBattle((s) => s.skipping);
  const top = wallTopY(wallHeight);

  const sources = useMemo<[number, number][]>(
    () => camps.map((c) => [Math.cos(c.angle) * (CAMP_RADIUS + 0.35), Math.sin(c.angle) * (CAMP_RADIUS + 0.35)]),
    [camps],
  );
  const wheel = useMemo(
    () => (entry ? wheelFor(entry, snapshot, useGame.getState().game?.battleLog ?? []) : null),
    [entry, snapshot],
  );
  const fireSpots = useMemo<[number, number, number][]>(() => {
    const spots: [number, number, number][] = [
      [0, 1.4, 0],
      [0.45, 1.3, 0.45],
      [-0.4, 1.35, -0.3],
    ];
    layout.housePlots.slice(0, Math.max(houseCount, 4)).forEach((p) => spots.push([p.x, 0.62, p.z]));
    return spots;
  }, [layout, houseCount]);

  return (
    <group>
      {(phase === 'CLASH' || phase === 'ROLL' || phase === 'HELD') && <Projectiles sources={sources} wallTop={top} />}
      {phase === 'CLASH' && (
        <>
          <Sparkles count={50} scale={[2.6, 0.8, 1.6]} position={[0, 0.6, GATE_Z + 1.3]} size={4} speed={1.6} color="#ffb347" />
          <Sparkles count={30} scale={[3, 0.5, 2]} position={[0, 0.35, GATE_Z + 1.5]} size={8} speed={0.5} color="#cbb89a" opacity={0.5} />
        </>
      )}
      {wheel && (phase === 'ROLL' || phase === 'HELD' || phase === 'FALLEN') && (
        <RuneWheel wheel={wheel} position={[0, 2.5, GATE_Z + 0.3]} spinning={phase === 'ROLL' && !skipping} />
      )}
      {phase === 'HELD' && (
        <Sparkles count={80} scale={[3, 2, 3]} position={[layout.treasury.x, 1, layout.treasury.z]} size={5} speed={0.8} color="#ffd36b" />
      )}
      {phase === 'FALLEN' && <Fire spots={fireSpots} smoke={!!entry?.eliminated} />}
    </group>
  );
}
