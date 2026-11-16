#!/usr/bin/env node
/**
 * Browser check of the Live Fretboard (`#camera`) with a fake camera.
 *
 *   node e2e/camera.cjs                  everything (about 10 minutes on a busy machine once the fixture exists;
 *                                        the first run renders it, about 5 minutes more)
 *   node e2e/camera.cjs --only live,tools   some groups: live, mirror, tools, content, lifecycle, nocamera, shots
 *   node e2e/camera.cjs --verbose        print every check, not just failures
 *
 * The camera plays `e2e/camera-fixture.cjs`'s video: a rendered steel-string neck that sways,
 * drifts sideways, slides out of the picture, stays away and comes back, with every frame's index
 * stamped in a corner and its ground-truth pose saved beside it. A recorder hooked into the screen
 * (`src/features/camera/debug.ts`) logs every overlay frame: which video frame was on screen (read
 * from the stamp), the tracker state, and every dot drawn (CSS pixels of the stage). In Node each
 * dot is taken back to video pixels through the stage's fit and mirroring and located on the true
 * board of THAT frame: right when it is on the right string, in the right fret cell.
 *
 * Groups:
 *   live       Start camera -> it locks; dots on the right frets (>= 95% of frames, >= 90% of the
 *              dots each); the dots follow the drift; when the neck leaves the picture no solid dot
 *              is drawn and the screen says so; it locks again when the neck comes back
 *   mirror     the mirror switch flips the picture and the dots stay right
 *   tools      fix the fret numbers (all +2 -> dots two frets off; tap a fret and say its number ->
 *              right again), marking the neck with four taps on a still picture (after a deliberate
 *              mis-numbering it is right again, numbers from the learner), sticker mode refuses a
 *              dull colour
 *   content    the microphone (a fake one plucking A2) flashes string 6, fret 5 green and nothing
 *              else; a chord, a song played (the step moves on), the find-a-note drill, the hand
 *              feedback switch (on, or "not available") without errors
 *   lifecycle  a hidden tab releases the camera and takes it back; leaving the route releases it
 *              and the vision worker, and logs the session as practice
 *   nocamera   no camera: MediaBlocked once, then the drawn neck with the same dots; the next visit
 *              goes straight to the drawn neck
 *   shots      screenshots: desktop and phone sideways (dark and light), phone upright
 *
 * Prints one line per failed check (all with --verbose), then PASSED or FAILED; exits non-zero on failure.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, loadTs, ROOT } = require('./lib/harness.cjs');
const { buildCameraFixture } = require('./camera-fixture.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
const want = (g) => !only || only.has(g);
const OUT = path.join(ROOT, 'e2e', 'out', 'camera');
const SEED = { 'ssa:shell.onboarding': '{"skipped":true}' };
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];
const ROUTE = 'camera--scale--a--minor-pentatonic--box-1';

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail !== '' ? `  (${String(detail).slice(0, 500)})` : ''}`);
  return !!pass;
}

// ---------------------------------------------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------------------------------------------

async function launch(video, audio) {
  const args = ['--autoplay-policy=no-user-gesture-required'];
  if (video) args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`);
  if (video && audio) args.push(`--use-file-for-fake-audio-capture=${audio}`);
  return chromium.launch({ args });
}

/** The fake microphone: an A2 (string 6, fret 5) plucked every 1.2 s, 48 kHz 16-bit. */
async function makeMicFile() {
  const file = path.join(OUT, 'a2-plucks.wav');
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(OUT, { recursive: true });
  const audio = await loadTs('/src/core/audio/index.ts');
  const notes = [];
  for (let t = 0.3; t < 6; t += 1.2) notes.push({ time: t, midi: 45, string: 6, velocity: 0.85, duration: 1.0 });
  const x = audio.renderSequence(notes, { sampleRate: 48000, seconds: 6.2, tone: 'steel' });
  fs.writeFileSync(file, Buffer.from(audio.encodeWav(x, 48000, { bitDepth: 16 })));
  return file;
}

async function open(browser, url, { viewport = { width: 1280, height: 800 }, mobile = false, theme = 'dark', camera = true, seed = {} } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme, hasTouch: mobile, isMobile: mobile, permissions: camera ? ['camera', 'microphone'] : [] });
  await context.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
  }, { ...SEED, ...seed });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((b) => b.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  const goto = async (hash) => {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route="camera"] [data-camera-stage]', { timeout: 120000 });
    await page.waitForTimeout(300);
  };
  return { page, context, errors, goto, close: () => context.close() };
}

