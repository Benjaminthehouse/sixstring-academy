/**
 * Fretboard geometry in screen pixels. Pure: given the strings, the fret range, the room there is
 * and the orientation, it works out where every wire, string, dot and touch cell goes.
 *
 * Two axes are laid out first and mapped to x/y at the end:
 *   length (u)  along the neck: [string labels][open column][nut][fret spaces …][overhang]
 *   cross  (v)  across it:      [box label gutter][edge][string 1 … string n][edge][fret numbers]
 * Horizontal boards put the nut on the left (right when left-handed) with string 1 on top; vertical
 * boards put the nut on top with the low string on the left (right when left-handed), the way a
 * chord box is drawn. Text is never mirrored: only positions flip.
 *
 * Fret spacing is real (each fret 2^(-1/12) of the one before) unless asked to be even. When the
 * narrowest fret would be too small to read or tap, the spacing blends toward even (`blend` < 1);
 * when even spacing is still too small, the board gets wider than its container and scrolls.
 */
import { fretDistance, INLAY_FRETS, DOUBLE_INLAY_FRETS } from '@/core/guitar';

/** A rectangle in SVG pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A point in SVG pixels. */
export interface Point {
  x: number;
  y: number;
}

/** A line segment in SVG pixels. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Real fret spacing or equal spacing. */
export type FretSpacing = 'proportional' | 'even';

/** Which way the neck runs. */
export type BoardOrientation = 'horizontal' | 'vertical';

// ── Fitting a fret range into the room there is ─────────────────────────────────────────────────

/** Input of `fitFrets`. */
export interface FitInput {
  /** Pixels available for the fret spaces themselves. */
  available: number;
  /** First and last fret space drawn (1-based). */
  fromFret: number;
  toFret: number;
  /** Ask for real spacing (true) or even spacing (false). */
  proportional: boolean;
  /** Narrowest fret space allowed, px (legibility, touch). */
  minFret: number;
  /** Widest fret space allowed, px (a short range on a wide screen must not become a ladder). */
  maxFret: number;
}

/** Result of `fitFrets`. */
export interface FitResult {
  /** Total length of the fret spaces, px. */
  length: number;
  /** 1 = real spacing, 0 = even spacing, in between = a blend that keeps the high frets readable. */
  blend: number;
  /** True when the frets need more room than `available` (the board scrolls). */
  overflow: boolean;
}

/**
 * Normalised wire positions (0–1) for wires `fromFret - 1` … `toFret`, blending real spacing
 * (`blend` 1) with even spacing (`blend` 0).
 */
export function fretFractions(fromFret: number, toFret: number, blend = 1): number[] {
  const n = toFret - fromFret + 1;
  const start = fretDistance(fromFret - 1);
  const span = fretDistance(toFret) - start;
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const real = span > 0 ? (fretDistance(fromFret - 1 + i) - start) / span : i / n;
    out.push(blend * real + (1 - blend) * (i / n));
  }
  return out;
}

/** Widest and narrowest fret space (as fractions of the whole length) at a blend. */
function extremes(fromFret: number, toFret: number, blend: number): { widest: number; narrowest: number } {
  const f = fretFractions(fromFret, toFret, blend);
  // Real spacing shrinks monotonically, so the first space is the widest and the last the narrowest.
  return { widest: f[1] - f[0], narrowest: f[f.length - 1] - f[f.length - 2] };
}

/**
 * How long the fret spaces should be and how proportional they can stay: as proportional as
 * asked while the narrowest fret keeps `minFret`, never wider per fret than `maxFret`, and
 * overflowing (scrolling) only when even spacing cannot fit.
 */
export function fitFrets(input: FitInput): FitResult {
  const fromFret = Math.max(1, Math.round(input.fromFret));
  const toFret = Math.max(fromFret, Math.round(input.toFret));
  const n = toFret - fromFret + 1;
  const available = Math.max(0, input.available);
  const minFret = Math.max(1, input.minFret);
  const maxFret = Math.max(minFret, input.maxFret);
  const lengthAt = (blend: number) => Math.min(available, maxFret / extremes(fromFret, toFret, blend).widest);
  const fits = (blend: number) => lengthAt(blend) * extremes(fromFret, toFret, blend).narrowest >= minFret - 1e-6;

  const wanted = input.proportional ? 1 : 0;
  if (fits(wanted)) return { length: lengthAt(wanted), blend: wanted, overflow: false };
  if (!fits(0)) {
    // Even spacing at the minimum width is the most compact readable board; it scrolls.
    const length = n * minFret;
    return { length, blend: 0, overflow: length > available + 0.5 };
  }
  // Binary search for the most proportional blend that still fits.
  let lo = 0;
  let hi = wanted;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return { length: lengthAt(lo), blend: lo, overflow: false };
}

