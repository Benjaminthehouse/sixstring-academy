#!/usr/bin/env node
/**
 * Independent accuracy check of the Live Fretboard (`#camera`) on scenes its builder never used.
 *
 *   node e2e/camera-alt.cjs                   every scene (renders the videos once, about 2 min each)
 *   node e2e/camera-alt.cjs --only capo,lost  some scenes: capo, lefty, clutter, dim, lost, jump
 *   node e2e/camera-alt.cjs --throttle 4      a stress run with Chromium's CPU slow-down: read the numbers
 *                                             (--verbose); the thresholds are set for a normal machine
 *   node e2e/camera-alt.cjs --verbose         print every check and the per-scene numbers
 *
 * The fake camera plays videos rendered by the vision module's SECOND renderer
 * (`src/core/vision/testing/alt-scenes.ts`: its own 3-D camera with lens distortion, strings and
 * capo raised above the board, its own textures and noise), not the one the tracker was built on
 * and not the one `e2e/camera.cjs` uses. Each video swings back and forth (frames 0..N-1..1, so
 * the loop never jumps) and stamps its frame index in a corner; the truth of every frame is kept.
 *
 * Every overlay frame is scored against the frame on screen with the alt renderer's own geometry:
 * a dot is taken back to the board plane through the true camera, raised to the string (across)
 * and to the fret crowns (along), and is right when it sits on its string (within half a spacing)
 * inside its fret cell. A frame is right when 90% of its dots are.
 *
 *  scenes   capo at 2 (nut in view), left-handed guitar, a keyboard behind the player, a very dim
 *           room: locks; solid dots are right on >= 90% of frames (precision); solid dots on at
 *           least a fifth of the frames (the outlines must not take over); the dots' median error
 *           along the neck under a fifth of a fret cell
 *  lost     the guitar vanishes for a second: no solid dot once it has been gone for 10 frames
 *  jump     the picture cuts to another guitar: reported (a known limit of the tracker: it can
 *           carry the old fret numbers across the cut); fails only below a low floor
 *
 * Why it exists: the first version of the screen drew wrong dots as solid on 20-40% of frames
 * of a swaying neck when the machine was busy. `model/honesty.ts` now turns dots into outlines
 * when they trail the neck (expected from speed and answer age, and measured frame by frame).
 * Prints one line per failed check (all with --verbose), then PASSED or FAILED.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { startServer, loadTs, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const only = val('only', '') ? new Set(val('only', '').split(',')) : null;
const THROTTLE = Number(val('throttle', 0));
const OUT = path.join(ROOT, 'e2e', 'out', 'camera-alt');
const FRAMES = 150;
const W = 1280;
const H = 720;
const CELL = 16;
const CELLS = 12;

/** The scenes: alt-bench condition, seed, how the video is put together. */
const SCENES = [
  { id: 'capo', condition: 'capo-2', seed: 3 },
  { id: 'lefty', condition: 'lefty', seed: 2 },
  { id: 'clutter', condition: 'keyboard-behind', seed: 4 },
  { id: 'dim', condition: 'dim', seed: 6 },
  { id: 'lost', condition: 'typical', seed: 11, vanish: [0.55, 0.75] },
  { id: 'jump', condition: 'typical', seed: 12, jumpAt: 0.5 },
].filter((s) => !only || only.has(s.id));

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail !== '' ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');

// ---------------------------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------------------------

function fingerprint(scene) {
  const hash = crypto.createHash('sha1');
  hash.update(fs.readFileSync(path.join(ROOT, 'src/core/vision/testing/alt-scenes.ts')));
  hash.update(JSON.stringify({ scene, FRAMES, W, H, v: 1 }));
  return hash.digest('hex').slice(0, 10);
}

