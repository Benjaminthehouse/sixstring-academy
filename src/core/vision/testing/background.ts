/**
 * Procedural backgrounds for the scene renderer: walls, rooms with doors, windows, shelves and
 * pictures, heavy clutter, and "decoys": objects with evenly spaced bars (ladders, keyboards,
 * blinds, radiators, book spines, rulers) that tempt a fret detector but are not a fretboard.
 */
import { gaussianBlur, type RenderTarget } from './raster';
import { Rng, fbm2 } from './rng';
import { mixRgb, scaleRgb, srgb, type BackgroundSpec, type Rgb } from './scene';

type Pattern =
  | { kind: 'vstripes' | 'hstripes'; period: number; duty: number; color: Rgb }
  | { kind: 'grid'; period: number; periodY: number; line: number; color: Rgb }
  | { kind: 'vgrad'; color: Rgb };

/** A background primitive in "frame height" units: y in 0..1, x in 0..aspect. */
interface Prim {
  kind: 'rect' | 'ellipse' | 'line';
  cx: number;
  cy: number;
  /** rect: half width / half height; ellipse: radii; line: (hw, hh) is the vector to the end point from (cx, cy). */
  hw: number;
  hh: number;
  /** rect rotation in radians; line: half thickness. */
  angle: number;
  color: Rgb;
  alpha: number;
  /** Edge softness in height units (0 = crisp). */
  soft: number;
  pattern?: Pattern;
}

function rect(x0: number, y0: number, x1: number, y1: number, color: Rgb, extra: Partial<Prim> = {}): Prim {
  return { kind: 'rect', cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: Math.abs(x1 - x0) / 2, hh: Math.abs(y1 - y0) / 2, angle: 0, color, alpha: 1, soft: 0, ...extra };
}

function box(cx: number, cy: number, hw: number, hh: number, angle: number, color: Rgb, extra: Partial<Prim> = {}): Prim {
  return { kind: 'rect', cx, cy, hw, hh, angle, color, alpha: 1, soft: 0, ...extra };
}

function ellipse(cx: number, cy: number, rx: number, ry: number, color: Rgb, extra: Partial<Prim> = {}): Prim {
  return { kind: 'ellipse', cx, cy, hw: rx, hh: ry, angle: 0, color, alpha: 1, soft: 0, ...extra };
}

function line(ax: number, ay: number, bx: number, by: number, thickness: number, color: Rgb): Prim {
  return { kind: 'line', cx: ax, cy: ay, hw: bx - ax, hh: by - ay, angle: thickness / 2, color, alpha: 1, soft: 0 };
}

const BOOKS: readonly Rgb[] = [srgb(140, 40, 36), srgb(36, 60, 110), srgb(46, 96, 60), srgb(210, 190, 140), srgb(30, 30, 34), srgb(200, 120, 40), srgb(110, 60, 110), srgb(226, 226, 220), srgb(90, 110, 130), srgb(160, 150, 60), srgb(70, 40, 30)];
const WOODS: readonly Rgb[] = [srgb(150, 106, 66), srgb(112, 74, 46), srgb(190, 150, 100), srgb(84, 56, 40), srgb(206, 180, 140)];
const WHITE = srgb(236, 234, 228);

function randomColor(rng: Rng): Rgb {
  return rng.chance(0.5) ? rng.pick(BOOKS) : srgb(rng.int(30, 230), rng.int(30, 230), rng.int(30, 230));
}

