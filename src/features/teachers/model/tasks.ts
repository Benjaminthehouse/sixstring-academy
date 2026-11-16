/**
 * Going out to a tool and coming back. When the learner opens a task, the lesson remembers it
 * (`PendingTask`, in platform storage); when they come back, the task card looks in the progress
 * log for what they did there since (`findTaskActivity`): a song played in the Player, a tuning
 * session, a technique exercise. Pure functions plus two storage calls; unit-tested.
 */
import type { ActivityKind, PracticeSession } from '@/core/progress';
import { readJSON, remove, writeJSON } from '@/core/platform';
import type { TaskTarget, TaskTool, TeacherKey } from '@/content/teachers';

/** A task the learner went out to do. */
export interface PendingTask {
  teacher: TeacherKey;
  lessonId: string;
  taskId: string;
  /** Where it led (the task's target, or its fallback). */
  target: TaskTarget;
  openedAt: number;
}

const KEY = 'teachers.task';
/** A pending task older than this is forgotten. */
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The activity kinds each tool records (see `recordActivity` in `@/core/progress`). */
export const TOOL_KINDS: Record<TaskTool, readonly ActivityKind[]> = {
  player: ['song'],
  tuner: ['tuner'],
  metronome: ['metronome'],
  technique: ['technique'],
  chords: ['chord-change', 'chord-practice'],
  practice: ['practice'],
  rhythm: ['rhythm'],
  ear: ['ear'],
  fretboard: ['fretboard'],
  scales: ['scale-practice', 'scale-game'],
  arcade: ['scale-game'],
  progressions: ['progression'],
};

/** The skill a tool records for this target, when it names one (`song:<id>`, `technique:<id>`). */
export function taskSkillId(target: TaskTarget): string | null {
  const first = target.params?.[0];
  if (!first) return null;
  if (target.tool === 'player') return `song:${first}`;
  if (target.tool === 'technique') return `technique:${first.startsWith('tech-') ? first : `tech-${first}`}`;
  return null;
}

/**
 * The most recent activity in the log that did this task since it was opened: the right kind,
 * and the right song or exercise when the target names one. Null when there is none.
 */
export function findTaskActivity(target: TaskTarget, log: readonly PracticeSession[], since: number): PracticeSession | null {
  const kinds = TOOL_KINDS[target.tool] ?? [];
  const skill = taskSkillId(target);
  let best: PracticeSession | null = null;
  for (const entry of log) {
    if (!kinds.includes(entry.kind)) continue;
    if (skill && entry.skillId !== skill) continue;
    // Ended after the task was opened (a session started a moment before still counts).
    const end = entry.startedAt + Math.max(0, entry.durationSec) * 1000;
    if (end < since) continue;
    if (!best || entry.startedAt > best.startedAt) best = entry;
  }
  return best;
}

/** A short line about what was done ("92 % of the notes, 1 min 30 s"), or null. */
export function describeActivity(entry: PracticeSession): string | null {
  const parts: string[] = [];
  const accuracy = entry.metrics?.accuracy;
  if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
    const pct = Math.round(accuracy <= 1 ? accuracy * 100 : accuracy);
    parts.push(`${pct}% of the notes`);
  }
  if (entry.durationSec >= 5) {
    const m = Math.floor(entry.durationSec / 60);
    const s = Math.round(entry.durationSec % 60);
    parts.push(m > 0 ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`);
  }
  return parts.length ? parts.join(', ') : null;
}

/** Remember the task the learner is going out to do. */
export function savePendingTask(task: PendingTask): void {
  writeJSON(KEY, task);
}

/** The task the learner went out to do, if it matches and is recent; else null. */
export function readPendingTask(now: number, match?: { teacher?: string; lessonId?: string; taskId?: string }): PendingTask | null {
  const t = readJSON<PendingTask | null>(KEY, null);
  if (!t || typeof t !== 'object' || typeof t.openedAt !== 'number' || !t.target || typeof t.target.tool !== 'string') return null;
  if (now - t.openedAt > PENDING_MAX_AGE_MS || t.openedAt > now + 60_000) return null;
  if (match?.teacher && t.teacher !== match.teacher) return null;
  if (match?.lessonId && t.lessonId !== match.lessonId) return null;
  if (match?.taskId && t.taskId !== match.taskId) return null;
  return t;
}

/** Forget the pending task (it was finished, skipped, or its lesson ended). */
export function clearPendingTask(): void {
  remove(KEY);
}
