import { forwardRef, useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from '../icon/Icon';
import { setRef } from '../feedback/Tooltip';
import { cx } from '../util/cx';
import styles from './Choice.module.css';

interface ChoiceBase extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'checked' | 'size'> {
  checked: boolean;
  /** Called with the new state. */
  onChange: (checked: boolean) => void;
  /** Visible label. For a bare control pass `aria-label` instead and omit this. */
  label?: ReactNode;
  /** A muted line under the label. */
  description?: ReactNode;
  className?: string;
}

/** Props for `<Switch>`. */
export interface SwitchProps extends ChoiceBase {
  /** Which side the switch sits on. "end" (default) suits settings lists; "start" suits inline use. */
  side?: 'start' | 'end';
}

/**
 * An on/off setting that takes effect immediately (use Checkbox inside forms that are submitted).
 *   <Switch label="Left-handed neck" description="Flips every fretboard diagram." checked={lefty} onChange={setLefty} />
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch({ checked, onChange, label, description, side = 'end', disabled, className, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const control = (
    <span className={styles.switch}>
      <input ref={ref} id={inputId} type="checkbox" role="switch" className={styles.switchInput} checked={checked} disabled={disabled} aria-describedby={description != null ? `${inputId}-d` : undefined} onChange={(e) => onChange(e.target.checked)} {...rest} />
      <span className={styles.thumb} aria-hidden="true" />
    </span>
  );
  if (label == null) return <span className={cx(className, disabled && styles.choiceDisabled)}>{control}</span>;
  return (
    <label className={cx(styles.choiceRow, side === 'end' && styles.choiceEnd, description != null && side === 'start' && styles.choiceRowTop, disabled && styles.choiceDisabled, className)}>
      {control}
      <span className={styles.choiceText}>
        <span className={styles.choiceLabel}>{label}</span>
        {description != null && (
          <span id={`${inputId}-d`} className={styles.choiceDescription}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
});

/** Props for `<Checkbox>`. */
export interface CheckboxProps extends ChoiceBase {
  /** Show the "some but not all" dash (the control still reports `checked`). */
  indeterminate?: boolean;
}

/**
 * A tick box for options that are confirmed later, or for picking several items from a list.
 *   <Checkbox label="Count me in before each loop" checked={countIn} onChange={setCountIn} />
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ checked, onChange, label, description, indeterminate = false, disabled, className, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const inner = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  const control = (
    <span className={styles.box}>
      <input
        ref={(node) => {
          inner.current = node;
          setRef(ref, node);
        }}
        id={inputId}
        type="checkbox"
        className={styles.boxInput}
        checked={checked}
        disabled={disabled}
        aria-describedby={description != null ? `${inputId}-d` : undefined}
        onChange={(e) => onChange(e.target.checked)}
        {...rest}
      />
      <span className={styles.boxMark} aria-hidden="true">
        <Icon name={indeterminate && !checked ? 'Minus' : 'Check'} size={16} strokeWidth={3} />
      </span>
    </span>
  );
  if (label == null) return <span className={cx(className, disabled && styles.choiceDisabled)}>{control}</span>;
  return (
    <label className={cx(styles.choiceRow, description != null && styles.choiceRowTop, disabled && styles.choiceDisabled, className)}>
      {control}
      <span className={styles.choiceText}>
        <span className={styles.choiceLabel}>{label}</span>
        {description != null && (
          <span id={`${inputId}-d`} className={styles.choiceDescription}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
});

/** One choice in a `<RadioGroup>`. */
export interface RadioOption<T extends string = string> {
  value: T;
  label: ReactNode;
  /** A muted line explaining the choice. */
  description?: ReactNode;
  disabled?: boolean;
}

/** Props for `<RadioGroup>`. */
export interface RadioGroupProps<T extends string = string> {
  /** Group label (rendered as the fieldset legend). */
  label: ReactNode;
  hideLabel?: boolean;
  options: Array<RadioOption<T> | T>;
  value: T | null;
  onChange: (value: T) => void;
  /** list: plain rows (default). cards: bordered tiles, for choices that deserve a description. */
  variant?: 'list' | 'cards';
  /** Lay plain rows out side by side. */
  orientation?: 'vertical' | 'horizontal';
  /** cards: smallest tile width, e.g. "12rem". */
  minCardWidth?: string;
  hint?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  /** Form field name. Generated when omitted. */
  name?: string;
  className?: string;
}

/**
 * Choose exactly one option, with room to explain each. Native radios: arrow keys move the choice.
 *   <RadioGroup label="Your level" value={level} onChange={setLevel} variant="cards"
 *     options={[{ value: 'new', label: 'New to guitar', description: 'Start from holding the instrument.' }, ...]} />
 */
export function RadioGroup<T extends string = string>({ label, hideLabel, options, value, onChange, variant = 'list', orientation = 'vertical', minCardWidth, hint, error, disabled, name, className }: RadioGroupProps<T>) {
  const auto = useId();
  const groupName = name ?? auto;
  const hintId = `${auto}-hint`;
  const errorId = `${auto}-error`;
  const items: RadioOption<T>[] = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const describedBy = [hint != null ? hintId : null, error != null ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <fieldset className={cx(styles.group, className)} disabled={disabled} aria-describedby={describedBy} aria-invalid={error != null ? true : undefined}>
      <legend className={cx(styles.legend, hideLabel && 'sr-only')}>{label}</legend>
      {hint != null && (
        <p id={hintId} className={styles.groupHint}>
          {hint}
        </p>
      )}
      <div className={cx(styles.options, variant === 'cards' ? styles.optionsCards : orientation === 'horizontal' && styles.optionsRow)} style={minCardWidth ? ({ '--radio-min': minCardWidth } as React.CSSProperties) : undefined}>
        {items.map((item) => {
          const off = disabled || item.disabled;
          const descId = `${auto}-${item.value}-d`;
          return (
            <label key={item.value} className={cx(styles.choiceRow, variant === 'cards' && styles.radioCard, item.description != null && styles.choiceRowTop, off && styles.choiceDisabled)}>
              <span className={styles.box}>
                <input
                  type="radio"
                  name={groupName}
                  value={item.value}
                  className={cx(styles.boxInput, styles.radioInput)}
                  checked={value === item.value}
                  disabled={off}
                  aria-describedby={item.description != null ? descId : undefined}
                  onChange={() => onChange(item.value)}
                />
                <span className={styles.radioDot} aria-hidden="true" />
              </span>
              <span className={styles.choiceText}>
                <span className={styles.choiceLabel}>{item.label}</span>
                {item.description != null && (
                  <span id={descId} className={styles.choiceDescription}>
                    {item.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {error != null && (
        <p id={errorId} className={styles.groupError} role="alert">
          <Icon name="CircleAlert" size="sm" />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
}
