#!/usr/bin/env node
/**
 * Check of the Claude-artifact build (`npm run build:artifact` = vite build --mode artifact +
 * scripts/make-artifact.mjs), built into a temp dir:
 *
 *   page.html     title, entry stylesheet + module script with relative assets/ paths, the root
 *   escaping      no raw ESC byte left in any text file; the pdf.js worker's three became \x1b
 *                 and it still parses as a module
 *   listing       files.json (or files-N.json): every file with a content type (.mjs is
 *                 text/javascript), nothing from vendor/tesseract or vendor/mediapipe, within the
 *                 host's limits (255 files and 64 MB a publish, 511 files a version)
 *   it runs       page.html, wrapped in a document the way the host wraps it, opens the app
 *                 (#home and #scales) with no service worker and no page errors
 *
 *   node e2e/pwa-artifact.cjs
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { serveDir, buildInto } = require('./perf-lib.cjs');
const { ROOT, VIEWPORTS } = require('./lib/harness.cjs');

let failures = 0;
function check(group, name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail !== undefined ? `  (${detail})` : ''}`);
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return fs.statSync(full).isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-artifact-'));
  const dist = path.join(temp, 'dist-artifact');
  try {
    console.log('Building the artifact ...');
    await buildInto(dist, { mode: 'artifact' });
    const workerBefore = walk(dist).find((f) => /^assets\/pdf\.worker.*\.mjs$/.test(f));
    const escBefore = workerBefore ? (fs.readFileSync(path.join(dist, workerBefore), 'latin1').match(/\x1b/g) ?? []).length : 0;
    const output = execFileSync(process.execPath, [path.join(ROOT, 'scripts/make-artifact.mjs'), dist], { encoding: 'utf8' });
    process.stdout.write(output.split('\n').map((l) => `         ${l}`).join('\n') + '\n');

    // page.html
    const page = fs.readFileSync(path.join(dist, 'page.html'), 'utf8');
    check('page', 'page.html has the title', page.includes('<title>Sixstring Academy</title>'));
    const css = /<link rel="stylesheet" href="(assets\/index-[^"]+\.css)">/.exec(page);
    const js = /<script type="module" src="(assets\/index-[^"]+\.js)"><\/script>/.exec(page);
    check('page', 'it links the entry stylesheet and module script with relative assets/ paths', !!css && !!js && fs.existsSync(path.join(dist, css[1])) && fs.existsSync(path.join(dist, js[1])));
    check('page', 'and ends with <div id="root"></div>', page.trim().endsWith('<div id="root"></div>'));
    check('page', 'nothing standalone-only: no manifest, no service worker, no "./" paths', !/manifest|sw\.js|"\.\//.test(page));

    // listing
    const lists = fs.readdirSync(dist).filter((f) => /^files(-\d+)?\.json$/.test(f));
    const entries = lists.flatMap((f) => Object.entries(JSON.parse(fs.readFileSync(path.join(dist, f), 'utf8'))));
    check('listing', `the files are listed (${lists.join(', ')})`, lists.length >= 1 && entries.length > 100, entries.length);
    check('listing', 'each list fits one publish (255 files)', lists.every((f) => Object.keys(JSON.parse(fs.readFileSync(path.join(dist, f), 'utf8'))).length <= 255));
    check('listing', 'the page and its files fit one artifact version (511 files)', entries.length + 1 <= 511, entries.length + 1);
    const missing = entries.filter(([rel, v]) => v.from !== rel || !fs.existsSync(path.join(dist, v.from)));
    check('listing', 'every listed file exists at its published path', missing.length === 0, missing[0] && missing[0][0]);
    check('listing', 'every file has a content type', entries.every(([, v]) => typeof v.contentType === 'string' && v.contentType.includes('/')));
    const mjs = entries.filter(([rel]) => rel.endsWith('.mjs'));
    check('listing', '.mjs files are text/javascript', mjs.length > 0 && mjs.every(([, v]) => v.contentType === 'text/javascript'), mjs.map(([r, v]) => `${r}: ${v.contentType}`)[0]);
    const vendor = entries.filter(([rel]) => /^vendor\/(tesseract|mediapipe)\//.test(rel));
    check('listing', 'nothing from vendor/tesseract or vendor/mediapipe', vendor.length === 0, vendor[0] && vendor[0][0]);
    check('listing', 'pdf.js extras that the importer uses are there (standard fonts, decoders)', entries.some(([rel]) => rel.startsWith('vendor/pdfjs/standard_fonts/')) && entries.some(([rel]) => rel.startsWith('vendor/pdfjs/wasm/')));
    check('listing', 'no source maps, no index.html (page.html is the page)', !entries.some(([rel]) => rel.endsWith('.map') || rel === 'index.html' || rel === 'page.html'));
    check('listing', 'the total size is printed', /total \d+\.\d\d MB in \d+ files/.test(output));

    // escaping
    const textFiles = entries.filter(([, v]) => /^text\/|json|svg/.test(v.contentType)).map(([rel]) => rel);
    const withEsc = textFiles.filter((rel) => fs.readFileSync(path.join(dist, rel)).includes(0x1b));
    check('escaping', 'no raw ESC byte is left in any text file', withEsc.length === 0, withEsc[0]);
    const worker = entries.map(([rel]) => rel).find((rel) => /^assets\/pdf\.worker.*\.mjs$/.test(rel));
    const workerText = fs.readFileSync(path.join(dist, worker), 'utf8');
    check('escaping', `the pdf.js worker had raw ESC bytes (${escBefore}) and now has as many \\x1b escapes`, escBefore === 3 && (workerText.match(/\\x1b/g) ?? []).length >= escBefore, `${escBefore} raw before`);
    let parses = true;
    try {
      execFileSync(process.execPath, ['--check', path.join(dist, worker)], { stdio: 'pipe' });
    } catch {
      parses = false;
    }
    check('escaping', 'and it still parses as a module', parses);
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/make-artifact.mjs'), dist], { encoding: 'utf8' });
    check('escaping', 'running the script again changes nothing (no double escaping)', fs.readFileSync(path.join(dist, worker), 'utf8') === workerText);

    // it runs: the host wraps page.html in a document skeleton
    const wrapped = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${page}</body></html>`;
    const server = await serveDir(dist, { rewrite: (rel, buf) => (rel === 'index.html' ? Buffer.from(wrapped) : buf) });
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ viewport: VIEWPORTS.mobile, isMobile: true, hasTouch: true });
      await context.addInitScript(() => localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}'));
      const pg = await context.newPage();
      const errors = [];
      pg.on('pageerror', (e) => errors.push(e.message));
      await pg.goto(`${server.url}#home`);
      const home = await pg.waitForSelector('main[data-route="home"] [data-ui-page]', { timeout: 60000 }).then(() => true, () => false);
      check('runs', 'page.html opens the app (#home)', home);
      await pg.evaluate(() => (location.hash = '#scales'));
      const scales = await pg.waitForSelector('[data-scales] [data-neck]', { timeout: 60000 }).then(() => true, () => false);
      check('runs', 'and a lazily loaded screen (#scales)', scales);
      await pg.waitForTimeout(1500);
      const regs = await pg.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
      check('runs', 'with no service worker', regs === 0, regs);
      check('runs', 'and no page errors', errors.length === 0, errors[0]);
      await pg.screenshot({ path: path.join(ROOT, 'e2e', 'out', 'pwa-artifact-scales-mobile.png') });
    } finally {
      await browser.close();
      await server.close();
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll artifact checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
