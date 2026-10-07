/**
 * Background music (tracks + credits in public/audio/music/CREDITS.md). Two looping beds (peace,
 * battle) and two one-shot stings (victory, defeat) on plain HTMLAudioElements, crossfaded by a
 * small volume ticker. Follows the mute switch in `lib/audio.ts`: muted ⇒ silent, unmuted ⇒ the
 * current bed resumes. If the browser blocks play() it retries on the next pointerdown/keydown.
 * Safe to import and call on the server (all no-ops).
 */
import { isMuted, subscribeAudio } from '@/lib/audio';

export type MusicBed = 'peace' | 'battle';
export type MusicSting = 'victory' | 'defeat';
type Track = MusicBed | MusicSting;

/** Music sits under the SFX. */
export const MUSIC_VOLUME = 0.35;
export const CROSSFADE_MS = 1200;

const SRC: Record<Track, string> = {
  peace: '/audio/music/peace.mp3',
  battle: '/audio/music/battle.mp3',
  victory: '/audio/music/victory.mp3',
  defeat: '/audio/music/defeat.mp3',
};
const TRACKS = Object.keys(SRC) as Track[];
const STEP_MS = 50;

const els: Partial<Record<Track, HTMLAudioElement>> = {};
let bed: MusicBed | null = null;
let sting: MusicSting | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let awaitingGesture = false;

function el(t: Track): HTMLAudioElement {
  let a = els[t];
  if (!a) {
    a = new Audio(SRC[t]);
    a.preload = 'auto';
    a.loop = t === 'peace' || t === 'battle';
    a.volume = 0;
    if (!a.loop) {
      a.addEventListener('ended', () => {
        if (sting === t) {
          sting = null;
          apply();
        }
      });
    }
    els[t] = a;
  }
  return a;
}

/** Which track should be audible right now. */
function target(): Track | null {
  if (isMuted()) return null;
  return sting ?? bed;
}

/** Retry play() after the first user gesture (autoplay policy). */
function waitForGesture() {
  if (awaitingGesture || typeof window === 'undefined') return;
  awaitingGesture = true;
  const go = () => {
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    awaitingGesture = false;
    apply();
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}

function fadeTick() {
  const want = target();
  const step = (MUSIC_VOLUME * STEP_MS) / CROSSFADE_MS;
  let settled = true;
  for (const t of TRACKS) {
    const a = els[t];
    if (!a) continue;
    const goal = t === want ? MUSIC_VOLUME : 0;
    const v = a.volume;
    if (Math.abs(v - goal) > 1e-3) {
      a.volume = v < goal ? Math.min(goal, v + step) : Math.max(goal, v - step);
      settled = false;
    }
    if (goal === 0 && a.volume <= 1e-3 && !a.paused) a.pause();
  }
  if (settled && timer) {
    clearInterval(timer);
    timer = null;
  }
}

function apply() {
  if (typeof window === 'undefined') return;
  if (!unsubscribe) unsubscribe = subscribeAudio(apply);
  const want = target();
  if (want) {
    const a = el(want);
    if (a.paused) {
      a.play().catch(() => waitForGesture());
    }
  }
  if (!timer) timer = setInterval(fadeTick, STEP_MS);
}

/** Sets the looping bed (null = silence). Starting a battle cuts any sting short. */
export function setMusicBed(next: MusicBed | null) {
  if (next === bed && !(next === 'battle' && sting)) return;
  bed = next;
  if (next === 'battle') sting = null;
  apply();
}

/** Plays a one-shot sting over the bed, then fades back to the bed. Skipped while muted. */
export function playSting(s: MusicSting) {
  if (typeof window === 'undefined' || isMuted()) return;
  const a = el(s);
  a.currentTime = 0;
  sting = s;
  apply();
}

/** Fades everything out (e.g. when the HUD unmounts). */
export function stopMusic() {
  bed = null;
  sting = null;
  apply();
}
