# Samrajya — Architecture (MagicBlock Blitz)

**Samrajya** (साम्राज्य, "empire") is a royal war for the globe. Written 2026-10-07; economy rules updated 2026-10-07; plains, equal tickets, upgrades and new wars added 2026-10-09 (§11, which overrides §2 where they differ).
This doc is the source of truth for design decisions. Update it when a decision changes.

---

## 1. The game in one paragraph

A 3D globe shows **6 kingdoms** (territories), and each kingdom starts with a unique **power**.
- **Joining:** everyone pays the **same ticket** (e.g. 0.1 SOL) to join a kingdom and owns an **equal share** of its treasury (§11.2).
- **Strength:** the kingdom's treasury is also its army strength.
- **Epochs:** the game runs in short epochs (e.g. 60 s). In each one, members put their strength toward **defending** home or **attacking** a neighbour.
- **Battles:** each attacked territory fights at the end of the epoch, and **VRF randomness weighted by power** picks the winner.
  - A winning attacker takes the territory, **a share of the loser's treasury** and its power. That raises the value of every share the winners hold.
  - The loser's shares lose value.
- **Leaving and switching:** you can **leave at any time** with your share minus a **20% fee**, or **switch kingdom** for a **40% fee**. Both fees stay in the treasury of the kingdom you left.
- **Elimination:** a kingdom that loses its last territory is eliminated. Its remaining treasury goes to the conqueror, and its members' shares are worth 0.
- **The plains:** **Kurukshetra**, a neutral 7th territory in the middle, borders every kingdom and pays its holder the plains pot (§11.1).
- **Upgrades and conquest might:** members spend treasury on walls and an armory, and every territory held beyond the first makes a kingdom hit and hold harder (§11.3–11.4).
- **The end:** the game continues **until one kingdom owns every territory, the plains included**. That kingdom's members then split the entire pot equally. Anyone can then open the next war (§11.5).

Clicking a kingdom on the globe opens the **Kingdom Arena**: a 3D castle scene that shows the army, walls, flags,
incoming attacks and battle animations.

---

## 2. Core rules (MVP numbers, all tunable in `GameConfig`)

### Confirmed by the user (2026-10-07)
- **SOL only.**
- **Conquered players lose their stake.** The treasury moves to the conqueror. Players can flee before their kingdom falls.
- **Leave at any time** for a **20%** fee. **Switch kingdom** for a **40%** fee. **Both fees stay in the treasury of the kingdom being left.**
- **No turn limit.** The game ends only when one kingdom owns all territories.
- The name is **Samrajya**.

### Factions and territories
- There are 6 **territories**, numbered 0–5.
- There are 6 **factions** (kingdoms), numbered 0–5. Each faction starts out owning the territory with the same number.
- A faction can own many territories. A territory always has exactly one owner faction.

### The share model (the core of the economy)
Each faction tracks `treasury` (lamports, as an accounting number; the real SOL sits in the vault) and `total_shares`.
```
share_price          = treasury / total_shares          (1.0 when the kingdom is empty)
player.value         = player.shares × treasury / total_shares
faction strength     = treasury                         (money is power)
```
Because every SOL movement between kingdoms is just a change to `treasury`, conquest, fees and spoils update every member's value in **O(1)**.

### Joining (any time while the game isn't Ended)
- A player calls `join(faction, amount)` with an amount of at least `min_stake`, e.g. 0.05 SOL.
- The SOL goes to the vault.
- The player receives `minted = amount × total_shares / treasury` shares, or `amount` shares if the kingdom is empty.
  The new money adds to the treasury, so existing members aren't diluted.
- A player can only join an **alive** faction, one that owns at least one territory.
- A player who left, or whose kingdom was eliminated, can join again with fresh SOL.

### Leaving: `leave()`, 20% fee
```
value   = shares × treasury / total_shares
payout  = value × 80%
treasury     -= payout          (the 20% stays → remaining members' share price rises)
total_shares -= shares
```
- The payout is sent from the vault to the player on base. See §4, "Withdrawals while delegated".
- An eliminated member has value 0, so leaving gives them nothing. The time to flee is *before* the last territory falls.

### Switching: `switch(to_faction)`, 40% fee
```
value  = shares × A.treasury / A.total_shares
moved  = value × 60%
A.treasury -= moved;  A.total_shares -= shares          (40% stays in A)
B: mint moved × B.total_shares / B.treasury shares;  B.treasury += moved
```
- Switching happens entirely on the ER. No SOL moves, because one vault holds everything.
- The target must be alive and different from the current faction.
- The player's current allocation is cancelled.

### Per-epoch allocation
- Each member puts **their value** (or part of it) toward one of two options:
  - `Defend`: the default.
  - `Attack(target_territory)`: the target must be **adjacent** to a territory their faction owns. The Reach power ignores adjacency.
- Members can change their allocation any number of times before the epoch ends. ER transactions are free and take about 10 ms.

### Battle resolution at the end of an epoch
Every territory with at least one attacker resolves one battle:
```
D   = (owner.treasury − Σ owner attack allocs) / owner.territories × defense_mult + base_defense(epoch)
A_i = Σ attack allocations from faction i at this territory × attack_mult_i
total = D + Σ A_i
roll  = VRF u64 % total     → whichever bucket the roll lands in wins
```
- **Defender wins:** each attacker loses `k_loss` (e.g. 20%) of the strength it committed. That amount moves from the attacker's treasury to the defender's treasury as "spoils".
- **Attacker i wins:**
  - It gets the territory.
  - `loot = loser.treasury / loser.territories` moves from the loser's treasury to the attacker's.
  - If this was the loser's **last** territory, the attacker takes the **whole remaining treasury and all of the loser's powers**. The loser is eliminated.
- Rolls are probabilistic, so a weaker kingdom can still win sometimes. That keeps the game exciting, and it is the reason to use VRF.

### Elimination and the end of the game
- A faction with 0 territories is **eliminated**. Its treasury is 0, so its members' shares are worthless.
  They can only re-join an alive kingdom with new SOL.
- The game ends **only** when one faction owns all 6 territories. There is no turn limit.
- **Anti-stall:**
  - `base_defense(epoch)` decays every epoch ("the storm"), so defending gets weaker over time and attacking pays.
  - An empty kingdom, one with 0 members and 0 treasury, defends with `base_defense` only and falls quickly.
