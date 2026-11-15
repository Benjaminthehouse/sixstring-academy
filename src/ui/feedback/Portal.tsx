import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Props for `<Portal>`. */
export interface PortalProps {
  children: ReactNode;
  /** Where to render. Default `document.body`. */
  container?: Element | null;
}

/** Render children at the end of `<body>` so overlays escape clipping and stacking contexts. */
export function Portal({ children, container }: PortalProps) {
  // The app is client-only, so the portal can mount in the same pass (overlays measure themselves in layout effects).
  if (typeof document === 'undefined') return null;
  return createPortal(children, container ?? document.body);
}
