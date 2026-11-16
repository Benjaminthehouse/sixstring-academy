/**
 * Expression on the live voice, checked on the strict Web Audio stand-in: what the guitar asks of
 * Web Audio for bends, slides, vibrato, hammer-ons and pull-offs, accents, the scheduled drone, and
 * the cancel handles of visual callbacks. (What actually comes out is measured in the browser by
 * `e2e/audio-expression.cjs`, rendering the real graph offline.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, closeAudio, getEngine, onAudioClosed, onAudioUnlocked, scheduleVisual, unlockAudio } from './engine';
import { GuitarSynth } from './guitar';
import { playLineOverChord, playPhrase, tabPhrase } from './phrase';
import { velocityGain } from './tones';
import { VisualQueue } from './visual-sync';
import { startDrone } from './voices';
import { MockContext, MockParam, MockSource, asAudioContext, type ParamEvent } from './web-audio-mock';

const FS = 48000;
const CHAIN = 0.006; // the master chain's look-ahead, which every node start compensates

function runningEngine(): { ctx: MockContext; engine: AudioEngine } {
  const ctx = new MockContext(FS);
  ctx.state = 'running';
  const engine = new AudioEngine(asAudioContext(ctx), { reverb: false });
  engine.markUnlocked();
  return { ctx, engine };
}

/** Buffer sources started on the context, in the order they were made. */
const sources = (ctx: MockContext): MockSource[] => (ctx.created as MockSource[]).filter((s) => s.kind === 'bufferSource' && s.startedAt !== null);
const rateEvents = (s: MockSource, kind?: ParamEvent['kind']): ParamEvent[] => s.playbackRate.events.filter((e) => !kind || e.kind === kind);
/** The gain node a source plays into, and its level. */
const gainOf = (s: MockSource): MockParam => (s.outputs[0] as unknown as { gain: MockParam }).gain;
const ratio = (semitones: number): number => Math.pow(2, semitones / 12);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
});

afterEach(async () => {
  await closeAudio();
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).AudioContext;
});

describe('bends, vibrato and slides on one note', () => {
  it('a bend is a playback-rate curve from the fretted pitch to the bent one, starting just after the pick', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.pluck(60, 1, { string: 3, duration: 0.8, bend: 2 });
    const [src] = sources(ctx);
    expect(src.startedAt).toBeCloseTo(1 - CHAIN, 9);
    expect(src.playbackRate.value).toBe(1); // struck at the fretted pitch
    const curve = rateEvents(src, 'curve');
    expect(curve).toHaveLength(1);
    expect(curve[0].time).toBeCloseTo(1 - CHAIN + 0.03, 6);
    expect(curve[0].value).toBeCloseTo(ratio(2), 6); // arrives a whole tone up
  });

  it('a pre-bend is struck bent; bend and release ends back at the fretted pitch; a quarter tone is a quarter tone', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.pluck(64, 1, { string: 2, duration: 1, bend: { amount: 1, pre: true } });
    g.pluck(67, 1, { string: 1, duration: 1, bend: { amount: 2, release: true } });
    g.pluck(57, 1, { string: 4, duration: 1, bend: 0.5 });
    const [pre, release, quarter] = sources(ctx);
    expect(pre.playbackRate.value).toBeCloseTo(ratio(1), 9);
    expect(rateEvents(release, 'curve')[0].value).toBeCloseTo(1, 6);
    expect(rateEvents(quarter, 'curve')[0].value).toBeCloseTo(ratio(0.5), 6);
  });

  it('cents and A4 still apply under a bend', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.a4 = 442;
    g.pluck(60, 1, { cents: 10, bend: 2, duration: 1 });
    const [src] = sources(ctx);
    const base = Math.pow(2, (10 + 1200 * Math.log2(442 / 440)) / 1200);
    expect(src.playbackRate.value).toBeCloseTo(base, 9);
    expect(rateEvents(src, 'curve')[0].value).toBeCloseTo(base * ratio(2), 6);
  });

  it('vibrato and a slide out are curves too; the slide out also fades the note', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.pluck(60, 1, { string: 3, duration: 1, vibrato: true });
    g.pluck(64, 1, { string: 2, duration: 0.6, slideOut: 'down' });
    const [vib, out] = sources(ctx);
    expect(rateEvents(vib, 'curve')).toHaveLength(1);
    expect(rateEvents(vib, 'curve')[0].time).toBeGreaterThan(1 - CHAIN + 0.1);
    expect(rateEvents(out, 'curve')[0].value).toBeCloseTo(ratio(-7), 6);
    expect(gainOf(out).events.some((e) => e.kind === 'ramp' && e.value < gainOf(out).value * 0.1)).toBe(true);
  });

  it('a slide into a note starts a few frets below and arrives', () => {
    const { ctx, engine } = runningEngine();
    new GuitarSynth({ engine }).pluck(62, 1, { string: 3, duration: 0.5, slideIn: 'below' });
    const [src] = sources(ctx);
    expect(src.playbackRate.value).toBeCloseTo(ratio(-3), 9);
    expect(rateEvents(src, 'curve')[0].value).toBeCloseTo(1, 6);
  });
});

