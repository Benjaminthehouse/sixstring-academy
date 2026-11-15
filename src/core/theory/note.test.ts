import { describe, expect, it } from 'vitest';
import {
  chroma, enharmonicEqual, enharmonics, fifthsOf, formatAccidental, formatNote, germanNoteName, isNote,
  midiToNote, note, noteFromFifths, noteFromSlug, noteName, noteSlug, noteToMidi, parseNote, pcName, pcToNote,
  prettyAccidentals, simplifyNote, spellPc, withOctaveFor,
} from './note';

describe('parseNote', () => {
  it('parses letters, accidentals and octaves', () => {
    expect(parseNote('C')).toMatchObject({ name: 'C', letter: 'C', step: 0, alt: 0, octave: null, chroma: 0, midi: null });
    expect(parseNote('F#4')).toMatchObject({ name: 'F#4', pcName: 'F#', alt: 1, octave: 4, chroma: 6, midi: 66 });
    expect(parseNote('Bb')).toMatchObject({ name: 'Bb', alt: -1, chroma: 10, accidental: 'b' });
    expect(parseNote('E#')).toMatchObject({ chroma: 5, alt: 1 });
    expect(parseNote('Cb')).toMatchObject({ chroma: 11, alt: -1 });
    expect(parseNote('F##')).toMatchObject({ chroma: 7, alt: 2, accidental: '##' });
    expect(parseNote('Bbb')).toMatchObject({ chroma: 9, alt: -2 });
  });

  it('accepts music symbols, x for double sharp, and lowercase letters', () => {
    expect(note('F♯').name).toBe('F#');
    expect(note('B♭3').name).toBe('Bb3');
    expect(note('Fx4').name).toBe('F##4');
    expect(note('C𝄪').name).toBe('C##');
    expect(note('D𝄫').name).toBe('Dbb');
    expect(note('C♮').name).toBe('C');
    expect(note('eb').name).toBe('Eb');
    expect(note('bb').name).toBe('Bb');
    expect(note('b').name).toBe('B');
  });

  it('rejects things that are not notes', () => {
    for (const bad of ['', 'H', 'Cm', 'C#####', 'C4.5', '4', 'Do', 'C #']) expect(parseNote(bad), bad).toBeNull();
    expect(isNote('G#')).toBe(true);
    expect(isNote('G#m')).toBe(false);
    expect(() => note('nope')).toThrow(RangeError);
  });

  it('puts the octave break at C, by letter', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('B3')).toBe(59);
    expect(noteToMidi('Cb4')).toBe(59);
    expect(noteToMidi('B#3')).toBe(60);
    expect(noteToMidi('C-1')).toBe(0);
    expect(noteToMidi('E2')).toBe(40);
    expect(noteToMidi('E')).toBe(64);
    expect(noteToMidi('E', 2)).toBe(40);
  });

  it('maps the guitar open strings', () => {
    expect(['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].map((n) => noteToMidi(n))).toEqual([40, 45, 50, 55, 59, 64]);
  });
});

