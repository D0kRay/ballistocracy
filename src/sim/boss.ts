import { GRAVITY, MAX_FALL, TILE, VIEW_H } from '../config';
import type { BossType } from '../progress/difficulty';
import { moveBody, overlap } from './physics';
import type { Boss, Player } from './types';
import type { World } from './World';

export const BOSS_DEFS: Record<BossType, { name: string; w: number; h: number; hp: number }> = {
  tank: { name: 'IRON HOG', w: 56, h: 30, hp: 110 },
  gunship: { name: 'HORNET GUNSHIP', w: 64, h: 24, hp: 95 },
  drill: { name: 'THE BURROWER', w: 20, h: 20, hp: 90 },
};

export function spawnBoss(w: World, type: BossType): Boss {
  const a = w.level.arena!;
  const d = BOSS_DEFS[type];
  const n = Math.max(1, w.players.filter((p) => p.connected).length);
  const hp = Math.round(d.hp * (1 + 0.45 * (n - 1)));
  const b: Boss = {
    id: w.id(),
    type,
    name: d.name,
    x: a.x1 - d.w - 40,
    y: type === 'tank' ? 40 : type === 'gunship' ? -60 : w.levelH - TILE - d.h,
    w: d.w,
    h: d.h,
    vx: 0,
    vy: 0,
    hp,
    maxHp: hp,
    phase: 1,
    state: type === 'drill' ? 'under' : 'move',
    t: 0,
    cd: 2,
    cd2: 3,
    cd3: 5,
    burst: 0,
    tx: a.x0 + 60,
    facing: -1,
    hurtT: 0,
    dying: 0,
    visible: type !== 'drill',
    segs: [],
    trail: [],
    dead: false,
    onGround: false,
    wallL: false,
    wallR: false,
  };
  w.emit({ k: 'banner', s: d.name, sub: 'WARNING: BOSS APPROACHING' });
  w.sfx('boss', b.x);
  return b;
}

export function bossHitboxes(b: Boss): { x: number; y: number; w: number; h: number }[] {
  if (b.type !== 'drill') return [b];
  return [b, ...b.segs.map((s) => ({ x: s.x + 2, y: s.y + 2, w: 14, h: 14 }))];
}

export function hurtBoss(w: World, b: Boss, n: number): void {
  if (b.dying > 0 || b.dead || !b.visible) return;
  b.hp -= n;
  b.hurtT = 0.08;
  if (b.phase === 1 && b.hp <= b.maxHp / 2) {
    b.phase = 2;
    w.text(b.x, b.y - 12, 'ENRAGED!', '#ff4040');
    w.sfx('boss', b.x);
  }
  if (b.hp <= 0) {
    b.hp = 0;
    b.dying = 2.4;
    w.sfx('bigboom', b.x);
  }
}

