import { LEVEL_H_TILES, TILE, VIEW_W } from '../config';
import type { BossType, EnemyType, LevelPlan, TimeOfDay } from '../progress/difficulty';
import { BIOMES, type BiomeId } from './biomes';
import { Grid } from './Grid';
import type { ItemId, Level, PropSpawn, PropType } from './LevelGen';
import { T, isSolid, isOneWay } from './tiles';

/*
 * Hand-made level file format (JSON). Coordinates are in tiles (16 px).
 * Entities "stand on" the tile row given as y, i.e. y is the ground row below them.
 * Drones use y as the row they hover in.
 *
 * tiles: 20 strings (top to bottom), one char per column:
 *   .=empty d=dirt s=stone b=block/brick w=wood m=metal(indestructible) x=bedrock
 *   l=ladder g=sandbag p=platform(one-way) c=crumbling platform
 * back (optional): .=sky d=earth wall s=stone wall W=stone wall with window w=wood wall
 */

export const LEVEL_FORMAT = 'ballistocracy-level';
export const LEVEL_VERSION = 1;
export const ARENA_W = Math.round(VIEW_W / TILE);

export const TILE_CHARS: Record<string, number> = {
  '.': T.EMPTY, d: T.DIRT, s: T.STONE, b: T.BRICK, w: T.WOOD, m: T.METAL, x: T.BEDROCK,
  l: T.LADDER, g: T.SANDBAG, p: T.PLATFORM, c: T.CRUMBLE,
};
export const BACK_CHARS: Record<string, number> = { '.': 0, d: 1, s: 2, W: 3, w: 4 };

export const ENEMY_TYPES: readonly EnemyType[] = ['grunt', 'shield', 'sniper', 'bomber', 'dog', 'drone', 'heavy'];
export const PROP_TYPES: readonly PropType[] = ['crate', 'barrel', 'cage', 'mine', 'spikes', 'flamejet', 'saw', 'acid', 'crusher'];
export const ITEMS: readonly ItemId[] = ['shotgun', 'flamer', 'rocket', 'minigun', 'grenade', 'c4', 'armor', 'speed', 'life', 'ammo', 'health'];
export const VEHICLES = ['chopper', 'truck', 'plane'] as const;
export const BOSSES: readonly BossType[] = ['tank', 'gunship', 'drill'];
export const SCENERY_TYPES = [
  'palm', 'jungletree', 'fern', 'totem', 'cactus', 'bones', 'tent', 'pine', 'pine_small', 'lamp', 'car', 'deadtree',
  'sign', 'hydrant', 'pipe', 'tank', 'crate_stack', 'spire', 'post', 'roof_thatch', 'roof_snow', 'roof_tent',
  'enemyflag', 'statue', 'girder', 'rope',
] as const;

export type LevelEntity =
  | { kind: 'enemy'; type: EnemyType; x: number; y: number }
  | { kind: 'prop'; type: PropType; x: number; y: number; item?: ItemId; x2?: number }
  | { kind: 'pickup'; item: ItemId; x: number; y: number }
  | { kind: 'scenery'; type: string; x: number; y: number; flip?: boolean; h?: number };

export interface LevelFile {
  format: typeof LEVEL_FORMAT;
  version: number;
  name: string;
  author: string;
  description?: string;
  biome: BiomeId;
  tod: TimeOfDay;
  width: number;
  height: number;
  tiles: string[];
  back?: string[];
  spawn: { x: number; y: number };
  exit: { x: number; y: number; vehicle: (typeof VEHICLES)[number] } | null;
  boss: { type: BossType } | null; // arena = the last ARENA_W columns
  entities: LevelEntity[];
}

const TOD: readonly TimeOfDay[] = ['day', 'dusk', 'night'];
const PROP_SIZE: Record<string, [number, number]> = {
  crate: [16, 16], barrel: [12, 16], cage: [16, 16], exit: [24, 48], mine: [10, 4],
  spikes: [16, 8], flamejet: [12, 6], saw: [16, 16], acid: [16, 12], crusher: [16, 16],
};

