/**
 * The practice session as a pure state machine: one block at a time, each with its own countdown,
 * driven by a wall clock that the caller passes in (`now`, epoch ms). Nothing here reads the time
 * or touches storage, so the runner, the global bar, reloads and tests all agree.
 *
 * Time rules:
 *  - While running, the time between two observations is practice time. Gaps up to
 *    `AWAY_LIMIT_MS` (a locked phone, a throttled background tab, a reload) count in full and
 *    may finish several blocks at once.
 *  - A longer gap (the learner walked away, or the clock jumped forward) counts only up to the end
 *    of the block they were on; then the session pauses itself and says so.
 *  - The clock going backwards counts nothing and never takes time away.
 *  - Paused time never counts.
 */
import type { Area, BlockTarget } from './areas';
import { isArea } from './areas';
import type { PlanBlock } from './planner';

/** What became of a block. */
export type BlockOutcome = 'pending' | 'done' | 'partial' | 'skipped';
/** Where the session is. */
export type SessionStatus = 'running' | 'paused' | 'finished';

/** A block as the session runs it. */
export interface SessionBlock {
  id: string;
  area: Area;
  title: string;
  goal: string;
  steps?: string[];
  reason?: string;
  target: BlockTarget | null;
  extra?: BlockTarget;
  itemId?: string;
  skillId?: string;
  goalId?: string;
  /** Planned length in seconds (the learner can add time while it runs). */
  plannedSec: number;
}

/** What logging the finished session produced, kept for the summary screen. */
export interface SessionResult {
  /** False when the session was too short to keep. */
  saved: boolean;
  /** Journal entry id. */
  entryId?: string;
  /** XP awarded. */
  xp: number;
  /** Seconds logged as practice (overlap with activities recorded elsewhere removed). */
  loggedSec: number;
  goalMet: boolean;
  goalMetNow: boolean;
  streak: number;
  streakExtended: boolean;
  leveledUp: boolean;
  level: number;
}

/** The whole session. Plain JSON, so it can be saved and restored after a reload. */
export interface SessionState {
  v: 1;
  id: string;
  title: string;
  routineId?: string;
  blocks: SessionBlock[];
  /** Practice time spent in each block, ms. */
  spentMs: number[];
  outcome: BlockOutcome[];
  /** The current block. */
  index: number;
  status: SessionStatus;
  /** Why it is paused. */
  pausedBy: 'learner' | 'away' | null;
  startedAt: number;
  /** The last moment the clock was looked at. */
  seenAt: number;
  endedAt: number | null;
  /** Ended with "End session" before the last block. */
  endedEarly: boolean;
  /** Set once the session was written to the progress log and the journal. */
  result: SessionResult | null;
  /** Bumped on every change (for syncing tabs). */
  rev: number;
}

/** Things that happened during a step, for sounds and announcements. */
export type SessionEvent =
  | { type: 'block-done'; index: number }
  | { type: 'block-start'; index: number }
  | { type: 'finished'; early: boolean }
  | { type: 'away'; gapMs: number }
  | { type: 'paused' }
  | { type: 'resumed' };

/** The result of a step: the new state and what happened. */
export interface SessionStep {
  state: SessionState;
  events: SessionEvent[];
}

/** Gaps longer than this pause the session instead of counting. */
export const AWAY_LIMIT_MS = 15 * 60_000;
/** A block left before this much time counts as skipped rather than partly done. */
export const SKIP_BELOW_MS = 10_000;
/** Longest a block can be made by adding time. */
export const MAX_BLOCK_SEC = 60 * 60;

