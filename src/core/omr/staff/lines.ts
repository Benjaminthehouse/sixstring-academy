/**
 * Staff-line detection.
 *
 * 1. Scale: line thickness and staff space from the run-length statistics (scale.ts).
 * 2. Dots: the page is cut into narrow vertical slices (half a staff space wide). In each slice
 *    the centres of the thin vertical ink runs are projected onto the y axis; every tight cluster
 *    is a "dot": a short piece of some thin horizontal stroke, with a sub-pixel y.
 * 3. Chains: dots are linked from slice to slice into line traces. A chain follows slope and
 *    curvature, and survives gaps where a note head, a clef or a blanked tab digit hides the line.
 * 4. Combs: chains whose mutual distance repeats four to six times are staff candidates. A missing
 *    inner line is allowed if the image confirms it; candidates are extended while the image shows
 *    one more line at the same pitch, and weak outer members (rows of ledger lines) are trimmed.
 * 5. Tracking: every line of an accepted staff is re-measured directly on the image at each slice,
 *    holes are filled from the other lines of the same staff, and the staff is followed to its
 *    true left and right ends.
 *
 * The same code runs on the raw capture (rotated, curved, any resolution) to drive the dewarp, and
 * on the normalised page for the final geometry.
 */
import type { BinaryImage } from '../image/gray';
import { type RunTable, verticalRuns } from '../image/runs';
import type { StaffGeom } from './model';
import { type StaffScale, estimateStaffScale } from './scale';

/** Options for {@link detectStaves}. */
export interface DetectStavesOptions {
  /** Known staff space / line thickness in px (skips the estimation). */
  staffSpace?: number;
  lineThickness?: number;
  /** Steepest line slope followed (dy/dx). Default 0.15 (about 8.5 degrees). */
  maxSlope?: number;
  /** Shortest staff accepted, in staff spaces. Default 5. */
  minLength?: number;
  /** Accept four-line staves (bass / ukulele tab). Default true. */
  allowFourLines?: boolean;
}

/** One traced line candidate (kept for debugging and for the dewarp). */
export interface LineTrace {
  /** Slice indices with evidence, increasing. */
  slices: Int32Array;
  /** y at the centre of each of those slices. */
  ys: Float32Array;
  /** Mean thickness of the runs that formed the trace. */
  thickness: number;
}

/** Result of {@link detectStaves}. */
export interface StaffDetection {
  staves: StaffGeom[];
  scale: StaffScale;
  /** Slice width used, px. */
  slice: number;
  /** All line traces that were long enough to be considered. */
  traces: LineTrace[];
}

interface Chain {
  slices: number[];
  ys: number[];
  thick: number;
  slope: number;
  pred: number;
}

interface Line {
  slices: Int32Array;
  ys: Float32Array;
  first: number;
  last: number;
  coverage: number;
  thickness: number;
  /** Slope (px per slice) at the two ends, for extrapolation. */
  slopeHead: number;
  slopeTail: number;
}

function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function endSlope(slices: ArrayLike<number>, ys: ArrayLike<number>, from: number, to: number): number {
  // Least-squares slope over the dots [from, to).
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = from; i < to; i++) {
    n++;
    sx += slices[i];
    sy += ys[i];
    sxx += slices[i] * slices[i];
    sxy += slices[i] * ys[i];
  }
  const den = n * sxx - sx * sx;
  return n >= 2 && Math.abs(den) > 1e-9 ? (n * sxy - sx * sy) / den : 0;
}

function makeLine(slices: number[], ys: number[], thick: number): Line {
  const n = slices.length;
  const k = Math.min(n, 10);
  return {
    slices: Int32Array.from(slices),
    ys: Float32Array.from(ys),
    first: slices[0],
    last: slices[n - 1],
    coverage: n / (slices[n - 1] - slices[0] + 1),
    thickness: thick,
    slopeHead: endSlope(slices, ys, 0, k),
    slopeTail: endSlope(slices, ys, n - k, n),
  };
}

