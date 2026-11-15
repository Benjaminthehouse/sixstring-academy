/**
 * The camera pipeline: everything between a `<video>` (or a `MediaStream`) and a pose to draw.
 *
 *   const pipeline = new VisionPipeline({ tracker: { model: 'steel' }, onRender: draw });
 *   await pipeline.start(stream);          // from requestCamera() in @/core/platform
 *   ...
 *   pipeline.stop();                       // releases the worker, the frame loop and the video
 *
 * Per displayed video frame (`requestVideoFrameCallback`, else `requestAnimationFrame`):
 *  1. If the vision worker is idle, the frame is shrunk to the working size on the GPU
 *     (`createImageBitmap` with a resize) and the bitmap is transferred to the worker, which reads
 *     the pixels back and runs `FretboardTracker`. If the worker is still busy, the frame is dropped:
 *     frames never queue, so latency never grows.
 *  2. `onRender` is called with the pose carried forward to this frame's display time
 *     (`PosePredictor`), so the overlay keeps up with the video instead of trailing it.
 *
 * Every result comes back tagged with the timestamp of the frame it was computed on (`onUpdate`).
 * Adaptive quality (`QualityController`) lowers the working resolution when tracked frames take too
 * long and spaces out full detections while searching; it raises the resolution again when there is
 * headroom. Without module workers (or when the worker fails to load) the same host runs on the main
 * thread, at a lower duty cycle.
 *
 * Points passed to the pipeline (`confirmFret`, `sampleMarkerColor`) are in pixels of the camera
 * video (`videoWidth` x `videoHeight`); poses may be for any frame size (they are rescaled). Poses
 * handed out are for the working frame: draw them with `poseForDisplay` / `drawVisionOverlay`.
 */
import type { MarkerColor } from './color-markers';
import { scalePose } from './geometry';
import { PosePredictor, type PredictorOptions } from './predict';
import type { FrameProbe, FrameTiming, VisionOptions, VisionRequest, VisionResponse } from './protocol';
import { QualityController, type QualityOptions, type QualitySettings } from './quality';
import type { TrackerUpdate } from './tracker';
import type { FretboardPose, Point, Rect } from './types';

/** Where the tracker runs. */
export type PipelineMode = 'worker' | 'main' | 'idle';

/** One processed frame, as it reaches the main thread. */
export interface PipelineUpdate {
  /** The tracker's answer (poses in pixels of the working frame: see `width` / `height`). */
  update: TrackerUpdate;
  /** Sequence number of the frame (increases by one per frame sent). */
  seq: number;
  /** Timestamp of the frame the answer is for (`performance.now()` clock: the frame's expected display time). */
  frameTime: number;
  /** When the answer arrived on the main thread. */
  arrivedAt: number;
  /** `arrivedAt - frameTime`: how far behind the video the raw answer is. */
  latencyMs: number;
  /** Where the time went in the worker. */
  timing: FrameTiming;
  /** Size of the working frame. */
  width: number;
  height: number;
  /** Copy of the probed part of the frame (only with the `probe` option). */
  probe?: FrameProbe;
}

/** What to draw for one displayed video frame. */
export interface PipelineRender {
  /** Display timestamp of the frame now on screen. */
  timeMs: number;
  /** The pose for this frame: the newest answer carried forward to `timeMs` (the held pose while lost; null while searching). */
  pose: FretboardPose | null;
  /** The newest answer (null before the first). */
  latest: PipelineUpdate | null;
}

/** Measured behaviour of the pipeline (sliding windows over the last couple of seconds). */
export interface PipelineStats {
  mode: PipelineMode;
  running: boolean;
  paused: boolean;
  /** Video frames seen, frames processed, frames dropped because the tracker was busy, frames skipped to space out detection. */
  framesOffered: number;
  framesProcessed: number;
  framesDropped: number;
  framesSkipped: number;
  /** Video frames per second seen, and processed per second, over the last two seconds. */
  offeredFps: number;
  processedFps: number;
  /** Median and 95th percentile of the time per processed frame in the worker (read-back + tracker), ms. */
  workerMs: number;
  workerP95Ms: number;
  /** Median time of tracked frames and of full detections (recent), ms (NaN before any). */
  trackMs: number;
  detectMs: number;
  /** Median of frame timestamp -> answer on the main thread, ms. */
  latencyMs: number;
  /** Working frame size and the adaptive settings in force. */
  workingWidth: number;
  workingHeight: number;
  quality: QualitySettings;
  /** Times the worker had to be restarted (it stopped answering) and errors it reported. */
  restarts: number;
  errors: number;
}

