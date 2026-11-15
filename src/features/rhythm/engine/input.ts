/**
 * Getting taps onto the audio clock: key presses, touches on the pad, and claps or strums heard
 * through the microphone.
 *
 * A tap is stamped with the audio-clock time of what the learner was hearing at that moment
 * (`soundingNow`), moved back by however long the event waited in the browser's queue. What is
 * left over (touch-screen delay, Bluetooth headphones, the learner's own habit of tapping a hair
 * early) is what calibration measures.
 */
import { engineClock, getAudioContext, getEngine, unlockAudio, type TransportClock } from '@/core/audio';
import { PitchTracker, type OnsetEvent } from '@/core/pitch';
import type { MediaFailure } from '@/core/platform';

/** Audio-clock time of an input event (now, when there is no event). */
export function tapTime(event?: { timeStamp: number } | null, clock: TransportClock = engineClock): number {
  const now = clock.soundingNow();
  if (!event || typeof performance === 'undefined') return now;
  const age = (performance.now() - event.timeStamp) / 1000;
  // A stamp from another time base (or a stalled page) is not trusted beyond a quarter of a second.
  return age > 0 && age < 0.25 ? now - age : now;
}

/** Keys that tap. F is the left hand (downstroke where direction matters), J the right (upstroke), Space either. */
export const TAP_KEYS: Record<string, 'D' | 'U' | undefined> = { Space: undefined, KeyF: 'D', KeyJ: 'U' };

/** True when a key event should be left to the control it was typed into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (el.isContentEditable) return true;
  return !!el.closest('input, textarea, select, [role="dialog"], [role="menu"], [role="listbox"]');
}

/** Why the microphone could not be started. */
export type MicFailure = MediaFailure | 'audio-failed';

/** What a running microphone reports about itself. */
export interface MicInfo {
  /** Latency the browser reports for output plus input, ms: the offset used until the learner calibrates. */
  latencyMs: number;
  deviceLabel: string;
}

/**
 * The microphone as a source of onsets on the app's own audio clock. One per screen; `stop()`
 * releases the device.
 */
export class MicInput {
  private tracker: PitchTracker | null = null;
  private release: (() => void) | null = null;
  private off: Array<() => void> = [];
  /** Input level in dBFS, updated about thirty times a second (for the meter). */
  levelDb = -100;
  /** Set while the input is clipping. */
  clipping = false;
  info: MicInfo | null = null;

  constructor(private readonly onOnset: (onset: OnsetEvent) => void, private readonly onLost?: () => void) {}

  /** True while the microphone is open. */
  get running(): boolean {
    return this.tracker?.status === 'running';
  }

  /** Open the microphone. Call from a click or tap handler. */
  async start(deviceId?: string): Promise<{ ok: true; info: MicInfo } | { ok: false; reason: MicFailure }> {
    this.stop();
    await unlockAudio();
    let ctx: AudioContext;
    try {
      ctx = getAudioContext();
    } catch {
      return { ok: false, reason: 'audio-failed' };
    }
    // Sharing the playback context puts every onset on the same clock as the clicks.
    const tracker = new PitchTracker({ audioContext: ctx, deviceId: deviceId || undefined, onset: { minIntervalMs: 70 } });
    const res = await tracker.start();
    if (!res.ok) {
      tracker.stop();
      return { ok: false, reason: res.reason };
    }
    this.tracker = tracker;
    // The engine suspends an idle context; the microphone needs it awake even through silent bars.
    this.release = getEngine().hold();
    this.off.push(tracker.on('onset', (o) => this.onOnset(o)));
    this.off.push(
      tracker.on('level', (l) => {
        this.levelDb = l.db;
        this.clipping = l.clipping;
      }),
    );
    this.off.push(
      tracker.onStatus((status, fault) => {
        if (status === 'stopped' && fault) this.onLost?.();
      }),
    );
    const input = tracker.info?.inputLatency ?? 0;
    const output = getEngine().outputLatency;
    this.info = { latencyMs: Math.round((input + output) * 1000) + 12, deviceLabel: tracker.info?.deviceLabel ?? '' };
    return { ok: true, info: this.info };
  }

  /** Close the microphone. */
  stop(): void {
    for (const off of this.off) off();
    this.off = [];
    this.tracker?.stop();
    this.tracker = null;
    this.release?.();
    this.release = null;
    this.levelDb = -100;
    this.clipping = false;
  }
}
