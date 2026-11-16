/**
 * Rendering plucked notes to sample buffers: one note, a strum, or a whole sequence.
 *
 * `renderRawPluck` produces the dry string (what the live synth caches and sends through the
 * instrument's bus). `renderPluck`, `renderStrum` and `renderSequence` produce the finished sound
 * with the bus applied, for tests, fixtures and WAV export. All pure and deterministic: the same
 * arguments always give the same samples.
 */
import { midiToFreq } from '@/core/math/pitch-math';
import { Rng, biquadCoeffs, biquadFilter, clamp, fadeOut, filterChain, finiteOr, hashSeed, limiterCurve, sanitize, type BiquadSpec } from './dsp';
import { designLoop, harmonicExcitation, runString, type LoopDesign } from './string-model';
import {
  INSTRUMENTS,
  driveShape,
  locateOnNeck,
  resolveTone,
  velocityGain,
  type Articulation,
  type FxChain,
  type InstrumentDef,
  type NeckPosition,
  type StringInstrument,
  type ToneName,
} from './tones';

/** How a single note is played. Shared by the offline renderer and the live synth. */
export interface PluckOptions {
  /** Playing strength 0..1 (default 0.8). Louder is also brighter. */
  velocity?: number;
  /** Which guitar (default `steel`). `muted` and `harmonic` are articulations of the base tone. */
  tone?: ToneName;
  /** Explicit articulation; overrides the one implied by `tone`. */
  articulation?: Articulation;
  /** Guitarist's string number, 1 = thinnest. Decides timbre and which ringing note it replaces. */
  string?: number;
  /** Pick direction. An up-stroke displaces the string the other way (inverted polarity). */
  direction?: 'down' | 'up';
  /** -1 (soft, towards the neck) .. +1 (hard, towards the bridge). Default 0. */
  brightness?: number;
  /** Detune from equal temperament in cents (ear-training "is it sharp?" exercises). */
  cents?: number;
  /** Reference pitch of A4 in Hz (default 440). */
  a4?: number;
}

/** Full description of one note for the offline renderer. */
export interface PluckSpec extends PluckOptions {
  midi: number;
  sampleRate: number;
  /** Stop the note (with a natural release) after this many seconds. Default: let it ring. */
  duration?: number;
  /** Cap on the rendered length in seconds. */
  seconds?: number;
  /** Instrument that `muted` / `harmonic` are played on (default `steel`). */
  baseTone?: StringInstrument;
}

/** A dry, level-normalised string note plus what is needed to play it. */
export interface RawPluck {
  samples: Float32Array;
  instrument: StringInstrument;
  articulation: Articulation;
  /** Exact frequency of the fundamental in Hz. */
  freq: number;
  neck: NeckPosition;
  design: LoopDesign;
  /** Natural release time of this instrument when the note is stopped. */
  release: number;
}

/** Short-time RMS every dry note is normalised to (measured after the instrument's `pre` filters). */
const TARGET_RMS = 0.18;

interface Playing {
  t60: number;
  t60High: number;
  brightness: number; // multiplier on the excitation cut-off
  slope: number; // added to the harmonic roll-off exponent
  noise: number; // multiplier on the pick noise
  pick: number; // pluck position as a fraction of the vibrating length
  level: number;
  maxSeconds: number;
  fast: number; // level of the fast-decaying polarisation (0 = single-stage decay)
}

