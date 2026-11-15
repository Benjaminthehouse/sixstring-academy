/**
 * Could a real camera have produced this homography of a real neck?
 *
 * A homography has eight degrees of freedom; a rigid neck seen by a pinhole camera has six, plus the
 * focal length. The surplus is what separates a fretboard from fret-like clutter: evenly spaced
 * slats, stripes or ladder rungs can be matched to the 12-tone spacing only by a homography whose
 * perspective along the pattern is not matched by its perspective across it. `rigidity` explains
 * the homography as K [r1 r2 t] for a range of plausible focal lengths and reports how far the best
 * explanation is from a rigid one.
 */
import { boardWidthAt, decomposeHomography, fretX, multiply } from '../geometry';
import type { Mat3, NeckModel } from '../types';

/** Result of `rigidity`. */
export interface Rigidity {
  /** sqrt(log(aspect)^2 + skew^2) of the best explanation: 0 for an exact view of the model. */
  residual: number;
  /** Angle between the board normal and the optical axis, degrees. */
  tiltDeg: number;
  /** Focal length (pixels) of the best explanation. */
  focalPx: number;
}

/**
 * Focal lengths tried, as fractions of the frame width: horizontal fields of view from about 81
 * down to 50 degrees, which covers laptop webcams and phone cameras. The narrower this range, the
 * sharper the test (an odd perspective can always be "explained" by an odd lens).
 */
export const FOCAL_FRACTIONS: readonly number[] = [0.58, 0.66, 0.75, 0.85, 0.96, 1.08];

/** Rigidity of a homography (neck mm -> pixels of a frame of the given size). Null for a degenerate matrix. */
export function rigidity(H: Mat3, frameWidth: number, frameHeight: number): Rigidity | null {
  let best: Rigidity | null = null;
  for (const k of FOCAL_FRACTIONS) {
    const view = decomposeHomography(H, frameWidth, frameHeight, k * frameWidth);
    if (!view) continue;
    const la = Math.log(view.aspect);
    const residual = Math.sqrt(la * la + view.skew * view.skew);
    if (!best || residual < best.residual) best = { residual, tiltDeg: view.tiltDeg, focalPx: view.focalPx };
  }
  return best;
}

/**
 * The homography after shifting the fret numbering by `delta`: the wire that was fret n becomes
 * fret n + delta. Exact along the neck (fret positions are self-similar); across the neck the
 * width is matched at `xRef` (old numbering, mm), because the taper is not self-similar.
 */
export function renumberHomography(H: Mat3, model: NeckModel, delta: number, xRef: number): Mat3 {
  if (delta === 0) return H;
  const r = Math.pow(2, -delta / 12);
  const xd = fretX(model, delta);
  const s = boardWidthAt(model, xRef) / boardWidthAt(model, xd + r * xRef);
  const yc = model.nutWidth / 2;
  // Maps new-numbering plane coordinates to old-numbering plane coordinates.
  const A: Mat3 = [1 / r, 0, -xd / r, 0, s, yc * (1 - s), 0, 0, 1];
  return multiply(H, A);
}
