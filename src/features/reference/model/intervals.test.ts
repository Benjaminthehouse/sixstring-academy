import { describe, expect, it } from 'vitest';
import { midiAt } from '@/core/guitar';
import { G_B_GAP, STRING_GAP, compoundRows, fretMoveWords, intervalById, intervalRows, intervalShape, intervalSlug } from './intervals';

describe('interval table', () => {
  const rows = intervalRows();

  // Hand-written truth: semitones, name, inversion, note above C.
  const TRUTH: Array<[string, number, string, string, string]> = [
    ['P1', 0, 'perfect unison', 'P8', 'C'],
    ['m2', 1, 'minor second', 'M7', 'Db'],
    ['M2', 2, 'major second', 'm7', 'D'],
    ['m3', 3, 'minor third', 'M6', 'Eb'],
    ['M3', 4, 'major third', 'm6', 'E'],
    ['P4', 5, 'perfect fourth', 'P5', 'F'],
    ['A4', 6, 'augmented fourth', 'd5', 'F#'],
    ['d5', 6, 'diminished fifth', 'A4', 'Gb'],
    ['P5', 7, 'perfect fifth', 'P4', 'G'],
    ['m6', 8, 'minor sixth', 'M3', 'Ab'],
    ['M6', 9, 'major sixth', 'm3', 'A'],
    ['m7', 10, 'minor seventh', 'M2', 'Bb'],
    ['M7', 11, 'major seventh', 'm2', 'B'],
    ['P8', 12, 'perfect octave', 'P1', 'C'],
  ];

  it('has every simple interval, both tritone spellings included, matching the truth table', () => {
    expect(rows.map((r) => [r.id, r.semitones, r.name, r.inversion, r.fromC])).toEqual(TRUTH);
  });

  it('inversions add up to nine and twelve half steps', () => {
    for (const r of rows) {
      const inv = rows.find((x) => x.id === r.inversion)!;
      expect(r.semitones + inv.semitones).toBe(12);
      expect(Number(r.id.slice(1)) + Number(inv.id.slice(1))).toBe(9);
    }
  });

  it('knows standard tuning: fourths, and a major third from G to B', () => {
    expect(STRING_GAP).toBe(5);
    expect(G_B_GAP).toBe(4);
    const p5 = rows.find((r) => r.id === 'P5')!;
    expect([p5.nextString, p5.gToB]).toEqual([2, 3]);
    const p4 = rows.find((r) => r.id === 'P4')!;
    expect([p4.nextString, p4.gToB]).toEqual([0, 1]);
  });

  it('draws shapes that really sound the interval on the neck', () => {
    for (const r of rows) {
      const shape = intervalShape(r.semitones);
      for (const p of shape.pairs) {
        expect(midiAt(p.upper) - midiAt(p.root)).toBe(r.semitones);
        expect(p.upper.string).toBe(p.root.string - 1);
        for (const f of [p.root.fret, p.upper.fret]) {
          expect(f).toBeGreaterThanOrEqual(shape.frets[0]);
          expect(f).toBeLessThanOrEqual(shape.frets[1]);
        }
      }
      expect(shape.frets[0]).toBeGreaterThanOrEqual(0);
      expect(shape.pairs[1].across).toBe('g-b');
      expect(shape.pairs[1].root.string).toBe(3);
    }
  });

  it('words fret moves', () => {
    expect(fretMoveWords(0)).toBe('same fret');
    expect(fretMoveWords(1)).toBe('1 fret up');
    expect(fretMoveWords(-3)).toBe('3 frets back');
  });

  it('lists compound intervals as an octave plus a simple one', () => {
    expect(compoundRows().map((r) => `${r.id} ${r.semitones} ${r.simple} ${r.fromC}`)).toEqual([
      'm9 13 m2 Db',
      'M9 14 M2 D',
      'm10 15 m3 Eb',
      'M10 16 M3 E',
      'P11 17 P4 F',
      'A11 18 A4 F#',
      'P12 19 P5 G',
      'm13 20 m6 Ab',
      'M13 21 M6 A',
      'P15 24 P8 C',
    ]);
  });

  it('has route-safe ids that keep major and minor apart', () => {
    expect(intervalSlug('M3')).toBe('maj3');
    expect(intervalSlug('m3')).toBe('m3');
    expect(intervalSlug('A4')).toBe('aug4');
    expect(intervalSlug('d5')).toBe('dim5');
    expect(intervalById('maj3')?.id).toBe('M3');
    expect(intervalById('m3')?.id).toBe('m3');
    expect(intervalById('maj9')?.id).toBe('M9');
    const slugs = [...rows, ...compoundRows()].map((r) => intervalSlug(r.id));
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+$/);
  });
});
