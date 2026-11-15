/**
 * Counting chord changes by ear: the trainer's microphone logic on top of the pitch module's
 * `waitForChord`, independent of React and of the browser, so tests can drive it with replayed
 * analysis events.
 *
 * The learner holds chord 0 and changes round the set. The counter waits for the next chord (the
 * others are its rivals); a strum that rings as that chord is a clean change. A strum that does
 * not is reported with the matcher's analysis (for a hint), unless it simply sounds like the chord
 * the learner is still holding: strumming the old chord again is not a mistake.
 */
import type { Voicing } from '@/core/guitar';
import { matchChord, pitchClassesOf, waitForChord, type ChordMatch, type ChordSpec, type PitchSource } from '@/core/pitch';

/** The matcher's spec for a voicing: the pitch classes the shape really sounds, and its bass. */
export function specOf(voicing: Voicing): ChordSpec {
  const midi = [...voicing.midi].sort((a, b) => a - b);
  return { name: voicing.chord, pcs: pitchClassesOf(midi), bass: midi.length ? midi[0] % 12 : undefined };
}

/**
 * True when a failed attempt at `target` looks like the chord the learner is still holding:
 * every note heard that is not in the target belongs to `held`, and the target's missing notes
 * are not part of `held` either.
 */
export function soundsLikeHeld(attempt: Pick<ChordMatch, 'missing' | 'extra'>, held: ChordSpec): boolean {
  const pcs = new Set(held.pcs.map((p) => ((p % 12) + 12) % 12));
  if (attempt.extra.length === 0) return false;
  return attempt.extra.every((pc) => pcs.has(pc)) && attempt.missing.every((pc) => !pcs.has(pc));
}

/** Callbacks of the counter. */
export interface CounterEvents {
  /** A clean change to `index` (the chord now held), heard at `time` (audio clock). */
  onChange?: (count: number, index: number, time: number) => void;
  /** A strum that did not ring as the chord being changed to. */
  onUnclear?: (match: ChordMatch, target: number) => void;
}

/** Options of the counter. */
export interface CounterOptions {
  /** Score that counts as the chord (default 0.55: lenient, as the screen promises). */
  threshold?: number;
  /** Which chord the learner starts on (default 0). */
  startIndex?: number;
}

/** Counts clean changes round a set of chords from microphone events. */
export class ChangeCounter {
  private readonly source: PitchSource;
  private readonly specs: ChordSpec[];
  private readonly events: CounterEvents;
  private readonly threshold: number;
  private index: number;
  private wait: { cancel: () => void } | null = null;
  private running = false;
  /** Clean changes so far. */
  changes = 0;
  /** Strums that rang as neither the next chord nor the held one. */
  unclear = 0;

  constructor(source: PitchSource, specs: readonly ChordSpec[], events: CounterEvents = {}, opts: CounterOptions = {}) {
    if (specs.length < 2) throw new RangeError('A change needs at least two chords');
    this.source = source;
    this.specs = [...specs];
    this.events = events;
    this.threshold = opts.threshold ?? 0.55;
    this.index = opts.startIndex ?? 0;
  }

  /** The chord the learner should be holding now. */
  get held(): number {
    return this.index;
  }

  /** The chord the learner is changing to. */
  get target(): number {
    return (this.index + 1) % this.specs.length;
  }

  /** Start listening. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.listen();
  }

  /** Stop listening; returns the totals. */
  stop(): { changes: number; unclear: number } {
    this.running = false;
    this.wait?.cancel();
    this.wait = null;
    return { changes: this.changes, unclear: this.unclear };
  }

  private listen(): void {
    if (!this.running) return;
    const target = this.target;
    const held = this.specs[this.index];
    const rivals = this.specs.filter((_s, i) => i !== target);
    const w = waitForChord(this.source, this.specs[target], {
      threshold: this.threshold,
      rivals,
      onAttempt: (m) => {
        if (!this.running || soundsLikeHeld(m, held)) return;
        this.unclear++;
        // A failing screen callback must not stall the wait (it would be asked again on every frame).
        try {
          this.events.onUnclear?.(m, target);
        } catch (e) {
          console.warn('[chords] onUnclear failed', e);
        }
      },
    });
    this.wait = w;
    void w.then((r) => {
      if (!this.running || this.wait !== w) return;
      if (r.ok) {
        this.changes++;
        this.index = target;
        try {
          this.events.onChange?.(this.changes, target, r.time);
        } catch (e) {
          console.warn('[chords] onChange failed', e);
        }
      }
      this.listen();
    });
  }
}

/** Rank how well one chroma frame fits each chord of a set (for showing what was heard). */
export function bestOf(frame: ArrayLike<number>, specs: readonly ChordSpec[]): { index: number; match: ChordMatch } | null {
  let best: { index: number; match: ChordMatch } | null = null;
  specs.forEach((s, index) => {
    const match = matchChord(frame, s);
    if (!best || match.score > best.match.score) best = { index, match };
  });
  return best;
}
