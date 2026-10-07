/**
 * Realistic warrior assets. Prefers the Mixamo sword-and-shield paladin in
 * `public/models/warrior/` (warrior.fbx + one FBX per animation, see WARRIOR_CLIPS); until those
 * files exist it falls back to the three.js "Soldier" (public/models/soldier/Soldier.glb, Mixamo
 * rig, idle/walk/run only) with a sword and shield attached to its hands.
 *
 * Both share the Mixamo skeleton, so any Mixamo clip drives either body. Missing clips are faked
 * procedurally by WarriorCrowd (arm swings, falls).
 */
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ClipName = 'idle' | 'walk' | 'run' | 'slash' | 'attack' | 'block' | 'impact' | 'death' | 'victory';
export const WARRIOR_CLIPS: ClipName[] = ['idle', 'walk', 'run', 'slash', 'attack', 'block', 'impact', 'death', 'victory'];

/** World height of a warrior (the walls are ~1 unit tall). */
export const WARRIOR_HEIGHT = 0.5;

export interface WarriorTemplate {
  /** Normalised model: feet at y=0, facing +z, WARRIOR_HEIGHT tall. */
  scene: THREE.Group;
  clips: Partial<Record<ClipName, THREE.AnimationClip>>;
  /** The body carries its own sword and shield (Mixamo "WProp" paladin). */
  hasProps: boolean;
  source: 'mixamo' | 'soldier';
}

const BASE = '/models/warrior/';

async function exists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok && !(r.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

/** Drop root motion: keep the hips' height but pin x/z so "in place" holds even if it wasn't. */
function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  for (const t of clip.tracks) {
    if (/hips\.position$/i.test(t.name)) {
      const v = t.values;
      for (let i = 0; i < v.length; i += 3) {
        v[i] = v[0];
        v[i + 2] = v[2];
      }
    }
  }
  return clip;
}

function normalise(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const h = box.max.y - box.min.y || 1;
  root.scale.multiplyScalar(WARRIOR_HEIGHT / h);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root);
  root.position.y -= b2.min.y;
}

function prepMaterials(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
  });
}

function findBone(root: THREE.Object3D, re: RegExp): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!hit && (o as THREE.Bone).isBone && re.test(o.name)) hit = o;
  });
  return hit;
}

const STEEL = new THREE.MeshStandardMaterial({ color: '#d8dde4', metalness: 0.95, roughness: 0.22 });
const BRASS = new THREE.MeshStandardMaterial({ color: '#c9a23f', metalness: 0.9, roughness: 0.3 });
const LEATHER = new THREE.MeshStandardMaterial({ color: '#4a2e1a', roughness: 0.8 });
const SHIELD_WOOD = new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.7 });

/** Attaches `obj` (built in world units) to `bone`, compensating the bone's world scale. */
function attach(bone: THREE.Object3D, obj: THREE.Object3D, offset: THREE.Vector3, rot: THREE.Euler) {
  const s = new THREE.Vector3();
  bone.getWorldScale(s);
  obj.scale.setScalar(1 / (s.x || 1));
  obj.position.copy(offset).multiplyScalar(1 / (s.x || 1));
  obj.rotation.copy(rot);
  bone.add(obj);
}

/** A talwar (curved-ish sword) and a round dhal shield for bodies without props. */
function addProps(root: THREE.Object3D) {
  const hand = findBone(root, /RightHand$/i);
  const arm = findBone(root, /LeftForeArm$/i);
  const H = WARRIOR_HEIGHT;
  if (hand) {
    const sword = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.022 * H, 0.6 * H, 0.006 * H).translate(0, 0.36 * H, 0), STEEL);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.015 * H, 0.08 * H, 4).translate(0, 0.7 * H, 0), STEEL);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1 * H, 0.012 * H, 0.016 * H).translate(0, 0.05 * H, 0), BRASS);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * H, 0.008 * H, 0.08 * H, 6), LEATHER);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.014 * H, 8, 6).translate(0, -0.045 * H, 0), BRASS);
    sword.add(blade, tip, guard, grip, pommel);
    sword.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    // Mixamo hand: +y runs down the fingers; point the blade forward out of the fist
    attach(hand, sword, new THREE.Vector3(0, 0.05 * H, 0.012 * H), new THREE.Euler(Math.PI / 2, 0, 0));
  }
  if (arm) {
    const shield = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * H, 0.13 * H, 0.012 * H, 24), SHIELD_WOOD);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13 * H, 0.008 * H, 6, 24).rotateX(Math.PI / 2), BRASS);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.03 * H, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), BRASS);
    boss.position.y = 0.006 * H;
    shield.add(disc, rim, boss);
    shield.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    attach(arm, shield, new THREE.Vector3(0, 0.14 * H, 0.04 * H), new THREE.Euler(0, 0, Math.PI / 2));
  }
}

async function loadMixamo(): Promise<WarriorTemplate | null> {
  if (!(await exists(BASE + 'warrior.fbx'))) return null;
  const loader = new FBXLoader();
  const scene = (await loader.loadAsync(BASE + 'warrior.fbx')) as THREE.Group;
  const clips: WarriorTemplate['clips'] = {};
  await Promise.all(
    WARRIOR_CLIPS.map(async (name) => {
      const url = `${BASE}${name}.fbx`;
      if (!(await exists(url))) return;
      try {
        const g = await loader.loadAsync(url);
        const clip = g.animations[0];
        if (clip) {
          clip.name = name;
          clips[name] = stripRootMotion(clip);
        }
      } catch (e) {
        console.warn('[warriors] failed to load', url, e);
      }
    }),
  );
  if (!clips.idle && scene.animations[0]) clips.idle = scene.animations[0];
  const wrap = new THREE.Group();
  wrap.add(scene);
  normalise(scene);
  prepMaterials(wrap);
  return { scene: wrap, clips, hasProps: true, source: 'mixamo' };
}

async function loadSoldier(): Promise<WarriorTemplate> {
  const gltf = await new GLTFLoader().loadAsync('/models/soldier/Soldier.glb');
  const model = gltf.scene;
  // the soldier faces −z; turn it to +z like every other mesh in the realm
  model.rotation.y = Math.PI;
  const wrap = new THREE.Group();
  wrap.add(model);
  normalise(model);
  prepMaterials(wrap);
  wrap.updateMatrixWorld(true);
  addProps(model);
  const clips: WarriorTemplate['clips'] = {};
  for (const a of gltf.animations) {
    const n = a.name.toLowerCase();
    if (n === 'idle' || n === 'walk' || n === 'run') clips[n as ClipName] = stripRootMotion(a);
  }
  return { scene: wrap, clips, hasProps: false, source: 'soldier' };
}

let promise: Promise<WarriorTemplate> | null = null;
let cached: WarriorTemplate | null = null;

export function loadWarriors(): Promise<WarriorTemplate> {
  promise ??= (async () => {
    let t: WarriorTemplate | null = null;
    try {
      t = await loadMixamo();
    } catch (e) {
      console.warn('[warriors] Mixamo load failed, using the soldier', e);
    }
    cached = t ?? (await loadSoldier());
    return cached;
  })();
  return promise;
}

/** The warrior template once loaded (null while loading or if it failed). */
export function useWarriors(): WarriorTemplate | null {
  const [t, setT] = useState<WarriorTemplate | null>(cached);
  useEffect(() => {
    if (t) return;
    let live = true;
    loadWarriors()
      .then((x) => live && setT(x))
      .catch((e) => console.warn('[warriors] no realistic warriors', e));
    return () => {
      live = false;
    };
  }, [t]);
  return t;
}
