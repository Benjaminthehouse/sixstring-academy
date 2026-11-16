/**
 * What went wrong, in words for the learner (sign-in) and as codes for the sync engine (tables).
 * Pure, so every wording is tested.
 */
import type { AuthErrorLike, PgErrorLike } from './types';

/** How long Supabase keeps a sign-in code usable by default (Authentication > Providers > Email). */
export const CODE_LIFETIME_MS = 60 * 60_000;
/** The shortest wait Supabase allows between two codes for one address. */
export const RESEND_WAIT_MS = 60_000;

/** The kinds of trouble signing in can meet. */
export type AccountErrorKind =
  | 'invalid-email'
  | 'invalid-code'
  | 'wrong-code'
  | 'expired-code'
  | 'too-many-emails'
  | 'too-many-tries'
  | 'wait'
  | 'offline'
  | 'not-set-up'
  | 'signups-closed'
  | 'unsynced'
  | 'server';

/** A problem to show beside the form: one kind sentence, and how long to wait when that helps. */
export interface AccountError {
  kind: AccountErrorKind;
  message: string;
  /** Seconds before trying again makes sense (a code was asked for very recently). */
  retryInSec?: number;
}

const MESSAGES: Record<AccountErrorKind, string> = {
  'invalid-email': 'That does not look like an email address. Check it and try again.',
  'invalid-code': 'The code is the 6 digits in the email. Type just the digits.',
  'wrong-code': 'That code does not match. Check the newest email from us: each new code replaces the one before.',
  'expired-code': 'That code has expired: codes work for an hour. Send yourself a new one.',
  'too-many-emails':
    'Too many sign-in emails were sent in the last hour, so sending is paused for a while. Try again in an hour, or use a code you already have. The app works fully on this device meanwhile.',
  'too-many-tries': 'Too many tries in a short time. Wait a few minutes, then try again.',
  wait: 'A code is already on its way. You can ask for another one in a minute.',
  offline: 'You seem to be offline. Connect to the internet and try again; everything keeps working on this device meanwhile.',
  'not-set-up': 'Email sign-in is not switched on for this app yet. The app’s owner can turn it on in Supabase.',
  'signups-closed': 'New accounts are closed for this app right now. If you already have one, use the email you signed up with.',
  unsynced: 'Some of your latest changes have not reached the cloud yet, so removing them from this device would lose them. Connect to the internet and try again, or keep your progress on this device.',
  server: 'The account service did not answer properly. Try again in a minute.',
};

/** The sentence for a kind of problem. */
export function accountError(kind: AccountErrorKind, retryInSec?: number): AccountError {
  return retryInSec === undefined ? { kind, message: MESSAGES[kind] } : { kind, message: MESSAGES[kind], retryInSec };
}

/** True when no answer came back at all (offline, DNS, a dropped connection). */
export function isNetworkError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  return error.name === 'AuthRetryableFetchError' || error.status === 0 || /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);
}

/** A plain check of an email address: something@something.something, no spaces. */
export function looksLikeEmail(text: string): boolean {
  const email = text.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}

/** The digits of a code the learner typed or pasted ("123 456", "123-456"). */
export function codeDigits(text: string): string {
  return text.replace(/[\s-]/g, '');
}

/** What a failed "email me a code" means for the learner. */
export function sendCodeError(error: AuthErrorLike, online: boolean): AccountError {
  if (!online || isNetworkError(error)) return accountError('offline');
  const code = error.code ?? '';
  const wait = /after (\d+) seconds?/i.exec(error.message);
  if (wait) return accountError('wait', Math.max(1, Number(wait[1])));
  if (code === 'over_email_send_rate_limit' || (error.status === 429 && /email/i.test(error.message))) return accountError('too-many-emails');
  if (code === 'over_request_rate_limit' || error.status === 429) return accountError('too-many-tries');
  if (code === 'email_address_invalid' || code === 'validation_failed' || /invalid.*email|email.*invalid/i.test(error.message)) return accountError('invalid-email');
  if (code === 'otp_disabled' || code === 'email_provider_disabled' || code === 'provider_disabled') return accountError('not-set-up');
  if (code === 'signup_disabled' || /signups? not allowed/i.test(error.message)) return accountError('signups-closed');
  return accountError('server');
}

/**
 * What a failed code check means. Supabase answers "expired or invalid" for both a mistyped code
 * and an old one, so the time since the code was sent decides which to say.
 */
export function verifyCodeError(error: AuthErrorLike, context: { online: boolean; sentAt: number | null; now: number }): AccountError {
  if (!context.online || isNetworkError(error)) return accountError('offline');
  const code = error.code ?? '';
  if (code === 'over_request_rate_limit' || error.status === 429) return accountError('too-many-tries');
  if (code === 'otp_expired' || error.status === 403 || /expired|invalid/i.test(error.message)) {
    const old = context.sentAt !== null && context.now - context.sentAt > CODE_LIFETIME_MS;
    return accountError(old ? 'expired-code' : 'wrong-code');
  }
  if (code === 'signup_disabled') return accountError('signups-closed');
  if (code === 'otp_disabled' || code === 'email_provider_disabled') return accountError('not-set-up');
  return accountError('server');
}

/**
 * The sync engine's code for a failed table call (see `sync.ts`): `unavailable` and
 * `unauthenticated` are retried with growing pauses; `setup_needed` stops syncing with a message
 * for the app's owner; `quota_exceeded` pauses for a long while; `resource_exhausted` rests longer.
 */
export function tableErrorCode(error: PgErrorLike | null, status: number): string {
  const code = error?.code ?? '';
  if (status === 0) return 'unavailable';
  // The table is missing or its policies refuse the learner's own rows: schema.sql was not run (or was changed).
  if (code === 'PGRST205' || code === '42P01' || code === 'PGRST106' || code === '42501') return 'setup_needed';
  if (status === 404) return 'setup_needed';
  // An expired or refused token: the auth client refreshes it, so try again shortly.
  if (status === 401 || /^PGRST30[0-3]$/.test(code)) return 'unauthenticated';
  // The project is over its database size (read-only), this account hit its row limit, or one
  // document is over the size the table allows: none of them gets better by retrying soon.
  if (code === '25006' || code === '53100' || code === '54000' || code === '23514' || status === 413) return 'quota_exceeded';
  if (status === 429) return 'resource_exhausted';
  return 'unavailable';
}
