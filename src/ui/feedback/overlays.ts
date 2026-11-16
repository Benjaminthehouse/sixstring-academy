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

/** Where a box sits on screen, in px from the top left of the viewport. */
export interface ScreenBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Where the toast stack goes over an open dialog: its `top`, or its distance from the right edge. */
export interface ToastSpot {
  top?: number;
  right?: number;
}

/**
 * Where the toast stack goes while a dialog is open, or null for its usual spot at the top edge.
 * That spot is right when the stack fits above the dialog (a short bottom sheet) or lies beside it
 * (a centred modal, with toasts in the right-hand column). A dialog that reaches the top would have
 * its title and Close button covered there: beside a right-hand drawer with room to its left, the
 * column moves left of the drawer; otherwise (a tall phone sheet) the stack goes just under the
 * dialog's header.
 *   stack:  the toast column's left and right edges and the stack's height
 *   edge:   the usual gap between the top of the screen and the stack
 */
export function toastSpotOverDialog(stack: { left: number; right: number; height: number }, panel: ScreenBox, headerBottom: number, edge: number, gap: number, viewportWidth: number): ToastSpot | null {
  if (![stack.left, stack.right, stack.height, panel.top, panel.left, panel.right, headerBottom, viewportWidth].every(Number.isFinite)) return null;
  if (stack.height <= 0) return null;
  const beside = stack.right <= panel.left || stack.left >= panel.right;
  if (beside || panel.top >= edge + stack.height + gap) return null;
  const width = stack.right - stack.left;
  const roomLeft = panel.left - gap - edge;
  if (width < viewportWidth && roomLeft >= width) return { right: Math.round(viewportWidth - panel.left + gap) };
  return { top: Math.round(Math.max(edge, headerBottom + gap)) };
}
