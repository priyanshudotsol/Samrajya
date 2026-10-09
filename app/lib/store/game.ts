'use client';

import { create } from 'zustand';

import type { ChatMessage } from '@/lib/chat/types';
import { GATE_HP, type CombatEvent } from '@/lib/game/combat';
import type { Game, GameSource, Player, StoreStatus } from '@/lib/game/types';
import type { Unit } from '@/lib/game/units';
import { runMock, type MockOptions, type Rally } from '@/lib/mock/mockGame';

/**
 * The single game store (docs/IMPLEMENTATION_GUIDE.md Step 10). Fed by the mock
 * (NEXT_PUBLIC_MOCK=1) or, from Step 14, by one ER websocket subscription on the Game account.
 */
export interface GameStore {
  game: Game | null;
  /** Id of the war being shown (ER: the registry's newest war). */
  gameId: number | null;
  /** All known players. Mock: every bot. ER: only the connected wallet's Player PDA. */
  players: Player[];
  /** Every known warrior (docs/ARCHITECTURE.md §10). Mock: all bots. ER: every delegated Player. */
  units: Unit[];
  /** Kingdom chat, every room the feed knows about (the HUD filters to the viewer's kingdom). */
  chat: ChatMessage[];
  /** Gate hit points per territory (docs/ARCHITECTURE.md §10.7). */
  gates: number[];
  /** Recent combat feedback: swings, hits, kills, arrows (the renderer animates the new ones). */
  events: CombatEvent[];
  /** Live rally pings (the viewer's kingdom's are drawn as beacons). */
  rallies: Rally[];
  /** The connected wallet's Player account, if any. */
  me: Player | null;
  /** base58 wallet of the connected user. */
  wallet: string | null;
  status: StoreStatus;
  /** Where the war lives right now: true = delegated to the MagicBlock ER, false = Solana. */
  onER: boolean | null;
  source: GameSource | null;
  error: string | null;
  setWallet: (wallet: string | null) => void;
}

const findMe = (players: Player[], wallet: string | null) =>
  wallet ? (players.find((p) => p.wallet === wallet) ?? null) : null;

export const useGame = create<GameStore>((set, get) => ({
  game: null,
  gameId: null,
  players: [],
  units: [],
  chat: [],
  gates: Array.from({ length: 6 }, () => GATE_HP),
  events: [],
  rallies: [],
  me: null,
  wallet: null,
  status: 'idle',
  onER: null,
  source: null,
  error: null,
  setWallet: (wallet) => set({ wallet, me: findMe(get().players, wallet) }),
}));

export const isMockMode = () => process.env.NEXT_PUBLIC_MOCK === '1';

const MOCK_WALLET_KEY = 'samrajya:mockWallet';

/**
 * Mock mode needs no real wallet: a persisted fake base58 wallet identifies the viewer so the
 * mock is playable (and testable) without Phantom. A connected wallet still takes precedence.
 */
export function mockWallet(): string {
  if (typeof window === 'undefined') return 'MockPlayer11111111111111111111111111111111';
  try {
    const hit = window.localStorage.getItem(MOCK_WALLET_KEY);
    if (hit) return hit;
  } catch {
    // storage blocked
  }
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let w = 'Me';
  for (let i = 0; i < 42; i++) w += B58[Math.floor(Math.random() * B58.length)];
  try {
    window.localStorage.setItem(MOCK_WALLET_KEY, w);
  } catch {
    // ignore
  }
  return w;
}

/** Starts the in-browser mock. Returns an unsubscribe function. */
export function subscribeMock(options: MockOptions = {}): () => void {
  // a hand-played epoch needs time to march (8 s), walk to a gate and fight: 60 s by default
  const epochSecs = Number(process.env.NEXT_PUBLIC_MOCK_EPOCH_SECS) || 60;
  useGame.setState({ status: 'loading', source: 'mock', error: null });
  const stop = runMock(
    (game, players, units, chat, { gates, events, rallies }) =>
      useGame.setState((s) => ({ game, gameId: game.gameId, players, units, chat, gates, events, rallies, me: findMe(players, s.wallet), status: 'live' })),
    { epochSecs, ...options },
    () => useGame.getState().wallet,
  );
  return () => {
    stop();
    useGame.setState({ status: 'idle' });
  };
}

/**
 * Live feed from the chain: the Game account (on the ER while delegated, else on base) via one
 * websocket subscription plus a slow safety poll, and the connected wallet's Player PDA by polling.
 * Follows the registry: when a newer war is opened the feed moves to it.
 */
