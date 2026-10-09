'use client';

import { Crown, Skull } from 'lucide-react';

import { KINGDOMS, kingdomInk, powersFromMask } from '@/lib/game/factions';
import { formatSol, perMember, totalPot } from '@/lib/game/math';
import { useGame } from '@/lib/store/game';
import { Card, CardContent, CardHeader } from '../ui/card';
import { ClipPathBorder } from '../ui/clippath-border';

const CLIP = 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))';

/** Kingdom standings: territories, then treasury. Adapted from chain-wars' leaderboard. */
export function Leaderboard({ onClick }: { onClick: (kingdomId: number) => void }) {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  if (!game) return null;

  const pot = totalPot(game);
  const rows = game.factions
    .map((f, id) => ({ id, f }))
    .sort((a, b) =>
      b.f.territories !== a.f.territories
        ? b.f.territories - a.f.territories
        : b.f.treasury > a.f.treasury
          ? 1
          : b.f.treasury < a.f.treasury
            ? -1
            : a.id - b.id,
    );

  return (
    <Card className="flex flex-col h-full w-full jaali">
      <CardHeader className="flex-shrink-0">Kingdoms</CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="h-full overflow-y-auto px-2">
          <div className="space-y-3 pb-6 pt-1">
            {rows.map(({ id, f }, rank) => {
              const k = KINGDOMS[id];
              const glow = kingdomInk(id);
              const share = pot === 0n ? 0 : Number((f.treasury * 1000n) / pot) / 10;
              const isMine = me?.faction === id && me.status === 'Active';
              return (
                <div className="w-full relative" key={id}>
                  {!f.alive && (
                    <div className="absolute -top-2 right-6 bg-background-panel px-2 text-xs text-[var(--color-vermilion)] z-10 flex items-center gap-1">
                      <Skull className="h-3 w-3" /> Eliminated
                    </div>
                  )}
                  {isMine && (
                    <div className="absolute -top-2 left-6 bg-background-panel px-2 text-xs text-text-highlight z-10">
                      Your kingdom
                    </div>
                  )}
                  <ClipPathBorder
                    clipPath={CLIP}
                    borderColor={f.alive ? 'var(--color-border-default)' : 'var(--color-border-muted)'}
                    backgroundColor="var(--color-background-panel)"
                    className={`relative w-full hover:cursor-pointer hover:opacity-80 ${f.alive ? '' : 'opacity-50'}`}
                    onClick={() => onClick(id)}
                  >
                    <div className="flex flex-col w-full p-2 gap-1.5">
                      <div className="flex justify-between items-start w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-text-secondary text-xs w-4">#{rank + 1}</span>
                          <span
                            className="h-2.5 w-2.5 rotate-45 shrink-0"
                            style={{ backgroundColor: glow }}
                          />
                          <span className="font-rozha text-base truncate" style={{ color: glow }}>
                            {k.name}
                          </span>
                          {rank === 0 && f.alive && (
                            <Crown className="h-3.5 w-3.5 text-text-highlight shrink-0" />
                          )}
                        </div>
                        <div className="text-text-primary text-sm tabular-nums text-nowrap">
                          ◎ {formatSol(f.treasury)}
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-text-secondary tabular-nums">
                        <span>
                          {f.territories} terr · {f.members} members
                        </span>
                        <span title="Each member's equal share of the treasury">
                          ◎ {f.alive ? formatSol(perMember(f), 3) : '0.000'} each
                        </span>
                      </div>
                      <div className="h-1 w-full bg-background-tertiary">
                        <div
                          className="h-full transition-all duration-700"
                          style={{ width: `${share}%`, backgroundColor: glow }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {powersFromMask(f.powers).map((p) => (
                          <span
                            key={p.bit}
                            title={p.effect}
                            className="text-[10px] px-1.5 py-[1px] border border-border-tertiary text-text-highlight/90"
                          >
                            {p.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </ClipPathBorder>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
