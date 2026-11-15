import { describe, expect, it } from 'vitest';
import { chord, CHORD_TYPES, chordTones } from './chord';
import {
  analyzeProgression, chordToRoman, classifyCadence, modalInterchange, nextChords, progressionToChords,
  romanToChord, secondaryDominants, transposeProgression, tritoneSubstitutes,
} from './harmony';
import { ALL_KEYS, diatonicChords, MAJOR_KEYS, MINOR_KEYS } from './key';
import { chroma } from './note';
import { formatRoman, isRoman, parseRoman, roman, romanFor, splitProgression } from './roman';

describe('parseRoman', () => {
  it('reads numerals of every kind', () => {
    const cases: Array<[string, number, number, string]> = [
      ['I', 1, 0, 'major'], ['ii', 2, 0, 'minor'], ['iii', 3, 0, 'minor'], ['IV', 4, 0, 'major'], ['V', 5, 0, 'major'],
      ['vi', 6, 0, 'minor'], ['vii°', 7, 0, 'dim'], ['V7', 5, 0, '7'], ['bVII', 7, -1, 'major'], ['iiø7', 2, 0, 'm7b5'],
      ['vii°7', 7, 0, 'dim7'], ['bII', 2, -1, 'major'], ['Imaj7', 1, 0, 'maj7'], ['ii7', 2, 0, 'm7'], ['III+', 3, 0, 'aug'],
      ['bIII+', 3, -1, 'aug'], ['#iv°', 4, 1, 'dim'], ['bVImaj7', 6, -1, 'maj7'], ['i', 1, 0, 'minor'], ['iv', 4, 0, 'minor'],
      ['imaj7', 1, 0, 'mmaj7'], ['V7b9', 5, 0, '7b9'], ['V7alt', 5, 0, '7alt'], ['Isus4', 1, 0, 'sus4'], ['I6', 1, 0, '6'],
      ['i6', 1, 0, 'm6'], ['V9', 5, 0, '9'], ['V13', 5, 0, '13'], ['IVadd9', 4, 0, 'add9'], ['I6/9', 1, 0, '69'],
      ['bbvii°7', 7, -2, 'dim7'], ['V7sus4', 5, 0, '7sus4'], ['I5', 1, 0, '5'],
    ];
    for (const [text, degree, alt, typeId] of cases) {
      const rn = parseRoman(text);
      expect(rn, text).not.toBeNull();
      expect([rn!.degree, rn!.alt, rn!.type.id], text).toEqual([degree, alt, typeId]);
      expect(rn!.text, text).toBe(text);
      expect(rn!.target).toBeNull();
    }
  });

  it('normalises other ways of writing the same numeral', () => {
    const cases: Array<[string, string]> = [
      ['IIm7', 'ii7'], ['VIm', 'vi'], ['VII°', 'vii°'], ['viio', 'vii°'], ['viio7', 'vii°7'], ['viidim', 'vii°'], ['iim7b5', 'iiø7'],
      ['iiø', 'iiø7'], ['VIIø7', 'viiø7'], ['IM7', 'Imaj7'], ['IΔ7', 'Imaj7'], ['Vdom7', 'V7'], ['IIIaug', 'III+'], ['♭VII', 'bVII'],
      ['♯iv°', '#iv°'], ['N', 'bII'], ['N6', 'bII'], ['iim7', 'ii7'], ['Imaj', 'I'], [' V7 ', 'V7'], ['subV', 'subV7'],
    ];
    for (const [input, canonical] of cases) expect(roman(input).text, input).toBe(canonical);
  });

  it('reads applied chords and tritone substitutes', () => {
    expect(roman('V/V')).toMatchObject({ text: 'V/V', degree: 5, target: { text: 'V', degree: 5 } });
    expect(roman('V7/ii')).toMatchObject({ text: 'V7/ii', type: { id: '7' }, target: { text: 'ii', degree: 2 } });
    expect(roman('vii°7/V')).toMatchObject({ text: 'vii°7/V', degree: 7, type: { id: 'dim7' }, target: { text: 'V' } });
    expect(roman('V7/bVI')).toMatchObject({ target: { degree: 6, alt: -1 } });
    expect(roman('ii7/IV')).toMatchObject({ text: 'ii7/IV', degree: 2, target: { degree: 4 } });
    expect(roman('subV7')).toMatchObject({ text: 'subV7', substitute: true, interval: 'm2', type: { id: '7' } });
    expect(roman('subV7/V')).toMatchObject({ text: 'subV7/V', substitute: true, target: { text: 'V' } });
    expect(roman('I6/9').target).toBeNull();
  });

  it('rejects text that is not a numeral', () => {
    for (const bad of ['', 'VIII', 'Iv', 'C', 'IIII', 'iix', 'V7/', 'subIV', 'bbbV', 'V7/9x', 'hello']) expect(parseRoman(bad), bad).toBeNull();
    expect(isRoman('bVII')).toBe(true);
    expect(isRoman('Bb')).toBe(false);
    expect(() => roman('nope')).toThrow(RangeError);
  });

  it('round-trips every chord type on every chromatic degree', () => {
    const labels = ['1', 'b2', '2', 'b3', '3', '4', '#4', 'b5', '5', 'b6', '6', 'b7', '7', '#1', '#2', '#5'];
    for (const type of CHORD_TYPES) {
      for (const label of labels) {
        const text = romanFor(label, type);
        const rn = parseRoman(text);
        expect(rn, text).not.toBeNull();
        expect(rn!.text, text).toBe(text);
        expect(rn!.type.id, text).toBe(type.id);
        expect(`${rn!.alt < 0 ? 'b'.repeat(-rn!.alt) : '#'.repeat(rn!.alt)}${rn!.degree}`, text).toBe(label);
      }
    }
  });

  it('formats with music symbols', () => {
    expect(formatRoman('bVII')).toBe('♭VII');
    expect(formatRoman('#iv°7')).toBe('♯iv°7');
    expect(formatRoman('V7b9')).toBe('V7♭9');
    expect(formatRoman('V7/bVI')).toBe('V7/♭VI');
    expect(formatRoman('iiø7')).toBe('iiø7');
    expect(formatRoman('subV7/ii')).toBe('subV7/ii');
    expect(formatRoman('bVII', { ascii: true })).toBe('bVII');
    expect(formatRoman('VIIm7b5')).toBe('viiø7');
  });

  it('splits progressions written as text', () => {
    expect(splitProgression('I–V–vi–IV')).toEqual(['I', 'V', 'vi', 'IV']);
    expect(splitProgression('I-V-vi-IV')).toEqual(['I', 'V', 'vi', 'IV']);
    expect(splitProgression('ii V I')).toEqual(['ii', 'V', 'I']);
    expect(splitProgression('I | IV | V7 | I')).toEqual(['I', 'IV', 'V7', 'I']);
    expect(splitProgression('i - bVII - bVI - V')).toEqual(['i', 'bVII', 'bVI', 'V']);
    expect(splitProgression('C - G - Am - F')).toEqual(['C', 'G', 'Am', 'F']);
    expect(splitProgression('C-G-Am-F')).toEqual(['C', 'G', 'Am', 'F']);
    expect(splitProgression('Dm7->G7->Cmaj7')).toEqual(['Dm7', 'G7', 'Cmaj7']);
    expect(splitProgression('C-7 F7 Bbmaj7')).toEqual(['C-7', 'F7', 'Bbmaj7']);
    expect(splitProgression('G7-9, C6/9')).toEqual(['G7-9', 'C6/9']);
    expect(splitProgression('iiø7 → V7b9 → i')).toEqual(['iiø7', 'V7b9', 'i']);
  });
});

