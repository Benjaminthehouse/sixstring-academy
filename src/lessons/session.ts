/**
 * The lesson session: a pure reducer plus selectors. One session is one sitting: a lesson, a
 * checkpoint quiz, a "practise this unit" drill, or a review of due cards.
 *
 *   const state = createSession({ mode: 'lesson', course, lessonId }, { seed, now, hearts });
 *   const { state: next, effects } = reduceSession(state, { type: 'answer', answer, at });
 *   applyEffects(effects);            // effects.ts maps them onto the real progress store
 *
 * The state is plain JSON and holds everything it needs (the steps themselves, not references to
 * the course), so an unfinished session can be saved and restored as it is. The reducer never
 * touches the progress store: it only says what should happen (`SessionEffect`).
 *
 * Rules, as language-learning apps have taught everyone to expect:
 *   - a wrong exercise comes back later in the same session until it is answered right, but at
 *     most `MAX_RETRIES` times each and `MAX_REQUEUES` times per session, so nobody gets trapped;
 *   - hearts are lost on wrong answers in lessons only (never in checkpoints, practice or review,
 *     never when hearts are switched off); running out ends the lesson kindly and offers practice;
 *   - a checkpoint is a test: no second tries, and more than its allowed mistakes fails it;
 *   - a play exercise is swapped for its non-microphone alternative when the microphone is
 *     unavailable or the learner taps "I can't play right now".
 */
import { applyAttempt, xpFor, type ActivityInput, type ActivityKind, type MasteryLevel, type ReviewGrade, type SkillRecord } from '@/core/progress';
import type { NoteNaming } from '@/core/theory';
import { nextDifficulty, START_DIFFICULTY } from './adaptive';
import { generateExercise, isGenerated } from './generators';
import { grade, presentExercise, promptOf, solve, type Presentation } from './grade';
import { createRng, hashSeed } from './rng';
import { plainText } from './text';
import type {
  Answer, CardStep, Course, CourseLevel, Exercise, ExerciseStep, ExerciseType, Fact, FlashcardExercise, GradeResult, Lesson, Step, Unit,
} from './types';

// ── Constants ──────────────────────────────────────────────────────────────────────────────────

/** How many times one exercise may come back after a wrong answer. */
export const MAX_RETRIES = 2;
/** How many come-backs one session allows in total. */
export const MAX_REQUEUES = 8;
/** A wrong exercise returns after this many other steps (or at the end, when fewer are left). */
export const REQUEUE_GAP = 3;
/** Mistakes a checkpoint allows unless it says otherwise. */
export const CHECKPOINT_MISTAKES = 3;
/** Exercises drawn for a checkpoint without authored steps, and for a practice drill. */
export const DEFAULT_DRILL_SIZE = 10;
/** Cards in a review session unless asked otherwise. */
export const DEFAULT_REVIEW_SIZE = 20;
/** Time on one step that counts as practice; longer means the learner walked away. */
export const MAX_STEP_MS = 90_000;
/** The `kind` of the spaced-repetition cards lessons create. */
export const FACT_CARD_KIND = 'theory-fact';
/** Current version of the saved session format. */
export const SESSION_VERSION = 1;

const PLAY_TYPES: ReadonlySet<string> = new Set(['play-note', 'play-chord', 'play-phrase']);

// ── Types ──────────────────────────────────────────────────────────────────────────────────────

/** What kind of sitting this is. */
export type SessionMode = 'lesson' | 'checkpoint' | 'practice' | 'review';

/** How a session ended. */
export type SessionOutcome = 'completed' | 'out-of-hearts' | 'failed' | 'quit';

/** What to run. */
export type SessionSource =
  | { mode: 'lesson'; course: Course; lessonId: string }
  | { mode: 'checkpoint'; course: Course; unitId: string }
  /** A drill drawn from a unit's lessons (all of them, or `lessonIds`). */
  | { mode: 'practice'; course: Course; unitId: string; lessonIds?: string[]; size?: number }
  /** A review of spaced-repetition cards: pass the due cards (`dueReviews`) and every course they may come from. */
  | { mode: 'review'; courses: Course[]; cards: ReadonlyArray<{ id: string }>; size?: number };

/** Everything about the learner and the moment that the pure session needs to be told. */
export interface SessionOptions {
  /** Seed for everything random in the session. Use a fresh number per session (for example `Date.now()`). */
  seed: number;
  /** Start time, epoch ms. */
  now: number;
  /** Hearts the learner has now; `null` when hearts are switched off. Only lessons use them. */
  hearts?: number | null;
  /** False when the microphone is unavailable: play exercises start as their alternatives. Default true. */
  mic?: boolean;
  /** Starting difficulty for generated exercises, 0 to 1 (see `startingDifficulty`). Default: by course level. */
  difficulty?: number;
  /** The lesson's skill record (`null` for a lesson never tried), so the summary can say whether a crown was earned. */
  skill?: SkillRecord | null;
  /** The learner's note naming, so typed answers such as "H" or "Do" are understood. */
  naming?: NoteNaming;
  /** Route and params that reopen this session; stored with the activity for "continue where you left off". */
  route?: string;
  params?: string[];
}

