/**
 * The Theory Path screen's pure logic: routes, the map over the syllabus, "on the go" adaptation,
 * the placement search and the path geometry.
 */
import { describe, expect, it } from 'vitest';
import {
  formatProblems, generateExercise, isGenerated, practiceSource, startSession, validateCourse, type Lesson, type Step, type Unit,
} from '@/lessons';
import { createInitialState, type ProgressState } from '@/core/progress';
import { assembleTheory, loadWrittenUnits, writtenUnitIds } from '@/content/theory';
import { adaptCourse, adaptLesson, adaptUnit, conditionsLine, isListeningStep, isPlayStep, lessonNeeds } from './conditions';
import { completedUnits, focusUnit, pathView, unitAfter } from './path';
import { MAX_PROBES, nextProbe, probePool, probeVerdict, recordProbe, startPlacement, unitsKnown } from './placement';
import { learnParams, parseLearnParams, type LearnView } from './route';
import { nextPhase, swingOf, windingLayout } from './winding';

const NOW = Date.parse('2026-11-16T10:00:00Z');
const fresh = (): ProgressState => createInitialState({ now: NOW, timeZone: 'UTC' });
/** Progress with these lesson skills completed. */
function withDone(skills: string[]): ProgressState {
  const s = fresh();
  for (const id of skills) {
    s.skills[id] = {
      attempts: 1, completions: 1, perfects: 0, bestScore: 0, lastScore: 0, bestAccuracy: 0.9, lastAccuracy: 0.9, history: [90], timeSec: 120,
      mastery: 1, stars: 0, completed: true, lastAt: NOW, data: null,
    } as unknown as ProgressState['skills'][string];
  }
  return s;
}

describe('learn routes', () => {
  it('reads every address and writes it back', () => {
    const cases: Array<[string[], LearnView]> = [
      [[], { kind: 'map', unitId: null }],
      [['sound-and-pitch'], { kind: 'map', unitId: 'sound-and-pitch' }],
      [['sound-and-pitch', 'the-octave'], { kind: 'lesson', unitId: 'sound-and-pitch', lessonId: 'the-octave' }],
      [['sound-and-pitch', 'checkpoint'], { kind: 'checkpoint', unitId: 'sound-and-pitch' }],
      [['sound-and-pitch', 'practice'], { kind: 'practice', unitId: 'sound-and-pitch' }],
      [['review'], { kind: 'review' }],
      [['placement'], { kind: 'placement' }],
    ];
    for (const [params, view] of cases) {
      expect(parseLearnParams(params)).toEqual(view);
      expect(learnParams(view)).toEqual(params);
    }
  });
});

