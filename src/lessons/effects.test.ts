/**
 * The session's effects against the REAL progress store: XP, hearts, crowns, spaced repetition,
 * checkpoints and practice must move exactly as the pure session predicts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_HEARTS, dueReviews, heartsOf, setProgressStore, xpFor, type ProgressState } from '@/core/progress';
import { makeRig, type TestRig } from '@/core/progress/testkit';
import { storedDifficulty } from './adaptive';
import { applyEffects, progressPort, sessionReport, type EffectResults } from './effects';
import { courseMap } from './map';
import { clearSession, loadSession, saveSession, sessionStorageKey } from './persist';
import { FACT_CARD_KIND, createSession, currentStep, reduceSession, type SessionAction, type SessionState } from './session';
import { dueFactCards, practiceSource, reviewSource, sessionOptionsFor, startSession } from './start';
import { FIXTURE, TEACHER_FIXTURE, wrongFor } from './test-fixtures';
import { solve } from './grade';

/** Drives a session and applies every effect to the rig's store, as a screen would. */
class Live {
  results: EffectResults = { activity: null, heart: null, cardsAdded: 0, reviews: [], skillsMarked: [] };
  constructor(public rig: TestRig, public state: SessionState) {}

  get now(): number {
    return this.rig.clock.now();
  }

  dispatch(action: SessionAction): this {
    const step = reduceSession(this.state, action);
    this.state = step.state;
    const r = applyEffects(step.effects, progressPort(this.rig.store));
    this.results = {
      activity: r.activity ?? this.results.activity,
      heart: r.heart ?? this.results.heart,
      cardsAdded: this.results.cardsAdded + r.cardsAdded,
      reviews: [...this.results.reviews, ...r.reviews],
      skillsMarked: [...this.results.skillsMarked, ...r.skillsMarked],
    };
    return this;
  }

  step(right: boolean): this {
    const current = currentStep(this.state);
    if (current?.kind === 'exercise') {
      this.rig.clock.advance(4000);
      this.dispatch({ type: 'answer', answer: right ? solve(current.exercise) : wrongFor(current.exercise), at: this.now });
    }
    this.rig.clock.advance(1500);
    return this.dispatch({ type: 'continue', at: this.now });
  }

  finish(): this {
    for (let i = 0; i < 300 && this.state.phase !== 'done'; i++) this.step(true);
    return this;
  }

  get progress(): ProgressState {
    return this.rig.store.getState();
  }
}

function lesson(rig: TestRig, lessonId: string, course = FIXTURE): Live {
  return new Live(rig, startSession({ mode: 'lesson', course, lessonId }, rig.store.getState(), rig.clock.now()));
}

afterEach(() => {
  setProgressStore(null);
  for (const mode of ['lesson', 'checkpoint', 'practice', 'review'] as const) clearSession(mode);
});

