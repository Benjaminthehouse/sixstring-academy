/**
 * A vision model as second reader of a tab staff. It is asked only when the picture left the
 * reader in doubt (a staff that reads poorly, or single numbers below 0.5), it sees the staff
 * band alone, and its answer never overrides a number the picture shows clearly:
 *
 * - it agrees with a doubtful reading: the confidence rises ('merged');
 * - it names another fret that was among the reader's own alternatives for a guess: that fret is
 *   taken, at moderate confidence, and the old reading stays as an alternative ('merged');
 * - it names something else: its fret is offered as the first alternative, nothing changes;
 * - it sees numbers the reader did not find: on a poorly read staff they are added as guesses
 *   ('ai'); on a well read staff they are ignored.
 *
 * The app works the same without a model: every path here is optional.
 */
import { type GrayImage, cropGray } from '../image/gray';
import { type OmrTabEvent, type OmrTabNote, type OmrVisionModel, type StaffInput, STANDARD_TUNING, midiAtFret } from '../types';
import { MAX_FRET } from './numbers';

/** One column as the model reports it. */
export interface VisionColumn {
  /** Horizontal position as a fraction (0..1) of the picture's width. */
  x: number;
  notes: { string: number; fret: number }[];
}

/** The question put to the model. `{lines}` is replaced by the number of strings. */
export const TAB_VISION_PROMPT = [
  'This picture shows one staff of guitar tablature: {lines} horizontal lines, each line is a string, the top line is string 1.',
  'Fret numbers (0 to 24) are printed on the lines. Numbers printed one above another are played together and form one column.',
  'List every column from left to right. Ignore the letters TAB, bar lines, stems, beams, rests and any text above or below the staff.',
  'Answer with JSON only, in exactly this shape:',
  '{"columns":[{"x":0.12,"notes":[{"string":1,"fret":0},{"string":2,"fret":1}]}]}',
  'where x is the horizontal position of the column as a fraction of the picture width (0 = left edge, 1 = right edge).',
  'If a number is unreadable, leave it out rather than guess.',
].join('\n');

/** Check and clean the model's answer; null when it is not in the agreed shape. */
export function parseVisionColumns(value: unknown, lineCount: number): VisionColumn[] | null {
  if (!value || typeof value !== 'object') return null;
  const cols = (value as { columns?: unknown }).columns;
  if (!Array.isArray(cols)) return null;
  const out: VisionColumn[] = [];
  for (const c of cols) {
    if (!c || typeof c !== 'object') continue;
    const x = Number((c as { x?: unknown }).x);
    const notes = (c as { notes?: unknown }).notes;
    if (!Number.isFinite(x) || x < 0 || x > 1 || !Array.isArray(notes)) continue;
    const clean: { string: number; fret: number }[] = [];
    for (const n of notes) {
      if (!n || typeof n !== 'object') continue;
      const string = Number((n as { string?: unknown }).string);
      const fret = Number((n as { fret?: unknown }).fret);
      if (!Number.isInteger(string) || !Number.isInteger(fret) || string < 1 || string > lineCount || fret < 0 || fret > MAX_FRET) continue;
      if (clean.some((q) => q.string === string)) continue;
      clean.push({ string, fret });
    }
    if (clean.length) out.push({ x, notes: clean });
  }
  return out.sort((a, b) => a.x - b.x);
}

/** True when a second opinion could change something: the staff reads poorly or holds guesses. */
export function needsSecondOpinion(events: OmrTabEvent[], reliability: number): boolean {
  if (reliability < 0.75 && events.length) return true;
  return events.some((e) => e.kind === 'tab' && e.notes.some((n) => n.confidence < 0.5));
}

/**
 * Merge the model's columns into the reader's events (see the file comment for the rules).
 * `stripX[i]` is the strip x of `events[i]`; `band` maps the model's picture back to the strip.
 * Returns the number of notes changed or added.
 */
