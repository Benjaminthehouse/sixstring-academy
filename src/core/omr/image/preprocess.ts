/**
 * Page preprocessing: from any capture (PDF render, scan, phone photo) to a normalised page.
 *
 *   luma -> rough pass (flatten, binarise, trace staves, possibly at reduced resolution)
 *        -> geometric model from the staff traces (image/dewarp.ts)
 *        -> ONE resampling of the original into the normalised page
 *        -> flatten + binarise the normalised page
 *
 * In the normalised page staff lines are straight, level and `targetSpace` px apart, paper is
 * white, and `mesh` maps every normalised pixel back to the original picture. Everything here is
 * synchronous typed-array code meant to run in a Web Worker; nothing touches the DOM.
 */
import { type StaffDetection, detectStaves } from '../staff/lines';
import { type StaffGeom, staffSlope } from '../staff/model';
import { binarize } from './binarize';
import { removeSmallComponents } from './cc';
import { type CorrectionMode, buildDewarp } from './dewarp';
import { type BinaryImage, type GrayImage, blur3, boxBlurSheared, boxBlurVertical, downscaleInt } from './gray';
import { type FlattenResult, flatten } from './illumination';
import { estimateSkew } from './skew';
import { type Affine, type WarpMesh, meshFromAffine, warpGray } from './warp';

/** Options for {@link preprocess}. */
export interface PreprocessOptions {
  /** Notation staff space of the normalised page, px. Default 16. */
  targetSpace?: number;
  /** The rough pass runs on an image whose long side is at most this (default 2200). */
  maxRoughSide?: number;
  /** Force a correction level instead of choosing from the measured distortion. */
  correction?: CorrectionMode;
  /** Largest normalised page side (default 5000). */
  maxSide?: number;
}

