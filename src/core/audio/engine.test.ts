/**
 * The live engine on a strict Web Audio stand-in (see web-audio-mock.ts): everything a browser would
 * throw at, it throws at; time moves only when the test moves it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, BufferCache, audioState, closeAudio, getEngine, hasEngine, installAudioUnlock, unlockAudio } from './engine';
import { GuitarSynth, getGuitar, pluck, strum } from './guitar';
import { Metronome } from './metronome';
import { normalizeClickSet } from './percussion';
import { normalizeTone, resolveTone } from './tones';
import { DrumKit, playChord, playClick, playDrum, playTone, playUi, startDrone } from './voices';
import { MockContext, MockNode, MockParam, MockSource, asAudioContext } from './web-audio-mock';

const gainOf = (n: MockNode): MockParam => (n as unknown as { gain: MockParam }).gain;

/** A running, unlocked engine on a mock context. */
function runningEngine(sampleRate = 48000): { ctx: MockContext; engine: AudioEngine } {
  const ctx = new MockContext(sampleRate);
  ctx.state = 'running';
  const engine = new AudioEngine(asAudioContext(ctx), { reverb: false });
  engine.markUnlocked();
  return { ctx, engine };
}

/** An engine whose context cannot start: no user gesture yet. */
function lockedEngine(): { ctx: MockContext; engine: AudioEngine } {
  const ctx = new MockContext();
  ctx.allowResume = false;
  const engine = new AudioEngine(asAudioContext(ctx), { reverb: false });
  return { ctx, engine };
}

const buffered = (ctx: MockContext): MockSource[] => ctx.liveSources.filter((s) => s.kind === 'bufferSource');
/** Sources that would still make sound if the context ran: started, not stopped, and wired to the output. */
const audible = (ctx: MockContext): MockSource[] => ctx.liveSources.filter((s) => s.stoppedAt === null && s.reachesDestination());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
});

afterEach(async () => {
  await closeAudio();
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).AudioContext;
});

describe('sounds requested before audio can start', () => {
  it('are queued for a moment, then dropped without ever sounding', async () => {
    const { ctx, engine } = lockedEngine();
    const guitar = new GuitarSynth({ engine });
    const kit = new DrumKit(engine);
    const h = guitar.pluck(52);
    kit.play('crash');
    playClick('woodblock', 'accent', undefined, 1, engine);
    playUi('levelUp', {}, engine);
    const tone = playTone(57, undefined, {}, engine);
    expect(h.queued).toBe(true);
    expect(tone.queued).toBe(true);
    expect(engine.state).toBe('locked');
    expect(engine.pendingSounds).toBe(5);
    expect(audible(ctx).length).toBeGreaterThanOrEqual(5);
    // Still there after 300 ms: a tap may be on its way.
    await vi.advanceTimersByTimeAsync(300);
    expect(audible(ctx).length).toBeGreaterThanOrEqual(5);
    // After 0.4 s nobody has tapped: everything is taken off the graph, while the context is silent.
    await vi.advanceTimersByTimeAsync(150);
    expect(engine.pendingSounds).toBe(0);
    expect(audible(ctx)).toEqual([]);
    expect(guitar.activeVoices).toBe(0);
    expect(kit.activeHits).toBe(0);
    // The tap comes much later: nothing bursts out.
    ctx.unlock();
    ctx.advance(0.5);
    expect(audible(ctx)).toEqual([]);
    // And the handles are harmless.
    expect(() => { h.stop(); tone.stop(); }).not.toThrow();
  });

  it('are played when the gesture follows at once', async () => {
    const { ctx, engine } = lockedEngine();
    const guitar = new GuitarSynth({ engine });
    guitar.pluck(52);
    await vi.advanceTimersByTimeAsync(200);
    ctx.unlock(); // the user taps: the context starts
    expect(engine.pendingSounds).toBe(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(audible(ctx).length).toBe(1);
    expect(guitar.activeVoices).toBe(1);
    expect(engine.state).toBe('running');
  });

  it('wait longer on a context that has run before (a slow output device), then give up as well', async () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    // An interruption: suspended, and resume() does not succeed.
    ctx.allowResume = false;
    await ctx.suspend();
    expect(engine.state).toBe('suspended');
    const h = guitar.pluck(52);
    expect(h.queued).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.pendingSounds).toBe(1);
    await vi.advanceTimersByTimeAsync(600);
    expect(engine.pendingSounds).toBe(0);
    expect(audible(ctx)).toEqual([]);
  });

  it('never keeps more than a few hundred waiting', () => {
    const { ctx, engine } = lockedEngine();
    const guitar = new GuitarSynth({ engine, maxVoices: 1000 });
    for (let i = 0; i < 400; i++) guitar.pluck(40 + (i % 40));
    expect(engine.pendingSounds).toBeLessThanOrEqual(256);
    expect(audible(ctx).length).toBeLessThanOrEqual(256);
    expect(guitar.activeVoices).toBeLessThanOrEqual(256);
  });
});

