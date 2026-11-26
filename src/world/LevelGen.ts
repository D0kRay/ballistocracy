import { LEVEL_H_TILES, TILE, VIEW_W } from '../config';
import { Rng } from '../core/rng';
import { planLevel, type EnemyType, type LevelPlan, type PlanOverrides } from '../progress/difficulty';
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
  variant?: string; // exit vehicle: chopper | truck | plane
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
  scenery: SceneSpawn[];
  arena: { x0: number; x1: number; doorCol: number; floorRow: number } | null;
}

const BASE_H = LEVEL_H_TILES;

type Chunk = 'flat' | 'pit' | 'bunker' | 'tower' | 'hill' | 'cave' | 'platforms' | 'traps' | 'acid' | 'village' | 'temple' | 'ruin' | 'scaffold' | 'bridge' | 'cliff' | 'islands' | 'camp' | 'trench' | 'crater' | 'outpost';

export interface SceneSpawn {
  type: string; // see gfx/scenery
  x: number; // px, bottom centre
  y: number;
  flip: boolean;
  h?: number; // stretched height for posts/girders
}

export function generateLevel(levelNo: number, seed: number, totalPlaySec: number, ov: PlanOverrides = {}): Level {
  const plan = planLevel(levelNo, seed, totalPlaySec, ov);
  const mut = plan.mutator;
  const rng = new Rng(seed);
  const arenaW = Math.round(VIEW_W / TILE);
  const FINALE = 48; // columns for the sky finale
  const W = plan.isBoss ? plan.lengthTiles + arenaW : plan.lengthTiles + (plan.skyExit ? FINALE - 12 : 0);
  const H = plan.height ?? BASE_H;
  const OFF = H - BASE_H; // tall levels keep the ground near the bottom
  const MIN_G = 10 + OFF;
  const MAX_G = 16 + OFF;
  const clampG = (v: number) => Math.max(MIN_G, Math.min(MAX_G, v));
  const grid = new Grid(W, H);
  const back = new Uint8Array(W * H);
  const setBack = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) back[y * W + x] = v;
  };
  const enemies: EnemySpawn[] = [];
  const props: PropSpawn[] = [];
  const pickups: PickupSpawn[] = [];
  const scenery: SceneSpawn[] = [];
  const biome = plan.biome;
  /** non-colliding decoration standing on (col,row) top edge */
  const scene = (type: string, col: number, row: number, dx = 0) => scenery.push({ type, x: col * TILE + 8 + dx, y: row * TILE, flip: rng.chance(0.5) });
  const roofStyle = biome === 'snow' ? 'roof_snow' : biome === 'desert' ? 'roof_tent' : 'roof_thatch';

  let g = 14 + OFF; // current surface row

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
    // some twists favour one enemy type
    const bias: EnemyType | null = mut === 'dogpack' ? 'dog' : mut === 'snipers' ? 'sniper' : mut === 'skypatrol' ? 'drone' : null;
    const t = type ?? (bias && rng.chance(0.4) ? bias : rng.pick(plan.enemyTypes));
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
    if (rng.chance(mut === 'armory' ? 0.8 : 0.35)) {
      const col = rng.int(x0, x1);
      propAt('crate', col, surfY(col), { item: mut === 'armory' && rng.chance(0.6) ? rng.pick(WEAPON_ITEMS) : randomItem(rng) });
    }
    if (rng.chance(mut === 'demolition' ? 0.75 : 0.25)) {
      const col = rng.int(x0, x1);
      propAt('barrel', col, surfY(col));
      if (mut === 'demolition' && rng.chance(0.5) && col + 1 <= x1 && surfY(col + 1) === surfY(col)) propAt('barrel', col + 1, surfY(col));
    }
    if (rng.chance(mut === 'prison' ? 0.45 : 0.12)) {
      const col = rng.int(x0, x1);
      propAt('cage', col, surfY(col));
    }
    if (mut === 'minefield' && rng.chance(0.6)) {
      const col = rng.int(x0, x1);
      propAt('mine', col, surfY(col));
    }
  };

  // ---------- chunk builders (return width) ----------
  const build: Record<Chunk, (x: number, maxW: number) => number> = {
    flat: (x, maxW) => {
      const len = Math.min(maxW, rng.int(8, 14));
      for (let i = 0; i < len; i++) {
        if (i % 3 === 0 && rng.chance(0.4)) g = clampG(g + rng.pick([-2, -1, 1, 2]));
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
      if (biome === 'jungle' || biome === 'snow' || biome === 'desert') {
        // wooden watchtower on stilts
        for (let i = 0; i < len; i++) ground(x + i, g);
        const top = g - rng.int(6, 7);
        fill(x + 1, top, x + 5, top, T.PLATFORM);
        grid.init(x + 1, top - 1, T.SANDBAG);
        grid.init(x + 5, top - 1, T.SANDBAG);
        fill(x + 3, top, x + 3, g - 1, T.LADDER);
        scenery.push({ type: 'post', x: (x + 1) * TILE + 8, y: g * TILE, flip: false, h: (g - top) * TILE });
        scenery.push({ type: 'post', x: (x + 5) * TILE + 8, y: g * TILE, flip: false, h: (g - top) * TILE });
        scene(roofStyle, x + 3, top - 1);
        enemyAt(x + 2, top, plan.enemyTypes.includes('sniper') && rng.chance(0.6) ? 'sniper' : 'grunt');
        sprinkleEnemies(x, x + 5, 0.4);
        return len;
      }
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
    village: (x, maxW) => {
      const len = Math.min(maxW, 16);
      if (len < 12) return build.flat(x, maxW);
      for (let i = 0; i < len; i++) ground(x + i, g);
      for (let hx = x + 2; hx + 5 < x + len; hx += 7) {
        const fy = g - 3;
        const ry = fy - 4;
        fill(hx, fy, hx + 4, fy, T.PLATFORM);
        fill(hx, ry, hx + 4, ry, T.WOOD);
        setBack(hx, ry + 1, hx + 4, fy - 1, 4);
        fill(hx - 1, fy, hx - 1, g - 1, T.LADDER);
        scene('post', hx, g);
        scene('post', hx + 4, g);
        scene(roofStyle, hx + 2, ry + 1);
        enemyAt(hx + 2, fy);
        if (rng.chance(0.5)) enemyAt(hx + 3, fy);
        if (rng.chance(0.3)) propAt(rng.chance(0.5) ? 'cage' : 'crate', hx + 1, fy, { item: randomItem(rng) });
      }
      scene('enemyflag', x + len - 2, g);
      sprinkleEnemies(x + 1, x + len - 1, 0.5);
      return len;
    },
    temple: (x, maxW) => {
      const len = Math.min(maxW, rng.int(14, 18));
      if (len < 14) return build.flat(x, maxW);
      for (let i = 0; i < len; i++) ground(x + i, g);
      const tiers = 4;
      for (let k = 0; k < tiers; k++) {
        const y1 = g - 1 - k * 2;
        fill(x + 1 + k * 2, y1 - 1, x + len - 2 - k * 2, y1, T.BRICK);
      }
      // inner chamber with entrances on both sides
      fill(x + 4, g - 4, x + len - 5, g - 1, T.EMPTY);
      setBack(x + 4, g - 4, x + len - 5, g - 1, 2);
      fill(x + 1, g - 2, x + 4, g - 1, T.EMPTY);
      fill(x + len - 5, g - 2, x + len - 2, g - 1, T.EMPTY);
      setBack(x + 1, g - 2, x + len - 2, g - 1, 2);
      const topY = g - 1 - (tiers - 1) * 2 - 1;
      scene('statue', x + Math.floor(len / 2), topY);
      scene('enemyflag', x + 1 + (tiers - 1) * 2, topY);
      enemyAt(x + 6, g);
      enemyAt(x + len - 7, g);
      enemyAt(x + Math.floor(len / 2) + 2, topY);
      propAt('cage', x + Math.floor(len / 2), g);
      if (rng.chance(0.5)) propAt('barrel', x + 5, g);
      return len;
    },
    ruin: (x, maxW) => {
      const len = Math.min(maxW, rng.int(10, 14));
      if (len < 10) return build.flat(x, maxW);
      for (let i = 0; i < len; i++) ground(x + i, g);
      const floors = rng.int(2, 3);
      const l = x + 1;
      const r = x + len - 2;
      const topRow = g - floors * 4;
      fill(l, topRow, l, g - 1, T.BRICK);
      fill(r, topRow, r, g - 1, T.BRICK);
      fill(l, g - 2, l, g - 1, T.EMPTY);
      fill(r, g - 2, r, g - 1, T.EMPTY);
      setBack(l, topRow, r, g - 1, 2);
      for (let f = 1; f <= floors; f++) {
        const fy = g - f * 4;
        fill(l, fy, r, fy, T.BRICK);
        const hole = rng.int(l + 2, r - 3);
        fill(hole, fy, hole + 1, fy, T.EMPTY);
        fill(hole, fy, hole, fy + 3, T.LADDER);
        for (let wx = l + 1; wx < r; wx += 3) back[(fy + 2) * W + wx] = 3;
        if (f < floors || rng.chance(0.5)) enemyAt(rng.int(l + 1, r - 1), fy);
        // windows in the outer walls
        fill(l, fy - 2, l, fy - 2, T.EMPTY);
        fill(r, fy - 2, r, fy - 2, T.EMPTY);
      }
      // broken top
      for (let cx = l; cx <= r; cx++) if (rng.chance(0.35)) fill(cx, topRow, cx, topRow, T.EMPTY);
      enemyAt(l + 2, g);
      if (rng.chance(0.5)) propAt('crate', r - 2, g, { item: randomItem(rng) });
      scene('lamp', x, g);
      scene('enemyflag', r - 1, topRow);
      return len;
    },
    scaffold: (x, maxW) => {
      const len = Math.min(maxW, rng.int(12, 16));
      if (len < 12) return build.flat(x, maxW);
      for (let i = 0; i < len; i++) ground(x + i, g);
      const levels = rng.int(2, 3);
      for (let k = 1; k <= levels; k++) {
        const y = g - k * 4;
        const a = x + 1 + (k % 2) * 2;
        const b = x + len - 2 - ((k + 1) % 2) * 2;
        fill(a, y, b, y, T.PLATFORM);
        for (let px = a; px <= b; px += 4) scenery.push({ type: 'girder', x: px * TILE + 8, y: g * TILE, flip: false, h: (g - y) * TILE });
        fill(k % 2 ? b : a, y, k % 2 ? b : a, y + 3, T.LADDER);
        enemyAt(rng.int(a + 1, b - 1), y);
        if (rng.chance(0.5)) propAt('barrel', rng.int(a, b), y);
      }
      scene('tank', x + Math.floor(len / 2), g);
      scene('pipe', x + 1, g);
      return len;
    },
    bridge: (x, maxW) => {
      const gap = rng.int(6, 9);
      const len = gap + 4;
      if (len > maxW) return build.flat(x, maxW);
      ground(x, g);
      ground(x + 1, g);
      ground(x + 2 + gap, g);
      ground(x + 3 + gap, g);
      for (let i = 0; i < gap; i++) grid.init(x + 2 + i, g, rng.chance(0.2) ? T.CRUMBLE : T.PLATFORM);
      scene('rope', x + 1, g);
      scene('rope', x + 2 + gap, g);
      if (rng.chance(0.5)) enemyAt(x + 2 + Math.floor(gap / 2), g);
      return len;
    },
    islands: (x, maxW) => {
      const len = Math.min(maxW, rng.int(13, 17));
      if (len < 12) return build.flat(x, maxW);
      ground(x, g);
      ground(x + 1, g);
      ground(x + len - 2, g);
      ground(x + len - 1, g);
      let ix = x + 3;
      while (ix + 3 < x + len - 2) {
        const w = rng.int(3, 4);
        const iy = clampG(g - rng.int(1, 4));
        island(ix, iy, w);
        if (rng.chance(0.4)) enemyAt(ix + 1, iy);
        ix += w + rng.int(1, 2);
      }
      return len;
    },
    cliff: (x, maxW) => {
      const len = Math.min(maxW, rng.int(9, 12));
      if (len < 9) return build.flat(x, maxW);
      const up = g - 4 >= MIN_G;
      const g2 = up ? g - 4 : Math.min(MAX_G, g + 4);
      for (let i = 0; i < 3; i++) ground(x + i, g);
      for (let i = 3; i < len; i++) ground(x + i, g2);
      const face = up ? x + 3 : x + 2;
      const hi = Math.min(g, g2);
      const lo = Math.max(g, g2);
      for (let y = hi; y < lo + 2 && y < H - 1; y++) grid.init(face, y, T.STONE);
      fill(up ? face - 1 : face + 1, hi, up ? face - 1 : face + 1, lo - 1, T.LADDER);
      g = g2;
      sprinkleEnemies(x + 4, x + len - 1, 0.8);
      if (rng.chance(0.4)) propAt('barrel', x + len - 2, g);
      return len;
    },
    camp: (x, maxW) => {
      // enemy camp around a fire: tents or crates, a flag, a few guards warming up
      const len = Math.min(maxW, rng.int(13, 16));
      if (len < 12) return build.flat(x, maxW);
      for (let i = 0; i < len; i++) ground(x + i, g);
      const mid = x + Math.floor(len / 2);
      scene('campfire', mid, g);
      const shelter = biome === 'desert' || biome === 'jungle' ? 'tent' : biome === 'snow' ? 'log_pile' : biome === 'volcano' ? 'skullpile' : 'barrel_stack';
      scene(shelter, x + 3, g);
      const deco: Record<string, string[]> = {
        snow: ['tent', 'radar', 'snowman'],
        city: ['barrier', 'trashcan', 'car'],
        industrial: ['generator', 'spool', 'warnsign'],
        volcano: ['brazier', 'lavarock'],
      };
      scene(rng.pick(deco[biome] ?? ['log_pile', 'crate_stack', 'bush']), x + len - 4, g);
      scene('enemyflag', x + len - 2, g);
      grid.init(x + 1, g - 1, T.SANDBAG);
      grid.init(x + len - 2, g - 1, T.SANDBAG);
      enemyAt(mid - 2, g);
      enemyAt(mid + 2, g);
      if (rng.chance(0.5)) enemyAt(mid + 3, g, plan.enemyTypes.includes('dog') ? 'dog' : 'grunt');
      propAt('crate', x + len - 3, g, { item: randomItem(rng) });
      if (rng.chance(0.5)) propAt('barrel', x + 5, g);
      if (rng.chance(mut === 'prison' ? 0.8 : 0.3)) propAt('cage', mid + 4, g);
      return len;
    },
    trench: (x, maxW) => {
      // dug-in line: a 2-deep trench with sandbags on the lip and soldiers inside
      const len = Math.min(maxW, rng.int(12, 16));
      if (len < 10) return build.flat(x, maxW);
      const t0 = x + 2;
      const t1 = x + len - 3;
      for (let i = 0; i < len; i++) {
        const cx = x + i;
        if (cx >= t0 && cx <= t1) {
          ground(cx, g + 2);
          setBack(cx, g, cx, g + 1, 1);
        } else ground(cx, g);
      }
      grid.init(t0 - 1, g - 1, T.SANDBAG);
      grid.init(t1 + 1, g - 1, T.SANDBAG);
      // a plank across the middle
      const mid = Math.floor((t0 + t1) / 2);
      if (rng.chance(0.6)) fill(mid - 1, g, mid, g, T.PLATFORM);
      const n = rng.int(2, 3);
      for (let k = 0; k < n; k++) enemyAt(rng.int(t0, t1), g + 2, k === 0 && plan.enemyTypes.includes('shield') ? 'shield' : undefined);
      if (rng.chance(0.5)) propAt('crate', t1, g + 2, { item: randomItem(rng) });
      if (rng.chance(0.4)) propAt('barrel', t0, g + 2);
      if (rng.chance(plan.trapRate)) propAt('mine', t1 + 2, g);
      scene(biome === 'city' ? 'barrier' : biome === 'industrial' ? 'warnsign' : 'sign', t0 - 2, g);
      return len;
    },
    crater: (x, maxW) => {
      // shelled ground: two craters, wreckage in between
      const len = Math.min(maxW, rng.int(11, 14));
      if (len < 10) return build.flat(x, maxW);
      const prof = [0, 1, 2, 2, 1, 0];
      for (let i = 0; i < len; i++) {
        const a = i - 1;
        const b = i - (len - 7);
        const d = a >= 0 && a < prof.length ? prof[a] : b >= 0 && b < prof.length ? prof[b] : 0;
        ground(x + i, Math.min(MAX_G + 1, g + d));
      }
      const wreck: Record<string, string[]> = {
        volcano: ['lavarock', 'skullpile'],
        snow: ['jeep_wreck', 'ice_crystal'],
        city: ['rubble', 'car'],
      };
      scene(rng.pick(wreck[biome] ?? ['jeep_wreck', 'rubble', 'bones']), x + Math.floor(len / 2), g);
      sprinkleEnemies(x + 1, x + len - 1, 0.8);
      if (rng.chance(plan.trapRate + 0.2)) propAt('mine', x + 3, surfY(x + 3));
      if (rng.chance(0.4)) propAt('crate', x + len - 4, surfY(x + len - 4), { item: randomItem(rng) });
      return len;
    },
    outpost: (x, maxW) => {
      // fenced compound: raised wooden deck with a lookout, radio mast or water tower, generator
      const len = Math.min(maxW, rng.int(14, 17));
      if (len < 14) return build.flat(x, maxW);
      for (let i = 0; i < len; i++) ground(x + i, g);
      fill(x + 1, g - 2, x + 1, g - 1, T.SANDBAG);
      grid.init(x + len - 2, g - 1, T.SANDBAG);
      const d0 = x + 5;
      const d1 = x + 10;
      const dy = g - 4;
      fill(d0, dy, d1, dy, T.PLATFORM);
      fill(d0 - 1, dy, d0 - 1, g - 1, T.LADDER);
      grid.init(d1, dy - 1, T.SANDBAG);
      scenery.push({ type: 'post', x: d0 * TILE + 8, y: g * TILE, flip: false, h: (g - dy) * TILE });
      scenery.push({ type: 'post', x: d1 * TILE + 8, y: g * TILE, flip: false, h: (g - dy) * TILE });
      scene(biome === 'desert' || biome === 'industrial' ? 'watertower' : 'radio_tower', x + len - 4, g);
      scene(biome === 'snow' ? 'radar' : 'generator', x + 3, g);
      enemyAt(d0 + 2, dy, plan.enemyTypes.includes('sniper') && rng.chance(0.5) ? 'sniper' : 'grunt');
      if (rng.chance(0.5)) enemyAt(d1 - 1, dy);
      enemyAt(x + 3, g);
      enemyAt(x + len - 4, g, plan.enemyTypes.includes('heavy') && rng.chance(0.3) ? 'heavy' : undefined);
      propAt('crate', d0 + 3, g, { item: randomItem(rng) });
      if (rng.chance(0.5)) propAt('barrel', x + 12, g);
      if (rng.chance(mut === 'prison' ? 0.7 : 0.25)) propAt('cage', d0 + 1, g);
      return len;
    },
  };

  /** floating island: grassy dirt on top, tapering rock underneath, anchored core */
  const island = (x0: number, y: number, w: number) => {
    for (let i = 0; i < w; i++) {
      grid.init(x0 + i, y, T.DIRT);
      grid.init(x0 + i, y + 1, T.DIRT);
    }
    for (let i = 1; i < w - 1; i++) grid.init(x0 + i, y + 2, i === 1 || i === w - 2 ? T.DIRT : T.STONE);
    for (let i = 2; i < w - 2; i++) grid.init(x0 + i, y + 3, T.STONE);
    grid.markAnchor(x0 + Math.floor(w / 2), y + 1);
  };

  /** last section: a high-rise and a staircase of floating islands up to the chopper on the roof */
  const buildSkyFinale = (x0: number) => {
    for (let cx = x0; cx < W; cx++) ground(cx, g);
    const tw = 9;
    const tx0 = W - tw - 3;
    const tx1 = tx0 + tw - 1;
    const top = 8; // roof row: the hovering chopper stays on screen
    const floors: number[] = [];
    for (let fy = g - 4; fy - 4 >= top; fy -= 4) floors.push(fy);
    const lastFloor = floors.length ? floors[floors.length - 1] : g;
    // shell
    fill(tx0, top, tx0, g - 1, T.BRICK);
    fill(tx1, top, tx1, g - 1, T.BRICK);
    setBack(tx0, top, tx1, g - 1, 2);
    fill(tx0, g - 2, tx0, g - 1, T.EMPTY);
    fill(tx1, g - 2, tx1, g - 1, T.EMPTY);
    floors.forEach((fy, k) => {
      fill(tx0, fy, tx1, fy, T.BRICK);
      const hole = k % 2 === 0 ? tx1 - 2 : tx0 + 1;
      fill(hole, fy, hole + 1, fy, T.EMPTY);
      fill(hole, fy, hole, fy + 3, T.LADDER);
      for (const wx of [tx0 + 2, tx0 + 5]) back[(fy - 2) * W + wx] = 3;
      fill(tx0, fy - 2, tx0, fy - 2, T.EMPTY); // gun slits
      fill(tx1, fy - 2, tx1, fy - 2, T.EMPTY);
      const types: EnemyType[] = k < 2 ? ['grunt'] : ['grunt', 'sniper', 'heavy', 'shield'].filter((t) => plan.enemyTypes.includes(t as EnemyType)) as EnemyType[];
      enemyAt(rng.int(tx0 + 2, tx1 - 2), fy, rng.pick(types.length ? types : ['grunt']));
      if (rng.chance(0.5)) enemyAt(rng.int(tx0 + 2, tx1 - 2), fy);
      if (rng.chance(0.35)) propAt('barrel', rng.int(tx0 + 2, tx1 - 2), fy);
    });
    enemyAt(tx0 + 3, g);
    // roof with a hatch from the top floor
    fill(tx0 - 1, top, tx1 + 1, top, T.BRICK);
    const hatch = floors.length % 2 === 0 ? tx1 - 2 : tx0 + 1;
    fill(hatch, top, hatch, lastFloor - 1, T.LADDER);
    grid.init(tx0 - 1, top - 1, T.SANDBAG);
    grid.init(tx1 + 1, top - 1, T.SANDBAG);
    scene('enemyflag', tx1, top);
    enemyAt(tx0 + 2, top, plan.enemyTypes.includes('sniper') ? 'sniper' : 'grunt');
    props.push({ type: 'exit', variant: 'chopper', x: (tx0 + 4) * TILE - 4, y: top * TILE - 48, w: 24, h: 48 });
    // floating islands climbing towards the roof (an alternative, riskier route)
    let ix = x0 + 2;
    let iy = g - 4;
    let lastIsland: [number, number, number] | null = null;
    while (iy > top + 1 && ix < tx0 - 6) {
      const w = rng.int(4, 6);
      island(ix, iy, w);
      if (rng.chance(0.55)) enemyAt(ix + Math.floor(w / 2), iy, rng.chance(0.25) && plan.enemyTypes.includes('dog') ? 'dog' : 'grunt');
      if (rng.chance(0.25)) propAt(rng.chance(0.5) ? 'crate' : 'barrel', ix + 1, iy, { item: randomItem(rng) });
      if (rng.chance(0.3)) scene(biome === 'snow' ? 'pine_small' : biome === 'desert' ? 'cactus' : biome === 'city' || biome === 'industrial' ? 'lamp' : 'palm', ix + w - 2, iy);
      lastIsland = [ix, iy, w];
      ix += w + rng.int(1, 2);
      iy -= rng.int(2, 3);
    }
    // bridge from the highest island over to the roof
    if (lastIsland) {
      const [lx, ly, lw] = lastIsland;
      const by = Math.max(top, ly);
      fill(lx + lw, by, tx0 - 2, by, T.PLATFORM);
      if (by > top) fill(tx0 - 2, top, tx0 - 2, by - 1, T.LADDER);
    }
    // a drone or two guarding the sky
    if (plan.enemyTypes.includes('drone')) enemyAt(x0 + 14, top + 2, 'drone');
  };

  // ---------- assemble ----------
  const startLen = 8;
  for (let i = 0; i < startLen; i++) ground(i, g);
  const spawn = { x: 3 * TILE, y: (g - 1) * TILE - 4 };
  propAt('crate', 6, g, { item: 'grenade' });

  const runEnd = plan.isBoss ? plan.lengthTiles - 4 : plan.skyExit ? W - FINALE : W - 12;
  let x = startLen;
  const weights: [Chunk, number][] = [
    ['flat', 2.2],
    ['pit', 2],
    ['bunker', 2.6],
    ['tower', 1.5],
    ['hill', 2.2],
    ['cave', 1.8],
    ['platforms', 1],
    ['traps', plan.trapRate * 6],
    ['acid', plan.trapRate * 3],
    ['village', biome === 'jungle' || biome === 'desert' || biome === 'snow' ? 2 : 0],
    ['temple', biome === 'jungle' || biome === 'desert' || biome === 'volcano' ? (levelNo >= 2 ? 1.2 : 0.5) : 0],
    ['ruin', biome === 'city' ? 3 : biome === 'snow' ? 0.6 : 0],
    ['scaffold', biome === 'industrial' ? 3 : biome === 'city' ? 0.8 : 0],
    ['bridge', biome === 'jungle' || biome === 'snow' || biome === 'volcano' ? 1.2 : 0.5],
    ['cliff', 1.8],
    ['islands', plan.skyExit ? 1.6 : 0.8],
    ['camp', levelNo >= 2 ? 1.4 : 0.6],
    ['trench', levelNo >= 2 ? 1.3 : 0.4],
    ['crater', 1.2],
    ['outpost', levelNo >= 3 ? 1.2 : 0.3],
  ];
  // every level gets its own mix: some are bunker-heavy, others caves and cliffs
  for (const w of weights) w[1] *= rng.range(0.35, 1.65);
  const boost = (names: Chunk[], f: number) => {
    for (const w of weights) if (names.includes(w[0])) w[1] *= f;
  };
  if (mut === 'outposts') boost(['bunker', 'trench', 'outpost', 'tower'], 2.5);
  if (mut === 'wilds') {
    boost(['hill', 'cliff', 'cave', 'islands', 'bridge', 'pit'], 1.8);
    boost(['bunker', 'outpost', 'camp'], 0.3);
  }
  if (mut === 'minefield') boost(['traps', 'crater'], 2);
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
    const floor = (plan.bossType === 'drill' ? 12 : 14) + OFF;
    for (let i = 0; i < arenaW; i++) ground(a0 + i, floor);
    const doorCol = a0 - 1;
    // metal wall above a 3-tile door; rows g-3..g-1 get sealed when the fight starts
    fill(doorCol, 0, doorCol, g - 4, T.METAL);
    arena = { x0: a0 * TILE, x1: (a0 + arenaW) * TILE, doorCol, floorRow: g };
    pickups.push({ item: 'rocket', x: (a0 - 5) * TILE, y: (g - 1) * TILE });
    pickups.push({ item: 'armor', x: (a0 - 7) * TILE, y: (g - 1) * TILE });
  } else if (plan.skyExit) {
    buildSkyFinale(x);
  } else {
    for (; x < W; x++) ground(x, g);
    // extraction vehicle: everybody has to get on board
    const vehicle = rng.weighted<string>([
      ['chopper', 3],
      ['truck', biome === 'snow' || biome === 'volcano' ? 0.5 : 2.5],
      ['plane', biome === 'desert' || biome === 'snow' || biome === 'industrial' ? 2 : 0.6],
    ]);
    if (vehicle === 'truck') props.push({ type: 'exit', variant: 'truck', x: (W - 9) * TILE, y: g * TILE - 30, w: 64, h: 30 });
    else if (vehicle === 'plane') props.push({ type: 'exit', variant: 'plane', x: (W - 11) * TILE, y: g * TILE - 44, w: 128, h: 44 });
    else propAt('exit', W - 6, g, { variant: 'chopper' });
  }

  // ---------- post passes: rock strata, caves, scenery ----------
  const startX = 10;
  const endX = plan.isBoss ? plan.lengthTiles - 6 : W - 14;
  const surfaceOf = (cx: number) => {
    for (let y = 0; y < H; y++) if (grid.get(cx, y) === T.DIRT) return y;
    return -1;
  };
  // value noise on a 5-tile lattice
  const lat = new Map<number, number>();
  const lv = (ix: number, iy: number) => {
    const k = ix * 977 + iy;
    if (!lat.has(k)) lat.set(k, rng.next());
    return lat.get(k)!;
  };
  const noise = (x: number, y: number) => {
    const fx = x / 5;
    const fy = y / 4;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    return lv(ix, iy) * (1 - tx) * (1 - ty) + lv(ix + 1, iy) * tx * (1 - ty) + lv(ix, iy + 1) * (1 - tx) * ty + lv(ix + 1, iy + 1) * tx * ty;
  };
  for (let cx = 0; cx < W; cx++) {
    const s0 = surfaceOf(cx);
    if (s0 < 0) continue;
    for (let y = s0 + 2; y < H - 1; y++) {
      if (grid.get(cx, y) !== T.DIRT) continue;
      const depth = (y - s0) / (H - s0);
      if (noise(cx, y) + depth * 0.3 > 0.86) grid.init(cx, y, T.STONE);
    }
  }
  // underground tunnels with a ladder shaft down from the surface
  const caves = Math.floor((endX - startX) / 38) + 1;
  for (let c = 0; c < caves; c++) {
    let cx = rng.int(startX + 4, Math.max(startX + 5, endX - 20));
    const s0 = surfaceOf(cx);
    if (s0 < 0 || s0 + 4 > H - 3) continue;
    let cy = rng.int(s0 + 3, H - 3);
    const len = rng.int(10, 18);
    const shaftX = cx;
    for (let y = s0; y < cy; y++) {
      if (grid.get(shaftX, y) === T.DIRT || grid.get(shaftX, y) === T.STONE) grid.init(shaftX, y, T.LADDER);
      back[y * W + shaftX] = 1;
    }
    for (let i = 0; i < len && cx < endX; i++, cx++) {
      if (i > 2 && rng.chance(0.25)) cy = Math.max(surfaceOf(cx) + 3, Math.min(H - 3, cy + rng.pick([-1, 1])));
      for (const yy of [cy - 1, cy]) {
        const t = grid.get(cx, yy);
        if (t === T.DIRT || t === T.STONE) grid.init(cx, yy, T.EMPTY);
        if (yy >= 0) back[yy * W + cx] = 1;
      }
      if (i === Math.floor(len / 2)) enemyAt(cx, cy + 1, 'grunt');
      if (i === len - 2) propAt(rng.chance(0.5) ? 'cage' : 'crate', cx, cy + 1, { item: randomItem(rng) });
      if (i === 4 && rng.chance(0.5)) propAt('barrel', cx, cy + 1);
    }
    // exit shaft back up so tunnels never dead-end
    const ex = cx - 1;
    const es = surfaceOf(ex);
    if (es >= 0) {
      for (let y = es; y < cy; y++) {
        if (grid.get(ex, y) === T.DIRT || grid.get(ex, y) === T.STONE || grid.get(ex, y) === T.EMPTY) grid.init(ex, y, T.LADDER);
        back[y * W + ex] = 1;
      }
    }
  }
  // trees and other scenery on open ground
  const sceneryFor: Record<string, [string, number][]> = {
    jungle: [['palm', 3], ['jungletree', 2], ['fern', 3], ['totem', 0.4], ['bamboo', 2], ['bush', 2.5], ['flowers', 2], ['mossrock', 1.2], ['stump', 0.8], ['log_pile', 0.5], ['jeep_wreck', 0.3], ['campfire', 0.25]],
    desert: [['palm', 1], ['cactus', 3], ['bones', 1], ['tent', 0.8], ['boulder', 1.5], ['skull_cow', 1], ['tumbleweed', 1.5], ['well', 0.4], ['obelisk', 0.4], ['jeep_wreck', 0.5], ['watertower', 0.25], ['bush', 0.5]],
    snow: [['pine', 4], ['pine_small', 2], ['bones', 0.3], ['snowman', 0.5], ['ice_crystal', 1.5], ['log_pile', 1], ['boulder', 1.2], ['radar', 0.35], ['stump', 0.6], ['jeep_wreck', 0.3], ['campfire', 0.3]],
    city: [['lamp', 2], ['car', 1], ['deadtree', 1], ['sign', 0.6], ['hydrant', 0.6], ['trashcan', 1.2], ['cone', 1], ['barrier', 0.8], ['billboard', 0.5], ['phonebooth', 0.5], ['rubble', 1.5], ['jeep_wreck', 0.4]],
    industrial: [['pipe', 2], ['tank', 1], ['lamp', 1.5], ['crate_stack', 1], ['barrel_stack', 1.2], ['generator', 0.8], ['spool', 1], ['warnsign', 1], ['vent', 1], ['cone', 0.6], ['watertower', 0.3], ['radio_tower', 0.25]],
    volcano: [['deadtree', 3], ['bones', 1.5], ['totem', 1], ['spire', 1], ['lavarock', 2], ['obsidian', 1.2], ['skullpile', 0.8], ['stump', 1], ['brazier', 0.5], ['boulder', 1]],
  };
  // a different mood every level: dense or sparse, leaning to some kinds of trees and junk
  const opts = (sceneryFor[biome] ?? sceneryFor.jungle).map(([t, w]) => [t, w * rng.range(0.15, 1.85)] as [string, number]);
  const density = rng.range(0.14, 0.34);
  let lastScene = -10;
  for (let cx = 3; cx < W - 3; cx++) {
    if (cx - lastScene < 3) continue;
    const sr = grid.surfaceRow(cx);
    if (sr < 3 || grid.get(cx, sr) !== T.DIRT) continue;
    if (grid.get(cx, sr - 1) !== T.EMPTY || grid.get(cx, sr - 2) !== T.EMPTY || grid.get(cx, sr - 3) !== T.EMPTY) continue;
    if (!rng.chance(density)) continue;
    scene(rng.weighted(opts), cx, sr);
    lastScene = cx;
  }

  return { plan, grid, back, spawn, enemies, props, pickups, scenery, arena };
}



export function randomItem(rng: Rng): ItemId {
  return rng.weighted<ItemId>([
    ['shotgun', 2], ['flamer', 1.5], ['rocket', 1.5], ['minigun', 1.2],
    ['grenade', 2], ['c4', 1.2],
    ['armor', 1], ['speed', 0.8], ['life', 0.5], ['ammo', 1.5], ['health', 1.5],
  ]);
}
