/**
 * Tactics → odds (docs/ARCHITECTURE.md §10.3). Where warriors stand, what they carry and the
 * role they chose scale the treasury-based strengths before the VRF roll:
 *
 *   defence' = defence × defenseBps / 10_000
 *   attack_i' = attack_i × attackBps[i] / 10_000
 *
 * and an ABANDONED fort (no defender inside the walls while an enemy stands inside or at the
 * gate) is captured outright, without a roll.
 *
 * Only warriors physically present in the territory count: marching ones are on the road, dead
 * ones are dead. On-chain the same numbers come from `Game.presence[t][f]` (weights ×100),
 * maintained incrementally by `move_unit`, so the callback never iterates players.
 */
import { GEAR, inCircle, isInside, isPresent, ROLE, type Unit, zoneOf } from './units';
import { PLAINS, type Game } from './types';

export interface TacticalFactors {
  territory: number;
  defender: number;
  /** ×10_000 */
  defenseBps: bigint;
  attackBps: bigint[];
  /** Attacker faction that walks in unopposed, or null. */
  capturedBy: number | null;
  /** Weighted defenders inside the walls. */
  garrison: number;
  /** Weighted attackers present, per faction. */
  present: number[];
  /** Raw head counts for the HUD. */
  heads: { defendersInside: number; defendersOutside: number; attackers: number[] };
}

export const DEFENSE_FLOOR_BPS = 3500n;
export const DEFENSE_SPAN_BPS = 6500n;
export const ATTACK_FLOOR_BPS = 2500n;
export const ATTACK_SPAN_BPS = 7500n;
/** Presence saturates at 150% of the member count (a kingdom can't out-garrison itself much). */
export const PRESENCE_CAP = 1.5;

/** Weight (×100) one warrior contributes, by gear, role and zone. */
export function unitWeight(u: Unit, defending: boolean): number {
  const zone = zoneOf(u.x, u.z);
  const inside = zone === 'keep' || zone === 'inside';
  let w = 100;
  if (defending) {
    if (!inside) w = 45; // a defender outside the walls barely helps
    if (u.role === ROLE.GARRISON && inside) w += 10;
    if (u.gear === GEAR.DHAL && inside) w = Math.round(w * 1.25);
    if (u.gear === GEAR.DHANUSH && inside) w = Math.round(w * 1.2);
  } else {
    if (inside) w = 130; // over the wall or through the gate
    if (zone === 'edge') w = 60;
    if (u.role === ROLE.VANGUARD && zone === 'gate') w = Math.round(w * 1.1);
    if (u.role === ROLE.FLANK && Math.abs(u.x) > 1.6 && !inside) w = Math.round(w * 1.1);
    if (u.gear === GEAR.BHALA && (zone === 'gate' || zone === 'field')) w = Math.round(w * 1.15);
    if (u.gear === GEAR.DHANUSH && u.role === ROLE.REAR && !inside) w = Math.round(w * 1.1);
    if (u.gear === GEAR.DHAL) w = Math.round(w * 0.9);
    if (u.gear === GEAR.SEEDHI && inside) w = Math.round(w * 1.3);
    if (u.gear === GEAR.GAJA && (zone === 'gate' || zone === 'field')) w = Math.round(w * 1.4);
  }
  // a wounded warrior fights at half strength when at 0 hp
  return Math.round(w * (0.5 + 0.5 * Math.max(0, Math.min(100, u.hp)) / 100));
}

const cap = (x: number) => Math.min(PRESENCE_CAP, x);

/** Scales strength by presence: floor + span × min(1.5, weight / members). */
function factor(floor: bigint, span: bigint, weight: number, members: number): bigint {
  const share = cap(weight / Math.max(1, members));
  return floor + BigInt(Math.round(Number(span) * share));
}

export function tacticalFactors(game: Game, units: Unit[], t: number, now: number): TacticalFactors {
  const defender = game.territoryOwner[t];
  // Kurukshetra (§10.11): its holder keeps it while one of its members stands alive on the plains;
  // otherwise the attackers standing in the stone circle take it (the most warriors there).
  if (t === PLAINS) {
    const f = NEUTRAL_FACTORS(game, t);
    const inRing = game.factions.map(() => 0);
    for (const u of units) {
      if (u.at !== t || !isPresent(u, now)) continue;
      if (u.faction === defender) f.heads.defendersInside += 1;
      else if (game.factions[u.faction].alive && game.factions[u.faction].attackAlloc[t] > 0n) {
        f.heads.attackers[u.faction] += 1;
        if (inCircle(u.x, u.z)) inRing[u.faction] += 1;
      }
    }
    if (f.heads.defendersInside === 0) {
      let best = 0;
      inRing.forEach((n, i) => {
        if (n > best) {
          best = n;
          f.capturedBy = i;
        }
      });
    }
    return f;
  }
  const n = game.factions.length;
  const present = Array.from({ length: n }, () => 0);
  const attackers = Array.from({ length: n }, () => 0);
  let garrison = 0;
  let defendersInside = 0;
  let defendersOutside = 0;
  let enemyAtGate = false;
  for (const u of units) {
    if (u.at !== t || !isPresent(u, now)) continue;
    if (u.faction === defender) {
      const w = unitWeight(u, true);
      garrison += w / 100;
      if (isInside(u.x, u.z)) defendersInside += 1;
      else defendersOutside += 1;
    } else if (game.factions[u.faction].alive) {
      present[u.faction] += unitWeight(u, false) / 100;
      attackers[u.faction] += 1;
      const z = zoneOf(u.x, u.z);
      if (z === 'gate' || z === 'inside' || z === 'keep') enemyAtGate = true;
    }
  }
  // Only the garrison inside counts for the hold; outsiders were already discounted in unitWeight.
  const members = game.factions[defender].members;
  const defenseBps = factor(DEFENSE_FLOOR_BPS, DEFENSE_SPAN_BPS, garrison, members);
  const attackBps = present.map((w, f) => (f === defender ? 10_000n : factor(ATTACK_FLOOR_BPS, ATTACK_SPAN_BPS, w, game.factions[f].members)));

  let capturedBy: number | null = null;
  // §10.10: the fort falls only once no member of the owner stands alive in the realm
  if (defendersInside === 0 && defendersOutside === 0 && enemyAtGate) {
    // the strongest presence walks in; only factions that actually attacked (allocated) qualify
    let best = -1;
    let bestW = 0;
    for (let f = 0; f < n; f++) {
      if (f === defender || present[f] <= 0) continue;
      if (game.factions[f].attackAlloc[t] <= 0n) continue;
      if (present[f] > bestW) {
        bestW = present[f];
        best = f;
      }
    }
    if (best >= 0) capturedBy = best;
  }
  return { territory: t, defender, defenseBps, attackBps, capturedBy, garrison, present, heads: { defendersInside, defendersOutside, attackers } };
}

/** Factors for every territory (what `battle_callback` reads from `Game.presence`). */
export function allFactors(game: Game, units: Unit[], now: number): TacticalFactors[] {
  return game.territoryOwner.map((_, t) => tacticalFactors(game, units, t, now));
}

export const NEUTRAL_FACTORS = (game: Game, t: number): TacticalFactors => ({
  territory: t,
  defender: game.territoryOwner[t],
  defenseBps: 10_000n,
  attackBps: game.factions.map(() => 10_000n),
  capturedBy: null,
  garrison: 0,
  present: game.factions.map(() => 0),
  heads: { defendersInside: 0, defendersOutside: 0, attackers: game.factions.map(() => 0) },
});
