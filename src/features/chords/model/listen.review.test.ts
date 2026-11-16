/**
 * An independent check of the trainer's microphone counting (written in review, separate from
 * the builder's own recordings in `listen.test.ts`): realistic takes of the hardest everyday pair
 * (C and Am share two of their three notes), with ring-over between strums, up-strums on the top
 * strings, uneven string levels, room noise and mains hum, re-strums of the held chord, a dull
 * string, a dead string, open strings struck mid-change and very fast changes.
 */
import { describe, expect, it } from 'vitest';
import { addHum, addNoise, analyze, EventHub, mix, seededRandom, strum } from '@/core/pitch';
import type { Voicing } from '@/core/guitar';
import { strumHint } from './hints';
import { ChangeCounter, specOf } from './listen';
import { defaultVoicing } from './voicings';

const SR = 44100;
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** One strum to place in a take. */
interface Hit {
  at: number;
  /** MIDI notes low to high as the shape sounds them. */
  midi: readonly number[];
  up?: boolean;
  /** Level per note (same order as `midi`), default uneven 0.65–1. */
  levels?: readonly number[];
}

/**
 * Lay strums on a timeline. Each strum rings into the next one: as the fingers lift and the
 * strings are struck again it fades over 60 ms to a faint residue (-22 dB), as a real change sounds.
 */
function take(hits: readonly Hit[], seconds: number, seed = 1): Float32Array {
  const rand = seededRandom(seed);
  let out: Float32Array = new Float32Array(Math.round(seconds * SR));
  hits.forEach((h, i) => {
    const next = hits[i + 1]?.at ?? seconds;
    const dur = Math.min(seconds - h.at, next - h.at + 0.5);
    const order = h.up ? [...h.midi].reverse() : [...h.midi];
    const levels = (h.levels ? (h.up ? [...h.levels].reverse() : [...h.levels]) : order.map(() => 0.65 + 0.35 * rand())) as number[];
    const s = strum({ freqs: order.map(hz), levels, sampleRate: SR, duration: dur, strumMs: h.up ? 8 : 14, attackNoise: 0.25, seed: seed * 97 + i, amplitude: 0.45 + 0.1 * rand() });
    const dampFrom = Math.round((next - h.at - 0.06) * SR);
    for (let j = Math.max(0, dampFrom); j < s.length; j++) s[j] *= Math.max(0.08, 1 - (j - dampFrom) / (0.06 * SR));
    out = mix(out, s, Math.round(h.at * SR));
  });
  return addHum(addNoise(out, 28, seed + 3), SR, { rms: 0.002 });
}

async function count(samples: Float32Array, chords: readonly Voicing[]) {
  const hub = new EventHub();
  const changes: number[] = [];
  const times: number[] = [];
  const unclear: Array<{ missing: readonly number[]; extra: readonly number[]; target: number }> = [];
  const counter = new ChangeCounter(hub, chords.map(specOf), {
    onChange: (_c, index, time) => {
      changes.push(index);
      times.push(time);
    },
    onUnclear: (m, target) => unclear.push({ missing: m.missing, extra: m.extra, target }),
  });
  counter.start();
  for (const e of analyze(samples, SR, { chroma: true })) {
    hub.emit(e);
    if (e.type === 'chroma' || e.type === 'onset') await Promise.resolve();
  }
  await Promise.resolve();
  const totals = counter.stop();
  return { ...totals, order: changes, times, unclearList: unclear };
}

const C = defaultVoicing('C')!;
const Am = defaultVoicing('Am')!;
const top4 = (v: Voicing) => [...v.midi].sort((a, b) => a - b).slice(-4);

describe('mic counting on independent, realistic takes (C and Am)', () => {
  it('counts every change, ignores re-strums of the held chord and up-strums count as strums', async () => {
    const rand = seededRandom(11);
    const hits: Hit[] = [{ at: 0.6, midi: C.midi }];
    let t = 0.6;
    let onC = true;
    let expected = 0;
    for (let k = 0; k < 12; k++) {
      // Sometimes the learner strums the held chord again (down-up) before changing.
      if (k % 4 === 1) {
        t += 0.45;
        hits.push({ at: t, midi: top4(onC ? C : Am), up: true });
      }
      t += 1.1 + 0.6 * rand();
      onC = !onC;
      hits.push({ at: t, midi: (onC ? C : Am).midi, up: k % 3 === 2 });
      expected++;
    }
    const r = await count(take(hits, t + 1.5, 5), [C, Am]);
    expect(r.changes).toBe(expected);
    expect(r.order).toEqual(Array.from({ length: expected }, (_x, i) => (i % 2 === 0 ? 1 : 0)));
    expect(r.unclear).toBe(0);
  }, 120_000);

  it('is lenient: a dull string (12 dB down) still counts', async () => {
    // Am x02210: string 2 (fret 1) is the only C. Here it is barely pressed: a quarter of the level.
    const amMidi = [...Am.midi].sort((a, b) => a - b);
    const levels = amMidi.map((m) => (m % 12 === 0 ? 0.25 : 0.9));
    const r = await count(take([{ at: 0.6, midi: C.midi }, { at: 2, midi: amMidi, levels }], 3.5, 7), [C, Am]);
    expect(r.changes).toBe(1);
  }, 60_000);

  it('does not count an Am whose only C is dead, and the hint points at string 2, fret 1', async () => {
    const dead = Am.midi.filter((m) => m % 12 !== 0);
    const r = await count(take([{ at: 0.6, midi: C.midi }, { at: 2, midi: dead }, { at: 3.6, midi: Am.midi }], 5, 9), [C, Am]);
    expect(r.changes).toBe(1);
    // The change is the full Am at 3.6 s, not the strum without its C.
    expect(r.times[0]).toBeGreaterThan(3.5);
    expect(r.unclear).toBe(1);
    expect(r.unclearList[0].missing).toContain(0);
    expect(strumHint(Am, r.unclearList[0], (n) => n).text).toMatch(/C\. It comes from string 2 at fret 1/);
  }, 60_000);

  it('does not count the open strings struck while the fingers are in the air', async () => {
    const open = [40, 45, 50, 55, 59, 64];
    const r = await count(take([{ at: 0.6, midi: C.midi }, { at: 2, midi: open }, { at: 3.4, midi: Am.midi }], 5, 13), [C, Am]);
    expect(r.changes).toBe(1);
    expect(r.order).toEqual([1]);
  }, 60_000);

  it('keeps up with very fast changes (about 130 a minute)', async () => {
    const hits: Hit[] = [];
    for (let k = 0; k <= 20; k++) hits.push({ at: 0.6 + k * 0.46, midi: (k % 2 === 0 ? C : Am).midi });
    const r = await count(take(hits, 0.6 + 21 * 0.46 + 1, 17), [C, Am]);
    expect(r.changes).toBe(20);
  }, 120_000);
});
