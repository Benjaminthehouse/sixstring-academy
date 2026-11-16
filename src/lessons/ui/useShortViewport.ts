/**
 * True on a screen with little height, such as a phone held sideways (about 390 px tall): a step
 * there draws its neck smaller so the whole question fits without scrolling.
 */
import { useEffect, useState } from 'react';

/** The query: under 520 px of height, wider than tall. */
export const SHORT_VIEWPORT_QUERY = '(max-height: 520px) and (orientation: landscape)';

/** True while the viewport is short (a phone on its side). */
export function useShortViewport(): boolean {
  const [short, setShort] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SHORT_VIEWPORT_QUERY).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(SHORT_VIEWPORT_QUERY);
    const update = (): void => setShort(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return short;
}
