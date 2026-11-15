/**
 * Timing of the page analysis on a fixture blown up to a full-page capture (Node only).
 *
 *   node src/core/omr/eval/cli.cjs --bench                       # 2480 x 3508 (A4 at 300 dpi), clean
 *   node src/core/omr/eval/cli.cjs --bench --tier photo-good
 */
import { resizeGray } from '../image/gray';
import { analyzePage, extractStaff } from '../page';
import { type DegradeTier, degrade, hashString } from './degrade';
import { loadFixture } from './fixtures';

/** Analyse an enlarged fixture several times; returns one line per run with the time per stage. */
export function benchmark(id = 'page-linked-bravura-150', tier: DegradeTier = 'clean', width = 2480, runs = 5): string[] {
  const fx = loadFixture(id);
  const d = degrade(fx.gray, fx.truth, tier, hashString(`${id}|${tier}`) + 1);
  const big = resizeGray(d.gray, width, Math.round((d.gray.height * width) / d.gray.width));
  const out: string[] = [`${id} ${tier}: ${big.width} x ${big.height} px (${((big.width * big.height) / 1e6).toFixed(1)} MP)`];
  analyzePage(resizeGray(d.gray, Math.round(width / 4), Math.round((d.gray.height * width) / d.gray.width / 4)));
  const totals: number[] = [];
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    const a = analyzePage(big);
    const ms = performance.now() - t0;
    totals.push(ms);
    const t1 = performance.now();
    for (const st of a.layout.staves) extractStaff(a, st.index);
    const strips = performance.now() - t1;
    const stages = Object.entries(a.pre.timings).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ');
    out.push(`run ${r + 1}: ${ms.toFixed(0)} ms (${stages}) -> ${a.pre.gray.width} x ${a.pre.gray.height}, ${a.pre.correction}, ${a.layout.staves.length} staves; ${a.layout.staves.length} strips ${strips.toFixed(0)} ms`);
  }
  totals.sort((p, q) => p - q);
  out.push(`median ${totals[totals.length >> 1].toFixed(0)} ms, best ${totals[0].toFixed(0)} ms`);
  return out;
}
