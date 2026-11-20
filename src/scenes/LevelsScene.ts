import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { IN } from '../core/input';
import { playSfx } from '../audio/Sfx';
import { getInput } from '../input/InputManager';
import { communityLevels, deleteMyLevel, myLevels, type LevelEntry } from '../world/levelLibrary';
import { biomeById } from '../world/biomes';

// Browse community levels (from the repo) and your own saved levels.

export class LevelsScene extends Phaser.Scene {
  private entries: LevelEntry[] = [];
  private sel = 0;
  private rows: Phaser.GameObjects.BitmapText[] = [];
  private info!: Phaser.GameObjects.BitmapText;
  private t = 0;
  private latch = new Set<string>();

  constructor() {
    super('Levels');
  }

  create(): void {
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x140c10).setOrigin(0);
    this.add.bitmapText(VIEW_W / 2, 12, 'pix', 'COMMUNITY LEVELS').setOrigin(0.5).setScale(3).setTint(0xffd040);
    this.entries = [...communityLevels(), ...myLevels()];
    this.sel = Math.min(this.sel, Math.max(0, this.entries.length - 1));
    this.rows = [];
    for (let i = 0; i < 12; i++) this.rows.push(this.add.bitmapText(24, 34 + i * 13, 'pix', '').setScale(1));
    this.info = this.add.bitmapText(VIEW_W / 2, VIEW_H - 34, 'pix', '', undefined, 1).setOrigin(0.5, 0).setTint(0xa0a0a0);
    if (!this.entries.length) this.add.bitmapText(VIEW_W / 2, 100, 'pix', 'NO LEVELS YET - OPEN THE LEVEL EDITOR', undefined, 1).setOrigin(0.5);
    getInput().touch?.setVisible(true, { jump: 'PLAY', fire: 'HOST', special: 'BACK', interact: null }, 'dpad');
    this.events.once('shutdown', () => getInput().touch?.setVisible(false));
    this.draw();
  }

  private tap(code: string): boolean {
    const inp = getInput();
    if (inp.keyDown(code)) {
      if (this.latch.has(code)) return false;
      this.latch.add(code);
      return true;
    }
    this.latch.delete(code);
    return false;
  }

  update(_t: number, delta: number): void {
    this.t += delta / 1000;
    const inp = getInput();
    inp.poll();
    const n = this.entries.length;
    if (this.tap('Escape') || inp.justPressed('touch', IN.SPECIAL)) {
      this.scene.start('Menu');
      return;
    }
    if (n) {
      if (inp.anyPressed(IN.DOWN)) this.sel = (this.sel + 1) % n;
      if (inp.anyPressed(IN.UP)) this.sel = (this.sel + n - 1) % n;
      const e = this.entries[this.sel];
      if (inp.anyPressed(IN.JUMP) || inp.anyPressed(IN.START) || this.tap('Enter')) {
        playSfx('pickup');
        this.scene.start('Lobby', { mode: 'local', level: 1, custom: e.file });
        return;
      }
      if (this.tap('KeyH') || inp.justPressed('touch', IN.FIRE)) {
        this.scene.start('Lobby', { mode: 'host', level: 1, custom: e.file });
        return;
      }
      if (this.tap('KeyE')) {
        this.scene.start('Editor', { file: e.file, id: e.source === 'mine' ? e.id : undefined });
        return;
      }
      if (this.tap('Delete') && e.source === 'mine') {
        deleteMyLevel(e.id);
        this.scene.restart();
        return;
      }
    }
    this.draw();
  }

  private draw(): void {
    const start = Math.max(0, Math.min(this.sel - 5, this.entries.length - this.rows.length));
    this.rows.forEach((r, i) => {
      const e = this.entries[start + i];
      if (!e) {
        r.setText('');
        return;
      }
      const on = start + i === this.sel;
      const tag = e.source === 'mine' ? 'MINE' : 'REPO';
      const kind = e.file.boss ? 'BOSS' : e.file.exit?.vehicle.toUpperCase() ?? '';
      r.setText(`${on ? '>' : ' '} ${e.file.name.padEnd(26).slice(0, 26)} ${(e.file.author || '?').toUpperCase().padEnd(14).slice(0, 14)} ${biomeById(e.file.biome).name.padEnd(12)} ${kind.padEnd(8)} ${tag}`);
      r.setTint(on ? (Math.floor(this.t * 6) % 2 ? 0xffe040 : 0xffffff) : e.source === 'mine' ? 0x90d0ff : 0xb0b0b0);
    });
    const e = this.entries[this.sel];
    this.info.setText(
      `${e?.file.description ? e.file.description.toUpperCase().slice(0, 70) + '\n' : ''}${getInput().touch ? 'CROSS: CHOOSE   PLAY: LOCAL   HOST: ONLINE   BACK: MENU' : 'ENTER PLAY LOCAL   H HOST ONLINE   E OPEN IN EDITOR   DEL DELETE (MINE)   ESC BACK'}`,
    );
  }
}
