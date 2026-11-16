/**
 * The lesson-engine limits the content reviews kept hitting, fixed at the source: note spelling in
 * context, chord microphone checks against the shape shown, slash basses, beginner words for wrong
 * chord shapes, a pass mark for lessons, counting instead of rhythm code, staff wording, the
 * glossary, strings in fretboard-find, capo windows, Nashville minus signs and the new options.
 */
import { describe, expect, it } from 'vitest';
import { chordVoicings } from '@/core/guitar';
import { answerText, findTargets, grade, referenceFrets, solve } from './grade';
import { normalizeText, checkText } from './answers';
import { exerciseProblems } from './check';
import { chordBuildNote, nameableChord } from './chord-words';
import { boardFrets, resolveFigure } from './figures';
import { GLOSSARY } from './glossary';
import { chordWaitArgs, phraseListenMs, PHRASE_LISTEN_MIN_MS } from './listen';
import { rhythmCounts } from './rhythm';
import { LESSON_PASS_SCORE, chordsShown, createSession, currentStep, lessonScore, reduceSession, type SessionOptions } from './session';
import { describeSound } from './sound';
import { exerciseSpelling, inferSpelling, spellPitch } from './spelling';
import { Driver, FIXTURE, PLAY_FIXTURE, TEACHER_FIXTURE } from './test-fixtures';
import type {
  ChordBuildExercise, ChoiceExercise, Course, FretboardFindExercise, PlayChordExercise, PlayNoteExercise, PlayPhraseExercise, TabNote, TapRhythmExercise,
} from './types';

const explain = 'Because.';
const T0 = 1_750_000_000_000;
const opts = (extra: Partial<SessionOptions> = {}): SessionOptions => ({ seed: 42, now: T0, hearts: null, ...extra });

/** A phrase on the neck from string/fret pairs, all quarter notes. */
const phrase = (cells: Array<[number, number]>): TabNote[] => cells.map(([string, fret]) => ({ string, fret, duration: 'q' }));

const playPhrase = (notes: TabNote[], extra: Partial<PlayPhraseExercise> = {}): PlayPhraseExercise => ({
  type: 'play-phrase', prompt: 'Play it.', notes, octave: 'exact', explain,
  alternative: { type: 'true-false', statement: 'Yes.', answer: true, explain }, ...extra,
});

