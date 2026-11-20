import Phaser from 'phaser';
import { START_LIVES, VIEW_H, VIEW_W } from '../config';
import { IN } from '../core/input';
import { randomSeed } from '../core/rng';
import { playSfx } from '../audio/Sfx';
import { HERO_COLORS } from '../gfx/SpriteForge';
import { deviceLabel, getInput, type DeviceId } from '../input/InputManager';
import { NetSession, getNet, setNet } from '../net/NetSession';
import type { LobbyPlayer, Msg, StartData } from '../net/protocol';
import { loadSave } from '../progress/save';
import { HERO_NAMES } from '../sim/World';
import { clearDom, showHostKey, showJoinBox } from '../ui/dom';
import type { LevelFile } from '../world/levelFormat';

type Mode = 'local' | 'host' | 'guest';

export class LobbyScene extends Phaser.Scene {
  private mode: Mode = 'local';
  private level = 1;
  private custom: LevelFile | undefined;
  private customName = '';
  private players: LobbyPlayer[] = [];
  private myDevices: DeviceId[] = []; // guest: devices joined locally
  private myId = 'host';
  private info!: Phaser.GameObjects.BitmapText;
  private slots: { box: Phaser.GameObjects.Graphics; spr: Phaser.GameObjects.Sprite; txt: Phaser.GameObjects.BitmapText }[] = [];
  private status = '';
  private t = 0;
  private connected = false;

  constructor() {
    super('Lobby');
  }

  init(data: { mode: Mode; level: number; custom?: LevelFile }): void {
    this.custom = data.custom;
    this.customName = data.custom?.name ?? '';
    this.mode = data.mode;
    this.level = data.level;
    this.players = [];
    this.myDevices = [];
    this.myId = 'host';
    this.status = '';
    this.connected = data.mode !== 'guest';
    this.slots = [];
  }

  create(): void {
    clearDom();
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x140c10).setOrigin(0);
    for (let i = 0; i < 40; i++) this.add.rectangle(Math.random() * VIEW_W, Math.random() * VIEW_H, 1, 1, 0x605060).setOrigin(0);
    const title = { local: 'LOCAL CO-OP', host: 'HOST ONLINE GAME', guest: 'JOIN ONLINE GAME' }[this.mode];
    this.add.bitmapText(VIEW_W / 2, 12, 'pix', title).setOrigin(0.5).setScale(3).setTint(0xffd040);
    this.info = this.add.bitmapText(VIEW_W / 2, 30, 'pix', '', undefined, 1).setOrigin(0.5, 0);

    for (let i = 0; i < 4; i++) {
      const x = (VIEW_W - 352) / 2 + 8 + i * 88;
      const box = this.add.graphics();
      const spr = this.add.sprite(x + 36, 100, 'hero0', 0).setScale(2).setOrigin(0.5, 1).setVisible(false);
      const txt = this.add.bitmapText(x + 36, 106, 'pix', '', undefined, 1).setOrigin(0.5, 0);
      this.slots.push({ box, spr, txt });
    }
    this.add.bitmapText(VIEW_W / 2, VIEW_H - 22, 'pix', 'PRESS JUMP OR FIRE ON ANY KEYBOARD/GAMEPAD TO JOIN\nGRENADE BUTTON TO LEAVE   ESC BACK', undefined, 1).setOrigin(0.5, 0).setTint(0xa0a0a0);

