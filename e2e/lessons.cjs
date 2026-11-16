#!/usr/bin/env node
/**
 * Browser check of the lesson player, run against the demo course. Run: node e2e/lessons.cjs
 * [--only touch,keys,hearts,refused,rhythm,map,layout,review] [--verbose]
 *
 *  touch    phone (390 x 844, touch): a whole lesson by taps, with a fake microphone playing
 *           the right note (a plucked A2 made with the pitch module's test signals). Two
 *           answers wrong on purpose: they come back, hearts drop, the summary's accuracy, XP
 *           and review cards are right, progress is stored (XP, the skill, the review cards),
 *           a reload in the middle picks the lesson up where it was, "Next lesson" leads on.
 *  keys     desktop (1280 x 800): the same lesson by keyboard alone (number keys, letters,
 *           Enter, Escape for the leave dialog), one answer wrong, the microphone again.
 *  hearts   phone: wrong answers until the hearts run out; the lesson ends kindly and offers a
 *           practice round, which refills them.
 *  refused  phone, no microphone: the play step shows MediaBlocked and offers the tapping
 *           version, which then works; "I can't play right now" swaps a play step too.
 *  rhythm   desktop: a tap-rhythm exercise tapped with the Space key along the count-in.
 *  map      the course map: the current lesson is marked, its card opens and starts it, a
 *           checkpoint is offered, keyboard arrows walk the nodes; the review card.
 *  layout   every exercise type in the player at 360 px and 1280 px, dark and light: nothing
 *           wider than the screen, nothing under the bottom bar; screenshots in e2e/out/.
 *  review   what an outside review caught: one "Picked up" toast that leaves at the first move;
 *           "End lesson now" says the place is not kept (and it is not); bad gallery links say
 *           so; the map's Start bubble covers no title (phone and desktop, with progress); with
 *           text at 200 % the Check button keeps its words and map titles stay off the nodes.
 *
 * Prints PASSED or FAILED and exits non-zero on failure. Timing steps are retried, because the
 * machine may be busy.
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
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}

const SEED = { 'ssa:shell.onboarding': '{"skipped":true}' };
const PLAY_TYPES = new Set(['play-note', 'play-chord', 'play-phrase']);
const TYPES = ['choice', 'true-false', 'match-pairs', 'order', 'fill-blanks', 'type-answer', 'listen-choice', 'tap-rhythm', 'fretboard-find', 'fretboard-name', 'chord-build', 'staff-read', 'staff-place', 'play-note', 'play-chord', 'play-phrase', 'flashcard'];

async function seed(page) {
  await page.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
  }, SEED);
}

async function open(page, url, route) {
  await page.goto(`${url}#${route}`, { waitUntil: 'load' });
  await page.waitForSelector('main[data-route]', { timeout: 60000 });
  await page.waitForSelector('[data-lesson-player], [data-course-map], [data-preview]', { timeout: 60000 });
  await page.waitForTimeout(500);
}

async function heartsShown(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-hearts]');
    return el ? Number(el.getAttribute('data-hearts')) : null;
  });
}

/**
 * Play the lesson on screen to its summary. `wrong` lists the exercises (by order of first
 * appearance, 0-based) to answer wrong the first time. Returns a log of every answer.
 */
