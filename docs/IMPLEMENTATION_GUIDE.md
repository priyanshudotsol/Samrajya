# Samrajya — Step-by-step implementation guide

Written 2026-10-07. This is the **"how do I build it"** document. Follow it top to bottom.
The other docs go deeper on two areas:

| Doc | Covers |
|---|---|
| `ARCHITECTURE.md` | rules, accounts, instructions, and why each choice was made |
| `KINGDOM_UI.md` | the full 3D/visual design of the globe, realm and arena |
| `PROGRESS.md` | the checklist; tick items as you go |

Code blocks here are **sketches**. Before you copy a MagicBlock API, check its exact signature against the example file named next to it.

---

# Part A — The idea

**Samrajya** is a real-time, on-chain war for the planet.

1. **Six Indian kingdoms on a globe**: Hastinapur, Magadh, Kalinga, Takshashila, Vijayanagar and Avanti. Each starts with one territory and a unique power: Kuru Fortress, Gaja Sena, Samudra Vyapar, Vidya Reach, Annapurna Harvest or Ratri Raid.
2. **Pledge to a kingdom.** You join by staking **SOL** and receive **shares** of the kingdom's treasury.
   - The treasury is also the kingdom's army strength.
   - When your kingdom wins battles, its treasury grows, and so does your share.
3. **Epochs of war, about 60 s each.**
   - During an epoch, you put your strength into **Defend** or **Attack →** a neighbouring kingdom.
   - You can change your mind as often as you like; each change is a free, ~10 ms Ephemeral Rollup transaction signed by a session key, so there's no wallet popup.
4. **Battles at the bell.**
   - Every attacked territory fights one battle. MagicBlock **VRF** picks the winner, weighted by strength.
   - If the attacker wins, it takes the territory, part of the loser's treasury, and the loser's power.
   - If the loser had nothing left, it is eliminated and the conqueror takes everything. The loser's members' shares are now worth 0.
5. **Flee or betray, for a price.**
   - **Leave** at any time and take your share minus a **20% fee**.
   - **Switch** to another kingdom for a **40% fee**.
   - Both fees stay in the treasury of the kingdom you left, which rewards the loyal members who stay.
6. **Last kingdom standing wins.** There is no turn limit. When one kingdom owns every territory, the game ends, and its members split the entire pot by shares.

**Why it's a good MagicBlock game:**
- Real-time strategy is only possible because ER moves are free and instant.
- VRF makes the battles provably fair.
- A crank runs the game clock without a server.
- The money settles trustlessly on Solana.

---

# Part B — What the game looks like (screen by screen)

## B1. World screen (`/`)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 👑 SAMRAJYA          Epoch 12 · ⏳ 00:41            ◎ Pot 18.4   [Connect]│
├──────────────┬──────────────────────────────────────────────┬────────────────┤
│ KINGDOMS     │                  .-~~~-.                     │ LIVE BATTLES   │
│ 1 Hast   ███ │           🏰 Hast ~~~~~~~> 🏰 Mgdh             │ Mgdh  → Klng   │
│ 2 Mgdh   ██  │        .´    (attack arc, red, pulsing)  `.  │ Taks  → Vijy   │
│ 3 Klng   ██  │       |  🏰 Avnt                   🏰 Taks  |  │                │
│ 4 Taks   █   │        `.        🏰 Klng    🏰 Vijy       .´  │ LAST EPOCH     │
│ 5 Vijy   █   │           `-~~~-´  (zones tinted by owner)   │ Hast HELD vs   │
│ 6 Avnt   ✕   │                                              │ Mgdh  (61%)    │
└──────────────┴──────────────────────────────────────────────┴────────────────┘
```
- The globe is dark with neon hex dots. Each kingdom is a **mini 3D castle** in its colour.
- **Attack arcs** fly between castles as players allocate.
- **Rings** burst where battles resolve.
- The tinted zones repaint as territories change hands.
- Hovering a castle shows a stats card. Clicking one flies into its **Realm**.

## B2. Join flow (first visit)
1. **Connect wallet:** Phantom, Backpack or Solflare.
2. **"Choose your banner"** shows 6 cards with each kingdom's power, treasury, members and odds.
3. **Stake:** enter an amount, at least 0.05 SOL, and press **Pledge**. This sends **one base-layer transaction**, which:
   - moves the SOL into the vault,
   - creates your Player account,
   - delegates it to the ER.
4. **Session key:** one more popup creates a 2-hour session key. After this, there are no more popups.
5. **Enlist:** an automatic ER transaction mints your shares in the kingdom.
6. You land in your kingdom's Realm with a 3-step tutorial tour, reusing chain-wars' tour component.

