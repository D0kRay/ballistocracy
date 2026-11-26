// Writes a pack of themed levels into /levels (they show up under COMMUNITY LEVELS).
// Every level comes from the procedural generator with a fixed biome, time of day and twist.
// For normal levels the tool tries seeds until a simple bot (run right, jump, shoot) can
// finish it, so none of them is broken.
// Run: npx vite-node tools/make-community-levels.ts
import { writeFileSync } from 'node:fs';
import { DT } from '../src/config';
import { IN } from '../src/core/input';
import type { Mutator, PlanOverrides, TimeOfDay } from '../src/progress/difficulty';
import { World } from '../src/sim/World';
import type { BiomeId } from '../src/world/biomes';
import { generateLevel } from '../src/world/LevelGen';
import { levelFromFile, levelToFile, validateLevel, type LevelFile } from '../src/world/levelFormat';

interface Spec {
  id: string;
  name: string;
  description: string;
  level: number; // campaign level it is built like (length, enemy types); 5, 10, 15 are boss levels
  biome: BiomeId;
  tod: TimeOfDay;
  mutator?: Mutator | null;
  skyExit?: boolean;
  seed: number; // first seed to try
}

const SPECS: Spec[] = [
  { id: 'palm-beach-landing', name: 'PALM BEACH LANDING', description: 'A sunny jungle warm-up with camps along the shore.', level: 2, biome: 'jungle', tod: 'day', mutator: null, seed: 1101 },
  { id: 'dune-raiders', name: 'DUNE RAIDERS', description: 'Desert dusk raid. Weapon crates everywhere: grab and go.', level: 4, biome: 'desert', tod: 'dusk', mutator: 'armory', seed: 2202 },
  { id: 'frostbite-ridge', name: 'FROSTBITE RIDGE', description: 'Cliffs, caves and rope bridges in the arctic wilds.', level: 4, biome: 'snow', tod: 'day', mutator: 'wilds', seed: 3303 },
  { id: 'neon-ruins', name: 'NEON RUINS', description: 'Snipers in every ruin of a burning city at night.', level: 6, biome: 'city', tod: 'night', mutator: 'snipers', seed: 4404 },
  { id: 'rust-belt', name: 'RUST BELT', description: 'A factory full of barrels. Shoot first, run faster.', level: 6, biome: 'industrial', tod: 'dusk', mutator: 'demolition', seed: 5505 },
  { id: 'ashfall', name: 'ASHFALL', description: 'Mines buried in volcanic ash. Watch your step.', level: 7, biome: 'volcano', tod: 'night', mutator: 'minefield', seed: 6606 },
  { id: 'temple-of-teeth', name: 'TEMPLE OF TEETH', description: 'A jungle prison camp at dusk. Free every cage.', level: 7, biome: 'jungle', tod: 'dusk', mutator: 'prison', seed: 7707 },
  { id: 'oasis-siege', name: 'OASIS SIEGE', description: 'Bunkers, trenches and outposts guard the desert oasis.', level: 8, biome: 'desert', tod: 'day', mutator: 'outposts', seed: 8808 },
  { id: 'whiteout', name: 'WHITEOUT', description: 'Arctic night. Something is howling in the snow.', level: 8, biome: 'snow', tod: 'night', mutator: 'dogpack', seed: 9909 },
  { id: 'skyline-escape', name: 'SKYLINE ESCAPE', description: 'Fight up a high-rise to the chopper on the roof.', level: 6, biome: 'city', tod: 'dusk', mutator: null, skyExit: true, seed: 11011 },
  { id: 'chimney-climb', name: 'CHIMNEY CLIMB', description: 'Drones patrol the sky above the factory roofs.', level: 7, biome: 'industrial', tod: 'day', mutator: 'skypatrol', skyExit: true, seed: 12121 },
  { id: 'magma-works', name: 'MAGMA WORKS', description: 'A long volcano run. They know you are coming.', level: 9, biome: 'volcano', tod: 'dusk', mutator: 'ambush', seed: 13231 },
  { id: 'hog-hunt', name: 'HOG HUNT', description: 'Boss: the IRON HOG tank waits in the desert.', level: 5, biome: 'desert', tod: 'dusk', mutator: null, seed: 14341 },
  { id: 'hornets-nest', name: "HORNET'S NEST", description: 'Boss: the HORNET GUNSHIP over the night jungle.', level: 10, biome: 'jungle', tod: 'night', mutator: null, seed: 15451 },
  { id: 'deep-drill', name: 'DEEP DRILL', description: 'Boss: THE BURROWER tunnels under the frozen ground.', level: 15, biome: 'snow', tod: 'day', mutator: null, seed: 16561 },
  { id: 'scrapyard-sprint', name: 'SCRAPYARD SPRINT', description: 'A short city dash through wrecks and barricades.', level: 3, biome: 'city', tod: 'day', mutator: 'outposts', seed: 17671 },
];

/** the same bot the tests use for the campaign opener */
function botFinishes(f: LevelFile): boolean {
  for (const hero of [0, 2]) {
    const w = new World(levelFromFile(f), [{ pid: 0, hero, name: 'B' }], 30);
    const p = w.players[0];
    let stuck = 0;
    let lastX = 0;
    for (let i = 0; i < 60 * 240 && w.status === 'playing'; i++) {
      let bits = IN.RIGHT | IN.FIRE;
      if (i % 50 < 18) bits |= IN.JUMP;
      stuck = Math.abs(p.x - lastX) < 0.05 ? stuck + 1 : 0;
      lastX = p.x;
      if (stuck > 40) bits |= IN.UP | IN.JUMP | (i % 90 === 0 ? IN.SPECIAL : 0);
      w.step(DT, new Map([[0, bits]]));
      w.events = [];
    }
    if (w.status !== 'complete') return false;
  }
  return true;
}

for (const s of SPECS) {
  const ov: PlanOverrides = { biome: s.biome, tod: s.tod, mutator: s.mutator ?? null, skyExit: s.skyExit ?? false };
  const boss = s.level % 5 === 0;
  let chosen: LevelFile | null = null;
  let tries = 0;
  for (let seed = s.seed; seed < s.seed + 60 && !chosen; seed++) {
    tries++;
    const f = levelToFile(generateLevel(s.level, seed, 0, ov), { name: s.name, author: 'Ballistocracy team' });
    f.description = s.description;
    if (!validateLevel(f).ok) continue;
    // the bot can not climb the sky finale or fight a boss: those are only validated
    if (boss || s.skyExit || botFinishes(f)) chosen = f;
  }
  if (!chosen) throw new Error(`${s.id}: no beatable seed found`);
  const v = validateLevel(chosen);
  const file = `levels/${s.id}.json`;
  writeFileSync(file, JSON.stringify(chosen, null, 1) + '\n');
  console.log('wrote', file, `${chosen.width}x${chosen.height}`, `tries ${tries}`, v.warnings.length ? `(warnings: ${v.warnings.join('; ')})` : '');
}
