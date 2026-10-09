/**
 * A pool of skinned, animated warriors (one AnimationMixer each). Crowds (Troops, Melee) call
 * `set(i, …)` every frame with a position and a semantic state; the crowd picks and cross-fades
 * the clip, and fakes any clip the asset lacks (sword swings, raised arms, falls) by rotating
 * bones on top of the mixer.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import type { ClipName, PropName, WarriorTemplate } from '@/lib/arena/warriors';

export type WarriorState = 'idle' | 'walk' | 'run' | 'attack' | 'block' | 'hit' | 'cheer' | 'dead' | 'dodge' | 'charge';

/** Per-frame extras for `set` (§10.10 moves and hit feel). */
export interface WarriorExtra {
  /** The current swing is a charged heavy blow. */
  heavy?: boolean;
  /** Position in a light combo (1–3) of the current swing. */
  combo?: number;
  /** Hitstop: hold the pose this frame. */
  frozen?: boolean;
  /** Direction of a roll relative to the facing. */
  dodge?: 'F' | 'B' | 'L' | 'R';
}

const FADE = 0.22;
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const side = new THREE.Vector3();

/** What each gear (lib/game/units GEAR order) carries and how it swings. */
const GEAR_KIT: { props: PropName[]; attack: ClipName[]; idle: ClipName; scale: number }[] = [
  { props: ['sword'], attack: ['slash', 'attack'], idle: 'idle', scale: 1 }, // Talwar
  { props: ['spear'], attack: ['stab'], idle: 'idle2h', scale: 1 }, // Bhala
  { props: ['crossbow'], attack: ['shoot'], idle: 'idle', scale: 1 }, // Dhanush
  { props: ['sword', 'bigshield'], attack: ['bash', 'attack'], idle: 'idle', scale: 1 }, // Dhal
  { props: ['sword', 'ladder'], attack: ['attack', 'slash'], idle: 'idle', scale: 1 }, // Seedhi
  { props: ['greatsword', 'shield'], attack: ['heavy'], idle: 'idle2h', scale: 1.28 }, // Gaja
];
const ALL_PROPS: PropName[] = ['sword', 'greatsword', 'shield', 'bigshield', 'spear', 'crossbow', 'ladder'];
/** A swing plays its clip in this many seconds, so the blow lands ~0.2 s after the click. */
const SWING_SECS = 0.55;

interface Warrior {
  root: THREE.Object3D;
  gear: number;
  swing: number;
  propNodes: Partial<Record<PropName, THREE.Object3D>>;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<ClipName, THREE.AnimationAction>>;
  clip: ClipName | null;
  state: WarriorState;
  stateT: number;
  color: string;
  extra: WarriorExtra;
  frozen: boolean;
  rArm: THREE.Object3D | null;
  lArm: THREE.Object3D | null;
  meshes: THREE.Mesh[];
  baseMats: THREE.Material[];
  team: boolean[];
}

