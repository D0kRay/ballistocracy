import Phaser from 'phaser';
import { Rng } from '../core/rng';
import type { Biome } from '../world/biomes';
import { shade } from './SpriteForge';

// Background layers are painted on canvases, blurred, and drawn at 384x216,
// so the CSS upscale turns the blur into soft chunky pixels.

// painted at a fixed design size and scaled to the view by the renderer
export const PARALLAX_W = 384;
export const PARALLAX_H = 216;
const W = PARALLAX_W;
const H = PARALLAX_H;

function mk(scene: Phaser.Scene, key: string, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, W, H)!;
  draw(tex.getContext());
  tex.refresh();
}

/** draw something three times so the layer tiles horizontally */
function wrap(fn: (dx: number) => void): void {
  fn(-W);
  fn(0);
  fn(W);
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

/** dithered haze band rising from the bottom of a layer */
function fog(c: CanvasRenderingContext2D, col: string, from: number, alpha: number): void {
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const y0 = from + ((H - from) * i) / steps;
    c.globalAlpha = (alpha * (i + 1)) / steps;
    c.fillStyle = col;
    c.fillRect(0, Math.round(y0), W, Math.ceil((H - from) / steps) + 1);
  }
  c.globalAlpha = 1;
}

export function makeParallax(scene: Phaser.Scene, b: Biome, seed = 0, night = false): string[] {
  const rng = new Rng(b.id.length * 1337 + b.name.charCodeAt(0) + seed * 7919);
  const keys = [`bg0_${b.id}`, `bg1_${b.id}`, `bg2_${b.id}`, `bg3_${b.id}`];

  // 0: sky – banded gradient with dithered seams (very 80s), blurred clouds, sun
  mk(scene, keys[0], (c) => {
    const bands = 10;
    for (let i = 0; i < bands; i++) {
      c.fillStyle = lerpColor(b.skyTop, b.skyBottom, i / (bands - 1));
      c.fillRect(0, Math.floor((i * H) / bands), W, Math.ceil(H / bands) + 1);
      // dither seam
      if (i > 0) {
        c.fillStyle = lerpColor(b.skyTop, b.skyBottom, (i - 1) / (bands - 1));
        const y = Math.floor((i * H) / bands);
        for (let x = (i % 2) * 2; x < W; x += 4) c.fillRect(x, y, 2, 1);
        for (let x = ((i + 1) % 2) * 2; x < W; x += 8) c.fillRect(x, y + 2, 2, 1);
      }
    }
    if (b.sun) {
      c.save();
      c.filter = 'blur(6px)';
      c.fillStyle = b.sun;
      c.globalAlpha = 0.5;
      c.beginPath();
      c.arc(W * 0.72, H * 0.32, 34, 0, Math.PI * 2);
      c.fill();
      c.restore();
      c.fillStyle = b.sun;
      c.beginPath();
      c.arc(W * 0.72, H * 0.32, 18, 0, Math.PI * 2);
      c.fill();
    }
    if (b.id === 'snow' || b.id === 'city' || night) {
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 60; i++) c.fillRect(rng.int(0, W), rng.int(0, H * 0.5), 1, 1);
    }
    c.save();
    c.filter = 'blur(4px)';
    c.fillStyle = b.cloud;
    c.globalAlpha = 0.55;
    for (let i = 0; i < 9; i++) {
      const cx = rng.int(0, W);
      const cy = rng.int(14, 90);
      const s = rng.int(10, 22);
      wrap((dx) => {
        for (let k = 0; k < 4; k++) {
          c.beginPath();
          c.ellipse(cx + dx + k * s * 0.8, cy + (k % 2) * 3, s, s * 0.45, 0, 0, Math.PI * 2);
          c.fill();
        }
      });
    }
    c.restore();
  });

  // 1: far silhouettes – heavily blurred
  mk(scene, keys[1], (c) => {
    c.save();
    c.filter = 'blur(2.5px)';
    c.fillStyle = lerpColor(b.far, b.skyBottom, 0.42); // atmospheric haze
    farShape(c, b, rng);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'source-atop';
    fog(c, b.skyBottom, H * 0.45, 0.6);
    c.restore();
  });

  // 2: mid layer – slight blur
  mk(scene, keys[2], (c) => {
    c.save();
    c.filter = 'blur(1px)';
    c.fillStyle = lerpColor(b.mid, b.skyBottom, 0.2);
    midShape(c, b, rng);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'source-atop';
    fog(c, b.skyBottom, H * 0.65, 0.45);
    c.restore();
  });

  // 3: near foreground silhouettes – sharp
  mk(scene, keys[3], (c) => {
    c.fillStyle = b.near;
    nearShape(c, b, rng);
  });
  return keys;
}

