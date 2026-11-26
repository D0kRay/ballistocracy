import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { IN } from '../core/input';
import { playSfx } from '../audio/Sfx';
import { getInput } from '../input/InputManager';
import { ACTIONS, MAX_KEYS_PER_ACTION, bindKey, clearKey, keyLabel, keyMap, resetKeys, type KbId } from '../input/keybinds';

// Key rebinding: pick a keyboard player, then a key slot, then press the new key.
// Navigation uses fixed keys (arrows, WASD, Enter, Esc) plus mouse and gamepads, so a
// broken binding can never lock anyone out of this screen.

const ROW0 = 52;
const ROW_H = 15;
const COL_LABEL = 40;
const COL_KEY = [214, 324];

type Row = { kind: 'player' } | { kind: 'action'; bit: number; label: string } | { kind: 'reset' } | { kind: 'back' };

export class ControlsScene extends Phaser.Scene {
  private player: KbId = 'kbA';
  private sel = 0;
  private slot = 0;
  private rows: Row[] = [];
  private texts: Phaser.GameObjects.BitmapText[][] = [];
  private status!: Phaser.GameObjects.BitmapText;
  private cursor!: Phaser.GameObjects.Rectangle;
  private waiting = false;
  private note = '';
  private noteT = 0;
  private t = 0;
  private latch = new Set<string>();

  constructor() {
    super('Controls');
  }

  create(): void {
    this.sel = 1;
    this.slot = 0;
    this.waiting = false;
    this.note = '';
    this.texts = [];
    this.latch = new Set(['Enter', 'Space', 'Escape']); // the key that opened this screen
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x140c10).setOrigin(0);
    this.add.bitmapText(VIEW_W / 2, 14, 'pix', 'CONTROLS').setOrigin(0.5).setScale(3).setTint(0xffd040);
    this.add.bitmapText(COL_KEY[0], ROW0 - 14, 'pix', 'KEY 1').setOrigin(0.5, 0).setTint(0x808090);
    this.add.bitmapText(COL_KEY[1], ROW0 - 14, 'pix', 'KEY 2').setOrigin(0.5, 0).setTint(0x808090);
    this.cursor = this.add.rectangle(0, 0, 90, 11, 0xffd040, 0.18).setOrigin(0.5, 0.5);

