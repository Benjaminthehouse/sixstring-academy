/**
 * The slice of `@supabase/supabase-js` that accounts and sync use, written out so the adapter, the
 * account layer and the in-memory fake agree on exactly one surface. The real client is cast to it
 * at one place (`client.ts`); the fake (`fake.ts`) implements it and nothing more.
 */

/** An error as the auth client reports it (`AuthApiError`, `AuthRetryableFetchError` ...). */
export interface AuthErrorLike {
  name?: string;
  message: string;
  /** HTTP status; 0 or undefined when no answer came back. */
  status?: number;
  /** Supabase's error code, e.g. `otp_expired`, `over_email_send_rate_limit`. */
  code?: string;
}

/** The signed-in user, as far as the app needs it. */
export interface UserLike {
  id: string;
  email?: string | null;
}

/** A session. The tokens never leave the client and are never logged. */
export interface SessionLike {
  access_token: string;
  refresh_token: string;
  /** Seconds since the epoch. */
  expires_at?: number;
  user: UserLike;
}

/** What the auth client's calls resolve with. */
export interface AuthResult<T> {
  data: T;
  error: AuthErrorLike | null;
}

/** Events `onAuthStateChange` reports. */
export type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED' | 'PASSWORD_RECOVERY' | 'MFA_CHALLENGE_VERIFIED';

/** `client.auth`, the part of it the app uses. */
export interface AuthLike {
  signInWithOtp(credentials: { email: string; options?: { shouldCreateUser?: boolean } }): Promise<AuthResult<unknown>>;
  verifyOtp(params: { email: string; token: string; type: 'email' }): Promise<AuthResult<{ session: SessionLike | null; user: UserLike | null }>>;
  getSession(): Promise<AuthResult<{ session: SessionLike | null }>>;
  signOut(options?: { scope?: 'global' | 'local' | 'others' }): Promise<{ error: AuthErrorLike | null }>;
  onAuthStateChange(callback: (event: AuthEvent, session: SessionLike | null) => void): { data: { subscription: { unsubscribe(): void } } };
}

/** A PostgREST error. */
export interface PgErrorLike {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** What a table call resolves with. `status` is 0 when no answer came back (offline). */
export interface PgResult<T> {
  data: T | null;
  error: PgErrorLike | null;
  status: number;
}

/** A filtered query: chain `eq` / `neq`, then await it (or `maybeSingle()` for one row). */
export interface FilterLike<T> extends PromiseLike<PgResult<T>> {
  eq(column: string, value: string): FilterLike<T>;
  neq(column: string, value: string): FilterLike<T>;
}

/** A select that can be narrowed to one row. */
export interface SelectLike<Row> extends FilterLike<Row[]> {
  eq(column: string, value: string): SelectLike<Row>;
  neq(column: string, value: string): SelectLike<Row>;
  maybeSingle(): PromiseLike<PgResult<Row>>;
}

/** `client.from(table)`. */
export interface TableLike {
  select(columns: string): SelectLike<Record<string, unknown>>;
  upsert(values: Record<string, unknown>, options: { onConflict: string }): PromiseLike<PgResult<null>>;
  delete(): FilterLike<null>;
}

/** Realtime channel states. */
export type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

/** A Postgres change delivered by Realtime. */
export interface ChangePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
  /** Set when Realtime could not deliver the whole row (it was too large, ...). */
  errors?: unknown;
}

/** What a channel listens for. */
export interface ChangeFilter {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema: string;
  table: string;
  filter?: string;
}

/** A Realtime channel. */
export interface ChannelLike {
  on(type: 'postgres_changes', filter: ChangeFilter, callback: (payload: ChangePayload) => void): ChannelLike;
  subscribe(callback?: (status: ChannelStatus, error?: Error) => void): ChannelLike;
}

/** The client: auth, one table, Realtime. */
export interface SupabaseLike {
  auth: AuthLike;
  from(table: string): TableLike;
  channel(name: string): ChannelLike;
  removeChannel(channel: ChannelLike): Promise<unknown>;
}

/** Key-value storage the auth client keeps its session in. */
export interface AuthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