function stamp(data, x0, y0, index) {
  const bits = [1, 0];
  for (let b = 9; b >= 0; b--) bits.push((index >> b) & 1);
  for (let c = 0; c < CELLS; c++) {
    for (let y = y0; y < y0 + CELL; y++) {
      for (let x = x0 + c * CELL; x < x0 + (c + 1) * CELL; x++) {
        const i = (y * W + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = bits[c] ? 255 : 0;
      }
    }
  }
}

async function buildVideo(A, scene) {
  const key = fingerprint(scene);
  const video = path.join(OUT, `${scene.id}-${key}.mjpeg`);
  const truthFile = path.join(OUT, `${scene.id}-${key}.json`);
  if (fs.existsSync(video) && fs.existsSync(truthFile)) return { video, truth: JSON.parse(fs.readFileSync(truthFile, 'utf8')) };
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.startsWith(`${scene.id}-`) && /\.(mjpeg|json)$/.test(f)) fs.rmSync(path.join(OUT, f));
  const jpeg = require('jpeg-js');
  const sized = (spec) => ({ ...spec, width: W, height: H, view: { ...spec.view, swayPx: spec.view.swayPx * (W / 640) } });
  const cond = A.altCondition(scene.condition);
  const spec = sized(cond.build(scene.seed));
  const other = scene.jumpAt ? sized(cond.build(scene.seed + 1000)) : null;
  const empty = { ...spec, neck: null, hand: null, capo: null, occluders: [] };
  const cache = A.createAltCache();
  const cache2 = A.createAltCache();
  const frames = [];
  const truths = [];
  const t0 = Date.now();
  process.stdout.write(`  rendering ${scene.id} (${scene.condition}, seed ${scene.seed}): ${FRAMES} frames...`);
  for (let i = 0; i < FRAMES; i++) {
    let s = spec;
    let c = cache;
    if (scene.vanish && i >= Math.round(FRAMES * scene.vanish[0]) && i < Math.round(FRAMES * scene.vanish[1])) s = empty;
    if (other && i >= Math.round(FRAMES * scene.jumpAt)) {
      s = other;
      c = cache2;
    }
    const { frame, truth } = A.renderAlt(s, i, c);
    frames.push(frame);
    truths.push(truth);
  }
  console.log(` ${Math.round((Date.now() - t0) / 1000)} s`);
  // A corner for the frame code that no board comes near in any frame.
  const corners = [[24, 24], [W - CELL * CELLS - 24, 24], [24, H - CELL - 24], [W - CELL * CELLS - 24, H - CELL - 24]];
  const box = (tr) => {
    if (!tr.model) return null;
    const L = tr.model.scaleLength;
    const pts = [];
    for (const x of [-60, L * 0.25, L * 0.5, L * (1 - Math.pow(2, -tr.model.fretCount / 12)) + 10]) for (const y of [-10, tr.model.nutWidth + 20]) { const p = A.altPlaneToPixel(tr, x, y); if (p) pts.push(p); }
    return pts;
  };
  const code = corners.find(([cx, cy]) => truths.every((tr) => {
    const q = box(tr);
    if (!q) return true;
    const xs = q.map((p) => p.x);
    const ys = q.map((p) => p.y);
    return Math.max(...xs) + 30 < cx || Math.min(...xs) - 30 > cx + CELL * CELLS || Math.max(...ys) + 30 < cy || Math.min(...ys) - 30 > cy + CELL;
  })) || corners[1];
  // Back and forth: the looping fake camera never jumps.
  const order = [...Array(FRAMES).keys(), ...[...Array(FRAMES - 2).keys()].map((k) => FRAMES - 2 - k)];
  const fd = fs.openSync(video + '.part', 'w');
  for (const i of order) {
    const data = Buffer.from(frames[i].data);
    stamp(data, code[0], code[1], i);
    fs.writeSync(fd, jpeg.encode({ data, width: W, height: H }, 85).data);
  }
  fs.closeSync(fd);
  fs.renameSync(video + '.part', video);
  const truth = { scene, code: { x: code[0], y: code[1], cell: CELL, cells: CELLS }, hints: spec.hints, capo: spec.capo?.fret ?? 0, frames: truths };
  fs.writeFileSync(truthFile, JSON.stringify(truth));
  return { video, truth };
}

// ---------------------------------------------------------------------------------------------
// Running the screen and scoring
// ---------------------------------------------------------------------------------------------

/** Display point (CSS px of the stage, object-fit contain, maybe mirrored) -> video px. */
function toVideo(p, view, vw, vh) {
  const s = Math.min(view.width / vw, view.height / vh);
  let x = (p.x - (view.width - vw * s) / 2) / s;
  const y = (p.y - (view.height - vh * s) / 2) / s;
  if (view.mirrored) x = vw - x;
  return { x, y };
}

