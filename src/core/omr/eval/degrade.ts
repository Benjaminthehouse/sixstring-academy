/**
 * Degradation model: turns a clean rendered page into a simulated flatbed scan or phone photo,
 * and moves the ground truth through the same geometry so every box and staff line still matches.
 * Pure and seeded: the same (image, tier, seed) always gives the same picture.
 *
 * Geometry (clean -> degraded): page curl (smooth vertical bow plus a little horizontal squeeze),
 * then one homography that combines rotation, perspective, down-scaling and the margin.
 * Photometry: optical blur, show-through of the back side, speckle, paper tint and ink density,
 * uneven illumination (gradient + soft shadow), sensor noise, JPEG-like 8x8 block quantisation.
 */
import { type GrayImage, type Point, gaussianBlur, rgbaToGray } from '../image/gray';
import { applyHomography, homographyFromPoints, invert3, meshFromFunction, warpGray } from '../image/warp';
import { type GroundTruth, transformTruth } from './truth';

export type DegradeTier = 'clean' | 'scan' | 'photo-good' | 'photo-bad';

/** All tiers, mildest first. */
export const TIERS: DegradeTier[] = ['clean', 'scan', 'photo-good', 'photo-bad'];

/** Every knob of the model. Lengths marked "sp" are in staff spaces of the clean page. */
export interface DegradeParams {
  /** Rotation in degrees (positive = clockwise). */
  rotation: number;
  /** Largest corner displacement as a fraction of the page's short side. */
  perspective: number;
  /** Amplitude of the vertical bow as a fraction of the page height. */
  curl: number;
  /** Output px per input px (below 1 = lower capture resolution). */
  scale: number;
  /** Border around the page as a fraction of its short side. */
  margin: number;
  /** Optical blur, Gaussian sigma in sp. */
  blur: number;
  /** Sensor noise, sigma in grey levels. */
  noise: number;
  /** Paper and ink colour. */
  paper: [number, number, number];
  ink: [number, number, number];
  /** Ink density 0..1 (1 = full black ink). */
  contrast: number;
  /** Brightness falloff across the page, 0..1. */
  gradient: number;
  /** Strength of a soft shadow over part of the page, 0..1. */
  shadow: number;
  /** JPEG quality 1..100 (100 = no block artefacts). */
  jpeg: number;
  /** Specks per megapixel. */
  speckle: number;
  /** Strength of the mirrored back-side image, 0..1. */
  showThrough: number;
  /** Show a dark desk around the page. */
  desk: boolean;
}

/** Result of {@link degrade}. */
export interface Degraded {
  width: number;
  height: number;
  /** The simulated capture as RGBA (what a canvas would give the reader). */
  rgba: Uint8ClampedArray;
  /** Its luma. */
  gray: GrayImage;
  /** The ground truth in the coordinates of the degraded image (null when none was given). */
  truth: GroundTruth | null;
  params: DegradeParams;
  /** Clean px -> degraded px. */
  forward: (p: Point) => Point;
  /** Degraded px -> clean px. */
  backward: (p: Point) => Point;
}

/** Seeded generator with uniform and normal variates. */
export class Rng {
  private a: number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Standard normal. */
  normal(): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    while (u < 1e-12) u = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    const th = 2 * Math.PI * this.next();
    this.spare = r * Math.sin(th);
    return r * Math.cos(th);
  }
}

