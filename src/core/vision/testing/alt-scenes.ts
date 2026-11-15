/**
 * A second, independent scene generator for the fretboard camera.
 *
 * The production detector and tracker were built and tuned against one renderer (`render.ts`,
 * `guitar.ts`, `raster.ts`, `camera.ts`). This file draws the same kind of picture by a different
 * route on purpose, so that what the module learned about THAT renderer does not count as
 * knowledge about guitars. Nothing here imports from the first renderer or from `../geometry`;
 * the ground truth is computed here too, so the scoring does not lean on the module's own maths.
 *
 * How it differs, deliberately:
 *  - Camera: a full 3-D camera (rotation built from an off-normal tilt about an image axis plus a
 *    roll, not yaw/pitch Euler angles), an INVERSE radial model with k1 and k2 (distorted -> ideal
 *    pixel, no k2 in the first renderer), and real heights above the board: strings sit 1.5-6 mm
 *    above the wood, fret crowns 1.1 mm, a capo 8-10 mm, the body top 6 mm below. Under a tilted
 *    view the strings therefore shift against the frets and edges (parallax), which a flat
 *    renderer cannot show.
 *  - Rasterisation: every pixel is evaluated in neck-plane millimetres through the inverse
 *    homography at 2x supersampling (box-filtered down), and thin features (strings, fret wires,
 *    their shadows) are prefiltered with a Gaussian of the pixel footprint (erf pairs), instead of
 *    signed distance fields with one-pixel analytic coverage in image space.
 *  - Shading: a directional key light in board coordinates with Lambert + Blinn-Phong on
 *    cylindrical string and fret crowns, cast shadows of frets and strings (long under a grazing
 *    side light), coloured stage light, a veiling glare from a window.
 *  - Textures: precomputed tileable fBm and white-noise fields sampled bilinearly (wood grain
 *    stretched along the neck, pores, mottling, finger wear, oxidised frets).
 *  - Sensor: a filmic shoulder instead of a hard clip, Poisson-Gaussian noise plus low-frequency
 *    chroma blotches, 4:2:0 chroma subsampling and 4x4 luma block quantisation instead of 8x8
 *    blocks, rolling exposure flicker and interlaced fields.
 *  - Instruments the first renderer never draws: 7-string and 4-string bass necks, gold and black
 *    hardware, worn low-contrast frets, dull / coated / nylon strings; occluders it never draws:
 *    capos, sleeves, straps, a music-stand edge; distractors: a second guitar on the wall.
 *
 * Plain functions on typed arrays; deterministic for a (condition, seed, frame) triple.
 */
import type { Frame, Mat3, NeckModel, NeckPresetId, Point } from '../types';

// ---------------------------------------------------------------------------------------------
// Small maths, random numbers, textures
// ---------------------------------------------------------------------------------------------

/** sRGB-ish colour 0..255 per channel (converted to linear light internally). */
export type Rgb8 = readonly [number, number, number];
type V3 = [number, number, number];

/** sfc32: a small fast counter-based generator (not the mulberry32 of the first bench). */
export class AltRandom {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  /** Seed from any number of integers. */
  constructor(...seeds: number[]) {
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = 1;
    for (const s of seeds) {
      this.a ^= s | 0;
      this.b ^= Math.imul(s | 0, 0x85ebca6b);
      for (let i = 0; i < 6; i++) this.next();
    }
  }
  /** Uniform in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  /** One element. */
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length) % items.length];
  }
  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Signed value in [-a, a). */
  signed(a: number): number {
    return (this.next() * 2 - 1) * a;
  }
}

const TEX = 256;
const TEX_MASK = TEX - 1;
let smoothTex: Float32Array | null = null;
let whiteTex: Float32Array | null = null;
let gaussTable: Float32Array | null = null;

/** Tileable fBm (four octaves of lattice noise, smoothstep-interpolated), 0..1, built once. */
function smoothField(): Float32Array {
  if (smoothTex) return smoothTex;
  const out = new Float32Array(TEX * TEX);
  const rnd = new AltRandom(7177);
  let amp = 1;
  let total = 0;
  for (const cells of [8, 16, 32, 64]) {
    const lattice = new Float32Array(cells * cells);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rnd.next();
    const step = TEX / cells;
    for (let y = 0; y < TEX; y++) {
      const gy = y / step;
      const iy = Math.floor(gy);
      let fy = gy - iy;
      fy = fy * fy * (3 - 2 * fy);
      const y0 = iy % cells;
      const y1 = (iy + 1) % cells;
      for (let x = 0; x < TEX; x++) {
        const gx = x / step;
        const ix = Math.floor(gx);
        let fx = gx - ix;
        fx = fx * fx * (3 - 2 * fx);
        const x0 = ix % cells;
        const x1 = (ix + 1) % cells;
        const a = lattice[y0 * cells + x0] + (lattice[y0 * cells + x1] - lattice[y0 * cells + x0]) * fx;
        const b = lattice[y1 * cells + x0] + (lattice[y1 * cells + x1] - lattice[y1 * cells + x0]) * fx;
        out[y * TEX + x] += amp * (a + (b - a) * fy);
      }
    }
    total += amp;
    amp *= 0.55;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < out.length; i++) {
    out[i] /= total;
    lo = Math.min(lo, out[i]);
    hi = Math.max(hi, out[i]);
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  smoothTex = out;
  return out;
}

function whiteField(): Float32Array {
  if (whiteTex) return whiteTex;
  const out = new Float32Array(TEX * TEX);
  const rnd = new AltRandom(31337);
  for (let i = 0; i < out.length; i++) out[i] = rnd.next();
  whiteTex = out;
  return out;
}

function gaussField(): Float32Array {
  if (gaussTable) return gaussTable;
  const out = new Float32Array(1 << 16);
  const rnd = new AltRandom(4242);
  for (let i = 0; i < out.length; i += 2) {
    const u = Math.max(1e-12, rnd.next());
    const v = rnd.next();
    const r = Math.sqrt(-2 * Math.log(u));
    out[i] = r * Math.cos(2 * Math.PI * v);
    out[i + 1] = r * Math.sin(2 * Math.PI * v);
  }
  gaussTable = out;
  return out;
}

/** Bilinear sample of the smooth field at texel coordinates (wraps). */
function smooth(u: number, v: number): number {
  const t = smoothTex as Float32Array;
  const fu = Math.floor(u);
  const fv = Math.floor(v);
  const au = u - fu;
  const av = v - fv;
  const x0 = fu & TEX_MASK;
  const y0 = fv & TEX_MASK;
  const x1 = (x0 + 1) & TEX_MASK;
  const y1 = (y0 + 1) & TEX_MASK;
  const a = t[y0 * TEX + x0] + (t[y0 * TEX + x1] - t[y0 * TEX + x0]) * au;
  const b = t[y1 * TEX + x0] + (t[y1 * TEX + x1] - t[y1 * TEX + x0]) * au;
  return a + (b - a) * av;
}

/** Nearest sample of the white field (wraps). */
function white(u: number, v: number): number {
  return (whiteTex as Float32Array)[(Math.floor(v) & TEX_MASK) * TEX + (Math.floor(u) & TEX_MASK)];
}

/** Gaussian CDF approximated by a smoothstep over +-2.2 sigma (|error| < 0.02): enough for a prefilter, and cheap. */
function phi(z: number): number {
  if (z <= -2.2) return 0;
  if (z >= 2.2) return 1;
  const t = (z + 2.2) / 4.4;
  return t * t * (3 - 2 * t);
}

/** Share of a band [-half, half] around the origin covered at offset d under a Gaussian of sigma s. */
function band(d: number, half: number, s: number): number {
  const ad = d < 0 ? -d : d;
  if (ad > half + 2.2 * s) return 0;
  return phi((half - d) / s) - phi((-half - d) / s);
}

/** x^64 by repeated squaring (a sharp specular lobe without Math.pow). */
function pow64(x: number): number {
  let y = x * x;
  y *= y;
  y *= y;
  y *= y;
  y *= y;
  return y * y;
}

function lin(c: Rgb8): V3 {
  return [Math.pow(c[0] / 255, 2.2), Math.pow(c[1] / 255, 2.2), Math.pow(c[2] / 255, 2.2)];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function invert3(m: readonly number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-300)) return null;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}

// ---------------------------------------------------------------------------------------------
// Scene description
// ---------------------------------------------------------------------------------------------

/** Families of instrument the generator can draw. */
export type AltNeckKind = 'steel' | 'electric' | 'classical' | 'seven' | 'bass';

/** True neck dimensions in mm (drawn; the tracker gets only what `hints` says). */
export interface AltNeck {
  kind: AltNeckKind;
  scaleLength: number;
  nutWidth: number;
  width12: number;
  spanNut: number;
  spanBridge: number;
  strings: number;
  frets: number;
  joinFret: number;
}

/** Materials of the instrument. */
export interface AltLook {
  board: 'rosewood' | 'ebony' | 'maple' | 'walnut' | 'richlite';
  /** 0..1 grain contrast (0.15 normal, 0.5 heavy). */
  grain: number;
  /** 0..1 finger wear and grime on the first seven frets. */
  wear: number;
  fretTone: 'nickel' | 'gold' | 'stainless' | 'oxidised';
  /** 0..1 specular strength of the fret crowns. */
  fretShine: number;
  fretWidth: number;
  inlays: 'dots' | 'small-dots' | 'none';
  binding: boolean;
  nut: 'bone' | 'black' | 'brass';
  hardware: 'chrome' | 'gold' | 'black';
  head: 'three' | 'inline' | 'slotted' | 'bass4';
  headColor: Rgb8;
  body: 'spruce' | 'sunburst' | 'black' | 'mahogany' | 'red';
  strings: 'bright' | 'dull' | 'coated' | 'nylon' | 'nickel' | 'bass';
}

/** Where the board is relative to the camera, and how it moves. */
export interface AltView {
  /** Projected length nut -> 12th fret as a fraction of the frame width, seen front-on. */
  spanFrac: number;
  /** Angle between the board normal and the optical axis, degrees. */
  tiltDeg: number;
  /** Direction of the tilt axis in the image, degrees (0 = horizontal axis: foreshortens across the neck; 90 = along it). */
  tiltAxisDeg: number;
  /** In-plane rotation; positive raises the headstock. */
  rollDeg: number;
  /** Fret (fractional) of the centre-line point placed at (u0, v0). */
  anchorFret: number;
  u0: number;
  v0: number;
  leftHanded: boolean;
  /** Bass side at the bottom of the picture (guitar upside down in the view). */
  bassDown: boolean;
  /** Frames at the start without any motion (lock + jitter); then a slow sway. */
  stillFrames: number;
  swayRollDeg: number;
  swayPx: number;
  swayTiltDeg: number;
  swayPeriodS: number;
}

/** The fretting hand: index finger over `cell`, fingertips on (cell, string). */
export interface AltHand {
  cell: number;
  fingers: { cell: number; string: number }[];
  thumb: boolean;
  skin: Rgb8;
}

/** A capo just behind wire `fret`. */
export interface AltCapo {
  fret: number;
  style: 'trigger' | 'clamp' | 'elastic';
  color: Rgb8;
  /** Which edge the clamp / lever sticks out of. */
  side: 'bass' | 'treble';
}

/** Things in front of the guitar. */
export type AltOccluder =
  | { kind: 'sleeve'; color: Rgb8; pattern: 'plain' | 'rib' | 'check'; reachMm: number }
  | { kind: 'strap'; color: Rgb8; stripe: Rgb8; widthMm: number }
  | { kind: 'stand'; fret: number; angleDeg: number; widthPx: number; color: Rgb8 }
  | { kind: 'pick-arm'; skin: Rgb8; sleeve: Rgb8 | null };

/** What is behind the guitar. */
export interface AltBackdrop {
  kind: 'wall' | 'window' | 'stage' | 'keyboard' | 'bookshelf' | 'blinds' | 'radiator' | 'shirt' | 'wall-guitar';
  wall: Rgb8;
  seed: number;
  /** A player's torso (and head) behind the guitar. */
  person: { shirt: Rgb8; stripes: { color: Rgb8; periodPx: number; angleDeg: number } | null; skin: Rgb8 } | null;
  /** Distractors are drawn this big (fraction of the frame width) and tilted this much. */
  distractorSpan: number;
  distractorTiltDeg: number;
}

/** Scene light. */
export interface AltLight {
  /** Direction toward the light in board coordinates (x along the neck toward the bridge, y toward the treble edge, z out of the face). */
  dir: V3;
  key: number;
  ambient: number;
  keyColor: Rgb8;
  ambientColor: Rgb8;
  /** Brightness ramp over the frame (fraction), its direction (deg), and vignetting. */
  ramp: number;
  rampDeg: number;
  vignette: number;
  /** Coloured stage light: two colours blended across the frame. */
  stage: { a: Rgb8; b: Rgb8; angleDeg: number } | null;
}

/** The camera and its sensor. */
export interface AltCamera {
  fovDeg: number;
  /** Inverse radial distortion (distorted -> ideal), relative to the half diagonal. Positive = barrel. */
  k1: number;
  k2: number;
  /** Lens blur (Gaussian sigma, output pixels). */
  psf: number;
  exposure: number;
  /** Shot noise (variance per unit signal), read noise (sigma), low-frequency chroma blotches (sigma). */
  shot: number;
  read: number;
  blotch: number;
  /** 4x4 luma block quantisation step (0 = none) and 4:2:0 chroma. */
  quant: number;
  chroma: boolean;
  /** Odd rows show the scene this many seconds earlier (0 = progressive). */
  interlaceS: number;
  /** Rolling exposure flicker: amplitude (fraction) and band period in rows. */
  flicker: number;
  flickerRows: number;
  /** The frame handed to the tracker is a mirror image (selfie preview drawn into it). */
  mirrored: boolean;
  /** White balance multipliers. */
  balance: V3;
}

/** What the tracker is told (the settings a learner would have chosen). */
export interface AltHints {
  model: NeckPresetId | NeckModel;
  bassSideUp: boolean;
  mirrored: boolean;
  leftHanded: boolean;
}

/** One alt-bench scene: plain data, fully determines every frame. */
export interface AltSpec {
  condition: string;
  seed: number;
  width: number;
  height: number;
  /** Null: no guitar in view (false-lock test). */
  neck: AltNeck | null;
  look: AltLook;
  view: AltView;
  hand: AltHand | null;
  capo: AltCapo | null;
  occluders: AltOccluder[];
  backdrop: AltBackdrop;
  light: AltLight;
  camera: AltCamera;
  hints: AltHints;
}

/** Ground truth of one rendered frame. */
export interface AltTruth {
  width: number;
  height: number;
  /** Board plane (z = 0) mm -> ideal (undistorted, unmirrored) pixel; null without a guitar. */
  H: Mat3 | null;
  Hinv: Mat3 | null;
  k1: number;
  k2: number;
  mirrored: boolean;
  /** The true neck as a `NeckModel` (preset 'custom'), null without a guitar. */
  model: NeckModel | null;
  capoFret: number | null;
  /** The nut's middle is inside the frame and not hidden by a strap. */
  nutInFrame: boolean;
  /** Wires whose centre-line point is inside the frame. */
  visible: { min: number; max: number };
  /** The guitar has not moved since the previous frame. */
  still: boolean;
  /** Projected string spacing (px) at the middle of the visible board, and the camera's angle off the board normal (deg). */
  stringSpacingPx: number;
  offNormalDeg: number;
  /** Camera centre in board coordinates (mm, z out of the face), for the parallax of raised strings. */
  camera: [number, number, number] | null;
  /** Height of the strings above the board at the nut and at the saddle, mm (they rise linearly between). */
  stringHeight: [number, number];
}

