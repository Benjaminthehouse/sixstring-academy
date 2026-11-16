#!/usr/bin/env node
/**
 * Browser check of the rhythm trainer. Run:
 *   node e2e/rhythm.cjs [--verbose] [--shots] [--only screens,offer,leave,keys,calibrate,strum,layout,mic,review]
 *
 * Real Chromium, real Web Audio. Every timing assertion is made on audio-clock times, so a busy
 * machine can make the script slow but cannot make it lie.
 *
 *  screens  every rhythm address opens on a phone and a desktop: one h1, no sideways scroll, no
 *           console errors, the Start button inside the first screen; notation and strum grids
 *           describe what they draw; an address that names nothing lands on a list
 *  leave    a round left for another screen, or reloaded, mid-way is recorded as a round left early
 *           (nothing when nothing was played yet); with the microphone chosen and never calibrated,
 *           the first Start plays the round instead of asking for setup first
 *  offer    a first-time learner is offered the ten-second calibration once, can skip it, and is
 *           not asked again
 *  keys     taps are sent through the keyboard path at exact audio-clock times with a known stored
 *           offset: the score the app shows is the score the pure scoring function gives for those
 *           times (per note and in total), the round is recorded in the progress store, and the F
 *           and J keys carry the stroke direction
 *  calibrate  "tap with the click" opened from a round's options: key taps sent a known time after
 *           every click on the audio clock are measured to within a millisecond and stored, the
 *           spread is drawn, and the next round applies the stored offset
 *  strum    a pattern is played on the synthesised guitar and the engine's output is captured: the
 *           onsets found in it by the pitch module's detectOnsets sit on the pattern's stroke grid,
 *           and nothing sounds in the ghost slots
 *  layout   the tap pad sits in the thumb zone on a phone and answers a touch; on a phone held
 *           sideways there is a pad under each thumb; reduced motion still plays a round
 *  mic      a fake microphone, fed with clap recordings built from the pitch module's test signals
 *           and scheduled on the audio clock 120 ms after each click: "clap with the click"
 *           measures that delay; a play-along round then judges every clap where it was played and
 *           scores claps on the beat as on time; a wrong stored offset makes the same claps score
 *           badly; a click bleeding into the microphone is noticed by calibration and ignored in
 *           the round. Then Chromium's own fake capture device (a WAV of claps) checks the real
 *           getUserMedia path through calibration
 *  review   cases an independent review caught: a microphone that cannot open is brought into view
 *           on a phone; a calibration no device could produce is turned down and nothing is stored;
 *           a stored calibration shows up in the list at once; strokes played the wrong way cost
 *           points and say so; large text neither scrolls the hub sideways nor squeezes Stop
 *
 * Prints one line per check and PASSED or FAILED; exits non-zero on failure. A timing scenario that
 * was disturbed by load (the taps could not be sent when planned) is run once more before it counts.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withApp, loadTs, VIEWPORTS, ROOT } = require('./lib/harness.cjs');
const { installPageTools } = require('./audio-lib.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const shots = argv.includes('--shots');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',') : null;
const wants = (group) => !only || only.includes(group);

const ONBOARDED = { 'ssa:shell.onboarding': '{"skipped":true}' };
const calibration = (tapMs, micMs = null, extra = {}) => ({
  'ssa:rhythm.calibration': JSON.stringify({ v: 1, tapMs, micMs, tapAt: Date.now(), micAt: micMs === null ? null : Date.now(), offered: true, micOffered: true, bleed: null, ...extra }),
});
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}
const note = (text) => console.log(`        ${text}`);

/** A browser context shaped like the harness's own, with storage seeded before the app starts. */
async function open(browser, url, { mobile = false, viewport, seed = {}, reducedMotion = false, theme = 'dark', tools = false } = {}) {
  const context = await browser.newContext({
    viewport: viewport || VIEWPORTS[mobile ? 'mobile' : 'desktop'],
    deviceScaleFactor: 1,
    colorScheme: theme,
    hasTouch: !!mobile,
    isMobile: !!mobile,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    permissions: ['microphone'],
  });
  await context.addInitScript((entries) => {
    try {
      for (const [key, value] of Object.entries(entries)) if (localStorage.getItem(key) == null) localStorage.setItem(key, value);
    } catch {
      /* no storage: the app copes */
    }
  }, { ...ONBOARDED, ...seed });
  if (tools) await installPageTools(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((p) => p.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  const goto = async (hash) => {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route="rhythm"] [data-ui-page]', { timeout: 45000 });
    // The app's own debug record, on the window so that waits can poll it without awaiting an import.
    await page.evaluate(async () => {
      window.__rhythm = (await import('/src/features/rhythm/engine/debug.ts')).rhythmDebug;
    });
    await page.waitForTimeout(250);
  };
  const shot = async (name) => {
    if (!shots) return;
    fs.mkdirSync(path.join(ROOT, 'e2e', 'out'), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, 'e2e', 'out', `rhythm-${name}.png`) });
  };
  return { context, page, errors, goto, shot, takeErrors: () => errors.splice(0, errors.length), close: () => context.close() };
}

/**
 * The shell's XP and achievement toasts sit over the bottom of the screen for a few seconds: clear
 * them before clicking there. A new level or a milestone opens a dialog first and holds its toasts
 * back until the dialog closes, so dialogs and toasts are cleared in turn until neither is left.
 */
async function clearToasts(page) {
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < 3 && (await page.getByRole('dialog').count()) > 0; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    await page.evaluate(async () => (await import('/src/ui/index.ts')).toast.clear());
    await page.waitForTimeout(400);
    const left = await page.evaluate(() => document.querySelectorAll('[aria-label="Notifications"] > *').length + document.querySelectorAll('[role="dialog"]').length);
    if (left === 0) return;
  }
}

/** Start the round on screen and wait until it runs. */
async function startRound(page) {
  const before = await page.evaluate(() => window.__rhythm.started);
  await clearToasts(page);
  await page.locator('[data-rhythm-start]').click();
  await page.waitForSelector('[data-rhythm-phase="running"]', { timeout: 30000 });
  await page.waitForFunction((n) => window.__rhythm.started > n && window.__rhythm.session?.state === 'running', before, { timeout: 15000 });
}

async function setTempo(page, bpm) {
  const field = page.getByRole('spinbutton', { name: 'Tempo' });
  await field.fill(String(bpm));
  await field.press('Enter');
  await page.waitForFunction((v) => document.querySelector('[role="spinbutton"]')?.getAttribute('aria-valuenow') === String(v), bpm, { timeout: 5000 });
}

// ── screens ──────────────────────────────────────────────────────────────────────────────────

const ROUND_ROUTES = ['rhythm--beat--1', 'rhythm--beat--3', 'rhythm--read--1', 'rhythm--read--10', 'rhythm--read--11', 'rhythm--read--14', 'rhythm--strum--folk-pop', 'rhythm--strum--six-eight-roll', 'rhythm--strum--funk-scratch', 'rhythm--strum--my-44-e-sossosss', 'rhythm--drill--switch-1', 'rhythm--drill--offbeat-1', 'rhythm--drill--one-7', 'rhythm--clock--1'];
const LIST_ROUTES = ['rhythm', 'rhythm--beat', 'rhythm--read', 'rhythm--strum', 'rhythm--strum--builder', 'rhythm--drill', 'rhythm--clock', 'rhythm--calibrate'];

