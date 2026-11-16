#!/usr/bin/env node
/**
 * Browser check of the installable, offline app (production build on a plain static host):
 *
 *   build      manifest.webmanifest (name, icons that exist at their sizes, colours from the
 *              tokens), index.html links it, sw.js precaches every file of the build and
 *              nothing from vendor/tesseract or vendor/mediapipe
 *   install    the worker registers after the first screen, downloads the build, takes control
 *   offline    with the host gone: the app opens, a screen never visited before opens, a vendor
 *              file used once online is still there
 *   update     a new sw.js on the host: "A new version is ready" appears; Reload switches to it
 *   elsewhere  no worker in the dev server, none in the Claude-artifact build
 *
 *   node e2e/pwa.cjs                 build to a temp dir first
 *   node e2e/pwa.cjs --dist <dir>    use a build you already have (also skips the artifact build)
 *
 * Screenshots of the update toast (phone and desktop) go to e2e/out/pwa-*.png.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PNG } = require('pngjs');
const { chromium } = require('playwright');
const { serveDir, buildInto } = require('./perf-lib.cjs');
const { withApp, ROOT, VIEWPORTS } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const val = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(group, name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail !== undefined ? `  (${detail})` : ''}`);
}

function token(name, theme) {
  const css = fs.readFileSync(path.join(ROOT, 'src/ui/tokens.css'), 'utf8');
  const block = theme === 'light' ? /^:root\s*\{([\s\S]*?)^\}/m.exec(css) : /^:root\[data-theme='dark'\]\s*\{([\s\S]*?)^\}/m.exec(css);
  return new RegExp(`\\s${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(block[1])[1].toLowerCase();
}

function readBuild(dist) {
  const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
  const m = /const BUILD = (\{.*\});/.exec(sw);
  return { sw, build: m ? JSON.parse(m[1]) : null };
}

function checkBuild(dist) {
  const group = 'build';
  const manifestPath = path.join(dist, 'manifest.webmanifest');
  check(group, 'manifest.webmanifest is written', fs.existsSync(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  check(group, 'it is named Sixstring Academy, opens standalone at the app folder', manifest.name === 'Sixstring Academy' && manifest.display === 'standalone' && manifest.start_url === './' && manifest.scope === './', JSON.stringify({ name: manifest.name, display: manifest.display }));
  const bg = token('--bg', 'dark');
  check(group, 'its colours are the dark page background from tokens.css', manifest.theme_color === bg && manifest.background_color === bg, `${manifest.theme_color} / ${manifest.background_color} vs ${bg}`);
  const pngs = manifest.icons.filter((i) => i.type === 'image/png');
  const sizesOk = pngs.every((icon) => {
    const file = path.join(dist, icon.src);
    if (!fs.existsSync(file)) return false;
    const png = PNG.sync.read(fs.readFileSync(file));
    return `${png.width}x${png.height}` === icon.sizes;
  });
  check(group, 'every PNG icon exists at the size it claims (192 and 512, plus a maskable one)', sizesOk && pngs.some((i) => i.sizes === '192x192') && pngs.some((i) => i.sizes === '512x512') && manifest.icons.some((i) => i.purpose === 'maskable'));
  check(group, 'the SVG icon exists', fs.existsSync(path.join(dist, 'icons/icon.svg')));
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  check(group, 'index.html links the manifest, the icons and the theme colour', html.includes('rel="manifest" href="./manifest.webmanifest"') && html.includes('rel="icon"') && html.includes('rel="apple-touch-icon"') && html.includes(`name="theme-color" content="${bg}"`));
  const { sw, build } = readBuild(dist);
  check(group, 'sw.js carries this build (no placeholder left)', !!build && !sw.includes('__SSA_BUILD__;') && /^[0-9a-f]{16}$/.test(build.version));
  const assets = fs.readdirSync(path.join(dist, 'assets')).filter((f) => !f.endsWith('.map')).map((f) => `assets/${f}`);
  const missing = assets.filter((f) => !build.precache.includes(f));
  check(group, `the precache list holds every file of the build (${build.precache.length} files)`, missing.length === 0 && build.precache.includes('index.html') && build.precache.includes('manifest.webmanifest'), missing.slice(0, 3).join(', ') || undefined);
  const leaked = build.precache.filter((f) => f.startsWith('vendor/') || f.endsWith('.map') || f === 'sw.js');
  check(group, 'and nothing from vendor/ (Tesseract, MediaPipe, pdf.js extras), no source maps', leaked.length === 0, leaked[0]);
  const bytes = build.precache.reduce((sum, f) => sum + fs.statSync(path.join(dist, f)).size, 0);
  console.log(`         precache: ${build.precache.length} files, ${(bytes / 1e6).toFixed(1)} MB before compression`);
  return build;
}

async function seeded(context) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
    } catch {
      /* ignore */
    }
  });
}

async function controlled(page) {
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60000 });
}

