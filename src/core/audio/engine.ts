/**
 * The audio engine: one lazily created AudioContext, the mixer buses, the master chain, the buffer
 * cache, and the housekeeping around them (unlocking on a user gesture, suspending when idle).
 *
 * Signal flow
 *
 *   voices ─► bus (guitar | bass | drums | keys | click | tone | drone | ui) ─┬─► master gain ─►
 *                                              └─ send ─► room reverb ─────────┘
 *   ─► compressor (gentle glue) ─► soft clipper (never exceeds full scale) ─► analyser tap ─► out
 *
 * Importing this module never touches Web Audio: the context is created on first use, and that
 * first use should be `unlockAudio()` inside a click/tap handler.
 *
 * An `AudioEngine` can also be built on an OfflineAudioContext (see `offline.ts`); every voice in
 * this folder takes the engine to play into, so tests can render the real graph.
 */
import { Rng, biquadCoeffs, finiteOr, limiterCurve, type BiquadSpec } from './dsp';
import type { TransportClock } from './transport';
import { VisualQueue } from './visual-sync';

/** Mixer buses. Each has its own volume and mute. */
export type BusName = 'guitar' | 'bass' | 'drums' | 'keys' | 'click' | 'tone' | 'drone' | 'ui';

/** All bus names. */
export const BUS_NAMES: readonly BusName[] = ['guitar', 'bass', 'drums', 'keys', 'click', 'tone', 'drone', 'ui'];

/** Base gain of each bus (the "mix"); user volumes multiply these. */
const BUS_GAIN: Record<BusName, number> = { guitar: 0.95, bass: 0.88, drums: 0.5, keys: 0.5, click: 0.7, tone: 0.6, drone: 0.4, ui: 0.7 };
/** How much of each bus feeds the room reverb. */
const BUS_SEND: Record<BusName, number> = { guitar: 0.2, bass: 0, drums: 0.07, keys: 0.14, click: 0, tone: 0.1, drone: 0.16, ui: 0.08 };

/** Where a bus sits in the stereo picture (-1 left .. +1 right); everything else is centred. */
const BUS_PAN: Partial<Record<BusName, number>> = { keys: -0.22 };

/** A stereo panner feeding `dest`, or `dest` itself when panning is unavailable or not wanted. */
export function pannedInput(ctx: BaseAudioContext, dest: AudioNode, pan: number): AudioNode {
  if (!pan || typeof ctx.createStereoPanner !== 'function') return dest;
  const amount = Math.max(-1, Math.min(1, pan));
  const p = ctx.createStereoPanner();
  p.pan.value = amount;
  p.connect(dest);
  // The panner is equal-power (-3 dB in the middle). Make up for it so that a panned sound is as
  // loud as a centred one when the two channels are summed: the mix must not change with placement.
  const theta = ((amount + 1) * Math.PI) / 4;
  const trim = ctx.createGain();
  trim.gain.value = 2 / (Math.cos(theta) + Math.sin(theta));
  trim.connect(p);
  return trim;
}

/** The DynamicsCompressorNode looks ahead by this long in every browser engine. */
const COMPRESSOR_LOOKAHEAD = 0.006;
/** Seconds of silence (with nothing holding the context) before it is suspended to save battery. */
const IDLE_SECONDS = 6;
/**
 * A sound requested while the context is not running waits this long for it to start, then is
 * dropped instead of being played late. With no user gesture nothing can start the context, so the
 * wait is short. A sound asked for inside a gesture, or on a context that has run before, is on its
 * way (a slow output device, a Bluetooth headset waking up) and is worth waiting for a little longer.
 */
const STALE_REQUEST_MS = 400;
const STALE_REQUEST_ACTIVE_MS = 1500;

/** What the audio context is doing, as far as a caller needs to know. */
export type AudioState =
  /** This environment has no Web Audio. Play functions do nothing. */
  | 'unsupported'
  /** No user gesture yet: sounds requested now are dropped unless a tap or key press follows at once. */
  | 'locked'
  /** Unlocked but asleep (idle, or interrupted by the system). The next sound wakes it up. */
  | 'suspended'
  | 'running';

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** True while the browser regards the page as "in a user gesture" (transient activation). */
function inUserGesture(): boolean {
  const ua = typeof navigator !== 'undefined' ? (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation : undefined;
  return !!ua && ua.isActive;
}

/** Construction options for {@link AudioEngine}. */
export interface EngineOptions {
  /** Room reverb on the instrument buses (default true). */
  reverb?: boolean;
  /** Bytes of rendered audio kept in the buffer cache (default 56 MB; 28 MB on low-memory devices). */
  cacheBytes?: number;
}

/** Stereo impulse response of a small, warm room, synthesised from decaying noise. */
export function makeRoomImpulse(sampleRate: number, seconds = 1.25, seed = 20240): [Float32Array, Float32Array] {
  const len = Math.round(seconds * sampleRate);
  const out: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  const pre = Math.round(0.012 * sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const rng = new Rng(seed + ch * 7919);
    const x = out[ch];
    // Highs die faster than lows, as in a furnished room: a bright layer with a short decay plus a
    // low-passed layer with the full decay.
    let lp = 0;
    const k = Math.exp((-2 * Math.PI * 2200) / sampleRate);
    let energy = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sampleRate;
      const n = rng.bipolar();
      lp = (1 - k) * n + k * lp;
      const rise = Math.min(1, t / 0.004);
      const v = rise * (0.5 * n * Math.exp(-t / (seconds / 14)) + 1.6 * lp * Math.exp(-t / (seconds / 6.9)));
      x[i] = v;
      energy += v * v;
    }
    const g = 1 / Math.sqrt(energy || 1);
    for (let i = 0; i < len; i++) x[i] *= g;
  }
  return out;
}

