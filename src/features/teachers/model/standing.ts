/**
 * Where the learner stands with each teacher, read from progress alone (no course content needs
 * loading): lessons done out of the whole plan, when they last had a lesson, and which teacher to
 * recommend. Pure: unit-tested.
 */
import type { ExperienceLevel, ProgressState } from '@/core/progress';
import { TEACHER_KEYS, type CourseOutline, type TeacherKey } from '@/content/teachers';

/** One teacher's course, as far as the learner has got. */
export interface CourseStanding {
  teacher: TeacherKey;
  /** Lessons of the plan the learner has completed. */
  done: number;
  /** Lessons in the whole plan. */
  total: number;
  /** Most recent lesson activity with this teacher (epoch ms), or null. */
  lastAt: number | null;
  /** The first lesson of the plan not done yet, as `[unitId, slug, title]`, or null when all are. */
  next: { unitId: string; lessonId: string; title: string } | null;
  finished: boolean;
}

/** The standing in one course. */
export function courseStanding(state: Pick<ProgressState, 'skills'>, outline: CourseOutline): CourseStanding {
  let done = 0;
  let total = 0;
  let lastAt: number | null = null;
  let next: CourseStanding['next'] = null;
  for (const unit of outline.units) {
    for (const [slug, title] of unit.lessons) {
      total++;
      const skill = state.skills[`teacher:${outline.id}:${slug}`];
      if (skill?.lastAt && (lastAt === null || skill.lastAt > lastAt)) lastAt = skill.lastAt;
      if (skill?.completed) done++;
      else if (!next) next = { unitId: unit.id, lessonId: slug, title };
    }
  }
  return { teacher: outline.id, done, total, lastAt, next, finished: total > 0 && done === total };
}

/** Lessons a learner can take now: those of the units written so far (`writtenUnitIds`). */
export function lessonsReady(outline: CourseOutline, written: readonly string[]): number {
  return outline.units.filter((u) => written.includes(u.id)).reduce((n, u) => n + u.lessons.length, 0);
}

/** Why a teacher is recommended. */
export type RecommendReason = 'continue' | 'level' | 'next-course';

/** The teacher to suggest first. */
export interface Recommendation {
  teacher: TeacherKey;
  reason: RecommendReason;
  /** One plain sentence for the learner. */
  because: string;
}

const LEVEL_TEACHER: Record<ExperienceLevel, TeacherKey> = { beginner: 'mia', intermediate: 'dev', expert: 'elena' };
const LEVEL_WORDS: Record<ExperienceLevel, string> = {
  beginner: 'You told us you are new to the guitar.',
  intermediate: 'You told us you know your open chords.',
  expert: 'You told us you already play well.',
};
/** The same, for a learner who has not told us (the first-run questions were skipped): no claim about them. */
const LEVEL_GUESS: Record<ExperienceLevel, string> = {
  beginner: 'New to the guitar? This is where everyone starts.',
  intermediate: 'Know your open chords? This is the next step.',
  expert: 'Already play well? This is the course for you.',
};
const NAMES: Record<TeacherKey, string> = { mia: 'Mia', dev: 'Dev', elena: 'Prof. Varga' };

/**
 * Who to learn with: the teacher of the course in progress (the most recent one, if it is not
 * finished), else the teacher for the learner's level, moved on past any course already finished.
 * `told` is false while the learner has not given their level (it is then only the default), so
 * the reason does not say "you told us".
 */
export function recommendTeacher(experience: ExperienceLevel, standings: readonly CourseStanding[], told = true): Recommendation {
  const by = new Map(standings.map((s) => [s.teacher, s]));
  const active = standings.filter((s) => s.lastAt !== null && !s.finished).sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))[0];
  if (active) return { teacher: active.teacher, reason: 'continue', because: `You are learning with ${NAMES[active.teacher]}: ${active.done} of ${active.total} lessons done.` };
  const start = TEACHER_KEYS.indexOf(LEVEL_TEACHER[experience] ?? 'mia');
  for (let i = start; i < TEACHER_KEYS.length; i++) {
    const t = TEACHER_KEYS[i];
    if (!by.get(t)?.finished) {
      if (i === start) return { teacher: t, reason: 'level', because: (told ? LEVEL_WORDS : LEVEL_GUESS)[experience] ?? LEVEL_GUESS.beginner };
      return { teacher: t, reason: 'next-course', because: `You finished ${NAMES[TEACHER_KEYS[i - 1]]}'s course. ${NAMES[t]} takes it from there.` };
    }
  }
  return { teacher: TEACHER_KEYS[TEACHER_KEYS.length - 1], reason: 'level', because: 'You have finished every course. Revisit any lesson you like.' };
}
