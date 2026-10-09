//! Samrajya — a real-time war for the globe on MagicBlock Ephemeral Rollups.
//!
//! Lifecycle (ARCHITECTURE §4 "Layers"):
//! - Lobby on Solana: `init_game`, `join` + `enlist` (SOL → vault), `switch_kingdom`, `leave` + `withdraw`
//! - Start: `start_game` on Solana, then anyone delegates the Game and every Player to the ER
//!   (`delegate_game`, `delegate_player`)
//! - War on the ER: `enlist`, `allocate`, `switch_kingdom`, `upgrade`, `leave`, `resolve_epoch`
//!   (+ VRF `battle_callback`), `undelegate_player`
//! - End: once one kingdom holds everything, anyone commits and undelegates every Player
//!   (`release_players`) and the Game (`end_game`) back to Solana, where winners `claim`
//! SOL never moves on the ER; kingdom treasuries are accounting numbers backed by the vault.
//! Rules live in `math.rs`.

pub mod constants;
pub mod error;
pub mod field;
pub mod math;
pub mod state;

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral, vrf, vrf_callback};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;
use session_keys::{session_auth_or, Session, SessionError, SessionTokenV2};

pub use constants::*;
pub use error::SamrajyaError;
pub use state::*;

declare_id!("Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng");

#[ephemeral]
#[program]
pub mod samrajya {
    use super::*;

    // ------------------------------------------------------------ base layer

    /// Creates the game and its SOL vault, and points the registry at it. Anyone may open
    /// the next war once the previous one has ended and been committed back to base
    /// (`end_game`), so nobody can pull players away from a war in progress. The vault is
    /// pre-funded with rent so payouts never leave it below the rent-exempt minimum.
    pub fn init_game(ctx: Context<InitGame>, game_id: u64, config: GameConfig) -> Result<()> {
        require!(config.epoch_secs > 0 && config.ticket > 0 && config.lobby_secs >= 0, SamrajyaError::InvalidConfig);
        require!(
            config.leave_fee_bps <= 10_000
                && config.switch_fee_bps <= 10_000
                && config.k_loss_bps <= 10_000
                && config.storm_decay_bps <= 10_000
                && config.plains_tax_bps <= 10_000
                && config.upgrade_cost_bps as u64 * MAX_UPGRADE_LEVEL as u64 <= 10_000,
            SamrajyaError::InvalidConfig
        );
        let registry = &mut ctx.accounts.registry;
        if registry.latest_game == 0 {
            require!(game_id > 0, SamrajyaError::StaleGameId);
        } else {
            require!(game_id == registry.latest_game + 1, SamrajyaError::StaleGameId);
            let prev = ctx.accounts.previous.as_ref().ok_or(SamrajyaError::PreviousWarNotOver)?;
            let expected = Pubkey::find_program_address(&[GAME_SEED, &registry.latest_game.to_le_bytes()], &crate::ID).0;
            require_keys_eq!(prev.key(), expected, SamrajyaError::PreviousWarNotOver);
            // Owned by us (not the delegation program) means `end_game` committed it back.
            require!(prev.owner == &crate::ID, SamrajyaError::PreviousWarNotOver);
            // Read only the phase (discriminator 8 + authority 32 + game_id 8 + bump 1 + vault_bump 1),
            // so a war opened by an older program version (another layout) can still be followed.
            let data = prev.try_borrow_data()?;
            require!(data.len() > 50 && data[..8] == *Game::DISCRIMINATOR, SamrajyaError::PreviousWarNotOver);
            require!(data[50] == Phase::Ended as u8, SamrajyaError::PreviousWarNotOver);
        }
        registry.latest_game = game_id;
        registry.bump = ctx.bumps.registry;

        let game = &mut ctx.accounts.game;
        game.authority = ctx.accounts.authority.key();
        game.game_id = game_id;
        game.bump = ctx.bumps.game;
        game.vault_bump = ctx.bumps.vault;
        game.phase = Phase::Lobby;
        game.epoch_ends_at = Clock::get()?.unix_timestamp + config.lobby_secs;
        game.base_defense = config.base_defense;
        game.plains_defense = config.plains_defense;
        game.config = config;
        game.territory_owner = math::new_territories();
        game.factions = math::new_factions();
        game.gates = [GATE_HP; N];

        let rent = Rent::get()?.minimum_balance(0);
        if ctx.accounts.vault.lamports() < rent {
            transfer(
                CpiContext::new(
                    ctx.accounts.system_program.key(),
                    Transfer {
                        from: ctx.accounts.authority.to_account_info(),
                        to: ctx.accounts.vault.to_account_info(),
                    },
                ),
                rent - ctx.accounts.vault.lamports(),
            )?;
        }
        Ok(())
    }

