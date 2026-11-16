/**
 * The lesson gallery (`#kit-lessons`): every exercise type fresh, answered right and answered
 * wrong; teaching cards; every figure kind; the feedback panel; the course map with the demo
 * course and the review card; and real sessions of the demo course to play end to end.
 *
 *   #kit-lessons--<section>          one section: exercises, cards, figures, feedback, map, lessons
 *   #kit-lessons--type--<type>       one exercise type in its three states
 *   #kit-lessons--try--<type>        that exercise in the real player (nothing is recorded)
 *   #kit-lessons--play--<lesson>     a demo lesson in the player (recorded like any lesson)
 *   #kit-lessons--checkpoint--<unit> / --practice--<unit> / --review-session
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { RouteProps } from '@/app/routes';
import { navigate } from '@/app/router';
import { Button, Grid, Heading, LinkButton, Page, Section, Stack, Text, cx } from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { getProgress } from '@/core/progress';
import {
  DEMO_COURSE, EXERCISE_EXAMPLES, FIGURE_EXAMPLES, findLesson, grade, presentExercise, reviewSource, type Answer, type Course, type Exercise, type ExerciseType,
  type GradeResult, type SessionFeedback, type SessionSource,
} from '@/lessons';
import {
  CourseMap, ExerciseFrame, FeedbackPanel, FigureView, LessonPlayer, LessonProvider, ReviewEntry, TeachingCard, exerciseKindLabel, memoryPort, type NextStep,
  type PrimaryAction,
} from '@/lessons/ui';
import { isCheckable } from '@/lessons/ui/logic/drafts';
import { OPTION_CARD, OPTION_EXERCISES, OPTION_FIGURES } from './options';
import { rightAnswer, wrongAnswer } from './samples';
import styles from './Gallery.module.css';

const SECTIONS = [
  { id: 'exercises', label: 'Exercises' },
  { id: 'options', label: 'Options' },
  { id: 'cards', label: 'Teaching cards' },
  { id: 'figures', label: 'Figures' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'map', label: 'Course map' },
  { id: 'lessons', label: 'Demo lessons' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const TYPES = Object.keys(EXERCISE_EXAMPLES) as ExerciseType[];

/** A teacher's version of the demo course, to show the teacher on cards. */
const MIA_DEMO: Course = { ...DEMO_COURSE, id: 'demo-mia', teacher: 'mia' };

// ── One exercise, in one state ─────────────────────────────────────────────────────────────────

function feedbackOf(result: GradeResult, answer: Answer | null, extra: Partial<SessionFeedback> = {}): SessionFeedback {
  return { result, answer, skipped: false, heartLost: false, willRetry: false, ...extra };
}

/** An exercise as the player shows it, with a small bar of its own (Check, then the verdict). */
function StepPreview({ exercise, state, seed = 7 }: { exercise: Exercise; state: 'fresh' | 'right' | 'wrong'; seed?: number }) {
  const { naming } = useMusicSettings();
  const presentation = useMemo(() => presentExercise(exercise, seed), [exercise, seed]);
  const fixed = useMemo(() => {
    if (state === 'fresh') return null;
    const answer = state === 'right' ? rightAnswer(exercise) : wrongAnswer(exercise);
    return feedbackOf(grade(exercise, answer), answer, state === 'wrong' ? { heartLost: true, willRetry: true } : {});
  }, [exercise, state]);
  const [draft, setDraft] = useState<Answer | null>(null);
  const [checked, setChecked] = useState<SessionFeedback | null>(null);
  const [primary, setPrimary] = useState<PrimaryAction | null>(null);
  const [round, setRound] = useState(0);
  const shown = fixed ?? checked;
  const submit = (answer: Answer) => setChecked(feedbackOf(grade(exercise, answer), answer));
  return (
    <div className={cx(styles.preview, shown && styles[`preview-${shown.result.correct ? 'ok' : 'bad'}`])} data-preview={`${exercise.type}-${state}`}>
      <ExerciseFrame
        key={round}
        exercise={exercise}
        presentation={presentation}
        review={shown ? { result: shown.result, answer: shown.answer } : null}
        attempt={0}
        alternative={false}
        onDraft={setDraft}
        onSubmit={submit}
        setPrimary={setPrimary}
        onCantPlay={() => undefined}
        onMicUnavailable={() => undefined}
        hints={false}
        level="beginner"
        naming={naming}
        uid={`kit-${exercise.type}-${state}`}
      />
      <div className={styles.previewBar}>
        {shown ? (
          <>
            <FeedbackPanel exercise={exercise} feedback={shown} seed={seed} combo={0} />
            {!fixed && (
              <Button
                size="sm"
                onClick={() => {
                  setChecked(null);
                  setDraft(null);
                  setRound((r) => r + 1);
                }}
              >
                Try again
              </Button>
            )}
          </>
        ) : primary ? (
          <Button variant="primary" iconLeft={primary.icon} onClick={primary.onClick} disabled={primary.disabled}>
            {primary.label}
          </Button>
        ) : exercise.type === 'flashcard' ? null : (
          <Button variant="primary" disabled={!isCheckable(draft)} onClick={() => draft && submit(draft)}>
            Check
          </Button>
        )}
      </div>
    </div>
  );
}

