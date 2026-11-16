import { describe, expect, it } from 'vitest';
import { mergeEntry, mergeJson, planDataImport, planDataSync } from './storage-merge';
import { entrySum, type DataEntry, type DataSet } from './storage-scope';

const entry = (value: unknown, at: number): DataEntry => ({ at, value });
const journal = (ids: string[], at = 1) => ids.map((id, i) => ({ id, endedAt: at + i, title: `Session ${id}` }));

describe('mergeEntry', () => {
  it('joins lists of things with an id: everything from both, the later copy of an item both have', () => {
    const local = entry({ v: 1, journal: journal(['a', 'b', 'c']), routines: [{ id: 'r1', name: 'Old name', updatedAt: 10 }], weeklyGoalMin: 60 }, 100);
    const file = entry({ v: 1, journal: journal(['c', 'd']), routines: [{ id: 'r1', name: 'New name', updatedAt: 20 }], weeklyGoalMin: 90 }, 50);
    const merged = mergeEntry('practice.data', local, file).value as { journal: Array<{ id: string }>; routines: Array<{ name: string }>; weeklyGoalMin: number };
    expect(merged.journal.map((e) => e.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(merged.routines).toEqual([{ id: 'r1', name: 'New name', updatedAt: 20 }]);
    // A plain field comes from the side that changed last: this device (100 > 50).
    expect(merged.weeklyGoalMin).toBe(60);
  });

  it('takes a setting whole from the side that changed it last; a tie keeps this device', () => {
    expect(mergeEntry('metronome.settings', entry({ bpm: 80, beats: 4 }, 10), entry({ bpm: 120, beats: 3 }, 20)).value).toEqual({ bpm: 120, beats: 3 });
    expect(mergeEntry('metronome.settings', entry({ bpm: 80 }, 30), entry({ bpm: 120 }, 20)).value).toEqual({ bpm: 80 });
    expect(mergeEntry('metronome.settings', entry({ bpm: 80 }, 0), entry({ bpm: 120 }, 0)).value).toEqual({ bpm: 80 });
  });

  it('settles a tie the same way on every device when asked to', () => {
    const a = entry({ bpm: 80 }, 5);
    const b = entry({ bpm: 120 }, 5);
    expect(mergeEntry('metronome.settings', a, b, 'stable')).toEqual(mergeEntry('metronome.settings', b, a, 'stable'));
  });

  it('joins lists of objects without ids by their content', () => {
    const merged = mergeJson([{ code: 's-s-', name: 'Mine' }], [{ code: 's-s-', name: 'Mine' }, { code: 'ss--', name: 'Other' }], true) as unknown[];
    expect(merged).toHaveLength(2);
  });

  it('keeps the best of both arcade records', () => {
    const level = (stars: number, best: number, plays: number, at: number) => ({ stars, best, plays, at });
    const local = entry({ v: 1, focus: { tonic: 'A' }, levels: { 'fret-rush': { am: { '1': level(3, 900, 4, 10), '2': level(1, 300, 1, 11) } } }, bests: { 'fret-rush': { score: 900, at: 10 } }, daily: { date: '2026-11-15', score: 50, stars: 1, done: true }, dailyBest: 500 }, 100);
    const file = entry({ v: 1, focus: { tonic: 'E' }, levels: { 'fret-rush': { am: { '2': level(2, 250, 3, 20), '3': level(1, 100, 1, 21) } }, 'note-hunt': { modes: { '1': level(1, 10, 1, 5) } } }, bests: { 'fret-rush': { score: 950, at: 20 } }, daily: { date: '2026-11-16', score: 20, stars: 0, done: false }, dailyBest: 400 }, 50);
    const merged = mergeEntry('arcade', local, file).value as Record<string, any>;
    expect(merged.levels['fret-rush'].am).toEqual({ '1': level(3, 900, 4, 10), '2': level(2, 300, 3, 20), '3': level(1, 100, 1, 21) });
    expect(merged.levels['note-hunt'].modes['1']).toEqual(level(1, 10, 1, 5));
    expect(merged.bests['fret-rush'].score).toBe(950);
    expect(merged.daily.date).toBe('2026-11-16');
    expect(merged.dailyBest).toBe(500);
    expect(merged.focus).toEqual({ tonic: 'A' }); // this device changed last
  });

  it('keeps each calibration measurement from the side that measured it last', () => {
    const local = entry({ v: 1, tapMs: 40, tapAt: 100, micMs: null, micAt: null, offered: true, micOffered: false, bleed: null }, 100);
    const file = entry({ v: 1, tapMs: 70, tapAt: 50, micMs: 180, micAt: 60, offered: false, micOffered: true, bleed: { loopMs: 200, db: -30 } }, 60);
    expect(mergeEntry('rhythm.calibration', local, file).value).toEqual({ v: 1, tapMs: 40, tapAt: 100, micMs: 180, micAt: 60, offered: true, micOffered: true, bleed: { loopMs: 200, db: -30 } });
  });

  it('never throws on odd values: text that is not JSON follows the newer side', () => {
    expect(mergeEntry('x.notes', { at: 1, raw: 'mine' }, { at: 2, raw: 'theirs' })).toEqual({ at: 2, raw: 'theirs' });
    expect(mergeEntry('arcade', entry('broken', 1), entry({ v: 1 }, 2)).value).toEqual({ v: 1 });
  });

  it('takes a draft or a setting whole even when it holds lists: a plan is never stitched together from two', () => {
    // The progression in the builder: I V I V here, vi IV in the file. Joining would give I V vi IV.
    const here = entry({ tonic: 'G', slots: [{ token: 'I', length: 1 }, { token: 'V', length: 1 }, { token: 'I', length: 1 }, { token: 'V', length: 1 }] }, 10);
    const file = entry({ tonic: 'C', slots: [{ token: 'vi', length: 1 }, { token: 'IV', length: 1 }] }, 5);
    expect(mergeEntry('progressions.draft', here, file)).toEqual(here);
    expect(mergeEntry('progressions.draft', file, here)).toEqual(here);
    // Today's practice plan (a setting): blocks of two different plans must not be joined.
    const plan = entry({ day: '2026-11-16', minutes: 20, blocks: [{ id: 'a1', minutes: 10 }, { id: 'a2', minutes: 10 }] }, 10);
    const otherPlan = entry({ day: '2026-11-10', minutes: 15, blocks: [{ id: 'b1', minutes: 15 }] }, 20);
    expect(mergeEntry('practice.draft', plan, otherPlan)).toEqual(otherPlan);
    // A new feature's key nobody listed counts as a setting, so it is taken whole too.
    expect(mergeEntry('newfeature.layout', entry({ panes: [{ id: 'x' }] }, 30), entry({ panes: [{ id: 'y' }] }, 20)).value).toEqual({ panes: [{ id: 'x' }] });
  });

  it('a damaged copy of a record never takes the place of a good one, however recent it says it is', () => {
    const good = entry({ v: 1, journal: journal(['a', 'b']), routines: [], goals: [] }, 10);
    for (const bad of [entry({ v: 1, journal: 'oops', routines: [], goals: [] }, 99), entry('garbage', 99), entry(null, 99), { at: 99, raw: 'not json' }]) {
      const merged = mergeEntry('practice.data', good, bad).value as { journal: Array<{ id: string }> };
      expect(merged.journal.map((e) => e.id)).toEqual(['a', 'b']);
      expect((mergeEntry('practice.data', bad, good).value as typeof merged).journal.map((e) => e.id)).toEqual(['a', 'b']);
    }
    const records = entry({ v: 1, levels: { g: { s: { '1': { stars: 3, best: 900, plays: 1, at: 1 } } } } }, 10);
    expect(mergeEntry('arcade', records, entry(null, 99))).toEqual({ ...records, at: 99 });
    expect(mergeEntry('progressions.saved', entry([{ id: 'my-1', name: 'Mine' }], 10), entry({}, 99)).value).toEqual([{ id: 'my-1', name: 'Mine' }]);
  });

  it('an item in a list that is not an object is dropped instead of spoiling the whole list', () => {
    const merged = mergeEntry('progressions.saved', entry([{ id: 'my-1', name: 'Mine' }], 10), entry([null, 7, { id: 'my-2', name: 'Theirs' }], 99)).value as Array<{ id: string }>;
    expect(merged.map((s) => s.id).sort()).toEqual(['my-1', 'my-2']);
    const practice = mergeEntry('practice.data', entry({ journal: journal(['a']) }, 10), entry({ journal: [...journal(['b']), 42, 'x'] }, 99)).value as { journal: Array<{ id: string }> };
    expect(practice.journal.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });
});

describe('planDataImport', () => {
  const local: DataSet = { 'practice.data': entry({ journal: journal(['a', 'b']) }, 10), 'chords.dots': entry('fingers', 10), 'tuner.tunings': entry([{ id: 't1' }], 10) };
  const file: DataSet = { 'practice.data': entry({ journal: journal(['b', 'c', 'd']) }, 5), 'chords.dots': entry('notes', 20), arcade: entry({ v: 1 }, 5) };

  it('merge: keys only one side has are kept, shared ones merged, nothing removed', () => {
    const plan = planDataImport(local, file, 'merge');
    expect(Object.keys(plan.result).sort()).toEqual(['arcade', 'chords.dots', 'practice.data', 'tuner.tunings']);
    expect((plan.result['practice.data'].value as { journal: unknown[] }).journal).toHaveLength(4);
    expect(plan.result['chords.dots'].value).toBe('notes');
    expect(plan.remove).toEqual([]);
    expect(plan.write).toEqual(['arcade', 'chords.dots', 'practice.data']);
  });

  it('replace: exactly the file, so what only this device had goes', () => {
    const plan = planDataImport(local, file, 'replace');
    expect(plan.result).toEqual(file);
    expect(plan.remove).toEqual(['tuner.tunings']);
  });

  it('only touches the keys in scope', () => {
    const plan = planDataImport(local, file, 'replace', (key) => key !== 'tuner.tunings');
    expect(plan.remove).toEqual([]);
    expect(plan.result).not.toHaveProperty('tuner.tunings');
  });

  it('replace keeps what this device has of a key the file holds damaged (`keep`), instead of removing it', () => {
    const { 'practice.data': _damaged, ...rest } = file;
    const plan = planDataImport(local, rest, 'replace', () => true, ['practice.data']);
    expect(plan.result['practice.data']).toEqual(local['practice.data']);
    expect(plan.remove).toEqual(['tuner.tunings']);
    expect(plan.write).not.toContain('practice.data');
  });
});

describe('planDataSync: three-way against what both had when they last agreed', () => {
  const base = (set: DataSet): Record<string, string> => Object.fromEntries(Object.entries(set).map(([k, e]) => [k, entrySum(e)]));
  const agreed: DataSet = {
    'practice.data': entry({ journal: journal(['a', 'b']) }, 10),
    'metronome.settings': entry({ bpm: 80 }, 10),
    'progressions.saved': entry([{ id: 'my-one', updatedAt: 1 }], 10),
  };

  it('a change made on one side only is taken from that side, a deletion too', () => {
    const local = { ...agreed, 'metronome.settings': entry({ bpm: 100 }, 20) };
    const { 'progressions.saved': _gone, ...remote } = agreed;
    const plan = planDataSync(local, remote, base(agreed), 'merge');
    expect(plan.result['metronome.settings'].value).toEqual({ bpm: 100 });
    expect(plan.remove).toEqual(['progressions.saved']);
    expect(plan.write).toEqual([]);
  });

  it('a key both changed is merged: both journals kept, the newer setting wins', () => {
    const local = { ...agreed, 'practice.data': entry({ journal: journal(['a', 'b', 'phone']) }, 30), 'metronome.settings': entry({ bpm: 100 }, 30) };
    const remote = { ...agreed, 'practice.data': entry({ journal: journal(['a', 'b', 'laptop']) }, 20), 'metronome.settings': entry({ bpm: 70 }, 40) };
    const plan = planDataSync(local, remote, base(agreed), 'merge');
    expect((plan.result['practice.data'].value as { journal: Array<{ id: string }> }).journal.map((e) => e.id).sort()).toEqual(['a', 'b', 'laptop', 'phone']);
    expect(plan.result['metronome.settings'].value).toEqual({ bpm: 70 });
  });

  it('deleted on one side and changed on the other: the change is kept', () => {
    const local = { ...agreed, 'metronome.settings': entry({ bpm: 120 }, 30) };
    const { 'metronome.settings': _gone, ...remote } = agreed;
    expect(planDataSync(local, remote, base(agreed), 'merge').result['metronome.settings'].value).toEqual({ bpm: 120 });
  });

  it('a draft both sides changed is the newer one, not a mix of both', () => {
    const was: DataSet = { 'progressions.draft': entry({ slots: [{ token: 'I', length: 1 }] }, 10) };
    const local: DataSet = { 'progressions.draft': entry({ slots: [{ token: 'I', length: 1 }, { token: 'I', length: 1 }] }, 20) };
    const remote: DataSet = { 'progressions.draft': entry({ slots: [{ token: 'ii', length: 1 }] }, 30) };
    expect(planDataSync(local, remote, base(was), 'merge').result['progressions.draft']).toEqual(remote['progressions.draft']);
  });

  it('without a base (the first sync) everything from both sides is kept', () => {
    const local: DataSet = { 'chords.dots': entry('fingers', 5) };
    const remote: DataSet = { 'tuner.tunings': entry([{ id: 't' }], 5) };
    expect(Object.keys(planDataSync(local, remote, null, 'merge').result).sort()).toEqual(['chords.dots', 'tuner.tunings']);
  });

  it('arcade records are merged even when only the other side changed, so a stale copy never lowers a best', () => {
    const level = (best: number) => ({ stars: 1, best, plays: 1, at: 1 });
    const was: DataSet = { arcade: entry({ levels: { g: { s: { '1': level(500) } } } }, 10) };
    const remote: DataSet = { arcade: entry({ levels: { g: { s: { '1': level(200), '2': level(50) } } } }, 20) };
    const plan = planDataSync(was, remote, base(was), 'merge');
    expect((plan.result.arcade.value as any).levels.g.s).toEqual({ '1': level(500), '2': level(50) });
  });

  it('replace (a reset elsewhere) takes the cloud copy and drops what was synced before, but keeps what never was', () => {
    const local = { ...agreed, 'chords.dots': entry('notes', 50) };
    const plan = planDataSync(local, {}, base(agreed), 'replace');
    expect(Object.keys(plan.result)).toEqual(['chords.dots']);
    expect(plan.remove.sort()).toEqual(['metronome.settings', 'practice.data', 'progressions.saved']);
  });
});