describe('a completed lesson', () => {
  it('awards the predicted XP, completes the skill, earns the predicted crown and adds the fact cards', () => {
    const rig = makeRig();
    rig.actions.setDailyGoal(10);
    const live = lesson(rig, 'a').finish();
    const summary = live.state.summary!;
    const report = sessionReport(summary, live.results);

    expect(live.results.activity).not.toBeNull();
    expect(report.xpAwarded).toBe(summary.xp);
    expect(report.xpAwarded).toBe(xpFor('theory-lesson', { perfect: true }));
    expect(live.progress.xp.total).toBe(summary.xp);
    expect(live.progress.xp.byTag.theory).toBe(summary.xp);

    const skill = live.progress.skills['theory:u1:a'];
    expect(skill).toMatchObject({ completed: true, mastery: 1, attempts: 1, completions: 1, perfects: 1, bestAccuracy: 1 });
    expect(summary.crown).toEqual({ before: 0, after: 1, gained: true });
    expect(report.crown).toEqual({ before: 0, after: skill.mastery, gained: true });
    expect(storedDifficulty(skill)).toBeCloseTo(live.state.difficulty, 2);

    expect(live.results.cardsAdded).toBe(2);
    expect(report.factsAdded).toBe(2);
    expect(Object.values(live.progress.srs.items).map((c) => [c.id, c.kind, c.ref, c.state])).toEqual([
      ['fixture:a-fact-a', FACT_CARD_KIND, 'a', 'new'],
      ['fixture:a-fact-b', FACT_CARD_KIND, 'a', 'new'],
    ]);
    expect(live.progress.log[0]).toMatchObject({ kind: 'theory-lesson', title: 'Lesson a', skillId: 'theory:u1:a', durationSec: summary.durationSec });
    expect(report).toMatchObject({ multiplier: 1, leveledUp: false, goalMetNow: true, streakExtended: true, streak: 1, hearts: MAX_HEARTS });
    expect(rig.eventsOf('xp-gained')).toHaveLength(1);
    expect(rig.eventsOf('skill-levelled-up')[0]).toMatchObject({ id: 'theory:u1:a', from: 0, to: 1 });
  });

  it('doing it again does not add the cards twice, and the crown prediction keeps matching the store', () => {
    const rig = makeRig();
    const crowns: number[] = [];
    for (let run = 0; run < 6; run++) {
      rig.clock.minutes(30);
      const live = lesson(rig, 'a').finish();
      const report = sessionReport(live.state.summary!, live.results);
      const stored = live.progress.skills['theory:u1:a'].mastery;
      expect(live.state.summary!.crown!.after, `run ${run}`).toBe(stored);
      expect(report.crown!.after).toBe(stored);
      crowns.push(stored);
      expect(live.results.cardsAdded).toBe(run === 0 ? 2 : 0);
    }
    // One finished attempt for the first crown, then two each for the second and third.
    expect(crowns).toEqual([1, 1, 2, 2, 3, 3]);
    expect(Object.keys(rig.store.getState().srs.items)).toHaveLength(2);
  });

  it('a teacher lesson reports as one', () => {
    const rig = makeRig();
    const live = lesson(rig, 'ma', TEACHER_FIXTURE).finish();
    expect(live.progress.skills['teacher:mia:ma']).toMatchObject({ completed: true, mastery: 1 });
    expect(live.progress.xp.total).toBe(xpFor('teacher-lesson', { perfect: true }));
    expect(live.progress.stats['teacher.mia']).toBe(1);
    expect(live.progress.log[0].kind).toBe('teacher-lesson');
  });

  it('an XP boost shows in the report, not in the pure summary', () => {
    const rig = makeRig();
    rig.actions.startXpBoost(2, 15);
    const live = lesson(rig, 'a').finish();
    const report = sessionReport(live.state.summary!, live.results);
    expect(report.multiplier).toBe(2);
    expect(report.xpAwarded).toBe(live.state.summary!.xp * 2);
    expect(live.progress.xp.total).toBe(report.xpAwarded);
  });
});

describe('hearts against the store', () => {
  it('every wrong answer in a theory lesson takes a heart from the store, in step with the session', () => {
    const rig = makeRig();
    const live = lesson(rig, 'a');
    expect(live.state.hearts).toBe(MAX_HEARTS);
    live.step(true).step(false);
    expect(live.state.hearts).toBe(MAX_HEARTS - 1);
    expect(heartsOf(live.progress, live.now).count).toBe(MAX_HEARTS - 1);
    expect(live.results.heart).toMatchObject({ remaining: MAX_HEARTS - 1, lost: true, empty: false });
    live.step(false);
    expect(heartsOf(live.progress, live.now).count).toBe(live.state.hearts);
    expect(rig.eventsOf('heart-lost')).toHaveLength(2);
  });

  it('running out ends the lesson with half XP scaled by progress, no crown and no cards', () => {
    const rig = makeRig();
    for (let i = 0; i < MAX_HEARTS - 1; i++) rig.actions.loseHeart();
    const live = lesson(rig, 'a');
    expect(live.state.hearts).toBe(1);
    live.step(true).step(true).step(false);
    expect(live.state.outcome).toBe('out-of-hearts');
    expect(heartsOf(live.progress, live.now)).toMatchObject({ count: 0, empty: true });
    const skill = live.progress.skills['theory:u1:a'];
    expect(skill).toMatchObject({ completed: false, mastery: 0, attempts: 1, completions: 0 });
    expect(live.progress.xp.total).toBe(live.state.summary!.xp);
    expect(live.state.summary!.xp).toBe(Math.floor(xpFor('theory-lesson', { completed: false }) * (2 / 6)));
    expect(Object.keys(live.progress.srs.items)).toEqual([]);
    expect(sessionReport(live.state.summary!, live.results)).toMatchObject({ hearts: 0, next: 'practice', crown: { before: 0, after: 0, gained: false } });
    // A new lesson cannot start now.
    expect(lesson(rig, 'b').state).toMatchObject({ phase: 'done', outcome: 'out-of-hearts' });
  });

  it('a practice session gives hearts back, exactly as the progress rules say', () => {
    const rig = makeRig();
    for (let i = 0; i < MAX_HEARTS; i++) rig.actions.loseHeart();
    expect(heartsOf(rig.store.getState(), rig.clock.now()).empty).toBe(true);
    const live = new Live(rig, startSession({ mode: 'practice', course: FIXTURE, unitId: 'u1', size: 5 }, rig.store.getState(), rig.clock.now()));
    expect(live.state.hearts).toBeNull();
    live.step(false);
    expect(heartsOf(live.progress, live.now).count).toBe(0);
    live.finish();
    expect(live.state.outcome).toBe('completed');
    expect(heartsOf(live.progress, live.now).count).toBe(MAX_HEARTS);
    expect(sessionReport(live.state.summary!, live.results).hearts).toBe(MAX_HEARTS);
    expect(live.progress.log[0].kind).toBe('practice');
    expect(lesson(rig, 'a').state.phase).toBe('step');
  });

  it('with unlimited hearts nothing is ever lost', () => {
    const rig = makeRig();
    rig.actions.setPrefs({ unlimitedHearts: true });
    const live = lesson(rig, 'a');
    expect(live.state.hearts).toBeNull();
    live.step(true).step(false).step(false).step(false);
    expect(live.results.heart).toBeNull();
    expect(rig.eventsOf('heart-lost')).toEqual([]);
    expect(live.finish().state.outcome).toBe('completed');
  });
});

