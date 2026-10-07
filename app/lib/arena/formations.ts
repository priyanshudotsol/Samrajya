/**
 * Formation target sampling (docs/KINGDOM_UI.md §5.2). Each formation returns `count` target
 * positions (x, y, z) plus a facing angle; troops damp towards them on their own, so changing
 * formation is just swapping targets.
 */
import { CAMP_RADIUS, WALL_RADIUS } from '@/lib/realm/layout';

export interface Target {
  x: number;
  y: number;
  z: number;
  /** Facing (radians around y). */
  face: number;
  /** 0 = hidden (dead / routed away). */
  scale: number;
  /** 1 = swinging a sword (sparring drill); 2 = walking (target moves every frame). */
  act?: number;
}

export const ISLAND_Y = 0.36;
export const WALL_TOP_BASE = 0.55;
/** z of the gate (the wall's apothem; the gate sits mid-edge facing +z). */
export const GATE_Z = WALL_RADIUS * Math.cos(Math.PI / 6);

const polar = (r: number, a: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;

/** Point on the hexagonal wall at angle `a` (corners at k·60°). */
export function wallPoint(a: number, r = WALL_RADIUS): [number, number] {
  const seg = Math.PI / 3;
  const k = Math.floor((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / seg);
  const a0 = k * seg;
  const a1 = a0 + seg;
  const t = ((((a - a0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / seg;
  const x = Math.cos(a0) * r * (1 - t) + Math.cos(a1) * r * t;
  const z = Math.sin(a0) * r * (1 - t) + Math.sin(a1) * r * t;
  return [x, z];
}

/** Soldiers spread along the wall walk, facing outward. */
export function walls(count: number, wallTop: number, out: Target[] = [], offset = 0): Target[] {
  for (let i = 0; i < count; i++) {
    const a = offset + ((i + 0.5) / Math.max(count, 1)) * Math.PI * 2 + 0.11;
    const [x, z] = wallPoint(a, WALL_RADIUS - 0.02);
    out.push({ x, y: wallTop, z, face: Math.atan2(x, z), scale: 1 });
  }
  return out;
}

/** Soldiers drilling in the courtyard ring (between the keep and the wall). */
export function courtyard(count: number, out: Target[] = []): Target[] {
  for (let i = 0; i < count; i++) {
    const ring = i % 2;
    const a = (i / Math.max(count, 1)) * Math.PI * 2 + ring * 0.3;
    const [x, z] = polar(1.25 + ring * 0.55, a);
    out.push({ x, y: ISLAND_Y, z, face: a + Math.PI / 2, scale: 1 });
  }
  return out;
}

/** Pairs of soldiers sparring in the courtyard (facing each other, swords swinging). */
export function sparring(count: number, out: Target[] = []): Target[] {
  const pairs = Math.ceil(count / 2);
  for (let i = 0; i < count; i++) {
    const pair = Math.floor(i / 2);
    const side = i % 2 ? 1 : -1;
    // skip the gate road (+z) so pairs don't block the gate
    const a = Math.PI / 2 + 0.7 + (pair / Math.max(pairs, 1)) * (Math.PI * 2 - 1.4);
    const [cx, cz] = polar(1.55 + (pair % 2) * 0.35, a);
    const tx = Math.cos(a + Math.PI / 2) * 0.21 * side;
    const tz = Math.sin(a + Math.PI / 2) * 0.21 * side;
    out.push({ x: cx + tx, y: ISLAND_Y, z: cz + tz, face: Math.atan2(-tx, -tz), scale: 1, act: 1 });
  }
  return out;
}

/** Block in front of the gate (inside the toran), facing out. */
export function gateFront(count: number, out: Target[] = []): Target[] {
  const cols = 6;
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = (c - (cols - 1) / 2) * 0.24;
    const z = GATE_Z + 0.4 + r * 0.24;
    out.push({ x, y: ISLAND_Y - 0.05, z, face: 0, scale: 1 });
  }
  return out;
}

/** Tight cluster around a camp at `angle`. */
export function camp(count: number, angle: number, out: Target[] = [], radius = CAMP_RADIUS): Target[] {
  for (let i = 0; i < count; i++) {
    const ga = i * 2.399963; // golden angle
    const d = 0.18 + Math.sqrt(i) * 0.17;
    const [cx, cz] = polar(radius + 0.35, angle);
    const x = cx + Math.cos(ga) * d;
    const z = cz + Math.sin(ga) * d;
    out.push({ x, y: 0.2, z, face: Math.atan2(-x, -z), scale: 1 });
  }
  return out;
}

/** Attackers converging on the gate: a wedge per attacker slot. */
export function assault(count: number, slot: number, slots: number, out: Target[] = []): Target[] {
  const spread = Math.max(slots, 1);
  const baseX = (slot - (spread - 1) / 2) * 1.0;
  for (let i = 0; i < count; i++) {
    const c = i % 4;
    const r = Math.floor(i / 4);
    const x = baseX + (c - 1.5) * 0.22;
    const z = GATE_Z + 1.25 + r * 0.24;
    out.push({ x, y: 0.3, z, face: Math.PI, scale: 1 });
  }
  return out;
}

/** Column marching from the gate along the road and out towards `angle`. */
export function march(count: number, angle: number, out: Target[] = []): Target[] {
  for (let i = 0; i < count; i++) {
    const d = WALL_RADIUS + 0.8 + i * 0.26;
    const [x, z] = polar(Math.min(d, CAMP_RADIUS + 0.4), angle);
    const lane = (i % 2 === 0 ? 1 : -1) * 0.12;
    out.push({
      x: x + Math.cos(angle + Math.PI / 2) * lane,
      y: 0.3,
      z: z + Math.sin(angle + Math.PI / 2) * lane,
      face: Math.atan2(Math.cos(angle), Math.sin(angle)),
      scale: 1,
    });
  }
  return out;
}

/** Fleeing outward past the island edge (they shrink away). */
export function rout(count: number, angle: number, out: Target[] = []): Target[] {
  for (let i = 0; i < count; i++) {
    const a = angle + ((i % 5) - 2) * 0.12;
    const [x, z] = polar(CAMP_RADIUS + 3 + (i % 3), a);
    out.push({ x, y: -0.4, z, face: Math.atan2(Math.cos(a), Math.sin(a)), scale: 0 });
  }
  return out;
}

/** Conquerors pouring into the courtyard. */
export function occupy(count: number, out: Target[] = []): Target[] {
  return courtyard(count, out);
}

/** Defenders cut down (shrink in place). */
export function fallen(targets: Target[]): Target[] {
  return targets.map((t) => ({ ...t, y: t.y - 0.1, scale: 0 }));
}
