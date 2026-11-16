#!/usr/bin/env node
/**
 * The fake-camera video for `e2e/camera.cjs`: a rendered guitar neck that sways, drifts across the
 * picture, slides out of the frame, stays away, and comes back.
 *
 *   node e2e/camera-fixture.cjs          make sure the fixture exists (renders it once, about 4 min)
 *   node e2e/camera-fixture.cjs --fresh  render it again
 *
 * Rendered in Node with the vision module's benchmark renderer (`@/core/vision/testing`), from the
 * 'sway' choreography of a steel-string or electric guitar whose first frame shows the nut (so a
 * cold start can number the frets by itself), at 1280x720 and 30 fps, written as MJPEG
 * (concatenated JPEGs: Chromium's --use-file-for-fake-video-capture plays them as a camera and
 * loops them). Every frame carries its index as a 12-cell black/white code in a corner the board
 * never touches, and the ground-truth pose of every frame is saved beside the video, so the page's
 * overlay can be scored against the frame actually on screen.
 *
 * Phases (frame indices at 30 fps):
 *   still   0-149    sway in place (lock, notes on the right frets)
 *   drift   150-239  slide sideways by about a sixth of the picture (the overlay must follow)
 *   exit    240-279  slide down out of the picture
 *   away    280-359  no guitar in view (the overlay must go)
 *   return  360-399  slide back in (it must lock again)
 *   settle  400-449  sway in place
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadTs, ROOT } = require('./lib/harness.cjs');

const OUT = path.join(ROOT, 'e2e', 'out', 'camera');
const FPS = 30;
const FRAMES = 450;
const WIDTH = 1280;
const HEIGHT = 720;
const JPEG_QUALITY = 82;
const CODE_CELLS = 12;
const CODE_CELL = 16;
const CODE_W = CODE_CELLS * CODE_CELL;
const CODE_H = CODE_CELL;

/** Phase boundaries (frame indices, inclusive start). */
const PHASES = { still: [0, 150], drift: [150, 240], exit: [240, 280], away: [280, 360], return: [360, 400], settle: [400, 450] };

function fingerprint() {
  const dir = path.join(ROOT, 'src', 'core', 'vision', 'testing');
  const hash = crypto.createHash('sha1');
  for (const f of ['rng.ts', 'scene.ts', 'camera.ts', 'raster.ts', 'background.ts', 'guitar.ts', 'people.ts', 'render.ts', 'sequence.ts', '../geometry.ts']) hash.update(fs.readFileSync(path.join(dir, f)));
  hash.update(fs.readFileSync(__filename));
  return hash.digest('hex').slice(0, 10);
}

/** Paint the frame index into the code rectangle at (x0, y0): white, black, then 10 bits. */
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

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The board's outline in the frame (all wires), or null. */
function outline(g, pose) {
  if (!pose) return null;
  return g.boardOutline(pose, { min: 0, max: pose.model.fretCount }, true);
}

function inFrame(q) {
  return q.some((p) => p.x >= 0 && p.x <= WIDTH && p.y >= 0 && p.y <= HEIGHT);
}