function addShelves(out: Prim[], rng: Rng, xa: number, xb: number, y0: number, y1: number, count: number, dense: boolean): void {
  const boardColor = rng.pick([...WOODS, WHITE]);
  const thick = rng.range(0.014, 0.022);
  const gap = (y1 - y0) / count;
  if (dense) {
    // A bookcase: back panel and uprights.
    out.push(rect(xa - 0.02, y0 - gap * 0.9, xb + 0.02, y1 + thick, scaleRgb(boardColor, 0.45)));
    out.push(rect(xa - 0.03, y0 - gap * 0.9, xa, y1 + thick, boardColor), rect(xb, y0 - gap * 0.9, xb + 0.03, y1 + thick, boardColor));
  }
  for (let i = 0; i < count; i++) {
    const sy = y0 + gap * i;
    out.push(rect(xa, sy, xb, sy + thick, boardColor));
    let x = xa + rng.range(0.005, 0.03);
    while (x < xb - 0.04) {
      if (rng.chance(dense ? 0.06 : 0.18)) {
        if (rng.chance(0.5)) {
          // An object standing on the shelf.
          const w = rng.range(0.04, 0.09);
          const h = rng.range(0.05, gap * 0.6);
          if (rng.chance(0.5)) out.push(rect(x, sy - h, x + w, sy, randomColor(rng)));
          else out.push(ellipse(x + w / 2, sy - h / 2, w / 2, h / 2, randomColor(rng)));
          x += w + 0.01;
        } else {
          x += rng.range(0.03, 0.1);
        }
        continue;
      }
      const w = rng.range(0.012, 0.038);
      const h = rng.range(gap * 0.45, gap * 0.82);
      const color = randomColor(rng);
      out.push(rect(x, sy - h, x + w, sy, color));
      // A title band on some spines.
      if (rng.chance(0.4)) out.push(rect(x + w * 0.15, sy - h * rng.range(0.55, 0.85), x + w * 0.85, sy - h * rng.range(0.3, 0.5), mixRgb(color, WHITE, 0.6)));
      x += w + rng.range(0, 0.003);
    }
  }
}

function addDoor(out: Prim[], rng: Rng, aspect: number): void {
  const w = rng.range(0.42, 0.52);
  const x0 = rng.range(0.03, Math.max(0.05, aspect - w - 0.03));
  const y0 = rng.range(0.02, 0.1);
  const color = rng.pick([WHITE, srgb(170, 126, 84), srgb(96, 64, 44), srgb(200, 196, 180)]);
  out.push(rect(x0 - 0.035, y0 - 0.035, x0 + w + 0.035, 1.3, scaleRgb(color, 0.82)));
  out.push(rect(x0, y0, x0 + w, 1.3, color));
  out.push(rect(x0 + 0.06, y0 + 0.06, x0 + w - 0.06, y0 + 0.42, scaleRgb(color, 0.9)));
  out.push(rect(x0 + 0.06, y0 + 0.5, x0 + w - 0.06, 1.25, scaleRgb(color, 0.9)));
  out.push(ellipse(x0 + (rng.chance(0.5) ? 0.05 : w - 0.05), 0.62, 0.014, 0.014, srgb(180, 170, 130)));
}

function addWindow(out: Prim[], rng: Rng, aspect: number, blinds: boolean): void {
  const w = rng.range(0.35, 0.7);
  const h = rng.range(0.35, 0.6);
  const x0 = rng.range(0.02, Math.max(0.03, aspect - w - 0.02));
  const y0 = rng.range(0.02, 0.2);
  const sky = scaleRgb(rng.pick([srgb(206, 226, 250), srgb(240, 238, 226), srgb(180, 200, 220)]), rng.range(1.4, 3.2));
  out.push(rect(x0 - 0.025, y0 - 0.025, x0 + w + 0.025, y0 + h + 0.035, WHITE));
  const glass = rect(x0, y0, x0 + w, y0 + h, sky);
  if (blinds) glass.pattern = { kind: 'hstripes', period: rng.range(0.028, 0.045), duty: rng.range(0.6, 0.8), color: scaleRgb(WHITE, rng.range(0.5, 0.9)) };
  out.push(glass);
  if (!blinds) {
    out.push(rect(x0 + w / 2 - 0.008, y0, x0 + w / 2 + 0.008, y0 + h, WHITE));
    if (rng.chance(0.6)) out.push(rect(x0, y0 + h * 0.45 - 0.008, x0 + w, y0 + h * 0.45 + 0.008, WHITE));
    // Something outside: a darker band of trees / buildings.
    if (rng.chance(0.6)) out.push(rect(x0, y0 + h * rng.range(0.55, 0.8), x0 + w, y0 + h, scaleRgb(sky, 0.35), { alpha: 0.8 }));
  }
}

