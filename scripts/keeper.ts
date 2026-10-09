// Keeper: drives the war through its layers so it keeps moving even if nobody is online.
//   lobby on Solana  → when the lobby timer is over (2+ kingdoms), start it and delegate the Game
//                      and every member to the MagicBlock ER
//   war on the ER    → ring the epoch bell (permissionless resolve_epoch); delegate members who
//                      enlisted while the war was moving
//   war ended        → commit + undelegate every member and the Game back to Solana for claims
// It follows the registry to the newest war. Fallback for the ER crank.
//   yarn keeper            (GAME_ID=n pins one war)
import * as anchor from "@coral-xyz/anchor";
import { Transaction } from "@solana/web3.js";
import {
  DELEGATION,
  TERRITORIES,
  bringWarToSolana,
  env,
  gamePda,
  latestGameId,
  moveWarToER,
  musterAccounts,
  ownerName,
  programs,
  send,
  sleep,
} from "./client";

/** Base-layer reads are rate-limited on public devnet: registry / sweeps at most this often. */
const BASE_EVERY_MS = 20_000;
/** How often to look at a lobby (it lives on Solana). */
const LOBBY_EVERY_MS = 5_000;

async function main() {
  const wallet = anchor.Wallet.local();
  const { base, er, program, programER } = programs(wallet);
  const pinned = process.env.GAME_ID ? Number(process.env.GAME_ID) : null;
  let current = -1;
  let lastEpoch = -1;
  let lastBattles = 0;
  let released = false;
  let id: number | null = pinned;
  let delegated = false;
  let baseAt = 0;
  const sendAll = async (provider: anchor.AnchorProvider, txs: Transaction[]) => {
    for (const t of txs) await send(provider, t, [wallet.payer]);
  };
  console.log(`keeper on ${env.er}${pinned !== null ? ` (war ${pinned})` : " (following the newest war)"}`);
  for (;;) {
    try {
      const sweep = Date.now() - baseAt >= BASE_EVERY_MS;
      if (sweep) {
        baseAt = Date.now();
        if (pinned === null) id = await latestGameId(program);
        if (id !== null) delegated = !!(await base.connection.getAccountInfo(gamePda(id)))?.owner.equals(DELEGATION);
      }
      if (id === null) {
        await sleep(2000);
        continue;
      }
      const game = gamePda(id);
      if (id !== current) {
        console.log(`war ${id} → ${game.toBase58()}`);
        current = id;
        lastEpoch = -1;
        lastBattles = 0;
        released = false;
      }
      const now = Math.floor(Date.now() / 1000);

      if (!delegated) {
        // On Solana: a lobby, a war that started but did not move yet, or an ended war.
        const g = await program.account.game.fetch(game);
        if ("lobby" in g.phase) {
          const ready = now >= g.epochEndsAt.toNumber() && g.factions.filter((f) => f.members > 0).length >= 2;
          if (ready) {
            await sendAll(base, await moveWarToER(program, id, wallet.publicKey));
            console.log(`war ${id} started (lobby timer over) and moved to the ER`);
            delegated = true;
          }
        } else if ("active" in g.phase) {
          await sendAll(base, await moveWarToER(program, id, wallet.publicKey));
          console.log(`war ${id} moved to the ER`);
          delegated = true;
        }
        await sleep(LOBBY_EVERY_MS);
        continue;
      }

      const g = await programER.account.game.fetch(game);
      if (g.epoch !== lastEpoch) {
        for (let i = lastBattles; i < g.battleCount; i++) {
          const e = g.battleLog[i % g.battleLog.length];
          const verdict = e.winner === e.defender ? `HELD by ${ownerName(e.defender)}` : `FELL to ${ownerName(e.winner)}`;
          console.log(`  epoch ${e.epoch}: ${TERRITORIES[e.territory]} ${verdict} ${e.byFight ? "(decided by the fight)" : `(roll ${e.roll}/${e.total})`}`);
        }
        lastBattles = g.battleCount;
        lastEpoch = g.epoch;
      }
      if ("ended" in g.phase) {
        if (!released) {
          console.log(`war ${id} over — ${g.winner === 255 ? "aborted" : `${ownerName(g.winner)} rules every territory`}; bringing it back to Solana`);
          await sendAll(er, await bringWarToSolana(programER, base.connection, id, wallet.publicKey));
          released = true;
          baseAt = 0; // look for the next war soon
        }
      } else {
        // members who enlisted while the war was moving still need to come to the ER
        if (sweep) await sendAll(base, await moveWarToER(program, id, wallet.publicKey));
        const stale = g.pendingVrf && now - g.vrfRequestedAt.toNumber() >= 30;
        if (now >= g.epochEndsAt.toNumber() && (!g.pendingVrf || stale)) {
          const sig = await programER.methods
            .resolveEpoch(Math.floor(Math.random() * 256))
            .accountsPartial({ payer: wallet.publicKey, game, oracleQueue: env.vrfQueue })
            // every member's warrior: the program reads the hand fight at each fort
            .remainingAccounts(await musterAccounts(programER, id))
            .rpc();
          console.log(`bell rung for epoch ${g.epoch}: ${sig.slice(0, 16)}…`);
        }
      }
    } catch (e) {
      console.warn("keeper:", (e as Error).message.split("\n")[0]);
    }
    await sleep(1000);
  }
}

main();
