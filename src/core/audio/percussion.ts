/**
 * The drum kit and the metronome clicks, all synthesised (there are no sample files).
 * Each sound is rendered once to a short buffer; the live engine caches and replays it.
 * Pure functions; deterministic for a given (name, sampleRate, variant).
 */
import { Rng, TWO_PI, biquadCoeffs, biquadFilter, fadeOut, hashSeed, peakOf, sanitize, type BiquadSpec } from './dsp';

/** Every piece of the kit. */
export type DrumName =
  | 'kick'
  | 'snare'
  | 'rimshot'
  | 'sidestick'
  | 'hihatClosed'
  | 'hihatOpen'
  | 'hihatPedal'
  | 'ride'
  | 'rideBell'
  | 'crash'
  | 'tomHigh'
  | 'tomMid'
  | 'tomLow'
  | 'clap'
  | 'shaker'
  | 'cowbell'
  | 'tambourine';

/** All drum names, for iteration (preloading, tests, a kit screen). */
export const DRUM_NAMES: readonly DrumName[] = [
  'kick', 'snare', 'rimshot', 'sidestick', 'hihatClosed', 'hihatOpen', 'hihatPedal', 'ride', 'rideBell',
  'crash', 'tomHigh', 'tomMid', 'tomLow', 'clap', 'shaker', 'cowbell', 'tambourine',
];

/** Peak level each drum is normalised to: the kit arrives pre-mixed. */
export const DRUM_LEVEL: Record<DrumName, number> = {
  kick: 0.9, snare: 0.72, rimshot: 0.74, sidestick: 0.5, hihatClosed: 0.3, hihatOpen: 0.3, hihatPedal: 0.22,
  ride: 0.3, rideBell: 0.36, crash: 0.42, tomHigh: 0.62, tomMid: 0.66, tomLow: 0.7, clap: 0.55, shaker: 0.24,
  cowbell: 0.42, tambourine: 0.3,
};

/** Drums that cut a ringing open hi-hat short, as closing the pedal does. */
export const HIHAT_CHOKERS: readonly DrumName[] = ['hihatClosed', 'hihatPedal'];

/** Sounds with a noisy component get two alternating variants so repeats do not sound mechanical. */
export const DRUM_VARIANTS: Partial<Record<DrumName, number>> = { hihatClosed: 3, snare: 2, shaker: 2, hihatPedal: 2 };

function buffer(seconds: number, fs: number): Float32Array {
  return new Float32Array(Math.max(16, Math.round(seconds * fs)));
}

function filtered(x: Float32Array, fs: number, ...specs: BiquadSpec[]): Float32Array {
  for (const s of specs) biquadFilter(x, biquadCoeffs(s, fs));
  return x;
}

function whiteNoise(len: number, rng: Rng): Float32Array {
  const x = new Float32Array(len);
  for (let i = 0; i < len; i++) x[i] = rng.bipolar();
  return x;
}

/** A sine whose pitch falls from `f0 * (1 + bend)` to `f0`, with an exponential amplitude decay. */
function addThump(out: Float32Array, fs: number, f0: number, bend: number, bendTau: number, ampTau: number, gain: number): void {
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / fs;
    const f = f0 * (1 + bend * Math.exp(-t / bendTau));
    phase += (TWO_PI * f) / fs;
    const attack = t < 0.0015 ? t / 0.0015 : 1;
    out[i] += Math.sin(phase) * Math.exp(-t / ampTau) * gain * attack;
  }
}

function addPartial(out: Float32Array, fs: number, freq: number, tau: number, gain: number): void {
  const w = (TWO_PI * freq) / fs;
  for (let i = 0; i < out.length; i++) out[i] += Math.sin(w * i) * Math.exp(-i / (tau * fs)) * gain;
}

/** Inharmonic square-wave cluster: the raw material of every cymbal. */
function metalCluster(len: number, fs: number, base: number, rng: Rng): Float32Array {
  const ratios = [1, 1.4471, 1.617, 1.9265, 2.5028, 2.6637];
  const x = new Float32Array(len);
  for (const r of ratios) {
    const f = base * r * (1 + 0.004 * rng.bipolar());
    const period = fs / f;
    let ph = rng.next() * period;
    for (let i = 0; i < len; i++) {
      x[i] += ph < period / 2 ? 1 : -1;
      ph += 1;
      if (ph >= period) ph -= period;
    }
  }
  for (let i = 0; i < len; i++) x[i] /= ratios.length;
  return x;
}

