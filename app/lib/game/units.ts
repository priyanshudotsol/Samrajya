/**
 * Sainik (warrior) units: the tactical layer (docs/ARCHITECTURE.md §10).
 *
 * Every active member has ONE warrior. It stands in exactly one realm (`at`), at a position in
 * that realm's coordinates (the same x/z the diorama uses: the keep at the origin, the hexagonal
 * curtain wall at WALL_RADIUS, the gate mid-edge at +z, enemy camps at CAMP_RADIUS).
 *
 * The on-chain mirror is `Player.unit` (i16 ×100 for x/z, u8 for the rest); the mock stores the
 * same fields as plain numbers. Everything here is pure geometry and rules; nothing renders.
 */
import { ADJACENCY, POWER } from './factions';
import { bearing, CAMP_RADIUS, WALL_RADIUS } from '@/lib/realm/layout';

import { N_KINGDOMS, type Game } from './types';

// ---------------------------------------------------------------------------------------------
// Enums (u8 on-chain)
// ---------------------------------------------------------------------------------------------

export const ROLE = { GARRISON: 0, VANGUARD: 1, FLANK: 2, REAR: 3 } as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

export const GEAR = { TALWAR: 0, BHALA: 1, DHANUSH: 2, DHAL: 3, SEEDHI: 4, GAJA: 5 } as const;
export type Gear = (typeof GEAR)[keyof typeof GEAR];

/** DODGE: a roll with a short invulnerable window; CHARGE: winding up a heavy blow (everyone sees it). */
export const ACTION = { IDLE: 0, WALK: 1, RUN: 2, ATTACK: 3, BLOCK: 4, CLIMB: 5, DEAD: 6, DODGE: 7, CHARGE: 8 } as const;
export type UnitAction = (typeof ACTION)[keyof typeof ACTION];

export interface RoleInfo {
  id: Role;
  name: string;
  hindi: string;
  blurb: string;
}

export const ROLES: RoleInfo[] = [
  { id: ROLE.GARRISON, name: 'Garrison', hindi: 'रक्षक', blurb: 'Holds the keep. Strongest inside your own walls.' },
  { id: ROLE.VANGUARD, name: 'Vanguard', hindi: 'अग्रदूत', blurb: 'Leads the assault at the gate.' },
  { id: ROLE.FLANK, name: 'Flank', hindi: 'पार्श्व', blurb: 'Hits from the sides, away from the gate road.' },
  { id: ROLE.REAR, name: 'Rear', hindi: 'पृष्ठ', blurb: 'Hangs back in the field. Best with a bow.' },
];

export interface GearInfo {
  id: Gear;
  name: string;
  hindi: string;
  blurb: string;
  /** Only kingdoms holding this power bit can carry it (null = everyone). */
  needsPower: number | null;
}

export const GEARS: GearInfo[] = [
  { id: GEAR.TALWAR, name: 'Talwar', hindi: 'तलवार', blurb: 'Sword. Balanced everywhere.', needsPower: null },
  { id: GEAR.BHALA, name: 'Bhala', hindi: 'भाला', blurb: 'Spear. +15% attack at the gate or in the field.', needsPower: null },
  { id: GEAR.DHANUSH, name: 'Dhanush', hindi: 'धनुष', blurb: 'Bow. +20% defence on the walls, +10% attack from the rear.', needsPower: null },
  { id: GEAR.DHAL, name: 'Dhal', hindi: 'ढाल', blurb: 'Shield. +25% defence inside walls, −10% attack.', needsPower: null },
  { id: GEAR.SEEDHI, name: 'Seedhi', hindi: 'सीढ़ी', blurb: 'Ladder. Climb enemy walls; +30% attack once inside.', needsPower: null },
  { id: GEAR.GAJA, name: 'Gaja', hindi: 'गज', blurb: 'War elephant. +40% attack at the gate. Gaja Sena only.', needsPower: POWER.GAJA_SENA },
];

