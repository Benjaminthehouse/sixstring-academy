/**
 * The non-guitar voices on the live engine: drum kit, metronome clicks, interface sounds, the tone
 * generator (reference tone, electric piano, organ) and the drone.
 *
 * Percussive sounds are rendered once by the pure DSP modules and replayed from the buffer cache.
 * Sustained voices are built from oscillators so a note can last as long as it is needed.
 * Every function takes the audio-clock time at which the sound should be heard (default: now) and,
 * last, an optional engine (default: the shared live engine).
 */
import { clamp } from './dsp';
import { AudioEngine, getEngine, onAudioClosed, pannedInput, type BusName } from './engine';
import { DRONE_LOWPASS_HZ, DRONE_PARTIALS, VOICE_ENVELOPE, VOICE_PARTIALS, droneLayers, epianoParams, pitchLoudnessTrim, toneFrequency, type DroneOptions, type ToneVoice } from './keys';
import { DRUM_NAMES, DRUM_VARIANTS, HIHAT_CHOKERS, renderClick, renderDrum, type ClickLevel, type ClickSet, type DrumName } from './percussion';
import { renderUiSound, type UiSound } from './ui-sounds';

interface Shot {
  src: AudioBufferSourceNode;
  gain: GainNode;
  start: number;
}

function fire(engine: AudioEngine, buffer: AudioBuffer, dest: BusName | AudioNode, when: number | undefined, gain: number): Shot {
  const ctx = engine.ctx;
  const start = Math.max(when ?? engine.now(), engine.now());
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(typeof dest === 'string' ? engine.bus(dest) : dest);
  src.start(engine.nodeTime(start));
  engine.guard(() => {
    g.disconnect();
    src.stop();
  });
  engine.touch(start + buffer.duration + 1);
  return { src, gain: g, start };
}

async function breathe(since: number): Promise<number> {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - since <= 8) return since;
  await new Promise<void>((r) => setTimeout(r, 0));
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

// ---------------------------------------------------------------------------------------------
// Drums
// ---------------------------------------------------------------------------------------------

/** Loudness of a drum hit for a velocity 0..1. */
export function drumGain(velocity: number): number {
  return 0.12 + 0.88 * Math.pow(clamp(velocity, 0, 1), 1.4);
}

/** Where each drum sits across the kit, as the audience hears it (-1 left .. +1 right). */
const DRUM_PAN: Partial<Record<DrumName, number>> = {
  hihatClosed: 0.28, hihatOpen: 0.28, hihatPedal: 0.28, ride: -0.32, rideBell: -0.32, crash: -0.2,
  tomHigh: -0.25, tomLow: 0.3, shaker: 0.35, tambourine: -0.35, cowbell: 0.2, clap: 0.1,
};

/** The synthesised drum kit on an engine. */
export class DrumKit {
  private readonly fixedEngine: AudioEngine | undefined;
  private readonly places = new Map<DrumName, AudioNode>();
  private readonly active = new Set<Shot>();
  private readonly openHats = new Set<Shot>();
  private readonly turn = new Map<DrumName, number>();

  constructor(engine?: AudioEngine) {
    this.fixedEngine = engine;
  }

  private get engine(): AudioEngine {
    return this.fixedEngine ?? getEngine();
  }

  private buffer(name: DrumName, variant: number): AudioBuffer {
    const engine = this.engine;
    return engine.buffers.get(`drum:${name}:${variant}`, () => renderDrum(name, engine.sampleRate, variant));
  }

  private place(name: DrumName): AudioNode {
    let node = this.places.get(name);
    if (!node) {
      const engine = this.engine;
      node = pannedInput(engine.ctx, engine.bus('drums'), DRUM_PAN[name] ?? 0);
      this.places.set(name, node);
    }
    return node;
  }

  /** Hit a drum at audio time `when` (default now) with velocity 0..1; `gain` scales the result. */
  play(name: DrumName, when?: number, velocity = 0.8, gain = 1): void {
    const engine = this.engine;
    const variants = DRUM_VARIANTS[name] ?? 1;
    const n = this.turn.get(name) ?? 0;
    this.turn.set(name, n + 1);
    const shot = fire(engine, this.buffer(name, n % variants), this.place(name), when, drumGain(velocity) * gain);
    this.active.add(shot);
    if (HIHAT_CHOKERS.includes(name)) {
      // Closing the hi-hat silences an open one, as the pedal does.
      for (const open of this.openHats) {
        if (open.start >= shot.start) continue;
        const t = engine.nodeTime(shot.start);
        open.gain.gain.setTargetAtTime(0, t, 0.006);
        try {
          open.src.stop(t + 0.06);
        } catch {
          // already ended
        }
      }
    }
    if (name === 'hihatOpen') this.openHats.add(shot);
    shot.src.onended = () => {
      this.active.delete(shot);
      this.openHats.delete(shot);
      try {
        shot.gain.disconnect();
      } catch {
        // ignore
      }
    };
  }