function shape(x: Float32Array, fs: number, env: (t: number) => number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] *= env(i / fs);
  return x;
}

function saturate(x: Float32Array, drive: number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive);
  return x;
}

function mix(out: Float32Array, src: Float32Array, gain: number): void {
  const n = Math.min(out.length, src.length);
  for (let i = 0; i < n; i++) out[i] += src[i] * gain;
}

function finish(x: Float32Array, fs: number, level: number): Float32Array {
  const p = peakOf(x);
  if (p > 0) {
    const g = level / p;
    for (let i = 0; i < x.length; i++) x[i] *= g;
  }
  fadeOut(x, Math.min(x.length, Math.round(0.012 * fs)));
  sanitize(x);
  return x;
}

function hat(fs: number, rng: Rng, seconds: number, env: (t: number) => number, dark = false): Float32Array {
  const len = Math.round(seconds * fs);
  const metal = filtered(metalCluster(len, fs, 365 * (1 + 0.012 * rng.bipolar()), rng), fs,
    { type: 'highpass', freq: dark ? 4200 : 5600, q: 0.8 }, { type: 'highpass', freq: dark ? 3800 : 5000, q: 0.7 });
  const air = filtered(whiteNoise(len, rng), fs, { type: 'highpass', freq: dark ? 4800 : 6500, q: 0.7 });
  const x = new Float32Array(len);
  mix(x, metal, 1);
  mix(x, air, 0.4);
  // Real cymbals carry little above 12 kHz; without this the hat is all hiss.
  filtered(x, fs, { type: 'lowpass', freq: dark ? 8000 : 11000, q: 0.7 }, { type: 'lowpass', freq: dark ? 9500 : 13000, q: 0.6 });
  return shape(x, fs, env);
}

function snareCore(fs: number, rng: Rng, seconds: number): Float32Array {
  const x = buffer(seconds, fs);
  addThump(x, fs, 186, 0.28, 0.012, 0.055, 0.6);
  addThump(x, fs, 331, 0.2, 0.01, 0.034, 0.3);
  const wires = filtered(whiteNoise(x.length, rng), fs,
    { type: 'highpass', freq: 1700, q: 0.7 }, { type: 'peaking', freq: 4600, q: 0.8, gain: 5 }, { type: 'lowpass', freq: 11000, q: 0.7 });
  shape(wires, fs, (t) => 0.62 * Math.exp(-t / 0.078) + 0.5 * Math.exp(-t / 0.004));
  mix(x, wires, 1);
  return saturate(x, 1.25);
}

function tom(fs: number, rng: Rng, f0: number, tau: number): Float32Array {
  const x = buffer(tau * 5 + 0.1, fs);
  addThump(x, fs, f0, 0.38, 0.03, tau, 0.9);
  addThump(x, fs, f0 * 1.59, 0.2, 0.02, tau * 0.45, 0.22);
  const stick = filtered(whiteNoise(Math.round(0.03 * fs), rng), fs, { type: 'bandpass', freq: 2800, q: 0.9 });
  shape(stick, fs, (t) => Math.exp(-t / 0.003));
  mix(x, stick, 0.45);
  return saturate(x, 1.3);
}

/**
 * Render one drum hit. `variant` selects an alternative take of the noisy drums (see DRUM_VARIANTS).
 */
