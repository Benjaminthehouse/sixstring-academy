import { describe, expect, it } from 'vitest';
import {
  buildChord, chord, CHORD_TYPES, chordInversions, chordMidi, chordNotes, chordNotesFrom, chordPcs, chordTones,
  chordTypeFromSemitones, filterChordTypes, formatChord, getChordType, identifyChord, identifyChords, invertChord,
  isChord, isDominant, isNoChord, normalizeChordSymbol, omittableTones, parallelChord, parseChord, relativeChord,
  searchChordTypes, transposeChord, transposeChordBySemitones, tritoneSubstitute, voicingTones,
} from './chord';
import { chroma, noteToMidi } from './note';

/** Independent truth table: semitones above the root for every catalog id. */
const SEMITONES: Record<string, number[]> = {
  major: [0, 4, 7], minor: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], 5: [0, 7], sus2: [0, 2, 7], sus4: [0, 5, 7],
  sus2sus4: [0, 2, 5, 7], majb5: [0, 4, 6],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 69: [0, 4, 7, 9, 14], m69: [0, 3, 7, 9, 14],
  7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], mmaj7: [0, 3, 7, 11], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10],
  '7sharp5': [0, 4, 8, 10], maj7sharp5: [0, 4, 8, 11], '7sus4': [0, 5, 7, 10], '7sus2': [0, 2, 7, 10],
  maj7b5: [0, 4, 6, 11], m7sharp5: [0, 3, 8, 10], dimmaj7: [0, 3, 6, 11],
  9: [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], mmaj9: [0, 3, 7, 11, 14],
  11: [0, 4, 7, 10, 14, 17], m11: [0, 3, 7, 10, 14, 17], m7add11: [0, 3, 7, 10, 17],
  maj7sharp11: [0, 4, 7, 11, 18], maj9sharp11: [0, 4, 7, 11, 14, 18],
  13: [0, 4, 7, 10, 14, 21], maj13: [0, 4, 7, 11, 14, 21], m13: [0, 3, 7, 10, 14, 21],
  '9sus4': [0, 5, 7, 10, 14], '13sus4': [0, 5, 7, 10, 14, 21], m9b5: [0, 3, 6, 10, 14],
  '7b5': [0, 4, 6, 10], '7b9': [0, 4, 7, 10, 13], '7sharp9': [0, 4, 7, 10, 15], '7sharp11': [0, 4, 7, 10, 18],
  '7b13': [0, 4, 7, 10, 20], '9sharp11': [0, 4, 7, 10, 14, 18], '13sharp11': [0, 4, 7, 10, 14, 18, 21],
  '9sharp5': [0, 4, 8, 10, 14], '9b5': [0, 4, 6, 10, 14], '9b13': [0, 4, 7, 10, 14, 20],
  '13b9': [0, 4, 7, 10, 13, 21], '13sharp9': [0, 4, 7, 10, 15, 21], '7b9b13': [0, 4, 7, 10, 13, 20],
  '7sharp9sharp5': [0, 4, 8, 10, 15], '7b9sharp5': [0, 4, 8, 10, 13], '7b9b5': [0, 4, 6, 10, 13],
  '7sharp9b5': [0, 4, 6, 10, 15], '7b9sharp11': [0, 4, 7, 10, 13, 18], '7sharp9sharp11': [0, 4, 7, 10, 15, 18],
  '7alt': [0, 4, 10, 13, 15, 18, 20], '7sus4b9': [0, 5, 7, 10, 13],
  add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], add11: [0, 4, 7, 17], add4: [0, 4, 5, 7], madd11: [0, 3, 7, 17],
  addsharp11: [0, 4, 7, 18], mb6: [0, 3, 7, 8],
};

/** Independent truth table: spelled chord tones. */
const SPELLINGS: Record<string, string> = {
  C: 'C E G', Cm: 'C Eb G', Cdim: 'C Eb Gb', Caug: 'C E G#', C5: 'C G', Csus2: 'C D G', Csus4: 'C F G',
  C6: 'C E G A', Cm6: 'C Eb G A', 'C6/9': 'C E G A D', C7: 'C E G Bb', Cmaj7: 'C E G B', Cm7: 'C Eb G Bb',
  CmMaj7: 'C Eb G B', Cdim7: 'C Eb Gb Bbb', Cm7b5: 'C Eb Gb Bb', 'C7#5': 'C E G# Bb', 'Cmaj7#5': 'C E G# B',
  C7sus4: 'C F G Bb', C9: 'C E G Bb D', Cmaj9: 'C E G B D', Cm9: 'C Eb G Bb D', C11: 'C E G Bb D F',
  Cm11: 'C Eb G Bb D F', 'Cmaj7#11': 'C E G B F#', C13: 'C E G Bb D A', Cm13: 'C Eb G Bb D A',
  C7b9: 'C E G Bb Db', 'C7#9': 'C E G Bb D#', C7b5: 'C E Gb Bb', 'C7#11': 'C E G Bb F#', C7b13: 'C E G Bb Ab',
  C7alt: 'C E Bb Db D# F# Ab', Cadd9: 'C E G D', Cmadd9: 'C Eb G D', Cadd11: 'C E G F', Cadd4: 'C E F G',
  'F#m7b5': 'F# A C E', Bbmaj7: 'Bb D F A', Ebm7: 'Eb Gb Bb Db', 'C#7': 'C# E# G# B', 'F#maj7': 'F# A# C# E#',
  Abm: 'Ab Cb Eb', 'G#dim7': 'G# B D F', Db7b9: 'Db F Ab Cb Ebb', B7: 'B D# F# A', 'F#': 'F# A# C#', Gb: 'Gb Bb Db',
  'D#m': 'D# F# A#', Bdim: 'B D F', E7: 'E G# B D', 'E7#9': 'E G# B D F##', A13: 'A C# E G B F#', 'C#m7b5': 'C# E G B',
  Bbm7b5: 'Bb Db Fb Ab', Ebmaj7: 'Eb G Bb D', 'G#m': 'G# B D#', Dbmaj7: 'Db F Ab C', Faug: 'F A C#', 'B7b9': 'B D# F# A C',
  Cb: 'Cb Eb Gb', 'A#dim': 'A# C# E', Dm9: 'D F A C E', 'G13': 'G B D F A E', 'Ab7#11': 'Ab C Eb Gb D',
};

const ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'Cb', 'E#', 'B#', 'Fb'];

describe('chord catalog', () => {
  it('has at least 50 types with unique ids, symbols and interval sets', () => {
    expect(CHORD_TYPES.length).toBeGreaterThanOrEqual(50);
    const unique = (values: string[]) => new Set(values).size;
    expect(unique(CHORD_TYPES.map((t) => t.id))).toBe(CHORD_TYPES.length);
    expect(unique(CHORD_TYPES.map((t) => t.symbol))).toBe(CHORD_TYPES.length);
    expect(unique(CHORD_TYPES.map((t) => t.intervals.join(' ')))).toBe(CHORD_TYPES.length);
  });

  it('matches the independent semitone table exactly', () => {
    expect(Object.keys(SEMITONES).sort()).toEqual(CHORD_TYPES.map((t) => t.id).sort());
    for (const type of CHORD_TYPES) expect(type.semitones, type.id).toEqual(SEMITONES[type.id]);
  });

  it('gives every type complete, sane metadata', () => {
    for (const type of CHORD_TYPES) {
      expect(type.id, type.id).toMatch(/^[a-z0-9]+$/);
      expect(type.name.length, type.id).toBeGreaterThan(2);
      expect(type.description.length, type.id).toBeGreaterThan(40);
      expect(type.description, type.id).not.toMatch(/!/);
      expect([1, 2, 3, 4]).toContain(type.tier);
      expect(type.intervals[0]).toBe('P1');
      expect(type.degrees.length).toBe(type.intervals.length);
      expect(type.custom).toBe(false);
      expect(new Set(type.aliases).size, `${type.id} aliases`).toBe(type.aliases.length);
      expect(type.aliases, type.id).not.toContain(type.symbol);
    }
  });

  it('covers every family the school teaches', () => {
    const ids = CHORD_TYPES.map((t) => t.id);
    for (const id of [
      'major', 'minor', 'dim', 'aug', 'sus2', 'sus4', '5', '6', 'm6', '69', 'm69', '7', 'maj7', 'm7', 'mmaj7', 'dim7',
      'm7b5', '7sharp5', 'maj7sharp5', '7sus4', '7sus2', '9', 'maj9', 'm9', '11', 'm11', 'maj7sharp11', '13', 'maj13',
      'm13', '7b9', '7sharp9', '7b5', '7sharp11', '7b13', '7b9b13', '7sharp9sharp5', '7alt', '13b9', '9sharp11',
      'add9', 'madd9', 'add11', 'add4',
    ]) expect(ids, id).toContain(id);
    expect(filterChordTypes({ category: 'triad' }).length).toBeGreaterThanOrEqual(7);
    expect(filterChordTypes({ category: 'altered' }).length).toBeGreaterThanOrEqual(10);
    expect(filterChordTypes({ maxTier: 1 }).map((t) => t.id)).toEqual(['major', 'minor', '5', 'sus2', 'sus4', '7']);
    expect(filterChordTypes({ quality: 'dominant', size: 4 }).map((t) => t.id)).toEqual(['7', '7sharp5', '7b5']);
  });

  it('derives the quality from the intervals', () => {
    const quality = (id: string) => getChordType(id)!.quality;
    expect(quality('major')).toBe('major');
    expect(quality('maj9')).toBe('major');
    expect(quality('m7')).toBe('minor');
    expect(quality('mmaj7')).toBe('minor');
    expect(quality('7')).toBe('dominant');
    expect(quality('7alt')).toBe('dominant');
    expect(quality('13b9')).toBe('dominant');
    expect(quality('dim')).toBe('diminished');
    expect(quality('dim7')).toBe('diminished');
    expect(quality('m7b5')).toBe('half-diminished');
    expect(quality('aug')).toBe('augmented');
    expect(quality('sus4')).toBe('suspended');
    expect(quality('7sus4')).toBe('suspended');
    expect(quality('5')).toBe('power');
  });

  it('looks types up by id, symbol or alias, and searches by text', () => {
    expect(getChordType('maj7')!.id).toBe('maj7');
    expect(getChordType('M7')!.id).toBe('maj7');
    expect(getChordType('Δ')!.id).toBe('maj7');
    expect(getChordType('')!.id).toBe('major');
    expect(getChordType('7#9')!.id).toBe('7sharp9');
    expect(getChordType('7sharp9')!.id).toBe('7sharp9');
    expect(getChordType('ø')!.id).toBe('m7b5');
    expect(getChordType('6/9')!.id).toBe('69');
    expect(getChordType('zzz')).toBeNull();
    expect(searchChordTypes('half-diminished')[0].id).toBe('m7b5');
    expect(searchChordTypes('m7')[0].id).toBe('m7');
    expect(searchChordTypes('power')[0].id).toBe('5');
    expect(searchChordTypes('').length).toBe(CHORD_TYPES.length);
  });
});

