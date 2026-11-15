/**
 * The tab layout engine: how wide each column and measure is (from its content and its length),
 * how measures wrap into systems that fill the width, which rows each system needs (chords,
 * bends, palm mute, rhythm, lyrics …) and where every beat sits. Pure and unit-tested; the
 * renderer only reads the numbers.
 *
 * Spacing model. Every column has an anchor (the centre of its fret numbers and its stem) and
 * reaches `left`/`right` of it. A column's width is the distance to the next anchor. Its ideal
 * width grows with its length (`quarter * (ticks/960)^0.55`); its minimum is what stops content
 * from touching: fret numbers in the same lane need `noteGap`, chord symbols, lyrics and other
 * text rows need their own gaps. Measures can be squeezed from their natural width down to their
 * minimum (to fit a phone) and stretched beyond it (to justify a system).
 */
import { bendText } from './rhythm';
import { isBarRest, type TabColumn, type TabMeasure, type TabModel } from './model';
import { EFFECT_H, estimateText, FONT_PX, ROW_ORDER, SPACING_POWER, tabMetrics, type EffectKind, type RowKind, type TabMetrics, type TextMeasurer } from './metrics';

/** What the standard-notation staff needs from the layout (see `score.ts`). */
export interface NotationSpacing {
  /** Width of the clef and key signature at the start of a system whose first measure has this index. */
  headerWidth(measureIndex: number): number;
  /** Room the staff needs around a column's anchor (accidentals on the left, dots on the right), zoom 1. */
  columnExtent(measureIndex: number, col: number): { left: number; right: number } | null;
  /** Height of the staff region for these measures, zoom 1. */
  regionHeight(measureIndices: readonly number[]): number;
  /** Extra room at the start of a measure (a key change), zoom 1. */
  measureLead?(measureIndex: number): number;
}

/** Options of `layoutTab`. */
export interface TabLayoutOptions {
  /** Width available in px. */
  width: number;
  /** `wrap`: systems fill the width (default). `line`: one long system for horizontal scrolling. */
  mode?: 'wrap' | 'line';
  zoom?: number;
  measureText?: TextMeasurer;
  /** Rhythm stems and beams under the staff (default true). */
  rhythm?: boolean;
  /** Chord symbols above the staff (default true). */
  chords?: boolean;
  /** Small chord diagrams above the symbols: their size in px at zoom 1, or null for none. */
  diagrams?: { width: number; height: number } | null;
  lyrics?: boolean;
  barNumbers?: boolean;
  /** The standard staff above the tab, or null. */
  notation?: NotationSpacing | null;
  /** Never put more than this many bars on a system. */
  maxBarsPerSystem?: number;
  /** Width of a tile in line mode (systems are drawn in tiles so a long line stays light). */
  tileWidth?: number;
}

/** A column after layout: anchor `x` from the measure's left edge, `w` to the next anchor. */
export interface LaidColumn {
  x: number;
  w: number;
  left: number;
  right: number;
}

/** A measure after layout. */
export interface LaidMeasure {
  index: number;
  bar: number;
  system: number;
  /** Left edge (the barline before it) in system coordinates. */
  x: number;
  width: number;
  /** From the left edge to the first anchor. */
  lead: number;
  cols: LaidColumn[];
  natural: number;
  min: number;
}

/** A row of a system. */
export interface LaidRow {
  kind: RowKind;
  y: number;
  h: number;
}

/** One line of music. */
export interface LaidSystem {
  index: number;
  /** Top in content coordinates. */
  y: number;
  width: number;
  height: number;
  /** Measure indices on this system, in order. */
  measures: number[];
  /** Where measures start (after tuning labels, clef and key). */
  headerW: number;
  /** Where the string lines start (after the tuning labels). */
  staffX: number;
  rows: Partial<Record<RowKind, LaidRow>>;
  /** y of string 1 and of the lowest string, system coordinates. */
  staffTop: number;
  staffBottom: number;
  /** Stems run from here down to `stemBottom`. */
  stemTop: number;
  stemBottom: number;
  /** Bar numbers, bends, articulations, spans and text stacked above the staff. */
  effects: PlacedEffect[];
  last: boolean;
}

/** A piece of a system drawn as one SVG: a whole system when wrapping, a stretch of the line otherwise. */
export interface TabTile {
  index: number;
  system: number;
  /** Position in content coordinates and size. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Measures `[from, to)` it shows (index into `layout.measures`). */
  from: number;
  to: number;
}

/** The whole layout. */
export interface TabLayout {
  model: TabModel;
  metrics: TabMetrics;
  mode: 'wrap' | 'line';
  /** Content size. */
  width: number;
  height: number;
  available: number;
  measures: LaidMeasure[];
  systems: LaidSystem[];
  tiles: TabTile[];
  options: Required<Pick<TabLayoutOptions, 'rhythm' | 'chords' | 'lyrics' | 'barNumbers'>> & { diagrams: TabLayoutOptions['diagrams']; notation: NotationSpacing | null };
  measureText: TextMeasurer;
}

