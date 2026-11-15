/**
 * The live guitar (and bass) synth: plays the string model through Web Audio.
 *
 * Each note is rendered once into a buffer (cached by pitch, string, dynamic layer and tone) and
 * started with sample accuracy on the audio clock. Notes pass through their instrument's shared bus
 * (acoustic body, pickup and amp, or drive and cabinet). Voices are managed per string: a new note
 * on a string takes over from the one ringing there with a few milliseconds of fade, exactly what a
 * fretting finger does.
 */
import { clamp } from './dsp';
import { AudioEngine, chainFilters, getEngine, onAudioClosed, pannedInput, type BusName } from './engine';
import { renderRawPluck, strumPlan, type PluckOptions, type StrumOptions } from './pluck';
import { DRIVE_CURVE_RANGE, INSTRUMENTS, driveCurve, resolveTone, velocityGain, type StringInstrument, type ToneName } from './tones';

/** Options for one live note. */
export interface PlayOptions extends PluckOptions {
  /** Seconds until the note is released. Omitted: it rings until replaced on its string or it dies away. */
  duration?: number;
  /** Ignore `duration` and let the note ring (tab "let ring"). */
  letRing?: boolean;
  /** Extra linear gain for this note (default 1). */
  gain?: number;
}

/** Options for a live strum. */
export interface PlayStrumOptions extends StrumOptions {
  duration?: number;
  letRing?: boolean;
  gain?: number;
  /** Damp strings that are still ringing but not part of this chord (default true). */
  choke?: boolean;
}

/** A playing (or scheduled) note. */
export interface VoiceHandle {
  /** Audio-clock time the note is heard. */
  readonly startTime: number;
  /** Stop the note at `when` (default now) with a release of `release` seconds. */
  stop(when?: number, release?: number): void;
}

/** Construction options for {@link GuitarSynth}. */
export interface GuitarSynthOptions {
  /** Engine to play into (default: the shared live engine, created on first note). */
  engine?: AudioEngine;
  /** Mixer bus (default `guitar`). */
  bus?: BusName;
  /** Tone used when a note does not name one (default `steel`). */
  tone?: ToneName;
  /** One note at a time, like a bass line (default false). */
  mono?: boolean;
  /** Most simultaneous voices before the oldest is stolen (default 28). */
  maxVoices?: number;
  /** Stereo position, -1 left .. +1 right (default 0, the centre). */
  pan?: number;
}

/** Dynamic layers rendered per note; the nearest one is used and scaled to the exact velocity. */
const VELOCITY_LAYERS = [0.3, 0.55, 0.8, 1];
const STEAL_FADE = 0.004; // seconds: time constant when a new note takes over a string
const BRIGHTNESS_STEPS = 2; // brightness is quantised to halves so the cache stays small

function nearestLayer(v: number): number {
  let best = VELOCITY_LAYERS[0];
  for (const l of VELOCITY_LAYERS) if (Math.abs(l - v) < Math.abs(best - v)) best = l;
  return best;
}

class Voice implements VoiceHandle {
  stopAt = Infinity;
  done = false;
  constructor(
    private readonly engine: AudioEngine,
    readonly src: AudioBufferSourceNode,
    readonly gain: GainNode,
    readonly key: string,
    readonly startTime: number,
    readonly naturalEnd: number,
    private readonly defaultRelease: number,
  ) {}

  /** Drop the note without a sound (it was requested before audio could start). */
  cancel(): void {
    if (this.done) return;
    this.stopAt = 0;
    try {
      this.gain.disconnect();
      this.src.stop();
    } catch {
      // already gone
    }
  }

  stop(when?: number, release: number = this.defaultRelease): void {
    if (this.done) return;
    const t = Math.max(when ?? this.engine.now(), this.engine.now());
    if (t >= this.stopAt) return;
    this.stopAt = t;
    const node = this.engine.nodeTime(t);
    const tau = Math.max(0.001, release / 3);
    try {
      this.gain.gain.cancelScheduledValues(node);
      this.gain.gain.setTargetAtTime(0, node, tau);
      this.src.stop(node + tau * 8 + 0.005);
    } catch {
      // The source may already have ended.
    }
  }
}

/** A plucked-string instrument on the audio clock. */
export class GuitarSynth {
  /** Tone used when a note does not name one. */
  tone: ToneName;
  /** Instrument that the `muted` and `harmonic` tones are played on. */
  baseTone: StringInstrument = 'steel';
  /** Reference pitch of A4 in Hz; changes apply to the next note. */
  a4 = 440;

  private readonly fixedEngine: AudioEngine | undefined;
  private readonly busName: BusName;
  private readonly mono: boolean;
  private readonly maxVoices: number;
  private readonly pan: number;
  private readonly inputs = new Map<StringInstrument, GainNode>();
  private readonly byKey = new Map<string, Voice[]>();
  private readonly all = new Set<Voice>();

