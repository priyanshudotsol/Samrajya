/**
 * Deterministic hex-island layout for a territory (docs/KINGDOM_UI.md §4.1).
 *
 * Axial coords (q, r), radius 3 → 37 tiles:
 *   ring 0  keep
 *   ring 1  courtyard inside the walls (treasury, troops); walls/towers/gate sit on its outer edge
 *   ring 2  buildings: treasury-side houses, barracks, power landmarks
 *   ring 3  biome edge (water / forest / rock …) + camp slots for invading armies
 *
 * The layout is seeded by the territory id (== the kingdom that founded it), so the land keeps its
 * look after a conquest; only the colours/banners follow the current owner.
 */
import { KINGDOMS } from '@/lib/game/factions';

export type TileKind = 'ground' | 'path' | 'field' | 'water' | 'forest' | 'rock' | 'sand' | 'garden';
export type BuildingSlot = 'keep' | 'treasury' | 'barracks' | 'landmark' | 'houses' | undefined;

export interface Tile {
  q: number;
  r: number;
  ring: number;
  kind: TileKind;
  building?: BuildingSlot;
  /** 0..5 rotation step (60° each). */
  rot: number;
  /** Top height of the tile prism. */
  h: number;
  /** World position of the tile centre. */
  x: number;
  z: number;
  /** Angle of the tile centre around the island (radians, atan2(z, x)). */
  angle: number;
}

export interface Biome {
  name: string;
  ground: string;
  groundAlt: string;
  edge: { kind: TileKind; weight: number }[];
  water: string;
  rock: string;
  foliage: string;
  /** Under-island rock colour. */
  cliff: string;
  /** Sky tint mixed into the day sky. */
  skyTint: string;
}

/** One biome per founding kingdom, matching KINGDOMS[i].biome. */
export const BIOMES: Biome[] = [
  {
    name: KINGDOMS[0].biome, // river plains (Ganga)
    ground: '#8fae52',
    groundAlt: '#a8b85a',
    edge: [
      { kind: 'water', weight: 4 },
      { kind: 'field', weight: 4 },
      { kind: 'forest', weight: 2 },
      { kind: 'ground', weight: 2 },
    ],
    water: '#3f8fb0',
    rock: '#8d8478',
    foliage: '#4f7a32',
    cliff: '#6b5a44',
    skyTint: '#f2d79a',
  },
  {
    name: KINGDOMS[1].biome, // dry plains, red earth
    ground: '#b5683f',
    groundAlt: '#c98a52',
    edge: [
      { kind: 'rock', weight: 3 },
      { kind: 'sand', weight: 3 },
      { kind: 'field', weight: 2 },
      { kind: 'forest', weight: 1 },
    ],
    water: '#4b7f8f',
    rock: '#8a4a32',
    foliage: '#6f7a32',
    cliff: '#6e3826',
    skyTint: '#f0b483',
  },
  {
    name: KINGDOMS[2].biome, // coast / harbour
    ground: '#7fb35e',
    groundAlt: '#d8c58a',
    edge: [
      { kind: 'water', weight: 7 },
      { kind: 'sand', weight: 3 },
      { kind: 'forest', weight: 1 },
    ],
    water: '#2f9fcf',
    rock: '#9a9488',
    foliage: '#3f8a4a',
    cliff: '#5e5648',
    skyTint: '#bfe3f2',
  },
  {
    name: KINGDOMS[3].biome, // mountain cliffs
    ground: '#7f9168',
    groundAlt: '#9aa184',
    edge: [
      { kind: 'rock', weight: 6 },
      { kind: 'forest', weight: 2 },
      { kind: 'ground', weight: 1 },
    ],
    water: '#4f84a8',
    rock: '#8c8a92',
    foliage: '#3e6a46',
    cliff: '#55525e',
    skyTint: '#d7cff2',
  },
  {
    name: KINGDOMS[4].biome, // boulders and gardens (Hampi)
    ground: '#6fae54',
    groundAlt: '#8cc062',
    edge: [
      { kind: 'rock', weight: 4 },
      { kind: 'garden', weight: 4 },
      { kind: 'forest', weight: 2 },
      { kind: 'water', weight: 1 },
    ],
    water: '#3f9a9a',
    rock: '#c49a6c',
    foliage: '#2f8a46',
    cliff: '#7a5e44',
    skyTint: '#e6f2b8',
  },
  {
    name: KINGDOMS[5].biome, // night forest
    ground: '#3f6a4a',
    groundAlt: '#4f7a52',
    edge: [
      { kind: 'forest', weight: 7 },
      { kind: 'rock', weight: 1 },
      { kind: 'water', weight: 1 },
    ],
    water: '#2f5a8a',
    rock: '#6a6a7a',
    foliage: '#1f4a36',
    cliff: '#3a3a4a',
    skyTint: '#9aa0d8',
  },
];

