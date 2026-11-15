/**
 * Scene descriptions for the procedural renderer, and the seeded samplers that produce them for
 * each benchmark tier. A `SceneSpec` is plain data and fully determines the rendered frame.
 */
import { NECK_PRESETS, applyHomography, computeVisibleFrets, fretX, neckModel } from '../geometry';
import type { FretRange, NeckModel, NeckPresetId } from '../types';
import { viewHomography, type ViewSpec } from './camera';
import { Rng } from './rng';

/** Linear-light RGB, nominally 0..1 (highlights may exceed 1 and clip in the camera). */
export type Rgb = readonly [number, number, number];

/** Benchmark difficulty tiers. `markers` is the optional sticker-anchor mode. */
export type Tier = 'easy' | 'medium' | 'hard' | 'extreme' | 'markers';

/** One string as drawn. */
export interface StringSpec {
  /** Diameter in mm. */
  diameter: number;
  /** Radiance of the string; plain steel is brighter than 1 where it catches the light. */
  color: Rgb;
  /** Wound strings are darker and textured. */
  wound: boolean;
  /** Opacity (nylon trebles are translucent). */
  alpha: number;
}

/** Two bright stickers for marker mode. */
export interface StickerSpec {
  frets: [number, number];
  placement: 'bass-edge' | 'treble-edge' | 'board';
  color: Rgb;
  /** Approximate hue in degrees, passed to the detector as a hint. */
  hue: number;
  /** Side length in mm. */
  size: number;
}

/** Everything about the instrument. */
export interface GuitarSpec {
  kind: NeckPresetId;
  /** True dimensions (jittered around the preset; the detector only gets the preset id). */
  model: NeckModel;
  board: 'rosewood' | 'ebony' | 'maple';
  inlays: 'dots' | 'blocks' | 'none';
  binding: boolean;
  nut: 'bone' | 'black';
  headstock: 'three-a-side' | 'six-in-line' | 'slotted';
  headColor: Rgb;
  neckColor: Rgb;
  bodyStyle: 'natural' | 'sunburst' | 'solid';
  bodyColor: Rgb;
  pickguard: Rgb | null;
  pickups: 'none' | 'single' | 'humbucker';
  /** Fret wire width in mm. */
  fretWidth: number;
  /** 0..1 strength of the specular ridge on the frets. */
  fretShine: number;
  /** 0..1 finger wear on the first positions. */
  wear: number;
  /** 0..1 strength of specular glints on strings and frets. */
  glint: number;
  /** Index 0 = string 1 (treble). */
  strings: StringSpec[];
  stickers: StickerSpec | null;
  /** Seed of the wood grain and other fixed textures. */
  textureSeed: number;
}

/** The fretting hand. Positions are in fret cells and may be fractional while the hand slides. */
export interface HandSpec {
  skin: Rgb;
  /** Cell under the index finger. */
  position: number;
  shape: 'scale' | 'chord' | 'barre';
  /** Fingertip targets, index finger first: cells relative to `position`, and string numbers. */
  fingers: { fretOffset: number; string: number }[];
  /** Thumb peeking over the bass edge. */
  thumb: boolean;
  /** 0 = pressed on the neck, 1 = lifted clear of the board (used when the hand leaves). */
  lift: number;
}

/** The player behind the guitar. */
export interface PersonSpec {
  skin: Rgb;
  shirt: Rgb;
  /** Horizontal shirt stripes (a classic source of false parallel lines). */
  stripes: { color: Rgb; periodMm: number } | null;
  longSleeves: boolean;
  head: boolean;
  hair: Rgb;
  /** Draw the picking arm over the body. */
  pickArm: boolean;
  /** Sideways lean of the torso in degrees. */
  leanDeg: number;
}

/** What is behind the player. The actual shapes are generated from `seed` at render time. */
export interface BackgroundSpec {
  kind: 'plain' | 'gradient' | 'room' | 'clutter';
  seed: number;
  base: Rgb;
  /** Gaussian blur of the background in pixels at 640 wide (it is usually a little out of focus). */
  blur: number;
  /** Fret-like decoys to plant: uniformly spaced bars that are NOT a fretboard. */
  decoys: ('ladder' | 'keyboard' | 'blinds' | 'radiator' | 'books' | 'ruler')[];
}

/** Scene lighting. */
export interface LightingSpec {
  /** Overall exposure. */
  gain: number;
  /** -1 = warm tungsten ... +1 = cold daylight. */
  temperature: number;
  /** Brightness ramp across the frame: direction and strength (0 = flat). */
  gradientAngleDeg: number;
  gradientStrength: number;
  /** 0..1: bright background, dark subject. */
  backlight: number;
  /** Unit-ish direction the key light comes from in the image (x right, y down). */
  lightX: number;
  lightY: number;
}

