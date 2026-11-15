/**
 * Test helpers for the tuner session: a stand-in for the microphone pipeline that replays the
 * events the real engine produces for synthetic audio. Used by the unit tests only.
 */
import {
  EventHub,
  PitchEngine,
  concat,
  pluckedString,
  silence,
  type EngineConfigPatch,
  type PitchEvent,
  type PitchTrackerOptions,
  type TrackerFault,
  type TrackerInfo,
  type TrackerStartResult,
  type TrackerStatus,
} from '@/core/pitch';
import { midiToFreq } from '@/core/math/pitch-math';
import type { TrackerLike } from './session';

/** Sample rate of the synthetic audio. */
export const TEST_SR = 48000;

/** A microphone pipeline that never touches the browser: tests feed it audio with `play`. */
export class FakeTracker extends EventHub implements TrackerLike {
  audioContext: { state: string } | null = { state: 'running' };
  info: TrackerInfo | null = null;
  /** What the next `start` resolves to. */
  startResult: TrackerStartResult = { ok: true };
  /** Options the session created the tracker with, then every `start` override. */
  readonly created: PitchTrackerOptions;
  readonly starts: Array<Partial<PitchTrackerOptions>> = [];
  readonly configured: EngineConfigPatch[] = [];
  stops = 0;
  running = false;
  private analysis: EngineConfigPatch = {};
  private engine: PitchEngine | null = null;
  private readonly statusHandlers = new Set<(status: TrackerStatus, fault?: TrackerFault) => void>();

  constructor(options: PitchTrackerOptions = {}) {
    super();
    this.created = options;
    this.analysis = { a4: options.a4, minFreq: options.minFreq, maxFreq: options.maxFreq };
  }

  async start(overrides: Partial<PitchTrackerOptions> = {}): Promise<TrackerStartResult> {
    this.starts.push(overrides);
    this.analysis = { ...this.analysis, a4: overrides.a4 ?? this.analysis.a4, minFreq: overrides.minFreq ?? this.analysis.minFreq, maxFreq: overrides.maxFreq ?? this.analysis.maxFreq };
    this.running = this.startResult.ok;
    return this.startResult;
  }

  stop(): void {
    this.stops++;
    this.running = false;
    this.engine = null;
  }

  configure(patch: EngineConfigPatch): void {
    this.configured.push(patch);
    this.analysis = { ...this.analysis, ...patch };
    if (this.engine) this.emitAll(this.engine.configure(patch));
  }

  /** Seconds of audio played since the pipeline was (re)started: the audio clock. */
  get clock(): number {
    return this.engine?.time ?? 0;
  }

  onStatus(handler: (status: TrackerStatus, fault?: TrackerFault) => void): () => void {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  /** Pretend the device was unplugged. */
  fail(fault: TrackerFault): void {
    this.running = false;
    for (const h of [...this.statusHandlers]) h('stopped', fault);
  }

  /** Run a buffer through the real engine in capture-sized chunks and deliver its events as they come. */
  play(samples: Float32Array, each?: (event: PitchEvent) => void): void {
    this.engine ??= new PitchEngine({ sampleRate: TEST_SR, ...this.analysis });
    const chunk = 256;
    for (let i = 0; i < samples.length; i += chunk) {
      for (const event of this.engine.process(samples.subarray(i, Math.min(samples.length, i + chunk)))) {
        this.emit(event);
        each?.(event);
      }
    }
  }
}

/** Options for {@link pluck}. */
export interface TestPluck {
  /** Seconds the string rings (default 1.6). */
  duration?: number;
  /** Peak level (default 0.5). */
  amplitude?: number;
  a4?: number;
  seed?: number;
  /** Fade the last 30 ms, as when the string is damped (default true). */
  damp?: boolean;
}

/** A realistic plucked string at `midi`, `cents` away from equal temperament: pick noise, a sharp start, stiff partials. */
export function pluck(midi: number, cents = 0, opts: TestPluck = {}): Float32Array {
  const freq = midiToFreq(midi + cents / 100, opts.a4 ?? 440);
  const x = pluckedString({
    freq,
    sampleRate: TEST_SR,
    duration: opts.duration ?? 1.6,
    amplitude: opts.amplitude ?? 0.5,
    attackNoise: 0.3,
    driftCents: 5,
    inharmonicity: 4e-5,
    decay: 2.2,
    seed: opts.seed ?? midi,
  });
  if (opts.damp ?? true) {
    const fade = Math.round(0.03 * TEST_SR);
    for (let i = 0; i < fade; i++) x[x.length - 1 - i] *= i / fade;
  }
  return x;
}

/** Seconds of digital silence. */
export function rest(seconds: number): Float32Array {
  return silence(seconds, TEST_SR);
}

/** Join buffers end to end. */
export function join(...parts: Float32Array[]): Float32Array {
  return concat(...parts);
}