/** Heights (mm above the wood) of the strings at the nut and the saddle, and of the fret crowns. */
export function altStringHeights(kind: AltNeckKind): [number, number] {
  return [1.5, kind === 'classical' ? 7.5 : kind === 'bass' ? 7 : 5.8];
}

/** Height of the fret crowns above the wood, mm. */
export const ALT_FRET_HEIGHT = 1.1;

// ---------------------------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------------------------

interface Cam {
  f: number;
  cx: number;
  cy: number;
  /** Row-major rotation whose columns are the board axes in camera coordinates (may be a reflection for a left-handed guitar). */
  R: number[];
  t: V3;
  /** Camera centre in board coordinates. */
  C: V3;
  /** Plane homography (row-major) and its inverse, normalised so that w > 0 in front. */
  H: number[];
  Hi: number[];
  k1: number;
  k2: number;
  norm: number;
  width: number;
  height: number;
}

function rotAxis(ax: V3, ang: number): number[] {
  const [x, y, z] = ax;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}

function mul3(a: readonly number[], b: readonly number[]): number[] {
  const o = new Array<number>(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

function fretPos(neck: AltNeck, n: number): number {
  return neck.scaleLength * (1 - Math.pow(2, -n / 12));
}

/** Build the camera for a view at time `tS` seconds into the sequence. */
function buildCam(spec: AltSpec, tS: number): Cam {
  const { width: W, height: Hh, view: v, camera: cam } = spec;
  const neck = spec.neck ?? fallbackNeck();
  const moving = Math.max(0, tS - v.stillFrames / 30);
  const ph = (2 * Math.PI * moving) / Math.max(0.2, v.swayPeriodS);
  const roll = v.rollDeg + (moving > 0 ? v.swayRollDeg * Math.sin(ph) : 0);
  const tilt = Math.max(0, v.tiltDeg + (moving > 0 ? v.swayTiltDeg * Math.sin(ph * 0.7 + 1) : 0));
  const f = W / 2 / Math.tan((cam.fovDeg * Math.PI) / 360);
  // Canonical: neck x toward image left (right-handed, true image), y down, face toward the camera.
  const sx = v.leftHanded ? 1 : -1;
  let R = [sx, 0, 0, 0, 1, 0, 0, 0, -1];
  if (v.bassDown) R = mul3([-1, 0, 0, 0, -1, 0, 0, 0, 1], R);
  const axisAng = (v.tiltAxisDeg * Math.PI) / 180;
  R = mul3(rotAxis([Math.cos(axisAng), Math.sin(axisAng), 0], (tilt * Math.PI) / 180), R);
  // Raising the headstock: it is on the right for a right-handed player (left for a left-handed one).
  const rollRad = ((v.leftHanded !== v.bassDown ? 1 : -1) * roll * Math.PI) / 180;
  R = mul3([Math.cos(rollRad), -Math.sin(rollRad), 0, Math.sin(rollRad), Math.cos(rollRad), 0, 0, 0, 1], R);
  const reference = Math.min(W, 1.6 * Hh) === W ? W : Math.max(W, Hh);
  const Z = (f * (neck.scaleLength / 2)) / (v.spanFrac * reference);
  const u0 = v.u0 * W + (moving > 0 ? v.swayPx * Math.sin(ph + 0.6) : 0);
  const v0 = v.v0 * Hh + (moving > 0 ? 0.5 * v.swayPx * Math.sin(ph * 1.3) : 0);
  const ax = fretPos(neck, v.anchorFret);
  const ay = neck.nutWidth / 2;
  const target: V3 = [((u0 - W / 2) * Z) / f, ((v0 - Hh / 2) * Z) / f, Z];
  const t: V3 = [target[0] - R[0] * ax - R[1] * ay, target[1] - R[3] * ax - R[4] * ay, target[2] - R[6] * ax - R[7] * ay];
  const cx = W / 2;
  const cy = Hh / 2;
  const H = [f * R[0] + cx * R[6], f * R[1] + cx * R[7], f * t[0] + cx * t[2], f * R[3] + cy * R[6], f * R[4] + cy * R[7], f * t[1] + cy * t[2], R[6], R[7], t[2]];
  let Hi = invert3(H) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // Normalise the inverse so that pixels whose ray meets the board in front of the camera get w > 0.
  const probe = [H[0] * ax + H[1] * ay + H[2], H[3] * ax + H[4] * ay + H[5], H[6] * ax + H[7] * ay + H[8]];
  const wProbe = Hi[6] * (probe[0] / probe[2]) + Hi[7] * (probe[1] / probe[2]) + Hi[8];
  if (wProbe < 0) Hi = Hi.map((x) => -x);
  const C: V3 = [-(R[0] * t[0] + R[3] * t[1] + R[6] * t[2]), -(R[1] * t[0] + R[4] * t[1] + R[7] * t[2]), -(R[2] * t[0] + R[5] * t[1] + R[8] * t[2])];
  return { f, cx, cy, R, t, C, H, Hi, k1: cam.k1, k2: cam.k2, norm: Math.sqrt(W * W + Hh * Hh) / 2, width: W, height: Hh };
}

function fallbackNeck(): AltNeck {
  return { kind: 'steel', scaleLength: 645, nutWidth: 43, width12: 54, spanNut: 36, spanBridge: 54, strings: 6, frets: 20, joinFret: 14 };
}

/** Ideal (undistorted) pixel -> distorted pixel (Newton on the radius). */
function distort(cam: Pick<Cam, 'k1' | 'k2' | 'cx' | 'cy' | 'norm'>, ux: number, uy: number): Point {
  if (cam.k1 === 0 && cam.k2 === 0) return { x: ux, y: uy };
  const dx = (ux - cam.cx) / cam.norm;
  const dy = (uy - cam.cy) / cam.norm;
  const ru = Math.sqrt(dx * dx + dy * dy);
  if (ru < 1e-9) return { x: ux, y: uy };
  let r = ru;
  for (let i = 0; i < 12; i++) {
    const r2 = r * r;
    const g = r * (1 + cam.k1 * r2 + cam.k2 * r2 * r2) - ru;
    const dg = 1 + 3 * cam.k1 * r2 + 5 * cam.k2 * r2 * r2;
    r -= g / dg;
  }
  const s = r / ru;
  return { x: cam.cx + dx * s * cam.norm, y: cam.cy + dy * s * cam.norm };
}

/** Distorted pixel -> ideal pixel. */
function undistort(k1: number, k2: number, cx: number, cy: number, norm: number, px: number, py: number): Point {
  if (k1 === 0 && k2 === 0) return { x: px, y: py };
  const dx = (px - cx) / norm;
  const dy = (py - cy) / norm;
  const r2 = dx * dx + dy * dy;
  const g = 1 + k1 * r2 + k2 * r2 * r2;
  return { x: cx + dx * g * norm, y: cy + dy * g * norm };
}

/** A 3-D board point (mm, z out of the face) -> distorted, unmirrored pixel; null behind the camera. */
function project(cam: Cam, x: number, y: number, z: number): Point | null {
  const R = cam.R;
  const X = R[0] * x + R[1] * y + R[2] * z + cam.t[0];
  const Y = R[3] * x + R[4] * y + R[5] * z + cam.t[1];
  const Z = R[6] * x + R[7] * y + R[8] * z + cam.t[2];
  if (!(Z > 1)) return null;
  return distort(cam, (cam.f * X) / Z + cam.cx, (cam.f * Y) / Z + cam.cy);
}

/** Pixels per mm at a board point (for sizing image-space shapes). */
function pxPerMm(cam: Cam, x: number, y: number, z: number): number {
  const R = cam.R;
  const Z = R[6] * x + R[7] * y + R[8] * z + cam.t[2];
  return Z > 1 ? cam.f / Z : 0;
}

// ---------------------------------------------------------------------------------------------
// The guitar, evaluated in neck-plane millimetres
// ---------------------------------------------------------------------------------------------

const BOARD_COLOR: Record<AltLook['board'], Rgb8> = {
  rosewood: [88, 52, 38],
  ebony: [36, 31, 30],
  maple: [222, 184, 128],
  walnut: [104, 72, 50],
  richlite: [28, 28, 30],
};

const FRET_COLOR: Record<AltLook['fretTone'], Rgb8> = {
  nickel: [178, 176, 168],
  gold: [214, 176, 92],
  stainless: [200, 202, 204],
  oxidised: [118, 104, 88],
};

const HARDWARE: Record<AltLook['hardware'], Rgb8> = {
  chrome: [206, 208, 212],
  gold: [216, 178, 96],
  black: [30, 30, 32],
};

const BODY: Record<AltLook['body'], Rgb8> = {
  spruce: [222, 186, 128],
  sunburst: [196, 120, 46],
  black: [24, 24, 26],
  mahogany: [120, 62, 38],
  red: [168, 28, 30],
};

interface StringLook {
  radius: number;
  albedo: V3;
  spec: number;
  shininess: number;
  alpha: number;
}

function stringLooks(neck: AltNeck, look: AltLook): StringLook[] {
  const n = neck.strings;
  const out: StringLook[] = [];
  for (let s = 1; s <= n; s++) {
    const k = (s - 1) / Math.max(1, n - 1); // 0 treble .. 1 bass
    let d: number;
    let color: Rgb8;
    let spec = 0.9;
    let shin = 40;
    let alpha = 1;
    const wound = look.strings === 'nylon' ? k > 0.45 : look.strings === 'bass' ? true : k > 0.3;
    if (look.strings === 'bass') {
      d = 1.05 + 1.3 * k;
      color = [172, 170, 164];
      spec = 0.5;
    } else if (look.strings === 'nylon') {
      d = wound ? 0.75 + 0.35 * k : 0.7 + 0.25 * k;
      color = wound ? [196, 196, 192] : [236, 232, 220];
      spec = wound ? 0.5 : 0.35;
      shin = 20;
      alpha = wound ? 1 : 0.62;
    } else {
      d = 0.25 + 0.95 * Math.pow(k, 1.2);
      if (n === 7) d = 0.25 + 1.2 * Math.pow(k, 1.2);
      color = wound ? (neck.kind === 'electric' || neck.kind === 'seven' ? [168, 166, 160] : [200, 152, 98]) : [214, 214, 214];
      if (look.strings === 'nickel') color = wound ? [162, 160, 154] : [210, 210, 210];
      if (look.strings === 'dull') {
        color = wound ? [104, 86, 64] : [128, 124, 116];
        spec = 0.15;
        shin = 8;
      } else if (look.strings === 'coated') {
        color = wound ? [182, 168, 140] : [196, 196, 194];
        spec = 0.22;
        shin = 10;
      }
    }
    out.push({ radius: d / 2, albedo: lin(color), spec, shininess: shin, alpha });
  }
  return out;
}

/** A shader for one guitar seen through one camera: (plane point + pixel footprint) -> colour. */
interface GuitarShader {
  /** Writes linear RGB into out[0..2] and coverage into out[3]; returns the material id under the point (0 = nothing), so edges between materials can be supersampled. */
  shade(X: number, Y: number, sx: number, sy: number, out: Float32Array): number;
  /** Plane bounding box of everything drawn. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function makeGuitarShader(neck: AltNeck, look: AltLook, light: AltLight, cam: Cam, capo: AltCapo | null, seed: number): GuitarShader {
  smoothField();
  whiteField();
  const rnd = new AltRandom(seed, 99);
  const L = neck.scaleLength;
  const n = neck.strings;
  const yc = neck.nutWidth / 2;
  const taper = (neck.width12 - neck.nutWidth) / (L / 2);
  const halfAt = (x: number): number => neck.nutWidth / 2 + (taper * x) / 2;
  const spanAt = (x: number): number => neck.spanNut + ((neck.spanBridge - neck.spanNut) * x) / L;
  const stringY = (s: number, x: number): number => yc + ((n - s) / Math.max(1, n - 1) - 0.5) * spanAt(x);
  const frets = new Float64Array(neck.frets + 2);
  for (let i = 0; i < frets.length; i++) frets[i] = fretPos(neck, i);
  const xEnd = frets[neck.frets] + rnd.range(5, 9);
  const xJoin = frets[Math.min(neck.frets, neck.joinFret)];
  const nutT = look.nut === 'brass' ? 4 : 5;
  const strings = stringLooks(neck, look);
  const [zNut, zSaddle] = altStringHeights(neck.kind);
  const zAt = (x: number): number => zNut + ((zSaddle - zNut) * clamp(x, 0, L)) / L;
  // Light.
  const Ld = light.dir;
  const Lnorm = Math.sqrt(Ld[0] * Ld[0] + Ld[1] * Ld[1] + Ld[2] * Ld[2]) || 1;
  const lx = Ld[0] / Lnorm;
  const ly = Ld[1] / Lnorm;
  const lz = Math.max(0.02, Ld[2] / Lnorm);
  const keyC = lin(light.keyColor);
  const ambC = lin(light.ambientColor);
  const key = light.key;
  const amb = light.ambient;
  const flatLit: V3 = [amb * ambC[0] + key * keyC[0] * lz, amb * ambC[1] + key * keyC[1] * lz, amb * ambC[2] + key * keyC[2] * lz];
  const shadowLit: V3 = [amb * ambC[0], amb * ambC[1], amb * ambC[2]];
  // Materials.
  const boardBase = lin(BOARD_COLOR[look.board]);
  const tone = rnd.range(0.8, 1.25);
  for (let i = 0; i < 3; i++) boardBase[i] *= tone * rnd.range(0.94, 1.06);
  const maple = look.board === 'maple';
  const wearColor = lin(maple ? [128, 104, 80] : [132, 104, 88]);
  const fretAlbedo = lin(FRET_COLOR[look.fretTone]);
  const fretSpec = look.fretShine;
  const fretHalf = look.fretWidth / 2;
  const fretH = ALT_FRET_HEIGHT;
  const inlayColor = lin(maple ? [30, 28, 26] : look.board === 'richlite' || look.board === 'ebony' ? [230, 228, 222] : [226, 220, 204]);
  const inlayR = look.inlays === 'small-dots' ? 2 : neck.kind === 'bass' ? 4 : 3;
  const bindingColor = lin([232, 222, 196]);
  const nutColor = lin(look.nut === 'bone' ? [236, 228, 206] : look.nut === 'black' ? [26, 26, 26] : [204, 164, 84]);
  const hw = lin(HARDWARE[look.hardware]);
  const headColor = lin(look.headColor);
  const neckSide = lin([96, 60, 40]);
  const bodyColor = lin(BODY[look.body]);
  const guardColor = lin(look.body === 'black' ? [236, 234, 228] : [70, 36, 24]);
  const capoColor = capo ? lin(capo.color) : ([0, 0, 0] as V3);
  const capoPad = lin([20, 20, 20]);
  // Inlays: centre x of every marked cell, 2 = double.
  const inlayKind = new Uint8Array(neck.frets + 2);
  if (look.inlays !== 'none') for (const f of [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]) if (f <= neck.frets) inlayKind[f] = f === 12 || f === 24 ? 2 : 1;
  // Head geometry.
  const head = look.head;
  const headLen = head === 'slotted' ? 190 : head === 'inline' ? 185 : head === 'bass4' ? 210 : 175;
  type Post = { x: number; y: number; r: number };
  const posts: Post[] = [];
  const stringEnds: { x: number; y: number }[] = new Array(n);
  if (head === 'three' || (head === 'slotted' && false)) {
    const side = Math.ceil(n / 2);
    for (let k = 0; k < side; k++) {
      const x = -nutT - 42 - 34 * k;
      posts.push({ x, y: yc - 25, r: 3 }, { x, y: yc + 25, r: 3 });
    }
    for (let s = 1; s <= n; s++) {
      const bassSide = s > n / 2;
      const k = bassSide ? s - Math.floor(n / 2) - 1 : s - 1;
      stringEnds[s - 1] = { x: -nutT - 42 - 34 * Math.min(side - 1, k), y: bassSide ? yc - 25 : yc + 25 };
    }
  } else if (head === 'inline' || head === 'bass4') {
    const step = head === 'bass4' ? 40 : 24;
    for (let s = n; s >= 1; s--) {
      const k = n - s;
      const p = { x: -nutT - 30 - step * k, y: yc - (head === 'bass4' ? 16 : 14), r: head === 'bass4' ? 5 : 3 };
      posts.push(p);
      stringEnds[s - 1] = { x: p.x, y: p.y };
    }
  } else {
    // Slotted: strings dive into the slots onto rollers.
    for (let s = 1; s <= n; s++) {
      const bassSide = s > n / 2;
      const k = bassSide ? s - Math.floor(n / 2) - 1 : s - 1;
      stringEnds[s - 1] = { x: -nutT - 50 - 35 * k, y: bassSide ? yc - 12 : yc + 12 };
    }
  }
  const headHalf = (xp: number): { lo: number; hi: number } => {
    // xp: distance behind the nut.
    if (head === 'inline' || head === 'bass4') {
      const grow = clamp(xp / 60, 0, 1);
      const end = smoothstep(headLen - 30, headLen, xp);
      return { lo: yc - (neck.nutWidth / 2 + 1) - grow * (head === 'bass4' ? 34 : 28) * (1 - 0.4 * end), hi: yc + neck.nutWidth / 2 + 1 + 6 * clamp(xp / 30, 0, 1) - 8 * end };
    }
    const grow = clamp(xp / 32, 0, 1);
    const w = neck.nutWidth / 2 + 1 + grow * (head === 'slotted' ? 12 : 21);
    const endR = 16;
    const e = xp > headLen - endR ? Math.sqrt(Math.max(0, endR * endR - (xp - headLen + endR) ** 2)) - endR : 0;
    return { lo: yc - w - e, hi: yc + w + e };
  };
  // Body outline (plane coordinates at z = -6).
  const bodyKind = neck.kind === 'electric' || neck.kind === 'seven' || neck.kind === 'bass' ? 'solid' : neck.kind === 'classical' ? 'classical' : 'acoustic';
  const upperR = bodyKind === 'classical' ? 125 : bodyKind === 'acoustic' ? 140 : 160;
  const lowerR = bodyKind === 'classical' ? 175 : bodyKind === 'acoustic' ? 192 : 165;
  const upperX = xJoin + upperR;
  const lowerX = xJoin + (bodyKind === 'solid' ? 250 : upperR + 200);
  const holeX = xEnd + (bodyKind === 'classical' ? 46 : 56);
  const holeR = bodyKind === 'classical' ? 42 : 49;
  const bridgeX = L;
  const pickupX = neck.kind === 'bass' ? [L - 150, L - 55] : bodyKind === 'solid' ? [L - 165, L - 105, L - 45] : [];
  // Light along x and y for the shadows (mm of shadow per mm of height).
  const shX = lx / lz;
  const shY = ly / lz;
  // View direction helpers.
  const C = cam.C;
  const pv = { x: 0, y: 0 };
  const capoX = capo ? frets[capo.fret] - 0.32 * (frets[capo.fret] - frets[capo.fret - 1]) : 0;
  const capoHalfX = capo ? (capo.style === 'elastic' ? 6 : 7.5) : 0;
  const capoH = capo ? (capo.style === 'elastic' ? 6 : 9.5) : 0;
  const capoOut = capo ? (capo.style === 'trigger' ? 34 : capo.style === 'clamp' ? 16 : 4) : 0;
  const grainK = look.grain;
  const wearK = look.wear;
  const seedU = rnd.range(0, 256);
  const seedV = rnd.range(0, 256);

  const holeColor: V3 = [0.01, 0.008, 0.006];
  const rosetteColor = lin(bodyKind === 'classical' ? [180, 120, 60] : [40, 32, 26]);
  const rosetteTile = lin([60, 120, 90]);
  const bridgeColor = lin([46, 30, 24]);
  const saddleColor = lin([236, 230, 214]);
  const pickupColor = lin(look.hardware === 'black' ? [20, 20, 20] : [232, 228, 216]);
  const shade = (X: number, Y: number, sx: number, sy: number, out: Float32Array): number => {
    out[3] = 0;
    let mat = 0;
    // Parallax per mm of height and the view direction at this point.
    const dz = C[2];
    pv.x = (C[0] - X) / dz;
    pv.y = (C[1] - Y) / dz;
    // 1. The capo stands highest.
    if (capo) {
      for (let k = 0; k < 3; k++) {
        const h = capoH * (1 - k / 3);
        const qx = X + pv.x * h;
        const qy = Y + pv.y * h;
        if (Math.abs(qx - capoX) > capoHalfX) continue;
        const hx = halfAt(qx);
        const lo = yc - hx - 3 - (capo.side === 'bass' ? capoOut : 0);
        const hi = yc + hx + 3 + (capo.side === 'treble' ? capoOut : 0);
        if (qy < lo || qy > hi) continue;
        const onBoard = qy > yc - hx && qy < yc + hx;
        const top = k === 0;
        const c = capo.style === 'elastic' && onBoard ? capoPad : capoColor;
        const lit = top ? 0.6 + 0.4 * lz : 0.35;
        const sheen = top && capo.style !== 'elastic' ? 0.25 * Math.pow(Math.max(0, 1 - Math.abs(qx - capoX) / capoHalfX), 6) : 0;
        out[0] = c[0] * (flatLit[0] * lit + shadowLit[0] * 0.2) + sheen * keyC[0] * key;
        out[1] = c[1] * (flatLit[1] * lit + shadowLit[1] * 0.2) + sheen * keyC[1] * key;
        out[2] = c[2] * (flatLit[2] * lit + shadowLit[2] * 0.2) + sheen * keyC[2] * key;
        out[3] = 1;
        return 10;
      }
    }
    // 2. The base: board, nut, headstock, neck sides or body.
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    const half = halfAt(Math.max(0, X));
    const dyc = Y - yc;
    if (X >= 0 && X <= xEnd && Math.abs(dyc) <= half) {
      // Wood with grain stretched along the neck, pores and mottling.
      const warp = 3 * (smooth(X * 0.02 + seedU, Y * 0.04) - 0.5);
      const grain = smooth(X * 0.06 + seedU, (Y + warp) * 1.6 + seedV);
      const streak = smoothstep(0.62, 0.8, grain);
      const pore = white(X * 2.2 + seedU, Y * 2.2);
      const mottle = smooth(X * 0.012 + 40, Y * 0.05 + 90);
      let shadeW = 1 + grainK * (grain - 0.5) * 1.4 - grainK * 0.9 * streak + 0.08 * (pore - 0.5) + 0.16 * (mottle - 0.5);
      if (maple) shadeW = 1 + 0.35 * grainK * (grain - 0.5) + 0.03 * (pore - 0.5) + 0.08 * (mottle - 0.5);
      r = boardBase[0] * shadeW;
      g = boardBase[1] * shadeW;
      b = boardBase[2] * shadeW;
      // Finger wear on the first positions, under the strings.
      if (wearK > 0 && X < frets[Math.min(7, neck.frets)]) {
        const near = Math.abs(dyc) / Math.max(1, half);
        const fade = 1 - smoothstep(frets[3], frets[Math.min(7, neck.frets)], X);
        const spots = smooth(X * 0.25 + 7, Y * 0.35 + 3);
        const w = clamp(wearK * fade * (1 - near * 0.8) * (0.4 + spots), 0, 0.85);
        r += (wearColor[0] - r) * w;
        g += (wearColor[1] - g) * w;
        b += (wearColor[2] - b) * w;
      }
      // Inlays.
      if (inlayKind.length > 1 && look.inlays !== 'none') {
        const cell = Math.ceil(-12 * Math.log2(Math.max(1e-9, 1 - X / L)));
        if (cell >= 1 && cell < inlayKind.length && inlayKind[cell]) {
          const xm = (frets[cell - 1] + frets[cell]) / 2;
          const ex = X - xm;
          const off = inlayKind[cell] === 2 ? 0.25 * 2 * half : 0;
          const d1 = Math.sqrt(ex * ex + (dyc - off) ** 2);
          const d2 = Math.sqrt(ex * ex + (dyc + off) ** 2);
          if (Math.min(d1, d2) <= inlayR) {
            mat = 2;
            const pearl = 0.85 + 0.15 * smooth(X * 1.5, Y * 1.5);
            r = inlayColor[0] * pearl;
            g = inlayColor[1] * pearl * 0.98;
            b = inlayColor[2] * pearl * (0.96 + 0.06 * smooth(X * 2 + 5, Y));
          }
        }
      }
      // Binding.
      if (look.binding && Math.abs(dyc) > half - 1.4) {
        mat = 3;
        r = bindingColor[0];
        g = bindingColor[1];
        b = bindingColor[2];
      }
      // Light: shadows of frets (along x) and strings (across), then the albedo is lit.
      let shadow = 0;
      {
        const fn = -12 * Math.log2(Math.max(1e-9, 1 - X / L));
        const n0 = Math.max(1, Math.min(neck.frets, Math.round(fn)));
        for (let m = n0 - 1; m <= n0 + 1; m++) {
          if (m < 1 || m > neck.frets) continue;
          const xf = frets[m];
          // Shadow region on the side away from the light, length fretH * |shX|.
          const len = fretH * Math.abs(shX);
          if (len < 0.05) continue;
          const lo = shX >= 0 ? xf - fretHalf - len : xf + fretHalf;
          const hi = shX >= 0 ? xf - fretHalf : xf + fretHalf + len;
          const c = (lo + hi) / 2;
          const s = band(X - c, (hi - lo) / 2, Math.max(sx, 0.25 + 0.1 * len));
          shadow = Math.max(shadow, s);
        }
        const z = zAt(X);
        const ys = Y + shY * z;
        const xs = X + shX * z;
        const idx = Math.round(((ys - yc) / spanAt(xs) + 0.5) * (n - 1));
        const si = n - clamp(idx, 0, n - 1);
        const st = strings[si - 1];
        const s = band(ys - stringY(si, xs), st.radius, Math.max(sy, 0.25 + 0.09 * z)) * st.alpha;
        shadow = Math.max(shadow, 0.85 * s);
      }
      const lr = flatLit[0] + (shadowLit[0] - flatLit[0]) * shadow;
      const lg = flatLit[1] + (shadowLit[1] - flatLit[1]) * shadow;
      const lb = flatLit[2] + (shadowLit[2] - flatLit[2]) * shadow;
      r *= lr;
      g *= lg;
      b *= lb;
      // Fret wires: crown at fretH above the board (parallax), prefiltered across their width.
      {
        const Xf = X + pv.x * fretH;
        const fn = -12 * Math.log2(Math.max(1e-9, 1 - Xf / L));
        const m = Math.max(1, Math.min(neck.frets, Math.round(fn)));
        const dx = Xf - frets[m];
        const cov = band(dx, fretHalf, sx);
        if (cov > 0.002) {
          const tt = clamp(dx / fretHalf, -1, 1);
          const nx = 0.92 * tt;
          const nz = Math.sqrt(1 - nx * nx);
          const vx = C[0] - X;
          const vy = C[1] - Y;
          const vz = C[2];
          const vl = Math.sqrt(vx * vx + vy * vy + vz * vz);
          const hx = lx + vx / vl;
          const hy = ly + vy / vl;
          const hz = lz + vz / vl;
          const hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
          const diff = Math.max(0, nx * lx + nz * lz);
          let worn = 1;
          if (wearK > 0 && m <= 7) {
            const under = Math.abs(((Y - yc) / spanAt(X) + 0.5) * (n - 1) - Math.round(((Y - yc) / spanAt(X) + 0.5) * (n - 1)));
            worn = 1 - wearK * 0.6 * (1 - smoothstep(0.1, 0.35, under));
          }
          const sp = fretSpec * worn * pow64(Math.max(0, (nx * hx + nz * hz) / hl)) * 3;
          const grime = 0.75 + 0.25 * smooth(m * 9.3, Y * 0.3);
          const fr = fretAlbedo[0] * grime * (amb * ambC[0] * (0.6 + 0.4 * nz) + key * keyC[0] * diff) + sp * key * keyC[0];
          const fg = fretAlbedo[1] * grime * (amb * ambC[1] * (0.6 + 0.4 * nz) + key * keyC[1] * diff) + sp * key * keyC[1];
          const fb = fretAlbedo[2] * grime * (amb * ambC[2] * (0.6 + 0.4 * nz) + key * keyC[2] * diff) + sp * key * keyC[2];
          const endFade = Math.abs(Y - yc) > half - 0.3 ? 0.4 : 1;
          const k = cov * endFade;
          r += (fr - r) * k;
          g += (fg - g) * k;
          b += (fb - b) * k;
        }
      }
      a = 1;
      if (mat === 0) mat = 1;
    } else if (X < 0 && X >= -nutT && Math.abs(dyc) <= neck.nutWidth / 2 + 0.5) {
      const top = 0.75 + 0.25 * smoothstep(-nutT, -nutT * 0.4, X);
      r = nutColor[0] * flatLit[0] * top;
      g = nutColor[1] * flatLit[1] * top;
      b = nutColor[2] * flatLit[2] * top;
      a = 1;
      mat = 4;
    } else if (X < -nutT && X > -nutT - headLen) {
      const xp = -nutT - X;
      const hh = headHalf(xp);
      // Tuner buttons stick out past the outline.
      let button = false;
      if (head === 'three') {
        for (const p of posts) {
          const side = p.y < yc ? -1 : 1;
          const by = p.y + side * 26;
          if (Math.abs(X - p.x) < 7 && Math.abs(Y - by) < 11) button = true;
          if (Math.abs(X - p.x) < 4 && Math.abs(Y - (p.y + side * 12)) < 7) button = true;
        }
      } else if (head === 'inline' || head === 'bass4') {
        for (const p of posts) if (Math.abs(X - p.x) < (head === 'bass4' ? 12 : 7) && Math.abs(Y - (p.y - 30)) < (head === 'bass4' ? 16 : 10)) button = true;
      } else if (head === 'slotted') {
        for (let k = 0; k < 3; k++) {
          const x = -nutT - 50 - 35 * k;
          if (Math.abs(X - x) < 6 && (Math.abs(Y - (yc - 45)) < 8 || Math.abs(Y - (yc + 45)) < 8)) button = true;
        }
      }
      if (button) {
        r = hw[0] * flatLit[0];
        g = hw[1] * flatLit[1];
        b = hw[2] * flatLit[2];
        a = 1;
        mat = 6;
      } else if (Y >= hh.lo && Y <= hh.hi) {
        const veneer = 0.9 + 0.2 * smooth(X * 0.05 + 11, Y * 0.3 + 4);
        r = headColor[0] * flatLit[0] * veneer;
        g = headColor[1] * flatLit[1] * veneer;
        b = headColor[2] * flatLit[2] * veneer;
        mat = 5;
        if (head === 'slotted') {
          const inSlot = xp > 30 && xp < 160 && Math.abs(Math.abs(dyc) - 12.5) < 6.5;
          if (inSlot) {
            mat = 6;
            r *= 0.12;
            g *= 0.12;
            b *= 0.12;
            for (let k = 0; k < 3; k++) {
              const rx = -nutT - 50 - 35 * k;
              if (Math.abs(X - rx) < 4) {
                mat = 7;
                const cyl = Math.sqrt(1 - ((X - rx) / 4) ** 2);
                r = 0.75 * flatLit[0] * cyl;
                g = 0.72 * flatLit[1] * cyl;
                b = 0.66 * flatLit[2] * cyl;
              }
            }
          }
        }
        for (const p of posts) {
          const d = Math.sqrt((X - p.x) ** 2 + (Y - p.y) ** 2);
          if (d < p.r + 2.5) {
            mat = 7;
            const ring = d > p.r ? 0.6 : 1;
            r = hw[0] * flatLit[0] * ring;
            g = hw[1] * flatLit[1] * ring;
            b = hw[2] * flatLit[2] * ring;
          }
        }
        a = 1;
      }
    } else if (X >= 0 && X < xJoin + 20 && Math.abs(dyc) <= half + 2.2) {
      // Edge of the neck past the board (the rounded neck shows a sliver of its side).
      r = neckSide[0] * flatLit[0] * 0.7;
      g = neckSide[1] * flatLit[1] * 0.7;
      b = neckSide[2] * flatLit[2] * 0.7;
      a = 1;
      mat = 8;
    }
    if (a === 0 && X > xJoin - 30) {
      // The body top, 6 mm below the board.
      const bx = X - 6 * pv.x;
      const by = Y - 6 * pv.y;
      const du = Math.sqrt((bx - upperX) ** 2 + (by - yc) ** 2);
      const dl = Math.sqrt((bx - lowerX) ** 2 + (by - yc) ** 2);
      const inWaist = bx > upperX && bx < lowerX && Math.abs(by - yc) < Math.min(upperR, lowerR) * 0.82;
      if (du <= upperR || dl <= lowerR || inWaist) {
        let c: V3 = bodyColor;
        let lit = 1;
        mat = 9;
        if (look.body === 'sunburst') {
          const edge = Math.max(1 - du / upperR, 1 - dl / lowerR);
          lit = 0.25 + 0.75 * smoothstep(0.02, 0.35, edge);
        }
        if (bodyKind !== 'solid') {
          const dh = Math.sqrt((bx - holeX) ** 2 + (by - yc) ** 2);
          if (dh < holeR) {
            c = holeColor;
            mat = 11;
          } else if (dh < holeR + 9) {
            c = rosetteColor;
            mat = 12;
            if (bodyKind === 'classical' && Math.floor((Math.atan2(by - yc, bx - holeX) + 4) * 18) % 2 === 0) c = rosetteTile;
          } else if (bodyKind === 'acoustic' && Math.sqrt(((bx - holeX - 70) / 70) ** 2 + ((by - yc - 62) / 42) ** 2) < 1) {
            c = guardColor;
            mat = 13;
          } else {
            const grainB = 0.92 + 0.12 * smooth(bx * 0.5 + 3, by * 0.02 + 8);
            lit *= grainB;
          }
          if (Math.abs(bx - bridgeX) < 14 && Math.abs(by - yc) < 75) {
            c = bridgeColor;
            mat = 14;
          }
          if (Math.abs(bx - (bridgeX + 3)) < 1.5 && Math.abs(by - yc) < 36) {
            c = saddleColor;
            mat = 15;
          }
        } else {
          if (Math.abs(by - yc) < 72 && bx > xJoin + 10 && bx < L + 70 && look.body !== 'black') {
            c = guardColor;
            mat = 13;
          }
          for (const px of pickupX) {
            if (Math.abs(bx - px) < (neck.kind === 'bass' ? 12 : 9) && Math.abs(by - yc) < 40) {
              c = pickupColor;
              mat = 16;
            }
          }
          if (Math.abs(bx - (bridgeX + 12)) < 14 && Math.abs(by - yc) < 36) {
            c = hw;
            mat = 14;
          }
        }
        r = c[0] * flatLit[0] * lit;
        g = c[1] * flatLit[1] * lit;
        b = c[2] * flatLit[2] * lit;
        a = 1;
      }
    }
    // 3. Strings, at their height above the board, over whatever is under them.
    const z = zAt(X);
    const xs = X + pv.x * z;
    const ys = Y + pv.y * z;
    if (xs >= -0.5 && xs <= L + 4) {
      const idx = Math.round(((ys - yc) / spanAt(xs) + 0.5) * (n - 1));
      if (idx >= -1 && idx <= n) {
        const si = n - clamp(idx, 0, n - 1);
        const st = strings[si - 1];
        const dy = ys - stringY(si, xs);
        const cov = band(dy, st.radius, sy) * st.alpha;
        if (cov > 0.003) {
          const tt = clamp(dy / st.radius, -1, 1);
          const ny = 0.95 * tt;
          const nz = Math.sqrt(1 - ny * ny);
          const vx = C[0] - X;
          const vy = C[1] - Y;
          const vz = C[2];
          const vl = Math.sqrt(vx * vx + vy * vy + vz * vz);
          const hx = lx + vx / vl;
          const hy = ly + vy / vl;
          const hz = lz + vz / vl;
          const hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
          const diff = Math.max(0, ny * ly + nz * lz);
          const sp = st.spec * Math.pow(Math.max(0, (ny * hy + nz * hz) / hl), st.shininess) * 2;
          const sr = st.albedo[0] * (amb * ambC[0] + key * keyC[0] * diff) + sp * key * keyC[0];
          const sg = st.albedo[1] * (amb * ambC[1] + key * keyC[1] * diff) + sp * key * keyC[1];
          const sb = st.albedo[2] * (amb * ambC[2] + key * keyC[2] * diff) + sp * key * keyC[2];
          if (a === 0) {
            r = sr;
            g = sg;
            b = sb;
            a = cov;
          } else {
            r += (sr - r) * cov;
            g += (sg - g) * cov;
            b += (sb - b) * cov;
          }
        }
      }
    } else if (xs < -0.5 && xs > -nutT - headLen) {
      // Behind the nut the strings run to the posts / rollers.
      let best = 0;
      let bestS = 0;
      for (let s = 1; s <= n; s++) {
        const e = stringEnds[s - 1];
        if (!e) continue;
        const ax = 0;
        const ay = stringY(s, 0);
        const ex = e.x - ax;
        const ey = e.y - ay;
        const tt = clamp(((xs - ax) * ex + (ys - ay) * ey) / (ex * ex + ey * ey), 0, 1);
        if (xs < e.x - 1) continue;
        const d = Math.sqrt((xs - ax - tt * ex) ** 2 + (ys - ay - tt * ey) ** 2);
        const cov = band(d, strings[s - 1].radius, Math.max(sx, sy)) * strings[s - 1].alpha;
        if (cov > best) {
          best = cov;
          bestS = s;
        }
      }
      if (best > 0.003 && a > 0) {
        const st = strings[bestS - 1];
        r += (st.albedo[0] * flatLit[0] - r) * best;
        g += (st.albedo[1] * flatLit[1] - g) * best;
        b += (st.albedo[2] * flatLit[2] - b) * best;
      }
    }
    if (a <= 0) return 0;
    out[0] = r;
    out[1] = g;
    out[2] = b;
    out[3] = a;
    return mat === 0 ? 17 : mat;
  };
  const bodyHalf = Math.max(upperR, lowerR) + 10;
  return { shade, x0: -nutT - headLen - 5, x1: Math.max(L + 80, lowerX + lowerR + 10), y0: yc - Math.max(bodyHalf, 75), y1: yc + Math.max(bodyHalf, 75) };
}

// ---------------------------------------------------------------------------------------------
// Image-space shapes (hand, sleeve, strap, stand, background objects): point-sampled at 2x
// ---------------------------------------------------------------------------------------------

interface Layer {
  /** Internal (supersampled) size. */
  w: number;
  h: number;
  /** Linear RGB, 3 floats per internal pixel. */
  rgb: Float32Array;
  /** Supersampling factor. */
  ss: number;
}

/** Fill a tapered capsule between two output-pixel points; `color(t, across)` gives the linear colour. */
function capsule(layer: Layer, a: Point, b: Point, ra: number, rb: number, color: (along: number, across: number, x: number, y: number) => V3): void {
  const s = layer.ss;
  const x0 = Math.max(0, Math.floor((Math.min(a.x - ra, b.x - rb) - 1) * s));
  const x1 = Math.min(layer.w - 1, Math.ceil((Math.max(a.x + ra, b.x + rb) + 1) * s));
  const y0 = Math.max(0, Math.floor((Math.min(a.y - ra, b.y - rb) - 1) * s));
  const y1 = Math.min(layer.h - 1, Math.ceil((Math.max(a.y + ra, b.y + rb) + 1) * s));
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const ll = ex * ex + ey * ey || 1;
  for (let py = y0; py <= y1; py++) {
    const y = (py + 0.5) / s;
    for (let px = x0; px <= x1; px++) {
      const x = (px + 0.5) / s;
      const t = clamp(((x - a.x) * ex + (y - a.y) * ey) / ll, 0, 1);
      const d = Math.sqrt((x - a.x - t * ex) ** 2 + (y - a.y - t * ey) ** 2);
      const rr = ra + (rb - ra) * t;
      if (d > rr) continue;
      const c = color(t, d / rr, x, y);
      const i = (py * layer.w + px) * 3;
      layer.rgb[i] = c[0];
      layer.rgb[i + 1] = c[1];
      layer.rgb[i + 2] = c[2];
    }
  }
}

/** Fill a convex polygon (output pixels). */
function polygon(layer: Layer, pts: Point[], color: (x: number, y: number) => V3): void {
  const s = layer.ss;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const x0 = Math.max(0, Math.floor(minX * s));
  const x1 = Math.min(layer.w - 1, Math.ceil(maxX * s));
  const y0 = Math.max(0, Math.floor(minY * s));
  const y1 = Math.min(layer.h - 1, Math.ceil(maxY * s));
  const m = pts.length;
  let area = 0;
  for (let i = 0; i < m; i++) area += pts[i].x * pts[(i + 1) % m].y - pts[(i + 1) % m].x * pts[i].y;
  const sign = area >= 0 ? 1 : -1;
  for (let py = y0; py <= y1; py++) {
    const y = (py + 0.5) / s;
    for (let px = x0; px <= x1; px++) {
      const x = (px + 0.5) / s;
      let inside = true;
      for (let i = 0; i < m && inside; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % m];
        if (sign * ((q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x)) < 0) inside = false;
      }
      if (!inside) continue;
      const c = color(x, y);
      const i = (py * layer.w + px) * 3;
      layer.rgb[i] = c[0];
      layer.rgb[i + 1] = c[1];
      layer.rgb[i + 2] = c[2];
    }
  }
}

/** Skin shading of a limb: darker toward the silhouette, a warm core. */
function skinShader(skin: V3, lit: number): (t: number, across: number) => V3 {
  return (_t, across) => {
    const k = lit * (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - across * across)));
    return [skin[0] * k * 1.04, skin[1] * k, skin[2] * k * 0.96];
  };
}

