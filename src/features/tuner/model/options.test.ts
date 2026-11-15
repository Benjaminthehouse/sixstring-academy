import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, sanitizeOptions, sanitizeSavedTunings, toleranceCents } from './options';

describe('tuner options', () => {
  it('start simple: needle, standard tolerance, no hertz, guide not seen', () => {
    expect(DEFAULT_OPTIONS).toMatchObject({ tolerance: 'standard', display: 'needle', showHz: false, guideSeen: false, micNoteSeen: false });
    expect(toleranceCents('standard')).toBe(3);
    expect(toleranceCents('fine')).toBe(1);
  });

  it('survive damaged storage', () => {
    expect(sanitizeOptions(null)).toEqual(DEFAULT_OPTIONS);
    expect(sanitizeOptions('nonsense')).toEqual(DEFAULT_OPTIONS);
    expect(sanitizeOptions({ tolerance: 'wild', display: 7, showHz: 'yes', earVoice: null })).toEqual(DEFAULT_OPTIONS);
    expect(sanitizeOptions({ tolerance: 'fine', display: 'strobe', showHz: true, earVoice: 'pluck', earLoop: false, earOctaveUp: true, guideSeen: true, micNoteSeen: true })).toEqual({
      tolerance: 'fine', display: 'strobe', showHz: true, earVoice: 'pluck', earLoop: false, earOctaveUp: true, guideSeen: true, micNoteSeen: true,
    });
    // A partial object (an older version) keeps what it has.
    expect(sanitizeOptions({ guideSeen: true })).toEqual({ ...DEFAULT_OPTIONS, guideSeen: true });
  });
});

describe('saved tunings', () => {
  it('keeps well-formed entries and drops the rest', () => {
    const good = { id: 'custom-d2-g2-d3-g3-b3-e4', name: 'Low and slow', midi: [38, 43, 50, 55, 59, 64], instrument: 'guitar' };
    expect(sanitizeSavedTunings([good])).toEqual([good]);
    expect(sanitizeSavedTunings('x')).toEqual([]);
    expect(sanitizeSavedTunings([null, 3, { id: 'a' }, { id: 'a', name: 'b', midi: [40] }, { id: 'a', name: 'b', midi: [40, 45, 'x'] }, { id: 'a', name: 'b', midi: [1, 2, 3] }])).toEqual([]);
    expect(sanitizeSavedTunings([{ ...good, instrument: 'theremin', midi: [38.4, 43, 50] }])[0]).toMatchObject({ instrument: 'guitar', midi: [38, 43, 50] });
    expect(sanitizeSavedTunings(Array.from({ length: 40 }, (_, i) => ({ ...good, id: `custom-${i}` })))).toHaveLength(24);
  });
});
