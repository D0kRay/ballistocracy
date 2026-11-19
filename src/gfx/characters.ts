import Phaser from 'phaser';

// Procedural character painter: poses a little skeleton, paints body parts into a
// material map, then applies light/shadow per material and a dark outline.
// Result: shaded, outlined 24x24 pixel-art sprites with weapon anchor points.

export const CHAR_W = 24;
export const CHAR_H = 24;

type Rgb = [number, number, number];
interface Mat {
  base: Rgb;
  light: Rgb;
  dark: Rgb;
}

function hex(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mul(c: Rgb, f: number): Rgb {
  return f >= 1
    ? [c[0] + (255 - c[0]) * (f - 1), c[1] + (255 - c[1]) * (f - 1), c[2] + (255 - c[2]) * (f - 1)]
    : [c[0] * f, c[1] * f, c[2] * f];
}
function mat(h: string, l = 1.28, d = 0.62): Mat {
  const b = hex(h);
  return { base: b, light: mul(b, l), dark: mul(b, d) };
}

export type HeadStyle = 'bandana' | 'blond' | 'helmet' | 'beret' | 'balaclava' | 'boonie' | 'bald' | 'gasmask' | 'riot';

export interface CharSpec {
  skin: string;
  hair: string;
  head: HeadStyle;
  accent: string; // bandana / helmet / beret colour
  shirt: string;
  sleeves: boolean; // false = bare arms
  pants: string;
  boots: string;
  build: number; // 0 normal, 1 bulky
  extra?: 'shades' | 'cigar' | 'goggles' | 'facepaint' | 'dynamite' | 'shield' | 'vest';
  vest?: string;
}

interface Pose {
  bob: number;
  legF: [number, number]; // hip angle, knee bend (radians)
  legB: [number, number];
  arms: 'aim' | 'up' | 'upAlt' | 'down';
}

const OUTLINE: Rgb = [18, 12, 16];
const M = { skin: 1, hair: 2, accent: 3, shirt: 4, pants: 5, boots: 6, vest: 7, sleeve: 8, metal: 9, red: 10, white: 11 } as const;

class Canvas {
  m = new Uint8Array(CHAR_W * CHAR_H);
  set(x: number, y: number, v: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= CHAR_W || y >= CHAR_H) return;
    this.m[y * CHAR_W + x] = v;
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= CHAR_W || y >= CHAR_H) return 0;
    return this.m[y * CHAR_W + x];
  }
  rect(x0: number, y0: number, w: number, h: number, v: number): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, v);
  }
  line(x0: number, y0: number, x1: number, y1: number, th: number, v: number): void {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      this.rect(Math.round(x - (th - 1) / 2), Math.round(y - (th - 1) / 2), th, th, v);
    }
  }
}

