use anchor_lang::prelude::*;

/// Number of kingdoms (factions). Kingdom `i` starts on territory `i`.
pub const N: usize = 6;
/// Number of territories: the six homelands plus the central plains.
pub const T: usize = 7;
/// The central plains: starts neutral, borders every homeland, pays its holder the plains pot.
pub const PLAINS: usize = 6;
/// `Game.territory_owner` value for a territory nobody holds (only the plains, before it falls).
pub const NEUTRAL: u8 = 255;
/// Ring buffer length of recent battles kept in `Game`.
pub const BATTLE_LOG_LEN: usize = 16;
/// `Player.alloc_target` value meaning "defend".
pub const DEFEND: u8 = 255;
/// Every member holds exactly this many shares, so a kingdom's treasury splits equally per head.
pub const SHARES_PER_MEMBER: u128 = 1_000_000;
pub const BPS: u64 = 10_000;
/// A pending VRF request may be retried after this many seconds.
pub const VRF_RETRY_SECS: i64 = 30;

#[constant]
pub const GAME_SEED: &[u8] = b"game";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
#[constant]
pub const PLAYER_SEED: &[u8] = b"player";
#[constant]
pub const REGISTRY_SEED: &[u8] = b"registry";

/// Power bits. A kingdom starts with the power of its own index; conquerors inherit powers.
pub const POWER_KURU_FORTRESS: u8 = 1 << 0; // Hastinapur: defense x1.3
pub const POWER_GAJA_SENA: u8 = 1 << 1; // Magadh: attack x1.2
pub const POWER_SAMUDRA_VYAPAR: u8 = 1 << 2; // Kalinga: +25% loot
pub const POWER_VIDYA_REACH: u8 = 1 << 3; // Takshashila: attack non-adjacent
pub const POWER_ANNAPURNA_HARVEST: u8 = 1 << 4; // Vijayanagar: half loss on failed attacks
pub const POWER_RATRI_RAID: u8 = 1 << 5; // Avanti: first attack x1.5

/// Kingdom upgrades bought with treasury (`Faction.upgrades[kind]` is the level).
pub const UPGRADE_WALLS: u8 = 0; // defense
pub const UPGRADE_ARMORY: u8 = 1; // attack
pub const UPGRADES: usize = 2;
pub const MAX_UPGRADE_LEVEL: u8 = 3;

/// Default adjacency (bitmask per territory), see docs/ARCHITECTURE.md.
/// 0 Hastinapur ↔ 1,2,5 · 1 Magadh ↔ 0,2,3 · 2 Kalinga ↔ 0,1,4
/// 3 Takshashila ↔ 1,4,5 · 4 Vijayanagar ↔ 2,3,5 · 5 Avanti ↔ 0,3,4
/// Every homeland also borders 6, the plains, and the plains border all six.
pub const DEFAULT_ADJACENCY: [u8; T] = [
    0b1100110, 0b1001101, 0b1010011, 0b1110010, 0b1101100, 0b1011001, 0b0111111,
];

// ---------------------------------------------------------------- the battlefield (field.rs)
/// `Unit.at` before a warrior has a realm.
pub const NO_REALM: u8 = 255;
pub const GATE_HP: u16 = 400;
/// Minimum seconds a fallen warrior waits (it also waits for the bell while the war is on).
pub const RESPAWN_SECS: i64 = 10;
pub const RESPAWN_HP: u8 = 70;
pub const ACTION_ATTACK: u8 = 3;
pub const ACTION_BLOCK: u8 = 4;
pub const ACTION_DEAD: u8 = 6;
pub const ACTION_DODGE: u8 = 7;
pub const ACTION_CHARGE: u8 = 8;
/// One roll per this many seconds; it makes the warrior untouchable for the rest of that second.
pub const DODGE_COOLDOWN_SECS: i64 = 2;
/// A charged heavy blow: ×1.8 damage, breaks a raised guard, costs two strikes of the second.
pub const HEAVY_MULT_PCT: i32 = 180;
pub const GEAR_SEEDHI: u8 = 4;
pub const GEAR_GAJA: u8 = 5;
pub const GEARS: u8 = 6;
