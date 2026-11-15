/**
 * Ground truth of a fixture page, as written by scripts/omr-fixtures.cjs and as transformed by the
 * degradation model. Coordinates are continuous image pixels of the image the truth belongs to.
 */
import type { Point } from '../image/gray';
import type { BarlineType, DurationValue, StaffKind } from '../types';

/** [x, y, width, height] in px. */
export type Box = [number, number, number, number];

/** A written note of a notation event. */
export interface GtNote {
  /** MIDI as written (treble clef). */
  written: number;
  /** Sounding MIDI (guitar: an octave below the written pitch). */
  midi: number;
  step: string;
  alter: number;
  octave: number;
  /** Staff position in half spaces above the bottom line (0 = bottom line, 8 = top line). */
  pos: number;
  /** Number of ledger lines the note needs. */
  ledger: number;
  /** Accidental actually printed in front of the note ('#', 'b', 'n', '##', 'bb') or null. */
  accidental: string | null;
  accBox: Box | null;
  /** Note head box. */
  head: Box;
  headType: 'filled' | 'open' | 'whole';
  tieStart: boolean;
  tieStop: boolean;
  /** Where the tab staff of the same score plays this note. */
  string: number;
  fret: number;
}

/** A fret number on a tab staff. */
export interface GtTabNote {
  /** 1 = top line (high E). */
  string: number;
  fret: number;
  /** Ink box of the digits. */
  bbox: Box;
  midi: number;
  written: number;
  tieStart: boolean;
  tieStop: boolean;
}

/** Duration of an event. */
export interface GtDuration {
  value: DurationValue;
  dots: number;
  /** 960 per quarter note. */
  ticks: number;
  tuplet?: { actual: number; normal: number };
}

/** One event (note, chord or rest) on a notation staff. */
export interface GtNotationEvent {
  type: 'note' | 'rest';
  /** Horizontal centre of the note heads (or of the rest glyph). */
  x: number;
  duration: GtDuration;
  /** Everything drawn for the event: heads, stem, flag, accidentals, dots, ledger lines. */
  bbox: Box | null;
  notes: GtNote[];
  /** Rest glyph box (rests only). */
  head?: Box | null;
  stem?: 'up' | 'down' | null;
  beamed?: boolean;
  flagged?: boolean;
  stemBox?: Box | null;
  flagBox?: Box | null;
  dotBoxes?: Box[];
  /** Chord symbol printed above this event. */
  chord?: string;
}

/** One event on a tab staff. */
export interface GtTabEvent {
  type: 'note' | 'rest';
  x: number;
  duration: GtDuration;
  bbox: Box | null;
  notes: GtTabNote[];
  /** True for a rest that is not drawn at all (tab under notation leaves rests blank). */
  hidden?: boolean;
  stem?: 'down' | null;
  beamed?: boolean;
  stemBox?: Box | null;
  chord?: string;
}

/** A measure of one staff. */
export interface GtMeasure<E> {
  /** Running measure number in the piece (0-based). */
  index: number;
  x0: number;
  x1: number;
  events: E[];
}

/** A bar line of one staff. */
export interface GtBarline {
  type: BarlineType;
  /** Centre of the line group at the staff's middle. */
  x: number;
  bbox: Box;
  /** [x, width] of each vertical stroke. */
  strokes: [number, number][];
  /** Ends of the bar line on the top and bottom staff line. */
  top: Point;
  bottom: Point;
}

interface GtStaffBase {
  lineCount: number;
  /** Staff lines top to bottom, each a polyline from left to right. */
  lines: Point[][];
  x0: number;
  x1: number;
  /** Distance between adjacent lines. */
  space: number;
  lineThickness: number;
  clef: { type: string; bbox: Box | null } | null;
  time: { num: number; den: number; bbox: Box | null } | null;
  barlines: GtBarline[];
}

/** A five-line staff. */
export interface GtNotationStaff extends GtStaffBase {
  kind: 'notation';
  key: { name: string; fifths: number; bbox: Box | null } | null;
  measures: GtMeasure<GtNotationEvent>[];
  ties?: Box[];
  beams?: Box[];
  tuplets?: Box[];
}

