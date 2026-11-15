/**
 * Development helpers (Node only): load a fixture at a degradation tier and cut the notation
 * strips together with their ground truth mapped into strip coordinates.
 */
import { degrade, type DegradeTier } from '../../eval/degrade';
import { loadFixture } from '../../eval/fixtures';
import { truthStaffFor } from '../../eval/oracle';
import { tierSeed } from '../../eval/runner';
import type { Box, GroundTruth, GtNotationStaff } from '../../eval/truth';
import type { GrayImage } from '../../image/gray';
import { type PageAnalysis, analyzePage, extractStaff } from '../../page';
import type { StaffInput } from '../../types';

/** One notation strip of a degraded fixture with its ground truth. */
export interface DevStrip {
  id: string;
  tier: DegradeTier;
  staffIndex: number;
  input: StaffInput;
  truth: GtNotationStaff | null;
}

/** A degraded fixture, analysed. */
export interface DevPage {
  id: string;
  tier: DegradeTier;
  gray: GrayImage;
  truth: GroundTruth;
  analysis: PageAnalysis;
  strips: DevStrip[];
}

/** Degrade a fixture exactly like the evaluation runner does and cut its notation strips. */
export function loadDevPage(id: string, tier: DegradeTier, seed = 1): DevPage {
  const fx = loadFixture(id);
  const d = degrade(fx.gray, fx.truth, tier, tierSeed(fx.meta.id, tier, seed));
  const analysis = analyzePage(d.gray);
  const truth = d.truth as GroundTruth;
  const strips: DevStrip[] = [];
  for (const st of analysis.layout.staves) {
    if (st.kind !== 'notation') continue;
    const input = extractStaff(analysis, st.index);
    const t = truthStaffFor(input, truth);
    strips.push({ id, tier, staffIndex: st.index, input, truth: t && t.kind === 'notation' ? t : null });
  }
  return { id, tier, gray: d.gray, truth, analysis, strips };
}

/** A page-px box as a strip-px box [x, y, w, h]. */
export function boxToStrip(input: StaffInput, b: Box): Box {
  const pts = [input.fromPage(b[0], b[1]), input.fromPage(b[0] + b[2], b[1]), input.fromPage(b[0], b[1] + b[3]), input.fromPage(b[0] + b[2], b[1] + b[3])];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0];
}