/** One step in the queue. */
export interface SessionItem {
  /** Stable id of the step inside this session (`s0`, `s1` ...); a step that comes back keeps it. */
  key: string;
  /** The step as authored. */
  step: Step;
  /** The literal exercise shown: set when the step is first reached (generated steps are made then). Null for cards. */
  exercise: Exercise | null;
  /** 0 the first time, 1 on the first come-back ... */
  attempt: number;
  /** True when a play exercise was replaced by its non-microphone alternative. */
  alt: boolean;
  /** True when the exercise came out of a generator (it then drives the adaptive difficulty). */
  generated: boolean;
  /** The lesson the step came from, when known. */
  lessonId: string | null;
  /** Review sessions: the spaced-repetition card this step grades. */
  cardId: string | null;
}

/** What is shown after an answer. */
export interface SessionFeedback {
  result: GradeResult;
  /** The answer given; null when the step was skipped. */
  answer: Answer | null;
  skipped: boolean;
  /** A heart was lost for this answer. */
  heartLost: boolean;
  /** This exercise will come back later in the session. */
  willRetry: boolean;
}

/** Running totals. */
export interface SessionStats {
  /** Different exercises answered (or skipped) at least once. */
  asked: number;
  /** Of those, answered right at the first attempt. */
  firstTry: number;
  /** Every answer given, come-backs included. */
  answers: number;
  right: number;
  /** Wrong answers and skips. */
  mistakes: number;
  skipped: number;
  /** Right answers in a row right now. */
  combo: number;
  bestCombo: number;
  /** Come-backs used. */
  requeued: number;
  /** Exercises left unsolved because the come-back caps were reached. */
  dropped: number;
}

/** The end-of-session summary. */
export interface SessionSummary {
  mode: SessionMode;
  outcome: SessionOutcome;
  title: string;
  /** Different exercises answered. */
  exercises: number;
  /** Share answered right at the first attempt, 0 to 1 (1 when nothing was asked). */
  accuracy: number;
  firstTry: number;
  mistakes: number;
  /** Finished without a single mistake. */
  perfect: boolean;
  bestCombo: number;
  durationSec: number;
  /** Guideline XP for this session before boosts (`xpFor`). `applyEffects` returns what was really awarded. */
  xp: number;
  /** Crowns of the lesson's skill before and after, when the skill record was given at the start. */
  crown: { before: MasteryLevel; after: MasteryLevel; gained: boolean } | null;
  /** Facts handed to spaced repetition. */
  factsAdded: number;
  /** Cards graded in a review. */
  cardsReviewed: number;
  /** Hearts left (null when hearts are not in play). */
  heartsLeft: number | null;
  /** Prompts of exercises that were never answered right, for "worth another look". */
  missed: string[];
  /** Lesson ids a passed checkpoint marked as done. */
  unlocked: string[];
  /**
   * The obvious next step: `continue` (on to the next thing), `practice` (out of hearts: a
   * practice session gives hearts back), `lessons` (checkpoint not passed: take the lessons),
   * `resume` (left early).
   */
  next: 'continue' | 'practice' | 'lessons' | 'resume';
}

/** The whole session. Plain JSON. */
export interface SessionState {
  v: number;
  mode: SessionMode;
  courseId: string | null;
  unitId: string | null;
  lessonId: string | null;
  title: string;
  /** The progress activity kind this session reports as. */
  kind: ActivityKind;
  /** Skill id advanced by finishing (lessons only). */
  skill: string | null;
  level: CourseLevel;
  naming: NoteNaming | null;
  route: string | null;
  params: string[];
  seed: number;
  /** Steps still to do; `queue[0]` is the current one. */
  queue: SessionItem[];
  /** Steps at the start (the length of the progress bar). */
  total: number;
  /** Steps finished for good. */
  cleared: number;
  phase: 'step' | 'feedback' | 'done';
  feedback: SessionFeedback | null;
  outcome: SessionOutcome | null;
  /** Hearts left, or null when this session does not use hearts. */
  hearts: number | null;
  /** Mistakes allowed (checkpoints), or null. */
  maxMistakes: number | null;
  stats: SessionStats;
  /** Per step key: attempts so far, whether the first one was right, whether it is solved. */
  results: Record<string, { attempts: number; firstTry: boolean; solved: boolean; type: ExerciseType; prompt: string }>;
  startedAt: number;
  /** When the current step was shown (or the session resumed). */
  stepStartedAt: number;
  /** Time that counts as practice so far, ms. */
  activeMs: number;
  paused: boolean;
  endedAt: number | null;
  /** Difficulty of the next generated exercise, 0 to 1. */
  difficulty: number;
  /** Play exercises are swapped for their alternatives. */
  micOff: boolean;
  /** Cards to add to spaced repetition when the session is completed. */
  facts: Array<{ id: string; kind: string; ref: string }>;
  /** Review: card ids graded so far. */
  graded: string[];
  /** Checkpoint: skill ids and lesson ids to mark done on a pass. */
  unlock: Array<{ lessonId: string; skill: string }>;
  /** Practice: skills whose remembered difficulty is updated at the end. */
  practiced: string[];
  /** The lesson's skill record at the start (for the crown in the summary); null for a skill never tried. */
  skillBefore: SkillRecord | null;
  /** False when no skill record was passed at the start: the summary then makes no crown prediction. */
  skillKnown: boolean;
  summary: SessionSummary | null;
}

