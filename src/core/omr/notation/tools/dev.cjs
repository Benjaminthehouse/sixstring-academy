#!/usr/bin/env node
/**
 * Development driver of the notation recognizer (loads the TypeScript through Vite, no build).
 *
 *   node src/core/omr/notation/tools/dev.cjs explore <match> [tier]
 *   node src/core/omr/notation/tools/dev.cjs run [--tier clean,scan] [--match ode] [--seed 1] [--dump] [--mistakes] [--verbose]
 *   node src/core/omr/notation/tools/dev.cjs extra [match] [--tier scan] [--seed 1]      the recognizer's own pages
 *   node src/core/omr/notation/tools/dev.cjs inspect <fixture> <tier> <staff> <x0> <x1>  what was found in a stretch
 *   node src/core/omr/notation/tools/dev.cjs seeds <fixture> <tier> <staff> <x0> <x1>    head seeds and verdicts
 *   node src/core/omr/notation/tools/dev.cjs nl <fixture> <tier> <staff> <x> <y> <w> <h> [scale]   line-free binary crop
 *   node src/core/omr/notation/tools/dev.cjs headstats <match> <tier>                    head features at true positions
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
    const load = (p) => server.ssrLoadModule(p);
    const cmd = args[0];
    if (cmd === 'explore') {
      const m = await load('/src/core/omr/notation/tools/explore.ts');
      for (const l of m.explore(args[1] || '', args[2] || 'clean')) console.log(l);
    } else if (cmd === 'inspect') {
      const m = await load('/src/core/omr/notation/tools/inspect.ts');
      for (const l of m.inspect(args[1], args[2] || 'clean', Number(args[3] || 0), Number(args[4] || 0), Number(args[5] || 1e9))) console.log(l);
    } else if (cmd === 'nl') {
      const m = await load('/src/core/omr/notation/tools/inspect.ts');
      for (const l of m.dumpNl(args[1], args[2] || 'clean', Number(args[3] || 0), Number(args[4]), Number(args[5]), Number(args[6]), Number(args[7]), Number(args[8] || 4))) console.log(l);
    } else if (cmd === 'seeds') {
      const m = await load('/src/core/omr/notation/tools/inspect.ts');
      for (const l of m.seeds(args[1], args[2] || 'clean', Number(args[3] || 0), Number(args[4]), Number(args[5]))) console.log(l);
    } else if (cmd === 'extra') {
      const m = await load('/src/core/omr/notation/tools/extra.ts');
      const r = await load('/src/core/omr/notation/index.ts');
      let me = 0, mt = 0, er = 0, et = 0;
      for (const spec of m.loadExtraIndex()) {
        if (args[1] && !args[1].startsWith('--') && !spec.id.includes(args[1])) continue;
        let gray = m.loadExtraImage(spec);
        const tier = opt('--tier');
        if (tier && tier !== 'clean') {
          const dg = await load('/src/core/omr/eval/degrade.ts');
          gray = dg.degrade(gray, null, tier, dg.hashString(`${spec.id}|${tier}`) + Number(opt('--seed') || 1)).gray;
        }
        const res = await m.checkExtra(spec, r.recognizeNotationStaff, gray);
        me += res.measuresExact; mt += res.measures; er += res.eventsRight; et += res.events;
        console.log(`${spec.id.padEnd(24)} measures ${res.measuresExact}/${res.measures} events ${res.eventsRight}/${res.events} clef ${res.clefOk ? 'ok' : 'NO'} key ${res.keyOk ? 'ok' : 'NO'} time ${res.timeOk ? 'ok' : 'NO'}`);
        for (const d of res.diffs) console.log(`    ${d}`);
      }
      console.log(`total measures ${me}/${mt} events ${er}/${et}`);
    } else if (cmd === 'headstats') {
      const m = await load('/src/core/omr/notation/tools/explore.ts');
      for (const l of m.headStats(args[1] || '', args[2] || 'clean')) console.log(l);
    } else {
      const m = await load('/src/core/omr/notation/tools/run.ts');
      await m.main({
        cmd,
        tiers: (opt('--tier') || 'clean').split(','),
        match: opt('--match') || '',
        subset: opt('--subset') || '',
        dump: flag('--dump'),
        verbose: flag('--verbose'),
        seed: Number(opt('--seed') || 1),
        staff: opt('--staff') === null ? -1 : Number(opt('--staff')),
        args,
      });
    }
  } finally {
    await server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