describe('romanToChord', () => {
  it('names the chord a numeral means in a key', () => {
    const cases: Array<[string, string, string]> = [
      ['V7', 'C', 'G7'], ['iiø7', 'A minor', 'Bm7b5'], ['V7/ii', 'C', 'A7'], ['bVII', 'E', 'D'], ['subV7', 'C', 'Db7'],
      ['vii°7/V', 'C', 'F#dim7'], ['bII', 'A minor', 'Bb'], ['N', 'C', 'Db'], ['IV', 'F#', 'B'], ['bVI', 'Db', 'A'],
      ['V/V', 'Bb', 'C'], ['bIII', 'F# major', 'A'], ['#iv°', 'C', 'F#dim'], ['subV7/V', 'C', 'Ab7'], ['i', 'G# minor', 'G#m'],
      ['vii°', 'G# minor', 'F##dim'], ['V', 'D# minor', 'A#'], ['bVII', 'A minor', 'G'], ['bIII', 'A minor', 'C'], ['iv', 'C', 'Fm'],
      ['V7/vi', 'F# major', 'A#7'], ['Imaj7', 'Eb', 'Ebmaj7'], ['vi7', 'G', 'Em7'], ['V7/iv', 'E minor', 'E7'], ['ii7/IV', 'C', 'Gm7'],
      ['subV7/ii', 'C', 'Eb7'], ['bII', 'Db', 'D'], ['iii', 'C# major', 'E#m'],
    ];
    for (const [numeral, keyName, expected] of cases) expect(romanToChord(numeral, keyName), `${numeral} in ${keyName}`).toBe(expected);
  });

  it('turns whole progressions into chords', () => {
    expect(progressionToChords('I–V–vi–IV', 'G')).toEqual(['G', 'D', 'Em', 'C']);
    expect(progressionToChords('ii V I', 'Bb')).toEqual(['Cm', 'F', 'Bb']);
    expect(progressionToChords(['i', 'bVII', 'bVI', 'V'], 'A minor')).toEqual(['Am', 'G', 'F', 'E']);
    expect(progressionToChords('ii7 V7 Imaj7', 'C')).toEqual(['Dm7', 'G7', 'Cmaj7']);
    expect(progressionToChords('I IV V', 'E')).toEqual(['E', 'A', 'B']);
    expect(progressionToChords('I7 IV7 V7', 'A')).toEqual(['A7', 'D7', 'E7']);
    expect(progressionToChords('iiø7 V7 i', 'D minor')).toEqual(['Em7b5', 'A7', 'Dm']);
    expect(() => progressionToChords('I X V', 'C')).toThrow(RangeError);
  });

  it('round-trips every diatonic chord in every key', () => {
    for (const k of ALL_KEYS) {
      const variants = k.mode === 'major' ? (['natural'] as const) : (['natural', 'harmonic', 'melodic'] as const);
      for (const minor of variants) {
        for (const sevenths of [false, true]) {
          for (const d of diatonicChords(k, { minor, sevenths })) {
            const where = `${d.roman} in ${k.name} (${minor})`;
            expect(romanToChord(d.roman, k), where).toBe(d.symbol);
            const back = chordToRoman(d.symbol, k);
            expect(back.roman, where).toBe(d.roman);
            expect(back.relation, where).toBe('diatonic');
            expect(back.function, where).not.toBeNull();
            expect(parseRoman(d.roman)!.text, where).toBe(d.roman);
          }
        }
      }
    }
  });

  it('round-trips applied and borrowed numerals in every key', () => {
    const major = ['V7/ii', 'V7/iii', 'V7/IV', 'V7/V', 'V7/vi', 'V/V', 'V/vi', 'vii°7/ii', 'vii°7/V', 'vii°7/vi', 'bVII', 'bVI', 'bIII', 'iv', 'bII', 'subV7', 'subV7/V', 'subV7/ii'];
    const minor = ['V7/iv', 'V7/V', 'V7/bVI', 'vii°7/V', 'vii°7/iv', 'bII', 'subV7', 'I'];
    for (const k of [...MAJOR_KEYS, ...MINOR_KEYS]) {
      for (const numeral of k.mode === 'major' ? major : minor) {
        const symbol = romanToChord(numeral, k);
        const analysis = chordToRoman(symbol, k);
        expect(analysis.roman, `${numeral} in ${k.name} = ${symbol}`).toBe(numeral);
        expect(chroma(chord(romanToChord(analysis.roman, k)).root)).toBe(chroma(chord(symbol).root));
      }
    }
  });
});

