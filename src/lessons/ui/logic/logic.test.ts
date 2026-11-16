import { describe, expect, it } from 'vitest';
import { DEMO_COURSE, EXERCISE_EXAMPLES, checkText, grade, soundPlan, solve, wrongAnswers, type SessionFeedback } from '../../index';
import type { Exercise, TapRhythmExercise } from '../../types';
import { feedbackCopy, rightWord, valueMarkup, wrongLine } from './feedback';
import { EMPTY_KEYPAD, inputKind, keypadBackspace, keypadKey, keypadValue, noteAnswerText, pressAccidental, pressDigit, pressLetter } from './keypad';
import { cardLayout, digitFor, exerciseLayout, positionOfKey } from './layout';
import { moveFocus, nextPhase, pathLayout, swing } from './path';
import { canPlaySlow, stretchPlan, SLOW_FACTOR } from './sound';
import { formatDuration, formatPercent, nextLabel, resumeNote, summaryHeadline, summaryStats, teacherLine } from './summary';
import { countAt, tapPlan, tapsFromBeatOne } from './tap';
import { heardNothing } from './play';
import { GLYPH_WIDTH, glyphPath, ledgerLines, positionAtY, staffPositionName } from './staff';
import type { SessionReport } from '../../effects';

const fb = (exercise: Exercise, answer = wrongAnswers(exercise)[0] ?? solve(exercise), extra: Partial<SessionFeedback> = {}): SessionFeedback => ({
  result: grade(exercise, answer),
  answer,
  skipped: false,
  heartLost: false,
  willRetry: false,
  ...extra,
});

describe('keypad', () => {
  it('composes a note from a letter and an accidental', () => {
    let n = pressLetter(EMPTY_KEYPAD, 'F');
    n = pressAccidental(n, '#');
    expect(keypadValue(n)).toBe('F#');
    expect(keypadValue(pressAccidental(n, '#'))).toBe('F');
    expect(keypadValue(pressLetter(n, 'G'))).toBe('G#');
    expect(keypadValue(keypadBackspace(n))).toBe('F');
    expect(keypadValue(keypadBackspace(keypadBackspace(n)))).toBe('');
  });

  it('sends B natural as H in German naming so the grader reads it right', () => {
    expect(noteAnswerText('B', 'german')).toBe('H');
    expect(noteAnswerText('Bb', 'german')).toBe('Bb');
    expect(noteAnswerText('B#', 'german')).toBe('H#');
    expect(noteAnswerText('B', 'letters')).toBe('B');
    const spec = { kind: 'note' as const, value: 'B', spelling: 'exact' as const };
    expect(checkText(noteAnswerText('B', 'german'), spec, 'german').verdict).toBe('correct');
    expect(checkText(noteAnswerText('Bb', 'german'), { ...spec, value: 'Bb' }, 'german').verdict).toBe('correct');
    for (const naming of ['letters', 'solfege'] as const) {
      expect(checkText(noteAnswerText('F#', naming), { ...spec, value: 'F#' }, naming).verdict).toBe('correct');
    }
  });

  it('maps keys and picks an input kind', () => {
    expect(keypadKey('f')).toEqual({ letter: 'F' });
    expect(keypadKey('#')).toEqual({ accidental: '#' });
    expect(keypadKey('-')).toEqual({ accidental: 'b' });
    expect(keypadKey('h')).toBeNull();
    expect(inputKind({ kind: 'note', value: 'F#', spelling: 'exact' })).toBe('note');
    expect(inputKind({ kind: 'number', value: 3 })).toBe('number');
    expect(inputKind({ kind: 'interval', value: 'm3', spelling: 'any' })).toBe('text');
    expect(pressDigit('', 1)).toBe('1');
    expect(pressDigit('0', 5)).toBe('5');
    expect(pressDigit('123', 4)).toBe('123');
  });
});