describe('spaced repetition against the store', () => {
  function withCards(): TestRig {
    const rig = makeRig();
    lesson(rig, 'a').finish();
    lesson(rig, 'b').finish();
    return rig;
  }

  it('the facts of finished lessons become due cards, and a review grades each one', () => {
    const rig = withCards();
    const due = dueFactCards([FIXTURE], rig.store.getState(), rig.clock.now());
    expect(due.map((c) => c.id)).toEqual(['fixture:a-fact-a', 'fixture:a-fact-b', 'fixture:b-fact-a', 'fixture:b-fact-b']);
    expect(dueFactCards([TEACHER_FIXTURE], rig.store.getState(), rig.clock.now())).toEqual([]);
    expect(dueFactCards([FIXTURE], rig.store.getState(), rig.clock.now(), 2)).toHaveLength(2);

    const source = reviewSource([FIXTURE], rig.store.getState(), rig.clock.now());
    const live = new Live(rig, startSession(source, rig.store.getState(), rig.clock.now()));
    expect(live.state.total).toBe(4);
    const xpBefore = live.progress.xp.total;
    live.finish();
    expect(live.results.reviews.map((r) => r.grade)).toEqual(['good', 'good', 'good', 'good']);
    expect(live.results.reviews.every((r) => r.item?.state === 'learning')).toBe(true);
    expect(live.progress.stats['srs.reviews']).toBe(4);
    expect(live.progress.xp.total - xpBefore).toBe(xpFor('review', { count: 4 }));
    expect(sessionReport(live.state.summary!, live.results)).toMatchObject({ cardsReviewed: 4, xpAwarded: xpFor('review', { count: 4 }) });
    expect(live.progress.log[0].kind).toBe('review');
  });

  it('a forgotten card goes back to the first learning step and returns within the session', () => {
    const rig = withCards();
    const live = new Live(rig, startSession(reviewSource([FIXTURE], rig.store.getState(), rig.clock.now()), rig.store.getState(), rig.clock.now()));
    live.rig.clock.advance(3000);
    live.dispatch({ type: 'answer', answer: { type: 'flashcard', rating: 'again' }, at: live.now });
    const first = live.results.reviews[0];
    expect(first).toMatchObject({ id: 'fixture:a-fact-a', grade: 'again' });
    expect(first.item).toMatchObject({ state: 'learning', step: 0 });
    expect(live.state.feedback!.willRetry).toBe(true);
    live.finish();
    expect(live.results.reviews.filter((r) => r.id === 'fixture:a-fact-a').map((r) => r.grade)).toEqual(['again', 'good']);
  });

  it('cards graduate and come due again days later', () => {
    const rig = withCards();
    const review = (): Live => new Live(rig, startSession(reviewSource([FIXTURE], rig.store.getState(), rig.clock.now()), rig.store.getState(), rig.clock.now())).finish();
    review();
    rig.clock.minutes(15);
    review();
    expect(Object.values(rig.store.getState().srs.items).every((c) => c.state === 'review' && c.interval === 1)).toBe(true);
    expect(dueFactCards([FIXTURE], rig.store.getState(), rig.clock.now())).toEqual([]);
    expect(reviewSource([FIXTURE], rig.store.getState(), rig.clock.now()).cards).toEqual([]);
    rig.clock.days(1);
    rig.store.tick();
    expect(dueFactCards([FIXTURE], rig.store.getState(), rig.clock.now())).toHaveLength(4);
    expect(courseMap(FIXTURE, rig.store.getState(), rig.clock.now()).dueCards).toBe(4);
    expect(dueReviews(rig.store.getState(), rig.clock.now(), { kinds: [FACT_CARD_KIND] })).toHaveLength(4);
  });
});

