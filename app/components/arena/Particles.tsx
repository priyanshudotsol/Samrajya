'use client';

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Battle VFX particles: two pooled point clouds (additive for sparks / embers / flashes, normal
 * blending for dust / blood / wood chips), simulated on the CPU (a few hundred particles).
 * Anything can call `vfx.burst(...)`; the mounted <BattleParticles/> drains the queue.
 */
export type BurstKind = 'sparks' | 'blood' | 'dust' | 'debris' | 'embers' | 'flash' | 'smoke';

interface Burst {
  kind: BurstKind;
  x: number;
  y: number;
  z: number;
  n: number;
  /** Direction bias (unit-ish xz), e.g. the blow's direction. */
  dx: number;
  dz: number;
  scale: number;
}

const queue: Burst[] = [];

export const vfx = {
  burst(kind: BurstKind, x: number, y: number, z: number, opts: { n?: number; dx?: number; dz?: number; scale?: number } = {}) {
    if (queue.length > 200) return;
    queue.push({ kind, x, y, z, n: opts.n ?? DEFAULT_N[kind], dx: opts.dx ?? 0, dz: opts.dz ?? 0, scale: opts.scale ?? 1 });
  },
};

const DEFAULT_N: Record<BurstKind, number> = { sparks: 16, blood: 10, dust: 8, debris: 10, embers: 14, flash: 1, smoke: 4 };

const ADD_MAX = 700;
const NORM_MAX = 700;

const VERT = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  varying vec4 vTint;
  uniform float uScale;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying vec4 vTint;
  uniform float uSoft;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = mix(1.0 - step(0.85, d), 1.0 - smoothstep(0.0, 1.0, d), uSoft);
    gl_FragColor = vec4(vTint.rgb, vTint.a * a);
  }
