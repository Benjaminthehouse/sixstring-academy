import { describe, expect, it } from 'vitest';
import { emptyFixture, richFixture } from '../testing/fixtures';
import { createBackup, previewBackup } from '@/core/progress';
import { createLearnerData, memoryKv } from '@/core/platform/storage-scope';
import { SONG_SYNC_LIMITS } from '@/core/platform';
import {
  MAX_IMPORT_BYTES,
  RESET_WORD,
  confirmsReset,
  dataDiffRows,
  dataImportNote,
  diffRows,
  exportFileName,
  importFailureText,
  includedLines,
  previewImport,
  progressFingerprint,
  readBackup,
  rejectionReason,
  sizeText,
  songSyncText,
  staysLines,
  storageStatus,
  summarise,
} from './model';

const NOW = Date.parse('2026-11-15T19:10:00Z');
const ENV = { now: NOW, timeZone: 'UTC' };

describe('a state in numbers', () => {
  it('sums up a learner four months in', () => {
    const f = richFixture(NOW, 'UTC');
    const s = f.store.getState();
    const summary = summarise(s);
    expect(summary).toMatchObject({ name: 'Robin', xp: s.xp.total, streak: 12, gems: s.gems.balance, achievements: Object.keys(s.achievements).length });
    expect(summary.level).toBeGreaterThan(1);
    expect(summary.skills).toBe(Object.keys(s.skills).length);
    expect(summary.practiceDays).toBeGreaterThan(60);
    expect(summary.practiceSec).toBe(s.stats['time.total']);
    // The Ocean accent was bought; the free cosmetics are not counted.
    expect(summary.cosmetics).toBe(1);
  });

  it('sums up a new learner as zeros', () => {
    expect(summarise(emptyFixture(NOW, 'UTC').store.getState())).toMatchObject({ name: '', level: 1, xp: 0, streak: 0, gems: 0, achievements: 0, skills: 0, crowns: 0, practiceDays: 0, practiceSec: 0, cosmetics: 0, reviewCards: 0 });
  });
});

describe('before and after', () => {
  const rich = richFixture(NOW, 'UTC').store.getState();
  const empty = emptyFixture(NOW, 'UTC').store.getState();

  it('marks what goes up, down, changes or stays', () => {
    const rows = diffRows(summarise(empty), summarise(rich));
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.name).toMatchObject({ before: 'No name yet', after: 'Robin', change: 'different' });
    expect(byKey.xp.change).toBe('up');
    expect(byKey.streak).toMatchObject({ before: '0 days', after: '12 days', change: 'up' });
    expect(byKey.cards.change).toBe('same');
    expect(diffRows(summarise(rich), summarise(empty)).find((r) => r.key === 'xp')?.change).toBe('down');
    expect(diffRows(summarise(rich), summarise(rich)).every((r) => r.change === 'same')).toBe(true);
    // Every row has words on both sides.
    for (const row of rows) expect(row.before.length > 0 && row.after.length > 0).toBe(true);
  });

  it('replace takes the file as it is, and warns when numbers go down', () => {
    const preview = previewImport(rich, empty, 'replace', NOW);
    expect(preview.after.xp).toBe(0);
    expect(preview.loses).toBe(true);
    expect(preview.changed).toBeGreaterThan(5);
  });

  it('merge never loses progress', () => {
    const preview = previewImport(rich, empty, 'newest-wins', NOW);
    expect(preview.loses).toBe(false);
    expect(preview.after.xp).toBe(rich.xp.total);
    expect(preview.after.achievements).toBe(Object.keys(rich.achievements).length);
    // Merging a richer file into an empty device brings everything over.
    const other = previewImport(empty, rich, 'newest-wins', NOW);
    expect(other.loses).toBe(false);
    expect(other.after.xp).toBe(rich.xp.total);
    expect(other.after.skills).toBe(Object.keys(rich.skills).length);
  });

  it('says so when a file would change nothing', () => {
    expect(previewImport(rich, rich, 'replace', NOW)).toMatchObject({ changed: 0, loses: false });
    expect(previewImport(rich, rich, 'newest-wins', NOW)).toMatchObject({ changed: 0, loses: false });
  });

  it('the preview is what the store then does', () => {
    for (const strategy of ['replace', 'newest-wins'] as const) {
      const target = emptyFixture(NOW, 'UTC');
      target.actions.recordActivity({ kind: 'tuner', durationSec: 60 });
      const file = JSON.stringify(richFixture(NOW, 'UTC').actions.exportProgress());
      const read = readBackup(file, ENV);
      expect(read.ok).toBe(true);
      if (!read.ok) continue;
      const preview = previewImport(target.store.getState(), read.state, strategy, NOW);
      expect(target.actions.importProgress(file, strategy).ok).toBe(true);
      const after = summarise(target.store.getState());
      for (const key of ['name', 'level', 'xp', 'streak', 'gems', 'skills', 'crowns', 'practiceDays', 'practiceSec', 'reviewCards', 'cosmetics'] as const) expect(after[key], `${strategy}: ${key}`).toEqual(preview.after[key]);
      // Imported progress can unlock achievements the file did not have yet; it never has fewer.
      expect(after.achievements).toBeGreaterThanOrEqual(preview.after.achievements);
    }
  });
});

