/**
 * validateCourse: every rule, each proved by breaking a valid course in exactly one way and
 * checking that the problem is found, located (unit, lesson, step) and comes with a fix.
 */
import { describe, expect, it } from 'vitest';
import { exerciseProblems, pitchSignature, stepProblems } from './check';
import { DEMO_COURSE } from './demo';
import { COUNT_LIMITS, LESSON_LIMITS, TEXT_LIMITS } from './limits';
import type { CardStep, ChoiceExercise, Course, Exercise, Lesson, Step, Unit } from './types';
import { assertValidCourse, courseErrors, estimateLessonSeconds, estimateStepSeconds, formatProblems, validateCourse, type CourseProblem } from './validate';

/** A deep copy of the demo course to break. */
function course(change: (c: Course) => void): Course {
  const copy = structuredClone(DEMO_COURSE) as Course;
  change(copy);
  return copy;
}
const unit = (c: Course, index = 0): Unit => c.units[index];
const lesson = (c: Course, id: string): Lesson => c.units.flatMap((u) => u.lessons).find((l) => l.id === id)!;
/** Replace one step of a lesson. */
function withStep(lessonId: string, index: number, step: Step | ((old: Step) => Step)): Course {
  return course((c) => {
    const l = lesson(c, lessonId);
    l.steps[index] = typeof step === 'function' ? step(l.steps[index]) : step;
  });
}
function find(problems: CourseProblem[], code: string): CourseProblem {
  const found = problems.find((p) => p.code === code);
  if (!found) throw new Error(`no "${code}" problem among:\n${formatProblems(problems) || '(none)'}`);
  return found;
}
const explain = 'Because.';
const choice = (extra: Partial<ChoiceExercise> = {}): ChoiceExercise => ({
  type: 'choice', prompt: 'Which note comes after {n:G}?', options: [{ text: '{n:A}', correct: true }, { text: '{n:F}' }, { text: '{n:C}' }], explain, ...extra,
});
/** Problems of the demo course with step 2 (index 1) of the first lesson replaced. */
const stepCase = (step: Step): CourseProblem[] => validateCourse(withStep('musical-alphabet', 1, step));

describe('a valid course', () => {
  it('the demo course has no problems at all, not even warnings', () => {
    expect(formatProblems(validateCourse(DEMO_COURSE))).toBe('');
    expect(courseErrors(DEMO_COURSE)).toEqual([]);
    expect(() => assertValidCourse(DEMO_COURSE)).not.toThrow();
  });

  it('assertValidCourse lists every error in its message', () => {
    const broken = course((c) => {
      lesson(c, 'open-strings').title = '';
      lesson(c, 'major-scale').minutes = 9;
    });
    expect(() => assertValidCourse(broken)).toThrow(/Course "demo" has 2 problems:\n1\. \[error\] unit "first-notes" > lesson "open-strings": The lesson title is empty.*\n2\. \[error\] unit "building-blocks" > lesson "major-scale": "minutes" is 9/);
  });
});

describe('every problem says where it is and how to fix it', () => {
  it('names the unit, the lesson and the step with its type', () => {
    const p = find(stepCase(choice({ options: [{ text: '{n:A}' }, { text: '{n:F}' }] })), 'exercise.ungradable');
    expect(p).toMatchObject({ severity: 'error', unit: 'first-notes', lesson: 'musical-alphabet', step: 2 });
    expect(p.where).toBe('unit "first-notes" > lesson "musical-alphabet" > step 2 (choice)');
    expect(p.message).toMatch(/0 options are marked correct.*Mark one option correct: true/);
    expect(p.text).toBe(`${p.where}: ${p.message}`);
  });

  it('names generated steps by their generator', () => {
    const p = find(validateCourse(withStep('musical-alphabet', 5, { generate: 'enharmonic', params: { notes: ['E#'] } })), 'generator.params');
    expect(p.where).toBe('unit "first-notes" > lesson "musical-alphabet" > step 6 (generated: enharmonic)');
    expect(p.message).toMatch(/black keys/);
  });

  it('every message of a thoroughly broken course ends in advice', () => {
    const broken = course((c) => {
      c.id = 'Bad Id';
      c.units[0].theme = 'jazz' as never;
      lesson(c, 'musical-alphabet').skill = 'wrong';
      lesson(c, 'open-strings').requires = ['nope'];
      lesson(c, 'low-e-string').steps.length = 2;
      (lesson(c, 'reading-the-staff').steps[1] as Exercise & { explain: string }).explain = '';
      c.units[1].lessons[0].id = 'open-strings';
    });
    const problems = validateCourse(broken);
    expect(problems.length).toBeGreaterThan(6);
    for (const p of problems) {
      expect(p.message.length, p.text).toBeGreaterThan(30);
      expect(p.where.length, p.text).toBeGreaterThan(0);
    }
  });
});

