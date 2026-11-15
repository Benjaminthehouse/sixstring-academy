/**
 * Staff-strip tools (Node only): write the strips the recognizers receive as pictures, and measure
 * how well the strip geometry reproduces the ground truth (staff position of every note head, line
 * of every tab number). The second is the acceptance test of the whole geometric chain: if a head
 * lands on the right half-space of the strip, pitch reading is purely a symbol problem.
 */
import { join } from 'node:path';
import type { GrayImage } from '../image/gray';
import { type PageAnalysis, analyzePage, extractStaff } from '../page';
import type { StaffInput } from '../types';
import { dumpAnalysis, dumpDir } from './debug';
import { type DegradeTier, degrade, hashString } from './degrade';
import { COLORS, Canvas } from './draw';
import { loadFixture } from './fixtures';
import { matchStaves } from './metrics';
import { writePng } from './png';
import type { GroundTruth } from './truth';

/** How well strips reproduce the ground truth positions. */
export interface StripAccuracy {
  /** Note heads checked, and how many fall on the right staff position (within half a step). */
  heads: number;
  headsOnPosition: number;
  /** Mean absolute error of the staff position, in half spaces. */
  headError: number;
  /** Tab numbers checked, and how many sit on the right line (within 0.3 space). */
  digits: number;
  digitsOnLine: number;
  /** Mean absolute round-trip error strip -> page -> strip, in strip px. */
  roundTrip: number;
}

/** Staff position (half spaces above the bottom line) of a strip y. */
export function stripStaffPosition(input: StaffInput, y: number): number {
  return (input.lineYs[input.lineCount - 1] - y) / (input.space / 2);
}

/** Compare the strips of an analysed page with the ground truth of the image that was analysed. */
export function stripAccuracy(analysis: PageAnalysis, truth: GroundTruth): StripAccuracy {
  const acc: StripAccuracy = { heads: 0, headsOnPosition: 0, headError: 0, digits: 0, digitsOnLine: 0, roundTrip: 0 };
  const matches = matchStaves(analysis.page, truth);
  const ids = analysis.layout.staves.map((st) => `s${st.systemIndex}.st${st.indexInSystem}`);
  let trips = 0;
  for (const m of matches) {
    if (!m.detected) continue;
    const index = ids.indexOf(m.detected.id);
    if (index < 0) continue;
    const input = extractStaff(analysis, index);
    for (const measure of m.truth.measures) {
      for (const ev of measure.events) {
        for (const n of ev.notes) {
          const box = 'head' in n ? n.head : n.bbox;
          const p = input.fromPage(box[0] + box[2] / 2, box[1] + box[3] / 2);
          const back = input.toPage(p.x, p.y);
          acc.roundTrip += Math.hypot(back.x - (box[0] + box[2] / 2), back.y - (box[1] + box[3] / 2)) * input.scale;
          trips++;
          if ('head' in n) {
            const pos = stripStaffPosition(input, p.y);
            acc.heads++;
            acc.headError += Math.abs(pos - n.pos);
            if (Math.abs(pos - n.pos) < 0.5) acc.headsOnPosition++;
          } else {
            const line = (p.y - input.lineYs[0]) / input.space;
            acc.digits++;
            if (Math.abs(line - (n.string - 1)) < 0.3) acc.digitsOnLine++;
          }
        }
      }
    }
  }
  if (acc.heads) acc.headError /= acc.heads;
  if (trips) acc.roundTrip /= trips;
  return acc;
}

/** Side-by-side picture of a strip: grey, binary and line-free, with the staff lines and bar lines drawn in. */
export function drawStrip(input: StaffInput): { width: number; height: number; data: Uint8ClampedArray } {
  const { width: w, height: h } = input.gray;
  const c = new Canvas(w, h * 3 + 8);
  const paste = (img: GrayImage | { width: number; height: number; data: Uint8Array }, y0: number, binary: boolean): void => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = binary ? (img.data[y * w + x] ? 40 : 255) : img.data[y * w + x];
        const i = ((y0 + y) * w + x) * 4;
        c.data[i] = c.data[i + 1] = c.data[i + 2] = v;
      }
    }
  };
  paste(input.gray, 0, false);
  paste(input.binary, h + 4, true);
  paste(input.noLines, 2 * h + 8, true);
  for (const y0 of [0, 2 * h + 8]) {
    for (const ly of input.lineYs) c.line(input.x0, y0 + ly, input.x1, y0 + ly, COLORS.green, 1, 0.55);
    for (const b of input.barlines) c.rect(b.x0, y0 + input.lineYs[0], b.x1 - b.x0, input.lineYs[input.lineCount - 1] - input.lineYs[0], COLORS.red, 1, 0.8);
    for (const m of input.measures) c.text(m.x0 + 3, y0 + input.lineYs[input.lineCount - 1] + 4, `M${m.index}`, COLORS.blue, 1);
  }
  c.text(2, 2, `${input.kind} ${input.lineCount}L space ${input.space} thick ${input.lineThickness.toFixed(1)} scale ${input.scale.toFixed(2)}`, COLORS.purple, 1);
  return c.image();
}

/** Write the strips of one (degraded) fixture under the dump directory; returns one line per file. */
export function dumpStrips(id: string, tier: DegradeTier = 'clean', seed = 1): string[] {
  const fx = loadFixture(id);
  const d = degrade(fx.gray, fx.truth, tier, hashString(`${id}|${tier}`) + seed);
  const analysis = analyzePage(d.gray);
  const out: string[] = [];
  for (const st of analysis.layout.staves) {
    const input = extractStaff(analysis, st.index);
    const path = join(dumpDir(), `${id}.${tier}.strip${st.index}.png`);
    writePng(path, drawStrip(input));
    out.push(`${path}  ${input.kind} ${input.gray.width}x${input.gray.height} space ${input.space} thickness ${input.lineThickness.toFixed(1)} bars ${input.barlines.length}`);
  }
  if (d.truth) {
    const a = stripAccuracy(analysis, d.truth);
    out.push(`heads on position ${a.headsOnPosition}/${a.heads} (mean error ${a.headError.toFixed(3)} half spaces), digits on line ${a.digitsOnLine}/${a.digits}, round trip ${a.roundTrip.toFixed(3)} px`);
  }
  return out;
}

/** Write the normalised page of one (degraded) fixture with its layout drawn in; returns the path and a summary. */
export function dumpNormalized(id: string, tier: DegradeTier = 'clean', view: 'gray' | 'binary' | 'lines' | 'strokes' | 'noLines' = 'binary', seed = 1): string {
  const fx = loadFixture(id);
  const d = degrade(fx.gray, fx.truth, tier, hashString(`${id}|${tier}`) + seed);
  const analysis = analyzePage(d.gray);
  const path = join(dumpDir(), `${id}.${tier}.norm-${view}.png`);
  dumpAnalysis(path, analysis, view);
  const { pre, layout } = analysis;
  return `${path}  ${pre.gray.width}x${pre.gray.height} correction ${pre.correction} skew ${((pre.skew * 180) / Math.PI).toFixed(2)} deg source space ${pre.sourceStaffSpace.toFixed(1)} px noise ${pre.noise.toFixed(1)} staves ${layout.staves.map((s) => `${s.kind[0]}${s.lineCount}`).join(' ')}`;
}
