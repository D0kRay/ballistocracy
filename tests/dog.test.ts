import { describe, expect, it } from 'vitest';
import { DT, TILE } from '../src/config';
import { IN } from '../src/core/input';
import { segmentHits } from '../src/sim/physics';
import { World } from '../src/sim/World';
import { blankLevel, levelFromFile } from '../src/world/levelFormat';

/** flat ground (surface row 14), one hero, one dog at the given tile column */
function arena(dogCol: number): World {
  const f = blankLevel(80);
  f.entities.push({ kind: 'enemy', type: 'dog', x: dogCol, y: 14 });
  const w = new World(levelFromFile(f), [{ pid: 0, hero: 0, name: 'A' }], 9);
  w.intro = null;
  const p = w.players[0];
  p.inVehicle = false;
  p.inv = 0;
  p.x = 10 * TILE;
  p.y = 14 * TILE - p.h - 1;
  return w;
}

const step = (w: World, bits: number, n = 1) => {
  for (let i = 0; i < n; i++) w.step(DT, new Map([[0, bits]]));
};

describe('dogs', () => {
  it('segment test finds a box between two points', () => {
    const box = { x: 10, y: 0, w: 4, h: 4 };
    expect(segmentHits(0, 2, 20, 2, box)).toBe(true); // passes straight through
    expect(segmentHits(0, 8, 20, 8, box)).toBe(false); // passes below
    expect(segmentHits(0, 2, 8, 2, box)).toBe(false); // stops short
  });

  it('a dog pressed against the hero dies to a rifle shot', () => {
    const w = arena(30);
    step(w, 0, 20); // land
    const p = w.players[0];
    const dog = w.enemies[0];
    // put the dog right at the hero's feet, inside the muzzle distance
    dog.x = p.x + p.w / 2 - 2;
    dog.y = p.y + p.h - dog.h;
    p.facing = 1;
    p.inv = 5; // only test the shooting here
    step(w, IN.FIRE, 4);
    expect(dog.dead).toBe(true);
  });

  it('a running dog can be shot down before it bites', () => {
    const w = arena(26);
    const p = w.players[0];
    const dog = w.enemies[0];
    dog.facing = -1;
    step(w, 0, 10);
    for (let i = 0; i < 60 * 4 && !dog.dead; i++) step(w, IN.FIRE, 1);
    expect(dog.dead).toBe(true);
    expect(p.hp).toBe(3);
  });

  it('after a bite the dog backs off instead of biting again at once', () => {
    const w = arena(13);
    const p = w.players[0];
    const dog = w.enemies[0];
    dog.state = 'attack';
    dog.targetId = p.id;
    let bites = 0;
    let hp = p.hp;
    for (let i = 0; i < 60 * 2; i++) {
      p.inv = Math.min(p.inv, 0); // no invulnerability frames: only the dog's own cooldown limits it
      step(w, 0, 1);
      if (p.hp < hp) bites++;
      hp = p.hp;
      if (!p.alive) break;
    }
    expect(bites).toBeLessThanOrEqual(2);
  });
});
