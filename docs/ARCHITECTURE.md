# Samrajya — Architecture (MagicBlock Blitz)

**Samrajya** (साम्राज्य, "empire") is a royal war for the globe. Written 2026-10-07; economy rules updated 2026-10-07.
This doc is the source of truth for design decisions. Update it when a decision changes.

---

## 1. The game in one paragraph

A 3D globe shows **6 kingdoms** (territories), and each kingdom starts with a unique **power**.
- **Joining:** you stake **SOL** to join a kingdom and receive **shares** of its treasury.
- **Strength:** the kingdom's treasury is also its army strength.
- **Epochs:** the game runs in short epochs (e.g. 60 s). In each one, members put their strength toward **defending** home or **attacking** a neighbour.
- **Battles:** each attacked territory fights at the end of the epoch, and **VRF randomness weighted by power** picks the winner.
  - A winning attacker takes the territory, **a share of the loser's treasury** and its power. That raises the value of every share the winners hold.
  - The loser's shares lose value.
- **Leaving and switching:** you can **leave at any time** with your share minus a **20% fee**, or **switch kingdom** for a **40% fee**. Both fees stay in the treasury of the kingdom you left.
- **Elimination:** a kingdom that loses its last territory is eliminated. Its remaining treasury goes to the conqueror, and its members' shares are worth 0.
- **The end:** the game continues **until one kingdom owns every territory**. That kingdom's members then split the entire pot by shares.

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
| `Game` | `["game", game_id]` | yes | authority, game_id, phase (Lobby/Active/Ended), epoch, epoch_ends_at, pending_vrf, config, territory_owner[6], **factions[6] inline**, winner, battle_log ring buffer [16] |
| `Faction` (inline in Game) | — | (with Game) | treasury (accounting lamports), total_shares, members, territories, powers_mask, attack_alloc[6], alive |
| `Player` | `["player", game, wallet]` | yes, while playing | wallet, faction, shares, pending_deposit, pending_withdrawal, alloc_target, alloc_amount, alloc_epoch, status (Idle/Active/Left/Claimed) |
| `Vault` | `["vault", game]` | **never** (system account) | real SOL lamports |

Notes:
- There are only 6 factions, so they fit inside `Game` (about 1–2 KB). The game therefore has **one delegated game account**, plus one `Player` per user.
- This keeps the crank and VRF callback touching a single account.

### Player lifecycle
```
           base                       ER                                  base
join ──► Player{pending_deposit} ─► delegate ─► enlist (mint shares) ─► play: allocate / switch ...
                                                       │
                                     leave ────────────┤  payout = 80% value → pending_withdrawal,
                                                       │  shares=0, commit_and_undelegate(Player)
                                                       ▼
                                                 withdraw (base): Vault → wallet, pending_withdrawal=0
                                                 (Player is back on base → can join again)
game Ended ─► end_game + undelegate_player (ER) ─► claim (base: shares × winner.treasury / total_shares)
```

### Instructions

| Ix | Layer | Who | Purpose |
|---|---|---|---|
| `init_game(config)` | base | admin | create Game + Vault |
| `delegate_game` | base | admin | delegate Game to ER |
| `start_game` | ER | admin | Lobby → Active, set first `epoch_ends_at`, schedule crank |
| `join(amount)` | base | player wallet | transfer SOL → Vault; create/reuse Player with `pending_deposit += amount`; fails while the Player is delegated |
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
- The player creates a `SessionTokenV2` once, after joining. It is valid for about 2 h.
- `enlist`, `allocate`, `switch_kingdom`, `leave` and `undelegate_player` accept the session signer, so there are **no wallet popups during play**.
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

### Still open (defaults in use)
- **Epoch length:** 60 s, or 20 s for demos.
- **min_stake:** 0.05 SOL.
- **k_loss:** 20%.
- **Storm decay:** −5% base defense per epoch.
- **Globe placement:** the kingdoms are spread around the world for visual balance; they are not at their real Indian locations.
