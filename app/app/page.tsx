'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { AppBackground } from '@/components/background/app-background';
import { Leaderboard } from '@/components/leaderboard';
import { LogoLoader } from '@/components/loader/logo-loader';
import { MobileBlocker } from '@/components/mobile-blocker';
import Onboarding from '@/components/onboarding/onboarding';
import { TourDialog, useTour } from '@/components/tour';
import { Collapsible } from '@/components/ui/collapsible';
import { BattlesPanel, WorldHeader } from '@/components/world';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { useGame } from '@/lib/store/game';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';
import { SAMRAJYA_TOUR_STEPS } from '@/lib/tour-steps';

// globe.gl touches `window` at import time, so the globe is client-only.
const WorldGlobe = dynamic(() => import('@/components/world/world-globe').then((m) => m.WorldGlobe), {
  ssr: false,
  loading: () => <></>,
});

/** World screen (IMPLEMENTATION_GUIDE Part B1): globe + kingdoms + war room. */
export default function Home() {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const game = useGame((s) => s.game);
  const error = useGame((s) => s.error);
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [showTourDialog, setShowTourDialog] = useState(false);
  const { setSteps } = useTour();

  useEffect(() => {
    try {
      setIsOnboarded(window.localStorage.getItem('samrajya:onboarded') === 'true');
    } catch {
      setIsOnboarded(false);
    }
  }, []);

  useEffect(() => setSteps(SAMRAJYA_TOUR_STEPS), [setSteps]);

  if (isMobile) {
    return (
      <AppBackground hasGradient={true}>
        <MobileBlocker />
      </AppBackground>
    );
  }
  if (isOnboarded === false) {
    return (
      <AppBackground hasGradient={true}>
        <Onboarding
          isOnboarded={false}
          onComplete={() => {
            try {
              window.localStorage.setItem('samrajya:onboarded', 'true');
            } catch {
              // private mode: onboarding shows again next visit
            }
            setIsOnboarded(true);
            setShowTourDialog(true);
          }}
        />
      </AppBackground>
    );
  }
  if (!game || isOnboarded === null) {
    return (
      <AppBackground hasGradient={true}>
        <LogoLoader label={error ?? undefined} />
      </AppBackground>
    );
  }

  return (
    <AppBackground>
      <div
        className="fixed top-1/2 left-1/2 overflow-hidden flex flex-col"
        style={{
          width: 'calc(100vw - 32px)',
          height: 'calc(100vh - 32px)',
          transform: 'translate(-50%, -50%)',
        }}
      >
        <WorldHeader />

        <div className="relative flex-1 border-x border-b border-border-default bg-background-surface overflow-hidden">
          {/* subtle royal glow behind the globe */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 55%, rgba(201,162,39,0.10) 0%, rgba(14,11,8,0) 55%)',
            }}
          />
          <div className="absolute inset-0 flex justify-center items-center">
            <WorldGlobe />
          </div>

          <Collapsible side="left" width={330}>
            <div id={TOUR_STEP_IDS.KINGDOM_LIST} className="relative flex h-[calc(100vh-150px)] pt-6">
              <Leaderboard onClick={(id) => router.push(`/kingdom/${id}`)} />
            </div>
          </Collapsible>

          <Collapsible side="right" width={320}>
            <div id={TOUR_STEP_IDS.BATTLES_PANEL} className="relative flex h-[calc(100vh-150px)] pt-6">
              <BattlesPanel />
            </div>
          </Collapsible>
        </div>

        <TourDialog isOpen={showTourDialog} setIsOpen={setShowTourDialog} />
      </div>
    </AppBackground>
  );
}
