import { describe, expect, it } from 'vitest';
import { formatFrets, midiAt } from '@/core/guitar';
import { chordPcs, CHORD_TYPES } from '@/core/theory';
import { easierAlternatives, isHardChord, simplerChord } from './alternatives';
import { chordsOfType } from './catalog';

const kinds = (s: string) => easierAlternatives(s).map((a) => a.kind);

describe('easier alternatives', () => {
  it('offer the small F, Fmaj7 and a capo trick for F', () => {
    const alts = easierAlternatives('F');
    const shape = alts.find((a) => a.kind === 'easier-shape')!;
    expect(formatFrets(shape.voicing.frets)).toBe('xx3211');
    expect(shape.title).toBe('The small F');
    const sub = alts.find((a) => a.kind === 'substitute')!;
    expect(sub.symbol).toBe('Fmaj7');
    expect(formatFrets(sub.voicing.frets)).toBe('xx3210');
    expect(alts.length).toBeLessThanOrEqual(4);
  });

  it('offer Bm7, a capo shape and the power chord for Bm', () => {
    const alts = easierAlternatives('Bm');
    expect(alts.find((a) => a.kind === 'substitute')?.symbol).toBe('Bm7');
    const capo = alts.find((a) => a.kind === 'capo');
    expect(capo).toBeTruthy();
    expect(capo!.sounds).toBe('Bm');
    expect(capo!.capo).toBeGreaterThan(0);
  });

  it('make the capo trick sound the right chord', () => {
    for (const s of ['Bb', 'B', 'F#m', 'C#m', 'Bm', 'Eb', 'Ab']) {
      const capo = easierAlternatives(s).find((a) => a.kind === 'capo');
      if (!capo) continue;
      const sounding = capo.voicing.frets.flatMap((f, i) => (f === null ? [] : [midiAt({ string: 6 - i, fret: f }, { capo: capo.capo })]));
      const pcs = new Set(chordPcs(s));
      for (const m of sounding) expect(pcs.has(m % 12), `${s}: ${formatFrets(capo.voicing.frets)} capo ${capo.capo}`).toBe(true);
    }
  });

  it('simplify big jazz chords to the plain seventh', () => {
    expect(simplerChord('C13b9')).toBe('C7');
    expect(simplerChord('Am11')).toBe('Am7');
    expect(simplerChord('G/B')).toBe('G');
    expect(simplerChord('Cadd9')).toBe('C');
    expect(simplerChord('C')).toBeNull();
    const alt = easierAlternatives('C13b9').find((a) => a.kind === 'simplify');
    expect(alt?.symbol).toBe('C7');
  });

  it('leave easy chords alone', () => {
    for (const s of ['G', 'C', 'Em', 'Am', 'D', 'E']) {
      expect(isHardChord(s), s).toBe(false);
      expect(kinds(s), s).toEqual([]);
    }
    expect(isHardChord('F')).toBe(true);
    expect(isHardChord('Bb')).toBe(true);
  });

  it('only ever suggest playable shapes, for every type on a few roots', () => {
    for (const t of CHORD_TYPES) {
      for (const s of chordsOfType(t).filter((_x, i) => i % 4 === 1)) {
        for (const a of easierAlternatives(s)) {
          expect(a.voicing.difficulty, `${s} -> ${a.title}`).toBeLessThanOrEqual(9);
          expect(a.detail.length).toBeGreaterThan(30);
        }
      }
    }
  }, 60_000);
});
