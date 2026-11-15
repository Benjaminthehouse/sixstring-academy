/**
 * Synthetic guitar audio for tests and demos: plucked strings with the defects a real signal has
 * (weak fundamental through a small microphone, stiff-string inharmonicity, per-partial decay,
 * pick noise, the pitch settling after the pluck), strums, noise, mains hum, and a WAV codec so an
 * end-to-end test can hand a file to the browser as a fake microphone. Everything is deterministic
 * (seeded), pure, and independent of Web Audio.
 */

/** Deterministic uniform random generator in [0, 1) (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample from a uniform generator (Box-Muller). */
export function gaussian(rand: () => number): number {
  let u = rand();
  if (u < 1e-12) u = 1e-12;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Root-mean-square of `x[start .. end)`. */
export function rmsOf(x: ArrayLike<number>, start: number = 0, end: number = x.length): number {
  const a = Math.max(0, start);
  const b = Math.min(x.length, end);
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / (b - a));
}

/** Frequency of partial `k` of a stiff string whose FIRST partial is at `freq` (B = inharmonicity). */
export function partialFrequency(freq: number, k: number, inharmonicity: number = 0): number {
  return (freq * k * Math.sqrt(1 + inharmonicity * k * k)) / Math.sqrt(1 + inharmonicity);
}

/** Options for {@link harmonicTone}. */
export interface HarmonicToneOptions {
  /** Fundamental in Hz. */
  freq: number;
  sampleRate: number;
  /** Seconds. */
  duration: number;
  /** Peak amplitude of the result (default 0.5). */
  amplitude?: number;
  /** Explicit partial amplitudes [h1, h2, ...]; overrides `harmonics`/`rolloff`. */
  amplitudes?: readonly number[];
  /** Number of harmonics when `amplitudes` is not given (default 8). */
  harmonics?: number;
  /** Partial k has amplitude 1/k^rolloff (default 1). */
  rolloff?: number;
  /** Seed for the partial phases; omit for sine phase. */
  seed?: number;
}

/** A steady, perfectly harmonic tone: the reference signal for accuracy tests. */
export function harmonicTone(opts: HarmonicToneOptions): Float32Array {
  const { freq, sampleRate, duration } = opts;
  const n = Math.round(duration * sampleRate);
  const rand = opts.seed === undefined ? null : seededRandom(opts.seed);
  const count = opts.amplitudes ? opts.amplitudes.length : opts.harmonics ?? 8;
  const rolloff = opts.rolloff ?? 1;
  const acc = new Float64Array(n);
  for (let k = 1; k <= count; k++) {
    const f = freq * k;
    if (f >= sampleRate * 0.47) break;
    const amp = opts.amplitudes ? opts.amplitudes[k - 1] : Math.pow(k, -rolloff);
    if (amp === 0) continue;
    const w = (2 * Math.PI * f) / sampleRate;
    const p0 = rand ? rand() * 2 * Math.PI : 0;
    // Rotating phasor: far cheaper than a sin() per sample and exact enough over a few seconds.
    let c = Math.cos(p0);
    let s = Math.sin(p0);
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    for (let i = 0; i < n; i++) {
      acc[i] += amp * s;
      const c2 = c * cw - s * sw;
      s = s * cw + c * sw;
      c = c2;
    }
  }
  return normalisePeak(acc, opts.amplitude ?? 0.5);
}

function normalisePeak(acc: Float64Array, peak: number): Float32Array {
  let max = 0;
  for (let i = 0; i < acc.length; i++) {
    const v = Math.abs(acc[i]);
    if (v > max) max = v;
  }
  const g = max > 0 ? peak / max : 0;
  const out = new Float32Array(acc.length);
  for (let i = 0; i < acc.length; i++) out[i] = acc[i] * g;
  return out;
}

