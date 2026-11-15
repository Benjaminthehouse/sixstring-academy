/**
 * Fretboard detector A, "line structure": Hough lines -> board band -> fret comb -> homography ->
 * refinement on fret and string ridges -> nut / inlay numbering, and a tracker built on the same
 * refinement. See README.md in this directory.
 */
export { createDebugDetector, createDetector, createLineDetector, type LineDetectorOptions } from './detector';
export { fitFretPattern, fretIndexAt, fretU, FRET_RATIO, type FretCandidate, type FretFit, type FretFitOptions } from './fretfit';
export { detectLines, extractEdges, type EdgeSet, type HoughLine, type LineOptions } from './hough';
export { resolveMarkers, type MarkerResult } from './markers';
export { classifyCells, resolveNumbering, type InlayKind, type NumberingOptions, type NumberingResult } from './numbering';
export { refinePose, type CellEvidence, type FretEvidence, type RefineOptions, type RefineResult } from './refine';
