import { VIEW_W } from '../config';
import type { BossType, EnemyType } from '../progress/difficulty';
import { makeBody } from '../sim/physics';
import type { Boss, Debris, Enemy, GameEvent, Pickup, Player, Projectile, ProjType, Prop, SpecialId, WeaponId } from '../sim/types';
import type { World, Status } from '../sim/World';
import type { ItemId, PropType } from '../world/LevelGen';

// Host -> guest world state. Arrays + index tables keep JSON small.

const WEAPON_IDS: WeaponId[] = ['rifle', 'shotgun', 'flamer', 'rocket', 'minigun'];
const SPECIAL_IDS: SpecialId[] = ['grenade', 'c4'];
const ENEMY_IDS: EnemyType[] = ['grunt', 'shield', 'sniper', 'bomber', 'dog', 'drone', 'heavy'];
const ESTATES: Enemy['state'][] = ['patrol', 'alert', 'attack', 'aim'];
const PROJ_IDS: ProjType[] = ['bullet', 'pellet', 'flame', 'rocket', 'grenade', 'c4', 'thrown', 'ebullet', 'shell', 'bomb', 'mortar', 'missile', 'rock'];
const PROP_IDS: PropType[] = ['crate', 'barrel', 'cage', 'exit', 'mine', 'spikes', 'flamejet', 'saw', 'acid', 'crusher'];
const ITEM_IDS: ItemId[] = ['shotgun', 'flamer', 'rocket', 'minigun', 'grenade', 'c4', 'armor', 'speed', 'life', 'ammo', 'health'];
const BOSS_IDS: BossType[] = ['tank', 'gunship', 'drill'];
const STATUS: Status[] = ['playing', 'complete', 'gameover'];

const r1 = (v: number) => Math.round(v * 10) / 10;

export interface Snap {
  t: number;
  c: [number, number];
  l: number;
  st: number;
  stt: number;
  k: number;
  al: number;
  p: number[][];
  e: number[][];
  pr: number[][];
  pp: number[][];
  pk: number[][];
  d: number[][];
  b: (number | string)[] | null;
  bs: number[][];
  ev: GameEvent[];
  tl: number[];
  a: [number, number][]; // [pid, last input seq the host applied]
}

export function makeSnapshot(w: World, events: GameEvent[], tiles: number[], acks: Map<number, number> = new Map()): Snap {
  const cx = w.cam.x + VIEW_W / 2;
  const near = (x: number) => Math.abs(x - cx) < VIEW_W * 1.1;
  const b = w.boss;
  return {
    t: r1(w.time),
    c: [r1(w.cam.x), r1(w.cam.y)],
    l: w.lives,
    st: STATUS.indexOf(w.status),
    stt: r1(w.statusT),
    k: w.kills,
    al: w.arenaLocked ? 1 : 0,
    p: w.players.map((p) => [
      p.id, p.pid, p.hero, r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), p.facing,
      (p.alive ? 1 : 0) | (p.onGround ? 2 : 0) | (p.climbing ? 4 : 0) | (p.connected ? 8 : 0),
      p.hp, p.armor, r1(p.inv), WEAPON_IDS.indexOf(p.weapon), Number.isFinite(p.ammo) ? p.ammo : -1,
      SPECIAL_IDS.indexOf(p.special), p.specialCount, Number.isFinite(p.respawnT) ? r1(p.respawnT) : -1, r1(p.speedT),
    ]),
    e: w.enemies.filter((e) => near(e.x)).map((e) => [
      e.id, ENEMY_IDS.indexOf(e.type), r1(e.x), r1(e.y), r1(e.vx), e.facing, ESTATES.indexOf(e.state), e.hurtT > 0 ? 1 : 0, e.onGround ? 1 : 0, e.w, e.h,
    ]),
    pr: w.projectiles.filter((p) => near(p.x)).map((p) => [p.id, PROJ_IDS.indexOf(p.type), r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), r1(p.life)]),
    pp: w.props.filter((p) => near(p.x) || p.type === 'saw').map((p) => [p.id, PROP_IDS.indexOf(p.type), r1(p.x), r1(p.y), p.w, p.h, p.state, p.x0, p.x2, p.y0]),
    pk: w.pickups.filter((p) => near(p.x)).map((p) => [p.id, ITEM_IDS.indexOf(p.item), r1(p.x), r1(p.y), Number.isFinite(p.life) ? r1(p.life) : 99]),
    d: w.debris.map((d) => [d.id, d.t, r1(d.x), r1(d.y)]),
    b: b ? [b.id, BOSS_IDS.indexOf(b.type), b.name, r1(b.x), r1(b.y), b.w, b.h, r1(b.vx), r1(b.vy), b.hp, b.maxHp, b.phase, b.facing, b.hurtT > 0 ? 1 : 0, b.visible ? 1 : 0, r1(b.dying)] : null,
    bs: b ? b.segs.map((s) => [r1(s.x), r1(s.y)]) : [],
    ev: events,
    tl: tiles,
    a: [...acks],
  };
}