describe('reading a backup file', () => {
  it('accepts an export and reports when it was made', () => {
    const f = richFixture(NOW, 'UTC');
    const read = readBackup(JSON.stringify(f.actions.exportProgress()), ENV);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.exportedAt).toBe(NOW);
      expect(read.state.xp.total).toBe(f.store.getState().xp.total);
    }
  });

  it('refuses anything else with words a learner can act on', () => {
    const cases: Array<[string, string]> = [
      ['not json at all', 'not-json'],
      ['{"hello":"world"}', 'not-an-export'],
      ['[1,2,3]', 'not-an-export'],
      [JSON.stringify({ app: 'another-app', v: 2, state: {} }), 'not-an-export'],
      [JSON.stringify({ app: 'sixstring-academy', v: 999, state: { profile: {} } }), 'newer-version'],
    ];
    for (const [text, reason] of cases) {
      const read = readBackup(text, ENV);
      expect(read.ok, text).toBe(false);
      if (!read.ok) {
        expect(read.reason).toBe(reason);
        expect(read.title.length).toBeGreaterThan(10);
        expect(read.description.length).toBeGreaterThan(20);
      }
    }
    for (const reason of ['not-json', 'not-an-export', 'newer-version', 'invalid', 'too-large', 'wrong-type', 'unreadable'] as const) {
      const words = importFailureText(reason);
      expect(words.title).not.toMatch(/error|invalid json|exception/i);
      expect(words.description.endsWith('.')).toBe(true);
    }
    expect(MAX_IMPORT_BYTES).toBeGreaterThan(JSON.stringify(richFixture(NOW, 'UTC').actions.exportProgress()).length * 10);
  });

  // Review: a file over the size limit was turned away by the picker, and the screen then said
  // "The file is valid, but it was not made by Export", which is not true of a file never read.
  it('says why the picker turned a file away, without claiming it was read', () => {
    expect(rejectionReason([{ size: MAX_IMPORT_BYTES + 1 }])).toBe('too-large');
    expect(rejectionReason([{ size: 1200 }])).toBe('wrong-type');
    expect(rejectionReason([{ size: 1200 }, { size: MAX_IMPORT_BYTES * 3 }])).toBe('too-large');
    for (const reason of ['too-large', 'wrong-type'] as const) {
      const words = importFailureText(reason);
      expect(`${words.title} ${words.description}`).not.toMatch(/valid|damaged|could not be read/i);
    }
    expect(importFailureText('too-large').title).toMatch(/too large/);
  });
});

describe('export, reset, import', () => {
  it('brings back exactly the same progress', () => {
    const f = richFixture(NOW, 'UTC');
    const before = progressFingerprint(f.store.getState());
    const file = JSON.stringify(f.actions.exportProgress());
    f.actions.resetProgress();
    expect(f.store.getState().xp.total).toBe(0);
    expect(progressFingerprint(f.store.getState())).not.toBe(before);
    expect(f.actions.importProgress(file, 'replace').ok).toBe(true);
    expect(progressFingerprint(f.store.getState())).toBe(before);
  });

  it('a reset that keeps the settings keeps the name and loses the progress', () => {
    const f = richFixture(NOW, 'UTC');
    f.actions.setPrefs({ theme: 'dark', handedness: 'left' });
    f.actions.resetProgress({ keepPrefs: true });
    const s = f.store.getState();
    expect(s.profile.name).toBe('Robin');
    expect(s.prefs).toMatchObject({ theme: 'dark', handedness: 'left' });
    expect(s.xp.total).toBe(0);
    expect(s.gems.balance).toBe(0);
    // Paid cosmetics go with the progress.
    expect(s.cosmetics).not.toContain('accent-ocean');
  });

  it('the fingerprint ignores bookkeeping and notices real changes', () => {
    const a = richFixture(NOW, 'UTC');
    const b = richFixture(NOW, 'UTC');
    expect(progressFingerprint(a.store.getState())).toBe(progressFingerprint(b.store.getState()));
    b.actions.setProfile({ name: 'Robyn' });
    expect(progressFingerprint(a.store.getState())).not.toBe(progressFingerprint(b.store.getState()));
  });
});

