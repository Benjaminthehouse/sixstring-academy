import { describe, expect, it } from 'vitest';
import {
  formatChordDegrees, formatChordNotes, formatChords, formatKey, formatKeySignature, formatScaleDegrees, formatScaleName,
  formatScaleNotes,
} from './display';
import { CHORD_TYPES } from './chord';
import { ALL_KEYS } from './key';
import { formatDegree, formatNote, formatNotes } from './note';
import { SCALES } from './scale';

describe('naming systems for scales, chords and keys', () => {
  it('formats the notes of a scale in letters, solfège and German', () => {
    expect(formatScaleNotes('F#', 'major')).toEqual(['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯']);
    expect(formatScaleNotes('F#', 'major', { ascii: true })).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
    expect(formatScaleNotes('Bb', 'major', { system: 'solfege' })).toEqual(['Si♭', 'Do', 'Re', 'Mi♭', 'Fa', 'Sol', 'La']);
    // German: the fourth note of F major is B (our B flat), the seventh of C major is H.
    expect(formatScaleNotes('F', 'major', { system: 'german' })).toEqual(['F', 'G', 'A', 'B', 'C', 'D', 'E']);
    expect(formatScaleNotes('C', 'major', { system: 'german' })).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'H']);
    expect(formatScaleNotes('B', 'major', { system: 'german' })).toEqual(['H', 'C♯', 'D♯', 'E', 'F♯', 'G♯', 'A♯']);
    expect(formatScaleNotes('G#', 'harmonic-minor')).toEqual(['G♯', 'A♯', 'B', 'C♯', 'D♯', 'E', 'F𝄪']);
    expect(formatScaleNotes('G#', 'harmonic-minor', { doubles: 'repeat' })[6]).toBe('F♯♯');
    expect(formatScaleNotes('C', 'major', { closed: true })).toHaveLength(8);
    expect(formatScaleNotes('E2', 'minor-pentatonic', { octave: false })).toEqual(['E', 'G', 'A', 'B', 'D']);
    expect(formatScaleNotes('E2', 'minor-pentatonic')).toEqual(['E2', 'G2', 'A2', 'B2', 'D3']);
  });

  it('titles scales and writes their degrees', () => {
    expect(formatScaleName('F#', 'dorian')).toBe('F♯ Dorian');
    expect(formatScaleName('Bb', 'lydian-sharp-2')).toBe('B♭ Lydian ♯2');
    expect(formatScaleName('Eb', 'locrian-bb3-bb7', { system: 'solfege' })).toBe('Mi♭ Locrian 𝄫3 𝄫7');
    expect(formatScaleName('Bb', 'major', { system: 'german' })).toBe('B Major');
    expect(formatScaleName('B', 'minor', { system: 'german' })).toBe('H Natural minor');
    expect(formatScaleName('F#3', 'dorian-b2', { ascii: true })).toBe('F# Dorian b2');
    expect(formatScaleDegrees('locrian-bb7')).toEqual(['1', '♭2', '♭3', '4', '♭5', '♭6', '𝄫7']);
    expect(formatScaleDegrees('lydian', { ascii: true })).toEqual(['1', '2', '3', '#4', '5', '6', '7']);
    expect(formatDegree('#11')).toBe('♯11');
    expect(() => formatScaleName('C', 'nope')).toThrow(RangeError);
    // No ASCII accidental ever reaches the screen.
    for (const scale of SCALES) {
      for (const tonic of ['C#', 'Bb', 'F']) {
        expect(/[#]|\db|b\d/.test(formatScaleName(tonic, scale)), scale.id).toBe(false);
        for (const shown of [...formatScaleNotes(tonic, scale), ...formatScaleDegrees(scale)]) expect(/#|b/.test(shown), `${scale.id}: ${shown}`).toBe(false);
      }
    }
  });

  it('formats chord tones and chord degrees', () => {
    expect(formatChordNotes('Bbm7b5')).toEqual(['B♭', 'D♭', 'F♭', 'A♭']);
    expect(formatChordNotes('Bb7', { system: 'german' })).toEqual(['B', 'D', 'F', 'A♭']);
    expect(formatChordNotes('G7', { system: 'german' })).toEqual(['G', 'H', 'D', 'F']);
    expect(formatChordNotes('G7', { system: 'solfege' })).toEqual(['Sol', 'Si', 'Re', 'Fa']);
    expect(formatChordNotes('C/E', { withBass: true })).toEqual(['E', 'C', 'G']);
    expect(formatChordNotes('E7#9')).toEqual(['E', 'G♯', 'B', 'D', 'F𝄪']);
    expect(formatChordDegrees('C7#9')).toEqual(['1', '3', '5', '♭7', '♯9']);
    expect(formatChordDegrees('Cdim7')).toEqual(['1', '♭3', '♭5', '𝄫7']);
    for (const type of CHORD_TYPES) {
      for (const shown of [...formatChordNotes(`Eb${type.symbol}`), ...formatChordDegrees(`Eb${type.symbol}`)]) expect(/#|b/.test(shown), `${type.id}: ${shown}`).toBe(false);
    }
  });

  it('formats keys, signatures and chord charts', () => {
    expect(formatKey('Bb minor')).toBe('B♭ minor');
    expect(formatKey('Bb minor', { short: true })).toBe('B♭m');
    expect(formatKey('F# major', { short: true })).toBe('F♯');
    expect(formatKey('Bb major', { system: 'german' })).toBe('B major');
    expect(formatKey('B minor', { system: 'german', short: true })).toBe('Hm');
    expect(formatKey('F# minor', { system: 'solfege' })).toBe('Fa♯ minor');
    expect(formatKey({ tonic: 'Eb', mode: 'major' }, { ascii: true })).toBe('Eb major');
    expect(formatKeySignature('A major')).toEqual(['F♯', 'C♯', 'G♯']);
    expect(formatKeySignature('Eb major', { system: 'german' })).toEqual(['B', 'E♭', 'A♭']);
    expect(formatKeySignature('C')).toEqual([]);
    for (const k of ALL_KEYS) expect(formatKey(k, { ascii: true })).toBe(k.name);
    expect(formatChords(['C', 'N.C.', 'F#m7b5', '???', 'Bb/D'])).toEqual(['C', 'N.C.', 'F♯m7♭5', '???', 'B♭/D']);
    expect(formatChords(['Bb', 'B7', 'n.c.'], { system: 'german' })).toEqual(['B', 'H7', 'N.C.']);
    expect(formatChords(['Cmaj7', 'Bm7b5'], { jazz: true })).toEqual(['C△7', 'Bø7']);
    expect(formatNotes(['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], { system: 'german', octave: false })).toEqual(['E', 'A', 'D', 'G', 'H', 'E']);
    expect(formatNotes([])).toEqual([]);
    expect(formatNote('Bb', { system: 'german' })).toBe('B');
  });
});
