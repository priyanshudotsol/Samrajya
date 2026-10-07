/**
 * Realm PBR textures (Poly Haven, CC0 — see public/textures/CREDITS.md) and the world-space
 * triplanar patch used by every stone / wood / plaster material in the realm.
 *
 * Why triplanar: the castle is built from unit boxes and cylinders scaled non-uniformly, so their
 * UVs stretch. The patch samples the texture by (object-anchored, world-oriented) position instead,
 * which keeps texel density uniform on any shape and needs no UVs at all.
 *
 * Textures are module singletons. Materials can be created (and even rendered) before the images
 * arrive: `uTexOn` stays 0 until the set has loaded, so they fall back to their flat colour instead
 * of sampling black. `useRealmTextures()` suspends until everything is in, so the realm never pops.
 *
 * Albedo is applied as a *detail* layer: colour × (texel / mean texel). The palette in styles.ts /
 * paint.tsx stays the source of truth (per-kingdom tints, faction paint) and the photo adds the
 * masonry, grain and grime on top.
 */
import { use } from 'react';
import * as THREE from 'three';

export type TexSetName =
  | 'grass'
  | 'dirt'
  | 'sand'
  | 'cliff'
  | 'stone'
  | 'redstone'
  | 'wood'
  | 'plaster'
  | 'marble';

const FILES: Record<TexSetName, string> = {
  grass: 'leafy_grass',
  dirt: 'dirt_floor',
  sand: 'coast_sand_01',
  cliff: 'cliff_side',
  stone: 'castle_wall_varriation',
  redstone: 'red_sandstone_wall',
  wood: 'weathered_planks',
  plaster: 'white_plaster_rough_01',
  marble: 'marble_01',
};

export interface TexSet {
  map: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture;
  /** Mean albedo (linear) — the detail layer divides by it. */
  avg: THREE.Color;
  /** Mean roughness texel. */
  roughAvg: { value: number };
  /** 0 until all three images have loaded. */
  on: { value: number };
}

const sets = new Map<TexSetName, TexSet>();
const pending: Promise<void>[] = [];
let ready: Promise<void> | null = null;

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/** Mean of an image's pixels (sRGB bytes → 0..1), read from a 32×32 downsample. */
function meanOf(img: CanvasImageSource): [number, number, number] {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return [0.5, 0.5, 0.5];
  g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  let r = 0;
  let gg = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    gg += d[i + 1];
    b += d[i + 2];
  }
  const n = (d.length / 4) * 255;
  return [r / n, gg / n, b / n];
}

/** The texture set `name` (created on first use; images stream in). */
export function texSet(name: TexSetName): TexSet {
  let s = sets.get(name);
  if (s) return s;
  const base = `/textures/${FILES[name]}`;
  const loader = new THREE.TextureLoader();
  const mk = (suffix: string, srgb: boolean) => {
    const t = new THREE.Texture();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return { t, url: `${base}_${suffix}_1k.jpg` };
  };
  const parts = [mk('diff', true), mk('nor_gl', false), mk('rough', false)];
  s = {
    map: parts[0].t,
    normal: parts[1].t,
    rough: parts[2].t,
    avg: new THREE.Color(0.5, 0.5, 0.5),
    roughAvg: { value: 0.7 },
    on: { value: 0 },
  };
  sets.set(name, s);
  if (isBrowser()) {
    const set = s;
    const p = Promise.all(
      parts.map(
        ({ t, url }) =>
          new Promise<HTMLImageElement | null>((resolve) => {
            loader.load(
              url,
              (loaded) => {
                t.image = loaded.image;
                t.needsUpdate = true;
                resolve(loaded.image as HTMLImageElement);
              },
              undefined,
              () => resolve(null),
            );
          }),
      ),
    ).then(([diff, , rough]) => {
      if (!diff || !rough) return; // stay flat-coloured on a failed load
      const [r, g, b] = meanOf(diff);
      set.avg.setRGB(r, g, b, THREE.SRGBColorSpace);
      set.roughAvg.value = Math.max(0.05, meanOf(rough)[0]);
      set.on.value = 1;
    });
    pending.push(p);
  }
  return s;
}

/** Starts every realm texture loading; resolves when all are in (never rejects). */
export function realmTexturesReady(): Promise<void> {
  if (!ready) {
    (Object.keys(FILES) as TexSetName[]).forEach((n) => texSet(n));
    ready = Promise.all(pending).then(() => undefined);
  }
  return ready;
}

