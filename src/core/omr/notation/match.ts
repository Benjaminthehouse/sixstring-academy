/**
 * Template matching on the symbol ink of a staff strip: weighted zero-mean normalised
 * cross-correlation (ZNCC) between a glyph template and the ink under it. Rows inside a staff-line
 * band count less, because what is left of a symbol there depends on the line removal.
 */
import type { Strip } from './strip';
import type { Template } from './templates';

/** Result of a template search. */
export interface Match {
  /** ZNCC, -1..1 (0 when the window holds no contrast). */
  score: number;
  /** Where the glyph origin was placed, strip px. */
  x: number;
  y: number;
  template: Template;
}

/**
 * Correlation of a template whose origin is put at (ox, oy). Pixels outside the strip count as
 * paper. Returns 0 when the image window is flat.
 */
export function matchAt(strip: Strip, t: Template, ox: number, oy: number): number {
  const { w, h, ink, rowWeight } = strip;
  const left = Math.round(ox - t.ox);
  const top = Math.round(oy - t.oy);
  const W = t.width;
  const H = t.height;
  const T = t.ink;
  let sw = 0;
  let sI = 0;
  let sT = 0;
  let sII = 0;
  let sTT = 0;
  let sIT = 0;
  const xa = Math.max(0, -left);
  const xb = Math.min(W, w - left);
  for (let ty = 0; ty < H; ty++) {
    const y = top + ty;
    const wt = y >= 0 && y < h ? rowWeight[y] : 1;
    sw += wt * W;
    sT += wt * t.rowSum[ty];
    sTT += wt * t.rowSumSq[ty];
    if (y < 0 || y >= h || xb <= xa) continue;
    let rI = 0;
    let rII = 0;
    let rIT = 0;
    let p = y * w + left + xa;
    let q = ty * W + xa;
    for (let tx = xa; tx < xb; tx++) {
      const v = ink[p++];
      rI += v;
      rII += v * v;
      rIT += v * T[q++];
    }
    sI += wt * rI;
    sII += wt * rII;
    sIT += wt * rIT;
  }
  if (sw <= 0) return 0;
  const cov = sIT - (sI * sT) / sw;
  const varI = sII - (sI * sI) / sw;
  const varT = sTT - (sT * sT) / sw;
  // A window with almost no ink has no shape to compare (255^2 * 2 % of the window).
  if (varI < sw * 650 || varT <= 0) return 0;
  return cov / Math.sqrt(varI * varT);
}

/** Best placement of one template within +-rx / +-ry px of (ox, oy). */
export function searchMatch(strip: Strip, t: Template, ox: number, oy: number, rx: number, ry: number, step = 1): Match {
  let best: Match = { score: -1, x: ox, y: oy, template: t };
  for (let dy = -ry; dy <= ry; dy += step) {
    for (let dx = -rx; dx <= rx; dx += step) {
      const sc = matchAt(strip, t, ox + dx, oy + dy);
      if (sc > best.score) best = { score: sc, x: ox + dx, y: oy + dy, template: t };
    }
  }
  return best;
}

/** Best template of a list (and its placement) within +-rx / +-ry px of (ox, oy). */
export function bestMatch(strip: Strip, templates: Template[], ox: number, oy: number, rx: number, ry: number, step = 1): Match | null {
  let best: Match | null = null;
  for (const t of templates) {
    const m = searchMatch(strip, t, ox, oy, rx, ry, step);
    if (!best || m.score > best.score) best = m;
  }
  return best;
}

/**
 * Two-stage search for large ranges: a coarse pass every `coarse` px, then a fine pass around the
 * best coarse placement.
 */
export function coarseToFine(strip: Strip, templates: Template[], ox: number, oy: number, rx: number, ry: number, coarse = 2): Match | null {
  let best: Match | null = null;
  for (const t of templates) {
    const c = searchMatch(strip, t, ox, oy, rx, ry, coarse);
    const f = searchMatch(strip, t, c.x, c.y, coarse - 1, coarse - 1, 1);
    const m = f.score >= c.score ? f : c;
    if (!best || m.score > best.score) best = m;
  }
  return best;
}
