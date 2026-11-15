import { describe, expect, it } from 'vitest';
import { parseSixTab } from '@/core/song';
import type { SongListing } from '@/core/library';
import { bandLabel, bandTone, featureItems, lengthLabel, originLine, pasteHint, sortedWarnings, SIXTAB_TEMPLATE, tempoLabel, warningLine, withoutRhythmNote } from './format';

function mine(over: Partial<SongListing>): SongListing {
  return { id: 'my-x-0000', source: 'mine', title: 'X', level: 2, levelSource: 'estimated', tags: [], skills: [], teaches: [], addedAt: 0, updatedAt: 0, ...over };
}

describe('lengths and levels', () => {
  it('says lengths short and spoken', () => {
    expect(lengthLabel(13.3)).toEqual({ short: '0:13', spoken: '13 seconds' });
    expect(lengthLabel(60)).toEqual({ short: '1:00', spoken: '1 minute' });
    expect(lengthLabel(121)).toEqual({ short: '2:01', spoken: '2 minutes 1 second' });
    expect(lengthLabel(0)).toEqual({ short: '0:00', spoken: '0 seconds' });
  });

  it('says the tempo as the beat is counted (dotted quarters in 6/8, 9/8, 12/8)', () => {
    expect(tempoLabel(72, '4/4').short).toBe('72 BPM');
    expect(tempoLabel(84, '3/4').short).toBe('84 BPM');
    expect(tempoLabel(81, '6/8')).toEqual({ short: '\u2669. = 54', spoken: '54 dotted-quarter beats per minute' });
    expect(tempoLabel(90, '12/8').short).toBe('\u2669. = 60');
    expect(tempoLabel(120, '3/8').short).toBe('120 BPM');
  });

  it('names the band of a level', () => {
    expect([1, 3, 4, 7, 8, 10].map(bandLabel)).toEqual(['Beginner', 'Beginner', 'Intermediate', 'Intermediate', 'Expert', 'Expert']);
    expect([2, 5, 9].map(bandTone)).toEqual(['ok', 'info', 'streak']);
  });
});

describe('features', () => {
  it('lists what a song has, in a fixed order', () => {
    const s = { hasTab: true, hasChords: true, hasLyrics: true, hasStrumming: false } as SongListing['summary'];
    expect(featureItems(s).map((f) => f.label)).toEqual(['Tab', 'Chords', 'Lyrics']);
    expect(featureItems(null)).toEqual([]);
  });
});

describe('origin', () => {
  it('says where one of the learner’s songs came from', () => {
    expect(originLine(mine({ imported: { origin: { kind: 'import', format: 'guitar-pro', fileName: 'riff.gp' }, warnings: [] } }))).toBe('Imported from riff.gp (Guitar Pro)');
    expect(originLine(mine({ imported: { origin: { kind: 'paste', format: 'chordpro' }, warnings: [] } }))).toBe('Pasted ChordPro');
    expect(originLine(mine({ imported: { origin: { kind: 'paste', format: 'ascii-tab' }, warnings: [] } }))).toBe('Pasted text tab');
    expect(originLine(mine({ imported: { origin: { kind: 'typed', format: 'sixtab' }, warnings: [] } }))).toBe('Typed in SixTab');
    expect(originLine(mine({ imported: { origin: { kind: 'duplicate', from: 'hot-cross-buns' }, warnings: [] } }), () => 'Hot Cross Buns')).toBe('Your copy of Hot Cross Buns');
    expect(originLine(mine({}))).toBe('One of your songs');
    expect(originLine({ ...mine({}), source: 'built-in' })).toBeNull();
  });
});

describe('importer warnings', () => {
  it('reads as one line each with where it is', () => {
    expect(warningLine({ message: 'Rhythm estimated.', bar: 2 })).toBe('Bar 3: Rhythm estimated.');
    expect(warningLine({ message: 'Ignored a comment.', line: 12 })).toBe('Line 12: Ignored a comment.');
    expect(warningLine({ message: 'Tuning guessed.' })).toBe('Tuning guessed.');
  });

  it('drops the rhythm note when the rhythm callout says it already', () => {
    const w = [{ message: 'Rhythm was estimated from the spacing of the tab and may be wrong.' }, { message: 'Tuning guessed.' }];
    expect(withoutRhythmNote(w, true).map((x) => x.message)).toEqual(['Tuning guessed.']);
    expect(withoutRhythmNote(w, false)).toHaveLength(2);
  });

  it('puts the least certain first and merges repeats', () => {
    const out = sortedWarnings([
      { message: 'A', confidence: 0.9 },
      { message: 'B', confidence: 0.4 },
      { message: 'A', confidence: 0.8 },
    ]);
    expect(out).toEqual([
      { text: 'B', count: 1, unsure: true },
      { text: 'A', count: 2, unsure: false },
    ]);
  });
});

describe('paste', () => {
  it('says what pasted text looks like', () => {
    expect(pasteHint('').ok).toBe(false);
    expect(pasteHint('hello there').ok).toBe(false);
    expect(pasteHint('{title: X}\n[G]Words [C]here')).toEqual({ ok: true, text: 'Looks like ChordPro.' });
    expect(pasteHint(SIXTAB_TEMPLATE)).toEqual({ ok: true, text: 'Looks like SixTab.' });
    expect(pasteHint('e|---0---|\nB|---1---|\nG|---0---|\nD|---2---|\nA|---3---|\nE|-------|').text).toBe('Looks like text tab.');
  });

  it('offers a SixTab template that is a valid song', () => {
    expect(parseSixTab(SIXTAB_TEMPLATE).errors).toEqual([]);
  });
});
