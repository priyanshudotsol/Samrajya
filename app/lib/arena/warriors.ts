/**
 * Warrior assets, in order of preference:
 *   1. the Mixamo sword-and-shield paladin in `public/models/warrior/` (if the user drops it in)
 *   2. the KayKit Knight (`public/models/knight/Knight.glb`, CC0, Kay Lousberg): 76 real clips
 *      (sword chops / slices / stabs, crossbow shots, block, hit, death, cheer) and real props;
 *      a spear, a crossbow and a ladder are added so every gear has its own look and swing
 *   3. the three.js "Soldier" (idle/walk/run only) with a sword and shield attached
 *
 * Both share the Mixamo skeleton, so any Mixamo clip drives either body. Missing clips are faked
 * procedurally by WarriorCrowd (arm swings, falls).
 */
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ClipName =
  | 'idle'
  | 'idle2h'
  | 'walk'
  | 'run'
  | 'slash'
  | 'attack'
  | 'stab'
  | 'heavy'
  | 'shoot'
  | 'bash'
  | 'block'
  | 'blockhit'
  | 'impact'
  | 'death'
  | 'victory'
  // combat moves (§10.10, KayKit Knight only)
  | 'slash2'
  | 'stab1'
  | 'spin'
  | 'dodgeF'
  | 'dodgeB'
  | 'dodgeL'
  | 'dodgeR'
  | 'impact2'
  | 'death2';
/** Clips the Mixamo path looks for (one FBX each). */
export const WARRIOR_CLIPS: ClipName[] = ['idle', 'walk', 'run', 'slash', 'attack', 'block', 'impact', 'death', 'victory'];

/** Named props on the body, shown per gear by WarriorCrowd (only the Knight has them). */
export type PropName = 'sword' | 'greatsword' | 'shield' | 'bigshield' | 'spear' | 'crossbow' | 'ladder';

/** World height of a warrior (the walls are ~1 unit tall). */
export const WARRIOR_HEIGHT = 0.5;

export interface WarriorTemplate {
  /** Normalised model: feet at y=0, facing +z, WARRIOR_HEIGHT tall. */
  scene: THREE.Group;
  clips: Partial<Record<ClipName, THREE.AnimationClip>>;
  /** The body carries its own sword and shield (Mixamo "WProp" paladin). */
  hasProps: boolean;
  source: 'mixamo' | 'knight' | 'soldier';
  /** Prop node names on the template (cloned bodies find them by name). */
  props: Partial<Record<PropName, string>>;
  /** Meshes to tint strongly with the kingdom colour (cape, shield faces). */
  teamMeshes: string[];
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
  // opt-in: set NEXT_PUBLIC_WARRIOR_MIXAMO=1 after dropping the FBX files in public/models/warrior/
  if (process.env.NEXT_PUBLIC_WARRIOR_MIXAMO !== '1') return null;
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
  return { scene: wrap, clips, hasProps: true, source: 'mixamo', props: {}, teamMeshes: [] };
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
  return { scene: wrap, clips, hasProps: false, source: 'soldier', props: {}, teamMeshes: [] };
}

const KNIGHT = '/models/knight/';

/** KayKit clip → our clip name. */
const KNIGHT_CLIPS: Record<string, ClipName> = {
  Idle: 'idle',
  '2H_Melee_Idle': 'idle2h',
  Walking_A: 'walk',
  Running_A: 'run',
  '1H_Melee_Attack_Slice_Diagonal': 'slash',
  '1H_Melee_Attack_Chop': 'attack',
  '2H_Melee_Attack_Stab': 'stab',
  '2H_Melee_Attack_Chop': 'heavy',
  '2H_Ranged_Shoot': 'shoot',
  Block_Attack: 'bash',
  Blocking: 'block',
  Block_Hit: 'blockhit',
  Hit_A: 'impact',
  Death_A: 'death',
  Cheer: 'victory',
  '1H_Melee_Attack_Slice_Horizontal': 'slash2',
  '1H_Melee_Attack_Stab': 'stab1',
  '2H_Melee_Attack_Spin': 'spin',
  Dodge_Forward: 'dodgeF',
  Dodge_Backward: 'dodgeB',
  Dodge_Left: 'dodgeL',
  Dodge_Right: 'dodgeR',
  Hit_B: 'impact2',
  Death_B: 'death2',
};

const SPEAR_WOOD = new THREE.MeshStandardMaterial({ color: '#6b4524', roughness: 0.8 });
const LADDER_WOOD = new THREE.MeshStandardMaterial({ color: '#8a6136', roughness: 0.85 });

/** A long bhala (shaft + leaf blade), built in the hand slot's local units. */
function makeSpear(len: number): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.012, len * 0.012, len, 6).translate(0, len * 0.3, 0), SPEAR_WOOD);
  const blade = new THREE.Mesh(new THREE.ConeGeometry(len * 0.035, len * 0.16, 4).translate(0, len * 0.88, 0), STEEL);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.02, len * 0.02, len * 0.03, 8).translate(0, len * 0.79, 0), BRASS);
  g.add(shaft, blade, ring);
  return g;
}

