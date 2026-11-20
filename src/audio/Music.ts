import { audioOut } from './Sfx';

// Tiny chiptune sequencer. Every track has its own scale, instruments, drum kit and
// A/B parts, so each biome gets a recognisable soundtrack. Notes are written as
// scale degrees ('.' rest, '-' hold the previous note), one token per 16th step
// for the lead and one per 8th for the bass.

type Wave = OscillatorType;

interface Part {
  bass: string; // 8ths
  lead: string; // 16ths
  /** chord (scale degrees) per bar for the arpeggio channel */
  chords?: number[][];
}

interface Track {
  bpm: number;
  root: number; // midi note of degree 0 for the bass octave + 12
  scale: number[];
  bassWave: Wave;
  leadWave: Wave;
  /** lead note length in steps (bells ring, marimba is short); 0 = as written */
  leadRing?: number;
  leadOct?: number; // semitones above root (default 12)
  leadVol?: number;
  vibrato?: number; // semitones
  arpWave?: Wave;
  /** 16-char drum lanes: k kick, s snare, h hat, t tom, m metal clank */
  drums: Partial<Record<'k' | 's' | 'h' | 't' | 'm', string>>;
  parts: Record<string, Part>;
  order: string; // e.g. 'AABA'
}

const MINOR_PENT = [0, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARM_MINOR = [0, 2, 3, 5, 7, 8, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const PHRYG_DOM = [0, 1, 4, 5, 7, 8, 10];

export const TRACKS: Record<string, Track> = {
  menu: {
    bpm: 110, root: 48, scale: MINOR_PENT, bassWave: 'square', leadWave: 'square',
    drums: { k: 'k.......k.......', h: '..h...h...h...h.' },
    parts: {
      A: { bass: '0 0 3 3 2 2 4 4', lead: '0 1 2 3 4 3 2 1 2 3 4 5 6 5 4 3' },
      B: { bass: '2 2 1 1 0 0 0 0', lead: '5 . 4 3 4 . 3 2 3 . 2 1 0 - - .' },
    },
    order: 'AAAB',
  },
  // jungle: marimba lead over tribal toms
  jungle: {
    bpm: 126, root: 45, scale: MINOR_PENT, bassWave: 'square', leadWave: 'triangle', leadRing: 1.2, leadOct: 24, leadVol: 0.32,
    drums: { k: 'k.....k...k.....', s: '......s.......s.', t: '...t..t.t..t.tt.', h: '..h...h...h...h.' },
    parts: {
      A: { bass: '0 . 0 2 . 0 3 2 0 . 0 2 . 4 3 2', lead: '5 . 4 5 . 7 5 4 3 . 4 - . . . . 5 . 4 5 . 7 8 7 6 . 5 - . . . .' },
      B: { bass: '3 . 3 4 . 3 2 1 0 . 0 2 . 1 0 .', lead: '7 - 6 5 6 - 5 3 4 - 3 2 3 - . . 5 - 4 3 4 - 3 2 0 - 1 2 0 - . .' },
    },
    order: 'AABA',
  },
  // desert: snake-charmer scale, buzzing saw lead with vibrato, darbuka toms
  desert: {
    bpm: 116, root: 40, scale: PHRYG_DOM, bassWave: 'triangle', leadWave: 'sawtooth', vibrato: 0.25, leadVol: 0.11,
    drums: { k: 'k.....k...k.....', s: '...s......s...s.', t: '..t...t.t...t.t.', h: '.h.h.h.h.h.h.h.h' },
    parts: {
      A: { bass: '0 . 0 . 1 . 0 . 0 . 0 . 6 . 5 .', lead: '7 - 8 7 6 - 5 4 5 - 4 1 0 - - . 7 - 8 7 6 - 5 6 7 - 9 8 7 - - .' },
      B: { bass: '3 . 3 . 4 . 3 . 1 . 1 . 0 . 0 .', lead: '11 - 10 9 8 - 7 8 9 - 8 7 6 - 5 . 4 - 5 6 7 - 6 5 4 - 1 1 0 - - .' },
    },
    order: 'AABB',
  },
  // arctic: slow dorian bells over a soft arpeggio
  snow: {
    bpm: 96, root: 50, scale: DORIAN, bassWave: 'triangle', leadWave: 'sine', leadRing: 6, leadOct: 24, leadVol: 0.26, arpWave: 'triangle',
    drums: { k: 'k.......k.......', s: '........s.......', h: '..h...h...h...h.' },
    parts: {
      A: { bass: '0 - - - 5 - - - 3 - - - 4 - - -', lead: '7 . . . 9 . 8 . 7 . . . 4 . . . 5 . . . 7 . 6 . 4 . . . . . . .', chords: [[0, 2, 4], [5, 7, 9]] },
      B: { bass: '3 - - - 4 - - - 0 - - - 0 - - -', lead: '9 . . . 11 . 10 . 9 . 7 . 8 . . . 7 . . . 6 . 4 . 5 . . . . . . .', chords: [[3, 5, 7], [4, 6, 8]] },
    },
    order: 'AB',
  },
  // ruined city: driving rock beat, octave saw bass
  city: {
    bpm: 142, root: 48, scale: MINOR, bassWave: 'sawtooth', leadWave: 'square', leadVol: 0.14,
    drums: { k: 'k.....k.k.......', s: '....s.......s...', h: 'h.h.h.h.h.h.h.h.' },
    parts: {
      A: { bass: '0 7 0 7 -2 5 -2 5 -3 4 -3 4 -1 6 -1 6', lead: '4 . 4 . 5 4 . 2 - . 0 . 2 . 4 . 4 . 4 . 5 7 . 6 - . 5 . 4 . 2 .' },
      B: { bass: '-2 5 -2 5 -3 4 -3 4 0 7 0 7 -1 6 -1 6', lead: '7 - - 6 7 - 9 - 8 - 7 - 6 - 4 - 5 - - 4 5 - 7 - 6 - 5 - 4 - - .' },
    },
    order: 'AABA',
  },
  // industrial: machine pulse bass and metal clanks
  industrial: {
    bpm: 128, root: 41, scale: MINOR, bassWave: 'square', leadWave: 'square', leadVol: 0.12,
    drums: { k: 'k...k...k...k...', s: '....s.......s...', m: '..m...m...m..m.m', h: '.h.h.h.h.h.h.h.h' },
    parts: {
      A: { bass: '0 0 0 0 0 0 3 2 0 0 0 0 5 5 4 3', lead: '7 . . 7 . . 6 . 5 . . . . . . . 7 . . 7 . . 8 . 9 . . . 8 . . .' },
      B: { bass: '5 5 5 5 4 4 4 4 3 3 3 3 2 2 1 1', lead: '9 - 8 - 7 - 5 - 6 - 5 - 4 - 2 - 3 - 4 - 5 - 7 - 6 - - - . . . .' },
    },
    order: 'AABB',
  },
  // volcano: fast harmonic-minor metal riff with double kick
  volcano: {
    bpm: 154, root: 40, scale: HARM_MINOR, bassWave: 'sawtooth', leadWave: 'square', leadVol: 0.13,
    drums: { k: 'k.k.k.k.k.k.kkk.', s: '....s.......s.s.', h: '..h...h...h...h.' },
    parts: {
      A: { bass: '0 0 . 0 1 . 0 . 0 0 . 0 6 5 4 3', lead: '7 8 7 6 7 . 4 . 5 6 5 4 5 . 2 . 3 4 3 2 3 . 0 . 1 2 3 4 6 . 7 .' },
      B: { bass: '5 5 . 5 4 . 4 . 3 3 . 3 6 . 6 .', lead: '7 - - . 9 - - . 10 - 9 8 9 - 7 . 8 - - . 6 - - . 7 - - - - - . .' },
    },
    order: 'AABA',
  },
  boss: {
    bpm: 160, root: 40, scale: PHRYGIAN, bassWave: 'sawtooth', leadWave: 'square', leadVol: 0.14,
    drums: { k: 'k.k.k.k.k.k.k.k.', s: '....s.......s...', h: 'hhhhhhhhhhhhhhhh' },
    parts: {
      A: { bass: '0 0 0 1 0 0 2 1 0 0 0 1 4 3 2 1', lead: '7 6 7 . 9 . 7 . 6 5 6 . 4 . 3 . 7 6 7 . 10 . 9 . 7 . 5 6 7 . . .' },
      B: { bass: '3 3 3 4 3 3 2 1 0 0 0 1 0 . 0 .', lead: '7 - 8 - 9 - 10 - 9 - 8 - 7 - 6 - 7 - 6 - 5 - 4 - 3 - 4 - 1 - 0 -' },
    },
    order: 'AAB',
  },
  boss2: {
    bpm: 168, root: 36, scale: HARM_MINOR, bassWave: 'sawtooth', leadWave: 'sawtooth', leadVol: 0.1, leadOct: 24,
    drums: { k: 'kk..k.k.kk..k.k.', s: '....s.......s..s', h: '..h...h...h...h.', m: '...............m' },
    parts: {
      A: { bass: '0 . 0 0 6 . 6 6 5 . 5 5 4 . 4 3', lead: '7 . 9 10 9 . 7 . 6 . 7 9 7 . 4 . 5 . 6 7 9 . 10 . 11 - 10 9 7 - - .' },
      B: { bass: '3 . 3 3 4 . 4 4 0 . 0 0 6 . 6 .', lead: '14 - 13 - 12 - 11 - 10 - 9 - 7 - 9 - 10 - 11 - 13 - 14 - - - - - . . . .' },
    },
    order: 'AB',
  },
};

/** soundtrack for a level: one per biome, bosses alternate between two tracks */
export function trackFor(biomeId: string, isBoss: boolean, level: number): string {
  if (isBoss) return Math.floor(level / 5) % 2 === 0 ? 'boss2' : 'boss';
  return TRACKS[biomeId] ? biomeId : 'city';
}

interface Note {
  deg: number;
  len: number; // in tokens
}

/** '5 . 4 - 7' -> note or null per token */
function parse(s: string): (Note | null)[] {
  const tok = s.trim().split(/\s+/);
  const out: (Note | null)[] = tok.map(() => null);
  tok.forEach((t, i) => {
    if (t === '.' || t === '-') return;
    let len = 1;
    while (tok[i + len] === '-') len++;
    out[i] = { deg: Number(t), len };
  });
  return out;
}

interface Compiled {
  t: Track;
  parts: { bass: (Note | null)[]; lead: (Note | null)[]; chords?: number[][] }[];
}

function compile(t: Track): Compiled {
  const parts = [...t.order].map((k) => {
    const p = t.parts[k];
    return { bass: parse(p.bass), lead: parse(p.lead), chords: p.chords };
  });
  return { t, parts };
}

function midi(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function semis(scale: number[], deg: number): number {
  const n = scale.length;
  const o = Math.floor(deg / n);
  return scale[((deg % n) + n) % n] + 12 * o;
}

export class Music {
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private song: Compiled = compile(TRACKS.menu);
  private gain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private current = '';
  enabled = true;

  play(name: string): void {
    this.stop();
    this.current = name;
    if (!this.enabled) return;
    const a = audioOut();
    if (!a) return;
    this.song = compile(TRACKS[name] ?? TRACKS.city);
    this.gain = a.ctx.createGain();
    this.gain.gain.value = 0.18;
    this.gain.connect(a.out);
    this.step = 0;
    this.nextTime = a.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  /** restart whatever was playing last (after unmuting) */
  resume(): void {
    if (this.current) this.play(this.current);
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
    const { t: tr, parts } = this.song;
    const stepDur = 60 / tr.bpm / 4;
    const partLen = parts[0].lead.length;
    while (this.nextTime < a.ctx.currentTime + 0.2) {
      const s = this.step;
      const t = this.nextTime;
      const part = parts[Math.floor(s / partLen) % parts.length];
      const ps = s % partLen;
      const c = a.ctx;
      // bass (8ths)
      if (ps % 2 === 0) {
        const b = part.bass[(ps / 2) % part.bass.length];
        if (b) this.note(c, tr.bassWave, midi(tr.root - 12 + semis(tr.scale, b.deg)), t, stepDur * 2 * b.len * 0.9, tr.bassWave === 'sawtooth' ? 0.22 : 0.33, 0, 1400);
      }
      // lead (16ths)
      const l = part.lead[ps];
      if (l) {
        const dur = tr.leadRing ? stepDur * tr.leadRing : stepDur * l.len * 0.92;
        this.note(c, tr.leadWave, midi(tr.root + (tr.leadOct ?? 12) + semis(tr.scale, l.deg)), t, dur, tr.leadVol ?? 0.18, tr.vibrato ?? 0, 3200);
      }
      // arpeggio: chord tones up and down, one bar per chord
      if (tr.arpWave && part.chords) {
        const ch = part.chords[Math.floor(ps / 16) % part.chords.length];
        const seq = [0, 1, 2, 1];
        const deg = ch[seq[ps % 4] % ch.length] + (ps % 8 >= 4 ? tr.scale.length : 0);
        this.note(c, tr.arpWave, midi(tr.root + 12 + semis(tr.scale, deg)), t, stepDur * 0.8, 0.08, 0, 2400);
      }
      // drums
      const d = tr.drums;
      const at = (lane?: string) => !!lane && lane[ps % 16] !== '.' && lane[ps % 16] !== undefined;
      if (at(d.k)) this.kick(c, t);
      if (at(d.s)) this.snare(c, t);
      if (at(d.h)) this.hat(c, t);
      if (at(d.t)) this.tom(c, t, ps % 4 === 3 ? 160 : 210);
      if (at(d.m)) this.metal(c, t);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private note(c: AudioContext, type: Wave, f: number, t: number, dur: number, vol: number, vib: number, cutoff: number): void {
    const o = c.createOscillator();
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    o.type = type;
    o.frequency.value = f;
    if (vib > 0 && dur > 0.15) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 6;
      lg.gain.value = f * (Math.pow(2, vib / 12) - 1);
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t + 0.08);
      lfo.stop(t + dur + 0.02);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp).connect(g).connect(this.gain!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBuf(c: AudioContext): AudioBuffer {
    if (!this.noise || this.noise.sampleRate !== c.sampleRate) {
      const len = Math.floor(c.sampleRate * 0.3);
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  private noiseHit(c: AudioContext, t: number, type: BiquadFilterType, freq: number, q: number, vol: number, dur: number): void {
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf(c);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.gain!);
    s.start(t);
    s.stop(t + dur + 0.02);
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

  private snare(c: AudioContext, t: number): void {
    this.noiseHit(c, t, 'bandpass', 1800, 0.8, 0.35, 0.12);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g).connect(this.gain!);
    o.start(t);
    o.stop(t + 0.08);
  }

  private hat(c: AudioContext, t: number): void {
    this.noiseHit(c, t, 'highpass', 6500, 0.7, 0.12, 0.03);
  }

  private tom(c: AudioContext, t: number, f0: number): void {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.18);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.gain!);
    o.start(t);
    o.stop(t + 0.22);
  }

  private metal(c: AudioContext, t: number): void {
    this.noiseHit(c, t, 'bandpass', 3400, 9, 0.5, 0.09);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.value = 820;
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(this.gain!);
    o.start(t);
    o.stop(t + 0.06);
  }
}

export const music = new Music();