/** Something the learner did. Every action carries the time it happened (`at`, epoch ms). */
export type SessionAction =
  /** Answer the current exercise. */
  | { type: 'answer'; answer: Answer; at: number }
  /** Give up on the current exercise: the answer is shown, no heart is lost, it comes back later. */
  | { type: 'skip'; at: number }
  /** Move on: from a card, or from the feedback of an answer. */
  | { type: 'continue'; at: number }
  /** "I can't play right now": swap the current play exercise for its alternative (`session`: and all later ones). */
  | { type: 'cant-play'; scope: 'step' | 'session'; at: number }
  /** The microphone became unavailable or available. */
  | { type: 'mic'; available: boolean; at: number }
  /** The learner left the screen / came back. Time away is not counted; `hearts` re-syncs the heart count. */
  | { type: 'pause'; at: number }
  | { type: 'resume'; at: number; hearts?: number | null }
  /** Leave for good. */
  | { type: 'quit'; at: number };

/** What should happen in the outside world. `applyEffects` (effects.ts) carries these out. */
export type SessionEffect =
  /** A wrong answer in a lesson: `loseHeart()`. */
  | { type: 'lose-heart' }
  /** The session ended: `recordActivity(input)`. */
  | { type: 'record-activity'; input: ActivityInput }
  /** A lesson was completed: `addReviewItems(items)`. */
  | { type: 'add-cards'; items: Array<{ id: string; kind: string; ref: string }> }
  /** A review card was answered: `gradeReview(id, grade)`. */
  | { type: 'grade-review'; id: string; grade: ReviewGrade }
  /** A checkpoint was passed: `markSkill(id, { completed: true, masteryAtLeast: 1 })`. */
  | { type: 'mark-skill'; id: string; completed: boolean; masteryAtLeast: MasteryLevel }
  /** Remember the adaptive difficulty on a skill that exists (`setSkillData`). */
  | { type: 'skill-data'; id: string; difficulty: number };

/** The result of one reducer step. */
export interface SessionStep {
  state: SessionState;
  effects: SessionEffect[];
}

// ── Finding things in a course ─────────────────────────────────────────────────────────────────

/** A lesson with its unit, or null. */
export function findLesson(course: Course, lessonId: string): { unit: Unit; lesson: Lesson } | null {
  for (const unit of course.units) {
    const lesson = unit.lessons.find((l) => l.id === lessonId);
    if (lesson) return { unit, lesson };
  }
  return null;
}

/** A unit by id, or null. */
export function findUnit(course: Course, unitId: string): Unit | null {
  return course.units.find((u) => u.id === unitId) ?? null;
}

/** The spaced-repetition card id of a lesson fact. */
export function factCardId(courseId: string, factId: string): string {
  return `${courseId}:${factId}`;
}

/** Where a fact card came from. */
export interface FactRef {
  course: Course;
  unit: Unit;
  lesson: Lesson;
  fact: Fact;
}

/** Every fact of the given courses by card id, for building reviews. */
export function factIndex(courses: readonly Course[]): Map<string, FactRef> {
  const index = new Map<string, FactRef>();
  for (const course of courses) {
    for (const unit of course.units) {
      for (const lesson of unit.lessons) {
        for (const fact of lesson.facts ?? []) index.set(factCardId(course.id, fact.id), { course, unit, lesson, fact });
      }
    }
  }
  return index;
}

/** The progress activity kind of a course: teacher courses report teacher lessons. */
export function activityKindOf(course: Pick<Course, 'teacher'>): ActivityKind {
  return course.teacher === 'none' ? 'theory-lesson' : 'teacher-lesson';
}

// ── Building queues ────────────────────────────────────────────────────────────────────────────

function isCard(step: Step): step is CardStep {
  return !isGenerated(step) && step.type === 'card';
}

function item(key: string, step: Step, lessonId: string | null, cardId: string | null = null): SessionItem {
  return { key, step, exercise: null, attempt: 0, alt: false, generated: isGenerated(step), lessonId, cardId };
}

/** A generated step without its authored seed, so a drill draws a fresh exercise every session. */
function unseeded(step: ExerciseStep): ExerciseStep {
  if (!isGenerated(step) || step.seed === undefined) return step;
  const { seed: _seed, ...rest } = step;
  return rest as ExerciseStep;
}

