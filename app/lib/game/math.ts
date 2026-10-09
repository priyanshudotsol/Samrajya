/**
 * TypeScript port of `programs/samrajya/src/math.rs` (the deployed rules).
 * Used for odds previews and the mock. KEEP IT IDENTICAL TO THE RUST: integer (bigint) math only,
 * remainders round down for the player so dust stays in the treasury.
 *
 * Functions named `apply*` / `mint*` / `burn*` / `resolve*` MUTATE their arguments, like the Rust
 * `&mut` versions. Clone first (`cloneGame`) when you need the previous state.
 */
import { POWER } from './factions';
import type { TacticalFactors } from './tactics';
import {
  BATTLE_LOG_SIZE,
  type BattleEntry,
  type Faction,
  type Game,
  type GameConfig,
  MAX_UPGRADE_LEVEL,
  N_KINGDOMS,
  N_TERRITORIES,
  NEUTRAL,
  PLAINS,
  UPGRADE,
} from './types';

export const BPS = 10_000n;
export const LAMPORTS_PER_SOL = 1_000_000_000n;
/** Every member holds exactly this many shares, so a treasury splits equally per head. */
export const SHARES_PER_MEMBER = 1_000_000n;

/** Power multipliers, in bps. */
export const FORTRESS_DEFENSE_BPS = 13_000n; // ×1.3
export const GAJA_ATTACK_BPS = 12_000n; // ×1.2
export const SAMUDRA_LOOT_BPS = 12_500n; // +25%
export const RATRI_FIRST_ATTACK_BPS = 15_000n; // ×1.5

export const DEFAULT_CONFIG: Omit<GameConfig, 'adjacency'> = {
  ticket: 100_000_000n, // 0.1 SOL, the same for everyone
  epochSecs: 60,
  leaveFeeBps: 2000,
  switchFeeBps: 4000,
  kLossBps: 2000,
  baseDefense: 100_000_000n, // 0.1 SOL of strength
  stormDecayBps: 500,
  plainsDefense: 300_000_000n, // 0.3 SOL garrison on the plains
  plainsTaxBps: 1000,
  upgradeCostBps: 500,
  upgradeBonusBps: 1500,
  conquestBonusBps: 1500,
  lobbySecs: 120,
};

const min = (a: bigint, b: bigint) => (a < b ? a : b);
const has = (f: Faction, bit: number) => (f.powers & bit) !== 0;
const bps = (x: bigint, b: bigint | number) => (x * BigInt(b)) / BPS;

// ---------------------------------------------------------------------------------------------
// Share economy  (programs/samrajya/src/math.rs — keep identical)
// ---------------------------------------------------------------------------------------------

/** value = shares × treasury / total_shares (0 for shares of an older generation). */
export function valueOf(f: Faction, shares: bigint, generation = f.generation): bigint {
  if (generation !== f.generation || f.totalShares === 0n || shares === 0n) return 0n;
  return (shares * f.treasury) / f.totalShares;
}

/** One member's equal share of the treasury, in lamports (what a new member's share is worth). */
export function perMember(f: Faction): bigint {
  return f.totalShares === 0n ? 0n : (SHARES_PER_MEMBER * f.treasury) / f.totalShares;
}

/** Adds a member's ticket to the treasury and returns their (equal) shares. */
export function mintShares(f: Faction, lamports: bigint): bigint {
  if (f.treasury === 0n && f.totalShares !== 0n) {
    f.generation += 1; // drained kingdom: stale shares can't claim the new deposit
    f.members = 0;
    f.totalShares = 0n;
  }
  f.totalShares += SHARES_PER_MEMBER;
  f.treasury += lamports;
  return SHARES_PER_MEMBER;
}

/** Burns `shares` and returns the lamports paid out. The fee portion stays in the treasury. */
export function burnWithFee(f: Faction, shares: bigint, feeBps: number, generation = f.generation): bigint {
  const value = valueOf(f, shares, generation);
  if (generation !== f.generation) return 0n;
  const out = value - (value * BigInt(feeBps)) / BPS;
  f.totalShares = f.totalShares > shares ? f.totalShares - shares : 0n;
  f.treasury -= out;
  return out;
}