function addPicture(out: Prim[], rng: Rng, aspect: number): void {
  const w = rng.range(0.14, 0.34);
  const h = rng.range(0.14, 0.3);
  const x0 = rng.range(0.02, aspect - w - 0.02);
  const y0 = rng.range(0.03, 0.5);
  const tilt = rng.range(-0.04, 0.04);
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  out.push(box(cx, cy, w / 2 + 0.012, h / 2 + 0.012, tilt, rng.pick([srgb(30, 28, 26), srgb(120, 84, 50), WHITE, srgb(180, 150, 70)])));
  const paper = rng.pick([WHITE, srgb(210, 200, 170), srgb(40, 60, 90), srgb(180, 90, 60), srgb(60, 80, 60)]);
  out.push(box(cx, cy, w / 2, h / 2, tilt, paper));
  const blobs = rng.int(1, 4);
  for (let i = 0; i < blobs; i++) {
    const bx = cx + rng.range(-0.3, 0.3) * w;
    const by = cy + rng.range(-0.3, 0.3) * h;
    if (rng.chance(0.5)) out.push(ellipse(bx, by, rng.range(0.02, 0.2) * w, rng.range(0.05, 0.2) * h, randomColor(rng)));
    else out.push(box(bx, by, rng.range(0.05, 0.2) * w, rng.range(0.03, 0.15) * h, tilt, randomColor(rng)));
  }
}

function addDecoy(out: Prim[], rng: Rng, kind: BackgroundSpec['decoys'][number], aspect: number): void {
  const cx = rng.range(0.25, aspect - 0.25);
  const cy = rng.range(0.2, 0.8);
  const angle = (rng.range(4, 32) * (rng.chance(0.5) ? 1 : -1) * Math.PI) / 180;
  if (kind === 'ladder') {
    const hw = rng.range(0.4, 0.7);
    const hh = rng.range(0.035, 0.055);
    const wood = rng.pick([...WOODS, srgb(170, 172, 176)]);
    out.push(box(cx, cy, hw, hh, angle, scaleRgb(wood, 0.55), { pattern: { kind: 'vstripes', period: rng.range(0.05, 0.085), duty: rng.range(0.12, 0.2), color: mixRgb(wood, WHITE, 0.5) } }));
    // Side rails.
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    out.push(box(cx + nx * hh, cy + ny * hh, hw, 0.008, angle, wood), box(cx - nx * hh, cy - ny * hh, hw, 0.008, angle, wood));
  } else if (kind === 'ruler') {
    const hw = rng.range(0.4, 0.65);
    const hh = rng.range(0.018, 0.026);
    const body = rng.pick([srgb(226, 196, 70), srgb(190, 192, 196), srgb(200, 160, 110), WHITE]);
    out.push(box(cx, cy, hw, hh, angle, body));
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    out.push(box(cx + nx * hh * 0.5, cy + ny * hh * 0.5, hw, hh * 0.5, angle, body, { pattern: { kind: 'vstripes', period: rng.range(0.016, 0.03), duty: 0.16, color: srgb(24, 24, 24) } }));
  } else if (kind === 'keyboard') {
    const keys = rng.int(22, 40);
    const keyW = rng.range(0.022, 0.03);
    const hw = (keys * keyW) / 2;
    const hh = rng.range(0.05, 0.07);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    out.push(box(cx, cy, hw + 0.02, hh + 0.03, angle, srgb(26, 26, 28)));
    out.push(box(cx, cy + 0.008 * c, hw, hh, angle, WHITE, { pattern: { kind: 'vstripes', period: keyW, duty: 0.07, color: srgb(60, 60, 60) } }));
    for (let k = 0; k < keys - 1; k++) {
      const m = k % 7;
      if (m === 2 || m === 6) continue;
      // Black key between white keys k and k + 1, on the far 60% of the key length.
      const lx = -hw + (k + 1) * keyW;
      const ly = -hh * 0.4;
      out.push(box(cx + lx * c - ly * s, cy + lx * s + ly * c, keyW * 0.3, hh * 0.6, angle, srgb(16, 16, 18)));
    }
  } else if (kind === 'blinds') {
    const w = rng.range(0.5, 0.9);
    const h = rng.range(0.4, 0.75);
    const x0 = rng.range(0.02, aspect - w - 0.02);
    const y0 = rng.range(0.02, 0.9 - h);
    const slat = rng.pick([WHITE, srgb(210, 200, 180), srgb(150, 120, 90)]);
    out.push(rect(x0, y0, x0 + w, y0 + h, scaleRgb(slat, 0.3), { pattern: { kind: 'hstripes', period: rng.range(0.028, 0.045), duty: rng.range(0.65, 0.8), color: slat } }));
  } else if (kind === 'radiator') {
    const w = rng.range(0.45, 0.8);
    const h = rng.range(0.25, 0.4);
    const x0 = rng.range(0.02, aspect - w - 0.02);
    const y0 = rng.range(0.45, 0.98 - h);
    out.push(rect(x0, y0, x0 + w, y0 + h, scaleRgb(WHITE, 0.55), { pattern: { kind: 'vstripes', period: rng.range(0.03, 0.045), duty: rng.range(0.6, 0.75), color: WHITE } }));
  } else {
    // 'books': one long tightly packed shelf across the frame.
    const y = rng.range(0.35, 0.7);
    addShelves(out, rng, rng.range(0.02, 0.2), aspect - rng.range(0.02, 0.2), y, y + 0.3, 1, true);
  }
}

