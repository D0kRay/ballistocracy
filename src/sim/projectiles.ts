import { GRAVITY, TILE } from '../config';
import { pointIn } from './physics';
import type { Projectile } from './types';
import { hurtBoss, bossHitboxes } from './boss';
import type { World } from './World';

const GRAV: Partial<Record<Projectile['type'], number>> = {
  grenade: 1, c4: 1, thrown: 0.8, shell: 0.6, bomb: 1, mortar: 0.7, rock: 0.8, flame: -0.12,
};
const EXPLOSIVE: Partial<Record<Projectile['type'], [number, number]>> = {
  rocket: [30, 4], shell: [26, 3], bomb: [24, 3], mortar: [26, 3], missile: [22, 3],
};

export function updateProjectiles(w: World, dt: number): void {
  for (const pr of w.projectiles) {
    if (pr.dead) continue;
    pr.life -= dt;
    if (pr.life <= 0) {
      expire(w, pr);
      continue;
    }
    if (pr.stuck) {
      // C4 falls again when the surface it sticks to is blown away
      if (!w.grid.solidAt(pr.x - 3, pr.y) && !w.grid.solidAt(pr.x + 3, pr.y) && !w.grid.solidAt(pr.x, pr.y + 3) && !w.grid.solidAt(pr.x, pr.y - 3)) {
        pr.stuck = false;
      } else continue;
    }
    const g = GRAV[pr.type];
    if (g) pr.vy += GRAVITY * g * dt;
    if (pr.type === 'missile') steerMissile(w, pr, dt);
    if (pr.type === 'flame') {
      pr.vx *= 1 - 2.2 * dt;
    }

    const nx = pr.x + pr.vx * dt;
    const ny = pr.y + pr.vy * dt;
    if (w.grid.solidAt(nx, ny)) {
      onTileHit(w, pr, nx, ny);
      if (pr.dead || pr.stuck) continue;
    } else {
      pr.x = nx;
      pr.y = ny;
    }

    if (pr.x < -20 || pr.x > w.levelW + 20 || pr.y > w.levelH + 40 || pr.y < -300) {
      pr.dead = true;
      continue;
    }
    hitEntities(w, pr);
  }
}

function onTileHit(w: World, pr: Projectile, nx: number, ny: number): void {
  switch (pr.type) {
    case 'grenade': {
      const hitX = w.grid.solidAt(nx, pr.y);
      const hitY = w.grid.solidAt(pr.x, ny);
      if (hitX || !hitY) pr.vx *= -0.45;
      if (hitY || !hitX) {
        pr.vy *= -0.4;
        pr.vx *= 0.7;
      }
      if (Math.abs(pr.vy) > 40) w.sfx('clink', pr.x);
      break;
    }
    case 'c4':
      pr.stuck = true;
      pr.vx = 0;
      pr.vy = 0;
      break;
    case 'rocket':
    case 'shell':
    case 'bomb':
    case 'mortar':
    case 'missile':
      detonate(w, pr);
      break;
    default:
      pr.dead = true;
      if (pr.type !== 'flame') w.emit({ k: 'spark', x: pr.x, y: pr.y });
  }
}

function detonate(w: World, pr: Projectile): void {
  pr.dead = true;
  const ex = EXPLOSIVE[pr.type];
  if (ex) w.explode(pr.x, pr.y, ex[0], ex[1], pr.owner);
  else if (pr.type === 'grenade') w.explode(pr.x, pr.y, 36, pr.dmg, pr.owner);
  else if (pr.type === 'c4') w.explode(pr.x, pr.y, 44, pr.dmg, pr.owner);
}

function expire(w: World, pr: Projectile): void {
  if (pr.type === 'grenade' || pr.type === 'c4' || EXPLOSIVE[pr.type]) detonate(w, pr);
  else pr.dead = true;
}

function steerMissile(w: World, pr: Projectile, dt: number): void {
  let best = null as null | { x: number; y: number };
  let bd = Infinity;
  for (const p of w.players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - pr.x, p.y - pr.y);
    if (d < bd) {
      bd = d;
      best = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    }
  }
  if (!best) return;
  const sp = Math.hypot(pr.vx, pr.vy) || 1;
  const want = Math.atan2(best.y - pr.y, best.x - pr.x);
  let cur = Math.atan2(pr.vy, pr.vx);
  let diff = want - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  cur += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
  pr.vx = Math.cos(cur) * sp;
  pr.vy = Math.sin(cur) * sp;
}

function hitEntities(w: World, pr: Projectile): void {
  if (pr.type === 'c4' || pr.type === 'grenade') return; // only explode
  const explosive = !!EXPLOSIVE[pr.type];

  if (pr.owner === 'p') {
    for (const e of w.enemies) {
      if (e.dead || pr.hits.includes(e.id) || !pointIn(pr.x, pr.y, e)) continue;
      if (explosive) return detonate(w, pr);
      const blocked = e.type === 'shield' && Math.sign(pr.vx) === -e.facing && pr.type !== 'thrown';
      if (blocked) {
        w.emit({ k: 'spark', x: pr.x, y: pr.y });
        w.sfx('clink', pr.x);
        pr.dead = true;
        return;
      }
      w.hurtEnemy(e, pr.dmg, pr.x - pr.vx);
      e.vx += Math.sign(pr.vx) * 30;
      if (pr.type === 'flame') {
        pr.hits.push(e.id);
        continue;
      }
      pr.dead = true;
      return;
    }
    const b = w.boss;
    if (b && b.visible && !b.dead && b.dying <= 0) {
      for (const hb of bossHitboxes(b)) {
        if (pointIn(pr.x, pr.y, hb) && !pr.hits.includes(b.id)) {
          if (explosive) return detonate(w, pr);
          hurtBoss(w, b, pr.dmg);
          w.emit({ k: 'spark', x: pr.x, y: pr.y });
          if (pr.type === 'flame') {
            pr.hits.push(b.id);
            break;
          }
          pr.dead = true;
          return;
        }
      }
    }
  } else {
    for (const p of w.players) {
      if (!p.alive || !pointIn(pr.x, pr.y, p)) continue;
      if (explosive) return detonate(w, pr);
      if (p.inv > 0) continue;
      w.hurtPlayer(p, pr.dmg, pr.x - pr.vx);
      pr.dead = true;
      return;
    }
  }
  // props (crates, barrels, cages) are hit by everyone
  for (const pp of w.props) {
    if (pp.dead || !Number.isFinite(pp.hp) || pp.type === 'mine') continue;
    if (!pointIn(pr.x, pr.y, pp)) continue;
    if (explosive) return detonate(w, pr);
    w.damageProp(pp, pr.dmg);
    w.emit({ k: 'spark', x: pr.x, y: pr.y });
    if (pr.type !== 'flame') {
      pr.dead = true;
      return;
    }
  }
  void TILE;
}
