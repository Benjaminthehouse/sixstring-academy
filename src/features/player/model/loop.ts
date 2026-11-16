/**
 * Loop selection and bar stepping. A loop is a range of song bars; it is picked by tapping its
 * first and last bar, by dragging across bars, from a section chip, or with the L key as an A–B
 * repeat (L at the first bar, L at the last, L again to clear). Pure: unit-tested.
 */
import { slug } from '@/app/router';
import type { Song, SongTimeline } from '@/core/song';
import type { BarRange } from './types';

/** Where an A–B pick is: nothing pending, or the first bar chosen and the last still to come. */
export type LoopPick = { stage: 'idle' } | { stage: 'end'; from: number };

/** No pick in progress. */
export const IDLE_PICK: LoopPick = { stage: 'idle' };

/** A loop range in order and inside the song, or null when it cannot be one. */
export function normalizeLoop(range: BarRange | null | undefined, barCount: number): BarRange | null {
  if (!range || barCount <= 0) return null;
  if (!Number.isFinite(range.from) || !Number.isFinite(range.to)) return null;
  const a = Math.round(Math.min(range.from, range.to));
  const b = Math.round(Math.max(range.from, range.to));
  if (b < 0 || a > barCount - 1) return null;
  return { from: Math.max(0, a), to: Math.min(barCount - 1, b) };
}

/** True when two ranges are the same (null equals null). */
export function sameLoop(a: BarRange | null | undefined, b: BarRange | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.from === b.from && a.to === b.to;
}

/** "Bar 9" or "Bars 9 to 12" (bars counted from 1, as printed on the score). */
export function loopLabel(range: BarRange): string {
  return range.from === range.to ? `Bar ${range.from + 1}` : `Bars ${range.from + 1} to ${range.to + 1}`;
}

/** Compact "9–12" for a button. */
export function loopShort(range: BarRange): string {
  return range.from === range.to ? `${range.from + 1}` : `${range.from + 1}–${range.to + 1}`;
}

/**
 * The L key as an A–B repeat at `bar`: with no loop it marks the first bar (shown as a one-bar
 * loop) and waits for the last; pressed again it closes the loop there; with a loop it clears it.
 */
export function loopKey(loop: BarRange | null, pick: LoopPick, bar: number): { loop: BarRange | null; pick: LoopPick } {
  if (pick.stage === 'end') return { loop: { from: Math.min(pick.from, bar), to: Math.max(pick.from, bar) }, pick: IDLE_PICK };
  if (loop) return { loop: null, pick: IDLE_PICK };
  return { loop: { from: bar, to: bar }, pick: { stage: 'end', from: bar } };
}

/** A section of the song as a chip: its name, slug and bars. */
export interface SectionChip {
  name: string;
  slug: string;
  range: BarRange;
}

/** The song's sections, once each by name (a repeated "Chorus" chip jumps to the first one). */
export function sectionChips(song: Pick<Song, 'sections' | 'bars'>): SectionChip[] {
  const out: SectionChip[] = [];
  const seen = new Set<string>();
  for (const s of song.sections) {
    const key = slug(s.name) || `bar-${s.start + 1}`;
    if (seen.has(key) || s.end <= s.start) continue;
    seen.add(key);
    out.push({ name: s.name.trim() || `Bar ${s.start + 1}`, slug: key, range: { from: s.start, to: Math.min(song.bars.length - 1, s.end - 1) } });
  }
  return out;
}

/** The section chip a bar is in (the last one starting at or before it). */
export function sectionAtBar(chips: readonly SectionChip[], bar: number): SectionChip | null {
  let found: SectionChip | null = null;
  for (const c of chips) if (bar >= c.range.from && bar <= c.range.to) found = c;
  return found;
}

/**
 * Where the ← and → keys go, in playback order (repeats included): → to the start of the next
 * bar; ← to the start of this bar, or of the previous one when the cursor is already near the
 * start (as "previous track" works). A loop keeps both inside it. Returns an absolute tick.
 */
export function stepBarTick(timeline: Pick<SongTimeline, 'bars' | 'totalTicks'>, tick: number, dir: -1 | 1, loopTicks?: { start: number; end: number } | null): number {
  const bars = timeline.bars;
  if (!bars.length) return 0;
  let i = bars.findIndex((b) => tick >= b.start && tick < b.start + b.length);
  if (i < 0) i = tick >= timeline.totalTicks ? bars.length - 1 : 0;
  const here = bars[i];
  let target: number;
  if (dir > 0) target = i + 1 < bars.length ? bars[i + 1].start : here.start;
  else {
    const into = tick - here.start;
    target = into > here.length * 0.15 || i === 0 ? here.start : bars[i - 1].start;
  }
  if (loopTicks) {
    if (target < loopTicks.start) target = loopTicks.start;
    if (target >= loopTicks.end) target = dir > 0 ? loopTicks.start : Math.max(loopTicks.start, here.start);
  }
  return target;
}
