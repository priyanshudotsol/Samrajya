/**
 * Per-frame hints for the camera director (docs/KINGDOM_UI.md §11.4). Plain mutable objects:
 * the unit renderer and the melee write them every frame, CameraRig reads them. Nothing here
 * goes through React state.
 */
import type { Camera } from 'three';

export type CameraMode = 'orbit' | 'follow' | 'group' | 'cinematic';

export const cameraState = {
  /** The realm camera (set by CameraRig) so DOM input can raycast. */
  camera: null as Camera | null,
  /** Chase camera around your warrior: yaw (right-drag), pitch (right-drag), distance (wheel). */
  follow: { yaw: 0, pitch: 1.0, dist: 7.2, turnedAt: -1e9 },
  /** Camera yaw (radians, atan2(dir.x, dir.z)) so keyboard input can be camera-relative. */
  yaw: 0,
  mode: 'orbit' as CameraMode,
  /** The viewer's warrior, if it is in this realm. */
  mine: { active: false, x: 0, y: 0, z: 0, facing: 0, moving: false, lastMoveAt: 0 },
  /** Everyone moving in this realm (bots marching, attackers at the gate, a melee). */
  group: { count: 0, moving: 0, cx: 0, cy: 0, cz: 0, radius: 0 },
  /** Set by the melee: centre of the fighting. */
  fight: { active: false, cx: 0, cy: 0, cz: 0, radius: 0 },
};

/** Running centroid/radius accumulator (call reset, add…, finish). */
export class Cluster {
  n = 0;
  moving = 0;
  sx = 0;
  sy = 0;
  sz = 0;
  private xs: number[] = [];
  private zs: number[] = [];
  reset() {
    this.n = 0;
    this.moving = 0;
    this.sx = this.sy = this.sz = 0;
    this.xs.length = 0;
    this.zs.length = 0;
  }
  add(x: number, y: number, z: number, moving: boolean) {
    this.n++;
    if (moving) this.moving++;
    this.sx += x;
    this.sy += y;
    this.sz += z;
    this.xs.push(x);
    this.zs.push(z);
  }
  finish(out: { count: number; moving: number; cx: number; cy: number; cz: number; radius: number }) {
    out.count = this.n;
    out.moving = this.moving;
    if (this.n === 0) {
      out.radius = 0;
      return;
    }
    out.cx = this.sx / this.n;
    out.cy = this.sy / this.n;
    out.cz = this.sz / this.n;
    let r = 0;
    for (let i = 0; i < this.n; i++) r = Math.max(r, Math.hypot(this.xs[i] - out.cx, this.zs[i] - out.cz));
    out.radius = r;
  }
}
