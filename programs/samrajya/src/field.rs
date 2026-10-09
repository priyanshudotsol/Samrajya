//! The battlefield on the ER (docs/ARCHITECTURE.md §10, §10.8): warriors, blows and the fort
//! verdict that decides a walled realm at the bell. Integer mirror of `app/lib/game/units.ts`
//! and `app/lib/game/combat.ts` (coordinates ×100, facings as unit vectors ×100).

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SamrajyaError;
use crate::state::*;

/// Hex wall: apothem of the curtain wall (2.55 × cos 30°) and its thickness.
const APOTHEM: i32 = 221;
const WALL_THICK: i32 = 26;
const KEEP_RADIUS: i32 = 95;
const GATE_HALF: i32 = 31;
/// Nobody walks past this radius (CAMP_RADIUS 5.9 + 0.6).
const EDGE_RADIUS: i32 = 650;
/// Generous speed cap for one `move_unit` (run speed 2.9/s, plus latency slack), per second.
const MAX_SPEED: i32 = 420;
/// Mid-edge normals of the hexagon ×1000 (30° + k·60°); edge 1 (+z) holds the gate.
const NORMALS: [(i32, i32); 6] = [(866, 500), (0, 1000), (-866, 500), (-866, -500), (0, -1000), (866, -500)];
/// 12 spawn directions ×100.
const DIRS: [(i32, i32); 12] = [
    (100, 0), (87, 50), (50, 87), (0, 100), (-50, 87), (-87, 50),
    (-100, 0), (-87, -50), (-50, -87), (0, -100), (50, -87), (87, -50),
];

/// A weapon (indexed by gear), same numbers as `WEAPONS` in combat.ts.
struct Weapon {
    range: i32,
    damage: i32,
    /// cos(half-arc) ×1000 (ranged weapons ignore it).
    cos_arc: i32,
    cleave: usize,
    ranged: bool,
    /// Damage taken while blocking, ×100.
    block_taken: i32,
    /// Strikes allowed per second (cooldown < 1 s → 2).
    per_sec: u8,
}

const WEAPONS: [Weapon; 6] = [
    Weapon { range: 62, damage: 16, cos_arc: 342, cleave: 2, ranged: false, block_taken: 50, per_sec: 2 },
    Weapon { range: 95, damage: 14, cos_arc: 883, cleave: 1, ranged: false, block_taken: 55, per_sec: 2 },
    Weapon { range: 420, damage: 10, cos_arc: 0, cleave: 1, ranged: true, block_taken: 65, per_sec: 1 },
    Weapon { range: 50, damage: 7, cos_arc: 500, cleave: 1, ranged: false, block_taken: 15, per_sec: 2 },
    Weapon { range: 60, damage: 8, cos_arc: 500, cleave: 1, ranged: false, block_taken: 60, per_sec: 2 },
    Weapon { range: 95, damage: 24, cos_arc: 259, cleave: 4, ranged: false, block_taken: 40, per_sec: 1 },
];
const ARROW_WIDTH: i32 = 28;
/// cos 80° ×1000: blocking / facing-the-gate tolerance.
const COS_80: i32 = 174;

/// Integer square root (Newton), no floating point on-chain.
fn isqrt(v: i64) -> i32 {
    if v <= 0 {
        return 0;
    }
    let mut x = v;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + v / x) / 2;
    }
    x as i32
}

fn dist(ax: i32, az: i32, bx: i32, bz: i32) -> i32 {
    let (dx, dz) = ((bx - ax) as i64, (bz - az) as i64);
    isqrt(dx * dx + dz * dz)
}

/// Signed distance from the hex wall line ×100: < 0 inside, > 0 outside.
pub fn hex_depth(x: i32, z: i32) -> i32 {
    NORMALS.iter().map(|&(nx, nz)| (x * nx + z * nz) / 1000).max().unwrap() - APOTHEM
}

fn in_gate(x: i32, z: i32) -> bool {
    x.abs() <= GATE_HALF + 5 && (z - APOTHEM).abs() <= WALL_THICK + 25
}

