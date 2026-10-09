'use client';

import { Flag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConnectWalletButton } from '@/components/wallet';
import { KINGDOMS, kingdomInk } from '@/lib/game/factions';
import { formatSol } from '@/lib/game/math';
import { useGame } from '@/lib/store/game';

import { useHudActions } from './actions-context';
import { liveMembership, Panel } from './kit';

/** Shown when the viewer has no live shares: pay the ticket to join this realm's owner. */
export function JoinCard({ territory }: { territory: number }) {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const { run, busy, stepLabel, connected } = useHudActions();
  if (!game || liveMembership(game, me)) return null;

  const owner = game.territoryOwner[territory];
  const k = KINGDOMS[owner];
  const f = game.factions[owner];
  const ticket = game.config.ticket;
  // every member's equal share right after you join
  const share = (f.treasury + ticket) / BigInt(f.members + 1);
  const ended = game.phase === 'Ended';
  const wasMember = me && me.shares > 0n && me.generation !== game.factions[me.faction]?.generation;

  return (
    <Panel title={`Pledge to ${k.name}`} icon={<Flag className="h-3.5 w-3.5" />}>
      {wasMember && (
        <p className="mb-2 text-xs text-[var(--color-vermilion)]">
          {KINGDOMS[me!.faction].name} was eliminated — your old shares are worth 0. Pledge again to fight on.
        </p>
      )}
      <p className="mb-2 text-xs text-text-secondary">
        Everyone enters with the same ticket, <b className="text-text-primary tabular-nums">{formatSol(ticket, 3)} ◎</b>, and every member owns an
        equal share of the <span style={{ color: kingdomInk(owner) }}>{k.name}</span> treasury. Today your share would be worth{' '}
        <b className="text-text-primary tabular-nums">{formatSol(share, 3)} ◎</b> ({f.members + 1} members).
      </p>
      {ended ? (
        <p className="text-sm text-text-highlight">This war is over. Open the next one from the world map.</p>
      ) : !connected ? (
        <ConnectWalletButton />
      ) : (
        <Button
          className="mt-1 w-full"
          clipCorners="top-left-bottom-right"
          disabled={busy || !f.alive}
          onClick={() => void run('pledge', [owner, ticket], `You joined ${k.name} for ${formatSol(ticket, 3)} ◎`)}
        >
          {busy && stepLabel ? stepLabel : `Join ${k.name} · ${formatSol(ticket, 3)} ◎`}
        </Button>
      )}
    </Panel>
  );
}
