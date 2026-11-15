/**
 * The player: torso and shirt (plain or striped), neck, head and hair, both arms, the fretting hand
 * as articulated skin-toned capsules with a thumb, the picking hand, and a large occluder for
 * sequence events. Limbs are drawn in image space from anchor points projected off the neck plane,
 * so a finger stays round however the board is tilted.
 */
import { boardWidthAt, fretX, stringY } from '../geometry';
import type { Mat3, NeckModel, Point } from '../types';
import { capsuleBounds, capsuleSdf, ellipseSdf, fillShape, roundBoxSdf, shadeShape, type RenderTarget, type Sdf, type Shader } from './raster';
import { fbm2 as importedFbm2, valueNoise as importedValueNoise } from './rng';
import type { HandSpec, OccluderSpec, PersonSpec, Rgb } from './scene';

// Local bindings keep per-pixel calls direct (see guitar.ts).
const fbm2 = importedFbm2;
const valueNoise = importedValueNoise;

/** What the limb painters need to know about the view. */
export interface PeopleContext {
  t: RenderTarget;
  /** Un-normalised pinhole homography (projective weight = depth in mm). */
  H: Mat3;
  /** Focal length in pixels. */
  focal: number;
  model: NeckModel;
  /** Image-space direction the key light comes from. */
  lightX: number;
  lightY: number;
  seed: number;
}

interface Anchor {
  x: number;
  y: number;
  /** Pixels per millimetre for an object facing the camera at this depth. */
  s: number;
}

function project(ctx: PeopleContext, x: number, y: number): Anchor {
  const H = ctx.H;
  const w = Math.max(1, H[6] * x + H[7] * y + H[8]);
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w, s: ctx.focal / w };
}

/** Draw a capsule shaded like a lit cylinder. `pattern` may recolour it per pixel (stripes, folds). */
function drawLimb(ctx: PeopleContext, a: Point, b: Point, ra: number, rb: number, color: Rgb, pattern?: (x: number, y: number, out: Float32Array) => void, ambient = 0.5): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-9;
  let nx = 0;
  let ny = 0;
  let rr = 1;
  const sdf: Sdf = (x, y) => {
    let h = ((x - a.x) * dx + (y - a.y) * dy) / len2;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    nx = x - a.x - h * dx;
    ny = y - a.y - h * dy;
    rr = ra + (rb - ra) * h;
    return Math.sqrt(nx * nx + ny * ny) - rr;
  };
  // Light from the given image direction and from the camera side.
  const ll = Math.hypot(ctx.lightX, ctx.lightY, 0.9);
  const lx = ctx.lightX / ll;
  const ly = ctx.lightY / ll;
  const lz = 0.9 / ll;
  const shader: Shader = (x, y, _d, out) => {
    const ux = nx / rr;
    const uy = ny / rr;
    const q = 1 - ux * ux - uy * uy;
    const nz = q > 0 ? Math.sqrt(q) : 0;
    const diffuse = Math.max(0, ux * lx + uy * ly + nz * lz);
    const k = ambient + (1.15 - ambient) * diffuse;
    if (pattern) {
      pattern(x, y, out);
      out[0] *= k;
      out[1] *= k;
      out[2] *= k;
    } else {
      out[0] = color[0] * k;
      out[1] = color[1] * k;
      out[2] = color[2] * k;
    }
  };
  const [x0, y0, x1, y1] = capsuleBounds(a.x, a.y, b.x, b.y, ra, rb);
  fillShape(ctx.t, x0, y0, x1, y1, sdf, shader);
}

/** Soft contact shadow of a capsule onto whatever is already on the subject layer. */
function limbShadow(ctx: PeopleContext, a: Point, b: Point, ra: number, rb: number, strength: number): void {
  const off = Math.max(1.5, 0.35 * Math.max(ra, rb));
  const ox = -ctx.lightX * off;
  const oy = -ctx.lightY * off;
  const sdf = capsuleSdf(a.x + ox, a.y + oy, b.x + ox, b.y + oy, ra + 0.6, rb + 0.6);
  const [x0, y0, x1, y1] = capsuleBounds(a.x + ox, a.y + oy, b.x + ox, b.y + oy, ra + 1, rb + 1);
  shadeShape(ctx.t, x0, y0, x1, y1, sdf, strength, Math.max(2, off));
}

