import Phaser from 'phaser';
import { TILE } from '../config';
import { Rng } from '../core/rng';
import type { Biome } from '../world/biomes';
import { T, TILE_TYPES } from '../world/tiles';
import { shade } from './SpriteForge';

// Chunky, shaded terrain blocks. Every tile type is painted in 16 edge variants
// (which sides touch air) x 2 random variants, so exposed edges get grass caps,
// dark outlines and hanging roots, while buried tiles stay plain.

export const EDGE = { TOP: 1, RIGHT: 2, BOTTOM: 4, LEFT: 8 } as const;
export const VARIANTS = 32; // 16 masks * 2 alts
export const BACK = { NONE: 0, DIRT: 1, STONE: 2, WINDOW: 3, WOOD: 4 } as const;
export const DECOR_FRAMES = 8;

const OUT = '#120c10';

function canvasTex(scene: Phaser.Scene, key: string, frames: number, draw: (ctx: CanvasRenderingContext2D, f: number, ox: number) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, TILE * frames, TILE)!;
  const ctx = tex.getContext();
  for (let f = 0; f < frames; f++) draw(ctx, f, f * TILE);
  for (let i = 0; i < frames; i++) tex.add(i, 0, i * TILE, 0, TILE, TILE);
  tex.refresh();
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

/** smooth-ish value noise texture with a 4 tone palette (tileable) */
function earth(ctx: CanvasRenderingContext2D, ox: number, rng: Rng, tones: string[], cell = 4): void {
  const n = TILE / cell;
  const g: number[] = [];
  for (let i = 0; i < n * n; i++) g.push(rng.next());
  const at = (x: number, y: number) => g[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const fx = x / cell;
      const fy = y / cell;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const v =
        at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
      const d = v + (rng.next() - 0.5) * 0.2;
      const idx = d < 0.3 ? 0 : d < 0.5 ? 1 : d < 0.78 ? 2 : 3;
      px(ctx, ox + x, y, tones[idx]);
    }
}

function pebble(ctx: CanvasRenderingContext2D, ox: number, x: number, y: number, c: string): void {
  px(ctx, ox + x, y, shade(c, 1.25), 2, 1);
  px(ctx, ox + x, y + 1, c, 3, 1);
  px(ctx, ox + x + 1, y + 2, shade(c, 0.6), 2, 1);
}

function edges(ctx: CanvasRenderingContext2D, ox: number, mask: number, base: string, topCap: ((ctx: CanvasRenderingContext2D, ox: number) => void) | null, rng: Rng, roots: boolean): void {
  if (mask & EDGE.LEFT) {
    px(ctx, ox, 0, OUT, 1, TILE);
    px(ctx, ox + 1, 0, shade(base, 0.7), 1, TILE);
  }
  if (mask & EDGE.RIGHT) {
    px(ctx, ox + 15, 0, OUT, 1, TILE);
    px(ctx, ox + 14, 0, shade(base, 0.7), 1, TILE);
  }
  if (mask & EDGE.BOTTOM) {
    px(ctx, ox, 15, OUT, TILE, 1);
    px(ctx, ox, 14, shade(base, 0.65), TILE, 1);
    if (roots) {
      for (let i = 0; i < 3; i++) {
        const x = rng.int(2, 13);
        px(ctx, ox + x, 13, shade(base, 0.45), 1, 3);
      }
    }
  }
  if (mask & EDGE.TOP) {
    if (topCap) topCap(ctx, ox);
    else {
      px(ctx, ox, 0, OUT, TILE, 1);
      px(ctx, ox, 1, shade(base, 1.3), TILE, 1);
    }
  }
}

