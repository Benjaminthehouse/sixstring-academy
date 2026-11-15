/**
 * Notes played on the learner's guitar, for "play it back on your guitar". A small controller
 * around a pitch tracker so the screen's hook stays thin and the start/stop races are tested:
 * the microphone is released however the screen goes away, even while the browser is still
 * asking for permission.
 */
import type { MediaFailure } from '@/core/platform';
import type { NoteOnEvent, TrackerStartResult, TrackerStatus, TrackerFault } from '@/core/pitch';

/** Microphone state for "play it back on your guitar". */
export type MicStatus = 'off' | 'starting' | 'on' | 'failed';

/** The part of `PitchTracker` the controller uses (a fake in tests). */
export interface MicTracker {
  start(): Promise<TrackerStartResult>;
  stop(): void;
  on(type: 'noteon', fn: (e: Pick<NoteOnEvent, 'midi'>) => void): unknown;
  onStatus(fn: (status: TrackerStatus, fault?: TrackerFault) => void): unknown;
}

/** What the controller reports. */
export interface MicCallbacks {
  /** A new note was played (already filtered). */
  note(midi: number): void;
  /** True while the app itself is playing: the speaker is in the microphone, so notes are ignored. */
  ignore(): boolean;
  /** The state changed. */
  status(status: MicStatus, failure: MediaFailure | null): void;
}

/** Lowest note taken: a knock on the guitar's body reads as F♯2–A2, and the melodies never go there. */
export const LOWEST_HEARD = 46;

/** One microphone session at a time; `dispose()` releases everything for good. */
export class MicNotes {
  private tracker: MicTracker | null = null;
  private disposed = false;

  constructor(
    private readonly create: () => MicTracker,
    private readonly cb: MicCallbacks,
  ) {}

  /** Open the microphone (call from a tap). */
  async start(): Promise<void> {
    if (this.tracker || this.disposed) return;
    const t = this.create();
    // Held before the permission prompt resolves, so a stop or dispose meanwhile releases it.
    this.tracker = t;
    this.cb.status('starting', null);
    const res = await t.start();
    if (this.tracker !== t || this.disposed) {
      t.stop();
      return;
    }
    if (!res.ok) {
      t.stop();
      this.tracker = null;
      if (res.detail === 'superseded') return;
      this.cb.status('failed', res.reason === 'audio-failed' ? 'unknown' : res.reason);
      return;
    }
    t.on('noteon', (e) => {
      if (this.tracker !== t || this.cb.ignore() || e.midi < LOWEST_HEARD) return;
      this.cb.note(e.midi);
    });
    t.onStatus((s, fault) => {
      if (this.tracker !== t || s !== 'stopped' || !fault) return;
      this.tracker = null;
      this.cb.status('failed', fault === 'device-lost' ? 'no-device' : 'unknown');
    });
    this.cb.status('on', null);
  }

  /** Close the microphone. */
  stop(): void {
    const t = this.tracker;
    this.tracker = null;
    t?.stop();
    if (!this.disposed) this.cb.status('off', null);
  }

  /** Close the microphone and ignore any later start. */
  dispose(): void {
    this.disposed = true;
    const t = this.tracker;
    this.tracker = null;
    t?.stop();
  }
}
