import Phaser from 'phaser';
import { Rng } from '../core/rng';

// Effect textures: banded glow for additive lights, chunky fireball animation,
// alert bubbles and the friendly extraction helicopter.

function tex(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, draw: (c: CanvasRenderingContext2D, f: number, ox: number) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, w * frames, h)!;
  const c = t.getContext();
  for (let f = 0; f < frames; f++) draw(c, f, f * w);
  for (let i = 0; i < frames; i++) t.add(i, 0, i * w, 0, w, h);
  t.refresh();
}

const OUT = '#120c10';

export function makeFx(scene: Phaser.Scene): void {
  // stepped radial glow (pixel-art friendly light)
  tex(scene, 'glow', 64, 64, 1, (c) => {
    const bands = [0.06, 0.12, 0.2, 0.32, 0.5];
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const d = Math.hypot(x - 31.5, y - 31.5) / 32;
        if (d >= 1) continue;
        const i = Math.min(bands.length - 1, Math.floor((1 - d) * bands.length));
        c.fillStyle = `rgba(255,255,255,${bands[i]})`;
        c.fillRect(x, y, 1, 1);
      }
  });

  // fireball: 9 frames, 48x48
  tex(scene, 'boomfx', 48, 48, 9, (c, f, ox) => {
    const rng = new Rng(9 + f);
    const t = f / 8;
    const r = 8 + t * 15;
    const blobs: [number, number, number][] = [[24, 24, r]];
    for (let i = 0; i < 7; i++) {
      const a = rng.range(0, Math.PI * 2);
      const dd = rng.range(0.3, 0.8) * r;
      blobs.push([24 + Math.cos(a) * dd, 24 + Math.sin(a) * dd - t * 6, r * rng.range(0.4, 0.7)]);
    }
    const hot = ['#ffffff', '#fff6a0', '#ffd040', '#f88820', '#d84010', '#5a3a30', '#3a2a28'];
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 48; x++) {
        let v = 0;
        for (const [bx, by, br] of blobs) v = Math.max(v, 1 - Math.hypot(x - bx, y - by) / br);
        if (v <= 0) continue;
        const heat = v * (1.25 - t) + (rng.next() - 0.5) * 0.15;
        if (heat < 0.05 && t < 0.4) continue;
        let idx = heat > 0.85 ? 0 : heat > 0.65 ? 1 : heat > 0.45 ? 2 : heat > 0.28 ? 3 : heat > 0.12 ? 4 : t > 0.3 ? 5 : 4;
        if (t > 0.6 && idx < 3) idx += 2;
        if (t > 0.8) idx = Math.max(idx, 5);
        if (t > 0.75 && ((x + y) & 1) && heat < 0.2) continue;
        c.fillStyle = hot[Math.min(6, idx)];
        c.fillRect(ox + x, y, 1, 1);
      }
  });

  // alert / lost bubbles
  tex(scene, 'bubble', 11, 13, 2, (c, f, ox) => {
    c.fillStyle = OUT;
    c.fillRect(ox + 1, 0, 9, 10);
    c.fillRect(ox, 1, 11, 8);
    c.fillRect(ox + 3, 10, 3, 2);
    c.fillRect(ox + 3, 12, 1, 1);
    c.fillStyle = '#ffffff';
    c.fillRect(ox + 2, 1, 7, 8);
    c.fillRect(ox + 1, 2, 9, 6);
    c.fillRect(ox + 4, 9, 1, 2);
    c.fillStyle = f === 0 ? '#e02020' : '#3060c0';
    if (f === 0) {
      c.fillRect(ox + 5, 2, 1, 4);
      c.fillRect(ox + 5, 7, 1, 1);
    } else {
      c.fillRect(ox + 4, 2, 3, 1);
      c.fillRect(ox + 6, 3, 1, 2);
      c.fillRect(ox + 5, 5, 1, 1);
      c.fillRect(ox + 5, 7, 1, 1);
    }
  });

  // friendly extraction helicopter (faces left), 2 rotor frames
  tex(scene, 'chopper', 72, 30, 2, (c, f, ox) => {
    const body = '#4a6a3a';
    const bl = '#6a8a52';
    const bd = '#2e4424';
    const R = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(ox + x, y, w, h);
    };
    // rotor
    if (f === 0) R(4, 1, 62, 2, '#1a1a1a');
    else { R(18, 1, 34, 2, '#1a1a1a'); R(28, 0, 14, 1, '#1a1a1a'); }
    R(33, 3, 4, 5, '#2a2a2a');
    // tail boom (right side)
    R(44, 11, 26, 6, OUT); R(45, 12, 24, 4, body); R(45, 12, 24, 1, bl);
    R(66, 5, 6, 12, OUT); R(67, 6, 4, 10, bl);
    // body
    R(8, 7, 40, 17, OUT); R(9, 8, 38, 15, body); R(9, 8, 38, 2, bl); R(9, 20, 38, 3, bd);
    // cockpit glass (front = left)
    R(6, 10, 12, 9, OUT); R(7, 11, 10, 6, '#7ad0f0'); R(8, 11, 4, 2, '#e0f8ff');
    // door + star emblem
    R(24, 11, 12, 10, bd);
    R(29, 13, 3, 6, '#f0f0e0'); R(27, 15, 7, 2, '#f0f0e0');
    // skids
    R(10, 27, 36, 2, '#1a1a1a'); R(14, 24, 2, 3, '#1a1a1a'); R(40, 24, 2, 3, '#1a1a1a');
  });
}