describe('feedback copy', () => {
  it('is green with the reason for a right answer', () => {
    const ex = EXERCISE_EXAMPLES.choice;
    const copy = feedbackCopy(ex, fb(ex, solve(ex)), 3);
    expect(copy.tone).toBe('ok');
    expect(copy.answer).toBeNull();
    expect(copy.explain).toBe(ex.type === 'choice' ? ex.explain : '');
    expect(rightWord(3)).toBe(copy.title);
  });

  it('is kind and specific for a wrong answer, and shows the right one', () => {
    const ex = EXERCISE_EXAMPLES.choice; // the fifth of C; E carries a "why"
    if (ex.type !== 'choice') throw new Error('choice expected');
    const e = ex.options.findIndex((o) => o.why);
    const copy = feedbackCopy(ex, fb(ex, { type: 'choice', selected: [e] }, { heartLost: true, willRetry: true }));
    expect(copy.tone).toBe('bad');
    expect(copy.title).toBe('Not quite.');
    expect(copy.note).toBe(ex.options[e].why);
    expect(copy.answer).toBe('{n:G}');
    expect(copy.heartLost).toBe(true);
    expect(copy.willRetry).toBe(true);
  });

  it('has a specific line for every exercise type that can be wrong', () => {
    for (const ex of Object.values(EXERCISE_EXAMPLES)) {
      if (ex.type === 'flashcard' || ex.type === 'true-false') continue;
      const wrong = wrongAnswers(ex)[0] ?? wrongOf(ex);
      const line = wrongLine(ex, grade(ex, wrong));
      expect(line, ex.type).toBeTruthy();
    }
  });

  it('marks up typed values by kind', () => {
    expect(valueMarkup('note', 'F#')).toBe('{n:F#}');
    expect(valueMarkup('interval', 'm3')).toBe('{i:m3}');
    expect(valueMarkup('text', 'a*b')).toBe('a\\*b');
  });

  it('says "here is the answer" for a skip, without blame', () => {
    const ex = EXERCISE_EXAMPLES['type-answer'];
    const copy = feedbackCopy(ex, { ...fb(ex), skipped: true, answer: null });
    expect(copy.tone).toBe('info');
    expect(copy.heartLost).toBe(false);
    expect(copy.answer).toBeTruthy();
  });
});

/** A wrong answer for the types whose examples carry no distractors. */
function wrongOf(ex: Exercise) {
  switch (ex.type) {
    case 'type-answer':
      return { type: 'type-answer' as const, text: 'C' };
    case 'tap-rhythm':
      return { type: 'tap-rhythm' as const, taps: [0, 1.4] };
    case 'fretboard-find':
      return { type: 'fretboard-find' as const, positions: [{ string: 1, fret: 1 }] };
    case 'chord-build':
      return { type: 'chord-build' as const, frets: [null, 3, 2, 0, 1, 0] };
    case 'staff-place':
      return { type: 'staff-place' as const, position: 0, accidental: null };
    case 'play-note':
      return { type: 'play-note' as const, midi: 41 };
    case 'play-chord':
      return { type: 'play-chord' as const, matched: false, score: 0.3, missing: [11], extra: [] };
    case 'play-phrase':
      return { type: 'play-phrase' as const, played: [48] };
    case 'order':
      return { type: 'order' as const, order: [1, 0, 2, 3] };
    case 'match-pairs':
      return { type: 'match-pairs' as const, pairs: [[0, 1], [1, 0], [2, 2]] as Array<[number, number]> };
    case 'fill-blanks':
      return { type: 'fill-blanks' as const, blanks: ['{n:C#}', '{n:F}'] };
    default:
      return solve(ex);
  }
}

describe('layout', () => {
  it('gives instrument exercises the width and pictures a split', () => {
    expect(exerciseLayout(EXERCISE_EXAMPLES['fretboard-find'])).toBe('wide');
    expect(exerciseLayout(EXERCISE_EXAMPLES['staff-read'])).toBe('split');
    expect(exerciseLayout(EXERCISE_EXAMPLES.choice)).toBe('narrow');
    expect(cardLayout({ type: 'card', body: 'x' })).toBe('narrow');
    expect(cardLayout({ type: 'card', body: 'x', figure: { kind: 'chord', symbol: 'C' } })).toBe('split');
  });

  it('maps number keys to display positions', () => {
    expect(digitFor(0)).toBe('1');
    expect(digitFor(9)).toBeNull();
    expect(positionOfKey('3')).toBe(2);
    expect(positionOfKey('0')).toBeNull();
    expect(positionOfKey('a')).toBeNull();
  });
});