describe('parseChord', () => {
  it('spells chord tones correctly', () => {
    for (const [symbol, notes] of Object.entries(SPELLINGS)) {
      expect(chordNotes(symbol).join(' '), symbol).toBe(notes);
    }
  });

  it('reads the symbols found on real charts', () => {
    const cases: Array<[string, string]> = [
      ['F#m7b5/A', 'F#m7b5/A'], ['Bbmaj7', 'Bbmaj7'], ['C-7', 'Cm7'], ['Gsus', 'Gsus4'], ['A7(#9)', 'A7#9'],
      ['Dadd9/F#', 'Dadd9/F#'], ['CM7', 'Cmaj7'], ['CΔ', 'Cmaj7'], ['C△7', 'Cmaj7'], ['CΔ9', 'Cmaj9'], ['Cma7', 'Cmaj7'],
      ['CMaj7', 'Cmaj7'], ['Cmin7', 'Cm7'], ['Cmi7', 'Cm7'], ['CMI7', 'Cm7'], ['C-', 'Cm'], ['Cmin', 'Cm'], ['CM', 'C'],
      ['Cmaj', 'C'], ['Bø', 'Bm7b5'], ['Bø7', 'Bm7b5'], ['B°', 'Bdim'], ['B°7', 'Bdim7'], ['Bo7', 'Bdim7'], ['Bdim7', 'Bdim7'],
      ['G+', 'Gaug'], ['G+7', 'G7#5'], ['G7+', 'G7#5'], ['G7+5', 'G7#5'], ['Gaug7', 'G7#5'], ['G7-5', 'G7b5'],
      ['G7-9', 'G7b9'], ['G7+9', 'G7#9'], ['G+9', 'G9#5'], ['E7(b9,b13)', 'E7b9b13'], ['E7 (b9)', 'E7b9'],
      ['Cm(maj7)', 'CmMaj7'], ['CmM7', 'CmMaj7'], ['C-Δ7', 'CmMaj7'], ['Cm/maj7', 'CmMaj7'], ['Cm#7', 'CmMaj7'],
      ['C6/9', 'C6/9'], ['C69', 'C6/9'], ['C6/9/E', 'C6/9/E'], ['Cm6/9', 'Cm6/9'], ['C2', 'Csus2'], ['C4', 'Csus4'],
      ['Csus2', 'Csus2'], ['C7sus', 'C7sus4'], ['C9sus', 'C9sus4'], ['C(add9)', 'Cadd9'], ['Cadd2', 'Cadd9'],
      ['CMadd9', 'Cadd9'], ['Cm(add9)', 'Cmadd9'], ['C5', 'C5'], ['C(no3)', 'C5'], ['Calt', 'C7alt'], ['C7alt', 'C7alt'],
      ['C7(#5,#9)', 'C7#9#5'], ['C13(b9)', 'C13b9'], ['C9(#11)', 'C9#11'], ['Cmaj7(#11)', 'Cmaj7#11'], ['CM7#11', 'Cmaj7#11'],
      ['Cdom7', 'C7'], ['C7(13)', 'C7add13'], ['Cm7(11)', 'Cm7add11'], ['Cmaj7(9)', 'Cmaj9'], ['C/E', 'C/E'], ['C/Bb', 'C/Bb'],
      ['C/C', 'C'], ['Am/G', 'Am/G'], ['G/B', 'G/B'], ['D/F#', 'D/F#'], ['E♭maj7', 'Ebmaj7'], ['F♯m7♭5', 'F#m7b5'],
      ['  Am7  ', 'Am7'], ['C(b5)', 'C(b5)'], ['Cb5', 'Cb5'], ['C#5', 'C#5'], ['C(#5)', 'Caug'], ['Cm7-5', 'Cm7b5'],
      ['Cj7', 'Cmaj7'], ['C^7', 'Cmaj7'], ['Csus4add9', 'Csus4add9'], ['C7no5', 'C7no5'], ['C7omit3', 'C7no3'],
      ['C13#11', 'C13#11'], ['C7sus4(b9)', 'C7sus4b9'], ['Cmaj13', 'Cmaj13'], ['Cdim(maj7)', 'CdimMaj7'], ['Ab+', 'Abaug'],
      ['Bb-7', 'Bbm7'], ['Bbm7b5/Ab', 'Bbm7b5/Ab'], ['F#°7', 'F#dim7'], ['Dbmaj7#11', 'Dbmaj7#11'],
    ];
    for (const [input, canonical] of cases) {
      const parsed = parseChord(input);
      expect(parsed, input).not.toBeNull();
      expect(parsed!.symbol, input).toBe(canonical);
    }
  });

  it('keeps a root accidental with the root', () => {
    expect(chord('Cb5')).toMatchObject({ root: 'Cb', type: { id: '5' } });
    expect(chord('C#9')).toMatchObject({ root: 'C#', type: { id: '9' } });
    expect(chord('Ab9')).toMatchObject({ root: 'Ab', type: { id: '9' } });
    expect(chord('C(b5)')).toMatchObject({ root: 'C', type: { id: 'majb5' } });
    expect(chord('C7(#9)')).toMatchObject({ root: 'C', type: { id: '7sharp9' } });
  });

  it('treats N.C. as no chord, and rejects nonsense', () => {
    for (const nc of ['N.C.', 'NC', 'N.C', 'n.c.', 'no chord', 'N/C', 'tacet']) {
      expect(isNoChord(nc), nc).toBe(true);
      expect(parseChord(nc), nc).toBeNull();
      expect(normalizeChordSymbol(nc)).toBe('N.C.');
      expect(formatChord(nc)).toBe('N.C.');
    }
    for (const bad of ['', 'H7', 'Xm', 'Cfoo', 'C7b', 'hello', 'Cm5', '7', 'c', 'C/X', 'C7/']) expect(parseChord(bad), bad).toBeNull();
    expect(isChord('Am7')).toBe(true);
    expect(isChord('Amz')).toBe(false);
    expect(() => chord('nope')).toThrow(RangeError);
    expect(normalizeChordSymbol('C-7')).toBe('Cm7');
    expect(normalizeChordSymbol('???')).toBeNull();
  });

  it('reads German roots on request', () => {
    expect(parseChord('H7', { german: true })!.symbol).toBe('B7');
    expect(parseChord('Hm', { german: true })!.symbol).toBe('Bm');
    expect(parseChord('B', { german: true })!.symbol).toBe('Bb');
    expect(parseChord('B7', { german: true })!.symbol).toBe('Bb7');
    expect(parseChord('Am/H', { german: true })!.symbol).toBe('Am/B');
    expect(parseChord('F#m', { german: true })!.symbol).toBe('F#m');
    expect(parseChord('B7')!.symbol).toBe('B7');
  });

  it('parses every alias of every type to that type', () => {
    for (const type of CHORD_TYPES) {
      for (const alias of [type.symbol, ...type.aliases]) {
        for (const root of ['C', 'F#', 'Bb']) {
          const parsed = parseChord(`${root}${alias}`);
          expect(parsed, `${root}${alias}`).not.toBeNull();
          expect(parsed!.type.id, `${root}${alias}`).toBe(type.id);
          expect(parsed!.root).toBe(root);
        }
      }
    }
  });

  it('is stable through parse -> format -> parse for every type on every root', () => {
    for (const type of CHORD_TYPES) {
      for (const root of ROOTS) {
        const symbol = `${root}${type.symbol}`;
        const first = parseChord(symbol);
        expect(first, symbol).not.toBeNull();
        expect(first!.symbol, symbol).toBe(symbol);
        expect(first!.type.id, symbol).toBe(type.id);
        expect(first!.root, symbol).toBe(root);
        const second = parseChord(first!.symbol)!;
        expect(second.symbol).toBe(first!.symbol);
        expect(second.notes).toEqual(first!.notes);
        // The same must hold with a slash bass.
        const slashed = parseChord(`${symbol}/${first!.notes[1]}`)!;
        expect(slashed.symbol, `${symbol} slash`).toBe(`${symbol}/${first!.notes[1]}`);
        expect(slashed.type.id).toBe(type.id);
        expect(slashed.inversion).toBe(1);
        expect(parseChord(slashed.symbol)!.symbol).toBe(slashed.symbol);
      }
    }
  });

  it('spells every chord tone at the right pitch on every root', () => {
    for (const type of CHORD_TYPES) {
      for (const root of ROOTS) {
        const c = chord(`${root}${type.symbol}`);
        const offsets = c.notes.map((n) => (chroma(n) - chroma(root) + 12) % 12);
        expect(offsets, c.symbol).toEqual(SEMITONES[type.id].map((s) => s % 12));
      }
    }
  });

  it('names chords the catalog does not hold, and reads its own names back', () => {
    const odd = [
      'C7no5', 'C7no3', 'Csus4add9', 'C7add13', 'C7add11', 'C13add11', 'Cmaj7add13', 'CmMaj13', 'Cm11b5', 'C11b9',
      'Cmadd4', 'C6no3', 'Cdim7add9', 'Cmaj9#5', 'C13sus4b9', 'Cmaj13#11', 'C7#11add13', 'Cadd9b5', 'Caddb9',
      'C5add9', 'Cm6add11', 'C7b5b13', 'Cmaj11', 'C9no5', 'Cm9#5', 'Cmaj7sus4', 'C7sus2sus4', 'Caugadd9', 'Cdimadd9',
    ];
    for (const symbol of odd) {
      const first = parseChord(symbol);
      expect(first, symbol).not.toBeNull();
      expect(first!.type.custom, symbol).toBe(true);
      const second = parseChord(first!.symbol);
      expect(second, `${symbol} -> ${first!.symbol}`).not.toBeNull();
      expect(second!.type.intervals, `${symbol} -> ${first!.symbol}`).toEqual(first!.type.intervals);
      expect(second!.symbol).toBe(first!.symbol);
      expect(first!.type.id).toMatch(/^[a-z0-9]+$/);
    }
    expect(parseChord('C7no5')!.notes).toEqual(['C', 'E', 'Bb']);
    expect(parseChord('C13sus4b9')!.notes).toEqual(['C', 'F', 'G', 'Bb', 'Db', 'A']);
  });

  it('generates a name for every catalog interval set that parses back to the same set', () => {
    for (const type of CHORD_TYPES) {
      const viaSemitones = chordTypeFromSemitones(type.semitones);
      expect(viaSemitones.semitones.map((s) => s % 12).sort(), type.id).toEqual(type.semitones.map((s) => s % 12).sort());
    }
  });
});

