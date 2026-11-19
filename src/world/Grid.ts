import { TILE } from '../config';
import { T, TILE_HP, isAnchor, isDestructible, isSolid, isOneWay, isLadder } from './tiles';

/** Destructible tile grid. Every change is recorded so renderer + network can follow it. */
export class Grid {
  readonly w: number;
  readonly h: number;
  readonly tiles: Uint8Array;
  readonly dmg: Float32Array;
  private dirty: number[] = [];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.dmg = new Float32Array(w * h);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** outside left/right = metal wall, above = air, below = bottomless pit */
  get(x: number, y: number): number {
    if (x < 0 || x >= this.w) return T.METAL;
    if (y < 0 || y >= this.h) return T.EMPTY;
    return this.tiles[y * this.w + x];
  }

  set(x: number, y: number, t: number): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.w + x;
    if (this.tiles[i] === t) return;
    this.tiles[i] = t;
    this.dmg[i] = 0;
    this.dirty.push(i, t);
  }

  /** set without recording (level generation) */
  init(x: number, y: number, t: number): void {
    if (this.inBounds(x, y)) this.tiles[y * this.w + x] = t;
  }

  drainDirty(): number[] {
    const d = this.dirty;
    this.dirty = [];
    return d;
  }

  applyChanges(changes: number[]): void {
    for (let k = 0; k + 1 < changes.length; k += 2) {
      const i = changes[k];
      const t = changes[k + 1];
      if (i < 0 || i >= this.tiles.length) continue;
      this.tiles[i] = t;
      this.dirty.push(i, t);
    }
  }

  solidAt(px: number, py: number): boolean {
    return isSolid(this.get(Math.floor(px / TILE), Math.floor(py / TILE)));
  }

  oneWayAt(px: number, py: number): boolean {
    return isOneWay(this.get(Math.floor(px / TILE), Math.floor(py / TILE)));
  }

  ladderAt(px: number, py: number): boolean {
    return isLadder(this.get(Math.floor(px / TILE), Math.floor(py / TILE)));
  }

  /** returns true if the tile got destroyed */
  damage(x: number, y: number, amount: number): boolean {
    const t = this.get(x, y);
    if (!this.inBounds(x, y) || !isDestructible(t)) return false;
    const i = y * this.w + x;
    this.dmg[i] += amount;
    if (this.dmg[i] >= TILE_HP[t]) {
      this.set(x, y, T.EMPTY);
      return true;
    }
    return false;
  }

  /** line of sight between two points (tile-stepped) */
  los(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE / 2));
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      if (this.solidAt(x0 + dx * f, y0 + dy * f)) return false;
    }
    return true;
  }

  /** topmost solid-or-platform row in column, or -1 */
  surfaceRow(x: number): number {
    for (let y = 0; y < this.h; y++) {
      const t = this.get(x, y);
      if (isSolid(t) || isOneWay(t)) return y;
    }
    return -1;
  }

  /**
   * After an explosion: tiles in the box that are no longer connected to an
   * anchor (bedrock/metal) or the box border fall down. Returns fallen tiles.
   */
  findUnsupported(cx: number, cy: number, radius: number): { x: number; y: number; t: number }[] {
    const x0 = Math.max(0, cx - radius);
    const x1 = Math.min(this.w - 1, cx + radius);
    const y0 = Math.max(0, cy - radius);
    const y1 = Math.min(this.h - 1, cy + radius);
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const seen = new Uint8Array(bw * bh);
    const stack: number[] = [];
    const filled = (x: number, y: number) => {
      const t = this.get(x, y);
      return isSolid(t) || isOneWay(t);
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!filled(x, y)) continue;
        const border = (x === x0 && x0 > 0) || (x === x1 && x1 < this.w - 1) || y === y0 || y === y1;
        if (border || isAnchor(this.get(x, y))) {
          const k = (y - y0) * bw + (x - x0);
          if (!seen[k]) {
            seen[k] = 1;
            stack.push(x, y);
          }
        }
      }
    }
    while (stack.length) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      const nb = [x + 1, y, x - 1, y, x, y + 1, x, y - 1];
      for (let n = 0; n < 8; n += 2) {
        const nx = nb[n];
        const ny = nb[n + 1];
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const k = (ny - y0) * bw + (nx - x0);
        if (seen[k] || !filled(nx, ny)) continue;
        seen[k] = 1;
        stack.push(nx, ny);
      }
    }
    const out: { x: number; y: number; t: number }[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (filled(x, y) && !seen[(y - y0) * bw + (x - x0)] && isDestructible(this.get(x, y))) {
          out.push({ x, y, t: this.get(x, y) });
        }
      }
    }
    return out;
  }
}
