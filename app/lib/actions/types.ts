/**
 * Player actions used by the HUD. Same interface in mock mode and on-chain, so UI code never
 * branches on the source. All amounts are lamports (bigint). Every action resolves when the
 * state change is visible in the store (or throws an Error with a human-readable message).
 */
import type { Gear, Role, UnitAction } from '@/lib/game/units';

export interface GameActions {
  /** Base `join` (the ticket → vault) + delegate + ER `enlist` into `faction`. One wallet popup. */
  pledge(faction: number, lamports: bigint): Promise<void>;
  /** ER `upgrade(kind)`: spend kingdom treasury on walls (0) or the armory (1). Session key, no popup. */
  upgrade(kind: number): Promise<void>;
  /** Anyone, once the war has ended: open the next war (base `init_game` + delegate). One popup. */
  newWar(): Promise<void>;
  /** ER `allocate`: attack territory `target` with `lamports` of your value, or DEFEND (255). Free, no popup. */
  allocate(target: number, lamports: bigint): Promise<void>;
  /** ER `switch_kingdom`: 40% of your value stays behind during the war (free in Lobby). */
  switchKingdom(to: number): Promise<void>;
  /** ER `leave` + commit, then base `withdraw` (one popup). 20% fee during the war. */
  leave(): Promise<void>;
  /** After the war: commit your Player and claim your share of the pot on base. */
  claim(): Promise<void>;
  /** Close the lobby: the host any time, anyone once the lobby timer is over and two kingdoms have members. */
  startWar(): Promise<void>;
  /** Permissionless: ring the epoch bell if the deadline has passed (keeper fallback). */
  ringBell(): Promise<void>;

  // --- the tactical layer (docs/ARCHITECTURE.md §10) ---------------------------------------
  /** ER `move_unit`: publish your warrior's position (≤ 10 Hz, session key, no popup). */
  moveUnit(x: number, z: number, facing: number, action: UnitAction): Promise<void>;
  /** ER `set_role`. */
  setRole(role: Role): Promise<void>;
  /** ER `set_gear`. */
  setGear(gear: Gear): Promise<void>;
  /** ER `march(to)`: leave for a neighbouring realm (MARCH_SECS on the road). */
  march(to: number): Promise<void>;
  /**
   * ER `strike(x, z, facing, heavy)`: swing / thrust / shoot with your gear (§10.7). `heavy` = a
   * charged blow (×1.8, breaks a guard); `combo` = position in a light chain (3 = finisher).
   */
  strike(x: number, z: number, facing: number, opts?: StrikeOpts): Promise<void>;
  /**
   * ER `seize(x, z)` (§10.11): you stand inside an enemy realm you were ordered to attack and no
   * member of its owner is alive there, so it falls at once. Sent by the HUD when that happens.
   */
  seize(x: number, z: number): Promise<void>;
  /** Rally ping: ask your kingdom to gather at (x, z) in `territory` (kingdom chat + a beacon). */
  rally(territory: number, x: number, z: number): Promise<void>;
}

export interface StrikeOpts {
  heavy?: boolean;
  combo?: number;
}

/** Human-readable progress for long multi-step actions (leave / claim / pledge). */
export type ActionStep = 'idle' | 'signing' | 'base' | 'er' | 'committing' | 'withdrawing' | 'done';
