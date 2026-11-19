import { GRAVITY, MAX_FALL, TILE } from '../config';
import { isOneWay } from '../world/tiles';
import { overlap } from './physics';
import type { Enemy, Prop } from './types';
import { ITEM_NAMES, WEAPONS, isSpecialItem, isWeaponItem } from './weapons';
import type { World } from './World';

const FALLING = new Set(['crate', 'barrel', 'cage', 'spikes', 'mine', 'flamejet', 'acid']);

function supported(w: World, x: number, y: number, wd: number): boolean {
  return w.grid.solidAt(x + 2, y + 1) || w.grid.solidAt(x + wd - 2, y + 1) || w.grid.oneWayAt(x + wd / 2, y + 1);
}

function enemiesIn(w: World, b: { x: number; y: number; w: number; h: number }): Enemy[] {
  return w.enemies.filter((e) => !e.dead && overlap(e, b));
}

export function updateProps(w: World, dt: number): void {
  for (const p of w.props) {
    if (p.dead) continue;
    p.t += dt;

    // props fall when the ground beneath them is destroyed
    if (FALLING.has(p.type) && !supported(w, p.x, p.y + p.h, p.w)) {
      if (p.type === 'spikes' || p.type === 'flamejet' || p.type === 'acid') {
        p.dead = true;
        continue;
      }
      p.dir = Math.min(MAX_FALL, (p.dir === 1 ? 0 : p.dir) + GRAVITY * dt) || 1;
      p.y += p.dir * dt;
      if (p.y > w.levelH) p.dead = true;
      if (supported(w, p.x, p.y + p.h, p.w)) {
        p.y = Math.floor((p.y + p.h) / TILE) * TILE - p.h;
        p.dir = 1;
      }
    }

    switch (p.type) {
      case 'barrel':
      case 'mine':
        if (p.type === 'mine' && p.state === 0) {
          const trig = w.overlapsAnyPlayer({ x: p.x - 2, y: p.y - 6, w: p.w + 4, h: p.h + 6 });
          if (trig) {
            p.state = 1;
            p.t = 0.3;
            w.sfx('beep', p.x);
          }
        } else if (p.state === 1) {
          p.t -= dt * 2; // t counts down (we added dt above)
          if (p.t <= 0) {
            p.dead = true;
            w.explode(p.x + p.w / 2, p.y + p.h / 2, p.type === 'barrel' ? 34 : 28, 5, 'n');
          }
        }
        break;
      case 'exit':
        if (w.overlapsAnyPlayer(p)) w.complete();
        break;
      case 'spikes': {
        const box = { x: p.x + 1, y: p.y + 2, w: p.w - 2, h: p.h - 2 };
        const pl = w.overlapsAnyPlayer(box);
        if (pl) {
          w.hurtPlayer(pl, 1);
          pl.vy = -230;
        }
        for (const e of enemiesIn(w, box)) w.killEnemy(e);
        break;
      }
      case 'flamejet': {
        const cycle = p.t % 3;
        const on = cycle > 2;
        p.state = on ? 1 : cycle > 1.6 ? 2 : 0; // 2 = warning sputter
        if (on) {
          const box = { x: p.x, y: p.y - 40, w: p.w, h: 40 };
          const pl = w.overlapsAnyPlayer(box);
          if (pl) w.hurtPlayer(pl, 1);
          for (const e of enemiesIn(w, box)) w.hurtEnemy(e, 6 * dt, p.x);
        }
        break;
      }
      case 'saw': {
        p.x += p.dir * 70 * dt;
        if (p.x > p.x2) {
          p.x = p.x2;
          p.dir = -1;
        } else if (p.x < p.x0) {
          p.x = p.x0;
          p.dir = 1;
        }
        const box = { x: p.x + 2, y: p.y + 2, w: p.w - 4, h: p.h - 4 };
        const pl = w.overlapsAnyPlayer(box);
        if (pl) w.hurtPlayer(pl, 1, p.x + p.w / 2);
        for (const e of enemiesIn(w, box)) w.killEnemy(e);
        break;
      }
      case 'acid': {
        const box = { x: p.x, y: p.y + 4, w: p.w, h: p.h };
        const pl = w.overlapsAnyPlayer(box);
        if (pl) {
          w.hurtPlayer(pl, 1);
          pl.vy = Math.min(pl.vy, -200);
        }
        for (const e of enemiesIn(w, box)) w.killEnemy(e);
        break;
      }
      case 'crusher':
        updateCrusher(w, p, dt);
        break;
    }
  }
}

