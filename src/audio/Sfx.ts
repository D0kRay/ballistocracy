import type { SfxName } from '../sim/types';

// Everything is synthesized with WebAudio: square/saw/noise blips like an 8-bit sound chip.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
const lastPlayed = new Map<string, number>();

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  ac();
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.35;
  return muted;
}

export function audioOut(): { ctx: AudioContext; out: GainNode } | null {
  const c = ac();
  return c && master ? { ctx: c, out: master } : null;
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, pan = 0): void {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  const p = c.createStereoPanner();
  p.pan.value = pan;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(p).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, f0: number, f1: number, delay = 0, pan = 0): void {
  const c = ac();
  if (!c || !master || !noiseBuf) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = c.createStereoPanner();
  p.pan.value = pan;
  s.connect(f).connect(g).connect(p).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

const MIN_GAP: Partial<Record<SfxName, number>> = {
  shoot: 0.05, minigun: 0.04, flame: 0.09, eshoot: 0.05, boom: 0.04, clink: 0.06, jump: 0.05, edie: 0.03,
};

export function playSfx(n: SfxName, pan = 0): void {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const now = c.currentTime;
  const gap = MIN_GAP[n] ?? 0.02;
  if (now - (lastPlayed.get(n) ?? -1) < gap) return;
  lastPlayed.set(n, now);
  pan = Math.max(-0.8, Math.min(0.8, pan));
  switch (n) {
    case 'shoot': tone('square', 900, 180, 0.07, 0.12, 0, pan); noise(0.05, 0.12, 4000, 800, 0, pan); break;
    case 'minigun': tone('square', 700, 200, 0.05, 0.1, 0, pan); noise(0.04, 0.1, 3000, 600, 0, pan); break;
    case 'shotgun': noise(0.22, 0.35, 3000, 200, 0, pan); tone('square', 200, 60, 0.15, 0.15, 0, pan); break;
    case 'flame': noise(0.12, 0.12, 1200, 400, 0, pan); break;
    case 'rocket': noise(0.35, 0.2, 800, 200, 0, pan); tone('sawtooth', 120, 400, 0.25, 0.08, 0, pan); break;
    case 'eshoot': tone('square', 500, 120, 0.08, 0.09, 0, pan); noise(0.05, 0.08, 2500, 500, 0, pan); break;
    case 'snipe': tone('sawtooth', 1400, 100, 0.25, 0.14, 0, pan); noise(0.1, 0.2, 5000, 500, 0, pan); break;
    case 'boom': noise(0.5, 0.5, 1400, 60, 0, pan); tone('square', 90, 30, 0.35, 0.18, 0, pan); break;
    case 'bigboom': noise(0.9, 0.7, 1800, 40, 0, pan); tone('square', 70, 25, 0.7, 0.25, 0, pan); break;
    case 'jump': tone('square', 260, 620, 0.1, 0.07, 0, pan); break;
    case 'pickup': [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.07, 0.15, i * 0.05)); break;
    case 'hurt': tone('square', 300, 70, 0.2, 0.18, 0, pan); break;
    case 'die': tone('square', 400, 40, 0.6, 0.2, 0, pan); noise(0.3, 0.2, 1500, 100, 0, pan); break;
    case 'edie': tone('square', 220, 50, 0.18, 0.1, 0, pan); noise(0.12, 0.12, 2000, 200, 0, pan); break;
    case 'alert': tone('square', 880, 880, 0.05, 0.08, 0, pan); tone('square', 1175, 1175, 0.06, 0.08, 0.06, pan); break;
    case 'throw': tone('triangle', 300, 120, 0.1, 0.1, 0, pan); break;
    case 'beep': tone('square', 1500, 1500, 0.05, 0.08, 0, pan); break;
    case 'clink': tone('triangle', 2000, 1200, 0.05, 0.08, 0, pan); break;
    case 'rescue': [392, 523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.09, 0.12, i * 0.07)); break;
    case 'boss': tone('sawtooth', 80, 40, 1.2, 0.25); tone('square', 110, 55, 1.2, 0.12, 0.1); break;
    case 'clear': [523, 523, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.12, 0.13, i * 0.11)); break;
    case 'door': tone('square', 120, 60, 0.4, 0.2); noise(0.4, 0.3, 800, 100); break;
    case 'crush': noise(0.4, 0.4, 900, 80, 0, pan); tone('square', 80, 40, 0.3, 0.18, 0, pan); break;
    case 'saw': tone('sawtooth', 600, 650, 0.1, 0.05, 0, pan); break;
    case 'screech': noise(0.3, 0.12, 5000, 2500, 0, pan); tone('sawtooth', 1300, 900, 0.28, 0.04, 0, pan); break;
    case 'horn': tone('square', 392, 392, 0.14, 0.12, 0, pan); tone('square', 494, 494, 0.14, 0.1, 0, pan); tone('square', 392, 392, 0.22, 0.12, 0.2, pan); tone('square', 494, 494, 0.22, 0.1, 0.2, pan); break;
  }
}
