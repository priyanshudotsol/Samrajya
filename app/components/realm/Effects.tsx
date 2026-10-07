'use client';

import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';

/** postprocessing's ToneMappingMode.ACES_FILMIC (the package isn't a direct dependency). */
const ACES_FILMIC = 6;

/**
 * Ambient occlusion (N8AO, half-res) grounds the castle and troops, bloom picks up fire / diyas /
 * gold glints, ACES tone mapping (the composer disables the renderer's own), SMAA and a soft
 * vignette. Only mounted when not low-power / degraded (RealmCanvas).
 */
export function Effects() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO halfRes aoRadius={0.9} distanceFalloff={0.6} intensity={2.2} aoSamples={12} denoiseSamples={4} quality="performance" />
      <Bloom intensity={0.45} luminanceThreshold={0.95} luminanceSmoothing={0.25} mipmapBlur />
      <ToneMapping mode={ACES_FILMIC} />
      <SMAA />
      <Vignette offset={0.3} darkness={0.5} />
    </EffectComposer>
  );
}
