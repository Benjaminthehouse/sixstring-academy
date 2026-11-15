import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { renderIcon, type IconSource } from '../icon/Icon';
import { cx } from '../util/cx';
import { rovingIndex, rovingKeyFor } from '../util/roving';
import styles from './Choice.module.css';

/** One segment of a `<SegmentedControl>`. */
export interface SegmentOption<T extends string | number = string> {
  value: T;
  label: ReactNode;
  icon?: IconSource;
  /** Accessible name when `label` is not plain text (icon-only segments). */
  ariaLabel?: string;
  disabled?: boolean;
}

/** Props for `<SegmentedControl>`. */
export interface SegmentedControlProps<T extends string | number = string> {
  /** 2-5 short choices: strings/numbers, or `{ value, label, icon }`. */
  options: Array<SegmentOption<T> | T>;
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers ("Note names"). */
  'aria-label': string;
  size?: 'sm' | 'md' | 'lg';
  /** Segments share the full width equally. */
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Pick one of a few mutually exclusive options that apply at once (a view mode, sharps/flats).
 * A radio group underneath: arrow keys move the selection.
 *   <SegmentedControl aria-label="Accidentals" options={['Sharps', 'Flats']} value={acc} onChange={setAcc} />
 */
export function SegmentedControl<T extends string | number = string>({ options, value, onChange, size = 'md', fullWidth, disabled, className, ...rest }: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const items: SegmentOption<T>[] = options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) }));
  const selected = items.findIndex((o) => o.value === value);
  const isDisabled = (i: number) => !!disabled || !!items[i]?.disabled;
  // If nothing matches `value`, the first enabled segment stays reachable by Tab.
  const tabStop = selected >= 0 && !isDisabled(selected) ? selected : items.findIndex((_, i) => !isDisabled(i));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = rovingKeyFor(event.key, 'both');
    if (!move) return;
    event.preventDefault();
    const from = refs.current.findIndex((el) => el === document.activeElement);
    const next = rovingIndex(from >= 0 ? from : tabStop, items.length, move, isDisabled);
    if (next < 0) return;
    refs.current[next]?.focus();
    if (items[next].value !== value) onChange(items[next].value);
  };

  return (
    <div role="radiogroup" aria-label={rest['aria-label']} aria-disabled={disabled || undefined} className={cx(styles.segmented, fullWidth && styles.segmentedFull, size === 'sm' && styles.segmentedSm, size === 'lg' && styles.segmentedLg, className)} onKeyDown={onKeyDown}>
      {items.map((item, i) => {
        const checked = i === selected;
        return (
          <button
            key={String(item.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={item.ariaLabel}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={isDisabled(i)}
            className={cx(styles.segment, checked && styles.segmentSelected)}
            onClick={() => {
              if (!checked) onChange(item.value);
            }}
          >
            {item.icon != null && renderIcon(item.icon, { size: size === 'sm' ? 14 : 16 })}
            {item.label != null && item.label !== '' && <span className={styles.segmentLabel}>{item.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
