'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConnectWalletButton } from '@/components/wallet';
import { KINGDOMS, kingdomGlow } from '@/lib/game/factions';
import { formatSol, lamportsToSol, solToLamports } from '@/lib/game/math';
import { useGame } from '@/lib/store/game';

import { useHudActions } from './actions-context';
import { liveMembership, Panel } from './kit';

/** Shown when the viewer has no live shares: pledge SOL to this realm's owner. */
export function JoinCard({ territory }: { territory: number }) {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const { run, busy, stepLabel, connected } = useHudActions();
  const minSol = game ? lamportsToSol(game.config.minStake) : 0.05;
  const [amount, setAmount] = useState(String(Math.max(minSol, 0.1)));
  if (!game || liveMembership(game, me)) return null;

  const owner = game.territoryOwner[territory];
  const k = KINGDOMS[owner];
  const sol = Number(amount);
  const lamports = Number.isFinite(sol) && sol > 0 ? solToLamports(sol) : 0n;
  const tooSmall = lamports < game.config.minStake;
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
        Your SOL joins the <span style={{ color: kingdomGlow(owner) }}>{k.name}</span> treasury; your shares rise and fall with it.
        Minimum {formatSol(game.config.minStake)} ◎.
      </p>
      {ended ? (
        <p className="text-sm text-text-highlight">The war is over. A new one begins soon.</p>
      ) : !connected ? (
        <ConnectWalletButton />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={minSol}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-8 tabular-nums"
              aria-label="SOL to pledge"
            />
            <span className="text-sm text-text-secondary">◎</span>
          </div>
          <Button
            className="mt-2 w-full"
            clipCorners="top-left-bottom-right"
            disabled={busy || tooSmall || !game.factions[owner].alive}
            onClick={() => void run('pledge', [owner, lamports], `You pledged ${formatSol(lamports)} ◎ to ${k.name}`)}
          >
            {busy && stepLabel ? stepLabel : `Pledge to ${k.name}`}
          </Button>
          {tooSmall && <p className="mt-1 text-[11px] text-[var(--color-vermilion)]">At least {formatSol(game.config.minStake)} ◎.</p>}
        </>
      )}
    </Panel>
  );
}
