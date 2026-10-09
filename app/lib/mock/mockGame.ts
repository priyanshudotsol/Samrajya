/**
 * Mock mode (docs/KINGDOM_UI.md §10): a fake `samrajya` program running in the browser.
 * Bots join, allocate, leave and switch; an epoch ends every `epochSecs`, a fake "VRF" answers
 * ~1.5 s later and battles resolve with lib/game/math.ts. When one kingdom owns every territory
 * the game ends and a new one starts `restartSecs` later.
 *
 * Since the tactical layer (docs/ARCHITECTURE.md §10) every player also has a WARRIOR (`Unit`):
 * bots walk theirs around the courtyard, march on the realms they attack and pick roles and
 * gear; where everyone stands at the bell scales the odds (lib/game/tactics.ts). Kingdom chat
 * is in memory, one room per faction.
 *
 * The `ix*` functions mirror the program instructions (enlist / allocate / switch / leave /
 * upgrade / move_unit / set_role / set_gear / march) so the mock mutates state exactly the way
 * the chain will. Every entry costs the same ticket, and `ixNewWar` opens the next war once one
 * ends (anyone may, like `init_game`).
 */
import type { ChatMessage } from '@/lib/chat/types';
import { MAX_CHAT } from '@/lib/chat/types';
import { ADJACENCY, KINGDOMS, territoryName } from '@/lib/game/factions';
import {
  DEFAULT_CONFIG,
  applyUpgrade,
  battleOdds,
  seizeFort,
  burnWithFee,
  cloneGame,
  leaveFee,
  mintShares,
  newGame,
  resolveEpoch,
  switchFee,
  validTargets,
  valueOf,
} from '@/lib/game/math';
import { allFactors } from '@/lib/game/tactics';
import {
  canFight,
  GATE_HP,
  GATE_POINT,
  GATE_REACH,
  MAX_EVENTS,
  nearestEnemy,
  DODGE_COOLDOWN,
  DODGE_DIST,
  DODGE_SECS,
  RESPAWN_HP,
  RESPAWN_SECS,
  resolveStrike,
  weaponOf,
  type CombatEvent,
} from '@/lib/game/combat';
import { DEFEND, type Game, type GameConfig, N_KINGDOMS, N_TERRITORIES, PLAINS, type Player, UPGRADE } from '@/lib/game/types';
import {
  ACTION,
  arrivalPoint,
  GEAR,
  gearAllowed,
  inCircle,
  isInside,
  isMarching,
  marchTargets,
  newUnit,
  planRoute,
  ROLE,
  spawnPoint,
  type Gear,
  type Role,
  type Unit,
  type UnitAction,
  WALK_SPEED,
  WALL_APOTHEM,
  stepUnit,
  teleportUnit,
  zoneOf,
} from '@/lib/game/units';

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
  /** One warrior per player (index-aligned with nothing; look up by wallet). */
  units: Unit[];
  chat: ChatMessage[];
  /** unix seconds when the VRF "callback" lands (only while pendingVrf). */
  vrfAt: number | null;
  /** unix seconds when the game ended. */
  endedAt: number | null;
  /** paidOut = leave payouts; claimed = end-of-game claims (treasury is not reduced by claims). */
  stats: { deposited: bigint; paidOut: bigint; claimed: bigint };
  opts: Required<Omit<MockOptions, 'rand'>>;
  /** Bot walking goals, by wallet (not part of the chain state). */
  goals: Map<string, { x: number; z: number; until: number; rally?: number }>;
  /** Last chat time per faction (rate limit for bot chatter). */
  chatAt: number[];
  /** Gate hit points per territory (repaired at every bell). */
  gates: number[];
  /** Recent combat feedback (floating numbers, arrows, kill feed). */
  events: CombatEvent[];
  eventSeq: number;
  /** Rally pings: a kingdom's members (bots too) gather at the spot until `until`. */
  rallies: Rally[];
  now: number;
}

export interface Rally {
  faction: number;
  territory: number;
  x: number;
  z: number;
  by: string;
  until: number;
}

/** How long a rally ping lasts. */
export const RALLY_SECS = 25;

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

export function unitOf(s: MockState, wallet: string): Unit | undefined {
  return s.units.find((u) => u.wallet === wallet);
}

/** base `join` + ER `enlist` in one step. */
export function ixJoin(s: MockState, wallet: string, faction: number, lamports: bigint): Player {
  const g = s.game;
  if (g.phase === 'Ended') throw new MockIxError('game ended');
  if (lamports !== g.config.ticket) throw new MockIxError('entry must equal the ticket');
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
  // the warrior spawns in the kingdom's home realm (or its first walled realm if home was lost)
  const home = homeRealm(g, faction);
  s.units = s.units.filter((u) => u.wallet !== wallet);
  s.units.push(newUnit(wallet, faction, home ?? faction, s.now));
  return p;
}

/** The walled realm a kingdom's warriors live in: home if held, else its first held homeland. */
function homeRealm(g: Game, faction: number): number | null {
  if (g.territoryOwner[faction] === faction) return faction;
  const t = g.territoryOwner.findIndex((o, i) => o === faction && i !== PLAINS);
  return t >= 0 ? t : null;
}

/**
 * Squad assault (ARCHITECTURE §10.8): an order to attack a walled realm teleports the warrior to
 * the camp outside its gate; Defend (or the open plains) brings it home if it is away.
 */