/// Keep or courtyard (inside the walls, not in the gate opening).
pub fn is_inside(x: i32, z: i32) -> bool {
    if dist(0, 0, x, z) < KEEP_RADIUS {
        return true;
    }
    !in_gate(x, z) && hex_depth(x, z) < -WALL_THICK / 2
}

/// At the gate or inside the walls: where an attacker must stand to take a cleared fort.
pub fn at_gate_or_inside(x: i32, z: i32) -> bool {
    in_gate(x, z) || is_inside(x, z)
}

fn crosses_wall(ax: i32, az: i32, bx: i32, bz: i32) -> bool {
    let (a, b) = (hex_depth(ax, az), hex_depth(bx, bz));
    let half = WALL_THICK / 2;
    if a.abs() <= half + 5 {
        return false; // on the wall walk: shoots over it
    }
    if !((a < -half && b > half) || (a > half && b < -half)) {
        return false;
    }
    // through the gate gap: the opening in the +z edge is not stone (blades meet in the gate)
    if az != bz {
        let (num, den) = ((APOTHEM - az) as i64, (bz - az) as i64);
        let inside_t = if den > 0 { num >= 0 && num <= den } else { num <= 0 && num >= den };
        if inside_t {
            let x = ax as i64 + (bx - ax) as i64 * num / den;
            if x.abs() <= GATE_HALF as i64 {
                return false;
            }
        }
    }
    true
}

fn hash(wallet: &Pubkey) -> u32 {
    let b = wallet.to_bytes();
    u32::from_le_bytes([b[0], b[1], b[2], b[3]])
}

/// The courtyard spot of a member (same idea as `spawnPoint` in units.ts).
fn spawn_point(wallet: &Pubkey) -> (i16, i16, i8, i8) {
    let h = hash(wallet);
    let (dx, dz) = DIRS[(h % 12) as usize];
    let r = 125 + ((h >> 8) % 60) as i32;
    // face along the ring
    ((dx * r / 100) as i16, (dz * r / 100) as i16, (-dz) as i8, dx as i8)
}

/// The assault camp outside an enemy gate (same idea as `campPoint`).
fn camp_point(wallet: &Pubkey) -> (i16, i16, i8, i8) {
    let h = hash(wallet);
    let x = (h % 240) as i32 - 120;
    let z = APOTHEM + 110 + ((h >> 10) % 90) as i32;
    (x as i16, z as i16, 0, -100)
}

/// The realm a member's warrior lives in: the capital if still held, else its first homeland.
pub fn home_of(game: &Game, faction: u8) -> u8 {
    if game.territory_owner[faction as usize] == faction {
        return faction;
    }
    (0..N).find(|&t| game.territory_owner[t] == faction).map(|t| t as u8).unwrap_or(NO_REALM)
}

/// Puts the warrior in realm `to`: its courtyard when the kingdom holds it, else the camp at its gate.
pub fn place(p: &mut Player, game: &Game, to: u8, now: i64) {
    let mine = to != NO_REALM && game.territory_owner[to as usize] == p.faction;
    let (x, z, fx, fz) = if mine { spawn_point(&p.wallet) } else { camp_point(&p.wallet) };
    let u = &mut p.unit;
    u.at = to;
    u.x = x;
    u.z = z;
    u.fx = fx;
    u.fz = fz;
    u.action = 0;
    u.moved_at = now;
}

/// A fresh warrior at home (enlist, switch).
pub fn spawn(p: &mut Player, game: &Game, now: i64) {
    let home = home_of(game, p.faction);
    p.unit = Unit { hp: 100, ..Unit::default() };
    place(p, game, home, now);
}

/// Is this member's warrior in the fight (enlisted in a kingdom that still stands, alive)?
pub fn fighting(p: &Player, game: &Game) -> bool {
    let f = p.faction as usize;
    p.shares > 0 && p.generation == game.factions[f].generation && game.factions[f].alive && p.unit.hp > 0 && p.unit.at != NO_REALM
}

