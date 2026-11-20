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
}

export const BOSS_ORDER: readonly BossType[] = ['tank', 'gunship', 'drill'];

/**
 * Early levels are short so players reach the exit fast. The exit moves further
 * away with every level AND with the total time already played.
 */
export function targetSeconds(level: number, totalPlaySec: number): number {
  return Math.min(360, 25 + 14 * (level - 1) + 0.04 * totalPlaySec);
}

export function planLevel(level: number, seed: number, totalPlaySec: number): LevelPlan {
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

  const biome = level === 1 ? 'jungle' : rng.pick(BIOMES).id;
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
    tod: level === 1 ? 'day' : rng.weighted<TimeOfDay>(
      biome === 'city' || biome === 'volcano' ? [['day', 1], ['dusk', 2], ['night', 3]] : [['day', 3], ['dusk', 2], ['night', 1.5]],
    ),
  };
  if (!isBoss && level >= 2 && rng.chance(0.45)) {
    plan.skyExit = true;
    plan.height = 34;
  }
  return plan;
}