function ridge(c: CanvasRenderingContext2D, base: number, amp: number, freq: number, rng: Rng, jag = 0): void {
  const phase = rng.range(0, 6);
  const pts: number[] = [];
  for (let x = 0; x <= W; x += 4) {
    const t = (x / W) * Math.PI * 2;
    let y = base - Math.abs(Math.sin(t * freq + phase)) * amp - Math.sin(t * freq * 2.3 + phase) * amp * 0.3;
    if (jag) y += (rng.next() - 0.5) * jag;
    pts.push(y);
  }
  pts[pts.length - 1] = pts[0];
  wrap((dx) => {
    c.beginPath();
    c.moveTo(dx, H);
    pts.forEach((y, i) => c.lineTo(dx + i * 4, y));
    c.lineTo(dx + W, H);
    c.closePath();
    c.fill();
  });
}

function farShape(c: CanvasRenderingContext2D, b: Biome, rng: Rng): void {
  switch (b.farShape) {
    case 'mountains':
    case 'peaks': {
      ridge(c, 150, 70, 3, rng, 6);
      if (b.farShape === 'peaks') {
        c.fillStyle = shade(b.far, 1.4);
        c.globalAlpha = 0.6;
        ridge(c, 95, 20, 3, rng, 4);
        c.globalAlpha = 1;
      }
      break;
    }
    case 'dunes':
      ridge(c, 160, 30, 2, rng);
      // mesas
      for (let i = 0; i < 3; i++) {
        const x = rng.int(0, W);
        const w = rng.int(30, 60);
        const h = rng.int(40, 70);
        wrap((dx) => c.fillRect(x + dx, 160 - h, w, h + 60));
      }
      break;
    case 'skyline':
    case 'factories': {
      let x = 0;
      const blds: [number, number, number][] = [];
      while (x < W) {
        const w = rng.int(14, 34);
        const h = rng.int(40, 120);
        blds.push([x, w, h]);
        x += w + rng.int(0, 4);
      }
      for (const [bx, bw, bh] of blds) {
        wrap((dx) => {
          c.fillRect(bx + dx, H - 40 - bh, bw, bh + 40);
          if (b.farShape === 'factories' && bw < 22) c.fillRect(bx + dx + 4, H - 40 - bh - 30, 5, 30);
        });
      }
      if (b.farShape === 'skyline') {
        c.save();
        c.filter = 'none';
        c.fillStyle = '#f0d070';
        c.globalAlpha = 0.7;
        for (const [bx, bw, bh] of blds)
          for (let wy = H - 40 - bh + 4; wy < H - 40; wy += 6)
            for (let wx = bx + 3; wx < bx + bw - 3; wx += 5) if (rng.chance(0.25)) wrap((dx) => c.fillRect(wx + dx, wy, 2, 2));
        c.restore();
      } else {
        c.save();
        c.fillStyle = shade(b.cloud, 1.1);
        c.globalAlpha = 0.35;
        c.filter = 'blur(5px)';
        for (const [bx, bw] of blds) if (bw < 22) wrap((dx) => { c.beginPath(); c.ellipse(bx + dx + 6, 20, 14, 10, 0, 0, Math.PI * 2); c.fill(); });
        c.restore();
      }
      break;
    }
    case 'volcano': {
      ridge(c, 170, 25, 2, rng);
      wrap((dx) => {
        c.beginPath();
        c.moveTo(dx + 120, H);
        c.lineTo(dx + 190, 60);
        c.lineTo(dx + 214, 60);
        c.lineTo(dx + 300, H);
        c.fill();
      });
      c.save();
      c.fillStyle = '#ff6020';
      c.globalAlpha = 0.6;
      c.filter = 'blur(6px)';
      wrap((dx) => { c.beginPath(); c.ellipse(dx + 202, 58, 18, 10, 0, 0, Math.PI * 2); c.fill(); });
      c.restore();
      break;
    }
  }
}