  constructor(opts: GuitarSynthOptions = {}) {
    this.fixedEngine = opts.engine;
    this.busName = opts.bus ?? 'guitar';
    this.tone = opts.tone ?? 'steel';
    this.mono = opts.mono ?? false;
    this.maxVoices = opts.maxVoices ?? 28;
    this.pan = opts.pan ?? 0;
    const base = resolveTone(this.tone).instrument;
    if (INSTRUMENTS[base]) this.baseTone = base;
  }

  /** The engine this synth plays into. */
  get engine(): AudioEngine {
    return this.fixedEngine ?? getEngine();
  }

  /** The bus input for an instrument, building its filter / drive chain on first use. */
  private input(instrument: StringInstrument): GainNode {
    const hit = this.inputs.get(instrument);
    if (hit) return hit;
    const engine = this.engine;
    const ctx = engine.ctx;
    const fx = INSTRUMENTS[instrument].fx;
    const input = ctx.createGain();
    let node: AudioNode = chainFilters(ctx, input, fx.pre);
    if (fx.drive) {
      const pre = ctx.createGain();
      pre.gain.value = fx.drive.gain / DRIVE_CURVE_RANGE;
      const shaper = ctx.createWaveShaper();
      shaper.curve = driveCurve(fx.drive.asymmetry) as Float32Array<ArrayBuffer>;
      node.connect(pre);
      pre.connect(shaper);
      node = shaper;
    }
    node = chainFilters(ctx, node, fx.post);
    const out = ctx.createGain();
    out.gain.value = fx.level;
    node.connect(out);
    out.connect(pannedInput(ctx, engine.bus(this.busName), this.pan));
    this.inputs.set(instrument, input);
    return input;
  }

  private bufferFor(midi: number, velocity: number, opts: PluckOptions): { buffer: AudioBuffer; instrument: StringInstrument; release: number } {
    const engine = this.engine;
    const tone = opts.tone ?? this.tone;
    const { instrument, articulation } = resolveTone(tone, opts.articulation, this.baseTone);
    const layer = nearestLayer(velocity);
    const brightness = Math.round(clamp(opts.brightness ?? 0, -1, 1) * BRIGHTNESS_STEPS) / BRIGHTNESS_STEPS;
    const note = Math.round(midi);
    const key = `pluck:${instrument}:${articulation}:${note}:${opts.string ?? 0}:${layer}:${brightness}`;
    const buffer = engine.buffers.get(key, () =>
      renderRawPluck({ midi: note, sampleRate: engine.sampleRate, velocity: layer, tone: instrument, articulation, string: opts.string, brightness }).samples,
    );
    return { buffer, instrument, release: INSTRUMENTS[instrument].release };
  }

  /**
   * Pluck one note. `when` is the audio-clock time it should be heard (default: now).
   * Fractional MIDI numbers and `opts.cents` bend the pitch; `a4` moves the whole instrument.
   */
  pluck(midi: number, when?: number, opts: PlayOptions = {}): VoiceHandle {
    const engine = this.engine;
    const ctx = engine.ctx;
    // Garbage in, silence out: a bad pitch must not reach the string model.
    if (!Number.isFinite(midi) || midi < 12 || midi > 115) return { startTime: when ?? engine.now(), stop: () => undefined };
    const velocity = clamp(opts.velocity ?? 0.8, 0, 1);
    const { buffer, instrument, release } = this.bufferFor(midi, velocity, opts);
    const start = Math.max(when ?? engine.now(), engine.now());
    const node = engine.nodeTime(start);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Buffers are rendered at A4 = 440 on the equal-tempered grid; everything else is a rate change.
    const cents = (opts.cents ?? 0) + (midi - Math.round(midi)) * 100 + 1200 * Math.log2((opts.a4 ?? this.a4) / 440);
    if (cents !== 0) src.playbackRate.value = Math.pow(2, cents / 1200);
    const gain = ctx.createGain();
    gain.gain.value = velocityGain(velocity) * (opts.gain ?? 1) * (opts.direction === 'up' ? -1 : 1);
    src.connect(gain);
    gain.connect(this.input(instrument));

    const key = this.mono ? 'mono' : opts.string !== undefined ? `s${opts.string}` : `m${Math.round(midi)}`;
    const voice = new Voice(engine, src, gain, key, start, start + buffer.duration, release);
    // Start first: a source can only be given a stop time once it has a start time.
    src.start(node);

    // Per-string voice management: take over from earlier notes, yield to later ones.
    const mates = this.byKey.get(key) ?? [];
    for (const other of mates) {
      if (other.startTime <= start) other.stop(start, STEAL_FADE * 3);
      else voice.stop(other.startTime, STEAL_FADE * 3);
    }
    mates.push(voice);
    this.byKey.set(key, mates);
    this.all.add(voice);
    if (this.all.size > this.maxVoices) {
      let oldest: Voice | null = null;
      for (const v of this.all) if (v !== voice && v.stopAt === Infinity && (!oldest || v.startTime < oldest.startTime)) oldest = v;
      oldest?.stop(start, 0.02);
    }

    src.onended = () => {
      voice.done = true;
      this.all.delete(voice);
      const list = this.byKey.get(key);
      if (list) {
        const i = list.indexOf(voice);
        if (i >= 0) list.splice(i, 1);
        if (!list.length) this.byKey.delete(key);
      }
      try {
        gain.disconnect();
      } catch {
        // already disconnected
      }
    };
    if (opts.duration !== undefined && !opts.letRing) voice.stop(start + Math.max(0.01, opts.duration), release);
    engine.guard(() => voice.cancel());
    engine.touch(Math.min(voice.naturalEnd, voice.stopAt + 0.5) + 1.5);
    return voice;
  }

