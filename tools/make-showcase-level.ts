// Builds levels/jungle-assault.json: a hand-designed, dense level in the spirit of classic
// co-op run'n'guns: outposts with interiors, tunnels under the ground, cliffs, a cave
// network, a stilt village, a temple, a trench line and a truck extraction.
// Run: npx vite-node tools/make-showcase-level.ts
import { writeFileSync } from 'node:fs';
import { LEVEL_H_TILES } from '../src/config';
import { validateLevel, type LevelEntity, type LevelFile } from '../src/world/levelFormat';

const W = 168;
const H = LEVEL_H_TILES;
const tiles: string[][] = Array.from({ length: H }, () => Array(W).fill('.'));
const back: string[][] = Array.from({ length: H }, () => Array(W).fill('.'));
const ents: LevelEntity[] = [];

const set = (x: number, y: number, ch: string) => { if (x >= 0 && x < W && y >= 0 && y < H) tiles[y][x] = ch; };
const setB = (x: number, y: number, ch: string) => { if (x >= 0 && x < W && y >= 0 && y < H) back[y][x] = ch; };
const rect = (x0: number, y0: number, x1: number, y1: number, ch: string) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch); };
const backRect = (x0: number, y0: number, x1: number, y1: number, ch: string) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setB(x, y, ch); };
/** natural ground columns: dirt from row s down, bedrock floor, earth wall behind */
const ground = (x0: number, x1: number, s: number) => {
  for (let x = x0; x <= x1; x++) {
    for (let y = s; y < H - 1; y++) set(x, y, 'd');
    set(x, H - 1, 'x');
    for (let y = s + 1; y < H; y++) setB(x, y, 'd');
  }
};
/** carve a tunnel (keeps the earth wall behind it) */
const dig = (x0: number, y0: number, x1: number, y1: number) => { rect(x0, y0, x1, y1, '.'); backRect(x0, y0, x1, y1, 'd'); };
const ladder = (x: number, y0: number, y1: number) => rect(x, y0, x, y1, 'l');
const enemy = (type: LevelEntity & { kind: 'enemy' } extends { type: infer T } ? T : never, x: number, y: number) => ents.push({ kind: 'enemy', type, x, y });
const prop = (type: 'crate' | 'barrel' | 'cage' | 'mine' | 'spikes' | 'flamejet' | 'saw' | 'acid' | 'crusher', x: number, y: number, extra: Partial<LevelEntity & { kind: 'prop' }> = {}) =>
  ents.push({ kind: 'prop', type, x, y, ...extra } as LevelEntity);
const scene = (type: string, x: number, y: number, extra: { flip?: boolean; h?: number } = {}) => ents.push({ kind: 'scenery', type, x, y, ...extra });
const pickup = (item: 'shotgun' | 'flamer' | 'rocket' | 'minigun' | 'grenade' | 'c4' | 'armor' | 'speed' | 'life' | 'ammo' | 'health', x: number, y: number) => ents.push({ kind: 'pickup', item, x, y });
/** stone-block bunker with walls, roof, optional middle floor and windows */
const bunker = (x0: number, x1: number, floorY: number, roofY: number, mid: number | null) => {
  rect(x0, roofY, x1, roofY, 'b');
  rect(x0, roofY, x0, floorY - 1, 'b');
  rect(x1, roofY, x1, floorY - 1, 'b');
  rect(x0, floorY - 2, x0, floorY - 1, '.');
  rect(x1, floorY - 2, x1, floorY - 1, '.');
  backRect(x0, roofY, x1, floorY - 1, 's');
  for (let x = x0 + 2; x < x1 - 1; x += 3) setB(x, roofY + 2, 'W');
  if (mid !== null) rect(x0 + 1, mid, x1 - 3, mid, 'b');
};
/** hut on stilts: platform floor, wooden roof row, wood wall behind, ladder */
const hut = (x: number, groundY: number) => {
  const fy = groundY - 3;
  const ry = fy - 4;
  rect(x, fy, x + 4, fy, 'p');
  rect(x, ry, x + 4, ry, 'w');
  backRect(x, ry + 1, x + 4, fy - 1, 'w');
  ladder(x - 1, fy, groundY - 1);
  scene('post', x, groundY);
  scene('post', x + 4, groundY);
  scene('roof_thatch', x + 2, ry + 1);
  return fy;
};

