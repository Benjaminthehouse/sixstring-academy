/**
 * Test support for the adversarial corpus (`adversarial.test.ts`, `e2e/pitch-live.cjs`). Not part
 * of the public API and never imported by the app.
 *
 * The corpus is deliberately independent of `signals.ts` (the additive strings the detector was
 * developed against): notes come from the audio engine's waveguide guitar (`@/core/audio`), with
 * its body resonances, pick noise and two-stage decay, and are then put through what a laptop or
 * phone microphone in a living room does to them. A second, separate model (`stiffString`) adds
 * what the waveguide lacks: stretched partials and the pitch glide after a hard pluck.
 *
 * Everything is deterministic and pure.
 */
import { Rng, biquadCoeffs, biquadFilter, hashSeed, renderPluck, renderSequence } from '@/core/audio';
import type { SequenceNote, StringInstrument, ToneName } from '@/core/audio';
import { midiToFreq } from '@/core/math/pitch-math';
import { type AnalyzeOptions, analyze } from './engine';
import type { NoteOnEvent, PitchEvent, PitchReading } from './types';

/** Sounding standard tuning, low to high (string 6 .. string 1). */
export const OPEN_MIDI: readonly number[] = [40, 45, 50, 55, 59, 64];

/** MIDI number of a fretted position (string 1 = thinnest). */
export function midiAt(string: number, fret: number): number {
  return OPEN_MIDI[6 - string] + fret;
}

/** Root-mean-square of `x[a .. b)`. */
export function rms(x: ArrayLike<number>, a: number = 0, b: number = x.length): number {
  const lo = Math.max(0, Math.floor(a));
  const hi = Math.min(x.length, Math.floor(b));
  if (hi <= lo) return 0;
  let s = 0;
  for (let i = lo; i < hi; i++) s += x[i] * x[i];
  return Math.sqrt(s / (hi - lo));
}

/** Largest absolute sample. */
export function peak(x: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] < 0 ? -x[i] : x[i];
    if (v > m) m = v;
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

/** One note of the corpus. */
export interface NoteSpec {
  /** Guitarist's string number, 1 = thinnest. */
  string: number;
  fret: number;
  tone: ToneName;
  velocity: number;
  /** Detune from equal temperament in cents. */
  cents: number;
  sampleRate: number;
  /** Instrument the `muted` / `harmonic` tones are played on. */
  baseTone?: StringInstrument;
  /** Override the pitch (harmonics: a pitch that is not the fretted one). */
  midi?: number;
  /** Stop the note after this many seconds (staccato). */
  duration?: number;
}

const noteCache = new Map<string, Float32Array>();

/** MIDI pitch a note spec sounds at (before `cents`). */
export function midiOfSpec(n: NoteSpec): number {
  return n.midi ?? midiAt(n.string, n.fret);
}

/** Frequency of the first partial of a note spec, in Hz. */
export function freqOfSpec(n: NoteSpec): number {
  return midiToFreq(midiOfSpec(n)) * Math.pow(2, n.cents / 1200);
}

/** Render a note with the audio engine's guitar (cached: the same spec is degraded many ways). */
export function renderNote(n: NoteSpec, seconds: number): Float32Array {
  const key = [n.string, n.fret, n.tone, n.velocity, n.cents, n.sampleRate, n.baseTone ?? '', n.midi ?? '', n.duration ?? '', seconds].join('|');
  let x = noteCache.get(key);
  if (!x) {
    x = renderPluck({
      midi: midiOfSpec(n),
      string: n.string,
      tone: n.tone,
      velocity: n.velocity,
      cents: n.cents,
      sampleRate: n.sampleRate,
      baseTone: n.baseTone,
      duration: n.duration,
      seconds,
    });
    if (noteCache.size > 4000) noteCache.clear();
    noteCache.set(key, x);
  }
  return x;
}

/** Drop every cached note (frees memory between test groups). */
export function clearNoteCache(): void {
  noteCache.clear();
}