async function playLesson(page, L, { how, wrong = [], reloadAfter = -1, onReload, mode = 'lesson', mic = true, afterAnswer }) {
  const log = [];
  const seen = new Map();
  let answered = 0;
  for (let guard = 0; guard < 80; guard++) {
    const kind = await lib.onScreen(page);
    if (kind === 'summary') return log;
    const id = await lib.stepId(page);
    if (kind === 'card' || kind === null) {
      if (how === 'touch') await lib.tap(page, lib.sel.cont);
      else await lib.press(page, 'Enter');
      await lib.waitForNewStep(page, id);
      continue;
    }
    const state = await lib.savedSession(page, L, mode);
    if (!state) {
      // A session that opens on a question has saved nothing yet: rate a flashcard, or say
      // "I don't know" (the question comes back later and is answered then).
      const type = await page.getAttribute('[data-exercise-type]', 'data-exercise-type');
      if (type === 'flashcard') {
        if (how === 'touch') {
          await lib.tap(page, '[data-player-bar] [data-action="primary"]');
          await lib.tap(page, '[data-rating="good"]');
        } else {
          await lib.press(page, 'Space');
          await lib.press(page, '3');
        }
        log.push({ key: 'first', type, attempt: 0, intended: 'right', tone: 'ok' });
      } else {
        if (how === 'touch') await lib.tap(page, '[data-action="skip"]');
        else await page.locator('[data-action="skip"]').click();
        await page.waitForSelector('[data-feedback]', { timeout: 15000 });
        log.push({ key: 'first', type, attempt: 0, intended: 'skip', tone: await page.getAttribute('[data-feedback]', 'data-feedback') });
        if (how === 'touch') await lib.tap(page, lib.sel.cont);
        else await lib.press(page, 'Enter');
      }
      await lib.waitForNewStep(page, id);
      continue;
    }
    const step = L.currentStep(state);
    if (!step || step.kind !== 'exercise') throw new Error(`No saved exercise for the step on screen (${id})`);
    if (!id.startsWith(`${step.key}:`)) throw new Error(`Saved step ${step.key} does not match the screen (${id})`);
    const ordinal = seen.has(step.key) ? seen.get(step.key) : seen.size;
    const first = !seen.has(step.key);
    seen.set(step.key, ordinal);
    const ex = step.exercise;
    const goWrong = first && wrong.includes(ordinal) && !PLAY_TYPES.has(ex.type);
    const answer = goWrong ? lib.wrongAnswer(L, ex) : L.solve(ex);
    const heartsBefore = await heartsShown(page);
    if (verbose) console.log(`    step ${id}: ${ex.type} ${goWrong ? 'wrong' : 'right'} ${JSON.stringify(answer)}`);
    if (PLAY_TYPES.has(ex.type) && !mic) {
      // No microphone here: "I can't play right now" swaps in the tapping version.
      if (how === 'touch') await lib.tap(page, '[data-cant-play]');
      else await page.locator('[data-cant-play]').click();
      await lib.waitForNewStep(page, id);
      continue;
    }
    if (PLAY_TYPES.has(ex.type)) {
      if (how === 'touch') await lib.tap(page, '[data-player-bar] [data-action="primary"]');
      else await lib.press(page, 'Enter');
    } else {
      const ok = await lib.giveAnswer(page, L, step, answer, how);
      if (!ok) throw new Error(`Could not give a ${ex.type} answer by ${how}`);
      if (ex.type !== 'flashcard') {
        if (await page.locator('[data-player-bar] [data-action="check"]').isDisabled()) {
          const states = await page.evaluate(() => [...document.querySelectorAll('[data-answer] [data-state]')].map((e) => `${[...e.attributes].filter((a) => a.name.startsWith('data-') && a.name !== 'data-state').map((a) => `${a.name}=${a.value}`).join(',')}:${e.getAttribute('data-state')}`));
          await page.screenshot({ path: path.join(OUT, `lessons-stuck-${how}.png`) });
          throw new Error(`Check stayed disabled after a ${ex.type} answer: ${states.join(' ')}`);
        }
        if (how === 'touch') await lib.tap(page, '[data-player-bar] [data-action="check"]');
        else await lib.press(page, 'Enter');
      }
    }
    if (ex.type !== 'flashcard') await page.waitForSelector('[data-feedback]', { timeout: PLAY_TYPES.has(ex.type) ? 45000 : 15000 });
    const tone = ex.type === 'flashcard' ? 'ok' : await page.getAttribute('[data-feedback]', 'data-feedback');
    const heartsAfter = await heartsShown(page);
    const said = ex.type === 'flashcard' ? '' : await page.locator('[data-feedback]').innerText();
    log.push({ key: step.key, type: ex.type, attempt: step.attempt, alternative: step.alternative, intended: goWrong ? 'wrong' : 'right', tone, heartsBefore, heartsAfter, said, againTag: await page.locator('[data-step-id] >> text=Another go').count() });
    if (ex.type !== 'flashcard') {
      if (how === 'touch') await lib.tap(page, lib.sel.cont);
      else await lib.press(page, 'Enter');
      await lib.waitForNewStep(page, id);
    }
    answered++;
    if (afterAnswer) await afterAnswer(answered);
    if (answered === reloadAfter && onReload) await onReload();
  }
  throw new Error('The lesson did not end');
}

/** The accuracy the summary should show for a log: right at the first attempt, of the different exercises. */
function expectedAccuracy(log) {
  const first = new Map();
  for (const e of log) if (!first.has(e.key)) first.set(e.key, e.tone === 'ok');
  const asked = first.size;
  const right = [...first.values()].filter(Boolean).length;
  return { asked, right, percent: Math.round((right / asked) * 100) };
}

async function makeWav(file) {
  const pitch = await loadTs('/src/core/pitch/index.ts');
  const sr = 48000;
  const samples = pitch.pluckedString({ freq: 110, sampleRate: sr, duration: 1.6, amplitude: 0.6, seed: 3 });
  fs.writeFileSync(file, Buffer.from(pitch.encodeWav(samples, sr, { bitDepth: 16 })));
}

// ── Runs ───────────────────────────────────────────────────────────────────────────────────────

