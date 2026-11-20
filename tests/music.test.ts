import { describe, expect, it } from 'vitest';
import { TRACKS, trackFor } from '../src/audio/Music';
import { BIOMES } from '../src/world/biomes';

const toks = (s: string) => s.trim().split(/\s+/);

describe('soundtracks', () => {
  it('every biome has its own track and bosses alternate', () => {
    for (const b of BIOMES) expect(trackFor(b.id, false, 3)).toBe(b.id);
    expect(trackFor('jungle', true, 5)).not.toBe(trackFor('jungle', true, 10));
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
        expect(bass.length * 2).toBe(lead.length);
        for (const x of [...lead, ...bass]) expect(x === '.' || x === '-' || Number.isFinite(Number(x)), `${name} token ${x}`).toBe(true);
        expect(lead[0] === '-' || bass[0] === '-').toBe(false);
      }
      for (const lane of Object.values(t.drums)) expect(lane!.length).toBe(16);
    });
  }
});
