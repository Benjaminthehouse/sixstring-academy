/**
 * Onset detection: timing accuracy against known pluck times, misses, and false alarms on
 * signals that have no onsets. A summary table is printed.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { renderSequence, strumPlan, type SequenceNote } from '@/core/audio';
import { midiToFreq } from '@/core/math/pitch-math';
import { dropouts, hardClip, LEAD_S, mapScene, midiAt, renderNote, singleNoteScene } from './adversarial-kit';
import { analyze } from './engine';
import { detectOnsets, OnsetDetector } from './onset';
import { addHum, addNoise, harmonicTone, mix, pluckedString, seededRandom, silence, strum, whiteNoise } from './signals';
import type { OnsetEvent } from './types';

interface Trial {
  signal: Float32Array;
  at: number;
}

interface Condition {
  name: string;
  make: (rand: () => number, trial: number, sr: number) => Trial;
  /** Largest share of plucks that may go unheard. */
  maxMissRate: number;
}

function pluck(midi: number, sr: number, seed: number, soft: boolean, amplitude = 0.4, duration = 0.6): Float32Array {
  const p = pluckedString({
    freq: midiToFreq(midi),
    sampleRate: sr,
    duration,
    amplitude,
    attackNoise: soft ? 0 : 0.3,
    attackMs: soft ? 6 : 1.5,
    seed,
  });
  // Damp the end like a finger would: an abrupt cut is a click, which is an onset in its own right.
  const fade = Math.round(0.02 * sr);
  for (let k = 0; k < fade; k++) p[p.length - 1 - k] *= k / fade;
  return p;
}

const fromSilence = (soft: boolean, snrDb: number) => (rand: () => number, trial: number, sr: number): Trial => {
  const at = 0.5 + rand() * 0.1;
  const midi = 40 + Math.floor(rand() * 37);
  const x = mix(silence(1.3, sr), pluck(midi, sr, trial + 1, soft, 0.2 + 0.4 * rand()), Math.round(at * sr));
  return { signal: addNoise(x, snrDb, trial, Math.round(at * sr)), at };
};

/** A note plucked while another string, plucked just as hard half a second earlier, is still ringing. */
const overRinging = (soft: boolean) => (rand: () => number, trial: number, sr: number): Trial => {
  const at = 0.5 + rand() * 0.1;
  const midi = 40 + Math.floor(rand() * 37);
  const other = 40 + Math.floor(rand() * 25);
  const old = pluck(other, sr, trial + 99, false, 0.4, 1.3);
  const x = mix(mix(silence(1.3, sr), old), pluck(midi, sr, trial + 1, soft), Math.round(at * sr));
  return { signal: addNoise(x, 45, trial), at };
};

const CONDITIONS: Condition[] = [
  { name: 'pick, from silence', make: fromSilence(false, 45), maxMissRate: 0 },
  { name: 'soft thumb, from silence', make: fromSilence(true, 45), maxMissRate: 0 },
  { name: 'pick, noisy room (25 dB SNR)', make: fromSilence(false, 25), maxMissRate: 0 },
  { name: 'pick, over a ringing string', make: overRinging(false), maxMissRate: 0.02 },
  { name: 'soft thumb, over a ringing string', make: overRinging(true), maxMissRate: 0.2 },
];

const table: string[] = [];
afterAll(() => {
  process.stdout.write(
    `\nOnset timing (ms; 80 plucks per row)\n${'condition'.padEnd(36)} ${'rate'.padStart(6)} ${'missed'.padStart(6)} ${'extra'.padStart(5)} ${'median'.padStart(7)} ${'|p95|'.padStart(6)} ${'|max|'.padStart(6)}\n${'-'.repeat(78)}\n${table.join('\n')}\n\n`,
  );
});

