//! Base-layer integration test: plays a full war in LiteSVM with the real program binary.
//! Needs the debug build (pseudo-random `resolve_epoch_debug`): `yarn test:program`.

use anchor_lang::{
    prelude::{Clock, Pubkey},
    solana_program::instruction::Instruction,
    system_program, AccountDeserialize, InstructionData, ToAccountMetas,
};
use litesvm::LiteSVM;
use samrajya::{accounts, instruction, Game, GameConfig, Phase, Player, DEFEND, GAME_SEED, N, PLAYER_SEED, VAULT_SEED};
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

const SOL: u64 = 1_000_000_000;
const EPOCH_SECS: i64 = 30;

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    game: Pubkey,
    vault: Pubkey,
}

impl Env {
    fn new() -> Self {
        Self::with_binary("samrajya_debug.so")
    }

    fn with_binary(name: &str) -> Self {
        let mut svm = LiteSVM::new();
        let so = format!("{}/../../target/deploy/{name}", env!("CARGO_MANIFEST_DIR"));
        let bytes = std::fs::read(so).expect("build it first: yarn build:debug");
        svm.add_program(samrajya::id(), &bytes).unwrap();
        let admin = Keypair::new();
        svm.airdrop(&admin.pubkey(), 10 * SOL).unwrap();
        let game_id = 1u64;
        let game = Pubkey::find_program_address(&[GAME_SEED, &game_id.to_le_bytes()], &samrajya::id()).0;
        let vault = Pubkey::find_program_address(&[VAULT_SEED, game.as_ref()], &samrajya::id()).0;
        let mut env = Env { svm, admin, game, vault };
        let ix = Instruction::new_with_bytes(
            samrajya::id(),
            &instruction::InitGame { game_id, config: GameConfig::default_with(SOL / 20, EPOCH_SECS, SOL / 10) }.data(),
            accounts::InitGame { authority: env.admin.pubkey(), game, vault, system_program: system_program::ID }.to_account_metas(None),
        );
        env.send(&[ix], &[&env.admin.insecure_clone()]).unwrap();
        env
    }

    fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), String> {
        self.svm.expire_blockhash();
        let msg = Message::new_with_blockhash(ixs, Some(&signers[0].pubkey()), &self.svm.latest_blockhash());
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
    }

    fn game(&self) -> Game {
        let acc = self.svm.get_account(&self.game).unwrap();
        Game::try_deserialize(&mut &acc.data[..]).unwrap()
    }

    fn player_pda(&self, wallet: &Pubkey) -> Pubkey {
        Pubkey::find_program_address(&[PLAYER_SEED, self.game.as_ref(), wallet.as_ref()], &samrajya::id()).0
    }

    fn player(&self, wallet: &Pubkey) -> Player {
        let acc = self.svm.get_account(&self.player_pda(wallet)).unwrap();
        Player::try_deserialize(&mut &acc.data[..]).unwrap()
    }

    fn balance(&self, k: &Pubkey) -> u64 {
        self.svm.get_account(k).map(|a| a.lamports).unwrap_or(0)
    }

    fn warp(&mut self, secs: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp += secs;
        clock.slot += 1;
        self.svm.set_sysvar(&clock);
    }

    fn new_wallet(&mut self, sol: u64) -> Keypair {
        let k = Keypair::new();
        self.svm.airdrop(&k.pubkey(), sol).unwrap();
        k
    }

    fn join_and_enlist(&mut self, w: &Keypair, faction: u8, amount: u64) -> Result<(), String> {
        let player = self.player_pda(&w.pubkey());
        let join = Instruction::new_with_bytes(
            samrajya::id(),
            &instruction::Join { amount }.data(),
            accounts::Join { wallet: w.pubkey(), game: self.game, player, vault: self.vault, system_program: system_program::ID }
                .to_account_metas(None),
        );
        let enlist = self.action_ix(w, instruction::Enlist { faction }.data());
        self.send(&[join, enlist], &[w])
    }

    fn action_ix(&self, w: &Keypair, data: Vec<u8>) -> Instruction {
        Instruction::new_with_bytes(
            samrajya::id(),
            &data,
            accounts::PlayerAction { signer: w.pubkey(), game: self.game, player: self.player_pda(&w.pubkey()), session_token: None }
                .to_account_metas(None),
        )
    }

    fn act(&mut self, w: &Keypair, data: Vec<u8>) -> Result<(), String> {
        let ix = self.action_ix(w, data);
        self.send(&[ix], &[w])
    }

    fn admin_ix(&self, data: Vec<u8>) -> Instruction {
        Instruction::new_with_bytes(
            samrajya::id(),
            &data,
            accounts::AuthorityGame { authority: self.admin.pubkey(), game: self.game }.to_account_metas(None),
        )
    }

    fn withdraw(&mut self, w: &Keypair) -> Result<(), String> {
        let ix = Instruction::new_with_bytes(
            samrajya::id(),
            &instruction::Withdraw {}.data(),
            accounts::Withdraw {
                payer: w.pubkey(),
                game: self.game,
                player: self.player_pda(&w.pubkey()),
                wallet: w.pubkey(),
                vault: self.vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[w])
    }

    fn claim(&mut self, w: &Keypair) -> Result<(), String> {
        let ix = Instruction::new_with_bytes(
            samrajya::id(),
            &instruction::Claim {}.data(),
            accounts::Claim {
                payer: w.pubkey(),
                game: self.game,
                player: self.player_pda(&w.pubkey()),
                wallet: w.pubkey(),
                vault: self.vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[w])
    }
}

fn rand32(seed: &mut u64) -> [u8; 32] {
    let mut out = [0u8; 32];
    for c in out.chunks_mut(8) {
        *seed ^= *seed << 13;
        *seed ^= *seed >> 7;
        *seed ^= *seed << 17;
        c.copy_from_slice(&seed.to_le_bytes());
    }
    out
}

#[test]
fn full_war_on_base_layer() {
    let mut env = Env::new();
    let vault_rent = env.balance(&env.vault);

    // Two players per kingdom.
    let mut players: Vec<(Keypair, u8)> = Vec::new();
    for i in 0..12u8 {
        let w = env.new_wallet(5 * SOL);
        env.join_and_enlist(&w, i % N as u8, SOL).unwrap();
        players.push((w, i % N as u8));
    }
    assert_eq!(env.balance(&env.vault), vault_rent + 12 * SOL);
    let g = env.game();
    assert_eq!(g.factions[0].members, 2);
    assert_eq!(g.factions[0].treasury, 2 * SOL);

    // Stake below minimum is rejected.
    let poor = env.new_wallet(SOL);
    assert!(env.join_and_enlist(&poor, 0, SOL / 100).is_err());

    // Lobby: switching is free.
    let (w0, _) = &players[0];
    let w0 = w0.insecure_clone();
    env.act(&w0, instruction::SwitchKingdom { to: 1 }.data()).unwrap();
    players[0].1 = 1;
    assert_eq!(env.game().factions[1].treasury, 3 * SOL);

    // Only the authority can start.
    let ix = Instruction::new_with_bytes(
        samrajya::id(),
        &instruction::StartGame {}.data(),
        accounts::AuthorityGame { authority: w0.pubkey(), game: env.game }.to_account_metas(None),
    );
    assert!(env.send(&[ix], &[&w0]).is_err());
    let ix = env.admin_ix(instruction::StartGame {}.data());
    env.send(&[ix], &[&env.admin.insecure_clone()]).unwrap();
    assert_eq!(env.game().phase, Phase::Active);

    // Resolving before the bell fails.
    let ix = env.admin_ix(instruction::ResolveEpochDebug { randomness: [7u8; 32] }.data());
    assert!(env.send(&[ix], &[&env.admin.insecure_clone()]).is_err());

    // A peaceful epoch resolves without VRF and decays base defense.
    env.warp(EPOCH_SECS);
    let base_before = env.game().base_defense;
    // (`resolve_epoch` needs the VRF program, which LiteSVM doesn't have; with no battles
    // the debug path runs the same `math::resolve_epoch` → `advance_epoch`.)
    let ix = env.admin_ix(instruction::ResolveEpochDebug { randomness: [1u8; 32] }.data());
    env.send(&[ix], &[&env.admin.insecure_clone()]).unwrap();
    let g = env.game();
    assert_eq!(g.epoch, 2);
    assert!(g.base_defense < base_before);

    // Mid-war leave: 20% stays in the kingdom, 80% withdrawable.
    let (leaver, lf) = (players[1].0.insecure_clone(), players[1].1);
    let t_before = env.game().factions[lf as usize].treasury;
    env.act(&leaver, instruction::Leave {}.data()).unwrap();
    let owed = env.player(&leaver.pubkey()).pending_withdrawal;
    assert_eq!(owed, SOL * 8 / 10);
    assert_eq!(env.game().factions[lf as usize].treasury, t_before - owed);
    let bal = env.balance(&leaver.pubkey());
    env.withdraw(&leaver).unwrap();
    assert!(env.balance(&leaver.pubkey()) > bal + owed - 10_000);
    assert!(env.withdraw(&leaver).is_err()); // nothing left
    players.remove(1);

    // Mid-war switch: 40% fee.
    let (sw, sf) = (players[2].0.insecure_clone(), players[2].1);
    let to = (sf + 1) % N as u8;
    let before_to = env.game().factions[to as usize].treasury;
    env.act(&sw, instruction::SwitchKingdom { to }.data()).unwrap();
    assert_eq!(env.game().factions[to as usize].treasury, before_to + SOL * 6 / 10);
    players[2].1 = to;

    // War until one kingdom rules the globe. Everyone attacks a random neighbour each epoch.
    let mut seed = 0x5A3A_A1A2u64;
    let mut epochs = 0;
    while env.game().phase == Phase::Active {
        epochs += 1;
        assert!(epochs < 400, "war did not end");
        let g = env.game();
        for (w, _) in players.iter() {
            let p = env.player(&w.pubkey());
            if p.shares == 0 || p.generation != g.factions[p.faction as usize].generation {
                continue;
            }
            let fi = p.faction as usize;
            let owned: u8 = (0..N).filter(|&t| g.territory_owner[t] as usize == fi).fold(0, |m, t| m | 1 << t);
            let targets: Vec<u8> = (0..N as u8)
                .filter(|&t| g.territory_owner[t as usize] as usize != fi && g.config.adjacency[t as usize] & owned != 0)
                .collect();
            if targets.is_empty() {
                continue;
            }
            let r = rand32(&mut seed);
            let t = targets[r[0] as usize % targets.len()];
            let value = (p.shares * g.factions[fi].treasury as u128 / g.factions[fi].total_shares) as u64;
            let w = w.insecure_clone();
            env.act(&w, instruction::Allocate { target: t, amount: value * 3 / 4 }.data()).unwrap();
        }
        env.warp(EPOCH_SECS);
        let ix = env.admin_ix(instruction::ResolveEpochDebug { randomness: rand32(&mut seed) }.data());
        env.send(&[ix], &[&env.admin.insecure_clone()]).unwrap();
    }

    let g = env.game();
    let winner = g.winner;
    assert!(g.territory_owner.iter().all(|&o| o == winner));
    assert_eq!(g.factions.iter().filter(|f| f.alive).count(), 1);
    assert!(g.battle_count > 0);
    println!("war ended after {epochs} epochs, winner kingdom {winner}, battles {}", g.battle_count);

    // Losers cannot claim; winners split the whole pot.
    let mut claimed = 0u64;
    for (w, _) in players.iter() {
        let p = env.player(&w.pubkey());
        let w = w.insecure_clone();
        let before = env.balance(&w.pubkey());
        if p.faction == winner && p.shares > 0 && p.generation == g.factions[winner as usize].generation {
            env.claim(&w).unwrap();
            claimed += env.balance(&w.pubkey()) + 10_000 - before; // add back tx fee (approx)
            assert!(env.claim(&w).is_err(), "double claim");
        } else {
            assert!(env.claim(&w).is_err(), "loser claimed");
        }
    }
    let left = env.balance(&env.vault) - vault_rent;
    println!("claimed ≈ {claimed}, left in vault {left}");
    assert!(left < 1_000, "vault should be drained to rent, left {left}");
    assert_eq!(env.game().factions[winner as usize].treasury, left);
}

#[test]
fn allocate_validation() {
    let mut env = Env::new();
    let a = env.new_wallet(5 * SOL);
    env.join_and_enlist(&a, 0, SOL).unwrap();
    // Not active yet.
    assert!(env.act(&a, instruction::Allocate { target: 1, amount: SOL / 2 }.data()).is_err());
    let ix = env.admin_ix(instruction::StartGame {}.data());
    env.send(&[ix], &[&env.admin.insecure_clone()]).unwrap();
    assert!(env.act(&a, instruction::Allocate { target: 0, amount: 1 }.data()).is_err()); // own
    assert!(env.act(&a, instruction::Allocate { target: 3, amount: 1 }.data()).is_err()); // not adjacent
    assert!(env.act(&a, instruction::Allocate { target: 1, amount: 2 * SOL }.data()).is_err()); // too much
    env.act(&a, instruction::Allocate { target: 1, amount: SOL / 2 }.data()).unwrap();
    env.act(&a, instruction::Allocate { target: DEFEND, amount: 0 }.data()).unwrap();
    assert_eq!(env.game().factions[0].attack_alloc[1], 0);

    // Someone else cannot act on my player account.
    let b = env.new_wallet(SOL);
    let ix = Instruction::new_with_bytes(
        samrajya::id(),
        &instruction::Leave {}.data(),
        accounts::PlayerAction { signer: b.pubkey(), game: env.game, player: env.player_pda(&a.pubkey()), session_token: None }
            .to_account_metas(None),
    );
    assert!(env.send(&[ix], &[&b]).is_err());
}


#[test]
fn release_binary_rejects_debug_resolver() {
    let mut env = Env::with_binary("samrajya.so");
    let ix = env.admin_ix(instruction::StartGame {}.data());
    env.send(&[ix], &[&env.admin.insecure_clone()]).unwrap();
    env.warp(EPOCH_SECS);
    let ix = env.admin_ix(instruction::ResolveEpochDebug { randomness: [1u8; 32] }.data());
    assert!(env.send(&[ix], &[&env.admin.insecure_clone()]).is_err());
}
