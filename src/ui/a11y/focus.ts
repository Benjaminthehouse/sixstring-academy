import styles from './focus.module.css';

/** Class that draws the standard focus ring on `:focus-visible`. Set `--focus-radius` to match the element's corner. */
export const focusRing: string = styles.ring;
/** Like `focusRing`, drawn inside the box (for elements clipped by a scroll container). */
export const focusRingInset: string = styles.ringInset;
/** Rings a wrapper while a native control inside it has keyboard focus. */
export const focusRingWithin: string = styles.ringWithin;