## B3. Realm screen (`/kingdom/[id]`)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⟵ World   HASTINAPUR  [Fortress][Blitz]      Epoch 12  ⏳ 00:41  ☀────●─── │
├──────────────┬──────────────────────────────────────────────┬────────────────┤
│ Treasury 4.2◎│        ☁   ⚑⚑ enemy camp (Mgdh , 3.1)  ☁       │ WAR ROOM       │
│ Share ◎1.12 ▲│          ▲▲▲  ┌────────────┐                  │ You: 0.8◎ (+12%)│
│ Members  23  │        🏠🏠  │ 🏰 KEEP   │  🌲🌲          │ ○ Defend       │
│ Territories 2│      🏠 💰    │  walls ▓▓▓ │    🗼          │ ● Attack ▸ Mgdh │
│              │        🏠🏠  └────────────┘  ⛰           │   win 61%      │
│ INCOMING ⚠   │          floating hex island over clouds     │ [ COMMIT ]free │
│ Mgdh    3.1  │      ═══bridge═══ 🏝 (conquered: Klng)        ├────────────────┤
│ Avnt    0.9  │                                              │ [Switch −40%]  │
│              │                                              │ [Leave  −20%]  │
│              │                                              │ BATTLE LOG     │
├──────────────┴──────────────────────────────────────────────┴────────────────┤
│ Odds  [■■■■■■■■ Hast defend 62% ■■■■■ Mgdh  30% ■ Avnt   8%]        🔊  ⚙     │
└──────────────────────────────────────────────────────────────────────────────┘
```
- The kingdom is a **floating hex island**: a keep, walls, one house per member, a gold pile sized by the treasury, and banners.
- **Troops** stand on the walls. There are more of them as the kingdom's strength grows.
- **Enemy camps** gather at the island edge facing each attacker, and grow or shrink live.
- **Owned powers** show as landmarks. **Conquered territories** float beside the island as small islands linked by bridges.
- The **sun sets** over the epoch, and the sky turns red in the final 10 s.
- **"Your share" panel:** shows your current SOL value, your profit or loss against what you paid in, and the share-price trend.
  - **Leave** opens a confirmation: "You receive 0.64 ◎, and 0.16 ◎ stays with Hastinapur".
  - **Switch** opens a kingdom picker that shows the 40% cost.
  - Both buttons are disabled while a battle is resolving.

## B4. Battle cinematic (the Arena)
At the bell, the camera swoops to the gate and the battle plays in five steps:
1. **MUSTER:** drums, torches, defenders line the walls.
2. **CLASH:** armies collide, catapults fire, the camera shakes.
3. **ROLL:** a rune wheel appears with segments sized by the *real odds*. It spins and lands on the *real VRF roll*.
4. **HELD:** the attackers rout, defenders cheer, and spoils fly to the treasury.
5. **FALLEN:** the gate breaks, roofs catch fire, and banners sweep to the conqueror's colour.

If it was your last territory, an **ELIMINATED** card appears: "Your shares are worth 0. Pledge again to another kingdom?"
While your kingdom is losing territories, a **"Flee the realm?"** nudge shows how much you'd keep if you left now.

## B5. Victory
- The winning kingdom gets a confetti and fanfare modal, reusing chain-wars' `team-win/*` components.
- The modal shows your share. **Claim** sends a base-layer transaction that pays your SOL out of the vault.
- The claim amount is `your shares × winner treasury / total shares`.
- Losers see the final map, the conqueror's name, and a "Next war starts in…" timer.

---

# Part C — Architecture summary

```
 Browser (Next.js app/)                                   
 ├─ World (globe.gl)  ── Realm/Arena (react-three-fiber)  
 ├─ zustand store  ◄── ER websocket: onAccountChange(Game) 
 ├─ wallet-adapter (base txs)   session key (ER txs)       
 │                                                         
 ├──► Solana devnet (base)                    ├──► MagicBlock ER (devnet-as.magicblock.app)
 │     samrajya program                       │     Game (delegated) — 6 factions inline
 │     Vault PDA (SOL, never delegated)       │     Player PDAs (delegated)
 │     init_game · join · delegate · claim    │     enlist · allocate · resolve_epoch
 │                                            │     battle_callback (VRF) · crank clock
 └──────── commit_and_undelegate at game end ◄┘
```
- **No backend:** the chain is the backend.
- **One subscription:** the client watches a single `Game` account, which drives the whole UI.

---

# Part D — Repo layout

```
v9-blitz/
  CLAUDE.md                     session memory + status
  docs/                         ARCHITECTURE · KINGDOM_UI · IMPLEMENTATION_GUIDE · PROGRESS
  app/                          ← chain-wars frontend, copied 2026-10-07 (to be adapted)
  reference/chain-wars/         game-simulation.js (rules reference), backend-schema.ts
  magicblock-engine-examples/   MagicBlock reference (read-only)
  programs/samrajya/            (Step 1) Anchor program
  tests/samrajya.ts             (Step 1) tests
  Anchor.toml  Cargo.toml       (Step 1) Anchor workspace at repo root
```

What was copied from `~/codes/job/rugrumble/chain-wars`:
- **Copied:**
  - `packages/frontend` → `app/`, without `node_modules`, `.next`, `.turbo`, `.env*` or build info.
  - `packages/scripts/simulate/game-simulation.js` and `packages/backend/drizzle/schema.ts` → `reference/chain-wars/`.
- **Not copied:**
  - The NestJS backend and the shared EVM config. The MVP doesn't need them.
  - The secrets in `.env`. Create a fresh `app/.env.local`; see Step 9.

---

# Part E — Step-by-step build

Every step ends with a **✅ Done when** check. Don't move on until it passes.

## Step 0 — Toolchain (30 min)
```bash
avm use 1.0.2 && anchor --version            # 1.0.2
solana --version                             # examples use 3.1.9; 4.0.3 installed — try it, fall back with agave-install init 3.1.9
rustc --version                              # examples use 1.89.0
npm i -g @magicblock-labs/ephemeral-validator   # gives `mb-stack` (local base + ER)
solana config set --url devnet && solana-keygen new -o ~/.config/solana/id.json (if none) && solana airdrop 2
```
Prove the toolchain works by running one example end to end:
```bash
cd magicblock-engine-examples/counter/anchor && yarn && yarn build
yarn setup        # terminal 1 (SETUP_ONLY=1 ./scripts/test-locally.sh)
yarn test:local   # terminal 2
```
✅ **Done when:** the counter test passes locally. You now know the local ER stack works.

## Step 1 — Scaffold the program (1 h)
At the repo root:
```bash
cd ~/codes/v9-blitz
anchor init samrajya-tmp --no-git && mv samrajya-tmp/{Anchor.toml,Cargo.toml,programs,tests,migrations,package.json,tsconfig.json} . && rm -rf samrajya-tmp
mv programs/samrajya-tmp programs/samrajya   # fix names in Anchor.toml / Cargo.toml
anchor keys sync
```
- `programs/samrajya/Cargo.toml`: copy the deps from `session-keys/anchor/programs/anchor-counter-session/Cargo.toml`.
  ```toml
  anchor-lang = { version = "1.0.2", features = ["init-if-needed"] }
  ephemeral-rollups-sdk = { version = "0.16.2", features = ["anchor", "vrf"] }
  session-keys = { version = "3.1.1", features = ["no-entrypoint"] }
  ```
- Root `Cargo.toml`: copy the `[profile.release]` and `[lints]` blocks from an example.

✅ **Done when:** `anchor build` succeeds with an empty program.

## Step 2 — State & game math (half day)
File layout:
```
programs/samrajya/src/
  lib.rs            #[ephemeral] #[program] — thin, delegates to instructions/*
  state.rs          Game, Faction, Player, BattleEntry, GameConfig
  math.rs           pure fns: value_of(), mint_shares(), leave_payout(), switch_amounts(),
                    defense(), attack(), resolve_battle(), apply_conquest()
  errors.rs
  instructions/     init_game.rs join.rs delegate.rs enlist.rs start_game.rs allocate.rs
                    switch.rs leave.rs withdraw.rs resolve_epoch.rs battle_callback.rs
                    end_game.rs claim.rs   (as built: all handlers live in lib.rs, rules in math.rs)
```
`state.rs` sketch:
```rust
pub const N: usize = 6;
#[account] #[derive(InitSpace)]
pub struct Game {
    pub authority: Pubkey, pub game_id: u64, pub bump: u8, pub vault_bump: u8,
    pub phase: Phase,                 // Lobby | Active | Ended
    pub epoch: u32, pub epoch_ends_at: i64, pub pending_vrf: bool,
    pub config: GameConfig,
    pub territory_owner: [u8; N],     // faction idx owning each territory
    pub factions: [Faction; N],
    pub winner: Option<u8>,
    pub battle_log: [BattleEntry; 16], pub log_head: u8,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct Faction {
    pub treasury: u64,         // accounting lamports (real SOL is in Vault) — also army strength
    pub total_shares: u128,    // player value = shares * treasury / total_shares
    pub members: u32, pub territories: u8, pub powers: u8, pub alive: bool,
    pub attack_alloc: [u64; N],// lamports of value committed this epoch per target territory
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct GameConfig { pub min_stake: u64, pub epoch_secs: i64,
    pub leave_fee_bps: u16 /* 2000 */, pub switch_fee_bps: u16 /* 4000 */,
    pub k_loss_bps: u16 /* 2000 */, pub base_defense: u64, pub storm_decay_bps: u16 /* 500 */,
    pub adjacency: [u8; N] /* bitmask per territory */ }
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum PlayerStatus { Idle, Active, Claimed }
#[account] #[derive(InitSpace)]
pub struct Player { pub wallet: Pubkey, pub game: Pubkey, pub faction: u8, pub shares: u128,
    pub pending_deposit: u64, pub pending_withdrawal: u64, pub deposited_total: u64 /* for P&L in UI */,
    pub alloc_target: u8 /* 255 = defend */, pub alloc_amount: u64, pub alloc_epoch: u32,
    pub status: PlayerStatus, pub bump: u8 }
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default)]
pub struct BattleEntry { pub epoch: u32, pub territory: u8, pub defender: u8,
    pub winner: u8, pub roll: u64, pub total: u64, pub attackers_mask: u8 }
