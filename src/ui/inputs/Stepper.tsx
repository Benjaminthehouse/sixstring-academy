import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../icon/Icon';
import { usePressHold } from '../hooks/usePressHold';
import { cx } from '../util/cx';
import { snapToStep, stepDecimals } from '../util/math';
import fieldStyles from './Field.module.css';
import styles from './Range.module.css';

/** The value after one stepper move. `direction` is +1 or -1; `amount` is the step size used. Pure. */
export function stepValue(value: number, direction: 1 | -1, amount: number, min: number, max: number, step: number): number {
  return snapToStep(value + direction * amount, min, max, step);
}

/** Parse what a person typed into a stepper ("120", "0,5", " 72 bpm") into a number, or null. */
export function parseStepperInput(text: string): number | null {
  const cleaned = text.replace(',', '.').match(/-?\d*\.?\d+/);
  if (!cleaned) return null;
  const n = Number(cleaned[0]);
  return Number.isFinite(n) ? n : null;
}

/** Props for `<Stepper>`. */
export interface StepperProps {
  label: ReactNode;
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Page Up / Page Down jump. Default 10 steps. */
  largeStep?: number;
  /** Short unit after the number ("BPM", "frets"). */
  unit?: ReactNode;
  /** Spoken value: `(v) => v + ' beats per minute'`. Default: the number plus a text unit. */
  format?: (value: number) => string;
  /** md 44 px, lg 56 px with big numerals. */
  size?: 'md' | 'lg';
  /** Let the person type a number. Default true. */
  editable?: boolean;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Minus, value, plus. Press a button once to step, hold it to repeat faster and faster; or focus
 * the number and type, or use the arrow keys (Page Up/Down for big steps, Home/End for the limits).
 *   <Stepper label="Tempo" unit="BPM" min={30} max={260} value={bpm} onChange={setBpm} size="lg" />
 */
export function Stepper({ label, hideLabel, value, onChange, min = 0, max = 100, step = 1, largeStep, unit, format, size = 'md', editable = true, hint, disabled, className }: StepperProps) {
  const id = useId();
  const places = stepDecimals(step);
  const shown = places > 0 ? value.toFixed(places) : String(value);
  const [draft, setDraft] = useState<string | null>(null);
  const big = largeStep ?? step * 10;

  useEffect(() => setDraft(null), [value]);

  const move = (direction: 1 | -1, amount: number) => {
    const next = stepValue(value, direction, amount, min, max, step);
    if (next !== value) onChange(next);
  };
  const dec = usePressHold(() => move(-1, step), { disabled: disabled || value <= min });
  const inc = usePressHold(() => move(1, step), { disabled: disabled || value >= max });

  const commitDraft = () => {
    if (draft == null) return;
    const parsed = parseStepperInput(draft);
    setDraft(null);
    if (parsed == null) return;
    const next = snapToStep(parsed, min, max, step);
    if (next !== value) onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const key = event.key;
    if (key === 'ArrowUp') move(1, step);
    else if (key === 'ArrowDown') move(-1, step);
    else if (key === 'PageUp') move(1, big);
    else if (key === 'PageDown') move(-1, big);
    else if (key === 'Home' && Number.isFinite(min)) onChange(min);
    else if (key === 'End' && Number.isFinite(max)) onChange(max);
    else if (key === 'Enter') {
      commitDraft();
      return;
    } else if (key === 'Escape' && draft != null) {
      event.stopPropagation();
      setDraft(null);
      return;
    } else return;
    event.preventDefault();
    setDraft(null);
  };

  const widest = Math.max(String(min).length, String(max).length, shown.length) + (places > 0 ? 1 : 0);
  const spoken = format ? format(value) : typeof unit === 'string' ? `${shown} ${unit}` : shown;
  const labelText = typeof label === 'string' ? label : 'value';

  return (
    <div className={cx(styles.stepperField, className)}>
      <span id={`${id}-label`} className={cx(fieldStyles.label, hideLabel && 'sr-only')}>
        {label}
      </span>
      <div role="group" aria-labelledby={`${id}-label`} className={cx(styles.stepper, size === 'lg' && styles.stepperLg, disabled && styles.stepperDisabled)}>
        <button type="button" className={styles.stepBtn} tabIndex={-1} aria-label={`Decrease ${labelText}`} disabled={disabled || value <= min} {...dec}>
          <Icon name="Minus" size={size === 'lg' ? 22 : 18} strokeWidth={2.25} />
        </button>
        <div className={styles.stepBody}>
          <input
            type="text"
            inputMode={places > 0 ? 'decimal' : 'numeric'}
            role="spinbutton"
            className={styles.stepValue}
            style={{ width: `${widest}ch` }}
            aria-labelledby={`${id}-label`}
            aria-describedby={hint != null ? `${id}-hint` : undefined}
            aria-valuenow={value}
            aria-valuemin={Number.isFinite(min) ? min : undefined}
            aria-valuemax={Number.isFinite(max) ? max : undefined}
            aria-valuetext={spoken}
            autoComplete="off"
            readOnly={!editable}
            disabled={disabled}
            value={draft ?? shown}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitDraft}
            onKeyDown={onKeyDown}
          />
          {unit != null && <span className={styles.stepUnit}>{unit}</span>}
        </div>
        <button type="button" className={styles.stepBtn} tabIndex={-1} aria-label={`Increase ${labelText}`} disabled={disabled || value >= max} {...inc}>
          <Icon name="Plus" size={size === 'lg' ? 22 : 18} strokeWidth={2.25} />
        </button>
      </div>
      {hint != null && (
        <p id={`${id}-hint`} className={fieldStyles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
