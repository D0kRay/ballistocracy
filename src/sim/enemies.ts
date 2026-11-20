import { GRAVITY, MAX_FALL, TILE } from '../config';
import type { EnemyType } from '../progress/difficulty';
import { isOneWay, isSolid } from '../world/tiles';
import { moveBody } from './physics';
import type { Enemy, Player } from './types';
import type { World } from './World';

export interface EnemyDef {
  hp: number;
  speed: number;
  chase: number;
  sight: number;
  w: number;
  h: number;
}

export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  grunt: { hp: 1, speed: 28, chase: 50, sight: 170, w: 10, h: 14 },
  shield: { hp: 3, speed: 20, chase: 38, sight: 150, w: 12, h: 14 },
  sniper: { hp: 1, speed: 0, chase: 0, sight: 300, w: 10, h: 14 },
  bomber: { hp: 1, speed: 28, chase: 100, sight: 150, w: 10, h: 14 },
  dog: { hp: 1, speed: 40, chase: 135, sight: 160, w: 14, h: 9 },
  drone: { hp: 2, speed: 35, chase: 60, sight: 190, w: 14, h: 8 },
  heavy: { hp: 9, speed: 16, chase: 26, sight: 190, w: 12, h: 15 },
};

function findTarget(w: World, e: Enemy, range: number): Player | null {
  let best: Player | null = null;
  let bd = Infinity;
  const ex = e.x + e.w / 2;
  const ey = e.y + 4;
  for (const p of w.players) {
    if (!p.alive || p.inVehicle) continue;
    const dx = p.x + p.w / 2 - ex;
    const dy = p.y + p.h / 2 - ey;
    if (Math.abs(dx) > range || Math.abs(dy) > (e.type === 'drone' ? 160 : 72)) continue;
    const facingOk = Math.sign(dx) === e.facing || Math.abs(dx) < 36 || e.state !== 'patrol';
    if (!facingOk) continue;
    if (!w.grid.los(ex, ey, p.x + p.w / 2, p.y + 5)) continue;
    const d = Math.abs(dx) + Math.abs(dy);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function alarm(w: World, src: Enemy): void {
  for (const o of w.enemies) {
    if (o === src || o.dead || o.state !== 'patrol') continue;
    if (Math.abs(o.x - src.x) < 110 && Math.abs(o.y - src.y) < 60) {
      o.state = 'alert';
      o.t = 0.5 + w.rng.range(0, 0.4);
      o.facing = src.x > o.x ? 1 : -1;
    }
  }
}

function ledgeAhead(w: World, e: Enemy): boolean {
  const col = Math.floor((e.facing > 0 ? e.x + e.w + 2 : e.x - 2) / TILE);
  const row = Math.floor((e.y + e.h + 2) / TILE);
  const t = w.grid.get(col, row);
  return !isSolid(t) && !isOneWay(t);
}

function shoot(w: World, e: Enemy, target: Player, speed: number, aimFactor = 0.6): void {
  const sx = e.x + e.w / 2 + e.facing * 7;
  const sy = e.y + 6;
  const dx = target.x + target.w / 2 - sx;
  const dy = target.y + 6 - sy;
  const d = Math.hypot(dx, dy) || 1;
  const vy = Math.max(-speed * aimFactor, Math.min(speed * aimFactor, (dy / d) * speed));
  w.spawnProjectile('ebullet', sx, sy, e.facing * Math.sqrt(Math.max(1, speed * speed - vy * vy)), vy, 'e', e.id, 1, 1.3);
  w.emit({ k: 'muzzle', x: sx, y: sy, d: e.facing });
  w.sfx(e.type === 'sniper' ? 'snipe' : 'eshoot', e.x);
}

export function updateEnemies(w: World, dt: number): void {
  for (const e of w.enemies) {
    if (e.dead || !w.isActive(e.x)) continue;
    const def = ENEMY_DEFS[e.type];
    e.animT += dt;
    e.hurtT = Math.max(0, e.hurtT - dt);
    e.cd -= dt;
    e.t -= dt;

    const target = findTarget(w, e, def.sight);
    const flying = e.type === 'drone';

    if (e.state === 'patrol') {
      e.vx = e.facing * def.speed;
      if (!flying && (ledgeAhead(w, e) || (e.facing > 0 ? e.wallR : e.wallL))) {
        e.facing = -e.facing;
        e.vx = 0;
      }
      if (flying && (e.facing > 0 ? e.wallR : e.wallL)) e.facing = -e.facing;
      if (target) {
        e.state = 'alert';
        e.t = e.type === 'dog' || e.type === 'bomber' ? 0.25 : 0.45;
        e.targetId = target.id;
        e.facing = target.x > e.x ? 1 : -1;
        w.text(e.x + 2, e.y - 10, '!', '#ff4040');
        w.sfx('alert', e.x);
        alarm(w, e);
      }
    } else if (e.state === 'alert') {
      e.vx = 0;
      if (target) e.facing = target.x > e.x ? 1 : -1;
      if (e.t <= 0) {
        e.state = 'attack';
        e.t = 3;
      }
    } else {
      // attack / aim
      if (target) {
        e.t = 3;
        e.targetId = target.id;
      } else if (e.t <= 0) {
        e.state = 'patrol';
        e.burst = 0;
      }
      const tp = target ?? w.players.find((p) => p.id === e.targetId && p.alive) ?? null;
      if (!tp) {
        e.state = 'patrol';
      } else {
        const dx = tp.x - e.x;
        const dist = Math.abs(dx);
        e.facing = dx > 0 ? 1 : -1;
        attack(w, e, def, tp, target !== null, dist, dt);
      }
    }

    // physics
    if (flying) {
      const bob = Math.sin(e.animT * 3) * 8;
      e.vy = (e.baseY + bob - e.y) * 3;
      moveBody(e, w.grid, dt, true);
    } else {
      e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
      const vxWanted = e.vx;
      moveBody(e, w.grid, dt);
      e.vx = vxWanted * 0.9;
    }
    if (e.y > w.levelH + 16) w.killEnemy(e);

    // contact damage
    if ((e.type === 'dog' || e.type === 'bomber') && e.state === 'attack') {
      const p = w.overlapsAnyPlayer(e);
      if (p) {
        if (e.type === 'bomber') {
          w.killEnemy(e);
        } else if (e.cd <= 0) {
          w.hurtPlayer(p, 1, e.x);
          e.cd = 0.8;
        }
      }
    }
  }
}

function attack(w: World, e: Enemy, def: EnemyDef, tp: Player, visible: boolean, dist: number, dt: number): void {
  const dy = tp.y - e.y;
  switch (e.type) {
    case 'grunt':
    case 'heavy': {
      const far = e.type === 'grunt' ? 120 : 150;
      e.vx = dist > far && !ledgeAhead(w, e) ? e.facing * def.chase : 0;
      if (e.burst > 0 && e.cd <= 0) {
        shoot(w, e, tp, e.type === 'heavy' ? 260 : 220);
        e.burst--;
        e.cd = e.burst > 0 ? (e.type === 'heavy' ? 0.07 : 0.14) : w.rng.range(1.2, 2.0);
      } else if (e.burst === 0 && e.cd <= 0 && visible && Math.abs(dy) < 50) {
        e.burst = e.type === 'heavy' ? 10 : 3;
      }
      break;
    }
    case 'shield': {
      e.vx = dist > 50 && !ledgeAhead(w, e) ? e.facing * def.chase : 0;
      if (e.cd <= 0 && visible && Math.abs(dy) < 40) {
        shoot(w, e, tp, 200);
        e.cd = w.rng.range(1.6, 2.4);
      }
      break;
    }
    case 'sniper': {
      e.vx = 0;
      if (e.state === 'attack' && e.cd <= 0 && visible) {
        e.state = 'aim';
        e.cd = 0.9;
      } else if (e.state === 'aim' && e.cd <= 0) {
        if (visible) shoot(w, e, tp, 520, 1);
        e.state = 'attack';
        e.cd = w.rng.range(2, 2.8);
      }
      break;
    }
    case 'bomber': {
      e.vx = e.facing * def.chase;
      if ((e.facing > 0 ? e.wallR : e.wallL) && e.onGround) e.vy = -280;
      if (dist < 14 && Math.abs(dy) < 16) w.killEnemy(e);
      break;
    }
    case 'dog': {
      e.vx = e.facing * def.chase;
      if (e.onGround && ((e.facing > 0 ? e.wallR : e.wallL) || (dist < 50 && dy < -4) || ledgeAhead(w, e))) {
        e.vy = -270;
      }
      break;
    }
    case 'drone': {
      const tx = tp.x + tp.w / 2 - (e.x + e.w / 2);
      e.vx = Math.sign(tx) * Math.min(def.chase, Math.abs(tx) * 3);
      if (Math.abs(tx) < 12 && e.cd <= 0) {
        w.spawnProjectile('bomb', e.x + e.w / 2, e.y + e.h + 2, 0, 20, 'e', e.id, 3, 4);
        e.cd = 1.8;
      }
      break;
    }
  }
  void dt;
}
