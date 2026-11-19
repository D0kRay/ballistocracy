import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './config';
import { unlockAudio } from './audio/Sfx';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#0a0608',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { gamepad: false, keyboard: false },
  fps: { target: 60 },
  scene: [BootScene, MenuScene, LobbyScene, GameScene, GameOverScene],
});

const unlock = () => unlockAudio();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

(window as unknown as { __game: Phaser.Game }).__game = game;
if (import.meta.env.DEV) void import('./devtools').then((m) => m.installDevtools(game));