/** Options for {@link stiffString}. */
export interface StiffStringOptions {
  /** Frequency of the first partial in Hz. */
  freq: number;
  sampleRate: number;
  seconds: number;
  /** Inharmonicity coefficient B: partial k lies at k f1 sqrt((1 + B k^2) / (1 + B)). */
  B: number;
  /** Cents the string is sharp at the pluck; it relaxes with `glideMs` (default 0 / 60). */
  glideCents?: number;
  glideMs?: number;
  /** Pluck position as a fraction of the string (default 0.13). */
  pluck?: number;
  /** T60 of the first partial in seconds (default 4); partial k decays (1 + 0.012 k^2) times faster. */
  t60?: number;
  /** T60 of the first partial alone, when it couples to the body and dies early (a "wolf" note). Default: `t60`. */
  fundamentalT60?: number;
  /** Extra decay factor for the odd partials 3, 5, 7 ... (default 1 = like the even ones). */
  oddDecay?: number;
  /** Peak amplitude (default 0.4). */
  amplitude?: number;
  seed?: number;
}

/**
 * A stiff string by additive synthesis, written for this corpus only: stretched partials, faster
 * decay of the upper ones, and the downward pitch glide of a hard pluck (every partial follows the
 * same tension curve). The first partial is at `freq` once the glide has died away.
 */
export function stiffString(o: StiffStringOptions): Float32Array {
  const sr = o.sampleRate;
  const n = Math.round(o.seconds * sr);
  const out = new Float64Array(n);
  const rng = new Rng(hashSeed('stiff', o.freq, o.B, o.seed ?? 0));
  const pluck = o.pluck ?? 0.13;
  const t60 = o.t60 ?? 4;
  const glide = o.glideCents ?? 0;
  const glideTau = ((o.glideMs ?? 60) / 1000) * sr;
  // One shared phase ramp carries the glide; partial k advances `ratio[k]` times as fast.
  const ramp = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    ramp[i] = p;
    p += ((2 * Math.PI * o.freq) / sr) * (glide === 0 ? 1 : Math.pow(2, (glide * Math.exp(-i / glideTau)) / 1200));
  }
  const norm = Math.sqrt(1 + o.B);
  for (let k = 1; k <= 32; k++) {
    const ratio = (k * Math.sqrt(1 + o.B * k * k)) / norm;
    if (o.freq * ratio > Math.min(sr * 0.45, 6000)) break;
    const amp = (Math.sin(Math.PI * k * pluck) / k) * (1 + 0.2 * rng.bipolar());
    if (Math.abs(amp) < 1e-6) continue;
    const ph = rng.range(0, 2 * Math.PI);
    let rate = (1 + 0.012 * k * k) / t60;
    if (k === 1 && o.fundamentalT60 !== undefined) rate = 1 / o.fundamentalT60;
    else if (k % 2 === 1 && k > 1) rate *= o.oddDecay ?? 1;
    const perSample = Math.exp((-6.908 * rate) / sr);
    let env = amp;
    for (let i = 0; i < n; i++) {
      out[i] += env * Math.sin(ratio * ramp[i] + ph);
      env *= perSample;
    }
  }
  const attack = 0.0012 * sr;
  let max = 0;
  for (let i = 0; i < n; i++) {
    out[i] *= 1 - Math.exp(-i / attack);
    const v = Math.abs(out[i]);
    if (v > max) max = v;
  }
  const g = max > 0 ? (o.amplitude ?? 0.4) / max : 0;
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = out[i] * g;
  return y;
}

// ---------------------------------------------------------------------------------------------
// Degradations (each returns a new buffer)
// ---------------------------------------------------------------------------------------------

/** A small microphone capsule: 4th-order Butterworth high-pass at `hz`. */
export function micHighpass(x: Float32Array, sampleRate: number, hz: number): Float32Array {
  const y = x.slice();
  biquadFilter(y, biquadCoeffs({ type: 'highpass', freq: hz, q: 0.5411961 }, sampleRate));
  biquadFilter(y, biquadCoeffs({ type: 'highpass', freq: hz, q: 1.306563 }, sampleRate));
  return y;
}

/** White Gaussian noise, unit RMS. */
export function whiteNoise(length: number, seed: number): Float32Array {
  const rng = new Rng(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 2) {
    const u = Math.max(1e-12, rng.next());
    const r = Math.sqrt(-2 * Math.log(u));
    const a = 2 * Math.PI * rng.next();
    out[i] = r * Math.cos(a);
    if (i + 1 < length) out[i + 1] = r * Math.sin(a);
  }
  return out;
}