/** Build (or reuse) the fixture: `{ video, truth }`. */
async function buildCameraFixture({ fresh = false } = {}) {
  const key = fingerprint();
  const video = path.join(OUT, `neck-${key}.mjpeg`);
  const truthFile = path.join(OUT, `neck-${key}.json`);
  if (!fresh && fs.existsSync(video) && fs.existsSync(truthFile)) return { video, truth: JSON.parse(fs.readFileSync(truthFile, 'utf8')) };
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/^neck-.*\.(mjpeg|json)$/.test(f)) fs.rmSync(path.join(OUT, f));
  const jpeg = require('jpeg-js');
  const t = await loadTs('/src/core/vision/testing/index.ts');
  const g = await loadTs('/src/core/vision/geometry.ts');
  let chosen = null;
  for (let offset = 0; offset < 80 && !chosen; offset++) {
    const seq = t.buildSequence('sway', { frames: FRAMES, seedOffset: offset });
    const first = seq.frames[0];
    if (!first.guitar || first.guitar.kind === 'classical' || first.leftHanded || first.mirrored || !first.bassSideUp) continue;
    for (const spec of seq.frames) {
      spec.width = WIDTH;
      spec.height = HEIGHT;
    }
    if (!t.truthForScene(seq.frames[0]).nutVisible) continue;
    // How far down the board must slide to leave the picture: grow the shift until no corner of
    // any wire is inside the frame (checked on the frame where it leaves).
    const probe = (shift) => {
      const s = { ...seq.frames[PHASES.away[0]], view: { ...seq.frames[PHASES.away[0]].view } };
      s.view.anchorV += shift;
      const q = outline(g, t.truthForScene(s).pose);
      return !q || !inFrame(q);
    };
    let exitV = 0.3;
    while (exitV < 2 && !probe(exitV)) exitV += 0.05;
    if (exitV >= 2) continue;
    exitV += 0.08;
    // Choreography on top of the sway.
    let prev = null;
    for (let i = 0; i < seq.frames.length; i++) {
      const spec = seq.frames[i];
      const view = { ...spec.view };
      const drift = 0.16 * smooth(PHASES.drift[0], PHASES.drift[1] - 1, i) * (1 - smooth(PHASES.away[0], PHASES.away[1] - 1, i));
      const down = exitV * (smooth(PHASES.exit[0], PHASES.exit[1] - 1, i) - smooth(PHASES.return[0], PHASES.return[1] - 1, i));
      view.anchorU += drift;
      view.anchorV += down;
      spec.view = view;
      spec.camera = { ...spec.camera, motionBlur: 0 };
      if (prev) {
        const du = (view.anchorU - prev.anchorU) * 640;
        const dv = (view.anchorV - prev.anchorV) * 360;
        const speed = Math.hypot(du, dv) * 0.6;
        spec.camera.motionBlur = speed > 1.2 ? speed * (WIDTH / 640) : 0;
        spec.camera.motionAngleDeg = (Math.atan2(dv, du) * 180) / Math.PI;
      }
      prev = view;
    }
    const truths = seq.frames.map((s) => t.truthForScene(s));
    const margin = 24;
    const corners = [
      { x: margin, y: margin },
      { x: WIDTH - CODE_W - margin, y: margin },
      { x: margin, y: HEIGHT - CODE_H - margin },
      { x: WIDTH - CODE_W - margin, y: HEIGHT - CODE_H - margin },
    ];
    const clear = corners.find((c) =>
      truths.every((tr) => {
        const q = outline(g, tr.pose);
        if (!q) return true;
        const xs = q.map((p) => p.x);
        const ys = q.map((p) => p.y);
        const pad = 40;
        return Math.max(...xs) + pad < c.x || Math.min(...xs) - pad > c.x + CODE_W || Math.max(...ys) + pad < c.y || Math.min(...ys) - pad > c.y + CODE_H;
      }),
    );
    if (clear) chosen = { offset, seq, truths, code: clear, exitV };
  }
  if (!chosen) throw new Error('no sway variant suits the camera check');
  const { seq, truths, code } = chosen;
  console.log(`fixture: sway seedOffset ${chosen.offset}, ${t.describeScene(seq.frames[0])}, exit shift ${chosen.exitV.toFixed(2)}`);
  console.log(`rendering ${FRAMES} frames at ${WIDTH}x${HEIGHT} (about ${Math.round(FRAMES * 0.5)} s on a quiet machine)...`);
  const cache = t.createRenderCache();
  const fd = fs.openSync(video + '.part', 'w');
  const t0 = Date.now();
  for (let i = 0; i < seq.frames.length; i++) {
    const { frame } = t.renderScene(seq.frames[i], cache);
    stampCode(frame.data, WIDTH, code.x, code.y, i);
    const enc = jpeg.encode({ data: Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength), width: WIDTH, height: HEIGHT }, JPEG_QUALITY);
    fs.writeSync(fd, enc.data);
    if (i % 50 === 49) process.stdout.write(`  ${i + 1}/${FRAMES} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
  }
  fs.closeSync(fd);
  fs.renameSync(video + '.part', video);
  const truth = {
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    phases: PHASES,
    code: { x: code.x, y: code.y, cell: CODE_CELL, cells: CODE_CELLS },
    guitar: seq.frames[0].guitar.kind,
    description: t.describeScene(seq.frames[0]),
    frames: truths.map((tr) => ({ pose: tr.pose, nutVisible: tr.nutVisible, inFrame: !!(tr.pose && inFrame(outline(g, tr.pose))) })),
  };
  fs.writeFileSync(truthFile, JSON.stringify(truth));
  console.log(`fixture written: ${path.relative(ROOT, video)} (${(fs.statSync(video).size / 1e6).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return { video, truth };
}

module.exports = { buildCameraFixture, PHASES };

if (require.main === module) {
  buildCameraFixture({ fresh: process.argv.includes('--fresh') }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
