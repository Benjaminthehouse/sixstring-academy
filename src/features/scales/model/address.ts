/**
 * Stable addresses for every scale, key and shape: the route params of `#scales`.
 *
 *   #scales                                   the last scale you looked at (A minor pentatonic at first)
 *   #scales--a--minor-pentatonic              root and scale
 *   #scales--a--minor-pentatonic--box-2       … and a shape (any pattern id from the guitar engine)
 *   #scales--f-sharp--dorian--3nps-4
 *   #scales--a-minor-pentatonic--box-2        the theory engine's one-piece scale slug works too
 *
 * Roots are `noteSlug` spellings (`f-sharp`, `bb`), scales are catalog ids, shapes are the guitar
 * engine's pattern ids (`caged-e`, `box-1`, `3nps-4`, `position-2`, `string-3`, `strings-6-5`, `diagonal-1`).
 */
import type { PatternSystem } from '@/core/guitar';
import type { ActivityInput } from '@/core/progress';
import { getScale, noteFromSlug, noteSlug, parseScaleSlug, scaleSlug } from '@/core/theory';

/** Where the screen is: a spelled root, a scale id and (optionally) a shape id. */
export interface ScaleAddress {
  tonic: string;
  scale: string;
  shape: string | null;
}

/** What `#scales` opens on the very first visit: the scale most guitarists learn first. */
export const DEFAULT_ADDRESS: ScaleAddress = { tonic: 'A', scale: 'minor-pentatonic', shape: null };

const SHAPE_ID = /^(?:caged-[cagde]|box-\d+|3nps-\d+|position-\d+|string-\d+|strings-\d+-\d+|diagonal-\d+)(?:-8va)?$/;

/** True for a param that names a pattern (`box-2`, `caged-e`, `3nps-4` …). */
export function isShapeId(param: string): boolean {
  return SHAPE_ID.test(param);
}

/**
 * Read the route params. Accepts `[root, scale, shape?]` and `[root-scale slug, shape?]`.
 * Null when they name no scale (the screen then opens the last scale instead).
 */
export function parseScaleParams(params: readonly string[]): ScaleAddress | null {
  if (params.length === 0) return null;
  const [first, second, third] = params;
  // Two-piece form: a root slug followed by a catalog id.
  if (second !== undefined) {
    const tonic = noteFromSlug(first);
    const scale = getScale(second);
    if (tonic && scale && scale.id === second) {
      return { tonic, scale: scale.id, shape: third !== undefined && isShapeId(third) ? third : null };
    }
  }
  // One-piece form: the theory engine's `scaleSlug`.
  const joined = parseScaleSlug(first);
  if (joined) return { tonic: joined.tonic, scale: joined.scale.id, shape: second !== undefined && isShapeId(second) ? second : null };
  return null;
}

/** The canonical params for an address: `['a', 'minor-pentatonic', 'box-2']`. */
export function scaleParams(address: ScaleAddress): string[] {
  const out = [noteSlug(address.tonic), address.scale];
  if (address.shape) out.push(address.shape);
  return out;
}

/** Skill id for a learnt shape, by the progress conventions: `scale:a-minor-pentatonic:box-1`. */
export function shapeSkillId(tonic: string, scale: string, shape: string): string {
  return `scale:${scaleSlug(tonic, scale)}:${shape}`;
}

/** Seconds of playing worth logging as practice. */
export const LOG_AFTER_SEC = 20;

/**
 * The practice-log entry for `seconds` of playing on a shape (`played` = the shape played last and
 * its title), or null when there is too little to log or no shape to log it against.
 */
export function practiceEntry(played: { address: ScaleAddress; title: string } | null, seconds: number): ActivityInput | null {
  const durationSec = Math.round(seconds);
  const shape = played?.address.shape;
  if (!played || !shape || !(durationSec >= LOG_AFTER_SEC)) return null;
  const { tonic, scale } = played.address;
  return { kind: 'scale-practice', id: shapeSkillId(tonic, scale, shape), durationSec, title: played.title, route: 'scales', params: scaleParams(played.address) };
}

/** Scale Arcade games this screen hands a scale and shape to, with what each one is for here. */
export const ARCADE_GAMES = [
  { id: 'run-the-scale', title: 'Run the Scale', blurb: 'Play the shape along with the click and get scored.', icon: 'Gauge' },
  { id: 'note-hunt', title: 'Note Hunt', blurb: 'Find the notes of this shape, fast.', icon: 'Crosshair' },
  { id: 'shape-builder', title: 'Shape Builder', blurb: 'Rebuild the shape from memory.', icon: 'Blocks' },
] as const;

/** Arcade game ids this screen links to. */
export type ArcadeGameId = (typeof ARCADE_GAMES)[number]['id'];

/**
 * Params for a Scale Arcade game on this scale and shape, in the Arcade's own form
 * `[game, scale-slug, shape]`: `['run-the-scale', 'a-minor-pentatonic', 'box-2']`.
 */
export function arcadeParams(game: ArcadeGameId, tonic: string, scale: string, shape: string | null): string[] {
  return shape ? [game, scaleSlug(tonic, scale), shape] : [game, scaleSlug(tonic, scale)];
}

/** Which pattern system a shape id belongs to. */
export function systemOfShape(shape: string): PatternSystem | null {
  if (shape.startsWith('caged-')) return 'caged';
  if (shape.startsWith('box-')) return 'box';
  if (shape.startsWith('3nps-')) return '3nps';
  if (shape.startsWith('position-')) return 'position';
  if (shape.startsWith('strings-')) return 'two-string';
  if (shape.startsWith('string-')) return 'single-string';
  if (shape.startsWith('diagonal-')) return 'diagonal';
  return null;
}
