'use client';

import { useMemo } from 'react';
import { Html } from '@/components/three/Html';
import { useFrame } from '@react-three/fiber';

import { assault, camp, march, occupy, rout, type Target } from '@/lib/arena/formations';
import type { BattlePhase } from '@/lib/arena/battleMachine';
import { KINGDOMS, kingdomGlow, kingdomInk, territoryName } from '@/lib/game/factions';
import type { IncomingCamp, OutgoingMarch } from '@/lib/realm/derive';
import { CAMP_RADIUS, WALL_RADIUS } from '@/lib/realm/layout';
import { useRealmUi } from '@/lib/realm/ui-store';

import { Troops } from '../arena/Troops';
import { Banner } from './Banners';
import { Interactable } from './Interactable';
import { factionMaterials, MAT, usePaint } from './paint';

const TENT_SLOTS = [
  [0, 0],
  [0.45, 0.25],
  [-0.4, 0.3],
  [0.3, -0.42],
  [-0.35, -0.38],
];

function Camp({
  c,
  slot,
  slots,
  phase,
  winner,
  lowPower,
  troops: showTroops,
}: {
  c: IncomingCamp;
  slot: number;
  slots: number;
  phase: BattlePhase;
  winner: number | null;
  lowPower: boolean;
  troops: boolean;
}) {
  const paint = usePaint();
  const mats = factionMaterials(kingdomGlow(c.faction), paint.time);
  const setFocus = useRealmUi((s) => s.setFocus);
  const cx = Math.cos(c.angle) * (CAMP_RADIUS + 0.35);
  const cz = Math.sin(c.angle) * (CAMP_RADIUS + 0.35);
  const tents = Math.max(1, Math.round(c.size * TENT_SLOTS.length));
  const n = lowPower ? Math.ceil(c.troops / 2) : c.troops;

  const targets = useMemo<Target[]>(() => {
    switch (phase) {
      case 'CLASH':
      case 'ROLL':
        return assault(n, slot, slots);
      case 'HELD':
        return rout(n, c.angle);
      case 'FALLEN':
        return winner === c.faction ? occupy(n) : rout(n, c.angle);
      default:
        return camp(n, c.angle);
    }
  }, [phase, n, slot, slots, c.angle, c.faction, winner]);

  const scale = 0.7 + c.size * 0.6;
  return (
    <group>
      <Interactable
        id={`camp-${c.faction}`}
        label={`${KINGDOMS[c.faction].name} war camp`}
        hint={`${c.sol.toFixed(2)} SOL committed`}
        labelY={1.4}
        position={[cx, 0, cz]}
        rotation={[0, -c.angle + Math.PI / 2, 0]}
        onSelect={() => setFocus({ kind: 'camp', faction: c.faction })}
      >
        {/* floating earth platform */}
        <mesh material={MAT.stoneDark} position={[0, 0.05, 0]} receiveShadow>
          <cylinderGeometry args={[1.05 * scale, 0.7 * scale, 0.3, 7]} />
        </mesh>
        <mesh material={MAT.dark} position={[0, -0.35, 0]}>
          <coneGeometry args={[0.7 * scale, 0.7, 7]} />
        </mesh>
        {TENT_SLOTS.slice(0, tents).map(([x, z], i) => (
          <mesh key={i} material={i % 2 ? MAT.canvas : mats.roof} position={[x * scale, 0.42, z * scale]} rotation={[0, i, 0]} castShadow>
            <coneGeometry args={[0.24, 0.42, 4]} />
          </mesh>
        ))}
        <Banner position={[0, 0.2, -0.55 * scale]} pole={0.9} size={0.36} material={mats.cloth} />
        {(phase === 'MUSTER' || phase === 'CLASH') && (
          <pointLight position={[0, 0.8, 0]} intensity={3} distance={3} color="#ff8a2a" />
        )}
      </Interactable>
      {phase === 'IDLE' || phase === 'MUSTER' ? (
        <Html position={[cx, 1.75, cz]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className="whitespace-nowrap border px-1.5 py-0.5 text-[11px] bg-background-panel/90 shadow-md tabular-nums"
            style={{ borderColor: kingdomInk(c.faction), color: kingdomInk(c.faction) }}
          >
            {KINGDOMS[c.faction].short} {c.troops} ⚔ · {c.sol.toFixed(2)}
          </div>
        </Html>
      ) : null}
      {/* in battle the Melee owns the soldiers */}
      {phase === 'IDLE' && showTroops && <Troops targets={targets} material={mats.tabard} />}
    </group>
  );
}

/** Enemy camps at the edge facing each attacker, sized by committed strength (live). */
export function EnemyCamps({
  camps,
  phase,
  winner,
  lowPower,
  troops = true,
}: {
  camps: IncomingCamp[];
  phase: BattlePhase;
  winner: number | null;
  lowPower: boolean;
  /** False when the tactical layer draws the real warriors instead of camp crowds. */
  troops?: boolean;
}) {
  return (
    <group>
      {camps.map((c, i) => (
        <Camp key={c.faction} c={c} slot={i} slots={camps.length} phase={phase} winner={winner} lowPower={lowPower} troops={troops} />
      ))}
    </group>
  );
}

/** Our columns marching out towards attack targets, under the target's banner. */
export function Marches({ marches, lowPower }: { marches: OutgoingMarch[]; lowPower: boolean }) {
  const paint = usePaint();
  return (
    <group>
      {marches.map((m) => (
        <March key={m.target} m={m} lowPower={lowPower} tabard={paint.tabard} time={paint.time} />
      ))}
    </group>
  );
}

function March({
  m,
  lowPower,
  tabard,
  time,
}: {
  m: OutgoingMarch;
  lowPower: boolean;
  tabard: import('three').Material;
  time: { value: number };
}) {
  const n = lowPower ? Math.ceil(m.troops / 2) : m.troops;
  const targets = useMemo(() => march(n, m.angle), [n, m.angle]);
  const head = { x: Math.cos(m.angle) * (CAMP_RADIUS + 0.4), z: Math.sin(m.angle) * (CAMP_RADIUS + 0.4) };
  // the column keeps marching out towards the target and re-forms at the wall (a loop)
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const from = WALL_RADIUS + 0.45;
    const to = CAMP_RADIUS + 0.2;
    const ca = Math.cos(m.angle);
    const sa = Math.sin(m.angle);
    for (let i = 0; i < targets.length; i++) {
      const u = (t * 0.12 + i / targets.length) % 1;
      const lane = (i % 2 ? 1 : -1) * 0.1;
      const d = from + (to - from) * u;
      const tg = targets[i];
      tg.x = ca * d - sa * lane;
      tg.z = sa * d + ca * lane;
      tg.scale = u < 0.06 || u > 0.94 ? 0 : 1;
      tg.act = 2;
    }
  });
  const mats = factionMaterials(kingdomGlow(m.target), time);
  return (
    <group>
      <Troops targets={targets} material={tabard} smooth={0.12} maxSpeed={4} />
      <Banner position={[head.x * 1.04, 0.25, head.z * 1.04]} pole={0.7} size={0.28} material={mats.cloth} />
      <Html position={[head.x * 1.06, 1.15, head.z * 1.06]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap bg-background-panel/90 shadow-md px-1.5 py-0.5 text-[11px] text-text-primary border border-border-tertiary">
          → {territoryName(m.target)} · {m.troops} ⚔ · {m.sol.toFixed(2)}
        </div>
      </Html>
    </group>
  );
}