/** Fees apply only while the war is Active (Lobby and Ended are free). */
export const leaveFee = (g: Game) => (g.phase === 'Active' ? g.config.leaveFeeBps : 0);
export const switchFee = (g: Game) => (g.phase === 'Active' ? g.config.switchFeeBps : 0);

/** Preview helpers (non-mutating). */
export function previewLeave(g: Game, f: Faction, shares: bigint, generation = f.generation) {
  const value = valueOf(f, shares, generation);
  const payout = value - (value * BigInt(leaveFee(g))) / BPS;
  return { value, payout, fee: value - payout };
}

export function previewSwitch(g: Game, f: Faction, shares: bigint, generation = f.generation) {
  const value = valueOf(f, shares, generation);
  const moved = value - (value * BigInt(switchFee(g))) / BPS;
  return { value, moved, fee: value - moved };
}

// ---------------------------------------------------------------------------------------------
// Allocation rules
// ---------------------------------------------------------------------------------------------

export function ownedMask(game: Game, f: number): number {
  let m = 0;
  for (let t = 0; t < N_TERRITORIES; t++) if (game.territoryOwner[t] === f) m |= 1 << t;
  return m;
}

/** Can faction `f` attack territory `t` right now? (math::allocate checks) */
export function canAttack(game: Game, f: number, t: number): boolean {
  const fac = game.factions[f];
  if (!fac.alive || game.territoryOwner[t] === f) return false;
  if (has(fac, POWER.VIDYA_REACH)) return true;
  return (game.config.adjacency[t] & ownedMask(game, f)) !== 0;
}

export function validTargets(game: Game, f: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < N_TERRITORIES; t++) if (canAttack(game, f, t)) out.push(t);
  return out;
}

/** Σ attack_alloc of a faction this epoch. */
export function totalAttack(f: Faction): bigint {
  return f.attackAlloc.reduce((a, b) => a + b, 0n);
}

/** Each kingdom's allocations, scaled down pro-rata if they exceed its treasury (snapshot). */
export function effectiveAllocs(game: Game): bigint[][] {
  return game.factions.map((f) => {
    const sum = totalAttack(f);
    return f.attackAlloc.map((a) => (sum > f.treasury ? (a * f.treasury) / sum : a));
  });
}

// ---------------------------------------------------------------------------------------------
// Battle powers
// ---------------------------------------------------------------------------------------------

/** Multiplier (bps) from territories held beyond the first: a conqueror hits harder. */
export function conquestBps(f: Faction, cfg: GameConfig): bigint {
  return BPS + BigInt(cfg.conquestBonusBps) * BigInt(Math.max(0, f.territories - 1));
}

/** Multiplier (bps) from an upgrade's level. */
export function upgradeBps(f: Faction, kind: number, cfg: GameConfig): bigint {
  return BPS + BigInt(cfg.upgradeBonusBps) * BigInt(f.upgrades[kind] ?? 0);
}

export function attackPowerOf(f: Faction, committed: bigint, cfg: GameConfig): bigint {
  let p = committed;
  if (has(f, POWER.GAJA_SENA)) p = bps(p, GAJA_ATTACK_BPS);
  if (has(f, POWER.RATRI_RAID) && !f.ambushUsed) p = bps(p, RATRI_FIRST_ATTACK_BPS);
  p = bps(p, upgradeBps(f, UPGRADE.ARMORY, cfg));
  return bps(p, conquestBps(f, cfg));
}

export function defensePowerOf(f: Faction, committedToAttacks: bigint, baseDefense: bigint, cfg: GameConfig): bigint {
  const free = f.treasury > committedToAttacks ? f.treasury - committedToAttacks : 0n;
  let d = f.territories === 0 ? 0n : free / BigInt(f.territories);
  if (has(f, POWER.KURU_FORTRESS)) d = bps(d, FORTRESS_DEFENSE_BPS);
  d = bps(d, upgradeBps(f, UPGRADE.WALLS, cfg));
  return bps(d, conquestBps(f, cfg)) + baseDefense;
}

