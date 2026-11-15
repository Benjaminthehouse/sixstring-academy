import type { ReactNode } from 'react';
import { ConfirmHost } from './Confirm';
import { ToastProvider } from './Toast';

/**
 * Mount once around the app (the shell does this): hosts the toast stack and the dialogs opened by
 * `confirmDialog()`. Both still work without it through self-mounting fallbacks, but inside the
 * provider they live in the app's own React tree.
 */
export function UIProvider({ children }: { children?: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ConfirmHost />
    </ToastProvider>
  );
}