interface LaneItem {
  col: number;
  left: number;
  right: number;
}

interface MeasureSpacing {
  natural: { lead: number; cols: number[] };
  min: { lead: number; cols: number[] };
  extents: Array<{ left: number; right: number }>;
}

const TILE_WIDTH = 1400;

/** Ideal width of a column of this many ticks at a quarter width. */
export function idealWidth(ticks: number, quarter: number): number {
  return quarter * Math.pow(Math.max(ticks, 30) / 960, SPACING_POWER);
}

/** How far a column's own content (fret numbers, rests, slashes, dots, flags) reaches left and right of its anchor. */
export function columnExtent(c: TabColumn, m: TabMetrics, rhythm: boolean, beamed: boolean): { left: number; right: number } {
  const z = m.zoom;
  let left = 0;
  let right = 0;
  for (const n of c.notes) {
    let half = (n.text.length * m.digitW) / 2;
    if (n.paren || n.harmonic) half += 3.2 * z;
    let l = half;
    let r = half;
    if (n.note.slideIn && !n.tied) l += 7 * z;
    if (n.note.slide && n.from) l += 3 * z;
    if ((n.note.legato || n.tied) && n.from) l += 1 * z;
    if (n.note.slideOut && !n.tied) r += 7 * z;
    if (n.note.finger !== undefined && n.note.finger !== 0 && !n.tied) r += FONT_PX.small * z * 0.62 + 1.5 * z;
    if (n.note.bend && !n.tied) {
      const b = n.note.bend;
      const reach = b.pre ? (b.release ? m.bendW * 0.9 + 3 * z : 3 * z) : m.bendW * (b.release ? 1.9 : 1) + 3 * z;
      r = Math.max(r, half + reach);
    }
    left = Math.max(left, l);
    right = Math.max(right, r);
  }
  if (c.rest) {
    const half = restHalfWidth(c.value?.base ?? 4) * z;
    left = Math.max(left, half);
    right = Math.max(right, half + (c.value?.dots ? 3 * z : 0));
  }
  if (c.slash) {
    left = Math.max(left, 5.5 * z);
    right = Math.max(right, 5.5 * z);
  }
  if (rhythm && !c.rest) {
    const dots = c.value?.dots ?? 0;
    if (dots) right = Math.max(right, (3.5 + 3 * dots) * z);
    if (c.beams > 0 && !beamed) right = Math.max(right, 8 * z);
  }
  return { left, right };
}

/** Half the width of a rest glyph (at zoom 1) by its value. */
export function restHalfWidth(base: number): number {
  if (base <= 2) return 6;
  if (base === 4) return 4.6;
  return 4 + Math.min(3, Math.log2(base / 8)) * 0.7;
}

/** The column whose span contains a tick (the last column starting at or before it). */
export function columnAtTick(m: TabMeasure, tick: number): number {
  let found = 0;
  for (let i = 0; i < m.columns.length; i++) if (m.columns[i].start <= tick + 1e-6) found = i;
  return found;
}

function laneItems(m: TabMeasure, mx: TabMetrics, measure: TextMeasurer, o: TabLayout['options']): Array<{ items: LaneItem[]; gap: number }> {
  const z = mx.zoom;
  const lanes: Array<{ items: LaneItem[]; gap: number }> = [];
  const push = (items: LaneItem[], gap: number) => {
    if (items.length) lanes.push({ items: items.sort((a, b) => a.col - b.col), gap });
  };
  if (o.chords || o.diagrams) {
    push(
      m.chords.map((c) => {
        let w = measure(c.text, 'chord') * z;
        if (o.diagrams) w = Math.max(w, o.diagrams.width * z);
        return { col: columnAtTick(m, c.tick), left: w / 2, right: w / 2 };
      }),
      9 * z,
    );
  }
  if (o.lyrics) {
    push(
      m.columns.flatMap((c, i) => {
        if (!c.lyric) return [];
        const w = measure(c.lyric.text, 'lyric') * z;
        return [{ col: i, left: w / 2, right: w / 2 + (c.lyric.hyphen ? 6 * z : 0) }];
      }),
      6 * z,
    );
  }
  const texts: LaneItem[] = [];
  m.columns.forEach((c, i) => {
    if (c.text) texts.push({ col: i, left: 3 * z, right: measure(c.text, 'annotation') * z });
  });
  m.annotations.forEach((a) => texts.push({ col: columnAtTick(m, a.tick), left: 3 * z, right: measure(a.text, 'annotation') * z }));
  push(texts, 10 * z);
  push(
    m.columns.flatMap((c, i) => {
      const f = c.flags;
      if (!f.accent && !f.staccato && !f.tap && !f.artificial) return [];
      const w = f.artificial ? measure('A.H.', 'small') * z : f.tap && f.accent ? 14 * z : 8 * z;
      return [{ col: i, left: w / 2, right: w / 2 }];
    }),
    3 * z,
  );
  push(
    m.columns.flatMap((c, i) => {
      const bent = c.notes.find((n) => n.note.bend && !n.tied);
      if (!bent?.note.bend) return [];
      const half = (bent.text.length * mx.digitW) / 2;
      const lw = measure(bendText(bent.note.bend.amount), 'label') * z;
      const at = bent.note.bend.pre ? half * 0.2 : half + mx.bendW;
      return [{ col: i, left: lw / 2 - at, right: at + lw / 2 }];
    }),
    4 * z,
  );
  push(
    m.columns.flatMap((c, i) => (c.flags.pluck ? [{ col: i, left: 4 * z, right: 4 * z }] : [])),
    3 * z,
  );
  if (o.notation) {
    const items: LaneItem[] = [];
    m.columns.forEach((_c, i) => {
      const e = o.notation!.columnExtent(m.index, i);
      if (e) items.push({ col: i, left: e.left * z, right: e.right * z });
    });
    // Noteheads of neighbouring columns must clear each other (and their accidentals).
    push(items, 3 * z);
  }
  return lanes;
}

