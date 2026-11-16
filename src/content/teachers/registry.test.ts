/**
 * The teachers' courses, checked: the outline equals the reviewed plan, every written unit matches
 * its plan entry and passes the lesson engine's validator with no warning, every task leads to a
 * real address, every song and technique exercise it names exists (or a fallback says what to do
 * instead), and the music in the lessons is the music in the library. Run:
 * `npx vitest run src/content/teachers`.
 */
import { describe, expect, it } from 'vitest';
import plan from '@/content/plan/teachers.json';
import { ROUTE_BY_NAME } from '@/app/routes';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { parseSixTab } from '@/core/song';
import { parsePlayerParams } from '@/features/player/model/params';
import { TEXT_LIMITS, assertValidCourse, formatProblems, glossaryFor, looseSymbols, parseRichText, phraseMidi, textLength, validateCourse, type PlayPhraseExercise, type RichText } from '@/lessons';
import {
  OUTLINE, PROFILES, TASK_TOOLS, TEACHER_KEYS, assembleCourse, compileCourse, courseMeta, hasArt, isTaskStep, loadTeacherCourse, strayUnitFiles, taskSong,
  writtenUnitIds, type TaskStep, type TeacherCourse, type TeacherKey, type TeacherUnit,
} from './index';

interface PlanLesson { id: string; title: string; kind: string; minutes: number }
interface PlanUnit { id: string; title: string; goal: string; lessons: PlanLesson[] }
interface PlanCourse { id: string; title: string; units: PlanUnit[] }
const PLAN = (plan as { courses: PlanCourse[] }).courses;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ART = new Set(['guitar-parts', 'posture', 'pick-grip', 'fretting']);
const RESERVED = new Set(['checkpoint', 'practice', 'review']);

const courses = new Map<TeacherKey, TeacherCourse>();
async function course(t: TeacherKey): Promise<TeacherCourse> {
  if (!courses.has(t)) courses.set(t, await loadTeacherCourse(t));
  return courses.get(t)!;
}

/** Problems of a text the engine does not see (task fallbacks, milestone words). */
function textProblems(text: RichText, limit: number, glossary: ReturnType<typeof glossaryFor>): string[] {
  const out: string[] = [];
  const parsed = parseRichText(text, { glossary });
  out.push(...parsed.problems);
  if (textLength(text, { glossary }) > limit) out.push(`longer than ${limit} characters`);
  for (const s of looseSymbols(text, { glossary })) out.push(`untagged music symbol "${s.symbol}" (write ${s.tag})`);
  return out;
}

describe('the outline', () => {
  it('is the reviewed plan, unit by unit and lesson by lesson', () => {
    const fromPlan = PLAN.map((c) => ({
      id: c.id,
      title: c.title,
      units: c.units.map((u) => ({ id: u.id, title: u.title, goal: u.goal, lessons: u.lessons.map((l) => [l.id.split('/')[2], l.title, l.kind, l.minutes]) })),
    }));
    expect(JSON.parse(JSON.stringify(OUTLINE))).toEqual(fromPlan);
  });

  it('has the three teachers in order, and a profile for each', () => {
    expect(OUTLINE.map((c) => c.id)).toEqual([...TEACHER_KEYS]);
    for (const t of TEACHER_KEYS) {
      expect(PROFILES[t].courseTitle).toBe(OUTLINE.find((c) => c.id === t)!.title);
      expect(PROFILES[t].courseDescription.length).toBeLessThanOrEqual(TEXT_LIMITS.courseDescription);
    }
  });

  it('never uses a lesson slug that would collide with a route word', () => {
    for (const c of OUTLINE) for (const u of c.units) for (const [slug] of u.lessons) expect(RESERVED.has(slug), slug).toBe(false);
  });
});

describe('the profiles', () => {
  it('are plain ASCII text', () => {
    // eslint-disable-next-line no-control-regex
    expect(JSON.stringify(PROFILES)).toMatch(/^[\x00-\x7f]*$/);
  });
});