function TypeBlock({ type }: { type: ExerciseType }) {
  const exercise = EXERCISE_EXAMPLES[type];
  return (
    <Section title={type} description={exerciseKindLabel(exercise)} level={3} data-type-block={type} actions={<LinkButton size="sm" variant="ghost" to="kit-lessons" params={['try', type]} iconRight="ArrowRight">Try in the player</LinkButton>}>
      <Grid min="20rem" gap={4}>
        {(['fresh', 'right', 'wrong'] as const).map((state) => (
          <Stack key={state} gap={2}>
            <Text variant="eyebrow">{state === 'fresh' ? 'Fresh' : state === 'right' ? 'Answered right' : 'Answered wrong'}</Text>
            <StepPreview exercise={exercise} state={state} />
          </Stack>
        ))}
      </Grid>
    </Section>
  );
}

// ── Sections ───────────────────────────────────────────────────────────────────────────────────

function ExercisesSection({ only }: { only?: ExerciseType }) {
  return (
    <Section title="Exercises" description="Every exercise type of the lesson engine, as it looks before an answer, after a right one and after a wrong one." divided>
      <Stack gap={10}>{(only ? [only] : TYPES).map((t) => <TypeBlock key={t} type={t} />)}</Stack>
    </Section>
  );
}

/**
 * The options of the second integration pass, each answered wrong (so the feedback shows) and
 * fresh, plus the figures and the card that had trouble on phones.
 */
function OptionsSection() {
  return (
    <Section title="Options" description="Play steps by place, from a staff or with the box hidden; chord boxes and rhythms as options; strings in fretboard-find; long match words; spelled phrases; figures sized for phones." divided>
      <Stack gap={8}>
        <div className={styles.frame} data-option-card="">
          <TeachingCard card={OPTION_CARD} />
        </div>
        <Grid min="18rem" gap={6}>
          {Object.entries(OPTION_FIGURES).map(([id, figure]) => (
            <div key={id} className={styles.frame} data-option-figure={id}>
              <Text variant="eyebrow">{id}</Text>
              <FigureView figure={figure} />
            </div>
          ))}
        </Grid>
        {Object.entries(OPTION_EXERCISES).map(([id, exercise]) => (
          <Section key={id} title={id} description={exerciseKindLabel(exercise)} level={3} data-option-block={id} actions={<LinkButton size="sm" variant="ghost" to="kit-lessons" params={['try', `opt-${id}`]} iconRight="ArrowRight">Try in the player</LinkButton>}>
            <Grid min="20rem" gap={4}>
              {(['fresh', 'wrong'] as const).map((state) => (
                <Stack key={state} gap={2}>
                  <Text variant="eyebrow">{state === 'fresh' ? 'Fresh' : 'Answered wrong'}</Text>
                  <StepPreview exercise={exercise} state={state} />
                </Stack>
              ))}
            </Grid>
          </Section>
        ))}
      </Stack>
    </Section>
  );
}

function CardsSection() {
  const lesson = findLesson(DEMO_COURSE, 'open-strings')!.lesson;
  const cards = lesson.steps.filter((s): s is Extract<typeof s, { type: 'card' }> => 'type' in s && s.type === 'card');
  return (
    <Section title="Teaching cards" description="Text, a figure from data, a tip, read-aloud, and a swipe or arrow key to move on. With a teacher, their avatar and name." divided>
      <Grid min="24rem" gap={6}>
        <div className={styles.frame}>
          <LessonProvider course={DEMO_COURSE}>
            <TeachingCard card={cards[0]} />
          </LessonProvider>
        </div>
        <div className={styles.frame}>
          <LessonProvider course={MIA_DEMO}>
            <TeachingCard card={cards[1] ?? cards[0]} />
          </LessonProvider>
        </div>
      </Grid>
    </Section>
  );
}

