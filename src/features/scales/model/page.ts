/**
 * Everything the scale page says about one scale in one key, as plain data: name, formula,
 * spelled notes, intervals, mood, uses, the chords it fits, the chords built from it, its
 * relatives and the staff. Every fact comes from `@/core/theory`; this file only selects and
 * labels, so the page never types a note by hand.
 */
import {
  buildChord,
  chroma,
  compareScales,
  formatChord,
  formatDegree,
  formatNote,
  formatRoman,
  getScale,
  harmonizeScale,
  intervalName,
  noteSlug,
  parallelScales,
  prettyAccidentals,
  relativeScales,
  scaleModes,
  scaleNotes,
  scalesForChord,
  simplestTonic,
  type NoteNaming,
  type ScaleType,
} from '@/core/theory';
import { displayScaleName, primaryGroupOf, scaleTitle } from './catalog';

/** One step of the formula, between two neighbouring scale notes. */
export interface FormulaStep {
  /** The catalog's code: `W`, `H`, `WH` (a step and a half), `2W`. */
  code: string;
  /** Display text: `W`, `H`, `W+H`, `2W`. */
  text: string;
  semitones: number;
  /** In plain words, counted in frets: "whole step (2 frets)". */
  words: string;
}

/** One note of the scale with its job. */
export interface ScaleTone {
  /** ASCII spelling (`F#`). */
  note: string;
  /** In the reader's naming (`F♯`, `Fa♯`). */
  label: string;
  /** Degree label in data (`b3`) and for display (`♭3`). */
  degree: string;
  degreeText: string;
  /** Interval from the root (`m3`) and its name (`minor third`). */
  interval: string;
  intervalWords: string;
}

/** A chord the scale fits, measured by the theory engine's chord-scale matching. */
export interface FitChord {
  symbol: string;
  display: string;
  /** `primary`: the usual choice; `compatible`: contains the chord; `colour`: a deliberate clash; null: listed but not matched. */
  fit: 'primary' | 'compatible' | 'colour' | null;
  /** Where this scale ranks among every scale the engine suggests for the chord (1 = first choice). */
  rank: number | null;
  /** Scale notes to pass through rather than sit on over this chord. */
  avoid: string[];
}

/** A chord built on a degree of the scale (seven-note scales). */
export interface BuiltChord {
  roman: string;
  romanText: string;
  symbol: string;
  display: string;
}

/** A neighbouring scale one tap away. */
export interface RelatedScale {
  tonic: string;
  scale: string;
  /** `D Dorian` in the reader's naming. */
  title: string;
  /** Why it is related, in a few words. */
  detail: string;
}

/** The scale page's content. */
export interface ScalePageModel {
  tonic: string;
  scale: ScaleType;
  /** `A minor pentatonic`, `B♭ Lydian ♯2`. */
  title: string;
  /** The scale's name with pretty accidentals, without the root. */
  name: string;
  family: string;
  groupTitle: string;
  tones: ScaleTone[];
  steps: FormulaStep[];
  /** `W–W–H–W–W–W–H`. */
  stepsText: string;
  /** `1 2 ♭3 4 5 6 ♭7`. */
  degreesText: string;
  mood: string;
  uses: string;
  genres: string[];
  /** Other names the scale goes by (pretty accidentals). */
  aliases: string[];
  quality: string;
  tier: number;
  /** Mode number and parent, when the scale is a mode of another: "Mode 2 of Major". */
  modeOf: { mode: number; parent: string; parentName: string; parentTonic: string } | null;
  /** The same notes from another root (relative modes and scales). */
  relatives: RelatedScale[];
  /** Other scales on the same root, nearest first. */
  parallels: RelatedScale[];
  fitsChords: FitChord[];
  /** Triads and sevenths on each degree, for seven-note scales; null otherwise. */
  triads: BuiltChord[] | null;
  sevenths: BuiltChord[] | null;
  /** A simpler spelling of the same scale (`B♭ minor` for A♯ minor), when there is one. */
  simplerTonic: string | null;
  /** Comparisons worth making from here, as scale ids (same root): nearest relatives first. */
  compareWith: string[];
}

const STEP_WORDS: Record<number, string> = {
  1: 'half step (1 fret)',
  2: 'whole step (2 frets)',
  3: 'step and a half (3 frets)',
  4: 'two whole steps (4 frets)',
  5: 'two and a half steps (5 frets)',
};

const STEP_TEXT: Record<string, string> = { W: 'W', H: 'H', WH: 'W+H', '2W': '2W' };

