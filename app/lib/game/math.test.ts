/**
 * Run: pnpm test   (tsx --test). These vectors should be mirrored by the Rust `math.rs` tests.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ADJACENCY, POWER, isAdjacent } from './factions';
import {
  DEFAULT_CONFIG,
  attackPower,
  battleOdds,
  burnWithFee,
  canAttack,
  defensePower,
  effectiveAllocs,
  mintShares,
  newFaction,
  newGame,
  resolveBattle,
  resolveEpoch,
  valueOf,
} from './math';
import type { GameConfig } from './types';

const SOL = 1_000_000_000n;
const cfg: GameConfig = { ...DEFAULT_CONFIG, epochSecs: 15, adjacency: [...ADJACENCY] };

test('adjacency is symmetric and matches ARCHITECTURE §2', () => {
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) assert.equal(isAdjacent(a, b), isAdjacent(b, a));
  assert.deepEqual(ADJACENCY, [0b100110, 0b001101, 0b010011, 0b110010, 0b101100, 0b011001]);
});

test('mint into an empty kingdom: 1e6 shares per lamport', () => {
  const f = newFaction(0);
  assert.equal(mintShares(f, 2n * SOL), 2n * SOL * 1_000_000n);
  assert.equal(f.treasury, 2n * SOL);
});

test('mint does not dilute existing members', () => {
  const f = newFaction(0);
  const a = mintShares(f, 1n * SOL);
  f.treasury += 1n * SOL; // conquest doubled the treasury
  const b = mintShares(f, 2n * SOL);
  assert.equal(valueOf(f, a), 2n * SOL);
  assert.equal(valueOf(f, b), 2n * SOL);
});

test('leave pays exactly 80% and the 20% raises the share price', () => {
  const f = newFaction(0);
  const a = mintShares(f, 1n * SOL);
  const b = mintShares(f, 1n * SOL);
  const out = burnWithFee(f, a, cfg.leaveFeeBps);
  assert.equal(out, 800_000_000n);
  assert.equal(f.treasury, 1_200_000_000n);
  assert.equal(valueOf(f, b), 1_200_000_000n);
});

test('switch moves exactly 60%, 40% stays', () => {
  const A = newFaction(0);
  const B = newFaction(1);
  const s = mintShares(A, 1n * SOL);
  mintShares(B, 1n * SOL);
  const moved = burnWithFee(A, s, cfg.switchFeeBps);
  const ns = mintShares(B, moved);
  assert.equal(moved, 600_000_000n);
  assert.equal(A.treasury, 400_000_000n);
  assert.equal(valueOf(B, ns), 600_000_000n);
});

test('defense: Fortress ×1.3 on home strength, plus base defense', () => {
  const g = newGame(cfg, { now: 0 });
  mintShares(g.factions[0], 10n * SOL);
  mintShares(g.factions[1], 10n * SOL);
  assert.equal(defensePower(g, 0), 13n * SOL + cfg.baseDefense);
  assert.equal(defensePower(g, 1), 10n * SOL + cfg.baseDefense);
  g.factions[1].attackAlloc[0] = 4n * SOL;
  assert.equal(defensePower(g, 1), 6n * SOL + cfg.baseDefense);
});

test('attack: Gaja ×1.2, Ratri first attack ×1.5, capped at treasury', () => {
  const g = newGame(cfg, { now: 0 });
  mintShares(g.factions[1], 10n * SOL);
  g.factions[1].attackAlloc[0] = 5n * SOL;
  assert.equal(attackPower(g, 1, 0), 6n * SOL);
  mintShares(g.factions[5], 2n * SOL);
  g.factions[5].attackAlloc[0] = 4n * SOL; // over-committed → capped at 2 SOL
  assert.equal(attackPower(g, 5, 0), 3n * SOL);
  g.factions[5].ambushUsed = true;
  assert.equal(attackPower(g, 5, 0), 2n * SOL);
});

test('Vidya Reach ignores adjacency', () => {
  const g = newGame(cfg, { now: 0 });
  assert.equal(canAttack(g, 0, 3), false);
  assert.equal(canAttack(g, 3, 0), true); // Takshashila has Vidya Reach
  assert.equal(canAttack(g, 0, 0), false);
});

test('repel: attacker pays k_loss to the defender (half with Annapurna)', () => {
  const g = newGame(cfg, { now: 0 });
  mintShares(g.factions[0], 10n * SOL);
  mintShares(g.factions[1], 10n * SOL);
  mintShares(g.factions[4], 10n * SOL);
  g.factions[1].attackAlloc[2] = 5n * SOL;
  g.factions[4].attackAlloc[2] = 5n * SOL;
  mintShares(g.factions[2], 10n * SOL);
  const e = resolveBattle(g, effectiveAllocs(g), 2, 0n)!; // roll 0 ⇒ defender holds
  assert.equal(e.winner, 2);
  assert.equal(e.attackersMask, 0b10010);
  assert.equal(g.factions[1].treasury, 9n * SOL); // 20% of 5
  assert.equal(g.factions[4].treasury, 9_500_000_000n); // 10% of 5
  assert.equal(g.factions[2].treasury, 11_500_000_000n);
});

test('conquest: loot = treasury / territories; last territory eliminates', () => {
  const g = newGame(cfg, { now: 0 });
  mintShares(g.factions[0], 10n * SOL);
  mintShares(g.factions[1], 6n * SOL);
  g.factions[0].attackAlloc[1] = 10n * SOL;
  const odds = battleOdds(g, 1);
  const e = resolveBattle(g, effectiveAllocs(g), 1, odds.total - 1n)!; // last bucket ⇒ attacker
  assert.equal(e.winner, 0);
  assert.equal(g.territoryOwner[1], 0);
  assert.equal(g.factions[1].alive, false);
  assert.equal(g.factions[1].treasury, 0n);
  assert.equal(g.factions[0].treasury, 16n * SOL);
  assert.equal(g.factions[0].powers, POWER.KURU_FORTRESS | POWER.GAJA_SENA);
});

test('Samudra Vyapar +25% loot', () => {
  const g = newGame(cfg, { now: 0 });
  mintShares(g.factions[2], 10n * SOL);
  mintShares(g.factions[0], 8n * SOL);
  // give Hastinapur a second territory so it is not eliminated
  g.territoryOwner[5] = 0;
  g.factions[0].territories = 2;
  g.factions[5].territories = 0;
  g.factions[5].alive = false;
  g.factions[2].attackAlloc[0] = 10n * SOL;
  const e = resolveBattle(g, effectiveAllocs(g), 0, battleOdds(g, 0).total - 1n)!;
  assert.equal(e.winner, 2);
  assert.equal(g.factions[2].treasury, 15n * SOL); // 10 + 4 × 1.25
  assert.equal(g.factions[0].treasury, 3n * SOL);
});

test('resolveEpoch resets allocations, decays base defense, advances epoch', () => {
  const g = newGame(cfg, { now: 0 });
  for (let i = 0; i < 6; i++) mintShares(g.factions[i], 1n * SOL);
  g.factions[1].attackAlloc[0] = 1n * SOL;
  const entries = resolveEpoch(g, new Uint8Array(32), 100);
  assert.equal(entries.length, 1);
  assert.equal(g.epoch, 2);
  assert.equal(g.epochEndsAt, 115);
  assert.equal(g.baseDefense, cfg.baseDefense - cfg.baseDefense / 20n);
  assert.ok(g.factions.every((f) => f.attackAlloc.every((a) => a === 0n)));
});

test('losing attackers pay k_loss to whoever wins (also when another attacker wins)', () => {
  const g = newGame(cfg, { now: 0 });
  mintShares(g.factions[0], 10n * SOL);
  mintShares(g.factions[1], 10n * SOL);
  mintShares(g.factions[2], 1n * SOL);
  g.factions[0].attackAlloc[2] = 5n * SOL; // Hastinapur: no attack multiplier
  g.factions[1].attackAlloc[2] = 5n * SOL; // Magadh: Gaja ×1.2
  const odds = battleOdds(g, 2);
  // Roll inside Hastinapur's bucket (right after the defender's).
  const e = resolveBattle(g, effectiveAllocs(g), 2, odds.defense)!;
  assert.equal(e.winner, 0);
  assert.equal(e.eliminated, true);
  assert.equal(g.factions[1].treasury, 9n * SOL); // Magadh lost 20% of 5 SOL to Hastinapur
  assert.equal(g.factions[0].treasury, 12n * SOL); // 10 + 1 (Magadh) + 1 (Kalinga's whole treasury)
  assert.equal(g.factions[2].generation, 1);
});

test('eliminated shares are worth 0 (generation bump)', () => {
  const f = newFaction(0);
  const s = mintShares(f, SOL);
  f.generation += 1;
  assert.equal(valueOf(f, s, 0), 0n);
});

test('subRoll matches the Rust program (shared vector)', async () => {
  const { subRoll } = await import('./math');
  const r = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((t) => subRoll(r, t)),
    [2783288195278980683n, 3545563980559904583n, 4689555029660771741n, 15053824720183481231n, 9565555852255760974n, 11935353444744740481n],
  );
});