/** Natural and minimum widths of a measure's lead and columns, satisfying every lane's spacing. */
function spaceMeasure(m: TabMeasure, model: TabModel, mx: TabMetrics, measure: TextMeasurer, o: TabLayout['options']): MeasureSpacing {
  const z = mx.zoom;
  const beamed = new Set(m.beamGroups.flat());
  const extents = m.columns.map((c, i) => columnExtent(c, mx, o.rhythm, beamed.has(i)));
  const header = (m.repeatStart ? mx.repeatW : 0) + (m.showTime ? mx.timeSigW : 0) + (o.notation?.measureLead?.(m.index) ?? 0) * z;
  const lanes = laneItems(m, mx, measure, o);
  const markerMin = markerGroupWidth(m, model, measure, mx);

  const solve = (base: number[]): { lead: number; cols: number[] } => {
    const n = m.columns.length;
    const cols = base.slice();
    let lead = header + mx.padLeft + (extents[0]?.left ?? 0);
    // Fret numbers (and rests, stems' dots and flags): every neighbour pair, and the barline.
    for (let i = 0; i < n; i++) {
      const next = i + 1 < n ? extents[i + 1].left + mx.noteGap : mx.padRight;
      cols[i] = Math.max(cols[i], extents[i].right + next);
    }
    if (isBarRest(m)) {
      // A whole-bar rest sits in the middle of an otherwise empty bar.
      cols[0] = Math.max(cols[0], 30 * z);
    }
    const sum = (a: number, b: number) => {
      let s = 0;
      for (let k = a; k < b; k++) s += cols[k];
      return s;
    };
    const grow = (a: number, b: number, deficit: number) => {
      if (deficit <= 0) return;
      const weights = base.slice(a, b);
      const total = weights.reduce((x, y) => x + y, 0);
      for (let k = a; k < b; k++) cols[k] += total > 0 ? (deficit * base[k]) / total : deficit / (b - a);
    };
    const edge = 2 * z;
    for (const lane of lanes) {
      const items = lane.items;
      const first = items[0];
      lead = Math.max(lead, header + edge + first.left - sum(0, first.col));
      for (let k = 0; k + 1 < items.length; k++) {
        const a = items[k];
        const b = items[k + 1];
        if (b.col === a.col) continue;
        grow(a.col, b.col, a.right + b.left + lane.gap - sum(a.col, b.col));
      }
      const lastItem = items[items.length - 1];
      grow(lastItem.col, n, lastItem.right + edge - sum(lastItem.col, n));
    }
    const width = lead + sum(0, n);
    if (width < markerMin) grow(0, n, markerMin - width);
    return { lead, cols };
  };

  const natural = solve(m.columns.map((c) => idealWidth(c.duration, mx.quarter)));
  const min = solve(m.columns.map(() => 0));
  return { natural, min, extents };
}

/** Width of the section label, tempo mark and capo note that open a measure (they must fit in it). */
function markerGroupWidth(m: TabMeasure, model: TabModel, measure: TextMeasurer, mx: TabMetrics): number {
  const z = mx.zoom;
  let w = 0;
  if (m.section) w += measure(m.section, 'marker') * z + 14 * z;
  for (const t of m.tempo) w += (w ? 8 * z : 0) + 14 * z + measure(t.text, 'tempo') * z;
  if (m.index === 0 && model.capo > 0) w += (w ? 8 * z : 0) + measure(`Capo ${model.capo}`, 'tempo') * z;
  if (m.ending) w = Math.max(w, measure(`${m.ending.numbers.join(', ')}.`, 'label') * z + 12 * z);
  return w ? w + 6 * z : 0;
}

/** Widths of everything at the start of a system, and where the staff lines begin. */
export function systemHeader(model: TabModel, mx: TabMetrics, measure: TextMeasurer, notation: NotationSpacing | null, firstMeasure: number): { staffX: number; headerW: number } {
  const z = mx.zoom;
  const labelW = Math.max(...model.stringLabels.slice(1).map((l) => measure(l, 'tuning') * z), mx.tuningW * 0.6);
  const staffX = labelW + 4 * z;
  let headerW = staffX + mx.clefW;
  if (notation) headerW = Math.max(headerW, staffX + notation.headerWidth(firstMeasure) * z);
  return { staffX, headerW };
}

