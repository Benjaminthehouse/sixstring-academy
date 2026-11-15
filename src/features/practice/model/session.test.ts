import { describe, expect, it } from 'vitest';
import type { PlanBlock } from './planner';
import {
  AWAY_LIMIT_MS,
  advance,
  blockRemainingMs,
  blocksDone,
  currentBlock,
  endSession,
  extendBlock,
  nextBlock,
  parseSession,
  pauseSession,
  plannedMs,
  practisedMs,
  resumeSession,
  sessionRemainingMs,
  startSession,
  togglePause,
  type SessionState,
} from './session';

const T0 = Date.UTC(2026, 10, 15, 18, 0, 0);
const S = 1000;
const M = 60_000;

function block(id: string, minutes: number): PlanBlock {
  return { id, area: id === 'w' ? 'warmup' : 'scales', minutes, title: `Block ${id}`, goal: 'Do the thing slowly.', target: { route: 'scales', params: [], label: 'Open Scales' } };
}

/** A five-minute session: 1 + 2 + 2 minutes. */
function fiveMinutes(): SessionState {
  return startSession([block('w', 1), block('a', 2), block('b', 2)], T0, { id: 's1', title: '5-minute plan' });
}

/** Advance in steps of `stepMs` up to `until`, collecting events. */
function run(s: SessionState, from: number, until: number, stepMs = S) {
  let state = s;
  const events: string[] = [];
  for (let t = from + stepMs; t <= until; t += stepMs) {
    const step = advance(state, t);
    state = step.state;
    events.push(...step.events.map((e) => e.type));
  }
  return { state, events };
}

