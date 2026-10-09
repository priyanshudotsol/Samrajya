'use client';

/**
 * Every transaction that touches the war, on both layers, as it happens: the ER (war moves,
 * bells, VRF callbacks, commits) and Solana (joins, the start + delegation, claims). Seeded with
 * recent history, then live through `onLogs(game)` on each layer's websocket.
 */
import { create } from 'zustand';
import type { Connection, Logs, PublicKey } from '@solana/web3.js';

import { BASE_RPC, ER_RPC } from '@/lib/solana/connections';

export type Layer = 'er' | 'solana';

export interface ChainTx {
  sig: string;
  layer: Layer;
  /** Instruction names from the program logs, e.g. ["Allocate"]. */
  ixs: string[];
  ok: boolean;
  /** Unix ms (block time for history, arrival time for live ones). */
  at: number;
  /** Fee payer (signer), when known. */
  signer?: string;
}

interface ActivityStore {
  txs: ChainTx[];
}

const MAX = 150;
export const useActivity = create<ActivityStore>(() => ({ txs: [] }));

function add(tx: ChainTx) {
  useActivity.setState((s) => {
    if (s.txs.some((t) => t.sig === tx.sig)) return s;
    return { txs: [tx, ...s.txs].sort((a, b) => b.at - a.at).slice(0, MAX) };
  });
}

function setSigner(sig: string, signer: string) {
  useActivity.setState((s) => ({ txs: s.txs.map((t) => (t.sig === sig ? { ...t, signer } : t)) }));
}

/** "Program log: Instruction: Allocate" → "Allocate" (our program's top-level instructions). */
function ixNames(logs: string[]): string[] {
  const out: string[] = [];
  for (const l of logs) {
    const m = /^Program log: Instruction: (\w+)/.exec(l);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Explorer link for a transaction on either layer. */
export function explorerTx(sig: string, layer: Layer): string {
  const rpc = layer === 'er' ? ER_RPC : BASE_RPC;
  const cluster = /devnet\.solana\.com/.test(rpc) ? 'cluster=devnet' : `cluster=custom&customUrl=${encodeURIComponent(rpc)}`;
  return `https://explorer.solana.com/tx/${sig}?${cluster}`;
}

async function details(conn: Connection, sig: string) {
  const tx = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx) return null;
  return {
    ixs: ixNames(tx.meta?.logMessages ?? []),
    ok: !tx.meta?.err,
    at: (tx.blockTime ?? Date.now() / 1000) * 1000,
    signer: tx.transaction.message.staticAccountKeys[0]?.toBase58(),
  };
}

/** Recent history of `game` on one layer (newest `limit`), fetched gently. */
async function seed(conn: Connection, game: PublicKey, layer: Layer, limit: number, isLive: () => boolean) {
  const sigs = await conn.getSignaturesForAddress(game, { limit }, 'confirmed');
  for (const s of sigs) {
    if (!isLive()) return;
    const d = await details(conn, s.signature).catch(() => null);
    if (d) add({ sig: s.signature, layer, ...d, ok: d.ok && !s.err });
    // public devnet rate-limits hard: space out the base-layer reads
    if (layer === 'solana') await new Promise((r) => setTimeout(r, 900));
  }
}

/** Follows `game` on both layers until the returned stop function is called. */
export function watchActivity(game: PublicKey, base: Connection, er: Connection): () => void {
  let live = true;
  useActivity.setState({ txs: [] });
  const subs: [Connection, number][] = [];
  const listen = (conn: Connection, layer: Layer) => {
    const id = conn.onLogs(
      game,
      (l: Logs) => {
        if (l.signature === '1111111111111111111111111111111111111111111111111111111111111111') return;
        add({ sig: l.signature, layer, ixs: ixNames(l.logs), ok: !l.err, at: Date.now() });
        // who signed it (the ER is cheap to ask; Solana is rate-limited, so only the ER)
        if (layer === 'er')
          void details(conn, l.signature)
          .then((d) => d?.signer && live && setSigner(l.signature, d.signer))
          .catch(() => {});
      },
      'confirmed',
    );
    subs.push([conn, id]);
  };
  listen(er, 'er');
  listen(base, 'solana');
  void seed(er, game, 'er', 40, () => live).catch(() => {});
  void seed(base, game, 'solana', 8, () => live).catch(() => {});
  return () => {
    live = false;
    for (const [conn, id] of subs) void conn.removeOnLogsListener(id);
  };
}