/** Settings of the master compressor ("gentle glue"), shared by the engine and by the probe that measures its start-up. */
function configureCompressor(comp: DynamicsCompressorNode): void {
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
}

/** How long a DynamicsCompressorNode takes to settle after it starts processing. */
const COMPRESSOR_SETTLE_SECONDS = 0.3;

type OfflineCtor = typeof OfflineAudioContext;

const startUpCurves = new Map<number, Promise<Float32Array | null>>();

/**
 * A DynamicsCompressorNode does not start at its resting gain: for the first fifth of a second of
 * its life the gain climbs from a third of it (measured in Chromium: 0.38 after 10 ms, 0.92 after
 * 50 ms, 1.53 from 200 ms on). The context starts with the first user gesture, and the first note
 * usually comes from that same gesture, so the very first sound of a session would have its attack
 * swallowed. This measures the climb in the browser that is running (a tiny offline render of the
 * same compressor) and returns the gain that undoes it, sampled over COMPRESSOR_SETTLE_SECONDS;
 * null where there is nothing to undo or no way to measure.
 */
function compressorStartUp(sampleRate: number): Promise<Float32Array | null> {
  const cached = startUpCurves.get(sampleRate);
  if (cached) return cached;
  const g = globalThis as typeof globalThis & { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  const Ctor = g.OfflineAudioContext ?? g.webkitOfflineAudioContext;
  const result = (async (): Promise<Float32Array | null> => {
    if (!Ctor) return null;
    try {
      const frames = Math.ceil(COMPRESSOR_SETTLE_SECONDS * 2 * sampleRate);
      const probe = new Ctor(1, frames, sampleRate);
      const level = 0.001; // far below the threshold: only the start-up behaviour is seen
      const dc = probe.createBuffer(1, frames, sampleRate);
      dc.getChannelData(0).fill(level);
      const src = probe.createBufferSource();
      src.buffer = dc;
      const comp = probe.createDynamicsCompressor();
      configureCompressor(comp);
      src.connect(comp);
      comp.connect(probe.destination);
      src.start(0);
      const out = (await probe.startRendering()).getChannelData(0);
      const settled = out[frames - 1];
      if (!(settled > 0)) return null;
      const points = 192;
      const curve = new Float32Array(points);
      let needed = false;
      for (let i = points - 1; i >= 0; i--) {
        const v = out[Math.min(frames - 1, Math.round(((i / (points - 1)) * COMPRESSOR_SETTLE_SECONDS) * sampleRate))];
        // Before the look-ahead has filled there is no output at all: hold the first real value.
        curve[i] = v > settled / 16 ? settled / v : i + 1 < points ? curve[i + 1] : 1;
        if (Math.abs(curve[i] - 1) > 0.02) needed = true;
      }
      curve[points - 1] = 1;
      return needed ? curve : null;
    } catch {
      return null;
    }
  })();
  startUpCurves.set(sampleRate, result);
  return result;
}

/** Curve for the master soft clipper (WaveShaper input range -2..+2). */
export const CLIPPER_RANGE = 2;

function clipperCurve(points = 2049): Float32Array {
  const c = new Float32Array(points);
  for (let i = 0; i < points; i++) c[i] = limiterCurve(((i / (points - 1)) * 2 - 1) * CLIPPER_RANGE);
  return c;
}

interface CacheEntry {
  buffer: AudioBuffer;
  bytes: number;
}

/** Rendered buffers by key, least recently used evicted first. */
export class BufferCache {
  private readonly map = new Map<string, CacheEntry>();
  private bytes = 0;
  constructor(private readonly ctx: BaseAudioContext, private limit: number) {}

  /** The cached buffer for `key`, rendering it with `render` on a miss. */
  get(key: string, render: () => Float32Array): AudioBuffer {
    const hit = this.map.get(key);
    if (hit) {
      // Re-insert to mark as most recently used.
      this.map.delete(key);
      this.map.set(key, hit);
      return hit.buffer;
    }
    const samples = render();
    const buffer = this.ctx.createBuffer(1, Math.max(1, samples.length), this.ctx.sampleRate);
    buffer.getChannelData(0).set(samples);
    const entry = { buffer, bytes: samples.length * 4 };
    this.map.set(key, entry);
    this.bytes += entry.bytes;
    for (const [k, e] of this.map) {
      if (this.bytes <= this.limit || k === key) break;
      this.map.delete(k);
      this.bytes -= e.bytes;
    }
    return buffer;
  }

  /** True when `key` is already rendered. */
  has(key: string): boolean {
    return this.map.has(key);
  }

  /** Bytes currently held and number of buffers. */
  get stats(): { bytes: number; count: number; limit: number } {
    return { bytes: this.bytes, count: this.map.size, limit: this.limit };
  }

  /** Drop everything. */
  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }
}

