import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { useControllableState } from '../hooks/useControllableState';
import { useDismiss } from '../hooks/useDismiss';
import { getTabbables, initialFocusTarget } from '../hooks/focus';
import { renderIcon, Icon, type IconSource } from '../icon/Icon';
import { cx } from '../util/cx';
import { placeFloating, type Align, type Placement } from '../util/floating';
import { rovingIndex, typeaheadIndex } from '../util/roving';
import { isExternalHref, resolveHref, type LinkTarget } from '../util/links';
import { Portal } from './Portal';
import { setRef } from './Tooltip';
import styles from './Popover.module.css';

type TriggerProps = {
  ref?: Ref<HTMLElement>;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: 'dialog' | 'menu';
  'aria-controls'?: string;
};

interface FloatingState {
  open: boolean;
  setOpen: (open: boolean) => void;
  anchorRef: React.MutableRefObject<HTMLElement | null>;
  panelRef: React.MutableRefObject<HTMLDivElement | null>;
  pos: { left: number; top: number } | null;
}

/** Shared open/close + positioning for Popover and Menu. */
function useFloating(openProp: boolean | undefined, onOpenChange: ((open: boolean) => void) | undefined, placement: Placement, align: Align): FloatingState {
  const [open, setOpen] = useControllableState<boolean>(openProp, false, onOpenChange);
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    const next = placeFloating({ left: a.left, top: a.top, width: a.width, height: a.height }, { width: panel.offsetWidth, height: panel.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, { placement, align, offset: 6 });
    setPos((prev) => (prev && prev.left === next.left && prev.top === next.top ? prev : { left: next.left, top: next.top }));
  }, [placement, align]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update]);

  useDismiss([anchorRef, panelRef], open, () => {
    setOpen(false);
    anchorRef.current?.focus({ preventScroll: true });
  });

  return { open, setOpen, anchorRef, panelRef, pos };
}

/** Props for `<Popover>`. */
export interface PopoverProps {
  /** The element that opens the popover: one element that forwards its ref (a kit Button or IconButton). */
  trigger: ReactElement;
  /** Names the panel for screen readers. */
  'aria-label': string;
  placement?: Placement;
  align?: Align;
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Remove the default padding. */
  flush?: boolean;
  className?: string;
  /** Content, or a function that receives `close`. */
  children: ReactNode | ((api: { close: () => void }) => ReactNode);
}

/**
 * A small floating panel anchored to a button, for a few related controls. Closes on Escape or a
 * press outside, and gives focus back to the trigger. Use a Sheet when there is a lot to show.
 *   <Popover aria-label="Display options" trigger={<Button iconLeft="SlidersHorizontal">Display</Button>}>…</Popover>
 */
export function Popover({ trigger, placement = 'bottom', align = 'start', open: openProp, onOpenChange, flush, className, children, ...rest }: PopoverProps) {
  const id = useId();
  const { open, setOpen, anchorRef, panelRef, pos } = useFloating(openProp, onOpenChange, placement, align);
  const close = useCallback(() => {
    setOpen(false);
    anchorRef.current?.focus({ preventScroll: true });
  }, [setOpen, anchorRef]);

  // Move focus into the panel once it is placed.
  const placed = pos !== null;
  useEffect(() => {
    if (open && placed && panelRef.current && !panelRef.current.contains(document.activeElement)) {
      initialFocusTarget(panelRef.current).focus({ preventScroll: true });
    }
  }, [open, placed, panelRef]);

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    // Tabbing past either end closes the popover and returns to the trigger, keeping the page's tab order intact.
    const tabbables = getTabbables(panelRef.current);
    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];
    const activeEl = document.activeElement;
    if (tabbables.length === 0 || (event.shiftKey && (activeEl === first || activeEl === panelRef.current)) || (!event.shiftKey && activeEl === last)) {
      event.preventDefault();
      close();
    }
  };

  const child = trigger as ReactElement<TriggerProps> & { ref?: Ref<HTMLElement> };
  const anchor = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      setRef(child.ref, node);
    },
    'aria-expanded': open,
    'aria-haspopup': 'dialog',
    'aria-controls': open ? id : undefined,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      child.props.onClick?.(e);
      setOpen(!open);
    },
  });

  return (
    <>
      {anchor}
      {open && (
        <Portal>
          <div ref={panelRef} id={id} role="dialog" aria-label={rest['aria-label']} tabIndex={-1} data-ui-layer="popover" className={cx(styles.panel, !flush && styles.padded, !pos && styles.measuring, className)} style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0 }} onKeyDown={onPanelKeyDown}>
            {typeof children === 'function' ? children({ close }) : children}
          </div>
        </Portal>
      )}
    </>
  );
}

/** One row in a `<Menu>`. */
export interface MenuItem extends LinkTarget {
  /** Stable key. Defaults to the label. */
  id?: string;
  label: string;
  icon?: IconSource;
  /** Called when the item is chosen. The menu closes afterwards. */
  onSelect?: () => void;
  /** Paint the row red (destructive actions go last). */
  danger?: boolean;
  disabled?: boolean;
  /** Makes the row a checkable option and shows a tick when true. */
  checked?: boolean;
  /** Muted trailing text: a shortcut or a current value. */
  hint?: string;
}

/** A row, a divider, or a small group heading. */
export type MenuEntry = MenuItem | 'separator' | { heading: string };

