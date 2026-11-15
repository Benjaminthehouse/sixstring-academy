import { describe, expect, it } from 'vitest';
import { BACKING_STYLES } from '@/core/audio';
import { SCALES, chord, chordFitsScale, chroma, scaleNotes, scalesForChord } from '@/core/theory';
import { rootChoices } from './catalog';
import { VAMP_STYLES, droneFor, vampBars, vampFor } from './backing';

describe('vamps', () => {
  it('gives every scale in every root a vamp built from the scale’s own notes (the blues may rub)', () => {
    let vamps = 0;
    for (const s of SCALES) {
      for (const root of rootChoices(s.id)) {
        const v = vampFor(root.tonic, s.id);
        if (!v) continue;
        vamps++;
        expect(v.symbols.length).toBe(v.chords.length);
        expect(v.romans.length).toBe(v.chords.length);
        expect(VAMP_STYLES).toContain(v.style);
        expect(BACKING_STYLES[v.style].timeSignature).toEqual({ numerator: 4, denominator: 4 });
        // The vamp starts on the scale's root.
        expect(v.chords[0].root).toBe(chroma(root.tonic));
        if (v.loose) continue;
        const notes = scaleNotes(root.tonic, s.id);
        for (const symbol of v.symbols) {
          const c = chord(symbol);
          const listed = scalesForChord(c).some((m) => m.scale.id === s.id && chroma(m.tonic) === chroma(c.root) && m.fit !== 'colour');
          expect(chordFitsScale(c, notes) || listed, `${root.tonic} ${s.id}: ${symbol}`).toBe(true);
        }
      }
    }
    expect(vamps).toBeGreaterThan(SCALES.length * 12 * 0.9);
  });

  it('brings out each mode’s colour', () => {
    expect(vampFor('A', 'dorian')!.symbols).toEqual(['Am7', 'D7']);
    expect(vampFor('A', 'dorian')!.romans).toEqual(['i7', 'IV7']);
    expect(vampFor('G', 'mixolydian')!.symbols).toEqual(['G', 'F']);
    expect(vampFor('A', 'minor')!.symbols).toEqual(['Am', 'F', 'G', 'Am']);
    expect(vampFor('E', 'phrygian')!.symbols).toEqual(['Em', 'F']);
    expect(vampFor('F', 'lydian')!.symbols).toEqual(['F', 'G']);
    expect(vampFor('A', 'minor-blues')!.symbols).toHaveLength(12);
    expect(vampFor('A', 'minor-blues')!.style).toBe('blues-shuffle');
    expect(vampFor('Bb', 'minor')!.symbols).toEqual(['Bbm', 'Gb', 'Ab', 'Bbm']);
  });

  it('repeats whole vamps to cover the line', () => {
    const v = vampFor('A', 'dorian')!;
    expect(vampBars(v, 3)).toHaveLength(4);
    expect(vampBars(v, 1)).toHaveLength(2);
    expect(vampBars(vampFor('A', 'minor-blues')!, 3)).toHaveLength(12);
  });

  it('puts the drone on the root in the low register, with a fifth only when the scale has one', () => {
    expect(droneFor('A', 'minor')).toEqual({ midi: 45, fifth: true });
    expect(droneFor('E', 'major')).toEqual({ midi: 40, fifth: true });
    expect(droneFor('D#', 'minor').midi).toBe(51);
    expect(droneFor('B', 'locrian').fifth).toBe(false);
    for (const s of SCALES) for (const r of rootChoices(s.id)) expect(droneFor(r.tonic, s.id).midi % 12).toBe(chroma(r.tonic));
  });
});