describe('onset timing', () => {
  for (const cond of CONDITIONS) {
    it(`${cond.name}: within 15 ms, typically a few`, () => {
      for (const sr of [44100, 48000]) {
        const rand = seededRandom(sr + cond.name.length);
        const errs: number[] = [];
        let missed = 0;
        let extra = 0;
        const trials = 80;
        for (let trial = 0; trial < trials; trial++) {
          const { signal, at } = cond.make(rand, trial, sr);
          // Ignore the pluck of the older string at the very start of the buffer.
          const onsets = detectOnsets(signal, sr).filter((o) => o.time > 0.1);
          const near = onsets.filter((o) => Math.abs(o.time - at) < 0.05);
          if (near.length === 0) missed++;
          else errs.push((near[0].time - at) * 1000);
          extra += onsets.length - Math.min(1, near.length);
        }
        const abs = errs.map(Math.abs).sort((a, b) => a - b);
        const sorted = [...errs].sort((a, b) => a - b);
        const p95 = abs[Math.floor(abs.length * 0.95)];
        const max = abs[abs.length - 1];
        table.push(
          `${cond.name.padEnd(36)} ${(sr / 1000 + 'k').padStart(6)} ${String(missed).padStart(6)} ${String(extra).padStart(5)} ${sorted[sorted.length >> 1].toFixed(1).padStart(7)} ${p95.toFixed(1).padStart(6)} ${max.toFixed(1).padStart(6)}`,
        );
        expect(missed / trials, `${cond.name} @${sr}: missed`).toBeLessThanOrEqual(cond.maxMissRate);
        expect(extra, `${cond.name} @${sr}: extra onsets`).toBe(0);
        expect(max, `${cond.name} @${sr}: worst timing error`).toBeLessThan(15);
        expect(p95, `${cond.name} @${sr}: 95th percentile timing error`).toBeLessThan(6);
      }
    }, 60_000);
  }

  it('keeps time on a run of eighth and sixteenth notes', () => {
    const sr = 44100;
    for (const gap of [0.25, 0.125]) {
      const count = 16;
      let x = silence(0.3 + count * gap + 0.5, sr);
      const scale = [52, 54, 56, 57, 59, 61, 63, 64];
      // A run on one string: each note ends when the next is fretted.
      for (let i = 0; i < count; i++) {
        x = mix(x, pluck(scale[i % scale.length], sr, i + 1, false, 0.4, gap), Math.round((0.3 + i * gap) * sr)).subarray(0, x.length);
      }
      const onsets = detectOnsets(x, sr);
      expect(onsets.length, `gap ${gap}`).toBe(count);
      onsets.forEach((o, i) => expect(Math.abs(o.time - (0.3 + i * gap))).toBeLessThan(0.006));
    }
  });

  it('counts a strum once, at its first string', () => {
    for (const sr of [44100, 48000]) {
      const chord = [82.41, 123.47, 164.81, 196, 246.94, 329.63];
      for (const strumMs of [4, 8, 10]) {
        const x = strum({ freqs: chord, sampleRate: sr, duration: 1, startTime: 0.4, strumMs, attackNoise: 0.3 });
        const onsets = detectOnsets(x, sr);
        expect(onsets.length, `strum ${strumMs} ms`).toBe(1);
        expect(Math.abs(onsets[0].time - 0.4)).toBeLessThan(0.008);
        expect(onsets[0].strength).toBeGreaterThan(10);
      }
      // A slow, deliberate strum starts to come apart into its strings with a shorter merge interval.
      const slow = strum({ freqs: chord, sampleRate: sr, duration: 1, startTime: 0.4, strumMs: 45, attackNoise: 0.3 });
      expect(detectOnsets(slow, sr, { minIntervalMs: 25 }).length).toBeGreaterThanOrEqual(2);
    }
  });
});

/**
 * Sixteenth-note strumming on the audio engine's guitar (not the strings the detector was built
 * on): a downstroke on all six strings, then the light upstroke on the top four one sixteenth
 * later while the chord still rings. The upstroke barely moves either energy envelope.
 */