function teleportForOrder(s: MockState, p: Player) {
  const u = unitOf(s, p.wallet);
  if (!u || u.hp <= 0) return;
  const g = s.game;
  const target = p.allocEpoch === g.epoch ? p.allocTarget : DEFEND;
  const to = target !== DEFEND && target < N_TERRITORIES ? target : g.territoryOwner[u.at] === u.faction ? u.at : homeRealm(g, u.faction);
  if (to === null || to === u.at) return;
  Object.assign(u, teleportUnit(u, g, to, s.now));
  s.goals.delete(u.wallet);
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
  if (target !== DEFEND && !validTargets(g, p.faction).includes(target)) throw new MockIxError('invalid target');
  clearAlloc(g, p);
  if (target !== DEFEND) {
    const value = valueOf(g.factions[p.faction], p.shares, p.generation);
    const amt = amount > value ? value : amount;
    g.factions[p.faction].attackAlloc[target] += amt;
    p.allocTarget = target;
    p.allocAmount = amt;
  }
  teleportForOrder(s, p);
}

/** ER `upgrade(kind)`: any member spends kingdom treasury; the SOL feeds the plains pot. */
export function ixUpgrade(s: MockState, p: Player, kind: number): bigint {
  if (p.status !== 'Active' || p.generation !== s.game.factions[p.faction].generation) throw new MockIxError('not playing');
  try {
    return applyUpgrade(s.game, p.faction, kind);
  } catch (e) {
    throw new MockIxError((e as Error).message);
  }
}

/** `init_game` for the next war (anyone may, once the current one has ended). */
export function ixNewWar(s: MockState, rand: Rand = Math.random) {
  if (s.game.phase !== 'Ended') throw new MockIxError('The current war is still being fought');
  const fresh = createMockState(s.now, { ...s.opts, rand });
  fresh.game.gameId = s.game.gameId + 1;
  Object.assign(s, fresh);
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
  s.units = s.units.filter((u) => u.wallet !== p.wallet);
  return out;
}

/** ER `switch(to)`: 60% of value moves to `to`, 40% stays. The warrior changes colours in place. */
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
  const u = unitOf(s, p.wallet);
  if (u) {
    u.faction = to;
    u.role = ROLE.GARRISON;
    if (!gearAllowed(u.gear, target.powers)) u.gear = GEAR.TALWAR;
  }
  return moved;
}

/**
 * The fort lock (user rule, 2026-10-09; ARCHITECTURE §10.10): the kingdom's own members come and
 * go as they like, but an enemy cannot pass the walls or the gate of realm `t` (no ladders, no
 * battering) while a single member of the owner stands alive in that realm. Kill them all and the
 * gate swings open. (`gates` is ignored: gates are no longer battered down.)
 */
export function gateOpenFor(game: Game, units: Unit[], u: Unit, t: number, now: number, _gates?: number[]): boolean {
  void _gates;
  if (t === PLAINS || game.territoryOwner[t] === u.faction) return true;
  return !fortHeld(game, units, t, now);
}

/** Does a living member of realm `t`'s owner still stand in it (so the gate stays shut to enemies)? */
export function fortHeld(game: Game, units: Unit[], t: number, now: number): boolean {
  const owner = game.territoryOwner[t];
  return units.some((o) => o.faction === owner && o.at === t && o.hp > 0 && !isMarching(o, now));
}

/** Movement rules for `u` in realm `t`: a ladder only climbs walls the gate would also let it through. */
export function moveRulesFor(game: Game, units: Unit[], u: Unit, t: number, now: number) {
  // Kurukshetra has no walls at all
  if (t === PLAINS) return { gateOpen: true, canClimb: false, open: true };
  const gateOpen = gateOpenFor(game, units, u, t, now);
  return { gateOpen, canClimb: u.gear === GEAR.SEEDHI && gateOpen };
}

/** ER `move_unit(x, z, facing, action)`: the client walks; the program validates the step. */
export function ixMoveUnit(s: MockState, p: Player, x: number, z: number, facing: number, action: UnitAction) {
  const u = unitOf(s, p.wallet);
  if (!u || p.status !== 'Active') throw new MockIxError('no warrior');
  if (isMarching(u, s.now)) throw new MockIxError('on the march');
  if (u.hp <= 0) throw new MockIxError('fallen');
  // validate against the walls the same way the client does (max step per call, walls, gate)
  const dx = x - u.x;
  const dz = z - u.z;
  const dist = Math.hypot(dx, dz);
  const maxStep = 1.2; // ≥ RUN_SPEED × 2 ticks of 10 Hz, with slack for lag
  const k = dist > maxStep ? maxStep / dist : 1;
  const rules = moveRulesFor(s.game, s.units, u, u.at, s.now);
  const r = stepUnit(u.x, u.z, dx * k, dz * k, rules);
  u.x = r.x;
  u.z = r.z;
  u.facing = facing;
  // a roll is allowed once per DODGE_COOLDOWN (it opens the invulnerable window)
  if (action === ACTION.DODGE && u.action !== ACTION.DODGE) {
    if (s.now - (u.dodgeAt ?? -1e9) < DODGE_COOLDOWN) action = ACTION.WALK;
    else u.dodgeAt = s.now;
  }
  u.action = r.climbing ? ACTION.CLIMB : action;
  u.updatedAt = s.now;
}

