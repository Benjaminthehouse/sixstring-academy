/**
 * Answer drafts: what a learner has built so far in an exercise, before pressing Check. Every
 * renderer keeps one of these and turns it into an `Answer` (or null while it is incomplete).
 * Pure, so the tap rules (pair, place, clear, toggle) are unit-tested once and shared by touch
 * and keyboard input alike.
 */
import type { Answer, NeckPosition, StaffAccidental } from '../../types';

// ── Choice ─────────────────────────────────────────────────────────────────────────────────────

/** Pick an option: single-answer questions replace the pick, multiple-answer ones toggle it. */
export function toggleChoice(selected: readonly number[], index: number, multiple: boolean): number[] {
  if (!multiple) return selected.length === 1 && selected[0] === index ? [...selected] : [index];
  return selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index].sort((a, b) => a - b);
}

// ── Match pairs ────────────────────────────────────────────────────────────────────────────────

/** Pairs made so far, plus an item picked on one side and waiting for its partner. */
export interface MatchDraft {
  pairs: Array<[number, number]>;
  left: number | null;
  right: number | null;
}

/** An empty match-pairs draft. */
export const EMPTY_MATCH: MatchDraft = { pairs: [], left: null, right: null };

/** The pair an item belongs to (index into `pairs`), or -1. */
export function pairOf(draft: MatchDraft, side: 'left' | 'right', index: number): number {
  return draft.pairs.findIndex((p) => p[side === 'left' ? 0 : 1] === index);
}

/**
 * Tap an item. Tapping a paired item undoes its pair (and picks it again); tapping an item while
 * one on the other side is waiting makes a pair; tapping the waiting item again puts it down.
 */
export function matchTap(draft: MatchDraft, side: 'left' | 'right', index: number): MatchDraft {
  const other = side === 'left' ? 'right' : 'left';
  const paired = pairOf(draft, side, index);
  if (paired >= 0) {
    const pairs = draft.pairs.filter((_p, i) => i !== paired);
    return { pairs, left: side === 'left' ? index : null, right: side === 'right' ? index : null };
  }
  if (draft[side] === index) return { ...draft, [side]: null };
  const waiting = draft[other];
  if (waiting !== null) {
    const pair: [number, number] = side === 'left' ? [index, waiting] : [waiting, index];
    return { pairs: [...draft.pairs, pair], left: null, right: null };
  }
  return { ...draft, [side]: index };
}

/** True when every left item has a partner. */
export function matchComplete(draft: MatchDraft, count: number): boolean {
  return draft.pairs.length === count;
}

// ── Order ──────────────────────────────────────────────────────────────────────────────────────

/** Tap a tile: a tile in the bank joins the end of the answer line, a placed tile goes back. */
export function orderTap(order: readonly number[], tile: number): number[] {
  return order.includes(tile) ? order.filter((t) => t !== tile) : [...order, tile];
}

/** Take back the last placed tile. */
export function orderBackspace(order: readonly number[]): number[] {
  return order.slice(0, -1);
}

// ── Fill blanks ────────────────────────────────────────────────────────────────────────────────

/** Which bank word (display index) sits in each blank, and the blank the next word goes to. */
export interface FillDraft {
  blanks: Array<number | null>;
  focus: number;
}

/** An empty draft for `count` blanks. */
export function emptyFill(count: number): FillDraft {
  return { blanks: Array.from({ length: count }, () => null), focus: 0 };
}

function nextEmpty(blanks: ReadonlyArray<number | null>, from: number): number {
  for (let k = 0; k < blanks.length; k++) {
    const i = (from + k) % blanks.length;
    if (blanks[i] === null) return i;
  }
  return Math.min(from, blanks.length - 1);
}

/**
 * Put a bank word into the focused blank (replacing what was there). A word already used elsewhere
 * moves. Focus then goes to the next empty blank.
 */
export function fillPlace(draft: FillDraft, word: number): FillDraft {
  if (draft.blanks.length === 0) return draft;
  const blanks = draft.blanks.map((b) => (b === word ? null : b));
  const at = Math.min(Math.max(0, draft.focus), blanks.length - 1);
  blanks[at] = word;
  return { blanks, focus: nextEmpty(blanks, at + 1) };
}