export function gearAllowed(gear: Gear, powers: number): boolean {
  const info = GEARS[gear];
  return info.needsPower === null || (powers & info.needsPower) !== 0;
}

// ---------------------------------------------------------------------------------------------
// Unit state
// ---------------------------------------------------------------------------------------------

export interface Unit {
  wallet: string;
  faction: number;
  /** Territory the warrior stands in. */
  at: number;
  x: number;
  z: number;
  /** Radians around y (atan2(dx, dz), the realm convention). */
  facing: number;
  action: UnitAction;
  role: Role;
  gear: Gear;
  /** 0..100 */
  hp: number;
  /** Marching to a neighbouring territory: destination, departure and arrival (unix secs). */
  marchTo: number | null;
  marchFrom: number;
  marchStart: number;
  marchAt: number;
  /** unix secs (fractional) of the last move. */
  updatedAt: number;
  /** Fallen in combat: respawns at home at this time (unix secs). 0 = alive. */
  deadUntil: number;
  /** Next strike allowed at (unix secs, weapon cooldown). */
  readyAt: number;
  /** On-chain strike counter (wrapping): each increment is one blow to animate. */
  strikes?: number;
  /** When the warrior last rolled (unix secs): invulnerable for DODGE_IFRAMES after it. */
  dodgeAt?: number;
}

/** Seconds to march between adjacent realms. */
export const MARCH_SECS = 8;
export const WALK_SPEED = 1.6;
export const RUN_SPEED = 2.9;
export const CLIMB_SPEED = 0.55;
/** Minimum seconds between published moves (10 Hz). */
export const MOVE_INTERVAL = 0.1;
/** Island edge: nobody walks past this radius. */
export const EDGE_RADIUS = CAMP_RADIUS + 0.6;
export const KEEP_RADIUS = 0.95;
/** Half-width of the gate opening (matches Castle GATE_GAP 0.62). */
export const GATE_HALF = 0.31;
/** Apothem of the hexagonal wall (distance from the centre to the middle of an edge). */
export const WALL_APOTHEM = WALL_RADIUS * Math.cos(Math.PI / 6);
/** Wall thickness used for collision. */
export const WALL_THICK = 0.26;

export type Zone = 'keep' | 'inside' | 'gate' | 'field' | 'edge';

/** Edge normals of the hexagon (mid-edge directions at 30° + k·60°). Edge 1 (90°) is the gate. */
const NORMALS = Array.from({ length: 6 }, (_, k) => {
  const a = Math.PI / 6 + (k * Math.PI) / 3;
  return [Math.cos(a), Math.sin(a)] as const;
});

/** Signed distance from the hex wall line: < 0 inside, > 0 outside (in apothem units). */
export function hexDepth(x: number, z: number): number {
  let m = -Infinity;
  for (const [nx, nz] of NORMALS) m = Math.max(m, x * nx + z * nz);
  return m - WALL_APOTHEM;
}

/** Is (x, z) in the gate opening (the gap in the +z edge)? */
export function inGate(x: number, z: number): boolean {
  return Math.abs(x) <= GATE_HALF + 0.05 && Math.abs(z - WALL_APOTHEM) <= WALL_THICK + 0.25;
}

export function zoneOf(x: number, z: number): Zone {
  const r = Math.hypot(x, z);
  if (r < KEEP_RADIUS) return 'keep';
  if (inGate(x, z)) return 'gate';
  const d = hexDepth(x, z);
  if (d < -WALL_THICK / 2) return 'inside';
  if (r > CAMP_RADIUS - 0.6) return 'edge';
  return 'field';
}

export const ZONE_LABEL: Record<Zone, string> = {
  keep: 'in the keep',
  inside: 'inside the walls',
  gate: 'at the gate',
  field: 'in the field',
  edge: 'at the edge',
};