// ── Strings ──────────────────────────────────────────────────────────────────────────────────────

/** How a string is drawn: its thickness relative to the thinnest, and whether it is wound. */
export interface StringLook {
  /** Stroke width at a string gap of 28 px. */
  width: number;
  /** Wound strings (the low ones) get the bronze colour and a winding texture. */
  wound: boolean;
}

/**
 * The look of a string tuned to `midi`: lower strings are thicker (roughly the gauge of a light
 * electric set, .010 to .046) and those below F3 are wound.
 */
export function stringLook(midi: number): StringLook {
  const width = Math.min(4.2, Math.max(0.9, 1 + (64 - midi) * 0.095));
  return { width, wound: midi < 53 };
}

// ── The board ────────────────────────────────────────────────────────────────────────────────────

/** Input of `boardLayout`. */
export interface BoardLayoutInput {
  stringCount: number;
  /** Shown fret range, inclusive, in frets on the wood: `[0, 12]` (with the open strings and the nut), `[5, 9]`. */
  frets: readonly [number, number];
  /** Width of the container for a horizontal board (px); 0 or less when unknown. */
  width: number;
  orientation?: BoardOrientation;
  /**
   * Vertical boards only: each fret as short as `minFret` allows, evenly spaced, so a long range
   * stands on an upright phone without scrolling sideways (0–12 at 44 px frets is about 620 px tall).
   */
  compact?: boolean;
  leftHanded?: boolean;
  spacing?: FretSpacing;
  /** Distance between strings, px. */
  stringGap: number;
  /** Narrowest fret space allowed, px. Default: room for a labelled dot. */
  minFret?: number;
  /** Widest fret space allowed, px. Default: 3.9 string gaps. */
  maxFret?: number;
  /** Room for open-string names beside the nut (horizontal) or above it (vertical). */
  stringLabels?: boolean;
  /** Width of that room on a horizontal board, px (default 26; longer names such as `Sol` need more). */
  labelWidth?: number;
  /** Room for fret numbers beyond the lowest string. */
  fretNumbers?: boolean;
  /** Draw the open-string column even when the range starts above fret 0 (open-string dots, x / o marks). */
  openColumn?: boolean;
  /** Extra room on the string-1 side, for a position box label. */
  topGutter?: number;
  /** Capo on this fret (on the wood); 0 = none. */
  capo?: number;
}

/** The computed board. Coordinates are SVG pixels; the board's size is `width` × `height`. */
export interface BoardLayout {
  width: number;
  height: number;
  /** True when the board is wider (or taller) than the container: its wrapper must scroll. */
  overflow: boolean;
  orientation: BoardOrientation;
  leftHanded: boolean;
  stringCount: number;
  /** First and last fret space drawn on the wood (1-based). */
  fromFret: number;
  toFret: number;
  /** True when the range includes fret 0 (the open strings). */
  showsOpen: boolean;
  /** True when the nut is drawn (the range starts at the first fret). */
  hasNut: boolean;
  /** True when there is a column for open-string dots and marks behind the nut. */
  openColumn: boolean;
  capo: number;
  /** The spacing blend used (1 real, 0 even). */
  blend: number;
  stringGap: number;
  /** Radius of a note marker. */
  markerRadius: number;
  /** The fretted wood. */
  board: Rect;
  /** The headstock stub behind the nut where open-string dots sit, or null. */
  headstock: Rect | null;
  /** The bone nut, or null when the range starts higher up the neck. */
  nut: Rect | null;
  /** Fret wires from `fromFret - 1` (unless that is the nut) to `toFret`. */
  wires: Array<{ fret: number; line: Segment }>;
  /** Thickness of a fret wire, px. */
  wireWidth: number;
  /** Where a marker for `{ string, fret }` goes; `fret` is on the wood, 0 = the open column. */
  point(string: number, fret: number): Point;
  /** The touch cell of a position on the wood (fret 0 = the open column). */
  cell(string: number, fret: number): Rect;
  /** The full length of a string, from the headstock edge to the end of the board. */
  stringLine(string: number): Segment;
  /** Where a fret number is written, or null when there is no room for numbers. */
  fretNumberAt(fret: number): Point | null;
  /** Where an open-string name is written, or null when labels are off. */
  stringLabelAt(string: number): Point | null;
  /** Inlay centres for a marker fret (two for 12 and 24), with the inlay radius. */
  inlays(fret: number): { points: Point[]; r: number; space: Rect };
  /** The rectangle covering fret spaces `from`…`to` across all strings (a position box). */
  span(from: number, to: number, opts?: { strings?: readonly [number, number]; pad?: number }): Rect;
  /** The bar a capo draws across the strings, or null without a capo. */
  capoBar: Rect | null;
  /** Width of a fret space on the wood along the neck (px); 0 outside the drawn range. */
  fretSize(fret: number): number;
}

