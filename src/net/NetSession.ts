import Peer, { type DataConnection } from 'peerjs';
import { PEER_PREFIX } from '../config';
import type { Msg } from './protocol';

// WebRTC peer-to-peer via PeerJS. The public PeerJS broker is only used to find each other;
// all game traffic flows directly between the browsers.

const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeKey(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)];
  return s;
}

export function normaliseKey(k: string): string {
  return k.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export class NetSession {
  readonly role: 'host' | 'guest';
  readonly key: string;
  readonly peer: Peer;
  private conns = new Map<string, DataConnection>();
  onMessage: (from: string, msg: Msg) => void = () => {};
  onPeerJoin: (id: string) => void = () => {};
  onPeerLeave: (id: string) => void = () => {};
  onClosed: () => void = () => {};
  closed = false;

  private constructor(role: 'host' | 'guest', key: string, peer: Peer) {
    this.role = role;
    this.key = key;
    this.peer = peer;
  }

  get myId(): string {
    return this.role === 'host' ? 'host' : this.peer.id;
  }

  get peerCount(): number {
    return this.conns.size;
  }

  static host(): Promise<NetSession> {
    return new Promise((resolve, reject) => {
      const attempt = (tries: number) => {
        const key = makeKey();
        const peer = new Peer(PEER_PREFIX + key, { debug: 1 });
        const s = new NetSession('host', key, peer);
        let opened = false;
        peer.on('open', () => {
          opened = true;
          resolve(s);
        });
        peer.on('connection', (c) => s.attach(c));
        peer.on('error', (err: { type?: string; message?: string }) => {
          if (!opened && err.type === 'unavailable-id' && tries < 4) {
            peer.destroy();
            attempt(tries + 1);
          } else if (!opened) {
            reject(new Error(err.message ?? String(err.type)));
          }
        });
        peer.on('disconnected', () => {
          if (!s.closed) peer.reconnect();
        });
      };
      attempt(0);
    });
  }

  static join(rawKey: string): Promise<NetSession> {
    const key = normaliseKey(rawKey);
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 1 });
      const s = new NetSession('guest', key, peer);
      let done = false;
      const timer = window.setTimeout(() => {
        if (!done) {
          done = true;
          peer.destroy();
          reject(new Error('NO HOST FOUND FOR THIS KEY'));
        }
      }, 12000);
      peer.on('open', () => {
        const c = peer.connect(PEER_PREFIX + key, { reliable: true, serialization: 'json' });
        c.on('open', () => {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          s.attach(c, true);
          resolve(s);
        });
      });
      peer.on('error', (err: { type?: string; message?: string }) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        peer.destroy();
        reject(new Error(err.type === 'peer-unavailable' ? 'NO HOST FOUND FOR THIS KEY' : err.message ?? 'CONNECTION FAILED'));
      });
    });
  }

  private attach(c: DataConnection, alreadyOpen = false): void {
    const ready = () => {
      this.conns.set(c.peer, c);
      if (this.role === 'host') this.onPeerJoin(c.peer);
    };
    if (alreadyOpen) ready();
    else c.on('open', ready);
    c.on('data', (d) => this.onMessage(this.role === 'host' ? c.peer : 'host', d as Msg));
    const gone = () => {
      if (!this.conns.has(c.peer)) return;
      this.conns.delete(c.peer);
      if (this.role === 'host') this.onPeerLeave(c.peer);
      else {
        this.closed = true;
        this.onClosed();
      }
    };
    c.on('close', gone);
    c.on('error', gone);
  }

  /** guest -> host, or host -> everyone */
  send(msg: Msg): void {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  sendTo(id: string, msg: Msg): void {
    const c = this.conns.get(id);
    if (c?.open) c.send(msg);
  }

  close(): void {
    this.closed = true;
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    this.peer.destroy();
  }
}

// one session lives across scenes
let current: NetSession | null = null;
export function getNet(): NetSession | null {
  return current;
}
export function setNet(n: NetSession | null): void {
  if (current && current !== n) current.close();
  current = n;
}
