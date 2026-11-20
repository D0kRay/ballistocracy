import Phaser from 'phaser';
import { LEVEL_H_TILES, TILE, VIEW_H, VIEW_W } from '../config';
import { music } from '../audio/Music';
import { getInput } from '../input/InputManager';
import { WorldRenderer } from '../render/WorldRenderer';
import { tileFrame } from '../gfx/terrain';
import { World } from '../sim/World';
import { BIOMES, type BiomeId } from '../world/biomes';
import { generateLevel } from '../world/LevelGen';
import {
  ARENA_W, BACK_CHARS, BOSSES, ENEMY_TYPES, ITEMS, PROP_TYPES, SCENERY_TYPES, TILE_CHARS, VEHICLES,
  blankLevel, levelFromFile, levelToFile, validateLevel, type LevelEntity, type LevelFile,
} from '../world/levelFormat';
import { saveMyLevel, slug } from '../world/levelLibrary';
import { T } from '../world/tiles';

// In-game level editor: paint tiles/background, place enemies, props, items,
// scenery, spawn and extraction, then playtest, save or export as JSON.

interface Entry {
  label: string;
  key: string;
  frame: number;
  place: (cx: number, cy: number) => void;
  drag?: boolean;
}
interface Category {
  name: string;
  entries: Entry[];
}

const DRAFT_KEY = 'ballistocracy-editor-draft-v1';
const BAR_H = 30;

export class EditorScene extends Phaser.Scene {
  private file!: LevelFile;
  private id = '';
  private tiles: string[][] = [];
  private back: string[][] = [];
  private world!: World;
  private view!: WorldRenderer;
  private cats: Category[] = [];
  private cat = 0;
  private sel = 0;
  private overlay!: Phaser.GameObjects.Graphics;
  private barG!: Phaser.GameObjects.Graphics;
  private barIcons: Phaser.GameObjects.Image[] = [];
  private barText!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private painting: 'paint' | 'erase' | null = null;
  private lastCell = '';
  private dom: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private dirty = 0;
  private keyLatch = new Set<string>();

  constructor() {
    super('Editor');
  }

  init(data: { file?: LevelFile; id?: string }): void {
    let f = data?.file;
    if (!f) {
      try {
        const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as { file: LevelFile; id: string } | null;
        if (d && validateLevel(d.file).errors.every((e) => !e.startsWith('tiles'))) {
          f = d.file;
          this.id = d.id;
        }
      } catch {
        /* no draft */
      }
    } else this.id = data.id ?? '';
    this.file = JSON.parse(JSON.stringify(f ?? blankLevel())) as LevelFile;
    if (!this.id) this.id = slug(this.file.name) + '-' + Math.floor(Math.random() * 1e6).toString(36);
    this.tiles = this.file.tiles.map((r) => [...r]);
    this.back = (this.file.back ?? this.file.tiles.map((r) => '.'.repeat(r.length))).map((r) => [...r]);
    this.painting = null;
  }

