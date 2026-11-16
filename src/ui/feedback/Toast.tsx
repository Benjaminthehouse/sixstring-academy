import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, IconButton } from '../actions/Button';
import { renderIcon, type IconSource } from '../icon/Icon';
import { cx } from '../util/cx';
import { openDialogCount, subscribeDialogs, toastTopOverDialog, useDialogOpen } from './overlays';
import { Portal } from './Portal';
import { createToastStore, type ToastItem, type ToastOptions, type ToastStore, type ToastTone } from './toastStore';
import styles from './Toast.module.css';

const store: ToastStore = createToastStore();

// Nothing covers an open dialog: news waits for it to close (see `ToastOptions.news`).
subscribeDialogs(() => store.setHeld(openDialogCount() > 0));
let mountedViewports = 0;
let detach: (() => void) | null = null;

/** If no <ToastProvider> is mounted, hang a viewport on <body> so a toast is never silently lost. */
function ensureViewport(): void {
  if (mountedViewports > 0 || detach || typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.setAttribute('data-ui-host', 'toasts');
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(<ToastViewport />);
  detach = () => {
    root.unmount();
    el.remove();
  };
}

function show(options: ToastOptions | string): string {
  const id = store.show(typeof options === 'string' ? { title: options } : options);
  ensureViewport();
  return id;
}

function toned(tone: ToastTone) {
  return (title: ReactNode, options: Omit<ToastOptions, 'title' | 'tone'> = {}): string => show({ ...options, title, tone });
}

/** The toast API: call it directly, or use the tone shortcuts. */
export interface ToastApi {
  /** Show a toast. Returns its id. */
  (options: ToastOptions | string): string;
  /** Something worked ("Tuning saved"). */
  ok(title: ReactNode, options?: Omit<ToastOptions, 'title' | 'tone'>): string;
  /** Neutral information. */
  info(title: ReactNode, options?: Omit<ToastOptions, 'title' | 'tone'>): string;
  /** Something needs attention but nothing broke. */
  warn(title: ReactNode, options?: Omit<ToastOptions, 'title' | 'tone'>): string;
  /** Something failed. Say what and what to do. */
  error(title: ReactNode, options?: Omit<ToastOptions, 'title' | 'tone'>): string;
  dismiss(id: string): void;
  clear(): void;
}

/**
 * Show a short, self-dismissing message from anywhere (handlers, effects, non-React code).
 *   toast.ok('Tuning saved');
 *   toast({ title: 'Song removed', action: { label: 'Undo', onClick: restore } });
 */
export const toast: ToastApi = Object.assign(show, {
  ok: toned('ok'),
  info: toned('info'),
  warn: toned('warn'),
  error: toned('bad'),
  dismiss: (id: string) => store.dismiss(id),
  clear: () => store.clear(),
});

/** Hook form of `toast`, for symmetry with other hooks. The returned function is stable. */
export function useToast(): ToastApi {
  return toast;
}

const TONE_ICON: Record<ToastTone, IconSource | null> = { neutral: null, ok: 'CircleCheck', info: 'Info', warn: 'TriangleAlert', bad: 'CircleAlert' };

function ToastCard({ item }: { item: ToastItem }) {
  const icon = item.icon ?? TONE_ICON[item.tone];
  const urgent = item.tone === 'bad' || item.tone === 'warn';
  return (
    <li className={cx(styles.toast, styles[`tone-${item.tone}`], item.leaving && styles.leaving)} role={urgent ? 'alert' : 'status'} data-toast={item.id}>
      {icon != null && <span className={styles.icon}>{renderIcon(icon, { size: 20 })}</span>}
      <div className={styles.body}>
        <div className={styles.title}>{item.title}</div>
        {item.description != null && <div className={styles.description}>{item.description}</div>}
      </div>
      <div className={styles.actions}>
        {item.action && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              item.action?.onClick();
              store.dismiss(item.id);
            }}
          >
            {item.action.label}
          </Button>
        )}
        <IconButton icon="X" label="Dismiss" size="sm" noTooltip onClick={() => store.dismiss(item.id)} />
      </div>
    </li>
  );
}

