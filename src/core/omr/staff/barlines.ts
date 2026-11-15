/**
 * Bar-line detection for one staff of the normalised page.
 *
 * A bar line is a vertical stroke that spans the staff from its top line to its bottom line and
 * stops there (unless it runs on into the next staff of the system), with nothing attached to it.
 * Stems are told apart because they either do not span the whole staff, stick out of it, or carry
 * a note head. A slight slant left over from the perspective correction is tolerated by searching
 * a small range of shears. Neighbouring strokes are grouped into double, final and repeat bars.
 */
import type { BinaryImage } from '../image/gray';
import type { BarlineType } from '../types';
import { type BarlineGeom, type MeasureGeom, type StaffGeom, lineYAt } from './model';

/** Options for {@link detectBarlines}. */
export interface BarlineOptions {
  /** Staff of the same system directly above / below, to accept strokes that run through. */
  above?: StaffGeom | null;
  below?: StaffGeom | null;
  /** Typical notation staff space of the page (stroke widths are judged against it). Default: the staff's own space. */
  pageSpace?: number;
  /** Lowest span fill accepted (default 0.9). Used with a lower value to confirm a bar seen in a partner staff. */
  minFill?: number;
  /** The page without staff lines; used to judge what touches a stroke and to find repeat dots. Default: `bin`. */
  noLines?: BinaryImage;
  /** Pixel noise of the page (grey levels, from preprocessing). Ragged strokes on noisy pages get more slack. Default 0. */
  noise?: number;
  /** Receives one line per candidate stroke group with the measurements that decided it (debugging). */
  trace?: (message: string) => void;
}

interface Stroke {
  /** Centre x at the middle of the staff. */
  x: number;
  width: number;
  shear: number;
  fill: number;
  extUp: number;
  extDown: number;
  up: boolean;
  down: boolean;
}

