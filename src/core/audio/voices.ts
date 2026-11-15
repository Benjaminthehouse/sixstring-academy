/**
 * The non-guitar voices on the live engine: drum kit, metronome clicks, interface sounds, the tone
 * generator (reference tone, electric piano, organ) and the drone.
 *
 * Percussive sounds are rendered once by the pure DSP modules and replayed from the buffer cache.
 * Sustained voices are built from oscillators so a note can last as long as it is needed.
 * Every function takes the audio-clock time at which the sound should be heard (default: now) and,
 * last, an optional engine (default: the shared live engine).
 */
import { clamp, finiteOr } from './dsp';
import { AudioEngine, BUS_NAMES, audioSupported, getEngine, onAudioClosed, pannedInput, type BusName } from './engine';
import { DRONE_LOWPASS_HZ, DRONE_PARTIALS, TONE_VOICES, VOICE_ENVELOPE, VOICE_PARTIALS, droneLayers, epianoParams, pitchLoudnessTrim, toneFrequency, type DroneOptions, type ToneVoice } from './keys';
import { DRUM_NAMES, DRUM_VARIANTS, HIHAT_CHOKERS, isDrumName, normalizeClickSet, renderClick, renderDrum, type ClickLevel, type ClickSet, type DrumName } from './percussion';
import { UI_SOUNDS, renderUiSound, type UiSound } from './ui-sounds';

/** One playing (or scheduled) buffer. */
interface Shot {
  src: AudioBufferSourceNode;
  gain: GainNode;
  start: number;
  /** True once the shot has ended or been dropped. */
  done: boolean;
  /** Called once when the shot is finished with. */
  onDone: (() => void) | null;
  /** Drop the shot: silently if it has not started, with a very short fade if it is sounding. */
  cancel(): void;
}

function fire(engine: AudioEngine, buffer: AudioBuffer, dest: BusName | AudioNode, when: number | undefined, gain: number): Shot {
  const ctx = engine.ctx;
  const start = engine.startTime(when);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = clamp(finiteOr(gain, 1), 0, 8);
  src.connect(g);
  g.connect(typeof dest === 'string' ? engine.bus(dest) : dest);
  // The source starts a little before the sound is heard (the master chain's look-ahead).
  const nodeStart = engine.nodeTime(start);
  src.start(nodeStart);
  const shot: Shot = {
    src,
    gain: g,
    start,
    done: false,
    onDone: null,
    cancel: () => {
      if (shot.done) return;
      const now = engine.now();
      try {
        if (nodeStart > now || !engine.audible) {
          // Its source has not started: remove it outright.
          src.onended = null;
          src.stop();
          src.disconnect();
          finish();
        } else {
          g.gain.setTargetAtTime(0, now, 0.003);
          src.stop(now + 0.03);
        }
      } catch {
        finish();
      }
    },
  };
  const finish = (): void => {
    if (shot.done) return;
    shot.done = true;
    try {
      g.disconnect();
    } catch {
      // already disconnected
    }
    const fn = shot.onDone;
    shot.onDone = null;
    fn?.();
  };
  src.onended = finish;
  engine.guard(shot.cancel);
  engine.touch(start + buffer.duration + 1);
  return shot;
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
  private placesEngine: AudioEngine | null = null;

  constructor(engine?: AudioEngine) {
    this.fixedEngine = engine;
  }

  private get engine(): AudioEngine {
    return this.fixedEngine ?? getEngine();
  }

  /** False where there is no Web Audio at all: every method is then a silent no-op. */
  private get available(): boolean {
    return this.fixedEngine !== undefined || audioSupported();
  }

  private buffer(name: DrumName, variant: number): AudioBuffer {
    const engine = this.engine;
    return engine.buffers.get(`drum:${name}:${variant}`, () => renderDrum(name, engine.sampleRate, variant));
  }

  private place(name: DrumName): AudioNode {
    const current = this.engine;
    if (this.placesEngine !== current) {
      // The shared engine was closed and made again: the old panners belong to a context that is gone.
      this.places.clear();
      this.active.clear();
      this.openHats.clear();
      this.placesEngine = current;
    }
    let node = this.places.get(name);
    if (!node) {
      const engine = current;
      node = pannedInput(engine.ctx, engine.bus('drums'), DRUM_PAN[name] ?? 0);
      this.places.set(name, node);
    }
    return node;
  }

  /**
   * Hit a drum at audio time `when` (default now) with velocity 0..1; `gain` scales the result.
   * Returns false when nothing will be heard for certain (an unknown drum), true otherwise.
   */
  play(name: DrumName, when?: number, velocity = 0.8, gain = 1): boolean {
    if (!isDrumName(name) || !this.available) return false;
    const engine = this.engine;
    const variants = DRUM_VARIANTS[name] ?? 1;
    const n = this.turn.get(name) ?? 0;
    this.turn.set(name, n + 1);
    const shot = fire(engine, this.buffer(name, n % variants), this.place(name), when, drumGain(finiteOr(velocity, 0.8)) * finiteOr(gain, 1));
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
    shot.onDone = () => {
      this.active.delete(shot);
      this.openHats.delete(shot);
    };
    return true;
  }

  /** Render every drum now so the first bar has no hitch. */
  async preload(names: readonly DrumName[] = DRUM_NAMES): Promise<void> {
    if (!this.available) return;
    let t = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const name of names) {
      for (let v = 0; v < (DRUM_VARIANTS[name] ?? 1); v++) {
        this.buffer(name, v);
        t = await breathe(t);
      }
    }
  }

  /**
   * Cut everything at `when` (default now): hits that are sounding fade in a few milliseconds, hits
   * scheduled for later are removed, so nothing new is heard after a stop or a pause.
   */
  stopAll(when?: number): void {
    if (!this.active.size) return;
    const engine = this.engine;
    const at = engine.startTime(when);
    const t = engine.nodeTime(at);
    for (const s of [...this.active]) {
      if (s.start >= at) {
        s.onDone = null;
        this.active.delete(s);
        this.openHats.delete(s);
        try {
          s.src.onended = null;
          s.src.stop();
          s.src.disconnect();
          s.gain.disconnect();
        } catch {
          // ignore
        }
        s.done = true;
        continue;
      }
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setTargetAtTime(0, t, 0.01);
      try {
        s.src.stop(t + 0.08);
      } catch {
        // ignore
      }
    }
  }

  /** Number of hits sounding or scheduled. */
  get activeHits(): number {
    return this.active.size;
  }

  /** Stop everything and take the kit off the mixer. The kit can be used again afterwards. */
  dispose(): void {
    this.stopAll();
    if (!this.places.size) return;
    for (const node of this.places.values()) {
      // A centred drum's place is the bus itself, which is not ours to disconnect.
      if (node === this.engine.bus('drums')) continue;
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
    this.places.clear();
  }
}

