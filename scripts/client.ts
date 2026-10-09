// Shared TS helpers for tests, scripts and (by copy) the frontend.
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { GetCommitmentSignature } from "@magicblock-labs/ephemeral-rollups-sdk";
import type { Samrajya } from "../target/types/samrajya";
import idl from "../target/idl/samrajya.json";

export const DEFEND = 255;
export const NEUTRAL = 255;
export const PLAINS = 6;
export const KINGDOMS = ["Hastinapur", "Magadh", "Kalinga", "Takshashila", "Vijayanagar", "Avanti"];
/** Territory names: the six homelands plus the central plains. */
export const TERRITORIES = [...KINGDOMS, "Kurukshetra"];
/** Name of a territory owner or battle side (`NEUTRAL` = the plains garrison). */
export const ownerName = (o: number) => (o === NEUTRAL ? "Garrison" : KINGDOMS[o]);
/** Same as DEFAULT_ADJACENCY in programs/samrajya/src/constants.rs (bit 6 = the plains). */
export const ADJACENCY = [0b1100110, 0b1001101, 0b1010011, 0b1110010, 0b1101100, 0b1011001, 0b0111111];

/** A `GameConfig` with the default rules (docs/ARCHITECTURE.md §2); SOL amounts in SOL. */
export function gameConfig(o: { epochSecs?: number; ticketSol?: number; baseDefenseSol?: number; plainsDefenseSol?: number; stormDecayBps?: number; lobbySecs?: number } = {}) {
  const sol = (x: number) => new BN(Math.round(x * LAMPORTS_PER_SOL));
  return {
    ticket: sol(o.ticketSol ?? 0.1),
    epochSecs: new BN(o.epochSecs ?? 90),
    leaveFeeBps: 2000,
    switchFeeBps: 4000,
    kLossBps: 2000,
    stormDecayBps: o.stormDecayBps ?? 500,
    baseDefense: sol(o.baseDefenseSol ?? 0.1),
    adjacency: ADJACENCY,
    plainsDefense: sol(o.plainsDefenseSol ?? 0.3),
    plainsTaxBps: 1000,
    upgradeCostBps: 500,
    upgradeBonusBps: 1500,
    conquestBonusBps: 1500,
    lobbySecs: new BN(o.lobbySecs ?? 120),
  };
}

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
/** Owner of accounts while they are delegated to the ER. */
export const DELEGATION = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

export function gamePda(gameId: number | BN) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game"), new BN(gameId).toArrayLike(Buffer, "le", 8)],
    programId,
  )[0];
}
export function registryPda() {
  return PublicKey.findProgramAddressSync([Buffer.from("registry")], programId)[0];
}

/** The registry's newest war, or null before the first one. */
export async function latestGameId(program: Program<Samrajya>): Promise<number | null> {
  const r = await program.account.registry.fetchNullable(registryPda());
  return r ? r.latestGame.toNumber() : null;
}

/**
 * Accounts for `init_game` of the next war: the next id after the registry's newest (or the first
 * unused id before any registry exists) and the previous game, which must be Ended on base.
 */