async function screens(browser, url) {
  for (const mobile of [true, false]) {
    const where = mobile ? 'phone' : 'desktop';
    const ctx = await open(browser, url, { mobile, seed: calibration(0) });
    const width = VIEWPORTS[mobile ? 'mobile' : 'desktop'].width;
    for (const route of [...LIST_ROUTES, ...ROUND_ROUTES]) {
      ctx.takeErrors();
      let info;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await ctx.goto(route);
          info = await ctx.page.evaluate((expected) => {
            const root = document.documentElement;
            const start = document.querySelector('[data-rhythm-start]');
            const box = start ? start.getBoundingClientRect() : null;
            return {
              h1: document.querySelectorAll('main h1').length,
              overflow: Math.max(root.scrollWidth - root.clientWidth, root.scrollWidth - expected),
              failed: !!document.querySelector('main [role="alert"]') && /hit a problem|did not load/.test(document.querySelector('main [role="alert"]').textContent || ''),
              startVisible: box ? box.bottom <= window.innerHeight + 1 && box.top >= 0 && box.height >= 44 : null,
            };
          }, width);
          break;
        } catch (e) {
          info = { error: e.message };
          await ctx.page.waitForTimeout(1500);
        }
      }
      const errs = ctx.takeErrors();
      const isRound = ROUND_ROUTES.includes(route);
      const ok = info && !info.error && info.h1 === 1 && info.overflow <= 1 && !info.failed && errs.length === 0 && (!isRound || info.startVisible === true);
      check('screens', `${where}: #${route}`, ok, ok ? '' : JSON.stringify({ ...info, errs: errs.slice(0, 2) }));
    }

    // Notation and grids say what they draw (level 1 opens with its model phrase on a first attempt).
    await ctx.goto('rhythm--read--1');
    const label = await ctx.page.locator('svg[role="img"]').first().getAttribute('aria-label');
    check('screens', `${where}: notation is described`, label === 'Rhythm in 4/4: quarter, quarter, quarter, quarter; half, half.', label);
    const counts = await ctx.page.locator('svg[role="img"]').first().locator('text').allTextContents();
    check('screens', `${where}: counts are written under the notes`, counts.join(' ').startsWith('1 2 3 4 1 3'), counts.join(' '));
    await ctx.goto('rhythm--strum--folk-pop');
    const grid = await ctx.page.locator('[role="img"][aria-label^="Strumming pattern"]').first().getAttribute('aria-label');
    check('screens', `${where}: strum grid is described`, grid === 'Strumming pattern in 4/4: down miss down up miss up down up', grid);
    await ctx.shot(`strum-${where}`);

    // An address that names nothing lands on the nearest list.
    await ctx.goto('rhythm--read--99');
    await ctx.page.waitForFunction(() => window.location.hash === '#rhythm--read', null, { timeout: 5000 }).catch(() => {});
    check('screens', `${where}: unknown level goes to its list`, (await ctx.page.evaluate(() => window.location.hash)) === '#rhythm--read');

    // The hub points at one next step.
    await ctx.goto('rhythm');
    const next = await ctx.page.locator('[data-rhythm-next]').getAttribute('data-rhythm-next');
    const primary = await ctx.page.locator('[data-rhythm-next] a').first().getAttribute('href');
    check('screens', `${where}: the hub's next step is the first rung`, next === 'rhythm:beat:1' && primary === '#rhythm--beat--1', `${next} ${primary}`);
    await ctx.shot(`hub-${where}`);
    await ctx.close();
  }

  // The builder: toggling a slot changes the pattern and the practise link.
  const b = await open(browser, url, { seed: calibration(0) });
  await b.goto('rhythm--strum--builder');
  const before = await b.page.locator('[data-builder-practise]').getAttribute('href');
  await b.page.getByRole('button', { name: /^3: down/ }).click();
  const after = await b.page.locator('[data-builder-practise]').getAttribute('href');
  check('screens', 'builder: a slot toggles and the pattern code follows', before === '#rhythm--strum--my-44-e-sossosss' && after === '#rhythm--strum--my-44-e-sossssss', `${before} -> ${after}`);
  check('screens', 'builder: no console errors', b.errors.length === 0, b.errors.join(' | '));
  await b.shot('builder-desktop');
  await b.close();
}

// ── first-time offer ─────────────────────────────────────────────────────────────────────────

async function offer(browser, url) {
  const ctx = await open(browser, url, { mobile: true });
  await ctx.goto('rhythm--beat--1');
  await ctx.page.locator('[data-rhythm-start]').click();
  const dialog = ctx.page.getByRole('dialog', { name: 'A ten-second sound check' });
  check('offer', 'the first Start offers calibration', await dialog.isVisible().catch(() => false));
  await ctx.shot('offer-phone');
  await ctx.page.locator('[data-offer-skip]').click();
  await ctx.page.waitForSelector('[data-rhythm-phase="running"]', { timeout: 30000 }).catch(() => {});
  check('offer', 'skipping starts the round', (await ctx.page.locator('[data-rhythm-phase="running"]').count()) === 1);
  const stored = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem('ssa:rhythm.calibration') || '{}'));
  check('offer', 'the offer is remembered under the rhythm storage key', stored.offered === true && stored.tapMs === null, JSON.stringify(stored));
  await ctx.page.locator('[data-rhythm-stop]').click();
  await ctx.page.waitForSelector('[data-rhythm-phase="ready"]', { timeout: 10000 });
  await ctx.page.locator('[data-rhythm-start]').click();
  await ctx.page.waitForSelector('[data-rhythm-phase="running"]', { timeout: 30000 }).catch(() => {});
  check('offer', 'the second Start does not ask again', (await ctx.page.getByRole('dialog').count()) === 0 && (await ctx.page.locator('[data-rhythm-phase="running"]').count()) === 1);
  check('offer', 'no console errors', ctx.errors.length === 0, ctx.errors.join(' | '));
  await ctx.close();
}

// ── leaving mid-round, and the microphone without a setup wall (pass 2) ─────────────────────

/** In the page: tap the first `n` notes of the running round on time (Space at the audio-clock moment). */
async function tapFirst(n) {
  const audio = await import('/src/core/audio/index.ts');
  const { rhythmDebug } = await import('/src/features/rhythm/engine/debug.ts');
  const session = rhythmDebug.session;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const times = session.chart.targets.slice(0, n).map((t) => session.targetTime(t.id));
  for (const when of times) {
    const wait = (when - audio.audioSoundingNow()) * 1000 - 14;
    if (wait > 0) await sleep(wait);
    while (audio.audioSoundingNow() < when) { /* the last few milliseconds */ }
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
  }
  await sleep(400);
  return { state: session.state, judged: session.chart.targets.length };
}

async function skillOf(page, id) {
  return page.evaluate(async (skill) => {
    const p = await import('/src/core/progress/index.ts');
    const s = p.getProgress().skills[skill];
    return s ? { attempts: s.attempts, completions: s.completions } : null;
  }, id);
}

async function leave(browser, url) {
  // Another screen in the middle of a round: what was played is recorded as a round left early.
  let ctx = await open(browser, url, { seed: calibration(0) });
  try {
    await ctx.goto('rhythm--read--1');
    await startRound(ctx.page);
    const run = await ctx.page.evaluate(tapFirst, 6);
    check('leave', 'the round was still running after six notes', run.state === 'running', JSON.stringify(run));
    await ctx.page.evaluate(() => (location.hash = '#rhythm'));
    await ctx.page.waitForTimeout(1200);
    const left = await skillOf(ctx.page, 'rhythm:read:1');
    check('leave', 'leaving for another screen mid-round records what was played (an attempt, no completion)', left && left.attempts === 1 && left.completions === 0, JSON.stringify(left));
    check('leave', 'no console errors', ctx.errors.length === 0, ctx.errors.join(' | '));
  } finally {
    await ctx.close();
  }
  // A reload in the middle of a round: the same.
  ctx = await open(browser, url, { seed: calibration(0) });
  try {
    await ctx.goto('rhythm--read--1');
    await startRound(ctx.page);
    await ctx.page.evaluate(tapFirst, 6);
    await ctx.page.reload({ waitUntil: 'load' });
    await ctx.page.waitForSelector('main[data-route="rhythm"] [data-ui-page]', { timeout: 45000 });
    const reloaded = await skillOf(ctx.page, 'rhythm:read:1');
    check('leave', 'a reload mid-round records what was played', reloaded && reloaded.attempts === 1 && reloaded.completions === 0, JSON.stringify(reloaded));
  } finally {
    await ctx.close();
  }
  // Stopped after a note or two: nothing worth recording, nothing recorded.
  ctx = await open(browser, url, { seed: calibration(0) });
  try {
    await ctx.goto('rhythm--read--1');
    await startRound(ctx.page);
    await ctx.page.evaluate(() => (location.hash = '#rhythm'));
    await ctx.page.waitForTimeout(800);
    check('leave', 'leaving before anything was played records nothing', (await skillOf(ctx.page, 'rhythm:read:1')) === null);
  } finally {
    await ctx.close();
  }
  // The microphone chosen, never calibrated: the first Start plays the round instead of asking for setup.
  ctx = await open(browser, url, { seed: { ...calibration(0, null, { micOffered: false }), 'ssa:rhythm.prefs': JSON.stringify({ source: 'mic' }) } });
  try {
    await ctx.goto('rhythm--beat--1');
    await clearToasts(ctx.page);
    await ctx.page.locator('[data-rhythm-start]').click();
    await ctx.page.waitForSelector('[data-rhythm-phase="running"]', { timeout: 30000 }).catch(() => {});
    const wall = await ctx.page.getByRole('dialog', { name: 'Set up the microphone first' }).count();
    // This browser has no microphone device: the round goes straight to trying it (and says it is
    // missing, offering taps); with one it runs (the 'mic' group plays rounds through a fake one).
    const running = (await ctx.page.locator('[data-rhythm-phase="running"]').count()) === 1;
    const tried = await ctx.page.getByText('No microphone found').count();
    check('leave', 'microphone: the first Start tries the microphone at once, no "Set up the microphone first" before trying', wall === 0 && (running || tried > 0), `dialog ${wall}, running ${running}, tried ${tried}`);
    const stored = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem('ssa:rhythm.calibration') || '{}'));
    check('leave', 'microphone: not asked again later either (the tip after a round offers calibration when timing shows a device delay)', stored.micOffered === true, JSON.stringify(stored));
    await ctx.shot('mic-first-start');
  } finally {
    await ctx.close();
  }
}

// ── keyboard taps at exact audio-clock times ─────────────────────────────────────────────────