interface PersonFrame {
  origin: Anchor;
  upX: number;
  upY: number;
  rightX: number;
  rightY: number;
  /** +1 when the neck points to the right of the image. */
  dir: number;
}

function personFrame(ctx: PeopleContext, person: PersonSpec): PersonFrame {
  const m = ctx.model;
  const yc = m.nutWidth / 2;
  const origin = project(ctx, m.scaleLength - 120, yc);
  const nut = project(ctx, 0, yc);
  const lean = (person.leanDeg * Math.PI) / 180;
  return { origin, upX: Math.sin(lean), upY: -Math.cos(lean), rightX: Math.cos(lean), rightY: Math.sin(lean), dir: nut.x >= origin.x ? 1 : -1 };
}

function at(f: PersonFrame, right: number, up: number): Point {
  const s = f.origin.s;
  return { x: f.origin.x + (f.rightX * right + f.upX * up) * s, y: f.origin.y + (f.rightY * right + f.upY * up) * s };
}

/** Shirt colour at an image point: base, folds, optional stripes across the torso axis. */
function clothPattern(ctx: PeopleContext, person: PersonSpec, f: PersonFrame): (x: number, y: number, out: Float32Array) => void {
  const s = f.origin.s;
  const fold = 1 / (70 * s);
  const stripes = person.stripes;
  const periodPx = stripes ? stripes.periodMm * s : 1;
  return (x, y, out) => {
    const k = 0.8 + 0.4 * valueNoise(x * fold, y * fold, ctx.seed ^ 0x2f1);
    let r = person.shirt[0];
    let g = person.shirt[1];
    let b = person.shirt[2];
    if (stripes) {
      const along = ((x - f.origin.x) * f.upX + (y - f.origin.y) * f.upY) / periodPx;
      const frac = along - Math.floor(along);
      const d = (0.25 - Math.abs(frac - 0.5)) * periodPx;
      const mix = d > 0.5 ? 1 : d < -0.5 ? 0 : d + 0.5;
      r += (stripes.color[0] - r) * mix;
      g += (stripes.color[1] - g) * mix;
      b += (stripes.color[2] - b) * mix;
    }
    out[0] = r * k;
    out[1] = g * k;
    out[2] = b * k;
  };
}

/** Where the fretting hand's parts sit, in neck-plane millimetres. */
export interface HandLayout {
  tips: Point[];
  mids: Point[];
  knuckles: Point[];
  radii: number[];
  palmA: Point;
  palmB: Point;
  wrist: Point;
  elbow: Point;
  thumbA: Point;
  thumbB: Point;
  /** Fret wires the hand hides, as a range of wire indices. */
  minFret: number;
  maxFret: number;
}

