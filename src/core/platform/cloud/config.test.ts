import { describe, expect, it } from 'vitest';
import { readCloudConfig } from './config';
import { accountError, codeDigits, isNetworkError, looksLikeEmail, sendCodeError, tableErrorCode, verifyCodeError } from './errors';

const env = (url: unknown, anonKey: unknown, extra: { artifact?: boolean; fake?: boolean } = {}) => ({ url, anonKey, artifact: extra.artifact ?? false, fake: extra.fake ?? false });
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.public-anon-key';

describe('which copies offer accounts', () => {
  it('needs both build variables: without them accounts are simply not offered', () => {
    expect(readCloudConfig(env(undefined, undefined))).toEqual({ config: null, reason: 'not-configured' });
    expect(readCloudConfig(env('', '  '))).toEqual({ config: null, reason: 'not-configured' });
  });

  it('takes a https project address and a key, and tidies a trailing slash', () => {
    expect(readCloudConfig(env('https://abcd.supabase.co/', ` ${KEY} `))).toEqual({ config: { url: 'https://abcd.supabase.co', anonKey: KEY, fake: false }, reason: null });
    // A project on the owner's own computer may be plain http.
    expect(readCloudConfig(env('http://localhost:54321', KEY)).config?.url).toBe('http://localhost:54321');
  });

  it('says "set up wrongly" rather than guessing when one is missing or malformed', () => {
    expect(readCloudConfig(env('https://abcd.supabase.co', undefined)).reason).toBe('misconfigured');
    expect(readCloudConfig(env(undefined, KEY)).reason).toBe('misconfigured');
    expect(readCloudConfig(env('http://abcd.supabase.co', KEY)).reason).toBe('misconfigured');
    expect(readCloudConfig(env('abcd.supabase.co', KEY)).reason).toBe('misconfigured');
    expect(readCloudConfig(env('https://abcd.supabase.co', 'short')).reason).toBe('misconfigured');
    expect(readCloudConfig(env('https://abcd.supabase.co', 'has a space in it, which no key has')).reason).toBe('misconfigured');
  });

  it('refuses a project address with a path (the REST endpoint pasted instead of the Project URL)', () => {
    expect(readCloudConfig(env('https://abcd.supabase.co/rest/v1/', KEY)).reason).toBe('misconfigured');
    expect(readCloudConfig(env('https://abcd.supabase.co/auth/v1', KEY)).reason).toBe('misconfigured');
  });

  it('refuses a secret key (it would let anyone read every learner’s rows) and says so, rather than using it', () => {
    const jwt = (payload: Record<string, unknown>): string => {
      const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
      return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}.c2lnbmF0dXJlLWJ5dGVzLWhlcmU`;
    };
    const anon = jwt({ iss: 'supabase', ref: 'abcd', role: 'anon', iat: 1, exp: 2 });
    const service = jwt({ iss: 'supabase', ref: 'abcd', role: 'service_role', iat: 1, exp: 2 });
    expect(readCloudConfig(env('https://abcd.supabase.co', anon))).toMatchObject({ reason: null, config: { anonKey: anon } });
    expect(readCloudConfig(env('https://abcd.supabase.co', 'sb_publishable_0123456789abcdefghijkl')).reason).toBeNull();
    expect(readCloudConfig(env('https://abcd.supabase.co', service))).toEqual({ config: null, reason: 'secret-key' });
    expect(readCloudConfig(env('https://abcd.supabase.co', 'sb_secret_0123456789abcdefghijkl'))).toEqual({ config: null, reason: 'secret-key' });
  });

  it('is never offered inside Claude, which has its own sync; a browser check’s stand-in wins elsewhere', () => {
    expect(readCloudConfig(env('https://abcd.supabase.co', KEY, { artifact: true }))).toEqual({ config: null, reason: 'artifact' });
    expect(readCloudConfig(env(undefined, undefined, { fake: true })).config?.fake).toBe(true);
  });
});

describe('sign-in problems in plain words', () => {
  it('checks an email address and a code the way a person types them', () => {
    expect(looksLikeEmail(' robin@example.com ')).toBe(true);
    expect(looksLikeEmail('robin@example')).toBe(false);
    expect(looksLikeEmail('robin example.com')).toBe(false);
    expect(codeDigits(' 123 456 ')).toBe('123456');
    expect(codeDigits('123-456')).toBe('123456');
  });

  it('tells offline apart from a refusal', () => {
    expect(isNetworkError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 })).toBe(true);
    expect(isNetworkError({ message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' })).toBe(false);
    expect(sendCodeError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }, true).kind).toBe('offline');
    expect(sendCodeError({ message: 'anything', status: 500 }, false).kind).toBe('offline');
  });

  it('separates "too many emails this hour" from "wait a minute for this address"', () => {
    const hourly = sendCodeError({ message: 'email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' }, true);
    expect(hourly.kind).toBe('too-many-emails');
    expect(hourly.message).toMatch(/in an hour/);
    const wait = sendCodeError({ message: 'For security purposes, you can only request this after 42 seconds.', status: 429, code: 'over_email_send_rate_limit' }, true);
    expect(wait).toMatchObject({ kind: 'wait', retryInSec: 42 });
    expect(sendCodeError({ message: 'Email address "x" is invalid', status: 400, code: 'email_address_invalid' }, true).kind).toBe('invalid-email');
    expect(sendCodeError({ message: 'Signups not allowed for otp', status: 422, code: 'otp_disabled' }, true).kind).toBe('not-set-up');
    expect(sendCodeError({ message: 'Signups not allowed for this instance', status: 422, code: 'signup_disabled' }, true).kind).toBe('signups-closed');
  });

  it('calls a refused code "expired" only when it is more than an hour old', () => {
    const refused = { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' };
    const now = 10 * 3_600_000;
    expect(verifyCodeError(refused, { online: true, sentAt: now - 5 * 60_000, now }).kind).toBe('wrong-code');
    expect(verifyCodeError(refused, { online: true, sentAt: now - 61 * 60_000, now }).kind).toBe('expired-code');
    expect(verifyCodeError({ message: 'Too many', status: 429, code: 'over_request_rate_limit' }, { online: true, sentAt: null, now }).kind).toBe('too-many-tries');
  });

  it('every sentence is kind and says what to do, without blame or jargon', () => {
    for (const kind of ['invalid-email', 'invalid-code', 'wrong-code', 'expired-code', 'too-many-emails', 'too-many-tries', 'wait', 'offline', 'not-set-up', 'signups-closed', 'unsynced', 'server'] as const) {
      const message = accountError(kind).message;
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toMatch(/!|error code|OTP|JWT|token|RLS|HTTP/i);
    }
  });
});

describe('table failures as the sync engine’s codes', () => {
  it('maps offline, a missing table, refused rows, expired tokens, a full project and rate limits', () => {
    expect(tableErrorCode({ message: 'TypeError: Failed to fetch', code: '' }, 0)).toBe('unavailable');
    expect(tableErrorCode({ message: "Could not find the table 'public.sync_docs' in the schema cache", code: 'PGRST205' }, 404)).toBe('setup_needed');
    expect(tableErrorCode({ message: 'new row violates row-level security policy', code: '42501' }, 403)).toBe('setup_needed');
    expect(tableErrorCode({ message: 'JWT expired', code: 'PGRST303' }, 401)).toBe('unauthenticated');
    expect(tableErrorCode({ message: 'cannot execute INSERT in a read-only transaction', code: '25006' }, 500)).toBe('quota_exceeded');
    expect(tableErrorCode({ message: 'Too many sync documents for one account', code: '54000' }, 400)).toBe('quota_exceeded');
    expect(tableErrorCode({ message: 'violates check constraint "sync_docs_data_size"', code: '23514' }, 400)).toBe('quota_exceeded');
    expect(tableErrorCode({ message: 'slow down', code: '' }, 429)).toBe('resource_exhausted');
    expect(tableErrorCode({ message: 'bad gateway', code: '' }, 502)).toBe('unavailable');
  });
});
