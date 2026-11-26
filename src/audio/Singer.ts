// Formant singer: a robot / vocoder style voice made from scratch, no samples.
// A buzzing source (two detuned saws, the "vocal cords") runs through three band-pass
// filters tuned to the formants of each vowel; consonants are short noise bursts or hiss.
// Formant targets glide between phonemes, so syllables like "BAL" or "CRA" read as words.

/** formants F1, F2, F3 in Hz */
type Formants = [number, number, number];

const V: Record<string, Formants> = {
  a: [760, 1150, 2500], // "father"
  ae: [680, 1700, 2450], // "cat"
  e: [530, 1840, 2480], // "hey"
  i: [300, 2300, 3000], // "see"
  I: [400, 1950, 2550], // "lip"
  o: [460, 820, 2600], // "go"
  u: [320, 880, 2300], // "who"
  l: [360, 1050, 2450], // dark l
  r: [440, 1250, 1650], // r: low F3
  m: [280, 1000, 2300], // nasal hum
};

type Phone =
  | { k: 'v'; f: Formants; len?: number } // voiced; len in seconds (none = fills the rest)
  | { k: 'stop'; freq: number; len: number; voiced?: boolean } // b, t, k: gap + burst
  | { k: 'hiss'; freq: number; len: number; hp?: boolean }; // s, h, sh

/** loudness correction per syllable: open vowels and "ee" resonate much more than others */
const GAIN: Record<string, number> = { bal: 1.1, lis: 1.6, to: 0.95, cra: 1.5, cy: 0.45, hey: 0.85, oh: 0.95, go: 0.9, mm: 0.45 };

/** syllables the title song can sing */
export const SYLLABLES: Record<string, Phone[]> = {
  bal: [{ k: 'stop', freq: 500, len: 0.025, voiced: true }, { k: 'v', f: V.a }, { k: 'v', f: V.l, len: 0.07 }],
  lis: [{ k: 'v', f: V.l, len: 0.04 }, { k: 'v', f: V.I }, { k: 'hiss', freq: 5500, len: 0.08, hp: true }],
  to: [{ k: 'stop', freq: 3800, len: 0.035 }, { k: 'v', f: V.o }, { k: 'v', f: V.u, len: 0.06 }],
  cra: [{ k: 'stop', freq: 1900, len: 0.045 }, { k: 'v', f: V.r, len: 0.055 }, { k: 'v', f: V.ae }],
  cy: [{ k: 'hiss', freq: 5800, len: 0.075, hp: true }, { k: 'v', f: V.i }],
  hey: [{ k: 'hiss', freq: 1600, len: 0.05 }, { k: 'v', f: V.e }, { k: 'v', f: V.i, len: 0.06 }],
  oh: [{ k: 'v', f: V.o }, { k: 'v', f: V.u, len: 0.05 }],
  go: [{ k: 'stop', freq: 1500, len: 0.03, voiced: true }, { k: 'v', f: V.o }, { k: 'v', f: V.u, len: 0.06 }],
  mm: [{ k: 'v', f: V.m }],
};

export interface SingOut {
  dry: AudioNode;
  rev: AudioNode; // reverb send
  dly: AudioNode; // echo send
  noise: AudioBuffer;
}

const GLIDE = 0.035; // seconds between formant targets
const FORMANT_SHIFT = 1.12; // a little brighter than a male voice

