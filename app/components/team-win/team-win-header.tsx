'use client';

import { Trophy, Crown } from 'lucide-react';

import { KINGDOMS, kingdomInk } from '@/lib/game/factions';
import { TeamWinData } from '@/lib/hooks/use-team-win-detection';

interface TeamWinHeaderProps {
  teamWinData: TeamWinData;
}

export function TeamWinHeader({ teamWinData }: TeamWinHeaderProps) {
  const kingdom = KINGDOMS[teamWinData.winner];
  const teamName = kingdom.name;

  return (
    <div
      className="relative bg-background-muted text-text-inverse p-2 sm:p-3 md:p-4"
      style={{
        clipPath: 'polygon(0 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 0 100%)',
      }}
    >
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 items-center justify-center rounded-full bg-background-panel shadow-lg">
            <Trophy className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-text-highlight" />
          </div>
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 items-center justify-center rounded-full bg-background-panel shadow-lg">
            <Crown className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-text-highlight" />
          </div>
        </div>

        <h1 className="font-rozha text-lg sm:text-xl md:text-2xl text-text-highlight font-bold mb-1 sm:mb-2">
          {teamName.toUpperCase()} RULES THE WORLD
        </h1>

        <p className="text-xs sm:text-sm mb-2 sm:mb-3 text-text-highlight">
          <span className="font-bold text-text-highlight">{teamName}</span> has conquered every
          territory!
        </p>

        <div className="flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-background-surface/20">
          <div
            className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 rounded-full flex items-center justify-center text-background-panel font-bold text-xs"
            style={{ backgroundColor: kingdomInk(kingdom.id) }}
          >
            {teamName.charAt(0)}
          </div>
        </div>
      </div>
    </div>
  );
}