/// Where the warrior may teleport: a realm its kingdom holds (adjacent, or anywhere with Vidya
/// Reach), or the realm its kingdom ordered it to attack this epoch.
fn may_teleport(p: &Player, game: &Game, to: u8) -> bool {
    if to as usize >= N {
        return false;
    }
    if p.alloc_epoch == game.epoch && p.alloc_target == to {
        return true;
    }
    game.territory_owner[to as usize] == p.faction
}

/// Fallen warriors rise at home once their time is up (never while the bell is being decided).
fn respawn_if_due(p: &mut Player, game: &Game, now: i64) {
    if p.unit.hp == 0 && p.unit.dead_until > 0 && now >= p.unit.dead_until && !game.pending_vrf {
        let home = home_of(game, p.faction);
        place(p, game, home, now);
        p.unit.hp = RESPAWN_HP;
        p.unit.dead_until = 0;
    }
}

/// `move_unit`: walk (validated step), change action / gear / role, or teleport (`at` changes).
#[allow(clippy::too_many_arguments)]
pub fn move_unit(p: &mut Player, game: &Game, at: u8, x: i16, z: i16, fx: i8, fz: i8, action: u8, gear: u8, role: u8, now: i64) -> Result<()> {
    require!(game.phase != Phase::Ended, SamrajyaError::WrongPhase);
    let f = p.faction as usize;
    require!(p.shares > 0 && p.generation == game.factions[f].generation && game.factions[f].alive, SamrajyaError::NotEnlisted);
    if p.unit.at == NO_REALM && p.unit.hp == 0 && p.unit.dead_until == 0 {
        spawn(p, game, now); // enlisted before warriors existed
    }
    respawn_if_due(p, game, now);
    require!(p.unit.hp > 0, SamrajyaError::Fallen);
    require!(gear < GEARS && role < 4 && action <= ACTION_CHARGE, SamrajyaError::InvalidUnit);
    if gear == GEAR_GAJA {
        require!(game.factions[f].powers & POWER_GAJA_SENA != 0, SamrajyaError::InvalidUnit);
    }
    p.unit.gear = gear;
    p.unit.role = role;
    // A squad whose assault is over (or a member whose realm fell) is pulled back home.
    let here = p.unit.at;
    if here != NO_REALM && game.territory_owner[here as usize] != p.faction && !(p.alloc_epoch == game.epoch && p.alloc_target == here) {
        let home = home_of(game, p.faction);
        place(p, game, home, now);
        return Ok(());
    }
    if at != p.unit.at {
        require!(may_teleport(p, game, at), SamrajyaError::InvalidUnit);
        place(p, game, at, now);
        return Ok(());
    }
    let (x, z) = (x as i32, z as i32);
    let r = dist(0, 0, x, z);
    let (x, z) = if r > EDGE_RADIUS { (x * EDGE_RADIUS / r, z * EDGE_RADIUS / r) } else { (x, z) };
    let elapsed = (now - p.unit.moved_at).clamp(0, 10) as i32;
    require!(dist(p.unit.x as i32, p.unit.z as i32, x, z) <= MAX_SPEED * (elapsed + 1), SamrajyaError::InvalidUnit);
    let u = &mut p.unit;
    u.x = x as i16;
    u.z = z as i16;
    u.fx = fx;
    u.fz = fz;
    let mut action = if action == ACTION_DEAD { 0 } else { action };
    // a roll opens a short untouchable window, once per DODGE_COOLDOWN_SECS
    if action == ACTION_DODGE && u.action != ACTION_DODGE {
        if now - u.dodge_at < DODGE_COOLDOWN_SECS {
            action = 1;
        } else {
            u.dodge_at = now;
        }
    }
    u.action = action;
    u.moved_at = now;
    Ok(())
}

/// Is the warrior inside its roll's untouchable window?
fn dodging(u: &Unit, now: i64) -> bool {
    u.action == ACTION_DODGE && now - u.dodge_at <= 1
}

/// One landed blow, for the program log.
pub struct Hit {
    pub index: usize,
    pub damage: u8,
    pub killed: bool,
}

