/**
 * Dynamics judged from the microphone's level readings, bar by bar: five clear steps from pp to
 * ff, or a smooth swell up and down. Pure.
 */
import type { Verdict } from './takes';

/** One level reading: time (seconds) and level in dBFS. */
export interface LevelSample {
  time: number;
  db: number;
}

/** The result of a dynamics check. */
export interface LevelResult {
  found: boolean;
  /** Typical playing level of each bar, in dBFS. */
  barDb: number[];
  /** Loudest bar minus softest bar, in dB. */
  rangeDb: number;
  verdict: Verdict;
  messages: string[];
}

/** The typical playing level in a window: the mean of its louder half, so the gaps between notes do not count. */
function playingLevel(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => b - a);
  const top = s.slice(0, Math.max(1, Math.ceil(s.length / 2)));
  return top.reduce((a, b) => a + b, 0) / top.length;
}

/** Levels per bar, bars counted from the first stroke. */
export function barLevels(levels: readonly LevelSample[], firstStroke: number, barSec: number, bars: number): number[] {
  const out: number[] = [];
  for (let b = 0; b < bars; b++) {
    const from = firstStroke + b * barSec;
    const to = from + barSec;
    out.push(playingLevel(levels.filter((l) => l.time >= from && l.time < to).map((l) => l.db)));
  }
  return out;
}

const NAMES = ['pp', 'p', 'mf', 'f', 'ff'];

/**
 * Judge a dynamics take.
 * @param shape `steps`: five bars pp to ff, each louder than the last; `swell`: four bars louder, four softer
 */
export function analyzeLevels(levels: readonly LevelSample[], onsets: readonly number[], spec: { barSec: number; shape: 'steps' | 'swell' }): LevelResult {
  const bars = spec.shape === 'steps' ? 5 : 8;
  if (!onsets.length || !levels.length) return { found: false, barDb: [], rangeDb: 0, verdict: 'not-yet', messages: ['Nothing came through. Check that the microphone hears the guitar, then try again.'] };
  const first = Math.min(...onsets);
  const barDb = barLevels(levels, first, spec.barSec, bars);
  if (barDb.some((d) => !Number.isFinite(d))) {
    return { found: false, barDb, rangeDb: 0, verdict: 'not-yet', messages: ['The take stopped early. Play all the bars, then stop.'] };
  }
  const rangeDb = Math.max(...barDb) - Math.min(...barDb);
  const messages: string[] = [];
  let verdict: Verdict;
  if (spec.shape === 'steps') {
    const steps = barDb.slice(1).map((d, i) => d - barDb[i]);
    const flat = steps.map((s, i) => (s < 1.5 ? i : -1)).filter((i) => i >= 0);
    if (!flat.length && rangeDb >= 10) verdict = 'clean';
    else if (flat.length <= 1 && rangeDb >= 6) verdict = 'close';
    else verdict = 'not-yet';
    messages.push(verdict === 'clean' ? `Five clear levels, ${Math.round(rangeDb)} dB from pp to ff.` : `From softest to loudest: ${Math.round(rangeDb)} dB (aim for 10 or more).`);
    for (const i of flat) messages.push(`${NAMES[i + 1]} was not louder than ${NAMES[i]}: make the difference bigger.`);
  } else {
    const rise = barDb[3] - barDb[0];
    const fall = barDb[4] - barDb[7];
    const bumps = [1, 2, 3].filter((i) => barDb[i] < barDb[i - 1] - 1).length + [5, 6, 7].filter((i) => barDb[i] > barDb[i - 1] + 1).length;
    if (rise >= 6 && fall >= 6 && bumps === 0) verdict = 'clean';
    else if (rise >= 3 && fall >= 3 && bumps <= 1) verdict = 'close';
    else verdict = 'not-yet';
    messages.push(`Up by ${Math.round(rise)} dB over four bars, down by ${Math.round(fall)} dB over four (aim for 6 or more each way).`);
    if (bumps) messages.push('The swell had a bump: make each bar a little louder (or softer) than the one before.');
  }
  return { found: true, barDb, rangeDb, verdict, messages };
}
