'use client';

import { useEffect, useRef } from 'react';

import { useBattle } from '@/lib/arena/battleMachine';
import { playSfx } from '@/lib/audio';
import { playSting, setMusicBed, stopMusic } from '@/lib/music';
import { useGame } from '@/lib/store/game';

/** The battle loop keeps playing this long after the last blow in the realm. */
const FIGHT_LINGER_MS = 6000;
const COMBAT_KINDS = new Set(['swing', 'hit', 'block', 'arrow', 'kill']);

/**
 * Drives the background music (renders nothing). The war theme plays only while a fight is
 * actually happening in the realm on screen (someone attacked: swings, hits, arrows, kills), opened
 * by a war horn, and fades out a few seconds after the last blow. Between fights there is no
 * melody (the user did not want one), just the world. The bell's verdict still plays a sting:
 * HELD → victory; FALLEN → defeat, or victory when the viewer's kingdom conquered.
 */
export function MusicDirector({ territory }: { territory: number }) {
  const phase = useBattle((s) => s.phase);
  const events = useGame((s) => s.events);
  const lastBlow = useRef(0);
  const seen = useRef(0);

  // a blow struck in this realm (anyone's) starts or keeps the war music going
  useEffect(() => {
    const fresh = events.filter((e) => e.id > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1].id;
    const now = Date.now() / 1000;
    if (fresh.some((e) => e.territory === territory && COMBAT_KINDS.has(e.kind) && now - e.at < 3)) {
      if (!lastBlow.current) playSfx('warhorn', { volume: 0.8 });
      lastBlow.current = performance.now();
      setMusicBed('battle');
    }
  }, [events, territory]);

  // ...and fades out once the fighting has stopped (no melody between fights)
  useEffect(() => {
    lastBlow.current = 0;
    setMusicBed(null);
    const id = setInterval(() => {
      if (lastBlow.current && performance.now() - lastBlow.current > FIGHT_LINGER_MS) {
        lastBlow.current = 0;
        setMusicBed(null);
      }
    }, 500);
    return () => clearInterval(id);
  }, [territory]);

  useEffect(() => {
    if (phase === 'HELD') playSting('victory');
    if (phase === 'FALLEN') {
      const winner = useBattle.getState().entry?.winner;
      const mine = useGame.getState().me?.faction;
      playSting(winner !== undefined && winner === mine ? 'victory' : 'defeat');
    }
  }, [phase]);

  useEffect(() => stopMusic, []);

  return null;
}