/**
 * Break measures into systems: an optimal fit (dynamic programming) that prefers lines stretched
 * a little over lines squeezed, never squeezes below a measure's minimum, and does not stretch the
 * last line. `natural[i]`/`min[i]` are measure widths; `available(i)` is the room on a system that
 * starts with measure i. Returns the measure indices of each system.
 */
export function breakSystems(natural: readonly number[], min: readonly number[], available: (start: number) => number, opts: { maxBars?: number } = {}): number[][] {
  const n = natural.length;
  if (n === 0) return [];
  const maxBars = Math.max(1, opts.maxBars ?? n);
  const best = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(0);
  best[0] = 0;
  for (let end = 1; end <= n; end++) {
    let nat = 0;
    let mn = 0;
    for (let start = end - 1; start >= 0 && end - start <= maxBars; start--) {
      nat += natural[start];
      mn += min[start];
      const avail = available(start);
      const count = end - start;
      if (mn > avail && count > 1) break;
      const cost = lineCost(nat, mn, avail, end === n, count);
      if (best[start] + cost < best[end]) {
        best[end] = best[start] + cost;
        from[end] = start;
      }
    }
  }
  const lines: number[][] = [];
  let end = n;
  while (end > 0) {
    const start = from[end];
    lines.unshift(Array.from({ length: end - start }, (_u, k) => start + k));
    end = start;
  }
  return lines;
}

function lineCost(nat: number, mn: number, avail: number, last: boolean, count: number): number {
  const perLine = 1;
  if (mn > avail) return 1000 + perLine; // a single measure wider than the page: it scrolls
  if (nat <= avail) {
    const r = avail / nat;
    if (last) return perLine + (r > 3 && count === 1 ? 0.6 : 0);
    return perLine + 8 * (r - 1) * (r - 1);
  }
  const k = (nat - avail) / Math.max(1e-6, nat - mn);
  return perLine + 3 + 40 * k * k;
}

/** Lay out a model. */
export function layoutTab(model: TabModel, opts: TabLayoutOptions): TabLayout {
  const mode = opts.mode ?? 'wrap';
  const mx = tabMetrics(opts.zoom ?? 1);
  const z = mx.zoom;
  const measureText = opts.measureText ?? estimateText;
  const options: TabLayout['options'] = {
    rhythm: opts.rhythm ?? true,
    chords: opts.chords ?? true,
    lyrics: opts.lyrics ?? true,
    barNumbers: opts.barNumbers ?? true,
    diagrams: opts.diagrams ?? null,
    notation: opts.notation ?? null,
  };
  const width = Math.max(120, Math.floor(opts.width));
  const spacing = model.measures.map((m) => spaceMeasure(m, model, mx, measureText, options));
  const totalNat = spacing.map((s) => s.natural.lead + s.natural.cols.reduce((a, b) => a + b, 0));
  const totalMin = spacing.map((s) => s.min.lead + s.min.cols.reduce((a, b) => a + b, 0));
  const headers = new Map<number, { staffX: number; headerW: number }>();
  const headerAt = (i: number) => {
    let h = headers.get(i);
    if (!h) headers.set(i, (h = systemHeader(model, mx, measureText, options.notation, i)));
    return h;
  };
  const rightPad = 1 * z;
  const lines = mode === 'line' ? [model.measures.map((_m, i) => i)] : breakSystems(totalNat, totalMin, (i) => width - headerAt(i).headerW - rightPad, { maxBars: opts.maxBarsPerSystem });

  const measures: LaidMeasure[] = [];
  const systems: LaidSystem[] = [];
  let y = 0;
  lines.forEach((line, si) => {
    const head = headerAt(line[0] ?? 0);
    const avail = width - head.headerW - rightPad;
    const last = si === lines.length - 1;
    const nat = line.reduce((s, i) => s + totalNat[i], 0);
    const mn = line.reduce((s, i) => s + totalMin[i], 0);
    let x = head.headerW;
    // Stretch factor for columns (leads keep their natural size) or squeeze factor toward the minimum.
    let stretch = 1;
    let squeeze = 1;
    if (mode === 'wrap') {
      if (nat <= avail) {
        const leads = line.reduce((s, i) => s + spacing[i].natural.lead, 0);
        const target = last && nat < avail * 0.72 ? Math.min(avail, nat * 1.12) : avail;
        stretch = Math.max(1, (target - leads) / Math.max(1, nat - leads));
      } else if (mn <= avail) {
        squeeze = (avail - mn) / Math.max(1e-6, nat - mn);
      } else {
        squeeze = 0;
      }
    }
    for (const i of line) {
      const s = spacing[i];
      const lead = s.min.lead + (s.natural.lead - s.min.lead) * squeeze;
      const widths = s.natural.cols.map((nw, k) => (s.min.cols[k] + (nw - s.min.cols[k]) * squeeze) * stretch);
      let at = lead;
      const cols: LaidColumn[] = widths.map((w, k) => {
        const c: LaidColumn = { x: at, w, left: s.extents[k].left, right: s.extents[k].right };
        at += w;
        return c;
      });
      const mWidth = at;
      measures[i] = { index: i, bar: model.measures[i].bar, system: si, x, width: mWidth, lead, cols, natural: totalNat[i], min: totalMin[i] };
      x += mWidth;
    }
    const sysWidth = Math.max(width, Math.ceil(x + rightPad - 0.01));
    const sys = verticalLayout(model, line, si, mx, options, head, sysWidth, last, measures, measureText);
    sys.y = y;
    systems.push(sys);
    y += sys.height + (last ? 0 : mx.systemGap);
  });

  const contentWidth = Math.max(width, ...systems.map((s) => s.width));
  const tiles: TabTile[] = [];
  if (mode === 'wrap') {
    systems.forEach((s) => tiles.push({ index: tiles.length, system: s.index, x: 0, y: s.y, width: contentWidth, height: s.height, from: s.measures[0], to: s.measures[s.measures.length - 1] + 1 }));
  } else if (systems[0]) {
    const s = systems[0];
    const tileW = opts.tileWidth ?? TILE_WIDTH;
    let start = 0;
    let tileX = 0;
    for (let i = 0; i < s.measures.length; i++) {
      const m = measures[s.measures[i]];
      const end = m.x + m.width;
      if (end - tileX >= tileW || i === s.measures.length - 1) {
        const right = i === s.measures.length - 1 ? s.width : end;
        tiles.push({ index: tiles.length, system: 0, x: tileX, y: 0, width: right - tileX, height: s.height, from: s.measures[start], to: s.measures[i] + 1 });
        start = i + 1;
        tileX = right;
      }
    }
  }
  return { model, metrics: mx, mode, width: contentWidth, height: Math.ceil(y), available: width, measures, systems, tiles, options, measureText };
}

