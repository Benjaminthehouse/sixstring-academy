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
import { pitchCurve, slideGlide, slideGlideSeconds, type NoteExpression, type PitchCurve } from './expression';
import { renderRawPluck, strumPlan, type PluckOptions, type StrumOptions } from './pluck';
import { DRIVE_CURVE_RANGE, INSTRUMENTS, driveCurve, normalizeTone, resolveTone, velocityGain, type Articulation, type StringInstrument, type ToneName } from './tones';

/** How a note is reached from the one ringing on its string without a new pick stroke. */
export type Legato = 'hammer' | 'pull' | 'slide';

/** Options for one live note. */
export interface PlayOptions extends PluckOptions, NoteExpression {
  /** Seconds until the note is released. Omitted: it rings until replaced on its string or it dies away. */
  duration?: number;
  /** Ignore `duration` and let the note ring (tab "let ring"). */
  letRing?: boolean;
  /** Extra linear gain for this note (default 1). */
  gain?: number;
  /**
   * Sounded by the fretting hand from the note ringing on the same string (`string`, or else the
   * last note played): a hammer-on or pull-off changes that string's pitch with a soft finger
   * attack and no pick; a slide glides it to the new fret. With nothing ringing to carry on from, a
   * hammer-on or pull-off is a soft legato note and a slide slides in from below.
   */
  legato?: Legato;
  /** An accented stroke: harder and brighter (about 3 dB up). */
  accent?: boolean;
}

/** Options for a live strum. */
export interface PlayStrumOptions extends StrumOptions {
  duration?: number;
  letRing?: boolean;
  gain?: number;
  /** Damp strings that are still ringing but not part of this chord (default true). */
  choke?: boolean;
  /** An accented stroke: harder and brighter (about 3 dB up). */
  accent?: boolean;
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
/** An accent: velocity up by this factor (about 3 dB at the usual velocities) and half a step brighter. */
const ACCENT_VELOCITY = 1.3;
const ACCENT_BRIGHTNESS = 0.5;
/** Level of the finger's own attack on a hammer-on / pull-off, against a pick stroke of the same velocity. */
const LEGATO_ATTACK: Record<'hammer' | 'pull', number> = { hammer: 0.42, pull: 0.5 };
/** Level of a hammer-on or pull-off with nothing ringing to carry on from, against a pick stroke. */
const LEGATO_ALONE = 0.62;
/** Seconds between points of a sampled pitch curve (bends, vibrato, slides). */
const CURVE_STEP = 0.004;
/** A note that simply rings is drawn as if held this long (where a bend releases, how long vibrato lasts). */
const RINGING_LENGTH = 1.2;
/** Longest stretch of vibrato drawn for a note that rings without a duration. */
const MAX_RINGING_VIBRATO = 4;
/** Frames in a Web Audio render quantum: a buffer source's playback rate changes only on these boundaries. */
const RENDER_QUANTUM = 128;

/** A param's automation from `time` on is removed, and the value it had there is kept. False where the browser cannot. */
function holdAt(param: AudioParam, time: number): boolean {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(time);
    return true;
  }
  return false;
}

function nearestLayer(v: number): number {
  let best = VELOCITY_LAYERS[0];
  for (const l of VELOCITY_LAYERS) if (Math.abs(l - v) < Math.abs(best - v)) best = l;
  return best;
}

/** A handle for a note that could not be played (bad pitch): valid to hold, does nothing. */
function inertVoice(startTime: number): VoiceHandle {
  return { startTime, queued: false, stop: () => undefined };
}

