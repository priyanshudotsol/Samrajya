use anchor_lang::prelude::*;

use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Phase {
    Lobby,
    Active,
    Ended,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug)]
pub struct GameConfig {
    pub min_stake: u64,
    pub epoch_secs: i64,
    pub leave_fee_bps: u16,
    pub switch_fee_bps: u16,
    pub k_loss_bps: u16,
    pub storm_decay_bps: u16,
    /// Starting flat defense every territory gets; decays each epoch ("the storm").
    pub base_defense: u64,
    pub adjacency: [u8; N],
}

impl GameConfig {
    pub fn default_with(min_stake: u64, epoch_secs: i64, base_defense: u64) -> Self {
        Self {
            min_stake,
            epoch_secs,
            leave_fee_bps: 2_000,
            switch_fee_bps: 4_000,
            k_loss_bps: 2_000,
            storm_decay_bps: 500,
            base_defense,
            adjacency: DEFAULT_ADJACENCY,
        }
    }
}

/// One kingdom. Stored inline in `Game` so battles touch a single account.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, Debug)]
pub struct Faction {
    /// Accounting lamports (real SOL sits in the vault). Also the kingdom's army strength.
    pub treasury: u64,
    /// Player value = shares × treasury / total_shares.
    pub total_shares: u128,
    /// Bumped when the kingdom is wiped out, so stale shares are worth 0.
    pub generation: u32,
    pub members: u32,
    pub territories: u8,
    pub powers: u8,
    pub alive: bool,
    pub ambush_used: bool,
    /// Lamports of value committed this epoch to attack each territory.
    pub attack_alloc: [u64; N],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, Debug, PartialEq, Eq)]
pub struct BattleEntry {
    pub epoch: u32,
    pub territory: u8,
    pub defender: u8,
    pub winner: u8,
    pub attackers_mask: u8,
    /// Size of the defender's bucket (defender wins if roll < defense).
    pub defense: u64,
    pub total: u64,
    pub roll: u64,
    /// Treasury moved to the winner (loot or failed-attack losses).
    pub spoils: u64,
    pub eliminated: bool,
}

#[account]
#[derive(InitSpace, Debug)]
pub struct Game {
    pub authority: Pubkey,
    pub game_id: u64,
    pub bump: u8,
    pub vault_bump: u8,
    pub phase: Phase,
    pub epoch: u32,
    pub epoch_ends_at: i64,
    pub pending_vrf: bool,
    pub vrf_requested_at: i64,
    pub config: GameConfig,
    /// Current flat defense (decays every epoch).
    pub base_defense: u64,
    /// Faction index owning each territory.
    pub territory_owner: [u8; N],
    pub factions: [Faction; N],
    /// Valid only when phase == Ended.
    pub winner: u8,
    pub battle_log: [BattleEntry; BATTLE_LOG_LEN],
    /// Total number of battles ever logged; next slot = battle_count % BATTLE_LOG_LEN.
    pub battle_count: u32,
}

#[account]
#[derive(InitSpace, Debug)]
pub struct Player {
    pub wallet: Pubkey,
    pub game: Pubkey,
    pub bump: u8,
    pub faction: u8,
    pub generation: u32,
    pub shares: u128,
    /// SOL deposited on base but not yet turned into shares (`enlist` on the ER).
    pub pending_deposit: u64,
    /// SOL owed after `leave`, paid by `withdraw` on base.
    pub pending_withdrawal: u64,
    /// Lifetime SOL put in, for P&L in the UI.
    pub deposited_total: u64,
    pub alloc_target: u8,
    pub alloc_amount: u64,
    pub alloc_epoch: u32,
    pub claimed: bool,
}

impl Player {
    pub fn is_enlisted(&self) -> bool {
        self.shares > 0
    }
}