```
**Write `math.rs` first, as pure Rust with `#[cfg(test)]` unit tests.** Port the formulas from `ARCHITECTURE.md §2`. `reference/chain-wars/game-simulation.js` is a sanity reference.

The share math uses u128 everywhere. Remainders round *down* for the player, so the dust stays in the treasury.
```rust
pub fn value_of(f: &Faction, shares: u128) -> u64 {
    if f.total_shares == 0 { 0 } else { (shares * f.treasury as u128 / f.total_shares) as u64 }
}
pub fn mint_shares(f: &mut Faction, lamports: u64) -> u128 {
    let minted = if f.total_shares == 0 || f.treasury == 0 { lamports as u128 * 1_000_000 }
                 else { lamports as u128 * f.total_shares / f.treasury as u128 };
    f.total_shares += minted; f.treasury += lamports; minted
}
/// burns shares, returns lamports paid out; fee portion stays in treasury
pub fn burn_with_fee(f: &mut Faction, shares: u128, fee_bps: u16) -> u64 {
    let value = value_of(f, shares);
    let out = value - value * fee_bps as u64 / 10_000;
    f.total_shares -= shares; f.treasury -= out; out
}
// leave:  payout = burn_with_fee(&mut A, shares, 2000)
// switch: moved  = burn_with_fee(&mut A, shares, 4000); new = mint_shares(&mut B, moved)
```
Edge case: when the last member of an eliminated kingdom has `treasury == 0`, `value_of` returns 0, so `leave` pays nothing. That is the intended rule.

