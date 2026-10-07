/**
 * Player actions used by the HUD. Same interface in mock mode and on-chain, so UI code never
 * branches on the source. All amounts are lamports (bigint). Every action resolves when the
 * state change is visible in the store (or throws an Error with a human-readable message).
 */
export interface GameActions {
  /** Base `join` (SOL → vault) + delegate + ER `enlist` into `faction`. One wallet popup. */
  pledge(faction: number, lamports: bigint): Promise<void>;
  /** ER `allocate`: attack territory `target` with `lamports` of your value, or DEFEND (255). Free, no popup. */
  allocate(target: number, lamports: bigint): Promise<void>;
  /** ER `switch_kingdom`: 40% of your value stays behind during the war (free in Lobby). */
  switchKingdom(to: number): Promise<void>;
  /** ER `leave` + commit, then base `withdraw` (one popup). 20% fee during the war. */
  leave(): Promise<void>;
  /** After the war: commit your Player and claim your share of the pot on base. */
  claim(): Promise<void>;
  /** Permissionless: ring the epoch bell if the deadline has passed (keeper fallback). */
  ringBell(): Promise<void>;
}

/** Human-readable progress for long multi-step actions (leave / claim / pledge). */
export type ActionStep = 'idle' | 'signing' | 'base' | 'er' | 'committing' | 'withdrawing' | 'done';
