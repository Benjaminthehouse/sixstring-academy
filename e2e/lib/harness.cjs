/**
 * Shared E2E harness: starts a Vite dev server on a free port and opens the pre-installed Chromium.
 *
 *   const { withApp } = require('./lib/harness.cjs');
 *   await withApp({ mobile: true }, async ({ page, goto }) => { await goto('tuner'); ... });
 *
 * Fake devices (no real mic/camera in CI):
 *   withApp({ fakeAudio: '/abs/path/tone.wav' })   -> getUserMedia audio plays that WAV on a loop
 *   withApp({ fakeVideo: '/abs/path/clip.mjpeg' }) -> getUserMedia video plays that MJPEG/Y4M file
 * Both auto-grant the permission prompt.
 */
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');

async function startServer() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { port: 0, strictPort: false, host: '127.0.0.1', hmr: false, watch: null },
  });
  await server.listen();
  const addr = server.httpServer.address();
  return { url: `http://127.0.0.1:${addr.port}/`, close: () => server.close() };
}

/**
 * Load a TypeScript module from src/ into this Node script (aliases resolved by Vite), e.g.
 *   const audio = await loadTs('/src/core/audio/index.ts');
 * Handy for generating fixtures (WAV files, synthetic camera frames) with the app's own code.
 */
async function loadTs(modulePath) {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    return await server.ssrLoadModule(modulePath);
  } finally {
    await server.close();
  }
}

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1280, height: 800 },
};

async function withApp(opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const server = await startServer();
  const args = ['--autoplay-policy=no-user-gesture-required'];
  if (opts.fakeAudio || opts.fakeVideo || opts.fakeDevices) {
    args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream');
    if (opts.fakeAudio) args.push(`--use-file-for-fake-audio-capture=${opts.fakeAudio}`);
    if (opts.fakeVideo) args.push(`--use-file-for-fake-video-capture=${opts.fakeVideo}`);
  }
  const browser = await chromium.launch({ args });
  const viewport = opts.viewport || VIEWPORTS[opts.mobile ? 'mobile' : opts.size || 'desktop'];
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: opts.scale || 1,
    colorScheme: opts.theme || 'dark',
    hasTouch: !!opts.mobile,
    isMobile: !!opts.mobile,
    permissions: opts.fakeAudio || opts.fakeVideo || opts.fakeDevices ? ['microphone', 'camera'] : [],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const goto = async (route = 'home', ...params) => {
    const hash = '#' + [route, ...params].join('--');
    await page.goto(server.url + hash, { waitUntil: 'load' });
    await page.waitForSelector(`main[data-route]`, { timeout: 15000 });
    await page.waitForTimeout(opts.settle ?? 400);
  };
  try {
    return await fn({ page, context, browser, goto, url: server.url, errors });
  } finally {
    await browser.close();
    await server.close();
  }
}

module.exports = { withApp, startServer, loadTs, VIEWPORTS, ROOT };
