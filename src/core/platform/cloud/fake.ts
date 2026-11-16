/**
 * An in-memory stand-in for Supabase, for unit tests and browser checks (this machine cannot reach
 * supabase.co). It has two halves joined by a transport, so two simulated devices (or two browser
 * contexts) can share one backend:
 *
 *  - `FakeSupabaseServer`: auth with one-time email codes (6 digits, one hour, one per address per
 *    minute, a few emails an hour in all, as Supabase's built-in mailer allows), sessions with
 *    expiring access tokens and rotating refresh tokens, the `sync_docs` table with the row-level
 *    security policies of `supabase/schema.sql` (a signed-in user reaches only rows with their own
 *    user_id; anonymous requests read nothing and write nothing), and Realtime change events
 *    (inserts and updates filtered by the subscription and by row security; deletes, as on the
 *    real service, unchecked and carrying only the primary key).
 *  - `createFakeClient(transport)`: exactly the surface in `types.ts` (`auth.signInWithOtp`,
 *    `verifyOtp`, `getSession` with refresh, `signOut`, `onAuthStateChange`; `from().select / upsert
 *    / delete` with `eq`, `neq`, `maybeSingle`; `channel().on().subscribe()`, `removeChannel`), with
 *    the session kept in the storage it is given, the way supabase-js keeps it.
 *
 * Transports: `memoryTransport(server)` (unit tests: latency, switch it offline and back) and
 * `bindingTransport(fn)` (browser checks: the page calls a function the check exposes, which hands
 * the JSON request to the server in Node; Realtime arrives by long polling).
 */
import type { AuthErrorLike, AuthEvent, AuthStorage, ChangeFilter, ChangePayload, ChannelLike, ChannelStatus, FilterLike, PgErrorLike, PgResult, SelectLike, SessionLike, SupabaseLike, TableLike } from './types';

// ---------------------------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------------------------

/** A filter on a table call. */
export interface FakeFilter {
  column: string;
  op: 'eq' | 'neq';
  value: string;
}

/** One request from a client to the server (plain JSON). */
export type FakeRequest =
  | { op: 'auth.otp'; email: string; createUser: boolean }
  | { op: 'auth.verify'; email: string; token: string; type: string }
  | { op: 'auth.refresh'; refreshToken: string }
  | { op: 'auth.signout'; accessToken: string; scope: 'global' | 'local' | 'others' }
  | { op: 'db.select'; token: string | null; table: string; columns: string; filters: FakeFilter[]; single: boolean }
  | { op: 'db.upsert'; token: string | null; table: string; row: Record<string, unknown>; onConflict: string }
  | { op: 'db.delete'; token: string | null; table: string; filters: FakeFilter[] }
  | { op: 'rt.join'; token: string | null; conn: string; topic: string; bindings: ChangeFilter[] }
  | { op: 'rt.leave'; conn: string; topic: string }
  | { op: 'rt.poll'; conn: string };

/** The server's answer. `status` 0 never comes from the server: the transport uses it for "no answer". */
export interface FakeResponse {
  data: unknown;
  error: { message: string; code?: string; name?: string } | null;
  status: number;
}

/** A Realtime event for one subscription. */
export interface FakeEvent {
  topic: string;
  payload: ChangePayload;
}

/** A row of `sync_docs`. */
export interface FakeRow {
  id: string;
  user_id: string;
  path: string;
  data: Record<string, unknown>;
  updated_at: string;
}

/** Settings of the fake server; the defaults are Supabase's. */
export interface FakeServerOptions {
  now?: () => number;
  random?: () => number;
  /** Sign-in emails the built-in mailer sends per hour, all addresses together. */
  emailsPerHour?: number;
  /** Seconds before the same address can be sent another code. */
  resendSeconds?: number;
  /** How long a code works. */
  codeTtlSec?: number;
  /** How long an access token works. */
  accessTtlSec?: number;
  /** Rows one user may keep (the schema's trigger). */
  maxRowsPerUser?: number;
  /** Bytes one row's data may take (the schema's check). */
  maxRowBytes?: number;
  /** How long a Realtime long poll waits for events before answering with none. */
  pollWaitMs?: number;
}

const TABLE = 'sync_docs';
const ok = (data: unknown, status = 200): FakeResponse => ({ data, error: null, status });
const err = (status: number, code: string, message: string): FakeResponse => ({ data: null, error: { code, message }, status });
const isRec = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

