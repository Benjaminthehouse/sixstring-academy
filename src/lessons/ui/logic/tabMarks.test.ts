import { describe, expect, it } from 'vitest';
import { resolveFigure } from '../../figures';
import { techniqueOptions, planLine } from '../useSound';
import { soundPlan } from '../../sound';
import { bendLabel, bendWords, marksNeedHeadroom, tabMarks, tabNoteWords, tabNoteXs } from './tabMarks';
import { stretchPlan } from './sound';

const tab = resolveFigure({
  kind: 'tab',
  notes: [
    { string: 3, fret: 5, duration: 'q' },
    { string: 3, fret: 7, duration: 'e', legato: 'hammer' },
    { string: 3, fret: 5, duration: 'e', legato: 'pull' },
    { string: 2, fret: 5, duration: 'q' },
    { string: 2, fret: 8, duration: 'q', legato: 'slide' },
    { string: 3, fret: 7, duration: 'h', bend: 2, release: true, vibrato: true },
    { rest: true, duration: 'q' },
    { string: 1, fret: 5, duration: 'q', slideIn: 'above', slideOut: 'down' },
  ],
});

describe('tab technique marks', () => {
  it('draws H and P over hammer-ons and pull-offs, a line for a slide, an arrow with its size for a bend', () => {
    const marks = tabMarks(tab.notes);
    expect(marks[0]).toBeNull();
    expect(marks[1]?.legato).toEqual({ from: 0, kind: 'hammer', label: 'H', rising: true });
    expect(marks[2]?.legato).toEqual({ from: 1, kind: 'pull', label: 'P', rising: false });
    expect(marks[4]?.legato).toEqual({ from: 3, kind: 'slide', label: '', rising: true });
    expect(marks[5]?.bend).toEqual({ label: 'full', release: true });
    expect(marks[5]?.vibrato).toBe(true);
    expect(marks[6]).toBeNull();
    expect(marks[7]).toMatchObject({ slideIn: 'above', slideOut: 'down', bend: null, legato: null });
    expect(marksNeedHeadroom(marks)).toBe(true);
    expect(marksNeedHeadroom(tabMarks([{ rest: false, string: 1, fret: 3, technique: { slideIn: 'below' } }]))).toBe(false);
  });

  it('prints bend sizes the way tab does and says them in words', () => {
    expect([0.5, 1, 1.5, 2, 2.5, 3].map(bendLabel)).toEqual(['¼', '½', '¾', 'full', '1¼', '1½']);
    expect(bendWords(2)).toBe('a whole step');
    expect(bendWords(1)).toBe('a half step');
  });

  it('reads each note with its techniques for a screen reader', () => {
    expect(tab.notes.map(tabNoteWords)).toEqual([
      'string 3 fret 5',
      'string 3 fret 7, hammered on',
      'string 3 fret 5, pulled off',
      'string 2 fret 5',
      'string 2 fret 8, slid to',
      'string 3 fret 7, bent up a whole step and released, with vibrato',
      'rest',
      'string 1 fret 5, slid into from above, sliding off down',
    ]);
  });
});

describe('tab note spacing', () => {
  it('gives two eighths room for a P between them, and longer notes more room without crushing short ones', () => {
    const { xs, end } = tabNoteXs([{ ticks: 960 }, { ticks: 480 }, { ticks: 480 }, { ticks: 3840 }, { ticks: 960 }], { start: 46, step: 34, tail: 44 });
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(gaps[0]).toBeCloseTo(34, 5); // a quarter: one step
    expect(gaps[1]).toBeCloseTo(25.5, 5); // an eighth: the minimum (0.75 step), not a crushed half step
    expect(gaps[3]).toBeCloseTo(68, 5); // a whole note: two steps, not four
    expect(end).toBeCloseTo(xs[4] + 44, 5);
  });
});

describe('lesson sounds reach the engine with their techniques', () => {
  it('maps a tab note to the pluck options of the audio engine', () => {
    const plan = soundPlan({ kind: 'tab', notes: tab.notes.map((n) => (n.rest ? { rest: true as const, duration: n.duration as 'q' } : { string: n.string!, fret: n.fret!, duration: n.duration as 'q', ...(n.technique ?? {}) })) });
    const opts = plan.events.map(techniqueOptions);
    expect(opts[0]).toEqual({});
    expect(opts[1]).toEqual({ legato: 'hammer' });
    expect(opts[5]).toEqual({ bend: { amount: 2, release: true }, vibrato: true });
    expect(opts[6]).toEqual({ slideIn: 'above', slideOut: 'down' });
    expect(techniqueOptions({ at: 0, type: 'pluck', midi: [60], duration: 1, technique: { bend: 1 } })).toEqual({ bend: 1 });
  });

  it('turns the plucks of a plan into the line the engine plays over a held chord', () => {
    const plan = soundPlan({ kind: 'notes', notes: ['A3', 'C4'], over: { chord: 'Am' } });
    expect(planLine(plan, 'nylon')).toEqual([
      { midi: 57, at: 0, duration: expect.any(Number), string: undefined, tone: 'nylon' },
      { midi: 60, at: expect.any(Number), duration: expect.any(Number), string: undefined, tone: 'nylon' },
    ]);
  });

  it('a slowed sound keeps its drone and held chord', () => {
    const plan = soundPlan({ kind: 'scale', tonic: 'D3', scale: 'dorian', drone: { root: 'D2' } });
    const slow = stretchPlan(plan, 1.5);
    expect(slow.drone).toEqual(plan.drone);
    expect(slow.duration).toBeCloseTo(plan.duration * 1.5, 5);
    const over = soundPlan({ kind: 'notes', notes: ['A3', 'C4'], over: { chord: 'Am' } });
    expect(stretchPlan(over, 1.5).hold).toEqual(over.hold);
  });
});