/// `strike`: the attacker swings / shoots facing (fx, fz) from where it stands. `targets` are the
/// Players the client believes are in reach; the program re-checks everything. Returns the hits
/// (indexes into `targets`) and the gate damage dealt.
#[allow(clippy::too_many_arguments)]
pub fn strike(attacker: &mut Player, targets: &mut [Player], game: &mut Game, fx: i8, fz: i8, heavy: bool, now: i64) -> Result<(Vec<Hit>, u16)> {
    require!(game.phase == Phase::Active && !game.pending_vrf, SamrajyaError::WrongPhase);
    require!(fighting(attacker, game), SamrajyaError::Fallen);
    let a = attacker.unit;
    let w = &WEAPONS[a.gear.min(GEARS - 1) as usize];
    // rate limit: the weapon's strikes per wall-clock second; a heavy blow costs two (or the
    // whole second for slow weapons)
    let cost = if heavy { 2.min(w.per_sec) } else { 1 };
    if attacker.unit.strike_sec != now {
        attacker.unit.strike_sec = now;
        attacker.unit.strike_count = 0;
    }
    require!(attacker.unit.strike_count + cost <= w.per_sec, SamrajyaError::NotReady);
    attacker.unit.strike_count += cost;
    attacker.unit.fx = fx;
    attacker.unit.fz = fz;
    attacker.unit.action = ACTION_ATTACK;
    attacker.unit.strikes = attacker.unit.strikes.wrapping_add(1);

    let t = a.at as usize;
    let owner = game.territory_owner[t];
    let (ax, az, fx, fz) = (a.x as i32, a.z as i32, fx as i32, fz as i32);
    let flen = isqrt((fx * fx + fz * fz) as i64).max(1);
    let defending_home = attacker.faction == owner;
    let archer_bonus = w.ranged && defending_home && (is_inside(ax, az) || hex_depth(ax, az).abs() <= WALL_THICK);

    // the fort lock (§10.10): an enemy can only be inside the walls once the garrison is dead, so
    // an enemy inside who still finds a living defender to hit got there by cheating
    let intruder = !defending_home && t < N && is_inside(ax, az);
    let mut cands: Vec<(usize, i32)> = Vec::new();
    for (i, p) in targets.iter().enumerate() {
        if p.faction == attacker.faction || p.wallet == attacker.wallet || !fighting(p, game) || p.unit.at != a.at {
            continue;
        }
        require!(!(intruder && p.faction == owner), SamrajyaError::InvalidUnit);
        // a warrior mid-roll is untouchable
        if dodging(&p.unit, now) {
            continue;
        }
        let (dx, dz) = (p.unit.x as i32 - ax, p.unit.z as i32 - az);
        let d = isqrt((dx * dx + dz * dz) as i64);
        if w.ranged {
            let along = (dx * fx + dz * fz) / flen;
            let lateral = (dx * fz - dz * fx).abs() / flen;
            if along <= 10 || along > w.range || lateral > ARROW_WIDTH {
                continue;
            }
            // arrows arc over the walls: a garrison cannot hide from archers
            cands.push((i, along));
        } else {
            // a little slack for latency
            if d > w.range + 15 {
                continue;
            }
            if d > 12 && (dx * fx + dz * fz) * 1000 < w.cos_arc * d * flen {
                continue;
            }
            if crosses_wall(ax, az, p.unit.x as i32, p.unit.z as i32) {
                continue;
            }
            cands.push((i, d));
        }
    }
    cands.sort_by_key(|&(_, d)| d);
    let mut hits = Vec::new();
    for &(i, _) in cands.iter().take(w.cleave) {
        let tu = targets[i].unit;
        let mut dmg = w.damage * 100;
        if archer_bonus {
            dmg = dmg * 140 / 100;
        }
        if heavy {
            dmg = dmg * HEAVY_MULT_PCT / 100;
        }
        // blocking towards the attacker (a heavy blow breaks the guard)
        if tu.action == ACTION_BLOCK && !heavy {
            let (bx, bz) = (ax - tu.x as i32, az - tu.z as i32);
            let bd = isqrt((bx * bx + bz * bz) as i64).max(1);
            let tl = isqrt((tu.fx as i32 * tu.fx as i32 + tu.fz as i32 * tu.fz as i32) as i64).max(1);
            if (bx * tu.fx as i32 + bz * tu.fz as i32) * 1000 > COS_80 * bd * tl {
                dmg = dmg * WEAPONS[tu.gear.min(GEARS - 1) as usize].block_taken / 100;
            }
        }
        if targets[i].faction == owner && is_inside(tu.x as i32, tu.z as i32) {
            dmg = dmg * 85 / 100;
        }
        let damage = ((dmg + 50) / 100).max(1).min(255) as u8;
        let u = &mut targets[i].unit;
        u.hp = u.hp.saturating_sub(damage);
        let killed = u.hp == 0;
        if killed {
            u.action = ACTION_DEAD;
            // out of the fight until the bell (§10.8)
            u.dead_until = game.epoch_ends_at.max(now + RESPAWN_SECS);
        }
        hits.push(Hit { index: i, damage, killed });
    }

    // Gates are no longer battered (§10.10): only killing the garrison opens a fort.
    let gate = 0u16;
    Ok((hits, gate))
}