// ---------------------------------------------------------------------------------------------
// Background (cached per scene): wall, window, stage, distractors, the player
// ---------------------------------------------------------------------------------------------

/** A planar background object seen in perspective: unit square [0,1]^2 in its own coordinates. */
function planeHomography(W: number, H: number, cxF: number, cyF: number, spanPx: number, aspect: number, rollDeg: number, tiltDeg: number, tiltAxisDeg: number): number[] {
  // A rectangle of width spanPx (and height spanPx*aspect) centred at (cxF*W, cyF*H), turned and tilted.
  const f = W;
  const Z = 1000;
  const scale = (spanPx * Z) / f;
  let R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const ax = (tiltAxisDeg * Math.PI) / 180;
  R = mul3(rotAxis([Math.cos(ax), Math.sin(ax), 0], (tiltDeg * Math.PI) / 180), R);
  const ro = (rollDeg * Math.PI) / 180;
  R = mul3([Math.cos(ro), -Math.sin(ro), 0, Math.sin(ro), Math.cos(ro), 0, 0, 0, 1], R);
  const cx = W / 2;
  const cy = H / 2;
  // Plane point (u, v) in [0,1]^2 -> 3-D: scale * ((u - 0.5) r1 + (v - 0.5) * aspect * r2) + T.
  const T: V3 = [((cxF * W - cx) * Z) / f, ((cyF * H - cy) * Z) / f, Z];
  const r1: V3 = [R[0] * scale, R[3] * scale, R[6] * scale];
  const r2: V3 = [R[1] * scale * aspect, R[4] * scale * aspect, R[7] * scale * aspect];
  const t: V3 = [T[0] - 0.5 * r1[0] - 0.5 * r2[0], T[1] - 0.5 * r1[1] - 0.5 * r2[1], T[2] - 0.5 * r1[2] - 0.5 * r2[2]];
  const Hm = [f * r1[0] + cx * r1[2], f * r2[0] + cx * r2[2], f * t[0] + cx * t[2], f * r1[1] + cy * r1[2], f * r2[1] + cy * r2[2], f * t[1] + cy * t[2], r1[2], r2[2], t[2]];
  const inv = invert3(Hm) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const w = inv[6] * cxF * W + inv[7] * cyF * H + inv[8];
  return w < 0 ? inv.map((x) => -x) : inv;
}

