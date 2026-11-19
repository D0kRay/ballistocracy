import Phaser from 'phaser';
import { createPixelFont } from '../gfx/font';
import { makeAll } from '../gfx/SpriteForge';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create(): void {
    createPixelFont(this);
    makeAll(this);
    this.scene.start('Menu');
  }
}