/** returns the front hand position (weapon anchor) */
function paintBody(c: Canvas, s: CharSpec, p: Pose): { hx: number; hy: number } {
  const bulk = s.build;
  const hipY = 15 + p.bob;
  const hipX = 11;
  const thigh = 4;
  const shin = 4.4;
  const leg = (hx: number, [a, bend]: [number, number], back: boolean) => {
    const kx = hx + Math.sin(a) * thigh;
    const ky = hipY + Math.cos(a) * thigh;
    const sa = a - bend;
    const fx = kx + Math.sin(sa) * shin;
    const fy = Math.min(22.5, ky + Math.cos(sa) * shin);
    c.line(hx, hipY, kx, ky, 3, M.pants);
    c.line(kx, ky, fx, fy, 3, M.pants);
    // boot
    c.rect(Math.round(fx - 1), Math.round(fy) - 1, 3, 2, M.boots);
    c.rect(Math.round(fx), Math.round(fy), back ? 3 : 4, 1, M.boots);
  };
  // back leg + back arm first
  leg(hipX - 0.5, p.legB, true);
  const shY = 9 + p.bob;
  const armMat = s.sleeves ? M.sleeve : M.skin;
  if (p.arms === 'aim') c.line(10, shY + 1, 15, shY + 3, 3, armMat);
  else if (p.arms === 'up' || p.arms === 'upAlt') c.line(10, shY, p.arms === 'up' ? 9 : 11, shY - 6, 2, armMat);
  // torso
  c.rect(7 - bulk, 8 + p.bob, 9 + bulk * 2, 4, M.shirt);
  c.rect(8 - bulk, 12 + p.bob, 7 + bulk, 2, M.shirt);
  c.rect(9 - bulk, 14 + p.bob, 6 + bulk, 2, M.pants); // hips
  if (s.vest || s.extra === 'vest') {
    c.rect(9 - bulk, 9 + p.bob, 5 + bulk * 2, 4, M.vest);
  }
  if (s.extra === 'dynamite') {
    for (let i = 0; i < 3; i++) c.rect(9 + i * 2, 9 + p.bob, 1, 4, M.red);
  }
  // front leg
  leg(hipX + 1, p.legF, false);
  // head
  const hy = 2 + p.bob;
  c.rect(9, hy + 1, 7, 5, M.skin);
  c.rect(10, hy, 5, 1, M.skin);
  c.rect(10, hy + 6, 4, 1, M.skin); // jaw/neck
  switch (s.head) {
    case 'bandana':
      c.rect(9, hy - 1, 7, 2, M.hair);
      c.rect(9, hy + 1, 2, 3, M.hair);
      c.rect(9, hy + 1, 7, 1, M.accent);
      c.set(8, hy + 1, M.accent);
      c.set(7, hy + 2, M.accent);
      c.set(6, hy + 3, M.accent);
      break;
    case 'blond':
      c.rect(9, hy - 1, 6, 2, M.hair);
      c.rect(8, hy, 3, 4, M.hair);
      c.set(10, hy - 2, M.hair);
      c.set(12, hy - 2, M.hair);
      c.set(14, hy - 2, M.hair);
      break;
    case 'helmet':
    case 'riot':
      c.rect(8, hy - 1, 8, 3, M.accent);
      c.rect(8, hy + 2, 2, 3, M.accent);
      c.rect(15, hy + 1, 1, 1, M.accent);
      if (s.head === 'riot') c.rect(13, hy + 2, 3, 3, M.metal);
      break;
    case 'beret':
      c.rect(9, hy - 1, 7, 2, M.accent);
      c.set(8, hy, M.accent);
      c.rect(9, hy + 1, 2, 2, M.hair);
      break;
    case 'balaclava':
      c.rect(9, hy - 1, 7, 8, M.hair);
      c.rect(9, hy - 1, 7, 1, M.accent);
      break;
    case 'boonie':
      c.rect(7, hy, 10, 1, M.accent);
      c.rect(9, hy - 2, 6, 2, M.accent);
      break;
    case 'gasmask':
      c.rect(9, hy - 1, 7, 8, M.hair);
      c.rect(14, hy + 3, 3, 3, M.metal);
      break;
    case 'bald':
      break;
  }
  if (s.extra === 'shield') {
    c.rect(15, 7 + p.bob, 3, 12, M.metal);
    c.rect(16, 6 + p.bob, 2, 14, M.metal);
  }
  // front arm
  let hx = 16;
  let hyy = shY + 3;
  if (p.arms === 'aim') {
    c.line(12, shY, 15, shY + 3, 3, armMat);
    c.rect(15, shY + 2, 2, 2, M.skin);
  } else if (p.arms === 'up' || p.arms === 'upAlt') {
    const ux = p.arms === 'up' ? 14 : 12;
    c.line(12, shY, ux, shY - 6, 2, armMat);
    c.rect(ux, shY - 7, 2, 2, M.skin);
    hx = -99;
  } else {
    c.line(12, shY, 13, shY + 5, 2, armMat);
    hx = -99;
  }
  hyy = shY + 3;
  return { hx, hy: hyy };
}

