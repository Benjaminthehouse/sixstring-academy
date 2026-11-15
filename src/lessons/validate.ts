/**
 * `validateCourse(course)`: everything that is wrong with a course, as a list. Content authors
 * run it in their tests (`expect(courseErrors(course)).toEqual([])`), so every message names the
 * unit, lesson and step, and says how to fix the problem.
 *
 * What it checks: unique ids; prerequisites that exist and do not loop; skill ids that follow the
 * progress conventions; every text within its phone-sized limit, with valid markup, known
 * glossary terms and speakable symbols; every figure valid on the instrument; every exercise
 * gradable, with exactly the intended answer right and no distractor right by accident; valid
 * generator params (the generators are run to prove it); a non-microphone alternative on every
 * play exercise; lesson length and shape within bounds.
 */
import { cardProblems, exerciseProblems, generatedProblems, type CheckContext, type StepProblem } from './check';
import { getGenerator, isGenerated } from './generators';
import { GLOSSARY, glossaryFor, glossaryTerm } from './glossary';
import { promptOf } from './grade';
import { COURSE_LIMITS, LESSON_LIMITS, TEXT_LIMITS, type TextLimit } from './limits';
import { prerequisites } from './map';
import { activityKindOf, factCardId } from './session';
import { looseSymbols, parseRichText, textLength } from './text';
import type { Checkpoint, Course, ExerciseStep, ExerciseType, Fact, Lesson, RichText, Step, Unit, UnitTheme } from './types';

/** One problem with a course. */
export interface CourseProblem {
  /** `error`: the course must not ship. `warning`: it works but breaks a guideline of good lessons. */
  severity: 'error' | 'warning';
  /** Stable code: `id.duplicate`, `text.long`, `exercise.distractor`, `lesson.length` ... */
  code: string;
  unit: string | null;
  lesson: string | null;
  /** 1-based position of the step in the lesson (or checkpoint), or null. */
  step: number | null;
  /** Where it is, in words: `unit "notes" > lesson "open-strings" > step 4 (choice)`. */
  where: string;
  /** What is wrong and how to fix it. */
  message: string;
  /** `where: message`, ready to print. */
  text: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const THEMES: readonly UnitTheme[] = ['basics', 'notes', 'fretboard', 'rhythm', 'intervals', 'scales', 'chords', 'keys', 'harmony', 'reading', 'ear', 'technique', 'songs', 'improvisation', 'composition'];
const PLAY_TYPES: ReadonlySet<string> = new Set(['play-note', 'play-chord', 'play-phrase']);

/** Seconds a learner typically spends on an exercise of each type, before reading time. */
const EXERCISE_SECONDS: Readonly<Record<ExerciseType, number>> = {
  choice: 11, 'true-false': 8, 'match-pairs': 24, order: 20, 'fill-blanks': 18, 'type-answer': 14, 'listen-choice': 16, 'tap-rhythm': 22,
  'fretboard-find': 14, 'fretboard-name': 11, 'chord-build': 20, 'staff-read': 11, 'staff-place': 14, 'play-note': 14, 'play-chord': 20,
  'play-phrase': 28, flashcard: 10,
};

/** Characters a learner reads per second while studying (slower than leisure reading). */
const READING_CPS = 14;

function lengthOf(text: RichText | undefined): number {
  return text === undefined ? 0 : textLength(text);
}

/** A rough time for one step, in seconds: reading plus doing. */
export function estimateStepSeconds(step: Step): number {
  if (isGenerated(step)) {
    const type = getGenerator(String(step.generate))?.produces[0];
    return (type ? EXERCISE_SECONDS[type] : 14) + 9;
  }
  if (step.type === 'card') {
    return 5 + (lengthOf(step.title) + lengthOf(step.body) + lengthOf(step.tip)) / READING_CPS + (step.figure ? 5 : 0);
  }
  const reading = (lengthOf(promptOf(step)) + (step.type === 'true-false' ? lengthOf(step.statement) : 0)) / READING_CPS;
  // Every answer is followed by a moment with the explanation.
  return EXERCISE_SECONDS[step.type] + reading + 4;
}

/** A rough time for a whole lesson, in seconds. `validateCourse` holds it against the 2 to 5 minute rule. */
export function estimateLessonSeconds(lesson: Pick<Lesson, 'steps'>): number {
  return Math.round(lesson.steps.reduce((sum, step) => sum + estimateStepSeconds(step), 0));
}

function stepLabel(step: Step): string {
  if (!step || typeof step !== 'object') return 'invalid';
  return isGenerated(step) ? `generated: ${String(step.generate)}` : String(step.type);
}

class Report {
  readonly problems: CourseProblem[] = [];

