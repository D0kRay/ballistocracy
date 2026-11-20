import { ACTIVE_RANGE, CAMERA_MARGIN, PLAYER_H, PLAYER_HP, PLAYER_W, RESPAWN_TIME, START_LIVES, TILE, VIEW_H, VIEW_W } from '../config';
import { computeCamera, clampToView, type Cam } from '../camera/coopCamera';
import { Rng, clamp } from '../core/rng';
import type { EnemyType } from '../progress/difficulty';
import { biomeById, type Biome } from '../world/biomes';
import type { Grid } from '../world/Grid';
import type { ItemId, Level, PropSpawn } from '../world/LevelGen';
import { T } from '../world/tiles';
import { makeBody, overlap } from './physics';
import type { Boss, Debris, Enemy, GameEvent, Owner, Pickup, Player, Projectile, Prop, ProjType, SfxName } from './types';
import { updatePlayer } from './players';
import { HERO_LOADOUT } from './weapons';
import { ENEMY_DEFS, updateEnemies } from './enemies';
import { updateProjectiles } from './projectiles';
import { updateProps, updatePickups, updateDebris } from './props';
import { spawnBoss, updateBoss, hurtBoss } from './boss';

export interface PlayerDef {
  pid: number;
  hero: number;
  name: string;
}

export const HERO_NAMES = ['MAJOR MAYHEM', 'LT. BLAZE', 'CPL. CRATER', 'PVT. HAVOC'];

export type Status = 'playing' | 'complete' | 'gameover';