```rust
pub fn resolve(game: &mut Game, territory: usize, rnd: u64) -> BattleEntry {
    let def = game.territory_owner[territory] as usize;
    let d = defense_power(game, def, territory);          // incl. Fortress ×1.3, storm decay
    let mut buckets = [0u64; N];                         // A_i per attacking faction
    for f in 0..N { if f != def { buckets[f] = attack_power(game, f, territory); } }
    let total = d + buckets.iter().sum::<u64>();
    let roll = rnd % total.max(1);
    let winner = if roll < d { def } else { pick_bucket(&buckets, roll - d) };
    if winner == def { apply_repel(game, def, &buckets) } else { apply_conquest(game, winner, def, territory) }
    BattleEntry { /* … */ }
}
```
Run `cargo test -p samrajya` and add a **simulation test**: 6 factions, random allocations, and random leave/switch/join events, run in a loop until one kingdom owns everything. Assert:
- someone wins,
- there are no overflows,
- **Σ faction.treasury + Σ payouts made == Σ deposits** (no SOL created or lost),
- a leave returns exactly 80% of value, and a switch moves exactly 60%.

✅ **Done when:** the math unit tests and the simulation test pass.

## Step 3 — Base-layer instructions + test without the ER (half day)
These come straight from `rock-paper-scissor/anchor` (vault + claim) and `counter/anchor` (structure).
- **`init_game(game_id, config)`:** creates `Game` (`["game", id]`) and the vault (`["vault", game]`, a SystemAccount).
- **`join(faction, amount)`:**
  - `system_program::transfer(player → vault, amount)`.
  - Creates or reuses `Player` (`["player", game, wallet]`, `init_if_needed`) and sets `pending_deposit`.
- **`enlist`:** calls `mint_shares` into the faction from `pending_deposit`.
  In this base-only step it is a normal base ix; Step 4 moves it to the ER.
- **`allocate(target, amount)`, `switch(to)`, `leave`, `withdraw`:**
  - `leave` sets `pending_withdrawal`.
  - `withdraw` pays it from the vault with the vault's signer seeds (copy `claim_pot` from rock-paper-scissor).
- **`resolve_epoch_debug(seed)`:** a temporary ix that uses a pseudo-random seed instead of VRF.
- **`claim`:** requires `phase == Ended && player.faction == winner && status != Claimed`. Pays `value_of(winner, player.shares)` from the vault.

Test (`tests/samrajya.ts`) on a plain `anchor test`:
1. 6 wallets join different factions. One extra wallet joins and then **leaves**: assert it receives 80%, and the faction treasury keeps 20%.
2. One wallet **switches**: assert 60% arrives in the new faction and 40% stays in the old one.
3. Run allocate / resolve until one kingdom owns all 6.
4. Winners claim, members of eliminated kingdoms fail to claim (value 0), and the vault ends near 0 (rent only).

✅ **Done when:** a full game plays to completion on the local validator with no ER.

## Step 4 — Move the game onto the Ephemeral Rollup (1 day)
Copy the patterns from `counter/anchor/programs/public-counter/src/lib.rs` and `rock-paper-scissor/anchor`.
1. Add `#[ephemeral]` above `#[program]`.
2. **`delegate_game`** (admin) and **`delegate_player`** (player): use `#[delegate]` with a `#[account(mut, del)] pda` field and `ctx.accounts.delegate_pda(payer, seeds, DelegateConfig{ validator, ..})`.
   - Pass the validator as a remaining account.
   - Locally the validator is `mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev`. On devnet, take it from `getClosestValidator()`.
3. **Split `join`.**
   - Once `Game` is delegated, base `join` only funds the Player (`pending_deposit`) and delegates it in the same tx.
   - **`enlist`** moves to the ER: it mints shares and zeroes `pending_deposit`.
   - `join` must fail if the Player is currently delegated, i.e. its owner is the delegation program. (MVP: no top-ups while playing.)
4. **`leave` becomes an ER ix** (`#[commit]`).
   - It calls `burn_with_fee`, sets `pending_withdrawal` and clears the allocation.
   - Then it runs `player.exit()` and `MagicIntentBundleBuilder::new(..).commit_and_undelegate(&[player]).build_and_invoke()`.
   - The client waits for `GetCommitmentSignature`, then sends base **`withdraw`**.
   - Block `leave` and `switch` while `game.pending_vrf` is true.
5. **`end_game`** (`#[commit]`):
   - requires `phase == Ended`,
   - calls `game.exit()`,
   - runs `commit_and_undelegate(&[game])`.
