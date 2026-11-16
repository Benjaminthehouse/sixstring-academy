#!/usr/bin/env node
/**
 * Browser check of the Theory Path (#learn), on a phone (390 px, touch) and a desktop (1280 px,
 * keyboard), in both themes:
 *
 *   phone    the map for a new learner (every unit written, the first lesson on the first screen
 *            above Continue, the switches and "Find my level" after the first unit, a locked
 *            lesson's sheet), the first lesson from "Start" to its summary (the rewards shown there),
 *            straight on to the next lesson with nothing of the last one's rewards over it, the map
 *            updated, the review of the new cards, a link to a lesson ahead (it opens with a note
 *            and a way back) and a bad link
 *   desktop  the side panel (lesson, unit list), keyboard walk, "no sound / no guitar" lesson
 *            (no listening or play step shows), the checkpoint passed with the unit celebration,
 *            a practice drill
 *   hearts   a new learner out of hearts before finishing a lesson is offered the refill drill
 *   placement "Find my level": unit 1 answered right and unit 2 with "I don't know" (unit 1 known,
 *            unlocked), and everything with "I don't know" (start at 1)
 *   layout   360 px, text at 200 %, a phone held sideways, a tablet, 1100 and 1440 px: no sideways
 *            scroll, titles on screen, stage names whole, Continue in one row, the right layout
 *
 * Answers come from the lesson engine itself (solve), read from the saved session as a learner's
 * screen shows it. Prints PASSED or FAILED; exits non-zero on failure. Screenshots: e2e/out/learn-*.png
 *
 *   node e2e/learn.cjs [--verbose] [--only phone,hearts,desktop,placement,layout]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { withApp, loadTs, ROOT } = require('./lib/harness.cjs');
const lib = require('./lessons-lib.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',') : null;
const want = (name) => !only || only.includes(name);
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass, detail: String(detail || '') });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail ? `  (${String(detail).slice(0, 300)})` : ''}`);
  return !!pass;
}

const PLAY_TYPES = new Set(['play-note', 'play-chord', 'play-phrase']);
const LISTEN_TYPES = new Set(['listen-choice', 'tap-rhythm']);
const UNIT = 'sound-and-pitch';
const FIRST = 'a-sound-is-a-vibration';
const SECOND = 'pitch-high-and-low';

async function seed(page, extra = {}) {
  await page.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
  }, { 'ssa:shell.onboarding': '{"skipped":true}', ...extra });
}

async function open(page, url, route, selector = '[data-learn-map], [data-lesson-player], [data-placement], [data-session-message]') {
  await page.goto(`${url}#${route}`, { waitUntil: 'load' });
  await page.waitForSelector('main[data-route]', { timeout: 60000 });
  await page.waitForSelector(selector, { timeout: 60000 });
  await page.waitForTimeout(600);
}

/** Tap on a phone, click on a desktop. */
async function act(page, selector, how) {
  if (how === 'touch') return lib.tap(page, selector);
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await el.click();
  await page.waitForTimeout(60);
}

