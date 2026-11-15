/**
 * The live microphone pipeline.
 *
 *   microphone -> AudioWorklet (copies samples out)  --MessagePort-->  Worker (PitchEngine)  --> events
 *
 * Fallbacks, chosen automatically and reported in `info`:
 *  - no AudioWorklet: an AnalyserNode is polled from a timer and its new samples are stitched into a stream;
 *  - no Worker (or it fails to load): the engine runs on the main thread (well under a millisecond per frame).
 *
 * `start()` must be called from a user gesture (the browser will not open audio otherwise).
 * `stop()` releases the microphone and every audio resource.
 */
import { type MediaFailure, listDevices, requestMic, stopStream } from '@/core/platform/media';
import { type EngineConfigPatch, PitchEngine, type PitchEngineOptions } from './engine';
import type { WorkerRequest, WorkerResponse } from './pitch.worker';
import { EventHub, type PitchEvent, type PitchEventMap, type PitchEventType, type PitchSource } from './types';
import { addCaptureWorklet, CAPTURE_CHUNK, CAPTURE_PROCESSOR } from './worklet';

/** Options for {@link PitchTracker}: the analysis settings plus where the audio comes from. */
export interface PitchTrackerOptions extends Omit<PitchEngineOptions, 'sampleRate'> {
  /** Use this stream instead of opening the microphone. It is left running on `stop()` unless `stopStream` is true. */
  stream?: MediaStream;
  /** Stop the tracks of a supplied `stream` on `stop()` (default false; a stream the tracker opened is always stopped). */
  stopStream?: boolean;
  /** Microphone to open (from {@link PitchTracker.inputs}). Default: the system default input. */
  deviceId?: string;
  /**
   * Run inside this AudioContext instead of creating one. Share the app's playback context to get
   * event times on the same clock as the metronome and backing tracks. It is not closed on `stop()`.
   */
  audioContext?: AudioContext;
  /** 'auto' (default) prefers the AudioWorklet; 'analyser' forces the polling fallback. */
  capture?: 'auto' | 'analyser';
  /** Run the analysis in a worker when possible (default true). */
  worker?: boolean;
}

/** Outcome of {@link PitchTracker.start}. */
export type TrackerStartResult =
  | { ok: true }
  | { ok: false; reason: MediaFailure | 'audio-failed'; detail?: string };

/** Lifecycle of the tracker. */
export type TrackerStatus = 'idle' | 'starting' | 'running' | 'stopped';

/** How the running pipeline is set up. */
export interface TrackerInfo {
  /** Sample rate of the audio context in Hz. */
  sampleRate: number;
  /** How audio is captured. */
  capture: 'worklet' | 'analyser';
  /** Where the analysis runs. */
  thread: 'worker' | 'main';
  /** Label of the input device, when the browser reveals it. */
  deviceLabel: string;
  /** Id of the input device, when known. */
  deviceId: string;
  /** Input latency reported by the browser in seconds (0 when unknown). Event times lag the real sound by about this much. */
  inputLatency: number;
}

/** Why the tracker stopped on its own. */
export type TrackerFault = 'device-lost' | 'audio-failed';

/** The analysis settings out of the tracker options (only plain data: they are posted to the worker). */
function engineOptions(o: PitchTrackerOptions, sampleRate: number): PitchEngineOptions {
  return {
    sampleRate,
    a4: o.a4,
    minFreq: o.minFreq,
    maxFreq: o.maxFreq,
    hopMs: o.hopMs,
    chroma: o.chroma,
    chromaHopMs: o.chromaHopMs,
    chromaWindowMs: o.chromaWindowMs,
    levelRate: o.levelRate,
    detector: o.detector,
    tracker: o.tracker,
    onset: o.onset,
  };
}

/**
 * How many samples newer `cur` is than `prev` (two snapshots of the same sliding window), found by
 * exact comparison around `guess`; 0 when they cannot be lined up (a gap, or digital silence).
 */
function overlapShift(prev: Float32Array, cur: Float32Array, guess: number): number {
  const n = cur.length;
  const probe = 192;
  for (let k = 0; k <= 8; k++) {
    for (const shift of k === 0 ? [guess] : [guess + k * 128, guess - k * 128]) {
      if (shift <= 0 || shift > n - probe) continue;
      // cur[i] should equal prev[i + shift]; compare the newest overlapping samples.
      let same = true;
      let energy = 0;
      for (let j = 1; j <= probe; j++) {
        const v = cur[n - shift - j];
        if (v !== prev[n - j]) {
          same = false;
          break;
        }
        energy += v * v;
      }
      if (same && energy > 0) return shift;
    }
  }
  return 0;
}

