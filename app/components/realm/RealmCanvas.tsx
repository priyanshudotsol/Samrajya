'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

import { useBattle } from '@/lib/arena/battleMachine';
import { localPose } from '@/lib/arena/controller';
import { attackersOf, wheelFor } from '@/lib/arena/odds';
import { KINGDOMS } from '@/lib/game/factions';
import { battleOdds, lamportsToSol, solToLamports } from '@/lib/game/math';
import type { Game } from '@/lib/game/types';
import { deriveRealmVisuals, soldiersFor, type IncomingCamp, type RealmVisuals } from '@/lib/realm/derive';
import { bearing, generateRealm, spreadAngles } from '@/lib/realm/layout';
import { useRealmUi } from '@/lib/realm/ui-store';
import { isMockMode, useGame } from '@/lib/store/game';

import { BattleDirector } from '../arena/BattleDirector';
import { CombatFx, Rallies } from '../arena/CombatFx';
import { BattleParticles } from '../arena/Particles';
import { Birds, Boats } from './Ambient';
import { Garrison } from '../arena/Garrison';
import { Melee, type CastMember } from '../arena/Melee';
import { Units, unitsIn } from '../arena/Units';
import { Barracks, Houses, Treasury } from './Buildings';
import { CameraRig } from './CameraRig';
import { Castle, wallTopY } from './Castle';
import { Effects } from './Effects';
import { EnemyCamps, Marches } from './EnemyCamps';
import { Island } from './Island';
import { Landmarks } from './Landmarks';
import { PaintProvider } from './paint';
import { Clouds, RealmLighting } from './RealmLighting';
import { SatelliteIsland } from './SatelliteIsland';
import { ShieldDome } from './ShieldDome';

/** Re-derives visuals only when a bucket changes (KINGDOM_UI §6.3). */
function useStableVisuals(game: Game | null, territory: number): RealmVisuals | null {
  const prev = useRef<RealmVisuals | null>(null);
  return useMemo(() => {
    if (!game) return prev.current;
    const v = deriveRealmVisuals(game, territory);
    if (prev.current && prev.current.key === v.key) {
      // keep the identity (no re-render cascade) but refresh the labels' SOL amounts
      prev.current.incoming.forEach((c, i) => {
        const n = v.incoming[i];
        if (n && n.faction === c.faction) c.sol = n.sol;
      });
      return prev.current;
    }
    prev.current = v;
    return v;
  }, [game, territory]);
}

/** Camps rebuilt from a logged battle (replays have no pre-battle snapshot). */
function campsFromEntry(game: Game | null, territory: number): IncomingCamp[] {
  const { entry } = useBattle.getState();
  if (!entry) return [];
  const wheel = wheelFor(entry, null);
  const attackers = attackersOf(entry.attackersMask);
  const angles = spreadAngles(attackers.map((f) => bearing(territory, f)));
  const totalSol = lamportsToSol(entry.total);
  return attackers.map((f, i) => {
    const seg = wheel.segments.find((s) => !s.defender && s.faction === f)!;
    const sol = (seg.to - seg.from) * totalSol;
    return {
      faction: f,
      strength: 0n,
      sol,
      size: Math.min(1, Math.max(0.15, Math.log10(sol * 10 + 1) / 2)),
      troops: game ? soldiersFor(game.factions[f].members, solToLamports(sol), game.factions[f].treasury, 30) || 1 : 1,
      angle: angles[i],
    };
  });
}

/** The warriors standing in this realm at the bell, the viewer's from the local controller. */
function buildCast(units: import('@/lib/game/units').Unit[], territory: number): CastMember[] {
  const now = Date.now() / 1000;
  return unitsIn(units, territory, now).map((u) => {
    const mine = localPose.active && localPose.wallet === u.wallet && localPose.at === territory;
    return mine
      ? { faction: u.faction, x: localPose.x, z: localPose.z, face: localPose.facing, role: u.role }
      : { faction: u.faction, x: u.x, z: u.z, face: u.facing, role: u.role };
  });
}

