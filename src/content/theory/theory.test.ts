/**
 * The Theory Path registry: every written unit is valid for the lesson engine (no errors and no
 * warnings) and follows its syllabus entry (ids, order, skills, minutes, prerequisites, facts,
 * planned exercise types and drills); the assembly keeps units in syllabus order and the path open
 * past units that are not written yet.
 *
 *   npx vitest run src/content/theory
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  courseMap, formatProblems, getGenerator, isGenerated, validateCourse, type Lesson, type Step, type Unit,
} from '@/lessons';
import { createInitialState } from '@/core/progress';
import {
  OUTLINE, THEORY_COURSE_ID, assembleTheory, courseForUnit, isUnitWritten, loadUnit, loadWrittenUnits, outlineLesson, outlineUnit,
  outlineUnits, resolveRequires, unitFileIds, writtenUnitIds,
} from './index';

interface PlanLesson { id: string; prerequisites: string[]; facts: string[]; exercises: Array<{ type: string }>; generators: string[]; minutes: number }
interface PlanUnit { id: string; lessons: PlanLesson[] }
interface Plan { course: { stages: Array<{ units: PlanUnit[] }> } }

const plan = JSON.parse(readFileSync(new URL('../plan/theory-path.json', import.meta.url), 'utf8')) as Plan;
const planUnits = new Map(plan.course.stages.flatMap((s) => s.units).map((u) => [u.id, u]));
const slug = (id: string): string => id.slice(id.indexOf('/') + 1);
/** Words a unit route uses after the unit id; no lesson may be called that. */
const RESERVED = ['checkpoint', 'practice', 'review', 'placement'];

/** The exercise types a step can show: its own type, a generator's output, a play step's alternative. */
function typesOf(step: Step): string[] {
  if (isGenerated(step)) return [...(getGenerator(String(step.generate))?.produces ?? [])];
  if (step.type === 'card') return [];
  return [step.type];
}

let units: Unit[] = [];
beforeAll(async () => {
  units = await loadWrittenUnits();
});

describe('theory registry: files', () => {
  it('has a file only for units of the syllabus, named after the unit', async () => {
    for (const id of unitFileIds()) {
      expect(outlineUnit(id), `units/${id}.ts is not a unit of the syllabus (theory-path.json)`).not.toBeNull();
      const unit = await loadUnit(id);
      expect(unit?.id, `units/${id}.ts must export default the unit with id "${id}"`).toBe(id);
    }
  });

  it('loads every written unit, in syllabus order', () => {
    expect(units.map((u) => u.id)).toEqual(writtenUnitIds());
    expect(writtenUnitIds().length).toBeGreaterThan(0);
    for (const id of writtenUnitIds()) expect(isUnitWritten(id)).toBe(true);
  });

  it('keeps unit and lesson ids clear of the route words', () => {
    for (const p of outlineUnits()) {
      expect(RESERVED).not.toContain(p.unit.id);
      for (const l of p.unit.lessons) expect(RESERVED, `${p.unit.id}/${l.id}`).not.toContain(l.id);
    }
  });
});

describe('theory registry: the lesson engine accepts the course', () => {
  it('has no errors and no warnings', () => {
    const problems = validateCourse(assembleTheory(units).course);
    expect(problems, formatProblems(problems)).toEqual([]);
  });
});

describe('theory registry: each written unit follows its syllabus entry', () => {
  it('matches the planned ids, order, skills, minutes, theme and checkpoint', () => {
    for (const unit of units) {
      const planned = planUnits.get(unit.id)!;
      const outline = outlineUnit(unit.id)!.unit;
      expect(unit.lessons.map((l) => l.id), `${unit.id}: lesson ids and order`).toEqual(planned.lessons.map((l) => slug(l.id)));
      expect(unit.theme, `${unit.id}: theme (THEORY-PATH.md table)`).toBe(outline.theme);
      expect(unit.checkpoint, `${unit.id}: every unit has a checkpoint`).toBeDefined();
      unit.lessons.forEach((lesson, i) => {
        const p = planned.lessons[i];
        const at = `${unit.id}/${lesson.id}`;
        expect(lesson.skill, `${at}: skill`).toBe(`theory:${unit.id}:${lesson.id}`);
        expect(lesson.minutes, `${at}: minutes`).toBe(p.minutes);
      });
    }
  });

  it('states the planned prerequisites (or leaves them to the registry)', () => {
    for (const unit of units) {
      for (const lesson of unit.lessons) {
        const planned = outlineLesson(lesson.id)!.lesson.requires;
        if (lesson.requires !== undefined) expect([...lesson.requires].sort(), `${unit.id}/${lesson.id}: requires`).toEqual([...planned].sort());
      }
    }
  });

  it('turns every planned fact into a review card', () => {
    for (const unit of units) {
      unit.lessons.forEach((lesson, i) => {
        const p = planUnits.get(unit.id)!.lessons[i];
        expect(lesson.facts?.length ?? 0, `${unit.id}/${lesson.id}: one fact per planned fact`).toBe(p.facts.length);
      });
    }
  });

  it('asks every planned kind of exercise and runs every planned drill', () => {
    for (const unit of units) {
      unit.lessons.forEach((lesson: Lesson, i) => {
        const p = planUnits.get(unit.id)!.lessons[i];
        const at = `${unit.id}/${lesson.id}`;
        const types = new Set(lesson.steps.flatMap(typesOf));
        for (const e of p.exercises) expect(types.has(e.type), `${at}: the syllabus plans a ${e.type} exercise`).toBe(true);
        const drills = new Set(lesson.steps.filter(isGenerated).map((s) => String(s.generate)));
        for (const g of p.generators) expect(drills.has(g), `${at}: the syllabus plans the ${g} drill`).toBe(true);
      });
    }
  });
});

