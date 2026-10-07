// Drives the real UI action layer (lib/actions/chain-actions.ts) from Node with a throwaway
// keypair as the "browser wallet": pledge (session key + join + delegate + ER enlist) → leave
// (session-signed ER leave + commit) → base withdraw.
//   FUNDER=~/.config/solana/id.json NEXT_PUBLIC_GAME_ID=1 npx tsx scripts/smoke-actions.ts
import fs from 'node:fs';
import os from 'node:os';
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';

// Minimal localStorage so session keys persist between actions, like in a browser.
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

(async () => {
  const { chainActions } = await import('../lib/actions/chain-actions');
  const { baseConnection, erConnection } = await import('../lib/solana/connections');
  const { gamePda, playerPda, programs, isDelegated } = await import('../lib/solana/program');
  const { toPlayer } = await import('../lib/solana/decode');

  const funderPath = (process.env.FUNDER || '~/.config/solana/id.json').replace('~', os.homedir());
  const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(funderPath, 'utf8'))));
  const user = Keypair.generate();
  const conn = baseConnection();
  const fund = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: user.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL }),
  );
  fund.feePayer = funder.publicKey;
  fund.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  fund.sign(funder);
  await conn.confirmTransaction(await conn.sendRawTransaction(fund.serialize()), 'confirmed');

  let popups = 0;
  const wallet = {
    publicKey: user.publicKey,
    async signTransaction<T extends Transaction>(tx: T) {
      popups++;
      tx.partialSign(user);
      return tx;
    },
  };
  const actions = chainActions(wallet, (s) => console.log('  step:', s));
  const player = playerPda(gamePda(), user.publicKey);
  const readPlayer = async () => {
    const c = (await isDelegated(player)) ? erConnection() : conn;
    const info = await c.getAccountInfo(player, 'confirmed');
    return info ? toPlayer(programs().er.coder.accounts.decode('player', info.data), null) : null;
  };

  console.log('wallet', user.publicKey.toBase58());
  let t = Date.now();
  await actions.pledge(2, BigInt(0.05 * LAMPORTS_PER_SOL));
  const p1 = await readPlayer();
  console.log(`pledged to Kalinga in ${Date.now() - t} ms, popups so far ${popups}, shares ${p1?.shares}`);

  t = Date.now();
  const before = popups;
  await actions.switchKingdom(4);
  console.log(`switched to Vijayanagar in ${Date.now() - t} ms with ${popups - before} popups (session key)`);

  t = Date.now();
  const balBefore = await conn.getBalance(user.publicKey);
  await actions.leave();
  const balAfter = await conn.getBalance(user.publicKey);
  console.log(`left + withdrew in ${Date.now() - t} ms, +${(balAfter - balBefore) / LAMPORTS_PER_SOL} SOL, total popups ${popups}`);

  // Return the test SOL.
  const back = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: funder.publicKey, lamports: balAfter - 5000 }),
  );
  back.feePayer = user.publicKey;
  back.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  back.sign(user);
  await conn.sendRawTransaction(back.serialize());
  process.exit(0);
})().catch((e) => {
  console.error('SMOKE FAILED:', e);
  process.exit(1);
});
