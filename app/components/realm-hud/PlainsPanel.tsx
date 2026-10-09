'use client';

import { Flag } from 'lucide-react';

import { KINGDOMS, kingdomInk, PLAINS_INFO } from '@/lib/game/factions';
import { formatSol } from '@/lib/game/math';
import { NEUTRAL, PLAINS } from '@/lib/game/types';
import { inCircle, isMarching } from '@/lib/game/units';
import { useGame } from '@/lib/store/game';

import { Panel, useNow } from './kit';

/**
 * Kurukshetra, the plains in the middle (ARCHITECTURE §10.11): who holds it, the pot it pays, who
 * stands on the field and in the stone circle right now, and how it is taken.
 */
export function PlainsPanel() {
  const game = useGame((s) => s.game);
  const units = useGame((s) => s.units);
  const now = useNow(500) / 1000;
  if (!game) return null;
  const holder = game.territoryOwner[PLAINS];
  const here = units.filter((u) => u.at === PLAINS && u.hp > 0 && !isMarching(u, now));
  const byKingdom = KINGDOMS.map((k, f) => ({
    k,
    f,
    field: here.filter((u) => u.faction === f).length,
    circle: here.filter((u) => u.faction === f && inCircle(u.x, u.z)).length,
    attacking: game.factions[f].attackAlloc[PLAINS] > 0n,
  })).filter((r) => r.field > 0 || r.attacking || r.f === holder);

  return (
    <Panel title={PLAINS_INFO.name} icon={<Flag className="h-3.5 w-3.5" />}>
      <p className="mb-2 text-xs text-text-secondary">{PLAINS_INFO.epithet}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-text-secondary">Held by</span>
          <span style={{ color: kingdomInk(holder) }}>{holder === NEUTRAL ? 'Nobody yet' : KINGDOMS[holder].name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Plains pot (paid each epoch)</span>
          <span className="tabular-nums">{formatSol(game.plainsPot)} ◎</span>
        </div>
      </div>
      {byKingdom.length > 0 && (
        <div className="mt-3 space-y-0.5 text-xs">
          <div className="flex justify-between text-[10px] tracking-[0.15em] text-text-highlight">
            <span>ON THE FIELD</span>
            <span>FIELD · CIRCLE</span>
          </div>
          {byKingdom.map((r) => (
            <div key={r.f} className="flex justify-between">
              <span style={{ color: kingdomInk(r.f) }}>
                {r.k.name}
                {r.f === holder ? ' (holder)' : r.attacking ? ' (attacking)' : ''}
              </span>
              <span className="tabular-nums">
                {r.field} · {r.circle}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 border-t border-border-muted pt-2 text-[11px] text-text-secondary">
        No walls here. The holder keeps Kurukshetra while one of its members stands alive on the plains. Kill them all, then stand in
        the stone circle with an attack order: it is yours at once (and at the bell, the kingdom with the most warriors in the circle
        takes it).
      </p>
    </Panel>
  );
}
