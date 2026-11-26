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
    // ---------------------------------------------------------------- jungle
    bamboo: {
      w: 18, h: 52, draw: (c, rng) => {
        const g = '#7aa83a';
        for (const [x, top] of [[3, 6], [8, 0], [13, 10]] as const) {
          for (let y = top; y < 52; y++) R(c, x, y, 3, 1, (y - top) % 9 === 0 ? shade(g, 0.6) : g);
          R(c, x, top, 1, 52 - top, shade(g, 1.3));
          for (let k = 0; k < 3; k++) {
            const ly = top + 4 + k * 12 + rng.int(0, 3);
            const dir = k % 2 ? 1 : -1;
            for (let s = 0; s < 5; s++) R(c, x + 1 + dir * (s + 1), ly + Math.floor(s / 2), 1, 1, shade(leaf, 0.9));
          }
        }
      },
    },
    bush: {
      w: 28, h: 16, draw: (c, rng) => {
        for (let i = 0; i < 6; i++) disc(c, 5 + i * 3.6, 10 + rng.range(-2, 1), rng.int(3, 5), shade(leaf, 0.75));
        for (let i = 0; i < 5; i++) disc(c, 6 + i * 4, 8 + rng.range(-2, 1), rng.int(3, 4), leaf);
        for (let i = 0; i < 6; i++) R(c, rng.int(4, 23), rng.int(4, 10), 1, 1, shade(leaf, 1.35));
        if (b.id === 'jungle') for (let i = 0; i < 3; i++) R(c, rng.int(5, 22), rng.int(6, 12), 2, 2, '#e04040');
      },
    },
    flowers: {
      w: 18, h: 10, draw: (c, rng) => {
        for (let i = 0; i < 5; i++) {
          const x = 2 + i * 3 + rng.int(0, 1);
          const h = rng.int(4, 8);
          R(c, x, 10 - h, 1, h, shade(leaf, 0.8));
          const col = rng.pick(['#f04870', '#f0d040', '#f0f0f0', '#a060f0']);
          R(c, x - 1, 10 - h - 1, 3, 2, col);
          R(c, x, 10 - h - 1, 1, 1, '#f8f0a0');
        }
      },
    },
    mossrock: {
      w: 26, h: 16, draw: (c) => {
        disc(c, 13, 11, 10, shade(b.rock, 0.8), 0.55);
        disc(c, 12, 10, 9, b.rock, 0.5);
        disc(c, 9, 8, 4, shade(b.rock, 1.3), 0.6);
        for (let x = 4; x < 22; x++) R(c, x, 5 + Math.round(Math.abs(x - 13) * 0.35), 1, 2, b.vines ?? leaf);
      },
    },
    stump: {
      w: 20, h: 13, draw: (c) => {
        const t = b.id === 'volcano' ? '#2a2020' : bark;
        R(c, 4, 3, 12, 10, t);
        R(c, 4, 3, 2, 10, shade(t, 1.3));
        R(c, 14, 3, 2, 10, shade(t, 0.6));
        R(c, 1, 10, 18, 3, t);
        R(c, 4, 2, 12, 2, b.id === 'volcano' ? '#ff6020' : '#c8a070');
        R(c, 8, 2, 4, 1, b.id === 'volcano' ? '#ffd040' : '#a07a4a');
      },
    },
    log_pile: {
      w: 32, h: 16, draw: (c) => {
        const log = (x: number, y: number) => {
          R(c, x, y, 14, 6, bark);
          R(c, x, y, 14, 1, shade(bark, 1.3));
          disc(c, x + 13, y + 3, 3, '#c8a070');
          R(c, x + 13, y + 3, 1, 1, '#7a5a3a');
          if (b.id === 'snow') R(c, x, y - 1, 14, 2, '#f0f4ff');
        };
        log(1, 10);
        log(15, 10);
        log(8, 4);
      },
    },
    // ---------------------------------------------------------------- desert
    boulder: {
      w: 28, h: 20, draw: (c) => {
        disc(c, 14, 13, 12, shade(b.rock, 0.7), 0.6);
        disc(c, 13, 12, 11, b.rock, 0.58);
        disc(c, 9, 8, 5, shade(b.rock, 1.3), 0.6);
        R(c, 15, 9, 1, 6, shade(b.rock, 0.55));
        R(c, 16, 14, 4, 1, shade(b.rock, 0.55));
      },
    },
    skull_cow: {
      w: 22, h: 11, draw: (c) => {
        const bo = '#e8e0c8';
        R(c, 7, 3, 8, 6, bo);
        R(c, 8, 9, 6, 2, bo);
        R(c, 8, 5, 2, 2, '#1a1210');
        R(c, 12, 5, 2, 2, '#1a1210');
        R(c, 1, 2, 6, 2, bo);
        R(c, 0, 0, 2, 3, bo);
        R(c, 15, 2, 6, 2, bo);
        R(c, 20, 0, 2, 3, bo);
        R(c, 7, 3, 1, 6, shade(bo, 1.1));
      },
    },
    tumbleweed: {
      w: 14, h: 13, draw: (c, rng) => {
        const t = '#a8844a';
        for (let i = 0; i < 40; i++) {
          const a = rng.range(0, Math.PI * 2);
          const r = rng.range(2, 6);
          R(c, 7 + Math.cos(a) * r, 7 + Math.sin(a) * r, 1, 1, i % 3 ? t : shade(t, 0.7));
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          for (let s = 0; s < 6; s++) R(c, 7 + Math.cos(a) * s, 7 + Math.sin(a) * s, 1, 1, shade(t, 0.8));
        }
      },
    },
    well: {
      w: 30, h: 32, draw: (c) => {
        const st = b.brick;
        R(c, 3, 20, 24, 12, st);
        for (let y = 20; y < 32; y += 4) for (let x = 3 + ((y / 4) % 2) * 3; x < 27; x += 6) R(c, x, y, 1, 4, b.brickDark);
        for (let y = 23; y < 32; y += 4) R(c, 3, y, 24, 1, b.brickDark);
        R(c, 3, 20, 24, 2, shade(st, 1.2));
        R(c, 5, 4, 2, 16, wood);
        R(c, 23, 4, 2, 16, wood);
        R(c, 1, 2, 28, 3, shade(wood, 0.8));
        R(c, 14, 5, 1, 9, '#c8a868');
        R(c, 12, 13, 5, 4, shade(wood, 0.7));
      },
    },
    obelisk: {
      w: 16, h: 46, draw: (c) => {
        const st = b.structure === 'sandstone' ? '#c8985e' : b.brick;
        for (let y = 6; y < 42; y++) {
          const hw = 3 + (y - 6) * 0.06;
          R(c, 8 - hw, y, hw * 2, 1, st);
          R(c, 8 - hw, y, 1, 1, shade(st, 1.3));
          R(c, 8 + hw - 1, y, 1, 1, shade(st, 0.65));
        }
        for (let y = 0; y < 6; y++) R(c, 8 - y * 0.5, y, Math.max(1, y), 1, '#f0d060');
        for (let y = 12; y < 38; y += 5) R(c, 6, y, 4, 2, shade(st, 0.6));
        R(c, 2, 42, 12, 4, shade(st, 0.75));
      },
    },
    jeep_wreck: {
      w: 50, h: 22, draw: (c, rng) => {
        const body = b.id === 'desert' ? '#8a7a4a' : b.id === 'snow' ? '#e0e4ec' : '#4a5a3a';
        R(c, 3, 9, 40, 9, body);
        R(c, 3, 9, 40, 1, shade(body, 1.3));
        R(c, 3, 16, 40, 2, shade(body, 0.6));
        R(c, 30, 3, 2, 7, '#3a3a3a');
        R(c, 30, 3, 10, 1, '#3a3a3a');
        R(c, 14, 11, 7, 5, '#f0f0e0');
        R(c, 16, 12, 3, 3, body);
        for (let i = 0; i < 10; i++) R(c, rng.int(4, 42), rng.int(10, 17), rng.int(1, 3), rng.int(1, 2), i % 2 ? '#2a1e18' : '#8a4a22');
        disc(c, 10, 18, 4, '#1a1a1a');
        R(c, 34, 18, 7, 3, '#1a1a1a');
        R(c, 42, 6, 6, 3, shade(body, 0.7));
      },
    },
    // ---------------------------------------------------------------- arctic
    snowman: {
      w: 20, h: 28, draw: (c) => {
        disc(c, 10, 21, 7, '#f0f4ff');
        disc(c, 10, 11, 5, '#f0f4ff');
        R(c, 6, 16, 8, 1, '#c8d8f0');
        R(c, 8, 9, 1, 1, '#1a1a1a');
        R(c, 11, 9, 1, 1, '#1a1a1a');
        R(c, 9, 11, 4, 1, '#f08020');
        R(c, 6, 4, 8, 2, '#1a1a1a');
        R(c, 7, 0, 6, 4, '#1a1a1a');
        R(c, 5, 14, 10, 2, '#c02020');
        R(c, 13, 14, 2, 5, '#c02020');
        R(c, 9, 19, 1, 1, '#1a1a1a');
        R(c, 9, 22, 1, 1, '#1a1a1a');
      },
    },
    ice_crystal: {
      w: 20, h: 26, draw: (c) => {
        const ice = '#9ae0f8';
        const spike = (x: number, h: number, w: number) => {
          for (let y = 0; y < h; y++) {
            const hw = Math.max(0.5, (w * y) / h);
            R(c, x - hw, 26 - h + y, hw * 2, 1, ice);
            R(c, x - hw, 26 - h + y, 1, 1, '#e8f8ff');
          }
        };
        spike(10, 24, 3);
        spike(5, 14, 2.5);
        spike(15, 17, 2.5);
        R(c, 9, 6, 1, 12, '#ffffff');
      },
    },
    radar: {
      w: 32, h: 42, draw: (c) => {
        const m = '#7a8490';
        R(c, 14, 18, 4, 24, m);
        R(c, 14, 18, 1, 24, shade(m, 1.4));
        R(c, 8, 38, 16, 4, shade(m, 0.7));
        for (let y = 0; y < 18; y++) {
          const hw = Math.sqrt(Math.max(0, 81 - (y - 9) * (y - 9))) * 1.5;
          R(c, 16 - hw - 4 + y * 0.3, y, hw, 1, y < 9 ? '#d8dce4' : '#a8b0bc');
        }
        R(c, 18, 7, 9, 1, '#3a3e44');
        disc(c, 27, 7, 1, '#ff3020');
        if (b.id === 'snow') R(c, 4, 0, 14, 2, '#f8fbff');
      },
    },
    // ---------------------------------------------------------------- city
    trashcan: {
      w: 12, h: 15, draw: (c) => {
        const m = '#5a6a5a';
        R(c, 2, 4, 8, 11, m);
        for (let x = 3; x < 10; x += 2) R(c, x, 5, 1, 9, shade(m, 0.7));
        R(c, 1, 2, 10, 2, shade(m, 1.2));
        R(c, 5, 0, 2, 2, shade(m, 1.2));
        R(c, 3, 1, 3, 1, '#8a6a3a');
      },
    },
    cone: {
      w: 10, h: 12, draw: (c) => {
        for (let y = 0; y < 10; y++) {
          const hw = 1 + y * 0.35;
          R(c, 5 - hw, y, hw * 2, 1, y === 4 || y === 5 ? '#f0f0f0' : '#f06010');
        }
        R(c, 0, 10, 10, 2, '#c04808');
      },
    },
    barrier: {
      w: 32, h: 15, draw: (c) => {
        R(c, 3, 6, 2, 9, '#3a3e44');
        R(c, 27, 6, 2, 9, '#3a3e44');
        for (let x = 0; x < 32; x++) R(c, x, 2, 1, 5, Math.floor((x + 2) / 4) % 2 ? '#f0f0f0' : '#d02020');
        R(c, 0, 2, 32, 1, '#ffffff');
        disc(c, 2, 1, 1, '#f0b020');
      },
    },
    billboard: {
      w: 52, h: 46, draw: (c, rng) => {
        R(c, 10, 24, 3, 22, '#3a3e44');
        R(c, 39, 24, 3, 22, '#3a3e44');
        R(c, 1, 1, 50, 25, '#2a2a30');
        R(c, 3, 3, 46, 21, rng.pick(['#e8c040', '#40a0e0', '#e05050']));
        R(c, 6, 6, 20, 4, '#1a1a1a');
        R(c, 6, 12, 28, 2, '#f8f8f8');
        R(c, 6, 16, 22, 2, '#f8f8f8');
        disc(c, 40, 13, 6, '#f8f0e0');
        R(c, 38, 11, 1, 1, '#1a1a1a');
        R(c, 42, 11, 1, 1, '#1a1a1a');
        R(c, 38, 15, 5, 1, '#1a1a1a');
        // torn patches
        for (let i = 0; i < 4; i++) R(c, rng.int(3, 46), rng.int(3, 20), rng.int(3, 7), rng.int(2, 5), '#2a2a30');
      },
    },
    phonebooth: {
      w: 16, h: 34, draw: (c) => {
        const r = '#b02020';
        R(c, 2, 3, 12, 31, r);
        R(c, 1, 1, 14, 3, shade(r, 0.8));
        R(c, 4, 7, 8, 22, '#a8c8d8');
        for (let y = 10; y < 29; y += 5) R(c, 4, y, 8, 1, r);
        R(c, 7, 7, 1, 22, r);
        R(c, 3, 4, 10, 2, '#f0f0e0');
        R(c, 2, 3, 1, 31, shade(r, 1.3));
      },
    },
    rubble: {
      w: 32, h: 12, draw: (c, rng) => {
        for (let i = 0; i < 14; i++) {
          const x = rng.int(1, 27);
          const y = rng.int(4, 9);
          const col = rng.pick([b.brick, b.brickDark, '#7a7478', '#5a5458']);
          R(c, x, y, rng.int(3, 6), 12 - y, col);
          R(c, x, y, 2, 1, shade(col, 1.3));
        }
        R(c, 12, 0, 1, 6, '#3a3e44');
        R(c, 20, 2, 1, 5, '#3a3e44');
      },
    },
    // ---------------------------------------------------------------- factory
    barrel_stack: {
      w: 28, h: 26, draw: (c) => {
        const drum = (x: number, y: number, col: string) => {
          R(c, x, y, 10, 12, col);
          R(c, x, y + 3, 10, 1, shade(col, 0.6));
          R(c, x, y + 8, 10, 1, shade(col, 0.6));
          R(c, x, y, 2, 12, shade(col, 1.3));
          R(c, x + 1, y, 8, 1, shade(col, 1.2));
        };
        drum(2, 14, '#3a6a9a');
        drum(15, 14, '#c0a020');
        drum(8, 2, '#3a7a3a');
        R(c, 11, 6, 4, 3, '#f0f0f0');
      },
    },
    generator: {
      w: 32, h: 24, draw: (c) => {
        const m = '#c0a030';
        R(c, 2, 6, 28, 16, m);
        R(c, 2, 6, 28, 2, shade(m, 1.3));
        R(c, 2, 20, 28, 2, shade(m, 0.6));
        for (let x = 5; x < 18; x += 3) R(c, x, 10, 2, 8, shade(m, 0.6));
        R(c, 21, 9, 6, 5, '#1a1a1a');
        R(c, 22, 10, 2, 2, '#40ff40');
        R(c, 25, 10, 1, 1, '#ff3020');
        R(c, 24, 0, 3, 6, '#3a3a3a');
        R(c, 3, 22, 4, 2, '#2a2a2a');
        R(c, 25, 22, 4, 2, '#2a2a2a');
      },
    },
    spool: {
      w: 24, h: 22, draw: (c) => {
        disc(c, 12, 11, 10, shade(wood, 0.8));
        disc(c, 12, 11, 8, '#3a3a3a');
        for (let r = 3; r < 8; r += 2) for (let a = 0; a < 40; a++) R(c, 12 + Math.cos(a / 6.4) * r, 11 + Math.sin(a / 6.4) * r, 1, 1, '#c86a2a');
        disc(c, 12, 11, 2, wood);
        R(c, 2, 20, 20, 2, shade(wood, 0.6));
      },
    },
    warnsign: {
      w: 16, h: 26, draw: (c) => {
        R(c, 7, 12, 2, 14, '#3a3e44');
        for (let y = 0; y < 13; y++) {
          const hw = 1 + y * 0.6;
          R(c, 8 - hw, y, hw * 2, 1, y > 11 ? '#1a1a1a' : '#f0c020');
        }
        R(c, 7, 4, 2, 5, '#1a1a1a');
        R(c, 7, 10, 2, 1, '#1a1a1a');
      },
    },
    vent: {
      w: 20, h: 32, draw: (c) => {
        const m = '#6a6e74';
        R(c, 5, 6, 10, 26, m);
        R(c, 5, 6, 2, 26, shade(m, 1.4));
        R(c, 13, 6, 2, 26, shade(m, 0.6));
        R(c, 3, 2, 14, 5, shade(m, 0.8));
        R(c, 4, 0, 12, 2, '#3a3e44');
        for (let y = 12; y < 30; y += 6) R(c, 4, y, 12, 2, '#4e5258');
        R(c, 7, 3, 6, 2, '#1a1a1a');
      },
    },
    // ---------------------------------------------------------------- volcano
    lavarock: {
      w: 26, h: 15, draw: (c, rng) => {
        disc(c, 13, 10, 11, '#2a201c', 0.5);
        disc(c, 12, 9, 10, '#3a2e2a', 0.45);
        for (let i = 0; i < 4; i++) {
          let x = rng.int(5, 20);
          let y = rng.int(6, 11);
          for (let s = 0; s < 5; s++) {
            R(c, x, y, 1, 1, s % 2 ? '#ff7020' : '#ffb040');
            x += rng.int(-1, 1) || 1;
            y += rng.int(-1, 1);
          }
        }
      },
    },
    obsidian: {
      w: 22, h: 28, draw: (c) => {
        const o = '#2a1e3a';
        const shard = (x: number, h: number, lean: number) => {
          for (let y = 0; y < h; y++) {
            const hw = Math.max(0.6, 2.6 * (y / h));
            R(c, x - hw + lean * (h - y) * 0.1, 28 - h + y, hw * 2, 1, o);
            R(c, x - hw + lean * (h - y) * 0.1, 28 - h + y, 1, 1, '#8a6ac8');
          }
        };
        shard(11, 26, 0);
        shard(5, 15, -1);
        shard(17, 18, 1);
        R(c, 10, 8, 1, 6, '#c8a8ff');
      },
    },
    skullpile: {
      w: 24, h: 15, draw: (c) => {
        const bo = '#d8d0b8';
        const skull = (x: number, y: number) => {
          R(c, x, y, 7, 6, bo);
          R(c, x + 1, y + 6, 5, 1, bo);
          R(c, x + 1, y + 2, 2, 2, '#1a1210');
          R(c, x + 4, y + 2, 2, 2, '#1a1210');
          R(c, x, y, 1, 6, shade(bo, 1.1));
        };
        skull(1, 8);
        skull(9, 8);
        skull(16, 8);
        skull(5, 2);
        skull(12, 2);
      },
    },
    brazier: {
      w: 14, h: 24, frames: 2, draw: (c, _rng, f) => {
        const st = b.structure === 'sandstone' ? '#b8885a' : '#5a5458';
        R(c, 5, 12, 4, 10, st);
        R(c, 3, 21, 8, 3, shade(st, 0.7));
        R(c, 1, 9, 12, 4, shade(st, 0.9));
        R(c, 1, 9, 12, 1, shade(st, 1.3));
        const fl = f ? [[3, 5], [6, 1], [9, 4]] : [[3, 3], [7, 0], [10, 5]];
        for (const [x, top] of fl) {
          R(c, x - 1, top + 3, 3, 9 - top - 3, '#ff6020');
          R(c, x, top, 1, 9 - top, '#ffb030');
          R(c, x, top + 5, 1, 9 - top - 5, '#fff0a0');
        }
      },
    },
    // ---------------------------------------------------------------- everywhere
    campfire: {
      w: 18, h: 14, frames: 2, draw: (c, _rng, f) => {
        R(c, 1, 11, 16, 3, '#5a5458');
        R(c, 3, 9, 12, 3, bark);
        R(c, 5, 8, 2, 4, shade(bark, 0.7));
        R(c, 11, 8, 2, 4, shade(bark, 0.7));
        const fl = f ? [[5, 3], [9, 0], [12, 4]] : [[6, 2], [9, 1], [11, 3]];
        for (const [x, top] of fl) {
          R(c, x - 1, top + 3, 3, 9 - top - 3, '#ff5a10');
          R(c, x, top, 1, 9 - top, '#ffa020');
          R(c, x, top + 4, 1, 9 - top - 4, '#fff0a0');
        }
      },
    },
    radio_tower: {
      w: 26, h: 64, draw: (c) => {
        const m = '#8a8e94';
        for (let y = 4; y < 64; y++) {
          const hw = 1 + y * 0.17;
          R(c, 13 - hw, y, 1, 1, m);
          R(c, 13 + hw - 1, y, 1, 1, m);
          if (y % 8 === 0) R(c, 13 - hw, y, hw * 2, 1, m);
          if (y % 8 < 4) R(c, 13 - hw + ((y % 8) / 8) * hw * 2, y, 1, 1, shade(m, 0.7));
        }
        R(c, 12, 0, 2, 5, m);
        disc(c, 13, 1, 1, '#ff2020');
        R(c, 6, 20, 5, 4, '#c8ccd2');
        R(c, 15, 34, 6, 5, '#c8ccd2');
      },
    },
    watertower: {
      w: 36, h: 58, draw: (c) => {
        const tank = b.id === 'desert' ? '#a8885a' : '#7a8088';
        for (const x of [6, 28]) {
          R(c, x, 26, 2, 32, shade(wood, 0.8));
          R(c, x, 26, 1, 32, shade(wood, 1.2));
        }
        for (let y = 30; y < 58; y += 8) for (let s = 0; s < 22; s++) R(c, 7 + s, y + s * 0.3, 1, 1, shade(wood, 0.6));
        R(c, 3, 8, 30, 20, tank);
        R(c, 3, 8, 4, 20, shade(tank, 1.3));
        R(c, 27, 8, 6, 20, shade(tank, 0.65));
        for (let y = 12; y < 28; y += 5) R(c, 3, y, 30, 1, shade(tank, 0.75));
        for (let y = 0; y < 8; y++) R(c, 18 - (y + 1) * 2, y + 1, (y + 1) * 4, 1, shade(tank, 0.8));
        R(c, 3, 26, 30, 2, '#3a3a3a');
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
/** scenery with 2 animation frames (flag waving, fire flickering) */
export const SCENERY_ANIMATED = new Set(['enemyflag', 'campfire', 'brazier']);
/** scenery that lights up the night: light offset above the base, radius, colour, strength */
export const SCENERY_GLOW: Record<string, { dy: number; r: number; c: number; a: number }> = {
  campfire: { dy: 6, r: 34, c: 0xff9040, a: 0.6 },
  brazier: { dy: 16, r: 28, c: 0xff9040, a: 0.55 },
  lavarock: { dy: 4, r: 16, c: 0xff6020, a: 0.35 },
  radio_tower: { dy: 63, r: 8, c: 0xff2020, a: 0.7 },
};

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