/** Close the shell's own dialogs (a new level, a streak milestone) that a finished activity may open. */
async function dismissDialogs(page) {
  for (let i = 0; i < 4; i++) {
    const open = await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').count();
    if (open === 0) return;
    if (verbose) console.log(`    closing: ${(await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').first().innerText()).replace(/\n/g, ' ').slice(0, 80)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

async function noSideScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** The stored progress (after the store's debounced save has run). */
async function stored(page) {
  await page.waitForTimeout(900);
  return lib.storedProgress(page);
}

async function nodeState(page, id) {
  return page.getAttribute(`[data-node="${id}"]`, 'data-state');
}

/**
 * Play the session on screen to its summary with right answers. Play steps take "I can't play
 * right now" (no microphone here). Returns the exercise types that were shown.
 */
async function playToSummary(page, L, how, mode, { keepDialogs = false } = {}) {
  const types = [];
  for (let guard = 0; guard < 90; guard++) {
    const kind = await lib.onScreen(page);
    if (kind === 'summary') {
      if (keepDialogs) return types;
      await page.waitForTimeout(700);
      await dismissDialogs(page);
      return types;
    }
    const id = await lib.stepId(page);
    if (kind === 'card' || kind === null) {
      if (kind === null) {
        await page.waitForTimeout(200);
        continue;
      }
      if (how === 'touch') await lib.tap(page, lib.sel.cont);
      else await lib.press(page, 'Enter');
      await lib.waitForNewStep(page, id);
      continue;
    }
    const type = await page.getAttribute('[data-exercise-type]', 'data-exercise-type');
    types.push(type);
    const state = await lib.savedSession(page, L, mode);
    if (!state) {
      // Nothing saved yet (a session that opens on a question): rate or skip, it comes back.
      if (type === 'flashcard') {
        await act(page, '[data-player-bar] [data-action="primary"]', how);
        await act(page, '[data-rating="good"]', how);
      } else if (PLAY_TYPES.has(type)) {
        types.pop();
        await act(page, '[data-cant-play]', how);
        if (how === 'keys') await page.evaluate(() => document.activeElement && document.activeElement.blur());
      } else {
        await act(page, '[data-action="skip"]', how);
        await page.waitForSelector('[data-feedback]', { timeout: 15000 });
        await act(page, lib.sel.cont, how);
      }
      await lib.waitForNewStep(page, id);
      continue;
    }
    const step = L.currentStep(state);
    if (!step || step.kind !== 'exercise') throw new Error(`No saved exercise for ${id}`);
    const ex = step.exercise;
    if (verbose) console.log(`    ${mode} ${id}: ${ex.type}`);
    if (PLAY_TYPES.has(ex.type)) {
      await act(page, '[data-cant-play]', how);
      // A clicked button keeps the focus; Enter on it would press whatever button takes its place.
      if (how === 'keys') await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await lib.waitForNewStep(page, id);
      types.pop();
      continue;
    }
    const answer = L.solve(ex);
    if (how === 'keys' && ex.type === 'listen-choice') {
      // Number keys do not reach listen-choice options (its Space handler replaces the options'
      // keys in the step registry; reported to the lessons UI): click the option instead.
      for (const i of answer.selected) await page.locator(`[data-option="${i}"]`).click();
    } else {
      const ok = await lib.giveAnswer(page, L, step, answer, how);
      if (!ok) throw new Error(`Could not answer a ${ex.type} by ${how}`);
    }
    if (ex.type !== 'flashcard') {
      if (how === 'touch') await lib.tap(page, '[data-player-bar] [data-action="check"]');
      else await lib.press(page, 'Enter');
      await page.waitForSelector('[data-feedback]', { timeout: 20000 });
      const tone = await page.getAttribute('[data-feedback]', 'data-feedback');
      if (tone !== 'ok') throw new Error(`A right ${ex.type} answer was marked ${tone}: ${(await page.locator('[data-feedback]').innerText()).slice(0, 200)}`);
      if (how === 'touch') await lib.tap(page, lib.sel.cont);
      else await lib.press(page, 'Enter');
    }
    await lib.waitForNewStep(page, id);
  }
  throw new Error(`The ${mode} did not end`);
}

async function runPhone(L) {
  const group = 'phone';
  await withApp({ mobile: true, theme: 'dark' }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'learn');
    await page.waitForSelector(`[data-node="${FIRST}"][data-state="current"]`, { timeout: 30000 });
    check(group, 'the map opens with the first lesson up next', (await nodeState(page, FIRST)) === 'current');
    check(group, 'every other lesson of unit 1 is locked', (await nodeState(page, SECOND)) === 'locked');
    check(group, 'three stages', (await page.locator('[data-stage]').count()) === 3);
    check(group, 'every unit of the path is written: none is listed as coming soon', (await page.locator('[data-coming-soon]').count()) === 0);
    check(group, 'no sideways scroll', (await noSideScroll(page)) <= 1, await noSideScroll(page));
    const bar = await page.locator('[data-continue-bar]').boundingBox();
    const vh = page.viewportSize().height;
    check(group, 'Continue waits in the thumb zone', bar && bar.y > vh * 0.6, bar && `${Math.round(bar.y)} of ${vh}`);
    const barText = await page.locator('[data-continue-bar]').innerText();
    check(group, 'it names the lesson', /A sound is a vibration/.test(barText), barText.replace(/\n/g, ' '));
    const firstNode = await page.locator(`[data-node="${FIRST}"]`).boundingBox();
    const top = await page.evaluate(() => window.scrollY);
    check(group, 'a new learner sees the top of the page first', top < 20, top);
    await page.screenshot({ path: path.join(OUT, 'learn-phone-dark.png') });
    // Review bug: the first lesson sat about 700 px down a 390 px phone, under the switches and "Find my level".
    check(group, 'the first lesson is on the first screen, above the Continue bar', firstNode && bar && firstNode.y >= 52 && firstNode.y + firstNode.height <= bar.y, firstNode && bar && `${Math.round(firstNode.y)}-${Math.round(firstNode.y + firstNode.height)} / bar ${Math.round(bar.y)}`);
    const offer = await page.locator('[data-placement-offer]').boundingBox();
    check(group, 'for a new learner "Find my level" and the switches come after the first unit', offer && firstNode && offer.y > firstNode.y && (await page.locator('[data-first-run] [data-conditions]').count()) === 1, offer && Math.round(offer.y));
    // Phones select nothing (a tap opens a sheet): no node is a pressed toggle with a ring around it.
    const pressed = await page.locator('[data-node][aria-pressed]').count();
    check(group, 'no node wears a selection ring on a phone', pressed === 0, pressed);

    // A locked lesson: its card says what to finish first and offers the test-out.
    await lib.tap(page, `[data-node="${SECOND}"]`);
    await page.waitForSelector(`[role="dialog"] [data-details="${SECOND}"]`, { timeout: 10000 });
    const sheet = await page.locator('[role="dialog"]').innerText();
    check(group, 'a locked lesson says what to finish first', /Finish “A sound is a vibration” first/.test(sheet), sheet.replace(/\n/g, ' ').slice(0, 200));
    check(group, 'and offers to test out of the unit', /Test out/.test(sheet));
    check(group, 'and says what it needs', /No guitar needed/.test(sheet) && /Has listening/.test(sheet));
    await page.screenshot({ path: path.join(OUT, 'learn-phone-sheet.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // One tap to start; the lesson runs full screen.
    await lib.tap(page, '[data-continue]');
    await page.waitForSelector('[data-lesson-player]', { timeout: 60000 });
    check(group, 'Start opens the lesson at its address', (await page.evaluate(() => location.hash)) === `#learn--${UNIT}--${FIRST}`);
    check(group, 'the lesson is immersive (no tab bar)', (await page.getAttribute('[data-immersive]', 'data-immersive')) === 'focus');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'learn-phone-lesson.png') });
    const types = await playToSummary(page, L, 'touch', 'lesson', { keepDialogs: true });
    check(group, 'the first lesson runs to its summary', (await lib.onScreen(page)) === 'summary', types.join(' '));
    // The rewards are felt on the summary (the shell's card, or a new level's dialog first).
    let felt = false;
    for (let i = 0; i < 20 && !felt; i++) {
      felt = await page.evaluate(() => !!document.querySelector('[role="dialog"]') || [...document.querySelectorAll('[data-toast]')].some((t) => (t.getAttribute('data-toast') || '').startsWith('shell-')));
      if (!felt) await page.waitForTimeout(150);
    }
    check(group, 'the summary shows the rewards', felt);
    await page.screenshot({ path: path.join(OUT, 'learn-phone-summary.png') });
    const progress = await stored(page);
    check(group, 'the lesson is recorded as done', progress && progress.skills[`theory:${UNIT}:${FIRST}`]?.completed === true);
    const cards = progress ? Object.keys(progress.srs.items).filter((k) => k.startsWith('theory-path:')) : [];
    check(group, 'its three facts became review cards', cards.length === 3, cards.join(' '));

    // Straight on to the next lesson (the learner answers the level dialog and taps Next at once):
    // nothing of the last lesson's rewards covers the new lesson's first card. It used to, for seconds.
    for (let i = 0; i < 3 && (await page.locator('[role="dialog"]').count()) > 0; i++) {
      // Forced: the confetti over the dialog keeps Playwright's "stable" check waiting; a finger is not.
      await page.locator('[role="dialog"]').getByRole('button', { name: /^(Keep going|Next)$/ }).first().tap({ force: true });
      await page.waitForTimeout(80);
    }
    await lib.tap(page, '[data-action="next"]');
    await page.waitForSelector('[data-lesson-player][data-phase="step"]', { timeout: 60000 });
    check(group, 'Next opens the next lesson', (await page.evaluate(() => location.hash)) === `#learn--${UNIT}--${SECOND}`);
    const covered = [];
    for (let i = 0; i < 16; i++) {
      covered.push(...(await page.evaluate(() => [
        ...[...document.querySelectorAll('[data-toast]')].filter((t) => (t.getAttribute('data-toast') || '').startsWith('shell-') && getComputedStyle(t).opacity !== '0').map((t) => t.getAttribute('data-toast')),
        ...(document.querySelector('[role="dialog"]') ? ['dialog'] : []),
      ])));
      if (i === 3) await page.screenshot({ path: path.join(OUT, 'learn-phone-next-lesson.png') });
      await page.waitForTimeout(250);
    }
    check(group, "for 4 s nothing of the last lesson's rewards covers the next lesson", covered.length === 0, [...new Set(covered)].join(' '));

    await open(page, url, `learn--${UNIT}`);
    await page.waitForTimeout(600);
    check(group, 'back on the map, the lesson is done', (await nodeState(page, FIRST)) === 'done');
    check(group, 'and the next one is up next', (await nodeState(page, SECOND)) === 'current');
    check(group, 'the address names the unit', (await page.evaluate(() => location.hash)) === `#learn--${UNIT}`);
    const strip = await page.locator('[data-stage-jump="beginner"]').innerText();
    check(group, 'the stage counts it', /1\/6/.test(strip), strip.replace(/\n/g, ' '));
    check(group, 'Continue now points at the second lesson', (await page.getAttribute('[data-continue]', 'data-continue')) === SECOND);
    await page.screenshot({ path: path.join(OUT, 'learn-phone-after.png') });

    // The daily review: the new cards are due.
    await page.waitForSelector('[data-review-start]', { timeout: 20000 });
    const due = await page.getAttribute('[data-review-entry]', 'data-review-entry');
    check(group, 'the review card shows the due cards', Number(due) === 3, due);
    await lib.tap(page, '[data-review-start]');
    await page.waitForSelector('[data-lesson-player][data-mode="review"]', { timeout: 30000 });
    check(group, 'the review opens at #learn--review', (await page.evaluate(() => location.hash)) === '#learn--review');
    await playToSummary(page, L, 'touch', 'review');
    const after = await stored(page);
    const graded = after ? Object.entries(after.srs.items).filter(([k, v]) => k.startsWith('theory-path:') && v.state !== 'new').length : 0;
    check(group, 'every card was graded', graded === 3, graded);
    await lib.tap(page, '[data-action="next"]');
    await page.waitForSelector('[data-learn-map]', { timeout: 30000 });
    check(group, 'after the review, back on the map', (await page.evaluate(() => location.hash)).startsWith('#learn'));

    // A link to a lesson the learner has not reached (a teacher's theory link): it runs, with a note
    // saying it is ahead and a way back to where they are.
    await open(page, url, `learn--${UNIT}--the-octave`, '[data-lesson-player]');
    await page.waitForSelector('[data-ahead]', { timeout: 30000 });
    const ahead = await page.locator('[data-ahead]').innerText();
    check(group, 'a lesson ahead of the learner opens, saying it is ahead', /ahead of where you are/.test(ahead) && (await page.locator('[data-lesson-player][data-phase="step"]').count()) === 1, ahead.replace(/\n/g, ' ').slice(0, 200));
    await page.screenshot({ path: path.join(OUT, 'learn-phone-ahead.png') });
    await lib.tap(page, '[data-ahead-back]');
    await page.waitForSelector('[data-learn-map]', { timeout: 30000 });
    check(group, 'and its way back leads to where the learner is', (await page.evaluate(() => location.hash)) === `#learn--${UNIT}`, await page.evaluate(() => location.hash));
    // Links that cannot run say so and lead back.
    await open(page, url, 'learn--nope--nope');
    const badText = await page.locator('main').innerText();
    check(group, 'an unknown lesson says so and offers the path', /not on the path/.test(badText) && /Back to the path/.test(badText), badText.replace(/\n/g, ' ').slice(0, 160));
    await lib.tap(page, 'button:has-text("Back to the path")');
    await page.waitForSelector('[data-learn-map]', { timeout: 30000 });

    // Out of hearts: no dead end, the way to refill them instead.
    await page.evaluate(async () => {
      const p = await import('/src/core/progress/index.ts');
      const a = p.createActions(p.getProgressStore);
      for (let i = 0; i < 5; i++) a.loseHeart();
    });
    await page.waitForTimeout(500);
    await lib.tap(page, '[data-continue]');
    await page.waitForSelector('[role="dialog"] [data-refill]', { timeout: 10000 });
    const empty = await page.locator('[role="dialog"]').innerText();
    check(group, 'with no hearts, Continue explains and offers a refill', /No hearts left/.test(empty) && /Practise to refill hearts/.test(empty), empty.replace(/\n/g, ' ').slice(0, 200));
    await page.screenshot({ path: path.join(OUT, 'learn-phone-no-hearts.png') });
    await lib.tap(page, '[role="dialog"] [data-refill]');
    await page.waitForSelector('[data-lesson-player][data-mode="practice"]', { timeout: 60000 });
    check(group, 'the refill is a practice drill of a finished unit', (await page.evaluate(() => location.hash)) === `#learn--${UNIT}--practice`);
    await playToSummary(page, L, 'touch', 'practice');
    const hearts = (await stored(page))?.hearts?.count;
    check(group, 'a finished drill refills the hearts', hearts === 5, hearts);
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

