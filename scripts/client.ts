// Shared TS helpers for tests, scripts and (by copy) the frontend.
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { GetCommitmentSignature } from "@magicblock-labs/ephemeral-rollups-sdk";
import type { Samrajya } from "../target/types/samrajya";
import idl from "../target/idl/samrajya.json";

export const DEFEND = 255;
export const KINGDOMS = ["Hastinapur", "Magadh", "Kalinga", "Takshashila", "Vijayanagar", "Avanti"];

export const env = {
  base: process.env.PROVIDER_ENDPOINT || "https://api.devnet.solana.com",
  baseWs: process.env.WS_ENDPOINT,
  er: process.env.EPHEMERAL_PROVIDER_ENDPOINT || "https://devnet-as.magicblock.app/",
  erWs: process.env.EPHEMERAL_WS_ENDPOINT || "wss://devnet-as.magicblock.app/",
  // Devnet Asia ER validator; local stack uses mAGic...
  validator: new PublicKey(process.env.VALIDATOR || "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
  vrfQueue: new PublicKey(process.env.VRF_EPHEMERAL_QUEUE || "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc"),
};

export function programs(wallet: anchor.Wallet) {
  const base = new anchor.AnchorProvider(
    new Connection(env.base, { wsEndpoint: env.baseWs, commitment: "confirmed" }),
    wallet,
    { commitment: "confirmed", skipPreflight: true },
  );
  const er = new anchor.AnchorProvider(
    new Connection(env.er, { wsEndpoint: env.erWs, commitment: "confirmed" }),
    wallet,
    { commitment: "confirmed", skipPreflight: true },
  );
  return {
    base,
    er,
    program: new Program<Samrajya>(idl as Samrajya, base),
    programER: new Program<Samrajya>(idl as Samrajya, er),
  };
}

export const programId = new PublicKey(idl.address);

export function gamePda(gameId: number | BN) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game"), new BN(gameId).toArrayLike(Buffer, "le", 8)],
    programId,
  )[0];
}
export function vaultPda(game: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), game.toBuffer()], programId)[0];
}
export function playerPda(game: PublicKey, wallet: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), game.toBuffer(), wallet.toBuffer()],
    programId,
  )[0];
}

/** Sends a tx built by anchor with the given signers (first is fee payer). */
export async function send(provider: anchor.AnchorProvider, tx: Transaction, signers: Keypair[], attempts = 3) {
  const conn = provider.connection;
  let sig = "";
  let res: Awaited<ReturnType<Connection["confirmTransaction"]>> | undefined;
  for (let i = 0; i < attempts && !res; i++) {
    // Fresh blockhash each attempt: an identical tx (same args, same blockhash) gets deduped
    // and never confirms, which happens on the ER where blocks are very fast.
    tx.feePayer = signers[0].publicKey;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.signatures = [];
    tx.sign(...signers);
    sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    try {
      res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    } catch (e) {
      if (i === attempts - 1) throw e;
    }
  }
  if (res.value.err) {
    const logs = (await provider.connection.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }))
      ?.meta?.logMessages;
    throw new Error(`tx ${sig} failed: ${JSON.stringify(res.value.err)}\n${(logs || []).join("\n")}`);
  }
  return sig;
}

export async function waitForCommit(erConnection: Connection, erSig: string) {
  return GetCommitmentSignature(erSig, erConnection);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function valueOf(f: { treasury: BN; totalShares: BN; generation: number }, shares: BN, generation: number) {
  if (generation !== f.generation || f.totalShares.isZero()) return new BN(0);
  return shares.mul(f.treasury).div(f.totalShares);
}

/** After commit_and_undelegate, wait until the base layer hands the account back to our program. */
export async function waitForUndelegation(conn: Connection, account: PublicKey, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await conn.getAccountInfo(account, "confirmed");
    if (info && info.owner.equals(programId)) return;
    await sleep(1000);
  }
  throw new Error(`${account.toBase58()} still delegated after ${timeoutMs} ms`);
}
