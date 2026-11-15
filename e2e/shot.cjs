#!/usr/bin/env node
/**
 * Look at a screen. Usage:
 *   node e2e/shot.cjs <route[--param]> [--mobile] [--light] [--full] [--out name] [--click "text"] [--wait ms]
 * Writes e2e/out/<name>.png and prints any console/page errors. Open the PNG with the Read tool.
 * Examples:
 *   node e2e/shot.cjs tuner --mobile
 *   node e2e/shot.cjs scales --light --full --out scales-light
 */
const fs = require('node:fs');
const path = require('node:path');
const { withApp, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const route = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--out' && argv[argv.indexOf(a) - 1] !== '--click' && argv[argv.indexOf(a) - 1] !== '--wait') || 'home';
const [name, ...params] = route.split('--');
const outName = val('out', `${route}${flag('mobile') ? '-mobile' : ''}${flag('light') ? '-light' : ''}`);
const outDir = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(outDir, { recursive: true });

withApp({ mobile: flag('mobile'), theme: flag('light') ? 'light' : 'dark', fakeDevices: flag('fake-devices') }, async ({ page, goto, errors }) => {
  await goto(name, ...params);
  const click = val('click');
  if (click) { await page.getByText(click, { exact: false }).first().click(); await page.waitForTimeout(400); }
  const wait = Number(val('wait', 0));
  if (wait) await page.waitForTimeout(wait);
  const file = path.join(outDir, `${outName}.png`);
  await page.screenshot({ path: file, fullPage: flag('full') });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`screenshot: ${file}`);
  if (overflow > 1) console.log(`WARNING: page scrolls horizontally by ${overflow}px`);
  console.log(errors.length ? `errors:\n  ${errors.join('\n  ')}` : 'no console errors');
}).catch((e) => { console.error(e); process.exit(1); });
