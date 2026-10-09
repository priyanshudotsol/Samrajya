'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ExternalLink, Link2 } from 'lucide-react';

import { storedSessionSigner } from '@/lib/actions/chain-actions';
import { explorerTx, useActivity, watchActivity, type ChainTx } from '@/lib/chain/activity';
import { shortWallet } from '@/lib/game/units';
import { isMockMode, useGame } from '@/lib/store/game';

/** Plain words for the program's instructions. */
const LABEL: Record<string, string> = {
  InitGame: 'war opened',
  Join: 'ticket paid',
  Enlist: 'kingdom chosen',
  StartGame: 'war started',
  DelegateGame: 'war → MagicBlock ER',
  DelegatePlayer: 'player → MagicBlock ER',
  Allocate: 'attack / defend order',
  SwitchKingdom: 'switched kingdom',
  Upgrade: 'upgrade bought',
  Leave: 'left the war',
  UndelegatePlayer: 'player → Solana',
  Withdraw: 'withdrawal paid',
  ResolveEpoch: 'bell rung (VRF requested)',
  BattleCallback: 'battles resolved',
  ReleasePlayers: 'players → Solana',
  EndGame: 'war → Solana',
  AbortGame: 'war aborted',
  Claim: 'winnings claimed',
};

const label = (t: ChainTx) => (t.ixs.length ? t.ixs.map((i) => LABEL[i] ?? i).join(' + ') : 'transaction');

/**
 * Where the war lives (Solana lobby → MagicBlock ER war → Solana settlement) and every
 * transaction on both layers, each linked to the explorer. A pill under the header; click to open.
 */
export function ChainActivity() {
  const game = useGame((s) => s.game);
  const gameId = useGame((s) => s.gameId);
  const onER = useGame((s) => s.onER);
  const wallet = useGame((s) => s.wallet);
  const txs = useActivity((s) => s.txs);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isMockMode() || gameId === null) return;
    let stop = () => {};
    let cancelled = false;
    void Promise.all([import('@/lib/solana/program'), import('@/lib/solana/connections')]).then(([{ gamePda }, { baseConnection, erConnection }]) => {
      if (!cancelled) stop = watchActivity(gamePda(gameId), baseConnection(), erConnection());
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [gameId]);

  if (isMockMode() || !game || onER === null) return null;

  const status =
    game.phase === 'Lobby' && !onER
      ? { text: 'Lobby on Solana', hint: 'Joins settle on the base layer. The war moves to the MagicBlock ER when it starts.', color: '#14f195' }
      : game.phase === 'Ended'
        ? onER
          ? { text: 'War over · returning to Solana', hint: 'Every member and the war are committed and undelegated back to Solana.', color: '#c9a227' }
          : { text: 'Settled on Solana', hint: 'The final state is on the base layer; winners claim there.', color: '#14f195' }
        : onER
          ? { text: 'War live on MagicBlock ER', hint: 'Every move is an ER transaction, signed by your session key.', color: '#b48cff' }
          : { text: 'War starting · moving to the ER', hint: 'The war and every member are being delegated to MagicBlock.', color: '#c9a227' };
  const erCount = txs.filter((t) => t.layer === 'er').length;
  const mySession = wallet ? storedSessionSigner(wallet) : null;
  const who = (s: string) => (s === wallet ? 'you' : s === mySession ? 'you (session key)' : shortWallet(s));

  return (
    <div className="pointer-events-none fixed left-1/2 top-[86px] z-40 flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col items-center">
      <button
        className="pointer-events-auto flex items-center gap-2 border border-border-default bg-background-panel/90 px-3 py-1 text-[11px] backdrop-blur-sm"
        onClick={() => setOpen((o) => !o)}
        title={status.hint}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: status.color, boxShadow: `0 0 8px ${status.color}` }} />
        <span className="text-text-primary">{status.text}</span>
        <span className="text-text-secondary">· {erCount} ER tx</span>
        <Link2 className="h-3 w-3 text-text-secondary" />
        <ChevronDown className={`h-3 w-3 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pointer-events-auto mt-1 max-h-[52vh] w-full overflow-y-auto border border-border-default bg-background-panel/95 p-2 text-[11px] backdrop-blur-sm">
          <p className="mb-2 text-text-secondary">{status.hint}</p>
          {txs.length === 0 && <p className="text-text-secondary">Waiting for transactions…</p>}
          <ul className="space-y-0.5">
            {txs.map((t) => (
              <li key={t.sig}>
                <a
                  href={explorerTx(t.sig, t.layer)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-1 py-0.5 hover:bg-white/5"
                  title={t.sig}
                >
                  <span className="w-[54px] shrink-0 tabular-nums text-text-secondary">{new Date(t.at).toLocaleTimeString([], { hour12: false })}</span>
                  <span
                    className="w-[46px] shrink-0 text-center text-[9px] font-semibold tracking-wider"
                    style={{ color: t.layer === 'er' ? '#b48cff' : '#14f195', border: `1px solid ${t.layer === 'er' ? '#b48cff66' : '#14f19566'}` }}
                  >
                    {t.layer === 'er' ? 'ER' : 'SOLANA'}
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${t.ok ? 'text-text-primary' : 'text-[var(--color-vermilion)] line-through'}`}>{label(t)}</span>
                  {t.signer && <span className="shrink-0 text-text-secondary">{who(t.signer)}</span>}
                  <ExternalLink className="h-3 w-3 shrink-0 text-text-secondary" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
