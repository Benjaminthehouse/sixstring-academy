/**
 * The player's per-song session, kept on the device so a reload (or coming back later) picks up
 * where the learner was: position, tempo, loop, mode, what the score shows, the practised part
 * and its mutes, count-in, click and speed trainer. Address params win when they are new: a link
 * to "bars 9 to 12 at 70 %" is followed, while reloading that same address restores the session.
 * Pure: unit-tested; the screen reads and writes it through the platform storage.
 */
import type { ResolvedRequest } from './params';
import { DEFAULT_TRAINER, sanitizeTrainer, type TrainerSettings } from './trainer';
import { clampCapo, clampTempo, clampTranspose, PRACTICE_MODES, type BarRange, type PracticeMode, type ScoreLayer } from './types';
import { normalizeLoop } from './loop';

/** Storage key of one song's session. */
export function sessionKey(songId: string): string {
  return `player.session.${songId}`;
}

/** What is kept per song. */
export interface PlayerSession {
  v: 1;
  /** When it was last saved (epoch ms). */
  at: number;
  /** The address params the player was opened with (to tell a reload from a new link). */
  opened: string;
  /** Position: absolute tick in playback order, and its song bar. */
  tick: number;
  bar: number;
  tempo: number;
  loop: BarRange | null;
  mode: PracticeMode;
  layer: ScoreLayer;
  /**
   * The learner picked `layer` in this player (More > Score). Until they do, the layer follows
   * Settings > "Tab and notation" each time the song opens, so a song opened once before the
   * setting changed does not keep the old view.
   */
  layerPicked: boolean;
  /** The part the learner plays (track id), or null for the first one. */
  track: string | null;
  muted: string[];
  solo: string[];
  countIn: boolean;
  metronome: boolean;
  trainer: TrainerSettings;
  /** Show the fretboard under the score. */
  neck: boolean;
  /** Chord names and boxes hidden: playing it from memory. */
  hideChart: boolean;
  /** Semitones the song is moved (for singing). */
  transpose: number;
  /** The learner's capo fret, or null for the song's own capo. */
  capo: number | null;
}

/** How long a saved position is offered back (a reload, or coming back the same day). */
export const RESUME_WITHIN_MS = 12 * 60 * 60 * 1000;

/** What the song allows, to check a stored session against. */
export interface SongShape {
  barCount: number;
  totalTicks: number;
  trackIds: readonly string[];
}

/** A fresh session. */
export function defaultSession(opts: { layer?: ScoreLayer; now?: number } = {}): PlayerSession {
  return {
    v: 1, at: opts.now ?? 0, opened: '', tick: 0, bar: 0, tempo: 100, loop: null, mode: 'listen', layer: opts.layer ?? 'tab', layerPicked: false, track: null,
    muted: [], solo: [], countIn: true, metronome: false, trainer: { ...DEFAULT_TRAINER }, neck: true, hideChart: false, transpose: 0, capo: null,
  };
}

/** Read a stored session, field by field; null when it is not one. */
export function sanitizeSession(raw: unknown, song: SongShape): PlayerSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  const d = defaultSession();
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && song.trackIds.includes(x)) : []);
  const tick = Math.max(0, Math.min(song.totalTicks, Math.round(num(r.tick, 0))));
  const bar = Math.max(0, Math.min(Math.max(0, song.barCount - 1), Math.round(num(r.bar, 0))));
  const loopRaw = r.loop && typeof r.loop === 'object' ? (r.loop as Record<string, unknown>) : null;
  const loop = loopRaw ? normalizeLoop({ from: num(loopRaw.from, NaN), to: num(loopRaw.to, NaN) }, song.barCount) : null;
  return {
    v: 1,
    at: num(r.at, 0),
    opened: typeof r.opened === 'string' ? r.opened : '',
    tick,
    bar,
    tempo: clampTempo(num(r.tempo, 100)),
    loop,
    mode: typeof r.mode === 'string' && (PRACTICE_MODES as readonly string[]).includes(r.mode) ? (r.mode as PracticeMode) : d.mode,
    layer: r.layer === 'both' || r.layer === 'notation' ? r.layer : 'tab',
    // Sessions saved before this field existed recorded the layer whether or not it was picked:
    // they follow Settings again.
    layerPicked: r.layerPicked === true,
    track: typeof r.track === 'string' && song.trackIds.includes(r.track) ? r.track : null,
    muted: ids(r.muted),
    solo: ids(r.solo),
    countIn: r.countIn !== false,
    metronome: r.metronome === true,
    trainer: sanitizeTrainer(r.trainer),
    neck: r.neck !== false,
    hideChart: r.hideChart === true,
    transpose: clampTranspose(num(r.transpose, 0)),
    capo: typeof r.capo === 'number' ? clampCapo(r.capo) : null,
  };
}

