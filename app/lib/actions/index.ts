'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import { isMockMode, mockWallet, useGame } from '@/lib/store/game';

import { chainActions } from './chain-actions';
import { mockActions } from './mock-actions';
import type { ActionStep, GameActions } from './types';

export type { ActionStep, GameActions } from './types';

export const STEP_LABEL: Record<ActionStep, string> = {
  idle: '',
  signing: 'Approve in your wallet…',
  base: 'Sending to Solana…',
  er: 'Marching orders sent…',
  committing: 'Sealing the royal decree on Solana…',
  withdrawing: 'Withdrawing your SOL…',
  done: 'Done',
};

/**
 * Player actions for the HUD. `actions` is null until a wallet is connected.
 * `busy` is true while any action is in flight; `step` describes the current stage.
 */
export function useGameActions() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  // Actions are bound to one war; rebuild them when the feed moves to a new one.
  const gameId = useGame((s) => s.gameId);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<ActionStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const actions = useMemo<GameActions | null>(() => {
    const mock = isMockMode();
    if (!publicKey && !mock) return null;
    const raw: GameActions = mock
      ? mockActions(publicKey ? publicKey.toBase58() : mockWallet())
      : signTransaction
        ? chainActions({ publicKey: publicKey!, signTransaction, signAllTransactions }, setStep, gameId ?? undefined)
        : null!;
    if (!raw) return null;
    // Wrap every action with busy/error bookkeeping.
    const wrap =
      <A extends unknown[]>(fn: (...a: A) => Promise<void>) =>
      async (...a: A) => {
        setBusy(true);
        setError(null);
        setStep('idle');
        try {
          await fn(...a);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          throw e;
        } finally {
          setBusy(false);
          setStep('idle');
        }
      };
    return {
      pledge: wrap(raw.pledge),
      allocate: wrap(raw.allocate),
      upgrade: wrap(raw.upgrade),
      newWar: wrap(raw.newWar),
      switchKingdom: wrap(raw.switchKingdom),
      leave: wrap(raw.leave),
      claim: wrap(raw.claim),
      ringBell: raw.ringBell,
      startWar: wrap(raw.startWar),
      moveUnit: raw.moveUnit,
      setRole: wrap(raw.setRole),
      setGear: wrap(raw.setGear),
      march: wrap(raw.march),
      // strikes are rapid-fire: no busy flag, errors (cooldown, fallen) are expected and silent
      strike: raw.strike,
      seize: raw.seize,
      rally: wrap(raw.rally),
    };
  }, [publicKey, signTransaction, signAllTransactions, gameId]);

  return { actions, busy, step, stepLabel: STEP_LABEL[step], error, connected: !!publicKey || isMockMode() };
}