/** Defense of kingdom `def` right now (for previews). `NEUTRAL` → the plains garrison. */
export function defensePower(game: Game, def: number): bigint {
  if (def === NEUTRAL) return game.plainsDefense > 0n ? game.plainsDefense : 1n;
  const eff = effectiveAllocs(game);
  return defensePowerOf(game.factions[def], eff[def].reduce((a, b) => a + b, 0n), game.baseDefense, game.config);
}

/** Attack of kingdom `attacker` at `t` right now (for previews). */
export function attackPower(game: Game, attacker: number, t: number): bigint {
  if (game.territoryOwner[t] === attacker || !game.factions[attacker].alive) return 0n;
  return attackPowerOf(game.factions[attacker], effectiveAllocs(game)[attacker][t], game.config);
}

// ---------------------------------------------------------------------------------------------
// Upgrades  (math::upgrade)
// ---------------------------------------------------------------------------------------------

/** Price of the next level of `kind`: (level + 1) × upgradeCostBps of the treasury. */
export function upgradeCost(f: Faction, kind: number, cfg: GameConfig): bigint {
  return bps(f.treasury, BigInt((f.upgrades[kind] ?? 0) + 1) * BigInt(cfg.upgradeCostBps));
}

/** Why kingdom `fi` can't buy `kind` right now, or null if it can. */
export function upgradeBlocker(game: Game, fi: number, kind: number): string | null {
  const f = game.factions[fi];
  if (game.phase !== 'Active') return 'The war has not started';
  if (game.pendingVrf) return 'A battle is being resolved';
  if (!f.alive) return 'Kingdom eliminated';
  if ((f.upgrades[kind] ?? 0) >= MAX_UPGRADE_LEVEL) return 'Highest level';
  if (f.upgradedEpoch === game.epoch) return 'Already upgraded this epoch';
  const cost = upgradeCost(f, kind, game.config);
  if (cost === 0n || cost > f.treasury) return 'Treasury too small';
  return null;
}

/** Mirror of `math::upgrade`: spends treasury on the next level; the SOL feeds the plains pot. */
export function applyUpgrade(game: Game, fi: number, kind: number): bigint {
  const why = upgradeBlocker(game, fi, kind);
  if (why) throw new Error(why);
  const f = game.factions[fi];
  const cost = upgradeCost(f, kind, game.config);
  f.treasury -= cost;
  f.upgrades[kind] = (f.upgrades[kind] ?? 0) + 1;
  f.upgradedEpoch = game.epoch;
  game.plainsPot += cost;
  return cost;
}

export function isContested(game: Game, t: number): boolean {
  const owner = game.territoryOwner[t];
  return game.factions.some((f, i) => i !== owner && f.alive && f.attackAlloc[t] > 0n);
}

// ---------------------------------------------------------------------------------------------
// Odds preview
// ---------------------------------------------------------------------------------------------

export interface BattleOdds {
  territory: number;
  defender: number;
  defense: bigint;
  /** A_i per faction (0 for non-attackers and the defender). */
  attacks: bigint[];
  total: bigint;
  /** Probability the defender holds, 0..1. */
  pDefend: number;
  /** Probability each faction wins, 0..1 (index = faction). */
  pWin: number[];
}

/**
 * Win odds for the battle at `t`. Optionally adds a hypothetical extra allocation (for the
 * WarRoom "what if I commit X" preview) without mutating `game`.
 */