/** Lay the fretting hand out on the neck plane. */
export function layoutHand(hand: HandSpec, model: NeckModel): HandLayout {
  const yc = model.nutWidth / 2;
  const tips: Point[] = [];
  let sumX = 0;
  let minCell = Infinity;
  let maxCell = -Infinity;
  for (let i = 0; i < hand.fingers.length; i++) {
    const f = hand.fingers[i];
    const cell = Math.max(0.3, hand.position + f.fretOffset);
    const x = fretX(model, cell - 1) + 0.72 * (fretX(model, cell) - fretX(model, cell - 1));
    let y = stringY(model, Math.min(model.stringCount, Math.max(1, f.string)), x);
    // A barre: the index finger lies across the whole board, its tip just past the bass string.
    if (hand.shape === 'barre' && i === 0) y -= 3;
    tips.push({ x, y });
    sumX += x;
    minCell = Math.min(minCell, cell);
    maxCell = Math.max(maxCell, cell);
  }
  const xh = sumX / Math.max(1, tips.length);
  const half = boardWidthAt(model, xh) / 2;
  const yT = yc + half;
  const yB = yc - half;
  const drop = hand.lift * 95;
  const knuckles: Point[] = [];
  const mids: Point[] = [];
  const radii: number[] = [];
  const scale = [1, 1.03, 0.97, 0.86];
  for (let i = 0; i < tips.length; i++) {
    const k = { x: xh + (i - (tips.length - 1) / 2) * 19 + 5, y: yT + 12 + drop };
    // A lifted hand curls its fingers back toward the palm.
    tips[i] = { x: tips[i].x + (k.x - tips[i].x) * hand.lift * 0.6, y: tips[i].y + (k.y - 14 - tips[i].y) * hand.lift };
    knuckles.push(k);
    // The middle joint sits a little toward the nut of the straight knuckle-tip line: fingers arch.
    mids.push({ x: k.x + 0.5 * (tips[i].x - k.x) - 3 - (i - 1.5) * 1.5, y: k.y + 0.5 * (tips[i].y - k.y) });
    radii.push(scale[Math.min(3, i)]);
  }
  return {
    tips,
    mids,
    knuckles,
    radii,
    palmA: { x: xh - 20, y: yT + 27 + drop },
    palmB: { x: xh + 27, y: yT + 31 + drop },
    wrist: { x: xh + 26, y: yT + 54 + drop },
    elbow: { x: xh + 150, y: yT + 280 + drop },
    thumbA: { x: xh + 7, y: yB - 5 },
    thumbB: { x: xh - 3, y: yB + 3.5 },
    minFret: Math.max(0, Math.floor(minCell) - 1),
    maxFret: Math.ceil(maxCell),
  };
}

/** Torso, neck, head and the upper arms: everything of the player that is behind the guitar. */
export function drawPerson(ctx: PeopleContext, person: PersonSpec, hand: HandSpec | null): void {
  const f = personFrame(ctx, person);
  const s = f.origin.s;
  const cloth = clothPattern(ctx, person, f);
  const lean = (person.leanDeg * Math.PI) / 180;
  // Torso: a rounded box from the shoulder line to well below the frame.
  const centre = at(f, 0, -200);
  const torso = roundBoxSdf(centre.x, centre.y, 205 * s, 500 * s, 85 * s, lean);
  const hw = 205 * s;
  const reachX = 205 * s + Math.abs(Math.sin(lean)) * 500 * s + 2;
  fillShape(ctx.t, centre.x - reachX, centre.y - 505 * s, centre.x + reachX, centre.y + 505 * s, torso, (x, y, _d, out) => {
    cloth(x, y, out);
    // The chest is rounded: darker toward the sides, lit from the light's side.
    const lx = ((x - centre.x) * f.rightX + (y - centre.y) * f.rightY) / hw;
    const k = 0.72 + 0.3 * Math.cos(Math.max(-1.4, Math.min(1.4, lx * 1.3))) + 0.12 * lx * ctx.lightX;
    out[0] *= k;
    out[1] *= k;
    out[2] *= k;
  });
  // Neck and head.
  if (person.head) {
    drawLimb(ctx, at(f, 0, 290), at(f, 0, 385), 54 * s, 50 * s, person.skin);
    const headC = at(f, 0, 478);
    const headSdf = ellipseSdf(headC.x, headC.y, 86 * s, 112 * s);
    fillShape(ctx.t, headC.x - 90 * s, headC.y - 116 * s, headC.x + 90 * s, headC.y + 116 * s, headSdf, (x, y, _d, out) => {
      const nx = (x - headC.x) / (86 * s);
      const ny = (y - headC.y) / (112 * s);
      const q = 1 - nx * nx - ny * ny;
      const k = 0.55 + 0.6 * Math.max(0, nx * ctx.lightX * 0.6 + ny * ctx.lightY * 0.6 + 0.75 * Math.sqrt(q > 0 ? q : 0));
      out[0] = person.skin[0] * k;
      out[1] = person.skin[1] * k;
      out[2] = person.skin[2] * k;
    });
    const hairC = at(f, 0, 545);
    fillShape(ctx.t, hairC.x - 96 * s, hairC.y - 80 * s, hairC.x + 96 * s, hairC.y + 80 * s, ellipseSdf(hairC.x, hairC.y, 93 * s, 74 * s), (x, y, _d, out) => {
      const k = 0.7 + 0.6 * fbm2(x / (9 * s), y / (30 * s), ctx.seed ^ 0x8a);
      out[0] = person.hair[0] * k;
      out[1] = person.hair[1] * k;
      out[2] = person.hair[2] * k;
    });
  }
  // Upper arm on the fretting side: down to the elbow below the neck, or hanging if the hand is away.
  const shoulder = at(f, f.dir * 196, 250);
  let elbow: Point;
  if (hand) {
    const lay = layoutHand(hand, ctx.model);
    elbow = project(ctx, lay.elbow.x, lay.elbow.y);
  } else {
    elbow = at(f, f.dir * 232, -60);
  }
  if (person.longSleeves) drawLimb(ctx, shoulder, elbow, 52 * s, 46 * s, person.shirt, cloth, 0.55);
  else {
    const mid = { x: shoulder.x + (elbow.x - shoulder.x) * 0.5, y: shoulder.y + (elbow.y - shoulder.y) * 0.5 };
    drawLimb(ctx, mid, elbow, 44 * s, 40 * s, person.skin);
    drawLimb(ctx, shoulder, mid, 54 * s, 50 * s, person.shirt, cloth, 0.55);
  }
  // The other shoulder; its arm is drawn in front of the guitar by `drawPickingArm`.
  if (!person.pickArm) {
    const sh = at(f, -f.dir * 196, 250);
    const el = at(f, -f.dir * 236, -70);
    if (person.longSleeves) drawLimb(ctx, sh, el, 52 * s, 46 * s, person.shirt, cloth, 0.55);
    else {
      const mid = { x: (sh.x + el.x) / 2, y: (sh.y + el.y) / 2 };
      drawLimb(ctx, mid, el, 44 * s, 40 * s, person.skin);
      drawLimb(ctx, sh, mid, 54 * s, 50 * s, person.shirt, cloth, 0.55);
    }
  }
}

