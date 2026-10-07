'use client';

import { useState } from 'react';
import { Coins, LogOut, Repeat, Trophy } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { KINGDOMS, kingdomGlow } from '@/lib/game/factions';
import { formatSol, leaveFee, previewLeave, previewSwitch, switchFee } from '@/lib/game/math';
import { useGame } from '@/lib/store/game';

import { useHudActions } from './actions-context';
import { liveMembership, Panel } from './kit';

/**
 * YOUR SHARE (KINGDOM_UI §7): current value, P&L vs deposited, Leave (−20%) / Switch (−40%)
 * with exact SOL kept/lost, disabled while a battle resolves. "Flee the realm?" nudge after
 * your kingdom loses a territory. Claim after the war if you're in the winning kingdom.
 */
export function YourShare() {
  const game = useGame((s) => s.game);
  const me = useGame((s) => s.me);
  const { run, busy, stepLabel } = useHudActions();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchTo, setSwitchTo] = useState<number | null>(null);
  const mem = liveMembership(game, me);
  if (!game || !me || !mem) return null;

  const f = game.factions[mem.faction];
  const value = mem.value;
  const pnl = value - me.depositedTotal;
  const pnlPct = me.depositedTotal > 0n ? Number((pnl * 10000n) / me.depositedTotal) / 100 : 0;
  const leave = previewLeave(game, f, me.shares, me.generation);
  const sw = previewSwitch(game, f, me.shares, me.generation);
  const resolving = game.pendingVrf;
  const ended = game.phase === 'Ended';
  const lostRecently = game.battleLog.some(
    (e) => e.defender === mem.faction && e.winner !== e.defender && e.epoch >= game.epoch - 1,
  );
  const canClaim = ended && game.winner === mem.faction && !me.claimed && me.status !== 'Claimed';
  const switchTargets = game.factions.map((x, i) => (x.alive && i !== mem.faction ? i : -1)).filter((i) => i >= 0);

  return (
    <Panel
      title="Your share"
      icon={<Coins className="h-3.5 w-3.5" />}
      right={
        <span className={`text-xs tracking-normal tabular-nums ${pnl >= 0n ? 'text-[#4CC27A]' : 'text-[var(--color-vermilion)]'}`}>
          {pnl >= 0n ? '+' : ''}
          {pnlPct.toFixed(1)}%
        </span>
      }
    >
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-text-secondary">
          Value in <span style={{ color: kingdomGlow(mem.faction) }}>{KINGDOMS[mem.faction].short}</span>
        </span>
        <span className="font-semibold tabular-nums text-text-primary">{formatSol(value, 3)} ◎</span>
      </div>
      <div className="flex justify-between text-xs text-text-secondary">
        <span>Paid in</span>
        <span className="tabular-nums">{formatSol(me.depositedTotal, 3)} ◎</span>
      </div>

      {lostRecently && !ended && (
        <div className="mt-2 border border-[var(--color-vermilion)]/60 bg-[#2a0d0a]/60 p-2 text-xs">
          <div className="font-rozha text-sm text-[var(--color-vermilion)]">Flee the realm?</div>
          Your kingdom just lost a territory. Leaving now keeps <b className="tabular-nums">{formatSol(leave.payout, 3)} ◎</b>.
        </div>
      )}

      {canClaim ? (
        <Button className="mt-3 w-full" clipCorners="top-left-bottom-right" disabled={busy} onClick={() => void run('claim', [], 'Your share of the empire is yours')}>
          <Trophy /> {busy && stepLabel ? stepLabel : `Claim ${formatSol(value, 3)} ◎`}
        </Button>
      ) : (
        !ended && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" disabled={busy || resolving} onClick={() => setSwitchOpen(true)} title={resolving ? 'Disabled while a battle resolves' : undefined}>
              <Repeat /> Switch −{switchFee(game) / 100}%
            </Button>
            <Button variant="outline" size="sm" disabled={busy || resolving} onClick={() => setLeaveOpen(true)} title={resolving ? 'Disabled while a battle resolves' : undefined}>
              <LogOut /> Leave −{leaveFee(game) / 100}%
            </Button>
          </div>
        )
      )}
      {busy && stepLabel && !canClaim && <p className="mt-1 text-[11px] text-text-highlight">{stepLabel}</p>}

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-rozha text-2xl text-text-highlight">Leave {KINGDOMS[mem.faction].name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              You receive <b className="text-text-primary tabular-nums">{formatSol(leave.payout, 4)} ◎</b>, and{' '}
              <b className="text-text-primary tabular-nums">{formatSol(leave.fee, 4)} ◎</b> stays with {KINGDOMS[mem.faction].name}
              {' '}({leaveFee(game) / 100}% fee).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              disabled={resolving}
              onClick={() => void run('leave', [], `You left with ${formatSol(leave.payout, 3)} ◎`)}
            >
              Leave the realm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-rozha text-2xl text-text-highlight">Switch kingdom</AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              <b className="text-text-primary tabular-nums">{formatSol(sw.moved, 4)} ◎</b> moves with you;{' '}
              <b className="text-text-primary tabular-nums">{formatSol(sw.fee, 4)} ◎</b> stays with {KINGDOMS[mem.faction].name} (
              {switchFee(game) / 100}% fee). Your current order is cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {switchTargets.map((i) => (
              <button
                key={i}
                onClick={() => setSwitchTo(i)}
                className={`border px-2 py-1.5 text-left text-sm ${switchTo === i ? 'border-border-active bg-background-quaternary' : 'border-border-default'}`}
              >
                <span className="font-rozha" style={{ color: kingdomGlow(i) }}>
                  {KINGDOMS[i].name}
                </span>
                <span className="block text-[11px] text-text-secondary">
                  ◎ {formatSol(game.factions[i].treasury)} · {game.factions[i].territories} terr.
                </span>
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={switchTo === null || resolving}
              onClick={() => switchTo !== null && void run('switchKingdom', [switchTo], `Pledged to ${KINGDOMS[switchTo].name}`)}
            >
              Switch{switchTo !== null ? ` to ${KINGDOMS[switchTo].short}` : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
