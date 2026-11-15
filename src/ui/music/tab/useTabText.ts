/**
 * Text measuring for the tab layout in the browser: a canvas measurer using the app's own font
 * stacks, rebuilt once the web fonts have loaded (widths measured with a fallback font would
 * leave chord symbols and lyrics too close or too far apart).
 */
import { useEffect, useState } from 'react';
import { canvasMeasurer, estimateText, type TextMeasurer } from './metrics';

let shared: { measurer: TextMeasurer; version: number } | null = null;
const listeners = new Set<() => void>();
let watching = false;

function families(): { mono: string; body: string; display: string } {
  const fallback = { mono: 'ui-monospace, monospace', body: 'system-ui, sans-serif', display: 'system-ui, sans-serif' };
  if (typeof document === 'undefined') return fallback;
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, alt: string) => css.getPropertyValue(name).trim() || alt;
  return { mono: read('--font-mono', fallback.mono), body: read('--font-body', fallback.body), display: read('--font-display', fallback.display) };
}

function rebuild(): void {
  shared = { measurer: canvasMeasurer(families()), version: (shared?.version ?? 0) + 1 };
  listeners.forEach((l) => l());
}

function watchFonts(): void {
  if (watching || typeof document === 'undefined' || !('fonts' in document)) return;
  watching = true;
  const fonts = document.fonts;
  fonts.ready.then(rebuild).catch(() => undefined);
  fonts.addEventListener?.('loadingdone', rebuild);
}

/** The current text measurer; components re-render when fonts finish loading. */
export function useTabText(): TextMeasurer {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    watchFonts();
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (!shared) {
    if (typeof document === 'undefined') return estimateText;
    shared = { measurer: canvasMeasurer(families()), version: 1 };
  }
  return shared.measurer;
}
