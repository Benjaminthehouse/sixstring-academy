import { describe, expect, it } from 'vitest';
import {
  addIntervals, CHROMATIC_DEGREES, consonance, degreeToInterval, enharmonicIntervals, interval, intervalBetween,
  intervalFromSteps, intervalName, intervalToDegree, invertInterval, isCompound, isDegree, isInterval, parseInterval,
  semitones, semitonesToDegree, semitonesToInterval, SIMPLE_INTERVALS, simplifyInterval, subtractIntervals,
  transpose, transposeBySemitones,
} from './interval';
import { noteToMidi } from './note';

/** Independent truth table: interval name -> semitones. */
const SIZES: Record<string, number> = {
  P1: 0, A1: 1, d2: 0, m2: 1, M2: 2, A2: 3, d3: 2, m3: 3, M3: 4, A3: 5, d4: 4, P4: 5, A4: 6, d5: 6, P5: 7, A5: 8,
  d6: 7, m6: 8, M6: 9, A6: 10, d7: 9, m7: 10, M7: 11, A7: 12, d8: 11, P8: 12, A8: 13,
  m9: 13, M9: 14, A9: 15, m10: 15, M10: 16, d11: 16, P11: 17, A11: 18, d12: 18, P12: 19, m13: 20, M13: 21,
  m14: 22, M14: 23, P15: 24, AA4: 7, dd5: 5, dd7: 8, AA1: 2, dd3: 1, AA2: 4,
};

