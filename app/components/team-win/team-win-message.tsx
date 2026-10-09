'use client';

import { KINGDOMS } from '@/lib/game/factions';
import { TeamWinData } from '@/lib/hooks/use-team-win-detection';

interface TeamWinMessageProps {
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

export function TeamWinMessage({ teamWinData }: TeamWinMessageProps) {
  const teamName = KINGDOMS[teamWinData.winner].name;

  return (
    <>
      <div
        className="flex justify-center mb-4"
        style={{
          backgroundColor: 'var(--color-border-active)',
          clipPath: generateClipPath(['top-right', 'bottom-left']),
          padding: '1px',
        }}
      >
        <div
          className="bg-button-highlight text-text-inverse px-5 py-2 font-rozha text-base"
          style={{
            clipPath: generateClipPath(['top-right', 'bottom-left']),
          }}
        >
          SAMRAJYA — COMPLETE DOMINION
        </div>
      </div>

      <div className="text-center mb-6">
        <p className="text-text-secondary text-base">
          <span className="font-bold text-text-highlight">{teamName}</span> now holds every territory.
          Its members split the entire pot equally. Anyone can open the next war below.
        </p>
      </div>
    </>
  );
}
