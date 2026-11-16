import { describe, expect, it } from 'vitest';
import { MAX_JOURNAL } from '@/features/practice/model/journal';
import { MAX_ROUTINES } from '@/features/practice/model/routines';
import {
  DATA_ITEMS,
  LEDGER_KEY,
  classifyKey,
  createLearnerData,
  entryFromText,
  entryText,
  isDamagedRecord,
  isRecordKey,
  isWholeRecord,
  memoryKv,
  sanitizeDataSet,
  syncsKey,
  type DataClass,
} from './storage-scope';

describe('classifyKey: everything is learner data unless a rule says otherwise', () => {
  // Every key the app stores today (grep useLocalState / readJSON / writeJSON / readRaw), with what it is.
  const INVENTORY: Array<[string, DataClass]> = [
    ['practice.data', 'learner'],
    ['practice.draft', 'learner'],
    ['arcade', 'learner'],
    ['rhythm.calibration', 'learner'],
    ['rhythm.patterns', 'learner'],
    ['rhythm.builder', 'learner'],
    ['rhythm.prefs', 'learner'],
    ['progressions.saved', 'learner'],
    ['progressions.draft', 'learner'],
    ['progressions.memory', 'learner'],
    ['progressions.jam', 'learner'],
    ['progressions.group', 'learner'],
    ['progressions.band', 'learner'],
    ['progressions.shapes', 'learner'],
    ['chords.trainer', 'learner'],
    ['chords.library', 'learner'],
    ['chords.dots', 'learner'],
    ['chords.allTones', 'learner'],
    ['scales.settings', 'learner'],
    ['scales.last', 'learner'],
    ['metronome.settings', 'learner'],
    ['metronome.presets', 'learner'],
    ['ear.settings', 'learner'],
    ['tuner.options', 'learner'],
    ['tuner.tunings', 'learner'],
    ['prefs.speech', 'learner'],
    ['fretboard.settings', 'learner'],
    ['technique.hand', 'learner'],
    ['technique.guide', 'learner'],
    ['technique.mic', 'learner'],
    ['technique.part.alternate-picking', 'learner'],
    ['technique.pair.chord-changes', 'learner'],
    ['reference.chordRoot', 'learner'],
    ['reference.scaleRoot', 'learner'],
    ['songs.view', 'learner'],
    ['camera.content', 'learner'],
    ['camera.guitar', 'learner'],
    ['camera.capo', 'learner'],
    ['camera.labels', 'learner'],
    ['camera.bassUp', 'learner'],
    ['camera.hands', 'learner'],
    ['camera.drill', 'learner'],
    ['camera.blockedOnce', 'device'],
    ['camera.capoAskedAt', 'device'],
    ['player.micNotice', 'device'],
    ['learn.conditions', 'device'],
    ['shell.nav-open', 'device'],
    ['kit.favourite-key', 'device'],
    ['arcade.test-seed', 'device'],
    ['sync.meta', 'device'],
    ['data.ledger', 'device'],
    ['data.undo', 'device'],
    ['__probe', 'device'],
    ['practice.session', 'session'],
    ['lesson-session.lesson', 'session'],
    ['player.session.greensleeves', 'session'],
    ['teachers.task', 'session'],
    ['shell.onboarding', 'session'],
    ['ai.anthropic-key', 'secret'],
    ['progress', 'progress'],
    ['progress.bak', 'progress'],
    ['progress.corrupt', 'progress'],
    ['library.v1.index', 'songs'],
    ['library.v1.song.my-tune-k3f9', 'songs'],
  ];

  it.each(INVENTORY)('%s is %s', (key, expected) => {
    expect(classifyKey(key)).toBe(expected);
  });

  it('puts a key no rule names (a feature added tomorrow) in the learner data, without anyone listing it', () => {
    expect(classifyKey('looper.takes')).toBe('learner');
    expect(syncsKey('looper.takes')).toBe(true);
  });

  it('keeps the AI key, device bookkeeping and sessions out of sync; the calibration is backed up but not synced', () => {
    expect(syncsKey('ai.anthropic-key')).toBe(false);
    expect(syncsKey('sync.meta')).toBe(false);
    expect(syncsKey('practice.session')).toBe(false);
    expect(syncsKey('progress')).toBe(false);
    expect(classifyKey('rhythm.calibration')).toBe('learner');
    expect(syncsKey('rhythm.calibration')).toBe(false);
    expect(syncsKey('practice.data')).toBe(true);
  });

  it('tells what the learner made from settings, and counts what is there', () => {
    expect(isRecordKey('practice.data')).toBe(true);
    expect(isRecordKey('arcade')).toBe(true);
    expect(isRecordKey('metronome.settings')).toBe(false);
    expect(isRecordKey('prefs.speech')).toBe(false);
    const count = (id: string, value: unknown) => DATA_ITEMS.find((item) => item.id === id)!.count(value);
    expect(count('journal', { journal: [{ id: 'a' }, { id: 'b' }] })).toBe(2);
    expect(count('routines', { routines: [{ id: 'a', builtIn: true }, { id: 'b' }] })).toBe(1);
    expect(count('arcade', { levels: { 'fret-rush': { 'a-minor-pentatonic': { '1': {}, '2': {} } }, 'note-hunt': { modes: { '1': {} } } } })).toBe(3);
    expect(count('calibration', { tapMs: 40, micMs: null })).toBe(1);
    expect(count('journal', 'damaged')).toBe(0);
    expect(count('presets', [{ id: 'x', builtIn: true }, { id: 'y' }])).toBe(1);
  });

  it('counts only real items, and never more than the feature keeps', () => {
    const count = (id: string, value: unknown) => DATA_ITEMS.find((item) => item.id === id)!.count(value);
    expect(count('progressions', [null, 7, { id: 'my-1' }])).toBe(1);
    expect(count('journal', { journal: [{ id: 'a' }, 'x', 3] })).toBe(1);
    // Two devices of 300 sessions merged: the journal keeps its newest 400, so a preview says 400.
    expect(count('journal', { journal: Array.from({ length: 600 }, (_, i) => ({ id: `e${i}` })) })).toBe(MAX_JOURNAL);
    expect(count('routines', { routines: Array.from({ length: 45 }, (_, i) => ({ id: `r${i}` })) })).toBe(MAX_ROUTINES);
    expect(DATA_ITEMS.find((item) => item.id === 'journal')?.max).toBe(MAX_JOURNAL);
    expect(DATA_ITEMS.find((item) => item.id === 'routines')?.max).toBe(MAX_ROUTINES);
  });

  it('tells a damaged record from a good one, and never calls a setting damaged', () => {
    const e = (value: unknown) => ({ at: 1, value });
    expect(isDamagedRecord('practice.data', e({ journal: [], routines: [], goals: [] }))).toBe(false);
    expect(isDamagedRecord('practice.data', e({ v: 1 }))).toBe(false);
    expect(isDamagedRecord('practice.data', e({ journal: 'oops' }))).toBe(true);
    expect(isDamagedRecord('practice.data', e(null))).toBe(true);
    expect(isDamagedRecord('practice.data', { at: 1, raw: 'not json' })).toBe(true);
    expect(isDamagedRecord('arcade', e([]))).toBe(true);
    expect(isDamagedRecord('progressions.saved', e({}))).toBe(true);
    expect(isDamagedRecord('progressions.saved', e([null, { id: 'my-1' }]))).toBe(false); // the bad item is dropped when merged
    expect(isDamagedRecord('progressions.saved', e([null, 7]))).toBe(true); // nothing in it can be read
    expect(isDamagedRecord('practice.data', e({ journal: ['x'] }))).toBe(true);
    expect(isDamagedRecord('metronome.settings', e('anything'))).toBe(false);
    expect(isDamagedRecord('ai.anthropic-key', { at: 1, raw: 'x' })).toBe(false);
    expect(isWholeRecord('progressions.draft')).toBe(true);
    expect(isWholeRecord('practice.data')).toBe(false);
  });

  it('every record the features keep has the shape the rule expects (checked against their own empty values)', async () => {
    const practice = await import('@/features/practice/model/store');
    const arcade = await import('@/features/arcade/core/records');
    const calibration = await import('@/features/rhythm/core/calibration');
    const builder = await import('@/features/progressions/model/builder');
    const e = (value: unknown) => ({ at: 1, value: JSON.parse(JSON.stringify(value)) as unknown });
    expect(isDamagedRecord('practice.data', e(practice.emptyPracticeData()))).toBe(false);
    expect(isDamagedRecord('arcade', e(arcade.sanitizeRecords(null)))).toBe(false);
    expect(isDamagedRecord('rhythm.calibration', e(calibration.normalizeCalibration(null)))).toBe(false);
    expect(isDamagedRecord('progressions.draft', e(builder.STARTER_DRAFT))).toBe(false);
    for (const key of ['progressions.saved', 'rhythm.patterns', 'metronome.presets', 'tuner.tunings']) expect(isDamagedRecord(key, e([]))).toBe(false);
  });
});

