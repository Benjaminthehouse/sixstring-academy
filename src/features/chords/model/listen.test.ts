/**
 * The trainer's microphone counting, driven by real analysis: strummed chords built from the
 * pitch module's test signals, analysed offline exactly as the live pipeline does, and replayed.
 */
import { describe, expect, it } from 'vitest';
import { analyze, concat, EventHub, silence, strum, type ChordMatch } from '@/core/pitch';
import { strumHint } from './hints';
import { ChangeCounter, soundsLikeHeld, specOf } from './listen';
import { defaultVoicing } from './voicings';

const SR = 44100;
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function strummed(midis: readonly number[], seed: number, seconds = 1.1): Float32Array {
  return strum({ freqs: midis.map(hz), sampleRate: SR, duration: seconds, attackNoise: 0.2, seed, amplitude: 0.5 });
}

/** Replay events one by one, letting promise callbacks run in between (as they do live). */
async function replay(hub: EventHub, samples: Float32Array): Promise<void> {
  const events = analyze(samples, SR, { chroma: true });
  for (const e of events) {
    hub.emit(e);
    if (e.type === 'chroma' || e.type === 'onset') await Promise.resolve();
  }
  await Promise.resolve();
}

describe('counting clean changes by ear', () => {
  const G = defaultVoicing('G')!;
  const C = defaultVoicing('C')!;
  const Em = defaultVoicing('Em')!;

  it('counts G-C-G-C changes, ignores re-strums of the held chord, flags a wrong chord', async () => {
    // G (start), C (change 1), C again (held), G (change 2), Em (neither: unclear), C (change 3).
    const take = concat(
      silence(1.2, SR),
      strummed(G.midi, 1),
      strummed(C.midi, 2),
      strummed(C.midi, 3),
      strummed(G.midi, 4),
      strummed(Em.midi, 5),
      strummed(C.midi, 6),
      silence(0.6, SR),
    );
    const hub = new EventHub();
    const changes: Array<{ count: number; index: number }> = [];
    const unclear: ChordMatch[] = [];
    const counter = new ChangeCounter(hub, [specOf(G), specOf(C)], {
      onChange: (count, index) => changes.push({ count, index }),
      onUnclear: (m) => unclear.push(m),
    });
    counter.start();
    await replay(hub, take);
    const totals = counter.stop();
    expect(changes).toEqual([
      { count: 1, index: 1 },
      { count: 2, index: 0 },
      { count: 3, index: 1 },
    ]);
    expect(totals.changes).toBe(3);
    // The Em strum is the only one that rang as neither chord.
    expect(totals.unclear).toBe(1);
    expect(unclear).toHaveLength(1);
    const hint = strumHint(C, unclear[0], (n) => n);
    expect(hint.text.length).toBeGreaterThan(20);
  }, 60_000);

  it('does not count a chord with a dead string as a clean change, and says which note is missing', async () => {
    // C with string 2 (the C on fret 1) and string 5 dead: only E and G ring.
    const deadC = C.midi.filter((m) => m % 12 !== 0);
    const take = concat(silence(1.2, SR), strummed(G.midi, 7), strummed(deadC, 8), strummed(C.midi, 9), silence(0.6, SR));
    const hub = new EventHub();
    const unclear: ChordMatch[] = [];
    const counter = new ChangeCounter(hub, [specOf(G), specOf(C)], { onUnclear: (m) => unclear.push(m) });
    counter.start();
    await replay(hub, take);
    const totals = counter.stop();
    expect(totals.changes).toBe(1);
    expect(unclear.length).toBe(1);
    expect(unclear[0].missing).toContain(0);
    expect(strumHint(C, unclear[0], (n) => n).text).toMatch(/could not hear the C/);
  }, 60_000);

  it('recognises an attempt that is really the held chord', () => {
    const g = specOf(defaultVoicing('G')!);
    expect(soundsLikeHeld({ missing: [0, 4], extra: [11, 2] }, g)).toBe(true);
    expect(soundsLikeHeld({ missing: [0], extra: [6] }, g)).toBe(false);
    expect(soundsLikeHeld({ missing: [0], extra: [] }, g)).toBe(false);
  });

  it('needs two chords', () => {
    expect(() => new ChangeCounter(new EventHub(), [specOf(defaultVoicing('G')!)])).toThrow(RangeError);
  });
});
