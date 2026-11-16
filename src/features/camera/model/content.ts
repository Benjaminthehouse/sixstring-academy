/**
 * The notes the overlay puts on the neck, from what the learner picked: a scale shape, a chord
 * voicing, or the find-the-note drill (songs: `song.ts`). Every note is derived from the guitar
 * and theory engines, never typed. Frets count from the capo (as tab and the guitar engine do);
 * `toOverlay` moves them onto the wood for the camera, the drawn neck takes the capo itself.
 */
import { chordVoicings, degreeNumber, patternSystemsFor, scalePatterns, scalePositions, type PatternSystem, type ScalePattern, type Tuning, type Voicing } from '@/core/guitar';
import { CHORD_TYPES, formatChord, formatDegree, formatNote, getScale, parseChord, pcName } from '@/core/theory';
import type { OverlayNote } from '@/core/vision';
import type { FretMarker } from '@/ui/music';
import type { ChordContent, ScaleContent } from './address';

/** What the text inside a dot says. */
export type LabelMode = 'degree' | 'note' | 'finger';

/** Note naming systems the overlay can write (the learner's setting). */
export type Naming = 'letters' | 'solfege' | 'german';

/** One note to show, frets counted from the capo. */
export interface ShowNote {
  string: number;
  fret: number;
  /** Sounding pitch (tuning + capo + fret). */
  midi: number;
  /** Spelled pitch class, ASCII (`F#`). */
  note: string;
  /** Scale degree or chord tone label (`1`, `b3`, `5`), or '' when there is none. */
  degree: string;
  /** Finger 0-4 when the shape says (0 = open string). */
  finger?: number;
  root: boolean;
  /** Play this now: drawn with a pulse. */
  target?: boolean;
  /** Coming next, or a hint: drawn as an outline. */
  ghost?: boolean;
}

/** How a neck is set up: the tuning and a capo (0 = none). */
export interface NeckSetup {
  tuning: Tuning;
  capo: number;
}

/** The highest fret the camera shows notes on (frets from the capo). */
export const MAX_FRET = 15;

/** The text inside a dot. Degrees use the theory module's glyphs, the root reads "R". */
export function noteLabel(n: Pick<ShowNote, 'degree' | 'note' | 'finger' | 'root'>, mode: LabelMode, naming: Naming = 'letters'): string {
  if (mode === 'finger' && n.finger !== undefined) return n.finger > 0 ? String(n.finger) : '';
  if (mode === 'note' || !n.degree) return formatNote(pcName(n.note), { system: naming });
  return n.degree === '1' ? 'R' : formatDegree(n.degree);
}

/** One option in the shape picker. */
export interface ShapeOption {
  id: string;
  /** "Box 1", "E shape", "Every note". */
  name: string;
  /** "5th position", "frets 0-15". */
  where: string;
}

/** The pattern system a shape id belongs to (`3nps-4` -> '3nps'); null for `all` or an id of no system. */
export function shapeSystem(shape: string | null | undefined): PatternSystem | null {
  if (!shape) return null;
  if (shape.startsWith('caged-')) return 'caged';
  if (shape.startsWith('box-')) return 'box';
  if (shape.startsWith('3nps-')) return '3nps';
  if (shape.startsWith('position-')) return 'position';
  if (shape.startsWith('strings-')) return 'two-string';
  if (shape.startsWith('string-')) return 'single-string';
  if (shape.startsWith('diagonal-')) return 'diagonal';
  return null;
}

/** Systems laid out as one climb up the neck, as `#scales`, the Arcade and the lessons show them (box 4 of A minor pentatonic at the 12th fret, not in open position). */
const CLIMBING: ReadonlySet<PatternSystem> = new Set(['box', '3nps', 'position', 'diagonal']);

/**
 * The patterns the camera offers for a scale: those of the system the shape asked for belongs to
 * (a link from `#scales` with `3nps-4` shows the three-notes-per-string shapes), else the engine's
 * usual system for the scale; climbing systems laid out up the neck like `#scales` lays them out,
 * so a shape sits where the learner just saw it (when it fits below `MAX_FRET`). Before, only the
 * usual system was built, so any other shape quietly became the first shape of the usual system
 * (C major `3nps-4` showed the C shape), and boxes 4 and 5 sat an octave below where `#scales` drew them.
 */
