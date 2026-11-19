import { CLIMB_SPEED, GRAVITY, JUMP_VEL, MAX_FALL, RUN_SPEED, TILE, WALL_SLIDE } from '../config';
import { IN, has, pressed } from '../core/input';
import { T, isOneWay } from '../world/tiles';
import { moveBody, overlap } from './physics';
import type { Player } from './types';
import { ITEM_NAMES, WEAPONS, isSpecialItem, isWeaponItem } from './weapons';
import type { World } from './World';

export function updatePlayer(w: World, p: Player, dt: number): void {
  if (!p.alive) {
    if (p.respawnT !== Infinity && p.connected) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) w.respawnPlayer(p);
    }
    return;
  }
  const dropThrough = steer(w, p, dt, true);
  actions(w, p);
  integrate(w, p, dt, dropThrough, true);
}

/** Guest-side prediction: movement only, no shooting, no side effects. */
export function predictPlayer(w: World, p: Player, dt: number): void {
  if (!p.alive) return;
  const dropThrough = steer(w, p, dt, false);
  integrate(w, p, dt, dropThrough, false);
}

/** input -> velocity (run, jump, ladders, wall climb). Returns drop-through flag. */
function steer(w: World, p: Player, dt: number, fx: boolean): boolean {
  const b = p.bits;
  const pv = p.prev;
  const left = has(b, IN.LEFT);
  const right = has(b, IN.RIGHT);
  const up = has(b, IN.UP);
  const down = has(b, IN.DOWN);
  const move = (right ? 1 : 0) - (left ? 1 : 0);

  p.inv = Math.max(0, p.inv - dt);
  p.speedT = Math.max(0, p.speedT - dt);
  p.wallJumpT = Math.max(0, p.wallJumpT - dt);
  p.firingT = Math.max(0, p.firingT - dt);
  p.fireCd -= dt;
  p.animT += dt;

  const speed = RUN_SPEED * (p.speedT > 0 ? 1.45 : 1);
  const cx = p.x + p.w / 2;
  const onLadder = w.grid.ladderAt(cx, p.y + p.h / 2) || w.grid.ladderAt(cx, p.y + p.h + 1);

  if (onLadder && (up || down) && !p.climbing) p.climbing = true;
  if (!onLadder) p.climbing = false;

  let dropThrough = false;
  if (p.climbing) {
    p.vy = up ? -CLIMB_SPEED : down ? CLIMB_SPEED : 0;
    p.vx = move * speed * 0.6;
    if (pressed(b, pv, IN.JUMP)) {
      p.climbing = false;
      p.vy = -JUMP_VEL * 0.8;
      if (fx) w.sfx('jump', p.x);
    }
    dropThrough = true;
  } else {
    if (p.wallJumpT <= 0) p.vx = move * speed;
    p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    if (p.onGround) p.coyote = 0.09;
    else p.coyote -= dt;

    const touchingWall = (move > 0 && p.wallR) || (move < 0 && p.wallL);
    if (!p.onGround && touchingWall) {
      // wall climb (hold jump/up) or slide
      if (has(b, IN.JUMP) || up) p.vy = Math.max(-CLIMB_SPEED, p.vy - 1400 * dt);
      else p.vy = Math.min(p.vy, WALL_SLIDE);
      if (pressed(b, pv, IN.JUMP) && p.vy > -CLIMB_SPEED + 5) {
        // wall jump away
        p.vy = -JUMP_VEL * 0.95;
        p.vx = -move * speed * 1.2;
        p.wallJumpT = 0.16;
        p.facing = -move;
        if (fx) w.sfx('jump', p.x);
      }
    }

    if (pressed(b, pv, IN.JUMP) && down && p.onGround && isOneWay(tileBelow(w, p))) {
      dropThrough = true;
      p.y += 2;
    } else if (pressed(b, pv, IN.JUMP) && (p.onGround || p.coyote > 0)) {
      p.vy = -JUMP_VEL;
      p.coyote = 0;
      if (fx) w.sfx('jump', p.x);
    }
    if (!has(b, IN.JUMP) && p.vy < -140 && !touchingWall) p.vy *= 0.6; // variable jump height
  }
  if (move !== 0 && p.wallJumpT <= 0) p.facing = move;
  return dropThrough;
}

