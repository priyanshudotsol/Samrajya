'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { World, type Arc, type GlobeConfig, type Position, type Ring } from '@/components/ui/globe';
import { KINGDOMS, isAdjacent, kingdomGlow, powersFromMask } from '@/lib/game/factions';
import { formatSol, lamportsToSol, sharePrice } from '@/lib/game/math';
import type { Game } from '@/lib/game/types';
import { useGame } from '@/lib/store/game';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';
import { createCastle } from './castle-marker';

const GLOBE_CONFIG: GlobeConfig = {
  globeColor: '#0b0906',
  emissive: '#1a1206',
  emissiveIntensity: 0.25,
  shininess: 0.6,
  showAtmosphere: true,
  atmosphereColor: '#c9a227',
  atmosphereAltitude: 0.16,
  polygonColor: 'rgba(201, 162, 39, 0.28)',
  arcTime: 1800,
  arcLength: 0.45,
  maxRings: 6,
  autoRotate: true,
  autoRotateSpeed: 0.35,
  initialPosition: { lat: 22, lng: 20, altitude: 2.3 },
};

const HELD_COLOR = '#C9A227';
const FELL_COLOR = '#E2483C';
const RING_MS = 6000;

const CONTINENT_TO_TERRITORY = new Map(KINGDOMS.map((k) => [k.continent, k.id]));

/** Territory each attacking faction's arc starts from: an owned territory next to the target. */
function arcOrigin(game: Game, f: number, target: number): number {
  const owned = game.territoryOwner.map((o, t) => (o === f ? t : -1)).filter((t) => t >= 0);
  return owned.find((t) => isAdjacent(t, target)) ?? (owned.includes(f) ? f : (owned[0] ?? f));
}

function strokeFor(lamports: bigint) {
  const sol = lamportsToSol(lamports);
  return Math.round(Math.min(1.6, 0.35 + 0.45 * Math.log10(1 + sol)) * 10) / 10;
}

function hexAlpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

type ResultRing = Ring & { until: number; key: string };