const attr = (page, name) => page.evaluate((n) => document.querySelector('[data-ui-page][data-mode]')?.getAttribute(n) ?? null, name);
async function waitAttr(page, name, values, timeout = 20000) {
  const list = Array.isArray(values) ? values : [values];
  return page
    .waitForFunction(([n, l]) => l.includes(document.querySelector('[data-ui-page][data-mode]')?.getAttribute(n) ?? ''), [name, list], { timeout })
    .then(() => true)
    .catch(() => false);
}

/** Hook the recorder into the screen: every overlay frame with the video frame on screen. */
async function installRecorder(page, code) {
  await page.evaluate(async (code) => {
    const mod = await import('/src/features/camera/debug.ts');
    const reader = document.createElement('canvas');
    reader.width = Math.round((code.cells * code.cell) / 2);
    reader.height = Math.round(code.cell / 2);
    const rctx = reader.getContext('2d', { willReadFrequently: true });
    const decodeVideo = (video) => {
      rctx.drawImage(video, code.x, code.y, code.cells * code.cell, code.cell, 0, 0, reader.width, reader.height);
      const img = rctx.getImageData(0, 0, reader.width, reader.height);
      const lum = (cx, cy) => {
        const i = (Math.round(cy) * img.width + Math.round(cx)) * 4;
        return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      };
      const half = code.cell / 2;
      const cell = (c) => lum((c + 0.5) * half, 0.5 * half);
      const white = cell(0);
      const black = cell(1);
      if (!(white - black > 80)) return -1;
      const mid = (white + black) / 2;
      let v = 0;
      for (let c = 2; c < code.cells; c++) v = v * 2 + (cell(c) > mid ? 1 : 0);
      return v;
    };
    window.__cam = { log: [], recording: false, debug: mod.cameraDebug, decodeVideo };
    mod.cameraDebug.hook = (info) => {
      const cam = window.__cam;
      if (!cam.recording) return;
      cam.log.push({
        t: performance.now(),
        shown: decodeVideo(info.video),
        state: info.state,
        notes: info.notes,
        view: info.view,
        vw: info.videoWidth,
        vh: info.videoHeight,
        numbering: info.numbering,
        guidance: info.guidance,
        trust: info.trust,
        conf: info.confidence,
        flashes: info.flashes,
        markers: info.markers,
      });
      if (cam.log.length > 4000) cam.log.splice(0, cam.log.length - 4000);
    };
  }, code);
}

async function record(page, ms) {
  await page.evaluate(() => {
    window.__cam.log = [];
    window.__cam.recording = true;
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    window.__cam.recording = false;
    return window.__cam.log;
  });
}

/** The video frame on screen now. */
const shownFrame = (page) => page.evaluate(() => window.__cam.decodeVideo(document.querySelector('[data-camera-stage] video')));

