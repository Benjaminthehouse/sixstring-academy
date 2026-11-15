/**
 * Live fretboard camera: find the fretboard in webcam frames, lock onto it, follow it, and say where
 * every (string, fret) is in the picture. Pure TypeScript on typed arrays (no server, no OpenCV, no
 * network); runs in a Web Worker on downscaled frames. Import from here (`@/core/vision`), never from
 * the inner files. `API.md` beside this file is the digest; `README.md` has the design and the
 * measurements.
 *
 *   VisionPipeline    the camera runtime: video -> worker -> poses, adaptive quality, extrapolation
 *   drawVisionOverlay the overlay on a 2D canvas (outline, fret numbers, notes, pulse, indicator)
 *   FretboardTracker  the per-frame entry point (state machine, smoothing, numbering lock)
 *   calibration       four taps / dragged quadrilateral / one-tap numbering / nudges
 *   color markers     two tapped coloured markers as anchors (marker mode)
 *   overlay           marker placement and frame <-> display conversion
 *   geometry          the neck model and projection maths every overlay needs
 *   protocol          messages for running the tracker in `vision.worker.ts`
 *
 * The two detector approaches the production detector is built from (`lines/`, `align/`) and the
 * synthetic test bench (`testing/`) are internal and are not exported here.
 */
export type {
  DetectOptions,
  DetectionDiagnostics,
  DetectionResult,
  Detector,
  DiagnosticFeature,
  Frame,
  FretHint,
  FretPosition,
  FretRange,
  FretboardPose,
  GrayFrame,
  Line,
  MarkerHint,
  MarkerColor,
  Mat3,
  NeckModel,
  NeckPresetId,
  NumberingSource,
  PixelLocation,
  Point,
  Rect,
} from './types';
export {
  FretboardTracker,
  PoseFilter,
  createSessionDetector,
  fretQuestion,
  type FretQuestion,
  type FretboardTrackerOptions,
  type SmoothingOptions,
  type TrackerHint,
  type TrackerState,
  type TrackerUpdate,
} from './tracker';
export { createVisionHost, type FrameProbe, type FrameTiming, type VisionHostEnvironment, type VisionOptions, type VisionRequest, type VisionResponse } from './protocol';
export { VisionPipeline, workingSizeFor, type PipelineMode, type PipelineOptions, type PipelineRender, type PipelineStats, type PipelineUpdate } from './pipeline';
export { PosePredictor, type PredictorOptions } from './predict';
export { QualityController, type FrameWork, type QualityOptions, type QualitySettings } from './quality';
export {
  PLAIN_PALETTE,
  STATE_WORDS,
  drawVisionOverlay,
  fitOverlayCanvas,
  readOverlayPalette,
  type OverlayNote,
  type OverlayOptions,
  type OverlayPalette,
  type OverlayResult,
} from './draw';
export { MIN_MARKER_CHROMA, MIN_MARKER_SATURATION, findColorBlobs, readMarkerNumbering, sampleMarkerColor, type ColorBlob, type MarkerReading } from './color-markers';
export { createDetector, createFretboardDetector, type FretboardDetector, type FretboardDetectorOptions } from './detector';
export {
  defaultCalibrationQuad,
  nudgePose,
  poseFromQuad,
  poseFromTaps,
  poseFromWireTaps,
  shiftNumbering,
  type CalibrationOptions,
  type PoseNudge,
  type QuadSpan,
  type WireTap,
} from './calibration';
export { displayToFrame, displayTransform, frameToDisplay, placeMarkers, poseForDisplay, type DisplayView, type MarkerPlacement } from './overlay';
export {
  INLAY_FRETS,
  DOUBLE_INLAY_FRETS,
  NECK_PRESETS,
  boardOutline,
  boardEdgeY,
  boardWidthAt,
  computeVisibleFrets,
  confirmFretAt,
  fretAtX,
  fretSpacing,
  fretSpacingPx,
  fretX,
  inlayPositions,
  interpolatePoses,
  invertHomography,
  locatePixel,
  makePose,
  markerPlanePosition,
  mirrorPose,
  neckModel,
  poseDistancePx,
  projectFretWire,
  projectMarker,
  projectPlanePoint,
  projectString,
  projectStringAt,
  renumberPose,
  scalePose,
  stringY,
  transformPose,
  type CalibrationTaps,
  type PoseLike,
} from './geometry';