/** A siege ladder slung on the back. */
function makeLadder(h: number): THREE.Group {
  const g = new THREE.Group();
  const w = h * 0.28;
  for (const sx of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(h * 0.04, h, h * 0.04).translate((sx * w) / 2, 0, 0), LADDER_WOOD));
  for (let k = 0; k < 5; k++) g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.03, h * 0.03).translate(0, -h * 0.4 + (k * h * 0.8) / 4, 0), LADDER_WOOD));
  return g;
}

async function loadKnight(): Promise<WarriorTemplate | null> {
  if (!(await exists(KNIGHT + 'Knight.glb'))) return null;
  const loader = new GLTFLoader();
  const [gltf, bow] = await Promise.all([loader.loadAsync(KNIGHT + 'Knight.glb'), loader.loadAsync(KNIGHT + 'crossbow_2handed.gltf').catch(() => null)]);
  const model = gltf.scene;
  const wrap = new THREE.Group();
  wrap.add(model);
  normalise(model);
  prepMaterials(wrap);
  // the KayKit sets ship every prop; we toggle them per gear
  const hide = ['1H_Sword_Offhand', 'Badge_Shield', 'Spike_Shield'];
  model.traverse((o) => {
    if (hide.includes(o.name)) o.visible = false;
  });
  // GLTFLoader strips dots from node names ('handslot.r' → 'handslotr')
  const byName = (...names: string[]) => names.map((n) => model.getObjectByName(n)).find(Boolean);
  const handR = byName('handslotr', 'handslot.r', 'handslot_r');
  const chest = byName('chest');
  // size and orient new props from the stock one-handed sword (same slot, same local units)
  const sword = model.getObjectByName('1H_Sword') as THREE.Mesh | undefined;
  let swordLen = 1;
  const axis = new THREE.Vector3(0, 1, 0);
  if (sword?.geometry) {
    sword.geometry.computeBoundingBox();
    const sz = new THREE.Vector3();
    sword.geometry.boundingBox!.getSize(sz).multiply(sword.scale);
    swordLen = Math.max(sz.x, sz.y, sz.z);
    if (sz.x >= sz.y && sz.x >= sz.z) axis.set(1, 0, 0);
    else if (sz.z >= sz.y) axis.set(0, 0, 1);
  }
  /** Places `obj` (built along +y, in sword units) where the sword sits, along the sword's axis. */
  const likeSword = (obj: THREE.Object3D) => {
    if (sword) {
      obj.position.copy(sword.position);
      obj.quaternion.copy(sword.quaternion);
    }
    obj.quaternion.multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis));
  };
  if (handR) {
    const spear = makeSpear(swordLen * 2.3);
    spear.name = 'Prop_Spear';
    const holder = new THREE.Group();
    holder.name = 'Prop_SpearHolder';
    likeSword(holder);
    spear.position.y = -swordLen * 0.55;
    holder.add(spear);
    holder.visible = false;
    handR.add(holder);
    if (bow) {
      const cb = bow.scene;
      cb.name = 'Prop_Crossbow';
      cb.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(cb);
      const bsz = new THREE.Vector3();
      bb.getSize(bsz);
      cb.scale.setScalar((swordLen * 1.35) / Math.max(bsz.x, bsz.y, bsz.z, 1e-6));
      if (sword) cb.position.copy(sword.position);
      cb.visible = false;
      handR.add(cb);
    }
  }
  if (chest) {
    const ladder = makeLadder(swordLen * 1.6);
    ladder.name = 'Prop_Ladder';
    // slung across the back: chest space is the bone's; push it behind along -z and tilt
    ladder.position.set(0, swordLen * 0.25, -swordLen * 0.35);
    ladder.rotation.z = 0.35;
    ladder.visible = false;
    chest.add(ladder);
  }
  wrap.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
  });
  const clips: WarriorTemplate['clips'] = {};
  for (const a of gltf.animations) {
    const n = KNIGHT_CLIPS[a.name];
    if (n) clips[n] = stripRootMotion(a);
  }
  return {
    scene: wrap,
    clips,
    hasProps: true,
    source: 'knight',
    props: {
      sword: '1H_Sword',
      greatsword: '2H_Sword',
      shield: 'Round_Shield',
      bigshield: 'Rectangle_Shield',
      spear: 'Prop_SpearHolder',
      crossbow: 'Prop_Crossbow',
      ladder: 'Prop_Ladder',
    },
    teamMeshes: ['Knight_Cape'],
  };
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
    if (!t) {
      try {
        t = await loadKnight();
      } catch (e) {
        console.warn('[warriors] Knight load failed, using the soldier', e);
      }
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