function midShape(c: CanvasRenderingContext2D, b: Biome, rng: Rng): void {
  ridge(c, 185, 26, 4, rng, 3);
  if (b.id === 'city' || b.id === 'industrial') {
    let x = 0;
    while (x < W) {
      const w = rng.int(18, 40);
      const h = rng.int(20, 60);
      const xx = x;
      wrap((dx) => {
        c.fillRect(xx + dx, H - 30 - h, w, h + 30);
        // broken top
        c.clearRect(xx + dx + rng.int(2, w - 6), H - 30 - h, 4, rng.int(3, 8));
      });
      x += w + rng.int(6, 20);
    }
  } else if (b.id === 'jungle') {
    for (let i = 0; i < 18; i++) {
      const x = rng.int(0, W);
      const y = rng.int(150, 175);
      const r = rng.int(10, 18);
      wrap((dx) => { c.beginPath(); c.arc(x + dx, y, r, 0, Math.PI * 2); c.fill(); });
    }
  }
}

function nearShape(c: CanvasRenderingContext2D, b: Biome, rng: Rng): void {
  ridge(c, 206, 6, 6, rng);
  const count = 6;
  for (let i = 0; i < count; i++) {
    const x = Math.floor((i + rng.next() * 0.6) * (W / count));
    wrap((dx) => {
      const bx = x + dx;
      switch (b.nearShape) {
        case 'palms': {
          for (let y = 0; y < 70; y += 2) c.fillRect(bx + Math.round(Math.sin(y / 20) * 4), 205 - y, 3, 2);
          const tx = bx + Math.round(Math.sin(70 / 20) * 4) + 1;
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            for (let s = 0; s < 18; s++) c.fillRect(tx + Math.cos(a) * s, 136 + Math.sin(a) * s * 0.5 + (s * s) / 40, 2, 2);
          }
          break;
        }
        case 'pines': {
          c.fillRect(bx, 170, 3, 40);
          for (let k = 0; k < 5; k++) {
            const w = 22 - k * 4;
            c.beginPath();
            c.moveTo(bx + 1 - w / 2, 190 - k * 12);
            c.lineTo(bx + 1, 172 - k * 12);
            c.lineTo(bx + 1 + w / 2, 190 - k * 12);
            c.fill();
          }
          break;
        }
        case 'cacti': {
          c.fillRect(bx, 170, 5, 40);
          c.fillRect(bx - 6, 182, 6, 3);
          c.fillRect(bx - 6, 174, 3, 10);
          c.fillRect(bx + 5, 186, 6, 3);
          c.fillRect(bx + 8, 178, 3, 10);
          break;
        }
        case 'rubble':
          c.fillRect(bx, 150, 4, 60);
          c.fillRect(bx - 10, 160, 24, 3);
          c.fillRect(bx + 8, 140, 3, 25);
          break;
        case 'pipes':
          c.fillRect(bx, 140, 6, 70);
          c.fillRect(bx, 140, 30, 5);
          c.fillRect(bx + 26, 140, 5, 30);
          break;
        case 'rocks':
          c.beginPath();
          c.moveTo(bx - 12, 210);
          c.lineTo(bx - 4, 170 - rng.int(0, 20));
          c.lineTo(bx + 6, 180);
          c.lineTo(bx + 14, 210);
          c.fill();
          break;
      }
    });
  }
}
