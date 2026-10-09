'use client';

/**
 * The shared battlefield on devnet until warriors move on-chain (IMPLEMENTATION_GUIDE Step 17):
 * every member's warrior and swings travel over one Supabase Realtime channel per war,
 * `samrajya:<game>:field` (any member of that war may join; see supabase/chat.sql).
 *
 *   unit    a warrior's state: sent ~6 Hz while it changes, plus a heartbeat every 2 s
 *   strike  a swing / shot: everyone animates it; the TARGET's browser decides whether it lands
 *           (same rules as the mock, `resolveStrike`), applies the wound and answers with `hurt`
 *   hurt    a landed blow (hit / block / kill), so everyone shows it
 *   bye     a warrior left the realm view
 *
 * Each browser is authoritative for its own warrior only. That is trust-based (a modified client
 * could ignore blows); Step 17 moves `move_unit` / `strike` into the program on the ER.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';

import { MAX_EVENTS, RESPAWN_SECS, resolveStrike, type CombatEvent } from '@/lib/game/combat';
import { ACTION, type Unit } from '@/lib/game/units';
import { useGame } from '@/lib/store/game';

const SEND_EVERY_MS = 160;
const HEARTBEAT_MS = 2000;
/** A remote warrior with no news for this long has closed the tab. */
const STALE_MS = 12_000;

let channel: RealtimeChannel | null = null;
let me: string | null = null;
let lastSent = 0;
let lastKey = '';
let trailing: ReturnType<typeof setTimeout> | null = null;
let seq = 2_000_000;
const heardAt = new Map<string, number>();

const myUnit = () => (me ? useGame.getState().units.find((u) => u.wallet === me) : undefined);

function pushEvents(evs: Omit<CombatEvent, 'id'>[]) {
  useGame.setState((s) => ({ events: [...s.events, ...evs.map((e) => ({ ...e, id: ++seq }))].slice(-MAX_EVENTS) }));
}

function upsertRemote(u: Unit) {
  if (!u?.wallet || u.wallet === me) return;
  heardAt.set(u.wallet, Date.now());
  useGame.setState((s) => ({ units: [...s.units.filter((x) => x.wallet !== u.wallet), u] }));
}

function removeRemote(wallet: string) {
  heardAt.delete(wallet);
  useGame.setState((s) => ({ units: s.units.filter((x) => x.wallet !== wallet) }));
}

function send(event: string, payload: unknown) {
  if (!channel) return;
  void channel.send({ type: 'broadcast', event, payload }).catch(() => {});
}

/** Publishes the viewer's warrior (throttled; immediate when its realm, action or health changes). */
export function publishUnit() {
  const u = myUnit();
  if (!channel || !u) return;
  const key = `${u.at}:${u.action}:${u.hp}:${u.gear}:${u.role}`;
  const now = Date.now();
  if (key !== lastKey || now - lastSent >= SEND_EVERY_MS) {
    lastKey = key;
    lastSent = now;
    if (trailing) clearTimeout(trailing);
    trailing = null;
    send('unit', u);
    return;
  }
  // make sure the final position of a burst arrives
  if (!trailing) {
    trailing = setTimeout(() => {
      trailing = null;
      lastSent = Date.now();
      const v = myUnit();
      if (v) send('unit', v);
    }, SEND_EVERY_MS);
  }
}

/** Publishes the viewer's swing so everyone animates it and its targets resolve it. */
export function publishStrike(attacker: Unit, facing: number, opts: { heavy?: boolean; combo?: number } = {}) {
  send('strike', { attacker, facing, ...opts });
}