export async function nextGame(program: Program<Samrajya>) {
  const latest = await latestGameId(program);
  if (latest !== null) return { id: latest + 1, previous: gamePda(latest) as PublicKey | null };
  let id = 1;
  while (await program.provider.connection.getAccountInfo(gamePda(id))) id++;
  return { id, previous: null as PublicKey | null };
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

// ------------------------------------------------------------------ the war's trip between the layers
// Same as app/lib/solana/lifecycle.ts (docs/ARCHITECTURE.md §4 "Layers"): the lobby lives on
// Solana; starting the war delegates the Game and every member to the ER; when one kingdom holds
// everything, every member and the Game are committed and undelegated back to Solana.

const PER_TX = 4;
const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function playersOn(program: Program<Samrajya>, conn: Connection, game: PublicKey) {
  const disc = program.coder.accounts.memcmp("player");
  const accs = await conn.getProgramAccounts(program.programId, {
    commitment: "confirmed",
    filters: [{ memcmp: { offset: 0, bytes: disc.bytes! } }, { memcmp: { offset: 40, bytes: game.toBase58() } }],
  });
  return accs.map((a) => ({ pubkey: a.pubkey, ...playerHead(program, a.account.data) }));
}

/**
 * The fields the lifecycle needs from a Player, also from accounts written by an older program
 * (shorter layout): wallet @8, game @40, bump, faction, generation, shares (u128) @78,
 * pending_deposit @94, pending_withdrawal @102.
 */
export function playerHead(program: Program<Samrajya>, data: Buffer) {
  try {
    return program.coder.accounts.decode("player", data) as { wallet: PublicKey; shares: BN; pendingWithdrawal: BN; pendingDeposit: BN; claimed: boolean };
  } catch {
    return {
      wallet: new PublicKey(data.subarray(8, 40)),
      shares: new BN(data.subarray(78, 94), "le"),
      pendingDeposit: new BN(data.subarray(94, 102), "le"),
      pendingWithdrawal: new BN(data.subarray(102, 110), "le"),
      claimed: false,
    };
  }
}

/** Base txs: start the lobby (if still open) + delegate the Game, then delegate every enlisted member on Solana. */
export async function moveWarToER(program: Program<Samrajya>, id: number, payer: PublicKey): Promise<Transaction[]> {
  const conn = program.provider.connection;
  const game = gamePda(id);
  const txs: Transaction[] = [];
  const info = await conn.getAccountInfo(game, "confirmed");
  if (!info) throw new Error(`no war ${id}`);
  if (info.owner.equals(programId)) {
    const g = program.coder.accounts.decode("game", info.data) as { phase: Record<string, unknown> };
    if ("ended" in g.phase) return [];
    const t = new Transaction();
    if ("lobby" in g.phase) t.add(await program.methods.startGame().accountsPartial({ signer: payer, game }).instruction());
    t.add(await program.methods.delegateGame(new BN(id)).accountsPartial({ payer, pda: game, validator: env.validator }).instruction());
    txs.push(t);
  }
  const waiting = (await playersOn(program, conn, game)).filter((p) => !p.shares.isZero() && p.pendingWithdrawal.isZero());
  for (const group of chunk(waiting, PER_TX)) {
    const t = new Transaction();
    for (const p of group) {
      t.add(await program.methods.delegatePlayer().accountsPartial({ payer, wallet: p.wallet, game, pda: p.pubkey, validator: env.validator }).instruction());
    }
    txs.push(t);
  }
  return txs;
}

/** ER txs: `release_players` for every member still delegated, then `end_game`. */
export async function bringWarToSolana(programER: Program<Samrajya>, baseConn: Connection, id: number, payer: PublicKey): Promise<Transaction[]> {
  const game = gamePda(id);
  const onER = await playersOn(programER, programER.provider.connection, game);
  const owners = await baseConn.getMultipleAccountsInfo(onER.map((p) => p.pubkey), "confirmed");
  const delegated = onER.filter((_, i) => owners[i]?.owner.equals(DELEGATION));
  const txs: Transaction[] = [];
  for (const group of chunk(delegated, PER_TX)) {
    txs.push(
      new Transaction().add(
        await programER.methods
          .releasePlayers()
          .accountsPartial({ payer, game })
          .remainingAccounts(group.map((p) => ({ pubkey: p.pubkey, isSigner: false, isWritable: true })))
          .instruction(),
      ),
    );
  }
  txs.push(new Transaction().add(await programER.methods.endGame().accountsPartial({ payer, game }).instruction()));
  return txs;
}

/** The bell's muster: every Player of war `id` on the ER that holds shares (`resolve_epoch` remaining accounts). */
export async function musterAccounts(programER: Program<Samrajya>, id: number) {
  const all = await playersOn(programER, programER.provider.connection, gamePda(id));
  return all.filter((p) => !p.shares.isZero()).map((p) => ({ pubkey: p.pubkey, isSigner: false, isWritable: false }));
}