/** Options for {@link pluckedString}. */
export interface PluckOptions {
  /** Frequency of the first partial in Hz: what a tuner should read. */
  freq: number;
  sampleRate: number;
  /** Seconds of sound after the pluck. */
  duration: number;
  /** Seconds of silence before the pluck (default 0). */
  startTime?: number;
  /** Peak amplitude of the tonal part (default 0.5). */
  amplitude?: number;
  /** Maximum number of partials (default 30; always limited to below 0.45 x sample rate and `maxPartialHz`). */
  partials?: number;
  /** Highest partial frequency synthesised (default 9000 Hz). */
  maxPartialHz?: number;
  /** Partial k starts at amplitude 1/k^rolloff (default 1). */
  rolloff?: number;
  /** Where the string is plucked, as a fraction of its length; shapes the spectrum. 0 disables (default 0.18). */
  pluckPosition?: number;
  /** Stiff-string coefficient B: partial k sits at k f0 sqrt(1 + B k^2). Guitar strings: about 1e-5 .. 2e-4. */
  inharmonicity?: number;
  /** Amplitude decay rate of the first partial in 1/s (default 1.5). */
  decay?: number;
  /** Partial k decays at decay x (1 + decayTilt (k^2 - 1)) (default 0.02). */
  decayTilt?: number;
  /** Extra linear gain on the first partial; below 1 gives a weak fundamental (default 1). */
  fundamentalGain?: number;
  /** Emulate a small microphone: Butterworth high-pass corner in Hz applied to the partials (default off). */
  highpassHz?: number;
  /** Order of that high-pass (default 2; laptop and phone capsules behave like 2 to 4). */
  highpassOrder?: number;
  /** Rise time of the pluck in ms (default 1.5). */
  attackMs?: number;
  /** Level of the pick-noise burst relative to the tone peak (default 0 = none; 0.3 is a firm pick). */
  attackNoise?: number;
  /** Decay time of the pick noise in ms (default 8). */
  attackNoiseMs?: number;
  /** How many cents sharp the string starts (it relaxes exponentially). Default 0. */
  driftCents?: number;
  /** Time constant of that relaxation in ms (default 45). */
  driftMs?: number;
  /** Seed for partial phases and pick noise (default 1). */
  seed?: number;
}

/**
 * A plucked string by additive synthesis. `freq` is the first partial; with `inharmonicity` the
 * upper partials run progressively sharp, as on a real (stiff) string.
 */
export function pluckedString(opts: PluckOptions): Float32Array {
  const sr = opts.sampleRate;
  const lead = Math.round((opts.startTime ?? 0) * sr);
  const n = Math.round(opts.duration * sr);
  const rand = seededRandom(opts.seed ?? 1);
  const B = opts.inharmonicity ?? 0;
  const rolloff = opts.rolloff ?? 1;
  const pos = opts.pluckPosition ?? 0.18;
  const decay = opts.decay ?? 1.5;
  const tilt = opts.decayTilt ?? 0.02;
  const maxHz = Math.min(opts.maxPartialHz ?? 9000, sr * 0.45);
  const maxPartials = opts.partials ?? 30;
  const hpHz = opts.highpassHz ?? 0;
  const hpOrder = opts.highpassOrder ?? 2;
  const driftCents = opts.driftCents ?? 0;
  const driftTau = ((opts.driftMs ?? 45) / 1000) * sr;
  const attackTau = (((opts.attackMs ?? 1.5) / 1000) * sr) / 3; // reaches ~95 % after attackMs

  // Phase of the first partial; with drift the instantaneous frequency starts sharp and relaxes.
  let phase: Float64Array | null = null;
  if (driftCents !== 0) {
    phase = new Float64Array(n);
    let p = 0;
    for (let i = 0; i < n; i++) {
      phase[i] = p;
      const f = opts.freq * Math.pow(2, (driftCents * Math.exp(-i / driftTau)) / 1200);
      p += (2 * Math.PI * f) / sr;
    }
  }

  const acc = new Float64Array(n);
  for (let k = 1; k <= maxPartials; k++) {
    const ratio = (k * Math.sqrt(1 + B * k * k)) / Math.sqrt(1 + B);
    const f = opts.freq * ratio;
    if (f >= maxHz) break;
    let amp = Math.pow(k, -rolloff);
    if (pos > 0) amp *= Math.abs(Math.sin(Math.PI * k * pos));
    if (k === 1) amp *= opts.fundamentalGain ?? 1;
    if (hpHz > 0) amp *= 1 / Math.sqrt(1 + Math.pow(hpHz / f, 2 * hpOrder));
    const p0 = rand() * 2 * Math.PI;
    if (amp < 1e-7) continue;
    const dPerSample = Math.exp((-decay * (1 + tilt * (k * k - 1))) / sr);
    if (phase) {
      let env = amp;
      for (let i = 0; i < n; i++) {
        acc[i] += env * Math.sin(ratio * phase[i] + p0);
        env *= dPerSample;
      }
    } else {
      const w = (2 * Math.PI * f) / sr;
      // Decaying rotating phasor: folds the envelope into the rotation.
      let c = amp * Math.cos(p0);
      let s = amp * Math.sin(p0);
      const cw = Math.cos(w) * dPerSample;
      const sw = Math.sin(w) * dPerSample;
      for (let i = 0; i < n; i++) {
        acc[i] += s;
        const c2 = c * cw - s * sw;
        s = s * cw + c * sw;
        c = c2;
      }
    }
  }
  for (let i = 0; i < n; i++) acc[i] *= 1 - Math.exp(-i / attackTau);

  const peak = opts.amplitude ?? 0.5;
  const tone = normalisePeak(acc, peak);
  const out = new Float32Array(lead + n);
  out.set(tone, lead);

  const noiseLevel = opts.attackNoise ?? 0;
  if (noiseLevel > 0) {
    const tau = ((opts.attackNoiseMs ?? 8) / 1000) * sr;
    const len = Math.min(n, Math.ceil(tau * 7));
    let lp = 0;
    for (let i = 0; i < len; i++) {
      // Gentle low-pass: pick noise is broadband but not white.
      lp += 0.45 * (gaussian(rand) - lp);
      out[lead + i] += peak * noiseLevel * lp * Math.exp(-i / tau) * (1 - Math.exp(-i / (attackTau * 0.5 + 1)));
    }
  }
  return out;
}

