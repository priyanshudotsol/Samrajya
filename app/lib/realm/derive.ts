/**
 * State → visuals (docs/KINGDOM_UI.md §4.2). Pure functions of the `Game` account; the realm
 * scene re-renders only when one of these buckets changes.
 */
import { KINGDOMS, isAdjacent, kingdomGlow } from '@/lib/game/factions';
import { effectiveAllocs, lamportsToSol } from '@/lib/game/math';
import type { Game } from '@/lib/game/types';

import { bearing, spreadAngles } from './layout';

export interface IncomingCamp {
  faction: number;
  /** Committed lamports (effective, after pro-rata scaling). */
  strength: bigint;
  sol: number;
  /** 0..1 visual size (log scale). */
  size: number;
  /** Camp soldiers: one per attacking member (attacker members × committed share). */
  troops: number;
  /** Edge direction (radians) towards the attacker's nearest territory. */
  angle: number;
}

export interface OutgoingMarch {
  target: number;
  strength: bigint;
  sol: number;
  troops: number;
  angle: number;
}

export interface Satellite {
  territory: number;
  angle: number;
}

export interface RealmVisuals {
  territory: number;
  owner: number;
  /** Members (wallets) of the owner kingdom. */
  members: number;
  color: string;
  glow: string;
  accent: string;
  /** Soldiers at home: one per member, scaled by the defend share. 0 members ⇒ no army. */
  troopCount: number;
  houseCount: number;
  /** 0 (empty) ..5 */
  treasuryTier: number;
  /** Coin chests in the treasury: one per member (max 12). */
  chests: number;
  /** 0.1..0.6 extra wall height. */
  wallHeight: number;
  /** 0..1 share of the owner's treasury that stays home to defend. */
  defendShare: number;
  incoming: IncomingCamp[];
  outgoing: OutgoingMarch[];
  /** Power bit indices (0..5) the owner holds. */
  landmarks: number[];
  satellites: Satellite[];
  /** Owner eliminated (only possible on a stale snapshot or mid-cinematic). */
  ruined: boolean;
  /** A stable string that changes only when a visual bucket changes. */
  key: string;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export const MAX_ARMY = 60;

/** Soldiers for `members` wallets committing `part` of a `whole` treasury (≥1 if any is committed). */
export function soldiersFor(members: number, part: bigint, whole: bigint, max = MAX_ARMY): number {
  if (members <= 0 || part <= 0n || whole <= 0n) return 0;
  const share = Math.min(1, Number((part * 10000n) / whole) / 10000);
  return clamp(Math.round(members * share), 1, max);
}

export function tierOf(sol: number, steps = [0.1, 0.5, 2, 5]): number {
  return 1 + steps.filter((s) => sol >= s).length;
}

/** Territory of faction `f` closest to territory `t` (adjacent preferred, then home). */
function nearestTerritoryOf(game: Game, f: number, t: number): number {
  const owned = game.territoryOwner.map((o, i) => (o === f ? i : -1)).filter((i) => i >= 0);
  if (owned.length === 0) return f;
  const adj = owned.find((o) => isAdjacent(o, t));
  if (adj !== undefined) return adj;
  if (owned.includes(f)) return f;
  return owned[0];
}

export function deriveRealmVisuals(game: Game, territory: number): RealmVisuals {
  const owner = game.territoryOwner[territory];
  const fac = game.factions[owner];
  const sol = lamportsToSol(fac.treasury);
  const eff = effectiveAllocs(game);
  const committed = eff[owner].reduce((a, b) => a + b, 0n);
  const defendShare = fac.treasury === 0n ? 1 : clamp(1 - Number((committed * 1000n) / fac.treasury) / 1000, 0, 1);

  const rawIncoming = game.factions
    .map((af, i) => ({ faction: i, strength: eff[i][territory] }))
    .filter((x) => x.faction !== owner && game.factions[x.faction].alive && x.strength > 0n);
  const inAngles = spreadAngles(
    rawIncoming.map((x) => bearing(territory, nearestTerritoryOf(game, x.faction, territory))),
  );
  const incoming: IncomingCamp[] = rawIncoming.map((x, i) => {
    const s = lamportsToSol(x.strength);
    return {
      faction: x.faction,
      strength: x.strength,
      sol: s,
      size: clamp(Math.log10(s * 10 + 1) / 2, 0.15, 1),
      troops: Math.max(1, soldiersFor(game.factions[x.faction].members, x.strength, game.factions[x.faction].treasury, 30)),
      angle: inAngles[i],
    };
  });

  const rawOut = eff[owner]
    .map((strength, t) => ({ target: t, strength }))
    .filter((x) => x.strength > 0n && game.territoryOwner[x.target] !== owner);
  const outAngles = spreadAngles(rawOut.map((x) => bearing(territory, x.target)));
  const outgoing: OutgoingMarch[] = rawOut.map((x, i) => {
    const s = lamportsToSol(x.strength);
    return {
      target: x.target,
      strength: x.strength,
      sol: s,
      troops: Math.max(1, soldiersFor(fac.members, x.strength, fac.treasury, 30)),
      angle: outAngles[i],
    };
  });

  const landmarks: number[] = [];
  for (let i = 0; i < KINGDOMS.length; i++) if ((fac.powers & (1 << i)) !== 0) landmarks.push(i);

  const satT = game.territoryOwner.map((o, t) => (o === owner && t !== territory ? t : -1)).filter((t) => t >= 0);
  const satAngles = spreadAngles(
    satT.map((t) => bearing(territory, t)),
    0.9,
  );
  const satellites = satT.map((t, i) => ({ territory: t, angle: satAngles[i] }));

  const v: Omit<RealmVisuals, 'key'> = {
    territory,
    owner,
    color: KINGDOMS[owner].color,
    glow: kingdomGlow(owner),
    accent: KINGDOMS[owner].accent,
    members: fac.members,
    troopCount: fac.members === 0 ? 0 : clamp(Math.round(fac.members * defendShare), 0, MAX_ARMY),
    houseCount: Math.min(fac.members, 18),
    treasuryTier: fac.treasury === 0n ? 0 : tierOf(sol),
    chests: Math.min(fac.members, 12),
    wallHeight: 0.1 + 0.5 * defendShare,
    defendShare,
    incoming,
    outgoing,
    landmarks,
    satellites,
    ruined: !fac.alive,
  };
  const key = [
    territory,
    owner,
    v.troopCount,
    v.houseCount,
    v.chests,
    v.treasuryTier,
    Math.round(defendShare * 20),
    incoming.map((c) => `${c.faction}:${c.troops}:${Math.round(c.size * 20)}`).join(','),
    outgoing.map((o) => `${o.target}:${o.troops}`).join(','),
    fac.powers,
    satT.join(','),
    v.ruined ? 1 : 0,
  ].join('|');
  return { ...v, key };
}
