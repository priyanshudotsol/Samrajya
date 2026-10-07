/**
 * Natural heightfield terrain for a realm island, built from the hex layout data
 * (lib/realm/layout.ts stays the source of truth: tiles, kinds and heights).
 *
 * Height: inverse-distance weighting (power 4) of the tile heights, so the surface passes exactly
 * through every tile centre (soldiers walk at `groundY` = the nearest tile's `h`) and blends
 * smoothly in between. Virtual "ledge" samples beyond ring 3 sit at 0.2, matching groundY's
 * off-island fallback where the enemy camps stand. Gentle fbm noise is added outside the walls,
 * except along the gate road (+z), which stays flat.
 *
 * Splat (4 channels: grass, dirt, sand, rock) and a tint colour are blended per vertex with a
 * sharper kernel plus noise, so kinds meet in organic edges instead of hexagons.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { hexDistance, hexSpiral, hexToWorld, type Biome, type RealmLayout, type TileKind } from './layout';

export type SampleKind = TileKind | 'ledge';
export interface TerrainSample {
  x: number;
  z: number;
  /** Surface height at the sample centre. */
  h: number;
  kind: SampleKind;
}

export interface TerrainSpec {
  samples: TerrainSample[];
  biome: Biome;
  seed: number;
  /** Mean coast radius (world units). */
  radius: number;
  /** Coast wobble amplitude. */
  wobble: number;
  /** Radius inside which no noise is added (castle courtyard). */
  calm: number;
  /** Keep the +z gate road flat. */
  gateRoad: boolean;
}

export const LEDGE_Y = 0.2;
export const WATER_DEPTH = 0.2;
/** Water surface height (water tiles sit at h = 0.12 in the layout). */
export const WATER_Y = 0.13;

// ---------------------------------------------------------------- noise

function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]. */
export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

export function fbm(x: number, y: number, seed = 0, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, y * f, seed + i * 17) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- spec

const specCache = new WeakMap<RealmLayout, TerrainSpec>();

/** Terrain spec for a full realm island. */
export function realmTerrainSpec(layout: RealmLayout): TerrainSpec {
  const hit = specCache.get(layout);
  if (hit) return hit;
  const samples: TerrainSample[] = layout.tiles.map((t) => ({
    x: t.x,
    z: t.z,
    h: t.kind === 'water' ? t.h - WATER_DEPTH : t.h,
    kind: t.kind,
  }));
  for (const [q, r] of hexSpiral(5)) {
    if (hexDistance(q, r) <= 3) continue;
    const [x, z] = hexToWorld(q, r);
    samples.push({ x, z, h: LEDGE_Y, kind: 'ledge' });
  }
  const spec: TerrainSpec = { samples, biome: layout.biome, seed: layout.seed, radius: 6.85, wobble: 0.4, calm: 2.85, gateRoad: true };
  specCache.set(layout, spec);
  return spec;
}

/** A small 7-tile island (satellites). */
export function miniTerrainSpec(biome: Biome, seed: number): TerrainSpec {
  const samples: TerrainSample[] = [];
  for (const [q, r] of hexSpiral(3)) {
    const [x, z] = hexToWorld(q, r);
    const ring = hexDistance(q, r);
    samples.push({ x, z, h: ring <= 1 ? 0.3 : 0.24, kind: ring <= 1 ? 'ground' : 'ledge' });
  }
  return { samples, biome, seed, radius: 2.5, wobble: 0.18, calm: 1.2, gateRoad: false };
}

/** Coast radius at angle `a`. */
export function coastRadius(spec: TerrainSpec, a: number): number {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return spec.radius + fbm(c * 1.6 + 7, s * 1.6 - 3, spec.seed + 5, 3) * spec.wobble * 2;
}