async function runLesson(L, how, wav) {
  const group = how;
  const mobile = how === 'touch';
  await withApp({ mobile, fakeAudio: wav, theme: mobile ? 'dark' : 'light' }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'kit-lessons--play--open-strings');
    check(group, 'the player opens full-screen on the first card', await page.locator('[data-lesson-player] [data-step-kind="card"]').count());
    check(group, 'the shell is in focus mode', (await page.getAttribute('[data-immersive]', 'data-immersive')) === 'focus');

    if (how === 'keys') {
      // Escape asks before leaving; Escape again keeps going.
      await lib.press(page, 'Enter'); // past the first card, so there is something to keep
      await page.waitForTimeout(300);
      await lib.press(page, 'Escape');
      const dialog = await page.locator('[role="dialog"] >> text=Save and leave').count();
      check(group, 'Escape opens the leave dialog with "Save and leave"', dialog > 0);
      await lib.press(page, 'Escape');
      await page.waitForTimeout(400);
      check(group, 'Escape again closes it and the lesson goes on', (await page.locator('[role="dialog"]').count()) === 0);
    }

    if (how === 'touch') {
      // A sideways swipe on a teaching card moves on, like the Continue button.
      const before = await lib.stepId(page);
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: 215 }] });
      await touch('touchStart', 320);
      for (const x of [280, 220, 160, 110]) {
        await touch('touchMove', x);
        await page.waitForTimeout(16);
      }
      await touch('touchEnd', 110);
      const after = await lib.waitForNewStep(page, before, 5000).catch(() => null);
      check(group, 'a sideways swipe on a teaching card moves on', after && after !== before, `${before} -> ${after}`);
      // Let the browser's fling from the swipe end: a tap that stops a fling is (rightly) not a tap.
      await page.waitForTimeout(1500);
      const stray = await page.locator('[data-answer] [data-state="picked"], [data-answer] [data-state="selected"]').count();
      check(group, 'and the swipe picks nothing on the next step', stray === 0, stray);
    }

    let reloadedAt = null;
    let resumedAt = null;
    let toast = 0;
    let pauseCheck = null;
    const setHidden = (hidden) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    const log = await playLesson(page, L, {
      how,
      afterAnswer: async (n) => {
        if (how !== 'keys' || n !== 2) return;
        // The page is hidden (phone locked, another tab): the clock stops, and starts again on return.
        await setHidden(true);
        await page.waitForTimeout(300);
        const paused = await lib.savedSession(page, L);
        await page.waitForTimeout(2500);
        await setHidden(false);
        await page.waitForTimeout(300);
        const back = await lib.savedSession(page, L);
        pauseCheck = { paused: paused && paused.paused, active: paused && paused.activeMs, resumed: back && !back.paused, activeAfter: back && back.activeMs };
      },
      wrong: how === 'touch' ? [0, 2] : [1],
      reloadAfter: 3,
      onReload: async () => {
        reloadedAt = await lib.stepId(page);
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('[data-lesson-player]', { timeout: 60000 });
        await page.waitForTimeout(600);
        resumedAt = await lib.stepId(page);
        toast = await page.locator('text=Picked up where you left off').count();
      },
    });
    if (verbose) console.log(log);

    check(group, 'a reload in the middle resumes on the same step', reloadedAt && reloadedAt === resumedAt, `${reloadedAt} -> ${resumedAt}`);
    if (how === 'keys') {
      check(group, 'a hidden page pauses the session', pauseCheck && pauseCheck.paused === true, JSON.stringify(pauseCheck));
      check(group, 'and the time away is not counted', pauseCheck && pauseCheck.resumed && pauseCheck.activeAfter === pauseCheck.active, JSON.stringify(pauseCheck));
    }
    check(group, 'and says so once (one toast with a way to start over)', toast === 1, toast);
    const wrongs = log.filter((e) => e.intended === 'wrong');
    check(group, 'the wrong answers were marked wrong', wrongs.length > 0 && wrongs.every((e) => e.tone === 'bad'), JSON.stringify(wrongs));
    for (const w of wrongs) {
      const again = log.find((e) => e.key === w.key && e.attempt > 0);
      check(group, `a wrong ${w.type} came back and was answered right`, again && again.tone === 'ok' && again.againTag > 0, JSON.stringify(again));
    }
    const lost = log.filter((e) => e.tone === 'bad' && e.heartsBefore !== null && e.heartsAfter === e.heartsBefore - 1).length;
    check(group, 'a heart was lost for each wrong answer', lost === wrongs.length, `${lost} of ${wrongs.length}`);
    const play = log.find((e) => PLAY_TYPES.has(e.type));
    check(group, 'the play step heard the right note from the microphone', play && play.tone === 'ok' && !play.alternative, JSON.stringify(play));

    const outcome = await page.getAttribute('[data-summary]', 'data-summary');
    check(group, 'the summary shows a completed lesson', outcome === 'completed', outcome);
    const exp = expectedAccuracy(log);
    const accuracy = await page.locator('[data-stat="accuracy"]').innerText();
    check(group, 'the summary accuracy is right', accuracy.includes(`${exp.percent}%`) && accuracy.includes(`${exp.right} of ${exp.asked}`), `${accuracy.replace(/\n/g, ' ')} vs ${exp.percent}% (${exp.right} of ${exp.asked})`);
    const xp = await page.locator('[data-stat="xp"]').innerText();
    check(group, 'the summary shows the XP earned (10 for a lesson with mistakes)', /\+10\b/.test(xp), xp.replace(/\n/g, ' '));
    const cards = await page.locator('[data-stat="cards"]').innerText().catch(() => '');
    check(group, 'the summary says what was added to review', /2 cards/.test(cards), cards.replace(/\n/g, ' '));
    check(group, 'the summary shows the crown', (await page.locator('[data-stat="crowns"]').count()) > 0);

    await page.waitForTimeout(900); // the progress store saves after 400 ms of quiet
    const progress = await lib.storedProgress(page);
    const skill = progress && progress.skills['theory:first-notes:open-strings'];
    check(group, 'progress: the lesson skill is completed', skill && skill.completed === true, JSON.stringify(skill && { completed: skill.completed, mastery: skill.mastery }));
    check(group, 'progress: XP was recorded', progress && progress.xp.total >= 10, progress && progress.xp.total);
    check(group, 'progress: the lesson facts are review cards', progress && progress.srs.items['demo:open-strings'] && progress.srs.items['demo:string-numbers'], Object.keys((progress && progress.srs.items) || {}).join(','));
    check(group, 'progress: hearts were taken from the store', progress && progress.hearts.count === 5 - wrongs.length, progress && JSON.stringify(progress.hearts));
    check(group, 'the saved session is cleared once the lesson is done', (await page.evaluate((k) => localStorage.getItem(k), lib.SLOT)) === null);

    await page.screenshot({ path: path.join(OUT, `lessons-summary-${how}.png`) });
    // The next lesson is the first open lesson not done yet (the gallery let us start in the middle).
    const expectedNext = L.nextLesson(L.DEMO_COURSE, progress, Date.now());
    if (how === 'touch') await lib.tap(page, '[data-action="next"]');
    else await lib.press(page, 'Enter');
    await page.waitForTimeout(800);
    const hash = await page.evaluate(() => location.hash);
    check(group, '"Next lesson" opens the next lesson', expectedNext && hash === `#kit-lessons--play--${expectedNext.lessonId}`, `${hash} vs ${expectedNext && expectedNext.lessonId}`);

    if (how === 'keys') {
      await open(page, url, 'kit-lessons--map');
      await page.screenshot({ path: path.join(OUT, 'lessons-map-progress-desktop.png') });
    }
    if (how === 'touch') {
      // The lesson's facts are due for review: the review card leads into a review session.
      await open(page, url, 'kit-lessons--map');
      await page.screenshot({ path: path.join(OUT, 'lessons-map-progress-mobile.png'), fullPage: true });
      const entry = await page.getAttribute('[data-review-entry]', 'data-review-entry').catch(() => null);
      check(group, 'the review card counts the new cards', entry === '2', entry);
      await page.locator('[data-review-start]').tap();
      await page.waitForSelector('[data-lesson-player][data-mode="review"]', { timeout: 30000 });
      const reviewLog = await playLesson(page, L, { how, mode: 'review', mic: false });
      check(group, 'the review session asks each card', reviewLog.length >= 2, reviewLog.map((e) => e.type).join(','));
      const reviewed = await page.locator('[data-stat="reviewed"]').innerText().catch(() => '');
      check(group, 'and its summary counts the cards reviewed', /2/.test(reviewed), reviewed.replace(/\n/g, ' '));
      await page.waitForTimeout(900);
      const after = await lib.storedProgress(page);
      const card = after && after.srs.items['demo:open-strings'];
      check(group, 'progress: the review graded the cards', card && card.lastAt > card.addedAt, JSON.stringify(card));
    }
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