/**
 * Out of hearts before finishing a single lesson (five slips in the first one): the path still
 * offers the refill drill, on the unit the learner is in, and it refills the hearts. This used to
 * be a dead end ("practise a unit you have finished lessons in", with nothing finished).
 */
async function runHearts(L) {
  const group = 'hearts';
  await withApp({ mobile: true, theme: 'light', viewport: { width: 360, height: 740 } }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'learn');
    await page.waitForSelector(`[data-node="${FIRST}"][data-state="current"]`, { timeout: 30000 });
    await page.evaluate(async () => {
      const p = await import('/src/core/progress/index.ts');
      const a = p.createActions(p.getProgressStore);
      for (let i = 0; i < 5; i++) a.loseHeart();
    });
    await page.waitForTimeout(500);
    await lib.tap(page, '[data-continue]');
    await page.waitForSelector(`[role="dialog"] [data-details="${FIRST}"]`, { timeout: 10000 });
    const sheet = await page.locator('[role="dialog"]').innerText();
    const refill = await page.locator('[role="dialog"] [data-refill]').count();
    check(group, 'a new learner with no hearts is offered the refill drill', refill === 1 && /No hearts left/.test(sheet), sheet.replace(/\n/g, ' ').slice(0, 200));
    check(group, 'the card does not ask for a finished unit they do not have', !/finished lessons in/.test(sheet));
    await page.screenshot({ path: path.join(OUT, 'learn-hearts-new-learner.png') });
    if (refill === 0) return;
    await lib.tap(page, '[role="dialog"] [data-refill]');
    await page.waitForSelector('[data-lesson-player][data-mode="practice"]', { timeout: 60000 });
    check(group, 'the drill runs on the unit they are in', (await page.evaluate(() => location.hash)) === `#learn--${UNIT}--practice`);
    await playToSummary(page, L, 'touch', 'practice');
    const hearts = (await stored(page))?.hearts?.count;
    check(group, 'and refills the hearts', hearts === 5, hearts);
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

async function runDesktop(L) {
  const group = 'desktop';
  await withApp({ mobile: false, theme: 'light' }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'learn');
    await page.waitForSelector(`[data-details="${FIRST}"]`, { timeout: 30000 });
    check(group, 'the side panel shows the next lesson', true);
    check(group, 'and its unit, lesson by lesson', (await page.locator(`[data-panel-unit="${UNIT}"] [data-row]`).count()) === 6);
    const ringed = await page.evaluate(() => [...document.querySelectorAll('[data-node][aria-pressed="true"]')].map((n) => n.getAttribute('data-node')));
    check(group, 'the lesson in the panel is the one ringed on the map', ringed.length === 1 && ringed[0] === 'a-sound-is-a-vibration', ringed.join(' '));
    check(group, 'no sideways scroll', (await noSideScroll(page)) <= 1, await noSideScroll(page));
    await page.screenshot({ path: path.join(OUT, 'learn-desktop-light.png') });

    // Pick a lesson in the panel's list; walk the path with the keyboard.
    await page.locator(`[data-row="tone-colour"]`).click();
    await page.waitForSelector('[data-details="tone-colour"]');
    check(group, 'a lesson picked in the list shows its card', true);
    await page.locator('[data-node="tone-colour"]').focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    check(group, 'arrow keys walk the path', (await page.evaluate(() => document.activeElement?.getAttribute('data-node'))) === 'the-octave');
    check(group, 'and the panel follows', (await page.locator('[data-details="the-octave"]').count()) === 1);

    // On the go: no sound, no guitar.
    await page.locator('[data-toggle="sound"]').click();
    await page.locator('[data-toggle="guitar"]').click();
    await page.waitForTimeout(200);
    const line = await page.locator('[data-conditions]').innerText();
    check(group, 'turning sound off says what changes', /listening questions are left out/.test(line), line.replace(/\n/g, ' '));
    await page.evaluate(async (skill) => {
      const p = await import('/src/core/progress/index.ts');
      p.createActions(p.getProgressStore).markSkill(skill, { completed: true });
    }, `theory:${UNIT}:${FIRST}`);
    await page.waitForSelector(`[data-node="${SECOND}"][data-state="current"]`, { timeout: 10000 });
    await page.locator(`[data-node="${SECOND}"]`).click();
    await page.waitForSelector(`[data-details="${SECOND}"]`);
    const details = await page.locator(`[data-details="${SECOND}"]`).innerText();
    check(group, 'the lesson card says its listening is left out', /Listening left out/.test(details), details.replace(/\n/g, ' ').slice(0, 200));
    await page.screenshot({ path: path.join(OUT, 'learn-desktop-quiet.png') });
    await page.locator(`[data-start="${SECOND}"]`).click();
    await page.waitForSelector('[data-lesson-player]', { timeout: 60000 });
    const quietTypes = await playToSummary(page, L, 'keys', 'lesson');
    check(group, 'without sound no listening question is asked', quietTypes.length > 0 && !quietTypes.some((t) => LISTEN_TYPES.has(t)), quietTypes.join(' '));
    check(group, 'without the guitar no play step is asked', !quietTypes.some((t) => PLAY_TYPES.has(t)), quietTypes.join(' '));
    check(group, 'and the lesson still counts', (await stored(page))?.skills[`theory:${UNIT}:${SECOND}`]?.completed === true);
    await page.locator('[data-action="exit"]').click();
    await page.waitForSelector('[data-learn-map]', { timeout: 30000 });
    await page.locator('[data-toggle="sound"]').click();
    await page.locator('[data-toggle="guitar"]').click();

    // Test out of the unit: the checkpoint, then the celebration.
    await page.locator(`[data-checkpoint="${UNIT}"]`).first().click();
    await page.waitForSelector('[data-lesson-player][data-mode="checkpoint"]', { timeout: 60000 });
    await playToSummary(page, L, 'keys', 'checkpoint');
    const cpSummary = await page.locator('[data-summary]').getAttribute('data-summary');
    check(group, 'the checkpoint is passed', cpSummary === 'completed', cpSummary);
    await page.locator('[data-action="next"]').click();
    await page.waitForSelector(`[data-unit-complete="${UNIT}"]`, { timeout: 20000 });
    const hero = await page.locator('[data-unit-complete]').innerText();
    check(group, 'finishing the unit is celebrated', /Unit 1 complete/i.test(hero) && /Sound and pitch/.test(hero), hero.replace(/\n/g, ' ').slice(0, 200));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'learn-desktop-unit-complete.png') });
    await page.locator('[data-action="path"]').first().click();
    await page.waitForSelector('[data-learn-map]', { timeout: 30000 });
    await page.waitForTimeout(500);
    const states = await page.evaluate(() => [...document.querySelectorAll('[data-unit="sound-and-pitch"] [data-node]')].map((n) => n.getAttribute('data-state')));
    check(group, 'every lesson of the unit is done', states.length === 6 && states.every((s) => s === 'done'), states.join(' '));
    check(group, 'the unit header says so', /Unit complete/.test(await page.locator(`[data-unit="${UNIT}"] header`).innerText()));

    // Practise the finished unit.
    await page.locator(`[data-practice="${UNIT}"]`).first().click();
    await page.waitForSelector('[data-lesson-player][data-mode="practice"]', { timeout: 60000 });
    await playToSummary(page, L, 'keys', 'practice');
    check(group, 'the practice drill runs to its summary', (await lib.onScreen(page)) === 'summary');
    await page.locator('[data-action="next"], [data-action="exit"]').first().click();
    await page.waitForSelector('[data-learn-map]', { timeout: 30000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'learn-desktop-done-light.png') });
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });

  await withApp({ mobile: false, theme: 'dark' }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'learn');
    await page.waitForSelector(`[data-details="${FIRST}"]`, { timeout: 30000 });
    await page.screenshot({ path: path.join(OUT, 'learn-desktop-dark.png') });
    check('desktop', 'dark theme opens cleanly', errors.length === 0, errors.join(' | '));
  });
}