    /// Deposits the ticket into the vault. It becomes one equal share when the player
    /// `enlist`s (on the ER while the game is delegated). Fails while the Player is delegated.
    pub fn join(ctx: Context<Join>, amount: u64) -> Result<()> {
        let game = read_game(&ctx.accounts.game)?;
        require!(game.phase != Phase::Ended, SamrajyaError::WrongPhase);
        require!(amount == game.config.ticket, SamrajyaError::WrongTicket);
        require!(ctx.accounts.player.pending_deposit == 0, SamrajyaError::AlreadyEnlisted);

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.wallet.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        let player = &mut ctx.accounts.player;
        if player.wallet == Pubkey::default() {
            player.wallet = ctx.accounts.wallet.key();
            player.game = ctx.accounts.game.key();
            player.bump = ctx.bumps.player;
            player.alloc_target = DEFEND;
        }
        player.claimed = false;
        player.pending_deposit += amount;
        player.deposited_total += amount;
        Ok(())
    }

    /// Delegates a Player PDA to the ER. The player may always (mid-war `join` sends it in the
    /// same tx); anyone may once the war has started, for an enlisted player with nothing
    /// waiting to be withdrawn (that is how the whole lobby moves to the ER at the start).
    pub fn delegate_player(ctx: Context<DelegatePlayer>) -> Result<()> {
        let game = ctx.accounts.game.key();
        let wallet = ctx.accounts.wallet.key();
        if ctx.accounts.payer.key() != wallet {
            require!(read_game(&ctx.accounts.game)?.phase == Phase::Active, SamrajyaError::WrongPhase);
            let player = {
                let data = ctx.accounts.pda.try_borrow_data()?;
                Player::try_deserialize(&mut &data[..])?
            };
            require!(player.shares > 0 && player.pending_withdrawal == 0, SamrajyaError::NotEnlisted);
        }
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[PLAYER_SEED, game.as_ref(), wallet.as_ref()],
            DelegateConfig { validator: ctx.accounts.validator.as_ref().map(|v| v.key()), ..Default::default() },
        )?;
        Ok(())
    }

    /// Moves the Game to the ER: anyone once the war has started (the lobby stays on Solana),
    /// the authority any time.
    pub fn delegate_game(ctx: Context<DelegateGame>, game_id: u64) -> Result<()> {
        let game = {
            let data = ctx.accounts.pda.try_borrow_data()?;
            Game::try_deserialize(&mut &data[..])?
        };
        require!(
            game.phase == Phase::Active || game.authority == ctx.accounts.payer.key(),
            SamrajyaError::WrongPhase
        );
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[GAME_SEED, &game_id.to_le_bytes()],
            DelegateConfig { validator: ctx.accounts.validator.as_ref().map(|v| v.key()), ..Default::default() },
        )?;
        Ok(())
    }

    /// Pays out `pending_withdrawal` (set by `leave`) from the vault. Base layer, after the
    /// Player has been committed back with `undelegate_player`.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let amount = ctx.accounts.player.pending_withdrawal;
        require!(amount > 0, SamrajyaError::NothingToWithdraw);
        ctx.accounts.player.pending_withdrawal = 0;
        pay_from_vault(
            &ctx.accounts.vault,
            &ctx.accounts.wallet.to_account_info(),
            amount,
            &ctx.accounts.system_program,
            ctx.accounts.game.key(),
            ctx.bumps.vault,
        )
    }

    /// Winners claim their share of the whole pot. Base layer, after `end_game` and
    /// `undelegate_player` have committed the final state.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let out = math::claim(&mut ctx.accounts.game, &mut ctx.accounts.player)?;
        let game_key = ctx.accounts.game.key();
        pay_from_vault(&ctx.accounts.vault, &ctx.accounts.wallet.to_account_info(), out, &ctx.accounts.system_program, game_key, ctx.bumps.vault)
    }

    // ------------------------------------------------------------ ER (or base before delegation)

    /// Closes the lobby. The authority may start any time; anyone else once the lobby
    /// timer has run out and at least two kingdoms have members.
    pub fn start_game(ctx: Context<StartGame>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let game = &mut ctx.accounts.game;
        require!(game.phase == Phase::Lobby, SamrajyaError::WrongPhase);
        require!(game.authority == ctx.accounts.signer.key() || math::lobby_ready(game, now), SamrajyaError::LobbyNotReady);
        math::start(game, now);
        Ok(())
    }

    /// Turns the pending deposit into shares of `faction`.
    #[session_auth_or(ctx.accounts.player.wallet == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    pub fn enlist(ctx: Context<PlayerAction>, faction: u8) -> Result<()> {
        math::enlist(&mut ctx.accounts.game, &mut ctx.accounts.player, faction)
    }

    /// Commit `amount` lamports of your value to attack `target` (255 = defend).
    #[session_auth_or(ctx.accounts.player.wallet == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    pub fn allocate(ctx: Context<PlayerAction>, target: u8, amount: u64) -> Result<()> {
        math::allocate(&mut ctx.accounts.game, &mut ctx.accounts.player, target, amount)
    }

    /// Move to another kingdom; 40% of your value stays behind.
    #[session_auth_or(ctx.accounts.player.wallet == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    pub fn switch_kingdom(ctx: Context<PlayerAction>, to: u8) -> Result<()> {
        math::switch(&mut ctx.accounts.game, &mut ctx.accounts.player, to).map(|_| ())
    }

    /// Spend kingdom treasury on the next level of an upgrade (0 = walls, 1 = armory).
    #[session_auth_or(ctx.accounts.player.wallet == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    pub fn upgrade(ctx: Context<PlayerAction>, kind: u8) -> Result<()> {
        math::upgrade(&mut ctx.accounts.game, &ctx.accounts.player, kind).map(|_| ())
    }

    /// Leave the war; 80% of your value becomes `pending_withdrawal`. On the ER, follow with
    /// `undelegate_player` in the same tx, then `withdraw` on base.
    #[session_auth_or(ctx.accounts.player.wallet == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    pub fn leave(ctx: Context<PlayerAction>) -> Result<()> {
        math::leave(&mut ctx.accounts.game, &mut ctx.accounts.player).map(|_| ())
    }

    /// Moves your warrior (validated step), changes its action / gear / role, or teleports it
    /// (`at` changes: to a realm your kingdom holds, or the one it ordered you to attack).
    #[session_auth_or(ctx.accounts.player.wallet == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    #[allow(clippy::too_many_arguments)]
    pub fn move_unit(ctx: Context<PlayerAction>, at: u8, x: i16, z: i16, fx: i8, fz: i8, action: u8, gear: u8, role: u8) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let game = &ctx.accounts.game;
        field::move_unit(&mut ctx.accounts.player, game, at, x, z, fx, fz, action, gear, role, now)
    }

    /// Swings / shoots from (x, z) facing (fx, fz). Remaining accounts: the Players the client
    /// believes are in reach (writable); the program re-checks reach, arc, walls and blocking,
    /// wounds them, and batters the gate when the blow hits nobody.
    #[session_auth_or(ctx.accounts.player.wallet == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    pub fn strike(ctx: Context<PlayerAction>, x: i16, z: i16, fx: i8, fz: i8, heavy: bool) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let game_key = ctx.accounts.game.key();
        {
            let p = &mut ctx.accounts.player;
            let (at, a, g, r) = (p.unit.at, p.unit.action, p.unit.gear, p.unit.role);
            field::move_unit(p, &ctx.accounts.game, at, x, z, fx, fz, a, g, r, now)?;
        }
        let mut targets = Vec::with_capacity(ctx.remaining_accounts.len());
        for info in ctx.remaining_accounts.iter() {
            require!(info.is_writable, SamrajyaError::Unauthorized);
            let p = read_player(info)?;
            require_keys_eq!(p.game, game_key, SamrajyaError::Unauthorized);
            targets.push(p);
        }
        let (hits, gate) = field::strike(&mut ctx.accounts.player, &mut targets, &mut ctx.accounts.game, fx, fz, heavy, now)?;
        for h in &hits {
            msg!("hit {} for {}{}", targets[h.index].wallet, h.damage, if h.killed { " (fallen)" } else { "" });
            write_player(&ctx.remaining_accounts[h.index], &targets[h.index])?;
        }
        if gate > 0 {
            msg!("gate {} −{}", ctx.accounts.player.unit.at, gate);
        }
        Ok(())
    }

    /// Walks into an abandoned fort (§10.11): your warrior steps to (x, z) inside realm `at`'s walls
    /// with an order on it, and no member of its owner stands alive there. Remaining accounts:
    /// every Player with shares (the owner's are checked complete). The realm falls at once.
    #[session_auth_or(ctx.accounts.player.wallet == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    pub fn seize(ctx: Context<PlayerAction>, x: i16, z: i16) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let game_key = ctx.accounts.game.key();
        {
            let p = &mut ctx.accounts.player;
            let (at, a, fx, fz, g, r) = (p.unit.at, p.unit.action, p.unit.fx, p.unit.fz, p.unit.gear, p.unit.role);
            field::move_unit(p, &ctx.accounts.game, at, x, z, fx, fz, a, g, r, now)?;
        }
        let mut players = Vec::with_capacity(ctx.remaining_accounts.len());
        let mut keys = Vec::with_capacity(ctx.remaining_accounts.len());
        for info in ctx.remaining_accounts.iter() {
            let p = read_player(info)?;
            require_keys_eq!(p.game, game_key, SamrajyaError::Unauthorized);
            keys.push(info.key());
            players.push(p);
        }
        let t = ctx.accounts.player.unit.at as usize;
        field::check_abandoned(&ctx.accounts.game, t, &ctx.accounts.player, &players, &keys)?;
        let faction = ctx.accounts.player.faction;
        let e = math::seize(&mut ctx.accounts.game, t, faction)?;
        msg!("seized {} from {}", t, e.defender);
        Ok(())
    }

    /// Commits the Player back to base (after `leave`, or after the game ends to `claim`).
    #[session_auth_or(ctx.accounts.player.wallet == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    pub fn undelegate_player(ctx: Context<UndelegatePlayer>) -> Result<()> {
        ctx.accounts.player.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.player.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }

    /// Permissionless game clock (the bell). Remaining accounts: every enlisted member's Player
    /// (checked complete), so the program can read the hand fight in every realm: no living member
    /// of the holder there and committed attackers at the gate / inside (in the stone circle on
    /// Kurukshetra) take it, otherwise it holds (§10.8, §10.11). Every battle is decided by the
    /// fight, so the bell resolves at once; the VRF accounts stay for compatibility, unused.
    pub fn resolve_epoch(ctx: Context<ResolveEpoch>, client_seed: u8) -> Result<()> {
        let _ = client_seed;
        let now = Clock::get()?.unix_timestamp;
        let game = &mut ctx.accounts.game;
        check_can_resolve(game, now)?;
        if !math::has_battles(game) {
            math::advance_epoch(game, now);
            return Ok(());
        }
        let game_key = game.key();
        let mut players = Vec::with_capacity(ctx.remaining_accounts.len());
        let mut keys = Vec::with_capacity(ctx.remaining_accounts.len());
        for info in ctx.remaining_accounts.iter() {
            let p = read_player(info)?;
            require_keys_eq!(p.game, game_key, SamrajyaError::Unauthorized);
            keys.push(info.key());
            players.push(p);
        }
        field::check_complete(game, &players, &keys)?;
        field::decide_forts(game, &players);
        math::resolve_epoch(game, &[0u8; 32], now);
        Ok(())
    }

    /// VRF callback: resolves every battle with the oracle's randomness.
    pub fn battle_callback(ctx: Context<BattleCallback>, randomness: [u8; 32]) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.pending_vrf && game.phase == Phase::Active, SamrajyaError::WrongPhase);
        math::resolve_epoch(game, &randomness, Clock::get()?.unix_timestamp);
        Ok(())
    }

    /// Test-only resolution without VRF. Rejected unless built with `--features debug`.
    pub fn resolve_epoch_debug(ctx: Context<AuthorityGame>, randomness: [u8; 32]) -> Result<()> {
        require!(cfg!(feature = "debug"), SamrajyaError::Unauthorized);
        let now = Clock::get()?.unix_timestamp;
        let game = &mut ctx.accounts.game;
        check_can_resolve(game, now)?;
        math::resolve_epoch(game, &randomness, now);
        Ok(())
    }

    /// Stops a broken war (authority): it ends with no winner and every member can `claim` their
    /// current value back once it is committed to Solana.
    pub fn abort_game(ctx: Context<AuthorityGame>) -> Result<()> {
        math::abort(&mut ctx.accounts.game)
    }

    /// After the war: commits and undelegates the Players passed as remaining accounts back to
    /// Solana (permissionless; send in batches, then `end_game`).
    pub fn release_players<'info>(ctx: Context<'info, ReleasePlayers<'info>>) -> Result<()> {
        require!(ctx.accounts.game.phase == Phase::Ended, SamrajyaError::WrongPhase);
        let players = players_of(ctx.accounts.game.key(), ctx.remaining_accounts)?;
        require!(!players.is_empty(), SamrajyaError::NothingToWithdraw);
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&players)
        .build_and_invoke()?;
        Ok(())
    }

    /// Commits the finished game back to Solana so winners can `claim`, with any Players passed
    /// as remaining accounts (the rest go through `release_players`).
    pub fn end_game<'info>(ctx: Context<'info, EndGame<'info>>) -> Result<()> {
        require!(ctx.accounts.game.phase == Phase::Ended, SamrajyaError::WrongPhase);
        let mut accounts = players_of(ctx.accounts.game.key(), ctx.remaining_accounts)?;
        accounts.push(ctx.accounts.game.to_account_info());
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&accounts)
        .build_and_invoke()?;
        Ok(())
    }
}