  add(severity: 'error' | 'warning', code: string, at: { unit?: string; lesson?: string; step?: number; label?: string; extra?: string }, message: string): void {
    const parts: string[] = [];
    if (at.unit !== undefined) parts.push(`unit "${at.unit}"`);
    if (at.lesson !== undefined) parts.push(`lesson "${at.lesson}"`);
    if (at.extra !== undefined) parts.push(at.extra);
    if (at.step !== undefined) parts.push(`step ${at.step}${at.label ? ` (${at.label})` : ''}`);
    const where = parts.length ? parts.join(' > ') : 'course';
    this.problems.push({ severity, code, unit: at.unit ?? null, lesson: at.lesson ?? null, step: at.step ?? null, where, message, text: `${where}: ${message}` });
  }

  /** Check a plain (non-step) text: present, valid markup, within its limit, speakable. */
  text(value: RichText | undefined, limit: TextLimit, label: string, at: Parameters<Report['add']>[2], ctx: CheckContext, optional = false): void {
    const raw = value === undefined ? '' : typeof value === 'string' ? value : value.text;
    if (typeof raw !== 'string' || raw.trim() === '') {
      if (!optional) this.add('error', 'text.empty', at, `${label} is empty. Write it.`);
      return;
    }
    const parsed = parseRichText(value as RichText, { glossary: ctx.glossary });
    for (const problem of parsed.problems) this.add('error', problem.includes('glossary') ? 'glossary.unknown' : 'text.markup', at, `${label}: ${problem}`);
    const length = textLength(value as RichText, { glossary: ctx.glossary });
    if (length > TEXT_LIMITS[limit]) this.add('error', 'text.long', at, `${label} is ${length} characters long; the limit is ${TEXT_LIMITS[limit]}. Shorten it.`);
    const loose = typeof value === 'object' && value.say ? [] : looseSymbols(value as RichText, { glossary: ctx.glossary });
    if (loose.length > 0) this.add('error', 'text.speech', at, `${label} has music symbols typed as plain text. Wrap them in tags (${loose.map((l) => `${l.symbol} → ${l.tag}`).join(', ')}).`);
  }

