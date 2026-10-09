# v9-blitz — MagicBlock Blitz hackathon game

**Start every session by reading `docs/ARCHITECTURE.md` (game/program design), `docs/KINGDOM_UI.md` (world/realm/arena UI design), `docs/IMPLEMENTATION_GUIDE.md` (step-by-step build, Steps 0–15) and `docs/PROGRESS.md` (checklist).**
**End every session by updating `docs/PROGRESS.md` and the Status section below.**

## Hackathon
- **MagicBlock Blitz**: ship an MVP in one week, then grow users in the follow-on program, **Forge**.
- Register: https://luma.com/832wilvl
- Submit: https://build.magicblock.app/?stage=blitz#submit
  - Category: **Games**.
  - The form asks for a name, a description, a GitHub repo and pitch materials.
- Check the deadline on Luma.

## Concept (decided 2026-10-07; replaces the earlier snake-arena idea)
**Samrajya** (साम्राज्य, "empire") is an on-chain territory war on MagicBlock Ephemeral Rollups (ER).
- **The world map:** a sky archipelago of 6 floating kingdom islands (the globe was dropped 2026-10-08), each with a unique power.
- **Joining:** everyone pays the same ticket and owns an equal share of their kingdom's treasury. The treasury is also the kingdom's army strength.
- **The plains:** Kurukshetra, a neutral territory in the middle, borders every kingdom and pays its holder the plains pot; you must hold it to win.
- **Epochs:** members allocate value to defend or to attack a neighbour.
- **Battles:** resolved with VRF, weighted by power. The winner takes the territory, a share of the loser's treasury and its power.
- **Kingdom Arena:** clicking a kingdom opens a 3D castle scene (react-three-fiber) with live attacks.
- **Tactical layer (2026-10-08):** every member controls one warrior (WASD), picks a role and gear, marches to neighbouring realms; where warriors stand at the bell scales the odds, an abandoned fort is captured without a roll, and each kingdom plans in a private war council + chat. See ARCHITECTURE.md §10 and KINGDOM_UI.md §11.

Full rules, accounts, instructions and the frontend plan are in `docs/ARCHITECTURE.md`.

## User decisions (2026-10-07; additions 2026-10-09 in ARCHITECTURE.md §9 and §11)
- The name is **Samrajya**. **SOL only.**
- **Conquered players lose.** The treasury moves to the conqueror, and an eliminated kingdom's shares are worth 0.
- **Leave any time for a 20% fee. Switch kingdom for a 40% fee.** Both fees stay in the treasury of the kingdom being left.
- **No turn limit.** The game ends only when one kingdom owns every territory. A storm (base-defense decay) prevents stalls.

## Key technical decisions
- **Accounts:** one delegated `Game` account holds all 6 factions inline (treasury, total_shares, …). There is one `Player` PDA per user, and a base-layer `Vault` that is never delegated.
- **Layers (user, 2026-10-09):** lobby on Solana; starting the war delegates the Game and every Player to the ER; when one kingdom holds everything, all of it is committed and undelegated back to Solana; every tx is visible in the app (ARCHITECTURE §4 "Layers").
- **SOL stays on base:**
  - The ER tracks the treasury only as an accounting number.
  - Mid-game exit: ER `leave` sets `pending_withdrawal` and commits and undelegates that Player, then base `withdraw` pays out.
  - End of game: `end_game`, then `settle`, then `claim`.
- **Gameplay:**
  - Allocations update faction aggregates incrementally.
  - Session keys sign `enlist`, `allocate`, `switch`, `leave` and `settle`. Funds always go to `player.wallet`.
- **Infrastructure:**
  - A crank drives `resolve_epoch`, which is permissionless, so a keeper or client can call it as a fallback.
  - VRF uses the ephemeral queue.
