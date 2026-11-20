import Phaser from 'phaser';
import { TILE } from '../config';
import { Rng, hash2 } from '../core/rng';
import { shade } from '../gfx/SpriteForge';
import type { Biome } from '../world/biomes';
import type { Grid } from '../world/Grid';
import { T, isSolid } from '../world/tiles';

// Natural ground (dirt, rock, bedrock) is painted pixel by pixel into big canvases
// instead of being stamped as 16x16 tiles: textures are sampled in world space
// (no repeating squares), exposed edges get organic jitter + rounded corners,
// a dark outline, grass caps with blades, hanging roots, and buried ground
// darkens smoothly with depth. Man-made blocks still come from the tilemap.

const CHUNK_T = 32; // tiles per canvas chunk
const PAT = 128; // pattern size (px), tileable
const OUTLINE: [number, number, number] = [18, 12, 16];

type Rgb = [number, number, number];

export function isNatural(t: number): boolean {
  return t === T.DIRT || t === T.STONE || t === T.BEDROCK;
}

function hexRgb(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** tileable value noise */
function wrapNoise(rng: Rng, cell: number): (x: number, y: number) => number {
  const n = PAT / cell;
  const g = Array.from({ length: n * n }, () => rng.next());
  const at = (x: number, y: number) => g[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    let tx = fx - x0;
    let ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    return at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
  };
}

/** a 128x128 tileable material pattern: base tones + chunky clods/boulders */
function makePattern(seed: number, base: string, dark: string, light: string, clods: number, clodR: [number, number], boulder: boolean): Uint8ClampedArray {
  const rng = new Rng(seed);
  const out = new Uint8ClampedArray(PAT * PAT * 3);
  const n1 = wrapNoise(rng, 32);
  const n2 = wrapNoise(rng, 8);
  const b = hexRgb(base);
  const d = hexRgb(dark);
  const l = hexRgb(light);
  const mix = (a: Rgb, c: Rgb, t: number): Rgb => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
  for (let y = 0; y < PAT; y++)
    for (let x = 0; x < PAT; x++) {
      const v = n1(x, y) * 0.6 + n2(x, y) * 0.4 + (rng.next() - 0.5) * 0.08;
      // quantise to 4 steps: keeps a pixel-art look instead of smooth noise
      const q = v < 0.38 ? 0 : v < 0.52 ? 1 : v < 0.66 ? 2 : 3;
      const c = q === 0 ? mix(b, d, 0.55) : q === 1 ? mix(b, d, 0.25) : q === 2 ? b : mix(b, l, 0.25);
      const i = (y * PAT + x) * 3;
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
    }
  // clods / boulders with light top-left rim and dark bottom-right rim
  for (let k = 0; k < clods; k++) {
    const cx = rng.int(0, PAT - 1);
    const cy = rng.int(0, PAT - 1);
    const r = rng.int(clodR[0], clodR[1]);
    const tone = boulder ? mix(b, l, rng.range(0.1, 0.35)) : mix(b, l, rng.range(0.15, 0.4));
    for (let dy = -r - 1; dy <= r + 1; dy++)
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const dist = Math.hypot(dx, dy * (boulder ? 1.15 : 1.3));
        if (dist > r + 0.5) continue;
        const x = (cx + dx + PAT) % PAT;
        const y = (cy + dy + PAT) % PAT;
        const i = (y * PAT + x) * 3;
        let c: Rgb = tone;
        if (dist > r - 1) c = dx + dy > 0 ? mix(d, b, 0.2) : mix(tone, l, 0.5);
        else if (dx + dy < -r * 0.6) c = mix(tone, l, 0.35);
        out[i] = c[0];
        out[i + 1] = c[1];
        out[i + 2] = c[2];
      }
  }
  return out;
}

export class TerrainPainter {
  private grid: Grid;
  private back: Uint8Array;
  private biome: Biome;
  private scene: Phaser.Scene;
  private chunks: { tex: Phaser.Textures.CanvasTexture; img: Phaser.GameObjects.Image; data: ImageData; dirty: boolean }[] = [];
  private pats: Record<string, Uint8ClampedArray> = {};
  private depth: Float32Array;
  private grassTop: Rgb;
  private grassDark: Rgb;
  private grassLight: Rgb;
  private rootCol: Rgb;
  private snow: boolean;
  private seedJ: number;

