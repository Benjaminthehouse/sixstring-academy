#!/usr/bin/env node
/**
 * Screenshots of the lesson screens, several routes in one browser (faster than e2e/shot.cjs once
 * per route). Usage:
 *   node e2e/lessons-shots.cjs <route[--param]> [<route> ...] [--mobile] [--light] [--full] [--landscape] [--small]
 *   node e2e/lessons-shots.cjs --all-types [--mobile] [--light]     every exercise type in the player
 * Writes e2e/out/lessons-<route>[-mobile][-light].png and reports sideways scrolling and console
 * errors. A helper (not a check): e2e/lessons.cjs is the lasting browser check.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { withApp, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const mobile = flag('mobile') || flag('landscape') || flag('small');
const TYPES = ['choice', 'true-false', 'match-pairs', 'order', 'fill-blanks', 'type-answer', 'listen-choice', 'tap-rhythm', 'fretboard-find', 'fretboard-name', 'chord-build', 'staff-read', 'staff-place', 'play-note', 'play-chord', 'play-phrase', 'flashcard'];
let routes = argv.filter((a) => !a.startsWith('--'));
if (flag('all-types')) routes = TYPES.map((t) => `kit-lessons--try--${t}`);
const suffix = `${flag('small') ? '-360' : flag('landscape') ? '-landscape' : mobile ? '-mobile' : ''}${flag('light') ? '-light' : ''}`;
const outDir = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(outDir, { recursive: true });

const viewport = flag('landscape') ? { width: 844, height: 390 } : flag('small') ? { width: 360, height: 740 } : undefined;

withApp({ mobile, viewport, theme: flag('light') ? 'light' : 'dark' }, async ({ page, url, errors }) => {
  await page.addInitScript(() => localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}'));
  for (const route of routes) {
    await page.goto(`${url}#${route}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route]', { timeout: 60000 });
    await page.waitForSelector('[data-lesson-player], [data-preview], [data-course-map], main h1', { timeout: 60000 });
    await page.waitForTimeout(1200);
    const file = path.join(outDir, `lessons-${route.replace(/^kit-lessons--?/, '') || 'gallery'}${suffix}.png`);
    await page.screenshot({ path: file, fullPage: flag('full') });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${file}${overflow > 1 ? `  WARNING: scrolls sideways by ${overflow}px` : ''}`);
  }
  console.log(errors.length ? `errors:\n  ${errors.join('\n  ')}` : 'no console errors');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