/** Find the bar lines of a staff. */
export function detectBarlines(bin: BinaryImage, staff: StaffGeom, opts: BarlineOptions = {}): BarlineGeom[] {
  const { width: w, height: h, data } = bin;
  const sp = staff.space;
  const S = opts.pageSpace ?? sp;
  const minFill = opts.minFill ?? 0.9;
  const xa = Math.max(0, Math.floor(staff.x0 - 0.6 * sp));
  const xb = Math.min(w - 1, Math.ceil(staff.x1 + 0.6 * sp));
  const n = xb - xa + 1;
  if (n < 3) return [];
  // Top and bottom line per column.
  const top = new Float32Array(n);
  const bot = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    top[i] = lineYAt(staff, 0, xa + i + 0.5);
    bot[i] = lineYAt(staff, staff.lineCount - 1, xa + i + 0.5);
  }
  const ink = (x: number, y: number): number => (x >= 0 && x < w && y >= 0 && y < h ? data[y * w + x] : 0);
  /** Fraction of the rows between the outer lines that are ink along a sheared column through (x, centre). */
  const spanFill = (x: number, shear: number): number => {
    const i = Math.max(0, Math.min(n - 1, x - xa));
    const y0 = Math.round(top[i] - 0.5);
    const y1 = Math.round(bot[i] - 0.5);
    const yc = (y0 + y1) / 2;
    let hit = 0;
    for (let y = y0; y <= y1; y++) hit += ink(Math.round(x + shear * (y - yc)), y);
    return hit / (y1 - y0 + 1);
  };
  // Straight projection first; anything half filled is worth a closer look.
  const straight = new Float32Array(n);
  for (let i = 0; i < n; i++) straight[i] = spanFill(xa + i, 0);
  const strokes: Stroke[] = [];
  const shears: number[] = [];
  for (let k = -6; k <= 6; k++) shears.push(k * 0.01);
  let i = 0;
  while (i < n) {
    if (straight[i] < 0.35) { i++; continue; }
    let j = i;
    while (j + 1 < n && straight[j + 1] >= 0.35) j++;
    // Best shear for this cluster.
    let best = 0;
    let bestShear = 0;
    for (const sh of shears) {
      for (let x = xa + i - 1; x <= xa + j + 1; x++) {
        const f = spanFill(x, sh);
        if (f > best + 1e-6 || (Math.abs(f - best) <= 1e-6 && Math.abs(sh) < Math.abs(bestShear))) {
          best = f;
          bestShear = sh;
        }
      }
    }
    if (best < minFill && best >= 0.6) opts.trace?.(`cluster x=${xa + i}..${xa + j} best fill ${best.toFixed(2)} at shear ${bestShear} rejected: does not span the staff`);
    if (best >= minFill) {
      // Split the cluster into strokes: maximal column ranges that are filled at the best shear.
      let x = xa + i - 2;
      const end = xa + j + 2;
      while (x <= end) {
        if (spanFill(x, bestShear) < minFill - 0.04) { x++; continue; }
        const s0 = x;
        let peak = 0;
        while (x <= end && spanFill(x, bestShear) >= minFill - 0.04) {
          peak = Math.max(peak, spanFill(x, bestShear));
          x++;
        }
        const s1 = x - 1;
        if (peak >= minFill) strokes.push({ x: (s0 + s1 + 1) / 2, width: s1 - s0 + 1, shear: bestShear, fill: peak, extUp: 0, extDown: 0, up: false, down: false });
      }
    }
    i = j + 1;
  }
  if (!strokes.length) return [];

  // How far each stroke continues beyond the staff.
  const gapAbove = opts.above ? (x: number): number => lineYAt(staff, 0, x) - lineYAt(opts.above as StaffGeom, (opts.above as StaffGeom).lineCount - 1, x) : null;
  const gapBelow = opts.below ? (x: number): number => lineYAt(opts.below as StaffGeom, 0, x) - lineYAt(staff, staff.lineCount - 1, x) : null;
  const extension = (st: Stroke, dir: 1 | -1, limit: number): number => {
    const idx = Math.max(0, Math.min(n - 1, Math.round(st.x - 0.5) - xa));
    const y0 = Math.round(top[idx] - 0.5);
    const y1 = Math.round(bot[idx] - 0.5);
    const yc = (y0 + y1) / 2;
    const half = Math.max(1, Math.ceil(st.width / 2));
    let ext = 0;
    let miss = 0;
    for (let d = 1; d <= limit; d++) {
      const y = dir === 1 ? y1 + d : y0 - d;
      const xc = Math.round(st.x - 0.5 + st.shear * (y - yc));
      let any = 0;
      for (let dx = -half; dx <= half && !any; dx++) any = ink(xc + dx, y);
      if (any) {
        ext = d;
        miss = 0;
      } else if (++miss > 2) {
        break;
      }
    }
    return ext;
  };
  for (const st of strokes) {
    const up = gapAbove ? gapAbove(st.x) : 0;
    const down = gapBelow ? gapBelow(st.x) : 0;
    st.extUp = extension(st, -1, Math.round(Math.max(3 * sp, up + sp)));
    st.extDown = extension(st, 1, Math.round(Math.max(3 * sp, down + sp)));
    st.up = gapAbove !== null && up > 0 && st.extUp >= up - 0.25 * sp;
    st.down = gapBelow !== null && down > 0 && st.extDown >= down - 0.25 * sp;
  }
  const tolExt = 0.45 * sp;
  const good = strokes.filter((st) => (st.extUp <= tolExt || st.up) && (st.extDown <= tolExt || st.down));
  if (opts.trace) for (const st of strokes) if (!good.includes(st)) opts.trace(`stroke x=${st.x.toFixed(1)} w ${st.width} fill ${st.fill.toFixed(2)} rejected: sticks out ${st.extUp}^ ${st.extDown}v`);
  if (!good.length) return [];

  const nl = (opts.noLines ?? bin).data;
  const sym = (x: number, y: number): number => (x >= 0 && x < w && y >= 0 && y < h ? nl[y * w + x] : 0);
  const lineRows = (x: number): number[] => {
    const rows: number[] = [];
    for (let l = 0; l < staff.lineCount; l++) rows.push(lineYAt(staff, l, x));
    return rows;
  };
  /** True when pixel (x, y) belongs to another full-height stroke (the partner of a double or final bar). */
  const otherStroke = (self: Stroke, x: number, y: number, yc: number): boolean => {
    for (const o of good) {
      if (o === self) continue;
      const c = o.x + o.shear * (y - yc);
      if (Math.abs(x + 0.5 - c) <= o.width / 2 + 1) return true;
    }
    return false;
  };
  /** Rows in the middle of each staff space at column x (and, when asked, of the half space just outside the staff). */
  const bandRows = (x: number, outside: boolean): number[] => {
    const rows = lineRows(x);
    const n2 = rows.length;
    const out2: number[] = [];
    const add = (ya: number, yb: number): void => {
      for (let y = Math.ceil(ya - 0.5); y <= Math.floor(yb - 0.5); y++) out2.push(y);
    };
    const gap = (rows[n2 - 1] - rows[0]) / (n2 - 1);
    if (outside) add(rows[0] - 0.55 * gap, rows[0] - 0.27 * gap);
    for (let l = 0; l + 1 < n2; l++) add(rows[l] + 0.27 * (rows[l + 1] - rows[l]), rows[l] + 0.73 * (rows[l + 1] - rows[l]));
    if (outside) add(rows[n2 - 1] + 0.27 * gap, rows[n2 - 1] + 0.55 * gap);
    return out2;
  };
  /** The horizontal ink run through the stroke at row y: [first, last] pixel, or null when the stroke is not there. */
  const runAt = (st: Stroke, y: number, yc: number): [number, number] | null => {
    const c = Math.round(st.x + st.shear * (y - yc) - 0.5);
    let x = -1;
    for (const d of [0, -1, 1, -2, 2]) {
      if (ink(c + d, y)) {
        x = c + d;
        break;
      }
    }
    if (x < 0) return null;
    let a2 = x;
    let b2 = x;
    while (ink(a2 - 1, y)) a2--;
    while (ink(b2 + 1, y)) b2++;
    return [a2, b2];
  };
  /**
   * Re-measure a stroke on the rows between the staff lines: its width is the median width of the
   * horizontal runs through it, and its position and slant come from a line fitted to the run
   * centres. Column statistics alone get both wrong for a slanted stroke.
   */
  const refine = (st: Stroke): void => {
    const rows = lineRows(st.x);
    const yc = (rows[0] + rows[rows.length - 1]) / 2 - 0.5;
    const ys: number[] = [];
    const cs: number[] = [];
    const ws: number[] = [];
    for (const y of bandRows(st.x, false)) {
      const r = runAt(st, y, yc);
      if (!r) continue;
      ys.push(y);
      cs.push((r[0] + r[1] + 1) / 2);
      ws.push(r[1] - r[0] + 1);
    }
    if (ws.length < 6) return;
    const sorted = ws.slice().sort((p2, q) => p2 - q);
    const width = sorted[sorted.length >> 1];
    let n3 = 0, sy = 0, sc = 0, syy = 0, syc = 0;
    for (let i = 0; i < ys.length; i++) {
      if (ws[i] > width + 1) continue;
      const dy = ys[i] - yc;
      n3++;
      sy += dy;
      sc += cs[i];
      syy += dy * dy;
      syc += dy * cs[i];
    }
    const den = n3 * syy - sy * sy;
    if (n3 >= 6 && Math.abs(den) > 1e-6) {
      const sh = (n3 * syc - sy * sc) / den;
      if (Math.abs(sh) <= 0.12) {
        st.shear = sh;
        st.x = (sc - sh * sy) / n3;
      }
    }
    st.width = width;
  };
  /**
   * Is something hanging on a stroke (then it is a stem, not a bar line)? Only the rows in the
   * middle of each staff space are looked at (and the half space just outside the staff), so thick,
   * ragged or badly removed staff lines cannot disturb the test. Per side it counts
   *   touch: rows where the ink run through the stroke sticks out on this side but not on the other
   *          (a tie crossing a bar line sticks out on both sides in the same rows and is ignored), and
   *   wide:  rows with any ink within 1.3 staff spaces (a hollow head leaves white next to the stem
   *          for half of its height, but its far wall is always there).
   * A note head or flag gives several touch rows and about half a space or more of wide rows.
   * Repeat dots and the accidental of the next note do not touch the stroke.
   */
  const hanging = (st: Stroke): { touchL: number; touchR: number; wideL: number; wideR: number } => {
    const rows = lineRows(st.x);
    const yc = (rows[0] + rows[rows.length - 1]) / 2 - 0.5;
    const zone = Math.max(6, Math.round(1.3 * S));
    const res = { touchL: 0, touchR: 0, wideL: 0, wideR: 0 };
    const excess = Math.max(1.5, 0.1 * S);
    let prevY = -10;
    let prevL = false;
    let prevR = false;
    for (const y of bandRows(st.x, true)) {
      const c = st.x + st.shear * (y - yc);
      const left = c - st.width / 2;
      const right = c + st.width / 2;
      const r = runAt(st, y, yc);
      // Outside the staff the stroke is absent; ink that starts where it would be counts as touching.
      const a2 = r ? r[0] : Math.round(left);
      const b2 = r ? r[1] + 1 : Math.round(right);
      let l = false;
      let rr = false;
      if (r) {
        l = left - a2 >= excess;
        rr = b2 - right >= excess;
      } else {
        l = !!ink(Math.round(left) - 1, y) && !!ink(Math.round(left) - 2, y);
        rr = !!ink(Math.round(right), y) && !!ink(Math.round(right) + 1, y);
      }
      let wl = l;
      let wr = rr;
      for (let k = 1; k < zone && !(wl && wr); k++) {
        const xl = Math.round(left - k - 0.5);
        const xr = Math.round(right + k - 0.5);
        if (!wl && ink(xl, y) && !otherStroke(st, xl, y, yc)) wl = true;
        if (!wr && ink(xr, y) && !otherStroke(st, xr, y, yc)) wr = true;
      }
      // A run that reaches the partner stroke of a double bar is not an attachment.
      if (l && otherStroke(st, a2, y, yc)) l = false;
      if (rr && otherStroke(st, b2 - 1, y, yc)) rr = false;
      if (wl) res.wideL++;
      if (wr) res.wideR++;
      const adjacent = y === prevY + 1;
      if (l && !rr && !(adjacent && prevR)) res.touchL++;
      if (rr && !l && !(adjacent && prevL)) res.touchR++;
      prevL = l;
      prevR = rr;
      prevY = y;
    }
    return res;
  };
  /** Two repeat dots beside a stroke: compact blobs in the spaces around the staff's middle. */
  const hasDots = (st: Stroke, side: 1 | -1): boolean => {
    const rows = lineRows(st.x);
    const y0 = Math.round(rows[0] - 0.5);
    const y1 = Math.round(rows[rows.length - 1] - 0.5);
    const mid = (rows[0] + rows[rows.length - 1]) / 2;
    const xNear = st.x + side * (st.width / 2 + 0.15 * S);
    const xFar = st.x + side * (st.width / 2 + 1.0 * S);
    const xl = Math.round(Math.min(xNear, xFar));
    const xr = Math.round(Math.max(xNear, xFar));
    // Row profile of the symbol ink (staff lines already removed) in the window.
    const blobs: { a: number; b: number; mass: number; w0: number; w1: number }[] = [];
    let cur: { a: number; b: number; mass: number; w0: number; w1: number } | null = null;
    for (let y = y0; y <= y1; y++) {
      let c = 0;
      let lo = xr;
      let hi = xl;
      for (let x = xl; x <= xr; x++) {
        if (sym(x, y)) {
          c++;
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
      }
      if (c > 0) {
        if (!cur) cur = { a: y, b: y, mass: 0, w0: lo, w1: hi };
        cur.b = y;
        cur.mass += c;
        cur.w0 = Math.min(cur.w0, lo);
        cur.w1 = Math.max(cur.w1, hi);
      } else if (cur) {
        blobs.push(cur);
        cur = null;
      }
    }
    if (cur) blobs.push(cur);
    const dots = blobs.filter((b) => {
      const bh = b.b - b.a + 1;
      const bw = b.w1 - b.w0 + 1;
      return bh >= 0.15 * S && bh <= 0.75 * S && bw >= 0.15 * S && bw <= 0.75 * S && b.mass >= 0.45 * bh * bw;
    });
    if (dots.length !== 2 || blobs.length !== 2) return false;
    const c0 = (dots[0].a + dots[0].b + 1) / 2;
    const c1 = (dots[1].a + dots[1].b + 1) / 2;
    return Math.abs((c0 + c1) / 2 - mid) <= 0.5 * sp && c1 - c0 >= 0.6 * sp && c1 - c0 <= 2.6 * sp;
  };

  // Stems carry a note head, a flag or a beam; bar lines carry nothing. A stroke at the very start
  // or end of the staff is the system bar line: clefs, brackets and braces sit right next to it,
  // so nothing is asked of its surroundings there.
  for (const st of good) refine(st);
  const noise = opts.noise ?? 0;
  const minTouch = noise < 3 ? 2 : noise < 6 ? 3 : 4;
  good.sort((a, b) => a.x - b.x);
  const bars: Stroke[] = [];
  for (const st of good) {
    const atStart = st.x - staff.x0 < 1.0 * sp;
    const atEnd = staff.x1 - st.x < 1.0 * sp;
    if (atStart) {
      bars.push(st);
      continue;
    }
    const hg = hanging(st);
    const stemL = hg.touchL >= minTouch && hg.wideL >= 0.4 * S;
    const stemR = !atEnd && hg.touchR >= minTouch && hg.wideR >= 0.4 * S;
    // A lone fat stroke inside the staff is the upright of a time-signature digit or a letter:
    // bar lines are about as thin as staff lines, and thick ones only come paired with a thin one.
    const fat = st.width >= 0.45 * S || (st.width > 2 * staff.thickness + 1 && st.width >= 0.33 * S);
    const lonely = !good.some((o) => o !== st && Math.abs(o.x - st.x) <= 0.8 * S);
    const ok = !stemL && !stemR && !(fat && lonely && !atEnd);
    opts.trace?.(`stroke x=${st.x.toFixed(1)} w ${st.width} fill ${st.fill.toFixed(2)} ext ${st.extUp}^${st.extDown}v hanging ${hg.wideL}(${hg.touchL})/${hg.wideR}(${hg.touchR}) -> ${ok ? 'bar' : 'stem'}`);
    if (ok) bars.push(st);
  }

  // Group neighbouring strokes into double / final / repeat bars.
  const groups: Stroke[][] = [];
  for (const st of bars) {
    const g = groups[groups.length - 1];
    if (g && st.x - g[g.length - 1].x <= 0.8 * S) g.push(st);
    else groups.push([st]);
  }
  const out: BarlineGeom[] = [];
  for (const g of groups) {
    const first = g[0];
    const last = g[g.length - 1];
    const thin = Math.min(...g.map((s) => s.width));
    const isThick = (s: Stroke): boolean => s.width >= 0.22 * S && s.width >= 1.5 * thin && s.width >= thin + 2;
    // Repeat signs are always a thick + thin pair with two dots; without the pair, blobs beside a
    // bar line are notes or fret digits.
    const pair = g.length >= 2 && g.some(isThick);
    const dotsL = pair && hasDots(first, -1);
    const dotsR = pair && hasDots(last, 1);
    let type: BarlineType = 'single';
    if (dotsL && dotsR) type = 'repeat-both';
    else if (dotsR) type = 'repeat-begin';
    else if (dotsL) type = 'repeat-end';
    else if (g.length === 1) {
      // Low-resolution sources can fuse the strokes of a double or final bar into one wide stroke.
      const rel = first.width / S;
      type = rel >= 0.5 ? 'end' : rel >= 0.34 ? 'double' : 'single';
    }
    else if (isThick(last) && !isThick(first)) type = 'end';
    else if (isThick(first) && !isThick(last)) type = 'repeat-begin';
    else type = 'double';
    const x0 = first.x - first.width / 2;
    const x1 = last.x + last.width / 2;
    const xm = (x0 + x1) / 2;
    const fill = Math.min(...g.map((s) => s.fill));
    const up = g.some((s) => s.up);
    const down = g.some((s) => s.down);
    const conf = Math.max(0, Math.min(1, 0.4 + 0.6 * ((fill - (minFill - 0.05)) / (1.05 - minFill))));
    out.push({
      x: xm,
      x0,
      x1,
      type,
      strokes: g.map((s) => ({ x: s.x, width: s.width })),
      yTop: lineYAt(staff, 0, xm),
      yBottom: lineYAt(staff, staff.lineCount - 1, xm),
      systemWide: up || down,
      joinsAbove: up,
      joinsBelow: down,
      confidence: conf,
    });
  }
  return out;
}

/** Split a staff into measures at its bar lines. An open end (no bar line) still closes a measure. */
export function measuresFromBarlines(staff: StaffGeom, barlines: BarlineGeom[]): MeasureGeom[] {
  const sp = staff.space;
  const cuts: number[] = [];
  const sorted = barlines.slice().sort((a, b) => a.x - b.x);
  if (!sorted.length || sorted[0].x - staff.x0 > 1.5 * sp) cuts.push(staff.x0);
  for (const b of sorted) cuts.push(b.x);
  if (!sorted.length || staff.x1 - sorted[sorted.length - 1].x > 1.5 * sp) cuts.push(staff.x1);
  const out: MeasureGeom[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) out.push({ index: i, x0: cuts[i], x1: cuts[i + 1] });
  return out;
}
