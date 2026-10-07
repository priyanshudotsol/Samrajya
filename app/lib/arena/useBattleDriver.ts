'use client';

import { useEffect, useRef } from 'react';

import { play } from '@/lib/audio';
import { useGame } from '@/lib/store/game';

import { useBattle, type BattlePhase } from './battleMachine';

/**
 * Drives the battle machine for the realm being viewed (ticks every 200 ms against the live
 * store) and plays the phase sound cues. Lives outside the canvas so banners and audio keep
 * working in low-power mode.
 */
export function useBattleDriver(territory: number) {
  const last = useRef<BattlePhase>('IDLE');

  useEffect(() => {
    useBattle.getState().reset();
    const tick = () => useBattle.getState().tick(useGame.getState().game, territory);
    tick();
    const id = setInterval(tick, 200);
    return () => {
      clearInterval(id);
      useBattle.getState().reset();
    };
  }, [territory]);

  useEffect(
    () =>
      useBattle.subscribe((s) => {
        if (s.phase === last.current) return;
        last.current = s.phase;
        if (s.phase === 'MUSTER') play('drum');
        if (s.phase === 'CLASH') play('horn');
        if (s.phase === 'HELD') play('fanfare');
        if (s.phase === 'FALLEN') play('bell');
      }),
    [],
  );

  // War drums every 2 s while mustering.
  useEffect(() => {
    const id = setInterval(() => {
      if (useBattle.getState().phase === 'MUSTER') play('drum');
    }, 2000);
    return () => clearInterval(id);
  }, []);
}
