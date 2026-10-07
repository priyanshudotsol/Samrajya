# Progress checklist

Update this file at the end of every session. Design lives in `docs/ARCHITECTURE.md`, `docs/KINGDOM_UI.md` and `docs/IMPLEMENTATION_GUIDE.md`.

## Phase 0 — Design ✅
- [x] Explored chain-wars and the MagicBlock examples; wrote the architecture, Kingdom UI and implementation guide docs (2026-10-07)
- [x] User decisions (2026-10-07), logged in ARCHITECTURE.md §9:
  - Samrajya, SOL only, Indian kingdom names
  - share economy, with the 20% leave and 40% switch fees going to the treasury of the kingdom being left
  - no turn limit
- [x] chain-wars frontend copied into `app/`; reference files in `reference/chain-wars/`

## Phase 1 — Program `samrajya` (base layer) ✅
- [x] Anchor 1.0.2 workspace at the repo root, program `programs/samrajya` (ID `Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng`)
- [x] `state.rs`: Game (6 factions inline, boxed in contexts because of the 4 KB stack limit), Player, Vault
- [x] `math.rs`: all the rules, plus 10 unit tests. These include a 59-game random simulation that checks SOL conservation, and a sub-roll vector shared with TS.
- [x] Instructions: init_game, join(amount), enlist(faction), allocate, switch_kingdom, leave, withdraw, start_game, resolve_epoch (VRF), battle_callback, resolve_epoch_debug (only works with `--features debug`), end_game, undelegate_player, claim, delegate_game, delegate_player
- [x] LiteSVM integration tests (`programs/samrajya/tests/full_game.rs`): a full 12-player war, leave/withdraw, switch, claims draining the vault to 0, allocate validation, and a check that the release binary rejects the debug resolver

## Phase 2 — MagicBlock integration
- [x] `#[ephemeral]`; delegation of Game and Player; enlist and allocate on the ER (~3 ms)
- [x] ER leave → `undelegate_player` (commit) → base `withdraw`: verified on the local stack
- [x] VRF battles on the ER: verified locally (needs a second vrf-oracle pointed at the ER, see `scripts/local-stack.sh`)
- [x] `end_game` + `undelegate_player` → base `claim`. The client waits for undelegation (`waitForUndelegation`) before claiming.
- [x] **`yarn test:er:devnet`: 7/7 passing on devnet** (2026-10-07). Covers join+delegate, ER enlist, leave→commit→withdraw, 6 VRF battles to a ruler, end_game commit, and the winner's claim draining the vault to rent. Locally, everything except the final Game commit passes (see the committor gotcha).
- [x] Session keys on devnet through the real UI action layer (`app/scripts/smoke-actions.ts`): pledge = 1 popup; switch = 0 popups, ~300 ms; leave+withdraw = 1 popup
- [ ] Crank via ScheduleCrankCpi. For now the permissionless keeper (`yarn keeper`) and the frontend `ringBell` fallback drive epochs.
- [x] Devnet deploy: `Hn5L61gn5B9ETWbRBjJ6qnLU2NdWSDBaqXCfy7jwT7Ng` (slot 508480149, max-len 460000, authority Ax7V…qng)

## Phase 3 — Frontend (`app/`)
- [x] EVM, economy and Supabase code removed (moved to `app/.removed-evm/`, which can be deleted); Solana wallet adapter; dark royal theme
- [x] `lib/game/math.ts`: a faithful port of `math.rs`. 19 TS tests (node:test), including the cross-language sub-roll vector.
- [x] Mock mode (`NEXT_PUBLIC_MOCK=1`): bots play full wars
- [x] World screen: globe with castle markers, attack arcs, battle rings, leaderboard, battles panel
- [x] `lib/actions`: `useGameActions()` (pledge / allocate / switchKingdom / leave / claim / ringBell), with mock and chain implementations; session key created in the pledge tx
- [x] `lib/store/game.ts` `subscribeER`: Game via an ER websocket plus a poll, and the Player PDA poll; decoders in `lib/solana/decode.ts`
- [x] Realm diorama, battle cinematic and HUD (`components/realm|arena|realm-hud`, `lib/realm`, `lib/arena`, `lib/audio.ts`, about 4,800 lines). It is procedural three.js: hex island, keep with onion and chhatri domes, walls and shield dome that follow the defend share, troops sized by treasury, live enemy camps, landmarks, and satellite islands.
  - The battle machine waits for the real VRF entry and never fakes a result.
  - The rune wheel uses the real odds.
  - Verified in mock mode with headless Chrome screenshots.
  - Known gaps:
    - the layout is seeded by territory, not by owner
    - the recolour is a plain fade
    - no hero characters
    - sound is synthesised