describe('chord tones and voicing', () => {
  it('assigns roles', () => {
    const roles = (symbol: string) => chordTones(symbol).map((t) => `${t.degree}:${t.role}`).join(' ');
    expect(roles('C7')).toBe('1:root 3:third 5:fifth b7:seventh');
    expect(roles('Cm9')).toBe('1:root b3:third 5:fifth b7:seventh 9:ninth');
    expect(roles('C13')).toBe('1:root 3:third 5:fifth b7:seventh 9:ninth 13:thirteenth');
    expect(roles('Csus4')).toBe('1:root 4:fourth 5:fifth');
    expect(roles('C6')).toBe('1:root 3:third 5:fifth 6:sixth');
    expect(roles('Cmaj7#11')).toBe('1:root 3:third 5:fifth 7:seventh #11:eleventh');
    expect(chordTones('F#m7b5').map((t) => t.note)).toEqual(['F#', 'A', 'C', 'E']);
  });

  it('marks altered tones', () => {
    const altered = (symbol: string) => chordTones(symbol).filter((t) => t.altered).map((t) => t.degree);
    expect(altered('C7')).toEqual([]);
    expect(altered('Cm7')).toEqual([]);
    expect(altered('Cdim7')).toEqual([]);
    expect(altered('Cm7b5')).toEqual([]);
    expect(altered('Caug')).toEqual([]);
    expect(altered('C7#9')).toEqual(['#9']);
    expect(altered('C7b5')).toEqual(['b5']);
    expect(altered('C7#5')).toEqual(['#5']);
    expect(altered('C13b9')).toEqual(['b9']);
    expect(altered('Cmaj7#11')).toEqual(['#11']);
    expect(altered('C7alt')).toEqual(['b9', '#9', '#11', 'b13']);
  });

  it('knows which tones a voicing may drop', () => {
    const omit = (symbol: string) => omittableTones(symbol).map((t) => t.degree);
    expect(omit('C')).toEqual([]);
    expect(omit('Cm')).toEqual([]);
    expect(omit('C5')).toEqual([]);
    expect(omit('C6')).toEqual([]);
    expect(omit('C7')).toEqual(['5']);
    expect(omit('Cmaj7')).toEqual(['5']);
    expect(omit('C9')).toEqual(['5']);
    expect(omit('C13')).toEqual(['5', '9']);
    expect(omit('C11')).toEqual(['3', '5', '9']);
    expect(omit('Cm11')).toEqual(['5', '9']);
    expect(omit('C7b5')).toEqual([]);
    expect(omit('Cdim7')).toEqual([]);
    expect(omit('C6/9')).toEqual(['5']);
    expect(omit('C7#9')).toEqual(['5']);
  });

  it('picks the most important tones for a small voicing', () => {
    const pick = (symbol: string, n: number) => voicingTones(symbol, n).map((t) => t.degree);
    expect(pick('C13', 4)).toEqual(['1', '3', 'b7', '13']);
    expect(pick('C7', 3)).toEqual(['1', '3', 'b7']);
    expect(pick('C7', 2)).toEqual(['3', 'b7']);
    expect(pick('Cm9', 4)).toEqual(['1', 'b3', 'b7', '9']);
    expect(pick('C7#9', 4)).toEqual(['1', '3', 'b7', '#9']);
    expect(pick('C', 5)).toEqual(['1', '3', '5']);
  });

  it('gives pitch classes and reference MIDI voicings', () => {
    expect(chordPcs('C')).toEqual([0, 4, 7]);
    expect(chordPcs('C/Bb')).toEqual([10, 0, 4, 7]);
    expect(chordPcs('C13')).toEqual([0, 4, 7, 10, 2, 9]);
    expect(chordMidi('C')).toEqual([48, 52, 55]);
    expect(chordMidi('C', { octave: 4 })).toEqual([60, 64, 67]);
    expect(chordMidi('C9')).toEqual([48, 52, 55, 58, 62]);
    expect(chordMidi('C/E')).toEqual([40, 48, 55]);
    expect(chordMidi('C/Bb')).toEqual([46, 48, 52, 55]);
    expect(chordNotes('C/E', { withBass: true })).toEqual(['E', 'C', 'G']);
    expect(chordNotes('C/D', { withBass: true })).toEqual(['D', 'C', 'E', 'G']);
    expect(chordNotesFrom('C9')).toEqual(['C3', 'E3', 'G3', 'Bb3', 'D4']);
    expect(chordNotesFrom('B7b9', 2)).toEqual(['B2', 'D#3', 'F#3', 'A3', 'C4']);
    expect(chordNotesFrom('Cb', 3).map((n) => noteToMidi(n))).toEqual([47, 51, 54]);
  });
});