function FiguresSection() {
  return (
    <Section title="Figures" description="Every figure kind, drawn from lesson data by the shared music kit." divided>
      <Grid min="18rem" gap={6}>
        {Object.entries(FIGURE_EXAMPLES).map(([kind, figure]) => (
          <div key={kind} className={styles.frame} data-figure-kind={kind}>
            <Text variant="eyebrow">{kind}</Text>
            <LessonProvider course={DEMO_COURSE}>
              <FigureView figure={figure} />
            </LessonProvider>
          </div>
        ))}
      </Grid>
    </Section>
  );
}

function FeedbackSection() {
  const ex = EXERCISE_EXAMPLES.choice;
  const wrong = wrongAnswer(ex);
  const right = rightAnswer(ex);
  const rows: Array<{ label: string; tone: string; fb: SessionFeedback }> = [
    { label: 'Right', tone: 'ok', fb: feedbackOf(grade(ex, right), right) },
    { label: 'Wrong, a heart used, it comes back', tone: 'bad', fb: feedbackOf(grade(ex, wrong), wrong, { heartLost: true, willRetry: true }) },
    { label: 'Skipped', tone: 'info', fb: { ...feedbackOf(grade(ex, right), null), skipped: true, result: { ...grade(ex, right), correct: false, score: 0 } } },
  ];
  return (
    <Section title="Feedback" description="The panel that slides up from the bottom bar after Check." divided>
      <Grid min="20rem" gap={4}>
        {rows.map((r) => (
          <Stack key={r.label} gap={2}>
            <Text variant="eyebrow">{r.label}</Text>
            <div className={cx(styles.barSample, styles[`bar-${r.tone}`])}>
              <LessonProvider course={DEMO_COURSE}>
                <FeedbackPanel exercise={ex} feedback={r.fb} seed={2} combo={r.tone === 'ok' ? 4 : 0} />
              </LessonProvider>
            </div>
          </Stack>
        ))}
      </Grid>
    </Section>
  );
}

function MapSection() {
  return (
    <Section title="Course map" description="The demo course on your own progress. Lessons you play here count like any other." divided>
      <ReviewEntry courses={[DEMO_COURSE]} onStart={() => navigate('kit-lessons', 'review-session')} />
      <CourseMap
        course={DEMO_COURSE}
        autoScroll={false}
        onStartLesson={(_u, lessonId) => navigate('kit-lessons', 'play', lessonId)}
        onStartCheckpoint={(unitId) => navigate('kit-lessons', 'checkpoint', unitId)}
        onPractice={(unitId) => navigate('kit-lessons', 'practice', unitId)}
      />
    </Section>
  );
}

function LessonsSection() {
  const first = DEMO_COURSE.units[0].lessons[0];
  return (
    <Section title="Demo lessons" description="Real sessions of the demo course in the player: hearts, come-backs, the summary, saving and resuming." divided actions={<LinkButton variant="primary" to="kit-lessons" params={['play', first.id]} iconLeft="Play" wrap>Play the demo lesson</LinkButton>}>
      <Grid min="16rem" gap={3}>
        {DEMO_COURSE.units.flatMap((u) => u.lessons).map((l) => (
          <LinkButton key={l.id} to="kit-lessons" params={['play', l.id]} iconLeft="BookOpen" className={styles.lessonLink}>
            {l.title}
          </LinkButton>
        ))}
        {DEMO_COURSE.units.map((u) => (
          <LinkButton key={`cp-${u.id}`} to="kit-lessons" params={['checkpoint', u.id]} iconLeft="Trophy" variant="ghost">
            Checkpoint: {u.title}
          </LinkButton>
        ))}
        {DEMO_COURSE.units.map((u) => (
          <LinkButton key={`pr-${u.id}`} to="kit-lessons" params={['practice', u.id]} iconLeft="Dumbbell" variant="ghost">
            Practice: {u.title}
          </LinkButton>
        ))}
      </Grid>
    </Section>
  );
}

// ── Sessions ───────────────────────────────────────────────────────────────────────────────────

/** The exercise a `try` link names: an exercise type's example, or an option sample (`opt-<id>`). */
function tryExercise(id: string): Exercise | null {
  if ((TYPES as string[]).includes(id)) return EXERCISE_EXAMPLES[id as ExerciseType];
  return id.startsWith('opt-') ? (OPTION_EXERCISES[id.slice(4)] ?? null) : null;
}

function tryCourse(id: string): Course {
  const exercise = tryExercise(id)!;
  const type = id;
  return {
    id: `try-${type}`,
    title: 'Try an exercise',
    teacher: 'none',
    level: 'beginner',
    units: [{ id: 'try', title: 'Try', theme: 'basics', description: 'One exercise.', lessons: [{ id: `try-${type}`, title: exerciseKindLabel(exercise), teaches: 'One exercise type.', minutes: 2, skill: `theory:try:try-${type}`, steps: [exercise] }] }],
  };
}