- **Edge case:** if every member leaves, the kingdom still owns its territories until someone takes them.

### Payout
- When the game ends, the winner's treasury equals the entire vault, minus payouts already made to leavers.
- Each winning member claims `shares × treasury / total_shares`.
- There is no protocol fee for now. `fee_bps` stays in the config, set to 0.
- **Invariant, checked in tests:** `Σ faction.treasury == vault lamports − rent − pending withdrawals`.

### Kingdom powers
Powers are stackable, and a conqueror inherits the loser's powers:

| # | Kingdom | Power | Effect |
|---|---|---|---|
| 0 | Hastinapur | **Kuru Fortress** | defense ×1.3 |
| 1 | Magadh | **Gaja Sena** (war elephants) | attack ×1.2 |
| 2 | Kalinga | **Samudra Vyapar** (sea trade) | +25% loot on wins |
| 3 | Takshashila | **Vidya Reach** | can attack non-adjacent territories |
| 4 | Vijayanagar | **Annapurna Harvest** | failed attacks lose only half of `k_loss` |
| 5 | Avanti | **Ratri Raid** (night raid) | the first attack each game gets ×1.5 |

### Adjacency graph
Territories are placed on the globe. The adjacency graph is a small fixed bitmask in the config. Proposal:
```
0 Hastinapur   (N. Europe)     ↔ 1, 2, 5
1 Magadh       (N. Africa)     ↔ 0, 2, 3
2 Kalinga      (S. America)    ↔ 0, 1, 4
3 Takshashila  (Asia)          ↔ 1, 4, 5
4 Vijayanagar  (Oceania)       ↔ 2, 3, 5
5 Avanti       (N. America)    ↔ 0, 3, 4
```

---

## 3. System overview

```
┌──────────────────────────── Next.js app (forked from chain-wars frontend) ───────────────────────────┐
│  Globe view (globe.gl)  ── click ──►  Kingdom Arena (react-three-fiber castle scene)                 │
│  Wallet adapter (Phantom/Backpack) · session key (gum-sdk) · zustand store fed by account subs       │
└───────┬────────────────────────────────────────────┬─────────────────────────────────────────────────┘
        │ base txs (join / delegate / claim)         │ ER txs (allocate, resolve) + websocket subs
        ▼                                            ▼
  Solana devnet  ◄──── commit / undelegate ────  MagicBlock Ephemeral Rollup (devnet-as.magicblock.app)
  - Vault PDA (SOL, never delegated)             - Game, Faction×6, Territory×6, Player×N  (delegated)
  - program `samrajya`                           - Crank: resolve_epoch every epoch_ms
                                                 - VRF oracle (ephemeral queue) → battle_callback
```

There is **no backend for the MVP**. All state lives in program accounts. The client subscribes to the ER over websocket.
Supabase chat and a leaderboard indexer from chain-wars can be added later if needed.

---

## 4. On-chain program `samrajya` (Anchor 1.0.2 + ephemeral-rollups-sdk)

Location: `programs/samrajya/` in this repo. Patterns are borrowed from `magicblock-engine-examples/`.

### Accounts (PDAs)

| Account | Seeds | Delegated? | Fields |
|---|---|---|---|
| `Game` | `["game", game_id]` | yes | authority, game_id, phase (Lobby/Active/Ended), epoch, epoch_ends_at, pending_vrf, config, base_defense, plains_defense, plains_pot, territory_owner[7] (255 = neutral), **factions[6] inline**, winner, battle_log ring buffer [16] |
| `Faction` (inline in Game) | — | (with Game) | treasury (accounting lamports), total_shares, members, territories, powers_mask, attack_alloc[7], alive, upgrades[2], upgraded_epoch |
| `Registry` | `["registry"]` | **never** | latest_game: the newest war, which the app shows |
| `Player` | `["player", game, wallet]` | yes, while playing | wallet, faction, shares, pending_deposit, pending_withdrawal, alloc_target, alloc_amount, alloc_epoch, status (Idle/Active/Left/Claimed) |
| `Vault` | `["vault", game]` | **never** (system account) | real SOL lamports |

Notes:
- There are only 6 factions, so they fit inside `Game` (about 1–2 KB). The game therefore has **one delegated game account**, plus one `Player` per user.
- This keeps the crank and VRF callback touching a single account.

### Layers: lobby on Solana, war on the ER, settlement on Solana (user, 2026-10-09)
```
LOBBY (Solana)       init_game ─► join + enlist (one tx; switch / leave + withdraw also on Solana)
      │              nothing is delegated yet
START (Solana)       start_game + delegate_game ─► delegate_player × every enlisted member (batches of 4)
      │              permissionless once the lobby timer is over and 2+ kingdoms have members
      ▼              (the keeper does it; the "Start the war" button too; the authority any time)
WAR (MagicBlock ER)  allocate / switch / upgrade / leave / resolve_epoch + VRF callback ...
      │              a mid-war joiner: base join + delegate_player (self) ─► ER enlist
      │              a mid-war leaver: ER leave + undelegate_player ─► base withdraw
      ▼  one kingdom holds every territory (phase Ended)
RETURN (ER → Solana) release_players × every member still delegated ─► end_game (commit + undelegate)
      ▼              permissionless (keeper, or the first claimer)
SETTLE (Solana)      claim: shares × winner.treasury / total_shares
```
- `delegate_player`: the player may always; anyone else only while the war is Active and only for an
  enlisted member with nothing waiting to be withdrawn. `delegate_game`: anyone once Active.
- `abort_game` (authority): ends a broken war with no winner (`winner = NEUTRAL`); after it is brought
  back, every member `claim`s their current value (+ any unenlisted ticket). `scripts/refund-aborted.ts`
  pushes those claims (claim is permissionless and always pays `player.wallet`).