describe('on the go', () => {
  const play: Step = {
    type: 'play-note', prompt: 'Play {n:G}.', note: 'G2', octave: 'exact', explain: 'x',
    alternative: { type: 'true-false', statement: 'x', answer: true, explain: 'x' }, fact: 'f',
  };
  const listen: Step = { type: 'listen-choice', prompt: 'x', sound: { kind: 'notes', notes: ['E2'] }, options: [{ text: 'a', correct: true }, { text: 'b' }], explain: 'x' };
  const tf = (n: number): Step => ({ type: 'true-false', statement: `s${n}`, answer: true, explain: 'x' });
  const card: Step = { type: 'card', body: 'x' };
  const lesson = (steps: Step[]): Lesson => ({ id: 'l', title: 'L', teaches: 't', minutes: 2, skill: 'theory:u:l', steps });

  it('knows which steps play, listen or neither', () => {
    expect(isPlayStep(play)).toBe(true);
    expect(isPlayStep({ generate: 'play-note' })).toBe(true);
    expect(isListeningStep(listen)).toBe(true);
    expect(isListeningStep({ generate: 'higher-lower' })).toBe(true);
    expect(isListeningStep({ generate: 'rhythm-tap' })).toBe(true);
    expect(isListeningStep({ type: 'tap-rhythm', prompt: 'x', rhythm: { pattern: 'q q q q' }, tempo: 80, show: 'notation', start: 'first-tap', explain: 'x' })).toBe(false);
    expect(isListeningStep({ type: 'tap-rhythm', prompt: 'x', rhythm: { pattern: 'q q q q' }, tempo: 80, show: 'notation', explain: 'x' })).toBe(true);
    expect(isListeningStep({ type: 'choice', prompt: 'x', figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E2'] } }, options: [{ text: 'a', correct: true }, { text: 'b' }], explain: 'x' })).toBe(true);
    expect(isListeningStep(tf(1))).toBe(false);
    expect(isListeningStep(card)).toBe(false);
    expect(lessonNeeds(lesson([card, play, listen, tf(1), { generate: 'interval-name' }]))).toEqual({ play: 1, listening: 1, exercises: 4 });
  });

  it('runs a lesson as written at the guitar', () => {
    const l = lesson([card, play, listen, tf(1)]);
    expect(adaptLesson(l, { guitar: true, sound: true }).lesson).toBe(l);
    expect(conditionsLine({ guitar: true, sound: true })).toBeNull();
  });

  it('swaps play steps for their tapping versions without the guitar, keeping the fact', () => {
    const r = adaptLesson(lesson([card, play, listen, tf(1)]), { guitar: false, sound: true });
    expect(r.swapped).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.lesson.steps[1]).toMatchObject({ type: 'true-false', fact: 'f' });
    expect(r.lesson.steps[2]).toBe(listen);
    const drill = adaptLesson(lesson([card, { generate: 'play-note', params: { strings: [1], frets: [0, 5] } }, tf(1), tf(2)]), { guitar: false, sound: true });
    expect(drill.lesson.steps[1]).toEqual({ generate: 'note-on-string', params: { strings: [1], frets: [0, 5], naturals: true, ask: 'find' } });
  });

  it('leaves listening out without sound, and never ends a lesson on a card', () => {
    const r = adaptLesson(lesson([card, tf(1), tf(2), tf(3), card, listen]), { guitar: true, sound: false });
    expect(r.skipped).toBe(1);
    expect(r.needsSound).toBe(false);
    expect(r.lesson.steps).toHaveLength(4);
    expect(r.lesson.steps.at(-1)).toEqual(tf(3));
  });

  it('runs a listening lesson as written (with tapping for play steps) when too little would be left', () => {
    const r = adaptLesson(lesson([card, listen, listen, play, tf(1)]), { guitar: true, sound: false });
    expect(r.needsSound).toBe(true);
    expect(r.lesson.steps.filter((s) => !isGenerated(s) && s.type === 'listen-choice')).toHaveLength(2);
    expect(r.lesson.steps.some((s) => isPlayStep(s))).toBe(false);
  });

  it('turns listening facts into flashcards without sound', () => {
    const unit: Unit = {
      id: 'u', title: 'U', theme: 'basics', description: 'd',
      lessons: [{ ...lesson([card, tf(1), tf(2), tf(3)]), facts: [{ id: 'f', front: 'q', back: 'a', ask: { generate: 'interval-ear' } }, { id: 'g', front: 'q', back: 'a', ask: tf(9) as never }] }],
    };
    const quiet = adaptUnit(unit, { guitar: true, sound: false });
    expect(quiet.lessons[0].facts?.[0].ask).toBeUndefined();
    expect(quiet.lessons[0].facts?.[1].ask).toEqual(tf(9));
    expect(adaptUnit(unit, { guitar: true, sound: true })).toBe(unit);
  });

  it('keeps every written unit runnable in every condition (the engine still accepts it)', async () => {
    const theory = assembleTheory(await loadWrittenUnits());
    for (const c of [{ guitar: false, sound: true }, { guitar: true, sound: false }, { guitar: false, sound: false }]) {
      const course = adaptCourse(theory.course, c);
      const errors = validateCourse(course).filter((p) => p.severity === 'error' && p.code !== 'lesson.length');
      expect(errors, formatProblems(errors)).toEqual([]);
      for (const unit of course.units) {
        for (const l of unit.lessons) {
          if (!c.guitar || !c.sound) expect(l.steps.some(isPlayStep), `${l.id} has no play step without guitar/sound`).toBe(false);
          if (!c.sound && !adaptLesson(theory.course.units.find((u) => u.id === unit.id)!.lessons.find((x) => x.id === l.id)!, c).needsSound) {
            expect(l.steps.some(isListeningStep), `${l.id} has no listening step without sound`).toBe(false);
          }
          const s = startSession({ mode: 'lesson', course, lessonId: l.id }, fresh(), NOW, { seed: 7 });
          expect(s.total).toBeGreaterThan(0);
        }
        const drill = startSession(practiceSource(course, unit.id, fresh()), fresh(), NOW, { seed: 3 });
        expect(drill.total).toBeGreaterThan(0);
      }
    }
  });
});

describe('the map over the syllabus', () => {
  it('puts all 43 units in three stages, written or coming soon, and points at the first lesson', async () => {
    const theory = assembleTheory(await loadWrittenUnits());
    const view = pathView(theory, fresh(), NOW);
    expect(view.stages.map((s) => s.id)).toEqual(['beginner', 'intermediate', 'expert']);
    expect(view.stages.reduce((n, s) => n + s.units.length, 0)).toBe(43);
    expect(view.stages.reduce((n, s) => n + s.planned, 0)).toBe(280);
    const first = writtenUnitIds()[0];
    expect(view.next?.unit.path.outline.id).toBe(first);
    expect(view.next?.lesson.node.state).toBe('current');
    expect(view.started).toBe(false);
    for (const s of view.stages) {
      for (const u of s.units) {
        if (u.path.status === 'coming-soon') {
          expect(u.node).toBeNull();
          expect(u.lessons).toEqual([]);
          expect(u.planned.length).toBeGreaterThan(0);
        } else expect(u.lessons.length).toBe(u.planned.length);
      }
    }
    expect(focusUnit(view, null)?.path.outline.id).toBe(first);
    expect(focusUnit(view, 'no-such-unit')?.path.outline.id).toBe(first);
  });

  it('says which lessons play and listen, from the outline while loading and from the steps after', async () => {
    const units = await loadWrittenUnits();
    const loading = pathView(assembleTheory([]), fresh(), NOW).byLesson.get('a-sound-is-a-vibration')!;
    const loaded = pathView(assembleTheory(units), fresh(), NOW).byLesson.get('a-sound-is-a-vibration')!;
    expect(loading.lesson.ready).toBe(false);
    expect(loaded.lesson.ready).toBe(true);
    expect(loading.lesson.play).toBe(true);
    expect(loaded.lesson.play).toBe(true);
    expect(loaded.lesson.listening).toBe(false);
    expect(pathView(assembleTheory(units), fresh(), NOW).byLesson.get('pitch-high-and-low')!.lesson.listening).toBe(true);
  });

  it('moves on as lessons are done and notices a finished unit', async () => {
    const theory = assembleTheory(await loadWrittenUnits());
    const unit = theory.course.units[0];
    const skills = unit.lessons.map((l) => l.skill);
    const half = pathView(theory, withDone(skills.slice(0, 2)), NOW);
    expect(half.next?.lesson.node.id).toBe(unit.lessons[2].id);
    expect(half.stages[0].done).toBe(2);
    expect(completedUnits(half.map).has(unit.id)).toBe(false);
    const all = pathView(theory, withDone(skills), NOW);
    expect(completedUnits(all.map).has(unit.id)).toBe(true);
    expect(all.byUnit.get(unit.id)!.node!.checkpoint?.state).toBe('passed');
    expect(unitAfter(all, unit.id)).toBe(theory.course.units.length > 1 ? all.byUnit.get(theory.course.units[1].id) : null);
  });
});

describe('placement search', () => {
  /** Run the search against a learner who knows the first `k` of `n` units. */
  function run(n: number, k: number): { known: number; probes: number[] } {
    let s = startPlacement(n);
    const probes: number[] = [];
    for (let next = nextProbe(s); next !== null; next = nextProbe(s)) {
      probes.push(next);
      s = recordProbe(s, next, next < k);
    }
    return { known: unitsKnown(s), probes };
  }

  it('finds the level exactly, for every level, in few probes', () => {
    for (const n of [1, 2, 6, 13, 43]) {
      for (let k = 0; k <= n; k++) {
        const r = run(n, k);
        expect(r.known, `n=${n} k=${k}`).toBe(k);
        expect(r.probes.length).toBeLessThanOrEqual(MAX_PROBES);
      }
    }
  });

  it('starts at the beginning: a beginner is done after one probe', () => {
    expect(run(43, 0).probes).toEqual([0]);
    expect(run(43, 43).probes.slice(0, 6)).toEqual([0, 1, 3, 7, 15, 31]);
    expect(run(43, 1).probes).toEqual([0, 1]);
  });

  it('settles a probe on two answers, or three when they split', () => {
    expect(probeVerdict([true])).toBeNull();
    expect(probeVerdict([true, true])).toBe(true);
    expect(probeVerdict([false, false])).toBe(false);
    expect(probeVerdict([true, false])).toBeNull();
    expect(probeVerdict([true, false, true])).toBe(true);
    expect(probeVerdict([false, true, false])).toBe(false);
  });

  it('asks real questions from the unit: no play steps, no listening without sound', async () => {
    const [unit] = await loadWrittenUnits();
    const quiet = probePool(unit, { sound: false }, 1);
    expect(quiet.length).toBeGreaterThanOrEqual(3);
    for (const step of quiet) {
      expect(isPlayStep(step)).toBe(false);
      expect(isListeningStep(step)).toBe(false);
      const ex = isGenerated(step) ? generateExercise(step, { seed: 1, difficulty: 0.5, level: 'beginner' }) : step;
      expect(ex.type).not.toBe('flashcard');
    }
    expect(probePool(unit, { sound: true }, 1).some(isListeningStep)).toBe(true);
    expect(probePool(unit, { sound: true }, 1)).not.toEqual(probePool(unit, { sound: true }, 2));
  });
});

describe('winding path', () => {
  it('lays nodes down the column inside its width and carries the swing on', () => {
    const o = { width: 360, row: 108, node: 68, pad: 70, phase: 0 };
    const w = windingLayout(6, o);
    expect(w.points).toHaveLength(6);
    expect(w.height).toBe(70 * 2 + 5 * 108);
    const amp = swingOf(360, 68);
    for (const p of w.points) {
      expect(p.x).toBeGreaterThanOrEqual(180 - amp - 0.01);
      expect(p.x).toBeLessThanOrEqual(180 + amp + 0.01);
      expect(p.x - 34).toBeGreaterThanOrEqual(0);
      expect(p.x + 34).toBeLessThanOrEqual(360);
    }
    expect(w.points[0].x).toBe(180);
    expect(w.d.startsWith('M 180 70')).toBe(true);
    expect(w.d.match(/C /g)).toHaveLength(5);
    expect(nextPhase(0, 6)).toBe(6);
    expect(nextPhase(6, 6)).toBe(4);
    expect(windingLayout(0, o)).toEqual({ points: [], d: '', height: 0 });
    expect(swingOf(160, 68)).toBe(0);
  });
});