/** Natural pairings a learner asks about, compared first when they apply. */
const CLASSIC_COMPARISONS: Record<string, string[]> = {
  major: ['mixolydian', 'lydian', 'minor', 'major-pentatonic'],
  minor: ['dorian', 'phrygian', 'harmonic-minor', 'minor-pentatonic'],
  'minor-pentatonic': ['minor-blues', 'major-pentatonic', 'minor', 'dorian'],
  'major-pentatonic': ['major-blues', 'major', 'minor-pentatonic', 'mixolydian'],
  'minor-blues': ['minor-pentatonic', 'major-blues', 'dorian'],
  'major-blues': ['major-pentatonic', 'minor-blues', 'mixolydian'],
  dorian: ['minor', 'mixolydian', 'melodic-minor'],
  mixolydian: ['major', 'dorian', 'lydian-dominant'],
  lydian: ['major', 'lydian-dominant'],
  phrygian: ['minor', 'phrygian-dominant', 'locrian'],
  locrian: ['phrygian', 'locrian-natural-2'],
  'harmonic-minor': ['minor', 'melodic-minor', 'phrygian-dominant'],
  'melodic-minor': ['dorian', 'harmonic-minor', 'major'],
};

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function ordinalWord(n: number): string {
  return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'][n - 1] ?? `${n}th`;
}

/** The rank and fit of one scale for one chord, by the engine's chord-scale matching. */
function fitOf(symbol: string, tonic: string, scale: ScaleType): FitChord {
  const display = safe(() => formatChord(symbol), symbol);
  const matches = safe(() => scalesForChord(symbol), []);
  const pc = chroma(tonic);
  const index = matches.findIndex((m) => m.scale.id === scale.id && chroma(m.tonic) === pc);
  const m = index >= 0 ? matches[index] : null;
  return { symbol, display, fit: m ? m.fit : null, rank: m ? index + 1 : null, avoid: m ? m.avoid : [] };
}

const FIT_ORDER = { primary: 0, colour: 1, compatible: 2 } as const;

/** Build the page model. Throws `RangeError` only for a scale id the catalog does not know. */
export function scalePageModel(tonic: string, scaleId: string, naming: NoteNaming = 'letters'): ScalePageModel {
  const scale = getScale(scaleId);
  if (!scale) throw new RangeError(`Unknown scale: "${scaleId}"`);
  const fmt = { system: naming } as const;
  const notes = scaleNotes(tonic, scale);

  const tones: ScaleTone[] = notes.map((n, i) => {
    const degree = scale.degrees[i];
    const interval = scale.intervals[i];
    return {
      note: n,
      label: formatNote(n, fmt),
      degree,
      degreeText: degree === '1' ? '1' : formatDegree(degree),
      interval,
      intervalWords: i === 0 ? 'root' : safe(() => intervalName(interval), interval),
    };
  });

  const steps: FormulaStep[] = scale.stepPattern.map((code, i) => ({
    code,
    text: STEP_TEXT[code] ?? code,
    semitones: scale.steps[i],
    words: STEP_WORDS[scale.steps[i]] ?? `${scale.steps[i]} frets`,
  }));

  // The parent scale this one is a mode of, on the root that gives the same notes.
  let modeOf: ScalePageModel['modeOf'] = null;
  if (scale.parent && scale.mode && scale.mode > 1) {
    const parent = getScale(scale.parent);
    const parentTonic = parent ? relativeScales(tonic, scale).find((r) => r.scale.id === parent.id)?.tonic : undefined;
    if (parent && parentTonic) modeOf = { mode: scale.mode, parent: parent.id, parentName: displayScaleName(parent), parentTonic };
  }

  const title = (t: string, s: ScaleType) => scaleTitle(t, s, naming);
  const relatives: RelatedScale[] = safe(() => relativeScales(tonic, scale), []).map((r) => ({
    tonic: r.tonic,
    scale: r.scale.id,
    title: title(r.tonic, r.scale),
    detail: `Same notes, from ${formatNote(r.tonic, fmt)}`,
  }));

  // Same root: the modes of this scale's own family first, then the nearest sounding scales.
  const parallelIds = new Set<string>();
  const parallels: RelatedScale[] = [];
  const addParallel = (id: string, detail?: string) => {
    const s = getScale(id);
    if (!s || s.id === scale.id || parallelIds.has(s.id) || s.size === 12) return;
    parallelIds.add(s.id);
    const summary = detail ?? prettyDegrees(safe(() => compareScales(scale, s).summary, ''));
    parallels.push({ tonic, scale: s.id, title: title(tonic, s), detail: summary || 'Same root' });
  };
  for (const id of CLASSIC_COMPARISONS[scale.id] ?? []) addParallel(id);
  for (const p of safe(() => parallelScales(tonic, scale), [])) addParallel(p.scale.id);

  const chordTypes = scale.chords.filter((id, i, all) => all.indexOf(id) === i);
  const fitsChords = chordTypes
    .map((type) => safe(() => buildChord(tonic, type).symbol, null))
    .filter((s): s is string => !!s)
    .map((symbol) => fitOf(symbol, tonic, scale))
    .sort((a, b) => (a.fit === null ? 9 : FIT_ORDER[a.fit]) - (b.fit === null ? 9 : FIT_ORDER[b.fit]));

  const built = (sevenths: boolean): BuiltChord[] | null =>
    safe(
      () =>
        harmonizeScale(tonic, scale, { sevenths }).map((c) => ({
          roman: c.roman,
          romanText: safe(() => formatRoman(c.roman), c.roman),
          symbol: c.symbol,
          display: safe(() => formatChord(c.symbol, fmt), c.symbol),
        })),
      null,
    );

  const simplest = safe(() => simplestTonic(tonic, scale), tonic);
  const compareWith = [...(CLASSIC_COMPARISONS[scale.id] ?? []), ...parallels.map((p) => p.scale)].filter((id, i, all) => all.indexOf(id) === i && id !== scale.id).slice(0, 8);

  return {
    tonic,
    scale,
    title: title(tonic, scale),
    name: prettyAccidentals(scale.name),
    family: scale.family,
    groupTitle: primaryGroupOf(scale.id).title,
    tones,
    steps,
    stepsText: steps.map((s) => s.text).join('–'),
    degreesText: tones.map((t) => t.degreeText).join(' '),
    mood: scale.description,
    uses: scale.uses,
    genres: scale.genres,
    aliases: scale.aliases.map((a) => prettyAccidentals(a)),
    quality: scale.quality,
    tier: scale.tier,
    modeOf,
    relatives,
    parallels,
    fitsChords,
    triads: built(false),
    sevenths: built(true),
    simplerTonic: chroma(simplest) === chroma(tonic) && simplest !== tonic && countAccidentals(simplest, scale) < countAccidentals(tonic, scale) ? simplest : null,
    compareWith,
  };
}