/** A second source sounding as part of a voice: the finger attack of a hammer-on or pull-off. */
interface Layer {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

class Voice implements VoiceHandle {
  stopAt = Infinity;
  done = false;
  /** Called once when the voice is finished with, however that happens. */
  onDone: (() => void) | null = null;
  /** Extra sources that belong to this voice (stopped and faded with it). */
  readonly layers: Layer[] = [];
  /** Playback rate of the note the voice is playing now, before its own bends and vibrato. */
  baseRate = 1;
  /** Audio time the note it plays now was struck or reached (a hammer-on moves it on). */
  noteStart: number;
  /** Node time after which nothing is scheduled on the playback rate any more. */
  rateBusyUntil = 0;
  /** The slide-out fade of the current note, so a later note can take it back. */
  fadeAt: number | null = null;
  constructor(
    private readonly engine: AudioEngine,
    readonly src: AudioBufferSourceNode,
    readonly gain: GainNode,
    public key: string,
    readonly startTime: number,
    /** When the source node starts: a little before `startTime` (the master chain's look-ahead). */
    readonly nodeStart: number,
    readonly naturalEnd: number,
    private readonly defaultRelease: number,
    readonly queued: boolean,
    /** What was rendered: pitch of the buffer, instrument and articulation (a legato note continues only a compatible voice). */
    readonly bufferMidi: number,
    readonly instrument: StringInstrument,
    readonly articulation: Articulation,
  ) {
    this.noteStart = startTime;
  }

  /** Free the voice: called when its source has ended, or when it is dropped unheard. */
  finish(): void {
    if (this.done) return;
    this.done = true;
    for (const node of [this.gain, ...this.layers.map((l) => l.gain)]) {
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    }
    const fn = this.onDone;
    this.onDone = null;
    fn?.();
  }

  /** Drop the note without a sound (it was requested before audio could start). */
  cancel(): void {
    if (this.done) return;
    this.stopAt = 0;
    for (const src of [this.src, ...this.layers.map((l) => l.src)]) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // already gone
      }
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
    for (const { src, gain } of [{ src: this.src, gain: this.gain }, ...this.layers]) {
      try {
        gain.gain.cancelScheduledValues(node);
        gain.gain.setTargetAtTime(0, node, tau);
        src.stop(node + tau * 8 + 0.005);
      } catch {
        // The source may already have ended.
      }
    }
  }

  /**
   * Take back a stop that has not begun to fade yet, so a legato note can carry the string on.
   * False when it is too late (the fade is under way, or the voice is gone).
   */
  revive(): boolean {
    if (this.done) return false;
    if (this.stopAt === Infinity) return true;
    const node = this.engine.nodeTime(this.stopAt);
    if (node <= this.engine.now() + 0.002) return false;
    try {
      this.gain.gain.cancelScheduledValues(node);
      // A stop can be moved: the last call to stop() is the one that counts.
      this.src.stop(node + 3600);
    } catch {
      return false;
    }
    this.stopAt = Infinity;
    return true;
  }

  /** Let the finger-attack layers of the previous note die away quickly from node time `node`. */
  quietLayers(node: number): void {
    for (const l of this.layers.splice(0)) {
      try {
        l.gain.gain.cancelScheduledValues(node);
        l.gain.gain.setTargetAtTime(0, node, 0.006);
        l.src.stop(node + 0.06);
      } catch {
        // already ended
      }
    }
  }
}

/** The automation of a voice's playback rate for one note: its expression curve on top of `baseRate`. */
function applyCurve(src: AudioBufferSourceNode, baseRate: number, curve: PitchCurve | null, node0: number, engine: AudioEngine, setInitial: boolean): number {
  const rate = src.playbackRate;
  const initial = baseRate * Math.pow(2, (curve?.initial ?? 0) / 1200);
  const moves = !!curve && curve.end - curve.start >= 0.005;
  if (setInitial) rate.value = initial;
  // (A curve that starts at once sets its own first value: an event at the same moment could clash.)
  else if (!moves || curve!.start > 0.0005) rate.setValueAtTime(initial, node0);
  if (!moves || !curve) return node0;
  const span = curve.end - curve.start;
  const n = Math.max(2, Math.ceil(span / CURVE_STEP) + 1);
  const values = new Float32Array(n);
  for (let i = 0; i < n; i++) values[i] = baseRate * Math.pow(2, curve.at(curve.start + (span * i) / (n - 1)) / 1200);
  // Never in the past: a note asked for "now" has its curve start now as well.
  const from = Math.max(node0 + curve.start, engine.now());
  const dur = node0 + curve.end - from;
  if (dur > 0.002) rate.setValueCurveAtTime(values, from, dur);
  return node0 + curve.end;
}

