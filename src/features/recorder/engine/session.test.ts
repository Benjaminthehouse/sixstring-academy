import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The session's host pieces, faked: a microphone that always opens, no audio clock (so no meter),
// and a metronome that never clicks.
const platform = vi.hoisted(() => ({
  stopped: [] as unknown[],
  awake: 0,
}));
vi.mock('@/core/platform', () => ({
  requestMic: vi.fn(async () => ({ ok: true, stream: { id: 'mic' } })),
  stopStream: vi.fn((s: unknown) => {
    if (s) platform.stopped.push(s);
  }),
  keepAwake: vi.fn(() => {
    platform.awake++;
    return () => {
      platform.awake--;
    };
  }),
}));
vi.mock('@/core/audio', () => ({
  audioSupported: () => false,
  audioNow: () => 0,
  getAudioContext: () => {
    throw new Error('no audio in tests');
  },
  getEngine: () => ({ hold: () => () => undefined }),
  Metronome: class {
    onBeat() {
      return () => undefined;
    }
    onSchedule() {
      return () => undefined;
    }
    start() {}
    dispose() {}
  },
}));

import { RecorderSession } from './session';

/** A MediaRecorder whose last chunk and stop event come only when the test says so (a slow phone). */
class SlowRecorder {
  static last: SlowRecorder | null = null;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    SlowRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
  }
  chunk(text: string) {
    this.ondataavailable?.({ data: new Blob([text], { type: this.mimeType }) });
  }
  /** The browser hands over the last chunk, then says it stopped. */
  finish(text: string) {
    this.chunk(text);
    this.onstop?.();
  }
}

const OPTIONS = { mimeType: 'audio/webm;codecs=opus', countIn: false, click: false, bpm: 80, beatsPerBar: 4 };

beforeEach(() => {
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = SlowRecorder;
  SlowRecorder.last = null;
  platform.stopped.length = 0;
  platform.awake = 0;
});
afterEach(() => {
  delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
  vi.useRealTimers();
});

describe('recorder session', () => {
  it('records the chunks it is given and hands them back as one take on Stop', async () => {
    const session = new RecorderSession();
    expect(await session.start(OPTIONS)).toEqual({ ok: true });
    expect(session.phase).toBe('recording');
    SlowRecorder.last!.chunk('one-');
    const stopping = session.stop();
    expect(session.phase).toBe('finishing');
    SlowRecorder.last!.finish('two');
    const rec = await stopping;
    expect(await rec?.blob.text()).toBe('one-two');
    expect(rec?.mimeType).toBe('audio/webm;codecs=opus');
    expect(session.phase).toBe('idle');
    expect(platform.stopped).toHaveLength(1);
    expect(platform.awake).toBe(0);
  });

  it('keeps the whole take when the screen goes (cancel) while Stop is still finishing', async () => {
    const session = new RecorderSession();
    await session.start(OPTIONS);
    SlowRecorder.last!.chunk('first-second-');
    const stopping = session.stop();
    // Leaving the screen right after Stop: the browser has not handed over the last chunk yet.
    await session.cancel();
    expect(session.phase).toBe('finishing');
    SlowRecorder.last!.finish('last');
    const rec = await stopping;
    expect(await rec?.blob.text()).toBe('first-second-last');
    expect(session.phase).toBe('idle');
    expect(platform.stopped).toHaveLength(1);
  });

  it('a second Stop while finishing gets the same take, not a second one', async () => {
    const session = new RecorderSession();
    await session.start(OPTIONS);
    SlowRecorder.last!.chunk('a');
    const first = session.stop();
    const second = session.stop();
    SlowRecorder.last!.finish('b');
    expect(await first).toBe(await second);
  });

  it('cancelling during the count-in keeps nothing, releases the microphone and never starts recording', async () => {
    vi.useFakeTimers();
    const session = new RecorderSession();
    await session.start({ ...OPTIONS, countIn: true });
    expect(session.phase).toBe('counting');
    await session.cancel();
    expect(session.phase).toBe('idle');
    expect(platform.stopped).toHaveLength(1);
    expect(platform.awake).toBe(0);
    // The safety timer that starts a take when the audio clock never runs must not fire now.
    vi.advanceTimersByTime(10_000);
    expect(SlowRecorder.last!.state).toBe('inactive');
    expect(await session.stop()).toBeNull();
  });
});