describe('formatChord', () => {
  it('uses music symbols', () => {
    expect(formatChord('Bbm7b5/Ab')).toBe('B♭m7♭5/A♭');
    expect(formatChord('F#7#9')).toBe('F♯7♯9');
    expect(formatChord('C')).toBe('C');
    expect(formatChord('Cmaj7')).toBe('Cmaj7');
    expect(formatChord('C-7')).toBe('Cm7');
    expect(formatChord('Bbm7b5', { ascii: true })).toBe('Bbm7b5');
    expect(formatChord('Cdim7')).toBe('Cdim7');
    expect(formatChord('C(b5)')).toBe('C(♭5)');
    expect(formatChord('Dadd9/F#')).toBe('Dadd9/F♯');
  });

  it('supports jazz glyphs and other naming systems', () => {
    expect(formatChord('Cmaj7', { jazz: true })).toBe('C△7');
    expect(formatChord('Bm7b5', { jazz: true })).toBe('Bø7');
    expect(formatChord('Bdim7', { jazz: true })).toBe('B°7');
    expect(formatChord('Caug', { jazz: true })).toBe('C+');
    expect(formatChord('CmMaj7', { jazz: true })).toBe('Cm△7');
    expect(formatChord('B7', { system: 'german' })).toBe('H7');
    expect(formatChord('Bbm', { system: 'german' })).toBe('Bm');
    expect(formatChord('G7/B', { system: 'german' })).toBe('G7/H');
    expect(formatChord('G7', { system: 'solfege' })).toBe('Sol7');
    expect(formatChord('Bbm7b5', { system: 'solfege' })).toBe('Si♭m7♭5');
  });
});

