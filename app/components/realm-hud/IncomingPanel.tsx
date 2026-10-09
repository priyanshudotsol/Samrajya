'use client';

import { AlertTriangle, Swords } from 'lucide-react';

import { KINGDOMS, kingdomInk, territoryName } from '@/lib/game/factions';
import { attackPower, effectiveAllocs, formatSol } from '@/lib/game/math';
import { useRealmUi } from '@/lib/realm/ui-store';
import { useGame } from '@/lib/store/game';

import { Panel } from './kit';

/** Live list of attackers at this territory (and our own outgoing columns). */
export function IncomingPanel({ territory }: { territory: number }) {
  const game = useGame((s) => s.game);
  const focus = useRealmUi((s) => s.focus);
  const setFocus = useRealmUi((s) => s.setFocus);
  if (!game) return null;
  const owner = game.territoryOwner[territory];
  const eff = effectiveAllocs(game);
  const incoming = game.factions
    .map((f, i) => ({ i, amount: eff[i][territory], alive: f.alive }))
    .filter((x) => x.i !== owner && x.alive && x.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : -1));
  const outgoing = eff[owner]
    .map((amount, t) => ({ t, amount }))
    .filter((x) => x.amount > 0n && game.territoryOwner[x.t] !== owner);

  return (
    <Panel title="Incoming" icon={<AlertTriangle className="h-3.5 w-3.5" />} highlight={focus?.kind === 'camp'}>
      {incoming.length === 0 ? (
        <div className="text-xs text-text-secondary">No enemies at the gates.</div>
      ) : (
        <div className="space-y-1">
          {incoming.map((x) => (
            <button
              key={x.i}
              onClick={() => setFocus({ kind: 'camp', faction: x.i })}
              className={`flex w-full items-center justify-between text-left text-sm ${focus?.kind === 'camp' && focus.faction === x.i ? 'underline' : ''}`}
            >
              <span style={{ color: kingdomInk(x.i) }}>{KINGDOMS[x.i].name}</span>
              <span className="tabular-nums" title="committed SOL (attack power incl. powers)">
                ◎ {formatSol(x.amount)}{' '}
                <span className="text-xs text-text-secondary">⚔ {formatSol(attackPower(game, x.i, territory))}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <h3 className="mt-3 mb-1 flex items-center gap-2 text-[11px] tracking-[0.2em] text-text-highlight">
        <Swords className="h-3.5 w-3.5" /> MARCHING
      </h3>
      {outgoing.length === 0 ? (
        <div className="text-xs text-text-secondary">All strength defends home.</div>
      ) : (
        outgoing.map((x) => (
          <div key={x.t} className="flex justify-between text-sm">
            <span style={{ color: kingdomInk(game.territoryOwner[x.t]) }}>→ {territoryName(x.t)}</span>
            <span className="tabular-nums">◎ {formatSol(x.amount)}</span>
          </div>
        ))
      )}
    </Panel>
  );
}
