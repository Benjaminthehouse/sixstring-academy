/**
 * The microphone side of a take: one `PitchTracker` kept open for the visit (so the permission
 * prompt appears once), and a recorder that collects what one take needs: notes, onsets, pitch
 * readings and levels. The analysis itself is pure (`model/`).
 */
import { getAudioContext, getEngine, unlockAudio } from '@/core/audio';
import { NoteRecorder, PitchTracker, type RecordedNote, type TrackerStartResult } from '@/core/pitch';
import { micOptions } from '@/core/settings';
import { isCalibrated, loadCalibration, offsetFor } from '@/features/rhythm/core/calibration';
import type { LevelSample } from '../model/levels';
import type { PitchSample } from '../model/pitchshape';

/** Everything heard in one take, on the audio clock. */
export interface TakeData {
  notes: RecordedNote[];
  onsets: number[];
  pitch: PitchSample[];
  levels: LevelSample[];
  /** Audio-clock seconds the take began and ended. */
  from: number;
  to: number;
}

/** A live input reading for the level meter. */
export interface InputLevel {
  db: number;
  gateDb: number;
  clipping: boolean;
}

/** Keeps the microphone open for a visit and records takes. */
export class TakeListener {
  private tracker: PitchTracker | null = null;
  private release: (() => void) | null = null;
  private recorder: NoteRecorder | null = null;
  private take: TakeData | null = null;
  private offs: Array<() => void> = [];
  private levelFns = new Set<(l: InputLevel) => void>();
  private lostFns = new Set<() => void>();

  /** Whether the microphone is open. */
  get open(): boolean {
    return this.tracker !== null && this.tracker.status === 'running';
  }

  /** Open the microphone (call from a tap). Resolves with the tracker's answer. */
  async start(): Promise<TrackerStartResult> {
    if (this.open) return { ok: true };
    await unlockAudio();
    let ctx: AudioContext | undefined;
    try {
      ctx = getAudioContext();
    } catch {
      ctx = undefined;
    }
    const tracker = new PitchTracker({ ...micOptions(), ...(ctx ? { audioContext: ctx } : {}) });
    this.tracker = tracker;
    const res = await tracker.start();
    if (!res.ok) {
      if (this.tracker === tracker) this.tracker = null;
      tracker.stop();
      return res;
    }
    if (this.tracker !== tracker) {
      tracker.stop();
      return { ok: false, reason: 'audio-failed', detail: 'superseded' };
    }
    // A shared context is ours to keep awake while we listen.
    try {
      if (ctx) this.release = getEngine().hold();
    } catch {
      this.release = null;
    }
    this.offs.push(
      tracker.on('level', (e) => {
        this.take?.levels.push({ time: e.time, db: e.db });
        for (const fn of this.levelFns) fn({ db: e.db, gateDb: e.gateDb, clipping: e.clipping });
      }),
      tracker.on('onset', (e) => this.take?.onsets.push(e.time)),
      tracker.on('pitch', (r) => this.take?.pitch.push({ time: r.time, freq: r.freq, clarity: r.clarity })),
      tracker.onStatus((status, fault) => {
        if (status === 'stopped' && fault) {
          this.stop();
          for (const fn of this.lostFns) fn();
        }
      }),
    );
    return res;
  }

  /** Live input level, about 30 times a second. Returns the unsubscribe function. */
  onLevel(fn: (l: InputLevel) => void): () => void {
    this.levelFns.add(fn);
    return () => this.levelFns.delete(fn);
  }

  /** Called when the microphone goes away mid-visit. */
  onLost(fn: () => void): () => void {
    this.lostFns.add(fn);
    return () => this.lostFns.delete(fn);
  }

  /**
   * Seconds from a click being played to a note played with it being stamped by the microphone:
   * the delay measured by the rhythm calibration on this device when there is one, else what the
   * browser reports for its output and input (with the rhythm game's allowance for the rest).
   */
  latency(): { seconds: number; calibrated: boolean } {
    const cal = loadCalibration();
    let reported = 60;
    try {
      reported = Math.round(((this.tracker?.info?.inputLatency ?? 0) + getEngine().outputLatency) * 1000) + 12;
    } catch {
      // No engine: the default.
    }
    return { seconds: offsetFor(cal, 'mic', reported) / 1000, calibrated: isCalibrated(cal, 'mic') };
  }

  /** The audio clock now (the tracker's context). */
  now(): number {
    return this.tracker?.audioContext?.currentTime ?? 0;
  }

  /** Begin recording a take. */
  begin(): void {
    if (!this.tracker) return;
    this.recorder?.stop();
    this.recorder = new NoteRecorder(this.tracker, { minDurationMs: 45 });
    this.recorder.start();
    this.take = { notes: [], onsets: [], pitch: [], levels: [], from: this.now(), to: 0 };
  }

  /** Stop recording and hand over the take. */
  end(): TakeData {
    const take = this.take ?? { notes: [], onsets: [], pitch: [], levels: [], from: 0, to: 0 };
    take.notes = this.recorder?.stop() ?? [];
    take.to = this.now();
    this.recorder = null;
    this.take = null;
    return take;
  }

  /** Whether a take is being recorded. */
  get recording(): boolean {
    return this.take !== null;
  }

  /** Close the microphone. */
  stop(): void {
    this.recorder?.stop();
    this.recorder = null;
    this.take = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.tracker?.stop();
    this.tracker = null;
    this.release?.();
    this.release = null;
  }
}
