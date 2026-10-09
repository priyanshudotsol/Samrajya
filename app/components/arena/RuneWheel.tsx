'use client';

import { useMemo, useRef } from 'react';
import { Billboard } from '@react-three/drei';

import { Html } from '@/components/three/Html';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { play } from '@/lib/audio';
import { ROLL_MS } from '@/lib/arena/battleMachine';
import type { Wheel } from '@/lib/arena/odds';
import { KINGDOMS, kingdomGlow, kingdomInk } from '@/lib/game/factions';

const R_IN = 0.62;
const R_OUT = 0.95;
const SPINS = 4;

/** fraction (clockwise from 12 o'clock) → angle in the wheel plane */
const angleOf = (f: number) => Math.PI / 2 - f * Math.PI * 2;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * The VRF rune wheel (KINGDOM_UI §5.1): segments sized by the real buckets of the BattleEntry
 * (defense vs each A_i); the pointer spins and lands on roll / total.
 */
export function RuneWheel({ wheel, position, spinning }: { wheel: Wheel; position: [number, number, number]; spinning: boolean }) {
  const pointer = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const lastTick = useRef(0);
  const group = useRef<THREE.Group>(null);
  const segs = useMemo(
    () =>
      wheel.segments
        .filter((s) => s.to - s.from > 0.0005)
        .map((s) => ({
          ...s,
          geo: new THREE.RingGeometry(R_IN, R_OUT, Math.max(4, Math.ceil((s.to - s.from) * 96)), 1, angleOf(s.to), (s.to - s.from) * Math.PI * 2),
          color: s.defender ? '#e3c15a' : kingdomGlow(s.faction),
        })),
    [wheel],
  );
  const final = angleOf(wheel.pointer);

  useFrame((state, dt) => {
    if (group.current) {
      const s = group.current.scale.x + (1 - group.current.scale.x) * Math.min(1, dt * 6);
      group.current.scale.setScalar(s);
    }
    if (!pointer.current) return;
    if (!spinning) {
      pointer.current.rotation.z = final;
      return;
    }
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = Math.min(1, (state.clock.elapsedTime - start.current) / ((ROLL_MS - 400) / 1000));
    const a = final + SPINS * Math.PI * 2 * (1 - easeOut(t));
    // tick on every segment boundary pass (roughly)
    const rev = Math.floor(a / (Math.PI / 6));
    if (rev !== lastTick.current) {
      lastTick.current = rev;
      if (t < 1) play('tick');
    }
    pointer.current.rotation.z = a;
  });

  return (
    <Billboard position={position}>
      <group ref={group} scale={0.2}>
        <mesh>
          <circleGeometry args={[R_OUT + 0.08, 48]} />
          <meshBasicMaterial color="#120e0a" transparent opacity={0.85} />
        </mesh>
        {segs.map((s, i) => (
          <mesh key={i} geometry={s.geo} position={[0, 0, 0.01]}>
            <meshBasicMaterial color={s.color} toneMapped={false} />
          </mesh>
        ))}
        {/* segment separators */}
        {segs.map((s, i) => {
          const a = angleOf(s.from);
          return (
            <mesh key={`sep${i}`} position={[Math.cos(a) * ((R_IN + R_OUT) / 2), Math.sin(a) * ((R_IN + R_OUT) / 2), 0.02]} rotation={[0, 0, a]}>
              <planeGeometry args={[R_OUT - R_IN, 0.02]} />
              <meshBasicMaterial color="#120e0a" />
            </mesh>
          );
        })}
        <mesh position={[0, 0, 0.02]}>
          <ringGeometry args={[R_OUT, R_OUT + 0.04, 64]} />
          <meshBasicMaterial color="#c9a227" toneMapped={false} />
        </mesh>
        <group ref={pointer} position={[0, 0, 0.03]}>
          <mesh position={[(R_IN + R_OUT) / 2 + 0.05, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.09, R_OUT - R_IN + 0.24, 3]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          <mesh position={[R_IN / 2, 0, 0]}>
            <planeGeometry args={[R_IN, 0.03]} />
            <meshBasicMaterial color="#f5ebd7" />
          </mesh>
        </group>
        <mesh position={[0, 0, 0.04]}>
          <circleGeometry args={[0.12, 24]} />
          <meshBasicMaterial color="#c9a227" toneMapped={false} />
        </mesh>
        <Html position={[0, -R_OUT - 0.3, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div className="flex gap-2 whitespace-nowrap bg-background-panel/90 shadow-md px-2 py-1 text-[11px] tabular-nums border border-border-active">
            {wheel.segments.map((s) => (
              <span key={`${s.faction}-${s.defender}`} style={{ color: s.defender ? 'var(--color-text-highlight)' : kingdomInk(s.faction) }}>
                {s.defender ? 'Defend' : KINGDOMS[s.faction].short} {((s.to - s.from) * 100).toFixed(1)}%
              </span>
            ))}
            <span className="text-text-secondary">
              roll {wheel.pointer.toFixed(3)}
              {!wheel.exact && ' (≈ split)'}
            </span>
          </div>
        </Html>
      </group>
    </Billboard>
  );
}
