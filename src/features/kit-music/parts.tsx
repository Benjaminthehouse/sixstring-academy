import type { ReactNode } from 'react';
import { cx } from '@/ui';
import styles from './KitMusic.module.css';

/** A numbered top-level group of the gallery ("01 Fretboard"). */
export function Group({ id, index, title, blurb, children }: { id: string; index: string; title: string; blurb: string; children: ReactNode }) {
  return (
    <section className={styles.group} id={`music-${id}`} aria-labelledby={`music-${id}-title`} data-kit-group={id}>
      <div className={styles.groupHead}>
        <span className={styles.groupIndex} aria-hidden="true">
          {index}
        </span>
        <div>
          <h2 id={`music-${id}-title`} className={styles.groupTitle}>
            {title}
          </h2>
          <p className={styles.groupBlurb}>{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** One configuration: a title, a line about it, the live component. `wide` gives the demo the full width. */
export function Demo({ title, note, wide, controls, children }: { title: string; note?: ReactNode; wide?: boolean; controls?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx(styles.demo, wide && styles.wide)} data-demo={title}>
      <div className={styles.demoHead}>
        <div className={styles.demoText}>
          <h3 className={styles.demoTitle}>{title}</h3>
          {note != null && <p className={styles.demoNote}>{note}</p>}
        </div>
        {controls && <div className={styles.demoControls}>{controls}</div>}
      </div>
      <div className={styles.demoBody}>{children}</div>
    </div>
  );
}

/** A row of small labelled items (chord boxes, sizes, woods). */
export function Shelf({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.shelf, className)}>{children}</div>;
}

/** One item on a shelf with a caption under it. */
export function ShelfItem({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <figure className={styles.shelfItem}>
      {children}
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  );
}

export { styles as kitStyles };