const ANALYSER_SIZE = 8192;
const ANALYSER_POLL_MS = 12;

/** Live pitch tracking from a microphone. Emits the events of {@link PitchEventMap}. */
export class PitchTracker implements PitchSource {
  private opts: PitchTrackerOptions;
  private readonly hub = new EventHub();
  private readonly statusListeners = new Set<(status: TrackerStatus, fault?: TrackerFault) => void>();
  private currentStatus: TrackerStatus = 'idle';
  private currentInfo: TrackerInfo | null = null;
  private generation = 0;

  private stream: MediaStream | null = null;
  private ownsStream = false;
  private ctx: AudioContext | null = null;
  private ownsContext = false;
  private nodes: AudioNode[] = [];
  private workletNode: AudioWorkletNode | null = null;
  private worker: Worker | null = null;
  private engine: PitchEngine | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private trackEnded: (() => void) | null = null;
  private activeNote: { midi: number; start: number } | null = null;
  private lastEventTime = 0;

  constructor(opts: PitchTrackerOptions = {}) {
    this.opts = { ...opts };
  }

  /** Microphones the browser knows about (labels are empty until permission has been granted once). */
  static inputs(): Promise<MediaDeviceInfo[]> {
    return listDevices('audioinput');
  }

  /** 'idle' before the first start, then 'starting' -> 'running' -> 'stopped'. */
  get status(): TrackerStatus {
    return this.currentStatus;
  }

  /** Details of the running pipeline, or null when not running. */
  get info(): TrackerInfo | null {
    return this.currentInfo;
  }

  /** The audio context in use while running (its `currentTime` is the clock of every event). */
  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  /** Subscribe to an analysis event; returns the unsubscribe function. */
  on<K extends PitchEventType>(type: K, handler: (event: PitchEventMap[K]) => void): () => void {
    return this.hub.on(type, handler);
  }

  /** Subscribe to status changes. `fault` says why when the tracker stopped by itself. */
  onStatus(handler: (status: TrackerStatus, fault?: TrackerFault) => void): () => void {
    this.statusListeners.add(handler);
    return () => {
      this.statusListeners.delete(handler);
    };
  }

  /** Convert an event time (audio clock, seconds) to `performance.now()` milliseconds. */
  toPerformanceTime(audioTime: number): number {
    const ctx = this.ctx;
    if (!ctx) return performance.now();
    const stamp = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    if (stamp && stamp.contextTime !== undefined && stamp.performanceTime !== undefined && stamp.performanceTime > 0) {
      return stamp.performanceTime + (audioTime - stamp.contextTime) * 1000;
    }
    return performance.now() + (audioTime - ctx.currentTime) * 1000;
  }

  /**
   * Open the microphone (unless a stream was supplied) and start emitting events.
   * Call from a click or tap handler. Safe to call while running: the pipeline restarts.
   */
  async start(overrides: Partial<PitchTrackerOptions> = {}): Promise<TrackerStartResult> {
    this.teardown();
    this.opts = { ...this.opts, ...overrides };
    const gen = ++this.generation;
    this.setStatus('starting');
    const o = this.opts;

    // The audio context is created (and asked to run) first, while this call is still inside the
    // user gesture: Safari refuses to start audio once the permission prompt has been awaited.
    let ctx: AudioContext;
    try {
      const Ctor: typeof AudioContext | undefined =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!o.audioContext && !Ctor) throw new Error('Web Audio is not available');
      ctx = o.audioContext ?? new (Ctor as typeof AudioContext)({ latencyHint: 'interactive' });
    } catch (err) {
      this.setStatus('stopped');
      return { ok: false, reason: 'audio-failed', detail: err instanceof Error ? err.message : String(err) };
    }
    this.ctx = ctx;
    this.ownsContext = !o.audioContext;
    const running = ctx.state === 'suspended' ? ctx.resume().catch(() => undefined) : Promise.resolve();

    let stream = o.stream ?? null;
    let ownsStream = false;
    if (!stream) {
      const res = await requestMic(o.deviceId);
      if (!res.ok) {
        if (gen === this.generation) {
          this.teardown();
          this.setStatus('stopped');
        }
        return { ok: false, reason: res.reason, detail: res.detail };
      }
      stream = res.stream;
      ownsStream = true;
    }
    // stop() or another start() ran while the permission prompt was open.
    if (gen !== this.generation) {
      if (ownsStream) stopStream(stream);
      return { ok: false, reason: 'audio-failed', detail: 'superseded' };
    }
    this.stream = stream;
    this.ownsStream = ownsStream || !!o.stopStream;