function playingStyle(def: InstrumentDef, art: Articulation, midi: number, neck: NeckPosition): Playing {
  const pitchFactor = Math.pow(2, -(midi - 40) / def.sustainHalving);
  // The pick stays where it is while the string gets shorter, so it moves towards the middle.
  const pick = clamp(def.pickPosition * Math.pow(2, neck.fret / 12), 0.03, 0.45);
  const fretted = neck.fret > 0;
  const base: Playing = {
    t60: def.sustain * pitchFactor * (fretted ? 0.85 : 1),
    t60High: (neck.wound ? def.highSustain[0] : def.highSustain[1]) * (fretted ? 0.9 : 1),
    brightness: 1,
    slope: 0,
    noise: 1,
    pick,
    level: 1,
    maxSeconds: def.maxSeconds,
    fast: def.twoStage[0],
  };
  switch (art) {
    case 'palm-mute': {
      const t60 = clamp(0.3 * Math.pow(2, -(midi - 40) / 30), 0.12, 0.42);
      return { ...base, t60, t60High: 0.03, noise: 1.3, maxSeconds: t60 + 0.15, fast: 0 };
    }
    case 'dead':
      return { ...base, t60: 0.055, t60High: 0.016, brightness: 0.8, noise: 2.4, level: 0.8, maxSeconds: 0.2, fast: 0 };
    case 'harmonic':
      // An open string touched at a node: no fretting finger to damp it, few overtones.
      return {
        ...base,
        t60: Math.min(def.sustain, def.sustain * pitchFactor * 1.5),
        t60High: base.t60High * 1.3,
        brightness: 0.6,
        slope: 0.75,
        noise: 0.3,
        pick: 0.37,
        level: 0.8,
        fast: base.fast * 0.35,
      };
    case 'legato':
      // The fretting finger hammers (or pulls) the string: no pick, so no pick click, and a blunter,
      // darker attack than a pick stroke. The level is the caller's (the synth sets it).
      return { ...base, brightness: 0.55, slope: 0.15, noise: 0, pick: clamp(base.pick * 1.6, 0.05, 0.4) };
    default:
      return base;
  }
}

/** Largest RMS over 20 ms windows in the first part of a buffer. */
function attackRms(x: Float32Array, sampleRate: number): number {
  const win = Math.max(8, Math.round(0.02 * sampleRate));
  const hop = Math.max(1, win >> 2);
  let best = 0;
  for (let o = 0; o + win <= x.length; o += hop) {
    let s = 0;
    for (let i = 0; i < win; i++) s += x[o + i] * x[o + i];
    if (s > best) best = s;
  }
  return Math.sqrt(best / win);
}

/**
 * Render the dry string for one note: excitation, string loop, pick noise, level normalisation.
 * The result has not been through the instrument's bus (body / pickup / amp) and is not scaled by
 * velocity; velocity only shapes its brightness.
 */
