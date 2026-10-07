/**
 * On-chain actions (MagicBlock ER + Solana base). One wallet popup to pledge (session key is
 * created in the same tx); every in-war move after that is signed by the session key on the ER.
 */
import { Program } from '@coral-xyz/anchor';
import { GetCommitmentSignature } from '@magicblock-labs/ephemeral-rollups-sdk';
import { SessionTokenManager } from '@magicblock-labs/gum-sdk';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

import { DEFEND } from '@/lib/game/types';
import { baseConnection, erConnection, GAME_ID } from '@/lib/solana/connections';
import {
  ER_VALIDATOR,
  VRF_QUEUE,
  gamePda,
  isDelegated,
  playerPda,
  programId,
  programs,
  vaultPda,
} from '@/lib/solana/program';

import type { ActionStep, GameActions } from './types';

export interface BrowserWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction>(tx: T): Promise<T>;
}

const SESSION_HOURS = 6;
const SESSION_TOPUP = 0.005 * LAMPORTS_PER_SOL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ session keys

interface StoredSession {
  secret: number[];
  validUntil: number;
}

const sessionKey = (wallet: PublicKey) => `samrajya:session:${programId.toBase58()}:${GAME_ID}:${wallet.toBase58()}`;

function loadSession(wallet: PublicKey): { kp: Keypair; validUntil: number } | null {
  try {
    const raw = localStorage.getItem(sessionKey(wallet));
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (s.validUntil < Date.now() / 1000 + 120) return null;
    return { kp: Keypair.fromSecretKey(Uint8Array.from(s.secret)), validUntil: s.validUntil };
  } catch {
    return null;
  }
}

function storeSession(wallet: PublicKey, kp: Keypair, validUntil: number) {
  try {
    localStorage.setItem(sessionKey(wallet), JSON.stringify({ secret: Array.from(kp.secretKey), validUntil }));
  } catch {
    /* private mode: session lives for this tab only */
  }
}

function sessionManager(wallet: BrowserWallet) {
  const anchorWallet = {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    signAllTransactions: async <T extends Transaction>(txs: T[]) => Promise.all(txs.map((t) => wallet.signTransaction(t))),
  };
  return new SessionTokenManager(anchorWallet as never, baseConnection());
}

function sessionTokenPda(stm: SessionTokenManager, signer: PublicKey, wallet: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('session_token_v2'), programId.toBytes(), signer.toBytes(), wallet.toBytes()],
    (stm.program as unknown as Program).programId,
  )[0];
}

// ------------------------------------------------------------------ sending

async function confirmOrThrow(conn: Connection, sig: string, blockhash: string, lastValidBlockHeight: number) {
  const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  if (res.value.err) {
    const tx = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    const logs = tx?.meta?.logMessages ?? [];
    const anchorMsg = logs.find((l) => l.includes('Error Message:'))?.split('Error Message:')[1]?.trim();
    throw new Error(anchorMsg || `Transaction failed: ${JSON.stringify(res.value.err)}`);
  }
}

// ------------------------------------------------------------------ actions