describe('1. notes are spelled in context', () => {
  // A major: A B C# D E F# G#, on strings 5 to 3.
  const aMajor = playPhrase(phrase([[5, 0], [5, 2], [5, 4], [4, 0], [4, 2], [4, 4], [3, 1], [3, 2]]));
  // F major: F G A Bb C, on strings 4 and 3.
  const fMajor = playPhrase(phrase([[4, 3], [4, 5], [3, 2], [3, 3], [3, 5]]));

  it('an A major phrase is named with sharps and an F major one with flats', () => {
    const a = grade(aMajor, solve(aMajor)).feedback.answer;
    expect(a).toContain('{n:C#}');
    expect(a).toContain('{n:F#}');
    expect(a).toContain('{n:G#}');
    expect(a).not.toMatch(/Db|Gb|Ab/);
    const f = grade(fMajor, solve(fMajor)).feedback.answer;
    expect(f).toContain('{n:Bb}');
    expect(f).not.toContain('A#');
    expect(spellPitch(61, exerciseSpelling(aMajor))).toBe('C#4');
    expect(spellPitch(58, exerciseSpelling(fMajor))).toBe('Bb3');
  });

  it('Für Elise names its leading note D#, and an explicit key wins', () => {
    const elise = playPhrase(phrase([[1, 0], [2, 4], [1, 0], [2, 4], [1, 0], [2, 0], [2, 3], [2, 1], [3, 2]]));
    expect(grade(elise, solve(elise)).feedback.answer).toContain('{n:D#}');
    expect(spellPitch(63, exerciseSpelling(elise))).toBe('D#4');
    const forced = { ...aMajor, key: 'Db major' };
    expect(spellPitch(61, exerciseSpelling(forced))).toBe('Db4');
  });

  it('a play-note keeps the spelling it was written with', () => {
    const note: PlayNoteExercise = { type: 'play-note', prompt: 'Play it.', note: 'G#3', octave: 'exact', explain, alternative: { type: 'true-false', statement: 'Yes.', answer: true, explain } };
    expect(spellPitch(56, exerciseSpelling(note))).toBe('G#3');
    expect(grade(note, solve(note)).feedback.answer).toBe('{n:G#3}');
  });

  it('a wrong tap inside a chord is named by the chord (string 1, fret 9 is C#, not Db)', () => {
    const find: FretboardFindExercise = { type: 'fretboard-find', prompt: 'Tap an A.', find: { chord: 'A' }, mode: 'one', octave: 'any', frets: [5, 9], strings: [1, 2, 3], explain };
    const r = grade(find, { type: 'fretboard-find', positions: [{ string: 1, fret: 8 }] });
    expect(r.correct).toBe(false);
    // Fret 8 of string 1 is C: a wrong note, named plainly.
    expect(r.feedback.detail.type === 'fretboard-find' && r.feedback.detail.wrong[0].note).toBe('C');
    // In an E chord the tap at string 2, fret 4 is D# (the leading note), not Eb.
    const inE = grade({ ...find, find: { chord: 'E' }, frets: [0, 5], strings: undefined }, { type: 'fretboard-find', positions: [{ string: 2, fret: 4 }] });
    expect(inE.feedback.detail.type === 'fretboard-find' && inE.feedback.detail.wrong[0].note).toBe('D#');
    const inA = grade({ ...find, find: { note: 'E' }, key: 'A major' }, { type: 'fretboard-find', positions: [{ string: 1, fret: 9 }] });
    expect(inA.feedback.detail.type === 'fretboard-find' && inA.feedback.detail.wrong[0].note).toBe('C#');
  });

  it('infers no key from a single pitch class, and figures follow their key', () => {
    expect(inferSpelling([61, 73])).toBeNull();
    const dots = resolveFigure({ kind: 'fretboard', frets: [0, 4], dots: [{ string: 5, fret: 4 }, { string: 4, fret: 4 }, { string: 3, fret: 1 }, { string: 5, fret: 0 }] });
    expect(dots.dots.map((d) => d.note)).toEqual(['A', 'C#', 'F#', 'G#']);
    const flat = resolveFigure({ kind: 'fretboard', frets: [0, 4], key: 'Ab major', dots: [{ string: 3, fret: 1 }] });
    expect(flat.dots[0].note).toBe('Ab');
    const tab = resolveFigure({ kind: 'tab', notes: aMajor.notes });
    expect(tab.notes.map((n) => n.note)).toContain('C#3');
  });
});

describe('2. play-chord listens for the shape it shows', () => {
  const base = { type: 'play-chord' as const, prompt: 'Strum it.', explain, alternative: { type: 'true-false' as const, statement: 'Yes.', answer: true, explain } };

  it('a power chord is graded on its root and fifth, not on a third it never has', () => {
    const e5: PlayChordExercise = { ...base, chord: 'E5', frets: '022xxx' };
    const { chord } = chordWaitArgs(e5);
    expect([...chord.pcs].sort((a, b) => a - b)).toEqual([4, 11]);
    expect(chord.bass).toBe(4);
  });

  it('a shell voicing is graded on the tones it sounds', () => {
    // G7 shell: G (string 6, fret 3), F (string 4, fret 3), B (string 3, fret 4).
    const shell: PlayChordExercise = { ...base, chord: 'G7', frets: '3x34xx' };
    const { chord } = chordWaitArgs(shell);
    expect([...chord.pcs].sort((a, b) => a - b)).toEqual([5, 7, 11]);
    expect(chord.pcs).not.toContain(2);
  });

  it('a capo shape is graded on what it sounds', () => {
    const capo: PlayChordExercise = { ...base, chord: 'A', frets: '320003', capo: 2 };
    expect(exerciseProblems(capo)).toEqual([]);
    const { chord } = chordWaitArgs(capo);
    expect([...chord.pcs].sort((a, b) => a - b)).toEqual([1, 4, 9]);
    expect(referenceFrets(capo)).toEqual([3, 2, 0, 0, 0, 3]);
  });
});

