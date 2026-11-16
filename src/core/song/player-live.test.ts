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

  it('plays "5b7" as a bend and "5h7" as a hammer-on: one string, its pitch moving on the audio clock', async () => {
    expect(await unlockAudio()).toBe(true);
    const ctx = getEngine().ctx as unknown as MockContext;
    // At 60 bpm a quarter is a second: 3:5 (C4) bent a whole tone, then 3:5 and a hammer-on to 3:7 (D4).
    const song = sixTab('title: Bend and hammer\ntempo: 60\ntime: 4/4\n| h 3:5b2 q 3:5 3:7h |\n');
    const player = new SongPlayer(song, { timer: 'manual', countInBars: 0 });
    await player.prepare();
    const t0 = ctx.currentTime;
    player.play();
    while (ctx.currentTime < t0 + 4.5) {
      ctx.advance(0.02);
      player.transport.process(ctx.currentTime);
    }
    const notes = started(ctx).filter((s) => s.startedAt! > t0 + 0.02).sort((a, b) => a.startedAt! - b.startedAt!);
    // The bend: a playback-rate curve on the first note up to a whole tone.
    const bent = notes[0];
    const curve = bent.playbackRate.events.filter((e) => e.kind === 'curve');
    expect(curve).toHaveLength(1);
    expect(curve[0].value).toBeCloseTo(Math.pow(2, 2 / 12), 6);
    // The hammer-on: the string that played 3:5 at beat 3 steps up a tone at beat 4 and hands over to
    // one soft, pick-less note.
    const second = notes[1];
    expect(second.startedAt! - bent.startedAt!).toBeCloseTo(2, 6);
    const step = second.playbackRate.events.filter((e) => e.kind === 'set').at(-1)!;
    expect(step.value).toBeCloseTo(Math.pow(2, 2 / 12), 9);
    expect(Math.abs(step.time - (second.startedAt! + 1))).toBeLessThan(0.002);
    const atHammer = notes.filter((s) => Math.abs(s.startedAt! - (second.startedAt! + 1)) < 0.002);
    expect(atHammer).toHaveLength(1);
    const gain = (s: MockSource): number => (s.outputs[0] as unknown as { gain: { value: number } }).gain.value;
    expect(gain(atHammer[0])).toBeLessThan(gain(second) * 0.75);
    player.dispose();
  });
});
