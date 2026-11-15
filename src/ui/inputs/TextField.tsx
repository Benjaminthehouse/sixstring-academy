import { forwardRef, useCallback, useId, useLayoutEffect, useRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon, renderIcon, type IconSource } from '../icon/Icon';
import { setRef } from '../feedback/Tooltip';
import { cx } from '../util/cx';
import { Field, describedBy, type FieldLabelProps } from './Field';
import styles from './Field.module.css';

/** Control height: sm 36, md 44, lg 52 px. */
export type ControlSize = 'sm' | 'md' | 'lg';

/** Props for `<TextField>`. */
export interface TextFieldProps extends FieldLabelProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size' | 'prefix'> {
  value?: string;
  /** Called with the new text. */
  onChange?: (value: string, event: ChangeEvent<HTMLInputElement>) => void;
  /** Leading icon inside the box. */
  icon?: IconSource;
  /** Short leading text inside the box ("BPM", "#"). */
  prefix?: ReactNode;
  /** Unit, icon or small control inside the box, after the input. */
  suffix?: ReactNode;
  size?: ControlSize;
  /** Monospace value (tab, tunings, codes). */
  mono?: boolean;
  /** Class for the outer field wrapper. */
  className?: string;
}

/**
 * One-line text input with its label, hint and error.
 *   <TextField label="Song title" value={title} onChange={setTitle} hint="Shown in your library." />
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel, hint, error, optional, aside, value, onChange, icon, prefix, suffix, size = 'md', mono, className, id, disabled, type = 'text', ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} error={error} optional={optional} aside={aside} htmlFor={inputId} hintId={hintId} errorId={errorId} className={className}>
      <div className={cx(styles.control, size !== 'md' && styles[size], error != null && error !== false && styles.invalid, disabled && styles.disabled)}>
        {icon != null && <span className={styles.adorn}>{renderIcon(icon, { size: 18 })}</span>}
        {prefix != null && <span className={styles.adorn}>{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cx(styles.input, mono && styles.mono)}
          value={value}
          disabled={disabled}
          aria-invalid={error != null && error !== false ? true : undefined}
          aria-describedby={describedBy(hintId, errorId, hint, error, rest['aria-describedby'])}
          onChange={onChange ? (e) => onChange(e.target.value, e) : undefined}
          {...rest}
        />
        {suffix != null && <span className={styles.adorn}>{suffix}</span>}
      </div>
    </Field>
  );
});

/** Props for `<TextArea>`. */
export interface TextAreaProps extends FieldLabelProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value?: string;
  /** Called with the new text. */
  onChange?: (value: string, event: ChangeEvent<HTMLTextAreaElement>) => void;
  /** Grow with the content instead of showing a scrollbar. */
  autoGrow?: boolean;
  /** Monospace (pasting tab or chord sheets). */
  mono?: boolean;
  /** Show a "12 / 200" counter when `maxLength` is set. Default true. */
  showCount?: boolean;
  className?: string;
}

/**
 * Multi-line text input.
 *   <TextArea label="Practice notes" value={notes} onChange={setNotes} autoGrow maxLength={500} />
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hideLabel, hint, error, optional, aside, value, onChange, autoGrow, mono, showCount = true, className, id, disabled, rows = 3, maxLength, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const assign = useCallback(
    (node: HTMLTextAreaElement | null) => {
      inner.current = node;
      setRef(ref, node);
    },
    [ref],
  );

  useLayoutEffect(() => {
    const el = inner.current;
    if (!autoGrow || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [autoGrow, value]);

  const length = value?.length ?? 0;
  const counter =
    maxLength != null && showCount ? (
      <span className={cx(styles.counter, length >= maxLength && styles.counterOver)}>
        {length} / {maxLength}
      </span>
    ) : undefined;
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} error={error} optional={optional} aside={aside ?? counter} htmlFor={inputId} hintId={hintId} errorId={errorId} className={className}>
      <div className={cx(styles.control, styles.textareaControl, error != null && error !== false && styles.invalid, disabled && styles.disabled)}>
        <textarea
          ref={assign}
          id={inputId}
          rows={rows}
          maxLength={maxLength}
          className={cx(styles.input, styles.textarea, autoGrow && styles.autoGrow, mono && styles.mono)}
          value={value}
          disabled={disabled}
          aria-invalid={error != null && error !== false ? true : undefined}
          aria-describedby={describedBy(hintId, errorId, hint, error, rest['aria-describedby'])}
          onChange={onChange ? (e) => onChange(e.target.value, e) : undefined}
          {...rest}
        />
      </div>
    </Field>
  );
});

/** One choice in a `<Select>`. */
export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}
/** A labelled group of choices in a `<Select>`. */
export interface SelectGroup<T extends string = string> {
  group: string;
  options: Array<SelectOption<T> | T>;
}