describe('path', () => {
  it('keeps every node inside the column and starts each unit where the last ended', () => {
    for (const width of [300, 360, 520]) {
      const { points, height, d } = pathLayout(9, { width, row: 96, node: 72 });
      expect(points).toHaveLength(9);
      for (const p of points) {
        expect(p.x - 36).toBeGreaterThanOrEqual(0);
        expect(p.x + 36).toBeLessThanOrEqual(width);
      }
      expect(points[0].x).toBe(width / 2);
      expect(height).toBe(96 * 9);
      expect(d.startsWith('M')).toBe(true);
    }
    expect(swing(nextPhase(0, 3))).toBe(swing(3));
    expect(pathLayout(0, { width: 300, row: 96, node: 72 }).height).toBe(0);
  });

  it('moves focus with arrows, Home and End', () => {
    expect(moveFocus(0, 'ArrowDown', 3)).toBe(1);
    expect(moveFocus(2, 'ArrowDown', 3)).toBe(2);
    expect(moveFocus(1, 'ArrowUp', 3)).toBe(0);
    expect(moveFocus(1, 'End', 3)).toBe(2);
    expect(moveFocus(1, 'x', 3)).toBeNull();
  });
});

describe('sound', () => {
  it('stretches times and ring lengths but keeps the notes', () => {
    const plan = soundPlan({ kind: 'notes', notes: ['C4', 'E4', 'G4'], tempo: 90 });
    const slow = stretchPlan(plan, SLOW_FACTOR);
    expect(slow.events.map((e) => e.midi)).toEqual(plan.events.map((e) => e.midi));
    expect(slow.events[1].at).toBeCloseTo(plan.events[1].at * SLOW_FACTOR);
    expect(slow.duration).toBeCloseTo(plan.duration * SLOW_FACTOR);
    expect(stretchPlan(plan, 1)).toBe(plan);
    expect(canPlaySlow(plan)).toBe(true);
    expect(canPlaySlow(soundPlan({ kind: 'chord', chord: 'C', style: 'block' }))).toBe(false);
  });
});

describe('tap plan', () => {
  const ex = EXERCISE_EXAMPLES['tap-rhythm'] as TapRhythmExercise; // q e e q q at 80

  it('counts in one bar and keeps clicking through the rhythm', () => {
    const plan = tapPlan(ex);
    expect(plan.beatsPerBar).toBe(4);
    expect(plan.beat).toBeCloseTo(0.75);
    expect(plan.countIn).toBeCloseTo(3);
    expect(plan.clicks.filter((c) => c.countIn)).toHaveLength(4);
    expect(plan.clicks.filter((c) => !c.countIn)).toHaveLength(4);
    expect(plan.targets).toEqual([0, 0.75, 1.125, 1.5, 2.25]);
    expect(plan.stopAfter).toBeGreaterThan(plan.length);
    expect(countAt(plan, 0.1)?.count).toBe(1);
    expect(countAt(plan, 3.8)?.countIn).toBe(false);
    expect(countAt(plan, -1)).toBeNull();
  });

  it('turns raw timestamps into seconds from beat one that the grader accepts', () => {
    const plan = tapPlan(ex);
    const beatOne = 10_000;
    const raw = plan.targets.map((t) => beatOne + t * 1000 + 30);
    const taps = tapsFromBeatOne([...raw, beatOne - 5000], beatOne, plan.beat);
    expect(taps).toHaveLength(plan.targets.length);
    expect(grade(ex, { type: 'tap-rhythm', taps }).correct).toBe(true);
  });

  it('has no count-in when the first tap starts the rhythm', () => {
    const plan = tapPlan({ ...ex, start: 'first-tap' });
    expect(plan.countIn).toBe(0);
    expect(plan.clicks).toHaveLength(0);
  });
});