const LABEL_GUTTER_H = 26; // string names beside a horizontal nut
const LABEL_GUTTER_V = 20; // string names above a vertical nut
const NUMBER_GUTTER = 20;
const END_PAD = 2;

/** Lay a fretboard out. See the module comment for the conventions. */
export function boardLayout(input: BoardLayoutInput): BoardLayout {
  const orientation = input.orientation ?? 'horizontal';
  const leftHanded = !!input.leftHanded;
  const stringCount = Math.max(1, Math.round(input.stringCount));
  const gap = Math.max(8, input.stringGap);
  const [rawFrom, rawTo] = input.frets;
  const showsOpen = rawFrom <= 0;
  const fromFret = Math.max(1, Math.round(rawFrom));
  const toFret = Math.max(fromFret, Math.round(rawTo));
  const hasNut = fromFret === 1;
  const capo = Math.max(0, Math.round(input.capo ?? 0));
  const openColumn = showsOpen || !!input.openColumn;
  const baseRadius = Math.min(17, Math.max(6, gap * 0.4));
  const stringLabels = input.stringLabels ?? true;
  const fretNumbers = input.fretNumbers ?? true;
  const topGutter = Math.max(0, input.topGutter ?? 0);

  // ── length axis ──
  const labelGutter = stringLabels ? (orientation === 'horizontal' ? Math.max(LABEL_GUTTER_H, input.labelWidth ?? 0) : LABEL_GUTTER_V) : 0;
  const openW = openColumn ? Math.max(24, baseRadius * 2 + 12) : 0;
  const nutW = hasNut ? Math.min(10, Math.max(5, gap * 0.24)) : 0;
  const gapBeforeBoard = openColumn && !hasNut ? 6 : 0;
  const preOverhang = hasNut ? 0 : Math.min(12, gap * 0.4);
  const fixedBefore = END_PAD + labelGutter + openW + gapBeforeBoard + nutW + preOverhang;
  // Down to about 21 px a fret still holds a readable dot (radius 9, 10 px label): enough for frets
  // 0–12 on a 390 px phone without scrolling.
  const minFret = input.minFret ?? Math.max(21, gap * 0.78);
  const maxFret = Math.max(minFret, input.maxFret ?? gap * 3.9);
  const tailGuess = toFret < 24 ? Math.min(14, gap * 0.45) : 0;

  let available: number;
  if (orientation === 'horizontal') {
    const container = input.width > 0 ? input.width : 720;
    available = container - fixedBefore - tailGuess - END_PAD;
  } else {
    // A vertical board is as long as it needs to be: about 1.6 string gaps per fret, or in a
    // compact board the shortest readable (tappable) fret, so all twelve fit an upright phone.
    available = (toFret - fromFret + 1) * (input.compact ? minFret : gap * 1.6);
  }
  const fit = fitFrets({ available, fromFret, toFret, proportional: (input.spacing ?? 'proportional') === 'proportional', minFret, maxFret });
  const fractions = fretFractions(fromFret, toFret, fit.blend);
  const fretStart = fixedBefore;
  const wireU = fractions.map((f) => fretStart + f * fit.length); // index i -> wire fromFret - 1 + i
  const lastSpace = wireU[wireU.length - 1] - wireU[wireU.length - 2];
  const tail = Math.min(tailGuess, lastSpace * 0.35);
  const boardU0 = fretStart - nutW - preOverhang;
  const boardU1 = wireU[wireU.length - 1] + tail;
  const lengthTotal = boardU1 + END_PAD;
  const headU0 = END_PAD + labelGutter;
  const headU1 = headU0 + openW;

  // ── cross axis ──
  const edge = gap * 0.55;
  const boardV0 = topGutter;
  const boardV1 = boardV0 + edge * 2 + (stringCount - 1) * gap;
  const crossTotal = boardV1 + (fretNumbers ? NUMBER_GUTTER : 4);
  const stringV = (s: number) => boardV0 + edge + (Math.min(stringCount, Math.max(1, s)) - 1) * gap;

  const width = orientation === 'horizontal' ? lengthTotal : crossTotal;
  const height = orientation === 'horizontal' ? crossTotal : lengthTotal;
  const overflow = orientation === 'horizontal' ? fit.overflow || (input.width > 0 && lengthTotal > input.width + 0.5) : input.width > 0 && crossTotal > input.width + 0.5;

  // ── mapping (u, v) -> (x, y) ──
  const map = (u: number, v: number): Point => {
    if (orientation === 'horizontal') return { x: leftHanded ? lengthTotal - u : u, y: v };
    return { x: leftHanded ? v : crossTotal - v, y: u };
  };
  const rect = (u0: number, u1: number, v0: number, v1: number): Rect => {
    const a = map(u0, v0);
    const b = map(u1, v1);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  };
  const seg = (u0: number, v0: number, u1: number, v1: number): Segment => {
    const a = map(u0, v0);
    const b = map(u1, v1);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  };

  const wireAt = (fret: number): number | null => {
    const i = fret - (fromFret - 1);
    return i >= 0 && i < wireU.length ? wireU[i] : null;
  };
  const spaceU = (fret: number): [number, number] | null => {
    const a = wireAt(fret - 1);
    const b = wireAt(fret);
    return a === null || b === null ? null : [a, b];
  };

  const wireWidth = Math.min(4, Math.max(2, gap * 0.1));
  const capoBarU: [number, number] | null = capo > 0 && wireAt(capo) !== null && capo >= fromFret ? (() => {
    const [a, b] = spaceU(capo)!;
    const w = Math.min(b - a - 4, Math.max(10, gap * 0.5));
    return [b - wireWidth / 2 - w - 1.5, b - wireWidth / 2 - 1.5];
  })() : null;

  const markerRadius = Math.max(6, Math.min(baseRadius, lastSpace * 0.42));

  const pointU = (fret: number): number => {
    if (fret <= 0) return (headU0 + headU1) / 2;
    const s = spaceU(fret);
    if (!s) return fret < fromFret ? boardU0 : boardU1;
    // Markers sit a little toward the wire that stops the string, where the fingertip goes.
    return s[0] + (s[1] - s[0]) * 0.52;
  };

  const wires: BoardLayout['wires'] = [];
  for (let i = 0; i < wireU.length; i++) {
    const fret = fromFret - 1 + i;
    if (fret === 0) continue; // the nut
    wires.push({ fret, line: seg(wireU[i], boardV0, wireU[i], boardV1) });
  }

  const layout: BoardLayout = {
    width,
    height,
    overflow,
    orientation,
    leftHanded,
    stringCount,
    fromFret,
    toFret,
    showsOpen,
    hasNut,
    openColumn,
    capo,
    blend: fit.blend,
    stringGap: gap,
    markerRadius,
    board: rect(boardU0, boardU1, boardV0, boardV1),
    headstock: openColumn ? rect(headU0, headU1, boardV0, boardV1) : null,
    nut: hasNut ? rect(fretStart - nutW, fretStart, boardV0 - 1, boardV1 + 1) : null,
    wires,
    wireWidth,
    point(string, fret) {
      if (fret <= 0 && capoBarU) {
        return map((capoBarU[0] + capoBarU[1]) / 2, stringV(string));
      }
      return map(pointU(fret), stringV(string));
    },
    cell(string, fret) {
      const v = stringV(string);
      if (fret <= 0) return rect(headU0, headU1 + (hasNut ? nutW : 0), v - gap / 2, v + gap / 2);
      const s = spaceU(fret) ?? [pointU(fret) - 10, pointU(fret) + 10];
      return rect(s[0], s[1], v - gap / 2, v + gap / 2);
    },
    stringLine(string) {
      const v = stringV(string);
      return seg(openColumn ? headU0 : boardU0, v, boardU1, v);
    },
    fretNumberAt(fret) {
      if (!fretNumbers) return null;
      const s = spaceU(fret);
      if (!s) return null;
      return map((s[0] + s[1]) / 2, boardV1 + NUMBER_GUTTER / 2 + 1);
    },
    stringLabelAt(string) {
      if (!stringLabels) return null;
      return map(END_PAD + labelGutter / 2, stringV(string));
    },
    inlays(fret) {
      const s = spaceU(fret) ?? [0, 0];
      const size = s[1] - s[0];
      const r = Math.max(2.5, Math.min(gap * 0.22, size * 0.16));
      const mid = (s[0] + s[1]) / 2;
      const centreV = (boardV0 + boardV1) / 2;
      const isDouble = DOUBLE_INLAY_FRETS.includes(fret);
      const offset = ((stringCount - 1) * gap) / 4;
      const points = isDouble && stringCount > 2 ? [map(mid, centreV - offset), map(mid, centreV + offset)] : [map(mid, centreV)];
      return { points, r, space: rect(s[0], s[1], boardV0, boardV1) };
    },
    span(from, to, opts = {}) {
      const lo = Math.max(fromFret, Math.min(from, to));
      const hi = Math.min(toFret, Math.max(from, to));
      const a = lo <= 0 ? headU0 : (spaceU(lo)?.[0] ?? boardU0);
      const b = spaceU(hi)?.[1] ?? boardU1;
      const pad = opts.pad ?? 3;
      const [s1, s2] = opts.strings ? [Math.min(...opts.strings), Math.max(...opts.strings)] : [1, stringCount];
      const v0 = s1 <= 1 ? boardV0 - pad : stringV(s1) - gap / 2;
      const v1 = s2 >= stringCount ? boardV1 + pad : stringV(s2) + gap / 2;
      return rect(a - pad, b + pad, v0, v1);
    },
    capoBar: capoBarU ? rect(capoBarU[0], capoBarU[1], boardV0 - 3, boardV1 + 3) : null,
    fretSize(fret) {
      const s = spaceU(fret);
      return s ? s[1] - s[0] : 0;
    },
  };
  return layout;
}

