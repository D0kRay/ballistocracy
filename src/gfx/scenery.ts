import Phaser from 'phaser';
import { Rng } from '../core/rng';
import type { Biome } from '../world/biomes';
import { shade } from './SpriteForge';

// Biome scenery: trees, huts' roofs, lamps, wrecks, tanks, totems...
// Painted with simple shapes, then auto-outlined so they match the sprites.

const OUT = [18, 12, 16];

type Draw = (c: CanvasRenderingContext2D, rng: Rng, f: number) => void;

interface Def {
  w: number;
  h: number;
  frames?: number;
  draw: Draw;
}

function outline(c: CanvasRenderingContext2D, w: number, h: number): void {
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
  const add: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) add.push(x, y);
    }
  for (let i = 0; i < add.length; i += 2) {
    const k = (add[i + 1] * w + add[i]) * 4;
    d[k] = OUT[0];
    d[k + 1] = OUT[1];
    d[k + 2] = OUT[2];
    d[k + 3] = 255;
  }
  // kill anti-aliasing: hard alpha
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 40 ? 255 : 0;
  c.putImageData(img, 0, 0);
}

const R = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};
const disc = (c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string, sy = 1) => {
  c.fillStyle = col;
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) if (x * x + (y / sy) * (y / sy) <= r * r) c.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
};

function blobTree(c: CanvasRenderingContext2D, rng: Rng, cx: number, cy: number, r: number, g: string): void {
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) blobs.push([cx + rng.range(-r, r) * 0.8, cy + rng.range(-r, r) * 0.5, r * rng.range(0.45, 0.7)]);
  for (const [x, y, br] of blobs) disc(c, x, y + 2, Math.round(br), shade(g, 0.6));
  for (const [x, y, br] of blobs) disc(c, x, y, Math.round(br * 0.85), g);
  for (const [x, y, br] of blobs) disc(c, x - br * 0.3, y - br * 0.35, Math.round(br * 0.35), shade(g, 1.25));
}

