import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as audio from '@/core/audio';
import { remove } from '@/core/platform/storage';
import { setProgressStore } from '@/core/progress';
import { makeRig, type TestRig } from '@/core/progress/testkit';
import { getPracticeData, setPracticeDataForTests, emptyPracticeData, PRACTICE_DATA_KEY } from '../model/store';
import type { PlanBlock } from '../model/planner';
import { parseSession } from '../model/session';
import {
  SESSION_KEY,
  dismissPractice,
  endPractice,
  getSessionView,
  nextPracticeBlock,
  pausePractice,
  refreshPractice,
  resetSessionForTests,
  resumePractice,
  setSessionClock,
  startPracticeSession,
} from './controller';

// The controller loads the audio engine lazily; here it is a spy.
vi.mock('@/core/audio', () => ({ playUi: vi.fn(() => true), unlockAudio: vi.fn(async () => true) }));

/** Let the controller's lazy import of the audio engine resolve. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

const blocks: PlanBlock[] = [
  { id: 'a', area: 'warmup', minutes: 1, title: 'Warm-up', goal: 'Easy.', target: null },
  { id: 'b', area: 'scales', minutes: 2, title: 'Box 2', goal: 'Slowly.', target: { route: 'scales', params: [], label: 'Open Scales' }, skillId: 'scale:a-minor-pentatonic:box-2' },
  { id: 'c', area: 'repertoire', minutes: 2, title: 'Song', goal: 'Play.', target: { route: 'songs', params: [], label: 'Open Songs' } },
];

let rig: TestRig;

beforeEach(() => {
  rig = makeRig({ start: '2026-11-15T18:00:00Z' });
  setProgressStore(rig.store);
  setSessionClock(() => rig.clock.now());
  remove(SESSION_KEY);
  remove(PRACTICE_DATA_KEY);
  setPracticeDataForTests(emptyPracticeData());
  resetSessionForTests();
});

afterEach(() => {
  resetSessionForTests();
  setProgressStore(null);
});

/** Move the test clock and let the controller see it. */
function wait(seconds: number) {
  rig.clock.advance(seconds * 1000);
  refreshPractice();
}

describe('the session controller', () => {
  it('runs a five-minute session, logs it once with XP, and writes the journal', () => {
    // A learned skill that has gone rusty: the refresh block should bring it back.
    rig.actions.recordActivity({ kind: 'scale-game', id: 'scale:a-minor-pentatonic:box-2', accuracy: 0.9, durationSec: 60 });
    rig.clock.days(20);
    const xpBefore = rig.store.getState().xp.total;
    const startedAt = rig.clock.now();
    startPracticeSession(blocks, { title: '5-minute plan' });
    expect(getSessionView()?.block?.id).toBe('a');
    wait(45);
    expect(getSessionView()?.remainingSec).toBe(15);
    wait(20);
    expect(getSessionView()?.block?.id).toBe('b');
    for (let i = 0; i < 30; i++) wait(10);
    const view = getSessionView();
    expect(view?.state.status).toBe('finished');
    expect(view?.state.result).toMatchObject({ saved: true, loggedSec: 300 });
    const state = rig.store.getState();
    const log = state.log.filter((e) => e.kind === 'practice');
    expect(log).toHaveLength(1);
    expect(log[0].durationSec).toBe(300);
    expect(log[0].xp).toBe(10); // 2 XP a minute
    expect(state.xp.total - xpBefore).toBe(view?.state.result?.xp);
    // Refreshed when the session ended (300 s in, at the tick that crossed it).
    expect(state.skills['scale:a-minor-pentatonic:box-2'].lastAt).toBe(startedAt + 305_000);
    expect(getPracticeData().journal[0]).toMatchObject({ practisedSec: 300, xp: 10, title: '5-minute plan' });
    // More ticks after the end change nothing and log nothing.
    wait(60);
    expect(rig.store.getState().log.filter((e) => e.kind === 'practice')).toHaveLength(1);
    dismissPractice();
    expect(getSessionView()).toBeNull();
  });

  it('resumes after a reload in the middle of a block', () => {
    startPracticeSession(blocks, { title: 'Plan' });
    wait(80); // 20 s into block 2
    resetSessionForTests(); // the page goes away; storage keeps the session
    rig.clock.advance(4000); // the reload takes four seconds
    const view = getSessionView();
    expect(view?.block?.id).toBe('b');
    expect(view?.practisedSec).toBe(84);
    expect(view?.state.status).toBe('running');
  });

  it('pauses, skips and ends early, logging only what was practised', () => {
    startPracticeSession(blocks, { title: 'Plan' });
    wait(30);
    pausePractice();
    wait(600);
    expect(getSessionView()?.practisedSec).toBe(30);
    resumePractice();
    nextPracticeBlock();
    wait(40);
    endPractice();
    const view = getSessionView();
    expect(view?.state.endedEarly).toBe(true);
    expect(view?.state.result?.loggedSec).toBe(70);
    expect(rig.store.getState().log[0]).toMatchObject({ kind: 'practice', durationSec: 70 });
    expect(getPracticeData().journal[0].blocks.map((b) => b.outcome)).toEqual(['partial', 'partial', 'skipped']);
  });

  it('chimes when a block ends and once more when the session ends', async () => {
    const playUi = vi.mocked(audio.playUi);
    playUi.mockClear();
    startPracticeSession(blocks, { title: 'Plan' });
    wait(59);
    await flush();
    expect(playUi).not.toHaveBeenCalled();
    wait(2);
    await flush();
    expect(playUi.mock.calls.map((c) => c[0])).toEqual(['correct']);
    for (let i = 0; i < 25; i++) wait(10);
    await flush();
    const names = playUi.mock.calls.map((c) => c[0]);
    expect(names).toHaveLength(3); // block 1, block 2, and the end
    expect(['correct', 'lessonComplete']).toContain(names[2]);
  });

  it('keeps nothing from a session under half a minute', () => {
    startPracticeSession(blocks, { title: 'Plan' });
    wait(10);
    endPractice();
    expect(getSessionView()?.state.result).toMatchObject({ saved: false, xp: 0 });
    expect(rig.store.getState().log).toHaveLength(0);
    expect(getPracticeData().journal).toHaveLength(0);
  });

  it('does not count time twice when another screen recorded an activity during the session', () => {
    startPracticeSession(blocks, { title: 'Plan' });
    wait(100);
    rig.actions.recordActivity({ kind: 'scale-game', durationSec: 60, accuracy: 0.8 });
    wait(200);
    expect(getSessionView()?.state.result?.loggedSec).toBe(240);
  });

  it('keeps the practised time when another activity was recorded during a pause', () => {
    startPracticeSession(blocks, { title: 'Plan' });
    wait(60);
    pausePractice();
    wait(200);
    // A two-minute scale game, finished while the session's clock stood still.
    rig.actions.recordActivity({ kind: 'scale-game', durationSec: 120, accuracy: 0.8 });
    wait(10);
    resumePractice();
    wait(60);
    endPractice();
    const view = getSessionView();
    expect(view?.practisedSec).toBe(120);
    expect(view?.state.runs.length).toBe(2);
    expect(view?.state.result?.loggedSec).toBe(120);
  });

  it('reads a session saved before practice spans were kept as one span from start to end', () => {
    startPracticeSession(blocks, { title: 'Plan' });
    wait(40);
    const saved = JSON.parse(JSON.stringify(getSessionView()!.state)) as Record<string, unknown>;
    delete saved.runs;
    const parsed = parseSession(saved);
    expect(parsed?.runs).toEqual([[parsed!.startedAt, parsed!.seenAt]]);
  });
});
