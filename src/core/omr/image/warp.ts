/**
 * Geometric resampling. Every geometric correction of a page (scale normalisation, deskew,
 * perspective, page curl) is expressed as one {@link WarpMesh}: a coarse grid that says, for
 * each node of the output image, where it comes from in the source image. Pixels are resampled
 * exactly once through the mesh, and the same mesh maps recognised boxes back to the original
 * page for proofreading.
 *
 * Coordinates are continuous image coordinates: pixel (i, j) covers [i, i+1) x [j, j+1), so its
 * centre is at (i + 0.5, j + 0.5). This is the canvas / SVG convention, which keeps boxes drawn
 * over the original image exactly aligned.
 */
import { type GrayImage, type Point, createGray } from './gray';

/** Output-to-source lookup grid: node (i, j) sits at output position (i * cell, j * cell). */
export interface WarpMesh {
  /** Output image size in px. */
  width: number;
  height: number;
  /** Node spacing in output px. */
  cell: number;
  /** Node counts: cols = ceil(width / cell) + 1, rows likewise. */
  cols: number;
  rows: number;
  /** Source coordinates of each node, row-major. */
  sx: Float32Array;
  sy: Float32Array;
}

/** 2x3 affine transform [a, b, c, d, e, f]: x' = a x + b y + c, y' = d x + e y + f. */
export type Affine = [number, number, number, number, number, number];

/** Build a mesh by evaluating an output -> source function at every node. */
export function meshFromFunction(width: number, height: number, cell: number, fn: (x: number, y: number) => Point): WarpMesh {
  const cols = Math.ceil(width / cell) + 1;
  const rows = Math.ceil(height / cell) + 1;
  const sx = new Float32Array(cols * rows);
  const sy = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p = fn(i * cell, j * cell);
      sx[j * cols + i] = p.x;
      sy[j * cols + i] = p.y;
    }
  }
  return { width, height, cell, cols, rows, sx, sy };
}

/** Mesh for an affine output -> source transform (exact, since bilinear interpolation reproduces affine maps). */
export function meshFromAffine(width: number, height: number, t: Affine, cell = 64): WarpMesh {
  return meshFromFunction(width, height, cell, (x, y) => ({ x: t[0] * x + t[1] * y + t[2], y: t[3] * x + t[4] * y + t[5] }));
}

/** The identity mesh for an image of the given size. */
export function identityMesh(width: number, height: number): WarpMesh {
  return meshFromAffine(width, height, [1, 0, 0, 0, 1, 0], Math.max(width, height));
}

/** Map an output point to the source through the mesh (linear extrapolation outside the grid). */
export function meshMap(mesh: WarpMesh, x: number, y: number): Point {
  const { cell, cols, rows, sx, sy } = mesh;
  let i = Math.floor(x / cell);
  let j = Math.floor(y / cell);
  if (i < 0) i = 0; else if (i > cols - 2) i = cols - 2;
  if (j < 0) j = 0; else if (j > rows - 2) j = rows - 2;
  const u = x / cell - i;
  const v = y / cell - j;
  const k = j * cols + i;
  const ax = sx[k] + (sx[k + 1] - sx[k]) * u;
  const bx = sx[k + cols] + (sx[k + cols + 1] - sx[k + cols]) * u;
  const ay = sy[k] + (sy[k + 1] - sy[k]) * u;
  const by = sy[k + cols] + (sy[k + cols + 1] - sy[k + cols]) * u;
  return { x: ax + (bx - ax) * v, y: ay + (by - ay) * v };
}

const inverseGuess = new WeakMap<WarpMesh, Affine>();

/** Least-squares affine source -> output fit of a mesh, used to start the inverse iteration. */
function affineInverse(mesh: WarpMesh): Affine {
  const cached = inverseGuess.get(mesh);
  if (cached) return cached;
  // Normal equations for [x; y] = M [sx; sy; 1].
  let sxx = 0, sxy = 0, sx1 = 0, syy = 0, sy1 = 0, n = 0;
  let bx0 = 0, bx1 = 0, bx2 = 0, by0 = 0, by1 = 0, by2 = 0;
  for (let j = 0; j < mesh.rows; j++) {
    for (let i = 0; i < mesh.cols; i++) {
      const u = mesh.sx[j * mesh.cols + i];
      const v = mesh.sy[j * mesh.cols + i];
      const x = i * mesh.cell;
      const y = j * mesh.cell;
      sxx += u * u; sxy += u * v; sx1 += u; syy += v * v; sy1 += v; n++;
      bx0 += u * x; bx1 += v * x; bx2 += x;
      by0 += u * y; by1 += v * y; by2 += y;
    }
  }
  const A = [sxx, sxy, sx1, sxy, syy, sy1, sx1, sy1, n];
  const inv = invert3(A);
  const t: Affine = inv
    ? [
      inv[0] * bx0 + inv[1] * bx1 + inv[2] * bx2, inv[3] * bx0 + inv[4] * bx1 + inv[5] * bx2, inv[6] * bx0 + inv[7] * bx1 + inv[8] * bx2,
      inv[0] * by0 + inv[1] * by1 + inv[2] * by2, inv[3] * by0 + inv[4] * by1 + inv[5] * by2, inv[6] * by0 + inv[7] * by1 + inv[8] * by2,
    ]
    : [1, 0, 0, 0, 1, 0];
  inverseGuess.set(mesh, t);
  return t;
}

