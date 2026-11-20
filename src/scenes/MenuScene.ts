import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { IN } from '../core/input';
import { music } from '../audio/Music';
import { playSfx, toggleMute } from '../audio/Sfx';
import { PARALLAX_H, makeParallax } from '../gfx/parallax';
import { CONTROLS_HELP, getInput } from '../input/InputManager';
import { setNet } from '../net/NetSession';
import { loadSave, resetSave } from '../progress/save';
import { clearDom } from '../ui/dom';
import { BIOMES } from '../world/biomes';

interface Item {
  label: string;
  action: () => void;
}

export class MenuScene extends Phaser.Scene {
  private items: Item[] = [];
  private texts: Phaser.GameObjects.BitmapText[] = [];
  private sel = 0;
  private bgs: Phaser.GameObjects.TileSprite[] = [];
  private help!: Phaser.GameObjects.BitmapText;
  private showHelp = false;
  private t = 0;
  private heroes: Phaser.GameObjects.Sprite[] = [];

  constructor() {
    super('Menu');
  }

  create(): void {
    clearDom();
    setNet(null);
    this.sel = 0;
    this.texts = [];
    this.heroes = [];
    const biome = BIOMES[Math.floor(Math.random() * BIOMES.length)];
    this.bgs = makeParallax(this, biome).map((k, i) => this.add.tileSprite(0, 0, VIEW_W, VIEW_H, k).setOrigin(0).setDepth(i).setTileScale(VIEW_H / PARALLAX_H, VIEW_H / PARALLAX_H));
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.35).setOrigin(0).setDepth(5);

    const title = this.add.bitmapText(VIEW_W / 2, 30, 'pix', 'BALLISTOCRACY').setOrigin(0.5).setScale(4).setDepth(10).setTint(0xffd040);
    this.add.bitmapText(VIEW_W / 2 + 2, 32, 'pix', 'BALLISTOCRACY').setOrigin(0.5).setScale(4).setDepth(9).setTint(0x801010);
    this.tweens.add({ targets: title, y: 28, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    this.add.bitmapText(VIEW_W / 2, 52, 'pix', 'CO-OP RUN AND GUN  -  1-4 PLAYERS').setOrigin(0.5).setDepth(10).setTint(0xffffff);

    for (let i = 0; i < 4; i++) {
      const s = this.add.sprite(VIEW_W / 2 - 66 + i * 44, VIEW_H - 22, `hero${i}`, 0).setScale(2).setDepth(10).setOrigin(0.5, 1);
      this.heroes.push(s);
    }

    const save = loadSave();
    this.items = [
      { label: save.level > 1 ? `CONTINUE  LEVEL ${save.level}` : 'START MISSION', action: () => this.go('local', save.level) },
      { label: 'NEW CAMPAIGN', action: () => this.go('local', resetSave().level) },
      { label: 'HOST ONLINE GAME', action: () => this.go('host', save.level) },
      { label: 'JOIN ONLINE GAME', action: () => this.go('guest', 1) },
      { label: 'COMMUNITY LEVELS', action: () => this.scene.start('Levels') },
      { label: 'LEVEL EDITOR', action: () => this.scene.start('Editor', {}) },
      { label: 'CONTROLS', action: () => this.toggleHelp() },
    ];
    this.items.forEach((it, i) => {
      const t = this.add.bitmapText(VIEW_W / 2, 76 + i * 14, 'pix', it.label).setOrigin(0.5).setScale(2).setDepth(10);
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', () => (this.sel = i));
      t.on('pointerdown', () => it.action());
      this.texts.push(t);
    });
    this.help = this.add.bitmapText(VIEW_W / 2, 168, 'pix', CONTROLS_HELP.join('\n'), undefined, 1).setOrigin(0.5, 0).setDepth(11).setVisible(false);
    this.add.bitmapText(4, VIEW_H - 8, 'pix', `BEST LEVEL ${save.best}   M MUSIC  N MUTE`).setDepth(10).setTint(0x909090);
    this.add.bitmapText(VIEW_W - 4, VIEW_H - 8, 'pix', 'V0.1').setOrigin(1, 0).setDepth(10).setTint(0x909090);
    music.play('menu');
  }

  private toggleHelp(): void {
    this.showHelp = !this.showHelp;
    this.help.setVisible(this.showHelp);
    this.heroes.forEach((h) => h.setVisible(!this.showHelp));
  }

  private go(mode: 'local' | 'host' | 'guest', level: number): void {
    playSfx('pickup');
    this.scene.start('Lobby', { mode, level });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.bgs.forEach((b, i) => (b.tilePositionX += [2, 5, 12, 30][i] * dt));
    this.heroes.forEach((h, i) => h.setFrame(2 + (Math.floor(this.t * 12 + i) % 6)));

    const inp = getInput();
    inp.poll();
    if (inp.anyPressed(IN.DOWN)) {
      this.sel = (this.sel + 1) % this.items.length;
      playSfx('clink');
    }
    if (inp.anyPressed(IN.UP)) {
      this.sel = (this.sel + this.items.length - 1) % this.items.length;
      playSfx('clink');
    }
    if (inp.anyPressed(IN.JUMP) || inp.anyPressed(IN.START) || inp.anyPressed(IN.FIRE)) {
      this.items[this.sel].action();
      return;
    }
    if (inp.keyDown('KeyM')) {
      if (!this.mHeld) music.toggle() && music.play('menu');
      this.mHeld = true;
    } else this.mHeld = false;
    if (inp.keyDown('KeyN')) {
      if (!this.nHeld) toggleMute();
      this.nHeld = true;
    } else this.nHeld = false;

    this.texts.forEach((t, i) => {
      const on = i === this.sel;
      t.setTint(on ? (Math.floor(this.t * 6) % 2 ? 0xffe040 : 0xffffff) : 0x9090a0);
      t.setText((on ? '> ' : '') + this.items[i].label + (on ? ' <' : ''));
    });
  }
  private mHeld = false;
  private nHeld = false;
}
