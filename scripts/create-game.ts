// Opens the next Samrajya war (its lobby lives on Solana), starts it (which moves the war and every
// member to the MagicBlock ER), or aborts a broken one. Wars are sequential: war N+1 can only be
// opened once war N has ended and been committed back to Solana. Anyone may open or start a war
// (the app has buttons for both); this script is for the very first one and for ops.
//   EPOCH_SECS=90 yarn create-game         → lobby open on Solana (anyone may start it after LOBBY_SECS)
//   yarn create-game --start               → start the newest war now (authority) and move it to the ER
//   yarn create-game --abort               → authority: end the newest war with no winner (everyone
//                                            can claim their value back) and bring it back to Solana
// Env: PROVIDER_ENDPOINT / EPHEMERAL_PROVIDER_ENDPOINT / VALIDATOR (defaults: devnet), ANCHOR_WALLET,
//      TICKET_SOL, EPOCH_SECS, LOBBY_SECS, BASE_DEFENSE_SOL, PLAINS_DEFENSE_SOL, STORM_DECAY_BPS.
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Transaction } from "@solana/web3.js";
import {
  DELEGATION,
  bringWarToSolana,
  env,
  gameConfig,
  gamePda,
  latestGameId,
  moveWarToER,
  nextGame,
  programs,
  registryPda,
  send,
  vaultPda,
  waitForCommit,
  waitForUndelegation,
} from "./client";

const num = (k: string) => (process.env[k] ? Number(process.env[k]) : undefined);

async function main() {
  const wallet = anchor.Wallet.local();
  const { base, er, program, programER } = programs(wallet);
  const payer = wallet.payer;
  console.log(`base ${env.base}\nER   ${env.er}`);
  const sendAll = async (provider: anchor.AnchorProvider, txs: Transaction[], what: string) => {
    let last = "";
    for (const t of txs) {
      last = await send(provider, t, [payer]);
      console.log(`  ${what}: ${last}`);
    }
    return last;
  };

  if (process.argv.includes("--start")) {
    const id = await latestGameId(program);
    if (id === null) throw new Error("no war has been opened yet");
    await sendAll(base, await moveWarToER(program, id, wallet.publicKey), "start + delegate");
    console.log(`war ${id} started and moved to the ER`);
    return;
  }

  if (process.argv.includes("--abort")) {
    const id = await latestGameId(program);
    if (id === null) throw new Error("no war has been opened yet");
    const game = gamePda(id);
    const onER = (await base.connection.getAccountInfo(game))?.owner.equals(DELEGATION);
    const provider = onER ? er : base;
    const p = onER ? programER : program;
    // a war opened by an older program may not decode with this IDL: let the program judge
    const g = await p.account.game.fetch(game).catch(() => null);
    if (!g || !("ended" in g.phase)) {
      const sig = await send(provider, new Transaction().add(await p.methods.abortGame().accountsPartial({ authority: wallet.publicKey, game }).instruction()), [payer]);
      console.log(`war ${id} aborted: ${sig}`);
    }
    if (onER) {
      const last = await sendAll(er, await bringWarToSolana(programER, base.connection, id, wallet.publicKey), "commit + undelegate");
      await waitForCommit(er.connection, last);
      await waitForUndelegation(base.connection, game, 120_000);
      console.log(`war ${id} is back on Solana; members can claim their value`);
    }
    return;
  }

  const { id, previous } = await nextGame(program);
  const game = gamePda(id);
  const config = gameConfig({
    epochSecs: num("EPOCH_SECS"),
    ticketSol: num("TICKET_SOL"),
    lobbySecs: num("LOBBY_SECS"),
    baseDefenseSol: num("BASE_DEFENSE_SOL"),
    plainsDefenseSol: num("PLAINS_DEFENSE_SOL"),
    stormDecayBps: num("STORM_DECAY_BPS"),
  });
  const sig = await program.methods
    .initGame(new BN(id), config)
    .accountsPartial({ authority: wallet.publicKey, game, registry: registryPda(), previous, vault: vaultPda(game) })
    .rpc();
  console.log(`init_game ${id} → ${game.toBase58()}:`, sig);
  console.log(`\nLobby is open on Solana. It moves to the ER when the war starts. The app follows the registry, so it shows war ${id} automatically.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
