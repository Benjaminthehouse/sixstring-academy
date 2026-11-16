/**
 * Today's plan: three to five suggested steps for one balanced practice session, chosen from the
 * learner's level, sized to their daily goal, and varied a little from day to day so it never
 * reads like a chore list. The lesson path (tune, theory, the teacher, due reviews) is fixed; the
 * drill and the music come from the practice planner (`suggestPracticePlan`), which knows what is
 * getting rusty, what was neglected this week and the learner's focus goals. Pure: the screen
 * passes in what it read from the progress store.
 */
import { dayNumber, xpFor, type ActivityKind, type DayKey, type ExperienceLevel, type RecentItem, type TeacherId } from '@/core/progress';
import { ROUTE_BY_NAME } from '@/app/routes';
import { teacherById } from '@/app/teachers';
import type { PlanBlock } from '@/features/practice/model/planner';

/** One suggested step. */
export interface PlanStep {
  id: string;
  route: string;
  params: string[];
  /** What to do, starting with a verb. */
  title: string;
  /** One line of why or how. */
  detail: string;
  /** lucide icon name. */
  icon: string;
  /** Rough time it takes. */
  minutes: number;
  /** Rough XP it earns. */
  xp: number;
  /** Activity kinds that count as having done this step today. */
  kinds: readonly ActivityKind[];
  done: boolean;
}

/** What the plan is built from. */
export interface PlanContext {
  experience: ExperienceLevel;
  teacher: TeacherId;
  dailyGoalXp: number;
  today: DayKey;
  /** Kinds of activity already recorded today. */
  doneKinds: ReadonlySet<ActivityKind>;
  /** Review cards due now. */
  dueReviews: number;
  /** Newest first. */
  recents: readonly RecentItem[];
  /** The practice planner's blocks for the day's minutes (`suggestPracticePlan`): they fill the drill and music steps. */
  practice?: readonly PlanBlock[];
}

type StepId = 'tune' | 'theory' | 'teacher' | 'review' | 'chords' | 'rhythm' | 'fretboard' | 'arcade' | 'scales' | 'ear' | 'technique' | 'progressions' | 'song';

interface StepTemplate {
  route: string;
  title: string;
  detail: string;
  minutes: number;
  xp: number;
  kinds: readonly ActivityKind[];
  /** Icon when the route's own would mislead (two steps share a route). */
  icon?: string;
}

const STEPS: Readonly<Record<StepId, StepTemplate>> = {
  tune: { route: 'tuner', title: 'Tune up', detail: 'Six strings, under a minute.', minutes: 1, xp: 5, kinds: ['tuner'] },
  theory: { route: 'learn', title: 'Do one theory lesson', detail: 'The next small step on the Theory Path.', minutes: 3, xp: 10, kinds: ['theory-lesson'] },
  teacher: { route: 'teachers', title: 'Take your next lesson', detail: '', minutes: 8, xp: 15, kinds: ['teacher-lesson'] },
  review: { route: 'learn', title: 'Review your cards', detail: 'Keeps what you learned from fading.', minutes: 2, xp: 8, kinds: ['review'], icon: 'Brain' },
  chords: { route: 'chords', title: 'Practise a chord change', detail: 'Two chords, back and forth, slowly.', minutes: 3, xp: 6, kinds: ['chord-practice', 'chord-change'] },
  rhythm: { route: 'rhythm', title: 'Strum a pattern in time', detail: 'Keep the hand swinging with the click.', minutes: 3, xp: 6, kinds: ['rhythm'] },
  fretboard: { route: 'fretboard', title: 'Name notes on the neck', detail: 'One string at a time.', minutes: 2, xp: 6, kinds: ['fretboard'] },
  arcade: { route: 'arcade', title: 'Play a scale game', detail: 'One short round for your fingers.', minutes: 2, xp: 8, kinds: ['scale-game'] },
  scales: { route: 'scales', title: 'Run a scale with the click', detail: 'Up and down, evenly, not fast.', minutes: 4, xp: 8, kinds: ['scale-practice'] },
  ear: { route: 'ear', title: 'Train your ear', detail: 'One round of intervals or chords.', minutes: 3, xp: 6, kinds: ['ear'] },
  technique: { route: 'technique', title: 'Climb a tempo ladder', detail: 'One exercise, clean, a little faster each pass.', minutes: 4, xp: 8, kinds: ['technique'] },
  progressions: { route: 'progressions', title: 'Jam over a progression', detail: 'Pick a style and play with the band.', minutes: 5, xp: 10, kinds: ['progression'] },
  song: { route: 'songs', title: 'Play a song', detail: 'The reason for all of the above.', minutes: 5, xp: 12, kinds: ['song'] },
};