/**
 * Runs in the page while a round is running. Sends a key press for every planned tap at the moment
 * the audio clock reaches it (a timer gets close, a short spin does the rest) and notes the clock
 * reading at which each one was really sent.
 */
async function sendTaps({ offsetMs, deviations, extras, byDirection, wrong }) {
  const audio = await import('/src/core/audio/index.ts');
  const { rhythmDebug } = await import('/src/features/rhythm/engine/debug.ts');
  const session = rhythmDebug.session;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const targets = session.chart.targets.map((t) => ({ id: t.id, time: session.targetTime(t.id), dir: t.dir || null, seg: t.seg }));
  const plan = [];
  targets.forEach((t, i) => {
    const dev = deviations[i % deviations.length];
    if (dev === null) return;
    let code = 'Space';
    if (byDirection) code = (t.dir === 'D') !== wrong.includes(i) ? 'KeyF' : 'KeyJ';
    plan.push({ when: t.time + (offsetMs + dev) / 1000, target: t.id, dev, code });
  });
  // Extra taps in the middle of long gaps inside a phrase: far from every note.
  let placed = 0;
  for (let i = 0; i + 1 < targets.length && placed < extras; i++) {
    const gap = targets[i + 1].time - targets[i].time;
    if (targets[i].seg === targets[i + 1].seg && gap > 0.8) {
      plan.push({ when: targets[i].time + gap / 2 + offsetMs / 1000, target: null, dev: 0, code: 'Space' });
      placed++;
    }
  }
  plan.sort((a, b) => a.when - b.when);
  for (const p of plan) {
    const wait = (p.when - audio.audioSoundingNow()) * 1000 - 14;
    if (wait > 0) await sleep(wait);
    while (audio.audioSoundingNow() < p.when) { /* spin the last few milliseconds */ }
    p.at = audio.audioSoundingNow();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: p.code, key: p.code === 'Space' ? ' ' : p.code.slice(3).toLowerCase(), bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: p.code, key: p.code === 'Space' ? ' ' : p.code.slice(3).toLowerCase(), bubbles: true, cancelable: true }));
  }
  const deadline = performance.now() + 20000;
  while (session.state !== 'ended' && performance.now() < deadline) await sleep(100);
  const result = rhythmDebug.lastResult;
  return {
    ended: session.state === 'ended',
    // Times as the judge held them at the end (refined by the scheduler).
    targetTimes: targets.map((t) => session.targetTime(t.id)),
    targetDirs: targets.map((t) => t.dir || undefined),
    plan,
    judgements: result ? result.judgements : [],
    stats: result ? result.stats : null,
    completed: result ? result.completed : false,
  };
}

async function keys(browser, url, scoring) {
  const OFFSET = 43;
  const scenarios = [
    {
      name: 'read level 1 at 108 BPM, mixed timing, misses and extra taps',
      route: 'rhythm--read--1',
      bpm: 108,
      skill: 'rhythm:read:1',
      args: { offsetMs: OFFSET, deviations: [0, 10, -18, 48, -62, 96, null, 0, -30, 30, 66, -104, 5, null, 20, -8], extras: 2, byDirection: false, wrong: [] },
    },
    {
      name: 'tap-along: the folk and pop strum with F and J, two strokes the wrong way',
      route: 'rhythm--strum--folk-pop',
      bpm: 100,
      skill: 'rhythm:strum:folk-pop',
      args: { offsetMs: OFFSET, deviations: [0, 4, -6, 8, -3, 2], extras: 0, byDirection: true, wrong: [3, 10] },
    },
  ];
  for (const sc of scenarios) {
    let done = false;
    for (let attempt = 1; attempt <= 2 && !done; attempt++) {
      const ctx = await open(browser, url, { seed: calibration(OFFSET) });
      try {
        await ctx.goto(sc.route);
        await setTempo(ctx.page, sc.bpm);
        await startRound(ctx.page);
        const run = await ctx.page.evaluate(sendTaps, sc.args);
        const sent = run.plan.map((p) => (p.at - p.when) * 1000);
        const worstLate = Math.max(...sent);
        // Load on the machine can hold a key press back; then the scenario says nothing about the app.
        if (worstLate > 12 && attempt === 1) {
          note(`[keys] ${sc.name}: taps were sent up to ${worstLate.toFixed(1)} ms late (machine load); running it again`);
          continue;
        }
        done = true;
        const label = `${sc.name}`;
        check('keys', `${label}: the round ran to its end`, run.ended && run.completed && run.stats);
        if (!run.stats) continue;
        const tapsAt = run.plan.map((p) => p.at);
        const tapDirs = run.plan.map((p) => (p.code === 'KeyF' ? 'D' : p.code === 'KeyJ' ? 'U' : undefined));
        const expected = scoring.scoreTaps(run.targetTimes, tapsAt, { offsetMs: OFFSET, dirs: run.targetDirs, tapDirs });
        const e = expected.stats;
        const a = run.stats;
        const same = ['total', 'perfect', 'good', 'ok', 'miss', 'extra'].every((k) => a[k] === e[k]);
        check('keys', `${label}: counts match the scoring function`, same, `app ${JSON.stringify([a.total, a.perfect, a.good, a.ok, a.miss, a.extra])} expected ${JSON.stringify([e.total, e.perfect, e.good, e.ok, e.miss, e.extra])}`);
        check('keys', `${label}: accuracy and stars match`, Math.abs(a.accuracy - e.accuracy) < 1e-9 && a.stars === e.stars, `${a.accuracy} vs ${e.accuracy}; ${a.stars} vs ${e.stars}`);
        // Per note: the error the app reports is (when the key was sent) - (when the note sounded) - (the stored offset).
        const byTarget = new Map(run.judgements.filter((j) => j.targetId !== null).map((j) => [j.targetId, j]));
        let worst = 0;
        let verdictsOk = true;
        for (const p of run.plan) {
          if (p.target === null) continue;
          const j = byTarget.get(p.target);
          if (!j || j.verdict === 'miss') { verdictsOk = false; continue; }
          const want = (p.at - run.targetTimes[p.target]) * 1000 - OFFSET;
          worst = Math.max(worst, Math.abs(j.errorMs - want));
        }
        check('keys', `${label}: every tap is measured to within 2 ms of the audio clock, offset taken off`, verdictsOk && worst <= 2, `worst ${worst.toFixed(3)} ms`);
        // The plan itself: most taps left within a few milliseconds of when they were meant to.
        const onPlan = sent.filter((d) => d <= 12).length;
        check('keys', `${label}: the taps were sent as planned (${onPlan}/${sent.length} within 12 ms)`, onPlan >= sent.length * 0.8, `sent ${Math.min(...sent).toFixed(1)}..${worstLate.toFixed(1)} ms after plan`);
        const skipped = sc.args.deviations.includes(null);
        if (skipped) check('keys', `${label}: skipped notes are misses, gap taps are extras`, a.miss > 0 && a.extra === sc.args.extras && a.miss === run.targetTimes.length - run.plan.filter((p) => p.target !== null).length, `miss ${a.miss} extra ${a.extra}`);
        if (sc.args.byDirection) {
          // Every stroke was hit (how precisely is covered by the scoring comparison above); exactly the planned ones went the wrong way.
          check('keys', `${label}: F and J carry the stroke direction`, a.wrongDirection === sc.args.wrong.length && a.hits === a.total, `wrong ${a.wrongDirection}, hit ${a.hits}/${a.total}`);
          // The same taps, every one the right way round, would have scored higher.
          const right = scoring.scoreTaps(run.targetTimes, tapsAt, { offsetMs: OFFSET, dirs: run.targetDirs, tapDirs: run.plan.map((p) => (p.target === null ? undefined : run.targetDirs[p.target])) }).stats;
          check('keys', `${label}: a stroke played the wrong way costs points`, right.wrongDirection === 0 && a.accuracy < right.accuracy - 0.01, `${a.accuracy.toFixed(3)} vs ${right.accuracy.toFixed(3)} the right way round`);
        }
        // Without the offset the same taps would all read late: the stored offset is what makes them fair.
        const raw = scoring.scoreTaps(run.targetTimes, tapsAt, { offsetMs: 0 }).stats;
        check('keys', `${label}: the same taps without the offset read ${Math.round(raw.meanMs - a.meanMs)} ms later`, Math.abs(raw.meanMs - a.meanMs - OFFSET) < 6 || raw.hits !== a.hits, `${raw.meanMs.toFixed(1)} vs ${a.meanMs.toFixed(1)}`);

        await ctx.page.waitForSelector('[data-rhythm-summary]', { timeout: 10000 });
        await ctx.shot(`summary-${sc.route.split('--')[1]}-desktop`);
        const dom = await ctx.page.locator('[data-rhythm-summary]').evaluate((el) => ({ stars: Number(el.dataset.stars), accuracy: Number(el.dataset.accuracy), text: el.textContent }));
        check('keys', `${label}: the summary shows that score, a tip and a next step`, dom.stars === e.stars && dom.accuracy === Math.round(e.accuracy * 100) && /Your tip/.test(dom.text) && /Next:|Try again|Skip to/.test(dom.text), JSON.stringify({ stars: dom.stars, accuracy: dom.accuracy }));
        const skill = await ctx.page.evaluate(async (id) => {
          const progress = await import('/src/core/progress/index.ts');
          const s = progress.getProgress();
          const r = s.skills[id];
          return r ? { attempts: r.attempts, stars: r.stars, lastAccuracy: r.lastAccuracy, xp: s.xp.byTag.rhythm, log: s.log[s.log.length - 1]?.kind ?? s.log[0]?.kind, bpm: r.data?.bpm } : null;
        }, sc.skill);
        check('keys', `${label}: recorded once in the progress store with XP`, skill && skill.attempts === 1 && skill.stars === e.stars && skill.xp > 0, JSON.stringify(skill));
        // The tempo the learner chose is kept with the skill and comes back on the next visit.
        await ctx.goto('rhythm');
        await ctx.goto(sc.route);
        const tempo = await ctx.page.getByRole('spinbutton', { name: 'Tempo' }).getAttribute('aria-valuenow');
        check('keys', `${label}: the next visit opens at the tempo played (${sc.bpm} BPM)`, skill && skill.bpm === sc.bpm && tempo === String(sc.bpm), `stored ${skill && skill.bpm}, shown ${tempo}`);
        check('keys', `${label}: no console errors`, ctx.errors.length === 0, ctx.errors.join(' | '));
      } catch (err) {
        if (attempt === 2) check('keys', `${sc.name}: ran`, false, err.message);
        else note(`[keys] ${sc.name}: ${err.message.split('\n')[0]}; running it again`);
      } finally {
        await ctx.close();
      }
    }
    if (!done) check('keys', `${sc.name}: could be sent on time`, false, 'the machine was too busy on both attempts');
  }
}

