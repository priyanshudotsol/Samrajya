'use client';

import { create } from 'zustand';

/** What the player clicked in the realm; the HUD opens the matching panel. */
export type RealmFocus =
  | { kind: 'defend' }
  | { kind: 'attack'; target?: number }
  | { kind: 'treasury' }
  | { kind: 'landmark'; power: number }
  | { kind: 'camp'; faction: number };

export interface RealmUi {
  focus: RealmFocus | null;
  /** Id of the hovered interactable (for tooltips / cursor). */
  hovered: string | null;
  /** User toggle: no shadows, no post, half the troops. */
  lowPower: boolean;
  /** Set by PerformanceMonitor on weak GPUs: disables post-processing. */
  degraded: boolean;
  setFocus: (f: RealmFocus | null) => void;
  setHovered: (id: string | null) => void;
  setLowPower: (v: boolean) => void;
  setDegraded: (v: boolean) => void;
  /** Reads the saved low-power preference (call once on mount, avoids hydration mismatch). */
  hydrate: () => void;
}

const LOW_KEY = 'samrajya:lowPower';

function initialLowPower(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = window.localStorage.getItem(LOW_KEY);
    if (v !== null) return v === '1';
  } catch {
    // storage blocked
  }
  return window.matchMedia?.('(max-width: 768px)').matches ?? false;
}

export const useRealmUi = create<RealmUi>((set) => ({
  focus: null,
  hovered: null,
  lowPower: false,
  hydrate: () => set({ lowPower: initialLowPower() }),
  degraded: false,
  setFocus: (focus) => set({ focus }),
  setHovered: (hovered) => set({ hovered }),
  setLowPower: (lowPower) => {
    try {
      window.localStorage.setItem(LOW_KEY, lowPower ? '1' : '0');
    } catch {
      // ignore
    }
    set({ lowPower });
  },
  setDegraded: (degraded) => set({ degraded }),
}));
