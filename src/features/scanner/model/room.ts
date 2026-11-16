/**
 * How much room the proofreader has, counted in lines of text rather than pixels, so large text
 * (200 %) gets the layouts made for little room.
 */

/**
 * `short`: little height, so the music and the correction panel sit side by side with a one-line
 * header (a phone held sideways, or large text on a wide screen). `tight`: little height and
 * little width in text terms (large text on an upright phone), so the header slims down and the
 * panel folds away. Both false: the full layout.
 */
export function roomFor(width: number, height: number, rem: number): { short: boolean; tight: boolean } {
  const lines = height / Math.max(1, rem);
  const cols = width / Math.max(1, rem);
  const cramped = lines < 34;
  const short = height <= 520 || (cramped && cols >= 36);
  return { short, tight: cramped && !short };
}