/** The exercise steps (no cards, no flashcards) of some lessons, each with the lesson it came from. */
function exercisesOf(lessons: readonly Lesson[]): Array<{ step: ExerciseStep; lessonId: string }> {
  const out: Array<{ step: ExerciseStep; lessonId: string }> = [];
  for (const lesson of lessons) {
    for (const step of lesson.steps) {
      if (isCard(step)) continue;
      if (!isGenerated(step) && step.type === 'flashcard') continue;
      out.push({ step, lessonId: lesson.id });
    }
  }
  return out;
}

/**
 * Draw `size` exercises spread evenly over the lessons: one from each lesson in turn, in a seeded
 * random order within a lesson. Generated steps may be drawn more than once (they differ each
 * time); literal ones only once.
 */
function drawExercises(lessons: readonly Lesson[], size: number, seed: number): Array<{ step: ExerciseStep; lessonId: string }> {
  const rng = createRng(seed);
  const perLesson = lessons.map((lesson) => rng.shuffle(exercisesOf([lesson]))).filter((list) => list.length > 0);
  if (perLesson.length === 0) return [];
  const out: Array<{ step: ExerciseStep; lessonId: string }> = [];
  const cursor = perLesson.map(() => 0);
  let stalled = 0;
  for (let turn = 0; out.length < size && stalled < perLesson.length; turn++) {
    const index = turn % perLesson.length;
    const list = perLesson[index];
    let picked: { step: ExerciseStep; lessonId: string } | null = null;
    if (cursor[index] < list.length) {
      picked = list[cursor[index]++];
    } else {
      // The lesson's exercises are used up: its generated ones can be asked again, afresh.
      const generated = list.filter((e) => isGenerated(e.step));
      if (generated.length > 0) picked = generated[cursor[index]++ % generated.length];
    }
    if (picked) {
      out.push({ step: unseeded(picked.step), lessonId: picked.lessonId });
      stalled = 0;
    } else {
      stalled++;
    }
  }
  return out;
}

/** A fact as a flashcard, for facts without an exercise of their own. */
export function flashcardOf(fact: Fact): FlashcardExercise {
  const card: FlashcardExercise = { type: 'flashcard', front: fact.front, back: fact.back };
  if (fact.figure) card.figure = fact.figure;
  return card;
}

// ── Creating a session ─────────────────────────────────────────────────────────────────────────

const EMPTY_STATS: SessionStats = { asked: 0, firstTry: 0, answers: 0, right: 0, mistakes: 0, skipped: 0, combo: 0, bestCombo: 0, requeued: 0, dropped: 0 };

function clampHearts(hearts: number | null | undefined): number | null {
  return typeof hearts === 'number' && Number.isFinite(hearts) ? Math.max(0, Math.floor(hearts)) : null;
}

/**
 * Start a session. The first step is ready at once (`currentStep(state)`). An unknown lesson or
 * unit, or a review with no known cards, gives a session that is already `done` with nothing in
 * it, so a screen can show its summary instead of crashing.
 */