6. **`undelegate_player`** (ER, `#[commit]`; called `settle` in early drafts): runs `commit_and_undelegate(&[player])` after the game ends. Then base **`claim`** reads both committed accounts.
7. **Test with the local stack:** `mb-stack` (see `scripts/test-locally.sh`) and two providers.
   - Base connection: `localhost:8899`. ER connection: `localhost:7799`.
   - Use `GetCommitmentSignature` to wait for commits.

✅ **Done when:**
- the same full-game test passes with enlist, allocate, switch, leave and resolve sent to the **ER**,
- leave → withdraw pays out on **base** mid-game,
- and claim succeeds on **base** after `end_game` + `undelegate_player`.

## Step 5 — Session keys (half day)
Copy from `session-keys/anchor/programs/anchor-counter-session/src/lib.rs`.
```rust
#[session_auth_or(ctx.accounts.player.wallet == ctx.accounts.signer.key(), SessionError::InvalidToken)]
pub fn allocate(ctx: Context<Allocate>, target: u8, amount: u64) -> Result<()> { … }
#[derive(Accounts, Session)]
pub struct Allocate<'info> {
  #[account(mut)] pub signer: Signer<'info>,
  #[account(mut, seeds=[GAME, &game.game_id.to_le_bytes()], bump=game.bump)] pub game: Account<'info, Game>,
  #[account(mut, seeds=[PLAYER, game.key().as_ref(), player.wallet.as_ref()], bump=player.bump)] pub player: Account<'info, Player>,
  #[session(signer = signer, authority = player.wallet)] pub session_token: Option<Account<'info, SessionTokenV2>>,
}
```
- Apply the same pattern to `enlist`, `switch_kingdom`, `leave` and `undelegate_player`.
- Money always goes to `player.wallet`, never to the session signer, so a stolen session key can't steal funds.
  The worst it can do is make a bad move.
- Client side: `@magicblock-labs/gum-sdk` `SessionTokenManager.createSessionV2(...)`. See `session-keys/anchor/tests/advanced-magic.ts`.

**Allocate logic.** This is the incremental aggregate update; see `ARCHITECTURE.md §4`.
1. If `player.alloc_epoch == game.epoch`, subtract the old allocation from `factions[f].attack_alloc[old]`.
2. Validate the new target:
   - it is adjacent to a territory `f` owns (or `f` has the Reach power),
   - it is not owned by `f`,
   - it is alive.
3. `amount ≤ value_of(faction, player.shares)`.
4. Add the new allocation and set `alloc_epoch = epoch`.

✅ **Done when:** a test sends allocate signed only by the session keypair, and it succeeds on the ER.

## Step 6 — VRF battles (1 day)
Copy from `roll-dice/anchor/programs/roll-dice-delegated/src/lib.rs`.
- **`resolve_epoch`** (`#[vrf]` accounts, permissionless):
  1. Requires `phase == Active && now >= epoch_ends_at && !pending_vrf`.
  2. Sets `pending_vrf = true`.
  3. Calls `create_request_scoped_randomness_ix(RequestRandomnessParams { callback_discriminator: instruction::BattleCallback::DISCRIMINATOR, accounts_metas: [game (writable)], caller_seed: hash(epoch), oracle_queue: EPHEMERAL_QUEUE, .. })`.
  4. Calls `invoke_signed_vrf`.
- **`battle_callback(randomness: [u8; 32])`** (`#[vrf_callback]`):
  1. For each territory `t` with any `attack_alloc[*][t] > 0`, compute `rnd_t = u64::from_le_bytes(hash(randomness ‖ t)[..8])` and call `math::resolve(game, t, rnd_t)`.
  2. Push the results to `battle_log`.
  3. Reset `attack_alloc`, then `epoch += 1; epoch_ends_at += epoch_secs`.
  4. Check for a winner: if one faction owns all 6 territories, set `phase = Ended` and `winner`. There is no turn limit.
  5. Apply the storm: `base_defense = base_defense × (1 − storm_decay)`.
  6. Set `pending_vrf = false`.
- **Queues:**
  - Local ER: `Sc9MJUngNbQXSXGP3F67KvKwVnhaYn6kcioxXNVowYT` (needs `vrf-oracle` on PATH; see `scripts/local-env.sh`).
  - Devnet ER: `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc`.
- Delete `resolve_epoch_debug`, or gate it behind a `debug` cargo feature.

✅ **Done when:** an epoch resolves through VRF on the local stack and `battle_log` fills.

## Step 7 — The game clock: crank or keeper (half day)
**Option A, the crank.** Copy from `crank-counter/anchor/programs/crank-counter/src/lib.rs`.
- In `start_game`, call `ScheduleCrankCpi { args: ScheduleTaskArgs { task_id: 1, execution_interval_millis: epoch_secs*1000, iterations: 10_000, instructions: [resolve_epoch ix] } }`.
- ⚠ This needs the SDK git rev `0fc4604…` with the `crank` feature. First check that `vrf` still compiles on that rev.

**Option B, the fallback.** Use `scripts/keeper.ts`, a 20-line Node loop that calls `resolve_epoch` on the ER when `now >= epoch_ends_at`.
- The frontend also calls it opportunistically when its timer hits 0.
- `resolve_epoch` is permissionless and idempotent, so duplicate calls are harmless.

**Recommendation:** ship B first, since it always works, then add A if it compiles. A is a nicer pitch.

✅ **Done when:** epochs advance by themselves while no one is interacting.

