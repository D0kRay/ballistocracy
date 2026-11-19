import { LEVEL_H_TILES, TILE, VIEW_W } from '../config';
import { Rng } from '../core/rng';
import { planLevel, type EnemyType, type LevelPlan } from '../progress/difficulty';
import { Grid } from './Grid';
import { T } from './tiles';

export type PropType = 'crate' | 'barrel' | 'cage' | 'exit' | 'mine' | 'spikes' | 'flamejet' | 'saw' | 'acid' | 'crusher';
export type ItemId =
  | 'shotgun' | 'flamer' | 'rocket' | 'minigun'
  | 'grenade' | 'c4'
  | 'armor' | 'speed' | 'life' | 'ammo' | 'health';

export const WEAPON_ITEMS: readonly ItemId[] = ['shotgun', 'flamer', 'rocket', 'minigun'];
export const SPECIAL_ITEMS: readonly ItemId[] = ['grenade', 'c4'];
export const POWER_ITEMS: readonly ItemId[] = ['armor', 'speed', 'life', 'ammo', 'health'];

export interface PropSpawn {
  type: PropType;
  x: number; // px, top-left
  y: number;
  w: number;
  h: number;
  x2?: number; // saw travel end
  item?: ItemId;
}
export interface EnemySpawn {
  type: EnemyType;
  x: number;
  y: number;
}
export interface PickupSpawn {
  item: ItemId;
  x: number;
  y: number;
}
export interface Level {
  plan: LevelPlan;
  grid: Grid;
  back: Uint8Array; // background wall per cell (see BACK in gfx/terrain)
  spawn: { x: number; y: number };
  enemies: EnemySpawn[];
  props: PropSpawn[];
  pickups: PickupSpawn[];
  arena: { x0: number; x1: number; doorCol: number; floorRow: number } | null;
}

const H = LEVEL_H_TILES;
const MIN_G = 10;
const MAX_G = 16;

type Chunk = 'flat' | 'pit' | 'bunker' | 'tower' | 'hill' | 'cave' | 'platforms' | 'traps' | 'acid';

