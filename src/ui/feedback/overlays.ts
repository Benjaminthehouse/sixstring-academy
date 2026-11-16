/**
 * Which kit dialogs (Modal, Sheet, confirmDialog) are on screen. The toast stack reads it: while a
 * dialog is open, toasts that are news wait for it to close and the others move to the top edge,
 * so nothing covers a sheet's summary or its buttons.
 */
import { useSyncExternalStore } from 'react';

let open = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/** Count a dialog as open until the returned function is called. */
export function registerDialog(): () => void {
  open += 1;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    open = Math.max(0, open - 1);
    emit();
  };
}

/** How many kit dialogs are open right now. */
export function openDialogCount(): number {
  return open;
}

/** Be told whenever a dialog opens or closes. */
export function subscribeDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while any kit Modal or Sheet is open. */
export function useDialogOpen(): boolean {
  return useSyncExternalStore(subscribeDialogs, () => open > 0, () => false);
}
