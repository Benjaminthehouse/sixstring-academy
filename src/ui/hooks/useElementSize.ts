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
 */
export function useElementSize<T extends Element = HTMLDivElement>(): [(node: T | null) => void, ElementSize] {
  const [size, setSize] = useState<ElementSize>(ZERO);
  const observer = useRef<ResizeObserver | null>(null);

  const apply = useCallback((width: number, height: number) => {
    const w = Math.round(width);
    const h = Math.round(height);
    setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  }, []);

  const ref = useCallback(
    (node: T | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      apply(rect.width, rect.height);
      if (typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        apply(entry.contentRect.width, entry.contentRect.height);
      });
      ro.observe(node);
      observer.current = ro;
    },
    [apply],
  );

  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, size];
}
