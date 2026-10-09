/**
 * Converts Anchor-decoded accounts (BN, `{ active: {} }` enums, PublicKey) into the UI's plain
 * `Game` / `Player` types (bigint, string unions, base58).
 */
import type { BN } from '@coral-xyz/anchor';
import type { PublicKey } from '@solana/web3.js';

import { BATTLE_LOG_SIZE, type BattleEntry, type Game, type Phase, type Player } from '@/lib/game/types';
import type { Gear, Role, Unit, UnitAction } from '@/lib/game/units';

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
      ...(e.byFight ? { byFight: true, captured: num(e.winner) !== num(e.defender) } : {}),
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
      ticket: big(cfg.ticket),
      epochSecs: num(cfg.epochSecs),
      leaveFeeBps: num(cfg.leaveFeeBps),
      switchFeeBps: num(cfg.switchFeeBps),
      kLossBps: num(cfg.kLossBps),
      stormDecayBps: num(cfg.stormDecayBps),
      baseDefense: big(cfg.baseDefense),
      adjacency: Array.from(cfg.adjacency as number[]),
      plainsDefense: big(cfg.plainsDefense),
      plainsTaxBps: num(cfg.plainsTaxBps),
      upgradeCostBps: num(cfg.upgradeCostBps),
      upgradeBonusBps: num(cfg.upgradeBonusBps),
      conquestBonusBps: num(cfg.conquestBonusBps),
      lobbySecs: num(cfg.lobbySecs),
    },
    baseDefense: big(raw.baseDefense),
    plainsDefense: big(raw.plainsDefense),
    plainsPot: big(raw.plainsPot),
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
      upgrades: Array.from(f.upgrades as number[]),
      upgradedEpoch: num(f.upgradedEpoch),
    })),
    winner: phase === 'Ended' ? num(raw.winner) : null,
    battleLog,
    gates: raw.gates ? Array.from(raw.gates as number[]) : undefined,
  };
}

/**
 * A member's warrior from `Player.unit` (programs/samrajya/src/field.rs: coordinates ×100, facing
 * as a unit vector ×100). Null when the member has no warrior on the field.
 */
export function toUnit(rawPlayer: Raw): Unit | null {
  const u = rawPlayer.unit as Raw | undefined;
  if (!u) return null;
  const at = num(u.at);
  if (at === 255) return null;
  const fx = num(u.fx);
  const fz = num(u.fz);
  return {
    wallet: (rawPlayer.wallet as PublicKey).toBase58(),
    faction: num(rawPlayer.faction),
    at,
    x: num(u.x) / 100,
    z: num(u.z) / 100,
    facing: fx === 0 && fz === 0 ? 0 : Math.atan2(fx, fz),
    action: num(u.action) as UnitAction,
    role: num(u.role) as Role,
    gear: num(u.gear) as Gear,
    hp: num(u.hp),
    marchTo: null,
    marchFrom: at,
    marchStart: 0,
    marchAt: 0,
    updatedAt: num(u.movedAt),
    deadUntil: num(u.deadUntil),
    readyAt: 0,
    strikes: num(u.strikes),
    dodgeAt: u.dodgeAt === undefined ? undefined : num(u.dodgeAt),
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
