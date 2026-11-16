/**
 * One recording, from pressing Record to the finished audio: the microphone (through
 * `requestMic`), an analyser for the level meter, an optional metronome count-in and click, and
 * the browser's MediaRecorder. It lives outside React so a take that is stopped by leaving the
 * screen still finishes and is saved.
 *
 * Timing: the count-in is one bar of the metronome. When its downbeat is scheduled, the recorder
 * is started just before it (`recordStartTime`), after the last count-in click has died away, so
 * the take begins on the beat with no count-in click in it. Without "Click while recording" the
 * metronome is stopped at that moment too (taking back the downbeat click it already handed out).
 */
import { Metronome, audioNow, audioSupported, getAudioContext, getEngine } from '@/core/audio';
import { keepAwake, requestMic, stopStream, type MediaFailure } from '@/core/platform';
import { MAX_TAKE_MS } from '../model/takes';
import { blockLevel, recordStartTime } from '../model/signal';

/** Where a session is. */
export type SessionPhase = 'idle' | 'opening' | 'counting' | 'recording' | 'finishing';

/** How to record. */
export interface SessionOptions {
  /** Format to ask for; null lets the browser choose. */
  mimeType: string | null;
  /** The learner's chosen input, if any. */
  deviceId?: string;
  /** One bar of clicks before the take starts. */
  countIn: boolean;
  /** Keep the click going while recording (headphones advised). */
  click: boolean;
  bpm: number;
  beatsPerBar: number;
}

/** A finished recording, before it is stored. */
export interface FinishedRecording {
  blob: Blob;
  mimeType: string;
  /** Length measured by the wall clock, ms (the decoded length replaces it when available). */
  durationMs: number;
  /** When recording began, epoch ms. */
  startedAt: number;
  /** Tempo of the count-in or click, or null when neither was used. */
  bpm: number | null;
  /** Loudest sample of each ~50 ms while recording: the waveform when the audio cannot be decoded. */
  envelope: number[];
  /** True when the take stopped itself at the length limit. */
  hitLimit: boolean;
}

/** Why a start failed: a microphone failure, or the recorder itself refused. */
export type StartFailure = MediaFailure | 'recorder-failed';

type Listener<T> = (value: T) => void;

/** A running recording. Create one per take. */
export class RecorderSession {
  private phaseValue: SessionPhase = 'idle';
  private readonly phaseListeners = new Set<Listener<SessionPhase>>();
  private readonly countListeners = new Set<Listener<number>>();
  private readonly limitListeners = new Set<Listener<FinishedRecording | null>>();
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private release: (() => void) | null = null;
  private awake: (() => void) | null = null;
  private metronome: Metronome | null = null;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private startedPerf = 0;
  private startedAt = 0;
  private options: SessionOptions | null = null;
  private latest = { db: -Infinity, peak: 0 };
  private envelope: number[] = [];
  private envelopePeak = 0;
  private stopping: Promise<FinishedRecording | null> | null = null;
  private cancelled = false;

  /** Where the session is. */
  get phase(): SessionPhase {
    return this.phaseValue;
  }

  /** Called on every phase change. Returns an unsubscribe function. */
  onPhase(fn: Listener<SessionPhase>): () => void {
    this.phaseListeners.add(fn);
    return () => this.phaseListeners.delete(fn);
  }

  /** Called on each count-in beat as it is heard, with the beats left (4, 3, 2, 1). */
  onCount(fn: Listener<number>): () => void {
    this.countListeners.add(fn);
    return () => this.countListeners.delete(fn);
  }

  /** Called when the take stopped itself at the length limit, with the recording. */
  onLimit(fn: Listener<FinishedRecording | null>): () => void {
    this.limitListeners.add(fn);
    return () => this.limitListeners.delete(fn);
  }

  /** The latest input level (RMS dBFS and absolute peak), for the meter. */
  level(): { db: number; peak: number } {
    return this.latest;
  }

  /** Milliseconds recorded so far (0 before the take has begun). */
  elapsedMs(): number {
    if (this.phaseValue !== 'recording' || this.startedPerf === 0) return 0;
    return performance.now() - this.startedPerf;
  }

  private setPhase(phase: SessionPhase): void {
    if (phase === this.phaseValue) return;
    this.phaseValue = phase;
    for (const fn of [...this.phaseListeners]) fn(phase);
  }

  /**
   * Open the microphone and start: at once, or after a bar of count-in. Call `unlockAudio()` in the
   * same gesture first so the count-in and the meter can run.
   */
  async start(options: SessionOptions): Promise<{ ok: true } | { ok: false; reason: StartFailure; detail?: string }> {
    if (this.phaseValue !== 'idle') return { ok: true };
    this.options = options;
    this.cancelled = false;
    this.setPhase('opening');
    const mic = await requestMic(options.deviceId);
    if (!mic.ok) {
      this.setPhase('idle');
      return { ok: false, reason: mic.reason, detail: mic.detail };
    }
    if (this.cancelled) {
      stopStream(mic.stream);
      this.setPhase('idle');
      return { ok: true };
    }
    this.stream = mic.stream;
    this.awake = keepAwake();
    this.openMeter(mic.stream);

    try {
      const opts: MediaRecorderOptions = { audioBitsPerSecond: 128_000 };
      if (options.mimeType) opts.mimeType = options.mimeType;
      this.recorder = new MediaRecorder(mic.stream, opts);
    } catch (e) {
      this.teardown();
      this.setPhase('idle');
      return { ok: false, reason: 'recorder-failed', detail: String(e) };
    }
    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };

