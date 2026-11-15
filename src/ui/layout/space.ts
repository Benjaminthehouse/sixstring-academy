import type { CSSProperties } from 'react';

/** A step on the 4 px spacing scale; maps to the `--sp-*` tokens. */
export type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16;

/** CSS value for a spacing step: `spaceVar(4)` -> "var(--sp-4)". */
export function spaceVar(step: Space | undefined): string | undefined {
  if (step === undefined) return undefined;
  return step === 0 ? '0' : `var(--sp-${step})`;
}

/** Cross-axis alignment names shared by Stack and Row. */
export type AlignItems = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
/** Main-axis distribution names shared by Stack and Row. */
export type JustifyContent = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

const ALIGN: Record<AlignItems, CSSProperties['alignItems']> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline' };
const JUSTIFY: Record<JustifyContent, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
};

/** Inline flex geometry for the layout primitives (geometry only: never colours or type). */
export function flexStyle(gap: Space | undefined, align: AlignItems | undefined, justify: JustifyContent | undefined): CSSProperties {
  const style: CSSProperties = {};
  if (gap !== undefined) style.gap = spaceVar(gap);
  if (align) style.alignItems = ALIGN[align];
  if (justify) style.justifyContent = JUSTIFY[justify];
  return style;
}
