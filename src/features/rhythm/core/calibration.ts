/**
 * Latency calibration. A tap reaches the page some milliseconds after the finger lands, a clap
 * reaches it later still (speaker, air, microphone, analysis), and both delays depend on the
 * device. The learner taps or claps along with a click for ten seconds; the typical distance
 * between click and tap is stored and taken off every tap before it is judged.
 *
 * Stored under the rhythm trainer's own key (`rhythm.calibration`), per device, as plain JSON.
 */
import { readJSON, writeJSON } from '@/core/platform';
import { median } from './scoring';

/** Storage key (the platform layer adds its own prefix). */
export const CALIBRATION_KEY = 'rhythm.calibration';

/** How taps arrive. */
export type InputSource = 'tap' | 'mic';

/** What the microphone heard of the app's own sound during calibration. */
export interface Bleed {
  /** Delay between a click being scheduled and the microphone hearing it, ms. */
  loopMs: number;
  /** Level of the click as the microphone hears it, dBFS. */
  db: number;
}

/** The stored calibration. */
export interface Calibration {
  v: 1;
  /** Milliseconds a tap or key press arrives after the click it was meant for; null = never measured. */
  tapMs: number | null;
  /** The same for a clap or strum heard through the microphone. */
  micMs: number | null;
  /** When each was measured (ms since epoch). */
  tapAt: number | null;
  micAt: number | null;
  /** The learner has seen the offer to calibrate taps (whether they took it or not). */
  offered: boolean;
  /** The same for the microphone. */
  micOffered: boolean;
  /** Set when the microphone can hear the speakers. */
  bleed: Bleed | null;
}

/** A calibration with nothing measured. */
export const EMPTY_CALIBRATION: Calibration = { v: 1, tapMs: null, micMs: null, tapAt: null, micAt: null, offered: false, micOffered: false, bleed: null };

const num = (x: unknown, lo: number, hi: number): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null);

/** Offsets outside these limits are not believable and are never stored or applied. */
export const OFFSET_LIMITS: Record<InputSource, [number, number]> = { tap: [-150, 300], mic: [-150, 700] };

/** Clean whatever was stored: wrong shapes and impossible numbers fall back to "not measured". */
export function normalizeCalibration(raw: unknown): Calibration {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CALIBRATION };
  const r = raw as Record<string, unknown>;
  const bleedRaw = r.bleed && typeof r.bleed === 'object' ? (r.bleed as Record<string, unknown>) : null;
  const loopMs = bleedRaw ? num(bleedRaw.loopMs, -50, 700) : null;
  const db = bleedRaw ? num(bleedRaw.db, -120, 0) : null;
  return {
    v: 1,
    tapMs: num(r.tapMs, ...OFFSET_LIMITS.tap),
    micMs: num(r.micMs, ...OFFSET_LIMITS.mic),
    tapAt: num(r.tapAt, 0, Number.MAX_SAFE_INTEGER),
    micAt: num(r.micAt, 0, Number.MAX_SAFE_INTEGER),
    offered: r.offered === true,
    micOffered: r.micOffered === true,
    bleed: loopMs !== null && db !== null ? { loopMs, db } : null,
  };
}

/** Read the stored calibration (never throws). */
export function loadCalibration(): Calibration {
  return normalizeCalibration(readJSON<unknown>(CALIBRATION_KEY, null));
}

/** Merge a change into the stored calibration and return the result. */
export function saveCalibration(patch: Partial<Calibration>): Calibration {
  const next = normalizeCalibration({ ...loadCalibration(), ...patch });
  writeJSON(CALIBRATION_KEY, next);
  return next;
}

/** True when this source has been measured on this device. */
export function isCalibrated(cal: Calibration, source: InputSource): boolean {
  return (source === 'tap' ? cal.tapMs : cal.micMs) !== null;
}

/**
 * The offset to take off a tap, in ms. Without a measurement: nothing for taps, and for the
 * microphone the latency the browser reports for the output and input devices (`fallbackMicMs`).
 */
export function offsetFor(cal: Calibration, source: InputSource, fallbackMicMs = 60): number {
  if (source === 'tap') return cal.tapMs ?? 0;
  return cal.micMs ?? fallbackMicMs;
}

/** Result of measuring a run of taps against a run of clicks. */
export interface OffsetEstimate {
  /** Typical lateness of a tap in ms (negative = the taps come before the click). */
  offsetMs: number;
  /** How much the taps vary around it (standard deviation, ms). */
  spreadMs: number;
  /** Taps used after the stray ones were dropped. */
  used: number;
  /** Taps that were close enough to a click to count at all. */
  matched: number;
  /** `good`: store it. `uneven`: usable, but worth another go. `too-few`: not enough taps to say. */
  quality: 'good' | 'uneven' | 'too-few';
  /** Each used tap's lateness in ms, for the picture. */
  deviations: number[];
}