// ---------------------------------------------------------------- 0-22 landing zone
ground(0, 14, 13);
ground(15, 17, 14);
ground(18, 22, 15);
scene('palm', 2, 13);
scene('jungletree', 11, 13);
scene('fern', 6, 13);
prop('crate', 8, 13, { item: 'rocket' });
pickup('grenade', 12, 13);
scene('palm', 20, 15, { flip: true });

// ---------------------------------------------------------------- 23-40 outpost + tunnel
ground(23, 40, 15);
bunker(26, 37, 15, 9, 12);
ladder(35, 9, 14);
rect(27, 8, 28, 8, 'g');
rect(35, 8, 36, 8, 'g');
enemy('grunt', 29, 15);
enemy('grunt', 33, 12);
enemy('shield', 31, 15);
enemy('sniper', 31, 9);
scene('enemyflag', 33, 9);
prop('barrel', 38, 15);
prop('barrel', 39, 15);
prop('crate', 24, 15, { item: 'shotgun' });
// tunnel under the outpost
dig(24, 17, 44, 18);
ladder(24, 15, 16);
ladder(44, 15, 16);
prop('cage', 34, 19);
prop('barrel', 30, 19);
enemy('grunt', 38, 19);
pickup('c4', 27, 19);

// ---------------------------------------------------------------- 41-48 rope bridge over a pit
ground(41, 42, 15);
rect(43, 15, 47, 15, 'p');
set(45, 15, 'c');
scene('rope', 42, 15);
scene('rope', 48, 15);
ground(48, 49, 15);
dig(44, 17, 44, 18); // tunnel exit sits under the bridge start
ladder(44, 15, 16);
rect(43, 16, 47, 19, '.');
for (let x = 43; x <= 47; x++) for (let y = 16; y < H; y++) setB(x, y, '.');

// ---------------------------------------------------------------- 50-68 cliff, plateau, cave network
ground(50, 51, 15);
ground(52, 68, 9);
rect(52, 9, 53, 14, 's'); // rock cliff face
ladder(51, 9, 14);
// cave inside the hill, entrance from the left at ground level
dig(52, 13, 66, 14);
rect(52, 13, 53, 14, '.');
dig(60, 10, 60, 12);
ladder(60, 9, 12);
dig(63, 15, 67, 16);
ladder(63, 13, 14);
prop('barrel', 56, 15);
prop('barrel', 57, 15);
enemy('grunt', 58, 15);
enemy('bomber', 62, 15);
prop('cage', 66, 17);
prop('crate', 64, 17, { item: 'minigun' });
// stone pockets
rect(55, 16, 58, 18, 's');
rect(64, 10, 66, 11, 's');
// plateau: watchtower + palms
scene('palm', 55, 9);
rect(57, 4, 61, 4, 'p');
set(57, 3, 'g');
set(61, 3, 'g');
ladder(59, 4, 8);
scene('post', 57, 9, { h: 5 });
scene('post', 61, 9, { h: 5 });
scene('roof_thatch', 59, 3);
enemy('sniper', 58, 4);
enemy('grunt', 64, 9);
enemy('dog', 66, 9);
scene('enemyflag', 67, 9);

// ---------------------------------------------------------------- 69-80 descent, acid pool
ground(69, 70, 11);
ground(71, 72, 15);
dig(67, 13, 70, 14); // cave exits on the far side of the hill
ground(73, 78, 15);
for (let x = 74; x <= 77; x++) prop('acid', x, 15);
for (let x = 74; x <= 77; x++) set(x, 14, '.');
rect(74, 12, 75, 12, 'c');
rect(77, 12, 77, 12, 'p');
ground(79, 80, 14);
scene('fern', 70, 11);