export function renderRawPluck(spec: PluckSpec): RawPluck {
  // Nonsense in (NaN from a broken import, a pitch off the instrument) must give a note, not a crash.
  const fs = clamp(finiteOr(spec.sampleRate, 44100), 3000, 768000);
  const { instrument, articulation } = resolveTone(spec.tone, spec.articulation, spec.baseTone);
  const def = INSTRUMENTS[instrument];
  const midi = clamp(finiteOr(spec.midi, 45), 0, 127);
  const velocity = clamp(finiteOr(spec.velocity, 0.8), 0, 1);
  const bright = clamp(finiteOr(spec.brightness, 0), -1, 1);
  const freq = midiToFreq(midi, clamp(finiteOr(spec.a4, 440), 220, 880)) * Math.pow(2, clamp(finiteOr(spec.cents, 0), -2400, 2400) / 1200);
  const neck = locateOnNeck(def, midi, spec.string);
  const style = playingStyle(def, articulation, midi, neck);

  const design = designLoop({ freq, sampleRate: fs, t60: style.t60, t60High: style.t60High });
  const period = design.period;

  // --- Excitation: one period of the plucked string's bridge-force wave ------------------------
  // An ideal pluck at fraction p of the string gives harmonics sin(k pi p) / k (a rectangular wave
  // with duty p); a real pick or fingertip rounds it off above a cut-off that rises with velocity.
  // Seeded by the note's place on the neck only, so a pitch keeps its character at every dynamic.
  const rng = new Rng(hashSeed(instrument, midi, neck.stringIndex));
  const pick = clamp(style.pick * (1 - 0.35 * bright), 0.03, 0.45);
  const [lo, hi] = def.brightness;
  const cutoff = lo * Math.pow(hi / lo, velocity) * style.brightness * Math.pow(2, bright * 0.9);
  const slope = def.slope + style.slope;
  const pickup = def.pickupPosition !== undefined ? clamp(def.pickupPosition * Math.pow(2, neck.fret / 12), 0.02, 0.9) : 0;
  const K = Math.max(1, Math.floor(Math.min(fs * 0.45, 15000) / freq));
  const amps = new Float64Array(K);
  const phases = new Float64Array(K);
  for (let k = 1; k <= K; k++) {
    const f = k * freq;
    let a = Math.sin(Math.PI * k * pick) / Math.pow(k, slope);
    a *= Math.pow(1 + (f / cutoff) * (f / cutoff), -def.brightnessOrder / 2);
    if (pickup > 0) a *= Math.sin(Math.PI * k * pickup);
    // A little per-harmonic variation gives every note its own character, as on a real neck.
    a *= 1 + 0.16 * rng.bipolar();
    amps[k - 1] = a;
    phases[k - 1] = -Math.PI * k * pick + 0.25 * rng.bipolar();
  }
  const excitation = harmonicExcitation(period, amps, phases);

  // --- String ----------------------------------------------------------------------------------
  const wanted = Math.max(0.12, Math.min(style.maxSeconds, style.t60 * 0.72 + 0.15));
  const seconds = Math.min(wanted, Math.max(0.005, finiteOr(spec.seconds, wanted)));
  const length = Math.max(64, Math.round(seconds * fs));
  const samples = runString(excitation, design, length);

  // --- Second polarisation: louder at first, gone in a fraction of the time ----------------------
  // Same pitch to the thousandth of a cent (same design procedure), so it colours the envelope
  // without touching the tuning.
  if (style.fast > 0) {
    const fastT60 = clamp(style.t60 * def.twoStage[1], 0.3, 1.6);
    // Notes that are short anyway (the top of the neck) need little of it.
    const fastLevel = style.fast * clamp(style.t60 / 3, 0.35, 1);
    if (fastT60 < style.t60 * 0.8) {
      const fastDesign = designLoop({ freq, sampleRate: fs, t60: fastT60, t60High: Math.min(style.t60High * 0.7, fastT60) });
      const fastLength = Math.min(length, Math.round(fastT60 * fs));
      const fast = runString(excitation, fastDesign, fastLength);
      const fade = Math.max(1, Math.round(fastLength * 0.25));
      for (let i = 0; i < fastLength; i++) {
        const tail = fastLength - i;
        samples[i] += fast[i] * fastLevel * (tail < fade ? tail / fade : 1);
      }
    }
  }

  // --- Pick / nail noise at the attack ----------------------------------------------------------
  const noiseLevel = def.pickNoise * style.noise * (0.35 + 0.65 * velocity);
  if (noiseLevel > 0) {
    const nLen = Math.min(length, Math.round(0.03 * fs));
    const burst = new Float32Array(nLen);
    const tau = 0.0035 * fs;
    for (let i = 0; i < nLen; i++) burst[i] = rng.bipolar() * Math.exp(-i / tau);
    biquadFilter(burst, biquadCoeffs({ type: 'bandpass', freq: def.pickNoiseHz * Math.pow(2, bright * 0.4), q: 0.9 }, fs));
    const ref = attackRms(samples.subarray(0, Math.min(length, Math.round(0.06 * fs))), fs) || 1e-9;
    let burstPeak = 0;
    for (let i = 0; i < nLen; i++) burstPeak = Math.max(burstPeak, Math.abs(burst[i]));
    const g = burstPeak > 0 ? (noiseLevel * ref * 2.5) / burstPeak : 0;
    for (let i = 0; i < nLen; i++) samples[i] += burst[i] * g;
  }

  // --- Level: equal short-time loudness after the bus's linear front end ------------------------
  const probe = samples.slice(0, Math.min(length, Math.round(0.2 * fs)));
  filterChain(probe, def.fx.pre, fs);
  const measured = attackRms(probe, fs);
  const gain = measured > 1e-9 ? (TARGET_RMS * style.level) / measured : 0;
  for (let i = 0; i < length; i++) samples[i] *= gain;
  fadeOut(samples, Math.max(Math.round(0.03 * fs), Math.round(length * 0.2)));
  sanitize(samples);
  return { samples, instrument, articulation, freq, neck, design, release: def.release };
}

/** Run an instrument bus (pre filters, optional drive, post filters, level) over a buffer in place. */
export function applyFx(x: Float32Array, fx: FxChain, sampleRate: number): Float32Array {
  filterChain(x, fx.pre, sampleRate);
  if (fx.drive) {
    const { gain, asymmetry } = fx.drive;
    for (let i = 0; i < x.length; i++) x[i] = driveShape(x[i] * gain, asymmetry);
  }
  filterChain(x, fx.post, sampleRate);
  if (fx.level !== 1) for (let i = 0; i < x.length; i++) x[i] *= fx.level;
  sanitize(x);
  return x;
}

/** The bus of an instrument as a flat list of filters (only valid for buses without drive). */
export function busFilters(instrument: StringInstrument): BiquadSpec[] {
  const fx = INSTRUMENTS[instrument].fx;
  return [...fx.pre, ...fx.post];
}