describe('ids', () => {
  it('must be slugs', () => {
    expect(find(validateCourse(course((c) => { c.id = 'My Course'; })), 'id.format').message).toMatch(/course id "My Course" is not a slug.*lower-case/);
    expect(find(validateCourse(course((c) => { unit(c).id = 'Unit_1'; })), 'id.format').message).toMatch(/unit id/);
    expect(find(validateCourse(course((c) => { lesson(c, 'open-strings').id = 'Open Strings'; })), 'id.format').message).toMatch(/lesson id/);
    expect(find(validateCourse(course((c) => { lesson(c, 'open-strings').facts![0].id = 'A B'; })), 'id.format').message).toMatch(/fact id/);
    expect(find(stepCase(choice({ id: 'Q 1' })), 'id.format').message).toMatch(/"Q 1" is not a slug/);
  });

  it('must be unique: units, lessons across the course, steps in a lesson, facts across the course', () => {
    expect(find(validateCourse(course((c) => { c.units[1].id = 'first-notes'; })), 'id.duplicate').message).toMatch(/unit id "first-notes" is used twice/);
    const dupLesson = find(validateCourse(course((c) => { lesson(c, 'major-scale').id = 'open-strings'; })), 'id.duplicate');
    expect(dupLesson.message).toMatch(/lesson id "open-strings" is already used in unit "first-notes".*whole course/);
    expect(dupLesson.unit).toBe('building-blocks');
    const dupStep = validateCourse(course((c) => {
      (lesson(c, 'musical-alphabet').steps[1] as { id?: string }).id = 'same';
      (lesson(c, 'musical-alphabet').steps[2] as { id?: string }).id = 'same';
    }));
    expect(find(dupStep, 'id.duplicate')).toMatchObject({ step: 3, lesson: 'musical-alphabet' });
    const dupFact = find(validateCourse(course((c) => { lesson(c, 'major-scale').facts![0].id = 'alphabet'; })), 'id.duplicate');
    expect(dupFact.message).toMatch(/fact id "alphabet" is already used in lesson "musical-alphabet".*one spaced-repetition card/);
    expect(dupFact.where).toBe('unit "building-blocks" > lesson "major-scale" > fact 1 "alphabet"');
  });
});

describe('skills', () => {
  it('follow the progress conventions exactly', () => {
    const p = find(validateCourse(course((c) => { lesson(c, 'open-strings').skill = 'theory:open-strings'; })), 'skill.format');
    expect(p.message).toMatch(/must be "theory:first-notes:open-strings".*theory:<unit id>:<lesson id>/);
    const teacher = course((c) => { c.teacher = 'mia'; });
    const all = validateCourse(teacher).filter((x) => x.code === 'skill.format');
    expect(all).toHaveLength(8);
    expect(all[0].message).toMatch(/must be "teacher:mia:musical-alphabet".*teacher:<teacher>:<lesson id>/);
  });
});

describe('prerequisites', () => {
  it('must exist', () => {
    const p = find(validateCourse(course((c) => { lesson(c, 'major-scale').requires = ['half-steps']; })), 'requires.unknown');
    expect(p.message).toMatch(/"requires" names "half-steps", which is not a lesson of this course.*musical-alphabet, open-strings/);
    expect(p).toMatchObject({ unit: 'building-blocks', lesson: 'major-scale' });
  });

  it('must not loop, directly or through the default path', () => {
    expect(find(validateCourse(course((c) => { lesson(c, 'major-scale').requires = ['major-scale']; })), 'requires.cycle').message).toMatch(/requires itself/);
    const loop = validateCourse(course((c) => {
      lesson(c, 'open-strings').requires = ['reading-the-staff'];
    }));
    // open-strings -> reading-the-staff -> low-e-string -> open-strings (the last two by the default "lesson before").
    const p = find(loop, 'requires.cycle');
    expect(p.message).toMatch(/prerequisites loop: .*open-strings.*→.*No lesson in the loop could ever be unlocked/);
    expect(loop.filter((x) => x.code === 'requires.cycle')).toHaveLength(1);
    expect(find(loop, 'requires.order').severity).toBe('warning');
  });

  it('accepts an open lesson and a branch', () => {
    expect(courseErrors(course((c) => {
      lesson(c, 'counting-rhythm').requires = [];
      lesson(c, 'first-chords').requires = ['open-strings', 'major-scale'];
    }))).toEqual([]);
    expect(find(validateCourse(course((c) => { (lesson(c, 'first-chords') as { requires: unknown }).requires = 'major-scale'; })), 'requires.shape').message).toMatch(/list of lesson ids/);
  });
});

