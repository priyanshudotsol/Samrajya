/**
 * Rune-wheel segments from a real BattleEntry (docs/KINGDOM_UI.md §5.1 "Odds").
 *
 * The program's bucket order is: defender [0, defense), then attackers in faction-index order.
 * The entry stores `defense`, `total` and `attackersMask` but not each A_i, so we recompute A_i
 * from the pre-battle snapshot when it adds up to `total` exactly; otherwise the remainder
 * (total − defense) is split across the attackers proportionally to the snapshot (or equally).
 */
import { attackPowerOf, cloneGame, defensePowerOf, effectiveAllocs, resolveBattle } from '@/lib/game/math';
import type { BattleEntry, Game } from '@/lib/game/types';
import { N_KINGDOMS, NEUTRAL } from '@/lib/game/types';

export interface WheelSegment {
  faction: number;
  defender: boolean;
  /** 0..1 */
  from: number;
  to: number;
}

export interface Wheel {
  segments: WheelSegment[];
  /** 0..1 where the pointer lands (roll / total). */
  pointer: number;
  /** True when A_i were recomputed exactly. */
  exact: boolean;
}

const frac = (x: bigint, total: bigint) => (total === 0n ? 0 : Number((x * 1_000_000n) / total) / 1_000_000);

export function attackersOf(mask: number): number[] {
  const out: number[] = [];
  for (let f = 0; f < N_KINGDOMS; f++) if ((mask & (1 << f)) !== 0) out.push(f);
  return out;
}

export function wheelFor(entry: BattleEntry, snapshot: Game | null, log: BattleEntry[] = []): Wheel {
  const attackers = attackersOf(entry.attackersMask);
  const remainder = entry.total > entry.defense ? entry.total - entry.defense : 0n;
  let buckets: bigint[] | null = null;
  let exact = false;

  if (snapshot && snapshot.epoch === entry.epoch) {
    // Mirror resolve_epoch: one allocation snapshot, territories resolved in index order, so
    // replay the earlier battles of this epoch (with their logged rolls) before ours.
    const g = cloneGame(snapshot);
    const eff = effectiveAllocs(g);
    const earlier = log
      .filter((e) => e.epoch === entry.epoch && e.territory < entry.territory)
      .sort((a, b) => a.territory - b.territory);
    for (const e of earlier) resolveBattle(g, eff, e.territory, e.roll);
    const t = entry.territory;
    if (g.territoryOwner[t] === entry.defender) {
      const attacks = attackers.map((f) => attackPowerOf(g.factions[f], eff[f][t], g.config));
      const defense =
        entry.defender === NEUTRAL
          ? g.plainsDefense > 0n ? g.plainsDefense : 1n
          : defensePowerOf(g.factions[entry.defender], eff[entry.defender].reduce((a, b) => a + b, 0n), g.baseDefense, g.config);
      const sum = attacks.reduce((a, b) => a + b, 0n);
      if (defense === entry.defense && defense + sum === entry.total) {
        buckets = attacks;
        exact = true;
      } else if (sum > 0n) {
        buckets = attacks.map((a) => (remainder * a) / sum);
      }
    }
  }
  if (!buckets) buckets = attackers.map(() => (attackers.length ? remainder / BigInt(attackers.length) : 0n));
  // Give any rounding dust to the last attacker so the wheel closes.
  const assigned = buckets.reduce((a, b) => a + b, 0n);
  if (buckets.length && assigned < remainder) buckets[buckets.length - 1] += remainder - assigned;

  const segments: WheelSegment[] = [{ faction: entry.defender, defender: true, from: 0, to: frac(entry.defense, entry.total) }];
  let acc = entry.defense;
  attackers.forEach((f, i) => {
    const from = frac(acc, entry.total);
    acc += buckets![i];
    segments.push({ faction: f, defender: false, from, to: frac(acc, entry.total) });
  });
  return { segments, pointer: frac(entry.roll, entry.total), exact };
}