describe('the registry', () => {
  it('has no unit file that is not a unit of the plan', () => {
    expect(strayUnitFiles()).toEqual([]);
  });

  it('knows which units are written without loading them', () => {
    expect(writtenUnitIds('mia')).toContain('mia-hello-guitar');
  });

  it('assembles units in plan order and tolerates units not written yet', () => {
    const fake = (id: string): TeacherUnit => ({ id, title: id.slice(0, 32), theme: 'basics', description: 'x', lessons: [] });
    const outline = OUTLINE.find((c) => c.id === 'mia')!;
    const third = outline.units[2].id;
    const first = outline.units[0].id;
    // Loaded out of order, with a gap: comes back in plan order, the gap listed as upcoming.
    const tc = assembleCourse('mia', new Map([[third, fake(third)], [first, fake(first)]]), ['broken-unit']);
    expect(tc.units.map((u) => u.id)).toEqual([first, third]);
    expect(tc.upcoming.map((u) => u.id)).toEqual(outline.units.filter((u) => u.id !== first && u.id !== third).map((u) => u.id));
    expect(tc.failed).toEqual(['broken-unit']);
    expect(tc.course.units.map((u) => u.id)).toEqual([first, third]);
    expect(tc.plannedLessons).toBe(PLAN[0].units.reduce((n, u) => n + u.lessons.length, 0));
    // Nothing written: an empty course, the whole plan upcoming.
    const none = assembleCourse('elena', new Map());
    expect(none.course.units).toEqual([]);
    expect(none.upcoming.length).toBe(PLAN[2].units.length);
    expect(none.lesson('anything')).toBeNull();
  });
});