export function isInside(x: number, z: number): boolean {
  const zn = zoneOf(x, z);
  return zn === 'keep' || zn === 'inside';
}

/** Fell in combat and waits to respawn. */
export const isFallen = (u: Unit, now: number) => u.hp <= 0 && u.deadUntil > now;

/** True while the unit is between realms. */
export const isMarching = (u: Unit, now: number) => u.marchTo !== null && now < u.marchAt;

/** Alive, in a realm (not on the road). */
export const isPresent = (u: Unit, now: number) => u.hp > 0 && !isMarching(u, now);

// ---------------------------------------------------------------------------------------------
// Movement rules
// ---------------------------------------------------------------------------------------------

export interface MoveRules {
  /** Walls can be crossed anywhere (ladder) — at climb speed. */
  canClimb: boolean;
  /** The gate lets this unit through. Members of the owner always; enemies only when the fort is open. */
  gateOpen: boolean;
}

/**
 * Resolves one step from (x, z) towards (x + dx, z + dz) against the island edge and the wall.
 * Returns the new position and whether the step was a climb (over the wall).
 */
export function stepUnit(x: number, z: number, dx: number, dz: number, rules: MoveRules): { x: number; z: number; climbing: boolean } {
  let nx = x + dx;
  let nz = z + dz;
  // island edge
  const r = Math.hypot(nx, nz);
  if (r > EDGE_RADIUS) {
    nx *= EDGE_RADIUS / r;
    nz *= EDGE_RADIUS / r;
  }
  const before = hexDepth(x, z);
  const after = hexDepth(nx, nz);
  const half = WALL_THICK / 2;
  const wasInWall = Math.abs(before) <= half;
  const willBeInWall = Math.abs(after) <= half;
  const crosses = (before <= -half && after > -half) || (before >= half && after < half) || wasInWall || willBeInWall;
  if (!crosses) return { x: nx, z: nz, climbing: false };
  // through the gate opening?
  if (rules.gateOpen && Math.abs(nx) <= GATE_HALF && nz > 0 && Math.abs(nx) <= GATE_HALF) {
    // the gate is on the +z edge only
    const onGateEdge = Math.abs(nz - WALL_APOTHEM) < 0.6;
    if (onGateEdge) return { x: nx, z: nz, climbing: false };
  }
  if (rules.canClimb) return { x: nx, z: nz, climbing: true };
  // blocked: slide along the wall (drop the component into the wall)
  const grad = wallGradient(x, z);
  const push = dx * grad[0] + dz * grad[1];
  const sx = dx - grad[0] * push;
  const sz = dz - grad[1] * push;
  const tx = x + sx;
  const tz = z + sz;
  const d2 = hexDepth(tx, tz);
  if (Math.abs(d2) <= half || (before < 0) !== (d2 < 0)) return { x, z, climbing: false };
  return { x: tx, z: tz, climbing: false };
}

/** Outward unit normal of the nearest wall edge at (x, z). */
export function wallGradient(x: number, z: number): [number, number] {
  let best = 0;
  let m = -Infinity;
  NORMALS.forEach(([nx, nz], k) => {
    const d = x * nx + z * nz;
    if (d > m) {
      m = d;
      best = k;
    }
  });
  return [NORMALS[best][0], NORMALS[best][1]];
}

// ---------------------------------------------------------------------------------------------
// Spawn points and travel
// ---------------------------------------------------------------------------------------------

/** Where a new member's warrior appears: the courtyard, spread by a hash of the wallet. */
export function spawnPoint(wallet: string): { x: number; z: number; facing: number } {
  let h = 2166136261;
  for (let i = 0; i < wallet.length; i++) h = Math.imul(h ^ wallet.charCodeAt(i), 16777619) >>> 0;
  const a = ((h % 1000) / 1000) * Math.PI * 2;
  const r = 1.25 + ((h >>> 10) % 100) / 100 * 0.6;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, facing: a + Math.PI / 2 };
}

