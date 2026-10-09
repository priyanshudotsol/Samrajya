'use client';

/**
 * The viewer's warrior (docs/KINGDOM_UI.md §11.2). Mouse + keyboard → local simulation at 60 Hz
 * (walls, gate, ladder, island edge: exactly the rules the program applies) → `moveUnit`
 * published at 10 Hz, `strike` on every swing. The local pose is authoritative for rendering this
 * warrior, so it never rubber-bands; everyone else sees it on the next feed tick.
 *
 *   Left click ground   walk there (through the gate if the walls are in the way)
 *   Left click enemy    chase and attack it with your weapon until it falls
 *   Right drag / wheel  turn / zoom the camera
 *   W A S D / arrows    walk (screen-relative)          Shift  run
 *   Space               light blow (chains a 3-hit combo)   F   raise your guard (hold)
 *   E (hold, release)   charge and land a heavy blow        Q   dodge roll (stamina)
 *   1 – 6               switch weapon                   G      rally your kingdom at the cursor
 *   H                   hide / show the side panels
 */
import { useEffect } from 'react';
import * as THREE from 'three';
import { toast } from 'sonner';

import type { GameActions } from '@/lib/actions/types';
import { ensureLocalUnit } from '@/lib/actions/local-units';
import {
  COMBO_WINDOW,
  DODGE_COOLDOWN,
  DODGE_DIST,
  DODGE_SECS,
  HEAVY_CHARGE_MIN,
  STAMINA_BLOCKED,
  STAMINA_DODGE,
  STAMINA_HEAVY,
  STAMINA_MAX,
  STAMINA_REGEN,
  weaponOf,
} from '@/lib/game/combat';
import { playSfx } from '@/lib/audio';
import { markSwing } from './fx';
import { KINGDOMS } from '@/lib/game/factions';
import {
  ACTION,
  CLIMB_SPEED,
  crossesFort,
  GEAR,
  GEARS,
  gearAllowed,
  hexDepth,
  isMarching,
  marchPose,
  MOVE_INTERVAL,
  planRoute,
  RUN_SPEED,
  stepUnit,
  WALK_SPEED,
  type Gear,
  type Unit,
  type UnitAction,
} from '@/lib/game/units';
import { moveRulesFor } from '@/lib/mock/mockGame';
import { generateRealm, groundY, type RealmLayout } from '@/lib/realm/layout';
import { useRealmUi } from '@/lib/realm/ui-store';
import { isMockMode, useGame } from '@/lib/store/game';

import { cameraState } from './cameraState';

export interface LocalPose {
  /** The viewer has a warrior and it is drawn from this pose. */
  active: boolean;
  wallet: string | null;
  at: number;
  x: number;
  z: number;
  facing: number;
  action: UnitAction;
  moving: boolean;
  climbing: boolean;
  /** Is the player currently steering it (keys, a click order, a fight)? */
  steering: boolean;
  /** Direction of the current roll relative to the facing (for the clip). */
  dodge?: 'F' | 'B' | 'L' | 'R';
}

export const localPose: LocalPose = {
  active: false,
  wallet: null,
  at: 0,
  x: 0,
  z: 0,
  facing: 0,
  action: ACTION.IDLE,
  moving: false,
  climbing: false,
  steering: false,
};

/** What the mouse is doing, for the renderer (target rings, the move marker) and the HUD. */
export const control = {
  /** Realm the viewer is looking at. */
  viewing: 0,
  /** Cursor on the ground of the viewed realm. */
  cursor: { valid: false, x: 0, z: 0 },
  /** Enemy under the cursor. */
  hover: null as string | null,
  /** Enemy you ordered an attack on. */
  target: null as string | null,
  /** Walk order (the final destination; waypoints are internal). */
  goal: null as { x: number; z: number } | null,
  /** Why the last order could not be carried out (shown briefly). */
  notice: null as { text: string; at: number } | null,
  /** Your next strike is allowed at (unix secs, local mirror of the weapon cooldown). */
  readyAt: 0,
  /** Is the player's warrior in the viewed realm and steerable right now? */
  here: false,
  /** performance.now() when Esc last cancelled an order (so the page doesn't also leave). */
  escAt: -1e9,
  /** Stamina (0..STAMINA_MAX): rolls, heavy blows and blows taken on the guard spend it. */
  stamina: STAMINA_MAX,
  /** Guard broken (stamina ran out on the guard): no guard until this performance.now(). */
  guardBrokenUntil: 0,
  /** Winding up a heavy blow since this performance.now() (0 = not charging). */
  chargeFrom: 0,
  /** Light combo: position of the last blow and when it was thrown (performance.now()). */
  combo: 0,
  comboAt: 0,
  /** Rolling until this performance.now(), in direction (dx, dz). */
  rollUntil: 0,
  rollDir: { x: 0, z: 0 },
  lastRollAt: -1e9,
};