/** Imperfections of the camera. Pixel quantities are for a 640-pixel-wide frame. */
export interface CameraFxSpec {
  /** Defocus blur sigma in pixels. */
  defocus: number;
  /** Motion blur length in pixels (0 = none) and direction. */
  motionBlur: number;
  motionAngleDeg: number;
  /** Read noise sigma (linear 0..1 units). */
  noise: number;
  /** Shot noise: extra sigma at full-scale signal (its variance grows linearly with the signal). */
  shot: number;
  /** JPEG-style 8x8 block quantisation quality, 1..100 (100 = off). */
  quality: number;
  /** Corner darkening 0..1. */
  vignette: number;
}

/** A large object passing in front of the camera (sequence event). */
export interface OccluderSpec {
  color: Rgb;
  /** 0..1 fraction of the frame width it has swept across. */
  progress: number;
  /** Sweep direction: +1 left to right, -1 right to left. */
  direction: 1 | -1;
}

/** A complete scene. `guitar: null` is a negative frame. */
export interface SceneSpec {
  tier: Tier | 'negative' | 'sequence';
  seed: number;
  width: number;
  height: number;
  guitar: GuitarSpec | null;
  view: ViewSpec;
  mirrored: boolean;
  leftHanded: boolean;
  bassSideUp: boolean;
  hand: HandSpec | null;
  person: PersonSpec | null;
  background: BackgroundSpec;
  lighting: LightingSpec;
  camera: CameraFxSpec;
  occluder: OccluderSpec | null;
  /** Seed of the per-frame sensor noise. */
  noiseSeed: number;
  /** Free-form tag for negatives ("empty", "striped", "keyboard", ...). */
  label: string;
}

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------