export function createSession(source: SessionSource, options: SessionOptions): SessionState {
  const course = source.mode === 'review' ? (source.courses[0] ?? null) : source.course;
  const level: CourseLevel = course?.level ?? 'beginner';
  let queue: SessionItem[] = [];
  let title = '';
  let unitId: string | null = null;
  let lessonId: string | null = null;
  let skill: string | null = null;
  let kind: ActivityKind = course ? activityKindOf(course) : 'theory-lesson';
  let facts: SessionState['facts'] = [];
  let unlock: SessionState['unlock'] = [];
  let practiced: string[] = [];
  let maxMistakes: number | null = null;

  if (source.mode === 'lesson') {
    const found = findLesson(source.course, source.lessonId);
    if (found) {
      const { unit, lesson } = found;
      queue = lesson.steps.map((step, i) => item(`s${i}`, step, lesson.id));
      title = lesson.title;
      unitId = unit.id;
      lessonId = lesson.id;
      skill = lesson.skill;
      facts = (lesson.facts ?? []).map((fact) => ({ id: factCardId(source.course.id, fact.id), kind: FACT_CARD_KIND, ref: lesson.id }));
    }
  } else if (source.mode === 'checkpoint') {
    const unit = findUnit(source.course, source.unitId);
    if (unit) {
      const authored = unit.checkpoint?.steps;
      const drawn = authored && authored.length > 0 ? authored.map((step) => ({ step, lessonId: null as string | null })) : drawExercises(unit.lessons, unit.checkpoint?.sample ?? DEFAULT_DRILL_SIZE, hashSeed(options.seed, 'checkpoint'));
      queue = drawn.map((entry, i) => item(`s${i}`, entry.step, entry.lessonId));
      title = `Checkpoint: ${unit.title}`;
      unitId = unit.id;
      unlock = unit.lessons.map((lesson) => ({ lessonId: lesson.id, skill: lesson.skill }));
      maxMistakes = Math.max(0, Math.floor(unit.checkpoint?.maxMistakes ?? CHECKPOINT_MISTAKES));
    }
  } else if (source.mode === 'practice') {
    const unit = findUnit(source.course, source.unitId);
    if (unit) {
      const chosen = source.lessonIds && source.lessonIds.length > 0 ? unit.lessons.filter((l) => source.lessonIds!.includes(l.id)) : unit.lessons;
      const lessons = chosen.length > 0 ? chosen : unit.lessons;
      const drawn = drawExercises(lessons, Math.max(1, source.size ?? DEFAULT_DRILL_SIZE), hashSeed(options.seed, 'practice'));
      queue = drawn.map((entry, i) => item(`s${i}`, entry.step, entry.lessonId));
      title = `Practice: ${unit.title}`;
      unitId = unit.id;
      kind = 'practice';
      practiced = lessons.map((l) => l.skill);
    }
  } else {
    const index = factIndex(source.courses);
    const size = Math.max(1, source.size ?? DEFAULT_REVIEW_SIZE);
    const seen = new Set<string>();
    for (const card of source.cards) {
      if (queue.length >= size) break;
      const ref = index.get(card.id);
      if (!ref || seen.has(card.id)) continue;
      seen.add(card.id);
      const step: Step = ref.fact.ask ? unseeded(ref.fact.ask) : flashcardOf(ref.fact);
      queue.push(item(`s${queue.length}`, step, ref.lesson.id, card.id));
    }
    title = 'Review';
    kind = 'review';
  }

  // Hearts are the mistake budget of THEORY lessons (the progress rules): teacher lessons,
  // checkpoints, practice and reviews never use them.
  const usesHearts = source.mode === 'lesson' && source.course.teacher === 'none';
  const state: SessionState = {
    v: SESSION_VERSION,
    mode: source.mode,
    courseId: source.mode === 'review' ? null : source.course.id,
    unitId,
    lessonId,
    title,
    kind,
    skill,
    level,
    naming: options.naming ?? null,
    route: options.route ?? null,
    params: options.params ? [...options.params] : [],
    seed: options.seed >>> 0,
    queue,
    total: queue.length,
    cleared: 0,
    phase: 'step',
    feedback: null,
    outcome: null,
    hearts: usesHearts ? clampHearts(options.hearts) : null,
    maxMistakes,
    stats: { ...EMPTY_STATS },
    results: {},
    startedAt: options.now,
    stepStartedAt: options.now,
    activeMs: 0,
    paused: false,
    endedAt: null,
    difficulty: Math.min(1, Math.max(0, options.difficulty ?? START_DIFFICULTY[level])),
    micOff: options.mic === false,
    facts,
    graded: [],
    unlock,
    practiced,
    skillBefore: source.mode === 'lesson' ? (options.skill ?? null) : null,
    skillKnown: source.mode === 'lesson' && options.skill !== undefined,
    summary: null,
  };
  if (queue.length === 0) return finish(state, 'completed', options.now, []).state;
  // No heart left: the lesson cannot start. The summary offers practice instead.
  if (state.hearts !== null && state.hearts <= 0) return finish(state, 'out-of-hearts', options.now, []).state;
  return enter(state);
}

// ── Materialising steps ────────────────────────────────────────────────────────────────────────

function literal(step: ExerciseStep, state: SessionState, salt: string): Exercise {
  return isGenerated(step) ? generateExercise(step, { seed: hashSeed(state.seed, salt), difficulty: state.difficulty, level: state.level }) : step;
}

function isPlay(exercise: Exercise | null): exercise is Extract<Exercise, { alternative: ExerciseStep }> {
  return exercise !== null && PLAY_TYPES.has(exercise.type);
}

/** Swap a play exercise for its alternative. A (wrongly authored) chain of play exercises is followed to its end. */
function withoutMic(entry: SessionItem, state: SessionState): SessionItem {
  let exercise = entry.exercise;
  let swapped = entry.alt;
  for (let depth = 0; depth < 3 && isPlay(exercise) && exercise.alternative; depth++) {
    exercise = literal(exercise.alternative, state, `${entry.key}:alt${depth}`);
    swapped = true;
  }
  return swapped === entry.alt && exercise === entry.exercise ? entry : { ...entry, exercise, alt: swapped };
}

/** Make the head of the queue ready to show. */
function enter(state: SessionState): SessionState {
  const head = state.queue[0];
  if (!head) return state;
  let ready = head;
  if (ready.exercise === null && !isCard(ready.step)) {
    ready = { ...ready, exercise: literal(ready.step as ExerciseStep, state, ready.key) };
  }
  if (state.micOff) ready = withoutMic(ready, state);
  return ready === head ? state : { ...state, queue: [ready, ...state.queue.slice(1)] };
}

// ── Finishing ──────────────────────────────────────────────────────────────────────────────────

function accuracyOf(stats: SessionStats): number {
  return stats.asked === 0 ? 1 : stats.firstTry / stats.asked;
}

function clockOut(state: SessionState, at: number): number {
  if (state.paused) return state.activeMs;
  return state.activeMs + Math.min(MAX_STEP_MS, Math.max(0, at - state.stepStartedAt));
}

