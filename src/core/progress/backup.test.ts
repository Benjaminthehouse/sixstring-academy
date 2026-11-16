import { describe, expect, it } from 'vitest';
import { createLearnerData, memoryKv, type LearnerData } from '@/core/platform/storage-scope';
import { createLibrary, exportMySongs, importSongBackups, memoryStore, mySongsSize, removeMySongs, type Library } from '@/core/library';
import { ODE_TO_JOY, CAMPFIRE_GROOVE, sixTab } from '@/core/song';
import {
  BACKUP_VERSION,
  NOTICE_KEY,
  UNDO_KEY,
  applyBackup,
  countLearnerData,
  createBackup,
  leaveNotice,
  pendingUndo,
  previewBackup,
  readBackup,
  resetEverything,
  takeNotice,
  undoLastChange,
  type BackupDeps,
  type BackupSongs,
  type ReadBackupOk,
} from './backup';
import { APP_ID } from './persist';
import { makeRig, type TestRig } from './testkit';

/** A device: a progress store, its key-value storage and a song library, all in memory. */
interface Device {
  rig: TestRig;
  kv: ReturnType<typeof memoryKv>;
  data: LearnerData;
  lib: Library;
  deps: BackupDeps;
}

function songsOf(lib: Library): BackupSongs {
  return {
    list: () => exportMySongs(lib),
    size: () => mySongsSize(lib),
    importAll: (items, strategy) => importSongBackups(items, strategy, lib),
    removeAll: () => removeMySongs(lib),
    restore: async (songs) => {
      for (const s of songs) await lib.restore(s);
    },
    remove: async (ids) => {
      for (const id of ids) await lib.remove(id);
    },
  };
}

function device(name: string, start?: number): Device {
  const rig = makeRig({ deviceId: name, start });
  const kv = memoryKv();
  const data = createLearnerData(kv, () => rig.clock.t);
  let seed = name.length;
  const lib = createLibrary({ store: memoryStore(), now: () => rig.clock.t, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), broadcast: false });
  return { rig, kv, data, lib, deps: { store: rig.store, data, songs: songsOf(lib), now: () => rig.clock.t } };
}

