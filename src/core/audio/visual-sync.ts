/**
 * Run UI callbacks at the moment a scheduled sound is actually heard.
 *
 * Audio is scheduled ahead of time (the look-ahead window), so a callback fired at scheduling time
 * would flash the beat light ~100 ms early. Callers queue the callback with the sound's audio-clock
 * time instead; a requestAnimationFrame pump fires it when the output reaches that time.
 */

interface Entry {
  time: number;
  fn: () => void;
}

/** Callbacks older than this when the pump gets to them are dropped (tab was in the background). */
const STALE_SECONDS = 0.5;
/** Fire up to half a frame early, so a flash lands on the frame nearest the sound. */
const FRAME_LEAD = 0.008;

/** A time-ordered queue of callbacks keyed by audio-clock time. */
export class VisualQueue {
  private entries: Entry[] = [];
  private raf = 0;
  private readonly soundingNow: () => number;

  /** `soundingNow` returns the audio-clock time of what is leaving the speakers right now. */
  constructor(soundingNow: () => number) {
    this.soundingNow = soundingNow;
  }

  /** Queue `fn` to run when the output reaches audio time `time`. */
  add(time: number, fn: () => void): void {
    // A time that is not a number would sit at the head of the queue for ever and hold up everything
    // behind it: treat it as "now".
    if (!Number.isFinite(time)) time = this.soundingNow();
    if (typeof fn !== 'function') return;
    const e = this.entries;
    let i = e.length;
    while (i > 0 && e[i - 1].time > time) i--;
    e.splice(i, 0, { time, fn });
    this.pump();
  }

  /** Number of callbacks waiting. */
  get size(): number {
    return this.entries.length;
  }

  /** Run everything due at `now` (default: the current sounding time). Called by the pump; tests call it directly. */
  flush(now: number = this.soundingNow()): void {
    const e = this.entries;
    while (e.length && e[0].time <= now + FRAME_LEAD) {
      const entry = e.shift()!;
      if (now - entry.time > STALE_SECONDS) continue;
      try {
        entry.fn();
      } catch (err) {
        // A broken listener must not stop the clock for everyone else.
        if (typeof console !== 'undefined') console.error(err);
      }
    }
  }

  /** Drop everything that has not fired yet. */
  clear(): void {
    this.entries.length = 0;
    if (this.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private pump(): void {
    if (this.raf || typeof requestAnimationFrame !== 'function') return;
    const step = () => {
      this.raf = 0;
      this.flush();
      if (this.entries.length) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}
