import { describe, expect, it } from 'vitest';
import type { SyncStatus } from '@/core/platform';
import { SUGGESTION_KEY, clock, lessonsDone, noticeView, resendWait, suggestSignIn, syncView, unavailableText } from './model';
import { classifyKey, syncsKey } from '@/core/platform/storage-scope';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const status = (patch: Partial<SyncStatus>): SyncStatus => ({ state: 'off', issue: null, provider: null, message: 'M.', lastSyncedAt: null, pending: false, songs: null, ...patch });

describe('the sync row', () => {
  it('names where the copy lives and when it last agreed', () => {
    expect(syncView(status({ state: 'synced', provider: 'account', lastSyncedAt: NOW - 5 * 60_000 }), NOW)).toEqual({ tone: 'ok', title: 'Synced with your account', text: 'M. Last synced 5 min ago.', action: 'sync-now' });
    expect(syncView(status({ state: 'synced', provider: 'claude' }), NOW).title).toBe('Synced with your Claude account');
  });

  it('offline is calm and offers nothing to press; waiting changes are mentioned', () => {
    const view = syncView(status({ state: 'offline', issue: 'offline', provider: 'account', pending: true, lastSyncedAt: NOW - 3_600_000 }), NOW);
    expect(view).toMatchObject({ tone: 'info', title: 'Offline', action: null });
    expect(view.text).toBe('M. Last synced 1 h ago. Changes are waiting to be sent.');
  });

  it('a problem offers a retry that fits it', () => {
    expect(syncView(status({ state: 'error', issue: 'retrying', provider: 'account' }), NOW).action).toBe('sync-now');
    expect(syncView(status({ state: 'error', issue: 'setup-needed', provider: 'account' }), NOW)).toMatchObject({ tone: 'warn', title: 'Syncing has a problem', action: 'retry' });
    expect(syncView(status({ state: 'off', issue: 'unreachable', provider: 'account' }), NOW).action).toBe('retry');
  });

  it('signed out points to signing in; a copy without accounts (or Claude without a database) offers nothing', () => {
    expect(syncView(status({ issue: 'signed-out' }), NOW)).toMatchObject({ title: 'Not signed in', action: 'sign-in' });
    expect(syncView(status({ issue: 'erased' }), NOW).action).toBe('sign-in');
    expect(syncView(status({ issue: 'standalone' }), NOW)).toMatchObject({ title: 'Cloud sync is off here', action: null });
    expect(syncView(status({ issue: 'not-offered' }), NOW)).toMatchObject({ title: 'Cloud sync is off here', action: null });
  });
});

describe('words', () => {
  it('one plain line when accounts are not offered, saying what to do instead', () => {
    expect(unavailableText('not-configured')).toMatch(/not set up for this copy.*Your data/);
    expect(unavailableText('misconfigured')).toMatch(/set up wrongly/);
    expect(unavailableText('artifact')).toMatch(/Claude account by itself/);
    // A secret key is the owner's emergency: say what to replace it with, and that progress is safe here.
    expect(unavailableText('secret-key')).toMatch(/secret key.*anon public key.*docs\/accounts-setup\.md/s);
    expect(unavailableText('secret-key')).toMatch(/stays on this device/);
  });

  it('a notice for each thing that can happen to the account, and none otherwise', () => {
    for (const notice of ['signed-out', 'erased', 'deleted', 'removed'] as const) {
      const view = noticeView(notice);
      expect(view?.title.length).toBeGreaterThan(10);
      expect(view?.text).toMatch(/progress/);
    }
    expect(noticeView(null)).toBeNull();
  });

  it('counts down to the next code', () => {
    expect(resendWait(NOW - 20_000, NOW)).toBe(40);
    expect(resendWait(NOW - 90_000, NOW)).toBe(0);
    expect(resendWait(null, NOW, 12)).toBe(12);
    expect(clock(42)).toBe('0:42');
    expect(clock(61)).toBe('1:01');
  });
});

describe('the suggestion to sign in', () => {
  it('comes after a few lessons, only when nobody is signed in, and never after "Not now"', () => {
    expect(lessonsDone({ 'count.theory-lesson': 2, 'count.teacher-lesson': 1, 'count.tuner': 9 })).toBe(3);
    expect(suggestSignIn({ phase: 'signed-out', lessons: 2, dismissed: false })).toBe(false);
    expect(suggestSignIn({ phase: 'signed-out', lessons: 3, dismissed: false })).toBe(true);
    expect(suggestSignIn({ phase: 'signed-out', lessons: 9, dismissed: true })).toBe(false);
    for (const phase of ['unavailable', 'starting', 'code-sent', 'signed-in'] as const) expect(suggestSignIn({ phase, lessons: 9, dismissed: false })).toBe(false);
  });

  it('remembers "Not now" on this device only', () => {
    expect(classifyKey(SUGGESTION_KEY)).toBe('device');
    expect(syncsKey(SUGGESTION_KEY)).toBe(false);
  });
});
