'use client';

import { useEffect, useRef, type ComponentRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { easing } from 'maath';
import * as THREE from 'three';

import { isCinematic, useBattle, type BattlePhase } from '@/lib/arena/battleMachine';
import { GATE_Z } from '@/lib/arena/formations';

import { shake } from './skyState';

const DEG = Math.PI / 180;

/** Cinematic keyframes per phase: [camera position, look-at]. Kept inside the orbit clamps. */
const KEYS: Partial<Record<BattlePhase, [[number, number, number], [number, number, number]]>> = {
  CLASH: [
    [4.8, 4.6, GATE_Z + 8.2],
    [0, 0.7, GATE_Z + 0.8],
  ],
  ROLL: [
    [0, 3.8, GATE_Z + 8.4],
    [0, 2.2, GATE_Z],
  ],
  HELD: [
    [-5.5, 6.2, 10.5],
    [0, 0.6, 0],
  ],
  FALLEN: [
    [6.2, 6.6, 9.4],
    [0, 0.8, 0],
  ],
};

/** OrbitControls (clamped: polar 25–65°, distance 8–25, gentle auto-rotate) + cinematic override. */
export function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const look = useRef(new THREE.Vector3(0, 0.8, 0));
  const lastInteract = useRef(0);
  const wasCinematic = useRef(false);
  const offset = useRef(new THREE.Vector3());

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const onStart = () => {
      lastInteract.current = performance.now();
      c.autoRotate = false;
    };
    c.addEventListener('start', onStart);
    return () => c.removeEventListener('start', onStart);
  }, []);

  useFrame((state, dt) => {
    const c = controls.current;
    if (!c) return;
    const phase = useBattle.getState().phase;
    const cine = isCinematic(phase);
    const d = Math.min(dt, 0.1);
    // remove last frame's shake offset before anything reads the camera
    camera.position.sub(offset.current);
    offset.current.set(0, 0, 0);

    if (cine) {
      c.enabled = false;
      c.autoRotate = false;
      const key = KEYS[phase]!;
      const t = state.clock.elapsedTime;
      const sway = phase === 'CLASH' ? Math.sin(t * 0.3) * 1.2 : 0;
      easing.damp3(camera.position, [key[0][0] + sway, key[0][1], key[0][2]], 0.9, d);
      easing.damp3(look.current, key[1], 0.7, d);
      camera.lookAt(look.current);
      wasCinematic.current = true;
    } else {
      if (wasCinematic.current) {
        c.target.copy(look.current);
        wasCinematic.current = false;
        lastInteract.current = performance.now();
      }
      c.enabled = true;
      // ease the orbit target back to the keep
      easing.damp3(c.target, [0, 0.8, 0], 1.2, d);
      look.current.copy(c.target);
      if (!c.autoRotate && performance.now() - lastInteract.current > 7000) c.autoRotate = true;
    }

    // camera shake (projectile impacts)
    if (shake.value > 0.001) {
      const s = shake.value * 0.12;
      offset.current.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      camera.position.add(offset.current);
      shake.value *= Math.exp(-d * 6);
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minPolarAngle={25 * DEG}
      maxPolarAngle={65 * DEG}
      minDistance={8}
      maxDistance={25}
      autoRotate
      autoRotateSpeed={0.35}
      target={[0, 0.8, 0]}
      enableDamping
      dampingFactor={0.08}
    />
  );
}