function finish(state: SessionState, outcome: SessionOutcome, at: number, effects: SessionEffect[]): SessionStep {
  const activeMs = clockOut(state, at);
  const durationSec = Math.round(activeMs / 1000);
  const { stats } = state;
  const completed = outcome === 'completed';
  const accuracy = accuracyOf(stats);
  const perfect = completed && stats.mistakes === 0 && stats.asked > 0;
  const worked = stats.asked > 0;
  const progress = state.total === 0 ? 1 : Math.min(1, state.cleared / state.total);
  const out = [...effects];
  let xp = 0;
  let crown: SessionSummary['crown'] = null;
  let factsAdded = 0;
  const unlocked: string[] = [];

  const base: ActivityInput = { kind: state.kind, title: state.title, durationSec, completed, combo: stats.bestCombo, count: stats.asked };
  if (state.route) {
    base.route = state.route;
    base.params = [...state.params];
  }
  if (worked) {
    base.accuracy = accuracy;
    base.mistakes = stats.mistakes;
  }
  const difficulty = Math.round(state.difficulty * 100) / 100;

  if (state.total > 0 && (completed || worked)) {
    const input: ActivityInput = { ...base };
    if (state.mode === 'review') input.count = state.graded.length;
    if (state.mode === 'lesson' && state.skill) {
      input.id = state.skill;
      input.data = { d: difficulty };
    }
    const guideline = xpFor(input.kind, { accuracy: input.accuracy, durationSec, perfect, count: input.count, completed });
    if (completed) {
      xp = guideline;
    } else {
      // Leaving early earns the half share for an unfinished attempt, in proportion to what was done.
      xp = Math.floor(guideline * progress);
      input.xp = xp;
      input.progress = progress;
    }
    out.push({ type: 'record-activity', input });

    if (completed && state.mode === 'lesson') {
      if (state.facts.length > 0) {
        out.push({ type: 'add-cards', items: state.facts.map((f) => ({ ...f })) });
        factsAdded = state.facts.length;
      }
      if (state.skillKnown) {
        const before = state.skillBefore?.mastery ?? 0;
        const after = applyAttempt(state.skillBefore ?? undefined, { accuracy: input.accuracy, durationSec, completed: true, perfect }, at).record.mastery;
        crown = { before, after, gained: after > before };
      }
    }
    if (completed && state.mode === 'checkpoint') {
      for (const entry of state.unlock) {
        out.push({ type: 'mark-skill', id: entry.skill, completed: true, masteryAtLeast: 1 });
        unlocked.push(entry.lessonId);
      }
    }
    if (state.mode === 'practice' && worked) {
      for (const id of state.practiced) out.push({ type: 'skill-data', id, difficulty });
    }
  }

  const missed = Object.values(state.results).filter((r) => !r.solved).map((r) => r.prompt);
  const summary: SessionSummary = {
    mode: state.mode,
    outcome,
    title: state.title,
    exercises: stats.asked,
    accuracy,
    firstTry: stats.firstTry,
    mistakes: stats.mistakes,
    perfect,
    bestCombo: stats.bestCombo,
    durationSec,
    xp,
    crown,
    factsAdded,
    cardsReviewed: state.graded.length,
    heartsLeft: state.hearts,
    missed,
    unlocked,
    next: outcome === 'completed' ? 'continue' : outcome === 'out-of-hearts' ? 'practice' : outcome === 'failed' ? 'lessons' : 'resume',
  };
  return {
    state: { ...state, phase: 'done', outcome, feedback: null, activeMs, endedAt: at, paused: false, summary },
    effects: out,
  };
}

// ── The reducer ────────────────────────────────────────────────────────────────────────────────

function record(state: SessionState, entry: SessionItem, exercise: Exercise, correct: boolean, skipped: boolean): Pick<SessionState, 'stats' | 'results'> {
  const previous = state.results[entry.key];
  const first = !previous;
  const stats: SessionStats = { ...state.stats };
  stats.answers += 1;
  if (first) {
    stats.asked += 1;
    if (correct) stats.firstTry += 1;
  }
  if (correct) {
    stats.right += 1;
    stats.combo += 1;
    stats.bestCombo = Math.max(stats.bestCombo, stats.combo);
  } else {
    stats.mistakes += 1;
    stats.combo = 0;
  }
  if (skipped) stats.skipped += 1;
  const results = {
    ...state.results,
    [entry.key]: {
      attempts: (previous?.attempts ?? 0) + 1,
      firstTry: previous ? previous.firstTry : correct,
      solved: correct || (previous?.solved ?? false),
      type: exercise.type,
      prompt: previous?.prompt ?? plainText(promptOf(exercise)),
    },
  };
  return { stats, results };
}

