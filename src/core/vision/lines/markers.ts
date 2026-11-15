/**
 * Marker mode: two bright stickers at known frets (see `MarkerHint`) settle the fret numbering when
 * neither the nut nor the inlays can. The board is already located; for every possible whole-fret
 * shift the places where the stickers would then be are looked at in the colour frame, and the
 * shift under which both places are strongly coloured (in the hinted hue, if given) wins.
 */
import { applyHomography, markerHintPlanePoints } from '../geometry';
import type { Frame, MarkerHint, Mat3, NeckModel } from '../types';

/** Result of `resolveMarkers`. */
export interface MarkerResult {
  /** Add this to every current fret number. */
  delta: number;
  /** 0..1: how saturated (and how close to the hinted hue) the sticker places are under that shift. */
  score: number;
  /** Lead over the next best shift. */
  margin: number;
}

/** Hue in degrees (0 red, 120 green, 240 blue) and saturation 0..1 of an RGB triple. */
export function hueSaturation(r: number, g: number, b: number): { hue: number; saturation: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const c = max - min;
  if (max <= 0 || c <= 0) return { hue: 0, saturation: 0 };
  let h: number;
  if (max === r) h = ((g - b) / c) % 6;
  else if (max === g) h = (b - r) / c + 2;
  else h = (r - g) / c + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { hue: h, saturation: c / max };
}

/** How sticker-like the neighbourhood of an image point is: the mean of its most colourful third of pixels. */
function stickerness(frame: Frame, x: number, y: number, radius: number, hue: number | undefined): number {
  const r = Math.max(1, Math.round(radius));
  const cx = Math.round(x - 0.5);
  const cy = Math.round(y - 0.5);
  const values: number[] = [];
  for (let yy = cy - r; yy <= cy + r; yy++) {
    for (let xx = cx - r; xx <= cx + r; xx++) {
      if (xx < 0 || yy < 0 || xx >= frame.width || yy >= frame.height) continue;
      const i = (yy * frame.width + xx) * 4;
      const hs = hueSaturation(frame.data[i], frame.data[i + 1], frame.data[i + 2]);
      // Stickers are bright as well as colourful; dark saturated pixels are noise in shadows.
      const bright = Math.max(frame.data[i], frame.data[i + 1], frame.data[i + 2]) / 255;
      let v = hs.saturation * Math.min(1, bright * 1.5);
      if (hue !== undefined) {
        let d = Math.abs(hs.hue - hue) % 360;
        if (d > 180) d = 360 - d;
        v *= Math.max(0, 1 - d / 70);
      }
      values.push(v);
    }
  }
  if (values.length < 4) return 0;
  values.sort((a, b) => b - a);
  const top = Math.max(1, Math.floor(values.length / 3));
  let sum = 0;
  for (let k = 0; k < top; k++) sum += values[k];
  return sum / top;
}

/**
 * Find the whole-fret shift under which the stickers of `hint` are where the pose expects them.
 * `H` maps plane mm to pixels of `frame`. Returns null when no shift shows both stickers clearly.
 */
export function resolveMarkers(frame: Frame, H: Mat3, model: NeckModel, hint: MarkerHint, reach = 16): MarkerResult | null {
  if (!hint.frets || hint.frets.length === 0) return null;
  let best: MarkerResult | null = null;
  let second = 0;
  for (let delta = -reach; delta <= reach; delta++) {
    // Under this shift the sticker at true fret f sits where the pose now has fret f - delta
    // (possibly a negative number: beyond what the pose currently takes for the nut).
    const shifted = hint.frets.map((f) => f - delta);
    const points = markerHintPlanePoints(model, { ...hint, frets: shifted });
    let score = 0;
    let seen = 0;
    for (const p of points) {
      const at = applyHomography(H, p.x, p.y);
      if (!(at.x >= 0 && at.x < frame.width && at.y >= 0 && at.y < frame.height)) continue;
      // Patch radius: about 4 mm on the neck.
      const near = applyHomography(H, p.x + 4, p.y);
      const radius = Math.max(1.5, Math.hypot(near.x - at.x, near.y - at.y));
      score += stickerness(frame, at.x, at.y, radius, hint.hue);
      seen++;
    }
    if (seen < points.length) continue;
    score /= points.length;
    if (!best || score > best.score) {
      if (best) second = Math.max(second, best.score);
      best = { delta, score, margin: 0 };
    } else if (score > second) second = score;
  }
  if (!best) return null;
  best.margin = best.score - second;
  return best.score >= 0.3 && best.margin >= 0.12 ? best : null;
}
