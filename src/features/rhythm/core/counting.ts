/**
 * Counting out loud: the syllable a teacher says at each place in the bar.
 *
 *   simple time    1 e & a 2 e & a        (sixteenths)      1 trip let 2 trip let   (triplets)
 *   compound time  1 2 3 4 5 6            (the eighths; "&" between them)
 *   odd /8 meters  1 2 3 1 2 1 2          (restart on every group, which is how 7/8 is felt)
 */
import { PPQ } from '@/core/theory';
import { beatIndexAt, type MeterInfo } from './meter';

/** Which part of the beat a syllable is: used to group timing statistics ("you rush the off-beats"). */
export type CountPart = 'beat' | 'and' | 'e' | 'a' | 'trip' | 'let' | 'other';

/** One spoken syllable. */
export interface Count {
  text: string;
  part: CountPart;
  /** True for the number of a felt beat (drawn stronger). */
  strong: boolean;
}

const NONE: Count = { text: '', part: 'other', strong: false };

/**
 * The syllable at a tick inside a bar, or an empty count when the position is not on a counting
 * grid (sixteenths and eighth triplets). Positions are written positions: swing does not change
 * what is said.
 */
export function countAt(tickInBar: number, meter: MeterInfo): Count {
  const { ts } = meter;
  if (meter.compound || (ts.kind === 'odd' && ts.denominator >= 8)) {
    // Count the written units; in odd meters restart the numbers on every group.
    const unit = tickInBar / ts.unitTicks;
    const whole = Math.floor(unit + 1e-9);
    const within = tickInBar - whole * ts.unitTicks;
    if (Math.abs(within) < 1e-6) {
      if (meter.compound) return { text: String(whole + 1), part: whole % 3 === 0 ? 'beat' : 'and', strong: whole % 3 === 0 };
      let start = 0;
      for (const size of ts.grouping) {
        if (whole < start + size) return { text: String(whole - start + 1), part: whole === start ? 'beat' : 'and', strong: whole === start };
        start += size;
      }
      return NONE;
    }
    if (Math.abs(within - ts.unitTicks / 2) < 1e-6) return { text: '&', part: 'e', strong: false };
    return NONE;
  }
  const beat = beatIndexAt(tickInBar, meter);
  const within = tickInBar - meter.beatStarts[beat];
  const len = meter.beatTicks[beat] || PPQ;
  const at = (fraction: number) => Math.abs(within - len * fraction) < 1e-6;
  if (at(0)) return { text: String(beat + 1), part: 'beat', strong: true };
  if (at(1 / 2)) return { text: '&', part: 'and', strong: false };
  if (at(1 / 4)) return { text: 'e', part: 'e', strong: false };
  if (at(3 / 4)) return { text: 'a', part: 'a', strong: false };
  if (at(1 / 3)) return { text: 'trip', part: 'trip', strong: false };
  if (at(2 / 3)) return { text: 'let', part: 'let', strong: false };
  return NONE;
}

/** The numbers of the felt beats that pass while a note of `ticks` length is held (not counting its own start). */
export function heldBeats(tickInBar: number, ticks: number, meter: MeterInfo): Array<{ tick: number; text: string }> {
  const out: Array<{ tick: number; text: string }> = [];
  meter.beatStarts.forEach((start, beat) => {
    if (start > tickInBar + 1e-6 && start < tickInBar + ticks - 1e-6) out.push({ tick: start, text: countAt(start, meter).text || String(beat + 1) });
  });
  return out;
}

/** The whole counting line of one bar on a regular grid, e.g. `1 & 2 & 3 & 4 &` for eighths in 4/4. */
export function countLine(meter: MeterInfo, slotTicks: number): Count[] {
  const out: Count[] = [];
  for (let tick = 0; tick < meter.barTicks - 1e-6; tick += slotTicks) out.push(countAt(tick, meter));
  return out;
}

/** True when a part of the beat is off the beat (anything but the beat itself). */
export function isOffBeat(part: CountPart): boolean {
  return part !== 'beat';
}
