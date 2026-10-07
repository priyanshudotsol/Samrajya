/**
 * Tiny sound API (docs/KINGDOM_UI.md §9). Muted by default; unmuting (a user click) creates the
 * AudioContext, which satisfies autoplay rules. Everything is synthesised with WebAudio, so no
 * audio files are shipped. Safe to import and call on the server (all no-ops).
 */

export type Sfx = 'horn' | 'drum' | 'clash' | 'catapult' | 'tick' | 'fanfare' | 'bell' | 'click';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = true;
const listeners = new Set<() => void>();
const MUTE_KEY = 'samrajya:muted';

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

/** Call from a click handler. */
export function setMuted(m: boolean) {
  muted = m;
  if (!m) ensureCtx();
  try {
    window.localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

/** Restores the saved preference but stays muted until the next user gesture unlocks audio. */
export function restoreMutePreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(MUTE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function subscribeAudio(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function tone(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.4,
  slideTo?: number,
) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master!);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function noise(c: AudioContext, start: number, dur: number, gain = 0.3, filterFreq = 1800, type: BiquadFilterType = 'bandpass') {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(start);
}

export function play(s: Sfx) {
  if (muted) return;
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime + 0.01;
  switch (s) {
    case 'click':
      tone(c, 880, t, 0.06, 'triangle', 0.15);
      break;
    case 'horn':
      tone(c, 220, t, 0.5, 'sawtooth', 0.18, 233);
      tone(c, 330, t + 0.05, 0.45, 'sawtooth', 0.1, 349);
      break;
    case 'drum':
      tone(c, 110, t, 0.35, 'sine', 0.6, 45);
      noise(c, t, 0.08, 0.2, 400, 'lowpass');
      tone(c, 100, t + 0.42, 0.3, 'sine', 0.45, 45);
      break;
    case 'clash':
      noise(c, t, 0.25, 0.35, 3500);
      tone(c, 1900, t, 0.18, 'square', 0.05, 1400);
      tone(c, 2600, t + 0.02, 0.15, 'triangle', 0.05);
      break;
    case 'catapult':
      noise(c, t, 0.5, 0.15, 600, 'lowpass');
      tone(c, 70, t + 0.45, 0.4, 'sine', 0.5, 35);
      break;
    case 'tick':
      tone(c, 1500, t, 0.03, 'square', 0.06);
      break;
    case 'fanfare':
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.14, 0.35 + (i === 3 ? 0.5 : 0), 'sawtooth', 0.09));
      break;
    case 'bell':
      [196, 392, 588, 784].forEach((f, i) => tone(c, f, t, 2.2 - i * 0.4, 'sine', 0.25 / (i + 1)));
      noise(c, t + 0.3, 1.2, 0.12, 300, 'lowpass');
      break;
  }
}
