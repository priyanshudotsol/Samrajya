'use client';

import { useState } from 'react';
import { Footprints, Keyboard, Swords } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTactical } from '@/lib/arena/useTactics';
import { KINGDOMS, kingdomInk, territoryName } from '@/lib/game/factions';
import { PLAINS } from '@/lib/game/types';
import { GEARS, gearAllowed, isMarching, MARCH_SECS, marchProgress, marchTargets, ROLES, zoneOf, ZONE_LABEL, type Gear, type Role } from '@/lib/game/units';
import { useFieldStatus } from '@/lib/multiplayer/useFieldSync';
import { isMockMode, useGame } from '@/lib/store/game';

import { useHudActions } from './actions-context';
import { liveMembership, Panel, useNow } from './kit';

const ROLE_ICON = ['🛡', '⚔', '↔', '🏹'];

/**
 * SAINIK — your warrior (docs/KINGDOM_UI.md §11.2): where it stands, its wounds, the role and
 * gear you chose, and marching orders to neighbouring realms. Mouse and keyboard move it.
 */
export function SainikPanel({ territory }: { territory: number }) {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const wallet = useGame((s) => s.wallet);
  const units = useGame((s) => s.units);
  const tactical = useTactical();
  const { run, busy } = useHudActions();
  const now = useNow(500) / 1000;
  const [showKeys, setShowKeys] = useState(false);
  const mem = liveMembership(game, me);
  if (!game || !mem) return null;
  const u = wallet ? units.find((x) => x.wallet === wallet) : undefined;
  if (!u) {
    return (
      <Panel title="Sainik" icon={<Swords className="h-3.5 w-3.5" />}>
        <p className="text-xs text-text-secondary">Your warrior is on its way…</p>
      </Panel>
    );
  }
  const marching = isMarching(u, now);
  const here = u.at === territory;
  const zone = zoneOf(u.x, u.z);
  const powers = game.factions[u.faction].powers;
  const targets = marchTargets(game, u.faction, u.at);
  const locked = busy || game.pendingVrf || game.phase !== 'Active';

  return (
    <Panel
      title="Sainik"
      icon={<Swords className="h-3.5 w-3.5" />}
      right={
        <button className="text-[10px] tracking-normal normal-case text-text-secondary hover:text-text-highlight" onClick={() => setShowKeys((v) => !v)} title="Controls">
          <Keyboard className="inline h-3.5 w-3.5" /> keys
        </button>
      }
    >
      {showKeys && (
        <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-0.5 border border-border-muted px-2 py-1 text-[10px] text-text-secondary">
          <span><b className="text-text-primary">Click</b> walk / attack</span>
          <span><b className="text-text-primary">W A S D</b> walk, <b className="text-text-primary">Shift</b> run</span>
          <span><b className="text-text-primary">Space</b> strike at cursor</span>
          <span><b className="text-text-primary">F</b> guard (hold)</span>
          <span><b className="text-text-primary">1–6</b> weapons</span>
          <span><b className="text-text-primary">G</b> rally at cursor</span>
          <span className="col-span-2">Seedhi climbs walls. The gate opens for enemies when nobody defends inside, or once it is battered down.</span>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-text-secondary">
          {marching ? (
            <>
              Marching to <span style={{ color: kingdomInk(game.territoryOwner[u.marchTo!]) }}>{KINGDOMS[u.marchTo!].name}</span> ·{' '}
              {Math.max(0, Math.ceil((1 - marchProgress(u, now)) * MARCH_SECS))} s
            </>
          ) : here ? (
            <>
              Here, <span className="text-text-primary">{ZONE_LABEL[zone]}</span>
            </>
          ) : (
            <>
              In <span style={{ color: kingdomInk(game.territoryOwner[u.at]) }}>{KINGDOMS[u.at].name}</span>, {ZONE_LABEL[zone]}
            </>
          )}
        </span>
        <span className="tabular-nums" title="Wounds heal 5 per epoch">
          ♥ <span style={{ color: u.hp > 50 ? '#1c7d45' : u.hp > 25 ? '#a0670a' : '#b3261e' }}>{u.hp}</span>
        </span>
      </div>

      <div className="mb-1 text-[10px] tracking-[0.2em] text-text-highlight">ROLE</div>
      <div className="mb-2 grid grid-cols-4 gap-1">
        {ROLES.map((r) => (
          <button
            key={r.id}
            title={r.blurb}
            disabled={locked}
            onClick={() => void run('setRole', [r.id as Role], `${r.name}: ${r.blurb}`)}
            className={`border px-1 py-1 text-center text-[11px] leading-tight transition-colors ${
              u.role === r.id ? 'border-border-active bg-background-quaternary text-text-primary' : 'border-border-muted text-text-secondary hover:border-border-tertiary'
            }`}
          >
            <div>{ROLE_ICON[r.id]}</div>
            <div>{r.name}</div>
          </button>
        ))}
      </div>

      <div className="mb-1 text-[10px] tracking-[0.2em] text-text-highlight">GEAR</div>
      <div className="mb-2 grid grid-cols-3 gap-1">
        {GEARS.map((g) => {
          const ok = gearAllowed(g.id, powers);
          return (
            <button
              key={g.id}
              title={ok ? g.blurb : `${g.blurb} (needs the power)`}
              disabled={locked || !ok}
              onClick={() => void run('setGear', [g.id as Gear], `${g.name}: ${g.blurb}`)}
              className={`border px-1 py-1 text-left text-[11px] leading-tight transition-colors disabled:opacity-40 ${
                u.gear === g.id ? 'border-border-active bg-background-quaternary text-text-primary' : 'border-border-muted text-text-secondary hover:border-border-tertiary'
              }`}
            >
              <div>{g.name}</div>
              <div className="font-tiro text-[10px] opacity-70" lang="hi">
                {g.hindi}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mb-1 flex items-center gap-1 text-[10px] tracking-[0.2em] text-text-highlight">
        <Footprints className="h-3 w-3" /> TELEPORT
      </div>
      {marching ? (
        <p className="text-xs text-text-secondary">On the road. Hold tight.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {targets.map((t) => (
            <Button
              key={t}
              size="sm"
              variant="outline"
              disabled={locked}
              clipCorners="top-left-bottom-right"
              onClick={() => void run('march', [t], game.territoryOwner[t] === u.faction ? `Teleported to ${territoryName(t)}` : t === PLAINS ? `Teleported to ${territoryName(t)}` : `Teleported to the gate of ${territoryName(t)}`)}
              title={game.territoryOwner[t] === u.faction ? 'Your kingdom holds this realm' : `Held by ${KINGDOMS[game.territoryOwner[t]].name}`}
            >
              → <span style={{ color: kingdomInk(game.territoryOwner[t]) }}>{territoryName(t)}</span>
            </Button>
          ))}
        </div>
      )}
      {!isMockMode() && <FieldLine tactical={tactical} />}
    </Panel>
  );
}

/** Whether the shared battlefield is connected (devnet, lib/multiplayer/field.ts). */
function FieldLine({ tactical }: { tactical: boolean }) {
  const { status: lobbyStatus, error } = useFieldStatus();
  const onER = useGame((s) => s.onER);
  // during the war the battlefield is the ER itself
  const status = onER ? 'er' : lobbyStatus;
  const text =
    status === 'er'
      ? `Battlefield on the MagicBlock ER: every step and blow is an ER transaction, and the program decides each fort by the fight${tactical ? '' : ' (nobody else here yet)'}.`
      : status === 'live'
      ? `Battlefield live: warriors are shared with every member online${tactical ? '' : ' (nobody else here yet)'}.`
      : status === 'connecting'
        ? 'Joining the battlefield… (your wallet may ask you to sign once)'
        : status === 'error'
          ? `Battlefield unavailable: ${error}`
          : 'Battlefield offline.';
  return (
    <p className={`mt-2 text-[10px] ${status === 'error' ? 'text-[var(--color-vermilion)]' : 'text-text-secondary'}`}>
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: status === 'er' ? '#b48cff' : status === 'live' ? '#14f195' : status === 'error' ? '#e5484d' : '#c9a227' }} />
      {text}
    </p>
  );
}