function shadeAndOutline(c: Canvas, mats: Record<number, Mat>, ctx: CanvasRenderingContext2D, ox: number, oy: number, s: CharSpec, p: Pose): void {
  const img = ctx.createImageData(CHAR_W, CHAR_H);
  const put = (x: number, y: number, col: Rgb) => {
    const i = (y * CHAR_W + x) * 4;
    img.data[i] = col[0];
    img.data[i + 1] = col[1];
    img.data[i + 2] = col[2];
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < CHAR_H; y++) {
    for (let x = 0; x < CHAR_W; x++) {
      const v = c.get(x, y);
      if (!v) {
        if (c.get(x - 1, y) || c.get(x + 1, y) || c.get(x, y - 1) || c.get(x, y + 1)) put(x, y, OUTLINE);
        continue;
      }
      const m = mats[v];
      let col = m.base;
      if (c.get(x, y - 1) !== v || c.get(x - 1, y) !== v) col = m.light;
      if (c.get(x, y + 1) !== v && c.get(x, y - 1) === v) col = m.dark;
      if (c.get(x + 1, y) !== v && c.get(x, y - 1) === v && c.get(x - 1, y) === v) col = m.dark;
      put(x, y, col);
    }
  }
  // face details
  const hy = 2 + p.bob;
  const eye = (x: number, y: number, col: Rgb) => put(x, y, col);
  if (s.head !== 'gasmask') {
    if (s.extra === 'shades') {
      eye(12, hy + 3, [20, 20, 30]);
      eye(13, hy + 3, [20, 20, 30]);
      eye(14, hy + 3, [80, 160, 220]);
    } else if (s.extra === 'goggles') {
      eye(12, hy + 1, [120, 200, 240]);
      eye(13, hy + 1, [120, 200, 240]);
      eye(13, hy + 3, [20, 20, 30]);
    } else {
      eye(13, hy + 3, s.head === 'balaclava' ? [255, 60, 60] : [20, 20, 30]);
      if (s.head !== 'balaclava') eye(12, hy + 3, [255, 255, 255]);
    }
    if (s.head !== 'balaclava' && s.head !== 'riot') eye(14, hy + 5, mul(hex(s.skin), 0.55));
  }
  if (s.extra === 'cigar') {
    eye(15, hy + 5, [130, 80, 40]);
    eye(16, hy + 5, [255, 120, 40]);
  }
  if (s.extra === 'facepaint') {
    eye(11, hy + 4, [40, 70, 30]);
    eye(14, hy + 4, [40, 70, 30]);
  }
  // belt
  if (s.extra !== 'dynamite') for (let x = 9 - s.build; x < 15; x++) if (c.get(x, 13 + p.bob) === M.shirt) put(x, 13 + p.bob, [40, 30, 20]);
  ctx.putImageData(img, ox, oy);
}

function matsFor(s: CharSpec): Record<number, Mat> {
  return {
    [M.skin]: mat(s.skin, 1.15, 0.72),
    [M.hair]: mat(s.hair, 1.4, 0.6),
    [M.accent]: mat(s.accent),
    [M.shirt]: mat(s.shirt),
    [M.pants]: mat(s.pants, 1.3, 0.6),
    [M.boots]: mat(s.boots, 1.5, 0.7),
    [M.vest]: mat(s.vest ?? '#5a5a3a'),
    [M.sleeve]: mat(s.shirt, 1.15, 0.7),
    [M.metal]: mat('#8a96a8', 1.35, 0.6),
    [M.red]: mat('#d02020', 1.3, 0.6),
    [M.white]: mat('#e8e8e8'),
  };
}

// ---------------------------------------------------------------- poses
// Frame layout (shared by all humanoids):
// 0-1 idle, 2-7 run, 8 jump, 9 fall, 10-11 climb, 12 wall cling, 13 dead
export const FRAME = { idle: 0, run: 2, jump: 8, fall: 9, climb: 10, wall: 12, dead: 13 } as const;
export const FRAME_COUNT = 14;