  /**
   * Strum a chord. `midis` are given from the lowest string to the highest; `direction` decides
   * which end is hit first. Returns one handle per note, in playing order.
   */
  strum(midis: readonly number[], when?: number, opts: PlayStrumOptions = {}): VoiceHandle[] {
    const engine = this.engine;
    const plan = strumPlan(midis, opts);
    const base = Math.max(when ?? engine.now(), engine.now());
    const first = base + Math.min(0, ...plan.map((p) => p.offset));
    if (opts.choke ?? true) {
      const used = new Set(plan.map((p) => (p.string !== undefined ? `s${p.string}` : `m${Math.round(p.midi)}`)));
      for (const [key, voices] of this.byKey) {
        if (used.has(key)) continue;
        for (const v of voices) if (v.startTime < first) v.stop(first, 0.07);
      }
    }
    return plan.map((p) =>
      this.pluck(p.midi, Math.max(engine.now(), base + p.offset), {
        velocity: p.velocity,
        string: p.string,
        direction: p.direction,
        tone: opts.tone,
        articulation: opts.articulation,
        brightness: opts.brightness,
        cents: opts.cents,
        a4: opts.a4,
        duration: opts.duration,
        letRing: opts.letRing,
        gain: opts.gain,
      }),
    );
  }

  /** Damp whatever is ringing on one string (1 = thinnest) at `when`. */
  stopString(string: number, when?: number, release = 0.05): void {
    for (const v of this.byKey.get(`s${string}`) ?? []) v.stop(when, release);
  }

  /** Damp everything, including notes scheduled but not yet sounding, at `when` (default now). */
  stopAll(when?: number, release = 0.06): void {
    for (const v of [...this.all]) v.stop(when, release);
  }

  /** Number of voices sounding or scheduled. */
  get activeVoices(): number {
    return this.all.size;
  }

  /**
   * Render notes ahead of time so the first play has no hitch. Yields to the event loop between
   * notes; resolves when everything is cached.
   */
  async preload(notes: ReadonlyArray<number | { midi: number; string?: number; velocity?: number; tone?: ToneName }>, opts: PluckOptions = {}): Promise<void> {
    let last = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const n of notes) {
      const spec = typeof n === 'number' ? { midi: n } : n;
      this.bufferFor(spec.midi, clamp(spec.velocity ?? opts.velocity ?? 0.8, 0, 1), { ...opts, string: spec.string ?? opts.string, tone: spec.tone ?? opts.tone });
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      if (now - last > 8) {
        await new Promise<void>((r) => setTimeout(r, 0));
        last = typeof performance !== 'undefined' ? performance.now() : 0;
      }
    }
  }

  /** Stop everything and disconnect the instrument buses. */
  dispose(): void {
    this.stopAll(undefined, 0.01);
    for (const input of this.inputs.values()) {
      try {
        input.disconnect();
      } catch {
        // ignore
      }
    }
    this.inputs.clear();
  }
}

// ---------------------------------------------------------------------------------------------
// Shared instances and one-line helpers
// ---------------------------------------------------------------------------------------------

let sharedGuitar: GuitarSynth | null = null;
let sharedBass: GuitarSynth | null = null;

/** The shared guitar synth on the live engine. */
export function getGuitar(): GuitarSynth {
  return (sharedGuitar ??= new GuitarSynth());
}

/** The shared bass synth on the live engine (monophonic, on the `bass` bus). */
export function getBass(): GuitarSynth {
  return (sharedBass ??= new GuitarSynth({ bus: 'bass', tone: 'bass-finger', mono: true }));
}

/** Pluck a note on the shared guitar. `when` is audio-clock time (default now). */
export function pluck(midi: number, when?: number, opts?: PlayOptions): VoiceHandle {
  return getGuitar().pluck(midi, when, opts);
}

/** Strum a chord (`midis` low to high) on the shared guitar. */
export function strum(midis: readonly number[], when?: number, opts?: PlayStrumOptions): VoiceHandle[] {
  return getGuitar().strum(midis, when, opts);
}

/** Damp everything the shared guitar is playing or has scheduled. */
export function stopAll(when?: number, release?: number): void {
  sharedGuitar?.stopAll(when, release);
}

/** Play a bass note on the shared bass. */
export function playBass(midi: number, when?: number, opts?: PlayOptions): VoiceHandle {
  return getBass().pluck(midi, when, opts);
}

onAudioClosed(() => {
  sharedGuitar = null;
  sharedBass = null;
});
