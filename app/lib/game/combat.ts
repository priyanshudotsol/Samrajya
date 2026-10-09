/**
 * Hand-to-hand combat (docs/ARCHITECTURE.md §10.7). Every member swings, thrusts or shoots with
 * the gear they carry. Strikes wound enemy warriors standing in the same realm; a warrior at 0 hp
 * falls, stops counting for the bell (tactics.ts only counts the living) and stays down until the
 * bell has been decided (at least RESPAWN_SECS), then respawns at home (§10.8). Enemies at the gate can batter it down: a broken gate lets anyone in until
 * the next bell repairs it.
 *
 * Pure rules, no rendering. The mock applies them in `ixStrike`; the program will run the same
 * checks in `strike` (Step 17). The client mirrors them only for feedback (range rings, cooldowns).
 */
import { PLAINS } from './types';
import { ACTION, GATE_HALF, GEAR, hexDepth, isInside, isMarching, WALL_APOTHEM, WALL_THICK, type Gear, type Unit } from './units';

export interface WeaponInfo {
  /** Reach in realm units (a warrior is ~0.5 tall; the wall radius is 2.55). */
  range: number;
  damage: number;
  /** Seconds between strikes. */
  cooldown: number;
  /** Half-angle of the swing (radians). Ranged weapons ignore it. */
  arc: number;
  /** How many enemies one swing can wound. */
  cleave: number;
  /** Fires an arrow down the facing line instead of swinging. */
  ranged: boolean;
  /** Damage dealt to an enemy gate per strike. */
  gateDamage: number;
  /** Damage taken while blocking (fraction). */
  blockTaken: number;
  verb: string;
}

const DEG = Math.PI / 180;

/** Indexed by Gear. */
export const WEAPONS: WeaponInfo[] = [
  // Talwar: balanced sword, short reach, can catch two
  { range: 0.62, damage: 16, cooldown: 0.6, arc: 70 * DEG, cleave: 2, ranged: false, gateDamage: 14, blockTaken: 0.5, verb: 'cut down' },
  // Bhala: spear, long reach, one target
  { range: 0.95, damage: 14, cooldown: 0.75, arc: 28 * DEG, cleave: 1, ranged: false, gateDamage: 10, blockTaken: 0.55, verb: 'speared' },
  // Dhanush: bow, shoots down the line
  { range: 4.2, damage: 10, cooldown: 1.1, arc: 0, cleave: 1, ranged: true, gateDamage: 0, blockTaken: 0.65, verb: 'shot' },
  // Dhal: shield bash, weak hit, best block
  { range: 0.5, damage: 7, cooldown: 0.7, arc: 60 * DEG, cleave: 1, ranged: false, gateDamage: 8, blockTaken: 0.15, verb: 'bashed' },
  // Seedhi: ladder swing, weak, but climbs walls
  { range: 0.6, damage: 8, cooldown: 0.8, arc: 60 * DEG, cleave: 1, ranged: false, gateDamage: 10, blockTaken: 0.6, verb: 'clubbed' },
  // Gaja: war elephant, slow and devastating, wrecks gates
  { range: 0.95, damage: 24, cooldown: 1.4, arc: 75 * DEG, cleave: 4, ranged: false, gateDamage: 60, blockTaken: 0.4, verb: 'trampled' },
];

export const weaponOf = (gear: Gear) => WEAPONS[gear] ?? WEAPONS[GEAR.TALWAR];

/** Minimum seconds a fallen warrior waits; it also always waits for the bell (§10.8). */
export const RESPAWN_SECS = 10;
/** HP a warrior respawns with. */
export const RESPAWN_HP = 70;
/** Gate hit points (repaired to full at every bell). */
export const GATE_HP = 400;
/** The gate's centre and how close you must stand to hit it. */
export const GATE_POINT = { x: 0, z: WALL_APOTHEM };
export const GATE_REACH = 0.75;
// ------------------------------------------------------------------ moves (§10.10)
/** A roll: this far, this fast, untouchable for DODGE_IFRAMES, at most once per DODGE_COOLDOWN. */
export const DODGE_DIST = 1.35;
export const DODGE_SECS = 0.32;
export const DODGE_IFRAMES = 0.4;
export const DODGE_COOLDOWN = 1.2;
/** A heavy blow: hold to charge (min / full), ×HEAVY_MULT damage, breaks a raised guard. */
export const HEAVY_CHARGE_MIN = 0.45;
export const HEAVY_CHARGE_FULL = 0.9;
export const HEAVY_MULT = 1.8;
/** Light blows chain into a combo; the third is a finisher that knocks back harder. */
export const COMBO_WINDOW = 1.0;
/** Knockback distance by blow. */
export const KNOCK_LIGHT = 0.18;
export const KNOCK_FINISHER = 0.42;
export const KNOCK_HEAVY = 0.7;
/** Stamina: rolls, heavy blows and blows taken on the guard cost it; it comes back over time. */
export const STAMINA_MAX = 100;
export const STAMINA_REGEN = 28;
export const STAMINA_DODGE = 35;
export const STAMINA_HEAVY = 30;
export const STAMINA_BLOCKED = 18;