function verticalLayout(
  model: TabModel,
  line: number[],
  index: number,
  mx: TabMetrics,
  o: TabLayout['options'],
  head: { staffX: number; headerW: number },
  width: number,
  last: boolean,
  measures: readonly LaidMeasure[],
  measureText: TextMeasurer,
): LaidSystem {
  const z = mx.zoom;
  const ms = line.map((i) => model.measures[i]);
  const cols = ms.flatMap((m) => m.columns);
  const clear = mx.digitHalfH + 1.5 * z;
  const effects = placeEffects(collectEffects(model, line, measures, mx, measureText, o), 2 * z, 4 * z);
  const effectsH = effects.reduce((h, e) => Math.max(h, e.lift + e.h), 0);
  const has: Partial<Record<RowKind, boolean>> = {
    marker: ms.some((m) => m.section || m.tempo.length || (m.index === 0 && model.capo > 0)),
    volta: ms.some((m) => m.ending),
    diagram: !!o.diagrams && ms.some((m) => m.chords.length),
    chord: o.chords && ms.some((m) => m.chords.length),
    notation: !!o.notation,
    effects: effectsH > 0,
    staff: true,
    pluck: cols.some((c) => c.flags.pluck),
    rhythm: o.rhythm && cols.some((c) => !c.rest),
    tuplet: o.rhythm && ms.some((m) => m.tuplets.length),
    lyric: o.lyrics && cols.some((c) => c.lyric),
  };
  const staffH = (model.strings - 1) * mx.lineGap + 2 * clear;
  const heightOf = (k: RowKind): number => {
    switch (k) {
      case 'staff':
        return staffH;
      case 'diagram':
        return (o.diagrams?.height ?? 0) * z + 4 * z;
      case 'notation':
        return (o.notation?.regionHeight(line) ?? 0) * z;
      case 'effects':
        return effectsH + 2 * z;
      case 'rhythm':
        return mx.stemGap + mx.stemLen + 2 * z;
      default:
        return mx.rows[k];
    }
  };
  const rows: Partial<Record<RowKind, LaidRow>> = {};
  let y = mx.topPad;
  for (const k of ROW_ORDER) {
    if (!has[k]) continue;
    const h = heightOf(k);
    rows[k] = { kind: k, y, h };
    y += h;
  }
  const staff = rows.staff!;
  const staffTop = staff.y + clear;
  const staffBottom = staffTop + (model.strings - 1) * mx.lineGap;
  const below = rows.pluck ? rows.pluck.y + rows.pluck.h : staffBottom + clear;
  const stemTop = below + mx.stemGap * 0.4;
  // Effects stand on the line just above the numbers of the top string.
  const base = staffTop - mx.digitHalfH - 1.5 * z;
  return {
    index,
    y: 0,
    width,
    height: Math.ceil(y + mx.bottomPad),
    measures: line,
    headerW: head.headerW,
    staffX: head.staffX,
    rows,
    staffTop,
    staffBottom,
    stemTop,
    stemBottom: stemTop + mx.stemLen,
    effects: effects.map((e) => ({ ...e, bottom: base - e.lift, top: base - e.lift - e.h })),
    last,
  };
}

