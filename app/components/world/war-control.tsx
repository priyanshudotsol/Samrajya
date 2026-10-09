'use client';

import { useEffect, useState } from 'react';
import { Flag, Swords } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useGameActions } from '@/lib/actions';
import { KINGDOMS, kingdomInk } from '@/lib/game/factions';
import { lobbyReady } from '@/lib/game/math';
import { useGame } from '@/lib/store/game';

function useNow() {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * What to do between wars: open the next war once one has ended (anyone may), and close the
 * lobby once its timer is over (anyone may; the host any time). `compact` fits the header.
 */
export function WarControl({ compact = false }: { compact?: boolean }) {
  const game = useGame((s) => s.game);
  const wallet = useGame((s) => s.wallet);
  const { actions, busy, stepLabel, connected } = useGameActions();
  const now = useNow();
  if (!game) return null;

  const call = async (fn: () => Promise<void>, ok: string) => {
    if (!actions) {
      toast.error('Connect your wallet first');
      return;
    }
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  if (game.phase === 'Ended') {
    const w = game.winner;
    return (
      <div className={compact ? 'flex items-center gap-3' : 'flex flex-col items-center gap-2'}>
        <span className="text-sm text-text-highlight">
          War {game.gameId} won by{' '}
          <b style={{ color: w !== null ? kingdomInk(w) : undefined }}>{w !== null ? KINGDOMS[w].name : '—'}</b>
        </span>
        <Button
          size={compact ? 'sm' : 'lg'}
          clipCorners="top-left-bottom-right"
          disabled={busy || !connected}
          title={connected ? 'Anyone can open the next war' : 'Connect a wallet to open the next war'}
          onClick={() => void call(() => actions!.newWar(), 'A new war is open. Pick a kingdom!')}
        >
          <Flag /> {busy && stepLabel ? stepLabel : 'Start a new war'}
        </Button>
      </div>
    );
  }

  if (game.phase === 'Lobby') {
    const host = !!wallet && wallet === game.authority;
    const ready = lobbyReady(game, now);
    const left = Math.max(0, Math.ceil(game.epochEndsAt - now));
    const kingdoms = game.factions.filter((f) => f.members > 0).length;
    const why = left > 0 ? `the war can start in ${left} s` : kingdoms < 2 ? 'waiting for a second kingdom to have members' : 'ready';
    return (
      <div className={compact ? 'flex items-center gap-3' : 'flex flex-col items-center gap-2'}>
        <span className="text-sm text-text-secondary">Lobby · {why}</span>
        {(ready || host) && (
          <Button
            size={compact ? 'sm' : 'lg'}
            clipCorners="top-left-bottom-right"
            disabled={busy || !connected}
            onClick={() => void call(() => actions!.startWar(), 'The war has begun!')}
          >
            <Swords /> {busy && stepLabel ? stepLabel : 'Start the war'}
          </Button>
        )}
      </div>
    );
  }
  return null;
}
