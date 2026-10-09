'use client';

/**
 * Every member's warrior, live from the MagicBlock ER (programs/samrajya/src/field.rs): one
 * websocket subscription per Player account of the war plus a slow re-list for newcomers. The
 * program is the referee; this only turns account changes into the store's units and into the
 * combat events the renderer animates:
 *
 *   strikes counter went up → swing (or arrow) by that warrior
 *   hp went down            → hit (block if they were guarding); 0 → kill
 *   Game.gates went down    → gate (gate-broken at 0)
 */
import type { Connection, PublicKey } from '@solana/web3.js';

import { KNOCK_HEAVY, KNOCK_LIGHT, MAX_EVENTS, weaponOf, type CombatEvent } from '@/lib/game/combat';
import type { Player } from '@/lib/game/types';
import { ACTION, type Unit } from '@/lib/game/units';
import { useGame } from '@/lib/store/game';

const RELIST_MS = 5000;
let seq = 3_000_000;

function pushEvents(evs: Omit<CombatEvent, 'id'>[]) {
  if (!evs.length) return;
  useGame.setState((s) => ({ events: [...s.events, ...evs.map((e) => ({ ...e, id: ++seq }))].slice(-MAX_EVENTS) }));
}

/** Combat events implied by a warrior's change (the viewer's own swings are animated locally). */
function diff(prev: Unit | undefined, next: Unit, me: string | null, units: Unit[]): Omit<CombatEvent, 'id'>[] {
  if (!prev || prev.at !== next.at) return [];
  const now = Date.now() / 1000;
  const evs: Omit<CombatEvent, 'id'>[] = [];
  const base = { at: now, territory: next.at, by: next.wallet, byFaction: next.faction, gear: next.gear };
  if ((next.strikes ?? 0) !== (prev.strikes ?? 0) && next.wallet !== me) {
    const w = weaponOf(next.gear);
    evs.push(
      w.ranged
        ? { ...base, kind: 'arrow', x: next.x, z: next.z, x2: next.x + Math.sin(next.facing) * w.range, z2: next.z + Math.cos(next.facing) * w.range }
        : { ...base, kind: 'swing', x: next.x, z: next.z },
    );
  }
  if (next.hp < prev.hp) {
    // the blow came from the nearest enemy who just swung
    const by = units
      .filter((u) => u.at === next.at && u.faction !== next.faction && u.hp > 0)
      .sort((a, b) => Math.hypot(a.x - next.x, a.z - next.z) - Math.hypot(b.x - next.x, b.z - next.z))[0];
    const who = by ? { by: by.wallet, byFaction: by.faction, gear: by.gear } : { by: '', byFaction: (next.faction + 1) % 6, gear: next.gear };
    const blocked = prev.action === ACTION.BLOCK;
    const damage = prev.hp - next.hp;
    // a blow well above the weapon's damage was a charged heavy one (the program ×1.8)
    const heavy = !!by && damage >= weaponOf(by.gear).damage * 1.5;
    evs.push({ at: now, territory: next.at, ...who, kind: blocked && !heavy ? 'block' : 'hit', target: next.wallet, damage, heavy, knock: heavy ? KNOCK_HEAVY : blocked ? 0.08 : KNOCK_LIGHT, x: next.x, z: next.z });
    if (next.hp <= 0) evs.push({ at: now, territory: next.at, ...who, kind: 'kill', target: next.wallet, x: next.x, z: next.z });
  }
  return evs;
}

/** Gate damage between two Game snapshots. */
export function gateEvents(prev: number[] | undefined, next: number[] | undefined): Omit<CombatEvent, 'id'>[] {
  if (!prev || !next) return [];
  const now = Date.now() / 1000;
  const out: Omit<CombatEvent, 'id'>[] = [];
  next.forEach((hp, t) => {
    if (hp < prev[t]) {
      const units = useGame.getState().units;
      const by = units.find((u) => u.at === t && u.faction !== useGame.getState().game?.territoryOwner[t]);
      out.push({
        at: now,
        territory: t,
        by: by?.wallet ?? '',
        byFaction: by?.faction ?? 0,
        gear: by?.gear ?? 0,
        kind: hp <= 0 ? 'gate-broken' : 'gate',
        damage: prev[t] - hp,
        x: 0,
        z: 2.21,
      });
    }
  });
  return out;
}

interface Deps {
  program: { programId: PublicKey; coder: { accounts: { decode(name: string, data: Buffer): unknown; memcmp(name: string): { bytes?: string } } } };
  er: Connection;
  game: PublicKey;
  toPlayer: (raw: Record<string, unknown>) => Player;
  toUnit: (raw: Record<string, unknown>) => Unit | null;
}

/** Follows every warrior of `game` on the ER until the returned function is called. */
export function watchWarriors({ program, er, game, toPlayer, toUnit }: Deps): () => void {
  let live = true;
  const subs = new Map<string, number>();
  const players = new Map<string, Player>();
  const units = new Map<string, Unit>();

  const publish = () => {
    if (!live) return;
    const wallet = useGame.getState().wallet;
    const list = [...units.values()];
    const all = [...players.values()];
    useGame.setState((s) => ({
      units: list,
      players: all.length ? all : s.players,
      me: wallet ? (players.get(wallet) ?? s.me) : s.me,
    }));
  };

  const apply = (pubkey: string, data: Buffer) => {
    let raw: Record<string, unknown>;
    try {
      raw = program.coder.accounts.decode('player', data) as Record<string, unknown>;
    } catch {
      return;
    }
    const p = toPlayer(raw);
    players.set(p.wallet, p);
    const u = p.status === 'Active' ? toUnit(raw) : null;
    const prev = units.get(p.wallet);
    if (u && (u.hp > 0 || u.deadUntil > Date.now() / 1000)) {
      pushEvents(diff(prev, u, useGame.getState().wallet, [...units.values()]));
      units.set(p.wallet, u);
    } else units.delete(p.wallet);
    void pubkey;
  };

  const relist = async () => {
    const disc = program.coder.accounts.memcmp('player');
    const accs = await er.getProgramAccounts(program.programId, {
      commitment: 'confirmed',
      filters: [{ memcmp: { offset: 0, bytes: disc.bytes! } }, { memcmp: { offset: 40, bytes: game.toBase58() } }],
    });
    if (!live) return;
    for (const a of accs) {
      const k = a.pubkey.toBase58();
      apply(k, a.account.data);
      if (!subs.has(k)) {
        subs.set(
          k,
          er.onAccountChange(
            a.pubkey,
            (info) => {
              apply(k, info.data);
              publish();
            },
            'processed',
          ),
        );
      }
    }
    publish();
  };

  void relist().catch((e) => console.warn('[samrajya warriors]', (e as Error).message));
  const timer = setInterval(() => void relist().catch(() => {}), RELIST_MS);
  return () => {
    live = false;
    clearInterval(timer);
    for (const id of subs.values()) void er.removeAccountChangeListener(id);
  };
}