/** Props for `<Select>`. */
export interface SelectProps<T extends string = string> extends FieldLabelProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'size' | 'prefix'> {
  value: T;
  /** Called with the chosen value. */
  onChange: (value: T, event: ChangeEvent<HTMLSelectElement>) => void;
  /** Choices: plain strings, `{ value, label }`, or `{ group, options }` for grouped lists. */
  options: Array<SelectOption<T> | SelectGroup<T> | T>;
  /** Unselectable first row shown while `value` is empty ("Choose a key"). */
  placeholder?: string;
  /** Icon inside the box, before the value. */
  prefix?: IconSource;
  size?: ControlSize;
  className?: string;
}

function optionNode<T extends string>(opt: SelectOption<T> | T) {
  const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
  return (
    <option key={o.value} value={o.value} disabled={(o as SelectOption<T>).disabled}>
      {o.label}
    </option>
  );
}

/**
 * A native select, styled. Native on purpose: phones get their own picker wheel and it is fully
 * accessible. Use SegmentedControl for 2-5 short choices and RadioGroup when the choices need explaining.
 *   <Select label="Tuning" value={tuning} onChange={setTuning} options={['Standard', 'Drop D', 'DADGAD']} />
 */
export function Select<T extends string = string>({ label, hideLabel, hint, error, optional, aside, value, onChange, options, placeholder, prefix, size = 'md', className, id, disabled, ...rest }: SelectProps<T>) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} error={error} optional={optional} aside={aside} htmlFor={inputId} hintId={hintId} errorId={errorId} className={className}>
      <div className={cx(styles.control, styles.selectControl, size !== 'md' && styles[size], prefix != null && styles.withPrefix, error != null && error !== false && styles.invalid, disabled && styles.disabled)}>
        {prefix != null && <span className={styles.selectPrefix}>{renderIcon(prefix, { size: 18 })}</span>}
        <select
          id={inputId}
          className={cx(styles.input, styles.select)}
          value={value}
          disabled={disabled}
          aria-invalid={error != null && error !== false ? true : undefined}
          aria-describedby={describedBy(hintId, errorId, hint, error, rest['aria-describedby'])}
          onChange={(e) => onChange(e.target.value as T, e)}
          {...rest}
        >
          {placeholder != null && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) =>
            typeof opt === 'object' && 'group' in opt ? (
              <optgroup key={opt.group} label={opt.group}>
                {opt.options.map(optionNode)}
              </optgroup>
            ) : (
              optionNode(opt)
            ),
          )}
        </select>
        <span className={styles.chevron}>
          <Icon name="ChevronDown" size={18} />
        </span>
      </div>
    </Field>
  );
}

/** Props for `<SearchField>`. */
export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onSubmit' | 'size' | 'value'> {
  value: string;
  /** Called on every keystroke with the new text. */
  onChange: (value: string) => void;
  /** Called when the person presses Enter. */
  onSubmit?: (value: string) => void;
  /** Accessible name; shown only to screen readers unless `showLabel`. Default "Search". */
  label?: string;
  showLabel?: boolean;
  size?: ControlSize;
  className?: string;
}

/**
 * A search box with a clear button. Filter as the person types; pair with `useDebounced` when the
 * filtering is expensive.
 *   <SearchField value={q} onChange={setQ} placeholder="Search songs, scales, chords" />
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, onSubmit, label = 'Search', showLabel, size = 'md', className, id, disabled, placeholder = 'Search', ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const inner = useRef<HTMLInputElement | null>(null);
  const assign = useCallback(
    (node: HTMLInputElement | null) => {
      inner.current = node;
      setRef(ref, node);
    },
    [ref],
  );
  return (
    <Field label={label} hideLabel={!showLabel} htmlFor={inputId} className={className}>
      <div className={cx(styles.control, size !== 'md' && styles[size], disabled && styles.disabled)} role="search">
        <span className={styles.adorn}>
          <Icon name="Search" size={18} />
        </span>
        <input
          ref={assign}
          id={inputId}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className={styles.input}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit?.(value);
            else if (e.key === 'Escape' && value) {
              e.stopPropagation();
              onChange('');
            }
          }}
          {...rest}
        />
        {value !== '' && !disabled && (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onClick={() => {
              onChange('');
              inner.current?.focus();
            }}
          >
            <Icon name="X" size={16} />
          </button>
        )}
      </div>
    </Field>
  );
});
