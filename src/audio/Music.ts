import { audioOut } from './Sfx';
import { sing } from './Singer';

// Small synth + sequencer. Every track picks its instruments (detuned supersaws, distorted
// guitars with power chords, acid / reese / slap basses, pads, strings, brass...), a drum
// kit and an effect mix (delay, reverb). Each biome has a playlist of tracks in different
// styles that rotate while you play.
//
// Notes are written as scale degrees ('.' rest, '-' hold the previous note): one token per
// 16th step for the lead, one per 8th for the bass (or per 16th with bassSteps: 16).
// Drum lanes have 16 or 32 characters (1 or 2 bars); an upper-case letter is an accent.

type Wave = OscillatorType;
type BassInst = 'pulse' | 'saw' | 'sub' | 'reese' | 'acid' | 'slap' | 'pluck' | 'dist';
type LeadInst = 'chip' | 'supersaw' | 'guitar' | 'twang' | 'brass' | 'bell' | 'marimba' | 'flute' | 'pluck';
type ChordInst = 'pad' | 'strings' | 'stab';
type Kit = 'chip' | 'rock' | '808' | 'electro' | 'breaks' | 'orch';
type Lane = 'k' | 's' | 'h' | 't' | 'm' | 'o' | 'c' | 'x' | 'r';

interface Part {
  bass: string;
  lead: string;
  /** chord (scale degrees) per bar for the arpeggio / pad / stab channel */
  chords?: number[][];
  /** sung line, one token per 16th: 'degree/syllable' (see Singer), '.' rest, '-' hold */
  vox?: string;
  /** drums for this part only (intro without kick, build-up with a snare roll...) */
  drums?: Partial<Record<Lane, string>>;
  /** white-noise sweep rising over the whole part (EDM build-up) */
  riser?: boolean;
}

interface Track {
  /** what it sounds like, for the code reader and the tests */
  style: string;
  bpm: number;
  root: number; // midi note of degree 0 for the lead octave (bass plays an octave lower)
  scale: number[];
  bassWave: Wave;
  leadWave: Wave;
  bassInst?: BassInst;
  leadInst?: LeadInst;
  /** bass tokens per step: 8 (default, 8ths) or 16 (16ths, for acid lines and gallops) */
  bassSteps?: 8 | 16;
  /** a distorted rhythm guitar doubles every bass note as a power chord */
  guitarBass?: boolean;
  /** lead note length in steps (bells ring, marimba is short); 0 = as written */
  leadRing?: number;
  leadOct?: number; // semitones above root (default 12)
  leadVol?: number;
  vibrato?: number; // semitones
  arpWave?: Wave;
  chordInst?: ChordInst;
  /** 16-char lane for stabs: x = hit */
  chordRhythm?: string;
  kit?: Kit;
  drums: Partial<Record<Lane, string>>;
  swing?: number; // 0..0.3 of a step on every second 16th
  delay?: number; // echo send level (0..1)
  reverb?: number; // reverb send level (0..1)
  loops?: number; // times the whole order plays before the playlist moves on
  /** sidechain pumping: bass, chords and lead duck on every beat while the kick plays */
  pump?: boolean;
  voxOct?: number; // semitones above root for the singer (default 12)
  voxVol?: number;
  parts: Record<string, Part>;
  order: string; // e.g. 'AABA'
}