describe('hammer-ons, pull-offs and slides between notes', () => {
  it('a hammer-on: the ringing string steps to the new fret on the beat and hands over to a soft, pick-less note', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    // "5h7" on the G string: fret 5 (C4 = 60), then fret 7 hammered (D4 = 62).
    g.pluck(60, 1, { string: 3, duration: 0.3 });
    const first = sources(ctx)[0];
    const h = g.pluck(62, 1.3, { string: 3, duration: 0.4, legato: 'hammer' });
    expect(h.startTime).toBeCloseTo(1.3, 9);
    // The old vibration is re-pitched at the hammer, on the render quantum nearest the beat (within 64 samples) ...
    const step = rateEvents(first, 'set').at(-1)!;
    expect(step.value).toBeCloseTo(ratio(2), 9);
    expect(Math.abs(step.time - (1.3 - CHAIN))).toBeLessThanOrEqual(64 / FS + 1e-6);
    // ... and fades under the new note over a moment (a blend, not the 4 ms cut of a new pick stroke).
    const fade = gainOf(first).events.filter((e) => e.kind === 'target').at(-1)!;
    expect(fade.time).toBeCloseTo(1.3 - CHAIN, 9);
    expect(first.stoppedAt!).toBeGreaterThan(1.3 + 0.3);
    expect(first.stoppedAt!).toBeLessThan(1.3 + 0.6);
    // The new note: a legato rendering (no pick), softer than a pick stroke, on the beat.
    const all = sources(ctx);
    expect(all).toHaveLength(2);
    const legato = all[1];
    expect(legato.startedAt).toBeCloseTo(1.3 - CHAIN, 9);
    expect(legato.buffer).not.toBe(first.buffer);
    expect(gainOf(legato).value).toBeCloseTo(velocityGain(0.8) * 0.55, 9);
    expect(legato.stoppedAt!).toBeLessThan(1.3 + 0.4 + 0.2);
    // Picked instead: the same pitch at full level, and the old note released at once.
    const p = runningEngine();
    const g2 = new GuitarSynth({ engine: p.engine });
    g2.pluck(60, 1, { string: 3, duration: 0.3 });
    g2.pluck(62, 1.3, { string: 3, duration: 0.4 });
    const [a, b] = sources(p.ctx);
    expect(gainOf(b).value).toBeCloseTo(velocityGain(0.8), 9);
    expect(a.stoppedAt!).toBeLessThan(first.stoppedAt! - 0.2);
    expect(rateEvents(a, 'set')).toEqual([]);
    expect(b.buffer).not.toBe(legato.buffer);
  });

  it('a pull-off steps down; every note of a hammer and pull chain is handed over the same way', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.pluck(62, 1, { string: 3, duration: 0.25 });
    g.pluck(60, 1.25, { string: 3, duration: 0.25, legato: 'pull' });
    g.pluck(62, 1.5, { string: 3, duration: 0.25, legato: 'hammer' });
    g.pluck(60, 1.75, { string: 3, duration: 0.5, legato: 'pull' });
    const all = sources(ctx);
    expect(all).toHaveLength(4);
    // Each voice steps to the next note's pitch when that note comes.
    expect(rateEvents(all[0], 'set').at(-1)!.value).toBeCloseTo(ratio(-2), 9);
    expect(rateEvents(all[1], 'set').at(-1)!.value).toBeCloseTo(ratio(2), 9);
    expect(rateEvents(all[2], 'set').at(-1)!.value).toBeCloseTo(ratio(-2), 9);
    // A pull-off plucks the string a little: a touch louder than a hammer-on.
    expect(gainOf(all[1]).value).toBeCloseTo(velocityGain(0.8) * 0.62, 9);
    expect(gainOf(all[2]).value).toBeCloseTo(velocityGain(0.8) * 0.55, 9);
  });

  it('a slide glides the ringing string to the new fret, arriving on the beat, with no new attack', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.pluck(60, 1, { string: 3, duration: 0.5 });
    g.pluck(62, 1.5, { string: 3, duration: 0.5, legato: 'slide' });
    const all = sources(ctx);
    expect(all).toHaveLength(1);
    const glide = rateEvents(all[0], 'curve');
    expect(glide).toHaveLength(1);
    expect(glide[0].value).toBeCloseTo(ratio(2), 6);
    // It begins a moment before the new note (0.03-0.12 s) so that it lands on it.
    const lead = 1.5 - CHAIN - glide[0].time;
    expect(lead).toBeGreaterThanOrEqual(0.03 - 1e-6);
    expect(lead).toBeLessThanOrEqual(0.12 + 1e-6);
  });

  it('a bend on a hammered note bends from the new pitch', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.pluck(60, 1, { string: 3, duration: 0.3 });
    g.pluck(62, 1.3, { string: 3, duration: 0.8, legato: 'hammer', bend: 1 });
    const hammered = sources(ctx)[1];
    expect(rateEvents(hammered, 'curve').at(-1)!.value).toBeCloseTo(ratio(1), 6);
  });

  it('a slide carries on through a bend that was still rising: the bend is cut where the glide begins', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.pluck(60, 1, { string: 3, bend: 2 }); // no duration: the bend curve runs on
    g.pluck(64, 1.15, { string: 3, duration: 0.5, legato: 'slide' });
    const [src] = sources(ctx);
    expect(sources(ctx)).toHaveLength(1);
    expect(rateEvents(src, 'hold').length).toBe(1);
    expect(rateEvents(src, 'curve').at(-1)!.value).toBeCloseTo(ratio(4), 6);
  });

  it('with nothing ringing (first note, after a rest, another string), a hammer-on is a soft note of its own', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.pluck(62, 1, { string: 3, duration: 0.3, legato: 'hammer' });
    g.pluck(60, 2, { string: 3, duration: 0.2 });
    g.pluck(62, 3, { string: 3, duration: 0.3, legato: 'hammer' }); // the 0.2 s note stopped long before
    g.pluck(67, 3.5, { string: 1, duration: 0.3, legato: 'pull' }); // nothing on string 1
    const all = sources(ctx);
    expect(all).toHaveLength(4);
    const picked = gainOf(all[1]).value;
    for (const i of [0, 2, 3]) {
      expect(gainOf(all[i]).value).toBeCloseTo(velocityGain(0.8) * 0.62, 9);
      expect(gainOf(all[i]).value).toBeLessThan(picked);
    }
  });

  it('a hammer-on without a string carries on the last note played', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.pluck(57, 1, { duration: 0.3 });
    g.pluck(59, 1.3, { duration: 0.3, legato: 'hammer' });
    expect(rateEvents(sources(ctx)[0], 'set').at(-1)!.value).toBeCloseTo(ratio(2), 9);
    expect(gainOf(sources(ctx)[1]).value).toBeCloseTo(velocityGain(0.8) * 0.55, 9);
  });

  it('stopping a slid-to note stops the string', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.pluck(60, 1, { string: 3, duration: 0.3 });
    const h = g.pluck(62, 1.3, { string: 3, legato: 'slide' });
    h.stop(1.5);
    // (Stopped with the guitar's release: a 15 ms fade, and the source ends once it has faded.)
    expect(sources(ctx)[0].stoppedAt!).toBeLessThan(1.65);
  });
});

