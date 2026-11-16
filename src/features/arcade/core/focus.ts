/**
 * What the learner is practising in the arcade: a tonic, a scale and one shape of it on the neck
 * ("A minor pentatonic, box 1"). Every game reads its notes from here, so every target is derived
 * from the guitar engine (`scalePatterns`) and is a real note of the scale inside the shape.
 */
import { getScale, parseScaleSlug, scaleSlug, simplestTonic, SCALES, SCALE_FAMILIES, formatScaleName, isNote, prettyAccidentals, type ScaleType } from '@/core/theory';
import { patternSystemsFor, scalePatterns, STANDARD_TUNING, type PatternNote, type PatternSystem, type ScalePattern, type Tuning } from '@/core/guitar';

/** The scale and shape being practised. */
export interface Focus {
  /** Spelled tonic, ASCII (`A`, `F#`, `Bb`). */
  tonic: string;
  /** Scale id from the theory catalog (`minor-pentatonic`, `dorian`). */
  scale: string;
  /** Pattern id from the guitar engine (`box-1`, `caged-e`, `3nps-2`, `position-1`). */
  shape: string;
}

/** Where a new learner starts: the scale most guitarists learn first, in its first box. */
export const DEFAULT_FOCUS: Focus = { tonic: 'A', scale: 'minor-pentatonic', shape: 'box-1' };

/** Scales the arcade offers: all of them except chromatic (every note is in it, so there is nothing to find). */
export function arcadeScales(): ScaleType[] {
  return SCALES.filter((s) => s.id !== 'chromatic');
}

/** The arcade's scales by family, families in the catalog's order, simplest scales first inside each. */
export function scalesByFamily(): Array<{ family: string; name: string; scales: ScaleType[] }> {
  const all = arcadeScales();
  return SCALE_FAMILIES.map((f) => ({
    family: f.id,
    name: f.name,
    scales: all.filter((s) => s.family === f.id).sort((a, b) => a.tier - b.tier),
  })).filter((g) => g.scales.length > 0);
}

/** The scales shown first in the picker: the everyday ones (catalog tier 1 and 2). */
export function commonScales(): ScaleType[] {
  return arcadeScales().filter((s) => s.tier <= 2);
}

/** The twelve tonics, each spelled the simplest way for the scale (`Bb` major, `A#` is never offered). */
export function tonicsFor(scale: string): string[] {
  return Array.from({ length: 12 }, (_, pc) => simplestTonic(pc, scale));
}

/** The learner's full-neck setting before they change it (`prefs.fretboard.frets`). */
export const DEFAULT_NECK_FRETS = 15;

/** The highest fret shapes are laid out to for a fret setting: the Scales screen's range (12 to 24). */
export function neckFrets(frets: number = DEFAULT_NECK_FRETS): number {
  return Math.max(12, Math.min(24, Math.round(frets) || DEFAULT_NECK_FRETS));
}

/** Systems the guitar engine lays out as one climb up the neck (as the Scales screen shows them). */
const CLIMBING: ReadonlySet<PatternSystem> = new Set(['box', '3nps', 'position', 'diagonal']);

/**
 * The shapes of one system exactly as the Scales screen lays them out (no capo): climbing systems
 * go up the neck (A minor pentatonic boxes at frets 5, 7, 9, 12, 14) as far as the learner's neck
 * reaches, so `box-4` is the same box, in the same octave, on both screens.
 */
function systemShapes(tonic: string, scale: string, system: PatternSystem, tuning: Tuning, frets: number): ScalePattern[] {
  return scalePatterns(tonic, scale, { system, tuning, maxFret: neckFrets(frets), upTheNeck: CLIMBING.has(system) });
}

/**
 * The shapes the arcade drills for a scale: its main system (boxes, CAGED or positions), then 3NPS
 * for seven-note scales. `frets` is the learner's full-neck setting (`fretCount()`).
 */
export function shapesFor(tonic: string, scale: string, tuning: Tuning = STANDARD_TUNING, frets: number = DEFAULT_NECK_FRETS): ScalePattern[] {
  const systems = patternSystemsFor(scale, tuning);
  const primary = systems[0];
  const out = systemShapes(tonic, scale, primary, tuning, frets);
  if (primary !== '3nps' && systems.includes('3nps')) out.push(...systemShapes(tonic, scale, '3nps', tuning, frets));
  return out.filter((p) => p.notes.length >= 3);
}

/**
 * Any shape the guitar engine can build for the scale: the drilled ones first, then the other
 * systems (one string, two strings, diagonal), so a link from the Scales page keeps its shape,
 * laid out where that page draws it.
 */
export function findShape(tonic: string, scale: string, id: string | undefined, tuning: Tuning = STANDARD_TUNING, frets: number = DEFAULT_NECK_FRETS): ScalePattern | null {
  if (!id) return null;
  const drilled = safeShapes(tonic, scale, tuning, frets).find((p) => p.id === id);
  if (drilled) return drilled;
  try {
    for (const system of patternSystemsFor(scale, tuning)) {
      const hit = systemShapes(tonic, scale, system, tuning, frets).find((p) => p.id === id && p.notes.length >= 3);
      if (hit) return hit;
    }
  } catch {
    /* unknown scale */
  }
  return null;
}

