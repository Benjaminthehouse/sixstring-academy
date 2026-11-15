/**
 * Guards the barrel and the examples printed in API.md: if one of these fails, the digest that
 * other modules rely on has gone stale.
 */
import { describe, expect, it } from 'vitest';
import * as theory from './index';
import {
  accidentalPreference, analyzeProgression, barCapacity, beatPositions, buildChord, chordInversions, chordMidi,
  chordNotes, chordNotesFrom, chordToRoman, chordTones, classifyCadence, compareScales, consonance, degreeInKey,
  degreeInScale, degreeToInterval, diatonicChords, durationTicks, enharmonicIntervals, enharmonicKey, enharmonics,
  formatAccidental, formatChord, formatNote, formatRoman, germanNoteName, getChordType, getScale, guitarStaffRange,
  identifyChord, intervalBetween, intervalName, intervalToDegree, invertChord, invertInterval, key, keyFromSignature,
  keySignaturePositions, midiToNote, normalizeChordSymbol, noteAtDegree, noteAtStaffPosition, noteFromSlug, noteSlug,
  omittableTones, parallelChord, pcName, practicalKey, prettyAccidentals, progressionToChords, relativeChord,
  romanFor, romanToChord, scaleNotes, scalesForChord, secondaryDominants, semitones, semitonesToDegree,
  simplifyInterval, simplifyNote, spellInKey, spellInScale, splitDuration, splitProgression, staffPosition,
  swingPair, swingTick, tempoMarking, ticksToDuration, transpose, transposeBySemitones, transposeChord,
  transposeChordBySemitones, transposeProgression, tritoneSubstitute, tritoneSubstitutes, voicingTones, withOctaveFor,
} from './index';

describe('barrel', () => {
  it('exports the whole surface without name clashes', () => {
    const names = Object.keys(theory);
    expect(names.length).toBeGreaterThan(150);
    for (const name of [
      'parseNote', 'transpose', 'CHORD_TYPES', 'parseChord', 'identifyChords', 'SCALES', 'scaleNotes', 'scalesForChord',
      'harmonizeScale', 'getKey', 'ALL_KEYS', 'circleOfFifths', 'detectKey', 'parseRoman', 'romanToChord', 'chordToRoman',
      'modalInterchange', 'classifyCadence', 'nextChords', 'PPQ', 'parseTimeSignature', 'tempoMarking', 'staffPosition',
    ]) expect(names, name).toContain(name);
    expect(names).not.toContain('RAW_SCALES');
    expect(names).not.toContain('RAW_CHORD_TYPES');
  });

  it('makes route-safe ids for scales, chords and keys that round-trip', () => {
    const safe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    expect(theory.scaleSlug('A', 'minor')).toBe('a-minor');
    expect(theory.scaleSlug('F#', 'Dorian')).toBe('f-sharp-dorian');
    expect(theory.scaleSlug('Bb', 'major-pentatonic')).toBe('bb-major-pentatonic');
    expect(theory.parseScaleSlug('b-minor-blues')).toMatchObject({ tonic: 'B', scale: { id: 'minor-blues' } });
    expect(theory.parseScaleSlug('bb-bebop-dominant')).toMatchObject({ tonic: 'Bb', scale: { id: 'bebop-dominant' } });
    expect(theory.parseScaleSlug('a-nonsense')).toBeNull();
    expect(theory.parseScaleSlug('minor')).toBeNull();
    expect(theory.chordSlug('F#m7b5')).toBe('f-sharp-m7b5');
    expect(theory.chordSlug('Bbmaj7/D')).toBe('bb-maj7');
    expect(theory.chordSlug('C')).toBe('c-major');
    expect(theory.chordFromSlug('f-sharp-7sharp9')!.symbol).toBe('F#7#9');
    expect(theory.chordFromSlug('c-nonsense')).toBeNull();
    for (const tonic of ['C', 'C#', 'Db', 'F#', 'Bb', 'B', 'Eb']) {
      for (const scale of theory.SCALES) {
        const slug = theory.scaleSlug(tonic, scale);
        expect(slug).toMatch(safe);
        expect(theory.parseScaleSlug(slug)).toEqual({ tonic, scale });
      }
      for (const type of theory.CHORD_TYPES) {
        const slug = theory.chordSlug(`${tonic}${type.symbol}`);
        expect(slug).toMatch(safe);
        expect(theory.chordFromSlug(slug)!.symbol).toBe(`${tonic}${type.symbol}`);
      }
    }
  });

  it('never mutates its catalogs when used', () => {
    const before = JSON.stringify([theory.SCALES, theory.CHORD_TYPES, theory.ALL_KEYS]);
    scalesForChord('G7');
    theory.scalesContaining(['C', 'E', 'G']);
    theory.identifyChords(['C', 'E', 'G', 'Bb']);
    theory.modalInterchange('C');
    theory.detectKey(['C', 'F', 'G']);
    theory.nextChords('G7', 'C');
    expect(JSON.stringify([theory.SCALES, theory.CHORD_TYPES, theory.ALL_KEYS])).toBe(before);
  });
});