describe('chordToRoman', () => {
  const analyse = (symbol: string, keyName: string) => {
    const a = chordToRoman(symbol, keyName);
    return `${a.roman} ${a.relation}`;
  };

  it('analyses chords in C major', () => {
    const cases: Array<[string, string]> = [
      ['C', 'I diatonic'], ['Dm', 'ii diatonic'], ['Em7', 'iii7 diatonic'], ['Fmaj7', 'IVmaj7 diatonic'], ['G7', 'V7 diatonic'],
      ['Am', 'vi diatonic'], ['Bdim', 'vii° diatonic'], ['Bm7b5', 'viiø7 diatonic'], ['Gsus4', 'Vsus4 diatonic'], ['Cadd9', 'Iadd9 diatonic'],
      ['Dm9', 'ii9 diatonic'], ['G13', 'V13 diatonic'], ['C/E', 'I diatonic'],
      ['A7', 'V7/ii secondary-dominant'], ['B7', 'V7/iii secondary-dominant'], ['C7', 'V7/IV secondary-dominant'],
      ['D7', 'V7/V secondary-dominant'], ['E7', 'V7/vi secondary-dominant'], ['D', 'V/V secondary-dominant'], ['E', 'V/vi secondary-dominant'],
      ['A', 'V/ii secondary-dominant'], ['D9', 'V9/V secondary-dominant'], ['E7b9', 'V7b9/vi secondary-dominant'],
      ['F#dim7', 'vii°7/V secondary-leading-tone'], ['C#dim7', 'vii°7/ii secondary-leading-tone'], ['G#dim7', 'vii°7/vi secondary-leading-tone'],
      ['D#dim7', 'vii°7/iii secondary-leading-tone'], ['F#m7b5', 'viiø7/V secondary-leading-tone'], ['Edim7', 'vii°7/IV secondary-leading-tone'],
      ['Bb', 'bVII borrowed'], ['Ab', 'bVI borrowed'], ['Eb', 'bIII borrowed'], ['Fm', 'iv borrowed'], ['Cm', 'i borrowed'], ['Gm', 'v borrowed'],
      ['Dm7b5', 'iiø7 borrowed'], ['Abmaj7', 'bVImaj7 borrowed'], ['Bb7', 'bVII7 borrowed'], ['F7', 'IV7 borrowed'], ['Fm6', 'iv6 borrowed'],
      ['Db', 'bII neapolitan'], ['Dbmaj7', 'bIImaj7 neapolitan'],
      ['Db7', 'subV7 tritone-substitute'], ['Ab7', 'subV7/V tritone-substitute'], ['Eb7', 'subV7/ii tritone-substitute'], ['Gb7', 'subV7/IV tritone-substitute'],
      ['G7b9', 'V7b9 altered-dominant'], ['G7alt', 'V7alt altered-dominant'], ['G7#5', 'V7#5 altered-dominant'],
      ['F#', 'bV borrowed'], ['A#', 'bVII borrowed'], ['Gbm', 'bv chromatic'], ['C#m', 'bii chromatic'],
    ];
    for (const [symbol, expected] of cases) expect(analyse(symbol, 'C'), symbol).toBe(expected);
  });

  it('analyses chords in A minor', () => {
    const cases: Array<[string, string]> = [
      ['Am', 'i diatonic'], ['Bdim', 'ii° diatonic'], ['C', 'bIII diatonic'], ['Dm', 'iv diatonic'], ['Em', 'v diatonic'], ['F', 'bVI diatonic'],
      ['G', 'bVII diatonic'], ['G7', 'bVII7 diatonic'], ['E', 'V diatonic'], ['E7', 'V7 diatonic'], ['G#dim7', 'vii°7 diatonic'],
      ['Bm7b5', 'iiø7 diatonic'], ['AmMaj7', 'imaj7 diatonic'], ['D', 'IV diatonic'], ['D7', 'IV7 diatonic'], ['F#m7b5', 'viø7 diatonic'],
      ['Caug', 'bIII+ diatonic'], ['E7b9', 'V7b9 diatonic'],
      ['A7', 'V7/iv secondary-dominant'], ['B7', 'V7/V secondary-dominant'], ['C7', 'V7/bVI secondary-dominant'], ['D#dim7', 'vii°7/V secondary-leading-tone'],
      ['Bb', 'bII neapolitan'], ['Bb7', 'subV7 tritone-substitute'], ['A', 'I borrowed'], ['E7#9', 'V7#9 altered-dominant'],
      ['F7', 'subV7/V tritone-substitute'], ['F#m', 'vi borrowed'],
    ];
    for (const [symbol, expected] of cases) expect(analyse(symbol, 'A minor'), symbol).toBe(expected);
  });

  it('reports function, variant, sources and targets', () => {
    expect(chordToRoman('Dm', 'C')).toMatchObject({ function: 'subdominant', variant: 'natural', literal: 'ii', borrowedFrom: [], target: null });
    expect(chordToRoman('G7', 'C').function).toBe('dominant');
    expect(chordToRoman('Am', 'C').function).toBe('tonic');
    expect(chordToRoman('E7', 'A minor')).toMatchObject({ function: 'dominant', variant: 'harmonic' });
    expect(chordToRoman('D', 'A minor')).toMatchObject({ function: 'subdominant', variant: 'melodic' });
    expect(chordToRoman('F', 'A minor')).toMatchObject({ function: 'subdominant', variant: 'natural' });
    expect(chordToRoman('A7', 'C')).toMatchObject({ literal: 'VI7', target: 'ii', targetChord: 'Dm', function: 'dominant' });
    expect(chordToRoman('F#dim7', 'C')).toMatchObject({ literal: '#iv°7', target: 'V', targetChord: 'G' });
    expect(chordToRoman('Bb', 'C').borrowedFrom).toEqual(['minor', 'dorian', 'mixolydian']);
    expect(chordToRoman('Fm', 'C')).toMatchObject({ function: 'subdominant', borrowedFrom: expect.arrayContaining(['minor', 'harmonic-major']) });
    expect(chordToRoman('F7', 'C').borrowedFrom).toEqual(['dorian', 'melodic-minor']);
    expect(chordToRoman('Db7', 'C')).toMatchObject({ literal: 'bII7', target: 'I', targetChord: 'C' });
    expect(chordToRoman('Ab7', 'C')).toMatchObject({ target: 'V', targetChord: 'G' });
    expect(chordToRoman('F#m', 'C')).toMatchObject({ relation: 'chromatic', function: null });
    expect(chordToRoman('C7', 'A minor')).toMatchObject({ target: 'bVI', targetChord: 'F' });
    expect(chordToRoman('B7', 'A minor')).toMatchObject({ target: 'V', targetChord: 'E' });
    for (const symbol of ['C', 'A7', 'F#dim7', 'Bb', 'Db', 'Db7', 'F#', 'G7b9']) {
      const a = chordToRoman(symbol, 'C');
      expect(a.explanation.length, symbol).toBeGreaterThan(20);
      expect(a.explanation).not.toMatch(/undefined|null/);
      expect(a.chord).toBe(symbol);
    }
  });

  it('gives every chord in every key a numeral that leads back to the same chord', () => {
    const roots = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const relations = new Set<string>();
    for (const keyName of ['C major', 'A minor', 'F# major', 'Eb minor', 'Bb major', 'C# minor']) {
      for (const type of CHORD_TYPES) {
        for (const root of roots) {
          const symbol = `${root}${type.symbol}`;
          const analysis = chordToRoman(symbol, keyName);
          relations.add(analysis.relation);
          const where = `${symbol} in ${keyName} = ${analysis.roman}`;
          expect(parseRoman(analysis.roman), where).not.toBeNull();
          expect(parseRoman(analysis.literal), where).not.toBeNull();
          const back = chord(romanToChord(analysis.roman, keyName));
          expect(chroma(back.root), where).toBe(chroma(root));
          expect(back.type.id, where).toBe(type.id);
          expect(chroma(chord(romanToChord(analysis.literal, keyName)).root), where).toBe(chroma(root));
          expect(analysis.explanation.length, where).toBeGreaterThan(15);
          if (analysis.relation === 'chromatic') expect(analysis.function).toBeNull();
          else expect(analysis.function, where).not.toBeNull();
          if (analysis.target) expect(chord(analysis.targetChord!).symbol, where).toBe(analysis.targetChord);
          // Suggestions must exist for any chord at all.
          expect(nextChords(symbol, keyName).length, where).toBeGreaterThan(0);
        }
      }
    }
    expect([...relations].sort()).toEqual([
      'altered-dominant', 'borrowed', 'chromatic', 'diatonic', 'neapolitan', 'secondary-dominant', 'secondary-leading-tone', 'tritone-substitute',
    ]);
  });

  it('analyses whole progressions, detecting the key when needed', () => {
    expect(analyzeProgression('C G Am F')!).toMatchObject({ key: { name: 'C major' }, romans: ['I', 'V', 'vi', 'IV'] });
    expect(analyzeProgression(['Dm7', 'G7', 'Cmaj7'])!.romans).toEqual(['ii7', 'V7', 'Imaj7']);
    expect(analyzeProgression(['Am', 'G', 'F', 'E'])!).toMatchObject({ key: { name: 'A minor' }, romans: ['i', 'bVII', 'bVI', 'V'] });
    expect(analyzeProgression('C - A7 - Dm - G7', 'C')!.romans).toEqual(['I', 'V7/ii', 'ii', 'V7']);
    expect(analyzeProgression(['C', 'N.C.', 'G'], 'C')!.romans).toEqual(['I', 'V']);
    expect(analyzeProgression('Am F C G', 'C major')!.romans).toEqual(['vi', 'IV', 'I', 'V']);
    expect(analyzeProgression(['C', 'G'], 'C')!.keyConfidence).toBe(1);
    expect(analyzeProgression(['Dm7', 'G7', 'Cmaj7'])!.keyConfidence).toBeGreaterThan(0.8);
    expect(analyzeProgression([])).toBeNull();
    expect(analyzeProgression('E A B7 E')!.romans).toEqual(['I', 'IV', 'V7', 'I']);
  });
});