/// A Player account passed as a remaining account (must be ours).
fn read_player(info: &AccountInfo) -> Result<Player> {
    require!(info.owner == &crate::ID, SamrajyaError::Unauthorized);
    let data = info.try_borrow_data()?;
    Player::try_deserialize(&mut &data[..])
}

fn write_player(info: &AccountInfo, p: &Player) -> Result<()> {
    let mut data = info.try_borrow_mut_data()?;
    let mut w: &mut [u8] = &mut data[..];
    p.try_serialize(&mut w)
}

/// The Players of `game` among `accounts` (writable, ours, `player.game == game`).
fn players_of<'info>(game: Pubkey, accounts: &[AccountInfo<'info>]) -> Result<Vec<AccountInfo<'info>>> {
    let mut out = Vec::with_capacity(accounts.len());
    for a in accounts {
        require!(a.owner == &crate::ID && a.is_writable, SamrajyaError::Unauthorized);
        let p = {
            let data = a.try_borrow_data()?;
            Player::try_deserialize(&mut &data[..])?
        };
        require_keys_eq!(p.game, game, SamrajyaError::Unauthorized);
        out.push(a.clone());
    }
    Ok(out)
}

fn check_can_resolve(game: &Game, now: i64) -> Result<()> {
    require!(game.phase == Phase::Active, SamrajyaError::WrongPhase);
    require!(now >= game.epoch_ends_at, SamrajyaError::EpochNotOver);
    require!(!game.pending_vrf || now - game.vrf_requested_at >= VRF_RETRY_SECS, SamrajyaError::BattlePending);
    Ok(())
}

