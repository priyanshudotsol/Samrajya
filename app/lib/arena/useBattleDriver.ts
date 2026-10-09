'use client';

import { useEffect, useRef } from 'react';

import { play, playSfx } from '@/lib/audio';
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
        // the war horn calls the muster; the drums / crowd beds swell in CombatFx
        if (s.phase === 'MUSTER') playSfx('warhorn', { volume: 0.9 });
        if (s.phase === 'CLASH') {
          playSfx('clash', { volume: 0.8 });
          playSfx('warhorn', { volume: 0.6, delay: 0.3 });
        }
        if (s.phase === 'HELD') play('fanfare');
        if (s.phase === 'FALLEN') play('bell');
      }),
    [],
  );

}