describe('texts', () => {
  it('have limits sized for a phone, stated in the message', () => {
    const long = 'word '.repeat(80);
    const p = find(stepCase(choice({ prompt: long })), 'text.long');
    expect(p.message).toMatch(new RegExp(`The prompt is \\d+ characters long; the limit is ${TEXT_LIMITS.prompt}`));
    expect(find(stepCase(choice({ explain: long })), 'text.long').message).toMatch(new RegExp(`limit is ${TEXT_LIMITS.explain}`));
    expect(find(stepCase(choice({ options: [{ text: long, correct: true }, { text: 'b' }] })), 'text.long').message).toMatch(/Option 1 is/);
    expect(find(stepCase({ type: 'card', body: long.repeat(2) }), 'text.long').message).toMatch(new RegExp(`card body.*${TEXT_LIMITS.cardBody}`));
    expect(find(validateCourse(course((c) => { lesson(c, 'open-strings').title = 'A very long lesson title that goes on and on and on'; })), 'text.long').message).toMatch(/lesson title/);
    expect(find(validateCourse(course((c) => { unit(c).description = long; })), 'text.long').message).toMatch(/unit description/);
    expect(find(validateCourse(course((c) => { lesson(c, 'open-strings').teaches = long; })), 'text.long').message).toMatch(/"teaches"/);
    expect(find(validateCourse(course((c) => { lesson(c, 'open-strings').facts![0].back = long; })), 'text.long').message).toMatch(/The back/);
  });

  it('count visible characters, so markup is free', () => {
    const tagged = Array.from({ length: 20 }, () => '{t:eighth-note|x}').join(' ');
    expect(courseErrors(withStep('musical-alphabet', 1, choice({ prompt: tagged })))).toEqual([]);
  });

  it('must not be empty where required', () => {
    expect(find(stepCase(choice({ prompt: ' ' })), 'text.empty').message).toMatch(/prompt is empty/);
    expect(find(stepCase(choice({ explain: '' })), 'text.empty').message).toMatch(/explanation.*why the answer is right.*is empty/);
    expect(find(validateCourse(course((c) => { lesson(c, 'open-strings').teaches = ''; })), 'text.empty').message).toMatch(/"teaches"/);
    expect(find(validateCourse(course((c) => { unit(c).description = ''; })), 'text.empty').message).toMatch(/unit description/);
  });

  it('must be valid markup', () => {
    expect(find(stepCase(choice({ prompt: 'Which **note?' })), 'text.markup').message).toMatch(/never closed/);
    expect(find(stepCase(choice({ prompt: 'Play {n:H}.' })), 'text.markup').message).toMatch(/valid note/);
    expect(find(stepCase(choice({ prompt: 'A ___ here' })), 'text.markup').message).toMatch(/only in a fill-blanks text/);
  });

  it('may only link glossary terms that exist', () => {
    const p = find(stepCase(choice({ prompt: 'What is a {t:hammer-on}?' })), 'glossary.unknown');
    expect(p.message).toMatch(/\{t:hammer-on\} is not in the glossary.*course\.glossary/);
    const withTerm = course((c) => {
      c.glossary = [{ id: 'hammer-on', term: 'hammer-on', definition: 'Sounding a note by tapping a finger down hard on the string.' }];
      lesson(c, 'musical-alphabet').steps[1] = choice({ prompt: 'What is a {t:hammer-on}?' });
    });
    expect(courseErrors(withTerm)).toEqual([]);
  });

  it('course glossary entries are checked too', () => {
    const bad = validateCourse(course((c) => {
      c.glossary = [
        { id: 'Bad Id', term: 'x', definition: 'y' },
        { id: 'tapping', term: 'tapping', definition: '' },
        { id: 'tapping', term: 'tapping', definition: 'Fretting-hand notes sounded by the picking hand.' },
        { id: 'barre', term: 'barre', definition: 'My own words.' },
      ];
    }));
    expect(find(bad, 'id.format').where).toBe('glossary term 1 "Bad Id"');
    expect(find(bad, 'text.long').message).toMatch(/definition must be one line/);
    expect(find(bad, 'id.duplicate').message).toMatch(/"tapping" appears twice/);
    expect(find(bad, 'glossary.shadow')).toMatchObject({ severity: 'warning' });
  });

  it('must give speakable text where symbols need it', () => {
    const p = find(stepCase(choice({ prompt: 'Which note is the third of Am7?' })), 'text.speech');
    expect(p.message).toMatch(/Am7 → \{c:Am7\}.*or give the text a "say" version/);
    expect(courseErrors(withStep('musical-alphabet', 1, choice({ prompt: { text: 'Which note is the third of Am7?', say: 'Which note is the third of A minor seven?' } })))).toEqual([]);
    expect(courseErrors(withStep('musical-alphabet', 1, choice({ prompt: 'Which note is the third of {c:Am7}?' })))).toEqual([]);
    expect(find(validateCourse(course((c) => { lesson(c, 'open-strings').teaches = 'The IV chord and the V7 chord.'; })), 'text.speech').message).toMatch(/IV → \{r:IV\}/);
  });
});

describe('figures', () => {
  it('must be valid on the instrument', () => {
    const card = (figure: CardStep['figure']): CourseProblem[] => validateCourse(withStep('musical-alphabet', 0, { type: 'card', body: 'Look.', figure }));
    expect(find(card({ kind: 'fretboard', dots: [{ string: 7, fret: 0 }] }), 'figure.invalid').message).toMatch(/string 7 does not exist/);
    expect(find(card({ kind: 'fretboard', dots: [{ string: 6, fret: 3, note: 'A' }] }), 'figure.invalid').message).toMatch(/is G2 on the neck, not A/);
    expect(find(card({ kind: 'chord', symbol: 'C', frets: 'x32011' }), 'figure.invalid').message).toMatch(/is not C/);
    expect(find(card({ kind: 'staff', notes: ['E'] }), 'figure.invalid').message).toMatch(/no octave/);
    expect(find(card({ kind: 'rhythm', pattern: 'q q q' }), 'figure.invalid').message).toMatch(/Bar 1 lasts 3/);
    expect(find(card({ kind: 'audio', sound: { kind: 'chord', chord: 'Xx' } }), 'figure.invalid').message).toMatch(/not a chord symbol/);
    expect(find(card({ kind: 'circle', key: 'Z major' }), 'figure.invalid')).toMatchObject({ step: 1, lesson: 'musical-alphabet' });
    expect(find(card({ kind: 'keyboard', keys: ['C4'], caption: 'x'.repeat(200) }), 'text.long').message).toMatch(/figure caption/);
    expect(find(card({ kind: 'audio', sound: { kind: 'chord', chord: 'Am' }, label: 'Hear Am' }), 'text.speech').message).toMatch(/figure label/);
  });

  it('are checked inside options and on the back of flashcards', () => {
    expect(find(stepCase(choice({ options: [{ figure: { kind: 'rhythm', pattern: 'q q q q' }, correct: true }, { figure: { kind: 'rhythm', pattern: 'q q' } }] })), 'figure.invalid').message).toMatch(/Option 2 figure/);
    expect(find(stepCase({ type: 'flashcard', front: 'f', back: 'b', backFigure: { kind: 'chord', symbol: '??' } }), 'figure.invalid').message).toMatch(/back figure/);
  });
});

