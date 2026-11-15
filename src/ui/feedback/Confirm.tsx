import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../actions/Button';
import { Modal } from './Dialog';

/** Props for `<ConfirmDialog>`. */
export interface ConfirmDialogProps {
  open: boolean;
  /** The question, as a plain sentence: "Delete this recording?" */
  title: ReactNode;
  /** What will happen and whether it can be undone. */
  description?: ReactNode;
  /** Label of the confirming button. Say the action: "Delete recording". Default "Confirm". */
  confirmLabel?: string;
  /** Default "Cancel". */
  cancelLabel?: string;
  /** "danger" paints the confirm button red (destructive actions). */
  tone?: 'default' | 'danger';
  /** Shows a spinner on the confirm button and blocks closing. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

/**
 * Ask before doing something that cannot be undone. Never use `window.confirm`.
 * Focus starts on Cancel for dangerous actions, so Enter never destroys by accident.
 */
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', busy, onConfirm, onCancel, children }: ConfirmDialogProps) {
  const danger = tone === 'danger';
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      phone="center"
      dismissable={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy} {...(danger ? { 'data-autofocus': true } : {})}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} {...(danger ? {} : { 'data-autofocus': true })}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/** Options for the imperative `confirmDialog()`. */
export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

interface Pending extends ConfirmOptions {
  key: number;
  open: boolean;
  resolve: (ok: boolean) => void;
}

let queue: Pending[] = [];
let nextKey = 1;
const listeners = new Set<() => void>();
let hosts = 0;
let detach: (() => void) | null = null;

function emit() {
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => queue;

function ensureHost(): void {
  if (hosts > 0 || detach || typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.setAttribute('data-ui-host', 'confirm');
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(<ConfirmHostView />);
  detach = () => {
    root.unmount();
    el.remove();
  };
}

/**
 * Ask a yes/no question and await the answer: the replacement for `window.confirm`.
 *   if (await confirmDialog({ title: 'Delete this song?', description: 'This cannot be undone.', confirmLabel: 'Delete song', tone: 'danger' })) remove();
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    queue = [...queue, { ...options, key: nextKey++, open: true, resolve }];
    emit();
    ensureHost();
  });
}

/** Hook form of `confirmDialog`, for symmetry with `useToast`. The returned function is stable. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  return confirmDialog;
}

function settle(key: number, ok: boolean) {
  const item = queue.find((q) => q.key === key);
  if (!item || !item.open) return;
  item.resolve(ok);
  // Close first (so the exit animation plays), then drop it and reveal the next question.
  queue = queue.map((q) => (q.key === key ? { ...q, open: false } : q));
  emit();
  setTimeout(() => {
    queue = queue.filter((q) => q.key !== key);
    emit();
  }, 200);
}

function ConfirmHostView() {
  const items = useSyncExternalStore(subscribe, snapshot, snapshot);
  const current = items[0];
  if (!current) return null;
  return (
    <ConfirmDialog
      key={current.key}
      open={current.open}
      title={current.title}
      description={current.description}
      confirmLabel={current.confirmLabel}
      cancelLabel={current.cancelLabel}
      tone={current.tone}
      onConfirm={() => settle(current.key, true)}
      onCancel={() => settle(current.key, false)}
    />
  );
}

/**
 * Renders the dialogs requested through `confirmDialog()`. Mount once near the app root (it is part
 * of `<UIProvider>`); without it the first call mounts a fallback host by itself.
 */
export function ConfirmHost() {
  useEffect(() => {
    hosts += 1;
    const fallback = detach;
    detach = null;
    if (fallback) queueMicrotask(fallback);
    return () => {
      hosts -= 1;
    };
  }, []);
  return <ConfirmHostView />;
}
