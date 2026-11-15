/**
 * Frame sequences for tracking tests: one scene whose guitar moves smoothly (sway, tilt changes,
 * slow drift), with the events a tracker has to survive: a fast jerk with motion blur, the hand
 * sliding along the neck and leaving, a brief full occlusion, the nut drifting out of the frame.
 */
import { applyHomography, computeVisibleFrets, fretX } from '../geometry';
import { viewHomography, type ViewSpec } from './camera';
import { Rng, smoothstep } from './rng';
import { sampleScene, srgb, type SceneSpec, type Tier } from './scene';

/** The built-in tracking sequences. */
export const SEQUENCE_NAMES = ['still', 'sway', 'hand-slide', 'jerk', 'occlusion', 'nut-exit', 'clutter'] as const;
/** Name of a built-in sequence. */
export type SequenceName = (typeof SEQUENCE_NAMES)[number];

/** A renderable sequence: one `SceneSpec` per frame plus what the harness needs to score it. */
export interface Sequence {
  name: SequenceName;
  fps: number;
  frames: SceneSpec[];
  /** still[i] is true when the guitar did not move between frame i-1 and frame i (jitter is measured there). */
  still: boolean[];
  /** What this sequence is meant to exercise. */
  description: string;
}

interface Recipe {
  tier: Tier;
  seed: number;
  description: string;
  /** Sway amplitude multiplier (0 = perfectly still). */
  sway: number;
  /** Slow tilt change amplitude in degrees. */
  tilt: number;
  /** Slow drift across the frame over the whole sequence, as a fraction of the frame width. */
  drift: number;
  jerks: number;
  hand: 'keep' | 'slide' | 'none';
  occlusion: boolean;
  nutExit: boolean;
}

const RECIPES: Record<SequenceName, Recipe> = {
  still: { tier: 'medium', seed: 101, description: 'guitar perfectly still, only sensor noise changes (jitter)', sway: 0, tilt: 0, drift: 0, jerks: 0, hand: 'keep', occlusion: false, nutExit: false },
  sway: { tier: 'medium', seed: 102, description: 'gentle sway, tilt changes and slow drift', sway: 1, tilt: 6, drift: 0.05, jerks: 0, hand: 'keep', occlusion: false, nutExit: false },
  'hand-slide': { tier: 'medium', seed: 103, description: 'hand slides up and down the neck, then leaves', sway: 0.7, tilt: 3, drift: 0, jerks: 0, hand: 'slide', occlusion: false, nutExit: false },
  jerk: { tier: 'medium', seed: 104, description: 'sway with two fast jerks (motion blur)', sway: 1, tilt: 4, drift: 0, jerks: 2, hand: 'keep', occlusion: false, nutExit: false },
  occlusion: { tier: 'medium', seed: 105, description: 'something sweeps across the camera: brief full occlusion, then recovery', sway: 0.8, tilt: 3, drift: 0.02, jerks: 0, hand: 'keep', occlusion: true, nutExit: false },
  'nut-exit': { tier: 'medium', seed: 106, description: 'the nut drifts out of the frame; numbering must be kept', sway: 0.6, tilt: 3, drift: 0, jerks: 0, hand: 'keep', occlusion: false, nutExit: true },
  clutter: { tier: 'hard', seed: 107, description: 'cluttered room, striped shirt, sway and strong tilt changes', sway: 1.2, tilt: 9, drift: 0.04, jerks: 1, hand: 'slide', occlusion: false, nutExit: false },
};

/** The first scene at or after `seed` that suits the recipe (a hand to slide, a nut that can leave, ...). */
function pickBase(recipe: Recipe, seed: number): SceneSpec {
  let fallback: SceneSpec | null = null;
  for (let k = 0; k < 60; k++) {
    const spec = sampleScene(recipe.tier, seed + k);
    fallback = fallback ?? spec;
    const g = spec.guitar;
    if (!g || !spec.bassSideUp || !spec.hand) continue;
    const Hm = viewHomography(spec.view, g.model, 640, 360, spec.leftHanded !== spec.mirrored, false);
    const vis = computeVisibleFrets(Hm, g.model, 640, 360, 8);
    if (vis.max - vis.min < 9) continue;
    if (recipe.nutExit && (vis.min !== 0 || spec.hand.position < 3)) continue;
    if (recipe.hand === 'slide' && (spec.hand.position > 6 || vis.max < spec.hand.position + 6 || spec.hand.position - 3 < vis.min)) continue;
    return spec;
  }
  return fallback as SceneSpec;
}

