import { describe, expect, it } from 'vitest';
import { emptyFixture, richFixture } from '../testing/fixtures';
import { MAX_IMPORT_BYTES, RESET_WORD, confirmsReset, diffRows, exportFileName, importFailureText, previewImport, progressFingerprint, readBackup, rejectionReason, storageStatus, summarise } from './model';

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
    expect(exportFileName('Robin', at)).toBe('sixstring-progress-robin-2026-11-15.json');
    expect(exportFileName('', at)).toBe('sixstring-progress-2026-11-15.json');
    expect(exportFileName('José  Ñandú / <b>', at)).toBe('sixstring-progress-jose-nandu-b-2026-11-15.json');
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
