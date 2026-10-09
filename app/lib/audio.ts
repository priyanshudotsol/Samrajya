/**
 * Tiny sound API (docs/KINGDOM_UI.md §9). Muted by default; unmuting (a user click) creates the
 * AudioContext, which satisfies autoplay rules. Everything is synthesised with WebAudio, so no
 * audio files are shipped. Safe to import and call on the server (all no-ops).
 */

export type Sfx = 'horn' | 'drum' | 'clash' | 'catapult' | 'tick' | 'fanfare' | 'bell' | 'click' | 'swing' | 'hit' | 'arrow' | 'death' | 'gate' | 'hurt';

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
  if (!m) {
    ensureCtx();
    preloadSfx();
  }
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
    case 'swing':
      noise(c, t, 0.14, 0.12, 2400);
      break;
    case 'hit':
      noise(c, t, 0.09, 0.3, 1200);
      tone(c, 160, t, 0.12, 'sine', 0.35, 70);
      break;
    case 'hurt':
      tone(c, 120, t, 0.25, 'sawtooth', 0.12, 60);
      noise(c, t, 0.12, 0.3, 700, 'lowpass');
      break;
    case 'arrow':
      noise(c, t, 0.22, 0.1, 5000);
      tone(c, 900, t, 0.18, 'sine', 0.04, 400);
      break;
    case 'death':
      tone(c, 220, t, 0.6, 'sawtooth', 0.1, 70);
      noise(c, t + 0.05, 0.4, 0.15, 500, 'lowpass');
      break;
    case 'gate':
      tone(c, 75, t, 0.3, 'sine', 0.55, 40);
      noise(c, t, 0.18, 0.25, 350, 'lowpass');
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// Recorded sound effects (public/audio/sfx, all CC0, see CREDITS.md)
// ---------------------------------------------------------------------------------------------

/** Named effects and the files that vary them (one is picked at random each time). */
const SAMPLES = {
  swing: ['swing1', 'swing2', 'swing3'],
  heavy: ['heavy1', 'heavy2'],
  clash: ['clash1', 'clash2', 'clash3', 'clash4', 'clash5'],
  punch: ['punch1', 'punch2', 'punch3'],
  plate: ['plate1', 'plate2', 'plate3'],
  hurt: ['hurt1', 'hurt2', 'hurt3', 'hurt4', 'hurt5'],
  die: ['die1'],
  bodyfall: ['bodyfall'],
  bow: ['bow1'],
  arrowhit: ['arrowhit1', 'arrowhit2'],
  gatehit: ['gate1', 'gate2', 'gate3'],
  gatebreak: ['gatebreak'],
  unsheathe: ['unsheathe'],
  warhorn: ['horn'],
  step: ['step1', 'step2', 'step3', 'step4'],
} as const;
export type Sample = keyof typeof SAMPLES;
export type Ambience = 'drums' | 'crowd';

const buffers = new Map<string, AudioBuffer | null>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

function load(file: string): Promise<AudioBuffer | null> {
  const c = ensureCtx();
  if (!c) return Promise.resolve(null);
  let p = loading.get(file);
  if (!p) {
    p = fetch(`/audio/sfx/${file}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
      .then((b) => c.decodeAudioData(b))
      .then((buf) => {
        buffers.set(file, buf);
        return buf;
      })
      .catch(() => {
        buffers.set(file, null);
        return null;
      });
    loading.set(file, p);
  }
  return p;
}

/** Fetches and decodes every effect (call after the first unmute). */
export function preloadSfx() {
  for (const files of Object.values(SAMPLES)) files.forEach((f) => void load(f));
  void load('drums');
  void load('crowd');
}

/** Where the listener is (set every frame by the camera rig): position and right vector in xz. */
export const listener = { x: 0, z: 0, rx: 1, rz: 0 };

export interface SfxOpts {
  /** 0..1 (before distance falloff). */
  volume?: number;
  /** World position for distance falloff and stereo pan. */
  x?: number;
  z?: number;
  /** Seconds from now. */
  delay?: number;
  /** Playback rate; ±7% jitter is added. */
  rate?: number;
}

const lastPlayed = new Map<string, number>();

/** Plays a recorded effect (a random variation), spatialised if a position is given. */
export function playSfx(name: Sample, opts: SfxOpts = {}) {
  if (muted) return;
  const c = ensureCtx();
  if (!c || !master) return;
  // the same effect at most every 45 ms (a crowd of swings would otherwise stack into noise)
  const nowMs = performance.now();
  if (nowMs - (lastPlayed.get(name) ?? 0) < 45) return;
  lastPlayed.set(name, nowMs);
  const files = SAMPLES[name];
  const file = files[Math.floor(Math.random() * files.length)];
  let gain = opts.volume ?? 1;
  let pan = 0;
  if (opts.x !== undefined && opts.z !== undefined) {
    const dx = opts.x - listener.x;
    const dz = opts.z - listener.z;
    const dist = Math.hypot(dx, dz);
    gain *= 1 / (1 + dist * dist * 0.035);
    pan = Math.max(-0.85, Math.min(0.85, (dx * listener.rx + dz * listener.rz) / Math.max(2, dist)));
  }
  if (gain < 0.02) return;
  const start = () => {
    const buf = buffers.get(file);
    if (!buf || !ctx || !master) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (0.93 + Math.random() * 0.14);
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(g).connect(p).connect(master);
    src.start(ctx.currentTime + (opts.delay ?? 0));
  };
  if (buffers.has(file)) start();
  else void load(file).then(start);
}

const loops: Partial<Record<Ambience, { src: AudioBufferSourceNode; gain: GainNode }>> = {};

/**
 * Battle ambience beds (war drums, a shouting crowd), looped and faded to `volume` (0 = off).
 * Called every frame or so by the realm; cheap when nothing changes.
 */
export function setAmbience(name: Ambience, volume: number) {
  const c = ctx;
  if (!c || !master) return;
  const v = muted ? 0 : Math.max(0, Math.min(1, volume));
  let l = loops[name];
  if (!l) {
    if (v <= 0.001) return;
    const buf = buffers.get(name);
    if (!buf) {
      void load(name);
      return;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(master);
    src.start();
    l = { src, gain };
    loops[name] = l;
  }
  l.gain.gain.setTargetAtTime(v, c.currentTime, 0.6);
}
