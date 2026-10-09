/**
 * Run: pnpm test. Combat rules (docs/ARCHITECTURE.md §10.7). The Rust `strike` should mirror
 * these once Step 17 lands.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMockState, gateOpenFor, ixAllocate, ixJoin, ixStrike, moveRulesFor, stepMock, unitOf } from '../mock/mockGame';
import { GATE_HP, GATE_POINT, INSIDE_DEFENCE, RESPAWN_SECS, resolveStrike, WEAPONS } from './combat';
import { tacticalFactors } from './tactics';
import { ACTION, GEAR, isInside, newUnit, WALL_APOTHEM, zoneOf, type Unit } from './units';

const at = (wallet: string, faction: number, x: number, z: number, patch: Partial<Unit> = {}): Unit => ({ ...newUnit(wallet, faction, 0, 0), x, z, ...patch });
const NORTH = 0; // facing +z

test('a sword hits the enemy in front, not the one behind or a friend', () => {
  const me = at('me', 1, 0, 4);
  const front = at('front', 0, 0, 4.4);
  const behind = at('behind', 0, 0, 3.6);
  const friend = at('friend', 1, 0.1, 4.3);
  const r = resolveStrike(me, NORTH, [me, front, behind, friend], 0, GATE_HP, 0);
  assert.deepEqual(r.hits.map((h) => h.wallet), ['front']);
  assert.equal(r.hits[0].damage, WEAPONS[GEAR.TALWAR].damage);
});

test('cleave: a talwar catches two, a spear one but further', () => {
  const sword = at('me', 1, 0, 4);
  const a = at('a', 0, -0.15, 4.4);
  const b = at('b', 0, 0.15, 4.45);
  const c = at('c', 0, 0, 4.85);
  assert.equal(resolveStrike(sword, NORTH, [sword, a, b, c], 0, GATE_HP, 0).hits.length, 2);
  const spear = { ...sword, gear: GEAR.BHALA as Unit['gear'] };
  const far = resolveStrike(spear, NORTH, [spear, c], 0, GATE_HP, 0);
  assert.deepEqual(far.hits.map((h) => h.wallet), ['c']);
});

test('arrows fly down the line, stop at the first enemy, and arc over the walls', () => {
  const archer = at('me', 1, 0, 6, { gear: GEAR.DHANUSH });
  const near = at('near', 0, 0.1, 5.0); // facing south (π): -z
  const far = at('far', 0, 0, 4.4);
  const r = resolveStrike(archer, Math.PI, [archer, near, far], 0, GATE_HP, 0);
  assert.deepEqual(r.hits.map((h) => h.wallet), ['near']);
  assert.ok(r.arrowEnd && Math.abs(r.arrowEnd.z - 5.0) < 0.2);
  // a defender inside the walls, behind stone: the arrow lobs over (§10.10)
  const inside = at('inside', 0, 1.6, 0.4);
  const archer2 = at('me2', 1, 4.2, 1.1, { gear: GEAR.DHANUSH });
  const face = Math.atan2(inside.x - archer2.x, inside.z - archer2.z);
  assert.equal(resolveStrike(archer2, face, [archer2, inside], 0, GATE_HP, 0).hits.length, 1);
  // but a blade never cuts through stone: a spear outside the side wall, a defender just inside
  const spear = at('spear', 1, 2.25, 0.95, { gear: GEAR.BHALA });
  const behind = at('behind', 0, 1.7, 0.6);
  const f2 = Math.atan2(behind.x - spear.x, behind.z - spear.z);
  assert.equal(resolveStrike(spear, f2, [spear, behind], 0, GATE_HP, 0).hits.length, 0);
});

test('a raised shield takes a fraction of the blow, a Dhal almost nothing', () => {
  const me = at('me', 1, 0, 4);
  const guard = at('g', 0, 0, 4.4, { action: ACTION.BLOCK, facing: Math.PI });
  const dhal = { ...guard, gear: GEAR.DHAL as Unit['gear'] };
  const full = WEAPONS[GEAR.TALWAR].damage;
  const hTal = resolveStrike(me, NORTH, [me, guard], 0, GATE_HP, 0).hits[0];
  const hDhal = resolveStrike(me, NORTH, [me, dhal], 0, GATE_HP, 0).hits[0];
  assert.ok(hTal.blocked && hTal.damage < full);
  assert.ok(hDhal.damage < hTal.damage);
  // guarding the wrong way does nothing
  const turned = { ...guard, facing: 0 };
  assert.equal(resolveStrike(me, NORTH, [me, turned], 0, GATE_HP, 0).hits[0].damage, full);
});

test('gates are not battered open any more (only killing the garrison opens them)', () => {
  const ram = at('ram', 1, 0, WALL_APOTHEM + 0.45, { gear: GEAR.GAJA });
  assert.equal(resolveStrike(ram, Math.PI, [ram], 0, GATE_HP, 0).gateDamage, 0);
  void GATE_POINT;
  void WEAPONS;
});

test('mock: strikes wound, kill, the fallen stay down until the bell and a cleared fort falls', () => {
  const s = createMockState(1000, { initialBotsPerKingdom: 0, rand: () => 0.5 });
  const pa = ixJoin(s, 'attacker', 1, s.game.config.ticket);
  ixJoin(s, 'defender', 0, s.game.config.ticket);
  const a = unitOf(s, 'attacker')!;
  const d = unitOf(s, 'defender')!;
  // put both in Hastinapur's courtyard, face to face
  Object.assign(a, { at: 0, x: 0, z: 1.2, facing: Math.PI });
  Object.assign(d, { at: 0, x: 0, z: 0.8, hp: 20 });
  assert.equal(tacticalFactors(s.game, s.units, 0, s.now).heads.defendersInside, 1);
  ixStrike(s, pa, a.x, a.z, Math.PI);
  // a defender inside its own walls takes 15% less
  assert.equal(d.hp, 20 - Math.round(WEAPONS[GEAR.TALWAR].damage * INSIDE_DEFENCE));
  assert.throws(() => ixStrike(s, pa, a.x, a.z, Math.PI)); // cooldown
  s.now += 1;
  ixStrike(s, pa, a.x, a.z, Math.PI);
  assert.equal(d.hp, 0);
  assert.equal(d.action, ACTION.DEAD);
  assert.ok(s.events.some((e) => e.kind === 'kill' && e.target === 'defender'));
  // the dead don't hold the walls: the gate opens and the fort counts as abandoned
  assert.equal(tacticalFactors(s.game, s.units, 0, s.now).heads.defendersInside, 0);
  assert.equal(gateOpenFor(s.game, s.units, a, 0, s.now, s.gates), true);
  // out of the fight until the bell (the attacker is the human: no bot orders for it)
  stepMock(s, s.now + RESPAWN_SECS + 0.1, () => 0.5, 'attacker');
  assert.equal(d.hp, 0);
  // the squad commits but waits at the camp instead of walking in: the empty fort still holds,
  // because no attacker stands at the gate when the bell rings
  a.at = 1; // home, so the order teleports it to the camp
  ixAllocate(s, pa, 0, pa.shares);
  assert.equal(a.at, 0);
  assert.equal(zoneOf(a.x, a.z) === 'gate' || isInside(a.x, a.z), false);
  let t = s.now;
  for (let i = 0; i < 400 && (s.game.epoch === 1 || s.game.pendingVrf || d.hp <= 0); i++) stepMock(s, (t += 0.5), () => 0.5, 'attacker');
  const e = s.game.battleLog.at(-1)!;
  assert.equal(e.byFight, true);
  assert.equal(e.winner, 0);
  assert.equal(s.game.territoryOwner[0], 0);
  // and the fallen defender is back on its feet at home after the bell
  assert.ok(d.hp > 0);
  assert.equal(d.at, 0);
});

test('mock: the gate stays shut to enemies while one defender lives anywhere in the realm', () => {
  const s = createMockState(1000, { initialBotsPerKingdom: 0, rand: () => 0.5 });
  const pa = ixJoin(s, 'ram', 1, s.game.config.ticket);
  ixJoin(s, 'guard', 0, s.game.config.ticket);
  const a = unitOf(s, 'ram')!;
  const guard = unitOf(s, 'guard')!;
  Object.assign(a, { at: 0, x: 0, z: WALL_APOTHEM + 0.45, gear: GEAR.SEEDHI });
  // the last defender stands outside the walls, in the field: the fort is still held
  Object.assign(guard, { at: 0, x: 3.5, z: -2.5 });
  assert.equal(gateOpenFor(s.game, s.units, a, 0, s.now, s.gates), false);
  // no ladder climbs it either
  assert.equal(moveRulesFor(s.game, s.units, a, 0, s.now).canClimb, false);
  // the owner's own members always pass
  assert.equal(gateOpenFor(s.game, s.units, guard, 0, s.now, s.gates), true);
  // kill the last one: the gate swings open
  guard.hp = 0;
  guard.deadUntil = s.now + 30;
  assert.equal(gateOpenFor(s.game, s.units, a, 0, s.now, s.gates), true);
  void pa;
});

test('routes go round the fort and through the gate, never through stone', async () => {
  const { planRoute, crossesFort, hexDepth } = await import('./units');
  const back = { x: 0.2, z: -5.5 };
  const gateOut = { x: 0, z: WALL_APOTHEM + 0.45 };
  const r = planRoute(back, gateOut, { canClimb: false, gateOpen: false });
  assert.equal(r.blocked, false);
  let cur = back;
  for (const p of r.route) {
    assert.equal(crossesFort(cur, p), false, `leg to ${p.x.toFixed(2)},${p.z.toFixed(2)} hits the wall`);
    cur = p;
  }
  // into the courtyard: through the gate when open, stop at it when shut
  const yard = { x: 0.8, z: -0.6 };
  const open = planRoute(back, yard, { canClimb: false, gateOpen: true });
  assert.ok(open.route.some((p) => hexDepth(p.x, p.z) < 0 && Math.abs(p.x) < 0.1));
  assert.equal(planRoute(back, yard, { canClimb: false, gateOpen: false }).blocked, true);
  assert.deepEqual(planRoute(back, yard, { canClimb: true, gateOpen: false }).route, [yard]);
});

test('moves: a roll dodges, a heavy blow breaks a guard, a finisher and a heavy knock back harder', async () => {
  const { ACTION } = await import('./units');
  const { DODGE_IFRAMES, HEAVY_MULT, KNOCK_HEAVY, KNOCK_FINISHER, KNOCK_LIGHT } = await import('./combat');
  const a = at('me', 1, 0, 5); // out in the field (no inside-walls defence)
  // mid-roll: untouchable for DODGE_IFRAMES
  const roller = { ...at('roll', 0, 0, 4.5), action: ACTION.DODGE, dodgeAt: 10 };
  assert.equal(resolveStrike(a, Math.PI, [a, roller], 0, GATE_HP, 10 + DODGE_IFRAMES / 2).hits.length, 0);
  assert.equal(resolveStrike(a, Math.PI, [a, roller], 0, GATE_HP, 10 + DODGE_IFRAMES + 0.1).hits.length, 1);
  // a raised guard facing the blow: light takes half, heavy breaks through at ×1.8
  const guard = { ...at('guard', 0, 0, 4.5), action: ACTION.BLOCK, facing: 0 };
  const light = resolveStrike(a, Math.PI, [a, guard], 0, GATE_HP, 0).hits[0];
  assert.equal(light.blocked, true);
  assert.equal(light.damage, Math.round(WEAPONS[GEAR.TALWAR].damage * WEAPONS[GEAR.TALWAR].blockTaken));
  const heavy = resolveStrike(a, Math.PI, [a, guard], 0, GATE_HP, 0, { heavy: true }).hits[0];
  assert.equal(heavy.blocked, false);
  assert.equal(heavy.damage, Math.round(WEAPONS[GEAR.TALWAR].damage * HEAVY_MULT));
  assert.equal(heavy.knock, KNOCK_HEAVY);
  const plain = at('plain', 0, 0, 4.5);
  assert.equal(resolveStrike(a, Math.PI, [a, plain], 0, GATE_HP, 0).hits[0].knock, KNOCK_LIGHT);
  assert.equal(resolveStrike(a, Math.PI, [a, plain], 0, GATE_HP, 0, { finisher: true }).hits[0].knock, KNOCK_FINISHER);
});

test('mock: a landed blow shoves the target back, and a roll needs its cooldown', async () => {
  const { ACTION } = await import('./units');
  const s = createMockState(1000, { initialBotsPerKingdom: 0, rand: () => 0.5 });
  const pa = ixJoin(s, 'a', 1, s.game.config.ticket);
  const pd = ixJoin(s, 'd', 0, s.game.config.ticket);
  const a = unitOf(s, 'a')!;
  const d = unitOf(s, 'd')!;
  Object.assign(a, { at: 0, x: 0, z: 1.4, facing: Math.PI });
  Object.assign(d, { at: 0, x: 0, z: 0.9 });
  ixStrike(s, pa, a.x, a.z, Math.PI, { heavy: true });
  assert.ok(d.z < 0.9 - 0.4, `shoved back (z ${d.z})`);
  // roll, then try again too soon: the second is just a step
  const { ixMoveUnit } = await import('../mock/mockGame');
  ixMoveUnit(s, pd, d.x, d.z, 0, ACTION.DODGE);
  assert.equal(d.action, ACTION.DODGE);
  ixMoveUnit(s, pd, d.x, d.z, 0, ACTION.IDLE);
  s.now += 0.3;
  ixMoveUnit(s, pd, d.x, d.z, 0, ACTION.DODGE);
  assert.notEqual(d.action, ACTION.DODGE);
});