function lin(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Linear RGB from 8-bit sRGB components. */
export function srgb(r: number, g: number, b: number): Rgb {
  return [lin(r), lin(g), lin(b)];
}

/** Scale a colour. */
export function scaleRgb(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** Blend two colours. */
export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Skin tones from very light to very dark. */
export const SKIN_TONES: readonly Rgb[] = [srgb(241, 208, 185), srgb(226, 182, 152), srgb(200, 150, 114), srgb(168, 118, 84), srgb(124, 84, 58), srgb(82, 56, 42)];

const WALLS: readonly Rgb[] = [srgb(226, 222, 212), srgb(205, 200, 190), srgb(180, 188, 196), srgb(214, 200, 176), srgb(150, 158, 150), srgb(196, 176, 168), srgb(120, 124, 132), srgb(232, 232, 228), srgb(88, 92, 104), srgb(168, 184, 170)];
const SHIRTS: readonly Rgb[] = [srgb(40, 44, 54), srgb(200, 200, 204), srgb(52, 78, 128), srgb(128, 42, 46), srgb(58, 100, 72), srgb(230, 226, 214), srgb(96, 96, 100), srgb(190, 150, 60), srgb(110, 70, 120), srgb(24, 24, 26)];
const HAIR: readonly Rgb[] = [srgb(28, 22, 18), srgb(70, 46, 28), srgb(130, 96, 56), srgb(190, 160, 110), srgb(120, 120, 122), srgb(96, 40, 24)];
const BODY_SOLIDS: readonly Rgb[] = [srgb(18, 18, 20), srgb(150, 24, 28), srgb(232, 228, 210), srgb(36, 70, 130), srgb(40, 110, 100), srgb(214, 170, 60), srgb(222, 132, 140)];
const STICKERS: readonly (readonly [Rgb, number])[] = [
  [srgb(40, 240, 90), 135],
  [srgb(255, 50, 210), 315],
  [srgb(30, 220, 255), 190],
  [srgb(255, 150, 20), 30],
];

// ---------------------------------------------------------------------------------------------
// Tier parameters
// ---------------------------------------------------------------------------------------------

interface TierParams {
  sizes: readonly (readonly [readonly [number, number], number])[];
  kinds: readonly (readonly [NeckPresetId, number])[];
  maple: number;
  inlays: readonly (readonly ['dots' | 'blocks' | 'none', number])[];
  modelJitter: number;
  roll: readonly [number, number];
  yaw: readonly [number, number];
  pitch: readonly [number, number];
  maxOffNormal: number;
  span: readonly [number, number];
  anchorFret: readonly [number, number];
  nutVisible: number;
  minVisibleFrets: number;
  hand: number;
  thumb: number;
  barre: number;
  person: number;
  stripes: number;
  pickArm: number;
  backgrounds: readonly (readonly [BackgroundSpec['kind'], number])[];
  decoy: number;
  bgBlur: readonly [number, number];
  gain: readonly [number, number];
  warm: number;
  gradient: readonly [number, number];
  backlight: readonly [number, number];
  backlightChance: number;
  glint: readonly [number, number];
  wear: readonly [number, number];
  defocus: readonly [number, number];
  motion: number;
  motionLength: readonly [number, number];
  noise: readonly [number, number];
  quality: readonly [number, number];
  vignette: readonly [number, number];
  distortion: readonly [number, number];
  leftHanded: number;
  mirrored: number;
  bassDown: number;
}

const SIZE_480: readonly [number, number] = [480, 270];
const SIZE_640: readonly [number, number] = [640, 360];
const SIZE_960: readonly [number, number] = [960, 540];
const SIZE_1280: readonly [number, number] = [1280, 720];

const TIER_PARAMS: Record<Tier, TierParams> = {
  easy: {
    sizes: [[SIZE_640, 1]],
    kinds: [['steel', 1], ['electric', 1]],
    maple: 0,
    inlays: [['dots', 1]],
    modelJitter: 0.3,
    roll: [-6, 12],
    yaw: [-8, 8],
    pitch: [0, 9],
    maxOffNormal: 12,
    span: [0.55, 0.75],
    anchorFret: [6, 8],
    nutVisible: 1,
    minVisibleFrets: 10,
    hand: 0,
    thumb: 0,
    barre: 0,
    person: 0,
    stripes: 0,
    pickArm: 0,
    backgrounds: [['plain', 3], ['gradient', 1]],
    decoy: 0,
    bgBlur: [0, 0.5],
    gain: [0.9, 1.1],
    warm: 0.3,
    gradient: [0, 0.08],
    backlight: [0, 0],
    backlightChance: 0,
    glint: [0.05, 0.25],
    wear: [0, 0.2],
    defocus: [0.45, 0.65],
    motion: 0,
    motionLength: [0, 0],
    noise: [0.003, 0.006],
    quality: [88, 95],
    vignette: [0, 0.08],
    distortion: [0, 0],
    leftHanded: 0,
    mirrored: 0.25,
    bassDown: 0,
  },
  medium: {
    sizes: [[SIZE_640, 5], [SIZE_960, 1]],
    kinds: [['steel', 45], ['electric', 40], ['classical', 15]],
    maple: 0.3,
    inlays: [['dots', 75], ['blocks', 10], ['none', 15]],
    modelJitter: 1,
    roll: [-5, 25],
    yaw: [-15, 25],
    pitch: [0, 25],
    maxOffNormal: 32,
    span: [0.45, 0.9],
    anchorFret: [5, 9],
    nutVisible: 0.75,
    minVisibleFrets: 8,
    hand: 0.85,
    thumb: 0.4,
    barre: 0.15,
    person: 0.95,
    stripes: 0.1,
    pickArm: 0.7,
    backgrounds: [['room', 7], ['plain', 2], ['gradient', 1]],
    decoy: 0.05,
    bgBlur: [0.6, 1.5],
    gain: [0.75, 1.2],
    warm: 0.6,
    gradient: [0, 0.35],
    backlight: [0, 0.2],
    backlightChance: 0.3,
    glint: [0.2, 0.6],
    wear: [0, 0.6],
    defocus: [0.55, 1.0],
    motion: 0.15,
    motionLength: [2, 4],
    noise: [0.006, 0.015],
    quality: [60, 85],
    vignette: [0.1, 0.25],
    distortion: [-0.006, 0],
    leftHanded: 0.1,
    mirrored: 0.3,
    bassDown: 0,
  },
  hard: {
    sizes: [[SIZE_640, 14], [SIZE_960, 3], [SIZE_1280, 1], [SIZE_480, 2]],
    kinds: [['steel', 40], ['electric', 40], ['classical', 20]],
    maple: 0.4,
    inlays: [['dots', 60], ['blocks', 15], ['none', 25]],
    modelJitter: 1,
    roll: [-15, 35],
    yaw: [-25, 40],
    pitch: [0, 35],
    maxOffNormal: 48,
    span: [0.4, 1.15],
    anchorFret: [4, 11],
    nutVisible: 0.5,
    minVisibleFrets: 7,
    hand: 0.95,
    thumb: 0.6,
    barre: 0.3,
    person: 1,
    stripes: 0.45,
    pickArm: 0.85,
    backgrounds: [['clutter', 65], ['room', 35]],
    decoy: 0.35,
    bgBlur: [0.3, 1.2],
    gain: [0.6, 1.3],
    warm: 0.6,
    gradient: [0.2, 0.6],
    backlight: [0.3, 0.6],
    backlightChance: 0.3,
    glint: [0.4, 1],
    wear: [0.2, 1],
    defocus: [0.7, 1.5],
    motion: 0.45,
    motionLength: [3, 7],
    noise: [0.01, 0.03],
    quality: [40, 75],
    vignette: [0.15, 0.35],
    distortion: [-0.012, 0],
    leftHanded: 0.15,
    mirrored: 0.4,
    bassDown: 0,
  },
  extreme: {
    sizes: [[SIZE_640, 65], [SIZE_480, 35]],
    kinds: [['steel', 40], ['electric', 40], ['classical', 20]],
    maple: 0.4,
    inlays: [['dots', 50], ['blocks', 15], ['none', 35]],
    modelJitter: 1,
    roll: [-25, 40],
    yaw: [-35, 50],
    pitch: [-5, 40],
    maxOffNormal: 55,
    span: [0.35, 1.3],
    anchorFret: [3, 12],
    nutVisible: 0.35,
    minVisibleFrets: 6,
    hand: 0.95,
    thumb: 0.6,
    barre: 0.35,
    person: 1,
    stripes: 0.5,
    pickArm: 0.9,
    backgrounds: [['clutter', 75], ['room', 25]],
    decoy: 0.6,
    bgBlur: [0.2, 1.0],
    gain: [0.45, 1.45],
    warm: 0.6,
    gradient: [0.3, 0.8],
    backlight: [0.45, 0.8],
    backlightChance: 0.5,
    glint: [0.5, 1],
    wear: [0.3, 1],
    defocus: [1.0, 1.8],
    motion: 0.5,
    motionLength: [5, 10],
    noise: [0.018, 0.04],
    quality: [25, 50],
    vignette: [0.2, 0.45],
    distortion: [-0.016, -0.003],
    leftHanded: 0.15,
    mirrored: 0.4,
    bassDown: 0.1,
  },
  // Marker mode: hard scenes with two stickers at known frets and the nut usually out of view.
  markers: {
    sizes: [[SIZE_640, 1]],
    kinds: [['steel', 40], ['electric', 40], ['classical', 20]],
    maple: 0.4,
    inlays: [['dots', 40], ['none', 60]],
    modelJitter: 1,
    roll: [-15, 35],
    yaw: [-25, 40],
    pitch: [0, 35],
    maxOffNormal: 48,
    span: [0.45, 1.15],
    anchorFret: [5, 10],
    nutVisible: 0.25,
    minVisibleFrets: 7,
    hand: 0.9,
    thumb: 0.5,
    barre: 0.3,
    person: 1,
    stripes: 0.45,
    pickArm: 0.85,
    backgrounds: [['clutter', 65], ['room', 35]],
    decoy: 0.35,
    bgBlur: [0.3, 1.2],
    gain: [0.6, 1.3],
    warm: 0.6,
    gradient: [0.2, 0.6],
    backlight: [0.3, 0.6],
    backlightChance: 0.25,
    glint: [0.4, 1],
    wear: [0.2, 1],
    defocus: [0.7, 1.5],
    motion: 0.4,
    motionLength: [3, 7],
    noise: [0.01, 0.03],
    quality: [40, 75],
    vignette: [0.15, 0.35],
    distortion: [-0.012, 0],
    leftHanded: 0.15,
    mirrored: 0.4,
    bassDown: 0,
  },
};

// ---------------------------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------------------------

const SCALE_LENGTHS: Record<NeckPresetId, readonly number[]> = {
  steel: [632, 645, 645, 648, 650],
  electric: [628, 635, 648, 648, 648],
  classical: [640, 650, 650, 650, 660],
};

function sampleModel(kind: NeckPresetId, rng: Rng, jitter: number): NeckModel {
  const base = NECK_PRESETS[kind];
  if (jitter <= 0) return neckModel(kind);
  const nutWidth = base.nutWidth + rng.range(-1.5, 1.5) * jitter;
  // Real necks differ more in overall width than in taper, so the 12th-fret width follows the nut width.
  const width12 = nutWidth + (base.width12 - base.nutWidth) + rng.range(-1.2, 1.2) * jitter;
  const fretCount = kind === 'electric' ? rng.pick([21, 22, 22, 24]) : kind === 'steel' ? rng.pick([20, 20, 21]) : 19;
  return {
    preset: 'custom',
    scaleLength: jitter >= 1 ? rng.pick(SCALE_LENGTHS[kind]) : base.scaleLength,
    nutWidth,
    width12,
    stringSpanNut: nutWidth - (base.nutWidth - base.stringSpanNut) + rng.range(-0.7, 0.7) * jitter,
    stringSpanBridge: base.stringSpanBridge + rng.range(-1.5, 1.5) * jitter,
    stringCount: 6,
    fretCount,
    bodyJoinFret: kind === 'steel' && jitter >= 1 && rng.chance(0.2) ? 12 : base.bodyJoinFret,
  };
}

function sampleStrings(kind: NeckPresetId, rng: Rng): StringSpec[] {
  // Listed from string 1 (treble) to string 6 (bass).
  if (kind === 'classical') {
    const nylon = srgb(228, 224, 210);
    const silver = scaleRgb(srgb(196, 196, 192), rng.range(0.8, 1.1));
    return [
      { diameter: 0.71, color: nylon, wound: false, alpha: 0.6 },
      { diameter: 0.82, color: nylon, wound: false, alpha: 0.6 },
      { diameter: 1.02, color: nylon, wound: false, alpha: 0.65 },
      { diameter: 0.76, color: silver, wound: true, alpha: 1 },
      { diameter: 0.89, color: silver, wound: true, alpha: 1 },
      { diameter: 1.09, color: silver, wound: true, alpha: 1 },
    ];
  }
  const steel = scaleRgb(srgb(222, 222, 218), rng.range(1.2, 2.2));
  if (kind === 'steel') {
    const bronze = scaleRgb(srgb(184, 142, 78), rng.range(0.75, 1.15));
    return [
      { diameter: 0.3, color: steel, wound: false, alpha: 1 },
      { diameter: 0.41, color: steel, wound: false, alpha: 1 },
      { diameter: 0.61, color: bronze, wound: true, alpha: 1 },
      { diameter: 0.81, color: bronze, wound: true, alpha: 1 },
      { diameter: 1.07, color: bronze, wound: true, alpha: 1 },
      { diameter: 1.35, color: bronze, wound: true, alpha: 1 },
    ];
  }
  const nickel = scaleRgb(srgb(160, 160, 156), rng.range(0.75, 1.15));
  return [
    { diameter: 0.25, color: steel, wound: false, alpha: 1 },
    { diameter: 0.33, color: steel, wound: false, alpha: 1 },
    { diameter: 0.43, color: steel, wound: false, alpha: 1 },
    { diameter: 0.66, color: nickel, wound: true, alpha: 1 },
    { diameter: 0.91, color: nickel, wound: true, alpha: 1 },
    { diameter: 1.17, color: nickel, wound: true, alpha: 1 },
  ];
}

function sampleGuitar(p: TierParams, rng: Rng, withStickers: boolean): GuitarSpec {
  const kind = rng.weighted(p.kinds);
  const model = sampleModel(kind, rng.fork('model'), p.modelJitter);
  const board: GuitarSpec['board'] = kind === 'electric' && rng.chance(p.maple) ? 'maple' : rng.chance(0.25) ? 'ebony' : 'rosewood';
  const inlays: GuitarSpec['inlays'] = kind === 'classical' ? 'none' : rng.weighted(p.inlays);
  const headstock: GuitarSpec['headstock'] = kind === 'classical' ? 'slotted' : kind === 'electric' && rng.chance(0.6) ? 'six-in-line' : 'three-a-side';
  const maple = srgb(206, 166, 108);
  const mahogany = srgb(112, 66, 42);
  const neckColor = board === 'maple' || rng.chance(0.35) ? maple : rng.chance(0.2) ? srgb(26, 24, 24) : mahogany;
  const bodyStyle: GuitarSpec['bodyStyle'] = kind === 'electric' ? (rng.chance(0.35) ? 'sunburst' : 'solid') : rng.chance(0.2) ? 'sunburst' : rng.chance(0.12) ? 'solid' : 'natural';
  const natural = rng.pick([srgb(224, 188, 128), srgb(214, 172, 108), srgb(196, 150, 92), srgb(150, 92, 56)]);
  const sticker = rng.pick(STICKERS);
  return {
    kind,
    model,
    board,
    inlays,
    binding: kind !== 'classical' && rng.chance(0.3),
    nut: rng.chance(0.8) ? 'bone' : 'black',
    headstock,
    headColor: headstock === 'six-in-line' ? neckColor : rng.pick([srgb(22, 20, 20), srgb(52, 32, 24), neckColor]),
    neckColor,
    bodyStyle,
    bodyColor: bodyStyle === 'natural' ? natural : bodyStyle === 'sunburst' ? srgb(214, 150, 50) : rng.pick(BODY_SOLIDS),
    pickguard: kind === 'electric' ? rng.pick([srgb(236, 234, 226), srgb(20, 20, 22), srgb(96, 44, 30), null]) : kind === 'steel' && rng.chance(0.6) ? srgb(34, 20, 16) : null,
    pickups: kind === 'electric' ? (rng.chance(0.55) ? 'single' : 'humbucker') : 'none',
    fretWidth: kind === 'classical' ? rng.range(1.9, 2.2) : rng.range(2.0, 2.9),
    fretShine: rng.range(0.5, 1),
    wear: rng.range(p.wear[0], p.wear[1]),
    glint: rng.range(p.glint[0], p.glint[1]),
    strings: sampleStrings(kind, rng.fork('strings')),
    stickers: withStickers
      ? { frets: rng.pick([[3, 9], [5, 12], [3, 12], [7, 12], [5, 9]] as [number, number][]), placement: rng.pick(['bass-edge', 'bass-edge', 'treble-edge'] as const), color: sticker[0], hue: sticker[1], size: rng.range(6, 9) }
      : null,
    textureSeed: rng.seed(),
  };
}

/** Wires 0..fretCount whose midpoint is in the frame, for the pinhole view (distortion ignored). */
function visibleFor(view: ViewSpec, model: NeckModel, width: number, height: number, flipX: boolean, rotate180: boolean): FretRange {
  return computeVisibleFrets(viewHomography(view, model, width, height, flipX, rotate180), model, width, height, 2);
}

function sampleView(p: TierParams, rng: Rng, model: NeckModel, width: number, height: number, flipX: boolean, rotate180: boolean): ViewSpec {
  const wantNut = rng.chance(p.nutVisible);
  // The anchor is placed before the image is flipped / turned: shifts measured in the final image change sign with it.
  const su = flipX !== rotate180 ? -1 : 1;
  const sv = rotate180 ? -1 : 1;
  let best: ViewSpec | null = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 80; attempt++) {
    let roll = rng.range(p.roll[0], p.roll[1]);
    let yaw = rng.range(p.yaw[0], p.yaw[1]);
    let pitch = rng.range(p.pitch[0], p.pitch[1]);
    // Keep the view within the tier's angle off the board normal.
    for (let k = 0; k < 8; k++) {
      const off = (Math.acos(Math.cos((yaw * Math.PI) / 180) * Math.cos((pitch * Math.PI) / 180)) * 180) / Math.PI;
      if (off <= p.maxOffNormal) break;
      yaw *= 0.85;
      pitch *= 0.85;
    }
    if (attempt > 40) roll *= 0.5;
    const view: ViewSpec = {
      fovDeg: rng.range(55, 75),
      rollDeg: roll,
      yawDeg: yaw,
      pitchDeg: pitch,
      pxPerMm: 1,
      anchorFret: rng.range(p.anchorFret[0], p.anchorFret[1]),
      anchorU: rng.range(0.38, 0.62),
      anchorV: rng.range(0.4, 0.6),
      distortion: rng.range(p.distortion[0], p.distortion[1]),
    };
    // Choose the scale so the neck (nut to the 14th fret) spans the wanted fraction of the frame width.
    const target = rng.range(p.span[0], p.span[1]) * width;
    const yc = model.nutWidth / 2;
    for (let k = 0; k < 4; k++) {
      const Hm = viewHomography(view, model, width, height, flipX, rotate180);
      const a = applyHomography(Hm, 0, yc);
      const b = applyHomography(Hm, fretX(model, 14), yc);
      const len = Math.hypot(a.x - b.x, a.y - b.y);
      if (!(len > 1e-6)) break;
      view.pxPerMm *= target / len;
    }
    // Slide the framing so the nut is (or is not) in view, as this scene wants.
    for (let k = 0; k < 2; k++) {
      const Hk = viewHomography(view, model, width, height, flipX, rotate180);
      const nutP = applyHomography(Hk, 0, yc);
      const far = applyHomography(Hk, fretX(model, 12), yc);
      const inside = nutP.x > 0 && nutP.x < width && nutP.y > 0 && nutP.y < height;
      if (wantNut && !inside) {
        const tx = Math.min(width * 0.95, Math.max(width * 0.05, nutP.x));
        const ty = Math.min(height * 0.9, Math.max(height * 0.1, nutP.y));
        view.anchorU += (su * (tx - nutP.x)) / width;
        view.anchorV += (sv * (ty - nutP.y)) / height;
      } else if (!wantNut && inside) {
        // Push the nut out of the frame along the neck direction.
        let dx = nutP.x - far.x;
        let dy = nutP.y - far.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const tx = dx > 1e-6 ? (width - nutP.x) / dx : dx < -1e-6 ? -nutP.x / dx : Infinity;
        const ty = dy > 1e-6 ? (height - nutP.y) / dy : dy < -1e-6 ? -nutP.y / dy : Infinity;
        const t = Math.min(tx, ty) + rng.range(0.04, 0.22) * width;
        view.anchorU += (su * t * dx) / width;
        view.anchorV += (sv * t * dy) / height;
      } else {
        break;
      }
    }
    const vis = visibleFor(view, model, width, height, flipX, rotate180);
    // Count only frets on the neck proper: a view of the body with a sliver of board is not a neck view.
    const count = Math.max(0, Math.min(vis.max, 13) - vis.min + 1);
    const nut = vis.max >= vis.min && vis.min === 0;
    const Hm = viewHomography(view, model, width, height, flipX, rotate180);
    const lo = applyHomography(Hm, fretX(model, Math.max(0, vis.min)), yc);
    const hi = applyHomography(Hm, fretX(model, Math.max(vis.min, vis.max)), yc);
    // The visible stretch of board must be a real part of the picture.
    const wantSpan = Math.max(0.3, p.span[0] - 0.08);
    const spanFrac = Math.min(wantSpan, Math.hypot(lo.x - hi.x, lo.y - hi.y) / width);
    let score = Math.min(count, p.minVisibleFrets) * 10 + (spanFrac / wantSpan) * 60 - (nut === wantNut ? 0 : 100);
    // Prefer framings that keep the visible part of the board comfortably inside the frame vertically.
    const mid = applyHomography(Hm, fretX(model, (Math.max(0, vis.min) + Math.max(vis.min, vis.max)) / 2), yc);
    if (mid.y < height * 0.15 || mid.y > height * 0.85) score -= 30;
    if (score > bestScore) {
      bestScore = score;
      best = { ...view };
    }
    if (score >= p.minVisibleFrets * 10 + 60) break;
  }
  return best as ViewSpec;
}

function sampleHand(p: TierParams, rng: Rng, model: NeckModel, visible: FretRange, skin: Rgb): HandSpec | null {
  if (!rng.chance(p.hand)) return null;
  const lo = Math.max(1, visible.min + 1);
  const hi = Math.max(lo, Math.min(visible.max - 2, 12));
  const position = rng.int(lo, hi);
  const shape: HandSpec['shape'] = rng.chance(p.barre) ? 'barre' : rng.chance(0.5) ? 'chord' : 'scale';
  const n = model.stringCount;
  let fingers: HandSpec['fingers'];
  if (shape === 'scale') {
    const s = rng.int(1, n);
    fingers = [0, 1, 2, 3].map((i) => ({ fretOffset: i, string: Math.min(n, Math.max(1, s + rng.int(-1, 1))) }));
  } else if (shape === 'chord') {
    const strings = rng.pick([[2, 4, 5, 1], [3, 5, 6, 2], [1, 3, 2, 4], [5, 4, 2, 1], [6, 5, 1, 3]]);
    fingers = [
      { fretOffset: 0, string: strings[0] },
      { fretOffset: 1, string: strings[1] },
      { fretOffset: rng.chance(0.5) ? 1 : 2, string: strings[2] },
      { fretOffset: 2, string: strings[3] },
    ];
  } else {
    fingers = [
      { fretOffset: 0, string: n },
      { fretOffset: 1, string: 3 },
      { fretOffset: 2, string: 5 },
      { fretOffset: 2, string: 4 },
    ];
  }
  return { skin, position, shape, fingers, thumb: rng.chance(p.thumb), lift: 0 };
}

function sampleBackground(p: TierParams, rng: Rng, kindOverride?: BackgroundSpec['kind']): BackgroundSpec {
  const kind = kindOverride ?? rng.weighted(p.backgrounds);
  const decoys: BackgroundSpec['decoys'] = [];
  if (kind === 'clutter' || kind === 'room') {
    const all: BackgroundSpec['decoys'] = ['ladder', 'keyboard', 'blinds', 'radiator', 'books', 'ruler'];
    if (rng.chance(p.decoy)) decoys.push(rng.pick(all));
    if (kind === 'clutter' && rng.chance(p.decoy * 0.6)) decoys.push(rng.pick(all));
  }
  return { kind, seed: rng.seed(), base: rng.pick(WALLS), blur: rng.range(p.bgBlur[0], p.bgBlur[1]), decoys };
}

function sampleLighting(p: TierParams, rng: Rng): LightingSpec {
  const angle = rng.range(0, 360);
  const warm = rng.chance(p.warm);
  const la = rng.range(-150, -30);
  return {
    gain: rng.range(p.gain[0], p.gain[1]),
    temperature: warm ? -rng.range(0.15, 0.8) : rng.range(-0.1, 0.5),
    gradientAngleDeg: angle,
    gradientStrength: rng.range(p.gradient[0], p.gradient[1]),
    backlight: rng.chance(p.backlightChance) ? rng.range(p.backlight[0], p.backlight[1]) : 0,
    lightX: Math.cos((la * Math.PI) / 180),
    lightY: Math.sin((la * Math.PI) / 180),
  };
}

function sampleCamera(p: TierParams, rng: Rng): CameraFxSpec {
  const moving = rng.chance(p.motion);
  return {
    defocus: rng.range(p.defocus[0], p.defocus[1]),
    motionBlur: moving ? rng.range(p.motionLength[0], p.motionLength[1]) : 0,
    motionAngleDeg: rng.range(0, 180),
    noise: rng.range(p.noise[0], p.noise[1]),
    shot: rng.range(0.8, 2) * rng.range(p.noise[0], p.noise[1]),
    quality: Math.round(rng.range(p.quality[0], p.quality[1])),
    vignette: rng.range(p.vignette[0], p.vignette[1]),
  };
}

function samplePerson(p: TierParams, rng: Rng, skin: Rgb): PersonSpec | null {
  if (!rng.chance(p.person)) return null;
  const shirt = rng.pick(SHIRTS);
  const striped = rng.chance(p.stripes);
  let stripeColor = rng.pick(SHIRTS);
  // Make sure the stripes contrast with the shirt.
  if (Math.abs(stripeColor[1] - shirt[1]) < 0.12) stripeColor = shirt[1] > 0.3 ? srgb(30, 34, 60) : srgb(236, 232, 220);
  return {
    skin,
    shirt,
    stripes: striped ? { color: stripeColor, periodMm: rng.range(14, 44) } : null,
    longSleeves: rng.chance(0.4),
    head: rng.chance(0.8),
    hair: rng.pick(HAIR),
    pickArm: rng.chance(p.pickArm),
    leanDeg: rng.range(-6, 6),
  };
}

/** The scene for (tier, seed). The same pair always gives the same scene. */
export function sampleScene(tier: Tier, seed: number): SceneSpec {
  const p = TIER_PARAMS[tier];
  const root = new Rng((seed * 7919 + ['easy', 'medium', 'hard', 'extreme', 'markers'].indexOf(tier) * 104729 + 17) >>> 0);
  const misc = root.fork('misc');
  const [width, height] = misc.weighted(p.sizes);
  const leftHanded = misc.chance(p.leftHanded);
  const mirrored = misc.chance(p.mirrored);
  const bassSideUp = !misc.chance(p.bassDown);
  const guitar = sampleGuitar(p, root.fork('guitar'), tier === 'markers');
  const flipX = leftHanded !== mirrored;
  const view = sampleView(p, root.fork('view'), guitar.model, width, height, flipX, !bassSideUp);
  const visible = visibleFor(view, guitar.model, width, height, flipX, !bassSideUp);
  const skin = misc.pick(SKIN_TONES);
  const person = bassSideUp ? samplePerson(p, root.fork('person'), skin) : null;
  return {
    tier,
    seed,
    width,
    height,
    guitar,
    view,
    mirrored,
    leftHanded,
    bassSideUp,
    hand: sampleHand(p, root.fork('hand'), guitar.model, visible, skin),
    person,
    background: sampleBackground(p, root.fork('background')),
    lighting: sampleLighting(p, root.fork('lighting')),
    camera: sampleCamera(p, root.fork('camera')),
    occluder: null,
    noiseSeed: root.fork('noise').seed(),
    label: tier,
  };
}

/** Kinds of negative frame: scenes with no guitar that still contain tempting structure. */
export const NEGATIVE_KINDS = ['empty-plain', 'empty-room', 'clutter', 'person', 'striped-shirt', 'ladder', 'keyboard', 'blinds', 'books', 'radiator', 'ruler', 'hands'] as const;

/** A frame without a guitar. The detector must return null on every one of these. */
export function sampleNegativeScene(seed: number): SceneSpec {
  const root = new Rng((seed * 6151 + 99991) >>> 0);
  const misc = root.fork('misc');
  const kind = NEGATIVE_KINDS[seed % NEGATIVE_KINDS.length];
  const p = misc.chance(0.5) ? TIER_PARAMS.medium : TIER_PARAMS.hard;
  const bgKind: BackgroundSpec['kind'] = kind === 'empty-plain' ? (misc.chance(0.5) ? 'plain' : 'gradient') : kind === 'empty-room' || kind === 'person' ? 'room' : 'clutter';
  const background = sampleBackground(p, root.fork('background'), bgKind);
  background.decoys = [];
  if (kind === 'ladder' || kind === 'keyboard' || kind === 'blinds' || kind === 'books' || kind === 'radiator' || kind === 'ruler') {
    background.decoys = [kind, kind];
    background.blur = Math.min(background.blur, 0.5);
  }
  const skin = misc.pick(SKIN_TONES);
  let person: PersonSpec | null = null;
  if (kind === 'person' || kind === 'striped-shirt' || kind === 'hands') {
    person = samplePerson({ ...p, person: 1, stripes: kind === 'striped-shirt' ? 1 : 0.2 }, root.fork('person'), skin);
    if (person) person.pickArm = kind === 'hands';
  }
  const model = neckModel('steel');
  return {
    tier: 'negative',
    seed,
    width: 640,
    height: 360,
    guitar: null,
    // The view still positions the person: where a guitar would have been.
    view: { fovDeg: 65, rollDeg: misc.range(0, 20), yawDeg: 0, pitchDeg: 0, pxPerMm: misc.range(0.6, 1.1), anchorFret: 7, anchorU: misc.range(0.4, 0.6), anchorV: misc.range(0.45, 0.6), distortion: misc.range(p.distortion[0], p.distortion[1]) },
    mirrored: false,
    leftHanded: false,
    bassSideUp: true,
    hand: kind === 'hands' ? { skin, position: misc.int(3, 8), shape: 'scale', fingers: [0, 1, 2, 3].map((i) => ({ fretOffset: i, string: misc.int(1, model.stringCount) })), thumb: true, lift: 0 } : null,
    person,
    background,
    lighting: sampleLighting(p, root.fork('lighting')),
    camera: sampleCamera(p, root.fork('camera')),
    occluder: null,
    noiseSeed: root.fork('noise').seed(),
    label: kind,
  };
}

/** One-line human description of a scene, for contact sheets and failure reports. */
export function describeScene(spec: SceneSpec): string {
  const parts: string[] = [`${spec.tier}#${spec.seed}`, `${spec.width}x${spec.height}`];
  if (!spec.guitar) {
    parts.push(spec.label, spec.background.kind);
  } else {
    const g = spec.guitar;
    parts.push(`${g.kind}/${g.board}/${g.inlays}`);
    parts.push(`roll${spec.view.rollDeg.toFixed(0)} yaw${spec.view.yawDeg.toFixed(0)} pitch${spec.view.pitchDeg.toFixed(0)}`);
    if (spec.hand) parts.push(`hand@${spec.hand.position.toFixed(0)}${spec.hand.shape === 'barre' ? 'b' : ''}`);
    parts.push(spec.background.kind);
    if (spec.person?.stripes) parts.push('stripes');
    if (spec.lighting.backlight > 0.25) parts.push('backlit');
    if (spec.camera.motionBlur > 0) parts.push(`mb${spec.camera.motionBlur.toFixed(0)}`);
    if (spec.leftHanded) parts.push('LH');
    if (spec.mirrored) parts.push('mirror');
    if (!spec.bassSideUp) parts.push('bass-down');
  }
  return parts.join(' ');
}