function buildPrims(spec: BackgroundSpec, aspect: number): { prims: Prim[]; tilt: number } {
  const rng = new Rng(spec.seed);
  const prims: Prim[] = [];
  if (spec.kind === 'plain' || spec.kind === 'gradient') return { prims, tilt: 0 };
  const clutter = spec.kind === 'clutter';
  const base = spec.base;
  // A wall corner: one side slightly darker.
  if (rng.chance(clutter ? 0.5 : 0.35)) {
    const x = rng.range(0.2 * aspect, 0.8 * aspect);
    if (rng.chance(0.5)) prims.push(rect(x, -0.3, aspect + 0.5, 1.3, scaleRgb(base, rng.range(0.72, 0.92))));
    else prims.push(rect(-0.5, -0.3, x, 1.3, scaleRgb(base, rng.range(0.72, 0.92))));
  }
  // Wood panelling: low-contrast evenly spaced vertical lines.
  if (clutter && rng.chance(0.25)) {
    const wood = rng.pick(WOODS);
    prims.push(rect(-0.5, rng.range(0.4, 0.7), aspect + 0.5, 1.3, wood, { pattern: { kind: 'vstripes', period: rng.range(0.05, 0.09), duty: 0.08, color: scaleRgb(wood, 0.6) } }));
  }
  if (clutter && rng.chance(0.2)) {
    // Brick or tile wall section.
    const tile = rng.pick([srgb(150, 80, 60), WHITE, srgb(170, 176, 180)]);
    const x0 = rng.range(0, aspect * 0.5);
    prims.push(rect(x0, -0.2, x0 + rng.range(0.5, 1), rng.range(0.4, 1.2), tile, { pattern: { kind: 'grid', period: rng.range(0.07, 0.12), periodY: rng.range(0.035, 0.06), line: 0.006, color: scaleRgb(tile, 0.6) } }));
  }
  if (rng.chance(0.4)) {
    const floorY = rng.range(0.86, 0.97);
    prims.push(rect(-0.5, floorY, aspect + 0.5, 1.4, rng.pick([...WOODS, srgb(90, 90, 96), srgb(150, 140, 126)])));
    prims.push(rect(-0.5, floorY - 0.035, aspect + 0.5, floorY, WHITE));
  }
  if (rng.chance(clutter ? 0.5 : 0.4)) addDoor(prims, rng, aspect);
  if (rng.chance(clutter ? 0.5 : 0.35)) addWindow(prims, rng, aspect, rng.chance(0.3));
  if (rng.chance(clutter ? 0.85 : 0.5)) {
    const dense = clutter && rng.chance(0.6);
    const w = rng.range(0.5, dense ? 1.2 : 1.0);
    const xa = rng.range(0.02, Math.max(0.03, aspect - w - 0.02));
    const count = dense ? rng.int(3, 5) : rng.int(1, 3);
    const y0 = dense ? 0.22 : rng.range(0.2, 0.45);
    addShelves(prims, rng, xa, xa + w, y0, dense ? 1.05 : y0 + count * rng.range(0.2, 0.26), count, dense);
  }
  const pictures = rng.int(clutter ? 1 : 0, clutter ? 4 : 3);
  for (let i = 0; i < pictures; i++) addPicture(prims, rng, aspect);
  if (clutter) {
    const boxes = rng.int(3, 9);
    for (let i = 0; i < boxes; i++) {
      prims.push(box(rng.range(0, aspect), rng.range(0.3, 1), rng.range(0.03, 0.16), rng.range(0.03, 0.14), rng.range(-0.3, 0.3), randomColor(rng)));
    }
    // An amplifier with a grille.
    if (rng.chance(0.4)) {
      const x0 = rng.range(0, aspect - 0.45);
      const y0 = rng.range(0.5, 0.7);
      prims.push(rect(x0, y0, x0 + 0.42, y0 + 0.4, srgb(22, 22, 24)));
      prims.push(rect(x0 + 0.03, y0 + 0.09, x0 + 0.39, y0 + 0.37, srgb(70, 66, 60), { pattern: { kind: 'grid', period: 0.012, periodY: 0.012, line: 0.004, color: srgb(30, 28, 26) } }));
      prims.push(rect(x0 + 0.03, y0 + 0.02, x0 + 0.39, y0 + 0.07, srgb(190, 180, 150)));
    }
    // Long straight edges at odd angles: a rail, a stand, a roof slope.
    const lines = rng.int(1, 3);
    for (let i = 0; i < lines; i++) {
      const ax = rng.range(0, aspect);
      const ay = rng.range(0, 1);
      const ang = rng.range(0, Math.PI);
      const len = rng.range(0.5, 1.4);
      prims.push(line(ax, ay, ax + Math.cos(ang) * len, ay + Math.sin(ang) * len, rng.range(0.006, 0.02), rng.pick([srgb(24, 24, 26), srgb(190, 190, 194), ...WOODS])));
    }
    // Hanging cables.
    const cables = rng.int(0, 3);
    for (let i = 0; i < cables; i++) {
      const ax = rng.range(0, aspect * 0.7);
      const ay = rng.range(0.1, 0.6);
      const span = rng.range(0.3, 0.9);
      const sag = rng.range(0.05, 0.3);
      const dy = rng.range(-0.2, 0.2);
      const color = srgb(20, 20, 22);
      for (let k = 0; k < 8; k++) {
        const t0 = k / 8;
        const t1 = (k + 1) / 8;
        prims.push(line(ax + span * t0, ay + dy * t0 + sag * 4 * t0 * (1 - t0), ax + span * t1, ay + dy * t1 + sag * 4 * t1 * (1 - t1), 0.006, color));
      }
    }
    // A plant.
    if (rng.chance(0.4)) {
      const px = rng.range(0.1, aspect - 0.1);
      const py = rng.range(0.4, 0.8);
      for (let k = 0; k < 9; k++) prims.push(ellipse(px + rng.range(-0.1, 0.1), py + rng.range(-0.12, 0.08), rng.range(0.02, 0.06), rng.range(0.03, 0.09), srgb(rng.int(30, 70), rng.int(90, 150), rng.int(40, 70))));
    }
  }
  for (const decoy of spec.decoys) addDecoy(prims, rng, decoy, aspect);
  return { prims, tilt: (rng.range(-2.5, 2.5) * Math.PI) / 180 };
}

