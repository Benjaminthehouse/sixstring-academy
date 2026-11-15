#!/usr/bin/env node
/**
 * Live check of `@/core/vision` in a real browser with a fake camera.
 *
 *   node e2e/vision-live.cjs              one run (about 70 s once the fixture exists)
 *   node e2e/vision-live.cjs --repeat 3   three runs, each with its own dev server and browser
 *   node e2e/vision-live.cjs --fresh      re-render the fixture
 *   node e2e/vision-live.cjs --fixture-only  just make sure the fixture exists
 *   node e2e/vision-live.cjs --quick      shorter phases (smoke test)
 *
 * The fixture is rendered in Node with the benchmark renderer (`@/core/vision/testing`): the
 * 'hand-slide' choreography stretched to 11 s at 30 fps, 1280x720 (a steel-string guitar sways
 * gently and changes tilt, the fretting hand slides up the neck and back, then leaves), written as
 * MJPEG (concatenated JPEGs from jpeg-js; Chromium plays MJPEG fake cameras at 30 fps and loops
 * them). Every frame carries its index as a 12-cell black/white code in one corner, and the
 * ground-truth pose of every frame is kept next to the video, so the page's answers can be scored
 * frame by frame. The fixture is cached in e2e/out/vision/live/ (keyed by the renderer sources).
 *
 * In the page (the dev server, modules imported from /src): `requestCamera()` from
 * `@/core/platform`, a `<video>` shown mirrored with object-fit: cover, a canvas over it, and
 * `VisionPipeline` with `drawVisionOverlay` on every displayed frame. Phases:
 *
 *   A  the real pipeline (module worker, adaptive quality, extrapolation) for 12 s: it must lock
 *      within 2 s of starting; on locked frames >= 95% of the frames put >= 90% of the checked
 *      (string, fret) markers in the right cell of the true board, and the numbering must be
 *      right; measured: processed frames per second, worker time per frame (track / detect),
 *      latency, extrapolation error against the frame actually on screen; worker and page heap
 *      (CDP, after forced GC) must not grow; a screenshot of the overlay is saved.
 *   B  pause 1 s (no frames processed), resume (it must lock again).
 *   C  a pipeline forced down the quality ladder (tiny budget): the working size must step down
 *      and tracking must stay right across the size changes.
 *   D  the main-thread fallback (`worker: 'off'`): it must run and lock.
 *   E  clean stop: after stop() no frame callbacks, no worker, the page's own video and camera
 *      track untouched; 6 rapid start/stop cycles leave no worker behind.
 *
 * Exits non-zero if any check fails.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { withApp, loadTs, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const QUICK = flag('--quick');
const REPEAT = Math.max(1, Number(arg('--repeat', '1')) || 1);
const OUT = path.join(ROOT, 'e2e', 'out', 'vision', 'live');

const FPS = 30;
const FRAMES = 330;
const WIDTH = 1280;
const HEIGHT = 720;
const JPEG_QUALITY = 82;
/** Frame-index code: 12 cells (white, black, then 10 bits, most significant first). */
const CODE_CELLS = 12;
const CODE_CELL = 16; // pixels at 1280x720
const CODE_W = CODE_CELLS * CODE_CELL;
const CODE_H = CODE_CELL;
/** (string, fret) positions checked on every frame: every visible cell on strings 6, 4, 3 and 1. */
const CHECK_STRINGS = [6, 4, 3, 1];

// ---------------------------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------------------------

function fingerprint() {
  const dir = path.join(ROOT, 'src', 'core', 'vision', 'testing');
  const hash = crypto.createHash('sha1');
  for (const f of ['rng.ts', 'scene.ts', 'camera.ts', 'raster.ts', 'background.ts', 'guitar.ts', 'people.ts', 'render.ts', 'sequence.ts', '../geometry.ts']) hash.update(fs.readFileSync(path.join(dir, f)));
  hash.update(fs.readFileSync(__filename).toString().split('// ---- end of fixture ----')[0]);
  return hash.digest('hex').slice(0, 10);
}

