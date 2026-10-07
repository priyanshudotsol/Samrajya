'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'globe.gl';
import * as THREE from 'three';

import countries from '@/data/globe.json';

const RING_PROPAGATION_SPEED = 3;

export type Position = {
  id: number;
  order: number;
  lat: number;
  lng: number;
  color: string;
  logo?: string;
  /** Extra data forwarded to `objectFactory` / `labelFor`. */
  [key: string]: unknown;
};

export type Arc = {
  order: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  arcAlt: number;
  color: string | string[];
  /** Stroke width; random thin stroke when omitted (chain-wars behaviour). */
  stroke?: number;
  /** Dash animation time in ms; `globeConfig.arcTime` when omitted. */
  dashTime?: number;
  /** Dash length / gap as a fraction of the arc; `globeConfig.arcLength` / 15 when omitted. */
  dashLength?: number;
  dashGap?: number;
};

export type Ring = {
  lat: number;
  lng: number;
  color: string;
  maxRadius?: number;
  speed?: number;
  repeatPeriod?: number;
};

export type GlobeConfig = {
  pointSize?: number;
  globeColor?: string;
  showAtmosphere?: boolean;
  atmosphereColor?: string;
  atmosphereAltitude?: number;
  emissive?: string;
  emissiveIntensity?: number;
  shininess?: number;
  polygonColor?: string;
  ambientLight?: string;
  directionalLeftLight?: string;
  directionalTopLight?: string;
  pointLight?: string;
  arcTime?: number;
  arcLength?: number;
  rings?: number;
  maxRings?: number;
  initialPosition?: {
    lat: number;
    lng: number;
    altitude?: number;
  };
  autoRotate?: boolean;
  autoRotateSpeed?: number;
};

type CountryFeature = (typeof countries.features)[number];

interface WorldProps {
  globeConfig: GlobeConfig;
  pointsData: Position[];
  arcsData: Arc[];
  /**
   * Controlled rings. When provided, replaces the random ring pulses with exactly these rings
   * (e.g. battle-result bursts).
   */
  ringsData?: Ring[];
  /** Builds the 3D marker for every point. Defaults to the chain-wars flat logo disc. */
  objectFactory?: (point: Position) => THREE.Object3D;
  /** HTML tooltip for points / objects. */
  labelFor?: (point: Position) => string;
  /** Colour per country polygon (hex dots). Defaults to `globeConfig.polygonColor`. */
  polygonColorFor?: (feature: CountryFeature) => string;
  /** Change this key to re-evaluate `polygonColorFor` (e.g. when territory owners change). */
  polygonKey?: string;
  /** Receives the globe.gl instance once it exists (for `pointOfView`, controls, …). */
  onGlobeReady?: (globe: any) => void;
  onPointClick?: (
    point: any,
    event: MouseEvent,
    coords: { lat: number; lng: number; altitude: number },
  ) => void;
  onPointHover?: (point: any, prevPoint: any) => void;
  onArcClick?: (
    arc: any,
    event: MouseEvent,
    coords: { lat: number; lng: number; altitude: number },
  ) => void;
  onArcHover?: (arc: any, prevArc: any) => void;
  onPolygonClick?: (
    polygon: any,
    event: MouseEvent,
    coords: { lat: number; lng: number; altitude: number },
  ) => void;
  onPolygonHover?: (polygon: any, prevPolygon: any) => void;
  onGlobeClick?: (coords: { lat: number; lng: number }, event: MouseEvent) => void;
}

