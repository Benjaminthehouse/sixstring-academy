import { it } from 'vitest';
import { createFretboardDetector } from '../detector';
import { cameraCentre, projectMarkerSeen } from '../geometry';
import { dumpAltFrame, scoreAlt } from './alt-bench';
import { altCondition, createAltCache, renderAlt } from './alt-scenes';

it('numbering readers on a frame', () => {
  const id = process.env.ALT_ID ?? 'wall-guitar';
  const seed = Number(process.env.ALT_SEED ?? 2);
  const frameNo = Number(process.env.ALT_FRAME ?? 10);
  const spec = altCondition(id).build(seed);
  const { frame, truth } = renderAlt(spec, frameNo, createAltCache());
  const det = createFretboardDetector({ debug: true });
  const ins = det.inspect(frame, { model: spec.hints.model, bassSideUp: true, mirrored: spec.hints.mirrored, leftHanded: spec.hints.leftHanded });
  console.log(`chosen ${ins.chosen} agree ${ins.agree} reason ${ins.reason}`);
  ins.candidates.forEach((c, i) => {
    const n = ins.numbering[i];
    console.log(`cand ${i} ${c.source} ev ${c.evidence.toFixed(2)} minFret ${c.refine.minFret} maxFret ${c.refine.maxFret} | lines: delta ${n.lines.delta} ${n.lines.source} ${n.lines.confidence.toFixed(2)} nut ${JSON.stringify(n.lines.nut)} inlays ${JSON.stringify(n.lines.inlays)} | align: ${JSON.stringify(n.align)}`);
  });
  const d = det.detect(frame, { model: spec.hints.model, bassSideUp: true });
  if (d.pose) {
    const sc = scoreAlt(d.pose, truth);
    console.log(`detect: ${d.pose.numbering} ${d.pose.numberingConfidence.toFixed(2)} acc ${sc.accuracy.toFixed(2)} off ${sc.offset} nutInFrame ${truth.nutInFrame} vis ${truth.visible.min}-${truth.visible.max} pose vis ${d.pose.visibleFrets.min}-${d.pose.visibleFrets.max}`);
    dumpAltFrame(`e2e/out/vision/alt/num-${id}-${seed}-f${frameNo}.png`, frame, truth, d.pose, `${d.pose.numbering} ${sc.offset}`);
    void cameraCentre;
    void projectMarkerSeen;
  }
}, 300_000);
