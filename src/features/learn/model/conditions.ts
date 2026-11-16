/**
 * "On the go": lessons adapted to where the learner is. Without the guitar, play steps run as
 * their tapping alternatives. Without sound (a train, a library), listening questions are left out,
 * play steps become their alternatives too (playing makes sound), and listening facts are reviewed
 * as flashcards. Pure functions over the lesson engine's content; the session engine never knows.
 */
import { getGenerator, isGenerated, type Checkpoint, type Course, type ExerciseStep, type Fact, type Figure, type Lesson, type Step, type Unit } from '@/lessons';

/** Where the learner is right now. */
export interface Conditions {
  /** The guitar is at hand (play steps can listen to it). */
  guitar: boolean;
  /** Sound may play (listening questions can be asked). */
  sound: boolean;
}

/** At home with the guitar: everything runs as written. */
export const AT_THE_GUITAR: Conditions = { guitar: true, sound: true };

/** What a lesson asks of the place it is done in. */
export interface LessonNeeds {
  /** Steps that listen to the learner's guitar (they have tapping alternatives). */
  play: number;
  /** Listening questions (they need sound). */
  listening: number;
  /** Questions in all. */
  exercises: number;
}

const PLAY_TYPES = new Set(['play-note', 'play-chord', 'play-phrase']);
/** Generators whose questions must be heard (or tapped along with a click). */
const LISTENING_DRILLS = new Set(['higher-lower', 'interval-ear', 'chord-quality-ear', 'scale-ear', 'cadence-ear', 'rhythm-ear', 'rhythm-tap']);

function hasAudio(figure: Figure | undefined): boolean {
  return figure?.kind === 'audio';
}

/** True for a step that listens to the guitar (a play exercise or the play-note drill). */
export function isPlayStep(step: Step): boolean {
  if (isGenerated(step)) return (getGenerator(String(step.generate))?.produces ?? []).some((t) => PLAY_TYPES.has(t));
  return PLAY_TYPES.has(step.type);
}

/**
 * True for a question that cannot be answered without sound: listen-choice, a tap-rhythm counted
 * in by a click or played to the learner, an ear drill, or a question whose prompt or options are
 * something to hear.
 */
export function isListeningStep(step: Step): boolean {
  if (isGenerated(step)) return LISTENING_DRILLS.has(String(step.generate));
  switch (step.type) {
    case 'card':
      return false;
    case 'listen-choice':
      return true;
    case 'tap-rhythm':
      return step.show !== 'notation' || step.start !== 'first-tap';
    case 'choice':
      return hasAudio(step.figure) || step.options.some((o) => hasAudio(o.figure));
    case 'flashcard':
      return hasAudio(step.figure) || hasAudio(step.backFigure);
    default:
      return hasAudio(step.figure);
  }
}

/** How many play steps, listening questions and questions a lesson has. */
export function lessonNeeds(lesson: Pick<Lesson, 'steps'>): LessonNeeds {
  let play = 0;
  let listening = 0;
  let exercises = 0;
  for (const step of lesson.steps) {
    if (!isGenerated(step) && step.type === 'card') continue;
    exercises++;
    if (isPlayStep(step)) play++;
    else if (isListeningStep(step)) listening++;
  }
  return { play, listening, exercises };
}

/**
 * The tapping version of a play step: its authored alternative. The play-note drill becomes the
 * note-on-string drill that taps the same notes (what its own fallback asks).
 */
function tapVersion(step: Step): Step {
  if (isGenerated(step)) {
    if (step.generate !== 'play-note') return step;
    const p = step.params ?? {};
    const tap: ExerciseStep = {
      generate: 'note-on-string',
      params: { strings: p.strings ?? [6, 5, 4, 3, 2, 1], frets: p.frets ?? [0, 3], naturals: p.naturals ?? true, ask: 'find' },
    };
    if (step.seed !== undefined) tap.seed = step.seed;
    if (step.id !== undefined) tap.id = step.id;
    if (step.fact !== undefined) tap.fact = step.fact;
    return tap;
  }
  if (step.type === 'play-note' || step.type === 'play-chord' || step.type === 'play-phrase') {
    const alt = step.alternative;
    // Keep the fact link: the alternative tests the same thing.
    return step.fact && !alt.fact ? ({ ...alt, fact: step.fact } as ExerciseStep) : alt;
  }
  return step;
}

/** The fewest questions a lesson may keep without sound before it is better done with sound. */
export const MIN_QUIET_EXERCISES = 3;

