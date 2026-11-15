/**
 * Types shared by the music components. Colours are never CSS values here: a component receives a
 * `MusicColor` name and maps it to a token (`deg-3` -> `--deg-3` with `--deg-3-fg` for its label),
 * so every drawing follows the theme and the fixed degree / finger palettes.
 */
import type { NoteNaming } from '@/core/theory';

export type { NoteNaming };

/** Scale-degree colour 1–7 (1 = root), or `deg-x` for a note outside the scale. */
export type DegreeColor = 'deg-1' | 'deg-2' | 'deg-3' | 'deg-4' | 'deg-5' | 'deg-6' | 'deg-7' | 'deg-x';

/** Fretting-finger colour: 1 index … 4 little finger, `t` thumb. */
export type FingerColor = 'finger-1' | 'finger-2' | 'finger-3' | 'finger-4' | 'finger-t';

/**
 * Every colour a music component can give a note: the degree and finger palettes, a neutral pearl
 * dot, and the app's accent and status tones (for selection and right/wrong feedback).
 */
export type MusicColor = DegreeColor | FingerColor | 'neutral' | 'accent' | 'ok' | 'bad' | 'info';

/** Shape of a note marker. `ring` is hollow (a target to find, a ghost of a note). */
export type MarkerShape = 'circle' | 'square' | 'diamond' | 'ring';

/**
 * State of a note marker. `target` pulses (find or play this), `hit` and `miss` show a check or a
 * cross beside the dot (never colour alone), `ghost` is dimmed (context, an earlier note).
 */
export type MarkerState = 'normal' | 'target' | 'hit' | 'miss' | 'ghost';

/** What the text inside a note marker shows. */
export type MarkerLabelMode = 'note' | 'degree' | 'interval' | 'finger' | 'none';

/** How marker colours are chosen by the marker builders. */
export type MarkerColorMode = 'degree' | 'finger' | 'root' | 'neutral';

/** Fretboard wood: the cosmetic ids `wood-…` without their prefix. */
export type FretboardWood = 'rosewood' | 'maple' | 'ebony' | 'pau-ferro' | 'roasted-maple' | 'koa';

/** Inlay style: the cosmetic ids `inlay-…` without their prefix. */
export type FretboardInlay = 'dots' | 'offset-dots' | 'blocks' | 'diamonds' | 'sharkfin' | 'vine';

/** Woods that are pale: their markers get a dark edge and their path lines are drawn dark. */
export const LIGHT_WOODS: readonly FretboardWood[] = ['maple', 'roasted-maple', 'koa'];
