/**
 * How wide one step of a rhythm or strumming bar may be: the comfortable width, narrowed so that a
 * whole bar fits the box it is drawn in (a lesson card on a 360 px phone is about 294 px wide), but
 * never below a floor where the glyphs would collide. Pure; the views pass their measured width.
 */

/** The steps of a bar need this many px beyond the steps themselves (barlines, and the room after the last bar). */
const BAR_CHROME_PX = 10;

/**
 * The CSS width of one step: `base` and `floor` in rem, `boxWidth` the measured width of the view in
 * px (0 while unknown: then the comfortable width). A bar of `steps` fits whenever `floor` allows.
 */
export function stepWidth(steps: number, boxWidth: number, base: number, floor: number): string {
  if (!(boxWidth > 0) || steps <= 0) return `${base}rem`;
  const fit = Math.floor(((boxWidth - BAR_CHROME_PX) / steps) * 100) / 100;
  return `max(${floor}rem, min(${base}rem, ${fit}px))`;
}

/** Comfortable and smallest step widths (rem) of a rhythm grid by its steps per bar. */
export function rhythmStep(stepsPerBar: number): { base: number; floor: number } {
  if (stepsPerBar <= 8) return { base: 1.9, floor: 1.5 };
  if (stepsPerBar <= 12) return { base: 1.55, floor: 1.3 };
  if (stepsPerBar <= 16) return { base: 1.3, floor: 1.05 };
  // Six steps to a beat (eighths beside triplets): notes there are two steps apart at least.
  return { base: 0.85, floor: 0.7 };
}

/** Comfortable and smallest slot widths (rem) of a strumming bar by its slots per bar. */
export function strumStep(slotsPerBar: number): { base: number; floor: number } {
  if (slotsPerBar <= 8) return { base: 2.4, floor: 1.9 };
  if (slotsPerBar <= 12) return { base: 1.9, floor: 1.45 };
  return { base: 1.45, floor: 1.1 };
}