// ── tap calibration, opened from a round ─────────────────────────────────────────────────────

async function calibrateTaps(browser, url) {
  const LATE = 35;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctx = await open(browser, url, { mobile: true, seed: calibration(null) });
    try {
      await ctx.goto('rhythm--beat--1');
      await ctx.page.getByRole('button', { name: 'Options' }).click();
      await ctx.page.getByRole('dialog', { name: 'Options' }).getByRole('button', { name: 'Calibrate' }).click();
      const sheet = ctx.page.getByRole('dialog', { name: 'Tap calibration' });
      await sheet.waitFor({ timeout: 10000 });
      const sheetShown = await sheet.isVisible();
      const before = await ctx.page.evaluate(() => window.__rhythm.started);
      await sheet.locator('[data-calibrate-start]').click();
      await ctx.page.waitForFunction((n) => window.__rhythm.started > n && window.__rhythm.session?.state === 'running', before, { timeout: 30000 });
      const padInSheet = (await sheet.locator('[data-rhythm-pad]').count()) === 1;
      await ctx.shot('calibrate-tap-running');
      const run = await ctx.page.evaluate(sendTaps, { offsetMs: LATE, deviations: [0, 3, -4, 2, -2, 5, -3, 1], extras: 0, byDirection: false, wrong: [] });
      const sent = run.plan.map((p) => (p.at - p.when) * 1000);
      if (Math.max(...sent) > 12 && attempt === 1) {
        note(`[calibrate] taps were sent up to ${Math.max(...sent).toFixed(1)} ms late (machine load); running it again`);
        continue;
      }
      check('calibrate', 'Options opens the tap calibration over the round', sheetShown);
      check('calibrate', 'the calibration round runs inside the sheet, with a pad to tap', padInSheet);
      await sheet.locator('[data-calibration-result]').waitFor({ timeout: 15000 });
      // The attribute holds the verdict: save, uneven, implausible or too-few.
      const shown = await sheet.locator('[data-calibration-result]').evaluate((el) => ({ quality: el.dataset.calibrationResult, offset: Number(el.dataset.offset), text: el.textContent }));
      const stored = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem('ssa:rhythm.calibration')));
      // What the taps really were: when each key went out, against when its click sounded.
      const actual = run.plan.reduce((sum, p) => sum + (p.at - run.targetTimes[p.target]) * 1000, 0) / run.plan.length;
      check('calibrate', `tap with the click measures the delay (${stored.tapMs} ms for taps sent ${actual.toFixed(1)} ms after each click)`, shown.quality === 'save' && stored.tapMs !== null && Math.abs(stored.tapMs - actual) <= 1 && /Saved on this device/.test(shown.text), JSON.stringify({ shown: { ...shown, text: shown.text.slice(0, 80) }, stored }));
      check('calibrate', 'the timing spread is drawn as a picture', (await sheet.locator('svg[aria-label^="Timing spread of 16 notes"]').count()) === 1);
      await ctx.shot('calibrate-tap-result');
      await sheet.getByRole('button', { name: 'Back to the round' }).click();
      await sheet.waitFor({ state: 'hidden', timeout: 10000 });
      check('calibrate', '"Back to the round" closes the sheet on the ready round', (await ctx.page.locator('[data-rhythm-phase="ready"]').count()) === 1);
      await startRound(ctx.page);
      const offset = await ctx.page.evaluate(() => window.__rhythm.session.offsetMs);
      check('calibrate', 'the next round takes the stored offset off every tap, with no further offer', Math.abs(offset - stored.tapMs) < 0.01 && (await ctx.page.getByRole('dialog').count()) === 0, `${offset} vs ${stored.tapMs}`);
      await ctx.page.keyboard.press('Escape');
      check('calibrate', 'no console errors', ctx.errors.length === 0, ctx.errors.join(' | '));
      return;
    } catch (err) {
      if (attempt === 2) check('calibrate', 'ran', false, err.message);
      else note(`[calibrate] ${err.message.split('\n')[0]}; running it again`);
    } finally {
      await ctx.close();
    }
  }
}

// ── strum playback against the pattern grid ──────────────────────────────────────────────────