async function runHearts(L) {
  const group = 'hearts';
  await withApp({ mobile: true }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'kit-lessons--play--musical-alphabet');
    const heartLog = await playLesson(page, L, { how: 'touch', wrong: [0, 1, 2, 3, 4, 5, 6, 7, 8], mic: false });
    const last = heartLog.filter((e) => e.tone === 'bad').pop();
    check(group, 'the answer that used the last heart says so, and promises no come-back', last && /last heart/.test(last.said) && !/see this one again/.test(last.said), last && last.said.replace(/\n/g, ' '));
    const outcome = await page.getAttribute('[data-summary]', 'data-summary');
    check(group, 'running out of hearts ends the lesson kindly', outcome === 'out-of-hearts', outcome);
    const label = await page.locator('[data-action="next"]').innerText();
    check(group, 'and offers practice to refill them', /Practise to refill hearts/.test(label), label);
    await page.screenshot({ path: path.join(OUT, 'lessons-out-of-hearts-mobile.png') });
    await page.waitForTimeout(900);
    let progress = await lib.storedProgress(page);
    check(group, 'progress: no heart is left', progress && progress.hearts.count === 0, progress && JSON.stringify(progress.hearts));
    await lib.tap(page, '[data-action="next"]');
    await page.waitForSelector('[data-lesson-player][data-mode="practice"]', { timeout: 30000 });
    check(group, 'practice starts on the same unit', (await page.evaluate(() => location.hash)) === '#kit-lessons--practice--first-notes');
    await playLesson(page, L, { how: 'touch', mode: 'practice', mic: false });
    const practiceOutcome = await page.getAttribute('[data-summary]', 'data-summary');
    check(group, 'the practice round completes', practiceOutcome === 'completed', practiceOutcome);
    await page.waitForTimeout(900);
    progress = await lib.storedProgress(page);
    check(group, 'progress: the hearts are full again', progress && progress.hearts.count === 5, progress && JSON.stringify(progress.hearts));
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

async function runRefused(L) {
  const group = 'refused';
  await withApp({ mobile: true }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'kit-lessons--play--open-strings');
    // Answer right up to the play step.
    for (let guard = 0; guard < 30; guard++) {
      const kind = await lib.onScreen(page);
      const id = await lib.stepId(page);
      if (kind === 'card') {
        await lib.tap(page, lib.sel.cont);
        await lib.waitForNewStep(page, id);
        continue;
      }
      const step = L.currentStep(await lib.savedSession(page, L));
      if (PLAY_TYPES.has(step.exercise.type)) break;
      await lib.giveAnswer(page, L, step, L.solve(step.exercise), 'touch');
      await lib.tap(page, '[data-action="check"]');
      await page.waitForSelector('[data-feedback]');
      await lib.tap(page, lib.sel.cont);
      await lib.waitForNewStep(page, id);
    }
    check(group, 'reached the play step', (await page.getAttribute('[data-exercise-type]', 'data-exercise-type')) === 'play-note');
    check(group, '"I can\'t play right now" is visible on the play step', await page.locator('[data-cant-play]').isVisible());
    await lib.tap(page, '[data-player-bar] [data-action="primary"]');
    await page.waitForSelector('[data-player-bar] >> text=Tap it instead', { timeout: 20000 }).catch(() => null);
    const blocked = await page.locator('[data-player-bar] >> text=Tap it instead').count();
    check(group, 'a refused microphone explains why and offers the tapping version as the one primary action', blocked === 1 && (await page.locator('text=No microphone').count()) > 0);
    check(group, 'and only once: no second "tapping version" button in the panel', (await page.locator('[data-lesson-player] button >> text=/tapping version/i').count()) === 0);
    await page.screenshot({ path: path.join(OUT, 'lessons-mic-refused-mobile.png') });
    if (blocked) {
      const id = await lib.stepId(page);
      await lib.tap(page, '[data-player-bar] >> text=Tap it instead');
      await lib.waitForNewStep(page, id);
      const type = await page.getAttribute('[data-exercise-type]', 'data-exercise-type');
      check(group, 'the alternative (tapping) exercise takes its place', type === 'fretboard-find', type);
      check(group, 'it says it is the tapping version', (await page.locator('text=Tapping version').count()) > 0);
      const step = L.currentStep(await lib.savedSession(page, L));
      await lib.giveAnswer(page, L, step, L.solve(step.exercise), 'touch');
      await lib.tap(page, '[data-action="check"]');
      await page.waitForSelector('[data-feedback]');
      check(group, 'and it can be answered by tapping', (await page.getAttribute('[data-feedback]', 'data-feedback')) === 'ok');
    }
    // "I can't play right now" on another play exercise swaps it at once.
    await open(page, url, 'kit-lessons--try--play-chord');
    const before = await lib.stepId(page);
    await lib.tap(page, '[data-cant-play]');
    await lib.waitForNewStep(page, before);
    const swapped = await page.getAttribute('[data-exercise-type]', 'data-exercise-type');
    check(group, '"I can\'t play right now" swaps in the alternative', swapped && !PLAY_TYPES.has(swapped), swapped);
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

async function runRhythm(L) {
  const group = 'rhythm';
  const ex = L.EXERCISE_EXAMPLES['tap-rhythm'];
  const targets = L.tapTargets(ex);
  await withApp({}, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'kit-lessons--try--tap-rhythm');
    let tone = null;
    for (let attempt = 0; attempt < 3 && tone !== 'ok'; attempt++) {
      const id = await lib.stepId(page);
      const t0 = Date.now();
      await page.keyboard.press('Enter');
      // Beat one is heard 0.25 s after Start plus one bar of count-in (4 beats at 80 BPM = 3 s).
      const beatOne = t0 + 250 + 3000;
      const seenCount = [];
      for (const t of targets) {
        const wait = beatOne + t * 1000 - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (seenCount.length === 0) seenCount.push(await page.locator('[data-tap-pad]').innerText());
        await page.keyboard.down(' ');
        await page.keyboard.up(' ');
      }
      await page.waitForSelector('[data-feedback]', { timeout: 15000 });
      tone = await page.getAttribute('[data-feedback]', 'data-feedback');
      if (attempt === 0) check(group, 'the count-in shows on the pad', seenCount.length > 0, seenCount.join(' / '));
      await page.screenshot({ path: path.join(OUT, `lessons-rhythm-result-${attempt}.png`) });
      if (tone !== 'ok') {
        await page.keyboard.press('Enter');
        await lib.waitForNewStep(page, id).catch(() => null);
      }
    }
    check(group, 'Space taps along the count-in are graded right (3 tries allowed on a busy machine)', tone === 'ok', tone);
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

async function runMap(L) {
  const group = 'map';
  await withApp({ mobile: true }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'kit-lessons--map');
    const current = page.locator('[data-node][data-state="current"]');
    check(group, 'exactly one lesson is current', (await current.count()) === 1);
    check(group, 'later lessons are locked', (await page.locator('[data-node][data-state="locked"]').count()) > 0);
    check(group, 'each unit offers its checkpoint', (await page.locator('[data-checkpoint]').count()) === 2);
    await page.screenshot({ path: path.join(OUT, 'lessons-map-mobile.png'), fullPage: true });
    await current.tap();
    await page.waitForSelector('[role="dialog"] [data-start]', { timeout: 10000 });
    check(group, 'tapping a node opens its card with Start', true);
    await page.screenshot({ path: path.join(OUT, 'lessons-map-sheet-mobile.png') });
    await page.locator('[role="dialog"] [data-start]').tap();
    await page.waitForSelector('[data-lesson-player]', { timeout: 30000 });
    check(group, 'Start opens the lesson', (await page.evaluate(() => location.hash)) === '#kit-lessons--play--musical-alphabet');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(group, 'no sideways scroll', overflow <= 1, overflow);
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
  await withApp({}, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'kit-lessons--map');
    check(group, 'desktop: the details pane shows the current lesson', (await page.locator('aside [data-details="musical-alphabet"]').count()) === 1);
    await page.locator('[data-node="musical-alphabet"]').focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-node'));
    check(group, 'desktop: an arrow key moves to the next node', focused === 'open-strings', focused);
    check(group, 'desktop: the details follow the focus', (await page.locator('aside [data-details="open-strings"]').count()) === 1);
    await page.screenshot({ path: path.join(OUT, 'lessons-map-desktop.png') });
    // "Test out" runs the unit's checkpoint: a test with a mistake allowance instead of hearts.
    await page.locator('[data-checkpoint="first-notes"]').click();
    await page.waitForSelector('[data-lesson-player][data-mode="checkpoint"]', { timeout: 30000 });
    const left = await page.getAttribute('[data-mistakes-left]', 'data-mistakes-left').catch(() => null);
    const allowed = String(L.DEMO_COURSE.units[0].checkpoint.maxMistakes ?? 3);
    check(group, 'desktop: "Test out" opens the checkpoint, with the mistakes it allows', left === allowed, `${left} vs ${allowed}`);
    check(group, 'desktop: a checkpoint uses no hearts', (await page.locator('[data-hearts]').count()) === 0);
    await page.screenshot({ path: path.join(OUT, 'lessons-checkpoint-desktop.png') });
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

async function runLayout() {
  const group = 'layout';
  const configs = [
    { name: '360', viewport: { width: 360, height: 740 }, mobile: true, theme: 'dark' },
    { name: '360-light', viewport: { width: 360, height: 740 }, mobile: true, theme: 'light' },
    { name: 'desktop', mobile: false, theme: 'dark' },
    { name: 'desktop-light', mobile: false, theme: 'light' },
  ];
  for (const c of configs) {
    await withApp({ mobile: c.mobile, viewport: c.viewport, theme: c.theme }, async ({ page, url, errors }) => {
      await seed(page);
      const bad = [];
      for (const type of TYPES) {
        await open(page, url, `kit-lessons--try--${type}`);
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(OUT, `lessons-type-${type}-${c.name}.png`) });
        const m = await page.evaluate(() => {
          const doc = document.documentElement;
          const overflow = doc.scrollWidth - doc.clientWidth;
          const vw = doc.clientWidth;
          const clipped = [...document.querySelectorAll('[data-answer] button, [data-answer] [role="img"]')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              if (r.width === 0) return false;
              // Inside a sideways-scrolling box is fine (wide tab); otherwise it must fit the screen.
              let p = el.parentElement;
              while (p && p !== document.body) {
                const s = getComputedStyle(p);
                if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth) return false;
                p = p.parentElement;
              }
              return r.left < -1 || r.right > vw + 1;
            })
            .map((el) => el.getAttribute('aria-label') || el.textContent.slice(0, 20));
          window.scrollTo(0, doc.scrollHeight);
          return { overflow, clipped };
        });
        await page.waitForTimeout(150);
        const under = await page.evaluate(() => {
          const bar = document.querySelector('[data-player-bar]').getBoundingClientRect();
          const answer = document.querySelector('[data-answer]').getBoundingClientRect();
          return Math.round(answer.bottom - bar.top);
        });
        if (m.overflow > 1) bad.push(`${type}: page scrolls sideways by ${m.overflow}px`);
        if (m.clipped.length) bad.push(`${type}: clipped ${m.clipped.join(', ')}`);
        if (under > 1) bad.push(`${type}: answer area ends ${under}px under the bottom bar`);
        const small = await page.evaluate(() =>
          [...document.querySelectorAll('[data-answer] button, [data-player-bar] button')]
            .filter((el) => el.offsetParent && !el.closest('[role="group"][aria-label$="arrow keys move."]'))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              // Glossary terms are words inside a sentence (the inline-text exception).
              return r.height < 43.5 && r.width > 0 && !el.hasAttribute('data-term');
            })
            .map((el) => `${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().height)}px`),
        );
        if (c.mobile && small.length) bad.push(`${type}: targets under 44px: ${small.join(', ')}`);
      }
      check(group, `${c.name}: every exercise type fits, nothing under the bar, targets of 44 px`, bad.length === 0, bad.join(' | '));
      if (c.name === '360') {
        // Reduced motion: the step's entrance and the feedback's slide are switched off.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await open(page, url, 'kit-lessons--try--choice');
        const duration = await page.evaluate(() => getComputedStyle(document.querySelector('[data-step-id]')).animationDuration);
        check(group, 'reduced motion switches the step animation off', parseFloat(duration) < 0.01, duration);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
      check(group, `${c.name}: no console errors`, errors.length === 0, errors.join(' | '));
    });
  }
}

