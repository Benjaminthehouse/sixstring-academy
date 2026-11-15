import { describe, expect, it } from 'vitest';
import { TUNINGS, STANDARD_TUNING, getTuning } from '@/core/guitar';
import { baseTuningFor, makeCustomTuning, resizeStrings, resolveTuning, retunePlan, stepWords, tuningFromSaved, tuningGroups, tuningMatches, type SavedTuning } from './catalog';

const ids = (query: string, saved: SavedTuning[] = []) => tuningGroups(query, saved).flatMap((g) => g.tunings.map((t) => t.id));

describe('tuningGroups', () => {
  it('offers every catalog tuning exactly once, standard first', () => {
    const all = ids('');
    expect([...all].sort()).toEqual(TUNINGS.map((t) => t.id).sort());
    expect(new Set(all).size).toBe(all.length);
    expect(all[0]).toBe('standard');
  });

  it('groups them the way a player looks for them', () => {
    const groups = tuningGroups('');
    expect(groups.map((g) => g.title)).toEqual(['Standard', 'Tuned down', 'Drop tunings', 'Open and modal', 'Other six-string tunings', 'Seven-string and baritone', 'Bass', 'Ukulele']);
    const open = groups.find((g) => g.id === 'open')!;
    expect(open.tunings.map((t) => t.id)).toContain('dadgad');
    expect(open.tunings.map((t) => t.id)).toContain('open-g');
    expect(groups.find((g) => g.id === 'bass')!.tunings.every((t) => t.instrument === 'bass')).toBe(true);
  });

  it('finds tunings by name, notes, alias, instrument and what they are for', () => {
    expect(ids('drop d')).toEqual(['drop-d', 'double-drop-d', 'bass-drop-d']);
    expect(ids('dadgad')).toEqual(['dadgad']);
    expect(ids('D A D G A D')).toEqual(['dadgad']);
    expect(ids('eadgbe')).toContain('standard');
    expect(ids('spanish')).toEqual(['open-g']);
    expect(ids('uke')).toContain('ukulele');
    expect(ids('bass').every((id) => id.startsWith('bass'))).toBe(true);
    expect(ids('seven')).toEqual(['standard-7', 'drop-a-7']);
    expect(ids('slide')).toEqual(expect.arrayContaining(['open-g', 'open-d']));
    expect(ids('E♭ A♭')).toContain('half-step-down');
    expect(ids('zzz')).toEqual([]);
  });

  it('a single letter does not match "guitar"', () => {
    expect(tuningMatches(getTuning('open-c')!, 'u')).toBe(false);
    expect(tuningMatches(getTuning('ukulele')!, 'u')).toBe(true);
  });

  it("puts the learner's own tunings first and lets them be searched", () => {
    const made = makeCustomTuning([38, 43, 50, 55, 59, 64], 'Low and slow', 'guitar')!;
    expect(made.saved).not.toBeNull();
    const groups = tuningGroups('', [made.saved!]);
    expect(groups[0]).toMatchObject({ id: 'yours', title: 'Your tunings' });
    expect(groups[0].tunings[0]).toMatchObject({ name: 'Low and slow', custom: true });
    expect(ids('slow', [made.saved!])).toEqual([made.saved!.id]);
  });
});