/** A focus with every part valid: unknown scales, tonics or shapes fall back to sensible ones. */
export function normalizeFocus(input: Partial<Focus> | null | undefined, tuning: Tuning = STANDARD_TUNING, frets: number = DEFAULT_NECK_FRETS): Focus {
  const scale = input?.scale && getScale(input.scale) && input.scale !== 'chromatic' ? getScale(input.scale)!.id : DEFAULT_FOCUS.scale;
  const tonic = input?.tonic && isNote(input.tonic) ? simplestTonic(input.tonic, scale) : scale === DEFAULT_FOCUS.scale ? DEFAULT_FOCUS.tonic : simplestTonic('A', scale);
  const shape = findShape(tonic, scale, input?.shape, tuning, frets)?.id ?? safeShapes(tonic, scale, tuning, frets)[0]?.id ?? DEFAULT_FOCUS.shape;
  return { tonic, scale, shape };
}

function safeShapes(tonic: string, scale: string, tuning: Tuning, frets: number): ScalePattern[] {
  try {
    return shapesFor(tonic, scale, tuning, frets);
  } catch {
    return [];
  }
}

/** The pattern a focus names (the first shape when its own is missing). */
export function patternOf(focus: Focus, tuning: Tuning = STANDARD_TUNING, frets: number = DEFAULT_NECK_FRETS): ScalePattern {
  const found = findShape(focus.tonic, focus.scale, focus.shape, tuning, frets) ?? shapesFor(focus.tonic, focus.scale, tuning, frets)[0];
  if (!found) throw new RangeError(`No playable shape for ${focus.tonic} ${focus.scale}`);
  return found;
}

/** Route-safe slug of the focus scale: `a-minor-pentatonic`. */
export function focusSlug(focus: Pick<Focus, 'tonic' | 'scale'>): string {
  return scaleSlug(focus.tonic, focus.scale);
}

/** Read `[scale-slug, shape?]` route params into a partial focus (null when the slug names no scale). */
export function focusFromParams(slug: string | undefined, shape?: string): Partial<Focus> | null {
  if (!slug) return null;
  const parsed = parseScaleSlug(slug);
  if (!parsed || parsed.scale.id === 'chromatic') return null;
  return { tonic: parsed.tonic, scale: parsed.scale.id, ...(shape ? { shape } : {}) };
}

/** "A minor pentatonic" in the reader's naming (pass `system` from the music settings). */
export function scaleTitle(focus: Pick<Focus, 'tonic' | 'scale'>, system?: 'letters' | 'solfege' | 'german'): string {
  const name = formatScaleName(focus.tonic, focus.scale, system ? { system } : {});
  const space = name.indexOf(' ');
  const tonic = name.slice(0, space);
  const words = name.slice(space + 1);
  // The catalog capitalises every name ("Minor pentatonic"); after a tonic the plain adjectives read
  // lower case ("A minor pentatonic") while proper names keep their capital ("D Dorian").
  const first = words.split(/[\s(]/)[0];
  return `${tonic} ${PLAIN_WORDS.has(first) ? words[0].toLowerCase() + words.slice(1) : words}`;
}

const PLAIN_WORDS = new Set(['Major', 'Minor', 'Natural', 'Melodic', 'Harmonic', 'Altered', 'Double', 'Dominant', 'Combined', 'Bebop', 'Whole', 'Diminished', 'Augmented', 'Six-tone', 'Tritone', 'Leading']);

/** A scale's catalog name for a picker, accidentals drawn as signs: `Dorian #4` → `Dorian ♯4`. */
export function scaleLabel(scale: Pick<ScaleType, 'name'>): string {
  return prettyAccidentals(scale.name);
}

/** "Box 1 · 5th position". */
export function shapeTitle(pattern: Pick<ScalePattern, 'name' | 'positionName'>): string {
  return `${pattern.name} · ${pattern.positionName}`;
}

/** The frets to draw for a shape: one spare fret either side (the open strings when it reaches fret 1). */
export function regionOf(pattern: Pick<ScalePattern, 'minFret' | 'maxFret'>, maxFret = 24): [number, number] {
  const from = pattern.minFret <= 1 ? 0 : pattern.minFret - 1;
  let to = Math.min(maxFret, pattern.maxFret + 1);
  // At least five frets of wood, so a region never looks like a sliver.
  if (to - Math.max(from, 1) < 4) to = Math.min(maxFret, Math.max(from, 1) + 4);
  return [from, to];
}

/** The fret span the shape itself covers, for the highlighted box. */
export function boxOf(pattern: Pick<ScalePattern, 'minFret' | 'maxFret' | 'name'>): { from: number; to: number; label: string } {
  return { from: Math.max(pattern.minFret, pattern.minFret === 0 ? 0 : 1), to: pattern.maxFret, label: pattern.name };
}

/** `string:fret` key of a position. */
export function posKey(p: { string: number; fret: number }): string {
  return `${p.string}:${p.fret}`;
}

/** The notes of a pattern by `string:fret`. */
export function notesByPos(pattern: ScalePattern): Map<string, PatternNote> {
  return new Map(pattern.notes.map((n) => [posKey(n), n]));
}
