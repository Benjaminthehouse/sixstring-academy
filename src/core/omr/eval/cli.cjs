#!/usr/bin/env node
/**
 * OMR evaluation from the command line (loads the TypeScript sources through Vite, no build step).
 *
 *   node src/core/omr/eval/cli.cjs                        # layout table: every fixture, every tier
 *   node src/core/omr/eval/cli.cjs --tier clean,scan      # some tiers
 *   node src/core/omr/eval/cli.cjs --subset tab --match ode
 *   node src/core/omr/eval/cli.cjs --sample               # the fast subsample the unit tests use
 *   node src/core/omr/eval/cli.cjs --corpus unseen        # the independent corpus (fixtures-unseen/, scripts/omr-unseen.cjs)
 *   node src/core/omr/eval/cli.cjs --corpus unseen --tier clean --mistakes [--dump-mistakes]
 *                                                         # every symbol mistake per page; pictures in e2e/out/omr/mistakes/
 *   node src/core/omr/eval/cli.cjs --dump failures        # annotated PNGs under e2e/out/omr/ (or --dump all)
 *   node src/core/omr/eval/cli.cjs --pages                # one line per page
 *   node src/core/omr/eval/cli.cjs --no-strips            # skip the staff-strip geometry check (faster)
 *   node src/core/omr/eval/cli.cjs --strips <fixture-id>  # write the staff strips of one page (tier via --tier)
 *   node src/core/omr/eval/cli.cjs --bench [--tier photo-good] [--width 2480]   # time a full-page capture
 *   node src/core/omr/eval/cli.cjs --norm <fixture-id> [--view gray|binary|lines|strokes|noLines]
 *                                                         # write the normalised page with its layout
 *
 * Staff recognizers are picked up automatically once they exist: src/core/omr/tab/index.ts must
 * export `recognizeTabStaff`, src/core/omr/notation/index.ts `recognizeNotationStaff`. Pass
 * --no-symbols to score the layout only.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const flag = (name) => args.includes(name);

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } });
  try {
    const load = (p) => server.ssrLoadModule(p);
    const runner = await load('/src/core/omr/eval/runner.ts');
    const fixtures = await load('/src/core/omr/eval/fixtures.ts');
    const tiers = (opt('--tier') || 'clean,scan,photo-good,photo-bad').split(',');
    const corpus = opt('--corpus') || 'base';
    let list = flag('--sample') ? fixtures.defaultSample() : fixtures.loadManifest(corpus);
    if (opt('--subset')) list = list.filter((m) => m.subset === opt('--subset'));
    if (opt('--match')) list = list.filter((m) => m.id.includes(opt('--match')));

    if (opt('--strips')) {
      const tools = await load('/src/core/omr/eval/strips.ts');
      for (const line of await tools.dumpStrips(opt('--strips'), tiers[0], Number(opt('--seed') || 1))) console.log(line);
      return;
    }

    if (flag('--bench')) {
      const tools = await load('/src/core/omr/eval/bench.ts');
      for (const line of tools.benchmark(opt('--match') || 'page-linked-bravura-150', tiers.length === 4 ? 'clean' : tiers[0], Number(opt('--width') || 2480))) console.log(line);
      return;
    }
    if (opt('--norm')) {
      const tools = await load('/src/core/omr/eval/strips.ts');
      console.log(tools.dumpNormalized(opt('--norm'), tiers[0], opt('--view') || 'binary', Number(opt('--seed') || 1)));
      return;
    }

    const recognizers = {};
    if (!flag('--no-symbols')) {
      if (fs.existsSync(path.join(ROOT, 'src/core/omr/tab/index.ts'))) recognizers.tab = (await load('/src/core/omr/tab/index.ts')).recognizeTabStaff;
      if (fs.existsSync(path.join(ROOT, 'src/core/omr/notation/index.ts'))) recognizers.notation = (await load('/src/core/omr/notation/index.ts')).recognizeNotationStaff;
    }
    if (flag('--classify')) {
      // The quick page classifier over the corpus: expected kind from the subset.
      const cls = await load('/src/core/omr/classify-page.ts');
      const deg = await load('/src/core/omr/eval/degrade.ts');
      const want = { notation: 'notation', tab: 'tab', linked: 'both' };
      for (const tier of tiers) {
        let right = 0;
        const ms = [];
        const wrong = [];
        for (const meta of list) {
          const fx = fixtures.loadFixture(meta);
          const d = deg.degrade(fx.gray, fx.truth, tier, runner.tierSeed(meta.id, tier, Number(opt('--seed') || 1)));
          const c = cls.classifyPage(d.gray);
          ms.push(c.ms);
          if (c.kind === want[meta.subset]) right++;
          else wrong.push(`${meta.id}=${c.kind}`);
        }
        ms.sort((a, b) => a - b);
        console.log(`${tier.padEnd(10)} ${right}/${list.length} right, median ${ms[ms.length >> 1].toFixed(0)} ms, max ${ms[ms.length - 1].toFixed(0)} ms${wrong.length ? `; wrong: ${wrong.join(' ')}` : ''}`);
      }
      return;
    }
    if (flag('--mistakes')) {
      const mk = await load('/src/core/omr/eval/mistakes.ts');
      const dir = path.join(ROOT, 'e2e', 'out', 'omr', 'mistakes');
      fs.mkdirSync(dir, { recursive: true });
      const totals = {};
      for (const tier of tiers) {
        for (const meta of list) {
          const r = await runner.runFixture(meta, tier, { recognizers, seed: Number(opt('--seed') || 1) });
          const ms = mk.listMistakes(r.page, r.truth);
          for (const m of ms) totals[m.kind] = (totals[m.kind] || 0) + 1;
          const by = {};
          for (const m of ms) by[m.kind] = (by[m.kind] || 0) + 1;
          console.log(`${tier.padEnd(10)} ${meta.id.padEnd(32)} ${ms.length ? Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') : 'no mistakes'}`);
          if (flag('--verbose')) for (const m of ms) console.log(`    ${m.kind.padEnd(12)} x ${m.x.toFixed(0).padStart(5)} y ${m.y.toFixed(0).padStart(5)} ${m.detail}${m.confidence !== undefined ? ` (conf ${m.confidence.toFixed(2)})` : ''}`);
          if (flag('--dump-mistakes') && ms.length) mk.dumpMistakes(path.join(dir, `${meta.id}.${tier}.png`), r.gray, ms, r.truth.staffSpace);
        }
      }
      console.log('\ntotals:', Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(', '));
      return;
    }
    const t0 = Date.now();
    const report = await runner.runEvaluation({
      tiers,
      fixtures: list,
      recognizers,
      seed: Number(opt('--seed') || 1),
      dump: opt('--dump') || 'none',
      strips: !flag('--no-strips'),
      onPage: (r) => {
        if (flag('--pages') || !r.layoutOk) {
          const s = r.score;
          console.log(`${r.layoutOk ? 'ok  ' : 'FAIL'} ${r.tier.padEnd(10)} ${r.id.padEnd(36)} staves ${s.stavesMatched}/${s.stavesTruth} (+${s.stavesDetected - s.stavesMatched}) kind ${s.kind.correct}/${s.kind.total} sys ${s.systems.correct}/${s.systems.total} bars tp ${s.barlines.tp} fp ${s.barlines.fp} fn ${s.barlines.fn} err ${s.stavesMatched ? (s.lineErrorSum / s.stavesMatched).toFixed(3) : '-'} ${r.correction} ${r.ms.toFixed(0)}ms${r.dumpPath ? ' -> ' + path.relative(ROOT, r.dumpPath) : ''}`);
        }
      },
    });
    console.log('');
    console.log(runner.formatReport(report));
    console.log(`\n${report.pages.length} page runs in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    await server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
