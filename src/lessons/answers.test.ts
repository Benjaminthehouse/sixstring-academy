import { describe, expect, it } from 'vitest';
import { CHORD_TYPES, SIMPLE_INTERVALS, intervalName } from '@/core/theory';
import {
  checkText, compareNoteNames, normalizeChord, normalizeDegree, normalizeInterval, normalizeNote, normalizeNumber, normalizeRoman,
  normalizeText, specAccepted, specMarkup, specProblems, specValue,
} from './answers';

describe('normalizeNote', () => {
  it('reads letters, signs, words and solfege', () => {
    const cases: Array<[string, string | null]> = [
      ['C', 'C'], ['c', 'C'], [' c# ', 'C#'], ['C♯', 'C#'], ['c sharp', 'C#'], ['C-sharp', 'C#'], ['db', 'Db'], ['D♭', 'Db'], ['d flat', 'Db'],
      ['b', 'B'], ['bb', 'Bb'], ['B flat', 'Bb'], ['B♭', 'Bb'], ['bbb', 'Bbb'], ['f double sharp', 'F##'], ['F𝄪', 'F##'], ['e2', 'E2'], ['Bb3', 'Bb3'],
      ['Do', 'C'], ['re#', 'D#'], ['sol', 'G'], ['si b', 'Bb'], ['a natural', 'A'],
      ['', null], ['H', null], ['x', null], ['C##x', null], ['12', null], ['cc', null],
    ];
    for (const [input, expected] of cases) expect(normalizeNote(input), JSON.stringify(input)).toBe(expected);
  });

  it('understands German names when asked', () => {
    expect(normalizeNote('H', 'german')).toBe('B');
    expect(normalizeNote('B', 'german')).toBe('Bb');
    expect(normalizeNote('fis', 'german')).toBe('F#');
    expect(normalizeNote('es', 'german')).toBe('Eb');
    expect(normalizeNote('As', 'german')).toBe('Ab');
    expect(normalizeNote('c', 'german')).toBe('C');
    expect(normalizeNote('B', 'letters')).toBe('B');
  });
});

describe('normalizeInterval', () => {
  it('reads short names, words and abbreviations', () => {
    const cases: Array<[string, string | null]> = [
      ['m3', 'm3'], ['M3', 'M3'], ['P5', 'P5'], ['minor third', 'm3'], ['Major Third', 'M3'], ['min 3rd', 'm3'], ['maj 7th', 'M7'], ['min3', 'm3'],
      ['perfect fifth', 'P5'], ['a perfect fourth', 'P4'], ['augmented fourth', 'A4'], ['diminished fifth', 'd5'], ['dim 5', 'd5'], ['aug 4', 'A4'],
      ['octave', 'P8'], ['perfect octave', 'P8'], ['unison', 'P1'], ['fifth', 'P5'], ['4th', 'P4'], ['tritone', 'A4'], ['half step', 'm2'], ['whole step', 'M2'],
      ['semitone', 'm2'], ['minor-sixth', 'm6'], ['major ninth', 'M9'],
      ['third', null], ['7th', null], ['', null], ['big', null], ['minor', null], ['happy third', null], ['minor third please', null],
    ];
    for (const [input, expected] of cases) expect(normalizeInterval(input), JSON.stringify(input)).toBe(expected);
  });

  it('round-trips the engine\'s own names for every simple interval', () => {
    for (const ivl of SIMPLE_INTERVALS) {
      expect(normalizeInterval(ivl), ivl).toBe(ivl);
      expect(normalizeInterval(intervalName(ivl)), intervalName(ivl)).toBe(ivl);
    }
  });
});

describe('normalizeChord', () => {
  it('reads symbols, lower-case roots and words', () => {
    const cases: Array<[string, string | null]> = [
      ['Am', 'Am'], ['am', 'Am'], ['A minor', 'Am'], ['a min', 'Am'], ['A-', 'Am'], ['C', 'C'], ['c major', 'C'], ['C major 7', 'Cmaj7'], ['CM7', 'Cmaj7'],
      ['g7', 'G7'], ['G dominant seventh', 'G7'], ['bb', 'Bb'], ['bm', 'Bm'], ['b7', 'B7'], ['bbm7', 'Bbm7'], ['B flat minor', 'Bbm'], ['f# minor', 'F#m'],
      ['F sharp minor seventh', 'F#m7'], ['d diminished', 'Ddim'], ['e power chord', 'E5'], ['c/e', 'C/E'], ['Dsus4', 'Dsus4'], ['d suspended fourth', 'Dsus4'],
      ['b half-diminished', 'Bm7b5'], ['', null], ['xyz', null], ['H', null],
    ];
    for (const [input, expected] of cases) expect(normalizeChord(input), JSON.stringify(input)).toBe(expected);
  });

  it('round-trips every catalog symbol on a natural root', () => {
    for (const type of CHORD_TYPES) {
      const symbol = `G${type.symbol}`;
      expect(normalizeChord(symbol), symbol).toBe(symbol);
    }
  });
});

