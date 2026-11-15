/**
 * The neck as the trainer sees it: which positions a scope covers, what sounds there, the octave
 * shapes that carry a note from one string to another, and the landmarks (open strings, the
 * inlay dots, fret 12) that a learner uses as anchors to work a note out.
 */
import { isNatural, pcOf, pcsOf } from './notes';
import type { NeckContext, Pos, Scope } from './types';

/** Key of a position: `6:5` (string 6, fret 5). */
export function posKey(p: Pos): string {
  return `${p.string}:${p.fret}`;
}

/** The position behind a key, or null. */
export function parsePosKey(key: string): Pos | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(key);
  return m ? { string: Number(m[1]), fret: Number(m[2]) } : null;
}

/** Key of a pitch class item: `pc:9`. */
export function pcKey(pc: number): string {
  return `pc:${pcOf(pc)}`;
}

/** Number of strings of a tuning. */
export function stringCount(ctx: Pick<NeckContext, 'tuning'>): number {
  return ctx.tuning.length;
}

/** Open-string MIDI number of string `s` (1 = thinnest). */
export function openMidi(ctx: Pick<NeckContext, 'tuning'>, s: number): number {
  return ctx.tuning[ctx.tuning.length - s];
}

/** Sounding MIDI number at a position. */
export function midiAtPos(ctx: Pick<NeckContext, 'tuning'>, p: Pos): number {
  return openMidi(ctx, p.string) + p.fret;
}

/** Pitch class at a position. */
export function pcAt(ctx: Pick<NeckContext, 'tuning'>, p: Pos): number {
  return pcOf(midiAtPos(ctx, p));
}

/** Frets of a scope, low to high. */
export function scopeFrets(scope: Scope): number[] {
  const [a, b] = scope.frets;
  const out: number[] = [];
  for (let f = Math.max(0, a); f <= b; f++) if (!scope.onlyFrets || scope.onlyFrets.includes(f)) out.push(f);
  return out;
}

/** Every position a scope covers, string by string (thinnest first), fret by fret. */
export function scopePositions(scope: Scope, ctx: Pick<NeckContext, 'tuning'>): Pos[] {
  const allowed = new Set(pcsOf(scope.notes));
  const only = scope.only ? new Set(scope.only) : null;
  const n = stringCount(ctx);
  const out: Pos[] = [];
  for (const s of [...scope.strings].sort((a, b) => a - b)) {
    if (s < 1 || s > n) continue;
    for (const f of scopeFrets(scope)) {
      const p = { string: s, fret: f };
      if (!allowed.has(pcAt(ctx, p))) continue;
      if (only && !only.has(posKey(p))) continue;
      out.push(p);
    }
  }
  return out;
}

/** Places on one string, inside the scope's frets, where a pitch class sounds. */
export function placesOnString(ctx: Pick<NeckContext, 'tuning'>, string: number, pc: number, frets: readonly number[]): Pos[] {
  return frets.filter((f) => pcAt(ctx, { string, fret: f }) === pcOf(pc)).map((fret) => ({ string, fret }));
}

/** Every place in a scope's strings and frets where a pitch class sounds (the note set is not applied). */
export function placesInScope(scope: Scope, ctx: Pick<NeckContext, 'tuning'>, pc: number): Pos[] {
  const frets = scopeFrets(scope);
  const out: Pos[] = [];
  for (const s of [...scope.strings].sort((a, b) => a - b)) {
    if (s < 1 || s > stringCount(ctx)) continue;
    out.push(...placesOnString(ctx, s, pc, frets));
  }
  return out;
}

/** Pitch classes present in a scope. */
export function scopePcs(scope: Scope, ctx: Pick<NeckContext, 'tuning'>): number[] {
  const set = new Set(scopePositions(scope, ctx).map((p) => pcAt(ctx, p)));
  return [...set].sort((a, b) => a - b);
}

