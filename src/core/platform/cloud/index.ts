/**
 * Accounts and cross-device sync on Supabase (standalone app). Import from `@/core/platform/cloud`.
 * The Supabase client itself loads only when this copy offers accounts. See `API.md` beside it.
 */
export { accountsOffered, cloudConfig, cloudUnavailableReason, readCloudConfig, type CloudConfig, type CloudUnavailable } from './config';
export { CODE_LIFETIME_MS, RESEND_WAIT_MS, codeDigits, looksLikeEmail, type AccountError, type AccountErrorKind } from './errors';
export { createAccounts, getAccounts, getAccountState, subscribeAccount, type AccountBusy, type AccountNotice, type AccountPhase, type AccountState, type Accounts } from './account';
export { SYNC_TABLE } from './db';
