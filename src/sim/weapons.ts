import type { ItemId } from '../world/LevelGen';
import type { ProjType, SfxName, SpecialId, WeaponId } from './types';

export interface WeaponDef {
  name: string;
  rate: number; // seconds between shots
  ammo: number; // Infinity = unlimited
  spread: number;
  pellets: number;
  speed: number;
  dmg: number;
  proj: ProjType;
  life: number;
  sfx: SfxName;
  kick: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: { name: 'RIFLE', rate: 0.13, ammo: Infinity, spread: 0.04, pellets: 1, speed: 430, dmg: 1, proj: 'bullet', life: 0.6, sfx: 'shoot', kick: 0 },
  shotgun: { name: 'SHOTGUN', rate: 0.5, ammo: 28, spread: 0.28, pellets: 6, speed: 380, dmg: 1, proj: 'pellet', life: 0.28, sfx: 'shotgun', kick: 60 },
  flamer: { name: 'FLAMER', rate: 0.035, ammo: 260, spread: 0.22, pellets: 1, speed: 170, dmg: 0.45, proj: 'flame', life: 0.42, sfx: 'flame', kick: 0 },
  rocket: { name: 'ROCKETS', rate: 0.75, ammo: 10, spread: 0, pellets: 1, speed: 250, dmg: 4, proj: 'rocket', life: 2.2, sfx: 'rocket', kick: 40 },
  minigun: { name: 'MINIGUN', rate: 0.05, ammo: 320, spread: 0.09, pellets: 1, speed: 460, dmg: 1, proj: 'bullet', life: 0.55, sfx: 'minigun', kick: 8 },
};

/** every hero has a signature weapon with unlimited ammo and a default special */
export const HERO_LOADOUT: { weapon: WeaponId; special: SpecialId; count: number }[] = [
  { weapon: 'rifle', special: 'grenade', count: 3 }, // MAYHEM: all-rounder
  { weapon: 'flamer', special: 'grenade', count: 3 }, // BLAZE: close-range burner
  { weapon: 'shotgun', special: 'c4', count: 2 }, // CRATER: breacher
  { weapon: 'rocket', special: 'grenade', count: 2 }, // HAVOC: demolition
];

export const SPECIALS: Record<SpecialId, { name: string; count: number }> = {
  grenade: { name: 'GRENADE', count: 3 },
  c4: { name: 'C4', count: 2 },
};

export const ITEM_NAMES: Record<ItemId, string> = {
  shotgun: 'SHOTGUN', flamer: 'FLAMER', rocket: 'ROCKETS', minigun: 'MINIGUN',
  grenade: 'GRENADES', c4: 'C4', armor: 'ARMOR', speed: 'SPEED', life: '+1 LIFE', ammo: 'AMMO', health: 'HEALTH',
};

export function isWeaponItem(i: ItemId): i is WeaponId & ItemId {
  return i === 'shotgun' || i === 'flamer' || i === 'rocket' || i === 'minigun';
}
export function isSpecialItem(i: ItemId): i is SpecialId & ItemId {
  return i === 'grenade' || i === 'c4';
}
