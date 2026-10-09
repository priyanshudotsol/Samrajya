'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { currentMock, postChat } from '@/lib/mock/mockGame';
import { isMockMode, useGame } from '@/lib/store/game';

import type { ChatMessage, ChatRoom } from './types';

/**
 * The viewer's kingdom chat room (docs/ARCHITECTURE.md §10.5). Mock: the in-memory room of the
 * viewer's faction. Chain: Supabase Realtime, joined with a membership-gated token (see
 * lib/chat/supabase.ts); unavailable until NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are set.
 */
export function useChat(): ChatRoom & { faction: number | null } {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const wallet = useGame((s) => s.wallet);
  const allChat = useGame((s) => s.chat);
  const faction = me && me.status === 'Active' && game && me.generation === game.factions[me.faction]?.generation ? me.faction : null;
  const gameId = game?.gameId ?? 0;
  const mock = isMockMode();

  // --- Supabase (chain mode) ----------------------------------------------------------------
  const [remote, setRemote] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatRoom['status']>(mock ? 'ready' : 'connecting');
  const [reason, setReason] = useState<string | undefined>(undefined);
  const roomRef = useRef<import('./supabase').SupabaseRoom | null>(null);

  useEffect(() => {
    if (mock || faction === null || !wallet) {
      if (!mock) {
        setStatus('unavailable');
        setReason(faction === null ? 'Pledge to a kingdom to enter its war council.' : undefined);
      }
      return;
    }
    let live = true;
    setStatus('connecting');
    void (async () => {
      try {
        const { openRoom } = await import('./supabase');
        const room = await openRoom({ gameId, faction, wallet, onMessage: (m) => live && setRemote((xs) => [...xs.slice(-199), m]) });
        if (!live) {
          room.close();
          return;
        }
        roomRef.current = room;
        setRemote(room.history);
        setStatus('ready');
        setReason(undefined);
      } catch (e) {
        if (!live) return;
        setStatus('unavailable');
        setReason(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
      roomRef.current?.close();
      roomRef.current = null;
    };
  }, [mock, faction, wallet, gameId]);

  const messages = useMemo(() => {
    if (mock) return faction === null ? [] : allChat.filter((m) => m.faction === faction && m.gameId === gameId);
    return remote;
  }, [mock, allChat, faction, gameId, remote]);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim().slice(0, 280);
      if (!t || faction === null || !wallet) return;
      if (mock) {
        const m = currentMock();
        if (!m) throw new Error('The mock game is not running');
        postChat(m.state, faction, wallet, t);
        m.emit();
        return;
      }
      if (!roomRef.current) throw new Error('Chat is not connected');
      await roomRef.current.send(t);
    },
    [mock, faction, wallet],
  );

  return { messages, send, status: mock ? (faction === null ? 'unavailable' : 'ready') : status, reason: mock && faction === null ? 'Pledge to a kingdom to enter its war council.' : reason, faction };
}
