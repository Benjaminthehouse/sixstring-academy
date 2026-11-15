/**
 * A strict stand-in for the Web Audio API, for unit tests of the live engine in Node.
 *
 * It does no signal processing. It records what the engine asks for and is as unforgiving as a real
 * browser about the things that make a real browser throw: a non-finite number on an AudioParam or
 * a start time, a source started twice, a stop before a start. Time is advanced by hand with
 * `advance()`, which also fires `onended` for sources whose time has come.
 *
 * Test support only: nothing in the app imports this file.
 */

function finite(label: string, ...values: number[]): void {
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${label}: non-finite value ${String(v)}`);
  }
}

/** A recorded automation call. */
export interface ParamEvent {
  kind: 'set' | 'ramp' | 'target' | 'curve' | 'cancel' | 'hold';
  value: number;
  time: number;
}

/** AudioParam that remembers its automation and rejects NaN. */
export class MockParam {
  events: ParamEvent[] = [];
  private v: number;
  constructor(value = 0) {
    this.v = value;
  }
  get value(): number {
    return this.v;
  }
  set value(v: number) {
    finite('AudioParam.value', v);
    this.v = v;
  }
  setValueAtTime(v: number, t: number): this {
    finite('setValueAtTime', v, t);
    this.events.push({ kind: 'set', value: v, time: t });
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    finite('linearRampToValueAtTime', v, t);
    this.events.push({ kind: 'ramp', value: v, time: t });
    return this;
  }
  setTargetAtTime(v: number, t: number, tau: number): this {
    finite('setTargetAtTime', v, t, tau);
    if (tau < 0) throw new RangeError('setTargetAtTime: negative time constant');
    this.events.push({ kind: 'target', value: v, time: t });
    return this;
  }
  setValueCurveAtTime(values: Float32Array, t: number, d: number): this {
    finite('setValueCurveAtTime', t, d);
    if (values.length < 2 || d <= 0) throw new RangeError('setValueCurveAtTime: bad curve');
    this.events.push({ kind: 'curve', value: values[values.length - 1], time: t });
    return this;
  }
  cancelScheduledValues(t: number): this {
    finite('cancelScheduledValues', t);
    this.events = this.events.filter((e) => e.time < t);
    this.events.push({ kind: 'cancel', value: 0, time: t });
    return this;
  }
  cancelAndHoldAtTime(t: number): this {
    finite('cancelAndHoldAtTime', t);
    this.events.push({ kind: 'hold', value: 0, time: t });
    return this;
  }
}

let nextId = 1;

/** AudioNode that tracks its connections. */
export class MockNode {
  readonly id = nextId++;
  readonly kind: string;
  readonly ctx: MockContext;
  outputs: Array<MockNode | MockParam> = [];
  constructor(ctx: MockContext, kind: string) {
    this.ctx = ctx;
    this.kind = kind;
    ctx.created.push(this);
  }
  connect<T extends MockNode | MockParam>(dest: T): T {
    if (!dest) throw new TypeError('connect: no destination');
    if (dest instanceof MockNode && dest.ctx !== this.ctx) throw new Error('InvalidAccessError: cannot connect to a node of another context');
    if (this.ctx.state === 'closed') throw new Error('InvalidStateError: the context is closed');
    this.outputs.push(dest);
    return dest;
  }
  disconnect(dest?: MockNode | MockParam): void {
    this.outputs = dest ? this.outputs.filter((o) => o !== dest) : [];
  }
  /** True when a path of connections leads from this node to the context's destination. */
  reachesDestination(seen = new Set<MockNode>()): boolean {
    if (this === this.ctx.destination) return true;
    if (seen.has(this)) return false;
    seen.add(this);
    return this.outputs.some((o) => o instanceof MockNode && o.reachesDestination(seen));
  }
}

/** A buffer source or an oscillator. */
export class MockSource extends MockNode {
  buffer: MockBuffer | null = null;
  playbackRate = new MockParam(1);
  frequency = new MockParam(440);
  offset = new MockParam(1);
  detune = new MockParam(0);
  type = 'sine';
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  ended = false;
  onended: (() => void) | null = null;
  start(when = 0): void {
    finite('start', when);
    if (when < 0) throw new RangeError('start: negative time');
    if (this.startedAt !== null) throw new Error('InvalidStateError: cannot call start more than once');
    this.startedAt = Math.max(when, this.ctx.currentTime);
    this.ctx.sources.add(this);
  }
  stop(when = 0): void {
    finite('stop', when);
    if (when < 0) throw new RangeError('stop: negative time');
    if (this.startedAt === null) throw new Error('InvalidStateError: cannot call stop without calling start first');
    this.stoppedAt = Math.max(when, this.ctx.currentTime);
  }
  setPeriodicWave(): void {
    this.type = 'custom';
  }
  /** When this source falls silent by itself or by stop(), whichever comes first. */
  get endTime(): number {
    if (this.startedAt === null) return Infinity;
    const natural = this.buffer ? this.startedAt + this.buffer.duration / Math.max(1e-6, this.playbackRate.value) : Infinity;
    return Math.min(natural, this.stoppedAt ?? Infinity);
  }
}

/** AudioBuffer with real sample storage. */
export class MockBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly data: Float32Array[];
  constructor(channels: number, length: number, sampleRate: number) {
    if (!(length > 0) || !(sampleRate > 0) || !(channels > 0)) throw new RangeError('createBuffer: bad size');
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(c: number): Float32Array {
    return this.data[c];
  }
}

type Listener = () => void;

/** AudioContext: a clock you turn by hand and a state you control. */
export class MockContext {
  sampleRate: number;
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' | 'interrupted' = 'suspended';
  baseLatency = 0.01;
  outputLatency = 0.02;
  created: MockNode[] = [];
  sources = new Set<MockSource>();
  /** When false, resume() stays pending, as it does before the first user gesture. */
  allowResume = true;
  /** When set, suspend() only lands when the test calls `landSuspend()`. */
  holdSuspend = false;
  resumeCalls = 0;
  suspendCalls = 0;
  readonly destination: MockNode;
  private listeners = new Map<string, Set<Listener>>();
  private pendingSuspend: Array<() => void> = [];

  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.destination = new MockNode(this, 'destination');
  }

  addEventListener(type: string, fn: Listener): void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }
  private setState(state: MockContext['state']): void {
    if (this.state === state) return;
    this.state = state;
    for (const fn of [...(this.listeners.get('statechange') ?? [])]) fn();
  }

  resume(): Promise<void> {
    this.resumeCalls++;
    if (!this.allowResume) return new Promise<void>(() => undefined);
    return Promise.resolve().then(() => this.setState('running'));
  }
  suspend(): Promise<void> {
    this.suspendCalls++;
    if (this.holdSuspend) return new Promise<void>((resolve) => this.pendingSuspend.push(() => { this.setState('suspended'); resolve(); }));
    return Promise.resolve().then(() => this.setState('suspended'));
  }
  /** Let a held suspend() take effect. */
  landSuspend(): void {
    for (const fn of this.pendingSuspend.splice(0)) fn();
  }
  /** The user gesture arrives: resume() calls made from now on succeed, and the context starts. */
  unlock(): void {
    this.allowResume = true;
    this.setState('running');
  }
  close(): Promise<void> {
    this.setState('closed');
    return Promise.resolve();
  }

  /** Move the clock forward (only while running) and end the sources whose time has come. */
  advance(seconds: number): void {
    if (this.state !== 'running') return;
    this.currentTime += seconds;
    for (const s of [...this.sources]) {
      if (s.endTime <= this.currentTime) {
        this.sources.delete(s);
        s.ended = true;
        s.onended?.();
      }
    }
  }

  /** Sources that have been started and have not ended yet. */
  get liveSources(): MockSource[] {
    return [...this.sources];
  }
  count(kind: string): number {
    return this.created.filter((n) => n.kind === kind).length;
  }

  private param(node: MockNode, names: Record<string, number>): MockNode {
    for (const [k, v] of Object.entries(names)) (node as unknown as Record<string, MockParam>)[k] = new MockParam(v);
    return node;
  }
  createGain(): MockNode {
    return this.param(new MockNode(this, 'gain'), { gain: 1 });
  }
  createStereoPanner(): MockNode {
    return this.param(new MockNode(this, 'panner'), { pan: 0 });
  }
  createBiquadFilter(): MockNode {
    const n = this.param(new MockNode(this, 'biquad'), { frequency: 350, Q: 1, gain: 0, detune: 0 });
    (n as unknown as { type: string }).type = 'lowpass';
    return n;
  }
  createIIRFilter(feedforward: number[], feedback: number[]): MockNode {
    finite('createIIRFilter', ...feedforward, ...feedback);
    return new MockNode(this, 'iir');
  }
  createDynamicsCompressor(): MockNode {
    return this.param(new MockNode(this, 'compressor'), { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 });
  }
  createWaveShaper(): MockNode {
    const n = new MockNode(this, 'shaper');
    (n as unknown as { curve: Float32Array | null; oversample: string }).curve = null;
    return n;
  }
  createConvolver(): MockNode {
    const n = new MockNode(this, 'convolver');
    (n as unknown as { buffer: MockBuffer | null; normalize: boolean }).buffer = null;
    return n;
  }
  createAnalyser(): MockNode {
    const n = new MockNode(this, 'analyser');
    Object.assign(n, { fftSize: 2048, smoothingTimeConstant: 0.8, getFloatTimeDomainData: (a: Float32Array) => a.fill(0) });
    return n;
  }
  createChannelMerger(): MockNode {
    return new MockNode(this, 'merger');
  }
  createBuffer(channels: number, length: number, sampleRate: number): MockBuffer {
    return new MockBuffer(channels, length, sampleRate);
  }
  createBufferSource(): MockSource {
    return new MockSource(this, 'bufferSource');
  }
  createOscillator(): MockSource {
    return new MockSource(this, 'oscillator');
  }
  createConstantSource(): MockSource {
    return new MockSource(this, 'constant');
  }
  createPeriodicWave(real: Float32Array, imag: Float32Array): { real: Float32Array; imag: Float32Array } {
    finite('createPeriodicWave', ...real, ...imag);
    return { real, imag };
  }
}

/** The mock typed as the real thing, for handing to the engine. */
export function asAudioContext(ctx: MockContext): AudioContext {
  return ctx as unknown as AudioContext;
}
