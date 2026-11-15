/**
 * The page pipeline: analysis (preprocess + layout), staff-strip extraction for the recognizers,
 * and assembly of their readings into the output model.
 *
 *   const analysis = analyzePage(gray);                    // geometry only, no symbols
 *   const input = extractStaff(analysis, 0);               // cleaned strip of the first staff
 *   const page = assemblePage(analysis, readings);         // events placed, staves linked
 *
 * The full pipeline with recognizers, progress and cancellation is `recognizePage` in pipeline.ts.
 */
import { removeSmallComponents } from './image/cc';
import { type BinaryImage, type GrayImage, type Point, blur3, downscaleInt } from './image/gray';
import { flatten } from './image/illumination';
import { type PreprocessOptions, type PreprocessResult, binarizeLines, binarizeSymbols, preprocess } from './image/preprocess';
import { type WarpMesh, meshFromFunction, meshMap, meshUnmap, warpGray } from './image/warp';
import { type LayoutResult, detectLayout } from './staff/layout';
import { type StaffGeom, type StaffLayout, lineYAt } from './staff/model';
import { removeStaffLines } from './staff/removal';
import type { BBox, OmrBarline, OmrEvent, OmrMeasure, OmrPage, OmrPageQuality, OmrStaff, OmrSystem, OmrWarning, StaffInput, StaffReading } from './types';
import { STANDARD_TUNING } from './types';
import { linkSystem } from './reconcile';

/** Result of {@link analyzePage}. */
export interface PageAnalysis {
  pre: PreprocessResult;
  /** Layout in the coordinates of the normalised page. */
  layout: LayoutResult;
  /** The output model with geometry only: systems, staves, bar lines and empty measures, in page px. */
  page: OmrPage;
}

/** Options for {@link analyzePage}. */
export type AnalyzeOptions = PreprocessOptions;

