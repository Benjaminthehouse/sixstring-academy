/**
 * Task steps: "go and do this in another part of the app, then come back". Authors build them with
 * these helpers so the address of the tool is always well formed:
 *
 *   playerTask({ id: 'buns-wait', title: 'Hot Cross Buns in wait mode', song: 'hot-cross-buns', mode: 'wait', minutes: 5, body: '...' })
 *   toolTask({ id: 'tune', title: 'Tune all six strings', tool: 'tuner', minutes: 3, body: '...' })
 *   techniqueTask({ id: 'alternate', title: 'Down-up on open strings', exercise: 'tech-alternate-open', minutes: 5, body: '...' })
 *   theoryTask({ id: 'numbers', title: 'String numbers, in theory', lesson: 'the-six-strings/string-numbers', minutes: 4, body: '...' })
 *   recordTask({ id: 'record-show', title: 'Record your show', label: 'hot-cross-buns-week-1', minutes: 3, body: '...' })
 *   toolTask({ id: 'scan-it', title: 'Scan a page of tab', tool: 'scan', minutes: 5, body: '...' })
 */
import type { RichText, TaskStep, TaskTarget, TaskTool } from './types';

/** The route each tool lives at, and how the app talks about it. */
export const TASK_TOOLS: Record<TaskTool, { route: string; name: string; icon: string }> = {
  player: { route: 'play', name: 'the Player', icon: 'Play' },
  tuner: { route: 'tuner', name: 'the Tuner', icon: 'Gauge' },
  metronome: { route: 'metronome', name: 'the Metronome', icon: 'Timer' },
  technique: { route: 'technique', name: 'Technique', icon: 'Hand' },
  chords: { route: 'chords', name: 'Chords', icon: 'Grid3x3' },
  practice: { route: 'practice', name: 'the Practice Plan', icon: 'CalendarCheck' },
  rhythm: { route: 'rhythm', name: 'Rhythm', icon: 'Drum' },
  ear: { route: 'ear', name: 'Ear Training', icon: 'Ear' },
  fretboard: { route: 'fretboard', name: 'Fretboard', icon: 'Rows4' },
  scales: { route: 'scales', name: 'Scales', icon: 'Waypoints' },
  arcade: { route: 'arcade', name: 'the Scale Arcade', icon: 'Gamepad2' },
  progressions: { route: 'progressions', name: 'Progressions', icon: 'ListMusic' },
  scan: { route: 'scan', name: 'Scan & Import', icon: 'ScanLine' },
  record: { route: 'record', name: 'the Recorder', icon: 'Mic' },
  theory: { route: 'learn', name: 'the Theory Path', icon: 'Route' },
};

/** Every tool, for tests and pickers. */
export const TASK_TOOL_IDS = Object.keys(TASK_TOOLS) as TaskTool[];

/** The fields every task shares. */
interface TaskBase {
  id: string;
  title: string;
  body: RichText;
  tip?: RichText;
  minutes: number;
  fallback?: { body: RichText; title?: string } & TaskTarget;
}

/** The Player's practice modes (see `src/features/player`): listen is the default and needs no param. */
export type PlayerMode = 'listen' | 'wait' | 'flow' | 'tap';

/** Route params of a Player address: `[song, 'm1-4', 't85', 'wait']`. */
export function playerParams(song: string, opts: { mode?: PlayerMode; tempo?: number; bars?: readonly [number, number]; startBar?: number } = {}): string[] {
  const out = [song];
  if (opts.bars) out.push(`m${Math.min(opts.bars[0], opts.bars[1])}-${Math.max(opts.bars[0], opts.bars[1])}`);
  else if (opts.startBar && opts.startBar > 1) out.push(`m${opts.startBar}`);
  if (opts.tempo !== undefined && opts.tempo !== 100) out.push(`t${Math.round(opts.tempo)}`);
  if (opts.mode && opts.mode !== 'listen') out.push(opts.mode);
  return out;
}

/**
 * Play along with a song in the Player. `tempo` is a percentage of the song's own tempo (the
 * Player's `t70`), `bars` a 1-based loop (`[1, 4]`), `mode` the practice mode.
 */
