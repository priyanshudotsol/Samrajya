# Samrajya · साम्राज्य

**A real-time war for the globe, fully on-chain on MagicBlock Ephemeral Rollups.**

Six Indian kingdoms sit on a 3D globe: Hastinapur, Magadh, Kalinga, Takshashila, Vijayanagar and Avanti. Each starts with one territory and a unique power.

- **Pledge:** stake SOL to a kingdom and receive **shares of its treasury**.
- **Every epoch:** members commit their strength to **defend**, or to **attack** a neighbour.
- **At the bell:** every attacked territory fights a battle, decided by **MagicBlock VRF** and weighted by power.
- **Conquest:** winners take the territory, the loot and the loser's power, so their shares rise and the losers' shares fall.
- **Flee or betray, for a price:**
  - Leave at any time for a 20% fee.
  - Switch kingdom for a 40% fee.
  - Both fees stay in the treasury of the kingdom you left, which rewards loyalty.
- **The end:** the war ends only when one kingdom rules every territory. Its members then split the whole pot.

## Why MagicBlock
| Feature | What it enables |
|---|---|
| **Ephemeral Rollup** | Re-allocating troops is a free ~3 ms transaction, so players can feint and switch targets until the last second. |
| **Session keys** | One wallet popup to pledge, then none while playing. |
| **VRF on the ER** | Every battle roll is provably fair. The UI's rune wheel shows the real odds and lands on the real roll. |
| **Commit / undelegate** | SOL never leaves the Solana base-layer vault. Exits and the final claims settle trustlessly on Solana. |
| **Permissionless game clock** | Anyone can ring the epoch bell: the keeper script, the frontend, or an ER crank. |

## Architecture
```
Browser (Next.js app/) ── base txs: join+delegate, withdraw, claim ──► Solana (vault PDA, never delegated)
        │                                                                    ▲
        └── ER txs (session key): enlist, allocate, switch, leave ──► MagicBlock ER: Game (6 kingdoms) + Player PDAs
                                         resolve_epoch → VRF → battle_callback      │ commit_and_undelegate
```
Details are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/KINGDOM_UI.md`](docs/KINGDOM_UI.md) and [`docs/IMPLEMENTATION_GUIDE.md`](docs/IMPLEMENTATION_GUIDE.md). Status is tracked in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Repo
| Path | What |
|---|---|
| `programs/samrajya` | Anchor 1.0.2 program. `math.rs` holds the rules (unit-tested and simulated); `lib.rs` holds the instructions. |
| `programs/samrajya/tests/full_game.rs` | LiteSVM integration test: a full war, with leaves, switches and claims |
| `tests/samrajya-er.ts` | End-to-end war on a MagicBlock ER, with VRF battles |
| `scripts/` | `create-game`, `keeper`, `local-stack.sh`, shared `client.ts` |
| `app/` | Next.js 15 frontend: globe, 3D kingdom realm, battle cinematic, mock mode |

## Run it
```bash
# program
yarn install
yarn test                    # Rust unit + simulation + LiteSVM full war

# local MagicBlock stack (npm i -g @magicblock-labs/ephemeral-validator)
yarn stack:local             # terminal 1
yarn test:er                 # terminal 2: full war on the ER with VRF

# frontend (mock mode: bots play, no wallet funds needed)
cd app && pnpm install && pnpm dev

# devnet
anchor deploy --provider.cluster devnet
GAME_ID=1 EPOCH_SECS=60 yarn create-game      # lobby open
GAME_ID=1 yarn create-game --start            # war begins
GAME_ID=1 yarn keeper                         # rings the bell every epoch
# app/.env.local: NEXT_PUBLIC_MOCK=0, NEXT_PUBLIC_GAME_ID=1
```

## Program
`Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng`

Built for the MagicBlock Blitz hackathon (Games category).
