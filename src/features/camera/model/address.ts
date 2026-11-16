/**
 * What the live fretboard shows on the neck, and its route params (slug-safe, shareable):
 *
 *   #camera                                       the last thing shown (A minor pentatonic, box 1 at first)
 *   #camera--scale--a--minor-pentatonic--box-1    a scale and one of its shapes (`all` = every note)
 *   #camera--chord--g-major--2                    a chord and its second voicing (1-based)
 *   #camera--song--hot-cross-buns                 a song from the library
 *   #camera--note--c--5                           the find-the-note drill (a note; a string, optional)
 *
 * Scale and chord ids are the theory engine's (`getScale` ids, `chordSlug`), shapes are the guitar
 * engine's pattern ids (`box-1`, `caged-e`, `3nps-2` ...), the same as `#scales` and `#chords` use.
 */
import { chordFromSlug, chordSlug, getScale, noteFromSlug, noteSlug, parseChord, parseNote, parseScaleSlug } from '@/core/theory';

/** The four things the overlay can show. */
export type ContentKind = 'scale' | 'chord' | 'song' | 'note';

/** A scale and one shape of it (`all` = every note of the scale on the neck). */
export interface ScaleContent {
  kind: 'scale';
  tonic: string;
  scale: string;
  shape: string;
}

/** A chord and which of its voicings (0-based index into `chordVoicings`). */
export interface ChordContent {
  kind: 'chord';
  symbol: string;
  voicing: number;
}

/** A song from the library (null = none picked yet: the first built-in song). */
export interface SongContent {
  kind: 'song';
  id: string | null;
}

/** The find-the-note drill: a note name to find (null = a random one) and a string (null = any). */
export interface NoteContent {
  kind: 'note';
  note: string | null;
  string: number | null;
}

/** Everything the overlay can show. */
export type CameraContent = ScaleContent | ChordContent | SongContent | NoteContent;

/** What the screen opens on the first visit: the scale most guitarists learn first. */
export const DEFAULT_CONTENT: ScaleContent = { kind: 'scale', tonic: 'A', scale: 'minor-pentatonic', shape: 'box-1' };

/** Defaults per kind, used when the learner switches between them. */
export const DEFAULTS: { scale: ScaleContent; chord: ChordContent; song: SongContent; note: NoteContent } = {
  scale: DEFAULT_CONTENT,
  chord: { kind: 'chord', symbol: 'G', voicing: 0 },
  song: { kind: 'song', id: null },
  note: { kind: 'note', note: null, string: null },
};

const SHAPE_ID = /^(?:all|caged-[cagde]|box-\d+|3nps-\d+|position-\d+|string-\d+|strings-\d+-\d+|diagonal-\d+)$/;
const SONG_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True for a param that names a shape. */
export function isShapeParam(param: string): boolean {
  return SHAPE_ID.test(param);
}

function parseScale(rest: readonly string[]): ScaleContent | null {
  const [first, second, third] = rest;
  if (!first) return null;
  if (second !== undefined) {
    const tonic = noteFromSlug(first);
    const scale = getScale(second);
    if (tonic && scale && scale.id === second) return { kind: 'scale', tonic, scale: scale.id, shape: third && isShapeParam(third) ? third : 'all' };
  }
  const joined = parseScaleSlug(first);
  if (joined) return { kind: 'scale', tonic: joined.tonic, scale: joined.scale.id, shape: second && isShapeParam(second) ? second : 'all' };
  return null;
}

function parseChordParam(rest: readonly string[]): ChordContent | null {
  const [first, second] = rest;
  if (!first) return null;
  const chord = chordFromSlug(first);
  if (!chord) return null;
  const n = second !== undefined && /^\d+$/.test(second) ? Number(second) : 1;
  return { kind: 'chord', symbol: chord.symbol, voicing: Math.max(0, Math.min(40, n - 1)) };
}

function parseNoteParams(rest: readonly string[]): NoteContent {
  const [first, second] = rest;
  const note = first ? noteFromSlug(first) : null;
  const s = second !== undefined && /^[1-7]$/.test(second) ? Number(second) : null;
  return { kind: 'note', note: note ?? null, string: s };
}

/** Read the route params; null when they name nothing (the screen then shows the last content). */
export function parseCameraParams(params: readonly string[]): CameraContent | null {
  const [kind, ...rest] = params;
  switch (kind) {
    case 'scale':
      return parseScale(rest);
    case 'chord':
      return parseChordParam(rest);
    case 'song':
      return { kind: 'song', id: rest[0] && SONG_ID.test(rest[0]) ? rest[0] : null };
    case 'note':
      return parseNoteParams(rest);
    default:
      return null;
  }
}

/** The canonical params for some content. */
export function cameraParams(content: CameraContent): string[] {
  switch (content.kind) {
    case 'scale':
      return ['scale', noteSlug(content.tonic), content.scale, content.shape];
    case 'chord': {
      const out = ['chord', chordSlug(content.symbol)];
      if (content.voicing > 0) out.push(String(content.voicing + 1));
      return out;
    }
    case 'song':
      return content.id ? ['song', content.id] : ['song'];
    case 'note': {
      const out = ['note'];
      if (content.note) out.push(noteSlug(content.note));
      if (content.note && content.string) out.push(String(content.string));
      return out;
    }
  }
}

/** Stored content from an earlier visit, checked (storage may hold anything). */
export function sanitizeContent(value: unknown): CameraContent {
  if (!value || typeof value !== 'object') return DEFAULT_CONTENT;
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case 'scale': {
      const scale = typeof v.scale === 'string' ? getScale(v.scale) : null;
      const tonic = typeof v.tonic === 'string' && parseNote(v.tonic)?.octave === null ? parseNote(v.tonic)!.name : null;
      if (!scale || !tonic) return DEFAULT_CONTENT;
      return { kind: 'scale', tonic, scale: scale.id, shape: typeof v.shape === 'string' && isShapeParam(v.shape) ? v.shape : 'all' };
    }
    case 'chord': {
      const chord = typeof v.symbol === 'string' ? parseChord(v.symbol) : null;
      if (!chord) return DEFAULTS.chord;
      const n = typeof v.voicing === 'number' && Number.isInteger(v.voicing) ? Math.max(0, Math.min(40, v.voicing)) : 0;
      return { kind: 'chord', symbol: chord.symbol, voicing: n };
    }
    case 'song':
      return { kind: 'song', id: typeof v.id === 'string' && SONG_ID.test(v.id) ? v.id : null };
    case 'note': {
      const parsed = typeof v.note === 'string' ? parseNote(v.note) : null;
      const note = parsed && parsed.octave === null ? parsed.name : null;
      const s = typeof v.string === 'number' && Number.isInteger(v.string) && v.string >= 1 && v.string <= 7 ? v.string : null;
      return { kind: 'note', note: note ?? null, string: s };
    }
    default:
      return DEFAULT_CONTENT;
  }
}
