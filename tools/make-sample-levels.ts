// Writes the sample levels in /levels. Run: npx vite-node tools/make-sample-levels.ts
import { writeFileSync } from 'node:fs';
import { blankLevel, levelToFile, validateLevel, type LevelFile } from '../src/world/levelFormat';
import { generateLevel } from '../src/world/LevelGen';

function put(f: LevelFile, x: number, y: number, ch: string): void {
  const r = f.tiles[y];
  f.tiles[y] = r.slice(0, x) + ch + r.slice(x + 1);
}
function fill(f: LevelFile, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(f, x, y, ch);
}
function backFill(f: LevelFile, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  for (let y = y0; y <= y1; y++) {
    const r = f.back![y];
    f.back![y] = r.slice(0, x0) + ch.repeat(x1 - x0 + 1) + r.slice(x1 + 1);
  }
}

// --- FIRST STEPS: a short hand-built jungle level
const a = blankLevel(110, 'jungle');
a.name = 'FIRST STEPS';
a.author = 'Ballistocracy team';
a.description = 'A gentle hand-made warm-up: a pit, a bunker and a village.';
fill(a, 18, 11, 24, 13, 'd'); // hill
fill(a, 30, 14, 32, 19, '.'); // pit
fill(a, 40, 9, 52, 9, 'b'); // bunker roof
fill(a, 40, 9, 40, 13, 'b');
fill(a, 52, 9, 52, 13, 'b');
fill(a, 40, 12, 40, 13, '.');
fill(a, 52, 12, 52, 13, '.');
fill(a, 50, 9, 50, 13, 'l');
backFill(a, 40, 9, 52, 13, 's');
backFill(a, 43, 11, 43, 11, 'W');
backFill(a, 47, 11, 47, 11, 'W');
fill(a, 62, 11, 66, 11, 'p'); // hut floor
fill(a, 62, 7, 66, 7, 'w'); // hut roof
fill(a, 61, 11, 61, 13, 'l');
backFill(a, 62, 8, 66, 10, 'w');
fill(a, 76, 12, 79, 13, 's'); // rock step
a.entities = [
  { kind: 'prop', type: 'crate', x: 8, y: 14, item: 'rocket' },
  { kind: 'scenery', type: 'palm', x: 12, y: 14 },
  { kind: 'enemy', type: 'grunt', x: 21, y: 11 },
  { kind: 'scenery', type: 'fern', x: 26, y: 14 },
  { kind: 'enemy', type: 'grunt', x: 44, y: 14 },
  { kind: 'enemy', type: 'grunt', x: 47, y: 9 },
  { kind: 'prop', type: 'cage', x: 46, y: 14 },
  { kind: 'scenery', type: 'post', x: 62, y: 14 },
  { kind: 'scenery', type: 'post', x: 66, y: 14 },
  { kind: 'scenery', type: 'roof_thatch', x: 64, y: 8 },
  { kind: 'enemy', type: 'grunt', x: 64, y: 11 },
  { kind: 'scenery', type: 'enemyflag', x: 69, y: 14 },
  { kind: 'prop', type: 'barrel', x: 72, y: 14 },
  { kind: 'enemy', type: 'dog', x: 84, y: 14 },
  { kind: 'scenery', type: 'jungletree', x: 90, y: 14 },
  { kind: 'pickup', item: 'grenade', x: 95, y: 14 },
];
a.exit = { x: 102, y: 14, vehicle: 'chopper' };

// --- a generated level, exported so people can see the format of a big one
const gen = generateLevel(4, 20261120, 0);
const b = levelToFile(gen, { name: 'SEEDED SAMPLE', author: 'level generator' });
b.description = 'Exported from the procedural generator (seed 20261120).';

for (const [file, lvl] of [['levels/first-steps.json', a], ['levels/seeded-sample.json', b]] as const) {
  const v = validateLevel(lvl);
  if (!v.ok) throw new Error(`${file}: ${v.errors.join('; ')}`);
  writeFileSync(file, JSON.stringify(lvl, null, 1) + '\n');
  console.log('wrote', file, v.warnings.length ? `(warnings: ${v.warnings.join('; ')})` : '');
}