/** Pink (1/f) noise, unit RMS (Paul Kellett's filter bank over white noise). */
export function pinkNoise(length: number, seed: number): Float32Array {
  const w = whiteNoise(length, seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  const out = new Float32Array(length);
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const x = w[i];
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362;
    b6 = x * 0.115926;
    out[i] = v;
    sum += v * v;
  }
  const g = 1 / Math.sqrt(sum / length || 1);
  for (let i = 0; i < length; i++) out[i] *= g;
  return out;
}

/** Mains hum with harmonics (odd ones strongest, as from a transformer or a ground loop), unit RMS. */
export function mainsHum(length: number, sampleRate: number, base: 50 | 60, seed: number = 1): Float32Array {
  const amps = [1, 0.35, 0.7, 0.15, 0.4, 0.08, 0.2];
  const rng = new Rng(hashSeed('hum', base, seed));
  const out = new Float32Array(length);
  // Real mains is never exactly on frequency.
  const f0 = base * (1 + 0.002 * rng.bipolar());
  let sum = 0;
  const phases = amps.map(() => rng.range(0, 2 * Math.PI));
  for (let i = 0; i < length; i++) {
    let v = 0;
    for (let k = 0; k < amps.length; k++) v += amps[k] * Math.sin((2 * Math.PI * f0 * (k + 1) * i) / sampleRate + phases[k]);
    out[i] = v;
    sum += v * v;
  }
  const g = 1 / Math.sqrt(sum / length || 1);
  for (let i = 0; i < length; i++) out[i] *= g;
  return out;
}

/** Background sounds {@link background} can supply. */
export type BackgroundKind = 'white' | 'pink' | 'hum50' | 'hum60';

const backgroundCache = new Map<string, Float32Array>();

/**
 * `length` samples of unit-RMS background of the given kind. One long buffer per kind and sample
 * rate is generated and a seed-dependent stretch of it returned, so thousands of scenes do not
 * each pay for their own noise (the returned array is a view: do not write to it).
 */
export function background(kind: BackgroundKind, sampleRate: number, length: number, seed: number): Float32Array {
  const key = `${kind}|${sampleRate}`;
  const total = Math.max(length * 2, Math.round(sampleRate * 6));
  let buf = backgroundCache.get(key);
  if (!buf || buf.length < length + 1) {
    buf =
      kind === 'white'
        ? whiteNoise(total, 4711)
        : kind === 'pink'
          ? pinkNoise(total, 4712)
          : mainsHum(total, sampleRate, kind === 'hum50' ? 50 : 60, 4713);
    backgroundCache.set(key, buf);
  }
  const room = buf.length - length;
  const start = room > 0 ? (hashSeed('bg', seed) % room) : 0;
  return buf.subarray(start, start + length);
}

/** `a + gain * b` (b starting at sample `offset`); the result has the length of `a`. */
export function mixInto(a: Float32Array, b: ArrayLike<number>, gain: number, offset: number = 0): Float32Array {
  const out = a.slice();
  const end = Math.min(out.length, offset + b.length);
  for (let i = Math.max(0, offset); i < end; i++) out[i] += gain * b[i - offset];
  return out;
}

/** A few early reflections off a desk and a wall (a small, fairly dead room). */
export function earlyReflections(x: Float32Array, sampleRate: number, strength: number = 1): Float32Array {
  const taps: Array<[number, number]> = [
    [0.0031, 0.42],
    [0.0073, -0.33],
    [0.0119, 0.27],
    [0.0177, -0.2],
    [0.0233, 0.16],
    [0.0314, 0.11],
  ];
  const out = x.slice();
  for (const [seconds, gain] of taps) {
    const d = Math.round(seconds * sampleRate);
    for (let i = d; i < out.length; i++) out[i] += strength * gain * x[i - d];
  }
  return out;
}

/** Overdrive the converter: scale so the peak is `overDb` above full scale, then clip hard at +/-1. */
export function hardClip(x: Float32Array, overDb: number): Float32Array {
  const g = Math.pow(10, overDb / 20) / (peak(x) || 1);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = x[i] * g;
    out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
  return out;
}

/** Add a constant offset (a cheap converter). */
export function addDc(x: Float32Array, dc: number): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] + dc;
  return out;
}

/** Scale by `gainDb` and round to 16-bit steps, as a quiet input reaches the page. */
export function quietInput(x: Float32Array, gainDb: number): Float32Array {
  const g = Math.pow(10, gainDb / 20);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.round(x[i] * g * 32767) / 32767;
  return out;
}