## Step 8 — Deploy the program to devnet (2 h)
```bash
anchor build && anchor deploy --provider.cluster devnet
anchor idl init <PROGRAM_ID> -f target/idl/samrajya.json --provider.cluster devnet
npx ts-node scripts/create-game.ts     # init_game + delegate_game + start_game on devnet
```
✅ **Done when:** the devnet test, with env vars unset so it falls back to devnet endpoints, plays a short game with a 15 s epoch.

---

## Step 9 — Clean up the copied frontend (half day; can start on day 1, in parallel)
Work in `app/`. Use **pnpm**, as chain-wars did.

**9a. Remove the EVM and economy code:**
```
lib/hooks/contracts/  lib/hooks/contract-data/  lib/hooks/socket/  lib/hooks/swap*/  lib/hooks/votes/
lib/hooks/realtime/   lib/hooks/chains/  lib/hooks/use-uniswap-pair-addresses.ts  use-rewards.ts
lib/providers/{wallet,auth,user-vault-gateway,ticker-stream,transaction-status,referrer}-provider.tsx
lib/constants/{chains,contracts,tokens,transaction}.ts   lib/api/{goldrush,fees-plug-balances,rewards}.ts
components/{bonding,swap,deposit,withdraw,token,balances,claim,rewards,passport,txn-history}/
app/top-chain/  app/api/fees-plug-balances/  data/chains.*.json  scripts/ (contract verify scripts)
```
- Remove `wagmi`, `viem`, `ethers`, `@rainbow-me/rainbowkit`, `@socket.tech/surge-gameplay` and `@mui/*` (if unused after cleanup) from `package.json`.
- Also remove the `prebuild` script that verifies contracts.

**9b. Keep:**
- `components/ui/*`, including `globe.tsx` and `clippath-border.tsx`
- `components/territories/*`: this becomes `components/world/*`
- `leaderboard`, `team-win`, `modals`, `loader`, `background`, `countdown-timer`, `tour`, `onboarding`, `mobile-blocker`
- `lib/providers/{modal,toast,view-mode,onboarding,team-win,history-modal}`
- `app/globals.css` and the fonts

**9c. Add the new dependencies:**
```bash
pnpm add @solana/web3.js @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets \
  @coral-xyz/anchor@0.32.1 @magicblock-labs/ephemeral-rollups-sdk @magicblock-labs/gum-sdk zustand \
  @react-three/fiber@^9 @react-three/postprocessing maath howler
pnpm add -D @types/howler leva
```
**9d. Create `app/.env.local`:**
```
NEXT_PUBLIC_MOCK=1
NEXT_PUBLIC_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_ER_RPC=https://devnet-as.magicblock.app
NEXT_PUBLIC_ER_WS=wss://devnet-as.magicblock.app
NEXT_PUBLIC_PROGRAM_ID=<from Step 8>
NEXT_PUBLIC_GAME_ID=1
```
**9e.** Temporarily stub `app/page.tsx` so it renders the globe only. Fix imports until the app builds.

✅ **Done when:** `pnpm dev` shows the globe with no EVM code and no console errors.

## Step 10 — Game store + mock mode (half day)
- **`lib/game/types.ts`:** a `GameState` that mirrors the IDL. Later, use the Anchor-generated types.
- **`lib/game/factions.ts`:** names, colours, biomes, powers, lat/lng and adjacency. See `KINGDOM_UI.md §2`.
- **`lib/game/math.ts`:** a TypeScript port of `math.rs`. It is used for odds previews and the mock. **Keep it identical to the Rust**, and use shared test vectors.
- **`lib/mock/mockGame.ts`:** ticks every 15 s, with random bots that allocate and resolve using `Math.random`.
- **`lib/store/game.ts`:** a zustand store holding `{ game, me, status }`, with `subscribeMock()` and `subscribeER()`:
```ts
export function subscribeER(conn: Connection, program: Program<Samrajya>, gamePda: PublicKey) {
  const decode = (d: Buffer) => program.coder.accounts.decode('game', d)
  program.account.game.fetch(gamePda).then(g => useGame.setState({ game: g }))
  return conn.onAccountChange(gamePda, info => useGame.setState({ game: decode(info.data) }), 'processed')
}
```
✅ **Done when:** with `NEXT_PUBLIC_MOCK=1`, the store updates every tick and the leaderboard re-renders.

## Step 11 — World screen (1 day)
See `KINGDOM_UI.md §8`.
1. Point `globe.tsx` at the 6 kingdoms from `factions.ts`, with colours taken from `game.territory_owner`.
2. **Markers:** replace the logo discs with a mini castle GLB (`objectThreeObject`).
3. **Arcs:** `arcsData` comes from `factions[f].attack_alloc[t] > 0`, coloured by the attacker, with stroke width set by strength.
4. **Rings:** `ringsData` from new `battle_log` entries.
5. **Panels:** the kingdom list on the left (adapted leaderboard), the live battles and last-epoch results on the right, and a header with the epoch timer and pot.
6. **Navigation:** clicking a castle calls `pointOfView` to fly in, then `router.push('/kingdom/' + id)`.

✅ **Done when:** in mock mode, arcs appear and disappear, rings pop, and conquests recolour castles.