/** An item to stack above the staff, before it is placed. */
export interface EffectItem {
  kind: EffectKind;
  x0: number;
  x1: number;
  h: number;
  /** Measure index and column (for drawing); for spans, the first column. */
  measure: number;
  col: number;
  text?: string;
  /** For bends: the bent note's string and the label's centre. */
  string?: number;
  at?: number;
}

/** An effect after placement: `lift` above the base line; `bottom`/`top` in system coordinates once laid out. */
export interface PlacedEffect extends EffectItem {
  lift: number;
  bottom: number;
  top: number;
}

const EFFECT_ORDER: readonly EffectKind[] = ['slur', 'barnum', 'repeatCount', 'bend', 'artic', 'vibrato', 'pm', 'letring', 'stroke', 'text'];

/**
 * Stack effects: in order of kind (slur letters and bar numbers lowest, then bends, articulations,
 * vibrato, palm mute, let ring, pick strokes, text), each item goes just above everything already
 * placed that overlaps it horizontally. Items that overlap nothing sit on the base line, so a
 * system with a bend in one bar does not push the palm mute of another bar up.
 */
export function placeEffects(items: readonly EffectItem[], gap = 2, margin = 3): Array<EffectItem & { lift: number }> {
  const order = new Map(EFFECT_ORDER.map((k, i) => [k, i]));
  const sorted = items.slice().sort((a, b) => (order.get(a.kind)! - order.get(b.kind)!) || a.x0 - b.x0);
  const placed: Array<EffectItem & { lift: number }> = [];
  const BUCKET = 256;
  const buckets = new Map<number, Array<EffectItem & { lift: number }>>();
  for (const it of sorted) {
    let lift = 0;
    const b0 = Math.floor((it.x0 - margin) / BUCKET);
    const b1 = Math.floor((it.x1 + margin) / BUCKET);
    const seen = new Set<object>();
    for (let b = b0; b <= b1; b++) {
      for (const p of buckets.get(b) ?? []) {
        if (seen.has(p)) continue;
        seen.add(p);
        if (p.x1 + margin > it.x0 && p.x0 - margin < it.x1) lift = Math.max(lift, p.lift + p.h + gap);
      }
    }
    const done = { ...it, lift };
    placed.push(done);
    for (let b = b0; b <= b1; b++) {
      let list = buckets.get(b);
      if (!list) buckets.set(b, (list = []));
      list.push(done);
    }
  }
  return placed;
}

/** Every effect of a system's measures, with its horizontal extent (system coordinates). */
export function collectEffects(model: TabModel, line: readonly number[], measures: readonly LaidMeasure[], mx: TabMetrics, measureText: TextMeasurer, o: TabLayout['options']): EffectItem[] {
  const z = mx.zoom;
  const items: EffectItem[] = [];
  const H = (k: EffectKind) => EFFECT_H[k] * z;
  for (const mi of line) {
    const m = model.measures[mi];
    const lm = measures[mi];
    if (o.barNumbers) {
      const text = String(m.bar + 1);
      const w = measureText(text, 'barnum') * z;
      // Over the barline, as engravers number bars: the first beat's marks keep their place.
      const x0 = lm.x - w / 2 + (lm.system === measures[line[0]].system && mi === line[0] ? 1 * z : 0);
      items.push({ kind: 'barnum', x0, x1: x0 + w, h: H('barnum'), measure: mi, col: 0, text });
    }
    if ((m.repeatEnd ?? 0) > 2) {
      const text = `×${m.repeatEnd}`;
      const w = measureText(text, 'barnum') * z * 1.2;
      const x1 = lm.x + lm.width - 3 * z;
      items.push({ kind: 'repeatCount', x0: x1 - w, x1, h: H('repeatCount'), measure: mi, col: 0, text });
    }
    m.annotations.forEach((a) => {
      const x0 = lm.x + lm.cols[columnAtTick(m, a.tick)].x - 3 * z;
      items.push({ kind: 'text', x0, x1: x0 + measureText(a.text, 'annotation') * z, h: H('text'), measure: mi, col: columnAtTick(m, a.tick), text: a.text });
    });
    m.columns.forEach((c, ci) => {
      const ax = lm.x + lm.cols[ci].x;
      if (c.text) items.push({ kind: 'text', x0: ax - 3 * z, x1: ax - 3 * z + measureText(c.text, 'annotation') * z, h: H('text'), measure: mi, col: ci, text: c.text });
      if (c.stroke) items.push({ kind: 'stroke', x0: ax - 4.5 * z, x1: ax + 4.5 * z, h: H('stroke'), measure: mi, col: ci });
      const f = c.flags;
      if (f.accent || f.staccato || f.tap || f.artificial) {
        const w = articWidth(c, measureText, z);
        items.push({ kind: 'artic', x0: ax - w / 2, x1: ax + w / 2, h: H('artic'), measure: mi, col: ci });
      }
      for (const n of c.notes) {
        if (n.tied) continue;
        if (n.note.bend) {
          const half = (n.text.length * mx.digitW) / 2 + (n.paren || n.harmonic ? 3.2 * z : 0);
          const at = ax + (n.note.bend.pre ? half * 0.2 + 0.8 * z : half + mx.bendW);
          const text = bendText(n.note.bend.amount);
          const lw = measureText(text, 'label') * z;
          const reach = n.note.bend.release ? at + mx.bendW * 0.9 + 3 * z : at + 3 * z;
          items.push({ kind: 'bend', x0: Math.min(at - lw / 2, at - 3 * z), x1: Math.max(at + lw / 2, reach), h: H('bend'), measure: mi, col: ci, text, string: n.string, at });
        }
        // The H / P over a slur on the top string sits in this band.
        if (n.string === 1 && n.note.legato && n.from) {
          const prev = measures[n.from.measure];
          const sameSystem = prev && prev.system === lm.system;
          const sx = sameSystem ? prev.x + prev.cols[n.from.col].x : lm.x - 6 * z;
          const lx = (sx + ax) / 2;
          items.push({ kind: 'slur', x0: lx - 4 * z, x1: lx + 4 * z, h: H('slur'), measure: mi, col: ci });
        }
      }
    });
  }
  for (const [kind, flag, label] of [
    ['vibrato', 'vibrato', ''],
    ['pm', 'palmMute', 'P.M.'],
    ['letring', 'letRing', 'let ring'],
  ] as const) {
    for (const run of columnRuns(model, line, measures, mx, (c) => c.flags[flag])) {
      const lw = label ? measureText(label, 'label') * z + 7 * z : 0;
      items.push({ kind, x0: run.x0, x1: Math.max(run.x1, run.x0 + lw), h: H(kind), measure: run.measure, col: run.col, text: label || undefined });
    }
  }
  return items;
}

