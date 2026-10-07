//! Pure game rules. Every instruction handler calls into here, so the whole game can be
//! unit-tested and simulated without a validator. Keep `app/lib/game/math.ts` in sync.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SamrajyaError;
use crate::state::*;

// ---------------------------------------------------------------- shares

pub fn value_of(f: &Faction, shares: u128, generation: u32) -> u64 {
    if generation != f.generation || f.total_shares == 0 || shares == 0 {
        return 0;
    }
    (shares * f.treasury as u128 / f.total_shares) as u64
}

/// Adds `lamports` to the treasury and returns the shares minted for them.
pub fn mint_shares(f: &mut Faction, lamports: u64) -> u128 {
    if f.treasury == 0 || f.total_shares == 0 {
        // Empty (or drained) kingdom: start a fresh share generation so stale shares
        // cannot claim part of the new deposit.
        if f.total_shares != 0 {
            f.generation += 1;
            f.members = 0;
        }
        f.total_shares = 0;
        let minted = lamports as u128 * INITIAL_SHARES_PER_LAMPORT;
        f.total_shares = minted;
        f.treasury += lamports;
        return minted;
    }
    let minted = lamports as u128 * f.total_shares / f.treasury as u128;
    f.total_shares += minted;
    f.treasury += lamports;
    minted
}

/// Burns `shares` and returns the lamports paid out. The fee stays in the treasury,
/// raising the share price for everyone who stays.
pub fn burn_with_fee(f: &mut Faction, shares: u128, generation: u32, fee_bps: u16) -> u64 {
    let value = value_of(f, shares, generation);
    if generation != f.generation {
        return 0; // stale shares: nothing to burn from the live totals
    }
    let out = value - value * fee_bps as u64 / BPS;
    f.total_shares = f.total_shares.saturating_sub(shares);
    f.treasury -= out;
    out
}

// ---------------------------------------------------------------- player actions

pub fn owned_mask(game: &Game, f: usize) -> u8 {
    let mut m = 0u8;
    for t in 0..N {
        if game.territory_owner[t] as usize == f {
            m |= 1 << t;
        }
    }
    m
}

/// Removes the player's current-epoch attack allocation from the kingdom aggregate.
pub fn clear_alloc(game: &mut Game, p: &mut Player) {
    if p.alloc_epoch == game.epoch && p.alloc_target != DEFEND && p.generation == game.factions[p.faction as usize].generation {
        let fa = &mut game.factions[p.faction as usize];
        let t = p.alloc_target as usize;
        fa.attack_alloc[t] = fa.attack_alloc[t].saturating_sub(p.alloc_amount);
    }
    p.alloc_target = DEFEND;
    p.alloc_amount = 0;
    p.alloc_epoch = game.epoch;
}

pub fn enlist(game: &mut Game, p: &mut Player, faction: u8) -> Result<()> {
    require!(game.phase != Phase::Ended, SamrajyaError::WrongPhase);
    require!(!game.pending_vrf, SamrajyaError::BattlePending);
    require!((faction as usize) < N, SamrajyaError::InvalidFaction);
    require!(p.pending_deposit > 0, SamrajyaError::NothingToEnlist);
    let fi = faction as usize;
    let already_here = p.shares > 0 && p.faction == faction && p.generation == game.factions[fi].generation;
    require!(p.shares == 0 || already_here, SamrajyaError::AlreadyEnlisted);
    require!(game.factions[fi].alive, SamrajyaError::FactionEliminated);

    let amount = p.pending_deposit;
    let fa = &mut game.factions[fi];
    let gen_before = fa.generation;
    let minted = mint_shares(fa, amount);
    if !already_here || fa.generation != gen_before {
        fa.members += 1;
        p.shares = 0;
        p.alloc_target = DEFEND;
        p.alloc_amount = 0;
    }
    p.faction = faction;
    p.generation = fa.generation;
    p.shares += minted;
    p.pending_deposit = 0;
    Ok(())
}