/** Stable 32-bit hash of a string (to derive per-fixture seeds). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Draw the parameters of a tier. */
export function tierParams(tier: DegradeTier, rnd: Rng): DegradeParams {
  const sign = (): number => (rnd.next() < 0.5 ? -1 : 1);
  switch (tier) {
    case 'clean':
      return { rotation: 0, perspective: 0, curl: 0, scale: 1, margin: 0, blur: 0, noise: 0, paper: [255, 255, 255], ink: [0, 0, 0], contrast: 1, gradient: 0, shadow: 0, jpeg: 100, speckle: 0, showThrough: 0, desk: false };
    case 'scan': {
      const g = rnd.range(228, 250);
      return {
        rotation: sign() * rnd.range(0.2, 1.6), perspective: 0, curl: 0, scale: 1, margin: rnd.range(0.005, 0.02),
        blur: rnd.range(0.03, 0.06), noise: rnd.range(1.5, 4), paper: [g, g - rnd.range(0, 4), g - rnd.range(2, 10)], ink: [25, 25, 30],
        contrast: rnd.range(0.85, 1), gradient: rnd.range(0, 0.04), shadow: 0, jpeg: rnd.next() < 0.5 ? 100 : rnd.range(75, 92),
        speckle: rnd.range(20, 80), showThrough: rnd.range(0, 0.06), desk: false,
      };
    }
    case 'photo-good': {
      const g = rnd.range(215, 240);
      return {
        rotation: sign() * rnd.range(0.3, 2.5), perspective: rnd.range(0.01, 0.03), curl: rnd.range(0, 0.004), scale: rnd.range(0.9, 1), margin: rnd.range(0.015, 0.035),
        blur: rnd.range(0.05, 0.09), noise: rnd.range(2.5, 5), paper: [g, g - rnd.range(2, 8), g - rnd.range(8, 22)], ink: [35, 33, 38],
        contrast: rnd.range(0.75, 0.95), gradient: rnd.range(0.08, 0.2), shadow: rnd.range(0, 0.12), jpeg: rnd.range(70, 90),
        speckle: rnd.range(5, 30), showThrough: rnd.range(0, 0.03), desk: false,
      };
    }
    default: {
      const g = rnd.range(190, 230);
      return {
        rotation: sign() * rnd.range(1.5, 5), perspective: rnd.range(0.03, 0.07), curl: rnd.range(0.004, 0.012), scale: rnd.range(0.75, 0.95), margin: rnd.range(0.03, 0.06),
        blur: rnd.range(0.09, 0.16), noise: rnd.range(5, 9), paper: [g, g - rnd.range(4, 12), g - rnd.range(12, 30)], ink: [45, 42, 48],
        contrast: rnd.range(0.55, 0.8), gradient: rnd.range(0.2, 0.4), shadow: rnd.range(0.15, 0.35), jpeg: rnd.range(40, 65),
        speckle: rnd.range(10, 50), showThrough: rnd.range(0, 0.04), desk: rnd.next() < 0.5,
      };
    }
  }
}

// Standard JPEG luminance quantisation table (quality 50).
const Q50 = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

/** Quantise the 8x8 block DCT of a float luma plane in place, like a JPEG of the given quality would. */
function jpegBlocks(luma: Float32Array, w: number, h: number, quality: number): void {
  const q = Math.max(1, Math.min(99, quality));
  const s = q < 50 ? 5000 / q : 200 - 2 * q;
  const table = Q50.map((v) => Math.max(1, Math.min(255, Math.floor((v * s + 50) / 100))));
  const cosT = new Float32Array(64);
  for (let k = 0; k < 8; k++) for (let n = 0; n < 8; n++) cosT[k * 8 + n] = Math.cos(((2 * n + 1) * k * Math.PI) / 16) * (k === 0 ? Math.SQRT1_2 : 1) * 0.5;
  const block = new Float32Array(64);
  const tmp = new Float32Array(64);
  for (let by = 0; by + 8 <= h; by += 8) {
    for (let bx = 0; bx + 8 <= w; bx += 8) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) block[y * 8 + x] = luma[(by + y) * w + bx + x] - 128;
      // Forward DCT: rows then columns.
      for (let y = 0; y < 8; y++) for (let k = 0; k < 8; k++) {
        let a = 0;
        for (let n = 0; n < 8; n++) a += block[y * 8 + n] * cosT[k * 8 + n];
        tmp[y * 8 + k] = a;
      }
      for (let x = 0; x < 8; x++) for (let k = 0; k < 8; k++) {
        let a = 0;
        for (let n = 0; n < 8; n++) a += tmp[n * 8 + x] * cosT[k * 8 + n];
        block[k * 8 + x] = Math.round(a / table[k * 8 + x]) * table[k * 8 + x];
      }
      // Inverse.
      for (let x = 0; x < 8; x++) for (let n = 0; n < 8; n++) {
        let a = 0;
        for (let k = 0; k < 8; k++) a += block[k * 8 + x] * cosT[k * 8 + n];
        tmp[n * 8 + x] = a;
      }
      for (let y = 0; y < 8; y++) for (let n = 0; n < 8; n++) {
        let a = 0;
        for (let k = 0; k < 8; k++) a += tmp[y * 8 + k] * cosT[k * 8 + n];
        luma[(by + y) * w + bx + n] = a + 128;
      }
    }
  }
}

/**
 * Degrade a clean page. `spec` is a tier name (parameters drawn from `seed`) or explicit
 * parameters. `staffSpace` (px of the clean page) scales the blur; it is taken from the truth
 * when one is given.
 */
