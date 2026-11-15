#!/usr/bin/env node
/**
 * Run every browser check in e2e/, one after another, and print a summary.
 *
 *   node e2e/run-all.cjs                 all checks
 *   node e2e/run-all.cjs --quick         pass --quick to the checks that support it
 *   node e2e/run-all.cjs --only tuner,profile
 *   node e2e/run-all.cjs --skip audio-stress
 *   node e2e/run-all.cjs --list          show what would run
 *
 * A check is any e2e/<name>.cjs that is not a helper: helpers are lib/, *-lib.cjs, *-seed.cjs,
 * *-shots.cjs, shot.cjs and this file. Each check prints its own details and exits non-zero on
 * failure. Checks run one at a time because each starts its own dev server and browser.
 */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DIR = __dirname;
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const listArg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : null;
};

const HELPER = /(^shot|^run-all|-lib|-seed|-shots)\.cjs$/;
const all = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.cjs') && !HELPER.test(f))
  .map((f) => f.replace(/\.cjs$/, ''))
  .sort();

const only = listArg('--only');
const skip = listArg('--skip') || [];
for (const name of [...(only || []), ...skip]) {
  if (!all.includes(name)) {
    console.error(`Unknown check "${name}". Known: ${all.join(', ')}`);
    process.exit(2);
  }
}
const checks = all.filter((n) => (!only || only.includes(n)) && !skip.includes(n));

if (flag('--list')) {
  console.log(checks.join('\n'));
  process.exit(0);
}

function supportsQuick(file) {
  return fs.readFileSync(file, 'utf8').includes("'--quick'");
}

function run(name) {
  const file = path.join(DIR, `${name}.cjs`);
  const args = [file];
  if (flag('--quick') && supportsQuick(file)) args.push('--quick');
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: path.join(DIR, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const keep = (chunk) => {
      tail = (tail + chunk.toString()).slice(-4000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('close', (code, signal) => {
      resolve({ name, ok: code === 0, code: code ?? signal, seconds: (Date.now() - started) / 1000, tail });
    });
  });
}

(async () => {
  console.log(`Running ${checks.length} browser checks${flag('--quick') ? ' (quick)' : ''}: ${checks.join(', ')}\n`);
  const results = [];
  for (const name of checks) {
    process.stdout.write(`${name.padEnd(22)} … `);
    const r = await run(name);
    results.push(r);
    console.log(`${r.ok ? 'PASSED' : 'FAILED'}  ${r.seconds.toFixed(0)} s`);
    if (!r.ok) console.log(r.tail.split('\n').slice(-25).map((l) => '    ' + l).join('\n'));
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (failed.length) {
    console.log(`Failed: ${failed.map((r) => r.name).join(', ')}. Re-run one with: node e2e/<name>.cjs`);
    process.exit(1);
  }
})();