describe('summary', () => {
  it('formats durations and shares', () => {
    expect(formatDuration(161)).toBe('2:41');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatPercent(0.857)).toBe('86%');
  });

  it('leads with the outcome', () => {
    const base = { mode: 'lesson' as const, perfect: false, exercises: 6, mistakes: 1, heartsLeft: 3 };
    expect(summaryHeadline({ ...base, outcome: 'completed' }).title).toBe('Lesson complete');
    expect(summaryHeadline({ ...base, outcome: 'completed', perfect: true }).celebrate).toBe(true);
    expect(summaryHeadline({ ...base, outcome: 'out-of-hearts' }).tone).toBe('warn');
    expect(summaryHeadline({ ...base, mode: 'checkpoint', outcome: 'failed' }).celebrate).toBe(false);
    expect(summaryHeadline({ ...base, mode: 'review', outcome: 'completed', exercises: 0 }).title).toBe('Nothing to review');
  });

  it('shows the numbers that mean something', () => {
    const report = {
      mode: 'lesson', outcome: 'completed', title: 'x', exercises: 7, accuracy: 6 / 7, firstTry: 6, mistakes: 1, perfect: false, bestCombo: 4, durationSec: 161,
      xp: 10, crown: { before: 0, after: 1, gained: true }, factsAdded: 2, cardsReviewed: 0, heartsLeft: 4, missed: [], unlocked: [], next: 'continue',
      xpAwarded: 10, multiplier: 1, leveledUp: false, level: 2, goalMetNow: true, streakExtended: true, streak: 3, gems: 0, quests: [], achievements: [], hearts: 4,
    } as SessionReport;
    const stats = summaryStats(report);
    expect(stats.map((s) => s.id)).toEqual(['accuracy', 'time', 'xp', 'streak', 'crowns', 'cards', 'combo']);
    expect(stats[0].value).toBe('86%');
    expect(stats.find((s) => s.id === 'cards')?.value).toBe('2 cards');
    expect(nextLabel({ kind: 'lesson', unitId: 'a', lessonId: 'b', title: 'B' }, 'lesson')).toBe('Next lesson');
  });

  it('knows the demo course', () => {
    expect(DEMO_COURSE.units.length).toBe(2);
  });
});

describe('teacher lines', () => {
  it('speak in the teacher\'s voice and stay quiet for the Theory Path', () => {
    expect(teacherLine('mia', 'completed', false)).toMatch(/hands and ears/);
    expect(teacherLine('elena', 'completed', true)).toMatch(/Flawless/);
    expect(teacherLine('dev', 'out-of-hearts', false)).toBeTruthy();
    expect(teacherLine('none', 'completed', false)).toBeNull();
  });
});

describe('play', () => {
  it('treats silence as "nothing heard", never as a wrong answer', () => {
    expect(heardNothing({ type: 'play-note', midi: null })).toBe(true);
    expect(heardNothing({ type: 'play-note', midi: 40 })).toBe(false);
    expect(heardNothing({ type: 'play-phrase', played: [] })).toBe(true);
    expect(heardNothing({ type: 'play-chord', matched: false, score: 0, missing: [], extra: [] })).toBe(true);
    expect(heardNothing({ type: 'play-chord', matched: false, score: 0.3, missing: [4], extra: [] })).toBe(false);
  });
});

