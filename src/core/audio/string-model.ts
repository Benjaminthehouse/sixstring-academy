/**
 * The plucked-string core: an extended Karplus-Strong / digital-waveguide loop.
 *
 *   excitation (one period of the plucked shape) ──►(+)──────────────────────────► output
 *                                                    ▲                        │
 *                                                    └─ allpass ◄─ loss ◄─ delay(N)
 *
 * What makes it stay in tune and sound like a string rather than a 1983 home computer:
 *
 *  - The loss filter is a cascade of symmetric 3-tap FIRs. They are linear-phase, so they delay
 *    every harmonic by exactly the same whole number of samples: the partials stay harmonic.
 *  - The remaining fractional delay is a first-order allpass whose coefficient is solved for the
 *    exact phase delay at the fundamental (not the usual low-frequency approximation), so the
 *    fundamental lands on the requested frequency to within a few thousandths of a cent.
 *  - Damping is designed from two decay times (fundamental and a high reference frequency), so a
 *    low string rings long with a slowly darkening tone and a high note dies sooner, at any
 *    sample rate.
 *  - The excitation is not white noise. It is one period of the band-limited waveform a plucked
 *    string really sends into the bridge, built harmonic by harmonic, so loudness and brightness
 *    are controlled per note instead of being left to chance.
 *
 * Pure functions on typed arrays; no Web Audio.
 */
import { TWO_PI } from './dsp';

/** Everything the sample loop needs, derived by {@link designLoop}. */
export interface LoopDesign {
  /** Period in samples (sampleRate / frequency). */
  period: number;
  /** Length of the integer delay line. */
  delay: number;
  /** Symmetric loss FIR taps, loop gain included. Length 2 * sections + 1. */
  taps: Float64Array;
  /** Number of 3-tap sections in the loss FIR. */
  sections: number;
  /** Per-section smoothing amount (0 = no high-frequency loss, 0.25 = maximum). */
  smoothing: number;
  /** One-pole low-pass coefficient for heavy damping (palm mutes); 0 = bypassed. */
  onePole: number;
  /** Broadband loop gain (< 1). */
  gain: number;
  /** Coefficient of the fractional-delay allpass. */
  allpass: number;
  /** Phase delay the allpass contributes at the fundamental, in samples (0.5 .. 1.5). */
  fraction: number;
}

/** Targets for {@link designLoop}. */
export interface LoopTargets {
  /** Frequency of the fundamental in Hz. */
  freq: number;
  sampleRate: number;
  /** Seconds for the fundamental to decay by 60 dB. */
  t60: number;
  /** Seconds for a partial at `highFreq` to decay by 60 dB (shorter = darker tail). */
  t60High: number;
  /** Reference frequency for `t60High` (default 4000 Hz). */
  highFreq?: number;
}

const LN_1000 = Math.log(1000);
/** Upper bound on loss-FIR sections; only very heavy damping (palm mutes on low strings) gets near it. */
const MAX_FIR_SECTIONS = 40;

function onePoleGain(p: number, w: number): number {
  return (1 - p) / Math.sqrt(1 - 2 * p * Math.cos(w) + p * p);
}

function onePoleDelay(p: number, w: number): number {
  return p > 0 ? Math.atan2(p * Math.sin(w), 1 - p * Math.cos(w)) / w : 0;
}

/**
 * Turn musical targets (pitch, two decay times) into loop coefficients.
 * The total phase delay of delay line + loss filters + allpass equals one period exactly at the
 * fundamental.
 */