pub fn allocate(game: &mut Game, p: &mut Player, target: u8, amount: u64) -> Result<()> {
    require!(game.phase == Phase::Active, SamrajyaError::WrongPhase);
    require!(!game.pending_vrf, SamrajyaError::BattlePending);
    let fi = p.faction as usize;
    require!(p.shares > 0 && p.generation == game.factions[fi].generation, SamrajyaError::NotEnlisted);
    require!(game.factions[fi].alive, SamrajyaError::FactionEliminated);

    clear_alloc(game, p);
    if target == DEFEND || amount == 0 {
        return Ok(());
    }
    let t = target as usize;
    require!(t < N, SamrajyaError::InvalidTerritory);
    require!(game.territory_owner[t] as usize != fi, SamrajyaError::OwnTerritory);
    let fa = game.factions[fi];
    let reach = fa.powers & POWER_VIDYA_REACH != 0;
    require!(reach || game.config.adjacency[t] & owned_mask(game, fi) != 0, SamrajyaError::NotAdjacent);
    require!(amount <= value_of(&fa, p.shares, p.generation), SamrajyaError::AmountTooLarge);

    game.factions[fi].attack_alloc[t] += amount;
    p.alloc_target = target;
    p.alloc_amount = amount;
    p.alloc_epoch = game.epoch;
    Ok(())
}

/// Returns the lamports the player will receive (fee already deducted).
pub fn leave(game: &mut Game, p: &mut Player) -> Result<u64> {
    require!(!game.pending_vrf, SamrajyaError::BattlePending);
    require!(p.shares > 0, SamrajyaError::NotEnlisted);
    let fi = p.faction as usize;
    clear_alloc(game, p);
    let live = p.generation == game.factions[fi].generation;
    // Leaving is free before the war starts (Lobby) and after it ends.
    let fee = if game.phase == Phase::Active { game.config.leave_fee_bps } else { 0 };
    let out = burn_with_fee(&mut game.factions[fi], p.shares, p.generation, fee);
    if live {
        game.factions[fi].members = game.factions[fi].members.saturating_sub(1);
    }
    p.shares = 0;
    p.pending_withdrawal += out;
    Ok(out)
}

/// Returns the lamports that arrived in the new kingdom.
pub fn switch(game: &mut Game, p: &mut Player, to: u8) -> Result<u64> {
    require!(game.phase != Phase::Ended, SamrajyaError::WrongPhase);
    require!(!game.pending_vrf, SamrajyaError::BattlePending);
    require!((to as usize) < N, SamrajyaError::InvalidFaction);
    require!(to != p.faction, SamrajyaError::SameFaction);
    require!(game.factions[to as usize].alive, SamrajyaError::FactionEliminated);
    let fi = p.faction as usize;
    require!(p.shares > 0 && p.generation == game.factions[fi].generation, SamrajyaError::NotEnlisted);

    clear_alloc(game, p);
    let fee = if game.phase == Phase::Active { game.config.switch_fee_bps } else { 0 };
    let moved = burn_with_fee(&mut game.factions[fi], p.shares, p.generation, fee);
    game.factions[fi].members = game.factions[fi].members.saturating_sub(1);

    let dest = &mut game.factions[to as usize];
    let minted = mint_shares(dest, moved);
    dest.members += 1;
    p.faction = to;
    p.generation = dest.generation;
    p.shares = minted;
    Ok(moved)
}

pub fn claim(game: &mut Game, p: &mut Player) -> Result<u64> {
    require!(game.phase == Phase::Ended, SamrajyaError::WrongPhase);
    require!(!p.claimed, SamrajyaError::AlreadyClaimed);
    let w = game.winner as usize;
    require!(p.faction as usize == w && p.shares > 0, SamrajyaError::NotWinner);
    let out = burn_with_fee(&mut game.factions[w], p.shares, p.generation, 0);
    require!(out > 0, SamrajyaError::NotWinner);
    p.shares = 0;
    p.claimed = true;
    Ok(out)
}

// ---------------------------------------------------------------- battles

fn bps(x: u64, bps: u64) -> u64 {
    (x as u128 * bps as u128 / BPS as u128) as u64
}