describe('sleeping when idle', () => {
  it('suspends after a few seconds of silence and wakes for the next note', async () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    guitar.pluck(64, undefined, { duration: 0.2 });
    for (let i = 0; i < 12; i++) {
      ctx.advance(1);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(ctx.suspendCalls).toBe(1);
    expect(ctx.state).toBe('suspended');
    expect(engine.state).toBe('suspended');
    const before = ctx.resumeCalls;
    const h = guitar.pluck(64);
    expect(h.queued).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(ctx.resumeCalls).toBe(before + 1);
    expect(ctx.state).toBe('running');
    expect(engine.pendingSounds).toBe(0);
    expect(audible(ctx).length).toBe(1);
  });

  it('a hold keeps it awake; releasing the hold lets it sleep', async () => {
    const { ctx, engine } = runningEngine();
    const release = engine.hold();
    for (let i = 0; i < 12; i++) {
      ctx.advance(1);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(ctx.suspendCalls).toBe(0);
    release();
    release(); // twice is harmless
    for (let i = 0; i < 12; i++) {
      ctx.advance(1);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(ctx.state).toBe('suspended');
  });

  it('a note requested while the suspend is in flight is not left stranded', async () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    ctx.holdSuspend = true;
    for (let i = 0; i < 12; i++) {
      ctx.advance(1);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(ctx.suspendCalls).toBe(1);
    expect(ctx.state).toBe('running'); // the suspend has not landed yet
    const resumes = ctx.resumeCalls;
    const h = guitar.pluck(52);
    expect(h.queued).toBe(true); // not "playing now": the context is on its way down
    ctx.landSuspend();
    await vi.advanceTimersByTimeAsync(5);
    // The engine noticed that something was asked for meanwhile and started the context again.
    expect(ctx.resumeCalls).toBe(resumes + 1);
    expect(ctx.state).toBe('running');
    expect(audible(ctx).length).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(guitar.activeVoices).toBe(1);
  });
});

describe('guitar voices', () => {
  it('a new note on a string takes over from the one ringing there', () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    guitar.pluck(55, 0.1, { string: 3 });
    guitar.pluck(57, 0.5, { string: 3 });
    guitar.pluck(64, 0.5, { string: 1 });
    const [first, second, other] = buffered(ctx);
    // The first is faded from the moment the second sounds (minus the master chain's look-ahead) and stopped soon after.
    expect(first.stoppedAt).toBeGreaterThan(0.494);
    expect(first.stoppedAt).toBeLessThan(0.56);
    expect(second.stoppedAt).toBeNull();
    expect(other.stoppedAt).toBeNull();
    expect(second.startedAt).toBeCloseTo(0.5 - engine.chainLatency, 9);
    expect(guitar.activeVoices).toBe(3);
    ctx.advance(0.6);
    expect(guitar.activeVoices).toBe(2);
  });

  it('notes scheduled out of order still give way to each other at the right time', () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    guitar.pluck(57, 0.5, { string: 3 });
    guitar.pluck(55, 0.1, { string: 3 }); // asked for later, sounds earlier
    const [later, earlier] = buffered(ctx);
    expect(earlier.stoppedAt).toBeGreaterThan(0.494);
    expect(earlier.stoppedAt).toBeLessThan(0.56);
    expect(later.stoppedAt).toBeNull();
  });

  it('never holds more ringing voices than it is allowed', () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine, maxVoices: 8 });
    for (let i = 0; i < 40; i++) {
      guitar.pluck(40 + i);
      ctx.advance(0.05);
    }
    const ringing = buffered(ctx).filter((s) => s.stoppedAt === null);
    expect(ringing.length).toBeLessThanOrEqual(8);
    ctx.advance(0.2);
    expect(guitar.activeVoices).toBeLessThanOrEqual(9);
  });

  it('stopAll fades what is sounding and removes what has not started', () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    guitar.pluck(52, undefined, { string: 4 });
    ctx.advance(0.3);
    guitar.pluck(55, ctx.currentTime + 0.5, { string: 3 }); // scheduled, not yet heard
    guitar.pluck(59, ctx.currentTime + 0.05, { string: 2 });
    expect(guitar.activeVoices).toBe(3);
    guitar.stopAll();
    const [sounding] = buffered(ctx).filter((s) => s.startedAt! < ctx.currentTime);
    // The sounding note fades over tens of milliseconds; the scheduled ones are gone at once and never reach the output.
    expect(sounding.stoppedAt).toBeGreaterThan(ctx.currentTime + 0.05);
    expect(guitar.activeVoices).toBe(1);
    expect(audible(ctx).length).toBe(0);
    ctx.advance(0.4);
    expect(guitar.activeVoices).toBe(0);
  });

  it('a duration releases the note; let-ring ignores it', () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    guitar.pluck(52, 1, { duration: 0.25 });
    guitar.pluck(59, 1, { duration: 0.25, letRing: true });
    const [timed, ringing] = buffered(ctx);
    expect(timed.stoppedAt).toBeGreaterThan(1.24);
    expect(timed.stoppedAt).toBeLessThan(1.5);
    expect(ringing.stoppedAt).toBeNull();
  });

  it('cents, fractional pitches and A4 become a playback rate; an up-stroke flips the polarity', () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    guitar.pluck(57, undefined, { cents: 50 });
    guitar.pluck(60.25);
    guitar.a4 = 432;
    guitar.pluck(64, undefined, { direction: 'up' });
    const [a, b, c] = buffered(ctx);
    expect(a.playbackRate.value).toBeCloseTo(Math.pow(2, 50 / 1200), 9);
    expect(b.playbackRate.value).toBeCloseTo(Math.pow(2, 25 / 1200), 9);
    expect(c.playbackRate.value).toBeCloseTo(432 / 440, 9);
    expect(gainOf(c.outputs[0] as MockNode).value).toBeLessThan(0);
  });

  it('a strum keeps its shape even when the notes have to be rendered first', () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    // Rendering takes real time; on the mock clock that is time the context has moved on.
    const realGet = engine.buffers.get.bind(engine.buffers);
    engine.buffers.get = (key, render) => {
      if (!engine.buffers.has(key)) ctx.currentTime += 0.02;
      return realGet(key, render);
    };
    const handles = guitar.strum([40, 47, 52, 56, 59, 64], undefined, { spread: 0.03 });
    const starts = handles.map((h) => h.startTime);
    expect(starts[0]).toBeGreaterThanOrEqual(ctx.currentTime); // not in the past: 0.12 s of rendering went by
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeCloseTo(0.006, 9);
    // A strum that ends on the beat cannot start in the past either.
    const now = ctx.currentTime;
    const up = guitar.strum([40, 47, 52], undefined, { spread: 0.04, align: 'end', direction: 'up' });
    expect(Math.min(...up.map((h) => h.startTime))).toBeGreaterThanOrEqual(now);
    expect(Math.max(...up.map((h) => h.startTime)) - Math.min(...up.map((h) => h.startTime))).toBeCloseTo(0.04, 9);
  });

  it('a strum damps strings that are not part of the new chord', () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    guitar.strum([40, 47, 52, 56, 59, 64]);
    ctx.advance(0.5);
    guitar.strum([50, 57, 62, 66]); // D major on the top four strings
    const stopped = buffered(ctx).filter((s) => s.stoppedAt !== null).length;
    expect(stopped).toBe(6); // strings 6 and 5 damped, strings 4..1 replaced
    guitar.strum([52, 57, 64], undefined, { choke: false, strings: [4, 3, 1] });
    expect(buffered(ctx).filter((s) => s.stoppedAt === null).length).toBe(4); // string 2 still rings
  });

  it('dispose takes the instrument off the mixer and leaves nothing playing', () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine, pan: 0.3 });
    guitar.pluck(52);
    guitar.pluck(52, undefined, { tone: 'driven' });
    const chains = ctx.created.filter((n) => n.kind === 'biquad');
    expect(chains.length).toBeGreaterThan(10);
    expect(chains.every((n) => n.reachesDestination())).toBe(true);
    guitar.dispose();
    expect(chains.some((n) => n.reachesDestination())).toBe(false);
    expect(guitar.activeVoices).toBe(0);
    expect(audible(ctx)).toEqual([]);
    // It can be used again afterwards.
    guitar.pluck(52);
    expect(audible(ctx).length).toBe(1);
  });

  it('instrument chains are plain biquads (cheap to create), never IIR filter nodes', () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    for (const tone of ['steel', 'nylon', 'clean', 'driven', 'bass-finger', 'bass-pick', 'bass-upright'] as const) guitar.pluck(45, undefined, { tone });
    expect(ctx.count('iir')).toBe(0);
    expect(ctx.count('biquad')).toBeGreaterThan(30);
  });
});

