/**
 * Auto-scroll for the wrapped score: keep the line being played and the next one in view, so the
 * eye can read ahead. Scrolls only when the line changes or the next one would fall out of view,
 * puts the current line near the top, and steps aside for a moment after the learner scrolls.
 * Pure: unit-tested.
 */

/** A line (system) of the score, in the scroll box's content coordinates. */
export interface LineBox {
  y: number;
  height: number;
}

/** The visible part of the scroll box. */
export interface ViewBox {
  top: number;
  height: number;
}

/** Room left above the current line when the view moves (px). */
export const FOLLOW_MARGIN = 12;

/** How long after the learner scrolls the view stops following (ms). */
export const USER_SCROLL_PAUSE_MS = 2500;

/**
 * Where to scroll so the current line and the next one are both visible, or null when they
 * already are (or the move would be under 2 px). When the two do not fit together, the current
 * line is put at the top.
 */
export function followTarget(lines: readonly LineBox[], current: number, view: ViewBox, contentHeight: number, margin = FOLLOW_MARGIN): number | null {
  const a = lines[current];
  if (!a || view.height <= 0) return null;
  const b = lines[current + 1] ?? a;
  const top = view.top + margin;
  const bottom = view.top + view.height - margin;
  const aVisible = a.y >= top - 0.5 && a.y + a.height <= bottom + 0.5;
  const bVisible = b.y + b.height <= bottom + 0.5;
  if (aVisible && bVisible) return null;
  const maxTop = Math.max(0, contentHeight - view.height);
  const target = Math.max(0, Math.min(maxTop, a.y - margin));
  return Math.abs(target - view.top) < 2 ? null : target;
}

/** The line a content y falls in (the last line starting above it). */
export function lineAt(lines: readonly LineBox[], y: number): number {
  let i = 0;
  for (let k = 0; k < lines.length; k++) if (lines[k].y <= y) i = k;
  return i;
}

/** True while the view should follow: the learner has not scrolled in the last few seconds. */
export function shouldFollow(nowMs: number, lastUserScrollMs: number, pauseMs = USER_SCROLL_PAUSE_MS): boolean {
  return nowMs - lastUserScrollMs >= pauseMs;
}

/** Glide to the next line; jump when the move is long (a loop going back, a seek) or motion is reduced. */
export function scrollBehavior(distance: number, viewHeight: number, reducedMotion: boolean): 'smooth' | 'auto' {
  return reducedMotion || Math.abs(distance) > viewHeight * 1.5 ? 'auto' : 'smooth';
}
