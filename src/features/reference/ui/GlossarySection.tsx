/**
 * The glossary: every word the lessons use, in one line each, searchable, with the lesson that
 * teaches it and where the Reference shows it.
 */
import { useMemo, useState } from 'react';
import { href } from '@/app/router';
import { Icon, SearchField, Text } from '@/ui';
import { filterGlossary, glossaryEntries } from '../model/glossary';
import type { SectionProps } from './SectionBody';
import styles from './Sections.module.css';

/** The glossary page. */
export function GlossarySection({ item }: SectionProps) {
  const entries = useMemo(() => glossaryEntries(), []);
  const [q, setQ] = useState('');
  const shown = useMemo(() => filterGlossary(entries, q), [entries, q]);
  // The deep-linked term stays visible even when a filter would hide it.
  const list = item && q && !shown.some((e) => e.id === item) ? [...shown, ...entries.filter((e) => e.id === item)] : shown;
  const letters = useMemo(() => [...new Set(entries.map((e) => e.letter))], [entries]);

  const jump = (letter: string) => {
    const el = document.querySelector<HTMLElement>(`[data-letter="${letter}"]`);
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  };

  return (
    <div className={styles.stack}>
      <SearchField value={q} onChange={setQ} label="Filter the glossary" placeholder={`Filter ${entries.length} terms`} />
      {!q && (
        <nav aria-label="Jump to a letter" className={styles.letters}>
          {letters.map((l) => (
            <button key={l} type="button" className={styles.letter} onClick={() => jump(l)}>
              {l}
            </button>
          ))}
        </nav>
      )}
      <p className={styles.srOnly} role="status" aria-live="polite">
        {q ? `${shown.length} term${shown.length === 1 ? '' : 's'}` : ''}
      </p>
      {list.length === 0 ? (
        <Text tone="muted">No term matches “{q}”. Try a shorter word, or search the whole Reference.</Text>
      ) : (
        <dl className={styles.glossary}>
          {list.map((e, i) => {
            const firstOfLetter = !q && (i === 0 || list[i - 1].letter !== e.letter);
            return (
              <div key={e.id} className={styles.term} data-ref-item={e.id} data-letter={firstOfLetter ? e.letter : undefined} tabIndex={firstOfLetter ? -1 : undefined}>
                <dt className={styles.termName}>{e.term}</dt>
                <dd className={styles.termDef}>
                  <span>{e.definition}</span>
                  <span className={styles.termLinks}>
                    {e.lesson && (
                      <a className={styles.inlineLink} href={href('learn', ...e.lesson.params)}>
                        <Icon name="GraduationCap" size="xs" /> Lesson: {e.lesson.title}
                      </a>
                    )}
                    {e.see && (
                      <a className={styles.inlineLink} href={href('reference', e.see.section, e.see.item)}>
                        <Icon name="BookOpen" size="xs" /> {e.see.label}
                      </a>
                    )}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
