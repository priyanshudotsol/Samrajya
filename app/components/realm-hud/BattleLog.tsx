'use client';

import { useRouter } from 'next/navigation';
import { Play, ScrollText } from 'lucide-react';

import { useBattle } from '@/lib/arena/battleMachine';
import { kingdomInk, territoryShort, ownerShort } from '@/lib/game/factions';
import type { BattleEntry } from '@/lib/game/types';
import { useGame } from '@/lib/store/game';

import { Panel } from './kit';

/** Battle history from `game.battleLog`; click an entry to replay it in its realm. */
export function BattleLog({ territory }: { territory: number }) {
  const game = useGame((s) => s.game);
  const router = useRouter();
  const startReplay = useBattle((s) => s.startReplay);
  const phase = useBattle((s) => s.phase);
  const replaying = useBattle((s) => s.replay);
  if (!game) return null;
  const owner = game.territoryOwner[territory];
  const log = game.battleLog
    .filter((e) => e.territory === territory || e.defender === owner || e.winner === owner || (e.attackersMask & (1 << owner)) !== 0)
    .slice(-10)
    .reverse();

  const open = (e: BattleEntry) => {
    if (e.territory === territory) {
      if (phase === 'IDLE' || replaying) startReplay(e);
    } else {
      router.push(`/kingdom/${e.territory}?replay=${e.epoch}`);
    }
  };

  return (
    <Panel title="Battle log" icon={<ScrollText className="h-3.5 w-3.5" />}>
      {log.length === 0 && <div className="text-xs text-text-secondary">No battles here yet.</div>}
      <div className="space-y-0.5">
        {log.map((e) => {
          const held = e.winner === e.defender;
          return (
            <button
              key={`${e.epoch}-${e.territory}`}
              onClick={() => open(e)}
              title="Replay this battle"
              className="group flex w-full items-center justify-between gap-2 px-1 py-0.5 text-left text-sm hover:bg-background-quaternary"
            >
              <span className="flex items-center gap-1.5 text-text-secondary">
                <Play className="h-3 w-3 opacity-40 group-hover:opacity-100" />E{e.epoch} {territoryShort(e.territory)}
              </span>
              <span>
                {held ? (
                  <>
                    <span style={{ color: kingdomInk(e.defender) }}>{ownerShort(e.defender)}</span>{' '}
                    <span className="text-text-highlight">held</span>
                  </>
                ) : (
                  <>
                    <span style={{ color: kingdomInk(e.winner) }}>{ownerShort(e.winner)}</span>{' '}
                    <span className="text-[var(--color-vermilion)]">✕</span>{' '}
                    <span style={{ color: kingdomInk(e.defender) }}>{ownerShort(e.defender)}</span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
