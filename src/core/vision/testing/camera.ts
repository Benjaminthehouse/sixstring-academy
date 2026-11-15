/**
 * The synthetic camera of the scene renderer: a pinhole looking at the neck plane, plus the slight
 * barrel distortion of a cheap lens, plus the ground-truth homography a detector is scored against.
 */
import { boardEdgeY, fretX, homographyFromPoints } from '../geometry';
import type { Mat3, NeckModel, Point } from '../types';

/** How the guitar sits in front of the camera. Angles in degrees. */
export interface ViewSpec {
  /** Horizontal field of view of the camera. */
  fovDeg: number;
  /** In-plane rotation of the neck; positive raises the headstock (the usual playing posture). */
  rollDeg: number;
  /** Rotation about the vertical axis; positive brings the headstock toward the camera. */
  yawDeg: number;
  /** Rotation about the neck axis; positive tips the bass edge away (the board faces up toward the player). */
  pitchDeg: number;
  /** Pixels per millimetre at the anchor for a 640-pixel-wide frame (scaled with the real width). */
  pxPerMm: number;
  /** The point of the board centre line, as a fractional fret, that sits at (anchorU, anchorV). */
  anchorFret: number;
  /** Anchor position as a fraction of the frame width / height. */
  anchorU: number;
  anchorV: number;
  /** Radial distortion k1 relative to the half diagonal: negative = barrel. */
  distortion: number;
}

/** Focal length in pixels for a horizontal field of view. */
export function focalLengthPx(fovDeg: number, width: number): number {
  return width / 2 / Math.tan((fovDeg * Math.PI) / 360);
}

/**
 * Pinhole homography K [a b t] from neck-plane mm to image pixels for a right-handed player in a
 * true image, then flipped horizontally (`flipX`: left-handed XOR mirrored) and/or turned upside
 * down (`rotate180`: bass side at the bottom). The matrix is NOT normalised: its projective weight
 * is the depth of the point in mm, which the renderer uses for unforeshortened sizes.
 */
export function viewHomography(view: ViewSpec, model: NeckModel, width: number, height: number, flipX = false, rotate180 = false): Mat3 {
  const f = focalLengthPx(view.fovDeg, width);
  const roll = (view.rollDeg * Math.PI) / 180;
  const yaw = (view.yawDeg * Math.PI) / 180;
  const pitch = (view.pitchDeg * Math.PI) / 180;
  // Camera axes: X right, Y down, Z forward. Fronto-parallel: neck x points left, neck y points down.
  let a: [number, number, number] = [-1, 0, 0];
  let b: [number, number, number] = [0, Math.cos(pitch), -Math.sin(pitch)];
  const ry = (p: [number, number, number]): [number, number, number] => [Math.cos(yaw) * p[0] + Math.sin(yaw) * p[2], p[1], -Math.sin(yaw) * p[0] + Math.cos(yaw) * p[2]];
  // Raising the headstock (on the right) is a counter-clockwise turn on screen, where y points down.
  const rz = (p: [number, number, number]): [number, number, number] => [Math.cos(roll) * p[0] + Math.sin(roll) * p[1], -Math.sin(roll) * p[0] + Math.cos(roll) * p[1], p[2]];
  a = rz(ry(a));
  b = rz(ry(b));
  const scale = (view.pxPerMm * width) / 640;
  const Z = f / scale;
  const cx = width / 2;
  const cy = height / 2;
  const anchor = [((view.anchorU * width - cx) * Z) / f, ((view.anchorV * height - cy) * Z) / f, Z];
  const ax = fretX(model, view.anchorFret);
  const ay = model.nutWidth / 2;
  const t = [anchor[0] - ax * a[0] - ay * b[0], anchor[1] - ax * a[1] - ay * b[1], anchor[2] - ax * a[2] - ay * b[2]];
  let h: number[] = [
    f * a[0] + cx * a[2], f * b[0] + cx * b[2], f * t[0] + cx * t[2],
    f * a[1] + cy * a[2], f * b[1] + cy * b[2], f * t[1] + cy * t[2],
    a[2], b[2], t[2],
  ];
  if (flipX) h = [width * h[6] - h[0], width * h[7] - h[1], width * h[8] - h[2], h[3], h[4], h[5], h[6], h[7], h[8]];
  if (rotate180) {
    h = [width * h[6] - h[0], width * h[7] - h[1], width * h[8] - h[2], height * h[6] - h[3], height * h[7] - h[4], height * h[8] - h[5], h[6], h[7], h[8]];
  }
  return h as unknown as Mat3;
}

