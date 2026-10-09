/**
 * Per-frame combat feedback shared by the renderers (plain mutable state, like cameraState).
 * CombatFx writes it from the store's combat events; Units reads it to flash wounded warriors.
 */
export const fx = {
  /** performance.now() of each warrior's last wound, by wallet. */
  hitAt: new Map<string, number>(),
  /** Was that wound taken on a raised guard? */
  blocked: new Map<string, boolean>(),
  /** performance.now() of each warrior's last swing / shot, and a running count (restarts the clip). */
  swingAt: new Map<string, number>(),
  swingN: new Map<string, number>(),
  /** Hitstop: the warrior's animation freezes until this performance.now() (both fighters). */
  freezeUntil: new Map<string, number>(),
  /** Knockback seen on screen: a displacement that eases out (performance.now()). */
  knock: new Map<string, { dx: number; dz: number; born: number; dur: number }>(),
  /** Position in the light combo of each warrior's last swing (picks the clip). */
  combo: new Map<string, number>(),
  /** The last swing was a heavy blow. */
  heavy: new Map<string, boolean>(),
  /** Slow motion until this performance.now() (a kill you were part of). */
  slowUntil: 0,
  /** Camera punch: a quick zoom-in that settles (performance.now(), strength 0..1). */
  punch: { at: -1e9, amount: 0 },
};

/** Animation speed right now (1 = normal; dips during a kill's slow motion). */
export function timeScale(nowMs = performance.now()): number {
  return nowMs < fx.slowUntil ? 0.3 : 1;
}

/** Hitstop for a landed blow: both warriors freeze for a beat that grows with the blow. */
export function hitstop(walletA: string, walletB: string, ms: number) {
  const until = performance.now() + ms;
  fx.freezeUntil.set(walletA, until);
  fx.freezeUntil.set(walletB, until);
}

/** Knockback on screen: the warrior slides `dist` away from (fromX, fromZ). */
export function knockback(wallet: string, x: number, z: number, fromX: number, fromZ: number, dist: number) {
  const d = Math.hypot(x - fromX, z - fromZ) || 1;
  fx.knock.set(wallet, { dx: ((x - fromX) / d) * dist, dz: ((z - fromZ) / d) * dist, born: performance.now(), dur: 220 + dist * 260 });
}

/** The knockback displacement still to show (eases out to 0). */
export function knockOffset(wallet: string, nowMs: number): { dx: number; dz: number } {
  const k = fx.knock.get(wallet);
  if (!k) return { dx: 0, dz: 0 };
  const t = (nowMs - k.born) / k.dur;
  if (t >= 1) {
    fx.knock.delete(wallet);
    return { dx: 0, dz: 0 };
  }
  // fast out, settle back: the warrior is shoved and slides to where the feed says it stands
  const e = Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t);
  return { dx: k.dx * e, dz: k.dz * e };
}

/** How long a swing shows as the attack animation. */
export const SWING_SHOW_MS = 560;
/** How long a flinch shows. */
export const HIT_SHOW_MS = 380;

export function markSwing(wallet: string, opts: { heavy?: boolean; combo?: number } = {}) {
  fx.swingAt.set(wallet, performance.now());
  fx.swingN.set(wallet, (fx.swingN.get(wallet) ?? 0) + 1);
  fx.heavy.set(wallet, !!opts.heavy);
  fx.combo.set(wallet, opts.combo ?? 0);
}

export const HIT_FLASH_MS = 180;

/** A floating combat number (drawn by the DOM FloaterLayer, projected through the realm camera). */
export interface Floater {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  /** performance.now() */
  born: number;
  big: boolean;
}

export const FLOAT_MS = 950;
export const floaters: Floater[] = [];

export function addFloater(f: Floater) {
  floaters.push(f);
  if (floaters.length > 24) floaters.splice(0, floaters.length - 24);
}
