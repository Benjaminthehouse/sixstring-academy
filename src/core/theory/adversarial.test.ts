/**
 * Adversarial tests: the cases a theory engine usually gets wrong. Every expected value here was
 * written from music theory, not copied from the implementation's output; where the two
 * disagreed the implementation was fixed. Tables are deliberately independent of the catalogs.
 */
import { describe, expect, it } from 'vitest';
import * as T from './index';

const LETTERS = 'CDEFGAB';
const TONICS = [...LETTERS].flatMap((l) => [l, `${l}#`, `${l}b`]);
const pc = (name: string) => T.note(name).chroma;
const pcs = (names: string[]) => names.map(pc);
const sorted = (list: number[]) => [...new Set(list)].sort((a, b) => a - b);
const maxAlt = (names: string[]) => Math.max(...names.map((n) => Math.abs(T.note(n).alt)));
const letterOf = (name: string) => T.note(name).letter;

// ── 1. Spelling in all thirty keys, and the theoretical ones beyond them ───────────────────

/** The fifteen major scales, typed by hand. */
const MAJOR_SCALES: Record<string, string> = {
  C: 'C D E F G A B', G: 'G A B C D E F#', D: 'D E F# G A B C#', A: 'A B C# D E F# G#', E: 'E F# G# A B C# D#',
  B: 'B C# D# E F# G# A#', 'F#': 'F# G# A# B C# D# E#', 'C#': 'C# D# E# F# G# A# B#',
  F: 'F G A Bb C D E', Bb: 'Bb C D Eb F G A', Eb: 'Eb F G Ab Bb C D', Ab: 'Ab Bb C Db Eb F G',
  Db: 'Db Eb F Gb Ab Bb C', Gb: 'Gb Ab Bb Cb Db Eb F', Cb: 'Cb Db Eb Fb Gb Ab Bb',
};
/** Relative minor of each major key and its raised sixth and seventh (melodic and harmonic minor). */
const MINOR_KEYS: Record<string, { tonic: string; raised6: string; raised7: string }> = {
  C: { tonic: 'A', raised6: 'F#', raised7: 'G#' }, G: { tonic: 'E', raised6: 'C#', raised7: 'D#' },
  D: { tonic: 'B', raised6: 'G#', raised7: 'A#' }, A: { tonic: 'F#', raised6: 'D#', raised7: 'E#' },
  E: { tonic: 'C#', raised6: 'A#', raised7: 'B#' }, B: { tonic: 'G#', raised6: 'E#', raised7: 'F##' },
  'F#': { tonic: 'D#', raised6: 'B#', raised7: 'C##' }, 'C#': { tonic: 'A#', raised6: 'F##', raised7: 'G##' },
  F: { tonic: 'D', raised6: 'B', raised7: 'C#' }, Bb: { tonic: 'G', raised6: 'E', raised7: 'F#' },
  Eb: { tonic: 'C', raised6: 'A', raised7: 'B' }, Ab: { tonic: 'F', raised6: 'D', raised7: 'E' },
  Db: { tonic: 'Bb', raised6: 'G', raised7: 'A' }, Gb: { tonic: 'Eb', raised6: 'C', raised7: 'D' },
  Cb: { tonic: 'Ab', raised6: 'F', raised7: 'G' },
};