    const beat = 60 / options.bpm;
    if (options.countIn || options.click) {
      const m = new Metronome({ tempo: options.bpm, timeSignature: `${options.beatsPerBar}/4` });
      this.metronome = m;
      if (options.countIn) {
        m.onBeat((b) => {
          if (b.countIn) for (const fn of [...this.countListeners]) fn(b.beatsInBar - b.beat);
        });
        let armed = false;
        m.onSchedule((b) => {
          if (b.countIn || armed) return;
          armed = true;
          // The downbeat has just been handed to the audio clock: start recording just before it.
          const startIn = Math.max(0, (recordStartTime(b.time, beat) - audioNow()) * 1000);
          this.later(() => this.beginRecording(), startIn);
          if (!options.click) this.later(() => this.stopMetronome(), Math.max(0, (b.time - 0.03 - audioNow()) * 1000));
        });
        this.setPhase('counting');
        m.start({ countIn: 1 });
        // If the audio clock never runs (sound refused by the browser), the downbeat is never
        // scheduled: start recording anyway once the bar is surely over, so Record never hangs.
        this.later(() => this.beginRecording(), (options.beatsPerBar * beat + 1.5) * 1000);
        return { ok: true };
      }
      m.start({ countIn: 0 });
    }
    this.beginRecording();
    return { ok: true };
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private openMeter(stream: MediaStream): void {
    if (!audioSupported()) return;
    try {
      const ctx = getAudioContext();
      this.release = getEngine().hold();
      this.source = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.source.connect(this.analyser);
      this.samples = new Float32Array(this.analyser.fftSize);
      // About 30 readings a second; a hidden tab slows this down, which is fine for a meter.
      this.meterTimer = setInterval(() => this.readLevel(), 33);
    } catch {
      // No meter: the take is still recorded.
    }
  }

  private readLevel(): void {
    if (!this.analyser || !this.samples) return;
    this.analyser.getFloatTimeDomainData(this.samples);
    this.latest = blockLevel(this.samples);
    if (this.phaseValue === 'recording') {
      this.envelopePeak = Math.max(this.envelopePeak, this.latest.peak);
      // One envelope point per ~50 ms (every other reading).
      if (this.envelope.length < Math.floor(this.elapsedMs() / 50)) {
        this.envelope.push(Math.round(Math.min(1, this.envelopePeak) * 1000) / 1000);
        this.envelopePeak = 0;
      }
    }
  }

  private beginRecording(): void {
    if (this.cancelled || !this.recorder || this.recorder.state !== 'inactive') return;
    try {
      this.recorder.start(1000);
    } catch {
      void this.cancel();
      return;
    }
    this.startedPerf = performance.now();
    this.startedAt = Date.now();
    this.setPhase('recording');
    this.later(() => {
      void this.stop(true).then((result) => {
        for (const fn of [...this.limitListeners]) fn(result);
      });
    }, MAX_TAKE_MS);
  }

  private stopMetronome(): void {
    const m = this.metronome;
    this.metronome = null;
    if (m) m.dispose();
  }

  /** Stop and hand back the recording (null when nothing was recorded: stopped during the count-in). */
  stop(hitLimit = false): Promise<FinishedRecording | null> {
    if (this.stopping) return this.stopping;
    if (this.phaseValue === 'idle') return Promise.resolve(null);
    if (this.phaseValue !== 'recording' || !this.recorder || this.recorder.state === 'inactive') {
      return this.cancel().then(() => null);
    }
    const recorder = this.recorder;
    const durationMs = performance.now() - this.startedPerf;
    this.setPhase('finishing');
    this.stopping = new Promise<FinishedRecording | null>((resolve) => {
      const finish = () => {
        const mimeType = recorder.mimeType || this.options?.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mimeType });
        const opts = this.options;
        const result: FinishedRecording | null =
          blob.size > 0
            ? { blob, mimeType, durationMs, startedAt: this.startedAt, bpm: opts && (opts.countIn || opts.click) ? opts.bpm : null, envelope: this.envelope.slice(), hitLimit }
            : null;
        this.teardown();
        this.setPhase('idle');
        resolve(result);
      };
      recorder.onstop = finish;
      recorder.onerror = finish;
      try {
        recorder.stop();
      } catch {
        finish();
      }
    });
    return this.stopping;
  }

  /**
   * Stop without keeping anything (Stop pressed during the count-in, or leaving before the take
   * began). Does nothing once a stop is under way: that stop keeps the take (MediaRecorder may
   * still be handing over its last chunk, and tearing down now would lose all the others).
   */
  async cancel(): Promise<void> {
    if (this.stopping) return;
    this.cancelled = true;
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    } catch {
      // already stopped
    }
    this.teardown();
    this.setPhase('idle');
  }

  private teardown(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = null;
    this.stopMetronome();
    try {
      this.source?.disconnect();
    } catch {
      // gone already
    }
    this.source = null;
    this.analyser = null;
    this.samples = null;
    stopStream(this.stream);
    this.stream = null;
    this.release?.();
    this.release = null;
    this.awake?.();
    this.awake = null;
    this.recorder = null;
    this.chunks = [];
    this.latest = { db: -Infinity, peak: 0 };
  }
}