function sixteenthStrumming(bpm: number, sr: number): { x: Float32Array; downs: number[]; ups: number[] } {
  const em = [40, 47, 52, 55, 59, 64];
  const sixteenth = 60 / bpm / 4;
  const notes: SequenceNote[] = [];
  const downs: number[] = [];
  const ups: number[] = [];
  // "1 e & a": down, up, down, up ... for four bars.
  for (let i = 0; i < 64; i++) {
    const t = 0.5 + i * sixteenth;
    const up = i % 2 === 1;
    const midis = up ? em.slice(2) : em;
    const strings = up ? [4, 3, 2, 1] : [6, 5, 4, 3, 2, 1];
    const plan = strumPlan(midis, { direction: up ? 'up' : 'down', velocity: up ? 0.56 : 0.76, spread: up ? 0.014 : 0.02, strings, align: 'start' });
    for (const p of plan) notes.push({ time: t + p.offset, midi: p.midi, velocity: p.velocity, string: p.string, direction: p.direction });
    (up ? ups : downs).push(t);
  }
  return { x: addNoise(renderSequence(notes, { sampleRate: sr, tail: 1, tone: 'steel' }), 40, bpm), downs, ups };
}

/**
 * One string of a strummed guitar, written apart from the pitch module's test strings and the audio
 * engine: each pluck replaces what the string was doing (a 4 ms hand-over), partial k decays at
 * 1.2 (1 + 0.6 (k - 1)) per second (the treble dies first, as on steel strings), and the pick adds a
 * short burst of noise in the treble.
 */
function addIndependentString(buf: Float64Array, sr: number, plucks: ReadonlyArray<{ t: number; midi: number; amp: number; noise: number }>, seed: number): void {
  const rand = seededRandom(seed);
  for (let p = 0; p < plucks.length; p++) {
    const pl = plucks[p];
    const start = Math.round(pl.t * sr);
    const end = Math.min(buf.length, p + 1 < plucks.length ? Math.round(plucks[p + 1].t * sr) : buf.length);
    const fade = Math.round(0.004 * sr);
    const f0 = midiToFreq(pl.midi);
    const pos = 0.12 + 0.1 * rand();
    for (let k = 1; k <= 40; k++) {
      const f = f0 * k * Math.sqrt(1 + 4e-5 * k * k);
      if (f > 9500) break;
      const amp = (pl.amp * Math.abs(Math.sin(Math.PI * k * pos))) / Math.pow(k, 0.9);
      const w = (2 * Math.PI * f) / sr;
      const d = Math.exp(-(1.2 * (1 + 0.6 * (k - 1))) / sr);
      const phase = rand() * 2 * Math.PI;
      let c = Math.cos(phase);
      let s = Math.sin(phase);
      const cw = Math.cos(w) * d;
      const sw = Math.sin(w) * d;
      const stop = Math.min(buf.length, end + fade);
      for (let i = start; i < stop; i++) {
        let g = amp * (1 - Math.exp(-(i - start) / (0.0007 * sr)));
        if (i >= end) g *= 1 - (i - end) / fade;
        buf[i] += g * s;
        const c2 = c * cw - s * sw;
        s = s * cw + c * sw;
        c = c2;
      }
    }
    let lp = 0;
    let prev = 0;
    for (let i = 0; i < Math.round(0.006 * sr) && start + i < buf.length; i++) {
      lp += 0.6 * (rand() * 2 - 1 - lp);
      buf[start + i] += pl.amp * pl.noise * (lp - prev) * Math.exp(-i / (0.0015 * sr));
      prev = lp;
    }
  }
}

/** Em, G, C and D as frets, low string first (null: not played). */
const INDEPENDENT_SHAPES: ReadonlyArray<ReadonlyArray<number | null>> = [[0, 2, 2, 0, 0, 0], [3, 2, 0, 0, 0, 3], [null, 3, 2, 0, 1, 0], [null, null, 0, 2, 3, 2]];