/** Is this warrior inside its roll's invulnerable window? */
export const dodging = (u: Unit, now: number) => u.action === ACTION.DODGE && now - (u.dodgeAt ?? -1e9) <= DODGE_IFRAMES;

/** Gates used to be battered open; since §10.10 only killing the garrison opens them. */
export const BATTER_GATES = false;
/** Archers on or inside their own walls shoot harder. */
export const WALL_ARCHER_BONUS = 1.4;
/** Defenders inside their own walls take less damage. */
export const INSIDE_DEFENCE = 0.85;
/** Lateral tolerance of an arrow (how close to the line a target must be). */
const ARROW_WIDTH = 0.28;

export interface Hit {
  wallet: string;
  damage: number;
  blocked: boolean;
  killed: boolean;
  /** How far the blow throws the target back. */
  knock: number;
}

export interface StrikeResult {
  hits: Hit[];
  /** Damage dealt to the realm's gate (0 if none). */
  gateDamage: number;
  /** Where an arrow landed (ranged only), for the tracer. */
  arrowEnd: { x: number; z: number } | null;
}

/** Is this warrior alive and standing in a realm (not on the road)? */
export const canFight = (u: Unit, now: number) => u.hp > 0 && !isMarching(u, now);

const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Is the target blocking towards the attacker (facing within 80° of them)? */
function blocking(target: Unit, from: { x: number; z: number }): boolean {
  if (target.action !== 4 /* ACTION.BLOCK */) return false;
  const toAttacker = Math.atan2(from.x - target.x, from.z - target.z);
  return Math.abs(angleDiff(toAttacker, target.facing)) < 80 * DEG;
}

/** Does a straight line between two points cross the hex wall (arrows don't go through stone)? */
function crossesWall(ax: number, az: number, bx: number, bz: number): boolean {
  const a = hexDepth(ax, az);
  const b = hexDepth(bx, bz);
  const half = WALL_THICK / 2;
  // standing in the wall band (on the wall walk) shoots over it
  if (Math.abs(a) <= half + 0.05) return false;
  const crosses = (a < -half && b > half) || (a > half && b < -half);
  if (!crosses) return false;
  // through the gate gap: the opening in the +z edge is not stone (blades meet in the gate)
  if (az !== bz) {
    const t = (WALL_APOTHEM - az) / (bz - az);
    if (t >= 0 && t <= 1 && Math.abs(ax + (bx - ax) * t) <= GATE_HALF) return false;
  }
  return true;
}

/**
 * Resolves one strike by `attacker` facing `facing` against everyone in its realm. Does not
 * mutate anything; callers apply `hits` (and the gate damage) to their state.
 *
 * `owner` is the realm's current owner, `gateHp` its gate's hit points.
 */
