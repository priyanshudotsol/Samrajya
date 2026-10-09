'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { SkipForward } from 'lucide-react';

import { useBattle } from '@/lib/arena/battleMachine';
import { kingdomInk, territoryName, ownerName } from '@/lib/game/factions';
import { formatSol } from '@/lib/game/math';
import { useGame } from '@/lib/store/game';

/**
 * DOM overlay for the battle cinematic: muster/clash captions, "the oracle deliberates…" while
 * the VRF callback is late, and the big HELD / FALLEN TO <name> / ELIMINATED banner.
 */
export function BattleBanner({ territory }: { territory: number }) {
  const phase = useBattle((s) => s.phase);
  const entry = useBattle((s) => s.entry);
  const deliberating = useBattle((s) => s.deliberating);
  const replay = useBattle((s) => s.replay);
  const epoch = useBattle((s) => s.epoch);
  const skip = useBattle((s) => s.skip);
  const me = useGame((s) => s.me);
  const name = territoryName(territory);

  const caption =
    phase === 'MUSTER'
      ? 'The bell approaches — armies muster at the gates'
      : phase === 'CLASH'
        ? deliberating
          ? 'The oracle deliberates…'
          : `Battle for ${name}`
        : phase === 'ROLL'
          ? entry?.byFight || entry?.captured
            ? 'The bell rings — the fight has decided'
            : 'The rune turns — the VRF decides'
          : null;

  const held = entry && entry.winner === entry.defender;
  const iWasDefender = !!entry && me?.faction === entry.defender;

  return (
    <>
      <AnimatePresence mode="wait">
        {caption && (
          <motion.div
            key={caption}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="pointer-events-none absolute left-1/2 top-32 z-30 -translate-x-1/2 md:top-20 border border-border-active bg-background-panel/90 shadow-md px-4 py-1.5 text-center"
          >
            <div className={`font-rozha text-lg ${deliberating && phase === 'CLASH' ? 'animate-pulse text-text-highlight' : 'text-text-primary'}`}>
              {caption}
            </div>
            {replay && <div className="text-[11px] text-text-secondary">Replay · epoch {epoch}</div>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {entry && (phase === 'HELD' || phase === 'FALLEN') && (
          <motion.div
            key={`${entry.epoch}-${phase}`}
            initial={{ opacity: 0, scale: 1.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 160, damping: 18 }}
            className="pointer-events-none absolute inset-x-0 bottom-[17%] z-30 flex flex-col items-center text-center"
          >
            {held ? (
              <>
                <div className="font-rozha text-7xl text-gold-gradient drop-shadow-[0_4px_20px_rgba(201,162,39,0.6)] md:text-8xl">HELD</div>
                <div className="mt-1 bg-background-panel/90 shadow-md px-3 py-1 text-sm text-text-primary">
                  <span style={{ color: kingdomInk(entry.defender) }}>{ownerName(entry.defender)}</span> repels the
                  attack · spoils {formatSol(entry.spoils)} ◎
                </div>
              </>
            ) : (
              <>
                <div className="font-rozha text-5xl text-[var(--color-vermilion)] drop-shadow-[0_4px_20px_rgba(226,72,60,0.6)] md:text-7xl">
                  FALLEN TO{' '}
                  <span style={{ color: kingdomInk(entry.winner) }}>{ownerName(entry.winner).toUpperCase()}</span>
                </div>
                <div className="mt-1 bg-background-panel/90 shadow-md px-3 py-1 text-sm text-text-primary">
                  {formatSol(entry.spoils)} ◎ looted from {ownerName(entry.defender)}
                </div>
                {entry.eliminated && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="mt-4 border border-[var(--color-vermilion)] bg-background-panel/90 shadow-md px-5 py-3"
                  >
                    <div className="font-rozha text-3xl text-[var(--color-vermilion)]">ELIMINATED</div>
                    <div className="text-sm text-text-secondary">
                      {ownerName(entry.defender)} has lost its last territory.
                      {iWasDefender && !replay && ' Your shares are worth 0. Pledge again to another kingdom?'}
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {phase !== 'IDLE' && (
        <button
          onClick={skip}
          className="pointer-events-auto absolute bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 border border-border-tertiary bg-background-panel/90 shadow-md px-3 py-1 text-xs text-text-secondary hover:text-text-highlight md:bottom-16"
        >
          <SkipForward className="h-3.5 w-3.5" /> {phase === 'HELD' || phase === 'FALLEN' ? 'Close' : entry ? 'Skip to result' : 'Skip (waits for the result)'}
        </button>
      )}
    </>
  );
}
