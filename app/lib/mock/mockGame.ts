/**
 * Mock mode (docs/KINGDOM_UI.md §10): a fake `samrajya` program running in the browser.
 * Bots join, allocate, leave and switch; an epoch ends every `epochSecs`, a fake "VRF" answers
 * ~1.5 s later and battles resolve with lib/game/math.ts. When one kingdom owns every territory
 * the game ends and a new one starts `restartSecs` later.
 *
 * The `ix*` functions mirror the program instructions (enlist / allocate / switch / leave) so the
 * mock mutates state exactly the way the chain will.
 */
import { ADJACENCY } from '@/lib/game/factions';
import {
  DEFAULT_CONFIG,
  battleOdds,
  burnWithFee,
  cloneGame,
  leaveFee,
  mintShares,
  newGame,
  resolveEpoch,
  solToLamports,
  switchFee,
  validTargets,
  valueOf,
} from '@/lib/game/math';
import { DEFEND, type Game, type GameConfig, N_KINGDOMS, type Player } from '@/lib/game/types';

export type Rand = () => number;

export interface MockOptions {
  epochSecs?: number;
  restartSecs?: number;
  /** Simulated VRF latency after the epoch bell. */
  vrfDelaySecs?: number;
  tickMs?: number;
  /** Bots per kingdom at game start. */
  initialBotsPerKingdom?: number;
  maxBots?: number;
  rand?: Rand;
}

export interface MockState {
  game: Game;
  players: Player[];
  /** unix seconds when the VRF "callback" lands (only while pendingVrf). */
  vrfAt: number | null;
  /** unix seconds when the game ended. */
  endedAt: number | null;
  /** paidOut = leave payouts; claimed = end-of-game claims (treasury is not reduced by claims). */
  stats: { deposited: bigint; paidOut: bigint; claimed: bigint };
  opts: Required<Omit<MockOptions, 'rand'>>;
}

const DEFAULTS: Required<Omit<MockOptions, 'rand'>> = {
  epochSecs: 15,
  restartSecs: 20,
  vrfDelaySecs: 1.5,
  tickMs: 500,
  initialBotsPerKingdom: 4,
  maxBots: 60,
};

// ---------------------------------------------------------------------------------------------
// Instruction mirrors
// ---------------------------------------------------------------------------------------------

export class MockIxError extends Error {}

/** base `join` + ER `enlist` in one step. */
export function ixJoin(s: MockState, wallet: string, faction: number, lamports: bigint): Player {
  const g = s.game;
  if (g.phase === 'Ended') throw new MockIxError('game ended');
  if (lamports < g.config.minStake) throw new MockIxError('below min stake');
  const f = g.factions[faction];
  if (!f.alive) throw new MockIxError('kingdom eliminated');
  let p = s.players.find((x) => x.wallet === wallet);
  if (p && p.status === 'Active' && p.shares > 0n) throw new MockIxError('already playing');
  const minted = mintShares(f, lamports);
  f.members += 1;
  const generation = f.generation;
  s.stats.deposited += lamports;
  if (!p) {
    p = {
      wallet,
      faction,
      shares: 0n,
      pendingDeposit: 0n,
      pendingWithdrawal: 0n,
      depositedTotal: 0n,
      allocTarget: DEFEND,
      allocAmount: 0n,
      allocEpoch: 0,
      generation,
      claimed: false,
      status: 'Active',
    };
    s.players.push(p);
  }
  p.faction = faction;
  p.generation = generation;
  p.shares = minted;
  p.depositedTotal += lamports;
  p.allocTarget = DEFEND;
  p.allocAmount = 0n;
  p.status = 'Active';
  return p;
}

function clearAlloc(g: Game, p: Player) {
  if (p.allocEpoch === g.epoch && p.allocTarget !== DEFEND) {
    const a = g.factions[p.faction].attackAlloc;
    a[p.allocTarget] -= p.allocAmount;
    if (a[p.allocTarget] < 0n) a[p.allocTarget] = 0n;
  }
  p.allocTarget = DEFEND;
  p.allocAmount = 0n;
  p.allocEpoch = g.epoch;
}