let sharedKit: DrumKit | null = null;

/** The shared drum kit on the live engine. */
export function getDrums(): DrumKit {
  return (sharedKit ??= new DrumKit());
}

/** Hit a drum on the shared kit. Never throws; false means the name is not a drum. */
export function playDrum(name: DrumName, when?: number, velocity?: number): boolean {
  return getDrums().play(name, when, velocity);
}

// ---------------------------------------------------------------------------------------------
// Clicks and interface sounds
// ---------------------------------------------------------------------------------------------

const CLICK_LEVELS: readonly ClickLevel[] = ['accent', 'medium', 'beat', 'sub'];

/**
 * Play one metronome click at audio time `when` (default now). Returns a function that takes the
 * click back: called before the click is heard it removes it without a sound (a metronome stopped
 * with clicks still scheduled), called while it sounds it cuts it short.
 */
export function playClick(set: ClickSet, level: ClickLevel, when?: number, gain = 1, engine?: AudioEngine): () => void {
  if (!engine && !audioSupported()) return () => undefined;
  engine ??= getEngine();
  const sound = normalizeClickSet(set);
  const strength = CLICK_LEVELS.includes(level) ? level : 'beat';
  const buffer = engine.buffers.get(`click:${sound}:${strength}`, () => renderClick(sound, strength, engine.sampleRate));
  return fire(engine, buffer, 'click', when, gain).cancel;
}

