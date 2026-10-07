'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { notFound, useParams, useRouter } from 'next/navigation';

import { BattleBanner } from '@/components/arena/BattleBanner';
import { AppBackground } from '@/components/background/app-background';
import { LogoLoader } from '@/components/loader/logo-loader';
import { ActionsProvider } from '@/components/realm-hud/actions-context';
import { RealmHud } from '@/components/realm-hud/RealmHud';
import { findEntry, useBattle } from '@/lib/arena/battleMachine';
import { useBattleDriver } from '@/lib/arena/useBattleDriver';
import { KINGDOMS } from '@/lib/game/factions';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { useRealmUi } from '@/lib/realm/ui-store';
import { useGame } from '@/lib/store/game';

// three.js / WebGL is browser-only.
const RealmCanvas = dynamic(() => import('@/components/realm/RealmCanvas'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center text-sm text-text-secondary">Raising the realm…</div>,
});

/**
 * Realm screen (`/kingdom/[id]`, IMPLEMENTATION_GUIDE B3–B4). `id` is a TERRITORY; its current
 * owner faction (`game.territoryOwner[id]`) sets the colours and banners. The battle arena plays
 * in this same scene (KINGDOM_UI §1: "the realm is the arena").
 */
export default function KingdomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id >= 0 && id < KINGDOMS.length;
  const game = useGame((s) => s.game);
  const error = useGame((s) => s.error);
  const narrow = useMediaQuery('(max-width: 900px)');
  const replayDone = useRef(false);

  useBattleDriver(valid ? id : 0);

  useEffect(() => {
    useRealmUi.getState().hydrate();
  }, []);

  useEffect(() => {
    useRealmUi.getState().setFocus(null);
    replayDone.current = false;
  }, [id]);

  // Esc → back to the world map.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) router.push('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  // `?replay=<epoch>` (from another realm's battle log).
  useEffect(() => {
    if (!game || replayDone.current || !valid) return;
    replayDone.current = true;
    const epoch = Number(new URLSearchParams(window.location.search).get('replay'));
    if (!epoch) return;
    const e = findEntry(game, epoch, id);
    if (e) useBattle.getState().startReplay(e);
  }, [game, id, valid]);

  if (!valid) notFound();
  if (!game) {
    return (
      <AppBackground hasGradient>
        <LogoLoader label={error ?? undefined} />
      </AppBackground>
    );
  }

  return (
    <AppBackground>
      <ActionsProvider>
        <div className="fixed inset-0 overflow-hidden bg-background-surface">
          <div className="absolute inset-0 isolate z-0">
            <RealmCanvas key={id} territory={id} onNavigate={(t) => router.push(`/kingdom/${t}`)} />
          </div>
          <RealmHud territory={id} narrow={narrow} />
          <BattleBanner territory={id} />
        </div>
      </ActionsProvider>
    </AppBackground>
  );
}