/** Options for `buildSequence`. */
export interface SequenceOptions {
  /** Number of frames (default 40; 30 for 'still'). */
  frames?: number;
  /** Replace the recipe's scene seed to get a different scene with the same choreography. */
  seed?: number;
  /** Shift the recipe's scene seed instead (0 = the standard sequence): held-out variants of every sequence. */
  seedOffset?: number;
}

/** Build a tracking sequence. Deterministic for a given name and options. */
export function buildSequence(name: SequenceName, options: SequenceOptions = {}): Sequence {
  const recipe = RECIPES[name];
  const fps = 30;
  const count = options.frames ?? (name === 'still' ? 30 : 40);
  const sceneSeed = options.seed ?? recipe.seed + (options.seedOffset ?? 0);
  const base = pickBase(recipe, sceneSeed);
  // Sequences are always 640x360 with a visible hand and no canned motion blur of their own.
  const scale = 1;
  base.width = 640;
  base.height = 360;
  base.tier = 'sequence';
  base.label = name;
  base.camera.motionBlur = 0;
  base.camera.defocus = Math.min(base.camera.defocus, 1.0);
  base.lighting.backlight = Math.min(base.lighting.backlight, 0.25);
  if (recipe.tier === 'hard' && base.person) {
    base.person.stripes = base.person.stripes ?? { color: srgb(236, 232, 220), periodMm: 26 };
    base.background.kind = 'clutter';
  }
  const rng = new Rng((sceneSeed * 2654435761) >>> 0).fork(name);
  const model = base.guitar ? base.guitar.model : null;
  if (!model) throw new Error('sequence base scene has no guitar');
  const flipX = base.leftHanded !== base.mirrored;

  // Smooth motion: a few slow sinusoids per parameter.
  const phase = (): number => rng.range(0, Math.PI * 2);
  const osc = { u: [rng.range(0.3, 0.6), phase()], v: [rng.range(0.3, 0.7), phase()], roll: [rng.range(0.25, 0.5), phase()], yaw: [rng.range(0.15, 0.3), phase()], pitch: [rng.range(0.15, 0.3), phase()], zoom: [rng.range(0.1, 0.25), phase()] };
  const jerkAt: number[] = [];
  for (let j = 0; j < recipe.jerks; j++) jerkAt.push(Math.round(((j + 1) * count) / (recipe.jerks + 1)) + rng.int(-2, 2));
  const jerkDir = jerkAt.map(() => ({ u: rng.range(0.05, 0.08) * (rng.chance(0.5) ? 1 : -1), v: rng.range(-0.04, 0.04), roll: rng.range(-5, 5) }));
  const occStart = Math.round(count * 0.35);
  const occLength = Math.max(10, Math.round(count * 0.4));
  const occColor = rng.pick([srgb(200, 150, 114), srgb(40, 44, 54), srgb(230, 226, 214), srgb(124, 84, 58)]);
  const occDir: 1 | -1 = rng.chance(0.5) ? 1 : -1;

  // For 'nut-exit': how far the framing must slide (in frame fractions) to push the nut out.
  let exitU = 0;
  let exitV = 0;
  if (recipe.nutExit) {
    const Hm = viewHomography(base.view, model, base.width, base.height, flipX, !base.bassSideUp);
    const yc = model.nutWidth / 2;
    const nut = applyHomography(Hm, 0, yc);
    const far = applyHomography(Hm, fretX(model, 12), yc);
    let dx = nut.x - far.x;
    let dy = nut.y - far.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const tx = dx > 1e-6 ? (base.width - nut.x) / dx : dx < -1e-6 ? -nut.x / dx : Infinity;
    const ty = dy > 1e-6 ? (base.height - nut.y) / dy : dy < -1e-6 ? -nut.y / dy : Infinity;
    const t = Math.max(0, Math.min(tx, ty)) + 0.14 * base.width;
    // The anchor is placed before the image is flipped, so a shift seen in the final image changes sign with the flip.
    exitU = ((flipX ? -1 : 1) * t * dx) / base.width;
    exitV = (t * dy) / base.height;
  }

  const baseHand = base.hand;
  const handHome = baseHand ? baseHand.position : 5;
  const frames: SceneSpec[] = [];
  const still: boolean[] = [];
  let prevView: ViewSpec | null = null;
  for (let i = 0; i < count; i++) {
    const tSec = i / fps;
    const p = count > 1 ? i / (count - 1) : 0;
    const s = recipe.sway;
    const view: ViewSpec = { ...base.view };
    view.anchorU += s * 0.014 * Math.sin(2 * Math.PI * osc.u[0] * tSec + osc.u[1]) + recipe.drift * (p - 0.5);
    view.anchorV += s * 0.016 * Math.sin(2 * Math.PI * osc.v[0] * tSec + osc.v[1]);
    view.rollDeg += s * 2.2 * Math.sin(2 * Math.PI * osc.roll[0] * tSec + osc.roll[1]);
    view.yawDeg += recipe.tilt * Math.sin(2 * Math.PI * osc.yaw[0] * tSec + osc.yaw[1]);
    view.pitchDeg += recipe.tilt * 0.8 * Math.sin(2 * Math.PI * osc.pitch[0] * tSec + osc.pitch[1]);
    view.pxPerMm *= 1 + s * 0.02 * Math.sin(2 * Math.PI * osc.zoom[0] * tSec + osc.zoom[1]);
    // A jerk: the guitar is yanked across the frame over a few frames and stays there.
    for (let j = 0; j < jerkAt.length; j++) {
      const k = smoothstep(jerkAt[j], jerkAt[j] + 4, i);
      view.anchorU += jerkDir[j].u * k * (j % 2 === 0 ? 1 : -1);
      view.anchorV += jerkDir[j].v * k;
      view.rollDeg += jerkDir[j].roll * k;
    }
    if (recipe.nutExit) {
      const k = smoothstep(count * 0.2, count * 0.6, i);
      view.anchorU += exitU * k;
      view.anchorV += exitV * k;
    }
    const spec: SceneSpec = {
      ...base,
      view,
      camera: { ...base.camera },
      hand: baseHand ? { ...baseHand } : null,
      occluder: null,
      noiseSeed: (base.noiseSeed + i * 7919) >>> 0,
      seed: base.seed * 1000 + i,
    };
    if (spec.hand && recipe.hand === 'slide') {
      // Up the neck, back down, then off the neck entirely.
      const up = smoothstep(0.1, 0.4, p);
      const down = smoothstep(0.45, 0.7, p);
      spec.hand.position = Math.max(1, handHome + 4 * up - 3 * down);
      spec.hand.lift = smoothstep(0.78, 0.9, p);
      if (p > 0.92) spec.hand = null;
    } else if (recipe.hand === 'none') {
      spec.hand = null;
    }
    if (recipe.occlusion && i >= occStart && i < occStart + occLength) {
      spec.occluder = { color: occColor, progress: (i - occStart + 0.5) / occLength, direction: occDir };
    }
    // Motion blur follows the guitar's image-space velocity (about 60% of the frame time exposed).
    if (prevView) {
      const du = (view.anchorU - prevView.anchorU) * base.width;
      const dv = (view.anchorV - prevView.anchorV) * base.height;
      const speed = Math.hypot(du, dv) * 0.6;
      spec.camera.motionBlur = speed > 1.2 ? speed / scale : 0;
      spec.camera.motionAngleDeg = (Math.atan2(dv, du) * 180) / Math.PI;
    }
    still.push(prevView !== null && recipe.sway === 0 && recipe.tilt === 0 && recipe.drift === 0 && recipe.jerks === 0 && !recipe.nutExit);
    frames.push(spec);
    prevView = view;
  }
  return { name, fps, frames, still, description: recipe.description };
}
