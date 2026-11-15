/**
 * Grouping staves into systems, and the content box of each staff.
 *
 * Two vertically adjacent staves belong to one system when ink joins them at the left end (the
 * system bar line, a bracket or a brace), when a bar line runs through both, or, without any
 * connection, when a notation staff sits directly above a tab staff of the same width and closer
 * to it than to the next staff.
 */
import type { BinaryImage } from '../image/gray';
import type { BBox, StaffKind } from '../types';
import { type StaffGeom, lineYAt } from './model';

/** True when ink joins the bottom of `upper` and the top of `lower` at their left end. */
export function staffConnection(bin: BinaryImage, upper: StaffGeom, lower: StaffGeom, pageSpace: number): boolean {
  const { width: w, height: h, data } = bin;
  const x0 = Math.min(upper.x0, lower.x0);
  const xa = Math.max(0, Math.floor(x0 - 2.2 * pageSpace));
  const xb = Math.min(w - 1, Math.ceil(Math.max(upper.x0, lower.x0) + 0.4 * pageSpace));
  const ya = Math.round(lineYAt(upper, upper.lineCount - 1, upper.x0));
  const yb = Math.round(lineYAt(lower, 0, lower.x0));
  if (yb - ya < 2) return false;
  let rows = 0;
  for (let y = Math.max(0, ya); y < Math.min(h, yb); y++) {
    let any = 0;
    const o = y * w;
    for (let x = xa; x <= xb && !any; x++) any = data[o + x];
    rows += any;
  }
  return rows >= 0.93 * (yb - ya);
}

/** Result of {@link groupSystems}: for each system the staff indices, top to bottom. */
export interface SystemGroup {
  staves: number[];
  connected: boolean;
}

/**
 * Group staves (already ordered top to bottom) into systems. `through[i]` tells whether staff i has
 * a bar line running on into staff i + 1.
 */
export function groupSystems(bin: BinaryImage, staves: StaffGeom[], kinds: StaffKind[], pageSpace: number, through: boolean[] = []): SystemGroup[] {
  const n = staves.length;
  const gap = (i: number): number => {
    const x = (Math.max(staves[i].x0, staves[i + 1].x0) + Math.min(staves[i].x1, staves[i + 1].x1)) / 2;
    return lineYAt(staves[i + 1], 0, x) - lineYAt(staves[i], staves[i].lineCount - 1, x);
  };
  const overlap = (i: number): number => {
    const a = staves[i];
    const b = staves[i + 1];
    return (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) / Math.max(1, Math.min(a.x1 - a.x0, b.x1 - b.x0));
  };
  const join: boolean[] = [];
  const joinedByInk: boolean[] = [];
  for (let i = 0; i + 1 < n; i++) {
    if (overlap(i) < 0.7) {
      join.push(false);
      joinedByInk.push(false);
      continue;
    }
    const inkJoin = staffConnection(bin, staves[i], staves[i + 1], pageSpace) || !!through[i];
    joinedByInk.push(inkJoin);
    join.push(inkJoin);
  }
  // Without ink: notation directly above tab, same width, and closer than the staff after.
  for (let i = 0; i + 1 < n; i++) {
    if (join[i] || overlap(i) < 0.9) continue;
    if (!(kinds[i] === 'notation' && kinds[i + 1] === 'tab')) continue;
    if (i > 0 && join[i - 1]) continue;
    const g = gap(i);
    const sameWidth = Math.abs(staves[i].x0 - staves[i + 1].x0) < 2 * pageSpace && Math.abs(staves[i].x1 - staves[i + 1].x1) < 2 * pageSpace;
    const next = i + 2 < n ? gap(i + 1) : Infinity;
    const prev = i > 0 ? gap(i - 1) : Infinity;
    if (sameWidth && g < 16 * pageSpace && g <= next * 1.02 && g <= prev * 1.02) join[i] = true;
  }
  const out: SystemGroup[] = [];
  let cur: SystemGroup = { staves: [], connected: false };
  for (let i = 0; i < n; i++) {
    cur.staves.push(i);
    if (i + 1 < n && join[i]) {
      if (joinedByInk[i]) cur.connected = true;
    } else {
      out.push(cur);
      cur = { staves: [], connected: false };
    }
  }
  return out;
}

/**
 * Box around everything that belongs to a staff: grow from the staff lines up and down while
 * there is ink in the staff's columns, stopping at the first blank band at least `blank` staff
 * spaces tall, or at the limit towards the neighbouring staff.
 */
export function contentBox(bin: BinaryImage, staff: StaffGeom, above: StaffGeom | null, below: StaffGeom | null, blank = 1.1): BBox {
  const { width: w, height: h, data } = bin;
  const sp = staff.space;
  const xa = Math.max(0, Math.floor(staff.x0 - 0.5 * sp));
  const xb = Math.min(w - 1, Math.ceil(staff.x1 + 0.5 * sp));
  const xm = (staff.x0 + staff.x1) / 2;
  let top = Infinity;
  let bottom = -Infinity;
  for (let k = 0; k < staff.xs.length; k++) {
    top = Math.min(top, staff.ys[0][k]);
    bottom = Math.max(bottom, staff.ys[staff.lineCount - 1][k]);
  }
  const limitUp = Math.max(0, above ? lineYAt(above, above.lineCount - 1, xm) + 0.5 * above.space : top - 10 * sp);
  const limitDown = Math.min(h - 1, below ? lineYAt(below, 0, xm) - 0.5 * below.space : bottom + 10 * sp);
  const rowInk = (y: number): boolean => {
    const o = y * w;
    for (let x = xa; x <= xb; x++) if (data[o + x]) return true;
    return false;
  };
  const maxBlank = Math.max(2, Math.round(blank * sp));
  let y0 = Math.floor(top - staff.thickness);
  let run = 0;
  for (let y = y0 - 1; y >= limitUp; y--) {
    if (rowInk(y)) {
      y0 = y;
      run = 0;
    } else if (++run >= maxBlank) {
      break;
    }
  }
  let y1 = Math.ceil(bottom + staff.thickness);
  run = 0;
  for (let y = y1 + 1; y <= limitDown; y++) {
    if (rowInk(y)) {
      y1 = y;
      run = 0;
    } else if (++run >= maxBlank) {
      break;
    }
  }
  return { x: xa, y: y0, w: xb - xa + 1, h: y1 - y0 + 1 };
}
