/**
 * The fretboard under the score: which frets to show for a part (enough to hold every note it
 * plays, starting at the nut when the part lives near it), and the markers for the notes to play
 * now (lit) and the ones coming next (dimmed), in the part's tuning and capo. Pure: unit-tested.
 */
import { noteAt } from '@/core/guitar';
import type { PracticeTarget, TimelineBeat } from '@/core/song';
import { formatChord, formatNote, spellInKey } from '@/core/theory';
import type { FretMarker } from '@/ui/music/fretboard/markers';

/** A place on the neck (fret counted from the capo). */
export interface NeckSpot {
  string: number;
  fret: number;
  /** Left-hand finger written in the score (1–4, 0 open, 'T' thumb). */
  finger?: number | 'T';
}

/** The frets to show for a part: [first, last] on the wood. */
export function neckRange(spots: Iterable<{ fret: number }>, opts: { maxFret?: number; minSpan?: number } = {}): [number, number] {
  const maxFret = Math.max(5, Math.min(24, opts.maxFret ?? 15));
  const minSpan = Math.max(3, opts.minSpan ?? 5);
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of spots) {
    if (!Number.isFinite(s.fret) || s.fret < 0) continue;
    lo = Math.min(lo, s.fret);
    hi = Math.max(hi, s.fret);
  }
  if (!Number.isFinite(lo)) return [0, Math.min(maxFret, 5)];
  // A part that reaches down near the nut shows it (open strings and the first frets read best there).
  let first = lo <= 4 ? 0 : lo - 1;
  let last = Math.max(hi + 1, first + minSpan);
  if (last > maxFret) {
    last = Math.max(hi, maxFret);
    first = Math.min(first, Math.max(0, last - Math.max(minSpan, hi - lo + 2)));
  }
  return [first, Math.min(24, last)];
}

/** The struck notes of a beat as spots (ties and dead notes left out). */
export function beatSpots(beat: Pick<TimelineBeat, 'notes'> | null | undefined): NeckSpot[] {
  if (!beat) return [];
  return beat.notes
    .filter((n) => !n.tie && !n.dead)
    .map((n) => ({ string: n.string, fret: n.fret, ...(n.finger !== undefined ? { finger: n.finger } : {}) }));
}

/** The spots of a practice target (for a strum: the chord shape). */
export function targetSpots(t: Pick<PracticeTarget, 'positions' | 'beat'> | null | undefined): NeckSpot[] {
  if (!t) return [];
  const fingers = new Map<string, number | 'T'>();
  for (const n of t.beat.notes) if (n.finger !== undefined) fingers.set(`${n.string}:${n.fret}`, n.finger);
  return t.positions.map((p) => {
    const f = fingers.get(`${p.string}:${p.fret}`);
    return { string: p.string, fret: p.fret, ...(f !== undefined ? { finger: f } : {}) };
  });
}

/** How the markers are labelled. */
export interface NeckLabelOptions {
  tuning: readonly number[];
  capo: number;
  /** The song's key, for spelling (`G`, `A minor`). */
  key?: string;
}

function spell(spot: NeckSpot, o: NeckLabelOptions): string | undefined {
  try {
    return noteAt({ string: spot.string, fret: spot.fret }, { tuning: o.tuning, capo: o.capo, ...(o.key ? { context: { key: o.key } } : {}), octave: false });
  } catch {
    try {
      return noteAt({ string: spot.string, fret: spot.fret }, { tuning: o.tuning, capo: o.capo, octave: false });
    } catch {
      return undefined;
    }
  }
}

/**
 * Markers for now and next: the notes to play now lit (accent, pulsing, labelled with the note
 * name), the next ones dimmed. A spot in both is drawn once, as "now".
 */
export function neckMarkers(now: readonly NeckSpot[], next: readonly NeckSpot[], o: NeckLabelOptions, opts: { hint?: boolean } = {}): FretMarker[] {
  const out: FretMarker[] = [];
  const seen = new Set<string>();
  for (const s of now) {
    const key = `${s.string}:${s.fret}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const note = spell(s, o);
    const finger = s.finger !== undefined && s.finger !== 0 ? `finger ${s.finger === 'T' ? 'thumb' : s.finger}` : null;
    out.push({
      string: s.string,
      fret: s.fret,
      id: `now-${key}`,
      color: 'accent',
      state: 'target',
      ...(note ? { note, noteLabel: true, label: note } : {}),
      description: [opts.hint ? 'play this' : 'now', finger].filter(Boolean).join(', '),
    });
  }
  for (const s of next) {
    const key = `${s.string}:${s.fret}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const note = spell(s, o);
    out.push({ string: s.string, fret: s.fret, id: `next-${key}`, color: 'neutral', state: 'ghost', ...(note ? { note, noteLabel: true, label: note } : {}), description: 'next' });
  }
  return out;
}

/** A note or chord name for reading ("F♯", "B♭m7"): data spells in ASCII, the screen in glyphs. */
function shown(name: string, kind: 'note' | 'chord' = 'note'): string {
  try {
    return kind === 'chord' ? formatChord(name) : formatNote(name, { octave: false });
  } catch {
    return name.replace(/#/g, '♯').replace(/(?<=[A-G])b/g, '♭');
  }
}

/** A chord symbol as the screen shows it ("F♯m"). */
export function chordName(symbol: string): string {
  return shown(symbol, 'chord');
}

/** A spot's note name as the screen shows it ("F♯"), spelled for the song's key. */
export function spotName(spot: NeckSpot, o: NeckLabelOptions): string {
  const n = spell(spot, o);
  return n ? shown(n) : '';
}

/** The name of a heard pitch ("That sounded like B♭"), spelled for the song's key when it has one. */
export function heardName(midi: number, key?: string): string {
  if (!Number.isFinite(midi) || midi < 0) return 'that';
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  let name: string | null = null;
  if (key) {
    try {
      name = spellInKey(pc, key);
    } catch {
      name = null;
    }
  }
  return shown(name ?? ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][pc]);
}

/** Plain words for where to play a target: "B on string 3, fret 4 (finger 3)" or "the G chord". */
export function describeSpots(spots: readonly NeckSpot[], o: NeckLabelOptions, symbol?: string): string {
  if (symbol) return `the ${chordName(symbol)} chord`;
  if (!spots.length) return 'the next note';
  const parts = spots.map((s) => {
    const note = spotName(s, o);
    const where = s.fret === 0 ? `open string ${s.string}` : `string ${s.string}, fret ${s.fret}`;
    const finger = s.finger !== undefined && s.finger !== 0 ? ` (finger ${s.finger === 'T' ? 'thumb' : s.finger})` : '';
    return `${note ? `${note} on ` : ''}${where}${finger}`;
  });
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
