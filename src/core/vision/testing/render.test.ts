import { describe, expect, it } from 'vitest';
import { applyHomography, boardEdgeY, checkPlausibleView, expectedOrientation, fretX, homographyOrientation, locatePixel, markerHintPlanePoints, projectMarker, stringY, toGray } from '../geometry';
import type { Frame, FretboardPose } from '../types';
import { distortPoint, undistortMaps, viewHomography } from './camera';
import { compressBlocks, exposeToFrame, gaussianBlur, motionBlur } from './raster';
import { createRenderCache, renderScene, sceneKey, truthForScene, truthOf, type FrameStore } from './render';
import { Rng, fbm2, hashString, valueNoise } from './rng';
import { NEGATIVE_KINDS, describeScene, sampleNegativeScene, sampleScene, type SceneSpec, type Tier } from './scene';
import { SEQUENCE_NAMES, buildSequence } from './sequence';

const TIERS: Tier[] = ['easy', 'medium', 'hard', 'extreme', 'markers'];

function sameBytes(a: Frame, b: Frame): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

/** Bilinear luminance at a continuous image position (pixel centres at +0.5). */
function lumAt(gray: Uint8Array, width: number, height: number, x: number, y: number): number {
  const fx = Math.min(width - 1.001, Math.max(0, x - 0.5));
  const fy = Math.min(height - 1.001, Math.max(0, y - 0.5));
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const ax = fx - ix;
  const ay = fy - iy;
  const i = iy * width + ix;
  return (gray[i] * (1 - ax) + gray[i + 1] * ax) * (1 - ay) + (gray[i + width] * (1 - ax) + gray[i + width + 1] * ax) * ay;
}

