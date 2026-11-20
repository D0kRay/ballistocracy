import Phaser from 'phaser';
import { TILE, VIEW_H, VIEW_W } from '../config';
import { hash2 } from '../core/rng';
import { CHAR_H, FRAME, HAND, WEAPON_ANCHOR, ensureHands } from '../gfx/characters';
import { PARALLAX_H, makeParallax } from '../gfx/parallax';
import { HERO_COLORS, shade } from '../gfx/SpriteForge';
import { BACK, DECOR_FRAMES, EDGE, makeBackTiles, makeDecor, makeTiles, tileFrame } from '../gfx/terrain';
import { SCENERY_TILED, makeScenery } from '../gfx/scenery';
import type { GameEvent } from '../sim/types';
import type { World } from '../sim/World';
import { BACK_CHANGE, T, isSolid } from '../world/tiles';
import { TerrainPainter, isNatural } from './TerrainPainter';
import { biomeAt } from '../world/biomes';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: number;
  s: number;
  g: number;
  grow: number;
  round?: boolean;
  stick?: boolean; // blood: leaves a decal where it lands
  fade?: boolean;
}

interface Fire {
  x: number;
  y: number;
  life: number;
  t: number;
}

interface SceneObj {
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;
  type: string;
  x: number;
  y: number;
  supportCol: number;
  supportRow: number;
  dead: boolean;
  burnT: number;
}

interface Light {
  x: number;
  y: number;
  r: number;
  c: number;
  a: number;
}

type Spr = Phaser.GameObjects.Sprite;

const PARALLAX = [0, 0.08, 0.25, 0.55];
const HUMANOID = new Set(['grunt', 'sniper', 'bomber', 'heavy', 'shield']);
const ENEMY_WEAPON: Record<string, string> = { grunt: 'rifle', sniper: 'sniper', heavy: 'minigun', shield: 'pistol' };
const DECAL_CHUNK = 1024;
const GID_BACK = 1;
const GID_GROUND = 100;
const GID_DECOR = 1000;

const col = (h: string) => Phaser.Display.Color.HexStringToColor(h).color;

