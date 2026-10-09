'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

import { isMockMode, useGame } from '@/lib/store/game';

export type FieldStatus = 'off' | 'connecting' | 'live' | 'error';

/** The battlefield connection, for the HUD. */
export const useFieldStatus = create<{ status: FieldStatus; error?: string }>(() => ({ status: 'off' }));
const setState = (s: { status: FieldStatus; error?: string }) => useFieldStatus.setState(s, true);

/**
 * Joins the war's shared battlefield (lib/multiplayer/field.ts) while the viewer is a member, so
 * every member's warrior shows up and moves in everyone's realm. Off in the mock (bots are local).
 */
export function useFieldSync(): { status: FieldStatus; error?: string } {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const wallet = useGame((s) => s.wallet);
  const faction = me && me.status === 'Active' && game && me.generation === game.factions[me.faction]?.generation ? me.faction : null;
  const gameId = game?.gameId ?? null;
  // the shared Supabase field is for the lobby; during the war the ER is the battlefield
  const onER = useGame((s) => s.onER);

  useEffect(() => {
    if (isMockMode() || faction === null || !wallet || gameId === null || onER) {
      setState({ status: 'off' });
      return;
    }
    let live = true;
    let leave: (() => void) | null = null;
    setState({ status: 'connecting' });
    void import('./field')
      .then(({ joinField }) => joinField({ gameId, faction, wallet }))
      .then((stop) => {
        if (!live) return stop();
        leave = stop;
        setState({ status: 'live' });
        console.info('[samrajya field] joined the battlefield of war', gameId);
      })
      .catch((e) => {
        console.warn('[samrajya field] could not join the battlefield:', e);
        if (live) setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      live = false;
      leave?.();
    };
  }, [faction, wallet, gameId, onER]);

  return useFieldStatus();
}
