'use client';

import { useTactics } from '@/lib/arena/useTactics';
import { KINGDOMS, kingdomInk } from '@/lib/game/factions';
import { battleOdds, isContested } from '@/lib/game/math';
import { PLAINS } from '@/lib/game/types';
import { useGame } from '@/lib/store/game';

import { pct } from './kit';

/** Stacked bar of D vs each A_i for the battle at this territory (live). */
export function OddsBar({ territory }: { territory: number }) {
  const game = useGame((s) => s.game);
  const tactics = useTactics(territory);
  if (!game) return null;
  const owner = game.territoryOwner[territory];
  if (!isContested(game, territory)) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-text-secondary">
        <span className="tracking-[0.2em] text-text-highlight">ODDS</span>
        <div className="h-2.5 flex-1" style={{ background: kingdomInk(owner), opacity: 0.35 }} />
        <span>No battle at {KINGDOMS[territory].short} this epoch</span>
      </div>
    );
  }
  if (tactics && territory !== PLAINS) {
    // a walled realm is decided by the hand fight alone (ARCHITECTURE §10.8)
    const inside = tactics.heads.defendersInside;
    const attackers = tactics.heads.attackers.reduce((a, b) => a + b, 0);
    const taker = tactics.capturedBy;
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
        <span className="tracking-[0.2em] text-text-highlight">FIGHT</span>
        <span className="whitespace-nowrap text-text-secondary">
          🛡 {inside} inside the walls · ⚔ {attackers} at {KINGDOMS[territory].short}
        </span>
        <span className="truncate font-semibold" style={{ color: kingdomInk(taker ?? owner) }}>
          {taker !== null
            ? `FORT CLEARED — ${KINGDOMS[taker].short} takes it at the bell`
            : inside > 0
              ? `${KINGDOMS[owner].short} holds while ${inside} defender${inside === 1 ? '' : 's'} stand${inside === 1 ? 's' : ''} inside`
              : `Walls empty — an attacker at the gate takes it`}
        </span>
      </div>
    );
  }
  const o = battleOdds(game, territory, undefined, tactics);
  const walkIn = tactics?.capturedBy !== null && tactics?.capturedBy !== undefined && o.pWin[tactics.capturedBy] >= 0.999;
  const parts = [
    { f: owner, p: o.pDefend, label: `${KINGDOMS[owner].short} defend` },
    ...o.pWin.map((p, i) => ({ f: i, p, label: KINGDOMS[i].short })).filter((x) => x.f !== owner && x.p > 0),
  ];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
      <span className="tracking-[0.2em] text-text-highlight">ODDS</span>
      {tactics && (
        <span className="whitespace-nowrap text-[10px] text-text-secondary" title="Warriors inside the walls / attackers present. Tactics scale the strengths before the roll.">
          🛡 {tactics.heads.defendersInside}
          {tactics.heads.attackers.some((n) => n > 0) && <> · ⚔ {tactics.heads.attackers.reduce((a, b) => a + b, 0)}</>}
          {walkIn && <span className="ml-1 text-[var(--color-vermilion)]">WALLS ABANDONED</span>}
        </span>
      )}
      <div className="flex h-4 flex-1 overflow-hidden border border-border-tertiary">
        {parts.map((x) => (
          <div
            key={x.f}
            className="flex h-full items-center overflow-hidden whitespace-nowrap px-1 text-[10px] font-semibold text-black/80 transition-all duration-500"
            style={{ width: `${x.p * 100}%`, background: kingdomInk(x.f) }}
            title={`${x.label} ${pct(x.p, 1)}`}
          >
            {x.p > 0.12 ? `${x.label} ${pct(x.p)}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
