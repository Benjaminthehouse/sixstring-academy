/**
 * Going out to a tool and coming back. When the learner opens a task, the lesson remembers it
 * (`PendingTask`, in platform storage); when they come back, the task card looks in the progress
 * log for what they did there since (`findTaskActivity`): a song played in the Player, a tuning
 * session, a technique exercise. Pure functions plus two storage calls; unit-tested.
 */
import type { ActivityInput, ActivityKind, PracticeSession } from '@/core/progress';
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
  scan: ['scan'],
  // The progress module has no kind for a recording: the Recorder reports the time played as 'other'.
  record: ['other'],
  theory: ['theory-lesson'],
};

/** The skill a tool records for this target, when it names one (`song:<id>`, `technique:<id>`). */
export function taskSkillId(target: TaskTarget): string | null {
  const first = target.params?.[0];
  if (!first) return null;
  if (target.tool === 'player') return `song:${first}`;
  if (target.tool === 'technique') return `technique:${first.startsWith('tech-') ? first : `tech-${first}`}`;
  if (target.tool === 'theory' && target.params?.[1]) return `theory:${first}:${target.params[1]}`;
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
    // Round once, then split: 119.6 s is "2 min", never "1 min 60 s".
    const total = Math.round(entry.durationSec);
    const m = Math.floor(total / 60);
    const s = total % 60;
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

/** Less time away than this, and nothing is taken to have been played along. */
export const PLAY_ALONG_MIN_SEC = 20;

/**
 * True for a Player task in listen mode (no `wait`, `flow` or `tap`): the band plays and the learner
 * plays along by ear, with nothing judged.
 */
export function isListenPlayAlong(target: TaskTarget): boolean {
  const [song, ...rest] = target.params ?? [];
  return target.tool === 'player' && !!song && !rest.some((p) => p === 'wait' || p === 'flow' || p === 'tap');
}

/**
 * The practice to log when the learner comes back from playing along in listen mode and goes on
 * with the lesson. The Player logs a listen run only once it has lasted 30 s in one go, so a short
 * loop played along with again and again (bars 1 to 4, round and round) was never logged. Counts the
 * time away, at most the task's minutes and two more. Null when the Player did log something, the
 * task is not a listen-mode play-along, or the learner was away too briefly.
 */
export function playAlongPractice(target: TaskTarget, opts: { openedAt: number; now: number; minutes: number; title: string; logged: PracticeSession | null }): ActivityInput | null {
  if (opts.logged || !isListenPlayAlong(target)) return null;
  const away = Math.round((opts.now - opts.openedAt) / 1000);
  if (!(away >= PLAY_ALONG_MIN_SEC)) return null;
  const song = target.params![0];
  return {
    kind: 'song',
    id: `song:${song}`,
    title: opts.title,
    durationSec: Math.min(away, (Math.max(1, opts.minutes) + 2) * 60),
    completed: false,
    route: 'play',
    params: [song],
  };
}

/** What the back card says a play-along will count as ("4 min of playing along"), or null. */
export function playAlongLine(input: ActivityInput | null): string | null {
  if (!input) return null;
  const sec = input.durationSec ?? 0;
  // Under a minute and a half there is no honest count of minutes ("your 1 minute ... count" was
  // both inflated for 20 s and ungrammatical).
  if (sec < 90) return 'Continue, and your time playing along counts as practice.';
  return `Continue, and your ${Math.round(sec / 60)} minutes of playing along count as practice.`;
}
