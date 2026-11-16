import { it } from 'vitest';
import { createFretboardDetector } from '../detector';
import { cameraCentre, projectMarker, projectMarkerSeen, fretX } from '../geometry';
import { altCondition, altPixelToPlane, createAltCache, renderAlt } from './alt-scenes';

it('which cells fail', () => {
  const spec = altCondition(process.env.ALT_ID ?? 'side-light').build(Number(process.env.ALT_SEED ?? 1));
  const { frame, truth } = renderAlt(spec, 3, createAltCache());
  const d = createFretboardDetector().detect(frame, { model: spec.hints.model });
  const pose = d.pose!;
  const cam = cameraCentre(pose);
  const m = truth.model!;
  const rows: string[] = [`camera est ${cam?.map((v) => v.toFixed(0))} true ${truth.camera?.map((v) => v.toFixed(0))}`];
  for (let f = 1; f <= 20; f++) {
    let line = `f${f}:`;
    for (let s = 1; s <= 6; s++) {
      const p = projectMarkerSeen(pose, s, f, cam);
      const q = altPixelToPlane(truth, p)!;
      const b = altPixelToPlane(truth, projectMarker(pose, s, f))!;
      const fn = -12 * Math.log2(1 - q.x / m.scaleLength);
      line += ` s${s}(${fn.toFixed(2)}, y${q.y.toFixed(1)} | board y${b.y.toFixed(1)})`;
    }
    rows.push(line);
  }
  void fretX;
  console.log(rows.join('\n'));
}, 300_000);