- **Frontend:**
  - The chain-wars Next.js frontend is copied into `app/`.
  - Strip wagmi, RainbowKit, SIWE, Surge, bonding and swap.
  - Add the Solana wallet adapter, an anchor client and a zustand store fed by ER account subscriptions.
  - The world screen is a react-three-fiber archipelago (`components/world/world-map.tsx`); globe.gl was removed.
- No backend for the MVP.
- Don't modify `~/codes/job/rugrumble/chain-wars` or `magicblock-engine-examples`. They are reference only.

## Reference code
`magicblock-engine-examples/` (commit e8393c6):

| Example | Use it for |
|---|---|
| `counter/anchor` | delegate, commit and undelegate; client with two connections |
| `rock-paper-scissor/anchor` | a multi-account game with a SOL vault and claim |
| `session-keys/anchor` | session keys, program and React |
| `roll-dice/anchor/programs/roll-dice-delegated` | VRF on the ER |
| `crank-counter/anchor` | crank (needs the SDK git rev; see the architecture doc §4) |
| `scripts/local-env.sh`, `test-locally.sh` | the `mb-stack` local base + ER + VRF stack |

- Docs: https://docs.magicblock.gg
- Starter kits: https://github.com/magicblock-labs/starter-kits

## Toolchain (local)
- anchor-cli 1.0.2 (via avm) and solana-cli 4.0.3 (Agave). The examples' READMEs say Solana 3.1.9 and Rust 1.89.
- Node v25.8.2 (nvm). Yarn is used by the examples; chain-wars uses pnpm.
- Not installed: bun, dotnet, Unity.

## Status
- **2026-10-07 (design):**
  - Wrote the architecture, Kingdom UI and implementation guide docs.
  - Recorded the user decisions (see ARCHITECTURE.md §9).
- **2026-10-07 (build):**
  - **Program:** `samrajya` is built and tested (13 Rust tests, LiteSVM full war).
  - **Local ER:** delegation, enlist, allocate, leave → commit → withdraw, and VRF battles are verified on the local stack.
  - **Frontend:**
    - EVM code stripped, World screen working in mock mode.
    - Actions and the ER feed are written.
    - The realm/arena/HUD is being built by a subagent.
  - See `docs/PROGRESS.md` for the exact checklist, and its "Gotchas" section for the disk space and port issues.
- **2026-10-07 (devnet):**
  - Program deployed to devnet: `Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng`.
  - The full ER war test passes 7/7 on devnet.
  - Session keys verified through the UI action layer.
  - Devnet game 1 (`6vHY4…BHzS`) is created, with the lobby open.
  - The 3D realm, battle cinematic and HUD are built (mock mode verified).