/** Props for `<Menu>`. */
export interface MenuProps {
  /** The element that opens the menu: one element that forwards its ref (a kit Button or IconButton). */
  trigger: ReactElement;
  items: MenuEntry[];
  /** Names the menu for screen readers. Default: the trigger's own name. */
  'aria-label'?: string;
  placement?: Placement;
  align?: Align;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const isItem = (entry: MenuEntry): entry is MenuItem => typeof entry === 'object' && 'label' in entry;

/**
 * A list of actions behind a button ("more" menus, sort orders). Arrow keys move, typing jumps to a
 * matching item, Enter chooses, Escape closes.
 *   <Menu trigger={<IconButton icon="EllipsisVertical" label="More" />} items={[
 *     { label: 'Rename', icon: 'Pencil', onSelect: rename }, 'separator',
 *     { label: 'Delete', icon: 'Trash2', danger: true, onSelect: remove }]} />
 */
export function Menu({ trigger, items, placement = 'bottom', align = 'end', open: openProp, onOpenChange, className, ...rest }: MenuProps) {
  const id = useId();
  const { open, setOpen, anchorRef, panelRef, pos } = useFloating(openProp, onOpenChange, placement, align);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const focusOnOpen = useRef<'first' | 'last'>('first');
  const typed = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  const rows = items.filter(isItem);
  const isDisabled = (i: number) => !!rows[i]?.disabled;

  const close = useCallback(
    (refocus = true) => {
      setOpen(false);
      if (refocus) anchorRef.current?.focus({ preventScroll: true });
    },
    [setOpen, anchorRef],
  );

  const placed = pos !== null;
  useEffect(() => {
    if (!open || !placed) return;
    const index = rovingIndex(-1, rows.length, focusOnOpen.current, isDisabled);
    (itemRefs.current[index] ?? panelRef.current)?.focus({ preventScroll: true });
    // Focus once per opening; `rows` identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placed]);

  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    close();
    item.onSelect?.();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = rovingIndex(current, rows.length, 'next', isDisabled);
    else if (event.key === 'ArrowUp') next = rovingIndex(current, rows.length, 'prev', isDisabled);
    else if (event.key === 'Home') next = rovingIndex(current, rows.length, 'first', isDisabled);
    else if (event.key === 'End') next = rovingIndex(current, rows.length, 'last', isDisabled);
    else if (event.key === 'Tab') {
      event.preventDefault();
      close();
      return;
    } else if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at > 600 ? event.key : typed.current.text + event.key, at: now };
      next = typeaheadIndex(
        rows.map((r) => r.label),
        typed.current.text,
        typed.current.text.length > 1 ? current - 1 : current,
        isDisabled,
      );
      if (next < 0) return;
    } else return;
    event.preventDefault();
    itemRefs.current[next]?.focus();
  };

  const child = trigger as ReactElement<TriggerProps> & { ref?: Ref<HTMLElement> };
  const anchor = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      setRef(child.ref, node);
    },
    'aria-expanded': open,
    'aria-haspopup': 'menu',
    'aria-controls': open ? id : undefined,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      child.props.onClick?.(e);
      focusOnOpen.current = 'first';
      setOpen(!open);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      child.props.onKeyDown?.(e);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        focusOnOpen.current = e.key === 'ArrowUp' ? 'last' : 'first';
        setOpen(true);
      }
    },
  });

  let rowIndex = -1;
  return (
    <>
      {anchor}
      {open && (
        <Portal>
          <div ref={panelRef} id={id} role="menu" aria-label={rest['aria-label']} tabIndex={-1} data-ui-layer="menu" className={cx(styles.panel, styles.menu, !pos && styles.measuring, className)} style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0 }} onKeyDown={onMenuKeyDown}>
            {items.map((entry, i) => {
              if (entry === 'separator') return <div key={`sep-${i}`} role="separator" className={styles.separator} />;
              if (!isItem(entry)) {
                return (
                  <div key={`h-${entry.heading}`} role="presentation" className={styles.heading}>
                    {entry.heading}
                  </div>
                );
              }
              rowIndex += 1;
              const index = rowIndex;
              const url = resolveHref(entry);
              const checkable = entry.checked !== undefined;
              const shared = {
                ref: (el: HTMLElement | null) => {
                  itemRefs.current[index] = el;
                },
                role: checkable ? 'menuitemcheckbox' : 'menuitem',
                'aria-checked': checkable ? entry.checked : undefined,
                'aria-disabled': entry.disabled || undefined,
                tabIndex: -1,
                className: cx(styles.item, entry.danger && styles.danger),
              } as const;
              const inner = (
                <>
                  {checkable && <span className={styles.itemCheck}>{entry.checked && <Icon name="Check" size={18} strokeWidth={2.25} />}</span>}
                  {entry.icon != null && <span className={styles.itemIcon}>{renderIcon(entry.icon, { size: 18 })}</span>}
                  <span className={styles.itemLabel}>{entry.label}</span>
                  {entry.hint != null && <span className={styles.itemHint}>{entry.hint}</span>}
                </>
              );
              return url && !entry.disabled ? (
                <a key={entry.id ?? entry.label} {...shared} href={url} target={isExternalHref(url) ? '_blank' : undefined} rel={isExternalHref(url) ? 'noopener noreferrer' : undefined} onClick={() => choose(entry)}>
                  {inner}
                </a>
              ) : (
                <button key={entry.id ?? entry.label} {...shared} type="button" onClick={() => choose(entry)}>
                  {inner}
                </button>
              );
            })}
          </div>
        </Portal>
      )}
    </>
  );
}