- [x] Realm overhaul (2026-10-07, mock-verified with real-time headless captures):
  - Each realm has its founding kingdom's architecture (`lib/realm/styles.ts`, `components/realm/Keeps.tsx`): Kuru red fort, Mauryan pillared hall + lion pillar, Konark sun temple with turning wheels, Takshashila stupa with prayer flags and monks, Hampi gopuram, Avanti dark shikhara with lamps. Walls, battlements and tower caps differ too; satellites show the same keep.
  - Army = members: one soldier per member at home (scaled by defend share), camps/marches = attacker members × committed share. 0 members ⇒ no army. Treasury: empty at 0 SOL, one coin chest per member.
  - Movement: wall patrols, courtyard sword sparring, looping march columns, birds, boats.
  - Battles are sword fights (`components/arena/Melee.tsx`): attackers march round from their camps in MUSTER, defenders file out of the gate, then 1-on-1 duels. Losses before the VRF result follow the odds and never wipe a side; once HELD/FALLEN is known every loser is cut down and conquerors storm the gate. The VRF still decides; the fight only shows it. HELD/FALLEN now last 6/6.5 s.
- [x] Realistic pass (2026-10-07):
  - Environment: Poly Haven CC0 HDR skies + PBR textures (`public/hdri`, `public/textures`, credits in CREDITS.md), smooth heightfield terrain from the tiles (`lib/realm/terrain.ts`, matches `groundY`), shader water, rock cliffs, leaf-card trees, triplanar stone/wood on castles (`lib/realm/textures.ts`), N8AO + bloom + ACES in Effects.
  - Warriors: rigged, animated humans (`lib/arena/warriors.ts`, `components/arena/WarriorCrowd.ts`, `useCrowd.ts`) drive Troops and Melee; instanced low-poly soldiers remain the fallback (loading / low-power). Placeholder body = three.js Soldier.glb (idle/walk/run) + attached sword/shield, attacks/cheer/death faked on bones. **Drop the Mixamo paladin + sword-and-shield clips into `app/public/models/warrior/` (warrior.fbx, idle, walk, run, slash, attack, block, impact, death, victory .fbx) and they load automatically.**
  - Music (`lib/music.ts`, `components/realm-hud/MusicDirector.tsx`, mounted in RealmHud): peace / battle loops, victory / defeat stings, Kevin MacLeod CC BY 4.0 with an on-screen credit. Not yet listened to in a browser.
  - ~35–60 fps in battle in headless Chrome.
- [x] Chain feed and actions verified from Node against devnet (`app/scripts/smoke-feed.ts`, `smoke-actions.ts`)
- [ ] Click through in a real browser with Phantom on devnet (`cp app/.env.devnet.example app/.env.local`)

## Phase 4 — Ship
- [x] Devnet game 1 created: `6vHY4pcSVGQwbqFiuJMioLMgd6icLNQNRYRGHTt7BHzS`, 30 s epochs, delegated, **lobby open**
- [ ] Start the war (`GAME_ID=1 yarn create-game --start`) and keep `GAME_ID=1 yarn keeper` running
- [ ] Frontend deployed (Vercel, root `app/`)
- [ ] README, demo video, pitch, submission

## How to run
```
yarn test                 # Rust unit tests + debug build + LiteSVM full war
yarn stack:local          # terminal 1: local base + ER + 2 VRF oracles (needs mb-stack; port 8000 is avoided)
yarn test:er              # terminal 2: full war on the local ER
cd app && pnpm dev        # UI; .env.local is devnet (live game 1) since 2026-10-07; the mock config is saved as app/.env.mock.local.bak
```

## Gotchas learned
- The disk on this machine fills up. The solana-test-validator ledger and logs, `target/` (about 2 GB) and `app/.next` are the big ones. Run `rm -rf .local-stack target/debug app/.next` when space runs low.
- A user process listens on port 8000, so the local validator uses `--gossip-port 8020`.
- The local VRF oracle takes ~20 s per request; devnet takes ~1–2 s.
- Identical ER transactions (same args and blockhash) get deduped and never confirm, so always resend with a fresh blockhash (`scripts/client.ts send`).
- After `commit_and_undelegate`, wait until the base owner is our program again before using the account on base.
- Accounts larger than ~1 KB (our Game is 1,289 bytes) are committed by the ER through the **committor program** `CoMtrr6j336NSB5PAoAWpLe5hPgkcShWKbPgHhZxaxh`. It exists on devnet but not in mb-stack's local dumps, so `scripts/local-stack.sh` clones it from devnet. Without it, `end_game` never undelegates locally.
- Bots that attack all-in leave home undefended, so two kingdoms can trade territories for a long time. That's a real strategy dynamic (consider it for balancing); the ER test's bots now attack with half their value.
