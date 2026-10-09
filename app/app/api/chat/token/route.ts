/**
 * POST /api/chat/token — mints a short-lived Supabase JWT for the kingdom chat
 * (docs/ARCHITECTURE.md §10.5). The only backend piece of the MVP.
 *
 * Checks, in order:
 *   1. the wallet signed `Samrajya war council\ngame …\nkingdom …\nwallet …\nts …` within 5 min;
 *   2. the wallet's Player PDA (on the ER while delegated, else on base) is Active, has shares and
 *      belongs to `faction` of the current generation;
 *   3. signs { sub: wallet, role: 'authenticated', samrajya: { game, faction } } with
 *      SUPABASE_JWT_SECRET (2 h). `supabase/chat.sql` lets that claim join `samrajya:<game>:<faction>`.
 */
import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { SignJWT } from 'jose';
import nacl from 'tweetnacl';

import { toPlayer } from '@/lib/solana/decode';
import { gamePda, isDelegated, playerPda, programs } from '@/lib/solana/program';
import { baseConnection, erConnection } from '@/lib/solana/connections';

export const runtime = 'nodejs';

const TTL_SECS = 2 * 60 * 60;

export async function POST(req: Request) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return new NextResponse('Chat is not configured on the server (SUPABASE_JWT_SECRET)', { status: 503 });
  let body: { wallet: string; gameId: number; faction: number; ts: number; signature: number[] };
  try {
    body = await req.json();
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }
  const { wallet, gameId, faction, ts, signature } = body;
  if (!wallet || !Number.isInteger(gameId) || !Number.isInteger(faction) || !Number.isInteger(ts) || !Array.isArray(signature)) {
    return new NextResponse('bad request', { status: 400 });
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return new NextResponse('stale signature', { status: 401 });

  let pk: PublicKey;
  try {
    pk = new PublicKey(wallet);
  } catch {
    return new NextResponse('bad wallet', { status: 400 });
  }
  const msg = new TextEncoder().encode(`Samrajya war council\ngame ${gameId}\nkingdom ${faction}\nwallet ${wallet}\nts ${ts}`);
  if (!nacl.sign.detached.verify(msg, Uint8Array.from(signature), pk.toBytes())) {
    return new NextResponse('bad signature', { status: 401 });
  }

  // membership on-chain
  try {
    const game = gamePda(gameId);
    const pda = playerPda(game, pk);
    const conn = (await isDelegated(pda)) ? erConnection() : baseConnection();
    const [info, gameInfo] = await Promise.all([conn.getAccountInfo(pda, 'confirmed'), ((await isDelegated(game)) ? erConnection() : baseConnection()).getAccountInfo(game, 'confirmed')]);
    if (!info || !gameInfo) return new NextResponse('not a member', { status: 403 });
    const { er } = programs();
    const { toGame } = await import('@/lib/solana/decode');
    const g = toGame(er.coder.accounts.decode('game', gameInfo.data));
    const p = toPlayer(er.coder.accounts.decode('player', info.data), g);
    const f = g.factions[p.faction];
    if (p.status !== 'Active' || p.shares === 0n || p.faction !== faction || !f || p.generation !== f.generation) {
      return new NextResponse('not a member of that kingdom', { status: 403 });
    }
  } catch (e) {
    return new NextResponse(`membership check failed: ${e instanceof Error ? e.message : String(e)}`, { status: 502 });
  }

  const exp = now + TTL_SECS;
  const token = await new SignJWT({ role: 'authenticated', samrajya: { game: gameId, faction } })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(wallet)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
  return NextResponse.json({ token, exp });
}
