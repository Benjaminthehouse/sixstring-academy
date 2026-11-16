/**
 * The short summary after a run: accuracy, the bars that went wrong (a heat strip for the score),
 * one concrete suggestion ("Loop bars 9 to 12 at 70 %"), stars, personal bests per song, and the
 * one `recordActivity` call. Pure: unit-tested.
 */
import { starsForAccuracy, type ActivityInput, type JsonValue, type Stars } from '@/core/progress';
import type { FlowResult, WaitRecord } from '@/core/song';
import { loopLabel } from './loop';
import type { MediaFailure } from '@/core/platform';
import { clampTempo, needsMic, type BarRange, type PracticeMode } from './types';

/** How a bar went, for the heat strip: 0 clean, 1 a slip, 2 some trouble, 3 most of it wrong. */
export type HeatLevel = 0 | 1 | 2 | 3;

/** One bar of the heat strip. */
export interface BarHeatCell {
  bar: number;
  level: HeatLevel;
  targets: number;
  mistakes: number;
}

/** What the results panel shows. */
export interface RunSummary {
  mode: PracticeMode;
  /** 0–1, or null when nothing was scored (listen mode). */
  accuracy: number | null;
  /** Stars this run earned (0 for a part of the song). */
  stars: Stars;
  /** Played from the first bar to the end, without a loop. */
  fullSong: boolean;
  tempo: number;
  durationSec: number;
  /** Notes (or chords) the learner played and how many there were. */
  played: number;
  total: number;
  counts: { perfect: number; good: number; early: number; late: number; missed: number; wrong: number } | null;
  maxCombo: number;
  score: number;
  /** Wait mode: notes right at the first try, hints asked, notes skipped. */
  firstTry: number;
  hints: number;
  skipped: number;
  heat: BarHeatCell[];
  /** The weakest stretches, worst first. */
  weak: BarRange[];
  suggestion: Suggestion | null;
  /** One short line on how it went. */
  headline: string;
}

/** A next step the results panel offers as its main button. */
export interface Suggestion {
  /** "Loop bars 9 to 12 at 70 %". */
  text: string;
  loop: BarRange | null;
  tempo: number;
  mode: PracticeMode;
}

/** The heat level of a bar from its mistakes per target. */
export function heatLevel(mistakes: number, targets: number): HeatLevel {
  if (mistakes <= 0) return 0;
  const share = mistakes / Math.max(1, targets);
  if (share >= 0.6) return 3;
  if (share >= 0.25) return 2;
  return 1;
}

/** Stars for a run: by accuracy (60 / 80 / 95 %), at most 2 below the written tempo and 1 below 70 %; none for part of a song. */
export function runStars(accuracy: number, tempo: number, fullSong: boolean): Stars {
  if (!fullSong) return 0;
  const byAcc = starsForAccuracy(accuracy);
  const cap: Stars = tempo >= 100 ? 3 : tempo >= 70 ? 2 : 1;
  return Math.min(byAcc, cap) as Stars;
}

/**
 * The weak bars grouped into practice stretches: neighbouring weak bars (a one-bar gap allowed)
 * join, a lone bar takes the next one with it (a loop of one bar is too short to feel the music),
 * worst first by mistakes per note, at most `max`.
 */
export function practiceStretches(heat: readonly BarHeatCell[], barCount: number, max = 3): BarRange[] {
  const weak = heat.filter((h) => h.mistakes > 0).sort((a, b) => a.bar - b.bar);
  const groups: Array<{ from: number; to: number; mistakes: number; targets: number }> = [];
  for (const h of weak) {
    const last = groups[groups.length - 1];
    if (last && h.bar - last.to <= 2) {
      last.to = h.bar;
      last.mistakes += h.mistakes;
      last.targets += h.targets;
    } else groups.push({ from: h.bar, to: h.bar, mistakes: h.mistakes, targets: h.targets });
  }
  for (const g of groups) {
    if (g.from === g.to) {
      if (g.to + 1 < barCount) g.to += 1;
      else if (g.from > 0) g.from -= 1;
    }
  }
  return groups
    .sort((a, b) => b.mistakes / Math.max(1, b.targets) - a.mistakes / Math.max(1, a.targets) || a.from - b.from)
    .slice(0, max)
    .map((g) => ({ from: g.from, to: g.to }));
}