/** Sample indices near (x, z), cached per spec on a coarse grid. */
function near(spec: TerrainSpec, x: number, z: number, maxD: number): TerrainSample[] {
  const out: TerrainSample[] = [];
  const m2 = maxD * maxD;
  for (const s of spec.samples) {
    const dx = s.x - x;
    const dz = s.z - z;
    if (dx * dx + dz * dz < m2) out.push(s);
  }
  return out;
}

function noiseMask(spec: TerrainSpec, x: number, z: number): number {
  const r = Math.hypot(x, z);
  let m = smooth(spec.calm, spec.calm + 0.8, r);
  if (spec.gateRoad) {
    // flat road out of the gate and the muster ground in front of it
    const road = smooth(1.7, 1.1, Math.abs(x)) * smooth(1.6, 2.2, z);
    m *= 1 - road;
  }
  return m;
}

/** Base (tile-interpolated) height at (x, z) before noise. */
function baseHeight(spec: TerrainSpec, x: number, z: number, ns: TerrainSample[]): number {
  let wSum = 0;
  let hSum = 0;
  for (const s of ns) {
    const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d2 < 1e-8) return s.h;
    const w = 1 / (d2 * d2);
    wSum += w;
    hSum += w * s.h;
  }
  return wSum > 0 ? hSum / wSum : LEDGE_Y;
}

/** Visible terrain height at (x, z) (same function the mesh is built from). */
export function terrainHeight(spec: TerrainSpec, x: number, z: number): number {
  const ns = near(spec, x, z, 2.4);
  let h = baseHeight(spec, x, z, ns);
  const m = noiseMask(spec, x, z);
  if (m > 0) {
    h += fbm(x * 0.9, z * 0.9, spec.seed, 4) * 0.035 * m;
    // rocky tiles get rugged
    let rock = 0;
    let wS = 0;
    for (const s of ns) {
      const d2 = (s.x - x) ** 2 + (s.z - z) ** 2 + 1e-6;
      const w = 1 / (d2 * d2);
      wS += w;
      if (s.kind === 'rock') rock += w;
    }
    if (wS > 0 && rock > 0) h += Math.max(0, fbm(x * 2.6, z * 2.6, spec.seed + 3, 3)) * 0.14 * (rock / wS) * m;
  }
  return h;
}

// ---------------------------------------------------------------- splat

type Channel = 0 | 1 | 2 | 3; // grass, dirt, sand, rock

function isGreen(hex: string): boolean {
  const c = new THREE.Color(hex);
  return c.g >= c.r * 0.95;
}

function kindLook(kind: SampleKind, biome: Biome): { ch: Channel; tint: THREE.Color } {
  const green = isGreen(biome.ground);
  switch (kind) {
    case 'path':
      return { ch: 1, tint: new THREE.Color(green ? '#b39573' : '#b9805a') };
    case 'field':
      return { ch: 0, tint: new THREE.Color('#c6a548') };
    case 'sand':
      return { ch: 2, tint: new THREE.Color(green ? '#cbb68a' : '#c49a6e') };
    case 'rock':
      return { ch: 3, tint: new THREE.Color(biome.rock) };
    case 'forest':
      return { ch: 0, tint: new THREE.Color(biome.ground).lerp(new THREE.Color(biome.foliage), 0.45) };
    case 'garden':
      return { ch: 0, tint: new THREE.Color(biome.groundAlt) };
    case 'water':
      return { ch: 2, tint: new THREE.Color('#9a8a62') };
    case 'ledge':
    case 'ground':
    default:
      return { ch: green ? 0 : 1, tint: new THREE.Color(biome.ground) };
  }
}

// ---------------------------------------------------------------- geometry

export interface TerrainGeometry {
  ground: THREE.BufferGeometry;
  cliff: THREE.BufferGeometry;
}

/**
 * Polar-grid ground (rings × segments) with `color` + `splat` attributes, and a craggy cliff mass
 * hanging from its rim. The cliff's top ring shares the ground's outer ring, so they seal.
 */