function paint(ctx: CanvasRenderingContext2D, ox: number, t: number, mask: number, rng: Rng, b: Biome): void {
  const dirtTones = [shade(b.dirtDark, 0.62), shade(b.dirtDark, 0.86), shade(b.dirt, 0.84), shade(b.dirt, 0.97)];
  switch (t) {
    case T.DIRT: {
      // calm base: two close tones, then a few chunky features
      earth(ctx, ox, rng, [dirtTones[1], dirtTones[2], dirtTones[2], dirtTones[3]], 8);
      for (let i = 0; i < 3; i++) {
        const x = rng.int(0, 13);
        const y = rng.int(0, 14);
        px(ctx, ox + x, y, dirtTones[0], rng.int(2, 3), 1);
      }
      if (rng.chance(0.7)) pebble(ctx, ox, rng.int(1, 11), rng.int(4, 11), shade(b.dirtDark, 1.25));
      if (rng.chance(0.4)) {
        const x = rng.int(2, 12);
        const y = rng.int(3, 12);
        px(ctx, ox + x, y, shade(b.dirtDark, 0.55), 1, 3);
        px(ctx, ox + x + 1, y + 2, shade(b.dirtDark, 0.55), 2, 1);
      }
      edges(ctx, ox, mask, b.dirt, (c, o) => {
        for (let x = 0; x < TILE; x++) {
          const d = 3 + ((x * 7 + rng.int(0, 2)) % 3);
          px(c, o + x, 0, b.top, 1, d);
          px(c, o + x, d, b.topDark, 1, 1);
          px(c, o + x, d + 1, shade(b.dirtDark, 0.7), 1, 1);
          if (x % 3 === rng.int(0, 2)) px(c, o + x, 0, shade(b.top, 1.3));
        }
        if (mask & EDGE.LEFT) px(c, o, 0, b.topDark, 1, 5);
        if (mask & EDGE.RIGHT) px(c, o + 15, 0, b.topDark, 1, 5);
      }, rng, true);
      break;
    }
    case T.BRICK:
    case T.CRUMBLE: {
      // big stone blocks, 8x8 with bevels
      px(ctx, ox, 0, b.brickDark, TILE, TILE);
      for (let by = 0; by < 2; by++) {
        const starts = by ? [-4, 4, 12] : [0, 8];
        for (const st of starts) {
          const xs = Math.max(0, st);
          const xe = Math.min(16, st + 8);
          const y = by * 8;
          const c = shade(b.brick, rng.range(0.9, 1.08));
          px(ctx, ox + xs, y, c, xe - xs - 1, 7);
          px(ctx, ox + xs, y, shade(c, 1.25), xe - xs - 1, 1);
          px(ctx, ox + xs, y + 6, shade(c, 0.72), xe - xs - 1, 1);
          if (rng.chance(0.4) && xe - xs > 5) px(ctx, ox + xs + rng.int(1, 3), y + rng.int(2, 4), shade(c, 0.8), 2, 1);
        }
      }
      if (by4(rng)) px(ctx, ox + 4, 12, shade(b.brick, 0.8), 3, 1);
      if (t === T.CRUMBLE) {
        const c = OUT;
        px(ctx, ox + 3, 2, c, 1, 4); px(ctx, ox + 4, 5, c, 3, 1); px(ctx, ox + 7, 6, c, 1, 5);
        px(ctx, ox + 11, 1, c, 1, 3); px(ctx, ox + 10, 4, c, 1, 4); px(ctx, ox + 9, 8, c, 3, 1);
      }
      edges(ctx, ox, mask, b.brick, null, rng, false);
      break;
    }
    case T.WOOD: {
      px(ctx, ox, 0, b.wood, TILE, TILE);
      for (let y = 0; y < TILE; y += 4) {
        px(ctx, ox, y + 3, shade(b.wood, 0.5), TILE, 1);
        px(ctx, ox, y, shade(b.wood, 1.22), TILE, 1);
        for (let i = 0; i < 3; i++) px(ctx, ox + rng.int(0, 13), y + 1 + rng.int(0, 1), shade(b.wood, 0.8), rng.int(2, 4), 1);
      }
      px(ctx, ox + 7, 0, shade(b.wood, 0.55), 1, TILE);
      for (const y of [1, 5, 9, 13]) { px(ctx, ox + 2, y, '#2a2420'); px(ctx, ox + 12, y, '#2a2420'); }
      edges(ctx, ox, mask, b.wood, null, rng, false);
      break;
    }
    case T.METAL: {
      px(ctx, ox, 0, b.metal, TILE, TILE);
      px(ctx, ox + 1, 1, shade(b.metal, 1.3), 14, 1);
      px(ctx, ox + 1, 1, shade(b.metal, 1.3), 1, 14);
      px(ctx, ox + 1, 14, shade(b.metal, 0.6), 14, 1);
      px(ctx, ox + 14, 1, shade(b.metal, 0.6), 1, 14);
      for (let i = 0; i < 4; i++) px(ctx, ox + 3 + i * 3, 4 + i * 2, shade(b.metal, 1.12), 2, 1);
      for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) {
        px(ctx, ox + x, y, shade(b.metal, 1.6));
        px(ctx, ox + x + 1, y + 1, shade(b.metal, 0.45));
      }
      px(ctx, ox, 0, OUT, TILE, 1); px(ctx, ox, 15, OUT, TILE, 1); px(ctx, ox, 0, OUT, 1, TILE); px(ctx, ox + 15, 0, OUT, 1, TILE);
      break;
    }
    case T.BEDROCK: {
      earth(ctx, ox, rng, [shade(b.dirtDark, 0.3), shade(b.dirtDark, 0.42), shade(b.dirtDark, 0.55), shade(b.dirtDark, 0.7)], 4);
      for (let i = 0; i < 2; i++) pebble(ctx, ox, rng.int(1, 11), rng.int(1, 11), shade(b.dirtDark, 0.8));
      if (mask & EDGE.TOP) px(ctx, ox, 0, OUT, TILE, 1);
      break;
    }
    case T.LADDER: {
      const c = shade(b.wood, 1.1);
      const d = shade(b.wood, 0.55);
      px(ctx, ox + 2, 0, OUT, 4, TILE); px(ctx, ox + 11, 0, OUT, 4, TILE);
      px(ctx, ox + 3, 0, c, 2, TILE); px(ctx, ox + 12, 0, c, 2, TILE);
      px(ctx, ox + 4, 0, d, 1, TILE); px(ctx, ox + 13, 0, d, 1, TILE);
      for (let y = 2; y < TILE; y += 5) {
        px(ctx, ox + 5, y - 1, OUT, 6, 4);
        px(ctx, ox + 5, y, c, 6, 2);
        px(ctx, ox + 5, y + 1, d, 6, 1);
      }
      break;
    }
    case T.SANDBAG: {
      const s = '#b8a070';
      const sd = '#7a6440';
      px(ctx, ox, 0, '#00000000', 0, 0);
      for (let row = 0; row < 3; row++) {
        const y = row * 5 + 1;
        const off = row % 2 ? -4 : 0;
        for (let x = off; x < TILE; x += 8) {
          const xs = Math.max(0, x);
          const w = Math.min(8, TILE - xs) - (x < 0 ? 4 : 0);
          if (w <= 1) continue;
          px(ctx, ox + xs, y - 1, OUT, w, 6);
          px(ctx, ox + xs + 1, y, s, w - 2, 4);
          px(ctx, ox + xs + 1, y + 3, sd, w - 2, 1);
          px(ctx, ox + xs + 2, y, shade(s, 1.25), Math.max(1, w - 5), 1);
        }
      }
      break;
    }
    case T.PLATFORM: {
      px(ctx, ox, 0, OUT, TILE, 6);
      px(ctx, ox, 1, b.wood, TILE, 4);
      px(ctx, ox, 1, shade(b.wood, 1.3), TILE, 1);
      px(ctx, ox, 4, shade(b.wood, 0.55), TILE, 1);
      px(ctx, ox + 3, 6, OUT, 4, 5); px(ctx, ox + 4, 6, shade(b.wood, 0.6), 2, 4);
      px(ctx, ox + 10, 6, OUT, 4, 5); px(ctx, ox + 11, 6, shade(b.wood, 0.6), 2, 4);
      px(ctx, ox + 7, 2, '#2a2420');
      break;
    }
    default:
      break;
  }
}

