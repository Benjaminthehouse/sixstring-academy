/**
 * Fretting-hand fingering for single-note lines (scale patterns, arpeggios, runs).
 *
 * The model is the classical one: the hand sits in a *position* (the fret under the index
 * finger) and each finger owns one fret: finger = fret - position + 1. Anything else is said out
 * loud: a `shift` moves the hand to a new position, a `stretch` reaches a fret outside the
 * position without moving the hand. `checkFingering` verifies exactly that contract.
 */
import type { Finger, FretPosition } from './types';

/** The fingering of one note of a line. */
export interface NoteFingering {
  /** 1–4, or 0 for an open string. */
  finger: Finger;
  /** The finger reaches outside one-finger-per-fret while the hand stays where it is. */
  stretch: boolean;
  /** The hand moves to a new position to play this note. */
  shift: boolean;
}

/** How `fingerLine` treats the notes on one string. */
export interface FingerLineOptions {
  /**
   * The position the hand lives in (position playing: CAGED shapes, boxes). The hand leaves it
   * only for a string that does not fit, and comes back as soon as a string needs it to.
   * Without it the hand stays wherever the previous notes left it (runs along the neck).
   */
  home?: number;
  /**
   * Keep the notes of a string under one hand placement even when they span up to six frets,
   * marking the stretch (three-notes-per-string playing).
   */
  wide?: boolean;
  /**
   * Frets one hand placement may cover beyond its lowest note before the line is split into a
   * shift: 3 (default) is strict one-finger-per-fret, 4 allows a one-fret stretch.
   */
  reach?: 3 | 4;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Split ascending frets into groups spanning at most `limit` frets beyond their first note; a stretched group holds three notes at most. */
function splitByReach(frets: number[], limit: number): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  for (const fret of frets) {
    const wouldStretch = fret - (current[0] ?? fret) > 3;
    if (current.length && (fret - current[0] > limit || current.length >= 4 || (wouldStretch && current.length >= 3))) {
      groups.push(current);
      current = [];
    }
    current.push(fret);
  }
  if (current.length) groups.push(current);
  return groups;
}

/** Fingers for a group that needs a stretch: outer notes on 1 and 4, inner ones on the nearer side. */
function stretchFingers(frets: number[]): Finger[] {
  if (frets.length === 2) return [1, 4];
  if (frets.length === 3) return [1, frets[1] - frets[0] <= frets[2] - frets[1] ? 2 : 3, 4];
  return [1, 2, 3, 4];
}

/**
 * Suggest fingers for a line of notes given in playing order (ascending within each string).
 * Open strings get finger 0. Returns one entry per note; see `FingerLineOptions` for the two styles.
 */
export function fingerLine(notes: readonly FretPosition[], opts: FingerLineOptions = {}): NoteFingering[] {
  const out: NoteFingering[] = notes.map(() => ({ finger: 0 as Finger, stretch: false, shift: false }));
  let hand: number | null = null;
  let start = 0;
  while (start < notes.length) {
    let end = start;
    while (end + 1 < notes.length && notes[end + 1].string === notes[start].string && notes[end + 1].fret > notes[end].fret) end++;
    // Indices of the fretted notes of this string segment, ascending.
    const fretted: number[] = [];
    for (let i = start; i <= end; i++) if (notes[i].fret > 0) fretted.push(i);
    const frets = fretted.map((i) => notes[i].fret);
    if (!frets.length) {
      start = end + 1;
      continue;
    }
    const span = frets[frets.length - 1] - frets[0];
    // A reach of more than two frets beyond one-finger-per-fret is not a stretch any more: shift instead.
    const together = opts.wide ? (frets.length <= 3 ? span <= 5 : span <= 4) : opts.home !== undefined ? span <= 4 : span <= (opts.reach ?? 3);
    const groups = frets.length <= 4 && together ? [frets] : splitByReach(frets, opts.wide ? 4 : opts.reach ?? 3);
    let cursor = 0;
    for (const group of groups) {
      const low = group[0];
      const high = group[group.length - 1];
      // Stay put when the notes fit under the hand as it is; otherwise head for home (or the notes).
      const fitsHand = hand !== null && low >= hand && high <= hand + 3;
      const want: number = fitsHand ? hand! : cursor === 0 ? opts.home ?? hand ?? low : hand ?? low;
      let position: number;
      let fingers: Finger[];
      if (high - low <= 3) {
        position = clamp(want, Math.max(1, high - 3), low);
        fingers = group.map((fret) => (fret - position + 1) as Finger);
      } else {
        // The index reaches down when the hand already sits one fret above the lowest note;
        // otherwise the hand goes to the lowest note and the other fingers reach up.
        position = hand === low + 1 && high - hand <= 3 ? hand : low;
        fingers = stretchFingers(group);
      }
      group.forEach((fret, k) => {
        const index = fretted[cursor + k];
        const finger = fingers[k];
        const inPlace = fret - finger + 1 === position;
        out[index] = { finger, stretch: !inPlace, shift: k === 0 && hand !== null && hand !== position };
      });
      hand = position;
      cursor += group.length;
    }
    start = end + 1;
  }
  return out;
}

/** A note with its fingering, as `checkFingering` reads it. */
export interface FingeredNote extends FretPosition, NoteFingering {}

/**
 * Check a fingered line against the one-finger-per-fret contract. Returns a list of problems,
 * empty when the fingering is consistent:
 *  - open strings have finger 0 and fretted notes a finger 1–4;
 *  - a note whose finger does not sit on its own fret of the current position is marked `stretch`
 *    or `shift`; a stretch reaches at most two frets beyond its place;
 *  - on one string, without a shift, a higher fret never takes a lower finger.
 */
export function checkFingering(notes: readonly FingeredNote[]): string[] {
  const problems: string[] = [];
  let hand: number | null = null;
  notes.forEach((n, i) => {
    const where = `note ${i} (string ${n.string}, fret ${n.fret})`;
    if (n.fret === 0) {
      if (n.finger !== 0) problems.push(`${where}: an open string cannot have finger ${n.finger}`);
      return;
    }
    if (n.finger < 1 || n.finger > 4) {
      problems.push(`${where}: finger ${n.finger} is not 1–4`);
      return;
    }
    const position = n.fret - n.finger + 1;
    if (hand === null || n.shift) {
      // A shift lands the hand on the note: the same note cannot also be a stretch.
      if (n.stretch) problems.push(`${where}: marked as both a shift and a stretch`);
      hand = position;
    } else if (position !== hand) {
      if (!n.stretch) problems.push(`${where}: finger ${n.finger} is off its fret in position ${hand} with no stretch or shift`);
      else if (Math.abs(position - hand) > 2) problems.push(`${where}: a stretch of ${Math.abs(position - hand)} frets is not playable`);
    }
    const prev = notes[i - 1];
    if (prev && prev.string === n.string && prev.fret > 0 && !n.shift) {
      if (n.fret > prev.fret && n.finger <= prev.finger) problems.push(`${where}: higher fret with a lower or equal finger than the note before`);
      if (n.fret < prev.fret && n.finger >= prev.finger) problems.push(`${where}: lower fret with a higher or equal finger than the note before`);
    }
  });
  return problems;
}