/** Wait until the video shows a frame in [lo, hi]. */
async function waitForFrame(page, lo, hi, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const f = await shownFrame(page);
    if (f >= lo && f <= hi) return f;
    await page.waitForTimeout(100);
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------
// Scoring against the truth
// ---------------------------------------------------------------------------------------------

/**
 * Score logged frames: every solid dot against the true board of the frame on screen. A dot is
 * right when it is in the same fret cell, and within half a string spacing across the neck, as the
 * dot the overlay would draw from the TRUE pose (the overlay puts dots on the strings as the camera
 * sees them, raised above the wood: `projectMarkerSeen`). `shift` = the fret offset every dot is
 * expected to have (the renumbering checks). Also counts dots in the right cell of the flat board.
 */
function score(geo, ov, truth, log, { shift = 0, steady = false } = {}) {
  const out = { frames: 0, right: 0, dots: 0, rightDots: 0, flatDots: 0, solidAway: 0, wrapSkip: 0, wrong: [] };
  const cams = new Map();
  let prev = -1;
  let wrapAt = -Infinity;
  log.forEach((e, k) => {
    if (e.shown < 0) return;
    if (prev >= 0 && e.shown < prev - 100) wrapAt = k;
    prev = e.shown;
    const tf = truth.frames[e.shown];
    const solid = e.markers.filter((m) => !m.ghost);
    if (!tf.inFrame) {
      out.solidAway += solid.length > 0 ? 1 : 0;
      return;
    }
    if (e.notes !== 'solid' || solid.length === 0) return;
    // Checks about numbering (not motion) leave out the neck sliding out of the picture and back.
    if (steady && e.shown >= truth.phases.exit[0] && e.shown < truth.phases.return[1]) return;
    // Right after the looping video starts again the tracker sees a new scene: give it a second.
    if (k > wrapAt && k - wrapAt <= 30 && e.shown < 30) {
      out.wrapSkip++;
      return;
    }
    const tp = tf.pose;
    if (!cams.has(e.shown)) cams.set(e.shown, geo.cameraCentre(tp));
    const cam = cams.get(e.shown);
    let ok = 0;
    for (const m of solid) {
      const p = ov.displayToFrame({ x: m.x, y: m.y }, e.view, e.vw, e.vh);
      const loc = geo.locatePixel(tp, p);
      const exp = geo.locatePixel(tp, geo.projectMarkerSeen(tp, m.string, m.fret - shift, cam));
      if (loc && loc.onBoard && loc.string === m.string && loc.fret === m.fret - shift) out.flatDots++;
      if (!loc || !exp) continue;
      const half = Math.abs(geo.stringY(tp.model, 1, exp.x) - geo.stringY(tp.model, 2, exp.x)) / 2;
      if (loc.fret === exp.fret && Math.abs(loc.y - exp.y) < half) ok++;
    }
    out.frames++;
    out.dots += solid.length;
    out.rightDots += ok;
    if (ok / solid.length >= 0.9) out.right++;
    else if (out.wrong.length < 12) out.wrong.push({ shown: e.shown, ok, of: solid.length, numbering: e.numbering, g: e.guidance, c: +(e.conf ?? 0).toFixed(2) });
  });
  return out;
}
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');

// ---------------------------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------------------------

async function startCamera(page) {
  await page.getByRole('button', { name: 'Start camera' }).click();
  const live = await waitAttr(page, 'data-mode', 'live', 30000);
  const locked = live && (await waitAttr(page, 'data-state', 'locked', 30000));
  return { live, locked };
}

async function liveGroups(browser, url, fixture, geo, ov) {
  const { truth } = fixture;
  const s = await open(browser, url);
  const { page } = s;
  try {
    await s.goto(ROUTE);
    await installRecorder(page, truth.code);
    const t0 = Date.now();
    const { live, locked } = await startCamera(page);
    check('live', 'one tap on "Start camera" turns the camera on', live);
    check('live', 'the neck locks', locked, `${Date.now() - t0} ms after the tap`);
    if (!locked) return;

    if (want('live')) {
      // A whole loop of the video (20 s) and a little more.
      await waitForFrame(page, 0, 60);
      const log = await record(page, 21000);
      if (process.env.CAMERA_DUMP) fs.writeFileSync(process.env.CAMERA_DUMP, JSON.stringify(log));
      const sc = score(geo, ov, truth, log);
      console.log(`  live: ${log.length} overlay frames; ${sc.right}/${sc.frames} frames with >= 90% of dots right (${pct(sc.rightDots, sc.dots)} of ${sc.dots} dots; ${pct(sc.flatDots, sc.dots)} in the right cell of the flat board)`);
      check('live', 'notes are drawn on most frames where the neck is in view', sc.frames >= 0.5 * log.filter((e) => e.shown >= 0 && truth.frames[e.shown].inFrame).length, `${sc.frames} frames with dots`);
      check('live', '>= 95% of frames put >= 90% of the dots on the right string and fret', sc.right >= 0.95 * sc.frames, `${sc.right}/${sc.frames}; wrong: ${JSON.stringify(sc.wrong)}`);
      // Following the drift: the same dot moves with the neck, and stays right.
      const drift = (lo, hi) => {
        const xs = log.filter((e) => e.shown >= lo && e.shown <= hi && e.notes === 'solid').map((e) => e.markers.find((m) => m.string === 6 && m.fret === 5 && !m.ghost)).filter(Boolean).map((m) => m.x);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
      };
      const before = drift(140, 155);
      const after = drift(225, 240);
      const driftLog = log.filter((e) => e.shown >= 150 && e.shown < 240);
      const driftScore = score(geo, ov, truth, driftLog);
      check('live', 'the dots follow the neck as it drifts across the picture', Math.abs(after - before) > 60, `string 6 fret 5 moved ${Math.round(after - before)} px`);
      check('live', 'while drifting, the dots stay on the right frets', driftScore.frames > 10 && driftScore.right >= 0.9 * driftScore.frames, `${driftScore.right}/${driftScore.frames}`);
      // Leaving the picture: no solid dot on a frame without the neck; the screen says it lost it.
      const away = log.filter((e) => e.shown >= truth.phases.away[0] + 45 && e.shown < truth.phases.return[0]);
      const states = [...new Set(away.map((e) => e.state))];
      check('live', 'with the neck out of the picture, no solid dot is drawn', sc.solidAway === 0 && away.length > 10 && away.every((e) => e.markers.length === 0), `${sc.solidAway} frames with dots, ${away.length} frames away`);
      check('live', 'with the neck gone, the status is "lost" or "searching", never "locked"', away.length > 0 && !states.includes('locked') && !states.includes('candidate'), states.join(','));
      const back = log.filter((e) => e.shown >= truth.phases.return[1] && e.state === 'locked');
      check('live', 'it locks again when the neck comes back', back.length > 0, `${back.length} locked frames after frame ${truth.phases.return[1]}`);
    }

    if (want('mirror')) {
      const before = await page.evaluate(() => getComputedStyle(document.querySelector('[data-camera-stage] video')).transform);
      await page.getByRole('button', { name: 'Mirror the picture (M)' }).click();
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => getComputedStyle(document.querySelector('[data-camera-stage] video')).transform);
      check('mirror', 'the mirror switch flips the picture', before !== after && (await attr(page, 'data-mirrored')) === 'false', `${before} -> ${after}`);
      await waitForFrame(page, 20, 120);
      const log = await record(page, 2500);
      const sc = score(geo, ov, truth, log);
      check('mirror', 'unmirrored, the dots are still on the right frets', sc.frames > 10 && sc.right >= 0.95 * sc.frames && log.every((e) => e.view.mirrored === false), `${sc.right}/${sc.frames}`);
      await page.getByRole('button', { name: 'Mirror the picture (M)' }).click();
      await page.waitForTimeout(300);
      check('mirror', 'and back to a mirror image', (await attr(page, 'data-mirrored')) === 'true');
    }

    if (want('tools')) await tools(page, truth, geo, ov);
    if (want('content')) await content(page, truth);
    if (want('lifecycle')) await lifecycle(page);
    const errs = s.errors.filter((e) => !/AudioContext|play\(\) request/.test(e));
    check('live', 'no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await s.close();
  }
}

/** Stage-relative point -> click on the page. */
async function tapStage(page, p) {
  const box = await page.locator('[data-camera-stage]').boundingBox();
  await page.mouse.click(box.x + p.x, box.y + p.y);
}

async function stageView(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-camera-stage]');
    const v = el.querySelector('video');
    return { view: { width: el.clientWidth, height: el.clientHeight, mirrored: document.querySelector('[data-ui-page][data-mode]').getAttribute('data-mirrored') === 'true', fit: 'contain' }, vw: v.videoWidth, vh: v.videoHeight };
  });
}