export function scalePatternsFor(c: Pick<ScaleContent, 'tonic' | 'scale'> & { shape?: string }, setup: NeckSetup): ScalePattern[] {
  const build = (system: PatternSystem): ScalePattern[] =>
    scalePatterns(c.tonic, c.scale, { tuning: setup.tuning, capo: setup.capo, maxFret: MAX_FRET, system, upTheNeck: CLIMBING.has(system) });
  const asked = shapeSystem(c.shape);
  if (asked) {
    try {
      const own = build(asked);
      if (own.some((p) => p.id === c.shape)) return own;
    } catch {
      // Not a system this scale has: the usual one below.
    }
  }
  try {
    return build(patternSystemsFor(c.scale, setup.tuning)[0]);
  } catch {
    return [];
  }
}

/** The shapes to pick from: every pattern, then "every note". */
export function shapeOptions(patterns: readonly ScalePattern[]): ShapeOption[] {
  return [...patterns.map((p) => ({ id: p.id, name: p.name, where: p.positionName })), { id: 'all', name: 'Every note', where: `frets 0–12` }];
}

/** A scale shape as notes. Unknown shapes fall back to the first pattern. */
export function scaleNotes(c: ScaleContent, setup: NeckSetup): { notes: ShowNote[]; shape: ShapeOption; options: ShapeOption[] } {
  const patterns = scalePatternsFor(c, setup);
  const options = shapeOptions(patterns);
  if (c.shape === 'all' || patterns.length === 0) {
    let tones: ReturnType<typeof scalePositions> = [];
    try {
      tones = scalePositions(c.tonic, c.scale, { tuning: setup.tuning, capo: setup.capo, minFret: 0, maxFret: 12 });
    } catch {
      tones = [];
    }
    const notes = tones.map((t) => ({ string: t.string, fret: t.fret, midi: t.midi, note: t.note, degree: t.degree, root: t.isRoot }));
    return { notes, shape: options[options.length - 1], options };
  }
  const pattern = patterns.find((p) => p.id === c.shape) ?? patterns[0];
  const notes = pattern.notes.map((t) => ({ string: t.string, fret: t.fret, midi: t.midi, note: t.note, degree: t.degree, finger: t.finger, root: t.isRoot }));
  return { notes, shape: { id: pattern.id, name: pattern.name, where: pattern.positionName }, options };
}

