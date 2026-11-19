import Phaser from 'phaser';
import { DT, NET_SNAPSHOT_EVERY, VIEW_W } from '../config';
import { music } from '../audio/Music';
import { playSfx, toggleMute } from '../audio/Sfx';
import { getInput } from '../input/InputManager';
import { getNet, setNet, type NetSession } from '../net/NetSession';
import type { LobbyPlayer, Msg, StartData } from '../net/protocol';
import { applySnapshot, makeSnapshot, type Snap } from '../net/snapshot';
import { loadSave, writeSave } from '../progress/save';
import { Hud } from '../render/Hud';
import { WorldRenderer } from '../render/WorldRenderer';
import type { GameEvent } from '../sim/types';
import { HERO_NAMES, World } from '../sim/World';
import { clearDom } from '../ui/dom';
import { generateLevel } from '../world/LevelGen';
import { randomSeed } from '../core/rng';

export type GameMode = 'local' | 'host' | 'guest';
export interface GameData extends StartData {
  mode: GameMode;
}

export class GameScene extends Phaser.Scene {
  private data0!: GameData;
  private world!: World;
  private view!: WorldRenderer;
  private hud!: Hud;
  private acc = 0;
  private steps = 0;
  private net: NetSession | null = null;
  private remoteInputs = new Map<number, number>();
  private localMap: { device: string; pid: number }[] = [];
  private evBuf: GameEvent[] = [];
  private tileBuf: number[] = [];
  private snaps: Snap[] = [];
  private ended = false;
  private escArm = 0;
  private keyLatch = new Set<string>();
  private paused = false;
  private pauseText!: Phaser.GameObjects.BitmapText;
  private sendAcc = 0;
  private lastSnapAt = 0;

  constructor() {
    super('Game');
  }

  init(data: GameData): void {
    this.data0 = data;
    this.acc = 0;
    this.steps = 0;
    this.ended = false;
    this.snaps = [];
    this.evBuf = [];
    this.tileBuf = [];
    this.remoteInputs.clear();
    this.paused = false;
    this.escArm = 0;
  }

  create(): void {
    clearDom();
    const d = this.data0;
    const level = generateLevel(d.level, d.seed, d.total);
    this.world = new World(level, d.players.map((p) => ({ pid: p.pid, hero: p.hero, name: HERO_NAMES[p.hero % 4] })), d.lives);
    this.view = new WorldRenderer(this, this.world);
    this.hud = new Hud(this);
    this.pauseText = this.add.bitmapText(VIEW_W / 2, 110, 'pix', 'PAUSED\n\nESC AGAIN: QUIT TO MENU\nP: RESUME', undefined, 1).setOrigin(0.5).setScrollFactor(0).setDepth(200).setScale(1).setVisible(false);

    this.net = d.mode === 'local' ? null : getNet();
    const me = d.mode === 'guest' ? this.net?.myId ?? '' : 'host';
    this.localMap = d.players.filter((p: LobbyPlayer) => p.owner === me).map((p) => ({ device: p.device, pid: p.pid }));

    if (this.net) {
      const net = this.net;
      if (d.mode === 'host') {
        net.onMessage = (from, m) => this.onHostMsg(from, m);
        net.onPeerLeave = (id) => {
          for (const lp of d.players) {
            if (lp.owner !== id) continue;
            const p = this.world.players.find((pp) => pp.pid === lp.pid);
            if (p) {
              p.connected = false;
              p.alive = false;
            }
          }
          this.world.text(this.world.cam.x + 150, this.world.cam.y + 60, 'A PLAYER LEFT', '#ff8080');
        };
      } else {
        net.onMessage = (_f, m) => this.onGuestMsg(m);
        net.onClosed = () => {
          this.hud.handle({ k: 'banner', s: 'CONNECTION LOST', sub: 'HOST LEFT THE GAME' });
          this.time.delayedCall(2500, () => this.scene.start('Menu'));
        };
      }
    }

    this.cameras.main.fadeIn(300);
    music.play(level.plan.isBoss ? 'boss' : 'level');
    this.hud.handle({
      k: 'banner',
      s: level.plan.isBoss ? `LEVEL ${d.level}: BOSS` : `LEVEL ${d.level}`,
      sub: `${this.world.biome.name}${level.plan.isBoss ? '  -  FIGHT TO THE END' : '  -  REACH THE FLAG'}`,
    });
    this.events.once('shutdown', () => music.stop());
  }

  // ---------------------------------------------------------------- network
  private onHostMsg(from: string, m: Msg): void {
    if (m.t === 'in') {
      for (const [pid, bits] of m.b) {
        const lp = this.data0.players.find((p) => p.pid === pid);
        if (lp && lp.owner === from) this.remoteInputs.set(pid, bits);
      }
    }
  }

  private onGuestMsg(m: Msg): void {
    if (m.t === 'snap') this.snaps.push(m.s);
    else if (m.t === 'start') this.scene.restart({ mode: 'guest', ...m.d });
    else if (m.t === 'gameover') this.scene.start('GameOver', { mode: 'guest', ...m.d, kills: this.world.kills, time: this.world.time });
    else if (m.t === 'menu') this.scene.start('Menu');
  }

