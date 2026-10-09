'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crosshair, Footprints, MapPin, Shield, Swords, X } from 'lucide-react';

import * as THREE from 'three';

import { cameraState } from '@/lib/arena/cameraState';
import { control, drawn } from '@/lib/arena/controller';
import { FLOAT_MS, floaters } from '@/lib/arena/fx';
import { HEAVY_CHARGE_FULL, HEAVY_CHARGE_MIN, weaponOf } from '@/lib/game/combat';
import { KINGDOMS, kingdomInk } from '@/lib/game/factions';
import { GEARS, gearAllowed, isMarching, marchPose, shortWallet, type Gear } from '@/lib/game/units';
import { useGame } from '@/lib/store/game';

import { useHudActions } from './actions-context';
import { liveMembership, useNow } from './kit';

const GEAR_ICON = ['🗡', '🔱', '🏹', '🛡', '🪜', '🐘'];
const HELP_KEY = 'samrajya:fightHelpSeen';

function useMyUnit() {
  const wallet = useGame((s) => s.wallet);
  const units = useGame((s) => s.units);
  return wallet ? units.find((u) => u.wallet === wallet) : undefined;
}

/**
 * The fighting HUD at the bottom of the realm: health, the six weapons (1–6) with the cooldown
 * sweep, guard and target, and the gate's health. Only for members whose warrior stands here.
 */