/**
 * The five slots of a session per level: tune, study, lesson, drill, music. A slot with several
 * options rotates through them by day.
 */
export const PLAN_SLOTS: Readonly<Record<ExperienceLevel, ReadonlyArray<readonly StepId[]>>> = {
  beginner: [['tune'], ['theory'], ['teacher'], ['chords', 'rhythm', 'fretboard'], ['song']],
  intermediate: [['tune'], ['theory'], ['teacher'], ['arcade', 'scales', 'fretboard', 'ear'], ['progressions', 'song']],
  expert: [['tune'], ['ear', 'theory'], ['teacher'], ['technique', 'arcade', 'scales'], ['progressions', 'song']],
};

/** How many steps a daily goal asks for: 3 for a casual goal, 4 for a regular one, 5 above that. */
export function planLength(dailyGoalXp: number): 3 | 4 | 5 {
  if (dailyGoalXp <= 10) return 3;
  return dailyGoalXp <= 20 ? 4 : 5;
}

/** Which of the five slots a plan of `length` steps uses on a given day. */
export function slotsForLength(length: 3 | 4 | 5, day: number): number[] {
  // Shorter plans alternate between the drill and the music slot, so both come round.
  const alternate = day % 2 === 0 ? 3 : 4;
  if (length === 3) return [0, 1, alternate];
  if (length === 4) return [0, 1, 2, alternate];
  return [0, 1, 2, 3, 4];
}

/** What counts as having done a step on each screen the practice planner sends the learner to. */
const KINDS_BY_ROUTE: Readonly<Record<string, readonly ActivityKind[]>> = {
  tuner: ['tuner'],
  learn: ['theory-lesson', 'review'],
  teachers: ['teacher-lesson'],
  chords: ['chord-practice', 'chord-change'],
  rhythm: ['rhythm'],
  fretboard: ['fretboard'],
  arcade: ['scale-game'],
  scales: ['scale-practice', 'scale-game'],
  ear: ['ear'],
  technique: ['technique'],
  progressions: ['progression'],
  songs: ['song'],
  play: ['song'],
  metronome: ['metronome'],
};

/** Areas of the practice planner that fill the drill slot, and the one that fills the music slot. */
const DRILL_AREAS: ReadonlySet<PlanBlock['area']> = new Set(['technique', 'scales', 'chords', 'rhythm', 'ear', 'theory']);
const MUSIC_AREA: PlanBlock['area'] = 'repertoire';
/** Screens the fixed part of the plan already sends the learner to: a drill there would repeat a step. */
const LESSON_ROUTES: ReadonlySet<string> = new Set(['tuner', 'learn', 'teachers']);

/** A Today step made from a practice-planner block; null when the block has no screen this plan can count. */
export function stepFromBlock(block: PlanBlock, doneKinds: ReadonlySet<ActivityKind>): PlanStep | null {
  const target = block.target;
  if (!target || !ROUTE_BY_NAME[target.route]) return null;
  const kinds = KINDS_BY_ROUTE[target.route];
  if (!kinds) return null;
  const firstLine = block.goal.split(/(?<=\.)\s/)[0] ?? block.goal;
  return {
    id: `practice-${block.id}`,
    route: target.route,
    params: [...target.params],
    title: block.title,
    detail: block.reason ?? firstLine,
    icon: ROUTE_BY_NAME[target.route]?.icon ?? 'Circle',
    minutes: block.minutes,
    xp: xpFor(kinds[0], { durationSec: block.minutes * 60, accuracy: 0.8 }),
    kinds,
    done: kinds.some((kind) => doneKinds.has(kind)),
  };
}

