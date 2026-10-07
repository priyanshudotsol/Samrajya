'use client';

import { TeamWinData } from '@/lib/hooks/use-team-win-detection';
import { TeamWinHeader } from './team-win-header';
import { TeamWinStats } from './team-win-stats';
import { TeamWinMessage } from './team-win-message';
import { TeamWinEliminatedTeams } from './team-win-eliminated-teams';

interface TeamWinCelebrationProps {
  teamWinData: TeamWinData;
}

export function TeamWinCelebration({ teamWinData }: TeamWinCelebrationProps) {
  return (
    <div
      className="relative w-full bg-background-panel h-full flex flex-col"
      style={{
        clipPath: 'polygon(0 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 0 100%)',
      }}
    >
      {/* Victory Header */}
      <TeamWinHeader teamWinData={teamWinData} />

      {/* Victory Stats and Message */}
      <div className="p-2 sm:p-3 md:p-4 flex-1 overflow-y-auto">
        <TeamWinStats teamWinData={teamWinData} />
        <TeamWinMessage teamWinData={teamWinData} />
        <TeamWinEliminatedTeams teamWinData={teamWinData} />
      </div>
    </div>
  );
}