describe('transposeProgression', () => {
  it('moves a progression between keys with correct spelling', () => {
    expect(transposeProgression(['C', 'Am', 'F', 'G7'], 'C', 'Eb')).toEqual(['Eb', 'Cm', 'Ab', 'Bb7']);
    expect(transposeProgression(['C', 'F', 'G', 'Bb'], 'C', 'F#')).toEqual(['F#', 'B', 'C#', 'E']);
    expect(transposeProgression(['G', 'D/F#', 'Em', 'C'], 'G', 'A')).toEqual(['A', 'E/G#', 'F#m', 'D']);
    expect(transposeProgression(['Am', 'Dm', 'E7'], 'A minor', 'E minor')).toEqual(['Em', 'Am', 'B7']);
    expect(transposeProgression(['C', 'N.C.', 'G'], 'C', 'D')).toEqual(['D', 'N.C.', 'A']);
    expect(transposeProgression(['E', 'A', 'B7'], 'E major', 'G major')).toEqual(['G', 'C', 'D7']);
    expect(transposeProgression(['C', 'E7', 'Am'], 'C', 'Db')).toEqual(['Db', 'F7', 'Bbm']);
    expect(transposeProgression(['F#m', 'D', 'A', 'E'], 'A', 'C')).toEqual(['Am', 'F', 'C', 'G']);
  });

  it('keeps every chord in the same role', () => {
    const source = ['C', 'A7', 'Dm7', 'G7', 'Fm', 'Bb', 'Db7', 'C'];
    const romans = source.map((c) => chordToRoman(c, 'C').roman);
    for (const k of MAJOR_KEYS) {
      const moved = transposeProgression(source, 'C', k.tonic);
      expect(moved.map((c) => chordToRoman(c, k).roman), k.name).toEqual(romans);
      expect(transposeProgression(moved, k.tonic, 'C').map((c) => chroma(chord(c).root))).toEqual(source.map((c) => chroma(chord(c).root)));
    }
  });
});

