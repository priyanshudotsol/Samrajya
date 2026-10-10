# Samrajya · साम्राज्य

**A real-time, hands-on territory war, fought on-chain on MagicBlock Ephemeral Rollups.**

Six kingdoms float over a sky archipelago: **Hastinapur, Magadh, Kalinga, Takshashila, Vijayanagar and Avanti**. Between them lies **Kurukshetra**, the open plains. Everyone joins a kingdom with the same ticket and gets an equal share of its treasury. Every member commands one warrior and fights with their own hands, and the fight decides who takes each realm. The war ends when one kingdom holds all seven territories, and its members split the whole pot.

| | |
|---|---|
| **Play** | [samrajya.priyanshu.pro](https://samrajya.priyanshu.pro) |
| **Network** | Solana devnet + MagicBlock devnet Ephemeral Rollup |
| **Program ID** | [`Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng`](https://explorer.solana.com/address/Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng?cluster=devnet) |
| **Source** | [github.com/priyanshudotsol/Samrajya](https://github.com/priyanshudotsol/Samrajya) |
| **Built for** | MagicBlock Blitz hackathon (Games) |

## Contents
- [How the game works](#how-the-game-works)
- [Controls](#controls)
- [Why MagicBlock](#why-magicblock)
- [On-chain addresses](#on-chain-addresses)
- [Program](#program): accounts, instructions, rules, errors
- [Architecture](#architecture)
- [Repo layout](#repo-layout)
- [Run it](#run-it)
- [Deploy](#deploy-vercel)
- [Tech stack](#tech-stack) · [Known limits](#known-limits) · [Credits](#credits) · [License](#license)

---

## How the game works

### 1. Join (the lobby lives on Solana)
- Pick a kingdom and pay the **ticket** (0.1 SOL). Your SOL goes into the war's **vault on Solana**, and you get **one equal share** of your kingdom's treasury.
- A kingdom's treasury is also its strength. Conquest grows it, so every member's share grows too.
- Switching kingdom or leaving is free in the lobby.
- When the lobby timer ends and at least two kingdoms have members, anyone can start the war. The keeper does it automatically. Starting **moves the war and every member to the MagicBlock Ephemeral Rollup**.

### 2. Fight (the war lives on the ER)
- Every member has **one warrior** (a sainik) in the 3D realm of their kingdom.
- **Attack:** in the War room, commit part of your share against a neighbouring realm. Your warrior **teleports to that realm's gate**, together with everyone in your kingdom who committed to the same target (your squad). Plan it in your kingdom's private chat.
- **The fort lock:** an enemy cannot pass a kingdom's walls or gate **while a single member of that kingdom stands alive in its realm**. The kingdom's own members come and go freely. Garrisons can still be killed:
  - blades meet through the gate opening
  - arrows arc over the walls
- **Empty forts fall at once:** when nobody of the kingdom is alive in its realm, an attacker with an order who walks in through the gate takes it on the spot, with no waiting for the bell.
- **Kurukshetra:** an open field with no walls and a stone circle in the middle. Its holder keeps it while one of its members stands alive on the plains. After that, an attacker standing in the circle takes it.
- **The bell (every 90 s):** the program reads every warrior and decides each contested realm by the fight. No defender alive and attackers at the gate (or in the circle) → captured; otherwise it holds. **No dice.**
- **Spoils:** the winner takes the realm, a share of the loser's treasury and its kingdom power. A kingdom that loses its last realm is eliminated, and its members' shares are worth 0.
- **Treasury:** any member can buy walls or an armoury with the kingdom treasury. Every extra territory adds +15% attack and defence. Kurukshetra's holder is paid the **plains pot** every epoch.
- **Exits:** leaving mid-war costs **20%** of your share, and switching kingdom costs **40%**. Both fees stay in the treasury you left.

### 3. Settle (back on Solana)
- When one kingdom holds all seven territories, every member's account and the war are **committed and undelegated back to Solana**.
- The winners **claim** their share of the whole pot from the vault, and anyone can open the next war.

---

## Controls

| Input | Action |
|---|---|
| Click ground · WASD (Shift runs) | Walk; routes go round the fort and through the gate |
| Click an enemy | Chase it and attack |
| **Space** | Light blow; three in a row make a combo, the third a spinning finisher. Aim snaps to the enemy in front. |
| **E** (hold, release) | Heavy blow: ×1.8 damage, breaks a raised guard. Everyone sees the wind-up (a burning ring). |
| **Q** | Dodge roll, briefly untouchable |
| **F** (hold) | Guard; blows taken on it cost stamina, and at 0 the guard breaks |
| 1–6 | Switch weapon (see [weapons](#weapons)) |
| G | Rally your kingdom at the cursor |
| Right drag · wheel · H | Turn and zoom the camera · hide the panels |

Hits land with hitstop, knockback, a camera punch, and slow motion on a kill. A war theme plays only while a fight is on, and a victory parade plays when one kingdom conquers the world.

---

## Why MagicBlock

| Feature | How Samrajya uses it |
|---|---|
| **Ephemeral Rollup** | The whole war runs on the ER. Every step (about 8 a second), blow, roll, attack order and bell is an ER transaction, fast and free. |
| **Delegate / commit / undelegate** | The lobby lives on Solana. Starting the war delegates the **Game and every Player** to the ER. At the end, every Player and the Game are committed and undelegated back to Solana for the claims. |
| **Session keys** | One wallet popup to join (the session key rides in the same transaction), then none for the rest of the war. Funds only ever go to the player's own wallet. |
| **SOL stays on Solana** | The vault is never delegated. On the ER a treasury is only an accounting number; leaving commits your Player and you withdraw on Solana. |
| **Permissionless** | Anyone can start a ready lobby, ring the bell, bring an ended war back, claim for a member (paid to their wallet) or open the next war. |
| **Every transaction is visible** | A pill under the header shows where the war lives (Solana lobby → ER war → Solana settlement) and lists every ER and Solana transaction with an explorer link. |

```
LOBBY  (Solana)       init_game → join + enlist (one tx)   · switch / leave + withdraw also on Solana
START  (Solana)       start_game + delegate_game → delegate_player × every member
WAR    (MagicBlock)   move_unit · strike · allocate · seize · upgrade · switch_kingdom · leave · resolve_epoch
RETURN (ER → Solana)  release_players × every member → end_game (commit + undelegate)
SETTLE (Solana)       claim (winners) · withdraw (leavers) · init_game (the next war)
```

---

## On-chain addresses

All on **devnet**.

| What | Address |
|---|---|
| Samrajya program | [`Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng`](https://explorer.solana.com/address/Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng?cluster=devnet) |
| Registry PDA (points the app at the newest war) | [`6aqdZaWjSTewVKzVKANn1WeiUoDYY1kp5A5GfsMjzXWV`](https://explorer.solana.com/address/6aqdZaWjSTewVKzVKANn1WeiUoDYY1kp5A5GfsMjzXWV?cluster=devnet) |
| Current war: Game PDA, war 11 (changes every war) | [`BjWABy1yWqQbQRgQUyVSszHMuRPotWsf3PCLQsEbxwUg`](https://explorer.solana.com/address/BjWABy1yWqQbQRgQUyVSszHMuRPotWsf3PCLQsEbxwUg?cluster=devnet) |
| Current war: Vault PDA | [`7dAWMsnE7RZ2NK1pTEpnhDyy4YguX94VVpDJAy7Zn1bK`](https://explorer.solana.com/address/7dAWMsnE7RZ2NK1pTEpnhDyy4YguX94VVpDJAy7Zn1bK?cluster=devnet) |
| MagicBlock ER endpoint | `https://devnet-as.magicblock.app` · `wss://devnet-as.magicblock.app` |
| ER validator (Asia) | `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` |
| Delegation program | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` |
| Committor program (commits large accounts) | `CoMtrr6j336NSB5PAoAWpLe5hPgkcShWKbPgHhZxaxh` |
| Session keys program (gum) | `KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5` |

Explorer links for ER transactions use the Solana explorer's custom-RPC mode pointed at the ER endpoint. The app builds them for you in its transaction list.

---

## Program

Anchor 1.0.2 with `ephemeral-rollups-sdk` and `session-keys`. The source is in [`programs/samrajya/src`](programs/samrajya/src):
- `lib.rs`: instructions
- `math.rs`: economy, battles, seize
- `field.rs`: warriors, blows, the fort lock, the bell's verdict (integer maths)
- `state.rs`: accounts
- `constants.rs`, `error.rs`

### Accounts
| Account | Seeds | Lives on | Holds |
|---|---|---|---|
| `Registry` | `["registry"]` | Solana, never delegated | `latest_game`: the newest war |
| `Game` | `["game", game_id: u64 LE]` | Solana in the lobby, the ER during the war | phase, epoch, config, the 6 kingdoms inline (treasury, shares, members, territories, powers, attack allocations, upgrades), territory owners (7), plains pot, gates, the bell's verdicts, battle log (16) |
| `Vault` | `["vault", game]` | Solana, never delegated | the real SOL |
| `Player` | `["player", game, wallet]` | Solana in the lobby, the ER during the war | kingdom, shares, deposits / withdrawals, attack order, **warrior** (`Unit`: realm, position ×100, facing, action, gear, role, hp, strikes, fallen-until, roll time) |
| `SessionTokenV2` | session keys program | Solana | the browser's session signer for the war |

### Instructions
| Instruction | Layer | Signer | What it does |
|---|---|---|---|
| `init_game(game_id, config)` | Solana | anyone (once the last war has ended) | Opens the next war and its vault; points the registry at it |
| `join(amount)` | Solana | player | Pays the ticket into the vault |
| `enlist(faction)` | Solana / ER | player or session | Turns the ticket into one share; spawns the warrior at home |
| `start_game()` | Solana | authority any time; anyone once the lobby is ready | Closes the lobby, starts epoch 1 |
| `delegate_game(game_id)` | Solana | anyone once Active | Moves the Game to the ER |
| `delegate_player()` | Solana | the player any time; anyone once Active (enlisted, nothing to withdraw) | Moves a Player to the ER |
| `move_unit(at, x, z, fx, fz, action, gear, role)` | ER | player or session | Walks (speed-checked), changes action / gear / role, rolls (`DODGE`), or teleports (`at` changes) |
| `strike(x, z, fx, fz, heavy)` | ER | player or session | One blow; remaining accounts = the Players in reach. Re-checks reach, arc, walls, blocking, rolls, rate |
| `allocate(target, amount)` | ER | player or session | Attack order (or `255` = defend); teleports the warrior to the target's gate / home |
| `seize(x, z)` | ER | player or session | Takes an empty fort (or Kurukshetra's circle) at once; remaining accounts = every member |
| `upgrade(kind)` | ER | player or session | Walls (0) or armoury (1), paid from the kingdom treasury |
| `switch_kingdom(to)` | ER / Solana | player or session | 40% fee in the war, free in the lobby |
| `leave()` | ER / Solana | player or session | 80% of your value → `pending_withdrawal` (free in the lobby) |
| `undelegate_player()` | ER | player or session | Commits your Player back to Solana |
| `withdraw()` | Solana | anyone (paid to the player) | Pays `pending_withdrawal` from the vault |
| `resolve_epoch(seed)` | ER | anyone | **The bell.** Remaining accounts = every member with shares (checked complete); decides every contested realm by the fight |
| `release_players()` | ER | anyone | After the war: commits + undelegates the Players passed |
| `end_game()` | ER | anyone | After the war: commits + undelegates the Game |
| `claim()` | Solana | anyone (paid to the player) | Winners take their share of the pot |
| `abort_game()` | ER / Solana | authority | Ends a broken war with no winner; every member claims their value back |
| `battle_callback`, `resolve_epoch_debug` | — | — | Legacy VRF callback (unused since the fight decides) · debug builds only |

### Game rules (defaults)
| Setting | Value |
|---|---|
| Ticket | 0.1 SOL, one equal share per member |
| Epoch (time between bells) | 90 s; lobby 120 s |
| Leave / switch fee | 20% / 40% (free in the lobby), kept by the kingdom left |
| Failed attack loss (`k_loss`) | 20% of what was committed, paid to the winner |
| Storm | base and plains defence decay 5% per epoch |
| Plains tax | 10% of every kingdom's winnings feeds the plains pot |
| Upgrades | walls / armoury, 3 levels each, costing 5% / 10% / 15% of the treasury, +15% per level; one per kingdom per epoch |
| Conquest bonus | +15% attack and defence per extra territory |
| Battlefield | walk 1.6 / run 2.9 units/s · fallen warriors stay down until the bell (min 10 s), rise with 70 hp · roll once per 2 s on-chain |

### Kingdoms and powers
| Kingdom | Power | Effect |
|---|---|---|
| Hastinapur | Kuru Fortress | defence ×1.3 |
| Magadh | Gaja Sena | attack ×1.2, can field war elephants |
| Kalinga | Samudra Vyapar | +25% loot |
| Takshashila | Vidya Reach | attack any realm, not just neighbours |
| Vijayanagar | Annapurna Harvest | half the loss on failed attacks |
| Avanti | Ratri Raid | first attack ×1.5 |

A conqueror inherits the eliminated kingdom's power.

### Weapons
| Gear | Reach | Damage | Cooldown | Hits | Blocking takes |
|---|---|---|---|---|---|
| Talwar (sword) | 0.62 | 16 | 0.6 s | up to 2 | 50% |
| Bhala (spear) | 0.95 | 14 | 0.75 s | 1 | 55% |
| Dhanush (bow) | 4.2, arcs over walls | 10 (×1.4 from your own walls) | 1.1 s | first in line | 65% |
| Dhal (shield) | 0.5 | 7 | 0.7 s | 1 | 15% |
| Seedhi (ladder) | 0.6 | 8 | 0.8 s | 1 | 60% |
| Gaja (war elephant) | 0.95 | 24 | 1.4 s | up to 4 | 40% |

Heavy blows deal ×1.8 and ignore a raised guard. Defenders inside their own walls take 15% less.

### Errors
| Code | Name | Meaning |
|---|---|---|
| 6000 | InvalidConfig | Invalid game configuration |
| 6001 | WrongPhase | Action not allowed in the current game phase |
| 6002 | Unauthorized | Only the game authority can do this |
| 6003 | WrongTicket | Entry must equal the ticket price |
| 6004 | InvalidFaction | Invalid kingdom index |
| 6005 | InvalidTerritory | Invalid territory index |
| 6006 | FactionEliminated | That kingdom has been eliminated |
| 6007 | AlreadyEnlisted | Already in a kingdom; leave first |
| 6008 | NothingToEnlist | No pending deposit |
| 6009 | NotEnlisted | Not in a kingdom |
| 6010 | NotAdjacent | Target is not reachable from your kingdom |
| 6011 | OwnTerritory | You already own that territory |
| 6012 | AmountTooLarge | Allocation exceeds your current value |
| 6013 | BattlePending | A battle is being resolved |
| 6014 | EpochNotOver | The epoch has not ended yet |
| 6015 | SameFaction | Cannot switch to the same kingdom |
| 6016 | NothingToWithdraw | Nothing to withdraw |
| 6017 | NotWinner | Not a member of the winning kingdom |
| 6018 | AlreadyClaimed | Already claimed |
| 6019 | PendingWithdrawal | Withdraw pending funds first |
| 6020 | MaxLevel | Upgrade already at its highest level |
| 6021 | UpgradeCooldown | Already upgraded this epoch |
| 6022 | CannotAfford | The treasury cannot pay for that |
| 6023 | LobbyNotReady | Lobby still open, or fewer than two kingdoms have members |
| 6024 | StaleGameId | The next war must take the next game id |
| 6025 | PreviousWarNotOver | The current war has not ended or is not back on Solana |
| 6026 | MathOverflow | Math overflow |
| 6027 | Fallen | Your warrior has fallen and waits for the bell |
| 6028 | InvalidUnit | That move is not allowed |
| 6029 | NotReady | Your weapon is not ready yet |
| 6030 | IncompleteMuster | Every member's warrior must be mustered for the bell |
| 6031 | FortHeld | A defender still holds that fort |

---

## Architecture

```
Browser (Next.js app/)
 ├─ Solana devnet ── join + enlist, start + delegate, withdraw, claim ──────► Vault PDA (never delegated) · Registry
 ├─ MagicBlock ER ── (session key) move_unit, strike, allocate, seize ──────► Game PDA + one Player PDA per member
 │     reads: Game + every Player over websockets (warriors) · onLogs(game) on both layers (tx feed)
 └─ Supabase Realtime ── private kingdom chat · shared lobby battlefield (wallet-signed, membership-checked JWT)

Keeper (scripts/keeper.ts) ── starts ready lobbies → delegates everything · rings the bell with every warrior
                              mustered · brings ended wars back to Solana
```

Design docs: [ARCHITECTURE](docs/ARCHITECTURE.md) · [KINGDOM_UI](docs/KINGDOM_UI.md) · [IMPLEMENTATION_GUIDE](docs/IMPLEMENTATION_GUIDE.md) · [PROGRESS](docs/PROGRESS.md)

## Repo layout

| Path | What |
|---|---|
| `programs/samrajya/` | The Anchor program (see [Program](#program)) |
| `programs/samrajya/tests/full_game.rs` | LiteSVM integration tests: a full war, leaves, switches, claims, sequential wars |
| `tests/samrajya-er.ts` | End-to-end war on a MagicBlock ER: lobby on Solana → delegate → archers shoot garrisons down, forts seized → back to Solana → claims |
| `scripts/` | `create-game` (open / `--start` / `--abort`), `keeper`, `refund-aborted`, `client.ts`, local stack scripts |
| `app/` | Next.js frontend (see [`app/README.md`](app/README.md)) |
| `app/lib/game` | TS rules mirrored from the program: `math`, `units`, `combat`, `tactics` |
| `app/lib/actions`, `app/lib/solana`, `app/lib/chain` | Chain client: session keys, ER moves and strikes, the war's trip between layers, warrior and tx feeds |
| `app/lib/mock` | Mock mode: a full war with bots, no wallet |
| `app/components/world` | The sky archipelago world map |
| `app/components/realm`, `arena`, `realm-hud` | 3D realms and Kurukshetra, warriors, combat effects, HUD |
| `app/supabase/chat.sql` | Realtime policies for the chat rooms and the lobby battlefield |
| `docs/` | Design and progress |

---

## Run it

**Requirements:** anchor-cli 1.0.2, Solana CLI (Agave), Rust, Node 20+, Yarn (root) and pnpm (`app/`).

### Mock game (no wallet; bots fight)
```bash
cd app && pnpm install
NEXT_PUBLIC_MOCK=1 pnpm dev            # http://localhost:3000
```

### Devnet game
```bash
cd app && pnpm install
cp .env.devnet.example .env.local      # chain values; add the Supabase keys for chat
pnpm dev
```
The app follows the on-chain registry to the newest war on its own.

### Tests
```bash
yarn install
yarn test                 # Rust unit tests + LiteSVM integration tests
cd app && pnpm test       # TS rules, combat and mock-war tests
yarn test:er:devnet       # full end-to-end war on devnet (needs the newest war to have ended)
yarn stack:local && yarn test:er   # the same on a local validator + ER
```

### Run a war on devnet
```bash
anchor build
solana program deploy target/deploy/samrajya.so --program-id Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng -u devnet
EPOCH_SECS=90 yarn create-game      # opens the next war; its lobby lives on Solana
yarn keeper                         # starts it when ready, moves it to the ER, rings the bells, brings it back
yarn create-game --start            # (authority) start the lobby now
yarn create-game --abort            # (authority) end a broken war, then: GAME_ID=<n> npx ts-node scripts/refund-aborted.ts
```
`ANCHOR_WALLET` must point at a funded devnet keypair. A private devnet RPC (`PROVIDER_ENDPOINT` for scripts, `NEXT_PUBLIC_RPC` for the app) avoids the public endpoint's rate limits.

---

## Deploy (Vercel)

Set the project's **Root Directory** to `app` and add:

| Variable | Value (devnet) |
|---|---|
| `NEXT_PUBLIC_MOCK` | `0` |
| `NEXT_PUBLIC_RPC` | `https://api.devnet.solana.com` (or a private devnet RPC) |
| `NEXT_PUBLIC_ER_RPC` | `https://devnet-as.magicblock.app` |
| `NEXT_PUBLIC_ER_WS` | `wss://devnet-as.magicblock.app` |
| `NEXT_PUBLIC_ER_VALIDATOR` | `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` |
| `NEXT_PUBLIC_VRF_QUEUE` | `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc` (still passed to the bell, unused) |
| `NEXT_PUBLIC_PROGRAM_ID` | `Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng` |
| `NEXT_PUBLIC_GAME_ID` | fallback only; the app follows the registry |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase project (kingdom chat) |
| `SUPABASE_JWT_SECRET` | **server only**: signs chat tokens after a wallet + membership check |

Apply `app/supabase/chat.sql` to the Supabase project once. Keep `yarn keeper` running for each war; anyone can also ring the bell from the app.

## Tech stack
- **Program:** Rust · Anchor 1.0.2 · MagicBlock `ephemeral-rollups-sdk` · `session-keys` (gum) · LiteSVM tests
- **App:** Next.js 15 · React 19 · react-three-fiber / drei / three.js (postprocessing, KayKit animated warriors) · Tailwind v4 · zustand · Solana wallet adapter · `@coral-xyz/anchor` · `@magicblock-labs/ephemeral-rollups-sdk` + `gum-sdk`
- **Realtime:** Supabase Realtime (private channels, RLS)
- **Hosting:** Vercel (app) · keeper as a long-running Node script

## Known limits
- Walls are enforced by the client. The program checks the outcomes: the bell's verdict, seizing, and that a striker inside enemy walls never meets a living defender.
- The bell carries every member's account, so a war holds about 25 members per transaction.
- Devnet only, with no audit.

## Credits
- **Music:** "Five Armies", "Heroic Age", "The Curtain Rises", "Long Road Ahead B" by **Kevin MacLeod** ([incompetech.com](https://incompetech.com)), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See `app/public/audio/music/CREDITS.md`.
- **Sound effects:** Kenney and OpenGameArt (CC0), see `app/public/audio/sfx/CREDITS.md`.
- **Warrior:** KayKit Adventurers by Kay Lousberg (CC0), see `app/public/models/knight/LICENSE-KayKit.txt`.
- **Skies and textures:** Poly Haven (CC0), see `app/public/textures/CREDITS.md`.

## License
MIT
