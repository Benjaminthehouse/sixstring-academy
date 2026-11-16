/**
 * One strum, one step. A strummed chord rings for a second or more, and the microphone reports
 * its chroma about 20 times a second the whole while. Without a gate every one of those frames
 * counts as playing the next chord as well: wait mode raced through a strum-along song on a
 * single strum, and flow mode could grade the ringing chord as an early hit on the next beat.
 *
 * After a chord is counted the gate closes. It opens again on the next strum: an `onset` from the
 * pitch tracker later than the chord counted, or, should the tracker miss one, the sound swelling
 * again after it had died down a little. Times are on the audio clock. Pure: unit-tested.
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
