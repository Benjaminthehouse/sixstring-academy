/**
 * One strum, one step. A strummed chord rings for a second or more, and the microphone reports
 * its chroma about 20 times a second the whole while. Without a gate every one of those frames
 * counts as playing the next chord as well: wait mode raced through a strum-along song on a
 * single strum, and flow mode could grade the ringing chord as an early hit on the next beat.
 *
 * After a chord is counted the gate closes. It opens again on the next strum: an `onset` from the
 * pitch tracker later than the chord counted, or, should the tracker miss one, the sound swelling
 * again after it had died down a little. While a chord is waited on, the gate also keeps the notes
 * of the chord just counted (re-detected as it rings) from saying anything about the next one.
 * Times are on the audio clock. Pure: unit-tested.
 */

/** How much the level must rise over its low point since the last chord for a new strum (dB). */
export const RESTRUM_RISE_DB = 4;
/** How far the ringing chord must first fall from its peak (dB), so its own attack is not a "new" strum. */
export const RESTRUM_FALL_DB = 3;
/** An onset this close after the counted chord is that chord's own (s). */
const SAME_STRUM_S = 0.03;

/** Opens for a chord, closes once it is counted, opens again on the next strum. */
export class StrumGate {
  private closedAt: number | null = null;
  private peak = -Infinity;
  private floor = Infinity;

  /** Whether the next chord heard may be counted. */
  get open(): boolean {
    return this.closedAt === null;
  }

  /** The tracker heard a pluck or strum at `time`. */
  onset(time: number): void {
    if (this.closedAt !== null && time > this.closedAt + SAME_STRUM_S) this.reset();
  }

  /** Feed the level (dBFS) of every chroma frame, before asking `open`. */
  level(db: number): void {
    if (this.closedAt === null || !Number.isFinite(db)) return;
    if (db > this.peak && this.floor === Infinity) {
      // Still the attack of the chord just counted.
      this.peak = db;
      return;
    }
    if (db < this.floor) this.floor = db;
    if (this.peak - this.floor >= RESTRUM_FALL_DB && db - this.floor >= RESTRUM_RISE_DB) this.reset();
  }

  /** A chord heard at `time` (its level `db`) was counted: wait for the next strum. */
  close(time: number, db: number): void {
    this.closedAt = Number.isFinite(time) ? time : 0;
    this.peak = Number.isFinite(db) ? db : -Infinity;
    this.floor = Infinity;
  }

  /** Start afresh (a new run, a jump, a skipped chord). */
  reset(): void {
    this.closedAt = null;
    this.peak = -Infinity;
    this.floor = Infinity;
  }
}

/** How long after the app sounds a hint the microphone may still be hearing its attack (s). */
export const HINT_ECHO_S = 0.7;

/**
 * The app's own hint, heard back. In wait mode "Show me" (or the hint that comes by itself after
 * a few misses) plays the note or chord through the speakers, and the microphone hears it: without
 * a guard the app's own chord counted as the learner's ("Yes.") or as another wrong strum. For a
 * moment after the hint sounds nothing heard counts; the learner listens first, then plays.
 */
export class HintEcho {
  private until = -Infinity;

  /** The app sounded a hint at audio time `now`; the microphone hears it `latency` later. */
  sounded(now: number, latency: number, seconds = HINT_ECHO_S): void {
    if (!Number.isFinite(now)) return;
    this.until = Math.max(this.until, now + Math.max(0, Number.isFinite(latency) ? latency : 0) + seconds);
  }

  /** Whether something heard at audio time `time` may be the hint itself. */
  covers(time: number): boolean {
    return Number.isFinite(time) && time < this.until;
  }

  /** Audio time the guard lasts until (-Infinity when none). */
  get end(): number {
    return this.until;
  }

  /** Forget it (a new run). */
  reset(): void {
    this.until = -Infinity;
  }
}
