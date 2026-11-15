/**
 * Instrument definitions for the string model: how each guitar (and bass) is plucked, how long it
 * rings, and the "bus" every one of its notes passes through (acoustic body, pickup, amp, cabinet).
 *
 * The bus is linear for the acoustic and clean tones and contains one static waveshaper for the
 * driven tone, so it is applied once to the sum of all notes of that instrument. That is cheaper
 * than filtering each note, and for the driven tone it is the only way to get the intermodulation
 * that makes a power chord sound like a power chord.
 */
import type { BiquadSpec } from './dsp';

/** The six tones a caller can ask for. `muted` and `harmonic` are articulations of the base tone. */
export type GuitarTone = 'steel' | 'nylon' | 'clean' | 'driven' | 'muted' | 'harmonic';
/** Bass voices used by the backing band. */
export type BassTone = 'bass-finger' | 'bass-pick' | 'bass-upright';
/** A physical instrument the string model can render. */
export type StringInstrument = 'steel' | 'nylon' | 'clean' | 'driven' | BassTone;
/** How the note is played on that instrument. */
export type Articulation = 'normal' | 'palm-mute' | 'dead' | 'harmonic';

/** Static soft-clipping stage between the `pre` and `post` filters of a bus. */
export interface DriveSpec {
  /** Gain into the clipper; larger = more distortion and sustain. */
  gain: number;
  /** Negative half-wave ceiling relative to the positive one (1 = symmetric). Adds even harmonics. */
  asymmetry: number;
}

/** The shared signal chain of one instrument. */
export interface FxChain {
  pre: BiquadSpec[];
  drive?: DriveSpec;
  post: BiquadSpec[];
  /** Output trim after the chain. */
  level: number;
}

/** Physical description of an instrument for the string model. */
export interface InstrumentDef {
  id: StringInstrument;
  /** Sounding MIDI pitch of the open strings, low to high (used to infer string and fret). */
  openStrings: number[];
  /** Index (from low) of the first plain (unwound) string; strings below it are wound. */
  firstPlain: number;
  /** Pluck point on the open string as a fraction of its length from the bridge. */
  pickPosition: number;
  /** Magnetic pickup position (fraction from the bridge); omitted for acoustic instruments. */
  pickupPosition?: number;
  /** Harmonic roll-off exponent of the pluck: amplitude ~ 1 / k^slope. */
  slope: number;
  /** Cut-off of the pluck's low-pass at velocity 0 and at velocity 1, in Hz. */
  brightness: [number, number];
  /** Order of that low-pass (1 = 6 dB/oct). */
  brightnessOrder: number;
  /** Level of the pick/nail noise at the attack, relative to the note. */
  pickNoise: number;
  /** Centre frequency of the pick noise. */
  pickNoiseHz: number;
  /** T60 of the fundamental for an open string sounding E2 (MIDI 40), in seconds. */
  sustain: number;
  /** The sustain halves every this many semitones of pitch. */
  sustainHalving: number;
  /** T60 at 4 kHz for wound and for plain strings, in seconds. */
  highSustain: [number, number];
  /**
   * Two-stage decay: [level, ratio]. A real string vibrates in two planes; the one that drives
   * the soundboard hardest is loudest and dies first, which gives a pluck its percussive front.
   * `level` is the strength of that fast part relative to the slow one, `ratio` its decay time as
   * a fraction of `sustain`. A solid-body electric has little of it.
   */
  twoStage: [number, number];
  /** Longest buffer worth rendering, in seconds. */
  maxSeconds: number;
  /** Seconds of release when a note is stopped (finger lifts / hand damps). */
  release: number;
  fx: FxChain;
}

const STANDARD = [40, 45, 50, 55, 59, 64];

