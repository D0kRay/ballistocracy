import { clamp } from '../core/rng';

export interface Cam {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Co-op camera rules:
 *  - follows the middle of all living players
 *  - never scrolls a player out of view
 *  - when players are spread across the whole screen the camera stops;
 *    the front player is then held at the front edge until the last one moves up
 */
export function computeCamera(
  prev: Cam,
  players: Box[],
  levelW: number,
  levelH: number,
  viewW: number,
  viewH: number,
  margin: number,
  lockX: number | null,
): Cam {
  let x = prev.x;
  let y = prev.y;
  const maxX = Math.max(0, levelW - viewW);
  const maxY = Math.max(0, levelH - viewH);

  if (lockX !== null) {
    x = lockX;
  } else if (players.length) {
    let minPX = Infinity;
    let maxPX = -Infinity;
    for (const p of players) {
      minPX = Math.min(minPX, p.x);
      maxPX = Math.max(maxPX, p.x + p.w);
    }
    const hi = minPX - margin; // camera left edge may not pass the back player
    const lo = maxPX + margin - viewW; // ...and must still show the front player
    if (lo <= hi) {
      const target = clamp((minPX + maxPX) / 2 - viewW / 2, lo, hi);
      x = prev.x + (target - prev.x) * 0.2;
      x = clamp(x, lo, hi);
    }
    // else: players span the screen -> camera holds, players get clamped
  }
  x = clamp(x, 0, maxX);

  if (players.length) {
    let minPY = Infinity;
    let maxPY = -Infinity;
    for (const p of players) {
      minPY = Math.min(minPY, p.y);
      maxPY = Math.max(maxPY, p.y + p.h);
    }
    const hi = minPY - 24;
    const lo = maxPY + 24 - viewH;
    const target = (minPY + maxPY) / 2 - viewH * 0.55;
    if (lo <= hi) {
      y = prev.y + (clamp(target, lo, hi) - prev.y) * 0.12;
      y = clamp(y, lo, hi); // never let a climber leave the top of the screen
    }
  }
  y = clamp(y, 0, maxY);
  return { x, y };
}

/** keep a player body inside the camera view (sides and top; falling out of the bottom is allowed) */
export function clampToView(p: Box & { vx: number; vy?: number }, cam: Cam, viewW: number): void {
  if (p.y < cam.y + 2 && cam.y > 0) {
    p.y = cam.y + 2;
    if (p.vy !== undefined && p.vy < 0) p.vy = 0;
  }
  const left = cam.x + 2;
  const right = cam.x + viewW - 2 - p.w;
  if (p.x < left) {
    p.x = left;
    if (p.vx < 0) p.vx = 0;
  } else if (p.x > right) {
    p.x = right;
    if (p.vx > 0) p.vx = 0;
  }
}
