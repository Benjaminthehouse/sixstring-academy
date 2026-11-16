import { beforeEach, describe, expect, it } from 'vitest';
import type { PracticeSession, SkillRecord } from '@/core/progress';
import { OUTLINE, type CourseOutline } from '@/content/teachers';
import { parseTeachersParams, teachersParams, type TeachersView } from './route';
import { courseStanding, lessonsReady, recommendTeacher, type CourseStanding } from './standing';
import { clearPendingTask, describeActivity, findTaskActivity, isListenPlayAlong, playAlongLine, playAlongPractice, readPendingTask, savePendingTask, taskSkillId, PENDING_MAX_AGE_MS } from './tasks';

const outline = (id: 'mia' | 'dev' | 'elena'): CourseOutline => OUTLINE.find((c) => c.id === id)!;

describe('route', () => {
  it('reads every kind of address', () => {
    expect(parseTeachersParams([])).toEqual({ view: 'overview' });
    expect(parseTeachersParams(['nobody'])).toEqual({ view: 'overview' });
    expect(parseTeachersParams(['mia'])).toEqual({ view: 'teacher', teacher: 'mia' });
    expect(parseTeachersParams(['mia', 'tune-up'])).toEqual({ view: 'lesson', teacher: 'mia', lessonId: 'tune-up' });
    expect(parseTeachersParams(['dev', 'review'])).toEqual({ view: 'review', teacher: 'dev' });
    expect(parseTeachersParams(['mia', 'checkpoint', 'mia-hello-guitar'])).toEqual({ view: 'checkpoint', teacher: 'mia', unitId: 'mia-hello-guitar' });
    expect(parseTeachersParams(['mia', 'practice', 'mia-hello-guitar'])).toEqual({ view: 'practice', teacher: 'mia', unitId: 'mia-hello-guitar' });
    // A checkpoint without its unit is not a lesson called "checkpoint".
    expect(parseTeachersParams(['mia', 'checkpoint'])).toEqual({ view: 'teacher', teacher: 'mia' });
  });

  it('writes what it reads', () => {
    const views: TeachersView[] = [
      { view: 'overview' },
      { view: 'teacher', teacher: 'elena' },
      { view: 'lesson', teacher: 'mia', lessonId: 'the-pick' },
      { view: 'review', teacher: 'mia' },
      { view: 'checkpoint', teacher: 'dev', unitId: 'dev-blues' },
      { view: 'practice', teacher: 'mia', unitId: 'mia-hello-guitar' },
    ];
    for (const v of views) expect(parseTeachersParams(teachersParams(v))).toEqual(v);
  });
});

const skill = (over: Partial<SkillRecord>): SkillRecord => ({ attempts: 1, completions: 1, perfects: 0, bestScore: 0, lastScore: 0, bestAccuracy: 1, lastAccuracy: 1, history: [], timeSec: 60, mastery: 1, stars: 0, completed: true, lastAt: 1000, ...over }) as SkillRecord;

describe('standing', () => {
  it('counts the lessons done against the whole plan and finds the next one', () => {
    const mia = outline('mia');
    const total = mia.units.reduce((n, u) => n + u.lessons.length, 0);
    const empty = courseStanding({ skills: {} }, mia);
    expect(empty).toMatchObject({ teacher: 'mia', done: 0, total, lastAt: null, finished: false });
    expect(empty.next).toEqual({ unitId: 'mia-hello-guitar', lessonId: 'meet-your-guitar', title: 'Meet your guitar' });

    const s = courseStanding({ skills: { 'teacher:mia:meet-your-guitar': skill({ lastAt: 50 }), 'teacher:mia:sit-and-hold': skill({ completed: false, lastAt: 90 }), 'teacher:dev:x': skill({ lastAt: 999 }) } }, mia);
    expect(s.done).toBe(1);
    expect(s.lastAt).toBe(90);
    expect(s.next?.lessonId).toBe('sit-and-hold');
  });

  it('knows a finished course', () => {
    const elena = outline('elena');
    const skills: Record<string, SkillRecord> = {};
    for (const u of elena.units) for (const [slug] of u.lessons) skills[`teacher:elena:${slug}`] = skill({});
    const s = courseStanding({ skills }, elena);
    expect(s.finished).toBe(true);
    expect(s.next).toBeNull();
  });
});

