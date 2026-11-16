#!/usr/bin/env node
/**
 * Browser check of the Technique screen (#technique, #technique--<exercise>).
 * Run: node e2e/technique.cjs [--verbose] [--no-shots] [--only hub,ladder,reload,take,bend,health,routine,changes,large,shots]
 *
 * What it checks, in the pre-installed Chromium with one dev server:
 *
 *  hub        every exercise of the plan is listed (one row each), grouped by skill; the hand
 *             filter narrows the list; the next step is the warm-up for a new learner
 *  ladder     an exercise with the tempo ladder and the click: Start counts in and plays (the
 *             tab cursor moves), Enter = clean goes up a rung, two "not yet" step back down,
 *             arrows change the tempo, Space stops; the ladder shows the visit's best clean tempo
 *             before it is saved; Finish records the visit (best clean tempo, summary sheet with XP)
 *  reload     a reload in the middle of a visit keeps what was done: three clean passes, then a
 *             reload, and the best clean tempo is saved and the next visit starts one rung under it
 *  take       a microphone take with a fake microphone (Chromium plays a WAV as the mic): with the
 *             click on, the result says where the notes sat against the click; with it off: the
 *             G major two-octave scale played evenly at 60 BPM is judged clean and the ladder
 *             climbs; the same scale played with uneven timing is not clean, and the result says
 *             how far from an even pulse the notes were; one wrong note with perfect timing is not
 *             clean and the result names the bar, the beat and the right note
 *  bend       the whole-step bend: a recording that stops about 45 cents short of E is caught and
 *             the message says how far short; one bent all the way is in tune
 *  health     the tension check and the break prompt after a long stretch of playing (the clock
 *             is advanced through the screen's development hook), "Keep going" dismisses it
 *  routine    the warm-up counts down, moves between steps, plays its material; run to the end
 *             (on Playwright's clock) "Again from the top" really starts again; a finished warm-up
 *             is recorded once, even after "Save and finish" and leaving
 *  changes    one-minute changes: pick a pair, the minute starts with a count-in and stops; the
 *             plan's pairs are all there and two pairs with the same chords have different names
 *  large      text at 200 percent on a 360 px phone: no sideways scroll on the exercise screens; a
 *             200-character unbroken cool-down note is shown back the next time without pushing the page
 *  shots      phone and desktop, dark and light, phone sideways: e2e/out/technique-*.png; no
 *             sideways scrolling and no console errors anywhere
 *
 * Prints PASSED or FAILED and exits non-zero on failure. Timing-sensitive steps use generous
 * waits; on a very busy machine a take can be late, so a failed group is retried once.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, loadTs, VIEWPORTS, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const noShots = argv.includes('--no-shots');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
const want = (g) => !only || only.has(g);

const SEED = { 'ssa:shell.onboarding': '{"skipped":true}' };
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass, detail: String(detail ?? '') });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}

let server = null;

/** A fresh browser on the shared server; `fakeAudio` plays a WAV as the microphone. */
async function launch({ mobile = false, viewport, theme = 'dark', fakeAudio } = {}) {
  const args = ['--autoplay-policy=no-user-gesture-required'];
  if (fakeAudio) args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fakeAudio}`);
  const browser = await chromium.launch({ args });
  const context = await browser.newContext({
    viewport: viewport || VIEWPORTS[mobile ? 'mobile' : 'desktop'],
    colorScheme: theme,
    hasTouch: mobile,
    isMobile: mobile,
    permissions: fakeAudio ? ['microphone'] : [],
  });
  await context.addInitScript((items) => {
    try {
      for (const [k, v] of Object.entries(items)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
    } catch {
      /* no storage */
    }
  }, SEED);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  const goto = async (...route) => {
    await page.goto(`${server.url}#${route.join('--')}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route]', { timeout: 30000 });
  };
  return { browser, context, page, errors, goto, close: () => browser.close() };
}