// ── octave shapes ────────────────────────────────────────────────────────────────────────────────

/** An octave shape: from a note on `from`, the same note `octaves` higher on `to`, `shift` frets along. */
export interface OctaveShape {
  from: number;
  to: number;
  /** Frets to move toward the body (negative = toward the nut). */
  shift: number;
  octaves: number;
}

/**
 * The octave shape between two strings in this tuning, or null when the strings are too far
 * apart for it to be a hand shape (more than five frets either way).
 */
export function octaveShape(ctx: Pick<NeckContext, 'tuning'>, from: number, to: number): OctaveShape | null {
  const gap = openMidi(ctx, to) - openMidi(ctx, from);
  if (gap <= 0) return null;
  const octaves = Math.max(1, Math.round(gap / 12));
  const shift = 12 * octaves - gap;
  if (Math.abs(shift) > 5) return null;
  return { from, to, shift, octaves };
}

/** Where a note on `from` lands on `to` through the octave shape (null when off the neck). */
export function octaveTarget(ctx: Pick<NeckContext, 'tuning'>, shape: OctaveShape, fromFret: number, maxFret = 24): Pos | null {
  const fret = fromFret + shape.shift;
  return fret >= 0 && fret <= maxFret ? { string: shape.to, fret } : null;
}

/** "two strings up, two frets up" — the shape in a guitarist's words (strings up = toward the floor). */
export function describeShape(shape: OctaveShape): string {
  const strings = shape.from - shape.to;
  const across = `${numberWord(strings)} string${strings === 1 ? '' : 's'} up`;
  if (shape.shift === 0) return `${across}, same fret`;
  const n = Math.abs(shape.shift);
  return `${across}, ${numberWord(n)} fret${n === 1 ? '' : 's'} ${shape.shift > 0 ? 'up' : 'back'}`;
}

// ── landmarks ────────────────────────────────────────────────────────────────────────────────────

/** Frets a learner can find without counting: the open string, the inlay dots and the double dot. */
export const LANDMARK_FRETS: readonly number[] = [0, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

/** How a landmark is seen on the neck. */
export function landmarkName(fret: number): string {
  if (fret === 0) return 'the open string';
  if (fret === 12 || fret === 24) return `the double dot at fret ${fret}`;
  return `the dot at fret ${fret}`;
}

/** The anchor to work a position out from: the nearest landmark on its string (a natural note when possible). */
export interface Anchor {
  fret: number;
  pc: number;
  /** Frets from the anchor to the position (negative = toward the nut). */
  distance: number;
}

/**
 * The best landmark to reason from: the closest one (open string and fret 12 preferred on a tie),
 * favouring a natural note so the explanation does not lean on another sharp or flat.
 */
export function anchorFor(ctx: Pick<NeckContext, 'tuning'>, p: Pos, maxFret = 24): Anchor | null {
  let best: Anchor | null = null;
  let bestCost = Infinity;
  for (const fret of LANDMARK_FRETS) {
    if (fret > maxFret || fret === p.fret) continue;
    const pc = pcAt(ctx, { string: p.string, fret });
    const distance = p.fret - fret;
    const cost = Math.abs(distance) + (isNatural(pc) ? 0 : 1.5) + (fret === 0 || fret === 12 ? -0.25 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = { fret, pc, distance };
    }
  }
  return best && Math.abs(best.distance) <= 4 ? best : null;
}

/** Inlay frets in a range (single and double dots), for highlighting anchors on a board. */
export function inlayFretsIn(from: number, to: number): number[] {
  return LANDMARK_FRETS.filter((f) => f > 0 && f >= from && f <= to);
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** Small numbers in words ("two frets up"). */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}

/** "string 6" / "the A string"-style name: the open note of the string in this tuning. */
export function stringOpenPc(ctx: Pick<NeckContext, 'tuning'>, s: number): number {
  return pcOf(openMidi(ctx, s));
}