describe('recommendation', () => {
  const st = (teacher: 'mia' | 'dev' | 'elena', over: Partial<CourseStanding> = {}): CourseStanding => ({ teacher, done: 0, total: 70, lastAt: null, next: null, finished: false, ...over });

  it('follows the level a learner gave', () => {
    expect(recommendTeacher('beginner', [st('mia'), st('dev'), st('elena')])).toMatchObject({ teacher: 'mia', reason: 'level' });
    expect(recommendTeacher('intermediate', [st('mia'), st('dev'), st('elena')])).toMatchObject({ teacher: 'dev', reason: 'level' });
    expect(recommendTeacher('expert', [st('mia'), st('dev'), st('elena')])).toMatchObject({ teacher: 'elena', reason: 'level' });
  });

  it('keeps the learner with the course in progress, the most recent first', () => {
    const r = recommendTeacher('expert', [st('mia', { lastAt: 10, done: 3 }), st('dev', { lastAt: 20, done: 1 }), st('elena')]);
    expect(r).toMatchObject({ teacher: 'dev', reason: 'continue' });
    expect(r.because).toMatch(/1 of 70/);
  });

  it('moves on past a finished course', () => {
    const r = recommendTeacher('beginner', [st('mia', { lastAt: 10, finished: true, done: 70 }), st('dev'), st('elena')]);
    expect(r).toMatchObject({ teacher: 'dev', reason: 'next-course' });
  });

  it('does not claim "you told us" when the learner skipped the first-run questions', () => {
    // Review bug: a learner who skipped onboarding (level left at its default) read "You told us you are new to the guitar."
    const all = [st('mia'), st('dev'), st('elena')];
    for (const level of ['beginner', 'intermediate', 'expert'] as const) {
      expect(recommendTeacher(level, all, false).because).not.toMatch(/told us/i);
      expect(recommendTeacher(level, all, true).because).toMatch(/told us/i);
    }
    expect(recommendTeacher('beginner', all, false)).toMatchObject({ teacher: 'mia', reason: 'level' });
  });
});

describe('lessons ready', () => {
  it('counts only the lessons of written units', () => {
    const mia = outline('mia');
    const first = mia.units[0];
    expect(lessonsReady(mia, [])).toBe(0);
    expect(lessonsReady(mia, [first.id])).toBe(first.lessons.length);
    expect(lessonsReady(mia, ['not-a-unit'])).toBe(0);
    expect(lessonsReady(mia, mia.units.map((u) => u.id))).toBe(courseStanding({ skills: {} }, mia).total);
  });
});