export function renderDrum(name: DrumName, sampleRate: number, variant = 0): Float32Array {
  const fs = sampleRate;
  const rng = new Rng(hashSeed('drum', name, variant));
  let x: Float32Array;
  switch (name) {
    case 'kick': {
      x = buffer(0.5, fs);
      // A fast, deep pitch drop is the "punch"; the slow part is the shell note.
      let phase = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / fs;
        const f = 47 + 105 * Math.exp(-t / 0.024) + 70 * Math.exp(-t / 0.006);
        phase += (TWO_PI * f) / fs;
        const attack = t < 0.001 ? t / 0.001 : 1;
        x[i] = Math.sin(phase) * Math.exp(-t / 0.1) * attack;
      }
      saturate(x, 1.7);
      const beater = filtered(whiteNoise(Math.round(0.02 * fs), rng), fs, { type: 'bandpass', freq: 2600, q: 0.8 });
      shape(beater, fs, (t) => Math.exp(-t / 0.0022));
      mix(x, beater, 0.35);
      filtered(x, fs, { type: 'highpass', freq: 30, q: 0.7 });
      break;
    }
    case 'snare':
      x = snareCore(fs, rng, 0.42);
      break;
    case 'rimshot': {
      x = snareCore(fs, rng, 0.42);
      for (let i = 0; i < x.length; i++) x[i] *= 0.7;
      addPartial(x, fs, 524, 0.05, 0.3);
      addPartial(x, fs, 872, 0.035, 0.28);
      addPartial(x, fs, 1735, 0.02, 0.24);
      const crack = filtered(whiteNoise(Math.round(0.01 * fs), rng), fs, { type: 'highpass', freq: 2500, q: 0.7 });
      shape(crack, fs, (t) => Math.exp(-t / 0.001));
      mix(x, crack, 0.5);
      break;
    }
    case 'sidestick': {
      x = buffer(0.14, fs);
      addPartial(x, fs, 1760, 0.01, 0.5);
      addPartial(x, fs, 482, 0.028, 0.42);
      addPartial(x, fs, 3210, 0.004, 0.22);
      const knock = filtered(whiteNoise(Math.round(0.008 * fs), rng), fs, { type: 'bandpass', freq: 2500, q: 1.2 });
      shape(knock, fs, (t) => Math.exp(-t / 0.0015));
      mix(x, knock, 0.6);
      break;
    }
    case 'hihatClosed':
      x = hat(fs, rng, 0.14, (t) => Math.exp(-t / 0.019));
      break;
    case 'hihatOpen':
      x = hat(fs, rng, 0.9, (t) => 0.7 * Math.exp(-t / 0.12) + 0.3 * Math.exp(-t / 0.3));
      break;
    case 'hihatPedal':
      x = hat(fs, rng, 0.16, (t) => (t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / 0.026)), true);
      break;
    case 'ride':
    case 'rideBell': {
      const bell = name === 'rideBell';
      const len = Math.round(1.7 * fs);
      const metal = filtered(metalCluster(len, fs, 432, rng), fs,
        { type: 'highpass', freq: 2600, q: 0.7 }, { type: 'peaking', freq: 5600, q: 0.8, gain: 5 }, { type: 'lowpass', freq: 11500, q: 0.7 });
      shape(metal, fs, (t) => 0.62 * Math.exp(-t / 0.03) + (bell ? 0.2 : 0.38) * Math.exp(-t / 0.55));
      x = metal;
      const tick = buffer(0.03, fs);
      addPartial(tick, fs, 4300, 0.004, 0.5);
      mix(x, tick, 0.6);
      if (bell) {
        for (const [f, g] of [[655, 0.5], [988, 0.42], [1545, 0.3], [2190, 0.2]] as const) addPartial(x, fs, f, 0.45, g * 0.6);
      }
      break;
    }
    case 'crash': {
      const len = Math.round(2.3 * fs);
      const bright = filtered(whiteNoise(len, rng), fs, { type: 'highpass', freq: 4500, q: 0.7 }, { type: 'lowpass', freq: 11000, q: 0.6 });
      shape(bright, fs, (t) => Math.exp(-t / 0.3));
      const body = filtered(metalCluster(len, fs, 310, rng), fs, { type: 'highpass', freq: 1900, q: 0.7 }, { type: 'peaking', freq: 3600, q: 0.7, gain: 4 });
      const wash = filtered(whiteNoise(len, rng), fs, { type: 'bandpass', freq: 3600, q: 0.5 });
      mix(body, wash, 0.8);
      shape(body, fs, (t) => (t < 0.002 ? t / 0.002 : 1) * Math.exp(-t / 0.5));
      x = new Float32Array(len);
      mix(x, bright, 0.9);
      mix(x, body, 0.8);
      break;
    }
    case 'tomHigh':
      x = tom(fs, rng, 188, 0.11);
      break;
    case 'tomMid':
      x = tom(fs, rng, 140, 0.14);
      break;
    case 'tomLow':
      x = tom(fs, rng, 96, 0.19);
      break;
    case 'clap': {
      const len = Math.round(0.36 * fs);
      const a = filtered(whiteNoise(len, rng), fs, { type: 'bandpass', freq: 1200, q: 1.1 });
      const b = filtered(whiteNoise(len, rng), fs, { type: 'bandpass', freq: 2600, q: 1.5 });
      mix(a, b, 0.5);
      x = shape(a, fs, (t) => {
        let e = 0;
        for (const [at, g] of [[0, 0.9], [0.011, 0.8], [0.021, 0.9]] as const) if (t >= at) e += g * Math.exp(-(t - at) / 0.0035);
        if (t >= 0.03) e += 0.7 * Math.exp(-(t - 0.03) / 0.055);
        return e;
      });
      break;
    }
    case 'shaker': {
      const len = Math.round(0.17 * fs);
      x = filtered(whiteNoise(len, rng), fs, { type: 'highpass', freq: 3800, q: 0.7 }, { type: 'peaking', freq: 6800, q: 1, gain: 5 }, { type: 'lowpass', freq: 10500, q: 0.6 });
      shape(x, fs, (t) => (t < 0.018 ? Math.sin((Math.PI / 2) * (t / 0.018)) ** 2 : Math.exp(-(t - 0.018) / 0.028)));
      break;
    }
    case 'cowbell': {
      const len = Math.round(0.5 * fs);
      x = new Float32Array(len);
      for (const f of [545, 815]) {
        const period = fs / f;
        let ph = 0;
        for (let i = 0; i < len; i++) {
          x[i] += ph < period / 2 ? 0.5 : -0.5;
          ph += 1;
          if (ph >= period) ph -= period;
        }
      }
      filtered(x, fs, { type: 'bandpass', freq: 1150, q: 0.9 }, { type: 'lowpass', freq: 6000, q: 0.7 });
      shape(x, fs, (t) => 0.6 * Math.exp(-t / 0.012) + 0.4 * Math.exp(-t / 0.085));
      break;
    }
    case 'tambourine': {
      const len = Math.round(0.36 * fs);
      const jingle = filtered(metalCluster(len, fs, 1180, rng), fs, { type: 'highpass', freq: 4500, q: 0.7 });
      mix(jingle, filtered(whiteNoise(len, rng), fs, { type: 'highpass', freq: 6000, q: 0.7 }), 0.5);
      filtered(jingle, fs, { type: 'lowpass', freq: 12000, q: 0.6 });
      x = shape(jingle, fs, (t) => Math.exp(-t / 0.006) + (t >= 0.012 ? 0.8 * Math.exp(-(t - 0.012) / 0.07) : 0));
      break;
    }
  }
  return finish(x, fs, DRUM_LEVEL[name]);
}