/// The fort verdict at the bell for every contested homeland, from every member's warrior: no
/// member of the owner left alive anywhere in the realm (§10.10) and a committed attacker at the
/// gate or inside → that kingdom takes it (the most warriors there); otherwise the owner holds.
/// Stored in `game.fight`.
pub fn decide_forts(game: &mut Game, players: &[Player]) {
    for t in 0..N {
        let owner = game.territory_owner[t];
        let mut defenders = 0u32;
        let mut attackers = [0u32; N];
        for p in players {
            if !fighting(p, game) || p.unit.at as usize != t {
                continue;
            }
            let (x, z) = (p.unit.x as i32, p.unit.z as i32);
            if p.faction == owner {
                defenders += 1;
            } else if game.factions[p.faction as usize].attack_alloc[t] > 0 && at_gate_or_inside(x, z) {
                attackers[p.faction as usize] += 1;
            }
        }
        let mut verdict = owner;
        if defenders == 0 {
            let mut best = 0u32;
            for f in 0..N {
                if attackers[f] > best {
                    best = attackers[f];
                    verdict = f as u8;
                }
            }
        }
        game.fight[t] = verdict;
    }
    game.fight[PLAINS] = game.territory_owner[PLAINS];
    game.fight_set = true;
}

/// `seize` (§10.11): `seizer` stands inside realm `t`'s walls with an order on it, and among
/// `players` (which must hold every member of the owner, checked) none stands alive in `t`.
pub fn check_abandoned(game: &Game, t: usize, seizer: &Player, players: &[Player], keys: &[Pubkey]) -> Result<()> {
    require!(t < N, SamrajyaError::InvalidTerritory);
    let owner = game.territory_owner[t];
    require!(fighting(seizer, game) && seizer.unit.at as usize == t, SamrajyaError::InvalidUnit);
    require!(is_inside(seizer.unit.x as i32, seizer.unit.z as i32), SamrajyaError::InvalidUnit);
    require!(seizer.alloc_epoch == game.epoch && seizer.alloc_target as usize == t, SamrajyaError::InvalidUnit);
    for i in 0..keys.len() {
        for j in i + 1..keys.len() {
            require_keys_neq!(keys[i], keys[j], SamrajyaError::IncompleteMuster);
        }
    }
    if (owner as usize) < N {
        let o = owner as usize;
        let mut members = 0u32;
        for p in players {
            if p.faction == owner && p.shares > 0 && p.generation == game.factions[o].generation {
                members += 1;
                require!(!(fighting(p, game) && p.unit.at as usize == t), SamrajyaError::FortHeld);
            }
        }
        require!(members == game.factions[o].members, SamrajyaError::IncompleteMuster);
    }
    Ok(())
}

