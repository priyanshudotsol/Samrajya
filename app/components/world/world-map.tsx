'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { OrbitControls } from '@react-three/drei';

import { Html } from '@/components/three/Html';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { easing } from 'maath';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';

import { ADJACENCY, KINGDOMS, NEUTRAL_GLOW, PLAINS_INFO, isAdjacent, kingdomGlow, kingdomInk, ownerName } from '@/lib/game/factions';
import { formatSol, lamportsToSol } from '@/lib/game/math';
import { NEUTRAL, PLAINS, type Game } from '@/lib/game/types';
import { BIOMES, generateRealm } from '@/lib/realm/layout';
import { buildTerrain, miniTerrainSpec } from '@/lib/realm/terrain';
import { useRealmUi } from '@/lib/realm/ui-store';
import { useGame } from '@/lib/store/game';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';

import { Effects } from '../realm/Effects';
import { cliffMaterial, Island, makeTerrainMaterial, RimRocks } from '../realm/Island';
import { KeepModel } from '../realm/Keeps';
import { MAT, PaintProvider } from '../realm/paint';
import { Clouds, RealmLighting } from '../realm/RealmLighting';

/**
 * The world as a sky archipelago (replaces the globe): six floating islands, each a miniature of
 * that kingdom's realm, laid out on a hexagon in an order where every ring neighbour is also a
 * map neighbour (0-1-3-5-4-2). The three remaining links (0-5, 1-2, 3-4) arc high over the
 * central plains of Kurukshetra, which border every kingdom (a low road runs from each island).
 * Attacks fly along their route in the attacker's colour, contested islands pulse red, results
 * flash gold (held) or red (fell). Click an island to enter it.
 */

const RING_ORDER = [0, 1, 3, 5, 4, 2];
const HEX_R = 10;
/** The ring is squeezed sideways so it fits between the side panels. */
const SQUEEZE_X = 0.72;
const ISLAND_SCALE = 0.42;
const HELD = '#C9A227';
const FELL = '#E2483C';

const POS: THREE.Vector3[] = (() => {
  const out: THREE.Vector3[] = [];
  RING_ORDER.forEach((t, k) => {
    const a = Math.PI / 2 + (k * Math.PI) / 3;
    out[t] = new THREE.Vector3(Math.cos(a) * HEX_R * SQUEEZE_X, 0, Math.sin(a) * HEX_R);
  });
  out[PLAINS] = new THREE.Vector3(0, 0, 0);
  return out;
})();

const EDGES: [number, number][] = [];
for (let a = 0; a < ADJACENCY.length; a++) for (let b = a + 1; b < ADJACENCY.length; b++) if ((ADJACENCY[a] >> b) & 1) EDGES.push([a, b]);

/** Route a → b: a low arc to the plains or between ring neighbours, a high arc over the centre otherwise. */
function routeCurve(a: number, b: number, lift = 0): THREE.QuadraticBezierCurve3 {
  const p0 = POS[a].clone().setY(0.6);
  const p2 = POS[b].clone().setY(0.6);
  const mid = p0.clone().add(p2).multiplyScalar(0.5);
  const toPlains = a === PLAINS || b === PLAINS;
  const ringNeighbours = p0.distanceTo(p2) < HEX_R * 1.1;
  const ctrl = toPlains
    ? mid.clone().setY(1.8 + lift)
    : ringNeighbours
      ? mid.clone().multiplyScalar(1.12).setY(3 + lift)
      : mid.clone().setY(8.5 + lift);
  // pull endpoints to the island rims so routes don't start inside the keeps
  const inset = 2.6;
  p0.add(ctrl.clone().sub(p0).setY(0).normalize().multiplyScalar(inset));
  p2.add(ctrl.clone().sub(p2).setY(0).normalize().multiplyScalar(inset));
  return new THREE.QuadraticBezierCurve3(p0, ctrl, p2);
}