/** A six-line tab staff. */
export interface GtTabStaff extends GtStaffBase {
  kind: 'tab';
  /** Rhythm stems are drawn under the numbers. */
  stems: boolean;
  /** The staff lines run through the digits instead of being blanked behind them. */
  lineThrough: boolean;
  measures: GtMeasure<GtTabEvent>[];
}

/** Any ground-truth staff. */
export type GtStaff = GtNotationStaff | GtTabStaff;

/** A system: one staff, or a notation staff with its tab staff. */
export interface GtSystem {
  index: number;
  connector: 'none' | 'single' | 'bracket';
  barThrough: boolean;
  connectorBox?: Box | null;
  staves: GtStaff[];
}

/** A text label on the page. */
export interface GtText {
  kind: 'title' | 'composer' | 'tempo' | 'chord';
  text: string;
  bbox: Box;
  system?: number;
  measure?: number;
}

/** Ground truth of one page image. */
export interface GroundTruth {
  id: string;
  image: string;
  width: number;
  height: number;
  subset: 'notation' | 'tab' | 'linked';
  title: string | null;
  dpi: number;
  /** px per engraving unit (a notation staff space is 10 units). */
  scale: number;
  /** Notation staff space in px. */
  staffSpace: number;
  musicFont: string;
  textFont: string;
  tabFont: string | null;
  key: { name: string; fifths: number };
  time: { num: number; den: number };
  pickup: boolean;
  systems: GtSystem[];
  texts: GtText[];
}

/** One entry of fixtures/manifest.json. */
export interface FixtureMeta {
  id: string;
  image: string;
  truth: string;
  subset: 'notation' | 'tab' | 'linked';
  name: string;
  dpi: number;
  size: number;
  staffSpace: number;
  musicFont: string;
  tabFont: string | null;
  width: number;
  height: number;
  systems: number;
  staves: number;
  measures: number;
  tags: string[];
  bytes: number;
  /** Corpus directory the entry belongs to (absent = the original corpus in fixtures/). */
  corpus?: string;
}

/** Number of points each staff-line polyline is sampled at when a fixture is loaded. */
export const LINE_SAMPLES = 49;

/** The raw JSON stores staff lines as y values; expand them to polylines and add bar-line ends. */
export function hydrateTruth(raw: unknown): GroundTruth {
  const gt = raw as GroundTruth;
  for (const sys of gt.systems) {
    for (const st of sys.staves) {
      const ys = st.lines as unknown as number[];
      if (typeof ys[0] === 'number') {
        st.lines = ys.map((y) => {
          const line: Point[] = [];
          for (let k = 0; k < LINE_SAMPLES; k++) line.push({ x: st.x0 + ((st.x1 - st.x0) * k) / (LINE_SAMPLES - 1), y });
          return line;
        });
      }
      const top = st.lines[0][0].y;
      const bottom = st.lines[st.lines.length - 1][0].y;
      for (const b of st.barlines) {
        if (!b.top) {
          b.top = { x: b.x, y: top };
          b.bottom = { x: b.x, y: bottom };
        }
      }
    }
  }
  return gt;
}

/** y of a polyline at x (linear interpolation; clamped slope extrapolation outside). */
export function polylineY(line: Point[], x: number): number {
  const n = line.length;
  if (n === 1) return line[0].y;
  let i = 0;
  if (x >= line[n - 1].x) i = n - 2;
  else if (x > line[0].x) {
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (line[mid].x <= x) lo = mid; else hi = mid;
    }
    i = lo;
  }
  const a = line[i];
  const b = line[i + 1];
  const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
  return a.y + (b.y - a.y) * t;
}

/** Bounding box of a transformed box (its four corners mapped through `f`). */
export function mapBox(b: Box, f: (p: Point) => Point): Box {
  const pts = [f({ x: b[0], y: b[1] }), f({ x: b[0] + b[2], y: b[1] }), f({ x: b[0], y: b[1] + b[3] }), f({ x: b[0] + b[2], y: b[1] + b[3] })];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0];
}

/**
 * Move a ground truth through a geometric transform of the image (clean px -> new px): polylines
 * and bar-line ends point by point, boxes by their corners, scalar x positions along the middle of
 * their staff. `size` is the size of the transformed image.
 */