/** A practice tempo for a stretch that went wrong: slower the worse it went, in steps of 5, never under 40 %. */
export function suggestedTempo(accuracy: number, tempo: number): number {
  const factor = accuracy >= 0.9 ? 0.9 : accuracy >= 0.75 ? 0.8 : accuracy >= 0.5 ? 0.7 : 0.6;
  return clampTempo(Math.max(40, Math.round((tempo * factor) / 5) * 5));
}

function suggest(mode: PracticeMode, accuracy: number | null, tempo: number, weak: BarRange[], fullSong: boolean): Suggestion | null {
  if (mode === 'listen') return { text: 'Now play it with the song waiting for you', loop: null, tempo, mode: 'wait' };
  const acc = accuracy ?? 1;
  const worst = weak[0];
  if (worst && acc < 0.97) {
    const t = Math.min(tempo, suggestedTempo(acc, tempo));
    const where = loopLabel(worst).replace(/^Bar/, 'bar');
    return { text: `Loop ${where} at ${t} %`, loop: worst, tempo: t, mode: mode === 'wait' ? 'flow' : mode };
  }
  if (mode === 'wait') return { text: 'Now try it in time, with Flow', loop: null, tempo: Math.min(tempo, 80), mode: 'flow' };
  if (tempo < 100) {
    const t = Math.min(100, Math.round((tempo + 10) / 5) * 5);
    return { text: `Try it at ${t} %`, loop: null, tempo: t, mode };
  }
  if (!fullSong) return { text: 'Now play the whole song', loop: null, tempo, mode };
  return null;
}

function headline(mode: PracticeMode, accuracy: number | null, fullSong: boolean, played: number): string {
  if (mode === 'listen') return fullSong ? 'You heard the whole song' : 'Listened';
  if (played === 0) return 'Nothing was heard this time';
  const a = accuracy ?? 0;
  if (a >= 0.95) return fullSong ? 'A clean run' : 'Clean';
  if (a >= 0.8) return 'Nearly there';
  if (a >= 0.6) return 'Getting there';
  return 'A good start';
}

function heatFromBars(bars: ReadonlyArray<{ bar: number; targets: number; mistakes: number }>): BarHeatCell[] {
  return bars.map((b) => ({ bar: b.bar, targets: b.targets, mistakes: b.mistakes, level: heatLevel(b.mistakes, b.targets) }));
}

/** Context every summary needs. */
export interface RunContext {
  tempo: number;
  /** The slowest tempo of the run, when it changed (stars are capped by it). */
  starsTempo?: number;
  fullSong: boolean;
  durationSec: number;
  barCount: number;
}

/** The summary of a flow or tap-along run. */
export function summarizeFlow(result: FlowResult, mode: 'flow' | 'tap', ctx: RunContext): RunSummary {
  const c = result.counts;
  const played = c.perfect + c.good + c.early + c.late;
  const accuracy = result.judged ? result.accuracy / 100 : 0;
  const heat = heatFromBars(result.bars);
  const weak = practiceStretches(heat, ctx.barCount);
  return {
    mode,
    accuracy,
    stars: runStars(accuracy, ctx.starsTempo ?? ctx.tempo, ctx.fullSong),
    fullSong: ctx.fullSong,
    tempo: ctx.tempo,
    durationSec: ctx.durationSec,
    played,
    total: result.judged,
    counts: { ...c },
    maxCombo: result.maxCombo,
    score: result.score,
    firstTry: 0,
    hints: 0,
    skipped: 0,
    heat,
    weak,
    suggestion: suggest(mode, accuracy, ctx.tempo, weak, ctx.fullSong),
    headline: headline(mode, accuracy, ctx.fullSong, played),
  };
}

