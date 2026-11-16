/**
 * The Theory Path lessons behind a teacher's lesson (the plan's `theory` links), at the end of the
 * lesson: the ideas it used, a few minutes each, with a tick for the ones already done. A link to a
 * lesson further along the path still opens it, with a note that it is ahead.
 */
import type { MouseEvent } from 'react';
import { href, navigate } from '@/app/router';
import { useProgress } from '@/core/progress';
import { Icon, Text, cx } from '@/ui';
import { theoryLinksOf, type TeacherKey } from '@/content/teachers';
import { outlineLesson, theorySkill } from '@/content/theory';
import styles from './Lesson.module.css';

/**
 * Open a theory lesson from a teacher lesson's summary as a side trip. The finished lesson's address
 * would start the lesson over, so the entry it leaves behind becomes the teacher's course page:
 * Back from the theory lesson lands there ("Next lesson" and the map), not on step 1 of the lesson
 * just finished. The history entry keeps its state (the shell's scroll bookkeeping).
 */
export function openTheorySideTrip(teacher: TeacherKey, unitId: string, lessonId: string): void {
  try {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + href('teachers', teacher));
  } catch {
    // A frame that refuses replaceState: the link still opens, Back just restarts the lesson.
  }
  navigate('learn', unitId, lessonId);
}

/** The links of one lesson, or nothing when the plan lists none. */
export function TheoryLinks({ teacher, lessonId }: { teacher: TeacherKey; lessonId: string }) {
  const skills = useProgress((s) => s.skills);
  const links = theoryLinksOf(lessonId)
    .map((l) => ({ ...l, outline: outlineLesson(l.lessonId) }))
    .filter((l) => l.outline && l.outline.unitId === l.unitId);
  if (links.length === 0) return null;
  const open = (e: MouseEvent<HTMLAnchorElement>, unitId: string, id: string) => {
    // A new tab or window (modifier keys, middle click) keeps the plain link.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openTheorySideTrip(teacher, unitId, id);
  };
  return (
    <section className={styles.theoryLinks} aria-labelledby={`theory-${lessonId}`} data-theory-links={lessonId}>
      <div className={styles.theoryHead}>
        <Text variant="label" id={`theory-${lessonId}`}>
          The theory behind it
        </Text>
        <Text variant="caption" tone="muted">
          On the Theory Path, a few minutes each.
        </Text>
      </div>
      <ul className={styles.theoryList}>
        {links.map((l) => {
          const done = skills[theorySkill(l.unitId, l.lessonId)]?.completed === true;
          return (
            <li key={`${l.unitId}/${l.lessonId}`}>
              <a
                className={cx(styles.theoryLink, done && styles.theoryDone)}
                href={href('learn', l.unitId, l.lessonId)}
                onClick={(e) => open(e, l.unitId, l.lessonId)}
                data-theory-link={`${l.unitId}/${l.lessonId}`}
              >
                <span className={styles.theoryIcon} aria-hidden="true">
                  <Icon name={done ? 'CircleCheck' : 'Route'} size="sm" />
                </span>
                <span className={styles.theoryTitle}>{l.outline!.lesson.title}</span>
                <span className={styles.theoryMeta}>{done ? 'Done' : `${l.outline!.lesson.minutes} min`}</span>
                <Icon name="ChevronRight" size="sm" className={styles.theoryChevron} />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