export function ActionBar({ territory }: { territory: number }) {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const gates = useGame((s) => s.gates);
  const units = useGame((s) => s.units);
  const u = useMyUnit();
  const { actions } = useHudActions();
  useNow(100);
  const mem = liveMembership(game, me);
  if (!game || !mem || !u) return null;
  const nowS = Date.now() / 1000;
  const here = u.hp > 0 && !isMarching(u, nowS) && u.at === territory;
  void gates;
  const owner = game.territoryOwner[territory];
  const defendersAlive = units.filter((x) => x.at === territory && x.faction === owner && x.hp > 0 && !isMarching(x, nowS)).length;
  const charge = control.chargeFrom ? Math.min(1, (performance.now() - control.chargeFrom) / (HEAVY_CHARGE_FULL * 1000)) : 0;
  const combo = performance.now() - control.comboAt < 1400 ? control.combo : 0;
  const guardBroken = performance.now() < control.guardBrokenUntil;
  const powers = game.factions[u.faction].powers;
  const w = weaponOf(u.gear);
  const cd = Math.max(0, control.readyAt - nowS);
  const cdFrac = Math.min(1, cd / w.cooldown);
  const target = control.target ? units.find((x) => x.wallet === control.target) : null;
  const notice = control.notice && performance.now() - control.notice.at < 3500 ? control.notice.text : null;
  const enemiesHere = units.filter((x) => x.at === territory && x.faction !== u.faction && x.hp > 0 && !isMarching(x, nowS)).length;
  const friendsHere = units.filter((x) => x.at === territory && x.faction === u.faction && x.hp > 0 && !isMarching(x, nowS)).length;

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1.5">
      {notice && <div className="border border-border-active bg-background-panel/95 px-3 py-1 text-xs text-text-primary shadow">{notice}</div>}
      {target && target.hp > 0 && (
        <div className="flex items-center gap-2 border border-[var(--color-vermilion)] bg-background-panel/95 px-2 py-1 text-xs">
          <Crosshair className="h-3.5 w-3.5 text-[var(--color-vermilion)]" />
          <span style={{ color: kingdomInk(target.faction) }}>{shortWallet(target.wallet)}</span>
          <span className="text-text-secondary">{GEARS[target.gear].name}</span>
          <div className="h-1.5 w-24 bg-black/10">
            <div className="h-full bg-[var(--color-vermilion)]" style={{ width: `${target.hp}%` }} />
          </div>
          <button className="pointer-events-auto text-text-secondary hover:text-text-primary" onClick={() => (control.target = null)} aria-label="Cancel attack">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="pointer-events-auto flex items-end gap-3 border border-border-active bg-background-panel/95 px-3 py-2 shadow-[0_4px_18px_rgba(0,0,0,0.25)] backdrop-blur-sm">
        {/* health */}
        <div className="w-36">
          <div className="mb-0.5 flex justify-between text-[10px] tracking-[0.15em] text-text-highlight">
            <span>HEALTH</span>
            <span className="tabular-nums text-text-primary">{u.hp}</span>
          </div>
          <div className="h-2.5 w-full border border-border-muted bg-black/10">
            <div className="h-full transition-[width] duration-200" style={{ width: `${u.hp}%`, background: u.hp > 50 ? '#3fae6a' : u.hp > 25 ? '#d99a2b' : '#d2392c' }} />
          </div>
          <div className="mt-1 text-[10px] text-text-secondary">
            {here ? (
              <>
                <span style={{ color: kingdomInk(u.faction) }}>
                  {friendsHere} {friendsHere === 1 ? 'ally' : 'allies'}
                </span>{' '}
                · <span className="text-[var(--color-vermilion)]">{enemiesHere} {enemiesHere === 1 ? 'enemy' : 'enemies'}</span> here
              </>
            ) : u.hp <= 0 ? (
              'Fallen'
            ) : (
              `In ${KINGDOMS[marchPose(u, nowS).at].name}`
            )}
          </div>
        </div>

        {/* weapons */}
        <div className="flex gap-1">
          {GEARS.map((g) => {
            const ok = gearAllowed(g.id, powers);
            const on = u.gear === g.id;
            const ww = weaponOf(g.id as Gear);
            return (
              <button
                key={g.id}
                disabled={!ok || !actions}
                onClick={() => actions?.setGear(g.id as Gear).catch(() => {})}
                title={`${g.id + 1}: ${g.name} — ${g.blurb}\n${ww.ranged ? 'Ranged' : 'Melee'} · ${ww.damage} dmg · reach ${ww.range} · ${ww.cooldown}s${ww.gateDamage ? ` · gate ${ww.gateDamage}` : ''}`}
                className={`relative flex h-12 w-11 flex-col items-center justify-center border text-[10px] leading-none transition-colors disabled:opacity-35 ${
                  on ? 'border-border-active bg-background-quaternary text-text-primary' : 'border-border-muted text-text-secondary hover:border-border-tertiary'
                }`}
              >
                <span className="absolute left-0.5 top-0.5 text-[9px] text-text-secondary">{g.id + 1}</span>
                <span className="text-lg leading-none">{GEAR_ICON[g.id]}</span>
                <span className="mt-0.5">{g.name}</span>
                {on && cdFrac > 0 && <span className="absolute inset-x-0 bottom-0 bg-black/35" style={{ height: `${cdFrac * 100}%` }} />}
              </button>
            );
          })}
        </div>

        {/* stamina, the heavy wind-up and the combo */}
        <div className="w-32">
          <div className="mb-0.5 flex justify-between text-[10px] tracking-[0.15em] text-text-highlight">
            <span>{charge > 0 ? 'HEAVY' : 'STAMINA'}</span>
            <span className="tabular-nums text-text-primary">{charge > 0 ? `${Math.round(charge * 100)}%` : Math.round(control.stamina)}</span>
          </div>
          <div className="h-2.5 w-full border border-border-muted bg-black/10">
            <div
              className="h-full transition-[width] duration-75"
              style={
                charge > 0
                  ? { width: `${charge * 100}%`, background: charge >= 1 ? '#ff5a1f' : charge >= HEAVY_CHARGE_MIN / HEAVY_CHARGE_FULL ? '#ff9a3c' : '#a0682d' }
                  : { width: `${control.stamina}%`, background: guardBroken ? '#d2392c' : '#e3b341' }
              }
            />
          </div>
          <div className="mt-1 text-[10px] text-text-secondary">
            {guardBroken ? <span className="text-[var(--color-vermilion)]">Guard broken</span> : combo > 0 ? <span className="text-text-highlight">Combo ×{combo}</span> : 'Q roll · E heavy'}
          </div>
        </div>

        {/* controls reminder */}
        <div className="hidden flex-col gap-0.5 text-[10px] text-text-secondary xl:flex">
          <span>
            <Footprints className="inline h-3 w-3" /> <b className="text-text-primary">Click</b>/<b className="text-text-primary">WASD</b> · <b className="text-text-primary">Q</b> roll
          </span>
          <span>
            <Swords className="inline h-3 w-3" /> <b className="text-text-primary">Space</b> combo · <b className="text-text-primary">E</b> hold heavy
          </span>
          <span>
            <Shield className="inline h-3 w-3" /> <b className="text-text-primary">F</b> guard · <MapPin className="inline h-3 w-3" /> <b className="text-text-primary">G</b> rally
          </span>
        </div>

        {/* the gate: shut to enemies while one defender lives (§10.10) */}
        <div className="w-28">
          <div className="mb-0.5 flex justify-between text-[10px] tracking-[0.15em] text-text-highlight">
            <span>GATE</span>
            <span className="tabular-nums text-text-primary">{defendersAlive > 0 ? 'SHUT' : 'OPEN'}</span>
          </div>
          <div className="h-2.5 w-full border border-border-muted bg-black/10">
            <div className="h-full" style={{ width: defendersAlive > 0 ? '100%' : '0%', background: '#9a6b3a' }} />
          </div>
          <div className="mt-1 text-[10px] text-text-secondary">
            {owner === u.faction ? 'Hold the gate' : defendersAlive > 0 ? `${defendersAlive} defender${defendersAlive === 1 ? '' : 's'} alive` : 'Walk in!'}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Full-screen notice while your warrior is down, with the respawn countdown. */
export function FallenOverlay() {
  const u = useMyUnit();
  const game = useGame((s) => s.game);
  const events = useGame((s) => s.events);
  const wallet = useGame((s) => s.wallet);
  useNow(250);
  if (!u || !game || u.hp > 0 || u.deadUntil <= 0) return null;
  const left = Math.max(0, Math.ceil(u.deadUntil - Date.now() / 1000));
  const killer = [...events].reverse().find((e) => e.kind === 'kill' && e.target === wallet);
  const owned = game.territoryOwner.map((o, t) => (o === u.faction ? t : -1)).filter((t) => t >= 0);
  const home = owned.includes(u.faction) ? u.faction : owned[0];
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(120,0,0,0.05),rgba(90,0,0,0.45))]">
      <div className="border border-[var(--color-vermilion)] bg-background-panel/95 px-6 py-4 text-center shadow-xl">
        <div className="font-tiro text-2xl text-[var(--color-vermilion)]">You have fallen</div>
        {killer && (
          <div className="mt-1 text-xs text-text-secondary">
            {weaponOf(killer.gear).verb} by <span style={{ color: kingdomInk(killer.byFaction) }}>{shortWallet(killer.by)}</span>
          </div>
        )}
        <div className="mt-2 text-sm text-text-primary">
          You are out of this fight. You rise again{home !== undefined ? ` in ${KINGDOMS[home].name}` : ''} after the bell
          {left > 0 && (
            <>
              {' '}
              (<span className="tabular-nums font-semibold">{left}</span> s)
            </>
          )}
        </div>
        <div className="mt-1 text-[11px] text-text-secondary">Only the living decide the bell. Rally your kingdom in chat.</div>
      </div>
    </div>
  );
}

