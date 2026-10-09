'use client';

import { useEffect, useMemo, useState } from 'react';
import { Shield, Swords } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useTactical, useTactics } from '@/lib/arena/useTactics';
import { KINGDOMS, kingdomInk, territoryName, ownerShort } from '@/lib/game/factions';
import { battleOdds, cloneGame, formatSol, isContested, validTargets } from '@/lib/game/math';
import { DEFEND, N_KINGDOMS, PLAINS, type Game, type Player } from '@/lib/game/types';
import { useRealmUi } from '@/lib/realm/ui-store';
import { useGame } from '@/lib/store/game';

import { useHudActions } from './actions-context';
import { liveMembership, Panel, pct } from './kit';

/** Game with the viewer's current allocation removed, so previews don't double count it. */
function withoutMine(game: Game, me: Player): Game {
  if (me.allocEpoch !== game.epoch || me.allocTarget === DEFEND || me.allocAmount === 0n) return game;
  const g = cloneGame(game);
  const a = g.factions[me.faction].attackAlloc;
  a[me.allocTarget] = a[me.allocTarget] > me.allocAmount ? a[me.allocTarget] - me.allocAmount : 0n;
  return g;
}

const MSOL = 1_000_000n; // slider unit: 0.001 SOL

/**
 * WAR ROOM (KINGDOM_UI §7): Defend / Attack radio limited to valid targets, amount slider up to
 * your value, live win-odds preview (same formula as the program), Commit → ER allocate (free).
 */
