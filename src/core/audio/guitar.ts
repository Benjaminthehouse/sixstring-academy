/**
 * The live guitar (and bass) synth: plays the string model through Web Audio.
 *
 * Each note is rendered once into a buffer (cached by pitch, string, dynamic layer and tone) and
 * started with sample accuracy on the audio clock. Notes pass through their instrument's shared bus
 * (acoustic body, pickup and amp, or drive and cabinet). Voices are managed per string: a new note
 * on a string takes over from the one ringing there with a few milliseconds of fade, exactly what a
 * fretting finger does.
 */
import { soundDefaults } from './defaults';
import { clamp, finiteOr } from './dsp';
import { AudioEngine, audioSupported, chainFilters, getEngine, hasEngine, onAudioClosed, onAudioUnlocked, pannedInput, type BusName } from './engine';
import { renderRawPluck, strumPlan, type PluckOptions, type StrumOptions } from './pluck';
import { DRIVE_CURVE_RANGE, INSTRUMENTS, driveCurve, normalizeTone, resolveTone, velocityGain, type StringInstrument, type ToneName } from './tones';

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
  /**
   * True when the note was requested while audio was not running (locked, or still waking up). Such
   * a note is heard only if the context starts within a moment; otherwise it is dropped, not played late.
   */
  readonly queued: boolean;
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

/** A handle for a note that could not be played (bad pitch): valid to hold, does nothing. */
function inertVoice(startTime: number): VoiceHandle {
  return { startTime, queued: false, stop: () => undefined };
}

class Voice implements VoiceHandle {
  stopAt = Infinity;
  done = false;
  /** Called once when the voice is finished with, however that happens. */
  onDone: (() => void) | null = null;
  constructor(
    private readonly engine: AudioEngine,
    readonly src: AudioBufferSourceNode,
    readonly gain: GainNode,
    readonly key: string,
    readonly startTime: number,
    /** When the source node starts: a little before `startTime` (the master chain's look-ahead). */
    private readonly nodeStart: number,
    readonly naturalEnd: number,
    private readonly defaultRelease: number,
    readonly queued: boolean,
  ) {}

  /** Free the voice: called when its source has ended, or when it is dropped unheard. */
  finish(): void {
    if (this.done) return;
    this.done = true;
    try {
      this.gain.disconnect();
    } catch {
      // already disconnected
    }
    const fn = this.onDone;
    this.onDone = null;
    fn?.();
  }

  /** Drop the note without a sound (it was requested before audio could start). */
  cancel(): void {
    if (this.done) return;
    this.stopAt = 0;
    try {
      this.src.onended = null;
      this.src.stop();
      this.src.disconnect();
    } catch {
      // already gone
    }
    this.finish();
  }

