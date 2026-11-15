/**
 * How the answer pad lays out its buttons. Pure, so the rule is tested: the pad asks for a number
 * of columns, and its CSS uses fewer whenever the widest label would not fit (a narrow phone, a
 * long scale name, a learner's large text). Labels are never broken mid-word.
 */

/** The label size steps the pad uses (CSS `--text-*` tokens). */
export type PadSize = '2xl' | 'xl' | 'lg';

/** Sizes of the steps, in rem (as in `tokens.css`). */
const SIZE_REM: Record<PadSize, number> = { '2xl': 1.75, xl: 1.375, lg: 1.125 };

/** The answer pad's layout. */
export interface PadLayout {
  /** Columns wanted when the width allows. */
  cols: number;
  /** Columns wanted on a phone held sideways (little height, more width). */
  colsWide: number;
  /** Narrowest a column may be, in rem: below it the pad uses fewer columns. */
  minCol: number;
  /** Label size step. */
  size: PadSize;
  /** Button height, in rem. */
  height: number;
}

/** Advance widths (em) of the display face in bold, measured in the browser; anything else counts as wide. */
const GLYPH_EM: Record<string, number> = {
  ...Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map((c, i) => [c, [0.58, 0.64, 0.57, 0.64, 0.59, 0.41, 0.6, 0.63, 0.28, 0.28, 0.59, 0.27, 0.95, 0.63, 0.61, 0.64, 0.64, 0.43, 0.55, 0.41, 0.62, 0.59, 0.89, 0.58, 0.6, 0.53][i]])),
  ...Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => [c, [0.71, 0.68, 0.68, 0.7, 0.62, 0.59, 0.72, 0.72, 0.29, 0.37, 0.69, 0.51, 0.94, 0.78, 0.72, 0.64, 0.74, 0.68, 0.66, 0.6, 0.73, 0.69, 1.02, 0.71, 0.67, 0.59][i]])),
  ...Object.fromEntries([...'0123456789'].map((c, i) => [c, [0.67, 0.35, 0.61, 0.62, 0.64, 0.61, 0.66, 0.54, 0.66, 0.66][i]])),
  ' ': 0.23, '–': 0.54, '-': 0.35, ',': 0.2, '.': 0.24, '·': 0.23, '♭': 0.47, '♯': 0.5, '(': 0.3, ')': 0.3,
};

/** A label's width in em in the display face (bold), with a small margin so it never comes in short. */
export function labelEm(label: string): number {
  let em = 0;
  for (const ch of label) em += GLYPH_EM[ch] ?? 0.75;
  return em * 1.05;
}

/** Room a button needs around its label: its side padding and a little air on each side. */
const CHROME_REM = 1.75;
/** An icon before the label: 20 px and its gap. */
const ICON_REM = 1.75;
/** About what a phone in the hand gives the pad: 360 px less the page gutters, in rem. */
export const PHONE_PAD_REM = 20.5;
/** The gap between buttons, in rem (`--sp-2`). */
export const PAD_GAP_REM = 0.5;

/** Columns the pad shows at a width (in rem): the wanted number, or fewer when labels would not fit. Mirrors the CSS. */
export function columnsAt(layout: Pick<PadLayout, 'cols' | 'minCol'>, widthRem: number): number {
  return Math.max(1, Math.min(layout.cols, Math.floor((widthRem + PAD_GAP_REM) / (layout.minCol + PAD_GAP_REM))));
}

/** An answer as the pad sizes it. */
export interface PadItem {
  label: string;
  icon?: string;
}

/** Columns, sizes and the narrowest column for a set of answers. */
export function padLayout(items: readonly PadItem[]): PadLayout {
  const n = Math.max(1, items.length);
  const width = (o: PadItem, s: PadSize) => labelEm(o.label) * SIZE_REM[s] + (o.icon ? ICON_REM : 0);
  const cols = n <= 2 ? n : n === 4 ? 2 : 3;
  const height = n <= 2 ? 6.5 : n <= 3 ? 5.5 : n <= 4 ? 4.75 : n <= 6 ? 4.25 : n <= 9 ? 3.75 : 3.5;
  const need = (s: PadSize) => Math.max(0, ...items.map((o) => width(o, s))) + CHROME_REM;
  const steps: PadSize[] = n <= 2 ? ['2xl', 'xl'] : n <= 6 ? ['xl', 'lg'] : ['lg'];
  // Long labels step down a size before the pad gives up a column on a phone.
  let size = steps[0];
  for (const s of steps) {
    size = s;
    if (columnsAt({ cols, minCol: need(s) }, PHONE_PAD_REM) === cols) break;
  }
  // Sideways, the pad has the width and not the height: up to four columns, at most three rows.
  const colsWide = Math.min(4, Math.max(cols, Math.ceil(n / 3)));
  return { cols, colsWide, minCol: Math.round(need(size) * 100) / 100, size, height };
}