describe('garbage in', () => {
  const BAD: unknown[] = [NaN, Infinity, -Infinity, -1, 1e9, undefined, null, 'x', {}, [], true];

  it('nothing throws, and nothing non-finite reaches Web Audio', () => {
    const { ctx, engine } = runningEngine();
    const guitar = new GuitarSynth({ engine });
    const kit = new DrumKit(engine);
    const run = (): void => {
      for (const raw of BAD) {
        const v = raw as never;
        guitar.pluck(v);
        guitar.pluck(60, v, { velocity: v, duration: v, cents: v, a4: v, brightness: v, gain: v, string: v, tone: v, articulation: v, direction: v });
        guitar.pluck(60, undefined, { duration: v }).stop(v, v);
        guitar.strum([v, 52, v], v, { spread: v, velocity: v, duration: v, gain: v, strings: v, align: v, direction: v });
        guitar.strum(v ?? []);
        guitar.stopString(v, v, v);
        guitar.stopAll(v, v);
        kit.play(v, v, v, v);
        kit.play('snare', v, v, v);
        kit.stopAll(v);
        playClick(v, v, v, v, engine)();
        playUi(v, { volume: v, step: v, when: v }, engine);
        playUi('combo', { volume: v, step: v, when: v }, engine);
        playTone(v, v, {}, engine).stop(v);
        playTone({ freq: v }, v, {}, engine).stop(v);
        playTone(60, v, { voice: v, velocity: v, cents: v, a4: v, gain: v, bus: v, duration: v }, engine).stop(v);
        playChord([60, v, 67], v, { roll: v, duration: 0.05, gain: v }, engine);
        engine.setBusVolume(v, v);
        engine.setBusVolume('guitar', v);
        engine.setBusMuted(v, v);
        engine.masterVolume = v;
        engine.muted = v;
        engine.visual.add(v, () => undefined);
        engine.nodeTime(v);
        engine.touch(v);
        const d = startDrone({ root: v, a4: v, volume: v, fadeIn: v, fifth: v, octave: v }, engine);
        d.setRoot(v);
        d.setVolume(v);
        d.setFifth(v);
        d.stop(v);
      }
    };
    expect(run).not.toThrow();
    // The mock throws on any non-finite AudioParam value or time, as a browser does: reaching this
    // line means none got through. Volumes are still numbers the mixer can use.
    expect(Number.isFinite(engine.masterVolume)).toBe(true);
    expect(engine.masterVolume).toBeGreaterThanOrEqual(0);
    expect(engine.masterVolume).toBeLessThanOrEqual(1);
    for (const s of ctx.liveSources) expect(Number.isFinite(s.startedAt)).toBe(true);
  });

  it('the same on a locked context: play before unlock never throws', () => {
    const { engine } = lockedEngine();
    const guitar = new GuitarSynth({ engine });
    const kit = new DrumKit(engine);
    expect(() => {
      for (const raw of BAD) {
        const v = raw as never;
        guitar.pluck(60, v, { velocity: v, duration: v });
        guitar.strum([40, 47, 52], v);
        kit.play('kick', v, v);
        playClick('beep', 'accent', v, v, engine)();
        playTone(57, v, { duration: v }, engine).stop();
        playUi('correct', {}, engine);
      }
    }).not.toThrow();
  });

  it('tone and click names from stored settings are understood, unknown ones fall back', () => {
    expect(normalizeTone('acoustic')).toBe('steel');
    expect(normalizeTone('Classical')).toBe('nylon');
    expect(normalizeTone('electric')).toBe('clean');
    expect(normalizeTone('distortion')).toBe('driven');
    expect(normalizeTone('nylon')).toBe('nylon');
    expect(normalizeTone('theremin')).toBe('steel');
    expect(normalizeTone('theremin', 'clean')).toBe('clean');
    expect(normalizeTone(undefined)).toBe('steel');
    expect(normalizeTone(42)).toBe('steel');
    expect(resolveTone('acoustic' as never)).toEqual({ instrument: 'steel', articulation: 'normal' });
    expect(resolveTone('nope' as never, 'nope' as never, 'nope' as never)).toEqual({ instrument: 'steel', articulation: 'normal' });
    expect(resolveTone('muted', undefined, 'driven')).toEqual({ instrument: 'driven', articulation: 'palm-mute' });
    expect(normalizeClickSet('wood')).toBe('woodblock');
    expect(normalizeClickSet('hi-hat')).toBe('hihat');
    expect(normalizeClickSet('beep')).toBe('beep');
    expect(normalizeClickSet('kazoo')).toBe('woodblock');
    expect(normalizeClickSet(null)).toBe('woodblock');
  });
});

