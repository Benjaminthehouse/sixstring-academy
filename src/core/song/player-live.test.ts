/**
 * The player through the real output (`liveOutput`: the shared guitar synth and clicks) on the
 * audio engine's strict Web Audio stand-in. Checks that sounds are started on the audio clock at
 * the times the song asks for, and that pausing takes back what has not been heard yet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeAudio, getEngine, unlockAudio } from '@/core/audio';
import { MockContext, type MockSource } from '@/core/audio/web-audio-mock';
import { ODE_TO_JOY } from './examples';
import { sixTab } from './sixtab-parse';
import { SongPlayer } from './song-player';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  (globalThis as Record<string, unknown>).AudioContext = class extends MockContext {
    constructor() {
      super(44100);
    }
  };
});

afterEach(async () => {
  await closeAudio();
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).AudioContext;
});

/** Every buffer source ever started (ended ones included). */
const started = (ctx: MockContext): MockSource[] => (ctx.created as MockSource[]).filter((s) => s.kind === 'bufferSource' && s.startedAt !== null);

describe('SongPlayer on the audio engine', () => {
  it('schedules count-in clicks and notes on the audio clock, and pausing takes back what is not yet heard', async () => {
    expect(await unlockAudio()).toBe(true);
    const ctx = getEngine().ctx as unknown as MockContext;
    const player = new SongPlayer(sixTab(ODE_TO_JOY), { timer: 'manual', countInBars: 1 });
    await player.prepare();
    const t0 = ctx.currentTime;
    player.play();
    const step = (until: number) => {
      while (ctx.currentTime < until) {
        ctx.advance(0.02);
        player.transport.process(ctx.currentTime);
      }
    };
    step(t0 + 4.3);
    // (The engine starts a silent source of its own when it unlocks; only count what came after play().)
    const sources = started(ctx).map((s) => s.startedAt!).filter((t) => t > t0 + 0.02).sort((a, b) => a - b);
    // Four count-in clicks 0.6 s apart (100 bpm), then the melody on the same grid.
    expect(sources.length).toBeGreaterThanOrEqual(6);
    const gaps = sources.slice(1, 6).map((t, i) => Math.round((t - sources[i]) * 1000) / 1000);
    expect(gaps).toEqual([0.6, 0.6, 0.6, 0.6, 0.6]);
    // Everything up to the look-ahead has been handed to Web Audio; nothing later.
    expect(sources[sources.length - 1]).toBeLessThanOrEqual(ctx.currentTime + 0.25);
    player.pause();
    const pending = started(ctx).filter((s) => s.startedAt! > ctx.currentTime && s.stoppedAt === null);
    expect(pending).toEqual([]);
    player.dispose();
  });
});