describe('API.md examples', () => {
  it('notes', () => {
    expect(pcName('F#4')).toBe('F#');
    expect(midiToNote(61)).toBe('Db4');
    expect(withOctaveFor('B#', 60)).toBe('B#3');
    expect(enharmonics('C#')).toEqual(['Db', 'B##']);
    expect(simplifyNote('E#')).toBe('F');
    expect(formatNote('F#4')).toBe('F♯4');
    expect(formatNote('F#4', { system: 'solfege' })).toBe('Fa♯4');
    expect(formatNote('B', { system: 'german' })).toBe('H');
    expect(formatNote('Bb', { system: 'german' })).toBe('B');
    expect(germanNoteName('F#')).toBe('Fis');
    expect([1, -1, 2, -2, 0].map((a) => formatAccidental(a))).toEqual(['♯', '♭', '𝄪', '𝄫', '']);
    expect(prettyAccidentals('Dorian b2')).toBe('Dorian ♭2');
    expect(noteSlug('F#')).toBe('f-sharp');
    expect(noteFromSlug('bb')).toBe('Bb');
  });

  it('intervals', () => {
    expect(semitones('P5')).toBe(7);
    expect(transpose('C#', 'M3')).toBe('E#');
    expect(transpose('C4', '-m3')).toBe('A3');
    expect(intervalBetween('C', 'Eb')).toBe('m3');
    expect(intervalBetween('E4', 'C4')).toBe('-M3');
    expect(invertInterval('M3')).toBe('m6');
    expect(simplifyInterval('M9')).toBe('M2');
    expect(intervalName('m3')).toBe('minor third');
    expect(consonance('M3')).toBe('imperfect');
    expect(degreeToInterval('b3')).toBe('m3');
    expect(intervalToDegree('A4')).toBe('#4');
    expect(semitonesToDegree(3)).toBe('b3');
    expect(transposeBySemitones('B3', 1)).toBe('C4');
    expect(enharmonicIntervals('A4', 'd5')).toBe(true);
  });

  it('chords', () => {
    for (const q of ['maj7', 'M7', 'Δ']) expect(getChordType(q)!.id).toBe('maj7');
    for (const q of ['7#9', '7sharp9']) expect(getChordType(q)!.id).toBe('7sharp9');
    expect(theory.CHORD_TYPES).toHaveLength(69);
    for (const s of ['F#m7b5/A', 'C-7', 'CΔ9', 'Bø7', 'E°7', 'G+', 'A7(#9)', 'Gsus', 'C6/9', 'Calt', 'Dadd9/F#']) expect(theory.parseChord(s), s).not.toBeNull();
    for (const s of ['C7no5', 'C13sus4b9', 'Cmaj7add13']) expect(theory.chord(s).type.custom, s).toBe(true);
    expect(theory.chord('Cb5').root).toBe('Cb');
    expect(normalizeChordSymbol('C-7')).toBe('Cm7');
    expect(buildChord('F#', 'm7b5').symbol).toBe('F#m7b5');
    expect(formatChord('Bbm7b5/Ab')).toBe('B♭m7♭5/A♭');
    expect(formatChord('Cmaj7', { jazz: true })).toBe('C△7');
    expect(formatChord('Bm7b5', { jazz: true })).toBe('Bø7');
    expect(chordNotes('F#m7b5')).toEqual(['F#', 'A', 'C', 'E']);
    expect(chordMidi('C9', { octave: 3 })).toEqual([48, 52, 55, 58, 62]);
    expect(chordNotesFrom('C9', 3)).toEqual(['C3', 'E3', 'G3', 'Bb3', 'D4']);
    expect(omittableTones('C13').map((t) => t.degree)).toEqual(['5', '9']);
    expect(voicingTones('C13', 4).map((t) => t.degree)).toEqual(['1', '3', 'b7', '13']);
    expect(identifyChord(['E', 'G', 'C'])).toBe('C/E');
    expect(identifyChord([40, 47, 52, 56, 59, 64])).toBe('E');
    expect(chordInversions('Cmaj7')).toEqual(['Cmaj7', 'Cmaj7/E', 'Cmaj7/G', 'Cmaj7/B']);
    expect(invertChord('C', 1)).toBe('C/E');
    expect(transposeChord('Am7/G', 'M2')).toBe('Bm7/A');
    expect(transposeChordBySemitones('Am', 4)).toBe('C#m');
    expect([relativeChord('C'), parallelChord('C'), tritoneSubstitute('G7')]).toEqual(['Am', 'Cm', 'Db7']);
  });

  it('scales', () => {
    expect(theory.SCALES).toHaveLength(89);
    for (const q of ['dorian', 'Natural Minor', 'super locrian', 'Ukrainian Dorian']) expect(getScale(q), q).not.toBeNull();
    expect(scaleNotes('F#', 'major')).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
    expect(degreeInScale('A', 'minor', 'C')).toBe('b3');
    expect(spellInScale('F#', 'major', 5)).toBe('E#');
    expect(compareScales('minor', 'dorian').changes).toEqual([{ number: 6, a: 'b6', b: '6' }]);
    expect(scaleNotes('G#', 'harmonic-minor')).toEqual(['G#', 'A#', 'B', 'C#', 'D#', 'E', 'F##']);
    expect(getScale('phrygian-dominant')!.degrees).toEqual(['1', 'b2', '3', '4', '5', 'b6', 'b7']);
    expect(scalesForChord('G7')[0].scale.name).toBe('Mixolydian');
  });

  it('keys', () => {
    for (const q of ['A minor', 'F#m', 'Bb', 'f-sharp-minor']) expect(theory.getKey(q), q).not.toBeNull();
    expect(keyFromSignature(3).name).toBe('A major');
    expect(keyFromSignature(-3, 'minor').name).toBe('C minor');
    expect(enharmonicKey('F#')!.name).toBe('Gb major');
    expect(practicalKey('G# major').name).toBe('Ab major');
    expect(spellInKey(66, 'Gb major')).toBe('Gb4');
    expect(spellInKey(6, 'G')).toBe('F#');
    expect(accidentalPreference('Eb major')).toBe('flats');
    expect(accidentalPreference('E minor')).toBe('sharps');
    expect(degreeInKey('Eb', 'C')).toBe('b3');
    expect(noteAtDegree('Eb major', 'b7')).toBe('Db');
    expect(diatonicChords('A minor', { minor: 'harmonic' }).map((c) => `${c.roman} ${c.symbol}`)).toEqual([
      'i Am', 'ii° Bdim', 'bIII+ Caug', 'iv Dm', 'V E', 'bVI F', 'vii° G#dim',
    ]);
    expect(spellInKey(56, key('Eb major'))).toBe('Ab3');
  });

  it('harmony', () => {
    expect(formatRoman('bVII')).toBe('♭VII');
    expect(romanFor('b7', getChordType('major')!)).toBe('bVII');
    expect(splitProgression('I–V–vi–IV')).toEqual(['I', 'V', 'vi', 'IV']);
    expect(romanToChord('V7/ii', 'C')).toBe('A7');
    expect(progressionToChords('ii V I', 'Bb')).toEqual(['Cm', 'F', 'Bb']);
    expect(chordToRoman('A7', 'C')).toMatchObject({ roman: 'V7/ii', literal: 'VI7', relation: 'secondary-dominant' });
    expect(chordToRoman('Bb', 'C').explanation).toBe('Borrowed from the parallel minor (C natural minor).');
    expect(transposeProgression(['C', 'Am', 'F', 'G7'], 'C', 'Eb')).toEqual(['Eb', 'Cm', 'Ab', 'Bb7']);
    expect(secondaryDominants('C')[0]).toEqual({ roman: 'V7/ii', symbol: 'A7', target: 'ii', targetChord: 'Dm' });
    expect(tritoneSubstitutes('C')[0]).toMatchObject({ roman: 'subV7', symbol: 'Db7', replaces: 'V7', replacesChord: 'G7' });
    expect(classifyCadence(['G7', 'C'])!.type).toBe('authentic');
    expect(analyzeProgression('Am F C G')).toMatchObject({ key: { name: 'A minor' }, romans: ['i', 'bVI', 'bIII', 'bVII'] });
    expect(chordTones('E7#9').map((t) => `${t.note} ${t.role}`)).toEqual(['E root', 'G# third', 'B fifth', 'D seventh', 'F## ninth']);
    expect(identifyChord([45, 52, 55, 60, 64])).toBe('Am7');
    expect(formatChord('F#m7b5/A')).toBe('F♯m7♭5/A');
  });

  it('rhythm and staff', () => {
    expect(durationTicks('eighth', { dots: 1 })).toBe(720);
    expect(durationTicks('eighth', { tuplet: 3 })).toBe(320);
    expect(ticksToDuration(1440)).toEqual({ value: 'quarter', dots: 1 });
    expect(splitDuration(2400)).toEqual([{ value: 'half' }, { value: 'eighth' }]);
    expect(barCapacity('6/8')).toBe(2880);
    expect(beatPositions('6/8')).toEqual([0, 1440]);
    expect(swingPair()).toEqual([640, 320]);
    expect(swingTick(480)).toBe(640);
    expect(tempoMarking(120).name).toBe('Allegro');
    expect(staffPosition('E2')).toMatchObject({ position: -7, ledgerLines: -3 });
    expect(noteAtStaffPosition(0)).toBe('E3');
    expect(keySignaturePositions(2)).toEqual([8, 5]);
    expect(guitarStaffRange().low).toBe(-7);
  });

  it('wild chord symbols, lookup, display and exercises', () => {
    const t = theory;
    const read: Array<[string, string | null]> = [
      ['CMI(MA7)', 'CmMaj7'], ['D/f#', 'D/F#'], ['C7M', 'Cmaj7'], ['Bm7(5-)', 'Bm7b5'], ['E7(9-/13-)', 'E7b9b13'], ['G7/4', 'G7sus4'],
      ['Cm+7', 'CmMaj7'], ['Csusb9', 'C7sus4b9'], ['Fmaj7#4', 'Fmaj7#11'], ['C⁷', 'C7'], ['B♭m7', 'Bbm7'],
      ['c', null], ['am', null], ['Cm7#9', null], ['C7b5#11', null], ['C77', null],
    ];
    for (const [written, symbol] of read) expect(t.parseChord(written)?.symbol ?? null, written).toBe(symbol);
    expect(t.parseNote('C#b')).toBeNull();
    expect(t.pitchClassMask(['C', 'E', 67])).toBe((1 << 0) | (1 << 4) | (1 << 7));
    expect(t.identifyChord(['C', 'E'])).toBe('C');
    expect(t.getScale('Kafi')!.id).toBe('dorian');
    expect(t.simplestTonic('A#', 'major')).toBe('Bb');
    expect(t.chordFitsScale('E7', scaleNotes('A', 'harmonic-minor'))).toBe(true);
    expect(t.chordFitsScale('Fm', scaleNotes('A', 'harmonic-minor'))).toBe(false);
    expect([t.getKey('key of G')!.name, t.getKey('fis-Moll')!.name]).toEqual(['G major', 'F# minor']);
    expect([spellInKey(2, 'Gb major'), spellInKey(2, 'Gb major', { strict: true }), spellInKey(7, 'G# minor')]).toEqual(['D', 'Ebb', 'F##']);
    expect(t.progressionToChords('i–VI–III–VII', 'A minor', { classical: true })).toEqual(['Am', 'F', 'C', 'G']);
    expect([t.romanFromClassicalMinor('VI'), t.romanToClassicalMinor('bVI')]).toEqual(['bVI', 'VI']);
    expect([chordToRoman('C7', 'C').roman, chordToRoman('C7', 'C', { next: 'G7' }).roman]).toEqual(['V7/IV', 'I7']);

    const map = t.scaleToneMap('A', 'minor-pentatonic');
    expect(t.toneAt(map, 48)).toMatchObject({ note: 'C', degree: 'b3', member: true, index: 1 });
    expect(t.hasTone(map, 49)).toBe(false);
    expect(t.spellWith(t.scaleToneMap('F#', 'major'), 65)).toBe('E#4');
    expect(t.chordToneMap('E7#9').tones.map((x) => x.degree)).toEqual(['1', '3', '5', 'b7', '#9']);

    expect(t.formatScaleName('Bb', 'lydian-sharp-2')).toBe('B♭ Lydian ♯2');
    expect(t.formatScaleNotes('F', 'major', { system: 'german' })).toEqual(['F', 'G', 'A', 'B', 'C', 'D', 'E']);
    expect(t.formatScaleNotes('Bb', 'major', { system: 'solfege' })).toEqual(['Si♭', 'Do', 'Re', 'Mi♭', 'Fa', 'Sol', 'La']);
    expect(t.formatScaleDegrees('dorian')).toEqual(['1', '2', '♭3', '4', '5', '6', '♭7']);
    expect([t.formatKey('Bb minor'), t.formatKey('Bb minor', { short: true })]).toEqual(['B♭ minor', 'B♭m']);
    expect(t.formatKeySignature('A major')).toEqual(['F♯', 'C♯', 'G♯']);
    expect(t.formatChords(['C', 'N.C.', 'F#m7b5', '??'])).toEqual(['C', 'N.C.', 'F♯m7♭5', '??']);
    expect(t.formatNotes(['Bb', 'B'], { system: 'german' })).toEqual(['B', 'H']);
    expect(t.formatDegree('b3')).toBe('♭3');

    expect(t.intervalsFrom('F#').map((i) => `${i.interval} ${i.note}`).slice(6, 8)).toEqual(['A4 B#', 'd5 C']);
    expect([t.checkSpelling('F', 'E#'), t.checkSpelling('E#', 'E#'), t.checkSpelling('E', 'E#')]).toEqual(['enharmonic', 'correct', 'wrong']);
    expect(t.distractorNotes('F#')).toEqual(['F', 'G', 'G#']);
    expect(t.distractorNotes('E#', { enharmonic: true })[0]).toBe('F');
    expect(t.distractorIntervals('M3')).toEqual(['m3', 'P4', 'm6']);
    expect(t.similarChordTypes('maj7', { sameSize: true })[0].id).toBe('6');
    expect(t.similarScales('dorian', { sameSize: true })[0].id).toBe('mixolydian');
  });
});