function by4(rng: Rng): boolean {
  return rng.chance(0.25);
}

export function makeTiles(scene: Phaser.Scene, b: Biome): string {
  const key = `tiles_${b.id}`;
  canvasTex(scene, key, TILE_TYPES * VARIANTS, (ctx, f, ox) => {
    const t = Math.floor(f / VARIANTS);
    const v = f % VARIANTS;
    const mask = v >> 1;
    const rng = new Rng(1000 + t * 7919 + (v & 1) * 104729);
    paint(ctx, ox, t, mask, rng, b);
  });
  return key;
}

export function tileFrame(t: number, mask: number, alt: number): number {
  return t * VARIANTS + mask * 2 + (alt & 1);
}

/** dark walls behind the terrain: visible once the ground in front is blown away */
export function makeBackTiles(scene: Phaser.Scene, b: Biome): string {
  const key = `back_${b.id}`;
  canvasTex(scene, key, 5, (ctx, f, ox) => {
    const rng = new Rng(77 + f * 31);
    if (f === BACK.DIRT) {
      earth(ctx, ox, rng, [shade(b.dirtDark, 0.32), shade(b.dirtDark, 0.4), shade(b.dirtDark, 0.48), shade(b.dirtDark, 0.56)], 8);
    } else if (f === BACK.STONE || f === BACK.WINDOW) {
      const c = shade(b.brickDark, 0.55);
      px(ctx, ox, 0, shade(c, 0.6), TILE, TILE);
      for (let y = 0; y < TILE; y += 8) {
        px(ctx, ox + 1, y + 1, c, 14, 6);
        px(ctx, ox + 1, y + 1, shade(c, 1.2), 14, 1);
      }
      px(ctx, ox + 7, 0, shade(c, 0.5), 1, TILE);
      if (f === BACK.WINDOW) {
        px(ctx, ox + 3, 3, OUT, 10, 10);
        px(ctx, ox + 4, 4, '#f0c860', 8, 8);
        px(ctx, ox + 4, 4, '#fff0b0', 3, 3);
        px(ctx, ox + 7, 4, OUT, 2, 8);
        px(ctx, ox + 4, 7, OUT, 8, 2);
      }
    } else if (f === BACK.WOOD) {
      const c = shade(b.wood, 0.45);
      px(ctx, ox, 0, c, TILE, TILE);
      for (let x = 0; x < TILE; x += 4) px(ctx, ox + x, 0, shade(c, 0.6), 1, TILE);
    }
  });
  return key;
}