/** Run a group, retrying once (the machine is shared and a take can be late). */
async function group(name, fn) {
  if (!want(name)) return;
  const before = results.length;
  try {
    await fn();
  } catch (e) {
    check(name, 'ran without throwing', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
  }
  const failed = results.slice(before).some((r) => !r.pass);
  if (!failed) {
    console.log(`  ${name}: ok`);
    return;
  }
  console.log(`  ${name}: failed once, trying again`);
  results.splice(before);
  try {
    await fn();
  } catch (e) {
    check(name, 'ran without throwing', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
  }
  console.log(`  ${name}: ${results.slice(before).some((r) => !r.pass) ? 'FAILED' : 'ok on the second try'}`);
}

const attr = (page, sel, name) => page.$eval(sel, (el, n) => el.getAttribute(n), name).catch(() => null);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// ---------------------------------------------------------------- recordings for the fake microphone

const SR = 48000;
let sig = null;
let kit = null;
let content = null;

/** Write a 16-bit WAV and return the path to play once ("%noloop"). */
function writeWav(name, samples) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'technique-e2e-'));
  const file = path.join(dir, `${name}.wav`);
  fs.writeFileSync(file, Buffer.from(sig.encodeWav(samples, SR, { bitDepth: 16 })));
  return `${file}%noloop`;
}

/** The G major scale part at 60 BPM, plucked at its times plus `err(i)` seconds, after `lead` seconds. */
function scaleTake(name, err, lead = 3.2, pitch = () => 0) {
  const e = content.getExercise('tech-alternate-scale-g');
  const song = content.partSong(e, e.parts[0], 60);
  const notes = song.tracks[0].measures.flatMap((m, bar) => m.beats.flatMap((b) => b.notes.map((n) => ({ midi: n.midi, t: bar * 4 + b.start / 960, dur: b.duration / 960 }))));
  const total = lead + 16 + 2;
  const x = new Float32Array(Math.round(total * SR));
  notes.forEach((n, i) => {
    const freq = 440 * 2 ** ((n.midi + pitch(i) - 69) / 12);
    const dur = Math.min(1.6, Math.max(0.42, n.dur * 0.95));
    const p = sig.pluckedString({ freq, sampleRate: SR, duration: dur, amplitude: 0.45, attackNoise: 0.3, seed: 11 + i });
    const fade = Math.round(0.02 * SR);
    for (let k = 0; k < fade; k++) p[p.length - 1 - k] *= k / fade;
    const at = Math.round((lead + n.t + err(i)) * SR);
    for (let k = 0; k < p.length && at + k < x.length; k++) x[at + k] += p[k];
  });
  return { fakeAudio: writeWav(name, sig.addNoise(x, 45, 5)), notes: notes.length };
}

/** The whole-step bend part: E (string 3 fret 9) first, then string 3 fret 7 bent by `reach` cents and held. */
function bendTake(name, reach) {
  const sr = 44100;
  const target = kit.renderNote({ string: 3, fret: 9, tone: 'steel', velocity: 0.7, cents: 0, sampleRate: sr }, 1.6);
  const plain = kit.renderNote({ string: 3, fret: 7, tone: 'steel', velocity: 0.75, cents: 0, sampleRate: sr }, 4.2);
  const bent = kit.pitchWarp(plain, sr, 3.6, (t) => (t < 0.2 ? 0 : t < 0.55 ? ((t - 0.2) / 0.35) * reach : reach));
  let x = new Float32Array(Math.round(13 * sr));
  x = kit.mixInto(x, target.subarray(0, Math.round(1.5 * sr)), 1, Math.round(3.4 * sr));
  x = kit.mixInto(x, bent, 1, Math.round(7.4 * sr));
  const room = kit.background('pink', sr, x.length, 3);
  x = kit.mixInto(x, room, 0.0015 / Math.max(1e-9, kit.rms(room)));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'technique-e2e-'));
  const file = path.join(dir, `${name}.wav`);
  fs.writeFileSync(file, Buffer.from(sig.encodeWav(x, sr, { bitDepth: 16 })));
  return { fakeAudio: `${file}%noloop` };
}

/** Deterministic jitter in [-1, 1]. */
const jitter = (i) => Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 78.233) * 0.5;

// ---------------------------------------------------------------- groups