describe('entries', () => {
  it('keep JSON as a value and anything else as its exact text', () => {
    expect(entryFromText('{"a":1}', 5)).toEqual({ at: 5, value: { a: 1 } });
    expect(entryFromText('not json', 5)).toEqual({ at: 5, raw: 'not json' });
    expect(entryText({ at: 0, value: { a: 1 } })).toBe('{"a":1}');
    expect(entryText({ at: 0, raw: 'plain' })).toBe('plain');
  });

  it('a damaged or foreign entry is left out and named; the rest is kept', () => {
    const { data, skipped } = sanitizeDataSet({
      'practice.data': { at: 10, value: { v: 1 } },
      'ai.anthropic-key': { at: 1, raw: 'sk-ant-secret' },
      'sync.meta': { at: 1, value: {} },
      arcade: 'nonsense',
      'tuner.tunings': { at: 'yesterday', value: [] },
      'chords.dots': { at: 1 },
    });
    expect(data).toEqual({ 'practice.data': { at: 10, value: { v: 1 } }, 'tuner.tunings': { at: 0, value: [] } });
    expect(skipped.sort()).toEqual(['ai.anthropic-key', 'arcade', 'chords.dots', 'sync.meta']);
    expect(sanitizeDataSet(null)).toEqual({ data: {}, skipped: [], damaged: [] });
  });

  it('with `records`, a record of the wrong shape is damaged too, and named apart from keys that do not belong', () => {
    const { data, skipped, damaged } = sanitizeDataSet(
      {
        'practice.data': { at: 10, value: { journal: 'oops' } },
        arcade: { at: 10, value: null },
        'progressions.saved': { at: 10, raw: 'not json' },
        'tuner.tunings': { at: 10, value: [{ id: 't' }] },
        'metronome.settings': { at: 10, value: 'odd but a setting' },
        'ai.anthropic-key': { at: 1, raw: 'sk-ant-secret' },
      },
      { records: true },
    );
    expect(Object.keys(data).sort()).toEqual(['metronome.settings', 'tuner.tunings']);
    expect(damaged.sort()).toEqual(['arcade', 'practice.data', 'progressions.saved']);
    expect(skipped.sort()).toEqual(['ai.anthropic-key', 'arcade', 'practice.data', 'progressions.saved']);
    // Without it (cloud sync reads its own copies), only unreadable entries are left out.
    expect(Object.keys(sanitizeDataSet({ 'practice.data': { at: 10, value: { journal: 'oops' } } }).data)).toEqual(['practice.data']);
  });
});

