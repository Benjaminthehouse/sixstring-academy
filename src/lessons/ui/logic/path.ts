/**
 * Geometry of the winding lesson path: where each node of a unit sits and the curve that joins
 * them. Nodes swing gently left and right like a trail, never so far that a node leaves a 320 px
 * column, and each unit starts where the previous one ended so the trail reads as one.
 */

/** The swing pattern, from -1 (left) to 1 (right), one entry per node. */
const SWING = [0, 0.55, 0.95, 0.55, 0, -0.55, -0.95, -0.55];

/** Horizontal offset (-1 to 1) of the node at `index` counted from `phase`. */
export function swing(index: number, phase = 0): number {
  const i = (((index + phase) % SWING.length) + SWING.length) % SWING.length;
  return SWING[i];
}

/** A node's centre. */
export interface PathPoint {
  x: number;
  y: number;
}

/** The layout of one unit's nodes. */
export interface PathLayout {
  points: PathPoint[];
  /** SVG path data through the points (smooth vertical S-curves). */
  d: string;
  height: number;
}

/** Options for {@link pathLayout}. */
export interface PathOptions {
  /** Width of the column the path lives in, px. */
  width: number;
  /** Vertical distance between nodes, px. */
  row: number;
  /** Diameter of a node, px (keeps nodes inside the column). */
  node: number;
  /** Swing phase: the index the first node takes in the pattern. */
  phase?: number;
  /** Space above the first node and below the last, px. Default half a row. */
  pad?: number;
}

/** Where `count` nodes go in a column of `width`. */
export function pathLayout(count: number, opts: PathOptions): PathLayout {
  const pad = opts.pad ?? opts.row / 2;
  const centre = opts.width / 2;
  // Room each side for the swing, keeping the whole node (and a small margin) inside the column.
  const amplitude = Math.max(0, Math.min(opts.width * 0.3, centre - opts.node / 2 - 8));
  const points: PathPoint[] = Array.from({ length: Math.max(0, count) }, (_u, i) => ({
    x: Math.round((centre + swing(i, opts.phase ?? 0) * amplitude) * 10) / 10,
    y: Math.round((pad + i * opts.row) * 10) / 10,
  }));
  let d = '';
  points.forEach((p, i) => {
    if (i === 0) {
      d = `M${p.x} ${p.y}`;
      return;
    }
    const prev = points[i - 1];
    const mid = (prev.y + p.y) / 2;
    d += ` C${prev.x} ${mid} ${p.x} ${mid} ${p.x} ${p.y}`;
  });
  const height = count > 0 ? Math.round(pad * 2 + (count - 1) * opts.row) : 0;
  return { points, d, height };
}

/** The phase the next unit starts with, so the trail continues where it left off. */
export function nextPhase(phase: number, count: number): number {
  return (((phase + count) % SWING.length) + SWING.length) % SWING.length;
}

/** The index to move keyboard focus to with an arrow key in a list of `count` nodes. */
export function moveFocus(index: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return Math.min(count - 1, index + 1);
    case 'ArrowUp':
    case 'ArrowLeft':
      return Math.max(0, index - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