/** Two bars of "D . D U . U D U" in sixteenths on `shape`; `quick` marks the upstrokes right after a downstroke. */
function independentStrumming(bpm: number, shape: ReadonlyArray<number | null>, seed: number, sr: number): { x: Float32Array; targets: Array<{ t: number; quick: boolean }> } {
  const OPEN = [40, 45, 50, 55, 59, 64];
  const six = 60 / bpm / 4;
  const per: Array<Array<{ t: number; midi: number; amp: number; noise: number }>> = OPEN.map(() => []);
  const targets: Array<{ t: number; quick: boolean }> = [];
  const pattern = ['D', '-', 'D', 'U', '-', 'U', 'D', 'U'];
  for (let bar = 0; bar < 2; bar++) {
    pattern.forEach((stroke, j) => {
      if (stroke === '-') return;
      const t = 0.4 + (bar * 8 + j) * six;
      const up = stroke === 'U';
      const strings = shape.flatMap((f, i) => (f === null ? [] : [i]));
      const hit = up ? strings.filter((i) => i >= 2).reverse().slice(0, 4) : strings;
      const spread = up ? 0.009 : 0.016;
      hit.forEach((si, n) => per[si].push({ t: t + (n * spread) / Math.max(1, hit.length - 1), midi: OPEN[si] + (shape[si] ?? 0), amp: up ? 0.45 : 0.8, noise: up ? 0.25 : 0.3 }));
      targets.push({ t, quick: up && (j === 3 || j === 7) });
    });
  }
  const buf = new Float64Array(Math.round((0.4 + 16 * six + 1.2) * sr));
  per.forEach((plucks, si) => addIndependentString(buf, sr, plucks, 100 * seed + si + bpm));
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const rand = seededRandom(bpm + seed);
  const x = new Float32Array(buf.length);
  let pink = 0;
  for (let i = 0; i < x.length; i++) {
    const w = rand() * 2 - 1;
    pink = 0.97 * pink + 0.03 * w;
    x[i] = (buf[i] / max) * 0.5 + 0.004 * w + 0.05 * pink;
  }
  return { x, targets };
}

