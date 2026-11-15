import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, IconButton } from '../actions/Button';
import { renderIcon, type IconSource } from '../icon/Icon';
import { cx } from '../util/cx';
import { Portal } from './Portal';
import { createToastStore, type ToastItem, type ToastOptions, type ToastStore, type ToastTone } from './toastStore';
import styles from './Toast.module.css';

const store: ToastStore = createToastStore();
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
  return (
    <Portal>
      <ol
        className={styles.viewport}
        aria-label="Notifications"
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
