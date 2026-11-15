/**
 * Applying appearance preferences to the document.
 *
 *   theme   `data-theme="light|dark"` on the root element; removed for `system`, so the
 *           `prefers-color-scheme` rules in `ui/tokens.css` decide.
 *   motion  `data-motion="reduce|full"`; removed for `system`.
 *   accent  `data-accent="<name>"` for a non-default accent theme; removed for the house amber.
 */
import { DEFAULT_COSMETICS } from './catalog';
import type { Preferences } from './types';

type Appearance = Pick<Preferences, 'theme' | 'motion' | 'accent'>;

function setOrRemove(root: Element, name: string, value: string | null): void {
  if (value === null) root.removeAttribute(name);
  else if (root.getAttribute(name) !== value) root.setAttribute(name, value);
}

/** Set or remove `data-theme`, `data-motion` and `data-accent` on the root element. No-op without a DOM. */
export function applyAppearance(prefs: Appearance, root: Element | null = typeof document !== 'undefined' ? document.documentElement : null): void {
  if (!root) return;
  setOrRemove(root, 'data-theme', prefs.theme === 'system' ? null : prefs.theme);
  setOrRemove(root, 'data-motion', prefs.motion === 'system' ? null : prefs.motion);
  setOrRemove(root, 'data-accent', prefs.accent === DEFAULT_COSMETICS.accent ? null : prefs.accent.replace(/^accent-/, ''));
}

/**
 * Whether animation should be reduced: the learner's override if set, else the device setting.
 * Use this for motion driven from JavaScript (canvas, confetti, auto-scroll).
 */
export function shouldReduceMotion(prefs: Pick<Preferences, 'motion'>): boolean {
  if (prefs.motion === 'reduce') return true;
  if (prefs.motion === 'full') return false;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
}
