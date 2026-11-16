/**
 * Mount heavy children (chord shapes, engraved tab) only when they come near the screen, behind a
 * placeholder of the same size, so long tables open instantly and never jump.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Props for `<Lazy>`. */
export interface LazyProps {
  children: () => ReactNode;
  /** Reserved size until the children mount (CSS lengths). */
  minHeight?: string;
  minWidth?: string;
  className?: string;
  /** How far outside the viewport to start (CSS margin). */
  margin?: string;
}

/** Renders `children()` once its box has come within `margin` of the viewport; stays mounted after. */
export function Lazy({ children, minHeight, minWidth, className, margin = '400px' }: LazyProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, margin]);

  const style: CSSProperties | undefined = shown ? undefined : { minHeight, minWidth };
  return (
    <div ref={ref} className={className} style={style} data-lazy={shown ? 'shown' : 'waiting'}>
      {shown ? children() : null}
    </div>
  );
}