function articWidth(c: TabColumn, measureText: TextMeasurer, z: number): number {
  const f = c.flags;
  const parts: number[] = [];
  if (f.accent) parts.push(7 * z);
  if (f.staccato) parts.push(3 * z);
  if (f.tap) parts.push(7 * z);
  if (f.artificial) parts.push(measureText('A.H.', 'small') * z);
  return parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * 2 * z;
}

/** Runs of consecutive columns (across a system's measures) that pass a test, as x extents (system coordinates). */
export function columnRuns(model: TabModel, line: readonly number[], measures: readonly LaidMeasure[], mx: TabMetrics, test: (c: TabColumn) => boolean): Array<{ x0: number; x1: number; measure: number; col: number }> {
  const z = mx.zoom;
  const out: Array<{ x0: number; x1: number; measure: number; col: number }> = [];
  let open: { x0: number; x1: number; measure: number; col: number } | null = null;
  for (const mi of line) {
    const m = model.measures[mi];
    const lm = measures[mi];
    m.columns.forEach((c, ci) => {
      const lc = lm.cols[ci];
      const ax = lm.x + lc.x;
      if (test(c)) {
        const start = ax - Math.max(lc.left, mx.digitW / 2);
        const end = ax + lc.w - (ci === m.columns.length - 1 ? mx.padRight * 0.6 : 4 * z);
        if (open) open.x1 = end;
        else open = { x0: start, x1: end, measure: mi, col: ci };
      } else if (open) {
        out.push(open);
        open = null;
      }
    });
  }
  if (open) out.push(open);
  return out;
}

// ── Positions, for the cursor and for pointer input ─────────────────────────────────────────────

/** x (system coordinates) of a tick in a measure: anchors at column starts, the barline at the end, linear between. */
export function xAtTick(layout: TabLayout, measureIndex: number, tick: number): number {
  const lm = layout.measures[measureIndex];
  const m = layout.model.measures[measureIndex];
  if (!lm || !m) return 0;
  const cols = m.columns;
  if (!cols.length || tick <= cols[0].start) return lm.x + (lm.cols[0]?.x ?? lm.lead);
  for (let i = 0; i < cols.length; i++) {
    const start = cols[i].start;
    const end = i + 1 < cols.length ? cols[i + 1].start : m.length;
    if (tick < end || i === cols.length - 1) {
      const x0 = lm.cols[i].x;
      const x1 = i + 1 < cols.length ? lm.cols[i + 1].x : lm.width;
      const f = Math.max(0, Math.min(1, (tick - start) / Math.max(1, end - start)));
      return lm.x + x0 + (x1 - x0) * f;
    }
  }
  return lm.x + lm.width;
}

/** The measure index of a song bar in this layout, or -1 when it is not shown. */
export function measureOfBar(layout: TabLayout, bar: number): number {
  const i = bar - layout.model.firstBar;
  return i >= 0 && i < layout.measures.length ? i : -1;
}

/** Where a playback position is: content coordinates of the cursor and the column it is in. */
export function locate(layout: TabLayout, bar: number, tick: number): { measure: number; col: number; system: number; x: number; y: number } | null {
  const mi = measureOfBar(layout, bar);
  if (mi < 0) return null;
  const lm = layout.measures[mi];
  const sys = layout.systems[lm.system];
  const col = columnAtTick(layout.model.measures[mi], tick);
  return { measure: mi, col, system: lm.system, x: xAtTick(layout, mi, tick), y: sys.y };
}