function unfinished(recents: readonly RecentItem[], route: string): RecentItem | undefined {
  return recents.find((r) => r.route === route && r.fraction < 1 && r.params.length > 0);
}

/** Build today's plan. Three to five steps, each a real screen of the app. */
export function buildPlan(ctx: PlanContext): PlanStep[] {
  const day = dayNumber(ctx.today);
  const slots = PLAN_SLOTS[ctx.experience];
  const slotIds = slotsForLength(planLength(ctx.dailyGoalXp), day);
  const ids: StepId[] = slotIds.map((slot) => {
    const options = slots[slot];
    return options[day % options.length];
  });
  /** Which of the five slots each step fills (-1: the review step). */
  const slotOf: number[] = [...slotIds];

  // Cards that are due come right after tuning; a full plan gives up its drill to make room.
  const reviewing = ctx.dueReviews > 0 || ctx.doneKinds.has('review');
  if (reviewing) {
    ids.splice(1, 0, 'review');
    slotOf.splice(1, 0, -1);
    if (ids.length > 5) {
      ids.splice(4, 1);
      slotOf.splice(4, 1);
    }
  }

  // The drill and the music the practice planner picked for today, when it picked them.
  const used = new Set<string>();
  const fromPlanner = (want: (b: PlanBlock) => boolean): PlanStep | null => {
    for (const block of ctx.practice ?? []) {
      if (used.has(block.id) || !want(block)) continue;
      const step = stepFromBlock(block, ctx.doneKinds);
      if (step) {
        used.add(block.id);
        return step;
      }
    }
    return null;
  };

  const teacher = teacherById(ctx.teacher);
  return ids.map((id, index) => {
    const slot = slotOf[index];
    const planned =
      slot === 3
        ? fromPlanner((b) => DRILL_AREAS.has(b.area) && !LESSON_ROUTES.has(b.target?.route ?? ''))
        : slot === 4
          ? fromPlanner((b) => b.area === MUSIC_AREA && !LESSON_ROUTES.has(b.target?.route ?? ''))
          : null;
    if (planned) return planned;
    const template = STEPS[id];
    let { title, detail } = template;
    let params: string[] = [];
    // A lesson that was opened but not finished does not count as the step being done.
    let halfDone = false;
    if (id === 'teacher') {
      const open = unfinished(ctx.recents, 'teachers');
      halfDone = !!open;
      params = open ? open.params : [teacher.id];
      title = open ? `Continue “${open.title}”` : `Take ${teacher.first}'s next lesson`;
      detail = open ? `Your lesson with ${teacher.first}, where you left it.` : teacher.course;
    } else if (id === 'theory') {
      const open = unfinished(ctx.recents, 'learn');
      halfDone = !!open;
      if (open) {
        params = open.params;
        title = `Finish “${open.title}”`;
        detail = 'The theory lesson you started.';
      }
    } else if (id === 'review' && ctx.dueReviews > 0) {
      title = `Review ${ctx.dueReviews} ${ctx.dueReviews === 1 ? 'card' : 'cards'}`;
    }
    return {
      id,
      route: template.route,
      params,
      title,
      detail,
      icon: template.icon ?? ROUTE_BY_NAME[template.route]?.icon ?? 'Circle',
      minutes: id === 'review' && ctx.dueReviews > 0 ? Math.max(1, Math.round(ctx.dueReviews / 6)) : template.minutes,
      xp: template.xp,
      kinds: template.kinds,
      done: !halfDone && template.kinds.some((kind) => ctx.doneKinds.has(kind)),
    };
  });
}

/** The first step still to do, or null when the plan is finished. */
export function nextStep(plan: readonly PlanStep[]): PlanStep | null {
  return plan.find((s) => !s.done) ?? null;
}

/** Minutes the steps still to do add up to. */
export function minutesLeft(plan: readonly PlanStep[]): number {
  return plan.reduce((sum, s) => sum + (s.done ? 0 : s.minutes), 0);
}
