/**
 * Evaluation runner (Node only): degrade each fixture to each tier, run the pipeline, score it
 * against the transformed ground truth, and print one table row per corpus subset and tier.
 *
 *   node src/core/omr/eval/cli.cjs --tier clean,scan --dump failures
 */
import { join } from 'node:path';
import type { GrayImage } from '../image/gray';
import { type AnalyzeOptions, analyzePage } from '../page';
import { readAnalyzedPage } from '../pipeline';
import type { OmrPage, StaffRecognizers } from '../types';
import { dumpDir, dumpPage } from './debug';
import { type DegradeTier, TIERS, degrade, hashString } from './degrade';
import { loadFixture, loadManifest } from './fixtures';
import { type PageScore, addScore, emptyScore, f1, percentileOf, precision, rate, recall, scorePage } from './metrics';
import { type StripAccuracy, stripAccuracy } from './strips';
import type { FixtureMeta, GroundTruth } from './truth';

/** Options for {@link runEvaluation}. */
export interface EvalOptions {
  tiers?: DegradeTier[];
  fixtures?: FixtureMeta[];
  /** Staff recognizers; without them only the layout is scored. */
  recognizers?: StaffRecognizers;
  /** Added to the per-fixture seed of the degradation (default 1). */
  seed?: number;
  /** Write annotated pictures: for every page, or only for pages with a layout mistake. */
  dump?: 'none' | 'all' | 'failures';
  dumpDir?: string;
  analyze?: AnalyzeOptions;
  /** Also cut the staff strips and check that note heads / tab numbers land on the right position (slower). */
  strips?: boolean;
  /** Called after each page (progress output). */
  onPage?: (result: PageResult) => void;
}

/** Outcome of one fixture at one tier. */
export interface PageResult {
  id: string;
  subset: FixtureMeta['subset'];
  tier: DegradeTier;
  score: PageScore;
  /** Preprocessing + layout time, ms. */
  ms: number;
  /** Staff recognizers + assembly time, ms (0 without recognizers). */
  symbolMs: number;
  timings: Record<string, number>;
  correction: string;
  /** True when every staff, kind, system and bar line of the page is right. */
  layoutOk: boolean;
  /** Strip geometry check (when asked for). */
  strips?: StripAccuracy;
  dumpPath?: string;
}

/** Aggregated outcome of one subset at one tier. */
export interface EvalRow {
  subset: string;
  tier: DegradeTier;
  score: PageScore;
  ms: number[];
  symbolMs: number[];
  layoutOk: number;
  /** Summed strip checks. */
  heads: number;
  headsOnPosition: number;
  headErrorSum: number;
  digits: number;
  digitsOnLine: number;
}

/** Everything {@link runEvaluation} measured. */
export interface EvalReport {
  rows: EvalRow[];
  pages: PageResult[];
  symbols: boolean;
}

/** The seed used for a fixture at a tier (so tests and the runner degrade identically). */
export function tierSeed(id: string, tier: DegradeTier, seed = 1): number {
  return hashString(`${id}|${tier}`) + seed;
}

/** Run the pipeline on one degraded fixture and return the recognised page plus what is needed to score it. */
export async function runFixture(meta: FixtureMeta | string, tier: DegradeTier, opts: Pick<EvalOptions, 'recognizers' | 'seed' | 'analyze' | 'strips'> = {}): Promise<{ page: OmrPage; truth: GroundTruth; gray: GrayImage; ms: number; symbolMs: number; timings: Record<string, number>; correction: string; strips?: StripAccuracy }> {
  const fx = loadFixture(meta);
  const d = degrade(fx.gray, fx.truth, tier, tierSeed(fx.meta.id, tier, opts.seed ?? 1));
  const t0 = performance.now();
  const analysis = analyzePage(d.gray, opts.analyze);
  const ms = performance.now() - t0;
  let page = analysis.page;
  let symbolMs = 0;
  const rec = opts.recognizers;
  if (rec && (rec.tab || rec.notation)) {
    // The real page pipeline: context carried between staves, notation and tab linked and
    // reconciled, measures checked.
    const t1 = performance.now();
    page = await readAnalyzedPage(analysis, { tab: rec.tab ?? null, notation: rec.notation ?? null, yieldBetweenStaves: false });
    symbolMs = performance.now() - t1;
  }
  const strips = opts.strips ? stripAccuracy(analysis, d.truth as GroundTruth) : undefined;
  return { page, truth: d.truth as GroundTruth, gray: d.gray, ms, symbolMs, timings: analysis.pre.timings, correction: analysis.pre.correction, strips };
}

