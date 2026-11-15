/**
 * Stages 2 and 3 of detection tied together: from a candidate axis to a pose hypothesis.
 *
 * Pass 1 runs the comb search along the raw candidate line (which may cut the board at an angle
 * and so cross only a few frets), traces those frets to the board edges and takes the midline of
 * the edges. Pass 2 repeats along the midline, where every visible fret is crossed. The result is
 * a `BoardMeasurement`: fret lines with relative indices plus two edges, from which a homography
 * can be computed for any absolute numbering.
 */
import { expectedOrientation } from '../geometry';
import type { Mat3, NeckModel } from '../types';
import type { AxisCandidate, RidgeField } from './axis';
import { clipLine, findCombs, findPeaks, sampleLineProfile, type Comb, type LineProfile, type NormalModel } from './comb';
import type { GrayImage } from './image';
import { estimateNormalModel, guessNumberingOffset, homographyFromStrip, measureStrip, normalModelFromTraces, stripMidline, type Strip } from './strip';

/** What the caller knows about how the guitar is held (from `DetectOptions`). */
export interface OrientationHints {
  bassSideUp: boolean;
  mirrored: boolean;
  leftHanded: boolean;
}

/**
 * The direction from the nut toward the bridge along an image line with direction (lx, ly), as far
 * as the hints decide it: +1 = along (lx, ly), -1 = against it, 0 = undecided (the neck stands too
 * upright in the image for "bass side up" to mean anything).
 */
export function bridgeDirection(lx: number, ly: number, hints: OrientationHints): 1 | -1 | 0 {
  void ly;
  if (Math.abs(lx) < 0.3) return 0;
  // The bass edge is above the centre line exactly when orientation * ux > 0 (see README).
  const want = expectedOrientation(hints.mirrored, hints.leftHanded) * (hints.bassSideUp ? 1 : -1);
  return lx * want > 0 ? 1 : -1;
}

/** True when the traced "plus" side (-uy, ux) of a line directed nut -> bridge is the bass side. */
export function plusSideIsBass(hints: OrientationHints): boolean {
  // bass direction = orientation * (uy, -ux); the plus side is (-uy, ux).
  return expectedOrientation(hints.mirrored, hints.leftHanded) < 0;
}

/** Everything measured about one board hypothesis. */
export interface BoardMeasurement {
  /** The line the final comb was found on, directed nut -> bridge. */
  profile: LineProfile;
  comb: Comb;
  strip: Strip;
  polarity: 1 | -1;
  normal: NormalModel;
  /** True when the strip's plus side is the bass edge. */
  plusIsBass: boolean;
  /** Suggested numbering: comb fret j is model fret j + offset (a rough guess from proportions). */
  offsetGuess: number;
}

/** Tunables of the hypothesis stage. */
export interface HypothesisOptions {
  /** Minimum matched frets for a comb (default 5). */
  minFrets?: number;
}

function runPass(
  fine: GrayImage,
  coarse: GrayImage,
  px: number,
  py: number,
  ux: number,
  uy: number,
  normalOf: (x0: number, y0: number, length: number) => NormalModel,
  polarity: 1 | -1,
  halfBand: number,
  hints: OrientationHints,
  minFrets: number,
): { profile: LineProfile; comb: Comb; strip: Strip; normal: NormalModel }[] {
  // The normal model is expressed along the clipped line, so clip first.
  const clip = clipLine(fine.width, fine.height, px, py, ux, uy, 4);
  if (!clip) return [];
  const normal = normalOf(px + clip.t0 * ux, py + clip.t0 * uy, Math.floor(clip.t1 - clip.t0) + 1);
  const profile = sampleLineProfile(fine, coarse, px, py, ux, uy, normal, polarity, halfBand);
  if (!profile) return [];
  const peaks = findPeaks(profile);
  if (peaks.length < minFrets) return [];
  const dir = bridgeDirection(ux, uy, hints);
  const combs = findCombs(peaks, profile.count, { directions: dir === 0 ? [1, -1] : [dir], minFrets, maxCombs: 3 });
  const out: { profile: LineProfile; comb: Comb; strip: Strip; normal: NormalModel }[] = [];
  for (const comb of combs) {
    // A runner-up is only worth measuring when it is nearly as good as the best comb, or fits much more tightly.
    if (out.length > 0 && comb.score < 0.8 * combs[0].score && !(comb.rms < 0.6 * combs[0].rms && comb.score > 0.5 * combs[0].score)) continue;
    if (out.length >= 2) break;
    const strip = measureStrip(fine, coarse, profile, comb, normal, polarity);
    if (!strip) continue;
    out.push({ profile, comb, strip, normal });
  }
  return out;
}

/** Measure the board along a candidate axis. Returns up to two alternatives (different combs), best first. */
export function measureBoard(fine: GrayImage, coarse: GrayImage, field: RidgeField, candidate: AxisCandidate, hints: OrientationHints, model: NeckModel, options: HypothesisOptions = {}): BoardMeasurement[] {
  const minFrets = options.minFrets ?? 5;
  const a = (candidate.thetaDeg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const first = runPass(
    fine,
    coarse,
    candidate.cx,
    candidate.cy,
    ux,
    uy,
    (x0, y0, length) => estimateNormalModel(field, x0, y0, ux, uy, length, candidate.polarity, candidate.ridgeNormalDeg),
    candidate.polarity,
    4,
    hints,
    4,
  );
  const out: BoardMeasurement[] = [];
  for (const pass1 of first) {
    const mid = stripMidline(pass1.strip, ux, uy);
    if (!mid) continue;
    const fallback = pass1.normal;
    // Pool over a wider stretch of each fret now that the line runs down the middle of the board.
    let meanLen = 0;
    for (const f of pass1.strip.frets) meanLen += f.length;
    meanLen /= pass1.strip.frets.length;
    const second = runPass(
      fine,
      coarse,
      mid.px,
      mid.py,
      mid.dx,
      mid.dy,
      (x0, y0) => normalModelFromTraces(pass1.strip.frets, x0, y0, mid.dx, mid.dy, fallback),
      candidate.polarity,
      Math.max(4, Math.min(16, 0.22 * meanLen)),
      hints,
      minFrets,
    );
    for (const pass2 of second) {
      if (!pass2.strip.edgePlus || !pass2.strip.edgeMinus) continue;
      // Direct the profile nut -> bridge: the comb's direction says which way that is.
      const flip = pass2.comb.dir < 0;
      const plusIsBass = plusSideIsBass(hints) !== flip;
      out.push({
        profile: pass2.profile,
        comb: pass2.comb,
        strip: pass2.strip,
        polarity: candidate.polarity,
        normal: pass2.normal,
        plusIsBass,
        offsetGuess: guessNumberingOffset(pass2.strip, pass2.comb, model),
      });
    }
    if (out.length >= 2) break;
  }
  return out;
}

/** Homography of a measurement for a numbering offset (comb fret j = model fret j + offset). */
export function measurementHomography(m: BoardMeasurement, model: NeckModel, offset: number): Mat3 | null {
  return homographyFromStrip(m.strip, model, offset, m.plusIsBass);
}