export function designLoop(t: LoopTargets): LoopDesign {
  const fs = t.sampleRate;
  const freq = Math.min(t.freq, fs * 0.45);
  const period = fs / freq;
  const w0 = (TWO_PI * freq) / fs;
  // High reference: keep it above the fundamental and below Nyquist.
  const fh = Math.min(Math.max(t.highFreq ?? 4000, freq * 2.5), fs * 0.45);
  const wh = (TWO_PI * fh) / fs;
  const t60 = Math.max(0.01, t.t60);
  const t60h = Math.min(Math.max(0.004, t.t60High), t60);
  // Log gain per trip round the loop that gives those decay times.
  const l0 = -LN_1000 / (t60 * freq);
  const lh = -LN_1000 / (t60h * freq);
  const s0 = Math.sin(w0 / 2) ** 2;
  const sh = Math.sin(wh / 2) ** 2;
  const q = lh - l0; // extra attenuation wanted at the high reference (<= 0)

  // The FIR's delay must leave room for the delay line itself on short periods.
  const maxSections = Math.max(1, Math.min(MAX_FIR_SECTIONS, Math.floor(period / 4)));
  let sections = 1;
  let smoothing = 0;
  let onePole = 0;
  for (sections = 1; sections <= maxSections; sections++) {
    const e = Math.exp(q / sections);
    smoothing = (1 - e) / (4 * (sh - e * s0));
    if (smoothing <= 0.25) break;
  }
  if (sections > maxSections) {
    // The FIR alone cannot damp this much: max it out and let a one-pole low-pass do the rest.
    // (Its phase is not linear, so upper partials go slightly sharp; only extreme mutes get here.)
    sections = maxSections;
    smoothing = 0.25;
    const firQ = sections * Math.log((1 - 4 * smoothing * sh) / (1 - 4 * smoothing * s0));
    const rest = q - firQ;
    let lo = 0, hi = 0.985;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      const got = Math.log(onePoleGain(mid, wh) / onePoleGain(mid, w0));
      if (got > rest) lo = mid; else hi = mid;
    }
    onePole = (lo + hi) / 2;
    // Never let the low-pass eat more than a third of a short period.
    while (onePole > 0.02 && onePoleDelay(onePole, w0) > period / 3) onePole *= 0.9;
  }
  smoothing = Math.max(0, smoothing);

  const firAtF0 = (1 - 4 * smoothing * s0) ** sections;
  const gain = Math.min(0.999995, Math.exp(l0) / (firAtF0 * (onePole > 0 ? onePoleGain(onePole, w0) : 1)));

  // Loss FIR taps: [a, 1-2a, a] convolved with itself `sections` times, times the loop gain.
  let taps = new Float64Array([1]);
  for (let s = 0; s < sections; s++) {
    const next = new Float64Array(taps.length + 2);
    for (let i = 0; i < taps.length; i++) {
      next[i] += taps[i] * smoothing;
      next[i + 1] += taps[i] * (1 - 2 * smoothing);
      next[i + 2] += taps[i] * smoothing;
    }
    taps = next;
  }
  for (let i = 0; i < taps.length; i++) taps[i] *= gain;

  // Tuning: integer delay + FIR delay (= sections) + one-pole delay + allpass delay = period.
  const fixed = sections + onePoleDelay(onePole, w0);
  let delay = Math.floor(period - fixed - 0.5);
  if (delay < 1) delay = 1;
  const fraction = period - fixed - delay;
  const allpass = Math.sin(((1 - fraction) * w0) / 2) / Math.sin(((1 + fraction) * w0) / 2);
  return { period, delay, taps, sections, smoothing, onePole, gain, allpass, fraction };
}

/** Decay time (seconds to -60 dB) the designed loop gives a partial at `freq`. */
export function loopT60(d: LoopDesign, freq: number, sampleRate: number): number {
  const w = (TWO_PI * freq) / sampleRate;
  const fir = (1 - 4 * d.smoothing * Math.sin(w / 2) ** 2) ** d.sections;
  const g = d.gain * Math.abs(fir) * (d.onePole > 0 ? onePoleGain(d.onePole, w) : 1);
  if (g >= 1) return Infinity;
  if (g <= 0) return 0;
  return (-LN_1000 * d.period) / (Math.log(g) * sampleRate);
}

/**
 * One period of a harmonic waveform: sum over k of amp[k-1] * cos(2 pi k n / period + phase[k-1]).
 * Feeding exactly one period into the loop makes the loop continue it seamlessly.
 */
export function harmonicExcitation(period: number, amps: ArrayLike<number>, phases: ArrayLike<number>): Float64Array {
  const len = Math.ceil(period - 1e-9);
  const out = new Float64Array(len);
  const K = amps.length;
  for (let k = 1; k <= K; k++) {
    const a = amps[k - 1];
    if (a === 0) continue;
    const step = (TWO_PI * k) / period;
    // Rotation recurrence: two multiplies per sample instead of a cosine.
    const cs = Math.cos(step), sn = Math.sin(step);
    let c = Math.cos(phases[k - 1]) * a;
    let s = Math.sin(phases[k - 1]) * a;
    for (let n = 0; n < len; n++) {
      out[n] += c;
      const c2 = c * cs - s * sn;
      s = s * cs + c * sn;
      c = c2;
    }
  }
  return out;
}

/**
 * Run the string loop for `length` samples and return its output.
 * `excitation` is added at the loop input for its whole length (normally one period).
 */
export function runString(excitation: ArrayLike<number>, d: LoopDesign, length: number): Float32Array {
  const out = new Float32Array(length);
  const M = d.sections;
  const taps = d.taps;
  const centreTap = taps[M];
  const N = d.delay;
  // The whole history is kept in one flat array (zero-padded at the front), so the hot loop has no
  // wrap-around: `hist[pad + n]` is the loop signal at sample n.
  const pad = N + 2 * M + 1;
  const hist = new Float64Array(pad + length);
  const C = d.allpass;
  const p = d.onePole;
  const excLen = Math.min(excitation.length, length);
  let apX = 0, apY = 0, lp = 0;
  for (let n = 0; n < length; n++) {
    // Symmetric loss FIR centred on sample n - N - M.
    const c = pad + n - N - M;
    let acc = centreTap * hist[c];
    for (let i = 1; i <= M; i++) acc += taps[M - i] * (hist[c - i] + hist[c + i]);
    if (p > 0) {
      lp = (1 - p) * acc + p * lp;
      acc = lp;
    }
    const y = C * acc + apX - C * apY;
    apX = acc;
    apY = y;
    let v = n < excLen ? excitation[n] + y : y;
    // Flush the far tail so the loop never idles on denormals.
    if (v < 1e-25 && v > -1e-25) v = 0;
    hist[pad + n] = v;
    out[n] = v;
  }
  return out;
}
