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
- [x] World screen: leaderboard, battles panel (the original globe view was replaced by the archipelago, below)
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
- [x] World screen is a sky archipelago (2026-10-08, replaces the globe; globe.gl/three-globe removed): `components/world/world-map.tsx`. Six floating mini-realms on a hexagon ordered so ring neighbours are map neighbours (0-1-3-5-4-2), the other three links arc over a central throne island. Live attacks = glowing routes with banners in the attacker's colour, contested islands pulse red, results flash gold/red, click flies in and opens the realm.
- [x] UI theme is dark "royal night" since 2026-10-09 (user: ivory panels on a light page looked odd): deep ink panels, gold borders, ivory text, brighter `kingdomInk()`; tokens in `app/globals.css`. Before that it was light "royal manuscript" (2026-10-08): ivory parchment panels, gold-leaf borders, ink text (tokens in `app/globals.css`); kingdom names in text use `kingdomInk()` (darker, readable), 3D keeps the bright `kingdomGlow()`.
- [x] Chain feed and actions verified from Node against devnet (`app/scripts/smoke-feed.ts`, `smoke-actions.ts`)
- [ ] Click through in a real browser with Phantom on devnet (`cp app/.env.devnet.example app/.env.local`)

## Phase 5 — Tactical layer (2026-10-08, ARCHITECTURE §10, KINGDOM_UI §11)
- [x] Design decided with the user: movement on the ER per player, hybrid resolution (tactics scale strengths, VRF rolls, abandoned fort captured outright), Supabase chat, mock first
- [x] Rules: `lib/game/units.ts` (zones, hex wall collision, gate, ladder, spawn/arrival, marches), `lib/game/tactics.ts` (weights, factors, walk-in capture); `math.ts` takes optional factors; 6 new tests (25 total pass)
- [x] Mock: every player has a warrior; bots walk the courtyard, march on their targets, take role positions (gate / sides / rear), pick gear, chat; resolution uses the tactical factors; wounds, routs, conquerors move in; the viewer is never moved by the bot AI
- [x] Mock needs no wallet: persisted fake wallet (`mockWallet()`), actions work without Phantom
- [x] Realm: `Units.tsx` (rings, labels with hp), keyboard controller (WASD / Shift / Space / F, camera-relative, program rules, 10 Hz publish), `Melee` starts from the real cast with roles (archers hold at range), `CameraRig` modes orbit / follow / group / cinematic (aimed at the fight)
- [x] HUD: Sainik panel (role, gear, march), War council (private board + plan + abandoned-walls warning), Kingdom chat dock, odds bar and war room show the tactical multipliers
- [x] Chat plumbing for devnet: `lib/chat/supabase.ts`, token route `app/api/chat/token`, `supabase/chat.sql` (untested: needs a Supabase project)
- [x] Verified headlessly (Playwright chrome-headless-shell, mock, port 3077): walk / run / attack with the follow camera, chat send, war council, MUSTER with warriors → FALLEN + ELIMINATED, no page errors
- [x] **Hands-on play (2026-10-08, user: "every user should play it with their hands")** — ARCHITECTURE §10.7, KINGDOM_UI §11.2–11.6:
  - Combat rules `lib/game/combat.ts`: six weapons (reach / damage / cooldown / cleave / gate damage / block), arrows blocked by walls, blocking, inside-walls defence, death → respawn at home after 10 s, gates with 400 hp that break open; fort routing `planRoute` in `units.ts`; 8 new tests (33 total pass)
  - Mock: `ixStrike`, `ixRally`, gates repaired at every bell, combat events; bots fight anyone in reach, batter gates, answer rally pings, path round the fort; mock epochs default to 60 s (`NEXT_PUBLIC_MOCK_EPOCH_SECS=60`)
  - Controller rewrite: click ground to walk (round the fort, through the gate), click enemy to chase + attack, Space strikes at the cursor, F guards, 1–6 weapons, G rallies, H hides panels, Esc cancels; sub-stepped movement
  - Camera: chase camera whenever your warrior is in the realm (also through the bell), right-drag / wheel, drifts behind you outside the walls; screen follows your warrior across realms
  - Bell: warriors stay on the field under player control; scripted `Melee` only for replays / untracked realms
  - HUD: action bar (health, weapons + cooldown, target, gate hp, notices), fallen overlay, how-to-fight card, spectator prompt; floating numbers, arrows, sweeps, hit flashes, sounds, shake, kill toasts
  - Devnet: the viewer's warrior now spawns as soon as they are an active member (it never did before: the controller waited for a unit that only an action created) and every control works locally until Step 17
  - Replaced drei `<Html>` with `components/three/Html.tsx` and warrior name tags with DOM labels (drei's synchronous root unmount threw `removeChild` under React 19 once warriors started dying)
  - Verified headlessly (mock, port 3077): pledge → spawn → click-move → march → screen follows → walk round the fort to the enemy gate → batter it (gate −14 per swing) → defenders kill you → respawn at home; click an enemy → chase → 2 hits → kill; rally ping in chat; a full bell with the camera kept; world map and the devnet realm (spectator) load; no page errors
- [x] **War feel (2026-10-08, user: "attack / defend animation not visible, no vfx, better sound")** — KINGDOM_UI §11.6–11.7:
  - KayKit Knight (CC0) replaces the Soldier: real slice / chop / stab / shoot / bash / block / hit / death / cheer clips; per-gear props (sword, spear, crossbow, tower shield, ladder, greatsword) and swings; one attack clip per strike, also for other players; kingdom-coloured capes
  - Particles (`Particles.tsx`): sparks, blood, dust, wood debris, smoke, embers, flashes; slash crescents, arrow streaks, shockwave rings; impacts timed to the swing
  - 40 recorded CC0 sounds (Kenney + OpenGameArt, `public/audio/sfx/CREDITS.md`) with variations, pitch jitter, distance falloff and pan; war drums + shouting crowd beds driven by fight intensity; war horn at muster / clash / gate broken; footsteps; unsheathe on weapon switch
  - Hurt vignette, low-hp pulse, through-wall marker for your warrior, fainter shield dome while fighting
  - `/dev/warriors` preview page (all gears, slow motion)
  - Verified headlessly: showcase frames show each gear's prop and swing, sparks on blocks, blood on wounds; in-game duel renders with no page errors. Not verified: how it sounds and feels at full frame rate (headless renders ~1 fps)
- [x] Conquest shows the conqueror (2026-10-09, user request): a conquered island / realm / satellite is titled and built in the holder's style ("Magadh · conquered Hastinapur"); a member of an eliminated kingdom loses their warrior; the optional Mixamo probe is opt-in (`NEXT_PUBLIC_WARRIOR_MIXAMO=1`) so it stops logging 404s
- [x] Devnet game 1 started 2026-10-09 (host key, `yarn create-game --start` with `ANCHOR_WALLET`); keeper running; Magadh took Hastinapur at epoch 21
- [x] Two dev servers no longer share `.next`: the mock one runs with `NEXT_DIST_DIR=.next-mock` (they were overwriting each other's inlined NEXT_PUBLIC_MOCK)
- [ ] Program port (IMPLEMENTATION_GUIDE Step 17): `Player.unit`, `Game.presence`, `move_unit` / `set_role` / `set_gear` / `march` / **`strike`**, `Game.gates`, callback factors; then decode + subscribe all Player PDAs
- [ ] Devnet game 1 has 30 s epochs: too short to march, siege and fight by hand. Create the next game with ≥ 60–90 s epochs
- [x] Kingdom chat on devnet (Step 18), 2026-10-09: Supabase project `ymlihruuboekbiazvnez` (ap-southeast-1), `chat.sql` policies applied through the IPv4 session pooler (the direct db host is IPv6-only); dev credentials in `app/.env` (gitignored). Verified: tokens signed with the project's JWT secret join their own kingdom's room and messages arrive; another kingdom's token is refused; `/api/chat/token` refuses non-members (403), forged signatures (401) and the wrong kingdom (403), and issues a token to a real war-4 lobby member (throwaway, left + refunded) that joins Hastinapur's room and is refused Magadh's. The first join of a day can hit `MissingPartition`; `openRoom` retries once
- [x] **Members see each other (2026-10-09, user: two Hastinapur members each saw only themselves).** Shared battlefield over Supabase Realtime `samrajya:<game>:field` (policy extended + applied): warriors, swings and wounds sync between browsers; the target's browser settles blows aimed at it; respawn after `deadUntil`. Live two-process test against Supabase: A (real `field.ts`) sees B's Magadh warrior at its position, B's talwar swing lands for 16 (100 → 84), B receives the `hurt` and A's new hp
- [x] Feed asks Solana far less (public devnet answered 429 with two players + keeper): the delegation state comes from the read itself while on Solana and is rechecked every 20 s while on the ER; player poll 3 s; the activity list reads fewer Solana txs. Devnet realm page loads with 0 × 429
- [ ] Chat + shared battlefield clicked through in two browsers with Phantom
- [ ] A private devnet RPC (Helius / QuickNode free tier) in `NEXT_PUBLIC_RPC` for real players
- [ ] Gear visuals on the bodies (bow, spear, shield, elephant); Gaja as a real elephant mount
- [ ] Mobile controls (joystick + attack button) — mouse / keyboard only for now
- [ ] Balance pass on combat numbers with real players (a lone attacker at a defended gate dies in ~6 s by design)

## Phase 6 — Plains, equal tickets, upgrades, new wars (2026-10-09, ARCHITECTURE §11)
- [x] User decisions: anyone opens the next war with one button; neutral central plains that pay their holder; fixed ticket with an equal split; any member buys upgrades with treasury; +15% attack/defense per extra territory
- [x] Program: `T = 7` territories, `PLAINS`/`NEUTRAL`, plains garrison + pot + 10% tax, `upgrade(kind)`, conquest bonus, ticket-only `join`, equal shares, `Registry` + sequential permissionless `init_game` (previous war must be Ended and back on base), permissionless `start_game` after the lobby timer
- [x] Tests: 13 Rust unit tests (the 59-game simulation now has the plains and upgrades and still conserves SOL), 4 LiteSVM tests (full war over 7 territories, next war only after the last one ends), 37 TS tests
- [x] TS mirror (`math.ts`, `types.ts`, `factions.ts` `territoryName/ownerName`), decoder, IDL, mock (`ixUpgrade`, `ixNewWar`, bots buy upgrades and attack the plains), actions (`upgrade`, `newWar`, permissionless `startWar`), feed follows the registry, keeper follows the newest war and commits ended ones, `create-game` opens the next war
- [x] UI: Kurukshetra on the world map (standing stones, holder's banner, garrison, pot, routes from every kingdom), "Start a new war" (header, victory modal, realm header), lobby start for anyone, Armoury panel, "each member's share" instead of share price, fixed-ticket join card, conquest might in the stats
- [x] Verified headlessly in mock mode (port 3077): plains on the map, attack the plains from the war room, buy walls, end a war → "Start a new war" → war 2 with neutral plains; no page errors
- [x] **Upgraded program deployed to devnet** (2026-10-09, sig `374QMQ…`). Devnet game 1 (old layout) can no longer be decoded; its vault holds 0.05 SOL
- [x] War 2 opened on devnet with `yarn create-game` (`3RjSu6nLxFEeNnR8Mun7R13ocXpEWU7jRt5hMYJjqkbY`, 90 s epochs, 0.1 SOL ticket, 120 s lobby), delegated; the feed decodes it on the ER (`smoke-feed`)
- [ ] Devnet app not yet seen on war 2 in a browser: right after the deploy, api.devnet.solana.com answered 429 to this IP for 5+ minutes. Retry, or set `NEXT_PUBLIC_RPC` / `PROVIDER_ENDPOINT` to a private devnet RPC
- [ ] Keep `yarn keeper` running (it starts ready lobbies, rings bells, commits ended wars; base reads only every 20 s)
- [ ] Run `yarn test:er` on the local stack and on devnet with the new rules
- [ ] A realm view for the plains (open battlefield, warriors can march there)

## Phase 7 — No popups in war, squad assaults (2026-10-09)
- [x] User: "after the war starts I don't want to sign again and again." Causes found: the session key was only made inside `pledge` (and stored before the tx landed), so a missing/expired session made **every** ER move a wallet popup; the bell fallback in `RealmHud` also prompted every epoch. Fix (`lib/actions/chain-actions.ts`): `ensureSession()` (checks the token on base, else one popup creates a new one), sessions last 7 days (program max), pledge always adds the session and stores it after success, bell = `quiet` (session only, never prompts)
- [x] Verified on devnet war 2 (`NEXT_PUBLIC_GAME_ID=2 npx tsx scripts/smoke-actions.ts`): pledge 1 popup, switch 0, session deleted → two moves = 1 popup, leave + withdraw 1
- [x] Squad assaults (ARCHITECTURE §10.8): committing an attack teleports your warrior to the target's gate camp with the rest of the squad; Defend brings it home; marches are instant; fallen attackers respawn at the camp; after the bell a beaten squad / routed defenders go home. Mock + local (devnet) + War room squad count + Sainik "Teleport"; new test (38 TS tests pass)
- [x] **Only the hand fight decides a walled realm** (user, 2026-10-09): `resolveBattle` / `battleOdds` with tactics → captured iff the fort is cleared and an attacker holds the gate, else held, no roll (`BattleEntry.byFight`); plains keep the VRF; the fallen stay down until the bell; bots keep ≥ 30% home. HUD: FIGHT bar ("Hast holds while 2 defenders stand inside" / "FORT CLEARED"), War room "No dice: clear the walls", world panel "the fight decides", no rune wheel for fight results, new intro copy. Tests rewritten: 600-epoch bot wars (no dice for forts, SOL conserved, some forts fall), a solo conquest that ends the war, held-fort + respawn-after-bell (39 TS tests pass). Verified headlessly in mock (port 3077), no page errors
- [ ] Anti-stall for fight-only wars (the storm only decays dice defence); see ARCHITECTURE §10.8
- [ ] Program side of §10.8 (Step 17.9–17.10); devnet still rolls the VRF until then
- [ ] Not yet clicked through with Phantom in a browser

## Phase 8 — Lobby on Solana, war on the ER, every tx visible (2026-10-09)
- [x] User: "let everyone join; once the game starts shift it to the ER; all war activity on the ER; when one kingdom occupies everything undelegate to Solana; all ER transactions should be visible." Seen on devnet war 2: Hastinapur was eliminated by a 30% VRF roll with no fight (the chain has no warriors yet, Step 17)
- [x] Program: permissionless `delegate_player` (payer ≠ wallet only while Active, enlisted, nothing to withdraw) and `delegate_game` (once Active), `release_players` + `end_game` with remaining Players (commit + undelegate everyone), `abort_game` (authority; winner = NEUTRAL → everyone claims their value). 14 Rust unit + 4 LiteSVM tests pass
- [x] Deployed to devnet (sig `3R7BQq…`). War 2 aborted, brought back (release_players + end_game on the devnet ER) and refunded (`scripts/refund-aborted.ts`: the Kalinga member got 0.19 SOL back; the eliminated Hastinapur member gets 0)
- [x] `yarn test:er:devnet` 7/7 with the new lifecycle (war 3): lobby join + enlist on Solana, a third party can't delegate a lobby member, start delegates the Game + 6 members, mid-war leave + withdraw, war to a ruler, release everyone + end_game, winners claim the vault to rent
- [x] App: pledge in the lobby = one Solana tx (session + join + enlist); lobby switch / leave signed by the session key on Solana; "Start the war" = start + delegate everything (one popup, starter pays delegation rent); claim brings the war back if the keeper hasn't; new war no longer delegates the lobby; chain pill + transaction list on every screen. Keeper: starts ready lobbies and moves them to the ER, sweeps late enlisters, rings bells, brings ended wars back
- [x] **War 4 open on devnet** (`BWQYoAGxff2xxRMc2hD17rpj6wPYZhWiM45hY5ufSE6y`, lobby on Solana, 90 s epochs, 0.1 SOL ticket); keeper running. Devnet app checked headlessly: "Lobby on Solana" pill, the init tx listed with an explorer link, no page errors
- [ ] Battles on devnet are still VRF rolls until Step 17 puts the warriors on-chain (the fight-only rule is TS/mock only)
- [ ] Click through war 4 with Phantom (pledge → start → attack → watch the ER txs)

## Phase 9 — Warriors and fights on the ER (2026-10-09, ARCHITECTURE §10.9)
- [x] User: "on Magadh only one sprite is visible, no enemy; sprites should fight each other to win the game". Found: war 4's Magadh fell at the epoch-2 bell to a VRF roll (265385707/295000000) with no fight anywhere: the program had no warriors
- [x] Program: `Unit` in Player, `Game.gates` / `fight` / `fight_set`, `BattleEntry.by_fight`; `move_unit`, `strike`, teleport in `allocate`, spawn on enlist / switch, the bell reads every warrior (complete muster) and decides forts without dice; VRF only for the plains. 19 Rust unit tests (5 new: spawn + teleport, reach / rate limit / walls, cleared fort falls + living garrison holds, muster completeness) + 4 LiteSVM
- [x] Deployed (program extended by 70 000 bytes, 511 520-byte binary). War 4 aborted, brought back and refunded first with the old program (the new Player layout can't read old accounts; scripts read the old head by offset)
- [x] App: decoder (`toUnit`, gates, byFight), `lib/chain/warriors.ts`, moves / strikes / gear / teleport as session-signed ER txs, the bell sends the muster (app + keeper), respawn nudge, ER battlefield status line; Supabase field only in the lobby
- [x] `yarn test:er:devnet` 7/7 with a hand-fought war (war 5): squads teleported to the gates, cut down the garrisons of Magadh and Kalinga with on-chain `strike`s, and Magadh, Kalinga, Avanti, Takshashila, Vijayanagar all fell "by the fight" (no roll); only the plains used the VRF; everything back to Solana, winners claimed the vault to rent. `init_game` now reads only the previous war's phase byte (war 4 had the old layout)
- [x] **War 6 open on devnet** (`4FYmqheQBx7TCrU529AMok463FJYmECkxz2hrQz89pVJ`, lobby on Solana, 90 s epochs); keeper running
- [ ] Two browsers with Phantom: attack, fight, take a fort

## Phase 10 — The fort lock and real fights (2026-10-09, ARCHITECTURE §10.10)
- [x] Rules: locked fort while one defender lives (TS, mock, controller, program verdict + intruder guard), no gate battering, arrows over walls, blades through the gate gap; bot defenders hold the gate mouth, bots roll from wind-ups, guard, and swing heavy at guards
- [x] Moves: 3-hit light combo, hold-E heavy (×1.8, breaks guard, telegraphed CHARGE ring), Q dodge roll with i-frames, guard break, stamina, aim assist; program `strike(…, heavy)`, `ACTION_DODGE` / `ACTION_CHARGE`, `Unit.dodge_at`
- [x] Feel: hitstop on both fighters, knockback (yours real), scaled shake + camera punch, kill slow-mo, CRUSH / ×3 numbers, KayKit combo / spin / dodge / second hit + death clips, warriors 1.3×; HUD stamina / heavy meter / combo, gate SHUT/OPEN with defenders alive, new controls card
- [x] Tests: 41 TS (new: moves, knockback, roll cooldown, locked gate), 21 Rust (new: rolls, heavy vs guard, arrows over walls, lock verdict, intruder guard), 4 LiteSVM
- [x] Devnet: war 6 aborted + refunded; upgrade deployed; `test:er:devnet` war 7: the fort lock held, archers shot the Magadh and Kalinga garrisons over the walls, five forts fell "by the fight", everything came back to Solana (the final claim step hit a public-RPC 429, not a program error; that test war's ~0.26 devnet SOL stays in its vault)
- [x] **War 8 open on devnet** (`BpLpgAM3Xidc9Axjqaam14QCLrYcm75UDZznjGEfhn9B`), keeper running
- [ ] Two browsers with Phantom: a full siege by hand

## Phase 11 — Empty forts fall at once, war music only in a fight (2026-10-09, ARCHITECTURE §10.11)
- [x] Program `seize(x, z)` + `field::check_abandoned` + `math::seize` (22 Rust tests, new: refusals for a living defender / hidden garrison / outside the walls, instant fall, memberless kingdom); TS `seizeFort`, mock `seizeAbandoned` (42 TS tests, new: walk into empty Kalinga → falls without a bell; Hastinapur with a living member does not)
- [x] App: `actions.seize`, the HUD's `useSeize` fires it when you stand inside an empty enemy fort you were ordered to attack; `MusicDirector` plays the battle loop only while blows land in the realm on screen
- [x] Deployed to devnet (no layout change). `test:er:devnet` 7/7 (war 9): Magadh and Kalinga seized the moment Hastinapur walked in after shooting their garrisons down, Avanti / Takshashila / Vijayanagar (no members) seized on entry, all before the bell; winners claimed the vault to rent
- [x] **War 10 open on devnet** (`32MUFgrpm426n8tHBtWPvBfPii4v5LAKQjBwX2bG5Uns`, lobby on Solana); keeper running

## Phase 12 — Kurukshetra by hand, a real war theme (2026-10-09)
- [x] User: the music was "some melody I don't like"; attacking the centre kingdom did nothing (no teleport, nothing to see)
- [x] Music: "Five Armies" as the war theme (public/audio/music/war.m4a, 128 kbps AAC) with a war horn at the first blow; no peace melody; credits updated
- [x] Kurukshetra: realm page `/kingdom/6` with `PlainsScene` (stone circle, dais, holder's banner), clickable on the world map, `PlainsPanel` + plains HUD; teleport on attack (program, mock, local); no walls on the plains; holder keeps it while one member lives there, else attackers in the circle take it at once (`seize`) or at the bell; VRF removed from the bell
- [x] Program deployed (no layout change; war 10 kept running); 22 Rust + 42 TS tests pass
- [ ] User to check in the UI

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
cd app && pnpm dev        # UI on devnet; follows the registry to the newest war (NEXT_PUBLIC_GAME_ID is only a fallback)
cd app && NEXT_DIST_DIR=.next-mock NEXT_PUBLIC_MOCK=1 pnpm exec next dev --turbopack -p 3077   # mock game on another port without touching .env.local (no wallet needed)
```

## Gotchas learned
- The disk on this machine fills up. The solana-test-validator ledger and logs, `target/` (about 2 GB) and `app/.next` are the big ones. Run `rm -rf .local-stack target/debug app/.next` when space runs low.
- A user process listens on port 8000, so the local validator uses `--gossip-port 8020`.
- The local VRF oracle takes ~20 s per request; devnet takes ~1–2 s.
- Identical ER transactions (same args and blockhash) get deduped and never confirm, so always resend with a fresh blockhash (`scripts/client.ts send`).
- After `commit_and_undelegate`, wait until the base owner is our program again before using the account on base.
- Accounts larger than ~1 KB (our Game is 1,289 bytes) are committed by the ER through the **committor program** `CoMtrr6j336NSB5PAoAWpLe5hPgkcShWKbPgHhZxaxh`. It exists on devnet but not in mb-stack's local dumps, so `scripts/local-stack.sh` clones it from devnet. Without it, `end_game` never undelegates locally.
- The Claude-in-Chrome extension's browser does not reach this machine's localhost ports (another app answers on 3000/3001). Use the Playwright `chrome-headless-shell` in `~/Library/Caches/ms-playwright` with `playwright-core` for UI checks instead.
- drei 10 `<Html>` throws `removeChild … not a child of this node` under React 19 when labels unmount often. Use `components/three/Html.tsx` for scene labels.
- Headless chrome-headless-shell renders the realm at ~1 fps; the controller sub-steps movement so tests still walk at the right speed. Use low power (`localStorage samrajya:lowPower=1`) and press H so clicks land on the canvas. Dev builds expose `window.__samrajya` (store, controller, camera, mock) for play tests.
- Deploying the program through api.devnet.solana.com gets this IP rate-limited (429) for a long time, which also stalls the app and the keeper. Use a private devnet RPC for deploys (`--url`) and ideally for the app.
- Wars are sequential per deployment: `init_game` for war N+1 needs war N Ended and committed (`end_game`). On devnet, `yarn test:er:devnet` can only run once the current war is over.
- Bots that attack all-in leave home undefended, so two kingdoms can trade territories for a long time. That's a real strategy dynamic (consider it for balancing); the ER test's bots now attack with half their value.
