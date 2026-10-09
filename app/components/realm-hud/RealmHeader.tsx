'use client';

import Link from 'next/link';
import { ArrowLeft, Sun } from 'lucide-react';

import { CountdownTimer } from '@/components/countdown-timer';
import { ConnectWalletButton } from '@/components/wallet';
import { WarControl } from '@/components/world/war-control';
import { KINGDOMS, kingdomInk, PLAINS_INFO, powersFromMask } from '@/lib/game/factions';
import { NEUTRAL, PLAINS } from '@/lib/game/types';
import { useGame } from '@/lib/store/game';

import { useNow } from './kit';

/** Small sun dial: the sun slides towards dusk as the epoch runs out. */
function SunDial({ progress, red }: { progress: number; red: boolean }) {
  return (
    <div className="relative h-3 w-28" title="Epoch progress — dusk is the bell">
      <div
        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
        style={{ background: 'linear-gradient(90deg, #f3e4c2, #f08a4b 70%, #c2361f)' }}
      />
      <Sun
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
        style={{ left: `${progress * 100}%`, color: red ? '#e2483c' : '#e3c15a' }}
      />
    </div>
  );
}

export function RealmHeader({ territory, compact = false }: { territory: number; compact?: boolean }) {
  const game = useGame((s) => s.game);
  const now = useNow(500);
  if (!game) return null;
  const owner = game.territoryOwner[territory];
  const plains = territory === PLAINS;
  const k = KINGDOMS[territory];
  const powers = owner === NEUTRAL ? [] : powersFromMask(game.factions[owner].powers);
  const remaining = game.epochEndsAt - now / 1000;
  const progress = game.pendingVrf ? 1 : Math.min(1, Math.max(0, 1 - remaining / game.config.epochSecs));

  return (
    <header className="pointer-events-auto flex flex-wrap items-center gap-x-5 gap-y-1 border border-border-default bg-background-panel/90 px-4 py-2 backdrop-blur-sm">
      <Link href="/" className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-highlight" title="World map (Esc)">
        <ArrowLeft className="h-4 w-4" /> World
      </Link>
      <div className="flex items-baseline gap-2">
        <h1 className="font-rozha text-2xl leading-none md:text-3xl" style={{ color: kingdomInk(owner) }}>
          {plains ? PLAINS_INFO.name.toUpperCase() : KINGDOMS[owner].name.toUpperCase()}
        </h1>
        {plains ? (
          <span className="text-xs text-text-secondary">
            {owner === NEUTRAL ? (
              'unclaimed · stand in the stone circle to claim it'
            ) : (
              <>
                held by <span style={{ color: kingdomInk(owner) }}>{KINGDOMS[owner].name}</span> · it holds while one of them stands here
              </>
            )}
          </span>
        ) : owner !== territory && (
          <span className="text-xs text-text-secondary">
            conquered <span style={{ color: kingdomInk(territory) }}>{k.name}</span>
          </span>
        )}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-1">
          {powers.map((p) => (
            <span key={p.bit} title={p.effect} className="border border-border-tertiary px-2 py-0.5 text-[11px] text-text-highlight">
              {p.name}
            </span>
          ))}
        </div>
      )}
      <div className="ml-auto flex items-center gap-4">
        <span className="text-sm text-text-secondary">Epoch {game.epoch}</span>
        {game.phase === 'Active' && !game.pendingVrf && (
          <CountdownTimer
            epochDuration={game.config.epochSecs}
            epochStartTime={game.epochEndsAt - game.config.epochSecs}
            label="until the bell"
            endedLabel="The bell tolls…"
          />
        )}
        {game.pendingVrf && <span className="animate-pulse text-sm text-text-highlight">Battles resolving…</span>}
        {game.phase === 'Ended' && <WarControl compact />}
        {!compact && <SunDial progress={progress} red={game.phase === 'Active' && (remaining <= 10 || game.pendingVrf)} />}
        <ConnectWalletButton />
      </div>
    </header>
  );
}