/** grass tufts, flowers, rocks, bushes that sit on top of surface tiles */
export function makeDecor(scene: Phaser.Scene, b: Biome): string {
  const key = `decor_${b.id}`;
  canvasTex(scene, key, DECOR_FRAMES, (ctx, f, ox) => {
    const rng = new Rng(500 + f * 13);
    const g = b.top;
    const gd = b.topDark;
    if (f < 4) {
      // tufts of grass hanging over the top edge
      for (let i = 0; i < 6 + f; i++) {
        const x = rng.int(0, 15);
        const h = rng.int(2, 5 + f);
        px(ctx, ox + x, 16 - h, gd, 1, h);
        px(ctx, ox + x, 16 - h, g, 1, Math.max(1, h - 2));
        if (rng.chance(0.4)) px(ctx, ox + x, 16 - h, shade(g, 1.3));
      }
    } else if (f === 4) {
      for (let i = 0; i < 4; i++) {
        const x = rng.int(1, 14);
        px(ctx, ox + x, 11, gd, 1, 5);
        px(ctx, ox + x - 1, 10, b.id === 'snow' ? '#a0d0ff' : '#f04060', 3, 1);
        px(ctx, ox + x, 9, b.id === 'snow' ? '#a0d0ff' : '#f8e040', 1, 3);
      }
    } else if (f === 5) {
      px(ctx, ox + 4, 11, OUT, 8, 5);
      px(ctx, ox + 5, 12, '#8a8478', 6, 4);
      px(ctx, ox + 5, 12, '#b0aa9a', 3, 1);
    } else if (f === 6) {
      // bush
      for (let y = 6; y < 16; y++)
        for (let x = 1; x < 15; x++) {
          const d = Math.hypot(x - 7.5, (y - 12) * 1.3);
          if (d < 6.5) px(ctx, ox + x, y, d > 5.6 ? OUT : y < 10 ? shade(g, 1.1) : gd);
        }
    } else {
      // skull on a stick (enemy territory marker)
      px(ctx, ox + 7, 6, OUT, 3, 10);
      px(ctx, ox + 8, 7, '#7a5a3a', 1, 9);
      px(ctx, ox + 5, 1, OUT, 7, 6);
      px(ctx, ox + 6, 2, '#e8e0c8', 5, 4);
      px(ctx, ox + 7, 3, OUT); px(ctx, ox + 9, 3, OUT);
      px(ctx, ox + 7, 5, '#a8a090', 3, 1);
    }
  });
  return key;
}