/**
 * Create a filter node with the response of `biquadCoeffs(spec)`, the filter the offline renderer
 * uses. A BiquadFilterNode computes the same cookbook coefficients (its Q is in dB for low-pass and
 * high-pass, and its shelves have the slope that q = 0.7071 gives here), so the live graph and the
 * offline renderer agree to about -100 dB.
 *
 * An IIRFilterNode fed the coefficients directly would agree to the last bit, but creating one costs
 * 25-60 ms of main-thread time in Chromium (it simulates the impulse response to find its tail), so
 * an instrument chain of ten filters froze the page for a third of a second the first time each
 * tone was played, and made that first note late.
 */
export function createFilterNode(ctx: BaseAudioContext, spec: BiquadSpec): AudioNode {
  const q = Math.max(0.05, spec.q ?? Math.SQRT1_2);
  const shelf = spec.type === 'lowshelf' || spec.type === 'highshelf';
  if (typeof ctx.createBiquadFilter === 'function' && !(shelf && Math.abs(q - Math.SQRT1_2) > 1e-6)) {
    const f = ctx.createBiquadFilter();
    f.type = spec.type;
    f.frequency.value = Math.max(1, Math.min(ctx.sampleRate * 0.49, spec.freq));
    f.Q.value = spec.type === 'lowpass' || spec.type === 'highpass' ? 20 * Math.log10(q) : q;
    f.gain.value = spec.gain ?? 0;
    return f;
  }
  // A shelf with a slope the built-in filter cannot do (none of the instruments has one).
  const c = biquadCoeffs(spec, ctx.sampleRate);
  return ctx.createIIRFilter([c.b0, c.b1, c.b2], [1, c.a1, c.a2]);
}

/** Connect a list of filters in series after `input`; returns the last node. */
export function chainFilters(ctx: BaseAudioContext, input: AudioNode, specs: readonly BiquadSpec[]): AudioNode {
  let node = input;
  for (const s of specs) {
    const f = createFilterNode(ctx, s);
    node.connect(f);
    node = f;
  }
  return node;
}

/** Level of the master output, read from the analyser tap. */
export interface OutputLevel {
  /** RMS of the last analysis frame, 0..1. */
  rms: number;
  /** Largest absolute sample of the last analysis frame. */
  peak: number;
}

/** The mixer and master chain on one audio context (live or offline). */
export class AudioEngine {
  readonly ctx: BaseAudioContext;
  /** True for an OfflineAudioContext. */
  readonly offline: boolean;
  readonly sampleRate: number;
  readonly buffers: BufferCache;
  /** Queue for callbacks that must run when a scheduled sound is actually heard. */
  readonly visual: VisualQueue;
  /** Delay of the master chain in seconds; `nodeTime` compensates for it. */
  readonly chainLatency = COMPRESSOR_LOOKAHEAD;
  /**
   * Resolves when the master chain is fully set up (the compressor's start-up has been measured and
   * compensated). Sound can be scheduled before that; offline renders wait for it before rendering.
   */
  readonly ready: Promise<void>;

  private readonly buses = new Map<BusName, GainNode>();
  private readonly busVolume = new Map<BusName, number>();
  private readonly busMuted = new Map<BusName, boolean>();
  private readonly masterGain: GainNode;
  private readonly tap: AudioNode;
  private analyser: AnalyserNode | null = null;
  private analyserData: Float32Array<ArrayBuffer> | null = null;
  private volume = 0.85;
  private mutedFlag = false;
  private busyUntil = 0;
  private holds = 0;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private unlocked = false;
  private disposed = false;
  private pending: Array<{ at: number; expires: number; cancel: () => void }> = [];
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private watching = false;
  private suspending = false;
  private activity = 0;
  /** Called once, the first time the context is found running (set for the shared engine). */
  onUnlocked: (() => void) | null = null;

