/**
 * The instrument itself, shaded per pixel in neck-plane coordinates: body, headstock with tuners,
 * neck side, board with grain and wear, binding, inlays, fret wires with a specular ridge and a
 * shadow line, the nut, stickers, and six strings with their shadows. Every edge is anti-aliased
 * analytically from the pixel's footprint in the plane, so a 0.3 mm string stays a thin faint line.
 */
import { DOUBLE_INLAY_FRETS, INLAY_FRETS, boardEndX, fretX, homographyJacobian, invertHomography } from '../geometry';
import type { Mat3 } from '../types';
import type { RenderTarget } from './raster';
import { Rng, fbm2 as importedFbm2, hash2 as importedHash2, valueNoise as importedValueNoise } from './rng';
import { mixRgb, scaleRgb, srgb, type GuitarSpec, type Rgb } from './scene';

// Local bindings: module-level imports cost a namespace lookup per call under some bundlers / test runners.
const fbm2 = importedFbm2;
const hash2 = importedHash2;
const valueNoise = importedValueNoise;

/** Accumulator for the layers of one pixel (premultiplied RGBA). */
const ACC = new Float64Array(4);

function over(r: number, g: number, b: number, a: number): void {
  if (a <= 0) return;
  const k = 1 - a;
  ACC[0] = r * a + ACC[0] * k;
  ACC[1] = g * a + ACC[1] * k;
  ACC[2] = b * a + ACC[2] * k;
  ACC[3] = a + ACC[3] * k;
}

function darken(amount: number): void {
  if (amount <= 0) return;
  const k = 1 - amount;
  ACC[0] *= k;
  ACC[1] *= k;
  ACC[2] *= k;
}

/** Coverage of a pixel by a half-plane whose edge is `d` pixels away (negative = inside). */
function edge(d: number): number {
  const c = 0.5 - d;
  return c <= 0 ? 0 : c >= 1 ? 1 : c;
}

/** Coverage of a pixel by a stripe of half-width `hw` pixels whose centre line is `d` pixels away. */
function stripe(d: number, hw: number): number {
  const hi = d + hw < 0.5 ? d + hw : 0.5;
  const lo = d - hw > -0.5 ? d - hw : -0.5;
  return hi > lo ? hi - lo : 0;
}