export function ixSetRole(s: MockState, p: Player, role: Role) {
  const u = unitOf(s, p.wallet);
  if (!u) throw new MockIxError('no warrior');
  u.role = role;
  u.updatedAt = s.now;
}

export function ixSetGear(s: MockState, p: Player, gear: Gear) {
  const u = unitOf(s, p.wallet);
  if (!u) throw new MockIxError('no warrior');
  if (!gearAllowed(gear, s.game.factions[u.faction].powers)) throw new MockIxError('your kingdom cannot field that');
  u.gear = gear;
  u.updatedAt = s.now;
}

/** ER `march(to)`: teleport to a neighbouring realm (its courtyard if held, else the camp at its gate). */
export function ixMarch(s: MockState, p: Player, to: number) {
  const u = unitOf(s, p.wallet);
  if (!u || p.status !== 'Active') throw new MockIxError('no warrior');
  if (u.hp <= 0) throw new MockIxError('fallen');
  if (!marchTargets(s.game, u.faction, u.at).includes(to)) throw new MockIxError('not a neighbouring realm');
  Object.assign(u, teleportUnit(u, s.game, to, s.now));
}

function pushEvent(s: MockState, e: Omit<CombatEvent, 'id' | 'at'>) {
  s.events.push({ ...e, id: ++s.eventSeq, at: s.now });
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
}

/** Applies one strike by `u` facing `facing` (shared by the player's `strike` and the bots). */
function applyStrike(s: MockState, u: Unit, facing: number, cooldownScale = 1, opts: { heavy?: boolean; combo?: number } = {}) {
  const w = weaponOf(u.gear);
  u.facing = facing;
  u.action = ACTION.ATTACK;
  u.readyAt = s.now + w.cooldown * cooldownScale * (opts.heavy ? 1.4 : 1);
  u.updatedAt = s.now;
  const owner = s.game.territoryOwner[u.at];
  const finisher = (opts.combo ?? 0) >= 3;
  const r = resolveStrike(u, facing, s.units, owner, s.gates[u.at], s.now, { heavy: opts.heavy, finisher });
  const base = { territory: u.at, by: u.wallet, byFaction: u.faction, gear: u.gear, heavy: opts.heavy, combo: opts.combo };
  if (r.arrowEnd) pushEvent(s, { ...base, kind: 'arrow', x: u.x, z: u.z, x2: r.arrowEnd.x, z2: r.arrowEnd.z });
  else pushEvent(s, { ...base, kind: 'swing', x: u.x, z: u.z });
  for (const h of r.hits) {
    const t = unitOf(s, h.wallet);
    if (!t) continue;
    t.hp = Math.max(0, t.hp - h.damage);
    // thrown back along the blow (walls still hold)
    const kd = Math.hypot(t.x - u.x, t.z - u.z) || 1;
    const kr = stepUnit(t.x, t.z, ((t.x - u.x) / kd) * h.knock, ((t.z - u.z) / kd) * h.knock, moveRulesFor(s.game, s.units, t, t.at, s.now));
    t.x = kr.x;
    t.z = kr.z;
    pushEvent(s, { ...base, kind: h.blocked ? 'block' : 'hit', target: t.wallet, damage: h.damage, knock: h.knock, x: t.x, z: t.z });
    if (t.hp <= 0) {
      t.hp = 0;
      t.action = ACTION.DEAD;
      // out of the fight until the bell (§10.8): a cleared fort stays cleared
      t.deadUntil = Math.max(s.game.epochEndsAt, s.now + RESPAWN_SECS);
      t.marchTo = null;
      s.goals.delete(t.wallet);
      pushEvent(s, { ...base, kind: 'kill', target: t.wallet, x: t.x, z: t.z });
    }
  }
  if (r.gateDamage > 0) {
    s.gates[u.at] = Math.max(0, s.gates[u.at] - r.gateDamage);
    pushEvent(s, { ...base, kind: s.gates[u.at] <= 0 ? 'gate-broken' : 'gate', damage: r.gateDamage, x: GATE_POINT.x, z: GATE_POINT.z });
    if (s.gates[u.at] <= 0) {
      postChat(s, u.faction, '', `The gate of ${territoryName(u.at)} is broken — pour in!`, true);
      postChat(s, owner, '', `Our gate at ${territoryName(u.at)} has fallen — hold the courtyard!`, true);
    }
  }
  return r;
}

/** ER `strike(x, z, facing)`: sync the last step, then swing / thrust / shoot with your gear. */
export function ixStrike(s: MockState, p: Player, x: number, z: number, facing: number, opts: { heavy?: boolean; combo?: number } = {}) {
  const u = unitOf(s, p.wallet);
  if (!u || p.status !== 'Active') throw new MockIxError('no warrior');
  if (!canFight(u, s.now)) throw new MockIxError(u.hp <= 0 ? 'fallen' : 'on the march');
  // slack for the round trip and the mock's tick (its clock trails real time by up to a tick)
  if (s.now + 0.2 < u.readyAt) throw new MockIxError('not ready');
  ixMoveUnit(s, p, x, z, facing, ACTION.ATTACK);
  return applyStrike(s, u, facing, 1, opts);
}