  create(): void {
    music.stop();
    const level = levelFromFile(this.file);
    this.world = new World(level, []);
    this.world.cam = { x: Math.max(0, this.file.spawn.x * TILE - 120), y: this.world.levelH - VIEW_H };
    this.view = new WorldRenderer(this, this.world);
    this.overlay = this.add.graphics().setDepth(95);
    this.barG = this.add.graphics().setScrollFactor(0).setDepth(120);
    this.barText = this.add.bitmapText(4, VIEW_H - BAR_H + 2, 'pix', '').setScrollFactor(0).setDepth(121);
    this.hint = this.add
      .bitmapText(VIEW_W - 4, VIEW_H - BAR_H - 9, 'pix', 'LMB PLACE  RMB ERASE  WASD/WHEEL SCROLL  Q/E CATEGORY  P PLAYTEST')
      .setOrigin(1, 0).setScrollFactor(0).setDepth(121).setTint(0xc0c0c0);
    this.buildPalette();
    this.drawBar();
    this.buildDom();

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => (this.painting = null));
    this.input.on('wheel', (_p: unknown, _o: unknown, dx: number, dy: number) => {
      this.world.cam.x = Phaser.Math.Clamp(this.world.cam.x + (dy + dx) * 0.6, 0, Math.max(0, this.world.levelW - VIEW_W));
    });
    this.events.once('shutdown', () => this.destroyDom());
  }

  // ---------------------------------------------------------------- palette
  private buildPalette(): void {
    const b = this.file.biome;
    const tileKey = `tiles_${b}`;
    const tilesCat: Entry[] = Object.entries(TILE_CHARS)
      .filter(([ch]) => ch !== '.')
      .map(([ch, t]) => ({ label: tileName(t), key: tileKey, frame: tileFrame(t, 15, 0), place: (x, y) => this.setTile(x, y, ch), drag: true }));
    const backCat: Entry[] = Object.entries(BACK_CHARS)
      .filter(([ch]) => ch !== '.')
      .map(([ch, v]) => ({ label: ['', 'EARTH WALL', 'STONE WALL', 'WINDOW', 'WOOD WALL'][v], key: `back_${b}`, frame: v, place: (x, y) => this.setBack(x, y, ch), drag: true }));
    const ent = (e: LevelEntity) => {
      this.file.entities = this.file.entities.filter((o) => !(o.x === e.x && o.y === e.y && o.kind === e.kind));
      this.file.entities.push(e);
      this.syncEntities();
    };
    this.cats = [
      { name: 'TILES', entries: tilesCat },
      { name: 'BACKGROUND', entries: backCat },
      { name: 'ENEMIES', entries: ENEMY_TYPES.map((t) => ({ label: t.toUpperCase(), key: `e_${t}`, frame: 0, place: (x, y) => ent({ kind: 'enemy', type: t, x, y: t === 'drone' ? y : y + 1 }) })) },
      {
        name: 'PROPS & TRAPS',
        entries: PROP_TYPES.map((t) => ({
          label: t.toUpperCase(), key: t === 'acid' ? 'pk_life' : t, frame: 0,
          place: (x: number, y: number) => ent(t === 'saw' ? { kind: 'prop', type: t, x, y: y + 1, x2: x + 4 } : t === 'crate' ? { kind: 'prop', type: t, x, y: y + 1, item: 'ammo' } : { kind: 'prop', type: t, x, y: y + 1 }),
        })),
      },
      { name: 'ITEMS', entries: ITEMS.map((it) => ({ label: it.toUpperCase(), key: `pk_${it}`, frame: 0, place: (x, y) => ent({ kind: 'pickup', item: it, x, y: y + 1 }) })) },
      { name: 'SCENERY', entries: SCENERY_TYPES.map((t) => ({ label: t.toUpperCase().replace('_', ' '), key: `sc_${t}`, frame: 0, place: (x, y) => ent({ kind: 'scenery', type: t, x, y: y + 1 }) })) },
      {
        name: 'START / END',
        entries: [
          { label: 'SPAWN', key: 'hero0', frame: 0, place: (x, y) => { this.file.spawn = { x, y: y + 1 }; this.syncEntities(); } },
          ...VEHICLES.map((v) => ({ label: `EXIT ${v.toUpperCase()}`, key: v, frame: 0, place: (x: number, y: number) => { this.file.exit = { x, y: y + 1, vehicle: v }; this.file.boss = null; this.syncEntities(); } })),
          ...BOSSES.map((bt) => ({ label: `BOSS ${bt.toUpperCase()}`, key: `boss_${bt}`, frame: 0, place: () => { this.file.boss = { type: bt }; this.syncEntities(); } })),
        ],
      },
    ];
  }

  private drawBar(): void {
    const g = this.barG;
    g.clear();
    g.fillStyle(0x120c10, 0.92).fillRect(0, VIEW_H - BAR_H, VIEW_W, BAR_H);
    g.lineStyle(1, 0xf0c020, 1).lineBetween(0, VIEW_H - BAR_H, VIEW_W, VIEW_H - BAR_H);
    const c = this.cats[this.cat];
    const e = c.entries[this.sel];
    this.barText.setText(`< ${c.name} >\n${e?.label ?? ''}`);
    for (const i of this.barIcons) i.destroy();
    this.barIcons = [];
    const x0 = 96;
    const slot = 22;
    const fit = Math.floor((VIEW_W - x0) / slot);
    const start = Math.max(0, Math.min(this.sel - Math.floor(fit / 2), c.entries.length - fit));
    c.entries.slice(start, start + fit).forEach((en, k) => {
      const i = start + k;
      const x = x0 + k * slot + slot / 2;
      const y = VIEW_H - BAR_H / 2;
      if (i === this.sel) g.fillStyle(0xf0c020, 0.35).fillRect(x - slot / 2 + 1, VIEW_H - BAR_H + 2, slot - 2, BAR_H - 4);
      if (!this.textures.exists(en.key)) return;
      const img = this.add.image(x, y, en.key, en.frame).setScrollFactor(0).setDepth(121);
      const s = Math.min(1, 20 / Math.max(img.width, img.height));
      img.setScale(s).setInteractive({ useHandCursor: true });
      img.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event.stopPropagation();
        this.sel = i;
        this.drawBar();
      });
      this.barIcons.push(img);
    });
  }

  // ---------------------------------------------------------------- editing
  private cell(p: Phaser.Input.Pointer): { cx: number; cy: number } | null {
    if (p.y > VIEW_H - BAR_H) return null;
    const cx = Math.floor((p.x + this.world.cam.x) / TILE);
    const cy = Math.floor((p.y + this.world.cam.y) / TILE);
    if (cx < 0 || cy < 0 || cx >= this.file.width || cy >= this.file.height) return null;
    return { cx, cy };
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const c = this.cell(p);
    if (!c) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.painting = p.rightButtonDown() ? 'erase' : 'paint';
    this.lastCell = '';
    this.apply(c.cx, c.cy);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.painting || !p.isDown) return;
    const entry = this.cats[this.cat].entries[this.sel];
    if (this.painting === 'paint' && !entry?.drag) return;
    const c = this.cell(p);
    if (c) this.apply(c.cx, c.cy);
  }

  private apply(cx: number, cy: number): void {
    const k = `${cx},${cy}`;
    if (k === this.lastCell) return;
    this.lastCell = k;
    const cat = this.cats[this.cat];
    if (this.painting === 'erase') {
      if (cat.name === 'BACKGROUND') this.setBack(cx, cy, '.');
      else if (cat.name === 'TILES') this.setTile(cx, cy, '.');
      else {
        const before = this.file.entities.length;
        this.file.entities = this.file.entities.filter((e) => !(e.x === cx && (e.y === cy + 1 || e.y === cy)));
        if (this.file.entities.length !== before) this.syncEntities();
      }
      return;
    }
    cat.entries[this.sel]?.place(cx, cy);
    this.touch();
  }

  private setTile(x: number, y: number, ch: string): void {
    if (this.tiles[y][x] === ch) return;
    this.tiles[y][x] = ch;
    this.world.grid.set(x, y, TILE_CHARS[ch]);
    this.view.applyTileChanges(this.world.grid.drainDirty());
    this.touch();
  }

  private setBack(x: number, y: number, ch: string): void {
    if (this.back[y][x] === ch) return;
    this.back[y][x] = ch;
    this.view.setBack(x, y, BACK_CHARS[ch]);
    this.touch();
  }

  private serialize(): LevelFile {
    this.file.tiles = this.tiles.map((r) => r.join(''));
    this.file.back = this.back.map((r) => r.join(''));
    return this.file;
  }

  /** push the entity list into the preview world (renderer draws them every frame) */
  private syncEntities(): void {
    const lvl = levelFromFile(this.serialize());
    const w = this.world;
    w.enemies = [];
    w.props = [];
    w.pickups = [];
    for (const e of lvl.enemies) w.spawnEnemy(e.type, e.x, e.y).facing = -1;
    for (const p of lvl.props) w.spawnProp(p);
    for (const p of lvl.pickups) w.spawnPickup(p.item, p.x, p.y, Infinity).vy = 0;
    w.level.scenery = lvl.scenery;
    w.level.arena = lvl.arena;
    w.level.spawn.x = lvl.spawn.x;
    w.level.spawn.y = lvl.spawn.y;
    this.view.rebuildScenery();
    this.touch();
  }

  private touch(): void {
    this.dirty = this.time.now;
  }

  private restartWith(f: LevelFile): void {
    this.scene.restart({ file: f, id: this.id });
  }

  // ---------------------------------------------------------------- DOM toolbar
  private buildDom(): void {
    const root = document.createElement('div');
    root.id = 'editor-ui';
    root.innerHTML = `
      <input data-k="name" maxlength="40" placeholder="LEVEL NAME">
      <input data-k="author" maxlength="40" placeholder="AUTHOR">
      <select data-k="biome">${BIOMES.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</select>
      <select data-k="tod"><option value="day">DAY</option><option value="dusk">DUSK</option><option value="night">NIGHT</option></select>
      <label>W <input data-k="width" type="number" min="40" max="1000" step="10" style="width:56px"></label>
      <button data-a="play">PLAYTEST</button><button data-a="save">SAVE</button><button data-a="export">EXPORT</button>
      <button data-a="import">IMPORT</button><button data-a="new">NEW</button><button data-a="gen">FROM SEED</button><button data-a="menu">MENU</button>
      <div class="status"></div>`;
    document.body.appendChild(root);
    this.dom = root;
    this.statusEl = root.querySelector('.status');
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    q<HTMLInputElement>('[data-k=name]').value = this.file.name;
    q<HTMLInputElement>('[data-k=author]').value = this.file.author;
    q<HTMLSelectElement>('[data-k=biome]').value = this.file.biome;
    q<HTMLSelectElement>('[data-k=tod]').value = this.file.tod;
    q<HTMLInputElement>('[data-k=width]').value = String(this.file.width);
    q<HTMLInputElement>('[data-k=name]').oninput = (e) => { this.file.name = (e.target as HTMLInputElement).value.toUpperCase(); this.touch(); };
    q<HTMLInputElement>('[data-k=author]').oninput = (e) => { this.file.author = (e.target as HTMLInputElement).value; this.touch(); };
    q<HTMLSelectElement>('[data-k=biome]').onchange = (e) => { this.file.biome = (e.target as HTMLSelectElement).value as BiomeId; this.restartWith(this.serialize()); };
    q<HTMLSelectElement>('[data-k=tod]').onchange = (e) => { this.file.tod = (e.target as HTMLSelectElement).value as LevelFile['tod']; this.restartWith(this.serialize()); };
    q<HTMLInputElement>('[data-k=width]').onchange = (e) => this.resize(Number((e.target as HTMLInputElement).value));
    root.querySelectorAll('button').forEach((b) => (b.onclick = () => this.action(b.dataset.a ?? '')));
    // keep typing in the inputs from moving the camera / triggering shortcuts
    root.addEventListener('keydown', (e) => e.stopPropagation());
    this.status('READY - SAVED LEVELS SHOW UP UNDER "COMMUNITY LEVELS > MY LEVELS"');
  }

  private destroyDom(): void {
    this.dom?.remove();
    this.dom = null;
  }

  private status(msg: string, bad = false): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = msg;
    this.statusEl.style.color = bad ? '#ff7070' : '#a0e0a0';
  }

  private check(): boolean {
    const v = validateLevel(this.serialize());
    if (!v.ok) this.status('CANNOT USE YET: ' + v.errors.slice(0, 3).join(' | '), true);
    else this.status(v.warnings.length ? 'OK (WARNING: ' + v.warnings[0] + ')' : 'LEVEL IS VALID');
    return v.ok;
  }

  private action(a: string): void {
    const f = this.serialize();
    if (a === 'save') {
      if (!this.check()) return;
      if (saveMyLevel(this.id, f)) this.status(`SAVED "${f.name}" TO MY LEVELS`);
    } else if (a === 'play') {
      if (!this.check()) return;
      this.saveDraft();
      this.scene.start('Game', {
        mode: 'local', level: 0, seed: 0, total: 0, lives: 9,
        players: [{ pid: 0, hero: 0, owner: 'host', device: 'kbA' }],
        custom: f, returnTo: { scene: 'Editor', data: { file: f, id: this.id } },
      });
    } else if (a === 'export') {
      this.check();
      const blob = new Blob([JSON.stringify(f, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slug(f.name)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (a === 'import') {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.onchange = async () => {
        const file = inp.files?.[0];
        if (!file) return;
        try {
          const data = JSON.parse(await file.text()) as LevelFile;
          const v = validateLevel(data);
          if (v.errors.some((e) => e.startsWith('tiles') || e.startsWith('width') || e.startsWith('height') || e.startsWith('format'))) {
            this.status('IMPORT FAILED: ' + v.errors.slice(0, 2).join(' | '), true);
            return;
          }
          this.id = slug(data.name) + '-' + Math.floor(Math.random() * 1e6).toString(36);
          this.restartWith(data);
        } catch {
          this.status('IMPORT FAILED: NOT A JSON LEVEL FILE', true);
        }
      };
      inp.click();
    } else if (a === 'new') {
      this.id = '';
      localStorage.removeItem(DRAFT_KEY);
      this.restartWith(blankLevel(80, this.file.biome));
    } else if (a === 'gen') {
      const seed = Math.floor(Math.random() * 1e9);
      const lvl = generateLevel(3, seed, 0);
      const nf = levelToFile(lvl, { name: `GENERATED ${seed % 10000}`, author: this.file.author });
      this.id = '';
      this.restartWith(nf);
    } else if (a === 'menu') {
      this.saveDraft();
      this.scene.start('Menu');
    }
  }

  private resize(w: number): void {
    w = Phaser.Math.Clamp(Math.round(w / 10) * 10, 40, 1000);
    const f = this.serialize();
    const old = f.width;
    if (w === old) return;
    f.tiles = f.tiles.map((r, y) => (w > old ? r + (y === f.height - 1 ? 'x' : r[old - 1] === '.' ? '.' : r[old - 1]).repeat(w - old) : r.slice(0, w)));
    f.back = (f.back ?? []).map((r) => (w > old ? r + r[old - 1].repeat(w - old) : r.slice(0, w)));
    f.width = w;
    f.entities = f.entities.filter((e) => e.x < w);
    if (f.exit && f.exit.x >= w - 8) f.exit.x = Math.max(0, w - 9);
    if (f.spawn.x >= w) f.spawn.x = 3;
    this.restartWith(f);
  }

  private saveDraft(): void {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ file: this.serialize(), id: this.id }));
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- frame
  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    const inp = getInput();
    inp.poll();
    const tap = (code: string) => {
      if (inp.keyDown(code)) {
        if (this.keyLatch.has(code)) return false;
        this.keyLatch.add(code);
        return true;
      }
      this.keyLatch.delete(code);
      return false;
    };
    const sp = 260 * dt;
    if (inp.keyDown('KeyA') || inp.keyDown('ArrowLeft')) this.world.cam.x -= sp;
    if (inp.keyDown('KeyD') || inp.keyDown('ArrowRight')) this.world.cam.x += sp;
    if (inp.keyDown('KeyW') || inp.keyDown('ArrowUp')) this.world.cam.y -= sp;
    if (inp.keyDown('KeyS') || inp.keyDown('ArrowDown')) this.world.cam.y += sp;
    this.world.cam.x = Phaser.Math.Clamp(this.world.cam.x, 0, Math.max(0, this.world.levelW - VIEW_W));
    this.world.cam.y = Phaser.Math.Clamp(this.world.cam.y, 0, Math.max(0, this.world.levelH - VIEW_H + BAR_H));
    if (tap('KeyQ')) { this.cat = (this.cat + this.cats.length - 1) % this.cats.length; this.sel = 0; this.drawBar(); }
    if (tap('KeyE')) { this.cat = (this.cat + 1) % this.cats.length; this.sel = 0; this.drawBar(); }
    if (tap('KeyZ')) { this.sel = Math.max(0, this.sel - 1); this.drawBar(); }
    if (tap('KeyC')) { this.sel = Math.min(this.cats[this.cat].entries.length - 1, this.sel + 1); this.drawBar(); }
    if (tap('KeyP')) this.action('play');
    if (tap('Escape')) this.action('menu');

    this.view.update(dt, false);
    // camera may extend below the level to make room for the palette bar
    this.cameras.main.setScroll(Math.round(this.world.cam.x), Math.round(this.world.cam.y));

    const g = this.overlay;
    g.clear();
    // level bounds + arena
    g.lineStyle(1, 0xffffff, 0.25).strokeRect(0.5, 0.5, this.world.levelW - 1, this.world.levelH - 1);
    if (this.file.boss) {
      const ax = (this.file.width - ARENA_W) * TILE;
      g.fillStyle(0xff2020, 0.12).fillRect(ax, 0, ARENA_W * TILE, this.world.levelH);
      g.lineStyle(1, 0xff4040, 0.8).strokeRect(ax + 0.5, 0.5, ARENA_W * TILE - 1, this.world.levelH - 1);
    }
    // spawn marker
    const sx = this.file.spawn.x * TILE;
    const sy = this.file.spawn.y * TILE;
    g.lineStyle(1, 0x40ff60, 1).strokeRect(sx + 0.5, sy - 32 + 0.5, 15, 31);
    g.fillStyle(0x40ff60, 0.25).fillRect(sx, sy - 32, 16, 32);
    // hovered cell
    const p = this.input.activePointer;
    const c = this.cell(p);
    if (c) g.lineStyle(1, this.painting === 'erase' ? 0xff4040 : 0xffe040, 1).strokeRect(c.cx * TILE + 0.5, c.cy * TILE + 0.5, 15, 15);

    if (this.dirty && this.time.now - this.dirty > 800) {
      this.dirty = 0;
      this.saveDraft();
    }
  }
}

function tileName(t: number): string {
  return ['', 'DIRT', 'BLOCK', 'WOOD', 'METAL', 'BEDROCK', 'LADDER', 'SANDBAG', 'PLATFORM', 'CRUMBLE', 'ROCK'][t] ?? '?';
}
void T;