- **2026-10-07 (realm overhaul):** distinct architecture per kingdom, army sized by members, ambient motion, and sword-duel battles (see PROGRESS.md).
- **2026-10-07 (realistic pass):** HDR sky, PBR terrain/castles, rigged animated warriors (Mixamo files pending from the user), music. See PROGRESS.md.
- **2026-10-08 (tactical layer, mock):** warriors, keyboard control, roles/gear, marches, walk-in capture, war council, kingdom chat, camera director — all working in mock mode (verified headlessly). Program port is Step 17. Mock mode no longer needs a wallet.
- **2026-10-08 (hands-on play):** the user asked that nothing plays itself. Click-to-move, click-to-attack, Space strikes, F guards, 1–6 weapons, G rally pings, a chase camera, real hits with six weapons, gates that break, death and respawn, bots that fight back, and warriors that stay under player control through the bell. Rules in `app/lib/game/combat.ts` (ARCHITECTURE §10.7). On devnet the warrior now spawns but fights locally until Step 17.
- **2026-10-08 (war feel):** KayKit Knight (CC0) with real attack / block / hit / death clips and per-weapon props, battle particles (sparks, blood, dust, debris, smoke), slash arcs, recorded CC0 sound effects with spatial falloff, war drums / crowd ambience and war horns. Preview at `/dev/warriors`.
- **2026-10-09 (plains, tickets, upgrades, new wars):** Kurukshetra, a neutral central plains (7th territory) that pays its holder the plains pot; a fixed entry ticket with an equal split; upgrades bought with treasury; +15% attack/defense per extra territory; a "Start a new war" button that anyone can press (Registry PDA, sequential wars). Program + TS + mock + UI done and tested (ARCHITECTURE §11). Deployed to devnet; war 2 (`3RjSu…kqbY`) is open in the lobby.
- **2026-10-09 (no popups, squad assaults):** in-war moves never ask the wallet again (one popup re-creates a lost session; 7-day sessions; the bell fallback never prompts), verified on devnet. Committing an attack teleports your warrior to the enemy gate with the squad (ARCHITECTURE §10.8); mock + local, program side is Step 17.9. User decision: **only the hand fight decides a walled realm** (cleared fort + attacker at the gate → captured, else held; the fallen stay down until the bell; plains keep the VRF), done in TS/mock/HUD, program side Step 17.10.
- **2026-10-09 (layers):** lobby on Solana → start delegates the Game + every member to the ER → war on the ER → everything committed + undelegated back to Solana when one kingdom holds all; `abort_game`; every ER/Solana tx shown in the app (chain pill). Deployed; `test:er:devnet` 7/7; war 2 aborted + refunded; **war 4 is open** (`BWQYo…SE6y`), keeper running.
- **2026-10-09 (fights on the ER):** warriors and blows are on-chain (`field.rs`: `move_unit`, `strike`, teleport in `allocate`); the bell reads every warrior and decides forts by the hand fight, no dice (VRF only for the plains). `test:er:devnet` 7/7 with a hand-fought war. War 4 aborted + refunded; **war 6 is open** (`4FYmq…pVJ`), keeper running.
- **2026-10-09 (real fights):** the fort lock (enemies can't enter while one defender lives; blades meet in the gate, arrows over walls), combo / heavy / dodge / guard / stamina, hitstop, knockback, camera punch, kill slow-mo, new KayKit clips (ARCHITECTURE §10.10). On devnet; **war 8 is open** (`BpLpg…hn9B`), keeper running.
- **2026-10-09 (seize + music):** an empty fort falls the moment an attacker with an order walks in (`seize`, no bell); war music only while blows land. Deployed; **war 10 is open** (`32MUF…5Uns`), keeper running.
- **Next:**
  - Play war 4 with Phantom on devnet; keep `yarn keeper` running (it starts the lobby and moves the war to the ER).
  - Port the tactical layer and combat to the program (IMPLEMENTATION_GUIDE Step 17, now with `strike` and `Game.gates`), then subscribe all Player PDAs.
  - Kingdom chat (Step 18) and the shared battlefield (`samrajya:<game>:field`) work on devnet over Supabase (dev creds in `app/.env`); try them in two browsers with Phantom. Use a private devnet RPC for real players.
  - User drops Mixamo FBX files into `app/public/models/warrior/` (list in PROGRESS.md).
  - Click through the app with Phantom on devnet (`cp app/.env.devnet.example app/.env.local`).
  - Deploy the frontend (Vercel, root `app/`).
  - Demo video and submission.

## Layout
- `programs/samrajya/`: the Anchor program. `math.rs` holds the rules and `lib.rs` the instructions.
- `tests/samrajya-er.ts`: the ER end-to-end test.
- `scripts/`: `client.ts` helpers, `create-game.ts`, `keeper.ts`, `local-stack.sh`, `local-env.sh`, `er-latency.ts`.
- `app/`: the Next.js frontend.
  - `lib/game` holds the TS rules, mirroring `math.rs`.
  - `lib/actions` and `lib/solana` hold the chain client.
  - `lib/mock` is mock mode.
  - `components/world` is the world map (archipelago) and its panels.
  - `components/realm|arena|realm-hud` is the 3D kingdom.
