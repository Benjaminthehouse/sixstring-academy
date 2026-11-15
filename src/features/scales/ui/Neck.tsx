/**
 * The neck: the kit's Fretboard with every cell tappable (tap = hear that note), inside its own
 * sideways-scrolling frame. Whenever the shape changes, the frame glides so the shape is centred;
 * the page itself never scrolls sideways.
 */
import { memo, useEffect, useRef } from 'react';
import type { SpellContext, TuningInput } from '@/core/guitar';
import { usePrefersReducedMotion } from '@/ui';
import { Fretboard, type FretBox, type FretCell, type FretMarker, type FretboardSize } from '@/ui/music';
import styles from './Scales.module.css';

/** Props of `<Neck>`. */
export interface NeckProps {
  markers: readonly FretMarker[];
  /** Frets on the wood. */
  frets: readonly [number, number];
  box: FretBox | null;
  capo: number;
  tuning?: TuningInput;
  noteContext: SpellContext;
  onCellClick: (cell: FretCell) => void;
  /** Frets on the wood to bring into view (the current shape); null leaves the scroll alone. */
  focus: readonly [number, number] | null;
  size?: FretboardSize;
  'aria-label': string;
}

/** Find the board's own scroller (the first box inside that scrolls sideways). */
function scrollerIn(root: HTMLElement): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>('div')) {
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible') return el;
  }
  return null;
}

/** The fret (counted from the capo) a cell button stands for, from its accessible name. */
function cellFret(button: HTMLElement): number | null {
  const label = button.getAttribute('aria-label') ?? '';
  const m = /fret (\d+)/.exec(label);
  if (m) return Number(m[1]);
  return /\bopen\b/.test(label) ? 0 : null;
}

/** Scroll the board so frets `from`–`to` (counted from the capo) sit in the middle of the frame. */
function centreFrets(root: HTMLElement, from: number, to: number, smooth: boolean): void {
  const scroller = scrollerIn(root);
  if (!scroller) return;
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of root.querySelectorAll<HTMLElement>('button[aria-label^="string 1,"]')) {
    const f = cellFret(b);
    if (f === null || f < from || f > to) continue;
    const r = b.getBoundingClientRect();
    lo = Math.min(lo, r.left);
    hi = Math.max(hi, r.right);
  }
  if (!Number.isFinite(lo)) return;
  const frame = scroller.getBoundingClientRect();
  const centre = (lo + hi) / 2 - frame.left + scroller.scrollLeft;
  const left = Math.max(0, Math.min(scroller.scrollWidth - scroller.clientWidth, centre - scroller.clientWidth / 2));
  if (Math.abs(left - scroller.scrollLeft) < 2) return;
  scroller.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
}

/** The scale's neck. */
export const Neck = memo(function Neck(props: NeckProps) {
  const { markers, frets, box, capo, tuning, noteContext, onCellClick, focus, size } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const first = useRef(true);
  const focusFrom = focus?.[0];
  const focusTo = focus?.[1];

  useEffect(() => {
    const root = rootRef.current;
    if (!root || focusFrom === undefined || focusTo === undefined) return;
    // Wait a frame: the board lays itself out once it has measured its container.
    const smooth = !first.current && !reduced;
    const raf = requestAnimationFrame(() => {
      centreFrets(root, Math.max(0, focusFrom - capo), Math.max(0, focusTo - capo), smooth);
      first.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [focusFrom, focusTo, capo, frets[0], frets[1], reduced]);

  return (
    <div ref={rootRef} className={styles.neck} data-neck>
      <Fretboard
        frets={frets}
        markers={markers}
        box={box}
        capo={capo || undefined}
        tuning={tuning}
        noteContext={noteContext}
        onCellClick={onCellClick}
        size={size}
        fretNumbers="inlays"
        aria-label={props['aria-label']}
      />
    </div>
  );
});