    if (this.mode === 'host') this.startHost();
    else if (this.mode === 'guest') this.showJoin();
    this.events.once('shutdown', () => clearDom());
  }

  // ---------------------------------------------------------------- networking
  private async startHost(): Promise<void> {
    this.status = 'CONNECTING TO MATCHMAKER...';
    try {
      const net = await NetSession.host();
      if (!this.scene.isActive()) return net.close();
      setNet(net);
      showHostKey(net.key);
      this.status = 'SHARE THE KEY. FRIENDS JOIN VIA  JOIN ONLINE GAME';
      net.onMessage = (from, m) => this.onHostMsg(from, m);
      net.onPeerJoin = () => this.broadcastLobby();
      net.onPeerLeave = (id) => {
        this.players = this.players.filter((p) => p.owner !== id);
        this.broadcastLobby();
      };
    } catch (e) {
      this.status = `ONLINE ERROR: ${(e as Error).message}`.toUpperCase().slice(0, 60);
    }
  }

  private showJoin(err = ''): void {
    this.status = 'TYPE THE HOST KEY BELOW';
    showJoinBox(async (key) => {
      this.status = 'CONNECTING...';
      try {
        const net = await NetSession.join(key);
        if (!this.scene.isActive()) return net.close();
        setNet(net);
        clearDom();
        this.connected = true;
        this.myId = net.myId;
        this.status = 'CONNECTED! JOIN WITH YOUR DEVICES. HOST STARTS THE GAME';
        net.onMessage = (_f, m) => this.onGuestMsg(m);
        net.onClosed = () => {
          this.status = 'HOST CLOSED THE SESSION';
          this.time.delayedCall(1500, () => this.scene.start('Menu'));
        };
        net.send({ t: 'hello' });
      } catch (e) {
        this.showJoin((e as Error).message.toUpperCase());
      }
    }, err);
  }

  private onHostMsg(from: string, m: Msg): void {
    if (m.t === 'locals') {
      // remove this guest's players whose device left, add new ones
      this.players = this.players.filter((p) => p.owner !== from || m.devices.includes(p.device));
      for (const d of m.devices.slice(0, 4)) {
        if (this.players.some((p) => p.owner === from && p.device === d)) continue;
        this.addPlayer(from, d);
      }
      this.broadcastLobby();
    } else if (m.t === 'hello') {
      this.broadcastLobby();
    }
  }

  private onGuestMsg(m: Msg): void {
    if (m.t === 'lobby') {
      this.players = m.players;
      this.level = m.level;
      this.customName = m.customName ?? '';
      this.myId = m.you || this.myId;
    } else if (m.t === 'start') {
      this.scene.start('Game', { mode: 'guest', ...m.d });
    }
  }

  private broadcastLobby(): void {
    const net = getNet();
    if (!net || net.role !== 'host') return;
    net.send({ t: 'lobby', players: this.players, level: this.level, you: '', customName: this.customName || undefined });
  }

  // ---------------------------------------------------------------- players
  private addPlayer(owner: string, device: string): boolean {
    if (this.players.length >= 4) return false;
    let pid = 0;
    while (this.players.some((p) => p.pid === pid)) pid++;
    let hero = 0;
    while (this.players.some((p) => p.hero === hero)) hero++;
    this.players.push({ pid, hero, owner, device });
    this.players.sort((a, b) => a.pid - b.pid);
    playSfx('pickup');
    return true;
  }

  private start(): void {
    if (!this.players.length) return;
    const save = loadSave();
    const d: StartData = { level: this.level, seed: randomSeed(), total: save.total, lives: START_LIVES + Math.max(0, this.players.length - 1), players: this.players, custom: this.custom };
    const net = getNet();
    if (this.mode === 'host' && net) net.send({ t: 'start', d });
    this.scene.start('Game', { mode: this.mode, ...d });
  }

  update(_t: number, delta: number): void {
    this.t += delta / 1000;
    const inp = getInput();
    inp.poll();

    if (inp.keyDown('Escape')) {
      setNet(null);
      this.scene.start('Menu');
      return;
    }

    if (this.connected) {
      for (const d of inp.devices()) {
        const isMine = this.mode === 'guest' ? this.myDevices.includes(d) : this.players.some((p) => p.owner === 'host' && p.device === d);
        if (!isMine && (inp.justPressed(d, IN.JUMP) || inp.justPressed(d, IN.FIRE))) {
          if (this.mode === 'guest') {
            if (this.myDevices.length < 4) {
              this.myDevices.push(d);
              getNet()?.send({ t: 'locals', devices: this.myDevices });
              playSfx('pickup');
            }
          } else {
            this.addPlayer('host', d);
            this.broadcastLobby();
          }
        } else if (isMine && inp.justPressed(d, IN.SPECIAL)) {
          if (this.mode === 'guest') {
            this.myDevices = this.myDevices.filter((x) => x !== d);
            getNet()?.send({ t: 'locals', devices: this.myDevices });
          } else {
            this.players = this.players.filter((p) => !(p.owner === 'host' && p.device === d));
            this.broadcastLobby();
          }
          playSfx('throw');
        }
      }
      if (this.mode !== 'guest' && (inp.anyPressed(IN.START) || inp.keyDown('Enter')) && this.players.length) {
        this.start();
        return;
      }
    }
    this.draw();
  }

  private draw(): void {
    const lvl = this.customName ? `CUSTOM LEVEL: ${this.customName}` : `LEVEL ${this.level}${this.level % 5 === 0 ? '  (BOSS)' : ''}`;
    const startHint = this.mode === 'guest' ? 'WAITING FOR HOST TO START' : this.players.length ? 'PRESS ENTER / START TO DEPLOY' : '';
    this.info.setText(`${lvl}\n${this.status}\n${startHint}`);
    this.slots.forEach((s, i) => {
      const p = this.players.find((pl) => pl.pid === i);
      const x = (VIEW_W - 352) / 2 + 8 + i * 88;
      s.box.clear();
      s.box.fillStyle(0x000000, 0.6).fillRect(x, 56, 72, 82);
      s.box.lineStyle(1, p ? Phaser.Display.Color.HexStringToColor(HERO_COLORS[p.hero].band).color : 0x404040).strokeRect(x + 0.5, 56.5, 71, 81);
      if (p) {
        s.spr.setTexture(`hero${p.hero}`).setVisible(true).setFrame(Math.floor(this.t * 2 + i) % 2);
        const local = this.mode === 'guest' ? p.owner === this.myId : p.owner === 'host';
        const where = this.mode === 'local' ? '' : local ? '\nLOCAL' : '\nONLINE';
        s.txt.setText(`P${i + 1}\n${HERO_NAMES[p.hero]}\n${deviceLabel(p.device)}${where}`).setTint(0xffffff);
      } else {
        s.spr.setVisible(false);
        s.txt.setText(`P${i + 1}\n\nPRESS\nJUMP`).setTint(Math.floor(this.t * 2) % 2 ? 0x707070 : 0x404040);
      }
    });
  }
}
