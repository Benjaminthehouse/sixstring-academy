/**
 * Which layout the Live Fretboard uses: the picture beside a column of controls (wide), the picture
 * over the controls (stacked), or a phone held sideways (the picture takes the height, a slim rail).
 *
 * The viewport query alone is not enough: with the text at 200 percent (a larger root font size)
 * a 1280 px desktop still matches it, and the controls column, two fifths of what is left beside
 * the shell's sidebar, shrinks to about 13 of its own rem: the Root select showed only its arrow.
 * The column needs about 18 rem, so the picture goes beside it only when the layout is at least
 * 45 rem wide in the root font size actually in use.
 */

/** The three layouts (the root's `data-layout`). */
export type CameraLayout = 'wide' | 'stacked' | 'sideways';

/** Narrowest layout (in rem of the root font size) that takes the controls column beside the picture. */
export const WIDE_MIN_REM = 45;

/** The layout for a viewport that matches the wide / sideways queries and a layout box `widthPx` wide at a root font size of `remPx`. */
export function cameraLayout(o: { wideViewport: boolean; sideways: boolean; widthPx: number; remPx: number }): CameraLayout {
  if (o.sideways) return 'sideways';
  if (!o.wideViewport) return 'stacked';
  const rem = o.remPx > 0 ? o.remPx : 16;
  // Not measured yet (first render): trust the viewport query.
  if (!(o.widthPx > 0)) return 'wide';
  return o.widthPx / rem >= WIDE_MIN_REM ? 'wide' : 'stacked';
}
