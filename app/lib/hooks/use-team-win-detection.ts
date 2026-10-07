'use client';

import { useCallback, useMemo, useState } from 'react';

import { totalPot } from '@/lib/game/math';
import { useGame } from '@/lib/store/game';

export type TeamWinData = {
  winner: number;
  gameId: number;
  epoch: number;
  /** Winner treasury = the whole pot split by shares. */
  pot: bigint;
  territories: number;
  eliminated: number[];
};

/** Detects `phase == Ended` in the store and exposes the victory data once per game. */
export function useTeamWinDetection() {
  const game = useGame((s) => s.game);
  const [shownFor, setShownFor] = useState<number | null>(null);

  const teamWinData = useMemo<TeamWinData | null>(() => {
    if (!game || game.phase !== 'Ended' || game.winner === null) return null;
    return {
      winner: game.winner,
      gameId: game.gameId,
      epoch: game.epoch,
      pot: totalPot(game),
      territories: game.territoryOwner.length,
      eliminated: game.factions.map((_, i) => i).filter((i) => i !== game.winner),
    };
    // Only recompute when the game ends / restarts, not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.gameId, game?.phase, game?.winner]);

  const markWinModalAsShown = useCallback(() => {
    if (teamWinData) setShownFor(teamWinData.gameId);
  }, [teamWinData]);

  return {
    teamWinData,
    hasShownWinModal: teamWinData !== null && shownFor === teamWinData.gameId,
    markWinModalAsShown,
    isLoading: game === null,
  };
}
