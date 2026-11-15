/**
 * The meter's scale: where a deviation in cents sits on the dial, the tick marks, and how the
 * number is written. The dial is stretched around the centre, because the last few cents are
 * where the learner needs to see the marker move; the ticks are labelled, so it stays honest.
 */

/** Cents shown at the ends of the dial. Further out, the marker rests against the end. */
export const METER_RANGE = 50;

/** Below 1 stretches the middle of the dial. 0.65 puts 3 cents at 16 % and 10 cents at 35 % of the way out. */
const EXPONENT = 0.65;

/** Position on the dial for a deviation in cents: -1 (far flat) .. 0 (in tune) .. +1 (far sharp). */
export function meterPosition(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  const c = Math.min(METER_RANGE, Math.abs(cents)) / METER_RANGE;
  return Math.sign(cents) * Math.pow(c, EXPONENT);
}

/** The inverse of {@link meterPosition}: the cents a dial position stands for. */
export function centsAtPosition(position: number): number {
  const p = Math.min(1, Math.abs(position));
  return Math.sign(position) * Math.pow(p, 1 / EXPONENT) * METER_RANGE;
}

/** True when a deviation is past the end of the dial. */
export function offScale(cents: number): boolean {
  return Math.abs(cents) > METER_RANGE;
}

/** One mark on the dial. */
export interface MeterTick {
  cents: number;
  /** -1 .. +1. */
  position: number;
  /** Long marks every ten cents; short ones at five. */
  major: boolean;
  /** Printed under the mark, or empty. */
  label: string;
}

/** The dial's marks from -50 to +50 cents. */
export function meterTicks(): MeterTick[] {
  const ticks: MeterTick[] = [];
  for (let cents = -METER_RANGE; cents <= METER_RANGE; cents += 5) {
    const major = cents % 10 === 0;
    const labelled = cents === 0 || Math.abs(cents) === 10 || Math.abs(cents) === 30 || Math.abs(cents) === METER_RANGE;
    ticks.push({ cents, position: meterPosition(cents), major, label: labelled ? formatCents(cents) : '' });
  }
  return ticks;
}

/**
 * A deviation as text with a true minus sign: `−12`, `+5`, `0`; with `decimals` 1: `+1.4`.
 * Values that round to zero carry no sign.
 */
export function formatCents(cents: number, decimals = 0): string {
  if (!Number.isFinite(cents)) return '0';
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(cents * factor) / factor;
  if (rounded === 0) return decimals > 0 ? (0).toFixed(decimals) : '0';
  const body = Math.abs(rounded).toFixed(decimals);
  return `${rounded < 0 ? '−' : '+'}${body}`;
}

/** A frequency for display: two decimals below 100 Hz, one above (`82.41 Hz`, `329.6 Hz`). */
export function formatHz(freq: number): string {
  if (!(freq > 0) || !Number.isFinite(freq)) return '';
  return `${freq.toFixed(freq < 100 ? 2 : 1)} Hz`;
}

/** A deviation in plain words, in three parts so the number can be set in its own type. */
export interface OffsetWords {
  /** The size of the deviation without a sign: `12`, `1.4`, `0`. */
  amount: string;
  unit: 'cent' | 'cents';
  /** Which side of the note: empty when the amount rounds to zero. */
  side: 'low' | 'high' | '';
}

/** `12 cents low`, `1 cent high`, `0 cents`: the number a learner reads next to the meter. */
export function offsetWords(cents: number, decimals = 0): OffsetWords {
  const factor = Math.pow(10, decimals);
  const rounded = Number.isFinite(cents) ? Math.round(cents * factor) / factor : 0;
  const size = Math.abs(rounded);
  return { amount: size.toFixed(decimals), unit: size === 1 ? 'cent' : 'cents', side: rounded === 0 ? '' : rounded < 0 ? 'low' : 'high' };
}

/** The value written to `data-cents`: one decimal, plain ASCII minus. */
export function centsAttribute(cents: number): string {
  if (!Number.isFinite(cents)) return '';
  const rounded = Math.round(cents * 10) / 10;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
}