function Scene({ territory, onNavigate }: { territory: number; onNavigate?: (t: number) => void }) {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const units = useGame((s) => s.units);
  const phase = useBattle((s) => s.phase);
  const entry = useBattle((s) => s.entry);
  const snapshot = useBattle((s) => s.snapshot);
  const replay = useBattle((s) => s.replay);
  const battleEpoch = useBattle((s) => s.epoch);
  const lowPower = useRealmUi((s) => s.lowPower);
  const layout = useMemo(() => generateRealm(territory), [territory]);

  const live = useStableVisuals(game, territory);
  const snapVisuals = useMemo(
    () => (phase !== 'IDLE' && snapshot && !replay ? deriveRealmVisuals(snapshot, territory) : null),
    [phase, snapshot, replay, territory],
  );
  const v = snapVisuals ?? live;
  const replayCamps = useMemo(
    () => (replay && entry && game ? campsFromEntry(game, territory) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replay, entry, territory],
  );
  const pDefend = useMemo(() => {
    const g = snapshot ?? game;
    return g && phase !== 'IDLE' ? battleOdds(g, territory).pDefend : 0.5;
  }, [snapshot, game, phase, territory]);
  if (!v || !game) return null;

  const camps = replayCamps ?? v.incoming;
  const defender = entry ? entry.defender : v.owner;
  const paintOwner = phase === 'FALLEN' && entry ? entry.winner : phase !== 'IDLE' ? defender : v.owner;
  const color = KINGDOMS[paintOwner].color;
  const myFaction = me && me.shares > 0n && me.generation === game.factions[me.faction]?.generation ? me.faction : null;
  const troops = lowPower ? Math.ceil(v.troopCount / 2) : v.troopCount;
  const winner = phase === 'FALLEN' && entry ? entry.winner : null;
  const battling = phase !== 'IDLE';
  // The tactical layer draws real warriors instead of the aggregate crowds once the feed has
  // them (mock: always; devnet: once more than the viewer's own warrior is known). Warriors stay
  // on the field and under their players' control through the bell: the fight IS the battle, the
  // VRF only rolls the result. The scripted melee is kept for replays and for realms whose
  // warriors aren't tracked yet.
  const tactical = isMockMode() || units.length > 1;
  const unitsVisible = units.length > 0;
  const meleeOn = battling && camps.length > 0 && !tactical && !replay;
  const replayMelee = battling && camps.length > 0 && replay;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cast = useMemo(() => (tactical && meleeOn ? buildCast(units, territory) : undefined), [tactical, meleeOn, battleEpoch, territory]);

  return (
    <PaintProvider color={color}>
      <RealmLighting biome={layout.biome} shadows={!lowPower} />
      <Clouds />
      <group>
        <Island layout={layout} ash={v.ruined || (phase === 'FALLEN' && !!entry?.eliminated)} />
        {/* the holder's architecture: a conquered realm becomes the conqueror's fort */}
        <Castle territory={paintOwner} wallHeight={v.wallHeight} broken={phase === 'FALLEN'} />
        <Treasury layout={layout} tier={v.treasuryTier} chests={v.chests} />
        <Barracks layout={layout} />
        <Houses layout={layout} count={v.houseCount} ruined={v.ruined} myHouse={myFaction === v.owner} />
        <Landmarks layout={layout} powers={v.landmarks} />
        <Birds seed={layout.seed} />
        <Boats layout={layout} />
        <ShieldDome strength={phase === 'FALLEN' ? 0 : v.defendShare} pulse={phase === 'MUSTER' || phase === 'CLASH'} />
        {!battling && !tactical && <Garrison count={troops} defendShare={v.defendShare} wallHeight={v.wallHeight} />}
        {unitsVisible && <Units territory={territory} layout={layout} wallTop={wallTopY(v.wallHeight)} />}
        <CombatFx territory={territory} layout={layout} />
        <BattleParticles />
        <Rallies territory={territory} layout={layout} />
        {(meleeOn || replayMelee) && (
          <Melee
            key={`${battleEpoch}:${territory}:${replay ? 'r' : 'l'}`}
            layout={layout}
            sides={{ defender, defenders: troops, camps }}
            pDefend={pDefend}
            startPhase={phase}
            cast={replay ? undefined : cast}
          />
        )}
        <EnemyCamps camps={camps} phase={phase} winner={winner} lowPower={lowPower} troops={!tactical} />
        {!battling && !tactical && <Marches marches={v.outgoing} lowPower={lowPower} />}
        {v.satellites.map((s) => (
          <SatelliteIsland key={s.territory} territory={s.territory} angle={s.angle} onNavigate={onNavigate} />
        ))}
        <BattleDirector layout={layout} camps={camps} wallHeight={v.wallHeight} houseCount={v.houseCount} />
      </group>
      <CameraRig />
    </PaintProvider>
  );
}

/**
 * The realm diorama + arena (KINGDOM_UI §4–§5). Client-only: load with
 * `dynamic(() => import('@/components/realm/RealmCanvas'), { ssr: false })`.
 */
export default function RealmCanvas({ territory, onNavigate }: { territory: number; onNavigate?: (t: number) => void }) {
  const lowPower = useRealmUi((s) => s.lowPower);
  const degraded = useRealmUi((s) => s.degraded);
  const setDegraded = useRealmUi((s) => s.setDegraded);
  const [dpr, setDpr] = useState(1.5);

  return (
    <Canvas
      shadows={lowPower ? false : { type: THREE.PCFSoftShadowMap }}
      dpr={lowPower ? 1 : dpr}
      camera={{ position: [11, 9.5, 14], fov: 35, near: 0.1, far: 300 }}
      gl={{ antialias: !lowPower, powerPreference: 'high-performance' }}
      onPointerMissed={() => useRealmUi.getState().setFocus(null)}
      style={{ touchAction: 'none' }}
    >
      <PerformanceMonitor
        onDecline={() => {
          setDpr(1);
          setDegraded(true);
        }}
        onIncline={() => setDpr(1.5)}
      >
        <Suspense fallback={null}>
          <Scene territory={territory} onNavigate={onNavigate} />
          {!lowPower && !degraded && <Effects />}
        </Suspense>
      </PerformanceMonitor>
    </Canvas>
  );
}