function boxOfPoints(pts: Point[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Map a box of the normalised page to its bounding box on the original page. */
function mapBox(mesh: WarpMesh, b: BBox): BBox {
  return boxOfPoints([meshMap(mesh, b.x, b.y), meshMap(mesh, b.x + b.w, b.y), meshMap(mesh, b.x, b.y + b.h), meshMap(mesh, b.x + b.w, b.y + b.h)]);
}

function qualityOf(pre: PreprocessResult): OmrPageQuality {
  const source = pre.correction === 'mesh' ? 'photo' : pre.correction === 'similarity' || pre.noise >= 1.5 ? 'scan' : 'render';
  const detail = pre.sourceStaffSpace > 0 ? Math.min(1, pre.sourceStaffSpace / 11) : 0;
  const clean = 1 - Math.min(0.6, pre.noise / 30);
  const score = Math.max(0, Math.min(1, detail * clean * (0.45 + 0.55 * pre.contrast)));
  return {
    source,
    skewDegrees: (pre.skew * 180) / Math.PI,
    correction: pre.correction,
    sourceStaffSpace: pre.sourceStaffSpace,
    noise: pre.noise,
    contrast: pre.contrast,
    score,
  };
}

/** Geometry of one staff on the original page. */
function staffToPage(st: StaffLayout, mesh: WarpMesh, id: string): OmrStaff {
  const lines: Point[][] = [];
  for (let l = 0; l < st.lineCount; l++) {
    const line: Point[] = [];
    for (let k = 0; k < st.xs.length; k++) line.push(meshMap(mesh, st.xs[k], st.ys[l][k]));
    lines.push(line);
  }
  const K = st.xs.length;
  let dist = 0;
  for (let k = 0; k < K; k++) dist += Math.hypot(lines[st.lineCount - 1][k].x - lines[0][k].x, lines[st.lineCount - 1][k].y - lines[0][k].y);
  const space = dist / K / (st.lineCount - 1);
  const ratio = space / st.space;
  const mid = (l: Point[][], k: number): Point => ({ x: (l[0][k].x + l[st.lineCount - 1][k].x) / 2, y: (l[0][k].y + l[st.lineCount - 1][k].y) / 2 });
  const all = lines.flat();
  const bb = boxOfPoints(all);
  const lt = st.thickness * ratio;
  const bbox: BBox = { x: bb.x, y: bb.y - lt / 2, w: bb.w, h: bb.h + lt };
  const centreY = (x: number): number => (lineYAt(st, 0, x) + lineYAt(st, st.lineCount - 1, x)) / 2;
  const barlines: OmrBarline[] = st.barlines.map((b, j) => {
    const p = meshMap(mesh, b.x, centreY(b.x));
    return {
      id: `${id}.b${j}`,
      bbox: boxOfPoints([meshMap(mesh, b.x0, b.yTop), meshMap(mesh, b.x1, b.yTop), meshMap(mesh, b.x0, b.yBottom), meshMap(mesh, b.x1, b.yBottom)]),
      confidence: b.confidence,
      source: 'image',
      x: p.x,
      type: b.type,
      systemWide: b.systemWide,
    };
  });
  const measures: OmrMeasure[] = st.measures.map((m, j) => {
    const a = meshMap(mesh, m.x0, centreY(m.x0));
    const c = meshMap(mesh, m.x1, centreY(m.x1));
    const start = st.barlines.findIndex((b) => Math.abs(b.x - m.x0) < 0.5);
    const end = st.barlines.findIndex((b) => Math.abs(b.x - m.x1) < 0.5);
    return {
      id: `${id}.m${j}`,
      bbox: boxOfPoints([
        meshMap(mesh, m.x0, lineYAt(st, 0, m.x0)), meshMap(mesh, m.x1, lineYAt(st, 0, m.x1)),
        meshMap(mesh, m.x0, lineYAt(st, st.lineCount - 1, m.x0)), meshMap(mesh, m.x1, lineYAt(st, st.lineCount - 1, m.x1)),
      ]),
      confidence: 1,
      index: j,
      x0: a.x,
      x1: c.x,
      events: [],
      startBarlineId: start >= 0 ? barlines[start].id : undefined,
      endBarlineId: end >= 0 ? barlines[end].id : undefined,
    };
  });
  const other = st.kind === 'tab' ? 'notation' : 'tab';
  return {
    id,
    bbox,
    confidence: st.confidence,
    source: 'image',
    kind: st.kind,
    kindAlternatives: [{ value: st.kind, confidence: st.kindConfidence }, { value: other, confidence: 1 - st.kindConfidence }],
    lineCount: st.lineCount,
    geometry: { lines, space, lineThickness: lt, x0: mid(lines, 0).x, x1: mid(lines, K - 1).x, bbox, contentBox: mapBox(mesh, st.contentBox) },
    barlines,
    measures,
    tuning: st.kind === 'tab' ? STANDARD_TUNING.slice() : undefined,
  };
}

/** Id of a staff in the output model. */
export function staffId(st: { systemIndex: number; indexInSystem: number }): string {
  return `s${st.systemIndex}.st${st.indexInSystem}`;
}

/** Preprocess a page and find its layout. No symbols are read. */
export function analyzePage(source: GrayImage, opts: AnalyzeOptions = {}): PageAnalysis {
  const pre = preprocess(source, opts);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let layout = detectLayout(pre.binary, { lineBinary: pre.lineBinary, strokeBinary: pre.strokeBinary, noise: pre.noise });
  if (layout.staves.length < pre.roughStaves.length && pre.lineBinary === pre.binary && pre.staffSpace > 0) {
    // The first pass traced more staves on the raw capture than survive on the normalised page
    // (typically faint lines chopped up by JPEG blocks): look again with the lines smoothed.
    pre.lineBinary = binarizeLines(pre.gray, pre.staffSpace, 0, 1.0, pre.noise);
    const again = detectLayout(pre.binary, { lineBinary: pre.lineBinary, strokeBinary: pre.strokeBinary, noise: pre.noise });
    if (again.staves.length > layout.staves.length) layout = again;
  }
  pre.timings.layout = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  const warnings: OmrWarning[] = [];
  const systems: OmrSystem[] = layout.systems.map((sys) => {
    const staves = sys.staves.map((i) => staffToPage(layout.staves[i], pre.mesh, staffId(layout.staves[i])));
    sys.staves.forEach((i, k) => {
      const p = layout.staves[i].partner;
      if (p !== null) staves[k].linkedStaffId = staffId(layout.staves[p]);
      if (layout.staves[i].kindConfidence < 0.7) warnings.push({ code: 'kind-uncertain', message: 'Could not tell for sure whether this staff is notation or tab.', staffId: staves[k].id });
    });
    return {
      id: `s${sys.index}`,
      bbox: mapBox(pre.mesh, sys.bbox),
      confidence: Math.min(...staves.map((s) => s.confidence)),
      source: 'image',
      index: sys.index,
      staves,
      texts: [],
    };
  });
  const quality = qualityOf(pre);
  if (!layout.staves.length) warnings.push({ code: 'no-staves', message: 'No staff lines were found on this page.' });
  else if (pre.sourceStaffSpace < 7) warnings.push({ code: 'low-resolution', message: 'The staves are very small in this picture. A closer or sharper shot will read better.' });
  if (layout.staves.length && quality.score < 0.45) warnings.push({ code: 'low-quality', message: 'The picture is noisy or low in contrast; expect mistakes.' });
  const scaleBack = systems.length ? systems[0].staves[0].geometry.space / layout.staves[layout.systems[0].staves[0]].space : 1;
  const page: OmrPage = {
    width: source.width,
    height: source.height,
    staffSpace: layout.staffSpace * scaleBack,
    systems,
    texts: [],
    quality,
    warnings,
  };
  return { pre, layout, page };
}

/** Options for {@link extractStaff}. */
export interface ExtractOptions {
  /** Staff space of the strip in px. Default 20 for notation, 24 for tab. */
  space?: number;
  /** Room kept above the top line and below the bottom line, in staff spaces. Defaults: notation 7 / 7, tab 3.5 / 6. */
  above?: number;
  below?: number;
  /** Room kept left and right of the staff, in staff spaces. Default 1. */
  side?: number;
}

/** Default strip resolution per staff kind (px per staff space). */
export const DEFAULT_STRIP_SPACE = { notation: 20, tab: 24 } as const;

/** Median vertical run length through the given rows of a strip: the line thickness after resampling. */
function measureThickness(bin: BinaryImage, lineYs: number[], fallback: number): number {
  const { width: w, height: h, data } = bin;
  const hist = new Uint32Array(64);
  let n = 0;
  const step = Math.max(1, Math.floor(w / 400));
  const cap = Math.max(4, Math.round((lineYs.length > 1 ? lineYs[1] - lineYs[0] : 16) * 0.6));
  for (const ly of lineYs) {
    const yc = Math.floor(ly);
    for (let x = 0; x < w; x += step) {
      let y = -1;
      for (let d = 0; d <= 2 && y < 0; d++) {
        if (yc - d >= 0 && data[(yc - d) * w + x]) y = yc - d;
        else if (yc + d < h && data[(yc + d) * w + x]) y = yc + d;
      }
      if (y < 0) continue;
      let a = y;
      let b = y;
      while (a > 0 && data[(a - 1) * w + x]) a--;
      while (b < h - 1 && data[(b + 1) * w + x]) b++;
      const len = b - a + 1;
      if (len < 64 && len <= cap) {
        hist[len]++;
        n++;
      }
    }
  }
  if (n < 20) return fallback;
  // The median run is the line (symbols crossing it are the long minority, broken bits the short one).
  let acc = 0;
  let med = 1;
  for (let i = 1; i < 64; i++) {
    acc += hist[i];
    if (acc >= n / 2) {
      med = i;
      break;
    }
  }
  let a = 0;
  let m = 0;
  for (let i = Math.max(1, med - 1); i <= Math.min(63, med + 1); i++) {
    a += hist[i] * i;
    m += hist[i];
  }
  return m ? a / m : med;
}

/**
 * Cut one staff out of the page as a cleaned, perfectly straightened strip, resampled directly
 * from the original image (one interpolation) at the requested staff space.
 */
export function extractStaff(analysis: PageAnalysis, index: number, opts: ExtractOptions = {}): StaffInput {
  const { pre, layout } = analysis;
  const st = layout.staves[index];
  if (!st) throw new Error(`no staff ${index} on this page`);
  const space = opts.space ?? DEFAULT_STRIP_SPACE[st.kind];
  const kappa = space / st.space;
  const side = opts.side ?? 1;
  const n = st.lineCount;
  const xm = (st.x0 + st.x1) / 2;
  // Do not reach into the neighbouring staves.
  const prev = index > 0 ? layout.staves[index - 1] : null;
  const next = index + 1 < layout.staves.length ? layout.staves[index + 1] : null;
  let above = opts.above ?? (st.kind === 'tab' ? 3.5 : 7);
  let below = opts.below ?? (st.kind === 'tab' ? 6 : 7);
  if (prev && Math.min(prev.x1, st.x1) > Math.max(prev.x0, st.x0)) {
    const room = (lineYAt(st, 0, xm) - lineYAt(prev, prev.lineCount - 1, xm) - 0.6 * prev.space) / st.space;
    above = Math.max(1.5, Math.min(above, room));
  }
  if (next && Math.min(next.x1, st.x1) > Math.max(next.x0, st.x0)) {
    const room = (lineYAt(next, 0, xm) - lineYAt(st, n - 1, xm) - 0.6 * next.space) / st.space;
    below = Math.max(1.5, Math.min(below, room));
  }
  const pad = Math.round(side * space);
  const top = Math.round(above * space);
  const width = Math.max(8, Math.round((st.x1 - st.x0) * kappa) + 2 * pad);
  const height = Math.max(8, top + Math.round((n - 1 + below) * space));
  const lineYs: number[] = [];
  for (let l = 0; l < n; l++) lineYs.push(top + l * space);

  // Strip -> normalised page: follow the staff's own lines so that they come out exactly straight.
  const toNorm = (u: number, v: number): Point => {
    const x = st.x0 + (u - pad) / kappa;
    const q = (v - top) / space; // staff spaces below the top line
    let l = Math.floor(q);
    if (l < 0) l = 0; else if (l > n - 2) l = n - 2;
    const ya = lineYAt(st, l, x);
    const yb = lineYAt(st, l + 1, x);
    return { x, y: ya + (yb - ya) * (q - l) };
  };
  const cell = 8;
  const mesh = meshFromFunction(width, height, cell, (u, v) => {
    const p = toNorm(u, v);
    return meshMap(pre.mesh, p.x, p.y);
  });
  // Strip px per source px.
  const sourceSpace = pre.sourceStaffSpace > 0 ? (pre.sourceStaffSpace * st.space) / Math.max(1e-6, layout.staffSpace) : st.space / Math.max(1e-6, pre.scale);
  const scale = space / Math.max(1e-6, sourceSpace);
  let src = pre.source;
  let m: WarpMesh = mesh;
  if (scale < 0.55) {
    src = downscaleInt(pre.source, 2);
    m = { ...mesh, sx: mesh.sx.map((v) => v / 2), sy: mesh.sy.map((v) => v / 2) };
  } else if (scale < 0.8) {
    src = blur3(pre.source);
  }
  const outside = new Uint8Array(width * height);
  const raw = warpGray(src, m, { edge: 'clamp', outside });
  const flat = flatten(raw, { cell: Math.max(4, Math.round(space / 2)), radius: 3, noiseLag: Math.max(1, scale) });
  for (let i = 0; i < outside.length; i++) if (outside[i]) flat.image.data[i] = 255;
  // Same policy as for the page: noisy captures are low-passed a little and cleaned of specks.
  const noise = Math.max(flat.noise, pre.noise);
  const binary = binarizeSymbols(flat.image, space, noise);
  const stripGeom: StaffGeom = {
    lineCount: n,
    xs: Float32Array.from([pad, width - pad]),
    ys: lineYs.map((y) => Float32Array.from([y, y])),
    x0: pad,
    x1: width - pad,
    space,
    thickness: 1,
    coverage: st.coverage,
    confidence: st.confidence,
  };
  stripGeom.thickness = measureThickness(binary, lineYs, Math.max(1, st.thickness * kappa));
  // Ragged lines of a noisy capture need more slack than the crisp ones of a render.
  const removal = removeStaffLines(binary, [stripGeom], noise >= 3 ? { maxThickness: Math.ceil(stripGeom.thickness * 1.4 + 1) } : {});
  if (noise >= 3) removeSmallComponents(removal.image, Math.max(3, Math.round(0.03 * space * space)));
  const toStripX = (x: number): number => pad + (x - st.x0) * kappa;
  const toPage = (x: number, y: number): Point => meshMap(mesh, x, y);
  return {
    index,
    staffId: staffId(st),
    kind: st.kind,
    kindConfidence: st.kindConfidence,
    lineCount: n,
    gray: flat.image,
    binary,
    noLines: removal.image,
    lineMask: removal.mask,
    space,
    lineThickness: stripGeom.thickness,
    lineYs,
    x0: pad,
    x1: width - pad,
    barlines: st.barlines.map((b) => ({ x: toStripX(b.x), x0: toStripX(b.x0), x1: toStripX(b.x1), type: b.type, confidence: b.confidence })),
    measures: st.measures.map((mm) => ({ index: mm.index, x0: toStripX(mm.x0), x1: toStripX(mm.x1) })),
    scale,
    sourceSpace,
    toPage,
    toPageBox: (x, y, w, h) => boxOfPoints([toPage(x, y), toPage(x + w, y), toPage(x, y + h), toPage(x + w, y + h)]),
    fromPage: (x, y) => meshUnmap(mesh, x, y),
    partnerIndex: st.partner ?? undefined,
    page: { gray: pre.source, width: pre.source.width, height: pre.source.height },
  };
}

/**
 * Put staff readings into the page skeleton: events go to their measures by position, clef / key /
 * time are attached to the staff, ids are completed, and notation and tab staves of one system
 * are linked event by event. `readings[i]` belongs to staff i of the layout (null = not read).
 */
export function assemblePage(analysis: PageAnalysis, readings: (StaffReading | null | undefined)[]): OmrPage {
  const { pre, layout } = analysis;
  const page: OmrPage = {
    ...analysis.page,
    systems: analysis.page.systems.map((s) => ({ ...s, texts: [], staves: s.staves.map((st) => ({ ...st, measures: st.measures.map((m) => ({ ...m, events: [] as OmrEvent[] })) })) })),
    texts: [],
    warnings: analysis.page.warnings.slice(),
  };
  layout.staves.forEach((st, i) => {
    const reading = readings[i];
    if (!reading) return;
    const staff = page.systems[st.systemIndex].staves[st.indexInSystem];
    staff.clef = reading.clef ?? staff.clef;
    staff.keySignature = reading.keySignature ?? staff.keySignature;
    staff.timeSignature = reading.timeSignature ?? staff.timeSignature;
    for (const t of reading.texts ?? []) page.systems[st.systemIndex].texts.push({ ...t, staffId: t.staffId ?? staff.id });
    for (const w of reading.warnings ?? []) page.warnings.push({ ...w, staffId: w.staffId ?? staff.id });
    const counters = new Map<number, number>();
    for (const ev of reading.events) {
      let mi = ev.measureIndex;
      if (mi === undefined || !staff.measures[mi]) {
        // Position along the staff in the normalised page decides the measure.
        const c = meshUnmap(pre.mesh, ev.x, ev.bbox.y + ev.bbox.h / 2);
        mi = st.measures.findIndex((m) => c.x >= m.x0 && c.x < m.x1);
        if (mi < 0) mi = c.x < st.x0 ? 0 : st.measures.length - 1;
      }
      const measure = staff.measures[mi];
      if (!measure) continue;
      const k = counters.get(mi) ?? 0;
      counters.set(mi, k + 1);
      const id = `${measure.id}.e${k}`;
      const withIds = { ...ev, id, notes: ev.notes.map((n, j) => ({ ...n, id: `${id}.n${j}` })) } as OmrEvent & { measureIndex?: number };
      delete withIds.measureIndex;
      measure.events.push(withIds);
    }
    for (const m of staff.measures) m.events.sort((a, b) => a.x - b.x);
    // A repeat sign straight after the clef and signatures closes a "measure" with no music in it.
    const head = staff.measures[0];
    const next = staff.measures[1];
    if (head && next && head.events.length === 0 && staff.barlines.find((b) => b.id === head.endBarlineId)?.type === 'repeat-begin') {
      staff.measures.shift();
      staff.measures.forEach((m, k) => { m.index = k; });
    }
  });
  // Link notation and tab staves of each system: pair events, compare the two readings.
  for (const sys of page.systems) {
    for (const staff of sys.staves) {
      if (staff.kind !== 'notation' || !staff.linkedStaffId) continue;
      const tab = sys.staves.find((s) => s.id === staff.linkedStaffId);
      if (!tab) continue;
      if (tab.measures.length !== staff.measures.length) {
        page.warnings.push({ code: 'measure-mismatch', message: 'The notation and tab staves of a system do not have the same number of measures.', staffId: staff.id });
      }
      linkSystem(staff, tab);
    }
  }
  return page;
}
