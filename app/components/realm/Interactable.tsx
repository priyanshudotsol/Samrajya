'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Html } from '@/components/three/Html';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import type * as THREE from 'three';

import { play } from '@/lib/audio';
import { useRealmUi } from '@/lib/realm/ui-store';

/** Hover = lift + tooltip; click = open the matching HUD panel (KINGDOM_UI §4.4). */
export function Interactable({
  id,
  label,
  hint,
  labelY = 1,
  position,
  rotation,
  onSelect,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  labelY?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  onSelect?: () => void;
  children: ReactNode;
}) {
  const hovered = useRealmUi((s) => s.hovered === id);
  const setHovered = useRealmUi((s) => s.setHovered);
  const ref = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (!ref.current) return;
    easing.damp(ref.current.position, 'y', hovered ? 0.06 : 0, 0.12, dt);
  });

  useEffect(
    () => () => {
      if (useRealmUi.getState().hovered === id) {
        useRealmUi.getState().setHovered(null);
        document.body.style.cursor = '';
      }
    },
    [id],
  );

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(id);
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    if (useRealmUi.getState().hovered === id) setHovered(null);
    document.body.style.cursor = '';
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    play('click');
    onSelect?.();
  };

  return (
    <group position={position} rotation={rotation} onPointerOver={over} onPointerOut={out} onClick={click}>
      <group ref={ref}>{children}</group>
      {hovered && (
        <Html center position={[0, labelY, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap border border-border-active bg-background-panel/95 px-2 py-1 text-xs text-text-primary shadow-lg">
            <div className="font-rozha text-sm text-text-highlight">{label}</div>
            {hint && <div className="text-[10px] text-text-secondary">{hint}</div>}
          </div>
        </Html>
      )}
    </group>
  );
}