## Step 12 — Realm diorama (1.5 days)
See `KINGDOM_UI.md §3–4`.
1. **Assets:**
   - Download KayKit Medieval Hexagon, the Kenney Castle Kit and KayKit Adventurers into `app/assets-src/` (git-ignored).
   - Run `gltf-transform optimize` → `public/models/kit-hex.glb`, `kit-castle.glb`, `units.glb`, `globe-castle.glb`.
2. **`lib/realm/layout.ts`:** a seeded hex island, radius 3, with rings for the keep, walls, buildings and the biome edge.
3. **`components/realm/RealmCanvas.tsx`:** a client-only component (`dynamic(..., { ssr:false })`).
   - It contains Canvas, lighting, clouds, Island, HexTiles (instanced), Walls, Keep, Buildings, Banners, ShieldDome, Troops and CameraRig.
4. **`lib/realm/derive.ts`:** maps game state to visuals: troop count, houses, treasury tier, wall height, incoming camps and landmarks.
5. **HUD:** `components/realm-hud/*`, made of RealmHeader, KingdomStats, IncomingPanel, WarRoom (with live odds via `lib/game/math.ts`), OddsBar and BattleLog.

✅ **Done when:** opening `/kingdom/0` in mock mode shows an island that visibly changes as the mock ticks: troops grow, camps appear, banners recolour after a conquest.

## Step 13 — Battle cinematic (1–1.5 days)
See `KINGDOM_UI.md §5`.
- **`lib/arena/battleMachine.ts`:** IDLE → MUSTER (T−10 s) → CLASH (epoch rolled or `pending_vrf`) → ROLL (`battle_log` entry arrives) → HELD | FALLEN → IDLE.
- **`components/arena/*`:** BattleDirector, Troops (instanced, formations with `maath` damping), Projectiles, RuneWheel, a colour-takeover shader uniform, and CameraShake.
- **Audio:** `lib/audio.ts` with howler, using Kenney SFX.

✅ **Done when:** every mock battle on the open realm plays the full sequence, and the rune lands on the logged roll.

## Step 14 — Wire the real chain (1 day)
1. **Wallet:** replace the mock source with `subscribeER`. Add the `WalletProvider` from `@solana/wallet-adapter-react`, with Phantom, Backpack and Solflare.
2. **`lib/solana/connections.ts`:** a base connection and an ER connection, created once each.
3. **`lib/solana/actions.ts`:**

   | Action | What it does |
   |---|---|
   | `pledge(faction, sol)` | base tx: `join` + `delegate_player` in one tx if size allows, otherwise two |
   | `ensureSession()` | gum-sdk `createSessionV2`; keep the keypair in localStorage, like `session-keys/anchor/app/src/App.tsx` |
   | `enlist()` | ER tx signed by the session key |
   | `allocate(target, amount)` | ER tx signed by the session key; optimistic UI update |
| `switchKingdom(to)` | ER tx signed by the session key; confirm modal shows the 40% cost |
| `leave()` | ER tx (session key) → wait for commit → base `withdraw` (wallet popup); confirm modal shows the 20% cost |
   | `pokeResolve()` | ER tx calling `resolve_epoch` when the timer hits 0; errors are ignored |
   | `claim()` | ER `end_game` + `undelegate_player` → wait for undelegation → base `claim` |

4. **Join flow UI:** the B2 sequence as one guided modal, reusing the `onboarding/*` components.

✅ **Done when:** on devnet, two browsers join different kingdoms, attack each other, watch a VRF battle, and the winner claims SOL.

## Step 15 — Polish & ship (1 day)
- **Loading:** a loading screen while GLBs download, using `useProgress`, and preloading on castle hover.
- **Performance:** `PerformanceMonitor` with a low-power mode, and a mobile fallback (2D realm or a simplified scene).
- **Tutorial:** a tour with 3 steps: pledge → allocate → watch the bell.
- **Deploy:** the frontend to Vercel (`app/` as the root directory), and a devnet game with 60 s epochs.
- **README:** the pitch, architecture diagram, how to run, program ID and demo link.
- **Demo video, 2 min:**
  1. Globe overview.
  2. Pledge (one popup, then none).
  3. Allocate an attack live while the enemy camp grows.
  4. The bell: clash → rune → FALLEN takeover.
  5. Globe recolours.
  6. Winner claims.
- **Submit** at https://build.magicblock.app/?stage=blitz#submit in the Games category.

---

# Part F — Suggested 7-day schedule (two parallel tracks)

| Day | Program track | Frontend track |
|---|---|---|
| 1 | Steps 0–2 (toolchain, scaffold, math + sim tests) | Steps 9–10 (clean copy, store, mock) |
| 2 | Step 3 (base game end to end) | Step 11 (World screen) |
| 3 | Step 4 (ER delegation, enlist, commit/undelegate) | Step 12 (realm diorama) |
| 4 | Steps 5–6 (session keys, VRF) | Step 12 cont. (HUD, WarRoom) |
| 5 | Steps 7–8 (clock, devnet deploy) | Step 13 (battle cinematic) |
| 6 | Step 14 (wire the real chain): both tracks meet | |
| 7 | Step 15 (polish, video, submit) | |

For a solo builder: alternate half-days, program in the morning and UI in the afternoon. Mock mode means the UI never waits on the program.

---