- **Every transaction is visible:** the app's chain pill (`components/chain/ChainActivity.tsx`,
  `lib/chain/activity.ts`) shows where the war lives and lists every ER and Solana transaction that
  touches the Game (`onLogs(game)` on both layers + recent history), each linked to the explorer
  (ER links use the explorer's custom-RPC mode).
- Builders shared by the app, keeper and scripts: `app/lib/solana/lifecycle.ts` (copy in `scripts/client.ts`):
  `moveWarToER`, `bringWarToSolana`.

### Instructions

| Ix | Layer | Who | Purpose |
|---|---|---|---|
| `init_game(game_id, config)` | base | **anyone** | create Game + Vault, point the Registry at it. War N+1 only after war N is Ended and committed to base (§11.5) |
| `delegate_game` | base | the war's creator | delegate Game to ER |
| `start_game` | ER | creator any time; **anyone** once the lobby timer ran out and 2 kingdoms have members | Lobby → Active, set first `epoch_ends_at` |
| `join(amount)` | base | player wallet | `amount` must equal `config.ticket`; transfer SOL → Vault; create/reuse Player with `pending_deposit = amount`; fails while the Player is delegated |
| `upgrade(kind)` | ER | player or session | spend treasury on walls (0) or armory (1); the SOL goes to the plains pot (§11.3) |
| `delegate_player` | base | player wallet | delegate Player to ER (same tx as `join`) |
| `enlist(faction)` | ER | player or session | mint shares from `pending_deposit` into `faction` (must be alive), zero `pending_deposit` |
| `allocate(target, amount)` | ER | player **or session** (`#[session_auth_or]`) | set Defend / Attack(t); validate adjacency, alive, amount ≤ value |
| `switch_kingdom(to)` | ER | player or session | move 60% of value to faction `to` as new shares; 40% stays; cancel allocation |
| `leave` | ER | player or session | payout = 80% of value → `pending_withdrawal`; burn shares; 20% stays in treasury (free in Lobby). Send with `undelegate_player` in the same tx |
| `withdraw` | base | player wallet | pay `pending_withdrawal` from Vault (signer seeds); zero it |
| `resolve_epoch` | ER | anyone / crank (gated by `now >= epoch_ends_at && !pending_vrf`) | request VRF |
| `battle_callback(randomness)` | ER | VRF identity (`#[vrf_callback]`) | resolve battles, move treasury, territories and powers, write battle_log, eliminate, check win, advance epoch |
| `end_game` | ER (`#[commit]`) | anyone once phase = Ended | `commit_and_undelegate(Game)` |
| `undelegate_player` | ER (`#[commit]`) | player or session | `commit_and_undelegate(Player)`, after `leave` or after the game ends |
| `resolve_epoch_debug(randomness)` | any | authority | tests only; rejected unless built with `--features debug` |
| `claim` | base | winning player | pay `shares × treasury / total_shares` of the winner faction from Vault; mark Claimed |

### How allocations are tallied
Iterating N Player accounts inside the crank is too expensive, so `allocate` updates the faction aggregates
**incrementally**.
- It subtracts the player's old allocation from `factions[f].attack_alloc[t]` (only if `alloc_epoch == epoch`) and adds the new one.
- When an epoch rolls over, `battle_callback` resets every `attack_alloc` to 0, so everyone defends by default.
- A stale player allocation is ignored because `alloc_epoch != epoch`.
- Defense uses everything not committed to attacks: `defend = treasury − Σ attack_alloc`.

**Over-commit after value drops.** A player's value can fall during an epoch, for example when they switch or another territory is lost.
`allocate` caps the amount at the current value. `battle_callback` caps each faction's total attack at its treasury.

### SOL handling and withdrawals while delegated
- SOL **never moves on the ER**. The Vault is a base-layer system account and is never delegated.
- On the ER, `treasury` is only an accounting number.
- **Mid-game exits** work because `leave` writes `pending_withdrawal` into the Player account and then **commits and undelegates only that Player**.
  Once it is back on base, `withdraw` reads the committed value and pays from the Vault.
  This only uses patterns proven in the examples: commit/undelegate from `counter`, and vault payouts with signer seeds from `rock-paper-scissor`.
- **Alternative to evaluate later:** post-commit base-layer actions (`magic-actions` example, `rewards-delegated-vrf::schedule_transfer_action`) could pay out in a single step.
- **MVP limitation:** you can't top up while your Player is delegated. To add more SOL you would have to leave and re-join.
  - Stretch fix: a per-deposit `Ticket` PDA (`["ticket", game, wallet, n]`), created and delegated on base and consumed by `enlist` on the ER.

### Crank and VRF flow
1. `start_game` schedules a crank: `ScheduleCrankCpi { execution_interval_millis: epoch_ms, iterations: <large, e.g. 10_000>, ix: resolve_epoch }`.
   There's no turn limit, so if the iterations run out, re-schedule from `battle_callback` or rely on the keeper.
2. `resolve_epoch` checks `now >= epoch_ends_at`, sets `pending_vrf = true`, and requests randomness.
3. `battle_callback` derives one sub-roll per contested territory from `randomness`: `hash(randomness ‖ territory_idx)`.
4. The callback resolves the battles and sets `epoch += 1, epoch_ends_at = now + epoch_ms`.
5. If the crank is unreliable, the frontend or any player can call `resolve_epoch` directly, since it's permissionless.

### Session keys
- The player creates a `SessionTokenV2` in the pledge tx. It is valid for 7 days (the session-keys program's maximum).
- `enlist`, `allocate`, `switch_kingdom`, `leave` and `undelegate_player` accept the session signer, so there are **no wallet popups during play**.
- **User rule (2026-10-09): once the war starts, nothing asks for the wallet until you leave or claim.** In-war moves never fall back to the wallet: if this browser has no session (another browser, cleared storage, expired), the first move creates a new one with one popup (`ensureSession` in `chain-actions.ts`). Background calls (the bell fallback) only run with a session and never prompt. Game and Player stay delegated on the ER for the whole war; only `withdraw` / `claim` touch base. Verified on devnet with `app/scripts/smoke-actions.ts`.
- Funds always go to `player.wallet`, never to the session signer. That's why letting the session key call `leave` is safe.

### Crate versions (from the examples)
- `anchor-lang = "1.0.2"` (with `init-if-needed`)
- `ephemeral-rollups-sdk = 0.16.2`, features `anchor` and `vrf`
- `session-keys = 3.1.1`, feature `no-entrypoint`
- ⚠ The crank needs the SDK git rev `0fc4604157de51df28693e02e5a1a6a4a08c8a03` with feature `crank`. Check that `vrf` still compiles on that rev.
  If it doesn't, drive `resolve_epoch` from the client or a tiny keeper script instead, since it's permissionless.

### Example files to copy from
| Need | File |
|---|---|
| delegate / commit / undelegate | `magicblock-engine-examples/counter/anchor/programs/public-counter/src/lib.rs` |
| multi-account game + SOL vault + claim | `magicblock-engine-examples/rock-paper-scissor/anchor/` |
| session keys (program + React) | `magicblock-engine-examples/session-keys/anchor/` |
| VRF on ER | `magicblock-engine-examples/roll-dice/anchor/programs/roll-dice-delegated/src/lib.rs` |
| crank | `magicblock-engine-examples/crank-counter/anchor/programs/crank-counter/src/lib.rs` |
| local stack scripts | `magicblock-engine-examples/scripts/local-env.sh`, `test-locally.sh` (`mb-stack`) |

---

## 5. Frontend

The frontend is based on `~/codes/job/rugrumble/chain-wars/packages/frontend` (Next.js 15, React 19, Tailwind v4, shadcn).

### Plan
- Copy it into `app/` in this repo; don't edit chain-wars in place.
- Strip the EVM and economy parts:
  - **Remove:** wagmi, RainbowKit, SIWE, Surge relayer hooks, bonding, swap, deposit and withdraw, `lib/hooks/contracts/*`, `contract-data/*`, `socket/*`, `shared/` chain configs.
  - **Keep:** `components/ui/*` (incl. `globe.tsx`), `territories/*` layout, `leaderboard`, `team-win/*`, modals, toasts, tour, loaders, `app-background`, `countdown-timer`, theme tokens in `app/globals.css`, fonts.

### New pieces
| Piece | Details |
|---|---|
| Wallet | `@solana/wallet-adapter-react` + `-react-ui` (Phantom, Backpack, Solflare) |
| Program client | `@coral-xyz/anchor` 0.32.1 IDL client. `lib/solana/connections.ts` holds the base connection (`https://api.devnet.solana.com` or `rpc.magicblock.app/devnet`) and the ER connection (`https://devnet-as.magicblock.app`, ws same host). |
| Live state | `onAccountChange(gamePda, ..., 'processed')` on the ER feeds a **zustand** store, `useGame()`. The Game account holds everything, so one subscription is enough for the whole UI. |
| Session keys | `@magicblock-labs/gum-sdk` `SessionTokenManager`, created after join |
| Globe | Reuse `globe.tsx`. Feed it 6 points: `{lat, lng, color: faction color, label}`. Use the **arcsData** support (already there, unused) to draw live attack arcs from the current epoch's allocations, plus a flash or ring burst on battle results from `battle_log`. |

### Kingdom Arena
This is the new view, `components/arena/*`, built with `@react-three/fiber` (upgrade from 9.0.0-alpha to stable) and `@react-three/drei`.
- **Scene:** an island or plateau with a castle in the centre and walls whose height scales with defense strength.
- **Banners:** flags in the faction colour, one per owned territory.
- **Troops:** an instanced mesh whose count is `log(strength)`.
- **Assets:** CC0 low-poly kits, e.g. Kenney "Castle Kit" or Quaternius medieval packs, loaded with `useGLTF`.
- **Incoming attacks:** enemy banners and army columns approach from the edges, sized by `attack_alloc[target]`. Arrows show the direction (which neighbour is attacking).
- **Battle animation:** when `battle_log` gets an entry for this territory, play a catapult and fire burst, then show "HELD" or "FALLEN". Driven by framer-motion and drei `<Float>`/particles.
- **HUD overlay** (reuse the territory.tsx layout):
  - power and treasury
  - the members list
  - an allocation slider and target buttons (Defend / Attack X)
  - the epoch countdown
- The Attack and Defend buttons send ER txs with the session key, so there are no popups.

### Routes
| Route | Content |
|---|---|
| `/` | globe, leaderboard and epoch timer |
| `/kingdom/[id]` | Arena |
| `/claim` | claim screen |

---

## 6. Repo layout (target)

```
v9-blitz/
  CLAUDE.md                 ← session memory/status (keep updated)
  docs/ARCHITECTURE.md      ← this file
  docs/PROGRESS.md          ← task checklist
  programs/samrajya/        ← Anchor program (Anchor workspace at repo root)
  tests/samrajya.ts         ← ts-mocha tests (local mb-stack + devnet)
  app/                      ← Next.js frontend (forked from chain-wars)
  scripts/keeper.ts         ← optional fallback cranker
  magicblock-engine-examples/  ← reference only, don't modify
```

---

## 7. Why this is a good fit for MagicBlock (pitch angles)
- **Real-time strategy on-chain:** reallocating troops is free and takes about 10 ms on the ER, so players can feint and switch targets until the bell.
- **Provably fair battles:** each battle's outcome uses MagicBlock VRF, weighted by power.
- **Autonomous game clock:** an ER crank drives the epochs, so no server is needed.
- **No popups:** session keys sign the in-game moves.
- **Settlement on Solana:** the pot sits in a base-layer vault and the winners claim trustlessly.

---

## 8. Risks / open items
- **Crank and VRF on one SDK version.** Does the crank SDK rev also compile with VRF? See §4. The fallback is a permissionless resolve called by the client or keeper.
- **VRF callback compute budget with 6 battles.** It should be fine, since it's pure arithmetic on one account.
- **Clock on the ER.** Use `Clock::get()?.unix_timestamp`, or slot-based deadlines if the ER clock is coarse. Verify in tests.
- **Join/leave/switch during `pending_vrf`.**
  - Block `switch` and `leave` while `pending_vrf` is true. Otherwise players could dodge a battle they can see coming, since allocations are public.
  - Optionally also block them in the last ~5 s of an epoch. The 20% and 40% fees already make dodging expensive.
- **No turn limit means a game could run long.**
  - The base-defense decay ("storm") forces attacks.
  - For demos, use short epochs (15–30 s) and a high decay rate.
- **Rounding.** Use u128 math for share conversions, with remainders staying in the treasury. Assert the treasury invariant in tests.
- **Withdrawal latency.** `leave` → commit → `withdraw` takes a few seconds. The UI shows "Leaving the realm…" until the base withdraw confirms.
- **Assets.** Use CC0 3D models only.

## 9. Decisions log
| Date | Decision |
|---|---|
| 2026-10-07 | Name **Samrajya** |
| 2026-10-07 | SOL only |
| 2026-10-07 | Conquered kingdom's treasury goes to the conqueror; its members' shares become worthless. Players may **leave any time with a 20% fee**. |
| 2026-10-07 | **Switch kingdom with a 40% fee** |
| 2026-10-07 | Leave and switch fees **stay in the treasury of the kingdom being left** |
| 2026-10-07 | **No turn limit.** The game ends only when one kingdom holds every territory. |
| 2026-10-07 | Indian kingdom names: Hastinapur, Magadh, Kalinga, Takshashila, Vijayanagar, Avanti |
| 2026-10-09 | **Anyone can start a new war** with one button once the last one has ended (§11.5) |
| 2026-10-09 | **Central plains (Kurukshetra)**: neutral 7th territory bordering every kingdom; pays its holder the plains pot; you must hold it to win (§11.1) |
| 2026-10-09 | **Fixed ticket, equal split**: everyone enters with the same amount and every member owns an equal share (§11.2) |
| 2026-10-09 | **Upgrades** bought by any member with kingdom treasury; **+15% attack and defense per territory held** beyond the first (§11.3–11.4) |

### Still open (defaults in use)
- **Epoch length:** 60 s, or 20 s for demos.
- **min_stake:** 0.05 SOL.
- **k_loss:** 20%.
- **Storm decay:** −5% base defense per epoch.
- **Globe placement:** the kingdoms are spread around the world for visual balance; they are not at their real Indian locations.

---

## 10. The tactical layer: warriors, forts and the war council (decided 2026-10-08)

The allocation economy of §2 stays. On top of it every member now commands **one warrior (sainik)** that
physically stands somewhere, and *where everyone stands at the bell* changes the odds. The user's
brief: a kingdom's members plan privately, split into attackers and defenders, move their warriors
(left, right, into the fort), pick equipment, and an abandoned fort is taken without a fight.

Decisions (2026-10-08): warrior movement lives **on the ER, per player** (not client-only); battles
stay **hybrid** (tactics scale the strengths, the VRF still rolls, an abandoned fort is captured
outright); kingdom chat is **Supabase Realtime, wallet-gated** (the one backend piece); build order is
**mock mode first, then the program**.

### 10.1 Units
`Player.unit` (TS mirror: `app/lib/game/units.ts`):

| field | type | meaning |
|---|---|---|
| `at` | u8 | territory the warrior stands in |
| `x`, `z` | i16 (×100) | position in that realm's coordinates (keep at the origin, hex wall at `WALL_RADIUS` 2.55, gate mid-edge at +z, island edge ≈ 6.5) |
| `facing` | u8 | 0..255 → radians |
| `action` | u8 | Idle / Walk / Run / Attack / Block / Climb / Dead |
| `role` | u8 | Garrison / Vanguard / Flank / Rear |
| `gear` | u8 | Talwar / Bhala / Dhanush / Dhal / Seedhi / Gaja (Gaja needs the Gaja Sena power) |
| `hp` | u8 | 0..100; −35 for losing defenders, −25 for losing attackers, +10 for winners, +5 per epoch |
| `march_to`, `march_from`, `march_start`, `march_at` | u8, u8, i64, i64 | on the road to a neighbouring realm (`MARCH_SECS` = 8) |
| `dead_until` | i64 | fell in combat (§10.7): respawns at home at this time; 0 = alive |
| `ready_at` | i64 (ms) | next strike allowed (weapon cooldown) |

A warrior spawns in the courtyard on `enlist`, is removed on `leave`, changes colour on `switch`,
and is wiped when its kingdom is eliminated.

### 10.2 Movement rules (identical in the client sim and the program)
- The client walks at 60 Hz and publishes `move_unit(x, z, facing, action)` at ≤ 10 Hz (session key,
  no popup). The program re-validates the step: max step length, the island edge, and the wall.
- **Walls** block. The **gate** (the gap in the +z edge) opens for the owner's members always, and for
  enemies **only when no owner warrior is inside the walls**. A **Seedhi (ladder)** climbs the wall
  anywhere at climb speed.
- `march(to)`: `to` must be adjacent to `at` (any realm with Vidya Reach). The warrior leaves through
  the gate road and arrives at the destination's edge facing the realm it came from.

### 10.3 Tactics → odds (`app/lib/game/tactics.ts`)
Only warriors **present** in the territory count (not marching, hp > 0). Each contributes a weight
(base 1.0) by zone, role and gear, e.g. a defender outside the walls counts 0.45, a Dhal inside ×1.25,
a Vanguard at the gate ×1.1, a Bhala at the gate ×1.15, a Seedhi already inside ×1.3, a Gaja at the
gate ×1.4, a Dhanush ×1.2 on the walls / ×1.1 from the rear. Wounds halve the weight at 0 hp.

```
share       = min(1.5, Σ weight / members)
defence'    = defence × (0.35 + 0.65 × share_garrison_inside)
attack_i'   = attack_i × (0.25 + 0.75 × share_present_i)
ABANDONED   : no defender inside the walls AND an attacker (who allocated) stands at the gate or inside
              → that attacker takes the territory with no roll (`BattleEntry.captured = true`, roll 0).
```
Loot, spoils, `k_loss`, elimination and powers are unchanged. On-chain the per-territory numbers come
from `Game.presence[t][f]` (u16, weights ×100) maintained incrementally by `move_unit` / `march` /
`set_role` / `set_gear`, exactly like `attack_alloc`, so `battle_callback` never iterates players.

### 10.4 Instructions to add (Step 17 of the implementation guide)
| Ix | Layer | Who | Purpose |
|---|---|---|---|
| `move_unit(x, z, facing, action)` | ER | player or session | validated step; updates `presence` |
| `set_role(role)` / `set_gear(gear)` | ER | player or session | gear checked against the kingdom's powers |
| `march(to)` | ER | player or session | leave for a neighbour; `settle` happens lazily on the next move / in the callback |
| `strike(x, z, facing)` | ER | player or session | §10.7: sync the step, check the cooldown, wound up to `cleave` enemies in reach (or the gate); kills set `dead_until` and drop `presence` |
| `respawn()` | ER | anyone (crank / next move) | lazily brings a warrior back at home once `dead_until` passed |
| `battle_callback` | ER | VRF | reads `presence`, applies §10.3 before the roll; applies wounds/routs via `presence` resets |

### 10.5 Private planning: the war council and kingdom chat
- **War council** (HUD): your kingdom's warriors only — where each stands, role, gear, hp, marching
  orders — and the derived plan ("4 hold Hastinapur, 5 on Kalinga", "nobody inside Kalinga's walls").
  It is computed client-side from public unit positions, so the *board* is private only by UI; the
  *chat* is private for real.
- **Kingdom chat:** Supabase Realtime private channel `samrajya:<game>:<faction>`. A Next.js route
  handler (`app/app/api/chat/token/route.ts`) verifies a wallet signature plus the Player PDA on the ER
  and mints a 2 h JWT with `samrajya: { game, faction }`; RLS on `realtime.messages`
  (`app/supabase/chat.sql`) only lets that claim join that topic. Mock mode keeps rooms in memory.
- **Shared battlefield (2026-10-09, until Step 17):** every member's warrior travels over one more
  Realtime channel per war, `samrajya:<game>:field` (any member of that war; same JWT, same RLS
  function). `lib/multiplayer/field.ts`: `unit` ~6 Hz while it changes + a 2 s heartbeat, `strike`
  (everyone animates it; the target's browser runs `resolveStrike` and applies the wound), `hurt`,
  `bye`; remote warriors drop after 12 s of silence. Each browser is authoritative for its own
  warrior only (trust-based); the program takes over with `move_unit` / `strike` on the ER.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`.

### 10.6 Decisions log (2026-10-08)
| Decision | Choice |
|---|---|
| Where movement lives | ER, per player, 10 Hz via session key |
| Battle resolution | Hybrid: tactics scale strengths, VRF rolls, abandoned fort captured outright |
| Private chat | Supabase Realtime with a membership-gated JWT (minimal backend) |
| Build order | Mock first (done 2026-10-08), then the program (Step 17) |
| Fort lock and moves (2026-10-09) | Enemies can't enter while one defender lives (no ladders / battering); blades meet in the gate gap, arrows arc over walls; combo / heavy / dodge / guard / stamina with hitstop, knockback, camera punch, slow-mo (§10.10) |
| Layers (2026-10-09) | Lobby on Solana; starting the war delegates the Game and every member to the ER; the war ends by committing and undelegating everything back to Solana; every tx shown in the app |
| Battle resolution (2026-10-09, replaces the hybrid for walled realms) | The hand fight alone: cleared fort + attacker at the gate → captured, else held; the fallen stay down until the bell; plains keep the VRF (§10.8) |
| Hands-on play (later 2026-10-08) | Mouse + keyboard control, real hits with the six weapons, gates that can be battered down, death and respawn, rally pings; warriors stay player-controlled through the bell (no scripted battle) |

### 10.7 Combat (decided 2026-10-08, `app/lib/game/combat.ts`)
The user's brief: players move their warrior by hand, attack or defend with different weapons, and
plan in chat; nothing should play itself. So the fight before the bell is real:

| gear | reach | damage | cooldown | cleave | gate dmg | blocking takes |
|---|---|---|---|---|---|---|
| Talwar (sword) | 0.62 | 16 | 0.6 s | 2 (70° arc) | 14 | 50% |
| Bhala (spear) | 0.95 | 14 | 0.75 s | 1 (28°) | 10 | 55% |
| Dhanush (bow) | 4.2 line | 10 (×1.4 from your own walls) | 1.1 s | first in line | 0 | 65% |
| Dhal (shield) | 0.5 | 7 | 0.7 s | 1 | 8 | **15%** |
| Seedhi (ladder) | 0.6 | 8 | 0.8 s | 1 | 10 | 60% |
| Gaja (elephant) | 0.95 | 24 | 1.4 s | 4 (75°) | **60** | 40% |

- Only enemies in the same realm, alive and not marching, are hit; strikes and arrows don't pass
  through the curtain wall (standing on the wall walk shoots over it).
- Blocking (`action = Block`, facing within 80° of the attacker) cuts damage to the target's
  "blocking takes" share. Defenders inside their own walls take ×0.85.
- **0 hp = fallen:** the warrior drops, stops counting for §10.3 (so killing the garrison can make
  a fort *abandoned*) and respawns in the kingdom's capital (or first territory) with 70 hp once the
  bell has been decided (at least `RESPAWN_SECS` = 10; §10.8). Battle wounds (−35 / −25) still apply only to the living.
- **Gates:** each realm's gate has `GATE_HP` = 400. Enemies standing at it (within 0.75 of the gate
  centre, facing it) batter it when their swing hits nobody. At 0 the gate is **broken**: it lets
  everyone in, even with a garrison inside. Every bell repairs all gates. On-chain: `Game.gates[6]` (u16).
- **Rally pings:** `G` posts "📍 Attack/Defend the gate of X" with coordinates to the kingdom chat;
  members see a beacon there for 25 s. In the mock, bots of that kingdom in that realm walk to it.
- Bots (mock) fight whoever comes within 2.2 (3.8 with a bow), batter gates when they stand at
  one, and swing 1.5–2.1× slower than the cooldown so a human can win a fair duel.

### 10.11 Empty forts fall at once; war music only in a fight (user, 2026-10-09)
- **`seize(x, z)`:** an attacker with an order on realm `t` who walks inside its walls while no member
  of the owner stands alive there takes it immediately (no bell). Remaining accounts: every Player with
  shares (the owner's checked complete, none alive in `t`). `math::seize` resolves that realm like a bell
  battle (loot, losses, elimination, conquest bonus), zeroes its attack allocations, and ends the war if
  one kingdom now holds everything; the epoch does not move. A kingdom with no members needs no muster.
  The HUD sends it the moment your warrior is inside such a fort; the mock does it on its tick.
- **Kurukshetra is fought by hand too (user, 2026-10-09):** attacking it teleports the squad to the
  plains (`/kingdom/6`, `PlainsScene`: the island with no fort, a ring of standing stones, the holder's
  banner). No walls there (`MoveRules.open`, no wall checks in strikes). The holder keeps it while one
  of its members stands alive on the plains; then attackers in the stone circle (radius 1.5) take it at
  once (`seize`) or at the bell (most warriors in the circle). The VRF is no longer used anywhere.
- **Music:** "Five Armies" (Kevin MacLeod, CC BY 4.0) is the war theme, opened by a war horn; no
  melody between fights (the user disliked the calm loop).
- **Music (earlier):** the battle loop plays only while blows are struck in the realm on screen (swings, hits,
  arrows, kills) and returns to the peace loop 6 s after the last one; the bell's verdict keeps its sting.

### 10.10 The fort lock and real fights (user, 2026-10-09)
The user: "no fight is happening between the sprites… the outside attacker can't enter the house of
the kingdom while a single person is alive; same kingdom members do whatever they want… make it
feel like a real fight, take inspiration from other games." War 6's ER log showed the fights did
reach the chain (20 strikes, 8 hits, a kill) but did not read as fights.
**Rules**
- **Locked fort:** while one living member of the owner stands in that realm, enemies cannot pass its
  walls or gate (no ladders, no battering; `gateOpenFor` / `moveRulesFor`). Kill them all and the gate
  opens. Gate hit points are gone (`BATTER_GATES = false`; the program no longer batters).
- **How a garrison dies:** blades meet through the gate gap (a line through the opening is not stone),
  and arrows arc over the walls in both directions. Bot defenders hold the gate mouth when enemies
  gather at it.
- **The bell:** a fort falls only when no member of the owner is alive anywhere in the realm and a
  committed attacker holds the gate (`decide_forts`, `tacticalFactors`). On-chain guard: an enemy
  inside the walls who still finds a living defender to strike is refused (they could only be there by
  cheating); movement through walls is still client-enforced.
**Moves** (For Honor / Souls / Hades inspired; `combat.ts`, `field.rs`)
- Light blows (Space) chain a 3-hit combo: slash, backhand, spinning finisher (bigger knockback).
- Heavy blow (hold E ≥ 0.45 s, release): ×1.8, breaks a raised guard, costs two of the second's
  strikes; the wind-up is broadcast (`ACTION.CHARGE`) and drawn as a growing burning ring.
- Dodge roll (Q): a 1.35-unit dash with ~0.4 s invulnerability (`ACTION.DODGE`; on-chain once per 2 s,
  untouchable that second via `Unit.dodge_at`).
- Guard (F) blocks light blows; blows on the guard cost stamina; at 0 the guard breaks for 1.5 s.
- Stamina (client): rolls 35, heavy 30, blocked blow 18, regen 28/s. Aim assist snaps a blow to the
  enemy in reach and in front (±80°).
**Feel** (game-feel research: hitstop + knockback + shake + particles + sound on the same frame,
scaled by the blow; telegraphed attacks; input buffering)
- Hitstop freezes both fighters 45–220 ms; knockback shoves the target (your own warrior for real);
  shake and a camera punch scale with the blow; a kill you are in gets 0.55 s of slow motion; bigger
  "CRUSH" / "×3" numbers; the KayKit Knight's unused clips (horizontal slice, stab, 2H spin, four
  dodge rolls, second hit and death) now play; warriors are drawn 1.3× so a fight reads next to the fort.

### 10.9 Warriors on the ER (built 2026-10-09, `programs/samrajya/src/field.rs`)
The user saw Magadh fall to a dice roll while both sides' warriors were only in their browsers. Now
the program referees the fight:
- `Player.unit` (`Unit`): at, x/z ×100, facing vector ×100, action, gear, role, hp, strikes counter,
  dead_until, moved_at, strike rate limit. Spawned on `enlist` / `switch_kingdom`, cleared on `leave`.
- `move_unit(at, x, z, fx, fz, action, gear, role)` (session key, ~5 Hz from the client): speed cap
  4.2/s with slack, island edge; `at` changing = teleport (a realm the kingdom holds, or the ordered
  target); a warrior left in a realm its kingdom doesn't hold without an order is pulled home; a fallen
  one rises at home on its first move after `dead_until` (not while the bell is pending). Walls are not
  enforced on-chain yet (the client walks round them).
- `strike(x, z, fx, fz)` + the Players in reach as remaining accounts: syncs the position, rate-limits
  by weapon (2 or 1 blows per second), and applies `resolveStrike`'s rules in integers: reach (+0.15
  latency slack), arc, cleave, arrows down the line, walls block, blocking, inside-walls defence, archer
  wall bonus; a kill sets `dead_until = max(bell, now + 10)`. A blow that hits nobody at the gate
  batters `Game.gates[t]` (400, repaired at every bell).
- `allocate` teleports the warrior (target's camp / home on Defend).
- **The bell** (`resolve_epoch`) takes every Player with shares as remaining accounts and checks the
  muster is complete per kingdom (`IncompleteMuster`), then `decide_forts`: no living defender inside
  and an attacker at the gate or inside → captured (most warriors there), else held. Fort battles have
  no roll (`BattleEntry.by_fight`); if only forts are contested the bell resolves at once, and the VRF is
  only requested for the plains. Limit: ~25 members per war (transaction size).
- Client: `lib/chain/warriors.ts` subscribes every Player on the ER (gPA every 5 s + one websocket per
  account) and turns changes into swings (strike counter), hits / kills (hp) and gate events; moves and
  strikes are fire-and-forget ER txs with the session key; Supabase's field channel only runs in the lobby.

### 10.8 Squad assaults: teleport to the gate (decided 2026-10-09)
The user's brief: members agree in the kingdom chat which kingdom to hit; the ones who commit are
teleported to that kingdom and fight it out there; win and the kingdom is theirs, lose and it isn't.
- **Commit = teleport.** An `allocate(target, amount)` on a walled realm puts your warrior at the
  **assault camp** just outside its gate (`campPoint`, spread by wallet so the squad stands together).
  No road, no `MARCH_SECS`. The **squad** is every member of your kingdom with an order on that target
  this epoch; the War room shows how many.
- **Defend** (or an order on the open plains, which has no realm yet) brings the warrior home if it is away.
- **Fight there by hand** (§10.7): batter the gate, kill or drive out the garrison.
- **Only the hand fight decides a walled realm (user, 2026-10-09). No dice.** At the bell: if no living
  defender stands inside the walls and a committed attacker stands at the gate or inside, the attackers
  **capture** it (several attacking kingdoms → the strongest presence); otherwise the defender **holds**.
  `BattleEntry.byFight = true`, `roll = 0`. Loot, `k_loss`, elimination and powers are unchanged (§2).
  The open plains have no walls, so committed strength + the VRF still decide them.
- **The fallen stay down until the bell** (at least `RESPAWN_SECS`), then rise at home. Otherwise a fort
  could never be cleared: its garrison would respawn inside it every 10 s.
- Mock balance (bots, `mockGame.test.ts`): with 60 s epochs about 1 assault in 8 clears a fort; with
  15 s epochs almost none (too short for a siege). Bots keep ≥ 30% of their kingdom home: at 50% no fort
  ever fell, all-in left home empty. Open: the storm (§2) only decays dice defence, so fight-only wars
  between two well-defended kingdoms can stall. Needs a fight-mode anti-stall (e.g. gates that come back
  weaker each epoch as the war drags on).
- **After the bell** the winners garrison the conquered realm; a beaten squad and routed defenders are
  teleported home.
- The Sainik panel's march buttons teleport too (a held realm → its courtyard; an enemy one → the camp).
- Program (Step 17): `allocate` sets `Player.unit.at` / position and `presence`; `battle_callback`
  decides walled realms from `presence` / `inside` without the VRF, sends losers home and raises the
  fallen. Until then the viewer's warrior is moved locally after a confirmed `allocate`, and **on devnet
  the program still rolls the VRF** (the HUD shows dice odds there; fight wording only where warriors are
  tracked: mock now, devnet after Step 17).

---

## 11. The plains, equal tickets, upgrades and new wars (decided 2026-10-09)

The user asked for: a way to start a new game after one ends; open ground in the middle of the kingdoms; everyone entering
with the same amount and sharing the revenue equally; spending treasury to grow stronger; and conquerors hitting harder
with the same army. All numbers are in `GameConfig` (defaults in `GameConfig::default_with`, `DEFAULT_CONFIG` in
`app/lib/game/math.ts` and `gameConfig()` in `scripts/client.ts`).

### 11.1 Kurukshetra, the central plains
- Territory **6** (`PLAINS`). There are now 7 territories and still 6 kingdoms. `territory_owner[6]` starts as `NEUTRAL` (255).
- It borders every homeland and every homeland borders it (bit 6 in each adjacency mask, `0b0111111` for the plains). Holding it lets a kingdom reach every homeland.
- While neutral it defends with `plains_defense` (config, default 3× base defense), which decays with the storm like `base_defense`. Taking it moves no loot: the kingdom just gains a territory.
- **The plains pot.** It is filled by:
  - the **plains tax**: `plains_tax_bps` (10%) of every battle's spoils;
  - **upgrade spending** (§11.3);
  - the k_loss of attacks that fail against the neutral garrison.
  At the end of every epoch (`advance_epoch`) the pot is paid to the holder's treasury. While nobody holds it, it accumulates.
- The game ends only when one kingdom holds all 7 territories, so the winner must take the plains too.
- Once held, the plains are an ordinary territory (loot = treasury / territories, counts towards elimination). A kingdom that holds only the plains is still alive.
- The plains have **no fort and no warriors**: battles there are decided by allocations alone (`tacticalFactors` returns neutral factors, `marchTargets` excludes it). On the world map it is the central island (standing stones and the holder's banner); there is no realm page for it yet.
- Invariant: `Σ faction.treasury + plains_pot == vault − rent − pending withdrawals` (checked by the Rust simulation and the mock tests).

### 11.2 Fixed ticket, equal split
- `config.ticket` replaces `min_stake`. `join` requires `amount == ticket` and an empty `pending_deposit`. There is no top-up.
- Every member holds exactly `SHARES_PER_MEMBER` shares, so `value = treasury / members` is the same for everyone in a kingdom, whenever they joined. Conquest, fees and losses move everyone's value together.
- Leave (−20%), switch (−40%) and claim keep their formulas. A switcher gets one equal share in the new kingdom.
- Claim: each winning member gets `treasury / remaining members`; the last claimant gets the rounding dust.

### 11.3 Upgrades
- `Faction.upgrades[kind]`: 0 = **walls** (defense), 1 = **armory** (attack), each up to level 3.
- `upgrade(kind)` (ER, any live member, session key): level `n → n+1` costs `(n+1) × upgrade_cost_bps` (5%) of the current treasury. Each level adds `upgrade_bonus_bps` (+15%) to that side.
- One purchase per kingdom per epoch (`upgraded_epoch`). Only while Active and no VRF is pending.
- The SOL goes to the plains pot, so value is conserved. An eliminated kingdom's upgrades are lost (not inherited).

### 11.4 Conquest might
- `conquest_bps = 1 + conquest_bonus_bps × (territories − 1)`: +15% per territory held beyond the first, the plains included.
- Applied to both attack and defense, after the powers and the upgrades:
  ```
  A = committed × gaja × ratri × armory × conquest
  D = (free / territories) × kuru × walls × conquest + base_defense
  ```
  The same army therefore hits harder once a kingdom has conquered something.

### 11.5 New wars and the registry
- `Registry` PDA `["registry"]` (base, never delegated) holds `latest_game`. The app reads it and follows the newest war automatically (`subscribeER` polls it every 5 s).
- `init_game` is permissionless:
  - Before any registry exists, any unused id works.
  - Otherwise `game_id` must be `latest + 1`, and the previous Game must be passed in, be **owned by the program** (committed back by `end_game`) and be in phase **Ended**.
  - So nobody can pull players away from a war in progress, and wars are sequential per program deployment.
- **"Start a new war"** (world header, victory modal, realm header once Ended): `end_game` on the ER if the last war is still delegated, then `init_game(latest + 1)` + `delegate_game` in one base tx. The opener pays rent (~0.012 SOL) and becomes that war's authority. New wars from the app use 90 s epochs and a 120 s lobby.
- **Lobby:** `epoch_ends_at` holds the lobby deadline. `start_game` is open to anyone once it has passed and at least two kingdoms have members; the creator can start any time. The keeper also starts ready lobbies and commits ended wars.
- Session keys are per program + wallet, so one session works across wars.
