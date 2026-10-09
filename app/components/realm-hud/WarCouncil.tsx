'use client';

import { useMemo } from 'react';
import { Users } from 'lucide-react';

import { useTactical } from '@/lib/arena/useTactics';
import { kingdomInk, territoryName, territoryShort } from '@/lib/game/factions';
import { DEFEND } from '@/lib/game/types';
import { GEARS, isInside, isMarching, ROLE, ROLES, shortWallet, zoneOf, ZONE_LABEL } from '@/lib/game/units';
import { useGame } from '@/lib/store/game';

import { liveMembership, Panel, useNow } from './kit';

const ROLE_ICON = ['🛡', '⚔', '↔', '🏹'];

/**
 * WAR COUNCIL (docs/KINGDOM_UI.md §11.5): your kingdom's warriors only — who holds which realm,
 * who is marching where, roles and gear — and the resulting plan ("3 hold Hastinapur, 5 on
 * Magadh"). Enemies never see this board.
 */
export function WarCouncil() {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const wallet = useGame((s) => s.wallet);
  const units = useGame((s) => s.units);
  const players = useGame((s) => s.players);
  const tactical = useTactical();
  const now = useNow(1000) / 1000;
  const mem = liveMembership(game, me);
  const myF = mem?.faction ?? null;

  const rows = useMemo(() => {
    if (!game || myF === null) return [];
    return units
      .filter((u) => u.faction === myF)
      .map((u) => {
        const p = players.find((x) => x.wallet === u.wallet);
        const order = p && p.allocEpoch === game.epoch && p.allocTarget !== DEFEND ? p.allocTarget : null;
        const marching = isMarching(u, now);
        return { u, order, marching, where: marching ? u.marchTo! : u.at, inside: !marching && isInside(u.x, u.z) };
      })
      .sort((a, b) => (a.u.wallet === wallet ? -1 : b.u.wallet === wallet ? 1 : a.where - b.where));
  }, [game, myF, units, players, wallet, now]);

  const plan = useMemo(() => {
    if (!game || myF === null) return null;
    const hold = new Map<number, number>();
    const attack = new Map<number, number>();
    for (const r of rows) {
      const owned = game.territoryOwner[r.where] === myF;
      if (owned) hold.set(r.where, (hold.get(r.where) ?? 0) + 1);
      else attack.set(r.where, (attack.get(r.where) ?? 0) + 1);
    }
    const undefended = game.territoryOwner.map((o, t) => (o === myF ? t : -1)).filter((t) => t >= 0 && !rows.some((r) => r.where === t && r.inside));
    return { hold, attack, undefended };
  }, [game, myF, rows]);

  if (!game || myF === null) {
    return (
      <Panel title="War council" icon={<Users className="h-3.5 w-3.5" />}>
        <p className="text-xs text-text-secondary">Pledge to a kingdom to sit at its war council.</p>
      </Panel>
    );
  }
  if (!tactical) {
    return (
      <Panel title="War council" icon={<Users className="h-3.5 w-3.5" />}>
        <p className="text-xs text-text-secondary">Members: {game.factions[myF].members}. Waiting for the others to come online: their warriors appear here as soon as they open the realm.</p>
      </Panel>
    );
  }

  return (
    <Panel title="War council" icon={<Users className="h-3.5 w-3.5" />} right={<span className="text-[10px] tracking-normal normal-case text-text-secondary">{rows.length} warriors · private</span>}>
      {plan && (
        <div className="mb-2 space-y-0.5 text-xs">
          {[...plan.hold.entries()].map(([t, n]) => (
            <div key={`h${t}`} className="flex justify-between">
              <span>
                🛡 Hold <span style={{ color: kingdomInk(myF) }}>{territoryName(t)}</span>
              </span>
              <span className="tabular-nums">{n}</span>
            </div>
          ))}
          {[...plan.attack.entries()].map(([t, n]) => (
            <div key={`a${t}`} className="flex justify-between">
              <span>
                ⚔ On <span style={{ color: kingdomInk(game.territoryOwner[t]) }}>{territoryName(t)}</span>
              </span>
              <span className="tabular-nums">{n}</span>
            </div>
          ))}
          {plan.undefended.length > 0 && (
            <div className="border border-[var(--color-vermilion)]/50 px-1.5 py-0.5 text-[11px] text-[var(--color-vermilion)]">
              Nobody inside the walls of {plan.undefended.map((t) => territoryName(t)).join(', ')} — an enemy can walk in without a fight.
            </div>
          )}
        </div>
      )}
      <div className="max-h-44 space-y-0.5 overflow-y-auto text-[11px]">
        {rows.map(({ u, order, marching, where, inside }) => (
          <div key={u.wallet} className={`flex items-center gap-1 ${u.wallet === wallet ? 'text-text-primary' : 'text-text-secondary'}`}>
            <span title={ROLES[u.role].name}>{ROLE_ICON[u.role]}</span>
            <span className="w-14 truncate font-semibold">{u.wallet === wallet ? 'You' : shortWallet(u.wallet)}</span>
            <span className="w-14 truncate" title={GEARS[u.gear].blurb}>
              {GEARS[u.gear].name}
            </span>
            <span className="flex-1 truncate">
              {marching ? '→ ' : ''}
              <span style={{ color: kingdomInk(game.territoryOwner[where]) }}>{territoryName(where)}</span>
              {!marching && <span className="opacity-70"> · {inside ? 'inside' : ZONE_LABEL[zoneOf(u.x, u.z)].replace('in the ', '').replace('at the ', '')}</span>}
              {order !== null && order !== where && <span className="opacity-70"> · ⚔ {territoryShort(order)}</span>}
            </span>
            <span className="tabular-nums" style={{ color: u.hp > 50 ? '#1c7d45' : u.hp > 25 ? '#a0670a' : '#b3261e' }}>
              {u.hp}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-text-secondary">{ROLES[ROLE.GARRISON].name} warriors inside the walls stop a walk-in capture.</p>
    </Panel>
  );
}
