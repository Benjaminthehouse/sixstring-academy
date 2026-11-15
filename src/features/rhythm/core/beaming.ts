/**
 * Beaming: which flagged notes (eighths and sixteenths) are joined by a beam.
 *
 * The rule used everywhere in the trainer is the one that keeps the beat visible: notes are beamed
 * only with their neighbours inside the same felt beat (a quarter in 4/4 and 3/4, a dotted quarter
 * in 6/8), and a rest or a longer note breaks the beam. A flagged note left alone keeps its flag.
 */
import { beatIndexAt, meterInfo, type MeterInfo } from './meter';
import type { Rhythm, RhythmBar, RhythmItem } from './rhythm';

/** True for values drawn with a flag or beam. */
export function isFlagged(item: RhythmItem): boolean {
  return !item.rest && (item.value === 'e' || item.value === 's');
}

/** Beam groups of one bar: each is a list of item indices, in order, with at least two notes. */
export function beamGroupsOfBar(bar: RhythmBar, meter: MeterInfo): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  let currentBeat = -1;
  const close = () => {
    if (current.length >= 2) groups.push(current);
    current = [];
    currentBeat = -1;
  };
  bar.items.forEach((item, i) => {
    if (!isFlagged(item)) {
      close();
      return;
    }
    const beat = beatIndexAt(item.tick, meter);
    if (current.length && beat !== currentBeat) close();
    current.push(i);
    currentBeat = beat;
  });
  close();
  return groups;
}

/** Beam groups of every bar of a rhythm. */
export function beamGroups(rhythm: Rhythm): number[][][] {
  const meter = meterInfo(rhythm.meter);
  return rhythm.bars.map((bar) => beamGroupsOfBar(bar, meter));
}

/** How the second (sixteenth) beam is drawn at one note of a group. */
export type SecondaryBeam = 'none' | 'full-right' | 'stub-left' | 'stub-right';

/**
 * The sixteenth beams inside a group: a full second beam from a sixteenth to a following
 * sixteenth, otherwise a short stub that points at the neighbour it belongs with (left after a
 * dotted eighth, right when the sixteenth opens the group).
 */
export function secondaryBeams(bar: RhythmBar, group: readonly number[]): SecondaryBeam[] {
  return group.map((index, k) => {
    const item = bar.items[index];
    if (item.value !== 's') return 'none';
    const next = k + 1 < group.length ? bar.items[group[k + 1]] : null;
    const prev = k > 0 ? bar.items[group[k - 1]] : null;
    if (next && next.value === 's') return 'full-right';
    if (prev && prev.value === 's') return 'none'; // already joined from the left
    return prev ? 'stub-left' : 'stub-right';
  });
}
