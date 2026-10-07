'use client';

import { useEffect, useRef, useState } from 'react';
import { Crown, TrendingDown, TrendingUp } from 'lucide-react';

import { KINGDOMS, kingdomGlow, POWERS } from '@/lib/game/factions';
import { lamportsToSol, sharePrice, validTargets } from '@/lib/game/math';
import { useRealmUi } from '@/lib/realm/ui-store';
import { useGame } from '@/lib/store/game';

import { AnimatedNumber, Panel, Stat } from './kit';

/** Treasury, share price (with trend), members and territories of the realm's owner. */
export function KingdomStats({ territory }: { territory: number }) {
  const game = useGame((s) => s.game);
  const focus = useRealmUi((s) => s.focus);
  const prevPrice = useRef<number | null>(null);
  const [trend, setTrend] = useState<0 | 1 | -1>(0);
  const owner = game?.territoryOwner[territory] ?? territory;
  const f = game?.factions[owner];
  const price = f && f.alive ? sharePrice(f) : 0;

  useEffect(() => {
    if (prevPrice.current !== null && Math.abs(price - prevPrice.current) > 1e-6) setTrend(price > prevPrice.current ? 1 : -1);
    prevPrice.current = price;
  }, [price]);

  if (!game || !f) return null;
  const owned = game.territoryOwner.map((o, t) => (o === owner ? t : -1)).filter((t) => t >= 0);
  const k = KINGDOMS[owner];

  return (
    <Panel title="Kingdom" icon={<Crown className="h-3.5 w-3.5" />} highlight={focus?.kind === 'treasury'}>
      <p className="mb-2 text-xs text-text-secondary">
        <span style={{ color: kingdomGlow(owner) }}>{k.name}</span> · {k.epithet} · {KINGDOMS[territory].biome}
      </p>
      <div className="space-y-1">
        <Stat label="Treasury (strength)">
          <AnimatedNumber value={lamportsToSol(f.treasury)} suffix=" ◎" />
        </Stat>
        <Stat label="Share price" title="treasury ÷ shares, 1.000 at launch">
          <span className="inline-flex items-center gap-1">
            <AnimatedNumber value={price} digits={3} />
            {trend === 1 && <TrendingUp className="h-3.5 w-3.5 text-[#4CC27A]" />}
            {trend === -1 && <TrendingDown className="h-3.5 w-3.5 text-[var(--color-vermilion)]" />}
          </span>
        </Stat>
        <Stat label="Members">{f.members}</Stat>
        <Stat label="Territories">
          {owned.length} <span className="text-text-secondary">({owned.map((t) => KINGDOMS[t].short).join(', ')})</span>
        </Stat>
        <Stat label="Can attack">
          {validTargets(game, owner)
            .map((t) => KINGDOMS[t].short)
            .join(', ') || '—'}
        </Stat>
        {!f.alive && <div className="text-sm text-[var(--color-vermilion)]">Eliminated — shares are worth 0.</div>}
      </div>
      {focus?.kind === 'treasury' && (
        <p className="mt-2 border-t border-border-muted pt-2 text-xs text-text-secondary">
          Every member owns a slice of this treasury. Conquest, spoils and the fees paid by leavers move it — and your
          share with it. The gold pile grows with the treasury (tier ≥ 0.1 / 0.5 / 2 / 5 ◎).
        </p>
      )}
      {focus?.kind === 'landmark' && (
        <p className="mt-2 border-t border-border-muted pt-2 text-xs">
          <span className="font-rozha text-text-highlight">{POWERS[focus.power].name}</span>{' '}
          <span className="text-text-secondary">— {POWERS[focus.power].effect}. Inherited by whoever conquers this kingdom.</span>
        </p>
      )}
    </Panel>
  );
}