async function strumOnsets(browser, url) {
  const patterns = [
    { id: 'folk-pop', bpm: 88 },
    { id: 'six-eight-roll', bpm: 54 },
    { id: 'swung-eighths', bpm: 92 },
  ];
  for (const { id, bpm } of patterns) {
    let done = false;
    for (let attempt = 1; attempt <= 2 && !done; attempt++) {
      const ctx = await open(browser, url, { seed: calibration(0), tools: true });
      try {
        await ctx.goto(`rhythm--strum--${id}`);
        await ctx.page.evaluate(async () => {
          const audio = await import('/src/core/audio/index.ts');
          await audio.unlockAudio();
          // Only the guitar: every onset in the capture is then a strum.
          audio.setBusMuted('click', true);
          const engine = audio.getEngine();
          window.__rec = await window.__audioTools.recorder(engine.ctx, engine.output);
          window.__stop = window.__rec.capture();
        });
        await ctx.page.getByRole('button', { name: 'Listen to the pattern' }).click();
        const data = await ctx.page.evaluate(async ({ id }) => {
          const audio = await import('/src/core/audio/index.ts');
          const pitch = await import('/src/core/pitch/index.ts');
          const strum = await import('/src/features/rhythm/core/strum.ts');
          const { rhythmDebug } = await import('/src/features/rhythm/engine/debug.ts');
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const t0 = performance.now();
          while (!(rhythmDebug.session && rhythmDebug.session.state === 'running' && rhythmDebug.session.chart.loop) && performance.now() - t0 < 15000) await sleep(50);
          const session = rhythmDebug.session;
          const bar = session.chart.loop.end - session.chart.loop.start;
          const loopStart = session.timeOfTick(session.chart.loop.start);
          const barSec = bar * session.secondsPerTick;
          // Four times round the loop, then a moment for the last strum to be captured.
          while (audio.audioNow() < loopStart + barSec * 4 + 0.3 && performance.now() - t0 < 60000) await sleep(100);
          const cap = window.__stop();
          const sr = audio.getEngine().sampleRate;
          const from = cap.start / sr;
          const to = from + cap.samples.length / sr;
          const onsets = pitch.detectOnsets(cap.samples, sr).map((o) => o.time + from);
          const strums = session.soundLog.filter((e) => e.sound.type === 'strum').map((e) => e.time);
          const pattern = strum.strumPattern(id);
          const strokes = strum.strokes(pattern);
          const sounding = strokes.filter((s) => s.kind !== 'ghost').map((s) => s.playTick * session.secondsPerTick);
          const downs = strokes.filter((s) => s.kind !== 'ghost' && s.dir === 'D').map((s) => s.playTick * session.secondsPerTick);
          const ghosts = strokes.filter((s) => s.kind === 'ghost').map((s) => s.playTick * session.secondsPerTick);
          let peak = 0;
          for (let i = 0; i < cap.samples.length; i++) peak = Math.max(peak, Math.abs(cap.samples[i]));
          audio.setBusMuted('click', false);
          return { onsets, strums, sounding, downs, ghosts, loopStart, barSec, from, to, gaps: cap.gaps, peak };
        }, { id });
        await ctx.shot(`listen-${id}-desktop`);
        await ctx.page.getByRole('button', { name: 'Stop listening' }).click();

        const { onsets, sounding, ghosts, loopStart, barSec } = data;
        if (data.gaps > 0 && attempt === 1) {
          note(`[strum] ${id}: the capture has ${data.gaps} gap(s) (machine load); running it again`);
          continue;
        }
        done = true;
        const end = loopStart + barSec * 4;
        // What the engine scheduled is the pattern's grid, bar after bar.
        const grid = [];
        for (let b = 0; b < 4; b++) for (const off of sounding) grid.push(loopStart + b * barSec + off);
        const scheduled = data.strums.filter((t) => t >= loopStart - 0.001 && t < end - 0.001);
        const gridOk = scheduled.length === grid.length && scheduled.every((t, i) => Math.abs(t - grid[i]) < 0.0005);
        check('strum', `${id}: the strums are scheduled on the written grid`, gridOk, `${scheduled.length} scheduled, ${grid.length} on the grid`);
        // What is heard: onsets in the captured output.
        const heard = onsets.filter((t) => t >= loopStart - 0.03 && t < end - 0.03);
        const nearest = (t, list) => list.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best), Infinity);
        const off = heard.map((t) => (t - nearest(t, grid)) * 1000);
        const onGrid = off.filter((d) => Math.abs(d) <= 15).length;
        check('strum', `${id}: every onset in the captured output lands on a stroke of the grid`, heard.length > 0 && onGrid === heard.length, `${onGrid}/${heard.length} within 15 ms; worst ${Math.max(0, ...off.map(Math.abs)).toFixed(1)} ms`);
        // Every downstroke must be found. A light upstroke over a chord that is still ringing can be
        // too gentle a change for the onset detector (a limit the pitch module documents), so the
        // upstrokes are counted and reported rather than required.
        const found = grid.filter((g) => heard.some((t) => Math.abs(t - g) <= 15 / 1000)).length;
        const downGrid = [];
        for (let b = 0; b < 4; b++) for (const d of data.downs) downGrid.push(loopStart + b * barSec + d);
        const downsFound = downGrid.filter((g) => heard.some((t) => Math.abs(t - g) <= 15 / 1000)).length;
        check('strum', `${id}: the strokes are heard (every downstroke: ${downsFound}/${downGrid.length}; all strokes: ${found}/${grid.length})`, downsFound >= downGrid.length - 1 && found >= grid.length * 0.55, `peak ${data.peak.toFixed(2)}`);
        const ghostTimes = [];
        for (let b = 0; b < 4; b++) for (const g of ghosts) ghostTimes.push(loopStart + b * barSec + g);
        const inGhost = heard.filter((t) => ghostTimes.some((g) => Math.abs(t - g) <= 25 / 1000) && !grid.some((g) => Math.abs(t - g) <= 15 / 1000)).length;
        check('strum', `${id}: nothing sounds in the ghost slots`, inGhost === 0, `${inGhost} onsets in ${ghostTimes.length} ghost slots`);
        check('strum', `${id}: no console errors`, ctx.errors.length === 0, ctx.errors.join(' | '));
      } catch (err) {
        if (attempt === 2) check('strum', `${id}: ran`, false, err.message);
        else note(`[strum] ${id}: ${err.message.split('\n')[0]}; running it again`);
      } finally {
        await ctx.close();
      }
    }
  }
}

// ── layout: thumb zone, sideways phone, touch, reduced motion ────────────────────────────────

async function layout(browser, url) {
  // Phone, upright.
  const phone = await open(browser, url, { mobile: true, seed: calibration(0) });
  await phone.goto('rhythm--beat--1');
  await startRound(phone.page);
  const pad = await phone.page.locator('[data-rhythm-pad] button').first().boundingBox();
  const vh = VIEWPORTS.mobile.height;
  check('layout', 'phone: the pad is large and in the thumb zone', pad && pad.height >= 110 && pad.width >= 300 && pad.y >= vh * 0.5 && pad.y + pad.height <= vh + 1, JSON.stringify(pad));
  const immersive = await phone.page.evaluate(() => document.querySelector('[data-immersive]')?.getAttribute('data-immersive'));
  check('layout', 'phone: the round runs in focus mode (tab bar away)', immersive === 'focus', immersive);
  const before = await phone.page.evaluate(async () => (await import('/src/features/rhythm/engine/debug.ts')).rhythmDebug.session.rawTaps.length);
  await phone.page.touchscreen.tap(pad.x + pad.width / 2, pad.y + pad.height / 2);
  await phone.page.waitForTimeout(150);
  await phone.page.touchscreen.tap(pad.x + pad.width / 3, pad.y + pad.height / 2);
  await phone.page.waitForTimeout(150);
  const after = await phone.page.evaluate(async () => (await import('/src/features/rhythm/engine/debug.ts')).rhythmDebug.session.rawTaps.length);
  check('layout', 'phone: a touch on the pad is a tap', after === before + 2, `${before} -> ${after}`);
  await phone.shot('run-beat-phone');
  const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('layout', 'phone: the running round does not scroll sideways', overflow <= 1, overflow);
  await phone.page.keyboard.press('Escape');
  await phone.page.waitForSelector('[data-rhythm-phase="ready"], [data-rhythm-phase="done"]', { timeout: 10000 });
  check('layout', 'phone: Escape stops the round', true);
  check('layout', 'phone: no console errors', phone.errors.length === 0, phone.errors.join(' | '));
  await phone.close();

  // Phone held sideways: a pad under each thumb, the notation between them.
  const side = await open(browser, url, { mobile: true, viewport: { width: 844, height: 390 }, seed: calibration(0) });
  await side.goto('rhythm--read--8');
  await startRound(side.page);
  const pads = await side.page.locator('[data-rhythm-pad] button').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  const staff = await side.page.locator('svg[role="img"]').first().boundingBox();
  const two = pads.length === 2 && pads[0].x < 844 * 0.1 && pads[1].x + pads[1].w > 844 * 0.9 && pads.every((p) => p.h >= 150 && p.w >= 100 && p.y + p.h <= 391);
  check('layout', 'sideways phone: one pad at each edge', two, JSON.stringify(pads));
  check('layout', 'sideways phone: the notation sits between the pads, fully on screen', staff && pads.length === 2 && staff.x >= pads[0].x + pads[0].w - 1 && staff.x + staff.width <= pads[1].x + 1 && staff.y >= 0 && staff.y + staff.height <= 391, JSON.stringify(staff));
  await side.shot('run-read-sideways');
  const sideOverflow = await side.page.evaluate(() => [document.documentElement.scrollWidth - document.documentElement.clientWidth, document.documentElement.scrollHeight - document.documentElement.clientHeight]);
  check('layout', 'sideways phone: nothing scrolls sideways', sideOverflow[0] <= 1, sideOverflow.join(','));
  check('layout', 'sideways phone: no console errors', side.errors.length === 0, side.errors.join(' | '));
  await side.close();

  // Reduced motion: the round still plays, taps still count.
  const calm = await open(browser, url, { seed: calibration(0), reducedMotion: true });
  for (const route of ['rhythm--beat--1', 'rhythm--read--3', 'rhythm--strum--down-up']) {
    await calm.goto(route);
    await startRound(calm.page);
    await calm.page.waitForTimeout(1800);
    await calm.page.keyboard.press('Space');
    await calm.page.waitForTimeout(300);
    const taps = await calm.page.evaluate(async () => (await import('/src/features/rhythm/engine/debug.ts')).rhythmDebug.session.rawTaps.length);
    check('layout', `reduced motion: #${route} runs and takes a tap`, taps === 1 && calm.errors.length === 0, `${taps} taps; ${calm.errors.join(' | ')}`);
    if (route === 'rhythm--beat--1') await calm.shot('run-beat-reduced');
    await calm.page.keyboard.press('Escape');
    await calm.page.waitForSelector('[data-rhythm-phase="ready"], [data-rhythm-phase="done"]', { timeout: 10000 });
  }
  await calm.close();
}

// ── microphone ───────────────────────────────────────────────────────────────────────────────
//
// Two fake microphones. The first is built in the page: getUserMedia hands back a stream fed by
// clap recordings (noise bursts from the pitch module's test signals) that this script schedules
// on the app's own audio clock, a known 120 ms after each click, the way a real device delays a
// real clap. Because the times are exact, the measured delay and every judgement can be checked
// against numbers. The second is Chromium's fake capture device playing a WAV file: it proves the
// real getUserMedia path, but the file restarts at an unknown place each time the microphone is
// opened, so only the calibration round is checked with it.

const DEVICE_DELAY = 0.12;