export function chainActions(wallet: BrowserWallet, onStep: (s: ActionStep) => void = () => {}): GameActions {
  const { base: program, er: programER } = programs();
  const game = gamePda();
  const vault = vaultPda(game);
  const player = playerPda(game, wallet.publicKey);
  const stm = sessionManager(wallet);

  /** Session signer for ER moves, or null → the wallet signs (popup). */
  function session() {
    const s = loadSession(wallet.publicKey);
    if (!s) return null;
    return { kp: s.kp, token: sessionTokenPda(stm, s.kp.publicKey, wallet.publicKey) };
  }

  async function sendBase(ixs: TransactionInstruction[], extraSigners: Keypair[] = []) {
    const conn = baseConnection();
    const tx = new Transaction().add(...ixs);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    if (extraSigners.length) tx.partialSign(...extraSigners);
    onStep('signing');
    const signed = await wallet.signTransaction(tx);
    onStep('base');
    const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await confirmOrThrow(conn, sig, blockhash, lastValidBlockHeight);
    return sig;
  }

  /** Sends on the ER (or base while the game is not delegated). Retries with a fresh blockhash. */
  async function sendGameLayer(build: (signer: PublicKey, token: PublicKey | null) => Promise<TransactionInstruction[]>) {
    const onER = await isDelegated(game);
    const conn = onER ? erConnection() : baseConnection();
    const s = onER ? session() : null;
    const signer = s ? s.kp.publicKey : wallet.publicKey;
    const ixs = await build(signer, s ? s.token : null);
    onStep(onER ? 'er' : 'base');
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const tx = new Transaction().add(...ixs);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = signer;
      let raw: Buffer;
      if (s) {
        tx.sign(s.kp);
        raw = tx.serialize();
      } else {
        onStep('signing');
        raw = (await wallet.signTransaction(tx)).serialize();
      }
      const sig = await conn.sendRawTransaction(raw, { skipPreflight: true });
      try {
        await confirmOrThrow(conn, sig, blockhash, lastValidBlockHeight);
        return { sig, onER };
      } catch (e) {
        lastErr = e;
        if (!(e instanceof Error) || !/expired|not confirmed|block height/i.test(e.message)) throw e;
      }
    }
    throw lastErr;
  }

  async function waitUndelegated(account: PublicKey, timeoutMs = 60_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const info = await baseConnection().getAccountInfo(account, 'confirmed');
      if (info && info.owner.equals(programId)) return;
      await sleep(1000);
    }
    throw new Error('Timed out waiting for the rollup to commit back to Solana');
  }

  const actionAccounts = (signer: PublicKey, token: PublicKey | null) => ({
    signer,
    game,
    player,
    sessionToken: token,
  });

  return {
    async pledge(faction, lamports) {
      if (await isDelegated(player)) throw new Error('You are already in the war. Leave first to pledge again.');
      const gameOnER = await isDelegated(game);
      const ixs: TransactionInstruction[] = [];
      const signers: Keypair[] = [];
      if (gameOnER && !session()) {
        const kp = Keypair.generate();
        const validUntil = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
        ixs.push(
          await (stm.program as unknown as Program).methods
            .createSessionV2(true, new BN(validUntil), new BN(SESSION_TOPUP))
            .accounts({ targetProgram: programId, sessionSigner: kp.publicKey, feePayer: wallet.publicKey, authority: wallet.publicKey })
            .instruction(),
        );
        signers.push(kp);
        storeSession(wallet.publicKey, kp, validUntil);
      }
      ixs.push(
        await program.methods
          .join(new BN(lamports.toString()))
          .accountsPartial({ wallet: wallet.publicKey, game, player, vault })
          .instruction(),
      );
      if (gameOnER) {
        ixs.push(
          await program.methods
            .delegatePlayer()
            .accountsPartial({ wallet: wallet.publicKey, game, pda: player, validator: ER_VALIDATOR })
            .instruction(),
        );
      }
      await sendBase(ixs, signers);
      // The ER needs a moment to pick up the newly delegated Player.
      for (let i = 0; ; i++) {
        try {
          await sendGameLayer(async (signer, token) => [
            await programER.methods.enlist(faction).accountsPartial(actionAccounts(signer, token)).instruction(),
          ]);
          break;
        } catch (e) {
          if (i >= 8) throw e;
          await sleep(1500);
        }
      }
      onStep('done');
    },

    async allocate(target, lamports) {
      await sendGameLayer(async (signer, token) => [
        await programER.methods
          .allocate(target, new BN((target === DEFEND ? 0n : lamports).toString()))
          .accountsPartial(actionAccounts(signer, token))
          .instruction(),
      ]);
      onStep('done');
    },

    async switchKingdom(to) {
      await sendGameLayer(async (signer, token) => [
        await programER.methods.switchKingdom(to).accountsPartial(actionAccounts(signer, token)).instruction(),
      ]);
      onStep('done');
    },

    async leave() {
      const { sig, onER } = await sendGameLayer(async (signer, token) => {
        const ixs = [await programER.methods.leave().accountsPartial(actionAccounts(signer, token)).instruction()];
        if (await isDelegated(player)) {
          ixs.push(
            await programER.methods
              .undelegatePlayer()
              .accountsPartial({ signer, player, sessionToken: token })
              .instruction(),
          );
        }
        return ixs;
      });
      if (onER) {
        onStep('committing');
        await GetCommitmentSignature(sig, erConnection());
        await waitUndelegated(player);
      }
      onStep('withdrawing');
      await sendBase([
        await program.methods
          .withdraw()
          .accountsPartial({ payer: wallet.publicKey, game, player, wallet: wallet.publicKey, vault })
          .instruction(),
      ]);
      onStep('done');
    },

    async claim() {
      if (await isDelegated(game)) {
        const { sig } = await sendGameLayer(async (signer) => [
          await programER.methods.endGame().accountsPartial({ payer: signer, game }).instruction(),
        ]);
        onStep('committing');
        await GetCommitmentSignature(sig, erConnection());
        await waitUndelegated(game);
      }
      if (await isDelegated(player)) {
        // Game is back on base now, so commit the Player straight from the ER.
        const s = session();
        const signer = s ? s.kp.publicKey : wallet.publicKey;
        const conn = erConnection();
        const tx = new Transaction().add(
          await programER.methods
            .undelegatePlayer()
            .accountsPartial({ signer, player, sessionToken: s ? s.token : null })
            .instruction(),
        );
        const { blockhash } = await conn.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = signer;
        const raw = s ? (tx.sign(s.kp), tx.serialize()) : (await wallet.signTransaction(tx)).serialize();
        const sig = await conn.sendRawTransaction(raw, { skipPreflight: true });
        onStep('committing');
        await GetCommitmentSignature(sig, conn);
        await waitUndelegated(player);
      }
      await sendBase([
        await program.methods
          .claim()
          .accountsPartial({ payer: wallet.publicKey, game, player, wallet: wallet.publicKey, vault })
          .instruction(),
      ]);
      onStep('done');
    },

    async ringBell() {
      await sendGameLayer(async (signer) => [
        await programER.methods
          .resolveEpoch(Math.floor(Math.random() * 256))
          .accountsPartial({ payer: signer, game, oracleQueue: VRF_QUEUE })
          .instruction(),
      ]);
    },
  };
}

