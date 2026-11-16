/**
 * The beat a meter is counted in, for every tempo the player shows. Songs store tempo as quarter
 * notes per minute (6/8 at ♩. = 60 is `tempo: 90`), but a learner counts the meter's own beat: a
 * dotted quarter in 6/8, 9/8 and 12/8, an eighth in 3/8, a quarter in 4/4. The count-in and the
 * click already count that beat (`resolveMeter` of the audio module); the tempo button, the side
 * panel, the header and the speed trainer use these helpers so every number agrees with them and
 * with the mark printed on the score. Pure: unit-tested.
 */
import { PPQ, resolveMeter } from '@/core/audio';

/** The beat of a meter. */
export interface MeterBeat {
  /** Length of one counted beat in ticks (960 = quarter, 1440 = dotted quarter, 480 = eighth). */
  ticks: number;
  /** Beats in a bar, as the count-in counts them. */
  perBar: number;
  /** The note it is written with in a tempo mark (`♩.`), or null for a plain quarter. */
  glyph: string | null;
  /** Its name in words, for "60 dotted-quarter beats a minute". */
  name: string;
}

const NAMES: Record<number, { glyph: string | null; name: string }> = {
  [PPQ]: { glyph: null, name: 'quarter-note' },
  [PPQ * 1.5]: { glyph: '♩.', name: 'dotted-quarter' },
  [PPQ / 2]: { glyph: '♪', name: 'eighth-note' },
  [PPQ * 0.75]: { glyph: '♪.', name: 'dotted-eighth' },
  [PPQ * 2]: { glyph: null, name: 'half-note' },
  [PPQ * 3]: { glyph: null, name: 'dotted-half' },
};

/** The beat a meter is counted in (4/4: quarters, 6/8: two dotted quarters, 3/8: three eighths). */
export function meterBeat(time: { numerator: number; denominator: number } | null | undefined): MeterBeat {
  if (!time) return { ticks: PPQ, perBar: 4, glyph: null, name: 'quarter-note' };
  let m;
  try {
    m = resolveMeter({ numerator: time.numerator, denominator: time.denominator });
  } catch {
    return { ticks: PPQ, perBar: 4, glyph: null, name: 'quarter-note' };
  }
  const ticks = m.tempoBeatTicks;
  const known = NAMES[ticks] ?? { glyph: null, name: 'quarter-note' };
  return { ticks, perBar: m.beats.length, glyph: known.glyph, name: known.name };
}

/** Quarter notes per minute as beats of the meter per minute (6/8 at 90 quarters: 60). */
export function beatsPerMinute(quarterBpm: number, time: { numerator: number; denominator: number } | null | undefined): number {
  return (quarterBpm * PPQ) / meterBeat(time).ticks;
}

/** A tempo as the player shows it. */
export interface TempoMark {
  /** Beats of the meter per minute, rounded. */
  value: number;
  /** For a button or a chip: `90 bpm`, `♩. = 60`, `♪ = 120`. */
  short: string;
  /** For a screen reader or a hint: `60 dotted-quarter beats a minute`. */
  spoken: string;
  /** The beat it counts. */
  beat: MeterBeat;
}

/**
 * A tempo in the meter's own beat: `tempoMark(90, 6/8)` -> `♩. = 60`, the mark printed on the
 * score; a quarter beat stays `90 bpm`, the way metronomes and the rest of the app say it.
 */
export function tempoMark(quarterBpm: number, time: { numerator: number; denominator: number } | null | undefined): TempoMark {
  const beat = meterBeat(time);
  const value = Math.max(0, Math.round(beatsPerMinute(quarterBpm, time)));
  const plain = beat.ticks === PPQ;
  return {
    value,
    short: beat.glyph ? `${beat.glyph} = ${value}` : `${value} bpm`,
    spoken: plain ? `${value} beats a minute` : `${value} ${beat.name} beats a minute`,
    beat,
  };
}

/** One line for the count-in switch: "One bar of clicks before the music starts: 2 dotted-quarter beats." */
export function countInWords(time: { numerator: number; denominator: number } | null | undefined): string {
  const beat = meterBeat(time);
  const plain = beat.ticks === PPQ;
  const n = beat.perBar;
  return `One bar of clicks before the music starts: ${n} ${plain ? '' : `${beat.name} `}${n === 1 ? 'beat' : 'beats'}.`;
}
