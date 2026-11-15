/**
 * Found in review: leaving the melody screen while the browser was still asking for the
 * microphone left it open (the tracker was only remembered once its start resolved, so the
 * screen's cleanup had nothing to stop). These tests pin the controller that replaced it.
 */
import { describe, expect, it } from 'vitest';
import type { TrackerStartResult } from '@/core/pitch';
import { MicNotes, type MicStatus, type MicTracker } from './mic';

/** A tracker whose start resolves when the test says so. */
function fakeTracker() {
  let resolveStart: (r: TrackerStartResult) => void = () => undefined;
  let noteFn: ((e: { midi: number }) => void) | null = null;
  const t = {
    stops: 0,
    started: 0,
    start: () => {
      t.started++;
      return new Promise<TrackerStartResult>((r) => (resolveStart = r));
    },
    stop: () => {
      t.stops++;
    },
    on: (_type: 'noteon', fn: (e: { midi: number }) => void) => {
      noteFn = fn;
    },
    onStatus: () => undefined,
    grant: () => resolveStart({ ok: true }),
    refuse: () => resolveStart({ ok: false, reason: 'denied' }),
    play: (midi: number) => noteFn?.({ midi }),
  };
  return t;
}

function rig(ignore = () => false) {
  const tracker = fakeTracker();
  const notes: number[] = [];
  const states: MicStatus[] = [];
  const mic = new MicNotes(() => tracker as unknown as MicTracker, { note: (m) => notes.push(m), ignore, status: (s) => states.push(s) });
  return { tracker, notes, states, mic };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('microphone notes', () => {
  it('releases the microphone when the screen goes away during the permission prompt', async () => {
    const { tracker, mic, states } = rig();
    const started = mic.start();
    mic.dispose();
    tracker.grant();
    await started;
    expect(tracker.stops).toBeGreaterThanOrEqual(1);
    expect(states).not.toContain('on');
  });

  it('a stop during the prompt also releases it, and the next start opens a fresh one', async () => {
    const { tracker, mic, states } = rig();
    const first = mic.start();
    mic.stop();
    tracker.grant();
    await first;
    expect(tracker.stops).toBeGreaterThanOrEqual(1);
    expect(states[states.length - 1]).toBe('off');
  });

  it('passes on notes played, but not what the app itself is playing, nor knocks below B♭2', async () => {
    let appPlaying = false;
    const { tracker, mic, notes, states } = rig(() => appPlaying);
    const started = mic.start();
    tracker.grant();
    await started;
    expect(states[states.length - 1]).toBe('on');
    tracker.play(62);
    appPlaying = true;
    tracker.play(64);
    appPlaying = false;
    tracker.play(43);
    tracker.play(64);
    expect(notes).toEqual([62, 64]);
    mic.dispose();
    expect(tracker.stops).toBe(1);
    tracker.play(65);
    expect(notes).toEqual([62, 64]);
  });

  it('reports a refusal so the screen can offer tapping instead', async () => {
    const { tracker, mic, states } = rig();
    const started = mic.start();
    tracker.refuse();
    await started;
    await tick();
    expect(states).toEqual(['starting', 'failed']);
    expect(tracker.stops).toBe(1);
  });
});
