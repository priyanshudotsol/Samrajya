/**
 * Client-side mirror of the planned `samrajya` Anchor accounts (docs/ARCHITECTURE.md §4,
 * docs/IMPLEMENTATION_GUIDE.md Step 2 `state.rs`).
 *
 * Conventions:
 * - Lamports and shares are `bigint` (u64 / u128 on-chain).
 * - u8 / u16 / u32 fields are plain `number`.
 * - Timestamps (`epochEndsAt`) are unix **seconds**, like `Clock::unix_timestamp`.
 * - Rust enums are string unions here; the ER decoder (Step 14) maps Anchor's `{ active: {} }` shape.
 */

export const N_KINGDOMS = 6;
/** `Player.allocTarget` value meaning "Defend". */
export const DEFEND = 255;
/** Size of the on-chain `battle_log` ring buffer. */
export const BATTLE_LOG_SIZE = 16;

export type Phase = 'Lobby' | 'Active' | 'Ended';
export type PlayerStatus = 'Idle' | 'Active' | 'Left' | 'Claimed';

export interface GameConfig {
  /** Minimum stake for `join`, lamports. */
  minStake: bigint;
  epochSecs: number;
  /** 2000 = 20% leave fee. */
  leaveFeeBps: number;
  /** 4000 = 40% switch fee. */
  switchFeeBps: number;
  /** 2000 = failed attackers lose 20% of committed strength. */
  kLossBps: number;
  /** Starting base defense (lamports of strength). The live value is `Game.baseDefense`. */
  baseDefense: bigint;
  /** 500 = base defense shrinks 5% per epoch ("the storm"). */
  stormDecayBps: number;
  /** Bitmask per territory: bit `j` set ⇒ territory j is adjacent. */
  adjacency: number[];
}

export interface Faction {
  /** Accounting lamports (real SOL sits in the Vault). Also the army strength. */
  treasury: bigint;
  /** player value = shares × treasury / totalShares */
  totalShares: bigint;
  members: number;
  /** Number of territories owned. */
  territories: number;
  /** Bitmask of powers (bit i = power of kingdom i, see `POWER` in factions.ts). */
  powers: number;
  alive: boolean;
  /** Bumped when the kingdom is wiped out (or drained and refilled): older shares are worth 0. */
  generation: number;
  /** Lamports of value committed this epoch, per target territory. */
  attackAlloc: bigint[];
  /** Ratri Raid: true once this faction has attacked while holding the Ratri power. */
  ambushUsed: boolean;
}

export interface BattleEntry {
  epoch: number;
  territory: number;
  /** Faction that owned the territory when the battle started. */
  defender: number;
  /** Winning faction (== defender ⇒ HELD). */
  winner: number;
  /** Defender bucket size: defender holds iff roll < defense. */
  defense: bigint;
  roll: bigint;
  total: bigint;
  /** Bit i set ⇒ faction i attacked. */
  attackersMask: number;
  /** Treasury moved to the winner (loot + failed-attack losses). */
  spoils: bigint;
  /** The defender lost its last territory. */
  eliminated: boolean;
}

export interface Game {
  /** base58 pubkey string. */
  authority: string;
  gameId: number;
  phase: Phase;
  epoch: number;
  /** unix seconds */
  epochEndsAt: number;
  pendingVrf: boolean;
  config: GameConfig;
  /** Live base defense; shrinks by `config.stormDecayBps` every epoch ("the storm"). */
  baseDefense: bigint;
  /** Total battles ever fought (on-chain ring buffer cursor). */
  battleCount: number;
  /** Faction index owning each territory. */
  territoryOwner: number[];
  factions: Faction[];
  winner: number | null;
  /** Oldest first, newest last, at most BATTLE_LOG_SIZE entries (ring buffer flattened). */
  battleLog: BattleEntry[];
}

export interface Player {
  /** base58 pubkey string. */
  wallet: string;
  faction: number;
  /** Must equal factions[faction].generation for the shares to be worth anything. */
  generation: number;
  shares: bigint;
  pendingDeposit: bigint;
  pendingWithdrawal: bigint;
  /** Total lamports paid in, for P&L in the UI. */
  depositedTotal: bigint;
  /** Target territory, or DEFEND (255). */
  allocTarget: number;
  allocAmount: bigint;
  allocEpoch: number;
  claimed: boolean;
  /** Derived for the UI (not stored on-chain). */
  status: PlayerStatus;
}

export type GameSource = 'mock' | 'er';
export type StoreStatus = 'idle' | 'loading' | 'live' | 'error';
