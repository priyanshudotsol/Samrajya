'use client';

import React, { useState } from 'react';
import { Crown } from 'lucide-react';

import { GameCard } from '../ui';
import { Button } from '../ui/button';

type OnboardingProps = {
  onComplete?: () => void;
  isOnboarded?: boolean;
  isLoading?: boolean;
};

type OnboardingStep = 'welcome' | 'wallet' | 'completed';

function AboutUsCard({ onClick }: { onClick: () => void }) {
  const buttons = (
    <Button type="button" onClick={onClick} clipCorners={'top-left'} className="w-full">
      Enter the war
    </Button>
  );

  return (
    <div className="h-full w-full relative flex flex-col items-center justify-center gap-8 animate-onboarding-fade">
      <GameCard
        topRightLabel="About the Game"
        // title="About the Game"
        description="Six kingdoms. One empire. Pledge SOL to Hastinapur, Magadh, Kalinga, Takshashila, Vijayanagar or Avanti and receive shares of its treasury. Every epoch, hold your walls or join a squad that teleports to an enemy gate; the fight decides: clear their walls by the bell and the kingdom is yours. Flee for 20%, betray for 40%. The last kingdom standing splits the pot."
        buttons={buttons}
        children={
          <div className="flex flex-col items-center justify-center">
            <Crown className="h-20 w-20 text-text-highlight" strokeWidth={1.2} />
          </div>
        }
      />
    </div>
  );
}

export function Onboarding({ onComplete, isOnboarded, isLoading }: OnboardingProps) {
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('welcome');

  const handleComplete = () => {
    try {
      window.localStorage.setItem('isOnboarded', 'true');
    } catch (error) {
      void error;
    }
    setOnboardingStep('completed');
    onComplete?.();
  };

  if (!isOnboarded && !isLoading) {
    switch (onboardingStep) {
      case 'welcome':
        return <AboutUsCard onClick={() => handleComplete()} />;
      default:
        return null;
    }
  }
}

export default Onboarding;
