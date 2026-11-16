#!/usr/bin/env node
/**
 * How fast the production build is on a mid-range phone: first load and one interaction on
 * #home, a Theory Path lesson, #play--hot-cross-buns and #scales, with the CPU slowed 4x and the
 * network at DevTools' "Slow 4G" (562.5 ms round trip, 1.44 Mbit/s down, 675 kbit/s up), served
 * gzipped by a plain static host (e2e/perf-lib.cjs). Every run starts with an empty cache.
 *
 *   node e2e/perf.cjs                       build to a temp dir, 3 runs of each screen
 *   node e2e/perf.cjs --dist <dir>          measure a build you already have
 *   node e2e/perf.cjs --runs 5 --only home,scales --json /tmp/perf.json
 *   node e2e/perf.cjs --quick               one run of each screen
 *   node e2e/perf.cjs --no-repeat           skip the repeat visits
 *
 * Prints, per screen (median of the runs): first contentful paint, "ready" (the screen's own
 * content is on screen, not the shell's skeleton), the JavaScript downloaded by then (gzip bytes
 * on the wire) and the slowest interaction (Event Timing: tap to next paint); then a repeat visit
 * (the app opened again in a new tab: from the service worker when the build has one, else from
 * the HTTP cache); and the largest chunks of the build. Fails when a first screen downloads a heavy library it does not show
 * (alphaTab, pdf.js, VexFlow, Tesseract, MediaPipe, the full icon set) or when the JavaScript a
 * first screen needs grows past its budget, and when a file index.html preloads goes unused (a
 * preload in another CORS mode than Vite's own links). Timings are reported, not judged: this machine is
 * shared, and a slowed CPU on a loaded machine is noisy.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium } = require('playwright');
const { serveDir, buildInto } = require('./perf-lib.cjs');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

/** DevTools' "Slow 4G" preset and a 4x CPU slow-down: Lighthouse's idea of a mid-range phone. */
const NETWORK = { offline: false, latency: 562.5, downloadThroughput: (1.6e6 / 8) * 0.9, uploadThroughput: (750e3 / 8) * 0.9 };
const CPU_SLOWDOWN = 4;
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/**
 * The screens. `chunk` is the route's own code; `ready` is the screen's own content; `act` is one
 * tap a learner would make first. `budgetKb` caps the gzip JavaScript on the wire before the
 * screen is ready: what it needed in November 2026 plus about 15 %, so growth is noticed. (The
 * lesson's is high because the Theory Path loads every unit's content at once, not just the
 * lesson's own unit: see useTheory.ts in features/learn.)
 */
const SCREENS = [
  { id: 'home', hash: 'home', chunk: /^assets\/home-/, ready: 'main[data-route="home"] [data-ui-page]:not([data-shell-fallback])', act: '[data-chip]', budgetKb: 230 },
  { id: 'lesson', hash: 'learn--sound-and-pitch--a-sound-is-a-vibration', chunk: /^assets\/learn-.*\.js$/, ready: '[data-lesson-player]', act: '[data-lesson-player] [data-ui-primary]', budgetKb: 780 },
  { id: 'play', hash: 'play--hot-cross-buns', chunk: /^assets\/player-.*\.js$/, ready: '[data-player] [data-player-play]', act: '[data-player-play]', budgetKb: 600 },
  { id: 'scales', hash: 'scales', chunk: /^assets\/scales-.*\.js$/, ready: '[data-scales] [data-neck]', act: '[data-play]', budgetKb: 480 },
];