export function battleOdds(game: Game, t: number, extra?: { faction: number; amount: bigint }, tactics?: TacticalFactors | null): BattleOdds {
  let g = game;
  if (extra && extra.amount > 0n) {
    g = cloneGame(game);
    g.factions[extra.faction].attackAlloc[t] += extra.amount;
  }
  const defender = g.territoryOwner[t];
  let defense = defensePower(g, defender);
  let attacks = g.factions.map((_, i) => (i === defender ? 0n : attackPower(g, i, t)));
  if (tactics) {
    if (tactics.capturedBy !== null && attacks[tactics.capturedBy] > 0n) {
      defense = 0n;
      attacks = attacks.map((a, i) => (i === tactics.capturedBy ? (a > 0n ? a : 1n) : 0n));
    } else {
      // the hand fight decides every realm, the plains too (§10.8, §10.11): until cleared, it holds
      attacks = attacks.map(() => 0n);
      if (defense === 0n) defense = 1n;
    }
  }
  const total = defense + attacks.reduce((a, b) => a + b, 0n);
  const p = (x: bigint) => (total === 0n ? 0 : Number((x * 1_000_000n) / total) / 1_000_000);
  const pWin = attacks.map((a, i) => (i === defender ? p(defense) : p(a)));
  return { territory: t, defender, defense, attacks, total, pDefend: p(defense), pWin };
}

// ---------------------------------------------------------------------------------------------
// Resolution  (mirror of math::resolve_battle / resolve_epoch)
// ---------------------------------------------------------------------------------------------

/** Moves up to `amount` from a kingdom to `to` (`NEUTRAL` = the plains pot). */
function moveTreasury(game: Game, from: number, to: number, amount: bigint): bigint {
  const a = min(amount, game.factions[from].treasury);
  game.factions[from].treasury -= a;
  if (to === NEUTRAL) game.plainsPot += a;
  else game.factions[to].treasury += a;
  return a;
}

/** Resolves territory `t` with u64 `rnd` using the epoch-start allocation snapshot `eff`. */
export function resolveBattle(game: Game, eff: bigint[][], t: number, rnd: bigint, tactics?: TacticalFactors | null): BattleEntry | null {
  const d = game.territoryOwner[t];
  const neutral = d === NEUTRAL;
  const attack = Array.from({ length: N_KINGDOMS }, () => 0n);
  let mask = 0;
  for (let f = 0; f < N_KINGDOMS; f++) {
    if (f !== d && game.factions[f].alive && eff[f][t] > 0n) {
      attack[f] = attackPowerOf(game.factions[f], eff[f][t], game.config);
      if (tactics) attack[f] = bps(attack[f], tactics.attackBps[f]);
      if (attack[f] > 0n) mask |= 1 << f;
    }
  }
  if (mask === 0) return null;
  let defense = neutral
    ? game.plainsDefense > 0n ? game.plainsDefense : 1n
    : defensePowerOf(game.factions[d], eff[d].reduce((a, b) => a + b, 0n), game.baseDefense, game.config);
  if (tactics) defense = bps(defense, tactics.defenseBps);
  // An abandoned fort falls to whoever walked in: no roll, and the attack buckets collapse.
  const captured = !!tactics && tactics.capturedBy !== null && (mask & (1 << tactics.capturedBy)) !== 0;
  if (captured) {
    defense = 0n;
    for (let f = 0; f < N_KINGDOMS; f++) if (f !== tactics!.capturedBy) attack[f] = 0n;
  }
  // Walled realms are decided by the hand fight alone (§10.8): cleared → captured, else held.
  const byFight = !!tactics;
  const total = defense + attack.reduce((a, b) => a + b, 0n);
  const roll = captured || byFight ? 0n : rnd % total;

  let winner = d;
  if (captured) winner = tactics!.capturedBy!;
  else if (!byFight && roll >= defense) {
    let acc = defense;
    for (let f = 0; f < N_KINGDOMS; f++) {
      acc += attack[f];
      if (roll < acc) {
        winner = f;
        break;
      }
    }
  }

  // Every losing attacker pays k_loss of what it committed to the battle's winner.
  let spoils = 0n;
  for (let f = 0; f < N_KINGDOMS; f++) {
    if ((mask & (1 << f)) !== 0 && f !== winner) {
      let lossBps = BigInt(game.config.kLossBps);
      if (has(game.factions[f], POWER.ANNAPURNA_HARVEST)) lossBps /= 2n;
      spoils += moveTreasury(game, f, winner, (eff[f][t] * lossBps) / BPS);
    }
  }

  let eliminated = false;
  if (winner !== d) {
    if (!neutral) {
      const loser = game.factions[d];
      let loot: bigint;
      if (loser.territories <= 1) loot = loser.treasury;
      else {
        loot = loser.treasury / BigInt(loser.territories);
        if (has(game.factions[winner], POWER.SAMUDRA_VYAPAR)) loot = bps(loot, SAMUDRA_LOOT_BPS);
      }
      spoils += moveTreasury(game, d, winner, loot);
      loser.territories -= 1;
      if (loser.territories === 0) {
        eliminated = true;
        const powers = loser.powers;
        const rest = loser.treasury;
        loser.alive = false;
        loser.generation += 1;
        loser.totalShares = 0n;
        loser.members = 0;
        loser.attackAlloc = loser.attackAlloc.map(() => 0n);
        loser.upgrades = loser.upgrades.map(() => 0);
        game.factions[winner].powers |= powers;
        spoils += moveTreasury(game, d, winner, rest);
      }
    }
    game.territoryOwner[t] = winner;
    game.factions[winner].territories += 1;
  }

  // The plains tax: a cut of every kingdom's winnings feeds the plains pot.
  if (winner !== NEUTRAL && spoils > 0n) {
    spoils -= moveTreasury(game, winner, NEUTRAL, bps(spoils, game.config.plainsTaxBps));
  }

  return { epoch: game.epoch, territory: t, defender: d, winner, attackersMask: mask, defense, total, roll, spoils, eliminated, captured, ...(byFight ? { byFight } : {}) };
}