/** Start a session from plan blocks. */
export function startSession(blocks: readonly PlanBlock[], now: number, meta: { id: string; title: string; routineId?: string }): SessionState {
  const list: SessionBlock[] = blocks.map((b) => ({
    id: b.id,
    area: b.area,
    title: b.title,
    goal: b.goal,
    steps: b.steps,
    reason: b.reason,
    target: b.target,
    extra: b.extra,
    itemId: b.itemId,
    skillId: b.skillId,
    goalId: b.goalId,
    plannedSec: Math.max(1, Math.round(b.minutes * 60)),
  }));
  return {
    v: 1,
    id: meta.id,
    title: meta.title,
    routineId: meta.routineId,
    blocks: list,
    spentMs: list.map(() => 0),
    outcome: list.map(() => 'pending'),
    index: 0,
    status: list.length > 0 ? 'running' : 'finished',
    pausedBy: null,
    startedAt: now,
    seenAt: now,
    endedAt: list.length > 0 ? null : now,
    endedEarly: false,
    result: null,
    rev: 1,
  };
}

function clone(s: SessionState): SessionState {
  return { ...s, spentMs: [...s.spentMs], outcome: [...s.outcome], blocks: s.blocks.map((b) => ({ ...b })) };
}

function plannedMsOf(s: SessionState, i: number): number {
  return (s.blocks[i]?.plannedSec ?? 0) * 1000;
}

/** Credit `ms` of practice starting at `from`; finishes blocks (and the session) as their time runs out. */
function credit(s: SessionState, ms: number, from: number, events: SessionEvent[]): void {
  let left = ms;
  let at = from;
  while (left > 0 && s.status === 'running') {
    const i = s.index;
    const rem = plannedMsOf(s, i) - s.spentMs[i];
    if (left < rem) {
      s.spentMs[i] += left;
      return;
    }
    s.spentMs[i] = plannedMsOf(s, i);
    left -= Math.max(0, rem);
    at += Math.max(0, rem);
    s.outcome[i] = 'done';
    events.push({ type: 'block-done', index: i });
    if (i >= s.blocks.length - 1) {
      s.status = 'finished';
      s.endedAt = at;
      events.push({ type: 'finished', early: false });
      return;
    }
    s.index = i + 1;
    events.push({ type: 'block-start', index: s.index });
  }
}

/** Bring the session up to `now`. Call before reading it and before every action. */
export function advance(state: SessionState, now: number): SessionStep {
  if (!Number.isFinite(now)) return { state, events: [] };
  if (state.status !== 'running') {
    if (state.seenAt === now) return { state, events: [] };
    return { state: { ...state, seenAt: now }, events: [] };
  }
  const delta = now - state.seenAt;
  if (delta === 0) return { state, events: [] };
  const s = clone(state);
  const events: SessionEvent[] = [];
  if (delta < 0) {
    // The clock went back: count nothing, measure from here on.
    s.seenAt = now;
    return { state: s, events };
  }
  if (delta > AWAY_LIMIT_MS) {
    const rem = Math.max(0, plannedMsOf(s, s.index) - s.spentMs[s.index]);
    credit(s, Math.min(delta, rem), s.seenAt, events);
    if (s.status === 'running') {
      s.status = 'paused';
      s.pausedBy = 'away';
      events.push({ type: 'away', gapMs: delta });
    }
  } else {
    credit(s, delta, s.seenAt, events);
  }
  s.seenAt = now;
  s.rev = state.rev + 1;
  return { state: s, events };
}

function bumped(s: SessionState): SessionState {
  return { ...s, rev: s.rev + 1 };
}

/** Pause the clock. */
export function pauseSession(state: SessionState, now: number): SessionStep {
  const step = advance(state, now);
  if (step.state.status !== 'running') return step;
  return { state: bumped({ ...step.state, status: 'paused', pausedBy: 'learner', seenAt: now }), events: [...step.events, { type: 'paused' }] };
}

/** Start the clock again from where it was paused. */
export function resumeSession(state: SessionState, now: number): SessionStep {
  if (state.status !== 'paused') return advance(state, now);
  return { state: bumped({ ...state, status: 'running', pausedBy: null, seenAt: now }), events: [{ type: 'resumed' }] };
}

