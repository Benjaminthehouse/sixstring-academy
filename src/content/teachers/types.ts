/**
 * The format of the teachers' courses: the lesson engine's format (`@/lessons`) with two small
 * extensions a teacher needs and the Theory Path does not.
 *
 *  1. **Task steps** (`{ type: 'task', ... }`): "go and do this in another part of the app, then
 *     come back". A teacher sends the learner to the Player to play along with a song, to the Tuner,
 *     the Metronome, a Technique exercise or the chord trainer for a few minutes, and the lesson
 *     picks up where it left off. For the engine a task is a teaching card (it compiles to a card
 *     with the same id), so sessions, saving and the course map need nothing new; the teachers
 *     screen draws it as a task with an "Open" button and recognises the work done there.
 *  2. **Pictures on teaching cards** (`art`): drawings the engine's figures cannot make (the parts
 *     of the guitar, the pick grip, where to press). Stripped for the engine, drawn by the screen.
 *
 * A unit may also name its **milestone**: the lesson that ends it with a small performance, the
 * step that is the performance, and what the teacher says when it is done.
 *
 * Everything else (cards, exercises, generated steps, facts, checkpoints, the text markup and the
 * limits) is exactly the engine's: read Part B of `src/lessons/API.md`.
 */
import type { CardStep, ExerciseStep, Fact, GlossaryTerm, RichText, Step, UnitTheme } from '@/lessons';

export type { RichText } from '@/lessons';

/** The three teachers (the progress module's `TeacherId`). */
export type TeacherKey = 'mia' | 'dev' | 'elena';

/** The places a task can send the learner, each a route of the app. */
export type TaskTool =
  | 'player'
  | 'tuner'
  | 'metronome'
  | 'technique'
  | 'chords'
  | 'practice'
  | 'rhythm'
  | 'ear'
  | 'fretboard'
  | 'scales'
  | 'arcade'
  | 'progressions';

/** Where a task leads: a tool and the params of its address (`#play--hot-cross-buns--wait`). */
export interface TaskTarget {
  tool: TaskTool;
  /** Route params after the tool's route name. For the Player the first is the song id. */
  params?: string[];
}

/**
 * Do something in another part of the app, then come back to the lesson.
 * Build them with the helpers in `tasks.ts` (`playerTask`, `toolTask`, `techniqueTask`).
 */
export interface TaskStep extends TaskTarget {
  type: 'task';
  /** Slug, unique in the lesson. Required: the screen finds the task by it. */
  id: string;
  /** What to do, as a short title ("Play along: Hot Cross Buns"). At most 40 characters. */
  title: string;
  /** The teacher's instructions: what to do, for how long, what to listen for. At most 320 characters. */
  body: RichText;
  /** A tip in the teacher's voice (the common mistake, how it should feel). At most 160 characters. */
  tip?: RichText;
  /** Minutes to spend there, 1 to 20. */
  minutes: number;
  /** Shown instead of `body`, and leading there instead, when the target is missing (a song not in the library yet). */
  fallback?: { body: RichText } & TaskTarget;
}

/** Drawings a teaching card can carry, made by the teachers screen. */
export type CardArt = 'guitar-parts' | 'posture' | 'pick-grip' | 'fretting';

/** A teaching card, optionally with a drawing (`art` needs an `id` on the card). */
export interface TeacherCardStep extends CardStep {
  art?: CardArt;
}

/** One step of a teacher's lesson: an engine step, a card with a drawing, or a task. */
export type TeacherStep = Step | TeacherCardStep | TaskStep;

/** A teacher's lesson: an engine `Lesson` whose steps may also be tasks. */
export interface TeacherLesson {
  /** The plan's slug (the part after the second slash of the plan id). Unique across all three courses. */
  id: string;
  title: string;
  /** The one thing it teaches, as a sentence the learner could repeat (at most 110 characters). */
  teaches: string;
  /** Minutes of the in-app lesson, 2 to 5 (the engine's limit); task minutes come on top. */
  minutes: number;
  /** `teacher:<teacher>:<lesson id>`. */
  skill: string;
  requires?: string[];
  steps: TeacherStep[];
  facts?: Fact[];
}

/** The performance that ends a unit, and the teacher's words when it is done. */
export interface Milestone {
  /** The lesson that is the unit's performance (normally its last). */
  lesson: string;
  /** The id of the step in that lesson that is the performance (a play step, so the microphone listens). */
  step: string;
  /** The piece performed, as the learner knows it ("Hot Cross Buns"). */
  piece: string;
  /** A song id in the library, to perform it again with the band in the Player's flow mode. */
  song?: string;
  /** The teacher's words when the unit is complete. At most 240 characters. */
  celebrate: RichText;
}

/** A unit of a teacher's course: one file, `src/content/teachers/<teacher>/<unit id>.ts`. */
export interface TeacherUnit {
  /** The plan's unit id (`mia-hello-guitar`); the file is named after it. */
  id: string;
  /** At most 32 characters (shorten the plan's title if it is longer). */
  title: string;
  theme: UnitTheme;
  /** One or two short sentences (at most 140 characters). */
  description: string;
  lessons: TeacherLesson[];
  checkpoint?: { steps?: ExerciseStep[]; sample?: number; maxMistakes?: number };
  milestone?: Milestone;
  /** Terms this unit adds to the course glossary (`{t:id}`), merged across units. */
  glossary?: GlossaryTerm[];
}

/** A lesson in the outline: `[slug, title, kind, minutes]` as the plan has them. */
export type OutlineLesson = readonly [slug: string, title: string, kind: string, minutes: number];

/** A unit in the outline. */
export interface OutlineUnit {
  id: string;
  title: string;
  goal: string;
  lessons: readonly OutlineLesson[];
}

/** A course in the outline. */
export interface CourseOutline {
  id: TeacherKey;
  title: string;
  units: readonly OutlineUnit[];
}
