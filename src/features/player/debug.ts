/**
 * A small record of what the player is doing, for the browser check (`e2e/player.cjs` imports
 * this module through the dev server and reads it). Bounded lists, plain data, no behaviour.
 */

/** One heard note-on as the player used it. */
export interface DebugNote {
  /** Audio-clock time from the pitch tracker (the pluck). */
  time: number;
  /** The same moment with the round-trip latency taken off (what was scored). */
  audio: number;
  midi: number;
  /** What it did: wait-mode result kind, or the flow grade, or null. */
  result: string | null;
  /** For flow: heard minus expected (s). */
  offset?: number;
  target?: number;
}

/** The record. */
export interface PlayerDebug {
  songId: string | null;
  mode: string;
  /** Audio time the music of the current run starts (after the count-in), and its tick. */
  musicStart: number | null;
  startTick: number;
  tempo: number;
  /** Output + input latency taken off note times (s). */
  latency: number;
  notes: DebugNote[];
  /** Wait mode: index of the target waited on, and how many there are. */
  waitIndex: number;
  waitTotal: number;
  /** Frames drawn while playing, and the cursor's last reported position. */
  frames: number;
  cursor: { tick: number; bar: number; audio: number } | null;
  /** Bars heard (`bar` events, as heard). */
  bars: Array<{ bar: number; index: number; time: number }>;
  /** The last results shown. */
  results: unknown;
  /** Counts of recordActivity calls. */
  recorded: number;
}

/** The live record (one player screen at a time). */
export const playerDebug: PlayerDebug = {
  songId: null, mode: 'listen', musicStart: null, startTick: 0, tempo: 100, latency: 0, notes: [], waitIndex: 0, waitTotal: 0, frames: 0, cursor: null, bars: [], results: null, recorded: 0,
};

/** Keep a list short. */
export function pushBounded<T>(list: T[], item: T, max = 400): void {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
}

/** Start a fresh record for a song. */
export function resetDebug(songId: string | null): void {
  Object.assign(playerDebug, { songId, mode: 'listen', musicStart: null, startTick: 0, tempo: 100, latency: 0, notes: [], waitIndex: 0, waitTotal: 0, frames: 0, cursor: null, bars: [], results: null, recorded: 0 });
}
