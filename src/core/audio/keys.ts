/**
 * Pitched reference voices: a pure sine, a clean "reference" tone that stays audible on small
 * speakers, a soft electric piano and an organ (ear training, tuning reference notes, the backing
 * band's comping), plus the drone used for scale practice.
 *
 * The numbers that define each voice live here and are used twice: by `renderTone`/`renderDrone`
 * (pure, for tests and offline rendering) and by the live engine, which builds the same voices
 * from oscillators so sustained notes can last as long as the learner needs.
 */
import { midiToFreq } from '@/core/math/pitch-math';
import { TWO_PI, clamp, sanitize } from './dsp';

/** Voices of the tone generator. */
export type ToneVoice = 'sine' | 'reference' | 'epiano' | 'organ';

/** All tone voices. */
export const TONE_VOICES: readonly ToneVoice[] = ['sine', 'reference', 'epiano', 'organ'];

/** Harmonic amplitudes (fundamental first) of the additive voices. */
export const VOICE_PARTIALS: Record<'sine' | 'reference' | 'organ', readonly number[]> = {
  sine: [1],
  // A little 2nd-5th harmonic so an 82 Hz reference note is still heard on a phone speaker.
  reference: [1, 0.36, 0.2, 0.1, 0.05],
  // Mellow drawbar registration: 8', 4', 2 2/3', 2', then a whisper of upper drawbars.
  organ: [1, 0.68, 0.42, 0.3, 0, 0.12, 0, 0.07],
};

/** Attack and release times in seconds of each voice. */
export const VOICE_ENVELOPE: Record<ToneVoice, { attack: number; release: number }> = {
  sine: { attack: 0.012, release: 0.07 },
  reference: { attack: 0.015, release: 0.08 },
  epiano: { attack: 0.002, release: 0.07 },
  organ: { attack: 0.006, release: 0.04 },
};

/**
 * Loudness trim by pitch: low notes need more level to be heard as equally loud, very high notes
 * less. Gentle on purpose.
 */
export function pitchLoudnessTrim(freq: number): number {
  return clamp(Math.pow(220 / freq, 0.3), 0.6, 1.6);
}

/** Parameters of the two-operator-pair FM electric piano for one note. */
export interface EPianoParams {
  /** Body pair: modulator at the carrier frequency. Index decays from `bodyIndex` to `bodySustain`. */
  bodyIndex: number;
  bodySustain: number;
  bodyIndexTau: number;
  /** Tine pair: a high modulator ratio gives the bell-like "ting" at the attack. 0 = no tine. */
  tineRatio: number;
  tineIndex: number;
  tineIndexTau: number;
  tineGain: number;
  tineTau: number;
  /** Time constant of the overall amplitude decay in seconds. */
  ampTau: number;
  /** Output gain. */
  gain: number;
}

/** FM settings for a note: harder playing barks more, high notes are purer and shorter. */
export function epianoParams(freq: number, velocity: number, sampleRate: number): EPianoParams {
  const v = clamp(velocity, 0, 1);
  const octavesAboveC4 = Math.log2(freq / 261.63);
  const tineOk = freq * 14 < sampleRate * 0.4;
  return {
    bodyIndex: (0.5 + 1.5 * Math.pow(v, 1.4)) * clamp(1 - 0.18 * octavesAboveC4, 0.35, 1.3),
    bodySustain: 0.22,
    bodyIndexTau: 0.28,
    tineRatio: tineOk ? 14 : 0,
    tineIndex: 0.25 + 0.7 * v,
    tineIndexTau: 0.07,
    tineGain: 0.3,
    tineTau: 0.45,
    ampTau: clamp(2.4 * Math.pow(2, -octavesAboveC4 / 2.5), 0.5, 4),
    gain: (0.25 + 0.75 * v) * pitchLoudnessTrim(freq) * 0.5,
  };
}

/** A note for {@link renderTone}. */
export interface ToneSpec {
  sampleRate: number;
  /** MIDI note (fractional allowed) or an explicit frequency. */
  midi?: number;
  freq?: number;
  /** Seconds the note is held before its release (default 1). */
  seconds?: number;
  /** 0..1 (default 0.7). */
  velocity?: number;
  voice?: ToneVoice;
  /** Reference pitch of A4 (default 440). */
  a4?: number;
  /** Detune in cents. */
  cents?: number;
}

/** Frequency a tone spec asks for. */
export function toneFrequency(spec: Pick<ToneSpec, 'midi' | 'freq' | 'a4' | 'cents'>): number {
  const base = spec.freq ?? midiToFreq(spec.midi ?? 69, spec.a4 ?? 440);
  return base * Math.pow(2, (spec.cents ?? 0) / 1200);
}

