'use client';

import { Loader2, Shield, Swords } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { KINGDOMS, kingdomInk, territoryName, territoryShort, ownerShort } from '@/lib/game/factions';
import { battleOdds, formatSol, isContested } from '@/lib/game/math';
import { useTactical } from '@/lib/arena/useTactics';
import { PLAINS, type BattleEntry } from '@/lib/game/types';
import { useGame } from '@/lib/store/game';

const pct = (p: number) => `${Math.round(p * 100)}%`;

function Name({ id }: { id: number }) {
  return (
    <span className="font-medium" style={{ color: kingdomInk(id) }}>
      {ownerShort(id)}
    </span>
  );
}

function ResultRow({ e }: { e: BattleEntry }) {
  const held = e.winner === e.defender;
  const attackers = KINGDOMS.filter((k) => (e.attackersMask & (1 << k.id)) !== 0).map((k) => k.id);
  const roll = e.total === 0n ? 0 : Number((e.roll * 1000n) / e.total) / 1000;
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border-muted last:border-0">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5">
          <span className="text-text-secondary">{territoryName(e.territory)}</span>
        </span>
        <span
          className={`text-xs font-semibold tracking-wider ${held ? 'text-text-highlight' : 'text-[var(--color-vermilion)]'}`}
        >
          {held ? 'HELD' : 'FALLEN'}
        </span>
      </div>
      <div className="text-xs text-text-secondary">
        {held ? (
          <>
            <Name id={e.defender} /> repelled{' '}
            {attackers.map((a, i) => (
              <span key={a}>
                {i > 0 && ', '}
                <Name id={a} />
              </span>
            ))}
          </>
        ) : (
          <>
            <Name id={e.winner} /> took it from <Name id={e.defender} />
          </>
        )}
        <span className="float-right tabular-nums" title="VRF roll / total strength">
          roll {roll.toFixed(3)}
        </span>
      </div>
    </div>
  );
}

/** Right panel: live battles this epoch + last epoch results. */
export function BattlesPanel() {
  const game = useGame((s) => s.game);
  // warriors tracked → walled realms are decided by the hand fight, not dice (§10.8)
  const byFight = useTactical();
  if (!game) return null;

  const live = game.territoryOwner.map((_, t) => t).filter((t) => isContested(game, t));
  const lastEpoch = game.battleLog.length ? game.battleLog[game.battleLog.length - 1].epoch : null;
  const last = game.battleLog.filter((e) => e.epoch === lastEpoch);
  const earlier = game.battleLog.filter((e) => e.epoch !== lastEpoch).slice(-6).reverse();

  return (
    <Card orientation="right" className="flex flex-col h-full w-full jaali">
      <CardHeader orientation="right" className="flex-shrink-0">
        War Room
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">
        <h3 className="flex items-center gap-2 text-xs tracking-[0.2em] text-text-highlight mb-2">
          <Swords className="h-3.5 w-3.5" /> LIVE BATTLES
        </h3>
        {game.pendingVrf && (
          <div className="flex items-center gap-2 text-xs text-text-highlight mb-2 animate-pulse">
            <Loader2 className="h-3 w-3 animate-spin" /> The oracle rolls the dice…
          </div>
        )}
        {live.length === 0 && !game.pendingVrf && (
          <div className="text-xs text-text-secondary mb-3">No marches yet this epoch.</div>
        )}
        <div className="space-y-3 mb-5">
          {live.map((t) => {
            const odds = battleOdds(game, t);
            return (
              <div key={t} className="border border-border-default bg-background-panel/80 p-2">
                <div className="flex justify-between items-center text-sm mb-1">
                  <span className="font-rozha" style={{ color: kingdomInk(odds.defender) }}>
                    {territoryName(t)}
                  </span>
                  <span className="text-xs text-text-secondary flex items-center gap-1">
                    {byFight && t !== PLAINS ? (
                      <>
                        <Swords className="h-3 w-3" /> the fight decides
                      </>
                    ) : (
                      <>
                        <Shield className="h-3 w-3" /> {pct(odds.pDefend)} hold
                      </>
                    )}
                  </span>
                </div>
                {/* odds bar */}
                <div className="flex h-1.5 w-full overflow-hidden mb-1.5">
                  {odds.pWin.map((p, i) =>
                    p > 0 ? (
                      <div
                        key={i}
                        className="h-full transition-all duration-500"
                        style={{ width: `${p * 100}%`, backgroundColor: kingdomInk(i) }}
                      />
                    ) : null,
                  )}
                </div>
                <div className="text-xs text-text-secondary space-y-0.5">
                  {odds.attacks.map((a, i) =>
                    a > 0n ? (
                      <div key={i} className="flex justify-between tabular-nums">
                        <span>
                          <Name id={i} /> → strength {formatSol(a)}
                        </span>
                        {!(byFight && t !== PLAINS) && <span>{pct(odds.pWin[i])}</span>}
                      </div>
                    ) : null,
                  )}
                  <div className="flex justify-between tabular-nums">
                    <span>
                      <Name id={odds.defender} /> defends {formatSol(odds.defense)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="text-xs tracking-[0.2em] text-text-highlight mb-1">
          LAST EPOCH {lastEpoch !== null && <span className="text-text-secondary">· E{lastEpoch}</span>}
        </h3>
        {last.length === 0 ? (
          <div className="text-xs text-text-secondary mb-4">No battles fought yet.</div>
        ) : (
          <div className="mb-4">
            {last.map((e) => (
              <ResultRow key={`${e.epoch}-${e.territory}`} e={e} />
            ))}
          </div>
        )}

        {earlier.length > 0 && (
          <>
            <h3 className="text-xs tracking-[0.2em] text-text-secondary mb-1">CHRONICLE</h3>
            {earlier.map((e) => (
              <div
                key={`${e.epoch}-${e.territory}`}
                className="flex justify-between text-xs text-text-secondary py-0.5"
              >
                <span>
                  E{e.epoch} {territoryShort(e.territory)}
                </span>
                <span>
                  {e.winner === e.defender ? (
                    <>
                      <Name id={e.defender} /> held
                    </>
                  ) : (
                    <>
                      <Name id={e.winner} /> took
                    </>
                  )}
                </span>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