/// Every enlisted member of a standing kingdom must be passed to the bell, so nobody can hide a
/// garrison: per kingdom, the members passed must equal `Faction.members`.
pub fn check_complete(game: &Game, players: &[Player], keys: &[Pubkey]) -> Result<()> {
    for i in 0..keys.len() {
        for j in i + 1..keys.len() {
            require_keys_neq!(keys[i], keys[j], SamrajyaError::IncompleteMuster);
        }
    }
    let mut count = [0u32; N];
    for p in players {
        let f = p.faction as usize;
        if p.shares > 0 && p.generation == game.factions[f].generation && game.factions[f].alive {
            count[f] += 1;
        }
    }
    for f in 0..N {
        if game.factions[f].alive {
            require!(count[f] == game.factions[f].members, SamrajyaError::IncompleteMuster);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math;

    fn game() -> Game {
        Game {
            authority: Pubkey::default(),
            game_id: 1,
            bump: 0,
            vault_bump: 0,
            phase: Phase::Active,
            epoch: 1,
            epoch_ends_at: 1_000,
            pending_vrf: false,
            vrf_requested_at: 0,
            config: GameConfig::default_with(100_000_000, 90, 100_000_000),
            base_defense: 100_000_000,
            plains_defense: 300_000_000,
            plains_pot: 0,
            territory_owner: math::new_territories(),
            factions: math::new_factions(),
            winner: 0,
            battle_log: [BattleEntry::default(); BATTLE_LOG_LEN],
            battle_count: 0,
            gates: [GATE_HP; N],
            fight: [0; T],
            fight_set: false,
        }
    }

    fn member(g: &mut Game, faction: u8) -> Player {
        let mut p = Player {
            wallet: Pubkey::new_unique(),
            game: Pubkey::default(),
            bump: 0,
            faction: 0,
            generation: 0,
            shares: 0,
            pending_deposit: 100_000_000,
            pending_withdrawal: 0,
            deposited_total: 100_000_000,
            alloc_target: DEFEND,
            alloc_amount: 0,
            alloc_epoch: 0,
            claimed: false,
            unit: Unit::default(),
        };
        math::enlist(g, &mut p, faction).unwrap();
        p
    }

    #[test]
    fn enlisting_spawns_in_the_courtyard_and_attacking_teleports_to_the_gate() {
        let mut g = game();
        let mut a = member(&mut g, 1);
        assert_eq!(a.unit.at, 1);
        assert_eq!(a.unit.hp, 100);
        assert!(is_inside(a.unit.x as i32, a.unit.z as i32));
        math::allocate(&mut g, &mut a, 0, 50_000_000).unwrap();
        assert_eq!(a.unit.at, 0);
        assert!(!is_inside(a.unit.x as i32, a.unit.z as i32)); // the camp outside Hastinapur's gate
        math::allocate(&mut g, &mut a, DEFEND, 0).unwrap();
        assert_eq!(a.unit.at, 1); // Defend brings it home
    }

    #[test]
    fn blows_land_only_in_reach_and_never_through_stone() {
        let mut g = game();
        let mut a = member(&mut g, 1);
        let d = member(&mut g, 0);
        math::allocate(&mut g, &mut a, 0, 50_000_000).unwrap();
        // face to face just outside the gate: a talwar cut lands (16)
        a.unit.x = 0;
        a.unit.z = 340;
        let mut t = d.clone();
        t.unit.at = 0;
        t.unit.x = 0;
        t.unit.z = 290;
        let mut targets = [t];
        let (hits, gate) = strike(&mut a, &mut targets, &mut g, 0, -100, false, 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(targets[0].unit.hp, 84);
        assert_eq!(gate, 0);
        // the weapon's rate limit: a third blow in the same second is refused
        strike(&mut a, &mut targets, &mut g, 0, -100, false, 10).unwrap();
        assert!(strike(&mut a, &mut targets, &mut g, 0, -100, false, 10).is_err());
        // out of reach: nothing
        targets[0].unit.z = 100;
        let (hits, _) = strike(&mut a, &mut targets, &mut g, 0, -100, false, 11).unwrap();
        assert!(hits.is_empty());
        // a defender inside the walls cannot be cut from the field through the wall
        a.unit.x = 120;
        a.unit.z = 260;
        targets[0].unit.x = 120;
        targets[0].unit.z = 170;
        let (hits, _) = strike(&mut a, &mut targets, &mut g, 0, -100, false, 12).unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn a_dead_garrison_lets_the_squad_take_the_fort_and_a_living_one_holds_it() {
        let mut g = game();
        let mut a = member(&mut g, 1);
        let mut d = member(&mut g, 0);
        math::allocate(&mut g, &mut a, 0, 50_000_000).unwrap();
        // the squad stands in the gate opening, the garrison in the courtyard: it holds
        a.unit.x = 0;
        a.unit.z = APOTHEM as i16;
        decide_forts(&mut g, &[a.clone(), d.clone()]);
        assert_eq!(g.fight[0], 0);
        // cut the garrison down: the fort falls to Magadh at the bell, without a roll
        d.unit.hp = 0;
        decide_forts(&mut g, &[a.clone(), d.clone()]);
        assert_eq!(g.fight[0], 1);
        math::resolve_epoch(&mut g, &[7u8; 32], 2_000);
        let e = g.battle_log[0];
        assert!(e.by_fight);
        assert_eq!(e.roll, 0);
        assert_eq!(e.winner, 1);
        assert_eq!(g.territory_owner[0], 1);
        assert_eq!(g.gates, [GATE_HP; N]);
    }

    #[test]
    fn rolls_dodge_heavy_blows_break_guards_and_arrows_arc_over_walls() {
        let mut g = game();
        let mut a = member(&mut g, 1);
        let d = member(&mut g, 0);
        math::allocate(&mut g, &mut a, 0, 50_000_000).unwrap();
        a.unit.x = 0;
        a.unit.z = 340;
        let mut t = d.clone();
        t.unit.at = 0;
        t.unit.x = 0;
        t.unit.z = 290;
        // a roll: untouchable that second, and only once per cooldown
        let mut roller = t.clone();
        move_unit(&mut roller, &g, 0, 0, 290, 0, 100, ACTION_DODGE, 0, 0, 20).unwrap();
        assert_eq!(roller.unit.action, ACTION_DODGE);
        let mut targets = [roller.clone()];
        let (hits, _) = strike(&mut a, &mut targets, &mut g, 0, -100, false, 20).unwrap();
        assert!(hits.is_empty());
        move_unit(&mut roller, &g, 0, 0, 290, 0, 100, 0, 0, 0, 21).unwrap();
        move_unit(&mut roller, &g, 0, 0, 290, 0, 100, ACTION_DODGE, 0, 0, 21).unwrap();
        assert_ne!(roller.unit.action, ACTION_DODGE); // too soon: just a step
        // a raised guard takes half a light blow, all of a heavy one (×1.8)
        let mut guard = t.clone();
        guard.unit.action = ACTION_BLOCK;
        guard.unit.fx = 0;
        guard.unit.fz = 100; // facing the attacker (+z)
        let mut targets = [guard.clone()];
        strike(&mut a, &mut targets, &mut g, 0, -100, false, 30).unwrap();
        assert_eq!(targets[0].unit.hp, 92);
        let mut targets = [guard.clone()];
        strike(&mut a, &mut targets, &mut g, 0, -100, true, 31).unwrap();
        assert_eq!(targets[0].unit.hp, 100 - 29);
        // a heavy blow costs the second's two strikes
        assert!(strike(&mut a, &mut targets, &mut g, 0, -100, false, 31).is_err());
        // an archer in the field hits a defender in the courtyard, over the wall
        let mut archer = a.clone();
        archer.unit.gear = 2;
        archer.unit.x = 0;
        archer.unit.z = 360;
        let mut inside = t.clone();
        inside.unit.x = 0;
        inside.unit.z = 120;
        let mut targets = [inside];
        let (hits, _) = strike(&mut archer, &mut targets, &mut g, 0, -100, false, 40).unwrap();
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn the_fort_holds_while_any_defender_lives_and_intruders_cannot_strike_them() {
        let mut g = game();
        let mut a = member(&mut g, 1);
        let mut d = member(&mut g, 0);
        math::allocate(&mut g, &mut a, 0, 50_000_000).unwrap();
        a.unit.x = 0;
        a.unit.z = APOTHEM as i16;
        // the last defender stands outside the walls: the fort is still held
        d.unit.x = 300;
        d.unit.z = -300;
        decide_forts(&mut g, &[a.clone(), d.clone()]);
        assert_eq!(g.fight[0], 0);
        // an attacker who got inside while a defender lives cannot strike them
        a.unit.x = 0;
        a.unit.z = 50;
        let mut near = d.clone();
        near.unit.x = 0;
        near.unit.z = 0;
        let mut targets = [near];
        assert!(strike(&mut a, &mut targets, &mut g, 0, -100, false, 50).is_err());
    }

    #[test]
    fn walking_into_an_abandoned_fort_takes_it_at_once() {
        let mut g = game();
        let mut a = member(&mut g, 1);
        let mut d = member(&mut g, 0);
        math::allocate(&mut g, &mut a, 0, 50_000_000).unwrap();
        a.unit.x = 0;
        a.unit.z = 50; // in the courtyard
        let keys = [Pubkey::new_unique(), Pubkey::new_unique()];
        // the defender lives: refused
        assert!(check_abandoned(&g, 0, &a, &[a.clone(), d.clone()], &keys).is_err());
        // the garrison hidden from the muster: refused
        d.unit.hp = 0;
        assert!(check_abandoned(&g, 0, &a, &[a.clone()], &keys[..1]).is_err());
        // standing outside the walls: refused
        let mut out = a.clone();
        out.unit.z = 340;
        assert!(check_abandoned(&g, 0, &out, &[out.clone(), d.clone()], &keys).is_err());
        // dead garrison, mustered, attacker inside: Hastinapur falls now, no bell
        check_abandoned(&g, 0, &a, &[a.clone(), d.clone()], &keys).unwrap();
        let e = math::seize(&mut g, 0, 1).unwrap();
        assert!(e.by_fight && e.winner == 1 && e.eliminated);
        assert_eq!(g.territory_owner[0], 1);
        assert_eq!(g.factions[1].attack_alloc[0], 0);
        assert_eq!(g.epoch, 1); // the epoch did not move
        // a kingdom with no members at all: nobody to muster
        let mut g2 = game();
        let mut a2 = member(&mut g2, 1);
        math::allocate(&mut g2, &mut a2, 2, 50_000_000).unwrap();
        a2.unit.x = 0;
        a2.unit.z = 0;
        check_abandoned(&g2, 2, &a2, &[a2.clone()], &keys[..1]).unwrap();
        assert_eq!(math::seize(&mut g2, 2, 1).unwrap().winner, 1);
    }

    #[test]
    fn the_bell_needs_every_member() {
        let mut g = game();
        let a = member(&mut g, 1);
        let d = member(&mut g, 0);
        let keys = [Pubkey::new_unique(), Pubkey::new_unique()];
        assert!(check_complete(&g, &[a.clone(), d.clone()], &keys).is_ok());
        assert!(check_complete(&g, &[a.clone()], &keys[..1]).is_err()); // the garrison was hidden
        assert!(check_complete(&g, &[a.clone(), a.clone()], &[keys[0], keys[0]]).is_err()); // passed twice
    }

    #[test]
    fn geometry_matches_the_client() {
        assert!(is_inside(0, 0));
        assert!(is_inside(150, 0));
        assert!(!is_inside(0, 300));
        assert!(at_gate_or_inside(0, APOTHEM)); // in the gate opening
        assert!(!at_gate_or_inside(0, 340)); // the camp
        assert!(hex_depth(0, 400) > 0 && hex_depth(0, 100) < 0);
        assert!(crosses_wall(100, 0, 400, 0)); // through the side wall
        assert!(!crosses_wall(0, 150, 0, 300)); // through the gate gap: blades meet in the gate
        assert!(!crosses_wall(0, 300, 0, 400));
    }
}