/** Rectangles that overlap (touching edges do not count). */
const OVERLAPS = `(a, b) => !(a.right <= b.left + 0.5 || a.left >= b.right - 0.5 || a.bottom <= b.top + 0.5 || a.top >= b.bottom - 0.5)`;

/** Map titles that sit on a node, and whether the Start bubble covers a title or another node. */
async function mapCollisions(page) {
  return page.evaluate((overlapsSrc) => {
    const overlaps = new Function(`return ${overlapsSrc}`)();
    const nodes = [...document.querySelectorAll('[data-node]')];
    const labels = [...document.querySelectorAll('[data-course-map] li > span:not([data-bubble])')];
    const out = [];
    for (const l of labels) for (const n of nodes) if (overlaps(l.getBoundingClientRect(), n.getBoundingClientRect())) out.push(`title "${l.textContent}" on node ${n.getAttribute('data-node')}`);
    const bubble = document.querySelector('[data-bubble]');
    if (bubble) {
      const b = bubble.getBoundingClientRect();
      for (const l of labels) if (overlaps(b, l.getBoundingClientRect())) out.push(`Start on title "${l.textContent}"`);
      for (const n of nodes) if (overlaps(b, n.getBoundingClientRect())) out.push(`Start on node ${n.getAttribute('data-node')}`);
    }
    return out;
  }, OVERLAPS);
}

