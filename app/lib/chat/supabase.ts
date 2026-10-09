'use client';

/**
 * Kingdom-private chat over Supabase Realtime (docs/ARCHITECTURE.md §10.5).
 *
 * Privacy: Realtime "private channels" are authorised by RLS on `realtime.messages`, so a client
 * can only join `samrajya:<game>:<faction>` with a JWT whose claims say it is a member of that
 * kingdom. The JWT comes from our own route handler `app/api/chat/token/route.ts`, which checks a
 * wallet signature and reads the Player PDA on the ER before signing with SUPABASE_JWT_SECRET.
 * See `supabase/chat.sql` for the policies.
 *
 * Needs: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (client) and SUPABASE_JWT_SECRET
 * (server). Without them `openRoom` throws and the HUD shows the chat as unavailable.
 */
import type { ChatMessage } from './types';

export interface SupabaseRoom {
  history: ChatMessage[];
  send(text: string): Promise<void>;
  close(): void;
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function signIn(wallet: string, gameId: number, faction: number): Promise<string> {
  // one wallet signature per session; the token lasts 2 h like the session key
  const cacheKey = `samrajya:chatToken:${gameId}:${faction}:${wallet}`;
  try {
    const hit = window.sessionStorage.getItem(cacheKey);
    if (hit) {
      const { token, exp } = JSON.parse(hit) as { token: string; exp: number };
      if (exp > Date.now() / 1000 + 60) return token;
    }
  } catch {
    // ignore
  }
  const { signMessage } = await walletSigner();
  const ts = Math.floor(Date.now() / 1000);
  const msg = `Samrajya war council\ngame ${gameId}\nkingdom ${faction}\nwallet ${wallet}\nts ${ts}`;
  const sig = await signMessage(new TextEncoder().encode(msg));
  const res = await fetch('/api/chat/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet, gameId, faction, ts, signature: Array.from(sig) }),
  });
  if (!res.ok) throw new Error((await res.text()) || `token ${res.status}`);
  const { token, exp } = (await res.json()) as { token: string; exp: number };
  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify({ token, exp }));
  } catch {
    // ignore
  }
  return token;
}

/** The wallet adapter's signMessage, reached without React (the room is opened from a hook). */
async function walletSigner(): Promise<{ signMessage: (m: Uint8Array) => Promise<Uint8Array> }> {
  const w = (window as unknown as { solana?: { signMessage?: (m: Uint8Array, enc: string) => Promise<{ signature: Uint8Array }> } }).solana;
  if (w?.signMessage) {
    return { signMessage: async (m) => (await w.signMessage!(m, 'utf8')).signature };
  }
  throw new Error('Your wallet cannot sign messages');
}

type Client = import('@supabase/supabase-js').SupabaseClient;
const clients = new Map<string, Promise<Client>>();

/**
 * One Realtime connection per member (game, kingdom, wallet), shared by the kingdom chat and the
 * battlefield (lib/multiplayer/field.ts); the wallet signs in once for both.
 */
export function realtimeClient(gameId: number, faction: number, wallet: string): Promise<Client> {
  const key = `${gameId}:${faction}:${wallet}`;
  let c = clients.get(key);
  if (!c) {
    c = (async () => {
      if (!URL || !ANON) throw new Error('Chat is not configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)');
      const { createClient } = await import('@supabase/supabase-js');
      const token = await signIn(wallet, gameId, faction);
      const client = createClient(URL, ANON, { realtime: { params: { eventsPerSecond: 20 } } });
      await client.realtime.setAuth(token);
      return client;
    })();
    c.catch(() => clients.delete(key));
    clients.set(key, c);
  }
  return c;
}

/**
 * Joins a private channel, retrying once on MissingPartition: Realtime stores messages in daily
 * partitions, and the first join of a day on a quiet project can fail while Supabase creates it.
 */
export async function joinPrivate(
  client: Client,
  topic: string,
  setup: (ch: import('@supabase/supabase-js').RealtimeChannel) => void,
  self = true,
): Promise<import('@supabase/supabase-js').RealtimeChannel> {
  const join = () => {
    const ch = client.channel(topic, { config: { private: true, broadcast: { self } } });
    setup(ch);
    return new Promise<typeof ch>((resolve, reject) => {
      ch.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve(ch);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void client.removeChannel(ch);
          reject(new Error(err?.message ?? `channel ${status}`));
        }
      });
    });
  };
  try {
    return await join();
  } catch (e) {
    if (!/MissingPartition/i.test((e as Error).message)) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return join();
  }
}

export async function openRoom(opts: { gameId: number; faction: number; wallet: string; onMessage: (m: ChatMessage) => void }): Promise<SupabaseRoom> {
  const client = await realtimeClient(opts.gameId, opts.faction, opts.wallet);
  const topic = `samrajya:${opts.gameId}:${opts.faction}`;
  const history: ChatMessage[] = [];
  const channel = await joinPrivate(client, topic, (ch) =>
    ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
      const m = payload as ChatMessage;
      if (m && typeof m.text === 'string') opts.onMessage(m);
    }),
  );
  return {
    history,
    async send(text) {
      const m: ChatMessage = { id: `${Date.now()}:${opts.wallet}`, gameId: opts.gameId, faction: opts.faction, wallet: opts.wallet, text, at: Date.now() };
      const r = await channel.send({ type: 'broadcast', event: 'msg', payload: m });
      if (r !== 'ok') throw new Error(`send ${r}`);
    },
    close() {
      void client.removeChannel(channel);
    },
  };
}
