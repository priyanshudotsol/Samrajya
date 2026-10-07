use anchor_lang::prelude::*;

/// Number of kingdoms (factions) and territories.
pub const N: usize = 6;
/// Ring buffer length of recent battles kept in `Game`.
pub const BATTLE_LOG_LEN: usize = 16;
/// `Player.alloc_target` value meaning "defend".
pub const DEFEND: u8 = 255;
/// Scale used when minting the first shares into an empty kingdom.
pub const INITIAL_SHARES_PER_LAMPORT: u128 = 1_000_000;
pub const BPS: u64 = 10_000;
/// A pending VRF request may be retried after this many seconds.
pub const VRF_RETRY_SECS: i64 = 30;

#[constant]
pub const GAME_SEED: &[u8] = b"game";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
#[constant]
pub const PLAYER_SEED: &[u8] = b"player";

/// Power bits. A kingdom starts with the power of its own index; conquerors inherit powers.
pub const POWER_KURU_FORTRESS: u8 = 1 << 0; // Hastinapur: defense x1.3
pub const POWER_GAJA_SENA: u8 = 1 << 1; // Magadh: attack x1.2
pub const POWER_SAMUDRA_VYAPAR: u8 = 1 << 2; // Kalinga: +25% loot
pub const POWER_VIDYA_REACH: u8 = 1 << 3; // Takshashila: attack non-adjacent
pub const POWER_ANNAPURNA_HARVEST: u8 = 1 << 4; // Vijayanagar: half loss on failed attacks
pub const POWER_RATRI_RAID: u8 = 1 << 5; // Avanti: first attack x1.5

/// Default adjacency (bitmask per territory), see docs/ARCHITECTURE.md.
/// 0 Hastinapur ↔ 1,2,5 · 1 Magadh ↔ 0,2,3 · 2 Kalinga ↔ 0,1,4
/// 3 Takshashila ↔ 1,4,5 · 4 Vijayanagar ↔ 2,3,5 · 5 Avanti ↔ 0,3,4
pub const DEFAULT_ADJACENCY: [u8; N] = [
    0b100110, 0b001101, 0b010011, 0b110010, 0b101100, 0b011001,
];
