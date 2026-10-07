'use client';

import { useEffect } from 'react';

import { useBattle } from '@/lib/arena/battleMachine';
import { playSting, setMusicBed, stopMusic } from '@/lib/music';
import { useGame } from '@/lib/store/game';

/**
 * Drives the background music from the battle phase (renders nothing). IDLE → peace loop;
 * MUSTER/CLASH/ROLL → battle loop; HELD → victory sting; FALLEN → defeat sting, or victory when
 * the viewer's own kingdom is the conqueror. Stings fade back to the peace loop.
 */
export function MusicDirector() {
  const phase = useBattle((s) => s.phase);

  useEffect(() => {
    switch (phase) {
      case 'IDLE':
        setMusicBed('peace');
        break;
      case 'MUSTER':
      case 'CLASH':
      case 'ROLL':
        setMusicBed('battle');
        break;
      case 'HELD':
        setMusicBed('peace');
        playSting('victory');
        break;
      case 'FALLEN': {
        const winner = useBattle.getState().entry?.winner;
        const mine = useGame.getState().me?.faction;
        setMusicBed('peace');
        playSting(winner !== undefined && winner === mine ? 'victory' : 'defeat');
        break;
      }
    }
  }, [phase]);

  useEffect(() => stopMusic, []);

  return null;
}
