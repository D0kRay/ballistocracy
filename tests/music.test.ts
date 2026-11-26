import { describe, expect, it } from 'vitest';
import { PLAYLISTS, TRACKS, playlistFor } from '../src/audio/Music';
import { BIOMES } from '../src/world/biomes';

const toks = (s: string) => s.trim().split(/\s+/);

describe('soundtracks', () => {
  it('every biome has a playlist of at least three tracks in different styles', () => {
    for (const b of BIOMES) {
      const list = playlistFor(b.id, false, 3);
      expect(list.length).toBeGreaterThanOrEqual(3);
      for (const n of list) expect(TRACKS[n], n).toBeTruthy();
      expect(new Set(list.map((n) => TRACKS[n].style)).size).toBe(list.length);
    }
    for (const [name, list] of Object.entries(PLAYLISTS)) for (const n of list) expect(TRACKS[n], `${name}: ${n}`).toBeTruthy();
  });

  it('levels open with different tracks, bosses have their own playlist', () => {
    const openers = new Set<string>();
    for (let s = 0; s < 6; s++) openers.add(playlistFor('jungle', false, s)[0]);
    expect(openers.size).toBe(PLAYLISTS.jungle.length);
    for (const n of playlistFor('jungle', true, 1)) expect(PLAYLISTS.boss).toContain(n);
  });

  it('every track is used in some playlist', () => {
    const used = new Set(Object.values(PLAYLISTS).flat());
    for (const n of Object.keys(TRACKS)) expect(used, n).toContain(n);
  });

  for (const [name, t] of Object.entries(TRACKS)) {
    it(`${name}: patterns line up`, () => {
      let len = -1;
      for (const k of t.order) {
        const p = t.parts[k];
        expect(p, `part ${k}`).toBeTruthy();
        const lead = toks(p.lead);
        const bass = toks(p.bass);
        if (len < 0) len = lead.length;
        expect(lead.length).toBe(len);
        expect(lead.length % 16).toBe(0);
        expect(bass.length * (t.bassSteps === 16 ? 1 : 2), `${name} ${k} bass length`).toBe(lead.length);
        for (const x of [...lead, ...bass]) expect(x === '.' || x === '-' || Number.isFinite(Number(x)), `${name} token ${x}`).toBe(true);
        expect(lead[0] === '-' || bass[0] === '-').toBe(false);
        if (p.chords) expect(p.chords.length).toBeGreaterThan(0);
      }
      for (const lane of Object.values(t.drums)) expect([16, 32]).toContain(lane!.length);
      if (t.chordRhythm) expect(t.chordRhythm.length).toBe(16);
      if (t.chordInst || t.arpWave) expect(Object.values(t.parts).every((p) => p.chords?.length)).toBe(true);
    });
  }
});
