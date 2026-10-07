// Diagnostic: measures ER RPC + confirmation latency.  npx ts-node scripts/er-latency.ts
import { Connection, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
(async () => {
  const er = new Connection(process.env.EPHEMERAL_PROVIDER_ENDPOINT || "http://localhost:7799", { wsEndpoint: process.env.EPHEMERAL_WS_ENDPOINT || "ws://localhost:7800", commitment: "confirmed" });
  const kp = Keypair.generate();
  for (const label of ["getLatestBlockhash", "getSlot"]) {
    const t = Date.now(); await (label === "getSlot" ? er.getSlot() : er.getLatestBlockhash()); console.log(label, Date.now() - t, "ms");
  }
  const { blockhash, lastValidBlockHeight } = await er.getLatestBlockhash();
  console.log("lastValidBlockHeight", lastValidBlockHeight, "blockHeight", await er.getBlockHeight());
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: kp.publicKey, lamports: 0 }));
  tx.recentBlockhash = blockhash; tx.feePayer = kp.publicKey; tx.sign(kp);
  const t = Date.now();
  const sig = await er.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  try { const r = await er.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed"); console.log("confirm", Date.now() - t, "ms", JSON.stringify(r.value)); }
  catch (e) { console.log("confirm threw after", Date.now() - t, "ms", (e as Error).message.slice(0, 80)); }
  const t2 = Date.now(); const st = await er.getSignatureStatuses([sig]); console.log("status poll", Date.now() - t2, "ms", JSON.stringify(st.value[0]));
  process.exit(0);
})();