async function hubGroup() {
  const s = await launch();
  try {
    await s.goto('technique');
    await s.page.waitForSelector('[data-technique-screen="hub"]', { timeout: 30000 });
    const ROWS = '[data-technique-screen="hub"] ul a[href^="#technique--"]';
    const rows = await s.page.$$eval(ROWS, (els) => els.map((e) => e.getAttribute('href').replace('#technique--', '')));
    const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/plan/repertoire.json'), 'utf8')).technique.map((t) => t.id);
    check('hub', `one row per plan exercise (${plan.length})`, rows.length === plan.length && plan.every((id) => rows.includes(id)), `${rows.length} rows`);
    check('hub', 'a new learner starts with the warm-up', (await attr(s.page, '[data-technique-today]', 'data-technique-today')) === 'warm-up');
    await s.page.getByRole('radio', { name: /Picking hand/ }).first().click();
    await s.page.waitForTimeout(300);
    const picking = await s.page.$$eval(ROWS, (els) => els.length);
    const pickingPlan = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/plan/repertoire.json'), 'utf8')).technique.filter((t) => t.hand === 'picking').length;
    check('hub', 'the hand filter shows the picking-hand exercises only', picking === pickingPlan, `${picking} vs ${pickingPlan}`);
    await s.page.getByRole('radio', { name: /^All/ }).first().click();
    await s.page.waitForTimeout(300);
    await s.page.locator('[data-technique-screen="hub"] ul a[href="#technique--tech-spider"]').click();
    await s.page.waitForSelector('[data-technique-screen="exercise"][data-exercise="tech-spider"]', { timeout: 30000 });
    check('hub', 'a row opens its exercise', true);
    check('hub', 'no console errors', s.errors.length === 0, s.errors.join(' | '));
  } finally {
    await s.close();
  }
}

async function ladderGroup() {
  const s = await launch();
  const p = s.page;
  try {
    await s.goto('technique', 'tech-permutations-1');
    await p.waitForSelector('[data-technique-screen="exercise"]', { timeout: 30000 });
    const root = '[data-technique-screen="exercise"]';
    check('ladder', 'opens at the ladder start, 50 BPM', (await attr(p, root, 'data-tempo')) === '50');
    await p.locator('[data-technique-primary]').first().click();
    await p.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-mode') === 'practice', root, { timeout: 15000 });
    check('ladder', 'Start begins practice with the click', true);
    // The cursor moves along the tab once the count-in is over (4 beats at 50 BPM = 4.8 s).
    const cursorAt = () => p.evaluate(() => {
      const els = [...document.querySelectorAll('[data-technique-demo] [class*="cursor" i], [data-technique-demo] [data-cursor]')];
      return els.map((e) => getComputedStyle(e).transform + '|' + e.getAttribute('style')).join(';');
    });
    await p.waitForTimeout(6000);
    const c1 = await cursorAt();
    await p.waitForTimeout(1200);
    const c2 = await cursorAt();
    check('ladder', 'the tab cursor moves while playing', c1 !== c2 && c2.length > 0, `${c1.slice(0, 80)} -> ${c2.slice(0, 80)}`);
    // The fretboard lights the note being played (it follows the runner by itself).
    const lit = () => p.$$eval('[data-technique-demo] g[data-state="target"]', (els) => els.map((e) => e.getAttribute('transform')).join(';'));
    const l1 = await lit();
    await p.waitForTimeout(700);
    const l2 = await lit();
    check('ladder', 'the fretboard lights the note being played, and it moves on', l1.length > 0 && l2.length > 0 && l1 !== l2, `${l1} -> ${l2}`);
    await p.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
    await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await p.keyboard.press('h');
    await p.waitForTimeout(400);
    check('ladder', 'H does nothing while practising, like the disabled Hear it button (it stopped practice for a demo)', (await attr(p, root, 'data-mode')) === 'practice', await attr(p, root, 'data-mode'));
    await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    check('ladder', 'Enter (clean) goes up a rung: 55 BPM', (await attr(p, root, 'data-tempo')) === '55', await attr(p, root, 'data-tempo'));
    const note = await p.textContent('[data-technique-note]');
    check('ladder', 'the screen says so', /Clean\. Up to 55 BPM/.test(note || ''), note);
    const rungs = await p.textContent('[data-technique-ladder]');
    check('ladder', 'the ladder shows the clean pass at once: "Best 50" (it said "No clean pass yet")', /Best 50/.test(rungs || '') && !/No clean pass yet/.test(rungs || ''), (rungs || '').slice(0, 120));
    await p.keyboard.press('n');
    await p.waitForTimeout(150);
    await p.keyboard.press('n');
    await p.waitForTimeout(300);
    check('ladder', 'two "not yet" step back to 50 BPM', (await attr(p, root, 'data-tempo')) === '50', await attr(p, root, 'data-tempo'));
    await p.keyboard.press('ArrowUp');
    await p.waitForTimeout(200);
    check('ladder', 'ArrowUp: one rung faster', (await attr(p, root, 'data-tempo')) === '55');
    await p.keyboard.press('ArrowDown');
    await p.waitForTimeout(200);
    await p.keyboard.press(' ');
    await p.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-mode') === 'idle', root, { timeout: 10000 });
    check('ladder', 'Space stops', true);
    await p.locator('[data-technique-finish]').first().click();
    await p.waitForSelector('[data-technique-summary]', { timeout: 10000 });
    const summary = await p.textContent('[data-technique-summary]');
    check('ladder', 'Finish shows the summary with XP and the best clean tempo', /XP/.test(summary) && /50/.test(summary), summary.slice(0, 160));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(1200);
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector(root, { timeout: 30000 });
    check('ladder', 'after a reload the best clean tempo (50) is kept in the learner’s progress', (await attr(p, root, 'data-best')) === '50', await attr(p, root, 'data-best'));
    check('ladder', 'and the next visit starts on a warm-up rung at the ladder start', (await attr(p, root, 'data-tempo')) === '50');
    check('ladder', 'no console errors', s.errors.length === 0, s.errors.join(' | '));
  } finally {
    await s.close();
  }
}

