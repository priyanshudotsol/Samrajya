'use client';

import { useEffect, useRef, type ComponentRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { easing } from 'maath';
import * as THREE from 'three';

import { isCinematic, useBattle, type BattlePhase } from '@/lib/arena/battleMachine';
import { cameraState, type CameraMode } from '@/lib/arena/cameraState';
import { GATE_Z } from '@/lib/arena/formations';

import { listener } from '@/lib/audio';

import { shake } from './skyState';
import { fx } from '@/lib/arena/fx';

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

/** Group framing needs this many moving warriors and this much idle time from the user. */
const GROUP_MIN_MOVING = 3;
const GROUP_IDLE_MS = 4000;

const fwd = new THREE.Vector3();
const want = new THREE.Vector3();

/**
 * The camera director (docs/KINGDOM_UI.md §11.4):
 *   orbit     clamped OrbitControls with a gentle auto-rotate (spectating)
 *   follow    chase camera on your warrior whenever it stands in this realm; right-drag turns it,
 *             the wheel zooms (lib/arena/controller.ts), and it stays yours through the bell
 *   group     frames the crowd when several warriors are on the move and you're not touching it
 *   cinematic battle keyframes, re-aimed at the real fighting
 * Modes blend with damping so cuts never snap.
 */
export function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const look = useRef(new THREE.Vector3(0, 0.8, 0));
  const lastInteract = useRef(0);
  const wasAuto = useRef(false);
  const offset = useRef(new THREE.Vector3());
  const followYaw = useRef(0);
  const prevMode = useRef<CameraMode>('orbit');
  cameraState.camera = camera;

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
    const d = Math.min(dt, 0.1);
    const nowMs = performance.now();
    // remove last frame's shake offset before anything reads the camera
    camera.position.sub(offset.current);
    offset.current.set(0, 0, 0);

    const mine = cameraState.mine;
    const group = cameraState.group;
    const fight = cameraState.fight;
    let mode: CameraMode = 'orbit';
    // your warrior in this realm keeps the camera, even through the bell
    if (mine.active) mode = 'follow';
    else if (isCinematic(phase)) mode = 'cinematic';
    else if (group.moving >= GROUP_MIN_MOVING && nowMs - lastInteract.current > GROUP_IDLE_MS) mode = 'group';
    cameraState.mode = mode;

    if (mode === 'cinematic') {
      c.enabled = false;
      c.autoRotate = false;
      const key = KEYS[phase]!;
      const t = state.clock.elapsedTime;
      const sway = phase === 'CLASH' ? Math.sin(t * 0.3) * 1.2 : 0;
      // re-aim at the real fight when the melee reports one
      const aim: [number, number, number] = fight.active && (phase === 'CLASH' || phase === 'ROLL') ? [fight.cx, fight.cy + 0.5, fight.cz] : key[1];
      const pull = fight.active && phase === 'CLASH' ? Math.min(3, fight.radius * 0.9) : 0;
      easing.damp3(camera.position, [key[0][0] + sway + (aim[0] - key[1][0]) * 0.6, key[0][1] + pull * 0.4, key[0][2] + (aim[2] - key[1][2]) * 0.6 + pull], 0.9, d);
      easing.damp3(look.current, aim, 0.7, d);
      camera.lookAt(look.current);
      wasAuto.current = true;
    } else if (mode === 'follow') {
      c.enabled = false;
      c.autoRotate = false;
      const f = cameraState.follow;
      if (prevMode.current !== 'follow') {
        // stand behind the warrior looking in towards the keep (out at the edge after a march),
        // or pick up from wherever the camera is when it is already near the middle
        f.yaw = Math.hypot(mine.x, mine.z) > 1.2 ? Math.atan2(mine.x, mine.z) : Math.atan2(camera.position.x - mine.x, camera.position.z - mine.z);
      }
      // a steady, player-controlled chase (it does not swing with the warrior's facing, so
      // clicks and WASD stay screen-relative). Outside the walls it drifts round behind the
      // warrior so the fort stays ahead instead of hiding it, unless the player just turned it.
      const r = Math.hypot(mine.x, mine.z);
      if (r > 2.9 && nowMs - f.turnedAt > 2500) {
        const wantYaw = Math.atan2(mine.x, mine.z);
        f.yaw += Math.atan2(Math.sin(wantYaw - f.yaw), Math.cos(wantYaw - f.yaw)) * Math.min(1, d * 0.9);
      }
      const h = Math.cos(f.pitch) * f.dist;
      want.set(mine.x + Math.sin(f.yaw) * h, mine.y + Math.sin(f.pitch) * f.dist + 0.3, mine.z + Math.cos(f.yaw) * h);
      easing.damp3(camera.position, want, 0.18, d);
      easing.damp3(look.current, [mine.x, mine.y + 0.45, mine.z], 0.12, d);
      camera.lookAt(look.current);
      wasAuto.current = true;
    } else if (mode === 'group') {
      c.enabled = false;
      c.autoRotate = false;
      const r = Math.max(2.2, group.radius);
      const dist = Math.min(20, Math.max(8, r * 2.4 + 4));
      // keep the current viewing direction, slide to frame the crowd
      fwd.copy(camera.position).sub(look.current);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1);
      fwd.normalize();
      want.set(group.cx + fwd.x * dist, group.cy + dist * 0.62, group.cz + fwd.z * dist);
      easing.damp3(camera.position, want, 1.1, d);
      easing.damp3(look.current, [group.cx, group.cy + 0.4, group.cz], 0.9, d);
      camera.lookAt(look.current);
      wasAuto.current = true;
    } else {
      if (wasAuto.current) {
        c.target.copy(look.current);
        wasAuto.current = false;
        lastInteract.current = nowMs;
        followYaw.current = Math.atan2(camera.position.x - look.current.x, camera.position.z - look.current.z) + Math.PI;
      }
      c.enabled = true;
      // ease the orbit target back to the keep
      easing.damp3(c.target, [0, 0.8, 0], 1.2, d);
      look.current.copy(c.target);
      if (!c.autoRotate && nowMs - lastInteract.current > 7000) c.autoRotate = true;
    }

    prevMode.current = mode;
    // yaw for camera-relative steering
    camera.getWorldDirection(fwd);
    cameraState.yaw = Math.atan2(fwd.x, fwd.z);
    // the ear sits at what the camera looks at (your warrior when following)
    listener.x = look.current.x;
    listener.z = look.current.z;
    listener.rx = Math.cos(cameraState.yaw);
    listener.rz = -Math.sin(cameraState.yaw);

    // camera shake (impacts)
    if (shake.value > 0.001) {
      const s = shake.value * 0.14;
      offset.current.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 0.6, (Math.random() - 0.5) * s);
      shake.value *= Math.exp(-d * 7);
    }
    // camera punch: a quick lunge towards the fight on heavy blows and kills, settling back
    const pk = (nowMs - fx.punch.at) / 380;
    if (pk >= 0 && pk < 1) {
      const env = fx.punch.amount * (1 - pk) * (1 - pk) * 0.7;
      fwd.copy(look.current).sub(camera.position).normalize();
      offset.current.addScaledVector(fwd, env);
    }
    camera.position.add(offset.current);
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
