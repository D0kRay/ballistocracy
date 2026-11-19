import { describe, expect, it } from 'vitest';
import { computeCamera, clampToView } from '../src/camera/coopCamera';
import { DT, TILE, VIEW_H, VIEW_W } from '../src/config';
import { IN } from '../src/core/input';
import { Rng } from '../src/core/rng';
import { planLevel, targetSeconds } from '../src/progress/difficulty';
import { World } from '../src/sim/World';
import { generateLevel } from '../src/world/LevelGen';
import { T } from '../src/world/tiles';

describe('rng', () => {
  it('is deterministic', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
});

describe('level generator', () => {
  it('same seed => same map', () => {
    const a = generateLevel(3, 1234, 0);
    const b = generateLevel(3, 1234, 0);
    expect(Array.from(a.grid.tiles)).toEqual(Array.from(b.grid.tiles));
    expect(a.enemies).toEqual(b.enemies);
  });

  it('levels get longer with level number and play time', () => {
    expect(targetSeconds(2, 0)).toBeGreaterThan(targetSeconds(1, 0));
    expect(targetSeconds(2, 3000)).toBeGreaterThan(targetSeconds(2, 0));
    const l1 = generateLevel(1, 7, 0).grid.w;
    const l8 = generateLevel(8, 7, 0).grid.w;
    expect(l8).toBeGreaterThan(l1);
  });

  it('every 5th level is a boss level with an arena', () => {
    const p = planLevel(5, 1, 0);
    expect(p.isBoss).toBe(true);
    const lvl = generateLevel(5, 99, 0);
    expect(lvl.arena).not.toBeNull();
    expect(lvl.props.some((p) => p.type === 'exit')).toBe(false);
  });

  it('normal level has exit, solid start and bedrock under ground', () => {
    for (let seed = 1; seed < 30; seed++) {
      const lvl = generateLevel(1 + (seed % 4), seed, 0);
      expect(lvl.props.filter((p) => p.type === 'exit').length).toBe(1);
      const g = lvl.grid;
      for (let x = 0; x < 8; x++) expect(g.surfaceRow(x)).toBeGreaterThan(0);
      for (let x = 0; x < g.w; x++) {
        const s = g.surfaceRow(x);
        if (s >= 0 && g.get(x, g.h - 2) !== T.EMPTY) expect([T.BEDROCK, T.METAL]).toContain(g.get(x, g.h - 1));
      }
    }
  });
});

describe('co-op camera', () => {
  const box = (x: number) => ({ x, y: 150, w: 10, h: 14, vx: 0 });
  it('keeps both players in view and blocks the front player', () => {
    let cam = { x: 0, y: 0 };
    const back = box(30);
    const front = box(30);
    for (let i = 0; i < 400; i++) {
      front.x += 2; // front keeps running right, back player idles
      cam = computeCamera(cam, [back, front], 5000, 288, VIEW_W, VIEW_H, 20, null);
      clampToView(back, cam, VIEW_W);
      clampToView(front, cam, VIEW_W);
      expect(back.x).toBeGreaterThanOrEqual(cam.x);
      expect(front.x + front.w).toBeLessThanOrEqual(cam.x + VIEW_W);
    }
    expect(front.x - back.x).toBeLessThan(VIEW_W);
    expect(front.x).toBeLessThan(VIEW_W); // stuck until the back player moves
  });
});

describe('world simulation', () => {
  it('explosions destroy terrain, bullets do not', () => {
    const lvl = generateLevel(1, 5, 0);
    const w = new World(lvl, [{ pid: 0, hero: 0, name: 'A' }]);
    const col = 4;
    const row = w.grid.surfaceRow(col);
    const before = w.grid.get(col, row);
    expect(before).not.toBe(T.EMPTY);
    w.spawnProjectile('bullet', col * TILE + 8, row * TILE - 4, 0, 400, 'p', 0, 1, 1);
    for (let i = 0; i < 10; i++) w.step(DT, new Map());
    expect(w.grid.get(col, row)).toBe(before);
    w.explode(col * TILE + 8, row * TILE + 8, 30, 4, 'p');
    expect(w.grid.get(col, row)).toBe(T.EMPTY);
  });

  it('a simple bot can finish early levels', () => {
    let finished = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const lvl = generateLevel(1, seed * 101, 0);
      const w = new World(lvl, [{ pid: 0, hero: 0, name: 'BOT' }], 99);
      const p = w.players[0];
      let stuck = 0;
      let lastX = 0;
      for (let i = 0; i < 60 * 150 && w.status === 'playing'; i++) {
        let bits = IN.RIGHT | IN.FIRE;
        if (i % 90 < 30) bits |= IN.JUMP;
        if (Math.abs(p.x - lastX) < 0.05) stuck++;
        else stuck = 0;
        lastX = p.x;
        if (stuck > 30 && i % 120 === 0) bits |= IN.SPECIAL;
        w.step(DT, new Map([[0, bits]]));
        w.events = [];
      }
      if (w.status === 'complete') finished++;
    }
    expect(finished).toBeGreaterThanOrEqual(4);
  });

  it('boss level spawns a boss once players enter the arena', () => {
    const lvl = generateLevel(5, 77, 0);
    const w = new World(lvl, [{ pid: 0, hero: 0, name: 'BOT' }], 99);
    const p = w.players[0];
    p.x = lvl.arena!.x0 + 40;
    p.y = 40;
    w.cam.x = lvl.arena!.x0;
    for (let i = 0; i < 30; i++) w.step(DT, new Map());
    expect(w.boss).not.toBeNull();
    expect(w.arenaLocked).toBe(true);
  });
});