  constructor(ctx: BaseAudioContext, opts: EngineOptions = {}) {
    this.ctx = ctx;
    this.offline = typeof (ctx as OfflineAudioContext).startRendering === 'function';
    this.sampleRate = ctx.sampleRate;
    const lowMemory = typeof navigator !== 'undefined' && ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
    this.buffers = new BufferCache(ctx, opts.cacheBytes ?? (lowMemory ? 28e6 : 56e6));
    this.visual = new VisualQueue(() => this.soundingNow());

    // Master chain.
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.volume * this.volume;
    const comp = ctx.createDynamicsCompressor();
    configureCompressor(comp);
    // Makes up for the compressor's start-up dip, so the first note of a session keeps its attack.
    const settle = ctx.createGain();
    const pre = ctx.createGain();
    pre.gain.value = 1 / CLIPPER_RANGE;
    const clip = ctx.createWaveShaper();
    clip.curve = clipperCurve() as Float32Array<ArrayBuffer>;
    this.masterGain.connect(comp);
    comp.connect(settle);
    settle.connect(pre);
    pre.connect(clip);
    clip.connect(ctx.destination);
    this.tap = clip;
    this.ready = compressorStartUp(ctx.sampleRate).then((curve) => {
      if (!curve || this.disposed) return;
      try {
        // The dip is over COMPRESSOR_SETTLE_SECONDS after the context starts; apply what is left of it.
        const now = ctx.currentTime;
        const from = Math.ceil((now / COMPRESSOR_SETTLE_SECONDS) * (curve.length - 1));
        if (from >= curve.length - 2) return;
        const start = Math.max(now, (from / (curve.length - 1)) * COMPRESSOR_SETTLE_SECONDS);
        settle.gain.setValueCurveAtTime(curve.subarray(from) as Float32Array<ArrayBuffer>, start, COMPRESSOR_SETTLE_SECONDS - start);
      } catch {
        // Without it the first 0.2 s of the session are a little soft, nothing worse.
      }
    });

    // Buses and reverb.
    let reverbIn: GainNode | null = null;
    if (opts.reverb !== false) {
      reverbIn = ctx.createGain();
      const conv = ctx.createConvolver();
      const [l, r] = makeRoomImpulse(ctx.sampleRate);
      const ir = ctx.createBuffer(2, l.length, ctx.sampleRate);
      ir.getChannelData(0).set(l);
      ir.getChannelData(1).set(r);
      conv.normalize = false;
      conv.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.9;
      reverbIn.connect(conv);
      conv.connect(wet);
      wet.connect(this.masterGain);
    }
    for (const name of BUS_NAMES) {
      const g = ctx.createGain();
      g.gain.value = BUS_GAIN[name];
      g.connect(pannedInput(ctx, this.masterGain, BUS_PAN[name] ?? 0));
      if (reverbIn && BUS_SEND[name] > 0) {
        const send = ctx.createGain();
        send.gain.value = BUS_SEND[name];
        g.connect(send);
        send.connect(reverbIn);
      }
      this.buses.set(name, g);
      this.busVolume.set(name, 1);
      this.busMuted.set(name, false);
    }
  }

  // --- time ------------------------------------------------------------------------------------

  /** The audio clock (AudioContext.currentTime). Schedule against this. */
  now(): number {
    return this.ctx.currentTime;
  }

  /** Seconds between the context producing a sample and it leaving the speakers, where reported. */
  get outputLatency(): number {
    const c = this.ctx as AudioContext;
    return (typeof c.outputLatency === 'number' && c.outputLatency > 0 ? c.outputLatency : c.baseLatency) || 0;
  }

  /**
   * Audio-clock time of the sound leaving the speakers right now. Uses the browser's output
   * timestamp where available (smooth between audio callbacks), else currentTime - outputLatency.
   */
  soundingNow(): number {
    const c = this.ctx as AudioContext;
    const current = c.currentTime;
    if (this.offline) return current;
    if (c.state === 'running' && typeof c.getOutputTimestamp === 'function' && typeof performance !== 'undefined') {
      const ts = c.getOutputTimestamp();
      if (ts && ts.contextTime && ts.performanceTime) {
        const t = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
        if (t <= current + 0.02 && t > current - 1) return t;
      }
    }
    return current - this.outputLatency;
  }

  /**
   * Convert "I want to hear it at `time`" into the time to start a source node, compensating the
   * master chain's delay. With no time: as soon as possible.
   */
  nodeTime(time?: number): number {
    const now = this.ctx.currentTime;
    if (time === undefined || !Number.isFinite(time)) return now;
    const t = time - this.chainLatency;
    return t > now ? t : now;
  }

  /**
   * The audio-clock time a sound asked for at `when` will really be heard: `when` itself if that is
   * a time in the future, otherwise now. NaN, Infinity and times in the past all mean "now".
   */
  startTime(when?: number): number {
    const now = this.ctx.currentTime;
    return when !== undefined && Number.isFinite(when) && when > now ? when : now;
  }

