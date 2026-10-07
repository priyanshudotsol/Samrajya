/**
 * Converts Anchor-decoded accounts (BN, `{ active: {} }` enums, PublicKey) into the UI's plain
 * `Game` / `Player` types (bigint, string unions, base58).
 */
import type { BN } from '@coral-xyz/anchor';
import type { PublicKey } from '@solana/web3.js';

import { BATTLE_LOG_SIZE, type BattleEntry, type Game, type Phase, type Player } from '@/lib/game/types';

type Raw = Record<string, unknown>;
const big = (x: unknown) => BigInt((x as BN).toString());
const num = (x: unknown) => (typeof x === 'number' ? x : Number((x as BN).toString()));

function phaseOf(p: Raw): Phase {
  if ('active' in p) return 'Active';
  if ('ended' in p) return 'Ended';
  return 'Lobby';
}

export function toGame(raw: Raw): Game {
  const cfg = raw.config as Raw;
  const phase = phaseOf(raw.phase as Raw);
  const count = num(raw.battleCount);
  const ring = (raw.battleLog as Raw[]).map(
    (e): BattleEntry => ({
      epoch: num(e.epoch),
      territory: num(e.territory),
      defender: num(e.defender),
      winner: num(e.winner),
      attackersMask: num(e.attackersMask),
      defense: big(e.defense),
      total: big(e.total),
      roll: big(e.roll),
      spoils: big(e.spoils),
      eliminated: Boolean(e.eliminated),
    }),
  );
  // Flatten the ring buffer oldest → newest.
  const n = Math.min(count, BATTLE_LOG_SIZE);
  const battleLog: BattleEntry[] = [];
  for (let i = count - n; i < count; i++) battleLog.push(ring[i % BATTLE_LOG_SIZE]);

  return {
    authority: (raw.authority as PublicKey).toBase58(),
    gameId: num(raw.gameId),
    phase,
    epoch: num(raw.epoch),
    epochEndsAt: num(raw.epochEndsAt),
    pendingVrf: Boolean(raw.pendingVrf),
    config: {
      minStake: big(cfg.minStake),
      epochSecs: num(cfg.epochSecs),
      leaveFeeBps: num(cfg.leaveFeeBps),
      switchFeeBps: num(cfg.switchFeeBps),
      kLossBps: num(cfg.kLossBps),
      stormDecayBps: num(cfg.stormDecayBps),
      baseDefense: big(cfg.baseDefense),
      adjacency: Array.from(cfg.adjacency as number[]),
    },
    baseDefense: big(raw.baseDefense),
    battleCount: count,
    territoryOwner: Array.from(raw.territoryOwner as number[]),
    factions: (raw.factions as Raw[]).map((f) => ({
      treasury: big(f.treasury),
      totalShares: big(f.totalShares),
      generation: num(f.generation),
      members: num(f.members),
      territories: num(f.territories),
      powers: num(f.powers),
      alive: Boolean(f.alive),
      ambushUsed: Boolean(f.ambushUsed),
      attackAlloc: (f.attackAlloc as BN[]).map(big),
    })),
    winner: phase === 'Ended' ? num(raw.winner) : null,
    battleLog,
  };
}

export function toPlayer(raw: Raw, game: Game | null): Player {
  const shares = big(raw.shares);
  const faction = num(raw.faction);
  const generation = num(raw.generation);
  const claimed = Boolean(raw.claimed);
  const live = !!game && game.factions[faction]?.generation === generation;
  return {
    wallet: (raw.wallet as PublicKey).toBase58(),
    faction,
    generation,
    shares,
    pendingDeposit: big(raw.pendingDeposit),
    pendingWithdrawal: big(raw.pendingWithdrawal),
    depositedTotal: big(raw.depositedTotal),
    allocTarget: num(raw.allocTarget),
    allocAmount: big(raw.allocAmount),
    allocEpoch: num(raw.allocEpoch),
    claimed,
    status: claimed ? 'Claimed' : shares > 0n && live ? 'Active' : shares > 0n ? 'Left' : 'Idle',
  };
}