describe('note cache', () => {
  it('stays inside its budget, evicts the least recently used, and renders again on demand', () => {
    const ctx = new MockContext();
    const cache = new BufferCache(asAudioContext(ctx), 4000);
    let renders = 0;
    const make = (): Float32Array => { renders++; return new Float32Array(250); }; // 1000 bytes each
    for (const k of ['a', 'b', 'c', 'd']) cache.get(k, make);
    expect(cache.stats).toEqual({ bytes: 4000, count: 4, limit: 4000 });
    cache.get('a', make); // touch a: b is now the oldest
    cache.get('e', make);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.stats.bytes).toBeLessThanOrEqual(4000);
    expect(renders).toBe(5);
    cache.get('b', make);
    expect(renders).toBe(6);
    // A single buffer larger than the whole budget is still returned (and is all that is kept).
    const big = cache.get('huge', () => new Float32Array(5000));
    expect(big.length).toBe(5000);
    expect(cache.stats.count).toBe(1);
    cache.clear();
    expect(cache.stats).toEqual({ bytes: 0, count: 0, limit: 4000 });
  });

  it('the synth caches by pitch, string, dynamic layer and tone, within the engine budget', () => {
    const ctx = new MockContext();
    ctx.state = 'running';
    const engine = new AudioEngine(asAudioContext(ctx), { reverb: false, cacheBytes: 3e6 });
    const guitar = new GuitarSynth({ engine });
    guitar.pluck(64, undefined, { velocity: 0.8 });
    guitar.pluck(64, undefined, { velocity: 0.78 }); // same layer
    expect(engine.buffers.stats.count).toBe(1);
    guitar.pluck(64, undefined, { velocity: 0.3 });
    guitar.pluck(64, undefined, { string: 2 });
    guitar.pluck(64, undefined, { tone: 'nylon' });
    expect(engine.buffers.stats.count).toBe(4);
    for (let m = 40; m < 90; m++) guitar.pluck(m, undefined, { duration: 0.01 });
    expect(engine.buffers.stats.bytes).toBeLessThanOrEqual(3e6);
    expect(engine.buffers.stats.count).toBeLessThan(54);
  });
});