describe('quick upstrokes over a ringing chord', () => {
  it('hears every one, on time, with nothing extra', () => {
    const lines: string[] = [];
    for (const sr of [44100, 48000]) {
      for (const bpm of [70, 90, 110]) {
        const { x, downs, ups } = sixteenthStrumming(bpm, sr);
        const found = (onsets: readonly OnsetEvent[], at: readonly number[]) => at.map((t) => onsets.find((o) => Math.abs(o.time - t) < 0.03));
        const onsets = detectOnsets(x, sr);
        const upHits = found(onsets, ups);
        const errs = upHits.flatMap((o, i) => (o ? [Math.abs(o.time - ups[i]) * 1000] : []));
        // The two envelopes alone (the detector before the high-band flux) miss most of them.
        const before = found(detectOnsets(x, sr, { fluxThreshold: 0 }), ups).filter(Boolean).length;
        lines.push(`  ${sr / 1000}k ${bpm} BPM: upstrokes heard ${errs.length}/${ups.length} (envelopes alone ${before}), downstrokes ${found(onsets, downs).filter(Boolean).length}/${downs.length}, worst ${Math.max(...errs).toFixed(1)} ms`);
        expect(errs.length, `${sr} ${bpm}: upstrokes`).toBe(ups.length);
        expect(found(onsets, downs).every(Boolean), `${sr} ${bpm}: downstrokes`).toBe(true);
        expect(onsets.length, `${sr} ${bpm}: one onset per stroke`).toBe(ups.length + downs.length);
        expect(Math.max(...errs), `${sr} ${bpm}: worst upstroke timing`).toBeLessThan(6);
        expect(before, `${sr} ${bpm}: the envelopes alone`).toBeLessThan(ups.length / 2);
      }
    }
    table.push(`\nUpstrokes a sixteenth after a ringing downstroke (audio-engine guitar)\n${lines.join('\n')}`);
  }, 60_000);

  it('hears most of them on strings it was not tuned on (review: an independent string model)', () => {
    // The flux was tuned on the audio engine's guitar. Here each string is written afresh: a pluck
    // REPLACES what the string was doing (so an upstroke adds little energy), the treble dies first,
    // and the pick is a short noise burst. Strokes "D . D U . U D U" in sixteenths, two bars, on four
    // open chords, upstrokes 5 dB under the downstrokes, a little room noise.
    const sr = 44100;
    const lines: string[] = [];
    let quick = 0;
    let quickHeard = 0;
    let quickBefore = 0;
    let other = 0;
    let otherHeard = 0;
    let extra = 0;
    for (const bpm of [80, 100]) {
      for (const [ci, shape] of INDEPENDENT_SHAPES.entries()) {
        const { x, targets } = independentStrumming(bpm, shape, ci, sr);
        const match = (times: readonly number[]) => {
          const used = new Set<number>();
          return targets.map((tg) => {
            const i = times.findIndex((o, k) => !used.has(k) && Math.abs(o - tg.t) < 0.03);
            if (i >= 0) used.add(i);
            return i >= 0;
          });
        };
        const times = detectOnsets(x, sr).map((o) => o.time);
        const hit = match(times);
        const envelopesOnly = match(detectOnsets(x, sr, { fluxThreshold: 0 }).map((o) => o.time));
        targets.forEach((tg, i) => {
          if (tg.quick) {
            quick++;
            if (hit[i]) quickHeard++;
            if (envelopesOnly[i]) quickBefore++;
          } else {
            other++;
            if (hit[i]) otherHeard++;
          }
        });
        extra += times.length - hit.filter(Boolean).length;
      }
      lines.push(`  ${bpm} BPM: so far quick upstrokes ${quickHeard}/${quick} (envelopes alone ${quickBefore}), other strokes ${otherHeard}/${other}, extra ${extra}`);
    }
    table.push(`\nThe same on an independent string model (strings restart when struck; 44.1k)\n${lines.join('\n')}`);
    expect(quickBefore, 'the envelopes alone hear almost none').toBeLessThanOrEqual(2);
    expect(quickHeard, 'quick upstrokes').toBeGreaterThanOrEqual(Math.ceil(quick * 0.75));
    expect(otherHeard, 'every other stroke').toBe(other);
    expect(extra, 'nothing extra').toBeLessThanOrEqual(2);
  }, 60_000);

  it('does not hear a single ringing note of the audio-engine guitar as more strokes', () => {
    // A bright low string sends one burst of treble per period; the flux compares each frame
    // with a whole period of earlier ones, so those bursts are not new sound.
    for (const tone of ['steel', 'nylon', 'clean', 'driven'] as const) {
      for (let string = 1; string <= 6; string++) {
        for (const fret of [0, 3]) {
          const x = renderNote({ string, fret, tone, velocity: 0.95, cents: 0, sampleRate: 48000 }, 0.7);
          const scene = singleNoteScene(x, 48000, midiAt(string, fret), 0, 0.7);
          const late = detectOnsets(scene.samples, 48000).filter((o) => o.time > LEAD_S + 0.03 && o.time < LEAD_S + 0.68);
          expect(late.map((o) => o.time - LEAD_S), `${tone} string ${string} fret ${fret}`).toEqual([]);
        }
      }
    }
  }, 60_000);

  it('the engine passes them on, but not a clipped note decaying or sound coming back after a dropped buffer', () => {
    const sr = 48000;
    const onsetsOf = (x: Float32Array, opts = {}) => analyze(x, sr, opts).flatMap((e) => (e.type === 'onset' ? [e.time] : []));
    const { x, ups } = sixteenthStrumming(90, sr);
    const heard = onsetsOf(x);
    expect(ups.filter((t) => heard.some((o) => Math.abs(o - t) < 0.03)).length).toBe(ups.length);

    // The low E struck 12 dB into clipping: as it decays the flat tops shorten, and the high band
    // changes as if the string were struck again (only the flux hears that).
    const low = singleNoteScene(renderNote({ string: 6, fret: 0, tone: 'steel', velocity: 0.35, cents: -19, sampleRate: sr }, 0.9), sr, 40, 0, 0.7);
    const clipped = mapScene(low, (y) => hardClip(y, 12)).samples;
    expect(detectOnsets(clipped, sr).filter((t) => t.time > LEAD_S + 0.03).length, 'the bare detector').toBeGreaterThan(0);
    expect(onsetsOf(clipped).filter((t) => t > LEAD_S + 0.03)).toEqual([]);

    // C3 with three 10 ms dropped buffers; the cut of the first falls where the wave is quiet, so the
    // gap rule does not recognise it, and the restart is a click across the high band.
    const c3 = singleNoteScene(renderNote({ string: 6, fret: 8, tone: 'steel', velocity: 0.95, cents: 3, sampleRate: sr }, 0.9), sr, 48, 0, 0.7);
    const dropped = mapScene(c3, (y) => dropouts(y, sr, { count: 3, ms: 10, from: LEAD_S + 0.15, to: LEAD_S + 0.6, seed: 1008 })).samples;
    expect(onsetsOf(dropped).filter((t) => t > LEAD_S + 0.03)).toEqual([]);
  }, 60_000);
});