function actions(w: World, p: Player): void {
  const b = p.bits;
  const pv = p.prev;
  const up = has(b, IN.UP);
  const down = has(b, IN.DOWN);

  // --- shooting
  const wd = WEAPONS[p.weapon];
  if (has(b, IN.FIRE) && p.fireCd <= 0 && !p.climbing) {
    p.fireCd = wd.rate;
    p.firingT = 0.15;
    const mx = p.x + p.w / 2 + p.facing * 8;
    const my = p.y + 7;
    for (let i = 0; i < wd.pellets; i++) {
      const a = (w.rng.next() - 0.5) * wd.spread * 2;
      const sp = wd.speed * (wd.pellets > 1 ? w.rng.range(0.8, 1.1) : 1);
      const vx = Math.cos(a) * sp * p.facing;
      const vy = Math.sin(a) * sp;
      w.spawnProjectile(wd.proj, mx, my, vx, vy, 'p', p.id, wd.dmg, wd.life * (wd.proj === 'flame' ? w.rng.range(0.8, 1.2) : 1));
    }
    if (wd.proj !== 'flame') w.emit({ k: 'muzzle', x: mx, y: my, d: p.facing });
    w.sfx(wd.sfx, p.x);
    if (wd.kick && !p.onGround) p.vx -= p.facing * wd.kick;
    else if (wd.kick) p.x -= p.facing * wd.kick * 0.02;
    if (Number.isFinite(p.ammo)) {
      p.ammo--;
      if (p.ammo <= 0) {
        p.weapon = 'rifle';
        p.ammo = Infinity;
        w.text(p.x - 8, p.y - 8, 'EMPTY', '#ff8080');
      }
    }
  }

  // --- special (grenade / C4)
  if (pressed(b, pv, IN.SPECIAL)) {
    const placed = w.projectiles.filter((pr) => pr.type === 'c4' && pr.ownerId === p.id && !pr.dead);
    if (p.special === 'c4' && placed.length && (p.specialCount === 0 || down)) {
      for (const c of placed) c.life = 0.01 + w.rng.range(0, 0.1);
      w.sfx('beep', p.x);
    } else if (p.specialCount > 0) {
      p.specialCount--;
      const throwVx = p.facing * (down ? 60 : 180) + p.vx * 0.4;
      const throwVy = down ? -60 : up ? -300 : -190;
      if (p.special === 'grenade') {
        w.spawnProjectile('grenade', p.x + p.w / 2, p.y + 4, throwVx, throwVy, 'p', p.id, 5, 1.6);
      } else {
        w.spawnProjectile('c4', p.x + p.w / 2, p.y + 4, throwVx, throwVy, 'p', p.id, 6, Infinity);
      }
      w.sfx('throw', p.x);
    } else if (p.special === 'c4' && placed.length) {
      for (const c of placed) c.life = 0.01;
    }
  }

  // --- interact: pick up / swap / throw weapon
  if (pressed(b, pv, IN.INTERACT)) {
    const pk = w.pickups.find((k) => !k.dead && overlap(p, k) && (isWeaponItem(k.item) || isSpecialItem(k.item)));
    if (pk) {
      if (isWeaponItem(pk.item)) {
        if (p.weapon !== 'rifle' && p.ammo > 0) w.spawnPickup(p.weapon, p.x, p.y, 15);
        p.weapon = pk.item;
        p.ammo = WEAPONS[pk.item].ammo;
      } else if (isSpecialItem(pk.item)) {
        if (p.special !== pk.item && p.specialCount > 0) w.spawnPickup(p.special, p.x, p.y, 15);
        p.special = pk.item;
        p.specialCount = pk.item === 'grenade' ? 3 : 2;
      }
      pk.dead = true;
      w.sfx('pickup', p.x);
      w.text(p.x - 10, p.y - 8, ITEM_NAMES[pk.item], '#ffe040');
    } else if (p.weapon !== 'rifle') {
      const t = w.spawnProjectile('thrown', p.x + p.w / 2, p.y + 4, p.facing * 260, -120, 'p', p.id, 4, 2);
      t.item = p.weapon;
      p.weapon = 'rifle';
      p.ammo = Infinity;
      w.sfx('throw', p.x);
    }
  }

}

function integrate(w: World, p: Player, dt: number, dropThrough: boolean, fx: boolean): void {
  moveBody(p, w.grid, dt, dropThrough);
  if (!fx) return;
  if (p.onGround) {
    const ty = Math.floor((p.y + p.h + 1) / TILE);
    w.touchCrumble(Math.floor((p.x + 1) / TILE), ty);
    w.touchCrumble(Math.floor((p.x + p.w - 1) / TILE), ty);
  }
  if (p.y > w.levelH + 16) {
    p.inv = 0;
    p.armor = 0;
    w.killPlayer(p);
  }
}

function tileBelow(w: World, p: Player): number {
  const ty = Math.floor((p.y + p.h + 1) / TILE);
  const t1 = w.grid.get(Math.floor((p.x + 1) / TILE), ty);
  const t2 = w.grid.get(Math.floor((p.x + p.w - 1) / TILE), ty);
  return isOneWay(t1) ? t1 : isOneWay(t2) ? t2 : T.EMPTY;
}