/** Rebuild the guest's world from a snapshot. Objects are reused by id so animations continue. */
export function applySnapshot(w: World, s: Snap): void {
  w.time = s.t;
  w.cam.x = s.c[0];
  w.cam.y = s.c[1];
  w.lives = s.l;
  w.status = STATUS[s.st] ?? 'playing';
  w.statusT = s.stt;
  w.kills = s.k;
  w.arenaLocked = s.al === 1;

  const oldP = new Map(w.players.map((p) => [p.id, p]));
  w.players = s.p.map((a) => {
    const p: Player = oldP.get(a[0]) ?? (w.makePlayer({ pid: a[1], hero: a[2], name: '' }, a[3], a[4]) as Player);
    const prevX = p.x;
    p.id = a[0]; p.pid = a[1]; p.hero = a[2]; p.x = a[3]; p.y = a[4]; p.vx = a[5]; p.vy = a[6]; p.facing = a[7];
    p.alive = (a[8] & 1) !== 0; p.onGround = (a[8] & 2) !== 0; p.climbing = (a[8] & 4) !== 0; p.connected = (a[8] & 8) !== 0;
    p.hp = a[9]; p.armor = a[10]; p.inv = a[11]; p.weapon = WEAPON_IDS[a[12]] ?? 'rifle'; p.ammo = a[13] < 0 ? Infinity : a[13];
    p.special = SPECIAL_IDS[a[14]] ?? 'grenade'; p.specialCount = a[15]; p.respawnT = a[16] < 0 ? Infinity : a[16]; p.speedT = a[17];
    if (Math.abs(p.x - prevX) > 0.01) p.animT += 0.05;
    return p;
  });
  for (const p of w.players) {
    const name = ['MAJOR MAYHEM', 'LT. BLAZE', 'CPL. CRATER', 'PVT. HAVOC'][p.hero % 4];
    p.name = name;
  }

  const oldE = new Map(w.enemies.map((e) => [e.id, e]));
  w.enemies = s.e.map((a) => {
    let e = oldE.get(a[0]);
    if (!e) {
      e = {
        ...makeBody(a[2], a[3], a[9], a[10]), id: a[0], type: ENEMY_IDS[a[1]], hp: 1, maxHp: 1, facing: a[5], state: 'patrol',
        t: 0, cd: 0, burst: 0, targetId: -1, hurtT: 0, baseY: a[3], animT: Math.random(), dead: false,
      } as Enemy;
    }
    e.x = a[2]; e.y = a[3]; e.vx = a[4]; e.facing = a[5]; e.state = ESTATES[a[6]] ?? 'patrol'; e.hurtT = a[7] ? 0.1 : 0; e.onGround = a[8] === 1;
    e.animT += 0.05;
    return e;
  });

  const oldPr = new Map(w.projectiles.map((p) => [p.id, p]));
  w.projectiles = s.pr.map((a) => {
    const p: Projectile = oldPr.get(a[0]) ?? { id: a[0], type: PROJ_IDS[a[1]], x: a[2], y: a[3], vx: a[4], vy: a[5], owner: 'n', ownerId: 0, dmg: 0, life: a[6], stuck: false, dead: false, hits: [] };
    p.x = a[2]; p.y = a[3]; p.vx = a[4]; p.vy = a[5]; p.life = a[6];
    return p;
  });

  w.props = s.pp.map((a) => {
    const p: Prop = { id: a[0], type: PROP_IDS[a[1]], x: a[2], y: a[3], w: a[4], h: a[5], hp: 1, state: a[6], t: 0, x0: a[7], x2: a[8], y0: a[9], dir: 1, dead: false };
    return p;
  });
  w.pickups = s.pk.map((a) => ({ id: a[0], item: ITEM_IDS[a[1]], x: a[2], y: a[3], w: 12, h: 12, vy: 0, life: a[4], dead: false }) as Pickup);
  w.debris = s.d.map((a) => ({ id: a[0], t: a[1], x: a[2], y: a[3], vy: 0, dead: false }) as Debris);

  if (s.b) {
    const a = s.b as number[];
    const old: Boss | null = w.boss && w.boss.id === a[0] ? w.boss : null;
    const b: Boss = old ?? ({
      id: a[0], type: BOSS_IDS[a[1]], name: String(s.b[2]), x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, hp: 0, maxHp: 1, phase: 1, state: '', t: 0,
      cd: 0, cd2: 0, cd3: 0, burst: 0, tx: 0, facing: 1, hurtT: 0, dying: 0, visible: true, segs: [], trail: [], dead: false, onGround: false, wallL: false, wallR: false,
    } as Boss);
    b.x = a[3]; b.y = a[4]; b.w = a[5]; b.h = a[6]; b.vx = a[7]; b.vy = a[8]; b.hp = a[9]; b.maxHp = a[10]; b.phase = a[11];
    b.facing = a[12]; b.hurtT = a[13] ? 0.08 : 0; b.visible = a[14] === 1; b.dying = a[15];
    b.segs = s.bs.map(([x, y]) => ({ x, y }));
    w.boss = b;
  } else w.boss = null;

  if (s.tl.length) w.grid.applyChanges(s.tl);
}
