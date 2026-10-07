import * as THREE from 'three';

/**
 * A tiny low-poly Indian-royal castle built from three.js primitives, used as the globe marker
 * (globe.gl `objectThreeObject`). Globe radius is 100 units; the castle is ~5 units wide.
 *
 * TODO(Step 12/15): swap for `public/models/globe-castle.glb` (KINGDOM_UI §3) once assets land.
 *
 * globe.gl's `objectFacesSurface` points the object's local +Z away from the globe, so the castle
 * is modelled Y-up and rotated onto +Z.
 */

const geo = {
  base: new THREE.CylinderGeometry(2.6, 3, 0.6, 6),
  wall: new THREE.BoxGeometry(3.4, 1.1, 3.4),
  tower: new THREE.CylinderGeometry(0.42, 0.48, 2, 8),
  towerRoof: new THREE.ConeGeometry(0.62, 0.9, 8),
  keep: new THREE.CylinderGeometry(0.9, 1, 2.6, 8),
  dome: new THREE.SphereGeometry(0.95, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  finial: new THREE.ConeGeometry(0.16, 0.7, 6),
  pole: new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4),
  flag: new THREE.PlaneGeometry(0.9, 0.55),
  glow: new THREE.RingGeometry(3.1, 3.9, 32),
};

const stoneMat = new THREE.MeshLambertMaterial({ color: '#cbb48a', emissive: '#2a2010' });
const darkStoneMat = new THREE.MeshLambertMaterial({ color: '#8f7a55', emissive: '#1a140a' });
const ruinMat = new THREE.MeshLambertMaterial({ color: '#5b5650', emissive: '#111111' });
const goldMat = new THREE.MeshLambertMaterial({ color: '#c9a227', emissive: '#5a4510' });

const colorMats = new Map<string, THREE.MeshLambertMaterial>();
function colorMat(color: string) {
  let m = colorMats.get(color);
  if (!m) {
    const c = new THREE.Color(color);
    m = new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(0.35) });
    colorMats.set(color, m);
  }
  return m;
}

function flagMat(color: string) {
  return new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
}

export interface CastleOptions {
  /** Owner faction colour (roofs, dome, flag, glow ring). */
  color: string;
  /** 0.7 – 1.6, follows the owner's strength. */
  scale?: number;
  /** Ruins: grey, no flag (e.g. eliminated). */
  ruined?: boolean;
  /** Small second flag in the original kingdom's colour when the territory was conquered. */
  originalColor?: string;
}

export function createCastle({ color, scale = 1, ruined = false, originalColor }: CastleOptions) {
  const root = new THREE.Group();
  const castle = new THREE.Group();
  castle.rotation.x = Math.PI / 2; // Y-up model → +Z (away from the globe)
  root.add(castle);

  const stone = ruined ? ruinMat : stoneMat;
  const roof = ruined ? ruinMat : colorMat(color);

  const base = new THREE.Mesh(geo.base, ruined ? ruinMat : darkStoneMat);
  base.position.y = 0.3;
  castle.add(base);

  const wall = new THREE.Mesh(geo.wall, stone);
  wall.position.y = 1.15;
  castle.add(wall);

  // Corner towers with coloured conical roofs.
  for (const [x, z] of [
    [1.7, 1.7],
    [-1.7, 1.7],
    [1.7, -1.7],
    [-1.7, -1.7],
  ]) {
    const t = new THREE.Mesh(geo.tower, stone);
    t.position.set(x, 1.6, z);
    castle.add(t);
    const r = new THREE.Mesh(geo.towerRoof, roof);
    r.position.set(x, 3.05, z);
    castle.add(r);
  }

  // Central keep with an onion-ish dome and a gold finial.
  const keep = new THREE.Mesh(geo.keep, stone);
  keep.position.y = 2.6;
  castle.add(keep);
  const dome = new THREE.Mesh(geo.dome, roof);
  dome.position.y = 3.9;
  dome.scale.set(1, 1.35, 1);
  castle.add(dome);
  const finial = new THREE.Mesh(geo.finial, ruined ? ruinMat : goldMat);
  finial.position.y = 5.5;
  castle.add(finial);

  if (!ruined) {
    const pole = new THREE.Mesh(geo.pole, goldMat);
    pole.position.set(0, 6.4, 0);
    castle.add(pole);
    const flag = new THREE.Mesh(geo.flag, flagMat(color));
    flag.position.set(0.47, 6.9, 0);
    castle.add(flag);
    if (originalColor && originalColor !== color) {
      const small = new THREE.Mesh(geo.flag, flagMat(originalColor));
      small.scale.set(0.55, 0.55, 1);
      small.position.set(1.7, 3.75, 1.7);
      castle.add(small);
    }
  }

  // Glow ring on the ground in the owner's colour.
  const glow = new THREE.Mesh(
    geo.glow,
    new THREE.MeshBasicMaterial({
      color: ruined ? '#555' : color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  glow.position.z = 0.05;
  root.add(glow);

  root.scale.setScalar(scale * 1.7);
  return root;
}