describe('identifyChords', () => {
  // Three catalog types share their notes with a simpler or earlier chord, which is what a
  // musician would call them: add4 = add11; m(b6) = a major seventh chord in first inversion;
  // m7#5 = an add9 chord in first inversion.
  const SAME_NOTES: Record<string, { id: string; rootOffset: number }> = {
    add4: { id: 'add11', rootOffset: 0 },
    mb6: { id: 'maj7', rootOffset: 8 },
    m7sharp5: { id: 'add9', rootOffset: 8 },
  };

  it('names every catalog type in root position, on every root', () => {
    for (const type of CHORD_TYPES) {
      for (const root of ROOTS) {
        const c = chord(`${root}${type.symbol}`);
        const matches = identifyChords(c.notes);
        const best = matches[0];
        expect(best, c.symbol).toBeDefined();
        const alias = SAME_NOTES[type.id];
        expect(best.chord.type.id, c.symbol).toBe(alias ? alias.id : type.id);
        expect((chroma(best.chord.root) - chroma(root) + 12) % 12, c.symbol).toBe(alias ? alias.rootOffset : 0);
        if (!alias) {
          expect(best.chord.root, c.symbol).toBe(root);
          expect(best.chord.bass, c.symbol).toBeNull();
        }
        // The chord itself is always among the candidates, as an exact root-position match.
        if (type.id !== 'add4') {
          const own = matches.find((m) => m.chord.type.id === type.id && m.chord.root === root);
          expect(own, `${c.symbol} among candidates`).toBeDefined();
          expect(own!.kind).toBe('exact');
          expect(own!.chord.bass).toBeNull();
        }
      }
    }
  });

  it('names every catalog type from MIDI numbers', () => {
    for (const type of CHORD_TYPES) {
      for (let rootMidi = 40; rootMidi < 52; rootMidi++) {
        const best = identifyChords(type.semitones.map((s) => rootMidi + s))[0];
        const alias = SAME_NOTES[type.id];
        expect(best.chord.type.id, `${type.id} @${rootMidi}`).toBe(alias ? alias.id : type.id);
        expect((chroma(best.chord.root) - rootMidi + 120) % 12).toBe(alias ? alias.rootOffset : 0);
        expect(best.kind).toBe('exact');
      }
    }
  });

  it('prefers an everyday chord in inversion to a rare chord in root position', () => {
    expect(identifyChord(['E', 'G', 'B', 'C'])).toBe('Cmaj7/E');
    expect(identifyChords(['E', 'G', 'B', 'C']).map((m) => m.symbol)).toContain('Emb6');
    expect(identifyChord(['E', 'G', 'C', 'D'])).toBe('Cadd9/E');
    expect(identifyChord(['C', 'E', 'G', 'A'])).toBe('C6');
    expect(identifyChord(['A', 'C', 'E', 'G'])).toBe('Am7');
    expect(identifyChord(['B', 'D', 'F', 'A'])).toBe('Bm7b5');
    expect(identifyChord(['D', 'F', 'A', 'B'])).toBe('Dm6');
    expect(identifyChord(['D', 'C', 'E', 'G'])).toBe('C/D');
    expect(identifyChord(['G', 'F', 'A', 'C'])).toBe('F/G');
  });

  it('finds inversions and slash chords', () => {
    expect(identifyChord(['E', 'G', 'C'])).toBe('C/E');
    expect(identifyChord(['G', 'C', 'E'])).toBe('C/G');
    expect(identifyChord(['C', 'E', 'A'])).toBe('Am/C');
    expect(identifyChord(['F#', 'D', 'A'])).toBe('D/F#');
    expect(identifyChord(['B', 'D', 'G'])).toBe('G/B');
    expect(identifyChord(['Bb', 'C', 'E', 'G'])).toBe('C7/Bb');
    expect(identifyChord(['F', 'G', 'B', 'D'])).toBe('G7/F');
    expect(identifyChord(['A', 'C', 'E', 'G'])).toBe('Am7');
    expect(identifyChord(['C', 'E', 'G', 'A'])).toBe('C6');
    expect(identifyChords(['C', 'E', 'G', 'A']).map((m) => m.symbol)).toContain('Am7/C');
    expect(identifyChords(['D', 'C', 'E', 'G']).map((m) => m.symbol)).toEqual(expect.arrayContaining(['C/D', 'D9sus4']));
    expect(identifyChords(['D', 'C', 'E', 'G']).find((m) => m.symbol === 'C/D')!.kind).toBe('slash');
  });

  it('uses the lowest pitch as the bass when octaves or MIDI numbers are given', () => {
    expect(identifyChord([64, 67, 72])).toBe('C/E');
    expect(identifyChord([48, 52, 55, 60, 64])).toBe('C');
    expect(identifyChord(['G4', 'C3', 'E4'])).toBe('C');
    expect(identifyChord(['C4', 'E3', 'G4'])).toBe('C/E');
    // Standard-tuning shapes: open E, open Am7, open D7, and an F#m barre.
    expect(identifyChord([40, 47, 52, 56, 59, 64])).toBe('E');
    expect(identifyChord([45, 52, 55, 60, 64])).toBe('Am7');
    expect(identifyChord([50, 57, 60, 66])).toBe('D7');
    expect(identifyChord([42, 49, 54, 57, 61, 66])).toBe('F#m');
  });

  it('chooses the most readable root spelling for MIDI input', () => {
    expect(identifyChord([61, 65, 68])).toBe('Db');
    expect(identifyChord([61, 64, 68])).toBe('C#m');
    expect(identifyChord([56, 59, 63])).toBe('G#m');
    expect(identifyChord([58, 62, 65])).toBe('Bb');
    expect(identifyChord([54, 58, 61])).toBe('F#');
    expect(identifyChord([51, 54, 58])).toBe('Ebm');
    expect(identifyChord([61, 65, 68], { prefer: 'sharps' })).toBe('C#');
    expect(identifyChord([61, 64, 68], { prefer: 'flats' })).toBe('Dbm');
  });

  it('keeps the spelling of named input', () => {
    expect(identifyChord(['C#', 'E#', 'G#'])).toBe('C#');
    expect(identifyChord(['Db', 'F', 'Ab'])).toBe('Db');
    expect(identifyChord(['Gb', 'Bb', 'Db', 'Fb'])).toBe('Gb7');
    expect(identifyChord(['A#', 'C#', 'E'])).toBe('A#dim');
  });

  it('accepts voicings that drop the fifth, and reports that', () => {
    const c7 = identifyChords(['C', 'E', 'Bb']);
    expect(c7[0].symbol).toBe('C7');
    expect(c7[0].kind).toBe('partial');
    expect(c7[0].omitted).toEqual(['5']);
    expect(identifyChord(['C', 'Bb', 'E', 'A'])).toBe('C13');
    expect(identifyChord(['E', 'G#', 'D', 'G'])).toBe('E7#9');
    expect(identifyChords(['C', 'Bb', 'E', 'A'])[0].omitted).toEqual(['5', '9']);
    expect(identifyChords(['C', 'E', 'Bb'], { allowPartial: false })).toEqual([]);
  });

  it('takes a spelling function and tolerates bad input', () => {
    const inFlats = (pc: number) => ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][pc];
    const inSharps = (pc: number) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][pc];
    expect(identifyChord([54, 58, 61], { spell: inFlats })).toBe('Gb');
    expect(identifyChord([54, 58, 61], { spell: inSharps })).toBe('F#');
    expect(identifyChord([56, 60, 63, 66], { spell: inSharps })).toBe('G#7');
    expect(identifyChord([56, 60, 63, 66], { spell: () => 'nonsense' })).toBe('Ab7');
    expect(identifyChord(['C', '???', 'E', 'G'])).toBe('C');
    expect(identifyChord([60, NaN, 64, 67])).toBe('C');
    expect(identifyChords(['x', 'y'])).toEqual([]);
    expect(identifyChords([])).toEqual([]);
  });

  it('returns nothing for a single note or an unknown cluster', () => {
    expect(identifyChords(['C'])).toEqual([]);
    expect(identifyChords(['C', 'C'])).toEqual([]);
    expect(identifyChords(['C', 'Db', 'D'])).toEqual([]);
    expect(identifyChord(['C', 'Db', 'D'])).toBeNull();
    expect(identifyChord(['C', 'G'])).toBe('C5');
  });
});

