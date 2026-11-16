/**
 * Fixes from the independent review of the second integration pass: a phrase is named the way its
 * own words name it, a key guessed from the notes never turns C into B♯, spaced dashes still
 * separate typed numbers, and a wrong chord shape names a note once.
 */
import { describe, expect, it } from 'vitest';
import { checkText, normalizeText } from './answers';
import { chordBuildNote } from './chord-words';
import { resolveFigure } from './figures';
import { grade, referenceFrets, solve } from './grade';
import { exerciseSpelling, inferSpelling, spellPitch, textSpelling } from './spelling';
import type { ChordBuildExercise, PlayPhraseExercise, TabNote } from './types';

const explain = 'Because.';
const phrase = (cells: Array<[number, number]>, extra: Partial<PlayPhraseExercise> = {}): PlayPhraseExercise => ({
  type: 'play-phrase',
  prompt: 'Play it.',
  notes: cells.map(([string, fret]): TabNote => ({ string, fret, duration: 'q' })),
  octave: 'exact',
  explain,
  alternative: { type: 'true-false', statement: 'Yes.', answer: true, explain },
  ...extra,
});

describe('a phrase is named the way its own words name it', () => {
  // D, D#/Eb, E on strings 3 and 2: a blue-note passage in E.
  const passage = (words: Partial<PlayPhraseExercise> = {}) => phrase([[3, 7], [3, 8], [2, 5]], words);

  it('an explanation that says {n:Eb} gets Eb chips and an Eb answer, not D#', () => {
    const blues = passage({ explain: '{n:D} {n:Eb} {n:E}: the blue note leans into the root.' });
    expect(grade(blues, solve(blues)).feedback.answer).toBe('{n:D} {n:Eb} {n:E}');
    expect(spellPitch(63, exerciseSpelling(blues))).toBe('Eb4');
    // Without words to follow, the guessed key decides (a leading note D#).
    expect(spellPitch(63, exerciseSpelling(passage()))).toBe('D#4');
  });

  it('names in the tapping version count too, and a key written on the exercise wins over all words', () => {
    const tiles = passage({ alternative: { type: 'order', prompt: 'Order them.', tiles: ['{n:D}', '{n:Eb}', '{n:E}'], explain } });
    expect(spellPitch(63, exerciseSpelling(tiles))).toBe('Eb4');
    const keyed = passage({ explain: '{n:Eb} here.', key: 'E major' });
    expect(spellPitch(63, exerciseSpelling(keyed))).toBe('D#4');
  });

  it('a pitch written two ways is left to the key, and only {n:} symbols count', () => {
    expect(textSpelling(['{n:C#} or {n:Db}: the same key on the piano.', 'Then {n:E}.'])).toEqual({ 4: 'E' });
    expect(textSpelling(['Eb and D# in plain words name nothing.'])).toBeNull();
    expect(textSpelling(['{n:B#3} and {n:Cb4}'])).toEqual({ 0: 'B#', 11: 'Cb' });
  });

  it('a name from the words keeps the right octave across the B/C line', () => {
    expect(spellPitch(60, { names: { 0: 'B#' } })).toBe('B#3');
    expect(spellPitch(59, { names: { 11: 'Cb' } })).toBe('Cb4');
    expect(spellPitch(61, { names: { 1: 'Db' } }, { octave: false })).toBe('Db');
  });
});

describe('a key guessed from the notes never names a white key with an accidental it does not own', () => {
  it('the major-blues move C, C#, E is C, not B#', () => {
    // String 3 frets 5 and 6, string 2 fret 5: the notes alone look like C# minor.
    const move = phrase([[3, 5], [3, 6], [2, 5]]);
    const answer = grade(move, solve(move)).feedback.answer;
    expect(answer).toBe('{n:C} {n:C#} {n:E}');
    expect(answer).not.toContain('B#');
  });

  it('E F G# over an open B is F, never E#, and a real E# in F# major stays', () => {
    const line = inferSpelling([52, 59, 53, 59, 56, 59]);
    expect([52, 53, 56].map((m) => spellPitch(m, line))).not.toContain('E#3');
    expect(spellPitch(53, line)).toBe('F3');
    // F# major (six sharps) owns E#: a phrase in it keeps the name.
    const fSharp = inferSpelling([66, 68, 70, 71, 73, 75, 77, 78]);
    expect(spellPitch(77, fSharp)).toBe('E#5');
  });

  it('the earlier guarantees hold: A major sharps, F major flats, Für Elise D#', () => {
    expect(spellPitch(61, inferSpelling([57, 59, 61, 62, 64, 66, 68]))).toBe('C#4');
    expect(spellPitch(58, inferSpelling([53, 55, 57, 58, 60]))).toBe('Bb3');
    expect(spellPitch(63, inferSpelling([64, 63, 64, 63, 64, 59, 62, 60, 57]))).toBe('D#4');
  });

  it('a tab figure follows the names its caption writes', () => {
    const tab = resolveFigure({ kind: 'tab', notes: [{ string: 3, fret: 7, duration: 'q' }, { string: 3, fret: 8, duration: 'q' }, { string: 2, fret: 5, duration: 'q' }], caption: 'The passage {n:D} {n:Eb} {n:E}.' });
    expect(tab.notes.map((n) => n.note)).toEqual(['D4', 'Eb4', 'E4']);
  });
});

describe('typed numbers', () => {
  it('a spaced dash separates numbers like an unspaced one; a trailing minus stays', () => {
    expect(normalizeText('2 - 5 - 1')).toBe(normalizeText('2-5-1'));
    expect(normalizeText('2 - 5 - 1')).toBe('2 5 1');
    expect(checkText('2 - 5 - 1', { kind: 'text', value: '2 5 1' }).verdict).toBe('correct');
    expect(normalizeText('6 -')).toBe('6-');
    expect(normalizeText('1 6- 4 5')).toBe('1 6- 4 5');
  });
});

describe('a wrong chord shape in plain words', () => {
  it('two strings on the same wrong note name it once', () => {
    const c: ChordBuildExercise = { type: 'chord-build', task: 'fingers', chord: 'C', prompt: 'Build it.', explain };
    const note = chordBuildNote({ chord: 'C', frets: [null, 0, 2, 2, 1, 0], reference: referenceFrets(c), accept: 'any-voicing', built: 'Am', taught: ['C'] });
    expect(note).toBe('Strings 5 and 3 sound {n:A}, which is not in {c:C}.');
    // Two different wrong notes still name both.
    expect(chordBuildNote({ chord: 'C', frets: [3, 2, 0, 0, 0, 3], reference: referenceFrets(c), accept: 'any-voicing', built: 'G', taught: [] })).toBe('Strings 5 and 4 sound {n:B} and {n:D}, which are not in {c:C}.');
  });
});
