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
    /// Everyone enters with exactly this many lamports, and every member owns an equal share.
    pub ticket: u64,
    pub epoch_secs: i64,
    pub leave_fee_bps: u16,
    pub switch_fee_bps: u16,
    pub k_loss_bps: u16,
    pub storm_decay_bps: u16,
    /// Starting flat defense every territory gets; decays each epoch ("the storm").
    pub base_defense: u64,
    pub adjacency: [u8; T],
    /// Garrison of the neutral plains; decays with the storm like `base_defense`.
    pub plains_defense: u64,
    /// Cut of every battle's spoils that goes to the plains pot.
    pub plains_tax_bps: u16,
    /// Upgrade level `n` (1-based) costs `n × upgrade_cost_bps` of the treasury.
    pub upgrade_cost_bps: u16,
    /// Each upgrade level adds this much to attack (armory) or defense (walls).
    pub upgrade_bonus_bps: u16,
    /// Attack and defense bonus per territory held beyond the first.
    pub conquest_bonus_bps: u16,
    /// After this long in the lobby anyone may start the war.
    pub lobby_secs: i64,
}

impl GameConfig {
    pub fn default_with(ticket: u64, epoch_secs: i64, base_defense: u64) -> Self {
        Self {
            ticket,
            epoch_secs,
            leave_fee_bps: 2_000,
            switch_fee_bps: 4_000,
            k_loss_bps: 2_000,
            storm_decay_bps: 500,
            base_defense,
            adjacency: DEFAULT_ADJACENCY,
            plains_defense: base_defense * 3,
            plains_tax_bps: 1_000,
            upgrade_cost_bps: 500,
            upgrade_bonus_bps: 1_500,
            conquest_bonus_bps: 1_500,
            lobby_secs: 120,
        }
    }
}

/// One kingdom. Stored inline in `Game` so battles touch a single account.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, Debug)]
pub struct Faction {
    /// Accounting lamports (real SOL sits in the vault). Also the kingdom's army strength.
    pub treasury: u64,
    /// Player value = shares × treasury / total_shares. Each member holds `SHARES_PER_MEMBER`.
    pub total_shares: u128,
    /// Bumped when the kingdom is wiped out, so stale shares are worth 0.
    pub generation: u32,
    pub members: u32,
    pub territories: u8,
    pub powers: u8,
    pub alive: bool,
    pub ambush_used: bool,
    /// Lamports of value committed this epoch to attack each territory.
    pub attack_alloc: [u64; T],
    /// Level of each upgrade (`UPGRADE_WALLS`, `UPGRADE_ARMORY`).
    pub upgrades: [u8; UPGRADES],
    /// Epoch of the last upgrade purchase (one per kingdom per epoch).
    pub upgraded_epoch: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, Debug, PartialEq, Eq)]
pub struct BattleEntry {
    pub epoch: u32,
    pub territory: u8,
    /// `NEUTRAL` when the plains were attacked before anyone held them.
    pub defender: u8,
    pub winner: u8,
    pub attackers_mask: u8,
    /// Size of the defender's bucket (defender wins if roll < defense).
    pub defense: u64,
    pub total: u64,
    pub roll: u64,
    /// Treasury moved to the winner (loot or failed-attack losses), after the plains tax.
    pub spoils: u64,
    pub eliminated: bool,
    /// Decided by the hand fight (a walled realm): no roll; captured if the fort was cleared.
    pub by_fight: bool,
}

/// A member's warrior on the battlefield (docs/ARCHITECTURE.md §10, `field.rs`). Positions are in
/// the realm's coordinates ×100 (keep at the origin, the gate mid-edge at +z).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, Debug, PartialEq, Eq)]
pub struct Unit {
    /// Territory the warrior stands in (`NO_REALM` when it has none).
    pub at: u8,
    pub x: i16,
    pub z: i16,
    /// Facing as a unit vector ×100.
    pub fx: i8,
    pub fz: i8,
    pub action: u8,
    pub gear: u8,
    pub role: u8,
    pub hp: u8,
    /// Counts strikes (wrapping) so every client can animate each blow.
    pub strikes: u8,
    /// Fallen: back on its feet at home at this time. 0 = alive.
    pub dead_until: i64,
    pub moved_at: i64,
    /// Strike rate limit: strikes made during `strike_sec`.
    pub strike_sec: i64,
    pub strike_count: u8,
    /// Last roll (`ACTION_DODGE`): untouchable for about a second, once per `DODGE_COOLDOWN_SECS`.
    pub dodge_at: i64,
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
    /// End of the current epoch, or of the lobby while `phase == Lobby`.
    pub epoch_ends_at: i64,
    pub pending_vrf: bool,
    pub vrf_requested_at: i64,
    pub config: GameConfig,
    /// Current flat defense (decays every epoch).
    pub base_defense: u64,
    /// Current garrison of the neutral plains (decays every epoch).
    pub plains_defense: u64,
    /// Lamports waiting for the plains holder: the plains tax, upgrade spending and attacks
    /// lost against the neutral garrison. Paid to the holder at the end of every epoch.
    pub plains_pot: u64,
    /// Faction index owning each territory (`NEUTRAL` for an unheld plains).
    pub territory_owner: [u8; T],
    pub factions: [Faction; N],
    /// Valid only when phase == Ended.
    pub winner: u8,
    pub battle_log: [BattleEntry; BATTLE_LOG_LEN],
    /// Total number of battles ever logged; next slot = battle_count % BATTLE_LOG_LEN.
    pub battle_count: u32,
    /// Gate hit points per homeland (repaired at every bell).
    pub gates: [u16; N],
    /// The hand fight's verdict per territory for the bell being resolved (`fight_set`):
    /// the owner = held, another faction = it cleared the fort.
    pub fight: [u8; T],
    pub fight_set: bool,
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
    pub unit: Unit,
}

impl Player {
    pub fn is_enlisted(&self) -> bool {
        self.shares > 0
    }
}

/// Points the app at the newest war. Lives on base and is never delegated.
#[account]
#[derive(InitSpace, Debug)]
pub struct Registry {
    pub latest_game: u64,
    pub bump: u8,
}