/** A rally ping: your kingdom (bots included) gathers at (x, z) in `territory`. */
export function ixRally(s: MockState, p: Player, territory: number, x: number, z: number) {
  if (p.status !== 'Active') throw new MockIxError('pledge to a kingdom first');
  const last = s.rallies.find((r) => r.by === p.wallet);
  if (last && s.now - (last.until - RALLY_SECS) < 2) throw new MockIxError('slow down');
  s.rallies = s.rallies.filter((r) => r.by !== p.wallet && r.until > s.now);
  s.rallies.push({ faction: p.faction, territory, x, z, by: p.wallet, until: s.now + RALLY_SECS });
  const owner = s.game.territoryOwner[territory];
  const where = `${ZONE_WORDS[zoneOf(x, z)]} of ${KINGDOMS[territory].name}`;
  const call = owner === p.faction ? `Defend ${where}` : `Attack ${where}`;
  postChat(s, p.faction, p.wallet, `📍 ${call}`, false, { territory, x, z });
}

const ZONE_WORDS: Record<ReturnType<typeof zoneOf>, string> = {
  keep: 'the keep',
  inside: 'the courtyard',
  gate: 'the gate',
  field: 'the field',
  edge: 'the far edge',
};

/** Fallen warriors get back up at home once their time is up (never before the bell is decided). */
function respawnFallen(s: MockState) {
  const g = s.game;
  if (g.pendingVrf) return;
  for (const u of s.units) {
    if (u.hp > 0 || u.deadUntil <= 0 || s.now < u.deadUntil) continue;
    const home = homeRealm(g, u.faction) ?? u.at;
    const sp = spawnPoint(u.wallet + s.now.toFixed(0));
    u.at = home;
    u.x = sp.x;
    u.z = sp.z;
    u.facing = sp.facing;
    u.hp = RESPAWN_HP;
    u.deadUntil = 0;
    u.marchTo = null;
    u.action = ACTION.IDLE;
    u.updatedAt = s.now;
    s.goals.delete(u.wallet);
    // a member with an order for the new epoch gets back up with the squad at the enemy gate
    const p = s.players.find((x) => x.wallet === u.wallet);
    if (p) teleportForOrder(s, p);
    pushEvent(s, { territory: u.at, kind: 'respawn', by: u.wallet, byFaction: u.faction, x: u.x, z: u.z, gear: u.gear });
  }
}

/**
 * `seize` (§10.11): a warrior inside the walls of a realm it was ordered to attack, while no
 * member of the owner stands alive there, takes it at once (no bell).
 */
function seizeAbandoned(s: MockState, rand: Rand) {
  const g = s.game;
  for (let t = 0; t < N_TERRITORIES; t++) {
    if (fortHeld(g, s.units, t, s.now)) continue;
    const owner = g.territoryOwner[t];
    // inside the walls of a fort, or in the stone circle of Kurukshetra
    const claims = (u: Unit) => (t === PLAINS ? inCircle(u.x, u.z) : isInside(u.x, u.z));
    const taker = s.units.find((u) => {
      if (u.at !== t || u.faction === owner || u.hp <= 0 || isMarching(u, s.now) || !claims(u)) return false;
      const p = s.players.find((x) => x.wallet === u.wallet);
      return !!p && p.status === 'Active' && p.allocEpoch === g.epoch && p.allocTarget === t;
    });
    if (!taker) continue;
    const e = seizeFort(g, t, taker.faction);
    if (!e) continue;
    for (const p of s.players) if (p.allocEpoch === g.epoch && p.allocTarget === t) {
      p.allocTarget = DEFEND;
      p.allocAmount = 0n;
    }
    afterBattles(s, [e], rand);
    postChat(s, taker.faction, '', `${territoryName(t)} stood empty — we walked in and took it.`, true);
  }
}

/** Once the war has a winner: note when it ended and let the winners "claim" (keeps the SOL invariant). */
function finishIfEnded(s: MockState, now: number): boolean {
  const g = s.game;
  if (g.phase !== 'Ended' || s.endedAt !== null) return g.phase === 'Ended';
  s.endedAt = now;
  for (const p of s.players) {
    if (p.status === 'Active' && p.faction === g.winner) {
      const out = valueOf(g.factions[p.faction], p.shares, p.generation);
      s.stats.claimed += out;
      p.status = 'Claimed';
      p.claimed = true;
    }
  }
  return true;
}

/** Lands marches that have arrived. */
function settleMarches(s: MockState) {
  for (const u of s.units) {
    if (u.marchTo !== null && s.now >= u.marchAt) {
      const a = arrivalPoint(u.marchTo, u.marchFrom);
      u.at = u.marchTo;
      u.x = a.x;
      u.z = a.z;
      u.facing = a.facing;
      u.marchTo = null;
      u.action = ACTION.IDLE;
      u.updatedAt = s.now;
    }
  }
}

