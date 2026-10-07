/**
 * Per-frame sky values written by RealmLighting and read by other scene parts (diyas, fire).
 * A plain mutable object: per-frame motion never goes through React state (KINGDOM_UI §6.3).
 */
export const skyState = {
  /** 0 at epoch start → 1 at the bell. */
  progress: 0,
  /** 0 by day → 1 at dusk / during battle (diyas light up). */
  dusk: 0,
  /** 0..1 red-sky amount (final 10 s and battles). */
  red: 0,
};

/** Shared camera-shake impulse (projectile impacts add to it, CameraRig decays it). */
export const shake = { value: 0 };