describe('palettes', () => {
  it('lists the modal-interchange chords of a major key', () => {
    const palette = modalInterchange('C');
    const symbols = palette.map((b) => b.symbol);
    expect(symbols).toEqual(expect.arrayContaining(['Cm', 'Ddim', 'Eb', 'Fm', 'Gm', 'Ab', 'Bb', 'Db', 'D', 'Bbm']));
    const bySymbol = new Map(palette.map((b) => [b.symbol, b]));
    expect(bySymbol.get('Fm')).toMatchObject({ roman: 'iv', sources: ['minor', 'phrygian', 'locrian', 'harmonic-minor', 'harmonic-major'] });
    expect(bySymbol.get('Bb')).toMatchObject({ roman: 'bVII', sources: ['minor', 'dorian', 'mixolydian'] });
    expect(bySymbol.get('Db')).toMatchObject({ roman: 'bII', sources: ['phrygian', 'locrian'] });
    expect(bySymbol.get('D')).toMatchObject({ roman: 'II', sources: ['lydian'] });
    expect(palette.slice(0, 7).map((b) => b.symbol)).toEqual(['Cm', 'Ddim', 'Eb', 'Fm', 'Gm', 'Ab', 'Bb']);
    for (const b of palette) {
      expect(chordToRoman(b.symbol, 'C').relation, b.symbol).not.toBe('diatonic');
      expect(new Set(symbols).size).toBe(symbols.length);
      expect(b.sources.length).toBeGreaterThan(0);
    }
    expect(modalInterchange('C', { sevenths: true }).map((b) => b.symbol)).toEqual(expect.arrayContaining(['Cm7', 'Dm7b5', 'Ebmaj7', 'Fm7', 'Abmaj7', 'Bb7', 'F7']));
  });

  it('lists the modal-interchange chords of a minor key', () => {
    const palette = modalInterchange('A minor');
    const symbols = palette.map((b) => b.symbol);
    expect(symbols).toEqual(expect.arrayContaining(['A', 'C#m', 'F#m', 'Bb']));
    for (const own of ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G', 'E', 'G#dim', 'D', 'Bm']) expect(symbols, own).not.toContain(own);
  });

  it('lists secondary dominants', () => {
    expect(secondaryDominants('C')).toEqual([
      { roman: 'V7/ii', symbol: 'A7', target: 'ii', targetChord: 'Dm' },
      { roman: 'V7/iii', symbol: 'B7', target: 'iii', targetChord: 'Em' },
      { roman: 'V7/IV', symbol: 'C7', target: 'IV', targetChord: 'F' },
      { roman: 'V7/V', symbol: 'D7', target: 'V', targetChord: 'G' },
      { roman: 'V7/vi', symbol: 'E7', target: 'vi', targetChord: 'Am' },
    ]);
    expect(secondaryDominants('C', { sevenths: false }).map((d) => `${d.roman}=${d.symbol}`)).toEqual(['V/ii=A', 'V/iii=B', 'V/IV=C', 'V/V=D', 'V/vi=E']);
    expect(secondaryDominants('A minor').map((d) => `${d.symbol}>${d.targetChord}`)).toEqual(['G7>C', 'A7>Dm', 'B7>E', 'C7>F', 'D7>G']);
    for (const k of MAJOR_KEYS) {
      for (const d of secondaryDominants(k)) {
        // Every secondary dominant sits a fifth above its target and is a major-minor seventh chord.
        expect((chroma(chord(d.symbol).root) - chroma(chord(d.targetChord).root) + 12) % 12, `${d.symbol} in ${k.name}`).toBe(7);
        expect(romanToChord(d.roman, k)).toBe(d.symbol);
        expect(chordToRoman(d.symbol, k).roman).toBe(d.roman);
      }
    }
  });

  it('lists tritone substitutes', () => {
    expect(tritoneSubstitutes('C').map((t) => `${t.roman}=${t.symbol}>${t.targetChord} for ${t.replacesChord}`)).toEqual([
      'subV7=Db7>C for G7', 'subV7/ii=Eb7>Dm for A7', 'subV7/iii=F7>Em for B7', 'subV7/IV=Gb7>F for C7',
      'subV7/V=Ab7>G for D7', 'subV7/vi=Bb7>Am for E7',
    ]);
    for (const k of ALL_KEYS) {
      for (const t of tritoneSubstitutes(k)) {
        expect((chroma(chord(t.symbol).root) - chroma(chord(t.targetChord).root) + 12) % 12, `${t.symbol} in ${k.name}`).toBe(1);
        expect((chroma(chord(t.symbol).root) - chroma(chord(t.replacesChord).root) + 12) % 12).toBe(6);
        const guide = (symbol: string) => chordTones(symbol).filter((x) => x.role === 'third' || x.role === 'seventh').map((x) => chroma(x.note)).sort();
        expect(guide(t.symbol)).toEqual(guide(t.replacesChord));
        expect(chroma(chord(romanToChord(t.roman, k)).root)).toBe(chroma(chord(t.symbol).root));
      }
    }
  });
});

describe('classifyCadence', () => {
  it('names the four cadences', () => {
    expect(classifyCadence(['G7', 'C'], 'C')).toMatchObject({ type: 'authentic', name: 'Authentic cadence', romans: ['V7', 'I'], inverted: false });
    expect(classifyCadence(['G', 'C'], 'C')!.type).toBe('authentic');
    expect(classifyCadence(['F', 'C'], 'C')).toMatchObject({ type: 'plagal', name: 'Plagal cadence', romans: ['IV', 'I'] });
    expect(classifyCadence(['Fm', 'C'], 'C')).toMatchObject({ type: 'plagal', name: 'Minor plagal cadence' });
    expect(classifyCadence(['Dm', 'G'], 'C')).toMatchObject({ type: 'half', name: 'Half cadence', romans: ['ii', 'V'] });
    expect(classifyCadence(['C', 'G7'], 'C')!.type).toBe('half');
    expect(classifyCadence(['G', 'Am'], 'C')).toMatchObject({ type: 'deceptive', romans: ['V', 'vi'] });
    expect(classifyCadence(['G7', 'Am7'], 'C')!.type).toBe('deceptive');
  });

  it('handles minor keys, inversions and missing keys', () => {
    expect(classifyCadence(['E7', 'Am'], 'A minor')).toMatchObject({ type: 'authentic', romans: ['V7', 'i'] });
    expect(classifyCadence(['Dm', 'Am'], 'A minor')!.type).toBe('plagal');
    expect(classifyCadence(['Dm/F', 'E'], 'A minor')).toMatchObject({ type: 'half', name: 'Phrygian half cadence' });
    expect(classifyCadence(['F', 'E'], 'A minor')!.name).toBe('Phrygian half cadence');
    expect(classifyCadence(['Dm', 'E'], 'A minor')!.name).toBe('Half cadence');
    expect(classifyCadence(['E', 'F'], 'A minor')!.type).toBe('deceptive');
    expect(classifyCadence(['Bdim', 'C'], 'C')).toMatchObject({ type: 'authentic', name: 'Imperfect authentic cadence' });
    expect(classifyCadence(['G7/B', 'C'], 'C')).toMatchObject({ type: 'authentic', name: 'Imperfect authentic cadence', inverted: true });
    expect(classifyCadence(['Dm7', 'G7', 'C'])!.type).toBe('authentic');
    expect(classifyCadence(['C', 'F', 'G', 'C'])!.type).toBe('authentic');
    expect(classifyCadence(['Em', 'Am'], 'A minor')).toBeNull();
    expect(classifyCadence(['C', 'Dm'], 'C')).toBeNull();
    expect(classifyCadence(['C'], 'C')).toBeNull();
    expect(classifyCadence(['G7', 'C'], 'C')!.description.length).toBeGreaterThan(20);
  });
});

describe('nextChords', () => {
  it('sends dominants home and applied chords to their targets', () => {
    expect(nextChords('G7', 'C')[0]).toMatchObject({ roman: 'I', chord: 'C' });
    expect(nextChords('V', 'C')[0]).toMatchObject({ roman: 'I', chord: 'C' });
    expect(nextChords('A7', 'C')[0]).toMatchObject({ roman: 'ii', chord: 'Dm' });
    expect(nextChords('V7/V', 'C')[0].chord).toBe('G');
    expect(nextChords('Db7', 'C')[0].chord).toBe('C');
    expect(nextChords('F#dim7', 'C')[0].chord).toBe('G');
    expect(nextChords('E7', 'A minor')[0]).toMatchObject({ roman: 'i', chord: 'Am' });
    expect(nextChords('Dm', 'C')[0].chord).toBe('G');
    expect(nextChords('F', 'A minor')[0].chord).toBe('G');
    expect(nextChords('Bdim', 'C')[0].chord).toBe('C');
    expect(nextChords('Bb', 'C').map((n) => n.chord)).toEqual(['F', 'C', 'Ab']);
  });

  it('returns sensible, normalised suggestions for every diatonic chord in every key', () => {
    for (const k of ALL_KEYS) {
      for (const d of diatonicChords(k)) {
        const suggestions = nextChords(d.symbol, k);
        expect(suggestions.length, `${d.symbol} in ${k.name}`).toBeGreaterThanOrEqual(2);
        expect(suggestions.reduce((sum, s) => sum + s.probability, 0)).toBeCloseTo(1, 1);
        for (let i = 1; i < suggestions.length; i++) expect(suggestions[i - 1].probability).toBeGreaterThanOrEqual(suggestions[i].probability);
        for (const s of suggestions) {
          expect(chord(s.chord).symbol).toBe(s.chord);
          expect(romanToChord(s.roman, k)).toBe(s.chord);
          expect(s.reason.length).toBeGreaterThan(8);
        }
      }
    }
  });

  it('can suggest seventh chords, limits the list, and explains moves', () => {
    expect(nextChords('Dm7', 'C', { sevenths: true })[0]).toMatchObject({ roman: 'V7', chord: 'G7' });
    expect(nextChords('G7', 'C', { sevenths: true })[0].chord).toBe('Cmaj7');
    expect(nextChords('Bm7b5', 'A minor', { sevenths: true })[0].chord).toBe('E7');
    expect(nextChords('C', 'C', { limit: 3 })).toHaveLength(3);
    expect(nextChords('G', 'C')[0].reason).toMatch(/home/);
    expect(nextChords('G', 'C').find((n) => n.chord === 'Am')!.reason).toMatch(/Deceptive/);
    expect(nextChords('C', 'C').find((n) => n.chord === 'G')!.reason).toMatch(/dominant/);
    expect(nextChords('F#', 'C').map((n) => n.chord)).toEqual(['C', 'G', 'F']);
    expect(() => nextChords('???', 'C')).toThrow(RangeError);
  });
});