# Part G — Testing checklist (before demo)
- [ ] A full game ends with exactly one winner, and the claims plus withdrawals sum to all deposits (minus rent).
- [ ] A loser can't claim, and a winner can't claim twice.
- [ ] Allocate is rejected for a non-adjacent target, your own territory, an eliminated faction, or an amount above strength.
- [ ] `resolve_epoch` before the deadline fails; a double resolve is a no-op.
- [ ] Session key expiry falls back to a wallet popup gracefully.
- [ ] The storm decay makes base defense shrink every epoch, so a passive game still ends.
- [ ] Leave pays exactly 80% of value, and the 20% raises the share price for the members who stay.
- [ ] Switch moves exactly 60%, and the 40% stays in the old kingdom.
- [ ] Leave and switch are rejected while `pending_vrf` is true.
- [ ] A member of an eliminated kingdom gets 0 from leave or claim, and can join an alive kingdom with new SOL.
- [ ] A session key can't redirect funds; withdraw and claim always pay `player.wallet`.
- [ ] The UI handles a refresh in the middle of a battle: the battle machine re-derives its state from `Game`.
- [ ] The TS `math.ts` matches the Rust `math.rs` on shared test vectors.

---

## Step 16 — Tactical layer in mock mode (done 2026-10-08)
Rules in `app/lib/game/units.ts` + `tactics.ts` (tests in `tactics.test.ts`), mock in `lib/mock/mockGame.ts`
(bots walk, march, pick roles/gear, chat), renderer `components/arena/Units.tsx`, controller
`lib/arena/controller.ts`, camera `components/realm/CameraRig.tsx`, HUD `SainikPanel` / `WarCouncil` /
`KingdomChat`. Mock mode no longer needs Phantom: a persisted fake wallet identifies the viewer.

## Step 17 — Move the warriors on-chain (core done 2026-10-09, see ARCHITECTURE §10.9; open: on-chain wall collision, presence-weighted tactics, wounds at the bell)
1. `state.rs`: add `UnitState` to `Player` (ARCHITECTURE §10.1) and `presence: [[u16; 6]; 6]` to `Game`
   (weights ×100 per territory per faction, plus `inside: [u8; 6]` defender head counts for the walk-in
   rule). Re-run the LiteSVM space checks (Game is boxed; it grows by ~80 bytes).
2. `math.rs`: port `unit_weight`, `hex_depth`, `in_gate`, `step_unit` and the §10.3 factors with the
   same integer rounding as the TS (`Math.round` → `(x + 50) / 100`). Add the `tactics.test.ts` vectors
   as Rust tests.
3. Instructions `move_unit`, `set_role`, `set_gear`, `march` (`#[session_auth_or]`), each: settle a
   finished march, subtract the old weight from `presence`, validate, add the new weight.
   `battle_callback`: read `presence` for each contested territory, apply the factors / capture, then
   apply wounds and routs by resetting that territory's presence (the next `move_unit` re-adds it).
4. `enlist` spawns the unit; `leave` / elimination clear it; `switch` recolours it.
5. Client: decode `Player.unit` (`lib/solana/decode.ts`), subscribe to all Player PDAs of the game via
   `getProgramAccounts` + `onProgramAccountChange` on the ER (filter by the game pubkey offset), feed
   `useGame.units`; replace `lib/actions/local-units.ts` with real ER txs through the session key.
6. ER cost check: 10 Hz × N players of `move_unit` is the load test — measure with `scripts/er-latency.ts`
   and drop to 5 Hz if needed.
7. Combat (ARCHITECTURE §10.7, TS rules in `app/lib/game/combat.ts`, tests in `combat.test.ts`):
   `UnitState` gains `dead_until: i64` and `ready_at: i64`; `Game` gains `gates: [u16; 6]`.
   `strike(x, z, facing)` = `move_unit` + cooldown check + `resolve_strike` over the Player accounts
   passed as `remaining_accounts` (the client sends the warriors within reach, the program re-checks
   realm / distance / arc / wall line) + gate damage; a kill sets `dead_until`, zeroes the warrior's
   presence weight and emits an event. `respawn` (or the next `move_unit` after `dead_until`) puts it
   back at home. `battle_callback` repairs every gate. Port the combat tests as Rust tests.
8. Client: replace `strike` / `rally` in `local-units.ts` with the ER tx and a chat message; combat
   events come from program logs (`onLogs`) instead of the mock's event list.
9. Squad assaults (ARCHITECTURE §10.8): `allocate` on a walled realm teleports the unit to the camp
   outside its gate (port `campPoint`), Defend brings it home, `march` is instant; `battle_callback`
   teleports beaten attackers and routed defenders home. Mirror `teleportUnit` from `app/lib/game/units.ts`.
10. Fight-only resolution (§10.8): in `battle_callback`, a walled realm is captured iff `inside[t] == 0`
   and a committed attacker is at the gate (the strongest presence wins), else held: no VRF sub-roll for
   it, `roll = 0`, set `by_fight`. Only the plains use the VRF. `strike` kills set
   `dead_until = max(epoch_ends_at, now + RESPAWN_SECS)`; nobody respawns while `pending_vrf`. Port
   `resolveBattle`'s `byFight` branch and the two tests in `combat.test.ts` / `mockGame.test.ts`.

## Step 18 — Kingdom chat on devnet
Create a Supabase project, run `app/supabase/chat.sql`, set the three env vars (ARCHITECTURE §10.5),
test with two wallets in two kingdoms: each sees only its own room, a non-member's token is refused.
