/**
 * The end of a unit: the teacher celebrates the performance that closed it, says what the
 * learner can do now, and points at what comes next (with the band in the Player, a daily goal,
 * the next unit). Confetti once, reduced-motion aware (the kit's `Celebration`).
 */
import { useEffect, useState } from 'react';
import { openStats } from '@/app/shell';
import { teacherById } from '@/app/teachers';
import { RichText } from '@/lessons/ui';
import { speakable } from '@/lessons';
import { Button, Celebration, Heading, Icon, LinkButton, Text, cx, usePrefersReducedMotion } from '@/ui';
import { playerParams, type Milestone, type TeacherCourse, type TeacherKey, type TeacherUnit } from '@/content/teachers';
import { Portrait } from '../Portrait';
import { SpeakButton } from '../Speak';
import styles from './Lesson.module.css';

/** Props of {@link UnitComplete}. */
export interface UnitCompleteProps {
  teacher: TeacherKey;
  unit: TeacherUnit;
  milestone: Milestone;
  tc: TeacherCourse;
}

/** The unit's celebration, above the lesson summary. */
export function UnitComplete({ teacher, unit, milestone, tc }: UnitCompleteProps) {
  const card = teacherById(teacher);
  const reduced = usePrefersReducedMotion();
  const [fire, setFire] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setFire(true), 300);
    return () => window.clearTimeout(t);
  }, []);
  const index = tc.outline.units.findIndex((u) => u.id === unit.id);
  const nextOutline = tc.outline.units[index + 1] ?? null;
  const nextWritten = nextOutline ? tc.units.some((u) => u.id === nextOutline.id) : false;

  return (
    <section className={styles.unitDone} aria-labelledby="unit-done-title" data-unit-complete={unit.id}>
      <Celebration fire={fire} intensity="high" />
      <div className={cx(styles.medal, !reduced && styles.pop)} aria-hidden="true">
        <Portrait teacher={teacher} size={6} />
        <span className={styles.medalBadge}>
          <Icon name="Trophy" size="md" />
        </span>
      </div>
      <Text variant="eyebrow" tone="accent">
        {`Unit ${index + 1} complete`}
      </Text>
      <Heading level={2} size="3xl" display id="unit-done-title" className={styles.unitTitle}>
        {unit.title}
      </Heading>
      <Text tone="muted">{`You performed ${milestone.piece}, start to finish.`}</Text>

      <figure className={styles.celebrate}>
        <blockquote>
          <RichText text={milestone.celebrate} as="p" />
        </blockquote>
        <figcaption>
          <span>{card.name}</span>
          <SpeakButton teacher={teacher} text={speakable(milestone.celebrate)} />
        </figcaption>
      </figure>

      <div className={styles.canNow}>
        <Text variant="label">What you can do now</Text>
        <Text>{unit.description}</Text>
      </div>

      <div className={styles.unitActions}>
        {milestone.song && (
          <LinkButton to="play" params={playerParams(milestone.song, { mode: 'flow' })} iconLeft="Users" data-action="perform-band">
            Play it with the band
          </LinkButton>
        )}
        <Button iconLeft="Target" onClick={() => openStats('goal')} data-action="daily-goal">
          Set your daily goal
        </Button>
      </div>

      {nextOutline && (
        <Text variant="caption" tone="muted" className={styles.nextUnit}>
          {nextWritten ? `Next: ${nextOutline.title}.` : `Next: ${nextOutline.title}. ${card.first} is writing it now; it will appear in your course when it is ready.`}
        </Text>
      )}
    </section>
  );
}