/// Reads the Game from an account that may currently be delegated (owned by the
/// delegation program). Only immutable fields (config, ids) should be trusted from it.
fn read_game(info: &UncheckedAccount) -> Result<Game> {
    require!(
        info.owner == &crate::ID || info.owner == &ephemeral_rollups_sdk::id(),
        SamrajyaError::WrongPhase
    );
    let data = info.try_borrow_data()?;
    Game::try_deserialize(&mut &data[..])
}

fn pay_from_vault<'info>(
    vault: &SystemAccount<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
    system_program: &Program<'info, System>,
    game: Pubkey,
    vault_bump: u8,
) -> Result<()> {
    let seeds: &[&[&[u8]]] = &[&[VAULT_SEED, game.as_ref(), &[vault_bump]]];
    transfer(
        CpiContext::new_with_signer(system_program.key(), Transfer { from: vault.to_account_info(), to: to.clone() }, seeds),
        amount,
    )
}

// ---------------------------------------------------------------- contexts

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct InitGame<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Game::INIT_SPACE, seeds = [GAME_SEED, &game_id.to_le_bytes()], bump)]
    pub game: Box<Account<'info, Game>>,
    #[account(init_if_needed, payer = authority, space = 8 + Registry::INIT_SPACE, seeds = [REGISTRY_SEED], bump)]
    pub registry: Account<'info, Registry>,
    /// CHECK: the registry's latest game; must be Ended and back on base. Validated in the handler.
    pub previous: Option<UncheckedAccount<'info>>,
    #[account(mut, seeds = [VAULT_SEED, game.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Join<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    /// CHECK: may be delegated; validated in `read_game` (owner + discriminator).
    pub game: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = wallet,
        space = 8 + Player::INIT_SPACE,
        seeds = [PLAYER_SEED, game.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [VAULT_SEED, game.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePlayer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: the player's wallet, only used for seeds.
    pub wallet: UncheckedAccount<'info>,
    /// CHECK: the game (may be delegated); validated in `read_game` when someone else delegates.
    pub game: UncheckedAccount<'info>,
    /// CHECK: the Player PDA to delegate, checked by seeds.
    #[account(mut, del, seeds = [PLAYER_SEED, game.key().as_ref(), wallet.key().as_ref()], bump)]
    pub pda: UncheckedAccount<'info>,
    /// CHECK: optional ER validator identity.
    pub validator: Option<UncheckedAccount<'info>>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct DelegateGame<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: the Game PDA to delegate; phase / authority verified in the handler.
    #[account(mut, del, seeds = [GAME_SEED, &game_id.to_le_bytes()], bump)]
    pub pda: UncheckedAccount<'info>,
    /// CHECK: optional ER validator identity.
    pub validator: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// Anyone may trigger; funds only go to `player.wallet`.
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: may be delegated; only its key is used (vault seeds, player.game check).
    pub game: UncheckedAccount<'info>,
    #[account(mut, seeds = [PLAYER_SEED, game.key().as_ref(), player.wallet.as_ref()], bump = player.bump, has_one = game, has_one = wallet)]
    pub player: Account<'info, Player>,
    /// CHECK: payout recipient, must equal player.wallet.
    #[account(mut)]
    pub wallet: UncheckedAccount<'info>,
    #[account(mut, seeds = [VAULT_SEED, game.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Game>>,
    #[account(mut, seeds = [PLAYER_SEED, game.key().as_ref(), player.wallet.as_ref()], bump = player.bump, has_one = game, has_one = wallet)]
    pub player: Account<'info, Player>,
    /// CHECK: payout recipient, must equal player.wallet.
    #[account(mut)]
    pub wallet: UncheckedAccount<'info>,
    #[account(mut, seeds = [VAULT_SEED, game.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AuthorityGame<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump = game.bump, has_one = authority)]
    pub game: Box<Account<'info, Game>>,
}

#[derive(Accounts)]
pub struct StartGame<'info> {
    pub signer: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Game>>,
}

#[derive(Accounts, Session)]
pub struct PlayerAction<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Game>>,
    #[account(mut, seeds = [PLAYER_SEED, game.key().as_ref(), player.wallet.as_ref()], bump = player.bump, has_one = game)]
    pub player: Account<'info, Player>,
    #[session(signer = signer, authority = player.wallet.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
}

#[commit]
#[derive(Accounts, Session)]
pub struct UndelegatePlayer<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(mut, seeds = [PLAYER_SEED, player.game.as_ref(), player.wallet.as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
    #[session(signer = signer, authority = player.wallet.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
}

#[vrf]
#[derive(Accounts)]
pub struct ResolveEpoch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Game>>,
    /// CHECK: validated by the VRF program when it processes the request.
    #[account(mut)]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct BattleCallback<'info> {
    #[account(mut)]
    pub game: Box<Account<'info, Game>>,
}

#[commit]
#[derive(Accounts)]
pub struct ReleasePlayers<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Game>>,
}

#[commit]
#[derive(Accounts)]
pub struct EndGame<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Game>>,
}
