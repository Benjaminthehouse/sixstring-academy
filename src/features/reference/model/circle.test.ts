import { describe, expect, it } from 'vitest';
import { cadenceOf, circleKey, functionLetter, keyChordRow, keyFromParam, neckScaleOf, neighboursOf, signatureWords } from './circle';
import { parseReferenceParams, referenceParams, SECTIONS } from './sections';

describe('sections and addresses', () => {
  it('lists the nine shelves once each', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['circle', 'keys', 'intervals', 'chords', 'scales', 'harmony', 'notation', 'tunings', 'glossary']);
  });
  it('reads section and item params, and ignores what it does not know', () => {
    expect(parseReferenceParams([])).toEqual({ section: null, item: null });
    expect(parseReferenceParams(['keys'])).toEqual({ section: 'keys', item: null });
    expect(parseReferenceParams(['circle', 'f-sharp-minor'])).toEqual({ section: 'circle', item: 'f-sharp-minor' });
    expect(parseReferenceParams(['nope', 'g-major'])).toEqual({ section: null, item: null });
    expect(referenceParams('intervals', 'm3')).toEqual(['intervals', 'm3']);
  });
});

describe('circle of fifths', () => {
  it('finds the 30 keys by route id or name, and nothing else', () => {
    expect(keyFromParam('f-sharp-minor')?.name).toBe('F# minor');
    expect(keyFromParam('Bb major')?.id).toBe('bb-major');
    expect(keyFromParam('g-sharp-major')).toBeNull(); // theoretical: eight sharps
    expect(keyFromParam('banana')).toBeNull();
    expect(circleKey(null).name).toBe('C major');
  });

  it('says the signature in words', () => {
    expect(signatureWords(circleKey('C major'))).toBe('no sharps or flats');
    expect(signatureWords(circleKey('G major'))).toBe('1 sharp');
    expect(signatureWords(circleKey('C minor'))).toBe('3 flats');
  });

  // Hand-written truth: the chords of G major and of E minor.
  it('gives the diatonic chords with numerals and functions (G major)', () => {
    const row = keyChordRow(circleKey('G major'));
    expect(row.map((c) => `${c.roman} ${c.symbol} ${functionLetter(c.function)}`)).toEqual([
      'I G T',
      'ii Am S',
      'iii Bm T',
      'IV C S',
      'V D D',
      'vi Em T',
      'vii° F#dim D',
    ]);
    expect(row[0].notes).toEqual(['G', 'B', 'D']);
  });

  it('adds the major V and vii° of harmonic minor to a minor key (E minor)', () => {
    const row = keyChordRow(circleKey('E minor'));
    expect(row.map((c) => `${c.roman} ${c.symbol}`)).toEqual(['i Em', 'ii° F#dim', 'bIII G', 'iv Am', 'v Bm', 'bVI C', 'bVII D', 'V B', 'vii° D#dim']);
    expect(row.slice(7).every((c) => c.variant === 'harmonic')).toBe(true);
  });

  it('builds sevenths on request', () => {
    expect(keyChordRow(circleKey('C major'), true).map((c) => c.symbol)).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5']);
  });

  it('plays I–IV–V–I, and i–iv–V–i in minor', () => {
    expect(cadenceOf(circleKey('D major'))).toEqual({ romans: ['I', 'IV', 'V', 'I'], chords: ['D', 'G', 'A', 'D'] });
    expect(cadenceOf(circleKey('A minor'))).toEqual({ romans: ['i', 'iv', 'V', 'i'], chords: ['Am', 'Dm', 'E', 'Am'] });
    expect(cadenceOf(circleKey('Eb major')).chords).toEqual(['Eb', 'Ab', 'Bb', 'Eb']);
  });

  it('lists the neighbours of a key (G major)', () => {
    const n = Object.fromEntries(neighboursOf(circleKey('G major')).map((x) => [x.role, x.key.name]));
    expect(n).toEqual({
      subdominant: 'C major',
      dominant: 'D major',
      relative: 'E minor',
      parallel: 'G minor',
      subdominantRelative: 'A minor',
      dominantRelative: 'B minor',
    });
  });

  it('keeps neighbours inside the 30 keys at the edges of the circle', () => {
    const n = neighboursOf(circleKey('C# major'));
    for (const x of n) expect(keyFromParam(x.key.id)).not.toBeNull();
    expect(n.find((x) => x.role === 'relative')?.key.name).toBe('A# minor');
  });

  it('draws the major scale or natural minor on the neck', () => {
    expect(neckScaleOf(circleKey('F# minor'))).toEqual({ tonic: 'F#', scale: 'minor' });
    expect(neckScaleOf(circleKey('Bb major'))).toEqual({ tonic: 'Bb', scale: 'major' });
  });
});
