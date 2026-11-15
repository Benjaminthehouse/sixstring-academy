const TABBABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

function isHidden(el: HTMLElement): boolean {
  if (el.hidden || el.closest('[hidden], [inert]')) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  return false;
}

/** Elements inside `root` that Tab can reach, in DOM order (negative tabindex, disabled and hidden ones excluded). */
export function getTabbables(root: ParentNode): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(TABBABLE));
  const seenRadioGroups = new Set<string>();
  return nodes.filter((el) => {
    if (el.tabIndex < 0 || isHidden(el)) return false;
    // A radio group is one tab stop: keep the checked radio, or the first one when none is checked.
    if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
      const scope = el.form ?? root;
      const group = Array.from(scope.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS_ESCAPE(el.name)}"]`));
      const checked = group.find((r) => r.checked);
      if (checked ? checked !== el : seenRadioGroups.has(el.name)) return false;
      seenRadioGroups.add(el.name);
    }
    return true;
  });
}

function CSS_ESCAPE(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

/**
 * Where Tab should land to stay inside `root`: returns the element to focus when the event must be
 * redirected (wrapping at either end, or focus has escaped), or null to let the browser handle it.
 */
export function trapTabTarget(root: HTMLElement, active: Element | null, shift: boolean): HTMLElement | null {
  const tabbables = getTabbables(root);
  if (tabbables.length === 0) return root;
  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];
  if (!active || !root.contains(active)) return shift ? last : first;
  if (shift && (active === first || active === root)) return last;
  if (!shift && active === last) return first;
  return null;
}

/** First element to focus when an overlay opens: `[data-autofocus]`, else the first tabbable, else the root. */
export function initialFocusTarget(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>('[data-autofocus]') ?? getTabbables(root)[0] ?? root;
}