/** Libraries that must never be on the wire before a first screen is ready (they are lazy by design). */
const HEAVY = [
  { name: 'alphaTab', test: /alphaTab/i },
  { name: 'pdf.js', test: /(^|\/)pdf(\.worker)?[.-]/i },
  { name: 'VexFlow', test: /vexflow/i },
  { name: 'Tesseract', test: /tesseract/i },
  { name: 'MediaPipe', test: /mediapipe|vision_bundle/i },
  { name: 'the full icon set', test: /all\.generated/ },
  { name: 'JSZip', test: /jszip/i },
];

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail !== undefined ? `  (${detail})` : ''}`);
}

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};
const ms = (x) => (Number.isFinite(x) ? `${Math.round(x)} ms` : 'n/a');
const kb = (x) => `${(x / 1024).toFixed(0)} kB`;

/** Installed before any page script: collects paint, long-task and Event Timing entries. */
function instrument() {
  const perf = { fcp: NaN, lcp: NaN, longTasks: [], events: [], ready: NaN };
  window.__perf = perf;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') perf.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) perf.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) perf.longTasks.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.interactionId) perf.events.push({ name: e.name, start: e.startTime, duration: e.duration, processing: e.processingEnd - e.processingStart, delay: e.processingStart - e.startTime });
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch {
    /* an older engine: the numbers it lacks stay n/a */
  }
  try {
    localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
  } catch {
    /* storage refused: the first-run flow would show on #home */
  }
}

/** Throttle a page like a mid-range phone on slow 4G and log what crosses the wire. */
async function throttle(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NETWORK);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  const responses = new Map();
  const wire = [];
  cdp.on('Network.responseReceived', (e) => responses.set(e.requestId, { url: e.response.url, type: e.type, fromWorker: e.response.fromServiceWorker }));
  cdp.on('Network.loadingFinished', (e) => {
    const r = responses.get(e.requestId);
    // A file the service worker answered from its cache never touched the network.
    if (r) wire.push({ ...r, bytes: r.fromWorker ? 0 : e.encodedDataLength, at: e.timestamp });
  });
  return wire;
}

/**
 * One visit to a screen. First visit: an empty cache, no service worker. Repeat visit (`repeat`):
 * the app was opened once before in this browser (HTTP cache warm, and the service worker
 * installed when the build has one), then opened again in a new tab, as a learner reopening it.
 */
async function measure(browser, base, screen, { repeat = false, hasWorker = false } = {}) {
  const context = await browser.newContext({ ...PHONE, serviceWorkers: repeat ? 'allow' : 'block' });
  await context.addInitScript(instrument);
  if (repeat) {
    const first = await context.newPage();
    await first.goto(`${base}#${screen.hash}`, { timeout: 120000 });
    await first.waitForSelector(screen.ready, { state: 'attached', timeout: 120000 });
    if (hasWorker) {
      await first.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active && !!navigator.serviceWorker.controller, null, { timeout: 120000 });
    }
    await first.waitForTimeout(1500);
    await first.close();
  }
  const page = await context.newPage();
  const wire = await throttle(context, page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}#${screen.hash}`, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForSelector(screen.ready, { state: 'attached', timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('[data-shell-fallback]'), null, { timeout: 120000 });
  const ready = await page.evaluate(() => performance.now());
  const atReady = wire.slice();
  // Let the page settle (late chunks, fonts) before the tap, then measure the tap to the next paint.
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => window.__perf.events.length);
  await page.locator(screen.act).first().click({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const perf = await page.evaluate(() => window.__perf);
  const tapEvents = perf.events.slice(before);
  const tap = tapEvents.length ? Math.max(...tapEvents.map((e) => e.duration)) : NaN;
  const blocking = perf.longTasks.filter(([start]) => start < ready).reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0);
  await context.close();
  const js = atReady.filter((r) => r.type === 'Script' || /\.m?js(\?|$)/.test(r.url));
  return {
    fcp: perf.fcp,
    lcp: perf.lcp,
    ready,
    blocking,
    tap,
    jsBytes: js.reduce((s, r) => s + r.bytes, 0),
    allBytes: atReady.reduce((s, r) => s + r.bytes, 0),
    requests: atReady.length,
    scripts: js.map((r) => ({ file: new URL(r.url).pathname.replace(/^.*\/assets\//, ''), bytes: r.bytes })),
    errors,
  };
}

function largestChunks(dist, count = 15) {
  const dir = path.join(dist, 'assets');
  const rows = fs
    .readdirSync(dir)
    .filter((f) => /\.(m?js|css)$/.test(f))
    .map((f) => {
      const buf = fs.readFileSync(path.join(dir, f));
      return { file: f, raw: buf.length, gz: zlib.gzipSync(buf, { level: 6 }).length };
    })
    .sort((a, b) => b.raw - a.raw);
  return rows.slice(0, count);
}

/**
 * What index.html's route preloader (the ssa-route-preload plugin in vite.config.ts) asks for
 * at once for an address: runs its inline script against a stand-in document.
 */
function routePreloads(dist, hash) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const inline = /<script>(\(function\(f,r[\s\S]*?)<\/script>/.exec(html);
  const entry = /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/.exec(html);
  if (!inline || !entry) return [];
  const added = [];
  const document = { createElement: () => ({}), head: { appendChild: (e) => added.push(e) } };
  // In case the preloader ever waits for the entry script (resource timing): report it arrived.
  class PerformanceObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {
      this.callback({ getEntries: () => [{ name: `http://app/${entry[1]}` }] });
    }
    disconnect() {}
  }
  new Function('location', 'document', 'PerformanceObserver', inline[1])({ hash: `#${hash}` }, document, PerformanceObserver);
  return added.map((e) => ({ rel: e.rel, href: e.href.replace(/^\.\//, ''), crossOrigin: e.crossOrigin }));
}

/** The JavaScript index.html asks for before anything runs (entry + modulepreloads). */
function entryClosure(dist) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const files = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  return files.map((f) => {
    const buf = fs.readFileSync(path.join(dist, f));
    return { file: f.replace('assets/', ''), raw: buf.length, gz: zlib.gzipSync(buf, { level: 6 }).length };
  });
}

(async () => {
  let dist = val('dist');
  let temp = null;
  if (!dist) {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-perf-'));
    dist = path.join(temp, 'dist');
    console.log('Building the production app ...');
    await buildInto(dist);
  }
  dist = path.resolve(dist);
  const runs = argv.includes('--quick') ? 1 : Number(val('runs', 3));
  const only = val('only') ? val('only').split(',') : null;
  const screens = SCREENS.filter((s) => !only || only.includes(s.id));

  console.log(`\nLargest chunks of ${dist} (raw / gzip):`);
  for (const c of largestChunks(dist)) console.log(`  ${kb(c.raw).padStart(8)} ${kb(c.gz).padStart(8)}  ${c.file}`);
  const closure = entryClosure(dist);
  const closureGz = closure.reduce((s, c) => s + c.gz, 0);
  console.log(`\nindex.html loads ${closure.length} scripts before anything runs: ${kb(closure.reduce((s, c) => s + c.raw, 0))} raw, ${kb(closureGz)} gzip`);
  for (const c of closure) console.log(`  ${kb(c.raw).padStart(8)} ${kb(c.gz).padStart(8)}  ${c.file}`);

  const server = await serveDir(dist);
  const browser = await chromium.launch();
  {
    // The splash is painted from the HTML and CSS alone: with no JavaScript at all, it still shows.
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    await page.route('**/*.js', (route) => route.abort());
    await page.goto(`${server.url}#home`, { waitUntil: 'load' });
    const splash = await page.evaluate(() => {
      const img = document.querySelector('#root .ssa-splash img');
      return !!img && img.complete && img.naturalWidth > 0 && img.getBoundingClientRect().width > 0;
    });
    check('the first paint does not wait for JavaScript (index.html paints a splash)', splash);
    await context.close();
  }
  for (const screen of SCREENS.filter((s) => !only || only.includes(s.id))) {
    // Every file the preloader asks for is used when the screen loads: Chrome says so in the console
    // when a preload is not ("... is not used because the request credentials mode does not match").
    const context = await browser.newContext({ ...PHONE, serviceWorkers: 'block' });
    await context.addInitScript(instrument);
    const page = await context.newPage();
    const unused = [];
    page.on('console', (m) => {
      if (/preload/i.test(m.text()) && /not used/i.test(m.text())) unused.push(m.text().replace(/^.*\/assets\//, '').slice(0, 120));
    });
    await page.goto(`${server.url}#${screen.hash}`);
    await page.waitForSelector(screen.ready, { state: 'attached', timeout: 120000 });
    await page.waitForTimeout(3500);
    check(`#${screen.hash}: every preloaded file is used (no "preload ... not used" warning)`, unused.length === 0, unused[0]);
    await context.close();
  }
  const hasWorker = fs.existsSync(path.join(dist, 'sw.js'));
  const report = { network: 'DevTools Slow 4G', cpuSlowdown: CPU_SLOWDOWN, runs, hasWorker, screens: {}, repeat: {}, closure, largest: largestChunks(dist) };
  try {
    for (const screen of screens) {
      const preloads = routePreloads(dist, screen.hash);
      const own = preloads.filter((p) => p.rel === 'modulepreload' && screen.chunk.test(p.href));
      const exist = preloads.every((p) => fs.existsSync(path.join(dist, p.href)));
      check(`index.html starts downloading #${screen.hash}'s own code at once (${preloads.length} files)`, own.length > 0 && exist, own.map((p) => p.href).join(', ') || 'nothing preloaded');
      // Vite links a route's scripts and stylesheets crossorigin; a preload in another mode is unused.
      const mode = preloads.filter((p) => p.crossOrigin !== '');
      check(`and every preload is crossorigin, like the links Vite adds (scripts and stylesheets)`, preloads.length > 0 && mode.length === 0, mode.map((p) => p.href).join(', ') || undefined);
      const results = [];
      for (let i = 0; i < runs; i++) results.push(await measure(browser, server.url, screen));
      const m = (k) => median(results.map((r) => r[k]));
      const row = { fcp: m('fcp'), lcp: m('lcp'), ready: m('ready'), blocking: m('blocking'), tap: m('tap'), jsBytes: m('jsBytes'), allBytes: m('allBytes'), requests: m('requests'), runs: results };
      report.screens[screen.id] = row;
      console.log(`\n#${screen.hash}  (median of ${runs})`);
      console.log(`  first paint ${ms(row.fcp)} · largest paint ${ms(row.lcp)} · ready ${ms(row.ready)} · main thread blocked ${ms(row.blocking)} before ready · tap to paint ${ms(row.tap)}`);
      console.log(`  ${row.requests} requests, ${kb(row.allBytes)} on the wire by ready, of which JavaScript ${kb(row.jsBytes)}`);
      const scripts = results[0].scripts.slice().sort((a, b) => b.bytes - a.bytes);
      const shown = flag('verbose') ? scripts : scripts.slice(0, 6);
      console.log(`  ${flag('verbose') ? 'scripts' : 'largest scripts'}: ${shown.map((s) => `${s.file} ${kb(s.bytes)}`).join(', ')}`);
      const heavy = HEAVY.filter((h) => results.some((r) => r.scripts.some((s) => h.test.test(s.file)))).map((h) => h.name);
      check(`#${screen.hash} loads no heavy library before it is ready`, heavy.length === 0, heavy.join(', ') || undefined);
      check(`#${screen.hash} needs at most ${screen.budgetKb} kB of JavaScript (gzip) to be ready`, row.jsBytes <= screen.budgetKb * 1024, kb(row.jsBytes));
      const errs = results.flatMap((r) => r.errors);
      check(`#${screen.hash} runs without page errors`, errs.length === 0, errs[0]);
      if (!flag('no-repeat')) {
        const again = [];
        for (let i = 0; i < runs; i++) again.push(await measure(browser, server.url, screen, { repeat: true, hasWorker }));
        const r = (k) => median(again.map((x) => x[k]));
        report.repeat[screen.id] = { fcp: r('fcp'), ready: r('ready'), allBytes: r('allBytes'), requests: r('requests'), runs: again };
        console.log(`  repeat visit (${hasWorker ? 'installed: service worker' : 'HTTP cache'}): first paint ${ms(r('fcp'))} · ready ${ms(r('ready'))} · ${kb(r('allBytes'))} on the wire`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
  }
  if (val('json')) fs.writeFileSync(val('json'), JSON.stringify(report, null, 2));
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll performance checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