/** Paint the frame index into the code rectangle at (x0, y0). */
function stampCode(data, width, x0, y0, index) {
  const bits = [1, 0];
  for (let b = 9; b >= 0; b--) bits.push((index >> b) & 1);
  for (let c = 0; c < CODE_CELLS; c++) {
    const v = bits[c] ? 255 : 0;
    for (let y = y0; y < y0 + CODE_H; y++) {
      for (let x = x0 + c * CODE_CELL; x < x0 + (c + 1) * CODE_CELL; x++) {
        const i = (y * width + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
    }
  }
}

async function buildFixture() {
  const key = fingerprint();
  const video = path.join(OUT, `hand-slide-${key}.mjpeg`);
  const truthFile = path.join(OUT, `hand-slide-${key}.json`);
  if (!flag('--fresh') && fs.existsSync(video) && fs.existsSync(truthFile)) return { video, truth: JSON.parse(fs.readFileSync(truthFile, 'utf8')) };
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/^hand-slide-.*\.(mjpeg|json)$/.test(f)) fs.rmSync(path.join(OUT, f));
  const jpeg = require('jpeg-js');
  const t = await loadTs('/src/core/vision/testing/index.ts');
  const g = await loadTs('/src/core/vision/geometry.ts');
  // The scene: the first variant of the recipe whose opening frame shows the nut (a cold start
  // can then number the frets by itself) and whose board never touches a corner of the frame.
  let chosen = null;
  for (let offset = 0; offset < 40 && !chosen; offset++) {
    const seq = t.buildSequence('hand-slide', { frames: FRAMES, seedOffset: offset });
    for (const spec of seq.frames) {
      spec.width = WIDTH;
      spec.height = HEIGHT;
      spec.camera.motionBlur *= WIDTH / 640;
    }
    const truths = seq.frames.map((s) => t.truthForScene(s));
    if (!truths[0].pose || !truths[0].nutVisible || seq.frames[0].leftHanded || seq.frames[0].mirrored || !seq.frames[0].bassSideUp) continue;
    const margin = 24;
    const corners = [
      { x: margin, y: margin },
      { x: WIDTH - CODE_W - margin, y: margin },
      { x: margin, y: HEIGHT - CODE_H - margin },
      { x: WIDTH - CODE_W - margin, y: HEIGHT - CODE_H - margin },
    ];
    const clear = corners.find((c) =>
      truths.every((tr) => {
        if (!tr.pose) return true;
        const q = g.boardOutline(tr.pose, { min: 0, max: tr.pose.model.fretCount }, true);
        const xs = q.map((p) => p.x);
        const ys = q.map((p) => p.y);
        const pad = 40;
        return Math.max(...xs) + pad < c.x || Math.min(...xs) - pad > c.x + CODE_W || Math.max(...ys) + pad < c.y || Math.min(...ys) - pad > c.y + CODE_H;
      }),
    );
    if (clear) chosen = { offset, seq, truths, code: clear };
  }
  if (!chosen) throw new Error('no hand-slide variant suits the live check');
  const { seq, truths, code } = chosen;
  console.log(`fixture: hand-slide seedOffset ${chosen.offset}, ${t.describeScene(seq.frames[0])}`);
  console.log(`rendering ${FRAMES} frames at ${WIDTH}x${HEIGHT} (about ${Math.round(FRAMES * 0.45)} s)...`);
  const cache = t.createRenderCache();
  const fd = fs.openSync(video + '.part', 'w');
  const t0 = Date.now();
  for (let i = 0; i < seq.frames.length; i++) {
    const { frame } = t.renderScene(seq.frames[i], cache);
    stampCode(frame.data, WIDTH, code.x, code.y, i);
    const enc = jpeg.encode({ data: Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength), width: WIDTH, height: HEIGHT }, JPEG_QUALITY);
    fs.writeSync(fd, enc.data);
    if (i % 30 === 29) process.stdout.write(`  ${i + 1}/${FRAMES} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
  }
  fs.closeSync(fd);
  fs.renameSync(video + '.part', video);
  const truth = {
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    code: { x: code.x, y: code.y, cell: CODE_CELL, cells: CODE_CELLS },
    hints: { model: seq.frames[0].guitar.kind, bassSideUp: seq.frames[0].bassSideUp, mirrored: seq.frames[0].mirrored, leftHanded: seq.frames[0].leftHanded },
    description: t.describeScene(seq.frames[0]),
    frames: truths.map((tr) => ({ pose: tr.pose, nutVisible: tr.nutVisible, observable: tr.numberingObservable, hand: tr.handFrets, occluded: tr.occluded })),
  };
  fs.writeFileSync(truthFile, JSON.stringify(truth));
  console.log(`fixture written: ${path.relative(ROOT, video)} (${(fs.statSync(video).size / 1e6).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return { video, truth };
}
// ---- end of fixture ----

// ---------------------------------------------------------------------------------------------
// The page side (serialised into the browser)
// ---------------------------------------------------------------------------------------------

/** Installs `window.__vl`: the camera, the DOM, and pipelines that log every answer. */
function installPage(cfg) {
  const NOTES = [
    [6, 5, 'R', 1], [6, 8, 'b3', 3], [5, 5, '4', 4], [5, 7, '5', 5], [4, 5, 'b7', 7], [4, 7, 'R', 1],
    [3, 5, 'b3', 3], [3, 7, '4', 4], [2, 5, '5', 5], [2, 8, 'b7', 7], [1, 5, 'R', 1], [1, 8, 'b3', 3],
  ].map(([string, fret, label, degree]) => ({ string, fret, label, degree }));
  const code = cfg.code;
  /** Frame index from an RGBA patch covering the code, `scale` patch pixels per fixture pixel; -1 when unreadable. */
  const decode = (data, width, ox, oy, scale) => {
    const lum = (cx, cy) => {
      let sum = 0;
      let n = 0;
      for (let y = Math.round(cy - 1); y <= Math.round(cy + 1); y++) {
        for (let x = Math.round(cx - 1); x <= Math.round(cx + 1); x++) {
          const i = (y * width + x) * 4;
          if (i < 0 || i + 2 >= data.length) continue;
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          n++;
        }
      }
      return n ? sum / n : NaN;
    };
    const cell = (c) => lum(ox + (c + 0.5) * code.cell * scale, oy + 0.5 * code.cell * scale);
    const white = cell(0);
    const black = cell(1);
    if (!(white - black > 80)) return -1;
    const mid = (white + black) / 2;
    let v = 0;
    for (let c = 2; c < code.cells; c++) v = v * 2 + (cell(c) > mid ? 1 : 0);
    return v;
  };
  const vl = {
    vision: null,
    stream: null,
    video: null,
    canvas: null,
    runs: {},
    async setup() {
      vl.vision = await import('/src/core/vision/index.ts');
      const platform = await import('/src/core/platform/index.ts');
      const res = await platform.requestCamera({ width: cfg.width, height: cfg.height });
      if (!res.ok) throw new Error(`camera: ${res.reason} ${res.detail ?? ''}`);
      vl.stream = res.stream;
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:10000;background:black';
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = res.stream;
      // A selfie preview: the picture is shown mirrored and cropped to the box.
      video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)';
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      box.append(video, canvas);
      document.body.append(box);
      await video.play();
      vl.video = video;
      vl.canvas = canvas;
      const reader = document.createElement('canvas');
      reader.width = Math.round((code.cells * code.cell) / 2);
      reader.height = Math.round(code.cell / 2);
      vl.reader = reader.getContext('2d', { willReadFrequently: true });
      return { width: video.videoWidth, height: video.videoHeight, settings: res.stream.getVideoTracks()[0].getSettings() };
    },
    /** Start a pipeline; it logs every answer and every second displayed frame. */
    async start(name, options) {
      const { VisionPipeline, drawVisionOverlay, fitOverlayCanvas, readOverlayPalette } = vl.vision;
      const run = { updates: [], renders: [], renderCount: 0, statuses: [], startedAt: 0, readyAt: 0, models: [] };
      vl.runs[name] = run;
      const palette = readOverlayPalette(document.documentElement);
      const canvas = vl.canvas;
      const ctx = canvas.getContext('2d');
      const enc = (H) => (H ? Array.from(H) : null);
      const p = new VisionPipeline({
        tracker: cfg.tracker,
        probe: { x: (code.x - 4) / cfg.width, y: (code.y - 4) / cfg.height, width: (code.cells * code.cell + 8) / cfg.width, height: (code.cell + 8) / cfg.height },
        ...options,
        onStatus: (s) => run.statuses.push({ t: performance.now(), ...s }),
        onUpdate: (u) => {
          const pr = u.probe;
          // The probe starts 4 fixture pixels before the code.
          const scale = u.width / cfg.width;
          const idx = pr ? decode(pr.data, pr.width, 4 * scale, 4 * scale, scale) : -1;
          const pose = u.update.pose;
          let model = -1;
          if (pose) {
            model = run.models.indexOf(pose.model);
            if (model < 0) model = run.models.push(pose.model) - 1;
          }
          run.updates.push({
            seq: u.seq, idx, state: u.update.state, ran: u.update.ran, conf: u.update.confidence,
            numbering: pose ? pose.numbering : null, numberingConf: pose ? pose.numberingConfidence : 0, H: pose ? enc(pose.H) : null, model,
            fw: pose ? pose.frameWidth : 0, fh: pose ? pose.frameHeight : 0, w: u.width, h: u.height, totalMs: u.timing.totalMs,
            readMs: u.timing.readMs, trackMs: u.timing.trackMs, latency: u.latencyMs, frameTime: u.frameTime, arrivedAt: u.arrivedAt,
            hint: u.update.hint, suggest: u.update.suggestCalibration,
          });
        },
        onRender: (r) => {
          run.renderCount++;
          const rect = canvas.getBoundingClientRect();
          const dpr = fitOverlayCanvas(canvas, rect.width, rect.height);
          const latest = r.latest ? r.latest.update : null;
          const notes = NOTES.map((n, i) => ({ ...n, target: i === Math.floor(r.timeMs / 500) % NOTES.length }));
          drawVisionOverlay(ctx, {
            view: { width: rect.width, height: rect.height, mirrored: true, fit: 'cover' },
            pose: r.pose, notes, state: latest ? latest.state : 'searching', confidence: latest ? latest.confidence : 0,
            numberingGuess: latest ? !latest.numberingConfirmed : false, timeMs: r.timeMs, palette, dpr,
          });
          if (run.renderCount % 2 === 0 && r.latest) {
            // Which frame is on screen now (drawImage ignores the CSS mirroring).
            vl.reader.drawImage(vl.video, code.x, code.y, code.cells * code.cell, code.cell, 0, 0, vl.reader.canvas.width, vl.reader.canvas.height);
            const img = vl.reader.getImageData(0, 0, vl.reader.canvas.width, vl.reader.canvas.height);
            const shown = decode(img.data, img.width, 0, 0, 0.5);
            const last = run.updates[run.updates.length - 1];
            run.renders.push({ t: r.timeMs, shown, from: last ? last.idx : -1, state: latest ? latest.state : null, pred: enc(r.pose ? r.pose.H : null), raw: enc(latest && latest.pose ? latest.pose.H : null), fw: r.pose ? r.pose.frameWidth : 0, fh: r.pose ? r.pose.frameHeight : 0, model: latest && latest.pose ? run.models.indexOf(latest.pose.model) : -1 });
          }
        },
      });
      run.pipeline = p;
      run.startedAt = performance.now();
      await p.start(vl.video);
      run.readyAt = performance.now();
      return { mode: p.mode, readyMs: run.readyAt - run.startedAt };
    },
    sample(name, x, y) {
      return vl.runs[name].pipeline.sampleMarkerColor({ x, y });
    },
    stats(name) {
      const s = vl.runs[name].pipeline.stats;
      return JSON.parse(JSON.stringify(s));
    },
    pause(name) {
      vl.runs[name].pipeline.pause();
      vl.runs[name].pausedAt = performance.now();
    },
    resume(name) {
      vl.runs[name].pipeline.resume();
      vl.runs[name].resumedAt = performance.now();
    },
    /** Stop a pipeline and hand its log over. */
    async finish(name) {
      const run = vl.runs[name];
      const statsBefore = JSON.parse(JSON.stringify(run.pipeline.stats));
      run.pipeline.stop();
      const rendersAtStop = run.renderCount;
      const updatesAtStop = run.updates.length;
      await new Promise((r) => setTimeout(r, 600));
      const track = vl.stream.getVideoTracks()[0];
      return {
        stats: statsBefore,
        statsAfter: JSON.parse(JSON.stringify(run.pipeline.stats)),
        rendersAfterStop: run.renderCount - rendersAtStop,
        updatesAfterStop: run.updates.length - updatesAtStop,
        videoKept: vl.video.srcObject === vl.stream && !vl.video.paused,
        trackLive: track.readyState === 'live',
        startedAt: run.startedAt,
        readyAt: run.readyAt,
        pausedAt: run.pausedAt,
        resumedAt: run.resumedAt,
        updates: run.updates,
        renders: run.renders,
        statuses: run.statuses,
        models: run.models,
      };
    },
    /** Rapid start/stop: stop after `delays` ms each (0 = before start has resolved). */
    async churn(delays) {
      const { VisionPipeline } = vl.vision;
      const out = [];
      for (const d of delays) {
        const p = new VisionPipeline({ tracker: cfg.tracker });
        const started = p.start(vl.video);
        if (d > 0) {
          await started;
          await new Promise((r) => setTimeout(r, d));
        }
        p.stop();
        await started.catch(() => undefined);
        out.push({ delay: d, mode: p.mode, running: p.isRunning });
      }
      return out;
    },
  };
  window.__vl = vl;
}

// ---------------------------------------------------------------------------------------------
// Scoring (Node side)
// ---------------------------------------------------------------------------------------------

function median(v) {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(v, q) {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))];
}
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');

/** Score one run's answers against the fixture's ground truth. */
function score(g, truth, log) {
  const W = truth.width;
  const Hh = truth.height;
  const est = (H, fw, fh, modelIndex) => g.scalePose(g.makePose(H, log.models[modelIndex], fw, fh), W / fw, Hh / fh);
  const out = { locked: 0, correct: 0, cells: [], wrongFrames: [], afterWrap: 0, firstLockMs: NaN, firstLockIdx: -1, unreadable: 0, states: {}, suggest: 0 };
  let prevIdx = -1;
  let wrapAt = -Infinity;
  log.updates.forEach((u, k) => {
    out.states[u.state] = (out.states[u.state] || 0) + 1;
    if (u.suggest) out.suggest++;
    if (u.idx < 0) {
      out.unreadable++;
      return;
    }
    if (prevIdx >= 0 && u.idx < prevIdx - 100) wrapAt = k;
    prevIdx = u.idx;
    if (u.state === 'locked' && !Number.isFinite(out.firstLockMs)) {
      out.firstLockMs = u.arrivedAt - log.readyAt;
      out.firstLockIdx = k;
    }
    if (u.state !== 'locked' || !u.H) return;
    // The fake camera loops: the jump back to frame 0 is a new scene for the tracker; give it 1.5 s.
    if (k > wrapAt && k - wrapAt <= 45 && u.idx < 45) {
      out.afterWrap++;
      return;
    }
    const tp = truth.frames[u.idx].pose;
    if (!tp) return;
    const e = est(u.H, u.fw, u.fh, u.model);
    let ok = 0;
    let n = 0;
    const vis = tp.visibleFrets;
    for (const s of [6, 4, 3, 1]) {
      for (let f = Math.max(1, vis.min + 1); f <= vis.max; f++) {
        const p = g.projectMarker(e, s, f);
        const loc = g.locatePixel(tp, p);
        n++;
        if (loc && loc.onBoard && loc.string === s && loc.fret === f) ok++;
      }
    }
    if (n === 0) return;
    out.locked++;
    out.cells.push(ok / n);
    if (ok / n >= 0.9) out.correct++;
    else out.wrongFrames.push({ k, idx: u.idx, acc: +(ok / n).toFixed(2), numbering: u.numbering });
  });
  // Extrapolation: the pose drawn on each displayed frame against the truth of THAT frame.
  const dist = (H, fw, fh, modelIndex, tp) => {
    const e = est(H, fw, fh, modelIndex);
    return g.poseDistancePx(e, tp);
  };
  const pred = [];
  const raw = [];
  for (const r of log.renders) {
    if (r.shown < 0 || !r.pred || !r.raw || r.state !== 'locked' || r.model < 0) continue;
    const tp = truth.frames[r.shown].pose;
    const before = truth.frames[Math.max(0, r.shown - 1)].pose;
    if (!tp || !before || r.shown === 0) continue;
    // Only frames where the guitar moves (on a still guitar both are trivially right).
    if (g.poseDistancePx(before, tp) < 0.5) continue;
    pred.push(dist(r.pred, r.fw, r.fh, r.model, tp));
    raw.push(dist(r.raw, r.fw, r.fh, r.model, tp));
  }
  // The error of each answer on its own frame (no time lag at all), for comparison.
  const own = [];
  for (const u of log.updates) {
    if (u.state !== 'locked' || !u.H || u.idx < 0 || u.model < 0) continue;
    const tp = truth.frames[u.idx].pose;
    if (tp) own.push(dist(u.H, u.fw, u.fh, u.model, tp));
  }
  out.extrapolation = { frames: pred.length, predictedPx: median(pred), rawPx: median(raw), predictedP90: pct(pred, 0.9), rawP90: pct(raw, 0.9), ownFramePx: median(own), ownFrameP90: pct(own, 0.9) };
  out.meanCells = out.cells.length ? out.cells.reduce((a, b) => a + b, 0) / out.cells.length : NaN;
  const track = log.updates.filter((u) => u.ran === 'track').map((u) => u.totalMs);
  const detect = log.updates.filter((u) => u.ran !== 'track').map((u) => u.totalMs);
  out.timing = {
    trackMedian: median(track), trackP95: pct(track, 0.95), detectMedian: median(detect), detectP95: pct(detect, 0.95),
    readMedian: median(log.updates.map((u) => u.readMs)), latencyMedian: median(log.updates.map((u) => u.latency)),
    widths: [...new Set(log.updates.map((u) => u.w))],
  };
  return out;
}

// ---------------------------------------------------------------------------------------------
// Memory (CDP: the page's heap and the vision worker's heap, after forced garbage collection)
// ---------------------------------------------------------------------------------------------

async function memoryProbe(browser, page, context) {
  const pageCdp = await context.newCDPSession(page);
  const cdp = await browser.newBrowserCDPSession();
  let worker = null;
  let id = 0;
  const pending = new Map();
  cdp.on('Target.receivedMessageFromTarget', (e) => {
    const m = JSON.parse(e.message);
    if (pending.has(m.id)) {
      pending.get(m.id)(m.result || m.error);
      pending.delete(m.id);
    }
  });
  const attach = async () => {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const t = targetInfos.find((x) => x.type === 'worker' && x.url.includes('vision.worker'));
    if (!t) return false;
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: false });
    worker = (method, params = {}) =>
      new Promise((resolve) => {
        const mid = ++id;
        pending.set(mid, resolve);
        cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: mid, method, params }) }).catch(() => resolve(null));
        setTimeout(() => {
          if (pending.has(mid)) {
            pending.delete(mid);
            resolve(null);
          }
        }, 5000);
      });
    return true;
  };
  return {
    async sample(gc) {
      if (!worker) await attach();
      if (gc) {
        await pageCdp.send('HeapProfiler.collectGarbage');
        if (worker) await worker('HeapProfiler.collectGarbage');
      }
      const pageHeap = await pageCdp.send('Runtime.getHeapUsage');
      const workerHeap = worker ? await worker('Runtime.getHeapUsage') : null;
      return { page: pageHeap, worker: workerHeap };
    },
    async close() {
      await pageCdp.detach().catch(() => undefined);
      await cdp.detach().catch(() => undefined);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// One run
// ---------------------------------------------------------------------------------------------

async function runOnce(fixture, g, runNo) {
  const { video, truth } = fixture;
  const failures = [];
  const check = (ok, what) => {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
  };
  const A_MS = QUICK ? 6000 : 12000;
  const report = {};
  await withApp({ fakeVideo: video, settle: 200 }, async ({ page, context, browser, goto, errors }) => {
    await goto('camera');
    await page.evaluate(installPage, { code: truth.code, width: truth.width, height: truth.height, tracker: { model: truth.hints.model, bassSideUp: truth.hints.bassSideUp, mirrored: false, leftHanded: truth.hints.leftHanded } });
    const cam = await page.evaluate(() => window.__vl.setup());
    console.log(`  camera ${cam.width}x${cam.height} @ ${cam.settings.frameRate} fps`);
    check(cam.width === truth.width && cam.height === truth.height, `the fake camera delivers ${truth.width}x${truth.height}`);
    const mem = await memoryProbe(browser, page, context);

    // ---- A: the real pipeline -----------------------------------------------------------------
    const a = await page.evaluate(() => window.__vl.start('A', {}));
    console.log(`  A: mode ${a.mode}, frames flowing after ${f1(a.readyMs)} ms`);
    check(a.mode === 'worker', 'A runs in a module worker');
    await page.waitForTimeout(Math.min(4000, A_MS / 3));
    const mem0 = await mem.sample(true);
    const midStats = await page.evaluate(() => window.__vl.stats('A'));
    const trail = [];
    const t0 = Date.now();
    let shot = false;
    while (Date.now() - t0 < A_MS - Math.min(4000, A_MS / 3)) {
      await page.waitForTimeout(1000);
      trail.push(await mem.sample(false));
      if (!shot && Date.now() - t0 > 3000) {
        fs.mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: path.join(OUT, `overlay-run${runNo}.png`) });
        shot = true;
      }
    }
    const mem1 = await mem.sample(true);
    const statsA = await page.evaluate(() => window.__vl.stats('A'));
    // Marker mode's colour sampling through the worker: the beige wall and the dark teal body are
    // not colourful enough to follow (the fixture has no tape; the positive case is a unit test).
    const bodyColor = await page.evaluate(() => window.__vl.sample('A', 40, 680));
    const wallColor = await page.evaluate(() => window.__vl.sample('A', 1100, 600));

    // ---- B: pause and resume ------------------------------------------------------------------
    await page.evaluate(() => window.__vl.pause('A'));
    const pausedCount = await page.evaluate(() => window.__vl.runs.A.updates.length);
    await page.waitForTimeout(1000);
    const pausedAfter = await page.evaluate(() => window.__vl.runs.A.updates.length);
    await page.evaluate(() => window.__vl.resume('A'));
    await page.waitForTimeout(QUICK ? 2000 : 3000);
    const logA = await page.evaluate(() => window.__vl.finish('A'));
    for (let i = 0; i < 30 && page.workers().length > 0; i++) await page.waitForTimeout(100);
    const workersAfterA = page.workers().length;

    // ---- C: forced down the quality ladder ------------------------------------------------------
    await page.evaluate(() => window.__vl.start('C', { quality: { trackBudgetMs: 3, warmupMs: 300, cooldownMs: 700 } }));
    await page.waitForTimeout(QUICK ? 3500 : 5000);
    const logC = await page.evaluate(() => window.__vl.finish('C'));

    // ---- D: main-thread fallback ----------------------------------------------------------------
    const d = await page.evaluate(() => window.__vl.start('D', { worker: 'off' }));
    await page.waitForTimeout(QUICK ? 3000 : 4000);
    const logD = await page.evaluate(() => window.__vl.finish('D'));

    // ---- E: churn -------------------------------------------------------------------------------
    const churn = await page.evaluate(() => window.__vl.churn([0, 0, 50, 150, 400, 900]));
    // A terminated worker's 'close' reaches Playwright a little later on a busy machine.
    for (let i = 0; i < 30 && page.workers().length > 0; i++) await page.waitForTimeout(100);
    const workersAfterChurn = page.workers().length;
    await mem.close();

    // ---- Scoring --------------------------------------------------------------------------------
    const sA = score(g, truth, logA);
    const resumeIdx = logA.updates.findIndex((u) => u.arrivedAt >= logA.resumedAt);
    const relock = logA.updates.slice(Math.max(0, resumeIdx)).find((u) => u.state === 'locked');
    const processedA = logA.updates.filter((u) => u.arrivedAt >= logA.readyAt + 2000 && u.arrivedAt < (logA.pausedAt ?? Infinity));
    const spanA = ((logA.pausedAt ?? logA.updates.at(-1).arrivedAt) - (logA.readyAt + 2000)) / 1000;
    const fpsA = processedA.length / spanA;
    const MB = 1024 * 1024;
    const growth = (k, field) => ((mem1[k]?.[field] ?? 0) - (mem0[k]?.[field] ?? 0)) / MB;
    report.A = {
      lockMs: sA.firstLockMs, locked: sA.locked, correct: sA.correct, meanCells: sA.meanCells, wrong: sA.wrongFrames.slice(0, 6), states: sA.states,
      fps: fpsA, stats: statsA, midStats, timing: sA.timing, extrapolation: sA.extrapolation, unreadable: sA.unreadable, suggest: sA.suggest,
      memory: { pageUsedMB: growth('page', 'usedSize'), workerUsedMB: growth('worker', 'usedSize'), workerBackingMB: growth('worker', 'backingStorageSize'), base: mem0, end: mem1, trail: trail.map((t) => ({ page: t.page?.usedSize, worker: t.worker?.usedSize, backing: t.worker?.backingStorageSize })) },
    };
    console.log(`  A: locked after ${f1(sA.firstLockMs)} ms; ${sA.correct}/${sA.locked} locked frames correct (mean cell accuracy ${(sA.meanCells * 100).toFixed(1)}%), states ${JSON.stringify(sA.states)}`);
    console.log(`     ${f1(fpsA)} frames/s processed (video ${f1(statsA.offeredFps)} fps; dropped ${statsA.framesDropped}, skipped ${statsA.framesSkipped}); worker per frame: track median ${f1(sA.timing.trackMedian)} ms (p95 ${f1(sA.timing.trackP95)}), detect median ${f1(sA.timing.detectMedian)} ms (p95 ${f1(sA.timing.detectP95)}), bitmap read-back ${f1(sA.timing.readMedian)} ms; latency ${f1(sA.timing.latencyMedian)} ms; working widths ${sA.timing.widths.join(', ')}; main thread per video frame ${statsA.mainThreadMs.toFixed(2)} ms median (max ${f1(statsA.mainThreadMaxMs)})`);
    console.log(`     drawn pose vs the frame on screen (${sA.extrapolation.frames} moving frames, 1280x720 px): ${f1(sA.extrapolation.predictedPx)} px (p90 ${f1(sA.extrapolation.predictedP90)}) extrapolated, ${f1(sA.extrapolation.rawPx)} px (p90 ${f1(sA.extrapolation.rawP90)}) as answered; each answer on its own frame ${f1(sA.extrapolation.ownFramePx)} px (p90 ${f1(sA.extrapolation.ownFrameP90)})`);
    console.log(`     memory after GC, ${((A_MS - Math.min(4000, A_MS / 3)) / 1000).toFixed(0)} s apart: page heap ${growth('page', 'usedSize').toFixed(2)} MB, worker heap ${growth('worker', 'usedSize').toFixed(2)} MB, worker array buffers ${growth('worker', 'backingStorageSize').toFixed(2)} MB`);
    if (sA.wrongFrames.length) console.log(`     wrong frames: ${JSON.stringify(sA.wrongFrames.slice(0, 8))}`);
    check(Number.isFinite(sA.firstLockMs) && sA.firstLockMs <= 2000, `A locks within 2 s of starting (${f1(sA.firstLockMs)} ms)`);
    check(sA.locked >= 0.8 * fpsA * (A_MS / 1000 - 3) && sA.correct >= 0.95 * sA.locked, `A: >= 95% of locked frames put >= 90% of the markers in the right cell (${sA.correct}/${sA.locked})`);
    check(sA.meanCells >= 0.97, `A: mean marker accuracy >= 97% (${(sA.meanCells * 100).toFixed(1)}%)`);
    check(sA.unreadable <= 0.02 * logA.updates.length, `A: frame codes readable (${sA.unreadable} unreadable)`);
    check(sA.suggest === 0, 'A: never suggests calibration on a clean sequence');
    // Absolute speed depends on the shared machine's load (the browser itself then shows fewer
    // video frames): at least 12 frames/s, or half of what the camera delivered under load.
    const fpsFloor = Math.min(12, 0.5 * statsA.offeredFps);
    check(fpsA >= fpsFloor, `A: at least ${f1(fpsFloor)} frames/s processed (${f1(fpsA)} of ${f1(statsA.offeredFps)} video frames/s; budget 20+ on a laptop)`);
    check(sA.timing.trackMedian <= 60, `A: median worker time of a tracked frame <= 60 ms (${f1(sA.timing.trackMedian)})`);
    check(!(sA.extrapolation.predictedPx > sA.extrapolation.rawPx + 0.25), 'A: extrapolation does not make the drawn pose worse');
    check(growth('worker', 'usedSize') < 4 && growth('page', 'usedSize') < 4 && growth('worker', 'backingStorageSize') < 8, 'A: no memory growth (worker and page heaps < 4 MB, worker buffers < 8 MB)');
    check(bodyColor === null && wallColor === null, `A: marker colour sampling answers through the worker and refuses dull colours (body ${bodyColor ? `hue ${bodyColor.hue.toFixed(0)}` : 'refused'}, wall ${wallColor ? 'accepted' : 'refused'})`);
    check(pausedAfter === pausedCount, `B: no frames processed while paused (${pausedAfter - pausedCount})`);
    check(relock !== undefined && relock.arrivedAt - logA.resumedAt <= 2000, `B: locked again within 2 s of resuming (${relock ? f1(relock.arrivedAt - logA.resumedAt) : '-'} ms)`);
    check(logA.rendersAfterStop === 0 && logA.updatesAfterStop === 0, 'A: no frame callbacks or answers after stop()');
    check(logA.statsAfter.mode === 'idle' && !logA.statsAfter.running, 'A: idle after stop()');
    check(logA.videoKept && logA.trackLive, "A: stop() leaves the page's own video and camera track alone");
    check(workersAfterA === 0, `A: the worker is gone after stop() (${workersAfterA} left)`);

    const sC = score(g, truth, logC);
    const widthsC = logC.updates.map((u) => u.w);
    const stepsC = widthsC.filter((w, i) => i > 0 && w !== widthsC[i - 1]).length;
    report.C = { widths: [...new Set(widthsC)], steps: stepsC, locked: sC.locked, correct: sC.correct, states: sC.states };
    console.log(`  C: working widths ${[...new Set(widthsC)].join(' -> ')} (${stepsC} changes); ${sC.correct}/${sC.locked} locked frames correct, states ${JSON.stringify(sC.states)}`);
    check(Math.min(...widthsC) < Math.max(...widthsC) && widthsC.at(-1) === Math.min(...widthsC), 'C: an impossible budget steps the working size down');
    check(sC.locked > 20 && sC.correct >= 0.95 * sC.locked, `C: tracking stays right across the size changes (${sC.correct}/${sC.locked})`);

    const sD = score(g, truth, logD);
    const fpsD = logD.stats.processedFps;
    report.D = { mode: d.mode, locked: sD.locked, correct: sD.correct, fps: fpsD, lockMs: sD.firstLockMs, trackMedian: sD.timing.trackMedian };
    console.log(`  D: mode ${d.mode}, locked after ${f1(sD.firstLockMs)} ms, ${sD.correct}/${sD.locked} correct, ${f1(fpsD)} frames/s, track median ${f1(sD.timing.trackMedian)} ms, frame grab on the main thread ${logD.stats.mainThreadMs.toFixed(2)} ms median`);
    check(d.mode === 'main' && sD.locked > 10 && sD.correct >= 0.95 * sD.locked, 'D: the main-thread fallback runs, locks and tracks right');

    report.E = { churn, workersAfterChurn };
    check(churn.every((c) => c.mode === 'idle' && !c.running) && workersAfterChurn === 0, `E: ${churn.length} rapid start/stop cycles leave nothing running (${workersAfterChurn} workers)`);
    const pageErrors = errors.filter((e) => !/favicon|DevTools/.test(e));
    check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);
  });
  return { failures, report };
}

async function main() {
  const fixture = await buildFixture();
  if (flag('--fixture-only')) return;
  const g = await loadTs('/src/core/vision/geometry.ts');
  console.log(`fixture: ${fixture.truth.description}, ${fixture.truth.frames.length} frames`);
  const all = [];
  for (let r = 1; r <= REPEAT; r++) {
    console.log(`run ${r}/${REPEAT}`);
    const { failures, report } = await runOnce(fixture, g, r);
    all.push({ run: r, failures, report });
    fs.writeFileSync(path.join(OUT, `report-run${r}.json`), JSON.stringify(report, null, 1));
  }
  const failed = all.filter((a) => a.failures.length > 0);
  console.log(failed.length ? `\n${failed.length}/${REPEAT} run(s) failed` : `\nall ${REPEAT} run(s) passed`);
  process.exit(failed.length ? 1 : 0);
}

module.exports = { buildFixture, stampCode };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
