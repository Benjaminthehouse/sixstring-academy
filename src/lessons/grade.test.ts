import { describe, expect, it } from 'vitest';
import { chordVoicings, midiAt } from '@/core/guitar';
import { chordNotes, staffPosition } from '@/core/theory';
import {
  RHYTHM_GRADING, answerText, correctOptions, explainOf, fillBank, findTargets, fretboardNameSpec, grade, missingChordNote, optionLabel,
  orderTiles, phraseMidi, playNoteTarget, presentExercise, promptOf, readFrets, referenceFrets, solve, spellInterval, staffPlaceTarget,
  staffReadSpec, tapTargets, tapToleranceMs, wrongAnswers,
} from './grade';
import type {
  Answer, ChoiceExercise, ChordBuildExercise, Exercise, FillBlanksExercise, FlashcardExercise, FretboardFindExercise, FretboardNameExercise,
  ListenChoiceExercise, MatchPairsExercise, OrderExercise, PlayChordExercise, PlayNoteExercise, PlayPhraseExercise, StaffPlaceExercise,
  StaffReadExercise, TapRhythmExercise, TrueFalseExercise, TypeAnswerExercise,
} from './types';

const explain = 'Because.';

describe('choice', () => {
  const single: ChoiceExercise = {
    type: 'choice',
    prompt: 'Which note is the fifth of {c:C}?',
    options: [{ text: '{n:E}', why: 'That is the third.' }, { text: '{n:G}', correct: true }, { text: '{n:A}' }],
    explain,
  };
  const multi: ChoiceExercise = {
    type: 'choice',
    prompt: 'Which notes are in {c:C}?',
    multiple: true,
    options: [{ text: '{n:C}', correct: true }, { text: '{n:D}' }, { text: '{n:E}', correct: true }, { text: '{n:G}', correct: true }],
    explain,
  };

  it('single: exactly the right option', () => {
    expect(grade(single, { type: 'choice', selected: [1] })).toMatchObject({ correct: true, score: 1 });
    const wrong = grade(single, { type: 'choice', selected: [0] });
    expect(wrong).toMatchObject({ correct: false, score: 0 });
    expect(wrong.feedback.answer).toBe('{n:G}');
    expect(wrong.feedback.explain).toBe(explain);
    expect(wrong.feedback.detail).toEqual({ type: 'choice', correct: [1], selected: [0], why: [{ option: 0, text: 'That is the third.' }] });
    expect(grade(single, { type: 'choice', selected: [] }).correct).toBe(false);
    expect(grade(single, { type: 'choice', selected: [1, 2] }).correct).toBe(false);
    expect(grade(single, { type: 'choice', selected: [9] }).correct).toBe(false);
  });

  it('multiple: every right option and no other, with partial credit', () => {
    expect(grade(multi, { type: 'choice', selected: [3, 0, 2] }).correct).toBe(true);
    const some = grade(multi, { type: 'choice', selected: [0, 2] });
    expect(some).toMatchObject({ correct: false, near: 'incomplete' });
    expect(some.score).toBeCloseTo(2 / 3);
    const extra = grade(multi, { type: 'choice', selected: [0, 1, 2, 3] });
    expect(extra).toMatchObject({ correct: false, near: 'extra' });
    expect(extra.score).toBeCloseTo(2 / 3);
    expect(grade(multi, { type: 'choice', selected: [1] }).score).toBe(0);
    expect(grade(multi, { type: 'choice', selected: [0, 0, 2, 3] }).correct).toBe(true);
  });

  it('solve, wrongAnswers and helpers', () => {
    expect(solve(single)).toEqual({ type: 'choice', selected: [1] });
    expect(wrongAnswers(single)).toEqual([{ type: 'choice', selected: [0] }, { type: 'choice', selected: [2] }]);
    expect(wrongAnswers(multi).every((a) => !grade(multi, a).correct)).toBe(true);
    expect(wrongAnswers(multi).length).toBeGreaterThan(1);
    expect(correctOptions(multi)).toEqual([0, 2, 3]);
    expect(optionLabel({ figure: { kind: 'rhythm', pattern: 'q q q q' } }, 2)).toBe('Option 3');
    expect(promptOf(single)).toBe(single.prompt);
    expect(explainOf(single)).toBe(explain);
    expect(answerText(single)).toBe('G');
  });

  it('listen-choice grades like a single choice', () => {
    const ex: ListenChoiceExercise = { type: 'listen-choice', prompt: 'Higher or lower?', sound: { kind: 'notes', notes: ['C3', 'G3'] }, options: [{ text: 'Higher', correct: true }, { text: 'Lower' }], shuffle: false, explain };
    expect(grade(ex, { type: 'listen-choice', selected: [0] }).correct).toBe(true);
    expect(grade(ex, { type: 'listen-choice', selected: [1] }).correct).toBe(false);
    expect(grade(ex, { type: 'listen-choice', selected: [1] }).feedback.detail.type).toBe('listen-choice');
    expect(presentExercise(ex, 5).options).toEqual([0, 1]);
  });
});

describe('true-false', () => {
  const ex: TrueFalseExercise = { type: 'true-false', statement: '{n:E} to {n:F} is a half step.', answer: true, explain };
  it('grades and has a default prompt', () => {
    expect(grade(ex, { type: 'true-false', value: true }).correct).toBe(true);
    expect(grade(ex, { type: 'true-false', value: false })).toMatchObject({ correct: false, feedback: { answer: 'True', detail: { type: 'true-false', answer: true } } });
    expect(promptOf(ex)).toBe('True or false?');
    expect(promptOf({ ...ex, prompt: 'Right or wrong?' })).toBe('Right or wrong?');
    expect(wrongAnswers(ex)).toEqual([{ type: 'true-false', value: false }]);
  });
});

