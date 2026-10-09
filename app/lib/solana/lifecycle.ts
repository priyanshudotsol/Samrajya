/**
 * The war's trip between Solana and the MagicBlock ER (docs/ARCHITECTURE.md §4 "Layers"):
 *
 *   Lobby on Solana ──start_game + delegate_game + delegate_player×N──▶ war on the ER
 *   war on the ER ──release_players×N + end_game (commit + undelegate)──▶ claims on Solana
 *
 * Every step is permissionless, so the keeper, the "Start the war" button or any player can drive
 * it. These helpers only build the transactions; the caller signs and sends them.
 */
import { BN, type Program } from '@coral-xyz/anchor';
import { type Connection, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js';

import type { Samrajya } from './idl/samrajya';

/** Owner of accounts while they are delegated to the ER. */
const DELEGATION = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
/** Delegations / releases per transaction (each brings ~5 accounts; 1232-byte tx limit). */
const PER_TX = 4;

interface PlayerRow {
  pubkey: PublicKey;
  wallet: PublicKey;
  shares: BN;
  pendingWithdrawal: BN;
}

/** Player accounts of `game` that `conn` sees owned by the program (on base: not delegated). */
async function playersOn(program: Program<Samrajya>, conn: Connection, game: PublicKey): Promise<PlayerRow[]> {
  const disc = program.coder.accounts.memcmp('player');
  const accs = await conn.getProgramAccounts(program.programId, {
    commitment: 'confirmed',
    filters: [{ memcmp: { offset: 0, bytes: disc.bytes! } }, { memcmp: { offset: 40, bytes: game.toBase58() } }],
  });
  return accs.map((a) => {
    const p = program.coder.accounts.decode('player', a.account.data) as Omit<PlayerRow, 'pubkey'>;
    return { pubkey: a.pubkey, wallet: p.wallet, shares: p.shares, pendingWithdrawal: p.pendingWithdrawal };
  });
}

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const tx = (ixs: TransactionInstruction[]) => new Transaction().add(...ixs);

/**
 * Base-layer transactions that move a war to the ER: `start_game` (while still in the lobby) +
 * `delegate_game`, then `delegate_player` for every enlisted member still on Solana. Also used
 * after the start to sweep up members who enlisted while the war was moving.
 */
export async function moveWarToER(
  base: Program<Samrajya>,
  baseConn: Connection,
  game: PublicKey,
  gameId: number | BN,
  payer: PublicKey,
  validator: PublicKey,
): Promise<Transaction[]> {
  const txs: Transaction[] = [];
  const info = await baseConn.getAccountInfo(game, 'confirmed');
  if (!info) throw new Error('No such war');
  if (info.owner.equals(base.programId)) {
    const g = base.coder.accounts.decode('game', info.data) as { phase: Record<string, unknown> };
    if ('ended' in g.phase) return [];
    const ixs: TransactionInstruction[] = [];
    if ('lobby' in g.phase) ixs.push(await base.methods.startGame().accountsPartial({ signer: payer, game }).instruction());
    ixs.push(
      await base.methods
        .delegateGame(new BN(gameId.toString()))
        .accountsPartial({ payer, pda: game, validator })
        .instruction(),
    );
    txs.push(tx(ixs));
  }
  const waiting = (await playersOn(base, baseConn, game)).filter((p) => !p.shares.isZero() && p.pendingWithdrawal.isZero());
  for (const group of chunk(waiting, PER_TX)) {
    const ixs = await Promise.all(
      group.map((p) =>
        base.methods.delegatePlayer().accountsPartial({ payer, wallet: p.wallet, game, pda: p.pubkey, validator }).instruction(),
      ),
    );
    txs.push(tx(ixs));
  }
  return txs;
}

/**
 * ER transactions that bring an ended war back to Solana: `release_players` for every member
 * still delegated, then `end_game` for the Game itself (send them in order).
 */
export async function bringWarToSolana(
  er: Program<Samrajya>,
  erConn: Connection,
  baseConn: Connection,
  game: PublicKey,
  payer: PublicKey,
): Promise<Transaction[]> {
  const onER = await playersOn(er, erConn, game);
  // The ER may still hold stale copies of members who already left: only release real delegations.
  const owners = await baseConn.getMultipleAccountsInfo(onER.map((p) => p.pubkey), 'confirmed');
  const delegated = onER.filter((_, i) => owners[i]?.owner.equals(DELEGATION));
  const txs: Transaction[] = [];
  for (const group of chunk(delegated, PER_TX)) {
    txs.push(
      tx([
        await er.methods
          .releasePlayers()
          .accountsPartial({ payer, game })
          .remainingAccounts(group.map((p) => ({ pubkey: p.pubkey, isSigner: false, isWritable: true })))
          .instruction(),
      ]),
    );
  }
  txs.push(tx([await er.methods.endGame().accountsPartial({ payer, game }).instruction()]));
  return txs;
}

/**
 * The muster for the bell (`resolve_epoch` remaining accounts): every Player of `game` on the ER
 * that still holds shares. The program checks it is complete per kingdom, so nobody can hide a
 * garrison (programs/samrajya/src/field.rs `check_complete`).
 */
export async function musterAccounts(er: Program<Samrajya>, erConn: Connection, game: PublicKey) {
  const all = await playersOn(er, erConn, game);
  return all.filter((p) => !p.shares.isZero()).map((p) => ({ pubkey: p.pubkey, isSigner: false, isWritable: false }));
}