describe('staff', () => {
  it('names positions in plain words', () => {
    expect(staffPositionName(0)).toBe('bottom line');
    expect(staffPositionName(1)).toBe('1st space');
    expect(staffPositionName(4)).toBe('3rd line');
    expect(staffPositionName(8)).toBe('top line');
    expect(staffPositionName(9)).toBe('space above the staff');
    expect(staffPositionName(10)).toBe('1st ledger line above');
    expect(staffPositionName(-2)).toBe('1st ledger line below');
    expect(staffPositionName(-3)).toBe('below ledger line 1');
  });

  it('draws ledger lines only outside the staff', () => {
    expect(ledgerLines(4)).toEqual([]);
    expect(ledgerLines(-1)).toEqual([]);
    expect(ledgerLines(-4)).toEqual([-2, -4]);
    expect(ledgerLines(11)).toEqual([10]);
  });

  it('turns a tap into the nearest position, within the range', () => {
    // top = 14, max position 17, a step of 7 units: position 4 sits at 14 + 13 * 7 = 105.
    expect(positionAtY(105, 14, 17, 7, [-9, 17])).toBe(4);
    expect(positionAtY(108, 14, 17, 7, [-9, 17])).toBe(4);
    expect(positionAtY(-50, 14, 17, 7, [-9, 17])).toBe(17);
  });

  it('turns glyph outlines into SVG paths at the right size', () => {
    const d = glyphPath('wholeNote', 100, 50, 14);
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('C');
    expect(d.trim().endsWith('Z')).toBe(true);
    // The whole note is about 1.7 staff spaces wide.
    const xs = [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(GLYPH_WIDTH.wholeNote * 14, 0);
  });
});

// Found in review, by using the player in a browser.
describe('review: what the player says matches what happens', () => {
  const report = (extra: Partial<SessionReport>): SessionReport =>
    ({
      mode: 'lesson', outcome: 'completed', title: 'x', exercises: 7, accuracy: 1, firstTry: 7, mistakes: 0, perfect: true, bestCombo: 7, durationSec: 60,
      xp: 15, crown: null, factsAdded: 0, cardsReviewed: 0, heartsLeft: 5, missed: [], unlocked: [], next: 'continue',
      xpAwarded: 15, multiplier: 1, leveledUp: false, level: 2, goalMetNow: false, streakExtended: false, streak: null, gems: 0, quests: [], achievements: [], hearts: 5,
      ...extra,
    }) as SessionReport;

  it('"End lesson now" does not promise a saved place: the slot is cleared, so the summary says it starts again', () => {
    const base = { mode: 'lesson' as const, perfect: false, exercises: 2, mistakes: 0, heartsLeft: 5 };
    const h = summaryHeadline({ ...base, outcome: 'quit' });
    expect(h.title).toBe('Lesson ended');
    expect(h.subtitle).toMatch(/starts from the beginning/);
    expect(`${h.title} ${h.subtitle}`).not.toMatch(/saved|pick up|whenever you like/i);
    expect(summaryHeadline({ ...base, mode: 'checkpoint', outcome: 'quit' }).title).toBe('Checkpoint ended');
    for (const t of ['mia', 'dev', 'elena']) expect(teacherLine(t, 'quit', false), t).not.toMatch(/pick it up|where we stopped|will be here/i);
  });

  it('a session with nothing in it shows no "+0 XP"', () => {
    const empty = summaryStats(report({ exercises: 0, xp: 0, xpAwarded: 0, firstTry: 0, perfect: false, bestCombo: 0 }));
    expect(empty.map((s) => s.id)).toEqual(['time']);
    expect(summaryStats(report({})).map((s) => s.id)).toContain('xp');
  });

  it('the answer that used the last heart does not promise a come-back that will never come', () => {
    const ex = EXERCISE_EXAMPLES.choice;
    const wrong = fb(ex, undefined, { heartLost: true, willRetry: true });
    const last = feedbackCopy(ex, wrong, 0, 0);
    expect(last).toMatchObject({ heartLost: true, lastHeart: true, willRetry: false });
    const more = feedbackCopy(ex, wrong, 0, 3);
    expect(more).toMatchObject({ heartLost: true, lastHeart: false, willRetry: true });
    // Hearts not in play (teacher courses): unchanged.
    expect(feedbackCopy(ex, fb(ex, undefined, { willRetry: true }), 0, null)).toMatchObject({ lastHeart: false, willRetry: true });
  });

  it('the resume note counts the steps done, not a step number that can be off by one', () => {
    expect(resumeNote(3, 10)).toBe('3 of 10 steps done.');
    expect(resumeNote(12, 10)).toBe('10 of 10 steps done.');
    expect(resumeNote(0, 0)).toBe('Your place was kept.');
  });
});