/** Suspends the calling component until the realm textures have loaded. */
export function useRealmTextures(): void {
  use(realmTexturesReady());
}

export interface TriplanarOpts {
  /** Texture repeats per world unit. */
  scale?: number;
  /** 0..1 how strongly the photo modulates the flat colour. */
  detail?: number;
  /** Normal-map strength. */
  normal?: number;
  /** 0..1 how much the roughness map varies roughness around the material's value. */
  rough?: number;
}

/**
 * Patches a MeshStandardMaterial with world-space triplanar albedo-detail, normal and roughness
 * from `set`. Safe to call once per material; keeps every other material feature (fog, shadows,
 * instancing, flat shading, env maps).
 */
export function applyTriplanar<M extends THREE.MeshStandardMaterial>(mat: M, name: TexSetName, opts: TriplanarOpts = {}): M {
  const set = texSet(name);
  const uniforms = {
    tTriDiff: { value: set.map },
    tTriNor: { value: set.normal },
    tTriRough: { value: set.rough },
    uTriAvg: { value: set.avg },
    uTriRoughAvg: set.roughAvg,
    uTriOn: set.on,
    uTriScale: { value: opts.scale ?? 1.6 },
    uTriDetail: { value: opts.detail ?? 0.85 },
    uTriNormal: { value: opts.normal ?? 1 },
    uTriRough: { value: opts.rough ?? 0.6 },
  };
  mat.userData.triplanar = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
        vTriN = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 tp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            tp = instanceMatrix * tp;
          #endif
          vTriPos = (modelMatrix * tp).xyz - modelMatrix[3].xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tTriDiff;
        uniform sampler2D tTriNor;
        uniform sampler2D tTriRough;
        uniform vec3 uTriAvg;
        uniform float uTriRoughAvg;
        uniform float uTriOn;
        uniform float uTriScale;
        uniform float uTriDetail;
        uniform float uTriNormal;
        uniform float uTriRough;
        varying vec3 vTriPos;
        varying vec3 vTriN;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 triW = pow(abs(normalize(vTriN)), vec3(4.0));
        triW /= (triW.x + triW.y + triW.z);
        vec3 triP = vTriPos * uTriScale;
        vec2 triUvX = triP.zy;
        vec2 triUvY = triP.xz;
        vec2 triUvZ = triP.xy;
        vec3 triTex = texture2D(tTriDiff, triUvX).rgb * triW.x
                    + texture2D(tTriDiff, triUvY).rgb * triW.y
                    + texture2D(tTriDiff, triUvZ).rgb * triW.z;
        diffuseColor.rgb *= mix(vec3(1.0), triTex / max(uTriAvg, vec3(0.02)), uTriDetail * uTriOn);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float triR = texture2D(tTriRough, triUvX).g * triW.x
                   + texture2D(tTriRough, triUvY).g * triW.y
                   + texture2D(tTriRough, triUvZ).g * triW.z;
        roughnessFactor = clamp(roughnessFactor * mix(1.0, triR / uTriRoughAvg, uTriRough * uTriOn), 0.04, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 gw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          float k = uTriNormal * uTriOn;
          vec3 nX = texture2D(tTriNor, triUvX).xyz * 2.0 - 1.0;
          vec3 nY = texture2D(tTriNor, triUvY).xyz * 2.0 - 1.0;
          vec3 nZ = texture2D(tTriNor, triUvZ).xyz * 2.0 - 1.0;
          nX = vec3(nX.xy * k + gw.zy, gw.x);
          nY = vec3(nY.xy * k + gw.xz, gw.y);
          nZ = vec3(nZ.xy * k + gw.xy, gw.z);
          vec3 wn = normalize(nX.zyx * triW.x + nY.xzy * triW.y + nZ.xyz * triW.z);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'samrajya-triplanar-v1';
  mat.needsUpdate = true;
  return mat;
}

/** A new MeshStandardMaterial with the triplanar patch applied. */
export function triplanarMaterial(
  name: TexSetName,
  params: THREE.MeshStandardMaterialParameters,
  opts?: TriplanarOpts,
): THREE.MeshStandardMaterial {
  return applyTriplanar(new THREE.MeshStandardMaterial(params), name, opts);
}
