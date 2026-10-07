import assert from 'node:assert/strict';
import { test } from 'node:test';

import { totalPot } from '@/lib/game/math';
import { createMockState, stepMock } from './mockGame';

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
  test(`mock game (seed ${seed}) reaches a winner and conserves SOL`, () => {
    const rand = mulberry32(seed);
    const s = createMockState(0, { rand });
    let now = 0;
    let endedOnce = false;
    for (let i = 0; i < 200_000 && !endedOnce; i++) {
      now += 0.5;
      stepMock(s, now, rand);
      // Σ treasury + leave payouts == Σ deposits (no SOL created or lost).
      assert.equal(totalPot(s.game) + s.stats.paidOut, s.stats.deposited);
      assert.ok(s.game.factions.every((f) => f.treasury >= 0n && f.totalShares >= 0n));
      if (s.game.phase === 'Ended') endedOnce = true;
    }
    assert.ok(endedOnce, 'game should end');
    assert.notEqual(s.game.winner, null);
    assert.ok(s.game.territoryOwner.every((o) => o === s.game.winner));
    // restarts after restartSecs
    const id = s.game.gameId;
    for (let i = 0; i < 50; i++) stepMock(s, (now += 0.5), rand);
    assert.equal(s.game.gameId, id + 1);
    assert.equal(s.game.phase, 'Active');
  });
}