function judge(state: SessionState, answer: Answer | null): SessionStep {
  const entry = state.queue[0];
  const exercise = entry?.exercise ?? null;
  if (state.phase !== 'step' || !entry || !exercise) return { state, effects: [] };
  const effects: SessionEffect[] = [];
  const skipped = answer === null;
  let result: GradeResult;
  if (answer === null) {
    // A skip shows the right answer without pretending the learner gave one.
    const shown = grade(exercise, solve(exercise), { level: state.level, naming: state.naming ?? undefined });
    result = { correct: false, score: 0, feedback: shown.feedback };
  } else {
    result = grade(exercise, answer, { level: state.level, naming: state.naming ?? undefined });
  }
  const { stats, results } = record(state, entry, exercise, result.correct, skipped);

  let hearts = state.hearts;
  let heartLost = false;
  // Hearts pay for real mistakes only: not for skips, and not for self-rated flashcards.
  if (!result.correct && !skipped && hearts !== null && hearts > 0 && exercise.type !== 'flashcard') {
    hearts -= 1;
    heartLost = true;
    effects.push({ type: 'lose-heart' });
  }

  let graded = state.graded;
  if (state.mode === 'review' && entry.cardId) {
    const rating: ReviewGrade = answer !== null && answer.type === 'flashcard' && exercise.type === 'flashcard' ? (['again', 'hard', 'good', 'easy'].includes(answer.rating) ? answer.rating : 'again') : result.correct ? 'good' : 'again';
    effects.push({ type: 'grade-review', id: entry.cardId, grade: rating });
    if (!graded.includes(entry.cardId)) graded = [...graded, entry.cardId];
  }

  const difficulty = entry.generated && !entry.alt ? nextDifficulty(state.difficulty, result.correct) : state.difficulty;
  const willRetry = !result.correct && state.mode !== 'checkpoint' && entry.attempt < MAX_RETRIES && stats.requeued < MAX_REQUEUES;
  return {
    state: {
      ...state,
      stats,
      results,
      hearts,
      graded,
      difficulty,
      phase: 'feedback',
      feedback: { result, answer, skipped, heartLost, willRetry },
    },
    effects,
  };
}

function advance(state: SessionState, at: number): SessionStep {
  const head = state.queue[0];
  if (!head || state.phase === 'done') return { state, effects: [] };
  let queue = state.queue.slice(1);
  let cleared = state.cleared;
  let stats = state.stats;
  if (state.phase === 'feedback') {
    if (state.feedback?.willRetry) {
      const again: SessionItem = { ...head, attempt: head.attempt + 1 };
      const index = Math.min(REQUEUE_GAP, queue.length);
      queue = [...queue.slice(0, index), again, ...queue.slice(index)];
      stats = { ...stats, requeued: stats.requeued + 1 };
    } else {
      cleared += 1;
      if (!state.feedback?.result.correct) stats = { ...stats, dropped: stats.dropped + 1 };
    }
  } else if (head.exercise === null) {
    cleared += 1; // a card
  } else {
    return { state, effects: [] }; // an exercise must be answered or skipped first
  }
  // The clock is moved to `at` here, so a `finish` below adds nothing more.
  const next: SessionState = { ...state, queue, cleared, stats, activeMs: clockOut(state, at), stepStartedAt: at, phase: 'step', feedback: null };
  // A checkpoint is failed the moment its allowance is exceeded, even on its last question.
  if (next.maxMistakes !== null && stats.mistakes > next.maxMistakes) return finish(next, 'failed', at, []);
  // Everything done counts as done, even on the last heart.
  if (queue.length === 0) return finish(next, 'completed', at, []);
  if (next.hearts !== null && next.hearts <= 0) return finish(next, 'out-of-hearts', at, []);
  return { state: enter(next), effects: [] };
}

/**
 * The session reducer. Pure: the same state and action always give the same result. An action
 * that makes no sense in the current phase (answering a card, continuing before answering)
 * returns the state unchanged with no effects.
 */
export function reduceSession(state: SessionState, action: SessionAction): SessionStep {
  if (state.phase === 'done') return { state, effects: [] };
  // Doing anything means the learner is back: time away is never counted.
  if (state.paused && action.type !== 'pause' && action.type !== 'resume') {
    return reduceSession({ ...state, paused: false, stepStartedAt: action.at }, action);
  }
  switch (action.type) {
    case 'answer':
      return judge(state, action.answer);
    case 'skip':
      return judge(state, null);
    case 'continue':
      return advance(state, action.at);
    case 'cant-play': {
      const head = state.queue[0];
      if (state.phase !== 'step' || !head) return { state, effects: [] };
      const micOff = state.micOff || action.scope === 'session';
      const swapped = withoutMic(head, state);
      if (swapped === head && micOff === state.micOff) return { state, effects: [] };
      return { state: { ...state, micOff, queue: [swapped, ...state.queue.slice(1)] }, effects: [] };
    }
    case 'mic': {
      if (action.available) return { state: state.micOff ? { ...state, micOff: false } : state, effects: [] };
      const next: SessionState = { ...state, micOff: true };
      return { state: state.phase === 'step' ? enter(next) : next, effects: [] };
    }
    case 'pause':
      if (state.paused) return { state, effects: [] };
      return { state: { ...state, activeMs: clockOut(state, action.at), paused: true }, effects: [] };
    case 'resume': {
      let next: SessionState = { ...state, paused: false, stepStartedAt: action.at };
      if (action.hearts !== undefined && state.hearts !== null) {
        const hearts = clampHearts(action.hearts);
        // Hearts switched off while away: stop counting them. Otherwise take the store's number.
        next = { ...next, hearts };
        if (hearts !== null && hearts <= 0 && state.phase === 'step') return finish(next, 'out-of-hearts', action.at, []);
      }
      return { state: next, effects: [] };
    }
    case 'quit':
      return finish(state, 'quit', action.at, []);
    default:
      return { state, effects: [] };
  }
}