/** Render one note of a tone voice, release included. Exactly harmonic, so exactly in tune. */
export function renderTone(spec: ToneSpec): Float32Array {
  const fs = spec.sampleRate;
  const voice = spec.voice ?? 'reference';
  const freq = toneFrequency(spec);
  const velocity = clamp(spec.velocity ?? 0.7, 0, 1);
  const held = Math.max(0.01, spec.seconds ?? 1);
  const env = VOICE_ENVELOPE[voice];
  const relTau = env.release / 3;
  const len = Math.round((held + env.release * 2.5) * fs);
  const out = new Float32Array(len);
  const w = (TWO_PI * freq) / fs;
  const heldSamples = held * fs;
  const gate = (i: number): number => {
    const t = i / fs;
    const a = t < env.attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / env.attack) : 1;
    return i <= heldSamples ? a : a * Math.exp(-(i - heldSamples) / (relTau * fs));
  };
  if (voice === 'epiano') {
    const p = epianoParams(freq, velocity, fs);
    for (let i = 0; i < len; i++) {
      const t = i / fs;
      const bodyI = p.bodySustain + (p.bodyIndex - p.bodySustain) * Math.exp(-t / p.bodyIndexTau);
      const body = Math.sin(w * i + bodyI * Math.sin(w * i));
      let tine = 0;
      if (p.tineRatio > 0) {
        const tineI = p.tineIndex * Math.exp(-t / p.tineIndexTau);
        tine = Math.sin(w * i + tineI * Math.sin(w * p.tineRatio * i)) * p.tineGain * Math.exp(-t / p.tineTau);
      }
      out[i] = (body + tine) * Math.exp(-t / p.ampTau) * p.gain * gate(i);
    }
  } else {
    const partials = VOICE_PARTIALS[voice];
    let norm = 0;
    for (const a of partials) norm += a;
    const gain = ((0.2 + 0.8 * velocity) * pitchLoudnessTrim(freq) * 0.42) / norm;
    for (let k = 1; k <= partials.length; k++) {
      const a = partials[k - 1];
      if (a === 0 || freq * k > fs * 0.45) continue;
      for (let i = 0; i < len; i++) out[i] += Math.sin(w * k * i) * a;
    }
    for (let i = 0; i < len; i++) out[i] *= gain * gate(i);
  }
  sanitize(out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Drone
// ---------------------------------------------------------------------------------------------

/** What the drone plays. */
export interface DroneOptions {
  /** Root as a MIDI note (default A2 = 45). Any octave; it is folded into a comfortable register. */
  root?: number;
  /** Add the perfect fifth above the root. */
  fifth?: boolean;
  /** Add a quiet octave above the root for clarity on small speakers (default true). */
  octave?: boolean;
  /** Reference pitch of A4. */
  a4?: number;
}

/** One sustained oscillator of the drone. */
export interface DroneLayer {
  freq: number;
  gain: number;
  /** Rate in Hz of this layer's slow swell, so the drone breathes instead of buzzing. */
  swellHz: number;
}

/** Harmonic amplitudes of every drone oscillator: warm, with enough overtones to tune against. */
export const DRONE_PARTIALS: readonly number[] = [1, 0.55, 0.38, 0.24, 0.17, 0.11, 0.07, 0.05];

/** Low-pass that takes the edge off the drone. */
export const DRONE_LOWPASS_HZ = 1600;

/**
 * The oscillators that make up a drone. Each pitch is a pair detuned symmetrically by a fraction of
 * a cent, so the average stays exactly on pitch while the sound slowly moves.
 */
export function droneLayers(opts: DroneOptions = {}): DroneLayer[] {
  let root = opts.root ?? 45;
  while (root < 36) root += 12;
  while (root > 52) root -= 12;
  const a4 = opts.a4 ?? 440;
  const layers: DroneLayer[] = [];
  const add = (midi: number, gain: number, spread: number, swell: number) => {
    const f = midiToFreq(midi, a4);
    const ratio = Math.pow(2, spread / 1200);
    layers.push({ freq: f * ratio, gain: gain / 2, swellHz: swell });
    layers.push({ freq: f / ratio, gain: gain / 2, swellHz: swell * 1.31 });
  };
  add(root, 1, 0.9, 0.11);
  if (opts.fifth) add(root + 7, 0.5, 0.7, 0.083);
  if (opts.octave ?? true) add(root + 12, 0.28, 0.6, 0.067);
  return layers;
}

/** Offline rendering of the drone (the live engine uses oscillators with the same layers). */
export function renderDrone(opts: DroneOptions & { sampleRate: number; seconds: number }): Float32Array {
  const fs = opts.sampleRate;
  const len = Math.round(opts.seconds * fs);
  const out = new Float32Array(len);
  const layers = droneLayers(opts);
  let norm = 0;
  for (const a of DRONE_PARTIALS) norm += a;
  for (const layer of layers) {
    for (let k = 1; k <= DRONE_PARTIALS.length; k++) {
      const f = layer.freq * k;
      if (f > fs * 0.45) break;
      // The same one-pole response the live low-pass approximates.
      const a = (DRONE_PARTIALS[k - 1] / norm) * layer.gain / Math.sqrt(1 + (f / DRONE_LOWPASS_HZ) ** 2);
      const w = (TWO_PI * f) / fs;
      const ws = (TWO_PI * layer.swellHz) / fs;
      for (let i = 0; i < len; i++) out[i] += Math.sin(w * i) * a * (0.85 + 0.15 * Math.sin(ws * i + k));
    }
  }
  const fade = Math.min(len >> 1, Math.round(0.4 * fs));
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    out[i] *= g;
    out[len - 1 - i] *= g;
  }
  for (let i = 0; i < len; i++) out[i] *= 0.5;
  sanitize(out);
  return out;
}