/** Short gaps in the audio (an overloaded device, a Bluetooth hiccup): `count` gaps of `ms` between `from` and `to` seconds. */
export function dropouts(
  x: Float32Array,
  sampleRate: number,
  opts: { count: number; ms: number; from: number; to: number; depth?: number; seed: number },
): Float32Array {
  const out = x.slice();
  const rng = new Rng(opts.seed);
  const len = Math.round((opts.ms / 1000) * sampleRate);
  const ramp = Math.max(1, Math.round(0.0005 * sampleRate));
  const depth = opts.depth ?? 0;
  for (let c = 0; c < opts.count; c++) {
    const slot = (opts.to - opts.from) / opts.count;
    const at = Math.round((opts.from + slot * (c + rng.range(0.1, 0.9))) * sampleRate);
    for (let i = 0; i < len && at + i < out.length; i++) {
      const edge = Math.min(i, len - 1 - i);
      const g = edge < ramp ? depth + (1 - depth) * (1 - edge / ramp) : depth;
      out[at + i] *= Math.min(1, g);
    }
  }
  return out;
}

/**
 * Play `x` back at a varying speed: the pitch at output time t is the original times
 * 2^(centsAt(t) / 1200). Used for bends and vibrato (4-point Hermite interpolation).
 */
export function pitchWarp(x: Float32Array, sampleRate: number, seconds: number, centsAt: (t: number) => number): Float32Array {
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const k = Math.floor(pos);
    if (k + 2 >= x.length) break;
    const f = pos - k;
    const xm = k > 0 ? x[k - 1] : 0;
    const x0 = x[k];
    const x1 = x[k + 1];
    const x2 = x[k + 2];
    const c1 = 0.5 * (x1 - xm);
    const c2 = xm - 2.5 * x0 + 2 * x1 - 0.5 * x2;
    const c3 = 0.5 * (x2 - xm) + 1.5 * (x0 - x1);
    out[i] = ((c3 * f + c2) * f + c1) * f + x0;
    pos += Math.pow(2, centsAt(i / sampleRate) / 1200);
  }
  return out;
}

/** Cross-fade from `a` into `b` at `atSeconds` over `fadeMs`: a legato change with no new attack. */
export function legatoJoin(a: Float32Array, b: Float32Array, sampleRate: number, atSeconds: number, fadeMs: number, bGain: number = 1): Float32Array {
  const at = Math.round(atSeconds * sampleRate);
  const fade = Math.max(1, Math.round((fadeMs / 1000) * sampleRate));
  const out = new Float32Array(at + b.length);
  for (let i = 0; i < out.length; i++) {
    const g = i < at ? 0 : i >= at + fade ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * (i - at)) / fade);
    const va = i < a.length ? a[i] : 0;
    const vb = i >= at ? b[i - at] : 0;
    out[i] = va * (1 - g) + vb * g * bGain;
  }
  return out;
}

/** The kinds of non-note sound {@link handlingNoise} makes. */
export type HandlingKind = 'knock' | 'squeak' | 'thump' | 'scrape';

/**
 * Sounds a hand makes on a guitar that are not notes:
 *  - `knock`: knuckles or a forearm on the top. The body answers with its own modes (air resonance
 *    near 100 Hz, top plate near 200 Hz, a few more above), each ringing for some tens of ms;
 *  - `squeak`: a fingertip sliding along a wound string, a narrow band of noise sweeping upward;
 *  - `thump`: the palm landing on the strings or a bumped cable, a burst of low noise;
 *  - `scrape`: a pick or nail dragged along a wound string, broadband grit.
 * `kinds` limits the mix; events are about 0.4 s apart.
 */
