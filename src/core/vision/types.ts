/**
 * Shared types for the live fretboard camera (`core/vision`).
 *
 * COORDINATES EVERYONE SHARES
 *
 *  - Neck plane, millimetres. `x` runs along the strings from the nut (x = 0) toward the bridge.
 *    `y` runs across the neck from the bass side to the treble side; y = 0 is the bass-side edge of
 *    the board AT THE NUT. The board centre line is the straight line y = nutWidth / 2 and the board
 *    tapers symmetrically around it, so further up the neck the bass edge sits at slightly negative y.
 *    Fret wire n is at x = scaleLength * (1 - 2^(-n/12)); n = 0 is the nut.
 *  - Image, pixels. Continuous coordinates with the origin at the top-left corner of the frame; `x`
 *    grows to the right, `y` grows DOWN. The centre of pixel (column c, row r) is (c + 0.5, r + 0.5)
 *    and the frame covers [0, width] x [0, height]. With this convention a pose computed on a
 *    downscaled working frame is moved to full resolution by a plain scale (`scalePose`).
 *  - Strings are numbered the guitarist's way: 1 = thinnest / treble side, `stringCount` = bass side.
 *    Fret 0 = open string; a fretted note at fret n is played in the cell between wire n-1 and wire n.
 *
 * Everything here is plain data (structured-clone safe) so poses cross the Web Worker boundary.
 */

/** RGBA camera frame, row-major, 4 bytes per pixel (the layout of `ImageData`). */
export interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Single-channel luminance image, row-major. `Uint8Array` holds 0..255, `Float32Array` holds 0..1. */
export interface GrayFrame {
  data: Uint8Array | Float32Array;
  width: number;
  height: number;
}

/** A 2-D point: millimetres in the neck plane or pixels in the image, depending on context. */
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned rectangle in image pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 3x3 matrix in row-major order: [m00, m01, m02, m10, m11, m12, m20, m21, m22]. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** Homogeneous 2-D line [a, b, c] meaning a*x + b*y + c = 0. Helpers keep (a, b) at unit length. */
export type Line = readonly [number, number, number];

/** Built-in neck geometries. */
export type NeckPresetId = 'steel' | 'electric' | 'classical';

/** Physical dimensions of a fretboard, in millimetres. See `NECK_PRESETS` for defaults. */
export interface NeckModel {
  /** Preset this model started from, or 'custom'. */
  preset: NeckPresetId | 'custom';
  /** Nut to saddle (about 648 on most guitars, 628-650 in practice). */
  scaleLength: number;
  /** Board width at the nut. */
  nutWidth: number;
  /** Board width at the 12th fret; the taper is linear in x. */
  width12: number;
  /** Distance between the centres of the two outer strings at the nut. */
  stringSpanNut: number;
  /** Distance between the centres of the two outer strings at the saddle (x = scaleLength). */
  stringSpanBridge: number;
  /** Number of strings (6). */
  stringCount: number;
  /** Number of fret wires, not counting the nut. */
  fretCount: number;
  /** Fret at which the neck meets the body (12 classical, 14 steel-string, about 17 electric). */
  bodyJoinFret: number;
}

/** Inclusive range of fret wires (0 = nut). Empty when max < min. */
export interface FretRange {
  min: number;
  max: number;
}

/**
 * What the absolute fret numbering rests on. Fret spacing is self-similar, so geometry alone cannot
 * tell fret 5 from fret 7: a pose must say where its numbers come from.
 *  - 'nut'      the nut / headstock was seen
 *  - 'inlays'   the inlay pattern (double dot at 12, gaps) was matched
 *  - 'markers'  stickers at known frets (marker mode)
 *  - 'user'     four-point calibration or a one-tap fret confirmation
 *  - 'tracked'  carried over from an earlier locked pose
 *  - 'assumed'  a guess (for example "the lowest visible fret is probably 1") - ask the user
 */
export type NumberingSource = 'nut' | 'inlays' | 'markers' | 'user' | 'tracked' | 'assumed';

/** Where the fretboard is in a frame: everything an overlay needs to draw on the right string and fret. */
export interface FretboardPose {
  /** Homography from neck-plane millimetres to image pixels of the frame the pose refers to. */
  H: Mat3;
  /** Neck dimensions the homography was fitted with. */
  model: NeckModel;
  /** 0..1: how sure the detector is that the board is where `H` says. */
  confidence: number;
  /** Fret wires whose midpoint lies inside the frame (geometry only; a hand may still cover them). */
  visibleFrets: FretRange;
  /** True when the frame is a mirrored (selfie-preview) image of the scene. */
  mirrored: boolean;
  /** True for a left-handed player (the neck points the other way). */
  leftHanded: boolean;
  /** What the fret numbers rest on. */
  numbering: NumberingSource;
  /** 0..1: how sure the detector is that fret n really is fret n. Below 0.5 the UI should ask for a tap. */
  numberingConfidence: number;
  /** Size of the frame `H` maps into, so a consumer can rescale to its own canvas. */
  frameWidth: number;
  frameHeight: number;
}

