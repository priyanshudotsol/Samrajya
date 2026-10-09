/**
 * Warrior actions for the live chain BEFORE the program has `move_unit` / `set_role` /
 * `set_gear` / `march` / `strike` (docs/IMPLEMENTATION_GUIDE.md Step 17). The viewer's warrior
 * lives only in this browser's store, so the realm is walkable and every control works on devnet
 * today; other players' warriors (and so real hits) appear once the ER feed decodes `Player.unit`.
 */
import { MAX_EVENTS, RESPAWN_HP, weaponOf } from '@/lib/game/combat';
import { publishStrike, publishUnit } from '@/lib/multiplayer/field';
import { ACTION, arrivalPoint, GEAR, gearAllowed, marchTargets, newUnit, teleportUnit, type Gear, type Role, type Unit, type UnitAction } from '@/lib/game/units';
import { DEFEND, N_TERRITORIES } from '@/lib/game/types';
import { useGame } from '@/lib/store/game';

type UnitActions = Pick<import('./types').GameActions, 'moveUnit' | 'setRole' | 'setGear' | 'march' | 'strike' | 'rally'>;

/** The kingdom's home realm for a fresh warrior: the capital if still held, else its first territory. */
function homeOf(faction: number): number {
  const g = useGame.getState().game!;
  return g.territoryOwner[faction] === faction ? faction : Math.max(0, g.territoryOwner.indexOf(faction));
}

let lastEpoch: number | null = null;

/**
 * Makes sure the viewer's warrior exists in the store once they are an active member (the chain
 * does not track it yet). Called by the controller every frame; cheap when nothing changes.
 */
export function ensureLocalUnit(wallet: string) {
  const s = useGame.getState();
  const me = s.me;
  // during the war every warrior, yours too, comes from the ER (lib/chain/warriors.ts)
  if (!s.game || s.onER) return;
  const live = !!me && me.status === 'Active' && me.shares > 0n && me.generation === s.game.factions[me.faction]?.generation && s.game.factions[me.faction].alive;
  const u = s.units.find((x) => x.wallet === wallet);
  if (!live) {
    // eliminated (or left): the warrior is gone
    if (u) useGame.setState({ units: s.units.filter((x) => x.wallet !== wallet) });
    return;
  }
  if (!me) return;
  // Fallen: back on your feet at home once your time is up (never while the bell is being decided).
  const nowS = Date.now() / 1000;
  if (u && u.hp <= 0 && u.deadUntil > 0 && nowS >= u.deadUntil && !s.game.pendingVrf) {
    const back = { ...teleportUnit(u, s.game, homeOf(me.faction), nowS), hp: RESPAWN_HP, deadUntil: 0, action: ACTION.IDLE };
    useGame.setState({ units: [...s.units.filter((x) => x.wallet !== wallet), back] });
    publishUnit();
    return;
  }
  // After the bell, a squad whose assault is over is pulled back home (the program will do this
  // in `battle_callback` with Step 17).
  if (u && u.faction === me.faction && s.game.epoch !== lastEpoch) {
    const first = lastEpoch === null;
    lastEpoch = s.game.epoch;
    const ordered = me.allocEpoch === s.game.epoch && me.allocTarget === u.at;
    if (!first && u.hp > 0 && s.game.territoryOwner[u.at] !== me.faction && !ordered) {
      const home = homeOf(me.faction);
      useGame.setState({ units: [...s.units.filter((x) => x.wallet !== wallet), teleportUnit(u, s.game, home, Date.now() / 1000)] });
      publishUnit();
    }
    return;
  }
  if (u && u.faction === me.faction) return;
  const now = Date.now() / 1000;
  const fresh = newUnit(wallet, me.faction, homeOf(me.faction), now);
  useGame.setState({ units: [...s.units.filter((x) => x.wallet !== wallet), fresh] });
  publishUnit();
}