function poses(): Pose[] {
  const out: Pose[] = [];
  out.push({ bob: 0, legF: [0.15, 0], legB: [-0.15, 0], arms: 'aim' });
  out.push({ bob: 1, legF: [0.15, 0.2], legB: [-0.15, 0.2], arms: 'aim' });
  for (let i = 0; i < 6; i++) {
    const ph = (i / 6) * Math.PI * 2;
    const a = Math.sin(ph) * 0.75;
    const bendF = 0.2 + Math.max(0, -Math.cos(ph)) * 1.1;
    const bendB = 0.2 + Math.max(0, Math.cos(ph)) * 1.1;
    out.push({ bob: Math.abs(Math.sin(ph)) > 0.5 ? 0 : 1, legF: [a, bendF], legB: [-a, bendB], arms: 'aim' });
  }
  out.push({ bob: -1, legF: [0.9, 1.5], legB: [-0.2, 0.9], arms: 'aim' });
  out.push({ bob: 0, legF: [0.25, 0.3], legB: [-0.35, 0.1], arms: 'aim' });
  out.push({ bob: 0, legF: [0.5, 1.2], legB: [-0.1, 0.2], arms: 'up' });
  out.push({ bob: 0, legF: [0.1, 0.2], legB: [-0.4, 1.0], arms: 'upAlt' });
  out.push({ bob: 0, legF: [0.6, 1.3], legB: [0.2, 0.6], arms: 'up' });
  return out;
}

/** hand anchor per frame (for drawing held weapons) */
export const HAND: { x: number; y: number }[] = [];

export function makeCharacter(scene: Phaser.Scene, key: string, s: CharSpec): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, CHAR_W * FRAME_COUNT, CHAR_H)!;
  const ctx = tex.getContext();
  const ps = poses();
  const mats = matsFor(s);
  const fill = HAND.length === 0;
  ps.forEach((p, i) => {
    const c = new Canvas();
    const h = paintBody(c, s, p);
    if (fill) HAND[i] = { x: h.hx, y: h.hy };
    shadeAndOutline(c, mats, ctx, i * CHAR_W, 0, s, p);
  });
  // dead: lying on the back
  const c = new Canvas();
  c.rect(4, 19, 6, 4, M.skin);
  c.rect(5, 18, 4, 1, M.skin);
  c.rect(10, 19, 7, 4, M.shirt);
  c.rect(17, 20, 5, 3, M.pants);
  c.rect(22, 19, 2, 4, M.boots);
  if (s.head !== 'bald') c.rect(3, 19, 2, 4, s.head === 'helmet' || s.head === 'riot' || s.head === 'beret' ? M.accent : M.hair);
  shadeAndOutline(c, mats, ctx, FRAME.dead * CHAR_W, 0, { ...s, extra: undefined, head: 'gasmask' }, { bob: 99, legF: [0, 0], legB: [0, 0], arms: 'down' });
  if (fill) HAND[FRAME.dead] = { x: -99, y: 0 };
  for (let i = 0; i < FRAME_COUNT; i++) tex.add(i, 0, i * CHAR_W, 0, CHAR_W, CHAR_H);
  tex.refresh();
}

export function ensureHands(): void {
  if (HAND.length) return;
  poses().forEach((p, i) => {
    const h = paintBody(new Canvas(), { skin: '#000000', hair: '#000000', head: 'bald', accent: '#000000', shirt: '#000000', sleeves: true, pants: '#000000', boots: '#000000', build: 0 }, p);
    HAND[i] = { x: h.hx, y: h.hy };
  });
  HAND[FRAME.dead] = { x: -99, y: 0 };
}

// ---------------------------------------------------------------- roster (original designs)
export const HERO_SPECS: CharSpec[] = [
  { skin: '#d8955e', hair: '#2a1a12', head: 'bandana', accent: '#d42424', shirt: '#4e5e2a', sleeves: false, pants: '#3a4a28', boots: '#2a1e14', build: 0, vest: '#5e6a32' },
  { skin: '#f0b888', hair: '#f8d850', head: 'blond', accent: '#f8d850', shirt: '#c45418', sleeves: true, pants: '#2e2a34', boots: '#1e1a1a', build: 0, extra: 'shades' },
  { skin: '#c88858', hair: '#3a2a1a', head: 'helmet', accent: '#3a78c8', shirt: '#5a6470', sleeves: true, pants: '#3a404a', boots: '#22262c', build: 1, extra: 'goggles', vest: '#4a525e' },
  { skin: '#a86c44', hair: '#1a1210', head: 'beret', accent: '#3aa040', shirt: '#6a3484', sleeves: false, pants: '#1e1e24', boots: '#141414', build: 0, extra: 'cigar' },
];