/** Apply an exponential fade starting at sample `from` with time constant `tau` samples. */
function dampFrom(x: Float32Array, from: number, tau: number): void {
  const start = Math.max(0, Math.floor(from));
  let g = 1;
  const k = Math.exp(-1 / Math.max(1, tau));
  for (let i = start; i < x.length; i++) {
    g *= k;
    x[i] *= g;
    if (g < 1e-5) {
      x.fill(0, i);
      break;
    }
  }
}

/**
 * Render one finished note: string, velocity, optional note-off, and the instrument's bus.
 * This is the reference sound of the synth; the live engine reproduces it with the same numbers.
 */
export function renderPluck(spec: PluckSpec): Float32Array {
  const raw = renderRawPluck(spec);
  const fs = clamp(finiteOr(spec.sampleRate, 44100), 3000, 768000);
  const def = INSTRUMENTS[raw.instrument];
  const g = velocityGain(clamp(finiteOr(spec.velocity, 0.8), 0, 1)) * (spec.direction === 'up' ? -1 : 1);
  let x = raw.samples;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  const duration = finiteOr(spec.duration, NaN);
  if (duration >= 0) {
    dampFrom(x, duration * fs, (def.release / 3) * fs);
    const end = Math.min(x.length, Math.round((duration + def.release * 4) * fs));
    x = x.slice(0, Math.max(64, end));
  }
  return applyFx(x, def.fx, fs);
}

// ---------------------------------------------------------------------------------------------
// Strums and sequences
// ---------------------------------------------------------------------------------------------

/** How a chord is strummed. */
export interface StrumOptions extends Omit<PluckOptions, 'string' | 'direction'> {
  /** `down` plays the low strings first, `up` the high strings first. */
  direction?: 'down' | 'up';
  /** Seconds between the first and the last string (default 0.028; 0 = plucked together). */
  spread?: number;
  /** String numbers (1 = thinnest) matching `midis`; default: the top strings, lowest note lowest. */
  strings?: number[];
  /** Which part of the strum lands on the given time (default `start`). */
  align?: 'start' | 'center' | 'end';
}

/** One note of a planned strum. */
export interface StrumNote {
  midi: number;
  /** Seconds relative to the strum time (can be negative with `align`). */
  offset: number;
  velocity: number;
  string: number | undefined;
  direction: 'down' | 'up';
}

/**
 * Work out the order, timing and loudness of the notes in a strum. `midis` are given low to high.
 * The strings hit first are a little louder, as the pick loses energy crossing the strings.
 */
export function strumPlan(midis: readonly number[], opts: StrumOptions = {}): StrumNote[] {
  const n = midis.length;
  const direction = opts.direction === 'up' ? 'up' : 'down';
  const spread = clamp(finiteOr(opts.spread, 0.028), 0, 2);
  const velocity = finiteOr(opts.velocity, 0.8);
  const shift = opts.align === 'center' ? -spread / 2 : opts.align === 'end' ? -spread : 0;
  const notes: StrumNote[] = [];
  for (let order = 0; order < n; order++) {
    const i = direction === 'down' ? order : n - 1 - order;
    const frac = n > 1 ? order / (n - 1) : 0;
    notes.push({
      midi: midis[i],
      offset: shift + frac * spread,
      velocity: clamp(velocity * (1 - 0.14 * frac), 0, 1),
      string: opts.strings ? opts.strings[i] : n <= 6 ? n - i : undefined,
      direction,
    });
  }
  return notes;
}

/** One note of a sequence for {@link renderSequence}. */
export interface SequenceNote extends PluckOptions {
  /** Start time in seconds. */
  time: number;
  midi: number;
  /** Seconds until the note is stopped; omitted = rings until replaced on its string or it dies away. */
  duration?: number;
}

/** Options for {@link renderSequence}. */
export interface SequenceOptions {
  sampleRate: number;
  /** Default tone for notes that do not name one. */
  tone?: ToneName;
  /** Instrument that `muted` / `harmonic` are played on. */
  baseTone?: StringInstrument;
  /** Seconds of ring-out after the last note starts (default 2.5). */
  tail?: number;
  /** Total length in seconds; overrides `tail`. */
  seconds?: number;
  /** Output gain before the safety limiter (default 0.8). */
  gain?: number;
  /** Reference pitch of A4. */
  a4?: number;
}