interface Conn {
  subs: Map<string, { uid: string | null; bindings: ChangeFilter[] }>;
  queue: FakeEvent[];
  waiter: ((events: FakeEvent[]) => void) | null;
  push: ((events: FakeEvent[]) => void) | null;
}

// ---------------------------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------------------------

/** The backend half. Create one per test (or per browser check) and share it between clients. */
export class FakeSupabaseServer {
  /** Users by email. */
  readonly users = new Map<string, { id: string; email: string }>();
  /** The table, by row id. */
  readonly rows = new Map<string, FakeRow>();
  /** Every sign-in email sent: the code a person would read. */
  readonly mail: Array<{ email: string; code: string; at: number }> = [];
  /** Every request, in order (op names), for tests that count calls. */
  readonly log: Array<FakeRequest['op']> = [];
  /** Answer table calls as if `schema.sql` was never run. */
  tableMissing = false;

  private readonly options: Required<FakeServerOptions>;
  private readonly codes = new Map<string, { code: string; sentAt: number }>();
  private readonly sessions = new Map<string, { userId: string; sessionId: string; expiresAt: number }>();
  private readonly refreshTokens = new Map<string, { userId: string; sessionId: string; revoked: boolean }>();
  private readonly sentAt: number[] = [];
  private readonly conns = new Map<string, Conn>();
  private readonly failures: Array<{ op: FakeRequest['op']; response: FakeResponse }> = [];
  private counter = 0;
  private stampSeq = 0;

  constructor(options: FakeServerOptions = {}) {
    this.options = {
      now: options.now ?? (() => Date.now()),
      random: options.random ?? (() => Math.random()),
      emailsPerHour: options.emailsPerHour ?? 4,
      resendSeconds: options.resendSeconds ?? 60,
      codeTtlSec: options.codeTtlSec ?? 3600,
      accessTtlSec: options.accessTtlSec ?? 3600,
      maxRowsPerUser: options.maxRowsPerUser ?? 300,
      maxRowBytes: options.maxRowBytes ?? 300_000,
      pollWaitMs: options.pollWaitMs ?? 20_000,
    };
  }

  // -- for tests ------------------------------------------------------------------------------

  /** The newest code sent to an address (what the learner reads in the email). */
  lastCode(email: string): string | null {
    for (let i = this.mail.length - 1; i >= 0; i--) if (this.mail[i].email === email.trim().toLowerCase()) return this.mail[i].code;
    return null;
  }

  /** A user's id, once they signed up. */
  userId(email: string): string | null {
    return this.users.get(email.trim().toLowerCase())?.id ?? null;
  }

  /** A user's rows (all rows with no argument), sorted by path. */
  rowsOf(userId?: string): FakeRow[] {
    return [...this.rows.values()].filter((row) => !userId || row.user_id === userId).sort((a, b) => a.path.localeCompare(b.path));
  }

  /** The next `times` requests of this kind get this answer instead. */
  failNext(op: FakeRequest['op'], status: number, code: string, message: string, times = 1): void {
    for (let i = 0; i < times; i++) this.failures.push({ op, response: err(status, code, message) });
  }

  /** Make every access token expired now (refresh tokens still work). */
  expireAccessTokens(): void {
    for (const session of this.sessions.values()) session.expiresAt = 0;
  }

  /**
   * End every session of a user (as "sign out everywhere" or the owner does). As on the real
   * service, access tokens already handed out keep working until they expire; refreshing fails.
   */
  revokeSessions(userId: string): void {
    for (const token of this.refreshTokens.values()) if (token.userId === userId) token.revoked = true;
  }

  /** Remove a user and, through `on delete cascade`, their rows. */
  deleteUser(userId: string): void {
    for (const [email, user] of this.users) if (user.id === userId) this.users.delete(email);
    for (const [id, row] of this.rows) if (row.user_id === userId) this.rows.delete(id);
    this.revokeSessions(userId);
  }

  /** Deliver Realtime events to a connection directly (the memory transport) instead of by polling. */
  attach(conn: string, push: (events: FakeEvent[]) => void): () => void {
    const c = this.conn(conn);
    c.push = push;
    if (c.queue.length) push(c.queue.splice(0));
    return () => {
      if (c.push === push) c.push = null;
    };
  }

  /** `handle` for a JSON request, answering JSON (the browser checks' binding). */
  async handleJson(json: string): Promise<string> {
    return JSON.stringify(await this.handle(JSON.parse(json) as FakeRequest));
  }