function patternColor(p: Pattern, base: Rgb, lx: number, ly: number, hh: number, pxPerUnit: number, out: Float32Array): void {
  let mix = 0;
  let other = p.color;
  if (p.kind === 'vstripes' || p.kind === 'hstripes') {
    const t = (p.kind === 'vstripes' ? lx : ly) / p.period;
    const frac = t - Math.floor(t);
    // Signed distance (in pixels) into the stripe of width duty * period centred at 0.5.
    const d = (p.duty / 2 - Math.abs(frac - 0.5)) * p.period * pxPerUnit;
    mix = d > 0.5 ? 1 : d < -0.5 ? 0 : d + 0.5;
  } else if (p.kind === 'grid') {
    const row = Math.floor(ly / p.periodY);
    const tx = (lx + (row & 1 ? p.period / 2 : 0)) / p.period;
    const fx = Math.abs(tx - Math.floor(tx) - 0.5) * p.period;
    const ty = ly / p.periodY;
    const fy = Math.abs(ty - Math.floor(ty) - 0.5) * p.periodY;
    const d = (Math.max(fx - (p.period - p.line) / 2, fy - (p.periodY - p.line) / 2)) * pxPerUnit;
    mix = d > 0.5 ? 1 : d < -0.5 ? 0 : d + 0.5;
  } else {
    mix = Math.min(1, Math.max(0, (ly + hh) / (2 * hh)));
    other = p.color;
  }
  out[0] = base[0] + (other[0] - base[0]) * mix;
  out[1] = base[1] + (other[1] - base[1]) * mix;
  out[2] = base[2] + (other[2] - base[2]) * mix;
}