/**
 * Answer the placement question on screen: right (`solve`) or "I don't know". `right` may be a
 * function of the unit being checked. A tap-rhythm question (timed taps, checked by
 * e2e/lessons.cjs) is answered "I don't know".
 */
async function answerPlacement(page, L, rightFor) {
  const raw = await page.getAttribute('[data-question]', 'data-question');
  const id = await lib.stepId(page);
  if (!raw) throw new Error('No placement question on screen');
  const { exercise, presentation } = JSON.parse(raw);
  const unit = await page.getAttribute('[data-checking]', 'data-checking');
  const right = (typeof rightFor === 'function' ? rightFor(unit) : rightFor) && exercise.type !== 'tap-rhythm';
  if (right) {
    const ok = await lib.giveAnswer(page, L, { exercise, presentation }, L.solve(exercise), 'touch');
    if (!ok) throw new Error(`Could not answer a ${exercise.type}`);
    await lib.tap(page, '[data-player-bar] [data-action="check"]');
  } else {
    await lib.tap(page, '[data-player-bar] [data-action="skip"]');
  }
  await page.waitForSelector('[data-feedback]', { timeout: 15000 });
  const tone = await page.getAttribute('[data-feedback]', 'data-feedback');
  await lib.tap(page, lib.sel.cont);
  for (let i = 0; i < 100; i++) {
    if ((await page.locator('[data-placement="result"]').count()) > 0) break;
    if ((await lib.stepId(page)) !== id) break;
    await page.waitForTimeout(80);
  }
  return { type: exercise.type, tone, unit, right };
}