/** Territory an attacking faction marches from: an owned territory next to the target. */
function attackOrigin(game: Game, f: number, target: number): number {
  const owned = game.territoryOwner.map((o, t) => (o === f ? t : -1)).filter((t) => t >= 0);
  return owned.find((t) => isAdjacent(t, target)) ?? (owned.includes(f) ? f : (owned[0] ?? f));
}

// ---------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------

const ROUTE_MAT = new THREE.MeshBasicMaterial({ color: '#e8cf8a', transparent: true, opacity: 0.22, depthWrite: false });

function Routes() {
  const geos = useMemo(() => EDGES.map(([a, b]) => new THREE.TubeGeometry(routeCurve(a, b), 48, 0.035, 5, false)), []);
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={ROUTE_MAT} raycast={() => null} />
      ))}
    </group>
  );
}

const flowVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const flowFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uTime;
  varying vec2 vUv;
  void main() {
    float dash = smoothstep(0.0, 0.25, fract(vUv.x * 9.0 - uTime * 1.6)) * (1.0 - smoothstep(0.5, 0.75, fract(vUv.x * 9.0 - uTime * 1.6)));
    float a = (0.25 + 0.75 * dash) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
    gl_FragColor = vec4(uColor * (1.2 + dash * 1.5), a);
  }
