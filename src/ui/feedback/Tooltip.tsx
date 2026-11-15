import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import { placeFloating, type Placement } from '../util/floating';
import { cx } from '../util/cx';
import { Portal } from './Portal';
import styles from './Tooltip.module.css';

/** Assign a value to a callback ref or ref object. */
export function setRef<T>(ref: Ref<T> | undefined | null, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

type AnchorProps = {
  ref?: Ref<HTMLElement>;
  'aria-describedby'?: string;
  onPointerEnter?: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
};

/** Props for `<Tooltip>`. */
export interface TooltipProps {
  /** Short plain text. Leave empty to render the child untouched. */
  content: ReactNode;
  /** Preferred side. Flips when there is no room. Default "top". */
  placement?: Placement;
  /** Hover delay in ms. Default 350. Keyboard focus shows it at once. */
  delay?: number;
  disabled?: boolean;
  /** One element that forwards its ref and spreads DOM props (every kit button does). */
  children: ReactElement;
}

/**
 * A hint on hover or keyboard focus. Supplementary only: phones never see it, so anything a person
 * needs to know must also be on screen. It describes its child via `aria-describedby`.
 */
export function Tooltip({ content, placement = 'top', delay = 350, disabled, children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const hide = useCallback(() => {
    clear();
    setOpen(false);
    setPos(null);
  }, [clear]);
  const show = useCallback(
    (wait: number) => {
      clear();
      if (wait <= 0) setOpen(true);
      else timer.current = setTimeout(() => setOpen(true), wait);
    },
    [clear],
  );
  useEffect(() => clear, [clear]);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    const next = placeFloating({ left: a.left, top: a.top, width: a.width, height: a.height }, { width: tip.offsetWidth, height: tip.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, { placement, offset: 6 });
    setPos((prev) => (prev && prev.left === next.left && prev.top === next.top ? prev : { left: next.left, top: next.top }));
  }, [placement]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, content]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    // Follow the anchor while the page scrolls (keyboard focus often scrolls it into view first).
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, hide, place]);

  const active = !disabled && content != null && content !== '' && content !== false;
  const child = children as ReactElement<AnchorProps> & { ref?: Ref<HTMLElement> };
  const childProps = child.props;
  const anchor = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      setRef(child.ref, node);
    },
    'aria-describedby': active && open ? cx(childProps['aria-describedby'], id) : childProps['aria-describedby'],
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
      childProps.onPointerEnter?.(e);
      if (active && e.pointerType === 'mouse') show(delay);
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      childProps.onPointerLeave?.(e);
      hide();
    },
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      childProps.onPointerDown?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(e);
      let keyboard = true;
      try {
        keyboard = e.currentTarget.matches(':focus-visible');
      } catch {
        /* older engines: treat as keyboard focus */
      }
      if (active && keyboard) show(0);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {anchor}
      {active && open && (
        <Portal>
          <div ref={tipRef} id={id} role="tooltip" className={cx(styles.tooltip, !pos && styles.measuring)} style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0 }}>
            {content}
          </div>
        </Portal>
      )}
    </>
  );
}
