import { describe, expect, it } from 'vitest';
import { EXERCISE_EXAMPLES, fillBank, grade } from '../../index';
import type { FillBlanksExercise, MatchPairsExercise } from '../../types';
import {
  EMPTY_MATCH, chordTap, emptyFill, fillBackspace, fillPlace, fillTapBlank, fillWords, findTap, isCheckable, matchComplete, matchTap,
  nudgePosition, orderBackspace, orderTap, pairOf, toggleAccidental, toggleChoice,
} from './drafts';

describe('choice drafts', () => {
  it('replaces a single pick and toggles multiple picks', () => {
    expect(toggleChoice([], 2, false)).toEqual([2]);
    expect(toggleChoice([2], 1, false)).toEqual([1]);
    expect(toggleChoice([2], 2, false)).toEqual([2]);
    expect(toggleChoice([2], 0, true)).toEqual([0, 2]);
    expect(toggleChoice([0, 2], 2, true)).toEqual([0]);
  });
});

describe('match drafts', () => {
  it('pairs a left with a right in either order, and undoes a pair when it is tapped', () => {
    let d = matchTap(EMPTY_MATCH, 'left', 1);
    expect(d.left).toBe(1);
    d = matchTap(d, 'right', 2);
    expect(d.pairs).toEqual([[1, 2]]);
    expect(d.left).toBeNull();
    d = matchTap(d, 'right', 0);
    d = matchTap(d, 'left', 0);
    expect(d.pairs).toEqual([[1, 2], [0, 0]]);
    expect(pairOf(d, 'right', 2)).toBe(0);
    d = matchTap(d, 'right', 2);
    expect(d.pairs).toEqual([[0, 0]]);
    expect(d.right).toBe(2);
    // Tapping the waiting item again puts it down.
    expect(matchTap(d, 'right', 2).right).toBeNull();
  });

  it('is complete once every left item is paired, and grades as the exercise expects', () => {
    const ex = EXERCISE_EXAMPLES['match-pairs'] as MatchPairsExercise;
    let d = EMPTY_MATCH;
    ex.pairs.forEach((_p, i) => {
      d = matchTap(matchTap(d, 'left', i), 'right', i);
    });
    expect(matchComplete(d, ex.pairs.length)).toBe(true);
    expect(grade(ex, { type: 'match-pairs', pairs: d.pairs }).correct).toBe(true);
  });
});

describe('order drafts', () => {
  it('places and takes back tiles', () => {
    let o = orderTap([], 3);
    o = orderTap(o, 1);
    expect(o).toEqual([3, 1]);
    expect(orderTap(o, 3)).toEqual([1]);
    expect(orderBackspace(o)).toEqual([3]);
  });
});

describe('fill drafts', () => {
  it('fills the focused blank, moves focus to the next empty one and gives words back', () => {
    let d = emptyFill(3);
    d = fillPlace(d, 4);
    expect(d).toEqual({ blanks: [4, null, null], focus: 1 });
    d = fillPlace(d, 2);
    d = fillPlace(d, 0);
    expect(d.blanks).toEqual([4, 2, 0]);
    d = fillTapBlank(d, 1);
    expect(d).toEqual({ blanks: [4, null, 0], focus: 1 });
    // A word already used moves to the focused blank.
    d = fillPlace(d, 4);
    expect(d.blanks).toEqual([null, 4, 0]);
    expect(fillBackspace({ blanks: [1, 2, null], focus: 2 }).blanks).toEqual([1, null, null]);
  });

  it('builds the words the grader expects', () => {
    const ex = EXERCISE_EXAMPLES['fill-blanks'] as FillBlanksExercise;
    const bank = fillBank(ex);
    let d = emptyFill(ex.blanks.length);
    for (const word of ex.blanks) d = fillPlace(d, bank.indexOf(word));
    const answer = { type: 'fill-blanks' as const, blanks: fillWords(d, bank) };
    expect(isCheckable(answer)).toBe(true);
    expect(grade(ex, answer).correct).toBe(true);
  });
});

describe('neck drafts', () => {
  it('keeps one pick in "one" mode and toggles in "all" mode', () => {
    expect(findTap([{ string: 1, fret: 0 }], { string: 2, fret: 5 }, 'one')).toEqual([{ string: 2, fret: 5 }]);
    expect(findTap([{ string: 2, fret: 5 }], { string: 2, fret: 5 }, 'one')).toEqual([]);
    expect(findTap([{ string: 1, fret: 0 }], { string: 2, fret: 5 }, 'all')).toHaveLength(2);
  });

  it('places fingers low to high and switches open strings to muted and back', () => {
    const open = [0, 0, 0, 0, 0, 0];
    expect(chordTap(open, 2, 1)).toEqual([0, 0, 0, 0, 1, 0]);
    expect(chordTap([0, 0, 0, 0, 1, 0], 2, 1)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(chordTap(open, 6, 0)).toEqual([null, 0, 0, 0, 0, 0]);
    expect(chordTap([null, 0, 0, 0, 0, 0], 6, 0)).toEqual([0, 0, 0, 0, 0, 0]);
    // Am, built tap by tap, is graded right.
    let f: Array<number | null> = open;
    f = chordTap(f, 6, 0);
    f = chordTap(f, 4, 2);
    f = chordTap(f, 3, 2);
    f = chordTap(f, 2, 1);
    expect(f).toEqual([null, 0, 2, 2, 1, 0]);
    expect(grade(EXERCISE_EXAMPLES['chord-build'], { type: 'chord-build', frets: f }).correct).toBe(true);
  });
});

describe('staff drafts', () => {
  it('toggles accidentals and nudges within the range', () => {
    expect(toggleAccidental({ position: 3, accidental: null }, 'sharp').accidental).toBe('sharp');
    expect(toggleAccidental({ position: 3, accidental: 'sharp' }, 'sharp').accidental).toBeNull();
    expect(nudgePosition({ position: null, accidental: null }, 1, [-2, 10])).toEqual({ position: 4, accidental: null });
    expect(nudgePosition({ position: 10, accidental: null }, 1, [-2, 10]).position).toBe(10);
  });
});

describe('isCheckable', () => {
  it('refuses empty answers', () => {
    expect(isCheckable(null)).toBe(false);
    expect(isCheckable({ type: 'choice', selected: [] })).toBe(false);
    expect(isCheckable({ type: 'type-answer', text: '  ' })).toBe(false);
    expect(isCheckable({ type: 'fill-blanks', blanks: ['C', null] })).toBe(false);
    expect(isCheckable({ type: 'chord-build', frets: [null, null, null, null, null, null] })).toBe(false);
    expect(isCheckable({ type: 'true-false', value: false })).toBe(true);
  });
});