/** How the screen should open. */
export interface OpeningState {
  session: PlayerSession;
  /** The saved position was restored (say so, with a way back to the top). */
  resumed: boolean;
}

/**
 * The session to open with. A reload of the same address restores everything. A new address
 * (or none) keeps the learner's preferences for the song, applies what the address asks for,
 * and offers the saved position back when it is recent and the address names no place.
 * `opts.layer` is the learner's Settings view ("Tab and notation"): it wins over a stored layer
 * the learner never picked in the player, except that a reading study (`opts.prefersNotation`,
 * the song's `prefersNotation`) opens with the notation shown. A hidden chord chart is for one
 * visit (a reload keeps it); an address can hide it again (`hide-chart`). An address that asks for
 * the notation alone or a hidden chart also hides the fretboard, which would show the answers.
 */
export function openingState(
  saved: PlayerSession | null,
  request: Partial<ResolvedRequest> & Pick<ResolvedRequest, 'startBar' | 'loop' | 'tempo' | 'mode'>,
  key: string,
  opts: { now: number; layer: ScoreLayer; micBlocked: boolean; prefersNotation?: boolean },
): OpeningState {
  const unpicked: ScoreLayer = opts.prefersNotation && opts.layer === 'tab' ? 'both' : opts.layer;
  const base = saved ?? defaultSession({ layer: unpicked });
  const layer = base.layerPicked ? base.layer : unpicked;
  const fixMode = (m: PracticeMode): PracticeMode => (opts.micBlocked && (m === 'wait' || m === 'flow') ? 'tap' : m);
  if (saved && saved.opened === key && key !== '' && opts.now - saved.at < RESUME_WITHIN_MS) {
    return { session: { ...saved, layer, mode: fixMode(saved.mode) }, resumed: saved.tick > 0 };
  }
  const s: PlayerSession = { ...base, layer, opened: key, at: opts.now, mode: fixMode(base.mode), hideChart: false };
  if (request.track) s.track = request.track;
  if (request.muted) {
    s.muted = [...request.muted];
    s.solo = [];
  }
  if (request.layer) {
    s.layer = request.layer;
    s.layerPicked = true;
  }
  if (request.hideChart) s.hideChart = true;
  if (request.layer === 'notation' || request.hideChart) s.neck = false;
  if (request.capo !== null && request.capo !== undefined) s.capo = request.capo;
  if (request.transpose !== null && request.transpose !== undefined) s.transpose = request.transpose;
  const asksPlace = request.startBar !== null || request.loop !== null;
  if (asksPlace) {
    s.loop = request.loop;
    s.bar = request.startBar ?? request.loop?.from ?? 0;
    s.tick = -1; // the screen turns the bar into a tick once the timeline exists
  } else if (!(saved && opts.now - saved.at < RESUME_WITHIN_MS && saved.tick > 0)) {
    s.tick = 0;
    s.bar = 0;
  }
  if (request.tempo !== null) s.tempo = request.tempo;
  if (request.mode) s.mode = fixMode(request.mode);
  const resumed = !asksPlace && !!saved && opts.now - saved.at < RESUME_WITHIN_MS && saved.tick > 0;
  return { session: s, resumed };
}