/** Euclidean length; `Math.hypot` is far slower in a hot loop. */
function len2(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Extra context the renderer passes to the guitar shader. */
export interface GuitarLight {
  /** Image-space direction the key light comes from (unit-ish). */
  x: number;
  y: number;
  /** Tangents of the view's yaw and pitch: how far a point behind the plane appears shifted per mm of depth. */
  tanYaw: number;
  tanPitch: number;
}

interface BodyShape {
  x0: number;
  x1: number;
  half: number;
  sdf: (x: number, y: number) => number;
  depth: number;
}

function bodyShape(g: GuitarSpec): BodyShape {
  const m = g.model;
  const L = m.scaleLength;
  const yc = m.nutWidth / 2;
  if (g.kind === 'electric') {
    // A double-cutaway solid body: two bouts, two horns reaching toward the nut, scooped cutaways.
    const pocket = L - 243;
    const seg = (x: number, y: number, ax: number, ay: number, bx: number, by: number, r: number): number => {
      const dx = bx - ax;
      const dy = by - ay;
      let h = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      return len2(x - ax - h * dx, y - ay - h * dy) - r;
    };
    return {
      x0: L - 345,
      x1: L + 160,
      half: 175,
      depth: 44,
      sdf: (x, y) => {
        const lower = len2(x - (L - 8), y - (yc + 6)) - 158;
        const upper = len2(x - (L - 172), y - (yc - 2)) - 110;
        let d = smin(lower, upper, 95);
        const bassHorn = seg(x, y, L - 225, yc - 88, L - 312, yc - 104, 27);
        const trebleHorn = seg(x, y, L - 212, yc + 88, L - 278, yc + 102, 24);
        d = smin(d, Math.min(bassHorn, trebleHorn), 28);
        // Scoops between each horn and the neck, and the slot the neck sits in.
        const scoopBass = len2(x - (L - 292), y - (yc - 52)) - 30;
        const scoopTreble = len2(x - (L - 268), y - (yc + 56)) - 31;
        const slot = Math.max(x - pocket, Math.abs(y - yc) - 30);
        return Math.max(d, -scoopBass, -scoopTreble, -slot);
      },
    };
  }
  const classical = g.kind === 'classical';
  const xj = fretX(m, m.bodyJoinFret);
  const r1 = classical ? 132 : 142;
  const r2 = classical ? 182 : 196;
  const c1 = xj + r1 * 0.74;
  const c2 = Math.max(L + (classical ? 0 : 40), c1 + r2 * 1.05);
  return {
    x0: xj,
    x1: c2 + r2,
    half: r2 + 2,
    depth: classical ? 95 : 110,
    sdf: (x, y) => {
      const d = smin(len2(x - c1, y - yc) - r1, len2(x - c2, y - yc) - r2, 80);
      // Square shoulders: the body starts at the join.
      return Math.max(d, xj - x);
    },
  };
}

interface HeadShape {
  length: number;
  /** Half-widths toward the bass (top) and treble (bottom) side at distance s behind the nut. */
  top: (s: number) => number;
  bottom: (s: number) => number;
  /** Tuner post positions (plane mm), index 0 = string 1. */
  posts: { x: number; y: number }[];
  /** Tuner buttons outside the outline. */
  buttons: { x: number; y: number }[];
  slots: boolean;
}

function sstep(e0: number, e1: number, x: number): number {
  const t = x <= e0 ? 0 : x >= e1 ? 1 : (x - e0) / (e1 - e0);
  return t * t * (3 - 2 * t);
}

function headShape(g: GuitarSpec): HeadShape {
  const m = g.model;
  const yc = m.nutWidth / 2;
  const nw = m.nutWidth / 2;
  const posts: { x: number; y: number }[] = [];
  const buttons: { x: number; y: number }[] = [];
  if (g.headstock === 'six-in-line') {
    const length = 188;
    const top = (s: number): number => nw + 3 + 5 * sstep(0, 30, s) - 9 * sstep(150, length, s);
    const bottom = (s: number): number => nw + 2 + 36 * sstep(6, 62, s) - 26 * sstep(105, length, s);
    for (let i = 0; i < 6; i++) {
      // String 6 (bass) has the post nearest the nut; all posts along the upper edge.
      const string = 6 - i;
      const s = 36 + i * 25;
      const y = yc - top(s) + 12;
      posts[string - 1] = { x: -s, y };
      buttons.push({ x: -s, y: yc - top(s) - 12 });
    }
    return { length, top, bottom, posts, buttons, slots: false };
  }
  const slotted = g.headstock === 'slotted';
  const length = slotted ? 195 : 172;
  const wide = slotted ? 35 : 38;
  const half = (s: number): number => nw + (wide - nw) * sstep(0, 34, s) + 0.02 * s - 6 * sstep(length - 16, length, s);
  for (let k = 0; k < 3; k++) {
    const s = (slotted ? 52 : 44) + k * (slotted ? 40 : 39);
    const off = slotted ? 15.5 : half(s) - 12;
    // Bass side takes strings 6, 5, 4 (nearest the nut first); treble side strings 1, 2, 3.
    posts[6 - k - 1] = { x: -s, y: yc - off };
    posts[k] = { x: -s, y: yc + off };
    buttons.push({ x: -s, y: yc - half(s) - 13 }, { x: -s, y: yc + half(s) + 13 });
  }
  return { length, top: half, bottom: half, posts, buttons, slots: slotted };
}

const BOARD_COLORS: Record<GuitarSpec['board'], Rgb> = {
  rosewood: srgb(72, 45, 33),
  ebony: srgb(34, 30, 28),
  maple: srgb(212, 170, 108),
};

/**
 * Draw the guitar onto the subject layer. `H` is the un-normalised pinhole homography (its
 * projective weight is depth in mm), including any horizontal flip or 180 degree turn.
 */
export function drawGuitar(t: RenderTarget, g: GuitarSpec, H: Mat3, light: GuitarLight): void {
  const inv = invertHomography(H);
  if (!inv) return;
  const m = g.model;
  const L = m.scaleLength;
  const yc = m.nutWidth / 2;
  const nutW = m.nutWidth;
  const taper = (m.width12 - m.nutWidth) / (L / 2);
  const spanNut = m.stringSpanNut;
  const spanSlope = (m.stringSpanBridge - m.stringSpanNut) / L;
  const nStr = m.stringCount;
  const xEnd = boardEndX(m);
  const nFrets = m.fretCount;
  const fx = new Float64Array(nFrets + 3);
  for (let n = 0; n < fx.length; n++) fx[n] = fretX(m, n);
  const inlay = new Uint8Array(nFrets + 3);
  if (g.inlays !== 'none') {
    for (const f of INLAY_FRETS) if (f <= nFrets) inlay[f] = DOUBLE_INLAY_FRETS.includes(f) ? 2 : 1;
    if (g.inlays === 'blocks' && nFrets >= 1) inlay[1] = 1;
  }
  const rng = new Rng(g.textureSeed);
  const seed = g.textureSeed | 0;
  const body = bodyShape(g);
  const head = headShape(g);
  const nutT = 5.5;

  // Light direction expressed along the neck (x) and across it (y), from the board's image axes.
  const jc = homographyJacobian(H, fx[Math.min(7, nFrets)], yc);
  const lenX = len2(jc[0], jc[2]) || 1;
  const lenY = len2(jc[1], jc[3]) || 1;
  const lightAlong = (light.x * jc[0] + light.y * jc[2]) / lenX;
  const lightAcross = (light.x * jc[1] + light.y * jc[3]) / lenY;

  // Materials.
  // No two boards are the same shade: vary brightness and tint around the species colour.
  const tone = rng.range(0.72, 1.4);
  const boardBase: Rgb = [BOARD_COLORS[g.board][0] * tone * rng.range(0.92, 1.08), BOARD_COLORS[g.board][1] * tone, BOARD_COLORS[g.board][2] * tone * rng.range(0.9, 1.1)];
  const maple = g.board === 'maple';
  const inlayColor: Rgb = maple ? srgb(26, 24, 22) : srgb(232, 228, 214);
  const bindingColor = srgb(228, 218, 190);
  const nutColor: Rgb = g.nut === 'bone' ? srgb(234, 226, 202) : srgb(30, 30, 30);
  // On maple the wires look grey against the light wood; on dark boards they are the brightest thing.
  const fretBase = scaleRgb(srgb(150, 148, 138), (0.7 + 0.4 * rng.next()) * (maple ? 0.6 : 1));
  const ridgeGain = maple ? 0.55 : 0.95;
  const grime = maple ? 0.25 + 0.3 * g.wear : 0;
  const fretHalf = g.fretWidth / 2;
  const ridgeOffset = lightAlong * 0.35;
  const shadowSide = lightAlong >= 0 ? -1 : 1;
  const metal = srgb(196, 196, 190);
  const glintY0 = yc + rng.range(-14, 14);
  const glintSlope = rng.range(-1.6, 1.6);
  const glintSigma = rng.range(5, 14);
  const stringGlintX = rng.range(60, 340);
  const stringGlintStep = rng.range(-26, 26);
  const stringGlintSigma = rng.range(18, 45);
  const shadowDy = -lightAcross * rng.range(1.2, 2.6);
  const shadowAlpha = 0.28 + 0.2 * rng.next();
  const wearColor: Rgb = maple ? srgb(120, 92, 62) : mixRgb(boardBase, srgb(150, 120, 96), 0.5);
  const topColor = g.bodyColor;
  const sideColor = scaleRgb(g.bodyStyle === 'natural' ? srgb(96, 56, 36) : g.bodyColor, 0.45);
  const electric = g.kind === 'electric';
  const classical = g.kind === 'classical';
  const holeR = classical ? 43 : 50;
  const holeX = xEnd + 2 + holeR;
  const pocket = L - 243;
  const pickupX = g.pickups === 'single' ? [L - 172, L - 112, L - 52] : g.pickups === 'humbucker' ? [L - 165, L - 50] : [];
  const pickHalfX = g.pickups === 'single' ? 9 : 19;
  const pickHalfY = g.pickups === 'single' ? 43 : 36;
  const pickupColor: Rgb = g.pickups === 'humbucker' ? (rng.chance(0.5) ? srgb(200, 200, 196) : srgb(22, 22, 24)) : rng.pick([srgb(236, 232, 220), srgb(24, 24, 26)]);
  const glossX = L - rng.range(60, 220);
  const glossY = yc + rng.range(-90, 90);
  // Side walls seen past the edges when the instrument is tilted.
  const exNeck = -light.tanYaw;
  const eyNeck = light.tanPitch;
  const neckSide = Math.max(-20, Math.min(20, 21 * eyNeck));
  const sticker = g.stickers;
  const stickerX = sticker ? sticker.frets.map((f) => (fx[f - 1] + fx[f]) / 2) : [];

  // Image bounding box of everything we might draw.
  const px0 = -head.length - 30;
  const px1 = Math.max(xEnd, body.x1) + 8;
  const py0 = yc - Math.max(70, body.half + 8);
  const py1 = yc + Math.max(70, body.half + 8);
  let bx0 = 0;
  let by0 = 0;
  let bx1 = t.width - 1;
  let by1 = t.height - 1;
  {
    let ok = true;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [cx, cy] of [[px0, py0], [px1, py0], [px1, py1], [px0, py1]]) {
      const w = H[6] * cx + H[7] * cy + H[8];
      if (!(w > 1)) {
        ok = false;
        break;
      }
      const u = (H[0] * cx + H[1] * cy + H[2]) / w;
      const v = (H[3] * cx + H[4] * cy + H[5]) / w;
      minX = Math.min(minX, u);
      maxX = Math.max(maxX, u);
      minY = Math.min(minY, v);
      maxY = Math.max(maxY, v);
    }
    if (ok) {
      bx0 = Math.max(0, Math.floor(minX - t.margin - 2));
      by0 = Math.max(0, Math.floor(minY - t.margin - 2));
      bx1 = Math.min(t.width - 1, Math.ceil(maxX + t.margin + 2));
      by1 = Math.min(t.height - 1, Math.ceil(maxY + t.margin + 2));
    }
  }
  // How far past the outlines anything can be drawn (mm): side walls plus a few pixels of anti-aliasing.
  const bodyOx = exNeck * body.depth;
  const bodyOy = eyNeck * body.depth;
  const sideReach = Math.abs(bodyOx) + Math.abs(bodyOy) + 4;
  const neckReach = 78;
  const boardReach = Math.max(m.nutWidth, m.width12 + 6) / 2 + 26;
  const { ux, uy, layer, width } = t;
  const i0 = inv[0], i1 = inv[1], i2 = inv[2], i3 = inv[3], i4 = inv[4], i5 = inv[5], i6 = inv[6], i7 = inv[7], i8 = inv[8];
  const headLen = head.length;
  const strings = g.strings;

  for (let py = by0; py <= by1; py++) {
    let i = py * width + bx0;
    for (let px = bx0; px <= bx1; px++, i++) {
      const u = ux[i];
      const v = uy[i];
      const w = i6 * u + i7 * v + i8;
      const x = (i0 * u + i1 * v + i2) / w;
      const y = (i3 * u + i4 * v + i5) / w;
      // Depth of the plane point: beyond the horizon nothing is visible.
      if (!(H[6] * x + H[7] * y + H[8] > 1)) continue;
      const ay = y - yc;
      // Cheap rejection before any shading work: is this point near the neck or near the body?
      const inNeckZone = x >= -headLen - 28 && x <= xEnd + 3 && ay > -neckReach && ay < neckReach && (x < 0 || (ay > -boardReach && ay < boardReach));
      let bodyD = Infinity;
      if (x >= body.x0 - sideReach && x <= body.x1 + sideReach && ay > -body.half - sideReach && ay < body.half + sideReach) bodyD = body.sdf(x, y);
      const inBodyZone = bodyD < sideReach;
      if (!inNeckZone && !inBodyZone) continue;
      // Footprint of this pixel in the plane (mm per pixel across lines of constant x, constant y).
      const dxdu = (i0 - i6 * x) / w;
      const dxdv = (i1 - i7 * x) / w;
      const dydu = (i3 - i6 * y) / w;
      const dydv = (i4 - i7 * y) / w;
      const gx = Math.sqrt(dxdu * dxdu + dxdv * dxdv);
      const gy = Math.sqrt(dydu * dydu + dydv * dydv);
      const giso = Math.sqrt(Math.abs(dxdu * dydv - dxdv * dydu)) || 1e-6;
      ACC[0] = 0;
      ACC[1] = 0;
      ACC[2] = 0;
      ACC[3] = 0;

      // ---- Body ---------------------------------------------------------------------------
      if (inBodyZone) {
        const d = bodyD;
        // The side wall, visible past the edge on the side tilted toward the camera.
        const ox = bodyOx;
        const oy = bodyOy;
        if (d > -2) {
          if (sideReach > 6) {
            let ds = Infinity;
            for (let k = 1; k <= 3; k++) ds = Math.min(ds, body.sdf(x - (ox * k) / 3, y - (oy * k) / 3));
            over(sideColor[0], sideColor[1], sideColor[2], edge(ds / giso));
          }
        }
        const cov = edge(d / giso);
        if (cov > 0) {
          let r = topColor[0];
          let gg = topColor[1];
          let b = topColor[2];
          if (g.bodyStyle === 'natural') {
            const grain = 0.9 + 0.2 * valueNoise(x * 0.012, y * 0.9, seed ^ 0x77);
            r *= grain;
            gg *= grain;
            b *= grain;
          } else if (g.bodyStyle === 'sunburst') {
            const k = sstep(0, electric ? 70 : 95, -d);
            r = 0.012 + (topColor[0] - 0.012) * k;
            gg = 0.008 + (topColor[1] - 0.008) * k * k;
            b = 0.006 + (topColor[2] - 0.006) * k * k;
          }
          if (electric || g.bodyStyle !== 'natural') {
            // Lacquer: a broad soft highlight.
            const gl = 0.22 * Math.exp(-((x - glossX) * (x - glossX) + (y - glossY) * (y - glossY)) / (2 * 75 * 75));
            r += gl;
            gg += gl;
            b += gl;
          }
          // Edge binding / rounded edge darkening.
          if (!electric && d > -3) {
            r = bindingColor[0];
            gg = bindingColor[1];
            b = bindingColor[2];
          } else if (electric && d > -9) {
            const k = 1 - 0.45 * sstep(-9, 0, d);
            r *= k;
            gg *= k;
            b *= k;
          }
          over(r, gg, b, cov);
          if (!electric) {
            // Rosette and soundhole.
            const dh = len2(x - holeX, ay) - holeR;
            if (dh < 18) {
              if (dh > 3 && dh < 15) {
                const band = Math.floor((dh - 3) / 3) & 1;
                const ring = classical ? 0.5 + 0.5 * hash2(Math.floor(Math.atan2(ay, x - holeX) * 40), Math.floor(dh), seed) : band;
                over(0.02 + 0.25 * ring, 0.015 + 0.2 * ring, 0.01 + 0.12 * ring, 0.85 * stripe((dh - 9) / giso, 6 / giso));
              }
              over(0.006, 0.004, 0.003, edge(dh / giso));
            }
            if (g.pickguard && !classical) {
              // A crescent hugging the treble side of the rosette.
              const dp = Math.max(len2(x - (holeX + 20), ay - (holeR + 14)) - 47, -(len2(x - holeX, ay) - holeR - 16));
              over(g.pickguard[0], g.pickguard[1], g.pickguard[2], edge(dp / giso) * 0.92);
            }
            // Bridge, saddle and pins.
            const db = Math.max(Math.abs(x - (L + 6)) - 15, Math.abs(ay) - (classical ? 92 : 76));
            over(0.03, 0.02, 0.015, edge(db / giso));
            const dsd = Math.max(Math.abs(x - L) - 1.6, Math.abs(ay) - 38);
            over(0.8, 0.77, 0.66, edge(dsd / giso));
          } else {
            if (g.pickguard) {
              const ex = (x - (L - 105)) / 150;
              const ey = (ay - 34) / 86;
              const dp = Math.max((Math.sqrt(ex * ex + ey * ey) - 1) * 86, d + 7);
              over(g.pickguard[0], g.pickguard[1], g.pickguard[2], edge(dp / giso));
            }
            for (let k = 0; k < pickupX.length; k++) {
              const qx = Math.abs(x - pickupX[k]) - pickHalfX + 4;
              const qy = Math.abs(ay) - pickHalfY + 4;
              const dp = len2(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 4;
              if (dp < 2) {
                const sheen = g.pickups === 'humbucker' ? 0.75 + 0.5 * sstep(-pickHalfX, pickHalfX, x - pickupX[k]) : 1;
                over(pickupColor[0] * sheen, pickupColor[1] * sheen, pickupColor[2] * sheen, edge(dp / giso));
                if (g.pickups === 'single') {
                  // Pole pieces under the strings.
                  const span = spanNut + spanSlope * pickupX[k];
                  const idx = Math.round((ay / span + 0.5) * (nStr - 1));
                  if (idx >= 0 && idx < nStr) {
                    const pyy = (idx / (nStr - 1) - 0.5) * span;
                    over(metal[0] * 0.7, metal[1] * 0.7, metal[2] * 0.7, edge((len2(x - pickupX[k], ay - pyy) - 2.3) / giso));
                  }
                }
              }
            }
            // Bridge plate and control knobs.
            const dbr = Math.max(Math.abs(x - (L + 12)) - 20, Math.abs(ay) - 40);
            over(metal[0] * 0.85, metal[1] * 0.85, metal[2] * 0.85, edge(dbr / giso));
            for (let k = 0; k < 3; k++) {
              const dk = len2(x - (L + 30 + k * 34), ay - (96 - k * 14)) - 11;
              over(pickupColor[0], pickupColor[1], pickupColor[2], edge(dk / giso));
            }
          }
        }
      }

      if (inNeckZone) {
        // ---- Neck side wall (the neck has thickness) ---------------------------------------
        if (x > -nutT && x < (electric ? pocket : body.x0) && Math.abs(neckSide) > 0.5) {
          const half = (nutW + taper * (x > 0 ? x : 0)) / 2;
          // Signed offset past the edge on the visible side.
          const o = neckSide > 0 ? ay - half : -ay - half;
          const wSide = Math.abs(neckSide);
          if (o > -1 && o < wSide + 1) {
            const k = 1 - 0.55 * (o / wSide);
            over(g.neckColor[0] * k, g.neckColor[1] * k, g.neckColor[2] * k, Math.min(edge(-o / gy), edge((o - wSide) / gy)));
          }
        }

        // ---- Headstock ----------------------------------------------------------------------
        if (x < 0) {
          const s = -x;
          if (s < headLen + 2) {
            const top = head.top(s);
            const bottom = head.bottom(s);
            const cov = Math.min(edge((-ay - top) / gy), edge((ay - bottom) / gy), edge((s - headLen) / gx), edge((nutT * 0.5 - s) / gx));
            if (cov > 0) {
              const grain = 0.88 + 0.24 * valueNoise(x * 0.02, y * 0.8, seed ^ 0x1b3);
              let r = g.headColor[0] * grain;
              let gg = g.headColor[1] * grain;
              let b = g.headColor[2] * grain;
              if (head.slots) {
                // Two long slots through the head show whatever is behind: render them dark.
                const dsl = Math.max(Math.abs(Math.abs(ay) - 15.5) - 5.5, Math.abs(s - 98) - 62);
                const k = edge(dsl / giso);
                r *= 1 - 0.93 * k;
                gg *= 1 - 0.93 * k;
                b *= 1 - 0.93 * k;
              }
              over(r, gg, b, cov);
            }
          }
          // Tuner buttons and their shafts, outside the outline.
          for (let k = 0; k < head.buttons.length; k++) {
            const bt = head.buttons[k];
            const ddx = x - bt.x;
            if (ddx > -14 && ddx < 14) {
              const ddy = y - bt.y;
              if (ddy > -30 && ddy < 30) {
                const toward = bt.y < yc ? 1 : -1;
                const dsh = Math.max(Math.abs(ddx) - 1.6, Math.abs(ddy - toward * 9) - 9);
                over(metal[0] * 0.6, metal[1] * 0.6, metal[2] * 0.6, edge(dsh / giso));
                const e = len2(ddx / 8.5, ddy / 6);
                over(metal[0] * (classical ? 1.1 : 0.9), metal[1] * (classical ? 1.08 : 0.9), metal[2] * (classical ? 1.0 : 0.9), edge(((e - 1) * 6) / giso));
              }
            }
          }
          // Tuner posts with washers.
          for (let k = 0; k < head.posts.length; k++) {
            const p = head.posts[k];
            if (!p) continue;
            const dd = len2(x - p.x, y - p.y);
            if (dd < 9) {
              if (head.slots) {
                const dr = Math.max(Math.abs(x - p.x) - 4.5, Math.abs(y - p.y) - 5.5);
                over(0.82, 0.8, 0.74, edge(dr / giso));
              } else {
                over(metal[0] * 0.55, metal[1] * 0.55, metal[2] * 0.55, edge((dd - 5.6) / giso));
                over(metal[0] * 1.15, metal[1] * 1.15, metal[2] * 1.15, edge((dd - 3) / giso));
              }
            }
          }
          // Nut.
          if (s < nutT + 2) {
            const cov = Math.min(edge((-ay - nutW / 2) / gy), edge((ay - nutW / 2) / gy), edge((s - nutT) / gx), edge(-s / gx));
            const k = 0.85 + 0.3 * sstep(0, nutT, s);
            over(nutColor[0] * k, nutColor[1] * k, nutColor[2] * k, cov);
          }
        }

        // ---- Board ----------------------------------------------------------------------------
        if (x > -1.5 && x < xEnd + 1.5) {
          const half = (nutW + taper * x) / 2;
          const cov = Math.min(edge((-ay - half) / gy), edge((ay - half) / gy), edge(-x / gx), edge((x - xEnd) / gx));
          if (cov > 0) {
            // Wood: long streaky grain along the neck plus slow mottling.
            const grain = fbm2(x * 0.035, y * 1.1, seed);
            const mottled = 0.82 + 0.36 * grain + 0.12 * (valueNoise(x * 0.012, y * 0.05, seed ^ 0x99) - 0.5);
            let r = boardBase[0] * mottled;
            let gg = boardBase[1] * mottled;
            let b = boardBase[2] * mottled;
            if (g.board === 'rosewood') {
              const streak = valueNoise(x * 0.008 + 3, y * 3.2, seed ^ 0x42);
              if (streak > 0.62) {
                const k = 1 - 0.45 * sstep(0.62, 0.8, streak);
                r *= k;
                gg *= k;
                b *= k;
              }
            }
            // Finger wear in the first positions, between the strings.
            if (g.wear > 0.05 && x < fx[Math.min(9, nFrets)]) {
              const wv = valueNoise(x * 0.055, y * 0.16, seed ^ 0x3c1);
              const k = g.wear * 0.7 * sstep(0.5, 0.78, wv) * (x < fx[Math.min(5, nFrets)] ? 1 : 0.5);
              r += (wearColor[0] - r) * k;
              gg += (wearColor[1] - gg) * k;
              b += (wearColor[2] - b) * k;
            }
            if (maple) {
              // Glossy finish: a soft bright band that drifts along the neck.
              const gl = 0.16 * g.glint * Math.exp(-((ay - glintSlope * 0.02 * (x - 200)) * (ay - glintSlope * 0.02 * (x - 200))) / 260);
              r += gl;
              gg += gl;
              b += gl;
            }
            // Which fret cell are we in?
            const nf = -12 * Math.log2(1 - x / L);
            let cell = Math.ceil(nf);
            if (cell < 1) cell = 1;
            // Inlays.
            if (cell <= nFrets && inlay[cell] !== 0) {
              const xm = (fx[cell - 1] + fx[cell]) / 2;
              let di: number;
              if (g.inlays === 'blocks') {
                di = Math.max(Math.abs(x - xm) - ((fx[cell] - fx[cell - 1]) / 2 - 4.2), Math.abs(ay) - half * 0.7);
              } else if (inlay[cell] === 2) {
                const off = (spanNut + spanSlope * xm) * 0.3;
                di = Math.min(len2(x - xm, ay - off), len2(x - xm, ay + off)) - 3.1;
              } else {
                di = len2(x - xm, ay) - 3.1;
              }
              const ci = edge(di / giso);
              if (ci > 0) {
                const pearl = g.inlays === 'blocks' ? 0.8 + 0.3 * fbm2(x * 0.2, y * 0.2, seed ^ 0xabc) : 1;
                r += (inlayColor[0] * pearl - r) * ci;
                gg += (inlayColor[1] * pearl - gg) * ci;
                b += (inlayColor[2] * pearl - b) * ci;
              }
            }
            if (g.binding) {
              const cb = edge((half - 2.1 - Math.abs(ay)) / gy);
              r += (bindingColor[0] - r) * cb;
              gg += (bindingColor[1] - gg) * cb;
              b += (bindingColor[2] - b) * cb;
            }
            // Fret wire: shadow line on the side away from the light, then the wire with its bright ridge.
            const n = Math.round(nf);
            if (n >= 1 && n <= nFrets) {
              const dxm = x - fx[n];
              if (dxm > -fretHalf - 2.2 && dxm < fretHalf + 2.2) {
                const sh = stripe((dxm - shadowSide * (fretHalf + 0.55)) / gx, 0.6 / gx);
                // On a light board the grime that collects along each fret reads as a dark line.
                const ks = (1 - 0.6 * sh) * (1 - grime * stripe(dxm / gx, (fretHalf + 1.3) / gx));
                r *= ks;
                gg *= ks;
                b *= ks;
                const cw = stripe(dxm / gx, fretHalf / gx);
                if (cw > 0) {
                  const tt = dxm / fretHalf;
                  const wearK = 0.82 + 0.36 * hash2(n, 7, seed);
                  // The ridge is narrower than a pixel: widen and dim it by the pixel footprint.
                  const sig = 0.22;
                  const sigEff = Math.sqrt(sig * sig + (0.45 * gx / fretHalf) * (0.45 * gx / fretHalf));
                  const along = 1 + 3.5 * g.glint * Math.exp(-((ay - glintY0 - glintSlope * n) * (ay - glintY0 - glintSlope * n)) / (2 * glintSigma * glintSigma));
                  const ridge = g.fretShine * ridgeGain * (sig / sigEff) * Math.exp(-((tt - ridgeOffset) * (tt - ridgeOffset)) / (2 * sigEff * sigEff)) * along;
                  const baseK = wearK * (0.5 + 0.5 * (1 - tt * tt > 0 ? 1 - tt * tt : 0));
                  const fr = fretBase[0] * baseK + ridge;
                  const fg = fretBase[1] * baseK + ridge;
                  const fb = fretBase[2] * baseK + ridge * 0.96;
                  r += (fr - r) * cw;
                  gg += (fg - gg) * cw;
                  b += (fb - b) * cw;
                }
              }
            }
            over(r, gg, b, cov);
          }
        }

        // ---- Stickers (marker mode) --------------------------------------------------------------
        if (sticker) {
          for (let k = 0; k < stickerX.length; k++) {
            const dxs = Math.abs(x - stickerX[k]) - sticker.size / 2;
            if (dxs < 2) {
              const half = (nutW + taper * stickerX[k]) / 2;
              // Edge stickers straddle the board edge (see `markerHintPlanePoints`).
              const cy = sticker.placement === 'board' ? 0 : sticker.placement === 'bass-edge' ? -half : half;
              const ds = Math.max(dxs, Math.abs(ay - cy) - sticker.size / 2);
              over(sticker.color[0], sticker.color[1], sticker.color[2], edge(ds / giso));
            }
          }
        }
      }

      // ---- Strings and their shadows ----------------------------------------------------------
      if (x >= 0 && x <= L && ACC[3] > 0) {
        const span = spanNut + spanSlope * x;
        const idxF = (ay / span + 0.5) * (nStr - 1);
        const idx = Math.round(idxF);
        if (idx >= 0 && idx < nStr) {
          const st = strings[nStr - 1 - idx];
          const dy = ay - (idx / (nStr - 1) - 0.5) * span;
          const hw = st.diameter / 2 / gy;
          // Shadow first (not inside the soundhole, where there is nothing to cast it on).
          const overHole = !electric && len2(x - holeX, ay) < holeR;
          if (!overHole) darken(shadowAlpha * st.alpha * stripe((dy - shadowDy) / gy, hw + 0.2));
          const cs = stripe(dy / gy, hw);
          if (cs > 0) {
            const sNum = nStr - idx;
            const gl = 1 + 4 * g.glint * Math.exp(-((x - stringGlintX - stringGlintStep * sNum) * (x - stringGlintX - stringGlintStep * sNum)) / (2 * stringGlintSigma * stringGlintSigma));
            const tex = st.wound ? 0.72 + 0.56 * valueNoise(x * 0.9, sNum * 3.1, seed ^ 0x5e) : 1;
            const k = gl * tex;
            over(st.color[0] * k, st.color[1] * k, st.color[2] * k, cs * st.alpha);
          }
        }
      } else if (x < 0 && x > -headLen && ACC[3] > 0) {
        // From the nut to the tuner posts.
        for (let sN = 1; sN <= nStr; sN++) {
          const p = head.posts[sN - 1];
          if (!p) continue;
          const y0s = yc + ((nStr - sN) / (nStr - 1) - 0.5) * spanNut;
          if (x < p.x) continue;
          const tpar = x / p.x;
          const ys = y0s + (p.y - y0s) * tpar;
          const dy = y - ys;
          if (dy > -3 && dy < 3) {
            const st = strings[sN - 1];
            over(st.color[0], st.color[1], st.color[2], stripe(dy / gy, st.diameter / 2 / gy) * st.alpha);
          }
        }
      }

      const a = ACC[3];
      if (a <= 0) continue;
      const j = i * 4;
      const k = 1 - a;
      layer[j] = ACC[0] + layer[j] * k;
      layer[j + 1] = ACC[1] + layer[j + 1] * k;
      layer[j + 2] = ACC[2] + layer[j + 2] * k;
      layer[j + 3] = a + layer[j + 3] * k;
    }
  }
}