function nearest(w: World, b: Boss): Player | null {
  let best: Player | null = null;
  let bd = Infinity;
  for (const p of w.players) {
    if (!p.alive) continue;
    const d = Math.abs(p.x - (b.x + b.w / 2));
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function lob(w: World, x: number, y: number, tx: number, ty: number, type: 'shell' | 'mortar' | 'rock', T: number, grav: number): void {
  const g = GRAVITY * grav;
  const vx = (tx - x) / T;
  const vy = (ty - y - 0.5 * g * T * T) / T;
  w.spawnProjectile(type, x, y, vx, vy, 'e', -1, 3, 5);
}

export function updateBoss(w: World, b: Boss, dt: number): void {
  const a = w.level.arena!;
  b.t += dt;
  b.cd -= dt;
  b.cd2 -= dt;
  b.cd3 -= dt;
  b.hurtT = Math.max(0, b.hurtT - dt);

  if (b.dying > 0) {
    b.dying -= dt;
    if (w.rng.chance(0.25)) {
      const x = b.x + w.rng.range(0, b.w);
      const y = b.y + w.rng.range(0, b.h);
      w.emit({ k: 'boom', x, y, r: w.rng.range(10, 22) });
      w.sfx('boom', x);
    }
    if (b.type === 'gunship') b.y += 30 * dt;
    if (b.dying <= 0) {
      b.dead = true;
      w.explode(b.x + b.w / 2, b.y + b.h / 2, 44, 6, 'p');
      w.onBossDefeated();
    }
    return;
  }

  const tp = nearest(w, b);
  const fast = b.phase === 2;
  if (tp) b.facing = tp.x + tp.w / 2 > b.x + b.w / 2 ? 1 : -1;

  if (b.type === 'tank') {
    if (Math.abs(b.x - b.tx) < 6 || b.t > 3.5) {
      b.tx = w.rng.range(a.x0 + 24, a.x1 - b.w - 24);
      b.t = 0;
    }
    b.vx = Math.sign(b.tx - b.x) * (fast ? 60 : 38);
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
    moveBody(b, w.grid, dt);
    if (tp && b.cd <= 0) {
      const mx = b.x + b.w / 2 + b.facing * 26;
      const my = b.y + 4;
      const dist = Math.abs(tp.x - mx);
      lob(w, mx, my, tp.x + tp.w / 2, tp.y + tp.h, 'shell', 0.8 + dist / 420, 0.6);
      w.emit({ k: 'muzzle', x: mx, y: my, d: b.facing });
      w.sfx('rocket', mx);
      b.cd = fast ? 1.3 : 2.2;
    }
    if (tp && b.cd2 <= 0) {
      if (b.burst <= 0) b.burst = fast ? 8 : 5;
      const sx = b.x + b.w / 2 + b.facing * 20;
      const sy = b.y + b.h - 12;
      w.spawnProjectile('ebullet', sx, sy, b.facing * 230, w.rng.range(-20, 20), 'e', b.id, 1, 1.4);
      w.sfx('eshoot', sx);
      b.burst--;
      b.cd2 = b.burst > 0 ? 0.1 : 2.6;
    }
    if (fast && tp && b.cd3 <= 0) {
      for (let i = 0; i < 3; i++) {
        lob(w, b.x + b.w / 2, b.y, tp.x + w.rng.range(-50, 50), tp.y + tp.h, 'mortar', 1.4 + i * 0.15, 0.7);
      }
      w.sfx('rocket', b.x);
      b.cd3 = 4;
    }
    const pl = w.overlapsAnyPlayer(b);
    if (pl) w.hurtPlayer(pl, 1, b.x + b.w / 2);
  } else if (b.type === 'gunship') {
    const floorRow = w.grid.surfaceRow(Math.floor((a.x0 + a.x1) / 2 / TILE));
    const hover = Math.max(w.levelH - VIEW_H + 24, (floorRow < 0 ? 12 : floorRow) * TILE - 110);
    if (b.y < hover) b.y = Math.min(hover, b.y + 50 * dt);
    else b.y = hover + Math.sin(b.t * 1.7) * 6;
    const cx = (a.x0 + a.x1) / 2 - b.w / 2;
    const span = (a.x1 - a.x0) / 2 - b.w / 2 - 8;
    b.x = cx + Math.sin(b.t * (fast ? 0.9 : 0.6)) * span;
    if (tp && b.cd <= 0) {
      if (b.burst <= 0) b.burst = 6;
      const sx = b.x + b.w / 2 + b.facing * 18;
      const sy = b.y + b.h - 2;
      const dx = tp.x + tp.w / 2 - sx;
      const dy = tp.y + 6 - sy;
      const d = Math.hypot(dx, dy) || 1;
      w.spawnProjectile('ebullet', sx, sy, (dx / d) * 240, (dy / d) * 240, 'e', b.id, 1, 2);
      w.sfx('eshoot', sx);
      b.burst--;
      b.cd = b.burst > 0 ? 0.11 : fast ? 1.4 : 2.2;
    }
    if (tp && b.cd2 <= 0 && Math.abs(tp.x - (b.x + b.w / 2)) < 40) {
      w.spawnProjectile('bomb', b.x + b.w / 2, b.y + b.h, b.vx * 0.2, 30, 'e', b.id, 3, 4);
      b.cd2 = 1.1;
    }
    if (fast && b.cd3 <= 0) {
      for (const s of [-1, 1]) w.spawnProjectile('missile', b.x + b.w / 2, b.y + b.h / 2, s * 110, -60, 'e', b.id, 3, 4);
      w.sfx('rocket', b.x);
      b.cd3 = 3.5;
    }
  } else {
    updateDrill(w, b, tp, dt, fast);
  }
}

function updateDrill(w: World, b: Boss, tp: Player | null, dt: number, fast: boolean): void {
  const a = w.level.arena!;
  const underY = w.levelH - TILE - b.h - 2;
  if (b.state === 'under') {
    b.visible = false;
    b.y = underY;
    if (tp) b.x += Math.sign(tp.x - b.x) * Math.min(Math.abs(tp.x - b.x), (fast ? 130 : 85) * dt);
    if (w.rng.chance(0.3)) w.emit({ k: 'debris', x: b.x + b.w / 2 + w.rng.range(-6, 6), y: a.floorRow * TILE - 4, t: 1 });
    if (b.t > (fast ? 1.1 : 1.7)) {
      b.state = 'rise';
      b.visible = true;
      b.vy = -490;
      b.vx = tp ? Math.sign(tp.x - b.x) * 55 : 0;
      b.t = 0;
      b.burst = 0;
      w.emit({ k: 'shake', a: 5 });
      w.sfx('crush', b.x);
    }
  } else {
    const prevVy = b.vy;
    b.vy += GRAVITY * 0.65 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // dig through destructible terrain
    const x0 = Math.floor((b.x - 2) / TILE);
    const x1 = Math.floor((b.x + b.w + 2) / TILE);
    const y0 = Math.floor((b.y - 2) / TILE);
    const y1 = Math.floor((b.y + b.h + 2) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = w.grid.get(tx, ty);
        if (w.grid.damage(tx, ty, 99)) w.emit({ k: 'debris', x: tx * TILE + 8, y: ty * TILE + 8, t });
      }
    }
    if (fast && prevVy < 0 && b.vy >= 0 && tp) {
      for (let i = -1; i <= 1; i++) lob(w, b.x + b.w / 2, b.y, tp.x + i * 40, tp.y + tp.h, 'rock', 0.9, 0.8);
    }
    if (b.vy > 0 && b.y > underY - 4) {
      b.state = 'under';
      b.t = 0;
    }
    for (const hb of bossHitboxes(b)) {
      for (const p of w.players) if (p.alive && overlap(p, hb)) w.hurtPlayer(p, 1, hb.x + hb.w / 2);
    }
  }
  b.x = Math.max(a.x0 + 4, Math.min(a.x1 - b.w - 4, b.x));
  b.trail.unshift({ x: b.x, y: b.y });
  if (b.trail.length > 48) b.trail.pop();
  b.segs = [];
  if (b.visible) {
    for (let i = 1; i <= 7; i++) {
      const s = b.trail[i * 5];
      if (s && s.y < underY - 2) b.segs.push({ x: s.x, y: s.y });
    }
  }
}