/** Options for {@link strum}: every {@link PluckOptions} field except `freq`, plus the strum shape. */
export interface StrumOptions extends Omit<PluckOptions, 'freq'> {
  /** First-partial frequency of each string, in the order they are struck. */
  freqs: readonly number[];
  /** Time between successive strings in ms (default 12). */
  strumMs?: number;
  /** Relative level per string (default all 1). */
  levels?: readonly number[];
  /** Inharmonicity per string (default: `inharmonicity` for all). */
  inharmonicities?: readonly number[];
}

/** Several strings plucked one after another: a simple strummed chord. */
export function strum(opts: StrumOptions): Float32Array {
  const sr = opts.sampleRate;
  const gap = ((opts.strumMs ?? 12) / 1000) * sr;
  const lead = Math.round((opts.startTime ?? 0) * sr);
  const n = Math.round(opts.duration * sr);
  const acc = new Float64Array(lead + n);
  const peak = opts.amplitude ?? 0.5;
  opts.freqs.forEach((freq, i) => {
    const offset = Math.round(i * gap);
    if (offset >= n) return;
    const one = pluckedString({
      ...opts,
      freq,
      startTime: 0,
      duration: (n - offset) / sr,
      amplitude: opts.levels?.[i] ?? 1,
      inharmonicity: opts.inharmonicities?.[i] ?? opts.inharmonicity,
      seed: (opts.seed ?? 1) * 131 + i * 17,
    });
    for (let j = 0; j < one.length; j++) acc[lead + offset + j] += one[j];
  });
  return normalisePeak(acc, peak);
}

/** White Gaussian noise with the given RMS. */
export function whiteNoise(length: number, rms: number, seed: number = 7): Float32Array {
  const rand = seededRandom(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = gaussian(rand) * rms;
  return out;
}

/**
 * Add white noise at a signal-to-noise ratio in dB. The signal power is measured over
 * `[refStart, refEnd)` (default: the non-silent part), so a decaying pluck gets the stated SNR
 * where it is actually analysed.
 */
export function addNoise(
  x: Float32Array,
  snrDb: number,
  seed: number = 7,
  refStart?: number,
  refEnd?: number,
): Float32Array {
  let a = refStart ?? 0;
  const b = refEnd ?? x.length;
  if (refStart === undefined) while (a < b && x[a] === 0) a++;
  const noise = whiteNoise(x.length, rmsOf(x, a, b) * Math.pow(10, -snrDb / 20), seed);
  for (let i = 0; i < x.length; i++) noise[i] += x[i];
  return noise;
}

/** Options for {@link addHum}. */
export interface HumOptions {
  /** Mains frequency: 50 or 60 Hz (default 50). */
  freq?: number;
  /** RMS of the hum (linear, full scale = 1). */
  rms: number;
  /** Relative amplitudes of the mains harmonics, fundamental first (default [1, 0.6, 0.45, 0.2, 0.2]). */
  harmonics?: readonly number[];
}

/** Add mains hum (fundamental plus harmonics) at a given RMS. */
export function addHum(x: Float32Array, sampleRate: number, opts: HumOptions): Float32Array {
  const hum = harmonicTone({
    freq: opts.freq ?? 50,
    sampleRate,
    duration: x.length / sampleRate,
    amplitudes: opts.harmonics ?? [1, 0.6, 0.45, 0.2, 0.2],
    amplitude: 1,
    seed: 99,
  });
  const g = opts.rms / (rmsOf(hum) || 1);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] + (i < hum.length ? hum[i] * g : 0);
  return out;
}