/**
 * The summary of a wait-mode run. Accuracy is the share of notes right at the first try (a note
 * found after a wrong one, with a hint, or skipped counts as a slip); there is no timing.
 */
export function summarizeWait(records: readonly WaitRecord[], ctx: RunContext): RunSummary {
  const reached = records.filter((r) => r.matched || r.skipped);
  const firstTry = reached.filter((r) => r.matched && r.wrong === 0 && r.hints === 0).length;
  const accuracy = reached.length ? firstTry / reached.length : 0;
  const byBar = new Map<number, { bar: number; targets: number; mistakes: number }>();
  for (const r of reached) {
    const b = byBar.get(r.bar) ?? { bar: r.bar, targets: 0, mistakes: 0 };
    b.targets++;
    if (!(r.matched && r.wrong === 0 && r.hints === 0)) b.mistakes++;
    byBar.set(r.bar, b);
  }
  const heat = heatFromBars([...byBar.values()].sort((a, b) => a.bar - b.bar));
  const weak = practiceStretches(heat, ctx.barCount);
  const played = reached.filter((r) => r.matched).length;
  return {
    mode: 'wait',
    accuracy,
    // Wait mode has no timing: it earns at most one star, as a first step.
    stars: ctx.fullSong && accuracy >= 0.6 ? 1 : 0,
    fullSong: ctx.fullSong,
    tempo: ctx.tempo,
    durationSec: ctx.durationSec,
    played,
    total: reached.length,
    counts: null,
    maxCombo: 0,
    score: 0,
    firstTry,
    hints: records.reduce((s, r) => s + r.hints, 0),
    skipped: records.filter((r) => r.skipped).length,
    heat,
    weak,
    suggestion: suggest('wait', accuracy, ctx.tempo, weak, ctx.fullSong),
    headline: headline('wait', accuracy, ctx.fullSong, played),
  };
}

/** The summary of a listen-only run. */
export function summarizeListen(ctx: RunContext): RunSummary {
  return {
    mode: 'listen', accuracy: null, stars: 0, fullSong: ctx.fullSong, tempo: ctx.tempo, durationSec: ctx.durationSec, played: 0, total: 0, counts: null,
    maxCombo: 0, score: 0, firstTry: 0, hints: 0, skipped: 0, heat: [], weak: [], suggestion: suggest('listen', null, ctx.tempo, [], ctx.fullSong), headline: headline('listen', null, ctx.fullSong, 0),
  };
}

// ── personal bests ───────────────────────────────────────────────────────────────────────────

/** A best run in one mode. */
export interface BestRun {
  /** 0–100. */
  accuracy: number;
  tempo: number;
  stars: number;
  combo: number;
  /** Epoch ms. */
  at: number;
}

/** What the player keeps on the `song:<id>` skill: bests per scored mode, and the last tempo. */
export interface SongData {
  best: Partial<Record<'flow' | 'wait' | 'tap', BestRun>>;
  lastTempo?: number;
}

/** Read the skill's `data` as the player's record (anything else is ignored). */
export function readSongData(raw: unknown): SongData {
  const out: SongData = { best: {} };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const best = r.best && typeof r.best === 'object' ? (r.best as Record<string, unknown>) : {};
  for (const mode of ['flow', 'wait', 'tap'] as const) {
    const b = best[mode] as Record<string, unknown> | undefined;
    if (b && typeof b.accuracy === 'number' && typeof b.tempo === 'number') {
      out.best[mode] = { accuracy: b.accuracy, tempo: b.tempo, stars: typeof b.stars === 'number' ? b.stars : 0, combo: typeof b.combo === 'number' ? b.combo : 0, at: typeof b.at === 'number' ? b.at : 0 };
    }
  }
  if (typeof r.lastTempo === 'number') out.lastTempo = r.lastTempo;
  return out;
}

/**
 * Is this run a personal best? Only whole-song runs count. A best is better accuracy at the same
 * or a faster tempo, or a faster tempo at no worse than 5 points less accuracy.
 */