/** All instruments the string model knows. */
export const INSTRUMENTS: Record<StringInstrument, InstrumentDef> = {
  steel: {
    id: 'steel',
    openStrings: STANDARD,
    firstPlain: 4,
    pickPosition: 0.17,
    slope: 1,
    brightness: [1700, 8000],
    brightnessOrder: 1.2,
    pickNoise: 0.2,
    pickNoiseHz: 3200,
    sustain: 8.5,
    sustainHalving: 20,
    highSustain: [0.5, 0.85],
    twoStage: [1.25, 0.2],
    maxSeconds: 4.6,
    release: 0.045,
    fx: {
      pre: [
        { type: 'highpass', freq: 80, q: 0.8 },
        // A guitar top radiates bass poorly: below ~300 Hz the response falls away, except at the
        // two big body resonances, which is why low notes are heard mostly through their overtones.
        { type: 'lowshelf', freq: 320, gain: -8 },
        { type: 'peaking', freq: 102, q: 3.5, gain: 9 }, // air (Helmholtz) resonance
        { type: 'peaking', freq: 196, q: 5, gain: 8 }, // main top-plate resonance
        { type: 'peaking', freq: 285, q: 5, gain: 3 },
        { type: 'peaking', freq: 400, q: 5, gain: 4 },
        { type: 'peaking', freq: 560, q: 4, gain: 2.5 },
        { type: 'peaking', freq: 1100, q: 1, gain: -1.5 },
        { type: 'peaking', freq: 3000, q: 0.9, gain: 3 },
        { type: 'lowpass', freq: 9000, q: 0.7 },
      ],
      post: [],
      level: 1,
    },
  },
  nylon: {
    id: 'nylon',
    openStrings: STANDARD,
    firstPlain: 3,
    pickPosition: 0.22,
    slope: 1.1,
    brightness: [1100, 3800],
    brightnessOrder: 1.5,
    pickNoise: 0.09,
    pickNoiseHz: 1500,
    sustain: 6,
    sustainHalving: 18,
    highSustain: [0.32, 0.2],
    twoStage: [1.4, 0.2],
    maxSeconds: 3.8,
    release: 0.05,
    fx: {
      pre: [
        { type: 'highpass', freq: 76, q: 0.8 },
        { type: 'lowshelf', freq: 300, gain: -7 },
        { type: 'peaking', freq: 98, q: 3.5, gain: 9 },
        { type: 'peaking', freq: 206, q: 5, gain: 8 },
        { type: 'peaking', freq: 300, q: 5, gain: 3 },
        { type: 'peaking', freq: 430, q: 4, gain: 4 },
        { type: 'peaking', freq: 640, q: 3.5, gain: 2 },
        { type: 'peaking', freq: 1500, q: 0.8, gain: -1.5 },
        { type: 'lowpass', freq: 5600, q: 0.7 },
      ],
      post: [],
      level: 1.05,
    },
  },
  clean: {
    id: 'clean',
    openStrings: STANDARD,
    firstPlain: 3,
    pickPosition: 0.14,
    pickupPosition: 0.17,
    slope: 1,
    brightness: [1800, 6000],
    brightnessOrder: 1,
    pickNoise: 0.05,
    pickNoiseHz: 2500,
    sustain: 12,
    sustainHalving: 24,
    highSustain: [0.8, 1.1],
    twoStage: [0.45, 0.25],
    maxSeconds: 5,
    release: 0.035,
    fx: {
      pre: [
        { type: 'highpass', freq: 75, q: 0.7 },
        { type: 'lowpass', freq: 4300, q: 1.7 }, // pickup + cable resonance
        { type: 'peaking', freq: 520, q: 0.7, gain: -5 }, // the mid scoop of a clean amp's tone stack
        { type: 'highshelf', freq: 2200, gain: 3 },
        { type: 'lowpass', freq: 5800, q: 0.8 }, // speaker
      ],
      post: [],
      level: 0.9,
    },
  },
  driven: {
    id: 'driven',
    openStrings: STANDARD,
    firstPlain: 3,
    pickPosition: 0.12,
    pickupPosition: 0.07,
    slope: 1,
    brightness: [2200, 6000],
    brightnessOrder: 1,
    pickNoise: 0.05,
    pickNoiseHz: 2500,
    sustain: 12,
    sustainHalving: 24,
    highSustain: [0.8, 1.1],
    twoStage: [0.3, 0.25],
    maxSeconds: 5,
    release: 0.03,
    fx: {
      pre: [
        { type: 'highpass', freq: 130, q: 0.7 }, // tighten the lows before clipping
        { type: 'lowpass', freq: 4800, q: 1.3 },
        { type: 'peaking', freq: 850, q: 0.8, gain: 6 }, // mid hump
      ],
      drive: { gain: 9, asymmetry: 0.9 },
      post: [
        { type: 'highpass', freq: 85, q: 0.7 },
        { type: 'peaking', freq: 125, q: 1.1, gain: 3.5 }, // cabinet thump
        { type: 'peaking', freq: 420, q: 1.2, gain: -2 },
        { type: 'peaking', freq: 2300, q: 1.5, gain: 4 },
        { type: 'lowpass', freq: 4700, q: 0.9 },
        { type: 'lowpass', freq: 6000, q: 0.7 },
      ],
      level: 0.2,
    },
  },
  'bass-finger': {
    id: 'bass-finger',
    openStrings: [28, 33, 38, 43],
    firstPlain: 4,
    pickPosition: 0.2,
    pickupPosition: 0.16,
    slope: 1.15,
    brightness: [700, 2200],
    brightnessOrder: 1.5,
    pickNoise: 0.04,
    pickNoiseHz: 900,
    sustain: 5,
    sustainHalving: 24,
    highSustain: [0.3, 0.3],
    twoStage: [0.6, 0.25],
    maxSeconds: 3.5,
    release: 0.05,
    fx: {
      pre: [
        { type: 'highpass', freq: 32, q: 0.7 },
        { type: 'peaking', freq: 85, q: 0.9, gain: 2 },
        { type: 'peaking', freq: 750, q: 0.9, gain: 2.5 }, // growl that survives small speakers
        { type: 'lowpass', freq: 3200, q: 0.7 },
      ],
      post: [],
      level: 1.15,
    },
  },
  'bass-pick': {
    id: 'bass-pick',
    openStrings: [28, 33, 38, 43],
    firstPlain: 4,
    pickPosition: 0.13,
    pickupPosition: 0.12,
    slope: 1,
    brightness: [1400, 3800],
    brightnessOrder: 1.2,
    pickNoise: 0.1,
    pickNoiseHz: 1800,
    sustain: 5,
    sustainHalving: 24,
    highSustain: [0.45, 0.45],
    twoStage: [0.6, 0.25],
    maxSeconds: 3.5,
    release: 0.04,
    fx: {
      pre: [
        { type: 'highpass', freq: 34, q: 0.7 },
        { type: 'peaking', freq: 95, q: 0.9, gain: 2 },
        { type: 'peaking', freq: 1100, q: 0.9, gain: 3 },
        { type: 'lowpass', freq: 4500, q: 0.7 },
      ],
      post: [],
      level: 1.05,
    },
  },
  'bass-upright': {
    id: 'bass-upright',
    openStrings: [28, 33, 38, 43],
    firstPlain: 4,
    pickPosition: 0.28,
    slope: 1.25,
    brightness: [500, 1500],
    brightnessOrder: 1.5,
    pickNoise: 0.1,
    pickNoiseHz: 600,
    sustain: 1.9,
    sustainHalving: 30,
    highSustain: [0.14, 0.14],
    twoStage: [0.8, 0.3],
    maxSeconds: 2.2,
    release: 0.06,
    fx: {
      pre: [
        { type: 'highpass', freq: 34, q: 0.7 },
        { type: 'peaking', freq: 110, q: 1.5, gain: 3.5 }, // body
        { type: 'peaking', freq: 230, q: 2, gain: 2 },
        { type: 'peaking', freq: 800, q: 1, gain: 2 },
        { type: 'lowpass', freq: 2600, q: 0.7 },
      ],
      post: [],
      level: 1.25,
    },
  },
};

