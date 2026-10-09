'use client';

import Link from 'next/link';
import { Coins, Hourglass } from 'lucide-react';

import { CountdownTimer } from '@/components/countdown-timer';
import { Branding } from '@/components/header';
import { ConnectWalletButton } from '@/components/wallet';
import { formatSol, totalPot } from '@/lib/game/math';
import { useGame } from '@/lib/store/game';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';

import { WarControl } from './war-control';

/** Header: brand · epoch countdown · total pot · connect wallet. */
export function WorldHeader() {
  const game = useGame((s) => s.game);
  const source = useGame((s) => s.source);

  return (
    <header className="h-[56px] flex items-center gap-6 px-5 border border-border-default bg-background-surface">
      <Link href="/">
        <Branding />
      </Link>

      {game && (
        <div id={TOUR_STEP_IDS.EPOCH_TIMER} className="flex items-center gap-6 ml-4">
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] tracking-[0.2em] text-text-secondary">EPOCH</span>
            <span className="font-clash text-lg text-text-primary tabular-nums">{game.epoch}</span>
          </div>
          {game.phase !== 'Active' ? (
            <WarControl compact />
          ) : game.pendingVrf ? (
            <div className="flex items-center gap-2 text-sm text-text-highlight animate-pulse">
              <Hourglass className="h-4 w-4" /> Battles resolving (VRF)…
            </div>
          ) : (
            <CountdownTimer
              epochDuration={game.config.epochSecs}
              epochStartTime={game.epochEndsAt - game.config.epochSecs}
              label="until the bell"
              endedLabel="The bell tolls…"
            />
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-4">
        {source === 'mock' && (
          <span
            className="text-[10px] tracking-[0.2em] px-2 py-0.5 border border-border-tertiary text-text-secondary"
            title="NEXT_PUBLIC_MOCK=1: bots and battles are simulated in your browser"
          >
            MOCK
          </span>
        )}
        {game && (
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-text-highlight" />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] tracking-[0.2em] text-text-secondary">TOTAL POT</span>
              <span className="font-clash text-lg text-text-highlight tabular-nums">
                ◎ {formatSol(totalPot(game))}
              </span>
            </div>
          </div>
        )}
        <div id={TOUR_STEP_IDS.CONNECT_WALLET}>
          <ConnectWalletButton />
        </div>
      </div>
    </header>
  );
}
