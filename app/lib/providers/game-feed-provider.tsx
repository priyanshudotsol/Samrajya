'use client';

import { useEffect, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import { isMockMode, mockWallet, subscribeGame, useGame } from '@/lib/store/game';

/** Starts the game feed (mock or ER) once and keeps the store's wallet in sync. */
export function GameFeedProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();

  useEffect(() => subscribeGame(), []);

  // dev only: a handle for headless play tests (scripts read the store and the controller)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    void Promise.all([import('@/lib/arena/controller'), import('@/lib/arena/cameraState'), import('@/lib/mock/mockGame')]).then(
      ([{ control, localPose, debugControl, drawn }, { cameraState }, { currentMock }]) => {
        (window as unknown as { __samrajya: unknown }).__samrajya = { useGame, control, localPose, debugControl, drawn, cameraState, currentMock };
      },
    );
  }, []);

  useEffect(() => {
    useGame.getState().setWallet(publicKey ? publicKey.toBase58() : isMockMode() ? mockWallet() : null);
  }, [publicKey]);

  return <>{children}</>;
}