  // -- the service ----------------------------------------------------------------------------

  /** Answer one request. */
  async handle(request: FakeRequest): Promise<FakeResponse> {
    this.log.push(request.op);
    const failure = this.failures.findIndex((f) => f.op === request.op);
    if (failure >= 0) return this.failures.splice(failure, 1)[0].response;
    switch (request.op) {
      case 'auth.otp':
        return this.otp(request.email, request.createUser);
      case 'auth.verify':
        return this.verify(request.email, request.token, request.type);
      case 'auth.refresh':
        return this.refresh(request.refreshToken);
      case 'auth.signout':
        return this.signOut(request.accessToken, request.scope);
      case 'db.select':
        return this.select(request);
      case 'db.upsert':
        return this.upsert(request);
      case 'db.delete':
        return this.remove(request);
      case 'rt.join': {
        const who = this.who(request.token);
        this.conn(request.conn).subs.set(request.topic, { uid: 'uid' in who ? who.uid : null, bindings: request.bindings });
        return ok({});
      }
      case 'rt.leave':
        this.conns.get(request.conn)?.subs.delete(request.topic);
        return ok({});
      case 'rt.poll':
        return ok({ events: await this.poll(request.conn) });
      default:
        return err(400, 'bad_request', 'Unknown request');
    }
  }

  private now(): number {
    return this.options.now();
  }

  private id(prefix: string): string {
    this.counter += 1;
    return `${prefix}${this.counter.toString(36)}${Math.floor(this.options.random() * 1e9).toString(36)}`;
  }

  private uuid(): string {
    const hex = (n: number): string => Array.from({ length: n }, () => Math.floor(this.options.random() * 16).toString(16)).join('');
    return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
  }

  /** A timestamp that always moves forward, as Postgres's `now()` does between transactions. */
  private stamp(): string {
    this.stampSeq += 1;
    return `${new Date(this.now()).toISOString().slice(0, 23)}${String(this.stampSeq % 1000).padStart(3, '0')}+00:00`;
  }

  private session(userId: string, sessionId = this.id('s')): SessionLike {
    const access = this.id('access.');
    const refresh = this.id('refresh.');
    const expiresAt = this.now() + this.options.accessTtlSec * 1000;
    this.sessions.set(access, { userId, sessionId, expiresAt });
    this.refreshTokens.set(refresh, { userId, sessionId, revoked: false });
    const email = [...this.users.values()].find((u) => u.id === userId)?.email ?? null;
    return { access_token: access, refresh_token: refresh, expires_at: Math.floor(expiresAt / 1000), user: { id: userId, email } };
  }

  private otp(rawEmail: string, createUser: boolean): FakeResponse {
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return err(400, 'email_address_invalid', `Email address "${rawEmail}" is invalid`);
    const now = this.now();
    const previous = this.codes.get(email);
    if (previous && now - previous.sentAt < this.options.resendSeconds * 1000) {
      const left = Math.ceil((this.options.resendSeconds * 1000 - (now - previous.sentAt)) / 1000);
      return err(429, 'over_email_send_rate_limit', `For security purposes, you can only request this after ${left} seconds.`);
    }
    while (this.sentAt.length && now - this.sentAt[0] > 3_600_000) this.sentAt.shift();
    if (this.sentAt.length >= this.options.emailsPerHour) return err(429, 'over_email_send_rate_limit', 'email rate limit exceeded');
    if (!this.users.has(email)) {
      if (!createUser) return err(422, 'otp_disabled', 'Signups not allowed for otp');
      this.users.set(email, { id: this.uuid(), email });
    }
    const code = String(Math.floor(this.options.random() * 1_000_000)).padStart(6, '0');
    this.codes.set(email, { code, sentAt: now });
    this.sentAt.push(now);
    this.mail.push({ email, code, at: now });
    return ok({ user: null, session: null });
  }

  private verify(rawEmail: string, token: string, type: string): FakeResponse {
    const email = rawEmail.trim().toLowerCase();
    const pending = this.codes.get(email);
    const user = this.users.get(email);
    if (type !== 'email' || !pending || !user || pending.code !== token || this.now() - pending.sentAt > this.options.codeTtlSec * 1000) {
      return err(403, 'otp_expired', 'Token has expired or is invalid');
    }
    this.codes.delete(email); // a code works once
    const session = this.session(user.id);
    return ok({ session, user: session.user });
  }