function defaultObject(d: Position, color: string) {
  // Create a circular plane geometry
  const geometry = new THREE.CircleGeometry(3, 32);
  const material = new THREE.MeshBasicMaterial({
    color: d.color || color,
    transparent: true,
    opacity: 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = {
    originalScale: mesh.scale.clone(),
    originalColor: material.color.clone(),
    hasLogo: !!d.logo,
    pointData: d,
  };
  if (d.logo) {
    new THREE.TextureLoader().load(
      `/img/${d.logo}.svg`,
      (texture) => {
        material.map = texture;
        material.color.setHex(0xffffff);
        material.needsUpdate = true;
      },
      undefined,
      () => {
        material.color.set(d.color);
        material.needsUpdate = true;
      },
    );
  }
  return mesh;
}

export function GlobeComponent({
  globeConfig,
  pointsData,
  arcsData,
  ringsData,
  objectFactory,
  labelFor,
  polygonColorFor,
  polygonKey,
  onGlobeReady,
  onPointClick,
  onPointHover,
  onArcClick,
  onArcHover,
  onPolygonClick,
  onPolygonHover,
  onGlobeClick,
}: WorldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const globeRef = useRef<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Handlers live in refs so the globe (created once) always calls the latest version.
  const handlers = useRef({
    onPointClick,
    onPointHover,
    onArcClick,
    onArcHover,
    onPolygonClick,
    onPolygonHover,
    onGlobeClick,
    objectFactory,
    labelFor,
    polygonColorFor,
  });
  handlers.current = {
    onPointClick,
    onPointHover,
    onArcClick,
    onArcHover,
    onPolygonClick,
    onPolygonHover,
    onGlobeClick,
    objectFactory,
    labelFor,
    polygonColorFor,
  };

  const configKey = JSON.stringify(globeConfig);
  const defaultProps = useMemo(
    () => ({
      pointSize: 1,
      atmosphereColor: '#ffffff',
      showAtmosphere: true,
      atmosphereAltitude: 0.1,
      polygonColor: 'rgba(255,255,255,0.7)',
      globeColor: '#1d072e',
      emissive: '#000000',
      emissiveIntensity: 0.1,
      shininess: 0.9,
      arcTime: 2000,
      arcLength: 0.9,
      rings: 1,
      maxRings: 3,
      autoRotate: true,
      autoRotateSpeed: 1,
      ...globeConfig,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configKey],
  );

  // Initialize globe only once
  useEffect(() => {
    if (!containerRef.current || globeRef.current) return;

    // Wait for container to have proper dimensions
    const timer = setTimeout(() => {
      if (!containerRef.current) return;

      const width = Math.max(containerRef.current.clientWidth, 400);
      const height = Math.max(containerRef.current.clientHeight, 400);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const globe = new Globe(containerRef.current)
        .width(width)
        .height(height)
        .globeImageUrl('')
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(defaultProps.showAtmosphere)
        .atmosphereColor(defaultProps.atmosphereColor)
        .atmosphereAltitude(defaultProps.atmosphereAltitude);
      globeRef.current = globe;

      // Globe material
      const mat = globe.globeMaterial() as THREE.MeshPhongMaterial;
      mat.color = new THREE.Color(defaultProps.globeColor);
      mat.emissive = new THREE.Color(defaultProps.emissive);
      mat.emissiveIntensity = defaultProps.emissiveIntensity;
      mat.shininess = defaultProps.shininess;

      const h = handlers.current;
      const call =
        (k: keyof typeof h) =>
        (...args: unknown[]) =>
          (handlers.current[k] as ((...a: unknown[]) => void) | undefined)?.(...args);
      if (h.onPointClick) {
        globe.onPointClick(call('onPointClick'));
        globe.onObjectClick(call('onPointClick'));
      }
      if (h.onPointHover) {
        globe.onPointHover(call('onPointHover'));
        globe.onObjectHover(call('onPointHover'));
      }
      if (h.onArcClick) globe.onArcClick(call('onArcClick'));
      if (h.onArcHover) globe.onArcHover(call('onArcHover'));
      if (h.onPolygonClick) globe.onHexPolygonClick(call('onPolygonClick'));
      if (h.onPolygonHover) globe.onHexPolygonHover(call('onPolygonHover'));
      if (h.onGlobeClick) globe.onGlobeClick(call('onGlobeClick'));

      globe.enablePointerInteraction(true);

      const controls = globe.controls();
      controls.autoRotate = defaultProps.autoRotate;
      controls.autoRotateSpeed = defaultProps.autoRotateSpeed;
      if (defaultProps.initialPosition) {
        globe.pointOfView({ altitude: 2.2, ...defaultProps.initialPosition }, 0);
      }

      // Set up polygons (countries) as dotted/hexagonal representation
      globe
        .hexPolygonsData(countries.features)
        .hexPolygonResolution(3)
        .hexPolygonMargin(0.7)
        .hexPolygonColor((f: object) =>
          handlers.current.polygonColorFor
            ? handlers.current.polygonColorFor(f as CountryFeature)
            : defaultProps.polygonColor,
        );

      setIsInitialized(true);
      onGlobeReady?.(globe);
    }, 100);

    // Handle resize
    const handleResize = () => {
      if (globeRef.current && containerRef.current) {
        globeRef.current
          .width(containerRef.current.clientWidth)
          .height(containerRef.current.clientHeight);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      if (globeRef.current) {
        globeRef.current._destructor();
        globeRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-colour the hex dots when the polygon key changes (e.g. territory conquered).
  useEffect(() => {
    if (!globeRef.current || !isInitialized) return;
    globeRef.current.hexPolygonColor((f: CountryFeature) =>
      handlers.current.polygonColorFor
        ? handlers.current.polygonColorFor(f)
        : defaultProps.polygonColor,
    );
  }, [isInitialized, polygonKey, defaultProps]);

  // Arcs
  useEffect(() => {
    if (!globeRef.current || !isInitialized || !arcsData) return;
    globeRef.current
      .arcsData(arcsData)
      .arcStartLat((d: Arc) => d.startLat)
      .arcStartLng((d: Arc) => d.startLng)
      .arcEndLat((d: Arc) => d.endLat)
      .arcEndLng((d: Arc) => d.endLng)
      .arcColor((d: Arc) => d.color)
      .arcAltitude((d: Arc) => d.arcAlt)
      .arcStroke((d: Arc) => d.stroke ?? [0.32, 0.28, 0.3][Math.round(Math.random() * 2)])
      .arcDashLength((d: Arc) => d.dashLength ?? defaultProps.arcLength)
      .arcDashInitialGap((d: Arc) => d.order)
      .arcDashGap((d: Arc) => d.dashGap ?? 15)
      .arcDashAnimateTime((d: Arc) => d.dashTime ?? defaultProps.arcTime)
      .arcsTransitionDuration(400);
  }, [isInitialized, arcsData, defaultProps]);

  // Points + 3D objects
  useEffect(() => {
    if (!globeRef.current || !isInitialized || !pointsData) return;

    const points = pointsData.map((point) => ({ size: defaultProps.pointSize, ...point }));

    // Remove duplicates for same lat and lng
    const filteredPoints = points.filter(
      (v, i, a) => a.findIndex((v2) => v2.lat === v.lat && v2.lng === v.lng) === i,
    );

    const label = (d: Position) => handlers.current.labelFor?.(d) ?? '';

    globeRef.current
      .pointsData(handlers.current.objectFactory ? [] : filteredPoints)
      .pointColor((d: Position) => d.color)
      .pointsMerge(false)
      .pointAltitude(0.003)
      .pointRadius(2)
      .pointLabel(label);

    // With a custom factory every point gets a 3D object; otherwise only logo points do.
    const objectPoints = handlers.current.objectFactory
      ? filteredPoints
      : filteredPoints.filter((d) => d.logo);
    globeRef.current
      .objectsData(objectPoints)
      .objectLat((d: Position) => d.lat)
      .objectLng((d: Position) => d.lng)
      .objectAltitude(0.005)
      .objectFacesSurface(true)
      .objectLabel(label)
      .objectThreeObject((d: Position) =>
        handlers.current.objectFactory
          ? handlers.current.objectFactory(d)
          : defaultObject(d, '#ff4444'),
      );
  }, [isInitialized, pointsData, defaultProps]);

  // Rings: controlled (ringsData) or chain-wars random pulses
  useEffect(() => {
    if (!globeRef.current || !isInitialized) return;
    const g = globeRef.current;
    if (ringsData) {
      g.ringsData(ringsData)
        .ringColor((d: Ring) => (t: number) => withAlpha(d.color, 1 - t))
        .ringMaxRadius((d: Ring) => d.maxRadius ?? defaultProps.maxRings)
        .ringPropagationSpeed((d: Ring) => d.speed ?? RING_PROPAGATION_SPEED)
        .ringRepeatPeriod((d: Ring) => d.repeatPeriod ?? 700);
      return;
    }
    if (!pointsData) return;
    g.ringsData([])
      .ringColor(() => defaultProps.polygonColor)
      .ringMaxRadius(defaultProps.maxRings)
      .ringPropagationSpeed(RING_PROPAGATION_SPEED)
      .ringRepeatPeriod(
        defaultProps.rings && defaultProps.rings > 0
          ? (defaultProps.arcTime * defaultProps.arcLength) / defaultProps.rings
          : 1e9,
      );
    const interval = setInterval(() => {
      if (!globeRef.current) return;
      const newNumbersOfRings = genRandomNumbers(
        0,
        pointsData.length,
        Math.floor((pointsData.length * 4) / 5),
      );
      globeRef.current.ringsData(
        pointsData
          .filter((_, i) => newNumbersOfRings.includes(i))
          .map((d) => ({ lat: d.lat, lng: d.lng, color: d.color })),
      );
    }, 2000);
    return () => clearInterval(interval);
  }, [isInitialized, pointsData, ringsData, defaultProps]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minWidth: '400px',
        minHeight: '400px',
      }}
    />
  );
}

export function World(props: WorldProps) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <GlobeComponent {...props} />
    </div>
  );
}

function withAlpha(color: string, a: number) {
  const rgb = hexToRgb(color);
  return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.max(0, a).toFixed(3)})` : color;
}

export function hexToRgb(hex: string) {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function (_, r, g, b) {
    return r + r + g + g + b + b;
  });

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export function genRandomNumbers(min: number, max: number, count: number) {
  const arr: number[] = [];
  while (arr.length < count) {
    const r = Math.floor(Math.random() * (max - min)) + min;
    if (arr.indexOf(r) === -1) arr.push(r);
  }

  return arr;
}
