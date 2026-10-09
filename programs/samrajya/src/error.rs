use anchor_lang::prelude::*;

#[error_code]
pub enum SamrajyaError {
    #[msg("Invalid game configuration")]
    InvalidConfig,
    #[msg("Action not allowed in the current game phase")]
    WrongPhase,
    #[msg("Only the game authority can do this")]
    Unauthorized,
    #[msg("Entry must equal the ticket price")]
    WrongTicket,
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
    #[msg("Upgrade already at its highest level")]
    MaxLevel,
    #[msg("Your kingdom already bought an upgrade this epoch")]
    UpgradeCooldown,
    #[msg("The treasury cannot pay for that")]
    CannotAfford,
    #[msg("The lobby is still open, or fewer than two kingdoms have members")]
    LobbyNotReady,
    #[msg("The next war must take the next game id")]
    StaleGameId,
    #[msg("The current war has not ended (or its result is not committed to Solana yet)")]
    PreviousWarNotOver,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Your warrior has fallen and waits for the bell")]
    Fallen,
    #[msg("That move is not allowed")]
    InvalidUnit,
    #[msg("Your weapon is not ready yet")]
    NotReady,
    #[msg("Every member's warrior must be mustered for the bell")]
    IncompleteMuster,
    #[msg("A defender still holds that fort")]
    FortHeld,
}