/** The horizontal span of a column, from just before its content to just before the next column (content x). */
export function columnSpan(layout: TabLayout, measureIndex: number, col: number): { x0: number; x1: number } {
  const lm = layout.measures[measureIndex];
  const c = lm.cols[col];
  const pad = 3 * layout.metrics.zoom;
  const x0 = lm.x + c.x - Math.max(c.left, layout.metrics.digitW / 2) - pad;
  const nextLeft = lm.cols[col + 1] ? Math.max(lm.cols[col + 1].left, layout.metrics.digitW / 2) + pad : layout.metrics.padRight * 0.4;
  const x1 = lm.x + c.x + c.w - nextLeft;
  return { x0, x1: Math.max(x1, lm.x + c.x + Math.max(c.right, layout.metrics.digitW / 2) + pad * 0.5) };
}

/** What a point (content coordinates) is on: system, measure, nearest column. */
export function hitTest(layout: TabLayout, x: number, y: number): { system: number; measure: number; bar: number; col: number; beat: number; tick: number } | null {
  const sys = systemAtY(layout, y, layout.mode === 'line' ? 0 : undefined);
  if (!sys) return null;
  const ms = sys.measures;
  let mi = ms[0];
  for (const i of ms) if (layout.measures[i].x <= x) mi = i;
  const lm = layout.measures[mi];
  const m = layout.model.measures[mi];
  const local = x - lm.x;
  let col = 0;
  for (let k = 0; k < lm.cols.length; k++) {
    const mid = k + 1 < lm.cols.length ? (lm.cols[k].x + lm.cols[k + 1].x) / 2 : Infinity;
    if (local < mid) {
      col = k;
      break;
    }
  }
  // A tied piece belongs to the beat it continues.
  while (col > 0 && m.columns[col].piece > 0) col--;
  const c = m.columns[col];
  return { system: sys.index, measure: mi, bar: m.bar, col, beat: c?.beat ?? 0, tick: c?.start ?? 0 };
}

/** The system at a content y (the nearest one when y falls in a gap). */
export function systemAtY(layout: TabLayout, y: number, force?: number): LaidSystem | null {
  if (force !== undefined) return layout.systems[force] ?? null;
  let best: LaidSystem | null = null;
  for (const s of layout.systems) {
    if (y >= s.y - layout.metrics.systemGap / 2) best = s;
    else break;
  }
  return best ?? layout.systems[0] ?? null;
}

/** Rectangles (content coordinates) covering bars `[fromBar, toBar]` inclusive, one per system they touch, over the given rows. */
export function barRangeRects(layout: TabLayout, fromBar: number, toBar: number, rows: 'staff' | 'all' = 'all'): Array<{ x: number; y: number; width: number; height: number; system: number; start: boolean; end: boolean }> {
  const lo = Math.min(fromBar, toBar);
  const hi = Math.max(fromBar, toBar);
  const out: Array<{ x: number; y: number; width: number; height: number; system: number; start: boolean; end: boolean }> = [];
  for (const sys of layout.systems) {
    const inside = sys.measures.filter((i) => layout.measures[i].bar >= lo && layout.measures[i].bar <= hi);
    if (!inside.length) continue;
    const a = layout.measures[inside[0]];
    const b = layout.measures[inside[inside.length - 1]];
    const top = rows === 'staff' ? sys.staffTop - layout.metrics.lineGap * 0.7 : regionTop(sys);
    const bottom = rows === 'staff' ? sys.staffBottom + layout.metrics.lineGap * 0.7 : regionBottom(sys);
    out.push({ x: a.x, y: sys.y + top, width: b.x + b.width - a.x, height: bottom - top, system: sys.index, start: a.bar === lo, end: b.bar === hi });
  }
  return out;
}

/** Top of the music in a system (the notation staff when shown, else the rows just above the tab). */
export function regionTop(sys: LaidSystem): number {
  const r = sys.rows.notation ?? sys.rows.effects ?? sys.rows.staff!;
  return r.y;
}

/** Bottom of the music in a system (below the rhythm, above the lyrics). */
export function regionBottom(sys: LaidSystem): number {
  const r = sys.rows.tuplet ?? sys.rows.rhythm ?? sys.rows.pluck ?? sys.rows.staff!;
  return r.y + r.h;
}

/** The bar boundary nearest to a content point: the bar that starts (or, with `edge: 'end'`, ends) there. */
export function barBoundaryAt(layout: TabLayout, x: number, y: number, edge: 'start' | 'end'): number | null {
  const sys = systemAtY(layout, y, layout.mode === 'line' ? 0 : undefined);
  if (!sys) return null;
  let best: number | null = null;
  let bestD = Infinity;
  for (const i of sys.measures) {
    const lm = layout.measures[i];
    const bx = edge === 'start' ? lm.x : lm.x + lm.width;
    const d = Math.abs(bx - x);
    if (d < bestD) {
      bestD = d;
      best = lm.bar;
    }
  }
  return best;
}
