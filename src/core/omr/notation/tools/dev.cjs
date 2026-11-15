#!/usr/bin/env node
/**
 * Development driver of the notation recognizer (loads the TypeScript through Vite, no build).
 *
 *   node src/core/omr/notation/tools/dev.cjs explore <match> [tier]
 *   node src/core/omr/notation/tools/dev.cjs run [--tier clean,scan] [--match ode] [--dump] [--verbose]
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