const COLOR = new Float32Array(3);

function paintPrim(bg: Float32Array, t: RenderTarget, prim: Prim, tilt: number): void {
  const H = t.height;
  const W = t.width;
  const cxF = W / 2;
  const cyF = H / 2;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  // Primitive centre in pixels, rotated with the whole background about the frame centre.
  const toPx = (ux: number, uy: number): [number, number] => {
    const x = ux * H - cxF;
    const y = uy * H - cyF;
    return [cxF + x * ct - y * st, cyF + x * st + y * ct];
  };
  const [pcx, pcy] = toPx(prim.cx, prim.cy);
  const soft = Math.max(1, prim.soft * H);
  let x0: number;
  let y0: number;
  let x1: number;
  let y1: number;
  let ca = 1;
  let sa = 0;
  let hw = prim.hw * H;
  let hh = prim.hh * H;
  let ex = 0;
  let ey = 0;
  if (prim.kind === 'line') {
    [ex, ey] = toPx(prim.cx + prim.hw, prim.cy + prim.hh);
    const r = prim.angle * H;
    x0 = Math.min(pcx, ex) - r;
    x1 = Math.max(pcx, ex) + r;
    y0 = Math.min(pcy, ey) - r;
    y1 = Math.max(pcy, ey) + r;
    hw = r;
  } else {
    const ang = prim.kind === 'rect' ? prim.angle + tilt : tilt;
    ca = Math.cos(ang);
    sa = Math.sin(ang);
    const extX = Math.abs(hw * ca) + Math.abs(hh * sa);
    const extY = Math.abs(hw * sa) + Math.abs(hh * ca);
    x0 = pcx - extX;
    x1 = pcx + extX;
    y0 = pcy - extY;
    y1 = pcy + extY;
  }
  const ix0 = Math.max(0, Math.floor(x0 - t.margin - soft));
  const iy0 = Math.max(0, Math.floor(y0 - t.margin - soft));
  const ix1 = Math.min(W - 1, Math.ceil(x1 + t.margin + soft));
  const iy1 = Math.min(H - 1, Math.ceil(y1 + t.margin + soft));
  const { ux, uy } = t;
  const ldx = ex - pcx;
  const ldy = ey - pcy;
  const llen2 = ldx * ldx + ldy * ldy || 1e-9;
  for (let py = iy0; py <= iy1; py++) {
    let i = py * W + ix0;
    for (let px = ix0; px <= ix1; px++, i++) {
      const dx = ux[i] - pcx;
      const dy = uy[i] - pcy;
      let d: number;
      let lx = 0;
      let ly = 0;
      if (prim.kind === 'line') {
        let h = (dx * ldx + dy * ldy) / llen2;
        h = h < 0 ? 0 : h > 1 ? 1 : h;
        const qx = dx - h * ldx;
        const qy = dy - h * ldy;
        d = Math.sqrt(qx * qx + qy * qy) - hw;
      } else {
        lx = dx * ca + dy * sa;
        ly = -dx * sa + dy * ca;
        if (prim.kind === 'rect') {
          d = Math.max(Math.abs(lx) - hw, Math.abs(ly) - hh);
        } else {
          const k = Math.sqrt((lx / hw) * (lx / hw) + (ly / hh) * (ly / hh));
          d = (k - 1) * Math.min(hw, hh);
        }
      }
      let cov = 0.5 - d / soft;
      if (cov <= 0) continue;
      if (cov > 1) cov = 1;
      const a = cov * prim.alpha;
      if (prim.pattern) patternColor(prim.pattern, prim.color, lx / H, ly / H, prim.hh, H, COLOR);
      else {
        COLOR[0] = prim.color[0];
        COLOR[1] = prim.color[1];
        COLOR[2] = prim.color[2];
      }
      const j = i * 3;
      bg[j] += (COLOR[0] - bg[j]) * a;
      bg[j + 1] += (COLOR[1] - bg[j + 1]) * a;
      bg[j + 2] += (COLOR[2] - bg[j + 2]) * a;
    }
  }
}