export function playerTask(t: TaskBase & { song: string; mode?: PlayerMode; tempo?: number; bars?: readonly [number, number] }): TaskStep {
  const { song, mode, tempo, bars, ...base } = t;
  return { type: 'task', tool: 'player', params: playerParams(song, { mode, tempo, bars }), ...base };
}

/** Use a tool (`tuner`, `metronome`, `practice` ...), optionally at an address inside it. */
export function toolTask(t: TaskBase & { tool: TaskTool; params?: string[] }): TaskStep {
  const { tool, params, ...base } = t;
  return { type: 'task', tool, ...(params ? { params } : {}), ...base };
}

/** A technique exercise (`#technique--<id>`) with its tempo ladder. */
export function techniqueTask(t: TaskBase & { exercise: string }): TaskStep {
  const { exercise, ...base } = t;
  return { type: 'task', tool: 'technique', params: [exercise], ...base };
}

/**
 * A Theory Path lesson (`#learn--<unit>--<lesson>`), named as the plan does: `'the-six-strings/string-numbers'`.
 * A lesson ahead of where the learner is on the path still opens (with a note saying so).
 */
export function theoryTask(t: TaskBase & { lesson: string }): TaskStep {
  const { lesson, ...base } = t;
  return { type: 'task', tool: 'theory', params: theoryParams(lesson), ...base };
}

/** Record a take in the Recorder (`#record--<label>`); `label` (a slug) is the take's name. */
export function recordTask(t: TaskBase & { label?: string }): TaskStep {
  const { label, ...base } = t;
  return { type: 'task', tool: 'record', ...(label ? { params: [label] } : {}), ...base };
}

/** `'unit/lesson'` (the plan's theory link) -> `['unit', 'lesson']`, the Theory Path's route params. */
export function theoryParams(link: string): string[] {
  const [unit, lesson] = link.split('/');
  return lesson ? [unit, lesson] : [unit];
}

/** The song a task opens in the Player, or null for other tools. */
export function taskSong(target: TaskTarget): string | null {
  return target.tool === 'player' && target.params?.[0] ? target.params[0] : null;
}

/** Where a task leads right now, and why (see {@link resolveTaskTarget}). */
export interface ResolvedTaskTarget {
  target: TaskTarget;
  /** The fallback is used (its song is missing, or its tool is not in the app). */
  fallback: boolean;
  /** Whether the song is in the library is not known yet: wait before opening. */
  checking: boolean;
  /** Neither the task's tool nor its fallback's is in the app: the task can only be skipped. */
  unavailable: boolean;
}

/**
 * Where a task leads: its own target, or its fallback when its song is not in the library
 * (`songAvailable` false; null while that is being looked up) or its tool's screen is not part of
 * the app (`toolAvailable`). A song that has landed in the library is opened itself: the fallback
 * is only for while it is missing. Pure.
 */
export function resolveTaskTarget(task: TaskStep, opts: { songAvailable: boolean | null; toolAvailable: (target: TaskTarget) => boolean }): ResolvedTaskTarget {
  const own: TaskTarget = { tool: task.tool, ...(task.params ? { params: task.params } : {}) };
  const song = taskSong(task);
  const songMissing = song !== null && opts.songAvailable === false;
  const toolMissing = !opts.toolAvailable(own);
  if ((songMissing || toolMissing) && task.fallback) {
    const target: TaskTarget = { tool: task.fallback.tool, ...(task.fallback.params ? { params: task.fallback.params } : {}) };
    return { target, fallback: true, checking: false, unavailable: !opts.toolAvailable(target) };
  }
  return { target: own, fallback: false, checking: song !== null && opts.songAvailable === null && !toolMissing, unavailable: toolMissing };
}

/** The app address of a task target: `{ route: 'play', params: ['hot-cross-buns', 'wait'] }`. */
export function taskRoute(target: TaskTarget): { route: string; params: string[] } {
  return { route: TASK_TOOLS[target.tool].route, params: [...(target.params ?? [])] };
}
