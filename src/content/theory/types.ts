/**
 * The shapes of the Theory Path registry: the outline (every stage, unit and lesson of the
 * reviewed syllabus, small enough to draw the whole path at once) and the assembled course.
 */
import type { Course, Unit, UnitTheme } from '@/lessons';

/** The three stages of the path, in order. */
export type StageId = 'beginner' | 'intermediate' | 'expert';

/** One lesson as the syllabus plans it: enough to draw its node before its unit is loaded. */
export interface OutlineLesson {
  /** The lesson slug (unique in the course). */
  id: string;
  title: string;
  minutes: number;
  /** Prerequisite lesson slugs from the syllabus (all earlier in the course). */
  requires: string[];
  /** The syllabus plans an exercise that listens to the guitar (play-note, play-chord, play-phrase). */
  play?: true;
  /** The syllabus plans a listening exercise (listen-choice, tap-rhythm or an ear drill). */
  listen?: true;
}

/** One unit as the syllabus plans it. */
export interface OutlineUnit {
  id: string;
  title: string;
  theme: UnitTheme;
  /** One sentence on what the unit covers. */
  summary: string;
  /** One sentence a learner cares about. */
  why: string;
  lessons: OutlineLesson[];
}

/** One stage: a level of the path. */
export interface OutlineStage {
  id: StageId;
  /** Short name ("Beginner"). */
  title: string;
  /** What the stage is about ("From first note to first songs"). */
  subtitle: string;
  units: OutlineUnit[];
}

/** The whole path as planned. */
export interface Outline {
  id: string;
  title: string;
  stages: OutlineStage[];
}

/** Where a unit of the path stands. */
export type UnitStatus =
  /** Written and loaded: its lessons can run. */
  | 'ready'
  /** Written, still loading: its nodes are drawn from the outline. */
  | 'loading'
  /** Not written yet: shown as "coming soon". */
  | 'coming-soon';

/** A unit of the path with its place and state. */
export interface PathUnit {
  outline: OutlineUnit;
  stage: StageId;
  /** 1-based number on the whole path (Unit 1 to Unit 43), stable whether or not other units are written. */
  number: number;
  status: UnitStatus;
  /** The unit as written, once loaded. */
  unit: Unit | null;
}

/** The Theory Path as it can be drawn and run right now. */
export interface TheoryCourse {
  /**
   * The lesson engine's course: every written unit in syllabus order (loaded, or a stand-in drawn
   * from the outline while it loads), prerequisites resolved past units that are not written yet.
   */
  course: Course;
  /** Every unit of the syllabus, written or not, in order. */
  units: PathUnit[];
  /** True when every written unit is loaded. */
  complete: boolean;
}