/** Load the page again, as a learner coming back would (a real reload, not a hash change). */
async function reopen(page) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-lesson-player]', { timeout: 60000 });
  await page.waitForTimeout(500);
}

async function answerRight(page, L) {
  const id = await lib.stepId(page);
  if ((await lib.onScreen(page)) === 'card') {
    await lib.tap(page, lib.sel.cont);
    await lib.waitForNewStep(page, id);
    return;
  }
  const step = L.currentStep(await lib.savedSession(page, L));
  await lib.giveAnswer(page, L, step, L.solve(step.exercise), 'touch');
  await lib.tap(page, '[data-action="check"]');
  await page.waitForSelector('[data-feedback]');
}

async function runReview(L) {
  const group = 'review';
  const route = 'kit-lessons--play--musical-alphabet';
  await withApp({ mobile: true }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, route);
    await answerRight(page, L); // the first card
    await answerRight(page, L); // the first exercise, checked
    let id = await lib.stepId(page);
    await lib.tap(page, lib.sel.cont);
    await lib.waitForNewStep(page, id);
    await reopen(page);
    await page.waitForTimeout(600);
    const toasts = await page.locator('text=Picked up where you left off').count();
    check(group, 'a resumed lesson says so once (React runs effects twice in development: still one toast)', toasts === 1, toasts);
    await answerRight(page, L);
    await page.waitForTimeout(700);
    check(group, 'the "Picked up" toast leaves at the first move, so it never covers the answer', (await page.locator('text=Picked up where you left off').count()) === 0);

    // "End lesson now": the place is not kept, and the summary must not say it is.
    await lib.tap(page, '[data-close]');
    await page.waitForSelector('[role="dialog"] [data-leave="end"]');
    await lib.tap(page, '[role="dialog"] [data-leave="end"]');
    await page.waitForSelector('[data-summary="quit"]', { timeout: 15000 });
    const summary = await page.locator('[data-summary]').innerText();
    check(group, '"End lesson now" says the lesson starts again next time', /Lesson ended/.test(summary) && /starts from the beginning/.test(summary) && !/Saved for later/.test(summary), summary.replace(/\n/g, ' ').slice(0, 160));
    check(group, 'and indeed keeps no saved place', (await page.evaluate((k) => localStorage.getItem(k), lib.SLOT)) === null);
    await reopen(page);
    check(group, 'reopening starts on the first card, with no "Picked up" toast', (await lib.onScreen(page)) === 'card' && (await page.locator('text=Picked up where you left off').count()) === 0);

    // Bad links in the gallery say so and offer a way on, instead of an empty "All done".
    for (const bad of ['kit-lessons--checkpoint--nope', 'kit-lessons--practice--nope', 'kit-lessons--play']) {
      await page.goto(`${url}#${bad}`, { waitUntil: 'load' });
      await page.waitForSelector('main h1', { timeout: 30000 });
      const text = await page.locator('main').innerText();
      check(group, `#${bad} says it is not there and offers the demo lessons`, /Not found/.test(text) && /Choose a demo lesson/.test(text) && !/“”/.test(text), text.replace(/\n/g, ' ').slice(0, 120));
    }
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });

  // The Start bubble with progress: the title of the lesson before must stay readable.
  for (const c of [{ name: 'phone', mobile: true }, { name: '360', mobile: true, viewport: { width: 360, height: 740 } }, { name: 'desktop', mobile: false }]) {
    await withApp({ mobile: c.mobile, viewport: c.viewport }, async ({ page, url, errors }) => {
      await seed(page);
      await open(page, url, 'kit-lessons--map');
      await page.evaluate(async () => {
        const p = await import('/src/core/progress/index.ts');
        p.createActions(p.getProgressStore).markSkill('theory:first-notes:musical-alphabet', { completed: true });
      });
      await page.waitForTimeout(600);
      const current = await page.getAttribute('[data-node][data-state="current"]', 'data-node');
      check(group, `${c.name}: with the first lesson done, the second is current`, current === 'open-strings', current);
      await page.evaluate(() => document.querySelector('[data-bubble]').scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(300);
      const hits = await mapCollisions(page);
      check(group, `${c.name}: the Start bubble covers no title and no node, and no title sits on a node`, hits.length === 0, hits.join('; '));
      await page.screenshot({ path: path.join(OUT, `lessons-map-progress-${c.name}.png`) });
      check(group, `${c.name}: no console errors`, errors.length === 0, errors.join(' | '));
    });
  }

  // Text at 200 % (the learner's own text size): words stay whole, nothing slides sideways.
  await withApp({ mobile: true }, async ({ page, url, errors }) => {
    await seed(page);
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => (document.documentElement.style.fontSize = '200%')));
    for (const type of ['choice', 'fill-blanks', 'fretboard-find']) {
      await open(page, url, `kit-lessons--try--${type}`);
      const bar = await page.evaluate(() => {
        const b = document.querySelector('[data-player-bar] [data-action="check"]');
        const label = [...b.querySelectorAll('span')].find((s) => s.textContent.trim() === 'Check') || b;
        return { width: Math.round(b.getBoundingClientRect().width), clipped: label.scrollWidth > label.clientWidth + 1 || label.getBoundingClientRect().width < 20 };
      });
      check(group, `200 %: ${type}: the Check button keeps its word`, !bar.clipped && bar.width > 120, JSON.stringify(bar));
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(group, `200 %: ${type}: no sideways scroll`, sideways <= 1, sideways);
    }
    await page.screenshot({ path: path.join(OUT, 'lessons-200-percent-mobile.png') });
    await open(page, url, 'kit-lessons--map');
    const hits = await mapCollisions(page);
    check(group, '200 %: map titles stay clear of the nodes', hits.length === 0, hits.join('; '));
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(group, '200 %: the map does not scroll sideways', sideways <= 1, sideways);
    check(group, '200 %: no console errors', errors.length === 0, errors.join(' | '));
  });
}

(async () => {
  const L = await loadTs('/src/lessons/index.ts');
  const wav = path.join(OUT, 'lessons-a2.wav');
  if (want('touch') || want('keys')) await makeWav(wav);
  const runs = [
    ['touch', () => runLesson(L, 'touch', wav)],
    ['keys', () => runLesson(L, 'keys', wav)],
    ['hearts', () => runHearts(L)],
    ['refused', () => runRefused(L)],
    ['rhythm', () => runRhythm(L)],
    ['map', () => runMap(L)],
    ['layout', () => runLayout()],
    ['review', () => runReview(L)],
  ];
  for (const [name, run] of runs) {
    if (!want(name)) continue;
    try {
      await run();
    } catch (e) {
      check(name, 'ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' ') : e);
    }
    const mine = results.filter((r) => r.group === name);
    console.log(`${mine.every((r) => r.pass) ? 'ok  ' : 'FAIL'}  ${name}: ${mine.filter((r) => r.pass).length}/${mine.length}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length === 0 ? `PASSED (${results.length} checks)` : `FAILED (${failed.length} of ${results.length} checks)`);
  process.exit(failed.length === 0 ? 0 : 1);
})();
