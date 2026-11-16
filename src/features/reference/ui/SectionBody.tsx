/**
 * Picks the section's page, and brings the addressed item into view: sections that select (a key,
 * an interval) take the item as their selection; for the others the row or card carrying
 * `data-ref-item="<item>"` is scrolled to and briefly highlighted.
 */
import { useEffect, useRef } from 'react';
import type { SectionId } from '../model/sections';
import type { Fmt } from './format';
import type { Sounder } from './sound';
import { ChordsSection } from './ChordsSection';
import { CircleSection } from './CircleSection';
import { GlossarySection } from './GlossarySection';
import { HarmonySection } from './HarmonySection';
import { IntervalsSection } from './IntervalsSection';
import { KeysSection } from './KeysSection';
import { NotationSection } from './NotationSection';
import { ScalesSection } from './ScalesSection';
import { TuningsSection } from './TuningsSection';
import styles from './Reference.module.css';

/** What every section page receives. */
export interface SectionProps {
  /** The addressed item (route param), or null. */
  item: string | null;
  /** Changes on every search pick, so the same item can be revealed again. */
  reveal: number;
  /** Heading level of the section's own sub-headings. */
  level: 2 | 3;
  fmt: Fmt;
  sounder: Sounder;
}

/** How long a revealed item is held in place while the rows around it finish drawing. */
const HOLD_MS = 1500;
/** Anything the learner does to scroll ends the hold: the page is theirs again. */
const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/** The page for one section. */
export function SectionBody({ section, ...props }: SectionProps & { section: SectionId }) {
  const root = useRef<HTMLDivElement | null>(null);
  const { item, reveal } = props;

  useEffect(() => {
    const body = root.current;
    if (!item || !body) return;
    let frames = 0;
    let handle = 0;
    let flashTimer = 0;
    let holdTimer = 0;
    let observer: ResizeObserver | null = null;
    let target: HTMLElement | null = null;
    // A jump, not a smooth scroll: rows above the item draw their chord shapes as they pass by
    // and change height, which leaves a smooth scroll short of its target.
    const place = () => target?.scrollIntoView({ block: 'center' });
    const release = () => {
      observer?.disconnect();
      observer = null;
      window.clearTimeout(holdTimer);
      for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, release);
    };
    // Wait for the item to exist (lazy rows, the shell's own scroll reset), then bring it into view.
    const tryReveal = () => {
      target = body.querySelector<HTMLElement>(`[data-ref-item="${CSS.escape(item)}"]`);
      if (target) {
        place();
        const el = target;
        el.setAttribute('data-flash', '');
        flashTimer = window.setTimeout(() => el.removeAttribute('data-flash'), 1800);
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(place);
          observer.observe(body);
        }
        for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, release, { passive: true });
        holdTimer = window.setTimeout(release, HOLD_MS);
        return;
      }
      if (++frames < 30) handle = requestAnimationFrame(tryReveal);
    };
    handle = requestAnimationFrame(() => (handle = requestAnimationFrame(tryReveal)));
    return () => {
      cancelAnimationFrame(handle);
      window.clearTimeout(flashTimer);
      release();
    };
  }, [item, reveal]);

  return (
    <div ref={root} className={styles.body} data-section-body={section}>
      {section === 'circle' && <CircleSection {...props} />}
      {section === 'keys' && <KeysSection {...props} />}
      {section === 'intervals' && <IntervalsSection {...props} />}
      {section === 'chords' && <ChordsSection {...props} />}
      {section === 'scales' && <ScalesSection {...props} />}
      {section === 'harmony' && <HarmonySection {...props} />}
      {section === 'notation' && <NotationSection {...props} />}
      {section === 'tunings' && <TuningsSection {...props} />}
      {section === 'glossary' && <GlossarySection {...props} />}
    </div>
  );
}
