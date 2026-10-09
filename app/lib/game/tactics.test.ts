/**
 * Run: pnpm test. The Rust `tactics.rs` tests should mirror these once Step 17 lands.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ADJACENCY } from './factions';
import { DEFAULT_CONFIG, battleOdds, effectiveAllocs, mintShares, newGame, resolveBattle } from './math';
import { tacticalFactors } from './tactics';
import type { GameConfig } from './types';
import { GEAR, hexDepth, inGate, newUnit, ROLE, stepUnit, WALL_APOTHEM, zoneOf, type Unit } from './units';

const SOL = 1_000_000_000n;
const cfg: GameConfig = { ...DEFAULT_CONFIG, epochSecs: 15, adjacency: [...ADJACENCY] };

function warGame() {
  const g = newGame(cfg);
  for (let f = 0; f < 6; f++) {
    mintShares(g.factions[f], 2n * SOL);
    g.factions[f].members = 2;
  }
  // Magadh (1) attacks Hastinapur (0) with all it has
  g.factions[1].attackAlloc[0] = 2n * SOL;
  return g;
}

const at = (wallet: string, faction: number, t: number, x: number, z: number, patch: Partial<Unit> = {}): Unit => ({ ...newUnit(wallet, faction, t, 0), x, z, ...patch });

test('zones: keep, inside, gate, field, edge', () => {
  assert.equal(zoneOf(0, 0), 'keep');
  assert.equal(zoneOf(1.5, 0), 'inside');
  assert.equal(zoneOf(0, WALL_APOTHEM), 'gate');
  assert.ok(inGate(0.1, WALL_APOTHEM + 0.1));
  assert.equal(zoneOf(0, 4), 'field');
  assert.equal(zoneOf(0, 5.6), 'edge');
  assert.ok(hexDepth(0, 0) < 0 && hexDepth(0, 4) > 0);
});

test('walls block, the gate lets you through, a ladder climbs', () => {
  const closed = { canClimb: false, gateOpen: false };
  // walking into the wall from inside, away from the gate: blocked (slides, never crosses)
  const r1 = stepUnit(1.9, 0, 0.5, 0, closed);
  assert.ok(hexDepth(r1.x, r1.z) < 0, 'stays inside');
  // through the gate when open
  const r2 = stepUnit(0, WALL_APOTHEM - 0.3, 0, 0.6, { canClimb: false, gateOpen: true });
  assert.ok(r2.z > WALL_APOTHEM, 'passed the gate');
  // gate closed: stays
  const r3 = stepUnit(0, WALL_APOTHEM - 0.3, 0, 0.6, closed);
  assert.ok(r3.z <= WALL_APOTHEM - 0.3 + 1e-9 || hexDepth(r3.x, r3.z) < 0, 'held at the gate');
  // ladder: crosses anywhere, flagged as climbing
  const r4 = stepUnit(1.9, 0, 0.5, 0, { canClimb: true, gateOpen: false });
  assert.ok(r4.climbing && hexDepth(r4.x, r4.z) > -0.2);
});

test('a fort with no living defender in the realm is captured without a roll', () => {
  const g = warGame();
  const units = [
    { ...at('d1', 0, 0, 4.5, 0.5), hp: 0 }, // the last defender lies dead in the field
    at('a1', 1, 0, 0, WALL_APOTHEM, { role: ROLE.VANGUARD }), // attacker at the gate
  ];
  const f = tacticalFactors(g, units, 0, 0);
  assert.equal(f.capturedBy, 1);
  assert.equal(f.heads.defendersInside, 0);
  const e = resolveBattle(g, effectiveAllocs(g), 0, 123456789n, f)!;
  assert.equal(e.winner, 1);
  assert.equal(e.captured, true);
  assert.equal(e.roll, 0n);
  assert.equal(g.territoryOwner[0], 1);
  // a defender still alive anywhere in the realm (even outside the walls) holds it
  const g2 = warGame();
  const held = tacticalFactors(g2, [at('d1', 0, 0, 4.5, 0.5), units[1]], 0, 0);
  assert.equal(held.capturedBy, null);
});

test('a garrison inside the walls stops the walk-in and raises the defence', () => {
  const g = warGame();
  const noOne = tacticalFactors(g, [at('a1', 1, 0, 0, WALL_APOTHEM)], 0, 0);
  const held = tacticalFactors(g, [at('a1', 1, 0, 0, WALL_APOTHEM), at('d1', 0, 0, 1.2, 0, { gear: GEAR.DHAL })], 0, 0);
  assert.equal(noOne.capturedBy, 1);
  assert.equal(held.capturedBy, null);
  assert.ok(held.defenseBps > noOne.defenseBps);
  const oNone = battleOdds(g, 0, undefined, noOne);
  const oHeld = battleOdds(g, 0, undefined, held);
  assert.ok(oHeld.pDefend > oNone.pDefend);
});

test('attackers who did not show up fight at the floor; present ones scale up', () => {
  const g = warGame();
  const absent = tacticalFactors(g, [], 0, 0);
  const present = tacticalFactors(g, [at('a1', 1, 0, 0, WALL_APOTHEM + 0.5, { gear: GEAR.BHALA }), at('a2', 1, 0, -2, 1)], 0, 0);
  assert.equal(absent.attackBps[1], 2500n);
  assert.ok(present.attackBps[1] > 8000n);
  assert.equal(present.attackBps[0], 10_000n, 'the defender keeps its own factor neutral');
});

test('marching and dead warriors do not count', () => {
  const g = warGame();
  const marching = at('a1', 1, 0, 0, WALL_APOTHEM, { marchTo: 2, marchFrom: 0, marchStart: 0, marchAt: 10 });
  const dead = at('a2', 1, 0, 0, WALL_APOTHEM, { hp: 0 });
  const f = tacticalFactors(g, [marching, dead], 0, 5);
  assert.equal(f.heads.attackers[1], 0);
  assert.equal(f.capturedBy, null);
});
