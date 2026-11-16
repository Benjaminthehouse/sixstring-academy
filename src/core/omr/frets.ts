/**
 * A fret the neck has. A number read past the last fret ("92", "121") is a misreading: two numbers
 * printed side by side read as one, or a smudge taken for a digit. It never reaches the reading as
 * it is: the best reading of its own digits that is on the neck takes its place, as a guess (below
 * 0.5), the other readings of its digits are offered as one-tap fixes, and an issue says what was
 * read. Used by the tab reader and, for any recognizer, by the page assembler.
 */
import { MAX_READ_FRET, type OmrIssue } from './types';

/** A fret moved onto the neck. */
export interface FretOnNeck {
  fret: number;
  /** Other frets its digits could be, best first (all on the neck). */
  alternatives: number[];
  /** What was read, for the issue. */
  readAs: number;
  issue: OmrIssue;
}

/** True for a fret the neck has. */
export function isOnNeck(fret: number, max = MAX_READ_FRET): boolean {
  return Number.isInteger(fret) && fret >= 0 && fret <= max;
}

/**
 * Readings of a digit string that are frets: every run of one or two digits (no leading zero),
 * longer runs first (they explain more of the ink), then from the left (the first note played).
 */
export function fretsInDigits(digits: string, max = MAX_READ_FRET): number[] {
  const found: { value: number; len: number; at: number }[] = [];
  for (let len = 2; len >= 1; len--) {
    for (let at = 0; at + len <= digits.length; at++) {
      const run = digits.slice(at, at + len);
      if (!/^\d+$/.test(run) || (len > 1 && run[0] === '0')) continue;
      const value = Number(run);
      if (value <= max) found.push({ value, len, at });
    }
  }
  const out: number[] = [];
  for (const f of found) if (!out.includes(f.value)) out.push(f.value);
  return out;
}

/**
 * Move a fret read past the last fret onto the neck (null when it is on the neck already). Other
 * readings the recognizer had come first when they are on the neck; then the readings of the digits.
 */
export function fretOnNeck(fret: number, others: readonly number[] = [], max = MAX_READ_FRET): FretOnNeck | null {
  if (isOnNeck(fret, max)) return null;
  const digits = String(Math.abs(Math.trunc(Number.isFinite(fret) ? fret : 0)));
  const options = [...others.filter((f) => isOnNeck(f, max)), ...fretsInDigits(digits, max)].filter((f, i, all) => all.indexOf(f) === i);
  const chosen = options[0] ?? 0;
  return {
    fret: chosen,
    alternatives: options.filter((f) => f !== chosen).slice(0, 3),
    readAs: fret,
    issue: { code: 'past-the-neck', message: `Read as ${fret}, which is past the last fret: probably two numbers side by side, or a smudge.` },
  };
}