describe('exercises must be gradable, with safe distractors', () => {
  it('choice: exactly one right option, or at least one with multiple', () => {
    expect(find(stepCase(choice({ options: [{ text: 'a', correct: true }, { text: 'b', correct: true }, { text: 'c' }] })), 'exercise.ungradable').message).toMatch(/2 options are marked correct.*or set multiple: true/);
    expect(courseErrors(withStep('musical-alphabet', 1, choice({ multiple: true, options: [{ text: 'a', correct: true }, { text: 'b', correct: true }, { text: 'c' }] })))).toEqual([]);
    expect(find(stepCase(choice({ multiple: true, options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] })), 'exercise.distractor').message).toMatch(/Every option is correct/);
    expect(find(stepCase(choice({ multiple: true, options: [{ text: 'a' }, { text: 'b' }] })), 'exercise.ungradable').message).toMatch(/No option is marked correct/);
  });

  it('choice: option counts, empty and duplicate options', () => {
    expect(find(stepCase(choice({ options: [{ text: 'a', correct: true }] })), 'exercise.count').message).toMatch(new RegExp(`Too few options: 1, and at least ${COUNT_LIMITS.options[0]}`));
    expect(find(stepCase(choice({ options: 'abcdefg'.split('').map((t, i) => ({ text: t, correct: i === 0 })) })), 'exercise.count').message).toMatch(/Too many options: 7/);
    expect(find(stepCase(choice({ options: [{ correct: true }, { text: 'b' }] })), 'exercise.shape').message).toMatch(/neither "text" nor "figure"/);
    expect(find(stepCase(choice({ options: [{ text: '{n:A}', correct: true }, { text: ' {n:a} ' }] })), 'exercise.duplicate').message).toMatch(/Options 1 and 2 are the same/);
  });

  it('the classic trap: two names for one pitch in the same option list', () => {
    const trap = choice({ prompt: 'Which note is one fret above {n:C}?', options: [{ text: '{n:C#}', correct: true }, { text: '{n:Db}' }, { text: '{n:D}' }] });
    const p = find(stepCase(trap), 'exercise.enharmonic');
    expect(p.message).toMatch(/Options "C♯" and "D♭" are the same pitch under two names, so both could be right.*spelling: 'exact'/);
    // When telling the names apart IS the question, the author says so.
    expect(courseErrors(withStep('musical-alphabet', 1, { ...trap, spelling: 'exact' }))).toEqual([]);
    // Bare note names, chords, intervals and keys are caught as well.
    expect(find(stepCase(choice({ options: [{ text: 'F#', correct: true }, { text: 'Gb' }] })), 'exercise.enharmonic')).toBeTruthy();
    expect(find(stepCase(choice({ options: [{ text: '{c:C#m}', correct: true }, { text: '{c:Dbm}' }] })), 'exercise.enharmonic')).toBeTruthy();
    expect(find(stepCase(choice({ options: [{ text: '{i:A4}', correct: true }, { text: '{i:d5}' }] })), 'exercise.enharmonic')).toBeTruthy();
    expect(find(stepCase(choice({ options: [{ text: '{k:F# major}', correct: true }, { text: '{k:Gb major}' }] })), 'exercise.enharmonic')).toBeTruthy();
    expect(find(stepCase(choice({ options: [{ text: '{n:C} {n:E} {n:G#}', correct: true }, { text: '{n:C} {n:E} {n:Ab}' }] })), 'exercise.enharmonic')).toBeTruthy();
    expect(pitchSignature('{n:C#}')).toBe(pitchSignature('{n:Db}'));
    expect(pitchSignature('{n:C#} and more words')).toBeNull();
  });

  it('by ear, twins are never allowed', () => {
    const p = find(stepCase({ type: 'listen-choice', prompt: 'Which interval?', sound: { kind: 'interval', from: 'C3', interval: 'A4' }, options: [{ text: '{i:A4}', correct: true }, { text: '{i:d5}' }], explain }), 'exercise.enharmonic');
    expect(p.message).toMatch(/sound exactly the same, so the ear cannot choose/);
    expect(find(stepCase({ type: 'listen-choice', prompt: 'p', sound: { kind: 'chord', chord: 'Qq' }, options: [{ text: 'a', correct: true }, { text: 'b' }], explain }), 'figure.invalid').message).toMatch(/Sound:/);
  });

  it('match-pairs and order', () => {
    const pairs = (list: Array<[string, string]>): Step => ({ type: 'match-pairs', prompt: 'Match.', pairs: list.map(([left, right]) => ({ left, right })), explain });
    expect(find(stepCase(pairs([['a', '1'], ['b', '2']])), 'exercise.count').message).toMatch(/Too few pairs: 2/);
    expect(find(stepCase(pairs([['a', '1'], ['b', '1'], ['c', '3']])), 'exercise.duplicate').message).toMatch(/same right side.*ambiguous/);
    expect(find(stepCase(pairs([['a', '1'], ['a', '2'], ['c', '3']])), 'exercise.duplicate').message).toMatch(/same left side/);
    expect(find(stepCase(pairs([['1 up', '{n:C#}'], ['2 up', '{n:D}'], ['1 down', '{n:Db}']])), 'exercise.enharmonic').message).toMatch(/right side/);
    expect(find(stepCase({ type: 'order', prompt: 'p', tiles: ['a', 'b'], explain }), 'exercise.count').message).toMatch(/Too few tiles/);
    expect(find(stepCase({ type: 'order', prompt: 'p', tiles: ['a', 'a', 'a'], explain }), 'exercise.ungradable').message).toMatch(/Every tile is the same/);
    expect(find(stepCase({ type: 'order', prompt: 'p', tiles: ['{n:C}', '{n:D}', '{n:E}'], distractors: ['{n:D}'], explain }), 'exercise.distractor').message).toMatch(/Extra tile 1.*same as a tile of the answer/);
    expect(find(stepCase({ type: 'order', prompt: 'p', tiles: ['{n:C}', '{n:C#}', '{n:D}'], distractors: ['{n:Db}'], explain }), 'exercise.enharmonic').message).toMatch(/same pitch as a tile/);
    expect(find(stepCase({ type: 'order', prompt: 'p', tiles: ['a very long tile indeed', 'b', 'c'], explain }), 'text.long').message).toMatch(/Tile 1/);
  });

  it('fill-blanks', () => {
    const fill = (extra: object): Step => ({ type: 'fill-blanks', prompt: 'Complete.', text: '{n:C} ___ {n:E}', blanks: ['{n:D}'], bank: ['{n:F}'], explain, ...extra }) as Step;
    expect(find(stepCase(fill({ blanks: ['{n:D}', '{n:E}'] })), 'exercise.shape').message).toMatch(/text has 1 "___" but "blanks" lists 2 words/);
    expect(find(stepCase(fill({ bank: [] })), 'exercise.count').message).toMatch(/Too few words in the bank/);
    expect(find(stepCase(fill({ bank: ['{n:C##}'] })), 'exercise.enharmonic').message).toMatch(/bank holds.*same pitch under two names/);
    expect(courseErrors(withStep('musical-alphabet', 1, fill({ bank: ['{n:C##}'], spelling: 'exact' })))).toEqual([]);
    expect(find(stepCase(fill({ bank: ['{n:D}', '{n:F}'] })), 'exercise.duplicate').severity).toBe('warning');
    expect(find(stepCase(fill({ text: 'no blanks here', blanks: [] })), 'exercise.count').message).toMatch(/Too few blanks/);
  });

  it('type-answer: the enharmonic policy must be stated', () => {
    const typed = (answer: object): Step => ({ type: 'type-answer', prompt: 'Which note?', answer, explain }) as Step;
    const p = find(stepCase(typed({ kind: 'note', value: 'F#' })), 'exercise.policy');
    expect(p.message).toMatch(/enharmonic policy.*spelling: 'exact'.*key-signature question.*spelling: 'any'/);
    expect(find(stepCase(typed({ kind: 'note', value: 'H', spelling: 'any' })), 'exercise.ungradable').message).toMatch(/not a note name/);
    expect(courseErrors(withStep('musical-alphabet', 1, typed({ kind: 'note', value: 'F#', spelling: 'exact' })))).toEqual([]);
    expect(find(stepCase({ type: 'type-answer', prompt: 'p', explain } as unknown as Step), 'exercise.ungradable').message).toMatch(/"answer" is missing/);
  });

  it('tap-rhythm', () => {
    const tap = (extra: object): Step => ({ type: 'tap-rhythm', prompt: 'Tap.', rhythm: { pattern: 'q q q q' }, tempo: 80, show: 'both', explain, ...extra }) as Step;
    expect(find(stepCase(tap({ rhythm: { pattern: 'q q q' } })), 'figure.invalid').message).toMatch(/Rhythm: Bar 1 lasts 3/);
    expect(find(stepCase(tap({ tempo: 300 })), 'exercise.shape').message).toMatch(/Tempo 300 is outside 40–160/);
    expect(find(stepCase(tap({ rhythm: { pattern: 's s s s s s s s s s s s s s s s' }, tempo: 150 })), 'exercise.ungradable').message).toMatch(/only 100 ms apart at 150 BPM, too fast to tap/);
    expect(find(stepCase(tap({ rhythm: { pattern: 'w' } })), 'exercise.count').message).toMatch(/Too few notes to tap/);
    expect(find(stepCase(tap({ rhythm: { pattern: 'qr q q q' }, start: 'first-tap' })), 'exercise.ungradable').message).toMatch(/must begin with a note/);
    expect(find(stepCase(tap({ show: 'smell' })), 'exercise.shape').message).toMatch(/"show" must be/);
    expect(find(stepCase(tap({ rhythm: { pattern: 'q q q q | q q q q | q q q q' } })), 'exercise.count').message).toMatch(/Too many bars/);
  });

  it('fretboard-find: the octave policy is stated and the region holds an answer', () => {
    const find_ = (extra: object): Step => ({ type: 'fretboard-find', prompt: 'Find {n:G}.', find: { note: 'G' }, mode: 'one', octave: 'any', frets: [0, 5], explain, ...extra }) as Step;
    expect(find(stepCase(find_({ octave: undefined })), 'exercise.policy').message).toMatch(/"octave" is missing.*'exact' when only that very pitch counts, 'any'/);
    expect(find(stepCase(find_({ octave: 'exact' })), 'exercise.policy').message).toMatch(/needs a note with its octave.*G3/);
    expect(find(stepCase(find_({ find: { chord: 'C' }, octave: 'exact' })), 'exercise.policy').message).toMatch(/use octave: 'any' with find: \{ chord \}/);
    expect(find(stepCase(find_({ find: { note: 'G' }, strings: [6], frets: [0, 2] })), 'exercise.ungradable').message).toMatch(/No position in the region is a right answer/);
    expect(find(stepCase(find_({ find: { scale: 'major', tonic: 'C' }, mode: 'all', frets: [0, 12] })), 'exercise.count').message).toMatch(/Too many positions to find/);
    expect(find(stepCase(find_({ frets: [5, 2] })), 'exercise.shape').message).toMatch(/"frets" must be \[first, last\]/);
    expect(find(stepCase(find_({ strings: [8] })), 'exercise.shape').message).toMatch(/string 8 does not exist/);
    expect(find(stepCase(find_({ find: { interval: 'M3', from: { string: 9, fret: 0 } }, octave: 'exact' })), 'exercise.shape').message).toMatch(/"find.from"/);
    expect(find(stepCase(find_({ find: { colour: 'red' } })), 'exercise.shape').message).toMatch(/"find" must be/);
    expect(find(stepCase(find_({ tuning: 'kazoo' })), 'exercise.shape').message).toMatch(/not a tuning/);
    expect(find(stepCase(find_({ shown: [{ string: 1, fret: 40 }] })), 'figure.invalid').message).toMatch(/Shown dot 1/);
  });

  it('fretboard-name: policy, root and options', () => {
    const name = (extra: object): Step => ({ type: 'fretboard-name', prompt: 'Which note?', position: { string: 6, fret: 2 }, ask: 'note', spelling: 'any', options: ['F#', 'F', 'G'], explain, ...extra }) as Step;
    expect(find(stepCase(name({ spelling: undefined })), 'exercise.policy').message).toMatch(/"spelling" is missing/);
    expect(find(stepCase(name({ spelling: 'exact' })), 'exercise.policy').message).toMatch(/needs a "key" to decide the name/);
    expect(find(stepCase(name({ options: ['F#', 'Gb', 'G'] })), 'exercise.distractor').message).toMatch(/2 of the options are right answers/);
    expect(courseErrors(withStep('musical-alphabet', 1, name({ options: ['F#', 'Gb', 'G'], spelling: 'exact', key: 'G major' })))).toEqual([]);
    expect(find(stepCase(name({ options: ['E', 'F', 'G'] })), 'exercise.ungradable').message).toMatch(/None of the options is the right answer/);
    expect(find(stepCase(name({ options: ['{n:F#}', 'F', 'G'] })), 'exercise.shape').message).toMatch(/not note names.*no markup/);
    expect(find(stepCase(name({ ask: 'interval' })), 'exercise.shape').message).toMatch(/"root": it is missing/);
    expect(find(stepCase(name({ ask: 'interval', root: { string: 6, fret: 5 }, options: undefined })), 'exercise.ungradable').message).toMatch(/at or above the root/);
    expect(find(stepCase(name({ ask: 'interval', root: { string: 6, fret: 0 }, spelling: 'exact', options: undefined })), 'exercise.policy').message).toMatch(/fixes the size of an interval, not its spelling/);
    expect(find(stepCase(name({ position: { string: 0, fret: 0 } })), 'exercise.shape').message).toMatch(/"position"/);
    expect(find(stepCase(name({ key: 'Q' })), 'exercise.shape').message).toMatch(/not a key/);
  });

  it('chord-build', () => {
    const build = (extra: object): Step => ({ type: 'chord-build', task: 'fingers', chord: 'Em', prompt: 'Build {c:Em}.', explain, ...extra }) as Step;
    expect(find(stepCase(build({ chord: 'Qq' })), 'exercise.shape').message).toMatch(/not a chord symbol/);
    expect(find(stepCase(build({ frets: 'x32010' })), 'exercise.ungradable').message).toMatch(/is not a voicing of Em/);
    expect(find(stepCase(build({ task: 'guess' })), 'exercise.shape').message).toMatch(/"task" must be/);
    const missing = (extra: object): Step => build({ task: 'missing-note', chord: 'E', given: ['E', 'B'], options: ['G#', 'G', 'A'], prompt: 'Which note is missing from {c:E}?', ...extra });
    expect(courseErrors(withStep('musical-alphabet', 1, missing({})))).toEqual([]);
    expect(find(stepCase(missing({ given: ['E'] })), 'exercise.ungradable').message).toMatch(/leave exactly one note of E out.*E G# B/);
    expect(find(stepCase(missing({ given: ['E', 'C'] })), 'exercise.shape').message).toMatch(/"given" holds C, which is not in E/);
    expect(find(stepCase(missing({ options: ['G#', 'Ab', 'A'] })), 'exercise.distractor').message).toMatch(/2 of the options are right answers/);
    expect(find(stepCase(missing({ options: ['G', 'A'] })), 'exercise.ungradable').message).toMatch(/None of the options/);
  });

  it('staff exercises', () => {
    const read = (extra: object): Step => ({ type: 'staff-read', prompt: 'Which note?', note: 'G3', options: ['G', 'E', 'B'], explain, ...extra }) as Step;
    expect(find(stepCase(read({ note: 'G' })), 'exercise.shape').message).toMatch(/without an octave.*G3/);
    expect(find(stepCase(read({ note: 'C1' })), 'exercise.shape').message).toMatch(/more than four ledger lines/);
    expect(find(stepCase(read({ options: ['A', 'E', 'B'] })), 'exercise.ungradable').message).toMatch(/None of the options/);
    expect(find(stepCase(read({ note: 'F##3', options: undefined })), 'exercise.shape').message).toMatch(/double sharps and flats/);
    const place = (extra: object): Step => ({ type: 'staff-place', prompt: 'Place {n:B}.', note: 'B3', octave: 'exact', explain, ...extra }) as Step;
    expect(find(stepCase(place({ octave: undefined })), 'exercise.policy').message).toMatch(/"octave" is missing/);
    expect(find(stepCase(place({ note: 'B' })), 'exercise.policy').message).toMatch(/needs a note with its octave/);
    expect(courseErrors(withStep('musical-alphabet', 1, place({ note: 'B', octave: 'any' })))).toEqual([]);
    expect(find(stepCase(place({ key: 'Zz' })), 'exercise.shape').message).toMatch(/not a key/);
  });

  it('a consistent exercise accepts its own answer; an inconsistent one is caught', () => {
    // Every type, taken from the demo course, is fine as it stands.
    const types = new Set<string>();
    for (const l of DEMO_COURSE.units.flatMap((u) => u.lessons)) {
      for (const step of l.steps) {
        expect(stepProblems(step).filter((p) => p.severity === 'error'), `${l.id} ${JSON.stringify(step).slice(0, 80)}`).toEqual([]);
        if (!('generate' in step)) types.add(step.type);
      }
    }
    expect(types.size).toBe(18);
    expect(exerciseProblems({ type: 'juggle' } as unknown as Exercise)[0].message).toMatch(/not an exercise type.*choice, true-false/);
    expect(stepProblems(null as unknown as Step)[0].message).toMatch(/not an object/);
  });
});

