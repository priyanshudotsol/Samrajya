'use client';

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const v = new THREE.Vector3();

/**
 * A DOM label pinned to a point in the scene: the subset of drei's <Html> this app uses
 * (position, center, zIndexRange, style). drei 10 unmounts its inner React root synchronously
 * inside React 19's commit, which throws "removeChild … not a child of this node" when labels
 * come and go quickly (camps, warriors, the bell wheel). This one defers the unmount.
 */
export function Html({
  position = [0, 0, 0],
  center = false,
  zIndexRange = [10, 0],
  style,
  children,
}: {
  position?: [number, number, number];
  center?: boolean;
  zIndexRange?: [number, number];
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const connected = useThree((s) => s.events.connected) as HTMLElement | undefined;
  const host = useRef<HTMLDivElement | null>(null);
  const root = useRef<Root | null>(null);
  const target = connected ?? (gl.domElement.parentNode as HTMLElement | null);

  useLayoutEffect(() => {
    if (!target) return;
    // a fresh element per mount (StrictMode mounts twice; the old root unmounts later)
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;display:none;will-change:transform;';
    target.appendChild(el);
    const r = createRoot(el);
    host.current = el;
    root.current = r;
    return () => {
      if (root.current === r) {
        root.current = null;
        host.current = null;
      }
      el.style.display = 'none';
      // after React has finished this commit
      setTimeout(() => {
        r.unmount();
        el.remove();
      }, 0);
    };
  }, [target]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    root.current?.render(<div style={{ transform: center ? 'translate3d(-50%,-50%,0)' : undefined, ...style }}>{children}</div>);
  });

  useFrame(() => {
    const g = group.current;
    const el = host.current;
    if (!g || !el) return;
    g.getWorldPosition(v).project(camera);
    const visible = v.z > -1 && v.z < 1;
    el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    el.style.transform = `translate3d(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px, 0)`;
    el.style.zIndex = String(zIndexRange[0]);
  });

  return <group ref={group} position={position} />;
}