/** sing one syllable at frequency f from t for dur seconds */
export function sing(c: BaseAudioContext, out: SingOut, syl: string, f: number, t: number, dur: number, vol: number): void {
  const phones = SYLLABLES[syl];
  if (!phones) return;
  const end = t + dur;
  // fixed-length phonemes take their time, vowels without len share what is left
  const fixed = phones.reduce((s, p) => s + (p.k === 'v' ? p.len ?? 0 : p.len), 0);
  const free = phones.filter((p) => p.k === 'v' && p.len === undefined).length;
  const vowelLen = Math.max(0.04, (dur - fixed) / Math.max(1, free));

  // ---- voiced source: a saw with a pitch scoop and late vibrato
  const voice = c.createGain();
  voice.gain.value = 0;
  const srcMix = c.createGain();
  srcMix.gain.value = 0.7;
  const oscs: OscillatorNode[] = [];
  {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.94, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o.connect(srcMix);
    oscs.push(o);
  }
  if (dur > 0.3) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 5.2;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.025, t + Math.min(0.4, dur * 0.6));
    lfo.connect(lg);
    for (const o of oscs) lg.connect(o.frequency);
    lfo.start(t);
    lfo.stop(end + 0.1);
  }
  // ---- three formant filters in parallel
  const filt: BiquadFilterNode[] = [];
  const fmix = c.createGain();
  [
    [8, 1],
    [12, 0.55],
    [14, 0.3],
  ].forEach(([q, g]) => {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    const gg = c.createGain();
    gg.gain.value = g * 5; // band-pass filters eat most of the energy
    srcMix.connect(bp).connect(gg).connect(fmix);
    filt.push(bp);
  });
  fmix.connect(voice);

  // ---- consonant noise (only for syllables that have a consonant)
  const hiss = c.createGain();
  hiss.gain.value = 0;
  const needsNoise = phones.some((p) => p.k !== 'v');
  const ns = needsNoise ? c.createBufferSource() : null;
  const nf = c.createBiquadFilter();
  nf.type = 'bandpass';
  nf.Q.value = 1.2;
  if (ns) {
    ns.buffer = out.noise;
    ns.loop = true;
    ns.connect(nf).connect(hiss);
  }

  const amp = c.createGain();
  amp.gain.value = vol * (GAIN[syl] ?? 1);
  voice.connect(amp);
  hiss.connect(amp);
  amp.connect(out.dry);
  const sr = c.createGain();
  sr.gain.value = 0.35;
  amp.connect(sr).connect(out.rev);
  const sd = c.createGain();
  sd.gain.value = 0.25;
  amp.connect(sd).connect(out.dly);

  // ---- walk the phonemes
  let now = t;
  let first = true;
  const setFormants = (fm: Formants, at: number) => {
    filt.forEach((bp, i) => {
      const v = fm[i] * FORMANT_SHIFT;
      if (first) bp.frequency.setValueAtTime(v, at);
      else bp.frequency.linearRampToValueAtTime(v, at + GLIDE);
    });
    first = false;
  };
  for (const p of phones) {
    if (p.k === 'v') {
      const len = p.len ?? vowelLen;
      setFormants(p.f, now);
      voice.gain.setTargetAtTime(1, now, 0.012);
      now += len;
    } else if (p.k === 'stop') {
      // closure (silence or a low hum), then a short burst of noise
      voice.gain.setTargetAtTime(p.voiced ? 0.15 : 0, now, 0.005);
      nf.type = 'bandpass';
      nf.frequency.setValueAtTime(p.freq, now);
      hiss.gain.setValueAtTime(0, now);
      hiss.gain.setValueAtTime(p.voiced ? 0.25 : 0.6, now + p.len * 0.6);
      hiss.gain.setTargetAtTime(0, now + p.len * 0.6, 0.012);
      now += p.len;
    } else {
      voice.gain.setTargetAtTime(syl === 'hey' ? 0.1 : 0, now, 0.01);
      nf.type = p.hp ? 'highpass' : 'bandpass';
      nf.frequency.setValueAtTime(p.freq, now);
      hiss.gain.setTargetAtTime(0.35, now, 0.01);
      hiss.gain.setTargetAtTime(0, now + p.len * 0.8, 0.01);
      now += p.len;
    }
  }
  voice.gain.setTargetAtTime(0, Math.min(now, end), 0.03);
  for (const o of oscs) {
    o.start(t);
    o.stop(end + 0.15);
  }
  if (ns) {
    ns.start(t);
    ns.stop(Math.min(end, now) + 0.05);
  }
}
