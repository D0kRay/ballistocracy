// Draws the 32x32 pixel-art logo (a round bomb with a "B" and a burning fuse) and writes
// public/favicon.svg, public/favicon-32.png, public/apple-touch-icon.png (180) and
// public/icon-512.png (home-screen icons sit on the game's dark background). Vite copies /public into the build, so GitHub Pages serves them.
// Run: npx vite-node tools/make-favicon.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 32;
type Px = string | null; // '#rrggbb' or transparent
const img: Px[][] = Array.from({ length: N }, () => Array<Px>(N).fill(null));
const set = (x: number, y: number, c: string) => {
  if (x >= 0 && y >= 0 && x < N && y < N) img[y][x] = c;
};

const OUT = '#120c10';
const BODY = '#2c2c40';
const DARK = '#1a1a28';
const SHINE = '#7a7aa0';
const CAP = '#8a8e94';
const CAP_D = '#55585e';
const FUSE = '#b08850';
const YEL = '#ffe040';
const ORA = '#ff8a20';
const RED = '#e02020';
const WHITE = '#ffffff';

// ---- bomb body: shaded disc
const cx = 14.5;
const cy = 19.5;
const R = 11;
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const d = Math.hypot(dx, dy);
    if (d <= R) set(x, y, dx + dy > 6 ? DARK : BODY);
  }
// shine
for (const [x, y] of [[8, 13], [9, 12], [10, 12], [8, 14], [7, 15], [7, 16], [11, 11]]) set(x, y, SHINE);
set(9, 13, WHITE);

// ---- cap on top right
for (let y = 6; y <= 9; y++) for (let x = 19; x <= 23; x++) set(x, y, y === 6 ? CAP : x === 23 ? CAP_D : CAP);
set(19, 6, '#c8ccd2');
set(20, 6, '#c8ccd2');

// ---- fuse: a short curve up and to the right
for (const [x, y] of [[22, 5], [23, 4], [24, 4], [25, 3]]) set(x, y, FUSE);

// ---- spark at the end of the fuse
const sx = 27;
const sy = 2;
for (const [dx, dy, c] of [
  [0, 0, WHITE], [1, 0, YEL], [-1, 0, YEL], [0, 1, YEL], [0, -1, YEL],
  [2, 0, ORA], [-2, 0, ORA], [0, 2, ORA], [0, -2, ORA],
  [1, 1, ORA], [-1, -1, ORA], [1, -1, YEL], [-1, 1, YEL],
  [2, 2, RED], [-2, -2, RED], [2, -2, RED], [3, 0, RED], [0, 3, RED],
] as const) set(sx + dx, sy + dy, c);

// ---- the "B": yellow with a red drop shadow
const B = ['######.', '##...##', '##...##', '######.', '##...##', '##...##', '##...##', '######.'];
const bx = 11;
const by = 15;
const under = B.map((row, y) => [...row].map((_, x) => img[by + y][bx + x]));
B.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && set(bx + x + 1, by + y + 1, RED)));
// keep the holes of the letter clear of the shadow
B.forEach((row, y) => [...row].forEach((ch, x) => ch === '.' && row.indexOf('#') < x && row.lastIndexOf('#') > x && set(bx + x, by + y, under[y][x] ?? BODY)));
B.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && set(bx + x, by + y, YEL)));

// ---- 1px dark outline around everything, so it reads on light and dark tabs
const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && img[y][x] !== null;
const edge: [number, number][] = [];
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push([x, y]);
for (const [x, y] of edge) set(x, y, OUT);

// ------------------------------------------------------------------ SVG (runs of equal pixels)
let rects = '';
for (let y = 0; y < N; y++) {
  let x = 0;
  while (x < N) {
    const c = img[y][x];
    let w = 1;
    while (x + w < N && img[y][x + w] === c) w++;
    if (c) rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`;
    x += w;
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">${rects}</svg>\n`;

// ------------------------------------------------------------------ PNG (nearest-neighbour scale)
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
/** scale the 32x32 image to size (nearest neighbour), with padding and an optional background */
function png(size: number, pad = 0, bg?: string): Buffer {
  const inner = size - pad * 2;
  const row = size * 4 + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const ix = x - pad;
      const iy = y - pad;
      const c = (ix >= 0 && iy >= 0 && ix < inner && iy < inner ? img[Math.floor((iy / inner) * N)][Math.floor((ix / inner) * N)] : null) ?? bg;
      if (!c) continue;
      const o = y * row + 1 + x * 4;
      raw[o] = parseInt(c.slice(1, 3), 16);
      raw[o + 1] = parseInt(c.slice(3, 5), 16);
      raw[o + 2] = parseInt(c.slice(5, 7), 16);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/favicon.svg', svg);
writeFileSync('public/favicon-32.png', png(32));
writeFileSync('public/apple-touch-icon.png', png(180, 18, '#0a0608'));
writeFileSync('public/icon-512.png', png(512, 32, '#0a0608'));
console.log('wrote public/favicon.svg, favicon-32.png, apple-touch-icon.png, icon-512.png');
