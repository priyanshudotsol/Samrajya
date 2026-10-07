/**
 * Low-poly swordsman shared by every crowd (garrison, camps, marches, the melee). Three instanced
 * parts: the faction-coloured body (tabard + turban), neutral gear (legs, face, shield) and the
 * sword arm, which pivots at the right shoulder so it can swing.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function colored(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  // mergeGeometries needs matching attributes
  g.deleteAttribute('uv');
  return g;
}

/** Faction-coloured parts: tabard + turban. */
export const BODY_GEO = mergeGeometries([
  new THREE.CylinderGeometry(0.045, 0.065, 0.17, 6).translate(0, 0.14, 0).deleteAttribute('uv'),
  new THREE.SphereGeometry(0.042, 6, 4).scale(1, 0.75, 1).translate(0, 0.275, 0).deleteAttribute('uv'),
])!;

/** Neutral parts (vertex coloured): legs, face, round shield on the left arm. */
export const GEAR_GEO = mergeGeometries([
  colored(new THREE.BoxGeometry(0.075, 0.06, 0.045).translate(0, 0.03, 0), '#3a2a1c'),
  colored(new THREE.SphereGeometry(0.036, 6, 4).translate(0, 0.24, 0.004), '#c58c5c'),
  colored(new THREE.CylinderGeometry(0.06, 0.06, 0.016, 10).rotateZ(Math.PI / 2).translate(-0.07, 0.16, 0.025), '#b08a3a'),
  colored(new THREE.SphereGeometry(0.014, 5, 3).translate(-0.08, 0.16, 0.025), '#e8d48a'),
])!;

/** Sword arm, origin at the shoulder pivot; the blade continues the arm. Angle 0 = hanging down. */
export const ARM_GEO = mergeGeometries([
  colored(new THREE.BoxGeometry(0.026, 0.1, 0.026).translate(0, -0.05, 0), '#c58c5c'),
  colored(new THREE.BoxGeometry(0.05, 0.012, 0.016).translate(0, -0.105, 0), '#d9b24a'),
  colored(new THREE.BoxGeometry(0.014, 0.2, 0.008).translate(0, -0.21, 0), '#e6e9ee'),
])!;
export const SHOULDER = new THREE.Vector3(0.07, 0.2, 0);
/** Soldiers are drawn at this size so they read at the realm's camera distance. */
export const SOLDIER_SCALE = 1.6;

export const GEAR_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1, flatShading: true });
/** White base for instance-coloured bodies (the melee mixes factions in one mesh). */
export const BODY_WHITE = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, flatShading: true });

/** Arm poses (radians around the shoulder's x axis). */
export const ARM_REST = -0.95;
export const ARM_RAISED = -2.9;
export const ARM_STRIKE = -1.45;

/** A sword swing cycle: wind up overhead, hack down, recover. `t` in cycles. */
export function swing(t: number): number {
  const f = t - Math.floor(t);
  if (f < 0.45) return ARM_REST + (ARM_RAISED - ARM_REST) * Math.sin((f / 0.45) * (Math.PI / 2));
  if (f < 0.6) return ARM_RAISED + (ARM_STRIKE - ARM_RAISED) * ((f - 0.45) / 0.15);
  return ARM_STRIKE + (ARM_REST - ARM_STRIKE) * ((f - 0.6) / 0.4);
}

const obj = new THREE.Object3D();
obj.rotation.order = 'YXZ';
const armLocal = new THREE.Matrix4();
const rx = new THREE.Matrix4();
const m = new THREE.Matrix4();

export interface SoldierMeshes {
  body: THREE.InstancedMesh | null;
  gear: THREE.InstancedMesh | null;
  arm: THREE.InstancedMesh | null;
}

/**
 * Writes soldier `i`. `tilt` leans around the local x axis (positive = forward, −π/2 = flat on
 * the back), `arm` is the sword-arm angle.
 */
export function writeSoldier(
  meshes: SoldierMeshes,
  i: number,
  x: number,
  y: number,
  z: number,
  face: number,
  tilt: number,
  scale: number,
  arm: number,
) {
  obj.position.set(x, y, z);
  obj.rotation.set(tilt, face, 0);
  obj.scale.setScalar(Math.max(scale * SOLDIER_SCALE, 0.0001));
  obj.updateMatrix();
  meshes.body?.setMatrixAt(i, obj.matrix);
  meshes.gear?.setMatrixAt(i, obj.matrix);
  if (meshes.arm) {
    armLocal.makeTranslation(SHOULDER.x, SHOULDER.y, SHOULDER.z);
    rx.makeRotationX(arm);
    m.multiplyMatrices(obj.matrix, armLocal).multiply(rx);
    meshes.arm.setMatrixAt(i, m);
  }
}

export function commitSoldiers(meshes: SoldierMeshes, count: number) {
  for (const k of ['body', 'gear', 'arm'] as const) {
    const mesh = meshes[k];
    if (!mesh) continue;
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }
}
