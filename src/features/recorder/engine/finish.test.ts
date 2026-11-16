import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordActivity = vi.fn();
vi.mock('@/core/progress', () => ({ recordActivity: (input: unknown) => recordActivity(input) }));

import { createTakeStore, memoryBackend } from '../model/store';
import { PEAK_COUNT } from '../model/signal';
import { reportPractice, storeRecording } from './finish';
import type { FinishedRecording } from './session';

const START = Date.UTC(2026, 10, 16, 14, 0);

function recording(patch: Partial<FinishedRecording> = {}): FinishedRecording {
  return {
    blob: new Blob([new Uint8Array(4000)], { type: 'audio/webm;codecs=opus' }),
    mimeType: 'audio/webm;codecs=opus',
    durationMs: 12_400,
    startedAt: START,
    bpm: 80,
    envelope: [0, 0.2, 0.6, 0.3],
    hitLimit: false,
    ...patch,
  };
}

describe('storing a finished recording', () => {
  beforeEach(() => recordActivity.mockClear());

  it('stores the take with its audio, an automatic name and the meter waveform when it cannot be decoded', async () => {
    const store = createTakeStore(memoryBackend());
    // Node has no Web Audio, so the take cannot be decoded here: the meter readings stand in.
    const { take, list } = await storeRecording(store, recording(), { name: '', label: null });
    expect(take).toMatchObject({ name: 'Take 1', label: null, createdAt: START, durationMs: 12_400, bytes: 4000, bpm: 80, mimeType: 'audio/webm;codecs=opus' });
    expect(take.peaks).toHaveLength(PEAK_COUNT);
    expect(Math.max(...take.peaks)).toBe(0.6);
    expect(list.map((t) => t.id)).toEqual([take.id]);
    expect((await store.audio(take.id))?.size).toBe(4000);
    const second = await storeRecording(store, recording({ startedAt: START + 60_000 }), { name: '', label: null });
    expect(second.take.name).toBe('Take 2');
  });

  it('keeps the name the learner typed, and names a task take after its label', async () => {
    const store = createTakeStore(memoryBackend());
    expect((await storeRecording(store, recording(), { name: '  First   try ', label: null })).take.name).toBe('First try');
    const task = await storeRecording(store, recording({ startedAt: START + 1 }), { name: '', label: 'week-1-first-section' });
    expect(task.take).toMatchObject({ name: 'Week 1 first section', label: 'week-1-first-section' });
  });

  it('reports the time played as practice', async () => {
    const store = createTakeStore(memoryBackend());
    await storeRecording(store, recording(), { name: 'Scales', label: null });
    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity.mock.calls[0][0]).toMatchObject({ kind: 'other', source: 'recorder', tag: 'practice', title: 'Recorded “Scales”', durationSec: 12, startedAt: START, meta: { bpm: 80 } });
  });

  it('does not report a false start, and never lets progress lose a take', async () => {
    reportPractice({ id: 'take-x', name: 'Oops', label: null, createdAt: START, durationMs: 1200, mimeType: 'audio/webm', bytes: 10, peaks: [], bpm: null });
    expect(recordActivity).not.toHaveBeenCalled();
    recordActivity.mockImplementationOnce(() => {
      throw new Error('progress broke');
    });
    const store = createTakeStore(memoryBackend());
    const { take } = await storeRecording(store, recording(), { name: '', label: null });
    expect((await store.list()).map((t) => t.id)).toEqual([take.id]);
  });
});