/** Mirror of `math::lobby_ready`: anyone may start once the timer ran out and two kingdoms have members. */
export function lobbyReady(game: Game, now: number): boolean {
  return game.phase === 'Lobby' && now >= game.epochEndsAt && game.factions.filter((f) => f.members > 0).length >= 2;
}

/** Returns the faction owning every territory (plains included), or null. */
export function checkWinner(game: Game): number | null {
  const o = game.territoryOwner[0];
  return o !== NEUTRAL && game.territoryOwner.every((x) => x === o) ? o : null;
}

const U64 = (1n << 64n) - 1n;
function splitmix64(z0: bigint): bigint {
  let z = (z0 + 0x9e3779b97f4a7c15n) & U64;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64;
  return z ^ (z >> 31n);
}

/** Same per-territory sub-roll the program derives from the 32-byte VRF output. */
export function subRoll(randomness: Uint8Array, t: number): bigint {
  let seed = 0n;
  for (let i = 0; i < 32; i += 8) {
    let x = 0n;
    for (let j = 7; j >= 0; j--) x = (x << 8n) | BigInt(randomness[i + j]);
    seed = splitmix64(seed ^ x);
  }
  return splitmix64(seed ^ ((BigInt(t + 1) * 0x9e3779b97f4a7c15n) & U64));
}

export function advanceEpoch(game: Game, now: number) {
  game.epoch += 1;
  game.baseDefense -= bps(game.baseDefense, game.config.stormDecayBps);
  game.plainsDefense -= bps(game.plainsDefense, game.config.stormDecayBps);
  game.epochEndsAt = now + game.config.epochSecs;
  game.pendingVrf = false;
  // The plains pay their holder everything in the pot.
  const holder = game.territoryOwner[PLAINS];
  if (holder !== NEUTRAL && game.plainsPot > 0n) {
    game.factions[holder].treasury += game.plainsPot;
    game.plainsPot = 0n;
  }
  const w = checkWinner(game);
  if (w !== null) {
    game.phase = 'Ended';
    game.winner = w;
  }
}

/**
 * Mirror of `seize` (§10.11): `faction` walked into realm `t` while no member of its owner stood
 * alive there. Resolves that realm now (loot, losses, elimination), spends its attacks, and ends
 * the war if `faction` now holds everything. The epoch does not move. Null if it can't be seized.
 */
