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

/** 3x5 pixel letters for vehicle lettering */
const LETTERS: Record<string, string[]> = {
  I: ['###', '.#.', '.#.', '.#.', '###'],
  L: ['#..', '#..', '#..', '#..', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
};

/** ILTI wagon: red station wagon. Frames 0-1 face right, 2-3 face left (own frames so the lettering stays readable); plus its hood minigun */
export function makeWagon(scene: Phaser.Scene): void {
  const W = 52;
  tex(scene, 'wagon', W, 26, 4, (c, f, ox) => {
    const left = f >= 2;
    const spin = f % 2;
    // draw in "facing right" coordinates, mirrored for the left frames
    const R = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(ox + (left ? W - x - w : x), y, w, h);
    };
    const clear = (x: number, y: number, w: number, h: number) => c.clearRect(ox + (left ? W - x - w : x), y, w, h);
    const red = '#c81c1c';
    const lt = '#f04a3a';
    const dk = '#861010';
    const glass = 'rgba(150,210,240,0.45)';
    // long roof of the combi (rear) down to the windshield
    R(5, 2, 31, 2, OUT); R(3, 3, 3, 12, OUT); R(36, 3, 2, 2, OUT);
    for (let i = 0; i < 6; i++) R(37 + i, 4 + i, 2, 1, OUT); // windshield slope
    R(6, 4, 30, 1, lt);
    R(6, 2, 28, 1, '#3a3a40'); // roof rails
    // body
    R(1, 10, 50, 11, OUT);
    R(2, 11, 48, 9, red);
    R(2, 11, 48, 1, lt);
    R(2, 18, 48, 2, dk);
    R(43, 10, 7, 2, lt); // hood
    // windows (see-through so the driver shows)
    R(4, 5, 34, 6, OUT);
    clear(5, 5, 33, 5);
    R(5, 5, 8, 5, glass); R(14, 5, 10, 5, glass); R(25, 5, 10, 5, glass);
    for (let i = 0; i < 5; i++) R(35 + i, 5 + i, 1, 1, glass);
    R(13, 5, 1, 6, red); R(24, 5, 1, 6, red); R(35, 5, 1, 6, red); // pillars
    clear(36, 5, 3, 1);
    // rear door line, front door line + handle
    R(14, 11, 1, 7, dk); R(36, 11, 1, 7, dk); R(33, 12, 2, 1, '#e0e0e0');
    // lights and bumpers
    R(49, 12, 2, 3, '#ffe880'); R(1, 11, 2, 3, '#ff3020');
    R(0, 18, 4, 2, '#b8b8c0'); R(48, 18, 4, 2, '#b8b8c0');
    // round wheels in arches
    for (const wx of [11, 41]) {
      R(wx - 6, 16, 13, 3, OUT);
      R(wx - 3, 17, 7, 9, OUT); R(wx - 5, 19, 11, 5, OUT); R(wx - 4, 18, 9, 7, OUT);
      R(wx - 2, 18, 5, 7, '#242428'); R(wx - 4, 20, 9, 3, '#242428'); R(wx - 3, 19, 7, 5, '#242428');
      R(wx - 1, 20, 3, 3, '#9a9aa4');
      if (spin) R(wx, 18, 1, 7, '#45454c');
      else R(wx - 4, 21, 9, 1, '#45454c');
      R(wx, 21, 1, 1, '#2a2a30');
    }
    // company lettering ILTI, always readable, centred between the door lines
    c.fillStyle = '#ffffff';
    let lx = 17;
    for (const ch of 'ILTI') {
      const g = LETTERS[ch];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (g[y][x] === '#') c.fillRect(ox + lx + x, 12 + y, 1, 1);
      lx += 4;
    }
  });
  // hood minigun, pivot on the left end
  tex(scene, 'wagongun', 18, 7, 1, (c) => {
    const R = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x, y, w, h);
    };
    R(0, 1, 7, 6, OUT); R(1, 2, 5, 4, '#4a4a52');
    R(6, 1, 12, 5, OUT); R(7, 2, 11, 1, '#9a9aa4'); R(7, 4, 11, 1, '#6a6a74'); R(7, 3, 11, 1, '#2a2a30');
    R(15, 1, 2, 5, '#3a3a40');
  });
}

