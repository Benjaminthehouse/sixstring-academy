#!/usr/bin/env node
/**
 * The sheet reader in the PRODUCTION build, not only in the dev server: builds the app into
 * e2e/out/omr-build/ (vite build, no typecheck), serves that folder (vite preview), opens Scan &
 * Import in Chromium and reads the sample sheet. Checks that the reader's worker is a bundled file
 * of the build (assets/omr.worker-*.js), that the quick look and the reading both run in it (no
 * second copy of the reader is loaded), that the reading shows every bar and note of the sample,
 * and that nothing failed in the console.
 *
 *   node e2e/omr-build.cjs [--keep]      (--keep: reuse an existing build in e2e/out/omr-build)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT } = require('./lib/harness.cjs');

const OUT = path.join(ROOT, 'e2e', 'out', 'omr-build');
const keep = process.argv.includes('--keep');
let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== undefined ? `  -- ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}

(async () => {
  const vite = await import('vite');
  if (!keep || !fs.existsSync(path.join(OUT, 'index.html'))) {
    const t0 = Date.now();
    await vite.build({ root: ROOT, logLevel: 'error', build: { outDir: OUT, emptyOutDir: true } });
    console.log(`(built in ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  const assets = fs.readdirSync(path.join(OUT, 'assets'));
  const omrWorker = assets.find((f) => /^omr\.worker-.*\.js$/.test(f));
  check('the build has the reader\'s worker as its own bundled file', !!omrWorker, assets.filter((f) => /worker/.test(f)));
  const workerSource = omrWorker ? fs.readFileSync(path.join(OUT, 'assets', omrWorker), 'utf8') : '';
  check('the bundled worker holds the reader and the quick look', /lookAtPage|look/.test(workerSource) && workerSource.length > 100_000, workerSource.length);

  const server = await vite.preview({ root: ROOT, logLevel: 'error', build: { outDir: OUT }, preview: { port: 0, host: '127.0.0.1', strictPort: false } });
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
      } catch {
        /* no storage */
      }
    });
    const page = await context.newPage();
    const errors = [];
    const workers = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    page.on('worker', (w) => {
      workers.push(w.url());
      w.on('console', (m) => {
        if (m.type() === 'error') errors.push(`worker: ${m.text()}`);
      });
    });
    await page.goto(`${url}#scan`, { waitUntil: 'load' });
    await page.waitForSelector('[data-scan="capture"]', { timeout: 60000 });
    await page.click('[data-scan-sample]');
    // The quick look ends with the page card's words; the Read button is enabled then.
    await page.waitForFunction(() => {
      const b = document.querySelector('[data-scan-read]');
      return b && !b.disabled;
    }, null, { timeout: 120000 });
    const lookWords = await page.innerText('[data-scan-page="0"]');
    check('the quick look ran in the build (notation and tab found on the sample)', /Notation and tab/.test(lookWords), lookWords.slice(0, 160));
    const t0 = Date.now();
    await page.click('[data-scan-read]');
    await page.waitForSelector('[data-scan="proof"]', { timeout: 240000 });
    await page.waitForTimeout(800);
    const readMs = Date.now() - t0;
    const notes = await page.evaluate(() => document.querySelectorAll('[data-scan-tab] [data-tab-view] g[data-beat]').length);
    const left = await page.getAttribute('[data-scan-left]', 'data-scan-left');
    check(`the sample is read in the build: ${notes} notes drawn (the sample has 30) in ${(readMs / 1000).toFixed(1)} s`, notes === 30, { notes, left });
    const omrWorkers = workers.filter((w) => /omr\.worker-/.test(w));
    check('the reader ran in the bundled worker file', omrWorkers.length >= 1 && omrWorkers.every((w) => w.includes('/assets/')), workers);
    check('no second copy of the reader was loaded (one worker for the look and the reading)', !workers.some((w) => /look\.worker/.test(w)), workers);
    check('no errors in the page or the worker', errors.length === 0, errors.slice(0, 4));
    await page.screenshot({ path: path.join(ROOT, 'e2e', 'out', 'omr-build-proof.png') });
    await context.close();
  } finally {
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
  }
  console.log(failures ? `FAILED (${failures})` : 'PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  console.log('FAILED');
  process.exit(1);
});