/** "A minor pentatonic" in the learner's naming. */
export function scaleTitle(c: Pick<ScaleContent, 'tonic' | 'scale'>, naming: Naming = 'letters'): string {
  const name = getScale(c.scale)?.name ?? c.scale;
  return `${formatNote(c.tonic, { system: naming })} ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

/** The voicings the camera offers for a chord (the engine's ranking: the one everybody means first). */
export function chordVoicingsFor(symbol: string, setup: NeckSetup): Voicing[] {
  try {
    return chordVoicings(symbol, { tuning: setup.tuning, capo: setup.capo, maxFret: MAX_FRET });
  } catch {
    return [];
  }
}

/** A chord voicing as notes, plus the strings it does not play. */
export function chordNotes(c: ChordContent, setup: NeckSetup): { notes: ShowNote[]; voicing: Voicing | null; count: number; muted: number[] } {
  const voicings = chordVoicingsFor(c.symbol, setup);
  const voicing = voicings[Math.min(Math.max(0, c.voicing), voicings.length - 1)] ?? null;
  if (!voicing) return { notes: [], voicing: null, count: 0, muted: [] };
  const notes = voicing.notes.map((n) => ({
    string: n.string,
    fret: n.fret,
    midi: n.midi,
    note: n.note,
    degree: n.degree,
    finger: n.finger ?? undefined,
    root: n.isRoot,
  }));
  const strings = voicing.frets.length;
  const muted = voicing.frets.flatMap((f, i) => (f === null ? [strings - i] : []));
  return { notes, voicing, count: voicings.length, muted };
}

/** "G major", "Am7" for a heading: the theory formatter's display symbol. */
export function chordTitle(symbol: string, naming: Naming = 'letters'): string {
  const shown = formatChord(symbol, { system: naming });
  const chord = parseChord(symbol);
  return chord && chord.type.id === 'major' && !chord.bass ? `${shown} major` : shown;
}

/** Overlay notes for the camera: frets moved onto the wood (fret + capo), labels written, colours by degree. */
export function toOverlay(notes: readonly ShowNote[], capo: number, mode: LabelMode, naming: Naming = 'letters'): OverlayNote[] {
  return notes.map((n) => ({
    string: n.string,
    fret: n.fret + capo,
    label: noteLabel(n, mode, naming),
    // A note to play now without a degree (the drill, a song in no key) takes the strongest colour.
    degree: n.degree ? degreeNumber(n.degree) : n.target ? 1 : 0,
    target: n.target,
    // An open string behind a capo is played from the capo: an outline, like an open string at the nut.
    ghost: n.ghost || (capo > 0 && n.fret === 0),
  }));
}

/** Markers for the drawn neck (`<Fretboard capo>` counts frets from the capo itself). */
export function toFretMarkers(notes: readonly ShowNote[], mode: LabelMode, naming: Naming = 'letters'): FretMarker[] {
  return notes.map((n) => {
    const d = n.degree ? degreeNumber(n.degree) : n.target ? 1 : 0;
    const marker: FretMarker = {
      id: `${n.string}:${n.fret}:${n.ghost ? 'g' : n.target ? 't' : 'n'}`,
      string: n.string,
      fret: n.fret,
      color: d ? (`deg-${d}` as FretMarker['color']) : 'neutral',
      root: n.root && !n.ghost,
      note: n.note,
      state: n.target ? 'target' : n.ghost ? 'ghost' : 'normal',
      description: n.degree ? (n.degree === '1' ? 'root' : `degree ${n.degree}`) : undefined,
    };
    if (mode === 'note' || (!n.degree && mode !== 'finger')) {
      marker.noteLabel = true;
      marker.label = n.note;
    } else {
      marker.label = noteLabel(n, mode, naming);
    }
    return marker;
  });
}

/** The frets (on the wood) a drawn neck needs to show these notes: a little room either side, at least five frets. */
export function boardRange(notes: readonly ShowNote[], capo: number): [number, number] {
  const frets = notes.map((n) => n.fret + capo);
  if (frets.length === 0) return [0, 12];
  let lo = Math.min(...frets);
  let hi = Math.max(...frets);
  lo = lo <= 1 ? 0 : lo - 1;
  hi = Math.min(24, hi + 1);
  if (hi - lo < 5) hi = Math.min(24, lo + 5);
  if (capo > 0) lo = Math.min(lo, Math.max(0, capo - 1));
  return [lo, Math.max(hi, lo + 5)];
}

/** The note(s) a heard pitch matches: exact pitch, targets first. */
export function matchHeard(notes: readonly ShowNote[], midi: number): ShowNote[] {
  const hits = notes.filter((n) => n.midi === midi && !n.ghost);
  return hits.sort((a, b) => Number(!!b.target) - Number(!!a.target));
}

/** Split a chord symbol into its root and the catalog type id ('Am7' -> A, m7; a slash bass is dropped). */
export function splitChord(symbol: string): { root: string; type: string } {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(symbol);
  const root = m?.[1] ?? 'C';
  const suffix = (m?.[2] ?? '').split('/')[0];
  const type = CHORD_TYPES.find((t) => t.symbol === suffix)?.id ?? parseChord(`${root}${suffix}`)?.type.id ?? 'major';
  return { root, type };
}

/** The chord symbol for a root and a catalog type id ('A', 'm7' -> 'Am7'). */
export function joinChord(root: string, type: string): string {
  const t = CHORD_TYPES.find((x) => x.id === type);
  return `${root}${t ? t.symbol : ''}`;
}
