'use client';

import { useMemo } from 'react';

import { tacticalFactors, type TacticalFactors } from '@/lib/game/tactics';
import { isMockMode, useGame } from '@/lib/store/game';

import { useNow } from '@/components/realm-hud/kit';

/** Is the tactical layer live (warriors known for more than the viewer)? */
export function useTactical(): boolean {
  const n = useGame((s) => s.units.length);
  return isMockMode() || n > 1;
}

/** Live tactical factors for the battle at `territory`, or null when warriors aren't tracked. */
export function useTactics(territory: number): TacticalFactors | null {
  const game = useGame((s) => s.game);
  const units = useGame((s) => s.units);
  const tactical = useTactical();
  const now = useNow(1000);
  return useMemo(() => (game && tactical ? tacticalFactors(game, units, territory, now / 1000) : null), [game, units, territory, tactical, now]);
}
