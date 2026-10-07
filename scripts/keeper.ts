// Keeper: rings the epoch bell (permissionless resolve_epoch) whenever an epoch is over, so the
// war keeps moving even if nobody is online. Fallback for the ER crank.
//   GAME_ID=1 yarn keeper
import * as anchor from "@coral-xyz/anchor";
import { KINGDOMS, env, gamePda, programs, sleep } from "./client";

async function main() {
  const wallet = anchor.Wallet.local();
  const { programER } = programs(wallet);
  const game = gamePda(Number(process.env.GAME_ID || 1));
  let lastEpoch = -1;
  let lastBattles = 0;
  console.log(`keeper for ${game.toBase58()} on ${env.er}`);
  for (;;) {
    try {
      const g = await programER.account.game.fetch(game);
      if ("ended" in g.phase) {
        console.log(`war over — ${KINGDOMS[g.winner]} rules the globe`);
        return;
      }
      if (g.epoch !== lastEpoch) {
        for (let i = lastBattles; i < g.battleCount; i++) {
          const e = g.battleLog[i % g.battleLog.length];
          const verdict = e.winner === e.defender ? "HELD" : `FELL to ${KINGDOMS[e.winner]}`;
          console.log(`  epoch ${e.epoch}: ${KINGDOMS[e.territory]} ${verdict} (roll ${e.roll}/${e.total})`);
        }
        lastBattles = g.battleCount;
        lastEpoch = g.epoch;
      }
      const now = Math.floor(Date.now() / 1000);
      const stale = g.pendingVrf && now - g.vrfRequestedAt.toNumber() >= 30;
      if ("active" in g.phase && now >= g.epochEndsAt.toNumber() && (!g.pendingVrf || stale)) {
        const sig = await programER.methods
          .resolveEpoch(Math.floor(Math.random() * 256))
          .accountsPartial({ payer: wallet.publicKey, game, oracleQueue: env.vrfQueue })
          .rpc();
        console.log(`bell rung for epoch ${g.epoch}: ${sig.slice(0, 16)}…`);
      }
    } catch (e) {
      console.warn("keeper:", (e as Error).message.split("\n")[0]);
    }
    await sleep(1000);
  }
}

main();