function upsert(wallet: string, patch: (u: Unit) => Unit) {
  useGame.setState((s) => {
    const me = s.me;
    if (!me || me.status !== 'Active') throw new Error('Pledge to a kingdom first');
    const now = Date.now() / 1000;
    let u = s.units.find((x) => x.wallet === wallet);
    if (!u) u = newUnit(wallet, me.faction, homeOf(me.faction), now);
    // land a finished march first
    if (u.marchTo !== null && now >= u.marchAt) {
      const a = arrivalPoint(u.marchTo, u.marchFrom);
      u = { ...u, at: u.marchTo, x: a.x, z: a.z, facing: a.facing, marchTo: null, action: ACTION.IDLE };
    }
    const next = patch({ ...u, faction: me.faction, updatedAt: now });
    return { units: [...s.units.filter((x) => x.wallet !== wallet), next] };
  });
  // everyone else in the war sees it (lib/multiplayer/field.ts)
  publishUnit();
}

/**
 * After a confirmed `allocate`: an assault on a walled realm teleports the warrior to the camp
 * outside its gate; Defend (or an assault on the open plains) brings it home.
 */
export function teleportForOrder(wallet: string, target: number) {
  const g = useGame.getState().game;
  if (!g) return;
  upsert(wallet, (u) => {
    if (u.hp <= 0) return u;
    const to = target !== DEFEND && target < N_TERRITORIES ? target : g.territoryOwner[u.at] === u.faction ? u.at : homeOf(u.faction);
    return to === u.at ? u : teleportUnit(u, g, to, Date.now() / 1000);
  });
}

let seq = 1_000_000;

export function localUnitActions(wallet: string): UnitActions {
  return {
    async moveUnit(x, z, facing, action: UnitAction) {
      // the fallen lie still until they rise (a blow from another player may have just landed)
      upsert(wallet, (u) => (u.hp <= 0 ? u : { ...u, x, z, facing, action, ...(action === ACTION.DODGE && u.action !== ACTION.DODGE ? { dodgeAt: Date.now() / 1000 } : {}) }));
    },
    async setRole(role: Role) {
      upsert(wallet, (u) => ({ ...u, role }));
    },
    async setGear(gear: Gear) {
      upsert(wallet, (u) => {
        const powers = useGame.getState().game?.factions[u.faction].powers ?? 0;
        if (!gearAllowed(gear, powers)) throw new Error('Your kingdom cannot field that');
        return { ...u, gear };
      });
    },
    async march(to: number) {
      upsert(wallet, (u) => {
        const g = useGame.getState().game!;
        if (!marchTargets(g, u.faction, u.at).includes(to)) throw new Error('Not a neighbouring realm');
        return { ...teleportUnit(u, g, to, Date.now() / 1000), gear: u.gear ?? GEAR.TALWAR };
      });
    },
    async strike(x, z, facing, opts = {}) {
      const now = Date.now() / 1000;
      let swung: Unit | null = null;
      upsert(wallet, (u) => {
        if (u.hp <= 0) throw new Error('fallen');
        if (now + 0.08 < u.readyAt) throw new Error('not ready');
        swung = { ...u, x, z, facing, action: ACTION.ATTACK, readyAt: now + weaponOf(u.gear).cooldown };
        return swung;
      });
      const u = swung as Unit | null;
      if (!u) return;
      const w = weaponOf(u.gear);
      const ev = w.ranged
        ? { kind: 'arrow' as const, x: u.x, z: u.z, x2: u.x + Math.sin(facing) * w.range, z2: u.z + Math.cos(facing) * w.range }
        : { kind: 'swing' as const, x: u.x, z: u.z };
      useGame.setState((s) => ({
        events: [...s.events, { ...ev, id: ++seq, at: now, territory: u.at, by: wallet, byFaction: u.faction, gear: u.gear, heavy: opts.heavy, combo: opts.combo }].slice(-MAX_EVENTS),
      }));
      // other players see the blow; whoever it reaches decides if it lands (lib/multiplayer/field.ts)
      publishStrike(u, facing, opts);
    },
    async rally(territory, x, z) {
      const me = useGame.getState().me;
      if (!me || me.status !== 'Active') throw new Error('Pledge to a kingdom first');
      const now = Date.now() / 1000;
      useGame.setState((s) => ({
        rallies: [...s.rallies.filter((r) => r.by !== wallet && r.until > now), { faction: me.faction, territory, x, z, by: wallet, until: now + 25 }],
      }));
    },
  };
}