    this.rows = [{ kind: 'player' }, ...ACTIONS.map((a) => ({ kind: 'action' as const, bit: a.bit, label: a.label })), { kind: 'reset' }, { kind: 'back' }];
    this.rows.forEach((row, i) => {
      const y = this.rowY(i);
      const label = this.add.bitmapText(COL_LABEL, y, 'pix', '').setOrigin(0, 0.5).setScale(1);
      const k1 = this.add.bitmapText(COL_KEY[0], y, 'pix', '').setOrigin(0.5);
      const k2 = this.add.bitmapText(COL_KEY[1], y, 'pix', '').setOrigin(0.5);
      label.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.click(i, -1));
      k1.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.click(i, 0));
      k2.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.click(i, 1));
      label.on('pointerover', () => !this.waiting && (this.sel = i));
      this.texts.push([label, k1, k2]);
    });
    // wide hit zones for the key cells (the text itself can be tiny, like "E")
    this.rows.forEach((row, i) => {
      if (row.kind !== 'action') return;
      for (let s = 0; s < MAX_KEYS_PER_ACTION; s++) {
        const z = this.add.zone(COL_KEY[s], this.rowY(i), 96, ROW_H - 2).setInteractive({ useHandCursor: true });
        z.on('pointerdown', () => this.click(i, s));
        z.on('pointerover', () => {
          if (this.waiting) return;
          this.sel = i;
          this.slot = s;
        });
      }
    });
    this.status = this.add.bitmapText(VIEW_W / 2, VIEW_H - 30, 'pix', '', undefined, 1).setOrigin(0.5, 0);
    this.add
      .bitmapText(VIEW_W / 2, VIEW_H - 12, 'pix', 'GAMEPAD AND MOUSE BUTTONS ARE FIXED.  ESC P M N ARE RESERVED.', undefined, 1)
      .setOrigin(0.5, 0)
      .setTint(0x707080);
    getInput().touch?.setVisible(false);
    this.events.once('shutdown', () => getInput().captureNextKey(null));
    this.draw();
  }

  private rowY(i: number): number {
    // a little gap before RESET / BACK
    return ROW0 + i * ROW_H + (i > ACTIONS.length ? 6 : 0);
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

  private padPressed(bit: number): boolean {
    const inp = getInput();
    for (let i = 0; i < 4; i++) if (inp.justPressed(`pad${i}`, bit)) return true;
    return false;
  }

  private click(i: number, slot: number): void {
    if (this.waiting) {
      this.cancelCapture();
      return;
    }
    this.sel = i;
    if (slot >= 0) this.slot = slot;
    this.activate();
  }

  private switchPlayer(): void {
    this.player = this.player === 'kbA' ? 'kbB' : 'kbA';
    playSfx('clink');
  }

  private activate(): void {
    const row = this.rows[this.sel];
    if (row.kind === 'player') this.switchPlayer();
    else if (row.kind === 'reset') {
      resetKeys(this.player);
      this.flash(`KEYBOARD ${this.player === 'kbA' ? 'A' : 'B'} RESET TO DEFAULTS`);
      playSfx('pickup');
    } else if (row.kind === 'back') {
      playSfx('clink');
      this.scene.start('Menu');
    } else this.startCapture(row.bit);
  }

  private startCapture(bit: number): void {
    // second slot only makes sense once the first one is used
    const list = keyMap(this.player)[bit];
    if (this.slot > list.length) this.slot = list.length;
    this.waiting = true;
    playSfx('clink');
    getInput().captureNextKey((code) => {
      this.waiting = false;
      this.latch.add(code); // don't let the same press also move the cursor
      if (code === 'Escape') {
        this.flash('CANCELLED');
        return;
      }
      if (code === 'Backspace' || code === 'Delete') {
        clearKey(this.player, bit, this.slot);
        this.flash('KEY CLEARED');
        return;
      }
      const r = bindKey(this.player, bit, this.slot, code);
      if (r.ok) playSfx('pickup');
      this.flash(r.ok ? r.note || `${keyLabel(code)} SET` : r.note);
    });
  }

  private cancelCapture(): void {
    getInput().captureNextKey(null);
    this.waiting = false;
    this.flash('CANCELLED');
  }

  private flash(s: string): void {
    this.note = s;
    this.noteT = 2.5;
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.noteT -= dt;
    const inp = getInput();
    inp.poll();
    if (!this.waiting) {
      const n = this.rows.length;
      const up = this.tap('ArrowUp') || this.tap('KeyW') || this.padPressed(IN.UP);
      const down = this.tap('ArrowDown') || this.tap('KeyS') || this.padPressed(IN.DOWN);
      const left = this.tap('ArrowLeft') || this.tap('KeyA') || this.padPressed(IN.LEFT);
      const right = this.tap('ArrowRight') || this.tap('KeyD') || this.padPressed(IN.RIGHT);
      if (up) {
        this.sel = (this.sel + n - 1) % n;
        playSfx('clink');
      }
      if (down) {
        this.sel = (this.sel + 1) % n;
        playSfx('clink');
      }
      const row = this.rows[this.sel];
      if (left || right) {
        if (row.kind === 'player') this.switchPlayer();
        else if (row.kind === 'action') this.slot = (this.slot + 1) % MAX_KEYS_PER_ACTION;
      }
      if (this.tap('Escape') || this.padPressed(IN.SPECIAL)) {
        this.scene.start('Menu');
        return;
      }
      if (row.kind === 'action' && (this.tap('Backspace') || this.tap('Delete'))) {
        clearKey(this.player, row.bit, this.slot);
        this.flash('KEY CLEARED');
      }
      if (this.tap('Enter') || this.tap('Space') || this.tap('NumpadEnter') || this.padPressed(IN.JUMP)) this.activate();
    }
    this.draw();
  }

  private draw(): void {
    const blink = Math.floor(this.t * 6) % 2 === 0;
    const map = keyMap(this.player);
    this.rows.forEach((row, i) => {
      const [label, k1, k2] = this.texts[i];
      const on = i === this.sel;
      const tint = on ? (blink ? 0xffe040 : 0xffffff) : 0xa0a0b0;
      if (row.kind === 'player') {
        label.setText(`PLAYER:  < KEYBOARD ${this.player === 'kbA' ? 'A' : 'B'} >`).setTint(tint).setScale(1);
        k1.setText('');
        k2.setText('');
      } else if (row.kind === 'reset') {
        label.setText('RESET THIS PLAYER TO DEFAULTS').setTint(tint);
        k1.setText('');
        k2.setText('');
      } else if (row.kind === 'back') {
        label.setText('BACK TO MENU').setTint(tint);
        k1.setText('');
        k2.setText('');
      } else {
        label.setText(row.label).setTint(on ? 0xffffff : 0xa0a0b0);
        const keys = map[row.bit] ?? [];
        [k1, k2].forEach((t, s) => {
          const active = on && s === this.slot;
          if (active && this.waiting) t.setText(blink ? 'PRESS A KEY' : '').setTint(0xff6040);
          else t.setText(keys[s] ? keyLabel(keys[s]) : '---').setTint(active ? (blink ? 0xffe040 : 0xffffff) : keys[s] ? 0xe0e0e0 : 0x505060);
        });
      }
    });
    const row = this.rows[this.sel];
    if (row.kind === 'action') this.cursor.setPosition(COL_KEY[this.slot], this.rowY(this.sel)).setSize(96, ROW_H - 3).setVisible(true);
    else this.cursor.setPosition(COL_LABEL + 85, this.rowY(this.sel)).setSize(180, ROW_H - 3).setVisible(true);
    let s: string;
    if (this.waiting) s = 'PRESS THE NEW KEY.  ESC CANCELS.  BACKSPACE CLEARS THE SLOT.';
    else if (this.noteT > 0) s = this.note;
    else if (row.kind === 'action') s = 'ENTER / CLICK: CHANGE KEY   LEFT/RIGHT: KEY 1 OR 2   DEL: CLEAR   ESC: BACK';
    else if (row.kind === 'player') s = 'LEFT/RIGHT OR ENTER: SWITCH BETWEEN KEYBOARD A AND B';
    else s = 'ENTER / CLICK TO CHOOSE   ESC: BACK';
    this.status.setText(s).setTint(this.waiting ? 0xff8060 : this.noteT > 0 ? 0x80ff80 : 0xa0a0a0);
  }
}