  /** A clock for a Transport running on this engine. */
  get clock(): TransportClock {
    return { now: () => this.now(), soundingNow: () => this.soundingNow(), hold: () => this.hold() };
  }

  // --- mixer -----------------------------------------------------------------------------------

  /** The input node of a bus (an unknown name gets the `ui` bus rather than an error). */
  bus(name: BusName): GainNode {
    return this.buses.get(name) ?? this.buses.get('ui')!;
  }

  private applyBus(name: BusName): void {
    const g = this.buses.get(name);
    if (!g) return;
    const v = this.busMuted.get(name) ? 0 : BUS_GAIN[name] * (this.busVolume.get(name) ?? 1);
    g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015);
  }

  /** Volume of one bus, 0..1.5 (1 = the default mix). Unknown buses and non-numbers are ignored. */
  setBusVolume(name: BusName, volume: number): void {
    if (!this.buses.has(name) || !Number.isFinite(volume)) return;
    this.busVolume.set(name, Math.max(0, Math.min(1.5, volume)));
    this.applyBus(name);
  }

  getBusVolume(name: BusName): number {
    return this.busVolume.get(name) ?? 1;
  }

  /** Mute or unmute one bus. */
  setBusMuted(name: BusName, muted: boolean): void {
    if (!this.buses.has(name)) return;
    this.busMuted.set(name, !!muted);
    this.applyBus(name);
  }

  isBusMuted(name: BusName): boolean {
    return this.busMuted.get(name) ?? false;
  }

  private applyMaster(): void {
    const v = this.mutedFlag ? 0 : this.volume * this.volume;
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015);
  }

  /** Master volume 0..1 (perceptual: the gain is its square). */
  get masterVolume(): number {
    return this.volume;
  }

  set masterVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, finiteOr(v, this.volume)));
    this.applyMaster();
  }

  get muted(): boolean {
    return this.mutedFlag;
  }

  set muted(m: boolean) {
    this.mutedFlag = !!m;
    this.applyMaster();
  }

  // --- analysis tap ----------------------------------------------------------------------------

  /** An AnalyserNode on the master output (after the limiter). Created on first use. */
  getAnalyser(fftSize = 2048): AnalyserNode {
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.smoothingTimeConstant = 0.6;
      this.tap.connect(this.analyser);
    }
    if (this.analyser.fftSize !== fftSize) this.analyser.fftSize = fftSize;
    return this.analyser;
  }

  /** RMS and peak of the most recent output frame. */
  level(): OutputLevel {
    const a = this.getAnalyser();
    if (!this.analyserData || this.analyserData.length !== a.fftSize) this.analyserData = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(this.analyserData);
    let sum = 0, peak = 0;
    for (let i = 0; i < this.analyserData.length; i++) {
      const v = this.analyserData[i];
      sum += v * v;
      if (v > peak) peak = v; else if (-v > peak) peak = -v;
    }
    return { rms: Math.sqrt(sum / this.analyserData.length), peak };
  }

  /** The last node before the destination, for custom taps (recorders, extra analysers). */
  get output(): AudioNode {
    return this.tap;
  }

  // --- power -----------------------------------------------------------------------------------

  /** Called by `unlockAudio` once the context has been resumed inside a user gesture. */
  markUnlocked(): void {
    this.noteUnlocked();
    this.wake();
  }

  private noteUnlocked(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      this.onUnlocked?.();
    } catch {
      // A warm-up hook must never get in the way of sound.
    }
  }

  /** True once the context has been unlocked by a user gesture. */
  get isUnlocked(): boolean {
    return this.unlocked || this.offline;
  }

  /** Note that sound is scheduled until `until` (audio time), so the context must stay awake. */
  touch(until: number): void {
    if (until > this.busyUntil) this.busyUntil = until;
    this.activity++;
    this.wake();
  }

  /**
   * Keep the context awake until the returned function is called (a running transport, a drone,
   * a microphone analyser sharing this context).
   */
  hold(): () => void {
    this.holds++;
    this.activity++;
    this.wake();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds = Math.max(0, this.holds - 1);
      this.touch(this.ctx.currentTime + 0.5);
    };
  }

  /** What the context is doing: `locked` until a user gesture, then `running` or `suspended`. */
  get state(): AudioState {
    if (this.offline) return 'running';
    const c = this.ctx as AudioContext;
    if (c.state === 'running') return 'running';
    return this.unlocked ? 'suspended' : 'locked';
  }

  /** True when a sound scheduled now is heard now (the context is running and staying that way). */
  get audible(): boolean {
    return this.offline || ((this.ctx as AudioContext).state === 'running' && !this.suspending);
  }

  private wake(): void {
    if (this.offline || this.disposed) return;
    const c = this.ctx as AudioContext;
    if (c.state === 'closed') return;
    // A suspend is in flight: asking to resume now could be overtaken by it. `checkIdle` looks at
    // `activity` when the suspend has landed and starts the context again.
    if (this.suspending) return;
    if (c.state === 'running') this.noteUnlocked(); // autoplay was allowed, or someone else resumed it
    if (c.state !== 'running') {
      // Asking to resume is harmless outside a user gesture and is all it takes inside one, so a
      // Play button that calls pluck() directly works even if nobody called unlockAudio() first.
      void c.resume().then(() => {
        if (c.state === 'running' && !this.unlocked) this.markUnlocked();
      }).catch(() => undefined);
    }
    if (this.idleTimer === null && this.unlocked) {
      this.idleTimer = setInterval(() => this.checkIdle(), 2000);
    }
  }

  /**
   * Register a sound that was requested while the context is not running. If the context does not
   * start within a moment (nobody has clicked yet), `cancel` is called so that old sounds do not
   * all burst out when audio is finally unlocked. The cancelling is done by a timer, while the
   * context is still silent: waiting for the context's own `statechange` event would let every
   * stale sound play for the tens of milliseconds that event takes to arrive.
   */
  guard(cancel: () => void): void {
    if (this.offline) return;
    const c = this.ctx as AudioContext;
    if (c.state === 'running' && !this.suspending) return;
    const at = nowMs();
    this.pending.push({ at, expires: at + (this.unlocked || inUserGesture() ? STALE_REQUEST_ACTIVE_MS : STALE_REQUEST_MS), cancel });
    if (this.pending.length > 256) {
      try {
        this.pending.shift()?.cancel();
      } catch {
        // already gone
      }
    }
    if (!this.watching) {
      this.watching = true;
      c.addEventListener('statechange', () => this.settlePending());
    }
    this.armPendingTimer();
  }

  /** Number of sounds waiting for the context to start (for tests and diagnostics). */
  get pendingSounds(): number {
    return this.pending.length;
  }

  private armPendingTimer(): void {
    if (this.pendingTimer !== null || !this.pending.length) return;
    const wait = Math.max(10, this.pending[0].expires - nowMs() + 15);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      this.settlePending();
    }, wait);
  }

  /**
   * Sort out the sounds that were requested while the context was not running: the ones that have
   * waited too long are cancelled (normally by the timer, while the context is still silent), and
   * once the context runs the rest are playing and need no more attention.
   */
  private settlePending(): void {
    if (!this.pending.length) return;
    const running = (this.ctx as AudioContext).state === 'running';
    const now = nowMs();
    const keep: typeof this.pending = [];
    for (const p of this.pending) {
      if (now < p.expires) {
        if (!running) keep.push(p);
        continue;
      }
      try {
        p.cancel();
      } catch {
        // already gone
      }
    }
    this.pending = keep;
    this.armPendingTimer();
  }

  private checkIdle(): void {
    const c = this.ctx as AudioContext;
    if (c.state !== 'running' || this.suspending) return;
    if (this.holds > 0 || c.currentTime < this.busyUntil + IDLE_SECONDS) return;
    if (this.idleTimer !== null) clearInterval(this.idleTimer);
    this.idleTimer = null;
    // suspend() takes a moment to land. A sound requested in that moment sees a running context,
    // so remember what was going on and start again if anything was asked for meanwhile.
    this.suspending = true;
    const seen = this.activity;
    const settle = (): void => {
      this.suspending = false;
      if (this.disposed) return;
      if (this.activity !== seen || this.holds > 0) this.wake();
    };
    c.suspend().then(settle, settle);
  }

  /** Release timers. The caller closes the context. */
  dispose(): void {
    this.disposed = true;
    if (this.idleTimer !== null) clearInterval(this.idleTimer);
    this.idleTimer = null;
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    this.pending = [];
    this.visual.clear();
    this.buffers.clear();
  }
}