/** Degree labels inside a sentence in display form: "an added b5" -> "an added ♭5". */
export function prettyDegrees(text: string): string {
  return text.replace(/(^|[\s(,])([#b]+)(\d+)/g, (_m, lead: string, acc: string, n: string) => `${lead}${formatDegree(`${acc}${n}`)}`);
}

function countAccidentals(tonic: string, scale: ScaleType): number {
  return scaleNotes(tonic, scale).reduce((sum, n) => sum + (n.length - 1), 0);
}

/** The mode sentence for the page: "Dorian is the second mode of C Major: the same notes, starting from D." */
export function modeSentence(model: ScalePageModel, naming: NoteNaming = 'letters'): string | null {
  const m = model.modeOf;
  if (!m) return null;
  const parent = `${formatNote(m.parentTonic, { system: naming })} ${m.parentName}`;
  return `${model.name} is the ${ordinalWord(m.mode)} mode of ${parent}: the same notes, starting from ${formatNote(model.tonic, { system: naming })}.`;
}

/** A staff example: the scale one octave up and back down from a root with an octave (`A2`). */
export interface StaffLine {
  /** Note names with octaves, up then down (the top note once). */
  notes: string[];
  /** Degree label of each note, for display. */
  labels: string[];
  /** Index (into `notes`) of the top note. */
  top: number;
}

/** The scale one octave up and back down from `rootWithOctave`, spelled by the engine. */
export function staffLine(rootWithOctave: string, scale: string | ScaleType): StaffLine {
  const type = typeof scale === 'string' ? getScale(scale) : scale;
  if (!type) throw new RangeError(`Unknown scale: "${String(scale)}"`);
  const up = scaleNotes(rootWithOctave, type, { closed: true });
  const degrees = [...type.degrees, '1'];
  const down = up.slice(0, -1).reverse();
  const downDegrees = degrees.slice(0, -1).reverse();
  return {
    notes: [...up, ...down],
    labels: [...degrees, ...downDegrees].map((d) => (d === '1' ? 'R' : formatDegree(d))),
    top: up.length - 1,
  };
}

/** Route params for another scale page. */
export function relatedParams(r: { tonic: string; scale: string }): string[] {
  return [noteSlug(r.tonic), r.scale];
}

/** Every mode of the parent family, each on the root that shares this scale's notes. */
export function familyModes(tonic: string, scaleId: string, naming: NoteNaming = 'letters'): RelatedScale[] {
  const scale = getScale(scaleId);
  if (!scale?.parent) return [];
  const parent = getScale(scale.parent);
  if (!parent) return [];
  const rel = safe(() => relativeScales(tonic, scale), []);
  const parentTonic = scale.mode === 1 ? tonic : rel.find((r) => r.scale.id === parent.id)?.tonic;
  if (!parentTonic) return [];
  const parentNotes = scaleNotes(parentTonic, parent);
  const out: RelatedScale[] = [];
  safe(() => scaleModes(parent), []).forEach((m, i) => {
    if (!m.scale || !parentNotes[i]) return;
    out.push({ tonic: parentNotes[i], scale: m.scale.id, title: scaleTitle(parentNotes[i], m.scale, naming), detail: `Mode ${m.mode}` });
  });
  return out;
}