// ---------------------------------------------------------------- 81-100 stilt village
ground(81, 100, 14);
const f1 = hut(83, 14);
const f2 = hut(90, 14);
enemy('grunt', 85, f1);
enemy('grunt', 92, f2);
enemy('bomber', 93, f2);
prop('crate', 84, f1, { item: 'flamer' });
enemy('dog', 88, 14);
enemy('dog', 96, 14);
scene('totem', 88, 14);
scene('totem', 98, 14);
scene('enemyflag', 97, 14);
prop('barrel', 95, 14);
prop('cage', 99, 14);
scene('jungletree', 81, 14, { flip: true });

// ---------------------------------------------------------------- 101-114 temple
ground(101, 114, 14);
for (let k = 0; k < 4; k++) rect(102 + k * 2, 12 - k * 2, 113 - k * 2, 13 - k * 2, 'b');
dig(105, 10, 110, 13);
backRect(105, 10, 110, 13, 's');
rect(102, 12, 105, 13, '.');
rect(110, 12, 113, 13, '.');
backRect(102, 12, 113, 13, 's');
scene('statue', 107, 8);
scene('enemyflag', 105, 8);
enemy('heavy', 107, 14);
enemy('grunt', 104, 14);
enemy('grunt', 109, 8);
prop('cage', 109, 14);
pickup('armor', 106, 14);

// ---------------------------------------------------------------- 115-126 trench line + minefield
ground(115, 126, 14);
for (const x of [117, 118, 122, 123]) { rect(x, 14, x, 14, '.'); rect(x, 15, x, 15, 'd'); }
set(116, 13, 'g');
set(119, 13, 'g');
set(121, 13, 'g');
set(124, 13, 'g');
enemy('grunt', 117, 15);
enemy('grunt', 122, 15);
enemy('shield', 125, 14);
prop('mine', 120, 14);
prop('mine', 126, 14);
prop('spikes', 118, 15);

// ---------------------------------------------------------------- 127-140 rock arch with vines
ground(127, 140, 14);
rect(129, 7, 138, 10, 's');
rect(129, 11, 129, 13, 's'); // pillars anchor the arch (blow them up to drop it)
rect(138, 11, 138, 13, 's');
rect(131, 6, 136, 6, 'd');
backRect(129, 11, 138, 13, 'd');
enemy('grunt', 132, 6);
enemy('sniper', 135, 6);
enemy('grunt', 134, 14);
prop('barrel', 130, 14);
prop('barrel', 131, 14);
prop('barrel', 137, 14);
prop('flamejet', 133, 14);
scene('fern', 128, 14);

// ---------------------------------------------------------------- 141-167 last outpost + truck
ground(141, 148, 12);
ground(149, 167, 14);
bunker(142, 148, 12, 6, null);
ladder(147, 6, 11);
enemy('heavy', 145, 12);
enemy('grunt', 144, 6);
scene('enemyflag', 146, 6);
prop('crate', 143, 12, { item: 'health' });
scene('palm', 152, 14);
scene('jungletree', 163, 14);
prop('barrel', 150, 14);
enemy('drone', 152, 9);
enemy('drone', 158, 8);

const level: LevelFile = {
  format: 'ballistocracy-level',
  version: 1,
  name: 'JUNGLE ASSAULT',
  author: 'Ballistocracy team',
  description: 'Hand-built opener: outposts, tunnels, a cave network, a stilt village and a temple.',
  biome: 'jungle',
  tod: 'day',
  width: W,
  height: H,
  tiles: tiles.map((r) => r.join('')),
  back: back.map((r) => r.join('')),
  spawn: { x: 4, y: 13 },
  exit: { x: 156, y: 14, vehicle: 'truck' },
  boss: null,
  entities: ents,
};
const v = validateLevel(level);
if (!v.ok) throw new Error(v.errors.join('\n'));
writeFileSync('levels/jungle-assault.json', JSON.stringify(level, null, 1) + '\n');
console.log('wrote levels/jungle-assault.json', v.warnings);