/** Internal state for tests and debugging. */
export const debugControl = () => ({ waypoints: waypoints.map((w) => ({ ...w })), keys: [...keys], stuckFor });

/** Screen positions of drawn warriors, written by Units every frame (for click picking). */
export const drawn = new Map<string, { x: number; y: number; z: number; faction: number; alive: boolean }>();

const keys = new Set<string>();
let actions: GameActions | null = null;
let lastPublished = { x: NaN, z: NaN, facing: NaN, action: -1, at: 0 };
let lastPublishedAt = 0;
let nextPublishAt = 0;
let raf = 0;
let lastT = 0;
let swingUntil = 0;
let waypoints: { x: number; z: number }[] = [];
let stuckFor = 0;
let wasDead = false;
let rerouteAt = 0;
/** Wallet the local pose was seeded from (re-seed when the store's unit teleports: march, rout). */
let seededFrom: { wallet: string; at: number } | null = null;

const typing = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

const notify = (text: string) => {
  control.notice = { text, at: performance.now() };
};

// ---------------------------------------------------------------------------------------------
// Picking: screen → ground of the viewed realm, screen → warrior
// ---------------------------------------------------------------------------------------------

const layouts = new Map<number, RealmLayout>();
const layoutOf = (t: number) => {
  let l = layouts.get(t);
  if (!l) {
    l = generateRealm(t);
    layouts.set(t, l);
  }
  return l;
};
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const proj = new THREE.Vector3();

function groundAt(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): { x: number; z: number } | null {
  const cam = cameraState.camera;
  if (!cam) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  const layout = layoutOf(control.viewing);
  // intersect a plane at the ground height, then refine twice with the terrain under the hit
  let y = groundY(layout, 0, 0);
  for (let i = 0; i < 3; i++) {
    plane.constant = -y;
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    y = groundY(layout, hit.x, hit.z);
  }
  return { x: hit.x, z: hit.z };
}

