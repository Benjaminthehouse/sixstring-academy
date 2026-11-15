/**
 * Where everything goes on a line of rhythm notation. Pure geometry: the React component only
 * turns this into SVG.
 *
 * A one-line percussion staff: noteheads on the line with stems up, flagged notes beamed by beat,
 * rests on the line, ties underneath, the count below. Spacing follows the usual engraving rule
 * that a note twice as long gets more room, but not twice as much, so sixteenths stay readable and
 * whole notes do not waste the line. All measurements are in staff spaces until the final scale.
 */
import { beamGroupsOfBar, isFlagged, secondaryBeams } from '../core/beaming';
import { countAt, heldBeats, type Count } from '../core/counting';
import { meterInfo } from '../core/meter';
import { tupletGroups, type Rhythm, type RhythmItem } from '../core/rhythm';

/** A note or rest placed on the line. */
export interface PlacedItem {
  bar: number;
  index: number;
  item: RhythmItem;
  /** Left edge of the notehead or rest glyph, px. */
  x: number;
  /** Centre of the notehead or rest, px: where the count and the mark are centred. */
  cx: number;
  /** X of the stem, px (notes shorter than a whole note only). */
  stemX: number | null;
  /** Index of this note among the onsets of the rhythm, or null for rests and tied-to notes. */
  onset: number | null;
  /** Flags to draw on the stem: 0 when beamed or unflagged. */
  flags: 0 | 1 | 2;
  count: Count;
}

/** A beam segment. `level` 1 is the eighth beam, 2 the sixteenth beam below it. */
export interface PlacedBeam {
  x1: number;
  x2: number;
  level: 1 | 2;
}

/** A tie from one note to the next (possibly continuing on the next line). */
export interface PlacedTie {
  x1: number;
  x2: number;
}

/** A triplet bracket with its number. */
export interface PlacedTuplet {
  x1: number;
  x2: number;
  /** Beamed groups get the number alone; others get a bracket. */
  bracket: boolean;
}

/** A count that passes while a note is held: drawn fainter, in brackets. */
export interface HeldCount {
  x: number;
  text: string;
}

/** One line of notation. */
export interface PlacedSystem {
  /** Y of the staff line, px from the top of the drawing. */
  y: number;
  x0: number;
  x1: number;
  /** Bar lines, px (the line that closes each bar; the last of the rhythm is the final bar line). */
  barlines: Array<{ x: number; final: boolean }>;
  items: PlacedItem[];
  beams: PlacedBeam[];
  ties: PlacedTie[];
  tuplets: PlacedTuplet[];
  held: HeldCount[];
  /** Written tick to x, ascending: the playhead interpolates between these. */
  anchors: Array<{ tick: number; x: number }>;
  /** Time signature drawn at the start of this line. */
  timeSignature: { x: number; numerator: number; denominator: number } | null;
}

/** The whole drawing. */
export interface RhythmLayout {
  width: number;
  height: number;
  /** Pixels per staff space. */
  scale: number;
  systems: PlacedSystem[];
}

/** Room above the line (stems, beams, triplet numbers), below it (ties, counts, marks), in staff spaces. */
export const ABOVE = 5.9;
export const BELOW_PLAIN = 2.6;
export const BELOW_COUNTS = 4.6;
export const BELOW_MARKS = 2.2;
/** Length of a stem and the gap between beams, in staff spaces. */
export const STEM = 3.5;
export const BEAM_GAP = 0.75;
export const BEAM_THICKNESS = 0.5;
const NOTEHEAD = 1.18;
const BAR_PAD = 1.3;
const PREFIX = 3.6;
const MARGIN = 0.4;

/** Horizontal room a note or rest asks for, in staff spaces: grows with the logarithm of its length. */
export function naturalWidth(ticks: number): number {
  return 2.25 + 1.5 * Math.log2(Math.max(240, ticks) / 240);
}

function barNatural(items: readonly RhythmItem[]): number {
  return BAR_PAD * 2 + items.reduce((sum, i) => sum + naturalWidth(i.ticks), 0);
}