export function degrade(clean: GrayImage, truth: GroundTruth | null, spec: DegradeTier | DegradeParams, seed = 1, staffSpace?: number): Degraded {
  const rnd = new Rng(seed);
  const params = typeof spec === 'string' ? tierParams(spec, rnd) : spec;
  const W = clean.width;
  const H = clean.height;
  const sp = staffSpace ?? truth?.staffSpace ?? 10;
  const identity = params.rotation === 0 && params.perspective === 0 && params.curl === 0 && params.scale === 1 && params.margin === 0;
  const photometricOff = params.blur === 0 && params.noise === 0 && params.contrast === 1 && params.gradient === 0 && params.shadow === 0 &&
    params.jpeg >= 100 && params.speckle === 0 && params.showThrough === 0 && params.paper[0] === 255 && params.paper[1] === 255 && params.paper[2] === 255;
  if (identity && photometricOff) {
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      rgba[j] = rgba[j + 1] = rgba[j + 2] = clean.data[i];
      rgba[j + 3] = 255;
    }
    const id = (p: Point): Point => ({ x: p.x, y: p.y });
    return { width: W, height: H, rgba, gray: { width: W, height: H, data: clean.data.slice() }, truth, params, forward: id, backward: id };
  }

  // ---- geometry -----------------------------------------------------------------------------
  const short = Math.min(W, H);
  const curlA = params.curl * H * (rnd.next() < 0.5 ? -1 : 1);
  const curlK = rnd.range(0.6, 1.2);
  const curlPhi = rnd.range(0, 1);
  const curlB = rnd.range(-0.4, 0.4);
  const squeeze = params.curl > 0 ? rnd.range(-1, 1) * Math.min(0.03, params.curl * 3) : 0;
  const bow = (x: number): number => Math.sin(Math.PI * ((x / W) * curlK + curlPhi));
  const curlFwd = (p: Point): Point => {
    const g = curlA * bow(p.x);
    return { x: p.x + (squeeze * W * Math.sin((2 * Math.PI * p.x) / W)) / (2 * Math.PI), y: p.y + g * (1 + (curlB * p.y) / H) };
  };
  const curlInv = (p: Point): Point => {
    let x = p.x;
    if (squeeze !== 0) for (let i = 0; i < 8; i++) x = p.x - (squeeze * W * Math.sin((2 * Math.PI * x) / W)) / (2 * Math.PI);
    const g = curlA * bow(x);
    return { x, y: (p.y - g) / (1 + (g * curlB) / H) };
  };
  // Rotated, perspective-distorted, scaled quad that the page corners land on.
  const th = (params.rotation * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const corners: Point[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  let quad = corners.map((p) => {
    const dx = p.x - W / 2;
    const dy = p.y - H / 2;
    return {
      x: (W / 2 + c * dx - s * dy + rnd.range(-1, 1) * params.perspective * short) * params.scale,
      y: (H / 2 + s * dx + c * dy + rnd.range(-1, 1) * params.perspective * short) * params.scale,
    };
  });
  const m = params.margin * short * params.scale;
  const minX = Math.min(...quad.map((p) => p.x));
  const minY = Math.min(...quad.map((p) => p.y));
  quad = quad.map((p) => ({ x: p.x - minX + m, y: p.y - minY + m }));
  const outW = Math.max(8, Math.round(Math.max(...quad.map((p) => p.x)) + m));
  const outH = Math.max(8, Math.round(Math.max(...quad.map((p) => p.y)) + m));
  const G = homographyFromPoints(corners, quad);
  const Ginv = invert3(G) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const forward = (p: Point): Point => {
    const q = curlFwd(p);
    return applyHomography(G, q.x, q.y);
  };
  const backward = (p: Point): Point => {
    const q = applyHomography(Ginv, p.x, p.y);
    return curlInv(q);
  };

  // ---- resample -----------------------------------------------------------------------------
  const aa = params.scale < 0.92 ? 0.45 / params.scale : 0;
  const src = aa > 0 ? gaussianBlur(clean, aa) : clean;
  const cell = 12;
  const mesh = meshFromFunction(outW, outH, cell, (x, y) => backward({ x, y }));
  let warped = warpGray(src, mesh, { fill: 255 });
  const blurPx = params.blur * sp * params.scale;
  if (blurPx > 0.2) warped = gaussianBlur(warped, blurPx);
  const n = outW * outH;
  const ink = new Float32Array(n);
  for (let i = 0; i < n; i++) ink[i] = 1 - warped.data[i] / 255;

  // Distance to the paper edge (clean px, positive inside) on the mesh nodes; interpolating the
  // distance and clamping per pixel gives a smooth, slightly soft page edge.
  const inside = new Float32Array(mesh.cols * mesh.rows);
  for (let k = 0; k < inside.length; k++) inside[k] = Math.min(mesh.sx[k], W - mesh.sx[k], mesh.sy[k], H - mesh.sy[k]);
  const edgeSoft = Math.max(1.5, 0.25 * sp);
  const maskAt = (x: number, y: number): number => {
    const fx = (x + 0.5) / cell;
    const fy = (y + 0.5) / cell;
    const i = Math.min(mesh.cols - 2, Math.floor(fx));
    const j = Math.min(mesh.rows - 2, Math.floor(fy));
    const u = fx - i;
    const v = fy - j;
    const k = j * mesh.cols + i;
    const a = inside[k] + (inside[k + 1] - inside[k]) * u;
    const b = inside[k + mesh.cols] + (inside[k + mesh.cols + 1] - inside[k + mesh.cols]) * u;
    const d = (a + (b - a) * v) / edgeSoft + 0.5;
    return d <= 0 ? 0 : d >= 1 ? 1 : d;
  };

  // Show-through: the mirrored page, blurred and faint.
  if (params.showThrough > 0.004) {
    const back = gaussianBlur(warped, Math.max(1, 0.18 * sp * params.scale));
    for (let y = 0; y < outH; y++) {
      const o = y * outW;
      for (let x = 0; x < outW; x++) {
        const b = 1 - back.data[o + outW - 1 - x] / 255;
        ink[o + x] = 1 - (1 - ink[o + x]) * (1 - params.showThrough * b);
      }
    }
  }
  // Speckle: small dark specks, and a few light ones that eat ink.
  const specks = Math.round((params.speckle * n) / 1e6);
  for (let k = 0; k < specks; k++) {
    const cx = rnd.range(0, outW);
    const cy = rnd.range(0, outH);
    const r = rnd.range(0.4, 1.3) * Math.max(0.6, (sp * params.scale) / 10);
    const dark = rnd.next() < 0.8;
    const amp = rnd.range(0.4, 1);
    for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(outH - 1, Math.ceil(cy + r + 1)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(outW - 1, Math.ceil(cx + r + 1)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const wgt = Math.max(0, Math.min(1, r - d + 0.5)) * amp;
        if (wgt <= 0) continue;
        const i = y * outW + x;
        ink[i] = dark ? Math.max(ink[i], wgt) : ink[i] * (1 - wgt);
      }
    }
  }

  // ---- photometry ---------------------------------------------------------------------------
  const gAng = rnd.range(0, 2 * Math.PI);
  const gx = Math.cos(gAng);
  const gy = Math.sin(gAng);
  const sAng = rnd.range(0, 2 * Math.PI);
  const sxn = Math.cos(sAng);
  const syn = Math.sin(sAng);
  const sOff = rnd.range(-0.25, 0.25) * Math.max(outW, outH);
  const sSoft = rnd.range(0.03, 0.12) * Math.max(outW, outH);
  const diag = Math.hypot(outW, outH);
  const desk: [number, number, number] = [rnd.range(50, 90), rnd.range(40, 70), rnd.range(30, 60)];
  const luma = new Float32Array(n);
  const chroma = new Float32Array(n * 2); // offsets of R and B from luma
  const [pr, pg, pb] = params.paper;
  const [ir, ig, ib] = params.ink;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const i = y * outW + x;
      const a = ink[i] * params.contrast;
      let r = pr + (ir - pr) * a;
      let g = pg + (ig - pg) * a;
      let b = pb + (ib - pb) * a;
      if (params.desk) {
        const mk = maskAt(x, y);
        if (mk < 1) {
          r = desk[0] + (r - desk[0]) * mk;
          g = desk[1] + (g - desk[1]) * mk;
          b = desk[2] + (b - desk[2]) * mk;
        }
      }
      // Illumination: linear falloff, a soft-edged shadow, a touch of vignette.
      const t = ((x - outW / 2) * gx + (y - outH / 2) * gy) / diag + 0.5;
      let L = 1 - params.gradient * t;
      if (params.shadow > 0) {
        const d = (x - outW / 2) * sxn + (y - outH / 2) * syn - sOff;
        const u = Math.max(0, Math.min(1, d / (2 * sSoft) + 0.5));
        L *= 1 - params.shadow * u * u * (3 - 2 * u);
      }
      const yv = (0.299 * r + 0.587 * g + 0.114 * b) * L + rnd.normal() * params.noise;
      luma[i] = yv;
      chroma[2 * i] = (r - (0.299 * r + 0.587 * g + 0.114 * b)) * L + rnd.normal() * params.noise * 0.3;
      chroma[2 * i + 1] = (b - (0.299 * r + 0.587 * g + 0.114 * b)) * L + rnd.normal() * params.noise * 0.3;
    }
  }
  if (params.jpeg < 100) jpegBlocks(luma, outW, outH, params.jpeg);
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const yv = luma[i];
    const r = yv + chroma[2 * i];
    const b = yv + chroma[2 * i + 1];
    rgba[j] = r;
    rgba[j + 1] = (yv - 0.299 * r - 0.114 * b) / 0.587;
    rgba[j + 2] = b;
    rgba[j + 3] = 255;
  }
  return {
    width: outW,
    height: outH,
    rgba,
    gray: rgbaToGray(rgba, outW, outH),
    truth: truth ? transformTruth(truth, forward, { width: outW, height: outH }) : null,
    params,
    forward,
    backward,
  };
}