/** Options of `VisionPipeline`. */
export interface PipelineOptions {
  /** Tracker settings (guitar, orientation, marker mode...). */
  tracker?: VisionOptions;
  /** 'auto' (default): a module worker if possible, else the main thread. 'off': always the main thread. */
  worker?: 'auto' | 'off';
  /** Adaptive quality settings (working widths, budgets). */
  quality?: QualityOptions;
  /** Pose extrapolation settings, or false to draw the newest answer as it is. */
  predictor?: PredictorOptions | false;
  /** Called for every processed frame (no React state per frame: draw or mutate refs). */
  onUpdate?: (update: PipelineUpdate) => void;
  /** Called for every displayed video frame with the pose to draw on it. */
  onRender?: (render: PipelineRender) => void;
  /** Called when the mode changes or something went wrong (worker failed, restarted). */
  onStatus?: (status: { mode: PipelineMode; message?: string }) => void;
  /** Also stop the camera tracks on `stop()` (default false: the screen owns the stream). */
  stopTracksOnStop?: boolean;
  /** Create the worker yourself (other bundlers, tests). Return null for no worker. */
  createWorker?: () => Worker | null;
  /** Test aid: copy this part of every working frame (fractions 0..1) into the updates. */
  probe?: Rect;
  /** How long to wait for the worker to load before running on the main thread, ms (default 20000). */
  workerTimeoutMs?: number;
}

/** A video element whose frame callback may be missing (older Safari and Firefox). */
type FrameCallbackVideo = HTMLVideoElement;

/** A fixed-size ring of recent numbers. */
class Ring {
  private readonly values: Float64Array;
  private readonly times: Float64Array;
  private count = 0;
  private head = 0;
  constructor(size: number) {
    this.values = new Float64Array(size);
    this.times = new Float64Array(size);
  }
  push(value: number, time: number): void {
    this.values[this.head] = value;
    this.times[this.head] = time;
    this.head = (this.head + 1) % this.values.length;
    this.count = Math.min(this.values.length, this.count + 1);
  }
  clear(): void {
    this.count = 0;
    this.head = 0;
  }
  /** Values whose time is at or after `since`. */
  recent(since = -Infinity): number[] {
    const out: number[] = [];
    for (let k = 0; k < this.count; k++) {
      const i = (this.head - 1 - k + this.values.length) % this.values.length;
      if (this.times[i] >= since) out.push(this.values[i]);
    }
    return out;
  }
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function now(): number {
  return performance.now();
}

/** A module worker running `vision.worker.ts`, or null where that is impossible. */
function defaultWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

/** Working frame size for a video: about `width` x (9/16 width) pixels, never larger than the video, even sides. */
export function workingSizeFor(videoWidth: number, videoHeight: number, width: number): { width: number; height: number } {
  if (!(videoWidth > 0 && videoHeight > 0)) return { width: 0, height: 0 };
  // Landscape: the long side is `width`. Portrait: the same pixel count (detectors work across the frame).
  const scale = videoWidth >= videoHeight ? width / videoWidth : Math.sqrt((width * width * 9) / 16 / (videoWidth * videoHeight));
  const s = Math.min(1, scale);
  const even = (v: number): number => Math.max(2, 2 * Math.round(v / 2));
  return { width: even(videoWidth * s), height: even(videoHeight * s) };
}

/**
 * Runs the fretboard tracker on a live camera, in a worker, at the display rate, with adaptive
 * quality and pose extrapolation. One pipeline per camera stream; `stop()` releases everything.
 */
export class VisionPipeline {
  private readonly options: PipelineOptions;
  private trackerOptions: VisionOptions;
  private quality: QualityController;
  private readonly predictor: PosePredictor | null;
  private videoEl: FrameCallbackVideo | null = null;
  private ownVideo = false;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private host: ((request: VisionRequest) => VisionResponse) | null = null;
  private currentMode: PipelineMode = 'idle';
  private bitmaps = false;
  private resizeBitmaps = true;
  private ready = false;
  private running = false;
  private paused = false;
  private loopHandle = 0;
  private loopKind: 'video' | 'raf' | null = null;
  private lastVideoFrames = -1;
  private generation = 0;
  private seq = 0;
  private inFlight: { seq: number; frameTime: number; sentAt: number; width: number; height: number } | null = null;
  private lastSize = { width: 0, height: 0 };
  private nextDetectAt = 0;
  /** Timestamp of the newest frame dropped while the tracker was busy (sent as soon as it is free). */
  private droppedFrameTime = -Infinity;
  private latestUpdate: PipelineUpdate | null = null;
  private commandId = 0;
  private readonly pending = new Map<number, (response: VisionResponse) => void>();
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private counters = { offered: 0, processed: 0, dropped: 0, skipped: 0, restarts: 0, errors: 0 };
  private readonly offeredTimes = new Ring(256);
  private readonly processedTimes = new Ring(256);
  private readonly workerTimes = new Ring(128);
  private readonly latencies = new Ring(128);