/** ER `allocate(target, amount)`; target = DEFEND (255) or a territory. */
export function ixAllocate(s: MockState, p: Player, target: number, amount: bigint) {
  const g = s.game;
  if (g.phase !== 'Active' || g.pendingVrf) throw new MockIxError('not accepting allocations');
  if (p.status !== 'Active') throw new MockIxError('not playing');
  clearAlloc(g, p);
  if (target === DEFEND) return;
  const value = valueOf(g.factions[p.faction], p.shares, p.generation);
  if (!validTargets(g, p.faction).includes(target)) throw new MockIxError('invalid target');
  const amt = amount > value ? value : amount;
  g.factions[p.faction].attackAlloc[target] += amt;
  p.allocTarget = target;
  p.allocAmount = amt;
}

/** ER `leave`: 80% of value → pending_withdrawal (then base `withdraw`, instant in the mock). */
export function ixLeave(s: MockState, p: Player): bigint {
  const g = s.game;
  if (g.pendingVrf) throw new MockIxError('battle resolving');
  if (p.status !== 'Active') throw new MockIxError('not playing');
  clearAlloc(g, p);
  const f = g.factions[p.faction];
  const live = p.generation === f.generation;
  const out = burnWithFee(f, p.shares, leaveFee(g), p.generation);
  if (live) f.members = Math.max(0, f.members - 1);
  p.shares = 0n;
  p.status = 'Left';
  s.stats.paidOut += out;
  return out;
}

/** ER `switch(to)`: 60% of value moves to `to`, 40% stays. */
export function ixSwitch(s: MockState, p: Player, to: number): bigint {
  const g = s.game;
  if (g.pendingVrf) throw new MockIxError('battle resolving');
  if (p.status !== 'Active') throw new MockIxError('not playing');
  if (to === p.faction || !g.factions[to].alive) throw new MockIxError('invalid kingdom');
  clearAlloc(g, p);
  const from = g.factions[p.faction];
  const moved = burnWithFee(from, p.shares, switchFee(g), p.generation);
  from.members = Math.max(0, from.members - 1);
  const target = g.factions[to];
  p.shares = mintShares(target, moved);
  target.members += 1;
  p.faction = to;
  p.generation = target.generation;
  return moved;
}

// ---------------------------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------------------------

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function fakeWallet(rand: Rand): string {
  let s = '';
  for (let i = 0; i < 44; i++) s += B58[Math.floor(rand() * B58.length)];
  return s;
}

function randBytes(rand: Rand): Uint8Array {
  return Uint8Array.from({ length: 32 }, () => Math.floor(rand() * 256));
}

function pick<T>(arr: T[], rand: Rand): T {
  return arr[Math.floor(rand() * arr.length)];
}

function randomStake(rand: Rand): bigint {
  // 0.05 .. ~2.5 SOL, skewed small.
  return solToLamports(0.05 + rand() ** 2 * 2.45);
}

export function mockConfig(epochSecs: number): GameConfig {
  return { ...DEFAULT_CONFIG, epochSecs, adjacency: [...ADJACENCY] };
}

