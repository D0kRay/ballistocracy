import Phaser from 'phaser';
import { DT, NET_SNAPSHOT_EVERY, VIEW_H, VIEW_W } from '../config';
import { music, trackFor } from '../audio/Music';
import { playSfx, toggleMute } from '../audio/Sfx';
import { getInput } from '../input/InputManager';
import { GAME_LABELS } from '../input/TouchControls';
import { IN, withAim } from '../core/input';
import { getNet, setNet, type NetSession } from '../net/NetSession';
import type { LobbyPlayer, Msg, StartData } from '../net/protocol';
import { applySnapshot, makeSnapshot, type Snap } from '../net/snapshot';
import { loadSave, recordProgress, writeSave } from '../progress/save';
import { Hud } from '../render/Hud';
import { WorldRenderer } from '../render/WorldRenderer';
import type { GameEvent } from '../sim/types';
import { HERO_NAMES, World } from '../sim/World';
import { clearDom } from '../ui/dom';
import { generateLevel } from '../world/LevelGen';
import { MUTATORS } from '../progress/difficulty';
import { levelFromFile } from '../world/levelFormat';
import { communityLevels } from '../world/levelLibrary';
import { randomSeed } from '../core/rng';
import { clampToView } from '../camera/coopCamera';
import { predictPlayer } from '../sim/players';

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
  private seq = 0;
  private history: { seq: number; b: [number, number][] }[] = [];
  private acks = new Map<number, number>();
  private lastSnapAt = 0;
  private mouseDevice: string | null = null;
  /** true while key walking overrides the mouse aim */
  private aimParked = false;
  private mouseMovesSeen = 0;
  /** touch pause/leave menu (GRAB + BOOM together); the four buttons get menu labels */
  private touchMenu = false;
  private touchMenuAt = 0;
  /** after closing the menu, ignore touch input until every finger is up (no jump on RESUME) */
  private touchHold = false;
  private crosshair!: Phaser.GameObjects.Graphics;

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
    this.acks.clear();
    this.history = [];
    this.seq = 0;
    this.paused = false;
    this.escArm = 0;
    this.touchMenu = false;
  }

  create(): void {
    clearDom();
    const d = this.data0;
    // level 1 is the hand-built opener on every third run (picked from the shared seed so
    // online guests agree); otherwise it is procedural like everything after it
    const opener = !d.custom && d.level === 1 && d.seed % 3 === 0 ? communityLevels().find((l) => l.id === 'jungle-assault')?.file : undefined;
    const level = d.custom ? levelFromFile(d.custom) : opener ? levelFromFile(opener) : generateLevel(d.level, d.seed, d.total);
    if (opener) level.plan.level = 1;
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

    const inp = getInput();
    inp.touch?.setVisible(true);
    // the mouse aims and shoots for the local keyboard player (keys A first, else keys B)
    this.mouseDevice = this.localMap.some((l) => l.device === 'kbA') ? 'kbA' : this.localMap.some((l) => l.device === 'kbB') ? 'kbB' : null;
    inp.mouseEnabled = !!this.mouseDevice;
    this.crosshair = this.add.graphics().setScrollFactor(0).setDepth(210);
    const canvas = this.game.canvas;
    // phone call / app switch: pause a local game
    const onHide = () => {
      if (document.hidden && this.data0.mode === 'local' && !this.paused && !this.ended) {
        if (inp.touch) this.openTouchMenu();
        else {
          this.paused = true;
          this.pauseText.setText('PAUSED\n\nESC: QUIT TO MENU\nP: RESUME').setVisible(true);
        }
      }
    };
    document.addEventListener('visibilitychange', onHide);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', onHide));
    this.events.once('shutdown', () => {
      inp.touch?.setVisible(false);
      inp.mouseEnabled = false;
      inp.mouseActive = false;
      canvas.style.cursor = '';
    });
    this.cameras.main.fadeIn(300);
    music.play(trackFor(this.world.biome.id, level.plan.isBoss, d.level));
    this.hud.handle({
      k: 'banner',
      s: d.custom ? d.custom.name : level.plan.isBoss ? `LEVEL ${d.level}: BOSS` : `LEVEL ${d.level}`,
      sub: d.custom
        ? `BY ${d.custom.author || 'UNKNOWN'}  -  ${this.world.biome.name}`
        : level.plan.mutator
          ? `${this.world.biome.name}  -  ${MUTATORS[level.plan.mutator].name}: ${MUTATORS[level.plan.mutator].sub}`
          : `${this.world.biome.name}${level.plan.isBoss ? '  -  FIGHT TO THE END' : '  -  GET TO THE EXTRACTION'}`,
    });
    this.events.once('shutdown', () => music.stop());
  }

  // ---------------------------------------------------------------- network
  private onHostMsg(from: string, m: Msg): void {
    if (m.t === 'in') {
      for (const [pid, bits] of m.b) {
        const lp = this.data0.players.find((p) => p.pid === pid);
        if (lp && lp.owner === from) {
          this.remoteInputs.set(pid, bits);
          if (typeof m.s === 'number') this.acks.set(pid, m.s);
        }
      }
    }
  }

  private onGuestMsg(m: Msg): void {
    if (m.t === 'snap') this.snaps.push(m.s);
    else if (m.t === 'start') {
      // guests keep the campaign progress too, so they can continue or host from there later
      if (!m.d.custom && m.d.level > this.data0.level && m.d.level > loadSave().level) recordProgress(m.d.level, m.d.total);
      this.scene.restart({ mode: 'guest', ...m.d });
    }
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
      // 1) apply authoritative snapshots, then re-run our unacknowledged inputs on top
      let ack: Map<number, number> | null = null;
      while (this.snaps.length) {
        const s = this.snaps.shift()!;
        applySnapshot(this.world, s);
        ack = new Map(s.a ?? []);
        this.lastSnapAt = this.time.now;
        for (const e of s.ev) this.handleEvent(e);
      }
      if (ack) this.reconcile(ack);
      // 2) predict local players at the fixed rate and stream inputs to the host
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        this.seq++;
        const b = this.localMap.map((l) => [l.pid, this.devBits(l.device, l.pid)] as [number, number]);
        this.history.push({ seq: this.seq, b });
        if (this.history.length > 240) this.history.shift();
        this.net?.send({ t: 'in', s: this.seq, b });
        this.predict(b);
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
        for (const l of this.localMap) inputs.set(l.pid, this.devBits(l.device, l.pid));
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
            this.net.send({ t: 'snap', s: makeSnapshot(this.world, this.evBuf, this.tileBuf, this.acks) });
            this.evBuf = [];
            this.tileBuf = [];
          }
        }
      }
      this.checkEnd();
      if (mode === 'host') this.hud.setStatus(`ONLINE  KEY ${this.net?.key ?? ''}  PEERS ${this.net?.peerCount ?? 0}`);
    }

    this.drawCrosshair();
    this.view.update(dt, mode === 'guest', this.localPidSet);
    this.hud.update(this.world, dt);
  }

  /** device input plus mouse buttons and aim for the keyboard player */
  private devBits(device: string, pid: number): number {
    const inp = getInput();
    let b = inp.bits(device);
    if (device === 'touch' && this.touchHold && (b & 511) === 0) // 511 = all move/button bits, aim bits ignored this.touchHold = false;
    if (device === 'touch' && (this.touchMenu || this.touchHold)) return 0;
    if (device !== this.mouseDevice || !inp.mouseActive || this.paused) return b;
    const mb = inp.mouseBits();
    b |= mb;
    // walking with the keys turns the hero; the cursor takes over again once it moves or a mouse button is used
    if (inp.mouseMoves !== this.mouseMovesSeen || mb) this.aimParked = false;
    else if (b & (IN.LEFT | IN.RIGHT)) this.aimParked = true;
    this.mouseMovesSeen = inp.mouseMoves;
    const m = inp.mouseView(VIEW_W, VIEW_H);
    const p = this.world.players.find((pl) => pl.pid === pid);
    if (m && p && p.alive && !this.aimParked) {
      const px = p.x + p.w / 2 - this.world.cam.x;
      const py = p.y + 7 - this.world.cam.y;
      b = withAim(b, Math.atan2(m.y - py, m.x - px));
    }
    return b;
  }

  private drawCrosshair(): void {
    const inp = getInput();
    const g = this.crosshair;
    g.clear();
    const on = !!this.mouseDevice && inp.mouseActive && !this.paused;
    this.game.canvas.style.cursor = on ? 'none' : '';
    if (!on) return;
    const m = inp.mouseView(VIEW_W, VIEW_H);
    if (!m) return;
    const x = Math.round(m.x);
    const y = Math.round(m.y);
    const firing = (inp.mouseBits() & IN.FIRE) !== 0;
    for (const [c, w] of [[0x000000, 3], [firing ? 0xff5030 : 0xffe040, 1]] as const) {
      g.lineStyle(w, c, 1);
      g.lineBetween(x - 6, y, x - 2, y);
      g.lineBetween(x + 2, y, x + 6, y);
      g.lineBetween(x, y - 6, x, y - 2);
      g.lineBetween(x, y + 2, x, y + 6);
    }
    g.fillStyle(0xffffff, 1).fillRect(x, y, 1, 1);
  }

  private get localPidSet(): Set<number> {
    return new Set(this.data0.mode === 'guest' ? this.localMap.map((l) => l.pid) : []);
  }

  /** guest: advance own players immediately instead of waiting for the host */
  private predict(b: [number, number][]): void {
    for (const [pid, bits] of b) {
      const p = this.world.players.find((pl) => pl.pid === pid);
      if (!p || !p.alive) continue;
      p.prev = p.bits;
      p.bits = bits;
      predictPlayer(this.world, p, DT);
      clampToView(p, this.world.cam, VIEW_W);
    }
  }

  /** guest: snapshot reset our players to the host's (older) state; replay inputs the host has not seen yet */
  private reconcile(ack: Map<number, number>): void {
    for (const l of this.localMap) {
      const p = this.world.players.find((pl) => pl.pid === l.pid);
      if (!p || !p.alive) continue;
      const a = ack.get(l.pid) ?? 0;
      let prevBits = this.history.find((h) => h.seq === a)?.b.find(([pid]) => pid === l.pid)?.[1] ?? 0;
      for (const h of this.history) {
        if (h.seq <= a) continue;
        const bits = h.b.find(([pid]) => pid === l.pid)?.[1] ?? 0;
        p.prev = prevBits;
        p.bits = bits;
        predictPlayer(this.world, p, DT);
        clampToView(p, this.world.cam, VIEW_W);
        prevBits = bits;
      }
    }
    const minAck = Math.min(...this.localMap.map((l) => ack.get(l.pid) ?? 0));
    if (Number.isFinite(minAck)) this.history = this.history.filter((h) => h.seq >= minAck);
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
      if (music.toggle()) music.resume();
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
    // touch: GRAB + BOOM together opens the pause (local) or leave (online) menu
    if (inp.touch) {
      const tb = inp.bits('touch');
      const combo = (tb & IN.INTERACT) !== 0 && (tb & IN.SPECIAL) !== 0 && (inp.justPressed('touch', IN.INTERACT) || inp.justPressed('touch', IN.SPECIAL));
      if (!this.touchMenu && combo && !this.ended) this.openTouchMenu();
      else if (this.touchMenu && this.time.now - this.touchMenuAt > 250) {
        if (inp.justPressed('touch', IN.SPECIAL)) {
          this.quit();
          return;
        }
        if (inp.justPressed('touch', IN.JUMP)) this.closeTouchMenu();
      }
      // keyboard P on a touch device (tablet with keys) resumed underneath
      if (this.touchMenu && this.data0.mode === 'local' && !this.paused) this.closeTouchMenu();
    }
    if (!this.paused && !this.touchMenu && this.escArm < this.time.now) this.pauseText.setVisible(false);
  }

  private openTouchMenu(): void {
    this.touchMenu = true;
    this.touchMenuAt = this.time.now;
    const local = this.data0.mode === 'local';
    if (local) this.paused = true;
    this.pauseText.setText(local ? 'PAUSED' : 'LEAVE THE ONLINE GAME?').setVisible(true);
    getInput().touch?.setLabels({ jump: local ? 'RESUME' : 'STAY', fire: null, special: local ? 'QUIT' : 'LEAVE', interact: null });
  }

  private closeTouchMenu(): void {
    this.touchMenu = false;
    this.touchHold = true;
    this.paused = false;
    this.pauseText.setVisible(false);
    getInput().touch?.setLabels(GAME_LABELS);
  }

  private quit(): void {
    if (this.net) {
      if (this.data0.mode === 'host') this.net.send({ t: 'menu' });
      setNet(null);
    }
    const back = this.data0.returnTo;
    if (back) this.scene.start(back.scene, back.data as object);
    else this.scene.start(this.data0.custom ? 'Levels' : 'Menu');
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
    if (w.status === 'complete' && w.statusT > 3 && d.custom) {
      // hand-made level: back to where we came from
      this.ended = true;
      this.cameras.main.fadeOut(300);
      this.time.delayedCall(320, () => {
        if (d.returnTo) this.scene.start(d.returnTo.scene, d.returnTo.data as object);
        else {
          if (d.mode === 'host') this.net?.send({ t: 'menu' });
          if (d.mode !== 'local') setNet(null);
          this.scene.start(d.mode === 'guest' ? 'Menu' : 'Levels');
        }
      });
    } else if (w.status === 'complete' && w.statusT > 3) {
      this.ended = true;
      const total = d.total + w.time;
      const nextLevel = d.level + 1;
      recordProgress(nextLevel, total);
      this.handleEvent({ k: 'text', x: w.cam.x + VIEW_W / 2 - 34, y: w.cam.y + 100, s: 'PROGRESS SAVED', c: '#a0ffa0' });
      const next: StartData = { level: nextLevel, seed: randomSeed(), total, lives: w.lives + 1, players: d.players };
      if (d.mode === 'host') this.net?.send({ t: 'start', d: next });
      this.cameras.main.fadeOut(300);
      this.time.delayedCall(320, () => this.scene.restart({ mode: d.mode, ...next }));
    } else if (w.status === 'gameover' && w.statusT > 3.5) {
      this.ended = true;
      const retry: StartData = { level: d.level, seed: randomSeed(), total: d.total + w.time, lives: d.lives, players: d.players, custom: d.custom, returnTo: d.returnTo };
      if (!d.custom) writeSave({ ...loadSave(), total: retry.total });
      if (d.mode === 'host') this.net?.send({ t: 'gameover', d: retry });
      this.scene.start('GameOver', { mode: d.mode, ...retry, kills: w.kills, time: w.time });
    }
  }
}