  /** Render every drum now so the first bar has no hitch. */
  async preload(names: readonly DrumName[] = DRUM_NAMES): Promise<void> {
    let t = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const name of names) {
      for (let v = 0; v < (DRUM_VARIANTS[name] ?? 1); v++) {
        this.buffer(name, v);
        t = await breathe(t);
      }
    }
  }

  /** Cut everything that is sounding or scheduled (used when the transport pauses). */
  stopAll(when?: number): void {
    const engine = this.engine;
    const t = engine.nodeTime(Math.max(when ?? engine.now(), engine.now()));
    for (const s of this.active) {
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setTargetAtTime(0, t, 0.01);
      try {
        s.src.stop(t + 0.08);
      } catch {
        // ignore
      }
    }
  }
}

let sharedKit: DrumKit | null = null;

/** The shared drum kit on the live engine. */
export function getDrums(): DrumKit {
  return (sharedKit ??= new DrumKit());
}

/** Hit a drum on the shared kit. */
export function playDrum(name: DrumName, when?: number, velocity?: number): void {
  getDrums().play(name, when, velocity);
}

// ---------------------------------------------------------------------------------------------
// Clicks and interface sounds
// ---------------------------------------------------------------------------------------------

/** Play one metronome click at audio time `when` (default now). */
export function playClick(set: ClickSet, level: ClickLevel, when?: number, gain = 1, engine: AudioEngine = getEngine()): void {
  const buffer = engine.buffers.get(`click:${set}:${level}`, () => renderClick(set, level, engine.sampleRate));
  const shot = fire(engine, buffer, 'click', when, gain);
  shot.src.onended = () => shot.gain.disconnect();
}

/** Render a click set ahead of time. */
export function preloadClicks(set: ClickSet, engine: AudioEngine = getEngine()): void {
  for (const level of ['accent', 'medium', 'beat', 'sub'] as const) {
    engine.buffers.get(`click:${set}:${level}`, () => renderClick(set, level, engine.sampleRate));
  }
}

/** Options for {@link playUi}. */
export interface UiSoundOptions {
  /** 0..1 volume for this sound (default 1). */
  volume?: number;
  /** Pitch step for `combo` (0, 1, 2 ... climbs a pentatonic scale). */
  step?: number;
  /** Audio-clock time (default now). */
  when?: number;
}

/**
 * Play an interface sound. Never throws, so UI code can call it unconditionally: without audio it
 * does nothing, and a sound requested before the first user gesture is dropped rather than played
 * late.
 */
export function playUi(name: UiSound, opts: UiSoundOptions = {}, engine?: AudioEngine): void {
  try {
    const e = engine ?? getEngine();
    const step = name === 'combo' ? Math.max(0, Math.floor(opts.step ?? 0)) : 0;
    const buffer = e.buffers.get(`ui:${name}:${step}`, () => renderUiSound(name, e.sampleRate, step));
    const shot = fire(e, buffer, 'ui', opts.when, clamp(opts.volume ?? 1, 0, 1.5));
    shot.src.onended = () => shot.gain.disconnect();
  } catch {
    // Feedback sounds are never worth an error.
  }
}

// ---------------------------------------------------------------------------------------------
// Tone generator
// ---------------------------------------------------------------------------------------------

/** Options for {@link playTone}. */
export interface ToneOptions {
  voice?: ToneVoice;
  /** Seconds the note is held. Omitted: it sounds until `stop()` (the electric piano fades by itself). */
  duration?: number;
  /** 0..1 (default 0.7). */
  velocity?: number;
  /** Detune in cents. */
  cents?: number;
  /** Reference pitch of A4 (default 440). */
  a4?: number;
  /** Extra linear gain (default 1). */
  gain?: number;
  /** Mixer bus (default `tone`; the backing band uses `keys`). */
  bus?: BusName;
}

/** A sounding tone. */
export interface ToneHandle {
  readonly startTime: number;
  /** Frequency in Hz. */
  readonly freq: number;
  /** Release the note at audio time `when` (default now). */
  stop(when?: number): void;
}

const waves = new WeakMap<AudioEngine, Map<string, PeriodicWave>>();

function periodicWave(engine: AudioEngine, name: string, partials: readonly number[]): PeriodicWave {
  let map = waves.get(engine);
  if (!map) waves.set(engine, (map = new Map()));
  let wave = map.get(name);
  if (!wave) {
    let norm = 0;
    for (const a of partials) norm += a;
    const real = new Float32Array(partials.length + 1);
    const imag = new Float32Array(partials.length + 1);
    partials.forEach((a, i) => (imag[i + 1] = a / norm));
    wave = engine.ctx.createPeriodicWave(real, imag, { disableNormalization: true });
    map.set(name, wave);
  }
  return wave;
}

