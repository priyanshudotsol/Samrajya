'use client';

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import * as THREE from 'three';

import { cameraState } from '@/lib/arena/cameraState';

import { usePaint } from './paint';

const vert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    vY = position.y;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const frag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uTime;
  uniform float uPulse;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
    float bands = 0.5 + 0.5 * sin(vY * 14.0 - uTime * 2.0);
    float a = (f * 0.85 + 0.04 + bands * 0.03) * uStrength * (1.0 + uPulse * 0.6 * (0.5 + 0.5 * sin(uTime * 8.0)));
    gl_FragColor = vec4(uColor * (1.2 + f), clamp(a, 0.0, 0.9));
  }
`;

/** Transparent fresnel dome over the walls; brighter with a higher defend share. */
export function ShieldDome({ strength, pulse }: { strength: number; pulse: boolean }) {
  const paint = usePaint();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: new THREE.Color() },
          uStrength: { value: 0 },
          uTime: { value: 0 },
          uPulse: { value: 0 },
        },
      }),
    [],
  );
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
    (mat.uniforms.uColor.value as THREE.Color).copy(paint.current);
    // fainter while you fight on foot (the chase camera looks down through it)
    const fight = cameraState.mode === 'follow' ? 0.3 : 1;
    easing.damp(mat.uniforms.uStrength, 'value', (0.15 + strength * 0.85) * fight, 0.8, dt);
    easing.damp(mat.uniforms.uPulse, 'value', pulse ? 1 : 0, 0.4, dt);
  });
  return (
    <mesh material={mat} position={[0, 0.3, 0]} renderOrder={10} raycast={() => null}>
      <sphereGeometry args={[3.15, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
    </mesh>
  );
}