/** First-time card: how to fight. Shown once per browser after you get a warrior. */
export function HowToFight() {
  const u = useMyUnit();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!u) return;
    try {
      if (!window.localStorage.getItem(HELP_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [u]);
  if (!open) return null;
  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(HELP_KEY, '1');
    } catch {
      // ignore
    }
  };
  const row = (k: string, v: string) => (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 font-semibold text-text-primary">{k}</span>
      <span>{v}</span>
    </div>
  );
  return (
    <div className="pointer-events-auto absolute left-1/2 top-24 z-40 w-[440px] -translate-x-1/2 border border-border-active bg-background-panel/97 p-4 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-tiro text-xl text-text-highlight">Command your sainik</h2>
        <button onClick={close} aria-label="Close" className="text-text-secondary hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-1 text-xs text-text-secondary">
        {row('Left click', 'Walk there. Click an enemy to chase and attack it.')}
        {row('W A S D', 'Walk. Hold Shift to run.')}
        {row('Space', 'Light blow towards the cursor; three in a row make a combo, the third a spinning finisher. Aim snaps to the enemy in front.')}
        {row('E (hold)', 'Wind up a heavy blow, release to land it: ×1.8 damage, breaks a raised guard. Everyone sees the wind-up.')}
        {row('Q', 'Dodge roll: untouchable for a moment. Roll away from a heavy wind-up.')}
        {row('F (hold)', 'Raise your guard: blocks light blows. Blows on your guard cost stamina; at 0 the guard breaks.')}
        {row('1 – 6', 'Talwar, Bhala, Dhanush, Dhal, Seedhi, Gaja.')}
        {row('G', 'Rally your kingdom at the cursor. Allies gather there.')}
        {row('Right drag · wheel', 'Turn and zoom the camera. H hides the panels.')}
      </div>
      <div className="mt-3 border-t border-border-muted pt-2 text-[11px] text-text-secondary">
        <b className="text-text-primary">How battles are won:</b> a fort's gate stays shut to enemies while a single defender lives in that realm. Fight them at the gate, shoot over the walls with a Dhanush, kill every one, then walk in and hold the gate when the bell rings. No dice: the fight decides. Plan it with your kingdom in chat.
      </div>
      <button onClick={close} className="mt-3 w-full border border-border-active bg-background-quaternary py-1.5 text-sm text-text-primary hover:brightness-105">
        To battle
      </button>
    </div>
  );
}