async function tools(page, truth, geo, ov) {
  // ---- Fix the fret numbers: move every number by +2, then tap a fret and say its number. All of
  // it while the neck stays in the picture (from its return through the loop to its next exit),
  // so the tracker never has to find the board again.
  await waitForFrame(page, truth.phases.return[1] - 30, truth.phases.return[1] + 10, 40000);
  await waitAttr(page, 'data-state', 'locked', 10000);
  await page.getByRole('button', { name: 'Fix the fret numbers' }).click();
  check('tools', '"Fix the fret numbers" opens its tool', await waitAttr(page, 'data-tool', 'numbers', 5000));
  await page.getByRole('button', { name: 'All one higher' }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'All one higher' }).click();
  await page.waitForTimeout(700);
  let log = await record(page, 2000);
  let off = score(geo, ov, truth, log, { shift: 2, steady: true });
  check('tools', 'after "all one higher" twice, every dot sits two frets lower on the real neck', off.frames > 8 && off.right >= 0.9 * off.frames, `${off.right}/${off.frames} (${pct(off.rightDots, off.dots)} of dots)`);
  // The learner's word stays while the neck is in view, nut and all.
  log = await record(page, 4000);
  off = score(geo, ov, truth, log, { shift: 2, steady: true });
  check('tools', 'the shifted numbers stay (the tracker does not undo the learner)', off.frames > 15 && off.right >= 0.9 * off.frames, `${off.right}/${off.frames}`);
  // One tap: the true cell of fret 7 on string 3 of the frame on screen, then "7".
  const f = await shownFrame(page);
  const { view, vw, vh } = await stageView(page);
  check('tools', 'the neck is still in the picture for the tap', f >= 0 && truth.frames[f].inFrame, f);
  const tp = truth.frames[Math.max(0, f)].pose;
  await tapStage(page, ov.frameToDisplay(geo.projectMarker(tp, 3, 7), view, vw, vh));
  await page.waitForTimeout(300);
  const group = page.getByRole('group', { name: 'This fret is number' });
  const chipShown = await group.isVisible().catch(() => false);
  check('tools', 'a tap on the picture freezes it and offers fret numbers', chipShown && (await page.evaluate(() => document.querySelector('[data-camera-stage] video').paused)));
  if (chipShown) {
    const pressed = await group.locator('[aria-pressed="true"]').textContent().catch(() => null);
    check('tools', 'the number the camera gives that fret is preselected (9: two too high)', pressed === '9', pressed);
    await group.getByRole('button', { name: '7', exact: true }).click();
  }
  check('tools', 'choosing the number ends the tool', await waitAttr(page, 'data-tool', '', 5000));
  await page.waitForTimeout(800);
  log = await record(page, 2000);
  let sc = score(geo, ov, truth, log, { steady: true });
  check('tools', '"this is fret 7" puts every dot back on the right fret', sc.frames > 8 && sc.right >= 0.95 * sc.frames, `${sc.right}/${sc.frames}`);

  // ---- Mark the neck: mis-number on purpose, then four taps on a still picture showing the nut
  // and the 12th fret.
  await page.getByRole('button', { name: 'Fix the fret numbers' }).click();
  await page.getByRole('button', { name: 'All one higher' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Done' }).click();
  const g = await waitForFrame(page, 10, 180, 40000);
  await page.getByRole('button', { name: 'Mark the neck' }).first().click();
  check('tools', '"Mark the neck" opens its tool', await waitAttr(page, 'data-tool', 'calibrate', 5000));
  await page.waitForTimeout(400);
  const paused = await page.evaluate(() => document.querySelector('[data-camera-stage] video').paused);
  const still = await shownFrame(page);
  check('tools', 'marking happens on a still picture', paused && still >= 0 && truth.frames[still].inFrame, `paused ${paused}, frame ${still} (asked at ${g})`);
  const st = await stageView(page);
  const pose = truth.frames[Math.max(0, still)].pose;
  const m = pose.model;
  const at = (fret, side) => {
    const x = geo.fretX(m, fret);
    return ov.frameToDisplay(geo.projectPlanePoint(pose, x, geo.boardEdgeY(m, x, side)), st.view, st.vw, st.vh);
  };
  const steps = [at(0, 'bass'), at(0, 'treble'), at(12, 'bass'), at(12, 'treble')];
  const prompts = [];
  for (const p of steps) {
    prompts.push(await page.locator('[data-camera-banner]').textContent().catch(() => ''));
    await tapStage(page, p);
    await page.waitForTimeout(250);
  }
  check('tools', 'the prompts walk through the nut and the 12th fret', /nut/i.test(prompts[0]) && /fret 12/i.test(prompts[2]), prompts.map((p) => p.slice(0, 60)).join(' | '));
  check('tools', 'four taps end the tool', await waitAttr(page, 'data-tool', '', 6000));
  const moving = await page.evaluate(() => !document.querySelector('[data-camera-stage] video').paused);
  check('tools', 'and the picture moves again', moving);
  check('tools', 'locked after marking', await waitAttr(page, 'data-state', 'locked', 8000));
  await page.waitForTimeout(400);
  log = await record(page, 2000);
  sc = score(geo, ov, truth, log, { steady: true });
  const numbering = [...new Set(log.map((e) => e.numbering))];
  check('tools', 'marked by hand, the dots are on the right frets again (the mis-numbering is gone)', sc.frames > 8 && sc.right >= 0.95 * sc.frames, `${sc.right}/${sc.frames}`);
  check('tools', 'the numbers rest on the learner (or are carried from that)', numbering.every((n) => n === 'user' || n === 'tracked'), numbering.join(','));

  // ---- Sticker mode refuses a dull colour (the grey wall; the fixture has no tape. Accepting a
  // real sticker colour is covered by the vision module's marker tests).
  await page.getByRole('button', { name: 'Use two stickers' }).click();
  check('tools', 'sticker mode opens on a still picture', await waitAttr(page, 'data-tool', 'stickers', 5000));
  const sv = await stageView(page);
  await tapStage(page, ov.frameToDisplay({ x: 1180, y: 420 }, sv.view, sv.vw, sv.vh));
  const refused = await page.locator('[data-camera-banner]').filter({ hasText: /not colourful enough/i }).waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  check('tools', 'a tap on a dull colour is refused with a reason', refused);
  await page.keyboard.press('Escape');
  check('tools', 'Escape leaves the tool', await waitAttr(page, 'data-tool', '', 4000));
  check('tools', 'and the picture moves again', await page.evaluate(() => !document.querySelector('[data-camera-stage] video').paused));
}

async function content(page, truth) {
  // The microphone: the fake one plucks A2, which box 1 of A minor pentatonic has on string 6, fret 5.
  await page.getByRole('switch', { name: 'Listen to my guitar' }).click();
  const listening = await waitAttr(page, 'data-listen', 'on', 15000);
  check('content', '"Listen to my guitar" starts the microphone', listening, await attr(page, 'data-listen'));
  await waitForFrame(page, 0, 140, 30000);
  const heard = await record(page, 4000);
  const flashed = new Set(heard.flatMap((e) => e.flashes.map((f) => `${f.string}:${f.fret}`)));
  check('content', 'a played A2 flashes green on string 6, fret 5 (and nowhere else)', flashed.has('6:5') && flashed.size === 1, [...flashed].join(','));
  await page.getByRole('switch', { name: 'Listen to my guitar' }).click();
  check('content', 'and switching it off stops the microphone', await waitAttr(page, 'data-listen', 'off', 5000));
  // A chord: the G major open shape (six dots) on the neck.
  await page.getByRole('radio', { name: 'Chord' }).click();
  await page.waitForTimeout(600);
  await waitForFrame(page, 0, 130);
  let log = await record(page, 1200);
  const chordDots = Math.max(0, ...log.filter((e) => e.notes === 'solid').map((e) => e.markers.length));
  check('content', 'a chord shows its voicing on the neck (G: six dots)', chordDots === 6, chordDots);
  // A song: Play moves the step along.
  await page.getByRole('radio', { name: 'Song' }).click();
  await page.waitForFunction(() => document.querySelector('[data-camera-controls="song"] select')?.value, null, { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  const step0 = Number(await attr(page, 'data-step'));
  await page.getByRole('button', { name: /Play the song/ }).click();
  await page.waitForTimeout(6000);
  const step1 = Number(await attr(page, 'data-step'));
  check('content', 'playing a song moves the lit notes along', step1 > step0, `${step0} -> ${step1}`);
  await waitForFrame(page, 0, 150, 30000);
  log = await record(page, 800);
  const withDots = log.filter((e) => e.markers.length > 0);
  check('content', 'the song draws dots on the neck while it plays', log.length > 0 && withDots.length >= 0.8 * log.length, `${withDots.length}/${log.length} frames`);
  await page.getByRole('button', { name: /Pause/ }).first().click().catch(() => undefined);
  // The drill: one target dot, "Next note" changes it.
  await page.getByRole('radio', { name: 'Find a note' }).click();
  await page.waitForTimeout(600);
  const t1 = await page.locator('[data-camera-controls="note"]').textContent();
  await waitForFrame(page, 0, 130);
  log = await record(page, 1000);
  const drillDots = [...new Set(log.filter((e) => e.notes === 'solid').map((e) => e.markers.length))];
  check('content', 'the drill shows one target on the neck', drillDots.includes(1) && drillDots.every((n) => n <= 1), drillDots.join(','));
  let changed = false;
  for (let i = 0; i < 3 && !changed; i++) {
    await page.getByRole('button', { name: 'Next note' }).click();
    await page.waitForTimeout(300);
    changed = (await page.locator('[data-camera-controls="note"]').textContent()) !== t1;
  }
  check('content', '"Next note" asks for another note', changed);
  // Hand feedback: loads from the bundled files, or says it is not available; nothing breaks.
  await page.getByRole('switch', { name: /Hand feedback/ }).click();
  const ready = await waitAttr(page, 'data-hands', ['on', 'unavailable'], 60000);
  const hands = await attr(page, 'data-hands');
  check('content', 'hand feedback starts (or says it is not available)', ready, hands);
  await page.waitForTimeout(1500);
  check('content', 'still tracking with hand feedback on', (await attr(page, 'data-mode')) === 'live');
  await page.getByRole('switch', { name: /Hand feedback/ }).click();
  // Back to the scale.
  await page.getByRole('radio', { name: 'Scale' }).click();
  await page.waitForTimeout(400);
}

async function lifecycle(page) {
  // At least ten seconds of camera, so the session counts as practice.
  await page.waitForTimeout(9000);
  const before = await page.evaluate(() => {
    window.__cam.stream = window.__cam.debug.stream;
    return { starts: window.__cam.debug.starts, live: window.__cam.stream?.getVideoTracks()[0]?.readyState };
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);
  const hidden = await page.evaluate(() => ({ mode: document.querySelector('[data-ui-page][data-mode]').getAttribute('data-mode'), track: window.__cam.stream?.getVideoTracks()[0]?.readyState, pipeline: !!window.__cam.debug.pipeline }));
  check('lifecycle', 'a hidden tab releases the camera', before.live === 'live' && hidden.mode === 'hidden' && hidden.track === 'ended' && !hidden.pipeline, JSON.stringify(hidden));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  check('lifecycle', 'shown again, it takes the camera back', await waitAttr(page, 'data-mode', 'live', 20000));
  check('lifecycle', 'and locks again', await waitAttr(page, 'data-state', 'locked', 20000));
  // Leave the route.
  await page.evaluate(() => {
    window.__cam.stream = window.__cam.debug.stream;
    location.hash = '#tools';
  });
  await page.waitForSelector('main[data-route="tools"]', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const left = await page.evaluate(() => ({ track: window.__cam.stream?.getVideoTracks()[0]?.readyState, pipeline: !!window.__cam.debug.pipeline, releases: window.__cam.debug.releases }));
  const visionWorkers = page.workers().filter((w) => /vision/.test(w.url())).length;
  check('lifecycle', 'leaving the screen releases the camera', left.track === 'ended' && !left.pipeline, JSON.stringify(left));
  check('lifecycle', 'and the vision worker', visionWorkers === 0, `${visionWorkers} left`);
  const logged = await page.evaluate(async () => {
    const progress = await import('/src/core/progress/index.ts');
    return progress.getProgress().log.filter((e) => e.kind === 'camera').map((e) => ({ title: e.title, sec: e.durationSec, xp: e.xp }));
  });
  check('lifecycle', 'the session goes into the practice log (kind "camera")', logged.length === 1 && logged[0].sec >= 10, JSON.stringify(logged));
}

async function noCamera(url) {
  const browser = await launch(null);
  try {
    const s = await open(browser, url, { camera: false });
    const { page } = s;
    await s.goto(ROUTE);
    await page.getByRole('button', { name: 'Start camera' }).click();
    const blocked = await waitAttr(page, 'data-mode', 'blocked', 20000);
    check('nocamera', 'without a camera the screen explains why (MediaBlocked)', blocked && (await page.getByRole('button', { name: 'Use a drawn neck' }).isVisible()));
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, 'blocked-desktop.png') });
    await page.getByRole('button', { name: 'Use a drawn neck' }).click();
    check('nocamera', 'then the drawn neck', await waitAttr(page, 'data-mode', 'drawn', 5000));
    const dots = await page.locator('[data-camera-drawn] [data-state]').count();
    check('nocamera', 'the drawn neck shows the same dots (A minor pentatonic box 1: 12)', dots === 12, dots);
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, 'drawn-desktop.png') });
    // The drill on the drawn neck: tapping the right cell counts.
    await page.getByRole('radio', { name: 'Find a note' }).click();
    await page.waitForTimeout(500);
    const where = await page.locator('[data-camera-controls="note"]').textContent();
    check('nocamera', 'the drill works on the drawn neck', /on string \d/.test(where), where.slice(0, 80));
    // Next visit: straight to the drawn neck, no second MediaBlocked.
    await s.goto(ROUTE);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-camera-stage]', { timeout: 60000 });
    await page.getByRole('button', { name: 'Start camera' }).click();
    check('nocamera', 'MediaBlocked is shown once: the next refusal goes straight to the drawn neck', await waitAttr(page, 'data-mode', 'drawn', 20000));
    const errs = s.errors.filter((e) => !/NotFoundError|NotAllowedError|Requested device not found|Permission/.test(e));
    check('nocamera', 'no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await s.close();
    // A phone: the same, upright.
    const p = await open(browser, url, { camera: false, viewport: { width: 390, height: 844 }, mobile: true, theme: 'light' });
    await p.goto(ROUTE);
    await p.page.getByRole('button', { name: 'Start camera' }).click();
    await waitAttr(p.page, 'data-mode', 'blocked', 20000);
    await p.page.screenshot({ path: path.join(OUT, 'blocked-phone-light.png') });
    await p.page.getByRole('button', { name: 'Use a drawn neck' }).click();
    await waitAttr(p.page, 'data-mode', 'drawn', 5000);
    await p.page.waitForTimeout(500);
    await p.page.screenshot({ path: path.join(OUT, 'drawn-phone-light.png') });
    const wide = await p.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('nocamera', 'phone: the drawn neck fits without sideways scroll', wide <= 1, wide);
    await p.close();
  } finally {
    await browser.close();
  }
}

