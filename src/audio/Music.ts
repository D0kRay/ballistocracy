import { audioOut } from './Sfx';

// Tiny chiptune sequencer: square-wave bass + lead + noise hats, scheduled ahead in time.

const SCALE = [0, 3, 5, 7, 10, 12, 15, 17]; // minor pentatonic-ish
type Song = { bpm: number; root: number; bass: number[]; lead: number[] };

const SONGS: Record<string, Song> = {
  level: {
    bpm: 132,
    root: 45,
    bass: [0, 0, 7, 0, 5, 5, 3, 3, 0, 0, 7, 0, 10, 10, 7, 5],
    lead: [7, -1, 5, 7, -1, 10, 7, 5, 3, -1, 5, -1, 7, -1, -1, -1, 7, -1, 5, 7, -1, 12, 10, 7, 5, -1, 3, -1, 0, -1, -1, -1],
  },
  boss: {
    bpm: 156,
    root: 40,
    bass: [0, 0, 0, 1, 0, 0, 3, 1, 0, 0, 0, 1, 6, 5, 3, 1],
    lead: [12, 11, 12, -1, 15, -1, 12, -1, 11, 10, 11, -1, 8, -1, 7, -1, 12, 11, 12, -1, 17, -1, 15, -1, 12, -1, 10, 11, 12, -1, -1, -1],
  },
  menu: {
    bpm: 110,
    root: 48,
    bass: [0, 0, 5, 5, 3, 3, 7, 7],
    lead: [0, 3, 7, 10, 12, 10, 7, 3, 5, 7, 10, 12, 15, 12, 10, 7],
  },
};

function midi(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

export class Music {
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private song: Song = SONGS.level;
  private gain: GainNode | null = null;
  enabled = true;

  play(name: 'level' | 'boss' | 'menu'): void {
    this.stop();
    if (!this.enabled) return;
    const a = audioOut();
    if (!a) return;
    this.song = SONGS[name];
    this.gain = a.ctx.createGain();
    this.gain.gain.value = 0.18;
    this.gain.connect(a.out);
    this.step = 0;
    this.nextTime = a.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.gain) {
      const g = this.gain;
      try {
        g.gain.setTargetAtTime(0, g.context.currentTime, 0.05);
        setTimeout(() => g.disconnect(), 400);
      } catch {
        /* ignore */
      }
    }
    this.gain = null;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stop();
    return this.enabled;
  }

  private schedule(): void {
    const a = audioOut();
    if (!a || !this.gain) return;
    const stepDur = 60 / this.song.bpm / 4;
    while (this.nextTime < a.ctx.currentTime + 0.2) {
      const s = this.step;
      const t = this.nextTime;
      if (s % 2 === 0) {
        const b = this.song.bass[(s / 2) % this.song.bass.length];
        this.note(a.ctx, 'square', midi(this.song.root + SCALE[b % SCALE.length] + (b >= SCALE.length ? 12 : 0) - 12), t, stepDur * 1.8, 0.35);
      }
      const l = this.song.lead[s % this.song.lead.length];
      if (l >= 0) this.note(a.ctx, 'square', midi(this.song.root + 12 + l), t, stepDur * 0.9, 0.18);
      if (s % 4 === 2) this.hat(a.ctx, t);
      if (s % 8 === 0) this.kick(a.ctx, t);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private note(c: AudioContext, type: OscillatorType, f: number, t: number, dur: number, vol: number): void {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.gain!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(c: AudioContext, t: number): void {
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(this.gain!);
    o.start(t);
    o.stop(t + 0.16);
  }

  private hat(c: AudioContext, t: number): void {
    const len = Math.floor(c.sampleRate * 0.03);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = c.createGain();
    g.gain.value = 0.15;
    s.connect(f).connect(g).connect(this.gain!);
    s.start(t);
  }
}

export const music = new Music();