/** Where a pinhole image point lands after lens distortion. */
export function distortPoint(k1: number, width: number, height: number, u: number, v: number): Point {
  if (k1 === 0) return { x: u, y: v };
  const cx = width / 2;
  const cy = height / 2;
  const r2 = ((u - cx) * (u - cx) + (v - cy) * (v - cy)) / (cx * cx + cy * cy);
  const s = 1 + k1 * r2;
  return { x: cx + (u - cx) * s, y: cy + (v - cy) * s };
}

/** For every output pixel centre, the pinhole image position that the lens maps there. */
export function undistortMaps(k1: number, width: number, height: number): { ux: Float32Array; uy: Float32Array } {
  const ux = new Float32Array(width * height);
  const uy = new Float32Array(width * height);
  const cx = width / 2;
  const cy = height / 2;
  const R2 = cx * cx + cy * cy;
  if (k1 === 0) {
    for (let y = 0, i = 0; y < height; y++) {
      for (let x = 0; x < width; x++, i++) {
        ux[i] = x + 0.5;
        uy[i] = y + 0.5;
      }
    }
    return { ux, uy };
  }
  for (let y = 0; y < height; y++) {
    const dy = y + 0.5 - cy;
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - cx;
      let s = 1;
      if (k1 !== 0) {
        // Invert r_d = r_u (1 + k1 r_u^2) by fixed-point iteration; converges quickly for slight distortion.
        const rd2 = (dx * dx + dy * dy) / R2;
        for (let it = 0; it < 4; it++) s = 1 / (1 + k1 * rd2 * s * s);
      }
      const i = y * width + x;
      ux[i] = cx + dx * s;
      uy[i] = cy + dy * s;
    }
  }
  return { ux, uy };
}

/**
 * The homography a detector is scored against. Without distortion it is the pinhole homography;
 * with distortion it is the least-squares homography through the distorted positions of the board
 * points in (or near) the frame, i.e. the best any homography-based overlay could do.
 */
export function fitTruthHomography(pinhole: Mat3, k1: number, model: NeckModel, width: number, height: number): { H: Mat3; residualPx: number } {
  const scale = Math.abs(pinhole[8]) > 0 ? pinhole[8] : 1;
  const normalised = pinhole.map((v) => v / scale) as unknown as Mat3;
  if (k1 === 0) return { H: normalised, residualPx: 0 };
  const plane: Point[] = [];
  const image: Point[] = [];
  const mx = width * 0.15;
  const my = height * 0.15;
  for (let n = 0; n <= model.fretCount; n++) {
    const x = fretX(model, n);
    for (const y of [boardEdgeY(model, x, 'bass'), model.nutWidth / 2, boardEdgeY(model, x, 'treble')]) {
      const w = pinhole[6] * x + pinhole[7] * y + pinhole[8];
      if (!(w > 1e-9)) continue;
      const p = distortPoint(k1, width, height, (pinhole[0] * x + pinhole[1] * y + pinhole[2]) / w, (pinhole[3] * x + pinhole[4] * y + pinhole[5]) / w);
      if (p.x < -mx || p.x > width + mx || p.y < -my || p.y > height + my) continue;
      plane.push({ x, y });
      image.push(p);
    }
  }
  const H = plane.length >= 6 ? homographyFromPoints(plane, image) : null;
  if (!H) return { H: normalised, residualPx: NaN };
  let sum = 0;
  for (let i = 0; i < plane.length; i++) {
    const w = H[6] * plane[i].x + H[7] * plane[i].y + H[8];
    const du = (H[0] * plane[i].x + H[1] * plane[i].y + H[2]) / w - image[i].x;
    const dv = (H[3] * plane[i].x + H[4] * plane[i].y + H[5]) / w - image[i].y;
    sum += du * du + dv * dv;
  }
  return { H, residualPx: Math.sqrt(sum / plane.length) };
}