function SessionScreen({ kind, id }: { kind: string; id: string }) {
  const port = useMemo(() => (kind === 'try' ? memoryPort() : undefined), [kind]);
  const source: SessionSource | null = useMemo(() => {
    if (kind === 'play') return findLesson(DEMO_COURSE, id) ? { mode: 'lesson', course: DEMO_COURSE, lessonId: id } : null;
    // An unknown unit would open an empty session ("All done", +0 XP): say it is not there instead.
    const unit = DEMO_COURSE.units.some((u) => u.id === id);
    if (kind === 'checkpoint') return unit ? { mode: 'checkpoint', course: DEMO_COURSE, unitId: id } : null;
    if (kind === 'practice') return unit ? { mode: 'practice', course: DEMO_COURSE, unitId: id } : null;
    if (kind === 'review-session') return reviewSource([DEMO_COURSE], getProgress(), Date.now());
    if (kind === 'try' && tryExercise(id)) {
      const course = tryCourse(id);
      return { mode: 'lesson', course, lessonId: course.units[0].lessons[0].id };
    }
    return null;
  }, [kind, id]);
  if (!source) {
    return (
      <Page title="Not found" back={{ to: 'kit-lessons', label: 'Lesson Kit' }}>
        <Stack gap={4}>
          <Text>{id ? `There is no demo lesson or unit called “${id}”.` : 'That link does not say which lesson to open.'}</Text>
          <div>
            <LinkButton variant="primary" to="kit-lessons" params={['lessons']} iconLeft="BookOpen">
              Choose a demo lesson
            </LinkButton>
          </div>
        </Stack>
      </Page>
    );
  }
  const onNext = (step: NextStep) => {
    if (step.kind === 'lesson') navigate('kit-lessons', 'play', step.lessonId);
    else if (step.kind === 'practice') navigate('kit-lessons', 'practice', step.unitId);
    else navigate('kit-lessons', kind === 'try' ? 'exercises' : 'map');
  };
  return (
    <LessonPlayer
      key={`${kind}:${id}`}
      source={source}
      port={port}
      persist={kind !== 'try'}
      route="kit-lessons"
      params={kind === 'review-session' ? [kind] : [kind, id]}
      onExit={() => navigate('kit-lessons', kind === 'try' ? 'exercises' : 'map')}
      onNext={onNext}
      exitLabel={kind === 'try' ? 'Back to the gallery' : 'Back to the path'}
    />
  );
}

// ── The gallery ────────────────────────────────────────────────────────────────────────────────

const SESSION_KINDS = new Set(['play', 'checkpoint', 'practice', 'review-session', 'try']);

/** The lesson gallery. */
export default function KitLessons({ params }: RouteProps) {
  const [first, second] = params;
  if (first && SESSION_KINDS.has(first)) return <SessionScreen kind={first} id={second ?? ''} />;
  const section = (SECTIONS.find((s) => s.id === first)?.id ?? (first === 'type' ? 'exercises' : null)) as SectionId | null;
  const onlyType = first === 'type' && second && (TYPES as string[]).includes(second) ? (second as ExerciseType) : undefined;
  const show = (id: SectionId): boolean => section === null || section === id;
  const nav: ReactNode = (
    <nav className={styles.nav} aria-label="Gallery sections">
      <LinkButton size="sm" variant={section === null ? 'secondary' : 'ghost'} to="kit-lessons">
        All
      </LinkButton>
      {SECTIONS.map((s) => (
        <LinkButton key={s.id} size="sm" variant={section === s.id ? 'secondary' : 'ghost'} to="kit-lessons" params={[s.id]}>
          {s.label}
        </LinkButton>
      ))}
    </nav>
  );
  return (
    <Page
      title="Lesson Kit"
      eyebrow="Sixstring Academy"
      subtitle="The lesson player's parts: every exercise type, teaching cards, figures, feedback, the course map and the demo course."
      actions={<LinkButton variant="primary" to="kit-lessons" params={['play', DEMO_COURSE.units[0].lessons[0].id]} iconLeft="Play" wrap>Play the demo lesson</LinkButton>}
    >
      {nav}
      <LessonProvider course={DEMO_COURSE}>
        {show('lessons') && <LessonsSection />}
        {show('map') && <MapSection />}
        {show('exercises') && <ExercisesSection only={onlyType} />}
        {show('options') && <OptionsSection />}
        {show('cards') && <CardsSection />}
        {show('feedback') && <FeedbackSection />}
        {show('figures') && <FiguresSection />}
      </LessonProvider>
      <Heading level={2} size="sm" tone="muted" className="sr-only">
        End of the gallery
      </Heading>
    </Page>
  );
}
