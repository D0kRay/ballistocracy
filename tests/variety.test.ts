import { describe, expect, it } from 'vitest';
import { IN } from '../src/core/input';
import { ACTIONS, DEFAULT_KEYS, bindKey, clearKey, keyLabel, keyMap, resetKeys } from '../src/input/keybinds';
import { MUTATORS, planLevel } from '../src/progress/difficulty';
import { generateLevel } from '../src/world/LevelGen';
import { SCENERY_TYPES, levelToFile, validateLevel } from '../src/world/levelFormat';

describe('key bindings', () => {
  it('starts with the default keys', () => {
    resetKeys();
    expect(keyMap('kbA')[IN.JUMP]).toEqual(DEFAULT_KEYS.kbA[IN.JUMP]);
    expect(keyMap('kbB')[IN.FIRE]).toEqual(DEFAULT_KEYS.kbB[IN.FIRE]);
    for (const a of ACTIONS) expect(keyMap('kbA')[a.bit].length).toBeGreaterThan(0);
  });

  it('rebinds a key and removes it from where it was before', () => {
    resetKeys();
    // F (player A fire) becomes player A jump
    const r = bindKey('kbA', IN.JUMP, 0, 'KeyF');
    expect(r.ok).toBe(true);
    expect(keyMap('kbA')[IN.JUMP][0]).toBe('KeyF');
    expect(keyMap('kbA')[IN.FIRE]).not.toContain('KeyF');
    expect(r.note).toContain('FIRE');
    // a key taken from the other player
    bindKey('kbA', IN.FIRE, 0, 'KeyJ');
    expect(keyMap('kbB')[IN.FIRE]).not.toContain('KeyJ');
    resetKeys();
  });

  it('refuses reserved keys and keeps at most two keys per action', () => {
    resetKeys();
    expect(bindKey('kbA', IN.LEFT, 0, 'Escape').ok).toBe(false);
    expect(bindKey('kbA', IN.LEFT, 0, 'KeyP').ok).toBe(false);
    bindKey('kbA', IN.LEFT, 1, 'KeyZ');
    bindKey('kbA', IN.LEFT, 2, 'KeyX');
    expect(keyMap('kbA')[IN.LEFT].length).toBe(2);
    clearKey('kbA', IN.LEFT, 1);
    expect(keyMap('kbA')[IN.LEFT]).toEqual(['KeyA']);
    resetKeys();
  });

  it('names keys with characters the pixel font has', () => {
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('Digit7')).toBe('7');
    expect(keyLabel('Numpad3')).toBe('NUM3');
    expect(keyLabel('ShiftLeft')).toBe('L-SHIFT');
    expect(keyLabel('ArrowUp')).toBe('UP');
  });
});

describe('level variety', () => {
  it('level 1 is not always the same biome', () => {
    const biomes = new Set<string>();
    for (let s = 1; s < 40; s++) biomes.add(planLevel(1, s, 0).biome);
    expect(biomes.size).toBeGreaterThan(3);
  });

  it('twists show up and every twist builds a valid level', () => {
    const seen = new Set<string>();
    for (let s = 1; s < 200; s++) {
      const m = planLevel(7, s, 0).mutator;
      if (m) seen.add(m);
    }
    expect(seen.size).toBe(Object.keys(MUTATORS).length);
    for (const m of Object.keys(MUTATORS) as (keyof typeof MUTATORS)[]) {
      const lvl = generateLevel(8, 4242, 0, { mutator: m });
      expect(lvl.plan.mutator).toBe(m);
      expect(validateLevel(levelToFile(lvl, { name: 'T', author: 'T' })).errors).toEqual([]);
    }
  });

  it('boss levels never get a twist', () => {
    for (let s = 1; s < 50; s++) expect(planLevel(10, s, 0).mutator).toBeNull();
  });

  it('generated scenery only uses known sprites, and the new ones appear', () => {
    const used = new Set<string>();
    for (let s = 1; s < 60; s++) for (const sc of generateLevel(4 + (s % 4), s * 31, 0).scenery) used.add(sc.type);
    for (const t of used) expect(SCENERY_TYPES as readonly string[]).toContain(t);
    for (const t of ['bamboo', 'boulder', 'ice_crystal', 'trashcan', 'vent', 'lavarock', 'campfire']) expect(used).toContain(t);
  });

  it('two seeds of the same level look different', () => {
    const a = generateLevel(4, 1, 0);
    const b = generateLevel(4, 2, 0);
    expect(Array.from(a.grid.tiles)).not.toEqual(Array.from(b.grid.tiles));
  });
});
