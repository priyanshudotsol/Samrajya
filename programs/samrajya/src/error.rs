use anchor_lang::prelude::*;

#[error_code]
pub enum SamrajyaError {
    #[msg("Invalid game configuration")]
    InvalidConfig,
    #[msg("Action not allowed in the current game phase")]
    WrongPhase,
    #[msg("Only the game authority can do this")]
    Unauthorized,
    #[msg("Stake is below the minimum")]
    StakeTooSmall,
    #[msg("Invalid kingdom index")]
    InvalidFaction,
    #[msg("Invalid territory index")]
    InvalidTerritory,
    #[msg("That kingdom has been eliminated")]
    FactionEliminated,
    #[msg("Player already belongs to a kingdom; leave first")]
    AlreadyEnlisted,
    #[msg("Player has no pending deposit")]
    NothingToEnlist,
    #[msg("Player is not in a kingdom")]
    NotEnlisted,
    #[msg("Target territory is not reachable from your kingdom")]
    NotAdjacent,
    #[msg("You already own that territory")]
    OwnTerritory,
    #[msg("Allocation exceeds your current value")]
    AmountTooLarge,
    #[msg("A battle is being resolved; try again in a moment")]
    BattlePending,
    #[msg("The epoch has not ended yet")]
    EpochNotOver,
    #[msg("Cannot switch to the same kingdom")]
    SameFaction,
    #[msg("Nothing to withdraw")]
    NothingToWithdraw,
    #[msg("Not a member of the winning kingdom")]
    NotWinner,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Player must withdraw pending funds first")]
    PendingWithdrawal,
    #[msg("Math overflow")]
    MathOverflow,
}
