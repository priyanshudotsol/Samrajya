import { type TourStep } from '@/components/tour';
import { TOUR_STEP_IDS } from './tour-constants';

export const SAMRAJYA_TOUR_STEPS: TourStep[] = [
  {
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Pledge to a kingdom</h3>
        <p className="text-sm text-muted-foreground">
          Connect a Solana wallet and stake SOL into a kingdom. You receive shares of its treasury,
          and the treasury is the kingdom&apos;s army.
        </p>
      </div>
    ),
    selectorId: TOUR_STEP_IDS.KINGDOM_LIST,
    position: 'right',
  },
  {
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Defend or attack</h3>
        <p className="text-sm text-muted-foreground">
          Each epoch, put your strength into defending home or attacking a neighbour. Glowing sky
          routes between the islands show live attacks. Click an island to open its realm.
        </p>
      </div>
    ),
    selectorId: TOUR_STEP_IDS.WORLD_MAP,
    position: 'top',
  },
  {
    content: (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Watch the bell</h3>
        <p className="text-sm text-muted-foreground">
          When the epoch ends, VRF weighted by strength decides every battle. Winners take the
          territory, loot and powers. Last kingdom standing splits the pot.
        </p>
      </div>
    ),
    selectorId: TOUR_STEP_IDS.BATTLES_PANEL,
    position: 'left',
  },
];