function updateCrusher(w: World, p: Prop, dt: number): void {
  // state: 0 idle at ceiling, 1 falling, 2 resting, 3 rising
  if (p.state === 0) {
    const cx = p.x + p.w / 2;
    for (const pl of w.players) {
      if (pl.alive && Math.abs(pl.x + pl.w / 2 - cx) < 12 && pl.y > p.y) {
        p.state = 1;
        p.dir = 0;
        break;
      }
    }
  } else if (p.state === 1) {
    p.dir += GRAVITY * 1.2 * dt;
    p.y += p.dir * dt;
    const box = { x: p.x + 1, y: p.y + 4, w: p.w - 2, h: p.h - 4 };
    const pl = w.overlapsAnyPlayer(box);
    if (pl) w.hurtPlayer(pl, 2);
    for (const e of enemiesIn(w, box)) w.killEnemy(e);
    if (w.grid.solidAt(p.x + p.w / 2, p.y + p.h) || p.y > w.levelH) {
      p.y = Math.floor((p.y + p.h) / TILE) * TILE - p.h;
      p.state = 2;
      p.t = 0;
      w.sfx('crush', p.x);
      w.emit({ k: 'shake', a: 3 });
    }
  } else if (p.state === 2) {
    if (p.t > 1.2) p.state = 3;
  } else {
    p.y -= 35 * dt;
    if (p.y <= p.y0) {
      p.y = p.y0;
      p.state = 0;
    }
  }
}

export function updatePickups(w: World, dt: number): void {
  for (const k of w.pickups) {
    if (k.dead) continue;
    k.life -= dt;
    if (k.life <= 0) {
      k.dead = true;
      continue;
    }
    k.vy = Math.min(MAX_FALL, k.vy + GRAVITY * dt);
    const ny = k.y + k.vy * dt;
    const footY = ny + k.h;
    const ty = Math.floor(footY / TILE);
    const tx = Math.floor((k.x + k.w / 2) / TILE);
    const t = w.grid.get(tx, ty);
    if (k.vy > 0 && (w.grid.solidAt(k.x + k.w / 2, footY) || (isOneWay(t) && k.y + k.h <= ty * TILE + 1))) {
      k.y = ty * TILE - k.h;
      k.vy = 0;
    } else if (k.vy < 0 && w.grid.solidAt(k.x + k.w / 2, ny)) {
      k.vy = 0;
    } else k.y = ny;
    if (k.y > w.levelH) k.dead = true;

    // auto-collect
    for (const p of w.players) {
      if (!p.alive || !overlap(p, k)) continue;
      const it = k.item;
      let took = false;
      if (isWeaponItem(it)) {
        if (p.weapon === 'rifle') {
          p.weapon = it;
          p.ammo = WEAPONS[it].ammo;
          took = true;
        } else if (p.weapon === it) {
          p.ammo = WEAPONS[it].ammo;
          took = true;
        }
      } else if (isSpecialItem(it)) {
        if (p.special === it || p.specialCount === 0) {
          const base = p.special === it ? p.specialCount : 0;
          p.special = it;
          p.specialCount = Math.min(9, base + (it === 'grenade' ? 3 : 2));
          took = true;
        }
      } else {
        took = true;
        if (it === 'armor') p.armor = Math.min(3, p.armor + 2);
        else if (it === 'speed') p.speedT = 12;
        else if (it === 'life') w.lives++;
        else if (it === 'health') p.hp = Math.min(3, p.hp + 2);
        else if (it === 'ammo') {
          if (Number.isFinite(p.ammo)) p.ammo = WEAPONS[p.weapon].ammo;
          p.specialCount = Math.min(9, p.specialCount + 2);
        }
      }
      if (took) {
        k.dead = true;
        w.sfx('pickup', p.x);
        w.text(p.x - 10, p.y - 8, ITEM_NAMES[it], '#ffe040');
        break;
      }
    }
  }
}

export function updateDebris(w: World, dt: number): void {
  for (const d of w.debris) {
    if (d.dead) continue;
    d.vy = Math.min(MAX_FALL, d.vy + GRAVITY * dt);
    d.y += d.vy * dt;
    const box = { x: d.x + 1, y: d.y, w: TILE - 2, h: TILE };
    if (d.vy > 120) {
      const pl = w.overlapsAnyPlayer(box);
      if (pl) w.hurtPlayer(pl, 1);
      for (const e of w.enemies) if (!e.dead && overlap(e, box)) w.hurtEnemy(e, 2, d.x);
    }
    if (w.grid.solidAt(d.x + 8, d.y + TILE) || d.y > w.levelH) {
      d.dead = true;
      w.emit({ k: 'debris', x: d.x + 8, y: d.y + 8, t: d.t });
    }
  }
}