const MINOR_PENT = [0, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const HARM_MINOR = [0, 2, 3, 5, 7, 8, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const PHRYG_DOM = [0, 1, 4, 5, 7, 8, 10];

/** join bars written as separate strings */
const L = (...bars: string[]) => bars.join(' ');
/** repeat a bar */
const R = (bar: string, n: number) => Array(n).fill(bar).join(' ');

const REST = '. . . . . . . . . . . . . . . .';
const EDM_CHORDS = [[0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10]]; // Am F C G
const EDM_DROP: Partial<Record<Lane, string>> = {
  k: 'k...k...k...k...',
  c: '....C.......C...',
  o: '..o...o...o...o.',
  h: 'h.hhh.hhh.hhh.hh',
  x: 'X...............................',
};

export const TRACKS: Record<string, Track> = {
  // ------------------------------------------------------------------ title song
  // EDM anthem: the synth singer chants BAL-LIS-TO-CRA-CY over pumping supersaws
  title: {
    style: 'edm',
    bpm: 128, root: 57, scale: MINOR, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'saw', leadInst: 'supersaw', leadVol: 0.1,
    chordInst: 'pad', kit: 'electro', pump: true, delay: 0.35, reverb: 0.45, voxOct: 0, voxVol: 0.34, loops: 2,
    drums: EDM_DROP,
    parts: {
      // intro: pad and the voice, no kick
      I: {
        bass: L('0 - - - - - - -', '-2 - - - - - - -', '-5 - - - - - - -', '-1 - - - - - - -'),
        lead: R(REST, 4),
        chords: EDM_CHORDS,
        vox: L(REST, '0/bal - - 2/lis - 4/to - - 3/cra - 2/cy - - - - -', REST, '4/oh - - - - - - - 2/oh - - - - - - -'),
        drums: { h: '..h...h...h...h.' },
      },
      // build-up: kick, accelerating snare roll, noise riser, chopped vocals
      B: {
        bass: L('0 . 0 . 0 . 0 .', '-2 . -2 . -2 . -2 .', '-5 . -5 . -5 . -5 .', '-1 -1 -1 -1 -1 -1 -1 -1'),
        lead: L(REST, REST, REST, '7 . 9 . 11 . 12 . 14 . 16 . 17 . 18 .'),
        chords: EDM_CHORDS,
        vox: L(
          '0/bal . . . 0/bal . . . 0/bal . . . 0/bal . . .',
          '0/bal . 2/lis . 4/to . . . 0/bal . 2/lis . 4/to . . .',
          '0/bal . 0/bal . 2/lis . 2/lis . 4/to . 4/to . 3/cra . 2/cy .',
          '7/bal 7/lis 9/to 10/cra 9/cy - - - - - - - . . . .',
        ),
        drums: {
          k: 'k...k...k...k...',
          s: 'S.......S.......S.......S.......S...S...S...S...S.S.S.S.SSSSSSSS',
          h: '..h...h...h...h.',
        },
        riser: true,
      },
      // drop 1: the chorus, sung
      D: {
        bass: L(R('0', 8), R('-2', 8), R('-5', 8), R('-1', 8)),
        lead: L('. . 7 . . . 7 . . . 7 . . . . .', '. . 5 . . . 5 . . . 5 . . . . .', '. . 9 . . . 9 . . . 9 . . . . .', '. . 8 . . . 8 . . . 10 . . . . .'),
        chords: EDM_CHORDS,
        vox: L(
          '7/bal - 7/lis - 9/to - 10/cra - 9/cy - - - . . 7/hey -',
          '. . . . . . . . 5/oh - - - 4/oh - - -',
          '9/bal - 9/lis - 11/to - 12/cra - 11/cy - - - - - - -',
          '. . . . 10/hey - 9/hey - 8/oh - - - - - - -',
        ),
      },
      // drop 2: full supersaw riff, shouts
      E: {
        bass: L(R('0', 8), R('-2', 8), R('-5', 8), R('-1', 8)),
        lead: L('7 . 7 . 9 . 7 . 11 . 10 . 9 . 7 .', '5 . 5 . 7 . 5 . 9 . 7 . 5 . 4 .', '9 . 9 . 11 . 9 . 13 . 11 . 9 . 8 .', '8 . 8 . 10 . 8 . 13 . 12 . 10 . 8 .'),
        chords: EDM_CHORDS,
        vox: L('. . . . . . . . . . . . 7/hey - . .', REST, '. . . . . . . . . . . . 9/hey - . .', '7/bal 7/lis 9/to 10/cra 9/cy - - - . . . . . . . .'),
      },
    },
    order: 'IBDEBDE',
  },

  // ------------------------------------------------------------------ menu
  menu: {
    style: 'chiptune',
    bpm: 110, root: 48, scale: MINOR_PENT, bassWave: 'square', leadWave: 'square',
    drums: { k: 'k.......k.......', h: '..h...h...h...h.' },
    parts: {
      A: { bass: '0 0 3 3 2 2 4 4', lead: '0 1 2 3 4 3 2 1 2 3 4 5 6 5 4 3' },
      B: { bass: '2 2 1 1 0 0 0 0', lead: '5 . 4 3 4 . 3 2 3 . 2 1 0 - - .' },
    },
    order: 'AAAB',
  },
  // outrun synthwave: octave bass, supersaw lead, wide pad and a gated reverb snare
  menu_synth: {
    style: 'synthwave',
    bpm: 104, root: 57, scale: MINOR, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'saw', leadInst: 'supersaw', leadVol: 0.11,
    chordInst: 'pad', arpWave: 'square', kit: 'rock', delay: 0.4, reverb: 0.45,
    drums: { k: 'k...k...k...k...', s: '....S.......S...', h: 'hhhhhhhhhhhhhhhh', o: '..o...o...o...o.' },
    parts: {
      A: {
        bass: L(R('0 7', 4), R('-2 5', 4), R('-5 2', 4), R('-1 6', 4)),
        lead: L('7 - - - 9 - 10 - 9 - 7 - 4 - - -', '5 - - - 7 - 9 - 7 - 5 - 4 - 2 -', '4 - - - 6 - 7 - 9 - - - 7 - 6 -', '6 - - - - - 4 - 6 - 8 - 7 - - -'),
        chords: [[0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10]],
      },
      B: {
        bass: L(R('-2 5', 4), R('-1 6', 4), R('0 7', 4), '0 7 0 7 0 7 7 7'),
        lead: L('12 - - - 11 - 9 - 11 - - - 9 - 7 -', '8 - - - 9 - 11 - 13 - - - 11 - - -', '14 - - - - - 13 - 11 - - - 9 - - -', '7 - - - - - - - . . . . . . . .'),
        chords: [[5, 7, 9], [6, 8, 10], [0, 2, 4], [0, 2, 4]],
      },
    },
    order: 'AABB',
  },
  // arena rock anthem in a major key
  menu_anthem: {
    style: 'arena rock',
    bpm: 124, root: 52, scale: MAJOR, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'saw', leadInst: 'guitar', leadVol: 0.09, guitarBass: true,
    kit: 'rock', delay: 0.3, reverb: 0.3,
    drums: { k: 'k.....k.k.......', s: '....S.......S...', h: 'h.h.h.h.h.h.h.h.' },
    parts: {
      A: {
        bass: L(R('0', 8), R('-2', 8), R('-4', 8), R('-3', 8)),
        lead: L('7 - - - 6 - 7 - 9 - - - 7 - 6 -', '5 - - - - - 4 - 5 - 6 - 7 - - -', '3 - - - 4 - 5 - 7 - - - 5 - 4 -', '4 - - - - - - - 6 - - - - - - -'),
      },
      B: {
        bass: L(R('-4', 8), R('-3', 8), R('0', 8), '-3 -3 -3 -3 -3 . -3 .'),
        lead: L('11 - - - 10 - 9 - 10 - - - 11 - 12 -', '12 - - - 11 - 9 - 9 - - - 7 - - -', '10 - - - 9 - 7 - 9 - - - 10 - 11 -', '11 - - - - - - - - - - - . . . .'),
      },
    },
    order: 'AABA',
  },

  // ------------------------------------------------------------------ jungle
  // marimba lead over tribal toms
  jungle: {
    style: 'tribal chiptune',
    bpm: 126, root: 45, scale: MINOR_PENT, bassWave: 'square', leadWave: 'triangle', leadInst: 'marimba', leadRing: 1.2, leadOct: 24, leadVol: 0.3,
    drums: { k: 'k.....k...k.....', s: '......s.......s.', t: '...t..t.t..t.tt.', h: '..h...h...h...h.' },
    parts: {
      A: { bass: '0 . 0 2 . 0 3 2 0 . 0 2 . 4 3 2', lead: '5 . 4 5 . 7 5 4 3 . 4 - . . . . 5 . 4 5 . 7 8 7 6 . 5 - . . . .' },
      B: { bass: '3 . 3 4 . 3 2 1 0 . 0 2 . 1 0 .', lead: '7 - 6 5 6 - 5 3 4 - 3 2 3 - . . 5 - 4 3 4 - 3 2 0 - 1 2 0 - . .' },
    },
    order: 'AABA',
  },
  // drum and bass: chopped breakbeat, growling reese bass, echoing flute
  jungle_dnb: {
    style: 'drum and bass',
    bpm: 172, root: 57, scale: DORIAN, bassWave: 'sawtooth', leadWave: 'sine', bassInst: 'reese', leadInst: 'flute', leadVol: 0.2,
    chordInst: 'pad', kit: 'breaks', delay: 0.5, reverb: 0.4,
    drums: {
      k: 'k.k.......kk....k.k.......k.....',
      s: '....S..s.s..S..s....S..s.s..S...',
      h: 'h.h.h.h.h.h.h.h.h.h.h.h.h.h.h.h.',
      o: '..............o...............o.',
    },
    parts: {
      A: {
        bass: L('0 - - - - - - -', '0 - - - -1 - - -', '-2 - - - - - - -', '-2 - - - -3 - -1 -'),
        lead: L('7 - - - - - 9 - 10 - - - 9 - 7 -', '6 - - - - - - - . . . . . . . .', '5 - - - - - 6 - 7 - - - 6 - 5 -', '4 - - - - - - - . . . . 2 - 3 -'),
        chords: [[0, 2, 4], [0, 2, 4], [-2, 0, 2], [-3, -1, 1]],
      },
      B: {
        bass: L('3 - - - - - - -', '3 - - - 2 - - -', '0 - - - - - - -', '-1 - - - -2 - - -'),
        lead: L('11 - 10 - 9 - 7 - 9 - - - 7 - 6 -', '7 - - - - - - - 4 - 5 - 6 - 7 -', '9 - - - 10 - 9 - 7 - - - 6 - 7 -', '4 - - - - - - - - - - - . . . .'),
        chords: [[3, 5, 7], [3, 5, 7], [0, 2, 4], [-1, 1, 3]],
      },
    },
    order: 'AABB',
  },
  // funk: slap bass, clavinet stabs, brass riffs, swung hats
  jungle_funk: {
    style: 'funk',
    bpm: 108, root: 55, scale: DORIAN, bassWave: 'square', leadWave: 'sawtooth', bassInst: 'slap', leadInst: 'brass', leadVol: 0.12,
    chordInst: 'stab', chordRhythm: '..x..x.x..x...x.', kit: 'rock', swing: 0.14, delay: 0.15, reverb: 0.25,
    drums: { k: 'k..k....k.k.....', s: '....S..s.s..S...', h: 'hhhhhhhhhhhhhhhh', o: '..............o.' },
    parts: {
      A: {
        bass: L('0 . 0 7 . 0 3 4', '0 . 0 7 . 7 6 4', '3 . 3 10 . 3 2 3', '4 . 4 11 . 4 6 7'),
        lead: L('7 . 9 . 10 - 9 7 . . 4 . 6 - 7 .', '. . . . 7 . 9 10 11 . 10 . 9 . 7 .', '10 . 10 . 9 - 7 . 9 . 10 . 12 - - .', '11 - 10 - 9 - 7 - 6 - 7 - - - . .'),
        chords: [[0, 2, 4, 6], [0, 2, 4, 6], [3, 5, 7, 9], [4, 6, 8, 10]],
      },
      B: {
        bass: L('3 . 3 10 . 3 5 6', '3 . 3 10 . 10 9 6', '0 . 0 7 . 0 2 3', '4 . 4 . 4 . 6 7'),
        lead: L('14 - - - 12 - 10 . 12 . 14 . 12 . 10 .', '9 - - - 10 - 9 . 7 . . . . . . .', '7 . 9 . 10 . 12 . 14 - 12 . 10 - 9 .', '11 - - - - - - - 10 - 9 - 7 - - -'),
        chords: [[3, 5, 7, 9], [3, 5, 7, 9], [0, 2, 4, 6], [4, 6, 8, 10]],
      },
    },
    order: 'AABA',
  },

  // ------------------------------------------------------------------ desert
  // snake-charmer scale, buzzing saw lead with vibrato, darbuka toms
  desert: {
    style: 'arabic chiptune',
    bpm: 116, root: 40, scale: PHRYG_DOM, bassWave: 'triangle', leadWave: 'sawtooth', vibrato: 0.25, leadVol: 0.11,
    drums: { k: 'k.....k...k.....', s: '...s......s...s.', t: '..t...t.t...t.t.', h: '.h.h.h.h.h.h.h.h' },
    parts: {
      A: { bass: '0 . 0 . 1 . 0 . 0 . 0 . 6 . 5 .', lead: '7 - 8 7 6 - 5 4 5 - 4 1 0 - - . 7 - 8 7 6 - 5 6 7 - 9 8 7 - - .' },
      B: { bass: '3 . 3 . 4 . 3 . 1 . 1 . 0 . 0 .', lead: '11 - 10 9 8 - 7 8 9 - 8 7 6 - 5 . 4 - 5 6 7 - 6 5 4 - 1 1 0 - - .' },
    },
    order: 'AABB',
  },
  // surf rock: tremolo-picked twang guitar drenched in spring reverb
  desert_surf: {
    style: 'surf rock',
    bpm: 168, root: 52, scale: PHRYG_DOM, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'pluck', leadInst: 'twang', leadVol: 0.1,
    kit: 'rock', delay: 0.25, reverb: 0.6,
    drums: { k: 'k.k...k.k.k...k.', s: '....S.......S...', h: 'h.h.h.h.h.h.h.h.', t: '..............tt' },
    parts: {
      A: {
        bass: L('0 . 0 7 0 . 0 7', '1 . 1 8 1 . 1 8', '0 . 0 7 6 . 5 .', '0 . 0 . 0 7 0 .'),
        lead: L('7 7 7 7 8 8 8 8 9 9 9 9 10 10 10 10', '11 11 11 11 10 10 10 10 9 9 9 9 8 8 8 8', '7 7 7 7 8 8 8 8 9 9 8 8 7 7 6 6', '7 7 7 7 7 7 7 7 7 - - - . . . .'),
      },
      B: {
        bass: L('3 . 3 10 3 . 3 10', '2 . 2 9 2 . 2 9', '0 . 0 7 1 . 1 8', '1 . 1 . 0 7 0 .'),
        lead: L('11 11 11 11 11 11 11 11 12 12 12 12 11 11 10 10', '9 9 9 9 9 9 9 9 10 10 10 10 9 9 8 8', '7 7 7 7 8 8 8 8 9 9 9 9 10 10 9 9', '8 8 8 8 7 7 7 7 7 - - - . . . .'),
      },
    },
    order: 'AABA',
  },
  // stoner rock: slow fuzzy power-chord riff, ride cymbal, wailing lead
  desert_stoner: {
    style: 'stoner rock',
    bpm: 92, root: 50, scale: MINOR_PENT, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'dist', leadInst: 'guitar', leadVol: 0.09, guitarBass: true, vibrato: 0.3,
    kit: 'rock', delay: 0.3, reverb: 0.35,
    drums: { k: 'k.......k.k.....', s: '........S.......', r: 'r.r.r.r.r.r.r.r.' },
    parts: {
      A: {
        bass: L('0 - - 0 3 - 0 .', '4 - 3 - 0 - - .', '0 - - 0 3 - 5 -', '4 - 3 - -2 - -1 -'),
        lead: L('. . . . . . . . . . . . . . . .', '. . . . . . . . 7 - - - 8 - 7 -', '5 - - - - - - - . . . . . . . .', '9 - - - 8 - 7 - 8 - - - - - - -'),
      },
      B: {
        bass: L('3 - - - 3 - 4 3', '0 - - - - - - .', '3 - - - 3 - 4 5', '7 - 5 - 4 - 3 -'),
        lead: L('10 - - - - - 9 - 10 - 12 - 10 - 9 -', '7 - - - - - - - - - - - . . . .', '10 - - - - - 9 - 10 - 12 - 13 - 12 -', '10 - - - 9 - 7 - - - - - - - . .'),
      },
    },
    order: 'AABA',
  },

  // ------------------------------------------------------------------ arctic
  // slow dorian bells over a soft arpeggio
  snow: {
    style: 'ambient chiptune',
    bpm: 96, root: 50, scale: DORIAN, bassWave: 'triangle', leadWave: 'sine', leadInst: 'bell', leadRing: 6, leadOct: 24, leadVol: 0.2, arpWave: 'triangle', reverb: 0.5,
    drums: { k: 'k.......k.......', s: '........s.......', h: '..h...h...h...h.' },
    parts: {
      A: { bass: '0 - - - 5 - - - 3 - - - 4 - - -', lead: '7 . . . 9 . 8 . 7 . . . 4 . . . 5 . . . 7 . 6 . 4 . . . . . . .', chords: [[0, 2, 4], [5, 7, 9]] },
      B: { bass: '3 - - - 4 - - - 0 - - - 0 - - -', lead: '9 . . . 11 . 10 . 9 . 7 . 8 . . . 7 . . . 6 . 4 . 5 . . . . . . .', chords: [[3, 5, 7], [4, 6, 8]] },
    },
    order: 'AB',
  },
  // trance: offbeat bass, plucked triplet riff, supersaw anthem, four on the floor
  snow_trance: {
    style: 'trance',
    bpm: 138, root: 62, scale: MINOR, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'saw', leadInst: 'supersaw', leadVol: 0.1,
    chordInst: 'pad', kit: 'electro', delay: 0.45, reverb: 0.5,
    drums: { k: 'k...k...k...k...', c: '....c.......c...', h: 'hh.hhh.hhh.hhh.h', o: '..o...o...o...o.' },
    parts: {
      A: {
        bass: L(R('. 0', 4), R('. -2', 4), R('. -5', 4), R('. -1', 4)),
        lead: L('7 . . 9 . . 11 . . 9 . . 7 . 11 .', '5 . . 7 . . 9 . . 7 . . 5 . 9 .', '9 . . 11 . . 13 . . 11 . . 9 . 13 .', '6 . . 8 . . 10 . . 8 . . 6 . 10 .'),
        chords: [[0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10]],
      },
      B: {
        bass: L(R('. 0', 4), R('. -2', 4), R('. -5', 4), R('. -1', 4)),
        lead: L('14 - - - - - 12 - 11 - - - 9 - - -', '12 - - - - - 11 - 9 - - - 7 - - -', '9 - - - - - 11 - 13 - - - 11 - 9 -', '10 - - - - - - - 8 - - - - - - -'),
        chords: [[0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10]],
      },
    },
    order: 'AABB',
  },
  // epic orchestral: brass fanfare over strings, timpani and cymbal swells
  snow_epic: {
    style: 'orchestral',
    bpm: 84, root: 50, scale: HARM_MINOR, bassWave: 'triangle', leadWave: 'sawtooth', bassInst: 'sub', leadInst: 'brass', leadVol: 0.13,
    chordInst: 'strings', kit: 'orch', reverb: 0.7, delay: 0.1,
    drums: { k: 'k.......k.......', t: 't.......t..t.t..' },
    parts: {
      A: {
        bass: L('0 - - - - - - -', '-2 - - - - - - -', '-4 - - - - - - -', '-3 - - - - - - -'),
        lead: L('7 - - - - - - - 9 - 8 - 7 - 6 -', '5 - - - - - - - 4 - - - 2 - - -', '3 - - - 4 - 5 - 7 - - - 5 - 3 -', '4 - - - - - - - - - - - . . . .'),
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]],
      },
      B: {
        bass: L('-2 - - - - - - -', '-4 - - - - - - -', '0 - - - - - - -', '-3 - - - - - - -'),
        lead: L('11 - - - - - 10 - 9 - - - 8 - 7 -', '8 - - - - - 9 - 10 - - - 9 - 8 -', '7 - - - 8 - 9 - 10 - - - 9 - 8 -', '6 - - - - - - - 7 - - - - - - -'),
        chords: [[5, 7, 9], [3, 5, 7], [0, 2, 4], [4, 6, 8]],
      },
    },
    order: 'AB',
  },

  // ------------------------------------------------------------------ ruined city
  // driving rock beat, octave saw bass, now with a real guitar
  city: {
    style: 'rock chiptune',
    bpm: 142, root: 48, scale: MINOR, bassWave: 'sawtooth', leadWave: 'square', leadInst: 'guitar', leadVol: 0.08, kit: 'rock',
    drums: { k: 'k.....k.k.......', s: '....s.......s...', h: 'h.h.h.h.h.h.h.h.' },
    parts: {
      A: { bass: '0 7 0 7 -2 5 -2 5 -3 4 -3 4 -1 6 -1 6', lead: '4 . 4 . 5 4 . 2 - . 0 . 2 . 4 . 4 . 4 . 5 7 . 6 - . 5 . 4 . 2 .' },
      B: { bass: '-2 5 -2 5 -3 4 -3 4 0 7 0 7 -1 6 -1 6', lead: '7 - - 6 7 - 9 - 8 - 7 - 6 - 4 - 5 - - 4 5 - 7 - 6 - 5 - 4 - - .' },
    },
    order: 'AABA',
  },
  // thrash metal: palm-muted chugs, ride, shredding solo
  city_thrash: {
    style: 'thrash metal',
    bpm: 184, root: 52, scale: PHRYGIAN, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'dist', leadInst: 'guitar', leadVol: 0.085, guitarBass: true,
    kit: 'rock', delay: 0.15, reverb: 0.25,
    drums: { k: 'k.k.k.k.k.k.k.k.', s: '....S.......S...', r: 'r.r.r.r.r.r.r.r.' },
    parts: {
      A: {
        bass: L('0 0 0 0 1 0 0 0', '0 0 0 0 3 2 1 0', '0 0 0 0 1 0 0 0', '5 . 4 . 3 . 1 .'),
        lead: L('. . . . . . . . . . . . . . . .', '. . . . . . . . 7 - 8 - 7 - 5 -', '. . . . . . . . . . . . . . . .', '10 - 9 - 8 - 7 - 8 - 7 - 5 - 4 -'),
      },
      B: {
        bass: L('3 3 3 3 2 2 2 2', '1 1 1 1 0 0 0 0', '3 3 3 3 2 2 2 2', '1 1 1 1 1 . 1 .'),
        lead: L('7 8 10 8 7 8 10 11 12 11 10 8 7 8 10 8', '12 - - - 11 - 10 - 8 - 7 - 8 - - -', '7 8 10 8 7 8 10 11 12 11 10 11 12 14 15 14', '14 - - - - - - - - - - - . . . .'),
      },
    },
    order: 'AABA',
  },
  // darksynth: distorted bass pulse, 808 kick and clap, huge slow lead
  city_darksynth: {
    style: 'darksynth',
    bpm: 116, root: 57, scale: MINOR, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'dist', leadInst: 'supersaw', leadVol: 0.1,
    arpWave: 'square', kit: '808', delay: 0.4, reverb: 0.45,
    drums: { k: 'k.....k...k.....', c: '....c.......c...', h: 'h.h.h.h.hhh.h.h.', o: '..............o.' },
    parts: {
      A: {
        bass: L('0 . 0 0 . 0 0 7', '0 . 0 0 . 0 3 2', '-2 . -2 -2 . -2 -2 5', '-3 . -3 -3 . -3 -1 -3'),
        lead: L('7 - - - - - - - 6 - 7 - 9 - 7 -', '4 - - - - - - - - - - - . . . .', '5 - - - - - 7 - 9 - - - 11 - 12 -', '11 - - - - - - - 9 - - - - - - -'),
        chords: [[0, 2, 4], [0, 2, 4], [5, 7, 9], [4, 6, 8]],
      },
      B: {
        bass: L('-2 . -2 -2 . -2 -2 5', '-1 . -1 -1 . -1 -1 6', '0 . 0 0 . 0 0 7', '-3 . -3 -3 . -3 -3 4'),
        lead: L('12 - - - 11 - 9 - 11 - - - 12 - 13 -', '14 - - - - - - - 13 - - - 11 - - -', '12 - - - 11 - 9 - 7 - - - 9 - 11 -', '11 - - - - - - - - - - - . . . .'),
        chords: [[5, 7, 9], [6, 8, 10], [0, 2, 4], [4, 6, 8]],
      },
    },
    order: 'AABB',
  },

  // ------------------------------------------------------------------ factory
  // machine pulse bass and metal clanks
  industrial: {
    style: 'industrial chiptune',
    bpm: 128, root: 41, scale: MINOR, bassWave: 'square', leadWave: 'square', leadVol: 0.12,
    drums: { k: 'k...k...k...k...', s: '....s.......s...', m: '..m...m...m..m.m', h: '.h.h.h.h.h.h.h.h' },
    parts: {
      A: { bass: '0 0 0 0 0 0 3 2 0 0 0 0 5 5 4 3', lead: '7 . . 7 . . 6 . 5 . . . . . . . 7 . . 7 . . 8 . 9 . . . 8 . . .' },
      B: { bass: '5 5 5 5 4 4 4 4 3 3 3 3 2 2 1 1', lead: '9 - 8 - 7 - 5 - 6 - 5 - 4 - 2 - 3 - 4 - 5 - 7 - 6 - - - . . . .' },
    },
    order: 'AABB',
  },
  // acid techno: squelching 303-style 16th bassline, claps, open hats, chord stabs
  industrial_acid: {
    style: 'acid techno',
    bpm: 132, root: 57, scale: MINOR, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'acid', bassSteps: 16, leadInst: 'brass', leadVol: 0.1,
    chordInst: 'stab', chordRhythm: '..x.....x..x....', kit: 'electro', delay: 0.4, reverb: 0.3,
    drums: { k: 'k...k...k...k...', c: '....c.......c...', h: 'hh.hhh.hhh.hhh.h', o: '..o...o...o...o.', m: '.......m.......m' },
    parts: {
      A: {
        bass: L('0 0 7 0 . 0 3 0 0 . 7 0 5 . 3 .', '0 0 7 0 . 0 3 0 10 . 7 0 5 . 6 .', '-2 -2 5 -2 . -2 3 -2 0 . 7 0 5 . 3 .', '0 0 7 0 . 0 3 0 0 . 12 0 10 7 5 3'),
        lead: R('. . . . . . . . . . . . . . . .', 4),
        chords: [[0, 2, 4], [0, 2, 4], [5, 7, 9], [0, 2, 4]],
      },
      B: {
        bass: L('0 0 7 0 . 0 3 0 0 . 7 0 5 . 3 .', '-2 -2 5 -2 . -2 3 -2 -2 . 5 -2 3 . 2 .', '-4 -4 3 -4 . -4 1 -4 -4 . 3 -4 1 . 0 .', '-3 -3 4 -3 . -3 1 -3 4 . 7 4 9 7 4 2'),
        lead: L('7 - - - - - - - 9 - - - 7 - - -', '5 - - - - - - - 4 - - - 2 - - -', '3 - - - - - - - 4 - - - 5 - - -', '4 - - - - - - - - - - - . . . .'),
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]],
      },
    },
    order: 'AABB',
  },

  // ------------------------------------------------------------------ volcano
  // fast harmonic-minor metal riff with double kick, now on distorted guitars
  volcano: {
    style: 'speed metal chiptune',
    bpm: 154, root: 40, scale: HARM_MINOR, bassWave: 'sawtooth', leadWave: 'square', leadInst: 'guitar', leadVol: 0.08, guitarBass: true, kit: 'rock',
    drums: { k: 'k.k.k.k.k.k.kkk.', s: '....s.......s.s.', h: '..h...h...h...h.' },
    parts: {
      A: { bass: '0 0 . 0 1 . 0 . 0 0 . 0 6 5 4 3', lead: '7 8 7 6 7 . 4 . 5 6 5 4 5 . 2 . 3 4 3 2 3 . 0 . 1 2 3 4 6 . 7 .' },
      B: { bass: '5 5 . 5 4 . 4 . 3 3 . 3 6 . 6 .', lead: '7 - - . 9 - - . 10 - 9 8 9 - 7 . 8 - - . 6 - - . 7 - - - - - . .' },
    },
    order: 'AABA',
  },
  // doom metal: crushing slow riff, wailing lead, cavernous reverb
  volcano_doom: {
    style: 'doom metal',
    bpm: 72, root: 50, scale: PHRYGIAN, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'dist', leadInst: 'guitar', leadVol: 0.09, guitarBass: true, vibrato: 0.35,
    kit: 'rock', reverb: 0.55, delay: 0.25,
    drums: { k: 'k.......k.k.....', s: '........S.......', r: 'r...r...r...r...' },
    parts: {
      A: {
        bass: L('0 - - - - - - -', '1 - - - 0 - - -', '-2 - - - - - -1 -', '0 - - - - - - -'),
        lead: L('. . . . . . . . 7 - - - - - 8 -', '7 - - - - - - - 5 - - - 4 - - -', '3 - - - - - 4 - 5 - - - 4 - 3 -', '1 - - - - - - - 0 - - - - - - -'),
      },
      B: {
        bass: L('0 . 0 . 1 . 0 .', '3 - - - 1 - - -', '0 . 0 . 1 . 3 .', '4 - - - 3 - 1 -'),
        lead: L('10 - - - - - 9 - 8 - - - 7 - - -', '8 - - - - - 7 - 5 - - - 4 - - -', '7 - 8 - 10 - - - 11 - 10 - 8 - 7 -', '8 - - - - - - - 7 - - - - - - -'),
      },
    },
    order: 'AABB',
  },
  // power metal: galloping guitars, soaring neoclassical lead
  volcano_power: {
    style: 'power metal',
    bpm: 176, root: 52, scale: HARM_MINOR, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'dist', bassSteps: 16, leadInst: 'guitar', leadVol: 0.085, guitarBass: true,
    chordInst: 'strings', kit: 'rock', delay: 0.2, reverb: 0.35,
    drums: { k: 'k.k.k.k.k.k.k.k.', s: '....S.......S...', h: 'h.h.h.h.h.h.h.h.' },
    parts: {
      A: {
        bass: L(R('0 . 0 0', 4), R('-2 . -2 -2', 4), R('-4 . -4 -4', 4), R('-3 . -3 -3', 4)),
        lead: L('7 - - - 8 - 9 - 11 - - - 9 - 8 -', '7 - - - - - 6 - 7 - 8 - 9 - - -', '8 - - - 7 - 6 - 5 - - - 4 - 5 -', '6 - - - - - - - 4 - - - - - - -'),
        chords: [[0, 2, 4], [-2, 0, 2], [-4, -2, 0], [-3, -1, 1]],
      },
      B: {
        bass: L(R('0 . 0 0', 4), R('-2 . -2 -2', 4), R('-4 . -4 -4', 4), R('-3 . -3 -3', 4)),
        lead: L('11 10 9 10 11 10 9 10 11 12 13 12 11 10 9 8', '9 8 7 8 9 8 7 8 9 10 11 10 9 8 7 6', '7 6 5 6 7 6 5 6 7 8 9 8 7 6 5 4', '6 5 4 5 6 - - - 4 - - - - - - -'),
        chords: [[0, 2, 4], [-2, 0, 2], [-4, -2, 0], [-3, -1, 1]],
      },
    },
    order: 'AABB',
  },

  // ------------------------------------------------------------------ bosses
  boss: {
    style: 'metal chiptune',
    bpm: 160, root: 40, scale: PHRYGIAN, bassWave: 'sawtooth', leadWave: 'square', leadVol: 0.14, guitarBass: true, kit: 'rock',
    drums: { k: 'k.k.k.k.k.k.k.k.', s: '....s.......s...', h: 'hhhhhhhhhhhhhhhh' },
    parts: {
      A: { bass: '0 0 0 1 0 0 2 1 0 0 0 1 4 3 2 1', lead: '7 6 7 . 9 . 7 . 6 5 6 . 4 . 3 . 7 6 7 . 10 . 9 . 7 . 5 6 7 . . .' },
      B: { bass: '3 3 3 4 3 3 2 1 0 0 0 1 0 . 0 .', lead: '7 - 8 - 9 - 10 - 9 - 8 - 7 - 6 - 7 - 6 - 5 - 4 - 3 - 4 - 1 - 0 -' },
    },
    order: 'AAB',
  },
  boss2: {
    style: 'hard trance',
    bpm: 168, root: 36, scale: HARM_MINOR, bassWave: 'sawtooth', leadWave: 'sawtooth', leadInst: 'supersaw', leadVol: 0.09, leadOct: 24, kit: 'electro', delay: 0.3, reverb: 0.3,
    drums: { k: 'kk..k.k.kk..k.k.', s: '....s.......s..s', h: '..h...h...h...h.', m: '...............m' },
    parts: {
      A: { bass: '0 . 0 0 6 . 6 6 5 . 5 5 4 . 4 3', lead: '7 . 9 10 9 . 7 . 6 . 7 9 7 . 4 . 5 . 6 7 9 . 10 . 11 - 10 9 7 - - .' },
      B: { bass: '3 . 3 3 4 . 4 4 0 . 0 0 6 . 6 .', lead: '14 - 13 - 12 - 11 - 10 - 9 - 7 - 9 - 10 - 11 - 13 - 14 - - - - - . . . .' },
    },
    order: 'AB',
  },
  // symphonic metal: chugging guitars under strings and a brass theme
  boss3: {
    style: 'symphonic metal',
    bpm: 150, root: 50, scale: HARM_MINOR, bassWave: 'sawtooth', leadWave: 'sawtooth', bassInst: 'dist', leadInst: 'brass', leadVol: 0.13, guitarBass: true,
    chordInst: 'strings', kit: 'rock', delay: 0.15, reverb: 0.5,
    drums: { k: 'k.k.k.k.k.k.k.k.', s: '....S.......S...', h: 'h.h.h.h.h.h.h.h.' },
    parts: {
      A: {
        bass: L('0 0 0 0 0 0 1 0', '0 0 0 0 -2 -2 -1 -1', '0 0 0 0 0 0 1 0', '-3 -3 -3 -3 -3 -3 -1 -1'),
        lead: L('7 - - - 9 - 10 - 11 - - - 10 - 9 -', '8 - - - - - - - 7 - - - - - - -', '7 - - - 9 - 10 - 11 - - - 12 - 13 -', '14 - - - - - - - 13 - - - - - - -'),
        chords: [[0, 2, 4], [5, 7, 9], [0, 2, 4], [4, 6, 8]],
      },
      B: {
        bass: L(R('-2', 8), R('-4', 8), R('-3', 8), '-3 . -3 . -3 -3 -3 -3'),
        lead: L('12 - 11 - 10 - 9 - 10 - - - 7 - - -', '10 - 9 - 8 - 7 - 8 - - - 5 - - -', '8 - 7 - 6 - 5 - 6 - 7 - 8 - 9 -', '11 - - - - - - - - - - - . . . .'),
        chords: [[5, 7, 9], [3, 5, 7], [4, 6, 8], [4, 6, 8]],
      },
    },
    order: 'AABB',
  },
};