describe('a session', () => {
  it('starts on the first block with the planned time', () => {
    const s = fiveMinutes();
    expect(s.status).toBe('running');
    expect(currentBlock(s)?.id).toBe('w');
    expect(plannedMs(s)).toBe(5 * M);
    expect(blockRemainingMs(s)).toBe(M);
    expect(sessionRemainingMs(s)).toBe(5 * M);
  });

  it('counts down, moves to the next block when time is up, and finishes exactly on time', () => {
    const { state, events } = run(fiveMinutes(), T0, T0 + 5 * M);
    expect(state.status).toBe('finished');
    expect(state.endedAt).toBe(T0 + 5 * M);
    expect(practisedMs(state)).toBe(5 * M);
    expect(blocksDone(state)).toBe(3);
    expect(events.filter((e) => e === 'block-done')).toHaveLength(3);
    expect(events.filter((e) => e === 'block-start')).toHaveLength(2);
    expect(events.filter((e) => e === 'finished')).toHaveLength(1);
    expect(state.endedEarly).toBe(false);
  });

  it('carries leftover time into the next block in one big step', () => {
    const step = advance(fiveMinutes(), T0 + 90 * S);
    expect(step.state.index).toBe(1);
    expect(step.state.spentMs).toEqual([M, 30 * S, 0]);
    expect(step.events.map((e) => e.type)).toEqual(['block-done', 'block-start']);
  });

  it('finishes several blocks at once after a gap under the away limit (locked phone)', () => {
    const step = advance(fiveMinutes(), T0 + 4 * M);
    expect(step.state.index).toBe(2);
    expect(step.state.status).toBe('running');
    expect(blockRemainingMs(step.state)).toBe(M);
  });

  it('does not count paused time, and resumes where it stopped', () => {
    let s = advance(fiveMinutes(), T0 + 20 * S).state;
    s = pauseSession(s, T0 + 20 * S).state;
    expect(s.status).toBe('paused');
    expect(s.pausedBy).toBe('learner');
    s = advance(s, T0 + 10 * M).state;
    expect(practisedMs(s)).toBe(20 * S);
    s = resumeSession(s, T0 + 10 * M).state;
    s = advance(s, T0 + 10 * M + 15 * S).state;
    expect(practisedMs(s)).toBe(35 * S);
    expect(blockRemainingMs(s)).toBe(25 * S);
    // Toggle twice is a no-op on the clock.
    s = togglePause(togglePause(s, T0 + 10 * M + 15 * S).state, T0 + 10 * M + 15 * S).state;
    expect(s.status).toBe('running');
  });

  it('skips ahead: partial, skipped, and the last block finishes the session', () => {
    let s = advance(fiveMinutes(), T0 + 30 * S).state;
    s = nextBlock(s, T0 + 30 * S).state;
    expect(s.outcome[0]).toBe('partial');
    expect(s.index).toBe(1);
    s = nextBlock(s, T0 + 35 * S).state;
    expect(s.outcome[1]).toBe('skipped');
    const last = nextBlock(s, T0 + 40 * S);
    expect(last.state.status).toBe('finished');
    expect(last.state.endedAt).toBe(T0 + 40 * S);
    expect(last.events.some((e) => e.type === 'finished')).toBe(true);
    // Nothing moves after the end.
    expect(nextBlock(last.state, T0 + M).state).toEqual(advance(last.state, T0 + M).state);
  });

  it('Next while paused moves on and starts the clock again', () => {
    let s = pauseSession(fiveMinutes(), T0 + 5 * S).state;
    s = nextBlock(s, T0 + 2 * M).state;
    expect(s.status).toBe('running');
    expect(s.index).toBe(1);
    s = advance(s, T0 + 2 * M + 10 * S).state;
    expect(s.spentMs[1]).toBe(10 * S);
  });

  it('adds time to a block, never below what was already spent', () => {
    let s = advance(fiveMinutes(), T0 + 40 * S).state;
    s = extendBlock(s, T0 + 40 * S, 60).state;
    expect(blockRemainingMs(s)).toBe(80 * S);
    s = extendBlock(s, T0 + 40 * S, -600).state;
    expect(s.blocks[0].plannedSec).toBe(41);
  });

  it('ends early and keeps the time practised', () => {
    let s = advance(fiveMinutes(), T0 + 100 * S).state;
    const step = endSession(s, T0 + 100 * S);
    s = step.state;
    expect(s.status).toBe('finished');
    expect(s.endedEarly).toBe(true);
    expect(practisedMs(s)).toBe(100 * S);
    expect(s.outcome).toEqual(['done', 'partial', 'skipped']);
    expect(step.events.at(-1)).toEqual({ type: 'finished', early: true });
  });

  it('survives a reload: saved, read back, and the seconds of the reload count', () => {
    const before = advance(fiveMinutes(), T0 + 75 * S).state;
    const saved = JSON.parse(JSON.stringify(before));
    const restored = parseSession(saved);
    expect(restored).toEqual(before);
    const after = advance(restored as SessionState, T0 + 78 * S).state;
    expect(after.index).toBe(1);
    expect(after.spentMs[1]).toBe(18 * S);
  });

  it('pauses itself after a long absence, counting only to the end of that block', () => {
    let s = advance(fiveMinutes(), T0 + 70 * S).state; // 10 s into block 2
    const step = advance(s, T0 + 70 * S + AWAY_LIMIT_MS + M);
    s = step.state;
    expect(s.status).toBe('paused');
    expect(s.pausedBy).toBe('away');
    expect(s.index).toBe(2); // block 2 completed, block 3 waiting
    expect(s.spentMs).toEqual([M, 2 * M, 0]);
    expect(step.events.map((e) => e.type)).toEqual(['block-done', 'block-start', 'away']);
    s = resumeSession(s, T0 + 3 * 3600 * S).state;
    s = advance(s, T0 + 3 * 3600 * S + 30 * S).state;
    expect(s.spentMs[2]).toBe(30 * S);
  });

  it('treats a huge forward clock jump on the last block as away and finishes that block', () => {
    let s = advance(fiveMinutes(), T0 + 4 * M).state;
    s = advance(s, T0 + 4 * M + 5 * 3600 * S).state;
    expect(s.status).toBe('finished');
    expect(practisedMs(s)).toBe(5 * M);
    expect(s.endedAt).toBe(T0 + 5 * M);
  });

  it('counts nothing when the clock goes backwards, then counts from the new time', () => {
    let s = advance(fiveMinutes(), T0 + 30 * S).state;
    s = advance(s, T0 - 3600 * S).state;
    expect(practisedMs(s)).toBe(30 * S);
    expect(s.seenAt).toBe(T0 - 3600 * S);
    s = advance(s, T0 - 3600 * S + 10 * S).state;
    expect(practisedMs(s)).toBe(40 * S);
    // NaN is ignored.
    expect(advance(s, Number.NaN).state).toBe(s);
  });

  it('rejects malformed saved data and repairs what it can', () => {
    for (const bad of [null, 1, 'x', {}, { v: 2 }, { v: 1, id: 'a', blocks: [] }, { v: 1, id: 'a', blocks: [{ id: 'x' }], startedAt: 0, seenAt: 0 }]) {
      expect(parseSession(bad)).toBeNull();
    }
    const raw = JSON.parse(JSON.stringify(fiveMinutes()));
    raw.spentMs = [999_999_999, -5, 'x'];
    raw.index = 42;
    raw.outcome = ['nope'];
    const s = parseSession(raw) as SessionState;
    expect(s.spentMs).toEqual([M, 0, 0]);
    expect(s.index).toBe(2);
    expect(s.outcome).toEqual(['pending', 'pending', 'pending']);
  });

  it('bumps the revision on every change, for syncing tabs', () => {
    const s = fiveMinutes();
    const a = advance(s, T0 + S).state;
    const b = pauseSession(a, T0 + S).state;
    expect(a.rev).toBeGreaterThan(s.rev);
    expect(b.rev).toBeGreaterThan(a.rev);
  });
});
