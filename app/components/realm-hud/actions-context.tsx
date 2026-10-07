'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { toast } from 'sonner';

import { useGameActions, type GameActions } from '@/lib/actions';
import { play } from '@/lib/audio';

type Run = <K extends Exclude<keyof GameActions, 'ringBell'>>(
  name: K,
  args: Parameters<GameActions[K]>,
  success?: string,
) => Promise<boolean>;

interface Ctx {
  actions: GameActions | null;
  busy: boolean;
  stepLabel: string;
  connected: boolean;
  /** Runs an action with toasts; resolves true on success. */
  run: Run;
}

const ActionsCtx = createContext<Ctx | null>(null);

/** One `useGameActions()` for the whole HUD so busy/step state is shared. */
export function ActionsProvider({ children }: { children: ReactNode }) {
  const { actions, busy, stepLabel, connected } = useGameActions();
  const run = useCallback<Run>(
    async (name, args, success) => {
      if (!actions) {
        toast.error('Connect your wallet first');
        return false;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (actions[name] as (...a: any[]) => Promise<void>)(...args);
        if (success) toast.success(success);
        play('horn');
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [actions],
  );
  return <ActionsCtx.Provider value={{ actions, busy, stepLabel, connected, run }}>{children}</ActionsCtx.Provider>;
}

export function useHudActions(): Ctx {
  const c = useContext(ActionsCtx);
  if (!c) throw new Error('useHudActions outside ActionsProvider');
  return c;
}