/** Map a source point back to output coordinates (Newton iteration on the mesh). */
export function meshUnmap(mesh: WarpMesh, sx: number, sy: number): Point {
  const g = affineInverse(mesh);
  let x = g[0] * sx + g[1] * sy + g[2];
  let y = g[3] * sx + g[4] * sy + g[5];
  for (let it = 0; it < 12; it++) {
    const p = meshMap(mesh, x, y);
    const ex = p.x - sx;
    const ey = p.y - sy;
    if (ex * ex + ey * ey < 1e-6) break;
    const px = meshMap(mesh, x + 1, y);
    const py = meshMap(mesh, x, y + 1);
    const a = px.x - p.x, b = py.x - p.x, c = px.y - p.y, d = py.y - p.y;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-9) break;
    x -= (d * ex - b * ey) / det;
    y -= (-c * ex + a * ey) / det;
  }
  return { x, y };
}

/** Options for {@link warpGray}. */
export interface WarpOptions {
  /** Grey level for output pixels that fall outside the source (default 255). */
  fill?: number;
  /**
   * 'fill' (default) paints outside pixels with `fill`; 'clamp' repeats the nearest edge pixel, which
   * avoids a false edge between grey paper and a white fill when a page is rotated inside its frame.
   */
  edge?: 'fill' | 'clamp';
}

/** Resample `src` through a mesh with bilinear interpolation. */
export function warpGray(src: GrayImage, mesh: WarpMesh, opts: WarpOptions = {}): GrayImage {
  const fill = opts.fill ?? 255;
  const clamp = opts.edge === 'clamp';
  const { width: W, height: H, cell, cols } = mesh;
  const out = createGray(W, H, fill);
  const o = out.data;
  const d = src.data;
  const sw = src.width;
  const sh = src.height;
  const maxX = sw - 1;
  const maxY = sh - 1;
  const inv = 1 / cell;
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) * inv;
    let j = Math.floor(fy);
    if (j > mesh.rows - 2) j = mesh.rows - 2;
    const v = fy - j;
    const r0 = j * cols;
    const r1 = r0 + cols;
    const row = y * W;
    for (let i = 0; i < cols - 1; i++) {
      const xStart = i * cell;
      if (xStart >= W) break;
      const xEnd = Math.min(W, xStart + cell);
      // Source coordinates at the left and right edge of this cell for this row.
      const lx = mesh.sx[r0 + i] + (mesh.sx[r1 + i] - mesh.sx[r0 + i]) * v;
      const ly = mesh.sy[r0 + i] + (mesh.sy[r1 + i] - mesh.sy[r0 + i]) * v;
      const rx = mesh.sx[r0 + i + 1] + (mesh.sx[r1 + i + 1] - mesh.sx[r0 + i + 1]) * v;
      const ry = mesh.sy[r0 + i + 1] + (mesh.sy[r1 + i + 1] - mesh.sy[r0 + i + 1]) * v;
      const dx = (rx - lx) * inv;
      const dy = (ry - ly) * inv;
      // Pixel centre of the first pixel is half a pixel into the cell; -0.5 converts to index space.
      let px = lx + dx * 0.5 - 0.5;
      let py = ly + dy * 0.5 - 0.5;
      for (let x = xStart; x < xEnd; x++, px += dx, py += dy) {
        if (!clamp && (px < -0.5 || py < -0.5 || px > maxX + 0.5 || py > maxY + 0.5)) continue;
        let x0 = px | 0;
        let y0 = py | 0;
        let wx = px - x0;
        let wy = py - y0;
        if (px < 0) { x0 = 0; wx = 0; }
        if (py < 0) { y0 = 0; wy = 0; }
        if (x0 >= maxX) { x0 = maxX; wx = 0; }
        if (y0 >= maxY) { y0 = maxY; wy = 0; }
        const p = y0 * sw + x0;
        const a = d[p];
        const b = wx > 0 ? d[p + 1] : a;
        if (wy > 0) {
          const c = d[p + sw];
          const e = wx > 0 ? d[p + sw + 1] : c;
          const top = a + (b - a) * wx;
          o[row + x] = top + (c + (e - c) * wx - top) * wy + 0.5;
        } else {
          o[row + x] = a + (b - a) * wx + 0.5;
        }
      }
    }
  }
  return out;
}

/** Rotate an image about its centre by `angle` radians (positive = clockwise on screen), same size. */
export function rotateGray(img: GrayImage, angle: number, fill = 255): GrayImage {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const cx = img.width / 2;
  const cy = img.height / 2;
  // Output -> source is the inverse rotation.
  const t: Affine = [c, s, cx - c * cx - s * cy, -s, c, cy + s * cx - c * cy];
  return warpGray(img, meshFromAffine(img.width, img.height, t), { fill });
}

/** Inverse of a 3x3 matrix given row-major, or null when singular. */
export function invert3(m: ArrayLike<number>): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const k = 1 / det;
  return [A * k, (c * h - b * i) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, (c * d - a * f) * k, C * k, (b * g - a * h) * k, (a * e - b * d) * k];
}

/** 3x3 homography (row-major) that maps four `from` points onto four `to` points. */
export function homographyFromPoints(from: Point[], to: Point[]): number[] {
  // Solve the 8x8 system A h = b by Gaussian elimination with partial pivoting.
  const A: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const { x, y } = from[k];
    const { x: u, y: v } = to[k];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const p = A[col][col];
    if (Math.abs(p) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let c = col; c < 9; c++) A[col][c] /= p;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (f === 0) continue;
      for (let c = col; c < 9; c++) A[r][c] -= f * A[col][c];
    }
  }
  return [A[0][8], A[1][8], A[2][8], A[3][8], A[4][8], A[5][8], A[6][8], A[7][8], 1];
}

/** Apply a 3x3 homography to a point. */
export function applyHomography(h: ArrayLike<number>, x: number, y: number): Point {
  const w = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}
