/**
 * Fretboard detector, approach B ("model alignment"). See README.md.
 *
 *   import { createAlignDetector } from '@/core/vision/align';
 *   const detector = createAlignDetector();
 *   const { pose } = detector.detect(frame, { model: 'steel' });
 *   const next = pose && detector.track(nextFrame, pose, { timeMs }).pose;
 */
export { createAlignDetector, createDetector, type AlignDetectorOptions, type Hypothesis } from './detector';
export { AxisSearch, computeRidgeField, findAxisCandidates, type AxisCandidate, type RidgeField } from './axis';
export { findCombs, findPeaks, sampleLineProfile, type Comb, type CombFret, type LineProfile, type ProfilePeak } from './comb';
export { measureBoard, measurementHomography, type BoardMeasurement, type OrientationHints } from './hypothesis';
export { buildPyramid, toWorkingGray, type GrayImage, type Pyramid } from './image';
export { resolveNumbering, type NumberingDecision } from './numbering';
export { refineHomography, refineRigid, visibleSpan, type FretSpan, type RefineOptions, type RefineResult } from './refine';
export { renumberHomography, rigidity, type Rigidity } from './rigidity';
export { scorePose, type FretEvidence, type PoseScore } from './score';