/** The tone names accepted by the synth (the six guitar tones plus the bass voices). */
export type ToneName = GuitarTone | BassTone;

/** A tone name resolved to an instrument and a way of playing it. */
export interface ResolvedTone {
  instrument: StringInstrument;
  articulation: Articulation;
}

/**
 * `muted` and `harmonic` are not separate guitars: they are the base guitar played differently.
 * An explicit `articulation` wins over the one implied by the tone name.
 */
export function resolveTone(tone: ToneName = 'steel', articulation?: Articulation, base: StringInstrument = 'steel'): ResolvedTone {
  if (tone === 'muted') return { instrument: base, articulation: articulation ?? 'palm-mute' };
  if (tone === 'harmonic') return { instrument: base, articulation: articulation ?? 'harmonic' };
  return { instrument: tone, articulation: articulation ?? 'normal' };
}

/** Where a pitch sits on an instrument's neck. */
export interface NeckPosition {
  /** Index into `openStrings` (0 = lowest string). */
  stringIndex: number;
  fret: number;
  wound: boolean;
}

/**
 * Locate a pitch on the neck. With a guitarist's string number (1 = highest) the fret follows;
 * without one the lowest position is assumed, which is how a pitch is most often played.
 */
export function locateOnNeck(def: InstrumentDef, midi: number, string?: number): NeckPosition {
  const n = def.openStrings.length;
  let idx = -1;
  if (string !== undefined && string >= 1 && string <= n) {
    idx = n - Math.round(string);
  } else {
    for (let i = n - 1; i >= 0; i--) {
      if (def.openStrings[i] <= midi + 0.5) {
        idx = i;
        break;
      }
    }
    if (idx < 0) idx = 0;
  }
  const fret = Math.max(0, midi - def.openStrings[idx]);
  return { stringIndex: idx, fret, wound: idx < def.firstPlain };
}

/** Amplitude for a playing velocity 0..1: quiet notes are much quieter, like a real pick attack. */
export function velocityGain(velocity: number): number {
  const v = velocity < 0 ? 0 : velocity > 1 ? 1 : velocity;
  return 0.06 + 0.94 * Math.pow(v, 1.6);
}

/** The static waveshaper of a drive stage: slope 1 at the origin, saturating to +1 / -asymmetry. */
export function driveShape(x: number, asymmetry: number): number {
  return x >= 0 ? Math.tanh(x) : asymmetry * Math.tanh(x / asymmetry);
}

/** Input range covered by the live WaveShaper curve (it clamps beyond this, where tanh is flat). */
export const DRIVE_CURVE_RANGE = 6;

/** Sampled drive curve for a WaveShaperNode, covering inputs -DRIVE_CURVE_RANGE..+DRIVE_CURVE_RANGE. */
export function driveCurve(asymmetry: number, points = 4097): Float32Array {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = ((i / (points - 1)) * 2 - 1) * DRIVE_CURVE_RANGE;
    curve[i] = driveShape(x, asymmetry);
  }
  return curve;
}
