#!/usr/bin/env node
/**
 * Dev-server check: the heavy libraries that screens load with import() (alphaTab, Tone.js MIDI,
 * JSZip, VexFlow, pdf.js, Tesseract, MediaPipe, the Supabase accounts client) are optimised when
 * the dev server starts, so the first import of one does not make Vite discover a new dependency,
 * re-bundle and reload the page under the developer (or under a browser check halfway through).
 *
 * The check starts the dev server with a fresh dependency cache and with discovery pointed at a
 * file that imports none of them (as when the startup scan fails on a file someone is editing),
 * so only vite.config.ts's optimizeDeps.include can bring them in. Then it opens the app and
 * imports one of them through the app's own module, and checks the page was not reloaded.
 *
 *   node e2e/perf-dev.cjs
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT } = require('./lib/harness.cjs');

const LIBRARIES = ['@coderline/alphatab/core', '@tonejs/midi', 'jszip', 'vexflow/bravura', 'pdfjs-dist', 'tesseract.js', '@mediapipe/tasks-vision', '@supabase/supabase-js'];

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail !== undefined ? `  (${detail})` : ''}`);
}

(async () => {
  const { createServer } = await import('vite');
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-vite-cache-'));
  const server = await createServer({
    root: ROOT,
    cacheDir,
    logLevel: 'error',
    // HMR stays on: it is how Vite reloads the page after discovering a new dependency.
    server: { port: 0, strictPort: false, host: '127.0.0.1', watch: null },
    // Discovery that finds nothing: only optimizeDeps.include can optimise the libraries.
    optimizeDeps: { entries: ['src/core/platform/env.ts'] },
  });
  try {
    await server.listen();
    const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
    const meta = path.join(cacheDir, 'deps', '_metadata.json');
    await fetch(url).then((r) => r.text());
    for (let i = 0; i < 120 && !fs.existsSync(meta); i++) await new Promise((r) => setTimeout(r, 500));
    const optimized = fs.existsSync(meta) ? Object.keys(JSON.parse(fs.readFileSync(meta, 'utf8')).optimized) : [];
    for (const lib of LIBRARIES) check(`${lib} is optimised when the dev server starts`, optimized.includes(lib));

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        try {
          localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
        } catch {
          /* ignore */
        }
      });
      const requested = [];
      page.on('request', (r) => requested.push(r.url()));
      let navigations = 0;
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations += 1;
      });
      await page.goto(`${url}#home`);
      await page.waitForSelector('main[data-route]', { timeout: 120000 });
      await page.waitForTimeout(1500);
      const before = navigations;
      // The MIDI importer imports @tonejs/midi at the point of use; reading a file that is not MIDI
      // still loads the library first.
      requested.length = 0;
      let interrupted = false;
      await page
        .evaluate(async () => {
          const mod = await import('/src/core/song/import-midi.ts');
          try {
            await mod.listMidiTracks(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96]));
          } catch {
            /* a broken file is fine: the library loaded */
          }
        })
        .catch(() => (interrupted = true)); // "execution context destroyed": the page reloaded under it
      await page.waitForTimeout(4000);
      const loaded = requested.filter((u) => /tonejs/.test(u));
      check('importing the MIDI library from the app loads the pre-optimised copy', loaded.some((n) => n.includes('/deps/@tonejs_midi.js')), loaded.join(', ') || 'not loaded');
      check('and does not reload the page', navigations === before && !interrupted, `${navigations - before} reload(s)`);
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll dev-server checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