export function handlingNoise(
  sampleRate: number,
  seconds: number,
  seed: number,
  level: number = 0.1,
  kinds: readonly HandlingKind[] = ['knock', 'squeak', 'thump', 'scrape'],
): Float32Array {
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  const rng = new Rng(seed);
  const events = Math.max(1, Math.round(seconds * 2.5));
  for (let e = 0; e < events; e++) {
    const at = Math.round(((e + rng.range(0.15, 0.85)) / events) * n);
    const kind = kinds[rng.int(kinds.length)];
    const g = level * rng.range(0.5, 1.5);
    if (kind === 'knock') {
      // Mode frequencies of real guitars scatter by several percent; they are not harmonics of each other.
      const modes: Array<[number, number, number]> = [
        [rng.range(92, 112), 1, rng.range(0.03, 0.07)],
        [rng.range(180, 215), rng.range(0.5, 1.1), rng.range(0.02, 0.04)],
        [rng.range(265, 300), rng.range(0.2, 0.6), 0.02],
        [rng.range(380, 430), rng.range(0.2, 0.6), 0.015],
        [rng.range(520, 600), rng.range(0.1, 0.4), 0.012],
      ];
      const len = Math.round(0.35 * sampleRate);
      const rise = 0.0006 * sampleRate;
      for (const [f, a, tau] of modes) {
        const ph = rng.range(0, 2 * Math.PI);
        const ts = tau * sampleRate;
        for (let i = 0; i < len && at + i < n; i++) {
          out[at + i] += g * a * Math.exp(-i / ts) * (1 - Math.exp(-i / rise)) * Math.sin((2 * Math.PI * f * i) / sampleRate + ph);
        }
      }
      // The click of the knuckle itself.
      const click = whiteNoise(Math.round(0.004 * sampleRate), hashSeed('click', seed, e));
      for (let i = 0; i < click.length && at + i < n; i++) out[at + i] += g * 0.5 * click[i] * Math.exp(-i / (0.001 * sampleRate));
    } else if (kind === 'squeak') {
      const len = Math.round(rng.range(0.08, 0.2) * sampleRate);
      const f0 = rng.range(1800, 2600);
      const f1 = f0 * rng.range(1.2, 1.9);
      const burst = whiteNoise(len, hashSeed('squeak', seed, e));
      let lp = 0;
      let bp = 0;
      for (let i = 0; i < len && at + i < n; i++) {
        const f = f0 + ((f1 - f0) * i) / len;
        const w = 2 * Math.sin((Math.PI * f) / sampleRate);
        // State-variable band-pass, Q about 12: a squeak has a clear, moving pitch.
        const hp = burst[i] - lp - bp / 12;
        bp += w * hp;
        lp += w * bp;
        out[at + i] += g * 0.5 * Math.sin((Math.PI * i) / len) * bp;
      }
    } else if (kind === 'thump') {
      const len = Math.round(rng.range(0.03, 0.08) * sampleRate);
      const burst = whiteNoise(len, hashSeed('thump', seed, e));
      let lp = 0;
      const a = Math.exp((-2 * Math.PI * rng.range(120, 350)) / sampleRate);
      for (let i = 0; i < len && at + i < n; i++) {
        lp = a * lp + (1 - a) * burst[i];
        out[at + i] += g * 4 * lp * Math.exp((-4 * i) / len);
      }
    } else {
      // The windings pass under the pick at a few hundred per second: a train of clicks, not a tone.
      const len = Math.round(rng.range(0.1, 0.3) * sampleRate);
      const burst = whiteNoise(len, hashSeed('scrape', seed, e));
      let gap = 0;
      let lp = 0;
      for (let i = 0; i < len && at + i < n; i++) {
        if (--gap <= 0) gap = Math.round(sampleRate / rng.range(250, 900));
        const pulse = gap < 0.0004 * sampleRate ? 1 : 0.15;
        lp += 0.5 * (burst[i] - lp);
        out[at + i] += g * 0.8 * pulse * (burst[i] - lp) * Math.sin((Math.PI * i) / len);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Scenes and scoring
// ---------------------------------------------------------------------------------------------

/** What was really played: one note of a scene. */
export interface TruthNote {
  /** Time of the pluck (or of the legato change), seconds from the start of the scene. */
  start: number;
  /** Time the note stops being scored (the next note, or where the scene ends). */
  end: number;
  /** Nominal MIDI number. */
  midi: number;
  /** True first-partial frequency in Hz; a function of scene time when the pitch moves. */
  freq: number | ((t: number) => number);
}

/** A buffer of audio and what is in it. */
export interface Scene {
  samples: Float32Array;
  sampleRate: number;
  notes: TruthNote[];
}

/** Lead-in before the first note of a scene: the tuner has been listening to the room for a while. */
export const LEAD_S = 0.25;

/** A scene with one note placed after the lead-in. `background` (same length as the result) is added underneath. */
export function singleNoteScene(note: Float32Array, sampleRate: number, midi: number, freq: number, seconds: number): Scene {
  const lead = Math.round(LEAD_S * sampleRate);
  const n = lead + Math.round(seconds * sampleRate);
  const samples = new Float32Array(n);
  samples.set(note.subarray(0, Math.min(note.length, n - lead)), lead);
  return { samples, sampleRate, notes: [{ start: LEAD_S, end: LEAD_S + seconds, midi, freq }] };
}

/** RMS of the loudest part of the first note of a scene (its first 300 ms): the reference for SNR figures. */
export function noteLevel(scene: Scene): number {
  const t = scene.notes[0];
  const sr = scene.sampleRate;
  return rms(scene.samples, t.start * sr, Math.min(t.end, t.start + 0.3) * sr);
}

/**
 * Seconds (scene time) until which `target` stays at least `marginDb` louder than `other`, both
 * measured as RMS over 40 ms. A monophonic tracker follows the loudest sound, so a note is only
 * scored while it is the loudest one; this is where "the loudest" ends.
 */
export function dominantUntil(target: ArrayLike<number>, other: ArrayLike<number>, sampleRate: number, from: number, to: number, marginDb: number): number {
  const win = Math.round(0.04 * sampleRate);
  const hop = Math.round(0.01 * sampleRate);
  const need = Math.pow(10, marginDb / 20);
  // The first 60 ms are the attack; the note has to dominate from there on.
  for (let a = Math.round((from + 0.06) * sampleRate); a + win <= Math.min(target.length, Math.round(to * sampleRate)); a += hop) {
    if (rms(target, a, a + win) < need * rms(other, a, a + win)) return a / sampleRate;
  }
  return to;
}

/**
 * Add `interference` (already scaled, same length) under a one-note scene and end the scored span
 * where the note stops being `marginDb` louder than it.
 */
export function withInterference(scene: Scene, interference: Float32Array, marginDb: number): Scene {
  const t = scene.notes[0];
  const end = dominantUntil(scene.samples, interference, scene.sampleRate, t.start, t.end, marginDb);
  return { ...scene, samples: mixInto(scene.samples, interference, 1), notes: [{ ...t, end }, ...scene.notes.slice(1)] };
}

/** Apply a per-sample transformation to a scene's audio, keeping its truth. */
export function mapScene(scene: Scene, fn: (x: Float32Array, sr: number) => Float32Array): Scene {
  return { ...scene, samples: fn(scene.samples, scene.sampleRate) };
}

/** Score of one truth note. */
export interface NoteScore {
  /** A note-on with the right MIDI number arrived while the note sounded. */
  detected: boolean;
  /** Milliseconds from the pluck to that note-on being reported (NaN when missed). */
  latencyMs: number;
  /** Error of the note-on's own start time in ms (NaN when missed). */
  onsetErrorMs: number;
  /** The first note-on in the note's span was a different note. */
  wrongFirst: boolean;
  /** Note-ons with another MIDI number reported during the note. */
  wrongNoteOns: number;
  /** ...of which an octave, a twelfth or two octaves away (up or down). */
  octaveNoteOns: number;
  /** Extra note-ons with the right MIDI number (false re-plucks, drop-outs and returns). */
  repeats: number;
  /** Pitch readings scored (those from `settleMs` after the pluck). */
  frames: number;
  /** Readings more than 50 cents from the truth. */
  grossFrames: number;
  /** ...of which within 50 cents of an octave, twelfth or double octave of the truth. */
  octaveFrames: number;
  /** Absolute errors in cents of the remaining readings. */
  errors: number[];
  /** Fraction of the scored span covered by pitch readings. */
  coverage: number;
  /** Seconds of the note that were scored (0 when the note never dominated). */
  span: number;
}

/** Options for {@link scoreScene}. */
export interface ScoreOptions extends AnalyzeOptions {
  /** Readings this soon after the pluck are not scored for accuracy, in ms (default 150). */
  settleMs?: number;
  /** Score readings only up to this long after the pluck, in ms (default: the whole note). */
  untilMs?: number;
  /** A note-on this many ms before the true pluck still belongs to the note (default 30). */
  earlyMs?: number;
}

function truthAt(t: TruthNote, time: number): number {
  return typeof t.freq === 'number' ? t.freq : t.freq(time);
}

const OCTAVE_SHIFTS = [12, 19, 24, -12, -19, -24];

function isOctaveOff(cents: number): boolean {
  for (const s of OCTAVE_SHIFTS) if (Math.abs(cents - s * 100) <= 50) return true;
  return false;
}

/** Result of {@link scoreScene}. */
export interface SceneScore {
  /** One score per truth note, in order. */
  scores: NoteScore[];
  /** Everything the engine emitted. */
  events: PitchEvent[];
  /** Note-ons that belong to no truth note (before the first, after the scored span of the last, or in a gap). */
  strays: NoteOnEvent[];
}

/** Run the real engine over a scene and score every truth note. Also returns the raw events. */
export function scoreScene(scene: Scene, opts: ScoreOptions = {}): SceneScore {
  const { settleMs = 150, untilMs, earlyMs = 30, ...engine } = opts;
  const events = analyze(scene.samples, scene.sampleRate, engine);
  const noteOns: NoteOnEvent[] = [];
  const pitches: PitchReading[] = [];
  for (const e of events) {
    if (e.type === 'noteon') noteOns.push(e);
    else if (e.type === 'pitch') pitches.push(e);
  }
  const hop = (engine.hopMs ?? 10) / 1000;
  const scores = scene.notes.map((t): NoteScore => {
    const from = t.start - earlyMs / 1000;
    const mine = noteOns.filter((n) => n.time >= from && n.time < t.end);
    const right = mine.filter((n) => n.midi === t.midi);
    // A wrong note-on is one that was reported while the note was still being scored. (When a
    // ringing string takes over at the very end of the span, its note-on arrives after the span
    // and is back-dated to where that string was first heard, which can be a few ms inside it.)
    const wrong = mine.filter((n) => n.midi !== t.midi && n.detectedAt < t.end);
    const first = right[0];
    const a = t.start + settleMs / 1000;
    const b = untilMs === undefined ? t.end : Math.min(t.end, t.start + untilMs / 1000);
    let frames = 0;
    let gross = 0;
    let oct = 0;
    const errors: number[] = [];
    for (const p of pitches) {
      if (p.time < a || p.time >= b) continue;
      frames++;
      const err = 1200 * Math.log2(p.freq / truthAt(t, p.time));
      if (Math.abs(err) > 50) {
        gross++;
        if (isOctaveOff(err)) oct++;
      } else {
        errors.push(Math.abs(err));
      }
    }
    return {
      detected: !!first,
      latencyMs: first ? (first.detectedAt - t.start) * 1000 : Number.NaN,
      onsetErrorMs: first ? (first.time - t.start) * 1000 : Number.NaN,
      wrongFirst: mine.length > 0 && mine[0].midi !== t.midi && mine[0].detectedAt < t.end,
      wrongNoteOns: wrong.length,
      octaveNoteOns: wrong.filter((n) => OCTAVE_SHIFTS.includes(n.midi - t.midi)).length,
      repeats: Math.max(0, right.length - 1),
      frames,
      grossFrames: gross,
      octaveFrames: oct,
      errors,
      coverage: b > a ? Math.min(1, (frames * hop) / (b - a)) : 0,
      span: Math.max(0, t.end - t.start),
    };
  });
  const strays = noteOns.filter((n) => !scene.notes.some((t) => n.time >= t.start - earlyMs / 1000 && n.time < t.end));
  return { scores, events, strays };
}

/** Totals over many scored notes: one row of the report. */
export interface Tally {
  name: string;
  notes: number;
  detected: number;
  wrongFirst: number;
  wrongNoteOns: number;
  octaveNoteOns: number;
  repeats: number;
  frames: number;
  grossFrames: number;
  octaveFrames: number;
  errors: number[];
  latencies: number[];
  coverage: number[];
  /** Descriptions of the worst cases, for debugging a failing row. */
  failures: string[];
}

/** An empty tally. */
export function newTally(name: string): Tally {
  return {
    name,
    notes: 0,
    detected: 0,
    wrongFirst: 0,
    wrongNoteOns: 0,
    octaveNoteOns: 0,
    repeats: 0,
    frames: 0,
    grossFrames: 0,
    octaveFrames: 0,
    errors: [],
    latencies: [],
    coverage: [],
    failures: [],
  };
}

/** Add one note's score to a tally. `label` identifies the case if it turns out to be a failure. */
export function addScore(t: Tally, s: NoteScore, label: string): void {
  t.notes++;
  if (s.detected) {
    t.detected++;
    t.latencies.push(s.latencyMs);
  }
  if (s.wrongFirst) t.wrongFirst++;
  t.wrongNoteOns += s.wrongNoteOns;
  t.octaveNoteOns += s.octaveNoteOns;
  t.repeats += s.repeats;
  t.frames += s.frames;
  t.grossFrames += s.grossFrames;
  t.octaveFrames += s.octaveFrames;
  for (const e of s.errors) t.errors.push(e);
  t.coverage.push(s.coverage);
  const bad = !s.detected || s.wrongNoteOns > 0 || s.grossFrames > 0;
  if (bad && t.failures.length < 12) {
    t.failures.push(
      `${label}: ${s.detected ? 'ok' : 'MISSED'} wrong=${s.wrongNoteOns} oct=${s.octaveNoteOns} gross=${s.grossFrames}/${s.frames}`,
    );
  }
}

/** The q-quantile (0..1) of a list of numbers (NaN for an empty list). */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

/** Summary numbers of a tally. */
export interface TallySummary {
  name: string;
  notes: number;
  detectedPct: number;
  wrongFirstPct: number;
  wrongNoteOns: number;
  octaveNoteOns: number;
  repeats: number;
  medianCents: number;
  p95Cents: number;
  maxCents: number;
  grossPct: number;
  octavePct: number;
  latencyMedianMs: number;
  latencyP95Ms: number;
  coveragePct: number;
}

/** Reduce a tally to the numbers the report prints. */
export function summarize(t: Tally): TallySummary {
  const mean = t.coverage.length ? t.coverage.reduce((a, b) => a + b, 0) / t.coverage.length : 0;
  return {
    name: t.name,
    notes: t.notes,
    detectedPct: t.notes ? (100 * t.detected) / t.notes : 0,
    wrongFirstPct: t.notes ? (100 * t.wrongFirst) / t.notes : 0,
    wrongNoteOns: t.wrongNoteOns,
    octaveNoteOns: t.octaveNoteOns,
    repeats: t.repeats,
    medianCents: quantile(t.errors, 0.5),
    p95Cents: quantile(t.errors, 0.95),
    maxCents: t.errors.length ? Math.max(...t.errors) : Number.NaN,
    grossPct: t.frames ? (100 * t.grossFrames) / t.frames : 0,
    octavePct: t.frames ? (100 * t.octaveFrames) / t.frames : 0,
    latencyMedianMs: quantile(t.latencies, 0.5),
    latencyP95Ms: quantile(t.latencies, 0.95),
    coveragePct: 100 * mean,
  };
}

function cell(v: number, width: number, digits: number): string {
  return (Number.isNaN(v) ? '-' : v.toFixed(digits)).padStart(width);
}

/** Header of the report table. */
export const REPORT_HEADER =
  `${'condition'.padEnd(44)}${'notes'.padStart(6)}${'found%'.padStart(8)}${'wrong1st%'.padStart(10)}${'wrongOn'.padStart(8)}${'octOn'.padStart(6)}${'repeat'.padStart(7)}` +
  `${'med c'.padStart(8)}${'p95 c'.padStart(8)}${'max c'.padStart(8)}${'gross%'.padStart(8)}${'oct%'.padStart(7)}${'cover%'.padStart(8)}${'lat ms'.padStart(8)}${'p95 ms'.padStart(8)}`;

/** One formatted row of the report table. */
export function reportRow(s: TallySummary): string {
  return (
    `${s.name.padEnd(44).slice(0, 44)}${String(s.notes).padStart(6)}${cell(s.detectedPct, 8, 1)}${cell(s.wrongFirstPct, 10, 2)}${String(s.wrongNoteOns).padStart(8)}${String(s.octaveNoteOns).padStart(6)}${String(s.repeats).padStart(7)}` +
    `${cell(s.medianCents, 8, 2)}${cell(s.p95Cents, 8, 2)}${cell(s.maxCents, 8, 2)}${cell(s.grossPct, 8, 2)}${cell(s.octavePct, 7, 2)}${cell(s.coveragePct, 8, 1)}${cell(s.latencyMedianMs, 8, 0)}${cell(s.latencyP95Ms, 8, 0)}`
  );
}

/** Convenience for sequences: render with the audio engine's sequencer (strings damp each other, one shared bus). */
export function renderNotes(notes: readonly SequenceNote[], sampleRate: number, seconds: number, tone: ToneName = 'steel'): Float32Array {
  return renderSequence(notes, { sampleRate, seconds, tone, gain: 0.8 });
}