/** Render a click set ahead of time. */
export function preloadClicks(set: ClickSet, engine?: AudioEngine): void {
  if (!engine && !audioSupported()) return;
  const target = engine ?? getEngine();
  const sound = normalizeClickSet(set);
  for (const level of CLICK_LEVELS) {
    target.buffers.get(`click:${sound}:${level}`, () => renderClick(sound, level, target.sampleRate));
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
 * late. Returns true when audio is running and the sound will be heard.
 */
export function playUi(name: UiSound, opts: UiSoundOptions = {}, engine?: AudioEngine): boolean {
  try {
    if (!UI_SOUNDS.includes(name) || (!engine && !audioSupported())) return false;
    const e = engine ?? getEngine();
    const step = name === 'combo' ? Math.max(0, Math.min(24, Math.floor(finiteOr(opts.step, 0)))) : 0;
    const buffer = e.buffers.get(`ui:${name}:${step}`, () => renderUiSound(name, e.sampleRate, step));
    fire(e, buffer, 'ui', opts.when, clamp(finiteOr(opts.volume, 1), 0, 1.5));
    return e.audible;
  } catch {
    // Feedback sounds are never worth an error.
    return false;
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
  /** Frequency in Hz (0 for a tone that could not be played). */
  readonly freq: number;
  /** True when the tone was requested while audio was not running; it is dropped if audio does not start at once. */
  readonly queued: boolean;
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
export function playTone(note: number | { freq: number }, when?: number, opts: ToneOptions = {}, engine?: AudioEngine): ToneHandle {
  // No Web Audio here at all: a handle that does nothing, so callers need no special case.
  if (!engine && !audioSupported()) return { startTime: 0, freq: 0, queued: false, stop: () => undefined };
  engine ??= getEngine();
  const ctx = engine.ctx;
  const voice: ToneVoice = TONE_VOICES.includes(opts.voice as ToneVoice) ? (opts.voice as ToneVoice) : 'reference';
  const a4 = clamp(finiteOr(opts.a4, 440), 220, 880);
  const cents = clamp(finiteOr(opts.cents, 0), -2400, 2400);
  const freq = toneFrequency(typeof note === 'number' ? { midi: note, a4, cents } : { freq: finiteOr(note?.freq, NaN), cents });
  const start = engine.startTime(when);
  // Garbage in, silence out: nothing below 8 Hz or above what the context can carry is a note.
  if (!(freq >= 8 && freq <= engine.sampleRate * 0.45)) return { startTime: start, freq: 0, queued: false, stop: () => undefined };
  const velocity = clamp(finiteOr(opts.velocity, 0.7), 0, 1);
  const level = clamp(finiteOr(opts.gain, 1), 0, 8);
  const t0 = engine.nodeTime(start);
  const env = VOICE_ENVELOPE[voice];
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.connect(engine.bus(BUS_NAMES.includes(opts.bus as BusName) ? (opts.bus as BusName) : 'tone'));
  const oscillators: OscillatorNode[] = [];
  let autoEnd = Infinity;
  let peakLevel: number;

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
    peakLevel = p.gain * level;
    amp.gain.linearRampToValueAtTime(peakLevel, t0 + env.attack);
    amp.gain.setTargetAtTime(0, t0 + env.attack, p.ampTau);
    autoEnd = start + p.ampTau * 6;
  } else {
    const osc = ctx.createOscillator();
    if (voice === 'sine') osc.type = 'sine';
    else osc.setPeriodicWave(periodicWave(engine, voice, VOICE_PARTIALS[voice]));
    osc.frequency.value = freq;
    osc.connect(amp);
    oscillators.push(osc);
    peakLevel = (0.2 + 0.8 * velocity) * pitchLoudnessTrim(freq) * 0.42 * level;
    amp.gain.linearRampToValueAtTime(peakLevel, t0 + env.attack);
  }
  for (const o of oscillators) o.start(t0);
  const queued = !engine.audible;

  // A note without a scheduled end keeps the context awake until it is stopped.
  let endAt = Infinity;
  let release: (() => void) | null = null;
  /** Remove the tone without a sound: it was never heard, or it is stopped before it starts. */
  const drop = (): void => {
    endAt = -Infinity;
    release?.();
    release = null;
    try {
      amp.disconnect();
    } catch {
      // ignore
    }
    for (const o of oscillators) {
      try {
        o.onended = null;
        o.stop();
        o.disconnect();
      } catch {
        // ignore
      }
    }
  };
  engine.guard(drop);
  const stop = (at?: number): void => {
    const t = engine.startTime(at);
    if (t >= endAt) return;
    if (t <= start) {
      drop();
      return;
    }
    endAt = t;
    const node = engine.nodeTime(t);
    if (node < t0 + env.attack) {
      // The release starts inside the attack ramp. Rebuild the ramp so that it ends there, at the
      // level it had reached: this does not depend on cancelAndHoldAtTime, which not every browser
      // has (without it, cancelling would remove the whole ramp and the note would stay silent).
      amp.gain.cancelScheduledValues(t0);
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(peakLevel * Math.max(0, (node - t0) / env.attack), node);
    } else {
      holdParam(amp.gain, node);
    }
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
  const duration = finiteOr(opts.duration, NaN);
  if (duration >= 0) stop(start + Math.max(0.01, duration));
  else if (autoEnd !== Infinity) stop(autoEnd);
  else release = engine.hold();
  return { startTime: start, freq, queued, stop };
}

/** Play several tones together (a chord for ear training or comping). `roll` staggers the notes. */
export function playChord(midis: readonly number[], when?: number, opts: ToneOptions & { roll?: number } = {}, engine?: AudioEngine): ToneHandle[] {
  if (!engine && !audioSupported()) return midis.map((m) => playTone(m, when, opts));
  engine ??= getEngine();
  const start = engine.startTime(when);
  // Keep a stack of notes from adding up louder than one note.
  const gain = finiteOr(opts.gain, 1) / Math.sqrt(Math.max(1, midis.length));
  const roll = clamp(finiteOr(opts.roll, 0), 0, 1);
  return midis.map((m, i) => playTone(m, start + i * roll, { ...opts, gain }, engine));
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
export function startDrone(opts: DroneStartOptions = {}, engine?: AudioEngine): DroneHandle {
  if (!engine && !audioSupported()) {
    return { setRoot: () => undefined, setFifth: () => undefined, setVolume: () => undefined, stop: () => undefined, running: false };
  }
  engine ??= getEngine();
  const ctx = engine.ctx;
  const out = ctx.createGain();
  out.gain.value = clamp(finiteOr(opts.volume, 0.8), 0, 1.5);
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = DRONE_LOWPASS_HZ;
  lowpass.Q.value = -3; // dB: no resonance, close to a gentle first-order slope near the corner
  lowpass.connect(out);
  out.connect(engine.bus('drone'));
  const wave = periodicWave(engine, 'drone', DRONE_PARTIALS);
  const state = { root: clamp(finiteOr(opts.root, 45), 0, 127), fifth: !!opts.fifth, octave: opts.octave ?? true, a4: clamp(finiteOr(opts.a4, 440), 220, 880) };
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
    for (const n of layer.nodes) {
      try {
        n.stop(t + fade * 2);
      } catch {
        // ignore
      }
    }
    layer.nodes[0].onended = () => {
      try {
        layer.group.disconnect();
      } catch {
        // ignore
      }
    };
  };

  current = build(clamp(finiteOr(opts.fadeIn, 0.8), 0.005, 10));

  // A root dragged across a slider asks for dozens of changes a second. Each change crossfades to a
  // new set of oscillators, so changes are spaced out: the latest request always wins, and no more
  // than a handful of layers are ever alive at once.
  const MIN_GAP_MS = 70;
  let lastBuild = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const rebuild = (): void => {
    if (!running) return;
    const since = clock() - lastBuild;
    if (since < MIN_GAP_MS) {
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          rebuild();
        }, MIN_GAP_MS - since);
      }
      return;
    }
    // Changes in quick succession get a quick crossfade, a single change a gentle one.
    const fade = since < 400 ? 0.12 : 0.35;
    lastBuild = clock();
    if (current) retire(current, fade);
    current = build(fade);
  };

  return {
    setRoot(midi: number) {
      if (!Number.isFinite(midi) || midi === state.root) return;
      state.root = clamp(midi, 0, 127);
      rebuild();
    },
    setFifth(on: boolean) {
      if (state.fifth === !!on) return;
      state.fifth = !!on;
      rebuild();
    },
    setVolume(volume: number) {
      if (!Number.isFinite(volume)) return;
      out.gain.setTargetAtTime(clamp(volume, 0, 1.5), engine.now(), 0.05);
    },
    stop(fade = 0.6) {
      if (!running) return;
      running = false;
      const f = clamp(finiteOr(fade, 0.6), 0.01, 10);
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (current) retire(current, f);
      current = null;
      engine.touch(engine.now() + f * 2 + 1);
      release?.();
      release = null;
      setTimeout(() => {
        try {
          out.disconnect();
          lowpass.disconnect();
        } catch {
          // ignore
        }
      }, (f * 2 + 0.5) * 1000);
    },
    get running() {
      return running;
    },
  };
}

onAudioClosed(() => {
  sharedKit = null;
});
