import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { HERO_COLORS } from '../gfx/SpriteForge';
import type { GameEvent } from '../sim/types';
import { SPECIALS, WEAPONS } from '../sim/weapons';
import type { World } from '../sim/World';

const col = (h: string) => Phaser.Display.Color.HexStringToColor(h).color;

export class Hud {
  private scene: Phaser.Scene;
  private g: Phaser.GameObjects.Graphics;
  private panels: Phaser.GameObjects.BitmapText[] = [];
  private portraits: Phaser.GameObjects.Image[] = [];
  private right: Phaser.GameObjects.BitmapText;
  private bossName: Phaser.GameObjects.BitmapText;
  private banner: Phaser.GameObjects.BitmapText;
  private sub: Phaser.GameObjects.BitmapText;
  private bannerT = 0;
  private status: Phaser.GameObjects.BitmapText;
  private heart: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(100);
    for (let i = 0; i < 4; i++) {
      this.panels.push(scene.add.bitmapText(0, 0, 'pix', '').setScrollFactor(0).setDepth(101));
      // head close-up cropped from the hero's idle frame
      this.portraits.push(scene.add.image(0, 0, `hero${i}`, 0).setOrigin(0).setScale(2).setCrop(7, 0, 11, 10).setScrollFactor(0).setDepth(101));
    }
    this.right = scene.add.bitmapText(VIEW_W - 4, 3, 'pix', '').setOrigin(1, 0).setScrollFactor(0).setDepth(101);
    this.heart = scene.add.image(0, 3, 'heart').setOrigin(0, 0).setScrollFactor(0).setDepth(101);
    this.bossName = scene.add.bitmapText(VIEW_W / 2, VIEW_H - 18, 'pix', '').setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
    this.banner = scene.add.bitmapText(VIEW_W / 2, 70, 'pix', '').setOrigin(0.5).setScale(3).setScrollFactor(0).setDepth(102);
    this.sub = scene.add.bitmapText(VIEW_W / 2, 92, 'pix', '').setOrigin(0.5).setScrollFactor(0).setDepth(102);
    this.status = scene.add.bitmapText(4, VIEW_H - 9, 'pix', '').setScrollFactor(0).setDepth(101).setTint(0xa0a0a0);
  }

  handle(e: GameEvent): void {
    if (e.k === 'banner') {
      this.banner.setText(e.s);
      this.sub.setText(e.sub);
      this.bannerT = 3;
    }
  }

  setStatus(s: string): void {
    this.status.setText(s);
  }

  update(w: World, dt: number): void {
    const g = this.g;
    g.clear();

    // player panels
    const pw = 112;
    w.players.forEach((p, i) => {
      const x = 3 + i * (pw + 2);
      const y = 3;
      const c = HERO_COLORS[p.hero % 4];
      g.fillStyle(0x120c10, 0.8);
      g.fillRect(x, y, pw, 24);
      g.lineStyle(1, col(c.band), 1);
      g.strokeRect(x + 0.5, y + 0.5, pw - 1, 23);
      g.fillStyle(col(c.band), 0.35);
      g.fillRect(x + 2, y + 2, 22, 20);
      const portrait = this.portraits[i];
      portrait.setTexture(`hero${p.hero % 4}`, 0).setCrop(7, 0, 11, 10).setPosition(x + 2 - 14, y + 2).setVisible(true);
      portrait.setTint(p.alive ? 0xffffff : 0x505050);
      const tx = x + 26;
      for (let h = 0; h < 3; h++) {
        g.fillStyle(h < p.hp ? 0xe02030 : 0x402020, 1);
        g.fillRect(tx + h * 6, y + 9, 5, 4);
      }
      for (let a = 0; a < p.armor; a++) {
        g.fillStyle(0x4080f0, 1);
        g.fillRect(tx + 20 + a * 4, y + 9, 3, 4);
      }
      const wd = WEAPONS[p.weapon];
      const ammo = Number.isFinite(p.ammo) ? ` ${p.ammo}` : '';
      const spec = `${SPECIALS[p.special].name} x${p.specialCount}`;
      const name = p.name.split(' ').pop() ?? p.name;
      let line1 = `P${p.pid + 1} ${name}`;
      if (!p.connected) line1 += ' (LEFT)';
      else if (!p.alive) line1 += p.respawnT === Infinity ? ' DOWN' : ` ${Math.ceil(p.respawnT)}`;
      this.panels[i].setText(`${line1}\n\n${wd.name}${ammo}  ${spec}`).setPosition(tx, y + 3);
      this.panels[i].setVisible(true);
    });
    for (let i = w.players.length; i < 4; i++) {
      this.panels[i].setVisible(false);
      this.portraits[i].setVisible(false);
    }

    // right: lives, level
    const lvl = w.level.plan;
    const mins = Math.floor(w.time / 60);
    const secs = Math.floor(w.time % 60).toString().padStart(2, '0');
    this.right.setText(`x${w.lives}\nLV ${lvl.level} ${w.biome.name}\n${mins}:${secs}`);
    this.heart.setPosition(VIEW_W - 4 - this.right.width - 9, 3);
    g.fillStyle(0x000000, 0.45);
    g.fillRect(VIEW_W - this.right.width - 16, 1, this.right.width + 14, 25);

    // progress to the exit (normal levels)
    if (!lvl.isBoss) {
      const alive = w.alivePlayers();
      const front = alive.length ? Math.max(...alive.map((p) => p.x)) : w.cam.x;
      const prog = Math.max(0, Math.min(1, front / (w.levelW - 96)));
      const bx = VIEW_W / 2 - 40;
      g.fillStyle(0x000000, 0.5);
      g.fillRect(bx - 1, VIEW_H - 7, 82, 5);
      g.fillStyle(0x30d050, 1);
      g.fillRect(bx, VIEW_H - 6, Math.round(80 * prog), 3);
    }

    // boss bar
    const b = w.boss;
    if (b) {
      const bw = 200;
      const bx = VIEW_W / 2 - bw / 2;
      const by = VIEW_H - 10;
      g.fillStyle(0x000000, 0.7);
      g.fillRect(bx - 2, by - 2, bw + 4, 9);
      g.fillStyle(0x501010, 1);
      g.fillRect(bx, by, bw, 5);
      g.fillStyle(b.phase === 2 ? 0xff3020 : 0xe0a020, 1);
      g.fillRect(bx, by, Math.round((bw * b.hp) / b.maxHp), 5);
      this.bossName.setText(b.name).setVisible(true);
    } else this.bossName.setVisible(false);

    // banner
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      const a = Math.min(1, this.bannerT * 2);
      this.banner.setAlpha(a).setVisible(true);
      this.sub.setAlpha(a).setVisible(true);
      const flash = Math.floor(this.bannerT * 8) % 2 === 0;
      this.banner.setTint(flash ? 0xffe040 : 0xffffff);
    } else {
      this.banner.setVisible(w.status !== 'playing');
      this.sub.setVisible(w.status !== 'playing');
    }
  }
}
