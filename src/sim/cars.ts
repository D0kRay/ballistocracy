import { GRAVITY, MAX_FALL, TILE, VIEW_W } from '../config';
import { IN, aimAngle, has, pressed } from '../core/input';
import { isSolid } from '../world/tiles';
import { makeBody, moveBody, overlap } from './physics';
import type { Car, Player } from './types';
import type { World } from './World';

// The ILTI wagon: a red station wagon with a minigun on the hood. Spawned by a
// cheat code, a player jumps on the roof to drive it. Only enemy explosions hurt it.

export const CAR_W = 40;
export const CAR_H = 18;
export const CAR_HP = 10;
const ACCEL = 520;
const BRAKE = 900;
const TOP_SPEED = 240;
const JUMP = 340;
const MAX_CARS = 3;

/** cheat code: UP UP DOWN DOWN LEFT RIGHT LEFT RIGHT GRAB */
export const CHEAT = [IN.UP, IN.UP, IN.DOWN, IN.DOWN, IN.LEFT, IN.RIGHT, IN.LEFT, IN.RIGHT, IN.INTERACT];
const CHEAT_BITS = IN.UP | IN.DOWN | IN.LEFT | IN.RIGHT | IN.INTERACT | IN.JUMP | IN.FIRE | IN.SPECIAL;
const CHEAT_GAP = 1.2; // seconds allowed between two inputs of the code

export function makeCar(id: number, x: number, y: number, facing: number): Car {
  return { ...makeBody(x, y, CAR_W, CAR_H), id, hp: CAR_HP, facing, driver: -1, fireCd: 0, firingT: 0, burnT: 0, hurtT: 0, enterCd: 0, aim: 0, dead: false };
}

/** advance each player's cheat code progress; returns players that just finished it */
export function checkCheat(w: World): Player[] {
  const done: Player[] = [];
  for (const p of w.players) {
    const st = w.cheat.get(p.pid) ?? { i: 0, t: 0 };
    st.t += 1 / 60;
    if (st.t > CHEAT_GAP) st.i = 0;
    const edges = p.bits & ~p.prev & CHEAT_BITS;
    if (edges) {
      if (edges & CHEAT[st.i]) {
        st.i++;
        st.t = 0;
        if (st.i === CHEAT.length) {
          st.i = 0;
          if (p.alive) done.push(p);
        }
      } else st.i = edges & CHEAT[0] ? 1 : 0;
    }
    w.cheat.set(p.pid, st);
  }
  return done;
}

/** drop a fresh wagon from the sky next to the player */
export function spawnCar(w: World, p: Player): Car {
  const live = w.cars.filter((c) => !c.dead);
  if (live.length >= MAX_CARS) {
    const old = live.find((c) => c.driver < 0) ?? live[0];
    releaseDriver(w, old);
    old.dead = true;
  }
  let x = p.x + p.w / 2 + p.facing * 34 - CAR_W / 2;
  x = Math.max(w.cam.x + 4, Math.min(w.cam.x + VIEW_W - CAR_W - 4, x));
  const car = makeCar(w.id(), x, Math.max(0, w.cam.y - 10), p.facing);
  car.vy = 60;
  w.cars.push(car);
  w.emit({ k: 'banner', s: 'ILTI EXPRESS', sub: 'JUMP ON THE ROOF TO DRIVE' });
  w.sfx('horn', x);
  return car;
}

function boxFree(w: World, x: number, y: number, bw: number, bh: number): boolean {
  for (let ty = Math.floor(y / TILE); ty <= Math.floor((y + bh - 1) / TILE); ty++)
    for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + bw - 1) / TILE); tx++) if (isSolid(w.grid.get(tx, ty))) return false;
  return true;
}

export function driverOf(w: World, car: Car): Player | undefined {
  return car.driver < 0 ? undefined : w.players.find((p) => p.id === car.driver);
}

export function releaseDriver(w: World, car: Car, pop = false): void {
  const p = driverOf(w, car);
  car.driver = -1;
  car.enterCd = 0.6;
  car.burnT = 0;
  if (!p) return;
  p.car = -1;
  if (pop && p.alive) {
    p.y = car.y - p.h - 2;
    p.vy = -300;
    p.vx = car.vx * 0.5;
  }
}

export function damageCar(w: World, car: Car, n: number): void {
  if (car.dead) return;
  car.hp -= n;
  car.hurtT = 0.12;
  w.emit({ k: 'spark', x: car.x + car.w / 2, y: car.y + 4 });
  if (car.hp > 0) return;
  // wrecked: the driver is thrown out, then the wagon goes up in flames
  car.dead = true;
  const p = driverOf(w, car);
  releaseDriver(w, car, true);
  if (p) p.inv = Math.max(p.inv, 1);
  w.text(car.x + 4, car.y - 10, 'WAGON DOWN', '#ff6040');
  w.explode(car.x + car.w / 2, car.y + car.h / 2, 42, 6, 'p');
  w.emit({ k: 'debris', x: car.x + 10, y: car.y + 6, t: 4 });
  w.emit({ k: 'debris', x: car.x + 30, y: car.y + 6, t: 4 });
}