export function buildTerrain(spec: TerrainSpec, rings = 44, segs = 168, cliffDepth = 5.5): TerrainGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const spl: number[] = [];
  const idx: number[] = [];
  const looks = new Map<SampleKind, { ch: Channel; tint: THREE.Color }>();
  const look = (k: SampleKind) => {
    let l = looks.get(k);
    if (!l) {
      l = kindLook(k, spec.biome);
      looks.set(k, l);
    }
    return l;
  };
  const altTint = new THREE.Color(spec.biome.groundAlt);
  const tmp = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  const coast = Array.from({ length: segs }, (_, j) => coastRadius(spec, (j / segs) * Math.PI * 2));

  const vert = (x: number, z: number, rimT: number) => {
    let y = terrainHeight(spec, x, z) - rimT * rimT * 0.04;
    if (rimT > 0) y = Math.max(y, WATER_Y + 0.035); // the coast always holds the lagoons in
    pos.push(x, y, z);
    // splat + tint: sharper kernel, noise-warped distances for organic borders
    const ns = near(spec, x, z, 2.2);
    const w4 = [0, 0, 0, 0];
    let wSum = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    ns.forEach((s, i) => {
      const warp = fbm(x * 2.1 + i * 3.7, z * 2.1 - i * 1.3, spec.seed + 11, 3) * 0.35;
      const d = Math.max(0.02, Math.hypot(s.x - x, s.z - z) + warp);
      const w = 1 / Math.pow(d, 6);
      const l = look(s.kind);
      w4[l.ch] += w;
      r += l.tint.r * w;
      g += l.tint.g * w;
      b += l.tint.b * w;
      wSum += w;
    });
    if (wSum === 0) {
      w4[0] = 1;
      wSum = 1;
      const l = look('ledge');
      r = l.tint.r;
      g = l.tint.g;
      b = l.tint.b;
    }
    tmp.setRGB(r / wSum, g / wSum, b / wSum);
    // large-scale colour variation (groundAlt patches) on grassy areas
    const patch = Math.max(0, fbm(x * 0.45 + 3, z * 0.45 - 8, spec.seed + 21, 3));
    tmp.lerp(altTint, patch * 0.6 * (w4[0] / wSum));
    // a few rocky outcrops and worn patches on the open ledge
    const ledgeRock = smooth(0.18, 0.4, fbm(x * 0.8 - 2, z * 0.8 + 5, spec.seed + 31, 3)) * smooth(4.9, 5.8, Math.hypot(x, z));
    if (ledgeRock > 0) {
      const moved = (w4[0] / wSum) * ledgeRock * 0.8;
      w4[0] -= moved * wSum;
      w4[3] += moved * wSum;
    }
    // natural grade: the biome palette is stylised; pull it towards real-world saturation/value
    tmp.getHSL(hsl);
    tmp.setHSL(hsl.h, hsl.s * 0.8, hsl.l * 0.74);
    col.push(tmp.r, tmp.g, tmp.b);
    spl.push(w4[0] / wSum, w4[1] / wSum, w4[2] / wSum, w4[3] / wSum);
  };

  // centre vertex + rings
  vert(0, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    // denser rings towards the rim
    const rt = Math.pow(t, 0.85);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const R = coast[j] * rt;
      vert(Math.cos(a) * R, Math.sin(a) * R, smooth(0.9, 1, rt));
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs;
    const a1 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a0 + j, a0 + j1, a1 + j);
      idx.push(a0 + j1, a1 + j1, a1 + j);
    }
  }
  const ground = new THREE.BufferGeometry();
  ground.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ground.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  ground.setAttribute('splat', new THREE.Float32BufferAttribute(spl, 4));
  ground.setIndex(idx);
  ground.computeVertexNormals();
  ground.computeBoundingSphere();

  // ---- cliff: rim ring, then rings going down and in, craggy
  const cp: number[] = [];
  const ci: number[] = [];
  const rimStart = 1 + (rings - 1) * segs;
  const levels = 20;
  for (let k = 0; k <= levels; k++) {
    const t = Math.pow(k / levels, 1.25); // more rings near the lip
    for (let j = 0; j <= segs; j++) {
      const jj = j % segs;
      const a = (jj / segs) * Math.PI * 2;
      if (k === 0) {
        cp.push(pos[(rimStart + jj) * 3], pos[(rimStart + jj) * 3 + 1], pos[(rimStart + jj) * 3 + 2]);
        continue;
      }
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rimY = pos[(rimStart + jj) * 3 + 1];
      // profile: rounded lip, then a long craggy taper to a point
      const prof = Math.pow(1 - t, 1.15) * (1 + 0.08 * Math.sin(Math.PI * t));
      const lobes = fbm(ca * 1.3 + 4, sa * 1.3 - t * 1.2, spec.seed + 41, 3);
      const ridges = fbm(ca * 3 + sa * 0.5 + t * 2.4, sa * 3 - t * 1.7, spec.seed + 42, 4);
      const crag = fbm(ca * 9 + t * 3, sa * 9 - t * 2, spec.seed + 43, 3);
      const grow = Math.min(1, t * 5);
      const R = coast[jj] * prof * (1 + lobes * 0.35 * grow + ridges * 0.16 * grow + crag * 0.07 * Math.min(1, t * 8));
      const y = rimY - 0.04 - t * cliffDepth * (spec.radius / 6.75) * (0.85 + 0.35 * fbm(ca * 2, sa * 2, spec.seed + 47, 2) + 0.12 * crag);
      cp.push(ca * Math.max(0.05, R), y, sa * Math.max(0.05, R));
    }
  }
  const row = segs + 1;
  for (let k = 0; k < levels; k++) {
    for (let j = 0; j < segs; j++) {
      const a = k * row + j;
      const b = (k + 1) * row + j;
      ci.push(a, a + 1, b);
      ci.push(a + 1, b + 1, b);
    }
  }
  const cliff = new THREE.BufferGeometry();
  cliff.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  cliff.setIndex(ci);
  cliff.computeVertexNormals();
  cliff.computeBoundingSphere();
  return { ground, cliff };
}

