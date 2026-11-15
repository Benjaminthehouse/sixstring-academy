#!/usr/bin/env node
/**
 * Fast development loop for the tab reader: runs it on cached staff strips of every fixture with
 * a tab staff (the cache is built on first use under e2e/out/omr/tab-cache/, about 100 MB).
 *
 *   node src/core/omr/tab/dev/tab-eval.cjs                          # all tiers, summary per tier / font / dpi
 *   node src/core/omr/tab/dev/tab-eval.cjs --tier clean,scan --dump # + contact sheets of the mistakes
 *   node src/core/omr/tab/dev/tab-eval.cjs --match tab-ode --show   # + every strip with its reading drawn in
 *   node src/core/omr/tab/dev/tab-eval.cjs --fixtures               # also one line per fixture
 *   node src/core/omr/tab/dev/tab-eval.cjs --rebuild                # rebuild the cache (after the foundation changed)
 *   node src/core/omr/tab/dev/tab-eval.cjs --seed 2                 # another draw of the degradations
 *   node src/core/omr/tab/dev/tab-eval.cjs --own                    # the reader's own pages: technique marks, held-out faces, bass tab
 *
 * The official numbers are those of src/core/omr/eval/cli.cjs; this tool scores the same way
 * (matching by box centre within 0.6 staff space) but in strip coordinates.
 */
'use strict';
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const flag = (name) => args.includes(name);

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } });
  try {
    const mod = await server.ssrLoadModule('/src/core/omr/tab/dev/evaluate.ts');
    const t0 = Date.now();
    const res = mod.evaluateTab({
      tiers: (opt('--tier') || 'clean,scan,photo-good,photo-bad').split(','),
      match: opt('--match') || undefined,
      seed: Number(opt('--seed') || 1),
      rebuild: flag('--rebuild'),
      dump: flag('--dump'),
      show: flag('--show'),
      own: flag('--own'),
      explain: flag('--explain'),
      noDuration: flag('--no-dur'),
      log: (l) => console.log(l),
    });
    const text = flag('--fixtures') ? res.text : res.text.split('\n').filter((l) => !l.includes(' fixture ')).join('\n');
    console.log(flag('--brief') ? text.split('\n').filter((l) => l.startsWith('group') || l.startsWith('tier') || l.startsWith('conf') || l.startsWith('time')).join('\n') : text);
    console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    await server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
