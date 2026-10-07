// Smoke test for the chain feed: fetches the live Game through the same code the UI uses.
//   NEXT_PUBLIC_GAME_ID=1 npx tsx scripts/smoke-feed.ts
import { erConnection, baseConnection } from '../lib/solana/connections';
import { gamePda, isDelegated, programs } from '../lib/solana/program';
import { toGame } from '../lib/solana/decode';
import { KINGDOMS } from '../lib/game/factions';
import { formatSol, sharePrice } from '../lib/game/math';

(async () => {
  const game = gamePda();
  const delegated = await isDelegated(game);
  const conn = delegated ? erConnection() : baseConnection();
  const info = await conn.getAccountInfo(game, 'confirmed');
  if (!info) throw new Error(`no game at ${game.toBase58()}`);
  const g = toGame(programs().er.coder.accounts.decode('game', info.data));
  console.log(`game ${g.gameId} @ ${game.toBase58()} (${delegated ? 'on ER' : 'on base'})`);
  console.log(`phase ${g.phase}, epoch ${g.epoch}, epochSecs ${g.config.epochSecs}, minStake ${formatSol(g.config.minStake)} SOL`);
  g.factions.forEach((f, i) =>
    console.log(`  ${KINGDOMS[i].name.padEnd(12)} treasury ${formatSol(f.treasury)}  members ${f.members}  price ${sharePrice(f).toFixed(3)}  alive ${f.alive}`),
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
