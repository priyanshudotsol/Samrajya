/**
 * On-chain actions (MagicBlock ER + Solana base). One wallet popup to pledge (session key is
 * created in the same tx); every in-war move after that is signed by the session key on the ER.
 * In-war moves never fall back to the wallet: if the session is missing or expired, one popup
 * creates a new one (valid for the program's 7-day maximum) and play continues popup-free.
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

import { ADJACENCY } from '@/lib/game/factions';
import { DEFAULT_CONFIG } from '@/lib/game/math';
import { DEFEND } from '@/lib/game/types';
import { MAX_EVENTS, weaponOf } from '@/lib/game/combat';
import { activeGameId, baseConnection, erConnection, setActiveGameId } from '@/lib/solana/connections';
import {
  ER_VALIDATOR,
  VRF_QUEUE,
  gamePda,
  isDelegated,
  latestGameId,
  playerPda,
  programId,
  programs,
  registryPda,
  vaultPda,
} from '@/lib/solana/program';
import { bringWarToSolana, moveWarToER, musterAccounts } from '@/lib/solana/lifecycle';
import { useGame } from '@/lib/store/game';

import { localUnitActions, teleportForOrder } from './local-units';
import type { ActionStep, GameActions } from './types';

export interface BrowserWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction>(tx: T): Promise<T>;
  /** One popup for several transactions (falls back to one popup each). */
  signAllTransactions?<T extends Transaction>(txs: T[]): Promise<T[]>;
}

/** Session keys may live at most 7 days (session-keys `ValidityTooLong`); keep a margin. */
const SESSION_SECS = 7 * 24 * 3600 - 600;
/** Epoch length of a war opened from the app: long enough to march, siege and fight by hand. */
const NEW_WAR_EPOCH_SECS = 90;
const SESSION_TOPUP = 0.005 * LAMPORTS_PER_SOL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ session keys

interface StoredSession {
  secret: number[];
  validUntil: number;
}

// Session tokens are per program + wallet, not per game, so one session spans every war.
const sessionKey = (wallet: PublicKey) => `samrajya:session:${programId.toBase58()}:${wallet.toBase58()}`;

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