export function makeVehicles(scene: Phaser.Scene): void {
  makeWagon(scene);
  // military truck (faces right, open cargo bed at the back), 2 frames for wheels
  tex(scene, 'truck', 66, 32, 2, (c, f, ox) => {
    const R = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(ox + x, y, w, h);
    };
    const body = '#5a6a3a';
    // bed
    R(1, 11, 40, 14, OUT); R(2, 12, 38, 12, body); R(2, 12, 38, 2, '#7a8a52'); R(2, 21, 38, 3, '#3a4626');
    for (let x = 6; x < 40; x += 8) R(x, 14, 1, 7, '#3a4626');
    R(1, 6, 2, 6, OUT); R(39, 6, 2, 6, OUT); R(1, 6, 40, 2, OUT); // bed rails
    // cab
    R(41, 4, 22, 21, OUT); R(42, 5, 20, 19, body); R(42, 5, 20, 2, '#7a8a52');
    R(50, 7, 11, 7, OUT); R(51, 8, 9, 5, '#7ad0f0'); R(52, 8, 3, 2, '#e0f8ff');
    R(60, 16, 4, 4, '#f0e080'); // headlight
    R(43, 15, 6, 3, '#f0f0e0'); R(45, 14, 2, 5, '#f0f0e0'); // star
    R(0, 24, 66, 3, OUT);
    // wheels
    for (const wx of [10, 30, 52]) {
      R(wx - 5, 23, 11, 9, OUT);
      R(wx - 4, 24, 9, 7, '#2a2a2a');
      R(wx - 1, 26 + (f ? 1 : 0), 3, 2, '#7a7a7a');
    }
    // exhaust
    R(41, 0, 2, 5, '#3a3a3a');
  });
  // cargo plane (faces right) with rear ramp lowered on the left
  tex(scene, 'plane', 132, 48, 2, (c, f, ox) => {
    const R = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(ox + x, y, w, h);
    };
    const body = '#6a7480';
    const lt = '#8a949e';
    const dk = '#4a525c';
    // tail fin
    R(10, 2, 18, 22, OUT); R(12, 4, 14, 18, body); R(12, 4, 14, 2, lt);
    R(14, 8, 8, 4, '#c03020');
    // fuselage
    R(14, 16, 110, 20, OUT); R(15, 17, 108, 18, body); R(15, 17, 108, 3, lt); R(15, 31, 108, 4, dk);
    R(118, 20, 10, 12, OUT); R(119, 21, 8, 10, body); // nose
    R(112, 20, 9, 6, OUT); R(113, 21, 7, 4, '#7ad0f0');
    for (let x = 40; x < 105; x += 10) R(x, 22, 4, 4, '#2a3038');
    // wing + engines
    R(54, 12, 40, 6, OUT); R(55, 13, 38, 4, dk);
    for (const ex of [62, 82]) {
      R(ex, 6, 12, 8, OUT); R(ex + 1, 7, 10, 6, '#3a3e44');
      R(ex + 10, 5 + f * 2, 2, 10 - f * 4, '#c8c8c8'); // spinning prop
    }
    // star roundel
    R(30, 22, 10, 10, OUT); R(31, 23, 8, 8, '#f0f0e0'); R(33, 25, 4, 4, '#3a5a8a');
    // ramp down to the ground (left)
    for (let i = 0; i < 12; i++) R(4 + i, 36 + Math.floor((12 - i) / 1.2) - 10, 1, 1 + Math.floor((12 - i) / 1.2), dk);
    R(2, 44, 16, 2, OUT);
    // landing gear
    R(48, 35, 3, 9, OUT); R(46, 42, 8, 6, '#1a1a1a');
    R(104, 35, 3, 9, OUT); R(102, 42, 8, 6, '#1a1a1a');
  });
}