  /** Create a pipeline (nothing starts until `start`). */
  constructor(options: PipelineOptions = {}) {
    this.options = options;
    this.trackerOptions = { ...(options.tracker ?? {}) };
    this.quality = new QualityController(options.quality);
    this.predictor = options.predictor === false ? null : new PosePredictor(options.predictor ?? {});
  }

  /** True where the pipeline can run at all (a DOM with video elements and a 2D canvas). */
  static isSupported(): boolean {
    return typeof document !== 'undefined' && typeof HTMLVideoElement !== 'undefined';
  }

  /** Where the tracker runs now. */
  get mode(): PipelineMode {
    return this.currentMode;
  }

  /** The video element frames are taken from (created for a MediaStream). */
  get video(): HTMLVideoElement | null {
    return this.videoEl;
  }

  /** Intrinsic size of the camera video (0 x 0 before start). */
  get videoSize(): { width: number; height: number } {
    const v = this.videoEl;
    return { width: v?.videoWidth ?? 0, height: v?.videoHeight ?? 0 };
  }

  /** The newest answer from the tracker. */
  get latest(): PipelineUpdate | null {
    return this.latestUpdate;
  }

  /** True between `start` and `stop`. */
  get isRunning(): boolean {
    return this.running;
  }

  /** True while paused. */
  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Start on a video element (already playing, or about to) or a camera stream (a hidden video
   * element is made for it). Resolves once frames are flowing to the tracker's host.
   */
  async start(source: HTMLVideoElement | MediaStream): Promise<void> {
    if (this.running) this.stop();
    const generation = ++this.generation;
    this.running = true;
    this.paused = false;
    let video: FrameCallbackVideo;
    // Duck-typed (a video element from another realm, or a stand-in in tests, is still a video).
    if (typeof (source as Partial<HTMLVideoElement>).videoWidth === 'number') {
      video = source as FrameCallbackVideo;
      this.ownVideo = false;
      this.stream = (video.srcObject as MediaStream | null) ?? null;
    } else {
      this.stream = source as MediaStream;
      video = document.createElement('video') as FrameCallbackVideo;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = this.stream;
      this.ownVideo = true;
    }
    this.videoEl = video;
    if (this.ownVideo) await video.play().catch(() => undefined);
    await waitForVideo(video, 10000);
    if (generation !== this.generation) return;
    await this.startHost(generation);
    if (generation !== this.generation) return;
    this.startLoop();
    this.startWatchdog();
  }

  /** Stop processing and the frame loop; the tracker keeps its state for `resume`. */
  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.stopLoop();
  }

  /** Continue after `pause`. */
  resume(): void {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.predictor?.reset();
    this.startLoop();
  }