export function WarRoom({ territory }: { territory: number }) {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const players = useGame((s) => s.players);
  const focus = useRealmUi((s) => s.focus);
  const { run, busy, stepLabel } = useHudActions();
  const tactics = useTactics(territory);
  // warriors tracked → walled realms are decided by the fight, not dice (§10.8)
  const byFight = useTactical();
  const mem = liveMembership(game, me);
  const myF = mem?.faction ?? null;
  const targets = useMemo(() => (game && myF !== null ? validTargets(game, myF) : []), [game, myF]);
  const current = me && game && me.allocEpoch === game.epoch && me.allocTarget !== DEFEND ? me.allocTarget : DEFEND;

  const [choice, setChoice] = useState<number>(DEFEND);
  const [touched, setTouched] = useState(false);
  const maxM = mem ? Number(mem.value / MSOL) : 0;
  const [amountM, setAmountM] = useState(maxM);

  // Default selection: current order, else this realm if it's a valid target, else Defend.
  useEffect(() => {
    if (touched || !game) return;
    if (current !== DEFEND) setChoice(current);
    else if (game.territoryOwner[territory] !== myF && targets.includes(territory)) setChoice(territory);
    else setChoice(DEFEND);
  }, [current, territory, targets, touched, game, myF]);

  // Clicking the keep / barracks in the realm.
  useEffect(() => {
    if (!focus || !game) return;
    if (focus.kind === 'defend') {
      setChoice(DEFEND);
      setTouched(true);
    } else if (focus.kind === 'attack') {
      const t = focus.target ?? (targets.includes(territory) ? territory : targets[0]);
      if (t !== undefined) {
        setChoice(t);
        setTouched(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useEffect(() => {
    setAmountM((a) => (a > maxM || a === 0 ? maxM : a));
  }, [maxM]);

  // Commit when the epoch rolls → allow re-defaulting next epoch.
  useEffect(() => setTouched(false), [game?.epoch]);

  const preview = useMemo(() => {
    if (!game || !me || myF === null) return null;
    const base = withoutMine(game, me);
    if (choice === DEFEND) {
      const owned = base.territoryOwner.map((o, t) => (o === myF ? t : -1)).filter((t) => t >= 0);
      const rows = owned.filter((t) => isContested(base, t)).map((t) => ({ t, p: battleOdds(base, t).pDefend }));
      return { kind: 'defend' as const, rows };
    }
    const amount = BigInt(amountM) * MSOL;
    const o = battleOdds(base, choice, { faction: myF, amount }, choice === territory ? tactics : null);
    return { kind: 'attack' as const, p: o.pWin[myF], defend: o.pDefend, odds: o };
  }, [game, me, myF, choice, amountM, tactics, territory]);

  if (!game) return null;
  // The squad: members of your kingdom with orders on the chosen target this epoch.
  const squad =
    myF === null || choice === DEFEND
      ? 0
      : players.filter((p) => p.status === 'Active' && p.faction === myF && p.allocEpoch === game.epoch && p.allocTarget === choice).length;
  const highlight = focus?.kind === 'defend' || focus?.kind === 'attack';

  if (!mem || myF === null) {
    return (
      <Panel title="War room" icon={<Swords className="h-3.5 w-3.5" />} highlight={highlight}>
        <p className="text-xs text-text-secondary">Pledge to a kingdom to command its troops. Spectating {territoryName(territory)}.</p>
      </Panel>
    );
  }

  const locked = game.phase !== 'Active' || game.pendingVrf;
  const readOnly = game.territoryOwner[territory] !== myF && !targets.includes(territory);
  const commit = async () => {
    const lamports = choice === DEFEND ? mem.value : BigInt(amountM) * MSOL;
    const ok = await run(
      'allocate',
      [choice, lamports],
      choice === DEFEND
        ? 'Your strength defends home'
        : choice < N_KINGDOMS
          ? `Your warrior joins the assault at the gate of ${territoryName(choice)} (${formatSol(lamports)} ◎)`
          : `Marching on ${territoryName(choice)} with ${formatSol(lamports)} ◎`,
    );
    if (ok) setTouched(false);
  };

  return (
    <Panel
      title="War room"
      icon={<Swords className="h-3.5 w-3.5" />}
      highlight={highlight}
      right={<span className="text-[10px] tracking-normal normal-case text-text-secondary">You: {formatSol(mem.value)} ◎</span>}
    >
      <div className="mb-2 text-xs text-text-secondary">
        Order:{' '}
        {current === DEFEND ? (
          <span className="text-text-primary">Defend</span>
        ) : (
          <span style={{ color: kingdomInk(game.territoryOwner[current]) }}>
            Attack {territoryName(current)} · {formatSol(me!.allocAmount)} ◎
          </span>
        )}
        {readOnly && <span className="ml-1">(spectating — not adjacent)</span>}
      </div>
      <div role="radiogroup" className="space-y-1">
        <Radio checked={choice === DEFEND} onSelect={() => (setChoice(DEFEND), setTouched(true))}>
          <Shield className="h-3.5 w-3.5" /> Defend
        </Radio>
        {targets.map((t) => (
          <Radio key={t} checked={choice === t} onSelect={() => (setChoice(t), setTouched(true))}>
            <Swords className="h-3.5 w-3.5" /> Attack{' '}
            <span style={{ color: kingdomInk(game.territoryOwner[t]) }}>{territoryName(t)}</span>
            {game.territoryOwner[t] !== t && (
              <span className="text-[10px] text-text-secondary">({ownerShort(game.territoryOwner[t])})</span>
            )}
          </Radio>
        ))}
      </div>

      {choice !== DEFEND && (
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs text-text-secondary">
            <span>Commit</span>
            <span className="tabular-nums text-text-primary">{(amountM / 1000).toFixed(3)} ◎</span>
          </div>
          <Slider min={0} max={Math.max(maxM, 1)} step={1} value={[Math.min(amountM, maxM)]} onValueChange={([v]) => setAmountM(v)} disabled={locked} />
          <p className="text-[11px] text-text-secondary">
            {choice < N_KINGDOMS
              ? `Commit and your warrior is teleported to ${territoryName(choice)}'s gate with the squad${squad ? ` (${squad} of yours ordered there)` : ''}. The fight decides: clear the walls before the bell and it is yours.`
              : `Commit and your warrior is teleported to the edge of Kurukshetra with the squad${squad ? ` (${squad} of yours ordered there)` : ''}. Kill every defender on the plains and stand in the stone circle: it is yours at once.`}
          </p>
        </div>
      )}

      {preview?.kind === 'attack' && byFight ? (
        <div className="mt-2 text-sm">
          {!tactics || choice !== territory ? (
            <span>No dice: your squad must clear {territoryName(choice)}&apos;s walls and hold its gate at the bell.</span>
          ) : tactics.capturedBy === myF ? (
            <span className="font-semibold text-text-highlight">Fort cleared: it is yours at the bell if you hold the gate.</span>
          ) : (
            <span>
              No dice: kill or drive out the <span className="font-semibold tabular-nums">{tactics.heads.defendersInside}</span> defender
              {tactics.heads.defendersInside === 1 ? '' : 's'} inside the walls and stand at the gate when the bell rings.
            </span>
          )}
        </div>
      ) : preview?.kind === 'attack' && (
        <div className="mt-2 text-sm">
          Win odds <span className="font-semibold tabular-nums text-text-highlight">{pct(preview.p, 1)}</span>
          <span className="text-xs text-text-secondary"> · defender holds {pct(preview.defend, 1)}</span>
          {tactics && choice === territory && (
            <div className="text-[11px] text-text-secondary">
              Tactics: your warriors here ×{(Number(tactics.attackBps[myF]) / 10000).toFixed(2)}, their garrison ×{(Number(tactics.defenseBps) / 10000).toFixed(2)}. March your sainik here to raise it.
            </div>
          )}
        </div>
      )}
      {preview?.kind === 'defend' && (
        <div className="mt-2 space-y-0.5 text-sm">
          {preview.rows.length === 0 ? (
            <span className="text-xs text-text-secondary">None of your territories is under attack.</span>
          ) : (
            preview.rows.map((r) => (
              <div key={r.t} className="flex justify-between">
                <span>Hold {territoryName(r.t)}</span>
                <span className="tabular-nums text-text-highlight">{pct(r.p, 1)}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={commit} disabled={busy || locked || (choice !== DEFEND && amountM === 0)} clipCorners="top-left-bottom-right" className="flex-1">
          {busy && stepLabel ? stepLabel : 'Commit'}
        </Button>
        <span className="border border-border-tertiary px-1.5 py-0.5 text-[10px] text-text-highlight" title="ER transaction with your session key">
          free · instant
        </span>
      </div>
      {locked && game.pendingVrf && <p className="mt-1 text-[11px] text-text-secondary">Orders reopen after the battle.</p>}
    </Panel>
  );
}

function Radio({ checked, onSelect, children }: { checked: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 border px-2 py-1 text-left text-sm transition-colors ${
        checked ? 'border-border-active bg-background-quaternary text-text-primary' : 'border-border-muted text-text-secondary hover:border-border-tertiary'
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full border ${checked ? 'border-border-active bg-border-active' : 'border-border-tertiary'}`} />
      {children}
    </button>
  );
}
