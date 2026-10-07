/**
 * Battle cinematic state machine (docs/KINGDOM_UI.md §5.1). A tiny zustand slice driven by
 * `tickBattle(state, game, territory, nowMs)`, a pure function (no timers inside), so the same
 * machine runs live battles and replays from the battle log.
 *
 *   IDLE ──(T−10 s & incoming)──► MUSTER ──(pendingVrf / epoch rolled)──► CLASH
 *   CLASH ──(battleLog has (epoch, territory))──► ROLL ──► HELD | FALLEN ──► IDLE
 *
 * The result is NEVER invented: CLASH waits for the real BattleEntry (after 8 s it flags
 * `deliberating` so the HUD can say "the oracle deliberates…"). If the epoch rolls over with no
 * entry for this territory (attackers withdrew), the cinematic quietly ends.
 */
import { create } from 'zustand';

import { isContested } from '@/lib/game/math';
import type { BattleEntry, Game } from '@/lib/game/types';

export type BattlePhase = 'IDLE' | 'MUSTER' | 'CLASH' | 'ROLL' | 'HELD' | 'FALLEN';

export const MUSTER_LEAD_SECS = 10;
export const MIN_CLASH_MS = 2600;
export const ORACLE_WAIT_MS = 8000;
export const NO_BATTLE_GRACE_MS = 3000;
export const ROLL_MS = 2800;
export const HELD_MS = 6000;
export const FALLEN_MS = 6500;

export interface BattleState {
  phase: BattlePhase;
  territory: number | null;
  /** Epoch being fought. */
  epoch: number | null;
  /** ms timestamp when the current phase began. */
  since: number;
  /** ms timestamp when CLASH began. */
  clashAt: number;
  entry: BattleEntry | null;
  /** Last game state seen before the battle resolved (camps, defender colours). */
  snapshot: Game | null;
  replay: boolean;
  /** CLASH has waited > ORACLE_WAIT_MS for the VRF callback. */
  deliberating: boolean;
  /** Skip pressed: jump to the result as soon as it is known. */
  skipping: boolean;
  /** `${epoch}:${territory}` of the last battle shown, so it never re-triggers. */
  done: string | null;
}

export const IDLE_STATE: BattleState = {
  phase: 'IDLE',
  territory: null,
  epoch: null,
  since: 0,
  clashAt: 0,
  entry: null,
  snapshot: null,
  replay: false,
  deliberating: false,
  skipping: false,
  done: null,
};

const keyOf = (epoch: number, t: number) => `${epoch}:${t}`;

export function findEntry(game: Game, epoch: number, territory: number): BattleEntry | null {
  for (let i = game.battleLog.length - 1; i >= 0; i--) {
    const e = game.battleLog[i];
    if (e.epoch === epoch && e.territory === territory) return e;
  }
  return null;
}

const to = (s: BattleState, phase: BattlePhase, now: number, patch: Partial<BattleState> = {}): BattleState => ({
  ...s,
  ...patch,
  phase,
  since: now,
});

const finish = (s: BattleState): BattleState => ({
  ...IDLE_STATE,
  done: s.replay ? s.done : s.epoch !== null && s.territory !== null ? keyOf(s.epoch, s.territory) : s.done,
});

function resultPhase(e: BattleEntry): BattlePhase {
  return e.winner === e.defender ? 'HELD' : 'FALLEN';
}