describe('theory registry: assembly', () => {
  it('numbers the 43 units of the three stages and marks the unwritten ones coming soon', () => {
    const theory = assembleTheory([]);
    expect(theory.units).toHaveLength(OUTLINE.stages.reduce((n, s) => n + s.units.length, 0));
    expect(theory.units.map((u) => u.number)).toEqual(theory.units.map((_u, i) => i + 1));
    expect(theory.units.map((u) => u.stage).filter((s, i, a) => a.indexOf(s) === i)).toEqual(['beginner', 'intermediate', 'expert']);
    for (const u of theory.units) expect(u.status).toBe(isUnitWritten(u.outline.id) ? 'loading' : 'coming-soon');
    expect(theory.course.units.map((u) => u.id)).toEqual(writtenUnitIds());
    expect(theory.complete).toBe(writtenUnitIds().length === 0);
  });

  it('draws a written unit from the outline while it loads, with the same lesson ids, skills and states', () => {
    const before = assembleTheory([]);
    const after = assembleTheory(units);
    expect(after.complete).toBe(true);
    expect(after.units.filter((u) => u.status === 'ready').map((u) => u.outline.id)).toEqual(writtenUnitIds());
    const strip = (c: typeof before) => c.course.units.map((u) => u.lessons.map((l) => [l.id, l.skill, l.minutes, l.requires]));
    expect(strip(before)).toEqual(strip(after));
    const progress = createInitialState({ now: Date.now(), timeZone: 'UTC' });
    const states = (c: typeof before) => courseMap(c.course, progress, Date.now()).units.map((u) => u.lessons.map((l) => l.state));
    expect(states(before)).toEqual(states(after));
  });

  it('opens the path past units that are not written yet', () => {
    // Pretend only the first lesson exists: "seven-letters" (unit 3) then waits on it, through
    // the-octave -> frets-shorten-the-string -> loud-is-not-high / pitch-high-and-low.
    expect(resolveRequires(['seven-letters'], new Set(['a-sound-is-a-vibration']))).toEqual(['a-sound-is-a-vibration']);
    // A gap in the middle of a unit: the lesson after it waits on the lesson before it.
    expect(resolveRequires(['the-octave'], new Set(['frets-shorten-the-string', 'tone-colour']))).toEqual(['frets-shorten-the-string']);
    // Present lessons are kept as they are, in order, without duplicates.
    expect(resolveRequires(['loud-is-not-high', 'pitch-high-and-low', 'loud-is-not-high'], new Set(['loud-is-not-high', 'pitch-high-and-low']))).toEqual([
      'loud-is-not-high',
      'pitch-high-and-low',
    ]);
    // Nothing present: nothing to wait for.
    expect(resolveRequires(['tone-colour'], new Set())).toEqual([]);
    // Every lesson of the assembled course waits only on lessons that are in it.
    const theory = assembleTheory(units);
    const present = new Set(theory.course.units.flatMap((u) => u.lessons.map((l) => l.id)));
    for (const u of theory.course.units) for (const l of u.lessons) for (const r of l.requires ?? []) expect(present.has(r), `${l.id} requires ${r}`).toBe(true);
  });

  it('runs each unit at the level of its stage', () => {
    const theory = assembleTheory(units);
    expect(theory.course.id).toBe(THEORY_COURSE_ID);
    expect(theory.course.teacher).toBe('none');
    expect(courseForUnit(theory, 'sound-and-pitch').level).toBe('beginner');
    expect(courseForUnit(theory, 'intervals-2').level).toBe('intermediate');
    expect(courseForUnit(theory, 'jazz-harmony').level).toBe('expert');
    expect(courseForUnit(theory, 'jazz-harmony').id).toBe(THEORY_COURSE_ID);
  });
});
