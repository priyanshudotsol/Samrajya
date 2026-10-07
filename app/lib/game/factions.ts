import { N_KINGDOMS } from './types';

/** Power bit flags. Kingdom i starts with power bit `1 << i`. Powers stack and are inherited. */
export const POWER = {
  KURU_FORTRESS: 1 << 0, // Hastinapur: defense ×1.3
  GAJA_SENA: 1 << 1, // Magadh: attack ×1.2
  SAMUDRA_VYAPAR: 1 << 2, // Kalinga: +25% loot on wins
  VIDYA_REACH: 1 << 3, // Takshashila: can attack non-adjacent territories
  ANNAPURNA_HARVEST: 1 << 4, // Vijayanagar: failed attacks lose only half of k_loss
  RATRI_RAID: 1 << 5, // Avanti: first attack each game ×1.5
} as const;

export interface PowerInfo {
  bit: number;
  name: string;
  effect: string;
}

export const POWERS: PowerInfo[] = [
  { bit: POWER.KURU_FORTRESS, name: 'Kuru Fortress', effect: 'Defense ×1.3' },
  { bit: POWER.GAJA_SENA, name: 'Gaja Sena', effect: 'Attack ×1.2' },
  { bit: POWER.SAMUDRA_VYAPAR, name: 'Samudra Vyapar', effect: '+25% loot on wins' },
  { bit: POWER.VIDYA_REACH, name: 'Vidya Reach', effect: 'Attack any territory' },
  { bit: POWER.ANNAPURNA_HARVEST, name: 'Annapurna Harvest', effect: 'Failed attacks lose half' },
  { bit: POWER.RATRI_RAID, name: 'Ratri Raid', effect: 'First attack ×1.5' },
];

export function powersFromMask(mask: number): PowerInfo[] {
  return POWERS.filter((p) => (mask & p.bit) !== 0);
}

export interface KingdomInfo {
  id: number;
  name: string;
  /** 4-letter label used in tight UI (battle log, arcs). */
  short: string;
  /** Historical flavour line. */
  epithet: string;
  /** Primary colour (banners, roofs, arcs). */
  color: string;
  /** Dark accent colour. */
  accent: string;
  biome: string;
  power: PowerInfo;
  /** Globe placement (spread for visual balance, not real locations). */
  lat: number;
  lng: number;
  region: string;
  /** `continent` in data/globe.json whose hex dots are tinted with the owner's colour. */
  continent: string;
  /** Adjacent territory ids. */
  neighbours: number[];
}

/** Colours from docs/KINGDOM_UI.md §2, adjacency from docs/ARCHITECTURE.md §2. */
export const KINGDOMS: KingdomInfo[] = [
  {
    id: 0,
    name: 'Hastinapur',
    short: 'Hast',
    epithet: 'Kuru capital',
    color: '#E8B04A',
    accent: '#5A3A0E',
    biome: 'river plains',
    power: POWERS[0],
    lat: 56,
    lng: 14,
    region: 'N. Europe',
    continent: 'Europe',
    neighbours: [1, 2, 5],
  },
  {
    id: 1,
    name: 'Magadh',
    short: 'Mgdh',
    epithet: 'Mauryan empire',
    color: '#E2483C',
    accent: '#5A120E',
    biome: 'red-earth plains',
    power: POWERS[1],
    lat: 24,
    lng: 12,
    region: 'N. Africa',
    continent: 'Africa',
    neighbours: [0, 2, 3],
  },
  {
    id: 2,
    name: 'Kalinga',
    short: 'Klng',
    epithet: 'maritime kingdom',
    color: '#2EA8E0',
    accent: '#0B3D5C',
    biome: 'coast and harbour',
    power: POWERS[2],
    lat: -12,
    lng: -56,
    region: 'S. America',
    continent: 'South America',
    neighbours: [0, 1, 4],
  },
  {
    id: 3,
    name: 'Takshashila',
    short: 'Taks',
    epithet: 'ancient university',
    color: '#9B6BFF',
    accent: '#2E1A4D',
    biome: 'mountain cliffs',
    power: POWERS[3],
    lat: 44,
    lng: 92,
    region: 'Asia',
    continent: 'Asia',
    neighbours: [1, 4, 5],
  },
  {
    id: 4,
    name: 'Vijayanagar',
    short: 'Vijy',
    epithet: 'city of victory',
    color: '#4CC27A',
    accent: '#16422A',
    biome: 'boulders and gardens',
    power: POWERS[4],
    lat: -25,
    lng: 134,
    region: 'Oceania',
    continent: 'Australia',
    neighbours: [2, 3, 5],
  },
  {
    id: 5,
    name: 'Avanti',
    short: 'Avnt',
    epithet: 'city of Ujjain',
    // KINGDOM_UI §2 primary is #3A3F7A (indigo night); it is too dark on a black globe, so the
    // UI uses the brighter `glow` below for markers/arcs and keeps `color` for fills.
    color: '#3A3F7A',
    accent: '#C9C9D9',
    biome: 'night forest',
    power: POWERS[5],
    lat: 44,
    lng: -100,
    region: 'N. America',
    continent: 'North America',
    neighbours: [0, 3, 4],
  },
];

/** Colour to use for glowing things (arcs, markers, text) on a near-black background. */
export function kingdomGlow(id: number): string {
  return id === 5 ? '#7C83E8' : KINGDOMS[id].color;
}

/** Adjacency bitmask per territory, as stored in `GameConfig.adjacency`. */
export const ADJACENCY: number[] = KINGDOMS.map((k) => k.neighbours.reduce((m, n) => m | (1 << n), 0));

export function isAdjacent(a: number, b: number): boolean {
  return (ADJACENCY[a] & (1 << b)) !== 0;
}

export const KINGDOM_IDS = Array.from({ length: N_KINGDOMS }, (_, i) => i);