async function runPlacement(L) {
  const group = 'placement';
  await withApp({ mobile: true, theme: 'light' }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'learn');
    await lib.tap(page, '[data-placement-start]');
    await page.waitForSelector('[data-placement="intro"]', { timeout: 30000 });
    await page.screenshot({ path: path.join(OUT, 'learn-placement-intro.png') });
    await lib.tap(page, '[data-placement-begin]');
    await page.waitForSelector('[data-question]', { timeout: 30000 });
    await page.screenshot({ path: path.join(OUT, 'learn-placement-question.png') });
    const asked = [];
    // Unit 1 known, unit 2 not: every unit is written now, so right answers alone would go on and on.
    for (let i = 0; i < 12 && (await page.locator('[data-placement="result"]').count()) === 0; i++) asked.push(await answerPlacement(page, L, (unit) => unit === UNIT));
    const rights = asked.filter((a) => a.right);
    check(group, 'right answers are marked right', rights.length > 0 && rights.every((a) => a.tone === 'ok'), asked.map((a) => `${a.unit}:${a.type}:${a.tone}`).join(' '));
    await page.waitForSelector('[data-placement="result"]', { timeout: 15000 });
    check(group, 'two right answers pass a unit', rights.filter((a) => a.unit === UNIT).length === 2, asked.map((a) => `${a.unit}:${a.right}`).join(' '));
    check(group, 'it finds the level: unit 1 known', (await page.getAttribute('[data-placement="result"]', 'data-known')) === '1');
    await page.screenshot({ path: path.join(OUT, 'learn-placement-result.png') });
    check(group, 'nothing is marked before the learner says so', !Object.values((await stored(page))?.skills ?? {}).some((s) => s.completed));
    await lib.tap(page, '[data-placement-apply]');
    await page.waitForSelector('[data-learn-map]', { timeout: 30000 });
    await page.waitForTimeout(600);
    const states = await page.evaluate(() => [...document.querySelectorAll('[data-unit="sound-and-pitch"] [data-node]')].map((n) => n.getAttribute('data-state')));
    check(group, '"Mark them done" unlocks the units up to the level', states.length === 6 && states.every((s) => s === 'done'), states.join(' '));
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });

  await withApp({ mobile: true, theme: 'dark' }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'learn--placement', '[data-placement]');
    await lib.tap(page, '[data-placement-begin]');
    await page.waitForSelector('[data-question]', { timeout: 30000 });
    const asked = [];
    for (let i = 0; i < 12 && (await page.locator('[data-placement="result"]').count()) === 0; i++) asked.push(await answerPlacement(page, L, false));
    await page.waitForSelector('[data-placement="result"]', { timeout: 15000 });
    check(group, '"I don\'t know" twice settles it at the beginning', asked.length === 2 && (await page.getAttribute('[data-placement="result"]', 'data-known')) === '0', asked.length);
    const text = await page.locator('[data-placement="result"]').innerText();
    check(group, 'and says to start at the beginning', /Start at the beginning/.test(text), text.replace(/\n/g, ' ').slice(0, 120));
    await page.screenshot({ path: path.join(OUT, 'learn-placement-start-dark.png') });
    await lib.tap(page, '[data-placement-first]');
    await page.waitForSelector('[data-lesson-player]', { timeout: 60000 });
    check(group, '"Start Unit 1" opens its first lesson', (await page.evaluate(() => location.hash)) === `#learn--${UNIT}--${FIRST}`);
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

