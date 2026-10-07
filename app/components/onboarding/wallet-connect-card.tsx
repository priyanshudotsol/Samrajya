'use client';

import React, { useEffect } from 'react';

import { GameCard } from '../ui';
import { useWallet } from '@solana/wallet-adapter-react';

import { ConnectWalletButton } from '../wallet';
import { Button } from '../ui/button';

type WalletConnectCardProps = {
  onConnectWallet?: () => void;
  onComplete?: () => void;
};

export function WalletConnectCard({ onComplete }: WalletConnectCardProps) {
  const { connected: isAuthenticated } = useWallet();
  const handleSkip = () => {
    onComplete?.();
  };

  useEffect(() => {
    if (isAuthenticated) {
      onComplete?.();
    }
  }, [isAuthenticated]);

  const buttons = (
    <div className="flex flex-col gap-4 w-full">
      <ConnectWalletButton className="w-full" />
      <Button variant="ghost" onClick={handleSkip} className="text-sm font-semibold">
        Skip
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen w-full relative flex flex-col items-center justify-center gap-8 animate-onboarding-fade">
      <div className="pt-10 mb-14">
        <div
          className="px-4 py-1 text-3xl font-clash font-semibold animate-title-fade"
          style={{ color: 'var(--color-text-primary)', textShadow: '0 0 0 #000' }}
        >
          Samrajya
        </div>
      </div>

      <GameCard
        topRightLabel="Connect Wallet"
        description="To get started, please connect your wallet. This allows you to hold tokens, join a team, and access the full experience."
        buttons={buttons}
      />
    </div>
  );
}

export default WalletConnectCard;