/**
 * Water sheet over the lagoons: the ground grid at WATER_Y with a `depth` attribute (water depth
 * per vertex) for shallow→deep colour, alpha and shore foam. Dry triangles are dropped.
 */
export function buildWater(ground: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const p = ground.attributes.position as THREE.BufferAttribute;
  const index = ground.index!;
  const pos = new Float32Array(p.count * 3);
  const depth = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    pos[i * 3] = p.getX(i);
    pos[i * 3 + 1] = WATER_Y;
    pos[i * 3 + 2] = p.getZ(i);
    depth[i] = WATER_Y - p.getY(i);
  }
  const idx: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    const b = index.getX(t + 1);
    const c = index.getX(t + 2);
    if (Math.max(depth[a], depth[b], depth[c]) > -0.005) idx.push(a, b, c);
  }
  if (idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(p.count * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** A chiselled boulder: a noisy sphere cut by random planes (flat fractured faces, smooth normals). */
export function boulderGeometry(seed: number, detail = 3, rough = 0.18): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  let s = seed * 7919;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const planes = Array.from({ length: 7 }, () => {
    const n = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    if (n.y < -0.3) n.y *= 0.3; // keep the base roundish
    return { n: n.normalize(), d: 0.62 + rnd() * 0.22 };
  });
  planes.push({ n: new THREE.Vector3(0, -1, 0), d: 0.45 }); // flat bottom
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * 2.2 + seed, v.y * 2.2 - v.z * 1.3, seed, 4);
    v.multiplyScalar(1 + n * rough);
    for (const pl of planes) {
      const d = v.dot(pl.n);
      if (d > pl.d) v.addScaledVector(pl.n, pl.d - d);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