describe('checkpoints and practice against the store', () => {
  it('a passed checkpoint completes every lesson of the unit and unlocks the next', () => {
    const rig = makeRig();
    const before = courseMap(FIXTURE, rig.store.getState(), rig.clock.now());
    expect(before.units.map((u) => u.state)).toEqual(['current', 'locked']);
    const live = new Live(rig, startSession({ mode: 'checkpoint', course: FIXTURE, unitId: 'u1' }, rig.store.getState(), rig.clock.now())).finish();
    expect(live.results.skillsMarked).toEqual(['theory:u1:a', 'theory:u1:b', 'theory:u1:c']);
    for (const id of live.results.skillsMarked) expect(live.progress.skills[id]).toMatchObject({ completed: true, mastery: 1, attempts: 0 });
    const after = courseMap(FIXTURE, live.progress, live.now);
    expect(after.units.map((u) => u.state)).toEqual(['done', 'current']);
    expect(after.next).toEqual({ unitId: 'u2', lessonId: 'd' });
    expect(live.progress.xp.total).toBe(xpFor('theory-lesson', { perfect: true }));
    expect(heartsOf(live.progress, live.now).count).toBe(MAX_HEARTS);
  });

  it('a failed checkpoint changes nothing but a little XP', () => {
    const rig = makeRig();
    const live = new Live(rig, startSession({ mode: 'checkpoint', course: FIXTURE, unitId: 'u1' }, rig.store.getState(), rig.clock.now()));
    live.step(false).step(false);
    expect(live.state.outcome).toBe('failed');
    expect(live.results.skillsMarked).toEqual([]);
    expect(Object.keys(live.progress.skills)).toEqual([]);
    expect(heartsOf(live.progress, live.now).count).toBe(MAX_HEARTS);
  });

  it('practice remembers the difficulty on skills the learner has, and creates none', () => {
    const rig = makeRig();
    lesson(rig, 'a').finish();
    const source = practiceSource(FIXTURE, 'u1', rig.store.getState(), 6);
    expect(source.lessonIds).toEqual(['a']);
    const live = new Live(rig, startSession(source, rig.store.getState(), rig.clock.now())).finish();
    expect(Object.keys(live.progress.skills)).toEqual(['theory:u1:a']);
    expect(storedDifficulty(live.progress.skills['theory:u1:a'])).toBeCloseTo(live.state.difficulty, 2);
    // No finished lesson yet: the drill draws from the whole unit.
    expect(practiceSource(FIXTURE, 'u2', rig.store.getState()).lessonIds).toBeUndefined();
  });
});

