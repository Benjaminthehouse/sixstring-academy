#!/usr/bin/env node
/**
 * Pictures of every Reference section, for looking at: phone (390 px) and desktop (1280 px), dark
 * and light. One dev server, one browser.
 *
 *   node e2e/reference-shots.cjs                       every section, both sizes, both themes
 *   node e2e/reference-shots.cjs --only keys,intervals --size phone --theme light [--full] [--sideways]
 *
 * Writes e2e/out/reference-<section>-<size>-<theme>.png and prints the files, any console errors
 * and any sideways page scroll.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, VIEWPORTS, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const val = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const SECTIONS = ['index', 'circle', 'keys', 'intervals', 'chords', 'scales', 'harmony', 'notation', 'tunings', 'glossary'];
const only = val('only', '') ? val('only').split(',') : SECTIONS;
const sizes = val('size', '') ? [val('size')] : ['phone', 'desktop'];
const themes = val('theme', '') ? [val('theme')] : ['dark', 'light'];
const full = argv.includes('--full');
const sideways = argv.includes('--sideways');
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  let problems = 0;
  try {
    for (const size of sizes) {
      for (const theme of themes) {
        const phone = size === 'phone';
        const viewport = sideways ? { width: 844, height: 390 } : VIEWPORTS[phone ? 'mobile' : 'desktop'];
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme, hasTouch: phone, isMobile: phone });
        await context.addInitScript(() => {
          try {
            localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
          } catch {
            /* ignore */
          }
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
        for (const s of only) {
          const hash = s === 'index' ? '#reference' : `#reference--${s}`;
          await page.goto(server.url + hash, { waitUntil: 'load' });
          await page.waitForSelector('main[data-route="reference"] [data-ui-page]', { timeout: 30000 });
          await page.waitForTimeout(Number(val('wait', 2500)));
          const name = `reference-${s}-${sideways ? 'sideways' : size}-${theme}`;
          const file = path.join(OUT, `${name}.png`);
          await page.screenshot({ path: file, fullPage: full });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          console.log(`${file}${overflow > 1 ? `  WARNING: page scrolls sideways by ${overflow}px` : ''}`);
          if (overflow > 1) problems++;
        }
        if (errors.length) {
          problems += errors.length;
          console.log(`errors (${size}, ${theme}):\n  ${errors.join('\n  ')}`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  process.exit(problems ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