/** Layout options. */
export interface LayoutOptions {
  /** Available width in px. */
  width: number;
  /** Largest and smallest staff space in px (defaults 13 and 6). */
  maxScale?: number;
  minScale?: number;
  /** Below this scale the rhythm is broken over more lines instead of shrinking further (default 9.5). */
  breakScale?: number;
  counts?: boolean;
  marks?: boolean;
  /** Draw the time signature (default true). */
  timeSignature?: boolean;
  /** Height in px the drawing should stay within, when the screen is short. */
  maxHeight?: number;
}

/** Lay a rhythm out for a given width. */
export function layoutRhythm(rhythm: Rhythm, opts: LayoutOptions): RhythmLayout {
  const meter = meterInfo(rhythm.meter);
  const width = Math.max(120, opts.width);
  const maxScale = opts.maxScale ?? 13;
  const minScale = opts.minScale ?? 6;
  const breakScale = opts.breakScale ?? 9.5;
  const showTs = opts.timeSignature ?? true;
  const naturals = rhythm.bars.map((bar) => barNatural(bar.items));
  const n = rhythm.bars.length;

  const below0 = BELOW_PLAIN + (opts.counts ? BELOW_COUNTS - BELOW_PLAIN : 0) + (opts.marks ? BELOW_MARKS : 0);
  const lineSpaces = ABOVE + below0;

  // Split the bars over as few lines as keeps the notes at a readable size. More lines make the
  // notes bigger across, but each line costs height when the room is limited (a phone on its side).
  let perLine = n;
  let scale = 0;
  for (let lines = 1; lines <= n; lines++) {
    const per = Math.ceil(n / lines);
    let widest = 0;
    for (let start = 0; start < n; start += per) {
      const natural = naturals.slice(start, start + per).reduce((a, b) => a + b, 0) + MARGIN * 2 + (start === 0 && showTs ? PREFIX : 0);
      widest = Math.max(widest, natural);
    }
    let candidate = Math.min(maxScale, width / widest);
    if (opts.maxHeight) candidate = Math.min(candidate, opts.maxHeight / (Math.ceil(n / per) * lineSpaces));
    // Another line has to buy a clearly larger size to be worth the extra eye travel.
    if (candidate > scale * 1.08) {
      scale = candidate;
      perLine = per;
    }
    if (scale >= breakScale) break;
  }
  scale = Math.max(minScale, scale);

  const systemHeight = lineSpaces * scale;
  const systems: PlacedSystem[] = [];
  let onsetIndex = 0;
  let held = false; // the previous note is tied into the next one
  let openTie: { system: number; x: number } | null = null;

  for (let start = 0, line = 0; start < n; start += perLine, line++) {
    const bars = rhythm.bars.slice(start, start + perLine);
    const prefix = line === 0 && showTs ? PREFIX : 0;
    const natural = naturals.slice(start, start + perLine).reduce((a, b) => a + b, 0);
    // Stretch the notes to fill the line, but never so far that a bar looks empty.
    const stretch = Math.min(1.45, Math.max(1, (width / scale - MARGIN * 2 - prefix) / natural));
    const system: PlacedSystem = {
      y: line * systemHeight + ABOVE * scale,
      x0: 0,
      x1: 0,
      barlines: [],
      items: [],
      beams: [],
      ties: [],
      tuplets: [],
      held: [],
      anchors: [],
      timeSignature: prefix ? { x: MARGIN * scale, numerator: meter.ts.numerator, denominator: meter.ts.denominator } : null,
    };
    let x = (MARGIN + prefix) * scale;
    // A tie that started on the line above continues from the left edge.
    if (openTie) openTie = { system: line, x: x - 0.2 * scale };

    bars.forEach((bar, b) => {
      const barIndex = start + b;
      const barStartTick = barIndex * meter.barTicks;
      system.anchors.push({ tick: barStartTick, x: x + BAR_PAD * scale * 0.4 });
      let cursor = x + BAR_PAD * scale * stretch;
      const placed: PlacedItem[] = [];
      const soloRest = bar.items.length === 1 && bar.items[0].rest;
      bar.items.forEach((item, index) => {
        const w = naturalWidth(item.ticks) * scale * stretch;
        const glyphW = (item.rest ? 1.1 : item.value === 'w' ? 1.69 : NOTEHEAD) * scale;
        // A rest that fills the bar sits in the middle of it, as engravers place it.
        const left = soloRest ? x + (naturals[barIndex] * scale * stretch - glyphW) / 2 : cursor;
        const isOnset = !item.rest && !held;
        const p: PlacedItem = {
          bar: barIndex,
          index,
          item,
          x: left,
          cx: left + glyphW / 2,
          stemX: !item.rest && item.value !== 'w' ? left + glyphW - scale * 0.06 : null,
          onset: isOnset ? onsetIndex++ : null,
          flags: 0,
          count: countAt(item.tick, meter),
        };
        placed.push(p);
        system.anchors.push({ tick: barStartTick + item.tick, x: p.cx });
        if (!item.rest) {
          if (openTie && held) {
            if (openTie.system === line) system.ties.push({ x1: openTie.x, x2: p.cx - glyphW * 0.3 });
            openTie = null;
          }
          if (item.tie) openTie = { system: line, x: p.cx + glyphW * 0.3 };
          held = item.tie;
          for (const h of heldBeats(item.tick, item.ticks, meter)) {
            system.held.push({ x: p.cx + ((h.tick - item.tick) / item.ticks) * w, text: h.text });
          }
        } else {
          held = false;
        }
        cursor += w;
      });

      const groups = beamGroupsOfBar(bar, meter);
      const beamed = new Set(groups.flat());
      for (const p of placed) {
        if (isFlagged(p.item) && !beamed.has(p.index)) p.flags = p.item.value === 's' ? 2 : 1;
      }
      for (const group of groups) {
        const first = placed[group[0]];
        const last = placed[group[group.length - 1]];
        system.beams.push({ x1: first.stemX!, x2: last.stemX!, level: 1 });
        const stub = 0.95 * scale;
        secondaryBeams(bar, group).forEach((kind, k) => {
          const sx = placed[group[k]].stemX!;
          if (kind === 'full-right') system.beams.push({ x1: sx, x2: placed[group[k + 1]].stemX!, level: 2 });
          else if (kind === 'stub-left') system.beams.push({ x1: sx - stub, x2: sx, level: 2 });
          else if (kind === 'stub-right') system.beams.push({ x1: sx, x2: sx + stub, level: 2 });
        });
      }
      for (const group of tupletGroups(bar)) {
        const first = placed[group[0]];
        const last = placed[group[group.length - 1]];
        const allBeamed = group.every((i) => beamed.has(i));
        system.tuplets.push({ x1: first.stemX ?? first.x, x2: last.stemX ?? last.x + scale, bracket: !allBeamed });
      }
      system.items.push(...placed);
      x += naturals[barIndex] * scale * stretch;
      system.barlines.push({ x, final: barIndex === n - 1 });
      system.anchors.push({ tick: barStartTick + meter.barTicks, x: x - BAR_PAD * scale * 0.4 });
    });

    // A tie still open at the end of the line runs to the right edge and resumes below.
    if (openTie && openTie.system === line) system.ties.push({ x1: openTie.x, x2: x - 0.3 * scale });
    system.x0 = MARGIN * scale * 0.5;
    system.x1 = x;
    systems.push(system);
  }

  return { width, height: systems.length * systemHeight, scale, systems };
}