async function runLayout() {
  const group = 'layout';
  const cases = [
    { name: '360-light', mobile: true, viewport: { width: 360, height: 740 }, theme: 'light' },
    // The learner's text at twice the size (the browser's text-size setting).
    { name: 'text-200', mobile: true, viewport: { width: 390, height: 844 }, theme: 'light', text: '200%' },
    { name: 'sideways', mobile: true, viewport: { width: 844, height: 390 }, theme: 'dark' },
    { name: 'tablet', mobile: true, viewport: { width: 820, height: 1180 }, theme: 'light' },
    { name: '1100', mobile: false, viewport: { width: 1100, height: 800 }, theme: 'dark' },
    { name: '1440', mobile: false, viewport: { width: 1440, height: 900 }, theme: 'light' },
  ];
  for (const c of cases) {
    await withApp({ mobile: c.mobile, viewport: c.viewport, theme: c.theme }, async ({ page, url, errors }) => {
      await seed(page);
      if (c.text) await page.addInitScript((size) => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = size; }), c.text);
      await open(page, url, 'learn');
      await page.waitForSelector(`[data-node="${FIRST}"]`, { timeout: 30000 });
      const layout = await page.getAttribute('[data-learn-map]', 'data-layout');
      // Stage names are whole: never cut to "Intermedi…" or broken mid-word (they were at 360 px and 200 %).
      const strip = await page.evaluate(() => [...document.querySelectorAll('[data-stage-jump]')].map((b) => {
        const t = b.firstElementChild;
        return { text: t.textContent, clipped: t.scrollWidth > t.clientWidth + 1, height: Math.round(t.getBoundingClientRect().height) };
      }));
      // A new learner on a phone has no stage strip (the first stage's header says the same, nearer the first lesson).
      if (layout === 'phone') check(group, `${c.name}: a new learner's phone map starts with the path, no stage strip`, strip.length === 0 && (await page.locator('[data-first-run]').count()) === 1, JSON.stringify(strip));
      else check(group, `${c.name}: stage names are whole, one line each`, strip.length === 3 && strip.every((s) => !s.clipped) && new Set(strip.map((s) => s.height)).size === 1, JSON.stringify(strip));
      if (layout === 'phone') {
        const node = await page.locator(`[data-node="${FIRST}"]`).boundingBox();
        const cb = await page.locator('[data-continue-bar]').boundingBox();
        check(group, `${c.name}: the first lesson is on screen, above the Continue bar`, node && cb && node.y >= 0 && node.y + node.height <= cb.y + 1, node && cb && `${Math.round(node.y)}-${Math.round(node.y + node.height)} / bar ${Math.round(cb.y)}`);
        const bar = await page.evaluate(() => {
          const b = document.querySelector('[data-continue-bar]').getBoundingClientRect();
          const q = document.querySelector('[data-continue]').getBoundingClientRect();
          return { oneRow: Math.abs((q.top + q.bottom) / 2 - (b.top + b.bottom) / 2) < 8, inside: q.left >= 0 && q.right <= innerWidth + 1 && q.bottom <= innerHeight + 1, h: Math.round(b.height) };
        });
        check(group, `${c.name}: Continue is on screen`, bar.inside, JSON.stringify(bar));
        // At the normal text size the bar is one row (it took two at 360 px).
        if (!c.text) check(group, `${c.name}: the Continue bar is one row`, bar.oneRow, JSON.stringify(bar));
      }
      check(group, `${c.name}: no sideways scroll`, (await noSideScroll(page)) <= 1, await noSideScroll(page));
      check(group, `${c.name}: ${layout === 'wide' ? 'the side panel' : 'Continue'} is there`, layout === 'wide' ? (await page.locator('[data-details]').count()) === 1 : (await page.locator('[data-continue]').count()) === 1, layout);
      const labels = await page.evaluate(() => {
        // Node titles stay inside the page.
        const w = document.documentElement.clientWidth;
        return [...document.querySelectorAll('[data-unit] li')].filter((li) => {
          const r = li.getBoundingClientRect();
          return r.width > 0 && (r.left < -1 || r.right > w + 1);
        }).length;
      });
      check(group, `${c.name}: lesson titles stay on screen`, labels === 0, labels);
      await page.screenshot({ path: path.join(OUT, `learn-layout-${c.name}.png`) });
      check(group, `${c.name}: no console errors`, errors.length === 0, errors.join(' | '));
    });
  }
}

(async () => {
  const L = await loadTs('/src/lessons/index.ts');
  const runs = [
    ['phone', runPhone],
    ['hearts', runHearts],
    ['desktop', runDesktop],
    ['placement', runPlacement],
    ['layout', runLayout],
  ];
  for (const [name, run] of runs) {
    if (!want(name)) continue;
    console.log(`- ${name}`);
    try {
      await run(L);
    } catch (e) {
      check(name, 'ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
    }
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL [${f.group}] ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
    console.log('FAILED');
    process.exit(1);
  }
  console.log('PASSED');
})().catch((e) => {
  console.error(e);
  console.log('FAILED');
  process.exit(1);
});
