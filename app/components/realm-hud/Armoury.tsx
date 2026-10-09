'use client';

import { Hammer, Shield, Swords } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { kingdomInk, KINGDOMS } from '@/lib/game/factions';
import { conquestBps, formatSol, upgradeBlocker, upgradeBps, upgradeCost } from '@/lib/game/math';
import { MAX_UPGRADE_LEVEL, UPGRADE } from '@/lib/game/types';
import { useGame } from '@/lib/store/game';

import { useHudActions } from './actions-context';
import { liveMembership, Panel, Stat } from './kit';

const ITEMS = [
  { kind: UPGRADE.WALLS, name: 'Stone walls', icon: Shield, effect: 'defense' },
  { kind: UPGRADE.ARMORY, name: 'Armory', icon: Swords, effect: 'attack' },
] as const;

const times = (bps: bigint) => `×${(Number(bps) / 10_000).toFixed(2)}`;

/**
 * ARMOURY: any member spends kingdom treasury on walls (defense) or the armory (attack), one
 * purchase per kingdom per epoch. The SOL goes to the plains pot. Also shows the conquest bonus
 * every territory beyond the first adds.
 */
export function Armoury() {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const { run, busy } = useHudActions();
  const mem = liveMembership(game, me);
  if (!game || !mem || game.phase === 'Ended') return null;
  const fi = mem.faction;
  const f = game.factions[fi];
  const cfg = game.config;
  const boughtThisEpoch = f.upgradedEpoch === game.epoch && game.phase === 'Active';

  return (
    <Panel title="Armoury" icon={<Hammer className="h-3.5 w-3.5" />}>
      <p className="mb-2 text-xs text-text-secondary">
        Spend the <span style={{ color: kingdomInk(fi) }}>{KINGDOMS[fi].name}</span> treasury to hit harder. Any member may buy,
        once per epoch for the kingdom. The SOL goes to the plains pot.
      </p>
      <div className="space-y-2">
        {ITEMS.map(({ kind, name, icon: Icon, effect }) => {
          const level = f.upgrades[kind] ?? 0;
          const maxed = level >= MAX_UPGRADE_LEVEL;
          const cost = upgradeCost(f, kind, cfg);
          const why = upgradeBlocker(game, fi, kind);
          return (
            <div key={kind} className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-text-highlight" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-sm text-text-primary">
                  {name} <span className="text-xs text-text-secondary">lvl {level}/{MAX_UPGRADE_LEVEL}</span>
                </div>
                <div className="text-[11px] text-text-secondary tabular-nums">
                  {effect} {times(upgradeBps(f, kind, cfg))}
                  {!maxed && ` → ×${((10_000 + cfg.upgradeBonusBps * (level + 1)) / 10_000).toFixed(2)}`}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !!why}
                title={why ?? `Costs ${formatSol(cost, 3)} ◎ of the treasury`}
                onClick={() => void run('upgrade', [kind], `${name} raised to level ${level + 1}`)}
              >
                {maxed ? 'Max' : `${formatSol(cost, 3)} ◎`}
              </Button>
            </div>
          );
        })}
      </div>
      {boughtThisEpoch && <p className="mt-2 text-[11px] text-text-secondary">Your kingdom already bought an upgrade this epoch.</p>}
      <div className="mt-2 border-t border-border-muted pt-2">
        <Stat label="Conquest might" title={`+${cfg.conquestBonusBps / 100}% attack and defense per territory held beyond the first`}>
          {times(conquestBps(f, cfg))} <span className="text-text-secondary">({f.territories} held)</span>
        </Stat>
      </div>
    </Panel>
  );
}