function renderBackground(spec: AltSpec, cam: Cam, ss: number): Layer {
  smoothField();
  whiteField();
  const W = spec.width;
  const Hh = spec.height;
  const w = W * ss;
  const h = Hh * ss;
  const layer: Layer = { w, h, rgb: new Float32Array(w * h * 3), ss };
  const bd = spec.backdrop;
  const rnd = new AltRandom(bd.seed, 5);
  const wall = lin(bd.wall);
  const amb = spec.light.ambient + 0.6 * spec.light.key;
  const doorU = rnd.range(0.05, 0.95) * W;
  const doorW = rnd.range(0.12, 0.2) * W;
  const shelfV = rnd.range(0.12, 0.4) * Hh;
  const floorV = rnd.range(0.82, 1.1) * Hh;
  const trim = lin([236, 232, 222]);
  const floor = lin(rnd.pick<Rgb8>([[120, 84, 56], [90, 90, 96], [150, 120, 90]]));
  const winX0 = rnd.range(0.05, 0.35) * W;
  const winX1 = winX0 + rnd.range(0.35, 0.55) * W;
  const winY0 = rnd.range(-0.1, 0.1) * Hh;
  const winY1 = winY0 + rnd.range(0.55, 0.8) * Hh;
  const dist = bd.kind === 'keyboard' || bd.kind === 'bookshelf' || bd.kind === 'blinds' || bd.kind === 'radiator';
  const span = bd.distractorSpan * W;
  const aspect = bd.kind === 'keyboard' ? 0.13 : bd.kind === 'bookshelf' ? 0.7 : bd.kind === 'blinds' ? 0.9 : 0.45;
  const Pi = dist ? planeHomography(W, Hh, rnd.range(0.4, 0.6), rnd.range(0.4, 0.6), span, aspect, rnd.signed(25), bd.distractorTiltDeg, rnd.range(0, 180)) : null;
  const books: { u0: number; u1: number; top: number; c: V3 }[] = [];
  if (bd.kind === 'bookshelf') {
    for (let shelf = 0; shelf < 3; shelf++) {
      let u = 0.02;
      while (u < 0.98) {
        const wd = rnd.range(0.018, 0.045);
        books.push({ u0: u + shelf * 2, u1: u + wd + shelf * 2, top: rnd.range(0.05, 0.22), c: lin([rnd.int(40, 220), rnd.int(30, 200), rnd.int(30, 190)]) });
        u += wd + rnd.range(0, 0.004);
      }
    }
  }
  const out = layer.rgb;
  for (let py = 0; py < h; py++) {
    const y = (py + 0.5) / ss;
    for (let px = 0; px < w; px++) {
      const x = (px + 0.5) / ss;
      const mott = 0.92 + 0.16 * smooth(x * 0.05 + 13, y * 0.05 + 7) + 0.03 * (white(x * 1.3, y * 1.3) - 0.5);
      let r = wall[0] * mott * amb;
      let g = wall[1] * mott * amb;
      let b = wall[2] * mott * amb;
      if (bd.kind === 'stage') {
        const spot = Math.exp(-(((x - 0.3 * W) / (0.25 * W)) ** 2 + ((y - 0.2 * Hh) / (0.3 * Hh)) ** 2));
        r = 0.01 + 0.25 * spot;
        g = 0.008 + 0.2 * spot;
        b = 0.015 + 0.3 * spot;
      } else {
        if (Math.abs(x - doorU) < doorW / 2 + 6 && Math.abs(x - doorU) > doorW / 2 && y > shelfV * 0.3) {
          r = trim[0] * amb;
          g = trim[1] * amb;
          b = trim[2] * amb;
        }
        if (Math.abs(y - shelfV) < 4 && Math.abs(x - doorU) > doorW) {
          r = 0.12 * amb;
          g = 0.08 * amb;
          b = 0.05 * amb;
        }
        if (y > floorV) {
          r = floor[0] * amb * (0.85 + 0.2 * smooth(x * 0.02, y * 0.3));
          g = floor[1] * amb * (0.85 + 0.2 * smooth(x * 0.02, y * 0.3));
          b = floor[2] * amb * (0.85 + 0.2 * smooth(x * 0.02, y * 0.3));
        }
      }
      if (bd.kind === 'window' && x > winX0 && x < winX1 && y > winY0 && y < winY1) {
        const frame = Math.abs(x - (winX0 + winX1) / 2) < 5 || Math.abs(y - (winY0 + winY1) / 2) < 5 || x < winX0 + 8 || x > winX1 - 8 || y > winY1 - 8;
        const sky = 7 + 3 * smooth(x * 0.01, y * 0.01);
        r = frame ? 0.5 : sky;
        g = frame ? 0.5 : sky * 1.02;
        b = frame ? 0.5 : sky * 1.08;
      }
      if (Pi) {
        const ww = Pi[6] * x + Pi[7] * y + Pi[8];
        if (ww > 0) {
          const u = (Pi[0] * x + Pi[1] * y + Pi[2]) / ww;
          const v = (Pi[3] * x + Pi[4] * y + Pi[5]) / ww;
          if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
            let c: V3 = [0.5, 0.5, 0.5];
            if (bd.kind === 'keyboard') {
              // 52 white keys across, black keys in the 2-3 pattern over the upper 62%.
              const k = u * 52;
              const ki = Math.floor(k);
              const fk = k - ki;
              c = fk < 0.04 || fk > 0.96 ? [0.05, 0.05, 0.05] : [0.78, 0.78, 0.76];
              if (v < 0.62) {
                const pos = ki % 7;
                const hasBlackRight = pos !== 2 && pos !== 6;
                const hasBlackLeft = pos !== 0 && pos !== 3;
                if ((hasBlackRight && fk > 0.68) || (hasBlackLeft && fk < 0.32)) c = [0.015, 0.015, 0.018];
              }
              if (v > 0.93) c = [0.02, 0.02, 0.02];
            } else if (bd.kind === 'bookshelf') {
              const shelf = Math.min(2, Math.floor(v * 3));
              const sv = v * 3 - shelf;
              c = sv > 0.93 ? lin([120, 86, 60]) : [0.03, 0.025, 0.02];
              if (sv <= 0.93) {
                const uu = u + shelf * 2;
                for (const bk of books) {
                  if (uu >= bk.u0 && uu < bk.u1 && sv > bk.top) {
                    const edge = (uu - bk.u0) / (bk.u1 - bk.u0);
                    const k2 = 0.7 + 0.3 * Math.sin(edge * Math.PI);
                    c = [bk.c[0] * k2, bk.c[1] * k2, bk.c[2] * k2];
                    if (Math.abs(sv - 0.4) < 0.015) c = [0.8, 0.75, 0.5];
                    break;
                  }
                }
              }
            } else if (bd.kind === 'blinds') {
              const k = v * 36;
              const fk = k - Math.floor(k);
              const slat = 0.55 + 0.45 * Math.sin(fk * Math.PI);
              c = fk < 0.86 ? [0.82 * slat, 0.8 * slat, 0.76 * slat] : [2.5, 2.6, 2.8];
              if (Math.abs(u - 0.25) < 0.003 || Math.abs(u - 0.75) < 0.003) c = [0.6, 0.6, 0.55];
            } else if (bd.kind === 'radiator') {
              const k = u * 24;
              const fk = k - Math.floor(k);
              const fin = 0.35 + 0.65 * Math.pow(Math.sin(fk * Math.PI), 0.7);
              c = [0.78 * fin, 0.78 * fin, 0.75 * fin];
              if (v < 0.06 || v > 0.94) c = [0.7, 0.7, 0.68];
            }
            r = c[0] * amb;
            g = c[1] * amb;
            b = c[2] * amb;
          }
        }
      }
      const o = (py * w + px) * 3;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }
  // The player: a torso behind the guitar (stripes for the shirt test), a head above it.
  const person = bd.person;
  if (person) {
    const shirt = lin(person.shirt);
    const stripe = person.stripes ? lin(person.stripes.color) : null;
    const cxP = rnd.range(0.38, 0.62) * W;
    const top = rnd.range(0.12, 0.3) * Hh;
    const halfW = rnd.range(0.22, 0.32) * W;
    const ang = person.stripes ? (person.stripes.angleDeg * Math.PI) / 180 : 0;
    const period = person.stripes ? person.stripes.periodPx : 1;
    polygon(layer, [{ x: cxP - halfW, y: Hh + 5 }, { x: cxP - halfW * 0.92, y: top + 0.08 * Hh }, { x: cxP - halfW * 0.5, y: top }, { x: cxP + halfW * 0.5, y: top }, { x: cxP + halfW * 0.92, y: top + 0.08 * Hh }, { x: cxP + halfW, y: Hh + 5 }], (x, y) => {
      const fold = 0.85 + 0.25 * smooth(x * 0.08 + 3, y * 0.02 + 1);
      let c = shirt;
      if (stripe) {
        const bend = 4 * Math.sin(x * 0.03) + 6 * (smooth(x * 0.03, y * 0.03) - 0.5);
        const s = (Math.cos(ang) * (y + bend) + Math.sin(ang) * x) / period;
        if (s - Math.floor(s) < 0.45) c = stripe;
      }
      return [c[0] * fold * amb, c[1] * fold * amb, c[2] * fold * amb];
    });
    const skin = lin(person.skin);
    capsule(layer, { x: cxP, y: top - 0.22 * Hh }, { x: cxP, y: top - 0.06 * Hh }, 0.075 * W, 0.065 * W, skinShader([skin[0] * amb, skin[1] * amb, skin[2] * amb], 1));
  }
  // A second guitar hanging on the wall: the same instrument drawing, through its own camera.
  if (bd.kind === 'wall-guitar' && spec.neck) {
    const view: AltView = { ...spec.view, spanFrac: rnd.range(0.28, 0.38), tiltDeg: rnd.range(5, 25), tiltAxisDeg: rnd.range(0, 180), rollDeg: rnd.pick([80, -80, 65, -70]), anchorFret: 7, u0: rnd.pick([0.12, 0.88]), v0: 0.45, stillFrames: 1e9, bassDown: false, leftHanded: false };
    const other: AltSpec = { ...spec, view, capo: null };
    const cam2 = buildCam(other, 0);
    const look2: AltLook = { ...spec.look, body: rnd.pick(['red', 'black', 'sunburst'] as const), board: rnd.pick(['rosewood', 'maple'] as const) };
    const neck2: AltNeck = { ...spec.neck, kind: 'electric', joinFret: 16, frets: 22 };
    drawGuitarLayer(layer, makeGuitarShader(neck2, look2, { ...spec.light, key: spec.light.key * 0.7 }, cam2, null, bd.seed + 1), cam2);
  }
  return layer;
}

