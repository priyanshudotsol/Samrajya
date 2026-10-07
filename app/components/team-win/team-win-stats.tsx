'use client';

import { Zap, Target } from 'lucide-react';

import { formatSol } from '@/lib/game/math';
import { TeamWinData } from '@/lib/hooks/use-team-win-detection';

interface TeamWinStatsProps {
  teamWinData: TeamWinData;
}

const generateClipPath = (corners: string[]) => {
  const size = '8px';
  const points = [];

  if (!corners.includes('top-left')) {
    points.push(`0 0`);
  } else {
    points.push(`0 ${size}`);
    points.push(`${size} 0`);
  }

  if (!corners.includes('top-right')) {
    points.push('100% 0');
  } else {
    points.push(`calc(100% - ${size}) 0`);
    points.push(`100% ${size}`);
  }

  if (!corners.includes('bottom-right')) {
    points.push('100% 100%');
  } else {
    points.push(`100% calc(100% - ${size})`);
    points.push(`calc(100% - ${size}) 100%`);
  }

  if (!corners.includes('bottom-left')) {
    points.push('0 100%');
  } else {
    points.push(`${size} 100%`);
    points.push(`0 calc(100% - ${size})`);
  }

  return `polygon(${points.join(', ')})`;
};

export function TeamWinStats({ teamWinData }: TeamWinStatsProps) {
  // Format liquidity amount
  return (
    <div className="grid grid-cols-2 gap-5 mb-6">
      {/* Territories Conquered */}
      <div
        className="flex flex-col p-[1px] bg-border-active"
        style={{
          clipPath: generateClipPath(['top-right', 'bottom-left']),
        }}
      >
        <div
          className="flex flex-col gap-2 p-5 bg-background-panel h-full"
          style={{
            clipPath: generateClipPath(['top-right', 'bottom-left']),
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-5 w-5 text-text-highlight" />
            <span className="text-text-secondary font-medium">Territories Conquered</span>
          </div>
          <div className="text-3xl font-rozha text-text-highlight">
            {teamWinData.territories}
          </div>
        </div>
      </div>

      {/* Royal Pot */}
      <div
        className="flex flex-col p-[1px] bg-border-active"
        style={{
          clipPath: generateClipPath(['top-right', 'bottom-left']),
        }}
      >
        <div
          className="flex flex-col gap-2 p-5 bg-background-panel"
          style={{
            clipPath: generateClipPath(['top-right', 'bottom-left']),
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-text-highlight" />
            <span className="text-text-secondary font-medium">Royal Pot</span>
          </div>
          <div className="text-3xl font-rozha text-text-highlight">
            ◎ {formatSol(teamWinData.pot)}
          </div>
        </div>
      </div>
    </div>
  );
}
