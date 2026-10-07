'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import { isMockMode } from '@/lib/store/game';

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
  const { publicKey, signTransaction } = useWallet();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<ActionStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const actions = useMemo<GameActions | null>(() => {
    if (!publicKey) return null;
    const raw: GameActions = isMockMode()
      ? mockActions(publicKey.toBase58())
      : signTransaction
        ? chainActions({ publicKey, signTransaction }, setStep)
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
      switchKingdom: wrap(raw.switchKingdom),
      leave: wrap(raw.leave),
      claim: wrap(raw.claim),
      ringBell: raw.ringBell,
    };
  }, [publicKey, signTransaction]);

  return { actions, busy, step, stepLabel: STEP_LABEL[step], error, connected: !!publicKey };
}
