import { it } from 'vitest';
import { createRenderCache, renderScene } from '@/core/vision/testing/render';
import { sampleScene } from '@/core/vision/testing/scene';
import { diskFrameStore } from '@/core/vision/testing/store';
import { computeRidgeField, AxisSearch } from '@/core/vision/align/axis';
import { gaussianBlur, toWorkingGray } from '@/core/vision/align/image';
import { findCombs, findPeaks, sampleLineProfile } from '@/core/vision/align/comb';
import { estimateNormalModel } from '@/core/vision/align/strip';
import { bridgeDirection } from '@/core/vision/align/hypothesis';
import { fretX } from '@/core/vision/geometry';

it('dbg', () => {
  const tier = (process.env.T ?? 'medium') as never;
  const seed = Number(process.env.S ?? 1);
  const scene = renderScene(sampleScene(tier, seed), createRenderCache(diskFrameStore()));
  const { gray, scaleX } = toWorkingGray(scene.frame);
  const fine = gaussianBlur(gray, 1.2);
  const coarse = gaussianBlur(fine, 2.1, null);
  const field = computeRidgeField(fine);
  const search = new AxisSearch(field);
  const cand = search.next()!;
  const hints = { bassSideUp: scene.truth.hints.bassSideUp ?? true, mirrored: scene.truth.hints.mirrored ?? false, leftHanded: scene.truth.hints.leftHanded ?? false };
  const a = (cand.thetaDeg * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const probe = sampleLineProfile(fine, coarse, cand.cx, cand.cy, ux, uy, { deg0: 0, slope: 0 }, cand.polarity, 0)!;
  const normal = estimateNormalModel(field, probe.x0, probe.y0, probe.ux, probe.uy, probe.count, cand.polarity, cand.ridgeNormalDeg);
  const profile = sampleLineProfile(fine, coarse, cand.cx, cand.cy, ux, uy, normal, cand.polarity, 4)!;
  const peaks = findPeaks(profile);
  console.log('cand', cand, 'normal', normal, 'dir', bridgeDirection(ux, uy, hints));
  // truth fret crossings along the profile line
  const T = scene.truth.pose!;
  const m = T.model;
  const truthPos: string[] = [];
  for (let n = 0; n <= m.fretCount; n++) {
    // intersect truth fret line with profile line
    const x = fretX(m, n);
    const p0 = [ (T.H[0]*x + T.H[1]*0 + T.H[2])/(T.H[6]*x + T.H[8]), (T.H[3]*x + T.H[5])/(T.H[6]*x+T.H[8]) ];
    const y1 = 50;
    const w1 = T.H[6]*x + T.H[7]*y1 + T.H[8];
    const p1 = [ (T.H[0]*x + T.H[1]*y1 + T.H[2])/w1, (T.H[3]*x + T.H[4]*y1 + T.H[5])/w1 ];
    const ax = p0[0]*scaleX, ay = p0[1]*scaleX, bx = p1[0]*scaleX, by = p1[1]*scaleX;
    const dx = bx-ax, dy = by-ay;
    const den = profile.ux*dy - profile.uy*dx;
    const t = ((ax-profile.x0)*dy - (ay-profile.y0)*dx)/den;
    if (t >= 0 && t < profile.count) truthPos.push(`${n}:${t.toFixed(1)}`);
  }
  console.log('truth', truthPos.join(' '));
  console.log('peaks', peaks.map((p) => `${p.pos.toFixed(1)}(${p.strength.toFixed(1)})`).join(' '));
  const combs = findCombs(peaks, profile.count, { directions: [bridgeDirection(ux, uy, hints) || 1], minFrets: 4, maxCombs: 3 });
  for (const c of combs) console.log('comb', c.dir, c.score.toFixed(1), 'miss', c.misses, 'extra', c.extras, 'C', c.C.toFixed(3), c.frets.map((f) => `${f.j}:${f.pos.toFixed(1)}`).join(' '));
});
