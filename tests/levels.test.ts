// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore node builtins are available in vitest
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DT } from '../src/config';
import { World } from '../src/sim/World';
import { generateLevel } from '../src/world/LevelGen';
import { blankLevel, levelFromFile, levelToFile, validateLevel, type LevelFile } from '../src/world/levelFormat';

// Every contributed level in /levels must pass this suite (CI runs it on pull requests).
const files: string[] = (readdirSync('levels') as string[]).filter((f: string) => f.endsWith('.json'));

describe('contributed levels', () => {
  it('there is at least one level', () => expect(files.length).toBeGreaterThan(0));
  for (const name of files) {
    it(`${name} is valid and loads`, () => {
      const data = JSON.parse(readFileSync(`levels/${name}`, 'utf8')) as LevelFile;
      const v = validateLevel(data);
      expect(v.errors).toEqual([]);
      const w = new World(levelFromFile(data), [{ pid: 0, hero: 0, name: 'T' }]);
      for (let i = 0; i < 60 * 3; i++) w.step(DT, new Map());
      expect(w.players[0].inVehicle).toBe(false); // the helicopter dropped the player
    });
  }
});

describe('level format', () => {
  it('round-trips generated levels', () => {
    for (const lv of [2, 5, 7]) {
      const lvl = generateLevel(lv, 99 + lv, 0);
      const f = levelToFile(lvl, { name: 'X', author: 'Y' });
      expect(validateLevel(f).errors).toEqual([]);
      const again = levelToFile(levelFromFile(f), { name: 'X', author: 'Y' });
      expect(again.tiles).toEqual(f.tiles);
      expect(again.entities.length).toBe(f.entities.length);
      expect(again.exit).toEqual(f.exit);
    }
  });

  it('rejects broken files with readable errors', () => {
    const f = blankLevel();
    f.tiles[3] = f.tiles[3].slice(0, -1);
    f.entities.push({ kind: 'enemy', type: 'dragon' as never, x: 5, y: 14 });
    const v = validateLevel(f);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toContain('tiles[3]');
    const g = blankLevel();
    g.entities.push({ kind: 'enemy', type: 'dragon' as never, x: 5, y: 14 });
    g.spawn = { x: 3, y: 5 };
    const v2 = validateLevel(g);
    expect(v2.errors.join(' ')).toContain('unknown enemy');
    expect(v2.errors.join(' ')).toContain('spawn');
  });
});