/** A fretted position, guitarist numbering (string 1 = high E; fret 0 = open). */
export interface FretPosition {
  string: number;
  fret: number;
}

/** Result of mapping a pixel back onto the neck (`locatePixel`). */
export interface PixelLocation {
  /** Neck-plane position in millimetres. */
  x: number;
  y: number;
  /** Fret cell the point falls in: 0 behind the nut, n between wire n-1 and wire n. */
  fret: number;
  /** Continuous fret coordinate (5.0 is exactly on wire 5; 4.5 is not the middle of the cell in mm). */
  fretExact: number;
  /** Nearest string, 1 = treble side. */
  string: number;
  /** Signed distance to that string in units of the local string spacing (positive = toward treble). */
  stringOffset: number;
  /** True when the point lies on the board (between the nut and the board end, within its edges). */
  onBoard: boolean;
}

/** "This pixel is on fret N": the one-tap confirmation used when numbering is ambiguous. */
export interface FretHint {
  point: Point;
  fret: number;
}

/** Marker mode: bright stickers / tape at known frets, used as a robust anchor. */
export interface MarkerHint {
  /** Frets the stickers mark, ascending (for example [3, 12]). Each sits mid-way between wire n-1 and wire n, like an inlay dot. */
  frets: number[];
  /** Where they are stuck: straddling the bass-side (default) or treble-side edge of the board, or on the board's centre line. */
  placement?: 'bass-edge' | 'treble-edge' | 'board';
  /** Approximate sticker hue in degrees (0 red, 120 green, 300 magenta), if known. */
  hue?: number;
}

/** Hints a caller may give `detect`. All optional; defaults are the common webcam case. */
export interface DetectOptions {
  /** The low (bass) string is toward the top of the image. Default true (camera facing the player). */
  bassSideUp?: boolean;
  /** The frame is mirrored (selfie preview). Default false. */
  mirrored?: boolean;
  /** Left-handed player. Default false. */
  leftHanded?: boolean;
  /** Guitar type or exact neck dimensions. Default 'steel'. */
  model?: NeckPresetId | NeckModel;
  /** Rough region to search: a rectangle, or a quadrilateral (4 points) around the neck. */
  region?: Rect | Point[];
  /** An earlier pose (possibly stale) to bias the search and to carry fret numbering over. */
  previousPose?: FretboardPose;
  /** One-tap fret confirmation. */
  fretHint?: FretHint;
  /** Marker mode. */
  markers?: MarkerHint;
  /** Capture time of the frame in milliseconds, for trackers that model velocity. */
  timeMs?: number;
}

/** One intermediate feature for debugging overlays: 1 point = dot, 2+ points = polyline. */
export interface DiagnosticFeature {
  /** Free-form tag, e.g. 'edge-segment', 'fret-candidate', 'string', 'roi', 'board-quad'. */
  kind: string;
  /** Image-pixel points. */
  points: Point[];
  /** Close the polyline into a polygon. */
  closed?: boolean;
  /** Detector-specific strength, any scale. */
  score?: number;
  /** Short text to print next to the first point. */
  label?: string;
}

/** What a detector did, for debugging overlays and profiling. */
export interface DetectionDiagnostics {
  /** Milliseconds per named stage. Always includes `total`. */
  timings: Record<string, number>;
  /** Short machine-readable tag for why no pose was returned or why confidence is low. */
  reason?: string;
  /** Intermediate features in image pixels. Omit in production to avoid allocation. */
  features?: DiagnosticFeature[];
  /** Named counters / scores (candidate counts, inlier ratios, ...). */
  stats?: Record<string, number>;
}

/** Return value of `detect` and `track`. `pose` is null when the board was not found. */
export interface DetectionResult {
  pose: FretboardPose | null;
  diagnostics: DetectionDiagnostics;
}

/**
 * The interface every fretboard detector implements. Both methods are synchronous (they run inside a
 * Web Worker on a downscaled frame) and must never throw on a valid frame: return `pose: null`.
 */
export interface Detector {
  /** Short name for benchmark tables. */
  readonly name: string;
  /** Find the board from scratch. Returns null rather than a guess when no guitar is in view. */
  detect(frame: Frame, options?: DetectOptions): DetectionResult;
  /**
   * Update a pose from the previous frame. Must keep the fret numbering of `previousPose`. Returns
   * null when the board is lost, after which the caller falls back to `detect`.
   */
  track(frame: Frame, previousPose: FretboardPose, options?: DetectOptions): DetectionResult;
  /** Forget any internal temporal state (called when the camera restarts). */
  reset?(): void;
}
