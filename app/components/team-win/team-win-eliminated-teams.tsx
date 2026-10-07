'use client';

import { X } from 'lucide-react';

import { KINGDOMS, kingdomGlow } from '@/lib/game/factions';
import { TeamWinData } from '@/lib/hooks/use-team-win-detection';

interface TeamWinEliminatedTeamsProps {
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

export function TeamWinEliminatedTeams({ teamWinData }: TeamWinEliminatedTeamsProps) {
  const eliminatedTeams = teamWinData.eliminated.map((id) => ({
    id,
    name: KINGDOMS[id].name,
    color: kingdomGlow(id),
  }));

  const allEliminatedTeams = [...eliminatedTeams];

  if (eliminatedTeams.length === 0) {
    return null;
  }

  return (
    <div
      className="mt-6 overflow-y-auto"
      style={{
        maxHeight: '250px',
        scrollbarWidth: 'thin',
        scrollbarColor: '#3b82f6 transparent',
        overflowX: 'hidden',
      }}
    >
      <div className="text-center mb-4">
        <h3 className="text-lg font-rozha text-text-highlight mb-2">Fallen Kingdoms</h3>
        <p className="text-sm text-text-secondary">
          Kingdoms conquered on the road to empire
        </p>
      </div>

      <div className="space-y-3 pr-2">
        {allEliminatedTeams.map((team) => (
          <div
            key={team.id}
            className="flex items-center justify-between p-3 bg-background-muted"
            style={{
              clipPath: generateClipPath(['top-right', 'bottom-left']),
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-background-panel"
                style={{ backgroundColor: team.color }}
              >
                {team.name.charAt(0)}
              </div>
              <div className="font-medium text-sm text-text-highlight">{team.name}</div>
            </div>

            <div className="flex items-center gap-2">
              <X className="w-4 h-4 text-red-500" />
              <span className="text-sm text-text-secondary">Eliminated</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