/** Evaluate the pipeline over fixtures and tiers. */
export async function runEvaluation(opts: EvalOptions = {}): Promise<EvalReport> {
  const tiers = opts.tiers ?? TIERS;
  const fixtures = opts.fixtures ?? loadManifest();
  const dump = opts.dump ?? 'none';
  const dir = opts.dumpDir ?? dumpDir();
  const pages: PageResult[] = [];
  const rows = new Map<string, EvalRow>();
  for (const tier of tiers) {
    for (const meta of fixtures) {
      const r = await runFixture(meta, tier, opts);
      const score = scorePage(r.page, r.truth);
      const layoutOk = score.stavesMatched === score.stavesTruth && score.stavesDetected === score.stavesTruth && rate(score.kind) === 1 &&
        rate(score.systems) === 1 && score.barlines.fp === 0 && score.barlines.fn === 0;
      const result: PageResult = { id: meta.id, subset: meta.subset, tier, score, ms: r.ms, symbolMs: r.symbolMs, timings: r.timings, correction: r.correction, layoutOk, strips: r.strips };
      if (dump === 'all' || (dump === 'failures' && !layoutOk)) {
        result.dumpPath = join(dir, `${meta.id}.${tier}.page.png`);
        dumpPage(result.dumpPath, r.gray, r.page, r.truth);
      }
      pages.push(result);
      opts.onPage?.(result);
      for (const key of [`${meta.subset}|${tier}`, `all|${tier}`]) {
        let row = rows.get(key);
        if (!row) {
          row = { subset: key.split('|')[0], tier, score: emptyScore(), ms: [], symbolMs: [], layoutOk: 0, heads: 0, headsOnPosition: 0, headErrorSum: 0, digits: 0, digitsOnLine: 0 };
          rows.set(key, row);
        }
        addScore(row.score, score);
        row.ms.push(r.ms);
        row.symbolMs.push(r.symbolMs);
        if (layoutOk) row.layoutOk++;
        if (r.strips) {
          row.heads += r.strips.heads;
          row.headsOnPosition += r.strips.headsOnPosition;
          row.headErrorSum += r.strips.headError * r.strips.heads;
          row.digits += r.strips.digits;
          row.digitsOnLine += r.strips.digitsOnLine;
        }
      }
    }
  }
  const order = ['notation', 'tab', 'linked', 'all'];
  const sorted = [...rows.values()].sort((a, b) => tiers.indexOf(a.tier) - tiers.indexOf(b.tier) || order.indexOf(a.subset) - order.indexOf(b.subset));
  return { rows: sorted, pages, symbols: !!(opts.recognizers && (opts.recognizers.tab || opts.recognizers.notation)) };
}

const pct = (v: number): string => `${(v * 100).toFixed(1)}`.padStart(5);