describe('the other normalisers', () => {
  it('degrees', () => {
    const cases: Array<[string, string | null]> = [['b3', 'b3'], ['♭3', 'b3'], ['flat 3', 'b3'], ['flat third', 'b3'], ['#4', '#4'], ['sharp four', '#4'], ['5', '5'], ['5th', '5'], ['fifth', '5'], ['root', '1'], ['bb7', 'bb7'], ['b', null], ['x', null], ['', null]];
    for (const [input, expected] of cases) expect(normalizeDegree(input), JSON.stringify(input)).toBe(expected);
  });

  it('roman numerals keep their case', () => {
    expect(normalizeRoman('iv')).toBe('iv');
    expect(normalizeRoman('IV')).toBe('IV');
    expect(normalizeRoman('♭VII')).toBe('bVII');
    expect(normalizeRoman('flat VII')).toBe('bVII');
    expect(normalizeRoman('viio')).toBe('vii°');
    expect(normalizeRoman('V7')).toBe('V7');
    expect(normalizeRoman('hello')).toBeNull();
    expect(normalizeRoman('')).toBeNull();
  });

  it('numbers', () => {
    const cases: Array<[string, number | null]> = [['5', 5], [' 12 ', 12], ['5th', 5], ['fret 5', 5], ['five', 5], ['Twelve', 12], ['open', 0], ['0', 0], ['1.5', 1.5], ['1½', 1.5], ['1,5', 1.5], ['third', 3], ['string 6 fret 3', null], ['', null], ['many', null], ['3 3', 3]];
    for (const [input, expected] of cases) expect(normalizeNumber(input), JSON.stringify(input)).toBe(expected);
  });

  it('free text ignores case, accents and punctuation', () => {
    expect(normalizeText('  Barré!  ')).toBe('barre');
    expect(normalizeText('Half-Step')).toBe('half step');
  });
});

describe('checkText and the enharmonic policy', () => {
  it('spelling exact: the name matters, and the near miss is reported as enharmonic', () => {
    const spec = { kind: 'note' as const, value: 'F#', spelling: 'exact' as const };
    expect(checkText('f sharp', spec)).toEqual({ verdict: 'correct', given: 'F#' });
    expect(checkText('Gb', spec)).toEqual({ verdict: 'enharmonic', given: 'Gb' });
    expect(checkText('G', spec)).toEqual({ verdict: 'wrong', given: 'G' });
    expect(checkText('???', spec)).toEqual({ verdict: 'invalid', given: null });
  });

  it('spelling any: the pitch matters', () => {
    const spec = { kind: 'note' as const, value: 'F#', spelling: 'any' as const };
    expect(checkText('Gb', spec).verdict).toBe('correct');
    expect(checkText('E##', spec).verdict).toBe('correct');
    expect(checkText('F', spec).verdict).toBe('wrong');
  });

  it('octaves count only when both sides carry one', () => {
    expect(compareNoteNames('E2', 'E2', 'exact')).toBe('correct');
    expect(compareNoteNames('E3', 'E2', 'any')).toBe('wrong');
    expect(compareNoteNames('E', 'E2', 'exact')).toBe('correct');
    expect(compareNoteNames('Fb3', 'E3', 'exact')).toBe('enharmonic');
    expect(compareNoteNames('x', 'E', 'any')).toBe('invalid');
  });

  it('accept lists extra right answers', () => {
    const spec = { kind: 'note' as const, value: 'F#', spelling: 'exact' as const, accept: ['Gb'] };
    expect(checkText('Gb', spec).verdict).toBe('correct');
    expect(specAccepted(spec)).toEqual(['F#', 'Gb']);
  });

  it('intervals', () => {
    expect(checkText('diminished fifth', { kind: 'interval', value: 'A4', spelling: 'exact' }).verdict).toBe('enharmonic');
    expect(checkText('diminished fifth', { kind: 'interval', value: 'A4', spelling: 'any' }).verdict).toBe('correct');
    expect(checkText('tritone', { kind: 'interval', value: 'd5', spelling: 'exact' }).verdict).toBe('correct');
    expect(checkText('tritone', { kind: 'interval', value: 'P5', spelling: 'any' }).verdict).toBe('wrong');
    expect(checkText('minor third', { kind: 'interval', value: 'm3', spelling: 'exact' }).verdict).toBe('correct');
    expect(checkText('M3', { kind: 'interval', value: 'm3', spelling: 'any' }).verdict).toBe('wrong');
    expect(checkText('third', { kind: 'interval', value: 'm3', spelling: 'any' }).verdict).toBe('invalid');
  });

  it('chords', () => {
    expect(checkText('a minor', { kind: 'chord', value: 'Am', spelling: 'exact' }).verdict).toBe('correct');
    expect(checkText('Dbm', { kind: 'chord', value: 'C#m', spelling: 'exact' }).verdict).toBe('enharmonic');
    expect(checkText('Dbm', { kind: 'chord', value: 'C#m', spelling: 'any' }).verdict).toBe('correct');
    expect(checkText('C#', { kind: 'chord', value: 'C#m', spelling: 'any' }).verdict).toBe('wrong');
    expect(checkText('C/E', { kind: 'chord', value: 'C', spelling: 'any' }).verdict).toBe('wrong');
  });

  it('degrees, numerals, numbers and text', () => {
    expect(checkText('#4', { kind: 'degree', value: 'b5', spelling: 'any' }).verdict).toBe('correct');
    expect(checkText('#4', { kind: 'degree', value: 'b5', spelling: 'exact' }).verdict).toBe('enharmonic');
    expect(checkText('flat 3', { kind: 'degree', value: 'b3', spelling: 'exact' }).verdict).toBe('correct');
    expect(checkText('IV', { kind: 'roman', value: 'IV' }).verdict).toBe('correct');
    expect(checkText('iv', { kind: 'roman', value: 'IV' })).toEqual({ verdict: 'wrong', given: 'iv', caseOnly: true });
    expect(checkText('V', { kind: 'roman', value: 'IV' })).toEqual({ verdict: 'wrong', given: 'V' });
    expect(checkText('fret 3', { kind: 'number', value: 3 })).toEqual({ verdict: 'correct', given: '3' });
    expect(checkText('15', { kind: 'number', value: 3, accept: [15] }).verdict).toBe('correct');
    expect(checkText('4', { kind: 'number', value: 3 }).verdict).toBe('wrong');
    expect(checkText('lots', { kind: 'number', value: 3 }).verdict).toBe('invalid');
    expect(checkText('Barré', { kind: 'text', value: 'barre', accept: ['bar chord'] }).verdict).toBe('correct');
    expect(checkText('BAR CHORD', { kind: 'text', value: 'barre', accept: ['bar chord'] }).verdict).toBe('correct');
    expect(checkText('capo', { kind: 'text', value: 'barre' }).verdict).toBe('wrong');
    expect(checkText(undefined as unknown as string, { kind: 'text', value: 'barre' }).verdict).toBe('invalid');
  });

  it('understands the learner\'s naming system', () => {
    expect(checkText('H', { kind: 'note', value: 'B', spelling: 'any' }, 'german').verdict).toBe('correct');
    expect(checkText('B', { kind: 'note', value: 'Bb', spelling: 'any' }, 'german').verdict).toBe('correct');
    expect(checkText('Do', { kind: 'note', value: 'C', spelling: 'any' }, 'solfege').verdict).toBe('correct');
  });
});

