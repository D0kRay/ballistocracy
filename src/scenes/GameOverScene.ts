import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { IN } from '../core/input';
import { getInput } from '../input/InputManager';
import { getNet, setNet } from '../net/NetSession';
import type { Msg, StartData } from '../net/protocol';
import type { GameMode } from './GameScene';

interface Data extends StartData {
  mode: GameMode;
  kills: number;
  time: number;
}

export class GameOverScene extends Phaser.Scene {
  private d!: Data;
  private t = 0;
  constructor() {
    super('GameOver');
  }
  init(d: Data): void {
    this.d = d;
    this.t = 0;
  }
  create(): void {
    getInput().touch?.setVisible(true, this.d.mode !== 'guest');
    this.events.once('shutdown', () => getInput().touch?.setVisible(false));
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x100406).setOrigin(0);
    this.add.bitmapText(VIEW_W / 2, 50, 'pix', 'GAME OVER').setOrigin(0.5).setScale(5).setTint(0xe02020);
    const m = Math.floor(this.d.time / 60);
    const s = Math.floor(this.d.time % 60).toString().padStart(2, '0');
    this.add.bitmapText(VIEW_W / 2, 95, 'pix', `LEVEL ${this.d.level}\nKILLS ${this.d.kills}\nTIME ${m}:${s}`, undefined, 1).setOrigin(0.5, 0).setScale(2);
    const hint = this.d.mode === 'guest' ? 'WAITING FOR HOST...   ESC MENU' : 'ENTER / START: RETRY LEVEL   ESC: MENU';
    this.add.bitmapText(VIEW_W / 2, 170, 'pix', hint).setOrigin(0.5).setTint(0xffe040);
    const net = getNet();
    if (net && this.d.mode === 'guest') {
      net.onMessage = (_f, msg: Msg) => {
        if (msg.t === 'start') this.scene.start('Game', { mode: 'guest', ...msg.d });
        else if (msg.t === 'menu') this.scene.start('Menu');
      };
    }
  }
  update(_t: number, delta: number): void {
    this.t += delta / 1000;
    const inp = getInput();
    inp.poll();
    if (inp.keyDown('Escape')) {
      if (this.d.mode === 'host') getNet()?.send({ t: 'menu' });
      setNet(null);
      if (this.d.returnTo) this.scene.start(this.d.returnTo.scene, this.d.returnTo.data as object);
      else this.scene.start(this.d.custom ? 'Levels' : 'Menu');
      return;
    }
    if (this.t > 1 && this.d.mode !== 'guest' && (inp.anyPressed(IN.START) || inp.anyPressed(IN.JUMP) || inp.keyDown('Enter'))) {
      const d: StartData = { level: this.d.level, seed: this.d.seed, total: this.d.total, lives: this.d.lives, players: this.d.players, custom: this.d.custom, returnTo: this.d.returnTo };
      if (this.d.mode === 'host') getNet()?.send({ t: 'start', d });
      this.scene.start('Game', { mode: this.d.mode, ...d });
    }
  }
}