/** Where a written tick falls: which line, and the x on it. Ticks outside the rhythm clamp to its ends. */
export function xAtTick(layout: RhythmLayout, tick: number): { system: number; x: number } {
  const systems = layout.systems;
  for (let s = 0; s < systems.length; s++) {
    const a = systems[s].anchors;
    if (!a.length) continue;
    const lastOfAll = s === systems.length - 1;
    if (tick < a[0].tick) return { system: s, x: a[0].x };
    if (tick <= a[a.length - 1].tick || lastOfAll) {
      for (let i = 1; i < a.length; i++) {
        if (tick <= a[i].tick) {
          const span = a[i].tick - a[i - 1].tick;
          const f = span > 0 ? (tick - a[i - 1].tick) / span : 0;
          return { system: s, x: a[i - 1].x + (a[i].x - a[i - 1].x) * f };
        }
      }
      return { system: s, x: a[a.length - 1].x };
    }
  }
  return { system: 0, x: 0 };
}

/** Undo swing on a played tick, so a playhead that moves with the sound crosses each written note as it is heard. */
export function unswing(playTick: number): number {
  const beat = Math.floor(playTick / 960);
  const within = playTick - beat * 960;
  return beat * 960 + (within < 640 ? within * 0.75 : 480 + (within - 640) * 1.5);
}