describe('small things', () => {
  it('names the export file after the learner and the day', () => {
    const at = new Date(2026, 10, 15, 12).getTime();
    expect(exportFileName('Robin', at)).toBe('sixstring-backup-robin-2026-11-15.json');
    expect(exportFileName('', at)).toBe('sixstring-backup-2026-11-15.json');
    expect(exportFileName('José  Ñandú / <b>', at)).toBe('sixstring-backup-jose-nandu-b-2026-11-15.json');
    expect(exportFileName('x'.repeat(80), at).length).toBeLessThan(60);
  });

  it('asks for the word, forgiving case and spaces only', () => {
    expect(RESET_WORD).toBe('RESET');
    expect(confirmsReset('RESET')).toBe(true);
    expect(confirmsReset('  reset ')).toBe(true);
    expect(confirmsReset('')).toBe(false);
    expect(confirmsReset('RESE')).toBe(false);
    expect(confirmsReset('RESET!')).toBe(false);
    expect(confirmsReset('yes')).toBe(false);
  });

  it('describes where the data lives, worst news first', () => {
    const fine = { persistent: true, saveFailed: false, report: { source: 'saved' as const, corrupt: false, newer: false }, host: 'standalone' as const, savedAt: NOW };
    expect(storageStatus(fine)).toMatchObject({ tone: 'ok', title: 'Saved on this device' });
    expect(storageStatus({ ...fine, persistent: false })).toMatchObject({ tone: 'bad', title: 'Progress is not being saved' });
    expect(storageStatus({ ...fine, persistent: false, host: 'artifact' }).text).toMatch(/This view cannot store/);
    expect(storageStatus({ ...fine, saveFailed: true })).toMatchObject({ tone: 'bad', title: 'The last save did not work' });
    expect(storageStatus({ ...fine, report: { source: 'backup', corrupt: true, newer: false } })).toMatchObject({ tone: 'warn', title: 'Recovered from yesterday’s backup' });
    expect(storageStatus({ ...fine, report: { source: 'fresh', corrupt: true, newer: false } })).toMatchObject({ tone: 'warn', title: 'The saved progress could not be read' });
    expect(storageStatus({ ...fine, report: { source: 'saved', corrupt: false, newer: true } }).tone).toBe('warn');
    // Whatever the state, the advice to keep a backup or the way to get one is there.
    for (const status of [storageStatus(fine), storageStatus({ ...fine, persistent: false }), storageStatus({ ...fine, saveFailed: true })]) expect(status.text).toMatch(/backup/i);
  });
});