`;

interface Pool {
  geo: THREE.BufferGeometry;
  pos: Float32Array;
  tint: Float32Array;
  size: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  base: Float32Array; // base size
  grow: Float32Array; // size growth per second
  grav: Float32Array;
  drag: Float32Array;
  rgb: Float32Array;
  next: number;
  max: number;
}

function makePool(max: number): Pool {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const tint = new Float32Array(max * 4);
  const size = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('tint', new THREE.BufferAttribute(tint, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return {
    geo,
    pos,
    tint,
    size,
    vel: new Float32Array(max * 3),
    life: new Float32Array(max),
    maxLife: new Float32Array(max),
    base: new Float32Array(max),
    grow: new Float32Array(max),
    grav: new Float32Array(max),
    drag: new Float32Array(max),
    rgb: new Float32Array(max * 3),
    next: 0,
    max,
  };
}

const col = new THREE.Color();
const r = (a: number, b: number) => a + Math.random() * (b - a);

function spawn(p: Pool, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, grav: number, drag: number, color: string) {
  const i = p.next;
  p.next = (p.next + 1) % p.max;
  p.pos[i * 3] = x;
  p.pos[i * 3 + 1] = y;
  p.pos[i * 3 + 2] = z;
  p.vel[i * 3] = vx;
  p.vel[i * 3 + 1] = vy;
  p.vel[i * 3 + 2] = vz;
  p.life[i] = life;
  p.maxLife[i] = life;
  p.base[i] = size;
  p.grow[i] = grow;
  p.grav[i] = grav;
  p.drag[i] = drag;
  col.set(color);
  p.rgb[i * 3] = col.r;
  p.rgb[i * 3 + 1] = col.g;
  p.rgb[i * 3 + 2] = col.b;
}

function emit(add: Pool, norm: Pool, b: Burst) {
  const s = b.scale;
  switch (b.kind) {
    case 'sparks':
      for (let k = 0; k < b.n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = r(1.2, 3.2) * s;
        spawn(add, b.x, b.y, b.z, Math.cos(a) * sp + b.dx * 1.5, r(0.8, 2.6) * s, Math.sin(a) * sp + b.dz * 1.5, r(0.18, 0.42), r(0.035, 0.06) * s, -0.04, -7, 2.5, Math.random() < 0.5 ? '#fff4c2' : '#ffb347');
      }
      break;
    case 'flash':
      spawn(add, b.x, b.y, b.z, 0, 0, 0, 0.12, 0.35 * s, 2.2 * s, 0, 0, '#fff1d0');
      break;
    case 'embers':
      for (let k = 0; k < b.n; k++) {
        spawn(add, b.x + r(-0.25, 0.25) * s, b.y, b.z + r(-0.25, 0.25) * s, r(-0.3, 0.3), r(0.4, 1.2), r(-0.3, 0.3), r(0.8, 1.8), r(0.025, 0.045) * s, -0.01, 0.15, 0.6, Math.random() < 0.6 ? '#ff7a1a' : '#ffd166');
      }
      break;
    case 'blood':
      for (let k = 0; k < b.n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = r(0.4, 1.4) * s;
        spawn(norm, b.x, b.y, b.z, Math.cos(a) * sp * 0.6 + b.dx * 1.4, r(0.4, 1.6) * s, Math.sin(a) * sp * 0.6 + b.dz * 1.4, r(0.3, 0.6), r(0.03, 0.055) * s, 0.02, -6, 1.5, Math.random() < 0.6 ? '#8f1414' : '#5a0b0b');
      }
      break;
    case 'dust':
      for (let k = 0; k < b.n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = r(0.15, 0.6) * s;
        spawn(norm, b.x + Math.cos(a) * 0.08, b.y, b.z + Math.sin(a) * 0.08, Math.cos(a) * sp, r(0.1, 0.45), Math.sin(a) * sp, r(0.7, 1.3), r(0.09, 0.16) * s, 0.25 * s, 0.05, 2.2, Math.random() < 0.5 ? '#b49a74' : '#8c7558');
      }
      break;
    case 'smoke':
      for (let k = 0; k < b.n; k++) {
        spawn(norm, b.x + r(-0.15, 0.15), b.y, b.z + r(-0.15, 0.15), r(-0.08, 0.08), r(0.35, 0.6), r(-0.08, 0.08), r(1.8, 3.0), r(0.14, 0.22) * s, 0.35 * s, -0.02, 0.4, Math.random() < 0.5 ? '#4a4440' : '#2f2b29');
      }
      break;
    case 'debris':
      for (let k = 0; k < b.n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = r(0.6, 1.8) * s;
        spawn(norm, b.x, b.y, b.z, Math.cos(a) * sp + b.dx, r(1.0, 2.4) * s, Math.sin(a) * sp + b.dz, r(0.5, 0.9), r(0.035, 0.06) * s, 0, -8, 0.6, Math.random() < 0.5 ? '#6b4524' : '#3d2614');
      }
      break;
  }
}

function step(p: Pool, d: number, additive: boolean) {
  for (let i = 0; i < p.max; i++) {
    if (p.life[i] <= 0) {
      p.tint[i * 4 + 3] = 0;
      p.size[i] = 0;
      continue;
    }
    p.life[i] -= d;
    const k = Math.max(0, p.life[i] / p.maxLife[i]); // 1 → 0
    const drag = Math.max(0, 1 - p.drag[i] * d);
    p.vel[i * 3] *= drag;
    p.vel[i * 3 + 2] *= drag;
    p.vel[i * 3 + 1] = p.vel[i * 3 + 1] * drag + p.grav[i] * d;
    p.pos[i * 3] += p.vel[i * 3] * d;
    p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * d;
    p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * d;
    p.size[i] = Math.max(0, p.base[i] + p.grow[i] * (p.maxLife[i] - p.life[i]));
    p.tint[i * 4] = p.rgb[i * 3];
    p.tint[i * 4 + 1] = p.rgb[i * 3 + 1];
    p.tint[i * 4 + 2] = p.rgb[i * 3 + 2];
    p.tint[i * 4 + 3] = additive ? k : Math.min(1, k * 1.6) * 0.85;
  }
  p.geo.attributes.position.needsUpdate = true;
  p.geo.attributes.tint.needsUpdate = true;
  p.geo.attributes.size.needsUpdate = true;
}

export function BattleParticles() {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const { add, norm, addMat, normMat } = useMemo(() => {
    const mk = (blending: THREE.Blending, soft: number) =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { uScale: { value: 400 }, uSoft: { value: soft } },
        transparent: true,
        depthWrite: false,
        blending,
      });
    return { add: makePool(ADD_MAX), norm: makePool(NORM_MAX), addMat: mk(THREE.AdditiveBlending, 1), normMat: mk(THREE.NormalBlending, 0.6) };
  }, []);

  useEffect(() => {
    // point size in pixels per world unit at distance 1
    const s = (size.height * dpr) / (2 * Math.tan((35 * Math.PI) / 360));
    addMat.uniforms.uScale.value = s;
    normMat.uniforms.uScale.value = s;
  }, [size, dpr, addMat, normMat]);

  useEffect(
    () => () => {
      add.geo.dispose();
      norm.geo.dispose();
      addMat.dispose();
      normMat.dispose();
    },
    [add, norm, addMat, normMat],
  );

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    while (queue.length) emit(add, norm, queue.shift()!);
    step(add, d, true);
    step(norm, d, false);
  });

  return (
    <group>
      <points geometry={norm.geo} material={normMat} frustumCulled={false} renderOrder={5} />
      <points geometry={add.geo} material={addMat} frustumCulled={false} renderOrder={6} />
    </group>
  );
}
