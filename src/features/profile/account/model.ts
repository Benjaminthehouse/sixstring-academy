/**
 * Words and rules for Me > Account and the sync row in Your data. Pure, so every sentence is tested.
 */
import type { SyncStatus } from '@/core/platform';
import type { AccountNotice, AccountPhase, CloudUnavailable } from '@/core/platform/cloud';
import { timeAgo } from '../format';

/** How the sync row looks and what its button does. */
export interface SyncView {
  tone: 'ok' | 'warn' | 'bad' | 'info' | 'busy';
  title: string;
  /** The status sentence, plus when it last synced and whether changes wait. */
  text: string;
  /** `sync-now` flushes and looks; `retry` starts the service again; `sign-in` goes to Me > Account. */
  action: 'sync-now' | 'retry' | 'sign-in' | null;
}

/** Issues where retrying soon cannot help without starting afresh (after the owner fixes the project, say). */
const RESTART_ISSUES = new Set(['setup-needed', 'read-only', 'unreachable', 'revoked', 'not-offered']);

/** The sync row for a status. `now` for "last synced 3 min ago". */
export function syncView(status: SyncStatus, now: number): SyncView {
  const account = status.provider === 'account';
  const last = status.lastSyncedAt ? ` Last synced ${timeAgo(status.lastSyncedAt, now)}.` : '';
  const waiting = status.pending ? ' Changes are waiting to be sent.' : '';
  const text = `${status.message}${status.state === 'off' ? '' : last}${status.state === 'off' ? '' : waiting}`;
  switch (status.state) {
    case 'synced':
      return { tone: 'ok', title: account ? 'Synced with your account' : 'Synced with your Claude account', text, action: 'sync-now' };
    case 'syncing':
      return { tone: 'busy', title: 'Syncing', text, action: 'sync-now' };
    case 'offline':
      return { tone: 'info', title: 'Offline', text, action: null };
    case 'error':
      return { tone: 'warn', title: account ? 'Syncing has a problem' : 'Cloud sync has a problem', text, action: status.issue && RESTART_ISSUES.has(status.issue) ? 'retry' : 'sync-now' };
    default:
      if (status.issue === 'signed-out') return { tone: 'info', title: 'Not signed in', text, action: 'sign-in' };
      if (status.issue === 'erased') return { tone: 'info', title: 'Syncing stopped', text, action: 'sign-in' };
      if (status.issue === 'unreachable') return { tone: 'warn', title: 'The cloud cannot be reached yet', text, action: 'retry' };
      if (account && status.issue === 'revoked') return { tone: 'info', title: 'Signed out', text, action: 'sign-in' };
      return { tone: 'info', title: 'Cloud sync is off here', text, action: null };
  }
}

/** The one plain line when this copy offers no accounts. */
export function unavailableText(reason: CloudUnavailable | null): string {
  if (reason === 'artifact') return 'Inside Claude your progress syncs with your Claude account by itself, so there is nothing to sign in to here.';
  if (reason === 'secret-key')
    return 'Accounts are switched off in this copy of the app: it was built with a secret key that must never be in a web page. Its owner should replace it with the anon public key and make a new secret key (docs/accounts-setup.md, step 6). Your progress stays on this device.';
  if (reason === 'misconfigured') return 'Accounts are set up wrongly for this copy of the app (its project address or key is not valid), so your progress stays on this device. Use Your data to move it with a backup file.';
  return 'Accounts are not set up for this copy of the app, so your progress stays on this device. Use Your data to move it with a backup file.';
}

/** A notice to show once, after something happened to the account. */
export function noticeView(notice: AccountNotice): { tone: 'info' | 'ok'; title: string; text: string } | null {
  switch (notice) {
    case 'signed-out':
      return { tone: 'info', title: 'You were signed out on this device', text: 'Sign in again to keep syncing. Your progress is safe here.' };
    case 'erased':
      return { tone: 'info', title: 'Your cloud data was deleted', text: 'It was deleted from another device, so this one stopped syncing and signed out. Your progress is still here: sign in again to start syncing it anew.' };
    case 'deleted':
      return { tone: 'ok', title: 'Your cloud data is deleted', text: 'You are signed out on every device, and your progress is still here. Signing in again starts a fresh cloud copy from this device.' };
    case 'removed':
      return { tone: 'ok', title: 'Signed out, and this device is clear', text: 'Your progress was removed from this device. It is safe in your account: sign in again to bring it back.' };
    default:
      return null;
  }
}

/** Seconds before another code can be asked for (Supabase allows one a minute per address). */
export function resendWait(sentAt: number | null, now: number, retryInSec?: number): number {
  const fromSent = sentAt === null ? 0 : Math.ceil((sentAt + 60_000 - now) / 1000);
  return Math.max(0, fromSent, retryInSec ?? 0);
}

/** "0:42". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** How many lessons are behind the learner, for the suggestion. */
export function lessonsDone(stats: Readonly<Record<string, number>>): number {
  return (stats['count.theory-lesson'] ?? 0) + (stats['count.teacher-lesson'] ?? 0);
}

/** Lessons after which signing in is suggested, once. */
export const SUGGEST_AFTER_LESSONS = 3;

/**
 * Whether to suggest signing in: only where accounts are offered, nobody is signed in or signing
 * in, the learner has finished a few lessons (so it is clearly worth keeping), and they have not
 * said "Not now". Never a wall: the first run and the first lessons are untouched.
 */
export function suggestSignIn(input: { phase: AccountPhase; lessons: number; dismissed: boolean }): boolean {
  return input.phase === 'signed-out' && !input.dismissed && input.lessons >= SUGGEST_AFTER_LESSONS;
}

/** The storage key of "Not now" on the suggestion (a device key: `sync.*`). */
export const SUGGESTION_KEY = 'sync.account.suggestion-dismissed';
