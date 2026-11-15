import { forwardRef, useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, renderIcon, type IconSource } from '../icon/Icon';
import { cx } from '../util/cx';
import { rovingIndex, rovingKeyFor } from '../util/roving';
import styles from './Chip.module.css';

/** Props for `<Chip>`. */
export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected look plus a check mark (state is never colour alone). */
  selected?: boolean;
  icon?: IconSource;
  /** Small trailing number (how many items the filter matches). */
  count?: number;
  children?: ReactNode;
}

/**
 * A pill-shaped toggle, mostly used through `<ChipGroup>` for filters. On its own it is a toggle
 * button: pass `selected` and `onClick`.
 */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip({ selected, icon, count, className, children, type = 'button', role, ...rest }, ref) {
  const isRadio = role === 'radio';
  return (
    <button ref={ref} type={type} role={role} className={cx(styles.chip, selected && styles.selected, className)} {...(isRadio ? { 'aria-checked': !!selected } : { 'aria-pressed': selected ?? undefined })} {...rest}>
      {selected ? (
        <span className={styles.check}>
          <Icon name="Check" size={14} strokeWidth={2.5} />
        </span>
      ) : (
        icon != null && renderIcon(icon, { size: 16 })
      )}
      {children}
      {count != null && <span className={styles.count}>{count}</span>}
    </button>
  );
});

/** One chip in a `<ChipGroup>`. */
export interface ChipOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: IconSource;
  count?: number;
  disabled?: boolean;
}

interface ChipGroupBase<T extends string> {
  options: Array<ChipOption<T> | T>;
  /** Names the group for screen readers ("Filter by difficulty"). */
  'aria-label': string;
  /**
   * Overflow: "auto" (default) wraps on wide screens and becomes one swipeable row on phones;
   * "always" is one swipeable row everywhere; "never" always wraps.
   */
  scroll?: 'auto' | 'always' | 'never';
  /** On phones, let the swipeable row run to the screen edges (when the group sits directly in a Page). */
  bleed?: boolean;
  className?: string;
}

/** Props for `<ChipGroup>`: single choice by default, several with `multiple`. */
export type ChipGroupProps<T extends string = string> = ChipGroupBase<T> &
  (
    | { multiple?: false; value: T | null; onChange: (value: T) => void }
    | { multiple: true; value: T[]; onChange: (value: T[]) => void }
  );

/**
 * Filter chips. Single choice behaves as a radio group (arrow keys); `multiple` is a set of toggles.
 *   <ChipGroup aria-label="Level" options={['All', 'Beginner', 'Intermediate', 'Expert']} value={level} onChange={setLevel} />
 *   <ChipGroup multiple aria-label="Styles" options={styles} value={picked} onChange={setPicked} />
 */
export function ChipGroup<T extends string = string>(props: ChipGroupProps<T>) {
  const { options, scroll = 'auto', bleed, className } = props;
  const items: ChipOption<T>[] = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const groupRef = useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });

  const measure = useCallback(() => {
    const el = groupRef.current;
    if (!el) return;
    const scrollable = el.scrollWidth - el.clientWidth > 2;
    const start = scrollable && el.scrollLeft > 4;
    const end = scrollable && el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
    setFade((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    measure();
    const el = groupRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, items.length]);

  const isSelected = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
  const toggle = (v: T) => {
    if (props.multiple) props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    else if (props.value !== v) props.onChange(v);
  };

  const single = !props.multiple;
  const selectedIndex = single ? items.findIndex((o) => o.value === props.value) : -1;
  const tabStop = selectedIndex >= 0 && !items[selectedIndex].disabled ? selectedIndex : items.findIndex((o) => !o.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!single) return;
    const move = rovingKeyFor(event.key, 'both');
    if (!move) return;
    event.preventDefault();
    const from = refs.current.findIndex((el) => el === document.activeElement);
    const next = rovingIndex(from >= 0 ? from : tabStop, items.length, move, (i) => !!items[i].disabled);
    if (next < 0) return;
    refs.current[next]?.focus();
    refs.current[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    toggle(items[next].value);
  };

  return (
    <div
      ref={groupRef}
      role={single ? 'radiogroup' : 'group'}
      aria-label={props['aria-label']}
      className={cx(styles.group, scroll === 'always' && styles.scroll, scroll === 'auto' && styles.scrollAuto, bleed && scroll !== 'never' && styles.bleed, fade.start && styles.fadeStart, fade.end && styles.fadeEnd, className)}
      onKeyDown={onKeyDown}
      onScroll={measure}
    >
      {items.map((item, i) => (
        <Chip
          key={item.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role={single ? 'radio' : undefined}
          tabIndex={single ? (i === tabStop ? 0 : -1) : undefined}
          selected={isSelected(item.value)}
          icon={item.icon}
          count={item.count}
          disabled={item.disabled}
          onClick={() => toggle(item.value)}
        >
          {item.label}
        </Chip>
      ))}
    </div>
  );
}