describe('3 and 4. chord-build: slash basses and plain words', () => {
  const cOverG: ChordBuildExercise = { type: 'chord-build', task: 'fingers', chord: 'C/G', prompt: 'Build it.', explain };
  const am: ChordBuildExercise = { type: 'chord-build', task: 'fingers', chord: 'Am', prompt: 'Build it.', explain };

  it('any-voicing still enforces a requested slash bass', () => {
    const plainC = grade(cOverG, { type: 'chord-build', frets: [null, 3, 2, 0, 1, 0] });
    expect(plainC.correct).toBe(false);
    expect(plainC.feedback.note).toBe('That shape is {c:C}. The lowest string you play sounds {n:C}; {c:C/G} needs {n:G} at the bottom.');
    expect(grade(cOverG, solve(cOverG)).correct).toBe(true);
    expect(grade(cOverG, { type: 'chord-build', frets: [3, 3, 2, 0, 1, 0] }).correct).toBe(true);
  });

  it('says which string sounds a wrong note, never a fret string, and names only common taught chords', () => {
    // Am with the 1st finger lifted: string 2 rings open (B).
    const lifted = grade(am, { type: 'chord-build', frets: [null, 0, 2, 2, 0, 0] }, { chordsTaught: ['Am', 'C', 'E'] });
    expect(lifted.feedback.note).toBe('String 2 sounds {n:B}, which is not in {c:Am}.');
    // Without a list of what was taught, a common chord (Asus2 here) is named.
    expect(grade(am, { type: 'chord-build', frets: [null, 0, 2, 2, 0, 0] }).feedback.note).toBe('That shape is {c:Asus2}. String 2 sounds {n:B}, which is not in {c:Am}.');
    expect(lifted.feedback.answer).toBe('{c:Am}');
    expect(answerText(am)).toBe('Am');
    // C instead of Am: a common chord, named when the course has taught it, not otherwise.
    const c = { type: 'chord-build' as const, frets: [null, 3, 2, 0, 1, 0] };
    expect(grade(am, c, { chordsTaught: ['C', 'Am'] }).feedback.note).toMatch(/^That shape is \{c:C\}\./);
    expect(grade(am, c, { chordsTaught: ['Am'] }).feedback.note).not.toMatch(/That shape is/);
    // An exotic name is never offered.
    expect(nameableChord('Cmaj7/E', 'Am')).toBeNull();
    expect(nameableChord('C#dimMaj7/B#', 'Am')).toBeNull();
  });

  it('names a missing chord tone in plain words', () => {
    const e: ChordBuildExercise = { type: 'chord-build', task: 'fingers', chord: 'E', prompt: 'Build it.', explain };
    // Only E and B: the third (G#) is missing.
    const note = chordBuildNote({ chord: 'E', frets: [0, 2, 2, null, null, null], reference: referenceFrets(e), accept: 'any-voicing', built: 'E5', taught: ['E', 'E5'] });
    expect(note).toBe('That shape is {c:E5}. No string plays {n:G#}, and {c:E} needs it: it is {n:E}, {n:G#} and {n:B}.');
  });

  it('this-shape says which strings differ from the box', () => {
    const em: ChordBuildExercise = { type: 'chord-build', task: 'fingers', chord: 'Em', accept: 'this-shape', prompt: 'Build it.', explain };
    const r = grade(em, { type: 'chord-build', frets: [null, null, 2, 0, 0, 0] });
    expect(r.correct).toBe(false);
    expect(r.feedback.note).toBe('That is {c:Em} too, but this one asks for the shape in the box, where string 6 rings open and string 5 is pressed at fret 2.');
  });
});

