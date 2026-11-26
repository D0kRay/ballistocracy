import { BOSS_EVERY } from '../config';
import { Rng } from '../core/rng';
import { BIOMES, type BiomeId } from '../world/biomes';

export type BossType = 'tank' | 'gunship' | 'drill';
export type TimeOfDay = 'day' | 'dusk' | 'night';
export type EnemyType = 'grunt' | 'shield' | 'sniper' | 'bomber' | 'dog' | 'drone' | 'heavy';

export interface LevelPlan {
  level: number;
  seed: number;
  biome: BiomeId;
  isBoss: boolean;
  bossType: BossType | null;
  lengthTiles: number;
  targetSec: number;
  enemyTypes: EnemyType[];
  enemyDensity: number; // enemies per chunk (avg)
  trapRate: number; // 0..1
  tod: TimeOfDay;
  name?: string; // set for hand-made levels
  height: number; // tiles
  skyExit: boolean; // finale: climb a high-rise / floating islands to a chopper on the roof
  mutator: Mutator | null; // a twist that makes this level play differently
}

/** level twists, rolled per level so runs through the campaign feel different */
export type Mutator = 'ambush' | 'armory' | 'minefield' | 'prison' | 'dogpack' | 'snipers' | 'demolition' | 'skypatrol' | 'outposts' | 'wilds';

export const MUTATORS: Record<Mutator, { name: string; sub: string; minLevel: number }> = {
  ambush: { name: 'AMBUSH', sub: 'THEY KNOW YOU ARE COMING', minLevel: 2 },
  armory: { name: 'ARMORY RAID', sub: 'WEAPON CRATES EVERYWHERE', minLevel: 2 },
  minefield: { name: 'MINEFIELD', sub: 'WATCH YOUR STEP', minLevel: 3 },
  prison: { name: 'PRISON CAMP', sub: 'FREE THE PRISONERS', minLevel: 2 },
  dogpack: { name: 'DOG PACK', sub: 'SOMETHING IS HOWLING', minLevel: 2 },
  snipers: { name: 'SNIPER ALLEY', sub: 'STAY OUT OF THE RED LASERS', minLevel: 4 },
  demolition: { name: 'DEMOLITION ZONE', sub: 'BARRELS. SO MANY BARRELS.', minLevel: 2 },
  skypatrol: { name: 'SKY PATROL', sub: 'DRONES OVERHEAD', minLevel: 6 },
  outposts: { name: 'FORTIFIED LINE', sub: 'BUNKERS AND TRENCHES AHEAD', minLevel: 3 },
  wilds: { name: 'DEEP WILDS', sub: 'FEW GUARDS, ROUGH TERRAIN', minLevel: 2 },
};

/** fixed choices for hand-picked levels (tools, editor); everything else is rolled from the seed */
export interface PlanOverrides {
  biome?: BiomeId;
  tod?: TimeOfDay;
  skyExit?: boolean;
  mutator?: Mutator | null;
}

export const BOSS_ORDER: readonly BossType[] = ['tank', 'gunship', 'drill'];

/**
 * Early levels are short so players reach the exit fast. The exit moves further
 * away with every level AND with the total time already played.
 */
export function targetSeconds(level: number, totalPlaySec: number): number {
  return Math.min(360, 25 + 14 * (level - 1) + 0.04 * totalPlaySec);
}

export function planLevel(level: number, seed: number, totalPlaySec: number, ov: PlanOverrides = {}): LevelPlan {
  const rng = new Rng(seed ^ 0x9e3779b9);
  const isBoss = level % BOSS_EVERY === 0;
  const bossType = isBoss ? BOSS_ORDER[(level / BOSS_EVERY - 1) % BOSS_ORDER.length] : null;
  const targetSec = targetSeconds(level, totalPlaySec);
  // ~2.6 tiles of progress per second including fighting
  const lengthTiles = isBoss ? 72 : Math.max(64, Math.min(900, Math.round(targetSec * 2.6)));

  const types: EnemyType[] = ['grunt'];
  if (level >= 2) types.push('dog');
  if (level >= 3) types.push('shield', 'bomber');
  if (level >= 4) types.push('sniper');
  if (level >= 6) types.push('drone');
  if (level >= 7) types.push('heavy');

  // level 1 starts in a random biome too, but always in daylight or at dusk
  const rolled = rng.pick(BIOMES).id;
  const biome = ov.biome ?? rolled;
  const plan: LevelPlan = {
    level,
    seed,
    biome,
    isBoss,
    bossType,
    lengthTiles,
    targetSec,
    enemyTypes: types,
    enemyDensity: Math.min(4.5, 0.9 + level * 0.28),
    trapRate: Math.min(0.75, 0.08 + level * 0.06),
    height: 20,
    skyExit: false,
    mutator: null,
    tod: rng.weighted<TimeOfDay>(
      level === 1
        ? [['day', 3], ['dusk', 1]]
        : biome === 'city' || biome === 'volcano' ? [['day', 1], ['dusk', 2], ['night', 3]] : [['day', 3], ['dusk', 2], ['night', 1.5]],
    ),
  };
  if (ov.tod) plan.tod = ov.tod;
  const sky = !isBoss && level >= 2 && rng.chance(0.45);
  if (ov.skyExit ?? sky) {
    plan.skyExit = !isBoss;
    plan.height = isBoss ? 20 : 34;
  }
  // a twist on roughly 60% of the normal levels from level 2 on
  const pool = (Object.keys(MUTATORS) as Mutator[]).filter((m) => level >= MUTATORS[m].minLevel);
  const roll = !isBoss && pool.length && rng.chance(0.6) ? rng.pick(pool) : null;
  plan.mutator = ov.mutator !== undefined ? ov.mutator : roll;
  if (plan.mutator === 'ambush') plan.enemyDensity *= 1.5;
  if (plan.mutator === 'wilds') plan.enemyDensity *= 0.6;
  if (plan.mutator === 'minefield') plan.trapRate = Math.min(0.9, plan.trapRate + 0.3);
  if (plan.mutator === 'dogpack' && !types.includes('dog')) types.push('dog');
  if (plan.mutator === 'snipers' && !types.includes('sniper')) types.push('sniper');
  if (plan.mutator === 'skypatrol' && !types.includes('drone')) types.push('drone');
  return plan;
}