/** Advances the machine. Pure: returns the same object when nothing changes. */
export function tickBattle(s: BattleState, game: Game | null, territory: number, now: number): BattleState {
  if (!game) return s;
  // Territory changed under us (navigation): reset.
  if (s.phase !== 'IDLE' && s.territory !== territory) return { ...IDLE_STATE, done: s.done };
  const elapsed = now - s.since;

  switch (s.phase) {
    case 'IDLE': {
      if (game.phase !== 'Active') return s;
      const key = keyOf(game.epoch, territory);
      if (s.done === key) return s;
      if (!isContested(game, territory)) return s;
      const remaining = game.epochEndsAt - now / 1000;
      if (game.pendingVrf) {
        // Opened the realm mid-resolution: go straight to the clash.
        return to(s, 'CLASH', now, {
          territory,
          epoch: game.epoch,
          clashAt: now,
          snapshot: game,
          entry: null,
          replay: false,
          deliberating: false,
          skipping: false,
        });
      }
      if (remaining <= MUSTER_LEAD_SECS) {
        return to(s, 'MUSTER', now, {
          territory,
          epoch: game.epoch,
          snapshot: game,
          entry: null,
          replay: false,
          deliberating: false,
          skipping: false,
        });
      }
      return s;
    }

    case 'MUSTER': {
      const epoch = s.epoch!;
      const entry = findEntry(game, epoch, territory);
      if (game.epoch > epoch || game.pendingVrf || entry) {
        return to(s, 'CLASH', now, {
          clashAt: now,
          entry,
          // keep the pre-resolution state if the result already landed
          snapshot: game.epoch === epoch && !entry ? game : s.snapshot,
        });
      }
      // Attackers withdrew before the bell.
      if (!isContested(game, territory)) return { ...IDLE_STATE, done: s.done };
      // Keep the snapshot fresh so the camps grow/shrink live.
      return s.snapshot === game ? s : { ...s, snapshot: game };
    }

    case 'CLASH': {
      const epoch = s.epoch!;
      const entry = s.entry ?? (s.replay ? null : findEntry(game, epoch, territory));
      const clashFor = now - s.clashAt;
      if (entry) {
        if (s.skipping) return to(s, resultPhase(entry), now, { entry, deliberating: false });
        if (clashFor >= MIN_CLASH_MS) return to(s, 'ROLL', now, { entry, deliberating: false });
        return s.entry === entry ? s : { ...s, entry };
      }
      // Still waiting for the VRF callback.
      const patch: Partial<BattleState> = {};
      if (game.epoch === epoch && game.pendingVrf && s.snapshot !== game) patch.snapshot = game;
      if (!s.deliberating && clashFor >= ORACLE_WAIT_MS) patch.deliberating = true;
      // Epoch advanced and no entry for us: no battle happened here.
      if (game.epoch > epoch && !game.pendingVrf && clashFor >= NO_BATTLE_GRACE_MS) {
        const later = findEntry(game, epoch, territory);
        if (!later) return finish(s);
      }
      return Object.keys(patch).length ? { ...s, ...patch } : s;
    }

    case 'ROLL':
      if (s.skipping || elapsed >= ROLL_MS) return to(s, resultPhase(s.entry!), now);
      return s;

    case 'HELD':
      return elapsed >= HELD_MS ? finish(s) : s;

    case 'FALLEN':
      return elapsed >= FALLEN_MS ? finish(s) : s;
  }
}

/** Skip: jump to the result (now, or as soon as it is known). Never invents a result. */
export function skipBattle(s: BattleState, now: number): BattleState {
  switch (s.phase) {
    case 'MUSTER':
    case 'CLASH':
      if (s.entry) return to(s, resultPhase(s.entry), now, { skipping: true });
      return { ...s, skipping: true, phase: 'CLASH', clashAt: s.phase === 'MUSTER' ? now : s.clashAt };
    case 'ROLL':
      return to(s, resultPhase(s.entry!), now, { skipping: true });
    case 'HELD':
    case 'FALLEN':
      return finish(s);
    default:
      return s;
  }
}

/** Replays a logged battle in this realm. */
export function replayBattle(s: BattleState, entry: BattleEntry, now: number): BattleState {
  return {
    ...IDLE_STATE,
    done: s.done,
    phase: 'CLASH',
    territory: entry.territory,
    epoch: entry.epoch,
    since: now,
    clashAt: now,
    entry,
    snapshot: null,
    replay: true,
  };
}

// ---------------------------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------------------------

export interface BattleStore extends BattleState {
  tick: (game: Game | null, territory: number, now?: number) => void;
  skip: () => void;
  startReplay: (entry: BattleEntry) => void;
  reset: () => void;
}

export const useBattle = create<BattleStore>((set, get) => {
  const state = (): BattleState => {
    const { tick: _t, skip: _s, startReplay: _r, reset: _x, ...rest } = get();
    void _t;
    void _s;
    void _r;
    void _x;
    return rest;
  };
  return {
    ...IDLE_STATE,
    tick: (game, territory, now = Date.now()) => {
      const cur = state();
      const next = tickBattle(cur, game, territory, now);
      if (next !== cur) set(next);
    },
    skip: () => set(skipBattle(state(), Date.now())),
    startReplay: (entry) => set(replayBattle(state(), entry, Date.now())),
    reset: () => set({ ...IDLE_STATE }),
  };
});

/** Is the camera under cinematic control? */
export const isCinematic = (p: BattlePhase) => p === 'CLASH' || p === 'ROLL' || p === 'HELD' || p === 'FALLEN';