// ---------------------------------------------------------------------------------------------
// The shared live engine
// ---------------------------------------------------------------------------------------------

let shared: AudioEngine | null = null;
let silentAudio: HTMLAudioElement | null = null;
let autoUnlockInstalled = false;

type AudioContextCtor = typeof AudioContext;

function contextCtor(): AudioContextCtor | null {
  const g = globalThis as typeof globalThis & { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** True when this environment has Web Audio at all. */
export function audioSupported(): boolean {
  return contextCtor() !== null;
}

/** True once the shared engine exists (something has already asked for sound). */
export function hasEngine(): boolean {
  return shared !== null;
}

/**
 * The shared engine, created on first call. Creating it does not start audio: browsers keep the
 * context suspended until `unlockAudio()` runs inside a user gesture.
 */
export function getEngine(): AudioEngine {
  if (shared) return shared;
  const Ctor = contextCtor();
  if (!Ctor) throw new Error('Web Audio is not available in this environment');
  const ctx = new Ctor({ latencyHint: 'interactive' });
  const engine = new AudioEngine(ctx);
  shared = engine;
  applyWanted(engine);
  engine.onUnlocked = () => {
    for (const fn of [...unlockHooks]) {
      try {
        fn();
      } catch {
        // ignore
      }
    }
  };
  const onState = () => {
    // iOS interrupts the context for calls and when the page is backgrounded; pick it up again.
    if (shared && shared.isUnlocked && (ctx.state as string) === 'interrupted') void ctx.resume().catch(() => undefined);
  };
  ctx.addEventListener?.('statechange', onState);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && shared && shared.isUnlocked && (ctx.state as string) === 'interrupted') void ctx.resume().catch(() => undefined);
    });
  }
  return shared;
}

