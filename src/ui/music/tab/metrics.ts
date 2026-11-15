/**
 * Sizes of the tab engraving at a zoom factor, and text measuring. The CSS module draws text at
 * the same base sizes times `--z` (TabView.module.css); keep the two in step.
 */

/** Which typeface a piece of text uses (each maps to a CSS class and a measuring font). */
export type TabFont = 'fret' | 'small' | 'label' | 'chord' | 'lyric' | 'marker' | 'tempo' | 'barnum' | 'timesig' | 'clef' | 'tuning' | 'annotation';

/** Base font sizes in px at zoom 1. Mirrored in TabView.module.css (`calc(Npx * var(--z))`). */
export const FONT_PX: Readonly<Record<TabFont, number>> = {
  fret: 12,
  small: 9,
  label: 10,
  chord: 13,
  lyric: 12.5,
  marker: 11,
  tempo: 11,
  barnum: 9,
  timesig: 25,
  clef: 10.5,
  tuning: 10,
  annotation: 10.5,
};

/** CSS font weight and family token per font (for canvas measuring; the CSS classes use the same). */
export const FONT_FACE: Readonly<Record<TabFont, { weight: number; family: 'mono' | 'body' | 'display'; italic?: boolean }>> = {
  fret: { weight: 600, family: 'mono' },
  small: { weight: 600, family: 'body' },
  label: { weight: 600, family: 'body', italic: true },
  chord: { weight: 700, family: 'display' },
  lyric: { weight: 500, family: 'body' },
  marker: { weight: 700, family: 'body' },
  tempo: { weight: 600, family: 'body' },
  barnum: { weight: 600, family: 'mono' },
  timesig: { weight: 800, family: 'display' },
  clef: { weight: 800, family: 'display' },
  tuning: { weight: 600, family: 'mono' },
  annotation: { weight: 500, family: 'body', italic: true },
};

/** Measures the advance width of `text` in px at zoom 1. */
export type TextMeasurer = (text: string, font: TabFont) => number;

/** Every length of the engraving, already multiplied by the zoom. */
export interface TabMetrics {
  zoom: number;
  /** Distance between string lines. */
  lineGap: number;
  /** Width of one digit of the fret font (JetBrains Mono advances 0.6 em). */
  digitW: number;
  /** Half the height of a fret digit (cap height / 2): the knock-out and slur clearance. */
  digitHalfH: number;
  /** Ideal width of a quarter note column; other values scale by `(ticks / 960) ^ SPACING_POWER`. */
  quarter: number;
  /** Smallest clear space between two fret numbers. */
  noteGap: number;
  /** From a barline to the left edge of the first fret number, and from the last number to the barline. */
  padLeft: number;
  padRight: number;
  /** Width of the tuning letters column and of the TAB clef. */
  tuningW: number;
  clefW: number;
  timeSigW: number;
  repeatW: number;
  /** Rhythm stems under the staff. */
  stemGap: number;
  stemLen: number;
  beamThick: number;
  beamGap: number;
  /** Row heights above and below the staff. */
  rows: Readonly<Record<RowKind, number>>;
  /** Space between systems. */
  systemGap: number;
  topPad: number;
  bottomPad: number;
  /** Rise of a bend arrow above the string it starts on, at most. */
  bendW: number;
  /** One text pixel at zoom 1 is this many layout pixels. */
  fontScale: number;
}

/**
 * The horizontal rows a system can have, top to bottom (`staff` is the tab itself). `effects` is
 * the band just above the tab where bar numbers, bends, articulations, vibrato, palm mute, let
 * ring, pick strokes and text are stacked as low as they fit (see `placeEffects`).
 */
export type RowKind = 'marker' | 'volta' | 'diagram' | 'chord' | 'notation' | 'effects' | 'staff' | 'pluck' | 'rhythm' | 'tuplet' | 'lyric';

/** Rows in drawing order, top to bottom. */
export const ROW_ORDER: readonly RowKind[] = ['marker', 'volta', 'diagram', 'chord', 'notation', 'effects', 'staff', 'pluck', 'rhythm', 'tuplet', 'lyric'];