async function shots(url, fixture) {
  fs.mkdirSync(OUT, { recursive: true });
  const runs = [
    { name: 'desktop-dark', viewport: { width: 1280, height: 800 }, theme: 'dark' },
    { name: 'desktop-light', viewport: { width: 1280, height: 800 }, theme: 'light' },
    { name: 'phone-sideways-dark', viewport: { width: 844, height: 390 }, mobile: true, theme: 'dark' },
    { name: 'phone-sideways-light', viewport: { width: 844, height: 390 }, mobile: true, theme: 'light' },
    { name: 'phone-upright-dark', viewport: { width: 390, height: 844 }, mobile: true, theme: 'dark' },
  ];
  const pick = process.env.CAMERA_SHOTS ? new Set(process.env.CAMERA_SHOTS.split(',')) : null;
  for (const r of runs) {
    if (pick && !pick.has(r.name)) continue;
    const browser = await launch(fixture.video);
    try {
      const s = await open(browser, url, r);
      const { page } = s;
      await s.goto(ROUTE);
      await installRecorder(page, fixture.truth.code);
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `guide-${r.name}.png`) });
      const { locked } = await startCamera(page);
      await waitForFrame(page, 40, 120);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `live-${r.name}.png`) });
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check('shots', `${r.name}: locked, no sideways scroll`, locked && wide <= 1, `locked ${locked}, overflow ${wide}`);
      if (r.name === 'desktop-dark') {
        await page.getByRole('button', { name: 'Mark the neck' }).first().click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(OUT, 'tool-calibrate-desktop.png') });
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Full screen (F)' }).click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, 'focus-desktop.png') });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        // The fret-number tool after a tap, the song and the drill.
        await waitForFrame(page, 20, 140);
        await page.getByRole('button', { name: 'Fix the fret numbers' }).click();
        const st = await stageView(page);
        await tapStage(page, { x: st.view.width * 0.45, y: st.view.height * 0.5 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(OUT, 'tool-numbers-desktop.png') });
        await page.keyboard.press('Escape');
        await page.getByRole('radio', { name: 'Song' }).click();
        await page.waitForTimeout(1500);
        await page.getByRole('button', { name: /Play the song/ }).click();
        await waitForFrame(page, 20, 140);
        await page.waitForTimeout(2500);
        await page.screenshot({ path: path.join(OUT, 'song-desktop.png') });
        await page.getByRole('button', { name: /Pause/ }).first().click().catch(() => undefined);
        await page.getByRole('radio', { name: 'Find a note' }).click();
        await waitForFrame(page, 20, 140);
        await page.screenshot({ path: path.join(OUT, 'drill-desktop.png') });
        await page.getByRole('radio', { name: 'Chord' }).click();
        await waitForFrame(page, 20, 140);
        await page.screenshot({ path: path.join(OUT, 'chord-desktop.png') });
      }
      if (r.name === 'phone-sideways-dark') {
        await page.getByRole('button', { name: 'Controls', exact: true }).click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(OUT, 'sheet-phone-sideways.png') });
      }
      check('shots', `${r.name}: no page errors`, s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
      await s.close();
    } finally {
      await browser.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const fixture = await buildCameraFixture();
  const geo = await loadTs('/src/core/vision/geometry.ts');
  const ov = await loadTs('/src/core/vision/overlay.ts');
  console.log(`fixture: ${fixture.truth.description}, ${fixture.truth.frames.length} frames`);
  const server = await startServer();
  try {
    if (['live', 'mirror', 'tools', 'content', 'lifecycle'].some(want)) {
      const browser = await launch(fixture.video, await makeMicFile());
      try {
        await liveGroups(browser, server.url, fixture, geo, ov);
      } finally {
        await browser.close();
      }
    }
    if (want('nocamera')) await noCamera(server.url);
    if (want('shots')) await shots(server.url, fixture);
  } finally {
    await server.close();
  }
  const failed = results.filter((r) => !r.pass);
  const groups = [...new Set(results.map((r) => r.group))];
  for (const g of groups) {
    const rs = results.filter((r) => r.group === g);
    console.log(`${rs.every((r) => r.pass) ? 'ok  ' : 'FAIL'} ${g}: ${rs.filter((r) => r.pass).length}/${rs.length}`);
  }
  console.log(failed.length ? `FAILED (${failed.length} of ${results.length} checks)` : `PASSED (${results.length} checks)`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  console.log('FAILED');
  process.exit(1);
});