describe('parseInterval', () => {
  it('knows the size of every interval', () => {
    for (const [name, size] of Object.entries(SIZES)) {
      expect(semitones(name), name).toBe(size);
      expect(interval(name).name).toBe(name);
    }
  });

  it('exposes the parts', () => {
    expect(interval('M3')).toMatchObject({ quality: 'M', number: 3, steps: 2, semitones: 4, direction: 1, simple: 'M3', compound: false });
    expect(interval('m13')).toMatchObject({ quality: 'm', number: 13, steps: 12, semitones: 20, simple: 'm6', compound: true });
    expect(interval('-P5')).toMatchObject({ steps: -4, semitones: -7, direction: -1, name: '-P5' });
    expect(interval('P8')).toMatchObject({ simple: 'P8', compound: false });
    expect(interval('P15')).toMatchObject({ simple: 'P8', compound: true });
    expect(interval('AA4').quality).toBe('AA');
  });

  it('accepts word qualities', () => {
    expect(interval('min3').name).toBe('m3');
    expect(interval('maj7').name).toBe('M7');
    expect(interval('aug4').name).toBe('A4');
    expect(interval('dim5').name).toBe('d5');
    expect(interval('perfect 5').name).toBe('P5');
  });

  it('rejects impossible qualities', () => {
    for (const bad of ['M5', 'P3', 'm4', 'M1', 'P6', 'X3', '3', 'M0', 'd1', '', 'major']) expect(parseInterval(bad), bad).toBeNull();
    expect(isInterval('P5')).toBe(true);
    expect(isInterval('M4')).toBe(false);
    expect(() => interval('M5')).toThrow(RangeError);
  });

  it('lists the simple intervals in order', () => {
    const sizes = SIMPLE_INTERVALS.map((n) => semitones(n));
    expect(sizes).toEqual([0, 1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('interval arithmetic', () => {
  it('inverts', () => {
    const pairs: Array<[string, string]> = [
      ['P1', 'P8'], ['m2', 'M7'], ['M2', 'm7'], ['m3', 'M6'], ['M3', 'm6'], ['P4', 'P5'], ['A4', 'd5'],
      ['A2', 'd7'], ['A5', 'd4'], ['A6', 'd3'], ['A1', 'd8'], ['AA4', 'dd5'],
    ];
    for (const [a, b] of pairs) {
      expect(invertInterval(a), a).toBe(b);
      expect(invertInterval(b), b).toBe(a);
    }
    expect(invertInterval('M9')).toBe('m7');
  });

  it('an interval and its inversion always fill an octave', () => {
    for (const name of SIMPLE_INTERVALS) {
      expect(addIntervals(name, invertInterval(name)), name).toBe('P8');
    }
  });

  it('adds and subtracts with correct spelling', () => {
    expect(addIntervals('M3', 'm3')).toBe('P5');
    expect(addIntervals('m3', 'M3')).toBe('P5');
    expect(addIntervals('M3', 'M3')).toBe('A5');
    expect(addIntervals('m3', 'm3')).toBe('d5');
    expect(addIntervals('P5', 'P5')).toBe('M9');
    expect(addIntervals('P4', 'P5')).toBe('P8');
    expect(addIntervals('P8', 'M6')).toBe('M13');
    expect(subtractIntervals('P5', 'M3')).toBe('m3');
    expect(subtractIntervals('P8', 'P5')).toBe('P4');
    expect(subtractIntervals('M3', 'P5')).toBe('-m3');
    expect(subtractIntervals('P5', 'd5')).toBe('A1');
    expect(subtractIntervals('d5', 'P5')).toBe('-A1');
    expect(addIntervals('M3', '-M3')).toBe('P1');
  });

  it('simplifies compound intervals', () => {
    const pairs: Array<[string, string]> = [['M9', 'M2'], ['m9', 'm2'], ['A9', 'A2'], ['P11', 'P4'], ['A11', 'A4'], ['M13', 'M6'], ['m13', 'm6'], ['P8', 'P8'], ['P15', 'P8'], ['M3', 'M3'], ['M10', 'M3']];
    for (const [a, b] of pairs) expect(simplifyInterval(a), a).toBe(b);
    expect(isCompound('M9')).toBe(true);
    expect(isCompound('P8')).toBe(false);
    expect(isCompound('M7')).toBe(false);
  });

  it('builds from steps and semitones', () => {
    expect(intervalFromSteps(2, 4)).toBe('M3');
    expect(intervalFromSteps(2, 3)).toBe('m3');
    expect(intervalFromSteps(3, 6)).toBe('A4');
    expect(intervalFromSteps(4, 6)).toBe('d5');
    expect(intervalFromSteps(-2, -3)).toBe('-m3');
    expect(() => intervalFromSteps(0, 9)).toThrow(RangeError);
  });
});

describe('transpose', () => {
  it('keeps the correct spelling', () => {
    const cases: Array<[string, string, string]> = [
      ['C', 'M3', 'E'], ['C#', 'M3', 'E#'], ['F#', 'M7', 'E#'], ['Cb', 'P4', 'Fb'], ['G#', 'M7', 'F##'],
      ['Bb', 'm3', 'Db'], ['B', 'M3', 'D#'], ['E', 'd5', 'Bb'], ['E', 'A4', 'A#'], ['Ab', 'm7', 'Gb'],
      ['D', 'P1', 'D'], ['D', 'P8', 'D'], ['C', 'd7', 'Bbb'], ['Db', 'd7', 'Cbb'], ['F', 'A4', 'B'], ['B', 'P5', 'F#'],
      ['Gb', 'P4', 'Cb'], ['D#', 'M2', 'E#'], ['A#', 'M7', 'G##'], ['C', 'A9', 'D#'], ['C', 'm13', 'Ab'],
    ];
    for (const [from, ivl, to] of cases) expect(transpose(from, ivl), `${from}+${ivl}`).toBe(to);
  });

  it('handles octaves and direction', () => {
    expect(transpose('C4', 'M3')).toBe('E4');
    expect(transpose('A4', 'M3')).toBe('C#5');
    expect(transpose('B3', 'm2')).toBe('C4');
    expect(transpose('C4', '-m2')).toBe('B3');
    expect(transpose('C4', '-m3')).toBe('A3');
    expect(transpose('C4', 'P8')).toBe('C5');
    expect(transpose('C4', 'M9')).toBe('D5');
    expect(transpose('Bb3', 'P5')).toBe('F4');
    expect(transpose('B#3', 'm2')).toBe('C#4');
    expect(transpose('Cb4', 'M2')).toBe('Db4');
    expect(transpose('E2', 'P15')).toBe('E4');
  });

  it('always moves by exactly the size of the interval', () => {
    const roots = ['C4', 'C#4', 'Db4', 'D4', 'Eb4', 'E4', 'F4', 'F#4', 'Gb4', 'G4', 'Ab4', 'A4', 'Bb4', 'B4', 'Cb4', 'E#4', 'B#3'];
    for (const root of roots) {
      for (const [name, size] of Object.entries(SIZES)) {
        expect(noteToMidi(transpose(root, name)) - noteToMidi(root), `${root}+${name}`).toBe(size);
        expect(noteToMidi(root) - noteToMidi(transpose(root, `-${name}`)), `${root}-${name}`).toBe(size);
      }
    }
  });

  it('undoes itself', () => {
    for (const root of ['C', 'F#', 'Bb', 'Cb', 'E#']) {
      for (const name of SIMPLE_INTERVALS) {
        expect(transpose(transpose(root, name), `-${name}`), `${root} ${name}`).toBe(root);
      }
    }
  });

  it('transposes by semitones with ordinary accidentals', () => {
    expect(transposeBySemitones('C', 1)).toBe('Db');
    expect(transposeBySemitones('C', 1, 'sharps')).toBe('C#');
    expect(transposeBySemitones('C#', 2)).toBe('D#');
    expect(transposeBySemitones('Db', 2)).toBe('Eb');
    expect(transposeBySemitones('E', 1)).toBe('F');
    expect(transposeBySemitones('B3', 1)).toBe('C4');
    expect(transposeBySemitones('C4', -1)).toBe('B3');
    expect(transposeBySemitones('E2', 12)).toBe('E3');
    expect(transposeBySemitones('F#4', -3, 'flats')).toBe('Eb4');
  });
});

describe('intervalBetween', () => {
  it('measures spelled notes', () => {
    const cases: Array<[string, string, string]> = [
      ['C', 'E', 'M3'], ['C', 'Eb', 'm3'], ['C', 'D#', 'A2'], ['C', 'F#', 'A4'], ['C', 'Gb', 'd5'], ['E', 'C', 'm6'],
      ['B', 'F', 'd5'], ['F', 'B', 'A4'], ['C', 'C', 'P1'], ['C', 'C#', 'A1'], ['C#', 'C', 'd8'], ['B#', 'C', 'd2'],
      ['G#', 'F##', 'M7'], ['Ab', 'F#', 'A6'], ['D', 'Cb', 'd7'],
    ];
    for (const [a, b, name] of cases) expect(intervalBetween(a, b), `${a}-${b}`).toBe(name);
  });

  it('is exact and signed when both notes have octaves', () => {
    expect(intervalBetween('C4', 'E4')).toBe('M3');
    expect(intervalBetween('C4', 'E5')).toBe('M10');
    expect(intervalBetween('E4', 'C4')).toBe('-M3');
    expect(intervalBetween('C4', 'A3')).toBe('-m3');
    expect(intervalBetween('C4', 'C5')).toBe('P8');
    expect(intervalBetween('C4', 'C4')).toBe('P1');
    expect(intervalBetween('E2', 'E4')).toBe('P15');
    expect(intervalBetween('C4', 'Cb4')).toBe('-A1');
  });

  it('is the inverse of transpose', () => {
    for (const root of ['C', 'F#', 'Bb', 'G#', 'Db']) {
      for (const name of SIMPLE_INTERVALS) {
        if (name === 'P8') continue;
        expect(intervalBetween(root, transpose(root, name)), `${root} ${name}`).toBe(name);
      }
    }
    expect(intervalBetween('C4', transpose('C4', 'M13'))).toBe('M13');
  });
});

describe('names, consonance and degrees', () => {
  it('writes full English names', () => {
    expect(intervalName('m3')).toBe('minor third');
    expect(intervalName('P1')).toBe('perfect unison');
    expect(intervalName('A4')).toBe('augmented fourth');
    expect(intervalName('d5')).toBe('diminished fifth');
    expect(intervalName('P8')).toBe('perfect octave');
    expect(intervalName('M9')).toBe('major ninth');
    expect(intervalName('m13')).toBe('minor thirteenth');
    expect(intervalName('AA4')).toBe('doubly augmented fourth');
    expect(intervalName('dd7')).toBe('doubly diminished seventh');
    expect(intervalName('-P5')).toBe('descending perfect fifth');
    expect(intervalName('P15')).toBe('perfect fifteenth');
  });

  it('classifies consonance', () => {
    const expected: Record<string, string> = {
      P1: 'perfect', m2: 'dissonant', M2: 'dissonant', m3: 'imperfect', M3: 'imperfect', P4: 'perfect', A4: 'dissonant',
      d5: 'dissonant', P5: 'perfect', m6: 'imperfect', M6: 'imperfect', m7: 'dissonant', M7: 'dissonant', P8: 'perfect',
      M10: 'imperfect', M9: 'dissonant', P12: 'perfect', A2: 'dissonant',
    };
    for (const [name, cls] of Object.entries(expected)) expect(consonance(name), name).toBe(cls);
  });

  it('converts degree labels both ways', () => {
    const pairs: Array<[string, string]> = [
      ['1', 'P1'], ['b2', 'm2'], ['2', 'M2'], ['#2', 'A2'], ['b3', 'm3'], ['3', 'M3'], ['4', 'P4'], ['#4', 'A4'], ['b5', 'd5'],
      ['5', 'P5'], ['#5', 'A5'], ['b6', 'm6'], ['6', 'M6'], ['bb7', 'd7'], ['b7', 'm7'], ['7', 'M7'], ['8', 'P8'],
      ['b9', 'm9'], ['9', 'M9'], ['#9', 'A9'], ['11', 'P11'], ['#11', 'A11'], ['b13', 'm13'], ['13', 'M13'], ['b4', 'd4'],
      ['bb3', 'd3'], ['#6', 'A6'], ['##4', 'AA4'],
    ];
    for (const [degree, name] of pairs) {
      expect(degreeToInterval(degree), degree).toBe(name);
      expect(intervalToDegree(name), name).toBe(degree);
    }
    expect(degreeToInterval('♭3')).toBe('m3');
    expect(degreeToInterval('x4')).toBe('AA4');
    expect(isDegree('b7')).toBe(true);
    expect(isDegree('7b')).toBe(false);
    expect(() => degreeToInterval('h3')).toThrow(RangeError);
  });

  it('names sizes in semitones conventionally', () => {
    expect([...Array(13).keys()].map((n) => semitonesToInterval(n))).toEqual([
      'P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8',
    ]);
    expect(semitonesToInterval(6, { tritone: 'd5' })).toBe('d5');
    expect(semitonesToInterval(14)).toBe('M9');
    expect(semitonesToInterval(13)).toBe('m9');
    expect(semitonesToInterval(24)).toBe('P15');
    expect(semitonesToInterval(-7)).toBe('-P5');
    expect(CHROMATIC_DEGREES.map((d) => semitones(degreeToInterval(d)))).toEqual([...Array(12).keys()]);
    expect(semitonesToDegree(3)).toBe('b3');
    expect(semitonesToDegree(6, { tritone: 'b5' })).toBe('b5');
    expect(semitonesToDegree(14)).toBe('9');
    expect(semitonesToDegree(18)).toBe('#11');
    expect(semitonesToDegree(12)).toBe('8');
    for (let n = 0; n <= 24; n++) expect(semitones(semitonesToInterval(n))).toBe(n);
  });

  it('compares sizes enharmonically', () => {
    expect(enharmonicIntervals('A4', 'd5')).toBe(true);
    expect(enharmonicIntervals('A2', 'm3')).toBe(true);
    expect(enharmonicIntervals('M3', 'm3')).toBe(false);
    expect(enharmonicIntervals('M3', 'nope')).toBe(false);
  });
});
