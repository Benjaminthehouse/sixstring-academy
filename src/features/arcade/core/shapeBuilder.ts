/**
 * Shape Builder: study a shape, then rebuild it from memory on an empty stretch of neck by tapping
 * its notes. The roots stay on the board as anchors (every shape is learned around its roots).
 * The levels are the shapes themselves: boxes 1–5 for pentatonic scales, the five CAGED shapes and
 * the seven three-notes-per-string patterns for seven-note scales, hand positions for the rest.
 */
import type { PatternNote, ScalePattern } from '@/core/guitar';
import { posKey, regionOf } from './focus';

/** A Shape Builder level: one shape of the scale. */
export interface ShapeLevel {
  n: number;
  title: string;
  goal: string;
  /** Pattern id (`box-2`, `caged-e`, `3nps-1`). */
  shape: string;
}

/** One level per shape, in the order the shapes are taught. */
export function shapeBuilderLevels(shapes: readonly ScalePattern[]): ShapeLevel[] {
  return shapes.map((p, i) => ({
    n: i + 1,
    title: p.system === '3nps' ? p.name.replace('3NPS pattern', '3 notes per string,') : p.name,
    goal: `${p.notes.length} notes around ${p.roots.length === 1 ? 'one root' : `${p.roots.length} roots`}, ${p.positionName.toLowerCase()}.`,
    shape: p.id,
  }));
}

/** A round: the shape to rebuild, with its roots given. */
export interface ShapeRound {
  pattern: ScalePattern;
  frets: [number, number];
  /** Notes already on the board (the roots). */
  anchors: PatternNote[];
  /** Notes the learner places. */
  toPlace: PatternNote[];
}

/** Build the round for a shape. */
export function makeShapeRound(pattern: ScalePattern): ShapeRound {
  const anchors = pattern.notes.filter((n) => n.isRoot);
  const toPlace = pattern.notes.filter((n) => !n.isRoot);
  return { pattern, frets: regionOf(pattern), anchors, toPlace };
}

/** What a tap on the board means. */
export type ShapeTap = { kind: 'place'; note: PatternNote } | { kind: 'already' } | { kind: 'anchor' } | { kind: 'miss' };

/** Judge a tap given what is already placed (keys `string:fret`). */
export function judgeShapeTap(round: ShapeRound, placed: ReadonlySet<string>, pos: { string: number; fret: number }): ShapeTap {
  const key = posKey(pos);
  if (round.anchors.some((n) => posKey(n) === key)) return { kind: 'anchor' };
  if (placed.has(key)) return { kind: 'already' };
  const note = round.toPlace.find((n) => posKey(n) === key);
  return note ? { kind: 'place', note } : { kind: 'miss' };
}

/**
 * Why a wrong tap is wrong, in words that help: a scale note outside this shape, or a note that is
 * not in the scale at all. `inScale` tells whether that pitch belongs to the scale.
 */
export function missReason(inScale: boolean, shapeName: string): string {
  return inScale ? `In the scale, but not part of ${shapeName}` : 'Not in the scale';
}

/** Score and accuracy of a finished build. Each peek counts like one mistake. */
export function shapeScore(r: { placed: number; mistakes: number; peeks: number; seconds: number }): { score: number; accuracy: number } {
  const slips = r.mistakes + r.peeks;
  const accuracy = r.placed + slips === 0 ? 0 : r.placed / (r.placed + slips);
  // 100 a note, a time bonus that runs out after 4 s a note, 40 off per slip.
  const bonus = Math.max(0, Math.round((r.placed * 4 - r.seconds) * 25));
  const score = Math.max(0, r.placed * 100 + bonus - slips * 40);
  return { score, accuracy };
}
