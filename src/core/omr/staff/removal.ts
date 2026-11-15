/**
 * Staff-line removal that keeps the symbols.
 *
 * Along every staff line, each column is inspected: if the vertical ink run that passes through
 * the line is no thicker than a staff line (plus one pixel), it is line and is erased; if it is
 * longer, a symbol crosses the line there (note head, stem, clef, digit) and the column is left
 * alone. Symbols therefore stay connected through the lines they cross.
 */
import type { BinaryImage } from '../image/gray';
import type { StaffGeom } from './model';

/** Options for {@link removeStaffLines}. */
export interface RemovalOptions {
  /** Longest vertical run erased, px. Default: staff-line thickness + 1, rounded up. */
  maxThickness?: number;
  /** How far from the predicted line centre a run may start, px. Default: half the line thickness + 1. */
  tolerance?: number;
}

/** Result of {@link removeStaffLines}. */
export interface RemovalResult {
  /** The page without staff lines. */
  image: BinaryImage;
  /** The erased pixels (1 = was staff line). */
  mask: BinaryImage;
}

/** Erase the lines of the given staves from a binary page. The input is not modified. */
export function removeStaffLines(bin: BinaryImage, staves: StaffGeom[], opts: RemovalOptions = {}): RemovalResult {
  const { width: w, height: h } = bin;
  const out = bin.data.slice();
  const mask = new Uint8Array(w * h);
  const src = bin.data;
  for (const st of staves) {
    const maxT = opts.maxThickness ?? Math.ceil(st.thickness + 1);
    const tol = opts.tolerance ?? Math.max(1, Math.round(st.thickness / 2 + 0.5));
    const xa = Math.max(0, Math.floor(st.x0) - 1);
    const xb = Math.min(w - 1, Math.ceil(st.x1));
    for (let l = 0; l < st.lineCount; l++) {
      const ys = st.ys[l];
      const xs = st.xs;
      let k = 0;
      for (let x = xa; x <= xb; x++) {
        const xc = x + 0.5;
        while (k + 2 < xs.length && xs[k + 1] < xc) k++;
        const t = xs.length > 1 ? (xc - xs[k]) / (xs[k + 1] - xs[k]) : 0;
        const y = xs.length > 1 ? ys[k] + (ys[k + 1] - ys[k]) * t : ys[0];
        const yc = Math.floor(y);
        // Nearest ink pixel to the line centre within the tolerance.
        let hit = -1;
        for (let d = 0; d <= tol && hit < 0; d++) {
          const up = yc - d;
          const dn = yc + d;
          if (up >= 0 && up < h && src[up * w + x]) hit = up;
          else if (dn >= 0 && dn < h && src[dn * w + x]) hit = dn;
        }
        if (hit < 0) continue;
        let a = hit;
        let b = hit;
        while (a > 0 && src[(a - 1) * w + x]) a--;
        while (b < h - 1 && src[(b + 1) * w + x]) b++;
        if (b - a + 1 > maxT) continue;
        for (let yy = a; yy <= b; yy++) {
          out[yy * w + x] = 0;
          mask[yy * w + x] = 1;
        }
      }
    }
  }
  return { image: { width: w, height: h, data: out }, mask: { width: w, height: h, data: mask } };
}
