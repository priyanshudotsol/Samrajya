# Samrajya · साम्राज्य

**A real-time, hands-on territory war, fought on-chain on MagicBlock Ephemeral Rollups.**

Six kingdoms float over a sky archipelago: **Hastinapur, Magadh, Kalinga, Takshashila, Vijayanagar and Avanti**. Between them lies **Kurukshetra**, the open plains. Everyone joins a kingdom with the same ticket and gets an equal share of its treasury. Every member commands one warrior. You fight with your own hands, and the fight decides who takes each realm. The war ends when one kingdom holds all seven territories, and its members split the whole pot.

- **Play:** [samrajya.priyanshu.pro](https://samrajya.priyanshu.pro) (Solana devnet + MagicBlock devnet ER)
- **Program:** `Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng` (devnet)
- **Built for:** the MagicBlock Blitz hackathon (Games)

---

## How the game works

### Join
- Pick a kingdom in the **lobby** and pay the **ticket** (0.1 SOL on devnet). Your SOL goes into a vault on Solana and becomes **one equal share** of your kingdom's treasury.
- A kingdom's treasury is also its strength. Conquest grows it, so every member's share grows too.
- Join, switch or leave any time:
  - Leaving costs **20%** of your share.
  - Switching kingdom costs **40%**.
  - Both fees stay in the treasury of the kingdom you left. Both are free in the lobby.

### Fight
- Every member has **one warrior** (a sainik) in the 3D realm of their kingdom.
- **Attack:** in the War room, commit part of your share against a neighbouring realm. Your warrior **teleports to that realm's gate**, together with everyone in your kingdom who committed to the same target (your squad). Plan it in your kingdom's private chat.
- **The fort lock:** an enemy cannot pass a kingdom's walls or gate **while a single member of that kingdom stands alive in its realm**. The kingdom's own members come and go freely. Garrisons can still be killed:
  - blades meet through the gate opening
  - arrows arc over the walls
- **Empty forts fall at once:** when nobody of the kingdom is alive in its realm, an attacker with an order who walks in through the gate takes it on the spot, with no waiting for the bell.
- **Kurukshetra:** an open field with no walls and a stone circle in the middle. Its holder keeps it while one of its members stands alive on the plains. After that, an attacker standing in the circle takes it.
- **The bell:** every epoch ends with a bell (90 s on devnet). The program reads every warrior and decides each contested realm by the fight: no defender alive and attackers at the gate (or in the circle) → captured; otherwise it holds. **There is no dice roll.**
- **Spoils:** the winner takes the realm, a share of the loser's treasury and its power. A kingdom that loses its last realm is eliminated, and its members' shares are worth 0.
- **Upgrades:** any member can spend kingdom treasury on walls or an armoury. Each extra territory adds +15% attack and defence.
- **The plains pot:** Kurukshetra's holder is paid the plains pot every epoch.

### Controls
| Input | Action |
|---|---|
| Click ground · WASD (Shift to run) | Walk; routes go round the fort and through the gate |
| Click an enemy | Chase it and attack |
| **Space** | Light blow; three in a row make a combo, the third a spinning finisher. Aim snaps to the enemy in front. |
| **E** (hold, release) | Heavy blow: ×1.8 damage, breaks a raised guard. Everyone sees the wind-up. |
| **Q** | Dodge roll, briefly untouchable |
| **F** (hold) | Guard; blows taken on it cost stamina, and at 0 the guard breaks |
| 1–6 | Talwar (sword), Bhala (spear), Dhanush (bow), Dhal (shield), Seedhi (ladder), Gaja (war elephant, needs the Gaja Sena power) |
| G | Rally your kingdom at the cursor |
| Right drag · wheel · H | Turn and zoom the camera · hide the panels |

Hits land with hitstop, knockback, a camera punch and slow motion on a kill. A war theme plays only while a fight is on, and a victory parade plays when one kingdom conquers the world.

---

## Why MagicBlock

| Feature | How Samrajya uses it |
|---|---|
| **Ephemeral Rollup** | The whole war runs on the ER. Every step (about 8 a second), blow, roll, attack order and bell is an ER transaction, fast and free. |
| **Delegate / commit / undelegate** | The lobby lives on Solana. Starting the war **delegates the Game and every member's Player** to the ER. When one kingdom holds everything, every Player and the Game are **committed and undelegated back to Solana**, where winners claim. |
| **Session keys** | One wallet popup to join (the session key is created in the same transaction), then none for the rest of the war, even across browsers (a lost session costs one popup to replace). |
| **SOL stays on Solana** | The vault is never delegated. On the ER a treasury is only an accounting number; leaving commits your Player and you withdraw on Solana. |
| **Permissionless** | Anyone can start a ready lobby, ring the bell, bring an ended war back, claim for a member (paid to their wallet) or open the next war. The keeper script just does it automatically. |
| **Every transaction is visible** | A pill under the header shows where the war lives (Solana lobby → MagicBlock ER → Solana settlement) and lists every ER and Solana transaction with an explorer link. |

```
LOBBY (Solana)      init_game → join + enlist (one tx; switch / leave + withdraw also on Solana)
START (Solana)      start_game + delegate_game → delegate_player × every member
WAR (MagicBlock ER) move_unit · strike · allocate · seize · upgrade · switch · leave · resolve_epoch
RETURN (ER→Solana)  release_players × every member → end_game (commit + undelegate)
SETTLE (Solana)     claim: shares × winner's treasury
```

## Architecture

```
Browser (Next.js app/)
 ├─ Solana devnet: join + enlist, start + delegate, withdraw, claim ─────► Vault PDA (never delegated), Registry
 ├─ MagicBlock ER (session key): move_unit, strike, allocate, seize ─────► Game (7 territories, 6 kingdoms inline)
 │      subscribe: Game + every Player (warriors), onLogs → tx feed           + one Player PDA per member (with its warrior)
 └─ Supabase Realtime: private kingdom chat, shared lobby battlefield
Keeper (scripts/keeper.ts): starts lobbies → delegates, rings the bell with every warrior mustered, brings ended wars back
```

### Program instructions (`programs/samrajya`)
| Layer | Instructions |
|---|---|
| Solana | `init_game` (anyone may open the next war once the last one ended), `join`, `enlist`, `start_game`, `delegate_game`, `delegate_player`, `withdraw`, `claim` |
| ER | `move_unit`, `strike`, `allocate` (teleports the squad), `seize`, `upgrade`, `switch_kingdom`, `leave`, `undelegate_player`, `resolve_epoch` (the bell) |
| Return | `release_players`, `end_game` |
| Ops | `abort_game` (authority: ends a broken war with no winner; everyone claims their value back) |

The rules live in `math.rs` (economy, battles, seize) and `field.rs` (warriors, blows, the fort lock, the bell's verdict, all in integer maths). The TypeScript mirror in `app/lib/game` uses the same rules for the mock game and the UI.

---

## Repo

| Path | What |
|---|---|
| `programs/samrajya/` | Anchor 1.0.2 program: `lib.rs` (instructions), `math.rs` (rules), `field.rs` (battlefield), `state.rs` |
| `programs/samrajya/tests/full_game.rs` | LiteSVM integration tests (a full war, leaves, switches, claims, sequential wars) |
| `tests/samrajya-er.ts` | End-to-end war on a MagicBlock ER: lobby on Solana → delegate → archers shoot garrisons down, forts seized → back to Solana → claims |
| `scripts/` | `create-game` (open / `--start` / `--abort`), `keeper`, `refund-aborted`, `client.ts`, local stack scripts |
| `app/` | Next.js 15 + React 19 + react-three-fiber frontend |
| `app/lib/game` | TS rules (`math`, `units`, `combat`, `tactics`), mirrored from the program |
| `app/lib/actions`, `app/lib/solana`, `app/lib/chain` | Chain client: session keys, ER moves, the war's trip between layers, warrior feed, tx feed |
| `app/lib/mock` | Mock mode: a full war with bots, no wallet needed |
| `app/components/world` | The sky archipelago world map |
| `app/components/realm`, `arena`, `realm-hud` | The 3D realms, Kurukshetra, warriors, combat effects and HUD |
| `app/supabase/chat.sql` | Realtime policies for private kingdom chat and the lobby battlefield |
| `docs/` | Design docs: [ARCHITECTURE](docs/ARCHITECTURE.md), [KINGDOM_UI](docs/KINGDOM_UI.md), [IMPLEMENTATION_GUIDE](docs/IMPLEMENTATION_GUIDE.md), [PROGRESS](docs/PROGRESS.md) |

---

## Run it

**Requirements:** anchor-cli 1.0.2, Solana CLI (Agave), Rust, Node 20+, Yarn (root) and pnpm (`app/`).

### Play the mock game (no wallet, bots fight)
```bash
cd app && pnpm install
NEXT_PUBLIC_MOCK=1 pnpm dev        # http://localhost:3000
```

### Play on devnet
```bash
cd app && pnpm install
cp .env.devnet.example .env.local  # chain values; add the Supabase keys for chat
pnpm dev
```
The app follows the on-chain registry to the newest war automatically.

### Program and tests
```bash
yarn install
yarn test                 # Rust unit tests + LiteSVM integration tests
cd app && pnpm test       # TS rules, combat and mock-war tests
```

### Run a war on devnet
```bash
anchor build && solana program deploy target/deploy/samrajya.so --program-id <id> -u devnet
EPOCH_SECS=90 yarn create-game      # opens the next war; its lobby lives on Solana
yarn keeper                         # starts it when ready, moves it to the ER, rings the bells, brings it back
yarn create-game --start            # (authority) start the lobby now
yarn create-game --abort            # (authority) end a broken war; then: GAME_ID=n npx ts-node scripts/refund-aborted.ts
yarn test:er:devnet                 # full end-to-end war (needs the newest war to have ended)
```
`ANCHOR_WALLET` must point at a funded devnet keypair. A private devnet RPC (`PROVIDER_ENDPOINT`, `NEXT_PUBLIC_RPC`) avoids the public endpoint's rate limits.

### Local MagicBlock stack
```bash
yarn stack:local          # terminal 1: local validator + ER
yarn test:er              # terminal 2
```

---

## Deploy (Vercel)

Set the project's **Root Directory** to `app` and add these variables:

| Variable | Value (devnet) |
|---|---|
| `NEXT_PUBLIC_MOCK` | `0` |
| `NEXT_PUBLIC_RPC` | `https://api.devnet.solana.com`, or a private devnet RPC |
| `NEXT_PUBLIC_ER_RPC` / `NEXT_PUBLIC_ER_WS` | `https://devnet-as.magicblock.app` / `wss://devnet-as.magicblock.app` |
| `NEXT_PUBLIC_ER_VALIDATOR` | `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` |
| `NEXT_PUBLIC_PROGRAM_ID` | `Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng` |
| `NEXT_PUBLIC_GAME_ID` | fallback only; the app follows the on-chain registry |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase project (kingdom chat) |
| `SUPABASE_JWT_SECRET` | server only: signs chat tokens after a wallet + membership check |

Apply `app/supabase/chat.sql` to the Supabase project once. Keep `yarn keeper` running somewhere for each war (anyone can also ring the bell from the app).

---

## Known limits
- Walls are enforced by the client; the program checks the outcomes (the bell's verdict, seizing, and that a striker inside enemy walls never meets a living defender).
- The bell carries every member's account, so a war holds about 25 members per transaction.
- Devnet only.

## Credits
- **Music:** "Five Armies", "Heroic Age", "The Curtain Rises", "Long Road Ahead B" by **Kevin MacLeod** ([incompetech.com](https://incompetech.com)), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Details in `app/public/audio/music/CREDITS.md`.
- **Sound effects:** Kenney and OpenGameArt (CC0), listed in `app/public/audio/sfx/CREDITS.md`.
- **Warrior:** KayKit Knight by Kay Lousberg (CC0), `app/public/models/knight/LICENSE-KayKit.txt`.
- **Skies and textures:** Poly Haven (CC0), listed in `app/public/textures/CREDITS.md`.

## License
MIT
