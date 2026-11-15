import { useId, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../util/cx';
import { fraction } from '../util/math';
import styles from './Range.module.css';

/** A labelled tick under a `<Slider>`. */
export interface SliderMark {
  value: number;
  label?: ReactNode;
}

/** Props for `<Slider>`. */
export interface SliderProps {
  label: ReactNode;
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
  value: number;
  /** Called continuously while dragging. */
  onChange: (value: number) => void;
  /** Called once when the drag or key press ends (for expensive work such as re-rendering audio). */
  onCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Text for the value (bubble, head and `aria-valuetext`): `(v) => v + ' BPM'`. */
  format?: (value: number) => string;
  /** Ticks with optional labels under the track. */
  marks?: SliderMark[];
  /** Value bubble above the thumb: while interacting (default), always, or never. */
  bubble?: 'auto' | 'always' | 'never';
  /** Show the value at the end of the label row. Default true. */
  showValue?: boolean;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/**
 * A range input for continuous values (tempo, volume, zoom). Keyboard: arrows, Page Up/Down, Home/End.
 * Use Stepper when the exact number matters more than the sweep.
 *   <Slider label="Tempo" min={40} max={220} value={bpm} onChange={setBpm} format={(v) => `${v} BPM`} />
 */
export function Slider({ label, hideLabel, value, onChange, onCommit, min = 0, max = 100, step = 1, format, marks, bubble = 'auto', showValue = true, hint, disabled, className, id }: SliderProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const text = format ? format(value) : String(value);
  const vars = { '--frac': fraction(value, min, max) } as CSSProperties;
  const commit = onCommit ? (e: { currentTarget: HTMLInputElement }) => onCommit(Number(e.currentTarget.value)) : undefined;
  return (
    <div className={cx(styles.slider, className)} style={vars}>
      <div className={cx(styles.head, hideLabel && !showValue && 'sr-only')}>
        <label htmlFor={inputId} className={cx(styles.label, hideLabel && 'sr-only')}>
          {label}
        </label>
        {showValue && (
          <span className={styles.value} aria-hidden="true">
            {text}
          </span>
        )}
      </div>
      <div className={cx(styles.trackWrap, bubble === 'always' && styles.bubbleRoom)}>
        <input
          id={inputId}
          type="range"
          className={styles.range}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuetext={text}
          aria-describedby={hint != null ? `${inputId}-hint` : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
        />
        {bubble !== 'never' && (
          <span className={cx(styles.bubble, bubble === 'always' && styles.bubbleAlways)} aria-hidden="true">
            {text}
          </span>
        )}
      </div>
      {marks && marks.length > 0 && (
        <div className={styles.ticks} aria-hidden="true">
          {marks.map((mark) => {
            const at = fraction(mark.value, min, max);
            return (
              <span key={mark.value} className={cx(styles.tick, at <= 0.02 && styles.tickStart, at >= 0.98 && styles.tickEnd)} style={{ '--tick': at } as CSSProperties}>
                {mark.label}
              </span>
            );
          })}
        </div>
      )}
      {hint != null && (
        <p id={`${inputId}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