// ---------------------------------------------------------------------------------------------
// Frame rendering
// ---------------------------------------------------------------------------------------------

const SHADE_OUT = new Float32Array(4);

/**
 * Composite a guitar onto a layer. Every output pixel is taken to the board plane and shaded there
 * once (thin features are prefiltered for the pixel's footprint); where the material differs from a
 * neighbour (board edge, inlay, nut, body outline) the pixel is shaded again at its 2x2 sub-samples.
 */
function drawGuitarLayer(layer: Layer, gs: GuitarShader, cam: Cam): void {
  const s = layer.ss;
  const Hi = cam.Hi;
  const W = cam.width;
  const Hh = cam.height;
  // Output-pixel bounding box of the plane box (when it is entirely in front of the camera).
  let ox0 = 0;
  let oy0 = 0;
  let ox1 = W - 1;
  let oy1 = Hh - 1;
  {
    const corners = [project(cam, gs.x0, gs.y0, 0), project(cam, gs.x1, gs.y0, 0), project(cam, gs.x1, gs.y1, 0), project(cam, gs.x0, gs.y1, 0), project(cam, gs.x0, (gs.y0 + gs.y1) / 2, 0), project(cam, gs.x1, (gs.y0 + gs.y1) / 2, 0)];
    if (corners.every((c) => c !== null)) {
      const xs = corners.map((c) => (c as Point).x);
      const ys = corners.map((c) => (c as Point).y);
      // Barrel distortion bows straight edges outward between the corners: leave room for it.
      const m = 2 + (cam.k1 + cam.k2) * 0.12 * Math.max(W, Hh);
      ox0 = Math.max(0, Math.floor(Math.min(...xs) - m));
      ox1 = Math.min(W - 1, Math.ceil(Math.max(...xs) + m));
      oy0 = Math.max(0, Math.floor(Math.min(...ys) - m));
      oy1 = Math.min(Hh - 1, Math.ceil(Math.max(...ys) + m));
    }
  }
  if (ox1 < ox0 || oy1 < oy0) return;
  const bw = ox1 - ox0 + 1;
  const bh = oy1 - oy0 + 1;
  const col = new Float32Array(bw * bh * 4);
  const ids = new Uint8Array(bw * bh);
  const out = SHADE_OUT;
  const distorted = cam.k1 !== 0 || cam.k2 !== 0;
  const sample = (du: number, dv: number, footprint: number): number => {
    let ux = du;
    let uy = dv;
    if (distorted) {
      const q = undistort(cam.k1, cam.k2, cam.cx, cam.cy, cam.norm, du, dv);
      ux = q.x;
      uy = q.y;
    }
    const w = Hi[6] * ux + Hi[7] * uy + Hi[8];
    out[3] = 0;
    if (!(w > 1e-12)) return 0;
    const X = (Hi[0] * ux + Hi[1] * uy + Hi[2]) / w;
    const Y = (Hi[3] * ux + Hi[4] * uy + Hi[5]) / w;
    if (X < gs.x0 || X > gs.x1 || Y < gs.y0 || Y > gs.y1) return 0;
    // Footprint of the sample on the board: Gaussian sigma of a box of `footprint` pixels, plus a little lens.
    const jxu = (Hi[0] - X * Hi[6]) / w;
    const jxv = (Hi[1] - X * Hi[7]) / w;
    const jyu = (Hi[3] - Y * Hi[6]) / w;
    const jyv = (Hi[4] - Y * Hi[7]) / w;
    const sx = 0.42 * footprint * Math.sqrt(jxu * jxu + jxv * jxv) + 0.02;
    const sy = 0.42 * footprint * Math.sqrt(jyu * jyu + jyv * jyv) + 0.02;
    return gs.shade(X, Y, sx, sy, out);
  };
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const id = sample(ox0 + x + 0.5, oy0 + y + 0.5, 1);
      const k = y * bw + x;
      ids[k] = id;
      col[k * 4] = out[0];
      col[k * 4 + 1] = out[1];
      col[k * 4 + 2] = out[2];
      col[k * 4 + 3] = id ? (out[3] > 1 ? 1 : out[3]) : 0;
    }
  }
  const rgb = layer.rgb;
  const lw = layer.w;
  const blend = (px: number, py: number, r: number, g: number, b: number, a: number): void => {
    const o = (py * lw + px) * 3;
    rgb[o] += (r - rgb[o]) * a;
    rgb[o + 1] += (g - rgb[o + 1]) * a;
    rgb[o + 2] += (b - rgb[o + 2]) * a;
  };
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const k = y * bw + x;
      const id = ids[k];
      const edge =
        (x > 0 && ids[k - 1] !== id) || (x + 1 < bw && ids[k + 1] !== id) || (y > 0 && ids[k - bw] !== id) || (y + 1 < bh && ids[k + bw] !== id);
      const ox = ox0 + x;
      const oy = oy0 + y;
      if (edge) {
        for (let j = 0; j < s; j++) {
          for (let i = 0; i < s; i++) {
            const sid = sample(ox + (i + 0.5) / s, oy + (j + 0.5) / s, 1 / s);
            if (sid === 0) continue;
            blend(ox * s + i, oy * s + j, out[0], out[1], out[2], out[3] > 1 ? 1 : out[3]);
          }
        }
      } else if (id !== 0) {
        const a = col[k * 4 + 3];
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) blend(ox * s + i, oy * s + j, col[k * 4], col[k * 4 + 1], col[k * 4 + 2], a);
      }
    }
  }
}