/** The shared AudioContext (creates the engine if needed). Other modules may analyse through it. */
export function getAudioContext(): AudioContext {
  return getEngine().ctx as AudioContext;
}

/** A tiny silent WAV as a data URI, for the iOS mute-switch workaround. */
function silentWavUri(): string {
  const bytes = new Uint8Array(44 + 800);
  const v = new DataView(bytes.buffer);
  const put = (o: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); v.setUint32(4, 36 + 800, true); put(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); put(36, 'data'); v.setUint32(40, 800, true);
  bytes.fill(128, 44);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

/**
 * Start (or restart) audio. Call it synchronously from a click / tap / key handler before the first
 * sound. Safe to call on every gesture. Resolves true when the context is running.
 *
 * Handles the iOS quirks: the context must be resumed inside the gesture, a buffer has to be played
 * in that same gesture on older versions, and with the ring/silent switch on "silent" Web Audio is
 * muted unless the page's audio session is "playback" (set directly where supported, otherwise
 * coaxed by a silent looping <audio> element).
 */
export async function unlockAudio(): Promise<boolean> {
  if (!audioSupported()) return false;
  const engine = getEngine();
  const ctx = engine.ctx as AudioContext;
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    else if (isIOS() && typeof Audio !== 'undefined') {
      if (!silentAudio) {
        silentAudio = new Audio(silentWavUri());
        silentAudio.loop = true;
        silentAudio.setAttribute('playsinline', '');
      }
      void silentAudio.play().catch(() => undefined);
    }
  } catch {
    // Best effort only.
  }
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // Not fatal: resume() below is what matters on current browsers.
  }
  let resumed: Promise<void> | undefined;
  try {
    if (ctx.state !== 'running') resumed = ctx.resume();
  } catch {
    resumed = undefined;
  }
  if (resumed) {
    // Outside a gesture resume() can stay pending for ever; do not hang the caller.
    await Promise.race([resumed.catch(() => undefined), new Promise<void>((r) => setTimeout(r, 1200))]);
  }
  const running = ctx.state === 'running';
  if (running) engine.markUnlocked();
  return running;
}

/**
 * Unlock audio on the first pointer or key press anywhere on the page, and again after the browser
 * interrupts it. Returns a function that removes the listeners.
 */
export function installAudioUnlock(target: EventTarget | undefined = typeof window !== 'undefined' ? window : undefined): () => void {
  if (!target || autoUnlockInstalled) return () => undefined;
  autoUnlockInstalled = true;
  const handler = () => {
    if (!shared || (shared.ctx as AudioContext).state !== 'running' || !shared.isUnlocked) void unlockAudio();
  };
  const events = ['pointerdown', 'touchend', 'keydown'];
  for (const e of events) target.addEventListener(e, handler, { passive: true, capture: true });
  return () => {
    for (const e of events) target.removeEventListener(e, handler, { capture: true });
    autoUnlockInstalled = false;
  };
}

/** True when the shared context exists and is running. */
export function audioRunning(): boolean {
  return shared !== null && (shared.ctx as AudioContext).state === 'running';
}

/**
 * What a sound requested right now would do: `running` plays it; `suspended` wakes the context
 * and plays it; `locked` (no user gesture yet) drops it unless a tap or key press follows at once;
 * `unsupported` means there is no Web Audio here. Never creates the context.
 */
export function audioState(): AudioState {
  if (!audioSupported()) return 'unsupported';
  return shared ? shared.state : 'locked';
}

/** Current time of the shared audio clock (0 before any sound has been requested). */
export function audioNow(): number {
  return shared ? shared.now() : 0;
}

/** Audio-clock time of what is being heard right now (latency compensated). */
export function audioSoundingNow(): number {
  return shared ? shared.soundingNow() : 0;
}

/** A volume or mute set before the engine exists is kept and applied when it is created. */
const wanted: { volume?: number; muted?: boolean; busVolume: Map<BusName, number>; busMuted: Map<BusName, boolean> } = { busVolume: new Map(), busMuted: new Map() };

