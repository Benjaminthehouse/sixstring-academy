/**
 * Subdivisions as the learner sees them: names, a one-line explanation, how many clicks each beat
 * of the current meter gets, and which choices actually differ in that meter (in 6/8 a "triplet"
 * of a dotted-quarter beat is just its three eighths, so it is not offered twice).
 */
import { SUBDIVISIONS, subdivisionOffsets, type Meter, type Subdivision } from '@/core/audio';

/** Words for one subdivision. */
export interface SubdivisionInfo {
  id: Subdivision;
  label: string;
  /** What it sounds like, in one line. */
  blurb: string;
}

/** Every subdivision with its name and explanation, in picker order. */
export const SUBDIVISION_INFO: Readonly<Record<Subdivision, SubdivisionInfo>> = {
  none: { id: 'none', label: 'Beats only', blurb: 'One click per beat. Start here.' },
  eighth: { id: 'eighth', label: 'Eighths', blurb: 'Each beat split in two: "1 and 2 and".' },
  triplet: { id: 'triplet', label: 'Triplets', blurb: 'Each beat split in three even parts: "1 trip-let".' },
  sixteenth: { id: 'sixteenth', label: 'Sixteenths', blurb: 'Each beat split in four: "1 e and a".' },
  swing: { id: 'swing', label: 'Swing', blurb: 'Long-short eighths, the bounce of blues and jazz.' },
  quintuplet: { id: 'quintuplet', label: 'Quintuplets', blurb: 'Five even notes per beat. A real stretch.' },
  sextuplet: { id: 'sextuplet', label: 'Sextuplets', blurb: 'Six even notes per beat: fast triplet runs.' },
};

/** One subdivision as offered in a meter. */
export interface SubdivisionChoice {
  id: Subdivision;
  /** Clicks in each beat of the bar (1 = just the beat). */
  perBeat: number[];
}

/** Clicks in each beat of `meter` for a subdivision. */
export function clicksPerBeat(meter: Meter, subdivision: Subdivision, swingRatio = 2 / 3): number[] {
  return meter.beats.map((b) => 1 + subdivisionOffsets(b.length, subdivision, swingRatio).length);
}

/**
 * The subdivisions worth offering in a meter: those that add clicks, without two choices that
 * would sound the same. `current` is always kept, so a stored choice never vanishes from the list.
 */
export function subdivisionChoices(meter: Meter, current?: Subdivision): SubdivisionChoice[] {
  const seen = new Set<string>();
  const out: SubdivisionChoice[] = [];
  for (const id of SUBDIVISIONS) {
    // The pattern of offsets, not just the counts: swing and eighths both have two clicks a beat.
    const shape = meter.beats.map((b) => subdivisionOffsets(b.length, id).join(',')).join('|');
    const perBeat = clicksPerBeat(meter, id);
    const adds = id === 'none' || perBeat.some((n) => n > 1);
    if ((adds && !seen.has(shape)) || id === current) out.push({ id, perBeat });
    seen.add(shape);
  }
  return out;
}

/** "2 clicks a beat", "2 or 3 clicks a beat" or "1 click a beat". */
export function perBeatWords(perBeat: readonly number[]): string {
  const distinct = [...new Set(perBeat)].sort((a, b) => a - b);
  if (!distinct.length) return '';
  const n = distinct.length === 1 ? String(distinct[0]) : `${distinct.slice(0, -1).join(', ')} or ${distinct[distinct.length - 1]}`;
  return `${n} ${distinct.length === 1 && distinct[0] === 1 ? 'click' : 'clicks'} a beat`;
}

/** Swing ratios the slider offers, as a share of the beat taken by the first eighth. */
export const SWING_MIN = 0.5;
/** Hardest swing offered (3:1). */
export const SWING_MAX = 0.75;

/** "Straight", "Light", "Triplet", "Hard" for a swing ratio. */
export function swingWords(ratio: number): string {
  if (ratio < 0.54) return 'Straight';
  if (ratio < 0.63) return 'Light';
  if (ratio < 0.7) return 'Triplet';
  return 'Hard';
}

/** A swing ratio within the offered range, rounded to a whole percent. */
export function clampSwing(ratio: number): number {
  if (!Number.isFinite(ratio)) return 2 / 3;
  const r = Math.max(SWING_MIN, Math.min(SWING_MAX, ratio));
  // 2/3 is the classic value: keep it exact rather than 0.67.
  return Math.abs(r - 2 / 3) < 0.005 ? 2 / 3 : Math.round(r * 100) / 100;
}
