'use client';

import { useEffect, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import { subscribeGame, useGame } from '@/lib/store/game';

/** Starts the game feed (mock or ER) once and keeps the store's wallet in sync. */
export function GameFeedProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();

  useEffect(() => subscribeGame(), []);

  useEffect(() => {
    useGame.getState().setWallet(publicKey ? publicKey.toBase58() : null);
  }, [publicKey]);

  return <>{children}</>;
}
