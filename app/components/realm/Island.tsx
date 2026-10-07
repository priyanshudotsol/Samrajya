'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { broadleafGeometry, leafTexture, pineGeometry, trunkGeometry } from '@/lib/realm/foliage';
import { mulberry32, type RealmLayout } from '@/lib/realm/layout';
import {
  boulderGeometry,
  buildTerrain,
  buildWater,
  coastRadius,
  realmTerrainSpec,
  terrainHeight,
  type TerrainSpec,
} from '@/lib/realm/terrain';
import { texSet, triplanarMaterial, useRealmTextures } from '@/lib/realm/textures';

const dummy = new THREE.Object3D();

// ------------------------------------------------------------------ shared materials

const ON = () => {
  const a = texSet('grass').on;
  const b = texSet('dirt').on;
  const c = texSet('sand').on;
  const d = texSet('cliff').on;
  return { get value() { return a.value * b.value * c.value * d.value; } };
};

/**
 * Splat terrain material: grass / dirt / sand / rock blended by the `splat` vertex attribute
 * (height-aware, slope adds rock), tinted by vertex colour (biome palette), world-planar UVs,
 * two-scale grass sampling to hide tiling.
 */
export function makeTerrainMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const G = texSet('grass');
  const D = texSet('dirt');
  const S = texSet('sand');
  const R = texSet('cliff');
  const uniforms = {
    tG: { value: G.map },
    tD: { value: D.map },
    tS: { value: S.map },
    tR: { value: R.map },
    nG: { value: G.normal },
    nD: { value: D.normal },
    nS: { value: S.normal },
    nR: { value: R.normal },
    aG: { value: G.avg },
    aD: { value: D.avg },
    aS: { value: S.avg },
    aR: { value: R.avg },
    uTerrOn: ON(),
    uDetail: { value: 0.9 },
  };
  m.userData.terrain = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 splat;
        varying vec4 vSplat;
        varying vec3 vTPos;
        varying vec3 vTN;`,
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
        vTN = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vSplat = splat;
        vTPos = (modelMatrix * vec4(transformed, 1.0)).xyz - modelMatrix[3].xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tG, tD, tS, tR, nG, nD, nS, nR;
        uniform vec3 aG, aD, aS, aR;
        uniform float uTerrOn, uDetail;
        varying vec4 vSplat;
        varying vec3 vTPos;
        varying vec3 vTN;
        float tLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 tuv = vec2(vTPos.x, -vTPos.z);
        vec2 uvG = tuv * 1.3, uvG2 = tuv * 0.37 + 0.37, uvD = tuv * 0.7, uvS = tuv * 0.6, uvR = tuv * 0.42;
        vec3 cG = mix(texture2D(tG, uvG).rgb, texture2D(tG, uvG2).rgb, 0.3) / max(aG, vec3(0.02));
        vec3 cD = texture2D(tD, uvD).rgb / max(aD, vec3(0.02));
        vec3 cS = texture2D(tS, uvS).rgb / max(aS, vec3(0.02));
        // rock: triplanar-lite (top + the dominant side) so slopes don't smear
        vec3 tn0 = normalize(vTN);
        float side = smoothstep(0.55, 0.85, 1.0 - tn0.y);
        vec2 uvRs = abs(tn0.x) > abs(tn0.z) ? vTPos.zy * 0.42 : vTPos.xy * 0.42;
        vec3 cR = mix(texture2D(tR, uvR).rgb, texture2D(tR, uvRs).rgb, side) / max(aR, vec3(0.02));
        vec4 tw = vSplat;
        tw.w += smoothstep(0.3, 0.6, 1.0 - tn0.y) * 1.5;
        vec4 th = vec4(tLum(cG), tLum(cD), tLum(cS), tLum(cR));
        tw = tw * (th * 0.7 + 0.3);
        tw = pow(max(tw, vec4(0.0)), vec4(2.5));
        tw /= max(dot(tw, vec4(1.0)), 1e-4);
        vec3 tDet = cG * tw.x + cD * tw.y + cS * tw.z + cR * tw.w;
        // macro variation: broad light/dark patches so the ground reads at a distance
        float macro = tLum(texture2D(tD, tuv * 0.06 + 0.21).rgb / max(aD, vec3(0.02))) * 0.6
                    + tLum(texture2D(tG, tuv * 0.11 - 0.4).rgb / max(aG, vec3(0.02))) * 0.4;
        tDet *= mix(1.0, clamp(macro, 0.55, 1.5), 0.55);
        // rock keeps more of its own colour (strata), the rest follows the biome tint
        diffuseColor.rgb *= mix(vec3(1.0), tDet, uDetail * uTerrOn);
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = dot(tw, vec4(0.97, 0.93, 0.9, 0.82));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 gw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          vec3 tnm = (texture2D(nG, uvG).xyz * 2.0 - 1.0) * tw.x * 1.4
                   + (texture2D(nD, uvD).xyz * 2.0 - 1.0) * tw.y
                   + (texture2D(nS, uvS).xyz * 2.0 - 1.0) * tw.z
                   + (texture2D(nR, uvR).xyz * 2.0 - 1.0) * tw.w;
          vec3 wn = normalize(gw + vec3(tnm.x, 0.0, -tnm.y) * 1.1 * uTerrOn);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'samrajya-terrain-v1';
  return m;
}

const cliffMats = new Map<string, THREE.MeshStandardMaterial>();
/** Craggy cliff rock (triplanar strata), per biome colour. */
export function cliffMaterial(color: string): THREE.MeshStandardMaterial {
  let m = cliffMats.get(color);
  if (!m) {
    // cliff colours in BIOMES are dark; lift them so the strata read
    const c = new THREE.Color(color).lerp(new THREE.Color('#b9a58a'), 0.35);
    m = triplanarMaterial('cliff', { color: c, roughness: 0.92 }, { scale: 0.42, detail: 1, normal: 1.3 });
    cliffMats.set(color, m);
  }
  return m;
}

/**
 * Animated water: ripple normals (travelling waves), shallow→deep colour and alpha from the
 * per-vertex `depth`, a moving foam line at the shore, PBR reflection of the HDRI sky.
 */
export function makeWaterMaterial(color: string): THREE.MeshStandardMaterial {
  const deep = new THREE.Color(color).multiplyScalar(0.32);
  const shallow = new THREE.Color(color).lerp(new THREE.Color('#8fc9b4'), 0.35).multiplyScalar(0.85);
  const m = new THREE.MeshStandardMaterial({
    color: deep,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    envMapIntensity: 1.8,
    depthWrite: false,
  });
  const time = { value: 0 };
  m.userData.time = time;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWTime = time;
    shader.uniforms.uShallow = { value: shallow };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float depth;\nvarying float vDepth;\nvarying vec3 vWPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vDepth = depth;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWTime;
        uniform vec3 uShallow;
        varying float vDepth;
        varying vec3 vWPos;
        float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float wNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float wHeight(vec2 p) {
          float t = uWTime;
          return wNoise(p * 5.0 + vec2(t * 0.35, t * 0.22)) * 0.5
               + wNoise(p * 11.0 - vec2(t * 0.5, -t * 0.4)) * 0.3
               + wNoise(p * 23.0 + vec2(-t * 0.8, t * 0.7)) * 0.2;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wd = max(vDepth, 0.0);
        float deepK = smoothstep(0.0, 0.11, wd);
        diffuseColor.rgb = mix(uShallow, diffuseColor.rgb, deepK);
        float foamN = sin(vWPos.x * 23.0 + uWTime * 1.7) * sin(vWPos.z * 19.0 - uWTime * 1.3);
        float foam = (1.0 - smoothstep(0.0, 0.03 + 0.012 * foamN, wd)) * step(0.0005, vDepth + 0.004);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.95), foam * 0.75);
        diffuseColor.a = clamp(mix(0.45, 0.93, deepK) + foam * 0.4, 0.0, 1.0) * smoothstep(-0.004, 0.006, vDepth);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 p = vWPos.xz;
          float e = 0.01;
          float h0 = wHeight(p);
          vec2 g = vec2(wHeight(p + vec2(e, 0.0)) - h0, wHeight(p + vec2(0.0, e)) - h0) / e * 0.05;
          vec3 wn = normalize(vec3(-g.x, 1.0, -g.y));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'samrajya-water-v3';
  return m;
}

const BOULDER_GEO = boulderGeometry(9);
const HANGING_GEO = boulderGeometry(23, 2, 0.3);
let broadGeo: THREE.BufferGeometry | null = null;
let pineGeo: THREE.BufferGeometry | null = null;
const TRUNK_BROAD = trunkGeometry(false);
const TRUNK_PINE = trunkGeometry(true);
const BARK = triplanarMaterial('wood', { color: '#4a3526', roughness: 0.95 }, { scale: 6, detail: 0.8 });

function leafMaterial(color: string, night: boolean): THREE.MeshStandardMaterial {
  const c = new THREE.Color(color).multiplyScalar(night ? 0.9 : 1.15);
  return new THREE.MeshStandardMaterial({
    color: c,
    map: leafTexture(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0,
  });
}

// ------------------------------------------------------------------ trees + rocks

function Trees({ layout, spec, ash }: { layout: RealmLayout; spec: TerrainSpec; ash: boolean }) {
  const pine = layout.biome.name.includes('mountain');
  const night = layout.biome.name.includes('night');
  const canopy = useMemo(() => {
    if (pine) return (pineGeo ??= pineGeometry());
    return (broadGeo ??= broadleafGeometry());
  }, [pine]);
  const leaves = useMemo(() => leafMaterial(layout.biome.foliage, night), [layout, night]);
  useEffect(() => () => leaves.dispose(), [leaves]);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const n = layout.trees.length;

  useLayoutEffect(() => {
    const rand = mulberry32(layout.seed + 101);
    const c = new THREE.Color();
    layout.trees.forEach((t, i) => {
      const y = terrainHeight(spec, t.x, t.z) - 0.02;
      const s = t.s * (pine ? 0.85 : 0.75);
      dummy.position.set(t.x, y, t.z);
      dummy.rotation.set((rand() - 0.5) * 0.08, rand() * Math.PI * 2, (rand() - 0.5) * 0.08);
      dummy.scale.set(s * (0.9 + rand() * 0.25), s * (0.85 + rand() * 0.35), s * (0.9 + rand() * 0.25));
      dummy.updateMatrix();
      canopyRef.current?.setMatrixAt(i, dummy.matrix);
      trunkRef.current?.setMatrixAt(i, dummy.matrix);
      c.setHSL(0, 0, 0.82 + rand() * 0.3);
      if (ash) c.setRGB(0.25, 0.22, 0.2);
      canopyRef.current?.setColorAt(i, c);
    });
    if (canopyRef.current) {
      canopyRef.current.instanceMatrix.needsUpdate = true;
      if (canopyRef.current.instanceColor) canopyRef.current.instanceColor.needsUpdate = true;
      canopyRef.current.computeBoundingSphere();
    }
    if (trunkRef.current) {
      trunkRef.current.instanceMatrix.needsUpdate = true;
      trunkRef.current.computeBoundingSphere();
    }
  }, [layout, spec, pine, ash]);

  if (n === 0) return null;
  return (
    <group>
      <instancedMesh ref={canopyRef} args={[canopy, leaves, n]} castShadow receiveShadow />
      <instancedMesh ref={trunkRef} args={[pine ? TRUNK_PINE : TRUNK_BROAD, BARK, n]} castShadow />
    </group>
  );
}

/** Low shrubs scattered over open grass outside the walls (same leaf cards, no trunk). */
function Bushes({ layout, spec, ash }: { layout: RealmLayout; spec: TerrainSpec; ash: boolean }) {
  const night = layout.biome.name.includes('night');
  const leaves = useMemo(() => {
    const m = leafMaterial(new THREE.Color(layout.biome.foliage).lerp(new THREE.Color(layout.biome.ground), 0.35).getStyle(), night);
    return m;
  }, [layout, night]);
  useEffect(() => () => leaves.dispose(), [leaves]);
  const geo = useMemo(() => (broadGeo ??= broadleafGeometry()), []);
  const items = useMemo(() => {
    const rand = mulberry32(layout.seed + 404);
    const out: { x: number; z: number; s: number; r: number }[] = [];
    const ok = new Set(['ground', 'forest', 'garden', 'ledge']);
    for (let tries = 0; tries < 900 && out.length < 70; tries++) {
      const a = rand() * Math.PI * 2;
      const r = 3.3 + Math.sqrt(rand()) * 3.4;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (r > coastRadius(spec, a) - 0.35) continue;
      if (Math.abs(x) < 1.9 && z > 1.4) continue; // gate road + muster ground
      let best = spec.samples[0];
      let bd = Infinity;
      for (const sm of spec.samples) {
        const d = (sm.x - x) ** 2 + (sm.z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = sm;
        }
      }
      if (!ok.has(best.kind)) continue;
      if (layout.housePlots.some((h) => (h.x - x) ** 2 + (h.z - z) ** 2 < 0.12)) continue;
      if (layout.landmarkPlots.some((h) => (h.x - x) ** 2 + (h.z - z) ** 2 < 0.5)) continue;
      out.push({ x, z, s: 0.22 + rand() * 0.18, r: rand() * Math.PI * 2 });
    }
    return out;
  }, [layout, spec]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const c = new THREE.Color();
    const rand = mulberry32(layout.seed + 405);
    items.forEach((b, i) => {
      dummy.position.set(b.x, terrainHeight(spec, b.x, b.z) - b.s * 0.42, b.z);
      dummy.rotation.set(0, b.r, 0);
      dummy.scale.set(b.s * 1.3, b.s, b.s * 1.3);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
      c.setHSL(0, 0, 0.75 + rand() * 0.35);
      if (ash) c.setRGB(0.22, 0.2, 0.18);
      ref.current?.setColorAt(i, c);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [items, spec, layout, ash]);
  if (items.length === 0) return null;
  return <instancedMesh ref={ref} args={[geo, leaves, items.length]} castShadow receiveShadow raycast={() => null} />;
}

function Rocks({ layout, spec, mat }: { layout: RealmLayout; spec: TerrainSpec; mat: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const rand = mulberry32(layout.seed + 202);
    layout.rocks.forEach((r, i) => {
      const y = terrainHeight(spec, r.x, r.z);
      dummy.position.set(r.x, y + r.s * 0.12, r.z);
      dummy.scale.set(r.s * (0.8 + rand() * 0.5), r.s * (0.5 + rand() * 0.35), r.s * (0.8 + rand() * 0.5));
      dummy.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI * 2, (rand() - 0.5) * 0.4);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [layout, spec]);
  if (layout.rocks.length === 0) return null;
  return <instancedMesh ref={ref} args={[BOULDER_GEO, mat, layout.rocks.length]} castShadow receiveShadow />;
}

// ------------------------------------------------------------------ island

/** Weathered boulders along the coast so the island edge isn't a clean cut. */
export function RimRocks({ spec, mat, count = 40 }: { spec: TerrainSpec; mat: THREE.Material; count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const rand = mulberry32(spec.seed + 303);
    const out: { x: number; y: number; z: number; s: number; r: number }[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.08;
      if (spec.gateRoad && Math.abs(((a - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.16) continue;
      if (rand() < 0.35) continue;
      const R = coastRadius(spec, a) - 0.05 - rand() * 0.18;
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;
      const s = (0.08 + rand() * 0.16) * (spec.radius / 6.85);
      out.push({ x, z, y: terrainHeight(spec, x, z) - s * 0.15, s, r: rand() * 6 });
    }
    return out;
  }, [spec, count]);
  useLayoutEffect(() => {
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(0, it.r * 2, 0);
      dummy.scale.set(it.s * 1.4, it.s * 0.8, it.s);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [items]);
  return <instancedMesh ref={ref} args={[BOULDER_GEO, mat, items.length]} castShadow receiveShadow raycast={() => null} />;
}

/** Hanging crags under the floating island. */
function Hanging({ seed, mat, radius }: { seed: number; mat: THREE.Material; radius: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const rand = mulberry32(seed + 13);
    return Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2 + rand();
      const d = radius * (0.35 + rand() * 0.3);
      return { x: Math.cos(a) * d, y: -2.6 - rand() * 2.2, z: Math.sin(a) * d, s: 0.5 + rand() * 0.6, r: rand() * 6 };
    });
  }, [seed, radius]);
  useLayoutEffect(() => {
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(Math.PI, it.r, 0);
      dummy.scale.set(it.s, it.s * 1.8, it.s);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [items]);
  return <instancedMesh ref={ref} args={[HANGING_GEO, mat, items.length]} castShadow raycast={() => null} />;
}

/**
 * The floating island: a smooth splat-textured heightfield following the hex layout, lagoons of
 * real water, craggy cliffs hanging below, boulders and leaf-card trees.
 */
export function Island({ layout, ash = false }: { layout: RealmLayout; ash?: boolean }) {
  useRealmTextures();
  const spec = useMemo(() => realmTerrainSpec(layout), [layout]);
  const geo = useMemo(() => buildTerrain(spec), [spec]);
  useEffect(
    () => () => {
      geo.ground.dispose();
      geo.cliff.dispose();
    },
    [geo],
  );
  const groundMat = useMemo(() => makeTerrainMaterial(), []);
  useEffect(() => () => groundMat.dispose(), [groundMat]);
  useEffect(() => {
    groundMat.color.set(ash ? '#6a625c' : '#ffffff');
    (groundMat.userData.terrain as { uDetail: { value: number } }).uDetail.value = ash ? 0.6 : 0.9;
  }, [ash, groundMat]);

  const waterGeo = useMemo(() => (layout.tiles.some((t) => t.kind === 'water') ? buildWater(geo.ground) : null), [layout, geo]);
  useEffect(() => () => waterGeo?.dispose(), [waterGeo]);
  const waterMat = useMemo(() => makeWaterMaterial(layout.biome.water), [layout]);
  useEffect(() => () => waterMat.dispose(), [waterMat]);
  useFrame((_, dt) => {
    (waterMat.userData.time as { value: number }).value += dt;
  });

  const cliffMat = cliffMaterial(ash ? '#4a4440' : layout.biome.cliff);
  const rockMat = useMemo(() => {
    const c = new THREE.Color(layout.biome.rock).lerp(new THREE.Color('#bfae95'), 0.2);
    return triplanarMaterial('cliff', { color: c, roughness: 0.9 }, { scale: 1.1, detail: 1, normal: 1.2 });
  }, [layout]);
  useEffect(() => () => rockMat.dispose(), [rockMat]);
  const isNight = layout.biome.name.includes('night');

  return (
    <group>
      <mesh geometry={geo.ground} material={groundMat} receiveShadow castShadow />
      <mesh geometry={geo.cliff} material={cliffMat} receiveShadow castShadow raycast={() => null} />
      {waterGeo && <mesh geometry={waterGeo} material={waterMat} receiveShadow renderOrder={1} raycast={() => null} />}
      <Trees layout={layout} spec={spec} ash={ash} />
      <Bushes layout={layout} spec={spec} ash={ash} />
      <Rocks layout={layout} spec={spec} mat={rockMat} />
      <RimRocks spec={spec} mat={rockMat} />
      <Hanging seed={layout.seed} mat={cliffMat} radius={spec.radius} />
      {isNight && <pointLight position={[0, 3, 0]} intensity={4} distance={14} color="#9aa0ff" decay={1.5} />}
    </group>
  );
}