describe('starting from the learner\'s progress', () => {
  it('reads hearts, naming, the skill record and the remembered difficulty', () => {
    const rig = makeRig();
    rig.actions.setPrefs({ noteNaming: 'german' });
    rig.actions.loseHeart();
    const source = { mode: 'lesson' as const, course: FIXTURE, lessonId: 'a' };
    const fresh = sessionOptionsFor(source, rig.store.getState(), rig.clock.now(), { route: 'learn', params: ['u1', 'a'], mic: false });
    expect(fresh).toMatchObject({ now: rig.clock.now(), hearts: MAX_HEARTS - 1, naming: 'german', skill: null, difficulty: 0.2, route: 'learn', params: ['u1', 'a'], mic: false });
    expect(Number.isInteger(fresh.seed)).toBe(true);

    lesson(rig, 'a').finish();
    const again = sessionOptionsFor(source, rig.store.getState(), rig.clock.now());
    expect(again.skill).toMatchObject({ mastery: 1, completed: true });
    expect(again.difficulty).toBeCloseTo(storedDifficulty(rig.store.getState().skills['theory:u1:a'])!, 5);
    expect(again.difficulty).toBeGreaterThan(0.2);
    expect(again.seed).not.toBe(fresh.seed);
    expect(sessionOptionsFor(source, rig.store.getState(), rig.clock.now(), { seed: 5 }).seed).toBe(5);

    rig.actions.setPrefs({ unlimitedHearts: true });
    expect(sessionOptionsFor(source, rig.store.getState(), rig.clock.now()).hearts).toBeNull();
    expect(sessionOptionsFor({ mode: 'review', courses: [FIXTURE], cards: [] }, rig.store.getState(), rig.clock.now()).skill).toBeUndefined();
  });

  it('the default port talks to the app\'s store', () => {
    const rig = makeRig();
    setProgressStore(rig.store);
    const state = createSession({ mode: 'lesson', course: FIXTURE, lessonId: 'a' }, { seed: 1, now: rig.clock.now(), hearts: 5 });
    const answered = reduceSession(reduceSession(state, { type: 'continue', at: rig.clock.now() }).state, { type: 'answer', answer: { type: 'choice', selected: [0] }, at: rig.clock.now() });
    const results = applyEffects(answered.effects);
    expect(results.heart).toMatchObject({ lost: true, remaining: MAX_HEARTS - 1 });
    expect(heartsOf(rig.store.getState(), rig.clock.now()).count).toBe(MAX_HEARTS - 1);
  });

  it('applyEffects with nothing to do returns an empty result', () => {
    const rig = makeRig();
    expect(applyEffects([], progressPort(rig.store))).toEqual({ activity: null, heart: null, cardsAdded: 0, reviews: [], skillsMarked: [] });
    expect(rig.store.getState().meta.rev).toBe(0);
  });
});

describe('saving an unfinished session', () => {
  it('saves what is worth resuming, loads it for the same lesson only, and clears it at the end', () => {
    const rig = makeRig();
    const live = lesson(rig, 'a');
    expect(saveSession(live.state)).toBe(false);
    live.step(true).step(true);
    expect(saveSession(live.state)).toBe(true);
    expect(sessionStorageKey('lesson')).toBe('lesson-session.lesson');

    const loaded = loadSession({ mode: 'lesson', courseId: 'fixture', lessonId: 'a' }, { now: live.now + 60_000 });
    expect(loaded).toEqual(live.state);
    expect(loadSession({ mode: 'lesson', lessonId: 'b' })).toBeNull();
    expect(loadSession({ mode: 'lesson', courseId: 'other' })).toBeNull();
    expect(loadSession({ mode: 'lesson', unitId: 'u2' })).toBeNull();
    expect(loadSession({ mode: 'review' })).toBeNull();
    expect(loadSession({ mode: 'lesson' }, { now: live.now + 25 * 3_600_000 })).toBeNull();
    expect(loadSession({ mode: 'lesson' }, { now: live.now + 25 * 3_600_000, maxAgeMs: 48 * 3_600_000 })).not.toBeNull();

    // Pick it up where it was left: same result as never having stopped.
    const resumed = new Live(rig, loaded!);
    resumed.dispatch({ type: 'resume', at: resumed.now, hearts: heartsOf(rig.store.getState(), resumed.now).count }).finish();
    expect(resumed.state.outcome).toBe('completed');
    expect(saveSession(resumed.state)).toBe(false);
    expect(loadSession({ mode: 'lesson' })).toBeNull();
  });

  it('keeps one slot per mode and clears on request', () => {
    const rig = makeRig();
    const a = lesson(rig, 'a').step(true).step(true);
    const practice = new Live(rig, startSession({ mode: 'practice', course: FIXTURE, unitId: 'u1' }, rig.store.getState(), rig.clock.now())).step(true);
    saveSession(a.state);
    saveSession(practice.state);
    expect(loadSession({ mode: 'lesson' })?.lessonId).toBe('a');
    expect(loadSession({ mode: 'practice' })?.unitId).toBe('u1');
    clearSession('lesson');
    expect(loadSession({ mode: 'lesson' })).toBeNull();
    expect(loadSession({ mode: 'practice' })).not.toBeNull();
  });
});
