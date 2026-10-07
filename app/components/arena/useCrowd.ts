'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import { useWarriors } from '@/lib/arena/warriors';
import { useRealmUi } from '@/lib/realm/ui-store';

import { WarriorCrowd } from './WarriorCrowd';

/** A realistic warrior crowd once the assets load (null before, or in low-power mode). */
export function useCrowd(): WarriorCrowd | null {
  const tpl = useWarriors();
  const lowPower = useRealmUi((s) => s.lowPower);
  const crowd = useMemo(() => (tpl && !lowPower ? new WarriorCrowd(tpl) : null), [tpl, lowPower]);
  useEffect(() => () => crowd?.dispose(), [crowd]);
  return crowd;
}

const q = new THREE.Color();
/** Hex colour of a material, quantised so a colour fade doesn't mint a tint per frame. */
export function materialHex(m: THREE.Material): string {
  const c = (m as THREE.MeshStandardMaterial).color;
  if (!c) return '#ffffff';
  q.setRGB(Math.round(c.r * 8) / 8, Math.round(c.g * 8) / 8, Math.round(c.b * 8) / 8);
  return `#${q.getHexString()}`;
}