describe('custom tunings', () => {
  it('recognises a catalog tuning instead of saving a copy', () => {
    expect(makeCustomTuning([38, 45, 50, 55, 59, 64], 'my drop', 'guitar')).toEqual({ tuning: getTuning('drop-d'), saved: null });
  });

  it('builds a saveable tuning with an id the preferences accept', () => {
    const made = makeCustomTuning([37, 44, 49, 54, 58, 62.2], '', 'guitar')!;
    expect(made.saved!.midi).toEqual([37, 44, 49, 54, 58, 62]);
    expect(made.saved!.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(made.saved!.id.length).toBeLessThanOrEqual(40);
    expect(made.tuning.stringCount).toBe(6);
    // Eight strings with sharps is the longest id there can be.
    const long = makeCustomTuning([25, 30, 37, 42, 49, 54, 61, 66], '', 'guitar')!;
    expect(long.saved!.id.length).toBeLessThanOrEqual(40);
  });

  it('survives a reload: the saved entry rebuilds the same tuning', () => {
    const made = makeCustomTuning([36, 43, 48, 55, 59, 62], 'Wide C', 'guitar')!;
    const again = tuningFromSaved(JSON.parse(JSON.stringify(made.saved)) as SavedTuning)!;
    expect(again.id).toBe(made.tuning.id);
    expect(again.midi).toEqual(made.tuning.midi);
    expect(resolveTuning(made.saved!.id, [made.saved!]).name).toBe('Wide C');
  });

  it('refuses too few or too many strings and keeps notes in range', () => {
    expect(makeCustomTuning([40, 45], '', 'guitar')).toBeNull();
    expect(makeCustomTuning([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => 30 + n * 4), '', 'guitar')).toBeNull();
    const clamped = makeCustomTuning([0, 45, 50, 200], '', 'bass')!;
    expect(clamped.tuning.midi[0]).toBe(23);
    expect(clamped.tuning.midi[3]).toBe(84);
  });

  it('adds and removes strings at the low end', () => {
    expect(resizeStrings([40, 45, 50, 55, 59, 64], 7)).toEqual([35, 40, 45, 50, 55, 59, 64]);
    expect(resizeStrings([40, 45, 50, 55, 59, 64], 4)).toEqual([50, 55, 59, 64]);
    expect(resizeStrings([40, 45, 50], 99)).toHaveLength(8);
    expect(resizeStrings([40, 45, 50, 55], 1)).toHaveLength(3);
  });
});

describe('resolveTuning', () => {
  it('falls back to standard for anything unknown', () => {
    expect(resolveTuning('drop-d').id).toBe('drop-d');
    expect(resolveTuning('no-such-tuning')).toBe(STANDARD_TUNING);
    expect(resolveTuning(null)).toBe(STANDARD_TUNING);
    expect(resolveTuning('custom-gone', [{ id: 'custom-other', name: 'x', midi: [40, 45, 50], instrument: 'guitar' }])).toBe(STANDARD_TUNING);
  });
});

describe('retunePlan', () => {
  it('says how to reach drop D and DADGAD from standard', () => {
    const drop = retunePlan(getTuning('drop-d')!)!;
    expect(drop.from).toBe('Standard');
    expect(drop.lines.map((l) => l.text)).toEqual(['Lower string 6 from E to D: a whole step (2 frets).']);
    expect(drop.raises).toBe(false);
    const dadgad = retunePlan(getTuning('dadgad')!)!;
    expect(dadgad.lines.map((l) => [l.string, l.semitones])).toEqual([[6, -2], [2, -2], [1, -2]]);
    expect(dadgad.strings).toBe(6);
  });

  it('warns when strings go up', () => {
    const openE = retunePlan(getTuning('open-e')!)!;
    expect(openE.raises).toBe(true);
    expect(openE.lines.map((l) => l.text)).toEqual([
      'Raise string 5 from A to B: a whole step (2 frets).',
      'Raise string 4 from D to E: a whole step (2 frets).',
      'Raise string 3 from G to G♯: a half step (1 fret).',
    ]);
  });

  it('has nothing to say for the usual tuning, or one that needs other strings', () => {
    expect(retunePlan(STANDARD_TUNING)).toBeNull();
    expect(retunePlan(getTuning('bass')!)).toBeNull();
    expect(retunePlan(getTuning('ukulele')!)).toBeNull();
    // Nashville replaces four strings with thinner ones an octave up.
    expect(retunePlan(getTuning('nashville')!)).toBeNull();
  });

  it('starts from the right instrument', () => {
    expect(baseTuningFor(getTuning('drop-a-7')!)?.id).toBe('standard-7');
    expect(baseTuningFor(getTuning('bass-drop-d')!)?.id).toBe('bass');
    expect(baseTuningFor(getTuning('ukulele-low-g')!)?.id).toBe('ukulele');
    expect(retunePlan(getTuning('bass-drop-d')!)!.lines[0].text).toBe('Lower string 4 from E to D: a whole step (2 frets).');
    expect(retunePlan(getTuning('drop-a-7')!)!.from).toBe('Seven-string standard');
  });

  it('every plan is consistent with the two tunings it joins', () => {
    for (const tuning of TUNINGS) {
      const plan = retunePlan(tuning);
      const base = baseTuningFor(tuning);
      if (!plan || !base) continue;
      for (const line of plan.lines) {
        expect(tuning.midi[line.index] - base.midi[line.index], `${tuning.id} string ${line.string}`).toBe(line.semitones);
        expect(line.string).toBe(tuning.stringCount - line.index);
      }
      const changed = tuning.midi.filter((m, i) => m !== base.midi[i]).length;
      expect(plan.lines.length).toBe(changed);
    }
  });

  it('counts steps in words a beginner knows', () => {
    expect([1, -2, 3, 12].map(stepWords)).toEqual(['a half step (1 fret)', 'a whole step (2 frets)', '3 half steps (3 frets)', 'an octave (12 frets)']);
  });
});