/** The marker frets inside a range, with whether each one is a double marker. */
export function inlaysInRange(fromFret: number, toFret: number): Array<{ fret: number; double: boolean }> {
  return INLAY_FRETS.filter((f) => f >= fromFret && f <= toFret).map((fret) => ({ fret, double: DOUBLE_INLAY_FRETS.includes(fret) }));
}

/** The fret numbers to print for a range: `inlays` gives the marker frets plus the first fret when the range starts up the neck. */
export function fretNumbersFor(fromFret: number, toFret: number, mode: 'inlays' | 'all' | 'none'): number[] {
  const first = Math.max(1, fromFret);
  if (mode === 'none') return [];
  if (mode === 'all') return Array.from({ length: toFret - first + 1 }, (_unused, i) => first + i);
  const out = INLAY_FRETS.filter((f) => f >= first && f <= toFret);
  if (first > 1 && !out.includes(first)) out.unshift(first);
  return out;
}

/** One step of keyboard movement on a board, in screen directions. */
export type BoardDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Where an arrow key moves the focus on a board: visually, so left-handed and vertical boards feel
 * the same as the standard one. Returns the next position, clamped to the board.
 */
export function moveOnBoard(
  pos: { string: number; fret: number },
  dir: BoardDirection,
  board: { stringCount: number; minFret: number; maxFret: number; orientation: BoardOrientation; leftHanded: boolean },
): { string: number; fret: number } {
  const { orientation, leftHanded } = board;
  let dFret = 0;
  let dString = 0;
  if (orientation === 'horizontal') {
    if (dir === 'left') dFret = leftHanded ? 1 : -1;
    if (dir === 'right') dFret = leftHanded ? -1 : 1;
    if (dir === 'up') dString = -1; // string 1 is on top
    if (dir === 'down') dString = 1;
  } else {
    if (dir === 'up') dFret = -1;
    if (dir === 'down') dFret = 1;
    // Right-handed vertical boards have the low string on the left.
    if (dir === 'left') dString = leftHanded ? -1 : 1;
    if (dir === 'right') dString = leftHanded ? 1 : -1;
  }
  return {
    string: Math.min(board.stringCount, Math.max(1, pos.string + dString)),
    fret: Math.min(board.maxFret, Math.max(board.minFret, pos.fret + dFret)),
  };
}