export function WorldGlobe() {
  const router = useRouter();
  const game = useGame((s) => s.game);
  const globeRef = useRef<any>(null);

  // ----- castle markers: rebuild only when an owner or size bucket changes -----
  const pointsKey = game
    ? game.territoryOwner
        .map((o, t) => {
          const f = game.factions[o];
          const per = lamportsToSol(f.treasury) / Math.max(1, f.territories);
          return `${t}:${o}:${Math.round(Math.log2(1 + per) * 2)}`;
        })
        .join('|')
    : '';
  const points = useMemo<Position[]>(() => {
    if (!game) return [];
    return KINGDOMS.map((k) => {
      const owner = game.territoryOwner[k.id];
      const f = game.factions[owner];
      const per = lamportsToSol(f.treasury) / Math.max(1, f.territories);
      return {
        id: k.id,
        order: k.id,
        lat: k.lat,
        lng: k.lng,
        color: kingdomGlow(owner),
        owner,
        scale: Math.min(1.6, Math.max(0.75, 0.8 + 0.3 * Math.log10(1 + per))),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  // ----- attack arcs from the current epoch's allocations (stable objects per arc id) -----
  const arcsKey = game
    ? game.factions
        .flatMap((f, i) =>
          f.attackAlloc.map((a, t) =>
            a > 0n && game.territoryOwner[t] !== i
              ? `${i}>${t}@${arcOrigin(game, i, t)}:${strokeFor(a)}`
              : '',
          ),
        )
        .filter(Boolean)
        .join('|')
    : '';
  const arcCache = useRef(new Map<string, Arc>());
  const arcs = useMemo<Arc[]>(() => {
    if (!game) return [];
    const next = new Map<string, Arc>();
    game.factions.forEach((f, i) => {
      f.attackAlloc.forEach((a, t) => {
        if (a === 0n || game.territoryOwner[t] === i) return;
        const from = arcOrigin(game, i, t);
        const stroke = strokeFor(a);
        const id = `${i}>${t}@${from}:${stroke}`;
        const glow = kingdomGlow(i);
        next.set(
          id,
          arcCache.current.get(id) ?? {
            order: (i * 7 + t) % 5,
            startLat: KINGDOMS[from].lat,
            startLng: KINGDOMS[from].lng,
            endLat: KINGDOMS[t].lat,
            endLng: KINGDOMS[t].lng,
            arcAlt: 0.25 + 0.05 * ((i + t) % 3),
            color: [hexAlpha(glow, 0.15), glow],
            stroke,
            dashLength: 0.4,
            dashGap: 0.15,
            dashTime: 1600,
          },
        );
      });
    });
    arcCache.current = next;
    return [...next.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcsKey]);

  // ----- rings: battle results (gold = HELD, red = FALLEN) + pulses on contested targets -----
  const [resultRings, setResultRings] = useState<ResultRing[]>([]);
  const seen = useRef(new Set<string>());
  const gameId = game?.gameId;
  const logKey = game?.battleLog.map((e) => `${e.epoch}-${e.territory}`).join(',') ?? '';
  useEffect(() => {
    if (!game) return;
    const now = Date.now();
    const keyOf = (e: { epoch: number; territory: number }) =>
      `${gameId}-${e.epoch}-${e.territory}`;
    const fresh = game.battleLog.filter((e) => !seen.current.has(keyOf(e)));
    if (fresh.length === 0) return;
    fresh.forEach((e) => seen.current.add(keyOf(e)));
    // Don't burst the whole history on first load.
    const recent = fresh.filter((e) => e.epoch >= game.epoch - 1);
    if (recent.length === 0) return;
    setResultRings((rs) => [
      ...rs.filter((r) => r.until > now),
      ...recent.map((e) => ({
        key: keyOf(e),
        lat: KINGDOMS[e.territory].lat,
        lng: KINGDOMS[e.territory].lng,
        color: e.winner === e.defender ? HELD_COLOR : FELL_COLOR,
        maxRadius: 9,
        speed: 4,
        repeatPeriod: 450,
        until: now + RING_MS,
      })),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logKey, gameId]);
  useEffect(() => {
    if (resultRings.length === 0) return;
    const id = setTimeout(
      () => setResultRings((rs) => rs.filter((r) => r.until > Date.now())),
      RING_MS,
    );
    return () => clearTimeout(id);
  }, [resultRings]);

  const contestedKey = game
    ? game.territoryOwner
        .map((o, t) => (game.factions.some((f, i) => i !== o && f.attackAlloc[t] > 0n) ? t : -1))
        .filter((t) => t >= 0)
        .join(',')
    : '';
  const rings = useMemo<Ring[]>(() => {
    const contested: Ring[] = contestedKey
      ? contestedKey.split(',').map((t) => ({
          lat: KINGDOMS[+t].lat,
          lng: KINGDOMS[+t].lng,
          color: FELL_COLOR,
          maxRadius: 4,
          speed: 1.5,
          repeatPeriod: 1400,
        }))
      : [];
    return [...contested, ...resultRings];
  }, [contestedKey, resultRings]);

  // ----- territory zones (continents) tinted by owner -----
  const ownersKey = game?.territoryOwner.join(',') ?? '';
  const polygonColorFor = useCallback((feature: { properties: { continent: string } }) => {
    const t = CONTINENT_TO_TERRITORY.get(feature.properties.continent);
    const g = useGame.getState().game;
    if (t === undefined || !g) return GLOBE_CONFIG.polygonColor!;
    return hexAlpha(kingdomGlow(g.territoryOwner[t]), 0.55);
  }, []);

  const objectFactory = useCallback((p: Position) => {
    const owner = p.owner as number;
    return createCastle({
      color: kingdomGlow(owner),
      scale: p.scale as number,
      originalColor: owner !== p.id ? kingdomGlow(p.id) : undefined,
    });
  }, []);

  const labelFor = useCallback((p: Position) => {
    const g = useGame.getState().game;
    if (!g) return '';
    const k = KINGDOMS[p.id];
    const owner = g.territoryOwner[p.id];
    const f = g.factions[owner];
    const powers = powersFromMask(f.powers)
      .map((x) => x.name)
      .join(', ');
    return `<div style="background:#120e0a;border:1px solid #c9a227;padding:8px 10px;font-family:var(--font-afacad);color:#f5ebd7;min-width:190px">
      <div style="font-family:var(--font-rozha);font-size:18px;color:${kingdomGlow(k.id)}">${k.name}</div>
      <div style="font-size:12px;color:#b8a887">${k.region} · ${k.biome}</div>
      ${owner !== k.id ? `<div style="font-size:12px;margin-top:4px">Held by <b style="color:${kingdomGlow(owner)}">${KINGDOMS[owner].name}</b></div>` : ''}
      <div style="font-size:12px;margin-top:6px">Treasury ◎ ${formatSol(f.treasury)} · ${f.members} members</div>
      <div style="font-size:12px">Share ${sharePrice(f).toFixed(3)} · ${f.territories} territor${f.territories === 1 ? 'y' : 'ies'}</div>
      <div style="font-size:11px;color:#e3c15a;margin-top:4px">${powers}</div>
      <div style="font-size:11px;color:#8c7124;margin-top:4px">Click to enter the realm</div>
    </div>`;
  }, []);

  const onPointClick = useCallback(
    (p: Position) => {
      const g = globeRef.current;
      if (g) {
        g.controls().autoRotate = false;
        g.pointOfView({ lat: p.lat, lng: p.lng, altitude: 0.45 }, 900);
      }
      setTimeout(() => router.push(`/kingdom/${p.id}`), 850);
    },
    [router],
  );

  if (!game) return null;

  return (
    <div id={TOUR_STEP_IDS.WORLD_GLOBE} className="w-full h-full">
      <World
        globeConfig={GLOBE_CONFIG}
        pointsData={points}
        arcsData={arcs}
        ringsData={rings}
        objectFactory={objectFactory}
        labelFor={labelFor}
        polygonColorFor={polygonColorFor}
        polygonKey={ownersKey}
        onGlobeReady={(g) => (globeRef.current = g)}
        onPointClick={onPointClick}
      />
    </div>
  );
}
