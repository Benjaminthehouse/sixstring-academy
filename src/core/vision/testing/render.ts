/**
 * The procedural scene renderer: turns a `SceneSpec` into an RGBA frame plus ground truth.
 * Pure TypeScript on typed arrays: runs under vitest in Node and in a browser, no canvas, no DOM.
 *
 * Pipeline: background (image space) -> player behind the guitar -> guitar (per pixel in the neck
 * plane) -> fretting hand, picking arm, occluder -> lighting -> defocus / motion blur -> vignette ->
 * sensor noise -> 8-bit sRGB -> 8x8 block compression.
 */
import { INLAY_FRETS, applyHomography, fretX, makePose, neckModel } from '../geometry';
import type { DetectOptions, Frame, FretRange, FretboardPose, Mat3 } from '../types';
import { renderBackground } from './background';
import { distortPoint, fitTruthHomography, focalLengthPx, undistortMaps, viewHomography } from './camera';
import { drawGuitar } from './guitar';
import { drawFrettingHand, drawOccluder, drawPerson, drawPickingArm, layoutHand, occluderSdf, type PeopleContext } from './people';
import { compressBlocks, exposeToFrame, gaussianBlur, motionBlur, type RenderTarget } from './raster';
import { describeScene, type SceneSpec } from './scene';

/** Everything known about a rendered frame that a detector is not told. */
export interface SceneTruth {
  /** True pose of the board, or null when there is no guitar in the frame. */
  pose: FretboardPose | null;
  /** What the app would legitimately know and pass to `detect`: handedness, mirroring, guitar type. */
  hints: DetectOptions;
  /** The nut is inside the frame and not hidden. */
  nutVisible: boolean;
  /** Absolute fret numbers can be read off this frame alone (nut, 12th-fret inlay pattern or stickers in view). */
  numberingObservable: boolean;
  /** Fret wires hidden by the fretting hand, if any. */
  handFrets: FretRange | null;
  /** The board is (almost) completely hidden by an occluder. */
  occluded: boolean;
  /** RMS distance in pixels between the truth homography and the exact distorted projection. */
  distortionResidualPx: number;
  /** One-line summary of the scene. */
  description: string;
}

/** A rendered frame with its ground truth and the spec it came from. */
export interface RenderedScene {
  frame: Frame;
  truth: SceneTruth;
  spec: SceneSpec;
}

/**
 * Persistent storage of rendered pixels keyed by scene, so a benchmark does not re-render the same
 * frames on every run. `store.ts` has a disk implementation for Node.
 */
export interface FrameStore {
  /** The stored frame for a key, or null. */
  load(key: string, width: number, height: number): Frame | null;
  /** Remember a rendered frame. */
  save(key: string, frame: Frame): void;
}

/** Reusable intermediate results (lens maps, backgrounds); share one across the frames of a sequence. */
export interface RenderCache {
  maps: Map<string, { ux: Float32Array; uy: Float32Array }>;
  backgrounds: Map<string, Float32Array>;
  /** Optional persistent pixel store: when a scene is found there, only its ground truth is recomputed. */
  frames?: FrameStore;
}

/** A fresh render cache, optionally backed by a persistent frame store. */
export function createRenderCache(frames?: FrameStore): RenderCache {
  return { maps: new Map(), backgrounds: new Map(), frames };
}

/** Stable 64-bit key (16 hex digits) of a scene spec, for frame stores. */
export function sceneKey(spec: SceneSpec): string {
  const text = JSON.stringify(spec);
  let a = 0x811c9dc5;
  let b = 0x1b873593;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ (c + i), 0x85ebca6b);
    b = (b << 13) | (b >>> 19);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

const TRUTHS = new WeakMap<Frame, SceneTruth>();

/** Ground truth of a frame produced by `renderScene` (how the oracle detector cheats). */
export function truthOf(frame: Frame): SceneTruth | undefined {
  return TRUTHS.get(frame);
}

/** Cumulative milliseconds spent in each render stage since the last `resetRenderProfile()`. */
export const renderProfile: Record<string, number> = {};

/** Zero the stage timers in `renderProfile`. */
export function resetRenderProfile(): void {
  for (const key of Object.keys(renderProfile)) delete renderProfile[key];
}

function lap(stage: string, since: number): number {
  const now = performance.now();
  renderProfile[stage] = (renderProfile[stage] ?? 0) + now - since;
  return now;
}

let LAYER = new Float32Array(0);
let LINEAR = new Float32Array(0);
let BACKGROUND = new Float32Array(0);
const SCRATCH_MAPS = new Map<string, { ux: Float32Array; uy: Float32Array }>();