describe('tasks', () => {
  const entry = (over: Partial<PracticeSession>): PracticeSession => ({ id: 'x', kind: 'song', title: 'Song', startedAt: 10_000, durationSec: 60, xp: 10, ...over });

  it('names the skill a tool records', () => {
    expect(taskSkillId({ tool: 'player', params: ['hot-cross-buns', 'wait'] })).toBe('song:hot-cross-buns');
    expect(taskSkillId({ tool: 'technique', params: ['tech-warm-up'] })).toBe('technique:tech-warm-up');
    expect(taskSkillId({ tool: 'technique', params: ['warm-up'] })).toBe('technique:tech-warm-up');
    expect(taskSkillId({ tool: 'tuner' })).toBeNull();
    // A Theory Path lesson is recognised by its own skill id.
    expect(taskSkillId({ tool: 'theory', params: ['the-six-strings', 'string-numbers'] })).toBe('theory:the-six-strings:string-numbers');
    expect(taskSkillId({ tool: 'scan' })).toBeNull();
  });

  it('recognises a theory lesson, a scan and a recording done in their tools', () => {
    const lesson = entry({ id: 'lesson', kind: 'theory-lesson', skillId: 'theory:the-six-strings:string-numbers', startedAt: 15_000 });
    const otherLesson = entry({ id: 'other-lesson', kind: 'theory-lesson', skillId: 'theory:the-six-strings:string-names', startedAt: 16_000 });
    const scan = entry({ id: 'scan', kind: 'scan', startedAt: 17_000 });
    const take = entry({ id: 'take', kind: 'other', startedAt: 18_000 });
    const log = [lesson, otherLesson, scan, take];
    expect(findTaskActivity({ tool: 'theory', params: ['the-six-strings', 'string-numbers'] }, log, 12_000)?.id).toBe('lesson');
    expect(findTaskActivity({ tool: 'scan' }, log, 12_000)?.id).toBe('scan');
    expect(findTaskActivity({ tool: 'record', params: ['first-show'] }, log, 12_000)?.id).toBe('take');
  });

  it('finds the work done since the task was opened', () => {
    const target = { tool: 'player' as const, params: ['hot-cross-buns', 'wait'] };
    const log = [
      entry({ id: 'other-song', skillId: 'song:greensleeves', startedAt: 20_000 }),
      entry({ id: 'before', skillId: 'song:hot-cross-buns', startedAt: 1_000, durationSec: 2 }),
      entry({ id: 'after', skillId: 'song:hot-cross-buns', startedAt: 15_000 }),
      entry({ id: 'tuner', kind: 'tuner', startedAt: 16_000 }),
    ];
    expect(findTaskActivity(target, log, 12_000)?.id).toBe('after');
    expect(findTaskActivity(target, log, 100_000)).toBeNull();
    expect(findTaskActivity({ tool: 'tuner' }, log, 12_000)?.id).toBe('tuner');
    // A session that started just before the task opened but ended after it still counts.
    expect(findTaskActivity({ tool: 'metronome' }, [entry({ kind: 'metronome', startedAt: 5_000, durationSec: 30 })], 12_000)).not.toBeNull();
  });

  it('describes what was done in plain words', () => {
    expect(describeActivity(entry({ metrics: { accuracy: 0.92 }, durationSec: 90 }))).toBe('92% of the notes, 1 min 30 s');
    expect(describeActivity(entry({ durationSec: 40 }))).toBe('40 s');
    expect(describeActivity(entry({ durationSec: 1 }))).toBeNull();
  });

  it('rounds a duration once, so seconds never read 60', () => {
    // Review bug: 119.6 s read "1 min 60 s"; 59.7 s read "60 s".
    expect(describeActivity(entry({ durationSec: 119.6 }))).toBe('2 min');
    expect(describeActivity(entry({ durationSec: 59.7 }))).toBe('1 min');
    expect(describeActivity(entry({ durationSec: 61.2 }))).toBe('1 min 1 s');
  });

  // Review bug: playing along in listen mode (a 4-bar loop, round and round) was never logged as
  // practice: the Player logs a listen run only after 30 s in one go.
  it('logs a play-along in listen mode the Player did not log', () => {
    const along = { tool: 'player' as const, params: ['st-open-string-duet', 'm1-4'] };
    expect(isListenPlayAlong(along)).toBe(true);
    expect(isListenPlayAlong({ tool: 'player', params: ['hot-cross-buns', 'wait'] })).toBe(false);
    expect(isListenPlayAlong({ tool: 'player', params: ['hot-cross-buns', 'm1-4', 't85', 'flow'] })).toBe(false);
    expect(isListenPlayAlong({ tool: 'tuner' })).toBe(false);
    const credit = playAlongPractice(along, { openedAt: 0, now: 3 * 60_000 + 10_000, minutes: 4, title: 'Open-String Duet', logged: null });
    expect(credit).toEqual({ kind: 'song', id: 'song:st-open-string-duet', title: 'Open-String Duet', durationSec: 190, completed: false, route: 'play', params: ['st-open-string-duet'] });
    expect(playAlongLine(credit)).toBe('Continue, and your 3 minutes of playing along count as practice.');
    // Away for an hour: no more than the task's minutes and two more.
    expect(playAlongPractice(along, { openedAt: 0, now: 3_600_000, minutes: 4, title: 'x', logged: null })?.durationSec).toBe(360);
    // A glance, a tool that judged, or a run the Player logged itself: nothing added.
    expect(playAlongPractice(along, { openedAt: 0, now: 10_000, minutes: 4, title: 'x', logged: null })).toBeNull();
    expect(playAlongPractice({ tool: 'player', params: ['hot-cross-buns', 'wait'] }, { openedAt: 0, now: 300_000, minutes: 4, title: 'x', logged: null })).toBeNull();
    expect(playAlongPractice(along, { openedAt: 0, now: 300_000, minutes: 4, title: 'x', logged: entry({}) })).toBeNull();
    expect(playAlongLine(null)).toBeNull();
  });

  describe('the pending task', () => {
    beforeEach(() => clearPendingTask());
    it('is remembered, matched and forgotten', () => {
      const now = 1_000_000;
      savePendingTask({ teacher: 'mia', lessonId: 'tune-up', taskId: 'tune-all', target: { tool: 'tuner' }, openedAt: now });
      expect(readPendingTask(now + 1000)?.taskId).toBe('tune-all');
      expect(readPendingTask(now + 1000, { lessonId: 'tune-up', taskId: 'tune-all' })).not.toBeNull();
      expect(readPendingTask(now + 1000, { lessonId: 'the-pick' })).toBeNull();
      expect(readPendingTask(now + PENDING_MAX_AGE_MS + 1)).toBeNull();
      clearPendingTask();
      expect(readPendingTask(now)).toBeNull();
    });
  });
});