/** The on-screen stack. Mounted by `<ToastProvider>`; you rarely need it directly. */
export function ToastViewport() {
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  // With a dialog open, the replies that still show move to the top edge, clear of a bottom sheet's buttons.
  const overDialog = useDialogOpen();
  const listRef = useRef<HTMLOListElement | null>(null);
  /** Where focus was before the keyboard shortcut moved it into a toast. */
  const returnTo = useRef<HTMLElement | null>(null);
  // A dialog that reaches the top of the screen (a tall sheet, a drawer): the stack goes under its
  // header rather than over its title and Close button.
  const [topOverDialog, setTopOverDialog] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!overDialog) {
      setTopOverDialog(null);
      return undefined;
    }
    const place = () => {
      const list = listRef.current;
      const panels = document.querySelectorAll<HTMLElement>('[data-ui-dialog]');
      const panel = panels[panels.length - 1];
      if (!list || !panel) {
        setTopOverDialog(null);
        return;
      }
      // Layout positions: the panel's opening animation moves it with a transform, which offsetTop ignores.
      const origin = panel.offsetParent?.getBoundingClientRect() ?? { top: 0, left: 0 };
      const top = origin.top + panel.offsetTop;
      const left = origin.left + panel.offsetLeft;
      const header = panel.querySelector<HTMLElement>('[data-ui-dialog-header]');
      const headerBottom = header ? top + header.offsetTop + header.offsetHeight : top;
      const column = list.getBoundingClientRect();
      const edge = parseFloat(getComputedStyle(document.documentElement).fontSize) * (window.innerWidth >= 720 ? 1.5 : 0.75) || 12;
      const next = toastTopOverDialog({ left: column.left, right: column.right, height: list.offsetHeight }, { top, left, right: left + panel.offsetWidth, bottom: top + panel.offsetHeight }, headerBottom, edge, 8);
      setTopOverDialog((previous) => (previous === next ? previous : next));
    };
    place();
    window.addEventListener('resize', place);
    const off = subscribeDialogs(place);
    return () => {
      window.removeEventListener('resize', place);
      off();
    };
  }, [overDialog, items]);

  // A toast leaves after a few seconds and sits at the very end of the tab order, so its action
  // ("Undo") would be out of reach of the keyboard. Alt+T moves focus to the newest toast, which
  // also stops the countdowns; Escape there dismisses it; focus then goes back where it was.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const list = listRef.current;
      if (!list) return;
      const inside = list.contains(document.activeElement);
      // `code`, not `key`: Alt+T types a dagger on a Mac keyboard.
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyT') {
        const newest = list.lastElementChild;
        const target = newest?.querySelector<HTMLElement>('button');
        if (!target) return;
        event.preventDefault();
        if (!inside && document.activeElement instanceof HTMLElement) returnTo.current = document.activeElement;
        target.focus();
        return;
      }
      if (event.key === 'Escape' && inside) {
        const id = (document.activeElement as HTMLElement).closest('[data-toast]')?.getAttribute('data-toast');
        if (!id) return;
        // Handled here: a dialog underneath must not close on the same key press.
        event.preventDefault();
        event.stopPropagation();
        store.dismiss(id);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // A toast removed from under the pointer (or while its button has focus) fires no pointerleave or
  // blur, which would leave the countdowns paused for good. Re-check whenever the stack changes.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let hovered = false;
    try {
      hovered = el.matches(':hover');
    } catch {
      /* no :hover support in this environment */
    }
    const focusInside = el.contains(document.activeElement);
    if (!hovered && !focusInside) store.resume();
    // The toast that held focus is gone (dismissed, acted on): hand focus back rather than drop it on <body>.
    const back = returnTo.current;
    if (back && !focusInside) {
      returnTo.current = null;
      if ((document.activeElement === document.body || document.activeElement === null) && back.isConnected) back.focus({ preventScroll: true });
    }
  }, [items]);

  return (
    <Portal>
      <ol
        ref={listRef}
        className={cx(styles.viewport, overDialog && styles.overDialog)}
        data-over-dialog={overDialog ? '' : undefined}
        style={overDialog && topOverDialog !== null ? { top: topOverDialog } : undefined}
        aria-label="Notifications"
        aria-keyshortcuts="Alt+T"
        aria-live="polite"
        aria-relevant="additions text"
        onPointerEnter={() => store.pause()}
        onPointerLeave={() => store.resume()}
        onFocus={() => store.pause()}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) store.resume();
        }}
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} />
        ))}
      </ol>
    </Portal>
  );
}

/**
 * Mount once near the root of the app so toasts render inside the app's React tree.
 * (Without it, the first `toast()` call mounts a fallback viewport by itself.)
 */
export function ToastProvider({ children }: { children?: ReactNode }) {
  useEffect(() => {
    mountedViewports += 1;
    // A provider takes over from the fallback viewport if one was created earlier.
    const fallback = detach;
    detach = null;
    if (fallback) queueMicrotask(fallback);
    return () => {
      mountedViewports -= 1;
    };
  }, []);
  return (
    <>
      {children}
      <ToastViewport />
    </>
  );
}
