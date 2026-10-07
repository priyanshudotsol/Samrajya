// Creates a Samrajya war, delegates it to the ER, and (optionally) starts it.
//   GAME_ID=1 EPOCH_SECS=60 yarn create-game            → lobby open (players can pledge)
//   GAME_ID=1 yarn create-game --start                  → start an existing lobby
// Env: PROVIDER_ENDPOINT / EPHEMERAL_PROVIDER_ENDPOINT / VALIDATOR (defaults: devnet), ANCHOR_WALLET.
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { env, gamePda, programs, sleep, vaultPda } from "./client";

async function main() {
  const wallet = anchor.Wallet.local();
  const { program, programER } = programs(wallet);
  const gameId = Number(process.env.GAME_ID || 1);
  const game = gamePda(gameId);
  const vault = vaultPda(game);
  console.log(`game ${gameId} → ${game.toBase58()}\nbase ${env.base}\nER   ${env.er}`);

  if (process.argv.includes("--start")) {
    const sig = await programER.methods.startGame().accountsPartial({ authority: wallet.publicKey, game }).rpc();
    console.log("war started:", sig);
    return;
  }

  const exists = await program.provider.connection.getAccountInfo(game);
  if (!exists) {
    const config = {
      minStake: new BN(Number(process.env.MIN_STAKE_SOL || 0.05) * LAMPORTS_PER_SOL),
      epochSecs: new BN(Number(process.env.EPOCH_SECS || 60)),
      leaveFeeBps: 2000,
      switchFeeBps: 4000,
      kLossBps: 2000,
      stormDecayBps: Number(process.env.STORM_DECAY_BPS || 500),
      baseDefense: new BN(Number(process.env.BASE_DEFENSE_SOL || 0.1) * LAMPORTS_PER_SOL),
      adjacency: [0b100110, 0b001101, 0b010011, 0b110010, 0b101100, 0b011001],
    };
    const sig = await program.methods.initGame(new BN(gameId), config).accountsPartial({ authority: wallet.publicKey, game, vault }).rpc();
    console.log("init_game:", sig);
  } else {
    console.log("game already exists");
  }
  if (exists?.owner.toBase58() !== "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh") {
    const sig = await program.methods
      .delegateGame(new BN(gameId))
      .accountsPartial({ authority: wallet.publicKey, pda: game, validator: env.validator })
      .rpc();
    console.log("delegate_game:", sig);
    await sleep(3000);
  }
  if (process.argv.includes("--start-now")) {
    const sig = await programER.methods.startGame().accountsPartial({ authority: wallet.publicKey, game }).rpc();
    console.log("war started:", sig);
  }
  console.log(`\nLobby is open. Frontend: NEXT_PUBLIC_GAME_ID=${gameId} NEXT_PUBLIC_PROGRAM_ID=${program.programId.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