describe('onset false alarms', () => {
  it('stays quiet through sustained notes, ringing chords, noise and hum', () => {
    const sr = 44100;
    const steady: Array<[string, Float32Array]> = [];
    for (const midi of [40, 43, 45, 50, 55, 59, 64, 69, 76]) {
      for (const seed of [1, 2, 3]) {
        steady.push([
          `sustained ${midi}`,
          pluckedString({ freq: midiToFreq(midi), sampleRate: sr, duration: 3, decay: 0.5 + seed * 0.4, decayTilt: 0.004 * seed, rolloff: 0.5 + 0.25 * seed, seed, attackNoise: 0.3 }),
        ]);
        steady.push([
          `sustained ${midi} through a small mic, noisy`,
          addNoise(pluckedString({ freq: midiToFreq(midi), sampleRate: sr, duration: 3, seed, highpassHz: 200, highpassOrder: 3, attackNoise: 0.3 }), 30, seed),
        ]);
      }
    }
    steady.push(['two strings beating slowly', mix(harmonicTone({ freq: 196, sampleRate: sr, duration: 4, harmonics: 5 }), harmonicTone({ freq: 199, sampleRate: sr, duration: 4, harmonics: 5, seed: 3 }))]);
    steady.push(['loud noise', whiteNoise(4 * sr, 0.05, 3)]);
    steady.push(['quiet noise', whiteNoise(4 * sr, 0.003, 4)]);
    steady.push(['hum', addHum(silence(4, sr), sr, { rms: 0.01 })]);
    steady.push(['open E chord ringing', strum({ freqs: [82.4, 123.5, 164.8, 207.7, 246.9, 329.6], sampleRate: sr, duration: 4, decay: 0.7 })]);
    steady.push(['A minor ringing', strum({ freqs: [110, 164.8, 220, 261.6, 329.6], sampleRate: sr, duration: 4, decay: 0.5, seed: 4 })]);
    for (const [name, x] of steady) {
      // The first 80 ms hold the signal's own start, which is a real onset.
      const later = detectOnsets(x, sr).filter((o) => o.time > 0.08);
      expect(later.length, name).toBe(0);
    }
  });

  it('ignores attacks below the level threshold', () => {
    const sr = 44100;
    const quiet = mix(silence(1, sr), pluck(57, sr, 1, false, 0.0008), Math.round(0.4 * sr));
    expect(detectOnsets(quiet, sr).length).toBe(0);
    expect(detectOnsets(quiet, sr, { minLevelDb: -90 }).length).toBe(1);
  });
});

describe('OnsetDetector streaming', () => {
  it('gives the same onsets however the audio is chunked, and honours the stream origin', () => {
    const sr = 48000;
    let x = silence(2, sr);
    for (const [i, at] of [0.31, 0.74, 1.2, 1.35].entries()) x = mix(x, pluck(50 + i * 5, sr, i + 1, false), Math.round(at * sr)).subarray(0, x.length);
    const whole = detectOnsets(x, sr).map((o) => o.time);
    expect(whole.length).toBe(4);
    for (const chunk of [64, 128, 500, 4096]) {
      const det = new OnsetDetector({ sampleRate: sr });
      det.reset(10);
      const out: OnsetEvent[] = [];
      for (let i = 0; i < x.length; i += chunk) det.process(x.subarray(i, i + chunk), out);
      det.process(new Float32Array(2048), out);
      expect(out.map((o) => +(o.time - 10).toFixed(9)), `chunk ${chunk}`).toEqual(whole.map((t) => +t.toFixed(9)));
    }
  });
});