describe('microphone exercises need a way out', () => {
  const play = (extra: object): Step => ({ type: 'play-note', prompt: 'Play {n:E}.', note: 'E2', octave: 'exact', explain, alternative: choice(), ...extra }) as Step;

  it('every play exercise must carry a non-microphone alternative', () => {
    const p = find(stepCase(play({ alternative: undefined })), 'exercise.alternative');
    expect(p.message).toMatch(/has no "alternative".*fretboard-find.*chord-build.*cannot play/);
    expect(find(stepCase(play({ alternative: play({}) })), 'exercise.alternative').message).toMatch(/alternative is a play-note exercise, which needs the microphone too/);
    expect(find(stepCase(play({ alternative: { generate: 'play-note' } })), 'exercise.alternative').message).toMatch(/"play-note" generator, which itself needs the microphone/);
    expect(courseErrors(withStep('musical-alphabet', 1, play({ alternative: { generate: 'note-on-string', params: { ask: 'find' } } })))).toEqual([]);
  });

  it('the alternative is validated like any exercise', () => {
    expect(find(stepCase(play({ alternative: choice({ options: [{ text: 'a' }, { text: 'b' }] }) })), 'exercise.ungradable').message).toMatch(/^Alternative: 0 options are marked correct/);
    expect(find(stepCase(play({ alternative: { generate: 'step-up', params: { steps: [99] } } })), 'generator.params').message).toMatch(/^Alternative: /);
  });

  it('play exercises are checked against the neck', () => {
    expect(find(stepCase(play({ note: 'E' })), 'exercise.shape').message).toMatch(/needs its octave/);
    expect(find(stepCase(play({ note: 'C1' })), 'exercise.shape').message).toMatch(/outside the guitar's range/);
    expect(find(stepCase(play({ where: { string: 6, fret: 3 } })), 'figure.invalid').message).toMatch(/"where" \(string 6, fret 3\) does not sound E2/);
    expect(find(stepCase(play({ octave: undefined })), 'exercise.policy').message).toMatch(/"octave" is missing/);
    expect(find(stepCase({ type: 'play-chord', prompt: 'p', chord: '??', explain, alternative: choice() }), 'exercise.shape').message).toMatch(/not a chord symbol/);
    expect(find(stepCase({ type: 'play-phrase', prompt: 'p', notes: [{ string: 6, fret: 0, duration: 'q' }], octave: 'exact', explain, alternative: choice() }), 'exercise.count').message).toMatch(/Too few notes in the phrase/);
    expect(find(stepCase({ type: 'play-phrase', prompt: 'p', notes: [{ string: 9, fret: 0, duration: 'q' }, { string: 6, fret: 0, duration: 'q' }], octave: 'exact', explain, alternative: choice() }), 'figure.invalid').message).toMatch(/Phrase: Note 1 is on string 9/);
  });

  it('a fact may not be asked with the microphone: reviews must work anywhere', () => {
    const p = find(validateCourse(course((c) => { lesson(c, 'open-strings').facts![0].ask = { generate: 'play-note' }; })), 'exercise.alternative');
    expect(p.message).toMatch(/"ask" uses a microphone generator/);
    expect(p.where).toBe('unit "first-notes" > lesson "open-strings" > fact 1 "open-strings"');
  });
});

describe('generators', () => {
  it('params are validated and the generator is run to prove them', () => {
    expect(find(stepCase({ generate: 'nope' } as unknown as Step), 'generator.params').message).toMatch(/"nope" is not a generator. Use one of: interval-name/);
    expect(find(stepCase({ generate: 'scale-notes', params: { scales: ['majr'] } }), 'generator.params').message).toMatch(/"majr"/);
    expect(find(stepCase({ generate: 'interval-name', params: { interval: ['m3'] } } as unknown as Step), 'generator.params').message).toMatch(/"interval" is not a parameter/);
    // Params that pass the static check but cannot produce a sound exercise are caught by running it.
    const impossible = stepCase({ generate: 'neck-tones', params: { what: 'scale', scales: ['chromatic'], span: 5, strings: [6, 5, 4] } });
    expect(find(impossible, 'generator.output').message).toMatch(/can produce a faulty exercise: Too many positions to find.*Adjust the params/);
  });

  it('a step may name a fact only if the lesson has it', () => {
    const p = find(validateCourse(withStep('musical-alphabet', 5, { generate: 'enharmonic', fact: 'no-such-fact' })), 'fact.unknown');
    expect(p.message).toMatch(/"fact" is "no-such-fact", but the lesson has no fact with that id/);
    expect(p.step).toBe(6);
  });
});

describe('lesson length and shape', () => {
  const lessons = DEMO_COURSE.units.flatMap((u) => u.lessons);

  it('estimates each demo lesson inside two to five minutes, close to what it declares', () => {
    for (const l of lessons) {
      const seconds = estimateLessonSeconds(l);
      expect(seconds, l.id).toBeGreaterThanOrEqual(120);
      expect(seconds, l.id).toBeLessThanOrEqual(300);
      expect(Math.abs(l.minutes - seconds / 60), l.id).toBeLessThan(1.5);
    }
    expect(estimateStepSeconds({ type: 'card', body: 'x'.repeat(280) })).toBeGreaterThan(estimateStepSeconds({ type: 'card', body: 'short' }));
    expect(estimateStepSeconds({ generate: 'rhythm-tap' })).toBeGreaterThan(estimateStepSeconds({ generate: 'step-up' }));
  });

  it('rejects lessons that are too short or too long', () => {
    const short = find(validateCourse(course((c) => { lesson(c, 'open-strings').steps.length = 3; })), 'lesson.length');
    expect(short.message).toMatch(new RegExp(`has 3 steps; a lesson needs at least ${LESSON_LIMITS.steps[0]}`));
    const long = validateCourse(course((c) => {
      const l = lesson(c, 'open-strings');
      l.steps = [...l.steps, ...l.steps, ...l.steps].map((s) => ({ ...s, fact: undefined }) as Step);
    }));
    expect(find(long, 'lesson.length').message).toMatch(/has 27 steps; 20 is the most.*Split it into two lessons/);
    const slow = validateCourse(course((c) => {
      const l = lesson(c, 'open-strings');
      l.steps = [...l.steps, ...l.steps].map((s) => ({ ...s, fact: undefined }) as Step);
    }));
    expect(find(slow, 'lesson.length').message).toMatch(/estimated at [\d.]+ minutes, over the 5-minute maximum/);
    expect(find(validateCourse(course((c) => { lesson(c, 'open-strings').minutes = 12; })), 'lesson.length').message).toMatch(/"minutes" is 12; lessons take 2 to 5 minutes/);
    const cardsOnly = validateCourse(course((c) => { lesson(c, 'open-strings').steps = Array.from({ length: 8 }, () => ({ type: 'card', body: 'Read this.' }) as Step); }));
    expect(cardsOnly.some((p) => p.code === 'lesson.length' && /has 0 exercises; it needs at least 4/.test(p.message))).toBe(true);
    const quick = validateCourse(course((c) => { lesson(c, 'open-strings').steps = Array.from({ length: 6 }, (_u, i) => ({ type: 'true-false', statement: `Statement number ${i}.`, answer: true, explain }) as Step); }));
    expect(quick.some((p) => p.code === 'lesson.length' && /under the 2-minute minimum/.test(p.message))).toBe(true);
  });

  it('warns when the declared time is far from the estimate', () => {
    const p = find(validateCourse(course((c) => { lesson(c, 'low-e-string').minutes = 2; })), 'lesson.length');
    expect(p.severity).toBe('warning');
    expect(p.message).toMatch(/"minutes" says 2 but the steps are estimated at [\d.]+ minutes. Set "minutes" to about 4/);
  });

  it('warns about lessons that ask before they show, pile up cards, or end on a card', () => {
    const asksFirst = find(validateCourse(course((c) => {
      const l = lesson(c, 'open-strings');
      [l.steps[0], l.steps[1]] = [l.steps[1], l.steps[0]];
    })), 'lesson.shape');
    expect(asksFirst).toMatchObject({ severity: 'warning', step: 1 });
    expect(asksFirst.message).toMatch(/opens with a question. Show the idea first/);
    const cards = validateCourse(course((c) => {
      const l = lesson(c, 'open-strings');
      l.steps.splice(1, 0, { type: 'card', body: 'More.' }, { type: 'card', body: 'And more.' });
    }));
    expect(find(cards, 'lesson.shape').message).toMatch(/3rd teaching card in a row. Ask a question after at most 2 cards/);
    const endsOnCard = validateCourse(course((c) => { lesson(c, 'open-strings').steps.push({ type: 'card', body: 'Bye.' }); }));
    expect(find(endsOnCard, 'lesson.shape').message).toMatch(/ends on a card. End with an exercise/);
  });

  it('warns about too little or too much variety', () => {
    const dull = validateCourse(course((c) => {
      lesson(c, 'open-strings').steps = [
        { type: 'card', body: 'The open strings are {n:E} {n:A} {n:D} {n:G} {n:B} {n:E}, from the thickest string to the thinnest one.' },
        ...Array.from({ length: 9 }, (_u, i) => ({ type: 'true-false', statement: `String ${(i % 6) + 1} is one of the six strings of the guitar, number ${i}.`, answer: true, explain }) as Step),
      ];
    }));
    const p = find(dull, 'lesson.variety');
    expect(p).toMatchObject({ severity: 'warning', lesson: 'open-strings' });
    expect(p.message).toMatch(/uses 1 kind of question \(true-false\). Use 3 to 5/);
  });

  it('limits the facts of a lesson', () => {
    const many = validateCourse(course((c) => {
      lesson(c, 'open-strings').facts = Array.from({ length: 7 }, (_u, i) => ({ id: `fact-${i}`, front: 'Front?', back: 'Back.' }));
    }));
    expect(find(many, 'lesson.facts').message).toMatch(/adds 7 facts.*6 is the most/);
  });
});

describe('units, checkpoints and the course itself', () => {
  it('units need a theme, a title, a description and a sensible number of lessons', () => {
    expect(find(validateCourse(course((c) => { unit(c).theme = 'polka' as never; })), 'course.shape').message).toMatch(/"theme" is "polka"; it must be one of: basics, notes/);
    expect(find(validateCourse(course((c) => { unit(c).lessons.length = 1; })), 'course.shape').message).toMatch(/has 1 lessons; a unit holds 2 to 12/);
    expect(find(validateCourse(course((c) => { c.units = []; })), 'course.shape').message).toMatch(/no units/);
    expect(find(validateCourse(course((c) => { (c as { teacher: string }).teacher = 'bob'; })), 'course.shape').message).toMatch(/'mia', 'dev', 'elena' or 'none'/);
    expect(find(validateCourse(course((c) => { (c as { level: string }).level = 'guru'; })), 'course.shape').message).toMatch(/'beginner', 'intermediate' or 'expert'/);
    expect(validateCourse(null as unknown as Course)[0].message).toMatch(/not an object/);
  });

  it('checkpoints are quizzes of graded exercises', () => {
    const cp = (change: (u: Unit) => void): CourseProblem[] => validateCourse(course((c) => change(c.units[1])));
    expect(find(cp((u) => { u.checkpoint!.steps!.length = 3; }), 'checkpoint.shape').message).toMatch(/has 3 questions; it needs 6 to 20/);
    expect(find(cp((u) => { u.checkpoint!.steps![0] = { type: 'card', body: 'Hello.' } as never; }), 'exercise.shape').message).toMatch(/teaching card; only exercises can go here/);
    expect(find(cp((u) => { u.checkpoint!.steps![0] = { type: 'flashcard', front: 'f', back: 'b' }; }), 'checkpoint.shape').message).toMatch(/self-rated, so it cannot test a learner out/);
    expect(find(cp((u) => { u.checkpoint!.maxMistakes = -1; }), 'checkpoint.shape').message).toMatch(/"maxMistakes" is -1/);
    const bad = find(cp((u) => { u.checkpoint!.steps![2] = { generate: 'scale-formula', params: { scales: ['nope'] } }; }), 'generator.params');
    expect(bad.where).toBe('unit "building-blocks" > checkpoint > step 3 (generated: scale-formula)');
    expect(find(validateCourse(course((c) => { c.units[0].checkpoint = { sample: 99 }; })), 'checkpoint.shape').message).toMatch(/"sample" is 99/);
  });
});
