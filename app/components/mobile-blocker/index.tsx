'use client';

import React from 'react';
import { Crown } from 'lucide-react';

import { GameCard } from '../ui/game-card';

export function MobileBlocker() {
  return (
    <div className="min-h-screen w-full relative flex flex-col items-center justify-center gap-8 px-4 animate-onboarding-fade">
      <GameCard
        topRightLabel="About the Game"
        title="Coming Soon On Mobile"
        description="Samrajya is a real-time war for the empire on MagicBlock Ephemeral Rollups. Six Indian kingdoms fight with SOL-backed armies and VRF battles. The mobile realm is coming soon; until then please play on a desktop."
        children={
          <div className="flex flex-col items-center justify-center">
            <Crown className="h-16 w-16 text-text-highlight" strokeWidth={1.2} />
          </div>
        }
      />
    </div>
  );
}