/** Pause or resume. */
export function togglePause(state: SessionState, now: number): SessionStep {
  return state.status === 'paused' ? resumeSession(state, now) : pauseSession(state, now);
}

function outcomeOf(spent: number, planned: number): BlockOutcome {
  if (spent >= planned) return 'done';
  return spent >= SKIP_BELOW_MS ? 'partial' : 'skipped';
}

/** Move on to the next block now (the clock runs again if it was paused). The last block finishes the session. */
export function nextBlock(state: SessionState, now: number): SessionStep {
  const step = advance(state, now);
  if (step.state.status === 'finished') return step;
  const s = clone(step.state);
  const events = [...step.events];
  const i = s.index;
  s.outcome[i] = outcomeOf(s.spentMs[i], plannedMsOf(s, i));
  events.push({ type: 'block-done', index: i });
  if (i >= s.blocks.length - 1) {
    s.status = 'finished';
    s.endedAt = now;
    events.push({ type: 'finished', early: false });
  } else {
    s.index = i + 1;
    s.status = 'running';
    s.pausedBy = null;
    events.push({ type: 'block-start', index: s.index });
  }
  s.seenAt = now;
  return { state: bumped(s), events };
}

/** Give the current block more time (seconds; negative takes time away, never below what was spent). */
export function extendBlock(state: SessionState, now: number, seconds: number): SessionStep {
  const step = advance(state, now);
  if (step.state.status === 'finished' || !Number.isFinite(seconds)) return step;
  const s = clone(step.state);
  const b = s.blocks[s.index];
  const spentSec = Math.ceil(s.spentMs[s.index] / 1000);
  b.plannedSec = Math.min(MAX_BLOCK_SEC, Math.max(spentSec + 1, Math.round(b.plannedSec + seconds)));
  return { state: bumped(s), events: step.events };
}

/** End the session now, keeping the time practised so far. */
export function endSession(state: SessionState, now: number): SessionStep {
  const step = advance(state, now);
  if (step.state.status === 'finished') return step;
  const s = clone(step.state);
  s.outcome[s.index] = outcomeOf(s.spentMs[s.index], plannedMsOf(s, s.index));
  for (let i = s.index + 1; i < s.blocks.length; i++) s.outcome[i] = 'skipped';
  s.status = 'finished';
  s.endedAt = now;
  s.endedEarly = true;
  s.seenAt = now;
  return { state: bumped(s), events: [...step.events, { type: 'finished', early: true }] };
}

