/**
 * Page layout: staves, their kind, systems, bar lines and measures of a normalised page.
 */
import type { BinaryImage } from '../image/gray';
import { type BarlineOptions, detectBarlines, measuresFromBarlines } from './barlines';
import { classifyStaff } from './classify';
import { type DetectStavesOptions, detectStaves } from './lines';
import type { BarlineGeom, PageLayout, StaffGeom, StaffLayout, SystemLayout } from './model';
import { removeStaffLines } from './removal';
import { contentBox, groupSystems } from './systems';

/** Options for {@link detectLayout}. */
export interface LayoutOptions extends DetectStavesOptions {
  /** Binarisation tuned for staff lines (see `binarizeFlat`); defaults to the page binary. */
  lineBinary?: BinaryImage;
  /** Binarisation tuned for upright strokes (see `binarizeStrokes`); bar lines are searched in it. Defaults to the page binary. */
  strokeBinary?: BinaryImage;
  /** Pixel noise of the page in grey levels (from preprocessing); makes some tests more lenient. */
  noise?: number;
}

/** A page layout together with the line-free page it was derived from. */
export interface LayoutResult extends PageLayout {
  /** The page with staff lines removed (symbols kept). */
  noLines: BinaryImage;
  /** The removed staff-line pixels. */
  lineMask: BinaryImage;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Analyse the layout of a binarised, normalised page. */
export function detectLayout(binary: BinaryImage, opts: LayoutOptions = {}): LayoutResult {
  let det = detectStaves(binary, opts);
  if (opts.lineBinary && opts.lineBinary !== binary) {
    // Noisy page: the line-smoothed binarisation usually sees more; keep whichever found more staff.
    const alt = detectStaves(opts.lineBinary, opts);
    const score = (staves: StaffGeom[]): number => staves.reduce((a, st) => a + st.confidence * (st.x1 - st.x0) * st.lineCount, 0);
    if (score(alt.staves) > score(det.staves) * 1.02) det = alt;
  }
  const geoms = det.staves;
  const five = geoms.filter((s) => s.lineCount === 5).map((s) => s.space);
  const pageSpace = five.length ? median(five) : median(geoms.map((s) => s.space));
  const lineThickness = median(geoms.map((s) => s.thickness));
  const removal = removeStaffLines(binary, geoms);
  const n = geoms.length;
  const classes = geoms.map((g) => classifyStaff(removal.image, g, pageSpace));
  const kinds = classes.map((c) => c.kind);

  const overlaps = (a: StaffGeom, b: StaffGeom): boolean => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.6 * Math.min(a.x1 - a.x0, b.x1 - b.x0);
  const neighbours = (i: number): BarlineOptions => ({
    above: i > 0 && overlaps(geoms[i - 1], geoms[i]) ? geoms[i - 1] : null,
    below: i + 1 < n && overlaps(geoms[i], geoms[i + 1]) ? geoms[i + 1] : null,
    pageSpace,
    noLines: removal.image,
    noise: opts.noise,
  });
  const tol = 0.7 * pageSpace;
  const matchAt = (list: BarlineGeom[], x: number): BarlineGeom | undefined => list.find((b) => Math.abs(b.x - x) <= tol);
  const strokes = opts.strokeBinary && opts.strokeBinary !== binary ? opts.strokeBinary : null;
  /** Bar lines of staff i: from the page binary, plus, on rough captures, those only the stroke-smoothed binary shows. */
  const findBars = (i: number, extra: BarlineOptions = {}): BarlineGeom[] => {
    const found = detectBarlines(binary, geoms[i], { ...neighbours(i), ...extra });
    if (strokes) {
      for (const b of detectBarlines(strokes, geoms[i], { ...neighbours(i), ...extra })) {
        if (matchAt(found, b.x)) continue;
        // Vertical smoothing also fuses the stacked letters of a TAB clef, a clef or a column of
        // fret digits into an upright blob: such blobs are fat, or sit where the clef is.
        const fat = b.strokes.some((st) => st.width >= 0.45 * pageSpace);
        const fromStart = b.x - geoms[i].x0;
        const inClef = fromStart > 0.6 * geoms[i].space && fromStart < 2.5 * geoms[i].space;
        if (fat || inClef) continue;
        found.push({ ...b, confidence: b.confidence * 0.85 });
      }
      found.sort((a, b) => a.x - b.x);
    }
    return found;
  };
  const bars: BarlineGeom[][] = geoms.map((_, i) => findBars(i));
  // A bar line that runs through two staves shows up as "system wide" in both at the same x.
  const through: boolean[] = [];
  for (let i = 0; i + 1 < n; i++) {
    through.push(bars[i].some((b) => b.joinsBelow && !!matchAt(bars[i + 1].filter((o) => o.joinsAbove), b.x)));
  }
  const groups = groupSystems(binary, geoms, kinds, pageSpace, through);

  // Staves of one system share their bar lines: confirm weak ones, drop unconfirmed doubtful ones.
  for (const g of groups) {
    if (g.staves.length < 2) continue;
    const relaxed = new Map<number, BarlineGeom[]>();
    const relaxedBars = (i: number): BarlineGeom[] => {
      let r = relaxed.get(i);
      if (!r) {
        r = findBars(i, { minFill: 0.78 });
        relaxed.set(i, r);
      }
      return r;
    };
    for (const i of g.staves) {
      const others = g.staves.filter((j) => j !== i);
      const keep: BarlineGeom[] = [];
      for (const b of bars[i]) {
        let confirmed = 0;
        for (const j of others) {
          if (matchAt(bars[j], b.x)) confirmed++;
          else {
            const r = matchAt(relaxedBars(j), b.x);
            if (r) {
              bars[j].push({ ...r, confidence: r.confidence * 0.8 });
              confirmed++;
            }
          }
        }
        if (confirmed === others.length) keep.push({ ...b, confidence: Math.min(1, b.confidence + 0.15) });
        else if (b.confidence >= 0.8) keep.push({ ...b, confidence: b.confidence * 0.6 });
      }
      bars[i] = keep;
    }
    for (const i of g.staves) bars[i].sort((a, b) => a.x - b.x);
  }

  const staves: StaffLayout[] = [];
  const systems: SystemLayout[] = [];
  groups.forEach((g, sIndex) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    g.staves.forEach((i, k) => {
      const geom = geoms[i];
      const cls = classes[i];
      const box = contentBox(binary, geom, i > 0 ? geoms[i - 1] : null, i + 1 < n ? geoms[i + 1] : null);
      // Partner: the staff of the other kind in the same system (notation <-> tab).
      let partner: number | null = null;
      for (const j of g.staves) if (j !== i && kinds[j] !== kinds[i] && (partner === null || Math.abs(j - i) < Math.abs(partner - i))) partner = j;
      staves[i] = {
        ...geom,
        index: i,
        kind: cls.kind,
        kindConfidence: cls.confidence,
        evidence: cls.evidence,
        systemIndex: sIndex,
        indexInSystem: k,
        partner,
        barlines: bars[i],
        measures: measuresFromBarlines(geom, bars[i]),
        contentBox: box,
        tabClef: cls.tabClef,
      };
      x0 = Math.min(x0, box.x);
      y0 = Math.min(y0, box.y);
      x1 = Math.max(x1, box.x + box.w);
      y1 = Math.max(y1, box.y + box.h);
    });
    systems.push({ index: sIndex, staves: g.staves.slice(), bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, connected: g.connected });
  });
  return {
    width: binary.width,
    height: binary.height,
    staffSpace: pageSpace,
    lineThickness,
    staves,
    systems,
    noLines: removal.image,
    lineMask: removal.mask,
  };
}