async function reloadGroup() {
  const s = await launch();
  const p = s.page;
  try {
    await s.goto('technique', 'tech-permutations-2');
    const root = '[data-technique-screen="exercise"]';
    await p.waitForSelector(root, { timeout: 30000 });
    await p.locator('[data-technique-primary]').first().click();
    await p.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-mode') === 'practice', root, { timeout: 15000 });
    for (let i = 0; i < 3; i++) {
      await p.locator('[data-technique-clean]').first().click();
      await p.waitForTimeout(250);
    }
    check('reload', 'three clean passes climb to 65 BPM', (await attr(p, root, 'data-tempo')) === '65', await attr(p, root, 'data-tempo'));
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector(root, { timeout: 30000 });
    check('reload', 'after a reload mid-visit the best clean tempo (60) is kept (it was lost)', (await attr(p, root, 'data-best')) === '60', await attr(p, root, 'data-best'));
    check('reload', 'and the next visit starts one rung under it, at 55', (await attr(p, root, 'data-tempo')) === '55', await attr(p, root, 'data-tempo'));
    check('reload', 'no console errors', s.errors.length === 0, s.errors.join(' | '));
  } finally {
    await s.close();
  }
}

/** The learner's saved progress, read from storage. */
const progressOf = (page) => page.evaluate(() => {
  try {
    const raw = localStorage.getItem('ssa:progress');
    return raw ? JSON.parse(raw).state : null;
  } catch {
    return null;
  }
});

async function routineEndGroup() {
  const s = await launch();
  const p = s.page;
  try {
    await p.clock.install();
    await s.goto('technique', 'tech-warm-up');
    const root = '[data-technique-screen="routine"]';
    await p.waitForSelector(root, { timeout: 30000 });
    await p.locator('[data-technique-primary]').first().click();
    await p.clock.runFor(301_000);
    await p.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-finished') === 'true', root, { timeout: 10000 });
    check('routine', 'five minutes later the warm-up is finished', true);
    const label = (await p.textContent('[data-technique-primary]')) || '';
    check('routine', 'the main button offers to start again', /Again from the top/.test(label), label);
    await p.locator('[data-technique-primary]').first().click();
    await p.clock.runFor(2_000);
    check('routine', '"Again from the top" starts again on step one (it used to finish again at once)', (await attr(p, root, 'data-finished')) === 'false' && (await attr(p, root, 'data-running')) === 'true' && (await attr(p, root, 'data-step')) === 'open-strings', `${await attr(p, root, 'data-step')} running=${await attr(p, root, 'data-running')} finished=${await attr(p, root, 'data-finished')}`);
    await p.clock.runFor(300_000);
    await p.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-finished') === 'true', root, { timeout: 10000 });
    await p.locator('[data-technique-finish]').first().click();
    await p.waitForSelector('[data-technique-summary]', { timeout: 10000 });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    check('routine', 'after saving, the screen is ready for another run (no second "Save and finish")', (await p.$('[data-technique-finish]')) === null);
    await s.goto('technique');
    await p.waitForSelector('[data-technique-screen="hub"]', { timeout: 30000 });
    await p.clock.runFor(2_000);
    const state = await progressOf(p);
    const skill = state && state.skills && state.skills['technique:tech-warm-up'];
    check('routine', 'the finished warm-up is recorded once, even after leaving (it was recorded twice)', !!skill && skill.attempts === 1 && skill.completions === 1, JSON.stringify(skill && { attempts: skill.attempts, completions: skill.completions }));
    check('routine', 'the hub then moves on from the warm-up', (await attr(p, '[data-technique-today]', 'data-technique-today')) !== 'warm-up');
    check('routine', 'no console errors (to the end)', s.errors.length === 0, s.errors.join(' | '));
  } finally {
    await s.close();
  }
}