/**
 * Keeps the camera with your warrior: when it marches or respawns into another realm while you
 * were watching it, the realm screen follows. Also offers a jump when you are watching elsewhere.
 */
export function FollowWarrior({ territory }: { territory: number }) {
  const router = useRouter();
  const u = useMyUnit();
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const prev = useRef<number | null>(null);
  useNow(250);
  const nowS = Date.now() / 1000;
  const at = u ? (u.hp > 0 ? marchPose(u, nowS).at : u.at) : null;
  useEffect(() => {
    if (at === null) return;
    if (prev.current === territory && at !== territory) router.push(`/kingdom/${at}`);
    prev.current = at;
  }, [at, territory, router]);
  if (!u || !game || !liveMembership(game, me) || at === null || at === territory || u.hp <= 0) return null;
  return (
    <button
      className="pointer-events-auto border border-border-active bg-background-panel/95 px-3 py-1.5 text-xs text-text-primary shadow hover:brightness-105"
      onClick={() => router.push(`/kingdom/${at}`)}
    >
      Your warrior is in <span style={{ color: kingdomInk(game.territoryOwner[at]) }}>{KINGDOMS[at].name}</span> — go there →
    </button>
  );
}

/** Spectators: tell them how to get a warrior of their own. */
export function CommandPrompt({ territory }: { territory: number }) {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  if (!game || liveMembership(game, me) || game.phase === 'Ended') return null;
  const owner = game.territoryOwner[territory];
  return (
    <div className="pointer-events-none border border-border-active bg-background-panel/95 px-3 py-1.5 text-xs text-text-primary shadow">
      <Swords className="mr-1 inline h-3.5 w-3.5" /> Spectating. Pledge to <span style={{ color: kingdomInk(owner) }}>{KINGDOMS[owner].name}</span> (right panel) to
      command your own warrior.
    </div>
  );
}

const FLOATER_POOL = 24;

/**
 * Floating combat numbers, drawn in the DOM over the canvas (not drei <Html>, which mounts a
 * React root per label). Positions are projected through the realm camera every frame.
 */
export function FloaterLayer() {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = layer.current;
    if (!root) return;
    const pool = Array.from({ length: FLOATER_POOL }, () => {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;font-weight:700;pointer-events:none;text-shadow:0 1px 2px #000,0 0 4px #000;display:none;will-change:transform,opacity';
      root.appendChild(el);
      return el;
    });
    const v = new THREE.Vector3();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const cam = cameraState.camera;
      const canvas = document.querySelector('canvas');
      const nowMs = performance.now();
      // drop the finished ones
      while (floaters.length && nowMs - floaters[0].born > FLOAT_MS) floaters.shift();
      const cr = canvas?.getBoundingClientRect();
      const lr = root.getBoundingClientRect();
      for (let i = 0; i < pool.length; i++) {
        const el = pool[i];
        const f = floaters[i];
        if (!f || !cam || !cr) {
          el.style.display = 'none';
          continue;
        }
        v.set(f.x, f.y, f.z).project(cam);
        if (v.z > 1) {
          el.style.display = 'none';
          continue;
        }
        const k = (nowMs - f.born) / FLOAT_MS;
        const sx = ((v.x + 1) / 2) * cr.width + cr.left - lr.left;
        const sy = ((1 - v.y) / 2) * cr.height + cr.top - lr.top - k * 36;
        el.style.display = 'block';
        el.textContent = f.text;
        el.style.color = f.color;
        el.style.fontSize = f.big ? '16px' : '11px';
        el.style.opacity = String(Math.max(0, 1 - k * k));
        el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      pool.forEach((el) => el.remove());
    };
  }, []);
  return <div ref={layer} className="pointer-events-none absolute inset-0 overflow-hidden" />;
}