export function seizeFort(game: Game, t: number, faction: number): BattleEntry | null {
  if (game.phase !== 'Active' || game.pendingVrf || t >= N_TERRITORIES || game.territoryOwner[t] === faction) return null;
  if (game.factions[faction].attackAlloc[t] <= 0n) return null;
  const verdict = { territory: t, defender: game.territoryOwner[t], defenseBps: 10_000n, attackBps: game.factions.map(() => 10_000n), capturedBy: faction, garrison: 0, present: game.factions.map(() => 0), heads: { defendersInside: 0, defendersOutside: 0, attackers: game.factions.map(() => 0) } };
  const e = resolveBattle(game, effectiveAllocs(game), t, 0n, verdict);
  if (!e || e.winner !== faction) return null;
  game.factions.forEach((f) => (f.attackAlloc[t] = 0n));
  game.battleLog = [...game.battleLog, e].slice(-BATTLE_LOG_SIZE);
  game.battleCount += 1;
  const w = checkWinner(game);
  if (w !== null) {
    game.phase = 'Ended';
    game.winner = w;
  }
  return e;
}

/** Mirror of `battle_callback`: resolve every contested territory, log, reset, advance. */
export function resolveEpoch(game: Game, randomness: Uint8Array, now: number, tactics?: TacticalFactors[] | null): BattleEntry[] {
  const eff = effectiveAllocs(game);
  const entries: BattleEntry[] = [];
  const attacked = Array.from({ length: N_KINGDOMS }, () => false);
  for (let t = 0; t < N_TERRITORIES; t++) {
    const e = resolveBattle(game, eff, t, subRoll(randomness, t), tactics ? tactics[t] : null);
    if (!e) continue;
    for (let f = 0; f < N_KINGDOMS; f++) if ((e.attackersMask & (1 << f)) !== 0) attacked[f] = true;
    entries.push(e);
  }
  game.battleLog = [...game.battleLog, ...entries].slice(-BATTLE_LOG_SIZE);
  game.battleCount += entries.length;
  game.factions.forEach((f, i) => {
    if (attacked[i] && has(f, POWER.RATRI_RAID)) f.ambushUsed = true;
    f.attackAlloc = f.attackAlloc.map(() => 0n);
  });
  advanceEpoch(game, now);
  return entries;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

export function newFaction(i: number): Faction {
  return {
    treasury: 0n,
    totalShares: 0n,
    members: 0,
    territories: 1,
    powers: 1 << i,
    alive: true,
    generation: 0,
    attackAlloc: Array.from({ length: N_TERRITORIES }, () => 0n),
    ambushUsed: false,
    upgrades: [0, 0],
    upgradedEpoch: 0,
  };
}

export function newGame(
  config: GameConfig,
  opts: { gameId?: number; authority?: string; now?: number } = {},
): Game {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  return {
    authority: opts.authority ?? '11111111111111111111111111111111',
    gameId: opts.gameId ?? 1,
    phase: 'Active',
    epoch: 1,
    epochEndsAt: now + config.epochSecs,
    pendingVrf: false,
    config: { ...config, adjacency: [...config.adjacency] },
    baseDefense: config.baseDefense,
    plainsDefense: config.plainsDefense,
    plainsPot: 0n,
    battleCount: 0,
    territoryOwner: Array.from({ length: N_TERRITORIES }, (_, i) => (i === PLAINS ? NEUTRAL : i)),
    factions: Array.from({ length: N_KINGDOMS }, (_, i) => newFaction(i)),
    winner: null,
    battleLog: [],
  };
}

export function cloneGame(g: Game): Game {
  return structuredClone(g);
}

/** Σ faction treasuries + the plains pot = everything at stake. */
export function totalPot(game: Game): bigint {
  return game.factions.reduce((a, f) => a + f.treasury, 0n) + game.plainsPot;
}

export function lamportsToSol(l: bigint): number {
  return Number(l) / Number(LAMPORTS_PER_SOL);
}

export function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * 1e9));
}

export function formatSol(l: bigint, digits = 2): string {
  const sol = lamportsToSol(l);
  if (sol !== 0 && Math.abs(sol) < 10 ** -digits) return `<${(10 ** -digits).toFixed(digits)}`;
  return sol.toFixed(digits);
}
