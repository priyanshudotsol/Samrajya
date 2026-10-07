'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { Cloud, Clouds as DreiClouds, useEnvironment, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { useBattle } from '@/lib/arena/battleMachine';
import type { Biome } from '@/lib/realm/layout';
import { mulberry32 } from '@/lib/realm/layout';
import { useRealmUi } from '@/lib/realm/ui-store';
import { useGame } from '@/lib/store/game';

import { skyState } from './skyState';

/** Poly Haven CC0 skies (public/hdri): 1k HDR for image-based light, 4k tonemapped JPG for the backdrop. */
const SKY = {
  day: { hdr: '/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr', jpg: '/hdri/kloofendal_48d_partly_cloudy_puresky_4k.jpg' },
  dusk: { hdr: '/hdri/belfast_sunset_puresky_1k.hdr', jpg: '/hdri/belfast_sunset_puresky_4k.jpg' },
};

const SUN_DAY = new THREE.Color('#fff1dc');
const SUN_DUSK = new THREE.Color('#ffa257');
const SUN_RED = new THREE.Color('#ff5030');
const RED_FOG = new THREE.Color('#3a0e0a');
/** Cloud tint written by RealmLighting each frame (night realms get cold, dim clouds). */
const cloudTint = new THREE.Color(1, 1, 1);

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const skyFrag = /* glsl */ `
  uniform sampler2D tDay;
  uniform sampler2D tDusk;
  uniform float uOffDay;
  uniform float uOffDusk;
  uniform float uDusk;
  uniform float uRed;
  uniform float uNight;
  uniform float uGain;
  uniform vec3 uHaze;
  uniform vec3 uTint;
  uniform vec3 uSunDir;
  uniform vec3 uSun;
  varying vec3 vDir;
  vec3 eq(sampler2D t, vec3 d, float off) {
    float u = atan(d.z, d.x) * 0.15915494 + 0.5 + off;
    float v = asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5;
    return texture2D(t, vec2(fract(u), v)).rgb;
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 du = normalize(vec3(d.x, max(d.y, 0.004), d.z));
    vec3 c = mix(eq(tDay, du, uOffDay), eq(tDusk, du, uOffDusk), uDusk) * uGain;
    c *= uTint;
    // warm glow around the moving sun
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    c += uSun * (pow(s, 8.0) * 0.18 + pow(s, 64.0) * 0.35) * (0.4 + uDusk);
    // below the horizon: a sea of haze (matches the fog), deepening downwards
    float below = smoothstep(0.015, -0.06, d.y);
    vec3 haze = uHaze * mix(1.0, 0.72, smoothstep(0.0, -0.6, d.y));
    c = mix(c, haze, below);
    // battle: blood-red grade
    float l = dot(c, vec3(0.3, 0.55, 0.15));
    c = mix(c, l * vec3(1.25, 0.3, 0.2) + vec3(0.03, 0.0, 0.0), uRed * 0.9);
    c *= mix(vec3(1.0), vec3(0.3, 0.34, 0.55), uNight);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface SkyInfo {
  /** Texture u of the sun in the image. */
  sunU: number;
  /** Mean linear colour of the horizon band. */
  horizon: THREE.Color;
  /** Mean linear colour high in the sky. */
  zenith: THREE.Color;
}

/** Finds the sun (brightest spot, upper half) and the horizon colour of an equirect sky image. */
function analyse(img: CanvasImageSource & { width: number; height: number }): SkyInfo {
  const W = 128;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  const out: SkyInfo = { sunU: 0.5, horizon: new THREE.Color('#c9d6e6'), zenith: new THREE.Color('#6f9fd8') };
  if (!g) return out;
  g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  let best = -1;
  for (let y = 2; y < H / 2; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const l = d[i] + d[i + 1] + d[i + 2];
      if (l > best) {
        best = l;
        out.sunU = (x + 0.5) / W;
      }
    }
  }
  let r = 0;
  let gg = 0;
  let b = 0;
  let n = 0;
  for (let y = Math.floor(H * 0.4); y < Math.floor(H * 0.47); y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      r += d[i];
      gg += d[i + 1];
      b += d[i + 2];
      n++;
    }
  }
  out.horizon.setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
  r = gg = b = n = 0;
  for (let y = Math.floor(H * 0.12); y < Math.floor(H * 0.3); y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      r += d[i];
      gg += d[i + 1];
      b += d[i + 2];
      n++;
    }
  }
  out.zenith.setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
  return out;
}

/**
 * Photographic sky + image-based light. The sun moves with epoch progress (dusk = the bell is
 * near; red sky in the final 10 s and during battles); the HDRI sky rotates so its sun follows,
 * cross-fades to a sunset sky at dusk and is graded blood-red in battle. Fog matches the haze
 * below the horizon so the floating cliffs dissolve into it.
 */
export function RealmLighting({ biome, shadows }: { biome: Biome; shadows: boolean }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const scene = useThree((s) => s.scene);
  const night = biome.name.includes('night');
  const tint = useMemo(() => new THREE.Color('#ffffff').lerp(new THREE.Color(biome.skyTint), 0.25), [biome]);

  const envDay = useEnvironment({ files: SKY.day.hdr });
  const envDusk = useEnvironment({ files: SKY.dusk.hdr });
  const [jpgDay, jpgDusk] = useTexture([SKY.day.jpg, SKY.dusk.jpg]);
  const info = useMemo(() => {
    for (const t of [jpgDay, jpgDusk]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.wrapS = THREE.RepeatWrapping;
      t.needsUpdate = true;
    }
    return { day: analyse(jpgDay.image as HTMLImageElement), dusk: analyse(jpgDusk.image as HTMLImageElement) };
  }, [jpgDay, jpgDusk]);

  const sunColor = useMemo(() => new THREE.Color(), []);
  const haze = useMemo(() => new THREE.Color(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          tDay: { value: jpgDay },
          tDusk: { value: jpgDusk },
          uOffDay: { value: 0 },
          uOffDusk: { value: 0 },
          uDusk: { value: 0 },
          uRed: { value: 0 },
          uNight: { value: night ? 1 : 0 },
          uGain: { value: 1.25 },
          uHaze: { value: new THREE.Color() },
          uTint: { value: tint },
          uSunDir: { value: new THREE.Vector3(1, 1, 0) },
          uSun: { value: new THREE.Color() },
        },
      }),
    [jpgDay, jpgDusk, night, tint],
  );

  useLayoutEffect(() => {
    scene.fog = new THREE.Fog('#c9d6e6', 30, 92);
    const prevBg = scene.background;
    scene.background = null;
    return () => {
      scene.fog = null;
      scene.environment = null;
      scene.background = prevBg;
    };
  }, [scene]);

  useFrame((_, dt) => {
    const g = useGame.getState().game;
    const phase = useBattle.getState().phase;
    let progress = 0.3;
    let remaining = 99;
    if (g) {
      const now = Date.now() / 1000;
      remaining = g.epochEndsAt - now;
      progress = g.pendingVrf ? 1 : Math.min(1, Math.max(0, 1 - remaining / g.config.epochSecs));
      if (g.phase !== 'Active') progress = 0.35;
    }
    const battle = phase !== 'IDLE' && phase !== 'HELD';
    const wantRed = battle || (g?.phase === 'Active' && (remaining <= 10 || g.pendingVrf)) ? 1 : 0;
    skyState.red += (wantRed - skyState.red) * Math.min(1, dt * 1.5);
    skyState.progress = progress;
    const dusk = Math.max(Math.min(1, Math.max(0, (progress - 0.45) / 0.55)), night ? 0.6 : 0, skyState.red);
    skyState.dusk = dusk;
    const red = skyState.red;

    // Sun arc: high in the east at epoch start → low in the west at the bell.
    const elev = THREE.MathUtils.lerp(1.0, 0.2, progress);
    const az = THREE.MathUtils.lerp(-0.9, 2.1, progress);
    dir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev));
    sunColor.copy(SUN_DAY).lerp(SUN_DUSK, dusk).lerp(SUN_RED, red);

    if (sun.current) {
      sun.current.position.copy(dir).multiplyScalar(20);
      sun.current.color.copy(sunColor);
      sun.current.intensity = THREE.MathUtils.lerp(3.0, 2.1, dusk) * (night ? 0.45 : 1);
    }

    // haze/fog colour: the sky images' horizon, graded like the sky
    haze
      .copy(info.day.horizon)
      .lerp(info.day.zenith, 0.3)
      .lerp(info.dusk.horizon.clone().lerp(info.dusk.zenith, 0.2), dusk)
      .multiply(tint);
    haze.lerp(RED_FOG, red * 0.9);
    if (night) haze.multiply(new THREE.Color(0.3, 0.34, 0.55));
    if (hemi.current) {
      hemi.current.color.copy(haze).lerp(sunColor, 0.2);
      hemi.current.groundColor.copy(haze).multiplyScalar(0.35);
      hemi.current.intensity = THREE.MathUtils.lerp(0.2, 0.45, red) * (night ? 0.8 : 1);
    }
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(haze);
    cloudTint.setRGB(1, 1, 1).lerp(new THREE.Color(1, 0.86, 0.74), dusk * 0.5).multiplyScalar(1 - red * 0.72);
    if (night) cloudTint.multiply(new THREE.Color(0.32, 0.36, 0.6));

    // image-based light: day or sunset HDRI, rotated so its sun sits where ours is
    const useDusk = dusk > 0.5;
    const env = useDusk ? envDusk : envDay;
    if (scene.environment !== env) scene.environment = env;
    const sunU = useDusk ? info.dusk.sunU : info.day.sunU;
    const azImg = (sunU - 0.5) * Math.PI * 2;
    scene.environmentRotation.set(0, azImg - az, 0);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.52, 0.42, dusk) * (1 - red * 0.45) * (night ? 0.45 : 1);

    const u = skyMat.uniforms;
    u.uOffDay.value = info.day.sunU - (az / (Math.PI * 2) + 0.5);
    u.uOffDusk.value = info.dusk.sunU - (az / (Math.PI * 2) + 0.5);
    u.uDusk.value = dusk;
    u.uRed.value = red;
    (u.uHaze.value as THREE.Color).copy(haze);
    (u.uSunDir.value as THREE.Vector3).copy(dir);
    (u.uSun.value as THREE.Color).copy(sunColor);
  });

  return (
    <>
      <mesh material={skyMat} raycast={() => null} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[150, 48, 24]} />
      </mesh>
      <hemisphereLight ref={hemi} intensity={0.4} />
      <directionalLight
        ref={sun}
        position={[10, 14, 6]}
        intensity={3}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9.5}
        shadow-camera-right={9.5}
        shadow-camera-top={9.5}
        shadow-camera-bottom={-9.5}
        shadow-camera-near={1}
        shadow-camera-far={50}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
      />
    </>
  );
}

let cloudUrl: string | null = null;
/** Soft cloud-puff sprite painted on a canvas (no network fetch). */
function cloudTexture(): string {
  if (cloudUrl) return cloudUrl;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  const rand = mulberry32(5);
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * S * 0.22;
    const x = S / 2 + Math.cos(a) * r;
    const y = S / 2 + Math.sin(a) * r * 0.8;
    const rad = S * (0.12 + rand() * 0.16);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.08)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  }
  cloudUrl = c.toDataURL('image/png');
  return cloudUrl;
}

/** Volumetric-looking cloud banks drifting under and around the island (drei <Clouds>, lit by the sun). */
export function Clouds() {
  const lowPower = useRealmUi((s) => s.lowPower);
  const texture = useMemo(() => cloudTexture(), []);
  const banks = useMemo(() => {
    const rand = mulberry32(42);
    const out: { p: [number, number, number]; b: [number, number, number]; seg: number; vol: number; seed: number }[] = [];
    // a sea of cloud beneath the island
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rand() * 0.5;
      const d = 7 + rand() * 9;
      out.push({ p: [Math.cos(a) * d, -6.5 - rand() * 2.5, Math.sin(a) * d], b: [6, 1.2, 6], seg: 18, vol: 7, seed: i + 1 });
    }
    out.push({ p: [0, -9.5, 0], b: [9, 1.5, 9], seg: 22, vol: 10, seed: 99 });
    // a few distant banks near the horizon
    for (let i = 0; i < 4; i++) {
      const a = rand() * Math.PI * 2;
      const d = 30 + rand() * 15;
      out.push({ p: [Math.cos(a) * d, -1 - rand() * 3, Math.sin(a) * d], b: [10, 2, 6], seg: 14, vol: 12, seed: 50 + i });
    }
    return out;
  }, []);
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += dt * 0.008;
    // clouds go dark and smoky under the battle sky, a little warmer at dusk
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
      if (m && (o as THREE.Mesh).isMesh && m.color) m.color.copy(cloudTint);
    });
  });
  return (
    <group ref={group}>
      <DreiClouds texture={texture} limit={260} material={THREE.MeshLambertMaterial} frustumCulled={false}>
        {(lowPower ? banks.filter((_, i) => i % 2 === 0) : banks).map((b, i) => (
          <Cloud
            key={i}
            seed={b.seed}
            position={b.p}
            bounds={b.b}
            segments={lowPower ? Math.ceil(b.seg / 2) : b.seg}
            volume={b.vol}
            smallestVolume={0.35}
            concentrate="inside"
            growth={3}
            speed={0.05}
            opacity={0.85}
            fade={40}
            color="#ffffff"
          />
        ))}
      </DreiClouds>
    </group>
  );
}
