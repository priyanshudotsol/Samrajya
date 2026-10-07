'use client';

import { KINGDOMS, kingdomGlow } from '@/lib/game/factions';
import { battleOdds, isContested } from '@/lib/game/math';
import { useGame } from '@/lib/store/game';

import { pct } from './kit';

/** Stacked bar of D vs each A_i for the battle at this territory (live). */
export function OddsBar({ territory }: { territory: number }) {
  const game = useGame((s) => s.game);
  if (!game) return null;
  const owner = game.territoryOwner[territory];
  if (!isContested(game, territory)) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-text-secondary">
        <span className="tracking-[0.2em] text-text-highlight">ODDS</span>
        <div className="h-2.5 flex-1" style={{ background: kingdomGlow(owner), opacity: 0.35 }} />
        <span>No battle at {KINGDOMS[territory].short} this epoch</span>
      </div>
    );
  }
  const o = battleOdds(game, territory);
  const parts = [
    { f: owner, p: o.pDefend, label: `${KINGDOMS[owner].short} defend` },
    ...o.pWin.map((p, i) => ({ f: i, p, label: KINGDOMS[i].short })).filter((x) => x.f !== owner && x.p > 0),
  ];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
      <span className="tracking-[0.2em] text-text-highlight">ODDS</span>
      <div className="flex h-4 flex-1 overflow-hidden border border-border-tertiary">
        {parts.map((x) => (
          <div
            key={x.f}
            className="flex h-full items-center overflow-hidden whitespace-nowrap px-1 text-[10px] font-semibold text-black/80 transition-all duration-500"
            style={{ width: `${x.p * 100}%`, background: kingdomGlow(x.f) }}
            title={`${x.label} ${pct(x.p, 1)}`}
          >
            {x.p > 0.12 ? `${x.label} ${pct(x.p)}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
