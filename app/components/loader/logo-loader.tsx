'use client';

import { Crown } from 'lucide-react';

export function LogoLoader({ label = 'Summoning the realms…' }: { label?: string }) {
  return (
    <div className="flex flex-col gap-4 justify-center items-center h-screen">
      <Crown className="h-20 w-20 text-text-highlight animate-pulse" strokeWidth={1.2} />
      <div className="font-rozha text-2xl text-gold-gradient">SAMRAJYA</div>
      <div className="text-sm text-text-secondary">{label}</div>
    </div>
  );
}
