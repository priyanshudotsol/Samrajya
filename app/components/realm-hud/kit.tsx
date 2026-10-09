'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { Game, Player } from '@/lib/game/types';
import { valueOf } from '@/lib/game/math';

/** Parchment panel: ivory fill, gold hairline, jaali pattern (KINGDOM_UI §2). */
export function Panel({
  title,
  icon,
  right,
  children,
  className,
  highlight,
  id,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  highlight?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        'relative border bg-background-panel/90 backdrop-blur-sm jaali p-3 transition-colors duration-300',
        highlight ? 'border-border-active shadow-[0_0_18px_rgba(201,162,39,0.25)]' : 'border-border-default',
        className,
      )}
      style={{ clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)' }}
    >
      {title && (
        <h2 className="mb-2 flex items-center gap-2 text-[11px] tracking-[0.2em] text-text-highlight uppercase">
          {icon}
          <span className="flex-1">{title}</span>
          {right}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm" title={title}>
      <span className="text-text-secondary">{label}</span>
      <span className="tabular-nums text-text-primary">{children}</span>
    </div>
  );
}

/** Tweens towards `value` (simple rAF lerp). */
export function AnimatedNumber({ value, digits = 2, prefix = '', suffix = '' }: { value: number; digits?: number; prefix?: string; suffix?: string }) {
  const [shown, setShown] = useState(value);
  const cur = useRef(value);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const d = value - cur.current;
      if (Math.abs(d) < 10 ** -(digits + 1)) {
        cur.current = value;
        setShown(value);
        return;
      }
      cur.current += d * 0.18;
      setShown(cur.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, digits]);
  return (
    <span className="tabular-nums">
      {prefix}
      {shown.toFixed(digits)}
      {suffix}
    </span>
  );
}

/** Seconds clock that re-renders every `ms`. */
export function useNow(ms = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** The viewer's live membership: shares of the current generation in an alive kingdom. */
export function liveMembership(game: Game | null, me: Player | null) {
  if (!game || !me) return null;
  const f = game.factions[me.faction];
  if (!f || me.status !== 'Active' || me.shares === 0n || me.generation !== f.generation) return null;
  return { faction: me.faction, value: valueOf(f, me.shares, me.generation) };
}

export const pct = (p: number, d = 0) => `${(p * 100).toFixed(d)}%`;