function table(headers: string[], lines: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cells: string[]): string => cells.map((c, i) => (i < 2 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  return [fmt(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...lines.map(fmt)].join('\n');
}

/** Render the report as text tables: layout always, symbols when recognizers were given. */
export function formatReport(report: EvalReport): string {
  const out: string[] = [];
  out.push('LAYOUT (staff detection, geometry, kinds, systems, bar lines, time)');
  out.push(table(
    ['tier', 'subset', 'pages', 'staves', 'det%', 'prec%', 'lineErr', 'p95', 'max', 'endErr', 'kind%', 'sys%', 'barP%', 'barR%', 'barF1', 'type%', 'meas%', 'pageOK', 'ms', 'msMax'],
    report.rows.map((r) => {
      const s = r.score;
      return [
        r.tier, r.subset, String(s.pages), `${s.stavesMatched}/${s.stavesTruth}`,
        pct(s.stavesTruth ? s.stavesMatched / s.stavesTruth : 1), pct(s.stavesDetected ? s.stavesMatched / s.stavesDetected : 1),
        s.stavesMatched ? (s.lineErrorSum / s.stavesMatched).toFixed(3) : '-', percentileOf(s.lineErrors, 0.95).toFixed(3), s.lineErrorMax.toFixed(3),
        s.stavesMatched ? (s.endErrorSum / (2 * s.stavesMatched)).toFixed(2) : '-',
        pct(rate(s.kind)), pct(rate(s.systems)), pct(precision(s.barlines)), pct(recall(s.barlines)), f1(s.barlines).toFixed(3), pct(rate(s.barlineType)), pct(rate(s.measureCount)),
        `${r.layoutOk}/${s.pages}`, (r.ms.reduce((a, b) => a + b, 0) / r.ms.length).toFixed(0), Math.max(...r.ms).toFixed(0),
      ];
    }),
  ));
  out.push('  lineErr / p95 / max: mean distance between detected and true staff lines, in staff spaces, per matched staff');
  out.push('  endErr: mean error of the staff ends in staff spaces; ms: preprocess + layout per page');
  if (report.rows.some((r) => r.heads + r.digits > 0)) {
    out.push('');
    out.push('STAFF STRIPS (where the true note heads and tab numbers land in the strips the recognizers get)');
    out.push(table(
      ['tier', 'subset', 'heads', 'onPos%', 'posErr', 'digits', 'onLine%'],
      report.rows.map((r) => [
        r.tier, r.subset, String(r.heads), r.heads ? pct(r.headsOnPosition / r.heads) : '-', r.heads ? (r.headErrorSum / r.heads).toFixed(3) : '-',
        String(r.digits), r.digits ? pct(r.digitsOnLine / r.digits) : '-',
      ]),
    ));
    out.push('  onPos%: heads of matched staves whose strip y is within half a step of the true staff position; posErr in half spaces');
    out.push('  onLine%: tab numbers of matched staves within 0.3 space of their string line');
  }
  if (report.symbols) {
    out.push('');
    out.push('SYMBOLS (staff recognizers)');
    out.push(table(
      ['tier', 'subset', 'noteP%', 'noteR%', 'pitch%', 'dur%', 'restF1', 'acc%', 'tie%', 'measEx%', 'key%', 'time%', 'tabP%', 'tabR%', 'fret%', 'str%', 'tabDur%', 'tabMeasEx%', 'pageS', 'pageSmax'],
      report.rows.map((r) => {
        const s = r.score;
        return [
          r.tier, r.subset, pct(precision(s.notes)), pct(recall(s.notes)), pct(rate(s.pitch)), pct(rate(s.duration)), f1(s.rests).toFixed(3), pct(rate(s.accidentals)), pct(rate(s.ties)),
          pct(rate(s.measureExact)), pct(rate(s.key)), pct(rate(s.time)), pct(precision(s.tabNotes)), pct(recall(s.tabNotes)), pct(rate(s.fret)), pct(rate(s.string)), pct(rate(s.tabDuration)), pct(rate(s.tabMeasureExact)),
          (r.ms.reduce((a, b, i) => a + b + r.symbolMs[i], 0) / r.ms.length / 1000).toFixed(2), (Math.max(...r.ms.map((v, i) => v + r.symbolMs[i])) / 1000).toFixed(2),
        ];
      }),
    ));
    out.push('  pitch / dur / fret / str: accuracy on matched elements; measEx: measures where every event is right');
    out.push('  pageS / pageSmax: whole pipeline per page (preprocess, layout, every staff, assembly), mean and max seconds');
  }
  return out.join('\n');
}
