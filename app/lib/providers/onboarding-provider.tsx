'use client';

import { TourProvider } from '@/components/tour';

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  return <TourProvider>{children}</TourProvider>;
}