/** Result of {@link preprocess}. */
export interface PreprocessResult {
  /** The original luma (kept for staff-strip extraction and proofreading crops). */
  source: GrayImage;
  /** Normalised page, flattened: paper ~255, ink dark. */
  gray: GrayImage;
  /** Normalised page, binarised for symbols (1 = ink). */
  binary: BinaryImage;
  /** Binarisation tuned for finding staff lines on noisy pages (the same object as `binary` on clean pages). */
  lineBinary: BinaryImage;
  /** Binarisation tuned for finding bar lines on noisy pages (the same object as `binary` on clean pages). */
  strokeBinary: BinaryImage;
  /** Normalised px -> source px. */
  mesh: WarpMesh;
  /** How the geometry was corrected. */
  correction: CorrectionMode;
  /** Notation staff space expected in the normalised page (0 when no staff was found). */
  staffSpace: number;
  /** Notation staff space in the source image, px (0 when no staff was found). */
  sourceStaffSpace: number;
  /** Tab staff space / notation staff space on this page (1 when there is only one kind). */
  tabRatio: number;
  /** Normalised px per source px. */
  scale: number;
  /** Rotation found in the source, radians (positive = lines run downhill to the right). */
  skew: number;
  /** Pixel noise (grey levels) and ink contrast (0..1) measured on the normalised page. */
  noise: number;
  contrast: number;
  /** Fraction of the capture that is not paper (desk, scanner lid). */
  offPage: number;
  /** Measured distortion of the capture: largest deviation of a staff-line slope from the page skew, and relative spread of the staff space. */
  distortion: { slopeSpread: number; spaceSpread: number };
  /** Staves traced on the source in the rough pass (source px), for debugging. */
  roughStaves: StaffGeom[];
  /** Milliseconds per stage. */
  timings: Record<string, number>;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function medianOf(values: number[]): number {
  const v = values.slice().sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** True when a flattened page is noisy or faint enough that staff lines need the directional smoothing. */
export function isNoisy(flat: FlattenResult, noise = flat.noise): boolean {
  return noise >= 2.5 || flat.contrast < 0.45;
}

/**
 * Binarise a flattened page for symbols. Noisy pages are low-passed a little first and cleaned of
 * specks afterwards. `noise` overrides the estimate of the flattened image (pass the noise of the
 * capture when the image was enlarged, which hides it from a neighbour-difference estimate).
 */
export function binarizeSymbols(flat: FlattenResult, staffSpace: number, noise = flat.noise): BinaryImage {
  let img = flat.image;
  const space = staffSpace > 0 ? staffSpace : img.width / 120;
  const win = Math.max(15, Math.round(space * 2.5) | 1);
  let sigma = noise;
  if (noise >= 5) {
    // One light low-pass only: more would also wipe out stems and bar lines, which are already faint.
    img = blur3(img);
    sigma = noise / 2;
  }
  // Never call a pixel ink unless it is clearly below paper white for this noise level.
  const binary = binarize(img, { window: win, k: 0.2, lightCeil: 255 - Math.max(20, 4 * sigma) });
  if (noise >= 3) removeSmallComponents(binary, Math.max(3, Math.round(0.02 * space * space)));
  return binary;
}

/**
 * Binarise a flattened page for finding staff lines: the grey levels are first averaged along the
 * line direction (`slope` = dy/dx of the staff lines, `radius` in staff spaces), which lifts faint,
 * noisy or JPEG-broken lines well above the noise. Symbols smear, so use it only to trace lines.
 */
export function binarizeLines(flat: FlattenResult, staffSpace: number, slope = 0, radius = 0.75, noise = flat.noise): BinaryImage {
  const img = flat.image;
  const space = staffSpace > 0 ? staffSpace : img.width / 120;
  const win = Math.max(15, Math.round(space * 2.5) | 1);
  const r = Math.max(1, Math.round(radius * space));
  const smooth = boxBlurSheared(img, r, slope);
  const eff = noise / Math.sqrt(2 * r + 1);
  return binarize(smooth, { window: win, k: 0.12, lightCeil: 255 - Math.max(10, 4 * eff) });
}

/**
 * Binarise a flattened, level page for finding upright strokes (bar lines, stems): the grey levels
 * are averaged vertically over `radius` staff spaces, which keeps the strokes, lifts them above the
 * noise and washes the staff lines out.
 */
export function binarizeStrokes(flat: FlattenResult, staffSpace: number, radius = 0.5, noise = flat.noise): BinaryImage {
  const img = flat.image;
  const space = staffSpace > 0 ? staffSpace : img.width / 120;
  const win = Math.max(15, Math.round(space * 2.5) | 1);
  const r = Math.max(1, Math.round(radius * space));
  const smooth = boxBlurVertical(img, r);
  const eff = noise / Math.sqrt(2 * r + 1);
  return binarize(smooth, { window: win, k: 0.14, lightCeil: 255 - Math.max(12, 4 * eff) });
}

/** Score of a staff detection: total length of the staves weighted by confidence. */
export function detectionScore(staves: StaffGeom[]): number {
  let s = 0;
  for (const st of staves) s += st.confidence * (st.x1 - st.x0) * st.lineCount;
  return s;
}

function scaleStaff(st: StaffGeom, f: number): StaffGeom {
  return {
    ...st,
    xs: st.xs.map((v) => v * f),
    ys: st.ys.map((line) => line.map((v) => v * f)),
    x0: st.x0 * f,
    x1: st.x1 * f,
    space: st.space * f,
    thickness: st.thickness * f,
  };
}

/** Normalise a page. See the file comment for the stages. */
export function preprocess(source: GrayImage, opts: PreprocessOptions = {}): PreprocessResult {
  const timings: Record<string, number> = {};
  const targetSpace = opts.targetSpace ?? 16;
  const maxRough = opts.maxRoughSide ?? 2200;
  const { width: w, height: h } = source;
  let t0 = now();

  // ---- rough pass -----------------------------------------------------------------------------
  let f = Math.max(1, Math.ceil(Math.max(w, h) / maxRough));
  const trace = (img: GrayImage): { det: StaffDetection; flat: FlattenResult; binary: BinaryImage } => {
    const flat = flatten(img);
    const binary = binarizeSymbols(flat, 0);
    let det = detectStaves(binary);
    if (!det.staves.length || isNoisy(flat)) {
      // Second look with the grey levels averaged along the lines. Their direction comes from the
      // staves already found, or else from the projection profile of the page.
      const slope = det.staves.length ? medianOf(det.staves.map(staffSlope)) : Math.tan(estimateSkew(binary).angle);
      const space = det.scale.staffSpace >= 5 ? det.scale.staffSpace : img.width / 120;
      const det2 = detectStaves(binarizeLines(flat, space, slope, 0.75));
      if (detectionScore(det2.staves) > detectionScore(det.staves) * 1.02) det = det2;
    }
    return { det, flat, binary };
  };
  let rough = trace(f > 1 ? downscaleInt(source, f) : source);
  if (f > 1 && (rough.det.staves.length === 0 || rough.det.scale.staffSpace < 7)) {
    // Too little detail after reduction: trace on the full-resolution image instead.
    f = 1;
    rough = trace(source);
  }
  const det = rough.det;
  const binR = { binary: rough.binary };
  const sourceNoise = rough.flat.noise * f;
  const roughStaves = f > 1 ? det.staves.map((s) => scaleStaff(s, f)) : det.staves;
  timings.rough = now() - t0;
  t0 = now();

  // ---- geometry -------------------------------------------------------------------------------
  let mesh: WarpMesh;
  let correction: CorrectionMode;
  let scale = 1;
  let skew = 0;
  let sourceStaffSpace = 0;
  let tabRatio = 1;
  const distortion = { slopeSpread: 0, spaceSpread: 0 };
  if (roughStaves.length) {
    const dw = buildDewarp(roughStaves, w, h, { targetSpace, mode: opts.correction, maxSide: opts.maxSide ?? 5000 });
    mesh = dw.mesh;
    correction = dw.mode;
    scale = dw.scale;
    skew = dw.skew;
    sourceStaffSpace = dw.sourceSpace;
    tabRatio = dw.tabRatio;
    distortion.slopeSpread = dw.slopeSpread;
    distortion.spaceSpread = dw.spaceSpread;
  } else {
    // No staves (a chord sheet, a lyric page): still level the text lines for the OCR path.
    const sk = estimateSkew(binR.binary);
    const angle = sk.confidence > 0.25 && Math.abs(sk.angle) > 0.0015 ? sk.angle : 0;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t: Affine = [c, -s, w / 2 - (c * w) / 2 + (s * h) / 2, s, c, h / 2 - (s * w) / 2 - (c * h) / 2];
    mesh = meshFromAffine(w, h, t, 64);
    correction = angle === 0 ? 'none' : 'similarity';
    skew = angle;
  }
  timings.geometry = now() - t0;
  t0 = now();

  // ---- resample once ----------------------------------------------------------------------------
  let gray: GrayImage;
  if (correction === 'none') {
    gray = source;
  } else {
    // Low-pass before shrinking so thin lines are averaged rather than skipped.
    let src = source;
    let m = mesh;
    if (scale < 0.55) {
      src = downscaleInt(source, 2);
      m = { ...mesh, sx: mesh.sx.map((v) => v / 2), sy: mesh.sy.map((v) => v / 2) };
    } else if (scale < 0.8) {
      src = blur3(source);
    }
    gray = warpGray(src, m, { edge: 'clamp' });
  }
  timings.resample = now() - t0;
  t0 = now();

  // ---- photometry on the normalised page ----------------------------------------------------------
  const staffSpace = roughStaves.length ? targetSpace : 0;
  const flat = flatten(gray, { ...(staffSpace ? { cell: Math.max(4, Math.round(staffSpace / 2)), radius: 3 } : {}), noiseLag: Math.max(1, scale) });
  timings.flatten = now() - t0;
  t0 = now();
  // Enlarging hides noise from the estimate on the normalised page; the capture's own noise counts too.
  const noise = Math.max(flat.noise, scale > 1 ? sourceNoise / Math.sqrt(scale) : sourceNoise * Math.min(1, scale));
  const binary = binarizeSymbols(flat, staffSpace, noise);
  // In the normalised page the staff lines are level, so they can be averaged over a long stretch.
  const noisy = isNoisy(flat, noise);
  const lineBinary = noisy ? binarizeLines(flat, staffSpace, 0, 1.0, noise) : binary;
  // Only on really rough captures: the smoothing costs precision in the stroke widths.
  const rough2 = noise >= 5 || flat.contrast < 0.4;
  const strokeBinary = rough2 && staffSpace > 0 ? binarizeStrokes(flat, staffSpace, 0.5, noise) : binary;
  timings.binarize = now() - t0;

  return {
    source,
    gray: flat.image,
    binary,
    lineBinary,
    strokeBinary,
    mesh,
    correction,
    staffSpace,
    sourceStaffSpace,
    tabRatio,
    scale,
    skew,
    noise,
    contrast: flat.contrast,
    offPage: flat.offPage,
    distortion,
    roughStaves,
    timings,
  };
}