/**
 * Estimate the offset between clicks and taps.
 *
 * The clicks are periodic, so a tap's lateness is only known modulo the period. The taps are first
 * placed on a circle of one period and their common direction is found (robust against a tap that
 * sits right at the edge of the window); that centre is then read as a lateness between
 * `earliestMs` and one period later. For screen taps `earliestMs` is half a period (a tap can be
 * early or late); for the microphone it is a short lead, because sound that has to travel through a
 * speaker and a microphone can only arrive late.
 */
export function estimateOffset(clickTimes: readonly number[], tapTimes: readonly number[], opts: { periodSec: number; earliestMs?: number; minTaps?: number }): OffsetEstimate {
  const period = opts.periodSec;
  const none: OffsetEstimate = { offsetMs: 0, spreadMs: 0, used: 0, matched: 0, quality: 'too-few', deviations: [] };
  if (!(period > 0) || !clickTimes.length) return none;
  const first = clickTimes[0];
  const last = clickTimes[clickTimes.length - 1];
  // Only taps made while the clicks were running count.
  const taps = tapTimes.filter((t) => t > first - period / 2 && t < last + period);
  const minTaps = opts.minTaps ?? 6;
  if (taps.length < minTaps) return { ...none, matched: taps.length };
  const twoPi = Math.PI * 2;
  let sx = 0;
  let sy = 0;
  for (const t of taps) {
    const phase = (((t - first) % period) + period) % period;
    sx += Math.cos((phase / period) * twoPi);
    sy += Math.sin((phase / period) * twoPi);
  }
  let centre = (Math.atan2(sy, sx) / twoPi) * period; // seconds, -P/2..P/2
  const earliest = (opts.earliestMs ?? -(period * 1000) / 2) / 1000;
  while (centre < earliest) centre += period;
  while (centre >= earliest + period) centre -= period;
  // Each tap's lateness, unwrapped around the centre.
  const raw = taps.map((t) => {
    let d = (((t - first - centre) % period) + period) % period;
    if (d > period / 2) d -= period;
    return (centre + d) * 1000;
  });
  const mid = median(raw);
  const mad = median(raw.map((d) => Math.abs(d - mid)));
  const keep = Math.max(60, 3 * 1.4826 * mad);
  const used = raw.filter((d) => Math.abs(d - mid) <= keep);
  const offsetMs = used.reduce((a, b) => a + b, 0) / used.length;
  const spreadMs = used.length > 1 ? Math.sqrt(used.reduce((a, b) => a + (b - offsetMs) * (b - offsetMs), 0) / (used.length - 1)) : 0;
  const quality: OffsetEstimate['quality'] = used.length < minTaps ? 'too-few' : spreadMs <= 45 && used.length >= taps.length * 0.7 ? 'good' : 'uneven';
  return { offsetMs, spreadMs, used: used.length, matched: taps.length, quality, deviations: used };
}

/**
 * Did the microphone hear the app's own clicks? `probeTimes` are clicks played at irregular
 * intervals (so nobody claps along with them by accident); if most of them come back as onsets
 * with the same delay, the speakers are bleeding into the microphone.
 */
export function detectBleed(probeTimes: readonly number[], onsets: ReadonlyArray<{ time: number; levelDb: number }>, maxDelayMs = 400): Bleed | null {
  if (probeTimes.length < 3) return null;
  let best: { loopMs: number; db: number; count: number } | null = null;
  // Try every onset as the echo of the first probe, then see how many other probes agree.
  for (const candidate of onsets) {
    const delay = candidate.time - probeTimes[0];
    if (delay < -0.02 || delay > maxDelayMs / 1000) continue;
    const matches = probeTimes.map((p) => onsets.find((o) => Math.abs(o.time - (p + delay)) <= 0.012)).filter((o): o is { time: number; levelDb: number } => !!o);
    if (matches.length >= Math.ceil(probeTimes.length * 0.75) && (!best || matches.length > best.count)) {
      best = { loopMs: delay * 1000, db: Math.max(...matches.map((m) => m.levelDb)), count: matches.length };
    }
  }
  return best ? { loopMs: best.loopMs, db: best.db } : null;
}

/** True when an onset is most likely the app's own sound coming back through the microphone. */
export function isBleed(onset: { time: number; levelDb: number }, soundTimes: readonly number[], bleed: Bleed | null, marginDb = 6): boolean {
  if (!bleed) return false;
  if (onset.levelDb > bleed.db + marginDb) return false;
  const expected = onset.time - bleed.loopMs / 1000;
  return soundTimes.some((s) => Math.abs(s - expected) <= 0.03);
}
