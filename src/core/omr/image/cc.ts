/**
 * Connected components of a binary image (8-connected by default), labelled run by run with a
 * union-find. Symbols left after staff-line removal (note heads with their stems, digits, clefs,
 * accidentals) are components; so are specks of noise, which is how they are removed.
 */
import { type BinaryImage, createBinary } from './gray';

/** The components of a binary image. Component ids are 1..count; label 0 is paper. */
export interface Components {
  width: number;
  height: number;
  /** Label per pixel (0 = paper). */
  labels: Int32Array;
  count: number;
  /** Bounding boxes, indexed by component id (index 0 unused); x1/y1 are inclusive. */
  x0: Int32Array;
  y0: Int32Array;
  x1: Int32Array;
  y1: Int32Array;
  /** Pixel count per component. */
  area: Int32Array;
}

/** Label the connected components of the ink. */
export function labelComponents(bin: BinaryImage, connectivity: 4 | 8 = 8): Components {
  const { width: w, height: h, data } = bin;
  const labels = new Int32Array(w * h);
  let parent = new Int32Array(1024);
  let next = 1;
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const reach = connectivity === 8 ? 1 : 0;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    const up = o - w;
    let x = 0;
    while (x < w) {
      if (!data[o + x]) { x++; continue; }
      const xs = x;
      while (x < w && data[o + x]) x++;
      const xe = x - 1;
      // Find labels touching this run in the row above.
      let label = 0;
      if (y > 0) {
        const a = Math.max(0, xs - reach);
        const b = Math.min(w - 1, xe + reach);
        for (let i = a; i <= b; i++) {
          const l = labels[up + i];
          if (!l) continue;
          const root = find(l);
          if (!label) label = root;
          else if (root !== label) {
            if (root < label) { parent[label] = root; label = root; } else parent[root] = label;
          }
        }
      }
      if (!label) {
        if (next === parent.length) {
          const np = new Int32Array(parent.length * 2);
          np.set(parent);
          parent = np;
        }
        parent[next] = next;
        label = next++;
      }
      for (let i = xs; i <= xe; i++) labels[o + i] = label;
    }
  }
  // Compact the labels.
  const remap = new Int32Array(next);
  let count = 0;
  for (let l = 1; l < next; l++) {
    const r = find(l);
    if (!remap[r]) remap[r] = ++count;
    remap[l] = remap[r];
  }
  const x0 = new Int32Array(count + 1).fill(w);
  const y0 = new Int32Array(count + 1).fill(h);
  const x1 = new Int32Array(count + 1).fill(-1);
  const y1 = new Int32Array(count + 1).fill(-1);
  const area = new Int32Array(count + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const l = labels[o + x];
      if (!l) continue;
      const c = remap[l];
      labels[o + x] = c;
      area[c]++;
      if (x < x0[c]) x0[c] = x;
      if (x > x1[c]) x1[c] = x;
      if (y < y0[c]) y0[c] = y;
      if (y > y1[c]) y1[c] = y;
    }
  }
  return { width: w, height: h, labels, count, x0, y0, x1, y1, area };
}

/** Cut one component out as its own tight binary image. */
export function componentImage(cc: Components, id: number): BinaryImage {
  const w = cc.x1[id] - cc.x0[id] + 1;
  const h = cc.y1[id] - cc.y0[id] + 1;
  const out = createBinary(w, h);
  for (let y = 0; y < h; y++) {
    const o = (cc.y0[id] + y) * cc.width + cc.x0[id];
    for (let x = 0; x < w; x++) if (cc.labels[o + x] === id) out.data[y * w + x] = 1;
  }
  return out;
}

/** Erase components smaller than `minArea` pixels (speckle) in place; returns how many were removed. */
export function removeSmallComponents(bin: BinaryImage, minArea: number, connectivity: 4 | 8 = 8): number {
  const cc = labelComponents(bin, connectivity);
  let removed = 0;
  const kill = new Uint8Array(cc.count + 1);
  for (let c = 1; c <= cc.count; c++) {
    if (cc.area[c] < minArea) {
      kill[c] = 1;
      removed++;
    }
  }
  if (removed) {
    const d = bin.data;
    for (let i = 0; i < d.length; i++) if (d[i] && kill[cc.labels[i]]) d[i] = 0;
  }
  return removed;
}