/** Things stacked in the effects band, in the order they claim the lowest places. */
export type EffectKind = 'slur' | 'barnum' | 'repeatCount' | 'bend' | 'artic' | 'vibrato' | 'pm' | 'letring' | 'stroke' | 'text';

/** Height of each effect at zoom 1. */
export const EFFECT_H: Readonly<Record<EffectKind, number>> = {
  slur: 10,
  barnum: 9,
  repeatCount: 9,
  bend: 20,
  artic: 9,
  vibrato: 7,
  pm: 11,
  letring: 11,
  stroke: 10,
  text: 13,
};

/** How strongly column width grows with duration (0.5 = square root, as engravers space notes). */
export const SPACING_POWER = 0.55;

/** The metrics at a zoom factor. */
export function tabMetrics(zoom = 1): TabMetrics {
  const z = zoom;
  const fret = FONT_PX.fret * z;
  return {
    zoom: z,
    lineGap: 13 * z,
    digitW: fret * 0.6,
    digitHalfH: fret * 0.38,
    quarter: 40 * z,
    noteGap: 5 * z,
    padLeft: 10 * z,
    padRight: 8 * z,
    tuningW: 12 * z,
    clefW: 19 * z,
    timeSigW: 22 * z,
    repeatW: 11 * z,
    stemGap: 5 * z,
    stemLen: 20 * z,
    beamThick: 3.2 * z,
    beamGap: 2.4 * z,
    rows: {
      marker: 22 * z,
      volta: 17 * z,
      diagram: 0, // set from the diagram size
      chord: 18 * z,
      notation: 0, // set from the notes
      effects: 0, // set from what is stacked in it
      staff: 0, // set from the string count
      pluck: 12 * z,
      rhythm: 0, // stems
      tuplet: 12 * z,
      lyric: 18 * z,
    },
    systemGap: 18 * z,
    topPad: 4 * z,
    bottomPad: 6 * z,
    bendW: 13 * z,
    fontScale: z,
  };
}

// Approximate advance widths in em for proportional fonts, for measuring without a canvas (tests, SSR).
const NARROW = new Set([...'iljtfrI1.,;:\'!|()[] ']);
const WIDE = new Set([...'mwMWœæ@%']);

/**
 * Estimated width of text at zoom 1: exact for the mono fonts (0.6 em per character), within a few
 * percent for the body and display fonts. The browser view swaps in canvas measuring.
 */
export const estimateText: TextMeasurer = (text, font) => {
  const px = FONT_PX[font];
  const face = FONT_FACE[font];
  if (face.family === 'mono') return [...text].length * 0.6 * px;
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.27;
    else if (NARROW.has(ch)) em += 0.3;
    else if (WIDE.has(ch)) em += 0.86;
    else if (/[A-Z]/.test(ch)) em += 0.66;
    else if (/[0-9]/.test(ch)) em += 0.58;
    else if (/[♯♭𝄪𝄫♮]/u.test(ch)) em += 0.55;
    else em += 0.54;
  }
  const weightFactor = face.weight >= 700 ? 1.05 : 1;
  return em * px * weightFactor;
};

/** A canvas-backed measurer for the browser, cached per font and text; falls back to the estimate. */
export function canvasMeasurer(families: { mono: string; body: string; display: string }): TextMeasurer {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  } catch {
    ctx = null;
  }
  if (!ctx) return estimateText;
  const cache = new Map<string, number>();
  const c = ctx;
  return (text, font) => {
    const face = FONT_FACE[font];
    if (face.family === 'mono') return estimateText(text, font);
    const key = `${font}\u0000${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    // Measure at 100 px for precision, then scale to the font size.
    c.font = `${face.italic ? 'italic ' : ''}${face.weight} 100px ${families[face.family]}`;
    const w = (c.measureText(text).width / 100) * FONT_PX[font];
    const value = Number.isFinite(w) && w > 0 ? w : estimateText(text, font);
    cache.set(key, value);
    return value;
  };
}