describe('inversions and relationships', () => {
  it('lists inversions', () => {
    expect(chordInversions('C')).toEqual(['C', 'C/E', 'C/G']);
    expect(chordInversions('Cmaj7')).toEqual(['Cmaj7', 'Cmaj7/E', 'Cmaj7/G', 'Cmaj7/B']);
    expect(chordInversions('F#m')).toEqual(['F#m', 'F#m/A', 'F#m/C#']);
    expect(invertChord('G7', 3)).toBe('G7/F');
    expect(invertChord('G7/B', 0)).toBe('G7');
    expect(chord('C/E').inversion).toBe(1);
    expect(chord('C/G').inversion).toBe(2);
    expect(chord('C7/Bb').inversion).toBe(3);
    expect(chord('C').inversion).toBe(0);
    expect(chord('C/D').inversion).toBeNull();
    expect(chord('C/Fb').inversion).toBe(1);
  });

  it('transposes with correct spelling', () => {
    expect(transposeChord('Am7/G', 'M2')).toBe('Bm7/A');
    expect(transposeChord('C', 'm3')).toBe('Eb');
    expect(transposeChord('F#m7b5', 'P4')).toBe('Bm7b5');
    expect(transposeChord('D/F#', 'M3')).toBe('F#/A#');
    expect(transposeChord('Bb7', '-M2')).toBe('Ab7');
    expect(transposeChord('C#', 'A1')).toBe('D');
    expect(transposeChordBySemitones('C', 1)).toBe('Db');
    expect(transposeChordBySemitones('Am', 4)).toBe('C#m');
    expect(transposeChordBySemitones('C/E', 2)).toBe('D/F#');
    expect(transposeChordBySemitones('G7', -2)).toBe('F7');
    expect(transposeChordBySemitones('C', 6)).toBe('F#');
    expect(transposeChordBySemitones('C', 1, 'sharps')).toBe('C#');
    expect(transposeChordBySemitones('Em', -1)).toBe('Ebm');
  });

  it('relates chords: relative, parallel, tritone substitute', () => {
    expect(relativeChord('C')).toBe('Am');
    expect(relativeChord('Am')).toBe('C');
    expect(relativeChord('Cmaj7')).toBe('Am7');
    expect(relativeChord('F#m7')).toBe('Amaj7');
    expect(relativeChord('Eb')).toBe('Cm');
    expect(relativeChord('G7')).toBeNull();
    expect(parallelChord('C')).toBe('Cm');
    expect(parallelChord('Cm')).toBe('C');
    expect(parallelChord('Cmaj7')).toBe('Cm7');
    expect(parallelChord('C6')).toBe('Cm6');
    expect(parallelChord('Cdim')).toBeNull();
    const subs: Array<[string, string]> = [
      ['G7', 'Db7'], ['Db7', 'G7'], ['D7', 'Ab7'], ['C7', 'Gb7'], ['F7', 'B7'], ['Bb7', 'E7'], ['A7', 'Eb7'], ['E7', 'Bb7'],
      ['B7', 'F7'], ['F#7', 'C7'], ['D9', 'Ab9'], ['G13/F', 'Db13'],
    ];
    for (const [from, to] of subs) {
      expect(tritoneSubstitute(from), from).toBe(to);
      // A dominant and its substitute share the same third and seventh (swapped).
      const guide = (symbol: string) => chordTones(symbol).filter((t) => t.role === 'third' || t.role === 'seventh').map((t) => chroma(t.note)).sort();
      expect(guide(to), from).toEqual(guide(from));
    }
    expect(tritoneSubstitute('Cmaj7')).toBeNull();
    expect(isDominant('G7')).toBe(true);
    expect(isDominant('G13b9')).toBe(true);
    expect(isDominant('Gmaj7')).toBe(false);
  });

  it('builds chords from parts', () => {
    expect(buildChord('F#', 'm7b5').symbol).toBe('F#m7b5');
    expect(buildChord('Bb', 'maj7', 'D').symbol).toBe('Bbmaj7/D');
    expect(buildChord('C').symbol).toBe('C');
    expect(buildChord('C', '7sharp9').symbol).toBe('C7#9');
    expect(buildChord('C', 'Δ').symbol).toBe('Cmaj7');
    expect(buildChord('C', '13add11').type.custom).toBe(true);
  });
});