function remember<V>(map: Map<string, V>, key: string, limit: number, make: () => V): V {
  const hit = map.get(key);
  if (hit !== undefined) return hit;
  const value = make();
  map.set(key, value);
  if (map.size > limit) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  return value;
}

/** Render a scene. Deterministic: the same spec always gives the same bytes. */
export function renderScene(spec: SceneSpec, cache?: RenderCache): RenderedScene {
  const store = cache?.frames;
  const key = store ? sceneKey(spec) : '';
  let frame = store ? store.load(key, spec.width, spec.height) : null;
  if (!frame) {
    frame = renderPixels(spec, cache);
    if (store) store.save(key, frame);
  }
  const clock = performance.now();
  const model = spec.guitar ? spec.guitar.model : neckModel('steel');
  const pinhole = viewHomography(spec.view, model, spec.width, spec.height, spec.leftHanded !== spec.mirrored, !spec.bassSideUp);
  const truth = buildTruth(spec, pinhole);
  TRUTHS.set(frame, truth);
  lap('truth', clock);
  return { frame, truth, spec };
}

/** Ground truth of a scene without rendering it (cheap: no pixels are produced). */
export function truthForScene(spec: SceneSpec): SceneTruth {
  const model = spec.guitar ? spec.guitar.model : neckModel('steel');
  return buildTruth(spec, viewHomography(spec.view, model, spec.width, spec.height, spec.leftHanded !== spec.mirrored, !spec.bassSideUp));
}

function renderPixels(spec: SceneSpec, cache?: RenderCache): Frame {
  let clock = performance.now();
  const W = spec.width;
  const Hh = spec.height;
  const n = W * Hh;
  const k1 = spec.view.distortion;
  const px = W / 640;
  const maps = remember(cache ? cache.maps : SCRATCH_MAPS, `${W}x${Hh}:${k1}`, 4, () => undistortMaps(k1, W, Hh));
  if (LAYER.length < n * 4) LAYER = new Float32Array(n * 4);
  if (LINEAR.length < n * 3) LINEAR = new Float32Array(n * 3);
  const layer = LAYER;
  layer.fill(0, 0, n * 4);
  const target: RenderTarget = { width: W, height: Hh, ux: maps.ux, uy: maps.uy, margin: Math.ceil(Math.abs(k1) * Math.hypot(W, Hh) * 0.5) + 1, layer };

  // Only sequences show the same background twice; single scenes paint into a reused buffer.
  if (BACKGROUND.length < n * 3) BACKGROUND = new Float32Array(n * 3);
  const background =
    cache && spec.tier === 'sequence'
      ? remember(cache.backgrounds, JSON.stringify([spec.background, W, Hh, k1]), 3, () => renderBackground(spec.background, target, new Float32Array(n * 3)))
      : renderBackground(spec.background, target, BACKGROUND);

  clock = lap('background', clock);
  const model = spec.guitar ? spec.guitar.model : neckModel('steel');
  const flipX = spec.leftHanded !== spec.mirrored;
  const pinhole = viewHomography(spec.view, model, W, Hh, flipX, !spec.bassSideUp);
  const people: PeopleContext = { t: target, H: pinhole, focal: focalLengthPx(spec.view.fovDeg, W), model, lightX: spec.lighting.lightX, lightY: spec.lighting.lightY, seed: spec.background.seed ^ 0x6b43 };

  if (spec.person) drawPerson(people, spec.person, spec.hand);
  clock = lap('person', clock);
  if (spec.guitar) {
    drawGuitar(target, spec.guitar, pinhole, {
      x: spec.lighting.lightX,
      y: spec.lighting.lightY,
      tanYaw: Math.tan((spec.view.yawDeg * Math.PI) / 180),
      tanPitch: Math.tan((spec.view.pitchDeg * Math.PI) / 180),
    });
  }
  clock = lap('guitar', clock);
  if (spec.person?.pickArm) drawPickingArm(people, spec.person);
  if (spec.hand) drawFrettingHand(people, spec.hand, spec.person);
  if (spec.occluder) drawOccluder(target, spec.occluder, spec.seed ^ 0x77aa);

  clock = lap('hands', clock);
  // Lighting and composite into linear RGB.
  const linear = LINEAR;
  const light = spec.lighting;
  const bgGain = (1 + 1.6 * light.backlight) * light.gain;
  const subjectGain = (1 - 0.72 * light.backlight) * light.gain;
  const tR = light.temperature < 0 ? 1 - 0.28 * light.temperature : 1 - 0.2 * light.temperature;
  const tB = light.temperature < 0 ? 1 + 0.38 * light.temperature : 1 + 0.25 * light.temperature;
  const ga = (light.gradientAngleDeg * Math.PI) / 180;
  const gdx = (Math.cos(ga) * light.gradientStrength) / (W / 2);
  const gdy = (Math.sin(ga) * light.gradientStrength) / (W / 2);
  const cx = W / 2;
  const cy = Hh / 2;
  const vig = spec.camera.vignette / (cx * cx + cy * cy);
  for (let y = 0; y < Hh; y++) {
    const dy = y + 0.5 - cy;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dx = x + 0.5 - cx;
      let k = 1 + dx * gdx + dy * gdy;
      if (k < 0.2) k = 0.2;
      k *= 1 - vig * (dx * dx + dy * dy);
      const a = layer[i * 4 + 3];
      const kb = k * bgGain * (1 - a);
      const ks = k * subjectGain;
      linear[i * 3] = (background[i * 3] * kb + layer[i * 4] * ks) * tR;
      linear[i * 3 + 1] = background[i * 3 + 1] * kb + layer[i * 4 + 1] * ks;
      linear[i * 3 + 2] = (background[i * 3 + 2] * kb + layer[i * 4 + 2] * ks) * tB;
    }
  }
  clock = lap('composite', clock);
  gaussianBlur(linear, W, Hh, 3, spec.camera.defocus * px);
  motionBlur(linear, W, Hh, spec.camera.motionBlur * px, spec.camera.motionAngleDeg);
  clock = lap('blur', clock);
  const frame = exposeToFrame(linear, W, Hh, spec.camera.noise, spec.camera.shot, spec.noiseSeed);
  clock = lap('sensor', clock);
  compressBlocks(frame, spec.camera.quality);
  lap('compress', clock);
  return frame;
}

