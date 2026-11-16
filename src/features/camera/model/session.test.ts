import { describe, expect, it } from 'vitest';
import { MIN_CAMERA_SECONDS, NO_VISIT, visitActivities, type VisitTotals } from './session';

const info = { title: 'A minor pentatonic', params: ['scale', 'a', 'minor-pentatonic', 'box-1'], cameraFound: 0 };

describe('the practice log of a visit', () => {
  it('a short look at the camera is not a session; a real one is camera practice', () => {
    expect(visitActivities({ ...NO_VISIT, cameraSeconds: MIN_CAMERA_SECONDS - 1 }, NO_VISIT, info).activities).toEqual([]);
    const out = visitActivities({ ...NO_VISIT, cameraSeconds: 95.4 }, NO_VISIT, info);
    expect(out.activities).toEqual([expect.objectContaining({ kind: 'camera', durationSec: 95, route: 'camera', params: info.params, title: 'Live fretboard: A minor pentatonic' })]);
  });

  it('logged when the page hides, then again when the visit ends: only the new time, never twice', () => {
    const first = visitActivities({ ...NO_VISIT, cameraSeconds: 60 }, NO_VISIT, info);
    expect(first.activities[0].durationSec).toBe(60);
    // Nothing new since: nothing logged.
    expect(visitActivities({ ...NO_VISIT, cameraSeconds: 60 }, first.logged, info).activities).toEqual([]);
    // Back for a while after the tab was shown again.
    const second = visitActivities({ ...NO_VISIT, cameraSeconds: 100 }, first.logged, info);
    expect(second.activities).toEqual([expect.objectContaining({ kind: 'camera', durationSec: 40 })]);
    // A few seconds more are kept for later, not lost.
    const third = visitActivities({ ...NO_VISIT, cameraSeconds: 105 }, second.logged, info);
    expect(third.activities).toEqual([]);
    expect(third.logged.cameraSeconds).toBe(100);
  });

  it('finding notes on the drawn neck is fretboard practice, with its accuracy', () => {
    const now: VisitTotals = { cameraSeconds: 0, drawnSeconds: 74.6, drawnFound: 8, drawnMissed: 2 };
    const out = visitActivities(now, NO_VISIT, info);
    expect(out.activities).toEqual([expect.objectContaining({ kind: 'fretboard', count: 8, accuracy: 0.8, durationSec: 75 })]);
    // Not the camera achievement: no camera was used.
    expect(out.activities.some((a) => a.kind === 'camera')).toBe(false);
    // Just looking at the drawn neck, nothing found: nothing to log.
    expect(visitActivities({ ...NO_VISIT, drawnSeconds: 300 }, NO_VISIT, info).activities).toEqual([]);
    expect(visitActivities(now, out.logged, info).activities).toEqual([]);
  });

  it('the notes heard with the camera go with the camera session', () => {
    const out = visitActivities({ ...NO_VISIT, cameraSeconds: 30 }, NO_VISIT, { ...info, cameraFound: 5 });
    expect(out.activities[0]).toMatchObject({ kind: 'camera', count: 5 });
  });
});
