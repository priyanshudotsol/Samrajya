# Samrajya — frontend (`app/`)

Next.js 15 + React 19 + Tailwind v4. Forked from the chain-wars frontend; EVM code removed.
Design docs live in `../docs/`.

```bash
pnpm install
cp .env.example .env.local   # NEXT_PUBLIC_MOCK=1 runs the in-browser mock game
pnpm dev                     # http://localhost:3000
pnpm test                    # rules math + mock simulation (tsx --test)
pnpm build
```

- `lib/game/` types (mirror of the Anchor accounts), kingdoms, rules math (port of `math.rs`)
- `lib/mock/mockGame.ts` bots + 15 s epochs; `lib/store/game.ts` zustand store (`subscribeMock`, `subscribeER` TODO)
- `components/world/` World screen (globe, castles, arcs, rings, war room); `app/kingdom/[id]` realm placeholder
- `components/realm/` reserved for the R3F realm (Step 12)
