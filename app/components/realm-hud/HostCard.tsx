'use client';

import { Crown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { lobbyReady } from '@/lib/game/math';
import { shortWallet } from '@/lib/game/units';
import { useGame } from '@/lib/store/game';

import { useHudActions } from './actions-context';
import { Panel, useNow } from './kit';

/**
 * Lobby only. "Start the war" (`start_game`) for the host any time, and for anyone once the lobby
 * timer is over and two kingdoms have members; otherwise it says what the lobby is waiting for.
 */
export function HostCard() {
  const game = useGame((s) => s.game);
  const wallet = useGame((s) => s.wallet);
  const { run, busy, stepLabel } = useHudActions();
  const now = useNow(1000) / 1000;
  if (!game || game.phase !== 'Lobby') return null;
  const isHost = !!wallet && wallet === game.authority;
  const canStart = isHost || lobbyReady(game, now);
  const members = game.factions.reduce((n, f) => n + f.members, 0);
  const left = Math.max(0, Math.ceil(game.epochEndsAt - now));
  const kingdoms = game.factions.filter((f) => f.members > 0).length;
  return (
    <Panel title="The lobby is open" icon={<Crown className="h-3.5 w-3.5" />} highlight>
      <p className="mb-2 text-xs text-text-secondary">
        {members} {members === 1 ? 'warrior has' : 'warriors have'} pledged. Epochs last {game.config.epochSecs} s once the war begins.
      </p>
      {canStart ? (
        <Button
          className="w-full"
          clipCorners="top-left-bottom-right"
          disabled={busy}
          onClick={() => void run('startWar', [], 'The war has begun!')}
        >
          {busy && stepLabel ? stepLabel : 'Start the war'}
        </Button>
      ) : (
        <p className="text-xs text-text-primary">
          {left > 0
            ? `Anyone can start the war in ${left} s`
            : `Anyone can start the war once a second kingdom has members (${kingdoms} so far)`}
          , or the host <span className="font-semibold">{shortWallet(game.authority)}</span> any time.
        </p>
      )}
    </Panel>
  );
}