/** The fretting hand and forearm, in front of the neck. */
export function drawFrettingHand(ctx: PeopleContext, hand: HandSpec, person: PersonSpec | null): void {
  const lay = layoutHand(hand, ctx.model);
  const skin = hand.skin;
  const P = (p: Point): Anchor => project(ctx, p.x, p.y);
  const wrist = P(lay.wrist);
  const elbow = P(lay.elbow);
  const palmA = P(lay.palmA);
  const palmB = P(lay.palmB);
  const s = palmA.s;
  // Forearm (sleeved or bare) and the back of the hand.
  if (person?.longSleeves) {
    const f = personFrame(ctx, person);
    const cuff = { x: wrist.x + (elbow.x - wrist.x) * 0.16, y: wrist.y + (elbow.y - wrist.y) * 0.16 };
    drawLimb(ctx, wrist, cuff, 25 * s, 27 * s, skin);
    drawLimb(ctx, cuff, elbow, 31 * s, 44 * s, person.shirt, clothPattern(ctx, person, f), 0.55);
  } else {
    drawLimb(ctx, wrist, elbow, 25 * s, 40 * s, skin);
  }
  // Fingers: shadow on the board first, then each finger from knuckle to tip.
  const count = lay.tips.length;
  if (hand.lift < 0.5) {
    for (let i = 0; i < count; i++) {
      const tip = P(lay.tips[i]);
      const mid = P(lay.mids[i]);
      limbShadow(ctx, mid, tip, 8 * lay.radii[i] * mid.s, 6.9 * lay.radii[i] * tip.s, 0.42 * (1 - hand.lift * 2));
    }
  }
  drawLimb(ctx, palmA, palmB, 22 * s, 23 * s, skin);
  for (let i = count - 1; i >= 0; i--) {
    const k = P(lay.knuckles[i]);
    const mid = P(lay.mids[i]);
    const tip = P(lay.tips[i]);
    const r = lay.radii[i];
    drawLimb(ctx, k, mid, 9.2 * r * k.s, 8.2 * r * mid.s, skin);
    drawLimb(ctx, mid, tip, 8.2 * r * mid.s, 6.9 * r * tip.s, skin);
    // Fingernail: a slightly lighter, pinker patch near the tip.
    const nail = { x: tip.x + (mid.x - tip.x) * 0.14, y: tip.y + (mid.y - tip.y) * 0.14 };
    const nail2 = { x: tip.x + (mid.x - tip.x) * 0.3, y: tip.y + (mid.y - tip.y) * 0.3 };
    drawLimb(ctx, nail, nail2, 3.4 * r * tip.s, 3.6 * r * tip.s, [skin[0] * 1.2 + 0.05, skin[1] * 1.08 + 0.03, skin[2] * 1.08 + 0.03], undefined, 0.8);
  }
  if (hand.thumb && hand.lift < 0.3) {
    const a = P(lay.thumbA);
    const b = P(lay.thumbB);
    limbShadow(ctx, a, b, 10.5 * a.s, 9 * b.s, 0.35);
    drawLimb(ctx, a, b, 10.5 * a.s, 9 * b.s, skin);
  }
}

