/**
 * `#teachers--<id>`: one teacher and their course. Who they are, a line in their voice, how far
 * the learner has got, the one next lesson, the course map of the units written so far, and the
 * rest of the journey from the plan. The other two teachers are one tap away; progress in every
 * course is kept.
 */
import { useMemo } from 'react';
import { navigate } from '@/app/router';
import { useScreenTitle } from '@/app/shell';
import { teacherById } from '@/app/teachers';
import { getProgress, setProfile } from '@/core/progress';
import { nextLesson } from '@/lessons';
import { CourseMap, ReviewEntry } from '@/lessons/ui';
import { Badge, Heading, Icon, LinkButton, Page, ProgressRing, Section, Skeleton, Text, cx } from '@/ui';
import { PROFILES, TEACHER_KEYS, type TeacherKey } from '@/content/teachers';
import { Portrait } from './Portrait';
import { SpeakButton } from './Speak';
import { savedTeacherLesson, useStandings } from './useStandings';
import { useTeacherCourse } from './useTeacherCourse';
import styles from './TeacherPage.module.css';

/** A teacher's page. */
export function TeacherPage({ teacher }: { teacher: TeacherKey }) {
  const card = teacherById(teacher);
  const profile = PROFILES[teacher];
  const tc = useTeacherCourse(teacher);
  const { standings, recommendation } = useStandings();
  const standing = standings[teacher];
  const saved = useMemo(() => savedTeacherLesson(teacher), [teacher]);
  useScreenTitle(card.name);

  const written = tc ? tc.units.length > 0 : null;
  // The next lesson that exists: the saved one, else the first written lesson not done.
  const upNext = useMemo(() => {
    if (!tc) return null;
    if (saved) {
      const l = tc.lesson(saved.lessonId);
      if (l) return { id: l.id, title: l.title, resume: true };
    }
    const n = nextLesson(tc.course, getProgress(), Date.now());
    const l = n ? tc.lesson(n.lessonId) : null;
    return l ? { id: l.id, title: l.title, resume: false } : null;
    // `standing` changes whenever the learner's progress in this course does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tc, saved, standing]);

  const start = (lessonId: string) => {
    setProfile({ teacher });
    navigate('teachers', teacher, lessonId);
  };

  return (
    <Page title={card.name} eyebrow={`${card.level} course`} subtitle={profile.courseTitle} back={{ to: 'teachers', label: 'Teachers' }} gap={8}>
      <nav className={styles.switcher} aria-label="Teachers">
        {TEACHER_KEYS.map((t) => {
          const c = teacherById(t);
          const here = t === teacher;
          return (
            <a key={t} href={`#teachers--${t}`} className={cx(styles.switch, here && styles.switchHere)} aria-current={here ? 'page' : undefined} data-switch={t}>
              <Portrait teacher={t} size={2.25} ring={here} />
              <span className={styles.switchText}>
                <span className={styles.switchName}>{c.first}</span>
                <span className={styles.switchLevel}>
                  {standings[t].done > 0 ? `${standings[t].done} of ${standings[t].total}` : c.level}
                  {t === recommendation.teacher && t !== teacher ? ' · for you' : ''}
                </span>
              </span>
            </a>
          );
        })}
      </nav>

      <section className={cx(styles.hero, styles[`tone-${teacher}`])} aria-label={`About ${card.first}`}>
        <Portrait teacher={teacher} className={styles.portrait} label />
        <div className={styles.about}>
          <Text>{profile.bio}</Text>
          <figure className={styles.sample}>
            <blockquote>
              <p>{profile.sample}</p>
            </blockquote>
            <figcaption>
              <SpeakButton teacher={teacher} text={profile.sample}>{`Hear ${card.first}`}</SpeakButton>
            </figcaption>
          </figure>
          <ul className={styles.teaches} aria-label="In this course">
            {profile.teaches.map((t) => (
              <li key={t}>
                <Icon name="Check" size="sm" className={styles.tick} />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.progress}>
          <ProgressRing value={standing.done} max={standing.total} size={88} tone="ok" label={`${standing.done} of ${standing.total} lessons done`}>
            <span className={styles.ringNumber}>{standing.done}</span>
            <span className={styles.ringOf}>of {standing.total}</span>
          </ProgressRing>
          <div className={styles.next}>
            {tc === null ? (
              <Skeleton variant="block" height="3rem" />
            ) : upNext ? (
              <>
                <Text variant="caption" tone="muted">
                  {upNext.resume ? 'Pick up where you left off' : standing.done === 0 ? 'Your first lesson' : 'Up next'}
                </Text>
                <Text weight="semibold">{upNext.title}</Text>
                <LinkButton
                  to="teachers"
                  params={[teacher, upNext.id]}
                  variant="primary"
                  size="lg"
                  iconRight="ArrowRight"
                  onClick={() => setProfile({ teacher })}
                  data-action="next-lesson"
                  data-lesson={upNext.id}
                >
                  {upNext.resume ? 'Continue lesson' : 'Start lesson'}
                </LinkButton>
              </>
            ) : written ? (
              <Text tone="muted">You have done every lesson written so far. New units are on their way.</Text>
            ) : (
              <>
                <Text weight="semibold">Lessons in preparation</Text>
                <Text variant="caption" tone="muted">
                  {`The whole course is planned below; ${card.first}'s first unit is being written.`}
                </Text>
              </>
            )}
          </div>
        </div>
      </section>

      {tc === null ? (
        <div aria-busy="true" className={styles.loading}>
          <Skeleton variant="block" height="6rem" />
          <Skeleton variant="block" height="14rem" />
        </div>
      ) : written ? (
        <>
          <ReviewEntry courses={[tc.course]} onStart={() => navigate('teachers', teacher, 'review')} hideWhenEmpty />
          <Section title="Your course" description={`${tc.units.reduce((n, u) => n + u.lessons.length, 0)} lessons ready, ${standing.total} in the whole course.`}>
            <div data-course-map-wrap="">
              <CourseMap
                course={tc.course}
                autoScroll={false}
                onStartLesson={(_u, lessonId) => start(lessonId)}
                onStartCheckpoint={(unitId) => navigate('teachers', teacher, 'checkpoint', unitId)}
                onPractice={(unitId) => navigate('teachers', teacher, 'practice', unitId)}
              />
            </div>
          </Section>
        </>
      ) : (
        <section className={styles.preparing} data-preparing={teacher}>
          <Portrait teacher={teacher} size={3} />
          <div>
            <Heading level={2} size="lg">
              {`${card.first}'s lessons are being written`}
            </Heading>
            <Text tone="muted">{profile.preparing}</Text>
            <div className={styles.preparingActions}>
              {teacher !== 'mia' && (
                <LinkButton to="teachers" params={['mia']} variant="primary" iconRight="ArrowRight">
                  Learn with Mia meanwhile
                </LinkButton>
              )}
              <LinkButton to="learn" iconLeft="Route">
                Open the Theory Path
              </LinkButton>
            </div>
          </div>
        </section>
      )}

      {tc && tc.upcoming.length > 0 && (
        <Section title={written ? 'Later in the course' : 'The course'} description={written ? 'Units still being written, in the order you will meet them.' : 'What you will learn, unit by unit.'} divided>
          <ol className={styles.upcoming} data-upcoming="">
            {tc.upcoming.map((u) => {
              const n = tc.outline.units.findIndex((o) => o.id === u.id) + 1;
              return (
                <li key={u.id} className={styles.upcomingUnit}>
                  <span className={styles.unitNumber} aria-hidden="true">
                    {n}
                  </span>
                  <div className={styles.unitText}>
                    <Text weight="semibold">{u.title}</Text>
                    <Text variant="caption" tone="muted">
                      {u.goal}
                    </Text>
                  </div>
                  <Badge tone="neutral" size="sm" variant="outline">
                    {u.lessons.length} lessons
                  </Badge>
                </li>
              );
            })}
          </ol>
        </Section>
      )}
    </Page>
  );
}