/** The fretting hand: thumb behind the neck, fingers arching over the treble edge onto their strings. */
function drawHand(layer: Layer, spec: AltSpec, cam: Cam, behind: boolean, shadeLevel: number): void {
  const hand = spec.hand;
  const neck = spec.neck;
  if (!hand || !neck) return;
  const L = neck.scaleLength;
  const yc = neck.nutWidth / 2;
  const half = (x: number): number => neck.nutWidth / 2 + ((neck.width12 - neck.nutWidth) * x) / L;
  const spanAt = (x: number): number => neck.spanNut + ((neck.spanBridge - neck.spanNut) * x) / L;
  const sY = (s: number, x: number): number => yc + ((neck.strings - s) / Math.max(1, neck.strings - 1) - 0.5) * spanAt(x);
  const cellX = (c: number): number => fretPos(neck, c - 1) + 0.62 * (fretPos(neck, c) - fretPos(neck, c - 1));
  const skin = lin(hand.skin);
  const lit: V3 = [skin[0] * shadeLevel, skin[1] * shadeLevel, skin[2] * shadeLevel];
  const xh = cellX(hand.cell);
  if (behind) {
    if (!hand.thumb) return;
    const tip = project(cam, xh + 8, yc - half(xh) - 9, -6);
    const base = project(cam, xh + 30, yc - half(xh) + 6, -22);
    const k = pxPerMm(cam, xh, yc, 0);
    if (tip && base) capsule(layer, tip, base, 9 * k, 11 * k, skinShader(lit, 1));
    return;
  }
  const k = pxPerMm(cam, xh, yc, 0);
  // Palm under the treble edge, wrist further down.
  const palm = project(cam, xh + 22, yc + half(xh) + 30, -18);
  const wrist = project(cam, xh + 55, yc + half(xh) + 75, -30);
  if (palm && wrist) capsule(layer, palm, wrist, 30 * k, 26 * k, skinShader(lit, 0.9));
  for (const f of hand.fingers) {
    const x = cellX(f.cell);
    const y = sY(f.string, x);
    const tip = project(cam, x, y, 6);
    const mid = project(cam, x + 4, yc + half(x) + 6, 22);
    const base = project(cam, xh + 10 + (f.cell - hand.cell) * 6, yc + half(x) + 26, 2);
    if (!tip || !mid || !base) continue;
    capsule(layer, base, mid, 9.5 * k, 8.5 * k, skinShader(lit, 0.95));
    capsule(layer, mid, tip, 8.5 * k, 7 * k, (t, across) => {
      const c = skinShader(lit, 1)(t, across);
      // Nails catch the light at the tip.
      return t > 0.82 && across < 0.5 ? [c[0] * 1.15, c[1] * 1.12, c[2] * 1.12] : c;
    });
  }
}

function drawOccluders(layer: Layer, spec: AltSpec, cam: Cam, level: number): void {
  const neck = spec.neck;
  if (!neck) return;
  const L = neck.scaleLength;
  const yc = neck.nutWidth / 2;
  const half = (x: number): number => neck.nutWidth / 2 + ((neck.width12 - neck.nutWidth) * x) / L;
  for (const oc of spec.occluders) {
    if (oc.kind === 'pick-arm') {
      const a = project(cam, L + 120, yc - 230, 40);
      const b = project(cam, L - 70, yc + 20, 30);
      const k = pxPerMm(cam, L, yc, 0);
      if (!a || !b) continue;
      const skin = lin(oc.skin);
      const sleeve = oc.sleeve ? lin(oc.sleeve) : null;
      capsule(layer, a, b, 46 * k, 36 * k, (t, across) => {
        const base = sleeve && t < 0.55 ? sleeve : skin;
        const s = level * (0.6 + 0.4 * Math.sqrt(Math.max(0, 1 - across * across)));
        return [base[0] * s, base[1] * s, base[2] * s];
      });
    } else if (oc.kind === 'sleeve' && spec.hand) {
      const xh = fretPos(neck, spec.hand.cell);
      const k = pxPerMm(cam, xh, yc, 0);
      const cuff = project(cam, xh + 40, yc + half(xh) + 18 - oc.reachMm, 10);
      const elbow = project(cam, xh + 140, yc + half(xh) + 260, -40);
      if (!cuff || !elbow) continue;
      const c = lin(oc.color);
      capsule(layer, cuff, elbow, 42 * k, 60 * k, (t, across, x, y) => {
        let s = level * (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - across * across)));
        if (oc.pattern === 'rib') s *= 0.8 + 0.2 * Math.sin((x * 0.8 + y * 0.3) * 1.3);
        if (oc.pattern === 'check') s *= (Math.floor(x / 9) + Math.floor(y / 9)) % 2 === 0 ? 0.65 : 1;
        s *= 0.9 + 0.2 * smooth(x * 0.1, y * 0.1);
        return [c[0] * s, c[1] * s, c[2] * s];
      });
    } else if (oc.kind === 'strap') {
      const a = project(cam, -95, yc, 4);
      const k = pxPerMm(cam, -60, yc, 0);
      if (!a) continue;
      // Up and out of the frame, over the nut end.
      const b = { x: a.x + (spec.view.leftHanded ? 1 : -1) * 0.15 * spec.width, y: a.y - 0.9 * spec.height };
      const c = lin(oc.color);
      const st = lin(oc.stripe);
      capsule(layer, a, b, (oc.widthMm / 2) * k, (oc.widthMm / 2) * k * 1.2, (_t, across) => {
        const col = Math.abs(across) > 0.55 && Math.abs(across) < 0.75 ? st : c;
        const s = level * (0.75 + 0.25 * Math.sqrt(Math.max(0, 1 - across * across)));
        return [col[0] * s, col[1] * s, col[2] * s];
      });
    } else if (oc.kind === 'stand') {
      const x = fretPos(neck, oc.fret);
      const p = project(cam, x, yc, 0);
      if (!p) continue;
      const ang = (oc.angleDeg * Math.PI) / 180;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const len = 2 * Math.sqrt(spec.width * spec.width + spec.height * spec.height);
      const nx = -dy;
      const ny = dx;
      const hw = oc.widthPx / 2;
      const c = lin(oc.color);
      polygon(layer, [
        { x: p.x - dx * len + nx * hw, y: p.y - dy * len + ny * hw },
        { x: p.x + dx * len + nx * hw, y: p.y + dy * len + ny * hw },
        { x: p.x + dx * len - nx * hw, y: p.y + dy * len - ny * hw },
        { x: p.x - dx * len - nx * hw, y: p.y - dy * len - ny * hw },
      ], (qx, qy) => {
        const across = ((qx - p.x) * nx + (qy - p.y) * ny) / hw;
        const edge = across < -0.75 ? 2.2 : 1;
        const s = level * edge * (0.8 + 0.2 * smooth(qx * 0.05, qy * 0.05));
        return [c[0] * s, c[1] * s, c[2] * s];
      });
    }
  }
}

/** Separable Gaussian blur of a 3-channel float image, in place. */
function blur3(img: Float32Array, w: number, h: number, sigma: number): void {
  if (!(sigma > 0.15)) return;
  const r = Math.max(1, Math.ceil(2.5 * sigma));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += k[i + r];
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(Math.max(w, h) * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      let b = 0;
      let c = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
        const o = (y * w + xx) * 3;
        const kk = k[i + r];
        a += img[o] * kk;
        b += img[o + 1] * kk;
        c += img[o + 2] * kk;
      }
      tmp[x * 3] = a;
      tmp[x * 3 + 1] = b;
      tmp[x * 3 + 2] = c;
    }
    img.set(tmp.subarray(0, w * 3), y * w * 3);
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let a = 0;
      let b = 0;
      let c = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
        const o = (yy * w + x) * 3;
        const kk = k[i + r];
        a += img[o] * kk;
        b += img[o + 1] * kk;
        c += img[o + 2] * kk;
      }
      tmp[y * 3] = a;
      tmp[y * 3 + 1] = b;
      tmp[y * 3 + 2] = c;
    }
    for (let y = 0; y < h; y++) {
      const o = (y * w + x) * 3;
      img[o] = tmp[y * 3];
      img[o + 1] = tmp[y * 3 + 1];
      img[o + 2] = tmp[y * 3 + 2];
    }
  }
}

/** Cache of static backgrounds (and of the last still radiance), keyed by spec. */
export type AltCache = WeakMap<AltSpec, { bg: Layer; still: { img: Float32Array; cam: Cam } | null }>;

/** A cache for `renderAlt` (backgrounds are static per scene; still frames differ only by sensor noise). */
export function createAltCache(): AltCache {
  return new WeakMap();
}

/** Linear radiance of one moment of the scene, at output resolution (before the light field and the sensor). */
function renderRadiance(spec: AltSpec, tS: number, cache?: AltCache): { img: Float32Array; cam: Cam } {
  const ss = 2;
  const cam = buildCam(spec, tS);
  let entry = cache?.get(spec);
  if (!entry) {
    entry = { bg: renderBackground(spec, buildCam(spec, 0), ss), still: null };
    cache?.set(spec, entry);
  }
  const still = tS <= spec.view.stillFrames / 30 + 1e-9;
  if (still && entry.still) return { img: new Float32Array(entry.still.img), cam: entry.still.cam };
  const bg = entry.bg;
  const layer: Layer = { w: bg.w, h: bg.h, rgb: new Float32Array(bg.rgb), ss };
  const level = spec.light.ambient + spec.light.key * 0.7;
  drawHand(layer, spec, cam, true, level);
  if (spec.neck) drawGuitarLayer(layer, makeGuitarShader(spec.neck, spec.look, spec.light, cam, spec.capo, spec.seed * 7 + 3), cam);
  drawHand(layer, spec, cam, false, level);
  drawOccluders(layer, spec, cam, level);
  // Box filter 2x2 down to the output grid.
  const W = spec.width;
  const Hh = spec.height;
  const img = new Float32Array(W * Hh * 3);
  const src = layer.rgb;
  const lw = layer.w;
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const i0 = (2 * y * lw + 2 * x) * 3;
      const i1 = i0 + lw * 3;
      img[o] = 0.25 * (src[i0] + src[i0 + 3] + src[i1] + src[i1 + 3]);
      img[o + 1] = 0.25 * (src[i0 + 1] + src[i0 + 4] + src[i1 + 1] + src[i1 + 4]);
      img[o + 2] = 0.25 * (src[i0 + 2] + src[i0 + 5] + src[i1 + 2] + src[i1 + 5]);
    }
  }
  if (still) entry.still = { img: new Float32Array(img), cam };
  return { img, cam };
}

/** Filmic shoulder (white point 2.5) then display gamma, as a 4096-entry table over [0, 4) linear. */
let toneLut: Float32Array | null = null;
function tone(v: number): number {
  if (!toneLut) {
    toneLut = new Float32Array(4097);
    const white2 = 2.5 * 2.5;
    for (let i = 0; i <= 4096; i++) {
      const m = (i / 4096) * 4;
      const t = (m * (1 + m / white2)) / (1 + m);
      toneLut[i] = 255 * Math.pow(Math.min(1, t), 1 / 2.2);
    }
  }
  if (!(v > 0)) return 0;
  if (v >= 4) return 255;
  return toneLut[(v * 1024) | 0];
}

/** Render frame `index` (30 fps) of a scene: the frame the tracker sees and its ground truth. */
export function renderAlt(spec: AltSpec, index: number, cache?: AltCache): { frame: Frame; truth: AltTruth } {
  smoothField();
  whiteField();
  const gauss = gaussField();
  const W = spec.width;
  const Hh = spec.height;
  const tS = index / 30;
  const { img, cam } = renderRadiance(spec, tS, cache);
  const camSpec = spec.camera;
  if (camSpec.interlaceS > 0 && tS > spec.view.stillFrames / 30) {
    const early = renderRadiance(spec, Math.max(0, tS - camSpec.interlaceS), cache).img;
    for (let y = 1; y < Hh; y += 2) img.set(early.subarray(y * W * 3, (y + 1) * W * 3), y * W * 3);
  }
  // Light over the whole frame: ramp, vignette, stage colours, a window's veiling glare.
  const li = spec.light;
  const ra = (li.rampDeg * Math.PI) / 180;
  const rc = Math.cos(ra);
  const rs = Math.sin(ra);
  const stA = li.stage ? lin(li.stage.a) : null;
  const stB = li.stage ? lin(li.stage.b) : null;
  const sa = li.stage ? (li.stage.angleDeg * Math.PI) / 180 : 0;
  const sc = Math.cos(sa);
  const ssn = Math.sin(sa);
  const glare = spec.backdrop.kind === 'window' ? 0.25 : 0;
  // The window sits in the upper part of the frame (see renderBackground); its glare falls off with distance.
  const gx = 0.35 * W;
  const gy = 0.25 * Hh;
  const gScale = 0.45 * W;
  const bal = camSpec.balance;
  for (let y = 0; y < Hh; y++) {
    const ny = y / Hh - 0.5;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const nx = x / W - 0.5;
      let gain = 1 + li.ramp * (nx * rc + ny * rs) - li.vignette * (nx * nx + ny * ny) * 2;
      gain = gain < 0.05 ? 0.05 : gain;
      let r = img[o] * gain;
      let g = img[o + 1] * gain;
      let b = img[o + 2] * gain;
      if (stA && stB) {
        const t = clamp(0.5 + 1.2 * (nx * sc + ny * ssn), 0, 1);
        r *= (stA[0] + (stB[0] - stA[0]) * t) * 2.2;
        g *= (stA[1] + (stB[1] - stA[1]) * t) * 2.2;
        b *= (stA[2] + (stB[2] - stA[2]) * t) * 2.2;
      }
      if (glare > 0) {
        const d = Math.sqrt((x - gx) * (x - gx) + (y - gy) * (y - gy)) / gScale;
        const haze = glare * Math.exp(-d * d);
        r += haze;
        g += haze;
        b += haze * 1.05;
      }
      img[o] = r * bal[0];
      img[o + 1] = g * bal[1];
      img[o + 2] = b * bal[2];
    }
  }
  blur3(img, W, Hh, camSpec.psf);
  // Sensor: exposure, rolling flicker, Poisson-Gaussian noise, chroma blotches.
  let gi = (Math.imul(spec.seed + 1, 0x9e3779b1) ^ Math.imul(index + 7, 0x85ebca6b)) >>> 0;
  if (gi === 0) gi = 1;
  const bu = (index * 37.3) % 256;
  const bv = (index * 91.7) % 256;
  const flickPhase = index * 0.37;
  const read2 = camSpec.read * camSpec.read;
  const exposure = camSpec.exposure;
  const shot = camSpec.shot;
  const blotch = camSpec.blotch;
  for (let y = 0; y < Hh; y++) {
    const fl = camSpec.flicker > 0 ? 1 + camSpec.flicker * Math.sin(2 * Math.PI * (y / camSpec.flickerRows + flickPhase)) : 1;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) {
        let v = img[o + c] * exposure * fl;
        if (v < 0) v = 0;
        gi ^= gi << 13;
        gi ^= gi >>> 17;
        gi ^= gi << 5;
        v += gauss[gi & 0xffff] * Math.sqrt(read2 + shot * v);
        if (blotch > 0) v += blotch * (smooth(x * 0.18 + bu + c * 61, y * 0.18 + bv + c * 17) - 0.5) * 2;
        img[o + c] = v;
      }
    }
  }
  // Filmic shoulder, then display gamma, then 8 bits; 4:2:0 chroma and 4x4 luma quantisation.
  const data = new Uint8ClampedArray(W * Hh * 4);
  const Y = new Float32Array(W * Hh);
  const Cb = new Float32Array(W * Hh);
  const Cr = new Float32Array(W * Hh);
  for (let i = 0; i < W * Hh; i++) {
    const o = i * 3;
    const r = tone(img[o]);
    const g = tone(img[o + 1]);
    const b = tone(img[o + 2]);
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    Cb[i] = b - Y[i];
    Cr[i] = r - Y[i];
  }
  if (camSpec.chroma) {
    for (let y = 0; y + 1 < Hh; y += 2) {
      for (let x = 0; x + 1 < W; x += 2) {
        const i = y * W + x;
        const cb = 0.25 * (Cb[i] + Cb[i + 1] + Cb[i + W] + Cb[i + W + 1]);
        const cr = 0.25 * (Cr[i] + Cr[i + 1] + Cr[i + W] + Cr[i + W + 1]);
        Cb[i] = Cb[i + 1] = Cb[i + W] = Cb[i + W + 1] = cb;
        Cr[i] = Cr[i + 1] = Cr[i + W] = Cr[i + W + 1] = cr;
      }
    }
  }
  if (camSpec.quant > 0) {
    const q = camSpec.quant;
    for (let by = 0; by + 3 < Hh; by += 4) {
      for (let bx = 0; bx + 3 < W; bx += 4) {
        let mean = 0;
        for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) mean += Y[(by + yy) * W + bx + xx];
        mean /= 16;
        for (let yy = 0; yy < 4; yy++) {
          for (let xx = 0; xx < 4; xx++) {
            const i = (by + yy) * W + bx + xx;
            Y[i] = mean + Math.round((Y[i] - mean) / q) * q;
          }
        }
      }
    }
  }
  const mirrored = camSpec.mirrored;
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const ox = mirrored ? W - 1 - x : x;
      const o = (y * W + ox) * 4;
      const yy = Y[i];
      const r = yy + Cr[i];
      const b = yy + Cb[i];
      const g = (yy - 0.299 * r - 0.114 * b) / 0.587;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { frame: { data, width: W, height: Hh }, truth: makeTruth(spec, cam, index) };
}