/** The picking arm and hand resting over the body, in front of the guitar. */
export function drawPickingArm(ctx: PeopleContext, person: PersonSpec): void {
  const m = ctx.model;
  const yc = m.nutWidth / 2;
  const L = m.scaleLength;
  const f = personFrame(ctx, person);
  const s = f.origin.s;
  const shoulder = at(f, -f.dir * 196, 250);
  const elbow = project(ctx, L + 118, yc - 228);
  const wrist = project(ctx, L - 66, yc - 40);
  const hand = project(ctx, L - 100, yc + 6);
  const cloth = clothPattern(ctx, person, f);
  if (person.longSleeves) {
    drawLimb(ctx, shoulder, elbow, 52 * s, 47 * s, person.shirt, cloth, 0.55);
    drawLimb(ctx, elbow, wrist, 46 * elbow.s, 32 * wrist.s, person.shirt, cloth, 0.55);
  } else {
    const mid = { x: (shoulder.x + elbow.x) / 2, y: (shoulder.y + elbow.y) / 2 };
    drawLimb(ctx, shoulder, mid, 54 * s, 50 * s, person.shirt, cloth, 0.55);
    drawLimb(ctx, mid, elbow, 45 * s, 42 * elbow.s, person.skin);
    drawLimb(ctx, elbow, wrist, 42 * elbow.s, 29 * wrist.s, person.skin);
  }
  limbShadow(ctx, wrist, hand, 30 * wrist.s, 34 * hand.s, 0.3);
  drawLimb(ctx, wrist, hand, 30 * wrist.s, 35 * hand.s, person.skin);
  for (let k = 0; k < 3; k++) {
    const a = project(ctx, L - 112 - k * 13, yc + 22);
    const b = project(ctx, L - 124 - k * 15, yc + 50 - k * 4);
    drawLimb(ctx, a, b, 8.6 * a.s, 7.2 * b.s, person.skin);
  }
}

/** Distance function of the sweeping occluder, in pinhole-image pixels. */
export function occluderSdf(occluder: OccluderSpec, width: number, height: number): Sdf {
  // A slab 1.5 frame widths wide: it hides the whole frame for the middle fifth of its sweep.
  const travel = occluder.progress * 2.7 * width - 0.85 * width;
  const cx = occluder.direction > 0 ? travel : width - travel;
  return roundBoxSdf(cx, height * 0.5, width * 0.75, height * 0.9, width * 0.08, occluder.direction * 0.1);
}

/** Something big passing in front of the camera. */
export function drawOccluder(t: RenderTarget, occluder: OccluderSpec, seed: number): void {
  const sdf = occluderSdf(occluder, t.width, t.height);
  const c = occluder.color;
  const fold = 1 / (0.12 * t.width);
  fillShape(t, -t.width, -t.height, 2 * t.width, 2 * t.height, sdf, (x, y, d, out) => {
    const k = (0.75 + 0.35 * fbm2(x * fold, y * fold, seed)) * (0.7 + 0.3 * Math.min(1, -d / (0.08 * t.width)));
    out[0] = c[0] * k;
    out[1] = c[1] * k;
    out[2] = c[2] * k;
  });
}