/** Mix `source x gain` into a copy of `target`, starting at sample `offset`. */
export function mix(target: Float32Array, source: Float32Array, offset: number = 0, gain: number = 1): Float32Array {
  const out = new Float32Array(Math.max(target.length, offset + source.length));
  out.set(target);
  for (let i = 0; i < source.length; i++) out[offset + i] += source[i] * gain;
  return out;
}

/** Join signals end to end. */
export function concat(...parts: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** `seconds` of digital silence. */
export function silence(seconds: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.round(seconds * sampleRate));
}

/** Options for {@link encodeWav}. */
export interface WavOptions {
  /** 16 (PCM, the format Chromium's fake microphone needs), 24 (PCM) or 32 (IEEE float). Default 16. */
  bitDepth?: 16 | 24 | 32;
}

/** Encode mono samples, or one array per channel, as a RIFF/WAVE file. */
export function encodeWav(
  samples: Float32Array | readonly Float32Array[],
  sampleRate: number,
  opts: WavOptions = {},
): Uint8Array {
  const channels: readonly Float32Array[] = samples instanceof Float32Array ? [samples] : samples;
  const bitDepth = opts.bitDepth ?? 16;
  const frames = channels.reduce((m, c) => Math.max(m, c.length), 0);
  const bytesPer = bitDepth / 8;
  const blockAlign = bytesPer * channels.length;
  const dataBytes = frames * blockAlign;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const ascii = (at: number, text: string): void => {
    for (let i = 0; i < text.length; i++) v.setUint8(at + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, bitDepth === 32 ? 3 : 1, true);
  v.setUint16(22, channels.length, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitDepth, true);
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (const ch of channels) {
      const s = Math.max(-1, Math.min(1, i < ch.length ? ch[i] : 0));
      if (bitDepth === 32) {
        v.setFloat32(at, s, true);
      } else if (bitDepth === 16) {
        v.setInt16(at, Math.round(s * 32767), true);
      } else {
        const q = Math.round(s * 8388607);
        v.setUint8(at, q & 0xff);
        v.setUint8(at + 1, (q >> 8) & 0xff);
        v.setUint8(at + 2, (q >> 16) & 0xff);
      }
      at += bytesPer;
    }
  }
  return new Uint8Array(buf);
}

/** Decoded WAV audio. */
export interface WavData {
  sampleRate: number;
  /** One Float32Array per channel, samples in [-1, 1]. */
  channels: Float32Array[];
}

/** Decode a PCM 16/24-bit or 32-bit float RIFF/WAVE file (the formats {@link encodeWav} writes). */
export function decodeWav(bytes: Uint8Array): WavData {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number): string => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
  if (bytes.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  let at = 12;
  let format = 1;
  let channelCount = 1;
  let sampleRate = 44100;
  let bitDepth = 16;
  let dataAt = -1;
  let dataBytes = 0;
  while (at + 8 <= bytes.byteLength) {
    const id = tag(at);
    const size = v.getUint32(at + 4, true);
    if (id === 'fmt ') {
      format = v.getUint16(at + 8, true);
      channelCount = v.getUint16(at + 10, true);
      sampleRate = v.getUint32(at + 12, true);
      bitDepth = v.getUint16(at + 22, true);
    } else if (id === 'data') {
      dataAt = at + 8;
      dataBytes = Math.min(size, bytes.byteLength - dataAt);
      break;
    }
    at += 8 + size + (size & 1);
  }
  if (dataAt < 0) throw new Error('WAV file has no data chunk');
  const bytesPer = bitDepth / 8;
  const frames = Math.floor(dataBytes / (bytesPer * channelCount));
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frames));
  let p = dataAt;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channelCount; c++) {
      let s: number;
      if (format === 3 && bitDepth === 32) s = v.getFloat32(p, true);
      else if (bitDepth === 16) s = v.getInt16(p, true) / 32767;
      else if (bitDepth === 24) s = ((v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16)) as number) / 8388607;
      else throw new Error(`Unsupported WAV format ${format}/${bitDepth}`);
      channels[c][i] = s;
      p += bytesPer;
    }
  }
  return { sampleRate, channels };
}