describe('answer specs', () => {
  it('canonical value and markup', () => {
    expect(specValue({ kind: 'note', value: 'f#', spelling: 'any' })).toBe('F#');
    expect(specValue({ kind: 'chord', value: 'C-7', spelling: 'any' })).toBe('Cm7');
    expect(specValue({ kind: 'number', value: 12 })).toBe('12');
    expect(specMarkup({ kind: 'note', value: 'F#', spelling: 'any' })).toBe('{n:F#}');
    expect(specMarkup({ kind: 'interval', value: 'm3', spelling: 'any' })).toBe('{i:m3}');
    expect(specMarkup({ kind: 'chord', value: 'Am', spelling: 'any' })).toBe('{c:Am}');
    expect(specMarkup({ kind: 'degree', value: 'b3', spelling: 'any' })).toBe('{d:b3}');
    expect(specMarkup({ kind: 'roman', value: 'IV' })).toBe('{r:IV}');
    expect(specMarkup({ kind: 'number', value: 5 })).toBe('5');
    expect(specMarkup({ kind: 'text', value: 'barre' })).toBe('barre');
  });

  it('reports ungradable specs with a fix', () => {
    expect(specProblems({ kind: 'note', value: 'F#', spelling: 'exact' })).toEqual([]);
    expect(specProblems({ kind: 'note', value: 'F#' } as never)[0]).toMatch(/enharmonic policy.*spelling: 'exact'.*spelling: 'any'/);
    expect(specProblems({ kind: 'note', value: 'H', spelling: 'any' })[0]).toMatch(/not a note name/);
    expect(specProblems({ kind: 'interval', value: 'm3', spelling: 'any', accept: ['zz'] })[0]).toMatch(/not an interval/);
    expect(specProblems({ kind: 'chord', value: '??', spelling: 'any' })[0]).toMatch(/not a chord symbol/);
    expect(specProblems({ kind: 'degree', value: 'h', spelling: 'any' })[0]).toMatch(/not a scale degree/);
    expect(specProblems({ kind: 'roman', value: 'xx' })[0]).toMatch(/not a roman numeral/);
    expect(specProblems({ kind: 'number', value: Number.NaN })[0]).toMatch(/not a number/);
    expect(specProblems({ kind: 'text', value: '  ' })[0]).toMatch(/not text/);
    expect(specProblems({ kind: 'colour', value: 'red' } as never)[0]).toMatch(/not an answer kind/);
  });
});
