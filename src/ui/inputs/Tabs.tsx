import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { renderIcon, type IconSource } from '../icon/Icon';
import { useControllableState } from '../hooks/useControllableState';
import { cx } from '../util/cx';
import { rovingIndex, rovingKeyFor } from '../util/roving';
import styles from './Choice.module.css';

/** One tab of a `<Tabs>`. */
export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  icon?: IconSource;
  /** Small trailing node, usually a `<Badge>` with a count. */
  badge?: ReactNode;
  disabled?: boolean;
  /** The panel for this tab. Leave every `content` out to render only the tab strip and switch on `value` yourself. */
  content?: ReactNode;
}

/** Props for `<Tabs>`. */
export interface TabsProps<T extends string = string> {
  items: Array<TabItem<T>>;
  /** Controlled selected tab id. */
  value?: T;
  /** Initial tab when uncontrolled. Default: the first enabled tab. */
  defaultValue?: T;
  onChange?: (id: T) => void;
  /** Names the tab list for screen readers ("Scale views"). */
  'aria-label': string;
  /** underline (default, for page-level views) or pills (compact, inside a card). */
  variant?: 'underline' | 'pills';
  /** Tabs share the full width equally. */
  fitted?: boolean;
  /** Keep hidden panels mounted (preserves their state; costs render time). Default false. */
  keepMounted?: boolean;
  className?: string;
  panelClassName?: string;
}

/**
 * Tabs with their panels. Arrow keys move between tabs (roving tabindex), Home/End jump, and the
 * selection follows focus. The strip scrolls sideways on phones when it does not fit.
 *   <Tabs aria-label="Scale views" items={[{ id: 'neck', label: 'Neck', content: <Neck/> }, { id: 'staff', label: 'Staff', content: <Staff/> }]} />
 */
export function Tabs<T extends string = string>({ items, value, defaultValue, onChange, variant = 'underline', fitted, keepMounted, className, panelClassName, ...rest }: TabsProps<T>) {
  const baseId = useId();
  const firstEnabled = items.find((t) => !t.disabled)?.id ?? items[0]?.id;
  const [current, setCurrent] = useControllableState<T>(value, (defaultValue ?? firstEnabled) as T, onChange);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selected = Math.max(
    0,
    items.findIndex((t) => t.id === current),
  );
  const hasPanels = items.some((t) => t.content !== undefined);
  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  // Keep the selected tab in view when the strip scrolls.
  useEffect(() => {
    const el = refs.current[selected];
    const list = listRef.current;
    if (!el || !list || list.scrollWidth <= list.clientWidth) return;
    const left = el.offsetLeft - 24;
    const right = el.offsetLeft + el.offsetWidth + 24;
    if (left < list.scrollLeft) list.scrollTo({ left, behavior: 'smooth' });
    else if (right > list.scrollLeft + list.clientWidth) list.scrollTo({ left: right - list.clientWidth, behavior: 'smooth' });
  }, [selected]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = rovingKeyFor(event.key, 'horizontal');
    if (!move) return;
    event.preventDefault();
    const from = refs.current.findIndex((el) => el === document.activeElement);
    const next = rovingIndex(from >= 0 ? from : selected, items.length, move, (i) => !!items[i].disabled);
    if (next < 0) return;
    refs.current[next]?.focus();
    setCurrent(items[next].id);
  };

  return (
    <div className={cx(styles.tabs, variant === 'pills' && styles.pills, fitted && styles.fitted, className)}>
      <div ref={listRef} role="tablist" aria-label={rest['aria-label']} className={styles.tablist} onKeyDown={onKeyDown}>
        {items.map((tab, i) => {
          const isSelected = i === selected;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={isSelected}
              aria-controls={hasPanels ? panelId(tab.id) : undefined}
              tabIndex={isSelected ? 0 : -1}
              disabled={tab.disabled}
              className={cx(styles.tab, isSelected && styles.tabSelected)}
              onClick={() => setCurrent(tab.id)}
            >
              {tab.icon != null && renderIcon(tab.icon, { size: 18 })}
              {tab.label}
              {tab.badge != null && <span className={styles.tabBadge}>{tab.badge}</span>}
            </button>
          );
        })}
      </div>
      {hasPanels &&
        items.map((tab, i) => {
          const isSelected = i === selected;
          if (!isSelected && !keepMounted) return null;
          return (
            <div key={tab.id} role="tabpanel" id={panelId(tab.id)} aria-labelledby={tabId(tab.id)} hidden={!isSelected} tabIndex={0} className={cx(styles.panel, panelClassName)}>
              {tab.content}
            </div>
          );
        })}
    </div>
  );
}