const cosines = new WeakMap<AudioEngine, PeriodicWave>();

function cosineWave(engine: AudioEngine): PeriodicWave {
  let wave = cosines.get(engine);
  if (!wave) {
    wave = engine.ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]), { disableNormalization: true });
    cosines.set(engine, wave);
  }
  return wave;
}

function holdParam(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
  else param.cancelScheduledValues(time);
}

/**
 * Play a pitched tone: a MIDI note (fractions allowed) or `{ freq }` in Hz, at audio time `when`.
 * `reference` is the tuner's reference note, `epiano` and `organ` are for ear training and comping.
 */
export function playTone(note: number | { freq: number }, when?: number, opts: ToneOptions = {}, engine: AudioEngine = getEngine()): ToneHandle {
  const ctx = engine.ctx;
  const voice = opts.voice ?? 'reference';
  const freq = toneFrequency(typeof note === 'number' ? { midi: note, a4: opts.a4, cents: opts.cents } : { freq: note.freq, cents: opts.cents });
  const velocity = clamp(opts.velocity ?? 0.7, 0, 1);
  const start = Math.max(when ?? engine.now(), engine.now());
  const t0 = engine.nodeTime(start);
  const env = VOICE_ENVELOPE[voice];
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.connect(engine.bus(opts.bus ?? 'tone'));
  const oscillators: OscillatorNode[] = [];
  let autoEnd = Infinity;

  if (voice === 'epiano') {
    const p = epianoParams(freq, velocity, engine.sampleRate);
    const pair = (ratio: number, index: number, indexFloor: number, indexTau: number): OscillatorNode => {
      const carrier = ctx.createOscillator();
      carrier.frequency.value = freq;
      const mod = ctx.createOscillator();
      // A cosine modulator: integrating it gives a sine phase deviation with no offset, so the
      // carrier's phase does not drift while the index decays (the note stays exactly on pitch).
      mod.setPeriodicWave(cosineWave(engine));
      mod.frequency.value = freq * ratio;
      const depth = ctx.createGain();
      // Frequency deviation in Hz = modulation index * modulator frequency.
      depth.gain.setValueAtTime(index * freq * ratio, t0);
      depth.gain.setTargetAtTime(indexFloor * freq * ratio, t0, indexTau);
      mod.connect(depth);
      depth.connect(carrier.frequency);
      oscillators.push(carrier, mod);
      return carrier;
    };
    pair(1, p.bodyIndex, p.bodySustain, p.bodyIndexTau).connect(amp);
    if (p.tineRatio > 0) {
      const tine = ctx.createGain();
      tine.gain.setValueAtTime(p.tineGain, t0);
      tine.gain.setTargetAtTime(0, t0, p.tineTau);
      pair(p.tineRatio, p.tineIndex, 0, p.tineIndexTau).connect(tine);
      tine.connect(amp);
    }
    const peak = p.gain * (opts.gain ?? 1);
    amp.gain.linearRampToValueAtTime(peak, t0 + env.attack);
    amp.gain.setTargetAtTime(0, t0 + env.attack, p.ampTau);
    autoEnd = start + p.ampTau * 6;
  } else {
    const osc = ctx.createOscillator();
    if (voice === 'sine') osc.type = 'sine';
    else osc.setPeriodicWave(periodicWave(engine, voice, VOICE_PARTIALS[voice]));
    osc.frequency.value = freq;
    osc.connect(amp);
    oscillators.push(osc);
    amp.gain.linearRampToValueAtTime((0.2 + 0.8 * velocity) * pitchLoudnessTrim(freq) * 0.42 * (opts.gain ?? 1), t0 + env.attack);
  }
  for (const o of oscillators) o.start(t0);
  engine.guard(() => {
    amp.disconnect();
    for (const o of oscillators) o.stop();
  });

  // A note without a scheduled end keeps the context awake until it is stopped.
  let endAt = Infinity;
  let release: (() => void) | null = null;
  const stop = (at?: number): void => {
    const t = Math.max(at ?? engine.now(), engine.now());
    if (t >= endAt) return;
    endAt = t;
    const node = engine.nodeTime(t);
    holdParam(amp.gain, node);
    amp.gain.setTargetAtTime(0, node, env.release / 3);
    for (const o of oscillators) {
      try {
        o.stop(node + env.release * 2.5);
      } catch {
        // ignore
      }
    }
    engine.touch(t + env.release * 3 + 1);
    release?.();
    release = null;
  };
  oscillators[0].onended = () => {
    release?.();
    release = null;
    try {
      amp.disconnect();
    } catch {
      // ignore
    }
  };
  if (opts.duration !== undefined) stop(start + Math.max(0.01, opts.duration));
  else if (autoEnd !== Infinity) stop(autoEnd);
  else release = engine.hold();
  return { startTime: start, freq, stop };
}

