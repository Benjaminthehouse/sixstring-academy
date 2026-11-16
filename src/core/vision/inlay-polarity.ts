/**
 * Which way do the inlays stand out: brighter than the board (pearl dots on rosewood) or darker
 * (black dots on maple)?
 *
 * Both numbering readers used to take this from the fret wires' polarity. That holds when the
 * wires are darker than a light board, as the first synthetic renderer draws maple, but a real
 * maple neck has bright nickel wires AND black dots. With the sign reversed every dot reads as
 * "less inlay than a plain cell", and the pattern match then prefers any shift that puts the dots
 * on non-inlay frets: the board was numbered one fret off at full confidence (alt bench, maple
 * boards with black dots). Inlays are sparse, so the median cell is plain board and the few cells
 * that stand out, whichever way, are the inlays: their sign is the inlay polarity.
 */

/**
 * The inlay polarity (+1 brighter than the board, -1 darker) from per-cell contrasts measured
 * without a sign (centre patch minus the board beside it, side patches minus the board, ...).
 * Returns `fallback` when nothing stands out, when too much does (that is texture, not inlays), or
 * when the outliers do not agree on a sign.
 */
export function inlayPolarity(values: readonly number[], fallback: 1 | -1, minStep = 6): 1 | -1 {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 4) return fallback;
  const sorted = [...v].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const dev = v.map((x) => x - median);
  const abs = dev.map((d) => Math.abs(d)).sort((a, b) => a - b);
  const spread = 1.4826 * abs[abs.length >> 1];
  const threshold = Math.max(minStep, 3 * spread);
  let up = 0;
  let down = 0;
  let nUp = 0;
  let nDown = 0;
  for (const d of dev) {
    if (d > threshold) {
      up += d;
      nUp++;
    } else if (d < -threshold) {
      down -= d;
      nDown++;
    }
  }
  const outliers = nUp + nDown;
  if (outliers === 0 || outliers > 0.6 * v.length) return fallback;
  if (nUp > 0 && up >= 2 * down) return 1;
  if (nDown > 0 && down >= 2 * up) return -1;
  return fallback;
}