export function transformTruth(gt: GroundTruth, f: (p: Point) => Point, size: { width: number; height: number }): GroundTruth {
  const box = (b: Box | null | undefined): Box | null => (b ? mapBox(b, f) : null);
  const out: GroundTruth = { ...gt, width: size.width, height: size.height, systems: [], texts: [] };
  let scaleSum = 0;
  let scaleN = 0;
  for (const sys of gt.systems) {
    const staves: GtStaff[] = [];
    for (const st of sys.staves) {
      const mid = (st.lines[0][0].y + st.lines[st.lines.length - 1][0].y) / 2;
      const fx = (x: number): number => f({ x, y: mid }).x;
      const lines = st.lines.map((l) => l.map(f));
      // Local scale: mean distance between the mapped outer lines over the original distance.
      const n = lines.length;
      let d = 0;
      for (let k = 0; k < lines[0].length; k++) d += Math.hypot(lines[n - 1][k].x - lines[0][k].x, lines[n - 1][k].y - lines[0][k].y);
      const local = d / lines[0].length / (st.space * (n - 1));
      scaleSum += local;
      scaleN++;
      const base = {
        lineCount: st.lineCount,
        lines,
        x0: fx(st.x0),
        x1: fx(st.x1),
        space: st.space * local,
        lineThickness: st.lineThickness * local,
        clef: st.clef ? { ...st.clef, bbox: box(st.clef.bbox) } : null,
        time: st.time ? { ...st.time, bbox: box(st.time.bbox) } : null,
        barlines: st.barlines.map((b) => ({
          ...b,
          x: fx(b.x),
          bbox: mapBox(b.bbox, f),
          strokes: b.strokes.map(([x, w]) => [fx(x), w * local] as [number, number]),
          top: f(b.top),
          bottom: f(b.bottom),
        })),
      };
      if (st.kind === 'notation') {
        staves.push({
          ...base,
          kind: 'notation',
          key: st.key ? { ...st.key, bbox: box(st.key.bbox) } : null,
          ties: st.ties?.map((b) => mapBox(b, f)),
          beams: st.beams?.map((b) => mapBox(b, f)),
          tuplets: st.tuplets?.map((b) => mapBox(b, f)),
          measures: st.measures.map((m) => ({
            index: m.index,
            x0: fx(m.x0),
            x1: fx(m.x1),
            events: m.events.map((e) => ({
              ...e,
              x: f({ x: e.x, y: e.notes.length ? e.notes[0].head[1] + e.notes[0].head[3] / 2 : mid }).x,
              bbox: box(e.bbox),
              head: box(e.head),
              stemBox: box(e.stemBox),
              flagBox: box(e.flagBox),
              dotBoxes: e.dotBoxes?.map((b) => mapBox(b, f)),
              notes: e.notes.map((nn) => ({ ...nn, head: mapBox(nn.head, f), accBox: box(nn.accBox) })),
            })),
          })),
        });
      } else {
        staves.push({
          ...base,
          kind: 'tab',
          stems: st.stems,
          lineThrough: st.lineThrough,
          measures: st.measures.map((m) => ({
            index: m.index,
            x0: fx(m.x0),
            x1: fx(m.x1),
            events: m.events.map((e) => ({
              ...e,
              x: f({ x: e.x, y: e.notes.length ? e.notes[0].bbox[1] + e.notes[0].bbox[3] / 2 : mid }).x,
              bbox: box(e.bbox),
              stemBox: box(e.stemBox),
              notes: e.notes.map((nn) => ({ ...nn, bbox: mapBox(nn.bbox, f) })),
            })),
          })),
        });
      }
    }
    out.systems.push({ ...sys, connectorBox: box(sys.connectorBox), staves });
  }
  out.texts = gt.texts.map((t) => ({ ...t, bbox: mapBox(t.bbox, f) }));
  const s = scaleN ? scaleSum / scaleN : 1;
  out.staffSpace = gt.staffSpace * s;
  out.scale = gt.scale * s;
  return out;
}

/** All staves of a page in reading order, with their system index. */
export function gtStaves(gt: GroundTruth): { staff: GtStaff; system: number; indexInSystem: number }[] {
  const out: { staff: GtStaff; system: number; indexInSystem: number }[] = [];
  gt.systems.forEach((sys, s) => sys.staves.forEach((staff, i) => out.push({ staff, system: s, indexInSystem: i })));
  return out;
}

/** Kind of a ground-truth staff as the recognizer vocabulary. */
export function gtKind(st: GtStaff): StaffKind {
  return st.kind;
}
