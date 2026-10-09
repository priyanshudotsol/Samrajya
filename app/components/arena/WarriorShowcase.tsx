'use client';

import { useMemo, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { fx, markSwing, HIT_SHOW_MS, SWING_SHOW_MS } from '@/lib/arena/fx';
import { useWarriors } from '@/lib/arena/warriors';
import { playSfx, setMuted } from '@/lib/audio';
import { GEARS } from '@/lib/game/units';

import { BattleParticles, vfx } from './Particles';
import type { WarriorState } from './WarriorCrowd';
import { WarriorCrowd } from './WarriorCrowd';

const COLORS = ['#c9a227', '#c0392b', '#2e86c1', '#7d3c98', '#1e8449', '#5d6d7e'];

/** One attacker per gear facing a shield-bearer; they trade blows on a loop. */
function Duels({ slow }: { slow: number }) {
  const tpl = useWarriors();
  const crowd = useMemo(() => (tpl ? new WarriorCrowd(tpl) : null), [tpl]);
  const clock = useRef(0);
  const next = useRef(0.4);
  const round = useRef(0);
  const dead = useRef<number | null>(null);
  useFrame((_, dt) => {
    if (!crowd) return;
    const d = Math.min(dt, 0.05) * slow;
    clock.current += d;
    const t = clock.current;
    const now = performance.now();
    if (t > next.current) {
      next.current = t + 1.4;
      round.current++;
      for (let g = 0; g < 6; g++) {
        const x = (g - 2.5) * 1.3;
        markSwing(`a${g}`);
        const blocked = round.current % 3 === 0;
        setTimeout(() => {
          fx.hitAt.set(`d${g}`, performance.now());
          fx.blocked.set(`d${g}`, blocked);
          if (blocked) {
            vfx.burst('sparks', x, 0.35, 0.35, { n: 22, dz: -1 });
            vfx.burst('flash', x, 0.35, 0.35, { scale: 0.8 });
          } else {
            vfx.burst('blood', x, 0.3, 0.6, { n: 12, dz: 1 });
            vfx.burst('sparks', x, 0.35, 0.6, { n: 6, scale: 0.7 });
            vfx.burst('flash', x, 0.3, 0.6, { scale: 0.6 });
          }
          if (g === 0) playSfx(blocked ? 'clash' : 'plate');
        }, 190 / slow);
        if (g === 0) playSfx('swing');
      }
      if (round.current % 4 === 0) {
        dead.current = round.current;
        vfx.burst('dust', 3.25, 0.05, 0.6, { n: 10 });
      }
      if (round.current % 4 === 1) dead.current = null;
    }
    crowd.begin();
    for (let g = 0; g < 6; g++) {
      const x = (g - 2.5) * 1.3;
      const sa = now - (fx.swingAt.get(`a${g}`) ?? -1e9);
      const ha = now - (fx.hitAt.get(`d${g}`) ?? -1e9);
      const aState: WarriorState = sa < SWING_SHOW_MS / slow ? 'attack' : 'idle';
      let dState: WarriorState = ha < HIT_SHOW_MS / slow ? 'hit' : round.current % 3 === 2 ? 'block' : 'idle';
      if (g === 5 && dead.current !== null) dState = 'dead';
      crowd.set(g * 2, x, 0, 0, 0, aState, COLORS[g], 1, 0, g, fx.swingN.get(`a${g}`) ?? 0);
      crowd.set(g * 2 + 1, x, 0, 0.62, Math.PI, dState, '#888888', 1, 0, 3, 0, fx.blocked.get(`d${g}`) ?? false);
    }
    crowd.end(d);
  });
  return crowd ? <primitive object={crowd.group} /> : null;
}

export default function WarriorShowcase() {
  const [slow, setSlow] = useState(1);
  // ?g=0..5 frames one pair up close
  const focus = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('g');
  const fx0 = focus === null ? 0 : (Number(focus) - 2.5) * 1.3;
  const cam: [number, number, number] = focus === null ? [5.2, 2.6, 4.4] : [fx0 + 1.6, 1.0, 1.2];
  return (
    <>
      <Canvas shadows camera={{ position: cam, fov: 42 }}>
        <hemisphereLight args={['#ffffff', '#6b5a3a', 1.1]} />
        <directionalLight position={[3, 6, 4]} intensity={2.2} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[6, 48]} />
          <meshStandardMaterial color="#9c8a63" />
        </mesh>
        <Duels slow={slow} />
        <BattleParticles />
        <OrbitControls target={[fx0, 0.3, 0.3]} />
      </Canvas>
      <div className="absolute left-3 top-3 flex flex-col gap-1 bg-white/85 p-2 text-xs">
        <div className="font-semibold">Attackers, left → right: {GEARS.map((g) => g.name).join(' · ')}</div>
        <div>Every 3rd blow is blocked (sparks), the others wound (blood); the far-right defender falls every 4th round.</div>
        <div className="flex gap-2">
          <button className="border px-2" onClick={() => setMuted(false)}>Sound on</button>
          <button className="border px-2" onClick={() => setSlow(slow === 1 ? 0.25 : 1)}>{slow === 1 ? 'Slow motion' : 'Normal speed'}</button>
        </div>
      </div>
    </>
  );
}