describe('drums, clicks, tones and the drone', () => {
  it('an unknown drum is a no-op with a clear answer; closing the hi-hat chokes the open one', () => {
    const { ctx, engine } = runningEngine();
    const kit = new DrumKit(engine);
    expect(kit.play('gong' as never)).toBe(false);
    expect(kit.play('hihatOpen', 0.1)).toBe(true);
    kit.play('hihatClosed', 0.3);
    const [open, closed] = buffered(ctx);
    expect(open.stoppedAt).toBeGreaterThan(0.29);
    expect(open.stoppedAt).toBeLessThan(0.4);
    expect(closed.stoppedAt).toBeNull();
    // A closed hat BEFORE the open one does not choke it.
    kit.play('hihatOpen', 1);
    kit.play('hihatPedal', 0.9);
    expect(buffered(ctx)[2].stoppedAt).toBeNull();
  });

  it('stopAll removes hits that have not started and fades those that have', () => {
    const { ctx, engine } = runningEngine();
    const kit = new DrumKit(engine);
    kit.play('crash');
    ctx.advance(0.2);
    kit.play('snare', ctx.currentTime + 0.3);
    kit.play('kick', ctx.currentTime + 0.6);
    expect(kit.activeHits).toBe(3);
    kit.stopAll();
    expect(kit.activeHits).toBe(1);
    expect(audible(ctx).length).toBe(0);
    ctx.advance(0.2);
    expect(kit.activeHits).toBe(0);
  });

  it('a click can be taken back before it sounds', () => {
    const { ctx, engine } = runningEngine();
    const cancel = playClick('woodblock', 'beat', 0.5, 1, engine);
    expect(audible(ctx).length).toBe(1);
    cancel();
    expect(audible(ctx).length).toBe(0);
    cancel(); // twice is harmless
    // Once it is sounding, taking it back cuts it short instead of leaving half a click.
    const cut = playClick('woodblock', 'beat', undefined, 1, engine);
    ctx.advance(0.01);
    cut();
    const src = buffered(ctx).filter((s) => s.stoppedAt !== null).pop()!;
    expect(src.stoppedAt).toBeGreaterThan(ctx.currentTime);
    expect(src.stoppedAt).toBeLessThan(ctx.currentTime + 0.05);
  });

  it('a tone stopped before it starts never sounds; one released inside its attack fades from where it was', () => {
    const { ctx, engine } = runningEngine();
    const early = playTone(57, 1, { voice: 'epiano' }, engine);
    expect(ctx.liveSources.length).toBeGreaterThanOrEqual(2);
    early.stop();
    expect(audible(ctx)).toEqual([]);

    const short = playTone(57, 2, { voice: 'reference', duration: 0.004 }, engine);
    expect(short.freq).toBeCloseTo(220, 6);
    const amp = ctx.created.filter((n) => n.kind === 'gain').pop()!;
    const events = gainOf(amp).events;
    // Ramp up to the level reached at the release point, then down: never a ramp cut off at zero.
    const ramp = events.find((e) => e.kind === 'ramp')!;
    const release = events.find((e) => e.kind === 'target')!;
    expect(ramp.value).toBeGreaterThan(0);
    expect(ramp.time).toBeCloseTo(release.time, 9);
    expect(release.value).toBe(0);
    // No handle keeps the context awake once the tone has an end.
    ctx.advance(3);
    expect(audible(ctx)).toEqual([]);
  });

  it('a sustained tone keeps the context awake until it is stopped', async () => {
    const { ctx, engine } = runningEngine();
    const h = playTone(45, undefined, { voice: 'reference' }, engine);
    for (let i = 0; i < 12; i++) {
      ctx.advance(1);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(ctx.state).toBe('running');
    h.stop();
    for (let i = 0; i < 12; i++) {
      ctx.advance(1);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(ctx.state).toBe('suspended');
  });

  it('a root dragged across a slider does not pile up oscillators, and the last value wins', async () => {
    const { ctx, engine } = runningEngine();
    const drone = startDrone({ root: 45, fifth: true }, engine);
    const perLayer = ctx.count('oscillator'); // root, fifth and octave, two oscillators and two swells each
    expect(perLayer).toBe(12);
    for (let i = 0; i < 60; i++) {
      drone.setRoot(40 + (i % 12));
      await vi.advanceTimersByTimeAsync(5); // 200 changes a second
      ctx.advance(0.005);
    }
    await vi.advanceTimersByTimeAsync(200);
    const builds = ctx.count('oscillator') / perLayer;
    expect(builds).toBeLessThanOrEqual(7); // 0.3 s of dragging: a handful of crossfades, not sixty
    // The newest oscillators are on the last root asked for (59 % 12 = 11 -> 51 -> folded to the drone register).
    const newest = ctx.created.filter((n): n is MockSource => n.kind === 'oscillator' && n instanceof MockSource).slice(-perLayer);
    const expected = 440 * Math.pow(2, (51 - 69) / 12);
    expect(newest.some((o) => Math.abs(1200 * Math.log2(o.frequency.value / expected)) < 2)).toBe(true);
    drone.stop(0.1);
    expect(drone.running).toBe(false);
    drone.setRoot(47); // after stop: ignored
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx.count('oscillator') / perLayer).toBe(builds);
    ctx.advance(1);
    expect(ctx.liveSources.filter((s) => s.kind === 'oscillator')).toEqual([]);
  });
});

describe('the shared engine', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).AudioContext = class extends MockContext {
      constructor() {
        super(44100);
        this.allowResume = false; // no user gesture yet
      }
    };
  });

  it('reports what a sound requested now would do', async () => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    expect(audioState()).toBe('unsupported');
    expect(playUi('correct')).toBe(false);
    expect(await unlockAudio()).toBe(false);
    (globalThis as Record<string, unknown>).AudioContext = class extends MockContext {
      constructor() {
        super(44100);
        this.allowResume = false;
      }
    };
    expect(audioState()).toBe('locked'); // and asking does not create the context
    expect(hasEngine()).toBe(false);
    const h = pluck(52);
    expect(h.queued).toBe(true);
    expect(playUi('correct')).toBe(false);
    expect(playDrum('kick')).toBe(true); // a drum that exists; whether it is heard is audioState()'s business
    expect(audioState()).toBe('locked');
    const ctx = getEngine().ctx as unknown as MockContext;
    ctx.unlock();
    expect(audioState()).toBe('running');
    expect(pluck(55).queued).toBe(false);
    expect(playUi('correct')).toBe(true);
    await ctx.suspend();
    expect(audioState()).toBe('suspended');
  });

  it('unlockAudio is safe to call over and over, and makes one context', async () => {
    let made = 0;
    (globalThis as Record<string, unknown>).AudioContext = class extends MockContext {
      constructor() {
        super(44100);
        made++;
      }
    };
    const results = await Promise.all(Array.from({ length: 25 }, () => unlockAudio()));
    expect(results.every((r) => r === true)).toBe(true);
    for (let i = 0; i < 10; i++) expect(await unlockAudio()).toBe(true);
    expect(made).toBe(1);
    expect(audioState()).toBe('running');
  });

  it('outside a gesture unlockAudio gives up after a moment instead of hanging', async () => {
    const pending = unlockAudio();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toBe(false);
    expect(audioState()).toBe('locked');
  });

  it('installAudioUnlock unlocks on the first gesture and can be removed', async () => {
    const target = new EventTarget();
    const remove = installAudioUnlock(target);
    expect(hasEngine()).toBe(false);
    (globalThis as Record<string, unknown>).AudioContext = class extends MockContext {
      constructor() {
        super(48000);
      }
    };
    target.dispatchEvent(new Event('pointerdown'));
    await vi.advanceTimersByTimeAsync(10);
    expect(audioState()).toBe('running');
    remove();
    remove();
  });

  it('warms up the open strings in idle moments after the first unlock', async () => {
    (globalThis as Record<string, unknown>).AudioContext = class extends MockContext {
      constructor() {
        super(44100);
      }
    };
    expect(await unlockAudio()).toBe(true);
    expect(getEngine().buffers.stats.count).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(getEngine().buffers.stats.count).toBe(6);
    // A note played now is already rendered: asking for it creates no new buffer.
    getGuitar().pluck(64, undefined, { string: 1 });
    strum([40, 45, 50, 55, 59, 64]);
    expect(getEngine().buffers.stats.count).toBe(6);
  });

  it('synths that outlive the engine keep working when it is closed and made again', async () => {
    (globalThis as Record<string, unknown>).AudioContext = class extends MockContext {
      constructor() {
        super(48000);
      }
    };
    await unlockAudio();
    const own = new GuitarSynth({ pan: 0.2 }); // on the shared engine, but not the shared synth
    const kit = new DrumKit();
    own.pluck(52);
    own.pluck(55, undefined, { tone: 'clean' });
    kit.play('ride');
    kit.play('kick');
    const firstCtx = getEngine().ctx;
    await closeAudio();
    await unlockAudio();
    expect(getEngine().ctx).not.toBe(firstCtx);
    const ctx = getEngine().ctx as unknown as MockContext;
    const before = audible(ctx).length;
    expect(() => {
      own.pluck(64);
      own.strum([40, 47, 52]);
      kit.play('ride');
    }).not.toThrow();
    // Four notes and a cymbal, wired to the new context's output.
    expect(audible(ctx).length).toBe(before + 5);
    expect(own.activeVoices).toBe(4);
    expect(kit.activeHits).toBe(1);
    expect(() => {
      own.stopAll();
      kit.stopAll();
    }).not.toThrow();
    ctx.advance(0.5);
    expect(own.activeVoices).toBe(0);
    expect(kit.activeHits).toBe(0);
  });

  it('a metronome on the shared engine takes its clicks back when stopped', async () => {
    (globalThis as Record<string, unknown>).AudioContext = class extends MockContext {
      constructor() {
        super(48000);
      }
    };
    await unlockAudio();
    const ctx = getEngine().ctx as unknown as MockContext;
    const m = new Metronome({ tempo: 300, timer: 'manual' });
    m.subdivision = 'sixteenth';
    m.start();
    m.transport.process();
    const scheduled = buffered(ctx).filter((s) => s.buffer && s.buffer.length > 100).length;
    expect(scheduled).toBeGreaterThanOrEqual(2);
    ctx.advance(0.1);
    m.transport.process();
    m.stop();
    // Whatever was scheduled beyond "now" is gone from the graph; nothing new will click.
    const future = ctx.liveSources.filter((s) => s.startedAt! > ctx.currentTime && s.reachesDestination());
    expect(future).toEqual([]);
    m.dispose();
  });
});