// ---------------------------------------------------------------------------------------------
// Metronome clicks
// ---------------------------------------------------------------------------------------------

/** Click sound sets for the metronome. */
export type ClickSet = 'woodblock' | 'beep' | 'tick' | 'hihat' | 'rim' | 'cowbell' | 'clave';
/** How strong a click is: bar accent, group accent, plain beat, subdivision. */
export type ClickLevel = 'accent' | 'medium' | 'beat' | 'sub';

/** All click sets, for a picker. */
export const CLICK_SETS: readonly ClickSet[] = ['woodblock', 'beep', 'tick', 'hihat', 'rim', 'cowbell', 'clave'];

const CLICK_GAIN: Record<ClickLevel, number> = { accent: 0.62, medium: 0.5, beat: 0.42, sub: 0.24 };

/**
 * Render one metronome click. Within a set the accent is higher and louder, the subdivision
 * softer and shorter, so the bar is readable by ear without looking.
 */
export function renderClick(set: ClickSet, level: ClickLevel, sampleRate: number): Float32Array {
  const fs = sampleRate;
  const rng = new Rng(hashSeed('click', set, level));
  const short = level === 'sub';
  let x: Float32Array;
  switch (set) {
    case 'woodblock': {
      const f = level === 'accent' ? 1245 : level === 'medium' ? 1047 : 831;
      x = buffer(0.09, fs);
      addPartial(x, fs, f, short ? 0.007 : 0.012, 0.8);
      addPartial(x, fs, f * 2.42, 0.005, 0.3);
      const knock = filtered(whiteNoise(Math.round(0.006 * fs), rng), fs, { type: 'bandpass', freq: f * 2, q: 1.5 });
      shape(knock, fs, (t) => Math.exp(-t / 0.0012));
      mix(x, knock, 0.5);
      break;
    }
    case 'beep': {
      const f = level === 'accent' ? 1760 : level === 'medium' ? 1318.51 : 880;
      const hold = short ? 0.012 : 0.028;
      x = buffer(hold + 0.02, fs);
      const w = (TWO_PI * f) / fs;
      for (let i = 0; i < x.length; i++) {
        const t = i / fs;
        const a = t < 0.0015 ? t / 0.0015 : t < hold ? 1 : Math.max(0, 0.5 + 0.5 * Math.cos((Math.PI * (t - hold)) / 0.014));
        x[i] = Math.sin(w * i) * (t > hold + 0.014 ? 0 : a);
      }
      break;
    }
    case 'tick': {
      const f = level === 'accent' ? 2700 : level === 'medium' ? 2100 : 1650;
      x = buffer(0.05, fs);
      const burst = whiteNoise(Math.round(0.0012 * fs), rng);
      mix(x, burst, 1);
      filtered(x, fs, { type: 'bandpass', freq: f, q: short ? 3.5 : 6 }, { type: 'bandpass', freq: f, q: 2 });
      break;
    }
    case 'hihat': {
      const tau = level === 'accent' ? 0.045 : short ? 0.01 : 0.019;
      x = hat(fs, rng, tau * 6 + 0.02, (t) => Math.exp(-t / tau));
      break;
    }
    case 'rim': {
      const up = level === 'accent' ? 1.25 : level === 'medium' ? 1.1 : 1;
      x = buffer(0.12, fs);
      addPartial(x, fs, 1760 * up, short ? 0.006 : 0.01, 0.5);
      addPartial(x, fs, 482 * up, short ? 0.014 : 0.028, 0.42);
      const knock = filtered(whiteNoise(Math.round(0.008 * fs), rng), fs, { type: 'bandpass', freq: 2500 * up, q: 1.2 });
      shape(knock, fs, (t) => Math.exp(-t / 0.0015));
      mix(x, knock, 0.6);
      break;
    }
    case 'cowbell': {
      const up = level === 'accent' ? 1.335 : level === 'medium' ? 1.19 : 1;
      const len = Math.round((short ? 0.12 : 0.3) * fs);
      x = new Float32Array(len);
      for (const f of [545 * up, 815 * up]) {
        const period = fs / f;
        let ph = 0;
        for (let i = 0; i < len; i++) {
          x[i] += ph < period / 2 ? 0.5 : -0.5;
          ph += 1;
          if (ph >= period) ph -= period;
        }
      }
      filtered(x, fs, { type: 'bandpass', freq: 1150 * up, q: 0.9 }, { type: 'lowpass', freq: 6000, q: 0.7 });
      shape(x, fs, (t) => 0.6 * Math.exp(-t / 0.012) + 0.4 * Math.exp(-t / (short ? 0.025 : 0.06)));
      break;
    }
    case 'clave': {
      const f = level === 'accent' ? 2794 : level === 'medium' ? 2637 : 2489;
      x = buffer(0.1, fs);
      addPartial(x, fs, f, short ? 0.009 : 0.018, 0.8);
      addPartial(x, fs, f * 2.01, 0.006, 0.15);
      for (let i = 0; i < Math.min(x.length, Math.round(0.0008 * fs)); i++) x[i] *= i / (0.0008 * fs);
      break;
    }
  }
  return finish(x, fs, CLICK_GAIN[level]);
}