async function largeTextGroup() {
  const s = await launch({ mobile: true, viewport: { width: 360, height: 740 }, theme: 'light' });
  const p = s.page;
  try {
    for (const route of [['technique'], ['technique', 'tech-spider'], ['technique', 'tech-bend-whole-step'], ['technique', 'tech-changes-pairs-3'], ['technique', 'tech-warm-up']]) {
      await s.goto(...route);
      await p.waitForSelector('[data-technique-screen]', { timeout: 30000 });
      await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await p.waitForTimeout(600);
      const over = await overflow(p);
      check('large', `${route.join('--')} at 200% text, 360 px: no sideways scroll (the tempo stepper pushed it 128 px)`, over <= 1, `${over}px`);
      if (!noShots && route.length === 2 && route[1] === 'tech-spider') {
        await p.evaluate(() => document.querySelector('[data-technique-ladder]')?.scrollIntoView({ block: 'center' }));
        await p.screenshot({ path: path.join(OUT, 'technique-large-text-phone.png') });
      }
    }
    // A 200-character unbroken note in the cool-down is shown back next time: it pushed the page 1168 px sideways.
    await p.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await p.clock.install();
    await s.goto('technique', 'tech-cool-down');
    await p.waitForSelector('[data-technique-screen="routine"]', { timeout: 30000 });
    for (let i = 0; i < 2; i++) await p.getByRole('button', { name: 'Skip this step' }).first().click();
    await p.getByLabel('One thing that felt tense today').fill('a'.repeat(200));
    await p.locator('[data-technique-primary]').first().click();
    await p.clock.runFor(31_000);
    await p.waitForSelector('[data-technique-finish]', { timeout: 10000 });
    await p.locator('[data-technique-finish]').first().click();
    await p.waitForSelector('[data-technique-summary]', { timeout: 10000 });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    for (let i = 0; i < 2; i++) await p.getByRole('button', { name: 'Skip this step' }).first().click();
    await p.waitForTimeout(400);
    const shown = (await p.getByText(/Last time:/).first().textContent().catch(() => '')) || '';
    const over = await overflow(p);
    check('large', 'a 200-character unbroken cool-down note is shown back and wraps (it pushed the page 1168 px)', shown.includes('a'.repeat(50)) && over <= 1, `${over}px`);
    check('large', 'no console errors', s.errors.length === 0, s.errors.join(' | '));
  } finally {
    await s.close();
  }
}

/** One microphone take of the G major scale; returns the result attributes. `click: false` turns the take's click off. */
async function scaleTakeRun(fakeAudio, { click = true } = {}) {
  const s = await launch({ fakeAudio });
  const p = s.page;
  try {
    await s.goto('technique', 'tech-alternate-scale-g');
    const root = '[data-technique-screen="exercise"]';
    await p.waitForSelector(root, { timeout: 30000 });
    await p.getByText('Check me with the microphone').first().click();
    await p.waitForTimeout(200);
    const startTempo = await attr(p, root, 'data-tempo');
    if (!click) {
      const sw = p.getByRole('switch', { name: 'Click during the take' });
      if ((await sw.getAttribute('aria-checked')) === 'true') await sw.click();
    }
    await p.locator('[data-technique-primary]').first().click();
    await p.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-mic') === 'ready', root, { timeout: 20000 });
    const meter = await p.waitForSelector('[role="meter"][aria-label="Microphone level"]', { timeout: 10000 }).then(() => true).catch(() => false);
    await p.waitForSelector('[data-technique-take]', { timeout: 45000 });
    const out = {
      verdict: await attr(p, '[data-technique-take]', 'data-technique-take'),
      text: await p.textContent('[data-technique-take]'),
      clickOffset: Number(await attr(p, '[data-technique-take]', 'data-click-offset')),
      click: await attr(p, '[data-technique-take]', 'data-click'),
      startTempo,
      tempo: await attr(p, root, 'data-tempo'),
      meter,
      errors: s.errors.slice(),
      page: p,
    };
    if (!noShots) await p.screenshot({ path: path.join(OUT, `technique-take-${out.verdict}.png`) });
    return out;
  } finally {
    await s.close();
  }
}

