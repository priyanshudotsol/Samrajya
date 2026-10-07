/**
 * Instanced trees: alpha-tested leaf cards clustered into canopies (broadleaf mango/banyan, or
 * tiered pines), with spherical normals so they light like soft volumes instead of facets.
 * The leaf atlas is painted on a canvas at runtime (no download).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { mulberry32 } from './layout';

let leafTex: THREE.Texture | null = null;

/** Greyscale-ish leaf cluster texture with alpha (tinted by the material colour). */
export function leafTexture(): THREE.Texture {
  if (leafTex) return leafTex;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const rand = mulberry32(77);
  g.clearRect(0, 0, size, size);
  for (let i = 0; i < 420; i++) {
    // denser towards the centre, so card edges fade out
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 0.7) * size * 0.47;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    const l = 150 + rand() * 105;
    const yel = rand() * 25;
    g.fillStyle = `rgb(${Math.round(l * 0.92 + yel)}, ${Math.round(l)}, ${Math.round(l * 0.78)})`;
    g.save();
    g.translate(x, y);
    g.rotate(rand() * Math.PI * 2);
    const len = 9 + rand() * 9;
    g.beginPath();
    g.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    // midrib
    g.strokeStyle = `rgba(60, 70, 40, 0.35)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-len, 0);
    g.lineTo(len, 0);
    g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  leafTex = t;
  return t;
}

function card(size: number, center: THREE.Vector3, at: THREE.Vector3, rot: THREE.Euler, canopyC: THREE.Vector3, up = 0.25) {
  const g = new THREE.PlaneGeometry(size, size);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot));
  g.translate(at.x, at.y, at.z);
  // spherical normals from the canopy centre (+ a little up) → soft, volumetric shading
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(canopyC).normalize();
    v.y += up;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  void center;
  return g;
}

/** Broadleaf canopy (origin at the ground, height ~1). */
export function broadleafGeometry(seed = 1): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const canopyC = new THREE.Vector3(0, 0.62, 0);
  const blobs = [
    [0, 0.68, 0, 0.26],
    [0.17, 0.58, 0.06, 0.2],
    [-0.15, 0.6, -0.08, 0.21],
    [0.03, 0.56, -0.17, 0.19],
    [-0.05, 0.55, 0.17, 0.19],
    [0.02, 0.84, 0.02, 0.17],
  ];
  for (const [bx, by, bz, br] of blobs) {
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2;
      const e = (rand() - 0.5) * Math.PI * 0.8;
      const d = br * 0.45;
      const at = new THREE.Vector3(bx + Math.cos(a) * Math.cos(e) * d, by + Math.sin(e) * d, bz + Math.sin(a) * Math.cos(e) * d);
      parts.push(card(br * 1.7, canopyC, at, new THREE.Euler(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI), canopyC, 0.35));
    }
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** Tiered pine (origin at the ground, height ~1.1). */
export function pineGeometry(seed = 2): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const tiers = 5;
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const y = 0.3 + t * 0.7;
    const r = 0.3 * (1 - t * 0.8);
    const n = 7 - Math.floor(t * 3);
    const axis = new THREE.Vector3(0, y + 0.1, 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.6 + k;
      const at = new THREE.Vector3(Math.cos(a) * r * 0.55, y, Math.sin(a) * r * 0.55);
      // card hangs outward and droops
      const rot = new THREE.Euler(-Math.PI / 2 + 0.55, 0, 0);
      const g = new THREE.PlaneGeometry(r * 1.5, r * 1.3);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot));
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(-a + Math.PI / 2));
      g.translate(at.x, at.y, at.z);
      const p = g.attributes.position as THREE.BufferAttribute;
      const nn = g.attributes.normal as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let j = 0; j < p.count; j++) {
        v.fromBufferAttribute(p, j).sub(axis);
        v.y = Math.max(v.y, 0) + 0.35;
        v.normalize();
        nn.setXYZ(j, v.x, v.y, v.z);
      }
      parts.push(g);
    }
  }
  const top = card(0.16, new THREE.Vector3(), new THREE.Vector3(0, 1.05, 0), new THREE.Euler(0, 0.4, 0), new THREE.Vector3(0, 0.9, 0));
  parts.push(top);
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** Tapered trunk with a fork (origin at the ground). */
export function trunkGeometry(pine: boolean): THREE.BufferGeometry {
  const main = new THREE.CylinderGeometry(0.018, 0.04, pine ? 0.9 : 0.6, 6, 1).translate(0, pine ? 0.45 : 0.3, 0);
  if (pine) return main;
  const b1 = new THREE.CylinderGeometry(0.01, 0.02, 0.28, 5).translate(0, 0.14, 0).rotateZ(0.7).translate(0.0, 0.42, 0);
  const b2 = new THREE.CylinderGeometry(0.01, 0.02, 0.26, 5).translate(0, 0.13, 0).rotateZ(-0.6).rotateY(1.2).translate(0, 0.45, 0);
  const g = mergeGeometries([main, b1, b2])!;
  [main, b1, b2].forEach((p) => p.dispose());
  return g;
}