/** Render a background into `out`: linear RGB, 3 floats per pixel, at least width * height * 3 long. */
export function renderBackground(spec: BackgroundSpec, t: RenderTarget, out: Float32Array): Float32Array {
  const W = t.width;
  const H = t.height;
  const bg = out;
  const rng = new Rng(spec.seed ^ 0x51ed270b);
  const base = spec.base;
  const second = spec.kind === 'gradient' ? scaleRgb(mixRgb(base, srgb(rng.int(40, 220), rng.int(40, 220), rng.int(40, 220)), 0.35), rng.range(0.35, 0.8)) : scaleRgb(base, rng.range(0.8, 0.95));
  const ga = rng.range(0, Math.PI * 2);
  const gx = Math.cos(ga);
  const gy = Math.sin(ga);
  const radial = spec.kind === 'gradient' && rng.chance(0.4);
  const rcx = rng.range(0.2, 0.8) * W;
  const rcy = rng.range(0.1, 0.6) * H;
  const texSeed = rng.seed();
  const texScale = 1 / (0.16 * H);
  // Wall colour: a gradient times a faint plaster texture. Both are smooth, so they are evaluated
  // on a coarse grid and interpolated (rows first, then down the columns).
  const step = 8;
  const gw = Math.ceil(W / step) + 1;
  const gh = Math.ceil(H / step) + 1;
  const grid = new Float32Array(gw * gh * 3);
  for (let gy2 = 0; gy2 < gh; gy2++) {
    for (let gx2 = 0; gx2 < gw; gx2++) {
      const x = gx2 * step;
      const y = gy2 * step;
      let m: number;
      if (radial) m = Math.min(1, Math.sqrt((x - rcx) * (x - rcx) + (y - rcy) * (y - rcy)) / (0.9 * W));
      else m = Math.min(1, Math.max(0, 0.5 + ((x - W / 2) * gx + (y - H / 2) * gy) / W));
      if (spec.kind !== 'gradient') m *= 0.6;
      const tex = 0.96 + 0.08 * fbm2(x * texScale, y * texScale, texSeed);
      const o = (gy2 * gw + gx2) * 3;
      grid[o] = (base[0] + (second[0] - base[0]) * m) * tex;
      grid[o + 1] = (base[1] + (second[1] - base[1]) * m) * tex;
      grid[o + 2] = (base[2] + (second[2] - base[2]) * m) * tex;
    }
  }
  const rowA = new Float32Array(W * 3);
  const rowB = new Float32Array(W * 3);
  const expand = (gridRow: number, out: Float32Array): void => {
    const g0 = Math.min(gh - 1, gridRow) * gw * 3;
    for (let x = 0; x < W; x++) {
      const tx = (x + 0.5) / step;
      const ix = Math.min(gw - 2, tx | 0);
      const fx = tx - ix;
      const o = g0 + ix * 3;
      out[x * 3] = grid[o] + (grid[o + 3] - grid[o]) * fx;
      out[x * 3 + 1] = grid[o + 1] + (grid[o + 4] - grid[o + 1]) * fx;
      out[x * 3 + 2] = grid[o + 2] + (grid[o + 5] - grid[o + 2]) * fx;
    }
  };
  let loaded = -1;
  for (let y = 0; y < H; y++) {
    const ty = (y + 0.5) / step;
    const iy = Math.min(gh - 2, ty | 0);
    const fy = ty - iy;
    if (iy !== loaded) {
      expand(iy, rowA);
      expand(iy + 1, rowB);
      loaded = iy;
    }
    const row = y * W * 3;
    for (let i = 0; i < W * 3; i++) bg[row + i] = rowA[i] + (rowB[i] - rowA[i]) * fy;
  }
  const { prims, tilt } = buildPrims(spec, W / H);
  for (const prim of prims) paintPrim(bg, t, prim, tilt);
  gaussianBlur(bg, W, H, 3, (spec.blur * W) / 640);
  return bg;
}
