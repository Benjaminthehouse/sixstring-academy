/**
 * Wait mode with chords: what a strum that was not the chart's chord sounded like. A wrong chord
 * used to be met with silence (the chroma never matched, and note-ons mean little while a chord
 * rings). Now each strum is listened to for a moment after it starts: its chroma frames are
 * averaged and ranked against the song's chords and the common triads, and the learner hears what
 * it sounded like ("That sounded like Am. The chart says C."), or, when nothing stands out, which
 * chord tones were missing. A strum that matches in the meantime is never judged.
 *
 * Times are on the audio clock (seconds). Pure: unit-tested.
 */
import { averageChroma, rankChords, matchChord, type ChordSpec } from '@/core/pitch';
import { chord as parseChordSymbol, chordPcs, chroma as pcOf, isNoChord } from '@/core/theory';

/** What a strum sounded like, against the chord the chart wants. */
export type StrumVerdict =
  | { kind: 'other'; heard: string }
  | { kind: 'close'; missing: number[] }
  | { kind: 'unclear'; missing: number[] };

/** Listening window after a strum starts (s): skip the attack, then average this long. */
export const SETTLE_S = 0.11;
export const LISTEN_S = 0.32;
/** A chord heard must score at least this, and this much better than the chart's chord. */
const MIN_SCORE = 0.5;
const MARGIN = 0.08;

const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** The pitch-class spec of a chord symbol (its bass for slash chords), or null for N.C. or nonsense. */
export function chordSpec(symbol: string): ChordSpec | null {
  if (!symbol || isNoChord(symbol)) return null;
  try {
    const pcs = [...new Set(chordPcs(symbol))];
    if (pcs.length < 2) return null;
    let bass: number | undefined;
    try {
      const c = parseChordSymbol(symbol);
      bass = pcOf(c.bass ?? c.root);
    } catch {
      bass = undefined;
    }
    return { name: symbol, pcs, ...(bass !== undefined ? { bass } : {}) };
  } catch {
    return null;
  }
}

/** Candidates to name a strum by: the song's own chords first, then every major and minor triad. */
export function chordCandidates(symbols: Iterable<string>): ChordSpec[] {
  const out: ChordSpec[] = [];
  const seen = new Set<string>();
  const add = (s: ChordSpec | null) => {
    if (!s) return;
    const key = [...s.pcs].sort((a, b) => a - b).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const s of symbols) add(chordSpec(s));
  for (const r of ROOTS) {
    add(chordSpec(r));
    add(chordSpec(`${r}m`));
  }
  return out;
}

const samePcs = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Name a strum from its averaged chroma, against the chord the chart wants. */
export function judgeStrum(chroma: ArrayLike<number>, want: ChordSpec, candidates: readonly ChordSpec[]): StrumVerdict {
  const target = matchChord(chroma, want);
  const ranked = rankChords(chroma, candidates.filter((c) => !samePcs(c.pcs, want.pcs)));
  const best = ranked[0];
  if (best && best.score >= MIN_SCORE && best.score >= target.score + MARGIN) return { kind: 'other', heard: best.chord.name ?? '' };
  // The chart's chord, mostly: most of the sound on its tones and most of them there.
  if (target.score >= MIN_SCORE || (target.purity >= 0.5 && target.coverage >= 0.66)) return { kind: 'close', missing: [...target.missing] };
  return { kind: 'unclear', missing: [...target.missing] };
}

/**
 * Collects the chroma of each strum while a chord is waited on and judges it once. Feed it
 * `onset` (a strum started), every chroma `frame`, and `cancel` when the chord matched.
 */
export class StrumListener {
  private start: number | null = null;
  private frames: number[][] = [];
  private judged = false;

  /** True while a strum is being listened to (not yet judged). */
  get listening(): boolean {
    return this.start !== null && !this.judged;
  }

  /** A strum started at `time`. */
  onset(time: number): void {
    if (!Number.isFinite(time)) return;
    // A second onset inside the strum (the strings are struck one after another) is the same strum.
    if (this.start !== null && !this.judged && time - this.start < SETTLE_S) return;
    this.start = time;
    this.frames = [];
    this.judged = false;
  }

  /**
   * A chroma frame at `time`: collected while the strum is listened to; once the window has passed
   * the strum is judged (once) against `want`. Returns the verdict on that frame, else null.
   */
  frame(time: number, chroma: ArrayLike<number>, want: ChordSpec, candidates: readonly ChordSpec[]): StrumVerdict | null {
    if (this.start === null || this.judged) return null;
    const since = time - this.start;
    if (since < SETTLE_S) return null;
    if (since <= SETTLE_S + LISTEN_S) {
      this.frames.push(Array.from(chroma));
      return null;
    }
    this.judged = true;
    if (this.frames.length < 2) return null;
    return judgeStrum(averageChroma(this.frames), want, candidates);
  }

  /** The chord matched (or the target changed): forget the strum being listened to. */
  cancel(): void {
    this.start = null;
    this.frames = [];
    this.judged = false;
  }
}

/** Kind words for a verdict, as the wait prompt says them. `chart` is the chord wanted as shown ("C"), or null while the chart is hidden. */
export function strumWords(v: StrumVerdict, chart: string | null, show: (symbol: string) => string, noteName: (pc: number) => string): string {
  if (v.kind === 'other') {
    const heard = show(v.heard);
    return chart ? `That sounded like ${heard}. The chart says ${chart}: give it another go.` : `That sounded like ${heard}, not the chord here. Have another go, or tap Show me.`;
  }
  const missing = v.missing.map(noteName).filter(Boolean);
  const which = missing.length ? ` ${missing.length === 1 ? `The ${missing[0]} did` : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]} did`} not ring out.` : '';
  if (v.kind === 'close') return `Nearly${chart ? ` ${chart}` : ''}.${which || ' One string did not ring clearly.'} Strum it again.`;
  return `Not ${chart ?? 'that one'} yet.${which} Check each string rings, then strum again.`;
}
