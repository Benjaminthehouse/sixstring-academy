/**
 * What the phone top bar can show without running off the edge. At a large text size (or on a
 * 320 px phone) the four progress chips alone can be wider than the bar, so things give way in
 * order: the repeated screen title, then the brand mark (Today is also the first tab), then the
 * chips' side padding, then the gems chip (it is one tap away in the stats sheet).
 */

/** How much the bar shows, from everything down to the bare minimum. */
export type TopBarFit = 'all' | 'no-title' | 'no-brand' | 'compact' | 'core';

/** Widths measured in the bar, all in px. */
export interface TopBarMeasure {
  /** The bar's content width. */
  available: number;
  /** Gap between the bar's items. */
  gap: number;
  /** The brand link. */
  brand: number;
  /** The least room a title needs to be worth showing (a few letters and an ellipsis). */
  titleMin: number;
  /** Whether the title is showing (its heading has scrolled away). */
  title: boolean;
  /** Each chip's content, without its padding; the last one is the gems chip. */
  chips: number[];
  /** A chip's side padding normally, and in the compact bar. */
  pad: number;
  tightPad: number;
  /** Smallest chip (a touch target). */
  tap: number;
}

function chipsWidth(contents: readonly number[], pad: number, tap: number): number {
  return contents.reduce((sum, c) => sum + Math.max(tap, c + 2 * pad), 0);
}

/** The fullest version of the bar that fits. */
export function topBarFit(m: TopBarMeasure): TopBarFit {
  const room = m.available + 0.5;
  const full = chipsWidth(m.chips, m.pad, m.tap);
  const withBrand = m.brand + m.gap + full;
  if ((m.title ? withBrand + m.titleMin + m.gap : withBrand) <= room) return 'all';
  if (withBrand <= room) return 'no-title';
  if (full <= room) return 'no-brand';
  if (chipsWidth(m.chips, m.tightPad, m.tap) <= room) return 'compact';
  return 'core';
}
