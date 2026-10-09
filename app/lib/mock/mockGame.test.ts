import assert from 'node:assert/strict';
import { test } from 'node:test';

import { totalPot, validTargets } from '@/lib/game/math';
import { type BattleEntry, DEFEND, NEUTRAL, PLAINS } from '@/lib/game/types';
import { isInside } from '@/lib/game/units';
import { createMockState, ixAllocate, ixJoin, ixNewWar, stepMock, unitOf } from './mockGame';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (const seed of [1, 2, 3, 42]) {
  test(`mock war (seed ${seed}): the hand fight decides every fort and SOL is conserved`, () => {
    const rand = mulberry32(seed);
    const s = createMockState(0, { rand, epochSecs: 60 });
    let now = 0;
    let seen = 0;
    const forts: BattleEntry[] = [];
    // ~600 epochs of bots fighting by hand
    for (let i = 0; i < 72_000; i++) {
      now += 0.5;
      stepMock(s, now, rand);
      const fresh = s.game.battleCount - seen;
      if (fresh > 0) forts.push(...s.game.battleLog.slice(-fresh).filter((e) => e.territory !== PLAINS));
      seen = s.game.battleCount;
      // Σ treasury + leave payouts == Σ deposits (no SOL created or lost).
      assert.equal(totalPot(s.game) + s.stats.paidOut, s.stats.deposited);
      assert.ok(s.game.factions.every((f) => f.treasury >= 0n && f.totalShares >= 0n));
    }
    assert.ok(forts.length > 0);
    // no dice for a walled realm: cleared → captured, otherwise it held
    for (const e of forts) {
      assert.equal(e.roll, 0n);
      assert.ok(e.byFight);
      assert.ok(e.captured ? e.winner !== e.defender : e.winner === e.defender);
    }
    // (whether bots manage to kill a whole garrison varies by seed; the scripted conquest test covers a fall)
  });
}

/**
 * One human in Magadh against empty kingdoms: each epoch they commit to a neighbour and walk into
 * its empty courtyard (taken outright), or assault the plains, until they hold everything.
 */
function conquerAlone(rand: () => number) {
  const s = createMockState(0, { rand, epochSecs: 20, initialBotsPerKingdom: 0, maxBots: 0, restartSecs: 10_000 });
  const me = ixJoin(s, 'raja', 1, s.game.config.ticket);
  let now = 0;
  for (let i = 0; i < 20_000 && s.game.phase !== 'Ended'; i++) {
    const g = s.game;
    if (g.phase === 'Active' && !g.pendingVrf && me.allocEpoch !== g.epoch) {
      const targets = validTargets(g, 1);
      const t = targets.find((x) => x !== PLAINS) ?? targets[0];
      if (t !== undefined) {
        ixAllocate(s, me, t, me.shares * 1_000_000n);
        if (t !== PLAINS) Object.assign(unitOf(s, 'raja')!, { x: 0, z: 0.9 }); // through the gate
      }
    }
    stepMock(s, (now += 0.5), rand, 'raja');
  }
  return s;
}

test('a war ends when one kingdom has cleared every fort and holds the plains', () => {
  const s = conquerAlone(mulberry32(5));
  assert.equal(s.game.phase, 'Ended');
  assert.equal(s.game.winner, 1);
  assert.ok(s.game.territoryOwner.every((o) => o === 1));
  assert.ok(s.game.battleLog.some((e) => e.captured));
});

test('anyone opens the next war once one ends (not before)', () => {
  const rand = mulberry32(7);
  assert.throws(() => ixNewWar(createMockState(0, { rand }), rand));
  const s = conquerAlone(rand);
  assert.equal(s.game.phase, 'Ended');
  const id = s.game.gameId;
  ixNewWar(s, rand);
  assert.equal(s.game.gameId, id + 1);
  assert.equal(s.game.phase, 'Active');
  assert.equal(s.game.territoryOwner[PLAINS], NEUTRAL);
  assert.ok(s.players.every((p) => p.depositedTotal === s.game.config.ticket));
});

test('a squad that commits to an assault is teleported to the enemy gate together', () => {
  const s = createMockState(1000, { initialBotsPerKingdom: 0, rand: () => 0.5 });
  const squad = ['a', 'b', 'c'].map((w) => ixJoin(s, w, 1, s.game.config.ticket));
  ixJoin(s, 'home-guard', 1, s.game.config.ticket);
  ixJoin(s, 'enemy', 0, s.game.config.ticket);
  for (const p of squad) ixAllocate(s, p, 0, p.shares);
  for (const p of squad) {
    const u = unitOf(s, p.wallet)!;
    assert.equal(u.at, 0);
    assert.equal(isInside(u.x, u.z), false); // outside the walls, at the camp
    assert.equal(u.marchTo, null); // no road
  }
  // the member who stays home is not moved; Defend brings a squad member back
  assert.equal(unitOf(s, 'home-guard')!.at, 1);
  ixAllocate(s, squad[2], DEFEND, 0n);
  assert.equal(unitOf(s, 'c')!.at, 1);
});

test('walking into an empty fort takes it at once, without waiting for the bell', () => {
  const s = createMockState(1000, { initialBotsPerKingdom: 0, maxBots: 0, rand: () => 0.5 });
  const raja = ixJoin(s, 'raja', 1, s.game.config.ticket);
  ixJoin(s, 'guard', 0, s.game.config.ticket); // Hastinapur has a member; Kalinga (2) has none
  const epoch = s.game.epoch;
  ixAllocate(s, raja, 2, raja.shares * 1_000_000n);
  const u = unitOf(s, 'raja')!;
  assert.equal(u.at, 2);
  // at the camp outside the walls: nothing happens yet
  stepMock(s, s.now + 0.5, () => 0.5, 'raja');
  assert.equal(s.game.territoryOwner[2], 2);
  // through the open gate into the courtyard: Kalinga falls now
  Object.assign(u, { x: 0, z: 0.9 });
  stepMock(s, s.now + 0.5, () => 0.5, 'raja');
  assert.equal(s.game.territoryOwner[2], 1);
  assert.equal(s.game.epoch, epoch); // no bell
  const e = s.game.battleLog.at(-1)!;
  assert.equal(e.territory, 2);
  assert.equal(e.byFight, true);
  // Hastinapur still has a living member at home: its fort is not taken that way
  ixAllocate(s, raja, 0, raja.shares * 1_000_000n);
  Object.assign(unitOf(s, 'raja')!, { at: 0, x: 0, z: 0.5 });
  stepMock(s, s.now + 0.5, () => 0.5, 'raja');
  assert.equal(s.game.territoryOwner[0], 0);
});