/** A swing from someone else: animate it, and if it is aimed at the viewer, resolve it. */
function onStrike({ attacker, facing, heavy, combo }: { attacker: Unit; facing: number; heavy?: boolean; combo?: number }) {
  if (!attacker || attacker.wallet === me) return;
  upsertRemote({ ...attacker, facing, action: ACTION.ATTACK });
  const now = Date.now() / 1000;
  const base = { at: now, territory: attacker.at, by: attacker.wallet, byFaction: attacker.faction, gear: attacker.gear, heavy, combo };
  const target = myUnit();
  const game = useGame.getState().game;
  let arrowEnd: { x: number; z: number } | null = null;
  const evs: Omit<CombatEvent, 'id'>[] = [];
  if (target && game && target.at === attacker.at && target.faction !== attacker.faction && target.hp > 0) {
    const r = resolveStrike(attacker, facing, [attacker, target], game.territoryOwner[attacker.at], useGame.getState().gates[attacker.at] ?? 0, now, { heavy, finisher: (combo ?? 0) >= 3 });
    arrowEnd = r.arrowEnd;
    const hit = r.hits.find((h) => h.wallet === target.wallet);
    if (hit) {
      const hp = Math.max(0, target.hp - hit.damage);
      const dead = hp <= 0;
      const next: Unit = dead
        ? { ...target, hp: 0, action: ACTION.DEAD, deadUntil: deadUntil(now), marchTo: null, updatedAt: now }
        : { ...target, hp, updatedAt: now };
      useGame.setState((s) => ({ units: [...s.units.filter((x) => x.wallet !== target.wallet), next] }));
      const hurt = [
        { ...base, kind: hit.blocked ? ('block' as const) : ('hit' as const), target: target.wallet, damage: hit.damage, knock: hit.knock, x: target.x, z: target.z },
        ...(dead ? [{ ...base, kind: 'kill' as const, target: target.wallet, x: target.x, z: target.z }] : []),
      ];
      evs.push(...hurt);
      send('hurt', hurt);
      publishUnit();
    }
  }
  evs.unshift(
    arrowEnd
      ? { ...base, kind: 'arrow', x: attacker.x, z: attacker.z, x2: arrowEnd.x, z2: arrowEnd.z }
      : { ...base, kind: 'swing', x: attacker.x, z: attacker.z },
  );
  pushEvents(evs);
}

/** The fallen stay down until the bell once the war is on (ARCHITECTURE §10.8), else RESPAWN_SECS. */
function deadUntil(now: number): number {
  const g = useGame.getState().game;
  return g && g.phase === 'Active' ? Math.max(g.epochEndsAt, now + RESPAWN_SECS) : now + RESPAWN_SECS;
}

/** Joins the war's battlefield as `wallet`. Returns a function that leaves it. */
export async function joinField(opts: { gameId: number; faction: number; wallet: string }): Promise<() => void> {
  const { realtimeClient, joinPrivate } = await import('@/lib/chat/supabase');
  const client = await realtimeClient(opts.gameId, opts.faction, opts.wallet);
  me = opts.wallet;
  const ch = await joinPrivate(
    client,
    `samrajya:${opts.gameId}:field`,
    (c) =>
      c
        .on('broadcast', { event: 'unit' }, ({ payload }) => upsertRemote(payload as Unit))
        .on('broadcast', { event: 'strike' }, ({ payload }) => onStrike(payload as { attacker: Unit; facing: number; heavy?: boolean; combo?: number }))
        .on('broadcast', { event: 'hurt' }, ({ payload }) => pushEvents((payload as Omit<CombatEvent, 'id'>[]).filter((e) => e.target !== me)))
        .on('broadcast', { event: 'bye' }, ({ payload }) => removeRemote((payload as { wallet: string }).wallet)),
    false,
  );
  channel = ch;
  lastKey = '';
  publishUnit();
  const timers = [
    setInterval(() => {
      const u = myUnit();
      if (u) send('unit', u);
    }, HEARTBEAT_MS),
    setInterval(() => {
      const cutoff = Date.now() - STALE_MS;
      for (const [w, t] of heardAt) if (t < cutoff) removeRemote(w);
    }, 3000),
  ];
  return () => {
    timers.forEach(clearInterval);
    if (channel === ch) {
      send('bye', { wallet: opts.wallet });
      channel = null;
    }
    for (const w of [...heardAt.keys()]) removeRemote(w);
    void client.removeChannel(ch);
  };
}