// ------------------------------------------------------------------ validation
export interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateLevel(raw: unknown): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (m: string) => errors.push(m);
  const d = raw as Partial<LevelFile>;
  if (!d || typeof d !== 'object') return { ok: false, errors: ['not an object'], warnings };
  if (d.format !== LEVEL_FORMAT) fail(`format must be "${LEVEL_FORMAT}"`);
  if (d.version !== LEVEL_VERSION) fail(`version must be ${LEVEL_VERSION}`);
  if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 40) fail('name: 1-40 characters');
  if (typeof d.author !== 'string' || d.author.length > 40) fail('author: up to 40 characters');
  if (!BIOMES.some((b) => b.id === d.biome)) fail(`biome must be one of ${BIOMES.map((b) => b.id).join(', ')}`);
  if (!TOD.includes(d.tod as TimeOfDay)) fail('tod must be day, dusk or night');
  const W = d.width ?? 0;
  if (!Number.isInteger(W) || W < 40 || W > 1000) fail('width: integer 40..1000');
  if (d.height !== LEVEL_H_TILES) fail(`height must be ${LEVEL_H_TILES}`);
  const rowsOk = (rows: unknown, chars: Record<string, number>, label: string) => {
    if (!Array.isArray(rows) || rows.length !== LEVEL_H_TILES) {
      fail(`${label}: needs ${LEVEL_H_TILES} rows`);
      return false;
    }
    let ok = true;
    rows.forEach((r, y) => {
      if (typeof r !== 'string' || r.length !== W) {
        fail(`${label}[${y}]: length must equal width (${W})`);
        ok = false;
        return;
      }
      const bad = [...r].find((ch) => !(ch in chars));
      if (bad !== undefined) {
        fail(`${label}[${y}]: unknown char "${bad}"`);
        ok = false;
      }
    });
    return ok;
  };
  const tilesOk = rowsOk(d.tiles, TILE_CHARS, 'tiles');
  if (d.back !== undefined) rowsOk(d.back, BACK_CHARS, 'back');
  if (errors.length) return { ok: false, errors, warnings };

  const tile = (x: number, y: number) => (x < 0 || x >= W ? T.METAL : y < 0 || y >= LEVEL_H_TILES ? T.EMPTY : TILE_CHARS[d.tiles![y][x]]);
  const standable = (x: number, y: number) => isSolid(tile(x, y)) || isOneWay(tile(x, y));
  const inB = (x: number, y: number) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x < W && y >= 0 && y <= LEVEL_H_TILES;

  const sp = d.spawn;
  if (!sp || !inB(sp.x, sp.y)) fail('spawn: missing or out of bounds');
  else {
    if (!standable(sp.x, sp.y)) fail('spawn: tile below the spawn point must be solid ground');
    if (tile(sp.x, sp.y - 1) !== T.EMPTY || tile(sp.x, sp.y - 2) !== T.EMPTY) fail('spawn: needs two free tiles above the ground');
  }
  const arena0 = W - ARENA_W;
  if (d.boss) {
    if (!BOSSES.includes(d.boss.type)) fail(`boss.type must be one of ${BOSSES.join(', ')}`);
    if (W < ARENA_W + 30) fail(`boss levels need width >= ${ARENA_W + 30}`);
    if (d.exit) warnings.push('boss levels spawn their own extraction; exit is ignored');
  } else {
    const ex = d.exit;
    if (!ex) fail('exit: required (or set a boss)');
    else {
      if (!VEHICLES.includes(ex.vehicle)) fail(`exit.vehicle must be one of ${VEHICLES.join(', ')}`);
      if (!inB(ex.x, ex.y)) fail('exit: out of bounds');
      else if (!standable(ex.x, ex.y)) fail('exit: must stand on ground');
      const span = ex.vehicle === 'plane' ? 8 : ex.vehicle === 'truck' ? 4 : 1;
      if (ex.x + span > W) fail('exit: vehicle does not fit inside the level');
    }
  }
  if (!Array.isArray(d.entities)) fail('entities: must be an array');
  else {
    if (d.entities.length > 800) fail('entities: at most 800');
    d.entities.forEach((e, i) => {
      const at = `entities[${i}]`;
      if (!e || typeof e !== 'object' || !inB(e.x, e.y)) {
        fail(`${at}: missing or out-of-bounds x/y`);
        return;
      }
      if (e.kind === 'enemy') {
        if (!ENEMY_TYPES.includes(e.type)) fail(`${at}: unknown enemy "${e.type}"`);
        if (d.boss && e.x >= arena0) warnings.push(`${at}: enemy inside the boss arena`);
      } else if (e.kind === 'prop') {
        if (!PROP_TYPES.includes(e.type)) fail(`${at}: unknown prop "${e.type}"`);
        if (e.item !== undefined && !ITEMS.includes(e.item)) fail(`${at}: unknown item "${e.item}"`);
        if (e.type === 'saw' && (e.x2 === undefined || e.x2 < e.x)) fail(`${at}: saw needs x2 >= x`);
      } else if (e.kind === 'pickup') {
        if (!ITEMS.includes(e.item)) fail(`${at}: unknown item "${e.item}"`);
      } else if (e.kind === 'scenery') {
        if (!(SCENERY_TYPES as readonly string[]).includes(e.type)) fail(`${at}: unknown scenery "${e.type}"`);
      } else fail(`${at}: unknown kind`);
      return;
    });
  }
  if (tilesOk) {
    let noFloor = 0;
    for (let x = 0; x < W; x++) if (tile(x, LEVEL_H_TILES - 1) !== T.BEDROCK && tile(x, LEVEL_H_TILES - 1) !== T.METAL) noFloor++;
    if (noFloor > W * 0.4) warnings.push(`${noFloor} columns have no bedrock floor (pits are fine, but players can dig through)`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ------------------------------------------------------------------ load
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** turn a (validated) level file into the runtime Level used by the simulation */
export function levelFromFile(f: LevelFile): Level {
  const W = f.width;
  const H = LEVEL_H_TILES;
  const grid = new Grid(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grid.init(x, y, TILE_CHARS[f.tiles[y][x]] ?? T.EMPTY);
  const back = new Uint8Array(W * H);
  if (f.back) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) back[y * W + x] = BACK_CHARS[f.back[y][x]] ?? 0;

  const plan: LevelPlan = {
    level: 0,
    seed: hashString(f.name + f.author) || 1,
    biome: f.biome,
    isBoss: !!f.boss,
    bossType: f.boss?.type ?? null,
    lengthTiles: f.boss ? W - ARENA_W : W,
    targetSec: 0,
    enemyTypes: [...ENEMY_TYPES],
    enemyDensity: 0,
    trapRate: 0,
    tod: f.tod,
    name: f.name,
  };
  const level: Level = {
    plan,
    grid,
    back,
    spawn: { x: f.spawn.x * TILE, y: (f.spawn.y - 1) * TILE - 4 },
    enemies: [],
    props: [],
    pickups: [],
    scenery: [],
    arena: null,
  };
  const prop = (type: PropType, col: number, row: number, extra: Partial<PropSpawn> = {}) => {
    const [w, h] = PROP_SIZE[type];
    level.props.push({ type, x: col * TILE + (TILE - w) / 2, y: row * TILE - h, w, h, ...extra });
  };
  for (const e of f.entities) {
    if (e.kind === 'enemy') level.enemies.push({ type: e.type, x: e.x * TILE + (e.type === 'drone' ? 2 : 3), y: e.type === 'drone' ? e.y * TILE : e.y * TILE - 14 });
    else if (e.kind === 'prop') prop(e.type, e.x, e.y, { item: e.item, x2: e.x2 !== undefined ? e.x2 * TILE : undefined });
    else if (e.kind === 'pickup') level.pickups.push({ item: e.item, x: e.x * TILE + 2, y: e.y * TILE - 12 });
    else if (e.kind === 'scenery') level.scenery.push({ type: e.type, x: e.x * TILE + 8, y: e.y * TILE, flip: !!e.flip, h: e.h !== undefined ? e.h * TILE : undefined });
  }
  if (f.boss) {
    const a0 = W - ARENA_W;
    const doorCol = a0 - 1;
    let floorRow = 12;
    for (let y = 0; y < H; y++) if (isSolid(grid.get(doorCol, y))) { floorRow = y; break; }
    level.arena = { x0: a0 * TILE, x1: W * TILE, doorCol, floorRow };
  } else if (f.exit) {
    const { x, y, vehicle } = f.exit;
    if (vehicle === 'truck') level.props.push({ type: 'exit', variant: 'truck', x: x * TILE, y: y * TILE - 30, w: 64, h: 30 });
    else if (vehicle === 'plane') level.props.push({ type: 'exit', variant: 'plane', x: x * TILE, y: y * TILE - 44, w: 128, h: 44 });
    else prop('exit', x, y, { variant: 'chopper' });
  }
  return level;
}

// ------------------------------------------------------------------ export
/** snapshot any runtime Level (e.g. a procedurally generated one) as an editable file */
export function levelToFile(level: Level, meta: { name: string; author: string }): LevelFile {
  const g = level.grid;
  const tileChar: Record<number, string> = {};
  for (const [ch, t] of Object.entries(TILE_CHARS)) tileChar[t] = ch;
  const backChar: Record<number, string> = {};
  for (const [ch, v] of Object.entries(BACK_CHARS)) backChar[v] = ch;
  const tiles: string[] = [];
  const back: string[] = [];
  for (let y = 0; y < g.h; y++) {
    let r = '';
    let b = '';
    for (let x = 0; x < g.w; x++) {
      r += tileChar[g.get(x, y)] ?? '.';
      b += backChar[level.back[y * g.w + x]] ?? '.';
    }
    tiles.push(r);
    back.push(b);
  }
  const entities: LevelEntity[] = [];
  for (const e of level.enemies) {
    entities.push(e.type === 'drone' ? { kind: 'enemy', type: e.type, x: Math.round((e.x - 2) / TILE), y: Math.round(e.y / TILE) } : { kind: 'enemy', type: e.type, x: Math.round((e.x - 3) / TILE), y: Math.round((e.y + 14) / TILE) });
  }
  let exit: LevelFile['exit'] = null;
  for (const p of level.props) {
    const row = Math.round((p.y + p.h) / TILE);
    if (p.type === 'exit') {
      const v = (p.variant ?? 'chopper') as (typeof VEHICLES)[number];
      exit = { vehicle: v, x: v === 'chopper' ? Math.round((p.x + p.w / 2 - 8) / TILE) : Math.round(p.x / TILE), y: row };
      continue;
    }
    const e: LevelEntity = { kind: 'prop', type: p.type, x: Math.round((p.x + p.w / 2 - 8) / TILE), y: row };
    if (p.item) e.item = p.item;
    if (p.type === 'saw') e.x2 = Math.round((p.x2 ?? p.x) / TILE);
    entities.push(e);
  }
  for (const p of level.pickups) entities.push({ kind: 'pickup', item: p.item, x: Math.round((p.x - 2) / TILE), y: Math.round((p.y + 12) / TILE) });
  for (const s of level.scenery) {
    const e: LevelEntity = { kind: 'scenery', type: s.type, x: Math.round(((s.x - 8) / TILE) * 4) / 4, y: Math.round(s.y / TILE) };
    if (s.flip) e.flip = true;
    if (s.h) e.h = s.h / TILE;
    entities.push(e);
  }
  for (const e of entities) {
    e.x = Math.max(0, Math.min(g.w - 1, e.x));
    e.y = Math.max(1, Math.min(g.h, e.y));
  }
  return {
    format: LEVEL_FORMAT,
    version: LEVEL_VERSION,
    name: meta.name,
    author: meta.author,
    biome: level.plan.biome,
    tod: level.plan.tod,
    width: g.w,
    height: g.h,
    tiles,
    back,
    spawn: { x: Math.round(level.spawn.x / TILE), y: Math.round((level.spawn.y + 4) / TILE) + 1 },
    exit: level.arena ? null : exit,
    boss: level.plan.bossType ? { type: level.plan.bossType } : null,
    entities,
  };
}

/** a small, valid starting point for the editor */
export function blankLevel(width = 80, biome: BiomeId = 'jungle'): LevelFile {
  const H = LEVEL_H_TILES;
  const g = 14;
  const tiles: string[] = [];
  const back: string[] = [];
  for (let y = 0; y < H; y++) {
    tiles.push(y < g ? '.'.repeat(width) : y === H - 1 ? 'x'.repeat(width) : 'd'.repeat(width));
    back.push(y > g ? 'd'.repeat(width) : '.'.repeat(width));
  }
  return {
    format: LEVEL_FORMAT, version: LEVEL_VERSION, name: 'NEW LEVEL', author: '', biome, tod: 'day',
    width, height: H, tiles, back, spawn: { x: 3, y: g }, exit: { x: width - 6, y: g, vehicle: 'chopper' }, boss: null, entities: [],
  };
}
