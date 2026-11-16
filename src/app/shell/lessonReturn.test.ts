/**
 * "Back to your lesson": shown on any screen a teacher's task led to, so an installed phone app
 * (which has no Back button) can always get back to the lesson.
 */
import { describe, expect, it } from 'vitest';
import { lessonReturnFor } from './LessonReturn';

const NOW = 1_800_000_000_000;
const task = { teacher: 'mia', lessonId: 'tune-up', taskId: 'tuner', target: { tool: 'tuner' }, openedAt: NOW - 60_000 };

describe('lessonReturnFor', () => {
  it('points back to the lesson from the tool the task opened', () => {
    expect(lessonReturnFor(task, 'tuner', NOW)).toEqual({ teacher: 'mia', teacherName: 'Mia', lessonId: 'tune-up', taskId: 'tuner' });
  });

  it('is not shown on the teachers screens themselves', () => {
    expect(lessonReturnFor(task, 'teachers', NOW)).toBeNull();
  });

  it('forgets a task opened more than a day ago, and ignores anything malformed', () => {
    expect(lessonReturnFor({ ...task, openedAt: NOW - 25 * 60 * 60 * 1000 }, 'tuner', NOW)).toBeNull();
    expect(lessonReturnFor(null, 'tuner', NOW)).toBeNull();
    expect(lessonReturnFor({ ...task, teacher: 'nobody' }, 'tuner', NOW)).toBeNull();
    expect(lessonReturnFor({ ...task, lessonId: 3 }, 'tuner', NOW)).toBeNull();
  });
});