describe('6. a lesson needs a pass mark', () => {
  const lessonOf = (course: Course, lessonId: string, extra: Partial<SessionOptions> = {}): Driver => new Driver(createSession({ mode: 'lesson', course, lessonId }, opts(extra)), T0);

  it("'I don't know' through a whole lesson ends as practice: no completion, no XP, no cards, a retry", () => {
    const d = lessonOf(TEACHER_FIXTURE, 'ma');
    for (let i = 0; i < 100 && d.state.phase !== 'done'; i++) {
      if (currentStep(d.state)?.kind === 'exercise') d.wait(2000).dispatch({ type: 'skip', at: d.at });
      d.next();
    }
    expect(d.state.outcome).toBe('failed');
    expect(d.state.summary).toMatchObject({ outcome: 'failed', score: 0, xp: 0, next: 'retry', factsAdded: 0, crown: null });
    const activity = d.of('record-activity')[0].input;
    expect(activity).toMatchObject({ completed: false, xp: 0 });
    expect(d.of('add-cards')).toEqual([]);
  });

  it('wrong first, right on the come-back is half credit; at the pass mark the lesson is finished', () => {
    expect(lessonScore({ results: {} })).toBe(1);
    const r = (firstTry: boolean, solved: boolean) => ({ attempts: 1, firstTry, solved, type: 'choice' as const, prompt: '' });
    expect(lessonScore({ results: { a: r(true, true), b: r(false, true), c: r(false, false), d: r(false, true) } })).toBe(0.5);
    // Everything wrong once and then right: exactly the pass mark, so the lesson is complete.
    const d = lessonOf(FIXTURE, 'a');
    for (let i = 0; i < 100 && d.state.phase !== 'done'; i++) {
      const step = currentStep(d.state);
      if (step?.kind === 'exercise') d.answer(step.attempt > 0);
      d.next();
    }
    expect(d.state.summary!.score).toBeCloseTo(LESSON_PASS_SCORE);
    expect(d.state.outcome).toBe('completed');
  });

  it('a checkpoint, a practice drill and a review keep their own rules', () => {
    const practice = new Driver(createSession({ mode: 'practice', course: FIXTURE, unitId: 'u1', size: 3 }, opts()), T0);
    for (let i = 0; i < 50 && practice.state.phase !== 'done'; i++) {
      if (currentStep(practice.state)?.kind === 'exercise') practice.wait(1000).dispatch({ type: 'skip', at: practice.at });
      practice.next();
    }
    expect(practice.state.outcome).toBe('completed');
  });
});

describe('7. play steps for beginners', () => {
  it('describes one note in the singular', () => {
    expect(describeSound({ kind: 'notes', notes: ['E2'] })).toBe('one note');
    expect(describeSound({ kind: 'notes', notes: ['E2', 'A2'] })).toBe('2 notes');
  });

  it('listens to a long phrase for longer than the phrase lasts', () => {
    const short = playPhrase(phrase([[5, 0], [5, 2]]), { tempo: 80 });
    expect(phraseListenMs(short)).toBe(PHRASE_LISTEN_MIN_MS);
    // 16 whole notes at 80 BPM: 48 s of music.
    const long = playPhrase(Array.from({ length: 16 }, () => ({ string: 5, fret: 0, duration: 'w' })), { tempo: 80 });
    expect(phraseListenMs(long)).toBe(106_000);
  });

  it('validates the new display options', () => {
    const note: PlayNoteExercise = { type: 'play-note', prompt: 'Play it.', note: 'E2', octave: 'exact', where: { string: 6, fret: 0 }, labels: 'place', explain, alternative: { type: 'true-false', statement: 'Yes.', answer: true, explain } };
    expect(exerciseProblems(note)).toEqual([]);
    expect(exerciseProblems({ ...note, where: undefined })[0].message).toMatch(/needs "where"/);
    expect(exerciseProblems({ ...note, labels: 'fret' as never })[0].message).toMatch(/"labels"/);
    expect(exerciseProblems({ ...note, staffOnly: true, labels: undefined })).toEqual([]);
    expect(exerciseProblems({ ...note, key: 'H major' })[0].message).toMatch(/not a key/);
    const p = playPhrase(phrase([[5, 0], [5, 2], [5, 4]]), { hideNames: true, labels: 'place' });
    expect(exerciseProblems(p)).toEqual([]);
  });
});