/** Attach what logging produced. */
export function withResult(state: SessionState, result: SessionResult): SessionState {
  return bumped({ ...state, result });
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

/** The block being worked on, or null once finished. */
export function currentBlock(s: SessionState): SessionBlock | null {
  return s.status === 'finished' ? null : (s.blocks[s.index] ?? null);
}

/** Milliseconds left in the current block. */
export function blockRemainingMs(s: SessionState): number {
  if (s.status === 'finished') return 0;
  return Math.max(0, plannedMsOf(s, s.index) - s.spentMs[s.index]);
}

/** Practice time so far, ms. */
export function practisedMs(s: SessionState): number {
  return s.spentMs.reduce((a, b) => a + b, 0);
}

/** The planned length of the whole session, ms. */
export function plannedMs(s: SessionState): number {
  return s.blocks.reduce((a, b) => a + b.plannedSec * 1000, 0);
}

/** Time left in the whole session if every remaining block runs its full time, ms. */
export function sessionRemainingMs(s: SessionState): number {
  if (s.status === 'finished') return 0;
  let ms = blockRemainingMs(s);
  for (let i = s.index + 1; i < s.blocks.length; i++) ms += plannedMsOf(s, i);
  return ms;
}

/** Blocks that ran their full time. */
export function blocksDone(s: SessionState): number {
  return s.outcome.filter((o) => o === 'done').length;
}

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseTarget(v: unknown): BlockTarget | null {
  if (!isObj(v) || !isStr(v.route) || !isStr(v.label)) return null;
  const params = Array.isArray(v.params) ? v.params.filter(isStr) : [];
  return { route: v.route, params, label: v.label };
}

function parseBlock(v: unknown): SessionBlock | null {
  if (!isObj(v) || !isStr(v.id) || !isArea(v.area) || !isStr(v.title) || !isStr(v.goal) || !isNum(v.plannedSec) || v.plannedSec <= 0) return null;
  return {
    id: v.id,
    area: v.area,
    title: v.title,
    goal: v.goal,
    steps: Array.isArray(v.steps) ? v.steps.filter(isStr) : undefined,
    reason: isStr(v.reason) ? v.reason : undefined,
    target: parseTarget(v.target),
    extra: parseTarget(v.extra) ?? undefined,
    itemId: isStr(v.itemId) ? v.itemId : undefined,
    skillId: isStr(v.skillId) ? v.skillId : undefined,
    goalId: isStr(v.goalId) ? v.goalId : undefined,
    plannedSec: Math.min(MAX_BLOCK_SEC, Math.round(v.plannedSec)),
  };
}

const OUTCOMES: readonly BlockOutcome[] = ['pending', 'done', 'partial', 'skipped'];

function parseResult(v: unknown): SessionResult | null {
  if (!isObj(v) || typeof v.saved !== 'boolean') return null;
  return {
    saved: v.saved,
    entryId: isStr(v.entryId) ? v.entryId : undefined,
    xp: isNum(v.xp) ? v.xp : 0,
    loggedSec: isNum(v.loggedSec) ? v.loggedSec : 0,
    goalMet: v.goalMet === true,
    goalMetNow: v.goalMetNow === true,
    streak: isNum(v.streak) ? v.streak : 0,
    streakExtended: v.streakExtended === true,
    leveledUp: v.leveledUp === true,
    level: isNum(v.level) ? v.level : 1,
  };
}

/** Read a saved session back; anything malformed gives null (never throws). */
export function parseSession(value: unknown): SessionState | null {
  if (!isObj(value) || value.v !== 1 || !isStr(value.id) || !Array.isArray(value.blocks)) return null;
  const blocks = value.blocks.map(parseBlock);
  if (blocks.length === 0 || blocks.some((b) => b === null)) return null;
  const list = blocks as SessionBlock[];
  const n = list.length;
  const spent = Array.isArray(value.spentMs) ? value.spentMs : [];
  const outcome = Array.isArray(value.outcome) ? value.outcome : [];
  const status: SessionStatus = value.status === 'paused' || value.status === 'finished' ? value.status : 'running';
  if (!isNum(value.startedAt) || !isNum(value.seenAt)) return null;
  const index = isNum(value.index) ? Math.min(n - 1, Math.max(0, Math.floor(value.index))) : 0;
  return {
    v: 1,
    id: value.id,
    title: isStr(value.title) ? value.title : 'Practice session',
    routineId: isStr(value.routineId) ? value.routineId : undefined,
    blocks: list,
    spentMs: list.map((b, i) => Math.min(b.plannedSec * 1000, Math.max(0, isNum(spent[i]) ? spent[i] : 0))),
    outcome: list.map((_, i) => (OUTCOMES.includes(outcome[i] as BlockOutcome) ? (outcome[i] as BlockOutcome) : 'pending')),
    index,
    status,
    pausedBy: value.pausedBy === 'learner' || value.pausedBy === 'away' ? value.pausedBy : status === 'paused' ? 'learner' : null,
    startedAt: value.startedAt,
    seenAt: value.seenAt,
    endedAt: isNum(value.endedAt) ? value.endedAt : status === 'finished' ? value.seenAt : null,
    endedEarly: value.endedEarly === true,
    result: parseResult(value.result),
    rev: isNum(value.rev) ? value.rev : 1,
  };
}