  /** Stop and release everything: frame loop, worker, video element (if made here), buffers, pending commands. */
  stop(): void {
    this.generation++;
    this.running = false;
    this.paused = false;
    this.stopLoop();
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.teardownHost();
    for (const resolve of this.pending.values()) resolve({ type: 'error', message: 'stopped' });
    this.pending.clear();
    const video = this.videoEl;
    if (video && this.ownVideo) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      video.load?.();
    }
    if (this.options.stopTracksOnStop) this.stream?.getTracks().forEach((t) => t.stop());
    this.videoEl = null;
    this.stream = null;
    this.ownVideo = false;
    this.canvas = null;
    this.inFlight = null;
    this.latestUpdate = null;
    this.predictor?.reset();
    this.quality.reset();
    this.offeredTimes.clear();
    this.processedTimes.clear();
    this.workerTimes.clear();
    this.latencies.clear();
    this.setMode('idle');
  }

  /** Hand over a pose from assisted calibration (any frame size: it is rescaled to the working frame). */
  calibrate(pose: FretboardPose): Promise<boolean> {
    const fitted = this.toWorking(pose);
    this.predictor?.reset();
    return this.command({ type: 'calibrate', pose: fitted });
  }

  /** One tap: the cell under `point` (video pixels) is fret `fret`. */
  confirmFret(point: Point, fret: number): Promise<boolean> {
    return this.command({ type: 'confirm-fret', point: this.videoToWorking(point), fret });
  }

  /** "Yes, that is fret N": accept the current numbering. */
  confirmNumbering(): Promise<boolean> {
    return this.command({ type: 'confirm-numbering' });
  }

  /** Shift every fret number by `delta`. */
  shiftNumbering(delta: number): Promise<boolean> {
    return this.command({ type: 'shift-numbering', delta });
  }

  /** Change tracker options (orientation or guitar changes restart the search). */
  setOptions(changes: Partial<VisionOptions>): Promise<boolean> {
    this.trackerOptions = { ...this.trackerOptions, ...changes };
    return this.command({ type: 'options', options: changes });
  }

  /** Forget the board (search again from scratch). */
  reset(): Promise<boolean> {
    this.predictor?.reset();
    return this.command({ type: 'reset' });
  }

  /** Marker mode: the colour of the marker under `point` (video pixels) in the newest frame, or null when it is not colourful enough. */
  async sampleMarkerColor(point: Point, radius?: number): Promise<MarkerColor | null> {
    const response = await this.send({ type: 'sample-color', point: this.videoToWorking(point), radius });
    return response.type === 'state' ? (response.color ?? null) : null;
  }

  /** The pose to draw at `timeMs` (default now): the newest answer carried forward; the held pose while lost; null while searching. */
  poseAt(timeMs: number = now()): FretboardPose | null {
    const latest = this.latestUpdate;
    if (!latest) return null;
    const u = latest.update;
    if (u.state === 'searching' || !u.pose) return null;
    if (u.state === 'lost' || !this.predictor) return u.pose;
    return this.predictor.predict(timeMs) ?? u.pose;
  }

  /** Measured throughput, timings and the adaptive settings. */
  get stats(): PipelineStats {
    const t = now();
    const since = t - 2000;
    const fps = (ring: Ring): number => {
      const times = ring.recent(since);
      return times.length / 2;
    };
    const worker = this.workerTimes.recent();
    const medians = this.quality.medians;
    return {
      mode: this.currentMode,
      running: this.running,
      paused: this.paused,
      framesOffered: this.counters.offered,
      framesProcessed: this.counters.processed,
      framesDropped: this.counters.dropped,
      framesSkipped: this.counters.skipped,
      offeredFps: fps(this.offeredTimes),
      processedFps: fps(this.processedTimes),
      workerMs: quantile(worker, 0.5),
      workerP95Ms: quantile(worker, 0.95),
      trackMs: medians.track,
      detectMs: medians.detect,
      latencyMs: quantile(this.latencies.recent(), 0.5),
      workingWidth: this.lastSize.width,
      workingHeight: this.lastSize.height,
      quality: this.quality.settings,
      restarts: this.counters.restarts,
      errors: this.counters.errors,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Host: worker or main thread
  // ---------------------------------------------------------------------------------------------

  private setMode(mode: PipelineMode, message?: string): void {
    const changed = mode !== this.currentMode;
    this.currentMode = mode;
    if (changed || message) this.options.onStatus?.({ mode, message });
  }

  private async startHost(generation: number): Promise<void> {
    this.ready = false;
    this.quality = new QualityController(this.options.quality);
    if (this.options.worker !== 'off') {
      const worker = (this.options.createWorker ?? defaultWorker)();
      if (worker) {
        const ok = await this.attachWorker(worker, generation);
        if (generation !== this.generation) {
          worker.terminate();
          return;
        }
        if (ok) return;
        worker.terminate();
        this.worker = null;
      }
    }
    await this.startMainThreadHost(generation, this.options.worker === 'off' ? undefined : 'the vision worker could not start; running on the main thread');
  }

  private attachWorker(worker: Worker, generation: number): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), this.options.workerTimeoutMs ?? 20000);
      worker.onerror = (event) => {
        event.preventDefault?.();
        if (!settled) finish(false);
        else if (generation === this.generation && this.worker === worker) this.failWorker('the vision worker crashed');
      };
      worker.onmessage = (event: MessageEvent<VisionResponse>) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          if (generation !== this.generation) return finish(false);
          this.worker = worker;
          this.bitmaps = msg.bitmaps && typeof createImageBitmap === 'function';
          this.resizeBitmaps = true;
          this.setMode('worker');
          this.configureHost();
          this.ready = true;
          finish(true);
          return;
        }
        if (generation === this.generation) this.onResponse(msg);
      };
    });
  }

  private async startMainThreadHost(generation: number, message?: string): Promise<void> {
    // Loaded only when needed, so the screen's bundle does not carry the tracker twice.
    const { createVisionHost } = await import('./protocol');
    if (generation !== this.generation) return;
    this.host = createVisionHost();
    this.bitmaps = false;
    // The main thread is shared with the UI: smaller budgets, more spacing between detections.
    this.quality = new QualityController({ trackBudgetMs: 30, detectBudgetMs: 60, detectDuty: 0.35, ...this.options.quality });
    this.setMode('main', message);
    this.configureHost();
    this.ready = true;
  }

  private configureHost(): void {
    this.post({ type: 'options', options: this.trackerOptions, id: this.nextId() });
    if (this.options.probe) this.post({ type: 'probe', rect: this.options.probe, id: this.nextId() });
  }

  private failWorker(message: string): void {
    const generation = this.generation;
    this.teardownHost();
    this.counters.restarts++;
    this.predictor?.reset();
    this.latestUpdate = null;
    void this.startHost(generation).then(() => this.options.onStatus?.({ mode: this.currentMode, message }));
  }

  private teardownHost(): void {
    this.ready = false;
    this.inFlight = null;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.host = null;
  }

  private nextId(): number {
    return ++this.commandId;
  }

  private post(request: VisionRequest, transfer: Transferable[] = []): void {
    if (this.worker) {
      this.worker.postMessage(request, transfer);
      return;
    }
    const host = this.host;
    if (!host) return;
    // Main thread: answer in a task of its own so the caller (a frame callback) returns at once.
    const generation = this.generation;
    setTimeout(() => {
      if (generation !== this.generation || this.host !== host) return;
      this.onResponse(host(request));
    }, 0);
  }

  private send(request: VisionRequest & { id?: number }): Promise<VisionResponse> {
    if (!this.running || (!this.worker && !this.host)) return Promise.resolve({ type: 'error', message: 'not running' });
    const id = this.nextId();
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.post({ ...request, id } as VisionRequest);
    });
  }

  private async command(request: VisionRequest): Promise<boolean> {
    const response = await this.send(request);
    return response.type === 'state' && response.ok;
  }

  private onResponse(msg: VisionResponse): void {
    switch (msg.type) {
      case 'update':
        this.onUpdate(msg);
        return;
      case 'state':
      case 'error': {
        if (msg.type === 'error') {
          this.counters.errors++;
          if (msg.seq !== undefined && this.inFlight?.seq === msg.seq) this.inFlight = null;
        }
        const id = msg.id;
        if (id !== undefined) {
          const resolve = this.pending.get(id);
          this.pending.delete(id);
          resolve?.(msg);
        }
        return;
      }
      default:
        return;
    }
  }

  private onUpdate(msg: Extract<VisionResponse, { type: 'update' }>): void {
    const sent = this.inFlight;
    if (!sent || msg.seq !== sent.seq) return;
    this.inFlight = null;
    // An answer for a frame sent just before `pause()`: the screen asked for silence.
    if (this.paused) return;
    const arrivedAt = now();
    const u = msg.update;
    const out: PipelineUpdate = {
      update: u,
      seq: sent.seq,
      frameTime: sent.frameTime,
      arrivedAt,
      latencyMs: arrivedAt - sent.frameTime,
      timing: msg.timing,
      width: msg.width,
      height: msg.height,
      probe: msg.probe,
    };
    this.counters.processed++;
    this.processedTimes.push(1, arrivedAt);
    this.workerTimes.push(msg.timing.totalMs, arrivedAt);
    this.latencies.push(out.latencyMs, arrivedAt);
    const detected = u.ran === 'detect' || u.ran === 'track+detect';
    this.quality.record(detected ? 'detect' : 'track', msg.timing.totalMs, arrivedAt);
    this.nextDetectAt = detected ? arrivedAt + this.quality.settings.detectIntervalMs : 0;
    if (this.predictor) {
      // A pose continues the previous one unless the board is new (the predictor itself also spots
      // jumps: renumbering, calibration, a re-detection elsewhere).
      const before = this.latestUpdate?.update.state;
      if ((u.state === 'candidate' || u.state === 'locked') && u.pose) this.predictor.push(u.pose, sent.frameTime, before === 'candidate' || before === 'locked' || before === 'lost');
      else this.predictor.reset();
    }
    this.latestUpdate = out;
    this.options.onUpdate?.(out);
    // A newer frame came while this one was being processed: take it now rather than waiting for
    // the next one (the worker would idle for up to a frame). It is the frame on screen, so
    // nothing queues and nothing goes stale.
    if (this.droppedFrameTime > sent.frameTime && this.running && !this.paused) {
      const frameTime = this.droppedFrameTime;
      this.droppedFrameTime = -Infinity;
      this.maybeSend(frameTime);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------------------------

  private startLoop(): void {
    const video = this.videoEl;
    if (!video || this.loopKind) return;
    if (typeof (video as Partial<HTMLVideoElement>).requestVideoFrameCallback === 'function') {
      this.loopKind = 'video';
      this.loopHandle = video.requestVideoFrameCallback(this.onVideoFrame);
    } else {
      this.loopKind = 'raf';
      this.loopHandle = requestAnimationFrame(this.onAnimationFrame);
    }
  }

  private stopLoop(): void {
    const video = this.videoEl;
    if (this.loopKind === 'video') video?.cancelVideoFrameCallback(this.loopHandle);
    else if (this.loopKind === 'raf') cancelAnimationFrame(this.loopHandle);
    this.loopKind = null;
    this.loopHandle = 0;
  }

  private readonly onVideoFrame = (time: number, meta: VideoFrameCallbackMetadata): void => {
    const video = this.videoEl;
    if (!this.running || this.paused || !video || this.loopKind !== 'video') return;
    this.loopHandle = video.requestVideoFrameCallback(this.onVideoFrame);
    this.onFrame(meta?.expectedDisplayTime ?? time);
  };

  private readonly onAnimationFrame = (time: number): void => {
    const video = this.videoEl;
    if (!this.running || this.paused || !video || this.loopKind !== 'raf') return;
    this.loopHandle = requestAnimationFrame(this.onAnimationFrame);
    // Only new video frames count: the decoder's frame counter where there is one, else at most 30 per second.
    const quality = (video as HTMLVideoElement & { getVideoPlaybackQuality?: () => VideoPlaybackQuality }).getVideoPlaybackQuality?.();
    const frames = quality ? quality.totalVideoFrames : -1;
    if (frames > 0) {
      if (frames === this.lastVideoFrames) return;
      this.lastVideoFrames = frames;
    } else if (time - this.offeredAt < 30) return;
    this.onFrame(time);
  };

  private offeredAt = -Infinity;

  private onFrame(frameTime: number): void {
    this.offeredAt = frameTime;
    this.counters.offered++;
    this.offeredTimes.push(1, now());
    this.maybeSend(frameTime);
    const render = this.options.onRender;
    if (render) render({ timeMs: frameTime, pose: this.poseAt(frameTime), latest: this.latestUpdate });
  }

  private maybeSend(frameTime: number): void {
    const video = this.videoEl;
    if (!this.ready || !video || video.readyState < 2 || !(video.videoWidth > 0)) return;
    if (this.inFlight) {
      this.counters.dropped++;
      this.droppedFrameTime = frameTime;
      return;
    }
    this.droppedFrameTime = -Infinity;
    const state = this.latestUpdate?.update.state;
    if ((state === 'searching' || state === 'lost') && now() < this.nextDetectAt) {
      this.counters.skipped++;
      return;
    }
    const size = workingSizeFor(video.videoWidth, video.videoHeight, this.quality.settings.workingWidth);
    if (size.width <= 0) return;
    const seq = ++this.seq;
    this.inFlight = { seq, frameTime, sentAt: now(), width: size.width, height: size.height };
    this.lastSize = size;
    if (this.worker && this.bitmaps) this.sendBitmap(video, seq, frameTime, size);
    else this.sendPixels(video, seq, frameTime, size);
  }

  private sendBitmap(video: HTMLVideoElement, seq: number, frameTime: number, size: { width: number; height: number }): void {
    const generation = this.generation;
    const options: ImageBitmapOptions = this.resizeBitmaps ? { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'medium' } : {};
    let pending: Promise<ImageBitmap>;
    try {
      pending = createImageBitmap(video, options);
    } catch {
      pending = Promise.reject(new Error('createImageBitmap threw'));
    }
    pending.then(
      (bitmap) => {
        if (generation !== this.generation || !this.worker || this.inFlight?.seq !== seq) {
          bitmap.close();
          return;
        }
        this.worker.postMessage({ type: 'bitmap', bitmap, width: size.width, height: size.height, timeMs: frameTime, seq } satisfies VisionRequest, [bitmap]);
      },
      () => {
        if (generation !== this.generation) return;
        // Resize options unsupported: send full-size bitmaps (the worker scales). Bitmaps failing
        // altogether: read pixels here and send those.
        if (this.resizeBitmaps) this.resizeBitmaps = false;
        else this.bitmaps = false;
        if (this.inFlight?.seq === seq) this.inFlight = null;
      },
    );
  }

  private sendPixels(video: HTMLVideoElement, seq: number, frameTime: number, size: { width: number; height: number }): void {
    let canvas = this.canvas;
    if (!canvas || canvas.width !== size.width || canvas.height !== size.height) {
      canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size.width, size.height) : Object.assign(document.createElement('canvas'), { width: size.width, height: size.height });
      this.canvas = canvas;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) {
      this.inFlight = null;
      return;
    }
    ctx.drawImage(video, 0, 0, size.width, size.height);
    const image = ctx.getImageData(0, 0, size.width, size.height);
    const frame = { data: image.data, width: size.width, height: size.height };
    this.post({ type: 'frame', frame, timeMs: frameTime, seq }, this.worker ? [image.data.buffer] : []);
  }

  private startWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    // A frame that never comes back (a hung or crashed worker) must not stop the pipeline for good.
    this.watchdog = setInterval(() => {
      const sent = this.inFlight;
      if (!this.running || this.paused || !sent) return;
      if (now() - sent.sentAt > 5000) {
        if (this.worker) this.failWorker('the vision worker stopped answering and was restarted');
        else this.inFlight = null;
      }
    }, 1000);
  }

  // ---------------------------------------------------------------------------------------------
  // Coordinates
  // ---------------------------------------------------------------------------------------------

  private videoToWorking(point: Point): Point {
    const v = this.videoSize;
    const w = this.lastSize;
    if (!(v.width > 0) || !(w.width > 0)) return point;
    return { x: (point.x * w.width) / v.width, y: (point.y * w.height) / v.height };
  }

  private toWorking(pose: FretboardPose): FretboardPose {
    const w = this.lastSize;
    if (!(w.width > 0) || (pose.frameWidth === w.width && pose.frameHeight === w.height)) return pose;
    return scalePose(pose, w.width / pose.frameWidth, w.height / pose.frameHeight);
  }
}

/** Resolve once the video has a frame to show (or after `timeoutMs`). */
function waitForVideo(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', check);
      video.removeEventListener('resize', check);
      resolve();
    };
    const check = (): void => {
      if (video.readyState >= 2 && video.videoWidth > 0) done();
    };
    const timer = setTimeout(done, timeoutMs);
    video.addEventListener('loadeddata', check);
    video.addEventListener('resize', check);
  });
}
