'use client';

import { create } from 'zustand';

import type { Game, GameSource, Player, StoreStatus } from '@/lib/game/types';
import { runMock, type MockOptions } from '@/lib/mock/mockGame';

/**
 * The single game store (docs/IMPLEMENTATION_GUIDE.md Step 10). Fed by the mock
 * (NEXT_PUBLIC_MOCK=1) or, from Step 14, by one ER websocket subscription on the Game account.
 */
export interface GameStore {
  game: Game | null;
  /** All known players. Mock: every bot. ER: only the connected wallet's Player PDA. */
  players: Player[];
  /** The connected wallet's Player account, if any. */
  me: Player | null;
  /** base58 wallet of the connected user. */
  wallet: string | null;
  status: StoreStatus;
  source: GameSource | null;
  error: string | null;
  setWallet: (wallet: string | null) => void;
}

const findMe = (players: Player[], wallet: string | null) =>
  wallet ? (players.find((p) => p.wallet === wallet) ?? null) : null;

export const useGame = create<GameStore>((set, get) => ({
  game: null,
  players: [],
  me: null,
  wallet: null,
  status: 'idle',
  source: null,
  error: null,
  setWallet: (wallet) => set({ wallet, me: findMe(get().players, wallet) }),
}));

export const isMockMode = () => process.env.NEXT_PUBLIC_MOCK === '1';

/** Starts the in-browser mock. Returns an unsubscribe function. */
export function subscribeMock(options: MockOptions = {}): () => void {
  const epochSecs = Number(process.env.NEXT_PUBLIC_MOCK_EPOCH_SECS) || undefined;
  useGame.setState({ status: 'loading', source: 'mock', error: null });
  const stop = runMock(
    (game, players) =>
      useGame.setState((s) => ({ game, players, me: findMe(players, s.wallet), status: 'live' })),
    { epochSecs, ...options },
  );
  return () => {
    stop();
    useGame.setState({ status: 'idle' });
  };
}

/**
 * Live feed from the chain: the Game account (on the ER while delegated, else on base) via one
 * websocket subscription plus a slow safety poll, and the connected wallet's Player PDA by polling.
 */
export function subscribeER(): () => void {
  let stopped = false;
  let subId: number | null = null;
  let subConn: import('@solana/web3.js').Connection | null = null;
  const timers: ReturnType<typeof setInterval>[] = [];
  useGame.setState({ status: 'loading', source: 'er', error: null });

  void (async () => {
    const [{ programs, gamePda, playerPda, isDelegated }, { baseConnection, erConnection }, { toGame, toPlayer }, { PublicKey }] =
      await Promise.all([
        import('@/lib/solana/program'),
        import('@/lib/solana/connections'),
        import('@/lib/solana/decode'),
        import('@solana/web3.js'),
      ]);
    const { er } = programs();
    const game = gamePda();
    const decodeGame = (data: Buffer) => toGame(er.coder.accounts.decode('game', data));

    const layer = async () => ((await isDelegated(game)) ? erConnection() : baseConnection());

    const refreshGame = async () => {
      const conn = await layer();
      const info = await conn.getAccountInfo(game, 'confirmed');
      if (stopped) return;
      if (!info) {
        useGame.setState({ status: 'error', error: `Game ${game.toBase58()} not found. Run the create-game script.` });
        return;
      }
      useGame.setState({ game: decodeGame(info.data), status: 'live', error: null });
      if (subConn !== conn) {
        if (subConn && subId !== null) void subConn.removeAccountChangeListener(subId);
        subConn = conn;
        subId = conn.onAccountChange(
          game,
          (acc) => useGame.setState({ game: decodeGame(acc.data) }),
          'processed',
        );
      }
    };

    const refreshMe = async () => {
      const wallet = useGame.getState().wallet;
      if (!wallet) {
        if (useGame.getState().me) useGame.setState({ me: null, players: [] });
        return;
      }
      const pda = playerPda(game, new PublicKey(wallet));
      const conn = (await isDelegated(pda)) ? erConnection() : baseConnection();
      const info = await conn.getAccountInfo(pda, 'confirmed');
      if (stopped) return;
      if (!info || info.data.length < 8) {
        useGame.setState({ me: null, players: [] });
        return;
      }
      const me = toPlayer(er.coder.accounts.decode('player', info.data), useGame.getState().game);
      useGame.setState({ me, players: [me] });
    };

    const safe = (fn: () => Promise<void>) => () =>
      fn().catch((e) => console.warn('[samrajya feed]', (e as Error).message));
    await safe(refreshGame)();
    await safe(refreshMe)();
    timers.push(setInterval(safe(refreshGame), 5000), setInterval(safe(refreshMe), 2000));
  })().catch((e) => useGame.setState({ status: 'error', error: (e as Error).message }));

  return () => {
    stopped = true;
    timers.forEach(clearInterval);
    if (subConn && subId !== null) void subConn.removeAccountChangeListener(subId);
    useGame.setState({ status: 'idle' });
  };
}

/** Picks the feed from the environment. */
export function subscribeGame(): () => void {
  if (isMockMode()) return subscribeMock();
  try {
    return subscribeER();
  } catch (e) {
    useGame.setState({ status: 'error', source: 'er', error: (e as Error).message });
    return () => {};
  }
}