  steps(found: readonly StepProblem[], at: Parameters<Report['add']>[2]): void {
    for (const p of found) this.add(p.severity, p.code, at, p.message);
  }
}

function checkSlug(report: Report, id: unknown, what: string, at: Parameters<Report['add']>[2]): boolean {
  if (typeof id === 'string' && SLUG.test(id) && id.length <= 48) return true;
  report.add('error', 'id.format', at, `The ${what} id ${JSON.stringify(id)} is not a slug. Use lower-case letters, digits and single hyphens (at most 48 characters), like "open-strings".`);
  return false;
}

function checkExerciseStep(report: Report, step: ExerciseStep, at: Parameters<Report['add']>[2], ctx: CheckContext, what: string): void {
  if (!step || typeof step !== 'object') {
    report.add('error', 'exercise.shape', at, `${what} is not an exercise.`);
    return;
  }
  if (isGenerated(step)) {
    report.steps(generatedProblems(step, ctx), at);
    return;
  }
  if ((step as { type?: string }).type === 'card') {
    report.add('error', 'exercise.shape', at, `${what} is a teaching card; only exercises can go here. Replace it with an exercise.`);
    return;
  }
  report.steps(exerciseProblems(step, ctx), at);
}

function checkFacts(report: Report, course: Course, unit: Unit, lesson: Lesson, ctx: CheckContext, factIds: Map<string, string>): void {
  const facts = lesson.facts ?? [];
  const at = { unit: unit.id, lesson: lesson.id };
  if (facts.length > LESSON_LIMITS.facts[1]) report.add('error', 'lesson.facts', at, `The lesson adds ${facts.length} facts to spaced repetition; ${LESSON_LIMITS.facts[1]} is the most a learner can absorb from one lesson. Keep the ones that matter most.`);
  facts.forEach((fact: Fact, i) => {
    const where = { ...at, extra: `fact ${i + 1}${typeof fact?.id === 'string' ? ` "${fact.id}"` : ''}` };
    if (!checkSlug(report, fact?.id, 'fact', where)) return;
    const owner = factIds.get(fact.id);
    if (owner !== undefined) report.add('error', 'id.duplicate', where, `The fact id "${fact.id}" is already used in lesson "${owner}". Fact ids must be unique in the course, because each is one spaced-repetition card. Rename one.`);
    else factIds.set(fact.id, lesson.id);
    if (factCardId(course.id, fact.id).length > 120) report.add('error', 'id.format', where, `The card id "${factCardId(course.id, fact.id)}" is longer than 120 characters. Shorten the course or fact id.`);
    report.text(fact.front, 'flashFront', 'The front (the question side)', where, ctx);
    report.text(fact.back, 'flashBack', 'The back (the answer side)', where, ctx);
    if (fact.figure) report.steps(cardProblems({ type: 'card', body: 'x', figure: fact.figure }, ctx), where);
    if (fact.ask !== undefined) {
      checkExerciseStep(report, fact.ask, where, ctx, '"ask"');
      const type = isGenerated(fact.ask) ? null : fact.ask.type;
      if (type !== null && PLAY_TYPES.has(type)) report.add('error', 'exercise.alternative', where, '"ask" is a microphone exercise. A review must work anywhere: ask the fact with a tapping or choosing exercise.');
      if (isGenerated(fact.ask) && getGenerator(String(fact.ask.generate))?.mic) report.add('error', 'exercise.alternative', where, '"ask" uses a microphone generator. A review must work anywhere: use a different generator.');
    }
  });
}

function checkLessonShape(report: Report, unit: Unit, lesson: Lesson): void {
  const at = { unit: unit.id, lesson: lesson.id };
  const steps = Array.isArray(lesson.steps) ? lesson.steps : [];
  const [minSteps, maxSteps] = LESSON_LIMITS.steps;
  if (steps.length < minSteps) report.add('error', 'lesson.length', at, `The lesson has ${steps.length} steps; a lesson needs at least ${minSteps} to teach one idea and practise it. Add steps (show the idea on a card, then ask about it several ways).`);
  if (steps.length > maxSteps) report.add('error', 'lesson.length', at, `The lesson has ${steps.length} steps; ${maxSteps} is the most that fits in five minutes. Split it into two lessons.`);
  const exercises = steps.filter((s) => s && typeof s === 'object' && (isGenerated(s) || s.type !== 'card'));
  const [minEx, maxEx] = LESSON_LIMITS.exercises;
  if (exercises.length < minEx) report.add('error', 'lesson.length', at, `The lesson has ${exercises.length} exercises; it needs at least ${minEx} so the idea is practised, not only read. Add exercises.`);
  if (exercises.length > maxEx) report.add('error', 'lesson.length', at, `The lesson has ${exercises.length} exercises; ${maxEx} is the most. Split the lesson.`);

  if (!(typeof lesson.minutes === 'number' && lesson.minutes >= LESSON_LIMITS.minutes[0] && lesson.minutes <= LESSON_LIMITS.minutes[1])) {
    report.add('error', 'lesson.length', at, `"minutes" is ${JSON.stringify(lesson.minutes)}; lessons take ${LESSON_LIMITS.minutes[0]} to ${LESSON_LIMITS.minutes[1]} minutes. Set the estimate within that range (and split the lesson if it is longer).`);
  }
  if (steps.length >= minSteps && steps.length <= maxSteps) {
    const seconds = estimateLessonSeconds({ steps });
    const minutes = Math.round((seconds / 60) * 10) / 10;
    if (seconds < LESSON_LIMITS.minutes[0] * 60 - 20) report.add('error', 'lesson.length', at, `The lesson is estimated at ${minutes} minutes, under the ${LESSON_LIMITS.minutes[0]}-minute minimum. Add a card or a few exercises.`);
    else if (seconds > LESSON_LIMITS.minutes[1] * 60 + 30) report.add('error', 'lesson.length', at, `The lesson is estimated at ${minutes} minutes, over the ${LESSON_LIMITS.minutes[1]}-minute maximum. Remove steps or split it into two lessons.`);
    else if (typeof lesson.minutes === 'number' && Math.abs(lesson.minutes - seconds / 60) > 1.5) report.add('warning', 'lesson.length', at, `"minutes" says ${lesson.minutes} but the steps are estimated at ${minutes} minutes. Set "minutes" to about ${Math.min(5, Math.max(2, Math.round(seconds / 60)))}.`);
  }

  // Show, then ask.
  const first = steps[0];
  if (first && typeof first === 'object' && (isGenerated(first) || first.type !== 'card')) report.add('warning', 'lesson.shape', { ...at, step: 1, label: stepLabel(first) }, 'The lesson opens with a question. Show the idea first: start with a teaching card.');
  let run = 0;
  steps.forEach((step, i) => {
    const card = step && typeof step === 'object' && !isGenerated(step) && step.type === 'card';
    run = card ? run + 1 : 0;
    if (run === LESSON_LIMITS.cardsInARow + 1) report.add('warning', 'lesson.shape', { ...at, step: i + 1, label: 'card' }, `This is the ${run}rd teaching card in a row. Ask a question after at most ${LESSON_LIMITS.cardsInARow} cards so the learner does something with what they read.`);
  });
  const last = steps[steps.length - 1];
  if (last && typeof last === 'object' && !isGenerated(last) && last.type === 'card' && steps.length > 1) report.add('warning', 'lesson.shape', { ...at, step: steps.length, label: 'card' }, 'The lesson ends on a card. End with an exercise, so the last thing the learner does is succeed at the new idea.');

  const types = new Set(exercises.map((s) => (isGenerated(s) ? (getGenerator(String(s.generate))?.produces[0] ?? 'generated') : (s as { type: string }).type)));
  if (exercises.length >= minEx && types.size < LESSON_LIMITS.types[0]) report.add('warning', 'lesson.variety', at, `The lesson uses ${types.size} kind${types.size === 1 ? '' : 's'} of question (${[...types].join(', ')}). Use ${LESSON_LIMITS.types[0]} to ${LESSON_LIMITS.types[1] - 1}: the same idea asked in different ways sticks better.`);
  if (types.size > LESSON_LIMITS.types[1]) report.add('warning', 'lesson.variety', at, `The lesson uses ${types.size} kinds of question. More than ${LESSON_LIMITS.types[1]} in one short lesson makes the learner relearn the controls instead of the music; trim to the best few.`);
}

function checkCheckpoint(report: Report, unit: Unit, checkpoint: Checkpoint, ctx: CheckContext): void {
  const at = { unit: unit.id, extra: 'checkpoint' };
  const [min, max] = COURSE_LIMITS.checkpointSteps;
  if (checkpoint.maxMistakes !== undefined && (!Number.isInteger(checkpoint.maxMistakes) || checkpoint.maxMistakes < 0 || checkpoint.maxMistakes > 10)) {
    report.add('error', 'checkpoint.shape', at, `"maxMistakes" is ${JSON.stringify(checkpoint.maxMistakes)}; it must be a whole number from 0 to 10.`);
  }
  if (checkpoint.steps !== undefined) {
    if (!Array.isArray(checkpoint.steps) || checkpoint.steps.length < min || checkpoint.steps.length > max) {
      report.add('error', 'checkpoint.shape', at, `The checkpoint has ${Array.isArray(checkpoint.steps) ? checkpoint.steps.length : 0} questions; it needs ${min} to ${max} to judge a whole unit fairly.`);
    }
    (Array.isArray(checkpoint.steps) ? checkpoint.steps : []).forEach((step, i) => {
      const where = { ...at, step: i + 1, label: stepLabel(step) };
      checkExerciseStep(report, step, where, ctx, 'The step');
      if (step && typeof step === 'object' && !isGenerated(step) && step.type === 'flashcard') report.add('error', 'checkpoint.shape', where, 'A flashcard is self-rated, so it cannot test a learner out of a unit. Use an exercise that is graded.');
    });
  } else {
    const sample = checkpoint.sample ?? 10;
    if (!Number.isInteger(sample) || sample < min || sample > max) report.add('error', 'checkpoint.shape', at, `"sample" is ${JSON.stringify(checkpoint.sample)}; it must be a whole number from ${min} to ${max}.`);
    const available = unit.lessons.flatMap((l) => (Array.isArray(l.steps) ? l.steps : [])).filter((s) => s && typeof s === 'object' && (isGenerated(s) || (s.type !== 'card' && s.type !== 'flashcard')));
    const literal = available.filter((s) => !isGenerated(s)).length;
    const generated = available.length - literal;
    if (generated === 0 && literal < sample) report.add('error', 'checkpoint.shape', at, `The checkpoint draws ${sample} questions but the unit's lessons hold only ${literal} exercises. Lower "sample", add exercises, or author the checkpoint's own "steps".`);
  }
}

/**
 * Validate a course. Returns every problem found (an empty list means the course is ready).
 * Problems with severity `error` must be fixed; `warning`s are the guidelines of a good lesson.
 */
export function validateCourse(course: Course): CourseProblem[] {
  const report = new Report();
  if (!course || typeof course !== 'object') {
    report.add('error', 'course.shape', {}, 'The course is not an object.');
    return report.problems;
  }
  const ctx: CheckContext = { glossary: glossaryFor(course), level: course.level };
  checkSlug(report, course.id, 'course', {});
  report.text(course.title, 'courseTitle', 'The course title', {}, ctx);
  report.text(course.description, 'courseDescription', 'The course description', {}, ctx, true);
  if (!['mia', 'dev', 'elena', 'none'].includes(course.teacher)) report.add('error', 'course.shape', {}, `"teacher" is ${JSON.stringify(course.teacher)}; it must be 'mia', 'dev', 'elena' or 'none' (the Theory Path).`);
  if (!['beginner', 'intermediate', 'expert'].includes(course.level)) report.add('error', 'course.shape', {}, `"level" is ${JSON.stringify(course.level)}; it must be 'beginner', 'intermediate' or 'expert'.`);
  if (!Array.isArray(course.units) || course.units.length === 0) {
    report.add('error', 'course.shape', {}, 'The course has no units. Add at least one unit with lessons.');
    return report.problems;
  }

  // Glossary additions.
  const ownTerms = new Set<string>();
  (course.glossary ?? []).forEach((term, i) => {
    const at = { extra: `glossary term ${i + 1}${typeof term?.id === 'string' ? ` "${term.id}"` : ''}` };
    if (!checkSlug(report, term?.id, 'glossary', at)) return;
    if (ownTerms.has(term.id)) report.add('error', 'id.duplicate', at, `The glossary id "${term.id}" appears twice in course.glossary. Remove one.`);
    ownTerms.add(term.id);
    if (glossaryTerm(term.id)) report.add('warning', 'glossary.shadow', at, `"${term.id}" is already in the built-in glossary (${GLOSSARY.length} terms); this definition replaces it inside the course. Remove it unless the course really needs its own wording.`);
    if (typeof term.term !== 'string' || term.term.trim() === '' || term.term.length > TEXT_LIMITS.glossaryTerm) report.add('error', 'text.long', at, `The term must be 1 to ${TEXT_LIMITS.glossaryTerm} characters.`);
    if (typeof term.definition !== 'string' || term.definition.trim() === '' || term.definition.length > TEXT_LIMITS.glossaryDefinition) report.add('error', 'text.long', at, `The definition must be one line of 1 to ${TEXT_LIMITS.glossaryDefinition} characters.`);
  });

  const unitIds = new Set<string>();
  const lessonIds = new Map<string, string>();
  const skills = new Map<string, string>();
  const factIds = new Map<string, string>();
  const kind = activityKindOf(course);

  for (const unit of course.units) {
    const unitAt = { unit: typeof unit?.id === 'string' ? unit.id : '?' };
    if (!unit || typeof unit !== 'object') {
      report.add('error', 'course.shape', unitAt, 'The unit is not an object.');
      continue;
    }
    if (checkSlug(report, unit.id, 'unit', unitAt)) {
      if (unitIds.has(unit.id)) report.add('error', 'id.duplicate', unitAt, `The unit id "${unit.id}" is used twice. Unit ids must be unique in the course; rename one.`);
      unitIds.add(unit.id);
    }
    report.text(unit.title, 'unitTitle', 'The unit title', unitAt, ctx);
    report.text(unit.description, 'unitDescription', 'The unit description', unitAt, ctx);
    if (!THEMES.includes(unit.theme)) report.add('error', 'course.shape', unitAt, `"theme" is ${JSON.stringify(unit.theme)}; it must be one of: ${THEMES.join(', ')}.`);
    const lessons = Array.isArray(unit.lessons) ? unit.lessons : [];
    const [minLessons, maxLessons] = COURSE_LIMITS.lessonsPerUnit;
    if (lessons.length < minLessons || lessons.length > maxLessons) report.add('error', 'course.shape', unitAt, `The unit has ${lessons.length} lessons; a unit holds ${minLessons} to ${maxLessons}. ${lessons.length < minLessons ? 'Add lessons or merge the unit into its neighbour.' : 'Split the unit.'}`);

    for (const lesson of lessons) {
      const at = { unit: unitAt.unit, lesson: typeof lesson?.id === 'string' ? lesson.id : '?' };
      if (!lesson || typeof lesson !== 'object') {
        report.add('error', 'course.shape', at, 'The lesson is not an object.');
        continue;
      }
      if (checkSlug(report, lesson.id, 'lesson', at)) {
        const owner = lessonIds.get(lesson.id);
        if (owner !== undefined) report.add('error', 'id.duplicate', at, `The lesson id "${lesson.id}" is already used in unit "${owner}". Lesson ids must be unique in the whole course; rename one.`);
        else lessonIds.set(lesson.id, unit.id);
      }
      report.text(lesson.title, 'lessonTitle', 'The lesson title', at, ctx);
      report.text(lesson.teaches, 'teaches', '"teaches" (the one thing the lesson teaches)', at, ctx);

      const expectedSkill = kind === 'teacher-lesson' ? `teacher:${course.teacher}:${lesson.id}` : `theory:${unit.id}:${lesson.id}`;
      if (lesson.skill !== expectedSkill) {
        report.add('error', 'skill.format', at, `"skill" is ${JSON.stringify(lesson.skill)} but must be "${expectedSkill}": quests and achievements rely on that form (${kind === 'teacher-lesson' ? 'teacher:<teacher>:<lesson id>' : 'theory:<unit id>:<lesson id>'}).`);
      } else if (expectedSkill.length > 120) {
        report.add('error', 'skill.format', at, `The skill id "${expectedSkill}" is longer than 120 characters. Shorten the unit or lesson id.`);
      }
      if (typeof lesson.skill === 'string') {
        const owner = skills.get(lesson.skill);
        if (owner !== undefined && owner !== lesson.id) report.add('error', 'id.duplicate', at, `The skill "${lesson.skill}" is also advanced by lesson "${owner}". Each lesson has its own skill.`);
        skills.set(lesson.skill, lesson.id);
      }

      checkLessonShape(report, unit, lesson);
      const stepIds = new Set<string>();
      const lessonFacts = new Set((lesson.facts ?? []).map((f) => f?.id));
      (Array.isArray(lesson.steps) ? lesson.steps : []).forEach((step, i) => {
        const where = { ...at, step: i + 1, label: stepLabel(step) };
        if (!step || typeof step !== 'object') {
          report.add('error', 'exercise.shape', where, 'The step is not an object. A step is a card, an exercise or a generated exercise.');
          return;
        }
        const id = (step as { id?: unknown }).id;
        if (typeof id === 'string') {
          if (stepIds.has(id)) report.add('error', 'id.duplicate', where, `The step id "${id}" is used twice in this lesson. Step ids must be unique in a lesson; rename one or leave ids out.`);
          stepIds.add(id);
        }
        if (isGenerated(step)) report.steps(generatedProblems(step, ctx), where);
        else if (step.type === 'card') report.steps(cardProblems(step, ctx), where);
        else report.steps(exerciseProblems(step, ctx), where);
        const fact = (step as { fact?: unknown }).fact;
        if (fact !== undefined && !lessonFacts.has(fact as string)) report.add('error', 'fact.unknown', where, `"fact" is ${JSON.stringify(fact)}, but the lesson has no fact with that id. Use the id of an entry in the lesson's "facts", or remove "fact".`);
      });
      checkFacts(report, course, unit, lesson, ctx, factIds);
    }
    if (unit.checkpoint !== undefined) checkCheckpoint(report, unit, unit.checkpoint, ctx);
  }

  // Prerequisites: they must exist, must not be the lesson itself, and must not loop.
  const requires = prerequisites(course);
  const order = [...requires.keys()];
  for (const unit of course.units) {
    for (const lesson of Array.isArray(unit?.lessons) ? unit.lessons : []) {
      if (!lesson || lesson.requires === undefined) continue;
      const at = { unit: unit.id, lesson: lesson.id };
      if (!Array.isArray(lesson.requires)) {
        report.add('error', 'requires.shape', at, '"requires" must be a list of lesson ids ([] for a lesson that is open from the start), or be left out for "the lesson before this one".');
        continue;
      }
      for (const id of lesson.requires) {
        if (id === lesson.id) report.add('error', 'requires.cycle', at, 'The lesson requires itself. Remove its own id from "requires".');
        else if (!lessonIds.has(id)) report.add('error', 'requires.unknown', at, `"requires" names "${id}", which is not a lesson of this course. Use an existing lesson id (the lesson ids are: ${order.slice(0, 12).join(', ')}${order.length > 12 ? ', …' : ''}).`);
        else if (order.indexOf(id) > order.indexOf(lesson.id)) report.add('warning', 'requires.order', at, `The lesson requires "${id}", which comes later on the path. Move one of them so prerequisites come first.`);
      }
    }
  }
  const visiting = new Set<string>();
  const settled = new Set<string>();
  const reported = new Set<string>();
  const visit = (id: string, trail: string[]): void => {
    if (settled.has(id)) return;
    if (visiting.has(id)) {
      const loop = [...trail.slice(trail.indexOf(id)), id];
      const key = [...loop].sort().join('|');
      if (!reported.has(key)) {
        reported.add(key);
        report.add('error', 'requires.cycle', { unit: lessonIds.get(id), lesson: id }, `The prerequisites loop: ${loop.join(' → ')}. No lesson in the loop could ever be unlocked; remove one of these "requires".`);
      }
      return;
    }
    visiting.add(id);
    for (const need of requires.get(id) ?? []) if (requires.has(need)) visit(need, [...trail, id]);
    visiting.delete(id);
    settled.add(id);
  };
  for (const id of order) visit(id, []);

  return report.problems;
}

/** Only the problems that must be fixed. */
export function courseErrors(course: Course): CourseProblem[] {
  return validateCourse(course).filter((p) => p.severity === 'error');
}

/** Problems as a numbered list, one per line, for a test failure message or a console. */
export function formatProblems(problems: readonly CourseProblem[]): string {
  return problems.map((p, i) => `${i + 1}. [${p.severity}] ${p.text}`).join('\n');
}

/**
 * Throw when a course has errors, with every one of them in the message. For content tests:
 * `it('is valid', () => assertValidCourse(course))`.
 */
export function assertValidCourse(course: Course): void {
  const errors = courseErrors(course);
  if (errors.length > 0) throw new Error(`Course "${course?.id}" has ${errors.length} problem${errors.length === 1 ? '' : 's'}:\n${formatProblems(errors)}`);
}
