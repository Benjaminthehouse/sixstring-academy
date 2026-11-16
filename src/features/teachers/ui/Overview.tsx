/**
 * `#teachers`: the three teachers as people, the one to start with (by the learner's level and
 * what they are already doing), and where they left off. One primary action: continue the saved
 * lesson, or start (or continue) with the recommended teacher.
 */
import { useMemo } from 'react';
import { Badge, Grid, Heading, Icon, LinkButton, Page, ProgressBar, Section, Text, cx } from '@/ui';
import { TEACHERS, teacherById } from '@/app/teachers';
import { PROFILES, TEACHER_KEYS, writtenUnitIds, type TeacherKey } from '@/content/teachers';
import { Portrait } from './Portrait';
import { SpeakButton } from './Speak';
import { savedTeacherLesson, useStandings } from './useStandings';
import type { CourseStanding } from '../model/standing';
import styles from './Overview.module.css';

/** The teachers overview. */
export function Overview() {
  const { standings, recommendation } = useStandings();
  const saved = useMemo(() => savedTeacherLesson(), []);
  const rec = recommendation.teacher;
  const recCard = teacherById(rec);
  const recStanding = standings[rec];
  const recWritten = writtenUnitIds(rec).length > 0;
  const startLabel = recommendation.reason === 'continue' && recStanding.next ? `Continue with ${recCard.first}` : `Start with ${recCard.first}`;

  return (
    <Page
      title="Teachers"
      subtitle="Weekly lessons, the way a good teacher gives them: an explanation, a demonstration, practice that listens to you play, and real music."
      gap={10}
    >
      {saved && (
        <section className={styles.resume} aria-label="Pick up where you left off" data-resume={saved.lessonId}>
          <Portrait teacher={saved.teacher} size={3.25} />
          <div className={styles.resumeText}>
            <Text variant="eyebrow" tone="accent">
              Pick up where you left off
            </Text>
            <Text weight="semibold">{saved.title}</Text>
            <Text variant="caption" tone="muted">
              With {teacherById(saved.teacher).first} · step {saved.cleared + 1} of {saved.total}
            </Text>
          </div>
          <LinkButton to="teachers" params={[saved.teacher, saved.lessonId]} variant="primary" iconRight="ArrowRight" className={styles.resumeButton} data-action="resume">
            Continue lesson
          </LinkButton>
        </section>
      )}

      {/* With a lesson to pick up, that is the recommendation: no second big block competing with it. */}
      {!saved && (
        <section className={cx(styles.hero, styles[`tone-${rec}`])} aria-labelledby="teachers-rec" data-recommended={rec}>
          <Portrait teacher={rec} className={styles.heroPortrait} />
          <div className={styles.heroText}>
            <Text variant="eyebrow" tone="accent">
              {recommendation.reason === 'continue' ? 'Your teacher' : 'Recommended for you'}
            </Text>
            <Heading level={2} size="2xl" display id="teachers-rec">
              {recommendation.reason === 'continue' ? `Keep going with ${recCard.first}` : `${recCard.first} is the place to start`}
            </Heading>
            <Text tone="muted">{recommendation.because}</Text>
            <blockquote className={styles.quote}>
              <p>{recCard.hello}</p>
            </blockquote>
            <div className={styles.heroActions}>
              <LinkButton
                to="teachers"
                params={recWritten && recStanding.next ? [rec, recStanding.next.lessonId] : [rec]}
                variant="primary"
                size="lg"
                iconRight="ArrowRight"
                data-action="start"
              >
                {startLabel}
              </LinkButton>
              {recWritten && recStanding.next && (
                <Text variant="caption" tone="muted">
                  Next: {recStanding.next.title}
                </Text>
              )}
            </div>
          </div>
        </section>
      )}

      <Section title="Your three teachers" description="Each one takes you further. Switch whenever you like: your place in every course is kept.">
        <Grid min="17rem" gap={4} className={styles.grid}>
          {TEACHERS.map((t) => (
            <TeacherTile key={t.id} teacher={t.id} standing={standings[t.id]} recommended={t.id === rec} />
          ))}
        </Grid>
      </Section>

      <Section title="How the courses connect" description="One path from your first open string to the concert hall." divided>
        <ol className={styles.journey}>
          {TEACHER_KEYS.map((t, i) => (
            <li key={t} className={styles.journeyStep}>
              <Portrait teacher={t} size={2.5} />
              <div>
                <Text weight="semibold">
                  {teacherById(t).first}: {teacherById(t).level}
                </Text>
                <Text variant="caption" tone="muted">
                  {JOURNEY[i]}
                </Text>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </Page>
  );
}

const JOURNEY = [
  'Ends with a hand-over check: chord changes, the folk strum, your first scale and the F barre.',
  'Starts by repeating that check, so you can begin here if you taught yourself. Ends with a gig and a second check.',
  'Opens with an audition that measures where you are, then turns it into goals.',
];

/** One teacher as a person: portrait, who they teach, a line in their voice, progress, a way in. */
function TeacherTile({ teacher, standing, recommended }: { teacher: TeacherKey; standing: CourseStanding; recommended: boolean }) {
  const card = teacherById(teacher);
  const profile = PROFILES[teacher];
  const started = standing.done > 0 || standing.lastAt !== null;
  return (
    <article className={cx(styles.tile, styles[`tone-${teacher}`])} data-teacher={teacher} aria-labelledby={`tile-${teacher}`}>
      <div className={styles.tileHead}>
        <Portrait teacher={teacher} size={4.5} />
        <div className={styles.tileName}>
          <Heading level={3} size="lg" id={`tile-${teacher}`}>
            {card.name}
          </Heading>
          <div className={styles.badges}>
            <Badge tone="neutral" size="sm">
              {card.level}
            </Badge>
            {recommended && (
              <Badge tone="accent" size="sm" icon="Sparkles">
                For you
              </Badge>
            )}
          </div>
        </div>
      </div>
      <Text variant="caption" tone="muted" className={styles.course}>
        {profile.courseTitle}
      </Text>
      <Text>{profile.forWho}</Text>
      <figure className={styles.sample}>
        <blockquote>
          <p>{profile.sample}</p>
        </blockquote>
        <figcaption>
          <SpeakButton teacher={teacher} text={profile.sample}>
            {`Hear ${card.first}`}
          </SpeakButton>
        </figcaption>
      </figure>
      <div className={styles.tileFoot}>
        {started ? (
          <ProgressBar value={standing.done} max={standing.total} label={`${standing.done} of ${standing.total} lessons`} valueText={false} size="sm" tone="ok" />
        ) : (
          <Text variant="caption" tone="muted">
            <Icon name="Clock" size="xs" /> {standing.total} lessons
          </Text>
        )}
        <LinkButton to="teachers" params={[teacher]} iconRight="ArrowRight" fullWidth data-open-teacher={teacher}>
          {`${card.first}'s course`}
        </LinkButton>
      </div>
    </article>
  );
}