function defs(b: Biome): Record<string, Def> {
  const leaf = b.id === 'desert' ? '#5a9a3a' : b.id === 'snow' ? '#2e5a4a' : b.top;
  const bark = '#6a4428';
  const wood = b.wood;
  return {
    palm: {
      w: 44, h: 60, draw: (c, rng) => {
        let x = 22;
        const bend = rng.range(-0.25, 0.25);
        for (let y = 59; y > 16; y -= 3) {
          R(c, x - 2, y - 3, 5, 3, bark);
          R(c, x - 2, y - 1, 5, 1, shade(bark, 0.6));
          R(c, x - 2, y - 3, 1, 3, shade(bark, 1.3));
          x += bend;
        }
        const tx = x;
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI / 2 + (k - 3) * 0.55;
          for (let s = 0; s < 18; s++) {
            const px = tx + Math.cos(a) * s;
            const py = 16 + Math.sin(a) * s * 0.6 + (s * s) / 30;
            R(c, px, py, 2, 2, s > 12 ? shade(leaf, 0.8) : leaf);
            if (s % 3 === 0) R(c, px, py + 2, 1, 2, shade(leaf, 0.65));
          }
        }
        disc(c, tx, 17, 3, '#7a5a2a');
        R(c, tx - 1, 15, 2, 2, '#a07a3a');
      },
    },
    jungletree: {
      w: 52, h: 68, draw: (c, rng) => {
        R(c, 22, 30, 8, 38, bark);
        R(c, 22, 30, 2, 38, shade(bark, 1.3));
        R(c, 28, 30, 2, 38, shade(bark, 0.6));
        R(c, 18, 62, 16, 6, bark);
        R(c, 14, 36, 10, 3, bark);
        blobTree(c, rng, 26, 22, 20, shade(leaf, 0.9));
        if (b.vines) for (let i = 0; i < 4; i++) R(c, rng.int(10, 40), 30, 1, rng.int(8, 18), b.vines);
      },
    },
    fern: {
      w: 22, h: 12, draw: (c, rng) => {
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI + (k / 6) * Math.PI;
          for (let s = 0; s < 9; s++) R(c, 11 + Math.cos(a) * s, 11 + Math.sin(a) * s * 0.9 + s * s * 0.04, 1, 1, s > 5 ? shade(leaf, 0.8) : leaf);
        }
        void rng;
      },
    },
    totem: {
      w: 14, h: 32, draw: (c) => {
        R(c, 4, 6, 6, 26, '#7a5a3a');
        for (let i = 0; i < 3; i++) {
          const y = 8 + i * 8;
          R(c, 3, y, 8, 6, ['#a0442a', '#3a6a8a', '#c89a3a'][i]);
          R(c, 4, y + 1, 2, 2, '#f0f0e0');
          R(c, 8, y + 1, 2, 2, '#f0f0e0');
          R(c, 5, y + 4, 4, 1, '#1a1210');
        }
        R(c, 3, 0, 8, 6, '#e8e0c8');
        R(c, 4, 2, 2, 2, '#1a1210');
        R(c, 8, 2, 2, 2, '#1a1210');
      },
    },
    cactus: {
      w: 18, h: 32, draw: (c) => {
        const g = '#4a8a3a';
        R(c, 7, 2, 5, 30, g);
        R(c, 7, 2, 1, 30, shade(g, 1.3));
        R(c, 11, 2, 1, 30, shade(g, 0.6));
        R(c, 2, 12, 5, 3, g);
        R(c, 2, 6, 3, 9, g);
        R(c, 12, 16, 4, 3, g);
        R(c, 13, 9, 3, 10, g);
        for (let y = 4; y < 30; y += 4) R(c, 9, y, 1, 1, '#f0e8a0');
      },
    },
    bones: {
      w: 22, h: 9, draw: (c) => {
        const bo = '#e8e0c8';
        R(c, 1, 3, 6, 5, bo);
        R(c, 2, 4, 1, 1, '#1a1210');
        R(c, 4, 4, 1, 1, '#1a1210');
        for (let i = 0; i < 5; i++) R(c, 8 + i * 2, 3, 1, 5, bo);
        R(c, 8, 3, 10, 1, bo);
        R(c, 18, 7, 4, 1, bo);
      },
    },
    tent: {
      w: 44, h: 28, draw: (c) => {
        const cv = '#c8b888';
        for (let y = 0; y < 26; y++) {
          const hw = 2 + y * 0.8;
          R(c, 22 - hw, y + 2, hw * 2, 1, y % 6 < 3 ? cv : '#b05a3a');
        }
        for (let y = 10; y < 28; y++) R(c, 22 - (y - 10) * 0.4, y, (y - 10) * 0.8, 1, '#2a1e18');
        R(c, 21, 0, 2, 4, '#5a3a2a');
      },
    },
    pine: {
      w: 30, h: 54, draw: (c) => {
        R(c, 13, 40, 4, 14, bark);
        for (let k = 0; k < 5; k++) {
          const y0 = 4 + k * 8;
          for (let y = 0; y < 12; y++) {
            const hw = 2 + y * (0.6 + k * 0.12);
            R(c, 15 - hw, y0 + y, hw * 2, 1, y > 8 ? shade('#2e5a3e', 0.7) : '#2e5a3e');
            if (b.id === 'snow' && y < 3) R(c, 15 - hw, y0 + y, hw * 2, 1, '#f0f4ff');
          }
        }
      },
    },
    pine_small: {
      w: 20, h: 32, draw: (c) => {
        R(c, 9, 24, 3, 8, bark);
        for (let k = 0; k < 3; k++)
          for (let y = 0; y < 10; y++) {
            const hw = 1 + y * 0.7;
            R(c, 10 - hw, 2 + k * 7 + y, hw * 2, 1, b.id === 'snow' && y < 2 ? '#f0f4ff' : '#2e5a3e');
          }
      },
    },
    lamp: {
      w: 16, h: 50, draw: (c) => {
        R(c, 6, 6, 3, 44, '#3a3e44');
        R(c, 6, 6, 1, 44, '#6a6e78');
        R(c, 4, 46, 7, 4, '#3a3e44');
        R(c, 6, 4, 9, 3, '#3a3e44');
        R(c, 11, 6, 5, 3, '#f8e8a0');
      },
    },
    car: {
      w: 46, h: 22, draw: (c, rng) => {
        const body = rng.pick(['#7a3a2a', '#3a5a7a', '#6a6a3a']);
        R(c, 2, 10, 42, 9, body);
        R(c, 10, 3, 24, 8, body);
        R(c, 12, 4, 9, 6, '#2a3438');
        R(c, 23, 4, 9, 6, '#2a3438');
        R(c, 2, 10, 42, 1, shade(body, 1.3));
        R(c, 2, 17, 42, 2, shade(body, 0.6));
        for (let i = 0; i < 6; i++) R(c, rng.int(3, 40), rng.int(11, 16), 3, 2, '#8a5a2a');
        disc(c, 11, 19, 3, '#1a1a1a');
        disc(c, 35, 19, 3, '#1a1a1a');
      },
    },
    deadtree: {
      w: 32, h: 46, draw: (c, rng) => {
        const t = b.id === 'volcano' ? '#2a2020' : '#5a4a3e';
        R(c, 14, 14, 4, 32, t);
        R(c, 14, 14, 1, 32, shade(t, 1.4));
        const branch = (x: number, y: number, a: number, len: number) => {
          for (let s = 0; s < len; s++) R(c, x + Math.cos(a) * s, y + Math.sin(a) * s, 2, 2, t);
        };
        branch(16, 20, -2.4, 12);
        branch(16, 16, -0.7, 13);
        branch(16, 28, -2.8, 9);
        branch(10, 13, -1.8, 6);
        branch(25, 9, -1.2, 6);
        void rng;
      },
    },
    sign: {
      w: 26, h: 28, draw: (c) => {
        R(c, 5, 14, 2, 14, '#3a3e44');
        R(c, 19, 14, 2, 14, '#3a3e44');
        R(c, 1, 2, 24, 13, '#c8a040');
        R(c, 3, 4, 20, 9, '#e8d8a0');
        R(c, 5, 6, 10, 2, '#b03020');
        R(c, 5, 9, 14, 2, '#3a3a3a');
      },
    },
    hydrant: {
      w: 8, h: 11, draw: (c) => {
        R(c, 2, 2, 4, 9, '#c02020');
        R(c, 1, 4, 6, 2, '#c02020');
        R(c, 3, 0, 2, 2, '#c02020');
        R(c, 2, 2, 1, 9, '#f05040');
      },
    },
    pipe: {
      w: 18, h: 52, draw: (c) => {
        R(c, 5, 0, 8, 52, '#6a6e74');
        R(c, 5, 0, 2, 52, '#9aa0a8');
        R(c, 11, 0, 2, 52, '#3e4248');
        for (const y of [6, 26, 46]) R(c, 3, y, 12, 4, '#4e5258');
        disc(c, 9, 18, 3, '#c03020');
      },
    },
    tank: {
      w: 50, h: 42, draw: (c) => {
        R(c, 4, 6, 42, 32, '#8a7a5a');
        R(c, 4, 6, 6, 32, '#aa9a72');
        R(c, 38, 6, 8, 32, '#5a4e38');
        R(c, 4, 4, 42, 4, '#6a5e44');
        R(c, 6, 38, 4, 4, '#3a3a3a');
        R(c, 40, 38, 4, 4, '#3a3a3a');
        for (let y = 8; y < 36; y += 4) R(c, 30, y, 6, 1, '#3a3a3a');
        R(c, 30, 8, 1, 28, '#3a3a3a');
        R(c, 35, 8, 1, 28, '#3a3a3a');
        R(c, 12, 18, 16, 8, '#f0c020');
        R(c, 14, 20, 12, 4, '#1a1a1a');
      },
    },
    crate_stack: {
      w: 26, h: 26, draw: (c) => {
        const box = (x: number, y: number) => {
          R(c, x, y, 12, 12, '#8a6a3a');
          R(c, x, y, 12, 1, '#aa8a52');
          R(c, x + 1, y + 5, 10, 1, '#5a4224');
          R(c, x + 5, y + 1, 1, 10, '#5a4224');
        };
        box(0, 14);
        box(13, 14);
        box(6, 1);
      },
    },
    spire: {
      w: 22, h: 42, draw: (c) => {
        for (let y = 0; y < 42; y++) {
          const hw = 2 + y * 0.2;
          R(c, 11 - hw, y, hw * 2, 1, y % 7 < 1 ? '#1a1414' : '#3a2e2c');
          R(c, 11 - hw, y, 1, 1, '#5a4a46');
        }
        R(c, 9, 20, 1, 6, '#ff6020');
      },
    },
    post: { w: 4, h: 48, draw: (c) => { R(c, 0, 0, 4, 48, shade(wood, 0.8)); R(c, 0, 0, 1, 48, shade(wood, 1.2)); for (let y = 6; y < 48; y += 12) R(c, 0, y, 4, 1, shade(wood, 0.5)); } },
    roof_thatch: {
      w: 98, h: 24, draw: (c, rng) => {
        const s = b.id === 'volcano' ? '#6a5a3a' : '#c8a050';
        for (let y = 0; y < 22; y++) {
          const hw = 26 + y * 1.0;
          R(c, 49 - hw, y + 1, hw * 2, 1, y % 4 === 3 ? shade(s, 0.7) : s);
        }
        for (let i = 0; i < 40; i++) R(c, rng.int(4, 94), rng.int(4, 22), 1, rng.int(2, 4), shade(s, 1.2));
        for (let x = 4; x < 94; x += 3) R(c, x, 22, 1, 2, shade(s, 0.7));
      },
    },
    roof_snow: {
      w: 98, h: 24, draw: (c) => {
        for (let y = 0; y < 22; y++) {
          const hw = 26 + y * 1.0;
          R(c, 49 - hw, y + 1, hw * 2, 1, y < 7 ? '#f0f4ff' : y % 3 === 0 ? shade(wood, 0.6) : wood);
        }
        for (let x = 8; x < 90; x += 7) R(c, x, 22, 2, 2, '#c8e0ff');
      },
    },
    roof_tent: {
      w: 98, h: 24, draw: (c) => {
        for (let y = 0; y < 22; y++) {
          const hw = 26 + y * 1.0;
          for (let x = Math.round(49 - hw); x < 49 + hw; x++) R(c, x, y + 1, 1, 1, Math.floor(x / 8) % 2 ? '#c8b888' : '#a8483a');
        }
      },
    },
    enemyflag: {
      w: 22, h: 42, frames: 2, draw: (c, _rng, f) => {
        R(c, 2, 2, 2, 40, '#8a8a8a');
        R(c, 1, 0, 4, 3, '#d8c040');
        for (let x = 0; x < 15; x++) {
          const wv = Math.round(Math.sin(x * 0.6 + f * 2) * 1);
          R(c, 4 + x, 3 + wv, 1, 11, '#1e1e1e');
          R(c, 4 + x, 3 + wv, 1, 2, '#b02020');
          R(c, 4 + x, 12 + wv, 1, 2, '#b02020');
        }
        // emblem: white skull-ish mark
        R(c, 9, 6, 5, 4, '#e8e0c8');
        R(c, 10, 7, 1, 1, '#1e1e1e');
        R(c, 12, 7, 1, 1, '#1e1e1e');
        R(c, 10, 10, 3, 1, '#e8e0c8');
      },
    },
    statue: {
      w: 34, h: 42, draw: (c) => {
        const st = b.structure === 'sandstone' ? '#b8885a' : '#7a7a6a';
        R(c, 6, 4, 22, 38, st);
        R(c, 6, 4, 4, 38, shade(st, 1.25));
        R(c, 24, 4, 4, 38, shade(st, 0.65));
        R(c, 8, 0, 18, 6, shade(st, 0.85));
        R(c, 9, 12, 6, 3, '#1a1414');
        R(c, 19, 12, 6, 3, '#1a1414');
        R(c, 15, 15, 4, 10, shade(st, 0.7));
        R(c, 11, 28, 12, 3, '#1a1414');
        if (b.vines) for (let i = 0; i < 5; i++) R(c, 6 + i * 5, 0, 2, 6 + i * 3, b.vines);
        R(c, 0, 38, 34, 4, shade(st, 0.6));
      },
    },
    girder: { w: 8, h: 16, draw: (c) => { R(c, 0, 0, 2, 16, '#5a5e64'); R(c, 6, 0, 2, 16, '#5a5e64'); for (let y = 0; y < 16; y++) R(c, 2 + Math.abs(((y * 2) % 16) - 8) * 0.5, y, 2, 1, '#7a7e86'); } },
    rope: {
      w: 12, h: 26, draw: (c) => {
        R(c, 4, 4, 4, 22, shade(wood, 0.8));
        R(c, 4, 4, 1, 22, shade(wood, 1.2));
        R(c, 2, 8, 8, 3, '#c8a868');
        R(c, 3, 0, 6, 5, shade(wood, 0.7));
      },
    },
  };
}

export const SCENERY_TILED = new Set(['girder', 'post']);

export function makeScenery(scene: Phaser.Scene, b: Biome): void {
  const all = defs(b);
  for (const [name, d] of Object.entries(all)) {
    const key = `sc_${name}`;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const frames = d.frames ?? 1;
    const tex = scene.textures.createCanvas(key, d.w * frames, d.h)!;
    const c = tex.getContext();
    for (let f = 0; f < frames; f++) {
      const tmp = document.createElement('canvas');
      tmp.width = d.w;
      tmp.height = d.h;
      const tc = tmp.getContext('2d')!;
      d.draw(tc, new Rng(name.length * 131 + f), f);
      if (!SCENERY_TILED.has(name)) outline(tc, d.w, d.h);
      c.drawImage(tmp, f * d.w, 0);
    }
    for (let f = 0; f < frames; f++) tex.add(f, 0, f * d.w, 0, d.w, d.h);
    tex.refresh();
  }
}