const ROLE_GLYPH = ['🛡', '⚔', '↔', '🏹'];
const MAX_LABELS = 28;

/**
 * Name tags over the warriors in this realm (name, role, gear, kingdom, health), as plain DOM
 * positioned every frame from the renderer's poses. Your own tag is always shown first.
 */
export function UnitLabels({ territory }: { territory: number }) {
  const units = useGame((s) => s.units);
  const wallet = useGame((s) => s.wallet);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const layer = useRef<HTMLDivElement>(null);
  useNow(1000); // refresh who is here (marchers come and go)
  const nowS = Date.now() / 1000;
  const here = units
    .filter((u) => (u.hp > 0 || u.deadUntil > nowS) && (u.hp > 0 ? marchPose(u, nowS).at : u.at) === territory)
    .sort((a, b) => (a.wallet === wallet ? -1 : b.wallet === wallet ? 1 : 0))
    .slice(0, MAX_LABELS);

  useEffect(() => {
    const v = new THREE.Vector3();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const cam = cameraState.camera;
      const canvas = document.querySelector('canvas');
      const root = layer.current;
      if (!cam || !canvas || !root) return;
      const cr = canvas.getBoundingClientRect();
      const lr = root.getBoundingClientRect();
      for (const [w, el] of refs.current) {
        const p = drawn.get(w);
        if (!p) {
          el.style.display = 'none';
          continue;
        }
        v.set(p.x, p.y + 0.72, p.z).project(cam);
        if (v.z > 1) {
          el.style.display = 'none';
          continue;
        }
        el.style.display = 'block';
        el.style.transform = `translate(${((v.x + 1) / 2) * cr.width + cr.left - lr.left}px, ${((1 - v.y) / 2) * cr.height + cr.top - lr.top}px) translate(-50%, -100%)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0 overflow-hidden">
      {here.map((u) => {
        const mine = u.wallet === wallet;
        return (
          <div
            key={u.wallet}
            ref={(el) => {
              if (el) refs.current.set(u.wallet, el);
              else refs.current.delete(u.wallet);
            }}
            className={`absolute left-0 top-0 whitespace-nowrap border bg-background-panel/85 px-1 py-[1px] text-[10px] leading-tight shadow-sm ${mine ? 'border-border-active' : 'border-border-muted'}`}
            style={{ color: kingdomInk(u.faction), display: 'none' }}
          >
            <span className="font-semibold">{mine ? 'You' : shortWallet(u.wallet)}</span>
            {u.hp <= 0 && <span className="ml-1 text-[var(--color-vermilion)]">fallen</span>}
            <span className="ml-1 opacity-80">{ROLE_GLYPH[u.role]}</span>
            <span className="ml-1 text-text-secondary">{GEARS[u.gear].name}</span>
            <span className="ml-1 text-text-secondary">· {KINGDOMS[u.faction].short}</span>
            <div className="mt-[2px] h-[3px] w-full bg-black/10">
              <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, u.hp))}%`, background: u.hp > 50 ? '#4CC27A' : u.hp > 25 ? '#E8B04A' : '#E2483C' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Red edges when you are hit (pale gold when your guard took it), and a pulse at low health. */
export function HurtVignette() {
  const el = useRef<HTMLDivElement>(null);
  const u = useMyUnit();
  const low = !!u && u.hp > 0 && u.hp < 30;
  useEffect(() => {
    const onHurt = (e: Event) => {
      const d = el.current;
      if (!d) return;
      const blocked = (e as CustomEvent<{ blocked: boolean }>).detail?.blocked;
      d.style.transition = 'none';
      d.style.boxShadow = blocked ? 'inset 0 0 90px 20px rgba(255,214,120,0.45)' : 'inset 0 0 140px 40px rgba(200,0,0,0.6)';
      d.style.opacity = '1';
      requestAnimationFrame(() => {
        d.style.transition = 'opacity 600ms ease-out';
        d.style.opacity = '0';
      });
    };
    window.addEventListener('samrajya:hurt', onHurt);
    return () => window.removeEventListener('samrajya:hurt', onHurt);
  }, []);
  return (
    <>
      <div ref={el} className="pointer-events-none absolute inset-0 z-30 opacity-0" />
      {low && <div className="pointer-events-none absolute inset-0 z-30 animate-pulse shadow-[inset_0_0_120px_30px_rgba(160,0,0,0.45)]" />}
    </>
  );
}