export class WorldRenderer {
  private scene: Phaser.Scene;
  private world: World;
  private bg: Phaser.GameObjects.TileSprite[] = [];
  private map!: Phaser.Tilemaps.Tilemap;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private backLayer!: Phaser.Tilemaps.TilemapLayer;
  private decorLayer!: Phaser.Tilemaps.TilemapLayer;
  private tilesKey: string;
  private sprites = new Map<number, Spr>();
  private seen = new Set<number>();
  private labels = new Map<number, Phaser.GameObjects.BitmapText>();
  private parts: Particle[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private smokeG: Phaser.GameObjects.Graphics;
  private fxTop: Phaser.GameObjects.Graphics;
  private weather: Phaser.GameObjects.Graphics;
  private texts: { obj: Phaser.GameObjects.BitmapText; life: number }[] = [];
  private bubbles: { obj: Phaser.GameObjects.Image; life: number }[] = [];
  private fires: Fire[] = [];
  private lights: Light[] = [];
  private lightPool: Phaser.GameObjects.Image[] = [];
  private decals = new Map<number, Phaser.GameObjects.RenderTexture>();
  private eraser: Phaser.GameObjects.Image;
  private smooth = new Map<number, { x: number; y: number }>();
  private time = 0;
  private sceneObjs: SceneObj[] = [];
  private painter!: TerrainPainter;
  private night = false;
  private boardT = new Map<number, number>(); // when each player boarded (plane walk-in)
  private frameNo = 0;

  constructor(scene: Phaser.Scene, world: World) {
    this.scene = scene;
    this.world = world;
    ensureHands();
    const b = world.biome;
    const tod = world.level.plan.tod ?? 'day';
    const keys = makeParallax(scene, biomeAt(b, tod), world.level.plan.seed % 9973, tod === 'night');
    if (tod !== 'day') {
      // multiply grade over the whole world; lights are drawn above it so they pop
      scene.add.rectangle(0, 0, VIEW_W, VIEW_H, tod === 'night' ? (b.id === 'volcano' ? 0xd0a098 : 0x8c98cc) : 0xffd0b4).setOrigin(0).setScrollFactor(0).setDepth(89).setBlendMode(Phaser.BlendModes.MULTIPLY);
    }
    this.night = tod === 'night';
    const s = VIEW_H / PARALLAX_H;
    keys.forEach((k, i) => {
      const ts = scene.add.tileSprite(0, 0, VIEW_W, VIEW_H, k).setOrigin(0).setScrollFactor(0).setDepth(-10 + i);
      ts.setTileScale(s, s);
      this.bg.push(ts);
    });
    this.tilesKey = makeTiles(scene, b);
    this.buildMap();
    this.buildScenery();
    this.eraser = scene.make.image({ key: 'px', add: false }).setOrigin(0).setScale(TILE);
    this.smokeG = scene.add.graphics().setDepth(16);
    this.gfx = scene.add.graphics().setDepth(20);
    this.fxTop = scene.add.graphics().setDepth(21);
    this.weather = scene.add.graphics().setDepth(19).setScrollFactor(0);
    // subtle vignette + biome haze for depth
    const vg = scene.add.graphics().setScrollFactor(0).setDepth(90);
    for (let i = 0; i < 6; i++) {
      vg.fillStyle(0x000000, 0.06);
      vg.fillRect(0, 0, VIEW_W, 3 + i * 3);
      vg.fillRect(0, VIEW_H - 3 - i * 3, VIEW_W, 3 + i * 3);
      vg.fillRect(0, 0, 4 + i * 4, VIEW_H);
      vg.fillRect(VIEW_W - 4 - i * 4, 0, 4 + i * 4, VIEW_H);
    }
    for (let i = 0; i < 60; i++) this.spawnWeather(true);
  }

  // ------------------------------------------------------------ tiles
  private buildMap(): void {
    const w = this.world;
    const g = w.grid;
    this.map = this.scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: g.w, height: g.h });
    const backKey = makeBackTiles(this.scene, w.biome);
    const decorKey = makeDecor(this.scene, w.biome);
    const tsBack = this.map.addTilesetImage(backKey, backKey, TILE, TILE, 0, 0, GID_BACK)!;
    const ts = this.map.addTilesetImage(this.tilesKey, this.tilesKey, TILE, TILE, 0, 0, GID_GROUND)!;
    const tsDecor = this.map.addTilesetImage(decorKey, decorKey, TILE, TILE, 0, 0, GID_DECOR)!;
    this.backLayer = this.map.createBlankLayer('back', tsBack)!.setDepth(-1);
    this.layer = this.map.createBlankLayer('ground', ts)!.setDepth(0);
    this.decorLayer = this.map.createBlankLayer('decor', tsDecor)!.setDepth(2);
    const back = w.level.back;
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const v = back ? back[y * g.w + x] : 0;
        if (v !== BACK.NONE && v !== BACK.DIRT) this.backLayer.putTileAt(GID_BACK + v, x, y);
      }
    this.painter = new TerrainPainter(this.scene, g, back ?? new Uint8Array(g.w * g.h), w.biome, w.level.plan.seed % 9973);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) this.refreshTile(x, y, false);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) this.refreshTint(x, y);
  }

  // ------------------------------------------------------------ scenery
  /** editor: change one background wall cell */
  setBack(x: number, y: number, v: number): void {
    if (v === BACK.NONE) this.backLayer.removeTileAt(x, y);
    else this.backLayer.putTileAt(GID_BACK + v, x, y);
  }

  /** editor: rebuild scenery sprites after the level's scenery list changed */
  rebuildScenery(): void {
    for (const o of this.sceneObjs) o.obj.destroy();
    this.sceneObjs = [];
    this.buildScenery(false);
  }

  private buildScenery(makeTextures = true): void {
    if (makeTextures) makeScenery(this.scene, this.world.biome);
    for (const s of this.world.level.scenery ?? []) {
      const key = `sc_${s.type}`;
      if (!this.scene.textures.exists(key)) continue;
      const roof = s.type.startsWith('roof_');
      const depth = roof ? 0.6 : SCENERY_TILED.has(s.type) ? -0.7 : -0.5;
      let obj: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;
      if (SCENERY_TILED.has(s.type)) {
        const src = this.scene.textures.get(key).getSourceImage();
        obj = this.scene.add.tileSprite(s.x, s.y, src.width, s.h ?? src.height, key).setOrigin(0.5, 1).setDepth(depth);
      } else {
        obj = this.scene.add.image(s.x, roof ? s.y + 2 : s.y + 1, key, 0).setOrigin(0.5, 1).setDepth(depth).setFlipX(s.flip && !roof);
      }
      const col0 = Math.floor(s.x / TILE);
      this.sceneObjs.push({ obj, type: s.type, x: s.x, y: s.y, supportCol: col0, supportRow: roof ? Math.floor(s.y / TILE) - 1 : Math.floor(s.y / TILE), dead: false, burnT: 0 });
    }
  }

  private destroyScenery(o: SceneObj, burn: boolean): void {
    if (o.dead || o.burnT > 0) return;
    if (burn && !o.type.startsWith('roof_') && o.type !== 'lamp' && o.type !== 'car') {
      o.burnT = 2.5;
      o.obj.setTint(0x3a2a24);
      return;
    }
    o.dead = true;
    const h = o.obj.displayHeight;
    const w = o.obj.displayWidth;
    for (let i = 0; i < Math.min(30, (w * h) / 40); i++) {
      this.parts.push({ x: o.x + (Math.random() - 0.5) * w, y: o.y - Math.random() * h, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 160, life: 1.2, max: 1.2, c: Math.random() < 0.5 ? 0x5a4428 : 0x2e5a2e, s: 2, g: 600, grow: 0 });
    }
    this.scene.tweens.add({ targets: o.obj, alpha: 0, y: o.obj.y + 10, angle: (Math.random() - 0.5) * 40, duration: 400, onComplete: () => o.obj.destroy() });
  }

  private updateScenery(dt: number): void {
    const g = this.world.grid;
    const check = this.frameNo % 8 === 0;
    for (const o of this.sceneObjs) {
      if (o.dead) continue;
      if (o.burnT > 0) {
        o.burnT -= dt;
        if (Math.random() < 0.6) this.parts.push({ x: o.x + (Math.random() - 0.5) * o.obj.displayWidth * 0.6, y: o.y - Math.random() * o.obj.displayHeight, vx: 0, vy: -50, life: 0.5, max: 0.5, c: Math.random() < 0.5 ? 0xffb030 : 0xe05010, s: 3, g: -20, grow: -1, round: true });
        if (Math.random() < 0.2) this.parts.push({ x: o.x, y: o.y - o.obj.displayHeight, vx: 6, vy: -25, life: 2.5, max: 2.5, c: 0x1e1a1c, s: 4, g: -6, grow: 10, round: true, fade: true });
        this.lights.push({ x: o.x, y: o.y - o.obj.displayHeight / 2, r: 50, c: 0xff8030, a: 0.6 });
        if (o.burnT <= 0) {
          o.burnT = 0;
          this.destroyScenery(o, false);
        }
        continue;
      }
      if (check) {
        const t = g.get(o.supportCol, o.supportRow);
        if (!isSolid(t) && t !== T.PLATFORM && t !== T.SANDBAG) this.destroyScenery(o, false);
      }
      if (o.type === 'lamp' && !o.dead) {
        const fx = o.obj instanceof Phaser.GameObjects.Image && o.obj.flipX ? -5 : 5;
        this.lights.push({ x: o.x + fx, y: o.y - 43, r: 30, c: 0xffe0a0, a: 0.45 });
      }
      if (o.type === 'enemyflag' && o.obj instanceof Phaser.GameObjects.Image) o.obj.setFrame(Math.floor(this.time * 4 + o.x) % 2);
    }
  }

  private exposed(t: number): boolean {
    return !isSolid(t) && t !== T.SANDBAG;
  }

  private refreshTile(x: number, y: number, tint = true): void {
    const g = this.world.grid;
    const t = g.get(x, y);
    if (t === T.EMPTY || isNatural(t)) this.layer.removeTileAt(x, y);
    else {
      let mask = 0;
      const solidLike = (tt: number) => isSolid(tt) || tt === T.SANDBAG;
      if (solidLike(t)) {
        if (!solidLike(g.get(x, y - 1)) && y > 0) mask |= EDGE.TOP;
        if (!solidLike(g.get(x + 1, y))) mask |= EDGE.RIGHT;
        if (!solidLike(g.get(x, y + 1)) && y < g.h - 1) mask |= EDGE.BOTTOM;
        if (!solidLike(g.get(x - 1, y))) mask |= EDGE.LEFT;
      }
      const h = hash2(x, y);
      const tile = this.layer.putTileAt(GID_GROUND + tileFrame(t, mask, h), x, y);
      // mirror symmetric tiles for extra variety (keeps edge art on the right side)
      const lr = mask & (EDGE.LEFT | EDGE.RIGHT);
      tile.flipX = (lr === 0 || lr === (EDGE.LEFT | EDGE.RIGHT)) && (t === T.DIRT || t === T.BEDROCK) && ((h >> 3) & 1) === 1;
    }
    // decor sits in the empty cell above an exposed dirt top
    this.refreshDecor(x, y - 1);
    this.refreshDecor(x, y);
    this.refreshDecor(x, y + 1);
    if (tint) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) this.refreshTint(x + dx, y + dy);
  }

  private refreshDecor(x: number, y: number): void {
    const g = this.world.grid;
    if (!g.inBounds(x, y)) return;
    const below = g.get(x, y + 1);
    const above = g.get(x, y - 1);
    if (g.get(x, y) === T.EMPTY && !isSolid(below) && y > 0 && (above === T.DIRT || above === T.STONE || above === T.BRICK)) {
      // growth hanging from overhangs
      const h = hash2(x * 5 + 3, y * 11 + 1) % 100;
      const f = h < 45 ? 8 + (h % 2) : h < 52 && above === T.STONE ? 10 : -1;
      if (f >= 0) this.decorLayer.putTileAt(GID_DECOR + f, x, y);
      else this.decorLayer.removeTileAt(x, y);
      return;
    }
    if (g.get(x, y) === T.EMPTY && (below === T.DIRT || below === T.STONE)) {
      const h = hash2(x * 3 + 1, y * 7 + 5) % 100;
      const f = h < 22 ? h % 4 : h < 29 ? 4 : h < 34 ? 5 : h < 38 ? 6 : h < 40 ? DECOR_FRAMES - 1 : -1;
      if (f >= 0) this.decorLayer.putTileAt(GID_DECOR + f, x, y);
      else this.decorLayer.removeTileAt(x, y);
    } else this.decorLayer.removeTileAt(x, y);
  }

  /** buried tiles get darker the further they are from open air */
  private refreshTint(x: number, y: number): void {
    const tile = this.layer.getTileAt(x, y);
    if (!tile) return;
    const g = this.world.grid;
    let depth = 4;
    for (let r = 1; r <= 3 && depth === 4; r++) {
      for (let dy = -r; dy <= r && depth === 4; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const yy = y + dy;
          if (yy < 0) continue;
          if (this.exposed(g.get(x + dx, yy)) && yy < g.h) {
            depth = r;
            break;
          }
        }
    }
    tile.tint = [0xffffff, 0xffffff, 0xb4acac, 0x868082, 0x625c5e][depth];
  }

  applyTileChanges(changes: number[]): void {
    const w = this.world.grid.w;
    for (let k = 0; k + 1 < changes.length; k += 2) {
      const i = changes[k];
      const x = i % w;
      const y = Math.floor(i / w);
      if (changes[k + 1] >= BACK_CHANGE) {
        this.setBack(x, y, changes[k + 1] - BACK_CHANGE);
        continue;
      }
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) this.refreshTile(x + dx, y + dy, dx === 0 && dy === 0);
      if (changes[k + 1] === T.EMPTY) this.eraseDecal(x * TILE, y * TILE);
      this.painter.repaint(x, y);
    }
    this.painter.flush();
  }

  // ------------------------------------------------------------ decals
  private decal(x: number): Phaser.GameObjects.RenderTexture | null {
    const ci = Math.floor(x / DECAL_CHUNK);
    if (ci < 0 || x > this.world.levelW) return null;
    let rt = this.decals.get(ci);
    if (!rt) {
      rt = this.scene.add.renderTexture(ci * DECAL_CHUNK, 0, DECAL_CHUNK, this.world.levelH).setOrigin(0).setDepth(1);
      this.decals.set(ci, rt);
    }
    return rt;
  }

  private stamp(x: number, y: number, c: number, a: number, w = 1, h = 1): void {
    if (!this.world.grid.solidAt(x, y)) return;
    const rt = this.decal(x);
    if (!rt) return;
    const ci = Math.floor(x / DECAL_CHUNK);
    rt.fill(c, a, Math.floor(x) - ci * DECAL_CHUNK, Math.floor(y), w, h);
  }

  private eraseDecal(x: number, y: number): void {
    const ci = Math.floor(x / DECAL_CHUNK);
    const rt = this.decals.get(ci);
    if (rt) rt.erase(this.eraser, x - ci * DECAL_CHUNK, y);
  }

  // ------------------------------------------------------------ events
  handle(e: GameEvent): void {
    switch (e.k) {
      case 'boom': {
        const fb = this.scene.add.sprite(e.x, e.y, 'boomfx', 0).setDepth(18).setScale(Math.max(0.6, e.r / 20));
        fb.setRotation(Math.floor(Math.random() * 4) * (Math.PI / 2));
        let fr = 0;
        const ev = this.scene.time.addEvent({
          delay: 45,
          repeat: 8,
          callback: () => {
            fr++;
            if (fr >= 9) {
              fb.destroy();
              ev.remove();
            } else fb.setFrame(fr);
          },
        });
        this.lights.push({ x: e.x, y: e.y, r: e.r * 4, c: 0xffa040, a: 1 });
        for (const o of this.sceneObjs) {
          if (o.dead) continue;
          const cy = o.y - o.obj.displayHeight / 2;
          const d = Math.hypot(o.x - e.x, cy - e.y);
          if (d < e.r + o.obj.displayWidth * 0.4) this.destroyScenery(o, d > e.r * 0.6);
        }
        const n = Math.round(e.r * 0.8);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 40 + Math.random() * e.r * 5;
          this.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.6, max: 0.6, c: Math.random() < 0.5 ? 0xffe060 : 0xff8020, s: 1 + Math.random() * 1.5, g: 300, grow: 0 });
        }
        for (let i = 0; i < n / 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = Math.random() * e.r * 1.2;
          this.parts.push({ x: e.x + Math.cos(a) * e.r * 0.4, y: e.y + Math.sin(a) * e.r * 0.4, vx: Math.cos(a) * sp * 0.6, vy: -20 - Math.random() * 40, life: 2.2, max: 2.2, c: Math.random() < 0.5 ? 0x2a2426 : 0x3e3638, s: 3 + Math.random() * 3, g: -14, grow: 9, round: true, fade: true });
        }
        // scorch marks on surviving terrain
        for (let i = 0; i < e.r * 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * e.r * 1.1;
          this.stamp(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 0x000000, 0.5, 2, 2);
        }
        // lingering fires on nearby surfaces
        const nf = Math.min(4, Math.round(e.r / 12));
        for (let i = 0; i < nf; i++) {
          const fx = e.x + (Math.random() - 0.5) * e.r * 1.6;
          let fy = e.y + (Math.random() - 0.5) * e.r;
          for (let k = 0; k < 40 && !this.world.grid.solidAt(fx, fy + 1); k++) fy += 2;
          if (this.world.grid.solidAt(fx, fy + 1)) this.fires.push({ x: fx, y: fy, life: 2 + Math.random() * 4, t: 0 });
        }
        break;
      }
      case 'blood':
        for (let i = 0; i < e.n; i++) {
          const red = e.c !== '#c0c0c0';
          this.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 180, vy: -Math.random() * 180, life: 1.2, max: 1.2, c: Math.random() < 0.6 ? col(e.c) : col(shade(e.c, 0.6)), s: Math.random() < 0.3 ? 2 : 1, g: 650, grow: 0, stick: red });
        }
        if (e.n >= 12) {
          // gibs
          for (let i = 0; i < 4; i++) this.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 200, vy: -80 - Math.random() * 160, life: 2.5, max: 2.5, c: Math.random() < 0.5 ? col(shade(e.c, 0.8)) : 0xd8a070, s: 2, g: 650, grow: 0, stick: true });
        }
        break;
      case 'spark':
        for (let i = 0; i < 4; i++) this.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.7) * 140, life: 0.2, max: 0.2, c: 0xfff0a0, s: 1, g: 300, grow: 0 });
        this.lights.push({ x: e.x, y: e.y, r: 14, c: 0xffe0a0, a: 0.5 });
        break;
      case 'muzzle': {
        const m = this.scene.add.sprite(e.x + e.d * 3, e.y, 'muzzle', Math.random() < 0.5 ? 0 : 1).setDepth(15).setFlipX(e.d < 0).setRotation((e.r ?? 0) * e.d);
        this.scene.time.delayedCall(40, () => m.destroy());
        this.lights.push({ x: e.x + e.d * 4, y: e.y, r: 34, c: 0xffd070, a: 0.8 });
        this.parts.push({ x: e.x - e.d * 6, y: e.y - 1, vx: -e.d * 50, vy: -80, life: 0.6, max: 0.6, c: 0xd8b040, s: 1, g: 520, grow: 0 });
        break;
      }
      case 'debris': {
        const c = col(debrisColor(this.world, e.t));
        for (let i = 0; i < 8; i++) {
          this.parts.push({ x: e.x + (Math.random() - 0.5) * 12, y: e.y + (Math.random() - 0.5) * 12, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 200, life: 1.1, max: 1.1, c: Math.random() < 0.5 ? c : Phaser.Display.Color.IntegerToColor(c).darken(30).color, s: Math.random() < 0.5 ? 2 : 3, g: 700, grow: 0 });
        }
        this.parts.push({ x: e.x, y: e.y, vx: 0, vy: -12, life: 1, max: 1, c: 0x8a7a6a, s: 5, g: -10, grow: 10, round: true, fade: true });
        break;
      }
      case 'text': {
        if (e.s === '!' || e.s === '?') {
          const obj = this.scene.add.image(e.x + 4, e.y - 2, 'bubble', e.s === '!' ? 0 : 1).setOrigin(0.5, 1).setDepth(31);
          this.bubbles.push({ obj, life: 0.9 });
          break;
        }
        const obj = this.scene.add.bitmapText(e.x, e.y, 'pix', e.s).setTint(col(e.c)).setDepth(30);
        this.texts.push({ obj, life: 1.1 });
        break;
      }
      case 'shake':
        this.scene.cameras.main.shake(90 + e.a * 30, 0.0022 * e.a);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ frame
  update(dt: number, remote: boolean, localPids: Set<number> = new Set()): void {
    this.time += dt;
    const w = this.world;
    const cam = this.scene.cameras.main;
    cam.setScroll(Math.round(w.cam.x), Math.round(w.cam.y));
    this.bg.forEach((b, i) => {
      b.tilePositionX = (w.cam.x * PARALLAX[i]) / b.tileScaleX;
      b.y = i === 0 ? 0 : -(w.cam.y - (w.levelH - VIEW_H)) * PARALLAX[i] * 0.4;
    });

    this.seen.clear();
    const g = this.gfx;
    g.clear();
    const top = this.fxTop;
    top.clear();

    this.drawProps(dt);
    this.drawIntro();
    this.drawPickups();

    for (const d of w.debris) {
      const s = this.spr(d.id, this.tilesKey, 7);
      s.setFrame(tileFrame(d.t, 15, d.id)).setOrigin(0).setPosition(d.x, d.y);
    }

    this.drawEnemies(dt, remote);
    this.drawBoss(dt, remote);
    this.drawPlayers(dt, remote, localPids);
    this.drawProjectiles();

    for (const [id, s] of this.sprites) {
      if (!this.seen.has(id)) {
        s.destroy();
        this.sprites.delete(id);
        this.smooth.delete(id);
      }
    }

    this.frameNo++;
    this.updateScenery(dt);
    this.updateFires(dt);
    this.drawParticles(dt);
    this.drawLights(dt);
    this.drawWeather(dt);

    for (const t of this.texts) {
      t.life -= dt;
      t.obj.y -= 18 * dt;
      t.obj.setAlpha(Math.min(1, t.life * 2));
      if (t.life <= 0) t.obj.destroy();
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const b of this.bubbles) {
      b.life -= dt;
      b.obj.y -= 6 * dt;
      if (b.life <= 0) b.obj.destroy();
    }
    this.bubbles = this.bubbles.filter((b) => b.life > 0);
  }

  private drawProps(dt: number): void {
    const w = this.world;
    const g = this.gfx;
    for (const p of w.props) {
      if (p.type === 'acid') {
        g.fillStyle(col(w.biome.liquid), 0.85);
        g.fillRect(p.x, p.y + 3 + Math.sin(this.time * 4 + p.x) * 1, p.w, p.h - 3);
        g.fillStyle(0xffffff, 0.5);
        g.fillRect(p.x + ((this.time * 20 + p.x) % 16), p.y + 3, 3, 1);
        this.lights.push({ x: p.x + 8, y: p.y + 6, r: 26, c: col(w.biome.liquid), a: 0.35 });
        if (Math.random() < 0.03) this.parts.push({ x: p.x + Math.random() * 16, y: p.y + 6, vx: 0, vy: -20, life: 0.4, max: 0.4, c: col(shade(w.biome.liquid, 1.3)), s: 1, g: 0, grow: 0 });
        continue;
      }
      const s = this.spr(p.id, p.type, 5);
      s.setPosition(p.x + p.w / 2, p.y + p.h).setOrigin(0.5, 1);
      if (p.type === 'exit') {
        this.drawVehicle(p, s);
      } else if (p.type === 'cage') {
        const pr = this.spr(p.id * 1000 + 3, 'prisoner', 4.9);
        pr.setOrigin(0.5, 1).setPosition(Math.round(p.x + p.w / 2), Math.round(p.y + p.h - 2)).setFrame(Math.floor(this.time * 1.5 + p.id) % 2);
      } else if (p.type === 'mine') {
        const on = p.state === 1 || Math.floor(this.time * 2) % 2 === 1;
        s.setFrame(on ? 1 : 0);
        if (on) this.lights.push({ x: p.x + 5, y: p.y, r: 10, c: 0xff2020, a: 0.7 });
      } else if (p.type === 'saw') {
        s.setFrame(Math.floor(this.time * 20) % 2);
        g.fillStyle(0x120c10, 1);
        g.fillRect(p.x0 + 5, p.y + 6, p.x2 - p.x0 + 6, 4);
        g.fillStyle(0x5a5a64, 1);
        g.fillRect(p.x0 + 6, p.y + 7, p.x2 - p.x0 + 4, 2);
      } else if (p.type === 'crusher') {
        g.fillStyle(0x6a6a74, 1);
        for (let yy = p.y0 - 64; yy < p.y; yy += 4) g.fillRect(p.x + 7, yy, 2, 3);
      } else if (p.type === 'flamejet') {
        if (p.state === 1) {
          for (let i = 0; i < 3; i++) this.parts.push({ x: p.x + 2 + Math.random() * 8, y: p.y, vx: (Math.random() - 0.5) * 20, vy: -150 - Math.random() * 80, life: 0.3, max: 0.3, c: Math.random() < 0.5 ? 0xffd040 : 0xf06010, s: 3, g: 0, grow: 2, round: true });
          this.lights.push({ x: p.x + 6, y: p.y - 20, r: 48, c: 0xff8030, a: 0.8 });
        } else if (p.state === 2 && Math.random() < 0.3) {
          this.parts.push({ x: p.x + 6, y: p.y, vx: 0, vy: -40, life: 0.3, max: 0.3, c: 0xf06010, s: 2, g: 0, grow: 0 });
        }
      }
    }
    void dt;
  }

  /** extraction vehicle; boarded players ride on it and it leaves once the level is complete */
  private drawVehicle(p: { id: number; x: number; y: number; w: number; h: number; variant?: string }, flag: Spr): void {
    const w = this.world;
    const g = this.gfx;
    const leaving = w.status === 'complete' ? w.statusT : 0;
    const riders = w.players.filter((pl) => pl.alive && pl.inVehicle && (!w.intro || w.intro.dropped >= w.players.length));
    const v = p.variant ?? 'chopper';
    const rider = (pl: (typeof riders)[number], x: number, y: number, frame: number, flip: boolean) => {
      const rs = this.spr(pl.id * 1000 + 9, `hero${pl.hero % 4}`, 12.6);
      rs.setOrigin(0.5, 1).setPosition(Math.round(x), Math.round(y)).setFrame(frame).setFlipX(flip).clearTint().setVisible(true);
    };
    if (v === 'truck') {
      flag.setVisible(false);
      const dx = leaving * leaving * 70;
      const tr = this.spr(p.id * 1000 + 7, 'truck', 6);
      const tx = p.x + p.w / 2 + dx;
      tr.setOrigin(0.5, 1).setPosition(Math.round(tx), Math.round(p.y + p.h + 1)).setFrame(leaving > 0 ? Math.floor(this.time * 16) % 2 : 0);
      if (leaving > 0 && Math.random() < 0.6) this.parts.push({ x: tx + 9, y: p.y + 2, vx: -20, vy: -30, life: 1, max: 1, c: 0x4a4446, s: 3, g: -10, grow: 6, round: true, fade: true });
      riders.forEach((pl, i) => rider(pl, p.x + 8 + i * 9 + dx, p.y + 13, FRAME.idle + (Math.floor(this.time * 2 + i) % 2), false));
      if (!leaving) this.lights.push({ x: tx + 30, y: p.y + 18, r: 30, c: 0xfff0a0, a: 0.5 });
      return;
    }
    if (v === 'plane') {
      flag.setVisible(false);
      const dx = leaving * leaving * 90;
      const dy = -(Math.max(0, leaving - 1) ** 2) * 45;
      const pl = this.spr(p.id * 1000 + 7, 'plane', 6);
      pl.setOrigin(0, 1).setPosition(Math.round(p.x + dx), Math.round(p.y + p.h + 3 + dy)).setFrame(Math.floor(this.time * 20) % 2);
      pl.setRotation(dy < 0 ? -0.12 : 0);
      if (leaving > 0 && Math.random() < 0.7) this.parts.push({ x: p.x + dx + 70, y: p.y + 14 + dy, vx: -40, vy: 0, life: 0.8, max: 0.8, c: 0x8a8a8a, s: 2, g: 0, grow: 5, round: true, fade: true });
      riders.forEach((r) => {
        let t0 = this.boardT.get(r.id);
        if (t0 === undefined) {
          t0 = this.time;
          this.boardT.set(r.id, t0);
        }
        const k = (this.time - t0) / 0.7; // 0..1 walking into the hold
        if (k < 1 && !leaving) {
          const rs = this.spr(r.id * 1000 + 9, `hero${r.hero % 4}`, 6.5);
          rs.setOrigin(0.5, 1).setPosition(Math.round(p.x + 6 + k * 14), Math.round(p.y + p.h - 2 - k * 12)).setFrame(FRAME.back + (Math.floor(this.time * 8) % 2)).setFlipX(false);
          rs.clearTint().setVisible(true).setAlpha(1 - k * 0.6);
        }
      });
      if (!leaving) {
        // blinking guide lights on the ramp
        if (Math.floor(this.time * 3) % 2) this.lights.push({ x: p.x + 8, y: p.y + p.h - 4, r: 20, c: 0x40ff60, a: 0.8 });
      }
      return;
    }
    // chopper hovering above the flag with a rope ladder
    flag.setFrame(Math.floor(this.time * 4) % 2).setVisible(!leaving);
    const ch = this.spr(p.id * 1000 + 7, 'chopper', 13);
    const dx = leaving * leaving * 60;
    const cy = p.y - 46 + Math.sin(this.time * 2) * 3 - leaving * 50;
    const cx = p.x + p.w / 2 + 6 + dx;
    ch.setOrigin(0.5, 0.5).setPosition(Math.round(cx), Math.round(cy)).setFrame(Math.floor(this.time * 24) % 2).setRotation(leaving ? -0.15 : 0);
    const lx = cx - 6;
    const bottom = p.y + p.h - 6 - leaving * 50;
    g.fillStyle(0x8a6a3a, 1);
    for (let yy = cy + 14; yy < bottom; yy += 4) {
      g.fillRect(lx - 3, yy, 1, 4);
      g.fillRect(lx + 3, yy, 1, 4);
      g.fillRect(lx - 3, yy + 3, 7, 1);
    }
    riders.forEach((pl, i) => rider(pl, lx + (i % 2 ? 2 : -2), bottom - i * 11 + 4, FRAME.back + (Math.floor(this.time * 3 + i) % 2), false));
    if (!leaving) {
      // rotor downwash
      if (Math.random() < 0.5) this.parts.push({ x: lx + (Math.random() - 0.5) * 40, y: p.y + p.h - 2, vx: (Math.random() - 0.5) * 120, vy: -10, life: 0.5, max: 0.5, c: 0xb0a890, s: 2, g: 0, grow: 3, round: true, fade: true });
    }
  }

  /** intro helicopter carrying the squad in */
  private drawIntro(): void {
    const it = this.world.intro;
    if (!it) return;
    const ch = this.spr(-777, 'chopper', 13);
    const bob = Math.sin(this.time * 3) * 2;
    ch.setOrigin(0.5, 0.5).setPosition(Math.round(it.x), Math.round(it.y + bob)).setFrame(Math.floor(this.time * 24) % 2).setFlipX(true);
    ch.setRotation(it.x < this.world.level.spawn.x ? 0.08 : -0.05);
    const riders = this.world.players.filter((p) => p.inVehicle);
    riders.forEach((p, i) => {
      const rs = this.spr(p.id * 1000 + 9, `hero${p.hero % 4}`, 12.6);
      rs.setOrigin(0.5, 1).setPosition(Math.round(it.x - 4 + i * 5), Math.round(it.y + bob + 13)).setFrame(FRAME.idle).setFlipX(false).clearTint().setVisible(true);
    });
    if (Math.random() < 0.5) {
      const gy = this.world.grid.surfaceRow(Math.floor(it.x / TILE));
      if (gy > 0 && gy * TILE - it.y < 120) this.parts.push({ x: it.x + (Math.random() - 0.5) * 50, y: gy * TILE - 2, vx: (Math.random() - 0.5) * 140, vy: -15, life: 0.5, max: 0.5, c: 0xb0a890, s: 2, g: 0, grow: 3, round: true, fade: true });
    }
  }

  private drawPickups(): void {
    for (const k of this.world.pickups) {
      const s = this.spr(k.id, `pk_${k.item}`, 6);
      s.setPosition(k.x + k.w / 2, k.y + k.h + Math.sin(this.time * 5 + k.id) * 1).setOrigin(0.5, 1);
      s.setVisible(k.life > 3 || Math.floor(this.time * 10) % 2 === 0);
      this.lights.push({ x: k.x + 6, y: k.y + 6, r: 16 + Math.sin(this.time * 6) * 3, c: 0xfff0a0, a: 0.35 });
    }
  }

  private weaponSprite(id: number, name: string, bodyX: number, bodyY: number, frame: number, facing: number, depth: number, recoil: number, pitch = 0): void {
    const hand = HAND[frame];
    const key = `w_${name}`;
    const a = WEAPON_ANCHOR[name];
    if (!hand || hand.x < -50 || !a) return;
    const ws = this.spr(id, key, depth);
    // body sprite origin is bottom-centre of a 24x24 frame
    const hx = (hand.x - 12) * facing;
    const hy = hand.y - CHAR_H;
    ws.setOrigin(facing > 0 ? a.gx / a.w : 1 - a.gx / a.w, a.gy / a.h);
    ws.setFlipX(facing < 0).setPosition(Math.round(bodyX + hx - recoil * facing), Math.round(bodyY + hy));
    ws.setRotation(pitch * facing);
  }

  private drawEnemies(dt: number, remote: boolean): void {
    const w = this.world;
    for (const e of w.enemies) {
      const human = HUMANOID.has(e.type);
      const s = this.spr(e.id, `e_${e.type}`, 10);
      const pos = this.smoothPos(e.id, e.x, e.y, remote, dt);
      const bx = Math.round(pos.x + e.w / 2);
      const by = Math.round(pos.y + e.h + 1);
      s.setOrigin(0.5, 1).setPosition(bx, by);
      s.setFlipX(e.facing < 0);
      const moving = Math.abs(e.vx) > 5;
      let f = 0;
      if (!human) {
        if (e.type === 'drone') f = Math.floor(e.animT * 16) % 2;
        else if (moving) f = [1, 2, 3, 2][Math.floor(e.animT * 10) % 4];
      } else if (!e.onGround) f = e.vy < 0 ? FRAME.jump : FRAME.fall;
      else if (moving) f = FRAME.run + (Math.floor(e.animT * 12) % 6);
      else f = FRAME.idle + (Math.floor(e.animT * 2) % 2);
      s.setFrame(f);
      if (e.hurtT > 0) s.setTintFill(0xffffff);
      else s.clearTint();
      const wpn = ENEMY_WEAPON[e.type];
      if (human && wpn) this.weaponSprite(e.id * 1000 + 1, wpn, bx, by, f, e.facing, 10.5, 0);
      if (e.type === 'sniper' && e.state === 'aim') {
        const sx = pos.x + e.w / 2 + e.facing * 12;
        const sy = pos.y + 6;
        let len = 0;
        while (len < 300 && !w.grid.solidAt(sx + e.facing * len, sy)) len += 4;
        this.fxTop.lineStyle(1, 0xff2020, 0.5 + Math.sin(this.time * 40) * 0.3);
        this.fxTop.lineBetween(sx, sy, sx + e.facing * len, sy);
        this.lights.push({ x: sx, y: sy, r: 10, c: 0xff2020, a: 0.8 });
      }
      if (e.type === 'bomber' && e.state === 'attack' && Math.floor(this.time * 12) % 2) {
        s.setTint(0xff6060);
        this.lights.push({ x: bx, y: by - 10, r: 22, c: 0xff3020, a: 0.6 });
      }
      if (e.type === 'drone') this.lights.push({ x: bx + e.facing * 3, y: by - 4, r: 8, c: 0xff2020, a: 0.6 });
    }
  }

  private drawBoss(dt: number, remote: boolean): void {
    const w = this.world;
    const b = w.boss;
    if (!b) return;
    const s = this.spr(b.id, `boss_${b.type}`, 11);
    const pos = this.smoothPos(b.id, b.x, b.y, remote, dt);
    s.setVisible(b.visible);
    if (b.type === 'tank') {
      s.setOrigin(0.5, 1).setPosition(Math.round(pos.x + b.w / 2), Math.round(pos.y + b.h + 2)).setFlipX(b.facing < 0);
      s.setFrame(Math.floor(this.time * 10) % 2);
      if (Math.random() < 0.15) this.parts.push({ x: pos.x + (b.facing > 0 ? 8 : b.w - 8), y: pos.y + 6, vx: 0, vy: -30, life: 1.2, max: 1.2, c: 0x3a3436, s: 3, g: -10, grow: 6, round: true, fade: true });
    } else if (b.type === 'gunship') {
      s.setOrigin(0.5, 0.5).setPosition(Math.round(pos.x + b.w / 2), Math.round(pos.y + b.h / 2)).setFlipX(b.facing < 0);
      s.setFrame(Math.floor(this.time * 20) % 2);
      s.setRotation(b.dying > 0 ? Math.sin(this.time * 9) * 0.3 : b.facing * 0.06);
      this.lights.push({ x: pos.x + b.w / 2 + b.facing * 24, y: pos.y + b.h / 2, r: 18, c: 0x60c0ff, a: 0.4 });
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
      if (b.visible) this.lights.push({ x: pos.x + b.w / 2, y: pos.y + b.h / 2, r: 20, c: 0xff3020, a: 0.5 });
      const a = w.level.arena;
      if (!b.visible && a && Math.random() < 0.4) {
        const fy = w.grid.surfaceRow(Math.floor((b.x + b.w / 2) / TILE));
        this.parts.push({ x: b.x + b.w / 2 + (Math.random() - 0.5) * 16, y: (fy < 0 ? a.floorRow : fy) * TILE - 2, vx: (Math.random() - 0.5) * 60, vy: -90, life: 0.5, max: 0.5, c: col(w.biome.dirt), s: 2, g: 500, grow: 0 });
      }
    }
    if (b.hurtT > 0) s.setTintFill(0xffffff);
    else s.clearTint();
  }

  private drawPlayers(dt: number, remote: boolean, localPids: Set<number>): void {
    const w = this.world;
    for (const p of w.players) {
      if (!p.alive || p.inVehicle) continue;
      const s = this.spr(p.id, `hero${p.hero % 4}`, 12);
      const pos = this.smoothPos(p.id, p.x, p.y, remote, dt, localPids.has(p.pid) ? 35 : 18);
      const bx = Math.round(pos.x + p.w / 2);
      const by = Math.round(pos.y + p.h + 1);
      s.setOrigin(0.5, 1).setPosition(bx, by);
      let facing = p.facing;
      let f: number;
      const wallCling = !p.onGround && ((p.wallR && p.vx >= 0 && (p.bits & 2) !== 0) || (p.wallL && p.vx <= 0 && (p.bits & 1) !== 0));
      if (p.climbing) {
        // seen from behind on ladders; only animate while actually moving
        const moving = Math.abs(p.vy) > 1 || Math.abs(p.vx) > 1;
        f = FRAME.back + (moving ? Math.floor(p.animT * 7) % 2 : 0);
        facing = 1;
      }
      else if (wallCling) {
        f = FRAME.wall;
        facing = p.wallR ? 1 : -1;
      } else if (!p.onGround) f = p.vy < 0 ? FRAME.jump : FRAME.fall;
      else if (Math.abs(p.vx) > 5) f = FRAME.run + (Math.floor(p.animT * 13) % 6);
      else f = FRAME.idle + (Math.floor(p.animT * 2) % 2);
      s.setFrame(f).setFlipX(facing < 0);
      const visible = p.inv <= 0 || Math.floor(this.time * 20) % 2 === 0;
      s.setVisible(visible);
      if (p.armor > 0) s.setTint(0xb0c8ff);
      else if (p.speedT > 0) s.setTint(0xb0ffff);
      else s.clearTint();
      this.weaponSprite(p.id * 1000 + 1, p.weapon, bx, by, f, facing, 12.5, p.firingT > 0.08 ? 1 : 0, p.climbing || wallCling ? 0 : p.aim);
      const ws = this.sprites.get(p.id * 1000 + 1);
      if (ws) ws.setVisible(visible);
      let lb = this.labels.get(p.id);
      if (!lb) {
        lb = this.scene.add.bitmapText(0, 0, 'pix', `P${p.pid + 1}`).setDepth(31);
        lb.setTint(col(HERO_COLORS[p.hero % 4].band));
        this.labels.set(p.id, lb);
      }
      lb.setPosition(bx - 4, by - 30 + Math.sin(this.time * 4) * 1).setVisible(w.players.length > 1);
      this.seen.add(-p.id);
    }
    for (const [id, lb] of this.labels) if (!this.seen.has(-id)) lb.setVisible(false);
  }

  private drawProjectiles(): void {
    for (const pr of this.world.projectiles) {
      const s = this.spr(pr.id, `p_${pr.type}`, 14);
      s.setPosition(Math.round(pr.x), Math.round(pr.y)).setOrigin(0.5);
      if (pr.type === 'rocket' || pr.type === 'missile' || pr.type === 'bullet' || pr.type === 'ebullet') {
        s.setRotation(Math.atan2(pr.vy, pr.vx));
        if (pr.type === 'rocket' || pr.type === 'missile') {
          this.parts.push({ x: pr.x - Math.sign(pr.vx) * 4, y: pr.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.7, max: 0.7, c: 0x9a9494, s: 2, g: -20, grow: 4, round: true, fade: true });
          this.lights.push({ x: pr.x, y: pr.y, r: 22, c: 0xff9040, a: 0.6 });
        } else {
          // tracer streak
          this.fxTop.lineStyle(1, pr.type === 'bullet' ? 0xffe080 : 0xff6040, 0.5);
          this.fxTop.lineBetween(pr.x, pr.y, pr.x - pr.vx * 0.02, pr.y - pr.vy * 0.02);
        }
      } else if (pr.type === 'thrown' || pr.type === 'grenade') {
        s.setRotation(this.time * 14 * Math.sign(pr.vx || 1));
      } else if (pr.type === 'flame') {
        s.setFrame(pr.life > 0.28 ? 0 : pr.life > 0.14 ? 1 : 2);
        if (pr.id % 3 === 0) this.lights.push({ x: pr.x, y: pr.y, r: 24, c: 0xff8030, a: 0.4 });
      } else if (pr.type === 'shell' || pr.type === 'mortar') {
        if (Math.random() < 0.5) this.parts.push({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.5, max: 0.5, c: 0x9a9a9a, s: 2, g: 0, grow: 3, round: true, fade: true });
      }
      if (pr.type === 'c4') {
        const on = Math.floor(this.time * 6) % 2 === 1;
        s.setTint(on ? 0xffffff : 0xff8080);
        if (on) this.lights.push({ x: pr.x, y: pr.y, r: 8, c: 0xff2020, a: 0.8 });
      }
    }
  }

  private smoothPos(id: number, x: number, y: number, remote: boolean, dt: number, rate = 18): { x: number; y: number } {
    if (!remote) return { x, y };
    let s = this.smooth.get(id);
    if (!s || Math.hypot(s.x - x, s.y - y) > 48) {
      s = { x, y };
      this.smooth.set(id, s);
    }
    const k = Math.min(1, dt * rate);
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

  private updateFires(dt: number): void {
    for (const f of this.fires) {
      f.life -= dt;
      f.t += dt;
      if (Math.random() < 0.7) this.parts.push({ x: f.x + (Math.random() - 0.5) * 6, y: f.y, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 40, life: 0.45, max: 0.45, c: Math.random() < 0.4 ? 0xfff080 : Math.random() < 0.6 ? 0xff9020 : 0xd84010, s: 2 + Math.random() * 2, g: -20, grow: -2, round: true });
      if (Math.random() < 0.25) this.parts.push({ x: f.x, y: f.y - 6, vx: (Math.random() - 0.5) * 8 + 6, vy: -25, life: 2.6, max: 2.6, c: 0x1e1a1c, s: 3, g: -6, grow: 10, round: true, fade: true });
      this.lights.push({ x: f.x, y: f.y - 4, r: 30 + Math.sin(f.t * 20) * 4, c: 0xff8030, a: Math.min(1, f.life) * 0.7 });
    }
    this.fires = this.fires.filter((f) => f.life > 0 && this.world.grid.solidAt(f.x, f.y + 1));
  }

  private drawParticles(dt: number): void {
    const g = this.gfx;
    const sg = this.smokeG;
    sg.clear();
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.g > 100 && this.world.grid.solidAt(p.x, p.y)) {
        if (p.stick) {
          this.stamp(p.x, p.y, p.c, 0.9, p.s, p.s);
          p.life = 0;
          continue;
        }
        p.vy = -p.vy * 0.3;
        p.vx *= 0.5;
        p.y -= 1;
      }
      const k = 1 - p.life / p.max;
      const size = Math.max(0.5, p.s + p.grow * k);
      const alpha = p.fade ? Math.max(0, 1 - k) * 0.85 : 1;
      if (p.round) {
        sg.fillStyle(p.c, alpha);
        sg.fillCircle(Math.round(p.x), Math.round(p.y), size / 2);
      } else {
        g.fillStyle(p.c, alpha);
        g.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), Math.ceil(size), Math.ceil(size));
      }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 1800) this.parts.splice(0, this.parts.length - 1800);
  }

  private drawLights(dt: number): void {
    let i = 0;
    const cx = this.world.cam.x;
    const cy = this.world.cam.y;
    for (const l of this.lights) {
      if (l.x < cx - 80 || l.x > cx + VIEW_W + 80 || l.y < cy - 80 || l.y > cy + VIEW_H + 80) continue;
      let img = this.lightPool[i];
      if (!img) {
        img = this.scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(89.5);
        this.lightPool.push(img);
      }
      img.setVisible(true).setPosition(Math.round(l.x), Math.round(l.y)).setScale((l.r / 32) * (this.night ? 1.25 : 1)).setTint(l.c).setAlpha(Math.min(1, l.a * (this.night ? 1.3 : 0.8)));
      i++;
    }
    for (; i < this.lightPool.length; i++) this.lightPool[i].setVisible(false);
    // explosion lights fade out over a few frames, everything else is per-frame
    this.lights = this.lights.filter((l) => l.r > 60 && (l.a -= dt * 4) > 0);
  }

  // weather lives in screen space
  private wparts: { x: number; y: number; vx: number; vy: number; c: number; s: number; dead?: boolean }[] = [];
  private spawnWeather(initial = false): void {
    const kind = this.world.biome.weather;
    if (kind === 'none') return;
    const x = Math.random() * (VIEW_W + 60) - 30;
    const y = initial ? Math.random() * VIEW_H : -4;
    if (kind === 'rain') this.wparts.push({ x, y, vx: -40, vy: 300, c: 0x8090c0, s: 1 });
    else if (kind === 'snow') this.wparts.push({ x, y, vx: -10 + Math.random() * 20, vy: 20 + Math.random() * 20, c: 0xffffff, s: Math.random() < 0.3 ? 2 : 1 });
    else if (kind === 'sand') this.wparts.push({ x: initial ? x : VIEW_W + 4, y: Math.random() * VIEW_H, vx: -160 - Math.random() * 80, vy: 10, c: 0xf0d090, s: 1 });
    else if (kind === 'ash') this.wparts.push({ x, y, vx: -15 + Math.random() * 10, vy: 15 + Math.random() * 15, c: Math.random() < 0.3 ? 0xff8030 : 0x5a5a5a, s: 1 });
    else if (kind === 'smog') this.wparts.push({ x: initial ? x : VIEW_W + 10, y: Math.random() * VIEW_H, vx: -12, vy: 0, c: 0xb0a080, s: 8 });
  }

  private drawWeather(dt: number): void {
    const kind = this.world.biome.weather;
    if (kind === 'none') return;
    const g = this.weather;
    g.clear();
    const target = kind === 'smog' ? 20 : kind === 'rain' ? 110 : 80;
    while (this.wparts.length < target) this.spawnWeather();
    for (const p of this.wparts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (kind === 'snow' || kind === 'ash') p.x += Math.sin(this.time * 2 + p.y * 0.05) * 10 * dt;
      g.fillStyle(p.c, kind === 'smog' ? 0.1 : kind === 'rain' ? 0.55 : 0.9);
      if (kind === 'rain') g.fillRect(Math.round(p.x), Math.round(p.y), 1, 5);
      else g.fillRect(Math.round(p.x), Math.round(p.y), p.s, kind === 'sand' ? 1 : p.s);
      if (p.y > VIEW_H + 6 || p.x < -40 || p.x > VIEW_W + 40) p.dead = true;
    }
    this.wparts = this.wparts.filter((p) => !p.dead);
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
    case T.STONE:
      return b.rock;
    default:
      return b.dirt;
  }
}