export function generateLevel(levelNo: number, seed: number, totalPlaySec: number): Level {
  const plan = planLevel(levelNo, seed, totalPlaySec);
  const rng = new Rng(seed);
  const arenaW = Math.round(VIEW_W / TILE);
  const W = plan.isBoss ? plan.lengthTiles + arenaW : plan.lengthTiles;
  const grid = new Grid(W, H);
  const back = new Uint8Array(W * H);
  const setBack = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) back[y * W + x] = v;
  };
  const enemies: EnemySpawn[] = [];
  const props: PropSpawn[] = [];
  const pickups: PickupSpawn[] = [];

  let g = 14; // current surface row

  const ground = (x: number, surf: number, mat: number = T.DIRT) => {
    for (let y = surf; y < H - 1; y++) grid.init(x, y, mat);
    grid.init(x, H - 1, T.BEDROCK);
    setBack(x, surf + 1, x, H - 1, 1);
  };
  const fill = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid.init(x, y, t);
  };
  const surfY = (x: number) => {
    const r = grid.surfaceRow(x);
    return r < 0 ? H : r;
  };
  const enemyAt = (col: number, row: number, type?: EnemyType) => {
    const t = type ?? rng.pick(plan.enemyTypes);
    if (t === 'drone') enemies.push({ type: t, x: col * TILE + 2, y: Math.max(1, row - 5) * TILE });
    else enemies.push({ type: t, x: col * TILE + 3, y: row * TILE - 14 });
  };
  const propAt = (type: PropType, col: number, row: number, extra: Partial<PropSpawn> = {}) => {
    const size: Record<PropType, [number, number]> = {
      crate: [16, 16], barrel: [12, 16], cage: [16, 16], exit: [24, 48], mine: [10, 4],
      spikes: [16, 8], flamejet: [12, 6], saw: [16, 16], acid: [16, 12], crusher: [16, 16],
    };
    const [w, h] = size[type];
    props.push({ type, x: col * TILE + (TILE - w) / 2, y: row * TILE - h, w, h, ...extra });
  };
  const sprinkleEnemies = (x0: number, x1: number, mult = 1) => {
    let n = plan.enemyDensity * mult * ((x1 - x0) / 12);
    n = Math.floor(n) + (rng.chance(n % 1) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const col = rng.int(x0, x1);
      const r = surfY(col);
      if (r >= H - 1) continue;
      enemyAt(col, r);
    }
  };
  const extras = (x0: number, x1: number) => {
    if (rng.chance(0.35)) {
      const col = rng.int(x0, x1);
      propAt('crate', col, surfY(col), { item: randomItem(rng) });
    }
    if (rng.chance(0.25)) {
      const col = rng.int(x0, x1);
      propAt('barrel', col, surfY(col));
    }
    if (rng.chance(0.12)) {
      const col = rng.int(x0, x1);
      propAt('cage', col, surfY(col));
    }
  };

  // ---------- chunk builders (return width) ----------
  const build: Record<Chunk, (x: number, maxW: number) => number> = {
    flat: (x, maxW) => {
      const len = Math.min(maxW, rng.int(8, 14));
      for (let i = 0; i < len; i++) {
        if (i % 3 === 0 && rng.chance(0.3)) g = clampG(g + rng.pick([-1, 1]));
        ground(x + i, g);
      }
      if (rng.chance(0.4)) {
        const c = x + rng.int(2, len - 3);
        const s = surfY(c);
        grid.init(c, s - 1, T.SANDBAG);
        enemyAt(c + 1, s);
      }
      sprinkleEnemies(x + 1, x + len - 1);
      extras(x + 1, x + len - 2);
      return len;
    },
    pit: (x, maxW) => {
      const wide = rng.chance(0.35) && maxW >= 10;
      const gap = wide ? 6 : rng.int(2, 3);
      const len = gap + 4;
      if (len > maxW) return build.flat(x, maxW);
      ground(x, g);
      ground(x + 1, g);
      if (wide) {
        fill(x + 4, g, x + 5, g, T.PLATFORM);
      }
      const g2 = clampG(g + rng.int(-1, 1));
      ground(x + 2 + gap, g2);
      ground(x + 3 + gap, g2);
      g = g2;
      return len;
    },
    bunker: (x, maxW) => {
      const len = Math.min(maxW, rng.int(11, 15));
      if (len < 10) return build.flat(x, maxW);
      for (let i = 0; i < len; i++) ground(x + i, g);
      const hb = rng.int(4, 5);
      const l = x + 1;
      const r = x + len - 2;
      const roof = g - hb - 1;
      setBack(l, roof, r, g - 1, 2);
      for (let wx = l + 2; wx < r - 1; wx += 3) back[(g - hb + 1) * W + wx] = 3;
      fill(l, roof, r, roof, T.BRICK);
      fill(l, roof, l, g - 1, T.BRICK);
      fill(r, roof, r, g - 1, T.BRICK);
      // doors
      fill(l, g - 2, l, g - 1, T.EMPTY);
      fill(r, g - 2, r, g - 1, T.EMPTY);
      // inner floor + ladder
      if (hb >= 5) {
        const mid = g - 3;
        fill(l + 1, mid, r - 3, mid, T.PLATFORM);
        fill(r - 2, roof, r - 2, g - 1, T.LADDER);
        enemyAt(l + 3, mid);
      } else {
        fill(r - 2, roof, r - 2, g - 1, T.LADDER);
      }
      if (rng.chance(0.5)) fill(l + 2, roof - 1, l + 3, roof - 1, T.SANDBAG);
      enemyAt(l + 2, g);
      enemyAt(r - 3, g);
      if (rng.chance(0.6)) enemyAt(l + 5, roof, plan.enemyTypes.includes('sniper') ? 'sniper' : 'grunt');
      if (rng.chance(0.3)) propAt('cage', l + 4, g);
      else if (rng.chance(0.4)) propAt('crate', l + 4, g, { item: randomItem(rng) });
      if (rng.chance(0.3)) propAt('barrel', r - 4, g);
      return len;
    },
    tower: (x, maxW) => {
      const len = 6;
      if (maxW < len) return build.flat(x, maxW);
      for (let i = 0; i < len; i++) ground(x + i, g);
      const ht = rng.int(6, 8);
      const top = g - ht;
      setBack(x + 1, top, x + 3, g - 1, 2);
      fill(x + 1, top, x + 1, g - 1, T.BRICK);
      fill(x + 3, top, x + 3, g - 1, T.BRICK);
      fill(x + 2, top, x + 2, g - 1, T.LADDER);
      fill(x, top, x + 4, top, T.WOOD);
      grid.init(x + 2, top, T.LADDER);
      fill(x + 1, g - 2, x + 1, g - 1, T.EMPTY);
      enemyAt(x + 4, top, plan.enemyTypes.includes('sniper') && rng.chance(0.6) ? 'sniper' : 'grunt');
      sprinkleEnemies(x + 4, x + 5, 0.5);
      return len;
    },
    hill: (x, maxW) => {
      const len = Math.min(maxW, rng.int(10, 15));
      const peak = clampG(g - rng.int(2, 4));
      const base = g;
      const up = Math.floor(len / 3);
      for (let i = 0; i < len; i++) {
        let s: number;
        if (i < up) s = Math.round(base + ((peak - base) * (i + 1)) / up);
        else if (i < len - up) s = peak;
        else s = Math.round(peak + ((base - peak) * (i - (len - up) + 1)) / up);
        ground(x + i, clampG(s));
      }
      g = clampG(base + rng.int(-1, 1));
      sprinkleEnemies(x + 1, x + len - 1);
      extras(x + 2, x + len - 3);
      return len;
    },
    cave: (x, maxW) => {
      const len = Math.min(maxW, rng.int(12, 17));
      if (len < 10) return build.flat(x, maxW);
      const thick = rng.int(2, 4);
      for (let i = 0; i < len; i++) ground(x + i, g);
      const ceil = g - 4;
      fill(x + 2, ceil - thick + 1, x + len - 3, ceil, T.DIRT);
      setBack(x + 2, ceil - thick + 2, x + len - 3, g - 1, 1);
      if (rng.chance(0.5)) {
        const c = x + rng.int(4, len - 5);
        fill(c, ceil - thick + 1, c + 1, ceil, T.BRICK);
      }
      for (let i = 0; i < 2; i++) enemyAt(x + rng.int(3, len - 4), g);
      enemyAt(x + rng.int(3, len - 4), ceil - thick + 1);
      if (rng.chance(plan.trapRate)) propAt('crusher', x + Math.floor(len / 2), ceil + 2);
      if (rng.chance(0.4)) propAt('barrel', x + rng.int(3, len - 4), g);
      if (rng.chance(0.2)) propAt('cage', x + rng.int(3, len - 4), g);
      return len;
    },
    platforms: (x, maxW) => {
      const len = Math.min(maxW, rng.int(11, 14));
      if (len < 10) return build.flat(x, maxW);
      ground(x, g);
      ground(x + 1, g);
      ground(x + len - 2, g);
      ground(x + len - 1, g);
      let c = x + 3;
      let row = g;
      while (c + 2 < x + len - 3) {
        row = Math.max(MIN_G - 1, Math.min(g + 1, row + rng.int(-2, 1)));
        const pw = rng.int(2, 3);
        fill(c, row, c + pw - 1, row, rng.chance(0.25) ? T.CRUMBLE : T.PLATFORM);
        if (rng.chance(0.3)) enemyAt(c, row);
        c += pw + rng.int(1, 2);
      }
      if (rng.chance(plan.trapRate)) {
        propAt('saw', x + 3, g - 3, { x2: (x + len - 4) * TILE });
      }
      return len;
    },
    traps: (x, maxW) => {
      const len = Math.min(maxW, rng.int(10, 13));
      for (let i = 0; i < len; i++) ground(x + i, g);
      let c = x + 2;
      while (c < x + len - 2) {
        const kind = rng.weighted([
          ['spikes', 3],
          ['mine', 3],
          ['flamejet', 2],
          ['barrel', 1],
        ] as const);
        if (kind === 'spikes') {
          // spikes sit in a 1-deep dip
          for (let k = 0; k < 2 && c + k < x + len - 2; k++) {
            ground(c + k, g + 1);
            propAt('spikes', c + k, g + 1);
          }
          c += 2;
        } else {
          propAt(kind, c, g);
        }
        c += rng.int(2, 3);
      }
      sprinkleEnemies(x + 1, x + len - 1, 0.6);
      return len;
    },
    acid: (x, maxW) => {
      const pool = rng.int(3, 5);
      const len = pool + 4;
      if (len > maxW) return build.flat(x, maxW);
      ground(x, g);
      ground(x + 1, g);
      for (let i = 0; i < pool; i++) {
        ground(x + 2 + i, g + 1);
        propAt('acid', x + 2 + i, g + 1);
      }
      if (pool >= 4) fill(x + 3, g - 2, x + 3 + pool - 3, g - 2, T.PLATFORM);
      ground(x + 2 + pool, g);
      ground(x + 3 + pool, g);
      return len;
    },
  };

  // ---------- assemble ----------
  const startLen = 8;
  for (let i = 0; i < startLen; i++) ground(i, g);
  const spawn = { x: 3 * TILE, y: (g - 1) * TILE - 4 };
  propAt('crate', 6, g, { item: 'grenade' });

  const runEnd = plan.isBoss ? plan.lengthTiles - 4 : W - 12;
  let x = startLen;
  const weights: (readonly [Chunk, number])[] = [
    ['flat', 4],
    ['pit', 2.5],
    ['bunker', levelNo >= 2 ? 2 : 1],
    ['tower', levelNo >= 2 ? 1.2 : 0.4],
    ['hill', 2],
    ['cave', levelNo >= 2 ? 1.5 : 0.5],
    ['platforms', levelNo >= 2 ? 1.2 : 0.3],
    ['traps', plan.trapRate * 6],
    ['acid', plan.trapRate * 3],
  ];
  let last: Chunk | null = null;
  while (x < runEnd) {
    let c = rng.weighted(weights);
    if (c === last && c !== 'flat') c = 'flat';
    last = c;
    x += build[c](x, runEnd - x);
    // short breather between chunks keeps the path readable
    if (x < runEnd) {
      ground(x, g);
      x++;
    }
  }

  let arena: Level['arena'] = null;
  if (plan.isBoss) {
    // approach + arena with metal walls; door gets sealed when the fight starts
    for (; x < plan.lengthTiles; x++) ground(x, g);
    const a0 = plan.lengthTiles;
    const floor = plan.bossType === 'drill' ? 12 : 14;
    for (let i = 0; i < arenaW; i++) ground(a0 + i, floor);
    const doorCol = a0 - 1;
    // metal wall above a 3-tile door; rows g-3..g-1 get sealed when the fight starts
    fill(doorCol, 0, doorCol, g - 4, T.METAL);
    arena = { x0: a0 * TILE, x1: (a0 + arenaW) * TILE, doorCol, floorRow: g };
    pickups.push({ item: 'rocket', x: (a0 - 5) * TILE, y: (g - 1) * TILE });
    pickups.push({ item: 'armor', x: (a0 - 7) * TILE, y: (g - 1) * TILE });
  } else {
    for (; x < W; x++) ground(x, g);
    propAt('exit', W - 6, g);
  }

  return { plan, grid, back, spawn, enemies, props, pickups, arena };
}

function clampG(v: number): number {
  return Math.max(MIN_G, Math.min(MAX_G, v));
}

export function randomItem(rng: Rng): ItemId {
  return rng.weighted<ItemId>([
    ['shotgun', 2], ['flamer', 1.5], ['rocket', 1.5], ['minigun', 1.2],
    ['grenade', 2], ['c4', 1.2],
    ['armor', 1], ['speed', 0.8], ['life', 0.5], ['ammo', 1.5], ['health', 1.5],
  ]);
}