describe('the rest of your data', () => {
  async function backupWith(entries: Record<string, unknown>) {
    const f = richFixture(NOW, 'UTC');
    const kv = memoryKv();
    for (const [key, value] of Object.entries(entries)) kv.write(key, JSON.stringify(value));
    const data = createLearnerData(kv, () => NOW);
    const file = await createBackup({ store: f.store, data, songs: null, now: () => NOW });
    return { f, data, text: JSON.stringify(file) };
  }

  it('reads a full backup and previews "12 entries now, 15 after" for the journal', async () => {
    const journal = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `e${i + from}`, endedAt: i + from }));
    const { text } = await backupWith({ 'practice.data': { v: 1, journal: journal(15), routines: [], goals: [] }, 'metronome.settings': { bpm: 90 } });
    const read = readBackup(text, ENV);
    expect(read.ok && read.backup.format).toBe('full');
    if (!read.ok) return;
    const target = emptyFixture(NOW, 'UTC');
    const kv = memoryKv({ 'practice.data': JSON.stringify({ v: 1, journal: journal(12), routines: [], goals: [] }) });
    const local = createLearnerData(kv, () => NOW).snapshot();
    const preview = previewBackup(read.backup, { state: target.store.getState(), data: local, songs: [{ id: 'my-a' }] }, 'newest-wins', NOW);
    const rows = dataDiffRows(preview);
    expect(rows.find((r) => r.key === 'data-journal')).toMatchObject({ label: 'Practice journal', before: '12 entries', after: '15 entries', change: 'up' });
    expect(rows.find((r) => r.key === 'settings')).toMatchObject({ before: '0 settings', after: '1 setting' });
    expect(rows.find((r) => r.key === 'songs')).toBeUndefined(); // this file holds no songs
    expect(dataImportNote(preview)).toMatch(/Lists are joined/);
    expect(dataImportNote({ ...preview, strategy: 'replace' })).toMatch(/exactly what the file holds/);
    expect(dataImportNote({ ...preview, songs: { before: 2, after: 3, inBoth: 1 } })).toMatch(/1 song is in both: the copy changed last is kept\. Importing never deletes a song\./);
  });

  it('tells an older progress-only file apart and says what stays', () => {
    const read = readBackup(JSON.stringify(richFixture(NOW, 'UTC').actions.exportProgress()), ENV);
    expect(read.ok && read.backup.format).toBe('progress-only');
    expect(dataImportNote({ strategy: 'replace', progressOnly: true, songs: null })).toMatch(/older version of the app and holds only your progress/);
  });

  // Review: a file whose journal was damaged (not a list) replaced the journal here in Merge, and
  // the preview said "2 entries -> 0 entries" without a word about why.
  it('a damaged part of the file is named in the preview, and what is here of it stays', async () => {
    const { text } = await backupWith({ 'practice.data': { v: 1, journal: [], routines: [], goals: [] } });
    const file = JSON.parse(text);
    file.data['practice.data'] = { at: NOW + 1, value: { journal: 'oops' } };
    const read = readBackup(JSON.stringify(file), ENV);
    if (!read.ok) throw new Error('unreadable');
    const kv = memoryKv({ 'practice.data': JSON.stringify({ v: 1, journal: [{ id: 'mine', endedAt: 1 }], routines: [], goals: [] }) });
    const local = createLearnerData(kv, () => NOW).snapshot();
    for (const strategy of ['newest-wins', 'replace'] as const) {
      const preview = previewBackup(read.backup, { state: emptyFixture(NOW, 'UTC').store.getState(), data: local, songs: null }, strategy, NOW);
      expect(dataDiffRows(preview).find((r) => r.key === 'data-journal')).toMatchObject({ before: '1 entry', after: '1 entry', change: 'same' });
      expect(dataImportNote(preview)).toMatch(/Part of the file is damaged and is left out \(Practice journal, routines and goals\): what you have here of it stays as it is\./);
    }
  });

  it('explains a Replace that waits because there is no room to keep Undo', () => {
    const words = importFailureText('no-room');
    expect(words.title).toMatch(/no room/i);
    expect(words.description).toMatch(/Choose Merge/);
    expect(words.description.endsWith('.')).toBe(true);
  });

  it('lists what a backup holds, with counts, and what stays on this device', () => {
    const { lines, later } = includedLines({
      progress: summarise(richFixture(NOW, 'UTC').store.getState()),
      counts: { items: [{ id: 'journal', label: 'Practice journal', unit: ['entry', 'entries'], count: 3 }, { id: 'arcade', label: 'Arcade records', unit: ['level played', 'levels played'], count: 0 }], settings: 4 },
      songs: { count: 2, bytes: 24_000 },
    });
    expect(lines.map((l) => l.id)).toEqual(['progress', 'journal', 'settings', 'songs']);
    expect(lines.find((l) => l.id === 'journal')).toMatchObject({ detail: '3 entries', empty: false, icon: 'NotebookPen' });
    // What the learner has none of yet is named once, so a beginner sees what will travel without a wall of "none".
    expect(later).toEqual(['arcade records']);
    expect(lines.find((l) => l.id === 'songs')?.detail).toBe('2 songs, 24 KB');
    expect(lines.find((l) => l.id === 'progress')?.detail).toMatch(/^level \d+, [\d,]+ XP, a 12-day streak/);
    expect(includedLines({ progress: summarise(emptyFixture(NOW, 'UTC').store.getState()), counts: { items: [], settings: 0 }, songs: { count: 0, bytes: 0 } }).later).toEqual(['screen settings', 'your own songs']);
    expect(staysLines({ hasApiKey: true })[0].label).toBe('Your API key');
    expect(staysLines({ hasApiKey: false }).some((l) => l.id === 'key')).toBe(false);
  });

  it('says whether songs sync, and why not', () => {
    expect(songSyncText(null, SONG_SYNC_LIMITS)).toBeNull();
    expect(songSyncText({ synced: true, count: 3, bytes: 1, reason: null }, SONG_SYNC_LIMITS)).toBe('Your 3 songs sync too.');
    expect(songSyncText({ synced: false, count: 51, bytes: 1, reason: 'count' }, SONG_SYNC_LIMITS)).toMatch(/up to 50 songs and you have 51\. Export a backup/);
    expect(songSyncText({ synced: false, count: 3, bytes: 3_000_000, reason: 'total' }, SONG_SYNC_LIMITS)).toMatch(/3 MB and cloud sync carries up to 2 MB/);
    expect(songSyncText({ synced: false, count: 3, bytes: 1, reason: 'elsewhere' }, SONG_SYNC_LIMITS)).toMatch(/another of your devices/);
    expect(sizeText(840)).toBe('840 B');
    expect(sizeText(12_400)).toBe('12 KB');
    expect(sizeText(3_400_000)).toBe('3.4 MB');
  });
});
