/**
 * Picks the section's page, and brings the addressed item into view: sections that select (a key,
 * an interval) take the item as their selection; for the others the row or card carrying
 * `data-ref-item="<item>"` is scrolled to and briefly highlighted.
 */
import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/ui';
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

/** The page for one section. */
export function SectionBody({ section, ...props }: SectionProps & { section: SectionId }) {
  const root = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const { item, reveal } = props;

  useEffect(() => {
    if (!item) return;
    let frames = 0;
    let handle = 0;
    let flashTimer = 0;
    // Wait for the item to exist (lazy rows, the shell's own scroll reset), then bring it into view.
    const tryReveal = () => {
      const el = root.current?.querySelector<HTMLElement>(`[data-ref-item="${CSS.escape(item)}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        el.setAttribute('data-flash', '');
        flashTimer = window.setTimeout(() => el.removeAttribute('data-flash'), 1800);
        return;
      }
      if (++frames < 30) handle = requestAnimationFrame(tryReveal);
    };
    handle = requestAnimationFrame(() => (handle = requestAnimationFrame(tryReveal)));
    return () => {
      cancelAnimationFrame(handle);
      window.clearTimeout(flashTimer);
    };
  }, [item, reveal, reduced]);

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
