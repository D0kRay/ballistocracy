import { describe, expect, it } from 'vitest';
import { Grid } from '../src/world/Grid';
import { BACK_CHANGE, T } from '../src/world/tiles';

/** small test map: ground at row 9, a 3-wide house back wall, a ladder on the ground */
function makeGrid(): Grid {
  const g = new Grid(20, 10);
  for (let x = 0; x < 20; x++) g.init(x, 9, T.BEDROCK);
  return g;
}

describe('destruction of ladders and back walls', () => {
  it('keeps a ladder standing on the ground and drops one hanging in the air', () => {
    const g = makeGrid();
    for (let y = 5; y < 9; y++) g.init(3, y, T.LADDER); // stands on the floor
    for (let y = 2; y < 5; y++) g.init(10, y, T.LADDER); // floats
    const loose = g.findLooseLadders(6, 5, 10);
    expect(loose.every((l) => l.x === 10)).toBe(true);
    expect(loose.length).toBe(3);
  });

  it('a ladder hanging from a platform stays', () => {
    const g = makeGrid();
    g.init(10, 1, T.PLATFORM);
    for (let y = 2; y < 5; y++) g.init(10, y, T.LADDER);
    expect(g.findLooseLadders(10, 3, 5)).toEqual([]);
  });

  it('back walls touching terrain stay, floating ones go', () => {
    const g = makeGrid();
    // house back wall standing on the ground (rows 6-8)
    for (let y = 6; y < 9; y++) for (let x = 2; x < 5; x++) g.back[y * g.w + x] = 3;
    // back wall left over in the air after the house is gone
    for (let y = 2; y < 4; y++) for (let x = 9; x < 12; x++) g.back[y * g.w + x] = 2;
    const loose = g.findLooseBack(8, 4, 6);
    expect(loose.length).toBe(6);
    expect(loose.every((b) => b.x >= 9 && b.x <= 11)).toBe(true);
  });

  it('back wall changes travel in the tile change list', () => {
    const g = makeGrid();
    g.back[3 * g.w + 4] = 4;
    g.setBack(4, 3, 0);
    const ch = g.drainDirty();
    expect(ch).toEqual([3 * g.w + 4, BACK_CHANGE]);
    const guest = makeGrid();
    guest.back[3 * g.w + 4] = 4;
    guest.applyChanges(ch);
    expect(guest.getBack(4, 3)).toBe(0);
    expect(guest.get(4, 3)).toBe(T.EMPTY);
  });
});
