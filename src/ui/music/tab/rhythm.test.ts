import { describe, expect, it } from 'vitest';
import type { NoteValue } from '@/core/song';
import { beamBoundaries, beamCount, beamGroups, beamSegments, bendText, tupletGroups, tupletMatchesBeam, writtenTicks, type RhythmEvent } from './rhythm';

const T44 = { numerator: 4, denominator: 4 };

/** Events from values played one after another (rests marked with `r`). */
function seq(...vals: Array<NoteValue | ['r', NoteValue]>): RhythmEvent[] {
  let at = 0;
  return vals.map((v) => {
    const rest = Array.isArray(v);
    const value = Array.isArray(v) ? v[1] : v;
    const e = { start: at, duration: writtenTicks(value), value, rest };
    at += e.duration;
    return e;
  });
}
const e8: NoteValue = { base: 8 };
const s16: NoteValue = { base: 16 };
const q: NoteValue = { base: 4 };
const e8dot: NoteValue = { base: 8, dots: 1 };
const t8: NoteValue = { base: 8, tuplet: { actual: 3, normal: 2 } };

describe('values', () => {
  it('counts beams and ticks', () => {
    expect(beamCount(q)).toBe(0);
    expect(beamCount(e8)).toBe(1);
    expect(beamCount(s16)).toBe(2);
    expect(beamCount({ base: 32 })).toBe(3);
    expect(beamCount(null)).toBe(0);
    expect(writtenTicks(e8dot)).toBe(720);
    expect(writtenTicks(t8)).toBe(320);
    expect(writtenTicks({ base: 4, dots: 2 })).toBe(1680);
  });
  it('writes bend amounts the way tab does', () => {
    expect(bendText(2)).toBe('full');
    expect(bendText(1)).toBe('½');
    expect(bendText(0.5)).toBe('¼');
    expect(bendText(3)).toBe('1½');
    expect(bendText(4)).toBe('2');
    expect(bendText(1.5)).toBe('¾');
  });
});

describe('beamBoundaries', () => {
  it('splits simple time at every beat and compound time at dotted quarters', () => {
    expect(beamBoundaries(T44, 3840)).toEqual([960, 1920, 2880]);
    expect(beamBoundaries({ numerator: 3, denominator: 4 }, 2880)).toEqual([960, 1920]);
    expect(beamBoundaries({ numerator: 6, denominator: 8 }, 2880)).toEqual([1440]);
    expect(beamBoundaries({ numerator: 12, denominator: 8 }, 5760)).toEqual([1440, 2880, 4320]);
  });
  it('groups odd eighth meters in twos with a closing three', () => {
    expect(beamBoundaries({ numerator: 7, denominator: 8 }, 3360)).toEqual([960, 1920]);
    expect(beamBoundaries({ numerator: 5, denominator: 8 }, 2400)).toEqual([960]);
  });
  it('aligns a pickup bar to the end of the bar', () => {
    // A pickup of one beat and a half in 4/4 starts on the "and" of beat 3.
    expect(beamBoundaries(T44, 1440)).toEqual([480]);
  });
});

describe('beamGroups', () => {
  it('joins a half bar of plain eighths in 4/4', () => {
    const ev = seq(e8, e8, e8, e8, e8, e8, e8, e8);
    expect(beamGroups(ev, T44, 3840)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]]);
  });
  it('beams sixteenths per beat and never across beats', () => {
    const ev = seq(s16, s16, s16, s16, s16, s16, s16, s16, q, q);
    expect(beamGroups(ev, T44, 3840)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]]);
  });
  it('does not join half bars of mixed values', () => {
    const ev = seq(e8, e8, s16, s16, e8, q, q);
    expect(beamGroups(ev, T44, 3840)).toEqual([[0, 1], [2, 3, 4]]);
  });
  it('breaks at rests and leaves single eighths flagged', () => {
    const ev = seq(e8, ['r', e8], e8, e8, q, e8, e8);
    expect(beamGroups(ev, T44, 3840)).toEqual([[2, 3], [5, 6]]);
  });
  it('beams a dotted eighth with its sixteenth', () => {
    const ev = seq(e8dot, s16, e8dot, s16, q, q);
    expect(beamGroups(ev, T44, 3840)).toEqual([[0, 1], [2, 3]]);
  });
  it('beams compound time in threes', () => {
    const ev = seq(e8, e8, e8, e8, e8, e8);
    expect(beamGroups(ev, { numerator: 6, denominator: 8 }, 2880)).toEqual([[0, 1, 2], [3, 4, 5]]);
  });
  it('beams triplets per beat', () => {
    const ev = seq(t8, t8, t8, t8, t8, t8, q, q);
    expect(beamGroups(ev, T44, 3840)).toEqual([[0, 1, 2], [3, 4, 5]]);
  });
  it('closes a group when a note runs over the beat (syncopation)', () => {
    const ev = seq(e8, q, e8, q, q);
    expect(beamGroups(ev, T44, 3840)).toEqual([]);
  });
});

describe('beamSegments', () => {
  it('draws a stub on the sixteenth after a dotted eighth, pointing back', () => {
    const ev = seq(e8dot, s16);
    expect(beamSegments([0, 1], ev)).toEqual([
      { level: 1, from: 0, to: 1 },
      { level: 2, from: 1, to: 1, stub: 'left' },
    ]);
  });
  it('draws a stub forward on a sixteenth that opens the group', () => {
    const ev = seq(s16, e8dot);
    expect(beamSegments([0, 1], ev)).toEqual([
      { level: 1, from: 0, to: 1 },
      { level: 2, from: 0, to: 0, stub: 'right' },
    ]);
  });
  it('runs a second beam over consecutive sixteenths only', () => {
    const ev = seq(e8, s16, s16);
    expect(beamSegments([0, 1, 2], ev)).toEqual([
      { level: 1, from: 0, to: 2 },
      { level: 2, from: 1, to: 2 },
    ]);
  });
});

describe('tupletGroups', () => {
  it('groups triplets in threes', () => {
    const ev = seq(t8, t8, t8, t8, t8, t8, q, q);
    const groups = tupletGroups(ev);
    expect(groups.map((g) => g.events)).toEqual([[0, 1, 2], [3, 4, 5]]);
    expect(groups[0]).toMatchObject({ actual: 3, normal: 2 });
    expect(tupletMatchesBeam(groups[0], beamGroups(ev, T44, 3840))).toBe(true);
  });
  it('groups a quarter and an eighth of a triplet', () => {
    const tq: NoteValue = { base: 4, tuplet: { actual: 3, normal: 2 } };
    const ev = seq(tq, t8, q, q, q);
    expect(tupletGroups(ev).map((g) => g.events)).toEqual([[0, 1]]);
  });
  it('marks an incomplete tuplet as partial', () => {
    const ev = seq(t8, t8, q);
    expect(tupletGroups(ev)[0].partial).toBe(true);
  });
});