export const ENEMY_SPECS: Record<string, CharSpec> = {
  grunt: { skin: '#d8a070', hair: '#262224', head: 'balaclava', accent: '#5a6436', shirt: '#8a4430', sleeves: true, pants: '#4e4232', boots: '#1e1810', build: 0 },
  sniper: { skin: '#c89060', hair: '#3a2a1a', head: 'boonie', accent: '#5a6a3a', shirt: '#4a5a34', sleeves: true, pants: '#3e4630', boots: '#1e1810', build: 0, extra: 'facepaint' },
  bomber: { skin: '#e0a878', hair: '#000000', head: 'bald', accent: '#000000', shirt: '#d8d0b0', sleeves: false, pants: '#4a3a2a', boots: '#1e1810', build: 0, extra: 'dynamite' },
  heavy: { skin: '#c89060', hair: '#2a2a2a', head: 'gasmask', accent: '#2a2a2a', shirt: '#5a2e4e', sleeves: true, pants: '#2e2a2e', boots: '#141414', build: 1, vest: '#3a3a3a' },
  shield: { skin: '#d8a070', hair: '#262224', head: 'riot', accent: '#344a78', shirt: '#46587a', sleeves: true, pants: '#2a3242', boots: '#141414', build: 0, extra: 'shield' },
};

// ---------------------------------------------------------------- held weapons
const WEAPON_PAL: Record<string, string> = {
  m: '#6a6e78', l: '#a8aeb8', d: '#3a3c44', w: '#8a5a30', W: '#5e3a1c', o: '#5a6a34', O: '#3e4a22',
  g: '#c8a030', G: '#8a6a18', r: '#d03020', y: '#f0d040',
};
const WEAPON_ART: Record<string, { rows: string[]; gx: number; gy: number }> = {
  rifle: { rows: ['....d..........', '.wwmmmmmmmmmmll', 'wwWmdmmmmmmmm..', 'ww..dd.........', '.....d.........'], gx: 4, gy: 2 },
  shotgun: { rows: ['.wwwmmmmmmmmmmm', 'wwWWdddddddddd.', 'ww..d..........'], gx: 4, gy: 1 },
  flamer: { rows: ['..ggg..........', '.ggggg.mmmmmmlr', '.gGGgg.mdddddd.', '..ggg..d.......'], gx: 7, gy: 2 },
  rocket: { rows: ['.oooooooooooooor', 'OOOOOOOOOOOOOOOr', '....d..d........'], gx: 5, gy: 1 },
  minigun: { rows: ['.mmmmmmlllll', 'dddmmmmmmmmm', '.mmmmmmlllll', '..dd........'], gx: 3, gy: 1 },
  sniper: { rows: ['....dd............', '.wwmmmmmmmmmmmmmml', 'wwWWdd............', 'ww...d............'], gx: 4, gy: 1 },
  pistol: { rows: ['mmmml', 'ddmd.', '..d..'], gx: 1, gy: 1 },
};
export const WEAPON_ANCHOR: Record<string, { gx: number; gy: number; w: number; h: number }> = {};

export function makeWeapons(scene: Phaser.Scene): void {
  for (const [name, art] of Object.entries(WEAPON_ART)) {
    const w = art.rows[0].length + 2;
    const h = art.rows.length + 2;
    const key = `w_${name}`;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, w, h)!;
    const ctx = tex.getContext();
    const filled = (x: number, y: number) => {
      const r = art.rows[y - 1];
      return !!r && x >= 1 && x <= r.length && r[x - 1] !== '.' && r[x - 1] !== undefined;
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (filled(x, y)) {
          ctx.fillStyle = WEAPON_PAL[art.rows[y - 1][x - 1]] ?? '#ff00ff';
          ctx.fillRect(x, y, 1, 1);
        } else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
          ctx.fillStyle = '#120c10';
          ctx.fillRect(x, y, 1, 1);
        }
      }
    tex.refresh();
    WEAPON_ANCHOR[name] = { gx: art.gx + 1, gy: art.gy + 1, w, h };
  }
}
