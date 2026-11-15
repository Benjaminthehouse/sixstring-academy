/**
 * Chord-box geometry: the standard vertical diagram with the nut (or a base-fret number) on top,
 * the low string on the left (on the right for left-handed players), dots with fingers, barres,
 * and `×` / `o` above the nut. Pure: units are a fixed drawing grid that the component scales.
 */

/** One dot in the box. */
export interface ChordBoxDot {
  string: number;
  fret: number;
  finger: number | null;
  /** Column 0 = leftmost string in the drawing. */
  col: number;
  /** Row 0 = the first fret space under the top line. */
  row: number;
}

/** A barre in the box: one finger across columns `fromCol`…`toCol` (left to right). */
export interface ChordBoxBarre {
  fret: number;
  finger: number | null;
  row: number;
  fromCol: number;
  toCol: number;
  fromString: number;
  toString: number;
}

/** The computed box. */
export interface ChordBoxLayout {
  stringCount: number;
  /** Fret number of the first row; 1 means the nut is drawn. */
  baseFret: number;
  rows: number;
  showNut: boolean;
  dots: ChordBoxDot[];
  barres: ChordBoxBarre[];
  /** Columns of open strings (`o`) and muted strings (`×`). */
  openCols: number[];
  mutedCols: number[];
  /** Column of each string number (index = string number; index 0 unused). */
  colOf: (string: number) => number;
}

/** Input of `chordBoxLayout`. Per-string arrays run low to high, as in the guitar engine. */
export interface ChordBoxInput {
  frets: ReadonlyArray<number | null>;
  fingers?: ReadonlyArray<number | null>;
  barres?: ReadonlyArray<{ fret: number; finger?: number | null; fromString: number; toString: number }>;
  /** Force the first row's fret (default: 1 when everything fits under the nut, else the lowest fretted fret). */
  baseFret?: number;
  /** Minimum number of fret rows (default 4). */
  minRows?: number;
  leftHanded?: boolean;
}

/**
 * Where everything in a chord box goes. A shape that fits within the first `minRows` frets is drawn
 * from the nut; a higher shape starts at its lowest fret, which is then written beside the box.
 */
export function chordBoxLayout(input: ChordBoxInput): ChordBoxLayout {
  const stringCount = input.frets.length;
  const minRows = Math.max(3, input.minRows ?? 4);
  const fretted = input.frets.filter((f): f is number => f !== null && f > 0);
  const lowest = fretted.length ? Math.min(...fretted) : 1;
  const highest = fretted.length ? Math.max(...fretted) : 1;
  const baseFret = Math.max(1, input.baseFret ?? (highest <= minRows ? 1 : lowest));
  const rows = Math.max(minRows, highest - baseFret + 1);
  const colOf = (string: number) => (input.leftHanded ? string - 1 : stringCount - string);
  const dots: ChordBoxDot[] = [];
  const openCols: number[] = [];
  const mutedCols: number[] = [];
  input.frets.forEach((fret, index) => {
    const string = stringCount - index;
    const col = colOf(string);
    if (fret === null) mutedCols.push(col);
    else if (fret === 0) openCols.push(col);
    else dots.push({ string, fret, finger: input.fingers?.[index] ?? null, col, row: fret - baseFret });
  });
  const barres: ChordBoxBarre[] = (input.barres ?? []).map((b) => {
    const a = colOf(b.fromString);
    const c = colOf(b.toString);
    return { fret: b.fret, finger: b.finger ?? null, row: b.fret - baseFret, fromCol: Math.min(a, c), toCol: Math.max(a, c), fromString: b.fromString, toString: b.toString };
  });
  return { stringCount, baseFret, rows, showNut: baseFret === 1, dots, barres, openCols, mutedCols, colOf };
}

/** The drawing grid of a chord box, in drawing units (the SVG viewBox). */
export interface ChordBoxGrid {
  width: number;
  height: number;
  /** Left edge of the strings (column 0). */
  x0: number;
  /** Top line (nut or first fret wire). */
  y0: number;
  colW: number;
  rowH: number;
  dotR: number;
  /** Baselines of the title, the marks above the nut, the labels under the strings and a capo note. */
  titleY: number | null;
  marksY: number;
  footerY: number | null;
  capoY: number | null;
}

/** Sizes the grid: room for a title on top, the base-fret number on the side, labels underneath. */
export function chordBoxGrid(
  layout: Pick<ChordBoxLayout, 'stringCount' | 'rows' | 'showNut'>,
  opts: { title: boolean; footer: boolean; capo?: boolean; leftHanded?: boolean; compact?: boolean },
): ChordBoxGrid {
  const colW = 10;
  const rowH = 12;
  const side = 15; // room for "12fr" beside the first row, clear of a barre's rounded end
  const titleH = opts.title ? 14 : 0;
  const marksH = 9;
  const nut = layout.showNut ? 2.6 : 0;
  const x0 = opts.leftHanded ? 7 : side;
  const y0 = titleH + marksH + nut + 1;
  const gridW = (layout.stringCount - 1) * colW;
  const gridH = layout.rows * rowH;
  const footerH = opts.footer ? 10 : 0;
  const capoH = opts.capo ? 9 : 0;
  return {
    width: x0 + gridW + (opts.leftHanded ? side : 7),
    height: y0 + gridH + footerH + capoH + 3,
    x0,
    y0,
    colW,
    rowH,
    // Small boxes get relatively bigger dots so they still read at 5 rem.
    dotR: opts.compact ? 4.6 : 4.3,
    titleY: opts.title ? 9.5 : null,
    marksY: titleH + marksH / 2,
    footerY: opts.footer ? y0 + gridH + 7.5 : null,
    capoY: opts.capo ? y0 + gridH + footerH + 7.5 : null,
  };
}