async function takeGroup() {
  // With the click on, a take is judged against the click itself (its first beat on the
  // microphone's clock). Where Chromium's fake microphone file lands against the click varies by
  // hundreds of ms from page to page under load, so here the browser shows that the judging is
  // wired up (the result names the click and its offset); the unit tests in model/takes.test.ts
  // show the verdicts (on the click: clean; an even take 120 ms behind: not clean).
  const probe = await scaleTakeRun(scaleTake('scale-probe', () => 0).fakeAudio);
  check('take', 'a take played to the click is judged against the click and says where it sat', Number.isFinite(probe.clickOffset) && ['with', 'ahead', 'behind'].includes(probe.click) && /the click/.test(probe.text || '') && (probe.click === 'with' || probe.verdict !== 'clean'), `${probe.verdict} (${probe.click} ${probe.clickOffset} ms): ${probe.text}`);
  // The rest are taken with the click off after the count-in (no click to line up with: evenness and tempo).
  const even = scaleTake('scale-even', () => 0);
  const r1 = await scaleTakeRun(even.fakeAudio, { click: false });
  check('take', 'an even take of the scale is judged clean', r1.verdict === 'clean' && !r1.click, `${r1.verdict}: ${r1.text}`);
  check('take', 'and the ladder climbs from 60 to 64 BPM', r1.startTempo === '60' && r1.tempo === '64', `${r1.startTempo} -> ${r1.tempo}`);
  check('take', 'it says the notes were right', /All 29 notes were right|of 29 notes/.test(r1.text || ''), r1.text);
  check('take', 'the microphone level meter shows while the take runs', r1.meter);
  check('take', 'no console errors (even take)', r1.errors.length === 0, r1.errors.join(' | '));

  const uneven = scaleTake('scale-uneven', (i) => 0.13 * jitter(i));
  const r2 = await scaleTakeRun(uneven.fakeAudio, { click: false });
  check('take', 'an uneven take (notes up to 130 ms off) is not clean', r2.verdict === 'not-yet', `${r2.verdict}: ${r2.text}`);
  check('take', 'it says how far from an even pulse the notes were', /Timing: on average \d+ ms from an even pulse/.test(r2.text || ''), r2.text);
  check('take', 'and the ladder does not climb', r2.tempo === '60', r2.tempo);
  check('take', 'no console errors (uneven take)', r2.errors.length === 0, r2.errors.join(' | '));

  // Perfect timing, one wrong note (bar 2, note 4: D4 played as C#4). It used to be "Clean" and climb.
  const wrong = scaleTake('scale-wrong-note', () => 0, 3.2, (i) => (i === 11 ? -1 : 0));
  const r3 = await scaleTakeRun(wrong.fakeAudio, { click: false });
  check('take', 'a take with one wrong note is not clean, however even', r3.verdict !== 'clean', `${r3.verdict}: ${r3.text}`);
  check('take', 'it names the bar, the note and the right pitch', /1 of 29 notes was a different note: bar 2, note 4 should be D4\./.test(r3.text || ''), r3.text);
  check('take', 'and the ladder does not climb on a wrong note', r3.tempo === '60', r3.tempo);
}

async function bendRun(fakeAudio) {
  const s = await launch({ fakeAudio });
  const p = s.page;
  try {
    await s.goto('technique', 'tech-bend-whole-step');
    const root = '[data-technique-screen="exercise"]';
    await p.waitForSelector(root, { timeout: 30000 });
    await p.getByText('Check me with the microphone').first().click();
    await p.locator('[data-technique-primary]').first().click();
    await p.waitForSelector('[data-technique-take]', { timeout: 40000 });
    const out = { verdict: await attr(p, '[data-technique-take]', 'data-technique-take'), text: await p.textContent('[data-technique-take]'), errors: s.errors.slice() };
    if (!noShots) await p.screenshot({ path: path.join(OUT, `technique-bend-${out.verdict}.png`) });
    return out;
  } finally {
    await s.close();
  }
}

