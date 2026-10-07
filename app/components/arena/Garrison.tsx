'use client';

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';

import { sparring, wallPoint, walls, type Target } from '@/lib/arena/formations';
import { WALL_RADIUS } from '@/lib/realm/layout';

import { wallTopY } from '../realm/Castle';
import { usePaint } from '../realm/paint';
import { Troops } from './Troops';

/**
 * The defenders at peace: one soldier per member at home (none if nobody joined). A higher defend
 * share puts more of them on the walls, where they walk patrols; the rest spar in pairs in the
 * courtyard. In battle the Melee takes over.
 */
export function Garrison({ count, defendShare, wallHeight }: { count: number; defendShare: number; wallHeight: number }) {
  const paint = usePaint();
  const top = wallTopY(wallHeight);
  const onWalls = count === 0 ? 0 : Math.max(1, Math.round(count * (0.25 + 0.6 * defendShare)));
  const targets = useMemo<Target[]>(() => {
    const out: Target[] = [];
    walls(onWalls, top, out);
    return sparring(count - onWalls, out);
  }, [count, onWalls, top]);

  // patrols: wall soldiers walk the wall walk, half clockwise and half anticlockwise
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    for (let i = 0; i < onWalls; i++) {
      const dir = i % 2 ? 1 : -1;
      const a = ((i + 0.5) / onWalls) * Math.PI * 2 + 0.11 + dir * t * 0.06;
      const [x, z] = wallPoint(a, WALL_RADIUS - 0.02);
      const tg = targets[i];
      tg.x = x;
      tg.z = z;
      tg.y = top;
      tg.face = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
      tg.act = 2;
    }
  });

  return <Troops targets={targets} material={paint.tabard} smooth={0.35} />;
}