/** The node time nearest `time` on which a buffer source's playback rate can change, minus a hair. */
function quantumTime(time: number, sampleRate: number): number {
  const q = RENDER_QUANTUM / sampleRate;
  return Math.max(0, Math.round(time / q) * q - 1e-7);
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

  private bufferFor(midi: number, velocity: number, opts: PluckOptions): { buffer: AudioBuffer; instrument: StringInstrument; articulation: Articulation; release: number } {
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
    return { buffer, instrument, articulation, release: INSTRUMENTS[instrument].release };
  }

  /** The voice key of a note: its string, else its pitch (or the one key of a mono synth). */
  private keyFor(string: number | undefined, midi: number): string {
    return this.mono ? 'mono' : string !== undefined ? `s${string}` : `m${Math.round(midi)}`;
  }

  /** Playback rate that turns a buffer rendered at `bufferMidi` (A4 = 440) into `midi` with `cents` and `a4`. */
  private rateFor(midi: number, bufferMidi: number, opts: PluckOptions): number {
    const a4 = clamp(finiteOr(opts.a4, this.a4), 220, 880);
    const cents = clamp(finiteOr(opts.cents, 0), -2400, 2400) + (midi - bufferMidi) * 100 + 1200 * Math.log2(a4 / 440);
    return Math.pow(2, cents / 1200);
  }

  /** Seconds a note is drawn as held, for where its bend releases and how long its vibrato lasts. */
  private static heldFor(opts: PlayOptions, bufferSeconds: number): number {
    const duration = finiteOr(opts.duration, NaN);
    if (duration >= 0) return Math.max(0.02, duration);
    // A ringing note: a bend still releases a moment later; vibrato carries on while it rings.
    return opts.vibrato ? Math.min(MAX_RINGING_VIBRATO, Math.max(RINGING_LENGTH, bufferSeconds * 0.7)) : RINGING_LENGTH;
  }

  /**
   * Pluck one note. `when` is the audio-clock time it should be heard (default: now).
   * Fractional MIDI numbers and `opts.cents` bend the pitch; `a4` moves the whole instrument.
   * `bend`, `vibrato`, `slideIn` and `slideOut` move the pitch while it sounds; `legato` reaches it
   * from the note ringing on the same string without a new pick stroke; `accent` plays it harder.
   * Never throws: a pitch out of range gives a silent handle, and any other nonsense (NaN times,
   * unknown tones, negative durations) is replaced by the default.
   */
  pluck(midi: number, when?: number, opts: PlayOptions = {}): VoiceHandle {
    if (!this.available) return inertVoice(0);
    const engine = this.engine;
    const ctx = engine.ctx;
    // Garbage in, silence out: a bad pitch must not reach the string model.
    if (!Number.isFinite(midi) || midi < 12 || midi > 115) return inertVoice(engine.startTime(when));
    let velocity = clamp(finiteOr(opts.velocity, 0.8), 0, 1);
    let brightness = opts.brightness;
    if (opts.accent) {
      velocity = Math.min(1, velocity * ACCENT_VELOCITY);
      brightness = clamp(finiteOr(brightness, 0) + ACCENT_BRIGHTNESS, -1, 1);
    }
    const legato: Legato | undefined = opts.legato === 'hammer' || opts.legato === 'pull' || opts.legato === 'slide' ? opts.legato : undefined;
    if (legato) {
      const carried = this.carryOn(midi, when, opts, legato, velocity);
      if (carried) return carried;
    }
    // Nothing to carry on from: a hammer-on or pull-off is a soft note of the fretting hand alone,
    // a slide slides in.
    const alone = legato === 'hammer' || legato === 'pull';
    const articulation: Articulation | undefined = alone && (opts.articulation === undefined || opts.articulation === 'normal') ? 'legato' : opts.articulation;
    const expression: NoteExpression = legato === 'slide' && !opts.slideIn ? { ...opts, slideIn: 'below' } : opts;
    const { buffer, instrument, articulation: played, release } = this.bufferFor(midi, velocity, { ...opts, brightness, articulation });
    // Taken after the buffer exists: rendering a note for the first time takes a few milliseconds.
    const start = engine.startTime(when);
    const node = engine.nodeTime(start);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Buffers are rendered at A4 = 440 on the equal-tempered grid; everything else is a rate change.
    const bufferMidi = Math.round(midi);
    const baseRate = this.rateFor(midi, bufferMidi, opts);
    const curve = pitchCurve(expression, GuitarSynth.heldFor(opts, buffer.duration));
    let rateBusyUntil = node;
    try {
      rateBusyUntil = applyCurve(src, baseRate, curve, node, engine, true);
    } catch {
      // Expression is a nicety: the note still plays at its pitch.
      src.playbackRate.value = baseRate;
    }
    const gain = ctx.createGain();
    const level = velocityGain(velocity) * clamp(finiteOr(opts.gain, 1), 0, 8) * (alone ? LEGATO_ALONE : 1) * (opts.direction === 'up' ? -1 : 1);
    gain.gain.value = level;
    src.connect(gain);
    gain.connect(this.input(instrument));

    const string = validString(opts.string, INSTRUMENTS[instrument].openStrings.length);
    const key = this.keyFor(string, midi);
    const voice = new Voice(engine, src, gain, key, start, node, start + buffer.duration, release, !engine.audible, bufferMidi, instrument, played);
    voice.baseRate = baseRate;
    voice.rateBusyUntil = rateBusyUntil;
    // Start first: a source can only be given a stop time once it has a start time.
    src.start(node);
    if (curve?.fadeFrom !== null && curve?.fadeFrom !== undefined) {
      // A slide out of the note: the finger lets the string go as it slides away.
      // (The ramp ends just before the note's release, which would otherwise cancel it.)
      voice.fadeAt = node + curve.fadeFrom;
      gain.gain.setValueAtTime(level, voice.fadeAt);
      gain.gain.linearRampToValueAtTime(level * 0.05, node + Math.max(curve.fadeFrom + 0.01, curve.end - 0.004));
    }

    // Per-string voice management: take over from earlier notes, yield to later ones.
    this.takeOver(voice, key, start);
    this.all.add(voice);
    if (this.all.size > this.maxVoices) {
      let oldest: Voice | null = null;
      for (const v of this.all) if (v !== voice && v.stopAt === Infinity && (!oldest || v.startTime < oldest.startTime)) oldest = v;
      oldest?.stop(start, 0.02);
    }

    voice.onDone = () => this.forget(voice);
    src.onended = () => voice.finish();
    const duration = finiteOr(opts.duration, NaN);
    if (duration >= 0 && !opts.letRing) voice.stop(start + Math.max(0.01, duration), release);
    engine.guard(() => voice.cancel());
    engine.touch(Math.min(voice.naturalEnd, voice.stopAt + 0.5) + 1.5);
    return voice;
  }

  /** Put a voice under its key, stopping the notes it takes over from and yielding to later ones. */
  private takeOver(voice: Voice, key: string, start: number): void {
    const mates = this.byKey.get(key) ?? [];
    for (const other of mates) {
      if (other === voice) continue;
      if (other.startTime <= start) other.stop(start, STEAL_FADE * 3);
      else voice.stop(other.startTime, STEAL_FADE * 3);
    }
    if (!mates.includes(voice)) mates.push(voice);
    this.byKey.set(key, mates);
  }

  /** Take a finished voice out of the books. */
  private forget(voice: Voice): void {
    this.all.delete(voice);
    const list = this.byKey.get(voice.key);
    if (list) {
      const i = list.indexOf(voice);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) this.byKey.delete(voice.key);
    }
  }

  /**
   * The voice a legato note at `start` would carry on: the note ringing on its string (or, without a
   * string, the last note played), if it is a plain pitched note of the same instrument, still
   * sounding then (or due to stop no earlier than just before), and with enough of its ring left.
   */
  private voiceToCarry(key: string, byString: boolean, start: number, instrument: StringInstrument, midi: number): Voice | null {
    const candidates = byString ? this.byKey.get(key) ?? [] : [...this.all];
    let best: Voice | null = null;
    for (const v of candidates) {
      if (v.done || v.startTime >= start - 0.005) continue;
      if (!byString && start - v.noteStart > 2) continue;
      if (!best || v.startTime > best.startTime) best = v;
    }
    if (!best) return null;
    if (best.instrument !== instrument || (best.articulation !== 'normal' && best.articulation !== 'legato')) return null;
    if (best.stopAt < start - 0.03) return null; // a rest in between: there is nothing left to carry on
    if (best.naturalEnd - start < 0.3) return null; // it has all but died away
    if (Math.abs(midi - best.bufferMidi) > 12) return null; // too far to stretch one string's sound
    return best;
  }

  /**
   * A hammer-on, pull-off or slide that carries on the voice ringing on its string: the same string
   * keeps sounding, its pitch steps (hammer-on, pull-off) or glides (slide) to the new note on the
   * audio clock, and a hammer-on or pull-off adds the soft attack of the finger. Null when there is
   * nothing to carry on (the caller then plays a fresh note).
   */
  private carryOn(midi: number, when: number | undefined, opts: PlayOptions, legato: Legato, velocity: number): VoiceHandle | null {
    const engine = this.engine;
    const tone = normalizeTone(opts.tone ?? this.tone, this.tone);
    const { instrument } = resolveTone(tone, opts.articulation, this.baseTone);
    const string = validString(opts.string, INSTRUMENTS[instrument].openStrings.length);
    const key = this.keyFor(string, midi);
    // Rendered before the clock is read, like every note.
    const attack = legato === 'slide' ? null : this.bufferFor(midi, velocity, { ...opts, articulation: 'legato', brightness: undefined });
    const start = engine.startTime(when);
    const prev = this.voiceToCarry(key, string !== undefined || this.mono, start, instrument, midi);
    if (!prev) return null;
    const node = engine.nodeTime(start);
    const rate = prev.src.playbackRate;
    const newBase = this.rateFor(midi, prev.bufferMidi, opts);
    // Where the new note's pitch movement begins on the old source.
    let from: number;
    let glide = 0;
    if (legato === 'slide') {
      glide = slideGlideSeconds(start - prev.noteStart);
      from = Math.max(node - glide, engine.now() + 0.001);
      glide = node - from;
    } else {
      from = Math.max(quantumTime(node, engine.sampleRate), engine.now());
    }
    // The previous note's automation (a bend still rising, vibrato) must be cut off where the new
    // note's begins, and its release taken back. Where the browser cannot cut automation short, or
    // the release has already begun, the caller plays a fresh note instead.
    const busy = prev.rateBusyUntil > from;
    if (busy && typeof rate.cancelAndHoldAtTime !== 'function') return null;
    if (prev.stopAt !== Infinity && engine.nodeTime(prev.stopAt) <= engine.now() + 0.002) return null;
    const curve = pitchCurve({ ...opts, slideIn: undefined }, GuitarSynth.heldFor(opts, prev.naturalEnd - start));
    const target = newBase * Math.pow(2, (curve?.initial ?? 0) / 1200);
    try {
      if (busy) holdAt(rate, from);
      if (!prev.revive()) return null;
      if (prev.fadeAt !== null) {
        // The previous note was sliding away: it does not, the string carries on instead.
        prev.gain.gain.cancelScheduledValues(Math.min(prev.fadeAt, from));
        prev.fadeAt = null;
      }
      prev.quietLayers(from);
      if (glide > 0.005) {
        const fromRate = prev.baseRate;
        const n = Math.max(2, Math.ceil(glide / CURVE_STEP) + 1);
        const values = new Float32Array(n);
        const span = 1200 * Math.log2(target / fromRate);
        for (let i = 0; i < n; i++) values[i] = fromRate * Math.pow(2, slideGlide(0, span, i / (n - 1)) / 1200);
        rate.setValueCurveAtTime(values, from + 1e-6, glide - 1e-6);
        prev.rateBusyUntil = applyCurve(prev.src, newBase, curve, node, engine, false);
      } else {
        prev.rateBusyUntil = applyCurve(prev.src, newBase, curve, from, engine, false);
      }
    } catch {
      // The browser would not take the automation: the caller plays a fresh note, which takes over
      // the string from this one.
      return null;
    }
    prev.baseRate = newBase;
    prev.noteStart = start;

    if (attack) {
      // The finger's own attack: a short, soft, pick-less note at the new pitch, dying away as the
      // string carries on.
      const ctx = engine.ctx;
      const src = ctx.createBufferSource();
      src.buffer = attack.buffer;
      const base = this.rateFor(midi, Math.round(midi), opts);
      try {
        applyCurve(src, base, curve, node, engine, true);
      } catch {
        src.playbackRate.value = base;
      }
      const g = ctx.createGain();
      const peak = velocityGain(velocity) * LEGATO_ATTACK[legato as 'hammer' | 'pull'] * clamp(finiteOr(opts.gain, 1), 0, 8);
      // It decays about as a freshly struck note does at first (the ringing string carries the rest).
      g.gain.setValueAtTime(peak, node);
      g.gain.setTargetAtTime(0, node + 0.03, 0.16);
      src.connect(g);
      g.connect(this.input(attack.instrument));
      src.start(node);
      src.stop(node + 1.2);
      prev.layers.push({ src, gain: g });
    }

    // The voice now plays the new note: under its key, released when the new note ends.
    if (prev.key !== key) {
      this.forget(prev);
      prev.key = key;
      this.all.add(prev);
    }
    this.takeOver(prev, key, start);
    const duration = finiteOr(opts.duration, NaN);
    if (duration >= 0 && !opts.letRing) prev.stop(start + Math.max(0.01, duration));
    engine.touch(Math.min(prev.naturalEnd + 2, prev.stopAt + 0.5) + 1.5);
    const queued = !engine.audible;
    return {
      startTime: start,
      queued,
      stop: (at?: number, release?: number) => prev.stop(at === undefined ? undefined : Math.max(at, start), release),
    };
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
    const accent = !!opts.accent;
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
      accent,
    });
    // Render first, then look at the clock: the first time a chord is played its strings take a few
    // milliseconds each to render, and that must not smear the strum or make its first string late.
    for (const p of plan) {
      if (p.midi < 12 || p.midi > 115) continue;
      let v = clamp(finiteOr(p.velocity, 0.8), 0, 1);
      let b = opts.brightness;
      if (accent) {
        v = Math.min(1, v * ACCENT_VELOCITY);
        b = clamp(finiteOr(b, 0) + ACCENT_BRIGHTNESS, -1, 1);
      }
      this.bufferFor(p.midi, v, { ...note(p), brightness: b });
    }
    const lead = -Math.min(0, ...plan.map((p) => p.offset));
    // With `align`, the first string sounds before the given time; "now" cannot start in the past.
    const base = Math.max(engine.startTime(when), engine.now() + lead);
    const first = base - lead;
    if (opts.choke ?? true) {
      const used = new Set(plan.map((p) => this.keyFor(p.string, p.midi)));
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
   * Render notes right now (synchronously), so that times read from the clock afterwards are not
   * eaten up by rendering: what a strum does for its strings, for a phrase or a lesson sound.
   */
  renderNow(notes: ReadonlyArray<{ midi: number; string?: number; velocity?: number; tone?: ToneName; articulation?: Articulation }>): void {
    if (!this.available) return;
    for (const n of notes) {
      if (!n || !Number.isFinite(n.midi) || n.midi < 12 || n.midi > 115) continue;
      this.bufferFor(n.midi, clamp(finiteOr(n.velocity, 0.8), 0, 1), { string: n.string, tone: n.tone, articulation: n.articulation });
    }
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
