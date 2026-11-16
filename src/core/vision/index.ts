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
 *   zoom              zoom to the neck: crop the picture around the notes so the dots can be read
 *   geometry          the neck model and projection maths every overlay needs (also the camera
 *                     centre and markers on the raised strings as seen)
 *   guidance          coaching for the learner and the operating limits (`TrackerUpdate.guidance`)
 *   string-count      how many strings the board in view has (a wrong guitar type never locks)
 *   protocol          messages for running the tracker in `vision.worker.ts`
 *   frame-copy        camera frame planes (I420, NV12, RGBA) averaged down to working-size RGBA
 *
 * The two detector approaches the production detector is built from (`lines/`, `align/`) and the
 * synthetic test benches (`testing/`, including the independent `alt-scenes.ts`) are internal and
 * are not exported here.
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
export { VIDEO_FRAMES_UNREADABLE, createVisionHost, type FrameProbe, type FrameTiming, type VisionHostEnvironment, type VisionOptions, type VisionRequest, type VisionResponse } from './protocol';
export { canReadRaw, rawToRgba, type RawFrame, type RawPlane } from './frame-copy';
export { VisionPipeline, workingSizeFor, type FrameTransfer, type PipelineMode, type PipelineOptions, type PipelineRender, type PipelineStats, type PipelineUpdate } from './pipeline';
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
export { OPERATING_LIMITS, calibrateMessage, frameStats, guide, viewStats, type FrameStats, type GuidanceCode, type GuidanceTrust, type GuideInput, type TrackerGuidance, type ViewStats } from './guidance';
export { readStringCount, stringCountDoubt, type StringCountReading } from './string-count';
export { MIN_MARKER_CHROMA, MIN_MARKER_SATURATION, findColorBlobs, readMarkerNumbering, sampleMarkerColor, type ColorBlob, type MarkerReading } from './color-markers';
export { createDetector, createFretboardDetector, type FittedBoard, type FretboardDetector, type FretboardDetectorOptions } from './detector';
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
export { displayToFrame, displayTransform, frameToDisplay, placeMarkers, poseForDisplay, type CropRect, type DisplayView, type MarkerPlacement } from './overlay';
export { CropFollower, FULL_CROP, cropZoom, isFullCrop, neckCrop, videoCropTransform, type CropFollowerOptions, type NeckCropOptions } from './zoom';
export {
  INLAY_FRETS,
  DOUBLE_INLAY_FRETS,
  NECK_PRESETS,
  boardOutline,
  boardEdgeY,
  boardWidthAt,
  cameraCentre,
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
  projectMarkerSeen,
  projectPlanePoint,
  projectRaised,
  projectString,
  projectStringAt,
  renumberPose,
  scalePose,
  stringHeightAt,
  stringY,
  STRING_HEIGHT_MM,
  FRET_HEIGHT_MM,
  transformPose,
  type CalibrationTaps,
  type PoseLike,
} from './geometry';