fn splitmix64(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// One independent roll per territory derived from the 32-byte VRF output.
pub fn sub_roll(randomness: &[u8; 32], territory: usize) -> u64 {
    let mut seed = 0u64;
    for chunk in randomness.chunks(8) {
        seed = splitmix64(seed ^ u64::from_le_bytes(chunk.try_into().unwrap()));
    }
    splitmix64(seed ^ ((territory as u64 + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15)))
}

pub fn has_battles(game: &Game) -> bool {
    (0..N).any(|t| contested(game, t))
}

fn contested(game: &Game, t: usize) -> bool {
    let owner = game.territory_owner[t] as usize;
    (0..N).any(|f| f != owner && game.factions[f].alive && game.factions[f].attack_alloc[t] > 0)
}

/// Each kingdom's attack allocations, scaled down if they exceed its treasury.
fn effective_allocs(game: &Game) -> [[u64; N]; N] {
    let mut eff = [[0u64; N]; N];
    for f in 0..N {
        let fa = &game.factions[f];
        let sum: u128 = fa.attack_alloc.iter().map(|&a| a as u128).sum();
        for t in 0..N {
            eff[f][t] = if sum > fa.treasury as u128 {
                (fa.attack_alloc[t] as u128 * fa.treasury as u128 / sum) as u64
            } else {
                fa.attack_alloc[t]
            };
        }
    }
    eff
}

pub fn attack_power(fa: &Faction, committed: u64) -> u64 {
    let mut p = committed;
    if fa.powers & POWER_GAJA_SENA != 0 {
        p = bps(p, 12_000);
    }
    if fa.powers & POWER_RATRI_RAID != 0 && !fa.ambush_used {
        p = bps(p, 15_000);
    }
    p
}

pub fn defense_power(fa: &Faction, committed_to_attacks: u64, base_defense: u64) -> u64 {
    let free = fa.treasury.saturating_sub(committed_to_attacks);
    let mut d = if fa.territories == 0 { 0 } else { free / fa.territories as u64 };
    if fa.powers & POWER_KURU_FORTRESS != 0 {
        d = bps(d, 13_000);
    }
    d + base_defense
}

fn move_treasury(game: &mut Game, from: usize, to: usize, amount: u64) -> u64 {
    let amount = amount.min(game.factions[from].treasury);
    game.factions[from].treasury -= amount;
    game.factions[to].treasury += amount;
    amount
}

/// Resolves one territory. Returns the log entry.
pub fn resolve_battle(game: &mut Game, eff: &[[u64; N]; N], t: usize, rnd: u64) -> Option<BattleEntry> {
    let d = game.territory_owner[t] as usize;
    let mut attack = [0u64; N];
    let mut mask = 0u8;
    for f in 0..N {
        if f != d && game.factions[f].alive && eff[f][t] > 0 {
            attack[f] = attack_power(&game.factions[f], eff[f][t]);
            if attack[f] > 0 {
                mask |= 1 << f;
            }
        }
    }
    if mask == 0 {
        return None;
    }
    let committed_by_d: u64 = eff[d].iter().sum();
    let defense = defense_power(&game.factions[d], committed_by_d, game.base_defense);
    let total = defense + attack.iter().sum::<u64>();
    let roll = rnd % total;

    let mut winner = d;
    if roll >= defense {
        let mut acc = defense;
        for f in 0..N {
            acc += attack[f];
            if roll < acc {
                winner = f;
                break;
            }
        }
    }

    // Losing attackers pay k_loss of what they committed to the battle's winner.
    let mut spoils = 0u64;
    for f in 0..N {
        if mask & (1 << f) != 0 && f != winner {
            let mut loss_bps = game.config.k_loss_bps as u64;
            if game.factions[f].powers & POWER_ANNAPURNA_HARVEST != 0 {
                loss_bps /= 2;
            }
            spoils += move_treasury(game, f, winner, bps(eff[f][t], loss_bps));
        }
    }

    let mut eliminated = false;
    if winner != d {
        let loser = game.factions[d];
        let loot = if loser.territories <= 1 {
            loser.treasury
        } else {
            let mut l = loser.treasury / loser.territories as u64;
            if game.factions[winner].powers & POWER_SAMUDRA_VYAPAR != 0 {
                l = bps(l, 12_500);
            }
            l
        };
        spoils += move_treasury(game, d, winner, loot);
        game.territory_owner[t] = winner as u8;
        game.factions[d].territories -= 1;
        game.factions[winner].territories += 1;
        if game.factions[d].territories == 0 {
            eliminated = true;
            let dead = &mut game.factions[d];
            let powers = dead.powers;
            let rest = dead.treasury;
            dead.alive = false;
            dead.generation += 1;
            dead.total_shares = 0;
            dead.members = 0;
            dead.attack_alloc = [0; N];
            game.factions[winner].powers |= powers;
            spoils += move_treasury(game, d, winner, rest);
        }
    }

    Some(BattleEntry {
        epoch: game.epoch,
        territory: t as u8,
        defender: d as u8,
        winner: winner as u8,
        attackers_mask: mask,
        defense,
        total,
        roll,
        spoils,
        eliminated,
    })
}

fn push_log(game: &mut Game, e: BattleEntry) {
    let i = game.battle_count as usize % BATTLE_LOG_LEN;
    game.battle_log[i] = e;
    game.battle_count += 1;
}

/// Resolves every contested territory, then advances the epoch.
pub fn resolve_epoch(game: &mut Game, randomness: &[u8; 32], now: i64) {
    let eff = effective_allocs(game);
    let mut attacked = [false; N];
    for t in 0..N {
        let rnd = sub_roll(randomness, t);
        if let Some(entry) = resolve_battle(game, &eff, t, rnd) {
            for f in 0..N {
                if entry.attackers_mask & (1 << f) != 0 {
                    attacked[f] = true;
                }
            }
            push_log(game, entry);
        }
    }
    for f in 0..N {
        if attacked[f] && game.factions[f].powers & POWER_RATRI_RAID != 0 {
            game.factions[f].ambush_used = true;
        }
        game.factions[f].attack_alloc = [0; N];
    }
    advance_epoch(game, now);
}

pub fn advance_epoch(game: &mut Game, now: i64) {
    game.epoch += 1;
    game.base_defense = game.base_defense - bps(game.base_defense, game.config.storm_decay_bps as u64);
    game.epoch_ends_at = now + game.config.epoch_secs;
    game.pending_vrf = false;
    let first = game.territory_owner[0];
    if game.territory_owner.iter().all(|&o| o == first) {
        game.phase = Phase::Ended;
        game.winner = first;
    }
}

pub fn new_factions() -> [Faction; N] {
    let mut fs = [Faction::default(); N];
    for (i, f) in fs.iter_mut().enumerate() {
        f.territories = 1;
        f.powers = 1 << i;
        f.alive = true;
    }
    fs
}

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;

    const SOL: u64 = 1_000_000_000;

    fn game() -> Game {
        Game {
            authority: Pubkey::default(),
            game_id: 1,
            bump: 0,
            vault_bump: 0,
            phase: Phase::Active,
            epoch: 1,
            epoch_ends_at: 0,
            pending_vrf: false,
            vrf_requested_at: 0,
            config: GameConfig::default_with(SOL / 20, 60, SOL / 10),
            base_defense: SOL / 10,
            territory_owner: [0, 1, 2, 3, 4, 5],
            factions: new_factions(),
            winner: 0,
            battle_log: [BattleEntry::default(); BATTLE_LOG_LEN],
            battle_count: 0,
        }
    }

    fn player() -> Player {
        Player {
            wallet: Pubkey::new_unique(),
            game: Pubkey::default(),
            bump: 0,
            faction: 0,
            generation: 0,
            shares: 0,
            pending_deposit: 0,
            pending_withdrawal: 0,
            deposited_total: 0,
            alloc_target: DEFEND,
            alloc_amount: 0,
            alloc_epoch: 0,
            claimed: false,
        }
    }

    fn join(g: &mut Game, f: u8, lamports: u64) -> Player {
        let mut p = player();
        p.pending_deposit = lamports;
        p.deposited_total = lamports;
        enlist(g, &mut p, f).unwrap();
        p
    }

    fn treasury_sum(g: &Game) -> u64 {
        g.factions.iter().map(|f| f.treasury).sum()
    }

    /// Shared vector with app/lib/game/math.test.ts — the UI must derive the same rolls.
    #[test]
    fn sub_roll_matches_typescript() {
        let mut r = [0u8; 32];
        for (i, b) in r.iter_mut().enumerate() {
            *b = i as u8 + 1;
        }
        let got: Vec<u64> = (0..N).map(|t| sub_roll(&r, t)).collect();
        assert_eq!(
            got,
            vec![2783288195278980683, 3545563980559904583, 4689555029660771741, 15053824720183481231, 9565555852255760974, 11935353444744740481]
        );
    }

    #[test]
    fn shares_are_fair_for_late_joiners() {
        let mut g = game();
        let a = join(&mut g, 0, SOL);
        g.factions[0].treasury += SOL; // kingdom doubled via conquest
        let b = join(&mut g, 0, SOL);
        assert_eq!(value_of(&g.factions[0], a.shares, a.generation), 2 * SOL);
        assert_eq!(value_of(&g.factions[0], b.shares, b.generation), SOL);
    }

    #[test]
    fn leave_pays_80_percent_and_fee_stays() {
        let mut g = game();
        let mut a = join(&mut g, 0, SOL);
        let b = join(&mut g, 0, SOL);
        let out = leave(&mut g, &mut a).unwrap();
        assert_eq!(out, SOL * 8 / 10);
        assert_eq!(a.pending_withdrawal, out);
        assert_eq!(g.factions[0].treasury, SOL + SOL / 5);
        assert_eq!(value_of(&g.factions[0], b.shares, b.generation), SOL + SOL / 5);
        assert_eq!(g.factions[0].members, 1);
    }

    #[test]
    fn switch_moves_60_percent() {
        let mut g = game();
        let mut a = join(&mut g, 0, SOL);
        let moved = switch(&mut g, &mut a, 1).unwrap();
        assert_eq!(moved, SOL * 6 / 10);
        assert_eq!(g.factions[0].treasury, SOL * 4 / 10);
        assert_eq!(g.factions[1].treasury, SOL * 6 / 10);
        assert_eq!(value_of(&g.factions[1], a.shares, a.generation), SOL * 6 / 10);
        assert_eq!(a.faction, 1);
    }

    #[test]
    fn allocate_rules() {
        let mut g = game();
        let mut a = join(&mut g, 0, SOL);
        assert!(allocate(&mut g, &mut a, 3, SOL / 2).is_err()); // 0 is not adjacent to 3
        assert!(allocate(&mut g, &mut a, 0, SOL / 2).is_err()); // own territory
        assert!(allocate(&mut g, &mut a, 1, 2 * SOL).is_err()); // too much
        allocate(&mut g, &mut a, 1, SOL / 2).unwrap();
        assert_eq!(g.factions[0].attack_alloc[1], SOL / 2);
        allocate(&mut g, &mut a, 2, SOL / 4).unwrap(); // re-target replaces
        assert_eq!(g.factions[0].attack_alloc[1], 0);
        assert_eq!(g.factions[0].attack_alloc[2], SOL / 4);
        g.pending_vrf = true;
        assert!(allocate(&mut g, &mut a, 1, 1).is_err());
        assert!(leave(&mut g, &mut a).is_err());
    }

    #[test]
    fn conquest_moves_territory_treasury_and_powers() {
        let mut g = game();
        let mut a = join(&mut g, 0, 10 * SOL);
        let b = join(&mut g, 1, SOL);
        allocate(&mut g, &mut a, 1, 10 * SOL).unwrap();
        let eff = effective_allocs(&g);
        let defense = defense_power(&g.factions[1], 0, g.base_defense);
        assert_eq!(defense, SOL + SOL / 10);
        // roll == defense lands in the first attacker bucket
        let e = resolve_battle(&mut g, &eff, 1, defense).unwrap();
        assert_eq!(e.winner, 0);
        assert!(e.eliminated);
        assert_eq!(e.total, defense + 10 * SOL); // Hastinapur has no attack multiplier
        assert_eq!(g.territory_owner[1], 0);
        assert!(!g.factions[1].alive);
        assert_eq!(g.factions[0].territories, 2);
        assert_ne!(g.factions[0].powers & POWER_GAJA_SENA, 0);
        assert_eq!(value_of(&g.factions[1], b.shares, b.generation), 0);
        assert_eq!(g.factions[0].treasury, 11 * SOL);
        assert_eq!(treasury_sum(&g), 11 * SOL);
    }

    #[test]
    fn defender_wins_and_takes_k_loss() {
        let mut g = game();
        let mut a = join(&mut g, 0, 10 * SOL);
        join(&mut g, 1, SOL);
        allocate(&mut g, &mut a, 1, 5 * SOL).unwrap();
        let eff = effective_allocs(&g);
        let e = resolve_battle(&mut g, &eff, 1, 0).unwrap(); // roll 0 -> defender
        assert_eq!(e.winner, 1);
        assert_eq!(e.spoils, SOL); // 20% of 5 SOL
        assert_eq!(g.factions[0].treasury, 9 * SOL);
        assert_eq!(g.factions[1].treasury, 2 * SOL);
        assert_eq!(g.territory_owner[1], 1);
    }

    #[test]
    fn lobby_leave_and_switch_are_free() {
        let mut g = game();
        g.phase = Phase::Lobby;
        let mut a = join(&mut g, 0, SOL);
        assert_eq!(switch(&mut g, &mut a, 1).unwrap(), SOL);
        assert_eq!(leave(&mut g, &mut a).unwrap(), SOL);
    }

    #[test]
    fn eliminated_member_gets_nothing_and_can_rejoin() {
        let mut g = game();
        let mut b = join(&mut g, 1, SOL);
        g.factions[1].generation += 1; // simulate wipe-out
        g.factions[1].alive = false;
        assert_eq!(leave(&mut g, &mut b).unwrap(), 0);
        b.pending_deposit = SOL;
        enlist(&mut g, &mut b, 2).unwrap();
        assert_eq!(value_of(&g.factions[2], b.shares, b.generation), SOL);
    }

    /// Plays many full games with random players, allocations, leaves and switches.
    /// Checks the game always ends with one ruler and that no lamport is created or lost.
    #[test]
    fn simulation_conserves_sol_and_ends() {
        for seed in 1..60u64 {
            let mut rng = seed;
            let mut next = || {
                rng = splitmix64(rng);
                rng
            };
            let mut g = game();
            let mut players: Vec<Player> = Vec::new();
            let mut deposited = 0u64;
            let mut paid_out = 0u64;
            for i in 0..18 {
                let amt = SOL / 20 + next() % (2 * SOL);
                players.push(join(&mut g, (i % N) as u8, amt));
                deposited += amt;
            }
            let mut epochs = 0;
            while g.phase == Phase::Active {
                epochs += 1;
                assert!(epochs < 5_000, "seed {seed}: game did not end");
                for p in players.iter_mut() {
                    let r = next() % 100;
                    if p.shares == 0 {
                        if r < 10 {
                            // eliminated or left: maybe re-join an alive kingdom
                            let alive: Vec<u8> = (0..N as u8).filter(|&f| g.factions[f as usize].alive).collect();
                            let f = alive[(next() % alive.len() as u64) as usize];
                            let amt = SOL / 20 + next() % SOL;
                            p.pending_deposit = amt;
                            deposited += amt;
                            enlist(&mut g, p, f).unwrap();
                        }
                        continue;
                    }
                    if p.generation != g.factions[p.faction as usize].generation {
                        leave(&mut g, p).unwrap();
                        continue;
                    }
                    if r < 3 {
                        leave(&mut g, p).unwrap();
                    } else if r < 5 {
                        let to = (next() % N as u64) as u8;
                        let _ = switch(&mut g, p, to);
                    } else if r < 80 {
                        let t = (next() % N as u64) as u8;
                        let v = value_of(&g.factions[p.faction as usize], p.shares, p.generation);
                        let _ = allocate(&mut g, p, t, v / 2 + 1);
                    }
                }
                let mut randomness = [0u8; 32];
                for c in randomness.chunks_mut(8) {
                    c.copy_from_slice(&next().to_le_bytes());
                }
                resolve_epoch(&mut g, &randomness, epochs);
            }
            // Winners claim; everyone else withdraws what they are owed.
            for p in players.iter_mut() {
                if p.faction == g.winner && p.shares > 0 && p.generation == g.factions[g.winner as usize].generation {
                    paid_out += claim(&mut g, p).unwrap();
                }
                paid_out += p.pending_withdrawal;
            }
            let dust = treasury_sum(&g);
            assert_eq!(g.factions.iter().filter(|f| f.alive).count(), 1, "seed {seed}");
            assert!(paid_out + dust == deposited, "seed {seed}: conservation {paid_out} + {dust} != {deposited}");
            if g.factions[g.winner as usize].total_shares > 0 {
                assert!(dust < 1_000, "seed {seed}: dust {dust}");
            }
        }
    }
}
