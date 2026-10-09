// Pays every member of an aborted war (winner = NEUTRAL) their value back. `claim` is
// permissionless and always pays `player.wallet`, so the keeper wallet can push the refunds.
//   GAME_ID=2 ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/refund-aborted.ts
import * as anchor from "@coral-xyz/anchor";
import { Transaction } from "@solana/web3.js";
import { DELEGATION, NEUTRAL, gamePda, playerHead, programs, send, vaultPda } from "./client";

async function main() {
  const wallet = anchor.Wallet.local();
  const { base, program } = programs(wallet);
  const id = Number(process.env.GAME_ID);
  const game = gamePda(id);
  const info = await base.connection.getAccountInfo(game);
  if (!info || info.owner.equals(DELEGATION)) throw new Error(`war ${id} is not back on Solana`);
  // a war opened by an older program may not decode with this IDL: `claim` checks it on-chain
  const g = await program.account.game.fetch(game).catch(() => null);
  if (g && (!("ended" in g.phase) || g.winner !== NEUTRAL)) throw new Error(`war ${id} was not aborted`);
  const disc = program.coder.accounts.memcmp("player");
  const players = await base.connection.getProgramAccounts(program.programId, {
    filters: [{ memcmp: { offset: 0, bytes: disc.bytes! } }, { memcmp: { offset: 40, bytes: game.toBase58() } }],
  });
  for (const a of players) {
    const p = playerHead(program, a.account.data);
    if (p.claimed || (p.shares.isZero() && p.pendingDeposit.isZero())) continue;
    const tx = new Transaction().add(
      await program.methods.claim().accountsPartial({ payer: wallet.publicKey, game, player: a.pubkey, wallet: p.wallet, vault: vaultPda(game) }).instruction(),
    );
    try {
      console.log(`refunded ${p.wallet.toBase58()}: ${await send(base, tx, [wallet.payer])}`);
    } catch (e) {
      console.log(`no refund for ${p.wallet.toBase58()} (eliminated kingdom): ${(e as Error).message.split("\n")[0]}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