async function bendGroup() {
  const short = await bendRun(bendTake('bend-short', 155).fakeAudio);
  check('bend', 'a bend 45 cents short of E is not in tune', short.verdict === 'not-yet', `${short.verdict}: ${short.text}`);
  const m = /stopped (\d+) cents short of E/.exec(short.text || '');
  check('bend', 'and the message says how far short (about 45 cents)', !!m && Math.abs(Number(m[1]) - 45) <= 12, short.text);
  const good = await bendRun(bendTake('bend-good', 200).fakeAudio);
  check('bend', 'a full whole-step bend is in tune', good.verdict === 'clean', `${good.verdict}: ${good.text}`);
  check('bend', 'no console errors', short.errors.length + good.errors.length === 0, [...short.errors, ...good.errors].join(' | '));
}

async function healthGroup() {
  const s = await launch({ mobile: true });
  const p = s.page;
  try {
    await s.goto('technique', 'tech-spider');
    await p.waitForSelector('[data-technique-screen="exercise"]', { timeout: 30000 });
    await p.evaluate(() => window.__technique.health(4 * 60));
    await p.waitForSelector('[data-technique-notice="tension"]', { timeout: 5000 });
    check('health', 'a tension check after four minutes of playing', true);
    await p.getByText('Done, all loose').click();
    await p.evaluate(() => window.__technique.health(22 * 60));
    await p.waitForSelector('[data-technique-notice="break"]', { timeout: 5000 });
    const text = await p.textContent('[data-technique-notice="break"]');
    check('health', 'a gentle break prompt after a long stretch', /You have played for 2\d minutes/.test(text), text);
    if (!noShots) await p.screenshot({ path: path.join(OUT, 'technique-break-mobile.png') });
    await p.getByText('Keep going').click();
    await p.waitForTimeout(300);
    check('health', '"Keep going" puts it away', (await p.$('[data-technique-notice="break"]')) === null);
    check('health', 'the spider carries its strain warning', (await p.$('[data-technique-strain]')) !== null);
    check('health', 'no console errors', s.errors.length === 0, s.errors.join(' | '));
  } finally {
    await s.close();
  }
}

async function routineGroup() {
  const s = await launch();
  const p = s.page;
  try {
    await s.goto('technique', 'tech-warm-up');
    const root = '[data-technique-screen="routine"]';
    await p.waitForSelector(root, { timeout: 30000 });
    check('routine', 'the warm-up opens on its first step', (await attr(p, root, 'data-step')) === 'open-strings');
    await p.locator('[data-technique-primary]').first().click();
    await p.waitForTimeout(2500);
    check('routine', 'Start runs it', (await attr(p, root, 'data-running')) === 'true');
    await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(400);
    check('routine', 'ArrowRight moves to the next step', (await attr(p, root, 'data-step')) === 'spider');
    await p.keyboard.press(' ');
    await p.waitForTimeout(400);
    check('routine', 'Space pauses', (await attr(p, root, 'data-running')) === 'false');
    check('routine', 'no console errors', s.errors.length === 0, s.errors.join(' | '));
  } finally {
    await s.close();
  }
}

