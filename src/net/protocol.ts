import type { Snap } from './snapshot';
import type { LevelFile } from '../world/levelFormat';

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
  custom?: LevelFile; // hand-made level (sent to guests in full)
  returnTo?: { scene: string; data: unknown }; // local only: e.g. back to the editor after a playtest
}

export type Msg =
  | { t: 'hello' }
  | { t: 'locals'; devices: string[] }
  | { t: 'in'; s: number; b: [number, number][] } // s = input sequence for prediction acks
  | { t: 'lobby'; players: LobbyPlayer[]; level: number; you: string; customName?: string }
  | { t: 'start'; d: StartData }
  | { t: 'snap'; s: Snap }
  | { t: 'gameover'; d: StartData }
  | { t: 'menu' };
