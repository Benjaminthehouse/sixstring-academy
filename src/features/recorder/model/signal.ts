/**
 * Numbers from audio: the waveform overview of a take, its loudness, the live input level and what
 * to tell the learner about it, and where a tap on the waveform seeks to. Pure, unit-tested.
 */

/** Points in a take's waveform overview. */
export const PEAK_COUNT = 160;
/** The quietest level the live meter shows, dBFS (its left end). */
export const METER_FLOOR_DB = -60;
/** A sample at or above this is treated as clipped. */
export const CLIP_LEVEL = 0.985;

/**
 * The waveform overview: the loudest sample (absolute, 0..1) in each of `count` equal slices of the
 * take, all channels together, rounded to three decimals. Empty audio gives `count` zeros.
 */
export function computePeaks(channels: readonly Float32Array[], count: number = PEAK_COUNT): number[] {
  const n = Math.max(1, Math.floor(count));
  const length = channels.reduce((m, c) => Math.max(m, c.length), 0);
  const out = new Array<number>(n).fill(0);
  if (length === 0) return out;
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * length) / n));
    let peak = 0;
    for (const ch of channels) {
      const end = Math.min(to, ch.length);
      for (let j = from; j < end; j++) {
        const v = ch[j];
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
    }
    out[i] = Math.round(Math.min(1, peak) * 1000) / 1000;
  }
  return out;
}

/**
 * A peak envelope of any length brought to `count` points: each point is the loudest of the values
 * it covers (a short envelope is stretched, each value repeated). Used when a take cannot be
 * decoded and its waveform comes from the meter readings taken while it was recorded.
 */
export function resamplePeaks(envelope: readonly number[], count: number = PEAK_COUNT): number[] {
  const n = Math.max(1, Math.floor(count));
  if (envelope.length === 0) return new Array<number>(n).fill(0);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * envelope.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * envelope.length) / n));
    let peak = 0;
    for (let j = from; j < to && j < envelope.length; j++) peak = Math.max(peak, Number.isFinite(envelope[j]) ? envelope[j] : 0);
    out[i] = Math.max(0, Math.min(1, peak));
  }
  return out;
}

/** Root-mean-square level of the audio (all channels), 0..1. */
export function rmsOf(channels: readonly Float32Array[]): number {
  let sum = 0;
  let count = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
    count += ch.length;
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

/** The level of one block of samples: RMS in dBFS (-Infinity for silence) and the absolute peak. */
export function blockLevel(samples: ArrayLike<number>): { db: number; peak: number } {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    sum += v * v;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  const rms = samples.length > 0 ? Math.sqrt(sum / samples.length) : 0;
  return { db: rms > 0 ? 20 * Math.log10(rms) : -Infinity, peak };
}

/** A level in dBFS as a share of the meter (0 at {@link METER_FLOOR_DB}, 1 at full scale). */
export function meterShare(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
}

/** What the live meter says about the input. */
export type LevelVerdict = 'silent' | 'quiet' | 'good' | 'loud';

/** Words for each verdict, shown (and announced) under the meter. */
export const VERDICT_TEXT: Readonly<Record<LevelVerdict, string>> = {
  silent: 'Listening. Play something to check the level.',
  quiet: 'A bit quiet. Move the phone or laptop closer to the guitar.',
  good: 'Good level.',
  loud: 'Too loud: it is distorting. Move back a little or play softer.',
};

/**
 * The verdict for the current block, with a little memory so it does not flicker: a clip shows
 * "loud" at once and keeps it for `holdMs`; otherwise RMS above -36 dBFS is good, above -54 quiet,
 * and real silence keeps the last verdict for `holdMs` (a pause between phrases is not "silent").
 */
export function levelVerdict(db: number, peak: number, state: { verdict: LevelVerdict; at: number }, nowMs: number, holdMs = 1500): LevelVerdict {
  if (peak >= CLIP_LEVEL) return 'loud';
  const held = nowMs - state.at < holdMs;
  if (state.verdict === 'loud' && held) return 'loud';
  if (db > -36) return 'good';
  if (db > -54) return state.verdict === 'good' && held ? 'good' : 'quiet';
  return state.verdict !== 'silent' && held ? state.verdict : 'silent';
}

/** A short note about a finished take from its overview, or null when it sounds fine. */
export function takeAdvice(peaks: readonly number[]): { tone: 'warn' | 'info'; text: string } | null {
  if (peaks.length === 0) return null;
  const loudest = peaks.reduce((m, p) => Math.max(m, p), 0);
  const clipped = peaks.filter((p) => p >= CLIP_LEVEL).length;
  if (clipped >= Math.max(2, peaks.length * 0.02)) return { tone: 'warn', text: 'Parts of this take hit the top of the meter and may sound distorted. Next time move back a little.' };
  if (loudest < 0.02) return { tone: 'warn', text: 'This take is almost silent. Check that the right microphone is chosen in Me > Settings > Microphone.' };
  if (loudest < 0.08) return { tone: 'info', text: 'This take is quiet. Move closer to the guitar next time; you can still listen to it.' };
  return null;
}

/** Where a tap at `x` px on a waveform `width` px wide seeks to, as a share of the take (0..1). */
export function seekFraction(x: number, width: number): number {
  if (!(width > 0) || !Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x / width));
}

/**
 * The new position for a key on the focused waveform, seconds, or null for a key it does not use:
 * arrows step 5 s (1 s with Shift), Page Up/Down 15 s, Home/End the ends.
 */
export function seekForKey(key: string, shift: boolean, current: number, duration: number): number | null {
  const d = Math.max(0, duration);
  const clamp = (t: number) => Math.max(0, Math.min(d, t));
  const step = shift ? 1 : 5;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(current + step);
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(current - step);
    case 'PageUp':
      return clamp(current + 15);
    case 'PageDown':
      return clamp(current - 15);
    case 'Home':
      return 0;
    case 'End':
      return d;
    default:
      return null;
  }
}

/**
 * When the recorder starts for a counted-in take: just after the last count-in click has died
 * away and before the downbeat, so the take begins on the beat and no click is in it.
 */
export function recordStartTime(downbeat: number, beatSeconds: number): number {
  const lead = Math.min(0.12, Math.max(0, beatSeconds) / 2);
  return downbeat - lead;
}