describe('match-pairs', () => {
  const ex: MatchPairsExercise = {
    type: 'match-pairs',
    prompt: 'Match.',
    pairs: [{ left: 'Minor second', right: '1 half step' }, { left: 'Major second', right: '2 half steps' }, { left: 'Octave', right: '12 half steps' }],
    explain,
  };
  it('all pairs right, in any order', () => {
    expect(grade(ex, { type: 'match-pairs', pairs: [[2, 2], [0, 0], [1, 1]] }).correct).toBe(true);
  });
  it('a wrong pairing fails, with partial credit and the solution', () => {
    const r = grade(ex, { type: 'match-pairs', pairs: [[0, 1], [1, 0], [2, 2]] });
    expect(r.correct).toBe(false);
    expect(r.feedback.detail).toEqual({ type: 'match-pairs', solution: [[0, 0], [1, 1], [2, 2]], right: [[2, 2]], wrong: [[0, 1], [1, 0]], unmatched: [0, 1] });
    expect(r.score).toBe(0);
  });
  it('wrong attempts count even when every pair is found in the end', () => {
    const r = grade(ex, { type: 'match-pairs', pairs: [[0, 1], [0, 0], [1, 1], [2, 2]] });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(2 / 3);
  });
  it('unfinished is incomplete', () => {
    expect(grade(ex, { type: 'match-pairs', pairs: [[0, 0]] })).toMatchObject({ correct: false, near: 'incomplete' });
    expect(grade(ex, { type: 'match-pairs', pairs: [[9, 9], [-1, 0]] as Array<[number, number]> }).correct).toBe(false);
  });
  it('right-hand tiles that read the same are interchangeable', () => {
    const twins: MatchPairsExercise = { ...ex, pairs: [{ left: 'String 6', right: '{n:E}' }, { left: 'String 1', right: '{n:E}' }, { left: 'String 5', right: '{n:A}' }] };
    expect(grade(twins, { type: 'match-pairs', pairs: [[0, 1], [1, 0], [2, 2]] }).correct).toBe(true);
  });
  it('wrongAnswers swap one pairing', () => {
    expect(wrongAnswers(ex).length).toBe(3);
    expect(wrongAnswers(ex).every((a) => !grade(ex, a).correct)).toBe(true);
  });
});