describe('accents and strums', () => {
  it('an accent plays the note about 3 dB harder and brighter', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.pluck(52, 1, { string: 4, velocity: 0.7 });
    g.pluck(52, 2, { string: 4, velocity: 0.7, accent: true });
    const [plain, accented] = sources(ctx);
    const db = 20 * Math.log10(gainOf(accented).value / gainOf(plain).value);
    expect(db).toBeGreaterThan(2);
    expect(db).toBeLessThan(5);
    expect(accented.buffer).not.toBe(plain.buffer); // a brighter rendering
  });

  it('an accented strum: every string harder', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    g.strum([40, 47, 52, 56, 59, 64], 1, { velocity: 0.6 });
    g.strum([40, 47, 52, 56, 59, 64], 2, { velocity: 0.6, accent: true });
    const all = sources(ctx);
    for (let i = 0; i < 6; i++) expect(gainOf(all[6 + i]).value).toBeGreaterThan(gainOf(all[i]).value * 1.2);
  });
});

describe('phrases', () => {
  it('"5b7" on the G string plays one note bent a whole tone; "5h7" two notes, the second hammered', () => {
    const { ctx, engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    const bend = tabPhrase('5b7', 3)!;
    expect(bend).toHaveLength(1);
    expect(bend[0]).toMatchObject({ midi: 60, string: 3, bend: { amount: 2 } });
    playPhrase(bend, 1, { synth: g });
    expect(rateEvents(sources(ctx)[0], 'curve')[0].value).toBeCloseTo(ratio(2), 6);

    const ctx2 = runningEngine();
    const g2 = new GuitarSynth({ engine: ctx2.engine });
    const hammer = tabPhrase('5h7', 3, { noteSeconds: 0.3 })!;
    expect(hammer.map((n) => [n.midi, n.at, n.legato])).toEqual([[60, 0, undefined], [62, 0.3, 'hammer']]);
    const h = playPhrase(hammer, 1, { synth: g2 });
    expect(h.startTime).toBe(1);
    expect(h.endTime).toBeCloseTo(1 + 0.3 + 0.3 * 1.6, 9);
    expect(rateEvents(sources(ctx2.ctx)[0], 'set').at(-1)!.value).toBeCloseTo(ratio(2), 9);
    expect(gainOf(sources(ctx2.ctx)[1]).value).toBeCloseTo(velocityGain(0.8) * 0.55, 9);
    expect(tabPhrase('5h7', 9)).toBeNull();
    expect(tabPhrase('nope', 3)).toBeNull();
    // Drop D: the low string is a tone lower.
    expect(tabPhrase('3', 6, { tuning: [38, 45, 50, 55, 59, 64] })![0].midi).toBe(41);
  });

  it('a line over a held chord: the chord keeps ringing under every note of the line', () => {
    const { ctx, engine } = runningEngine();
    const line = [64, 65, 67].map((midi, i) => ({ midi, at: 0.5 + i * 0.4, duration: 0.4, string: 1 }));
    const h = playLineOverChord([48, 52, 55, 60], line, 1, { engine });
    expect(h.endTime).toBeGreaterThanOrEqual(1 + 0.5 + 0.8 + 0.4 - 1e-9);
    const all = sources(ctx);
    const chord = all.filter((s) => s.startedAt! < 1.1);
    expect(chord).toHaveLength(4);
    // Released only when the line is over, not when a line note lands on one of its strings.
    for (const s of chord) expect(s.stoppedAt!).toBeGreaterThan(1 + 0.5 + 0.8 + 0.4 - 0.05);
    h.stop(1.2);
    for (const s of chord) expect(s.stoppedAt!).toBeLessThan(1.5);
    // On the keys instead: oscillators.
    const { ctx: c2, engine: e2 } = runningEngine();
    playLineOverChord([48, 52, 55], line, 1, { engine: e2, chordVoice: 'organ' });
    expect(c2.count('oscillator')).toBe(3);
  });

  it('a line over a chord asked for "now" starts chord and line together, even when nothing is rendered yet', () => {
    // Rendering a string takes real time; here every new buffer moves the audio clock on 5 ms.
    const ctx = new (class extends MockContext {
      createBuffer(channels: number, length: number, sampleRate: number) {
        this.currentTime += 0.005;
        return super.createBuffer(channels, length, sampleRate);
      }
    })(FS);
    ctx.state = 'running';
    const engine = new AudioEngine(asAudioContext(ctx), { reverb: false });
    engine.markUnlocked();
    const before = sources(ctx).length;
    playLineOverChord([48, 52, 55, 60], [{ midi: 64, at: 0, duration: 0.5, string: 1 }], undefined, { engine });
    const started = sources(ctx).slice(before).map((s) => s.startedAt!);
    expect(started).toHaveLength(5);
    // Before, the clock was read first: the line came 5 ms late and the chord 25 ms late.
    const line = started[0];
    const firstString = Math.min(...started.slice(1));
    expect(Math.abs(firstString - line)).toBeLessThan(0.001);
  });

  it('a slide down written "7\\5" slides in from above when the string cannot be carried on', () => {
    expect(tabPhrase('7\\5', 3)!.map((n) => [n.midi, n.legato, n.slideIn])).toEqual([[62, undefined, undefined], [60, 'slide', 'above']]);
    expect(tabPhrase('5/7', 3)![1].slideIn).toBeUndefined();
    // With the string still ringing it is a glide of that string, whatever slideIn says.
    const { ctx, engine } = runningEngine();
    playPhrase(tabPhrase('7\\5', 3, { noteSeconds: 0.4 })!, 1, { synth: new GuitarSynth({ engine }) });
    expect(sources(ctx)).toHaveLength(1);
  });
});

describe('a drone on the audio clock', () => {
  it('starts and stops where it is told to, and changes root on the beat', () => {
    const { ctx, engine } = runningEngine();
    const drone = startDrone({ root: 45, when: 2, duration: 3, fadeIn: 0.1 }, engine);
    expect(drone.startTime).toBe(2);
    const oscs = (ctx.created as MockSource[]).filter((s) => s.kind === 'oscillator');
    expect(oscs.length).toBeGreaterThan(0);
    for (const o of oscs) expect(o.startedAt).toBeCloseTo(2 - CHAIN, 9);
    // Fades out at 2 + 3 s.
    for (const o of oscs) expect(o.stoppedAt!).toBeGreaterThan(5 - CHAIN);
    expect(drone.running).toBe(true);
    drone.setRoot(50, 3);
    const after = (ctx.created as MockSource[]).filter((s) => s.kind === 'oscillator' && !oscs.includes(s));
    expect(after.length).toBe(oscs.length);
    for (const o of after) expect(o.startedAt).toBeCloseTo(3 - CHAIN, 9);
    for (const o of oscs) expect(o.stoppedAt!).toBeLessThan(3.5);
    // The new root still ends where the drone was told to end.
    for (const o of after) expect(o.stoppedAt!).toBeGreaterThan(5 - CHAIN);
    for (const o of after) expect(o.stoppedAt!).toBeLessThan(7);
    // Once the stop has come, it lets go of the context.
    ctx.advance(5.5);
    vi.advanceTimersByTime(6000);
    expect(drone.running).toBe(false);
  });
});

describe('cancel and unsubscribe handles', () => {
  it('a visual callback can be taken back before it runs', () => {
    let now = 0;
    const q = new VisualQueue(() => now);
    const ran: string[] = [];
    const cancelA = q.add(1, () => ran.push('a'));
    q.add(1, () => ran.push('b'));
    cancelA();
    now = 1.1;
    q.flush();
    expect(ran).toEqual(['b']);
    expect(() => cancelA()).not.toThrow();
  });

  it('scheduleVisual returns a working cancel on the shared engine and without Web Audio', async () => {
    const ran: string[] = [];
    const off = scheduleVisual(0, () => ran.push('no audio'));
    off();
    await vi.advanceTimersByTimeAsync(10);
    expect(ran).toEqual([]);
    (globalThis as Record<string, unknown>).AudioContext = class extends MockContext {
      constructor() {
        super(FS);
      }
    };
    await unlockAudio();
    const at = getEngine().now() + 0.1;
    const cancel = scheduleVisual(at, () => ran.push('cancelled'));
    scheduleVisual(at, () => ran.push('live'));
    cancel();
    getEngine().visual.flush(at + 0.01);
    expect(ran).toEqual(['live']);
  });

  it('onAudioUnlocked and onAudioClosed return unsubscribe functions', async () => {
    const calls: string[] = [];
    const off = onAudioUnlocked(() => calls.push('unlocked'));
    const kept = onAudioUnlocked(() => calls.push('kept'));
    const offClosed = onAudioClosed(() => calls.push('closed'));
    off();
    offClosed();
    (globalThis as Record<string, unknown>).AudioContext = class extends MockContext {
      constructor() {
        super(FS);
      }
    };
    await unlockAudio();
    await closeAudio();
    expect(calls).toEqual(['kept']);
    kept();
  });
});

describe('nonsense never throws and never reaches Web Audio as NaN', () => {
  it('bends, vibrato and legato with garbage', () => {
    const { engine } = runningEngine();
    const g = new GuitarSynth({ engine });
    expect(() => {
      g.pluck(60, 1, { bend: NaN, vibrato: { rate: NaN, depth: Infinity }, slideIn: 'sideways' as never, duration: NaN });
      g.pluck(60, 1.5, { bend: { amount: Infinity, release: true }, legato: 'tap' as never });
      g.pluck(62, 1.6, { legato: 'hammer', string: 99 });
      g.pluck(NaN, 2, { legato: 'slide' });
      g.strum([40, NaN, 52], 3, { accent: true });
    }).not.toThrow();
  });
});
