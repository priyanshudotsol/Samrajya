import { currentMock, ixAllocate, ixJoin, ixLeave, ixSwitch } from '@/lib/mock/mockGame';

import type { GameActions } from './types';

function mock() {
  const m = currentMock();
  if (!m) throw new Error('The mock game is not running');
  return m;
}

function me(wallet: string) {
  const p = mock().state.players.find((x) => x.wallet === wallet);
  if (!p) throw new Error('Pledge to a kingdom first');
  return p;
}

/** Mock-mode actions: the connected wallet plays against the bots, instantly and for free. */
export function mockActions(wallet: string): GameActions {
  const run = async (fn: () => void) => {
    fn();
    mock().emit();
  };
  return {
    pledge: (faction, lamports) => run(() => void ixJoin(mock().state, wallet, faction, lamports)),
    allocate: (target, lamports) => run(() => ixAllocate(mock().state, me(wallet), target, lamports)),
    switchKingdom: (to) => run(() => void ixSwitch(mock().state, me(wallet), to)),
    leave: () => run(() => void ixLeave(mock().state, me(wallet))),
    claim: () =>
      run(() => {
        const p = me(wallet);
        if (mock().state.game.phase !== 'Ended') throw new Error('The war is not over');
        if (p.faction !== mock().state.game.winner) throw new Error('Only the ruling kingdom can claim');
        p.status = 'Claimed';
        p.claimed = true;
      }),
    ringBell: async () => {},
  };
}