/** This browser's session signer for `wallet` (base58), so the UI can mark its transactions as yours. */
export function storedSessionSigner(wallet: string): string | null {
  try {
    return loadSession(new PublicKey(wallet))?.kp.publicKey.toBase58() ?? null;
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

export function chainActions(wallet: BrowserWallet, onStep: (s: ActionStep) => void = () => {}, gameId = activeGameId()): GameActions {
  const { base: program, er: programER } = programs();
  const game = gamePda(gameId);
  const vault = vaultPda(game);
  const player = playerPda(game, wallet.publicKey);
  const stm = sessionManager(wallet);

  /** Session signer for ER moves, or null when there is none in this browser. */
  function session() {
    const s = loadSession(wallet.publicKey);
    if (!s) return null;
    return { kp: s.kp, token: sessionTokenPda(stm, s.kp.publicKey, wallet.publicKey) };
  }

  async function createSessionIx(kp: Keypair, validUntil: number) {
    return (stm.program as unknown as Program).methods
      .createSessionV2(true, new BN(validUntil), new BN(SESSION_TOPUP))
      .accounts({ targetProgram: programId, sessionSigner: kp.publicKey, feePayer: wallet.publicKey, authority: wallet.publicKey })
      .instruction();
  }

  let checkedToken: string | null = null;
  let ensuring: ReturnType<typeof ensureSessionOnce> | null = null;
  /** One session check / creation at a time (warrior moves fire several per second). */
  function ensureSession() {
    ensuring ??= ensureSessionOnce().finally(() => {
      ensuring = null;
    });
    return ensuring;
  }
  /**
   * The session signer for in-war moves. Reuses the stored one if its token exists on Solana;
   * otherwise creates a new one with a single wallet popup.
   */
  async function ensureSessionOnce() {
    const s = session();
    if (s && checkedToken === s.token.toBase58()) return s;
    if (s && (await baseConnection().getAccountInfo(s.token, 'confirmed'))) {
      checkedToken = s.token.toBase58();
      return s;
    }
    const kp = Keypair.generate();
    const validUntil = Math.floor(Date.now() / 1000) + SESSION_SECS;
    await sendBase([await createSessionIx(kp, validUntil)], [kp]);
    storeSession(wallet.publicKey, kp, validUntil);
    const fresh = session()!;
    checkedToken = fresh.token.toBase58();
    return fresh;
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

  /**
   * Sends on the ER while the war is there, else on Solana (the lobby). Signed by the session key:
   * `session` creates one if needed (at most one popup), `quiet` never prompts and throws without
   * a session (background calls), `wallet` forces the wallet. Retries with a fresh blockhash.
   */
  async function sendGameLayer(
    build: (signer: PublicKey, token: PublicKey | null) => Promise<TransactionInstruction[]>,
    mode: 'session' | 'quiet' | 'wallet' = 'session',
  ) {
    const onER = await isDelegated(game);
    const conn = onER ? erConnection() : baseConnection();
    if (mode === 'quiet' && !(onER && session())) throw new Error('No session key in this browser');
    const s = mode === 'wallet' ? null : mode === 'quiet' ? session() : await ensureSession();
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

  /** Several base transactions in order, signed by the wallet with one popup. */
  async function sendBaseMany(txs: Transaction[]) {
    if (txs.length === 0) return;
    const conn = baseConnection();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    for (const t of txs) {
      t.recentBlockhash = blockhash;
      t.feePayer = wallet.publicKey;
    }
    onStep('signing');
    const signed = wallet.signAllTransactions ? await wallet.signAllTransactions(txs) : await Promise.all(txs.map((t) => wallet.signTransaction(t)));
    onStep('base');
    for (const t of signed) {
      const sig = await conn.sendRawTransaction(t.serialize(), { skipPreflight: true });
      await confirmOrThrow(conn, sig, blockhash, lastValidBlockHeight);
    }
  }

  /**
   * Brings an ended war back to Solana: every member's Player, then the Game (commit +
   * undelegate on the ER, signed by the session key, so no popup).
   */
  async function bringBack(gameKey: PublicKey) {
    const s = await ensureSession();
    const conn = erConnection();
    const txs = await bringWarToSolana(programER, conn, baseConnection(), gameKey, s.kp.publicKey);
    onStep('committing');
    let last = '';
    for (const t of txs) {
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      t.recentBlockhash = blockhash;
      t.feePayer = s.kp.publicKey;
      t.sign(s.kp);
      last = await conn.sendRawTransaction(t.serialize(), { skipPreflight: true });
      await confirmOrThrow(conn, last, blockhash, lastValidBlockHeight);
    }
    await GetCommitmentSignature(last, conn);
    await waitUndelegated(gameKey);
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
      // The session key rides in the pledge tx, so the whole war after this needs no popup.
      let fresh: { kp: Keypair; validUntil: number } | null = null;
      if (!session()) {
        fresh = { kp: Keypair.generate(), validUntil: Math.floor(Date.now() / 1000) + SESSION_SECS };
        ixs.push(await createSessionIx(fresh.kp, fresh.validUntil));
        signers.push(fresh.kp);
      }
      ixs.push(
        await program.methods
          .join(new BN(lamports.toString()))
          .accountsPartial({ wallet: wallet.publicKey, game, player, vault })
          .instruction(),
      );
      if (gameOnER) {
        // The war is already on the ER: bring your Player along, then enlist there.
        ixs.push(
          await program.methods
            .delegatePlayer()
            .accountsPartial({ payer: wallet.publicKey, wallet: wallet.publicKey, game, pda: player, validator: ER_VALIDATOR })
            .instruction(),
        );
      } else {
        // Lobby on Solana: pick the kingdom in the same transaction. Everyone moves to the ER
        // together when the war starts.
        ixs.push(
          await program.methods
            .enlist(faction)
            .accountsPartial({ signer: wallet.publicKey, game, player, sessionToken: null })
            .instruction(),
        );
      }
      await sendBase(ixs, signers);
      if (fresh) storeSession(wallet.publicKey, fresh.kp, fresh.validUntil);
      if (!gameOnER) {
        onStep('done');
        return;
      }
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

    async upgrade(kind) {
      await sendGameLayer(async (signer, token) => [
        await programER.methods.upgrade(kind).accountsPartial(actionAccounts(signer, token)).instruction(),
      ]);
      onStep('done');
    },

    async newWar() {
      const latest = await latestGameId();
      if (latest === null) throw new Error('No war has been opened on this program yet. Run the create-game script once.');
      const prev = gamePda(latest);
      // The program only opens war N+1 once war N is Ended and committed back to Solana.
      if (await isDelegated(prev)) await bringBack(prev);
      const id = latest + 1;
      const next = gamePda(id);
      const config = {
        ...DEFAULT_CONFIG,
        epochSecs: NEW_WAR_EPOCH_SECS,
        adjacency: ADJACENCY,
      };
      const bn = (x: bigint | number) => new BN(x.toString());
      await sendBase([
        await program.methods
          .initGame(new BN(id), {
            ticket: bn(config.ticket),
            epochSecs: bn(config.epochSecs),
            leaveFeeBps: config.leaveFeeBps,
            switchFeeBps: config.switchFeeBps,
            kLossBps: config.kLossBps,
            stormDecayBps: config.stormDecayBps,
            baseDefense: bn(config.baseDefense),
            adjacency: config.adjacency,
            plainsDefense: bn(config.plainsDefense),
            plainsTaxBps: config.plainsTaxBps,
            upgradeCostBps: config.upgradeCostBps,
            upgradeBonusBps: config.upgradeBonusBps,
            conquestBonusBps: config.conquestBonusBps,
            lobbySecs: bn(config.lobbySecs),
          })
          .accountsPartial({ authority: wallet.publicKey, game: next, registry: registryPda(), previous: prev, vault: vaultPda(next) })
          .instruction(),
      ]);
      // The lobby stays on Solana; the war moves to the ER when it starts.
      // Point the app at the new war right away (the feed would notice within a few seconds).
      setActiveGameId(id);
      useGame.setState({ gameId: id, game: null, me: null, players: [], status: 'loading' });
      onStep('done');
    },

    async allocate(target, lamports) {
      await sendGameLayer(async (signer, token) => [
        await programER.methods
          .allocate(target, new BN((target === DEFEND ? 0n : lamports).toString()))
          .accountsPartial(actionAccounts(signer, token))
          .instruction(),
      ]);
      // The program teleports the squad to the target's gate on the ER; in a lobby-only war the
      // warrior is local.
      if (!useGame.getState().onER) teleportForOrder(wallet.publicKey.toBase58(), target);
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
      // Usually the keeper has already brought the war back to Solana; if not, do it now.
      if (await isDelegated(game)) await bringBack(game);
      if (await isDelegated(player)) {
        // Released with the war but not landed yet, or missed: commit it straight from the ER.
        if (!(await isDelegated(game))) await waitUndelegated(player, 20_000).catch(() => {});
      }
      if (await isDelegated(player)) {
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

    async startWar() {
      // The host may start any time; anyone else once the lobby timer is over and two kingdoms
      // have members. Starting moves the war to the ER: the Game and every member's Player are
      // delegated (one popup; the starter pays the small delegation rent).
      await sendBaseMany(await moveWarToER(program, baseConnection(), game, gameId, wallet.publicKey, ER_VALIDATOR));
      onStep('done');
    },

    async ringBell() {
      await sendGameLayer(async (signer) => [
        await programER.methods
          .resolveEpoch(Math.floor(Math.random() * 256))
          .accountsPartial({ payer: signer, game, oracleQueue: VRF_QUEUE })
          // every member's warrior: the program reads the hand fight at each fort
          .remainingAccounts(await musterAccounts(programER, erConnection(), game))
          .instruction(),
      ], 'quiet');
    },

    // Warriors: on the ER during the war (field.rs), local + shared over Supabase in the lobby.
    ...unitActions(),
  };

  // ------------------------------------------------------------------ warriors on the ER

  function unitActions(): Pick<GameActions, 'moveUnit' | 'setRole' | 'setGear' | 'march' | 'strike' | 'rally'> {
    const local = localUnitActions(wallet.publicKey.toBase58());
    const me = wallet.publicKey.toBase58();
    const onER = () => useGame.getState().onER === true;
    const mine = () => useGame.getState().units.find((u) => u.wallet === me);
    const i16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 100)));
    const dir = (facing: number) => [Math.round(Math.sin(facing) * 100), Math.round(Math.cos(facing) * 100)] as const;

    let bh: { hash: string; at: number } | null = null;
    async function blockhash() {
      if (!bh || Date.now() - bh.at > 20_000) bh = { hash: (await erConnection().getLatestBlockhash('confirmed')).blockhash, at: Date.now() };
      return bh.hash;
    }
    /** Signs with the session key and sends on the ER; `wait` confirms (gear / teleport), else fire-and-forget. */
    async function sendER(ixs: TransactionInstruction[], wait = false) {
      const s = await ensureSession();
      const conn = erConnection();
      const tx = new Transaction().add(...ixs);
      tx.recentBlockhash = wait ? (await conn.getLatestBlockhash('confirmed')).blockhash : await blockhash();
      tx.feePayer = s.kp.publicKey;
      tx.sign(s.kp);
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
      if (wait) {
        const r = await conn.confirmTransaction(sig, 'confirmed');
        if (r.value.err) throw new Error('The battlefield refused that move');
      }
      return sig;
    }
    async function moveIx(at: number, x: number, z: number, facing: number, action: number, gear: number, role: number) {
      const s = await ensureSession();
      const [fx, fz] = dir(facing);
      return programER.methods
        .moveUnit(at, i16(x), i16(z), fx, fz, action, gear, role)
        .accountsPartial(actionAccounts(s.kp.publicKey, s.token))
        .instruction();
    }

    // positions: at most 8 per second, always ending on the latest
    const MOVE_MS = 125;
    let lastMove = 0;
    let pending: Parameters<GameActions['moveUnit']> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flushMove = async () => {
      timer = null;
      const args = pending;
      pending = null;
      const u = mine();
      if (!args || !u) return;
      lastMove = Date.now();
      const [x, z, facing, action] = args;
      await sendER([await moveIx(u.at, x, z, facing, action, u.gear, u.role)]).catch(() => {});
    };

    let readyAt = 0;
    return {
      async moveUnit(x, z, facing, action) {
        if (!onER()) return local.moveUnit(x, z, facing, action);
        pending = [x, z, facing, action];
        const wait = MOVE_MS - (Date.now() - lastMove);
        if (wait <= 0) await flushMove();
        else timer ??= setTimeout(() => void flushMove(), wait);
      },
      async setRole(role) {
        if (!onER()) return local.setRole(role);
        const u = mine();
        if (!u) throw new Error('No warrior');
        await sendER([await moveIx(u.at, u.x, u.z, u.facing, u.action === 6 ? 0 : u.action, u.gear, role)], true);
      },
      async setGear(gear) {
        if (!onER()) return local.setGear(gear);
        const u = mine();
        if (!u) throw new Error('No warrior');
        await sendER([await moveIx(u.at, u.x, u.z, u.facing, u.action === 6 ? 0 : u.action, gear, u.role)], true);
      },
      async march(to) {
        if (!onER()) return local.march(to);
        const u = mine();
        if (!u) throw new Error('No warrior');
        await sendER([await moveIx(to, u.x, u.z, u.facing, 0, u.gear, u.role)], true);
      },
      async strike(x, z, facing, opts = {}) {
        if (!onER()) return local.strike(x, z, facing, opts);
        const u = mine();
        if (!u || u.hp <= 0) throw new Error('fallen');
        const now = Date.now() / 1000;
        const w = weaponOf(u.gear);
        if (now < readyAt) throw new Error('not ready');
        readyAt = now + w.cooldown * (opts.heavy ? 1.4 : 1);
        // animate your own blow right away; everyone else sees it from the strike counter
        useGame.setState((s) => ({
          events: [
            ...s.events,
            w.ranged
              ? { id: ++strikeSeq, at: now, territory: u.at, by: me, byFaction: u.faction, gear: u.gear, heavy: opts.heavy, combo: opts.combo, kind: 'arrow' as const, x, z, x2: x + Math.sin(facing) * w.range, z2: z + Math.cos(facing) * w.range }
              : { id: ++strikeSeq, at: now, territory: u.at, by: me, byFaction: u.faction, gear: u.gear, heavy: opts.heavy, combo: opts.combo, kind: 'swing' as const, x, z },
          ].slice(-MAX_EVENTS),
        }));
        // the program re-checks reach, arc, walls and blocking; send whoever might be in reach
        const reach = w.ranged ? w.range + 0.4 : w.range + 0.6;
        const targets = useGame
          .getState()
          .units.filter((o) => o.at === u.at && o.faction !== u.faction && o.hp > 0 && Math.hypot(o.x - x, o.z - z) <= reach)
          .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))
          .slice(0, 8);
        const s = await ensureSession();
        const [fx, fz] = dir(facing);
        const ix = await programER.methods
          .strike(i16(x), i16(z), fx, fz, !!opts.heavy)
          .accountsPartial(actionAccounts(s.kp.publicKey, s.token))
          .remainingAccounts(targets.map((o) => ({ pubkey: playerPda(game, new PublicKey(o.wallet)), isSigner: false, isWritable: true })))
          .instruction();
        await sendER([ix]);
      },
      rally: local.rally,
    };
  }
}

let strikeSeq = 5_000_000;

