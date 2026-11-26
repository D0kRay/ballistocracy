import { describe, expect, it } from 'vitest';
import { DT } from '../src/config';
import { IN } from '../src/core/input';
import { CAR_HP, CHEAT, makeCar } from '../src/sim/cars';
import { World } from '../src/sim/World';
import { blankLevel, levelFromFile } from '../src/world/levelFormat';

function world(): World {
  // flat test ground, so the result does not depend on what the level generator builds
  const w = new World(levelFromFile(blankLevel(120)), [{ pid: 0, hero: 0, name: 'A' }], 99);
  w.intro = null;
  for (const p of w.players) {
    p.inVehicle = false;
    p.inv = 0;
  }
  for (const e of w.enemies) e.dead = true;
  return w;
}

const step = (w: World, bits: number, n = 1) => {
  for (let i = 0; i < n; i++) w.step(DT, new Map([[0, bits]]));
};

/** park a car on the ground under the player and let the player drop onto its roof */
function boardCar(w: World) {
  const p = w.players[0];
  step(w, 0, 60); // land
  const car = makeCar(w.id(), p.x - 14, p.y - 4, 1);
  w.cars.push(car);
  step(w, 0, 30); // car settles on the ground
  p.x = car.x + 14;
  p.y = car.y - 30;
  p.vy = 50;
  step(w, 0, 20);
  return car;
}

describe('ILTI wagon', () => {
  it('the cheat code drops a wagon', () => {
    const w = world();
    step(w, 0, 30);
    for (const bit of CHEAT) {
      step(w, bit, 3);
      step(w, 0, 3);
    }
    expect(w.cars.length).toBe(1);
  });

  it('a wrong input resets the code', () => {
    const w = world();
    for (const bit of [IN.UP, IN.UP, IN.DOWN, IN.FIRE, IN.DOWN, IN.LEFT, IN.RIGHT, IN.LEFT, IN.RIGHT, IN.INTERACT]) {
      step(w, bit, 3);
      step(w, 0, 3);
    }
    expect(w.cars.length).toBe(0);
  });

  it('jumping on the roof takes the wheel, then it drives, jumps and lets the driver out', () => {
    const w = world();
    const car = boardCar(w);
    const p = w.players[0];
    expect(p.car).toBe(car.id);
    const x0 = car.x;
    step(w, IN.RIGHT, 40);
    expect(car.x).toBeGreaterThan(x0 + 20);
    expect(Math.abs(p.x + p.w / 2 - (car.x + car.w / 2))).toBeLessThan(1);
    step(w, 0, 30);
    step(w, IN.JUMP, 2);
    expect(car.vy).toBeLessThan(0);
    step(w, 0, 60);
    step(w, IN.INTERACT, 1);
    expect(p.car).toBe(-1);
    expect(car.driver).toBe(-1);
  });

  it('fires the hood minigun', () => {
    const w = world();
    boardCar(w);
    w.events = [];
    step(w, IN.FIRE, 60); // one second of fire
    expect(w.events.filter((e) => e.k === 'muzzle').length).toBeGreaterThan(12);
  });

  it('only enemy explosions damage it; enough of them wreck it and throw the driver out', () => {
    const w = world();
    const car = boardCar(w);
    const p = w.players[0];
    w.explode(car.x + car.w / 2, car.y + 4, 30, 4, 'p');
    expect(car.hp).toBe(CAR_HP);
    w.explode(car.x + car.w / 2, car.y + 4, 30, 4, 'e');
    expect(car.hp).toBeLessThan(CAR_HP);
    expect(p.alive).toBe(true);
    for (let i = 0; i < 10 && !car.dead; i++) w.explode(car.x + car.w / 2, car.y + 4, 30, 4, 'e');
    step(w, 0, 1);
    expect(car.dead).toBe(true);
    expect(w.cars.length).toBe(0);
    expect(p.car).toBe(-1);
  });

  it('enemy bullets bounce off the wagon', () => {
    const w = world();
    const car = boardCar(w);
    const p = w.players[0];
    const hp = p.hp;
    w.spawnProjectile('ebullet', car.x - 20, car.y + 8, 400, 0, 'e', 0, 1, 1);
    step(w, 0, 10);
    expect(p.hp).toBe(hp);
    expect(car.hp).toBe(CAR_HP);
  });
});
