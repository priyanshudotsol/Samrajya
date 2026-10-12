# Samrajya — Kingdom UI design & implementation plan

Written 2026-10-07. This doc covers how the globe, the territory and the arena look and get built.
The game rules are in `ARCHITECTURE.md`. Update this doc when a UI decision changes.

---

## 1. The experience: three zoom levels

| Level | Name | What you see | Tech |
|---|---|---|---|
| 1 | **World** (globe) | Dark globe. Each of the 6 kingdoms is a **mini 3D castle** standing on the globe in its faction colour. Glowing **attack arcs** fly between kingdoms during the epoch. Rings pulse where battles happen. | globe.gl (existing `components/ui/globe.tsx`) with `objectThreeObject` = small GLB castle |
| 2 | **Realm** (territory / kingdom view) | A **floating hex-island diorama**: castle keep in the centre, walls, houses, farms, a treasury, banners, troops on the walls, and a unique **power landmark**. Conquered territories appear as **extra islands linked by bridges**. Enemy armies **camp at the edges** while they're attacking. | react-three-fiber (R3F) + drei, KayKit hex tiles |
| 3 | **Arena** (battle) | When the epoch ends and this kingdom is attacked, the camera swoops down to the gate: armies march, catapults fire, a **VRF rune spins**, then the result plays: **HELD** (attackers rout) or **FALLEN** (banners turn to the conqueror's colour). | same R3F canvas, a cinematic state machine |

**The realm is the arena.** The battle happens *in* the kingdom you're looking at, not on a separate map.
That makes the stakes feel personal: it's your castle on fire.

Transitions:
- **World → Realm:** click a castle on the globe. The globe camera flies to the point (`globe.pointOfView({lat,lng,altitude:0.3}, 1200)`), the screen fades through a cloud wipe, and the R3F realm mounts.
- **Realm → World:** a "World map" button, or Esc.

---

## 2. Art direction

- **Style:** stylised low-poly **tabletop diorama**. Think Bad North, Townscaper, or a board-game miniature.
  The CC0 kits below all share this look, so the scene looks coherent with zero modelling work.
- **Islands:** kingdoms float on islands over a soft void with clouds below. That hides the world edge and makes each kingdom a self-contained "board".
- **Lighting:** a warm key light (sun) and a cool fill. Use soft shadows (drei `<SoftShadows>` or `<ContactShadows>`) and a light fog.
- **Time of day as a timer:**
  - The sun moves across the epoch, so dusk means the epoch is ending.
  - The final 10 s turn to a red sky, so players *feel* the bell coming.
- **Faction colours** recolour banners, roofs, shields, troop tabards and arcs. Each faction has primary and accent colours:

| # | Kingdom | Primary | Accent | Biome | Power landmark |
|---|---|---|---|---|---|
| 0 | **Hastinapur** (Kuru capital) | `#E8B04A` saffron-gold | `#5A3A0E` | river plains (Ganga) | great stone fort palace with chhatri domes (Kuru Fortress) |
| 1 | **Magadh** (Mauryan empire) | `#E2483C` vermilion | `#5A120E` | dry plains, red earth | war-elephant stables (Gaja Sena) |
| 2 | **Kalinga** (maritime kingdom) | `#2EA8E0` sea blue | `#0B3D5C` | coast / harbour | harbour with trade ships (Samudra Vyapar) |
| 3 | **Takshashila** (ancient university) | `#9B6BFF` violet | `#2E1A4D` | mountain cliffs | stupa library tower (Vidya Reach) |
| 4 | **Vijayanagar** (Hampi) | `#4CC27A` green | `#16422A` | boulders and gardens | stone temple chariot (Annapurna Harvest) |
| 5 | **Avanti** (Ujjain) | `#3A3F7A` indigo night | `#C9C9D9` silver | night forest | moonlit observatory (Ratri Raid) |

- **Indian royal look on top of medieval kits.** The CC0 kits are European-medieval, so we add a few cheap procedural touches that make the realm read as Indian royal:
  - **Chhatri domes** (sphere + cylinder pillars) on the tower tops.
  - **Onion domes** on the keep, made from a lathe geometry.
  - **Torans** (arched gates) over the main gate.
  - **Saffron and gold pennants.**
  - **Diyas** (small flame sprites) along the walls at dusk.
  - **War elephants** for Magadh: a low-poly elephant built from primitives, or a CC0 model if one is found.
- **Fonts:** **Rozha One** or **Yatra One** (Google Fonts, Devanagari-inspired display faces) for headings, with Afacad for body text.
  - The "साम्राज्य" logo uses **Tiro Devanagari Hindi**.
- **UI chrome:** keep chain-wars' clipped-corner panels, but re-skin them. Use a parchment and gold border look, or keep the dark-teal terminal look with gold accents.
  - **Recommendation:** go dark royal. Panels are `#0E0B08` with a `#C9A227` gold hairline and a subtle mandala/jaali pattern in the background (an SVG pattern at low opacity).

---

## 3. Assets (all CC0: free, commercial use, no attribution needed)

| Use | Pack | Link | Notes |
|---|---|---|---|
| Hex terrain, buildings, props | **KayKit Medieval Hexagon Pack** | https://kaylousberg.itch.io/kaykit-medieval-hexagon | 200+ hex tiles (grass, water, coast, road, river) plus barracks, castle, church, windmill, mine and tavern. Buildings come in 4 team colours; recolour them to 6 with a shared material (§6.4). |
| Castle walls, towers, gate, siege weapons, flags | **Kenney Castle Kit** | https://kenney-assets.itch.io/castle-kit (also [OpenGameArt](https://opengameart.org/content/castle-kit)) | glTF, 75+ objects, includes catapult and ballista |
| Animated hero characters | **KayKit Adventurers** | https://kaylousberg.itch.io/kaykit-adventurers | Knight, Barbarian, Mage, Rogue; 75 animations (idle, walk, run, attack, hit, death, cheer) |
| Extra animations | **KayKit Animations** | https://kaylousberg.itch.io/kaykit-animations | rig-compatible animation library |
| Village fill / alternative | **Quaternius Medieval Village MegaKit** | https://quaternius.com/packs/medievalvillagemegakit.html | 300 modular pieces, glTF |
| Simple animated knight | **Quaternius Lowpoly Animated Knight** | https://quaternius.itch.io/lowpoly-animated-knight | fallback unit |
| SFX | **Kenney Impact Sounds, RPG Audio, UI Audio** | https://kenney.nl/assets (category: audio) | sword clash, arrows, UI clicks |
| Music | OpenGameArt CC0 orchestral loops | https://opengameart.org | one calm realm loop and one battle loop |

### Asset pipeline
1. Download the packs into `app/assets-src/` (git-ignored, since the source files are big).
2. Convert and optimise them into `app/public/models/`. One-time commands:
   ```bash
   npx @gltf-transform/cli optimize in.gltf out.glb --compress meshopt --texture-compress webp
   ```
3. Generate typed React components for the key models:
   ```bash
   npx gltfjsx public/models/castle.glb -t -o components/arena/models/Castle.tsx
   ```
   Hex tiles don't need this; they're loaded generically.
4. Put the whole kit for tiles and props into one or two GLBs, a "kit" file, and pick meshes out by node name. That way the realm is **one network request**:
   ```ts
   const { nodes } = useGLTF('/models/kit-hex.glb')
   ```
5. Size budget: under 8 MB of models in total, loaded lazily the first time someone opens a realm. The globe castle is a separate 50 KB GLB.

```
app/public/models/
  kit-hex.glb        ← hex tiles + buildings + nature props (KayKit)
  kit-castle.glb     ← walls, towers, gate, catapult, flags (Kenney)
  units.glb          ← knight + barbarian rigs with animations (KayKit Adventurers)
  globe-castle.glb   ← tiny castle for the globe markers
app/public/sfx/ …    app/public/music/ …
```

---

## 4. Realm scene: how a kingdom is built procedurally

A kingdom is **generated from a seed**, the faction index, and **driven by live on-chain state**.
No level design is needed, and the realm visibly **grows and burns** as the game changes.

### 4.1 Hex layout
- **Grid:** axial hex coordinates `(q, r)`, radius 3, which gives 37 tiles per island.
  - Centre tile: the keep.
  - Ring 1: walls, gate and towers.
  - Ring 2: buildings, placed by tier.
  - Ring 3: biome terrain (coast, forest, mountains), plus the camp slots for invading armies at the island's edge.
- The layout is **deterministic** from `seed = faction_idx`, using a tiny PRNG (mulberry32). Every client sees the same kingdom.

```ts
// lib/realm/layout.ts
export type Tile = { q: number; r: number; kind: TileKind; building?: BuildingKind; rot: number }
export function hexToWorld(q: number, r: number, size = 1) {
  return [size * Math.sqrt(3) * (q + r / 2), 0, size * 1.5 * r] as const
}
export function generateRealm(factionIdx: number): Tile[] {
  const rand = mulberry32(factionIdx * 9973)
  const biome = BIOMES[factionIdx]               // snow | volcanic | coast | cliffs | forest | swamp
  const tiles: Tile[] = []
  for (const [q, r] of hexSpiral(3)) {
    const ring = hexDistance(q, r)
    tiles.push({ q, r, rot: Math.floor(rand() * 6),
      kind: ring === 3 ? biome.edge(rand) : biome.ground,
      building: ring === 0 ? 'keep' : ring === 2 ? pickBuildingSlot(rand) : undefined })
  }
  return tiles
}
```

### 4.2 State → visuals mapping
This mapping is the heart of the "kingdom" feel. Each row is a pure function of the `Game` account.

| On-chain value | Visual |
|---|---|
| `faction.treasury` | **Treasury building tier.** A gold pile grows in the courtyard (heights 1–5), and coin particles sparkle. |
| `member_count` | **Number of houses** in ring 2 (1 house per member, capped at about 18). The player's own house gets a gold marker. |
| `treasury` (which is also strength) | **Troops.** Instanced soldiers on the walls and in the courtyard. `count = clamp(4 + 6·log10(treasury_sol+1), 4, 60)`. |
| share price trend | Keep banner height/brightness: a rising price means banners raised high; a falling one means tattered banners. |
| members leaving (a Player leaves) | A small cart rolls out of the gate carrying a coin sack. You can *see* deserters. |
| `defend_alloc` this epoch | **Wall height and glow.** Walls rise or lower by 0.1–0.6 and a shield dome tints; a higher defend share means a brighter dome. Soldiers move *onto the walls*. |
| `attack_alloc[t]` (outgoing) | A column of your soldiers **marches to the bridge or edge** facing target `t`, with that target's name on a banner. |
| Incoming `attack_alloc` from faction `i` | **Enemy camp** at the edge tile facing `i`: tents, banners in `i`'s colour, and soldiers. Camp size is proportional to their committed strength. **It updates live as enemies reallocate.** |
| `powers_mask` | One **landmark building** per power owned. Conquering a kingdom adds its landmark to your island, so you can *see* your accumulated powers. |
| `territories_owned` | **Satellite islands** (the conquered realms, rendered at 60% scale) orbit and connect via rope bridges. |
| `alive == false` | Ruins variant: grey, smoking, crows. |
| Epoch time left | Sun position and sky colour; red sky and drums in the final 10 s. |

```ts
// lib/realm/derive.ts
export function deriveRealmVisuals(game: GameState, f: number): RealmVisuals {
  const fac = game.factions[f]
  const sol = Number(fac.treasury) / 1e9
  return {
    troopCount: clamp(Math.round(4 + 6 * Math.log10(sol + 1)), 4, 60),
    houseCount: Math.min(fac.memberCount, 18),
    treasuryTier: tierOf(Number(fac.treasury) / 1e9, [0.1, 0.5, 2, 5]),
    wallHeight: 0.1 + 0.5 * defendShare(fac),
    incoming: incomingAttacks(game, f),     // [{fromFaction, strength, edgeDir}]
    outgoing: outgoingAttacks(game, f),
    landmarks: powersFromMask(fac.powersMask),
    satellites: ownedTerritories(game, f).filter(t => t !== f),
  }
}
```

### 4.3 Scene graph
```
<Canvas shadows dpr={[1, 1.75]} camera={{ position: [10, 12, 14], fov: 35 }}>
  <RealmLighting epochProgress />        // sun (directional + shadow), hemisphere fill, <Sky>/<Environment preset="sunset">
  <Clouds />                              // drei <Clouds>/<Cloud> under the island
  <Island faction={f}>
    <HexTiles tiles={layout} />           // instanced per tile kind (§6.2)
    <Walls height={wallHeight} />         // Kenney wall segments around ring 1, scaled y
    <Keep />  <Gate />  <Towers />
    <Buildings houses={houseCount} treasuryTier landmarks />
    <Banners color={factionColor} />      // cloth with vertex-shader wave
    <ShieldDome strength={defendShare} /> // transparent fresnel sphere
    <Troops count={troopCount} formation="walls|courtyard|march" />
    <EnemyCamps attacks={incoming} />     // tents + enemy troops at edge tiles
  </Island>
  {satellites.map(t => <SatelliteIsland key={t} faction={t} />)}
  <BattleDirector />                      // arena cinematics (§5)
  <Effects />                             // bloom, vignette, (tilt-shift) via @react-three/postprocessing
  <CameraRig />                           // OrbitControls clamped + cinematic overrides
</Canvas>
<RealmHUD />                              // DOM overlay (§7)
```

### 4.4 Interaction
- **Orbit:** OrbitControls limited to a polar angle of 25°–65° and a zoom distance of 8–25, with auto-rotate when idle.
- **Hover:** hovering a building outlines it (drei `<Outlines>` or postprocessing `Outline`) and shows a tooltip.
- **Click** opens the matching panel:
  - **Keep:** Defend panel.
  - **Barracks / war camp:** Attack panel, where you pick a target.
  - **Treasury:** stake and pot info.
  - **Landmark:** power description.
  - **Enemy camp:** who is attacking and with how much.
- **Owned buildings:** your own kingdom's buildings are clickable. In an enemy realm, everything is read-only (spectate) and the Attack button targets that realm.

---

## 5. Arena: the battle cinematic

A battle is **one entry in `Game.battle_log`**: `{epoch, territory, defender, attackers[], winner, roll, total}`.
Results arrive in the VRF callback a second or two after the epoch ends, so the cinematic **starts before the result is known** and branches when it lands.

### 5.1 State machine (`lib/arena/battleMachine.ts`, a tiny zustand slice, no xstate needed)
```
IDLE ──(epoch_ends_at − 10s, this territory has incoming)──► MUSTER
MUSTER   : red sky, drums, enemy camps light torches, defenders line walls        (≤10 s)
         ──(epoch rolled over: resolve_epoch tx seen / pending_vrf=true)──► CLASH
CLASH    : camera swoop to gate; armies march & collide; catapult volleys;         (loop until result)
           arrows (instanced lines); sparks/dust particles; clash SFX
         ──(battle_log has entry for (epoch, territory))──► ROLL
ROLL     : slow-mo; a spinning rune wheel/dice appears over the gate, segments    (2.5 s)
           sized by D vs A_i (the real odds); it lands on the VRF roll
         ──► HELD | FALLEN
HELD     : attackers rout & fade, defenders cheer anim, "HELD" banner, gold spoils  (3 s)
FALLEN   : gate breaks, fire on roofs, banners/roofs lerp to conqueror colour,      (4 s)
           "FALLEN TO <name>" banner; if last territory → ruins + elimination card
         ──► IDLE (camera returns)
```
- **Timeout:** if no result arrives within 8 s, stay in CLASH with a "the oracle deliberates…" toast. Stay faithful to the chain and never fake a result.
- **Skip:** a "Skip" button jumps straight to the result. Replays are available from the battle-history list, which re-runs the same machine from a log entry.
- **Odds:** the rune wheel shows the *actual* odds (`D/total`, `A_i/total`). The pointer lands on `roll / total`, so the VRF fairness is visible and explainable. This is a strong pitch point.

### 5.2 Units
- **Heroes:** at most 4 animated KayKit characters per side (knight vs barbarian), using `useAnimations` and a `SkeletonUtils.clone` per instance. They play walk → attack → hit/death or cheer.
- **The crowd:** up to 60 per side as a single `InstancedMesh` of a low-poly soldier.
  - Animate it in the vertex shader (bob and sway) or move positions on the CPU each frame. This is cheap.
  - Per-instance colour is the faction colour (`instanceColor`).
- **Formations:** sample target positions per formation (`walls`, `courtyard`, `march(dir)`, `clash(gate)`, `rout(dir)`), and damp each instance toward its target with `maath/easing.damp3`.
  Changing formation is just swapping the targets, so troops "walk" there on their own.

```ts
// components/arena/Troops.tsx (sketch)
const ref = useRef<THREE.InstancedMesh>(null!)
const pos = useMemo(() => new Float32Array(MAX * 3), [])
useFrame((_, dt) => {
  const targets = formationTargets(formation, count, dir)
  for (let i = 0; i < count; i++) {
    dampVec(pos, i, targets[i], 4, dt)
    m.makeTranslation(pos[i*3], Math.abs(Math.sin(t*8+i))*0.05, pos[i*3+2])
    ref.current.setMatrixAt(i, m)
  }
  ref.current.count = count
  ref.current.instanceMatrix.needsUpdate = true
})
```

### 5.3 Effects
- **Projectiles:** catapult stones on a parabola (`lerp` with a `sin` for height), plus an arrow volley as instanced thin boxes along arcs.
- **Particles:**
  - Impact dust and sparks: drei `<Sparkles>` bursts, or a small custom points system.
  - Fire on roofs: a flipbook sprite or a noise shader.
  - Smoke: soft billboards.
- **Screen:** a little camera shake (drei `<CameraShake>`) on impacts, plus bloom on the fire and the rune.
- **Colour takeover:** all faction-tinted materials share one uniform `uFactionColor`. FALLEN tweens it to the conqueror's colour over 1.5 s with a radial wipe from the gate (a shader `smoothstep` on distance).

### 5.4 Camera
`CameraRig` has two modes:
- **free:** OrbitControls.
- **cinematic:** a scripted path for each state, using CatmullRom curves and `damp` toward the keyframes. User orbiting is disabled during CLASH and ROLL.

---

## 6. Rendering & performance

### 6.1 Stack
| Package | Purpose |
|---|---|
| `three` | already in chain-wars (^0.180) |
| `@react-three/fiber@^9` (stable) | replaces the unused alpha in chain-wars; works with React 19 |
| `@react-three/drei` | useGLTF, OrbitControls, Sky, Clouds, Sparkles, Outlines, CameraShake, Instances, PerformanceMonitor, Html |
| `@react-three/postprocessing` | Bloom, Vignette, optional TiltShift2 for the miniature look |
| `maath` | damping and easing |
| `zustand` | game store and battle machine |
| `howler` | audio |
| `leva` | dev-only tuning panel |

### 6.2 Budget and tricks
- **Instancing:** use one `InstancedMesh` per tile kind and per prop kind, via drei `<Instances>`/`<Merged>`.
  The goal is fewer than 150 draw calls for the whole realm.
- **Shadows:** one directional shadow map (2048) aimed at the island bounds, with `shadow-camera` tightly fitted.
- **Adaptive quality:** `<PerformanceMonitor>` lowers `dpr` and disables postprocessing on weak GPUs.
- **Low-power mode:** a mobile or "Low" toggle uses no shadows, no post, and halves the troops.
- **Next.js setup:**
  - The canvas is a client component loaded with `dynamic(() => import('./RealmCanvas'), { ssr: false })`.
  - Model downloads are preloaded with `useGLTF.preload` when the user hovers a globe castle.
- **Frame loop:** keep `frameloop="always"` while in a realm. The globe page unmounts the R3F canvas, so only one WebGL context is active at a time.

### 6.3 Data → render without jank
- Only **one ER websocket subscription**, on the `Game` account, writes into zustand.
- Components select **derived slices** (`useGame(s => deriveRealmVisuals(s, f))` with shallow compare). React re-renders only when a visual *bucket* changes, for example when the troop count crosses a step.
- Per-frame motion lives in `useFrame` and refs, never in React state.

### 6.4 Recolouring kit models to 6 factions
KayKit buildings use a shared texture atlas.
- Load one variant, then swap the material for the team-coloured meshes (roofs, flags) with a `MeshStandardMaterial` whose `color` uniform is the faction colour.
- Or use `onBeforeCompile` to tint the atlas region.
- Store the per-faction materials in a `useMemo` cache.

---

## 7. HUD (DOM overlay over the canvas)

The HUD reuses the shadcn/framer-motion components from chain-wars, re-skinned.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ⟵ World   HASTINAPUR  ⚔ Fortress · Blitz      Epoch 12  ⏳ 00:41  ☀──────●── │
├──────────────┬─────────────────────────────────────────────┬──────────────────┤
│ KINGDOM      │                                             │ WAR ROOM         │
│ Treasury 4.2◎│                                             │ Your value 0.8◎  │
│ Share ◎1.12 ▲│              (3D realm canvas)              │ ○ Defend         │
│ Members 23   │                                             │ ● Attack ▸ Mgdh  │
│ Territories 2│        enemy camp ⚑ Magadh 3.1         │   Horde (61% win)│
│              │                                             │ [ Commit ]  free │
│ INCOMING ⚠   │                                             ├──────────────────┤
│ Mgdh    3.1  │                                             │ YOUR SHARE +12%  │
│ Avnt    0.9  │                                             │ [Switch −40%]    │
│              │                                             │ [Leave  −20%]    │
│              │                                             ├──────────────────┤
│              │                                             │ BATTLE LOG       │
│              │                                             │ E11 Klng ✕ Taks  │
├──────────────┴─────────────────────────────────────────────┴──────────────────┤
│ odds bar:  [■■■■■■■ defend 62% ■■■■ Mgdh  30% ■ Avnt   8%]   🔊  ⚙ Low/High    │
└───────────────────────────────────────────────────────────────────────────────┘
```

Components live in `components/realm-hud/*`:

| Component | Content |
|---|---|
| `RealmHeader` | name, power chips, epoch timer (reuses `countdown-timer.tsx`), sun dial |
| `KingdomStats` | treasury, strength, members and territories, as animated numbers |
| `IncomingPanel` | live list of attackers with their strength |
| `WarRoom` | Defend / Attack radio, valid targets (adjacency), **live win-odds preview** computed client-side with the same formula as the program, and a Commit button that sends an ER tx with the session key and shows a "free · 10 ms" badge |
| `OddsBar` | stacked bar of `D` vs each `A_i` |
| `BattleLog` | entries from `battle_log`; clicking one replays it |
| `BattleBanner` | big HELD / FALLEN / ELIMINATED cinematic text (framer-motion) |
| `YourShare` | your current value in SOL, profit or loss vs `deposited_total`, and a share-price sparkline. **Leave (−20%)** and **Switch (−40%)** buttons with confirm modals that show the exact SOL kept and lost. Disabled while a battle is resolving. A "Flee?" nudge appears when your kingdom loses a territory. |
| `JoinCard` | shown when the viewer isn't in any kingdom: "Pledge to Hastinapur", with stake input → join + delegate + session tx flow |

---

## 8. World (globe) upgrades

These go in `components/world/*` and build on chain-wars' `globe.tsx`.
- **Markers:** replace the logo discs with the mini castle GLB.
  - Use `objectThreeObject(d => castleClone(d.color))` and orient it to the surface normal.
  - It has a faction-colour flag on top, and its scale follows the treasury.
- **Territory zones:** draw each kingdom's region as a glowing hex-dot cap, `hexPolygonsData` filtered to that kingdom's countries or a circular cap polygon. Colour it with the owner faction's colour.
  Conquests then *visibly repaint the planet*.
- **Arcs:** `arcsData` from the current epoch's `attack_alloc`.
  - Stroke width scales with strength, and the dash animation speed rises as the epoch nears its end.
  - Colour is the attacker's colour.
- **Battle results:** `ringsData` bursts at the territory, red if it fell and gold if it held.
- **Elimination:** the castle crumbles (scale-down plus a smoke sprite) and the marker becomes ruins.
- **Side panels:** reuse the chain-wars leaderboard, sorted by territories, then treasury, plus a "Biggest battle this epoch" ticker.

---

## 9. Audio
- Use `howler` with sprites, in `lib/audio.ts`.
- **Music:** a calm realm loop crossfades to a battle loop on MUSTER.
- **SFX events:** commit (horn), incoming increased (war drum), clash (swords), catapult (whoosh + impact), rune spin (tick), HELD (fanfare), FALLEN (bell + crumble).
- Sound is on by default (the mute switch is remembered) and unlocks on the first click or key press, to satisfy browser autoplay rules.

---

## 10. Building it before the program exists: mock mode
- `lib/mock/mockGame.ts` produces a fake `GameState` and advances epochs every 15 s with random allocations and battles.
  It ports the formulas from `chain-wars/packages/scripts/simulate/game-simulation.js` and ARCHITECTURE.md §2.
- `NEXT_PUBLIC_MOCK=1` makes the store read from the mock instead of the ER subscription.
- The whole UI, including cinematics, can be built and demoed in parallel with the Anchor work. The data shape stays identical: the store's `GameState` type mirrors the IDL.

---

## 11. File structure (frontend)
```
app/
  app/page.tsx                 ← World (globe + leaderboard)
  app/kingdom/[id]/page.tsx    ← Realm (+ arena)
  components/world/            ← WorldGlobe, CastleMarker, AttackArcs
  components/realm/            ← RealmCanvas, Island, HexTiles, Walls, Buildings, Banners, ShieldDome, EnemyCamps, SatelliteIsland, RealmLighting, CameraRig
  components/arena/            ← BattleDirector, Troops, Heroes, Projectiles, Fire, RuneWheel, models/*.tsx (gltfjsx)
  components/realm-hud/        ← RealmHeader, KingdomStats, WarRoom, OddsBar, IncomingPanel, BattleLog, BattleBanner, JoinCard
  lib/realm/                   ← layout.ts (hex gen), derive.ts (state→visuals), factions.ts (colors, biomes, powers)
  lib/arena/                   ← battleMachine.ts, formations.ts, odds.ts (same math as program)
  lib/store/game.ts            ← zustand, fed by ER subscription or mock
  lib/mock/mockGame.ts
  lib/audio.ts
  public/models, public/sfx, public/music
```

---

## 12. Build order (UI track) with rough effort

| # | Task | Effort | Result |
|---|---|---|---|
| 1 | Fork the frontend, strip EVM, add the zustand store and mock mode | 0.5 d | the globe shows 6 mock kingdoms |
| 2 | Asset pipeline: download, optimise, kit GLBs | 0.5 d | models in `public/models` |
| 3 | Realm static: hex island, keep, walls, buildings, lighting, camera | 1 d | a pretty kingdom diorama |
| 4 | State → visuals: troops, houses, treasury, wall height, banners colour | 0.5 d | the kingdom reacts to mock state |
| 5 | Enemy camps + outgoing march + WarRoom HUD with odds | 0.5 d | live attack planning |
| 6 | Battle cinematic: state machine, clash, rune wheel, HELD / FALLEN, colour takeover | 1–1.5 d | the "wow" moment |
| 7 | Globe upgrades: castle markers, arcs, coloured zones, result rings | 0.5 d | a living world map |
| 8 | Audio, polish, low-power mode, loading screen | 0.5 d | ship quality |
| 9 | Swap mock for the real ER subscription + session-key txs | 0.5 d | on-chain |

**MVP cut**, if time runs short:
- Keep: steps 1–5, a simplified step 6 (instanced crowd only, no heroes; rune wheel plus colour takeover), and arcs from step 7.
- Stretch: animated heroes, satellite islands, fire shader, music.

---

## 11. The tactical layer in the realm (2026-10-08)

### 11.1 Warriors on the island
`components/arena/Units.tsx` draws every warrior standing in the viewed realm (marchers appear in
the realm they are walking through, first half leaving the origin, second half arriving at the
destination's edge), plus the fallen lying where they dropped until they respawn. Bodies are the
rigged crowd (`WarriorCrowd`) or the instanced soldiers in low power. Each has a faction-coloured
ring; the viewer's has a pulsing gold ring. A wounded warrior flashes white. Rings mark the enemy
under the cursor (pale red) and your attack target (pulsing red); a small gold ring marks your walk
order. Name tags (name, role, gear, kingdom, hp bar, "fallen") are plain DOM in the HUD
(`UnitLabels` in `realm-hud/Combat.tsx`), positioned every frame from the renderer's poses.
The aggregate Garrison / camp crowds / marching columns are hidden once warriors are known.

### 11.2 Controls (`lib/arena/controller.ts`, decided 2026-10-08: "every user plays with their hands")
| input | does |
|---|---|
| Left click ground | walk there; the route goes round the fort and through the gate (`planRoute` in `lib/game/units.ts`) |
| Left click enemy | chase it (re-routing round walls) and strike whenever it is in reach, until it falls |
| W A S D / arrows | walk, screen-relative (cancels click orders); Shift runs |
| Space | strike towards the cursor with the current weapon (bows shoot an arrow down the line) |
| F (hold) | raise your guard towards the cursor; walk at half speed |
| 1 – 6 | Talwar, Bhala, Dhanush, Dhal, Seedhi, Gaja (Gaja needs Gaja Sena) |
| G | rally your kingdom at the cursor (beacon + chat line; bots of your kingdom answer it) |
| Right drag / wheel | turn / zoom the chase camera |
| H | hide / show the side panels |
| Esc | cancel the current order; a second Esc leaves the realm |
The local sim applies the program's rules (walls, gate, ladder, edge) every frame (sub-stepped on
slow frames) and publishes `moveUnit` at 10 Hz; each swing is one `strike(x, z, facing)`. The
local pose is authoritative for drawing your own warrior. Typing in the chat never steers. Mouse
picking is DOM-side: a ray against the terrain height for the ground, screen distance to the
drawn warriors for enemies. Spectators (no warrior here) keep the orbit camera on the mouse.

### 11.3 Battles are fought, not watched
Warriors stay on the field and under their players' control through MUSTER → CLASH → ROLL →
HELD / FALLEN. What happened in the fight before the bell decides who is standing (and alive) when
the VRF rolls (`tactics.ts` counts only living, present warriors). The scripted `Melee` only plays
for replays and for realms whose warriors aren't tracked (devnet until Step 17). The rune wheel,
banner and HELD / FALLEN results are unchanged.

### 11.4 Camera director (`components/realm/CameraRig.tsx`, hints in `lib/arena/cameraState.ts`)
| mode | when | shot |
|---|---|---|
| follow | your warrior stands in this realm (always, through the bell too) | chase camera, pitch 1.0 rad, 7.2 u; right-drag turns, wheel zooms (3.5–14); outside the walls it drifts behind you so the fort stays ahead |
| orbit | spectating | clamped orbit, auto-rotate after 7 s idle |
| group | spectating, ≥ 3 warriors moving, no camera input for 4 s | frames the moving crowd |
| cinematic | spectating during battle phases | the §5 keyframes, re-aimed at the melee's centroid |
On entering follow the camera starts behind you looking in towards the keep. Transitions are damped.

### 11.5 HUD additions
- **Action bar** (bottom centre, `realm-hud/Combat.tsx`): health, allies / enemies here, the six weapons with the cooldown sweep and stats in the tooltip, the controls reminder, and this realm's gate health ("Hold it" / "Batter it"). Above it: your current target with its hp, and order notices ("The gate is shut while defenders hold the walls…").
- **You have fallen** overlay with the killer and the respawn countdown; **How to fight** card on the first warrior (once per browser).
- **Follow your warrior**: when it marches or respawns into another realm the realm screen follows; a "go there" button when you are watching elsewhere. Spectators see "Pledge to … to command your own warrior".
- **Sainik** (right column): where you stand, hp, role and gear pickers, March buttons to neighbours, key help.
- **War council** (left column): your kingdom's warriors and the derived plan, with an "abandoned walls" warning.
- **Kingdom chat** dock (bottom-left): members only; rally pings appear as "📍 Attack the gate of Magadh".
- **Odds bar**: shows 🛡 defenders inside / ⚔ attackers present and "WALLS ABANDONED".
- **War room**: the attack preview for this realm includes the tactical multipliers.

### 11.6 Warriors, animation and war audio (2026-10-08, user: "it should feel like war is happening")
- **Body:** the KayKit Knight (`public/models/knight/Knight.glb`, CC0, Kay Lousberg) with 76 real clips, loaded by `lib/arena/warriors.ts` (Mixamo files in `models/warrior/` still win; the old Soldier is the last fallback). The cape is painted flat in the kingdom colour.
- **Per gear** (`GEAR_KIT` in `WarriorCrowd.ts`): Talwar = sword, slice / chop alternating; Bhala = spear (built), two-handed stab; Dhanush = crossbow (KayKit asset), shot; Dhal = sword + tower shield, shield bash / chop; Seedhi = sword + ladder on the back, chop; Gaja = greatsword + shield, heavy two-handed chop, 1.28× scale.
- **One blow per strike:** every swing event (yours on the click, others' from the feed) bumps a counter that restarts the gear's attack clip, sped up to land in 0.55 s. Guard = the Blocking loop; a wound plays Hit_A (Block_Hit when guarded); 0 hp plays Death_A and lies there until respawn.
- **Preview:** `/dev/warriors` shows all six gears trading blows with the effects, `?g=0..5` frames one pair, with a slow-motion toggle.
- **Audio** (`lib/audio.ts`): recorded CC0 effects in `public/audio/sfx` (credits in `CREDITS.md`) with random variations, ±7% pitch, distance falloff and stereo pan from the camera: swings, heavy swings, sword clashes, plate / punch impacts, grunts, death cry and body fall, bow and arrow thuds, gate splinters, a gate-breaking crash, sword unsheathe on weapon switch, footsteps for your warrior, and a war horn at the muster, the clash and when a gate falls. War drums and a shouting crowd loop under the music, rising with the fight's intensity and at the bell. Sound is off until the player presses the speaker button (browser autoplay rules).
- **Visibility:** your ring and a gold chevron over your head draw through walls; the shield dome fades to 30% while you fight on foot.

### 11.7 Combat feedback (`components/arena/CombatFx.tsx`, `components/arena/Particles.tsx`)
Impacts are delayed 190 ms to the swing's impact frame. Particles (two pooled point clouds): sparks + flash on blocked blows, blood + sparks + flash on wounds, a blood burst and a dust puff when someone falls, wood debris and dust on gate hits, smoke over a battered gate (embers once it is low or broken), a big burst, shockwave ring and horn when it breaks. A glowing crescent sweeps each melee swing (bigger and amber for a Gaja), arrows fly with a light streak, a Gaja's wounding blow sends a ground shockwave. The screen edge flashes red when you are hit (gold if your guard took it) and pulses red below 30 hp.

### 11.8 Floating numbers and labels
Reads the store's combat events and animates the new ones in the viewed realm: floating damage
numbers (gold for yours, red when you are hit, "blocked", "✝" kills, "gate −14", "GATE BROKEN")
drawn by the DOM `FloaterLayer`, arrows in flight, a sword sweep arc, synthesized sounds (swing,
hit, hurt, arrow, death, gate), camera shake when you are hit or a gate breaks, and a toast for
your own kills. Rally beacons (`Rallies`) are a light pillar in your kingdom's colour.
Scene labels use `components/three/Html.tsx` (a drei `<Html>` subset that defers its root
unmount; drei 10's synchronous unmount throws under React 19 when labels come and go).
