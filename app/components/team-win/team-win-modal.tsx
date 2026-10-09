'use client';

import { useEffect } from 'react';

import { play, playSfx } from '@/lib/audio';
import { TeamWinData } from '@/lib/hooks/use-team-win-detection';
import { playSting, stopSting } from '@/lib/music';
import { TeamWinCelebration } from './team-win-celebration';

interface TeamWinModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamWinData?: TeamWinData;
  onMarkAsShown?: () => void;
}

export function TeamWinModal({ isOpen, onClose, teamWinData, onMarkAsShown }: TeamWinModalProps) {
  useEffect(() => {
    if (isOpen && onMarkAsShown) {
      onMarkAsShown();
    }
  }, [isOpen, onMarkAsShown]);

  // One kingdom rules the world: war horns, a fanfare, and the victory parade march
  useEffect(() => {
    if (!isOpen || !teamWinData) return;
    playSfx('warhorn', { volume: 0.9 });
    const fanfare = setTimeout(() => play('fanfare'), 600);
    playSting('parade');
    return () => {
      clearTimeout(fanfare);
      stopSting('parade');
    };
  }, [isOpen, teamWinData]);

  if (!isOpen || !teamWinData) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        minHeight: '100vh',
      }}
    >
      <div
        className="relative max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl w-full"
        style={{
          maxHeight: 'calc(100vh - 4rem)',
          margin: '0 auto',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 md:-top-4 md:-right-4 z-10 h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 rounded-full bg-background-panel text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center border border-border-active"
        >
          <svg
            className="h-3 w-3 sm:h-4 sm:w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="overflow-hidden">
          <TeamWinCelebration teamWinData={teamWinData} />
        </div>
      </div>
    </div>
  );
}