/** each place has several tracks in different styles; the playlist rotates through them */
export const PLAYLISTS: Record<string, string[]> = {
  menu: ['title', 'menu_synth', 'menu_anthem', 'menu'],
  jungle: ['jungle_dnb', 'jungle_funk', 'jungle'],
  desert: ['desert_surf', 'desert_stoner', 'desert'],
  snow: ['snow_trance', 'snow_epic', 'snow'],
  city: ['city_thrash', 'city_darksynth', 'city'],
  industrial: ['industrial_acid', 'city_darksynth', 'industrial'],
  volcano: ['volcano_power', 'volcano_doom', 'volcano'],
  boss: ['boss3', 'boss2', 'boss'],
};

/**
 * playlist for a level: the biome's (or the bosses') tracks, starting at a track picked
 * from the seed, so two levels in a row rarely open with the same song
 */
export function playlistFor(biomeId: string, isBoss: boolean, seed: number): string[] {
  const pool = PLAYLISTS[isBoss ? 'boss' : biomeId] ?? PLAYLISTS.city;
  const k = Math.abs(Math.floor(seed)) % pool.length;
  return [...pool.slice(k), ...pool.slice(0, k)];
}

/** menu playlist, starting somewhere random */
/** menu playlist: always opens with the title song, then the others from a random start */
export function menuPlaylist(): string[] {
  const rest = PLAYLISTS.menu.filter((n) => n !== 'title');
  const k = Math.floor(Math.random() * rest.length);
  return ['title', ...rest.slice(k), ...rest.slice(0, k)];
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

interface VoxNote {
  deg: number;
  syl: string;
  len: number;
}

interface Compiled {
  t: Track;
  parts: { bass: (Note | null)[]; lead: (Note | null)[]; chords?: number[][]; vox: (VoxNote | null)[]; drums?: Partial<Record<Lane, string>>; riser?: boolean }[];
}

/** '7/bal - 9/to .' -> sung note or null per token */
export function parseVox(s: string): (VoxNote | null)[] {
  const tok = s.trim().split(/\s+/);
  return tok.map((t, i) => {
    if (t === '.' || t === '-') return null;
    const [d, syl] = t.split('/');
    let len = 1;
    while (tok[i + len] === '-') len++;
    return { deg: Number(d), syl, len };
  });
}

function compile(t: Track): Compiled {
  const parts = [...t.order].map((k) => {
    const p = t.parts[k];
    return { bass: parse(p.bass), lead: parse(p.lead), chords: p.chords, vox: p.vox ? parseVox(p.vox) : [], drums: p.drums, riser: p.riser };
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

// ------------------------------------------------------------------ instruments
interface Osc {
  type: Wave;
  det?: number; // cents
  semi?: number;
  vol?: number;
}
interface Patch {
  oscs: Osc[];
  cutoff: number;
  q?: number;
  fenv?: number; // filter opens to cutoff * (1 + fenv) and closes over fdec seconds
  fdec?: number;
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  drive?: number;
  vib?: number; // semitones
  dly?: number; // echo send
  rev?: number; // reverb send
}

const saw = (det = 0, vol = 1, semi = 0): Osc => ({ type: 'sawtooth', det, vol, semi });
const sq = (det = 0, vol = 1, semi = 0): Osc => ({ type: 'square', det, vol, semi });
const sine = (det = 0, vol = 1, semi = 0): Osc => ({ type: 'sine', det, vol, semi });
const tri = (det = 0, vol = 1, semi = 0): Osc => ({ type: 'triangle', det, vol, semi });

const BASS: Record<BassInst, Patch> = {
  pulse: { oscs: [sq()], cutoff: 1400, d: 0.2, s: 0.8 },
  saw: { oscs: [saw(-6), saw(6)], cutoff: 900, q: 2, fenv: 1.5, fdec: 0.15, s: 0.8 },
  sub: { oscs: [sine(), tri(0, 0.4, 12)], cutoff: 900, a: 0.01, s: 1, r: 0.2 },
  reese: { oscs: [saw(-14), saw(14), sine(0, 0.6)], cutoff: 650, q: 3, drive: 1.6, a: 0.02, s: 1, r: 0.1 },
  acid: { oscs: [saw()], cutoff: 260, q: 16, fenv: 7, fdec: 0.16, drive: 2.2, d: 0.15, s: 0.6, r: 0.03, dly: 0.25 },
  slap: { oscs: [sq(0, 0.6), sine()], cutoff: 700, q: 4, fenv: 5, fdec: 0.06, a: 0.002, d: 0.12, s: 0.35, r: 0.05 },
  pluck: { oscs: [saw(), sq(0, 0.5, -12)], cutoff: 700, q: 3, fenv: 3, fdec: 0.1, d: 0.15, s: 0.4, r: 0.05, rev: 0.3 },
  dist: { oscs: [saw(), sq(5, 0.6, -12)], cutoff: 1200, q: 1, drive: 5, s: 0.9, r: 0.05 },
};

const LEAD: Record<LeadInst, Patch> = {
  chip: { oscs: [sq()], cutoff: 3200, d: 0.05, s: 1, dly: 0.15 },
  supersaw: { oscs: [saw(-18), saw(0, 0.8), saw(18)], cutoff: 5200, q: 0.8, a: 0.01, d: 0.3, s: 0.85, r: 0.25, dly: 0.35, rev: 0.4 },
  guitar: { oscs: [saw(0), sq(8, 0.7)], cutoff: 3000, q: 1.4, drive: 9, a: 0.004, d: 0.3, s: 0.85, r: 0.12, vib: 0.22, dly: 0.25, rev: 0.25 },
  twang: { oscs: [saw(0), saw(5, 0.5, 12)], cutoff: 2200, q: 2, fenv: 1.6, fdec: 0.12, a: 0.002, d: 0.25, s: 0.6, r: 0.08, dly: 0.3, rev: 0.6 },
  brass: { oscs: [saw(-7), saw(7)], cutoff: 1300, q: 1, fenv: 2.4, fdec: 0.14, a: 0.03, d: 0.25, s: 0.8, r: 0.12, vib: 0.15, rev: 0.4 },
  bell: { oscs: [sine(), sine(0, 0.35, 19), tri(0, 0.2, 12)], cutoff: 6000, a: 0.002, d: 1.2, s: 0, r: 0.6, rev: 0.6, dly: 0.25 },
  marimba: { oscs: [tri(), sine(0, 0.4, 12)], cutoff: 4000, a: 0.002, d: 0.18, s: 0, r: 0.05, rev: 0.25 },
  flute: { oscs: [sine(), tri(0, 0.25, 12)], cutoff: 3500, a: 0.05, d: 0.2, s: 0.85, r: 0.15, vib: 0.18, dly: 0.45, rev: 0.4 },
  pluck: { oscs: [sq(), saw(7, 0.5)], cutoff: 2600, q: 2, fenv: 2.5, fdec: 0.08, a: 0.002, d: 0.15, s: 0.2, r: 0.06, dly: 0.4, rev: 0.3 },
};

const CHORD: Record<ChordInst, Patch> = {
  pad: { oscs: [saw(-12), saw(12)], cutoff: 1500, q: 0.7, a: 0.25, d: 0.6, s: 0.8, r: 0.45, rev: 0.6, dly: 0.1 },
  strings: { oscs: [saw(-8), saw(8), tri(0, 0.3, 12)], cutoff: 2200, a: 0.35, d: 0.6, s: 0.85, r: 0.5, vib: 0.1, rev: 0.7 },
  stab: { oscs: [sq(), saw(6, 0.7)], cutoff: 2200, q: 1.5, fenv: 1.5, fdec: 0.08, a: 0.002, d: 0.12, s: 0, r: 0.05, dly: 0.35, rev: 0.25 },
};

/** the rhythm guitar that doubles the bass as power chords (all three notes share one amp) */
const RHYTHM_GTR: Patch = { oscs: [saw(-5)], cutoff: 2400, q: 1.2, drive: 14, a: 0.003, d: 0.25, s: 0.75, r: 0.06, rev: 0.15 };
/** root, fifth, octave */
const POWER_CHORD = [1, 1.4983, 2];

/** most voices sounding at once; extra pad / arp / stab notes are skipped beyond this */
const MAX_VOICES = 36;
/** scheduler: how far ahead notes are queued, and how often it runs (ms) */
const LOOKAHEAD = 0.4;
const TICK_MS = 25;

const curves = new Map<number, Float32Array>();
function driveCurve(k: number): Float32Array {
  let c = curves.get(k);
  if (!c) {
    c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    curves.set(k, c);
  }
  return c;
}

function impulse(c: BaseAudioContext, sec: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * sec);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return b;
}

/** effect chain of one song: dry + echo + reverb into a compressor */
interface Bus {
  master: GainNode;
  dry: GainNode;
  /** sidechain: pitched instruments go through this gain, which ducks on the beat */
  pump: GainNode;
  dlyIn: GainNode;
  revIn: GainNode;
  delay: DelayNode;
}

export class Music {
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private song: Compiled = compile(TRACKS.menu);
  private list: string[] = [];
  private idx = 0;
  private bus: Bus | null = null;
  private ctx: BaseAudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private current: string[] = [];
  /** end times of the voices still sounding (for the voice limit) */
  private ends: number[] = [];
  private sends = new Map<string, GainNode>();
  enabled = true;

  /** name of the track playing right now */
  get nowPlaying(): string {
    return this.list[this.idx] ?? '';
  }

  /** play one track or a playlist (each track plays its loops, then the next one starts) */
  play(name: string | string[]): void {
    this.stop();
    this.current = Array.isArray(name) ? name : [name];
    if (!this.enabled) return;
    const a = audioOut();
    if (!a) return;
    this.start(a.ctx, a.out, a.ctx.currentTime + 0.1);
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const c = this.ctx;
    if (!c || !this.bus) return;
    // the page stalled (busy frame, hidden tab): drop the missed steps instead of firing them
    // all at once, which sounds like a burst of noise
    if (this.nextTime < c.currentTime) this.skipTo(c.currentTime + 0.05);
    this.schedule(c.currentTime + LOOKAHEAD);
  }

  private skipTo(t: number): void {
    while (this.nextTime < t) {
      this.step++;
      this.nextTime += 60 / this.song.t.bpm / 4;
    }
  }

  /** set up the effect bus on any audio context (also used for offline rendering) */
  start(ctx: BaseAudioContext, out: AudioNode, at: number, list = this.current): void {
    this.ctx = ctx;
    this.list = list.filter((n) => TRACKS[n]);
    if (!this.list.length) this.list = ['city'];
    this.idx = 0;
    const master = ctx.createGain();
    master.gain.value = 0.2;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;
    comp.connect(master).connect(out);
    const dry = ctx.createGain();
    dry.connect(comp);
    const pump = ctx.createGain();
    pump.connect(dry);
    // echo: filtered feedback loop
    const dlyIn = ctx.createGain();
    const delay = ctx.createDelay(1.5);
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2800;
    dlyIn.connect(delay);
    delay.connect(dlp).connect(fb).connect(delay);
    const dlyOut = ctx.createGain();
    dlyOut.gain.value = 0.55;
    dlp.connect(dlyOut).connect(comp);
    // reverb
    const revIn = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 1.6);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.6;
    revIn.connect(conv).connect(revOut).connect(comp);
    this.bus = { master, dry, pump, dlyIn, revIn, delay };
    this.sends.clear();
    this.ends = [];
    this.load(at);
  }

  private load(at: number): void {
    const t = TRACKS[this.list[this.idx]];
    this.song = compile(t);
    this.step = 0;
    this.nextTime = at;
    const b = this.bus!;
    const stepDur = 60 / t.bpm / 4;
    b.delay.delayTime.setValueAtTime(Math.min(1.4, stepDur * 3), at); // dotted 8th echo
    b.dlyIn.gain.setValueAtTime(t.delay ?? 0.2, at);
    b.revIn.gain.setValueAtTime(t.reverb ?? 0.25, at);
  }

  /** restart whatever was playing last (after unmuting) */
  resume(): void {
    if (this.current.length) this.play(this.current);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.bus) {
      const g = this.bus.master;
      try {
        g.gain.setTargetAtTime(0, g.context.currentTime, 0.05);
        setTimeout(() => g.disconnect(), 400);
      } catch {
        /* ignore */
      }
    }
    this.bus = null;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stop();
    return this.enabled;
  }

  /** schedule all steps that start before `until` (seconds on the context clock) */
  schedule(until: number): void {
    const c = this.ctx;
    if (!c || !this.bus) return;
    while (this.nextTime < until) {
      const { t: tr, parts } = this.song;
      const stepDur = 60 / tr.bpm / 4;
      const partLen = parts[0].lead.length;
      // playlist: after the loops, the next track takes over seamlessly
      if (this.list.length > 1 && this.step >= partLen * parts.length * (tr.loops ?? 2)) {
        this.idx = (this.idx + 1) % this.list.length;
        this.load(this.nextTime + stepDur * 2);
        continue;
      }
      const s = this.step;
      const swing = s % 2 === 1 ? (tr.swing ?? 0) * stepDur : 0;
      const t = this.nextTime + swing;
      const part = parts[Math.floor(s / partLen) % parts.length];
      const ps = s % partLen;
      const bar = Math.floor(ps / 16);
      const chord = part.chords ? part.chords[bar % part.chords.length] : null;

      // bass (8ths or 16ths) + rhythm guitar power chords
      const b16 = tr.bassSteps === 16;
      if (b16 || ps % 2 === 0) {
        const b = part.bass[(b16 ? ps : ps / 2) % part.bass.length];
        if (b) {
          const len = stepDur * (b16 ? 1 : 2) * b.len;
          const note = tr.root - 12 + semis(tr.scale, b.deg);
          const patch = tr.bassInst ? BASS[tr.bassInst] : { ...BASS.pulse, oscs: [{ type: tr.bassWave }] };
          const vol = tr.bassInst ? 0.3 : tr.bassWave === 'sawtooth' ? 0.22 : 0.33;
          const accent = tr.bassInst === 'acid' && (ps % 3 === 0 || b.deg >= 7) ? 1.9 : 1;
          this.voice(patch, midi(note), t, len * 0.92, vol, accent);
          if (tr.guitarBass) {
            const palm = b.len === 1;
            const r = midi(note + 12);
            // palm-muted chugs only need root and fifth
            this.voice(RHYTHM_GTR, (palm ? POWER_CHORD.slice(0, 2) : POWER_CHORD).map((k) => r * k), t, palm ? stepDur * 0.8 : len * 0.95, 0.09, palm ? 0.4 : 1);
          }
        }
      }
      // lead (16ths)
      const l = part.lead[ps];
      if (l) {
        const dur = tr.leadRing ? stepDur * tr.leadRing : stepDur * l.len * 0.94;
        const f = midi(tr.root + (tr.leadOct ?? 12) + semis(tr.scale, l.deg));
        const patch = tr.leadInst ? LEAD[tr.leadInst] : { ...LEAD.chip, oscs: [{ type: tr.leadWave }] };
        this.voice(patch, f, t, dur, tr.leadVol ?? 0.18, 1, tr.vibrato);
      }
      // arpeggio: chord tones up and down, one bar per chord
      if (tr.arpWave && chord) {
        const seq = [0, 1, 2, 1];
        const deg = chord[seq[ps % 4] % chord.length] + (ps % 8 >= 4 ? tr.scale.length : 0);
        if (this.room(t)) this.voice({ oscs: [{ type: tr.arpWave }], cutoff: 2400, a: 0.003, d: 0.08, s: 0.3, r: 0.03, dly: 0.3 }, midi(tr.root + 12 + semis(tr.scale, deg)), t, stepDur * 0.8, 0.06);
      }
      // pads / strings: one chord per bar; stabs on their rhythm lane
      if (tr.chordInst && chord) {
        const p = CHORD[tr.chordInst];
        const freqs = chord.map((d) => midi(tr.root + semis(tr.scale, d)));
        const k = Math.sqrt(chord.length);
        if (tr.chordInst === 'stab') {
          const lane = tr.chordRhythm ?? '..x...x...x...x.';
          if (lane[ps % lane.length] !== '.' && this.room(t)) this.voice(p, freqs, t, stepDur * 1.2, 0.045 * k);
        } else if (ps % 16 === 0) {
          this.voice(p, freqs, t, stepDur * 16, (tr.chordInst === 'pad' ? 0.035 : 0.04) * k);
        }
      }
      // sung line
      const vx = part.vox[ps];
      if (vx) {
        const f = midi(tr.root + (tr.voxOct ?? 12) + semis(tr.scale, vx.deg));
        sing(c, { dry: this.bus.dry, rev: this.bus.revIn, dly: this.bus.dlyIn, noise: this.noiseBuf(c) }, vx.syl, f, t, stepDur * vx.len * 0.95, tr.voxVol ?? 0.3);
      }
      // build-up riser over the whole part
      if (part.riser && ps === 0) this.riser(c, t, stepDur * partLen);
      // drums
      const kit = tr.kit ?? 'chip';
      const d = part.drums ?? tr.drums;
      // sidechain: duck on every beat of a part with a kick
      if (tr.pump && ps % 4 === 0) {
        const g = this.bus.pump.gain;
        if (d.k) {
          g.setValueAtTime(0.25, t);
          g.linearRampToValueAtTime(1, t + stepDur * 2.6);
        } else g.setValueAtTime(1, t);
      }
      const hit = (lane?: string): number => {
        if (!lane) return 0;
        const ch = lane[s % lane.length];
        return !ch || ch === '.' ? 0 : ch === ch.toUpperCase() ? 1.35 : 1;
      };
      let v: number;
      if ((v = hit(d.k))) this.kick(c, t, kit, v);
      if ((v = hit(d.s))) this.snare(c, t, kit, v);
      if ((v = hit(d.c))) this.clap(c, t, v);
      if ((v = hit(d.h))) this.hat(c, t, kit, v);
      if ((v = hit(d.o))) this.openHat(c, t, v);
      if ((v = hit(d.r))) this.ride(c, t, v);
      if ((v = hit(d.t))) this.tom(c, t, kit, ps % 4 === 3 ? 160 : 210, v);
      if ((v = hit(d.m))) this.metal(c, t, v);
      if ((v = hit(d.x)) || (ps === 0 && (kit === 'rock' || kit === 'orch' || kit === 'breaks'))) this.crash(c, t, v || 1);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  /** is there room for one more low-priority voice at time t? */
  private room(t: number): boolean {
    this.ends = this.ends.filter((e) => e > t);
    return this.ends.length < MAX_VOICES;
  }

  /** shared send gain into the echo or reverb, one per send level */
  private send(kind: 'd' | 'r', level: number): GainNode {
    const key = kind + level;
    let g = this.sends.get(key);
    if (!g) {
      g = this.ctx!.createGain();
      g.gain.value = level;
      g.connect(kind === 'd' ? this.bus!.dlyIn : this.bus!.revIn);
      this.sends.set(key, g);
    }
    return g;
  }

  /** one synth note (or a chord sharing one filter and amp): oscillators -> (drive) -> filter -> envelope -> dry / echo / reverb */
  private voice(p: Patch, freq: number | number[], t: number, dur: number, vol: number, cutMul = 1, vibOverride?: number): void {
    const c = this.ctx!;
    const bus = this.bus!;
    const freqs = typeof freq === 'number' ? [freq] : freq;
    const f = freqs[0];
    const mix = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = p.q ?? 0.7;
    const cut = Math.min(16000, p.cutoff * cutMul);
    if (p.fenv) {
      // a ramp that ends: afterwards the filter is static again (a never-ending setTargetAtTime
      // keeps the filter recomputing every sample, which is expensive)
      lp.frequency.setValueAtTime(Math.min(16000, cut * (1 + p.fenv)), t);
      lp.frequency.exponentialRampToValueAtTime(cut, t + Math.min(dur, p.fdec ?? 0.1));
    } else lp.frequency.setValueAtTime(cut, t);
    if (p.drive) {
      const ws = c.createWaveShaper();
      ws.curve = driveCurve(p.drive);
      mix.connect(ws).connect(lp);
    } else mix.connect(lp);
    const amp = c.createGain();
    lp.connect(amp);
    amp.connect(this.song.t.pump ? bus.pump : bus.dry);
    if (p.dly) amp.connect(this.send('d', p.dly));
    if (p.rev) amp.connect(this.send('r', p.rev));
    const a = p.a ?? 0.005;
    const dc = p.d ?? 0.1;
    const sus = p.s ?? 0.8;
    const rel = p.r ?? 0.05;
    const hold = Math.max(a + 0.01, dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(vol, t + a);
    amp.gain.setTargetAtTime(Math.max(0.0001, vol * sus), t + a, dc / 3);
    amp.gain.setTargetAtTime(0.0001, t + hold, rel / 3);
    const end = t + hold + rel * 2 + 0.05;
    if (this.ends.length > 128) this.ends = this.ends.filter((e) => e > t);
    this.ends.push(end);
    const vib = vibOverride ?? p.vib ?? 0;
    let lfoGain: GainNode | null = null;
    if (vib > 0 && dur > 0.15) {
      const lfo = c.createOscillator();
      lfoGain = c.createGain();
      lfo.frequency.value = 5.5;
      lfoGain.gain.setValueAtTime(0, t);
      lfoGain.gain.linearRampToValueAtTime(f * (Math.pow(2, vib / 12) - 1), t + Math.min(0.25, dur * 0.5));
      lfo.connect(lfoGain);
      lfo.start(t);
      lfo.stop(end);
    }
    const n = p.oscs.length * freqs.length;
    for (const fr of freqs)
      for (const o of p.oscs) {
        const osc = c.createOscillator();
        osc.type = o.type;
        osc.frequency.value = fr * Math.pow(2, (o.semi ?? 0) / 12);
        if (o.det) osc.detune.value = o.det;
        if (lfoGain) lfoGain.connect(osc.frequency);
        // one gain node per oscillator only when its level differs
        if ((o.vol ?? 1) === 1) osc.connect(mix);
        else {
          const g = c.createGain();
          g.gain.value = o.vol!;
          osc.connect(g).connect(mix);
        }
        osc.start(t);
        osc.stop(end);
      }
    mix.gain.value = 1 / Math.sqrt(n);
  }

  // ---------------------------------------------------------------- drums
  private noiseBuf(c: BaseAudioContext): AudioBuffer {
    if (!this.noise || this.noise.sampleRate !== c.sampleRate) {
      const len = Math.floor(c.sampleRate * 1.5);
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  private noiseHit(c: BaseAudioContext, t: number, type: BiquadFilterType, freq: number, q: number, vol: number, dur: number, rev = 0): void {
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf(c);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.bus!.dry);
    if (rev) g.connect(this.send('r', rev));
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  private thump(c: BaseAudioContext, t: number, f0: number, f1: number, sweep: number, vol: number, dur: number, type: Wave = 'sine', rev = 0, drive = 0): void {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    if (drive) {
      const ws = c.createWaveShaper();
      ws.curve = driveCurve(drive);
      o.connect(ws).connect(g);
    } else o.connect(g);
    g.connect(this.bus!.dry);
    if (rev) g.connect(this.send('r', rev));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(c: BaseAudioContext, t: number, kit: Kit, v: number): void {
    if (kit === 'chip') return this.thump(c, t, 150, 40, 0.12, 0.5 * v, 0.14);
    if (kit === '808') return this.thump(c, t, 120, 46, 0.08, 0.85 * v, 0.6, 'sine', 0, 1.8);
    if (kit === 'orch') return this.thump(c, t, 80, 38, 0.2, 0.7 * v, 0.7, 'sine', 0.4);
    const electro = kit === 'electro';
    this.thump(c, t, electro ? 170 : 130, 44, electro ? 0.05 : 0.09, 0.85 * v, kit === 'breaks' ? 0.2 : 0.3);
    this.noiseHit(c, t, 'highpass', 2500, 0.7, 0.18 * v, 0.012);
  }

  private snare(c: BaseAudioContext, t: number, kit: Kit, v: number): void {
    if (kit === 'chip') {
      this.noiseHit(c, t, 'bandpass', 1800, 0.8, 0.35 * v, 0.12);
      this.thump(c, t, 200, 120, 0.06, 0.25 * v, 0.07, 'triangle');
      return;
    }
    if (kit === '808' || kit === 'electro') return this.clap(c, t, v);
    const tight = kit === 'breaks';
    this.noiseHit(c, t, 'bandpass', tight ? 2400 : 1900, 0.6, (tight ? 0.4 : 0.5) * v, tight ? 0.12 : 0.2, kit === 'orch' ? 0.5 : 0.35);
    this.thump(c, t, 210, 140, 0.05, 0.3 * v, 0.08, 'triangle');
  }

  /** noise sweeping up and getting louder, cut at the end (the drop comes right after) */
  private riser(c: BaseAudioContext, t: number, len: number): void {
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf(c);
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(8000, t + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0.005, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + len * 0.97);
    g.gain.linearRampToValueAtTime(0, t + len);
    s.connect(f).connect(g).connect(this.bus!.dry);
    g.connect(this.send('r', 0.4));
    s.start(t);
    s.stop(t + len + 0.02);
  }

  private clap(c: BaseAudioContext, t: number, v: number): void {
    for (let i = 0; i < 3; i++) this.noiseHit(c, t + i * 0.011, 'bandpass', 1300, 1.1, 0.35 * v, 0.02);
    this.noiseHit(c, t + 0.033, 'bandpass', 1300, 1.1, 0.3 * v, 0.16, 0.35);
  }

  private hat(c: BaseAudioContext, t: number, kit: Kit, v: number): void {
    this.noiseHit(c, t, 'highpass', 7000, 0.7, (kit === 'chip' ? 0.12 : 0.08) * v, 0.03);
  }

  private openHat(c: BaseAudioContext, t: number, v: number): void {
    this.noiseHit(c, t, 'highpass', 6500, 0.7, 0.08 * v, 0.22);
  }

  private ride(c: BaseAudioContext, t: number, v: number): void {
    this.noiseHit(c, t, 'bandpass', 6200, 2.5, 0.12 * v, 0.35, 0.2);
    this.thump(c, t, 1250, 1240, 0.3, 0.025 * v, 0.3, 'square');
  }

  private crash(c: BaseAudioContext, t: number, v: number): void {
    this.noiseHit(c, t, 'highpass', 3800, 0.6, 0.2 * v, 1.4, 0.45);
  }

  private tom(c: BaseAudioContext, t: number, kit: Kit, f0: number, v: number): void {
    // orchestral kit: timpani
    if (kit === 'orch') return this.thump(c, t, 95, 80, 0.4, 0.55 * v, 0.7, 'sine', 0.5);
    this.thump(c, t, f0, f0 * 0.45, 0.18, 0.4 * v, 0.2);
  }

  private metal(c: BaseAudioContext, t: number, v: number): void {
    this.noiseHit(c, t, 'bandpass', 3400, 9, 0.5 * v, 0.09, 0.2);
    this.thump(c, t, 820, 820, 0.05, 0.06 * v, 0.05, 'square');
  }
}

export const music = new Music();