describe.each(TEACHER_KEYS)('the written units of %s', (teacher) => {
  it('match their plan entries', async () => {
    const tc = await course(teacher);
    expect(tc.failed).toEqual([]);
    const planCourse = PLAN.find((c) => c.id === teacher)!;
    for (const unit of tc.units) {
      const p = planCourse.units.find((u) => u.id === unit.id);
      expect(p, `unit ${unit.id} is in the plan`).toBeTruthy();
      expect(unit.lessons.map((l) => l.id), `unit ${unit.id}: one lesson per plan entry, in order`).toEqual(p!.lessons.map((l) => l.id.split('/')[2]));
      for (const l of unit.lessons) expect(l.skill).toBe(`teacher:${teacher}:${l.id}`);
      // The plan's milestone lesson is the unit's performance.
      const milestone = p!.lessons.find((l) => l.kind === 'milestone');
      if (milestone) expect(unit.milestone?.lesson, `unit ${unit.id} declares its milestone`).toBe(milestone.id.split('/')[2]);
    }
  });

  it('pass the lesson engine with no error and no warning', async () => {
    const tc = await course(teacher);
    if (tc.units.length === 0) return;
    assertValidCourse(tc.course);
    const problems = validateCourse(tc.course);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('have tasks that lead somewhere real', async () => {
    const tc = await course(teacher);
    const glossary = glossaryFor(tc.course);
    for (const unit of tc.units) {
      for (const lesson of unit.lessons) {
        const ids = new Set<string>();
        for (const step of lesson.steps) {
          const id = (step as { id?: string }).id;
          if (id) {
            expect(ids.has(id), `${lesson.id}: step id "${id}" is unique`).toBe(false);
            ids.add(id);
          }
          if (hasArt(step)) {
            expect(ART.has(step.art), `${lesson.id}: art "${step.art}"`).toBe(true);
            expect(step.id, `${lesson.id}: a card with art has an id`).toMatch(SLUG);
          }
          if (!isTaskStep(step)) continue;
          const where = `${unit.id} > ${lesson.id} > task "${step.id}"`;
          expect(step.id, where).toMatch(SLUG);
          expect(step.minutes, where).toBeGreaterThanOrEqual(1);
          expect(step.minutes, where).toBeLessThanOrEqual(20);
          for (const target of [step, ...(step.fallback ? [step.fallback] : [])] as Array<Pick<TaskStep, 'tool' | 'params'>>) {
            expect(TASK_TOOLS[target.tool], `${where}: tool ${target.tool}`).toBeTruthy();
            expect(ROUTE_BY_NAME[TASK_TOOLS[target.tool].route], `${where}: route of ${target.tool}`).toBeTruthy();
            for (const p of target.params ?? []) expect(p, `${where}: param`).toMatch(SLUG);
            if (target.tool === 'technique') expect(getExercise(target.params?.[0] ?? ''), `${where}: technique exercise ${target.params?.[0]}`).toBeTruthy();
            if (target.tool === 'player') {
              const req = parsePlayerParams(target.params ?? []);
              expect(req.songId, where).toBe(target.params?.[0]);
              expect(req.section, `${where}: every Player param is understood`).toBeNull();
            }
          }
          const song = taskSong(step);
          if (song && !songEntry(song)) expect(step.fallback, `${where}: "${song}" is not in the song library, so the task needs a fallback`).toBeTruthy();
          if (step.fallback) expect(textProblems(step.fallback.body, TEXT_LIMITS.cardBody, glossary), `${where}: fallback`).toEqual([]);
          if (step.fallback?.title) expect(textProblems(step.fallback.title, TEXT_LIMITS.cardTitle, glossary), `${where}: fallback title`).toEqual([]);
          // A lesson saved before anything was done is not kept, so a task never opens a lesson.
          expect(lesson.steps.indexOf(step), `${where}: a task is not the first step`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('end each unit with a performance the microphone can hear, and a celebration', async () => {
    const tc = await course(teacher);
    const glossary = glossaryFor(tc.course);
    for (const unit of tc.units) {
      const m = unit.milestone;
      if (!m) continue;
      const lesson = unit.lessons.find((l) => l.id === m.lesson);
      expect(lesson, `${unit.id}: milestone lesson ${m.lesson}`).toBeTruthy();
      const step = lesson!.steps.find((s) => (s as { id?: string }).id === m.step) as { type?: string; alternative?: unknown } | undefined;
      expect(step && ['play-note', 'play-chord', 'play-phrase'].includes(step.type ?? ''), `${unit.id}: the performance is a play step`).toBe(true);
      expect(step!.alternative, `${unit.id}: the performance has a no-microphone way`).toBeTruthy();
      expect(lesson!.steps[lesson!.steps.length - 1], `${unit.id}: the performance ends its lesson`).toBe(step);
      expect(textProblems(m.celebrate, TEXT_LIMITS.explain, glossary), `${unit.id}: celebrate`).toEqual([]);
      if (m.song) expect(songEntry(m.song), `${unit.id}: milestone song ${m.song}`).toBeTruthy();
    }
  });
});

describe('Mia', () => {
  it('never says vibrato or dominant (she never teaches them)', async () => {
    const tc = await course('mia');
    expect(JSON.stringify(tc.units)).not.toMatch(/vibrato|dominant/i);
  });

  it('plays Hot Cross Buns exactly as the library has it (bar 3 as quarter notes on day one)', async () => {
    const tc = await course('mia');
    const lesson = tc.lesson('first-week-show');
    if (!lesson) return;
    const show = lesson.steps.find((s) => (s as { id?: string }).id === 'show') as PlayPhraseExercise;
    const { song, errors } = parseSixTab(await loadSongText('hot-cross-buns'));
    expect(errors).toEqual([]);
    const melody = song!.tracks.find((t) => t.role === 'lead')!;
    const library = melody.measures.flatMap((m) => m.beats).filter((b) => b.notes.length > 0).map((b) => b.notes[0].midi);
    // Version A plays G G A A where the library's version B plays G G G G A A A A: compare with repeats collapsed.
    const squash = (xs: number[]) => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
    expect(squash(phraseMidi(show))).toEqual(squash(library));
    expect(phraseMidi(show)).toEqual([59, 57, 55, 59, 57, 55, 55, 55, 57, 57, 59, 57, 55]);
  });

  it("describes the Open-String Duet as the library's student part has it", async () => {
    const tc = await course('mia');
    const { song, errors } = parseSixTab(await loadSongText('st-open-string-duet'));
    expect(errors).toEqual([]);
    const part = song!.tracks[0];
    const bars = part.measures.map((m) => m.beats.filter((b) => b.notes.length > 0));
    // Bars 1-4 string 6, 5-8 string 5, 9-12 string 4, then E A D E: what the lesson's card says.
    const strings = bars.map((b) => [...new Set(b.map((x) => x.notes[0].string))].join(','));
    expect(strings).toEqual(['6', '6', '6', '6', '5', '5', '5', '5', '4', '4', '4', '4', '6', '5', '4', '6']);
    expect(bars.flat().every((b) => b.notes[0].fret === 0)).toBe(true);
    // The card's tab is bars 1 and 3 of the part, note for note.
    const card = tc.lesson('sit-and-hold')!.steps.find((s) => (s as { title?: string }).title === 'The Open-String Duet') as { figure: { notes: Array<{ string: number; duration: string }> } };
    const durations = (bar: typeof bars[number]) => bar.map((b) => (b.duration === 1920 ? 'h' : b.duration === 960 ? 'q' : String(b.duration)));
    expect(card.figure.notes.map((n) => n.duration)).toEqual([...durations(bars[0]), ...durations(bars[2])]);
    expect(card.figure.notes.every((n) => n.string === 6)).toBe(true);
  });

  it('teaches the open strings as standard tuning sounds them', async () => {
    const tc = await course('mia');
    const lesson = tc.lesson('meet-your-guitar')!;
    const plays = lesson.steps.filter((s) => (s as { type?: string }).type === 'play-note') as Array<{ note: string; where: { string: number; fret: number } }>;
    const open: Record<number, string> = { 6: 'E2', 5: 'A2', 4: 'D3', 3: 'G3', 2: 'B3', 1: 'E4' };
    for (const p of plays) expect(p.note).toBe(open[p.where.string]);
  });
});

describe('the course meta', () => {
  it('compiles an engine course for each teacher', () => {
    for (const t of TEACHER_KEYS) {
      const c = compileCourse(courseMeta(t), []);
      expect(c.teacher).toBe(t);
      expect(c.id).toBe(t);
    }
  });
});