  stop(when?: number, release: number = this.defaultRelease): void {
    if (this.done) return;
    const t = this.engine.startTime(when);
    if (t >= this.stopAt) return;
    // Stopped before it starts: it must not make a sound at all (a fade would let its attack through).
    if (t <= this.startTime) {
      if (this.nodeStart > this.engine.now()) {
        this.cancel();
        return;
      }
      // Its first milliseconds are already inside the master chain: all that is left is to cut it short.
      release = 0.006;
    }
    this.stopAt = t;
    const node = this.engine.nodeTime(t);
    const tau = Math.max(0.001, finiteOr(release, this.defaultRelease) / 3);
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
  /** The last node of each instrument chain, so `dispose` can take the chain off the mixer. */
  private readonly outputs: AudioNode[] = [];
  private readonly byKey = new Map<string, Voice[]>();
  private readonly all = new Set<Voice>();
  /** The engine the chains in `inputs` were built on. */
  private chainEngine: AudioEngine | null = null;

  constructor(opts: GuitarSynthOptions = {}) {
    this.fixedEngine = opts.engine;
    this.busName = opts.bus ?? 'guitar';
    this.tone = normalizeTone(opts.tone, 'steel');
    this.mono = opts.mono ?? false;
    this.maxVoices = Math.max(1, Math.round(finiteOr(opts.maxVoices, 28)));
    this.pan = clamp(finiteOr(opts.pan, 0), -1, 1);
    const base = resolveTone(this.tone).instrument;
    if (INSTRUMENTS[base]) this.baseTone = base;
  }

  /** The engine this synth plays into. */
  get engine(): AudioEngine {
    return this.fixedEngine ?? getEngine();
  }

  /** False where there is no Web Audio at all: every method is then a silent no-op. */
  private get available(): boolean {
    return this.fixedEngine !== undefined || audioSupported();
  }

  /** The bus input for an instrument, building its filter / drive chain on first use. */
  private input(instrument: StringInstrument): GainNode {
    const engine = this.engine;
    if (this.chainEngine !== engine) {
      // The shared engine was closed and made again (hot reload, tests): the old chains belong to
      // a context that is gone.
      this.inputs.clear();
      this.outputs.length = 0;
      this.byKey.clear();
      this.all.clear();
      this.chainEngine = engine;
    }
    const hit = this.inputs.get(instrument);
    if (hit) return hit;
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
    const placed = pannedInput(ctx, engine.bus(this.busName), this.pan);
    out.connect(placed);
    this.outputs.push(out);
    // With panning, `placed` is this synth's own trim -> panner pair: take that off the bus too.
    if (placed !== engine.bus(this.busName)) this.outputs.push(placed);
    this.inputs.set(instrument, input);
    return input;
  }

  private bufferFor(midi: number, velocity: number, opts: PluckOptions): { buffer: AudioBuffer; instrument: StringInstrument; release: number } {
    const engine = this.engine;
    const tone = normalizeTone(opts.tone ?? this.tone, this.tone);
    const { instrument, articulation } = resolveTone(tone, opts.articulation, this.baseTone);
    const layer = nearestLayer(velocity);
    const brightness = Math.round(clamp(finiteOr(opts.brightness, 0), -1, 1) * BRIGHTNESS_STEPS) / BRIGHTNESS_STEPS;
    const note = Math.round(midi);
    const string = validString(opts.string, INSTRUMENTS[instrument].openStrings.length);
    const key = `pluck:${instrument}:${articulation}:${note}:${string ?? 0}:${layer}:${brightness}`;
    const buffer = engine.buffers.get(key, () =>
      renderRawPluck({ midi: note, sampleRate: engine.sampleRate, velocity: layer, tone: instrument, articulation, string, brightness }).samples,
    );
    return { buffer, instrument, release: INSTRUMENTS[instrument].release };
  }

  /**
   * Pluck one note. `when` is the audio-clock time it should be heard (default: now).
   * Fractional MIDI numbers and `opts.cents` bend the pitch; `a4` moves the whole instrument.
   * Never throws: a pitch out of range gives a silent handle, and any other nonsense (NaN times,
   * unknown tones, negative durations) is replaced by the default.
   */
  pluck(midi: number, when?: number, opts: PlayOptions = {}): VoiceHandle {
    if (!this.available) return inertVoice(0);
    const engine = this.engine;
    const ctx = engine.ctx;
    // Garbage in, silence out: a bad pitch must not reach the string model.
    if (!Number.isFinite(midi) || midi < 12 || midi > 115) return inertVoice(engine.startTime(when));
    const velocity = clamp(finiteOr(opts.velocity, 0.8), 0, 1);
    const { buffer, instrument, release } = this.bufferFor(midi, velocity, opts);
    // Taken after the buffer exists: rendering a note for the first time takes a few milliseconds.
    const start = engine.startTime(when);
    const node = engine.nodeTime(start);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Buffers are rendered at A4 = 440 on the equal-tempered grid; everything else is a rate change.
    const a4 = clamp(finiteOr(opts.a4, this.a4), 220, 880);
    const cents = clamp(finiteOr(opts.cents, 0), -2400, 2400) + (midi - Math.round(midi)) * 100 + 1200 * Math.log2(a4 / 440);
    if (cents !== 0) src.playbackRate.value = Math.pow(2, cents / 1200);
    const gain = ctx.createGain();
    gain.gain.value = velocityGain(velocity) * clamp(finiteOr(opts.gain, 1), 0, 8) * (opts.direction === 'up' ? -1 : 1);
    src.connect(gain);
    gain.connect(this.input(instrument));

    const string = validString(opts.string, INSTRUMENTS[instrument].openStrings.length);
    const key = this.mono ? 'mono' : string !== undefined ? `s${string}` : `m${Math.round(midi)}`;
    const voice = new Voice(engine, src, gain, key, start, node, start + buffer.duration, release, !engine.audible);
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

    voice.onDone = () => {
      this.all.delete(voice);
      const list = this.byKey.get(key);
      if (list) {
        const i = list.indexOf(voice);
        if (i >= 0) list.splice(i, 1);
        if (!list.length) this.byKey.delete(key);
      }
    };
    src.onended = () => voice.finish();
    const duration = finiteOr(opts.duration, NaN);
    if (duration >= 0 && !opts.letRing) voice.stop(start + Math.max(0.01, duration), release);
    engine.guard(() => voice.cancel());
    engine.touch(Math.min(voice.naturalEnd, voice.stopAt + 0.5) + 1.5);
    return voice;
  }

  /**
   * Strum a chord. `midis` are given from the lowest string to the highest; `direction` decides
   * which end is hit first. Returns one handle per note, in playing order.
   */
  strum(midis: readonly number[], when?: number, opts: PlayStrumOptions = {}): VoiceHandle[] {
    const plan = strumPlan(midis, opts).filter((p) => Number.isFinite(p.midi) && Number.isFinite(p.offset));
    if (!plan.length) return [];
    if (!this.available) return plan.map(() => inertVoice(0));
    const engine = this.engine;
    const note = (p: (typeof plan)[number]): PlayOptions => ({
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
    });
    // Render first, then look at the clock: the first time a chord is played its strings take a few
    // milliseconds each to render, and that must not smear the strum or make its first string late.
    for (const p of plan) {
      if (p.midi >= 12 && p.midi <= 115) this.bufferFor(p.midi, clamp(finiteOr(p.velocity, 0.8), 0, 1), note(p));
    }
    const lead = -Math.min(0, ...plan.map((p) => p.offset));
    // With `align`, the first string sounds before the given time; "now" cannot start in the past.
    const base = Math.max(engine.startTime(when), engine.now() + lead);
    const first = base - lead;
    if (opts.choke ?? true) {
      const used = new Set(plan.map((p) => (this.mono ? 'mono' : p.string !== undefined ? `s${p.string}` : `m${Math.round(p.midi)}`)));
      for (const [key, voices] of this.byKey) {
        if (used.has(key)) continue;
        for (const v of voices) if (v.startTime < first) v.stop(first, 0.07);
      }
    }
    return plan.map((p) => this.pluck(p.midi, base + p.offset, note(p)));
  }

  /** Damp whatever is ringing on one string (1 = thinnest) at `when`. */
  stopString(string: number, when?: number, release = 0.05): void {
    for (const v of [...(this.byKey.get(`s${string}`) ?? [])]) v.stop(when, release);
  }

  /**
   * Damp everything at `when` (default now). Notes that are scheduled but have not started by then
   * are cancelled outright, so nothing new is heard after a stop.
   */
  stopAll(when?: number, release = 0.06): void {
    if (!this.all.size) return;
    const t = this.engine.startTime(when);
    for (const v of [...this.all]) v.stop(t, release);
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
    if (!this.available) return;
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

  /** Stop everything and take the instrument chains off the mixer. The synth can be used again afterwards. */
  dispose(): void {
    for (const v of [...this.all]) v.cancel();
    for (const node of [...this.inputs.values(), ...this.outputs]) {
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
    this.inputs.clear();
    this.outputs.length = 0;
  }
}

/** A guitarist's string number that exists on the instrument, or undefined. */
function validString(string: number | undefined, strings: number): number | undefined {
  if (string === undefined || !Number.isFinite(string)) return undefined;
  const n = Math.round(string);
  return n >= 1 && n <= strings ? n : undefined;
}

// ---------------------------------------------------------------------------------------------
// Shared instances and one-line helpers
// ---------------------------------------------------------------------------------------------

let sharedGuitar: GuitarSynth | null = null;
let sharedBass: GuitarSynth | null = null;
/** The default tone last given to the shared guitar (null: none yet), to tell it apart from a tone a screen set. */
let appliedTone: ToneName | null = null;

/**
 * Keep the shared guitar on the learner's default tone (`soundDefaults()`, from Settings). A tone a
 * screen gave it itself (`getGuitar().tone = 'nylon'`) is left alone, as is a `tone` on the note.
 */
function followDefaultTone(guitar: GuitarSynth): void {
  const want = soundDefaults().guitarTone;
  if (guitar.tone === want) {
    appliedTone = want;
    return;
  }
  if (appliedTone !== null && guitar.tone !== appliedTone) return;
  guitar.tone = want;
  const base = resolveTone(want, undefined, guitar.baseTone).instrument;
  if (INSTRUMENTS[base]) guitar.baseTone = base;
  appliedTone = want;
}

/** The shared guitar synth on the live engine. Its tone follows the learner's Settings unless a screen set one. */
export function getGuitar(): GuitarSynth {
  const guitar = (sharedGuitar ??= new GuitarSynth());
  followDefaultTone(guitar);
  return guitar;
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
  appliedTone = null;
});

/**
 * The first notes of a session are the slowest to make: the string model has not been compiled by
 * the browser yet (the very first render takes several times longer than later ones), and nothing
 * is in the cache. So, once audio is unlocked, the open strings are rendered one by one in idle
 * moments. By the time the learner plucks a string, the code is warm and the likeliest notes exist.
 */
onAudioUnlocked(() => {
  const notes = [64, 59, 55, 50, 45, 40];
  const idle = (fn: () => void): void => {
    const ric = (globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof ric === 'function') ric(fn, { timeout: 2000 });
    else setTimeout(fn, 250);
  };
  let i = 0;
  const step = (): void => {
    if (!hasEngine()) return;
    try {
      void getGuitar().preload([{ midi: notes[i], string: i + 1 }]);
    } catch {
      return;
    }
    if (++i < notes.length) idle(step);
  };
  idle(step);
});