  private refresh(refreshToken: string): FakeResponse {
    const known = this.refreshTokens.get(refreshToken);
    if (!known || known.revoked) return err(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
    known.revoked = true; // rotated
    const session = this.session(known.userId, known.sessionId);
    return ok({ session, user: session.user });
  }

  private signOut(accessToken: string, scope: 'global' | 'local' | 'others'): FakeResponse {
    const session = this.sessions.get(accessToken);
    if (!session) return ok(null, 204);
    for (const token of this.refreshTokens.values()) {
      if (token.userId !== session.userId) continue;
      const same = token.sessionId === session.sessionId;
      if (scope === 'global' || (scope === 'local' && same) || (scope === 'others' && !same)) token.revoked = true;
    }
    if (scope !== 'others') this.sessions.delete(accessToken);
    return ok(null, 204);
  }

  /** Who a request comes from: a user, the anonymous role, or a refused token. */
  private who(token: string | null): { uid: string } | { anon: true } | { refused: FakeResponse } {
    if (!token) return { anon: true };
    const session = this.sessions.get(token);
    if (!session) return { refused: err(401, 'PGRST301', 'JWSError JWSInvalidSignature') };
    if (session.expiresAt <= this.now()) return { refused: err(401, 'PGRST303', 'JWT expired') };
    return { uid: session.userId };
  }

  private missing(table: string): FakeResponse | null {
    if (table !== TABLE || this.tableMissing) return err(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`);
    return null;
  }

  private matches(row: FakeRow, filters: FakeFilter[]): boolean {
    return filters.every((f) => {
      const value = String((row as unknown as Record<string, unknown>)[f.column] ?? '');
      return f.op === 'eq' ? value === f.value : value !== f.value;
    });
  }

  private select(request: Extract<FakeRequest, { op: 'db.select' }>): FakeResponse {
    const missing = this.missing(request.table);
    if (missing) return missing;
    const who = this.who(request.token);
    if ('refused' in who) return who.refused;
    // Policy "read own": only the signed-in user's rows; the anonymous role sees none.
    const visible = 'uid' in who ? [...this.rows.values()].filter((row) => row.user_id === who.uid && this.matches(row, request.filters)) : [];
    const columns = request.columns.split(',').map((c) => c.trim()).filter(Boolean);
    const pick = (row: FakeRow): Record<string, unknown> => {
      if (columns.includes('*')) return clone(row) as unknown as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const column of columns) out[column] = clone((row as unknown as Record<string, unknown>)[column]);
      return out;
    };
    if (request.single) {
      if (visible.length > 1) return err(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
      return ok(visible.length ? pick(visible[0]) : null);
    }
    return ok(visible.map(pick));
  }

  private upsert(request: Extract<FakeRequest, { op: 'db.upsert' }>): FakeResponse {
    const missing = this.missing(request.table);
    if (missing) return missing;
    const who = this.who(request.token);
    if ('refused' in who) return who.refused;
    const row = request.row;
    const rls = `new row violates row-level security policy for table "${TABLE}"`;
    if (!('uid' in who)) return err(401, '42501', rls);
    // Policies "insert own" / "update own": with check (auth.uid() = user_id).
    if (row.user_id !== who.uid) return err(403, '42501', rls);
    if (request.onConflict !== 'user_id,path') return err(400, '42P10', 'there is no unique or exclusion constraint matching the ON CONFLICT specification');
    if (typeof row.path !== 'string' || row.path.length < 1 || row.path.length > 200) return err(400, '23514', 'new row for relation "sync_docs" violates check constraint "sync_docs_path_check"');
    if (!isRec(row.data)) return err(400, '23502', 'null value in column "data" violates not-null constraint');
    if (new TextEncoder().encode(JSON.stringify(row.data)).length > this.options.maxRowBytes) return err(400, '23514', 'new row for relation "sync_docs" violates check constraint "sync_docs_data_size"');
    const existing = [...this.rows.values()].find((r) => r.user_id === who.uid && r.path === row.path);
    if (existing) {
      existing.data = clone(row.data);
      existing.updated_at = this.stamp();
      this.publish('UPDATE', existing);
      return ok(null, 201);
    }
    if (this.rowsOf(who.uid).length >= this.options.maxRowsPerUser) return err(400, '54000', 'Too many sync documents for one account');
    const created: FakeRow = { id: this.uuid(), user_id: who.uid, path: row.path, data: clone(row.data), updated_at: this.stamp() };
    this.rows.set(created.id, created);
    this.publish('INSERT', created);
    return ok(null, 201);
  }

  private remove(request: Extract<FakeRequest, { op: 'db.delete' }>): FakeResponse {
    const missing = this.missing(request.table);
    if (missing) return missing;
    const who = this.who(request.token);
    if ('refused' in who) return who.refused;
    if (!('uid' in who)) return ok(null, 204); // policy "delete own": the anonymous role matches nothing
    for (const row of [...this.rows.values()]) {
      if (row.user_id !== who.uid || !this.matches(row, request.filters)) continue;
      this.rows.delete(row.id);
      this.publish('DELETE', row);
    }
    return ok(null, 204);
  }

  // -- Realtime -------------------------------------------------------------------------------

  private conn(id: string): Conn {
    let c = this.conns.get(id);
    if (!c) {
      c = { subs: new Map(), queue: [], waiter: null, push: null };
      this.conns.set(id, c);
    }
    return c;
  }

  private publish(eventType: ChangePayload['eventType'], row: FakeRow): void {
    for (const c of this.conns.values()) {
      const events: FakeEvent[] = [];
      for (const [topic, sub] of c.subs) {
        for (const binding of sub.bindings) {
          if (binding.schema !== 'public' || binding.table !== TABLE) continue;
          if (binding.event !== '*' && binding.event !== eventType) continue;
          if (eventType === 'DELETE') {
            // As on the real service: delete events are neither filtered nor checked against row
            // security, and carry only the primary key. (The schema's random key gives nothing away.)
            events.push({ topic, payload: { eventType, new: {}, old: { id: row.id }, errors: null } });
            continue;
          }
          const filter = /^user_id=eq\.(.+)$/.exec(binding.filter ?? '');
          if (binding.filter && (!filter || filter[1] !== row.user_id)) continue;
          if (sub.uid !== row.user_id) continue; // row security
          events.push({ topic, payload: { eventType, new: clone(row) as unknown as Record<string, unknown>, old: {}, errors: null } });
        }
      }
      if (!events.length) continue;
      if (c.push) c.push(events);
      else {
        c.queue.push(...events);
        if (c.waiter) {
          const waiter = c.waiter;
          c.waiter = null;
          waiter(c.queue.splice(0));
        }
      }
    }
  }

  private poll(conn: string): Promise<FakeEvent[]> {
    const c = this.conn(conn);
    if (c.queue.length) return Promise.resolve(c.queue.splice(0));
    return new Promise((resolve) => {
      const previous = c.waiter;
      c.waiter = resolve;
      previous?.([]);
      setTimeout(() => {
        if (c.waiter === resolve) {
          c.waiter = null;
          resolve([]);
        }
      }, this.options.pollWaitMs);
    });
  }
}

/** A server with Supabase's defaults (or the options given). */
export function createFakeServer(options: FakeServerOptions = {}): FakeSupabaseServer {
  return new FakeSupabaseServer(options);
}

// ---------------------------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------------------------

/** How a fake client reaches the server. A thrown error means "no answer" (offline). */
export interface FakeTransport {
  call(request: FakeRequest): Promise<FakeResponse>;
  /** Push Realtime events for `conn` directly; `state(false)` when the connection drops, `state(true)` when it is back. */
  listen?(conn: string, events: (events: FakeEvent[]) => void, state: (up: boolean) => void): () => void;
}

/** A transport in memory, for unit tests: a delay per call, and a switch for being offline. */
export interface MemoryTransport extends FakeTransport {
  online: boolean;
  setOnline(online: boolean): void;
  latencyMs: number;
}

/** Talk to `server` in this process, after `latencyMs` (fake timers welcome). */
export function memoryTransport(server: FakeSupabaseServer, options: { latencyMs?: number; online?: boolean } = {}): MemoryTransport {
  const states = new Set<(up: boolean) => void>();
  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  const transport: MemoryTransport = {
    online: options.online ?? true,
    latencyMs: options.latencyMs ?? 10,
    setOnline(online) {
      if (transport.online === online) return;
      transport.online = online;
      for (const state of [...states]) state(online);
    },
    async call(request) {
      await wait(transport.latencyMs);
      if (!transport.online) throw new TypeError('Failed to fetch');
      const response = await server.handle(clone(request));
      await wait(transport.latencyMs);
      if (!transport.online) throw new TypeError('Failed to fetch');
      return clone(response);
    },
    listen(conn, events, state) {
      states.add(state);
      const detach = server.attach(conn, (batch) => {
        // Events are lost while the connection is down, as on the real service.
        if (!transport.online) return;
        const copy = clone(batch);
        setTimeout(() => {
          if (transport.online) events(copy);
        }, transport.latencyMs);
      });
      return () => {
        states.delete(state);
        detach();
      };
    },
  };
  return transport;
}

/**
 * Talk to a server through a function the browser check exposes (`window.__ssaCloudFake`): JSON
 * in, JSON out. Offline (as the browser reports it) means no answer.
 */
export function bindingTransport(binding: (request: string) => Promise<string>, online: () => boolean = () => typeof navigator === 'undefined' || navigator.onLine !== false): FakeTransport {
  return {
    async call(request) {
      if (!online()) throw new TypeError('Failed to fetch');
      return JSON.parse(await binding(JSON.stringify(request))) as FakeResponse;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

/** Options of a fake client. */
export interface FakeClientOptions {
  storage: AuthStorage;
  /** The key the session is kept under (supabase-js's `storageKey`). */
  storageKey?: string;
  now?: () => number;
  /** Seconds before expiry when a token is refreshed (supabase-js: 90). */
  marginSec?: number;
  /** Pause before a Realtime channel tries to join again. */
  rejoinMs?: number;
}

const networkAuthError = (): AuthErrorLike => ({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 });
const networkPgError = (): PgErrorLike => ({ message: 'TypeError: Failed to fetch', code: '', details: '', hint: '' });
const authError = (response: FakeResponse): AuthErrorLike => ({ name: 'AuthApiError', message: response.error?.message ?? 'error', status: response.status, code: response.error?.code });

/** A client with exactly the supabase-js surface the app uses, on a transport to a fake server. */
export function createFakeClient(transport: FakeTransport, options: FakeClientOptions): SupabaseLike {
  const storageKey = options.storageKey ?? 'session';
  const now = options.now ?? (() => Date.now());
  const margin = (options.marginSec ?? 90) * 1000;
  const rejoinMs = options.rejoinMs ?? 2000;
  const authListeners = new Set<(event: AuthEvent, session: SessionLike | null) => void>();
  const conn = `conn-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  let refreshing: Promise<{ session: SessionLike | null; error: AuthErrorLike | null }> | null = null;

  const read = (): SessionLike | null => {
    try {
      const raw = options.storage.getItem(storageKey);
      const value = raw ? (JSON.parse(raw) as unknown) : null;
      return isRec(value) && typeof value.access_token === 'string' && typeof value.refresh_token === 'string' && isRec(value.user) ? (value as unknown as SessionLike) : null;
    } catch {
      return null;
    }
  };
  const write = (session: SessionLike | null): void => {
    if (session) options.storage.setItem(storageKey, JSON.stringify(session));
    else options.storage.removeItem(storageKey);
  };
  const emit = (event: AuthEvent, session: SessionLike | null): void => {
    for (const listener of [...authListeners]) {
      void Promise.resolve().then(() => listener(event, session));
    }
  };

  async function call(request: FakeRequest): Promise<FakeResponse | null> {
    try {
      return await transport.call(request);
    } catch {
      return null; // no answer
    }
  }

  async function refreshSession(current: SessionLike): Promise<{ session: SessionLike | null; error: AuthErrorLike | null }> {
    refreshing ??= (async () => {
      const response = await call({ op: 'auth.refresh', refreshToken: current.refresh_token });
      if (!response) return { session: null, error: networkAuthError() }; // kept in storage: try again later
      if (response.error) {
        write(null);
        emit('SIGNED_OUT', null);
        return { session: null, error: authError(response) };
      }
      const session = (response.data as { session: SessionLike }).session;
      write(session);
      emit('TOKEN_REFRESHED', session);
      return { session, error: null };
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  const auth: SupabaseLike['auth'] = {
    async signInWithOtp({ email, options: otp }) {
      const response = await call({ op: 'auth.otp', email, createUser: otp?.shouldCreateUser !== false });
      if (!response) return { data: { user: null, session: null }, error: networkAuthError() };
      return response.error ? { data: { user: null, session: null }, error: authError(response) } : { data: { user: null, session: null }, error: null };
    },
    async verifyOtp({ email, token, type }) {
      const response = await call({ op: 'auth.verify', email, token, type });
      if (!response) return { data: { session: null, user: null }, error: networkAuthError() };
      if (response.error) return { data: { session: null, user: null }, error: authError(response) };
      const { session } = response.data as { session: SessionLike };
      write(session);
      emit('SIGNED_IN', session);
      return { data: { session, user: session.user }, error: null };
    },
    async getSession() {
      const session = read();
      if (!session) return { data: { session: null }, error: null };
      if ((session.expires_at ?? 0) * 1000 - now() > margin) return { data: { session }, error: null };
      const refreshed = await refreshSession(session);
      return { data: { session: refreshed.session }, error: refreshed.error };
    },
    async signOut(signOutOptions) {
      const scope = signOutOptions?.scope ?? 'global';
      const session = read();
      let error: AuthErrorLike | null = null;
      if (session) {
        const response = await call({ op: 'auth.signout', accessToken: session.access_token, scope });
        if (!response) error = networkAuthError();
        else if (response.error) error = authError(response);
      }
      // As supabase-js: the local session goes unless the server could not be told about a wider sign-out.
      if (scope !== 'others' && !(error && scope === 'global')) {
        write(null);
        emit('SIGNED_OUT', null);
      }
      return { error };
    },
    onAuthStateChange(callback) {
      authListeners.add(callback);
      void Promise.resolve().then(() => {
        if (authListeners.has(callback)) callback('INITIAL_SESSION', read());
      });
      return { data: { subscription: { unsubscribe: () => void authListeners.delete(callback) } } };
    },
  };

  async function token(): Promise<{ token: string | null } | { failed: PgResult<never> }> {
    const { data, error } = await auth.getSession();
    if (!data.session && error && error.status === 0) return { failed: { data: null, error: networkPgError(), status: 0 } };
    return { token: data.session?.access_token ?? null };
  }

  async function run<T>(build: (token: string | null) => FakeRequest): Promise<PgResult<T>> {
    const who = await token();
    if ('failed' in who) return who.failed;
    const response = await call(build(who.token));
    if (!response) return { data: null, error: networkPgError(), status: 0 };
    if (response.error) return { data: null, error: { message: response.error.message, code: response.error.code, details: null, hint: null }, status: response.status };
    return { data: response.data as T, error: null, status: response.status };
  }

  /** A chainable, awaitable query, as PostgREST's builders are. */
  class Query<T> implements FilterLike<T> {
    protected filters: FakeFilter[] = [];
    constructor(protected readonly build: (token: string | null, filters: FakeFilter[]) => FakeRequest) {}
    eq(column: string, value: string): this {
      this.filters.push({ column, op: 'eq', value: String(value) });
      return this;
    }
    neq(column: string, value: string): this {
      this.filters.push({ column, op: 'neq', value: String(value) });
      return this;
    }
    then<A = PgResult<T>, B = never>(onFulfilled?: ((value: PgResult<T>) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
      return run<T>((t) => this.build(t, this.filters)).then(onFulfilled, onRejected);
    }
  }

  class Select extends Query<Array<Record<string, unknown>>> implements SelectLike<Record<string, unknown>> {
    constructor(private readonly table: string, private readonly columns: string) {
      super((t, filters) => ({ op: 'db.select', token: t, table, columns, filters, single: false }));
    }
    maybeSingle(): PromiseLike<PgResult<Record<string, unknown>>> {
      const filters = this.filters;
      return run<Record<string, unknown>>((t) => ({ op: 'db.select', token: t, table: this.table, columns: this.columns, filters, single: true }));
    }
  }

  const from = (table: string): TableLike => ({
    select: (columns: string) => new Select(table, columns),
    upsert: (values: Record<string, unknown>, upsertOptions: { onConflict: string }) => {
      const row = clone(values);
      return new Query<null>((t) => ({ op: 'db.upsert', token: t, table, row, onConflict: upsertOptions.onConflict }));
    },
    delete: () => new Query<null>((t, filters) => ({ op: 'db.delete', token: t, table, filters })),
  });

  // -- Realtime -------------------------------------------------------------------------------

  const channels = new Map<string, FakeChannel>();
  /**
   * Every channel made and not yet fully closed, by name. As in realtime-js, `channel(name)` hands
   * back the one already there (even one still leaving after `removeChannel`), and only a channel
   * that has never joined subscribes: a leaving one ignores `subscribe()` and then closes.
   */
  const made = new Map<string, FakeChannel>();
  let polling = false;
  let detach: (() => void) | null = null;

  const deliver = (events: FakeEvent[]): void => {
    for (const event of events) channels.get(event.topic)?.receive(event.payload);
  };

  function receive(): void {
    if (transport.listen) {
      detach ??= transport.listen(conn, deliver, (up) => {
        for (const channel of channels.values()) channel.connection(up);
      });
      return;
    }
    if (polling) return;
    polling = true;
    void (async () => {
      while (channels.size > 0) {
        const response = await call({ op: 'rt.poll', conn });
        if (!response) {
          for (const channel of channels.values()) channel.connection(false);
          await new Promise((resolve) => setTimeout(resolve, rejoinMs));
          if (!channels.size) break;
          for (const channel of channels.values()) channel.connection(true);
          continue;
        }
        deliver((response.data as { events: FakeEvent[] }).events ?? []);
      }
      polling = false;
    })();
  }

  class FakeChannel implements ChannelLike {
    private bindings: Array<{ filter: ChangeFilter; callback: (payload: ChangePayload) => void }> = [];
    private status: ((status: ChannelStatus, error?: Error) => void) | undefined;
    private closed = false;
    private leaving = false;
    private subscribed = false;
    private joined = false;
    private retry: ReturnType<typeof setTimeout> | null = null;
    constructor(readonly topic: string) {}

    on(_type: 'postgres_changes', filter: ChangeFilter, callback: (payload: ChangePayload) => void): ChannelLike {
      // realtime-js refuses new postgres_changes bindings on a channel that is joining or joined.
      if (this.subscribed && !this.leaving && !this.closed) throw new Error(`cannot add \`postgres_changes\` callbacks for ${this.topic} after \`subscribe()\`.`);
      this.bindings.push({ filter, callback });
      return this;
    }

    subscribe(callback?: (status: ChannelStatus, error?: Error) => void): ChannelLike {
      // As realtime-js: a channel that is joining, joined or still leaving ignores this call.
      if (this.subscribed || this.leaving || this.closed) return this;
      this.subscribed = true;
      this.status = callback;
      channels.set(this.topic, this);
      void this.join();
      return this;
    }

    private async join(): Promise<void> {
      if (this.closed || this.leaving) return;
      const who = await token();
      const response = 'failed' in who ? null : await call({ op: 'rt.join', token: who.token, conn, topic: this.topic, bindings: this.bindings.map((b) => b.filter) });
      if (this.closed || this.leaving) return;
      if (!response || response.error) {
        this.joined = false;
        this.status?.('CHANNEL_ERROR', new Error('could not join'));
        this.retry = setTimeout(() => {
          this.retry = null;
          void this.join();
        }, rejoinMs);
        return;
      }
      this.joined = true;
      receive();
      this.status?.('SUBSCRIBED');
    }

    /** The connection dropped or came back. */
    connection(up: boolean): void {
      if (this.closed || this.leaving) return;
      if (!up) {
        if (this.joined) this.status?.('CHANNEL_ERROR', new Error('connection lost'));
        this.joined = false;
      } else if (!this.joined && this.retry === null) void this.join();
    }

    receive(payload: ChangePayload): void {
      if (this.closed || this.leaving) return;
      for (const binding of this.bindings) if (binding.filter.event === '*' || binding.filter.event === payload.eventType) binding.callback(clone(payload));
    }

    async close(): Promise<void> {
      if (this.closed || this.leaving) return;
      this.leaving = true;
      if (this.retry) clearTimeout(this.retry);
      if (channels.get(this.topic) === this) channels.delete(this.topic);
      if (!channels.size && detach) {
        detach();
        detach = null;
      }
      // Until the server has answered the leave, the channel is still the one `channel(name)` returns.
      await call({ op: 'rt.leave', conn, topic: this.topic });
      this.closed = true;
      this.leaving = false;
      if (made.get(this.topic) === this) made.delete(this.topic);
      this.status?.('CLOSED');
    }
  }

  return {
    auth,
    from,
    channel: (name: string) => {
      const existing = made.get(name);
      if (existing) return existing;
      const created = new FakeChannel(name);
      made.set(name, created);
      return created;
    },
    removeChannel: async (channel: ChannelLike) => {
      if (channel instanceof FakeChannel) await channel.close();
      return 'ok';
    },
  };
}
