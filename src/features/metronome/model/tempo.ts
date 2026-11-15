/**
 * Tempo helpers for the screen: limits, the Italian name, typed input, and the maths of the tempo
 * dial (a knob you turn: a fixed number of degrees per BPM, so any spot on the ring can be grabbed
 * without the value jumping).
 */
import { MAX_TEMPO, MIN_TEMPO } from '@/core/audio';
import { tempoMarking } from '@/core/theory';

/** Slowest tempo the metronome plays (from the engine). */
export const TEMPO_MIN = MIN_TEMPO;
/** Fastest tempo the metronome plays (from the engine). */
export const TEMPO_MAX = MAX_TEMPO;

/** A whole-number tempo inside the metronome's range; not-a-number gives `fallback`. */
export function clampTempo(bpm: number, fallback = 100): number {
  if (!Number.isFinite(bpm)) return fallback;
  return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(bpm)));
}

/** The Italian tempo marking and what it means: 120 -> { name: 'Allegro', meaning: 'fast and bright' }. */
export function tempoName(bpm: number): { name: string; meaning: string } {
  const m = tempoMarking(Math.max(1, bpm));
  return { name: m.name, meaning: m.meaning };
}

/** Parse a typed tempo ("96", " 120 bpm", "72.4"); null when there is no number in it. */
export function parseTempoInput(text: string): number | null {
  const m = /\d+(?:[.,]\d+)?/.exec(text);
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Degrees the dial turns for one BPM: a full turn is 120 BPM. */
export const DIAL_DEGREES_PER_BPM = 3;

/** Angle of a point around a centre, in degrees clockwise from twelve o'clock (0..360). */
export function pointAngle(x: number, y: number, cx: number, cy: number): number {
  const deg = (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** The shortest signed turn from angle `a` to angle `b` (-180..180). */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** The tempo after turning the dial by `degrees` from `startBpm` (clockwise = faster). */
export function tempoAfterTurn(startBpm: number, degrees: number): number {
  return clampTempo(startBpm + degrees / DIAL_DEGREES_PER_BPM, startBpm);
}

/**
 * Where a tempo sits on the dial's gauge (0..1). Logarithmic, because a step from 40 to 60 is as
 * big a change in feel as one from 120 to 180; it gives the everyday range most of the arc.
 */
export function gaugeFraction(bpm: number): number {
  const t = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, bpm));
  return Math.log(t / TEMPO_MIN) / Math.log(TEMPO_MAX / TEMPO_MIN);
}

/** One step of the plus and minus buttons and the arrow keys: 1 BPM, or 5 with Shift. */
export function nudgeTempo(bpm: number, direction: 1 | -1, big = false): number {
  return clampTempo(bpm + direction * (big ? 5 : 1), bpm);
}
