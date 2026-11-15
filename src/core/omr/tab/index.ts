/**
 * Printed-tablature recognizer: reads the fret numbers of one tab staff strip.
 * See the "Tab recognizer" section of ../README.md.
 */
import type { RecognizeTabStaff } from '../types';
import { readTabStaff } from './recognize';

/** Read a tablature staff (the `tab` recognizer of `recognizePage`). */
export const recognizeTabStaff: RecognizeTabStaff = (input, options) => readTabStaff(input, options).reading;

export { type TabColumn, type TabDebug, type TabReadingDetail, readTabStaff } from './recognize';
export { type Glyph, type TabNumber, MAX_FRET, assembleLine, buildNumber, glyphConfidence, readCluster } from './numbers';
export { type Box, type ClassScore, type GlyphPatch, type LineProfile, classifyPatch, correlate, extractPatch, lineProfileAt } from './glyph';
export { type LineBlob, columnProfile, estimateDigitHeight, findLineBlobs, groupAdjacent, groupColumns, profileValleys } from './segment';
export { type GlyphTemplate, GLYPH_H, GLYPH_LABELS, loadTemplates, templatesAtBlur } from './templates';