function buildTruth(spec: SceneSpec, pinhole: Mat3): SceneTruth {
  const description = describeScene(spec);
  const baseHints: DetectOptions = { bassSideUp: spec.bassSideUp, mirrored: spec.mirrored, leftHanded: spec.leftHanded };
  if (!spec.guitar) {
    return { pose: null, hints: baseHints, nutVisible: false, numberingObservable: false, handFrets: null, occluded: false, distortionResidualPx: 0, description };
  }
  const g = spec.guitar;
  const model = g.model;
  const W = spec.width;
  const Hh = spec.height;
  const fit = fitTruthHomography(pinhole, spec.view.distortion, model, W, Hh);
  const pose = makePose(fit.H, model, W, Hh, { confidence: 1, mirrored: spec.mirrored, leftHanded: spec.leftHanded, numbering: 'nut', numberingConfidence: 1 });
  const vis = pose.visibleFrets;
  const handFrets: FretRange | null = spec.hand && spec.hand.lift < 0.5 ? (() => {
    const lay = layoutHand(spec.hand as NonNullable<typeof spec.hand>, model);
    return { min: lay.minFret, max: lay.maxFret };
  })() : null;

  let occluded = false;
  if (spec.occluder && vis.max >= vis.min) {
    const sdf = occluderSdf(spec.occluder, W, Hh);
    let hidden = 0;
    let total = 0;
    for (let f = vis.min; f <= vis.max; f++) {
      const p = applyHomography(pinhole, fretX(model, f), model.nutWidth / 2);
      total++;
      if (sdf(p.x, p.y) < 0) hidden++;
    }
    occluded = hidden >= 0.7 * total;
  }

  const covered = (cell: number): boolean => handFrets !== null && cell >= handFrets.min + 1 && cell <= handFrets.max;
  const nutVisible = vis.max >= vis.min && vis.min === 0 && !(handFrets !== null && handFrets.min === 0) && !occluded;
  let twelfth = false;
  let others = 0;
  if (g.inlays !== 'none') {
    for (const f of INLAY_FRETS) {
      if (f > model.fretCount || f - 1 < vis.min || f > vis.max || covered(f)) continue;
      if (f === 12) twelfth = true;
      else others++;
    }
  }
  const hints: DetectOptions = { ...baseHints, model: g.kind };
  if (g.stickers) hints.markers = { frets: [...g.stickers.frets], placement: g.stickers.placement, hue: g.stickers.hue };
  // Residual of the truth homography against the exact lens model (0 without distortion).
  let residual = fit.residualPx;
  if (!Number.isFinite(residual)) {
    const a = applyHomography(pinhole, fretX(model, Math.max(0, vis.min)), model.nutWidth / 2);
    const d = distortPoint(spec.view.distortion, W, Hh, a.x, a.y);
    residual = Math.hypot(d.x - a.x, d.y - a.y);
  }
  return {
    pose,
    hints,
    nutVisible,
    numberingObservable: !occluded && (nutVisible || (twelfth && others >= 1) || g.stickers !== null),
    handFrets,
    occluded,
    distortionResidualPx: residual,
    description,
  };
}
