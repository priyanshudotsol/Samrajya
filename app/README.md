# Samrajya: frontend (`app/`)

Next.js 15, React 19, react-three-fiber and Tailwind v4. See the [root README](../README.md) for the game, and [`../docs/`](../docs) for the design.

```bash
pnpm install
NEXT_PUBLIC_MOCK=1 pnpm dev            # in-browser mock war with bots, no wallet needed
cp .env.devnet.example .env.local      # or: the live devnet war (add Supabase keys for chat)
pnpm dev                               # http://localhost:3000
pnpm test                              # rules, combat and mock-war tests (tsx --test)
pnpm build
```

| Path | What |
|---|---|
| `app/page.tsx`, `components/world/` | World map: the sky archipelago, Kurukshetra in the middle, leaderboard, battles |
| `app/kingdom/[id]` | A realm (0–5 kingdoms, 6 Kurukshetra): 3D scene + HUD |
| `components/realm/` | Islands, forts, Kurukshetra's stone circle (`PlainsScene`), camera |
| `components/arena/` | Warriors (`Units`, `WarriorCrowd`), combat effects (`CombatFx`, `Particles`) |
| `components/realm-hud/` | HUD: War room, Sainik panel, action bar, kingdom chat, war council, music |
| `components/chain/` | Where the war lives + every ER / Solana transaction |
| `lib/game/` | Rules mirrored from the program: `math`, `units`, `combat`, `tactics` |
| `lib/actions/` | Player actions (mock, chain: session keys, ER moves and strikes) |
| `lib/solana/`, `lib/chain/` | Program client, the war's trip between Solana and the ER, warrior + tx feeds |
| `lib/arena/` | Controller (mouse + keyboard), hit feel (`fx`), camera state, warrior models |
| `lib/mock/` | The mock game and its bots |
| `lib/chat/`, `lib/multiplayer/` | Supabase kingdom chat and the shared lobby battlefield |
| `app/api/chat/token` | Mints a chat token after a wallet signature + on-chain membership check |
| `supabase/chat.sql` | Realtime policies for the chat rooms and the lobby battlefield |
