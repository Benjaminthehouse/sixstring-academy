/**
 * Keeps the browser's own chrome in step with the theme. The progress store already writes
 * `data-theme` / `data-motion` / `data-accent` on <html>; what is left is the `theme-color` meta
 * (the status bar and tab strip on phones), which must follow the page background.
 */
import { useEffect } from 'react';
import { useProgress } from '@/core/progress';
import { useMediaQuery } from '@/ui';

/** Copy the current `--bg` into `<meta name="theme-color">`. No-op without a DOM. */
export function syncThemeColor(): void {
  if (typeof document === 'undefined') return;
  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (!background) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  if (meta.content !== background) meta.content = background;
}

/** Shell hook: re-sync the browser chrome colour whenever the theme in effect changes. */
export function useDocumentAppearance(): void {
  const theme = useProgress((s) => s.prefs.theme);
  const accent = useProgress((s) => s.prefs.accent);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  useEffect(() => {
    // The store sets the attribute in the same tick; read the colour once styles have settled.
    const handle = requestAnimationFrame(syncThemeColor);
    return () => cancelAnimationFrame(handle);
  }, [theme, accent, systemDark]);
}