export function mergeVision(
  input: Pick<StaffInput, 'space' | 'lineYs' | 'toPage' | 'toPageBox'>,
  events: OmrTabEvent[],
  stripX: number[],
  vision: VisionColumn[],
  band: { x0: number; width: number },
  reliability: number,
  tuning: readonly number[] = STANDARD_TUNING,
): number {
  const sp = input.space;
  let changed = 0;
  const midi = (string: number, fret: number): number => midiAtFret(Math.min(string, tuning.length), fret, tuning);
  const added: { event: OmrTabEvent; x: number }[] = [];
  for (const v of vision) {
    const x = band.x0 + v.x * band.width;
    let hit = -1;
    events.forEach((e, i) => {
      if (e.kind !== 'tab') return;
      if (Math.abs(stripX[i] - x) <= 1.3 * sp && (hit < 0 || Math.abs(stripX[i] - x) < Math.abs(stripX[hit] - x))) hit = i;
    });
    if (hit < 0) {
      // Numbers the reader did not find at all: worth showing only where the reader is struggling.
      if (reliability >= 0.6) continue;
      const notes: OmrTabNote[] = v.notes.map((q) => ({
        id: '', bbox: input.toPageBox(x - 0.35 * sp, input.lineYs[q.string - 1] - 0.45 * sp, 0.7 * sp, 0.9 * sp), confidence: 0.3, source: 'ai' as const,
        string: q.string, fret: q.fret, midi: midi(q.string, q.fret),
      })).sort((a, b) => a.string - b.string);
      const ys = v.notes.map((q) => input.lineYs[q.string - 1]);
      const y0 = Math.min(...ys) - 0.45 * sp;
      const y1 = Math.max(...ys) + 0.45 * sp;
      added.push({
        x,
        event: { id: '', bbox: input.toPageBox(x - 0.35 * sp, y0, 0.7 * sp, y1 - y0), confidence: 0.3, source: 'ai', kind: 'tab', x: input.toPage(x, (y0 + y1) / 2).x, notes },
      });
      changed += notes.length;
      continue;
    }
    const e = events[hit];
    for (const q of v.notes) {
      const n = e.notes.find((o) => o.string === q.string);
      if (!n) {
        if (reliability >= 0.6) continue;
        e.notes.push({ id: '', bbox: input.toPageBox(stripX[hit] - 0.35 * sp, input.lineYs[q.string - 1] - 0.45 * sp, 0.7 * sp, 0.9 * sp), confidence: 0.3, source: 'ai', string: q.string, fret: q.fret, midi: midi(q.string, q.fret) });
        e.notes.sort((a, b) => a.string - b.string);
        changed++;
        continue;
      }
      if (n.technique?.includes('x')) continue; // a dead note has no fret to argue about
      if (n.fret === q.fret) {
        if (n.confidence < 0.9) {
          n.confidence = Math.min(0.9, n.confidence + 0.25);
          n.source = 'merged';
          changed++;
        }
        continue;
      }
      const alts = n.alternatives ?? [];
      const own = alts.find((a) => a.value === q.fret);
      if (n.confidence < 0.5 && own) {
        // Two doubtful readings of the picture, and the model sides with the second.
        n.alternatives = [{ value: n.fret, confidence: Math.min(0.4, n.confidence) }, ...alts.filter((a) => a !== own)];
        n.confidence = Math.max(0.5, Math.min(0.6, own.confidence + 0.3));
        n.fret = q.fret;
        n.midi = midi(n.string, n.fret);
        n.source = 'merged';
        changed++;
      } else if (!own) {
        n.alternatives = n.confidence < 0.5 ? [{ value: q.fret, confidence: 0.3 }, ...alts] : [...alts, { value: q.fret, confidence: 0.15 }];
      }
    }
    e.confidence = Math.min(...e.notes.map((n) => n.confidence));
  }
  for (const a of added) {
    events.push(a.event);
    stripX.push(a.x);
  }
  if (added.length) {
    const order = events.map((_, i) => i).sort((i, j) => stripX[i] - stripX[j]);
    const ev = order.map((i) => events[i]);
    const xs = order.map((i) => stripX[i]);
    events.splice(0, events.length, ...ev);
    stripX.splice(0, stripX.length, ...xs);
  }
  return changed;
}

/** The part of the strip the model is shown: the staff with a little room above and below. */
export function staffBand(input: Pick<StaffInput, 'gray' | 'space' | 'lineYs'>): { gray: GrayImage; x0: number; width: number } {
  const y0 = Math.max(0, Math.round(input.lineYs[0] - 1.3 * input.space));
  const y1 = Math.min(input.gray.height, Math.round(input.lineYs[input.lineYs.length - 1] + 1.3 * input.space));
  return { gray: cropGray(input.gray, 0, y0, input.gray.width, y1 - y0), x0: 0, width: input.gray.width };
}

/**
 * Ask the model about a staff and merge its answer into the events. Any failure (no answer, an
 * answer in another shape, an abort) leaves the events as they are; `false` is returned then.
 */
export async function askSecondOpinion(
  input: StaffInput,
  events: OmrTabEvent[],
  stripX: number[],
  reliability: number,
  ai: OmrVisionModel,
  signal?: AbortSignal,
  tuning: readonly number[] = STANDARD_TUNING,
): Promise<boolean> {
  const band = staffBand(input);
  let answer: unknown;
  try {
    answer = await ai.ask({ gray: band.gray }, TAB_VISION_PROMPT.replace('{lines}', String(input.lineCount)), signal);
  } catch {
    return false;
  }
  if (signal?.aborted) return false;
  const vision = parseVisionColumns(answer, input.lineCount);
  if (!vision) return false;
  mergeVision(input, events, stripX, vision, band, reliability, tuning);
  return true;
}
