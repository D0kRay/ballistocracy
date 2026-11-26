import type { BossType, EnemyType } from '../progress/difficulty';
import type { ItemId, PropType } from '../world/LevelGen';
import type { Body } from './physics';

export type WeaponId = 'rifle' | 'shotgun' | 'flamer' | 'rocket' | 'minigun';
export type SpecialId = 'grenade' | 'c4';
export type ProjType =
  | 'bullet' | 'pellet' | 'flame' | 'rocket' | 'grenade' | 'c4' | 'thrown'
  | 'ebullet' | 'shell' | 'bomb' | 'mortar' | 'missile' | 'rock';
export type Owner = 'p' | 'e' | 'n';

export type SfxName =
  | 'shoot' | 'shotgun' | 'flame' | 'rocket' | 'minigun' | 'eshoot' | 'snipe'
  | 'boom' | 'bigboom' | 'jump' | 'pickup' | 'hurt' | 'die' | 'edie' | 'alert'
  | 'throw' | 'beep' | 'clink' | 'rescue' | 'boss' | 'clear' | 'door' | 'crush' | 'saw' | 'screech' | 'horn';

export type GameEvent =
  | { k: 'boom'; x: number; y: number; r: number }
  | { k: 'sfx'; n: SfxName; x: number }
  | { k: 'blood'; x: number; y: number; c: string; n: number }
  | { k: 'spark'; x: number; y: number }
  | { k: 'muzzle'; x: number; y: number; d: number; r?: number }
  | { k: 'debris'; x: number; y: number; t: number }
  | { k: 'text'; x: number; y: number; s: string; c: string }
  | { k: 'shake'; a: number }
  | { k: 'banner'; s: string; sub: string };

export interface Player extends Body {
  id: number;
  pid: number;
  hero: number;
  name: string;
  hp: number;
  armor: number;
  inv: number;
  alive: boolean;
  respawnT: number;
  weapon: WeaponId;
  ammo: number;
  special: SpecialId;
  specialCount: number;
  fireCd: number;
  facing: number;
  climbing: boolean;
  coyote: number;
  wallJumpT: number;
  speedT: number;
  firingT: number;
  /** weapon pitch relative to facing (radians, + = down); 0 without mouse aim */
  aim: number;
  animT: number;
  bits: number;
  prev: number;
  connected: boolean;
  base: WeaponId; // signature weapon (unlimited ammo)
  inVehicle: boolean; // riding the intro helicopter or boarded the extraction vehicle
  car: number; // id of the ILTI wagon this player drives, -1 when on foot
}

/** drivable station wagon (cheat code) */
export interface Car extends Body {
  id: number;
  hp: number;
  facing: number;
  driver: number; // player id, -1 = empty
  fireCd: number;
  firingT: number;
  burnT: number; // > 0 while the wheels spin (burnout)
  hurtT: number;
  enterCd: number;
  aim: number; // gun pitch, + = down
  dead: boolean;
}

export interface Enemy extends Body {
  id: number;
  type: EnemyType;
  hp: number;
  maxHp: number;
  facing: number;
  state: 'patrol' | 'alert' | 'attack' | 'aim';
  t: number;
  cd: number;
  burst: number;
  targetId: number;
  hurtT: number;
  baseY: number;
  animT: number;
  dead: boolean;
}

export interface Projectile {
  id: number;
  type: ProjType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: Owner;
  ownerId: number;
  dmg: number;
  life: number;
  stuck: boolean;
  dead: boolean;
  hits: number[]; // ids already hit (piercing flames)
  item?: ItemId;
  /** where the projectile was before its last move: hits are tested along the whole path */
  ox?: number;
  oy?: number;
}

export interface Prop {
  id: number;
  type: PropType;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  state: number; // generic: 0 idle, 1 active ...
  t: number;
  x0: number;
  x2: number;
  y0: number;
  dir: number;
  item?: ItemId;
  variant?: string; // exit vehicle kind
  dead: boolean;
}

export interface Pickup {
  id: number;
  item: ItemId;
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  life: number;
  dead: boolean;
}

export interface Debris {
  id: number;
  t: number;
  x: number;
  y: number;
  vy: number;
  dead: boolean;
}

export interface Boss {
  id: number;
  type: BossType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  phase: number;
  state: string;
  t: number;
  cd: number;
  cd2: number;
  cd3: number;
  burst: number;
  tx: number;
  facing: number;
  hurtT: number;
  dying: number;
  visible: boolean;
  segs: { x: number; y: number }[];
  trail: { x: number; y: number }[];
  dead: boolean;
  onGround: boolean;
  wallL: boolean;
  wallR: boolean;
}