export function createMockState(now: number, options: MockOptions = {}): MockState {
  const rand = options.rand ?? Math.random;
  const opts = { ...DEFAULTS, ...stripUndefined(options) };
  const s: MockState = {
    game: newGame(mockConfig(opts.epochSecs), { now: Math.floor(now) }),
    players: [],
    vrfAt: null,
    endedAt: null,
    stats: { deposited: 0n, paidOut: 0n, claimed: 0n },
    opts,
  };
  for (let f = 0; f < N_KINGDOMS; f++) {
    for (let i = 0; i < opts.initialBotsPerKingdom; i++) {
      ixJoin(s, fakeWallet(rand), f, randomStake(rand));
    }
  }
  return s;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** One bot decision. Errors from invalid moves are swallowed (bots are dumb). */
function botAct(s: MockState, rand: Rand) {
  const g = s.game;
  const active = s.players.filter((p) => p.status === 'Active');
  const roll = rand();
  try {
    if (roll < 0.08 && s.players.length < s.opts.maxBots) {
      // A newcomer joins an alive kingdom (slight bias to the leader).
      const alive = g.factions.map((f, i) => (f.alive ? i : -1)).filter((i) => i >= 0);
      const leader = alive.reduce((a, b) => (g.factions[b].territories > g.factions[a].territories ? b : a));
      ixJoin(s, fakeWallet(rand), rand() < 0.4 ? leader : pick(alive, rand), randomStake(rand));
      return;
    }
    if (roll < 0.11) {
      // Members of eliminated kingdoms (worth 0) re-join elsewhere with fresh SOL.
      const dead = s.players.filter(
        (p) => p.status !== 'Active' || p.generation !== g.factions[p.faction].generation,
      );
      if (dead.length > 0) {
        const p = pick(dead, rand);
        if (p.status === 'Active') ixLeave(s, p);
        const alive = g.factions.map((f, i) => (f.alive ? i : -1)).filter((i) => i >= 0);
        ixJoin(s, p.wallet, pick(alive, rand), randomStake(rand));
      }
      return;
    }
    if (active.length === 0) return;
    const p = pick(active, rand);
    const fac = g.factions[p.faction];
    if (!fac.alive) return;
    if (roll < 0.13) {
      ixLeave(s, p);
      return;
    }
    if (roll < 0.145) {
      const others = g.factions.map((f, i) => (f.alive && i !== p.faction ? i : -1)).filter((i) => i >= 0);
      if (others.length > 0) ixSwitch(s, p, pick(others, rand));
      return;
    }
    // Allocate: mostly attack the most beatable valid target, sometimes defend.
    const targets = validTargets(g, p.faction);
    if (targets.length === 0 || rand() < 0.3) {
      ixAllocate(s, p, DEFEND, 0n);
      return;
    }
    const scored = targets
      .map((t) => ({ t, p: battleOdds(g, t).pDefend + rand() * 0.4 }))
      .sort((a, b) => a.p - b.p);
    const value = valueOf(fac, p.shares, p.generation);
    const pct = BigInt(Math.floor(30 + rand() * 70));
    ixAllocate(s, p, scored[0].t, (value * pct) / 100n);
  } catch (e) {
    if (!(e instanceof MockIxError)) throw e;
  }
}

/**
 * Advances the mock to time `now` (unix seconds, may be fractional). Mutates `s`. Returns true
 * if a new game was started (so callers can reset UI state).
 */
export function stepMock(s: MockState, now: number, rand: Rand = Math.random): boolean {
  const g = s.game;

  if (g.phase === 'Ended') {
    if (s.endedAt !== null && now - s.endedAt >= s.opts.restartSecs) {
      const fresh = createMockState(now, { ...s.opts, rand });
      fresh.game.gameId = g.gameId + 1;
      Object.assign(s, fresh);
      return true;
    }
    return false;
  }

  if (g.pendingVrf) {
    if (s.vrfAt !== null && now >= s.vrfAt) {
      resolveEpoch(g, randBytes(rand), Math.floor(now));
      s.vrfAt = null;
      const ended = (g.phase as Game['phase']) === 'Ended';
      if (ended) s.endedAt = now;
      // Stale allocations are ignored on-chain (alloc_epoch != epoch); mirror that.
      for (const p of s.players) {
        p.allocTarget = DEFEND;
        p.allocAmount = 0n;
      }
      // Ended games: winners "claim" in the mock so the invariant holds.
      if (ended) {
        for (const p of s.players) {
          if (p.status === 'Active' && p.faction === g.winner) {
            const f = g.factions[p.faction];
            const out = valueOf(f, p.shares, p.generation);
            s.stats.claimed += out;
            p.status = 'Claimed';
            p.claimed = true;
          }
        }
      }
    }
    return false;
  }

  if (now >= g.epochEndsAt) {
    // resolve_epoch: request VRF.
    g.pendingVrf = true;
    s.vrfAt = now + s.opts.vrfDelaySecs;
    return false;
  }

  // Bots act more as the bell approaches.
  const left = g.epochEndsAt - now;
  const actions = left < 4 ? 3 : 1 + (rand() < 0.5 ? 1 : 0);
  for (let i = 0; i < actions; i++) botAct(s, rand);
  return false;
}

/**
 * Runs the mock on a timer. `onChange` receives a fresh clone of the game (new references, so
 * React/zustand re-render) and the player list. Returns an unsubscribe function.
 */
let current: { state: MockState; emit: () => void } | null = null;

/** The running mock (for the connected user's actions in mock mode), or null. */
export function currentMock() {
  return current;
}

export function runMock(
  onChange: (game: Game, players: Player[]) => void,
  options: MockOptions = {},
): () => void {
  const rand = options.rand ?? Math.random;
  const nowSecs = () => Date.now() / 1000;
  const s = createMockState(nowSecs(), options);
  const emit = () => onChange(cloneGame(s.game), s.players.map((p) => ({ ...p })));
  current = { state: s, emit };
  emit();
  const id = setInterval(() => {
    stepMock(s, nowSecs(), rand);
    emit();
  }, s.opts.tickMs);
  return () => {
    clearInterval(id);
    if (current?.state === s) current = null;
  };
}