  constructor(scene: Phaser.Scene, grid: Grid, back: Uint8Array, biome: Biome, seed: number) {
    this.scene = scene;
    this.grid = grid;
    this.back = back;
    this.biome = biome;
    this.seedJ = seed;
    const b = biome;
    this.pats.dirt = makePattern(11, shade(b.dirt, 0.88), shade(b.dirtDark, 0.7), shade(b.dirt, 1.18), 70, [2, 5], false);
    this.pats.stone = makePattern(23, b.rock, shade(b.rock, 0.5), shade(b.rock, 1.4), 40, [4, 9], true);
    this.pats.bedrock = makePattern(37, shade(b.dirtDark, 0.45), shade(b.dirtDark, 0.25), shade(b.dirtDark, 0.7), 30, [3, 7], true);
    this.pats.backEarth = makePattern(51, shade(b.dirtDark, 0.42), shade(b.dirtDark, 0.28), shade(b.dirtDark, 0.55), 40, [2, 5], false);
    this.grassTop = hexRgb(b.top);
    this.grassDark = hexRgb(b.topDark);
    this.grassLight = hexRgb(shade(b.top, 1.3));
    this.rootCol = hexRgb(b.vines ?? shade(b.dirtDark, 0.6));
    this.snow = b.id === 'snow';
    this.depth = new Float32Array(grid.w * grid.h);

    const nChunks = Math.ceil(grid.w / CHUNK_T);
    const hpx = grid.h * TILE;
    for (let c = 0; c < nChunks; c++) {
      const key = `terrain_chunk_${c}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      const wpx = Math.min(CHUNK_T, grid.w - c * CHUNK_T) * TILE;
      const tex = scene.textures.createCanvas(key, wpx, hpx)!;
      const img = scene.add.image(c * CHUNK_T * TILE, 0, key).setOrigin(0).setDepth(-0.2);
      this.chunks.push({ tex, img, data: tex.getContext().createImageData(wpx, hpx), dirty: true });
    }
    this.computeDepth(0, 0, grid.w - 1, grid.h - 1);
    this.paint(0, 0, grid.w - 1, grid.h - 1);
    this.flush();
  }

  destroy(): void {
    for (const c of this.chunks) {
      c.img.destroy();
      this.scene.textures.remove(c.tex);
    }
  }

  /** call after tiles changed around (tx, ty) */
  repaint(tx: number, ty: number): void {
    this.computeDepth(tx - 4, ty - 4, tx + 4, ty + 4);
    this.paint(tx - 4, ty - 4, tx + 4, ty + 4);
  }

  flush(): void {
    for (const c of this.chunks) {
      if (!c.dirty) continue;
      c.tex.getContext().putImageData(c.data, 0, 0);
      c.tex.refresh();
      c.dirty = false;
    }
  }

  // --------------------------------------------------------------- shape
  private solidAny(tx: number, ty: number): boolean {
    const t = this.grid.get(tx, ty);
    return isSolid(t) || t === T.SANDBAG;
  }

  /** grass only grows where nothing solid hangs above (not inside caves/tunnels) */
  private openSky(tx: number, ty: number): boolean {
    for (let y = ty - 1; y >= 0; y--) if (this.solidAny(tx, y)) return false;
    return true;
  }

  private jitter(a: number, b: number): number {
    return hash2(a + this.seedJ, b) % 3; // 0..2 px
  }

  /** is world pixel (wx, wy) covered by ground? (natural tiles get organic edges) */
  private inside(wx: number, wy: number): boolean {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    const t = this.grid.get(tx, ty);
    if (!isNatural(t)) return this.solidAny(tx, ty);
    const lx = wx - tx * TILE;
    const ly = wy - ty * TILE;
    const up = !this.solidAny(tx, ty - 1);
    const dn = !this.solidAny(tx, ty + 1) && ty + 1 < this.grid.h;
    const lf = !this.solidAny(tx - 1, ty);
    const rt = !this.solidAny(tx + 1, ty);
    // jittered exposed edges (noise follows world x/y so neighbours line up)
    if (up && ly < this.jitter(Math.floor(wx / 3), 1) * 0.5) return false;
    if (dn && ly > 15 - this.jitter(Math.floor(wx / 3), 7)) return false;
    if (lf && lx < this.jitter(Math.floor(wy / 3), 3)) return false;
    if (rt && lx > 15 - this.jitter(Math.floor(wy / 3), 5)) return false;
    // rounded outer corners
    const R = 5;
    const corner = (cx: number, cy: number) => Math.hypot(lx - cx, ly - cy) > R;
    if (up && lf && lx < R && ly < R && corner(R, R)) return false;
    if (up && rt && lx > 15 - R && ly < R && corner(15 - R, R)) return false;
    if (dn && lf && lx < R && ly > 15 - R && corner(R, 15 - R)) return false;
    if (dn && rt && lx > 15 - R && ly > 15 - R && corner(15 - R, 15 - R)) return false;
    return true;
  }

  private computeDepth(x0: number, y0: number, x1: number, y1: number): void {
    const g = this.grid;
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(g.w - 1, x1);
    y1 = Math.min(g.h - 1, y1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        let d = 4;
        if (!this.solidAny(x, y)) d = 0;
        else
          for (let r = 1; r <= 4 && d === 4; r++)
            for (let dy = -r; dy <= r && d === 4; dy++)
              for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                const yy = y + dy;
                if (yy < 0) continue;
                if (yy < g.h && !this.solidAny(x + dx, yy)) {
                  d = r;
                  break;
                }
              }
        this.depth[y * g.w + x] = d;
      }
  }

  /** smooth depth at pixel: bilinear between tile centres */
  private depthAt(wx: number, wy: number): number {
    const g = this.grid;
    const fx = wx / TILE - 0.5;
    const fy = wy / TILE - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const d = (x: number, y: number) => this.depth[Math.min(g.h - 1, Math.max(0, y)) * g.w + Math.min(g.w - 1, Math.max(0, x))];
    return d(x0, y0) * (1 - tx) * (1 - ty) + d(x0 + 1, y0) * tx * (1 - ty) + d(x0, y0 + 1) * (1 - tx) * ty + d(x0 + 1, y0 + 1) * tx * ty;
  }

  // --------------------------------------------------------------- paint
  private paint(x0: number, y0: number, x1: number, y1: number): void {
    const g = this.grid;
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(g.w - 1, x1);
    y1 = Math.min(g.h - 1, y1);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) this.paintTile(tx, ty);
    // overlays (grass blades / roots) reach into neighbouring cells, so draw them last
    for (let ty = Math.max(0, y0 - 1); ty <= Math.min(g.h - 1, y1 + 1); ty++)
      for (let tx = x0; tx <= x1; tx++) this.paintOverlay(tx, ty);
  }

  private put(wx: number, wy: number, r: number, gg: number, b: number, a = 255): void {
    const ci = Math.floor(wx / (CHUNK_T * TILE));
    const ch = this.chunks[ci];
    if (!ch) return;
    const lx = wx - ci * CHUNK_T * TILE;
    if (wy < 0 || wy >= ch.data.height || lx < 0 || lx >= ch.data.width) return;
    const i = (wy * ch.data.width + lx) * 4;
    ch.data.data[i] = r;
    ch.data.data[i + 1] = gg;
    ch.data.data[i + 2] = b;
    ch.data.data[i + 3] = a;
    ch.dirty = true;
  }

  private paintTile(tx: number, ty: number): void {
    const g = this.grid;
    const t = g.get(tx, ty);
    const natural = isNatural(t);
    const backEarth = this.back[ty * g.w + tx] === 1;
    const ox = tx * TILE;
    const oy = ty * TILE;
    const fullySurrounded =
      natural && this.solidAny(tx - 1, ty) && this.solidAny(tx + 1, ty) && this.solidAny(tx, ty - 1) && this.solidAny(tx, ty + 1) &&
      this.solidAny(tx - 1, ty - 1) && this.solidAny(tx + 1, ty - 1) && this.solidAny(tx - 1, ty + 1) && this.solidAny(tx + 1, ty + 1);
    const pat = t === T.STONE ? this.pats.stone : t === T.BEDROCK ? this.pats.bedrock : this.pats.dirt;
    const upExposed = natural && !this.solidAny(tx, ty - 1) && ty > 0;
    const grassy = upExposed && t === T.DIRT && this.openSky(tx, ty);
    const dnExposed = natural && !this.solidAny(tx, ty + 1) && ty + 1 < g.h;

    for (let ly = 0; ly < TILE; ly++)
      for (let lx = 0; lx < TILE; lx++) {
        const wx = ox + lx;
        const wy = oy + ly;
        const pi = ((wy % PAT) * PAT + (wx % PAT)) * 3;
        let covered = natural && (fullySurrounded || this.inside(wx, wy));
        if (!covered) {
          // empty here: earth back wall or transparent; grass blades from below are drawn later
          if (backEarth && !isSolid(t)) {
            const p = this.pats.backEarth;
            const k = 0.85 + Math.min(1, this.depthAt(wx, wy) / 4) * -0.25;
            this.put(wx, wy, p[pi] * k, p[pi + 1] * k, p[pi + 2] * k);
          } else this.put(wx, wy, 0, 0, 0, 0);
          continue;
        }
        let r = pat[pi];
        let gg = pat[pi + 1];
        let b = pat[pi + 2];
        // smooth depth shading
        const dep = this.depthAt(wx, wy);
        const k = 1 - Math.min(1, Math.max(0, dep - 0.5) / 2.6) * 0.58;
        r *= k;
        gg *= k;
        b *= k;
        if (!fullySurrounded) {
          const edgeUp = !this.inside(wx, wy - 1);
          const edge = edgeUp || !this.inside(wx - 1, wy) || !this.inside(wx + 1, wy) || !this.inside(wx, wy + 1);
          if (edge) {
            [r, gg, b] = OUTLINE;
          } else if (!this.inside(wx, wy - 2)) {
            r = Math.min(255, r * 1.3);
            gg = Math.min(255, gg * 1.3);
            b = Math.min(255, b * 1.3);
          }
          // grass / snow cap
          if (grassy && !edge) {
            const capH = (this.snow ? 5 : 3) + (hash2(Math.floor(wx / 2) + 17, 3) % 3);
            if (ly < capH + 1) {
              const c = ly >= capH ? this.grassDark : hash2(wx, wy) % 7 === 0 ? this.grassLight : this.grassTop;
              [r, gg, b] = c;
            } else if (ly === capH + 1) {
              r *= 0.6;
              gg *= 0.6;
              b *= 0.6;
            }
          }
        }
        this.put(wx, wy, r, gg, b);
      }

  }

  private paintOverlay(tx: number, ty: number): void {
    const g = this.grid;
    const t = g.get(tx, ty);
    if (!isNatural(t)) return;
    const ox = tx * TILE;
    const oy = ty * TILE;
    const grassy = t === T.DIRT && !this.solidAny(tx, ty - 1) && ty > 0 && this.openSky(tx, ty);
    const dnExposed = !this.solidAny(tx, ty + 1) && ty + 1 < g.h;
    // grass blades poking up into the air above, roots hanging below
    if (grassy) {
      for (let lx = 0; lx < TILE; lx++) {
        const wx = ox + lx;
        const h = hash2(wx * 7 + 3, ty * 13);
        if (h % 3 !== 0) continue;
        const len = 1 + (h % 4);
        for (let k = 1; k <= len; k++) {
          const wy = oy - k + (this.inside(wx, oy) ? 0 : 1);
          if (this.inside(wx, wy)) continue;
          const c = k === len ? this.grassLight : this.grassTop;
          this.put(wx, wy, c[0], c[1], c[2]);
        }
      }
    }
    if (dnExposed && t === T.DIRT) {
      for (let i = 0; i < 3; i++) {
        const h = hash2(tx * 31 + i, ty * 17);
        if (h % 2) continue;
        const lx = h % 14 + 1;
        const len = 2 + (h % 6);
        for (let k = 0; k < len; k++) {
          const wy = oy + TILE - 1 + k;
          const wx = ox + lx + (k > 3 ? (h >> 3) % 2 : 0);
          if (this.inside(wx, wy)) continue;
          const c = this.rootCol;
          this.put(wx, wy, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8);
        }
      }
    }
  }
}