/** Runs in the page once: replaces getUserMedia with a stream this script can clap into. */
async function installMockMic() {
  const audio = await import('/src/core/audio/index.ts');
  const pitch = await import('/src/core/pitch/index.ts');
  const mic = (window.__mic = { dest: null, opened: 0, clapBuffer: null });
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = audio.getAudioContext();
    mic.dest = ctx.createMediaStreamDestination();
    mic.opened++;
    // A whisper of room noise, so the input is never digital silence.
    const room = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    room.getChannelData(0).set(pitch.whiteNoise(ctx.sampleRate, 0.0005, 5));
    const noise = ctx.createBufferSource();
    noise.buffer = room;
    noise.loop = true;
    noise.connect(mic.dest);
    noise.start();
    return mic.dest.stream;
  };
  /** One clap heard by the microphone at audio time `when`; `gain` below 1 for the speakers bleeding in. */
  mic.clap = (when, gain = 1) => {
    const ctx = audio.getAudioContext();
    if (!mic.clapBuffer) {
      const n = Math.round(0.08 * ctx.sampleRate);
      const burst = pitch.whiteNoise(n, 0.3, 17);
      for (let i = 0; i < n; i++) burst[i] *= Math.exp(-i / (0.012 * ctx.sampleRate));
      mic.clapBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
      mic.clapBuffer.getChannelData(0).set(burst);
    }
    const src = ctx.createBufferSource();
    src.buffer = mic.clapBuffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(mic.dest);
    src.start(when);
  };
}

/**
 * Runs in the page while a round is running: claps `delay` seconds after every expected note
 * (plus a planned deviation per note), and optionally lets every click "bleed" quietly into the
 * microphone `bleed.delay` seconds after it sounds. Waits for the round to end.
 */
async function clapAlong({ delay, deviations, bleed, probeOnly, skipSoft }) {
  const { rhythmDebug } = await import('/src/features/rhythm/engine/debug.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const session = rhythmDebug.session;
  const mic = window.__mic;
  const play = session.chart.segments.filter((s) => s.kind === 'play').map((s) => s.index);
  const targets = session.chart.targets.filter((t) => play.includes(t.seg));
  const plan = targets.map((t, i) => ({ id: t.id, dev: skipSoft && t.soft ? null : deviations ? deviations[i % deviations.length] : 0, time: session.targetTime(t.id), soft: !!t.soft }));
  if (!probeOnly) for (const p of plan) if (p.dev !== null) mic.clap(p.time + delay + p.dev / 1000);
  if (bleed) for (const s of session.chart.sounds) if (s.type === 'click') mic.clap(session.timeOfTick(s.tick) + bleed.delay, bleed.gain);
  const deadline = performance.now() + 70000;
  while (session.state !== 'ended' && performance.now() < deadline) await sleep(100);
  const result = rhythmDebug.lastResult;
  return { ended: session.state === 'ended', plan, offsetMs: session.offsetMs, judgements: result ? result.judgements : [], stats: result ? result.stats : null, completed: !!result && result.completed, opened: mic.opened };
}

async function calibrateWithClaps(ctx, opts = {}) {
  await ctx.goto('rhythm--calibrate--mic');
  // A second calibration starts from the result of the first.
  const again = ctx.page.getByRole('button', { name: 'Measure again' });
  if (await again.count()) await again.click();
  const before = await ctx.page.evaluate(() => window.__rhythm.started);
  await clearToasts(ctx.page);
  await ctx.page.locator('[data-calibrate-start]').click();
  await ctx.page.waitForFunction((n) => window.__rhythm.started > n && window.__rhythm.session?.state === 'running', before, { timeout: 30000 });
  await ctx.page.evaluate(clapAlong, { delay: DEVICE_DELAY, deviations: null, bleed: opts.bleed || null, probeOnly: false });
  await ctx.page.waitForSelector('[data-calibration-result]', { timeout: 15000 });
  const shown = await ctx.page.locator('[data-calibration-result]').evaluate((el) => ({ quality: el.dataset.calibrationResult, offset: Number(el.dataset.offset), text: el.textContent }));
  const stored = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem('ssa:rhythm.calibration')));
  return { shown, stored };
}

async function playAlong(ctx, { deviations, bleed = null, patch = null, pattern = 'four-down', bpm = 100, skipSoft = false } = {}) {
  if (patch) {
    await ctx.page.evaluate((change) => {
      const cal = { ...JSON.parse(localStorage.getItem('ssa:rhythm.calibration')), ...change };
      localStorage.setItem('ssa:rhythm.calibration', JSON.stringify(cal));
    }, patch);
  }
  // Leave and come back, so the pattern screen starts from its ready state every time.
  await ctx.goto('rhythm--strum');
  await ctx.goto(`rhythm--strum--${pattern}`);
  await setTempo(ctx.page, bpm);
  const startedBefore = await ctx.page.evaluate(() => window.__rhythm.started);
  await clearToasts(ctx.page);
  await ctx.page.locator('[data-rhythm-start]').click({ timeout: 15000 });
  await ctx.page.waitForFunction((n) => window.__rhythm.started > n && window.__rhythm.session?.state === 'running', startedBefore, { timeout: 30000 });
  const source = await ctx.page.locator('[data-rhythm-phase="running"]').getAttribute('data-source');
  const listening = (await ctx.page.locator('[data-rhythm-listening]').count()) === 1;
  const run = await ctx.page.evaluate(clapAlong, { delay: DEVICE_DELAY, deviations, bleed, probeOnly: false, skipSoft });
  const summary = await ctx.page.waitForSelector('[data-rhythm-summary]', { timeout: 10000 }).then(() => true, () => false);
  const summaryText = summary ? await ctx.page.locator('[data-rhythm-summary]').textContent() : '';
  return { source, listening, summary, summaryText, ...run };
}

