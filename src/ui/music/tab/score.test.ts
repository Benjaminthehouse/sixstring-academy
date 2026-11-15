import { describe, expect, it } from 'vitest';
import { AMAZING_GRACE, sixTab } from '@/core/song';
import { buildTabModel } from './model';
import { buildScore, columnReach, regionMetrics, scoreSpacing, writtenStep } from './score';

const score = (text: string) => {
  const model = buildTabModel(sixTab(text));
  return { model, score: buildScore(model) };
};

describe('buildScore', () => {
  it('spells notes in the key and prints only the accidentals the signature does not give', () => {
    // G major: F# needs nothing, F natural needs a natural; D major's C# is spelled C#, not Db.
    const { score: g } = score('title: T\nkey: G\n\n| q 1:2 1:1 1:2 1:3 |\n');
    expect(g.measures[0].fifths).toBe(1);
    expect(g.measures[0].columns.map((c) => c.keys[0])).toEqual(['F#4', 'F4', 'F#4', 'G4']);
    expect(g.measures[0].columns.map((c) => c.accidentals[0])).toEqual([null, 'n', '#', null]);
    const { score: f } = score('title: T\nkey: F\n\n| q 3:3 2:0 3:3 2:0 |\n');
    expect(f.measures[0].columns[0].keys[0]).toBe('Bb3');
    expect(f.measures[0].columns[0].accidentals[0]).toBeNull();
  });

  it('carries an alteration to the end of the bar and drops it at the barline', () => {
    // G major: F natural, held through the bar; F# needs its sharp back; the next bar starts over.
    const { score: g } = score('title: T\nkey: G\n\n| q 1:2 1:1 1:1 1:2 | q 1:1 h r q r |\n');
    expect(g.measures[0].columns.map((x) => x.accidentals[0])).toEqual([null, 'n', null, '#']);
    expect(g.measures[1].columns[0].accidentals[0]).toBe('n');
    // A different letter needs no natural: D flat then C in C major.
    const { score: c } = score('title: T\nkey: C\n\n| q 2:2 2:2 2:1 2:2 |\n');
    expect(c.measures[0].columns.map((x) => x.keys[0])).toEqual(['Db4', 'Db4', 'C4', 'Db4']);
    expect(c.measures[0].columns.map((x) => x.accidentals[0])).toEqual(['b', null, null, null]);
  });

  it('keeps ties and does not re-mark a tied note', () => {
    const { score: s } = score('title: T\nkey: C\n\n| h 2:2 2:- |\n');
    expect(s.measures[0].columns[1].tiedFrom).toEqual([true]);
    expect(s.measures[0].columns[1].accidentals).toEqual([null]);
  });

  it('writes guitar pitches an octave up (treble clef 8vb)', () => {
    expect(writtenStep('E2')).toBe(writtenStep('E3') - 7);
    expect(writtenStep('E4')).toBe(37); // sounding E4 is written on the top space E5
    const { score: s } = score('title: T\n\n| q 6:0 1:0 r r |\n');
    expect(s.measures[0].columns[0].steps[0]).toBe(writtenStep('E2'));
    expect(s.measures[0].columns[1].rest).toBe(false);
    expect(s.measures[0].columns[2].rest).toBe(true);
  });

  it('makes the staff region taller for notes far above or below it', () => {
    const low = score('title: T\n\n| q 3:0 3:2 2:0 2:1 |\n');
    const high = score('title: T\n\n| q 1:12 1:15 1:17 1:19 |\n');
    expect(regionMetrics(high.score, [0]).height).toBeGreaterThan(regionMetrics(low.score, [0]).height);
    expect(columnReach(high.score.measures[0].columns[3]).top).toBeLessThan(0);
  });

  it('gives the layout room for accidentals and the key signature', () => {
    const { model, score: s } = score(AMAZING_GRACE);
    const spacing = scoreSpacing(s, model);
    expect(spacing.headerWidth(0)).toBeGreaterThan(scoreSpacing(buildScore(buildTabModel(sixTab('title: T\n\n| w 3:0 |\n'))), buildTabModel(sixTab('title: T\n\n| w 3:0 |\n'))).headerWidth(0));
    const g = score('title: T\nkey: C\n\n| q 2:2 2:2 2:1 2:2 |\n');
    const sp = scoreSpacing(g.score, g.model);
    expect(sp.columnExtent(0, 0)!.left).toBeGreaterThan(sp.columnExtent(0, 1)!.left);
  });
});