/** Tiny seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const HEX_SIZE = 1;
export const REALM_RADIUS = 3;
/** Radius (world units) of the curtain wall: between ring 1 and ring 2 tile centres. */
export const WALL_RADIUS = 2.55;
/** Gate faces +z (towards the default camera). */
export const GATE_ANGLE = Math.PI / 2;
/** Radius where enemy camps stand (just outside ring 3). */
export const CAMP_RADIUS = 5.9;

export function hexToWorld(q: number, r: number, size = HEX_SIZE): [number, number] {
  return [size * Math.sqrt(3) * (q + r / 2), size * 1.5 * r];
}

export function hexDistance(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

/** All axial coords within `radius`, ring by ring (centre first). */
export function hexSpiral(radius: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  const dirs = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];
  for (let k = 1; k <= radius; k++) {
    let q = -k;
    let r = k; // start at direction 4 × k
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < k; step++) {
        out.push([q, r]);
        q += dirs[side][0];
        r += dirs[side][1];
      }
    }
  }
  return out;
}

function weighted<T extends { weight: number }>(items: T[], rand: () => number): T {
  const sum = items.reduce((a, b) => a + b.weight, 0);
  let x = rand() * sum;
  for (const it of items) {
    x -= it.weight;
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

const angleDist = (a: number, b: number) => {
  const d = Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  return d;
};

export interface RealmLayout {
  seed: number;
  biome: Biome;
  tiles: Tile[];
  /** World positions of house plots (ordered; first N are used for N houses). */
  housePlots: { x: number; z: number; rot: number }[];
  /** Six landmark plots, index = power bit index. */
  landmarkPlots: { x: number; z: number; rot: number }[];
  treasury: { x: number; z: number };
  barracks: { x: number; z: number; rot: number };
  /** Decorative props on edge tiles. */
  trees: { x: number; z: number; s: number; y: number }[];
  rocks: { x: number; z: number; s: number; y: number }[];
}

const layoutCache = new Map<number, RealmLayout>();

/** Deterministic layout for territory `territory` (cached). */
export function generateRealm(territory: number): RealmLayout {
  const hit = layoutCache.get(territory);
  if (hit) return hit;
  const seed = (territory + 1) * 9973;
  const rand = mulberry32(seed);
  const biome = BIOMES[territory % BIOMES.length];

  const tiles: Tile[] = [];
  for (const [q, r] of hexSpiral(REALM_RADIUS)) {
    const ring = hexDistance(q, r);
    const [x, z] = hexToWorld(q, r);
    const angle = Math.atan2(z, x);
    let kind: TileKind = 'ground';
    let h = 0.3;
    if (ring === 3) {
      kind = weighted(biome.edge, rand).kind;
      // keep a road out of the gate
      if (angleDist(angle, GATE_ANGLE) < 0.3) kind = 'path';
      h = kind === 'water' ? 0.12 : kind === 'rock' ? 0.45 + rand() * 0.35 : 0.22 + rand() * 0.12;
    } else if (ring === 2) {
      kind = angleDist(angle, GATE_ANGLE) < 0.3 ? 'path' : rand() < 0.2 ? 'field' : 'ground';
      h = 0.3 + rand() * 0.05;
    } else if (ring === 1) {
      kind = 'path';
      h = 0.34;
    } else {
      kind = 'ground';
      h = 0.36;
    }
    tiles.push({ q, r, ring, kind, rot: Math.floor(rand() * 6), h, x, z, angle });
  }

  // Ring-2 slots: barracks beside the gate road, treasury inside the courtyard (ring 1).
  const ring2 = tiles.filter((t) => t.ring === 2 && t.kind !== 'path');
  ring2.sort((a, b) => a.angle - b.angle);
  const byGate = [...ring2].sort((a, b) => angleDist(a.angle, GATE_ANGLE) - angleDist(b.angle, GATE_ANGLE));
  const barracksTile = byGate[0];
  barracksTile.building = 'barracks';
  // Landmark plots: six ring-2 tiles spread around the island (skipping the barracks).
  const rest = ring2.filter((t) => t !== barracksTile);
  const landmarkTiles: Tile[] = [];
  for (let i = 0; i < 6; i++) {
    const want = GATE_ANGLE + Math.PI / 3 + (i * Math.PI * 2) / 6 + 0.35;
    const best = rest
      .filter((t) => !landmarkTiles.includes(t))
      .sort((a, b) => angleDist(a.angle, want) - angleDist(b.angle, want))[0];
    if (best) landmarkTiles.push(best);
  }
  landmarkTiles.forEach((t) => (t.building = 'landmark'));
  rest.filter((t) => !t.building).forEach((t) => (t.building = 'houses'));

  const keep = tiles[0];
  keep.building = 'keep';
  const ring1 = tiles.filter((t) => t.ring === 1);
  const treasuryTile = ring1.sort((a, b) => angleDist(a.angle, GATE_ANGLE + 1.2) - angleDist(b.angle, GATE_ANGLE + 1.2))[0];
  treasuryTile.building = 'treasury';

  // House plots: 3 per free ring-2 tile, then 2 per land ring-3 tile.
  const housePlots: RealmLayout['housePlots'] = [];
  const offsets = [
    [-0.32, -0.22],
    [0.34, -0.12],
    [0.0, 0.34],
  ];
  for (const t of tiles.filter((x) => x.building === 'houses')) {
    for (const [ox, oz] of offsets) housePlots.push({ x: t.x + ox, z: t.z + oz, rot: rand() * Math.PI });
  }
  for (const t of tiles.filter((x) => x.ring === 3 && (x.kind === 'ground' || x.kind === 'field' || x.kind === 'garden'))) {
    housePlots.push({ x: t.x - 0.25, z: t.z, rot: rand() * Math.PI });
    housePlots.push({ x: t.x + 0.3, z: t.z + 0.2, rot: rand() * Math.PI });
  }
  // Interleave so the first houses spread around the island instead of clustering.
  housePlots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || a.x - b.x);

  const trees: RealmLayout['trees'] = [];
  const rocks: RealmLayout['rocks'] = [];
  for (const t of tiles.filter((x) => x.ring === 3)) {
    if (t.kind === 'forest' || t.kind === 'garden') {
      const n = t.kind === 'forest' ? 3 + Math.floor(rand() * 2) : 2;
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const d = 0.15 + rand() * 0.45;
        trees.push({ x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d, s: 0.7 + rand() * 0.6, y: t.h });
      }
    }
    if (t.kind === 'rock' || (t.kind === 'garden' && rand() < 0.6)) {
      const n = 1 + Math.floor(rand() * 2);
      for (let i = 0; i < n; i++) {
        rocks.push({
          x: t.x + (rand() - 0.5) * 0.7,
          z: t.z + (rand() - 0.5) * 0.7,
          s: 0.25 + rand() * 0.35,
          y: t.h,
        });
      }
    }
  }

  const layout: RealmLayout = {
    seed,
    biome,
    tiles,
    housePlots,
    landmarkPlots: landmarkTiles.map((t) => ({ x: t.x, z: t.z, rot: -t.angle + Math.PI / 2 })),
    treasury: { x: treasuryTile.x * 0.85, z: treasuryTile.z * 0.85 },
    barracks: { x: barracksTile.x, z: barracksTile.z, rot: -barracksTile.angle + Math.PI / 2 },
    trees,
    rocks,
  };
  layoutCache.set(territory, layout);
  return layout;
}