function makeTruth(spec: AltSpec, cam: Cam, index: number): AltTruth {
  const neck = spec.neck;
  const W = spec.width;
  const Hh = spec.height;
  const still = index === 0 || index < spec.view.stillFrames;
  if (!neck) {
    return { width: W, height: Hh, H: null, Hinv: null, k1: cam.k1, k2: cam.k2, mirrored: spec.camera.mirrored, model: null, capoFret: null, nutInFrame: false, visible: { min: 0, max: -1 }, still, stringSpacingPx: 0, offNormalDeg: 0, camera: null, stringHeight: [0, 0] };
  }
  const model: NeckModel = {
    preset: 'custom',
    scaleLength: neck.scaleLength,
    nutWidth: neck.nutWidth,
    width12: neck.width12,
    stringSpanNut: neck.spanNut,
    stringSpanBridge: neck.spanBridge,
    stringCount: neck.strings,
    fretCount: neck.frets,
    bodyJoinFret: neck.joinFret,
  };
  const yc = neck.nutWidth / 2;
  const inFrame = (p: Point | null): boolean => p !== null && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= Hh;
  let min = Infinity;
  let max = -Infinity;
  for (let f = 0; f <= neck.frets; f++) {
    if (inFrame(project(cam, fretPos(neck, f), yc, 0))) {
      min = Math.min(min, f);
      max = Math.max(max, f);
    }
  }
  const nut = project(cam, -2, yc, 0);
  const strapHidesNut = spec.occluders.some((o) => o.kind === 'strap');
  const mid = Number.isFinite(min) ? Math.max(1, Math.round((min + max) / 2)) : 6;
  const xm = fretPos(neck, mid);
  const span = neck.spanNut + ((neck.spanBridge - neck.spanNut) * xm) / neck.scaleLength;
  const a = project(cam, xm, yc - span / 2, 0);
  const b = project(cam, xm, yc + span / 2, 0);
  const spacing = a && b ? Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / (neck.strings - 1) : 0;
  const normal = [cam.R[2], cam.R[5], cam.R[8]];
  const offNormal = (Math.acos(Math.min(1, Math.abs(normal[2]))) * 180) / Math.PI;
  return {
    width: W,
    height: Hh,
    H: cam.H as unknown as Mat3,
    Hinv: cam.Hi as unknown as Mat3,
    k1: cam.k1,
    k2: cam.k2,
    mirrored: spec.camera.mirrored,
    model,
    capoFret: spec.capo?.fret ?? null,
    nutInFrame: inFrame(nut) && !strapHidesNut,
    visible: Number.isFinite(min) ? { min, max } : { min: 0, max: -1 },
    still,
    stringSpacingPx: spacing,
    offNormalDeg: offNormal,
    camera: [cam.C[0], cam.C[1], cam.C[2]],
    stringHeight: altStringHeights(neck.kind),
  };
}

/** A pixel of the frame the tracker saw -> the true board plane (mm), or null when its ray misses the board plane. */
export function altPixelToPlane(truth: AltTruth, p: Point): Point | null {
  if (!truth.Hinv) return null;
  const x = truth.mirrored ? truth.width - p.x : p.x;
  const u = undistort(truth.k1, truth.k2, truth.width / 2, truth.height / 2, Math.sqrt(truth.width * truth.width + truth.height * truth.height) / 2, x, p.y);
  const Hi = truth.Hinv;
  const w = Hi[6] * u.x + Hi[7] * u.y + Hi[8];
  if (!(w > 1e-12)) return null;
  return { x: (Hi[0] * u.x + Hi[1] * u.y + Hi[2]) / w, y: (Hi[3] * u.x + Hi[4] * u.y + Hi[5]) / w };
}