function warriorAt(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement, enemiesOf: number | null): string | null {
  const cam = cameraState.camera;
  if (!cam) return null;
  const r = canvas.getBoundingClientRect();
  let best: string | null = null;
  let bestD = 34; // px
  for (const [w, p] of drawn) {
    if (!p.alive || (enemiesOf !== null && p.faction === enemiesOf)) continue;
    proj.set(p.x, p.y + 0.3, p.z).project(cam);
    if (proj.z > 1) continue;
    const sx = ((proj.x + 1) / 2) * r.width + r.left;
    const sy = ((1 - proj.y) / 2) * r.height + r.top;
    const d = Math.hypot(sx - e.clientX, sy - e.clientY);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------------------------

/** Route to (x, z) round the fort and through the gate (lib/game/units.ts `planRoute`). */
function routeTo(unit: Unit, to: { x: number; z: number }, quiet = false): { x: number; z: number }[] {
  const { game, units } = useGame.getState();
  const rules = game ? moveRulesFor(game, units, unit, localPose.at, Date.now() / 1000) : { gateOpen: false, canClimb: false };
  const r = planRoute({ x: localPose.x, z: localPose.z }, to, rules);
  if (r.blocked && !quiet) {
    notify(
      hexDepth(localPose.x, localPose.z) < 0
        ? 'The gate is shut to you from inside.'
        : 'The gate stays shut while a single defender lives. Fight them at the gate, or shoot over the walls with a Dhanush.',
    );
  }
  return r.route;
}

function myUnit(): Unit | undefined {
  const { units, wallet } = useGame.getState();
  return wallet ? units.find((u) => u.wallet === wallet) : undefined;
}

function orderMove(to: { x: number; z: number }) {
  const u = myUnit();
  if (!u || !control.here) return;
  control.target = null;
  control.goal = to;
  waypoints = routeTo(u, to);
  stuckFor = 0;
}

function orderAttack(wallet: string) {
  if (!control.here) return;
  control.target = wallet;
  control.goal = null;
  waypoints = [];
  rerouteAt = 0;
}

/**
 * Aim assist (soft lock): the enemy your blow is meant for, if one stands in reach and roughly
 * in front (within 80° of `face`), else the nearest in reach. Latency and a top-down view make
 * exact aiming unfun; the program still checks the arc from the snapped facing.
 */
function assistAim(face: number, reach: number): number {
  const { units, wallet } = useGame.getState();
  const me = units.find((u) => u.wallet === wallet);
  if (!me) return face;
  let best: { a: number; score: number } | null = null;
  for (const o of units) {
    if (o.faction === me.faction || o.at !== localPose.at || o.hp <= 0) continue;
    const p = drawn.get(o.wallet) ?? o;
    const dx = p.x - localPose.x;
    const dz = p.z - localPose.z;
    const d = Math.hypot(dx, dz);
    if (d > reach + 0.35) continue;
    const a = Math.atan2(dx, dz);
    const off = Math.abs(Math.atan2(Math.sin(a - face), Math.cos(a - face)));
    const score = d + (off > 1.4 ? 3 : off);
    if (!best || score < best.score) best = { a, score };
  }
  return best ? best.a : face;
}

/** Swing / shoot towards `face` now if the weapon is ready (light blows chain into a combo). */
function strike(face: number, heavy = false) {
  const u = myUnit();
  if (!u || !actions || !control.here) return;
  const now = Date.now() / 1000;
  if (now < control.readyAt || performance.now() < control.rollUntil) return;
  const w = weaponOf(u.gear);
  control.readyAt = now + w.cooldown * (heavy ? 1.4 : 1);
  const t = performance.now();
  let combo: number | undefined;
  if (!heavy && !w.ranged) {
    control.combo = t - control.comboAt < COMBO_WINDOW * 1000 + w.cooldown * 1000 ? (control.combo % 3) + 1 : 1;
    control.comboAt = t;
    combo = control.combo;
  } else control.combo = 0;
  face = assistAim(face, w.range);
  localPose.facing = face;
  swingUntil = t + (heavy ? 520 : 380);
  markSwing(u.wallet, { heavy, combo });
  actions.strike(localPose.x, localPose.z, face, { heavy, combo }).catch(() => {});
}

/** E pressed: start winding up a heavy blow (everyone sees the wind-up). */
function startCharge() {
  const u = myUnit();
  if (!u || !control.here || control.chargeFrom || weaponOf(u.gear).ranged) return;
  if (control.stamina < STAMINA_HEAVY) {
    notify('Too tired for a heavy blow.');
    return;
  }
  control.chargeFrom = performance.now();
  playSfx('unsheathe', { volume: 0.5 });
}

/** E released: land the heavy blow if it was charged long enough, else let it go. */
function releaseCharge() {
  if (!control.chargeFrom) return;
  const held = (performance.now() - control.chargeFrom) / 1000;
  control.chargeFrom = 0;
  if (held < HEAVY_CHARGE_MIN) return;
  control.stamina -= STAMINA_HEAVY;
  const face = control.cursor.valid ? Math.atan2(control.cursor.x - localPose.x, control.cursor.z - localPose.z) : localPose.facing;
  control.readyAt = 0;
  strike(face, true);
}

/** Q: roll in the direction you are steering (or back from where you face). */
function dodge() {
  const u = myUnit();
  const t = performance.now();
  if (!u || !control.here || t < control.rollUntil) return;
  if (t - control.lastRollAt < DODGE_COOLDOWN * 1000) return;
  if (control.stamina < STAMINA_DODGE) {
    notify('Too tired to roll.');
    return;
  }
  control.stamina -= STAMINA_DODGE;
  control.chargeFrom = 0;
  let ix = 0;
  let iz = 0;
  if (keys.has('w') || keys.has('arrowup')) iz += 1;
  if (keys.has('s') || keys.has('arrowdown')) iz -= 1;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  let dx: number;
  let dz: number;
  if (ix || iz) {
    const yaw = cameraState.yaw;
    const l = Math.hypot(ix, iz);
    dx = (Math.sin(yaw) * iz + Math.cos(yaw) * ix) / l;
    dz = (Math.cos(yaw) * iz - Math.sin(yaw) * ix) / l;
  } else {
    dx = -Math.sin(localPose.facing);
    dz = -Math.cos(localPose.facing);
  }
  const rel = Math.atan2(Math.sin(Math.atan2(dx, dz) - localPose.facing), Math.cos(Math.atan2(dx, dz) - localPose.facing));
  localPose.dodge = Math.abs(rel) < Math.PI / 4 ? 'F' : Math.abs(rel) > (3 * Math.PI) / 4 ? 'B' : rel > 0 ? 'L' : 'R';
  control.rollDir = { x: dx, z: dz };
  control.rollUntil = t + DODGE_SECS * 1000;
  control.lastRollAt = t;
  control.target = null;
  waypoints = [];
  playSfx('step', { volume: 0.9 });
  // tell the battlefield now: the roll's untouchable window starts with this move
  if (actions) actions.moveUnit(localPose.x, localPose.z, localPose.facing, ACTION.DODGE).catch(() => {});
}

function switchGear(gear: Gear) {
  const u = myUnit();
  const g = useGame.getState().game;
  if (!u || !g || !actions || u.gear === gear) return;
  if (!gearAllowed(gear, g.factions[u.faction].powers)) {
    toast.error(`${GEARS[gear].name} needs the Gaja Sena power`);
    return;
  }
  playSfx('unsheathe', { volume: 0.7 });
  actions.setGear(gear).catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
}

function rallyAtCursor() {
  if (!actions || !control.cursor.valid) return;
  const me = useGame.getState().me;
  if (!me || me.status !== 'Active') return;
  const t = control.viewing;
  actions
    .rally(t, control.cursor.x, control.cursor.z)
    .then(() => toast.success(`Rally sent to ${KINGDOMS[me.faction].name} — your kingdom gathers there`))
    .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
}

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

function onKeyDown(e: KeyboardEvent) {
  if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (MOVE_KEYS.includes(k) || k === ' ' || k === 'f' || k === 'shift' || k === 'e') {
    keys.add(k);
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (MOVE_KEYS.includes(k)) {
      control.goal = null;
      control.target = null;
      waypoints = [];
    }
  }
  if (e.repeat) return;
  if (k === ' ') {
    const face = control.cursor.valid
      ? Math.atan2(control.cursor.x - localPose.x, control.cursor.z - localPose.z)
      : localPose.facing;
    strike(face);
  }
  if (k === 'e') startCharge();
  if (k === 'q') dodge();
  if (k >= '1' && k <= '6') switchGear((Number(k) - 1) as Gear);
  if (k === 'g') rallyAtCursor();
  if (k === 'h') {
    const ui = useRealmUi.getState();
    ui.setHudHidden(!ui.hudHidden);
  }
  if (k === 'escape') {
    if (control.target || control.goal) control.escAt = performance.now();
    control.target = null;
    control.goal = null;
    waypoints = [];
  }
}
function onKeyUp(e: KeyboardEvent) {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (k === 'e') releaseCharge();
}

/** A blow landed on your warrior: it is shoved back for real (walls still hold), guards cost stamina. */
function onKnock(e: Event) {
  const { fromX, fromZ, dist } = (e as CustomEvent<{ fromX: number; fromZ: number; dist: number }>).detail;
  pendingKnock = { fromX, fromZ, dist, t: performance.now() };
}
function onHurt(e: Event) {
  const { blocked } = (e as CustomEvent<{ blocked: boolean }>).detail;
  if (!blocked) {
    control.chargeFrom = 0; // a wound interrupts a wind-up
    return;
  }
  control.stamina -= STAMINA_BLOCKED;
  if (control.stamina <= 0) {
    control.stamina = 0;
    control.guardBrokenUntil = performance.now() + 1500;
    notify('Guard broken!');
  }
}
let pendingKnock: { fromX: number; fromZ: number; dist: number; t: number } | null = null;
function onBlur() {
  keys.clear();
  drag = null;
}

let drag: { button: number; x: number; y: number; moved: boolean; yaw: number; pitch: number } | null = null;

function onPointerDown(e: PointerEvent) {
  const canvas = e.target as HTMLElement;
  if (!(canvas instanceof HTMLCanvasElement)) return;
  if (!control.here) return; // spectating: the orbit camera owns the mouse
  drag = { button: e.button, x: e.clientX, y: e.clientY, moved: false, yaw: cameraState.follow.yaw, pitch: cameraState.follow.pitch };
}

function onPointerMove(e: PointerEvent) {
  const canvas = e.target;
  if (drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.button === 2 && drag.moved) {
      cameraState.follow.yaw = drag.yaw - dx * 0.006;
      cameraState.follow.turnedAt = performance.now();
      cameraState.follow.pitch = Math.min(1.35, Math.max(0.7, drag.pitch + dy * 0.004));
    }
  }
  if (!(canvas instanceof HTMLCanvasElement)) {
    control.cursor.valid = false;
    control.hover = null;
    return;
  }
  const g = groundAt(e, canvas);
  if (g) {
    control.cursor.valid = true;
    control.cursor.x = g.x;
    control.cursor.z = g.z;
  } else control.cursor.valid = false;
  const me = useGame.getState().me;
  const myFaction = me && me.status === 'Active' ? me.faction : null;
  control.hover = myFaction !== null ? warriorAt(e, canvas, myFaction) : null;
  canvas.style.cursor = control.here ? (control.hover ? 'crosshair' : 'pointer') : '';
}

function onPointerUp(e: PointerEvent) {
  const d = drag;
  drag = null;
  if (!d || d.moved || !control.here) return;
  const canvas = e.target;
  if (!(canvas instanceof HTMLCanvasElement)) return;
  if (d.button !== 0) return;
  const me = useGame.getState().me;
  const enemy = me ? warriorAt(e, canvas, me.faction) : null;
  if (enemy) {
    orderAttack(enemy);
    return;
  }
  const g = groundAt(e, canvas);
  if (g) orderMove(g);
}

function onWheel(e: WheelEvent) {
  if (!(e.target instanceof HTMLCanvasElement) || !control.here) return;
  cameraState.follow.dist = Math.min(14, Math.max(3.5, cameraState.follow.dist * (1 + Math.sign(e.deltaY) * 0.1)));
}

function onContextMenu(e: MouseEvent) {
  if (e.target instanceof HTMLCanvasElement) e.preventDefault();
}

// ---------------------------------------------------------------------------------------------
// The 60 Hz loop
// ---------------------------------------------------------------------------------------------

function idle() {
  localPose.active = false;
  localPose.steering = false;
  cameraState.mine.active = false;
  control.here = false;
}

function tick(t: number) {
  raf = requestAnimationFrame(tick);
  // slow frames still move at the right speed (sub-stepped below, so walls stay solid)
  const dt = Math.min(0.25, (t - lastT) / 1000 || 0);
  lastT = t;
  const state = useGame.getState();
  const { me, units, game, wallet, gates } = state;
  if (wallet && !isMockMode()) ensureLocalUnit(wallet);
  const now = Date.now() / 1000;
  const unit = wallet ? units.find((u) => u.wallet === wallet) : undefined;
  const live = !!game && !!me && me.status === 'Active' && !!unit && unit.hp > 0;
  if (!live || !unit || !game) {
    if (unit && unit.hp <= 0) wasDead = true;
    idle();
    return;
  }
  // (re)seed from the store when the warrior teleported (first sight, march landed, routed, respawned)
  const marching = isMarching(unit, now);
  const jumped =
    !Number.isNaN(lastPublished.x) && now - lastPublishedAt > 1.2 && Math.hypot(unit.x - lastPublished.x, unit.z - lastPublished.z) > 1.0;
  if (!seededFrom || seededFrom.wallet !== unit.wallet || seededFrom.at !== unit.at || marching || jumped || wasDead) {
    const p = marchPose(unit, now);
    localPose.wallet = unit.wallet;
    localPose.at = p.at;
    localPose.x = p.x;
    localPose.z = p.z;
    localPose.facing = p.facing;
    localPose.action = marching ? ACTION.WALK : unit.action;
    seededFrom = { wallet: unit.wallet, at: unit.at };
    lastPublished = { x: p.x, z: p.z, facing: p.facing, action: localPose.action, at: p.at };
    lastPublishedAt = now;
    wasDead = false;
    control.goal = null;
    control.target = null;
    waypoints = [];
    if (marching) {
      localPose.active = true;
      localPose.moving = true;
      localPose.steering = false;
      cameraState.mine.active = false;
      control.here = false;
      return;
    }
  }
  localPose.active = true;
  control.here = localPose.at === control.viewing;
  if (!control.here) {
    cameraState.mine.active = false;
    return;
  }

  const rules = moveRulesFor(game, units, unit, localPose.at, now);
  const tMs = performance.now();
  const rolling = tMs < control.rollUntil;
  const charging = control.chargeFrom > 0;
  const run = keys.has('shift') && !charging;
  const block = keys.has('f') && tMs >= control.guardBrokenUntil && !rolling && !charging;
  // stamina comes back, slower behind a raised guard, not at all while winding up
  control.stamina = Math.min(STAMINA_MAX, control.stamina + STAMINA_REGEN * dt * (block ? 0.3 : charging ? 0 : 1));
  // shoved by a blow: slide back through the walls' rules
  if (pendingKnock) {
    const k = pendingKnock;
    pendingKnock = null;
    const kd = Math.hypot(localPose.x - k.fromX, localPose.z - k.fromZ) || 1;
    for (let i = 0; i < 4; i++) {
      const r = stepUnit(localPose.x, localPose.z, (((localPose.x - k.fromX) / kd) * k.dist) / 4, (((localPose.z - k.fromZ) / kd) * k.dist) / 4, rules);
      localPose.x = r.x;
      localPose.z = r.z;
    }
  }
  const speed = rolling
    ? DODGE_DIST / DODGE_SECS
    : (localPose.climbing ? CLIMB_SPEED : run ? RUN_SPEED : WALK_SPEED) * (block ? 0.45 : charging ? 0.35 : 1);

  // 1. keyboard (screen-relative)
  let ix = 0;
  let iz = 0;
  if (keys.has('w') || keys.has('arrowup')) iz += 1;
  if (keys.has('s') || keys.has('arrowdown')) iz -= 1;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  let dx = 0;
  let dz = 0;
  const len = Math.hypot(ix, iz);
  if (len > 0) {
    ix /= len;
    iz /= len;
    const yaw = cameraState.yaw;
    dx = Math.sin(yaw) * iz + Math.cos(yaw) * ix;
    dz = Math.cos(yaw) * iz - Math.sin(yaw) * ix;
  }

  // a roll overrides everything
  if (rolling) {
    dx = control.rollDir.x;
    dz = control.rollDir.z;
  }

  // 2. attack order: chase the target, strike when in reach
  if (!rolling && len === 0 && control.target) {
    const foe = units.find((u) => u.wallet === control.target);
    const pos = foe ? (drawn.get(foe.wallet) ?? foe) : null;
    if (!foe || foe.hp <= 0 || foe.at !== localPose.at || isMarching(foe, now) || !pos) {
      if (foe && foe.hp <= 0) notify('Enemy down.');
      control.target = null;
    } else {
      const w = weaponOf(unit.gear);
      const ddx = pos.x - localPose.x;
      const ddz = pos.z - localPose.z;
      const dist = Math.hypot(ddx, ddz);
      const reach = w.range * (w.ranged ? 0.9 : 0.8);
      if (dist > reach) {
        // straight at them if the way is clear, else round the walls / through the gate
        if (t >= rerouteAt) {
          rerouteAt = t + 400;
          const clear = !crossesFort({ x: localPose.x, z: localPose.z }, pos) || (hexDepth(localPose.x, localPose.z) < 0 && hexDepth(pos.x, pos.z) < 0);
          waypoints = clear ? [] : routeTo(unit, { x: pos.x, z: pos.z }, true);
        }
        const wp = waypoints[0];
        if (wp && Math.hypot(wp.x - localPose.x, wp.z - localPose.z) < 0.08) waypoints.shift();
        const aim = waypoints[0] ?? pos;
        const ax = aim.x - localPose.x;
        const az = aim.z - localPose.z;
        const ad = Math.hypot(ax, az) || 1;
        dx = ax / ad;
        dz = az / ad;
      } else {
        waypoints = [];
        strike(Math.atan2(ddx, ddz));
      }
    }
  }

  // 3. walk order: follow the waypoints
  if (!rolling && len === 0 && !control.target && waypoints.length) {
    const wp = waypoints[0];
    const ddx = wp.x - localPose.x;
    const ddz = wp.z - localPose.z;
    const dist = Math.hypot(ddx, ddz);
    if (dist < 0.08) {
      waypoints.shift();
      if (!waypoints.length) control.goal = null;
    } else {
      dx = ddx / dist;
      dz = ddz / dist;
      // slow down on arrival so we don't overshoot
      if (dist < speed * dt) {
        dx *= dist / (speed * dt);
        dz *= dist / (speed * dt);
      }
    }
  }

  let moving = false;
  let climbing = false;
  if (dx !== 0 || dz !== 0) {
    const sx = localPose.x;
    const sz = localPose.z;
    const steps = Math.ceil(dt / 0.05);
    for (let i = 0; i < steps; i++) {
      const r = stepUnit(localPose.x, localPose.z, (dx * speed * dt) / steps, (dz * speed * dt) / steps, rules);
      climbing = climbing || r.climbing;
      localPose.x = r.x;
      localPose.z = r.z;
    }
    const moved = Math.hypot(localPose.x - sx, localPose.z - sz);
    moving = moved > 1e-4;
    if (!(block && control.cursor.valid) && !rolling && !charging) localPose.facing = Math.atan2(dx, dz);
    // an order that makes no progress (wall, shut gate) gives up after a moment
    if ((waypoints.length || control.target) && moved < speed * dt * 0.2) {
      stuckFor += dt;
      if (stuckFor > 0.6) {
        if (!control.notice || performance.now() - control.notice.at > 2500) notify('Blocked — the walls are in the way.');
        waypoints = [];
        control.goal = null;
        control.target = null;
        stuckFor = 0;
      }
    } else stuckFor = 0;
  }
  // guard up or winding up: face the cursor
  if ((block || charging) && control.cursor.valid) localPose.facing = Math.atan2(control.cursor.x - localPose.x, control.cursor.z - localPose.z);

  const swinging = performance.now() < swingUntil;
  localPose.moving = moving;
  localPose.climbing = climbing;
  localPose.steering = moving || swinging || block || !!control.target;
  localPose.action = rolling
    ? ACTION.DODGE
    : charging
      ? ACTION.CHARGE
      : climbing
        ? ACTION.CLIMB
        : swinging
          ? ACTION.ATTACK
          : block
            ? ACTION.BLOCK
            : moving
              ? run
                ? ACTION.RUN
                : ACTION.WALK
              : ACTION.IDLE;

  cameraState.mine.active = true;
  cameraState.mine.x = localPose.x;
  cameraState.mine.z = localPose.z;
  cameraState.mine.facing = localPose.facing;
  cameraState.mine.moving = moving;
  if (localPose.steering) cameraState.mine.lastMoveAt = t;

  // publish at ≤ 10 Hz when something changed (strikes publish themselves)
  if (actions && t >= nextPublishAt) {
    const changed =
      Math.abs(localPose.x - lastPublished.x) > 0.01 ||
      Math.abs(localPose.z - lastPublished.z) > 0.01 ||
      Math.abs(localPose.facing - lastPublished.facing) > 0.05 ||
      localPose.action !== lastPublished.action;
    if (changed) {
      nextPublishAt = t + MOVE_INTERVAL * 1000;
      lastPublished = { x: localPose.x, z: localPose.z, facing: localPose.facing, action: localPose.action, at: localPose.at };
      lastPublishedAt = now;
      actions.moveUnit(localPose.x, localPose.z, localPose.facing, localPose.action).catch(() => {});
    }
  }
}

/** Mounts the mouse + keyboard controller for the viewer's warrior (DOM side, outside the canvas). */
export function useUnitController(next: GameActions | null, territory: number) {
  useEffect(() => {
    actions = next;
  }, [next]);
  useEffect(() => {
    control.viewing = territory;
    control.goal = null;
    control.target = null;
    waypoints = [];
  }, [territory]);
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('samrajya:knock', onKnock);
    window.addEventListener('samrajya:hurt', onHurt);
    lastT = performance.now();
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('samrajya:knock', onKnock);
      window.removeEventListener('samrajya:hurt', onHurt);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('contextmenu', onContextMenu);
      cancelAnimationFrame(raf);
      keys.clear();
      idle();
      seededFrom = null;
    };
  }, []);
}

/** Is this unit the locally steered one (so the renderer draws it from `localPose`)? */
export const isLocal = (u: Unit) => localPose.active && localPose.wallet === u.wallet;