/** A lesson as it runs here, and what changed. */
export interface AdaptedLesson {
  lesson: Lesson;
  /** Play steps turned into their tapping versions. */
  swapped: number;
  /** Listening questions left out. */
  skipped: number;
  /** True when too little would be left without sound: the lesson runs as written (it needs sound). */
  needsSound: boolean;
}

function adaptSteps<S extends Step>(steps: readonly S[], c: Conditions): { steps: Step[]; swapped: number; skipped: number } {
  let swapped = 0;
  let skipped = 0;
  const out: Step[] = [];
  for (const step of steps) {
    if (isPlayStep(step)) {
      if (!c.guitar || !c.sound) {
        const tap = tapVersion(step);
        if (tap === step) {
          // Nothing to tap instead: leave it out.
          skipped++;
          continue;
        }
        if (!c.sound && isListeningStep(tap)) {
          skipped++;
          continue;
        }
        swapped++;
        out.push(tap);
        continue;
      }
      out.push(step);
      continue;
    }
    if (!c.sound && isListeningStep(step)) {
      skipped++;
      continue;
    }
    out.push(step);
  }
  return { steps: out, swapped, skipped };
}

/** A lesson for these conditions. Returns the same lesson object when nothing changes. */
export function adaptLesson(lesson: Lesson, c: Conditions): AdaptedLesson {
  if (c.guitar && c.sound) return { lesson, swapped: 0, skipped: 0, needsSound: false };
  const { steps, swapped, skipped } = adaptSteps(lesson.steps, c);
  if (swapped === 0 && skipped === 0) return { lesson, swapped: 0, skipped: 0, needsSound: false };
  const left = steps.filter((s) => isGenerated(s) || s.type !== 'card').length;
  // A listening lesson without its listening is not a lesson: run it as written and say so.
  if (!c.sound && left < MIN_QUIET_EXERCISES) {
    const guitarOnly = adaptSteps(lesson.steps, { guitar: false, sound: true });
    return { lesson: { ...lesson, steps: guitarOnly.steps }, swapped: guitarOnly.swapped, skipped: 0, needsSound: true };
  }
  // The lesson must not end on a card once its last question is gone.
  while (steps.length > 1) {
    const last = steps[steps.length - 1];
    if (isGenerated(last) || last.type !== 'card') break;
    steps.pop();
  }
  return { lesson: { ...lesson, steps }, swapped, skipped, needsSound: false };
}

function adaptFact(fact: Fact, c: Conditions): Fact {
  if (!fact.ask) return fact;
  if (c.sound && c.guitar) return fact;
  if (isPlayStep(fact.ask) || (!c.sound && isListeningStep(fact.ask))) {
    // Reviewed as a flashcard instead.
    const { ask: _ask, ...rest } = fact;
    return rest;
  }
  return fact;
}

function adaptCheckpoint(checkpoint: Checkpoint | undefined, c: Conditions): Checkpoint | undefined {
  if (!checkpoint?.steps) return checkpoint;
  const { steps } = adaptSteps(checkpoint.steps, c);
  // Too few left to be a test: draw from the (adapted) lessons instead.
  if (steps.length < 6) {
    const { steps: _steps, ...rest } = checkpoint;
    return { ...rest, sample: Math.max(6, Math.min(10, checkpoint.steps.length)) };
  }
  return { ...checkpoint, steps: steps as ExerciseStep[] };
}

/** A unit for these conditions: its lessons, its checkpoint and its facts. */
export function adaptUnit(unit: Unit, c: Conditions): Unit {
  if (c.guitar && c.sound) return unit;
  return {
    ...unit,
    lessons: unit.lessons.map((l) => {
      const adapted = adaptLesson(l, c).lesson;
      return adapted.facts ? { ...adapted, facts: adapted.facts.map((f) => adaptFact(f, c)) } : adapted;
    }),
    checkpoint: adaptCheckpoint(unit.checkpoint, c),
  };
}

/** A whole course for these conditions (same ids, so progress and saved sessions still match). */
export function adaptCourse(course: Course, c: Conditions): Course {
  if (c.guitar && c.sound) return course;
  return { ...course, units: course.units.map((u) => adaptUnit(u, c)) };
}

/** Plain words for what the conditions change, for the toggle's caption. */
export function conditionsLine(c: Conditions): string | null {
  if (c.guitar && c.sound) return null;
  if (!c.sound) return 'No sound: listening questions are left out, and you tap instead of playing.';
  return 'No guitar: questions that listen to you play become tapping questions.';
}