/** A true board-plane point (mm) -> the pixel of the frame the tracker saw (mirroring and distortion included). */
export function altPlaneToPixel(truth: AltTruth, x: number, y: number): Point | null {
  if (!truth.H) return null;
  const H = truth.H;
  const w = H[6] * x + H[7] * y + H[8];
  if (!(w > 1e-9)) return null;
  const d = distort({ k1: truth.k1, k2: truth.k2, cx: truth.width / 2, cy: truth.height / 2, norm: Math.sqrt(truth.width * truth.width + truth.height * truth.height) / 2 }, (H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w);
  return truth.mirrored ? { x: truth.width - d.x, y: d.y } : d;
}

// ---------------------------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------------------------

const SKINS: readonly Rgb8[] = [[238, 204, 180], [222, 176, 146], [196, 144, 108], [160, 112, 80], [116, 78, 54], [78, 52, 40]];

function makeNeck(kind: AltNeckKind, r: AltRandom): AltNeck {
  switch (kind) {
    case 'steel': {
      const scale = r.pick([628, 632.5, 645, 650]);
      const nut = r.range(42.5, 44.6);
      return { kind, scaleLength: scale, nutWidth: nut, width12: nut + r.range(9.4, 11.2), spanNut: nut - r.range(6.6, 8), spanBridge: r.range(52.5, 55), strings: 6, frets: 20, joinFret: 14 };
    }
    case 'electric': {
      const scale = r.pick([628, 648]);
      const nut = r.range(41.3, 43);
      return { kind, scaleLength: scale, nutWidth: nut, width12: nut + r.range(9, 10.5), spanNut: nut - r.range(6.5, 7.5), spanBridge: r.range(51.5, 53.5), strings: 6, frets: r.pick([21, 22, 24]), joinFret: 16 };
    }
    case 'classical': {
      const nut = r.range(51, 53);
      return { kind, scaleLength: r.pick([640, 650, 660]), nutWidth: nut, width12: nut + r.range(9, 10.5), spanNut: nut - r.range(8.5, 10), spanBridge: r.range(57, 59), strings: 6, frets: 19, joinFret: 12 };
    }
    case 'seven': {
      const nut = r.range(47.5, 48.5);
      return { kind, scaleLength: r.pick([648, 686]), nutWidth: nut, width12: nut + r.range(9.5, 10.5), spanNut: nut - 7, spanBridge: r.range(61, 63), strings: 7, frets: 24, joinFret: 19 };
    }
    case 'bass': {
      const nut = r.range(38, 42);
      return { kind, scaleLength: 864, nutWidth: nut, width12: nut + r.range(15, 18), spanNut: nut - r.range(8, 9.5), spanBridge: r.range(56, 58), strings: 4, frets: 20, joinFret: 16 };
    }
  }
}

function presetFor(kind: AltNeckKind): NeckPresetId {
  return kind === 'classical' ? 'classical' : kind === 'steel' ? 'steel' : 'electric';
}

/** The common case every condition starts from: a steel-string guitar in a room, a hand on the neck, a decent webcam. */
function baseSpec(condition: string, seed: number, kind: AltNeckKind = 'steel'): { spec: AltSpec; r: AltRandom } {
  const r = new AltRandom(seed, condition.length, condition.charCodeAt(0), condition.charCodeAt(condition.length - 1));
  const neck = makeNeck(kind, r);
  const electricish = kind === 'electric' || kind === 'seven' || kind === 'bass';
  const look: AltLook = {
    board: kind === 'classical' ? r.pick(['rosewood', 'ebony'] as const) : r.pick(['rosewood', 'rosewood', 'ebony', 'maple', 'walnut'] as const),
    grain: r.range(0.08, 0.22),
    wear: r.range(0, 0.25),
    fretTone: 'nickel',
    fretShine: r.range(0.4, 0.8),
    fretWidth: r.range(2.0, 2.8),
    inlays: kind === 'classical' ? 'none' : 'dots',
    binding: kind !== 'classical' && r.chance(0.4),
    nut: kind === 'electric' && r.chance(0.4) ? 'black' : 'bone',
    hardware: 'chrome',
    head: kind === 'classical' ? 'slotted' : kind === 'bass' ? 'bass4' : electricish ? 'inline' : 'three',
    headColor: r.pick<Rgb8>([[40, 24, 16], [20, 20, 20], [150, 96, 56], [200, 160, 110]]),
    body: kind === 'classical' ? r.pick(['spruce', 'mahogany'] as const) : electricish ? r.pick(['black', 'red', 'sunburst'] as const) : r.pick(['spruce', 'sunburst', 'mahogany', 'black'] as const),
    strings: kind === 'classical' ? 'nylon' : kind === 'bass' ? 'bass' : electricish ? 'nickel' : 'bright',
  };
  const view: AltView = {
    spanFrac: r.range(0.48, 0.66),
    tiltDeg: r.range(8, 30),
    tiltAxisDeg: r.range(0, 180),
    rollDeg: r.range(-6, 24),
    anchorFret: r.range(5, 8),
    u0: r.range(0.45, 0.58),
    v0: r.range(0.42, 0.55),
    leftHanded: false,
    bassDown: false,
    stillFrames: 14,
    swayRollDeg: r.range(1, 2.5),
    swayPx: r.range(5, 12),
    swayTiltDeg: r.range(1, 3),
    swayPeriodS: r.range(1.2, 2),
  };
  const cell = r.int(2, 7);
  const hand: AltHand = {
    cell,
    fingers: [
      { cell, string: r.int(2, 6) },
      { cell: cell + 1, string: r.int(1, 5) },
      { cell: cell + 2, string: r.int(2, 6) },
    ].map((f) => ({ ...f, string: Math.min(neck.strings, f.string) })),
    thumb: r.chance(0.7),
    skin: r.pick(SKINS),
  };
  const backdrop: AltBackdrop = {
    kind: 'wall',
    wall: r.pick<Rgb8>([[214, 206, 190], [180, 196, 204], [226, 222, 214], [150, 160, 140], [200, 176, 150]]),
    seed: seed * 13 + 1,
    person: { shirt: r.pick<Rgb8>([[40, 60, 110], [120, 30, 34], [60, 60, 60], [200, 200, 196], [70, 100, 60]]), stripes: null, skin: hand.skin },
    distractorSpan: 0.7,
    distractorTiltDeg: 40,
  };
  const light: AltLight = {
    dir: [r.signed(0.5), r.signed(0.5), 1],
    key: r.range(0.55, 0.8),
    ambient: r.range(0.25, 0.4),
    keyColor: r.pick<Rgb8>([[255, 236, 210], [255, 224, 190], [244, 246, 255]]),
    ambientColor: [230, 232, 240],
    ramp: r.range(0, 0.25),
    rampDeg: r.range(0, 360),
    vignette: r.range(0.05, 0.2),
    stage: null,
  };
  const camera: AltCamera = {
    fovDeg: r.range(58, 72),
    k1: r.range(0, 0.04),
    k2: 0,
    psf: r.range(0.45, 0.75),
    exposure: r.range(0.95, 1.25),
    shot: r.range(0.0015, 0.004),
    read: r.range(0.004, 0.008),
    blotch: r.range(0, 0.006),
    quant: r.pick([0, 2, 3]),
    chroma: true,
    interlaceS: 0,
    flicker: 0,
    flickerRows: 120,
    mirrored: false,
    balance: [r.range(0.95, 1.05), 1, r.range(0.95, 1.05)],
  };
  const spec: AltSpec = {
    condition,
    seed,
    width: 640,
    height: 360,
    neck,
    look,
    view,
    hand,
    capo: null,
    occluders: r.chance(0.6) ? [{ kind: 'pick-arm', skin: hand.skin, sleeve: r.chance(0.5) ? backdrop.person?.shirt ?? null : null }] : [],
    backdrop,
    light,
    camera,
    hints: { model: presetFor(kind), bassSideUp: true, mirrored: false, leftHanded: false },
  };
  return { spec, r };
}

/** One condition of the alt bench. */
export interface AltCondition {
  id: string;
  group: 'control' | 'texture' | 'strings' | 'neck' | 'occluder' | 'light' | 'distractor' | 'negative' | 'camera' | 'orientation';
  /** What it varies, in a few words. */
  what: string;
  build(seed: number): AltSpec;
}

const seq = (spec: AltSpec): AltSpec => spec;

/** Every condition of the alt bench, in table order. */
export const ALT_CONDITIONS: readonly AltCondition[] = [
  {
    id: 'plain',
    group: 'control',
    what: 'clean front view, nut in view, no hand',
    build: (seed) => {
      const { spec } = baseSpec('plain', seed);
      return seq({ ...spec, hand: null, occluders: [], view: { ...spec.view, tiltDeg: Math.min(spec.view.tiltDeg, 12) }, camera: { ...spec.camera, quant: 0, blotch: 0 } });
    },
  },
  {
    id: 'typical',
    group: 'control',
    what: 'room, hand on frets 2-9, picking arm',
    build: (seed) => baseSpec('typical', seed).spec,
  },
  {
    id: 'no-nut',
    group: 'control',
    what: 'nut out of the frame (numbering needs inlays or a tap)',
    build: (seed) => {
      const { spec, r } = baseSpec('no-nut', seed);
      return { ...spec, view: { ...spec.view, spanFrac: r.range(0.75, 0.9), anchorFret: r.range(7, 9), u0: r.range(0.62, 0.72) } };
    },
  },
  {
    id: 'grain-wear',
    group: 'texture',
    what: 'heavy grain, worn first positions',
    build: (seed) => {
      const { spec, r } = baseSpec('grain-wear', seed);
      return { ...spec, look: { ...spec.look, board: r.pick(['rosewood', 'walnut', 'maple'] as const), grain: r.range(0.45, 0.65), wear: r.range(0.6, 0.9) } };
    },
  },
  {
    id: 'worn-frets',
    group: 'texture',
    what: 'oxidised low-contrast frets, no shine',
    build: (seed) => {
      const { spec, r } = baseSpec('worn-frets', seed);
      return { ...spec, look: { ...spec.look, board: r.pick(['rosewood', 'walnut'] as const), fretTone: 'oxidised', fretShine: r.range(0.02, 0.1), wear: r.range(0.3, 0.6), fretWidth: r.range(1.8, 2.2) } };
    },
  },
  {
    id: 'gold-hw',
    group: 'texture',
    what: 'gold frets and tuners, brass nut',
    build: (seed) => {
      const { spec } = baseSpec('gold-hw', seed);
      return { ...spec, look: { ...spec.look, board: 'ebony', fretTone: 'gold', hardware: 'gold', nut: 'brass' } };
    },
  },
  {
    id: 'black-hw',
    group: 'texture',
    what: 'black hardware and nut, dark board',
    build: (seed) => {
      const { spec, r } = baseSpec('black-hw', seed, 'electric');
      return { ...spec, look: { ...spec.look, board: r.pick(['ebony', 'richlite'] as const), hardware: 'black', nut: 'black', fretTone: 'stainless', headColor: [16, 16, 16], body: 'black' } };
    },
  },
  {
    id: 'photo-noise',
    group: 'texture',
    what: 'mottled photographic noise, strong chroma blotches',
    build: (seed) => {
      const { spec, r } = baseSpec('photo-noise', seed);
      return { ...spec, look: { ...spec.look, grain: r.range(0.25, 0.4) }, camera: { ...spec.camera, blotch: r.range(0.02, 0.035), shot: 0.008, read: 0.012, quant: 4 } };
    },
  },
  {
    id: 'dull-strings',
    group: 'strings',
    what: 'old dull strings',
    build: (seed) => {
      const { spec } = baseSpec('dull-strings', seed);
      return { ...spec, look: { ...spec.look, strings: 'dull' } };
    },
  },
  {
    id: 'coated-strings',
    group: 'strings',
    what: 'matte coated strings',
    build: (seed) => {
      const { spec } = baseSpec('coated-strings', seed);
      return { ...spec, look: { ...spec.look, strings: 'coated' } };
    },
  },
  {
    id: 'nylon',
    group: 'strings',
    what: 'classical: nylon, wide flat board, no dots, slotted head',
    build: (seed) => baseSpec('nylon', seed, 'classical').spec,
  },
  {
    id: 'seven-preset',
    group: 'neck',
    what: '7-string, tracker told "electric" (wrong model)',
    build: (seed) => baseSpec('seven-preset', seed, 'seven').spec,
  },
  {
    id: 'seven-model',
    group: 'neck',
    what: '7-string, tracker given a 7-string model',
    build: (seed) => {
      const { spec } = baseSpec('seven-model', seed, 'seven');
      return { ...spec, hints: { ...spec.hints, model: sevenStringModel() } };
    },
  },
  {
    id: 'bass-preset',
    group: 'neck',
    what: '4-string bass, tracker told "electric" (wrong model)',
    build: (seed) => {
      const { spec, r } = baseSpec('bass-preset', seed, 'bass');
      return { ...spec, view: { ...spec.view, spanFrac: r.range(0.42, 0.55), anchorFret: r.range(4, 6) } };
    },
  },
  {
    id: 'bass-model',
    group: 'neck',
    what: '4-string bass, tracker given a bass model',
    build: (seed) => {
      const { spec, r } = baseSpec('bass-model', seed, 'bass');
      return { ...spec, view: { ...spec.view, spanFrac: r.range(0.42, 0.55), anchorFret: r.range(4, 6) }, hints: { ...spec.hints, model: bassModel() } };
    },
  },
  {
    id: 'sleeve',
    group: 'occluder',
    what: 'long sleeve over the wrist and the treble edge',
    build: (seed) => {
      const { spec, r } = baseSpec('sleeve', seed);
      return { ...spec, occluders: [...spec.occluders, { kind: 'sleeve', color: r.pick<Rgb8>([[60, 70, 120], [140, 40, 40], [90, 90, 90], [200, 190, 170]]), pattern: r.pick(['plain', 'rib', 'check'] as const), reachMm: r.range(8, 20) }] };
    },
  },
  {
    id: 'capo-2',
    group: 'occluder',
    what: 'capo at fret 2 (nut still in view)',
    build: (seed) => capoScene('capo-2', seed, 2),
  },
  {
    id: 'capo-4',
    group: 'occluder',
    what: 'capo at fret 4 (nut still in view)',
    build: (seed) => capoScene('capo-4', seed, 4),
  },
  {
    id: 'capo-nonut',
    group: 'occluder',
    what: 'capo at fret 3, nut out of the frame',
    build: (seed) => {
      const spec = capoScene('capo-nonut', seed, 3);
      return { ...spec, view: { ...spec.view, spanFrac: 0.82, anchorFret: 8, u0: 0.6 } };
    },
  },
  {
    id: 'strap',
    group: 'occluder',
    what: 'strap tied at the headstock, over the nut',
    build: (seed) => {
      const { spec, r } = baseSpec('strap', seed);
      return { ...spec, occluders: [...spec.occluders, { kind: 'strap', color: r.pick<Rgb8>([[30, 30, 34], [120, 70, 40], [160, 30, 30]]), stripe: [220, 210, 180], widthMm: r.range(38, 55) }] };
    },
  },
  {
    id: 'stand-edge',
    group: 'occluder',
    what: 'music-stand edge crossing the neck',
    build: (seed) => {
      const { spec, r } = baseSpec('stand-edge', seed);
      return { ...spec, occluders: [...spec.occluders, { kind: 'stand', fret: r.range(8, 12), angleDeg: r.range(60, 120), widthPx: r.range(14, 26), color: [26, 26, 28] }] };
    },
  },
  {
    id: 'side-light',
    group: 'light',
    what: 'hard grazing side light, long fret shadows',
    build: (seed) => {
      const { spec, r } = baseSpec('side-light', seed);
      const along = r.pick([1, -1]);
      return { ...spec, light: { ...spec.light, dir: [along * 4.5, r.signed(0.6), 1], key: r.range(1.3, 1.7), ambient: r.range(0.06, 0.12), ramp: r.range(0.3, 0.5) } };
    },
  },
  {
    id: 'stage-light',
    group: 'light',
    what: 'saturated magenta / blue stage light, dark room',
    build: (seed) => {
      const { spec, r } = baseSpec('stage-light', seed);
      return {
        ...spec,
        backdrop: { ...spec.backdrop, kind: 'stage' },
        light: { ...spec.light, stage: { a: r.pick<Rgb8>([[255, 40, 160], [255, 120, 20]]), b: r.pick<Rgb8>([[40, 80, 255], [40, 220, 200]]), angleDeg: r.range(0, 180) }, ambient: 0.12, key: 0.8, keyColor: [255, 255, 255] },
      };
    },
  },
  {
    id: 'dim',
    group: 'light',
    what: 'very dim room, gain cranked up, heavy noise',
    build: (seed) => {
      const { spec, r } = baseSpec('dim', seed);
      return { ...spec, light: { ...spec.light, key: 0.07, ambient: 0.035 }, camera: { ...spec.camera, exposure: r.range(5, 7), shot: 0.02, read: 0.025, blotch: 0.02, quant: 4 } };
    },
  },
  {
    id: 'window',
    group: 'light',
    what: 'overexposed window behind, subject underexposed',
    build: (seed) => {
      const { spec, r } = baseSpec('window', seed);
      return { ...spec, backdrop: { ...spec.backdrop, kind: 'window' }, light: { ...spec.light, key: 0.15, ambient: r.range(0.18, 0.26) }, camera: { ...spec.camera, exposure: r.range(0.6, 0.85) } };
    },
  },
  {
    id: 'blinds-behind',
    group: 'distractor',
    what: 'guitar in front of window blinds',
    build: (seed) => {
      const { spec, r } = baseSpec('blinds-behind', seed);
      return { ...spec, backdrop: { ...spec.backdrop, kind: 'blinds', person: null, distractorSpan: r.range(0.8, 1.1), distractorTiltDeg: r.range(10, 40) } };
    },
  },
  {
    id: 'keyboard-behind',
    group: 'distractor',
    what: 'guitar with a keyboard in the background',
    build: (seed) => {
      const { spec, r } = baseSpec('keyboard-behind', seed);
      return { ...spec, backdrop: { ...spec.backdrop, kind: 'keyboard', person: null, distractorSpan: r.range(0.8, 1.0), distractorTiltDeg: r.range(30, 55) } };
    },
  },
  {
    id: 'wall-guitar',
    group: 'distractor',
    what: 'second guitar hanging on the wall behind',
    build: (seed) => {
      const { spec } = baseSpec('wall-guitar', seed);
      return { ...spec, backdrop: { ...spec.backdrop, kind: 'wall-guitar' } };
    },
  },
  ...(['keyboard', 'bookshelf', 'blinds', 'radiator', 'shirt'] as const).map(
    (kind): AltCondition => ({
      id: `neg-${kind}`,
      group: 'negative',
      what: `no guitar: ${kind === 'shirt' ? 'striped shirt' : kind}`,
      build: (seed) => {
        const { spec, r } = baseSpec(`neg-${kind}`, seed);
        const person = kind === 'shirt' ? { shirt: [230, 228, 220] as Rgb8, stripes: { color: r.pick<Rgb8>([[30, 40, 90], [20, 20, 20], [150, 30, 30]]), periodPx: r.range(6, 14), angleDeg: r.signed(20) }, skin: spec.hand?.skin ?? SKINS[1] } : null;
        return {
          ...spec,
          neck: null,
          hand: null,
          occluders: [],
          backdrop: { ...spec.backdrop, kind: kind === 'shirt' ? 'wall' : kind, person, distractorSpan: r.range(0.55, 0.95), distractorTiltDeg: r.range(15, 55) },
          view: { ...spec.view, stillFrames: 1e9 },
        };
      },
    }),
  ),
  {
    id: 'portrait',
    group: 'camera',
    what: 'phone in portrait (360x640 working frame)',
    build: (seed) => {
      const { spec, r } = baseSpec('portrait', seed);
      return { ...spec, width: 360, height: 640, view: { ...spec.view, spanFrac: r.range(0.62, 0.8), rollDeg: r.range(5, 30), v0: r.range(0.45, 0.6) } };
    },
  },
  {
    id: 'wide-angle',
    group: 'camera',
    what: 'wide-angle lens, strong barrel distortion, close',
    build: (seed) => {
      const { spec, r } = baseSpec('wide-angle', seed);
      return { ...spec, camera: { ...spec.camera, fovDeg: r.range(95, 110), k1: r.range(0.22, 0.32), k2: r.range(0.04, 0.08) }, view: { ...spec.view, spanFrac: r.range(0.6, 0.75) } };
    },
  },
  {
    id: 'low-res',
    group: 'camera',
    what: '320x240 camera, soft lens',
    build: (seed) => {
      const { spec } = baseSpec('low-res', seed);
      return { ...spec, width: 320, height: 240, camera: { ...spec.camera, psf: 0.8, quant: 4 } };
    },
  },
  {
    id: 'interlaced',
    group: 'camera',
    what: 'interlaced fields while the guitar sways',
    build: (seed) => {
      const { spec } = baseSpec('interlaced', seed);
      return { ...spec, camera: { ...spec.camera, interlaceS: 1 / 60 }, view: { ...spec.view, stillFrames: 4, swayPx: 18, swayRollDeg: 3, swayPeriodS: 1 } };
    },
  },
  {
    id: 'flicker',
    group: 'camera',
    what: 'rolling exposure flicker bands',
    build: (seed) => {
      const { spec, r } = baseSpec('flicker', seed);
      return { ...spec, camera: { ...spec.camera, flicker: r.range(0.15, 0.25), flickerRows: r.range(70, 140) } };
    },
  },
  {
    id: 'mirrored',
    group: 'orientation',
    what: 'mirrored selfie frames, tracker told',
    build: (seed) => {
      const { spec } = baseSpec('mirrored', seed);
      return { ...spec, camera: { ...spec.camera, mirrored: true }, hints: { ...spec.hints, mirrored: true } };
    },
  },
  {
    id: 'mirror-untold',
    group: 'orientation',
    what: 'mirrored frames, tracker NOT told',
    build: (seed) => {
      const { spec } = baseSpec('mirror-untold', seed);
      return { ...spec, camera: { ...spec.camera, mirrored: true } };
    },
  },
  {
    id: 'lefty',
    group: 'orientation',
    what: 'left-handed guitar, tracker told',
    build: (seed) => {
      const { spec } = baseSpec('lefty', seed);
      return { ...spec, view: { ...spec.view, leftHanded: true, u0: 1 - spec.view.u0 }, hints: { ...spec.hints, leftHanded: true } };
    },
  },
];

function capoScene(id: string, seed: number, fret: number): AltSpec {
  const { spec, r } = baseSpec(id, seed);
  const cell = fret + r.int(1, 3);
  const hand: AltHand | null = spec.hand ? { ...spec.hand, cell, fingers: spec.hand.fingers.map((f, i) => ({ ...f, cell: cell + i })) } : null;
  return {
    ...spec,
    hand,
    capo: { fret, style: r.pick(['trigger', 'clamp', 'elastic'] as const), color: r.pick<Rgb8>([[24, 24, 26], [200, 200, 204], [210, 170, 90], [30, 30, 120]]), side: r.pick(['bass', 'treble'] as const) },
  };
}

/** A typical 7-string neck as a `NeckModel` (what a learner would pick for one). */
export function sevenStringModel(): NeckModel {
  return { preset: 'custom', scaleLength: 648, nutWidth: 48, width12: 58, stringSpanNut: 41, stringSpanBridge: 62, stringCount: 7, fretCount: 24, bodyJoinFret: 19 };
}

/** A typical 4-string bass neck as a `NeckModel`. */
export function bassModel(): NeckModel {
  return { preset: 'custom', scaleLength: 864, nutWidth: 40, width12: 56, stringSpanNut: 31, stringSpanBridge: 57, stringCount: 4, fretCount: 20, bodyJoinFret: 16 };
}

/** The condition with this id (throws for an unknown id: a typo in an env switch should be loud). */
export function altCondition(id: string): AltCondition {
  const c = ALT_CONDITIONS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown alt condition ${id}`);
  return c;
}

/** Variants of the common scene for an operating-limits sweep: one knob turned, everything else typical. */
export function altSweepScene(knob: 'span' | 'tilt' | 'light', value: number, seed: number): AltSpec {
  const { spec } = baseSpec(`sweep-${knob}`, seed);
  if (knob === 'span') return { ...spec, view: { ...spec.view, spanFrac: value, anchorFret: Math.min(spec.view.anchorFret, 5) } };
  if (knob === 'tilt') return { ...spec, view: { ...spec.view, tiltDeg: value, tiltAxisDeg: spec.view.tiltAxisDeg } };
  // Light: scene radiance scaled by `value` with the camera's gain compensating up to 8x (noise grows with the gain).
  const gain = Math.min(8, 1 / value);
  return { ...spec, light: { ...spec.light, key: spec.light.key * value, ambient: spec.light.ambient * value }, camera: { ...spec.camera, exposure: spec.camera.exposure * gain, read: spec.camera.read * Math.sqrt(gain), shot: spec.camera.shot * Math.sqrt(gain), blotch: spec.camera.blotch + 0.004 * (gain - 1) } };
}