describe('pitch classes and MIDI', () => {
  it('reads the pitch class of names and MIDI numbers', () => {
    expect(['C', 'B#', 'Dbb'].map((n) => chroma(n))).toEqual([0, 0, 0]);
    expect(chroma(61)).toBe(1);
    expect(chroma(-1)).toBe(11);
    expect(pcName('F#4')).toBe('F#');
  });

  it('names pitch classes three ways', () => {
    const all = [...Array(12).keys()];
    expect(all.map((pc) => pcToNote(pc, 'sharps'))).toEqual(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
    expect(all.map((pc) => pcToNote(pc, 'flats'))).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']);
    expect(all.map((pc) => pcToNote(pc))).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
  });

  it('round-trips every MIDI number', () => {
    for (let midi = 0; midi <= 127; midi++) {
      for (const prefer of ['sharps', 'flats', 'auto'] as const) {
        expect(noteToMidi(midiToNote(midi, { prefer }))).toBe(midi);
      }
    }
    expect(midiToNote(60)).toBe('C4');
    expect(midiToNote(61, { prefer: 'sharps' })).toBe('C#4');
    expect(midiToNote(61, { octave: false })).toBe('Db');
    expect(midiToNote(40)).toBe('E2');
  });

  it('attaches the right octave to a spelled pitch class', () => {
    expect(withOctaveFor('B#', 60)).toBe('B#3');
    expect(withOctaveFor('Cb', 59)).toBe('Cb4');
    expect(withOctaveFor('C', 60)).toBe('C4');
    expect(withOctaveFor('Dbb', 60)).toBe('Dbb4');
    expect(() => withOctaveFor('D', 60)).toThrow(RangeError);
  });
});

describe('line of fifths', () => {
  it('maps positions to names and back', () => {
    const line = ['Fb', 'Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#', 'F##'];
    line.forEach((name, i) => {
      expect(noteFromFifths(i - 8)).toBe(name);
      expect(fifthsOf(name)).toBe(i - 8);
    });
  });

  it('spells the harmonic chromatic scale around a centre', () => {
    const chromatic = (center: number) => [...Array(12).keys()].map((i) => spellPc(chroma(noteFromFifths(center)) + i, center));
    expect(chromatic(0)).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
    expect(chromatic(3)).toEqual(['A', 'Bb', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']);
    expect(chromatic(-3)).toEqual(['Eb', 'Fb', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'Cb', 'C', 'Db', 'D']);
    expect(chromatic(6)).toEqual(['F#', 'G', 'G#', 'A', 'A#', 'B', 'B#', 'C#', 'D', 'D#', 'E', 'E#']);
  });
});

describe('enharmonics', () => {
  it('lists other spellings, simplest first', () => {
    expect(enharmonics('C#')).toEqual(['Db', 'B##']);
    expect(enharmonics('F')).toEqual(['E#', 'Gbb']);
    expect(enharmonics('B')).toEqual(['Cb', 'A##']);
    expect(enharmonics('G#')).toEqual(['Ab']);
    expect(enharmonics('C4')).toEqual(['B#3', 'Dbb4']);
    expect(enharmonics('Cb4')).toEqual(['B3', 'A##3']);
  });

  it('simplifies awkward spellings and leaves ordinary ones alone', () => {
    const cases: Array<[string, string]> = [
      ['E#', 'F'], ['B#', 'C'], ['Cb', 'B'], ['Fb', 'E'], ['F##', 'G'], ['C##', 'D'], ['Bbb', 'A'], ['Dbb', 'C'],
      ['G##', 'A'], ['Abb', 'G'], ['E##', 'F#'], ['Cbb', 'Bb'], ['C#', 'C#'], ['Db', 'Db'], ['G', 'G'],
      ['B#3', 'C4'], ['Cb4', 'B3'], ['F##4', 'G4'], ['Dbb4', 'C4'],
    ];
    for (const [input, expected] of cases) expect(simplifyNote(input), input).toBe(expected);
  });

  it('compares pitches enharmonically', () => {
    expect(enharmonicEqual('C#', 'Db')).toBe(true);
    expect(enharmonicEqual('E#', 'F')).toBe(true);
    expect(enharmonicEqual('C#4', 'Db4')).toBe(true);
    expect(enharmonicEqual('C#4', 'Db5')).toBe(false);
    expect(enharmonicEqual('C#4', 'Db')).toBe(true);
    expect(enharmonicEqual('C', 'D')).toBe(false);
  });

  it('keeps the pitch when simplifying or listing enharmonics', () => {
    for (const letter of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
      for (const acc of ['bb', 'b', '', '#', '##']) {
        const name = `${letter}${acc}4`;
        expect(noteToMidi(simplifyNote(name)), name).toBe(noteToMidi(name));
        for (const other of enharmonics(name)) expect(noteToMidi(other), `${name} ~ ${other}`).toBe(noteToMidi(name));
      }
    }
  });
});

describe('formatting', () => {
  it('uses real music symbols', () => {
    expect(formatNote('F#')).toBe('F♯');
    expect(formatNote('Bb3')).toBe('B♭3');
    expect(formatNote('F##')).toBe('F𝄪');
    expect(formatNote('Bbb')).toBe('B𝄫');
    expect(formatNote('C')).toBe('C');
    expect(formatNote('C', { natural: true })).toBe('C♮');
    expect(formatNote('Bb3', { octave: false })).toBe('B♭');
    expect(formatNote('F##', { doubles: 'repeat' })).toBe('F♯♯');
    expect(formatNote('Bb', { ascii: true })).toBe('Bb');
    expect(formatAccidental(3)).toBe('♯𝄪');
    expect(formatAccidental(-2)).toBe('𝄫');
    expect(formatAccidental(0)).toBe('');
  });

  it('writes fixed-do solfège', () => {
    const names = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((n) => formatNote(n, { system: 'solfege' }));
    expect(names).toEqual(['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si']);
    expect(formatNote('F#4', { system: 'solfege' })).toBe('Fa♯4');
    expect(formatNote('Bb', { system: 'solfege' })).toBe('Si♭');
  });

  it('writes German names: H is B natural, B is B flat', () => {
    expect(formatNote('B', { system: 'german' })).toBe('H');
    expect(formatNote('Bb', { system: 'german' })).toBe('B');
    expect(formatNote('Bb2', { system: 'german' })).toBe('B2');
    expect(formatNote('B#', { system: 'german' })).toBe('H♯');
    expect(formatNote('Bbb', { system: 'german' })).toBe('H𝄫');
    expect(formatNote('F#', { system: 'german' })).toBe('F♯');
    expect(formatNote('Eb', { system: 'german', ascii: true })).toBe('Eb');
    expect(formatNote('A', { system: 'german' })).toBe('A');
  });

  it('writes traditional German suffix names', () => {
    const cases: Array<[string, string]> = [
      ['C', 'C'], ['C#', 'Cis'], ['Db', 'Des'], ['Eb', 'Es'], ['E#', 'Eis'], ['F#', 'Fis'], ['Gb', 'Ges'], ['Ab', 'As'],
      ['A#', 'Ais'], ['Bb', 'B'], ['B', 'H'], ['B#', 'His'], ['Cb', 'Ces'], ['Bbb', 'Heses'], ['F##', 'Fisis'],
      ['Ebb', 'Eses'], ['Abb', 'Asas'], ['Dbb', 'Deses'], ['F#3', 'Fis3'],
    ];
    for (const [input, expected] of cases) expect(germanNoteName(input), input).toBe(expected);
  });

  it('prettifies degree and alteration text without touching words', () => {
    expect(prettyAccidentals('1 b3 5 bb7')).toBe('1 ♭3 5 𝄫7');
    expect(prettyAccidentals('Lydian #2 #6')).toBe('Lydian ♯2 ♯6');
    expect(prettyAccidentals('m7b5')).toBe('m7♭5');
    expect(prettyAccidentals('7#9#5')).toBe('7♯9♯5');
    expect(prettyAccidentals('Dorian b2')).toBe('Dorian ♭2');
    expect(prettyAccidentals('Bebop dominant')).toBe('Bebop dominant');
    expect(prettyAccidentals('b9')).toBe('♭9');
  });

  it('makes route-safe slugs that match the router', () => {
    expect(noteSlug('F#')).toBe('f-sharp');
    expect(noteSlug('Bb')).toBe('bb');
    expect(noteSlug('C')).toBe('c');
    expect(noteSlug('Eb3')).toBe('eb3');
    for (const name of ['C', 'C#', 'Db', 'F##', 'Bbb', 'B', 'Bb', 'E4', 'G#2']) {
      expect(noteFromSlug(noteSlug(name)), name).toBe(name);
      expect(noteSlug(name)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    expect(noteFromSlug('b-flat')).toBe('Bb');
    expect(noteFromSlug('c-sharp')).toBe('C#');
    expect(noteFromSlug('zz')).toBeNull();
  });

  it('builds names from parts', () => {
    expect(noteName(0, 0)).toBe('C');
    expect(noteName(3, 2, 4)).toBe('F##4');
    expect(noteName(6, -1)).toBe('Bb');
    expect(noteName(7, 0)).toBe('C');
  });
});