const heightCache = new WeakMap<RealmLayout, Map<string, number>>();

/** Walking height at world (x, z): the hex tile top, or the camp ledge beyond the island. */
export function groundY(layout: RealmLayout, x: number, z: number): number {
  let map = heightCache.get(layout);
  if (!map) {
    map = new Map(layout.tiles.map((t) => [`${t.q},${t.r}`, t.h]));
    heightCache.set(layout, map);
  }
  const fq = ((Math.sqrt(3) / 3) * x - z / 3) / HEX_SIZE;
  const fr = ((2 / 3) * z) / HEX_SIZE;
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  const h = map.get(`${q},${r}`);
  if (h !== undefined) return h;
  return 0.2;
}

/** Placement of the central plains: the middle of the six homelands. */
const PLAINS_POS = {
  lat: KINGDOMS.reduce((a, k) => a + k.lat, 0) / KINGDOMS.length,
  lng: (Math.atan2(
    KINGDOMS.reduce((a, k) => a + Math.sin((k.lng * Math.PI) / 180), 0),
    KINGDOMS.reduce((a, k) => a + Math.cos((k.lng * Math.PI) / 180), 0),
  ) * 180) / Math.PI,
};

/**
 * Direction (radians in the XZ plane, atan2(z, x)) from territory `from` to territory `to`,
 * from their globe placement: east = +x, north = −z.
 */
export function bearing(from: number, to: number): number {
  const a = KINGDOMS[from] ?? PLAINS_POS;
  const b = KINGDOMS[to] ?? PLAINS_POS;
  let dLng = b.lng - a.lng;
  if (dLng > 180) dLng -= 360;
  if (dLng < -180) dLng += 360;
  const dLat = b.lat - a.lat;
  return Math.atan2(-dLat, dLng);
}

/** Spreads angles so no two are closer than `minSep` (keeps input order). */
export function spreadAngles(angles: number[], minSep = 0.75): number[] {
  const out = [...angles];
  for (let iter = 0; iter < 8; iter++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const d = angleDist(out[i], out[j]);
        if (d < minSep) {
          const push = (minSep - d) / 2 + 0.01;
          // push apart in the direction that increases the gap
          const sign = Math.sin(out[j] - out[i]) >= 0 ? 1 : -1;
          out[i] -= sign * push;
          out[j] += sign * push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return out;
}

export { angleDist };