/** Is a drawn dot right on the true board of its frame? Also its errors along (cells) and across (string spacings). */
function judge(A, tr, m, e) {
  const P0 = A.altPixelToPlane(tr, toVideo(m, e.view, e.vw, e.vh));
  if (!P0) return null;
  const C = tr.camera;
  const L = tr.model.scaleLength;
  const h = tr.stringHeight[0] + ((tr.stringHeight[1] - tr.stringHeight[0]) * Math.max(0, P0.x)) / L;
  const tS = 1 - h / C[2];
  const tF = 1 - 1.1 / C[2];
  const x = P0.x > 0 ? C[0] + tF * (P0.x - C[0]) : C[0] + tS * (P0.x - C[0]);
  const y = C[1] + tS * (P0.y - C[1]);
  const wire = (n) => L * (1 - Math.pow(2, -n / 12));
  const f = m.fret;
  const along = f === 0 ? (x + 10) / wire(1) : (x - (wire(f - 1) + 0.68 * (wire(f) - wire(f - 1)))) / (wire(f) - wire(f - 1));
  const n = tr.model.stringCount;
  const span = tr.model.stringSpanNut + ((tr.model.stringSpanBridge - tr.model.stringSpanNut) * Math.max(0, x)) / L;
  const across = (y - (tr.model.nutWidth / 2 + ((n - m.string) / (n - 1) - 0.5) * span)) / (span / (n - 1));
  const inCell = f === 0 ? x < 0 && x > -25 : along > -0.68 && along < 0.32;
  return { right: inCell && Math.abs(across) < 0.5, along: Math.abs(along) };
}

function score(A, truth, log) {
  const s = { inView: 0, solid: 0, solidRight: 0, ghostOnly: 0, noNeck: 0, deepNoNeckSolid: 0, firstNoNeckSolid: 0, along: [] };
  const empty = truth.frames.map((tr) => !tr.model);
  /** How deep inside a stretch without the guitar a frame is (frames to the nearer edge). */
  const gone = (i) => {
    let a = 0;
    let b = 0;
    while (i - a - 1 >= 0 && empty[i - a - 1]) a++;
    while (i + b + 1 < empty.length && empty[i + b + 1]) b++;
    // Distance to the nearer edge of the gap: deep inside, whichever way the video is playing.
    return Math.min(a, b) + 1;
  };
  for (const e of log) {
    if (e.shown < 0 || e.shown >= truth.frames.length) continue;
    const tr = truth.frames[e.shown];
    const solid = e.markers.filter((m) => !m.ghost);
    if (!tr.model) {
      s.noNeck++;
      if (solid.length) {
        if (gone(e.shown) >= 10) s.deepNoNeckSolid++;
        else s.firstNoNeckSolid++;
      }
      continue;
    }
    s.inView++;
    if (!solid.length) {
      if (e.markers.length) s.ghostOnly++;
      continue;
    }
    let ok = 0;
    for (const m of solid) {
      const j = judge(A, tr, m, e);
      if (!j) continue;
      if (j.right) ok++;
      s.along.push(j.along);
    }
    s.solid++;
    if (ok >= 0.9 * solid.length) s.solidRight++;
  }
  s.along.sort((a, b) => a - b);
  s.alongMedian = s.along.length ? s.along[Math.floor(s.along.length / 2)] : NaN;
  delete s.along;
  return s;
}

