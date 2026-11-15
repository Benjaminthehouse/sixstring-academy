import { describe, expect, it } from 'vitest';
import { chord } from './chord';
import { chordToneMap, hasTone, scaleToneMap, spellWith, toneAt } from './lookup';
import { pitchClassMask } from './note';
import { scaleNotes } from './scale';

describe('scaleToneMap', () => {
  it('answers the fretboard question for every pitch class at once', () => {
    const map = scaleToneMap('A', 'minor-pentatonic');
    expect(map).toMatchObject({ kind: 'scale', root: 'A', rootPc: 9, bassPc: null });
    expect(map.tones.map((t) => `${t.note} ${t.degree}`)).toEqual(['A 1', 'C b3', 'D 4', 'E 5', 'G b7']);
    expect(map.mask).toBe(pitchClassMask(['A', 'C', 'D', 'E', 'G']));
    // Low E string, frets 0 to 12, in A minor pentatonic.
    const frets = [...Array(13).keys()].map((fret) => toneAt(map, 40 + fret));
    expect(frets.map((t) => (t.member ? t.degree : '.')).join(' ')).toBe('5 . . b7 . 1 . . b3 . 4 . 5');
    expect(frets.map((t) => t.note).join(' ')).toBe('E F F# G G# A Bb B C C# D D# E');
    expect(toneAt(map, 45)).toMatchObject({ pc: 9, note: 'A', degree: '1', interval: 'P1', semitones: 0, member: true, index: 0 });
    expect(toneAt(map, 46)).toMatchObject({ pc: 10, note: 'Bb', degree: 'b2', member: false, index: -1 });
    expect(hasTone(map, 48)).toBe(true);
    expect(hasTone(map, 49)).toBe(false);
    expect(hasTone(map, -3)).toBe(true);
  });

  it('spells with the scale: E# in F# major, never a double flat for an outside note', () => {
    const fSharp = scaleToneMap('F#', 'major');
    expect(spellWith(fSharp, 65)).toBe('E#4');
    expect(spellWith(fSharp, 65, { octave: false })).toBe('E#');
    expect(spellWith(fSharp, 60)).toBe('B#3');
    expect(spellWith(scaleToneMap('Cb', 'major'), 59)).toBe('Cb4');
    expect(spellWith(scaleToneMap('G#', 'harmonic-minor'), 67)).toBe('F##4');
    const gFlat = scaleToneMap('Gb', 'major');
    expect(gFlat.byPc.map((t) => t.note)).toEqual(['C', 'Db', 'D', 'Eb', 'Fb', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'Cb']);
    expect(gFlat.byPc.map((t) => t.degree)).toEqual(['#4', '5', 'b6', '6', 'b7', '7', '1', 'b2', '2', 'b3', '3', '4']);
    expect(scaleToneMap('C', 'chromatic').tones).toHaveLength(12);
  });

  it('is cached, frozen, and accepts names and aliases', () => {
    const a = scaleToneMap('Bb', 'dorian');
    expect(scaleToneMap('Bb', 'Dorian mode')).toBe(a);
    expect(scaleToneMap('Bb4', 'dorian')).toBe(a);
    expect(scaleToneMap('A#', 'dorian')).not.toBe(a);
    expect(Object.isFrozen(a) && Object.isFrozen(a.byPc) && Object.isFrozen(a.tones) && Object.isFrozen(a.byPc[0])).toBe(true);
    expect(() => scaleToneMap('C', 'no such scale')).toThrow(RangeError);
    expect(() => scaleToneMap('X', 'major')).toThrow(RangeError);
    // Reading it is a single index: a whole neck costs nothing.
    const started = Date.now();
    let members = 0;
    for (let i = 0; i < 200_000; i++) if (scaleToneMap('A', 'minor').byPc[i % 12].member) members++;
    expect(members).toBeGreaterThan(100_000);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe('chordToneMap', () => {
  it('labels chord tones with their chord degrees and everything else against the root', () => {
    const map = chordToneMap('E7#9');
    expect(map.tones.map((t) => `${t.note} ${t.degree}`)).toEqual(['E 1', 'G# 3', 'B 5', 'D b7', 'F## #9']);
    expect(toneAt(map, 67)).toMatchObject({ note: 'F##', degree: '#9', interval: 'A9', semitones: 3, member: true, index: 4 });
    expect(spellWith(map, 67)).toBe('F##4');
    expect(toneAt(map, 65)).toMatchObject({ note: 'F', degree: 'b2', member: false });
    expect(map.byPc.filter((t) => t.member).map((t) => t.pc).sort((a, b) => a - b)).toEqual([2, 4, 7, 8, 11]);
    // The open E7#9 "Hendrix" shape: E2 E3 G#3 D4 G4.
    expect([40, 52, 56, 62, 67].map((m) => toneAt(map, m).degree)).toEqual(['1', '1', '3', 'b7', '#9']);
  });

  it('reports a slash bass without pretending it is a chord tone', () => {
    const overBb = chordToneMap('C/Bb');
    expect(overBb.bassPc).toBe(10);
    expect(hasTone(overBb, 10)).toBe(false);
    expect(overBb.tones.map((t) => t.note)).toEqual(['C', 'E', 'G']);
    const firstInversion = chordToneMap('C/E');
    expect(firstInversion.bassPc).toBe(4);
    expect(hasTone(firstInversion, 4)).toBe(true);
    expect(chordToneMap('C').bassPc).toBeNull();
    expect(chordToneMap(chord('C/E'))).toBe(firstInversion);
    expect(chordToneMap('C/E')).not.toBe(chordToneMap('C'));
  });

  it('handles chords the catalog does not hold', () => {
    const custom = chordToneMap('C7no5');
    expect(custom.tones.map((t) => t.degree)).toEqual(['1', '3', 'b7']);
    expect(hasTone(custom, 7)).toBe(false);
    expect(scaleNotes('C', 'major').every((n) => chordToneMap('C13').byPc.some((t) => t.note === n))).toBe(true);
  });
});