const journal = (prefix: string, n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + from}`, startedAt: 1000 + i, endedAt: 2000 + i, day: '2026-03-01', title: 'Practice', plannedSec: 600, practisedSec: 600, blocks: [], xp: 10, feel: null, note: '', endedEarly: false }));

/** Build up what a learner has: progress, a journal, arcade records, a saved progression, a calibration, settings, a song. */
async function learner(d: Device): Promise<void> {
  d.rig.actions.completeOnboarding({ name: 'Robin', experience: 'beginner', dailyGoalXp: 20 });
  d.rig.actions.recordActivity({ kind: 'theory-lesson', id: 'theory:unit-1:lesson-1', accuracy: 0.9, durationSec: 200 });
  d.kv.write('practice.data', JSON.stringify({ v: 1, routines: [], journal: journal('a', 12), goals: [{ id: 'g1', title: 'Clean G to C', area: 'chords', targetDay: null, progress: 40, createdAt: 5, doneAt: null }], weeklyGoalMin: 90 }));
  d.kv.write('arcade', JSON.stringify({ v: 1, focus: { tonic: 'A', scale: 'minor-pentatonic', shape: 'box-1' }, input: 'tap', anyOctave: true, levels: { 'fret-rush': { 'minor-pentatonic': { '1': { stars: 3, best: 900, plays: 2, at: 10 } } } }, bests: {}, daily: null, dailyBest: 0 }));
  d.kv.write('progressions.saved', JSON.stringify([{ id: 'my-blues-in-a', name: 'Blues in A', slots: [{ roman: 'I' }], createdAt: 1, updatedAt: 2 }]));
  d.kv.write('rhythm.calibration', JSON.stringify({ v: 1, tapMs: 42, micMs: null, tapAt: 3, micAt: null, offered: true, micOffered: false, bleed: null }));
  d.kv.write('metronome.settings', JSON.stringify({ bpm: 96 }));
  d.kv.write('prefs.speech', 'false');
  d.kv.write('ai.anthropic-key', 'sk-ant-api03-secret');
  d.kv.write('player.micNotice', 'true');
  d.kv.write('practice.session', JSON.stringify({ running: true }));
  d.kv.write('sync.meta', '{"uid":"u1"}');
  await d.lib.save(sixTab(ODE_TO_JOY));
}

async function fileOf(d: Device): Promise<string> {
  return JSON.stringify(await createBackup(d.deps));
}

function read(d: Device, text: string): ReadBackupOk {
  const r = readBackup(text, { now: d.rig.clock.t, timeZone: 'UTC', deviceId: d.rig.store.getState().meta.deviceId });
  if (!r.ok) throw new Error(`unreadable: ${r.reason} ${r.detail}`);
  return r;
}

const LEARNER_KEYS = ['arcade', 'metronome.settings', 'practice.data', 'prefs.speech', 'progressions.saved', 'rhythm.calibration'];

describe('createBackup', () => {
  it('carries the progress, every piece of learner data and the learner’s songs, and nothing secret', async () => {
    const d = device('laptop');
    await learner(d);
    const file = await createBackup(d.deps);
    expect(file).toMatchObject({ app: APP_ID, kind: 'backup', v: BACKUP_VERSION });
    expect(file.progress.state.profile.name).toBe('Robin');
    expect(Object.keys(file.data).sort()).toEqual(LEARNER_KEYS);
    expect(file.songs?.map((s) => s.listing.title)).toEqual(['Ode to Joy']);
    const text = JSON.stringify(file);
    expect(text).not.toContain('sk-ant');
    expect(text).not.toContain('micNotice');
    expect(text).not.toContain('practice.session');
  });
});

describe('export, reset, import: everything comes back', () => {
  it('replace into a fresh device gives the same data and songs', async () => {
    const a = device('laptop');
    await learner(a);
    const text = await fileOf(a);
    const b = device('phone', a.rig.clock.t);
    const r = read(b, text);
    expect(r).toMatchObject({ format: 'full', songCount: 1, skipped: [] });

    const preview = previewBackup(r, { state: b.rig.store.getState(), data: b.data.snapshot(), songs: [] }, 'replace', b.rig.clock.t);
    expect(preview.rows.find((row) => row.id === 'journal')).toMatchObject({ label: 'Practice journal', before: 0, after: 12 });
    expect(preview.rows.find((row) => row.id === 'arcade')).toMatchObject({ before: 0, after: 1 });
    expect(preview.songs).toEqual({ before: 0, after: 1, inBoth: 0 });

    const done = await applyBackup(r, 'replace', b.deps);
    expect(done).toMatchObject({ ok: true, reload: true, undo: true, failed: [] });
    for (const key of LEARNER_KEYS) expect(b.kv.read(key)).toBe(a.kv.read(key));
    expect(b.rig.store.getState().profile.name).toBe('Robin');
    expect((await b.lib.list({ scope: 'mine' })).map((s) => s.title)).toEqual(['Ode to Joy']);
    // Never carried: the AI key, device notices, a running session.
    expect(b.kv.read('ai.anthropic-key')).toBeNull();
    expect(b.kv.read('practice.session')).toBeNull();
  });

  it('a reset erases it all on this device but the AI key, device bookkeeping and the songs; importing brings it back', async () => {
    const d = device('laptop');
    await learner(d);
    const text = await fileOf(d);
    const before = Object.fromEntries(LEARNER_KEYS.map((k) => [k, d.kv.read(k)]));

    const reset = await resetEverything({}, d.deps);
    expect(reset).toMatchObject({ reload: true, undo: true, songsDeleted: 0 });
    for (const key of LEARNER_KEYS) expect(d.kv.read(key)).toBeNull();
    expect(d.kv.read('practice.session')).toBeNull();
    expect(d.kv.read('ai.anthropic-key')).toBe('sk-ant-api03-secret');
    expect(d.kv.read('player.micNotice')).toBe('true');
    expect(d.kv.read('sync.meta')).toBe('{"uid":"u1"}');
    expect(d.rig.store.getState().xp.total).toBe(0);
    expect((await d.lib.list({ scope: 'mine' })).length).toBe(1);

    const done = await applyBackup(read(d, text), 'newest-wins', d.deps);
    expect(done.ok).toBe(true);
    for (const key of LEARNER_KEYS) expect(d.kv.read(key)).toBe(before[key]);
    expect(d.rig.store.getState().profile.name).toBe('Robin');
  });

  it('"also delete my songs" deletes them, and Undo brings everything back exactly', async () => {
    const d = device('laptop');
    await learner(d);
    const xp = d.rig.store.getState().xp.total;
    const snapshot = Object.fromEntries([...LEARNER_KEYS, 'practice.session'].map((k) => [k, d.kv.read(k)]));
    const reset = await resetEverything({ deleteSongs: true }, d.deps);
    expect(reset).toMatchObject({ songsDeleted: 1, songsUndoable: true });
    expect(await d.lib.list({ scope: 'mine' })).toEqual([]);
    expect(pendingUndo(d.deps)).toMatchObject({ action: 'reset', songs: true });

    const undone = await undoLastChange(d.deps);
    expect(undone).toMatchObject({ ok: true, reload: true, action: 'reset' });
    for (const [key, value] of Object.entries(snapshot)) expect(d.kv.read(key)).toBe(value);
    expect(d.rig.store.getState().xp.total).toBe(xp);
    expect((await d.lib.list({ scope: 'mine' })).map((s) => s.title)).toEqual(['Ode to Joy']);
    expect(d.kv.read(UNDO_KEY)).toBeNull();
    expect(pendingUndo(d.deps)).toBeNull();
  });

  it('"keep my name and settings" erases what was made or earned and keeps the settings', async () => {
    const d = device('laptop');
    await learner(d);
    await resetEverything({ keepPrefs: true }, d.deps);
    expect(d.rig.store.getState().profile.name).toBe('Robin');
    expect(d.kv.read('metronome.settings')).toBe('{"bpm":96}');
    expect(d.kv.read('prefs.speech')).toBe('false');
    expect(d.kv.read('practice.data')).toBeNull();
    expect(d.kv.read('arcade')).toBeNull();
    expect(d.kv.read('rhythm.calibration')).toBeNull();
    expect(d.kv.read('practice.session')).toBeNull();
  });

  it('a reset drops the progress store’s safety copies, so a damaged save cannot bring erased progress back', async () => {
    const d = device('laptop');
    await learner(d);
    d.rig.store.flush();
    d.rig.storage.write('progress.bak', d.rig.storage.read('progress')!);
    d.rig.storage.write('progress.corrupt', '{"broken');
    await resetEverything({}, d.deps);
    expect(d.rig.storage.read('progress.bak')).toBeNull();
    expect(d.rig.storage.read('progress.corrupt')).toBeNull();
  });
});

describe('import merge', () => {
  it('joins the journal (12 here, 15 after) and keeps every song, and the preview says so', async () => {
    const a = device('laptop');
    await learner(a);
    const here = device('phone', a.rig.clock.t);
    here.kv.write('practice.data', JSON.stringify({ v: 1, routines: [], journal: journal('a', 9).concat(journal('p', 3)), goals: [], weeklyGoalMin: null }));
    const mine = await here.lib.save(sixTab(CAMPFIRE_GROOVE));
    a.kv.write('practice.data', JSON.stringify({ v: 1, routines: [], journal: journal('a', 12), goals: [], weeklyGoalMin: null }));
    const r = read(here, await fileOf(a));
    const preview = previewBackup(r, { state: here.rig.store.getState(), data: here.data.snapshot(), songs: [{ id: mine.id }] }, 'newest-wins', here.rig.clock.t);
    expect(preview.rows.find((row) => row.id === 'journal')).toMatchObject({ before: 12, after: 15 });
    expect(preview.songs).toEqual({ before: 1, after: 2, inBoth: 0 });
    const replacePreview = previewBackup(r, { state: here.rig.store.getState(), data: here.data.snapshot(), songs: [{ id: mine.id }] }, 'replace', here.rig.clock.t);
    expect(replacePreview.rows.find((row) => row.id === 'journal')).toMatchObject({ before: 12, after: 12 });

    await applyBackup(r, 'newest-wins', here.deps);
    const journalAfter = JSON.parse(here.kv.read('practice.data')!).journal as Array<{ id: string }>;
    expect(journalAfter).toHaveLength(15);
    expect((await here.lib.list({ scope: 'mine' })).length).toBe(2);
  });

  it('Undo of an import takes away the songs it added and puts the data back', async () => {
    const a = device('laptop');
    await learner(a);
    const here = device('phone', a.rig.clock.t);
    here.kv.write('chords.dots', '"notes"');
    const r = read(here, await fileOf(a));
    await applyBackup(r, 'replace', here.deps);
    expect(here.kv.read('chords.dots')).toBeNull();
    expect((await here.lib.list({ scope: 'mine' })).length).toBe(1);
    await undoLastChange(here.deps);
    expect(here.kv.read('chords.dots')).toBe('"notes"');
    expect(here.kv.read('practice.data')).toBeNull();
    expect(await here.lib.list({ scope: 'mine' })).toEqual([]);
    expect(here.rig.store.getState().profile.name).toBe('');
  });

  it('a damaged entry never blocks the rest', async () => {
    const a = device('laptop');
    await learner(a);
    const file = JSON.parse(await fileOf(a));
    file.data.arcade = 'garbage';
    file.data['ai.anthropic-key'] = { at: 1, raw: 'sk-ant-smuggled' };
    file.songs.push({ listing: { id: 'my-broken' }, json: '{]' }, 42);
    const b = device('phone', a.rig.clock.t);
    const r = read(b, JSON.stringify(file));
    // Reading only glances at songs (the 42 is not one); each is checked properly as it is imported.
    expect(r.skipped.sort()).toEqual(['1 song', 'ai.anthropic-key', 'arcade']);
    const done = await applyBackup(r, 'replace', b.deps);
    expect(done.ok && done.songs).toMatchObject({ added: [expect.stringMatching(/^my-/)], skipped: 2 });
    expect(b.kv.read('practice.data')).toBe(a.kv.read('practice.data'));
    expect(b.kv.read('arcade')).toBeNull();
    expect(b.kv.read('ai.anthropic-key')).toBeNull();
  });
});

describe('older backups', () => {
  it('a version-2 progress export imports its progress and leaves everything else here alone', async () => {
    const a = device('laptop');
    await learner(a);
    const old = JSON.stringify(a.rig.store.exportData());
    const b = device('phone', a.rig.clock.t);
    b.kv.write('metronome.settings', '{"bpm":60}');
    await b.lib.save(sixTab(CAMPFIRE_GROOVE));
    const r = read(b, old);
    expect(r).toMatchObject({ format: 'progress-only', data: null, songs: null });
    const preview = previewBackup(r, { state: b.rig.store.getState(), data: b.data.snapshot(), songs: [{ id: 'x' }] }, 'replace', b.rig.clock.t);
    expect(preview).toMatchObject({ progressOnly: true, songs: null, dataChanges: 0 });
    const done = await applyBackup(r, 'replace', b.deps);
    expect(done).toMatchObject({ ok: true, reload: false, changed: [] });
    expect(b.rig.store.getState().profile.name).toBe('Robin');
    expect(b.kv.read('metronome.settings')).toBe('{"bpm":60}');
    expect((await b.lib.list({ scope: 'mine' })).length).toBe(1);
  });

  it('the flat version-1 save still reads', () => {
    const d = device('laptop');
    const r = readBackup(JSON.stringify({ v: 1, name: 'Old Robin', xp: 120, onboarded: true }), { now: d.rig.clock.t, timeZone: 'UTC' });
    expect(r.ok && r.format === 'progress-only' && r.state.profile.name).toBe('Old Robin');
  });

  it('refuses a backup from a newer version or another app, and text that is not JSON', () => {
    const env = { now: Date.now(), timeZone: 'UTC' };
    expect(readBackup(JSON.stringify({ app: APP_ID, kind: 'backup', v: BACKUP_VERSION + 1, progress: {} }), env)).toMatchObject({ ok: false, reason: 'newer-version' });
    expect(readBackup(JSON.stringify({ app: 'other', kind: 'backup', v: 3 }), env)).toMatchObject({ ok: false, reason: 'not-an-export' });
    expect(readBackup('{oops', env)).toMatchObject({ ok: false, reason: 'not-json' });
    expect(readBackup(JSON.stringify({ app: APP_ID, kind: 'backup', v: 3, progress: { hello: 1 } }), env)).toMatchObject({ ok: false, reason: 'not-an-export' });
  });
});

describe('countLearnerData and notices', () => {
  it('counts what was made and how many settings there are', async () => {
    const d = device('laptop');
    await learner(d);
    const counts = countLearnerData(d.data.snapshot());
    expect(counts.items.find((i) => i.id === 'journal')?.count).toBe(12);
    expect(counts.items.find((i) => i.id === 'goals')?.count).toBe(1);
    expect(counts.items.find((i) => i.id === 'calibration')?.count).toBe(1);
    expect(counts.settings).toBe(2);
  });

  it('a notice is shown once after the reload, and only while it is fresh', () => {
    const d = device('laptop');
    leaveNotice({ tone: 'ok', title: 'Backup imported', undo: true }, d.deps);
    expect(takeNotice(d.deps)).toMatchObject({ title: 'Backup imported', undo: true });
    expect(takeNotice(d.deps)).toBeNull();
    leaveNotice({ tone: 'ok', title: 'Old news', undo: false }, d.deps);
    d.rig.clock.minutes(5);
    expect(takeNotice(d.deps)).toBeNull();
    expect(d.kv.read(NOTICE_KEY)).toBeNull();
  });

  it('the undo runs out after half an hour', async () => {
    const d = device('laptop');
    await learner(d);
    await resetEverything({}, d.deps);
    d.rig.clock.minutes(31);
    expect(pendingUndo(d.deps)).toBeNull();
    expect(await undoLastChange(d.deps)).toMatchObject({ ok: false });
  });
});
