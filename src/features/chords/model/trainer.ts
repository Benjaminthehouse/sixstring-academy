/**
 * The chord-change trainer's rules, kept pure so they can be tested without a browser:
 * the classic beginner pairs, the skill id of a set of chords, targets and scores for the
 * one-minute changes, judging taps against the beat, adapting the tempo from a round's result,
 * and the per-day trend that is stored on the skill.
 */
import { chordChange, progressionChanges } from '@/core/guitar';
import { FIRST_CHORDS } from './catalog';
import { chordParam, skillSlug } from './symbols';

// ---------------------------------------------------------------------------------------------
// Pairs and ids
// ---------------------------------------------------------------------------------------------

/**
 * Classic pairs for one-minute changes, in the order a beginner meets them. The order inside a
 * pair is the one the practice planner already uses for its skill ids (`chord-change:g-c`).
 */
export const CLASSIC_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['Em', 'Am'],
  ['E', 'A'],
  ['D', 'A'],
  ['A', 'D'],
  ['G', 'C'],
  ['C', 'Am'],
  ['G', 'Em'],
  ['G', 'D'],
  ['Am', 'Dm'],
  ['C', 'F'],
  ['D', 'Em'],
  ['E7', 'A7'],
];

/** The pairs that are distinct as sets (A–D and D–A are one change practised both ways). */
export function suggestedPairs(): Array<[string, string]> {
  const seen = new Set<string>();
  const out: Array<[string, string]> = [];
  for (const [a, b] of CLASSIC_PAIRS) {
    const key = [a, b].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

function pathRank(symbol: string): number {
  const i = FIRST_CHORDS.indexOf(symbol);
  return i < 0 ? 1000 : i;
}

/**
 * The order a set of chords is stored in, so the same change always lands on the same skill:
 * a classic pair keeps its own order; anything else follows the learning path, then the alphabet.
 */
export function canonicalOrder(chords: readonly string[]): string[] {
  if (chords.length === 2) {
    const pair = CLASSIC_PAIRS.find(([a, b]) => (a === chords[0] && b === chords[1]) || (a === chords[1] && b === chords[0]));
    if (pair) return [pair[0], pair[1]];
  }
  if (chords.length > 2) return [...chords];
  return [...chords].sort((a, b) => pathRank(a) - pathRank(b) || a.localeCompare(b));
}

/**
 * The skill id of a practice set: `chord-change:g-c` for a pair (the convention every module
 * reads), the chords in practice order for three or four (`chord-change:g-c-d`).
 */
export function changeSkillId(chords: readonly string[]): string {
  return `chord-change:${canonicalOrder(chords).map((c) => skillSlug(c)).join('-')}`;
}

/** "G to C", "G, C and D". */
export function changeTitle(chords: readonly string[], display: (s: string) => string = (s) => s): string {
  const names = canonicalOrder(chords).map(display);
  if (names.length === 2) return `${names[0]} to ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** How hard the changes of a set are, 1–10 (the hardest change in the loop). */
export function setDifficulty(chords: readonly string[]): number {
  if (chords.length < 2) return 1;
  try {
    if (chords.length === 2) return chordChange(chords[0], chords[1])?.difficulty ?? 5;
    return progressionChanges([...chords], { loop: true }).difficulty;
  } catch {
    return 5;
  }
}

// ---------------------------------------------------------------------------------------------
// One-minute changes
// ---------------------------------------------------------------------------------------------

/**
 * Clean changes a minute that count as fluent for a set: about 60 for an easy pair such as C to
 * Am, 30 for G to C, 25 for changes into a barre. Rounded to fives.
 */
export function targetPerMinute(difficulty: number): number {
  const raw = 75 - 8.5 * difficulty;
  return Math.min(60, Math.max(20, Math.round(raw / 5) * 5));
}

/** What a one-minute round produced. */
export interface OneMinuteInput {
  /** Clean changes counted (taps, or strums the microphone confirmed). */
  changes: number;
  /** Strums the microphone heard that did not match the chord (0 with taps). */
  unclear: number;
  /** Seconds the round actually ran (60 for a full round). */
  seconds: number;
  /** Fluent target a minute for this set. */
  target: number;
  /** True when the microphone counted (then `unclear` is meaningful). */
  mic: boolean;
}

/** The scored round. */
export interface OneMinuteScore {
  /** Changes a minute (the count itself for a full minute). */
  perMinute: number;
  /** 0–1: changes against the fluent target. Drives crowns. */
  accuracy: number;
  /** Share of strums that rang true, 0–1; null with taps. */
  clean: number | null;
  stars: 0 | 1 | 2 | 3;
  /** One plain sentence about the result. */
  verdict: string;
}

/** Score a one-minute round. */
export function scoreOneMinute(input: OneMinuteInput): OneMinuteScore {
  const seconds = Math.max(1, input.seconds);
  const perMinute = Math.round((Math.max(0, input.changes) * 60) / seconds);
  const accuracy = Math.max(0, Math.min(1, perMinute / Math.max(1, input.target)));
  const strums = input.changes + input.unclear;
  const clean = input.mic && strums > 0 ? Math.max(0, input.changes) / strums : null;
  // Generous on purpose: a first round is often a third of the fluent target, and that deserves a star.
  const stars: 0 | 1 | 2 | 3 = accuracy >= 0.9 ? 3 : accuracy >= 0.6 ? 2 : accuracy >= 0.3 ? 1 : 0;
  let verdict: string;
  if (accuracy >= 0.9) verdict = 'Fluent. This change is ready for songs at a real tempo.';
  else if (accuracy >= 0.6) verdict = 'Nearly there. A few more rounds and this change will feel automatic.';
  else if (accuracy >= 0.3) verdict = 'Solid progress. Keep the changes clean rather than fast; speed follows.';
  else if (perMinute > 0) verdict = 'Every clean change counts. Slow and accurate now makes fast later.';
  else verdict = 'No changes counted this time. Try tapping once each time your fingers land.';
  return { perMinute, accuracy, clean, stars, verdict };
}

// ---------------------------------------------------------------------------------------------
// Changes in time
// ---------------------------------------------------------------------------------------------

/** How one timed change went. */
export type ChangeOutcome = 'clean' | 'late' | 'missed' | 'wrong';

/** The window around a change beat in which a tap counts as on time, in seconds. */
export function onTimeWindow(beatSec: number): { early: number; late: number } {
  return { early: beatSec, late: Math.max(0.12, 0.25 * beatSec) };
}

/**
 * Judge taps ("my fingers are down") against the beats on which the chord changes. A tap may come
 * up to a beat early (the next chord is shown a beat ahead) and a little late; later than that
 * but within half the chord's length is "late"; no tap is "missed". Each tap counts once.
 */
export function judgeTaps(changeTimes: readonly number[], taps: readonly number[], beatSec: number, beatsPerChord: number): ChangeOutcome[] {
  const win = onTimeWindow(beatSec);
  const lateLimit = Math.max(win.late, 0.5 * beatsPerChord * beatSec);
  const used = new Set<number>();
  return changeTimes.map((t) => {
    let best = -1;
    let bestDist = Infinity;
    taps.forEach((tap, i) => {
      if (used.has(i)) return;
      const d = tap - t;
      if (d < -win.early || d > lateLimit) return;
      const dist = Math.abs(d);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    if (best < 0) return 'missed';
    used.add(best);
    return taps[best] - t <= win.late ? 'clean' : 'late';
  });
}

/** Judge a strum the microphone confirmed for a change beat. */
export function judgeStrum(strumTime: number | null, changeTime: number, beatSec: number, failedAttempts: number): ChangeOutcome {
  if (strumTime === null) return failedAttempts > 0 ? 'wrong' : 'missed';
  const win = onTimeWindow(beatSec);
  const d = strumTime - changeTime;
  if (d >= -win.early && d <= win.late) return 'clean';
  return 'late';
}

/** Totals of a timed round. */
export function scoreInTime(outcomes: readonly ChangeOutcome[]): { clean: number; late: number; missed: number; wrong: number; total: number; accuracy: number } {
  const count = (o: ChangeOutcome) => outcomes.filter((x) => x === o).length;
  const total = outcomes.length;
  const clean = count('clean');
  return { clean, late: count('late'), missed: count('missed'), wrong: count('wrong'), total, accuracy: total ? clean / total : 0 };
}

/** Tempo settings of the timed mode. */
export interface TimedSettings {
  bpm: number;
  /** Beats each chord lasts: 8, 4, 2 or 1. */
  beatsPerChord: number;
}

export const MIN_BPM = 40;
export const MAX_BPM = 160;
const BEAT_STEPS = [8, 4, 2, 1];

/** The next round's tempo from this round's accuracy (aiming at about 80 % clean changes). */
export function nextTempo(current: TimedSettings, accuracy: number): TimedSettings & { change: 'faster' | 'same' | 'slower'; message: string } {
  const bpm = clampBpm(current.bpm);
  const beats = BEAT_STEPS.includes(current.beatsPerChord) ? current.beatsPerChord : 4;
  const i = BEAT_STEPS.indexOf(beats);
  if (accuracy >= 0.9) {
    // Fewer beats per chord before a faster click: changing more often is the real goal.
    if (bpm >= 100 && i < BEAT_STEPS.length - 1) {
      return { bpm: 70, beatsPerChord: BEAT_STEPS[i + 1], change: 'faster', message: `Clean. Next round changes every ${beatWords(BEAT_STEPS[i + 1])}, at a calmer 70 BPM.` };
    }
    if (bpm >= MAX_BPM) return { bpm, beatsPerChord: beats, change: 'same', message: 'Clean at top speed. This change is done: pick a harder one.' };
    const next = clampBpm(bpm + 8);
    return { bpm: next, beatsPerChord: beats, change: 'faster', message: `Clean. Next round: ${next} BPM.` };
  }
  if (accuracy >= 0.7) return { bpm, beatsPerChord: beats, change: 'same', message: `Good. Stay at ${bpm} BPM until it feels easy.` };
  if (bpm <= 50 && i > 0) {
    return { bpm: 60, beatsPerChord: BEAT_STEPS[i - 1], change: 'slower', message: `Let’s give each chord more time: every ${beatWords(BEAT_STEPS[i - 1])} at 60 BPM.` };
  }
  const next = clampBpm(bpm - 8);
  return { bpm: next, beatsPerChord: beats, change: next < bpm ? 'slower' : 'same', message: next < bpm ? `A little slower helps: ${next} BPM next.` : 'Slow and steady. Try the same tempo again.' };
}

function beatWords(beats: number): string {
  return beats === 1 ? 'beat' : `${beats} beats`;
}

function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(Number.isFinite(bpm) ? bpm : 60)));
}

// ---------------------------------------------------------------------------------------------
// The trainer's address: `#chords--trainer--g-major--c-major--timed--t70--beats-2`
// ---------------------------------------------------------------------------------------------

/** The three ways to practise (as the trainer's mode picker names them). */
export type TrainerModeId = 'minute' | 'timed' | 'check';

/** What the address sets up besides the chords. Every field is optional. */
export interface TrainerSetup {
  mode?: TrainerModeId;
  /** Tempo of "changes in time", 40–160. */
  bpm?: number;
  /** Beats each chord lasts in "changes in time": 8, 4, 2 or 1. */
  beats?: number;
}

const MODE_WORDS: Readonly<Record<string, TrainerModeId>> = {
  minute: 'minute',
  'one-minute': 'minute',
  timed: 'timed',
  'in-time': 'timed',
  check: 'check',
  'ring-true': 'check',
};

/**
 * Read the trainer's setting params (`timed`, `t70`, `beats-2`; see `TRAINER_OPTION`). A tempo or
 * a number of beats without a mode means "changes in time", the only mode that uses them.
 */
export function trainerSetup(options: readonly string[]): TrainerSetup {
  const out: TrainerSetup = {};
  for (const raw of options) {
    const p = raw.trim().toLowerCase();
    let m: RegExpExecArray | null;
    if (MODE_WORDS[p]) out.mode = MODE_WORDS[p];
    else if ((m = /^t(\d{2,3})$/.exec(p))) out.bpm = clampBpm(Number(m[1]));
    else if ((m = /^beats-(\d)$/.exec(p)) && BEAT_STEPS.includes(Number(m[1]))) out.beats = Number(m[1]);
  }
  if (!out.mode && (out.bpm !== undefined || out.beats !== undefined)) out.mode = 'timed';
  return out;
}

/** Route params for the trainer on some chords, set up: `['trainer', 'g-major', 'c-major', 'timed', 't70', 'beats-2']`. */
export function trainerParams(chords: readonly string[], setup: TrainerSetup = {}): string[] {
  const out = ['trainer', ...chords.map((c) => chordParam(c))];
  if (setup.mode && !(setup.mode === 'timed' && (setup.bpm !== undefined || setup.beats !== undefined))) out.push(setup.mode);
  if (setup.bpm !== undefined) out.push(`t${clampBpm(setup.bpm)}`);
  if (setup.beats !== undefined && BEAT_STEPS.includes(setup.beats)) out.push(`beats-${setup.beats}`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Check mode (the microphone waits for each chord)
// ---------------------------------------------------------------------------------------------

/** One chord of a check round. */
export interface CheckStep {
  /** Seconds from the previous confirmed chord (or the start) to this one. */
  seconds: number;
  /** Strums that did not ring true before this one did. */
  failedAttempts: number;
}

/** Score a check round: how quickly and how cleanly each chord was found. */
export function scoreCheck(steps: readonly CheckStep[]): { count: number; firstTry: number; accuracy: number; averageSeconds: number } {
  const count = steps.length;
  const firstTry = steps.filter((s) => s.failedAttempts === 0).length;
  const averageSeconds = count ? steps.reduce((sum, s) => sum + s.seconds, 0) / count : 0;
  return { count, firstTry, accuracy: count ? firstTry / count : 0, averageSeconds };
}

// ---------------------------------------------------------------------------------------------
// Trend over days (kept on the skill, inside core/progress)
// ---------------------------------------------------------------------------------------------

/** The best one-minute score of one local day. */
export interface TrendPoint {
  day: string;
  best: number;
}

/** What the trainer keeps on a `chord-change:` skill. */
export interface ChangeData {
  trend: TrendPoint[];
  /** Best one-minute score ever. */
  best: number;
  /** Last tempo of the timed mode. */
  timed: TimedSettings | null;
}

/** Days of history kept on the skill. */
export const TREND_DAYS = 30;

/** Read stored skill data defensively (anything unexpected gives an empty history). */
export function readChangeData(json: unknown): ChangeData {
  const empty: ChangeData = { trend: [], best: 0, timed: null };
  if (!json || typeof json !== 'object' || Array.isArray(json)) return empty;
  const o = json as Record<string, unknown>;
  const trend = Array.isArray(o.trend)
    ? o.trend
        .filter((p): p is { day: string; best: number } => !!p && typeof p === 'object' && typeof (p as { day?: unknown }).day === 'string' && Number.isFinite((p as { best?: unknown }).best))
        .map((p) => ({ day: p.day, best: Math.max(0, Math.round(p.best)) }))
        .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.day))
    : [];
  trend.sort((a, b) => a.day.localeCompare(b.day));
  const best = Number.isFinite(o.best) ? Math.max(0, Math.round(o.best as number)) : trend.reduce((m, p) => Math.max(m, p.best), 0);
  let timed: TimedSettings | null = null;
  const t = o.timed as Record<string, unknown> | undefined;
  if (t && Number.isFinite(t.bpm) && Number.isFinite(t.beatsPerChord)) timed = { bpm: clampBpm(t.bpm as number), beatsPerChord: BEAT_STEPS.includes(t.beatsPerChord as number) ? (t.beatsPerChord as number) : 4 };
  return { trend: trend.slice(-TREND_DAYS), best: Math.max(best, trend.reduce((m, p) => Math.max(m, p.best), 0)), timed };
}

/** Add a one-minute score: the day keeps its best, the history keeps its last `TREND_DAYS` days. */
export function addScore(data: ChangeData, day: string, score: number): ChangeData {
  const s = Math.max(0, Math.round(score));
  const trend = data.trend.filter((p) => p.day !== day);
  const today = data.trend.find((p) => p.day === day);
  trend.push({ day, best: Math.max(s, today?.best ?? 0) });
  trend.sort((a, b) => a.day.localeCompare(b.day));
  return { ...data, trend: trend.slice(-TREND_DAYS), best: Math.max(data.best, s) };
}

/** The data as plain JSON for `recordActivity({ data })`. */
export function changeDataJson(data: ChangeData): { trend: Array<{ day: string; best: number }>; best: number; timed: { bpm: number; beatsPerChord: number } | null } {
  return { trend: data.trend.map((p) => ({ day: p.day, best: p.best })), best: data.best, timed: data.timed ? { ...data.timed } : null };
}

/** A sentence about the trend: up, steady or down over the last few days with a score. */
export function trendWords(trend: readonly TrendPoint[]): string | null {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1].best;
  const first = trend[Math.max(0, trend.length - 7)].best;
  const days = Math.min(7, trend.length);
  if (last > first) return `Up ${last - first} over your last ${days} practice days.`;
  if (last === first) return `Steady over your last ${days} practice days.`;
  return 'A slower day than before. That is normal: it comes back after a night’s sleep.';
}
