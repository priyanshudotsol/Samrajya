'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp, Cpu, Volume2, VolumeX } from 'lucide-react';

import { isMuted, play, setMuted, subscribeAudio } from '@/lib/audio';
import { useRealmUi } from '@/lib/realm/ui-store';
import { useGame } from '@/lib/store/game';

import { useHudActions } from './actions-context';
import { BattleLog } from './BattleLog';
import { IncomingPanel } from './IncomingPanel';
import { JoinCard } from './JoinCard';
import { KingdomStats } from './KingdomStats';
import { MusicDirector } from './MusicDirector';
import { OddsBar } from './OddsBar';
import { RealmHeader } from './RealmHeader';
import { WarRoom } from './WarRoom';
import { YourShare } from './YourShare';

/** Keeper fallback: ring the bell once per epoch if the deadline passed 3 s ago. */
function useKeeper() {
  const { actions } = useHudActions();
  const rung = useRef<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const g = useGame.getState().game;
      if (!g || !actions || g.phase !== 'Active' || g.pendingVrf) return;
      if (Date.now() / 1000 > g.epochEndsAt + 3 && rung.current !== g.epoch) {
        rung.current = g.epoch;
        actions.ringBell().catch(() => {});
      }
    }, 1000);
    return () => clearInterval(id);
  }, [actions]);
}

const MUSIC_CREDIT =
  'Music: "Dhaka", "Mountain Emperor", "The Curtain Rises", "Long Road Ahead B" by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/). Trimmed/re-encoded.';

function Toggles() {
  const muted = useSyncExternalStore(subscribeAudio, isMuted, () => true);
  const lowPower = useRealmUi((s) => s.lowPower);
  const setLowPower = useRealmUi((s) => s.setLowPower);
  return (
    <div className="flex items-center gap-1">
      <a
        href="https://incompetech.com"
        target="_blank"
        rel="noreferrer"
        className="mr-1 whitespace-nowrap text-[10px] text-text-secondary opacity-70 hover:opacity-100"
        title={MUSIC_CREDIT}
      >
        ♪ Kevin MacLeod · CC BY 4.0
      </a>
      <button
        className="flex h-7 w-7 items-center justify-center border border-border-tertiary text-text-secondary hover:text-text-highlight"
        onClick={() => {
          setMuted(!muted);
          if (muted) play('click');
        }}
        title={muted ? 'Sound on' : 'Mute'}
        aria-label={muted ? 'Sound on' : 'Mute'}
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <button
        className={`flex h-7 items-center gap-1 border px-2 text-[11px] ${lowPower ? 'border-border-active text-text-highlight' : 'border-border-tertiary text-text-secondary'}`}
        onClick={() => setLowPower(!lowPower)}
        title="Low power: no shadows, no post-processing, half the troops"
      >
        <Cpu className="h-3.5 w-3.5" /> {lowPower ? 'Low' : 'High'}
      </button>
    </div>
  );
}

function RightColumn({ territory }: { territory: number }) {
  return (
    <>
      <JoinCard territory={territory} />
      <WarRoom territory={territory} />
      <YourShare />
      <BattleLog territory={territory} />
    </>
  );
}

/** DOM overlay over the canvas (KINGDOM_UI §7). Collapses into a bottom sheet on narrow screens. */
export function RealmHud({ territory, narrow }: { territory: number; narrow: boolean }) {
  useKeeper();
  const [sheetOpen, setSheetOpen] = useState(false);
  const focus = useRealmUi((s) => s.focus);
  useEffect(() => {
    if (focus && narrow) setSheetOpen(true);
  }, [focus, narrow]);

  if (narrow) {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
        <div className="p-2">
          <RealmHeader territory={territory} compact />
        </div>
        <div className="flex-1" />
        <motion.div
          className="pointer-events-auto border-t border-border-active bg-background-panel/95 backdrop-blur"
          animate={{ height: sheetOpen ? '62vh' : 76 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        >
          <button className="flex w-full items-center justify-center py-1 text-text-secondary" onClick={() => setSheetOpen((o) => !o)} aria-label="Toggle panels">
            <ChevronUp className={`h-4 w-4 transition-transform ${sheetOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex items-center gap-2 px-3 pb-2">
            <OddsBar territory={territory} />
            <Toggles />
          </div>
          <AnimatePresence>
            {sheetOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-[calc(62vh-80px)] space-y-2 overflow-y-auto px-3 pb-6"
              >
                <RightColumn territory={territory} />
                <KingdomStats territory={territory} />
                <IncomingPanel territory={territory} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col gap-3 p-3">
      <MusicDirector />
      <RealmHeader territory={territory} />
      <div className="flex min-h-0 flex-1 justify-between gap-3">
        <div className="pointer-events-auto flex w-[270px] flex-col gap-3 overflow-y-auto">
          <KingdomStats territory={territory} />
          <IncomingPanel territory={territory} />
        </div>
        <div className="pointer-events-auto flex w-[300px] flex-col gap-3 overflow-y-auto pb-1">
          <RightColumn territory={territory} />
        </div>
      </div>
      <div className="pointer-events-auto flex items-center gap-3 border border-border-default bg-background-panel/90 px-3 py-2 backdrop-blur-sm">
        <OddsBar territory={territory} />
        <Toggles />
      </div>
    </div>
  );
}
