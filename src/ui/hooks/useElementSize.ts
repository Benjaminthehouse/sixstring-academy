import { useCallback, useEffect, useRef, useState } from 'react';

/** Width and height of an element's content box, in CSS pixels. */
export interface ElementSize {
  width: number;
  height: number;
}

const ZERO: ElementSize = { width: 0, height: 0 };

/**
 * Measure an element with ResizeObserver. Attach the returned callback ref:
 *   const [ref, { width }] = useElementSize<HTMLDivElement>();
 * The size is {0, 0} until the element mounts. State only changes when the rounded size changes.
 *
 * The observer is connected from the ref callback and re-connected from an effect, because React's
 * StrictMode (dev) runs effect cleanups once on mount without calling the ref callback again; an
 * observer that only the ref callback created would stay disconnected and the size would freeze.
 */
export function useElementSize<T extends Element = HTMLDivElement>(): [(node: T | null) => void, ElementSize] {
  const [size, setSize] = useState<ElementSize>(ZERO);
  const node = useRef<T | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  const apply = useCallback((width: number, height: number) => {
    const w = Math.round(width);
    const h = Math.round(height);
    setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  }, []);

  const connect = useCallback(
    (el: T | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      apply(rect.width, rect.height);
      if (typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        apply(entry.contentRect.width, entry.contentRect.height);
      });
      ro.observe(el);
      observer.current = ro;
    },
    [apply],
  );

  const ref = useCallback(
    (el: T | null) => {
      node.current = el;
      connect(el);
    },
    [connect],
  );

  useEffect(() => {
    if (!observer.current && node.current) connect(node.current);
    return () => {
      observer.current?.disconnect();
      observer.current = null;
    };
  }, [connect]);

  return [ref, size];
}