export function subscribeER(): () => void {
  let stopped = false;
  let stopWarriors = () => {};
  let subId: number | null = null;
  let subConn: import('@solana/web3.js').Connection | null = null;
  const timers: ReturnType<typeof setInterval>[] = [];
  useGame.setState({ status: 'loading', source: 'er', error: null });

  void (async () => {
    const [{ programs, gamePda, playerPda, isDelegated, latestGameId, DELEGATION_PROGRAM_ID }, { baseConnection, erConnection, activeGameId, setActiveGameId }, { toGame, toPlayer }, { PublicKey }] =
      await Promise.all([
        import('@/lib/solana/program'),
        import('@/lib/solana/connections'),
        import('@/lib/solana/decode'),
        import('@solana/web3.js'),
      ]);
    const { er } = programs();
    let game = gamePda();
    const decodeGame = (data: Buffer) => toGame(er.coder.accounts.decode('game', data));
    const { watchWarriors, gateEvents } = await import('@/lib/chain/warriors');
    const { toUnit } = await import('@/lib/solana/decode');
    const { MAX_EVENTS } = await import('@/lib/game/combat');
    /** Shows a new Game snapshot; gate damage since the last one becomes events. */
    let evSeq = 4_000_000;
    const showGame = (data: Buffer) => {
      const g = decodeGame(data);
      const prev = useGame.getState().game;
      const evs = prev && prev.gameId === g.gameId ? gateEvents(prev.gates, g.gates) : [];
      useGame.setState((s) => ({
        game: g,
        ...(g.gates ? { gates: g.gates } : {}),
        ...(evs.length ? { events: [...s.events, ...evs.map((e) => ({ ...e, id: ++evSeq }))].slice(-MAX_EVENTS) } : {}),
      }));
    };
    // every member's warrior while the war is on the ER (lib/chain/warriors.ts)
    let warriors: { key: string; stop: () => void } | null = null;
    const followWarriors = (onER: boolean) => {
      const key = game.toBase58();
      if (onER && warriors?.key === key) return;
      warriors?.stop();
      warriors = null;
      if (!onER) return;
      const stop = watchWarriors({
        program: er,
        er: erConnection(),
        game,
        toPlayer: (raw) => toPlayer(raw, useGame.getState().game),
        toUnit: (raw) => toUnit(raw),
      });
      warriors = { key, stop };
    };
    stopWarriors = () => warriors?.stop();

    /**
     * Reads an account from whichever layer holds it, asking Solana as little as possible (public
     * devnet RPCs rate-limit hard): while it is on Solana the read itself shows when it gets
     * delegated (owner = delegation program); while it is on the ER, Solana is asked only every
     * 20 s whether it has come back.
     */
    const RECHECK_MS = 20_000;
    const where = new Map<string, { onER: boolean; at: number }>();
    const read = async (key: import('@solana/web3.js').PublicKey) => {
      const k = key.toBase58();
      const w = where.get(k);
      if (w?.onER && Date.now() - w.at < RECHECK_MS) {
        return { info: await erConnection().getAccountInfo(key, 'confirmed'), conn: erConnection() };
      }
      if (w?.onER) {
        const back = !(await isDelegated(key));
        where.set(k, { onER: !back, at: Date.now() });
        if (!back) return { info: await erConnection().getAccountInfo(key, 'confirmed'), conn: erConnection() };
      }
      const info = await baseConnection().getAccountInfo(key, 'confirmed');
      if (info && info.owner.equals(DELEGATION_PROGRAM_ID)) {
        where.set(k, { onER: true, at: Date.now() });
        return { info: await erConnection().getAccountInfo(key, 'confirmed'), conn: erConnection() };
      }
      where.set(k, { onER: false, at: Date.now() });
      return { info, conn: baseConnection() };
    };

    /**
     * Moves to the registry's newest war if it isn't the one shown. Checked at start, every 30 s,
     * and every refresh once the shown war has ended (public devnet RPCs rate-limit hard).
     */
    let registryAt = 0;
    const followRegistry = async () => {
      const ended = useGame.getState().game?.phase === 'Ended';
      if (!ended && registryAt && Date.now() - registryAt < 30_000) return;
      registryAt = Date.now();
      const latest = await latestGameId();
      if (latest === null || latest === activeGameId()) {
        if (useGame.getState().gameId === null) useGame.setState({ gameId: activeGameId() });
        return;
      }
      setActiveGameId(latest);
      game = gamePda(latest);
      if (subConn && subId !== null) void subConn.removeAccountChangeListener(subId);
      subConn = null;
      subId = null;
      useGame.setState({ gameId: latest, game: null, me: null, players: [], status: 'loading' });
    };

    const refreshGame = async () => {
      await followRegistry();
      const { info, conn } = await read(game);
      if (stopped) return;
      if (!info) {
        useGame.setState({ status: 'error', error: `Game ${game.toBase58()} not found. Run the create-game script.` });
        return;
      }
      const watched = game;
      showGame(info.data);
      useGame.setState({ status: 'live', error: null, onER: conn === erConnection() });
      followWarriors(conn === erConnection());
      if (subConn !== conn) {
        if (subConn && subId !== null) void subConn.removeAccountChangeListener(subId);
        subConn = conn;
        subId = conn.onAccountChange(
          watched,
          (acc) => {
            if (watched.equals(game)) showGame(acc.data);
          },
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
      const { info } = await read(pda);
      if (stopped) return;
      if (!info || info.data.length < 8) {
        useGame.setState({ me: null, players: [] });
        return;
      }
      const me = toPlayer(er.coder.accounts.decode('player', info.data), useGame.getState().game);
      // keep everyone else the warrior feed knows about
      useGame.setState((s) => ({ me, players: [...s.players.filter((p) => p.wallet !== me.wallet), me] }));
    };

    const safe = (fn: () => Promise<void>) => () =>
      fn().catch((e) => console.warn('[samrajya feed]', (e as Error).message));
    await safe(refreshGame)();
    await safe(refreshMe)();
    timers.push(setInterval(safe(refreshGame), 5000), setInterval(safe(refreshMe), 3000));
  })().catch((e) => useGame.setState({ status: 'error', error: (e as Error).message }));

  return () => {
    stopped = true;
    stopWarriors();
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