async function runScene(A, url, scene) {
  const { video, truth } = await buildVideo(A, scene);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark', permissions: ['camera', 'microphone'] });
    await context.addInitScript((seed) => {
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }, { 'ssa:shell.onboarding': '{"skipped":true}', 'ssa:camera.capo': JSON.stringify(truth.capo), 'ssa:camera.capoAskedAt': JSON.stringify(Date.now()) });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto(`${url}#camera--scale--a--minor-pentatonic--box-1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-camera-stage]', { state: 'attached', timeout: 120000 });
    if (truth.hints.leftHanded) await page.evaluate(async () => (await import('/src/core/progress/index.ts')).setPrefs({ handedness: 'left' }));
    await page.evaluate(async (code) => {
      const mod = await import('/src/features/camera/debug.ts');
      const reader = document.createElement('canvas');
      reader.width = (code.cells * code.cell) / 2;
      reader.height = code.cell / 2;
      const rctx = reader.getContext('2d', { willReadFrequently: true });
      const decode = (v) => {
        rctx.drawImage(v, code.x, code.y, code.cells * code.cell, code.cell, 0, 0, reader.width, reader.height);
        const img = rctx.getImageData(0, 0, reader.width, reader.height);
        const half = code.cell / 2;
        const lum = (c) => { const i = (Math.round(0.5 * half) * img.width + Math.round((c + 0.5) * half)) * 4; return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; };
        const w = lum(0);
        const b = lum(1);
        if (!(w - b > 80)) return -1;
        let n = 0;
        for (let c = 2; c < code.cells; c++) n = n * 2 + (lum(c) > (w + b) / 2 ? 1 : 0);
        return n;
      };
      window.__alt = { log: [], on: false };
      mod.cameraDebug.hook = (info) => {
        if (window.__alt.on) window.__alt.log.push({ shown: decode(info.video), view: info.view, vw: info.videoWidth, vh: info.videoHeight, markers: info.markers });
      };
    }, truth.code);
    if (THROTTLE) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Start camera' }).click();
    const locked = await page.waitForFunction(() => document.querySelector('[data-ui-page][data-mode]')?.getAttribute('data-state') === 'locked', null, { timeout: 30000 }).then(() => true).catch(() => false);
    const lockMs = Date.now() - t0;
    await page.evaluate(() => { window.__alt.log = []; window.__alt.on = true; });
    await page.waitForTimeout(16000);
    const log = await page.evaluate(() => { window.__alt.on = false; return window.__alt.log; });
    await page.screenshot({ path: path.join(OUT, `${scene.id}${THROTTLE ? `-x${THROTTLE}` : ''}.png`) });
    return { locked, lockMs, log, errors, truth };
  } finally {
    await browser.close();
  }
}

(async () => {
  const A = await loadTs('/src/core/vision/testing/alt-scenes.ts');
  const server = await startServer();
  try {
    for (const scene of SCENES) {
      const r = await runScene(A, server.url, scene);
      const s = score(A, r.truth, r.log);
      const g = scene.id;
      if (verbose) console.log(`  ${g}: locked in ${r.lockMs} ms; ${r.log.length} overlay frames; in view ${s.inView}: solid ${s.solid} (right ${pct(s.solidRight, s.solid)}), outlines only ${s.ghostOnly}; along-neck median ${s.alongMedian?.toFixed?.(2)} cells; no neck ${s.noNeck} (solid dots: ${s.firstNoNeckSolid} in the first 10 frames, ${s.deepNoNeckSolid} later)`);
      check(g, 'locks on', r.locked, `${r.lockMs} ms`);
      check(g, 'no errors on the page', r.errors.length === 0, r.errors.slice(0, 3).join(' | '));
      if (scene.id === 'jump') {
        check(g, 'after a cut to another guitar, solid dots are right on >= 70% of frames (known tracker limit)', s.solid === 0 || s.solidRight >= 0.7 * s.solid, `${s.solidRight}/${s.solid}`);
        continue;
      }
      if (scene.id === 'lost') {
        check(g, 'no solid dot once the guitar has been gone for a third of a second (10 frames)', s.noNeck > 20 && s.deepNoNeckSolid === 0, `${s.deepNoNeckSolid} of ${s.noNeck} frames without a neck`);
      }
      check(g, 'solid dots are right on >= 90% of the frames that show them', s.solid > 0 && s.solidRight >= 0.9 * s.solid, `${s.solidRight}/${s.solid}`);
      check(g, 'solid dots on at least a fifth of the frames with the neck in view', s.solid >= 0.2 * s.inView, `${s.solid}/${s.inView}`);
      check(g, 'median error along the neck under a fifth of a fret cell', s.alongMedian < 0.2, s.alongMedian?.toFixed?.(3));
    }
  } finally {
    await server.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `FAILED (${failed.length} of ${results.length} checks)` : `PASSED (${results.length} checks)`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