function applyWanted(engine: AudioEngine): void {
  if (wanted.volume !== undefined) engine.masterVolume = wanted.volume;
  if (wanted.muted !== undefined) engine.muted = wanted.muted;
  for (const [bus, v] of wanted.busVolume) engine.setBusVolume(bus, v);
  for (const [bus, m] of wanted.busMuted) engine.setBusMuted(bus, m);
}

/**
 * Master volume 0..1 of the shared engine. Does not create the audio context: called before any
 * sound has been asked for (settings applied at start-up), the value is remembered for later.
 */
export function setMasterVolume(volume: number): void {
  if (!Number.isFinite(volume)) return;
  wanted.volume = Math.max(0, Math.min(1, volume));
  if (shared) shared.masterVolume = volume;
}

export function getMasterVolume(): number {
  return shared ? shared.masterVolume : wanted.volume ?? 0.85;
}

/** Mute or unmute everything. Like `setMasterVolume`, it does not create the audio context. */
export function setMuted(muted: boolean): void {
  wanted.muted = !!muted;
  if (shared) shared.muted = !!muted;
}

export function isMuted(): boolean {
  return shared ? shared.muted : wanted.muted ?? false;
}

/** Volume of one bus of the shared engine (1 = default mix). Remembered if the engine does not exist yet. */
export function setBusVolume(bus: BusName, volume: number): void {
  if (!BUS_NAMES.includes(bus) || !Number.isFinite(volume)) return;
  wanted.busVolume.set(bus, volume);
  shared?.setBusVolume(bus, volume);
}

/** Mute one bus of the shared engine. Remembered if the engine does not exist yet. */
export function setBusMuted(bus: BusName, muted: boolean): void {
  if (!BUS_NAMES.includes(bus)) return;
  wanted.busMuted.set(bus, !!muted);
  shared?.setBusMuted(bus, !!muted);
}

/** AnalyserNode on the shared master output, for visualisers. */
export function getAnalyser(fftSize?: number): AnalyserNode {
  return getEngine().getAnalyser(fftSize);
}

/** RMS and peak of the shared output right now (zeros before audio has started). */
export function getOutputLevel(): OutputLevel {
  return shared ? shared.level() : { rms: 0, peak: 0 };
}

/**
 * Run `fn` when the sound scheduled at audio time `time` is actually heard: the way to keep
 * visuals in step with scheduled notes. Returns a function that cancels it (a no-op once it has
 * run): call it when the sound is stopped or the screen unmounts.
 */
export function scheduleVisual(time: number, fn: () => void): () => void {
  if (typeof fn !== 'function') return () => undefined;
  if (!audioSupported()) {
    // No audio clock to wait for: as soon as possible is as close as it gets.
    const id = setTimeout(fn, 0);
    return () => clearTimeout(id);
  }
  return getEngine().visual.add(time, fn);
}

/** Seconds on a plain wall clock, for environments without Web Audio. */
function wallClock(): number {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

/**
 * A transport clock on the shared engine that does not create the context until it is read.
 * Where there is no Web Audio at all it falls back to the wall clock, so a metronome or a song
 * cursor still moves (silently) instead of throwing.
 */
export const engineClock: TransportClock = {
  now: () => (audioSupported() ? getEngine().now() : wallClock()),
  soundingNow: () => (audioSupported() ? getEngine().soundingNow() : wallClock()),
  hold: () => (audioSupported() ? getEngine().hold() : () => undefined),
};

const closeHooks: Array<() => void> = [];
const unlockHooks: Array<() => void> = [];

/** Take `fn` out of a list of hooks (once). */
function unhook(list: Array<() => void>, fn: () => void): () => void {
  return () => {
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}

/**
 * Run `fn` when the shared engine first has a running context (after the first user gesture).
 * For work that is better done before the first note is asked for, such as warming caches.
 * Returns a function that unregisters it: a screen that goes away before the first tap calls it.
 */
export function onAudioUnlocked(fn: () => void): () => void {
  if (typeof fn !== 'function') return () => undefined;
  unlockHooks.push(fn);
  return unhook(unlockHooks, fn);
}

/** Run `fn` whenever the shared engine is closed, so holders of its nodes can let go of them. Returns an unsubscribe function. */
export function onAudioClosed(fn: () => void): () => void {
  if (typeof fn !== 'function') return () => undefined;
  closeHooks.push(fn);
  return unhook(closeHooks, fn);
}

/** Close the shared context and forget it (tests, hot reload). */
export async function closeAudio(): Promise<void> {
  const e = shared;
  shared = null;
  for (const fn of [...closeHooks]) fn();
  if (!e) return;
  e.dispose();
  try {
    await (e.ctx as AudioContext).close();
  } catch {
    // Already closed.
  }
}

// A hot update of this module would otherwise leave the old context running beside the new one.
if (import.meta.hot) import.meta.hot.dispose(() => void closeAudio());