`;
const BANNER_GEO = new THREE.ConeGeometry(0.16, 0.42, 4).rotateX(Math.PI / 2);

/** One live attack: a glowing flowing route plus war banners riding along it. */
function Attack({ from, to, faction, sol, idx }: { from: number; to: number; faction: number; sol: number; idx: number }) {
  const curve = useMemo(() => routeCurve(from, to, 0.6 + (idx % 3) * 0.5), [from, to, idx]);
  const width = Math.min(0.16, 0.05 + 0.04 * Math.log10(1 + sol * 10));
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 64, width, 6, false), [curve, width]);
  const color = kingdomGlow(faction);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: flowVert,
        fragmentShader: flowFrag,
        uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [color],
  );
  const bannerMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, toneMapped: false }),
    [color],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
      bannerMat.dispose();
    },
    [geo, mat, bannerMat],
  );
  const banners = useRef<THREE.InstancedMesh>(null);
  const n = 5;
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), p: new THREE.Vector3(), q: new THREE.Vector3() }), []);
  useFrame((s, dt) => {
    mat.uniforms.uTime.value += dt;
    const b = banners.current;
    if (!b) return;
    for (let i = 0; i < n; i++) {
      const u = (s.clock.elapsedTime * 0.12 + i / n) % 1;
      curve.getPointAt(u, tmp.p);
      curve.getPointAt(Math.min(1, u + 0.01), tmp.q);
      tmp.o.position.copy(tmp.p);
      tmp.o.lookAt(tmp.q);
      tmp.o.scale.setScalar(Math.sin(u * Math.PI) * 1.1 + 0.05);
      tmp.o.updateMatrix();
      b.setMatrixAt(i, tmp.o.matrix);
    }
    b.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh geometry={geo} material={mat} raycast={() => null} />
      <instancedMesh ref={banners} args={[BANNER_GEO, bannerMat, n]} frustumCulled={false} raycast={() => null} />
    </group>
  );
}

function Attacks() {
  const game = useGame((s) => s.game);
  const list = useMemo(() => {
    if (!game) return [];
    const out: { key: string; from: number; to: number; faction: number; sol: number }[] = [];
    game.factions.forEach((f, i) =>
      f.attackAlloc.forEach((a, t) => {
        if (a > 0n && game.territoryOwner[t] !== i && f.alive) {
          const from = attackOrigin(game, i, t);
          out.push({ key: `${i}>${t}@${from}`, from, to: t, faction: i, sol: lamportsToSol(a) });
        }
      }),
    );
    return out;
  }, [game]);
  return (
    <group>
      {list.map((x, i) => (
        <Attack key={x.key} from={x.from} to={x.to} faction={x.faction} sol={x.sol} idx={i} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Islands
// ---------------------------------------------------------------------------------------------

const RING_GEO = new THREE.TorusGeometry(3.1, 0.05, 6, 64).rotateX(Math.PI / 2);

function WorldIsland({ territory, hovered, onHover, onSelect }: { territory: number; hovered: boolean; onHover: (t: number | null) => void; onSelect: (t: number) => void }) {
  const game = useGame((s) => s.game)!;
  const layout = useMemo(() => generateRealm(territory), [territory]);
  const owner = game.territoryOwner[territory];
  const fac = game.factions[owner];
  const contested = game.factions.some((f, i) => i !== owner && f.alive && f.attackAlloc[territory] > 0n);
  const sol = lamportsToSol(fac.treasury) / Math.max(1, fac.territories);
  const grow = Math.min(1.18, 0.92 + 0.12 * Math.log10(1 + sol * 4));
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: FELL, transparent: true, opacity: 0, toneMapped: false }), []);
  const result = useResultFlash(territory);
  const p = POS[territory];

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    if (group.current) {
      group.current.position.y = Math.sin(t * 0.5 + territory * 1.3) * 0.25 + (hovered ? 0.5 : 0);
      easing.damp3(group.current.scale, [grow * ISLAND_SCALE, grow * ISLAND_SCALE, grow * ISLAND_SCALE], 0.4, dt);
    }
    if (ring.current) {
      const flash = result ? 1 : 0;
      const pulse = contested ? 0.35 + 0.35 * Math.sin(t * 4) : 0;
      ringMat.color.set(result === 'held' ? HELD : FELL);
      ringMat.opacity = Math.max(flash * (0.6 + 0.4 * Math.sin(t * 8)), pulse);
      ring.current.scale.setScalar(1 + (flash ? (t * 0.8) % 0.5 : 0));
    }
  });

  const name = KINGDOMS[territory].name;
  return (
    <group position={[p.x, 0, p.z]}>
      <group
        ref={group}
        scale={ISLAND_SCALE}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(territory);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = '';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(territory);
        }}
      >
        <PaintProvider color={KINGDOMS[owner].color}>
          <Island layout={layout} ash={!fac.alive} />
          <group position={[0, 0.36, 0]} scale={2.1}>
            {/* a conquered island raises its conqueror's keep */}
            <KeepModel territory={owner} />
          </group>
        </PaintProvider>
      </group>
      <mesh ref={ring} geometry={RING_GEO} material={ringMat} position={[0, 0.5, 0]} raycast={() => null} />
      <Html position={[0, 2.9, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div
          className={`whitespace-nowrap border border-border-active bg-background-panel/95 px-2.5 py-1 text-center shadow-[0_6px_18px_rgba(90,60,20,0.25)] transition-transform ${hovered ? 'scale-110' : ''}`}
          style={{ borderTop: `3px solid ${kingdomInk(owner)}` }}
        >
          <div className="font-rozha text-base leading-tight" style={{ color: kingdomInk(owner) }}>
            {KINGDOMS[owner].name}
          </div>
          {owner !== territory && (
            <div className="text-[11px] leading-tight text-text-secondary">
              conquered <span style={{ color: kingdomInk(territory) }}>{name}</span>
            </div>
          )}
          <div className="text-[11px] tabular-nums text-text-secondary">
            ◎ {formatSol(fac.treasury)} · {fac.members} {fac.members === 1 ? 'member' : 'members'}
          </div>
          {contested && <div className="text-[11px] font-semibold text-[var(--color-vermilion)]">⚔ under attack</div>}
        </div>
      </Html>
    </group>
  );
}

/** 'held' / 'fell' for ~6 s after a battle at `territory` lands in the log. */
function useResultFlash(territory: number): 'held' | 'fell' | null {
  const log = useGame((s) => s.game?.battleLog);
  const epoch = useGame((s) => s.game?.epoch ?? 0);
  const [flash, setFlash] = useState<'held' | 'fell' | null>(null);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!log) return;
    const last = [...log].reverse().find((e) => e.territory === territory);
    if (!last) return;
    const key = `${last.epoch}`;
    if (seen.current === null) {
      seen.current = key; // don't flash history on first load
      return;
    }
    if (seen.current === key || last.epoch < epoch - 1) return;
    seen.current = key;
    setFlash(last.winner === last.defender ? 'held' : 'fell');
    const id = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(id);
  }, [log, epoch, territory]);
  return flash;
}

const STONE_GEO = new THREE.BoxGeometry(0.22, 0.7, 0.14);
const FLAG_GEO = new THREE.PlaneGeometry(0.9, 0.55, 8, 1).translate(0.45, 0, 0);

/**
 * The central plains of Kurukshetra: an open grassland (no fort) that borders every kingdom.
 * Neutral at first; its holder's banner flies over a ring of standing stones and the plains pot
 * is paid to that kingdom at every bell.
 */
function Plains({ hovered, onHover, onSelect }: { hovered: boolean; onHover: (t: number | null) => void; onSelect: (t: number) => void }) {
  const game = useGame((s) => s.game)!;
  const owner = game.territoryOwner[PLAINS];
  const neutral = owner === NEUTRAL;
  const color = neutral ? NEUTRAL_GLOW : KINGDOMS[owner].color;
  const contested = game.factions.some((f, i) => i !== owner && f.alive && f.attackAlloc[PLAINS] > 0n);
  const result = useResultFlash(PLAINS);
  const spec = useMemo(() => miniTerrainSpec(BIOMES[0], 777), []);
  const geo = useMemo(() => buildTerrain(spec, 18, 72, 3.6), [spec]);
  const groundMat = useMemo(() => makeTerrainMaterial(), []);
  const cliffMat = cliffMaterial(BIOMES[0].cliff);
  const flagMat = useMemo(() => new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }), [color]);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: FELL, transparent: true, opacity: 0, toneMapped: false }), []);
  useEffect(
    () => () => {
      geo.ground.dispose();
      geo.cliff.dispose();
      groundMat.dispose();
    },
    [geo, groundMat],
  );
  useEffect(() => () => flagMat.dispose(), [flagMat]);
  const flag = useRef<THREE.Mesh>(null);
  const island = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (island.current) island.current.position.y = -0.4 + Math.sin(t * 0.4) * 0.15 + (hovered ? 0.3 : 0);
    // the banner ripples in the wind
    const f = flag.current;
    if (f) {
      const pos = f.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, Math.sin(t * 3 + x * 5) * 0.08 * x);
      }
      pos.needsUpdate = true;
    }
    if (ring.current) {
      const pulse = contested ? 0.35 + 0.35 * Math.sin(t * 4) : 0;
      ringMat.color.set(result === 'held' ? HELD : FELL);
      ringMat.opacity = Math.max(result ? 0.6 + 0.4 * Math.sin(t * 8) : 0, pulse);
    }
  });
  const flagGeo = useMemo(() => FLAG_GEO.clone(), []);
  return (
    <group>
      <group
        ref={island}
        position={[0, -0.4, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(PLAINS);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = '';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(PLAINS);
        }}
      >
        <group scale={[0.85, 0.35, 0.85]}>
          <mesh geometry={geo.ground} material={groundMat} receiveShadow />
          <mesh geometry={geo.cliff} material={cliffMat} castShadow raycast={() => null} />
          <RimRocks spec={spec} mat={cliffMat} count={20} />
        </group>
        {/* a ring of standing stones round the field of battle */}
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <mesh key={i} geometry={STONE_GEO} material={MAT.stone} position={[Math.cos(a) * 1.7, 0.55, Math.sin(a) * 1.7]} rotation={[0, -a, 0]} castShadow />;
        })}
        {/* the holder's banner */}
        <mesh material={MAT.wood} position={[0, 1.4, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 2.4, 6]} />
        </mesh>
        <mesh ref={flag} geometry={flagGeo} material={flagMat} position={[0.04, 2.3, 0]} castShadow />
      </group>
      <mesh ref={ring} geometry={RING_GEO} material={ringMat} position={[0, 0.3, 0]} scale={0.8} raycast={() => null} />
      {/* low and to the side so the banner and the field stay visible */}
      <Html position={[2.7, 0.9, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div
          className={`whitespace-nowrap border border-border-active bg-background-panel/90 px-2 py-0.5 text-center shadow-[0_6px_18px_rgba(90,60,20,0.25)] transition-transform ${hovered ? 'scale-110' : 'scale-90'}`}
          style={{ borderTop: `3px solid ${kingdomInk(owner)}` }}
        >
          <div className="font-rozha text-base leading-tight" style={{ color: PLAINS_INFO.ink }}>
            {PLAINS_INFO.name}
          </div>
          <div className="text-[11px] leading-tight" style={{ color: kingdomInk(owner) }}>
            {neutral ? `unclaimed · garrison ◎ ${formatSol(game.plainsDefense)}` : `held by ${ownerName(owner)}`}
          </div>
          <div className="text-[11px] tabular-nums text-text-secondary" title="Paid to the holder at every bell: the battle tax, upgrade spending and failed attacks on the garrison">
            pot ◎ {formatSol(game.plainsPot, 3)}
          </div>
          {contested && <div className="text-[11px] font-semibold text-[var(--color-vermilion)]">⚔ under attack</div>}
          {hovered && <div className="text-[10px] text-text-secondary">borders every kingdom · attack it from your war room</div>}
        </div>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------------------------

const DEG = Math.PI / 180;

function CameraRig({ focus }: { focus: number | null }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c || focus === null) return;
    // fly in towards the chosen island before the route change
    const p = POS[focus];
    c.enabled = false;
    easing.damp3(c.target, [p.x, 0.8, p.z], 0.25, dt);
    easing.damp3(camera.position, [p.x * 1.35, 5.5, p.z * 1.35 + 0.01], 0.3, dt);
    camera.lookAt(c.target);
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minPolarAngle={25 * DEG}
      maxPolarAngle={65 * DEG}
      minDistance={18}
      maxDistance={50}
      target={[0, 0, 0]}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

function Scene() {
  const router = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const select = (t: number) => {
    if (focus !== null) return;
    setFocus(t);
    setTimeout(() => router.push(`/kingdom/${t}`), 900);
  };
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  return (
    <>
      <RealmLighting biome={BIOMES[0]} shadows={false} />
      <Clouds />
      <Routes />
      <Attacks />
      <Plains hovered={hovered === PLAINS} onHover={setHovered} onSelect={select} />
      {KINGDOMS.map((k) => (
        <WorldIsland key={k.id} territory={k.id} hovered={hovered === k.id} onHover={setHovered} onSelect={select} />
      ))}
      <CameraRig focus={focus} />
    </>
  );
}

/** World screen 3D view. Client-only (load with `next/dynamic`, ssr: false). */
export function WorldMap() {
  const game = useGame((s) => s.game);
  const lowPower = useRealmUi((s) => s.lowPower);
  if (!game) return null;
  return (
    <div id={TOUR_STEP_IDS.WORLD_MAP} className="h-full w-full">
      <Canvas
        dpr={lowPower ? 1 : [1, 1.5]}
        camera={{ position: [0, 15, 33], fov: 38, near: 0.1, far: 400 }}
        gl={{ antialias: !lowPower, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <Scene />
          {!lowPower && <Effects />}
        </Suspense>
      </Canvas>
    </div>
  );
}