/** Where a marching unit arrives: the island edge facing the realm it came from. */
export function arrivalPoint(to: number, from: number): { x: number; z: number; facing: number } {
  const a = bearing(to, from);
  const r = CAMP_RADIUS - 0.3;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, facing: Math.atan2(-Math.cos(a), -Math.sin(a)) };
}

/**
 * The assault camp: where an attacker's warrior lands when it joins an assault on an enemy realm,
 * a few paces outside the gate, spread by a hash of the wallet so a squad stands together.
 */
export function campPoint(wallet: string): { x: number; z: number; facing: number } {
  let h = 2166136261;
  for (let i = 0; i < wallet.length; i++) h = Math.imul(h ^ wallet.charCodeAt(i), 16777619) >>> 0;
  const x = (((h % 1000) / 1000) - 0.5) * 2.4;
  const z = WALL_APOTHEM + 1.1 + (((h >>> 10) % 100) / 100) * 0.9;
  return { x, z, facing: Math.PI };
}

/**
 * Teleports `u` to realm `to` (ARCHITECTURE §10.8): into its courtyard when the kingdom holds it,
 * else to the assault camp outside its gate. No road, no walking: the squad arrives together.
 */
export function teleportUnit(u: Unit, game: Game, to: number, now: number): Unit {
  const p = game.territoryOwner[to] === u.faction ? spawnPoint(u.wallet) : campPoint(u.wallet);
  return { ...u, at: to, x: p.x, z: p.z, facing: p.facing, marchTo: null, marchFrom: to, action: ACTION.IDLE, updatedAt: now };
}

/** Where a marching unit leaves: the island edge towards the destination. */
export function departurePoint(from: number, to: number): { x: number; z: number } {
  const a = bearing(from, to);
  return { x: Math.cos(a) * (CAMP_RADIUS + 0.4), z: Math.sin(a) * (CAMP_RADIUS + 0.4) };
}

/**
 * Realms a unit at `at` may march to: neighbours of `at`, plus anything with Vidya Reach. Only
 * the six walled homelands are realms; the open plains are fought over with allocations alone.
 */
export function marchTargets(game: Game, faction: number, at: number): number[] {
  const reach = (game.factions[faction].powers & POWER.VIDYA_REACH) !== 0;
  const out: number[] = [];
  for (let t = 0; t < N_KINGDOMS; t++) {
    if (t === at) continue;
    if (reach || (ADJACENCY[at] & (1 << t)) !== 0) out.push(t);
  }
  return out;
}

/** Progress 0..1 of a march at `now`. */
export function marchProgress(u: Unit, now: number): number {
  if (u.marchTo === null) return 1;
  const len = Math.max(0.001, u.marchAt - u.marchStart);
  return Math.min(1, Math.max(0, (now - u.marchStart) / len));
}

/**
 * The realm a marching unit should be drawn in, and where. First half: walking out of the
 * origin towards the destination; second half: walking in from the destination's edge.
 */
export function marchPose(u: Unit, now: number): { at: number; x: number; z: number; facing: number } {
  if (u.marchTo === null) return { at: u.at, x: u.x, z: u.z, facing: u.facing };
  const p = marchProgress(u, now);
  if (p < 0.5) {
    const k = p / 0.5;
    const out = departurePoint(u.marchFrom, u.marchTo);
    // from the gate road out to the edge
    const gx = 0;
    const gz = WALL_APOTHEM + 0.6;
    const x = gx + (out.x - gx) * k;
    const z = gz + (out.z - gz) * k;
    return { at: u.marchFrom, x, z, facing: Math.atan2(out.x - gx, out.z - gz) };
  }
  const k = (p - 0.5) / 0.5;
  const arr = arrivalPoint(u.marchTo, u.marchFrom);
  const far = { x: arr.x * ((CAMP_RADIUS + 2.5) / (CAMP_RADIUS - 0.3)), z: arr.z * ((CAMP_RADIUS + 2.5) / (CAMP_RADIUS - 0.3)) };
  return { at: u.marchTo, x: far.x + (arr.x - far.x) * k, z: far.z + (arr.z - far.z) * k, facing: arr.facing };
}

