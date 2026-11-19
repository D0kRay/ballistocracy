import Phaser from 'phaser';
import { TILE } from '../config';
import { Rng } from '../core/rng';
import type { Biome } from '../world/biomes';
import { T, TILE_TYPES } from '../world/tiles';
import { ENEMY_SPECS, HERO_SPECS, makeCharacter, makeWeapons } from './characters';
import { makeFx } from './fx';

// All art is generated at boot from tiny ASCII grids + limited palettes.
// Nothing is loaded from disk, so every sprite is original and license-free.

type Pal = Record<string, string>;

export const HERO_COLORS: { band: string; shirt: string; pants: string }[] = [
  { band: '#e02828', shirt: '#4a6a2a', pants: '#2a3a5a' },
  { band: '#f0c020', shirt: '#b04818', pants: '#3a2a1a' },
  { band: '#30a0f0', shirt: '#40505e', pants: '#24303a' },
  { band: '#40d040', shirt: '#6a3080', pants: '#2a2a2a' },
];

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (f >= 1) {
    r = r + (255 - r) * (f - 1);
    g = g + (255 - g) * (f - 1);
    b = b + (255 - b) * (f - 1);
  } else {
    r *= f;
    g *= f;
    b *= f;
  }
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function drawRows(ctx: CanvasRenderingContext2D, rows: string[], pal: Pal, ox: number, oy: number): void {
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const c = pal[r[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function sheet(scene: Phaser.Scene, key: string, frames: string[][], pal: Pal, fw: number, fh: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, fw * frames.length, fh)!;
  const ctx = tex.getContext();
  frames.forEach((f, i) => drawRows(ctx, f, pal, i * fw, 0));
  for (let i = 0; i < frames.length; i++) tex.add(i, 0, i * fw, 0, fw, fh);
  tex.refresh();
}

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, draw: (ctx: CanvasRenderingContext2D, f: number, ox: number) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  const ctx = tex.getContext();
  for (let f = 0; f < frames; f++) draw(ctx, f, f * w);
  for (let i = 0; i < frames; i++) tex.add(i, 0, i * w, 0, w, h);
  tex.refresh();
}

// ---------------------------------------------------------------- humans
const HEAD_HERO = [
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '..hhkhhhhhhk....',
  '...hksssswsk....',
  '....ksssssk.....',
  '.....kSSSk......',
];
const HEAD_HELMET = [
  '................',
  '.....kkkkk......',
  '....kHHHHHk.....',
  '...kHHHHHHHk....',
  '....kmmmwmk.....',
  '....kmmmmmk.....',
  '.....kmmmk......',
];
const HEAD_HAT = [
  '................',
  '......kkkk......',
  '.....kHHHHk.....',
  '...kkHHHHHHkk...',
  '....ksssswsk....',
  '....ksssssk.....',
  '.....kmmmk......',
];
const TORSO_GUN = [
  '....kbbbbbk.....',
  '...kbbbbbbkkgggg',
  '...kbbbbbsgGGGGk',
  '...kkbbbbkkgk...',
];
const TORSO_RIFLE_LONG = [
  '....kbbbbbk.....',
  '...kbbbbbbkggggg',
  '...kbbbbbsgGGGGG',
  '...kkbbbbkkgk...',
];
const TORSO_BOMB = [
  '....kbrbrbk.....',
  '...kbrbrbrbk....',
  '...ksbrbrbsk....',
  '...kkbbbbbkk....',
];
const TORSO_HEAVY = [
  '...kbbbbbbbk....',
  '..kbbbbbbbkggggg',
  '..kbbbbbbsgGGGGG',
  '..kkbbbbbkkgggk.',
];
const TORSO_EMPTY = [
  '....kbbbbbk.....',
  '...kbbbbbbbk....',
  '...ksbbbbbsk....',
  '...kkbbbbbkk....',
];
const TORSO_CLIMB = [
  '..sk.kbbbk.ks...',
  '..kbbbbbbbbbk...',
  '....kbbbbbk.....',
  '....kkbbbkk.....',
];
const LEGS = {
  idle: ['....kpppppk.....', '....kpp.ppk.....', '....kpp.ppk.....', '....koo.ook.....', '...kooo.oook....'],
  runA: ['....kpppppk.....', '...kppk.kppk....', '..kppk...kppk...', '.kook.....kook..', '.kkk.......kkk..'],
  runB: ['....kpppppk.....', '.....kpppk......', '.....kppk.......', '.....kook.......', '.....kkkk.......'],
  runC: ['....kpppppk.....', '....kppkppk.....', '...kppk.kpk.....', '..kook..kook....', '..kkk...kkk.....'],
  jump: ['....kpppppk.....', '...kppkkppk.....', '..kook.kppk.....', '..kkk..kook.....', '.......kkk......'],
};
const DEAD = [
  ...Array(11).fill('................'),
  '................',
  '................',
  '.kkkkkkkkkkkkk..',
  'khhsssbbbbppook.',
  '.kkkkkkkkkkkkk..',
];

function humanFrames(head: string[], torso: string[], climbTorso = TORSO_CLIMB): string[][] {
  return [
    [...head, ...torso, ...LEGS.idle], // 0 idle
    [...head, ...torso, ...LEGS.runA], // 1
    [...head, ...torso, ...LEGS.runB], // 2
    [...head, ...torso, ...LEGS.runC], // 3
    [...head, ...torso, ...LEGS.jump], // 4 jump
    [...head, ...climbTorso, ...LEGS.runB], // 5 climb
    DEAD, // 6 dead
  ];
}

function deadWith(dead: string[]): string[] {
  return dead;
}

export function makeHeroes(scene: Phaser.Scene): void {
  HERO_SPECS.forEach((spec, i) => makeCharacter(scene, `hero${i}`, spec));
  makeCharacter(scene, 'prisoner', { skin: '#e0a878', hair: '#6a6a6a', head: 'bald', accent: '#000000', shirt: '#b8b0a0', sleeves: false, pants: '#6a6460', boots: '#3a3a3a', build: 0 });
  makeWeapons(scene);
}

export function makeEnemies(scene: Phaser.Scene): void {
  for (const [type, spec] of Object.entries(ENEMY_SPECS)) makeCharacter(scene, `e_${type}`, spec);

  const dogA = [
    '................',
    '...........kk...',
    '..........kddk..',
    '.k.......kdddwk.',
    'kdkkkkkkkkddddkk',
    '.kddddddddddddk.',
    '..kddddddddddk..',
    '..kdk.kk..kdk...',
    '..kk..kk..kk....',
    '................',
  ];
  const dogB = [...dogA.slice(0, 6), '..kddddddddddk..', '.kdk...kk..kdk..', '.kk.....kk..kk..', '................'];
  const dogDead = [...Array(6).fill('................'), '..kkkkkkkkkkk...', '.kdddddddddddk..', '..kkkkkkkkkkk...', '................'];
  sheet(scene, 'e_dog', [dogA, dogB, dogA, dogB, dogB, dogA, dogDead], { k: '#141414', d: '#7a5a3a', w: '#ff3030' }, 16, 10);

  const droneA = [
    'kkkkkk..kkkkkk..',
    '...k......k.....',
    '..kkkkkkkkkk....',
    '.kmmmmmmmmmmk...',
    '.kmmwwmmmmMmk...',
    '..kmmmmmmmmk....',
    '...kk....kk.....',
    '................',
  ];
  const droneB = ['.kkkk....kkkk...', ...droneA.slice(1)];
  sheet(scene, 'e_drone', [droneA, droneB, droneA, droneB, droneA, droneB, droneA], { k: '#141414', m: '#6a6a74', M: '#a0a0aa', w: '#ff3030' }, 16, 8);
  void deadWith;
}

// ---------------------------------------------------------------- tiles
export function makeTiles(scene: Phaser.Scene, b: Biome): string {
  const key = `tiles_${b.id}`;
  const variants = 4;
  canvasTex(scene, key, TILE, TILE, TILE_TYPES * variants, (ctx, f, ox) => {
    const t = Math.floor(f / variants);
    const v = f % variants;
    const top = v % 2 === 1;
    const rng = new Rng(1000 + f * 7919);
    drawTile(ctx, ox, t, top, rng, b);
  });
  return key;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

function noise(ctx: CanvasRenderingContext2D, ox: number, rng: Rng, base: string, dark: string, light: string, pd: number, pl: number): void {
  px(ctx, ox, 0, base, TILE, TILE);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const r = rng.next();
      if (r < pd) px(ctx, ox + x, y, dark);
      else if (r < pd + pl) px(ctx, ox + x, y, light);
    }
}

function drawTile(ctx: CanvasRenderingContext2D, ox: number, t: number, top: boolean, rng: Rng, b: Biome): void {
  switch (t) {
    case T.DIRT: {
      noise(ctx, ox, rng, b.dirt, b.dirtDark, shade(b.dirt, 1.15), 0.18, 0.06);
      for (let i = 0; i < 2; i++) {
        const sx = rng.int(1, 12);
        const sy = rng.int(3, 12);
        px(ctx, ox + sx, sy, shade(b.dirtDark, 0.8), 3, 2);
        px(ctx, ox + sx, sy, shade(b.dirt, 1.25), 1, 1);
      }
      if (top) {
        for (let x = 0; x < TILE; x++) {
          const d = rng.int(3, 5);
          px(ctx, ox + x, 0, b.top, 1, d);
          px(ctx, ox + x, d, b.topDark, 1, 1);
          if (rng.chance(0.3)) px(ctx, ox + x, 0, shade(b.top, 1.25));
        }
      }
      break;
    }
    case T.BRICK:
    case T.CRUMBLE: {
      px(ctx, ox, 0, b.brick, TILE, TILE);
      for (let row = 0; row < 4; row++) {
        const y = row * 4;
        px(ctx, ox, y + 3, b.brickDark, TILE, 1);
        const off = row % 2 ? 4 : 0;
        for (let x = off; x < TILE; x += 8) px(ctx, ox + x, y, b.brickDark, 1, 3);
        for (let x = off + 1; x < TILE; x += 8) px(ctx, ox + x, y, shade(b.brick, 1.2), 3, 1);
      }
      for (let i = 0; i < 10; i++) px(ctx, ox + rng.int(0, 15), rng.int(0, 15), shade(b.brick, rng.chance(0.5) ? 0.85 : 1.1));
      if (t === T.CRUMBLE) {
        const c = '#1a1414';
        px(ctx, ox + 3, 2, c, 1, 4); px(ctx, ox + 4, 5, c, 3, 1); px(ctx, ox + 7, 6, c, 1, 5);
        px(ctx, ox + 11, 1, c, 1, 3); px(ctx, ox + 10, 4, c, 1, 4); px(ctx, ox + 9, 8, c, 3, 1);
      }
      if (top) px(ctx, ox, 0, shade(b.brick, 1.3), TILE, 1);
      break;
    }
    case T.WOOD: {
      px(ctx, ox, 0, b.wood, TILE, TILE);
      for (let y = 0; y < TILE; y += 4) {
        px(ctx, ox, y + 3, shade(b.wood, 0.55), TILE, 1);
        px(ctx, ox, y, shade(b.wood, 1.2), TILE, 1);
        for (let i = 0; i < 3; i++) px(ctx, ox + rng.int(0, 13), y + 1 + rng.int(0, 1), shade(b.wood, 0.8), rng.int(2, 4), 1);
      }
      px(ctx, ox + 1, 1, '#222', 1, 1); px(ctx, ox + 14, 1, '#222', 1, 1);
      px(ctx, ox + 1, 13, '#222', 1, 1); px(ctx, ox + 14, 13, '#222', 1, 1);
      break;
    }
    case T.METAL: {
      px(ctx, ox, 0, b.metal, TILE, TILE);
      px(ctx, ox, 0, shade(b.metal, 1.35), TILE, 1);
      px(ctx, ox, 0, shade(b.metal, 1.35), 1, TILE);
      px(ctx, ox, 15, shade(b.metal, 0.5), TILE, 1);
      px(ctx, ox + 15, 0, shade(b.metal, 0.5), 1, TILE);
      for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) {
        px(ctx, ox + x, y, shade(b.metal, 1.5));
        px(ctx, ox + x + 1, y + 1, shade(b.metal, 0.5));
      }
      px(ctx, ox + 4, 7, shade(b.metal, 0.8), 8, 2);
      break;
    }
    case T.BEDROCK: {
      noise(ctx, ox, rng, shade(b.dirtDark, 0.6), shade(b.dirtDark, 0.4), shade(b.dirtDark, 0.85), 0.3, 0.15);
      break;
    }
    case T.LADDER: {
      const c = shade(b.wood, 1.1);
      const d = shade(b.wood, 0.6);
      px(ctx, ox + 2, 0, c, 2, TILE); px(ctx, ox + 12, 0, c, 2, TILE);
      px(ctx, ox + 3, 0, d, 1, TILE); px(ctx, ox + 13, 0, d, 1, TILE);
      for (let y = 2; y < TILE; y += 5) {
        px(ctx, ox + 4, y, c, 8, 2);
        px(ctx, ox + 4, y + 1, d, 8, 1);
      }
      break;
    }
    case T.SANDBAG: {
      const s = '#b8a070';
      const sd = '#7a6440';
      for (let row = 0; row < 3; row++) {
        const y = row * 5 + 1;
        const off = row % 2 ? -4 : 0;
        for (let x = off; x < TILE; x += 8) {
          px(ctx, ox + Math.max(0, x), y, s, Math.min(8, TILE - Math.max(0, x)) - 1, 4);
          px(ctx, ox + Math.max(0, x), y + 3, sd, Math.min(8, TILE - Math.max(0, x)) - 1, 1);
          px(ctx, ox + Math.max(0, x) + 1, y, shade(s, 1.2), 3, 1);
        }
      }
      break;
    }
    case T.PLATFORM: {
      px(ctx, ox, 0, b.wood, TILE, 5);
      px(ctx, ox, 0, shade(b.wood, 1.3), TILE, 1);
      px(ctx, ox, 4, shade(b.wood, 0.5), TILE, 1);
      px(ctx, ox + 3, 5, shade(b.wood, 0.6), 2, 4);
      px(ctx, ox + 11, 5, shade(b.wood, 0.6), 2, 4);
      px(ctx, ox + 7, 1, '#222');
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------- props, items, fx
const LETTERS: Record<string, string> = {
  S: '.## #.. .#. ..# ##.', F: '### #.. ##. #.. #..', R: '##. #.# ##. #.# #.#', M: '#.# ### ### #.# #.#',
  G: '.## #.. #.# #.# .##', C: '.## #.. #.. #.. .##', A: '.#. #.# ### #.# #.#', '>': '#.. .#. ..# .#. #..',
  '+': '... .#. ### .#. ...', H: '#.# #.# ### #.# #.#', '*': '#.# .#. #.# ... ...',
};

export const ITEM_ICON: Record<string, [string, string]> = {
  shotgun: ['S', '#f0c020'], flamer: ['F', '#f07020'], rocket: ['R', '#e03030'], minigun: ['M', '#c0c0c0'],
  grenade: ['G', '#40a040'], c4: ['C', '#d04040'],
  armor: ['A', '#4080f0'], speed: ['>', '#40e0e0'], life: ['+', '#40f040'], ammo: ['*', '#e0c060'], health: ['H', '#f04080'],
};

export function makeProps(scene: Phaser.Scene): void {
  // crate
  const O = '#120c10';
  // military supply crate
  canvasTex(scene, 'crate', 16, 16, 1, (c, _f, ox) => {
    px(c, ox, 0, O, 16, 16);
    px(c, ox + 1, 1, '#6a7a3a', 14, 14);
    px(c, ox + 1, 1, '#8a9a52', 14, 1);
    px(c, ox + 1, 1, '#8a9a52', 1, 14);
    px(c, ox + 1, 14, '#46521e', 14, 1);
    px(c, ox + 14, 1, '#46521e', 1, 14);
    px(c, ox + 1, 4, '#46521e', 14, 1);
    px(c, ox + 1, 11, '#46521e', 14, 1);
    px(c, ox + 5, 6, '#e8e0b0', 6, 1); px(c, ox + 5, 8, '#e8e0b0', 6, 1); px(c, ox + 7, 5, '#e8e0b0', 2, 5);
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px(c, ox + x, y, '#c8c8a0');
  });
  // oil drum with hazard band
  canvasTex(scene, 'barrel', 12, 16, 1, (c, _f, ox) => {
    px(c, ox + 1, 0, O, 10, 16);
    px(c, ox, 1, O, 12, 14);
    px(c, ox + 1, 1, '#b81c1c', 10, 14);
    px(c, ox + 2, 1, '#e44a3a', 2, 14);
    px(c, ox + 9, 1, '#7a1010', 2, 14);
    px(c, ox + 1, 3, '#5a0c0c', 10, 1); px(c, ox + 1, 12, '#5a0c0c', 10, 1);
    px(c, ox + 1, 6, '#f0c820', 10, 4);
    for (let x = 1; x < 11; x += 3) px(c, ox + x, 6, O, 2, 4);
    px(c, ox + 4, 0, '#d0d0d0', 3, 1);
  });
  // bamboo cage (prisoner sprite drawn behind it by the renderer)
  canvasTex(scene, 'cage', 20, 24, 1, (c, _f, ox) => {
    px(c, ox, 0, O, 20, 3); px(c, ox + 1, 1, '#b8943a', 18, 1);
    px(c, ox, 21, O, 20, 3); px(c, ox + 1, 22, '#b8943a', 18, 1);
    for (let x = 0; x < 20; x += 4) {
      px(c, ox + x, 3, O, 3, 18);
      px(c, ox + x + 1, 3, '#d8b45a', 1, 18);
      px(c, ox + x + 1, 9, '#8a6a2a', 1, 1); px(c, ox + x + 1, 15, '#8a6a2a', 1, 1);
    }
  });
  canvasTex(scene, 'exit', 24, 48, 2, (c, f, ox) => {
    px(c, ox + 3, 2, '#d0d0d0', 2, 44);
    px(c, ox + 4, 2, '#808080', 1, 44);
    px(c, ox + 1, 44, '#5a5a5a', 8, 4);
    px(c, ox + 2, 0, '#f0d020', 4, 3);
    const wave = f === 0 ? [0, 1, 1, 0, -1, -1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0] : [1, 0, -1, -1, 0, 1, 1, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < 17; x++) {
      const y = 4 + (wave[x] ?? 0);
      px(c, ox + 5 + x, y, '#20a040', 1, 11);
      px(c, ox + 5 + x, y, '#30d050', 1, 1);
    }
    // star
    px(c, ox + 12, 8, '#f0f040', 3, 3); px(c, ox + 13, 7, '#f0f040', 1, 5); px(c, ox + 11, 9, '#f0f040', 5, 1);
  });
  canvasTex(scene, 'mine', 10, 4, 2, (c, f, ox) => {
    px(c, ox + 1, 1, '#2a2a2a', 8, 3); px(c, ox + 2, 0, '#3a3a3a', 6, 1);
    px(c, ox + 4, 0, f ? '#ff2020' : '#601010', 2, 1);
  });
  canvasTex(scene, 'spikes', 16, 8, 1, (c, _f, ox) => {
    for (let s = 0; s < 4; s++) {
      for (let y = 0; y < 8; y++) {
        const half = Math.floor(y / 2);
        px(c, ox + s * 4 + 2 - half, y, '#a0a0aa', half * 2 + 1 > 4 ? 4 : half * 2 + 1, 1);
      }
      px(c, ox + s * 4 + 2, 0, '#f0f0f0');
    }
    px(c, ox, 7, '#4a4a50', 16, 1);
  });
  canvasTex(scene, 'flamejet', 12, 6, 1, (c, _f, ox) => {
    px(c, ox, 1, '#3a3a40', 12, 5); px(c, ox, 1, '#6a6a74', 12, 1);
    for (let x = 2; x < 11; x += 3) px(c, ox + x, 2, '#141414', 2, 2);
  });
  canvasTex(scene, 'saw', 16, 16, 2, (c, f, ox) => {
    const cx = ox + 8;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        const a = Math.atan2(y - 7.5, x - 7.5) + (f ? Math.PI / 8 : 0);
        const tooth = Math.sin(a * 8) > 0.2;
        if (d < 5) c.fillStyle = d < 2 ? '#3a3a3a' : '#b0b0ba';
        else if (d < 6.5 || (d < 8 && tooth)) c.fillStyle = '#d8d8e0';
        else continue;
        c.fillRect(ox + x, y, 1, 1);
      }
    void cx;
  });
  canvasTex(scene, 'crusher', 16, 16, 1, (c, _f, ox) => {
    px(c, ox, 0, '#141414', 16, 13); px(c, ox + 1, 1, '#5a5a64', 14, 11); px(c, ox + 1, 1, '#8a8a94', 14, 1);
    px(c, ox + 3, 4, '#f0c020', 10, 2); px(c, ox + 3, 7, '#f0c020', 10, 2);
    for (let s = 0; s < 4; s++) { px(c, ox + s * 4 + 1, 13, '#a0a0aa', 2, 2); px(c, ox + s * 4 + 1.5, 15, '#d0d0d8', 1, 1); }
  });
  canvasTex(scene, 'chain', 4, 4, 1, (c, _f, ox) => {
    px(c, ox + 1, 0, '#6a6a74', 2, 3);
  });

  // pickups: little ammo boxes with a coloured stencil plate
  for (const [item, [letter, color]] of Object.entries(ITEM_ICON)) {
    canvasTex(scene, `pk_${item}`, 14, 12, 1, (c, _f, ox) => {
      px(c, ox, 0, O, 14, 12);
      px(c, ox + 1, 1, '#4e5a2a', 12, 10);
      px(c, ox + 1, 1, '#6e7a42', 12, 1);
      px(c, ox + 1, 10, '#323a18', 12, 1);
      px(c, ox + 3, 2, O, 8, 8);
      px(c, ox + 4, 3, color, 6, 6);
      px(c, ox + 4, 3, shade(color, 1.4), 6, 1);
      const rows = (LETTERS[letter] ?? LETTERS['+']).split(' ');
      for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (rows[y][x] === '#') px(c, ox + 6 + x, 4 + y, O, 1, 1);
    });
  }
}

export function makeProjectiles(scene: Phaser.Scene): void {
  const simple = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => canvasTex(scene, key, w, h, 1, (c) => draw(c));
  simple('p_bullet', 5, 2, (c) => { px(c, 0, 0, '#f0c040', 5, 2); px(c, 3, 0, '#ffffff', 2, 2); });
  simple('p_ebullet', 4, 3, (c) => { px(c, 0, 0, '#ff3020', 4, 3); px(c, 1, 1, '#ffd0a0', 2, 1); });
  simple('p_pellet', 2, 2, (c) => px(c, 0, 0, '#ffe080', 2, 2));
  simple('p_rocket', 9, 4, (c) => { px(c, 0, 1, '#5a6a3a', 7, 2); px(c, 7, 1, '#d04020', 2, 2); px(c, 0, 0, '#3a3a3a', 2, 4); });
  simple('p_missile', 9, 4, (c) => { px(c, 0, 1, '#b0b0b0', 7, 2); px(c, 7, 1, '#ff3020', 2, 2); px(c, 0, 0, '#5a5a5a', 2, 4); });
  simple('p_grenade', 5, 5, (c) => { px(c, 0, 1, '#2a4a1a', 5, 4); px(c, 1, 0, '#3a6a2a', 3, 5); px(c, 2, 0, '#8a8a8a', 1, 1); });
  simple('p_c4', 6, 4, (c) => { px(c, 0, 0, '#c0a070', 6, 4); px(c, 1, 1, '#ff2020', 1, 1); px(c, 3, 1, '#222', 2, 2); });
  simple('p_shell', 6, 6, (c) => { px(c, 1, 0, '#2a2a2a', 4, 6); px(c, 0, 1, '#2a2a2a', 6, 4); px(c, 1, 1, '#6a6a6a', 2, 2); });
  simple('p_mortar', 5, 5, (c) => { px(c, 0, 0, '#3a3a3a', 5, 5); px(c, 1, 1, '#ff6020', 1, 1); });
  simple('p_bomb', 6, 7, (c) => { px(c, 1, 2, '#1a1a1a', 4, 5); px(c, 0, 3, '#1a1a1a', 6, 3); px(c, 2, 0, '#6a6a6a', 2, 2); px(c, 2, 3, '#5a5a5a', 1, 1); });
  simple('p_rock', 6, 6, (c) => { px(c, 1, 0, '#6a5040', 4, 6); px(c, 0, 1, '#6a5040', 6, 4); px(c, 1, 1, '#9a7a60', 2, 1); });
  simple('p_thrown', 11, 4, (c) => { px(c, 0, 1, '#3a3a42', 11, 2); px(c, 2, 2, '#3a3a42', 2, 2); px(c, 4, 1, '#8a8a96', 5, 1); });
  canvasTex(scene, 'p_flame', 7, 7, 3, (c, f, ox) => {
    const cols = [['#fff0a0', '#f0a020'], ['#f0c040', '#e05010'], ['#e06010', '#802010']][f];
    px(c, ox + 1, 1, cols[1], 5, 5);
    px(c, ox, 2, cols[1], 7, 3);
    px(c, ox + 2, 2, cols[0], 3, 3);
  });
  canvasTex(scene, 'muzzle', 8, 8, 2, (c, f, ox) => {
    px(c, ox + 0, 3, '#fff0a0', 8, 2);
    px(c, ox + 2, 1 + f, '#ffd040', 4, 6 - f * 2);
    px(c, ox + 3, 3, '#ffffff', 3, 2);
  });
  canvasTex(scene, 'heart', 7, 6, 1, (c, _f, ox) => {
    px(c, ox + 0, 1, '#e02030', 7, 2); px(c, ox + 1, 0, '#e02030', 2, 1); px(c, ox + 4, 0, '#e02030', 2, 1);
    px(c, ox + 1, 3, '#e02030', 5, 1); px(c, ox + 2, 4, '#e02030', 3, 1); px(c, ox + 3, 5, '#e02030', 1, 1);
    px(c, ox + 1, 1, '#ff9090', 1, 1);
  });
  canvasTex(scene, 'px', 1, 1, 1, (c) => px(c, 0, 0, '#ffffff'));
}

export function makeBosses(scene: Phaser.Scene): void {
  // IRON HOG tank (facing right)
  canvasTex(scene, 'boss_tank', 64, 36, 2, (c, f, ox) => {
    const hull = '#5a6a3a';
    const hd = '#3a4628';
    const hl = '#7a8a52';
    // treads
    px(c, ox + 2, 26, '#141414', 58, 10);
    px(c, ox + 3, 27, '#3a3a3a', 56, 8);
    for (let i = 0; i < 7; i++) {
      const wx = ox + 6 + i * 8;
      px(c, wx, 28, '#6a6a6a', 6, 6);
      px(c, wx + 2, 30, '#2a2a2a', 2, 2);
    }
    for (let i = 0; i < 28; i++) px(c, ox + 3 + ((i * 2 + f) % 56), 27, '#5a5a5a', 1, 1);
    // hull
    px(c, ox + 0, 16, '#141414', 62, 11);
    px(c, ox + 1, 17, hull, 60, 9);
    px(c, ox + 1, 17, hl, 60, 1);
    px(c, ox + 1, 24, hd, 60, 2);
    for (let i = 0; i < 8; i++) px(c, ox + 4 + i * 7, 21, hd, 2, 2);
    px(c, ox + 6, 19, '#d02020', 10, 3); // markings
    px(c, ox + 9, 18, '#f0d020', 4, 1);
    // turret
    px(c, ox + 18, 6, '#141414', 24, 11);
    px(c, ox + 19, 7, hull, 22, 9);
    px(c, ox + 19, 7, hl, 22, 1);
    px(c, ox + 24, 3, '#141414', 8, 4);
    px(c, ox + 25, 4, hd, 6, 3);
    // cannon
    px(c, ox + 41, 9, '#141414', 22, 5);
    px(c, ox + 41, 10, '#4a4a4a', 21, 3);
    px(c, ox + 41, 10, '#7a7a7a', 21, 1);
    px(c, ox + 58, 8, '#141414', 5, 7);
    // mg
    px(c, ox + 50, 20, '#2a2a2a', 12, 2);
  });
  // HORNET gunship (facing right)
  canvasTex(scene, 'boss_gunship', 72, 32, 2, (c, f, ox) => {
    const body = '#4a5a6a';
    const bl = '#6a7a8a';
    // rotor
    if (f === 0) px(c, ox + 6, 1, '#202020', 60, 2);
    else { px(c, ox + 20, 1, '#202020', 32, 2); px(c, ox + 30, 0, '#202020', 12, 1); }
    px(c, ox + 34, 3, '#2a2a2a', 4, 5);
    // tail
    px(c, ox + 0, 12, '#141414', 30, 6);
    px(c, ox + 1, 13, body, 29, 4);
    px(c, ox + 0, 6, '#141414', 5, 10);
    px(c, ox + 1, 7, bl, 3, 8);
    // body
    px(c, ox + 22, 8, '#141414', 42, 18);
    px(c, ox + 23, 9, body, 40, 16);
    px(c, ox + 23, 9, bl, 40, 2);
    px(c, ox + 28, 14, '#d02020', 8, 3);
    // cockpit
    px(c, ox + 52, 11, '#141414', 14, 10);
    px(c, ox + 53, 12, '#60c0f0', 11, 7);
    px(c, ox + 54, 12, '#c0f0ff', 4, 2);
    // gun + skids
    px(c, ox + 58, 22, '#2a2a2a', 12, 3);
    px(c, ox + 26, 28, '#2a2a2a', 34, 2);
    px(c, ox + 30, 25, '#2a2a2a', 2, 3); px(c, ox + 54, 25, '#2a2a2a', 2, 3);
    // rocket pods
    px(c, ox + 36, 24, '#3a3a3a', 10, 3); px(c, ox + 44, 24, '#d04020', 2, 3);
  });
  // BURROWER drill head (facing right) + body segment
  canvasTex(scene, 'boss_drill', 24, 24, 2, (c, f, ox) => {
    px(c, ox + 0, 4, '#141414', 12, 16);
    px(c, ox + 1, 5, '#8a6a3a', 10, 14);
    px(c, ox + 1, 5, '#b08a50', 10, 2);
    px(c, ox + 3, 8, '#ff3020', 2, 2); px(c, ox + 3, 14, '#ff3020', 2, 2);
    for (let x = 0; x < 12; x++) {
      const hgt = Math.round(9 - x * 0.75);
      px(c, ox + 11 + x, 12 - hgt, '#141414', 1, hgt * 2);
      px(c, ox + 11 + x, 13 - hgt, '#b0b0ba', 1, Math.max(1, hgt * 2 - 2));
      if ((x + f * 2) % 4 < 2) px(c, ox + 11 + x, 12 - hgt + ((x * 3 + f * 3) % Math.max(1, hgt * 2)), '#5a5a64', 1, 2);
    }
  });
  canvasTex(scene, 'boss_seg', 18, 18, 1, (c, _f, ox) => {
    for (let y = 0; y < 18; y++)
      for (let x = 0; x < 18; x++) {
        const d = Math.hypot(x - 8.5, y - 8.5);
        if (d > 8.6) continue;
        c.fillStyle = d > 7.6 ? '#141414' : y < 6 ? '#b08a50' : '#8a6a3a';
        c.fillRect(ox + x, y, 1, 1);
      }
    px(c, ox + 4, 8, '#5a4428', 10, 2);
  });
}

export function makeAll(scene: Phaser.Scene): void {
  makeFx(scene);
  makeHeroes(scene);
  makeEnemies(scene);
  makeProps(scene);
  makeProjectiles(scene);
  makeBosses(scene);
}