/**
 * Render a timed list of notes the way the live synth would play them: a new note on a string
 * stops the one ringing there, notes with a duration are released, and every instrument's notes
 * share one bus. Returns mono samples that never exceed full scale.
 */
export function renderSequence(notes: readonly SequenceNote[], opts: SequenceOptions): Float32Array {
  const fs = opts.sampleRate;
  const sorted = notes.map((n, index) => ({ n, index })).sort((a, b) => a.n.time - b.n.time || a.index - b.index);
  const lastStart = sorted.length ? sorted[sorted.length - 1].n.time : 0;
  const total = Math.max(64, Math.round((opts.seconds ?? lastStart + (opts.tail ?? 2.5)) * fs));
  const buses = new Map<StringInstrument, Float32Array>();
  const cache = new Map<string, RawPluck>();
  for (let s = 0; s < sorted.length; s++) {
    const note = sorted[s].n;
    const tone = note.tone ?? opts.tone ?? 'steel';
    const velocity = clamp(note.velocity ?? 0.8, 0, 1);
    const key = [tone, note.articulation ?? '', note.midi, note.string ?? 0, Math.round(velocity * 16), note.brightness ?? 0, note.cents ?? 0].join('|');
    let raw = cache.get(key);
    if (!raw) {
      raw = renderRawPluck({ ...note, tone, velocity, sampleRate: fs, baseTone: opts.baseTone, a4: note.a4 ?? opts.a4 });
      cache.set(key, raw);
    }
    const def = INSTRUMENTS[raw.instrument];
    const start = Math.round(note.time * fs);
    if (start >= total) continue;
    // When does this note stop? Its own duration, or the next note on the same string.
    let stopAt = Infinity;
    let stopTau = (def.release / 3) * fs;
    if (note.duration !== undefined) stopAt = note.duration * fs;
    if (note.string !== undefined) {
      for (let j = s + 1; j < sorted.length; j++) {
        const later = sorted[j].n;
        if (later.string === note.string && later.time > note.time) {
          const gap = (later.time - note.time) * fs;
          if (gap < stopAt) {
            stopAt = gap;
            stopTau = 0.004 * fs;
          }
          break;
        }
      }
    }
    let x = raw.samples;
    if (stopAt < x.length) {
      x = x.slice();
      dampFrom(x, stopAt, stopTau);
    }
    let bus = buses.get(raw.instrument);
    if (!bus) {
      bus = new Float32Array(total);
      buses.set(raw.instrument, bus);
    }
    const g = velocityGain(velocity) * (note.direction === 'up' ? -1 : 1);
    const end = Math.min(x.length, total - start);
    for (let i = Math.max(0, -start); i < end; i++) bus[start + i] += x[i] * g;
  }
  const out = new Float32Array(total);
  const gain = opts.gain ?? 0.8;
  for (const [instrument, bus] of buses) {
    applyFx(bus, INSTRUMENTS[instrument].fx, fs);
    for (let i = 0; i < total; i++) out[i] += bus[i] * gain;
  }
  for (let i = 0; i < total; i++) out[i] = limiterCurve(out[i]);
  return out;
}

/** Options for {@link renderStrum}. */
export interface StrumRenderOptions extends StrumOptions {
  sampleRate: number;
  /** Total length in seconds (default: long enough for the chord to ring out, up to 4 s). */
  seconds?: number;
  /** Stop the chord after this many seconds. */
  duration?: number;
  baseTone?: StringInstrument;
}

/** Render a strummed chord (`midis` low to high) to mono samples. */
export function renderStrum(midis: readonly number[], opts: StrumRenderOptions): Float32Array {
  const plan = strumPlan(midis, opts);
  const lead = Math.max(0, -Math.min(0, ...plan.map((p) => p.offset)));
  const notes: SequenceNote[] = plan.map((p) => ({
    time: lead + p.offset,
    midi: p.midi,
    velocity: p.velocity,
    string: p.string,
    direction: p.direction,
    tone: opts.tone,
    articulation: opts.articulation,
    brightness: opts.brightness,
    cents: opts.cents,
    a4: opts.a4,
    duration: opts.duration,
  }));
  return renderSequence(notes, { sampleRate: opts.sampleRate, seconds: opts.seconds ?? 4, baseTone: opts.baseTone, a4: opts.a4 });
}
