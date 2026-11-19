import Phaser from 'phaser';
import { TILE, VIEW_H, VIEW_W } from '../config';
import { hash2 } from '../core/rng';
import { makeParallax } from '../gfx/parallax';
import { HERO_COLORS, makeTiles, shade } from '../gfx/SpriteForge';
import type { GameEvent } from '../sim/types';
import type { World } from '../sim/World';
import { T, isSolid } from '../world/tiles';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  s: number;
  g: number;
  grow: number;
  screen?: boolean;
}

interface FloatText {
  obj: Phaser.GameObjects.BitmapText;
  life: number;
}

type Spr = Phaser.GameObjects.Sprite;

const PARALLAX = [0, 0.08, 0.25, 0.55];

export class WorldRenderer {
  private scene: Phaser.Scene;
  private world: World;
  private bg: Phaser.GameObjects.TileSprite[] = [];
  private map!: Phaser.Tilemaps.Tilemap;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private tilesKey: string;
  private sprites = new Map<number, Spr>();
  private seen = new Set<number>();
  private labels = new Map<number, Phaser.GameObjects.BitmapText>();
  private parts: Particle[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private fxTop: Phaser.GameObjects.Graphics;
  private weather: Phaser.GameObjects.Graphics;
  private texts: FloatText[] = [];
  private flashes: { x: number; y: number; r: number; life: number }[] = [];
  private smooth = new Map<number, { x: number; y: number }>();
  private time = 0;

  constructor(scene: Phaser.Scene, world: World) {
    this.scene = scene;
    this.world = world;
    const b = world.biome;
    const keys = makeParallax(scene, b);
    keys.forEach((k, i) => {
      const ts = scene.add.tileSprite(0, 0, VIEW_W, VIEW_H, k).setOrigin(0).setScrollFactor(0).setDepth(-10 + i);
      this.bg.push(ts);
    });
    this.tilesKey = makeTiles(scene, b);
    this.buildMap();
    this.gfx = scene.add.graphics().setDepth(20);
    this.fxTop = scene.add.graphics().setDepth(21);
    this.weather = scene.add.graphics().setDepth(19).setScrollFactor(0);
    for (let i = 0; i < 60; i++) this.spawnWeather(true);
  }

  // ------------------------------------------------------------ tiles
  private buildMap(): void {
    const g = this.world.grid;
    this.map = this.scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: g.w, height: g.h });
    const ts = this.map.addTilesetImage(this.tilesKey, this.tilesKey, TILE, TILE, 0, 0)!;
    this.layer = this.map.createBlankLayer('ground', ts)!;
    this.layer.setDepth(0);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) this.refreshTile(x, y);
  }

  private tileIndex(x: number, y: number): number {
    const g = this.world.grid;
    const t = g.get(x, y);
    if (t === T.EMPTY) return -1;
    const above = g.get(x, y - 1);
    const top = !isSolid(above) && above !== T.SANDBAG ? 1 : 0;
    const alt = hash2(x, y) & 1 ? 2 : 0;
    return t * 4 + top + alt;
  }

  private refreshTile(x: number, y: number): void {
    const idx = this.tileIndex(x, y);
    if (idx < 0) this.layer.removeTileAt(x, y);
    else this.layer.putTileAt(idx, x, y);
  }

  applyTileChanges(changes: number[]): void {
    const w = this.world.grid.w;
    for (let k = 0; k + 1 < changes.length; k += 2) {
      const i = changes[k];
      const x = i % w;
      const y = Math.floor(i / w);
      this.refreshTile(x, y);
      this.refreshTile(x, y + 1);
    }
  }

  // ------------------------------------------------------------ events
  handle(e: GameEvent): void {
    switch (e.k) {
      case 'boom': {
        this.flashes.push({ x: e.x, y: e.y, r: e.r, life: 0.12 });
        const n = Math.round(e.r * 0.9);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = Math.random() * e.r * 4;
          this.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5, max: 0.5, c: Math.random() < 0.5 ? '#ffd040' : '#f06010', s: 2 + Math.random() * 2, g: -60, grow: 0 });
        }
        for (let i = 0; i < n / 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = Math.random() * e.r * 1.2;
          this.parts.push({ x: e.x + Math.cos(a) * s * 0.3, y: e.y + Math.sin(a) * s * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: 1.4, max: 1.4, c: Math.random() < 0.5 ? '#4a4a4a' : '#6a6a6a', s: 3, g: -30, grow: 6 });
        }
        break;
      }
      case 'blood':
        for (let i = 0; i < e.n; i++) {
          this.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 160, life: 0.7, max: 0.7, c: Math.random() < 0.6 ? e.c : shade(e.c, 0.6), s: Math.random() < 0.3 ? 2 : 1, g: 600, grow: 0 });
        }
        break;
      case 'spark':
        for (let i = 0; i < 4; i++) {
          this.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.7) * 120, life: 0.18, max: 0.18, c: '#fff0a0', s: 1, g: 300, grow: 0 });
        }
        break;
      case 'muzzle': {
        const m = this.scene.add.sprite(e.x + e.d * 3, e.y, 'muzzle', Math.random() < 0.5 ? 0 : 1).setDepth(15).setFlipX(e.d < 0);
        this.scene.time.delayedCall(40, () => m.destroy());
        this.parts.push({ x: e.x - e.d * 6, y: e.y - 1, vx: -e.d * 40, vy: -70, life: 0.5, max: 0.5, c: '#d8b040', s: 1, g: 500, grow: 0 });
        break;
      }
      case 'debris': {
        const col = debrisColor(this.world, e.t);
        for (let i = 0; i < 7; i++) {
          this.parts.push({ x: e.x + (Math.random() - 0.5) * 12, y: e.y + (Math.random() - 0.5) * 12, vx: (Math.random() - 0.5) * 140, vy: -Math.random() * 180, life: 0.9, max: 0.9, c: Math.random() < 0.5 ? col : shade(col, 0.7), s: 2, g: 700, grow: 0 });
        }
        this.parts.push({ x: e.x, y: e.y, vx: 0, vy: -10, life: 0.8, max: 0.8, c: '#8a7a6a', s: 4, g: -10, grow: 8 });
        break;
      }
      case 'text': {
        const obj = this.scene.add.bitmapText(e.x, e.y, 'pix', e.s).setTint(Phaser.Display.Color.HexStringToColor(e.c).color).setDepth(30);
        this.texts.push({ obj, life: 1 });
        break;
      }
      case 'shake':
        this.scene.cameras.main.shake(80 + e.a * 30, 0.0025 * e.a);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ frame
  update(dt: number, remote: boolean): void {
    this.time += dt;
    const w = this.world;
    const cam = this.scene.cameras.main;
    cam.setScroll(Math.round(w.cam.x), Math.round(w.cam.y));
    this.bg.forEach((b, i) => {
      b.tilePositionX = w.cam.x * PARALLAX[i];
      b.y = i === 0 ? 0 : -(w.cam.y - (w.levelH - VIEW_H)) * PARALLAX[i] * 0.4;
    });

    this.seen.clear();
    const g = this.gfx;
    g.clear();
    const top = this.fxTop;
    top.clear();

    // props
    for (const p of w.props) {
      if (p.type === 'acid') {
        g.fillStyle(Phaser.Display.Color.HexStringToColor(w.biome.liquid).color, 0.85);
        g.fillRect(p.x, p.y + 3 + Math.sin(this.time * 4 + p.x) * 1, p.w, p.h - 3);
        g.fillStyle(0xffffff, 0.5);
        g.fillRect(p.x + ((this.time * 20 + p.x) % 16), p.y + 3, 3, 1);
        if (Math.random() < 0.03) this.parts.push({ x: p.x + Math.random() * 16, y: p.y + 6, vx: 0, vy: -20, life: 0.4, max: 0.4, c: shade(w.biome.liquid, 1.3), s: 1, g: 0, grow: 0 });
        continue;
      }
      const s = this.spr(p.id, p.type, 5);
      s.setPosition(p.x + p.w / 2, p.y + p.h).setOrigin(0.5, 1);
      if (p.type === 'exit') s.setFrame(Math.floor(this.time * 4) % 2);
      else if (p.type === 'mine') s.setFrame(p.state === 1 || Math.floor(this.time * 2) % 2 ? 1 : 0);
      else if (p.type === 'saw') {
        s.setFrame(Math.floor(this.time * 20) % 2);
        g.fillStyle(0x3a3a3a, 1);
        g.fillRect(p.x0 + 6, p.y + 7, p.x2 - p.x0 + 4, 2);
      } else if (p.type === 'crusher') {
        g.fillStyle(0x6a6a74, 1);
        for (let yy = p.y0 - 64; yy < p.y; yy += 4) g.fillRect(p.x + 7, yy, 2, 3);
      } else if (p.type === 'flamejet') {
        if (p.state === 1) {
          for (let i = 0; i < 3; i++) this.parts.push({ x: p.x + 2 + Math.random() * 8, y: p.y, vx: (Math.random() - 0.5) * 20, vy: -140 - Math.random() * 80, life: 0.3, max: 0.3, c: Math.random() < 0.5 ? '#ffd040' : '#f06010', s: 3, g: 0, grow: 2 });
        } else if (p.state === 2 && Math.random() < 0.3) {
          this.parts.push({ x: p.x + 6, y: p.y, vx: 0, vy: -40, life: 0.3, max: 0.3, c: '#f06010', s: 2, g: 0, grow: 0 });
        }
      } else if (p.type === 'cage') {
        // nothing extra
      }
    }

    // pickups
    for (const k of w.pickups) {
      const s = this.spr(k.id, `pk_${k.item}`, 6);
      s.setPosition(k.x + k.w / 2, k.y + k.h + Math.sin(this.time * 5 + k.id) * 1).setOrigin(0.5, 1);
      s.setVisible(k.life > 3 || Math.floor(this.time * 10) % 2 === 0);
    }

    // debris
    for (const d of w.debris) {
      const s = this.spr(d.id, this.tilesKey, 7);
      s.setFrame(d.t * 4).setOrigin(0).setPosition(d.x, d.y);
    }

    // enemies
    for (const e of w.enemies) {
      const s = this.spr(e.id, `e_${e.type}`, 10);
      const pos = this.smoothPos(e.id, e.x, e.y, remote, dt);
      s.setOrigin(0.5, 1).setPosition(Math.round(pos.x + e.w / 2), Math.round(pos.y + e.h));
      s.setFlipX(e.facing < 0);
      const moving = Math.abs(e.vx) > 5;
      let f = 0;
      if (e.type === 'drone') f = Math.floor(e.animT * 16) % 2;
      else if (!e.onGround && e.type !== 'sniper') f = 4;
      else if (moving) f = [1, 2, 3, 2][Math.floor(e.animT * 10) % 4];
      s.setFrame(f);
      if (e.hurtT > 0) s.setTintFill(0xffffff);
      else s.clearTint();
      if (e.type === 'sniper' && e.state === 'aim') {
        const sx = pos.x + e.w / 2 + e.facing * 8;
        const sy = pos.y + 6;
        let len = 0;
        while (len < 300 && !w.grid.solidAt(sx + e.facing * len, sy)) len += 4;
        top.lineStyle(1, 0xff2020, 0.5 + Math.sin(this.time * 40) * 0.3);
        top.lineBetween(sx, sy, sx + e.facing * len, sy);
      }
      if (e.type === 'bomber' && e.state === 'attack' && Math.floor(this.time * 12) % 2) s.setTint(0xff6060);
    }

    // boss
    const b = w.boss;
    if (b) {
      const key = `boss_${b.type}`;
      const s = this.spr(b.id, key, 11);
      const pos = this.smoothPos(b.id, b.x, b.y, remote, dt);
      s.setVisible(b.visible);
      if (b.type === 'tank') {
        s.setOrigin(0.5, 1).setPosition(Math.round(pos.x + b.w / 2), Math.round(pos.y + b.h + 2)).setFlipX(b.facing < 0);
        s.setFrame(Math.floor(this.time * 10) % 2);
      } else if (b.type === 'gunship') {
        s.setOrigin(0.5, 0.5).setPosition(Math.round(pos.x + b.w / 2), Math.round(pos.y + b.h / 2)).setFlipX(b.facing < 0);
        s.setFrame(Math.floor(this.time * 20) % 2);
        s.setRotation(b.dying > 0 ? Math.sin(this.time * 9) * 0.3 : b.facing * 0.06);
      } else {
        s.setOrigin(0.5, 0.5).setPosition(Math.round(pos.x + b.w / 2), Math.round(pos.y + b.h / 2));
        s.setFrame(Math.floor(this.time * 16) % 2);
        s.setRotation(Math.atan2(b.vy, b.vx || 0.001));
        b.segs.forEach((sg, i) => {
          const ss = this.spr(b.id * 100 + i + 1, 'boss_seg', 10);
          ss.setOrigin(0).setPosition(Math.round(sg.x + 1), Math.round(sg.y + 1));
          if (b.hurtT > 0) ss.setTintFill(0xffffff);
          else ss.clearTint();
        });
      }
      if (b.hurtT > 0) s.setTintFill(0xffffff);
      else s.clearTint();
      if (b.type === 'drill' && !b.visible && Math.random() < 0.4) {
        const a = w.level.arena;
        if (a) this.parts.push({ x: b.x + b.w / 2 + (Math.random() - 0.5) * 16, y: a.floorRow * TILE - 2, vx: (Math.random() - 0.5) * 60, vy: -80, life: 0.4, max: 0.4, c: w.biome.dirt, s: 2, g: 500, grow: 0 });
      }
    }

    // players
    for (const p of w.players) {
      if (!p.alive) continue;
      const s = this.spr(p.id, `hero${p.hero % 4}`, 12);
      const pos = this.smoothPos(p.id, p.x, p.y, remote, dt);
      s.setOrigin(0.5, 1).setPosition(Math.round(pos.x + p.w / 2), Math.round(pos.y + p.h + 1));
      s.setFlipX(p.facing < 0);
      let f = 0;
      if (p.climbing) f = 5;
      else if (!p.onGround) f = 4;
      else if (Math.abs(p.vx) > 5) f = [1, 2, 3, 2][Math.floor(p.animT * 12) % 4];
      s.setFrame(f);
      if (p.climbing) s.setFlipX(Math.floor(p.animT * 6) % 2 === 0);
      s.setVisible(p.inv <= 0 || Math.floor(this.time * 20) % 2 === 0);
      if (p.armor > 0) s.setTint(0xa0c0ff);
      else if (p.speedT > 0) s.setTint(0xa0ffff);
      else s.clearTint();
      // player tag
      let lb = this.labels.get(p.id);
      if (!lb) {
        lb = this.scene.add.bitmapText(0, 0, 'pix', `P${p.pid + 1}`).setDepth(31);
        lb.setTint(Phaser.Display.Color.HexStringToColor(HERO_COLORS[p.hero % 4].band).color);
        this.labels.set(p.id, lb);
      }
      lb.setPosition(Math.round(pos.x + p.w / 2 - 4), Math.round(pos.y - 9)).setVisible(w.players.length > 1);
      this.seen.add(-p.id);
    }
    for (const [id, lb] of this.labels) {
      if (!this.seen.has(-id)) lb.setVisible(false);
    }

    // projectiles
    for (const pr of w.projectiles) {
      const s = this.spr(pr.id, `p_${pr.type}`, 14);
      s.setPosition(Math.round(pr.x), Math.round(pr.y)).setOrigin(0.5);
      if (pr.type === 'rocket' || pr.type === 'missile' || pr.type === 'bullet' || pr.type === 'ebullet') {
        s.setRotation(Math.atan2(pr.vy, pr.vx));
        if ((pr.type === 'rocket' || pr.type === 'missile') && Math.random() < 0.8) {
          this.parts.push({ x: pr.x - Math.sign(pr.vx) * 4, y: pr.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.5, max: 0.5, c: '#8a8a8a', s: 2, g: -20, grow: 3 });
        }
      } else if (pr.type === 'thrown' || pr.type === 'grenade') {
        s.setRotation(this.time * 14 * Math.sign(pr.vx || 1));
      } else if (pr.type === 'flame') {
        s.setFrame(pr.life > 0.28 ? 0 : pr.life > 0.14 ? 1 : 2);
      } else if (pr.type === 'shell' || pr.type === 'mortar') {
        if (Math.random() < 0.5) this.parts.push({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.3, max: 0.3, c: '#9a9a9a', s: 2, g: 0, grow: 2 });
      }
      if (pr.type === 'c4') s.setTint(Math.floor(this.time * 6) % 2 ? 0xffffff : 0xff8080);
    }

    // drop sprites that no longer exist
    for (const [id, s] of this.sprites) {
      if (!this.seen.has(id)) {
        s.destroy();
        this.sprites.delete(id);
        this.smooth.delete(id);
      }
    }

    this.drawParticles(dt);
    this.drawWeather(dt);

    for (const t of this.texts) {
      t.life -= dt;
      t.obj.y -= 18 * dt;
      t.obj.setAlpha(Math.min(1, t.life * 2));
      if (t.life <= 0) t.obj.destroy();
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  private smoothPos(id: number, x: number, y: number, remote: boolean, dt: number): { x: number; y: number } {
    if (!remote) return { x, y };
    let s = this.smooth.get(id);
    if (!s || Math.hypot(s.x - x, s.y - y) > 48) {
      s = { x, y };
      this.smooth.set(id, s);
    }
    const k = Math.min(1, dt * 18);
    s.x += (x - s.x) * k;
    s.y += (y - s.y) * k;
    return s;
  }

  private spr(id: number, key: string, depth: number): Spr {
    this.seen.add(id);
    let s = this.sprites.get(id);
    if (!s || s.texture.key !== key) {
      s?.destroy();
      s = this.scene.add.sprite(0, 0, key, 0).setDepth(depth);
      this.sprites.set(id, s);
    }
    return s;
  }

  private drawParticles(dt: number): void {
    const g = this.gfx;
    for (const f of this.flashes) {
      f.life -= dt;
      g.fillStyle(0xffffff, Math.max(0, f.life / 0.12));
      g.fillCircle(f.x, f.y, f.r * 0.8);
      g.fillStyle(0xffd040, Math.max(0, f.life / 0.12) * 0.8);
      g.fillCircle(f.x, f.y, f.r);
    }
    this.flashes = this.flashes.filter((f) => f.life > 0);
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.g > 100 && this.world.grid.solidAt(p.x, p.y)) {
        p.vy = -p.vy * 0.3;
        p.vx *= 0.5;
        p.y -= 1;
      }
      const size = p.s + p.grow * (1 - p.life / p.max);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(p.c).color, p.grow > 0 ? Math.max(0, p.life / p.max) * 0.8 : 1);
      g.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), Math.ceil(size), Math.ceil(size));
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 1500) this.parts.splice(0, this.parts.length - 1500);
  }

  // weather lives in screen space
  private wparts: Particle[] = [];
  private spawnWeather(initial = false): void {
    const kind = this.world.biome.weather;
    if (kind === 'none') return;
    const x = Math.random() * (VIEW_W + 60) - 30;
    const y = initial ? Math.random() * VIEW_H : -4;
    const base = { x, y, life: 99, max: 99, g: 0, grow: 0, screen: true };
    if (kind === 'rain') this.wparts.push({ ...base, vx: -40, vy: 300, c: '#8090c0', s: 1 });
    else if (kind === 'snow') this.wparts.push({ ...base, vx: -10 + Math.random() * 20, vy: 20 + Math.random() * 20, c: '#ffffff', s: Math.random() < 0.3 ? 2 : 1 });
    else if (kind === 'sand') this.wparts.push({ ...base, x: initial ? x : VIEW_W + 4, y: Math.random() * VIEW_H, vx: -160 - Math.random() * 80, vy: 10, c: '#f0d090', s: 1 });
    else if (kind === 'ash') this.wparts.push({ ...base, vx: -15 + Math.random() * 10, vy: 15 + Math.random() * 15, c: Math.random() < 0.3 ? '#ff8030' : '#5a5a5a', s: 1 });
    else if (kind === 'smog') this.wparts.push({ ...base, x: initial ? x : VIEW_W + 10, y: Math.random() * VIEW_H, vx: -12, vy: 0, c: '#b0a080', s: 6 });
  }

  private drawWeather(dt: number): void {
    const kind = this.world.biome.weather;
    if (kind === 'none') return;
    const g = this.weather;
    g.clear();
    const target = kind === 'smog' ? 20 : kind === 'rain' ? 90 : 70;
    while (this.wparts.length < target) this.spawnWeather();
    for (const p of this.wparts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (kind === 'snow' || kind === 'ash') p.x += Math.sin(this.time * 2 + p.y * 0.05) * 10 * dt;
      g.fillStyle(Phaser.Display.Color.HexStringToColor(p.c).color, kind === 'smog' ? 0.12 : kind === 'rain' ? 0.6 : 0.9);
      if (kind === 'rain') g.fillRect(Math.round(p.x), Math.round(p.y), 1, 4);
      else g.fillRect(Math.round(p.x), Math.round(p.y), p.s, kind === 'sand' ? 1 : p.s);
      if (p.y > VIEW_H + 6 || p.x < -40 || p.x > VIEW_W + 40) p.life = 0;
    }
    this.wparts = this.wparts.filter((p) => p.life > 0);
  }
}

function debrisColor(w: World, t: number): string {
  const b = w.biome;
  switch (t) {
    case T.BRICK:
    case T.CRUMBLE:
      return b.brick;
    case T.WOOD:
    case T.PLATFORM:
    case T.LADDER:
      return b.wood;
    case T.SANDBAG:
      return '#b8a070';
    case T.METAL:
      return b.metal;
    default:
      return b.dirt;
  }
}
