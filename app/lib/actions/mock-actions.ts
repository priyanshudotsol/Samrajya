import {
  currentMock,
  ixAllocate,
  ixJoin,
  ixLeave,
  ixMarch,
  ixMoveUnit,
  ixNewWar,
  ixRally,
  ixSetGear,
  ixSetRole,
  ixStrike,
  ixSwitch,
  ixUpgrade,
} from '@/lib/mock/mockGame';

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
    upgrade: (kind) => run(() => void ixUpgrade(mock().state, me(wallet), kind)),
    newWar: () => run(() => ixNewWar(mock().state)),
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
    startWar: async () => {
      throw new Error('The mock war is always running');
    },
    // Moves are frequent: mutate without an emit (the renderer owns the local warrior; everyone
    // else sees it on the next tick).
    moveUnit: async (x, z, facing, action) => ixMoveUnit(mock().state, me(wallet), x, z, facing, action),
    setRole: (role) => run(() => ixSetRole(mock().state, me(wallet), role)),
    setGear: (gear) => run(() => ixSetGear(mock().state, me(wallet), gear)),
    march: (to) => run(() => ixMarch(mock().state, me(wallet), to)),
    // the mock seizes an empty fort on its own tick (mockGame `seizeAbandoned`)
    seize: async () => {},
    strike: (x, z, facing, opts) => run(() => void ixStrike(mock().state, me(wallet), x, z, facing, opts)),
    rally: (territory, x, z) => run(() => ixRally(mock().state, me(wallet), territory, x, z)),
  };
}