export function isBetter(run: { accuracy: number; tempo: number }, prev: BestRun | undefined): boolean {
  if (!prev) return true;
  if (run.tempo >= prev.tempo && run.accuracy > prev.accuracy) return true;
  return run.tempo > prev.tempo && run.accuracy >= prev.accuracy - 5;
}

/** The song data after a run, and whether the run set a new best. */
export function withRun(data: SongData, summary: RunSummary, now: number): { data: SongData; newBest: boolean; previous: BestRun | null } {
  const mode = summary.mode;
  const next: SongData = { best: { ...data.best }, lastTempo: summary.tempo };
  if (mode === 'listen' || summary.accuracy === null || !summary.fullSong || summary.total === 0) return { data: next, newBest: false, previous: mode === 'listen' ? null : data.best[mode] ?? null };
  const run = { accuracy: Math.round(summary.accuracy * 1000) / 10, tempo: summary.tempo };
  const prev = data.best[mode];
  const newBest = isBetter(run, prev);
  if (newBest) next.best[mode] = { ...run, stars: summary.stars, combo: summary.maxCombo, at: now };
  return { data: next, newBest, previous: prev ?? null };
}

/** The line about bests: "New personal best" or "Your best: 92 % at 85 % speed". */
export function bestLine(newBest: boolean, previous: BestRun | null, summary: RunSummary): string | null {
  if (summary.mode === 'listen') return null;
  if (!summary.fullSong) return previous ? `Your best whole run: ${Math.round(previous.accuracy)} % at ${previous.tempo} % speed` : null;
  if (newBest) return previous ? `New personal best (was ${Math.round(previous.accuracy)} % at ${previous.tempo} % speed)` : 'Your first whole run of this song';
  return previous ? `Your best: ${Math.round(previous.accuracy)} % at ${previous.tempo} % speed` : null;
}

/** The one `recordActivity` input for a finished run (or a run left part-way). */
export function activityFor(summary: RunSummary, song: { id: string; title: string }, opts: { progress: number; data: SongData; reachedEnd: boolean }): ActivityInput {
  const scored = summary.mode !== 'listen' && summary.accuracy !== null && summary.total > 0;
  // Listening to the end is logged, but it is not a play-through: no crown for it.
  const completed = summary.fullSong && opts.reachedEnd && scored;
  const input: ActivityInput = {
    kind: 'song',
    id: `song:${song.id}`,
    title: song.title,
    durationSec: Math.max(0, Math.round(summary.durationSec)),
    completed,
    progress: completed ? 1 : Math.max(0, Math.min(1, opts.progress)),
    route: 'play',
    params: [song.id],
    data: opts.data as unknown as JsonValue,
    meta: { tempo: summary.tempo },
  };
  if (scored) {
    input.accuracy = Math.max(0, Math.min(1, summary.accuracy ?? 0));
    const c = summary.counts;
    input.mistakes = c ? c.missed + c.wrong + c.early + c.late : summary.total - summary.firstTry;
    input.count = summary.total;
    if (summary.maxCombo) input.combo = summary.maxCombo;
    if (summary.score) input.score = summary.score;
    if (completed) input.stars = summary.stars;
  }
  return input;
}

/**
 * Whether the results may suggest a microphone mode (Wait, Flow). Not where no microphone can be
 * had, and not after the learner refused it or none was found: a suggestion they cannot take is a
 * dead end.
 */
export function micUsable(failure: MediaFailure | null, hostBlocked: boolean): boolean {
  if (hostBlocked) return false;
  return !failure || failure === 'in-use' || failure === 'unknown';
}

/** A summary whose suggestion needs no microphone: a Wait or Flow suggestion becomes tap-along. */
export function withoutMic(summary: RunSummary): RunSummary {
  const sg = summary.suggestion;
  if (!sg || !needsMic(sg.mode)) return summary;
  const text = sg.loop ? sg.text : 'Now tap along in time with the notes';
  return { ...summary, suggestion: { ...sg, mode: 'tap', text } };
}