describe('seeded randomness', () => {
  it('is reproducible and forks independently of draw order', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seq = [a.next(), a.range(2, 3), a.int(1, 6), a.gauss()];
    expect([b.next(), b.range(2, 3), b.int(1, 6), b.gauss()]).toEqual(seq);
    expect(new Rng(43).next()).not.toBe(new Rng(42).next());
    const fresh = new Rng(42).fork('view').next();
    a.next();
    a.next();
    expect(a.fork('view').next()).toBe(fresh);
    expect(a.fork('hand').next()).not.toBe(fresh);
    for (let i = 0; i < 200; i++) {
      const v = a.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
    expect(a.pick(['x'])).toBe('x');
    expect(a.weighted([['only', 1]])).toBe('only');
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });

  it('makes smooth bounded noise', () => {
    for (let i = 0; i < 300; i++) {
      const v = valueNoise(i * 0.37, i * 0.11, 9);
      const f = fbm2(i * 0.37, i * 0.11, 9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    expect(Math.abs(valueNoise(3.5, 2.5, 1) - valueNoise(3.501, 2.5, 1))).toBeLessThan(0.01);
    expect(valueNoise(3.5, 2.5, 1)).not.toBe(valueNoise(3.5, 2.5, 2));
  });
});

describe('scene sampling', () => {
  it('gives the same scene for the same tier and seed, and different scenes otherwise', () => {
    for (const tier of TIERS) {
      const a = sampleScene(tier, 5);
      expect(sampleScene(tier, 5)).toEqual(a);
      expect(sceneKey(sampleScene(tier, 5))).toBe(sceneKey(a));
      expect(sceneKey(sampleScene(tier, 6))).not.toBe(sceneKey(a));
      expect(describeScene(a)).toContain(`${tier}#5`);
    }
    expect(sceneKey(sampleScene('easy', 5))).not.toBe(sceneKey(sampleScene('medium', 5)));
    expect(sampleNegativeScene(3)).toEqual(sampleNegativeScene(3));
  });

  it('frames a real stretch of neck in every benchmark scene', () => {
    const minFrets: Record<Tier, number> = { easy: 10, medium: 8, hard: 7, extreme: 6, markers: 7 };
    let nutSeen = 0;
    let nutHidden = 0;
    // The 24 standard seeds of every tier, plus a slice of held-out seeds.
    const seeds = [...Array.from({ length: 24 }, (_, i) => i), ...Array.from({ length: 16 }, (_, i) => 1000 + i)];
    for (const tier of TIERS) {
      for (const seed of seeds) {
        const spec = sampleScene(tier, seed);
        const g = spec.guitar;
        expect(g).not.toBeNull();
        if (!g) continue;
        expect([480, 640, 960, 1280]).toContain(spec.width);
        expect(spec.height * 16).toBe(spec.width * 9);
        const H = viewHomography(spec.view, g.model, spec.width, spec.height, spec.leftHanded !== spec.mirrored, !spec.bassSideUp);
        const pose: FretboardPose = { H, model: g.model, confidence: 1, visibleFrets: { min: 0, max: 12 }, mirrored: spec.mirrored, leftHanded: spec.leftHanded, numbering: 'nut', numberingConfidence: 1, frameWidth: spec.width, frameHeight: spec.height };
        // The view is one a real camera could produce, seen from the front of the board.
        const report = checkPlausibleView(H, g.model, spec.width, spec.height, { mirrored: spec.mirrored, leftHanded: spec.leftHanded, maxSpan: 6 });
        expect(report.reasons, `${tier}#${seed}`).toEqual([]);
        expect(homographyOrientation(H, fretX(g.model, 7), g.model.nutWidth / 2)).toBe(expectedOrientation(spec.mirrored, spec.leftHanded));
        // Count visible wires on the neck proper.
        let visible = 0;
        for (let n = 0; n <= 13; n++) {
          const p = applyHomography(H, fretX(g.model, n), g.model.nutWidth / 2);
          if (p.x >= 0 && p.x <= spec.width && p.y >= 0 && p.y <= spec.height) visible++;
        }
        expect(visible, `${tier}#${seed}`).toBeGreaterThanOrEqual(minFrets[tier]);
        const nut = applyHomography(H, 0, g.model.nutWidth / 2);
        if (nut.x >= 0 && nut.x <= spec.width && nut.y >= 0 && nut.y <= spec.height) nutSeen++;
        else nutHidden++;
        // Bass strings toward the top of the picture, unless the scene says otherwise.
        const x = fretX(g.model, 7);
        const bass = applyHomography(H, x, boardEdgeY(g.model, x, 'bass'));
        const treble = applyHomography(H, x, boardEdgeY(g.model, x, 'treble'));
        expect(bass.y < treble.y).toBe(spec.bassSideUp);
        // The hand, when present, sits on visible frets.
        if (spec.hand) {
          const tip = projectMarker(pose, 3, Math.round(spec.hand.position));
          expect(tip.x).toBeGreaterThan(-0.2 * spec.width);
          expect(tip.x).toBeLessThan(1.2 * spec.width);
        }
        if (tier === 'easy') {
          expect(spec.hand).toBeNull();
          expect(spec.person).toBeNull();
          expect(Math.abs(spec.view.yawDeg)).toBeLessThanOrEqual(12);
        }
        if (tier === 'markers') expect(g.stickers).not.toBeNull();
        else expect(g.stickers).toBeNull();
      }
    }
    // Both situations are well represented: numbering with and without the nut in view.
    expect(nutSeen).toBeGreaterThan(70);
    expect(nutHidden).toBeGreaterThan(35);
  });

  it('covers the variety the benchmark promises', () => {
    const seen = new Set<string>();
    for (const tier of ['medium', 'hard', 'extreme'] as Tier[]) {
      for (let seed = 0; seed < 24; seed++) {
        const s = sampleScene(tier, seed);
        const g = s.guitar;
        if (!g) continue;
        seen.add(g.kind).add(g.board).add(`inlays:${g.inlays}`).add(g.headstock).add(s.background.kind);
        if (s.leftHanded) seen.add('left-handed');
        if (s.mirrored) seen.add('mirrored');
        if (!s.bassSideUp) seen.add('bass-down');
        if (s.person?.stripes) seen.add('stripes');
        if (s.hand?.shape === 'barre') seen.add('barre');
        if (s.hand?.thumb) seen.add('thumb');
        if (s.lighting.backlight > 0.3) seen.add('backlit');
        if (s.camera.motionBlur > 0) seen.add('motion-blur');
        if (s.view.distortion < -0.005) seen.add('distortion');
        if (s.background.decoys.length > 0) seen.add('decoy');
        if (g.binding) seen.add('binding');
        seen.add(`${s.width}`);
      }
    }
    for (const want of ['steel', 'electric', 'classical', 'rosewood', 'ebony', 'maple', 'inlays:dots', 'inlays:blocks', 'inlays:none', 'three-a-side', 'six-in-line', 'slotted', 'room', 'clutter', 'left-handed', 'mirrored', 'bass-down', 'stripes', 'barre', 'thumb', 'backlit', 'motion-blur', 'distortion', 'decoy', 'binding', '480', '640', '960', '1280']) {
      expect(seen.has(want), want).toBe(true);
    }
    expect(new Set(Array.from({ length: 24 }, (_, i) => sampleNegativeScene(i).label)).size).toBe(NEGATIVE_KINDS.length);
  });
});

describe('camera model', () => {
  it('inverts the lens distortion it applies', () => {
    const k1 = -0.04;
    const { ux, uy } = undistortMaps(k1, 640, 360);
    for (const [x, y] of [[0, 0], [639, 0], [320, 180], [100, 300], [639, 359]]) {
      const i = y * 640 + x;
      const back = distortPoint(k1, 640, 360, ux[i], uy[i]);
      expect(back.x).toBeCloseTo(x + 0.5, 2);
      expect(back.y).toBeCloseTo(y + 0.5, 2);
    }
    const flat = undistortMaps(0, 8, 4);
    expect(Array.from(flat.ux.slice(0, 3))).toEqual([0.5, 1.5, 2.5]);
    expect(flat.uy[8]).toBe(1.5);
  });

  it('keeps the truth homography within a pixel of the distorted projection', () => {
    // Checked on every benchmark scene, in units of a 640-pixel-wide frame.
    const worst: Record<string, number> = { easy: 0, medium: 0, hard: 0, extreme: 0 };
    for (let seed = 0; seed < 24; seed++) {
      for (const tier of ['easy', 'medium', 'hard', 'extreme'] as Tier[]) {
        const spec = sampleScene(tier, seed);
        const truth = truthForScene(spec);
        worst[tier] = Math.max(worst[tier], (truth.distortionResidualPx * 640) / spec.width);
      }
    }
    expect(worst.easy).toBe(0);
    expect(worst.medium).toBeLessThan(0.5);
    expect(worst.hard).toBeLessThan(1);
    expect(worst.extreme).toBeLessThan(1.5);
    expect(worst.extreme).toBeGreaterThan(0.1);
  });
});

describe('raster helpers', () => {
  it('blurs without changing the mean and leaves flat images flat', () => {
    const w = 32;
    const h = 20;
    const img = new Float32Array(w * h * 3);
    img[(10 * w + 16) * 3] = 90;
    gaussianBlur(img, w, h, 3, 1.2);
    let sum = 0;
    for (let i = 0; i < img.length; i += 3) sum += img[i];
    expect(sum).toBeCloseTo(90, 3);
    expect(img[(10 * w + 16) * 3]).toBeLessThan(20);
    expect(img[(10 * w + 17) * 3]).toBeCloseTo(img[(10 * w + 15) * 3], 5);
    expect(img[(11 * w + 16) * 3]).toBeCloseTo(img[(10 * w + 17) * 3], 5);
    const flat = new Float32Array(w * h * 3).fill(0.4);
    gaussianBlur(flat, w, h, 3, 2);
    motionBlur(flat, w, h, 7, 30);
    for (let i = 0; i < flat.length; i++) expect(flat[i]).toBeCloseTo(0.4, 5);
    const dot = new Float32Array(w * h * 3);
    dot[(10 * w + 16) * 3 + 1] = 8;
    motionBlur(dot, w, h, 6, 0);
    let row = 0;
    for (let x = 0; x < w; x++) row += dot[(10 * w + x) * 3 + 1];
    expect(row).toBeCloseTo(8, 4);
    expect(dot[(10 * w + 16) * 3 + 1]).toBeLessThan(2);
    expect(dot[(9 * w + 16) * 3 + 1]).toBe(0);
  });

  it('encodes sRGB and adds seeded noise', () => {
    const lin = new Float32Array(4 * 3).fill(0.2140411);
    const clean = exposeToFrame(lin, 2, 2, 0, 0, 1);
    expect(Array.from(clean.data.slice(0, 4))).toEqual([128, 128, 128, 255]);
    const noisyA = exposeToFrame(new Float32Array(64 * 64 * 3).fill(0.2), 64, 64, 0.02, 0.02, 7);
    const noisyB = exposeToFrame(new Float32Array(64 * 64 * 3).fill(0.2), 64, 64, 0.02, 0.02, 7);
    const noisyC = exposeToFrame(new Float32Array(64 * 64 * 3).fill(0.2), 64, 64, 0.02, 0.02, 8);
    expect(sameBytes(noisyA, noisyB)).toBe(true);
    expect(sameBytes(noisyA, noisyC)).toBe(false);
    let mean = 0;
    let varSum = 0;
    for (let i = 0; i < noisyA.data.length; i += 4) mean += noisyA.data[i];
    mean /= 64 * 64;
    for (let i = 0; i < noisyA.data.length; i += 4) varSum += (noisyA.data[i] - mean) * (noisyA.data[i] - mean);
    expect(Math.abs(mean - 124)).toBeLessThan(2);
    expect(Math.sqrt(varSum / (64 * 64))).toBeGreaterThan(4);
  });

  it('compresses in 8x8 blocks: lossless-ish at high quality, blocky at low quality', () => {
    const make = (): Frame => {
      const f: Frame = { width: 48, height: 40, data: new Uint8ClampedArray(48 * 40 * 4) };
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 48; x++) {
          const i = (y * 48 + x) * 4;
          const v = 60 + 3 * x + (x === 21 ? 120 : 0);
          f.data[i] = v;
          f.data[i + 1] = v * 0.8;
          f.data[i + 2] = 200 - 2 * y;
          f.data[i + 3] = 255;
        }
      }
      return f;
    };
    const original = make();
    const high = make();
    compressBlocks(high, 95);
    const low = make();
    compressBlocks(low, 12);
    const off = make();
    compressBlocks(off, 100);
    expect(sameBytes(off, original)).toBe(true);
    const err = (f: Frame): number => {
      let e = 0;
      for (let i = 0; i < f.data.length; i++) e += Math.abs(f.data[i] - original.data[i]);
      return e / f.data.length;
    };
    expect(err(high)).toBeLessThan(2.5);
    expect(err(low)).toBeGreaterThan(err(high) * 2);
    expect(low.data[3]).toBe(255);
  });
});

