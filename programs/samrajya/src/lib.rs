//! Samrajya — a real-time war for the globe on MagicBlock Ephemeral Rollups.
//!
//! Layers:
//! - base layer: `init_game`, `join` (SOL → vault), `delegate_*`, `withdraw`, `claim`
//! - ER: `start_game`, `enlist`, `allocate`, `switch_kingdom`, `leave`, `resolve_epoch`
//!   (+ VRF `battle_callback`), `undelegate_player`, `end_game`
//! SOL never moves on the ER; kingdom treasuries are accounting numbers backed by the vault.
//! Rules live in `math.rs`.

pub mod constants;
pub mod error;
pub mod math;
pub mod state;

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral, vrf, vrf_callback};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;
use ephemeral_rollups_sdk::vrf::instructions::{create_request_scoped_randomness_ix, RequestRandomnessParams};
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;
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

    /// Creates the game and its SOL vault. The vault is pre-funded with rent so payouts
    /// never leave it below the rent-exempt minimum.
    pub fn init_game(ctx: Context<InitGame>, game_id: u64, config: GameConfig) -> Result<()> {
        require!(config.epoch_secs > 0, SamrajyaError::InvalidConfig);
        require!(
            config.leave_fee_bps <= 10_000
                && config.switch_fee_bps <= 10_000
                && config.k_loss_bps <= 10_000
                && config.storm_decay_bps <= 10_000,
            SamrajyaError::InvalidConfig
        );
        let game = &mut ctx.accounts.game;
        game.authority = ctx.accounts.authority.key();
        game.game_id = game_id;
        game.bump = ctx.bumps.game;
        game.vault_bump = ctx.bumps.vault;
        game.phase = Phase::Lobby;
        game.base_defense = config.base_defense;
        game.config = config;
        game.territory_owner = [0, 1, 2, 3, 4, 5];
        game.factions = math::new_factions();

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

    /// Deposits SOL into the vault. The deposit becomes shares when the player `enlist`s
    /// (on the ER while the game is delegated). Fails while the Player is delegated.
    pub fn join(ctx: Context<Join>, amount: u64) -> Result<()> {
        let game = read_game(&ctx.accounts.game)?;
        require!(game.phase != Phase::Ended, SamrajyaError::WrongPhase);
        require!(amount >= game.config.min_stake, SamrajyaError::StakeTooSmall);

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

    /// Delegates the Player PDA to the ER (send in the same tx as `join`).
    pub fn delegate_player(ctx: Context<DelegatePlayer>) -> Result<()> {
        let game = ctx.accounts.game.key();
        let wallet = ctx.accounts.wallet.key();
        ctx.accounts.delegate_pda(
            &ctx.accounts.wallet,
            &[PLAYER_SEED, game.as_ref(), wallet.as_ref()],
            DelegateConfig { validator: ctx.accounts.validator.as_ref().map(|v| v.key()), ..Default::default() },
        )?;
        Ok(())
    }

    /// Delegates the Game PDA to the ER (authority only).
    pub fn delegate_game(ctx: Context<DelegateGame>, game_id: u64) -> Result<()> {
        let authority = {
            let data = ctx.accounts.pda.try_borrow_data()?;
            Game::try_deserialize(&mut &data[..])?.authority
        };
        require_keys_eq!(authority, ctx.accounts.authority.key(), SamrajyaError::Unauthorized);
        ctx.accounts.delegate_pda(
            &ctx.accounts.authority,
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

    pub fn start_game(ctx: Context<AuthorityGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.phase == Phase::Lobby, SamrajyaError::WrongPhase);
        game.phase = Phase::Active;
        game.epoch = 1;
        game.epoch_ends_at = Clock::get()?.unix_timestamp + game.config.epoch_secs;
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

    /// Leave the war; 80% of your value becomes `pending_withdrawal`. On the ER, follow with
    /// `undelegate_player` in the same tx, then `withdraw` on base.
    #[session_auth_or(ctx.accounts.player.wallet == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    pub fn leave(ctx: Context<PlayerAction>) -> Result<()> {
        math::leave(&mut ctx.accounts.game, &mut ctx.accounts.player).map(|_| ())
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

    /// Permissionless game clock. If nobody attacked, just advances the epoch; otherwise
    /// requests VRF and the battles resolve in `battle_callback`.
    pub fn resolve_epoch(ctx: Context<ResolveEpoch>, client_seed: u8) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let game = &mut ctx.accounts.game;
        check_can_resolve(game, now)?;
        if !math::has_battles(game) {
            math::advance_epoch(game, now);
            return Ok(());
        }
        game.pending_vrf = true;
        game.vrf_requested_at = now;
        let mut caller_seed = [client_seed; 32];
        caller_seed[..4].copy_from_slice(&game.epoch.to_le_bytes());
        let ix = create_request_scoped_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::BattleCallback::DISCRIMINATOR.to_vec(),
            caller_seed,
            accounts_metas: Some(vec![SerializableAccountMeta { pubkey: game.key(), is_signer: false, is_writable: true }]),
            ..Default::default()
        });
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
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

    /// Commits the finished game back to base so winners can `claim`.
    pub fn end_game(ctx: Context<EndGame>) -> Result<()> {
        require!(ctx.accounts.game.phase == Phase::Ended, SamrajyaError::WrongPhase);
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.game.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }
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
    pub wallet: Signer<'info>,
    /// CHECK: game key, only used for seeds.
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
    pub authority: Signer<'info>,
    /// CHECK: the Game PDA to delegate; authority verified in the handler.
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
pub struct EndGame<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Box<Account<'info, Game>>,
}
