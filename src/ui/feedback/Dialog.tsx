import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { IconButton } from '../actions/Button';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import { useLatest } from '../hooks/useLatest';
import { cx } from '../util/cx';
import { registerBackClose } from './dialogHistory';
import { registerDialog } from './overlays';
import { Portal } from './Portal';
import styles from './Dialog.module.css';

const EXIT_MS = 170;
/** Open dialogs, innermost last, so only the top one reacts to Escape. */
const stack: symbol[] = [];

interface DialogCommonProps {
  open: boolean;
  /** Called when the person asks to close (Escape, backdrop, close button, swipe down). Set `open` to false in it. */
  onClose: () => void;
  /** Dialog title (always required: it names the dialog for screen readers). */
  title: ReactNode;
  /** Keep the title for screen readers only. */
  hideTitle?: boolean;
  /** A sentence under the title. */
  description?: ReactNode;
  /** Buttons pinned to the bottom edge. Put the primary action last. */
  footer?: ReactNode;
  /** Max width: sm 24rem, md 32rem (default), lg 48rem, full 72rem and full height. */
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** Allow Escape / backdrop / close button. Turn off only while a required step is in flight. Default true. */
  dismissable?: boolean;
  /** Remove the body padding (lists, media that should touch the edges). */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}

interface DialogProps extends DialogCommonProps {
  layout: 'modal' | 'sheet' | 'drawer';
  phone: 'sheet' | 'center' | 'full';
}

function Dialog({ open, onClose, title, hideTitle, description, footer, size = 'md', dismissable = true, flush, className, children, layout, phone }: DialogProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useLatest(onClose);
  const dismissableRef = useLatest(dismissable);

  // Stay mounted through the exit animation.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const id = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(id);
  }, [open, mounted]);

  const active = mounted && !closing;
  useScrollLock(mounted);
  useFocusTrap(panelRef, active);

  // Toasts treat the screen as covered until the exit animation is over.
  useEffect(() => (mounted ? registerDialog() : undefined), [mounted]);

  // The phone's Back gesture closes the dialog rather than the screen behind it.
  useEffect(() => {
    if (!active) return undefined;
    return registerBackClose(() => {
      if (!dismissableRef.current) return false;
      onCloseRef.current();
      return true;
    });
  }, [active, dismissableRef, onCloseRef]);

  useEffect(() => {
    if (!active) return;
    const token = Symbol('dialog');
    stack.push(token);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (stack[stack.length - 1] !== token) return;
      event.preventDefault();
      if (dismissableRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = stack.indexOf(token);
      if (at >= 0) stack.splice(at, 1);
    };
  }, [active, dismissableRef, onCloseRef]);

  // Swipe the sheet down by its grip or header to dismiss (phones). Moves the panel directly: no state per frame.
  const drag = useRef<{ startY: number; lastY: number; lastT: number; velocity: number } | null>(null);
  const swipeable = dismissable && (layout === 'sheet' || phone === 'sheet');
  const onDragStart = (event: ReactPointerEvent) => {
    if (!swipeable || event.pointerType === 'mouse') return;
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    drag.current = { startY: event.clientY, lastY: event.clientY, lastT: event.timeStamp, velocity: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDragMove = (event: ReactPointerEvent) => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || !panel) return;
    const dy = Math.max(0, event.clientY - d.startY);
    const dt = Math.max(1, event.timeStamp - d.lastT);
    d.velocity = (event.clientY - d.lastY) / dt;
    d.lastY = event.clientY;
    d.lastT = event.timeStamp;
    panel.style.transform = `translateY(${dy}px)`;
    panel.style.transition = 'none';
  };
  const onDragEnd = (event: ReactPointerEvent) => {
    const d = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!d || !panel) return;
    const dy = Math.max(0, event.clientY - d.startY);
    const shouldClose = dy > Math.min(160, panel.offsetHeight * 0.35) || d.velocity > 0.6;
    panel.style.transition = 'transform 200ms var(--ease)';
    panel.style.transform = shouldClose ? 'translateY(100%)' : '';
    if (shouldClose) onCloseRef.current();
    else setTimeout(() => (panel.style.transition = ''), 220);
  };
  const dragHandlers = swipeable ? { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd } : {};

  if (!mounted) return null;

  return (
    <Portal>
      <div
        className={cx(styles.backdrop, layout === 'drawer' && styles.drawer, (layout === 'sheet' || layout === 'drawer' || phone === 'sheet') && styles.sheet, phone === 'full' && layout === 'modal' && styles.phoneFull, closing && styles.closing)}
        onPointerDown={(e) => {
          pressedBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          // Only a press that both starts and ends on the backdrop closes (not a text selection dragged out of the panel).
          if (e.target === e.currentTarget && pressedBackdrop.current && dismissable) onClose();
          pressedBackdrop.current = false;
        }}
      >
        <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description != null ? descId : undefined} tabIndex={-1} className={cx(styles.panel, styles[`size-${size}`], className)} data-ui-dialog="">
          <div className={styles.grip} aria-hidden="true" {...dragHandlers} />
          <div className={cx(styles.header, !dismissable && styles.noClose, hideTitle && description == null && !dismissable && 'sr-only')} data-ui-dialog-header="" {...dragHandlers}>
            <div className={styles.titles}>
              <h2 id={titleId} className={cx(styles.title, hideTitle && 'sr-only')}>
                {title}
              </h2>
              {description != null && (
                <p id={descId} className={styles.description}>
                  {description}
                </p>
              )}
            </div>
            {dismissable && <IconButton icon="X" label="Close" noTooltip className={styles.close} onClick={onClose} />}
          </div>
          {children != null && children !== false ? <div className={cx(styles.body, flush && styles.bodyFlush)}>{children}</div> : <div className={styles.noBody} />}
          {footer != null && <div className={styles.footer}>{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

/** Props for `<Modal>`. */
export interface ModalProps extends DialogCommonProps {
  /** How the modal presents on phones: a bottom sheet (default), a centred card, or full screen. */
  phone?: 'sheet' | 'center' | 'full';
}

/**
 * A dialog that takes over the screen for one focused task. Traps focus, closes on Escape, locks
 * page scroll and returns focus to whatever opened it. Mark the best first control with `data-autofocus`.
 *   <Modal open={open} onClose={() => setOpen(false)} title="Rename song" footer={<Button variant="primary">Save</Button>}>…</Modal>
 */
export function Modal({ phone = 'sheet', ...rest }: ModalProps) {
  return <Dialog layout="modal" phone={phone} {...rest} />;
}

/** Props for `<Sheet>`. */
export interface SheetProps extends DialogCommonProps {
  /** On wide screens: a centred modal (default) or a right-hand drawer. */
  desktop?: 'modal' | 'drawer';
}

/**
 * A panel for secondary choices (filters, settings for the current tool). Slides up from the bottom
 * edge on phones, where it can be swiped down; on wide screens it is a modal or a right-hand drawer.
 *   <Sheet open={open} onClose={close} title="Display options" desktop="drawer">…</Sheet>
 */
export function Sheet({ desktop = 'modal', ...rest }: SheetProps) {
  return <Dialog layout={desktop === 'drawer' ? 'drawer' : 'sheet'} phone="sheet" {...rest} />;
}