describe('order', () => {
  const ex: OrderExercise = { type: 'order', prompt: 'Order the strings.', tiles: ['{n:E}', '{n:A}', '{n:D}', '{n:G}', '{n:B}', '{n:E}'], distractors: ['{n:C}'], explain };
  it('the right order, and tiles that read the same are interchangeable', () => {
    expect(grade(ex, { type: 'order', order: [0, 1, 2, 3, 4, 5] }).correct).toBe(true);
    expect(grade(ex, { type: 'order', order: [5, 1, 2, 3, 4, 0] }).correct).toBe(true);
  });
  it('wrong orders, short answers, distractors and repeated tiles fail', () => {
    const swapped = grade(ex, { type: 'order', order: [0, 2, 1, 3, 4, 5] });
    expect(swapped.correct).toBe(false);
    expect(swapped.feedback.detail).toEqual({ type: 'order', solution: [0, 1, 2, 3, 4, 5], wrongAt: [1, 2] });
    expect(swapped.score).toBeCloseTo(4 / 6);
    expect(grade(ex, { type: 'order', order: [0, 1, 2] }).correct).toBe(false);
    expect(grade(ex, { type: 'order', order: [0, 1, 2, 3, 4, 6] }).correct).toBe(false);
    expect(grade(ex, { type: 'order', order: [0, 1, 2, 3, 4, 0] }).correct).toBe(false);
    expect(grade(ex, { type: 'order', order: [0, 1, 2, 3, 4, 5, 6] }).correct).toBe(false);
  });
  it('helpers', () => {
    expect(orderTiles(ex)).toHaveLength(7);
    expect(wrongAnswers(ex).every((a) => !grade(ex, a).correct)).toBe(true);
    expect(wrongAnswers(ex).length).toBeGreaterThan(3);
    expect(grade(ex, { type: 'order', order: [] }).feedback.answer).toBe('{n:E}  {n:A}  {n:D}  {n:G}  {n:B}  {n:E}');
  });
  it('is never presented already solved', () => {
    for (let seed = 0; seed < 200; seed++) {
      const shown = presentExercise(ex, seed).tiles!;
      expect([...shown].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(grade(ex, { type: 'order', order: shown.slice(0, 6) }).correct, `seed ${seed}`).toBe(false);
    }
    const two: OrderExercise = { type: 'order', prompt: 'p', tiles: ['low', 'high', 'higher'], explain };
    for (let seed = 0; seed < 50; seed++) expect(presentExercise(two, seed).tiles).not.toEqual([0, 1, 2]);
  });
});

describe('fill-blanks', () => {
  const ex: FillBlanksExercise = { type: 'fill-blanks', prompt: 'Complete.', text: '{n:C} {n:D} ___ {n:F} {n:G} ___ {n:B}', blanks: ['{n:E}', '{n:A}'], bank: ['{n:F#}', '{n:Bb}'], explain };
  it('each blank by what the tile says', () => {
    expect(grade(ex, { type: 'fill-blanks', blanks: ['{n:E}', '{n:A}'] }).correct).toBe(true);
    expect(grade(ex, { type: 'fill-blanks', blanks: ['{n:e}', ' {n:A} '] }).correct).toBe(true);
    const swapped = grade(ex, { type: 'fill-blanks', blanks: ['{n:A}', '{n:E}'] });
    expect(swapped.correct).toBe(false);
    expect(swapped.feedback.detail).toEqual({ type: 'fill-blanks', solution: ['{n:E}', '{n:A}'], ok: [false, false] });
    const half = grade(ex, { type: 'fill-blanks', blanks: ['{n:E}', null] });
    expect(half).toMatchObject({ correct: false, near: 'incomplete', score: 0.5 });
    expect(grade(ex, { type: 'fill-blanks', blanks: [] }).correct).toBe(false);
  });
  it('unordered blanks accept any order but not a repeat', () => {
    const chord: FillBlanksExercise = { type: 'fill-blanks', prompt: 'p', text: '{c:C} is ___, ___ and ___.', blanks: ['{n:C}', '{n:E}', '{n:G}'], bank: ['{n:F}'], unordered: true, explain };
    expect(grade(chord, { type: 'fill-blanks', blanks: ['{n:G}', '{n:C}', '{n:E}'] }).correct).toBe(true);
    expect(grade(chord, { type: 'fill-blanks', blanks: ['{n:G}', '{n:G}', '{n:E}'] }).correct).toBe(false);
    expect(wrongAnswers(chord).every((a) => !grade(chord, a).correct)).toBe(true);
  });
  it('the bank holds every answer once per use plus the distractors', () => {
    expect(fillBank(ex)).toEqual(['{n:E}', '{n:A}', '{n:F#}', '{n:Bb}']);
    expect(fillBank({ ...ex, blanks: ['{n:E}', '{n:E}'], bank: ['{n:E}', '{n:F}', '{n:F}'] })).toEqual(['{n:E}', '{n:E}', '{n:F}']);
    expect([...presentExercise(ex, 3).bank!].sort()).toEqual([...fillBank(ex)].sort());
    expect(wrongAnswers(ex).every((a) => !grade(ex, a).correct)).toBe(true);
  });
});

describe('type-answer', () => {
  it('a key-signature question: the spelling matters', () => {
    const ex: TypeAnswerExercise = { type: 'type-answer', prompt: 'Which note is sharp in {k:G major}?', answer: { kind: 'note', value: 'F#', spelling: 'exact' }, explain };
    expect(grade(ex, { type: 'type-answer', text: 'f sharp' }).correct).toBe(true);
    const twin = grade(ex, { type: 'type-answer', text: 'Gb' });
    expect(twin).toMatchObject({ correct: false, near: 'enharmonic' });
    expect(twin.feedback.note).toMatch(/Right pitch, different name.*\{n:F#\}/);
    expect(twin.feedback.detail).toEqual({ type: 'type-answer', expected: 'F#', given: 'Gb', verdict: 'enharmonic' });
    expect(grade(ex, { type: 'type-answer', text: 'G' })).toMatchObject({ correct: false });
    expect(grade(ex, { type: 'type-answer', text: 'G' }).near).toBeUndefined();
    expect(grade(ex, { type: 'type-answer', text: '' }).feedback.note).toMatch(/could not be read/);
  });
  it('a which-fret question: only the number matters', () => {
    const ex: TypeAnswerExercise = { type: 'type-answer', prompt: 'On string 6, which fret is {n:G}?', answer: { kind: 'number', value: 3, accept: [15] }, explain };
    expect(grade(ex, { type: 'type-answer', text: 'fret 3' }).correct).toBe(true);
    expect(grade(ex, { type: 'type-answer', text: '15' }).correct).toBe(true);
    expect(grade(ex, { type: 'type-answer', text: '4' }).correct).toBe(false);
    expect(grade(ex, { type: 'type-answer', text: '4' }).feedback.answer).toBe('3');
  });
  it('a pitch question accepts either name', () => {
    const ex: TypeAnswerExercise = { type: 'type-answer', prompt: 'Which note is one fret above {n:F}?', answer: { kind: 'note', value: 'F#', spelling: 'any' }, explain };
    expect(grade(ex, { type: 'type-answer', text: 'Gb' }).correct).toBe(true);
    expect(grade(ex, { type: 'type-answer', text: 'H' }, { naming: 'german' }).correct).toBe(false);
  });
  it('roman numerals: case is the near miss', () => {
    const ex: TypeAnswerExercise = { type: 'type-answer', prompt: 'p', answer: { kind: 'roman', value: 'vi' }, explain };
    const r = grade(ex, { type: 'type-answer', text: 'VI' });
    expect(r).toMatchObject({ correct: false, near: 'case' });
    expect(r.feedback.note).toMatch(/case matters/);
    expect(solve(ex)).toEqual({ type: 'type-answer', text: 'vi' });
  });
});

describe('tap-rhythm', () => {
  const ex: TapRhythmExercise = { type: 'tap-rhythm', prompt: 'Tap.', rhythm: { pattern: 'q e e q q' }, tempo: 60, show: 'both', explain };
  const exact = [0, 1, 1.5, 2, 3];
  const shifted = (by: number): number[] => exact.map((t) => t + by);

  it('targets come from the rhythm and the tempo', () => {
    expect(tapTargets(ex)).toEqual(exact);
    expect(solve(ex)).toEqual({ type: 'tap-rhythm', taps: exact });
  });

  it('exact taps pass at every level', () => {
    for (const level of ['beginner', 'intermediate', 'expert'] as const) expect(grade(ex, { type: 'tap-rhythm', taps: exact }, { level }).correct).toBe(true);
  });

  it('tolerance depends on the level', () => {
    // One note 120 ms late: inside a beginner's window, outside an expert's.
    const sloppy = [0, 1, 1.62, 2, 3];
    expect(grade(ex, { type: 'tap-rhythm', taps: sloppy }, { level: 'beginner' }).correct).toBe(true);
    const strict = grade(ex, { type: 'tap-rhythm', taps: sloppy }, { level: 'expert' });
    expect(strict).toMatchObject({ correct: false, near: 'timing' });
    if (strict.feedback.detail.type !== 'tap-rhythm') throw new Error('detail');
    expect(strict.feedback.detail.onsets[2]).toMatchObject({ verdict: 'late', time: 1.5 });
    expect(strict.feedback.detail.toleranceMs).toBe(RHYTHM_GRADING.expert.toleranceMs);
    expect(tapToleranceMs(ex, { level: 'beginner' })).toBe(RHYTHM_GRADING.beginner.toleranceMs);
    // The exercise's own level wins over the course level.
    expect(grade({ ...ex, level: 'expert' }, { type: 'tap-rhythm', taps: sloppy }, { level: 'beginner' }).correct).toBe(false);
  });

  it('a constant delay (device latency) is measured and removed', () => {
    for (const delay of [0.08, 0.11, -0.06]) {
      const r = grade(ex, { type: 'tap-rhythm', taps: shifted(delay) }, { level: 'expert' });
      expect(r.correct, `delay ${delay}`).toBe(true);
      if (r.feedback.detail.type !== 'tap-rhythm') throw new Error('detail');
      expect(r.feedback.detail.offsetMs).toBe(Math.round(delay * 1000));
      expect(r.feedback.detail.onsets.every((o) => Math.abs(o.errorMs ?? 99) <= 1)).toBe(true);
    }
    // More than the cap is not forgiven.
    expect(grade(ex, { type: 'tap-rhythm', taps: shifted(0.4) }, { level: 'expert' }).correct).toBe(false);
  });

  it('missed notes and stray taps', () => {
    const missed = grade(ex, { type: 'tap-rhythm', taps: [0, 1, 2, 3] }, { level: 'beginner' });
    if (missed.feedback.detail.type !== 'tap-rhythm') throw new Error('detail');
    // Four of five is exactly the beginner pass mark (80 %).
    expect(missed.feedback.detail).toMatchObject({ hits: 4, needed: 4 });
    expect(missed.correct).toBe(true);
    expect(missed.feedback.detail.onsets[2].verdict).toBe('missed');
    expect(grade(ex, { type: 'tap-rhythm', taps: [0, 1, 2, 3] }, { level: 'intermediate' }).correct).toBe(false);
    expect(grade(ex, { type: 'tap-rhythm', taps: [0, 2, 3] }, { level: 'beginner' })).toMatchObject({ correct: false, near: 'incomplete' });
    // One stray tap is forgiven below expert level; two are not.
    expect(grade(ex, { type: 'tap-rhythm', taps: [...exact, 3.5] }, { level: 'beginner' }).correct).toBe(true);
    expect(grade(ex, { type: 'tap-rhythm', taps: [...exact, 3.5] }, { level: 'expert' }).correct).toBe(false);
    const noisy = grade(ex, { type: 'tap-rhythm', taps: [...exact, 2.5, 3.5] }, { level: 'beginner' });
    expect(noisy).toMatchObject({ correct: false, near: 'extra' });
    expect(grade(ex, { type: 'tap-rhythm', taps: [] }).correct).toBe(false);
    expect(grade(ex, { type: 'tap-rhythm', taps: [Number.NaN, 1] }).correct).toBe(false);
  });

  it('first-tap mode starts the clock at the first tap', () => {
    const free: TapRhythmExercise = { ...ex, start: 'first-tap' };
    expect(grade(free, { type: 'tap-rhythm', taps: shifted(7.3) }, { level: 'expert' }).correct).toBe(true);
    expect(grade(ex, { type: 'tap-rhythm', taps: shifted(7.3) }, { level: 'expert' }).correct).toBe(false);
  });

  it('the window never swallows the neighbouring note', () => {
    const fast: TapRhythmExercise = { ...ex, rhythm: { pattern: 's s s s q q q' }, tempo: 80 };
    // Sixteenths at 80 BPM are 187 ms apart: 40 % of that is 75 ms.
    expect(tapToleranceMs(fast, { level: 'beginner' })).toBe(75);
  });
});

describe('fretboard-find', () => {
  const one: FretboardFindExercise = { type: 'fretboard-find', prompt: 'Find {n:G} on string 6.', find: { note: 'G' }, mode: 'one', octave: 'any', frets: [0, 5], strings: [6], explain };

  it('one: any right position in the region', () => {
    expect(findTargets(one)).toEqual([{ string: 6, fret: 3, midi: 43, note: 'G' }]);
    expect(grade(one, { type: 'fretboard-find', positions: [{ string: 6, fret: 3 }] }).correct).toBe(true);
    const wrong = grade(one, { type: 'fretboard-find', positions: [{ string: 6, fret: 2 }] });
    expect(wrong.correct).toBe(false);
    if (wrong.feedback.detail.type !== 'fretboard-find') throw new Error('detail');
    expect(wrong.feedback.detail.wrong).toEqual([{ string: 6, fret: 2, midi: 42, note: 'F#' }]);
    // The right note outside the region is not an answer to THIS question.
    expect(grade(one, { type: 'fretboard-find', positions: [{ string: 3, fret: 0 }] }).correct).toBe(false);
    expect(grade(one, { type: 'fretboard-find', positions: [] }).correct).toBe(false);
    expect(grade(one, { type: 'fretboard-find', positions: [{ string: 9, fret: 99 }] }).correct).toBe(false);
  });

  it('the octave policy is the exercise\'s', () => {
    const any: FretboardFindExercise = { ...one, find: { note: 'E' }, strings: undefined, mode: 'all' };
    expect(findTargets(any).map((t) => `${t.string}:${t.fret}`)).toEqual(['6:0', '4:2', '2:5', '1:0']);
    const exact: FretboardFindExercise = { ...any, find: { note: 'E4' }, octave: 'exact' };
    expect(findTargets(exact).map((t) => `${t.string}:${t.fret}`)).toEqual(['2:5', '1:0']);
    const slip = grade({ ...exact, mode: 'one' }, { type: 'fretboard-find', positions: [{ string: 6, fret: 0 }] });
    expect(slip).toMatchObject({ correct: false, near: 'octave' });
    expect(slip.feedback.note).toMatch(/different octave/);
    expect(grade({ ...any, mode: 'one' }, { type: 'fretboard-find', positions: [{ string: 6, fret: 0 }] }).correct).toBe(true);
  });

  it('all: every position, with partial credit', () => {
    const all: FretboardFindExercise = { type: 'fretboard-find', prompt: 'p', find: { chord: 'C' }, mode: 'all', octave: 'any', frets: [0, 3], strings: [5, 4, 3], explain };
    const targets = findTargets(all);
    expect(targets.map((t) => `${t.string}:${t.fret}:${t.note}`)).toEqual(['5:3:C', '4:2:E', '3:0:G']);
    expect(grade(all, { type: 'fretboard-find', positions: targets }).correct).toBe(true);
    const partial = grade(all, { type: 'fretboard-find', positions: targets.slice(0, 2) });
    expect(partial).toMatchObject({ correct: false, near: 'incomplete' });
    expect(partial.score).toBeCloseTo(2 / 3);
    if (partial.feedback.detail.type !== 'fretboard-find') throw new Error('detail');
    expect(partial.feedback.detail.missed).toEqual([{ string: 3, fret: 0 }]);
    const withWrong = grade(all, { type: 'fretboard-find', positions: [...targets, { string: 5, fret: 1 }] });
    expect(withWrong.correct).toBe(false);
    expect(withWrong.score).toBeCloseTo(2 / 3);
    // Tapping a place twice does not count twice.
    expect(grade(all, { type: 'fretboard-find', positions: [...targets, targets[0]] }).correct).toBe(true);
  });

  it('scale notes and intervals from a shown root', () => {
    const scale: FretboardFindExercise = { type: 'fretboard-find', prompt: 'p', find: { scale: 'minor-pentatonic', tonic: 'A' }, mode: 'all', octave: 'any', frets: [5, 8], strings: [6, 5], explain };
    expect(findTargets(scale).map((t) => `${t.string}:${t.fret}:${t.note}`)).toEqual(['6:5:A', '6:8:C', '5:5:D', '5:7:E']);
    const third: FretboardFindExercise = { type: 'fretboard-find', prompt: 'p', find: { interval: 'M3', from: { string: 6, fret: 3 } }, mode: 'one', octave: 'exact', frets: [0, 7], explain };
    const targets = findTargets(third);
    expect(targets.map((t) => `${t.string}:${t.fret}`)).toEqual(['6:7', '5:2']);
    expect(targets.every((t) => t.midi === midiAt({ string: 6, fret: 3 }) + 4 && t.note === 'B')).toBe(true);
    expect(grade(third, { type: 'fretboard-find', positions: [{ string: 5, fret: 2 }] }).correct).toBe(true);
    expect(grade(third, { type: 'fretboard-find', positions: [{ string: 6, fret: 6 }] }).correct).toBe(false);
  });

  it('follows the tuning and the capo', () => {
    const dropD: FretboardFindExercise = { ...one, find: { note: 'D' }, tuning: 'drop-d' };
    expect(findTargets(dropD).map((t) => t.fret)).toEqual([0]);
    const capo: FretboardFindExercise = { ...one, find: { note: 'G' }, capo: 2 };
    expect(findTargets(capo).map((t) => t.fret)).toEqual([1]);
  });
});

describe('spellInterval', () => {
  it('spells the pair so it reads simply', () => {
    expect(spellInterval(43, 'M3')).toEqual({ root: 'G', target: 'B' });
    expect(spellInterval(50, 'M3')).toEqual({ root: 'D', target: 'F#' });
    // A flat + minor third would be C flat: the sharp name of the root gives B.
    expect(spellInterval(44, 'm3')).toEqual({ root: 'G#', target: 'B' });
    expect(spellInterval(46, 'P5')).toEqual({ root: 'Bb', target: 'F' });
    expect(spellInterval(42, 'M2')).toEqual({ root: 'F#', target: 'G#' });
  });
});

describe('fretboard-name', () => {
  it('note: any name of the pitch, or the key\'s name when the spelling is exact', () => {
    const any: FretboardNameExercise = { type: 'fretboard-name', prompt: 'p', position: { string: 6, fret: 2 }, ask: 'note', spelling: 'any', options: ['F#', 'F', 'G', 'E'], explain };
    expect(grade(any, { type: 'fretboard-name', text: 'F#' }).correct).toBe(true);
    expect(grade(any, { type: 'fretboard-name', text: 'g flat' }).correct).toBe(true);
    expect(grade(any, { type: 'fretboard-name', text: 'G' }).correct).toBe(false);
    expect(wrongAnswers(any)).toHaveLength(3);
    const inFlats: FretboardNameExercise = { ...any, spelling: 'exact', key: 'Db major', options: undefined };
    expect(fretboardNameSpec(inFlats)).toEqual({ kind: 'note', value: 'Gb', spelling: 'exact' });
    expect(grade(inFlats, { type: 'fretboard-name', text: 'Gb' }).correct).toBe(true);
    expect(grade(inFlats, { type: 'fretboard-name', text: 'F#' })).toMatchObject({ correct: false, near: 'enharmonic' });
  });
  it('interval and degree are measured from the root on the neck', () => {
    const ivl: FretboardNameExercise = { type: 'fretboard-name', prompt: 'p', position: { string: 5, fret: 2 }, root: { string: 6, fret: 3 }, ask: 'interval', spelling: 'any', explain };
    expect(fretboardNameSpec(ivl)).toEqual({ kind: 'interval', value: 'M3', spelling: 'any' });
    expect(grade(ivl, { type: 'fretboard-name', text: 'major third' }).correct).toBe(true);
    expect(grade(ivl, { type: 'fretboard-name', text: 'm3' }).correct).toBe(false);
    const tritone: FretboardNameExercise = { ...ivl, position: { string: 5, fret: 4 } };
    expect(grade(tritone, { type: 'fretboard-name', text: 'A4' }).correct).toBe(true);
    expect(grade(tritone, { type: 'fretboard-name', text: 'd5' }).correct).toBe(true);
    const degree: FretboardNameExercise = { ...ivl, ask: 'degree', position: { string: 6, fret: 6 } };
    expect(fretboardNameSpec(degree)).toEqual({ kind: 'degree', value: 'b3', spelling: 'any' });
    expect(grade(degree, { type: 'fretboard-name', text: 'flat 3' }).correct).toBe(true);
    expect(solve(degree)).toEqual({ type: 'fretboard-name', text: 'b3' });
  });
  it('a malformed exercise is ungradable, not a crash', () => {
    const below: FretboardNameExercise = { type: 'fretboard-name', prompt: 'p', position: { string: 6, fret: 0 }, root: { string: 6, fret: 3 }, ask: 'interval', spelling: 'any', explain };
    expect(fretboardNameSpec(below)).toBeNull();
    expect(grade(below, { type: 'fretboard-name', text: 'm3' }).correct).toBe(false);
    expect(fretboardNameSpec({ ...below, root: undefined })).toBeNull();
    expect(fretboardNameSpec({ ...below, position: { string: 9, fret: 0 } })).toBeNull();
  });
});

describe('chord-build', () => {
  const em: ChordBuildExercise = { type: 'chord-build', task: 'fingers', chord: 'Em', prompt: 'Build {c:Em}.', explain };
  it('fingers: any correct voicing by default', () => {
    expect(referenceFrets(em)).toEqual([...chordVoicings('Em')[0].frets]);
    expect(grade(em, { type: 'chord-build', frets: [0, 2, 2, 0, 0, 0] }).correct).toBe(true);
    // Another real E minor shape is right too.
    expect(grade(em, { type: 'chord-build', frets: [null, null, 2, 0, 0, 0] }).correct).toBe(true);
    const major = grade(em, { type: 'chord-build', frets: [0, 2, 2, 1, 0, 0] });
    expect(major.correct).toBe(false);
    // Plain words: the common chord it makes (taught or not: no list given), then the string at fault.
    expect(major.feedback.note).toBe('That shape is {c:E}. String 3 sounds {n:G#}, which is not in {c:Em}.');
    if (major.feedback.detail.type !== 'chord-build' || major.feedback.detail.task !== 'fingers') throw new Error('detail');
    expect(major.feedback.detail.wrongStrings).toEqual([3]);
    expect(major.feedback.detail.built).toBe('E');
    // The answer is the chord; the screen draws its box (no fret strings such as 022000).
    expect(major.feedback.answer).toBe('{c:Em}');
    expect(grade(em, { type: 'chord-build', frets: [null, null, null, null, null, null] }).correct).toBe(false);
    expect(grade(em, { type: 'chord-build' }).correct).toBe(false);
  });
  it('fingers: only the given shape when asked', () => {
    const strict: ChordBuildExercise = { ...em, accept: 'this-shape' };
    expect(grade(strict, { type: 'chord-build', frets: [0, 2, 2, 0, 0, 0] }).correct).toBe(true);
    const other = grade(strict, { type: 'chord-build', frets: [null, null, 2, 0, 0, 0] });
    expect(other.correct).toBe(false);
    expect(other.score).toBeCloseTo(4 / 6);
  });
  it('an incomplete chord is a near miss', () => {
    const c: ChordBuildExercise = { ...em, chord: 'C' };
    expect(grade(c, { type: 'chord-build', frets: [null, 3, null, null, null, null] })).toMatchObject({ correct: false, near: 'incomplete' });
  });
  it('missing note', () => {
    const ex: ChordBuildExercise = { type: 'chord-build', task: 'missing-note', chord: 'E', given: ['E', 'B'], options: ['G#', 'G', 'A', 'F#'], prompt: 'p', explain };
    expect(missingChordNote(ex)).toBe('G#');
    expect(chordNotes('E')).toContain('G#');
    expect(grade(ex, { type: 'chord-build', text: 'G#' }).correct).toBe(true);
    expect(grade(ex, { type: 'chord-build', text: 'Ab' }).correct).toBe(true);
    expect(grade({ ...ex, spelling: 'exact' }, { type: 'chord-build', text: 'Ab' })).toMatchObject({ correct: false, near: 'enharmonic' });
    expect(grade(ex, { type: 'chord-build', text: 'G' }).correct).toBe(false);
    expect(wrongAnswers(ex)).toHaveLength(3);
    expect(missingChordNote({ ...ex, given: ['E'] })).toBeNull();
    expect(grade({ ...ex, given: ['E'] }, { type: 'chord-build', text: 'G#' }).correct).toBe(false);
    expect([...presentExercise(ex, 1).buttons!].sort()).toEqual([...ex.options!].sort());
  });
  it('readFrets', () => {
    expect(readFrets('x32010')).toEqual([null, 3, 2, 0, 1, 0]);
    expect(readFrets([0, 2, 2, 0, 0, 0])).toEqual([0, 2, 2, 0, 0, 0]);
    expect(readFrets('what?!')).toBeNull();
  });
});

describe('staff', () => {
  it('staff-read: the letter name as the staff shows it', () => {
    const ex: StaffReadExercise = { type: 'staff-read', prompt: 'Which note is this?', note: 'F#3', key: 'G major', options: ['F#', 'F', 'G', 'E'], explain };
    expect(staffReadSpec(ex)).toEqual({ kind: 'note', value: 'F#', spelling: 'exact' });
    expect(grade(ex, { type: 'staff-read', text: 'F#' }).correct).toBe(true);
    expect(grade(ex, { type: 'staff-read', text: 'f sharp' }).correct).toBe(true);
    expect(grade(ex, { type: 'staff-read', text: 'F' }).correct).toBe(false);
    const twin = grade(ex, { type: 'staff-read', text: 'Gb' });
    expect(twin).toMatchObject({ correct: false, near: 'enharmonic' });
    expect(twin.feedback.note).toMatch(/note on the staff is \{n:F#\}/);
    expect(wrongAnswers(ex)).toHaveLength(3);
  });

  it('staff-place: the right line or space, as the guitar reads it', () => {
    const ex: StaffPlaceExercise = { type: 'staff-place', prompt: 'Place the open {n:B} string.', note: 'B3', octave: 'exact', explain };
    expect(staffPlaceTarget(ex)).toEqual({ position: staffPosition('B3').position, accidental: null });
    expect(staffPlaceTarget(ex)!.position).toBe(4);
    expect(grade(ex, { type: 'staff-place', position: 4 }).correct).toBe(true);
    const octave = grade(ex, { type: 'staff-place', position: -3 });
    expect(octave).toMatchObject({ correct: false, near: 'octave' });
    expect(grade(ex, { type: 'staff-place', position: 5 }).correct).toBe(false);
    expect(grade({ ...ex, octave: 'any', note: 'B' }, { type: 'staff-place', position: -3 }).correct).toBe(true);
    expect(grade({ ...ex, octave: 'any', note: 'B' }, { type: 'staff-place', position: 11 }).correct).toBe(true);
    expect(staffPlaceTarget({ ...ex, octave: 'any', note: 'B' })!.position).toBe(4);
  });

  it('staff-place: accidentals against the key signature', () => {
    const sharp: StaffPlaceExercise = { type: 'staff-place', prompt: 'p', note: 'F#3', octave: 'exact', explain };
    const line = staffPosition('F#3').position;
    expect(staffPlaceTarget(sharp)).toEqual({ position: line, accidental: 'sharp' });
    expect(grade(sharp, { type: 'staff-place', position: line, accidental: 'sharp' }).correct).toBe(true);
    expect(grade(sharp, { type: 'staff-place', position: line }).correct).toBe(false);
    const flat = grade(sharp, { type: 'staff-place', position: line + 1, accidental: 'flat' });
    expect(flat).toMatchObject({ correct: false, near: 'enharmonic' });
    // In G major the signature supplies the sharp; writing it anyway is not wrong.
    const inG: StaffPlaceExercise = { ...sharp, key: 'G major' };
    expect(staffPlaceTarget(inG)).toEqual({ position: line, accidental: null });
    expect(grade(inG, { type: 'staff-place', position: line }).correct).toBe(true);
    expect(grade(inG, { type: 'staff-place', position: line, accidental: 'sharp' }).correct).toBe(true);
    expect(grade(inG, { type: 'staff-place', position: line, accidental: 'natural' }).correct).toBe(false);
    // F natural in G major needs a natural sign.
    const natural: StaffPlaceExercise = { ...inG, note: 'F3' };
    expect(staffPlaceTarget(natural)).toEqual({ position: line, accidental: 'natural' });
    expect(grade(natural, { type: 'staff-place', position: line }).correct).toBe(false);
    expect(grade(natural, { type: 'staff-place', position: line, accidental: 'natural' }).correct).toBe(true);
    expect(grade(natural, solve(natural)).correct).toBe(true);
  });
});

describe('play exercises', () => {
  const alternative: Exercise = { type: 'true-false', statement: 's', answer: true, explain };
  it('play-note: exact pitch or any octave', () => {
    const ex: PlayNoteExercise = { type: 'play-note', prompt: 'Play the low {n:E}.', note: 'E2', octave: 'exact', explain, alternative };
    expect(playNoteTarget(ex)).toBe(40);
    expect(grade(ex, { type: 'play-note', midi: 40, cents: 5 }).correct).toBe(true);
    const octave = grade(ex, { type: 'play-note', midi: 52 });
    expect(octave).toMatchObject({ correct: false, near: 'octave' });
    expect(grade({ ...ex, octave: 'any' }, { type: 'play-note', midi: 64 }).correct).toBe(true);
    expect(grade(ex, { type: 'play-note', midi: 41 }).correct).toBe(false);
    const nothing = grade(ex, { type: 'play-note', midi: null });
    expect(nothing.correct).toBe(false);
    expect(nothing.feedback.detail).toEqual({ type: 'play-note', expected: 40, played: null, cents: null });
    expect(solve(ex)).toEqual({ type: 'play-note', midi: 40, cents: 0 });
  });
  it('play-chord: what the chord matcher heard', () => {
    const ex: PlayChordExercise = { type: 'play-chord', prompt: 'Strum {c:Em}.', chord: 'Em', explain, alternative };
    expect(grade(ex, { type: 'play-chord', matched: true, score: 0.82 }).correct).toBe(true);
    expect(grade(ex, { type: 'play-chord', matched: true, score: 0.4 }).correct).toBe(false);
    const dull = grade(ex, { type: 'play-chord', matched: false, score: 0.45, missing: [7], extra: [] });
    expect(dull).toMatchObject({ correct: false, near: 'incomplete' });
    expect(dull.feedback.detail).toEqual({ type: 'play-chord', chord: 'Em', missing: ['G'], extra: [], score: 0.45 });
    expect(grade(ex, { type: 'play-chord', matched: false, score: 0.3, missing: [], extra: [8] }).feedback.detail).toMatchObject({ extra: ['G#'] });
    expect(grade(ex, solve(ex)).correct).toBe(true);
  });
  it('play-phrase: compared with the pitch module, octave policy and pass mark', () => {
    const ex: PlayPhraseExercise = {
      type: 'play-phrase', prompt: 'Play.', octave: 'exact', explain, alternative,
      notes: [{ string: 6, fret: 0, duration: 'q' }, { string: 6, fret: 1, duration: 'q' }, { rest: true, duration: 'q' }, { string: 6, fret: 3, duration: 'q' }, { string: 5, fret: 0, duration: 'q' }, { string: 5, fret: 2, duration: 'q' }],
    };
    expect(phraseMidi(ex)).toEqual([40, 41, 43, 45, 47]);
    expect(grade(ex, { type: 'play-phrase', played: [40, 41, 43, 45, 47] }).correct).toBe(true);
    // Four of five is 80 %: the default pass mark.
    expect(grade(ex, { type: 'play-phrase', played: [40, 41, 43, 45] }).correct).toBe(true);
    const three = grade(ex, { type: 'play-phrase', played: [40, 41, 43] });
    expect(three).toMatchObject({ correct: false, near: 'incomplete' });
    expect(three.score).toBeCloseTo(0.6);
    expect(grade({ ...ex, pass: 1 }, { type: 'play-phrase', played: [40, 41, 43, 45] }).correct).toBe(false);
    // A slipped extra note does not ruin what follows.
    expect(grade(ex, { type: 'play-phrase', played: [40, 41, 42, 43, 45, 47] }).correct).toBe(true);
    expect(grade(ex, { type: 'play-phrase', played: [52, 53, 55, 57, 59] }).correct).toBe(false);
    expect(grade({ ...ex, octave: 'any' }, { type: 'play-phrase', played: [52, 53, 55, 57, 59] }).correct).toBe(true);
    expect(grade(ex, { type: 'play-phrase', played: [] }).correct).toBe(false);
  });
});

describe('flashcard', () => {
  const ex: FlashcardExercise = { type: 'flashcard', front: 'Lines of the staff?', back: '{n:E} {n:G} {n:B} {n:D} {n:F}' };
  it('self-rated', () => {
    expect(grade(ex, { type: 'flashcard', rating: 'good' })).toMatchObject({ correct: true, score: 1 });
    expect(grade(ex, { type: 'flashcard', rating: 'easy' }).correct).toBe(true);
    expect(grade(ex, { type: 'flashcard', rating: 'hard' })).toMatchObject({ correct: true, score: 0.6 });
    expect(grade(ex, { type: 'flashcard', rating: 'again' })).toMatchObject({ correct: false, score: 0 });
    expect(grade(ex, { type: 'flashcard', rating: 'again' }).feedback).toEqual({ answer: ex.back, explain: null, detail: { type: 'flashcard', rating: 'again' } });
    expect(promptOf(ex)).toBe(ex.front);
    expect(explainOf(ex)).toBeNull();
  });
});

describe('grade is total', () => {
  const samples: Exercise[] = [
    { type: 'choice', prompt: 'p', options: [{ text: 'a', correct: true }, { text: 'b' }], explain },
    { type: 'true-false', statement: 's', answer: false, explain },
    { type: 'order', prompt: 'p', tiles: ['a', 'b', 'c'], explain },
    { type: 'type-answer', prompt: 'p', answer: { kind: 'number', value: 3 }, explain },
    { type: 'tap-rhythm', prompt: 'p', rhythm: { pattern: 'q q q q' }, tempo: 80, show: 'both', explain },
    { type: 'fretboard-find', prompt: 'p', find: { note: 'G' }, mode: 'one', octave: 'any', frets: [0, 5], explain },
    { type: 'staff-place', prompt: 'p', note: 'B3', octave: 'exact', explain },
    { type: 'flashcard', front: 'f', back: 'b' },
  ];

  it('an answer of the wrong shape is wrong and flagged, and still shows the right answer', () => {
    for (const ex of samples) {
      const other: Answer = ex.type === 'true-false' ? { type: 'choice', selected: [0] } : { type: 'true-false', value: true };
      const r = grade(ex, other);
      expect(r, ex.type).toMatchObject({ correct: false, score: 0, invalid: true });
      expect(r.feedback.answer, ex.type).toBe(grade(ex, solve(ex)).feedback.answer);
      expect(grade(ex, null as unknown as Answer).invalid, ex.type).toBe(true);
    }
  });

  it('solve always grades as correct, and presentation is deterministic', () => {
    for (const ex of samples) {
      expect(grade(ex, solve(ex)).correct, ex.type).toBe(true);
      expect(presentExercise(ex, 11)).toEqual(presentExercise(ex, 11));
    }
  });

  it('never throws on garbage inside a well-typed answer', () => {
    const garbage: Array<[Exercise, Answer]> = [
      [samples[0], { type: 'choice', selected: 'x' as unknown as number[] }],
      [samples[2], { type: 'order', order: [1.5, Number.NaN, -1] }],
      [samples[4], { type: 'tap-rhythm', taps: ['a'] as unknown as number[] }],
      [samples[5], { type: 'fretboard-find', positions: [null as unknown as { string: number; fret: number }] }],
      [samples[6], { type: 'staff-place', position: Number.NaN }],
      [samples[3], { type: 'type-answer', text: 12 as unknown as string }],
    ];
    for (const [ex, answer] of garbage) expect(grade(ex, answer).correct, ex.type).toBe(false);
  });

  it('shuffles options and pairs with the seed, and keeps a fixed order when asked', () => {
    const choice = samples[0] as ChoiceExercise;
    const many: ChoiceExercise = { ...choice, options: [{ text: 'a', correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }] };
    const orders = new Set(Array.from({ length: 40 }, (_u, seed) => presentExercise(many, seed).options!.join('')));
    expect(orders.size).toBeGreaterThan(10);
    expect(presentExercise({ ...many, shuffle: false }, 9).options).toEqual([0, 1, 2, 3, 4]);
    const pairs: MatchPairsExercise = { type: 'match-pairs', prompt: 'p', pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }, { left: 'c', right: '3' }, { left: 'd', right: '4' }], explain };
    for (let seed = 0; seed < 30; seed++) {
      const shown = presentExercise(pairs, seed);
      expect([...shown.left!].sort()).toEqual([0, 1, 2, 3]);
      expect([...shown.right!].sort()).toEqual([0, 1, 2, 3]);
    }
  });
});