/** y of a line at a (fractional) slice index; linear extrapolation beyond its ends. */
function lineAt(line: Line, slice: number): number {
  const { slices, ys } = line;
  const n = slices.length;
  if (slice <= slices[0]) return ys[0] + (slice - slices[0]) * line.slopeHead;
  if (slice >= slices[n - 1]) return ys[n - 1] + (slice - slices[n - 1]) * line.slopeTail;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (slices[mid] <= slice) lo = mid; else hi = mid;
  }
  const t = (slice - slices[lo]) / (slices[hi] - slices[lo]);
  return ys[lo] + (ys[hi] - ys[lo]) * t;
}

/** Thin-run centre nearest to `y` in column `x`, or NaN when none is within `tol`. */
function nearestRun(runs: RunTable, x: number, y: number, tol: number): number {
  let lo = runs.start[x];
  let hi = runs.start[x + 1] - 1;
  if (hi < lo) return NaN;
  // Binary search for the last run starting at or above y.
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (runs.pos[mid] <= y) lo = mid; else hi = mid - 1;
  }
  let best = NaN;
  let bestD = tol;
  for (let i = Math.max(runs.start[x], lo - 1); i <= Math.min(runs.start[x + 1] - 1, lo + 1); i++) {
    const c = runs.pos[i] + runs.len[i] / 2;
    const d = Math.abs(c - y);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Detect the staves of a binary page. */
export function detectStaves(bin: BinaryImage, opts: DetectStavesOptions = {}): StaffDetection {
  const { width: w, height: h, data } = bin;
  const scale: StaffScale = opts.staffSpace
    ? { staffSpace: opts.staffSpace, lineThickness: opts.lineThickness ?? Math.max(1, opts.staffSpace * 0.12), secondSpace: 0, confidence: 1 }
    : estimateStaffScale(bin);
  const empty: StaffDetection = { staves: [], scale, slice: 0, traces: [] };
  const s = scale.staffSpace;
  if (!(s >= 4)) return empty;
  const t = Math.max(1, scale.lineThickness);
  const maxSlope = opts.maxSlope ?? 0.15;
  // "Thin" = at most a generous staff-line thickness, but always under a beam. A beam is half a
  // space thick on paper; blur fattens it by as much as it fattens the lines (t - ~0.12 s).
  const thinMax = Math.max(2, Math.min(Math.ceil(t * 1.4 + 1), Math.floor(t + 0.28 * s)));
  const B = Math.max(4, Math.min(16, Math.round(s / 2)));
  const nSlices = Math.ceil(w / B);
  const runs = verticalRuns(bin, thinMax);

  // ---- 2. dots ------------------------------------------------------------------------------
  const acc = new Uint16Array(2 * h + 4);
  const accLen = new Uint32Array(2 * h + 4);
  const sliceStart = new Int32Array(nSlices + 1);
  let cap = 4096;
  let dotY = new Float32Array(cap);
  let dotT = new Float32Array(cap);
  let nd = 0;
  const maxExtent = 2 * (thinMax + 1 + B * maxSlope);
  for (let si = 0; si < nSlices; si++) {
    sliceStart[si] = nd;
    const xa = si * B;
    const xb = Math.min(w, xa + B);
    let lo = acc.length;
    let hi = -1;
    for (let x = xa; x < xb; x++) {
      for (let i = runs.start[x]; i < runs.start[x + 1]; i++) {
        const b = 2 * runs.pos[i] + runs.len[i];
        acc[b]++;
        accLen[b] += runs.len[i];
        if (b < lo) lo = b;
        if (b > hi) hi = b;
      }
    }
    const minCount = Math.max(2, Math.ceil((xb - xa) * 0.5));
    let b = lo;
    while (b <= hi) {
      if (!acc[b]) { b++; continue; }
      // Cluster of consecutive bins (one empty bin tolerated).
      const start = b;
      let c = 0, sy = 0, sl = 0, end = b;
      while (b <= hi && (acc[b] || (b + 1 <= hi && acc[b + 1]))) {
        if (acc[b]) {
          c += acc[b];
          sy += acc[b] * b;
          sl += accLen[b];
          end = b;
        }
        b++;
      }
      if (c >= minCount && end - start <= maxExtent) {
        if (nd === cap) {
          cap *= 2;
          const ny = new Float32Array(cap); ny.set(dotY); dotY = ny;
          const nt = new Float32Array(cap); nt.set(dotT); dotT = nt;
        }
        dotY[nd] = sy / c / 2;
        dotT[nd] = sl / c;
        nd++;
      }
    }
    for (let i = lo; i <= hi; i++) {
      acc[i] = 0;
      accLen[i] = 0;
    }
  }
  sliceStart[nSlices] = nd;

  // ---- 3. chains ----------------------------------------------------------------------------
  const gapMax = Math.max(2, Math.ceil((4 * s) / B));
  const tolBase = 1.0 + 0.08 * B;
  const tolCap = 0.45 * s;
  const maxStep = maxSlope * B;
  const rowOwner = new Int32Array(h).fill(-1);
  let active: Chain[] = [];
  const done: Chain[] = [];
  let globalSlope = 0;
  const touched: number[] = [];
  const cand: { d: number; dot: number; chain: number }[] = [];
  for (let si = 0; si < nSlices; si++) {
    // Retire stale chains, predict the others.
    const keep: Chain[] = [];
    for (const c of active) {
      if (si - c.slices[c.slices.length - 1] > gapMax) done.push(c);
      else keep.push(c);
    }
    active = keep;
    touched.length = 0;
    for (let a = 0; a < active.length; a++) {
      const c = active[a];
      const lastS = c.slices[c.slices.length - 1];
      c.pred = c.ys[c.ys.length - 1] + c.slope * (si - lastS);
      const row = Math.round(c.pred);
      if (row < 0 || row >= h) continue;
      const cur = rowOwner[row];
      if (cur === -1 || active[cur].slices.length < c.slices.length) {
        if (cur === -1) touched.push(row);
        rowOwner[row] = a;
      }
    }
    cand.length = 0;
    const reach = Math.ceil(Math.min(tolCap, tolBase + 0.35 * gapMax)) + 1;
    for (let d = sliceStart[si]; d < sliceStart[si + 1]; d++) {
      const y = dotY[d];
      const r0 = Math.max(0, Math.round(y) - reach);
      const r1 = Math.min(h - 1, Math.round(y) + reach);
      let seen = -1;
      for (let r = r0; r <= r1; r++) {
        const a = rowOwner[r];
        if (a === -1 || a === seen) continue;
        seen = a;
        const c = active[a];
        const gap = si - c.slices[c.slices.length - 1];
        const tol = Math.min(tolCap, tolBase + 0.35 * (gap - 1));
        const dist = Math.abs(y - c.pred);
        if (dist <= tol) cand.push({ d: dist, dot: d, chain: a });
      }
    }
    cand.sort((p, q) => p.d - q.d);
    const usedChain = new Set<number>();
    const usedDot = new Set<number>();
    for (const p of cand) {
      if (usedChain.has(p.chain) || usedDot.has(p.dot)) continue;
      usedChain.add(p.chain);
      usedDot.add(p.dot);
      const c = active[p.chain];
      const lastS = c.slices[c.slices.length - 1];
      let step = (dotY[p.dot] - c.ys[c.ys.length - 1]) / (si - lastS);
      if (step > maxStep) step = maxStep; else if (step < -maxStep) step = -maxStep;
      c.slope = c.slices.length < 3 ? (c.slope + step) / 2 : 0.75 * c.slope + 0.25 * step;
      c.thick += dotT[p.dot];
      c.slices.push(si);
      c.ys.push(dotY[p.dot]);
    }
    for (const row of touched) rowOwner[row] = -1;
    // Typical slope of the established chains seeds new ones.
    if (si % 8 === 0) {
      const slopes: number[] = [];
      for (const c of active) if (c.slices.length >= 8) slopes.push(c.slope);
      if (slopes.length >= 3) globalSlope = median(slopes);
    }
    for (let d = sliceStart[si]; d < sliceStart[si + 1]; d++) {
      if (usedDot.has(d)) continue;
      active.push({ slices: [si], ys: [dotY[d]], thick: dotT[d], slope: globalSlope, pred: 0 });
    }
  }
  for (const c of active) done.push(c);
  let lines: Line[] = [];
  for (const c of done) {
    if (c.slices.length >= 3) lines.push(makeLine(c.slices, c.ys, c.thick / c.slices.length));
  }

  // ---- merge chains across long gaps (collinear continuation) --------------------------------
  lines.sort((a, b) => a.first - b.first);
  const mergeGap = Math.ceil((14 * s) / B);
  {
    const alive = lines.map(() => true);
    for (let i = 0; i < lines.length; i++) {
      if (!alive[i]) continue;
      let cur = lines[i];
      for (;;) {
        let best = -1;
        let bestCost = Infinity;
        for (let j = 0; j < lines.length; j++) {
          if (!alive[j] || j === i) continue;
          const o = lines[j];
          const gap = o.first - cur.last;
          if (gap < 1 || gap > mergeGap) continue;
          // Chains usually break where a tie or a head pulled their last dots off the line, so the
          // ends disagree by more than the line itself wanders.
          const tol = Math.min(0.4 * s, Math.max(0.14 * s, 1.2 + 0.03 * gap * B));
          const e1 = Math.abs(lineAt(cur, o.first) - o.ys[0]);
          const e2 = Math.abs(lineAt(o, cur.last) - cur.ys[cur.ys.length - 1]);
          if (e1 > tol || e2 > tol) continue;
          const cost = gap + 4 * (e1 + e2);
          if (cost < bestCost) {
            bestCost = cost;
            best = j;
          }
        }
        if (best < 0) break;
        const o = lines[best];
        alive[best] = false;
        const n1 = cur.slices.length;
        const n2 = o.slices.length;
        cur = makeLine(Array.from(cur.slices).concat(Array.from(o.slices)), Array.from(cur.ys).concat(Array.from(o.ys)), (cur.thickness * n1 + o.thickness * n2) / (n1 + n2));
      }
      lines[i] = cur;
    }
    lines = lines.filter((_, i) => alive[i]);
  }
  const minLen = (opts.minLength ?? 5) * s;
  lines = lines.filter((l) => (l.last - l.first + 1) * B >= minLen && l.coverage >= 0.35);
  const traces: LineTrace[] = lines.map((l) => ({ slices: l.slices, ys: l.ys, thickness: l.thickness }));
  if (lines.length < 4) return { staves: [], scale, slice: B, traces };

  // ---- image probes ---------------------------------------------------------------------------
  const sliceX = (si: number): number => (si + 0.5) * B;
  /** Thin-run evidence for a line predicted at `y` in slice `si`: the median run centre, or NaN. */
  const probe = (si: number, y: number, slope: number, tol: number): number => {
    const xa = Math.max(0, si * B);
    const xb = Math.min(w, xa + B);
    if (xb <= xa) return NaN;
    const xc = sliceX(si);
    const found: number[] = [];
    for (let x = xa; x < xb; x++) {
      const dy = (slope * (x + 0.5 - xc)) / B;
      const c = nearestRun(runs, x, y + dy, tol);
      if (c === c) found.push(c - dy);
    }
    return found.length >= Math.max(2, (xb - xa) * 0.3) ? median(found) : NaN;
  };
  /** Fraction of the slice's columns that have any ink at the predicted line position. */
  const inkAt = (si: number, y: number, slope: number): number => {
    const xa = Math.max(0, si * B);
    const xb = Math.min(w, xa + B);
    if (xb <= xa) return 0;
    const xc = sliceX(si);
    const r = Math.max(1, Math.round(t / 2));
    let hit = 0;
    for (let x = xa; x < xb; x++) {
      const yy = Math.round(y + (slope * (x + 0.5 - xc)) / B - 0.5);
      for (let d = -r; d <= r; d++) {
        const yq = yy + d;
        if (yq >= 0 && yq < h && data[yq * w + x]) { hit++; break; }
      }
    }
    return hit / (xb - xa);
  };

  // ---- 4. combs -----------------------------------------------------------------------------
  const nL = lines.length;
  /** Median distance (line j below line i) over their common slices, or NaN without enough overlap. */
  const distance = (i: number, j: number): number => {
    const a = lines[i];
    const b = lines[j];
    const from = Math.max(a.first, b.first);
    const to = Math.min(a.last, b.last);
    const overlap = to - from + 1;
    if (overlap < 4 || overlap < 0.5 * Math.min(a.last - a.first + 1, b.last - b.first + 1)) return NaN;
    const ds: number[] = [];
    for (let k = 0; k < 9; k++) {
      const si = from + ((to - from) * k) / 8;
      ds.push(lineAt(b, si) - lineAt(a, si));
    }
    const m = median(ds);
    let spread = 0;
    for (const d of ds) spread = Math.max(spread, Math.abs(d - m));
    return spread <= 0.25 * Math.abs(m) + 1 ? m : NaN;
  };
  const dMin = Math.max(3, 0.55 * s);
  const dMax = 2.3 * s;
  const dist = new Float32Array(nL * nL).fill(NaN);
  // below[i]: lines within two staff-line pitches under line i (the only ones a comb can use next).
  const below: number[][] = [];
  const midY = lines.map((l) => l.ys[l.ys.length >> 1]);
  const maxDrop = 2.2 * dMax + (nSlices * maxSlope * B) + 2;
  for (let i = 0; i < nL; i++) {
    const list: number[] = [];
    for (let j = 0; j < nL; j++) {
      if (i === j || Math.abs(midY[j] - midY[i]) > maxDrop) continue;
      const d = distance(i, j);
      dist[i * nL + j] = d;
      if (d > 0 && d <= 2.2 * dMax) list.push(j);
    }
    below.push(list);
  }

  interface Candidate {
    /** Line index per staff line, -1 for a line predicted between found ones. */
    members: number[];
    d: number;
    score: number;
  }
  const candidates: Candidate[] = [];
  for (let i = 0; i < nL; i++) {
    for (const j of below[i]) {
      const d0 = dist[i * nL + j];
      if (!(d0 >= dMin && d0 <= dMax)) continue;
      const members = [i, j];
      let d = d0;
      let anchor = j; // last real line
      let pending = 0; // predicted lines since the anchor
      let virtuals = 0;
      let sum = d0;
      let cnt = 1;
      while (members.length < 6) {
        const want = d * (pending + 1);
        const tol = 0.16 * d + 0.7;
        let best = -1;
        let bestErr = tol;
        for (const m of below[anchor]) {
          const dm = dist[anchor * nL + m];
          const err = Math.abs(dm - want);
          if (err <= bestErr && !members.includes(m)) {
            bestErr = err;
            best = m;
          }
        }
        if (best >= 0) {
          sum += dist[anchor * nL + best];
          cnt += pending + 1;
          d = sum / cnt;
          for (let p = 0; p < pending; p++) members.push(-1);
          members.push(best);
          anchor = best;
          pending = 0;
        } else if (pending === 0 && virtuals === 0 && members.length <= 4) {
          pending = 1;
          virtuals++;
        } else {
          break;
        }
      }
      if (members.length >= 3) {
        const real = members.filter((m) => m >= 0);
        const cov = real.reduce((a, m) => a + lines[m].coverage, 0) / real.length;
        candidates.push({ members, d, score: real.length * 10 + cov - (members.length - real.length) * 4 });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  // ---- 5. validate, extend, track -------------------------------------------------------------
  const used = new Uint8Array(nL);
  const staves: StaffGeom[] = [];
  const allowFour = opts.allowFourLines ?? true;
  for (const cand0 of candidates) {
    if (cand0.members.some((m) => m >= 0 && used[m])) continue;
    let members = cand0.members.slice();
    // Trim weak outer members: rows of ledger lines chain into short, sparse traces.
    for (;;) {
      const real = members.filter((m) => m >= 0);
      if (real.length < 3) break;
      const spans = real.map((m) => lines[m].last - lines[m].first + 1);
      const covs = real.map((m) => lines[m].coverage);
      const medSpan = median(spans);
      const medCov = median(covs);
      const medFirst = median(real.map((m) => lines[m].first));
      const medLast = median(real.map((m) => lines[m].last));
      const lim = (3 * s) / B;
      const weak = (m: number): boolean => {
        const l = lines[m];
        const span = l.last - l.first + 1;
        return span < 0.7 * medSpan || l.coverage < 0.7 * medCov || l.first > medFirst + lim + 0.15 * medSpan || l.last < medLast - lim - 0.15 * medSpan;
      };
      if (weak(members[0])) {
        members = members.slice(1);
        while (members[0] === -1) members = members.slice(1);
        continue;
      }
      if (weak(members[members.length - 1])) {
        members = members.slice(0, -1);
        while (members[members.length - 1] === -1) members = members.slice(0, -1);
        continue;
      }
      break;
    }
    // Three found lines are enough to start from: the missing ones are looked for on the image below.
    const real = members.filter((m) => m >= 0);
    if (real.length < 3) continue;
    if (real.some((m) => used[m])) continue;

    // Common span and a model y(l, slice) for every staff line (found or predicted).
    let first = Math.round(median(real.map((m) => lines[m].first)));
    let last = Math.round(median(real.map((m) => lines[m].last)));
    if (last - first < 3) continue;
    const refIdx = members.findIndex((m) => m >= 0);
    const lastIdx = members.length - 1 - members.slice().reverse().findIndex((m) => m >= 0);
    const top = lines[members[refIdx]];
    const bot = lines[members[lastIdx]];
    const spacingAt = (si: number): number => (lineAt(bot, si) - lineAt(top, si)) / (lastIdx - refIdx);
    const model = (l: number, si: number): number => {
      const m = members[l];
      if (m >= 0 && si >= lines[m].first - 2 && si <= lines[m].last + 2) return lineAt(lines[m], si);
      return lineAt(top, si) + (l - refIdx) * spacingAt(si);
    };
    const slopeAt = (si: number): number => (lineAt(top, si + 1) - lineAt(top, si - 1)) / 2;

    // Extend by probing for one more line above and below (a chain that failed to form).
    let count = members.length;
    let shift = 0; // lines added above
    const lineCoverage = (l: number): number => {
      let ok = 0;
      let n = 0;
      for (let si = first; si <= last; si++) {
        n++;
        if (inkAt(si, model(l, si), slopeAt(si)) >= 0.6) ok++;
      }
      return n ? ok / n : 0;
    };
    const thinCoverage = (l: number): number => {
      let ok = 0;
      let n = 0;
      const tol = Math.max(1.2, 0.2 * cand0.d);
      for (let si = first; si <= last; si += 2) {
        n++;
        const y = probe(si, model(l, si), slopeAt(si), tol);
        if (y === y) ok++;
      }
      return n ? ok / n : 0;
    };
    // Predicted inner lines must be real.
    let valid = true;
    for (let l = 0; l < members.length; l++) {
      if (members[l] === -1 && (lineCoverage(l) < 0.7 || thinCoverage(l) < 0.4)) valid = false;
    }
    if (!valid) continue;
    while (count < 6 && lineCoverage(-1 - shift) >= 0.8 && thinCoverage(-1 - shift) >= 0.55) {
      shift++;
      count++;
    }
    let extraBelow = 0;
    while (count < 6 && lineCoverage(members.length + extraBelow) >= 0.8 && thinCoverage(members.length + extraBelow) >= 0.55) {
      extraBelow++;
      count++;
    }
    if (count < 4 || count > 6) continue;
    if (count === 4 && !allowFour) continue;
    const yModel = (l: number, si: number): number => model(l - shift, si);

    // Track every line on the image over the span, then follow the staff to its ends.
    const tolY = Math.max(1.3, 0.28 * cand0.d);
    const cols: { si: number; ys: number[] }[] = [];
    const measure = (si: number, pred: (l: number) => number, slope: number): { ys: number[]; present: number } => {
      const ys: number[] = [];
      let present = 0;
      for (let l = 0; l < count; l++) {
        const p = pred(l);
        const y = probe(si, p, slope, tolY);
        ys.push(y);
        if (y === y || inkAt(si, p, slope) >= 0.6) present++;
      }
      return { ys, present };
    };
    for (let si = first; si <= last; si++) cols.push({ si, ys: measure(si, (l) => yModel(l, si), slopeAt(si)).ys });
    const fillColumn = (ys: number[], pred: (l: number) => number): number[] => {
      // Replace missing lines by the prediction shifted by the mean residual of the lines that were seen.
      let res = 0;
      let n = 0;
      for (let l = 0; l < count; l++) if (ys[l] === ys[l]) { res += ys[l] - pred(l); n++; }
      const off = n ? res / n : 0;
      return ys.map((y, l) => (y === y ? y : pred(l) + off));
    };
    for (const c of cols) c.ys = fillColumn(c.ys, (l) => yModel(l, c.si));
    // Outward tracking: predict from the last columns, stop when the lines are gone.
    const need = count - 1;
    const extend = (dir: 1 | -1): void => {
      let misses = 0;
      const pending: { si: number; ys: number[] }[] = [];
      for (;;) {
        const edge = dir === 1 ? cols[cols.length - 1] : cols[0];
        const si = edge.si + dir * (pending.length + 1);
        if (si < 0 || si >= nSlices) break;
        // Slope from the last few accepted columns.
        const k = Math.min(cols.length - 1, 12);
        const ref = dir === 1 ? cols[cols.length - 1 - k] : cols[k];
        const slope = k > 0 ? (edge.ys[0] - ref.ys[0] + edge.ys[count - 1] - ref.ys[count - 1]) / 2 / (edge.si - ref.si) : 0;
        const pred = (l: number): number => edge.ys[l] + slope * (si - edge.si);
        const mres = measure(si, pred, slope);
        if (mres.present >= need) {
          for (const p of pending) cols[dir === 1 ? 'push' : 'unshift'](p);
          pending.length = 0;
          cols[dir === 1 ? 'push' : 'unshift']({ si, ys: fillColumn(mres.ys, pred) });
          misses = 0;
        } else {
          misses++;
          if (misses > 1) break;
          pending.push({ si, ys: [0, 1, 2, 3, 4, 5].slice(0, count).map(pred) });
        }
      }
    };
    extend(1);
    extend(-1);

    // Exact ends: first / last column where almost all lines have ink.
    const r = Math.max(1, Math.round(t / 2));
    const inkCol = (x: number, col: { si: number; ys: number[] }, slope: number): boolean => {
      let hit = 0;
      for (let l = 0; l < count; l++) {
        const yy = Math.round(col.ys[l] + (slope * (x + 0.5 - sliceX(col.si))) / B - 0.5);
        for (let d = -r; d <= r; d++) {
          const yq = yy + d;
          if (yq >= 0 && yq < h && data[yq * w + x]) { hit++; break; }
        }
      }
      return hit >= need;
    };
    const colSlope = (k: number): number => {
      const a = cols[Math.max(0, k - 2)];
      const b = cols[Math.min(cols.length - 1, k + 2)];
      return b.si === a.si ? 0 : (b.ys[0] - a.ys[0] + b.ys[count - 1] - a.ys[count - 1]) / 2 / (b.si - a.si);
    };
    let x0 = cols[0].si * B;
    {
      const c = cols[0];
      const sl = colSlope(0);
      const lim = Math.min(w - 1, x0 + 2 * B);
      let x = Math.max(0, x0 - B);
      while (x < lim && !inkCol(x, c, sl)) x++;
      x0 = x;
    }
    let x1 = Math.min(w, (cols[cols.length - 1].si + 1) * B);
    {
      const c = cols[cols.length - 1];
      const sl = colSlope(cols.length - 1);
      const lim = Math.max(0, x1 - 2 * B);
      let x = Math.min(w - 1, x1 + B - 1);
      while (x > lim && !inkCol(x, c, sl)) x--;
      x1 = x + 1;
    }
    if (x1 - x0 < minLen) continue;

    // Smooth along the staff (median of 3 then [1 2 1]) and sample at the slice centres plus the ends.
    const K = cols.length;
    const sm: Float32Array[] = [];
    for (let l = 0; l < count; l++) {
      const raw = cols.map((c) => c.ys[l]);
      const med = raw.map((v, k) => (k > 0 && k < K - 1 ? median([raw[k - 1], v, raw[k + 1]]) : v));
      const out = new Float32Array(K);
      for (let k = 0; k < K; k++) out[k] = k > 0 && k < K - 1 ? (med[k - 1] + 2 * med[k] + med[k + 1]) / 4 : med[k];
      sm.push(out);
    }
    const xsList: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k < K; k++) {
      const x = sliceX(cols[k].si);
      if (x > x0 + 0.25 * B && x < x1 - 0.25 * B) {
        xsList.push(x);
        idx.push(k);
      }
    }
    if (xsList.length < 2) continue;
    const xs = new Float32Array(xsList.length + 2);
    xs[0] = x0;
    xs.set(xsList, 1);
    xs[xs.length - 1] = x1;
    const ys: Float32Array[] = [];
    for (let l = 0; l < count; l++) {
      const out = new Float32Array(xs.length);
      for (let k = 0; k < idx.length; k++) out[k + 1] = sm[l][idx[k]];
      // Ends: extrapolate with the local slope.
      const s0 = idx.length > 1 ? (out[2] - out[1]) / (xs[2] - xs[1]) : 0;
      out[0] = out[1] + s0 * (xs[0] - xs[1]);
      const e = xs.length - 2;
      const s1 = idx.length > 1 ? (out[e] - out[e - 1]) / (xs[e] - xs[e - 1]) : 0;
      out[e + 1] = out[e] + s1 * (xs[e + 1] - xs[e]);
      ys.push(out);
    }

    // Quality: spacing regularity, ink coverage and thin-line evidence along the staff.
    let space = 0;
    let irregular = 0;
    for (let k = 0; k < xs.length; k++) {
      const sp = (ys[count - 1][k] - ys[0][k]) / (count - 1);
      space += sp;
      for (let l = 1; l < count; l++) irregular = Math.max(irregular, Math.abs(ys[l][k] - ys[l - 1][k] - sp) / sp);
    }
    space /= xs.length;
    let cov = 0;
    let thin = 0;
    let nCov = 0;
    let thickSum = 0;
    let thickN = 0;
    for (const c of cols) {
      const sl = 0;
      for (let l = 0; l < count; l++) {
        nCov++;
        if (inkAt(c.si, c.ys[l], sl) >= 0.6) cov++;
        const y = probe(c.si, c.ys[l], sl, 1.2);
        if (y === y) thin++;
      }
    }
    for (const m of real) {
      thickSum += lines[m].thickness;
      thickN++;
    }
    const coverage = nCov ? cov / nCov : 0;
    const thinShare = nCov ? thin / nCov : 0;
    if (coverage < 0.62 || thinShare < 0.3 || irregular > 0.45) continue;
    const confidence = Math.max(0, Math.min(1, 0.35 + 0.45 * Math.min(1, (coverage - 0.6) / 0.3) + 0.2 * Math.min(1, thinShare / 0.6) - Math.max(0, irregular - 0.12) - (count === 4 ? 0.2 : 0)));
    for (const m of real) used[m] = 1;
    staves.push({ lineCount: count, xs, ys, x0, x1, space, thickness: thickN ? thickSum / thickN : t, coverage, confidence });
  }

  // Remove duplicates (two candidates that grew into the same staff) and order top to bottom.
  staves.sort((a, b) => b.confidence * (b.x1 - b.x0) - a.confidence * (a.x1 - a.x0));
  const kept: StaffGeom[] = [];
  for (const st of staves) {
    const mid = (st.x0 + st.x1) / 2;
    const top = st.ys[0][st.ys[0].length >> 1];
    const bottom = st.ys[st.lineCount - 1][st.ys[0].length >> 1];
    const clash = kept.some((o) => {
      const overlap = Math.min(o.x1, st.x1) - Math.max(o.x0, st.x0);
      if (overlap < 0.3 * Math.min(o.x1 - o.x0, st.x1 - st.x0)) return false;
      const om = Math.max(o.x0, Math.min(o.x1, mid));
      // Vertical overlap of the two staves at a common column.
      const k = Math.max(0, Math.min(o.xs.length - 1, Math.round(((om - o.x0) / (o.x1 - o.x0)) * (o.xs.length - 1))));
      const ot = o.ys[0][k];
      const ob = o.ys[o.lineCount - 1][k];
      return Math.min(ob, bottom) - Math.max(ot, top) > -0.3 * st.space;
    });
    if (!clash) kept.push(st);
  }
  kept.sort((a, b) => {
    const ay = a.ys[0][a.ys[0].length >> 1];
    const by = b.ys[0][b.ys[0].length >> 1];
    return ay - by;
  });
  return { staves: kept, scale, slice: B, traces };
}