const tintCache = new Map<string, THREE.Material>();
/** `amount` ≥ 1 paints the mesh flat in the kingdom colour (capes: a texture tint stays red). */
function tinted(m: THREE.Material, color: string, amount: number): THREE.Material {
  const key = `${m.uuid}:${color}:${amount}`;
  let t = tintCache.get(key);
  if (!t) {
    t = m.clone();
    const sm = t as THREE.MeshStandardMaterial;
    if (amount >= 1) {
      sm.map = null;
      sm.color = new THREE.Color(color);
      sm.roughness = 0.75;
      sm.metalness = 0;
    } else if (sm.color) sm.color.lerp(new THREE.Color(color), amount);
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
      if (['death', 'death2', 'impact', 'impact2', 'blockhit', 'slash', 'slash2', 'attack', 'stab', 'stab1', 'heavy', 'spin', 'shoot', 'bash', 'dodgeF', 'dodgeB', 'dodgeL', 'dodgeR'].includes(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      actions[name as ClipName] = a;
    }
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const propNodes: Warrior['propNodes'] = {};
    for (const [k, n] of Object.entries(this.template.props)) {
      const o = n ? root.getObjectByName(n) : undefined;
      if (o) propNodes[k as PropName] = o;
    }
    const w: Warrior = {
      root,
      gear: -1,
      swing: -1,
      propNodes,
      team: meshes.map((m) => this.template.teamMeshes.some((t) => m.name.startsWith(t) || m.parent?.name === t)),
      mixer,
      actions,
      clip: null,
      state: 'idle',
      stateT: 0,
      color: '',
      extra: {},
      frozen: false,
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
    const kit = GEAR_KIT[w.gear] ?? GEAR_KIT[0];
    switch (s) {
      case 'walk':
        return pick('walk', 'run', 'idle');
      case 'run':
        return pick('run', 'walk', 'idle');
      case 'attack': {
        const melee = w.gear !== 2; // not the bow
        // a charged blow comes down two-handed; a light combo goes slash, backhand, spinning finisher
        if (melee && w.extra.heavy) return pick('heavy', 'attack', 'slash', 'idle');
        if (melee && w.gear !== 1 && w.gear !== 3 && w.extra.combo) {
          const chain: ClipName[] = ['slash', 'slash2', 'spin'];
          return pick(chain[(w.extra.combo - 1) % 3], 'slash', 'attack', 'idle');
        }
        if (w.gear === 1 && w.extra.combo === 2) return pick('stab1', 'stab', 'idle');
        // alternate the gear's swings blow by blow
        const want = kit.attack[Math.abs(w.swing + i) % kit.attack.length];
        return pick(want, 'slash', 'attack', 'idle');
      }
      case 'dodge':
        return pick(w.extra.dodge === 'B' ? 'dodgeB' : w.extra.dodge === 'L' ? 'dodgeL' : w.extra.dodge === 'R' ? 'dodgeR' : 'dodgeF', 'run', 'idle');
      case 'charge':
        // the two-handed chop, held at its wind-up (see `end`)
        return pick('heavy', 'block', 'idle');
      case 'block':
        return pick('block', 'idle');
      case 'hit':
        return w.state === 'hit' && w.clip === 'blockhit' ? 'blockhit' : pick((w.swing + i) % 2 ? 'impact2' : 'impact', 'impact', 'idle');
      case 'cheer':
        return pick('victory', 'idle');
      case 'dead':
        return pick(i % 2 ? 'death2' : 'death', 'death', 'idle');
      default:
        return pick(kit.idle, 'idle');
    }
  }

  private setGear(w: Warrior, gear: number) {
    w.gear = gear;
    const kit = GEAR_KIT[gear] ?? GEAR_KIT[0];
    for (const p of ALL_PROPS) {
      const n = w.propNodes[p];
      if (n) n.visible = kit.props.includes(p);
    }
  }

  /**
   * Places warrior `i` this frame. `tilt` leans it about its local x (used for faked deaths).
   * `gear` picks the props and swings; a new `swing` number restarts the attack clip (one blow
   * per strike); `blocked` plays the shield-hit reaction instead of the flinch.
   */
  set(
    i: number,
    x: number,
    y: number,
    z: number,
    face: number,
    state: WarriorState,
    color: string,
    scale = 1,
    tilt = 0,
    gear = 0,
    swing = 0,
    blocked = false,
    extra: WarriorExtra = {},
  ) {
    while (this.pool.length <= i) this.pool.push(this.make());
    this.used = Math.max(this.used, i + 1);
    const w = this.pool[i];
    if (gear !== w.gear) this.setGear(w, gear);
    const kit = GEAR_KIT[w.gear] ?? GEAR_KIT[0];
    const s = scale * (this.template.source === 'knight' ? kit.scale : 1);
    w.root.visible = s > 0.02;
    w.root.position.set(x, y, z);
    w.root.scale.setScalar(Math.max(s, 0.0001));
    if (color !== w.color) {
      w.color = color;
      w.meshes.forEach((m, k) => (m.material = tinted(w.baseMats[k], color, w.team[k] ? 1 : this.tintAmount)));
    }
    w.frozen = !!extra.frozen;
    w.extra = extra;
    const newSwing = state === 'attack' && swing !== w.swing;
    if (state === 'attack') w.swing = swing;
    if (state !== w.state || newSwing) {
      w.state = state;
      w.stateT = 0;
    }
    let clip = this.clipFor(w, state, i);
    if (state === 'hit' && blocked && w.actions.blockhit) clip = 'blockhit';
    if (clip !== w.clip || newSwing) {
      const next = clip ? w.actions[clip] : undefined;
      const prev = w.clip ? w.actions[w.clip] : undefined;
      if (next) {
        next.reset().setEffectiveWeight(1);
        const once = next.loop === THREE.LoopOnce;
        // swings are sped up to land fast (a heavy blow a little slower, a roll snappy); flinches stay natural
        const dur = next.getClip().duration;
        next.timeScale =
          state === 'attack' && once ? dur / (extra.heavy ? SWING_SECS * 1.25 : extra.combo === 3 ? SWING_SECS * 1.15 : SWING_SECS) : state === 'dodge' ? dur / 0.42 : state === 'charge' ? 0.55 : 1;
        next.fadeIn(state === 'attack' ? 0.06 : FADE).play();
        if (clip === 'walk' || clip === 'run') next.time = Math.random() * next.getClip().duration;
      }
      if (prev && prev !== next) prev.fadeOut(state === 'attack' ? 0.06 : FADE);
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
      // hitstop: the pose holds for a few frames on a landed blow
      if (w.frozen) continue;
      w.stateT += dt;
      const speed = w.state === 'run' && w.clip === 'walk' ? 1.6 : 1;
      w.mixer.update(dt * speed);
      // a heavy wind-up holds the weapon raised until the release
      if (w.state === 'charge' && w.clip === 'heavy') {
        const a = w.actions.heavy!;
        const hold = a.getClip().duration * 0.32;
        if (a.time > hold) a.time = hold;
      }
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