describe('scene renderer', () => {
  it('is deterministic: same spec, same bytes', () => {
    for (const [tier, seed] of [['easy', 1], ['hard', 2], ['extreme', 6]] as [Tier, number][]) {
      const spec = sampleScene(tier, seed);
      const a = renderScene(spec);
      const b = renderScene(sampleScene(tier, seed));
      expect(sameBytes(a.frame, b.frame), `${tier}#${seed}`).toBe(true);
      expect(b.truth).toEqual(a.truth);
      expect(a.frame.data.length).toBe(spec.width * spec.height * 4);
      expect(truthOf(a.frame)).toBe(a.truth);
      const other = renderScene(sampleScene(tier, seed + 1));
      expect(sameBytes(a.frame, other.frame)).toBe(false);
      // Only the sensor noise seed differs: a different frame of the same scene.
      const again = renderScene({ ...spec, noiseSeed: spec.noiseSeed + 1 });
      expect(sameBytes(a.frame, again.frame)).toBe(false);
      expect(again.truth.pose).toEqual(a.truth.pose);
    }
    const neg = renderScene(sampleNegativeScene(4));
    expect(sameBytes(neg.frame, renderScene(sampleNegativeScene(4)).frame)).toBe(true);
    expect(neg.truth.pose).toBeNull();
    expect(neg.truth.numberingObservable).toBe(false);
  }, 120_000);

  it('returns stored frames from a frame store and renders identically with an in-memory cache', () => {
    const saved = new Map<string, Frame>();
    let loads = 0;
    const store: FrameStore = {
      load: (key) => {
        const hit = saved.get(key);
        if (hit) loads++;
        return hit ? { data: new Uint8ClampedArray(hit.data), width: hit.width, height: hit.height } : null;
      },
      save: (key, frame) => void saved.set(key, frame),
    };
    const spec = sampleScene('medium', 3);
    const plain = renderScene(spec);
    const first = renderScene(spec, createRenderCache(store));
    const second = renderScene(spec, createRenderCache(store));
    expect(saved.size).toBe(1);
    expect(loads).toBe(1);
    expect(sameBytes(first.frame, plain.frame)).toBe(true);
    expect(sameBytes(second.frame, plain.frame)).toBe(true);
    expect(second.truth).toEqual(plain.truth);
    expect(truthOf(second.frame)).toBe(second.truth);
  }, 60_000);

  it('draws the board exactly where the ground truth says (sub-pixel)', () => {
    // A clean, front-on scene: locate both long board edges in the pixels and compare with the truth.
    const spec: SceneSpec = sampleScene('easy', 2);
    const g = spec.guitar;
    if (!g) throw new Error('no guitar');
    spec.camera = { defocus: 0.6, motionBlur: 0, motionAngleDeg: 0, noise: 0, shot: 0, quality: 100, vignette: 0 };
    spec.view = { ...spec.view, pitchDeg: 0, yawDeg: 6, rollDeg: 9 };
    spec.lighting = { ...spec.lighting, gradientStrength: 0, backlight: 0, gain: 1, temperature: 0 };
    spec.background = { kind: 'plain', seed: 1, base: [0.8, 0.8, 0.8], blur: 0, decoys: [] };
    g.binding = false;
    g.board = 'ebony';
    g.stickers = null;
    for (const mirrored of [false, true]) {
      const scene = renderScene({ ...spec, mirrored });
      const pose = scene.truth.pose as FretboardPose;
      const gray = toGray(scene.frame).data as Uint8Array;
      const W = scene.frame.width;
      const Hh = scene.frame.height;
      const model = pose.model;
      for (const side of ['bass', 'treble'] as const) {
        let sum = 0;
        let count = 0;
        for (let f = 2; f <= 11; f++) {
          // Mid-cell, away from the fret wires.
          const x = (fretX(model, f - 1) + fretX(model, f)) / 2;
          const yEdge = boardEdgeY(model, x, side);
          const out = side === 'bass' ? -1 : 1;
          // Luminance profile across the edge, from 4 mm inside the board to 4 mm outside.
          const steps = 64;
          const profile: number[] = [];
          for (let k = 0; k <= steps; k++) {
            const y = yEdge + out * (-4 + (8 * k) / steps);
            const p = applyHomography(pose.H, x, y);
            profile.push(lumAt(gray, W, Hh, p.x, p.y));
          }
          const inside = (profile[0] + profile[1] + profile[2]) / 3;
          const outside = (profile[steps] + profile[steps - 1] + profile[steps - 2]) / 3;
          if (Math.abs(outside - inside) < 40) continue;
          const half = (inside + outside) / 2;
          for (let k = 0; k < steps; k++) {
            if ((profile[k] - half) * (profile[k + 1] - half) <= 0 && profile[k] !== profile[k + 1]) {
              const t = k + (half - profile[k]) / (profile[k + 1] - profile[k]);
              const mm = -4 + (8 * t) / steps;
              // Convert the offset from millimetres to pixels at this spot.
              const a = applyHomography(pose.H, x, yEdge);
              const b = applyHomography(pose.H, x, yEdge + 1);
              sum += mm * Math.hypot(a.x - b.x, a.y - b.y);
              count++;
              break;
            }
          }
        }
        expect(count).toBeGreaterThanOrEqual(6);
        // The mean edge position agrees with the truth to a quarter of a pixel.
        expect(Math.abs(sum / count), `${side} edge, mirrored=${mirrored}`).toBeLessThan(0.25);
      }
    }
  }, 60_000);

  it('puts bright fret wires and dark cells where the truth says on a dark board', () => {
    let checked = 0;
    for (const seed of [0, 1, 2, 4]) {
      const scene = renderScene(sampleScene('easy', seed));
      const pose = scene.truth.pose as FretboardPose;
      const g = scene.spec.guitar;
      if (!g || g.board === 'maple') continue;
      const gray = toGray(scene.frame).data as Uint8Array;
      const m = pose.model;
      let wire = 0;
      let cell = 0;
      let n = 0;
      for (let f = Math.max(1, pose.visibleFrets.min + 1); f <= Math.min(12, pose.visibleFrets.max); f++) {
        // Between strings 2 and 3 and between 4 and 5: clear of strings and of centre inlays.
        for (const s of [2.5, 4.5]) {
          const xw = fretX(m, f);
          const xc = fretX(m, f - 1) + 0.3 * (fretX(m, f) - fretX(m, f - 1));
          const pw = applyHomography(pose.H, xw, stringY(m, s, xw));
          const pc = applyHomography(pose.H, xc, stringY(m, s, xc));
          wire += lumAt(gray, scene.frame.width, scene.frame.height, pw.x, pw.y);
          cell += lumAt(gray, scene.frame.width, scene.frame.height, pc.x, pc.y);
          n++;
        }
      }
      expect(n).toBeGreaterThan(10);
      expect(wire / n, `easy#${seed}`).toBeGreaterThan(cell / n + 35);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it('reports what hides the board: the hand, and occluders', () => {
    const withHand = renderScene(sampleScene('medium', 0));
    expect(withHand.spec.hand).not.toBeNull();
    const hf = withHand.truth.handFrets;
    expect(hf).not.toBeNull();
    if (hf && withHand.spec.hand) {
      expect(hf.min).toBeLessThan(withHand.spec.hand.position);
      expect(hf.max).toBeGreaterThanOrEqual(withHand.spec.hand.position);
    }
    expect(withHand.truth.hints).toMatchObject({ bassSideUp: true, mirrored: withHand.spec.mirrored, leftHanded: withHand.spec.leftHanded, model: withHand.spec.guitar?.kind });
    // The truth pose maps its own markers back to their cells.
    const pose = withHand.truth.pose as FretboardPose;
    const loc = locatePixel(pose, projectMarker(pose, 2, 6));
    expect(loc).toMatchObject({ string: 2, fret: 6 });
    const marked = renderScene(sampleScene('markers', 1));
    expect(marked.truth.hints.markers?.frets).toHaveLength(2);
    expect(marked.truth.numberingObservable).toBe(true);
  }, 60_000);

  it('paints marker-mode stickers where the hint says they are', () => {
    let visible = 0;
    let vivid = 0;
    for (let seed = 0; seed < 6; seed++) {
      const scene = renderScene(sampleScene('markers', seed));
      const pose = scene.truth.pose as FretboardPose;
      const hint = scene.truth.hints.markers;
      if (!hint) throw new Error('markers scene without a hint');
      const hand = scene.truth.handFrets;
      markerHintPlanePoints(pose.model, hint).forEach((pt, k) => {
        const fret = hint.frets[k];
        if (hand && fret >= hand.min - 1 && fret <= hand.max + 2) return;
        const p = applyHomography(pose.H, pt.x, pt.y);
        if (p.x < 4 || p.y < 4 || p.x > scene.frame.width - 4 || p.y > scene.frame.height - 4) return;
        visible++;
        const i = (Math.floor(p.y) * scene.frame.width + Math.floor(p.x)) * 4;
        const [r, g, b] = [scene.frame.data[i], scene.frame.data[i + 1], scene.frame.data[i + 2]];
        if ((Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b)) > 0.3) vivid++;
      });
    }
    expect(visible).toBeGreaterThanOrEqual(5);
    expect(vivid / visible).toBeGreaterThanOrEqual(0.75);
  }, 120_000);
});

describe('tracking sequences', () => {
  it('builds every sequence deterministically with smooth motion', () => {
    for (const name of SEQUENCE_NAMES) {
      const a = buildSequence(name);
      const b = buildSequence(name);
      expect(b.frames).toEqual(a.frames);
      expect(a.frames.length).toBe(name === 'still' ? 30 : 40);
      expect(a.still).toHaveLength(a.frames.length);
      expect(a.still.some(Boolean)).toBe(name === 'still');
      for (const f of a.frames) {
        expect(f.width).toBe(640);
        expect(f.height).toBe(360);
        expect(f.guitar).not.toBeNull();
      }
      // Noise changes every frame even when nothing moves.
      expect(a.frames[1].noiseSeed).not.toBe(a.frames[0].noiseSeed);
      // Consecutive frames never jump by more than a tenth of the frame.
      for (let i = 1; i < a.frames.length; i++) {
        expect(Math.abs(a.frames[i].view.anchorU - a.frames[i - 1].view.anchorU)).toBeLessThan(0.1);
        expect(Math.abs(a.frames[i].view.rollDeg - a.frames[i - 1].view.rollDeg)).toBeLessThan(6);
      }
    }
    expect(buildSequence('sway', { frames: 12 }).frames).toHaveLength(12);
    expect(buildSequence('sway', { seedOffset: 0 }).frames).toEqual(buildSequence('sway').frames);
    expect(buildSequence('sway', { seedOffset: 500 }).frames[0].background.seed).not.toBe(buildSequence('sway').frames[0].background.seed);
    expect(buildSequence('sway', { seed: 9 }).frames[0].background.seed).not.toBe(buildSequence('sway').frames[0].background.seed);
  });

  it('scripts the events each sequence is named after', () => {
    const occ = buildSequence('occlusion');
    const flags = occ.frames.map((f) => f.occluder !== null);
    expect(flags[0]).toBe(false);
    expect(flags[flags.length - 1]).toBe(false);
    expect(flags.filter(Boolean).length).toBeGreaterThanOrEqual(10);
    const occluded = occ.frames.map((f) => truthForScene(f).occluded);
    const hidden = occluded.filter(Boolean).length;
    expect(hidden).toBeGreaterThanOrEqual(3);
    expect(hidden).toBeLessThan(flags.filter(Boolean).length);
    // The jerk sequence has frames with motion blur; the hand-slide sequence moves the hand and then removes it.
    expect(buildSequence('jerk').frames.some((f) => f.camera.motionBlur > 2)).toBe(true);
    const slide = buildSequence('hand-slide');
    const positions = slide.frames.filter((f) => f.hand).map((f) => (f.hand as { position: number }).position);
    expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(2);
    expect(slide.frames[slide.frames.length - 1].hand).toBeNull();
    // The nut is in view at the start of nut-exit and out of view at the end.
    const exit = buildSequence('nut-exit');
    const nutIn = (spec: SceneSpec): boolean => {
      const g = spec.guitar;
      if (!g) return false;
      const H = viewHomography(spec.view, g.model, spec.width, spec.height, spec.leftHanded !== spec.mirrored, !spec.bassSideUp);
      const p = applyHomography(H, 0, g.model.nutWidth / 2);
      return p.x >= 0 && p.x <= spec.width && p.y >= 0 && p.y <= spec.height;
    };
    expect(nutIn(exit.frames[0])).toBe(true);
    expect(nutIn(exit.frames[exit.frames.length - 1])).toBe(false);
  }, 120_000);
});