export function postChat(s: MockState, faction: number, wallet: string, text: string, system = false, ping?: ChatMessage['ping']) {
  s.chat.push({ id: `${s.now.toFixed(3)}:${wallet}:${s.chat.length}`, gameId: s.game.gameId, faction, wallet, text, at: Math.round(s.now * 1000), system, ...(ping ? { ping } : {}) });
  if (s.chat.length > MAX_CHAT * N_KINGDOMS) s.chat.splice(0, s.chat.length - MAX_CHAT * N_KINGDOMS);
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

export function mockConfig(epochSecs: number): GameConfig {
  return { ...DEFAULT_CONFIG, epochSecs, adjacency: [...ADJACENCY] };
}

export function createMockState(now: number, options: MockOptions = {}): MockState {
  const rand = options.rand ?? Math.random;
  const opts = { ...DEFAULTS, ...stripUndefined(options) };
  const s: MockState = {
    game: newGame(mockConfig(opts.epochSecs), { now: Math.floor(now) }),
    players: [],
    units: [],
    chat: [],
    vrfAt: null,
    endedAt: null,
    stats: { deposited: 0n, paidOut: 0n, claimed: 0n },
    opts,
    goals: new Map(),
    chatAt: Array.from({ length: N_KINGDOMS }, () => 0),
    gates: Array.from({ length: N_KINGDOMS }, () => GATE_HP),
    events: [],
    eventSeq: 0,
    rallies: [],
    now,
  };
  for (let f = 0; f < N_KINGDOMS; f++) {
    for (let i = 0; i < opts.initialBotsPerKingdom; i++) {
      ixJoin(s, fakeWallet(rand), f, s.game.config.ticket);
    }
    // a spread of gear so the realms look varied
    s.units.filter((u) => u.faction === f).forEach((u, i) => (u.gear = ([GEAR.TALWAR, GEAR.DHAL, GEAR.DHANUSH, GEAR.BHALA] as Gear[])[i % 4]));
  }
  return s;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const chatter = (s: MockState, faction: number, wallet: string, text: string, rand: Rand, p = 0.5) => {
  if (s.now - s.chatAt[faction] < 4 || rand() > p) return;
  s.chatAt[faction] = s.now;
  postChat(s, faction, wallet, text);
};

/** One bot decision. Errors from invalid moves are swallowed (bots are dumb). */
function botAct(s: MockState, rand: Rand, me: string | null) {
  const g = s.game;
  const active = s.players.filter((p) => p.status === 'Active' && p.wallet !== me);
  const roll = rand();
  try {
    if (roll < 0.08 && s.players.length < s.opts.maxBots) {
      // A newcomer joins an alive kingdom (slight bias to the leader).
      const alive = g.factions.map((f, i) => (f.alive ? i : -1)).filter((i) => i >= 0);
      const leader = alive.reduce((a, b) => (g.factions[b].territories > g.factions[a].territories ? b : a));
      const f = rand() < 0.4 ? leader : pick(alive, rand);
      const p = ixJoin(s, fakeWallet(rand), f, g.config.ticket);
      postChat(s, f, p.wallet, `${p.wallet.slice(0, 4)}… pledged to ${KINGDOMS[f].name}`, true);
      return;
    }
    if (roll < 0.11) {
      // Members of eliminated kingdoms (worth 0) re-join elsewhere with fresh SOL.
      const dead = s.players.filter(
        (p) => p.wallet !== me && (p.status !== 'Active' || p.generation !== g.factions[p.faction].generation),
      );
      if (dead.length > 0) {
        const p = pick(dead, rand);
        if (p.status === 'Active') ixLeave(s, p);
        const alive = g.factions.map((f, i) => (f.alive ? i : -1)).filter((i) => i >= 0);
        ixJoin(s, p.wallet, pick(alive, rand), g.config.ticket);
      }
      return;
    }
    if (active.length === 0) return;
    const p = pick(active, rand);
    const fac = g.factions[p.faction];
    if (!fac.alive) return;
    if (roll < 0.125) {
      ixLeave(s, p);
      return;
    }
    if (roll < 0.135) {
      const others = g.factions.map((f, i) => (f.alive && i !== p.faction ? i : -1)).filter((i) => i >= 0);
      if (others.length > 0) ixSwitch(s, p, pick(others, rand));
      return;
    }
    if (roll < 0.16) {
      // Spend some treasury: walls when threatened, the armory otherwise.
      const kind = rand() < 0.5 ? UPGRADE.WALLS : UPGRADE.ARMORY;
      const cost = ixUpgrade(s, p, kind);
      chatter(s, p.faction, p.wallet, `Bought ${kind === UPGRADE.WALLS ? 'stronger walls' : 'new weapons'} for ${(Number(cost) / 1e9).toFixed(3)} ◎ from the treasury.`, rand, 0.8);
      return;
    }
    // Allocate: mostly attack the most beatable valid target, sometimes defend.
    const targets = validTargets(g, p.faction);
    const u = unitOf(s, p.wallet);
    // only the living hold a fort (§10.8): a kingdom keeps some members home (all-in loses home)
    const kin = s.players.filter((x) => x.status === 'Active' && x.faction === p.faction && x.wallet !== p.wallet);
    const away = kin.filter((x) => x.allocEpoch === g.epoch && x.allocTarget !== DEFEND).length;
    if (targets.length === 0 || rand() < 0.3 || away + 1 > Math.ceil(kin.length * 0.7)) {
      ixAllocate(s, p, DEFEND, 0n);
      if (u) {
        u.role = ROLE.GARRISON;
        if (rand() < 0.5 && gearAllowed(GEAR.DHAL, fac.powers)) u.gear = rand() < 0.5 ? GEAR.DHAL : GEAR.DHANUSH;
      }
      chatter(s, p.faction, p.wallet, pick(['I hold the keep this epoch.', 'Staying inside the walls.', 'Garrison here — who is marching?'], rand), rand, 0.35);
      return;
    }
    const scored = targets
      .map((t) => ({ t, p: battleOdds(g, t).pDefend + rand() * 0.4 }))
      .sort((a, b) => a.p - b.p);
    const value = valueOf(fac, p.shares, p.generation);
    const pct = BigInt(Math.floor(30 + rand() * 70));
    const t = scored[0].t;
    ixAllocate(s, p, t, (value * pct) / 100n);
    if (u) {
      u.role = pick([ROLE.VANGUARD, ROLE.VANGUARD, ROLE.FLANK, ROLE.REAR] as Role[], rand);
      const want: Gear = u.role === ROLE.REAR ? GEAR.DHANUSH : rand() < 0.3 ? GEAR.SEEDHI : rand() < 0.5 ? GEAR.BHALA : GEAR.TALWAR;
      if (gearAllowed(GEAR.GAJA, fac.powers) && rand() < 0.3) u.gear = GEAR.GAJA;
      else u.gear = want;
      chatter(s, p.faction, p.wallet, `Marching on ${territoryName(t)} with ${(Number(pct)).toFixed(0)}% — ${u.role === ROLE.VANGUARD ? 'I take the gate' : u.role === ROLE.FLANK ? 'I go round the side' : 'bows from the rear'}.`, rand, 0.6);
    }
  } catch (e) {
    if (!(e instanceof MockIxError)) throw e;
  }
}

/** Where a bot warrior wants to be, given its orders. */
function botGoal(s: MockState, p: Player, u: Unit, rand: Rand): { x: number; z: number } | 'march' | null {
  const g = s.game;
  const owner = g.territoryOwner[u.at];
  const attacking = p.allocEpoch === g.epoch && p.allocTarget !== DEFEND ? p.allocTarget : null;
  if (attacking !== null) {
    if (u.at !== attacking) {
      // walk to the gate road, then march if the target is a neighbour of here
      if (marchTargets(g, u.faction, u.at).includes(attacking)) return 'march';
      // otherwise go home first (the march AI below handles it)
      return null;
    }
    // Kurukshetra: crowd into the stone circle
    if (attacking === PLAINS) return { x: (rand() - 0.5) * 1.6, z: (rand() - 0.5) * 1.6 };
    // at the target: take up the role's position outside the enemy walls
    const gateZ = WALL_APOTHEM;
    switch (u.role) {
      case ROLE.VANGUARD:
        // into the gate opening to fight whoever holds it (or walk in once the garrison is dead)
        return fortHeld(g, s.units, u.at, s.now) ? { x: (rand() - 0.5) * 0.4, z: gateZ + 0.05 + rand() * 0.15 } : { x: (rand() - 0.5) * 1.2, z: (rand() - 0.5) * 1.2 };
      case ROLE.FLANK: {
        const side = rand() < 0.5 ? -1 : 1;
        return { x: side * (1.9 + rand() * 0.8), z: 0.6 + rand() * 1.4 };
      }
      case ROLE.REAR:
        return { x: (rand() - 0.5) * 2.2, z: gateZ + 1.8 + rand() * 0.8 };
      default:
        return { x: (rand() - 0.5) * 1.5, z: gateZ + 0.9 + rand() * 0.6 };
    }
  }
  // defending: be inside a realm your kingdom owns
  if (owner !== u.faction) {
    const mine = g.territoryOwner.map((o, t) => (o === u.faction ? t : -1)).filter((t) => t >= 0);
    const here = marchTargets(g, u.faction, u.at).filter((t) => mine.includes(t));
    if (here.length) return 'march';
    return null;
  }
  // enemies at our gate: hold the gate mouth (the only way in, §10.10); archers take the walls
  const atGate = s.units.some((o) => o.at === u.at && o.faction !== u.faction && o.hp > 0 && Math.hypot(o.x - GATE_POINT.x, o.z - GATE_POINT.z) < 1.4);
  if (atGate && u.gear !== GEAR.DHANUSH) return { x: (rand() - 0.5) * 0.45, z: WALL_APOTHEM - 0.05 - rand() * 0.25 };
  const a = rand() * Math.PI * 2;
  const r = 1.15 + rand() * 0.75;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

/** Bots swing a little slower than a human can (cooldown × this). */
const BOT_COOLDOWN = 1.5;

/** Moves bot `u` up to `step` towards (x, z) under the movement rules. Returns the distance moved. */
function walkBot(s: MockState, u: Unit, x: number, z: number, step: number): number {
  // round the fort instead of into it (through the gate when it lets this bot in)
  if (u.gear !== GEAR.SEEDHI) {
    const r = planRoute(u, { x, z }, { canClimb: false, gateOpen: gateOpenFor(s.game, s.units, u, u.at, s.now) });
    const next = r.route.find((pt, i) => i === r.route.length - 1 || Math.hypot(pt.x - u.x, pt.z - u.z) > 0.1);
    if (next) ({ x, z } = next);
  }
  const dx = x - u.x;
  const dz = z - u.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-3) return 0;
  const k = Math.min(dist, step) / dist;
  const rules = moveRulesFor(s.game, s.units, u, u.at, s.now);
  const r = stepUnit(u.x, u.z, dx * k, dz * k, rules);
  const moved = Math.hypot(r.x - u.x, r.z - u.z);
  u.facing = Math.atan2(dx, dz);
  u.x = r.x;
  u.z = r.z;
  u.action = r.climbing ? ACTION.CLIMB : moved > 0.01 ? ACTION.WALK : ACTION.IDLE;
  u.updatedAt = s.now;
  return moved;
}

/** Fight the nearest enemy in reach. Returns true if the bot spent its tick fighting. */
function botFight(s: MockState, u: Unit, dt: number, rand: Rand): boolean {
  const w = weaponOf(u.gear);
  const aggro = w.ranged ? 3.8 : 2.2;
  const foe = nearestEnemy(u, s.units, aggro, s.now);
  if (!foe) return false;
  const face = Math.atan2(foe.unit.x - u.x, foe.unit.z - u.z);
  const reach = w.range * (w.ranged ? 0.9 : 0.85);
  if (foe.dist > reach) {
    // close in (archers too, until in range)
    const moved = walkBot(s, u, foe.unit.x, foe.unit.z, Math.min(foe.dist - reach * 0.8, WALK_SPEED * 1.2 * dt));
    if (moved < 0.01) return false; // a wall is in the way: go about your orders
    return true;
  }
  u.facing = face;
  // read the foe (§10.10): roll away from a heavy wind-up, guard against light blows
  if (foe.unit.action === ACTION.CHARGE && s.now - (u.dodgeAt ?? -1e9) >= DODGE_COOLDOWN && rand() < 0.5 * dt * 8) {
    const r = stepUnit(u.x, u.z, -Math.sin(face) * DODGE_DIST * 0.8, -Math.cos(face) * DODGE_DIST * 0.8, moveRulesFor(s.game, s.units, u, u.at, s.now));
    u.x = r.x;
    u.z = r.z;
    u.action = ACTION.DODGE;
    u.dodgeAt = s.now;
    u.updatedAt = s.now;
    return true;
  }
  if (u.action === ACTION.DODGE && s.now - (u.dodgeAt ?? 0) < DODGE_SECS) return true;
  if (s.now < u.readyAt) {
    // between swings: shields and wary warriors raise their guard, others square up
    const guard = u.gear === GEAR.DHAL ? 0.6 : foe.unit.action === ACTION.ATTACK ? 0.35 : 0.1;
    u.action = rand() < guard ? ACTION.BLOCK : ACTION.IDLE;
    return true;
  }
  // a raised guard invites a heavy blow; otherwise a combo of light ones
  const heavy = foe.unit.action === ACTION.BLOCK ? rand() < 0.6 : rand() < 0.12;
  const combo = ((botCombo.get(u.wallet) ?? 0) % 3) + 1;
  botCombo.set(u.wallet, combo);
  applyStrike(s, u, face, BOT_COOLDOWN + rand() * 0.6, { heavy, combo: heavy ? undefined : combo });
  return true;
}

const botCombo = new Map<string, number>();

/** Walks every bot warrior towards its goal for `dt` seconds, fighting whoever comes close. */
function stepBots(s: MockState, dt: number, rand: Rand, me: string | null) {
  const g = s.game;
  for (const u of s.units) {
    if (u.wallet === me) continue;
    if (isMarching(u, s.now) || u.hp <= 0) continue;
    const p = s.players.find((x) => x.wallet === u.wallet);
    if (!p || p.status !== 'Active') continue;
    if (botFight(s, u, dt, rand)) continue;
    let goal = s.goals.get(u.wallet);
    // answer a rally of your kingdom in this realm (most of the time)
    const rally = s.rallies.find((r) => r.faction === u.faction && r.territory === u.at && r.until > s.now);
    if (rally && (!goal || goal.rally !== rally.until) && rand() < 0.8) {
      goal = { x: rally.x + (rand() - 0.5) * 0.9, z: rally.z + (rand() - 0.5) * 0.9, until: rally.until, rally: rally.until };
      s.goals.set(u.wallet, goal);
    }
    if (!goal || s.now >= goal.until) {
      const want = botGoal(s, p, u, rand);
      if (want === 'march') {
        const attacking = p.allocEpoch === g.epoch && p.allocTarget !== DEFEND ? p.allocTarget : null;
        const to =
          attacking !== null && marchTargets(g, u.faction, u.at).includes(attacking)
            ? attacking
            : marchTargets(g, u.faction, u.at).find((t) => g.territoryOwner[t] === u.faction);
        if (to !== undefined) {
          try {
            ixMarch(s, p, to);
          } catch (e) {
            if (!(e instanceof MockIxError)) throw e;
          }
        }
        s.goals.delete(u.wallet);
        continue;
      }
      if (!want) {
        u.action = ACTION.IDLE;
        continue;
      }
      goal = { x: want.x, z: want.z, until: s.now + 4 + rand() * 6 };
      s.goals.set(u.wallet, goal);
    }
    const dist = Math.hypot(goal.x - u.x, goal.z - u.z);
    if (dist < 0.08) {
      u.action = u.role === ROLE.GARRISON && rand() < 0.3 ? ACTION.BLOCK : ACTION.IDLE;
      continue;
    }
    const moved = walkBot(s, u, goal.x, goal.z, WALK_SPEED * dt);
    if (moved < 0.01 && u.action !== ACTION.CLIMB) goal.until = s.now; // blocked: pick another goal next tick
  }
}

/** After the battles: wounds, routs and the conquerors moving in. */
function afterBattles(s: MockState, entries: ReturnType<typeof resolveEpoch>, rand: Rand) {
  const g = s.game;
  // a warrior sent home from one battle is not counted again in its home realm's battle
  const settled = new Set<string>();
  for (const e of entries) {
    for (const u of s.units) {
      if (u.at !== e.territory || isMarching(u, s.now) || u.hp <= 0 || settled.has(u.wallet)) continue;
      settled.add(u.wallet);
      const won = u.faction === e.winner;
      if (won) u.hp = Math.min(100, u.hp + 10);
      else u.hp = Math.max(5, u.hp - (u.faction === e.defender ? 35 : 25));
      if (!won && u.faction !== e.defender) {
        // a beaten squad is pulled back home
        const home = homeRealm(g, u.faction);
        if (home !== null) Object.assign(u, teleportUnit(u, g, home, s.now));
      } else if (e.winner !== e.defender) {
        if (u.faction === e.defender) {
          // routed: back to a realm the kingdom still holds (none left → eliminated below)
          const home = homeRealm(g, u.faction);
          if (home !== null) Object.assign(u, teleportUnit(u, g, home, s.now));
        } else if (won) {
          const a = rand() * Math.PI * 2;
          const r = 1.2 + rand() * 0.6;
          u.x = Math.cos(a) * r;
          u.z = Math.sin(a) * r;
          u.action = ACTION.IDLE;
          u.role = ROLE.GARRISON;
          u.updatedAt = s.now;
        }
      }
      s.goals.delete(u.wallet);
    }
    if (e.captured) postChat(s, e.winner, '', `${territoryName(e.territory)} was abandoned — we walked in without a fight.`, true);
    if (e.eliminated) {
      s.units = s.units.filter((u) => u.faction !== e.defender);
    }
  }
  // everyone alive heals a little each epoch; every gate is repaired
  for (const u of s.units) if (u.hp > 0) u.hp = Math.min(100, u.hp + 5);
  s.gates.fill(GATE_HP);
  s.rallies = s.rallies.filter((r) => r.until > s.now);
  // a kingdom under attack warns its members
  for (let t = 0; t < N_KINGDOMS; t++) {
    const owner = g.territoryOwner[t];
    const enemies = s.units.filter((u) => u.at === t && u.faction !== owner && !isMarching(u, s.now));
    if (enemies.length >= 2 && s.now - s.chatAt[owner] > 6) {
      const by = KINGDOMS[enemies[0].faction].name;
      s.chatAt[owner] = s.now;
      const voice = s.units.find((u) => u.faction === owner);
      if (voice) postChat(s, owner, voice.wallet, `${by} is at the gate of ${territoryName(t)} — everyone inside the walls!`);
    }
  }
}

/**
 * Advances the mock to time `now` (unix seconds, may be fractional). Mutates `s`. Returns true
 * if a new game was started (so callers can reset UI state). `me` is the connected wallet,
 * whose warrior is never moved by the bot AI.
 */
export function stepMock(s: MockState, now: number, rand: Rand = Math.random, me: string | null = null): boolean {
  const g = s.game;
  const dt = Math.max(0, Math.min(2, now - s.now));
  s.now = now;

  if (g.phase === 'Ended') {
    if (s.endedAt !== null && now - s.endedAt >= s.opts.restartSecs) {
      const fresh = createMockState(now, { ...s.opts, rand });
      fresh.game.gameId = g.gameId + 1;
      Object.assign(s, fresh);
      return true;
    }
    return false;
  }

  settleMarches(s);
  respawnFallen(s);

  if (g.pendingVrf) {
    if (s.vrfAt !== null && now >= s.vrfAt) {
      const factors = allFactors(g, s.units, now);
      const entries = resolveEpoch(g, randBytes(rand), Math.floor(now), factors);
      afterBattles(s, entries, rand);
      s.vrfAt = null;
      // Stale allocations are ignored on-chain (alloc_epoch != epoch); mirror that.
      for (const p of s.players) {
        p.allocTarget = DEFEND;
        p.allocAmount = 0n;
      }
      finishIfEnded(s, now);
    }
    return false;
  }

  // an empty fort falls the moment an attacker walks in (§10.11)
  if (g.phase === 'Active') {
    seizeAbandoned(s, rand);
    if (finishIfEnded(s, now)) return false;
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
  for (let i = 0; i < actions; i++) botAct(s, rand, me);
  stepBots(s, dt, rand, me);
  return false;
}

/**
 * Runs the mock on a timer. `onChange` receives a fresh clone of the game (new references, so
 * React/zustand re-render), the player list, the units and the chat. Returns an unsubscribe
 * function.
 */
let current: { state: MockState; emit: () => void; me: () => string | null } | null = null;

/** The running mock (for the connected user's actions in mock mode), or null. */
export function currentMock() {
  return current;
}

export interface MockExtras {
  gates: number[];
  events: CombatEvent[];
  rallies: Rally[];
}

export function runMock(
  onChange: (game: Game, players: Player[], units: Unit[], chat: ChatMessage[], extras: MockExtras) => void,
  options: MockOptions = {},
  me: () => string | null = () => null,
): () => void {
  const rand = options.rand ?? Math.random;
  const nowSecs = () => Date.now() / 1000;
  const s = createMockState(nowSecs(), options);
  const emit = () =>
    onChange(cloneGame(s.game), s.players.map((p) => ({ ...p })), s.units.map((u) => ({ ...u })), s.chat.slice(), {
      gates: s.gates.slice(),
      events: s.events.slice(),
      rallies: s.rallies.filter((r) => r.until > s.now).map((r) => ({ ...r })),
    });
  current = { state: s, emit, me };
  emit();
  const id = setInterval(() => {
    stepMock(s, nowSecs(), rand, me());
    emit();
  }, s.opts.tickMs);
  return () => {
    clearInterval(id);
    if (current?.state === s) current = null;
  };
}