/** Play several tones together (a chord for ear training or comping). `roll` staggers the notes. */
export function playChord(midis: readonly number[], when?: number, opts: ToneOptions & { roll?: number } = {}, engine: AudioEngine = getEngine()): ToneHandle[] {
  const start = Math.max(when ?? engine.now(), engine.now());
  // Keep a stack of notes from adding up louder than one note.
  const gain = (opts.gain ?? 1) / Math.sqrt(Math.max(1, midis.length));
  return midis.map((m, i) => playTone(m, start + i * (opts.roll ?? 0), { ...opts, gain }, engine));
}

// ---------------------------------------------------------------------------------------------
// Drone
// ---------------------------------------------------------------------------------------------

/** Options for {@link startDrone}. */
export interface DroneStartOptions extends DroneOptions {
  /** 0..1 (default 0.8). */
  volume?: number;
  /** Seconds to fade in (default 0.8). */
  fadeIn?: number;
}

/** A running drone. */
export interface DroneHandle {
  /** Change the root (and keep the fifth / octave settings) with a short crossfade. */
  setRoot(midi: number): void;
  /** Turn the fifth on or off. */
  setFifth(on: boolean): void;
  setVolume(volume: number): void;
  /** Fade out and stop (default 0.6 s). */
  stop(fade?: number): void;
  readonly running: boolean;
}

/**
 * Start a sustained drone (root, or root + fifth) to practise scales and intonation against.
 * It keeps the audio context awake until stopped.
 */
export function startDrone(opts: DroneStartOptions = {}, engine: AudioEngine = getEngine()): DroneHandle {
  const ctx = engine.ctx;
  const out = ctx.createGain();
  out.gain.value = clamp(opts.volume ?? 0.8, 0, 1.5);
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = DRONE_LOWPASS_HZ;
  lowpass.Q.value = -3; // dB: no resonance, close to a gentle first-order slope near the corner
  lowpass.connect(out);
  out.connect(engine.bus('drone'));
  const wave = periodicWave(engine, 'drone', DRONE_PARTIALS);
  const state = { root: opts.root ?? 45, fifth: !!opts.fifth, octave: opts.octave ?? true, a4: opts.a4 };
  let release: (() => void) | null = engine.hold();
  let running = true;

  interface Layer {
    group: GainNode;
    nodes: OscillatorNode[];
  }
  let current: Layer | null = null;

  const build = (fade: number): Layer => {
    const t = engine.now();
    const group = ctx.createGain();
    group.gain.setValueAtTime(0, t);
    group.gain.linearRampToValueAtTime(1, t + fade);
    group.connect(lowpass);
    const nodes: OscillatorNode[] = [];
    for (const layer of droneLayers(state)) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      osc.frequency.value = layer.freq;
      const g = ctx.createGain();
      g.gain.value = layer.gain * 0.5 * 0.85;
      // A slow swell on each oscillator keeps the drone alive without moving its pitch.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = layer.swellHz;
      const depth = ctx.createGain();
      depth.gain.value = layer.gain * 0.5 * 0.15;
      lfo.connect(depth);
      depth.connect(g.gain);
      osc.connect(g);
      g.connect(group);
      osc.start(t);
      lfo.start(t);
      nodes.push(osc, lfo);
    }
    return { group, nodes };
  };

  const retire = (layer: Layer, fade: number): void => {
    const t = engine.now();
    layer.group.gain.cancelScheduledValues(t);
    layer.group.gain.setTargetAtTime(0, t, fade / 3);
    for (const n of layer.nodes) n.stop(t + fade * 2);
    layer.nodes[0].onended = () => layer.group.disconnect();
  };

  current = build(opts.fadeIn ?? 0.8);

  const rebuild = (): void => {
    if (!running) return;
    if (current) retire(current, 0.35);
    current = build(0.35);
  };

  return {
    setRoot(midi: number) {
      state.root = midi;
      rebuild();
    },
    setFifth(on: boolean) {
      if (state.fifth === on) return;
      state.fifth = on;
      rebuild();
    },
    setVolume(volume: number) {
      out.gain.setTargetAtTime(clamp(volume, 0, 1.5), engine.now(), 0.05);
    },
    stop(fade = 0.6) {
      if (!running) return;
      running = false;
      if (current) retire(current, fade);
      current = null;
      engine.touch(engine.now() + fade * 2 + 1);
      release?.();
      release = null;
      setTimeout(() => {
        try {
          out.disconnect();
          lowpass.disconnect();
        } catch {
          // ignore
        }
      }, (fade * 2 + 0.5) * 1000);
    },
    get running() {
      return running;
    },
  };
}

onAudioClosed(() => {
  sharedKit = null;
});
