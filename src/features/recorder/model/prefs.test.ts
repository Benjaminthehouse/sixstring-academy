import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, describePrefs, sanitizePrefs } from './prefs';

describe('recorder settings', () => {
  it('starts with a count-in and no click', () => {
    expect(sanitizePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toMatchObject({ countIn: true, click: false });
  });

  it('repairs what is stored', () => {
    expect(sanitizePrefs({ countIn: false, click: true, bpm: 999, beats: 5 })).toEqual({ countIn: false, click: true, bpm: 240, beats: 4 });
    expect(sanitizePrefs({ bpm: 12.4, beats: 3 })).toMatchObject({ bpm: 40, beats: 3 });
    expect(sanitizePrefs({ bpm: Number.NaN, countIn: 'yes' })).toMatchObject({ bpm: 80, countIn: true });
    expect(sanitizePrefs('junk')).toEqual(DEFAULT_PREFS);
  });

  it('says in a few words how a take starts', () => {
    expect(describePrefs(DEFAULT_PREFS)).toBe('Count-in at 80 BPM');
    expect(describePrefs({ ...DEFAULT_PREFS, countIn: false })).toBe('Starts at once, no click');
    expect(describePrefs({ ...DEFAULT_PREFS, countIn: false, click: true, bpm: 100 })).toBe('Click at 100 BPM');
    expect(describePrefs({ ...DEFAULT_PREFS, click: true })).toBe('Count-in and click at 80 BPM');
  });
});