async function checkInstallOfflineUpdate(dist, build) {
  let swVersion = null; // set to serve a changed worker (a new deploy)
  const server = await serveDir(dist, {
    rewrite: (rel, buf) => (rel === 'sw.js' && swVersion ? Buffer.from(buf.toString('utf8').replace(`"version":"${build.version}"`, `"version":"${swVersion}"`)) : buf),
  });
  const browser = await chromium.launch();
  try {
    for (const mobile of [true, false]) {
      const device = mobile ? 'phone' : 'desktop';
      server.setOffline(false);
      swVersion = null;
      const context = await browser.newContext({ viewport: VIEWPORTS[mobile ? 'mobile' : 'desktop'], isMobile: mobile, hasTouch: mobile, colorScheme: mobile ? 'dark' : 'light' });
      await seeded(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${server.url}#home`);
      await page.waitForSelector('main[data-route="home"] [data-ui-page]', { timeout: 60000 });
      await controlled(page);
      const reg = await page.evaluate(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return { scope: r.scope, script: r.active && r.active.scriptURL };
      });
      check('install', `${device}: the worker controls the app, scoped to its folder`, reg.scope === server.url && reg.script === `${server.url}sw.js`, JSON.stringify(reg));
      const cached = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).length, `ssa-precache-${build.version}`);
      check('install', `${device}: every file of the build is in the cache`, cached === build.precache.length, `${cached} of ${build.precache.length}`);
      // A vendor file used once online (the OCR worker): kept for offline use.
      const vendorOnline = await page.evaluate(async () => (await fetch('vendor/tesseract/worker.min.js')).ok);

      // The host goes away.
      server.setOffline(true);
      await context.setOffline(true);
      await page.reload();
      await page.waitForSelector('main[data-route="home"] [data-ui-page]', { timeout: 60000 });
      check('offline', `${device}: the app opens with no network`, await page.locator('main[data-route="home"] h1, main[data-route="home"] h2').first().isVisible());
      await page.evaluate(() => (location.hash = '#scales'));
      const scalesOk = await page.waitForSelector('[data-scales] [data-neck]', { timeout: 60000 }).then(() => true, () => false);
      check('offline', `${device}: a screen never opened before (#scales) opens offline`, scalesOk);
      const vendorOffline = await page.evaluate(async () => {
        try {
          return (await fetch('vendor/tesseract/worker.min.js')).ok;
        } catch {
          return false;
        }
      });
      check('offline', `${device}: a vendor file used once online still loads offline`, vendorOnline && vendorOffline);
      const failed = errors.filter((e) => !/Failed to fetch|NetworkError|Load failed/i.test(e));
      check('offline', `${device}: no page errors`, failed.length === 0, failed[0]);

      // A new deploy: the host is back with a changed sw.js.
      server.setOffline(false);
      await context.setOffline(false);
      swVersion = `next${mobile ? 'p' : 'd'}000000000`.slice(0, 16);
      await page.evaluate(() => (location.hash = '#home'));
      await page.waitForSelector('main[data-route="home"] [data-ui-page]', { timeout: 60000 });
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
      const toast = page.getByText('A new version is ready');
      const shown = await toast.waitFor({ timeout: 60000 }).then(() => true, () => false);
      check('update', `${device}: the learner is told a new version is ready`, shown);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `pwa-update-${device}.png`) });
      if (shown) {
        const navigated = page.waitForEvent('framenavigated', { timeout: 30000 }).then(() => true, () => false);
        await page.getByRole('button', { name: 'Reload' }).click();
        check('update', `${device}: Reload switches to it and reloads the page`, await navigated);
        await page.waitForSelector('main[data-route="home"] [data-ui-page]', { timeout: 60000 });
        const version = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const channel = new MessageChannel();
              channel.port1.onmessage = (e) => resolve(e.data.version);
              navigator.serviceWorker.controller.postMessage({ type: 'VERSION' }, [channel.port2]);
              setTimeout(() => resolve(null), 5000);
            }),
        );
        check('update', `${device}: the page now runs the new version`, version === swVersion, version);
        const keys = await page.evaluate(() => caches.keys());
        check('update', `${device}: the old version's cache is gone, the vendor files stay`, !keys.includes(`ssa-precache-${build.version}`) && keys.includes(`ssa-precache-${swVersion}`) && keys.some((k) => k.startsWith('ssa-vendor-')), keys.join(', '));
        const toastAfter = await page.getByText('A new version is ready').count();
        check('update', `${device}: and the toast does not come back`, toastAfter === 0);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

async function checkDevServer() {
  await withApp({ mobile: true }, async ({ page, goto }) => {
    await goto('home');
    await page.waitForTimeout(2500);
    const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    check('elsewhere', 'the dev server registers no service worker', regs === 0, regs);
    const manifest = await page.locator('link[rel="manifest"]').count();
    check('elsewhere', 'and links no manifest (it has none to serve)', manifest === 0);
  });
}

async function checkArtifactBuild(temp) {
  const dist = path.join(temp, 'dist-artifact');
  await buildInto(dist, { mode: 'artifact' });
  check('elsewhere', 'the artifact build writes no sw.js and no manifest', !fs.existsSync(path.join(dist, 'sw.js')) && !fs.existsSync(path.join(dist, 'manifest.webmanifest')));
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  check('elsewhere', 'its index.html links no manifest and carries no route preloader', !html.includes('rel="manifest"') && !html.includes('modulepreload\'') && !/<script>\(function\(f,r/.test(html));
  const server = await serveDir(dist);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: VIEWPORTS.mobile, isMobile: true, hasTouch: true });
    await seeded(context);
    const page = await context.newPage();
    await page.goto(`${server.url}#home`);
    await page.waitForSelector('main[data-route="home"] [data-ui-page]', { timeout: 60000 });
    await page.waitForTimeout(3000);
    const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    check('elsewhere', 'the artifact build registers no service worker, even on a secure page', regs === 0, regs);
  } finally {
    await browser.close();
    await server.close();
  }
}

(async () => {
  let dist = val('dist');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-pwa-'));
  try {
    if (!dist) {
      dist = path.join(temp, 'dist');
      console.log('Building the production app ...');
      await buildInto(dist);
    }
    dist = path.resolve(dist);
    const build = checkBuild(dist);
    await checkInstallOfflineUpdate(dist, build);
    await checkDevServer();
    if (!val('dist')) await checkArtifactBuild(temp);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll PWA checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
