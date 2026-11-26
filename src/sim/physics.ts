import { TILE } from '../config';
import type { Grid } from '../world/Grid';
import { isOneWay, isSolid } from '../world/tiles';

export interface Body {
  x: number; // top-left
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  wallL: boolean;
  wallR: boolean;
}

export function makeBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, wallL: false, wallR: false };
}

/** Axis-separated AABB vs tile grid movement. */
export function moveBody(b: Body, g: Grid, dt: number, dropThrough = false): { hitX: boolean; hitY: boolean } {
  let hitX = false;
  let hitY = false;

  // --- X axis
  b.x += b.vx * dt;
  const ty0 = Math.floor((b.y + 1) / TILE);
  const ty1 = Math.floor((b.y + b.h - 1) / TILE);
  if (b.vx > 0) {
    const tx = Math.floor((b.x + b.w) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (isSolid(g.get(tx, ty))) {
        b.x = tx * TILE - b.w - 0.001;
        b.vx = 0;
        hitX = true;
        break;
      }
    }
  } else if (b.vx < 0) {
    const tx = Math.floor(b.x / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (isSolid(g.get(tx, ty))) {
        b.x = (tx + 1) * TILE + 0.001;
        b.vx = 0;
        hitX = true;
        break;
      }
    }
  }

  // --- Y axis
  const prevBottom = b.y + b.h;
  b.y += b.vy * dt;
  b.onGround = false;
  const tx0 = Math.floor((b.x + 1) / TILE);
  const tx1 = Math.floor((b.x + b.w - 1) / TILE);
  if (b.vy > 0) {
    const ty = Math.floor((b.y + b.h) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = g.get(tx, ty);
      const top = ty * TILE;
      if (isSolid(t) || (isOneWay(t) && !dropThrough && prevBottom <= top + 0.5)) {
        b.y = top - b.h;
        b.vy = 0;
        b.onGround = true;
        hitY = true;
        break;
      }
    }
  } else if (b.vy < 0) {
    const ty = Math.floor(b.y / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSolid(g.get(tx, ty))) {
        b.y = (ty + 1) * TILE;
        b.vy = 0;
        hitY = true;
        break;
      }
    }
  }

  // ground probe when standing still
  if (!b.onGround && b.vy >= 0) {
    const ty = Math.floor((b.y + b.h + 0.5) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = g.get(tx, ty);
      if (isSolid(t) || (isOneWay(t) && !dropThrough && Math.abs(b.y + b.h - ty * TILE) < 0.6)) {
        b.onGround = true;
        break;
      }
    }
  }

  // wall probes
  b.wallL = false;
  b.wallR = false;
  const midA = Math.floor((b.y + 2) / TILE);
  const midB = Math.floor((b.y + b.h - 3) / TILE);
  const lx = Math.floor((b.x - 1) / TILE);
  const rx = Math.floor((b.x + b.w + 1) / TILE);
  for (let ty = midA; ty <= midB; ty++) {
    if (isSolid(g.get(lx, ty))) b.wallL = true;
    if (isSolid(g.get(rx, ty))) b.wallR = true;
  }
  return { hitX, hitY };
}

export function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** does the segment (x0,y0)-(x1,y1) touch the box? (Liang-Barsky clipping) */
export function segmentHits(x0: number, y0: number, x1: number, y1: number, b: { x: number; y: number; w: number; h: number }): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, x0 - b.x) && clip(dx, b.x + b.w - x0) && clip(-dy, y0 - b.y) && clip(dy, b.y + b.h - y0) && t0 <= t1;
}

export function pointIn(px: number, py: number, b: { x: number; y: number; w: number; h: number }): boolean {
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}
