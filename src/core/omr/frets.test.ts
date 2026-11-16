import { describe, expect, it } from 'vitest';
import { fretOnNeck, fretsInDigits, isOnNeck } from './frets';
import { TAB_TUNINGS, tabTuningFor } from './types';

describe('frets on the neck', () => {
  it('leaves a fret the neck has alone', () => {
    expect(fretOnNeck(0)).toBeNull();
    expect(fretOnNeck(24)).toBeNull();
    expect(isOnNeck(25)).toBe(false);
    expect(isOnNeck(-1)).toBe(false);
    expect(isOnNeck(2.5)).toBe(false);
  });
  it('reads the digits of a number past the neck one or two at a time, longer first, from the left', () => {
    expect(fretsInDigits('92')).toEqual([9, 2]);
    expect(fretsInDigits('121')).toEqual([12, 21, 1, 2]);
    expect(fretsInDigits('305')).toEqual([3, 0, 5]);
    expect(fretsInDigits('77')).toEqual([7]);
  });
  it('puts it on the neck as a reading of its digits, with the others offered and an issue saying what was read', () => {
    expect(fretOnNeck(92)).toEqual({ fret: 9, alternatives: [2], readAs: 92, issue: { code: 'past-the-neck', message: 'Read as 92, which is past the last fret: probably two numbers side by side, or a smudge.' } });
    expect(fretOnNeck(121)?.fret).toBe(12);
    expect(fretOnNeck(121)?.alternatives).toEqual([21, 1, 2]);
    // A recognizer's own runner-up on the neck comes first.
    expect(fretOnNeck(29, [20, 31])).toMatchObject({ fret: 20, alternatives: [2, 9] });
  });
});

describe('tab tunings by line count', () => {
  it('gives four and five lines bass tunings, six standard guitar, seven a low B', () => {
    expect(tabTuningFor(4)).toEqual([28, 33, 38, 43]);
    expect(tabTuningFor(5)).toEqual([23, 28, 33, 38, 43]);
    expect(tabTuningFor(6)).toEqual([40, 45, 50, 55, 59, 64]);
    expect(tabTuningFor(7)).toEqual([35, 40, 45, 50, 55, 59, 64]);
    expect(tabTuningFor(3)).toEqual([40, 45, 50, 55, 59, 64]);
    expect(TAB_TUNINGS[4].bass && TAB_TUNINGS[5].bass && !TAB_TUNINGS[6].bass).toBe(true);
    // A copy every time: a caller may change it.
    const t = tabTuningFor(6);
    t[0] = 38;
    expect(tabTuningFor(6)[0]).toBe(40);
  });
});