describe('5. play-chord fingers and hidden boxes, giveaway options', () => {
  const base: PlayChordExercise = { type: 'play-chord', prompt: 'Strum it.', chord: 'C', frets: 'x32010', explain, alternative: { type: 'true-false', statement: 'Yes.', answer: true, explain } };

  it('accepts a fingering that fits and refuses one that does not', () => {
    expect(exerciseProblems({ ...base, fingers: 'x32010', hideDiagram: true })).toEqual([]);
    expect(exerciseProblems({ ...base, fingers: 'x11111' }).map((p) => p.code)).toContain('figure.invalid');
    expect(exerciseProblems({ ...base, hideDiagram: 'yes' as never })[0].message).toMatch(/hideDiagram/);
  });

  it('warns when the right picture is the only one captioned with what the prompt asks for', () => {
    const giveaway: ChoiceExercise = {
      type: 'choice', prompt: 'Which box is {c:G}?', explain,
      options: [
        { figure: { kind: 'chord', symbol: 'G', caption: 'The {c:G} shape' }, correct: true },
        { figure: { kind: 'chord', symbol: 'C' } },
        { figure: { kind: 'chord', symbol: 'D' } },
      ],
    };
    expect(exerciseProblems(giveaway).map((p) => p.code)).toEqual(['exercise.giveaway']);
    const fair: ChoiceExercise = { ...giveaway, options: giveaway.options.map((o) => ({ ...o, figure: { kind: 'chord', symbol: (o.figure as { symbol: string }).symbol } })) };
    expect(exerciseProblems(fair)).toEqual([]);
  });
});

describe('8. tap-rhythm feedback counts, it does not print code', () => {
  it('turns patterns into counting', () => {
    expect(rhythmCounts('q e e q q')).toBe('1, 2 &, 3, 4');
    expect(rhythmCounts('et et et q h')).toBe('1 trip let, 2, 3');
    expect(rhythmCounts('q e e ~e e q')).toBe('1, 2 &, (3) &, 4');
    expect(rhythmCounts('h qr q | w')).toBe('1, 4 | 1');
    expect(rhythmCounts('er e q q q')).toBe('(1) &, 2, 3, 4');
  });

  it('gives the counts as the answer', () => {
    const tap: TapRhythmExercise = { type: 'tap-rhythm', prompt: 'Tap it.', rhythm: { pattern: 'et et et q h' }, tempo: 80, show: 'both', explain };
    expect(grade(tap, { type: 'tap-rhythm', taps: [] }).feedback.answer).toBe('1 trip let, 2, 3');
    expect(exerciseProblems({ ...tap, counting: false })).toEqual([]);
    expect(exerciseProblems({ ...tap, counting: 'no' as never })[0].message).toMatch(/counting/);
  });
});

describe('12. the glossary agrees with itself', () => {
  it('a chord is several notes, so a power chord is one', () => {
    const chord = GLOSSARY.find((g) => g.id === 'chord')!;
    expect(chord.definition).toBe('Several notes sounded together, usually three or more.');
    expect(GLOSSARY.find((g) => g.id === 'power-chord')!.definition).not.toMatch(/two-note chord/);
  });
});

