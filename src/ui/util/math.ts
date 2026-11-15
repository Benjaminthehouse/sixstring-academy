/** Clamp `value` into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Linear interpolation from `a` to `b` by `t` (0..1). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Number of decimal places needed to show multiples of `step` exactly (0.25 -> 2). */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || Math.floor(step) === step) return 0;
  const text = String(step);
  const exp = text.indexOf('e-');
  if (exp >= 0) return Number(text.slice(exp + 2));
  return text.length - text.indexOf('.') - 1;
}

/**
 * Snap `value` to the nearest multiple of `step` counted from `min`, then clamp to [min, max].
 * Rounds away binary float noise so 0.1 + 0.2 lands on 0.3.
 */
export function snapToStep(value: number, min: number, max: number, step = 1): number {
  if (!Number.isFinite(value)) return min;
  if (!(step > 0)) return clamp(value, min, max);
  const base = Number.isFinite(min) ? min : 0;
  const snapped = base + Math.round((value - base) / step) * step;
  const places = Math.max(stepDecimals(step), stepDecimals(base));
  const rounded = Number(snapped.toFixed(Math.min(places, 10)));
  return clamp(rounded, min, max);
}

/** Position of `value` between `min` and `max` as a fraction 0..1 (0 when the range is empty). */
export function fraction(value: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

/** Ease-out cubic: fast start, gentle landing. Input and output are 0..1. */
export function easeOutCubic(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}