describe('stress', () => {
  it('runs every boss type and many levels without throwing', () => {
    for (const level of [5, 10, 15, 3, 7, 9, 12]) {
      const lvl = generateLevel(level, level * 31, 600);
      const w = new World(lvl, [0, 1, 2].map((i) => ({ pid: i, hero: i, name: 'B' })), 99);
      if (lvl.arena) {
        w.players.forEach((p, i) => {
          p.x = lvl.arena!.x0 + 30 + i * 20;
          p.y = 40;
        });
        w.cam.x = lvl.arena!.x0;
      }
      for (let i = 0; i < 60 * 40; i++) {
        const m = new Map<number, number>();
        w.players.forEach((p, k) => m.set(p.pid, (i + k * 37) % 200 < 100 ? IN.RIGHT | IN.FIRE | ((i % 50) < 10 ? IN.JUMP : 0) : IN.LEFT | IN.FIRE | ((i % 300) === 0 ? IN.SPECIAL : 0)));
        w.step(DT, m);
        w.events = [];
        w.grid.drainDirty();
      }
      expect(w.time).toBeGreaterThan(30);
    }
  });
});

import { predictPlayer } from '../src/sim/players';

describe('guest prediction', () => {
  it('predicted movement matches the authoritative simulation', () => {
    const mk = () => {
      const w = new World(generateLevel(2, 555, 0), [{ pid: 0, hero: 0, name: 'A' }], 9);
      w.enemies = [];
      w.props = w.props.filter((p) => p.type === 'exit');
      w.players[0].inv = 999;
      return w;
    };
    const host = mk();
    const guest = mk();
    const gp = guest.players[0];
    for (let i = 0; i < 600; i++) {
      let bits = IN.RIGHT;
      if (i % 70 < 25) bits |= IN.JUMP;
      if (i % 200 > 150) bits = IN.LEFT | (i % 20 < 5 ? IN.JUMP : 0);
      host.step(DT, new Map([[0, bits]]));
      host.events = [];
      gp.prev = gp.bits;
      gp.bits = bits;
      predictPlayer(guest, gp, DT);
      guest.cam = { ...host.cam };
      clampToView(gp, guest.cam, VIEW_W);
      expect(Math.abs(gp.x - host.players[0].x)).toBeLessThan(0.5);
      expect(Math.abs(gp.y - host.players[0].y)).toBeLessThan(0.5);
    }
  });
});
