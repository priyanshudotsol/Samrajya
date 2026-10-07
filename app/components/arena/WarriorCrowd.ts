/**
 * A pool of skinned, animated warriors (one AnimationMixer each). Crowds (Troops, Melee) call
 * `set(i, …)` every frame with a position and a semantic state; the crowd picks and cross-fades
 * the clip, and fakes any clip the asset lacks (sword swings, raised arms, falls) by rotating
 * bones on top of the mixer.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import type { ClipName, WarriorTemplate } from '@/lib/arena/warriors';

export type WarriorState = 'idle' | 'walk' | 'run' | 'attack' | 'block' | 'hit' | 'cheer' | 'dead';

const FADE = 0.22;
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const side = new THREE.Vector3();

interface Warrior {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<ClipName, THREE.AnimationAction>>;
  clip: ClipName | null;
  state: WarriorState;
  stateT: number;
  color: string;
  rArm: THREE.Object3D | null;
  lArm: THREE.Object3D | null;
  meshes: THREE.Mesh[];
  baseMats: THREE.Material[];
}

const tintCache = new Map<string, THREE.Material>();
function tinted(m: THREE.Material, color: string, amount: number): THREE.Material {
  const key = `${m.uuid}:${color}:${amount}`;
  let t = tintCache.get(key);
  if (!t) {
    t = m.clone();
    const sm = t as THREE.MeshStandardMaterial;
    if (sm.color) sm.color.lerp(new THREE.Color(color), amount);
    tintCache.set(key, t);
  }
  return t;
}

function findBone(root: THREE.Object3D, re: RegExp): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!hit && (o as THREE.Bone).isBone && re.test(o.name)) hit = o;
  });
  return hit;
}

/** Rotates `bone` by `angle` about the character's side (x) axis, in its parent's space. */
function swingBone(bone: THREE.Object3D | null, root: THREE.Object3D, angle: number) {
  if (!bone || !bone.parent || angle === 0) return;
  root.getWorldQuaternion(tmpQ);
  side.set(1, 0, 0).applyQuaternion(tmpQ);
  bone.parent.getWorldQuaternion(tmpQ2).invert();
  side.applyQuaternion(tmpQ2).normalize();
  tmpQ.setFromAxisAngle(side, angle);
  bone.quaternion.premultiply(tmpQ);
}

/** Overhead-chop cycle for the right arm (radians; negative = forward/up). */
function chop(t: number): number {
  const f = t - Math.floor(t);
  if (f < 0.45) return -2.5 * Math.sin((f / 0.45) * (Math.PI / 2));
  if (f < 0.6) return -2.5 + 2.1 * ((f - 0.45) / 0.15);
  return -0.4 * (1 - (f - 0.6) / 0.4);
}

export class WarriorCrowd {
  readonly group = new THREE.Group();
  private pool: Warrior[] = [];
  private used = 0;

  constructor(
    private template: WarriorTemplate,
    private tintAmount = template.source === 'soldier' ? 0.55 : 0.3,
  ) {}

  private make(): Warrior {
    const root = cloneSkinned(this.template.scene);
    root.rotation.order = 'YXZ';
    const mixer = new THREE.AnimationMixer(root);
    const actions: Warrior['actions'] = {};
    for (const [name, clip] of Object.entries(this.template.clips)) {
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      if (name === 'death' || name === 'impact') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      actions[name as ClipName] = a;
    }
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const w: Warrior = {
      root,
      mixer,
      actions,
      clip: null,
      state: 'idle',
      stateT: 0,
      color: '',
      rArm: findBone(root, /RightArm$/i),
      lArm: findBone(root, /LeftArm$/i),
      meshes,
      baseMats: meshes.map((m) => m.material as THREE.Material),
    };
    // desync crowds
    mixer.setTime(Math.random() * 2);
    this.group.add(root);
    return w;
  }

  /** Call at the start of a frame. */
  begin() {
    this.used = 0;
  }

  private clipFor(w: Warrior, s: WarriorState, i: number): ClipName | null {
    const a = w.actions;
    const pick = (...names: ClipName[]) => names.find((n) => a[n]) ?? null;
    switch (s) {
      case 'walk':
        return pick('walk', 'run', 'idle');
      case 'run':
        return pick('run', 'walk', 'idle');
      case 'attack':
        return i % 2 ? pick('slash', 'attack', 'idle') : pick('attack', 'slash', 'idle');
      case 'block':
        return pick('block', 'idle');
      case 'hit':
        return pick('impact', 'idle');
      case 'cheer':
        return pick('victory', 'idle');
      case 'dead':
        return pick('death', 'idle');
      default:
        return pick('idle');
    }
  }

  /** Places warrior `i` this frame. `tilt` leans it about its local x (used for faked deaths). */
  set(i: number, x: number, y: number, z: number, face: number, state: WarriorState, color: string, scale = 1, tilt = 0) {
    while (this.pool.length <= i) this.pool.push(this.make());
    this.used = Math.max(this.used, i + 1);
    const w = this.pool[i];
    w.root.visible = scale > 0.02;
    w.root.position.set(x, y, z);
    w.root.scale.setScalar(Math.max(scale, 0.0001));
    if (color !== w.color) {
      w.color = color;
      w.meshes.forEach((m, k) => (m.material = tinted(w.baseMats[k], color, this.tintAmount)));
    }
    if (state !== w.state) {
      w.state = state;
      w.stateT = 0;
    }
    const clip = this.clipFor(w, state, i);
    if (clip !== w.clip) {
      const next = clip ? w.actions[clip] : undefined;
      const prev = w.clip ? w.actions[w.clip] : undefined;
      if (next) {
        next.reset().setEffectiveWeight(1).fadeIn(FADE).play();
        if (clip === 'walk' || clip === 'run') next.time = Math.random() * next.getClip().duration;
      }
      prev?.fadeOut(FADE);
      w.clip = clip;
    }
    // faked death: fall backwards if there is no death clip
    const fakeDeath = state === 'dead' && w.clip !== 'death';
    const fall = fakeDeath ? -1.5 * Math.min(1, (w.stateT / 0.45) ** 2) : 0;
    w.root.rotation.set(tilt + fall, face, 0);
  }

  /** Advance mixers and apply procedural overlays; hides unused warriors. */
  end(dt: number) {
    for (let i = 0; i < this.pool.length; i++) {
      const w = this.pool[i];
      if (i >= this.used) {
        w.root.visible = false;
        continue;
      }
      if (!w.root.visible) continue;
      w.stateT += dt;
      const speed = w.state === 'run' && w.clip === 'walk' ? 1.6 : 1;
      w.mixer.update(dt * speed);
      // overlays for clips the asset doesn't have
      const fakeAttack = w.state === 'attack' && w.clip !== 'slash' && w.clip !== 'attack';
      const fakeCheer = w.state === 'cheer' && w.clip !== 'victory';
      const fakeBlock = w.state === 'block' && w.clip !== 'block';
      if (fakeAttack || fakeCheer || fakeBlock) {
        w.root.updateMatrixWorld(true);
        if (fakeAttack) swingBone(w.rArm, w.root, chop(w.stateT * 1.3 + i * 0.37));
        if (fakeBlock) swingBone(w.lArm, w.root, -1.3);
        if (fakeCheer) {
          const wave = Math.sin(w.stateT * 7 + i) * 0.25;
          swingBone(w.rArm, w.root, -2.8 + wave);
          swingBone(w.lArm, w.root, -2.6 - wave);
        }
      }
    }
  }

  dispose() {
    for (const w of this.pool) w.mixer.stopAllAction();
    this.pool = [];
    this.group.clear();
  }
}
