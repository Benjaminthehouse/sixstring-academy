/**
 * Run-length utilities on binary images. A "run" is a maximal stretch of ink along a column
 * (vertical run) or a row (horizontal run). Staff lines, stems and bar lines are all found from
 * run statistics, so these are the hot loops of the layout analysis; they scan the image
 * row-major (cache friendly) and keep per-column state in small typed arrays.
 */
import type { BinaryImage } from './gray';

/** Histograms of vertical run lengths; index = length in px (longer runs are clamped to the last bin). */
export interface RunHistograms {
  /** Ink runs. Their mode is the staff-line thickness. */
  black: Uint32Array;
  /** Paper runs bounded by ink on both sides. Their mode is the gap between two staff lines. */
  white: Uint32Array;
  /** Ink run + the paper run below it. Its mode is the staff space (line pitch). */
  pair: Uint32Array;
}

/** Vertical run-length histograms of a binary image (optionally only every `step`-th column). */
export function verticalRunHistograms(bin: BinaryImage, maxLen = 256, step = 1): RunHistograms {
  const { width: w, height: h, data } = bin;
  const black = new Uint32Array(maxLen + 1);
  const white = new Uint32Array(maxLen + 1);
  const pair = new Uint32Array(maxLen + 1);
  const run = new Int32Array(w); // current run length per column
  const ink = new Uint8Array(w); // colour of the current run
  const prevBlack = new Int32Array(w); // ink run that precedes the current paper run (0 = none)
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x += step) {
      const v = data[o + x];
      if (v === ink[x]) {
        run[x]++;
        continue;
      }
      const len = run[x];
      if (ink[x]) {
        black[len > maxLen ? maxLen : len]++;
        prevBlack[x] = len;
      } else if (prevBlack[x] > 0) {
        // A paper run closed by ink below and above.
        white[len > maxLen ? maxLen : len]++;
        const p = len + prevBlack[x];
        pair[p > maxLen ? maxLen : p]++;
      }
      ink[x] = v;
      run[x] = 1;
    }
  }
  for (let x = 0; x < w; x += step) {
    if (ink[x]) black[run[x] > maxLen ? maxLen : run[x]]++;
  }
  return { black, white, pair };
}

/** Ink runs grouped by line (column for vertical runs, row for horizontal runs), in increasing position. */
export interface RunTable {
  /** Runs of line i are entries start[i] .. start[i + 1] - 1. Length = lines + 1. */
  start: Int32Array;
  /** First pixel of each run along the line. */
  pos: Int32Array;
  /** Length of each run. */
  len: Int32Array;
}

/**
 * All vertical ink runs, grouped by column. `maxLen` drops longer runs (pass the "thin" limit to
 * collect only staff-line candidates and keep the table small).
 */
export function verticalRuns(bin: BinaryImage, maxLen = Infinity): RunTable {
  const { width: w, height: h, data } = bin;
  const run = new Int32Array(w);
  let cap = 1 << 16;
  let xs = new Int32Array(cap);
  let ys = new Int32Array(cap);
  let ls = new Int32Array(cap);
  let n = 0;
  const counts = new Int32Array(w + 1);
  const push = (x: number, y0: number, len: number): void => {
    if (n === cap) {
      cap *= 2;
      const nx = new Int32Array(cap); nx.set(xs); xs = nx;
      const ny = new Int32Array(cap); ny.set(ys); ys = ny;
      const nl = new Int32Array(cap); nl.set(ls); ls = nl;
    }
    xs[n] = x;
    ys[n] = y0;
    ls[n] = len;
    n++;
    counts[x + 1]++;
  };
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      if (data[o + x]) {
        run[x]++;
      } else if (run[x]) {
        if (run[x] <= maxLen) push(x, y - run[x], run[x]);
        run[x] = 0;
      }
    }
  }
  for (let x = 0; x < w; x++) if (run[x] && run[x] <= maxLen) push(x, h - run[x], run[x]);
  // Counting sort by column; emission order is already increasing in y within a column.
  for (let x = 0; x < w; x++) counts[x + 1] += counts[x];
  const start = counts.slice();
  const fill = counts.slice(0, w);
  const pos = new Int32Array(n);
  const len = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = fill[xs[i]]++;
    pos[k] = ys[i];
    len[k] = ls[i];
  }
  return { start, pos, len };
}

/** All horizontal ink runs, grouped by row. */
export function horizontalRuns(bin: BinaryImage, maxLen = Infinity): RunTable {
  const { width: w, height: h, data } = bin;
  const start = new Int32Array(h + 1);
  let cap = 1 << 16;
  let pos = new Int32Array(cap);
  let len = new Int32Array(cap);
  let n = 0;
  for (let y = 0; y < h; y++) {
    start[y] = n;
    const o = y * w;
    let x = 0;
    while (x < w) {
      if (!data[o + x]) { x++; continue; }
      const x0 = x;
      while (x < w && data[o + x]) x++;
      if (x - x0 <= maxLen) {
        if (n === cap) {
          cap *= 2;
          const np = new Int32Array(cap); np.set(pos); pos = np;
          const nl = new Int32Array(cap); nl.set(len); len = nl;
        }
        pos[n] = x0;
        len[n] = x - x0;
        n++;
      }
    }
  }
  start[h] = n;
  return { start, pos: pos.subarray(0, n), len: len.subarray(0, n) };
}

/** Index of the highest bin in [lo, hi] of a histogram (ties go to the lower index). */
export function histogramMode(hist: ArrayLike<number>, lo = 1, hi = hist.length - 1): number {
  let best = lo;
  for (let i = lo; i <= hi && i < hist.length; i++) if (hist[i] > hist[best]) best = i;
  return best;
}

/** Sub-bin position of a histogram peak: centroid of the bins around `index`. */
export function refinePeak(hist: ArrayLike<number>, index: number, radius = 1): number {
  let s = 0;
  let m = 0;
  for (let i = Math.max(0, index - radius); i <= Math.min(hist.length - 1, index + radius); i++) {
    s += hist[i] * i;
    m += hist[i];
  }
  return m > 0 ? s / m : index;
}

/** Ink count per row (horizontal projection) inside the column range [x0, x1). */
export function rowProjection(bin: BinaryImage, x0 = 0, x1 = bin.width): Int32Array {
  const { width: w, height: h, data } = bin;
  const out = new Int32Array(h);
  const a = Math.max(0, x0);
  const b = Math.min(w, x1);
  for (let y = 0; y < h; y++) {
    let s = 0;
    const o = y * w;
    for (let x = a; x < b; x++) s += data[o + x];
    out[y] = s;
  }
  return out;
}

/** Ink count per column (vertical projection) inside the row range [y0, y1). */
export function columnProjection(bin: BinaryImage, y0 = 0, y1 = bin.height): Int32Array {
  const { width: w, height: h, data } = bin;
  const out = new Int32Array(w);
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) out[x] += data[o + x];
  }
  return out;
}
