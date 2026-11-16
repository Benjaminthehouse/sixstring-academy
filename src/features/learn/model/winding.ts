/**
 * The geometry of the winding path: where each lesson node sits in a column, and the trail that
 * joins them. The path swings gently left and right (a quarter of a sine per node) and carries its
 * swing on from one unit to the next, so the whole map reads as one road. Pure.
 */

/** Layout inputs. All lengths in CSS pixels. */
export interface WindingOptions {
  /** Width of the column. */
  width: number;
  /** Vertical distance between nodes. */
  row: number;
  /** Node diameter. */
  node: number;
  /** Space above the first node and below the last. */
  pad: number;
  /** Where in the swing the first node sits (the previous unit's `nextPhase`). */
  phase: number;
}

/** A laid-out stretch of path. */
export interface Winding {
  points: Array<{ x: number; y: number; side: -1 | 0 | 1 }>;
  /** SVG path data for the trail through every node. */
  d: string;
  height: number;
}

/** Room kept beside a node at the far end of a swing for its title. */
const LABEL_ROOM = 64;

/** How far the path swings from the middle of a column this wide. */
export function swingOf(width: number, node: number): number {
  return Math.max(0, Math.min(96, width / 2 - node / 2 - LABEL_ROOM, width * 0.22));
}

/** Lay out `count` nodes. */
export function windingLayout(count: number, o: WindingOptions): Winding {
  const amp = swingOf(o.width, o.node);
  const mid = o.width / 2;
  const points = Array.from({ length: Math.max(0, count) }, (_u, i) => {
    const s = Math.sin(((o.phase + i) * Math.PI) / 4);
    const x = Math.round((mid + amp * s) * 10) / 10;
    const side: -1 | 0 | 1 = Math.abs(s) < 0.2 ? 0 : s > 0 ? 1 : -1;
    return { x, y: o.pad + i * o.row, side };
  });
  let d = '';
  points.forEach((p, i) => {
    if (i === 0) {
      d = `M ${p.x} ${p.y}`;
      return;
    }
    const q = points[i - 1];
    const h = o.row / 2;
    d += ` C ${q.x} ${q.y + h} ${p.x} ${p.y - h} ${p.x} ${p.y}`;
  });
  const height = count === 0 ? 0 : o.pad * 2 + (count - 1) * o.row;
  return { points, d, height };
}

/** The phase the next unit starts at, so the swing carries on. */
export function nextPhase(phase: number, count: number): number {
  return (phase + count) % 8;
}