export function updateCars(w: World, dt: number): void {
  for (const car of w.cars) {
    if (car.dead) continue;
    car.fireCd -= dt;
    car.firingT = Math.max(0, car.firingT - dt);
    car.burnT = Math.max(0, car.burnT - dt);
    car.hurtT = Math.max(0, car.hurtT - dt);
    car.enterCd = Math.max(0, car.enterCd - dt);

    let p = driverOf(w, car);
    if (p && (!p.alive || p.inVehicle || p.car !== car.id)) {
      releaseDriver(w, car);
      p = undefined;
    }

    let move = 0;
    let burnout = false;
    if (p) {
      const b = p.bits;
      const pv = p.prev;
      move = (has(b, IN.RIGHT) ? 1 : 0) - (has(b, IN.LEFT) ? 1 : 0);
      if (pressed(b, pv, IN.INTERACT) || (has(b, IN.DOWN) && pressed(b, pv, IN.JUMP))) {
        releaseDriver(w, car, true);
        continue;
      }
      // DOWN + direction while standing: burnout on the spot
      if (has(b, IN.DOWN) && move !== 0 && car.onGround) {
        burnout = true;
        car.facing = move;
        car.vx *= 1 - Math.min(1, 8 * dt);
      } else if (move !== 0) {
        const braking = Math.sign(car.vx) === -move;
        car.vx += move * (braking ? BRAKE : ACCEL) * dt * (car.onGround ? 1 : 0.5);
        car.vx = Math.max(-TOP_SPEED, Math.min(TOP_SPEED, car.vx));
        car.facing = move;
      }
      if (pressed(b, pv, IN.JUMP) && car.onGround) {
        car.vy = -JUMP;
        w.sfx('jump', car.x);
      }
      // gun pitch: mouse / drag aim, or UP to shoot higher
      const a = aimAngle(b);
      let pitch = has(b, IN.UP) ? -0.35 : 0;
      if (a !== null && Math.sign(Math.cos(a)) === car.facing) pitch = Math.atan2(Math.sin(a), Math.abs(Math.cos(a)));
      car.aim = Math.max(-0.5, Math.min(0.3, pitch));
      if (has(b, IN.FIRE) && car.fireCd <= 0) {
        car.fireCd = 0.055;
        car.firingT = 0.12;
        const mx = car.x + car.w / 2 + car.facing * (car.w / 2 + 4);
        const my = car.y + 3;
        const ang = car.aim + (w.rng.next() - 0.5) * 0.1;
        w.spawnProjectile('bullet', mx, my, Math.cos(ang) * 520 * car.facing + car.vx, Math.sin(ang) * 520, 'p', p.id, 1, 0.6);
        w.emit({ k: 'muzzle', x: mx, y: my, d: car.facing, r: car.aim });
        w.sfx('minigun', mx);
      }
    }
    if (move === 0 && car.onGround) car.vx *= 1 - Math.min(1, (p ? 2.5 : 4) * dt);
    if (Math.abs(car.vx) < 2) car.vx = 0;

    car.vy = Math.min(MAX_FALL, car.vy + GRAVITY * dt);
    const want = car.vx;
    const res = moveBody(car, w.grid, dt);
    if (res.hitX) {
      // drive up one-tile steps, otherwise spin the wheels against the wall
      const y0 = car.y;
      const nx = car.x + Math.sign(want) * 3;
      if (Math.abs(want) > 10 && boxFree(w, nx, y0 - TILE - 1, car.w, car.h)) {
        car.y = y0 - TILE - 1;
        car.x = nx;
        car.vx = want * 0.85;
      } else if (move !== 0 && Math.sign(want || move) === move) burnout = true;
    } else if (p && move !== 0 && car.onGround && ((move > 0 && car.wallR) || (move < 0 && car.wallL))) burnout = true;
    if (burnout) {
      if (car.burnT <= 0) w.sfx('screech', car.x);
      car.burnT = 0.25;
    }
    if (car.y > w.levelH + 40) {
      releaseDriver(w, car);
      car.dead = true;
      continue;
    }

    // ramming enemies and crates
    if (Math.abs(car.vx) > 70) {
      for (const e of w.enemies) {
        if (e.dead || e.hurtT > 0 || !overlap(car, e)) continue;
        w.hurtEnemy(e, 4, car.x + car.w / 2 - Math.sign(car.vx) * 30);
        e.vx = car.vx * 1.2;
        e.vy = -180;
      }
      for (const pr of w.props) {
        if (pr.dead || (pr.type !== 'crate' && pr.type !== 'barrel') || !overlap(car, pr)) continue;
        w.damageProp(pr, 3);
      }
    }

    // players landing on the roof: the first one takes the wheel, others bounce off
    const roof = { x: car.x + 3, y: car.y - 4, w: car.w - 6, h: 8 };
    for (const pl of w.players) {
      if (!pl.alive || pl.inVehicle || pl.car >= 0 || pl.vy <= 0 || !overlap(pl, roof)) continue;
      if (car.driver < 0 && car.enterCd <= 0) {
        car.driver = pl.id;
        pl.car = car.id;
        pl.climbing = false;
        w.sfx('door', car.x);
        w.text(car.x + 6, car.y - 12, 'ILTI!', '#ffe040');
      } else {
        pl.y = car.y - pl.h;
        pl.vy = -280;
        w.sfx('jump', pl.x);
      }
    }
  }
  w.cars = w.cars.filter((c) => !c.dead);
  for (const car of w.cars) seatDriver(w, car, dt);
}

/** keep the driver glued to the seat (camera and enemies use the player's position) */
export function seatDriver(w: World, car: Car, dt = 0): void {
  const p = driverOf(w, car);
  if (!p) return;
  p.x = car.x + car.w / 2 - p.w / 2;
  p.y = car.y + car.h - p.h;
  p.vx = car.vx;
  p.vy = car.vy;
  p.onGround = car.onGround;
  p.facing = car.facing;
  p.aim = car.aim;
  p.inv = Math.max(0, p.inv - dt);
  p.fireCd -= dt;
}