    try {
      await running;
      if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
      if (gen !== this.generation) return { ok: false, reason: 'audio-failed', detail: 'superseded' };

      const options = engineOptions(o, ctx.sampleRate);

      const useWorker = (o.worker ?? true) && (await this.startWorker(options, gen));
      if (gen !== this.generation) return { ok: false, reason: 'audio-failed', detail: 'superseded' };
      if (!useWorker) this.engine = new PitchEngine(options);

      const source = ctx.createMediaStreamSource(stream);
      // A muted path to the destination keeps every browser pulling audio through the graph.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      mute.connect(ctx.destination);
      this.nodes.push(source, mute);

      let capture: TrackerInfo['capture'] = 'analyser';
      if ((o.capture ?? 'auto') === 'auto' && (await addCaptureWorklet(ctx))) {
        if (gen !== this.generation) return { ok: false, reason: 'audio-failed', detail: 'superseded' };
        try {
          this.startWorklet(ctx, source, mute);
          capture = 'worklet';
        } catch {
          // The processor could not be instantiated after all: poll instead.
          this.workletNode = null;
          this.startAnalyser(ctx, source, mute);
        }
      } else {
        if (gen !== this.generation) return { ok: false, reason: 'audio-failed', detail: 'superseded' };
        this.startAnalyser(ctx, source, mute);
      }

      const track = stream.getAudioTracks()[0];
      if (track) {
        const onEnded = (): void => this.fail('device-lost');
        track.addEventListener('ended', onEnded);
        this.trackEnded = () => track.removeEventListener('ended', onEnded);
      }
      const settings = (track?.getSettings?.() ?? {}) as MediaTrackSettings & { latency?: number };
      this.currentInfo = {
        sampleRate: ctx.sampleRate,
        capture,
        thread: this.worker ? 'worker' : 'main',
        deviceLabel: track?.label ?? '',
        deviceId: settings.deviceId ?? o.deviceId ?? '',
        inputLatency: typeof settings.latency === 'number' ? settings.latency : 0,
      };
      this.setStatus('running');
      return { ok: true };
    } catch (err) {
      if (gen === this.generation) {
        this.teardown();
        this.setStatus('stopped');
      }
      return { ok: false, reason: 'audio-failed', detail: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Stop listening and release the microphone, the audio nodes and the worker. */
  stop(): void {
    this.generation++;
    this.teardown();
    if (this.currentStatus !== 'idle') this.setStatus('stopped');
  }

  /** Switch to another microphone (restarts the pipeline). */
  setDevice(deviceId: string | undefined): Promise<TrackerStartResult> {
    return this.start({ deviceId, stream: undefined });
  }

  /** Change the tuning reference, the pitch range or chroma analysis while running. */
  configure(patch: EngineConfigPatch): void {
    this.opts = { ...this.opts, ...patch };
    if (this.worker) this.post({ type: 'config', patch });
    else if (this.engine) this.dispatch(this.engine.configure(patch));
  }

  // --- internals ---------------------------------------------------------------------------

  private setStatus(status: TrackerStatus, fault?: TrackerFault): void {
    if (status === this.currentStatus && !fault) return;
    this.currentStatus = status;
    for (const l of [...this.statusListeners]) l(status, fault);
  }

  private fail(fault: TrackerFault): void {
    this.generation++;
    this.teardown();
    this.setStatus('stopped', fault);
  }

  private post(msg: WorkerRequest, transfer: Transferable[] = []): void {
    this.worker?.postMessage(msg, transfer);
  }

  private dispatch(events: readonly PitchEvent[]): void {
    for (const e of events) {
      if (e.type === 'noteon') this.activeNote = { midi: e.midi, start: e.time };
      else if (e.type === 'noteoff') this.activeNote = null;
      if (e.time > this.lastEventTime) this.lastEventTime = e.time;
      this.hub.emit(e);
    }
  }

  private feed(samples: Float32Array, time: number): void {
    if (this.worker) this.post({ type: 'audio', samples, time }, [samples.buffer]);
    else if (this.engine) this.dispatch(this.engine.process(samples, time));
  }

  /** Start the analysis worker; resolves false (leaving no worker behind) if it cannot be used. */
  private startWorker(options: PitchEngineOptions, gen: number): Promise<boolean> {
    if (typeof Worker === 'undefined') return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./pitch.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        resolve(false);
        return;
      }
      let settled = false;
      const giveUp = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        resolve(false);
      };
      const timer = setTimeout(giveUp, 4000);
      worker.onerror = () => {
        if (!settled) giveUp();
        else if (this.worker === worker) this.fail('audio-failed');
      };
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === 'ready' && !settled) {
          settled = true;
          clearTimeout(timer);
          if (gen !== this.generation) {
            worker.terminate();
            resolve(false);
            return;
          }
          this.worker = worker;
          resolve(true);
        } else if (msg.type === 'events') {
          if (this.worker === worker) this.dispatch(msg.events);
        } else if (msg.type === 'error') {
          if (!settled) giveUp();
          else if (typeof console !== 'undefined') console.error('[pitch] worker error:', msg.message);
        }
      };
      const init: WorkerRequest = { type: 'init', options };
      worker.postMessage(init);
    });
  }

  private startWorklet(ctx: AudioContext, source: AudioNode, mute: AudioNode): void {
    const node = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      processorOptions: { chunk: CAPTURE_CHUNK },
    });
    this.workletNode = node;
    this.nodes.push(node);
    if (this.worker) {
      // Hand the worker its own line to the audio thread: samples never visit the main thread.
      const channel = new MessageChannel();
      node.port.postMessage({ type: 'port', port: channel.port1 }, [channel.port1]);
      this.post({ type: 'port', port: channel.port2 }, [channel.port2]);
    } else {
      const sampleRate = ctx.sampleRate;
      node.port.onmessage = (e: MessageEvent<{ type: string; frame: number; samples: Float32Array }>) => {
        const d = e.data;
        if (d.type === 'audio' && this.engine) this.dispatch(this.engine.process(d.samples, d.frame / sampleRate));
      };
    }
    source.connect(node);
    node.connect(mute);
  }

  private startAnalyser(ctx: AudioContext, source: AudioNode, mute: AudioNode): void {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = ANALYSER_SIZE;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    analyser.connect(mute);
    this.nodes.push(analyser);
    const sr = ctx.sampleRate;
    const N = ANALYSER_SIZE;
    let data = new Float32Array(N);
    let prev = new Float32Array(N);
    const bytes = typeof analyser.getFloatTimeDomainData === 'function' ? null : new Uint8Array(N);
    let lastTime = ctx.currentTime;
    // Our own running clock for the stitched stream: it advances by exactly the samples handed on.
    let clock = Number.NaN;
    this.pollTimer = setInterval(() => {
      // The analyser always holds the newest N samples; the audio clock says roughly how many are new.
      const now = ctx.currentTime;
      const elapsed = Math.round((now - lastTime) * sr);
      if (elapsed <= 0) return;
      lastTime = now;
      if (bytes) {
        analyser.getByteTimeDomainData(bytes);
        for (let i = 0; i < N; i++) data[i] = (bytes[i] - 128) / 128;
      } else {
        analyser.getFloatTimeDomainData(data);
      }
      // The clock and the snapshot are read at slightly different moments, so the clock alone can be
      // a render quantum off. The snapshots overlap, so line the new one up with the previous one
      // exactly: that is what makes the stitched stream free of repeated or dropped samples.
      let fresh = Math.min(N, elapsed);
      const exact = overlapShift(prev, data, fresh);
      const continuous = exact > 0 && !Number.isNaN(clock) && Math.abs(clock + exact / sr - now) < 0.05;
      if (continuous) fresh = exact;
      else clock = now - fresh / sr;
      const chunk = data.slice(N - fresh);
      const start = clock;
      clock += fresh / sr;
      const swap = prev;
      prev = data;
      data = swap;
      this.feed(chunk, start);
    }, ANALYSER_POLL_MS);
  }

  private teardown(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.trackEnded?.();
    this.trackEnded = null;
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: 'stop' });
        this.workletNode.port.onmessage = null;
      } catch {
        // The port is already closed.
      }
      this.workletNode = null;
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    this.nodes = [];
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.engine = null;
    if (this.ctx && this.ownsContext) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    if (this.stream && this.ownsStream) stopStream(this.stream);
    this.stream = null;
    this.currentInfo = null;
    // Close a note that was sounding so no screen is left with a stuck key.
    if (this.activeNote) {
      const { midi, start } = this.activeNote;
      this.activeNote = null;
      const time = Math.max(this.lastEventTime, start);
      this.hub.emit({ type: 'noteoff', time, midi, duration: time - start });
    }
  }
}