async function changesGroup() {
  const s = await launch({ mobile: true });
  const p = s.page;
  try {
    await s.goto('technique', 'tech-changes-pairs-1');
    const root = '[data-technique-screen="changes"]';
    await p.waitForSelector(root, { timeout: 30000 });
    check('changes', 'opens on the first pair, Em and G', (await attr(p, root, 'data-pair')) === 'em-g');
    await p.getByText('A – D', { exact: true }).click();
    await p.waitForTimeout(300);
    check('changes', 'a pair can be picked', (await attr(p, root, 'data-pair')) === 'a-d');
    await p.locator('[data-technique-primary]').first().click();
    await p.waitForFunction((sel) => ['count-in', 'minute'].includes(document.querySelector(sel)?.getAttribute('data-phase')), root, { timeout: 15000 });
    await p.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-phase') === 'minute', root, { timeout: 15000 });
    check('changes', 'the minute starts after a count-in', true);
    if (!noShots) await p.screenshot({ path: path.join(OUT, 'technique-changes-minute-mobile.png') });
    await p.getByRole('button', { name: 'Stop' }).click();
    await p.waitForTimeout(300);
    check('changes', 'Stop ends it', (await attr(p, root, 'data-phase')) === 'ready');
    await s.goto('technique', 'tech-changes-pairs-3');
    await p.waitForSelector(root, { timeout: 30000 });
    const chips = await p.$$eval('[role="radiogroup"][aria-label="Chord pair"] [role="radio"]', (els) => els.map((e) => e.textContent.trim()));
    check('changes', 'every pair the plan names is there, D – small F♯m included (it was missing)', chips.length === 6 && chips.includes('D – small F♯m'), chips.join(' | '));
    check('changes', 'two pairs with the same chords have different names (both said "C – F")', new Set(chips).size === chips.length && chips.includes('C – small F') && chips.includes('C – barre F'), chips.join(' | '));
    check('changes', 'no console errors', s.errors.length === 0, s.errors.join(' | '));
  } finally {
    await s.close();
  }
}

async function shotsGroup() {
  const views = [
    { name: 'hub', route: ['technique'], ready: '[data-technique-screen="hub"]' },
    { name: 'exercise', route: ['technique', 'tech-alternate-chromatic'], ready: '[data-technique-screen="exercise"]' },
    { name: 'bend', route: ['technique', 'tech-bend-whole-step'], ready: '[data-technique-screen="exercise"]' },
    { name: 'warm-up', route: ['technique', 'tech-warm-up'], ready: '[data-technique-screen="routine"]' },
    { name: 'changes', route: ['technique', 'tech-changes-pairs-2'], ready: '[data-technique-screen="changes"]' },
    { name: 'tune', route: ['technique', 'tech-tune-by-ear'], ready: '[data-technique-screen="exercise"]' },
  ];
  const sizes = [
    { tag: 'phone', mobile: true },
    { tag: 'desktop', mobile: false },
    { tag: 'sideways', mobile: true, viewport: { width: 844, height: 390 }, only: ['exercise'] },
  ];
  for (const theme of ['dark', 'light']) {
    for (const size of sizes) {
      const s = await launch({ mobile: size.mobile, viewport: size.viewport, theme });
      try {
        for (const v of views) {
          if (size.only && !size.only.includes(v.name)) continue;
          if (theme === 'light' && !['hub', 'exercise'].includes(v.name)) continue;
          await s.goto(...v.route);
          await s.page.waitForSelector(v.ready, { timeout: 30000 });
          await s.page.waitForTimeout(900);
          const over = await overflow(s.page);
          check('shots', `${v.name} ${size.tag} ${theme}: no sideways scroll`, over <= 1, `${over}px`);
          if (!noShots) await s.page.screenshot({ path: path.join(OUT, `technique-${v.name}-${size.tag}-${theme}.png`), fullPage: false });
        }
        check('shots', `${size.tag} ${theme}: no console errors`, s.errors.length === 0, s.errors.join(' | '));
      } finally {
        await s.close();
      }
    }
  }
}

(async () => {
  const started = Date.now();
  if (want('take') || want('bend')) {
    sig = await loadTs('/src/core/pitch/index.ts');
    kit = await loadTs('/src/core/pitch/adversarial-kit.ts');
    content = await loadTs('/src/content/technique/index.ts');
  }
  server = await startServer();
  try {
    await group('hub', hubGroup);
    await group('ladder', ladderGroup);
    await group('reload', reloadGroup);
    await group('take', takeGroup);
    await group('bend', bendGroup);
    await group('health', healthGroup);
    await group('routine', async () => {
      await routineGroup();
      await routineEndGroup();
    });
    await group('changes', changesGroup);
    await group('large', largeTextGroup);
    if (!noShots || want('shots')) await group('shots', shotsGroup);
  } finally {
    await server.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} checks passed in ${Math.round((Date.now() - started) / 1000)} s`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL [${f.group}] ${f.name}${f.detail ? `: ${f.detail.slice(0, 300)}` : ''}`);
    console.log('FAILED');
    process.exit(1);
  }
  console.log('PASSED');
})().catch((e) => {
  console.error(e);
  console.log('FAILED');
  process.exit(1);
});