export class World {
  readonly level: Level;
  readonly grid: Grid;
  readonly biome: Biome;
  readonly levelW: number;
  readonly levelH: number;
  players: Player[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  props: Prop[] = [];
  pickups: Pickup[] = [];
  debris: Debris[] = [];
  boss: Boss | null = null;
  cam: Cam = { x: 0, y: 0 };
  lives: number;
  time = 0;
  status: Status = 'playing';
  statusT = 0;
  events: GameEvent[] = [];
  nextId = 1;
  rng: Rng;
  arenaLocked = false;
  bossDefeated = false;
  kills = 0;
  crumbles = new Map<number, number>();
  /** intro helicopter that drops the squad at the level start */
  intro: { t: number; x: number; y: number; dropped: number; x0: number } | null = null;

  constructor(level: Level, defs: PlayerDef[], lives = START_LIVES) {
    this.level = level;
    this.grid = level.grid;
    this.biome = biomeById(level.plan.biome);
    this.levelW = this.grid.w * TILE;
    this.levelH = this.grid.h * TILE;
    this.lives = lives;
    this.rng = new Rng(level.plan.seed ^ 0x51ed);

    defs.forEach((d, i) => this.players.push(this.makePlayer(d, level.spawn.x + i * 14, level.spawn.y)));
    for (const e of level.enemies) this.spawnEnemy(e.type, e.x, e.y);
    for (const p of level.props) this.spawnProp(p);
    for (const p of level.pickups) this.spawnPickup(p.item, p.x, p.y, Infinity);

    this.cam = {
      x: clamp(level.spawn.x - VIEW_W / 3, 0, Math.max(0, this.levelW - VIEW_W)),
      y: Math.max(0, this.levelH - VIEW_H),
    };
    if (this.players.length) {
      const x0 = this.cam.x - 90;
      this.intro = { t: 0, x: x0, y: level.spawn.y - 58, dropped: 0, x0 };
      for (const p of this.players) {
        p.inVehicle = true;
        p.inv = 999;
      }
    }
  }

  id(): number {
    return this.nextId++;
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }
  sfx(n: SfxName, x: number): void {
    this.events.push({ k: 'sfx', n, x });
  }
  text(x: number, y: number, s: string, c = '#ffffff'): void {
    this.events.push({ k: 'text', x, y, s, c });
  }

  makePlayer(d: PlayerDef, x: number, y: number): Player {
    return {
      ...makeBody(x, y, PLAYER_W, PLAYER_H),
      id: this.id(),
      pid: d.pid,
      hero: d.hero,
      name: d.name,
      hp: PLAYER_HP,
      armor: 0,
      inv: 1.5,
      alive: true,
      respawnT: 0,
      weapon: HERO_LOADOUT[d.hero % 4].weapon,
      base: HERO_LOADOUT[d.hero % 4].weapon,
      ammo: Infinity,
      special: HERO_LOADOUT[d.hero % 4].special,
      specialCount: HERO_LOADOUT[d.hero % 4].count,
      fireCd: 0,
      facing: 1,
      climbing: false,
      coyote: 0,
      wallJumpT: 0,
      speedT: 0,
      firingT: 0,
      aim: 0,
      animT: 0,
      bits: 0,
      prev: 0,
      connected: true,
      inVehicle: false,
    };
  }

  spawnEnemy(type: EnemyType, x: number, y: number): Enemy {
    const d = ENEMY_DEFS[type];
    const e: Enemy = {
      ...makeBody(x, y + 14 - d.h, d.w, d.h),
      id: this.id(),
      type,
      hp: d.hp,
      maxHp: d.hp,
      facing: this.rng.chance(0.5) ? 1 : -1,
      state: 'patrol',
      t: 0,
      cd: this.rng.range(0.5, 1.5),
      burst: 0,
      targetId: -1,
      hurtT: 0,
      baseY: y,
      animT: this.rng.range(0, 1),
      dead: false,
    };
    this.enemies.push(e);
    return e;
  }

  spawnProp(s: PropSpawn): Prop {
    const hp: Record<string, number> = { crate: 3, barrel: 2, cage: 1, mine: 1 };
    const p: Prop = {
      id: this.id(),
      type: s.type,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      hp: hp[s.type] ?? Infinity,
      state: 0,
      t: this.rng.range(0, 3),
      x0: s.x,
      x2: s.x2 ?? s.x,
      y0: s.y,
      dir: 1,
      item: s.item,
      variant: s.variant,
      dead: false,
    };
    this.props.push(p);
    return p;
  }

  spawnPickup(item: ItemId, x: number, y: number, life = 14): Pickup {
    const p: Pickup = { id: this.id(), item, x, y, w: 12, h: 12, vy: -120, life, dead: false };
    this.pickups.push(p);
    return p;
  }

  spawnProjectile(type: ProjType, x: number, y: number, vx: number, vy: number, owner: Owner, ownerId: number, dmg: number, life: number): Projectile {
    const p: Projectile = { id: this.id(), type, x, y, vx, vy, owner, ownerId, dmg, life, stuck: false, dead: false, hits: [] };
    this.projectiles.push(p);
    return p;
  }

  alivePlayers(): Player[] {
    return this.players.filter((p) => p.alive && !p.inVehicle);
  }

  private updateIntro(dt: number): void {
    const it = this.intro;
    if (!it) return;
    it.t += dt;
    const target = this.level.spawn.x + 10;
    const arrive = 1.5;
    const dropGap = 0.22;
    const dropEnd = arrive + dropGap * this.players.length;
    if (it.t < arrive) {
      const k = it.t / arrive;
      it.x = it.x0 + (target - it.x0) * (1 - (1 - k) * (1 - k));
    } else if (it.t < dropEnd + 0.3) {
      it.x = target;
      const due = Math.min(this.players.length, Math.floor((it.t - arrive) / dropGap) + 1);
      while (it.dropped < due) {
        const p = this.players[it.dropped++];
        p.inVehicle = false;
        p.x = it.x - 6 + (it.dropped % 2 ? -4 : 4);
        p.y = it.y + 16;
        p.vx = 0;
        p.vy = 30;
        p.inv = 1.5;
        this.sfx('jump', p.x);
      }
    } else {
      it.x += 170 * dt;
      it.y -= 50 * dt;
      if (it.x > this.cam.x + VIEW_W + 120) this.intro = null;
    }
    // undropped players ride along (keeps them out of harm's way)
    for (const p of this.players) if (p.inVehicle && it) {
      p.x = it.x;
      p.y = it.y;
    }
  }

  // ------------------------------------------------------------------
  step(dt: number, inputs: Map<number, number>): void {
    this.time += dt;
    for (const p of this.players) {
      p.prev = p.bits;
      p.bits = p.connected ? inputs.get(p.pid) ?? 0 : 0;
    }
    if (this.status !== 'playing') {
      this.statusT += dt;
      updateProjectiles(this, dt);
      updateDebris(this, dt);
      return;
    }

    this.updateIntro(dt);
    for (const p of this.players) if (!p.inVehicle) updatePlayer(this, p, dt);
    updateEnemies(this, dt);
    if (this.boss) updateBoss(this, this.boss, dt);
    updateProjectiles(this, dt);
    updateProps(this, dt);
    updatePickups(this, dt);
    updateDebris(this, dt);
    this.updateCrumbles(dt);
    this.updateArena();

    // camera + keep everyone on screen
    const alive = this.alivePlayers();
    this.cam = computeCamera(this.cam, alive, this.levelW, this.levelH, VIEW_W, VIEW_H, CAMERA_MARGIN, this.arenaLocked && this.level.arena ? this.level.arena.x0 : null);
    if (this.arenaLocked) this.cam.y = Math.max(0, this.levelH - VIEW_H);
    for (const p of alive) clampToView(p, this.cam, VIEW_W);

    // cleanup
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.props = this.props.filter((p) => !p.dead);
    this.pickups = this.pickups.filter((p) => !p.dead);
    this.debris = this.debris.filter((d) => !d.dead);
    if (this.boss?.dead) this.boss = null;

    // lose condition
    if (this.players.length && this.players.every((p) => !p.alive && (p.respawnT === Infinity || !p.connected))) {
      this.status = 'gameover';
      this.statusT = 0;
      this.emit({ k: 'banner', s: 'GAME OVER', sub: 'ALL HEROES DOWN' });
    }
  }

  complete(): void {
    if (this.status !== 'playing') return;
    this.status = 'complete';
    this.statusT = 0;
    this.sfx('clear', this.cam.x + VIEW_W / 2);
    this.emit({ k: 'banner', s: 'MISSION COMPLETE', sub: `LEVEL ${this.level.plan.level}` });
  }

  private updateCrumbles(dt: number): void {
    for (const [i, t] of this.crumbles) {
      const nt = t - dt;
      if (nt <= 0) {
        const x = i % this.grid.w;
        const y = Math.floor(i / this.grid.w);
        if (this.grid.get(x, y) === T.CRUMBLE) {
          this.grid.set(x, y, T.EMPTY);
          this.emit({ k: 'debris', x: x * TILE + 8, y: y * TILE + 8, t: T.CRUMBLE });
        }
        this.crumbles.delete(i);
      } else this.crumbles.set(i, nt);
    }
  }

  touchCrumble(tx: number, ty: number): void {
    if (this.grid.get(tx, ty) !== T.CRUMBLE) return;
    const i = ty * this.grid.w + tx;
    if (!this.crumbles.has(i)) this.crumbles.set(i, 0.35);
  }

  private updateArena(): void {
    const a = this.level.arena;
    if (!a || this.arenaLocked || this.bossDefeated) return;
    const alive = this.alivePlayers();
    if (!alive.length) return;
    if (alive.every((p) => p.x > a.x0 + 8)) {
      this.arenaLocked = true;
      for (let y = a.floorRow - 3; y < a.floorRow; y++) this.grid.set(a.doorCol, y, T.METAL);
      // pull in anyone still respawning
      this.sfx('door', a.x0);
      this.emit({ k: 'shake', a: 4 });
      this.boss = spawnBoss(this, this.level.plan.bossType ?? 'tank');
    }
  }

  onBossDefeated(): void {
    const a = this.level.arena;
    this.bossDefeated = true;
    this.arenaLocked = false;
    if (!a) return;
    this.emit({ k: 'banner', s: 'BOSS DEFEATED', sub: 'GET TO THE EXTRACTION' });
    const col = Math.floor((a.x0 + a.x1) / 2 / TILE);
    const row = this.grid.surfaceRow(col);
    this.spawnProp({ type: 'exit', variant: 'chopper', x: col * TILE - 4, y: (row < 0 ? 12 : row) * TILE - 48, w: 24, h: 48 });
  }

  // ------------------------------------------------------------------
  hurtPlayer(p: Player, n: number, fromX?: number): void {
    if (!p.alive || p.inv > 0 || p.inVehicle) return;
    if (p.armor > 0) {
      p.armor--;
      p.inv = 1;
      this.emit({ k: 'spark', x: p.x + p.w / 2, y: p.y + 4 });
      this.sfx('clink', p.x);
      return;
    }
    p.hp -= n;
    p.inv = 1.1;
    if (fromX !== undefined) {
      p.vx = Math.sign(p.x - fromX || 1) * 120;
      p.vy = -150;
    }
    this.emit({ k: 'blood', x: p.x + p.w / 2, y: p.y + 5, c: '#c01818', n: 6 });
    if (p.hp <= 0) this.killPlayer(p);
    else this.sfx('hurt', p.x);
  }

  killPlayer(p: Player): void {
    if (!p.alive) return;
    p.alive = false;
    p.hp = 0;
    p.climbing = false;
    this.emit({ k: 'blood', x: p.x + p.w / 2, y: p.y + 5, c: '#c01818', n: 20 });
    this.sfx('die', p.x);
    if (this.lives > 0) {
      this.lives--;
      p.respawnT = RESPAWN_TIME;
    } else {
      p.respawnT = Infinity;
    }
  }

  respawnPlayer(p: Player): void {
    const alive = this.alivePlayers();
    let x = alive.length ? alive.reduce((s, a) => s + a.x, 0) / alive.length : this.cam.x + VIEW_W / 3;
    x = clamp(x, this.cam.x + 16, this.cam.x + VIEW_W - 32);
    // find a column whose top area is free
    let col = Math.floor(x / TILE);
    for (let k = 0; k < 12; k++) {
      const c = col + (k % 2 ? -(k >> 1) - 1 : k >> 1);
      const row = Math.floor(this.cam.y / TILE) + 1;
      if (this.grid.get(c, row) === T.EMPTY && this.grid.get(c, row + 1) === T.EMPTY) {
        col = c;
        break;
      }
    }
    p.x = col * TILE + 3;
    p.y = this.cam.y + 4;
    p.vx = 0;
    p.vy = 0;
    p.alive = true;
    p.hp = PLAYER_HP;
    p.inv = 2;
    const lo = HERO_LOADOUT[p.hero % 4];
    p.weapon = p.base;
    p.ammo = Infinity;
    p.special = lo.special;
    p.specialCount = lo.count;
    p.armor = 0;
    this.text(p.x, p.y + 10, 'GO!', '#ffe040');
  }

  hurtEnemy(e: Enemy, n: number, fromX: number): void {
    if (e.dead) return;
    e.hp -= n;
    e.hurtT = 0.12;
    if (e.state === 'patrol') {
      e.state = 'alert';
      e.t = 0.2;
      e.facing = fromX < e.x ? -1 : 1;
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this.emit({ k: 'blood', x: e.x + e.w / 2, y: e.y + e.h / 2, c: e.type === 'drone' ? '#c0c0c0' : '#b01010', n: 12 });
    this.sfx('edie', e.x);
    if (e.type === 'bomber' || e.type === 'drone') {
      this.explode(e.x + e.w / 2, e.y + e.h / 2, e.type === 'bomber' ? 30 : 20, 3, 'n');
    }
    if (this.rng.chance(0.1)) {
      this.spawnPickup(this.rng.pick<ItemId>(['ammo', 'grenade', 'health', 'shotgun', 'c4']), e.x, e.y);
    }
  }

  /** explosions are the only thing that can destroy terrain */
  explode(x: number, y: number, r: number, dmg: number, owner: Owner): void {
    this.emit({ k: 'boom', x, y, r });
    this.sfx(r >= 36 ? 'bigboom' : 'boom', x);
    this.emit({ k: 'shake', a: Math.min(8, r / 7) });

    const tr = Math.ceil(r / TILE);
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    let destroyed = false;
    for (let ty = cy - tr; ty <= cy + tr; ty++) {
      for (let tx = cx - tr; tx <= cx + tr; tx++) {
        const d = Math.hypot(tx * TILE + 8 - x, ty * TILE + 8 - y);
        if (d > r) continue;
        const t = this.grid.get(tx, ty);
        const amount = dmg * (1 - d / (r + 8)) * 1.3 + 0.6;
        if (this.grid.damage(tx, ty, amount)) {
          destroyed = true;
          this.emit({ k: 'debris', x: tx * TILE + 8, y: ty * TILE + 8, t });
        }
      }
    }
    if (destroyed) {
      for (const f of this.grid.findUnsupported(cx, cy, tr + 9)) {
        this.grid.set(f.x, f.y, T.EMPTY);
        this.debris.push({ id: this.id(), t: f.t, x: f.x * TILE, y: f.y * TILE, vy: 0, dead: false });
      }
    }

    for (const p of this.players) {
      if (!p.alive || p.inVehicle) continue;
      const d = Math.hypot(p.x + p.w / 2 - x, p.y + p.h / 2 - y);
      if (d > r + 6) continue;
      const k = 1 - d / (r + 6);
      p.vx += Math.sign(p.x + p.w / 2 - x || 1) * 220 * k;
      p.vy -= 260 * k;
      if (owner !== 'p') this.hurtPlayer(p, d < r * 0.5 ? 2 : 1);
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x + e.w / 2 - x, e.y + e.h / 2 - y);
      if (d > r + 6) continue;
      const k = 1 - d / (r + 6);
      e.vx += Math.sign(e.x + e.w / 2 - x || 1) * 200 * k;
      e.vy -= 240 * k;
      this.hurtEnemy(e, dmg * k + 1, x);
    }
    if (this.boss && !this.boss.dead && this.boss.visible && owner !== 'e') {
      const b = this.boss;
      const nx = clamp(x, b.x, b.x + b.w);
      const ny = clamp(y, b.y, b.y + b.h);
      if (Math.hypot(nx - x, ny - y) < r) hurtBoss(this, b, dmg);
    }
    for (const pr of this.props) {
      if (pr.dead || !Number.isFinite(pr.hp)) continue;
      const d = Math.hypot(pr.x + pr.w / 2 - x, pr.y + pr.h / 2 - y);
      if (d > r + 4) continue;
      if (pr.type === 'barrel' || pr.type === 'mine') {
        if (pr.state === 0) {
          pr.state = 1;
          pr.t = 0.12;
        }
      } else this.damageProp(pr, dmg);
    }
    for (const pk of this.pickups) {
      const d = Math.hypot(pk.x - x, pk.y - y);
      if (d < r) pk.vy = -160;
    }
    for (const pr of this.projectiles) {
      if (pr.type === 'c4' && pr.owner === 'p' && Math.hypot(pr.x - x, pr.y - y) < r * 0.6 && pr.life > 0.1) pr.life = 0.08;
    }
  }

  damageProp(pr: Prop, n: number): void {
    if (pr.dead || !Number.isFinite(pr.hp)) return;
    pr.hp -= n;
    if (pr.hp > 0) return;
    if (pr.type === 'barrel' || pr.type === 'mine') {
      if (pr.state === 0) {
        pr.state = 1;
        pr.t = 0.08;
      }
      return;
    }
    pr.dead = true;
    const cx = pr.x + pr.w / 2;
    const cy = pr.y + pr.h / 2;
    this.emit({ k: 'debris', x: cx, y: cy, t: T.WOOD });
    if (pr.type === 'crate') {
      this.sfx('clink', cx);
      this.spawnPickup(pr.item ?? 'ammo', cx - 6, pr.y + 2);
    } else if (pr.type === 'cage') {
      this.lives++;
      this.sfx('rescue', cx);
      this.text(cx - 16, pr.y - 6, '+1 LIFE', '#60ff60');
      const perma = this.players.find((p) => !p.alive && p.respawnT === Infinity && p.connected);
      if (perma) {
        this.lives--;
        perma.respawnT = 0.5;
      }
    }
  }

  isActive(x: number): boolean {
    return Math.abs(x - (this.cam.x + VIEW_W / 2)) < ACTIVE_RANGE;
  }

  overlapsAnyPlayer(b: { x: number; y: number; w: number; h: number }): Player | null {
    for (const p of this.players) if (p.alive && !p.inVehicle && overlap(p, b)) return p;
    return null;
  }
}