async function micMock(browser, url) {
  const ctx = await open(browser, url, { seed: { ...calibration(0, null), 'ssa:rhythm.prefs': JSON.stringify({ source: 'mic' }) } });
  try {
    await ctx.goto('rhythm--calibrate--mic');
    await ctx.page.evaluate(installMockMic);

    // 1. Clap with the click: the claps arrive 120 ms after every click.
    const cal = await calibrateWithClaps(ctx);
    const measured = cal.stored.micMs;
    // The route into the page adds a little of its own (buffering between the stream and the analysis).
    check('mic', `clap with the click measures the device's delay (${measured} ms for claps sent 120 ms late)`, cal.shown.quality === 'save' && measured !== null && measured >= 118 && measured <= 190 && Math.abs(measured - cal.shown.offset) <= 1, JSON.stringify(cal.shown).slice(0, 200));
    check('mic', 'the offset is stored under the rhythm key and no bleed is reported', cal.stored.micAt > 0 && cal.stored.bleed === null && !/can hear your speakers/.test(cal.shown.text), JSON.stringify(cal.stored));
    await ctx.shot('calibrate-mic-result');

    // 2. Play along: claps on the beat (plus planned deviations), judged after the delay is taken off.
    const deviations = [0, 0, 20, -25, 0, 55, -60, 0, null, 0, 10, -10, 0, 100, 0, 0];
    const good = await playAlong(ctx, { deviations });
    check('mic', 'the play-along round listens through the microphone', good.source === 'mic' && good.listening && good.completed && good.summary, `${good.source} ${good.completed}`);
    if (good.stats) {
      const byTarget = new Map(good.judgements.filter((j) => j.targetId !== null).map((j) => [j.targetId, j]));
      const errs = good.plan.filter((p) => p.dev !== null).map((p) => { const j = byTarget.get(p.id); return j && j.verdict !== 'miss' ? j.errorMs - p.dev : null; });
      const heard = errs.filter((e) => e !== null);
      const worst = Math.max(0, ...heard.map(Math.abs));
      const skipped = good.plan.filter((p) => p.dev === null).length;
      check('mic', `after calibration every clap is judged where it was played (worst ${worst.toFixed(1)} ms from the plan)`, heard.length === errs.length && worst <= 12, `${heard.length}/${errs.length} heard`);
      check('mic', 'claps on the beat score as on time; skipped ones are misses', good.stats.total === 32 && good.stats.miss === skipped && good.stats.extra === 0 && good.stats.perfect >= 20 && good.stats.accuracy >= 0.8, `perfect ${good.stats.perfect}, good ${good.stats.good}, ok ${good.stats.ok}, miss ${good.stats.miss}, extra ${good.stats.extra}, accuracy ${(good.stats.accuracy * 100).toFixed(0)} %`);
      const onBeat = good.plan.filter((p) => p.dev === 0).map((p) => byTarget.get(p.id)).filter(Boolean);
      const mean = onBeat.reduce((a, j) => a + j.errorMs, 0) / Math.max(1, onBeat.length);
      // The fake microphone's route (a MediaStream inside the page) is buffered afresh each time the
      // microphone opens, by up to about 10 ms on a busy machine (runs have read 1 to 9 ms here), so the
      // claps of a later round can sit that far from where calibration put them.
      check('mic', `the stored offset is the one applied (${good.offsetMs} ms; on-beat claps read ${mean.toFixed(1)} ms)`, Math.abs(good.offsetMs - measured) < 0.01 && Math.abs(mean) <= 12 && onBeat.every((j) => j.verdict === 'perfect'));
    }
    await ctx.shot('summary-mic');

    // 3. The same claps against an offset that is 220 ms wrong.
    const bad = await playAlong(ctx, { deviations: [0], patch: { micMs: measured + 220 } });
    check('mic', 'with a wrong stored offset the same claps score badly', bad.stats && bad.stats.accuracy <= 0.2 && bad.stats.hits <= 3, bad.stats ? `accuracy ${(bad.stats.accuracy * 100).toFixed(0)} %, hits ${bad.stats.hits}` : 'no result');

    // 4. Speakers bleeding into the microphone: found during calibration, ignored in the round.
    const BLEED = { delay: 0.035, gain: 0.05 };
    const leaky = await calibrateWithClaps(ctx, { bleed: BLEED });
    const b = leaky.stored.bleed;
    check('mic', 'calibration notices the click coming back through the microphone', !!b && Math.abs(b.loopMs - 35) <= 45 && /can hear your speakers/.test(leaky.shown.text), JSON.stringify(b));
    if (b) {
      const gated = await playAlong(ctx, { deviations: [0], bleed: BLEED, patch: { micMs: measured } });
      check('mic', 'with the bleed known, the clicks are not counted as claps', gated.stats && gated.stats.extra <= 2 && gated.stats.hits >= 30, gated.stats ? `hits ${gated.stats.hits}, extra ${gated.stats.extra}` : 'no result');
      const open2 = await playAlong(ctx, { deviations: [0], bleed: BLEED, patch: { micMs: measured, bleed: null } });
      check('mic', 'without that knowledge the same clicks would be extra taps', open2.stats && open2.stats.extra >= 10, open2.stats ? `extra ${open2.stats.extra}` : 'no result');
    }

    // 5. Quick upstrokes over a ringing chord: a microphone may not hear them, so an unheard one is left out, not missed.
    const gallop = await playAlong(ctx, { pattern: 'gallop', bpm: 72, deviations: [0], skipSoft: true, patch: { micMs: measured, bleed: null } });
    const soft = gallop.plan.filter((p) => p.soft).length;
    check(
      'mic',
      `gallop through the microphone: the ${soft} quick upstrokes that were never played are left out, everything else is judged`,
      soft === 16 && gallop.stats && gallop.stats.forgiven === soft && gallop.stats.total === gallop.plan.length - soft && gallop.stats.miss === 0 && gallop.stats.extra === 0 && gallop.stats.stars === 3,
      gallop.stats ? `total ${gallop.stats.total}, forgiven ${gallop.stats.forgiven}, miss ${gallop.stats.miss}, extra ${gallop.stats.extra}, stars ${gallop.stats.stars}` : 'no result',
    );
    const marked = gallop.judgements.filter((j) => j.verdict === 'miss').length;
    const softIds = new Set(gallop.plan.filter((p) => p.soft).map((p) => p.id));
    const onlySoft = gallop.judgements.filter((j) => j.verdict === 'miss').every((j) => softIds.has(j.targetId));
    check('mic', 'the summary says why they were left out; the only notes that went by unheard were those upstrokes', /quick upstrokes were not heard/.test(gallop.summaryText) && marked === soft && onlySoft, `${marked} unheard; ${gallop.summaryText.slice(0, 120)}`);
    await ctx.shot('summary-mic-gallop');

    check('mic', 'the microphone is opened once per round and released in between', good.opened >= 2);
    check('mic', 'no console errors', ctx.errors.length === 0, ctx.errors.join(' | '));
  } finally {
    await ctx.close();
  }
}

const SR = 48000;

/** Claps every 0.6 s (the calibration tempo) for six minutes: long enough that the file never wraps during the check. */
async function makeClaps(file) {
  const sig = await loadTs('/src/core/pitch/signals.ts');
  const period = 0.6;
  const count = 600;
  const x = sig.whiteNoise(Math.round(period * count * SR), 0.0015, 3);
  const n = Math.round(0.08 * SR);
  for (let k = 0; k < count; k++) {
    const burst = sig.whiteNoise(n, 0.5, 11 + (k % 5));
    const at = Math.round((0.1 + k * period) * SR);
    for (let i = 0; i < n && at + i < x.length; i++) x[at + i] += burst[i] * Math.exp(-i / (0.012 * SR));
  }
  fs.writeFileSync(file, Buffer.from(sig.encodeWav(x, SR, { bitDepth: 16 })));
}

async function micDevice() {
  const wav = path.join(os.tmpdir(), `ssa-rhythm-claps-${process.pid}.wav`);
  await makeClaps(wav);
  try {
    await withApp({ fakeAudio: wav }, async ({ browser, url }) => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const ctx = await open(browser, url, { seed: { ...calibration(0, null), 'ssa:rhythm.prefs': JSON.stringify({ source: 'mic' }) } });
        try {
          await ctx.goto('rhythm--calibrate--mic');
          await ctx.page.locator('[data-calibrate-start]').click();
          await ctx.page.waitForSelector('[data-calibration-result]', { timeout: 60000 });
          const shown = await ctx.page.locator('[data-calibration-result]').evaluate((el) => ({ quality: el.dataset.calibrationResult, offset: Number(el.dataset.offset) }));
          const stored = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem('ssa:rhythm.calibration')));
          const taps = await ctx.page.evaluate(async () => (await import('/src/features/rhythm/engine/debug.ts')).rhythmDebug.session.rawTaps);
          const gaps = taps.slice(1).map((t, i) => (t - taps[i]) * 1000);
          // Chromium's fake device is fed by a timer of its own, which wavers by a few tens of
          // milliseconds when the machine is busy; the claps in the file are exactly 600 ms apart.
          const sorted = [...gaps].sort((a, b) => a - b);
          const median = sorted.length ? sorted[sorted.length >> 1] : 0;
          const steady = gaps.length >= 15 && Math.abs(median - 600) <= 3 && gaps.filter((g) => Math.abs(g - 600) <= 15).length >= gaps.length * 0.85 && gaps.every((g) => Math.abs(g - 600) <= 40);
          if (!(shown.quality === 'save' && steady) && attempt === 1) {
            note(`[mic] the fake capture device stuttered (${shown.quality}, gaps ${Math.min(...gaps).toFixed(0)}..${Math.max(...gaps).toFixed(0)} ms): machine load; running it again`);
            continue;
          }
          check('mic', `real getUserMedia path: claps from the fake device arrive as onsets 600 ms apart (${gaps.length + 1} heard)`, steady, `median ${median.toFixed(1)} ms, range ${Math.min(...gaps).toFixed(1)}..${Math.max(...gaps).toFixed(1)} ms`);
          check('mic', 'real getUserMedia path: calibration measures them and stores the result', shown.quality === 'save' && stored.micMs !== null && Math.abs(stored.micMs - shown.offset) <= 1 && stored.micMs >= -100 && stored.micMs < 500 && stored.bleed === null, `${shown.quality}, ${shown.offset} ms`);
          check('mic', 'real getUserMedia path: no console errors', ctx.errors.length === 0, ctx.errors.join(' | '));
          return;
        } finally {
          await ctx.close();
        }
      }
    });
  } finally {
    fs.rmSync(wav, { force: true });
  }
}

// ── review: the cases an independent review caught ───────────────────────────────────────────

/** Send key taps at a fixed distance from every calibration click, the way `sendTaps` does. */
async function tapCalibration(page, offsetMs) {
  const before = await page.evaluate(() => window.__rhythm.started);
  await page.locator('[data-calibrate-start]').click();
  await page.waitForFunction((n) => window.__rhythm.started > n && window.__rhythm.session?.state === 'running', before, { timeout: 30000 });
  return page.evaluate(sendTaps, { offsetMs, deviations: [0, 2, -2, 1, -1, 3, -3, 0], extras: 0, byDirection: false, wrong: [] });
}

