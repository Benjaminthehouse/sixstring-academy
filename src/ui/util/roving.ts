/** Keys that move a roving-tabindex cursor. */
export type RovingKey = 'next' | 'prev' | 'first' | 'last';

/**
 * Next enabled index for roving focus. Skips disabled items; wraps around when `loop` is true.
 * Returns `current` when nothing else is enabled.
 */
export function rovingIndex(current: number, count: number, key: RovingKey, isDisabled: (index: number) => boolean = () => false, loop = true): number {
  if (count <= 0) return -1;
  const enabled: number[] = [];
  for (let i = 0; i < count; i++) if (!isDisabled(i)) enabled.push(i);
  if (enabled.length === 0) return current;
  if (key === 'first') return enabled[0];
  if (key === 'last') return enabled[enabled.length - 1];
  const pos = enabled.indexOf(current);
  if (pos === -1) {
    // Focus is on a disabled or unknown item: go to the nearest enabled one in the travel direction.
    if (key === 'next') return enabled.find((i) => i > current) ?? (loop ? enabled[0] : enabled[enabled.length - 1]);
    const before = enabled.filter((i) => i < current);
    return before.length ? before[before.length - 1] : loop ? enabled[enabled.length - 1] : enabled[0];
  }
  const delta = key === 'next' ? 1 : -1;
  const target = pos + delta;
  if (target < 0) return loop ? enabled[enabled.length - 1] : enabled[0];
  if (target >= enabled.length) return loop ? enabled[0] : enabled[enabled.length - 1];
  return enabled[target];
}

/** Map a keyboard event key to a roving move for the given orientation, or null if it is not a navigation key. */
export function rovingKeyFor(key: string, orientation: 'horizontal' | 'vertical' | 'both' = 'horizontal', rtl = false): RovingKey | null {
  const horizontal = orientation !== 'vertical';
  const vertical = orientation !== 'horizontal';
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  if (horizontal && key === 'ArrowRight') return rtl ? 'prev' : 'next';
  if (horizontal && key === 'ArrowLeft') return rtl ? 'next' : 'prev';
  if (vertical && key === 'ArrowDown') return 'next';
  if (vertical && key === 'ArrowUp') return 'prev';
  return null;
}

/** Index of the first item whose label starts with the typed text (case-insensitive), searching after `from`. */
export function typeaheadIndex(labels: string[], typed: string, from: number, isDisabled: (index: number) => boolean = () => false): number {
  const needle = typed.trim().toLowerCase();
  if (!needle) return -1;
  const n = labels.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (!isDisabled(i) && labels[i].toLowerCase().startsWith(needle)) return i;
  }
  return -1;
}
