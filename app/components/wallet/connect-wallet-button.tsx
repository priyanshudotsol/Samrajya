'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LogOut, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

/** Gold "Connect Wallet" button (Phantom / Solflare / Backpack on devnet). */
export function ConnectWalletButton({ className }: { className?: string }) {
  const { publicKey, connecting, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();

  if (publicKey) {
    return (
      <Button
        variant="outline"
        size="sm"
        clipCorners="top-left-bottom-right"
        className={className}
        onClick={() => void disconnect()}
        title="Disconnect"
      >
        {wallet?.adapter.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.adapter.icon} alt="" className="h-4 w-4" />
        ) : (
          <Wallet />
        )}
        {short(publicKey.toBase58())}
        <LogOut />
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      clipCorners="top-left-bottom-right"
      className={className}
      onClick={() => setVisible(true)}
      disabled={connecting}
    >
      <Wallet />
      {connecting ? 'Connecting…' : 'Connect Wallet'}
    </Button>
  );
}