export function resolveStrike(attacker: Unit, facing: number, units: Unit[], owner: number, gateHp: number, now: number, opts: { heavy?: boolean; finisher?: boolean } = {}) {
  const w = weaponOf(attacker.gear);
  const result: StrikeResult = { hits: [], gateDamage: 0, arrowEnd: null };
  const defendingHome = attacker.faction === owner;
  // Kurukshetra is an open field: no walls to block, shelter behind or shoot from
  const open = attacker.at === PLAINS;
  const bonus = !open && w.ranged && defendingHome && (isInside(attacker.x, attacker.z) || Math.abs(hexDepth(attacker.x, attacker.z)) <= WALL_THICK) ? WALL_ARCHER_BONUS : 1;
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);

  // a warrior mid-roll is untouchable
  const enemies = units.filter((u) => u.wallet !== attacker.wallet && u.faction !== attacker.faction && u.at === attacker.at && canFight(u, now) && !dodging(u, now));
  const candidates: { u: Unit; d: number }[] = [];
  for (const u of enemies) {
    const dx = u.x - attacker.x;
    const dz = u.z - attacker.z;
    const d = Math.hypot(dx, dz);
    if (w.ranged) {
      const along = dx * fx + dz * fz;
      const lateral = Math.abs(dx * fz - dz * fx);
      if (along <= 0.1 || along > w.range || lateral > ARROW_WIDTH) continue;
      // arrows arc over the walls (§10.10): a garrison cannot hide from archers
      candidates.push({ u, d: along });
    } else {
      if (d > w.range) continue;
      if (d > 0.12 && Math.abs(angleDiff(Math.atan2(dx, dz), facing)) > w.arc) continue;
      if (!open && crossesWall(attacker.x, attacker.z, u.x, u.z)) continue;
      candidates.push({ u, d });
    }
  }
  candidates.sort((a, b) => a.d - b.d);
  for (const { u } of candidates.slice(0, w.cleave)) {
    // a heavy blow breaks a raised guard
    const isBlocked = !opts.heavy && blocking(u, attacker);
    let dmg = w.damage * bonus * (opts.heavy ? HEAVY_MULT : 1);
    if (isBlocked) dmg *= weaponOf(u.gear).blockTaken;
    if (!open && u.faction === owner && isInside(u.x, u.z)) dmg *= INSIDE_DEFENCE;
    const damage = Math.max(1, Math.round(dmg));
    const knock = isBlocked ? KNOCK_LIGHT * 0.5 : opts.heavy ? KNOCK_HEAVY : opts.finisher ? KNOCK_FINISHER : KNOCK_LIGHT;
    result.hits.push({ wallet: u.wallet, damage, blocked: isBlocked, killed: u.hp - damage <= 0, knock });
  }
  if (w.ranged) {
    const first = candidates[0];
    const len = first ? first.d : w.range;
    result.arrowEnd = { x: attacker.x + fx * len, z: attacker.z + fz * len };
  }

  // Gates are no longer battered (§10.10: the gate opens only when the garrison is dead); kept
  // behind a flag so old tests of the rule still describe it.
  if (BATTER_GATES && !defendingHome && gateHp > 0 && w.gateDamage > 0 && result.hits.length === 0) {
    const gx = GATE_POINT.x - attacker.x;
    const gz = GATE_POINT.z - attacker.z;
    const gd = Math.hypot(gx, gz);
    if (gd <= GATE_REACH && Math.abs(angleDiff(Math.atan2(gx, gz), facing)) < 80 * DEG) result.gateDamage = Math.min(gateHp, w.gateDamage);
  }
  return result;
}

/** Nearest living enemy in the same realm within `radius`, or null. */
export function nearestEnemy(u: Unit, units: Unit[], radius: number, now: number): { unit: Unit; dist: number } | null {
  let best: Unit | null = null;
  let bestD = radius;
  for (const o of units) {
    if (o.faction === u.faction || o.at !== u.at || !canFight(o, now)) continue;
    const d = Math.hypot(o.x - u.x, o.z - u.z);
    if (d < bestD && (u.at === PLAINS || !crossesWall(u.x, u.z, o.x, o.z))) {
      bestD = d;
      best = o;
    }
  }
  return best ? { unit: best, dist: bestD } : null;
}

/** Combat feedback for the renderer and the HUD (floating numbers, arrows, kill feed). */
export interface CombatEvent {
  id: number;
  /** unix secs */
  at: number;
  territory: number;
  kind: 'swing' | 'hit' | 'block' | 'kill' | 'gate' | 'gate-broken' | 'arrow' | 'respawn';
  by: string;
  byFaction: number;
  target?: string;
  damage?: number;
  x: number;
  z: number;
  /** Arrow tracer start/end. */
  x2?: number;
  z2?: number;
  gear: Gear;
  /** A charged heavy blow (bigger hitstop, shake, knockback). */
  heavy?: boolean;
  /** Knockback dealt by a hit. */
  knock?: number;
  /** Position in a light combo (1–3; 3 = the finisher). */
  combo?: number;
}

export const MAX_EVENTS = 80;
