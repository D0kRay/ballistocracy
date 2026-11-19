import type { Snap } from './snapshot';

export interface LobbyPlayer {
  pid: number;
  hero: number;
  owner: string; // 'host' or the guest's peer id
  device: string;
}

export interface StartData {
  level: number;
  seed: number;
  total: number;
  lives: number;
  players: LobbyPlayer[];
}

export type Msg =
  | { t: 'hello' }
  | { t: 'locals'; devices: string[] }
  | { t: 'in'; b: [number, number][] }
  | { t: 'lobby'; players: LobbyPlayer[]; level: number; you: string }
  | { t: 'start'; d: StartData }
  | { t: 'snap'; s: Snap }
  | { t: 'gameover'; d: StartData }
  | { t: 'menu' };
