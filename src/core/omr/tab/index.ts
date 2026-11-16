/**
 * Printed-tablature recognizer: reads the fret numbers, rhythm and technique marks of one tab
 * staff strip. See the "Tab recognizer" section of ../README.md.
 */
import type { RecognizeTabStaff } from '../types';
import { readTabStaff } from './recognize';
import { askSecondOpinion, needsSecondOpinion } from './second-opinion';

/**
 * Read a tablature staff (the `tab` recognizer of `recognizePage`). Synchronous unless a vision
 * model is given in `options.ai` AND the picture left doubts; then the model is asked once about
 * the staff and its answer merged in (see `second-opinion.ts`).
 */
export const recognizeTabStaff: RecognizeTabStaff = (input, options) => {
  const detail = readTabStaff(input, options);
  const ai = options?.ai;
  if (!ai || options?.signal?.aborted || !needsSecondOpinion(detail.reading.events, detail.debug.reliability)) return detail.reading;
  return askSecondOpinion(input, detail.reading.events, detail.debug.stripX, detail.debug.reliability, ai, options?.signal, detail.debug.tuning).then((answered) => {
    if (!answered) (detail.reading.warnings ??= []).push({ code: 'ai-unavailable', message: 'The second opinion on this staff could not be obtained; the reading from the picture alone is shown.' });
    return detail.reading;
  });
};

export { type TabColumn, type TabDebug, type TabReadingDetail, readTabStaff, tuningFor } from './recognize';
export { type Glyph, type TabNumber, MAX_FRET, assembleLine, buildNumber, glyphConfidence, readCluster } from './numbers';
export { type Box, type ClassScore, type GlyphPatch, type LineProfile, classifyPatch, correlate, extractPatch, lineProfileAt, refineBox } from './glyph';
export { type LineBlob, type StackCut, applyStackCuts, columnProfile, estimateDigitHeight, findLineBlobs, findStackCuts, findWeldedBlobs, groupAdjacent, groupColumns, profileValleys } from './segment';
export { type Stem, assignDurations, findStems, solveMeasure } from './rhythm';
export { type TabMark, findArcs, findBends, findSlides } from './marks';
export { type RestReading, type TimeSignatureReading, findRests, readTimeSignature } from './header';
export { type VisionColumn, TAB_VISION_PROMPT, mergeVision, needsSecondOpinion, parseVisionColumns } from './second-opinion';
export { type GlyphTemplate, GLYPH_H, GLYPH_LABELS, TEMPLATE_FAMILY_NAMES, loadTemplates, struckTemplates, templatesAtBlur } from './templates';
