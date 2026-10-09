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
/** The six homelands plus the central plains. */
export const N_TERRITORIES = 7;
/** Territory index of the central plains (neutral at the start, borders every homeland). */
export const PLAINS = 6;
/** `territoryOwner` value for a territory nobody holds (the plains before they fall). */
export const NEUTRAL = 255;
/** Kingdom upgrades bought with treasury; `Faction.upgrades[kind]` is the level. */
export const UPGRADE = { WALLS: 0, ARMORY: 1 } as const;
export const MAX_UPGRADE_LEVEL = 3;
/** `Player.allocTarget` value meaning "Defend". */
export const DEFEND = 255;
/** Size of the on-chain `battle_log` ring buffer. */
export const BATTLE_LOG_SIZE = 16;

export type Phase = 'Lobby' | 'Active' | 'Ended';
export type PlayerStatus = 'Idle' | 'Active' | 'Left' | 'Claimed';

export interface GameConfig {
  /** Everyone enters with exactly this many lamports; every member owns an equal share. */
  ticket: bigint;
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
  /** Starting garrison of the neutral plains (decays with the storm). */
  plainsDefense: bigint;
  /** 1000 = 10% of every battle's spoils goes to the plains pot. */
  plainsTaxBps: number;
  /** Upgrade level n costs n × this of the treasury. */
  upgradeCostBps: number;
  /** Each upgrade level adds this to attack (armory) or defense (walls). */
  upgradeBonusBps: number;
  /** Attack and defense bonus per territory held beyond the first. */
  conquestBonusBps: number;
  /** After this long in the lobby anyone may start the war. */
  lobbySecs: number;
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
  /** Level of each upgrade, indexed by `UPGRADE`. */
  upgrades: number[];
  /** Epoch of the last upgrade purchase (one per kingdom per epoch). */
  upgradedEpoch: number;
}

export interface BattleEntry {
  epoch: number;
  territory: number;
  /** Faction that owned the territory when the battle started (`NEUTRAL` for unheld plains). */
  defender: number;
  /** Winning faction (== defender ⇒ HELD; `NEUTRAL` ⇒ the plains garrison held). */
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
  /** Taken without a roll: nobody was inside the walls (docs/ARCHITECTURE.md §10.3). */
  captured?: boolean;
  /** Decided by the hand fight, no roll: captured if the fort was cleared, else held (§10.8). */
  byFight?: boolean;
}

export interface Game {
  /** base58 pubkey string. */
  authority: string;
  gameId: number;
  phase: Phase;
  epoch: number;
  /** unix seconds: end of the epoch, or of the lobby while `phase === 'Lobby'`. */
  epochEndsAt: number;
  pendingVrf: boolean;
  config: GameConfig;
  /** Live base defense; shrinks by `config.stormDecayBps` every epoch ("the storm"). */
  baseDefense: bigint;
  /** Total battles ever fought (on-chain ring buffer cursor). */
  battleCount: number;
  /** Live garrison of the neutral plains. */
  plainsDefense: bigint;
  /** Lamports waiting for the plains holder (paid at every bell). */
  plainsPot: bigint;
  /** Faction index owning each territory (`NEUTRAL` for unheld plains); length N_TERRITORIES. */
  territoryOwner: number[];
  factions: Faction[];
  winner: number | null;
  /** Oldest first, newest last, at most BATTLE_LOG_SIZE entries (ring buffer flattened). */
  battleLog: BattleEntry[];
  /** Gate hit points per homeland (chain; the mock keeps them in the store). */
  gates?: number[];
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