  // ---------------------------------------------------------------- loop
  update(_time: number, delta: number): void {
    const dt = Math.min(0.1, delta / 1000);
    const inp = getInput();
    inp.poll();
    this.hotkeys();

    const mode = this.data0.mode;
    if (mode === 'guest') {
      this.sendAcc += dt;
      if (this.sendAcc >= 1 / 30) {
        this.sendAcc = 0;
        this.net?.send({ t: 'in', b: this.localMap.map((l) => [l.pid, inp.bits(l.device)] as [number, number]) });
      }
      while (this.snaps.length) {
        const s = this.snaps.shift()!;
        applySnapshot(this.world, s);
        this.lastSnapAt = this.time.now;
        for (const e of s.ev) this.handleEvent(e);
      }
      // extrapolate projectiles between snapshots
      for (const pr of this.world.projectiles) {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
      }
      for (const p of this.world.players) if (p.alive) p.animT += dt;
      const tl = this.world.grid.drainDirty();
      if (tl.length) this.view.applyTileChanges(tl);
      const lag = this.time.now - this.lastSnapAt;
      this.hud.setStatus(lag > 1500 ? 'WAITING FOR HOST...' : '');
    } else if (!this.paused) {
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        const inputs = new Map<number, number>(this.remoteInputs);
        for (const l of this.localMap) inputs.set(l.pid, inp.bits(l.device));
        this.world.step(DT, inputs);
        this.steps++;
        const evs = this.world.events;
        this.world.events = [];
        for (const e of evs) this.handleEvent(e);
        const tl = this.world.grid.drainDirty();
        if (tl.length) this.view.applyTileChanges(tl);
        if (mode === 'host') {
          this.evBuf.push(...evs.filter((e) => e.k !== 'text' || true));
          this.tileBuf.push(...tl);
          if (this.steps % NET_SNAPSHOT_EVERY === 0 && this.net) {
            this.net.send({ t: 'snap', s: makeSnapshot(this.world, this.evBuf, this.tileBuf) });
            this.evBuf = [];
            this.tileBuf = [];
          }
        }
      }
      this.checkEnd();
      if (mode === 'host') this.hud.setStatus(`ONLINE  KEY ${this.net?.key ?? ''}  PEERS ${this.net?.peerCount ?? 0}`);
    }

    this.view.update(dt, mode === 'guest');
    this.hud.update(this.world, dt);
  }

  private hotkeys(): void {
    const inp = getInput();
    const tap = (code: string) => {
      if (inp.keyDown(code)) {
        if (this.keyLatch.has(code)) return false;
        this.keyLatch.add(code);
        return true;
      }
      this.keyLatch.delete(code);
      return false;
    };
    if (tap('KeyM')) {
      if (music.toggle()) music.play(this.world.level.plan.isBoss ? 'boss' : 'level');
    }
    if (tap('KeyN')) toggleMute();
    if (tap('Escape')) {
      if (this.paused || this.escArm > this.time.now) {
        this.quit();
        return;
      }
      if (this.data0.mode === 'local') this.paused = true;
      this.escArm = this.time.now + 2500;
      this.pauseText.setText(this.data0.mode === 'local' ? 'PAUSED\n\nESC AGAIN: QUIT TO MENU\nP: RESUME' : 'ESC AGAIN TO LEAVE THE ONLINE GAME').setVisible(true);
    }
    if (tap('KeyP') && this.data0.mode === 'local') {
      this.paused = !this.paused;
      this.pauseText.setText('PAUSED\n\nESC: QUIT TO MENU\nP: RESUME').setVisible(this.paused);
    }
    if (!this.paused && this.escArm < this.time.now) this.pauseText.setVisible(false);
  }

  private quit(): void {
    if (this.net) {
      if (this.data0.mode === 'host') this.net.send({ t: 'menu' });
      setNet(null);
    }
    this.scene.start('Menu');
  }

  private handleEvent(e: GameEvent): void {
    this.view.handle(e);
    this.hud.handle(e);
    if (e.k === 'sfx') {
      const dx = e.x - (this.world.cam.x + VIEW_W / 2);
      if (Math.abs(dx) < 420) playSfx(e.n, dx / 220);
    }
  }

  private checkEnd(): void {
    if (this.ended) return;
    const w = this.world;
    const d = this.data0;
    if (w.status === 'complete' && w.statusT > 3) {
      this.ended = true;
      const save = loadSave();
      const total = d.total + w.time;
      const nextLevel = d.level + 1;
      writeSave({ level: nextLevel, best: Math.max(save.best, nextLevel), total });
      const next: StartData = { level: nextLevel, seed: randomSeed(), total, lives: w.lives + 1, players: d.players };
      if (d.mode === 'host') this.net?.send({ t: 'start', d: next });
      this.cameras.main.fadeOut(300);
      this.time.delayedCall(320, () => this.scene.restart({ mode: d.mode, ...next }));
    } else if (w.status === 'gameover' && w.statusT > 3.5) {
      this.ended = true;
      const retry: StartData = { level: d.level, seed: randomSeed(), total: d.total + w.time, lives: d.lives, players: d.players };
      writeSave({ ...loadSave(), total: retry.total });
      if (d.mode === 'host') this.net?.send({ t: 'gameover', d: retry });
      this.scene.start('GameOver', { mode: d.mode, ...retry, kills: w.kills, time: w.time });
    }
  }
}
