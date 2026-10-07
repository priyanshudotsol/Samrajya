/**
 * Per-kingdom architecture. Each territory keeps the style of the kingdom that founded it (like
 * its biome), so every realm reads as a different place; only roofs and banners follow the owner.
 *
 *   0 Hastinapur   red-sandstone Kuru fort: onion domes, chhatri towers, kangura battlements
 *   1 Magadh       Mauryan timber city: palisade walls, pillared hall, Ashokan lion pillar
 *   2 Kalinga      Konark sun temple: curved deula tower, stepped hall, turning chariot wheels
 *   3 Takshashila  mountain monastery: white stupa, pagoda towers, prayer flags
 *   4 Vijayanagar  Hampi granite: Dravidian gopuram, pillared mandapa towers
 *   5 Avanti       Ujjain night temple: dark shikhara spire cluster, lamp-lit spires
 */
import * as THREE from 'three';

import { triplanarMaterial, type TexSetName } from './textures';

export type KeepKind = 'fort' | 'hall' | 'deula' | 'stupa' | 'gopuram' | 'shikhara';
export type TowerKind = 'chhatri' | 'watchtower' | 'deula' | 'pagoda' | 'mandapa' | 'spire';
export type MerlonKind = 'kangura' | 'stakes' | 'block' | 'step' | 'round' | 'spike';

export interface RealmStyle {
  keep: KeepKind;
  tower: TowerKind;
  merlon: MerlonKind;
  /** Wall / keep body. */
  wall: string;
  /** Battlements, plinths. */
  wallDark: string;
  /** Domes, trim, carved bands. */
  trim: string;
  /** Tower shaft radius. */
  towerR: number;
  /** Corner tower shafts are square instead of round. */
  squareTowers: boolean;
}

export const STYLES: RealmStyle[] = [
  { keep: 'fort', tower: 'chhatri', merlon: 'kangura', wall: '#b85a3c', wallDark: '#8a3f28', trim: '#f4ecdc', towerR: 0.28, squareTowers: false },
  { keep: 'hall', tower: 'watchtower', merlon: 'stakes', wall: '#8a5a32', wallDark: '#5e3a1e', trim: '#d9b26a', towerR: 0.24, squareTowers: true },
  { keep: 'deula', tower: 'deula', merlon: 'block', wall: '#9a8270', wallDark: '#6e5a4c', trim: '#c9b49a', towerR: 0.27, squareTowers: true },
  { keep: 'stupa', tower: 'pagoda', merlon: 'step', wall: '#b9b4bf', wallDark: '#7e7a88', trim: '#ffffff', towerR: 0.25, squareTowers: true },
  { keep: 'gopuram', tower: 'mandapa', merlon: 'round', wall: '#c9a27a', wallDark: '#9a7652', trim: '#e8d6b8', towerR: 0.3, squareTowers: true },
  { keep: 'shikhara', tower: 'spire', merlon: 'spike', wall: '#4f4e66', wallDark: '#33324a', trim: '#8f8fb0', towerR: 0.22, squareTowers: false },
];

export function styleOf(territory: number): RealmStyle {
  return STYLES[territory % STYLES.length];
}

export interface StyleMats {
  wall: THREE.MeshStandardMaterial;
  wallDark: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
}

const cache = new Map<number, StyleMats>();

/**
 * Real masonry per kingdom (Poly Haven sets, tinted by the palette above):
 * red sandstone (Hastinapur), timber palisade (Magadh), laterite rubble (Kalinga),
 * pale granite (Takshashila), tan granite (Vijayanagar), dark basalt (Avanti).
 */
const TEXTURE: { wall: TexSetName; trim: TexSetName; scale: number; detail: number }[] = [
  { wall: 'redstone', trim: 'marble', scale: 1.2, detail: 0.9 },
  { wall: 'wood', trim: 'plaster', scale: 2.2, detail: 1 },
  { wall: 'stone', trim: 'plaster', scale: 1.4, detail: 0.95 },
  { wall: 'stone', trim: 'marble', scale: 1.3, detail: 0.8 },
  { wall: 'stone', trim: 'plaster', scale: 1.2, detail: 0.9 },
  { wall: 'stone', trim: 'stone', scale: 1.4, detail: 0.95 },
];

/** Cached materials for a style (shared across realm visits). */
export function styleMats(territory: number): StyleMats {
  const i = territory % STYLES.length;
  let m = cache.get(i);
  if (!m) {
    const s = STYLES[i];
    const t = TEXTURE[i];
    m = {
      wall: triplanarMaterial(t.wall, { color: s.wall, roughness: 0.92, flatShading: true }, { scale: t.scale, detail: t.detail }),
      wallDark: triplanarMaterial(t.wall, { color: s.wallDark, roughness: 0.95, flatShading: true }, { scale: t.scale, detail: t.detail }),
      trim: triplanarMaterial(t.trim, { color: s.trim, roughness: 0.5 }, { scale: 1.4, detail: 0.6, normal: 0.6 }),
    };
    cache.set(i, m);
  }
  return m;
}
