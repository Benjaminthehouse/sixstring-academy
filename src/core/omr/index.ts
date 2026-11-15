/**
 * Sheet recognition (OMR): from a page image to a positioned transcription.
 *
 * This barrel exports the browser-safe parts: the output model, the image toolbox, the staff /
 * layout analysis and the page pipeline. The evaluation harness under `eval/` reads files and is
 * imported directly by tests and tools (`@/core/omr/eval/...`), never from here.
 * See README.md for the pipeline and for what the staff recognizers must implement.
 */
export * from './types';

export { type BinaryImage, type GrayImage, binaryToGray, blur3, boxBlurHorizontal, boxBlurSheared, boxBlurVertical, createBinary, createGray, cropBinary, cropGray, downscaleInt, gaussianBlur, grayToRgba, histogram, percentile, resizeGray, rgbaToGray } from './image/gray';
export { type BinarizeOptions, type Integral, binarize, boxSum, integral, otsuThreshold, thresholdGlobal } from './image/binarize';
export { type BackgroundMap, type FlattenOptions, type FlattenResult, estimateBackground, estimateNoise, flatten } from './image/illumination';
export { type RunHistograms, type RunTable, columnProjection, histogramMode, horizontalRuns, refinePeak, rowProjection, verticalRunHistograms, verticalRuns } from './image/runs';
export { type Components, componentImage, labelComponents, removeSmallComponents } from './image/cc';
export { close, countInk, dilate, erode, open, subtract } from './image/morph';
export { type Affine, type WarpMesh, type WarpOptions, applyHomography, homographyFromPoints, identityMesh, invert3, meshFromAffine, meshFromFunction, meshMap, meshUnmap, rotateGray, warpGray } from './image/warp';
export { type SkewEstimate, type SkewOptions, deskewGray, estimateSkew } from './image/skew';
export { type CorrectionMode, type Dewarp, type DewarpOptions, buildDewarp } from './image/dewarp';
export { type PreprocessOptions, type PreprocessResult, binarizeLines, binarizeStrokes, binarizeSymbols, isNoisy, preprocess } from './image/preprocess';

export { type BarlineGeom, type KindEvidence, type MeasureGeom, type PageLayout, type StaffGeom, type StaffLayout, type SystemLayout, lineYAt, staffBottomAt, staffBox, staffCenterAt, staffPositionAt, staffSlope, staffSpaceAt, staffTopAt, staffUnitsX, yAtStaffPosition } from './staff/model';
export { type StaffScale, estimateStaffScale } from './staff/scale';
export { type DetectStavesOptions, type LineTrace, type StaffDetection, detectStaves } from './staff/lines';
export { type BarlineOptions, detectBarlines, measuresFromBarlines } from './staff/barlines';
export { type StaffClassification, classifyStaff } from './staff/classify';
export { type SystemGroup, contentBox, groupSystems, staffConnection } from './staff/systems';
export { type RemovalOptions, type RemovalResult, removeStaffLines } from './staff/removal';
export { type LayoutOptions, type LayoutResult, detectLayout } from './staff/layout';

export { type AnalyzeOptions, type ExtractOptions, type PageAnalysis, type RecognizePageOptions, DEFAULT_STRIP_SPACE, analyzePage, assemblePage, extractStaff, recognizePage, staffId } from './page';