/** Tap a blank: an empty one takes the focus, a filled one gives its word back and takes the focus. */
export function fillTapBlank(draft: FillDraft, blank: number): FillDraft {
  if (blank < 0 || blank >= draft.blanks.length) return draft;
  const blanks = [...draft.blanks];
  blanks[blank] = null;
  return { blanks, focus: blank };
}

/** Clear the most recently filled blank before the focus (Backspace). */
export function fillBackspace(draft: FillDraft): FillDraft {
  for (let k = 1; k <= draft.blanks.length; k++) {
    const i = (draft.focus - k + draft.blanks.length) % draft.blanks.length;
    if (draft.blanks[i] !== null) return fillTapBlank(draft, i);
  }
  return draft;
}

/** The words in each blank, as the answer wants them. */
export function fillWords(draft: FillDraft, bank: readonly string[]): Array<string | null> {
  return draft.blanks.map((b) => (b === null ? null : (bank[b] ?? null)));
}

// ── Fretboard ──────────────────────────────────────────────────────────────────────────────────

const samePos = (a: NeckPosition, b: NeckPosition): boolean => a.string === b.string && a.fret === b.fret;

/** Tap a position: `one` keeps a single pick, `all` toggles each position. */
export function findTap(positions: readonly NeckPosition[], pos: NeckPosition, mode: 'one' | 'all'): NeckPosition[] {
  const has = positions.some((p) => samePos(p, pos));
  if (mode === 'one') return has ? [] : [{ string: pos.string, fret: pos.fret }];
  return has ? positions.filter((p) => !samePos(p, pos)) : [...positions, { string: pos.string, fret: pos.fret }];
}

/**
 * Tap a cell of the chord grid (`frets` low to high, `string` 1 = thinnest). A fretted cell puts
 * the finger there (tapping it again lifts it: the string rings open); the open column switches
 * the string between open and not played.
 */
export function chordTap(frets: ReadonlyArray<number | null>, string: number, fret: number): Array<number | null> {
  const out = [...frets];
  const i = frets.length - string;
  if (i < 0 || i >= out.length) return out;
  if (fret === 0) out[i] = out[i] === null ? 0 : out[i] === 0 ? null : 0;
  else out[i] = out[i] === fret ? 0 : fret;
  return out;
}

// ── Staff ──────────────────────────────────────────────────────────────────────────────────────

/** A note placed on the staff. */
export interface StaffDraft {
  position: number | null;
  accidental: StaffAccidental | null;
}

/** Toggle an accidental: picking the one already chosen removes it. */
export function toggleAccidental(draft: StaffDraft, accidental: StaffAccidental): StaffDraft {
  return { ...draft, accidental: draft.accidental === accidental ? null : accidental };
}

/** Move the placed note up or down by steps (arrow keys), within the range. */
export function nudgePosition(draft: StaffDraft, by: number, range: readonly [number, number], start = 4): StaffDraft {
  const from = draft.position ?? start - by;
  return { ...draft, position: Math.min(range[1], Math.max(range[0], from + by)) };
}

// ── Answers ────────────────────────────────────────────────────────────────────────────────────

/** True when an answer has something in it worth checking (an empty pick cannot be checked). */
export function isCheckable(answer: Answer | null): answer is Answer {
  if (!answer) return false;
  switch (answer.type) {
    case 'choice':
    case 'listen-choice':
      return answer.selected.length > 0;
    case 'order':
      return answer.order.length > 0;
    case 'fill-blanks':
      return answer.blanks.every((b) => b !== null);
    case 'type-answer':
    case 'fretboard-name':
    case 'staff-read':
      return answer.text.trim().length > 0;
    case 'fretboard-find':
      return answer.positions.length > 0;
    case 'chord-build':
      return answer.text !== undefined ? answer.text.trim().length > 0 : (answer.frets ?? []).some((f) => f !== null);
    case 'staff-place':
      return Number.isFinite(answer.position);
    case 'match-pairs':
      return answer.pairs.length > 0;
    default:
      return true;
  }
}
