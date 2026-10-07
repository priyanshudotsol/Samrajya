# v9-blitz — MagicBlock Blitz hackathon game

**Start every session by reading `docs/ARCHITECTURE.md` (game/program design), `docs/KINGDOM_UI.md` (globe/realm/arena UI design), `docs/IMPLEMENTATION_GUIDE.md` (step-by-step build, Steps 0–15) and `docs/PROGRESS.md` (checklist).**
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
- **The globe:** a 3D globe with 6 kingdoms, each with a unique power.
- **Joining:** players stake SOL into a kingdom and receive **shares** of its treasury. The treasury is also the kingdom's army strength.
- **Epochs:** members allocate value to defend or to attack a neighbour.
- **Battles:** resolved with VRF, weighted by power. The winner takes the territory, a share of the loser's treasury and its power.
- **Kingdom Arena:** clicking a kingdom opens a 3D castle scene (react-three-fiber) with live attacks.

Full rules, accounts, instructions and the frontend plan are in `docs/ARCHITECTURE.md`.

## User decisions (2026-10-07)
- The name is **Samrajya**. **SOL only.**
- **Conquered players lose.** The treasury moves to the conqueror, and an eliminated kingdom's shares are worth 0.
- **Leave any time for a 20% fee. Switch kingdom for a 40% fee.** Both fees stay in the treasury of the kingdom being left.
- **No turn limit.** The game ends only when one kingdom owns every territory. A storm (base-defense decay) prevents stalls.

## Key technical decisions
- **Accounts:** one delegated `Game` account holds all 6 factions inline (treasury, total_shares, …). There is one `Player` PDA per user, and a base-layer `Vault` that is never delegated.
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
  - Keep using globe.gl `components/ui/globe.tsx`, and use its `arcsData` for attack arcs.
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
- **Next:**
  - User drops Mixamo FBX files into `app/public/models/warrior/` (list in PROGRESS.md).
  - Click through the app with Phantom on devnet (`cp app/.env.devnet.example app/.env.local`).
  - Start game 1 and run the keeper.
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
  - `components/world` is the globe.
  - `components/realm|arena|realm-hud` is the 3D kingdom.