describe('13. fretboard-find with strings', () => {
  it('a right pitch on another string gets a kind word', () => {
    const find: FretboardFindExercise = { type: 'fretboard-find', prompt: 'Tap {n:A} on string 6.', find: { note: 'A' }, mode: 'one', octave: 'any', frets: [0, 7], strings: [6], explain };
    const r = grade(find, { type: 'fretboard-find', positions: [{ string: 5, fret: 0 }] });
    expect(r.correct).toBe(false);
    expect(r.feedback.note).toBe('Right note, but on string 5: this one asks for string 6.');
    expect(findTargets(find).every((t) => t.string === 6)).toBe(true);
  });
});

describe('15 and 18. capo', () => {
  it('draws a window counted from the capo on the frets of the wood', () => {
    expect(boardFrets([0, 4], 0)).toEqual([0, 4]);
    expect(boardFrets([0, 5], 2)).toEqual([0, 7]);
    expect(boardFrets([3, 6], 5)).toEqual([8, 11]);
    expect(boardFrets([0, 5], 9)).toEqual([9, 14]);
    const fig = resolveFigure({ kind: 'fretboard', capo: 3, dots: [{ string: 6, fret: 3, note: 'A#' }] });
    expect(fig.frets).toEqual([0, 4]);
    expect(fig.board).toEqual([0, 7]);
  });

  it('a chord figure keeps its capo for the box', () => {
    const fig = resolveFigure({ kind: 'chord', symbol: 'A', frets: '320003', capo: 2 });
    expect(fig?.voicing?.capo).toBe(2);
    expect(fig?.capo).toBe(2);
  });

  it('reference shapes read tuning and capo whether or not a tuning is named', () => {
    const ex: ChordBuildExercise = { type: 'chord-build', task: 'fingers', chord: 'A', capo: 2, prompt: 'Build it.', explain };
    expect(referenceFrets(ex)).toEqual([...chordVoicings('A', { capo: 2 })[0].frets]);
  });
});

describe('18. typed Nashville numbers keep their minus', () => {
  it('"6-" is not "6"', () => {
    expect(normalizeText('6-')).toBe('6-');
    expect(normalizeText('6 -')).toBe('6-');
    expect(normalizeText('6−')).toBe('6-');
    expect(normalizeText('well-known')).toBe('well known');
    expect(normalizeText('2-5-1')).toBe('2 5 1');
    expect(checkText('6', { kind: 'text', value: '6-' }).verdict).toBe('wrong');
    expect(checkText('6-', { kind: 'text', value: '6-' }).verdict).toBe('correct');
  });
});

describe('the session knows which chords the course has shown', () => {
  it('collects chord symbols from text, exercises and figures up to the lesson', () => {
    expect(chordsShown([{ id: 'x', title: 'x', teaches: 'x', minutes: 2, skill: 'theory:u:x', steps: [{ type: 'card', body: 'Play {c:Am} then {c:C/G}.', figure: { kind: 'chord', symbol: 'Dm' } }] }])).toEqual(['Am', 'C/G', 'Dm']);
    const s = createSession({ mode: 'lesson', course: PLAY_FIXTURE, lessonId: 'pa' }, opts());
    expect(s.taught).toContain('Em');
  });

  it('asking to play again brings the microphone version of the step back', () => {
    let state = createSession({ mode: 'lesson', course: PLAY_FIXTURE, lessonId: 'pa' }, opts());
    state = reduceSession(state, { type: 'continue', at: T0 }).state;
    expect(currentStep(state)).toMatchObject({ usesMic: true });
    state = reduceSession(state, { type: 'cant-play', scope: 'session', at: T0 }).state;
    expect(currentStep(state)).toMatchObject({ alternative: true, usesMic: false });
    state = reduceSession(state, { type: 'mic', available: true, at: T0 }).state;
    expect(state.micOff).toBe(false);
    expect(currentStep(state)).toMatchObject({ alternative: false, usesMic: true });
    expect((currentStep(state) as { exercise: { type: string } }).exercise.type).toBe('play-note');
  });
});