describe('spelling in all thirty keys', () => {
  it('spells every major scale and its relative minor exactly', () => {
    expect(T.ALL_KEYS).toHaveLength(30);
    for (const [tonic, text] of Object.entries(MAJOR_SCALES)) {
      const scale = text.split(' ');
      expect(T.key(`${tonic} major`).scale, `${tonic} major`).toEqual(scale);
      expect(T.scaleNotes(tonic, 'major'), `${tonic} major scale`).toEqual(scale);
      const minor = MINOR_KEYS[tonic];
      const natural = [...scale.slice(5), ...scale.slice(0, 5)];
      const k = T.key(`${minor.tonic} minor`);
      expect(k.scale, k.name).toEqual(natural);
      expect(k.harmonicMinor, `${k.name} harmonic`).toEqual([...natural.slice(0, 6), minor.raised7]);
      expect(k.melodicMinor, `${k.name} melodic`).toEqual([...natural.slice(0, 5), minor.raised6, minor.raised7]);
      expect(k.relative).toBe(`${tonic} major`);
      expect(T.key(`${tonic} major`).relative).toBe(k.name);
      expect(k.fifths).toBe(T.key(`${tonic} major`).fifths);
    }
  });

  it('gives every key seven letters in order and a signature that is exactly its accidentals', () => {
    for (const k of T.ALL_KEYS) {
      const start = LETTERS.indexOf(letterOf(k.tonic));
      expect(k.scale.map(letterOf).join(''), k.name).toBe([...Array(7).keys()].map((i) => LETTERS[(start + i) % 7]).join(''));
      expect(k.scale.filter((n) => T.note(n).alt !== 0).sort(), k.name).toEqual([...k.signature.accidentals].sort());
      expect(k.signature.count).toBe(Math.abs(k.fifths));
      expect(k.theoretical).toBe(false);
      expect(T.getKey(k.id), k.id).toBe(k);
      expect(T.getKey(k.name)).toBe(k);
      expect(T.getKey(k.short)).toBe(k);
      // The leading tone of a minor key keeps the letter of the seventh degree, one semitone up.
      if (k.harmonicMinor) {
        expect(letterOf(k.harmonicMinor[6])).toBe(letterOf(k.scale[6]));
        expect(pc(k.harmonicMinor[6])).toBe((pc(k.scale[6]) + 1) % 12);
        expect(T.intervalBetween(k.harmonicMinor[6], k.tonic)).toBe('m2');
      }
    }
  });

  it('builds the dominant and leading-tone chords of the hard minor keys with their double sharps', () => {
    const cases: Array<[string, string, string[], string, string[]]> = [
      ['G# minor', 'D#7', ['D#', 'F##', 'A#', 'C#'], 'F##dim7', ['F##', 'A#', 'C#', 'E']],
      ['D# minor', 'A#7', ['A#', 'C##', 'E#', 'G#'], 'C##dim7', ['C##', 'E#', 'G#', 'B']],
      ['A# minor', 'E#7', ['E#', 'G##', 'B#', 'D#'], 'G##dim7', ['G##', 'B#', 'D#', 'F#']],
      ['C# minor', 'G#7', ['G#', 'B#', 'D#', 'F#'], 'B#dim7', ['B#', 'D#', 'F#', 'A']],
      ['Ab minor', 'Eb7', ['Eb', 'G', 'Bb', 'Db'], 'Gdim7', ['G', 'Bb', 'Db', 'Fb']],
      ['Eb minor', 'Bb7', ['Bb', 'D', 'F', 'Ab'], 'Ddim7', ['D', 'F', 'Ab', 'Cb']],
    ];
    for (const [keyName, five, fiveNotes, seven, sevenNotes] of cases) {
      const chords = T.diatonicChords(keyName, { sevenths: true, minor: 'harmonic' });
      expect(chords[4].symbol, keyName).toBe(five);
      expect(chords[4].notes, keyName).toEqual(fiveNotes);
      expect(chords[6].symbol, keyName).toBe(seven);
      expect(chords[6].notes, keyName).toEqual(sevenNotes);
      expect(T.romanToChord('V7', keyName)).toBe(five);
      expect(T.romanToChord('vii°7', keyName)).toBe(seven);
      expect(T.chordNotes(five)).toEqual(fiveNotes);
      expect(T.chordNotes(seven)).toEqual(sevenNotes);
    }
  });

  it('spells the chords of the extreme flat keys', () => {
    expect(T.diatonicChords('Cb major').map((c) => c.symbol)).toEqual(['Cb', 'Dbm', 'Ebm', 'Fb', 'Gb', 'Abm', 'Bbdim']);
    expect(T.chordNotes('Fb')).toEqual(['Fb', 'Ab', 'Cb']);
    expect(T.chordNotes('Dbm')).toEqual(['Db', 'Fb', 'Ab']);
    expect(T.diatonicChords('Ab minor').map((c) => c.symbol)).toEqual(['Abm', 'Bbdim', 'Cb', 'Dbm', 'Ebm', 'Fb', 'Gb']);
    expect(T.diatonicChords('Gb major', { sevenths: true }).map((c) => c.symbol)).toEqual(['Gbmaj7', 'Abm7', 'Bbm7', 'Cbmaj7', 'Db7', 'Ebm7', 'Fm7b5']);
    expect(T.chordNotes('Fm7b5')).toEqual(['F', 'Ab', 'Cb', 'Eb']);
    expect(T.diatonicChords('C# major', { sevenths: true }).map((c) => c.symbol)).toEqual(['C#maj7', 'D#m7', 'E#m7', 'F#maj7', 'G#7', 'A#m7', 'B#m7b5']);
    expect(T.chordNotes('B#m7b5')).toEqual(['B#', 'D#', 'F#', 'A#']);
    expect(T.chordNotes('E#m7')).toEqual(['E#', 'G#', 'B#', 'D#']);
  });

  it('handles theoretical keys and points to their practical spelling', () => {
    const cases: Array<[string, number, string, string]> = [
      ['G# major', 8, 'G# A# B# C# D# E# F##', 'Ab major'],
      ['D# major', 9, 'D# E# F## G# A# B# C##', 'Eb major'],
      ['A# major', 10, 'A# B# C## D# E# F## G##', 'Bb major'],
      ['Fb major', -8, 'Fb Gb Ab Bbb Cb Db Eb', 'E major'],
      ['Db minor', -8, 'Db Eb Fb Gb Ab Bbb Cb', 'C# minor'],
      ['Gb minor', -9, 'Gb Ab Bbb Cb Db Ebb Fb', 'F# minor'],
      ['E# minor', 8, 'E# F## G# A# B# C# D#', 'F minor'],
    ];
    for (const [name, fifths, scale, practical] of cases) {
      const k = T.key(name);
      expect(k.fifths, name).toBe(fifths);
      expect(k.scale.join(' '), name).toBe(scale);
      expect(k.theoretical, name).toBe(true);
      expect(T.practicalKey(k).name, name).toBe(practical);
      expect(k.scale.map(letterOf).length).toBe(new Set(k.scale.map(letterOf)).size);
      expect(sorted(pcs(k.scale))).toEqual(sorted(pcs(T.practicalKey(k).scale)));
    }
    expect(T.key('G# major').signature.accidentals).toEqual(['F##', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#']);
    expect(T.key('Fb major').signature.accidentals).toEqual(['Bbb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb']);
    for (const k of T.ALL_KEYS) expect(T.practicalKey(k)).toBe(k);
  });

  it('pairs the enharmonic keys and only those', () => {
    const pairs = [['B major', 'Cb major'], ['F# major', 'Gb major'], ['C# major', 'Db major'], ['G# minor', 'Ab minor'], ['D# minor', 'Eb minor'], ['A# minor', 'Bb minor']];
    const paired = new Set(pairs.flat());
    for (const [a, b] of pairs) {
      expect(T.enharmonicKey(a)!.name).toBe(b);
      expect(T.enharmonicKey(b)!.name).toBe(a);
      expect(sorted(pcs(T.key(a).scale))).toEqual(sorted(pcs(T.key(b).scale)));
    }
    for (const k of T.ALL_KEYS) if (!paired.has(k.name)) expect(T.enharmonicKey(k), k.name).toBeNull();
  });

  it('names outside notes for display: the key keeps its own double sharps, strangers lose theirs', () => {
    // F## is the leading tone of G# minor and stays; the b6 of Gb major is shown as D, not Ebb.
    expect(T.spellInKey(7, 'G# minor')).toBe('F##');
    expect(T.spellInKey(2, 'D# minor')).toBe('C##');
    expect(T.spellInKey(0, 'D# minor')).toBe('B#');
    expect(T.spellInKey(2, 'Gb major')).toBe('D');
    expect(T.spellInKey(2, 'Gb major', { strict: true })).toBe('Ebb');
    expect(T.spellInKey(7, 'Gb major')).toBe('G');
    expect(T.spellInKey(7, 'Gb major', { strict: true })).toBe('Abb');
    expect(T.spellInKey(62, 'Gb major')).toBe('D4');
    for (const k of T.ALL_KEYS) {
      const own = new Set([...k.scale, ...(k.harmonicMinor ?? []), ...(k.melodicMinor ?? [])]);
      for (let p = 0; p < 12; p++) {
        const name = T.spellInKey(p, k);
        expect(pc(name), `${p} in ${k.name}`).toBe(p);
        expect(Math.abs(T.note(name).alt) < 2 || own.has(name), `${name} in ${k.name}`).toBe(true);
        expect(pc(T.spellInKey(p, k, { strict: true }))).toBe(p);
      }
    }
  });

  it('reads key names however they are written', () => {
    const cases: Array<[string, string | null]> = [
      ['C', 'C major'], ['Cm', 'C minor'], ['c minor', 'C minor'], ['CM', 'C major'], ['A-', 'A minor'], ['D−', 'D minor'],
      ['F♯m', 'F# minor'], ['B♭ major', 'Bb major'], ['F sharp minor', 'F# minor'], ['B-flat', 'Bb major'],
      ['key of G', 'G major'], ['in the key of F# minor', 'F# minor'], ['Eb minor key', 'Eb minor'],
      ['A harmonic minor', 'A minor'], ['A melodic minor', 'A minor'], ['G major scale', 'G major'],
      ['f-sharp-minor', 'F# minor'], ['bb-major', 'Bb major'], ['A aeolian', 'A minor'], ['C ionian', 'C major'],
      // German: B is B flat, H is B natural; -is sharpens, -es / -s flattens.
      ['a-Moll', 'A minor'], ['C-Dur', 'C major'], ['B-Dur', 'Bb major'], ['h-Moll', 'B minor'], ['H-Dur', 'B major'],
      ['fis-Moll', 'F# minor'], ['Es-Dur', 'Eb major'], ['As-Dur', 'Ab major'], ['cis-Moll', 'C# minor'], ['b-Moll', 'Bb minor'],
      ['Des-Dur', 'Db major'], ['Ges-Dur', 'Gb major'],
      ['D dorian', null], ['Am7', null], ['C4', null], ['', null], ['H', null], ['Gs-Dur', null], ['key of', null],
    ];
    for (const [text, expected] of cases) expect(T.getKey(text)?.name ?? null, JSON.stringify(text)).toBe(expected);
  });
});

// ── 2. Double accidentals ──────────────────────────────────────────────────────────────────

describe('double accidentals', () => {
  it('reads every way of writing them and rejects mixtures', () => {
    for (const text of ['F##', 'Fx', 'F𝄪', 'F♯♯', 'f##']) expect(T.parseNote(text)!.name, text).toBe('F##');
    for (const text of ['Bbb', 'B𝄫', 'B♭♭', 'bbb']) expect(T.parseNote(text)!.name, text).toBe('Bbb');
    expect(T.parseNote('F##4')).toMatchObject({ midi: 67, chroma: 7, alt: 2, letter: 'F', octave: 4 });
    expect(T.parseNote('Bbb3')).toMatchObject({ midi: 57, chroma: 9, alt: -2, letter: 'B' });
    for (const text of ['C#b', 'Cb#', 'C♮#', 'Cx♭', 'C#♮', 'Cbx']) expect(T.parseNote(text), text).toBeNull();
    expect(T.parseNote('C♮')!.name).toBe('C');
  });

  it('puts the octave break at the letter C, whatever the accidental says', () => {
    const cases: Array<[string, number]> = [
      ['B#3', 60], ['C4', 60], ['Dbb4', 60], ['Cb4', 59], ['B3', 59], ['A##3', 59], ['B##3', 61], ['Cbb4', 58],
      ['E#4', 65], ['Fb4', 64], ['F##4', 67], ['Abb4', 67], ['Cb5', 71], ['B#4', 72], ['B#-1', 12], ['Cb0', 11],
    ];
    for (const [name, midi] of cases) {
      expect(T.noteToMidi(name), name).toBe(midi);
      expect(T.withOctaveFor(T.pcName(name), midi), name).toBe(name);
      expect(T.staffPosition(name, { guitar: false }).written).toBe(name);
    }
    // Same pitch, different staff line: B#3 sits a step below C4.
    expect(T.staffPosition('B#3', { guitar: false }).position).toBe(T.staffPosition('C4', { guitar: false }).position - 1);
    expect(T.staffPosition('Cb4', { guitar: false }).position).toBe(T.staffPosition('B3', { guitar: false }).position + 1);
  });

  it('keeps them through interval arithmetic', () => {
    const cases: Array<[string, string, string]> = [
      ['F##', 'm2', 'G#'], ['F##', 'M3', 'A##'], ['Bbb', 'M3', 'Db'], ['Bbb', 'P5', 'Fb'], ['C##', 'P4', 'F##'],
      ['G#', 'M7', 'F##'], ['D#', 'M7', 'C##'], ['A#', 'M7', 'G##'], ['E#', 'M3', 'G##'], ['B#', 'M3', 'D##'],
      ['Cb', 'm3', 'Ebb'], ['Fb', 'P4', 'Bbb'], ['Gb', 'm2', 'Abb'], ['Db', 'd5', 'Abb'], ['C', 'd7', 'Bbb'],
      ['F##4', 'P8', 'F##5'], ['B#3', 'm2', 'C#4'], ['Cb4', '-m2', 'Bb3'], ['C4', 'd2', 'Dbb4'], ['C4', '-A1', 'Cb4'],
    ];
    for (const [from, ivl, to] of cases) {
      expect(T.transpose(from, ivl), `${from} + ${ivl}`).toBe(to);
      if (!ivl.startsWith('-')) expect(T.intervalBetween(from, to), `${from} -> ${to}`).toBe(ivl);
    }
    expect(T.intervalBetween('Cb', 'B#')).toBe('AA7');
    expect(T.intervalBetween('B#3', 'Cb4')).toBe('dd2');
    expect(T.intervalBetween('C4', 'B#3')).toBe('-d2');
    expect(() => T.intervalBetween('C##', 'Cbb')).toThrow(RangeError);
  });

  it('spells the chords that need them', () => {
    const cases: Array<[string, string]> = [
      ['Cdim7', 'C Eb Gb Bbb'], ['Ebdim7', 'Eb Gb Bbb Dbb'], ['Abm7b5', 'Ab Cb Ebb Gb'], ['Fbmaj7', 'Fb Ab Cb Eb'],
      ['G#7#9', 'G# B# D# F# A##'], ['E7#9', 'E G# B D F##'], ['B7#9', 'B D# F# A C##'], ['D#aug', 'D# F## A##'],
      ['B#', 'B# D## F##'], ['E#m', 'E# G# B#'], ['C#7#5', 'C# E# G## B'], ['A#dim7', 'A# C# E G'],
      ['Gb7b9', 'Gb Bb Db Fb Abb'], ['Db7b5', 'Db F Abb Cb'], ['F#7#11', 'F# A# C# E B#'], ['Bbm7b5', 'Bb Db Fb Ab'],
      ['Dbdim', 'Db Fb Abb'], ['Cb7', 'Cb Eb Gb Bbb'], ['G#maj7#5', 'G# B# D## F##'], ['Ab7b13', 'Ab C Eb Gb Fb'],
    ];
    for (const [symbol, notes] of cases) {
      const c = T.chord(symbol);
      expect(c.notes.join(' '), symbol).toBe(notes);
      expect(c.symbol, symbol).toBe(symbol);
      // Every tone sits on the letter its interval asks for.
      c.type.intervals.forEach((ivl, i) => expect(T.intervalBetween(c.root, c.notes[i]), `${symbol} ${ivl}`).toBe(T.interval(ivl).simple === 'P8' ? 'P1' : T.interval(ivl).simple));
    }
  });

  it('formats and simplifies them', () => {
    expect(T.formatNote('F##')).toBe('F𝄪');
    expect(T.formatNote('Bbb3')).toBe('B𝄫3');
    expect(T.formatNote('F##', { doubles: 'repeat' })).toBe('F♯♯');
    expect(T.formatNote('F##', { ascii: true })).toBe('F##');
    expect(T.formatNote('F##', { system: 'solfege' })).toBe('Fa𝄪');
    expect(T.formatChord('F##dim7')).toBe('F𝄪dim7');
    expect(T.formatChord('Bbb7', { system: 'german' })).toBe('H𝄫7');
    expect(T.germanNoteName('Bbb')).toBe('Heses');
    expect(T.germanNoteName('F##')).toBe('Fisis');
    expect([T.simplifyNote('F##'), T.simplifyNote('Bbb3'), T.simplifyNote('B##3'), T.simplifyNote('Cbb4'), T.simplifyNote('E##')]).toEqual(['G', 'A3', 'C#4', 'Bb3', 'F#']);
    expect(T.enharmonics('G')).toEqual(['F##', 'Abb']);
    expect(T.enharmonicEqual('F##4', 'G4')).toBe(true);
    expect(T.enharmonicEqual('B#3', 'C5')).toBe(false);
  });
});

// ── 3. Chord symbols as they appear in fake books and on tab sites ─────────────────────────

/** [as written, canonical symbol]. Grouped by the habit that produces the spelling. */
const SYMBOLS: Array<[string, string]> = [
  // Major seventh: maj, Maj, MAJ, M, ma, MA, triangle, caret, j, and the Brazilian 7M.
  ['Cmaj7', 'Cmaj7'], ['CMaj7', 'Cmaj7'], ['CMAJ7', 'Cmaj7'], ['CM7', 'Cmaj7'], ['Cma7', 'Cmaj7'], ['CMA7', 'Cmaj7'],
  ['C△', 'Cmaj7'], ['C△7', 'Cmaj7'], ['CΔ7', 'Cmaj7'], ['C∆', 'Cmaj7'], ['C^7', 'Cmaj7'], ['Cj7', 'Cmaj7'],
  ['Cmajor7', 'Cmaj7'], ['C major 7', 'Cmaj7'], ['C7M', 'Cmaj7'], ['C(maj7)', 'Cmaj7'], ['C△9', 'Cmaj9'], ['CM9', 'Cmaj9'],
  ['C7M(9)', 'Cmaj9'], ['C9(maj7)', 'Cmaj9'], ['Cmaj7(9)', 'Cmaj9'], ['CΔ#11', 'Cmaj7#11'], ['D7M(#11)', 'Dmaj7#11'],
  ['Fmaj7#4', 'Fmaj7#11'], ['CM7+5', 'Cmaj7#5'], ['C+M7', 'Cmaj7#5'], ['C△13', 'Cmaj13'],
  // The plain triad written the long way.
  ['CM', 'C'], ['Cmaj', 'C'], ['CMAJ', 'C'], ['Cma', 'C'], ['C major', 'C'], ['CMajor', 'C'],
  // Minor: m, min, mi, MI, minus, and the typographic minus and dashes.
  ['Cm', 'Cm'], ['Cmin', 'Cm'], ['CMIN', 'Cm'], ['Cmi', 'Cm'], ['CMI', 'Cm'], ['C-', 'Cm'], ['C minor', 'Cm'],
  ['Cm7', 'Cm7'], ['C-7', 'Cm7'], ['C−7', 'Cm7'], ['C–7', 'Cm7'], ['Cmin7', 'Cm7'], ['Cmi7', 'Cm7'], ['CMI7', 'Cm7'], ['C m7', 'Cm7'],
  ['C-9', 'Cm9'], ['C-11', 'Cm11'], ['C-6', 'Cm6'], ['C-6/9', 'Cm6/9'], ['Cm69', 'Cm6/9'], ['Cm7(9)', 'Cm9'], ['Cm7(11)', 'Cm7add11'],
  // Minor major seventh in all its disguises.
  ['CmMaj7', 'CmMaj7'], ['CmM7', 'CmMaj7'], ['Cm(maj7)', 'CmMaj7'], ['Cm/maj7', 'CmMaj7'], ['C-Δ7', 'CmMaj7'], ['C-maj7', 'CmMaj7'],
  ['CminMaj7', 'CmMaj7'], ['Cm#7', 'CmMaj7'], ['Cm+7', 'CmMaj7'], ['CMI(MA7)', 'CmMaj7'], ['Cmi(ma7)', 'CmMaj7'], ['Cm7M', 'CmMaj7'],
  ['Cm9(maj7)', 'CmMaj9'], ['CmΔ9', 'CmMaj9'],
  // Diminished and half-diminished: words, circle, letter o, slashed circle, superscripts.
  ['Cdim', 'Cdim'], ['C°', 'Cdim'], ['Co', 'Cdim'], ['Cº', 'Cdim'], ['C diminished', 'Cdim'], ['Cm(b5)', 'Cdim'],
  ['Cdim7', 'Cdim7'], ['C°7', 'Cdim7'], ['Co7', 'Cdim7'], ['C⁰7', 'Cdim7'], ['C˚7', 'Cdim7'],
  ['Cm7b5', 'Cm7b5'], ['Cø', 'Cm7b5'], ['Cø7', 'Cm7b5'], ['CØ7', 'Cm7b5'], ['C⌀7', 'Cm7b5'], ['C-7b5', 'Cm7b5'], ['Cm7(b5)', 'Cm7b5'],
  ['Cm7-5', 'Cm7b5'], ['Cm7(5-)', 'Cm7b5'], ['Cmin7b5', 'Cm7b5'], ['Cm7♭5', 'Cm7b5'], ['C half-diminished 7', 'Cm7b5'], ['Cø9', 'Cm9b5'],
  // Augmented: plus sign before or after, aug, #5, the old 5+.
  ['C+', 'Caug'], ['Caug', 'Caug'], ['C(#5)', 'Caug'], ['C+5', 'Caug'], ['C5+', 'Caug'], ['C augmented', 'Caug'],
  ['C+7', 'C7#5'], ['C7+', 'C7#5'], ['C7+5', 'C7#5'], ['Caug7', 'C7#5'], ['C7(#5)', 'C7#5'], ['C7(5+)', 'C7#5'], ['C+9', 'C9#5'], ['C9+', 'C9#5'],
  // Suspended.
  ['Csus', 'Csus4'], ['Csus4', 'Csus4'], ['C4', 'Csus4'], ['Csus2', 'Csus2'], ['C2', 'Csus2'], ['C7sus', 'C7sus4'], ['Csus7', 'C7sus4'],
  ['C7(4)', 'C7sus4'], ['G7/4', 'G7sus4'], ['A4/7', 'A7sus4'], ['C9sus', 'C9sus4'], ['C11sus', 'C9sus4'], ['C13sus', 'C13sus4'],
  ['Csus2sus4', 'Csus2sus4'], ['Csus24', 'Csus2sus4'], ['Csusb9', 'C7sus4b9'], ['C7sus(b9)', 'C7sus4b9'], ['Csus4(b9)', 'C7sus4b9'],
  // Sixths, add chords, power chords.
  ['C6', 'C6'], ['CM6', 'C6'], ['Cadd6', 'C6'], ['C6/9', 'C6/9'], ['C69', 'C6/9'], ['C6add9', 'C6/9'], ['C6(9)', 'C6/9'],
  ['Cadd9', 'Cadd9'], ['Cadd2', 'Cadd9'], ['C(add9)', 'Cadd9'], ['C add9', 'Cadd9'], ['CADD9', 'Cadd9'], ['Cm(add9)', 'Cmadd9'],
  ['Cadd4', 'Cadd4'], ['Cadd11', 'Cadd11'], ['Cadd#11', 'Cadd#11'], ['C(#4)', 'Cadd#11'],
  ['C5', 'C5'], ['C(no3)', 'C5'], ['Cno3', 'C5'], ['C(no 3rd)', 'C5'], ['Comit3', 'C5'],
  // Dominants and their alterations: sharps and flats, plus and minus, brackets, commas, postfix signs.
  ['C7', 'C7'], ['Cdom7', 'C7'], ['C dominant 7', 'C7'], ['C⁷', 'C7'], ['C7(9)', 'C9'], ['C7/9', 'C9'], ['C9(13)', 'C13'],
  ['C7b9', 'C7b9'], ['C7-9', 'C7b9'], ['C7(b9)', 'C7b9'], ['C7♭9', 'C7b9'], ['C7(9-)', 'C7b9'], ['C7[b9]', 'C7b9'], ['C7{b9}', 'C7b9'],
  ['C7#9', 'C7#9'], ['C7+9', 'C7#9'], ['C7(#9)', 'C7#9'], ['C7♯9', 'C7#9'], ['E7(9+)', 'E7#9'],
  ['C7b5', 'C7b5'], ['C7-5', 'C7b5'], ['C7#11', 'C7#11'], ['C7+11', 'C7#11'], ['C7#4', 'C7#11'], ['C7(11+)', 'C7#11'],
  ['C7b13', 'C7b13'], ['C7-13', 'C7b13'], ['A7(13-)', 'A7b13'], ['C7b9b13', 'C7b9b13'], ['C7(b9,b13)', 'C7b9b13'], ['E7(9-/13-)', 'E7b9b13'],
  ['C7#5#9', 'C7#9#5'], ['C7(#9,#5)', 'C7#9#5'], ['C+7#9', 'C7#9#5'], ['C7+5+9', 'C7#9#5'], ['C7-9+5', 'C7b9#5'], ['C7b5b9', 'C7b9b5'],
  ['C13(#11)', 'C13#11'], ['C13b9', 'C13b9'], ['C9(#11)', 'C9#11'], ['Calt', 'C7alt'], ['C7alt', 'C7alt'], ['C7(alt)', 'C7alt'],
  // Slash chords, the bass in either case, and slashes that are not a bass.
  ['C/E', 'C/E'], ['C/e', 'C/E'], ['D/f#', 'D/F#'], ['G/b', 'G/B'], ['C/bb', 'C/Bb'], ['Am/c', 'Am/C'], ['C/Bb', 'C/Bb'],
  ['F#m7b5/A', 'F#m7b5/A'], ['Bm7(5-)/F', 'Bm7b5/F'], ['C6/9/E', 'C6/9/E'], ['Dadd9/F#', 'Dadd9/F#'], ['A7sus4/E', 'A7sus4/E'],
  ['C7/b9', 'C7b9'], ['Cmaj7/9', 'Cmaj9'], ['Cm7/11', 'Cm7add11'],
  // Unicode accidentals on the root, superscript suffixes.
  ['B♭m7', 'Bbm7'], ['F♯m7♭5', 'F#m7b5'], ['C♭', 'Cb'], ['Am⁷', 'Am7'], ['G⁷sus⁴', 'G7sus4'], ['C¹³', 'C13'], ['Cᵐᵃʲ⁷', 'Cmaj7'],
  // An accidental right after the letter belongs to the root.
  ['Cb5', 'Cb5'], ['C#5', 'C#5'], ['C#9', 'C#9'], ['Cb9', 'Cb9'], ['C#4', 'C#sus4'], ['C(b5)', 'C(b5)'], ['C(-5)', 'C(b5)'], ['C5-', 'C(b5)'],
];

const NOT_CHORDS = [
  '', ' ', 'c', 'cmaj7', 'H7', 'Hm', 'I', 'x', '%', '|', 'N.C.', 'NC', 'n.c.', 'N/C', 'no chord', 'tacet', 'Chello', 'Cmix', 'Clyd',
  'C/', '/E', 'C/x', 'C/h', 'C/E/G', 'C77', 'Cmaj77', 'Cmm7', 'CMm7', 'CmM', 'Cmajmaj7', 'C-m7', 'C*', 'C7#', 'C5#', 'Cb4b', 'Csus3', 'C8',
];

describe('chord symbols from the wild', () => {
  it('reads each spelling as the chord a musician would play', () => {
    for (const [written, canonical] of SYMBOLS) expect(T.parseChord(written)?.symbol ?? null, JSON.stringify(written)).toBe(canonical);
  });

  it('gives each canonical symbol the right notes, independently typed', () => {
    const notes: Array<[string, string]> = [
      ['Cmaj7', 'C E G B'], ['Cm7', 'C Eb G Bb'], ['CmMaj7', 'C Eb G B'], ['Cdim7', 'C Eb Gb Bbb'], ['Cm7b5', 'C Eb Gb Bb'],
      ['Caug', 'C E G#'], ['C7#5', 'C E G# Bb'], ['Csus4', 'C F G'], ['Csus2', 'C D G'], ['C7sus4', 'C F G Bb'], ['C7sus4b9', 'C F G Bb Db'],
      ['C6', 'C E G A'], ['C6/9', 'C E G A D'], ['Cm6/9', 'C Eb G A D'], ['Cadd9', 'C E G D'], ['Cadd4', 'C E F G'], ['Cadd#11', 'C E G F#'],
      ['C5', 'C G'], ['C9', 'C E G Bb D'], ['C11', 'C E G Bb D F'], ['C13', 'C E G Bb D A'], ['C7b9', 'C E G Bb Db'], ['C7#9', 'C E G Bb D#'],
      ['C7b5', 'C E Gb Bb'], ['C7#11', 'C E G Bb F#'], ['C7b13', 'C E G Bb Ab'], ['C7b9b13', 'C E G Bb Db Ab'], ['C7#9#5', 'C E G# Bb D#'],
      ['C13#11', 'C E G Bb D F# A'], ['C13b9', 'C E G Bb Db A'], ['Cmaj9', 'C E G B D'], ['Cmaj7#11', 'C E G B F#'], ['Cmaj7#5', 'C E G# B'],
      ['Cm9', 'C Eb G Bb D'], ['Cm11', 'C Eb G Bb D F'], ['Cm7add11', 'C Eb G Bb F'], ['Cm9b5', 'C Eb Gb Bb D'], ['C(b5)', 'C E Gb'],
      ['Cb5', 'Cb Gb'], ['C#sus4', 'C# F# G#'], ['C9sus4', 'C F G Bb D'], ['C13sus4', 'C F G Bb D A'], ['Csus2sus4', 'C D F G'],
    ];
    for (const [symbol, expected] of notes) expect(T.chordNotes(symbol).join(' '), symbol).toBe(expected);
  });

  it('refuses text that is not a chord', () => {
    for (const text of NOT_CHORDS) {
      expect(T.parseChord(text), JSON.stringify(text)).toBeNull();
      expect(T.isChord(text)).toBe(false);
    }
    for (const text of ['N.C.', 'NC', 'n.c.', 'N/C', 'no chord', 'tacet']) expect(T.isNoChord(text), text).toBe(true);
    expect(() => T.chord('Chello')).toThrow(RangeError);
  });

  it('keeps a slash bass apart from the chord and knows which inversion it makes', () => {
    const cases: Array<[string, string, number | null]> = [
      ['C/E', 'E', 1], ['C/G', 'G', 2], ['C/Bb', 'Bb', null], ['Cmaj7/B', 'B', 3], ['Am7/G', 'G', 3], ['D/F#', 'F#', 1],
      ['F/G', 'G', null], ['Cadd9/D', 'D', 3], ['Abm/Cb', 'Cb', 1], ['Gdim7/Bb', 'Bb', 1], ['C/B#', 'B#', null],
    ];
    for (const [symbol, bass, inversion] of cases) {
      const c = T.chord(symbol);
      if (symbol === 'C/B#') {
        // A "bass" that is the root under another name is no slash chord at all.
        expect(c.bass).toBeNull();
        expect(c.symbol).toBe('C');
        continue;
      }
      expect(c.bass, symbol).toBe(bass);
      expect(c.inversion, symbol).toBe(inversion);
      expect(c.notes).toEqual(T.chord(symbol.split('/')[0]).notes);
      expect(T.chordNotes(c, { withBass: true })[0]).toBe(bass);
    }
  });

  it('survives every combination a chart could throw at it, and reads its own output back', () => {
    const roots = ['C', 'F#', 'Bb', 'Cb', 'E#', 'G##', 'Abb'];
    const qualities = ['', 'm', 'maj', 'min', 'M', '-', 'dim', 'aug', '+', 'sus', 'sus2', 'sus4', 'ø', '°', 'Δ', 'mi', 'MA', 'dom', 'alt'];
    const numbers = ['', '5', '6', '7', '9', '11', '13', '69', '6/9', '2', '4'];
    const tails = ['', 'b5', '#5', 'b9', '#9', '#11', 'b13', '(b9)', '(#11)', 'add9', 'add11', 'sus4', 'no3', 'no5', '+', '-5', '(maj7)', 'b9b13', '#9#5', '/E', '/Gb'];
    let parsed = 0;
    for (const root of roots) for (const quality of qualities) for (const number of numbers) for (const tail of tails) {
      const symbol = `${root}${quality}${number}${tail}`;
      const c = T.parseChord(symbol);
      if (!c) continue;
      parsed++;
      const again = T.parseChord(c.symbol);
      expect(again, `${symbol} -> ${c.symbol}`).not.toBeNull();
      expect(again!.symbol, symbol).toBe(c.symbol);
      expect(again!.type.intervals, symbol).toEqual(c.type.intervals);
      expect(c.type.intervals[0]).toBe('P1');
      expect(new Set(c.type.intervals).size).toBe(c.type.intervals.length);
      // Notes are the root moved by each interval, at the right pitch.
      c.type.intervals.forEach((ivl, i) => expect(pc(c.notes[i]), symbol).toBe((pc(c.root) + T.semitones(ivl)) % 12));
      // A chord never holds both thirds, or a perfect and an altered fifth, unless it says so.
      expect(c.type.intervals.includes('M3') && c.type.intervals.includes('m3'), symbol).toBe(false);
      expect(T.formatChord(c, { ascii: true })).toBe(c.symbol);
    }
    expect(parsed).toBeGreaterThan(5000);
  });

  it('names any set of pitches with a symbol that reads back to the same pitches', () => {
    // Every pitch-class set on C. The one thing chord symbols cannot say is "both sevenths at once".
    let named = 0;
    for (let mask = 1; mask < 4096; mask += 2) {
      const semis = [...Array(12).keys()].filter((bit) => mask & (1 << bit));
      if (semis.length < 2 || (semis.includes(10) && semis.includes(11))) continue;
      const type = T.chordTypeFromSemitones(semis);
      const back = T.parseChord(`C${type.symbol}`);
      expect(back, `${semis.join(' ')} -> C${type.symbol}`).not.toBeNull();
      expect(sorted(pcs(back!.notes)), `${semis.join(' ')} -> C${type.symbol}`).toEqual(semis);
      expect(back!.type.intervals).toEqual(type.intervals);
      named++;
    }
    expect(named).toBe(1535);
    // A symbol that names one pitch twice is refused rather than guessed at.
    for (const text of ['Cm7#9', 'C7b5#11', 'C7#5b13', 'Cdim13', 'Caltsus4', 'Cm#9']) expect(T.parseChord(text), text).toBeNull();
    // Both ninths, or a fourth beside a raised eleventh, can be said, and survive a round trip.
    for (const text of ['C7b9add9', 'C7sus4#11', 'C7b9#9', 'Cadd9addb9', 'C13b13']) {
      const c = T.parseChord(text)!;
      expect(c, text).not.toBeNull();
      expect(T.parseChord(c.symbol)!.type.intervals, text).toEqual(c.type.intervals);
    }
  });

  it('reads German roots only when asked', () => {
    expect(T.parseChord('H7')).toBeNull();
    expect(T.parseChord('H7', { german: true })!.symbol).toBe('B7');
    expect(T.parseChord('B', { german: true })!.symbol).toBe('Bb');
    expect(T.parseChord('Bm', { german: true })!.symbol).toBe('Bbm');
    expect(T.parseChord('C/H', { german: true })!.symbol).toBe('C/B');
    expect(T.parseChord('C/h', { german: true })!.symbol).toBe('C/B');
    expect(T.parseChord('Bb', { german: true })!.symbol).toBe('Bb');
  });
});

// ── 4. Ambiguous chord identification ──────────────────────────────────────────────────────

describe('ambiguous chord identification', () => {
  const names = (input: Array<string | number>) => T.identifyChords(input).map((m) => m.symbol);

  it('lets the bass decide between C6 and Am7, and offers the other reading', () => {
    expect(names(['C', 'E', 'G', 'A'])[0]).toBe('C6');
    expect(names(['A', 'C', 'E', 'G'])[0]).toBe('Am7');
    expect(names(['C', 'E', 'G', 'A'])).toContain('Am7/C');
    expect(names(['A', 'C', 'E', 'G'])).toContain('C6/A');
    expect(T.identifyChord([48, 52, 55, 57])).toBe('C6');
    expect(T.identifyChord([45, 48, 52, 55])).toBe('Am7');
    // The same four notes over E or G are inversions of one or the other, never a new chord.
    for (const bass of ['E', 'G']) {
      const top = names([bass, ...['C', 'E', 'G', 'A'].filter((n) => n !== bass)]).slice(0, 2).sort();
      expect(top).toEqual([`Am7/${bass}`, `C6/${bass}`]);
    }
  });

  it('lets the bass decide between Dm7b5 and Fm6', () => {
    expect(names(['D', 'F', 'Ab', 'C'])[0]).toBe('Dm7b5');
    expect(names(['F', 'Ab', 'C', 'D'])[0]).toBe('Fm6');
    expect(names(['D', 'F', 'Ab', 'C'])).toContain('Fm6/D');
    expect(names(['F', 'Ab', 'C', 'D'])).toContain('Dm7b5/F');
    expect(T.identifyChord([50, 53, 56, 60])).toBe('Dm7b5');
    expect(T.identifyChord([53, 56, 60, 62])).toBe('Fm6');
    // The same pair a third lower: Bm7b5 and Dm6.
    expect(names(['B', 'D', 'F', 'A'])[0]).toBe('Bm7b5');
    expect(names(['D', 'F', 'A', 'B'])[0]).toBe('Dm6');
  });

  it('names an augmented triad from its bass, and admits the other two roots', () => {
    for (let root = 0; root < 12; root++) {
      const midi = [48 + root, 52 + root, 56 + root];
      for (let inversion = 0; inversion < 3; inversion++) {
        const voicing = [...midi.slice(inversion), ...midi.slice(0, inversion).map((m) => m + 12)];
        const matches = T.identifyChords(voicing);
        expect(matches[0].chord.type.id).toBe('aug');
        expect(pc(matches[0].chord.root)).toBe(voicing[0] % 12);
        expect(matches[0].chord.bass).toBeNull();
        expect(sorted(matches.filter((m) => m.chord.type.id === 'aug').map((m) => pc(m.chord.root)))).toEqual(sorted(midi.map((m) => m % 12)));
      }
    }
    expect(names(['C', 'E', 'G#'])).toEqual(['Caug', 'G#aug/C', 'Eaug/C']);
    expect(names(['E', 'G#', 'B#'])[0]).toBe('Eaug');
    expect(names(['Ab', 'C', 'E'])[0]).toBe('Abaug');
  });

  it('names a diminished seventh from its bass, and admits the other three roots', () => {
    for (let root = 0; root < 12; root++) {
      const midi = [48 + root, 51 + root, 54 + root, 57 + root];
      const matches = T.identifyChords(midi);
      expect(matches[0].chord.type.id).toBe('dim7');
      expect(pc(matches[0].chord.root)).toBe(root);
      expect(sorted(matches.filter((m) => m.chord.type.id === 'dim7').map((m) => pc(m.chord.root)))).toEqual(sorted(midi.map((m) => m % 12)));
    }
    expect(names(['B', 'D', 'F', 'Ab'])[0]).toBe('Bdim7');
    expect(names(['G#', 'B', 'D', 'F'])[0]).toBe('G#dim7');
    // The bass keeps the plain name it was given: nobody writes Abdim7/Cb.
    expect(names(['B', 'D', 'F', 'Ab'])).toContain('Abdim7/B');
  });

  it('knows the other self-mirroring chords: 7b5 and its tritone twin, sus4 and sus2', () => {
    expect(names(['C', 'E', 'Gb', 'Bb']).slice(0, 2)).toEqual(['C7b5', 'Gb7b5/C']);
    expect(names(['Gb', 'Bb', 'C', 'E']).slice(0, 2)).toEqual(['Gb7b5', 'C7b5/Gb']);
    expect(names(['C', 'F', 'G']).slice(0, 2)).toEqual(['Csus4', 'Fsus2/C']);
    expect(names(['F', 'G', 'C']).slice(0, 2)).toEqual(['Fsus2', 'Csus4/F']);
    // Five notes, three good names, chosen by the bass.
    expect(names(['G', 'Bb', 'D', 'F', 'C'])[0]).toBe('Gm7add11');
    expect(names(['C', 'G', 'Bb', 'D', 'F'])[0]).toBe('C9sus4');
    expect(names(['C', 'E', 'G', 'D'])[0]).toBe('Cadd9');
    expect(names(['D', 'C', 'E', 'G'])[0]).toBe('C/D');
  });

  it('reads power chords in any octave doubling and either inversion', () => {
    expect(T.identifyChord(['C', 'G'])).toBe('C5');
    expect(T.identifyChord(['G', 'C'])).toBe('C5/G');
    expect(T.identifyChord([40, 47, 52])).toBe('E5');
    expect(T.identifyChord([40, 47, 52, 59, 64])).toBe('E5');
    expect(T.identifyChord([45, 52, 57])).toBe('A5');
    expect(T.identifyChord([47, 52])).toBe('E5/B');
    expect(T.identifyChords([40, 47])[0]).toMatchObject({ kind: 'exact', omitted: [] });
    for (let root = 0; root < 12; root++) expect(T.identifyChords([40 + root, 47 + root])[0].chord.type.id).toBe('5');
  });

  it('hears a bare third as a triad without its fifth, and says so', () => {
    const cases: Array<[Array<string | number>, string]> = [
      [['C', 'E'], 'C'], [['C', 'Eb'], 'Cm'], [['E', 'C'], 'C/E'], [['C', 'A'], 'Am/C'], [['C', 'Ab'], 'Ab/C'],
      [[40, 44], 'E'], [[40, 43], 'Em'], [[43, 52], 'Em/G'], [[44, 52], 'E/G#'],
    ];
    for (const [input, symbol] of cases) {
      const matches = T.identifyChords(input);
      expect(matches.map((m) => m.symbol), JSON.stringify(input)).toEqual([symbol]);
      expect(matches[0]).toMatchObject({ kind: 'partial', omitted: ['5'] });
      expect(T.identifyChords(input, { allowPartial: false })).toEqual([]);
    }
    // Seconds, sevenths and the tritone do not imply a chord on their own; a unison is no chord.
    for (const input of [['C', 'D'], ['C', 'Db'], ['C', 'F#'], ['C', 'Bb'], ['C', 'B'], ['C', 'C'], ['C4', 'C5'], ['C']]) {
      expect(T.identifyChords(input), input.join(' ')).toEqual([]);
    }
  });

  it('keeps every candidate honest about the notes it was given', () => {
    // Every three- and four-note set, over every one of its notes as the bass.
    const subsets: number[][] = [];
    for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) {
      subsets.push([a, b, c]);
      for (let d = c + 1; d < 12; d++) subsets.push([a, b, c, d]);
    }
    let named = 0;
    for (const set of subsets) {
      for (const bass of set) {
        const input = [36 + bass, ...set.filter((p) => p !== bass).map((p) => 48 + p)];
        const matches = T.identifyChords(input, { limit: 50 });
        if (matches.length) named++;
        for (let i = 1; i < matches.length; i++) expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
        for (const m of matches) {
          const label = `${set.join(',')}/${bass} -> ${m.symbol}`;
          const chordSet = sorted(pcs(m.chord.notes));
          const heard = sorted(set);
          expect(T.parseChord(m.symbol)!.symbol, label).toBe(m.symbol);
          // The symbol's bass is the note actually in the bass.
          expect(pc(m.chord.bass ?? m.chord.root), label).toBe(bass);
          if (m.kind === 'exact') {
            expect(chordSet, label).toEqual(heard);
            expect(m.omitted).toEqual([]);
          } else if (m.kind === 'partial') {
            // Everything heard is a chord tone; what is missing is exactly what the match admits to.
            expect(heard.every((p) => chordSet.includes(p)), label).toBe(true);
            const missing = m.chord.type.degrees.filter((_d, i) => !heard.includes(pc(m.chord.notes[i])));
            expect([...m.omitted].sort(), label).toEqual(missing.sort());
            expect(m.omitted.length).toBeGreaterThan(0);
            // The root and whatever third or suspension defines the chord are never the missing ones.
            expect(m.omitted.some((d) => ['1', '3', 'b3', '7', 'b7'].includes(d)), label).toBe(false);
          } else {
            expect(chordSet.includes(bass), label).toBe(false);
            expect(sorted([...chordSet, bass]), label).toEqual(heard);
          }
        }
      }
    }
    expect(named).toBeGreaterThan(1500);
  });
});

// ── 5. Roman numerals: minor keys, applied chords, borrowed chords ─────────────────────────

describe('roman numerals in minor keys', () => {
  it('counts accidentals from the major scale in every minor key', () => {
    for (const k of T.MINOR_KEYS) {
      expect(T.keyChords(k).map((c) => c.roman), k.name).toEqual(['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII', 'V', 'vii°']);
      expect(T.keyChords(k, { sevenths: true }).map((c) => c.roman), k.name).toEqual(['i7', 'iiø7', 'bIIImaj7', 'iv7', 'v7', 'bVImaj7', 'bVII7', 'V7', 'vii°7']);
      for (const c of T.keyChords(k, { sevenths: true })) {
        expect(T.romanToChord(c.roman, k), `${c.roman} in ${k.name}`).toBe(c.symbol);
        expect(T.chordToRoman(c.symbol, k).roman, `${c.symbol} in ${k.name}`).toBe(c.roman);
        expect(T.chordToRoman(c.symbol, k).relation).toBe('diatonic');
      }
    }
  });

  it('names the chords of A minor, typed by hand', () => {
    const cases: Array<[string, string]> = [
      ['i', 'Am'], ['ii°', 'Bdim'], ['iiø7', 'Bm7b5'], ['bIII', 'C'], ['bIII+', 'Caug'], ['iv', 'Dm'], ['IV', 'D'], ['v', 'Em'],
      ['V', 'E'], ['V7', 'E7'], ['bVI', 'F'], ['bVImaj7', 'Fmaj7'], ['bVII', 'G'], ['bVII7', 'G7'], ['vi°', 'F#dim'], ['viø7', 'F#m7b5'],
      ['vii°', 'G#dim'], ['vii°7', 'G#dim7'], ['imaj7', 'AmMaj7'], ['i6', 'Am6'], ['bII', 'Bb'], ['N', 'Bb'], ['N6', 'Bb'],
      // Applied chords.
      ['V/V', 'B'], ['V7/V', 'B7'], ['V7/iv', 'A7'], ['V7/bIII', 'G7'], ['V7/bVI', 'C7'], ['V7/bVII', 'D7'], ['vii°7/V', 'D#dim7'],
      ['vii°7/iv', 'C#dim7'], ['subV7', 'Bb7'], ['subV7/V', 'F7'], ['subV7/iv', 'Eb7'],
      // Unflatted III, VI, VII are the raised degrees here: chromatic mediants, not the diatonic chords.
      ['III', 'C#'], ['VI', 'F#'], ['VII', 'G#'], ['I', 'A'], ['vi', 'F#m'],
    ];
    for (const [numeral, symbol] of cases) expect(T.romanToChord(numeral, 'A minor'), numeral).toBe(symbol);
  });

  it('translates classical minor-key numerals both ways', () => {
    const cases: Array<[string, string]> = [
      ['i', 'i'], ['ii°', 'ii°'], ['III', 'bIII'], ['III+', 'bIII+'], ['iv', 'iv'], ['v', 'v'], ['V', 'V'], ['V7', 'V7'],
      ['VI', 'bVI'], ['VImaj7', 'bVImaj7'], ['VII', 'bVII'], ['VII7', 'bVII7'], ['vii°', 'vii°'], ['vii°7', 'vii°7'],
      ['#vii°7', 'vii°7'], ['vi°', 'vi°'], ['#vi°', 'vi°'], ['bII', 'bII'], ['N', 'bII'], ['IV', 'IV'], ['V7/III', 'V7/bIII'],
      ['V/VI', 'V/bVI'], ['V7/iv', 'V7/iv'], ['iiø7', 'iiø7'],
    ];
    for (const [classical, here] of cases) expect(T.romanFromClassicalMinor(classical), classical).toBe(here);
    expect(T.romanFromClassicalMinor('not a numeral')).toBeNull();
    // Display direction, and back again without loss.
    const back: Array<[string, string]> = [
      ['bIII', 'III'], ['bVI', 'VI'], ['bVII', 'VII'], ['bIII+', 'III+'], ['vii°7', 'vii°7'], ['vi°', 'vi°'], ['V7/bIII', 'V7/III'],
      ['vi', '#vi'], ['VII', '#VII'], ['bII', 'bII'], ['i', 'i'], ['V7', 'V7'], ['iv', 'iv'],
    ];
    for (const [here, classical] of back) {
      expect(T.romanToClassicalMinor(here), here).toBe(classical);
      expect(T.romanFromClassicalMinor(classical), classical).toBe(here);
    }
    for (const k of T.MINOR_KEYS) {
      for (const c of T.keyChords(k, { sevenths: true })) {
        const classical = T.romanToClassicalMinor(c.roman)!;
        expect(/[b#]/.test(classical.replace(/b5|maj7/g, '')), `${c.roman} -> ${classical}`).toBe(false);
        expect(T.romanToChord(classical, k, { classical: true })).toBe(c.symbol);
      }
    }
    expect(T.progressionToChords('i–VI–III–VII', 'A minor', { classical: true })).toEqual(['Am', 'F', 'C', 'G']);
    expect(T.progressionToChords('i–bVI–bIII–bVII', 'A minor')).toEqual(['Am', 'F', 'C', 'G']);
    expect(T.progressionToChords('i iv VII III VI ii° V7 i', 'D minor', { classical: true })).toEqual(['Dm', 'Gm', 'C', 'F', 'Bb', 'Edim', 'A7', 'Dm']);
    // The option changes nothing in a major key.
    expect(T.progressionToChords('I vi IV V', 'C', { classical: true })).toEqual(['C', 'Am', 'F', 'G']);
    expect(T.romanToChord('VI', 'C', { classical: true })).toBe('A');
  });

  it('analyses chords in a minor key by what they are, not by how they sound', () => {
    const cases: Array<[string, string, string]> = [
      ['Am', 'i', 'diatonic'], ['E', 'V', 'diatonic'], ['E7', 'V7', 'diatonic'], ['E7b9', 'V7b9', 'diatonic'], ['Em', 'v', 'diatonic'],
      ['G#dim7', 'vii°7', 'diatonic'], ['Caug', 'bIII+', 'diatonic'], ['D', 'IV', 'diatonic'], ['F#m7b5', 'viø7', 'diatonic'],
      ['Dm6', 'iv6', 'diatonic'], ['AmMaj7', 'imaj7', 'diatonic'], ['Bm7b5', 'iiø7', 'diatonic'],
      ['E7#9', 'V7#9', 'altered-dominant'], ['Eaug', 'V+', 'altered-dominant'], ['E7#5', 'V7#5', 'altered-dominant'],
      ['B7', 'V7/V', 'secondary-dominant'], ['A7', 'V7/iv', 'secondary-dominant'], ['C7', 'V7/bVI', 'secondary-dominant'],
      ['D#dim7', 'vii°7/V', 'secondary-leading-tone'], ['Bb', 'bII', 'neapolitan'], ['Bb7', 'subV7', 'tritone-substitute'],
      ['F7', 'subV7/V', 'tritone-substitute'], ['A', 'I', 'borrowed'], ['F#m', 'vi', 'borrowed'],
      // F minor sounds like notes of A harmonic minor (Ab = G#) but is not built in it.
      ['Fm', 'bvi', 'chromatic'], ['Cm', 'biii', 'borrowed'],
    ];
    for (const [symbol, numeral, relation] of cases) {
      const a = T.chordToRoman(symbol, 'A minor');
      expect(a.roman, symbol).toBe(numeral);
      expect(a.relation, symbol).toBe(relation);
      expect(a.explanation.length).toBeGreaterThan(10);
    }
    expect(T.chordToRoman('E', 'A minor').variant).toBe('harmonic');
    expect(T.chordToRoman('D', 'A minor').variant).toBe('melodic');
    expect(T.chordToRoman('Em', 'A minor').variant).toBe('natural');
    expect(T.chordInKey('Fm', 'A minor')).toBe(false);
    expect(T.chordInKey('E7', 'A minor')).toBe(true);
    expect(T.chordInKey('G#dim7', 'A minor')).toBe(true);
    expect(T.chordFitsScale('Fm', T.scaleNotes('A', 'harmonic-minor'))).toBe(false);
    expect(T.chordFitsScale('E7b9', T.scaleNotes('A', 'harmonic-minor'))).toBe(true);
    expect(T.chordFitsScale('Abm', T.scaleNotes('C', 'harmonic-minor'))).toBe(false);
    expect(T.chordFitsScale('Ab', T.scaleNotes('C', 'harmonic-minor'))).toBe(true);
  });
});

describe('secondary and borrowed chords', () => {
  it('analyses the chromatic chords of C major', () => {
    const cases: Array<[string, string, string, string | null]> = [
      ['D7', 'V7/V', 'secondary-dominant', 'G'], ['A7', 'V7/ii', 'secondary-dominant', 'Dm'], ['E7', 'V7/vi', 'secondary-dominant', 'Am'],
      ['B7', 'V7/iii', 'secondary-dominant', 'Em'], ['C7', 'V7/IV', 'secondary-dominant', 'F'], ['E', 'V/vi', 'secondary-dominant', 'Am'],
      ['E7#9', 'V7#9/vi', 'secondary-dominant', 'Am'], ['Eaug', 'V+/vi', 'secondary-dominant', 'Am'], ['Caug', 'V+/IV', 'secondary-dominant', 'F'],
      ['F#dim7', 'vii°7/V', 'secondary-leading-tone', 'G'], ['C#dim7', 'vii°7/ii', 'secondary-leading-tone', 'Dm'],
      ['G#dim7', 'vii°7/vi', 'secondary-leading-tone', 'Am'], ['F#m7b5', 'viiø7/V', 'secondary-leading-tone', 'G'],
      ['Db7', 'subV7', 'tritone-substitute', 'C'], ['Ab7', 'subV7/V', 'tritone-substitute', 'G'], ['Eb7', 'subV7/ii', 'tritone-substitute', 'Dm'],
      ['Db', 'bII', 'neapolitan', null], ['G7b9', 'V7b9', 'altered-dominant', null], ['G7alt', 'V7alt', 'altered-dominant', null],
      ['Gaug', 'V+', 'altered-dominant', null], ['G7#5', 'V7#5', 'altered-dominant', null],
      ['Fm', 'iv', 'borrowed', null], ['Fm6', 'iv6', 'borrowed', null], ['Ab', 'bVI', 'borrowed', null], ['Bb', 'bVII', 'borrowed', null],
      ['Eb', 'bIII', 'borrowed', null], ['Cm', 'i', 'borrowed', null], ['Gm7', 'v7', 'borrowed', null], ['Bb7', 'bVII7', 'borrowed', null],
      ['Dm7b5', 'iiø7', 'borrowed', null], ['F7', 'IV7', 'borrowed', null], ['Abmaj7', 'bVImaj7', 'borrowed', null],
      // The leading-tone seventh chord of the parallel minor is the key's own vii, not "vii of I".
      ['Bdim7', 'vii°7', 'borrowed', null],
      // Ab minor only sounds like C harmonic minor (Cb = B); it is a chromatic mediant.
      ['Abm', 'bvi', 'chromatic', null], ['Dbm', 'bii', 'chromatic', null], ['F#m', '#iv', 'chromatic', null],
    ];
    for (const [symbol, numeral, relation, target] of cases) {
      const a = T.chordToRoman(symbol, 'C');
      expect(a.roman, symbol).toBe(numeral);
      expect(a.relation, symbol).toBe(relation);
      expect(a.targetChord, symbol).toBe(target);
    }
    expect(T.chordToRoman('Fm', 'C').borrowedFrom[0]).toBe('minor');
    expect(T.chordToRoman('F7', 'C').borrowedFrom).toContain('dorian');
    expect(T.chordToRoman('Bdim7', 'C').borrowedFrom).toContain('harmonic-minor');
    expect(T.chordToRoman('Bdim7', 'C').function).toBe('dominant');
    // The same chord under either name gets the same answer.
    const sharp = T.chordToRoman('F#', 'C');
    const flat = T.chordToRoman('Gb', 'C');
    expect([sharp.roman, sharp.relation, sharp.function]).toEqual([flat.roman, flat.relation, flat.function]);
  });

  it('lists the applied chords of every key and recognises each one again', () => {
    for (const k of T.ALL_KEYS) {
      const secondary = T.secondaryDominants(k);
      expect(secondary).toHaveLength(5);
      for (const s of secondary) {
        const dominant = T.chord(s.symbol);
        const target = T.chord(s.targetChord);
        expect((pc(dominant.root) - pc(target.root) + 12) % 12, `${s.symbol} -> ${s.targetChord} in ${k.name}`).toBe(7);
        expect(dominant.type.id).toBe('7');
        const analysis = T.chordToRoman(s.symbol, k);
        if (analysis.relation === 'diatonic') {
          // Two applied dominants of a minor key are also chords of the key itself: bVII7 (natural
          // minor) is V7 of bIII, and IV7 (melodic minor) is V7 of bVII.
          expect(k.mode, `${s.symbol} in ${k.name}`).toBe('minor');
          expect({ 'V7/bIII': 'bVII7', 'V7/bVII': 'IV7' }[s.roman], `${s.symbol} in ${k.name}`).toBe(analysis.roman);
        } else {
          expect(analysis.roman, `${s.symbol} in ${k.name}`).toBe(s.roman);
          expect(analysis.targetChord).toBe(s.targetChord);
        }
        expect(pc(T.chord(T.romanToChord(s.roman, k)).root)).toBe(pc(dominant.root));
      }
      const subs = T.tritoneSubstitutes(k);
      expect(subs).toHaveLength(6);
      for (const s of subs) {
        expect((pc(T.chord(s.symbol).root) - pc(T.chord(s.targetChord).root) + 12) % 12, `${s.symbol} in ${k.name}`).toBe(1);
        expect((pc(T.chord(s.symbol).root) - pc(T.chord(s.replacesChord).root) + 12) % 12).toBe(6);
        expect(pc(T.chord(T.romanToChord(s.roman, k)).root)).toBe(pc(T.chord(s.symbol).root));
      }
    }
  });

  it('borrows only chords the key lacks, and can find each one again', () => {
    for (const k of T.ALL_KEYS) {
      for (const sevenths of [false, true]) {
        const own = new Set(T.keyChords(k, { sevenths }).map((c) => `${pc(c.root)}:${c.type.id}`));
        const borrowed = T.modalInterchange(k, { sevenths });
        expect(borrowed.length).toBeGreaterThan(8);
        for (const b of borrowed) {
          const label = `${b.symbol} (${b.roman}) in ${k.name}`;
          expect(own.has(`${pc(b.root)}:${b.type.id}`), label).toBe(false);
          expect(b.sources.length, label).toBeGreaterThan(0);
          // It really is a chord of each scale it claims to come from.
          for (const source of b.sources) expect(T.chordFitsScale(b.symbol, T.scaleNotes(k.tonic, source)), `${label} from ${source}`).toBe(true);
          expect(pc(T.chord(T.romanToChord(b.roman, k)).root), label).toBe(pc(b.root));
          expect(T.chord(T.romanToChord(b.roman, k)).type.id, label).toBe(b.type.id);
          expect(T.chordToRoman(b.symbol, k).relation, label).not.toBe('diatonic');
        }
      }
    }
    const inC = T.modalInterchange('C').map((b) => `${b.roman}=${b.symbol}`);
    expect(inC).toEqual(expect.arrayContaining(['i=Cm', 'iv=Fm', 'bIII=Eb', 'bVI=Ab', 'bVII=Bb', 'v=Gm', 'bII=Db', 'II=D']));
  });

  it('round-trips every numeral in every key for chords on all twelve roots', () => {
    const types = ['', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim7', 'dim', 'aug', '6', 'm6', '9', '7b9', 'sus4'];
    for (const k of T.ALL_KEYS) {
      for (let root = 0; root < 12; root++) {
        for (const type of types) {
          const symbol = `${T.spellInKey(root, k)}${type}`;
          const original = T.chord(symbol);
          const analysis = T.chordToRoman(original, k);
          for (const numeral of [analysis.roman, analysis.literal]) {
            const again = T.chord(T.romanToChord(numeral, k));
            expect(pc(again.root), `${symbol} = ${numeral} in ${k.name}`).toBe(pc(original.root));
            expect(again.type.id, `${symbol} = ${numeral} in ${k.name}`).toBe(original.type.id);
          }
          expect(T.parseRoman(analysis.roman)!.text).toBe(analysis.roman);
        }
      }
    }
  });

  it('treats the home chord of a blues as home', () => {
    const blues = T.analyzeProgression(['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'])!;
    expect(blues.key.name).toBe('A major');
    // Bar 4 leans into the IV chord; everywhere else the A7 is simply I7.
    expect(blues.romans).toEqual(['I7', 'I7', 'I7', 'V7/IV', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']);
    expect(blues.chords[0]).toMatchObject({ relation: 'borrowed', function: 'tonic', borrowedFrom: ['mixolydian'] });
    expect(blues.chords[3]).toMatchObject({ relation: 'secondary-dominant', targetChord: 'D' });
    // Without context the chord keeps its textbook reading.
    expect(T.chordToRoman('C7', 'C').roman).toBe('V7/IV');
    expect(T.chordToRoman('C7', 'C', { next: 'F' }).roman).toBe('V7/IV');
    expect(T.chordToRoman('C7', 'C', { next: 'Fm' }).roman).toBe('V7/IV');
    expect(T.chordToRoman('C7', 'C', { next: 'G7' }).roman).toBe('I7');
    expect(T.chordToRoman('C7', 'C', { next: null }).roman).toBe('I7');
  });

  it('rejects numerals that are not numerals', () => {
    for (const text of ['', 'viii', 'iiii', 'IIII', 'VIII', 'IV/5', 'V/', '/V', 'H', 'vM', 'bbbI', 'Vx', 'I64', 'cad64', 'Ger+6', 'V7/V/V', 'subII7', 'subv7']) {
      expect(T.parseRoman(text), JSON.stringify(text)).toBeNull();
    }
    const fine: Array<[string, string]> = [
      ['IIm7', 'ii7'], ['VIIø7', 'viiø7'], ['viio7', 'vii°7'], ['IΔ', 'Imaj7'], ['ii-7', 'ii7'], ['♭VII', 'bVII'], ['♯iv°7', '#iv°7'],
      ['Vsus', 'Vsus4'], ['subV', 'subV7'], ['subV7/V', 'subV7/V'], ['I6', 'I6'], ['V7b9/ii', 'V7b9/ii'], ['viiº7/V', 'vii°7/V'],
    ];
    for (const [text, canonical] of fine) expect(T.parseRoman(text)?.text ?? null, text).toBe(canonical);
  });
});

// ── 6. Mode relationships ──────────────────────────────────────────────────────────────────

describe('mode-relationship invariants', () => {
  const rotate = <X>(list: X[], by: number) => [...list.slice(by), ...list.slice(0, by)];

  it('makes every declared mode the right rotation of its parent, by name and by pitch', () => {
    for (const scale of T.SCALES) {
      if (!scale.parent || scale.mode === null) continue;
      const parent = T.getScale(scale.parent)!;
      expect(parent.size, scale.id).toBe(scale.size);
      expect(scale.steps, scale.id).toEqual(rotate(parent.steps, scale.mode - 1));
      expect(T.scaleModes(parent)[scale.mode - 1].scale?.id, scale.id).toBe(scale.id);
      // And back: the parent is a rotation of the mode.
      const backIndex = (parent.size - (scale.mode - 1)) % parent.size;
      expect(T.scaleModes(scale)[backIndex].scale?.id, `${scale.id} back to ${parent.id}`).toBe(parent.id);
      for (const tonic of ['C', 'F#', 'Bb', 'E']) {
        const parentNotes = T.scaleNotes(tonic, parent);
        const modeNotes = T.scaleNotes(parentNotes[scale.mode - 1], scale);
        expect(pcs(modeNotes), `${parentNotes[scale.mode - 1]} ${scale.id}`).toEqual(pcs(rotate(parentNotes, scale.mode - 1)));
      }
    }
    // Seven-letter families keep the very same note names, not just the pitches.
    for (const parent of ['major', 'melodic-minor', 'harmonic-minor', 'harmonic-major', 'double-harmonic', 'neapolitan-major', 'neapolitan-minor']) {
      for (const tonic of ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb']) {
        const notes = T.scaleNotes(tonic, parent);
        for (const mode of T.scaleModes(parent)) {
          if (!mode.scale) continue;
          expect(T.scaleNotes(notes[mode.mode - 1], mode.scale), `${notes[mode.mode - 1]} ${mode.scale.id}`).toEqual(rotate(notes, mode.mode - 1));
        }
      }
    }
  });

  it('gives every scale as many modes as notes, each one a rotation of its steps', () => {
    for (const scale of T.SCALES) {
      const modes = T.scaleModes(scale);
      expect(modes).toHaveLength(scale.size);
      expect(modes[0].scale?.id, scale.id).toBe(scale.id);
      expect(modes[0].degrees, scale.id).toEqual(scale.degrees);
      modes.forEach((mode, index) => {
        const semis = mode.intervals.map((i) => T.semitones(i));
        expect(semis[0]).toBe(0);
        for (let i = 1; i < semis.length; i++) expect(semis[i], `${scale.id} mode ${mode.mode}`).toBeGreaterThan(semis[i - 1]);
        expect(semis[semis.length - 1]).toBeLessThan(12);
        const steps = semis.map((s, i) => (i + 1 < semis.length ? semis[i + 1] : 12) - s);
        expect(steps, `${scale.id} mode ${mode.mode}`).toEqual(rotate(scale.steps, index));
        // No degree label a reader would not recognise.
        for (const d of mode.degrees) expect(/^(#|b{1,2})?[1-7]$/.test(d), `${scale.id} mode ${mode.mode}: ${d}`).toBe(true);
        if (mode.scale) expect(mode.scale.semitones, `${scale.id} mode ${mode.mode}`).toEqual(semis);
      });
    }
  });

  it('orders the seven church modes from bright to dark, one lowered note at a time', () => {
    const order = ['lydian', 'major', 'mixolydian', 'dorian', 'minor', 'phrygian', 'locrian'];
    const lowered = [4, 7, 3, 6, 2, 5];
    for (let i = 0; i + 1 < order.length; i++) {
      const comparison = T.compareScales(order[i], order[i + 1]);
      expect(comparison.changes.map((c) => c.number), `${order[i]} -> ${order[i + 1]}`).toEqual([lowered[i]]);
      expect(comparison.summary).toContain('lowered');
      const brighter = T.getScale(order[i])!.semitones.reduce((a, b) => a + b, 0);
      const darker = T.getScale(order[i + 1])!.semitones.reduce((a, b) => a + b, 0);
      expect(brighter - darker).toBe(1);
    }
    // In fifths: the tonic of each mode of C major, bright to dark, is F C G D A E B.
    expect(order.map((id) => T.relativeScales('C', 'major').concat([{ tonic: 'C', scale: T.getScale('major')! }]).find((r) => r.scale.id === id)!.tonic)).toEqual(['F', 'C', 'G', 'D', 'A', 'E', 'B']);
  });

  it('keeps relative scales mutual and on the same notes', () => {
    for (const scale of T.SCALES) {
      if (scale.size === 12) continue;
      for (const tonic of ['C', 'F#', 'Eb']) {
        const home = sorted(T.scalePcs(tonic, scale));
        for (const relative of T.relativeScales(tonic, scale)) {
          const label = `${tonic} ${scale.id} ~ ${relative.tonic} ${relative.scale.id}`;
          expect(sorted(T.scalePcs(relative.tonic, relative.scale)), label).toEqual(home);
          const back = T.relativeScales(relative.tonic, relative.scale);
          expect(back.some((b) => b.scale.id === scale.id && pc(b.tonic) === pc(tonic)), `${label} and back`).toBe(true);
        }
        for (const parallel of T.parallelScales(tonic, scale)) {
          expect(parallel.tonic).toBe(tonic);
          expect(parallel.scale.id).not.toBe(scale.id);
          expect(parallel.scale.size).toBe(scale.size);
        }
      }
    }
    expect(T.relativeScales('C', 'major').map((r) => `${r.tonic} ${r.scale.id}`)).toEqual(['D dorian', 'E phrygian', 'F lydian', 'G mixolydian', 'A minor', 'B locrian']);
    expect(T.relativeScales('A', 'minor-pentatonic').map((r) => `${r.tonic} ${r.scale.id}`)).toContain('C major-pentatonic');
    expect(T.relativeScales('A', 'minor-blues').map((r) => `${r.tonic} ${r.scale.id}`)).toContain('C major-blues');
    expect(T.relativeScales('G', 'altered').map((r) => `${r.tonic} ${r.scale.id}`)).toContain('Ab melodic-minor');
    expect(T.relativeScales('E', 'phrygian-dominant').map((r) => `${r.tonic} ${r.scale.id}`)).toContain('A harmonic-minor');
    expect(T.relativeScales('G', 'lydian-dominant').map((r) => `${r.tonic} ${r.scale.id}`)).toContain('D melodic-minor');
  });

  it('knows how many transpositions each symmetric scale really has', () => {
    const expected: Record<string, number> = {
      chromatic: 1, 'whole-tone': 2, 'diminished-half-whole': 3, 'diminished-whole-half': 3, augmented: 4, 'six-tone-symmetric': 4,
      tritone: 6, 'messiaen-3': 4, 'messiaen-4': 6, 'messiaen-5': 6, 'messiaen-6': 6, 'messiaen-7': 6,
    };
    const symmetric = T.filterScales({ family: 'symmetric' });
    expect(symmetric.map((s) => s.id).sort()).toEqual(Object.keys(expected).sort());
    for (const scale of T.SCALES) {
      const distinct = new Set([...Array(12).keys()].map((t) => sorted(T.scalePcs(t, scale)).join(',')));
      expect(distinct.size, scale.id).toBe(expected[scale.id] ?? 12);
    }
  });

  it('derives the textbook facts that tie the families together', () => {
    const degrees = (id: string) => T.getScale(id)!.degrees.join(' ');
    // Each minor form differs from natural minor in its upper notes only.
    expect(T.compareScales('minor', 'harmonic-minor').changes).toEqual([{ number: 7, a: 'b7', b: '7' }]);
    expect(T.compareScales('minor', 'melodic-minor').changes.map((c) => c.number)).toEqual([6, 7]);
    expect(T.compareScales('major', 'melodic-minor').changes).toEqual([{ number: 3, a: '3', b: 'b3' }]);
    expect(T.compareScales('major', 'harmonic-major').changes).toEqual([{ number: 6, a: '6', b: 'b6' }]);
    expect(T.compareScales('harmonic-minor', 'hungarian-minor').changes).toEqual([{ number: 4, a: '4', b: '#4' }]);
    expect(T.compareScales('phrygian', 'phrygian-dominant').changes).toEqual([{ number: 3, a: 'b3', b: '3' }]);
    expect(T.compareScales('major', 'double-harmonic').changes.map((c) => c.number)).toEqual([2, 6]);
    // Every degree of the altered scale but the tonic is lowered.
    expect(T.compareScales('major', 'altered').changes.map((c) => c.number)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(T.compareScales('major', 'altered').summary).toBe('Altered is Major with a lowered 2nd, a lowered 3rd, a lowered 4th, a lowered 5th, a lowered 6th and a lowered 7th.');
    // The altered scale's b4 is the dominant chord's major third.
    expect(degrees('altered')).toBe('1 b2 b3 b4 b5 b6 b7');
    expect(T.scaleContains('G', 'altered', 'B')).toBe(true);
    expect(sorted(T.scalePcs('G', 'altered'))).toEqual(sorted(pcs(['G', 'Ab', 'A#', 'B', 'Db', 'D#', 'F'])));
    // Pentatonics are their seven-note scales minus the two notes that make half steps.
    expect(T.compareScales('major', 'major-pentatonic').onlyA).toEqual(['4', '7']);
    expect(T.compareScales('minor', 'minor-pentatonic').onlyA).toEqual(['2', 'b6']);
    // The two diminished scales are each other's modes and share their diminished seventh chords.
    expect(T.scaleModes('diminished-half-whole')[1].scale?.id).toBe('diminished-whole-half');
    expect(sorted(T.scalePcs('C', 'diminished-whole-half'))).toEqual(sorted([...pcs(T.chordNotes('Cdim7')), ...pcs(T.chordNotes('Ddim7'))]));
    // The whole-tone scale is two augmented triads; the augmented scale is two a minor third apart.
    expect(sorted(T.scalePcs('C', 'whole-tone'))).toEqual(sorted([...pcs(T.chordNotes('Caug')), ...pcs(T.chordNotes('Daug'))]));
    expect(sorted(T.scalePcs('C', 'augmented'))).toEqual(sorted([...pcs(T.chordNotes('Caug')), ...pcs(T.chordNotes('Ebaug'))]));
    expect(sorted(T.scalePcs('C', 'tritone'))).toEqual(sorted([...pcs(T.chordNotes('C')), ...pcs(T.chordNotes('Gb'))]));
    // The ten parent scales of North Indian music, by their Western equivalents.
    const thaats: Record<string, string> = {
      Bilawal: '1 2 3 4 5 6 7', Khamaj: '1 2 3 4 5 6 b7', Kafi: '1 2 b3 4 5 6 b7', Asavari: '1 2 b3 4 5 b6 b7', Bhairavi: '1 b2 b3 4 5 b6 b7',
      Kalyan: '1 2 3 #4 5 6 7', Bhairav: '1 b2 3 4 5 b6 7', Purvi: '1 b2 3 #4 5 b6 7', Marva: '1 b2 3 #4 5 6 7', Todi: '1 b2 b3 #4 5 b6 7',
    };
    for (const [name, formula] of Object.entries(thaats)) expect(T.getScale(name)?.degrees.join(' '), name).toBe(formula);
  });
});

// ── 7. Every tonic with every scale, every root with every chord ───────────────────────────

describe('every tonic with every scale', () => {
  it('has the notes its formula says, at the right pitches, in rising order', () => {
    for (const scale of T.SCALES) {
      expect(scale.degrees).toHaveLength(scale.size);
      expect(scale.intervals.map((i) => T.semitones(i))).toEqual(scale.semitones);
      expect(scale.degrees.map((d) => T.degreeToInterval(d))).toEqual(scale.intervals);
      for (const tonic of TONICS) {
        const label = `${tonic} ${scale.id}`;
        const notes = T.scaleNotes(tonic, scale);
        expect(notes, label).toHaveLength(scale.size);
        expect(notes[0], label).toBe(tonic);
        expect(new Set(notes).size, label).toBe(notes.length);
        expect(pcs(notes), label).toEqual(scale.semitones.map((s) => (pc(tonic) + s) % 12));
        expect(T.scalePcs(tonic, scale), label).toEqual(pcs(notes));
        const pitched = T.scaleNotes(`${tonic}2`, scale, { closed: true });
        const midi = pitched.map((n) => T.noteToMidi(n));
        expect(midi, label).toEqual([...scale.semitones, 12].map((s) => T.noteToMidi(`${tonic}2`) + s));
        expect(T.scaleMidi(40, scale)).toEqual([...scale.semitones, 12].map((s) => 40 + s));
      }
    }
  });

  it('uses each letter exactly once in a seven-note scale, on the degree it belongs to', () => {
    let checked = 0;
    for (const scale of T.SCALES) {
      const numbers = scale.intervals.map((i) => T.interval(i).number);
      if (scale.size !== 7 || new Set(numbers).size !== 7) continue;
      checked++;
      for (const tonic of TONICS) {
        const notes = T.scaleNotes(tonic, scale);
        const start = LETTERS.indexOf(letterOf(tonic));
        expect(notes.map(letterOf).join(''), `${tonic} ${scale.id}`).toBe([...Array(7).keys()].map((i) => LETTERS[(start + i) % 7]).join(''));
        notes.forEach((n, i) => expect(T.intervalBetween(tonic, n), `${tonic} ${scale.id}`).toBe(scale.intervals[i]));
      }
    }
    // The five big families, the Neapolitans and the named exotics: all the heptatonic scales.
    expect(checked).toBe(T.filterScales({ size: 7 }).length);
  });

  it('never needs a triple accidental when a simpler tonic exists, and always knows that tonic', () => {
    for (const scale of T.SCALES) {
      for (const tonic of TONICS) {
        const label = `${tonic} ${scale.id}`;
        const simplest = T.simplestTonic(tonic, scale);
        expect(pc(simplest), label).toBe(pc(tonic));
        expect(maxAlt(T.scaleNotes(simplest, scale)), `${label} as ${simplest}`).toBeLessThan(3);
        if (maxAlt(T.scaleNotes(tonic, scale)) >= 3) expect(simplest, label).not.toBe(tonic);
        // It is a fixed point, and never turns a readable spelling into a worse one.
        expect(T.simplestTonic(simplest, scale), label).toBe(simplest);
        const total = (names: string[]) => names.reduce((sum, n) => sum + Math.abs(T.note(n).alt), 0);
        expect(total(T.scaleNotes(simplest, scale)), label).toBeLessThanOrEqual(total(T.scaleNotes(tonic, scale)));
      }
      for (let p = 0; p < 12; p++) {
        const tonic = T.simplestTonic(p, scale);
        expect(pc(tonic)).toBe(p);
        expect(Math.abs(T.note(tonic).alt)).toBeLessThan(2);
        expect(maxAlt(T.scaleNotes(tonic, scale)), `${tonic} ${scale.id}`).toBeLessThan(3);
      }
      // Outside the seven-note scales nothing is ever written with a double accidental.
      if (scale.size !== 7) for (const tonic of TONICS) expect(maxAlt(T.scaleNotes(tonic, scale).slice(1)), `${tonic} ${scale.id}`).toBeLessThan(2);
    }
    // The choices a musician would make.
    const cases: Array<[string | number, string, string]> = [
      ['A#', 'major', 'Bb'], ['G#', 'major', 'Ab'], ['D#', 'major', 'Eb'], ['Db', 'minor', 'C#'], ['Gb', 'minor', 'F#'], ['Ab', 'minor', 'G#'],
      ['F#', 'major', 'F#'], ['Gb', 'major', 'Gb'], ['D#', 'minor', 'D#'], ['Eb', 'minor', 'Eb'], ['G#', 'harmonic-minor', 'G#'],
      ['B#', 'lydian-augmented', 'C'], ['Fb', 'altered', 'E'], ['Gb', 'locrian-bb3-bb7', 'F#'], ['Cb', 'ultralocrian', 'B'],
      [1, 'major', 'Db'], [1, 'minor', 'C#'], [3, 'major', 'Eb'], [3, 'minor', 'Eb'], [6, 'major', 'F#'], [6, 'minor', 'F#'],
      [8, 'major', 'Ab'], [8, 'minor', 'G#'], [10, 'major', 'Bb'], [10, 'minor', 'Bb'], [10, 'locrian', 'A#'], [6, 'lydian', 'Gb'],
    ];
    for (const [tonic, scale, expected] of cases) expect(T.simplestTonic(tonic, scale), `${tonic} ${scale}`).toBe(expected);
    expect(T.simplestTonic('A#3', 'major')).toBe('Bb3');
    expect(T.simplestTonic('B#3', 'major')).toBe('C4');
    expect(T.scaleNotes('B#', 'lydian-augmented')).toContain('F###');
  });

  it('answers membership, degree and spelling questions consistently', () => {
    for (const scale of T.SCALES) {
      for (const tonic of ['C', 'F#', 'Bb', 'E', 'Ab', 'B', 'Db', 'C#']) {
        const label = `${tonic} ${scale.id}`;
        const notes = T.scaleNotes(tonic, scale);
        const map = T.scaleToneMap(tonic, scale);
        expect(map.tones.map((t) => t.note), label).toEqual(notes);
        expect(map.tones.map((t) => t.degree), label).toEqual(scale.degrees);
        expect(map.mask, label).toBe(T.pitchClassMask(notes));
        for (let p = 0; p < 12; p++) {
          const inScale = pcs(notes).includes(p);
          expect(T.scaleContains(tonic, scale, p), label).toBe(inScale);
          expect(T.hasTone(map, p), label).toBe(inScale);
          expect(map.byPc[p].member, label).toBe(inScale);
          expect(pc(map.byPc[p].note), label).toBe(p);
          expect(map.byPc[p].semitones).toBe((p - pc(tonic) + 12) % 12);
          const spelled = T.spellInScale(tonic, scale, p);
          expect(pc(spelled), label).toBe(p);
          expect(map.byPc[p].note, label).toBe(spelled);
          const degree = T.degreeInScale(tonic, scale, p);
          expect(degree, label).toBe(inScale ? scale.degrees[pcs(notes).indexOf(p)] : null);
          expect(map.byPc[p].degree, label).toBe(T.degreeInScale(tonic, scale, p, { chromatic: true }));
          expect(T.semitones(T.degreeToInterval(map.byPc[p].degree)) % 12, label).toBe(map.byPc[p].semitones);
        }
        if (scale.size < 12) {
          const found = T.scalesContaining(notes, { exact: true });
          expect(found.some((m) => m.scale.id === scale.id && m.tonic === tonic), label).toBe(true);
        }
      }
    }
  });

  it('builds every chord type on every root with each tone on its own letter', () => {
    for (const type of T.CHORD_TYPES) {
      for (const root of TONICS) {
        const c = T.chord(`${root}${type.symbol}`);
        const label = c.symbol;
        expect(c.type.id, label).toBe(type.id);
        expect(c.notes, label).toHaveLength(type.intervals.length);
        const start = LETTERS.indexOf(letterOf(root));
        type.intervals.forEach((ivl, i) => {
          expect(pc(c.notes[i]), label).toBe((pc(root) + T.semitones(ivl)) % 12);
          expect(letterOf(c.notes[i]), `${label} ${ivl}`).toBe(LETTERS[(start + T.interval(ivl).number - 1) % 7]);
        });
        const map = T.chordToneMap(c);
        expect(map.tones.map((t) => t.note), label).toEqual(c.notes);
        expect(map.tones.map((t) => t.degree), label).toEqual(type.degrees);
        expect(map.mask, label).toBe(T.pitchClassMask(c.notes));
        expect(T.chordMidi(c, { octave: 3 }), label).toEqual(type.semitones.map((s) => T.noteToMidi(`${root}3`) + s));
        expect(T.chordNotesFrom(c, 3).map((n) => T.noteToMidi(n)), label).toEqual(T.chordMidi(c, { octave: 3 }));
        expect(T.chordFromSlug(T.chordSlug(c))?.symbol, label).toBe(c.symbol);
      }
    }
  });

  it('harmonises every seven-note scale into chords made of its own notes', () => {
    for (const scale of T.filterScales({ size: 7 })) {
      for (const tonic of ['C', 'A', 'F#', 'Bb']) {
        const notes = T.scaleNotes(tonic, scale);
        for (const sevenths of [false, true]) {
          const chords = T.harmonizeScale(tonic, scale, { sevenths });
          expect(chords.map((c) => c.root)).toEqual(notes);
          chords.forEach((c, i) => {
            const label = `${tonic} ${scale.id} ${c.roman}`;
            expect(c.notes, label).toEqual([...Array(sevenths ? 4 : 3).keys()].map((n) => notes[(i + 2 * n) % 7]));
            expect(sorted(pcs(T.chordNotes(c.symbol))), `${label} = ${c.symbol}`).toEqual(sorted(pcs(c.notes)));
            expect(c.degreeLabel).toBe(scale.degrees[i]);
            // Catalog chords come back from their numeral; the odd ones of exotic scales need not.
            if (!c.type.custom) {
              const back = T.chord(T.romanToChord(c.roman, `${tonic} major`));
              expect(pc(back.root), label).toBe(pc(c.root));
              expect(back.type.id, label).toBe(c.type.id);
            }
          });
        }
      }
    }
  });
});

// ── 8. Key detection on progressions everybody knows ───────────────────────────────────────

/** [name, chords, tonic, mode] in a convenient key; each is then tried in all twelve keys. */
const PROGRESSIONS: Array<[string, string[], string, T.KeyMode]> = [
  ['I–V–vi–IV', ['C', 'G', 'Am', 'F'], 'C', 'major'],
  ['I–vi–IV–V', ['C', 'Am', 'F', 'G'], 'C', 'major'],
  ['I–IV–V–I', ['C', 'F', 'G', 'C'], 'C', 'major'],
  ['I–IV–V', ['E', 'A', 'B'], 'E', 'major'],
  ['ii–V–I', ['Dm7', 'G7', 'Cmaj7'], 'C', 'major'],
  ['I–vi–ii–V turnaround', ['Cmaj7', 'Am7', 'Dm7', 'G7'], 'C', 'major'],
  ['iii–vi–ii–V–I', ['Em7', 'A7', 'Dm7', 'G7', 'Cmaj7'], 'C', 'major'],
  ['canon', ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A'], 'D', 'major'],
  ['12-bar blues, sevenths', ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'], 'A', 'major'],
  ['12-bar blues, quick change', ['G7', 'C7', 'G7', 'G7', 'C7', 'C7', 'G7', 'G7', 'D7', 'C7', 'G7', 'D7'], 'G', 'major'],
  ['12-bar blues, triads', ['A', 'A', 'A', 'A', 'D', 'D', 'A', 'A', 'E', 'D', 'A', 'E'], 'A', 'major'],
  ['12-bar blues, ninths', ['A9', 'D9', 'A9', 'A9', 'D9', 'D9', 'A9', 'A9', 'E9', 'D9', 'A9', 'E9'], 'A', 'major'],
  ['jazz blues', ['F7', 'Bb7', 'F7', 'Cm7', 'F7', 'Bb7', 'Bdim7', 'F7', 'D7', 'Gm7', 'C7', 'F7', 'D7', 'Gm7', 'C7'], 'F', 'major'],
  ['major with a borrowed iv', ['G', 'B', 'C', 'Cm'], 'G', 'major'],
  ['Andalusian cadence', ['Am', 'G', 'F', 'E'], 'A', 'minor'],
  ['Andalusian with V7', ['Em', 'D', 'C', 'B7'], 'E', 'minor'],
  ['i–iv–V–i', ['Am', 'Dm', 'E', 'Am'], 'A', 'minor'],
  ['i–iv–V7–i', ['Em', 'Am', 'B7', 'Em'], 'E', 'minor'],
  ['i–V, back and forth', ['Em', 'B', 'Em', 'B'], 'E', 'minor'],
  ['i–bVII–bVI–V', ['Cm', 'Bb', 'Ab', 'G'], 'C', 'minor'],
  ['minor ii–V–i', ['Bm7b5', 'E7', 'Am7'], 'A', 'minor'],
  ['minor ii–V–i with tensions', ['Dm7b5', 'G7b9', 'Cm6'], 'C', 'minor'],
  ['minor blues', ['Am7', 'Am7', 'Am7', 'Am7', 'Dm7', 'Dm7', 'Am7', 'Am7', 'F7', 'E7', 'Am7', 'E7'], 'A', 'minor'],
  ['minor with major IV and V', ['Am', 'C', 'D', 'F', 'Am', 'C', 'E', 'E'], 'A', 'minor'],
  ['minor with major V and IV, rock ballad', ['Bm', 'F#', 'A', 'E', 'G', 'D', 'Em', 'F#'], 'B', 'minor'],
  ['falling fifths into a minor key', ['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm'], 'G', 'minor'],
  ['folia', ['Dm', 'A7', 'Dm', 'C', 'F', 'C', 'Dm', 'A7'], 'D', 'minor'],
  ['i–bVI–bIII–bVII', ['Am', 'F', 'C', 'G'], 'A', 'minor'],
  ['power-chord riff', ['E5', 'G5', 'A5', 'E5'], 'E', 'minor'],
];

describe('key detection on well-known progressions', () => {
  it('finds the key of each progression in all twelve transpositions', () => {
    for (const [name, chords, tonic, mode] of PROGRESSIONS) {
      for (let shift = 0; shift < 12; shift++) {
        const moved = chords.map((c) => T.transposeChordBySemitones(c, shift));
        const guesses = T.detectKeyFromChords(moved);
        const label = `${name} up ${shift}: ${moved.join(' ')}`;
        expect(pc(guesses[0].key.tonic), label).toBe((pc(tonic) + shift) % 12);
        expect(guesses[0].key.mode, label).toBe(mode);
        expect(guesses[0].key.theoretical, label).toBe(false);
        expect(guesses[0].confidence, label).toBeGreaterThan(guesses[1].confidence);
        expect(T.detectBestKey(moved)).toBe(guesses[0].key);
      }
    }
  });

  it('analyses them with the numerals a teacher would write', () => {
    const cases: Array<[string[], string, string]> = [
      [['C', 'G', 'Am', 'F'], 'C major', 'I V vi IV'],
      [['Dm7', 'G7', 'Cmaj7'], 'C major', 'ii7 V7 Imaj7'],
      [['Am', 'G', 'F', 'E'], 'A minor', 'i bVII bVI V'],
      [['Am', 'Dm', 'E7', 'Am'], 'A minor', 'i iv V7 i'],
      [['Bm7b5', 'E7', 'Am7'], 'A minor', 'iiø7 V7 i7'],
      [['Dm7b5', 'G7b9', 'Cm6'], 'C minor', 'iiø7 V7b9 i6'],
      [['G', 'B', 'C', 'Cm'], 'G major', 'I V/vi IV iv'],
      [['Cmaj7', 'A7', 'Dm7', 'G7'], 'C major', 'Imaj7 V7/ii ii7 V7'],
      [['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm'], 'G minor', 'iv7 bVII7 bIIImaj7 bVImaj7 iiø7 V7 i'],
      [['C', 'E7', 'Am', 'C7', 'F', 'Fm', 'C', 'G7'], 'C major', 'I V7/vi vi V7/IV IV iv I V7'],
    ];
    for (const [chords, keyName, romans] of cases) {
      const analysis = T.analyzeProgression(chords)!;
      expect(analysis.key.name, chords.join(' ')).toBe(keyName);
      expect(analysis.romans.join(' '), chords.join(' ')).toBe(romans);
      expect(T.progressionToChords(analysis.romans, analysis.key)).toEqual(chords);
    }
  });

  it('follows the spelling of the chords when a key has two names', () => {
    expect(T.detectBestKey(['F#', 'C#', 'D#m', 'B'])!.name).toBe('F# major');
    expect(T.detectBestKey(['Gb', 'Db', 'Ebm', 'Cb'])!.name).toBe('Gb major');
    expect(T.detectBestKey(['G#m', 'C#m', 'D#7', 'G#m'])!.name).toBe('G# minor');
    expect(T.detectBestKey(['Abm', 'Dbm', 'Eb7', 'Abm'])!.name).toBe('Ab minor');
    expect(T.detectBestKey(['A#m', 'D#m', 'E#7', 'A#m'])!.name).toBe('A# minor');
    expect(T.detectBestKey(['Cb', 'Fb', 'Gb', 'Cb'])!.name).toBe('Cb major');
  });

  it('lets long chords outweigh short ones', () => {
    // F belongs to C major and not to G major; D belongs to G major and not to C major.
    const chords = ['C', 'F', 'G', 'D'];
    const share = (weights: number[] | undefined, name: string, list: Array<string | number> = chords) =>
      T.detectKeyFromChords(list.filter((c): c is string => typeof c === 'string'), { weights, limit: 24 }).find((g) => g.key.name === name)!.score;
    const longF = [4, 8, 4, 1];
    const longD = [4, 1, 4, 8];
    expect(share(longF, 'C major')).toBeGreaterThan(share(undefined, 'C major'));
    expect(share(undefined, 'C major')).toBeGreaterThan(share(longD, 'C major'));
    expect(share(longD, 'G major')).toBeGreaterThan(share(undefined, 'G major'));
    expect(share(undefined, 'G major')).toBeGreaterThan(share(longF, 'G major'));
    expect(T.detectKeyFromChords(chords, { weights: longF })[0].key.name).toBe('C major');
    // Weights stay aligned when unreadable symbols are dropped, and equal weights are the same as none.
    expect(T.detectKeyFromChords(['???', ...chords], { weights: [99, ...longF] })).toEqual(T.detectKeyFromChords(chords, { weights: longF }));
    expect(T.detectKey(chords, { weights: longF })).toEqual(T.detectKeyFromChords(chords, { weights: longF }));
    expect(T.detectKeyFromChords(chords, { weights: [2, 2, 2, 2] })).toEqual(T.detectKeyFromChords(chords));
    // A bar of C and three bars of G7 is still C major; the long chord is its dominant.
    expect(T.detectKeyFromChords(['G7', 'C'], { weights: [12, 4] })[0].key.name).toBe('C major');
  });

  it('classifies the cadences those progressions end with', () => {
    const cases: Array<[string[], string, string | null]> = [
      [['G7', 'C'], 'C', 'Authentic cadence'], [['F', 'C'], 'C', 'Plagal cadence'], [['Fm', 'C'], 'C', 'Minor plagal cadence'],
      [['Dm', 'G'], 'C', 'Half cadence'], [['G7', 'Am'], 'C', 'Deceptive cadence'], [['G7', 'Ab'], 'C', 'Deceptive cadence'],
      [['E7', 'Am'], 'A minor', 'Authentic cadence'], [['E7', 'F'], 'A minor', 'Deceptive cadence'],
      [['F', 'E'], 'A minor', 'Phrygian half cadence'], [['Dm/F', 'E'], 'A minor', 'Phrygian half cadence'],
      [['G7/B', 'C'], 'C', 'Imperfect authentic cadence'], [['Bdim', 'C'], 'C', 'Imperfect authentic cadence'],
      [['Dm', 'Am'], 'A minor', 'Plagal cadence'], [['C', 'Dm'], 'C', null], [['Am', 'F'], 'C', null],
    ];
    for (const [chords, keyName, name] of cases) expect(T.classifyCadence(chords, keyName)?.name ?? null, chords.join(' ')).toBe(name);
  });
});

// ── 9. Odds and ends that broke, or would have ─────────────────────────────────────────────

describe('edge cases', () => {
  it('inverts every interval into one that completes the octave', () => {
    expect(T.invertInterval('A8')).toBe('d8');
    expect(T.invertInterval('d8')).toBe('A1');
    expect(T.invertInterval('A1')).toBe('d8');
    expect(T.invertInterval('P8')).toBe('P1');
    expect(T.invertInterval('P1')).toBe('P8');
    for (const name of ['m2', 'M2', 'A2', 'd3', 'm3', 'M3', 'A3', 'd4', 'P4', 'A4', 'd5', 'P5', 'A5', 'd6', 'm6', 'M6', 'A6', 'd7', 'm7', 'M7', 'A7', 'd2']) {
      const inverse = T.invertInterval(name);
      expect(T.semitones(name) + T.semitones(inverse), name).toBe(12);
      expect(T.interval(name).number + T.interval(inverse).number, name).toBe(9);
      expect(T.invertInterval(inverse), name).toBe(name);
      expect(T.invertInterval(T.addIntervals(name, 'P8'))).toBe(inverse);
    }
    for (const bad of ['d1', 'm1', 'M4', 'P3', 'P2', 'M5', 'M8', 'P0', 'm15', 'M', '3', '']) expect(T.parseInterval(bad), bad).toBeNull();
  });

  it('transposes chords without ever inventing a double-accidental root', () => {
    for (const symbol of ['C', 'F#m7b5', 'Bb7', 'Ebmaj7/G', 'G#dim7', 'Dbm', 'Cb', 'E#']) {
      for (const ivl of ['m2', 'M2', 'm3', 'M3', 'P4', 'A4', 'd5', 'P5', 'm6', 'M6', 'm7', 'M7', '-m2', '-M3']) {
        const moved = T.chord(T.transposeChord(symbol, ivl));
        expect(Math.abs(T.note(moved.root).alt), `${symbol} ${ivl}`).toBeLessThan(2);
        expect(pc(moved.root), `${symbol} ${ivl}`).toBe((pc(T.chord(symbol).root) + T.semitones(ivl) + 24) % 12);
        expect(moved.type.id).toBe(T.chord(symbol).type.id);
      }
      for (let semis = -12; semis <= 12; semis++) {
        const moved = T.chord(T.transposeChordBySemitones(symbol, semis));
        expect(Math.abs(T.note(moved.root).alt)).toBeLessThan(2);
        expect(pc(moved.root)).toBe((pc(T.chord(symbol).root) + semis + 24) % 12);
      }
    }
    expect(T.transposeProgression(['C', 'Am', 'F', 'G7'], 'C', 'F#')).toEqual(['F#', 'D#m', 'B', 'C#7']);
    expect(T.transposeProgression(['C', 'Am', 'F', 'G7'], 'C', 'Gb')).toEqual(['Gb', 'Ebm', 'Cb', 'Db7']);
    // The leading-tone chord of G# minor keeps its double sharp; a stranger to the key does not get one.
    expect(T.transposeProgression(['Am', 'E7', 'G#dim7'], 'A minor', 'G# minor')).toEqual(['G#m', 'D#7', 'F##dim7']);
    expect(T.transposeProgression(['Am', 'E7', 'G#dim7/B'], 'A', 'G# minor')).toEqual(['G#m', 'D#7', 'F##dim7/A#']);
    expect(T.transposeProgression(['Am', 'E7', 'G#dim7'], 'A minor', 'D#')).toEqual(['D#m', 'A#7', 'C##dim7']);
    expect(T.transposeProgression(['C', 'F#dim7', 'G'], 'C', 'C#')).toEqual(['C#', 'Gdim7', 'G#']);
    expect(T.transposeProgression(['C/E', 'N.C.', 'G7/B'], 'C', 'D')).toEqual(['D/F#', 'N.C.', 'A7/C#']);
  });

  it('formats every chord type in every naming system without touching its meaning', () => {
    for (const type of T.CHORD_TYPES) {
      for (const root of ['C', 'F#', 'Bb', 'B', 'Eb']) {
        const symbol = `${root}${type.symbol}`;
        expect(T.formatChord(symbol, { ascii: true }), symbol).toBe(symbol);
        const shown = T.formatChord(symbol);
        expect(/[#]/.test(shown), shown).toBe(false);
        expect(shown.replace(/♯/g, '#').replace(/♭/g, 'b'), symbol).toBe(symbol);
        const german = T.formatChord(symbol, { system: 'german' });
        expect(german.startsWith(root === 'Bb' ? 'B' : root === 'B' ? 'H' : T.formatNote(root)), german).toBe(true);
        if (root === 'Bb') expect(german.startsWith('B♭')).toBe(false);
        const solfege = T.formatChord(symbol, { system: 'solfege' });
        expect(solfege.startsWith({ C: 'Do', 'F#': 'Fa♯', Bb: 'Si♭', B: 'Si', Eb: 'Mi♭' }[root]!), solfege).toBe(true);
      }
    }
  });
});