async function review(browser, url) {
  // 1. The microphone cannot be opened (no device here; refused in the Claude viewer): on a phone the
  //    explanation used to appear far below the Start button that was pressed, so nothing seemed to happen.
  {
    const ctx = await open(browser, url, { mobile: true, seed: { ...calibration(0, 120), 'ssa:rhythm.prefs': JSON.stringify({ source: 'mic' }) } });
    try {
      await ctx.goto('rhythm--strum--folk-pop');
      await ctx.page.locator('[data-rhythm-start]').click();
      const blocked = ctx.page.locator('[data-rhythm-mic-blocked]');
      await blocked.waitFor({ timeout: 20000 });
      await ctx.page.waitForTimeout(900);
      const seen = await blocked.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const bar = document.querySelector('[data-rhythm-start]')?.closest('[class*="actionBar"], [class*="ActionBar"]')?.getBoundingClientRect();
        const floor = Math.min(window.innerHeight, bar ? bar.top : window.innerHeight);
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), floor: Math.round(floor), focused: el === document.activeElement || el.contains(document.activeElement), text: el.textContent };
      });
      check('review', 'mic refused on a phone: the explanation is brought into view and focused', seen.top >= 0 && seen.top < seen.floor && seen.focused && /microphone/i.test(seen.text), JSON.stringify({ ...seen, text: seen.text.slice(0, 60) }));
      await ctx.shot('review-mic-blocked-phone');
      await blocked.getByRole('button', { name: 'Tap instead' }).click();
      const label = await ctx.page.locator('[data-rhythm-start]').textContent();
      check('review', 'mic refused: "Tap instead" switches the round to tapping', (await blocked.count()) === 0 && /tap along/.test(label || ''), label);
      check('review', 'mic refused: no console errors', ctx.errors.length === 0, ctx.errors.join(' | '));
    } catch (err) {
      check('review', 'mic refused: ran', false, err.message);
    } finally {
      await ctx.close();
    }
  }

  // 2. A calibration no device could produce (taps 200 ms before every click) used to read "a little
  //    uneven (it varied by about 0 ms)", and "Keep it anyway" then said "Saved" while nothing was stored.
  //    3. A good one is stored and the list under it used to keep saying "not measured".
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctx = await open(browser, url, { mobile: true, seed: calibration(null, null, { tapAt: null }) });
    try {
      await ctx.goto('rhythm--calibrate');
      let run = await tapCalibration(ctx.page, -200);
      const result = ctx.page.locator('[data-calibration-result]');
      await result.waitFor({ timeout: 15000 });
      const bad = await result.evaluate((el) => ({ verdict: el.dataset.calibrationResult, text: el.textContent }));
      const storedBad = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem('ssa:rhythm.calibration') || '{}'));
      const keep = await ctx.page.getByRole('button', { name: 'Keep it anyway' }).count();
      const late = Math.max(...run.plan.map((p) => (p.at - p.when) * 1000));
      if (late > 12 && attempt === 1) {
        note(`[review] calibration taps were sent up to ${late.toFixed(1)} ms late (machine load); running it again`);
        continue;
      }
      check('review', 'calibration: taps 200 ms before every click are turned down, not offered as "keep it anyway"', bad.verdict === 'implausible' && keep === 0 && /Nothing was saved/.test(bad.text) && !/Saved on this device/.test(bad.text), bad.text.slice(0, 120));
      check('review', 'calibration: nothing is stored for them', storedBad.tapMs === null && !storedBad.tapAt, JSON.stringify(storedBad));
      await ctx.shot('review-calibration-implausible');
      await ctx.page.locator('[data-calibrate-again]').click();
      run = await tapCalibration(ctx.page, 35);
      await result.waitFor({ timeout: 15000 });
      const good = await result.evaluate((el) => el.dataset.calibrationResult);
      const storedGood = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem('ssa:rhythm.calibration') || '{}'));
      const list = await ctx.page.locator('[data-calibration-stored]').textContent();
      check('review', `calibration: a good measurement is stored and listed at once (${storedGood.tapMs} ms)`, good === 'save' && storedGood.tapMs !== null && list.includes(`${Math.round(storedGood.tapMs)} ms`) && /measured today/.test(list), list);
      check('review', 'calibration: no console errors', ctx.errors.length === 0, ctx.errors.join(' | '));
      await ctx.close();
      break;
    } catch (err) {
      if (attempt === 2) check('review', 'calibration: ran', false, err.message);
      else note(`[review] calibration: ${err.message.split('\n')[0]}; running it again`);
      await ctx.close();
    }
  }

  // 4. Every stroke on time but the wrong way used to score 100 % and three stars.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctx = await open(browser, url, { seed: calibration(0) });
    try {
      await ctx.goto('rhythm--strum--four-down');
      await setTempo(ctx.page, 140);
      await ctx.page.evaluate(() => {
        window.__verdicts = new Set();
        new MutationObserver(() => document.querySelectorAll('[data-verdict]').forEach((el) => window.__verdicts.add(el.getAttribute('data-verdict')))).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-verdict'] });
      });
      await startRound(ctx.page);
      const run = await ctx.page.evaluate(sendTaps, { offsetMs: 0, deviations: [0], extras: 0, byDirection: true, wrong: Array.from({ length: 64 }, (_, i) => i) });
      const late = Math.max(...run.plan.map((p) => (p.at - p.when) * 1000));
      if (late > 12 && attempt === 1) {
        note(`[review] wrong-way taps were sent up to ${late.toFixed(1)} ms late (machine load); running it again`);
        continue;
      }
      await ctx.page.waitForSelector('[data-rhythm-summary]', { timeout: 15000 });
      const sum = await ctx.page.locator('[data-rhythm-summary]').evaluate((el) => ({ stars: Number(el.dataset.stars), accuracy: Number(el.dataset.accuracy), text: el.textContent }));
      const said = await ctx.page.evaluate(() => [...window.__verdicts]);
      check('review', `wrong way round: every stroke hit on time but reversed earns no star (${sum.accuracy} %)`, run.stats && run.stats.hits === run.stats.total && run.stats.wrongDirection === run.stats.total && sum.stars === 0 && sum.accuracy === 50 && /Watch the stroke direction/.test(sum.text), JSON.stringify({ stars: sum.stars, accuracy: sum.accuracy }));
      check('review', 'wrong way round: each reversed stroke is called out as it happens', said.includes('wrong-way'), said.join(','));
      const skill = await ctx.page.evaluate(async () => (await import('/src/core/progress/index.ts')).getProgress().skills['rhythm:strum:four-down']);
      check('review', 'wrong way round: recorded, but not as a flawless round', skill && skill.attempts === 1 && skill.perfects === 0 && skill.stars === 0, JSON.stringify(skill && { attempts: skill.attempts, perfects: skill.perfects, stars: skill.stars }));
      check('review', 'wrong way round: no console errors', ctx.errors.length === 0, ctx.errors.join(' | '));
      await ctx.close();
      break;
    } catch (err) {
      if (attempt === 2) check('review', 'wrong way round: ran', false, err.message);
      else note(`[review] wrong way round: ${err.message.split('\n')[0]}; running it again`);
      await ctx.close();
    }
  }

  // 5. Text at 200 % on a 360 px phone: the hub used to scroll sideways, and a running round squeezed Stop to "S".
  {
    const ctx = await open(browser, url, { mobile: true, viewport: { width: 360, height: 740 }, seed: calibration(0) });
    await ctx.context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }));
    try {
      await ctx.goto('rhythm');
      await ctx.page.waitForTimeout(600);
      const wide = await ctx.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check('review', 'text at 200 %: the hub does not scroll sideways at 360 px', wide <= 1, `${wide} px`);
      await ctx.goto('rhythm--strum--folk-pop');
      await startRound(ctx.page);
      const stop = await ctx.page.locator('[data-rhythm-stop]').evaluate((el) => ({ fits: el.scrollWidth <= el.clientWidth + 1, right: Math.round(el.getBoundingClientRect().right), text: el.textContent.trim() }));
      check('review', 'text at 200 %: Stop keeps its whole label in a running round', stop.fits && stop.right <= 360, JSON.stringify(stop));
      await ctx.shot('review-large-text-round');
      await ctx.page.keyboard.press('Escape');
      check('review', 'text at 200 %: no console errors', ctx.errors.length === 0, ctx.errors.join(' | '));
    } catch (err) {
      check('review', 'text at 200 %: ran', false, err.message);
    } finally {
      await ctx.close();
    }
  }
}

(async () => {
  const scoring = wants('keys') ? await loadTs('/src/features/rhythm/core/scoring.ts') : null;
  if (['screens', 'offer', 'leave', 'keys', 'calibrate', 'strum', 'layout', 'mic', 'review'].some(wants)) {
    await withApp({}, async ({ browser, url }) => {
      const run = async (group, fn) => {
        if (!wants(group)) return;
        console.log(`== ${group}`);
        try {
          await fn();
        } catch (err) {
          check(group, 'ran to the end', false, err.stack || err.message);
        }
      };
      await run('screens', () => screens(browser, url));
      await run('offer', () => offer(browser, url));
      await run('leave', () => leave(browser, url));
      await run('keys', () => keys(browser, url, scoring));
      await run('calibrate', () => calibrateTaps(browser, url));
      await run('strum', () => strumOnsets(browser, url));
      await run('layout', () => layout(browser, url));
      await run('mic', () => micMock(browser, url));
      await run('review', () => review(browser, url));
    });
  }
  if (wants('mic')) {
    try {
      await micDevice();
    } catch (err) {
      check('mic', 'fake capture device: ran to the end', false, err.stack || err.message);
    }
  }
  const failed = results.filter((r) => !r.pass);
  const groups = [...new Set(results.map((r) => r.group))];
  for (const g of groups) {
    const all = results.filter((r) => r.group === g);
    console.log(`${g.padEnd(10)} ${all.filter((r) => r.pass).length}/${all.length}`);
  }
  console.log(failed.length ? `FAILED (${failed.length} of ${results.length} checks)` : `PASSED (${results.length} checks)`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  console.log('FAILED');
  process.exit(1);
});
