'use client';

import React, { createContext, useContext, useEffect, ReactNode } from 'react';

import { useModal } from './modal-provider';
import { useTeamWinDetection } from '../hooks/use-team-win-detection';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const TeamWinContext = createContext<{} | undefined>(undefined);

interface TeamWinProviderProps {
  children: ReactNode;
}

export function TeamWinProvider({ children }: TeamWinProviderProps) {
  const { openModal } = useModal();
  const { teamWinData, hasShownWinModal, markWinModalAsShown, isLoading } = useTeamWinDetection();

  useEffect(() => {
    // Only show modal if we have win data and haven't shown it yet
    if (teamWinData && !hasShownWinModal && !isLoading) {
      openModal('team-win', {
        teamWinData,
        onMarkAsShown: markWinModalAsShown,
      });
    }
  }, [teamWinData, hasShownWinModal, isLoading, openModal, markWinModalAsShown]);

  const contextValue = {};

  return <TeamWinContext.Provider value={contextValue}>{children}</TeamWinContext.Provider>;
}

export function useTeamWin() {
  const context = useContext(TeamWinContext);
  if (context === undefined) {
    throw new Error('useTeamWin must be used within a TeamWinProvider');
  }
  return context;
}