// ── Selectors ──────────────────────────────────────────────────────────────────────────────────

/** What a screen needs to draw the current step. */
export type CurrentStep =
  | { kind: 'card'; key: string; card: CardStep }
  | {
      kind: 'exercise';
      key: string;
      exercise: Exercise;
      /** Display order of options, tiles, pairs and bank words. */
      presentation: Presentation;
      /** 0 the first time, more when the exercise has come back. */
      attempt: number;
      /** The exercise is the non-microphone stand-in of a play exercise. */
      alternative: boolean;
      /** The original step listens to the guitar and has not been swapped: offer "I can't play right now". */
      usesMic: boolean;
    };

/** The step to show now, or null when the session is done. */
export function currentStep(state: SessionState): CurrentStep | null {
  const head = state.queue[0];
  if (!head || state.phase === 'done') return null;
  if (head.exercise === null) return isCard(head.step) ? { kind: 'card', key: head.key, card: head.step } : null;
  return {
    kind: 'exercise',
    key: head.key,
    exercise: head.exercise,
    presentation: presentExercise(head.exercise, hashSeed(state.seed, head.key, head.attempt, 'show')),
    attempt: head.attempt,
    alternative: head.alt,
    usesMic: isPlay(head.exercise),
  };
}

/** Progress through the session: steps finished for good out of the steps it started with (come-backs do not move it). */
export function sessionProgress(state: SessionState): { done: number; total: number; fraction: number; remaining: number } {
  return { done: state.cleared, total: state.total, fraction: state.total === 0 ? 1 : Math.min(1, state.cleared / state.total), remaining: state.phase === 'done' ? 0 : state.queue.length };
}

/** True once the session has ended (read `state.summary`). */
export function isFinished(state: SessionState): boolean {
  return state.phase === 'done';
}

/** Mistakes a checkpoint still allows, or null for other sessions. */
export function mistakesLeft(state: SessionState): number | null {
  return state.maxMistakes === null ? null : Math.max(0, state.maxMistakes - state.stats.mistakes);
}

/** Share of first attempts answered right so far, 0 to 1. */
export function sessionAccuracy(state: SessionState): number {
  return accuracyOf(state.stats);
}

/** Seconds of practice so far at time `now`. */
export function sessionSeconds(state: SessionState, now: number): number {
  return Math.round((state.phase === 'done' ? state.activeMs : clockOut(state, now)) / 1000);
}

// ── Saving and restoring ───────────────────────────────────────────────────────────────────────

/** A session as text, for storage. */
export function serializeSession(state: SessionState): string {
  return JSON.stringify(state);
}

/**
 * Read a saved session back. Returns null for anything that is not a session of the current
 * format (damaged data, an older version): the screen then simply starts afresh.
 */
export function restoreSession(saved: unknown): SessionState | null {
  let data: unknown = saved;
  if (typeof saved === 'string') {
    try {
      data = JSON.parse(saved);
    } catch {
      return null;
    }
  }
  if (typeof data !== 'object' || data === null) return null;
  const s = data as Partial<SessionState>;
  const modes: SessionMode[] = ['lesson', 'checkpoint', 'practice', 'review'];
  if (s.v !== SESSION_VERSION || !modes.includes(s.mode as SessionMode)) return null;
  if (!Array.isArray(s.queue) || typeof s.stats !== 'object' || s.stats === null || typeof s.results !== 'object' || s.results === null) return null;
  if (s.phase !== 'step' && s.phase !== 'feedback' && s.phase !== 'done') return null;
  for (const key of ['total', 'cleared', 'seed', 'startedAt', 'stepStartedAt', 'activeMs', 'difficulty'] as const) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key])) return null;
  }
  for (const entry of s.queue) {
    if (typeof entry !== 'object' || entry === null || typeof entry.key !== 'string' || typeof entry.step !== 'object' || entry.step === null) return null;
  }
  if (s.phase === 'feedback' && !s.feedback) return null;
  if (s.phase !== 'done' && s.queue.length === 0) return null;
  return data as SessionState;
}

/** True when a session can be picked up again: it has not ended and something was done in it. */
export function isResumable(state: SessionState | null): boolean {
  return state !== null && state.phase !== 'done' && (state.cleared > 0 || state.stats.answers > 0);
}