export function newUnit(wallet: string, faction: number, at: number, now: number): Unit {
  const s = spawnPoint(wallet);
  return {
    wallet,
    faction,
    at,
    x: s.x,
    z: s.z,
    facing: s.facing,
    action: ACTION.IDLE,
    role: ROLE.GARRISON,
    gear: GEAR.TALWAR,
    hp: 100,
    marchTo: null,
    marchFrom: at,
    marchStart: 0,
    marchAt: 0,
    updatedAt: now,
    deadUntil: 0,
    readyAt: 0,
  };
}

export const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-3)}`;

// ---------------------------------------------------------------------------------------------
// Routing around the fort (click-to-move and the bots)
// ---------------------------------------------------------------------------------------------

type Pt = { x: number; z: number };

/** Does the straight walk from a to b run into the curtain wall (or through the courtyard)? */
export function crossesFort(a: Pt, b: Pt): boolean {
  const n = Math.max(8, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15));
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (hexDepth(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k) < WALL_THICK / 2 + 0.05) return true;
  }
  return false;
}

/** Radius of the path that rings the fort outside the wall (clear of the corners at WALL_RADIUS). */
export const RING_RADIUS = WALL_RADIUS + 0.55;

/**
 * Outside → outside: straight if clear, otherwise round the fort on the ring path the shorter
 * way, then to the destination. Waypoints are trimmed so the walk cuts corners when it can.
 */
export function routeOutside(from: Pt, to: Pt): Pt[] {
  if (!crossesFort(from, to)) return [to];
  const a0 = Math.atan2(from.z, from.x);
  const a1 = Math.atan2(to.z, to.x);
  const d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
  const steps = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 4)));
  const ring: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (d * i) / steps;
    ring.push({ x: Math.cos(a) * RING_RADIUS, z: Math.sin(a) * RING_RADIUS });
  }
  const pts = [...ring, to];
  // greedy trim: from where we are, jump to the furthest point we can walk to in a straight line
  const out: Pt[] = [];
  let cur = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && crossesFort(cur, pts[j])) j--;
    out.push(pts[j]);
    cur = pts[j];
    i = j + 1;
  }
  return out;
}

/** Points just outside and just inside the gate. */
export const GATE_OUTSIDE: Pt = { x: 0, z: WALL_APOTHEM + 0.5 };
export const GATE_INSIDE: Pt = { x: 0, z: WALL_APOTHEM - 0.55 };

/**
 * A walking route from `from` to `to` in one realm: straight inside the walls, round the fort
 * outside them, through the gate between the two (or straight over the wall with a ladder).
 * `gateOpen: false` stops the route at the gate (`blocked: true`).
 */
export function planRoute(from: Pt, to: Pt, opts: { canClimb: boolean; gateOpen: boolean }): { route: Pt[]; blocked: boolean } {
  if (opts.canClimb) return { route: [to], blocked: false };
  const fromIn = hexDepth(from.x, from.z) < 0;
  const toIn = hexDepth(to.x, to.z) < 0;
  if (fromIn && toIn) return { route: [to], blocked: false };
  if (!fromIn && !toIn) return { route: routeOutside(from, to), blocked: false };
  if (!opts.gateOpen) return { route: fromIn ? [GATE_INSIDE] : routeOutside(from, GATE_OUTSIDE), blocked: true };
  return fromIn
    ? { route: [GATE_INSIDE, GATE_OUTSIDE, ...routeOutside(GATE_OUTSIDE, to)], blocked: false }
    : { route: [...routeOutside(from, GATE_OUTSIDE), GATE_INSIDE, to], blocked: false };
}