describe('the learner data store and its change ledger', () => {
  function rig(initial: Record<string, string> = {}) {
    let t = 1000;
    const kv = memoryKv(initial);
    const data = createLearnerData(kv, () => t);
    return { kv, data, at: (next: number) => (t = next) };
  }

  it('dates what was there before tracking began at 0, and later changes at the time they were noticed', () => {
    const r = rig({ 'metronome.settings': '{"bpm":80}', 'ai.anthropic-key': 'sk-ant-x', 'sync.meta': '{}' });
    expect(r.data.snapshot()).toEqual({ 'metronome.settings': { at: 0, value: { bpm: 80 } } });
    r.at(5000);
    r.kv.write('metronome.settings', '{"bpm":90}');
    r.kv.write('arcade', '{"v":1}');
    expect(r.data.notice()).toBe(true);
    expect(r.data.notice()).toBe(false);
    expect(r.data.snapshot()).toEqual({ arcade: { at: 5000, value: { v: 1 } }, 'metronome.settings': { at: 5000, value: { bpm: 90 } } });
    expect(JSON.parse(r.kv.read(LEDGER_KEY)!).keys).toHaveProperty('arcade');
  });

  it('never puts the AI key, sessions, progress or songs in a snapshot', () => {
    const r = rig({ 'ai.anthropic-key': 'sk-ant-x', 'practice.session': '{}', progress: '{}', 'library.v1.index': '[]', 'player.micNotice': 'true', 'tuner.tunings': '[]' });
    expect(Object.keys(r.data.snapshot())).toEqual(['tuner.tunings']);
    expect(r.data.keys(['session', 'learner'])).toEqual(['practice.session', 'tuner.tunings']);
  });

  it('write keeps the change time it is given; remove forgets the key; listeners hear both', () => {
    const r = rig();
    let heard = 0;
    r.data.subscribe(() => heard++);
    r.data.write('rhythm.patterns', { at: 42, value: [{ code: 's-s-', name: 'Mine' }] });
    expect(r.data.entry('rhythm.patterns')).toEqual({ at: 42, value: [{ code: 's-s-', name: 'Mine' }] });
    const digest = r.data.digest();
    r.data.remove('rhythm.patterns');
    expect(r.kv.read('rhythm.patterns')).toBeNull();
    expect(r.data.digest()).not.toBe(digest);
    expect(r.data.snapshot()).toEqual({});
    expect(heard).toBe(2);
  });

  it('notices a deleted key and a changed one, and the digest follows', () => {
    const r = rig({ 'chords.dots': '"fingers"', 'scales.last': '{}' });
    r.data.notice();
    const before = r.data.digest();
    r.kv.remove('scales.last');
    r.at(9000);
    expect(r.data.notice()).toBe(true);
    expect(r.data.sums()).not.toHaveProperty('scales.last');
    expect(r.data.digest()).not.toBe(before);
  });
});
