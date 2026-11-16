/**
 * A small window onto the live fretboard for the browser check (`e2e/camera.cjs` imports this
 * module through the dev server, so it is the same instance the screen uses). Plain data and an
 * optional hook; nothing here runs unless a test installs the hook.
 */
import type { CropRect, VisionPipeline } from '@/core/vision';

/** One drawn dot, in CSS pixels of the stage. */
export interface DebugMarker {
  string: number;
  /** Fret on the wood (from the nut). */
  fret: number;
  x: number;
  y: number;
  /** Radius of the dot on screen (CSS px). */
  radius: number;
  ghost: boolean;
}

/** What one overlay frame drew. */
export interface RenderInfo {
  timeMs: number;
  video: HTMLVideoElement;
  /** The stage box and how the picture is fitted into it (`crop`: the part shown while zoomed in on the notes). */
  view: { width: number; height: number; mirrored: boolean; fit: 'contain'; crop?: CropRect };
  videoWidth: number;
  videoHeight: number;
  state: string;
  notes: 'solid' | 'ghost' | 'none';
  markers: DebugMarker[];
  numbering: string | null;
  /** The tracker's coaching code and trust for the newest answer. */
  guidance: string | null;
  trust: string | null;
  confidence: number;
  /** Notes the microphone confirmed, flashing now (fret on the wood). */
  flashes: Array<{ string: number; fret: number }>;
}

/** The live record (one camera screen at a time). */
export interface CameraDebug {
  /** Overlay frames drawn since the screen opened. */
  frames: number;
  /** Called after every overlay frame when set (tests only). */
  hook: ((info: RenderInfo) => void) | null;
  /** The camera stream and pipeline while running (tests check they are released). */
  stream: MediaStream | null;
  pipeline: VisionPipeline | null;
  /** Times the camera was started and released. */
  starts: number;
  releases: number;
  /** The part of the picture shown now while zoomed in on the notes (null: the whole picture), for taps in tests. */
  crop: CropRect | null;
}

/** The record. */
export const cameraDebug: CameraDebug = { frames: 0, hook: null, stream: null, pipeline: null, starts: 0, releases: 0, crop: null };
