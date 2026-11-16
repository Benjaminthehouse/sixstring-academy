#!/usr/bin/env node
/**
 * Browser check of the Teachers screen. Run: node e2e/teachers.cjs [--only pick,lesson,show,looks] [--verbose]
 *
 *  pick    phone (390 x 844, touch, dark): #teachers shows the three teachers as people with
 *          portraits, recommends Mia to a new learner, reads a line aloud on request; Dev's page
 *          says his lessons are being written and lists his units; the switcher leads back to Mia,
 *          whose page shows her course map and the rest of the plan; "Start with Mia" opens her
 *          first lesson full screen.
 *  lesson  phone, a fake microphone that plays the open strings 6, 3 and 1 (plucked-string
 *          signals from the pitch module): the whole of "Meet your guitar" by taps. The teacher
 *          is on every teaching card; after each answer she reacts. The play steps hear the fake
 *          microphone. At the task card, "Open the Player" leaves for the Open-String Duet (bars 1
 *          to 4 at 75 %) with the lesson's place kept; a run of the song is recorded there through
 *          the app's own progress module (as the Player records one), the shell's Back button
 *          returns, and the task card welcomes the learner back and shows what it saw. The summary,
 *          the stored skill and XP, and "Next lesson" are checked.
 *  show    desktop (1280 x 800, light), a fake microphone that plays Hot Cross Buns once: the
 *          unit's milestone lesson. Its tasks are skipped or visited (the Player task opens the
 *          Player in flow mode and returns), the performance step is framed as the show and hears
 *          the whole tune from the microphone, and the unit ends with Mia's celebration.
 *  looks   screenshots of the overview, Mia's page, Dev's page, a teaching card, a task card and an
 *          exercise on phone and desktop in both themes, and a phone held sideways; no page is
 *          wider than the screen.
 *
 * Prints PASSED or FAILED and exits non-zero on failure. Screenshots go to e2e/out/teachers-*.png.
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
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];
const realErrors = (errors) => errors.filter((e) => !BENIGN.some((b) => b.test(e)));

async function seed(page) {
  await page.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
  }, SEED);
}

async function open(page, url, hash, selector) {
  await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
  await page.waitForSelector('main[data-route]', { timeout: 90000 });
  if (selector) await page.waitForSelector(selector, { timeout: 90000 });
  await page.waitForTimeout(400);
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function shot(page, name, full = false) {
  await page.screenshot({ path: path.join(OUT, `teachers-${name}.png`), fullPage: full });
}

// ── Fake microphones ────────────────────────────────────────────────────────────────────────────

const MIDI_HZ = (m) => 440 * 2 ** ((m - 69) / 12);

/** A WAV of plucked notes, each `[midi, seconds]`, with a short gap after each so repeats re-attack. */
async function makeWav(file, notes, { lead = 0, tail = 1.5, gap = 0.12 } = {}) {
  const pitch = await loadTs('/src/core/pitch/index.ts');
  const sr = 48000;
  const parts = [pitch.silence(lead, sr)];
  notes.forEach(([midi, sec], i) => {
    parts.push(pitch.pluckedString({ freq: MIDI_HZ(midi), sampleRate: sr, duration: Math.max(0.25, sec - gap), amplitude: 0.6, seed: 5 + i }));
    parts.push(pitch.silence(gap, sr));
  });
  parts.push(pitch.silence(tail, sr));
  fs.writeFileSync(file, Buffer.from(pitch.encodeWav(pitch.concat(...parts), sr, { bitDepth: 16 })));
}

// ── Playing a lesson ────────────────────────────────────────────────────────────────────────────

async function stepKind(page) {
  return page.evaluate(() => {
    if (document.querySelector('[data-summary]')) return 'summary';
    if (document.querySelector('[data-task]')) return 'task';
    const el = document.querySelector('[data-step-kind]');
    return el ? el.getAttribute('data-step-kind') : null;
  });
}

async function press(page, how, selector) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  if (how === 'touch') await el.tap();
  else await el.click();
  await page.waitForTimeout(80);
}

/**
 * Play the lesson on screen to its summary, answering with the engine's own `solve()`. `onTask`
 * decides what happens at each task card (it must leave the card); tap-rhythm steps are answered
 * "I don't know" (their timing is checked by e2e/lessons.cjs), play steps listen to the fake mic.
 */
async function playLesson(page, L, { how, onTask, onExercise }) {
  const log = [];
  for (let guard = 0; guard < 80; guard++) {
    const kind = await stepKind(page);
    if (kind === 'summary') return log;
    const id = await lib.stepId(page);
    if (kind === 'task') {
      await onTask(id);
      continue;
    }
    if (kind === 'card' || kind === null) {
      const teacher = await page.locator('[data-step-kind="card"] [data-teacher-line="mia"]').count();
      log.push({ kind: 'card', teacher });
      await press(page, how, '[data-player-bar] [data-action="continue"]');
      await lib.waitForNewStep(page, id);
      continue;
    }
    const state = await lib.savedSession(page, L);
    const step = state && L.currentStep(state);
    if (!step || step.kind !== 'exercise') throw new Error(`No saved exercise for the step on screen (${id})`);
    const ex = step.exercise;
    if (onExercise) await onExercise(step, id);
    if (ex.type === 'tap-rhythm') {
      await press(page, how, '[data-action="skip"]');
    } else if (PLAY_TYPES.has(ex.type)) {
      // The first play step asks to start listening; after that the microphone may already be listening.
      await page.waitForTimeout(600);
      const start = page.locator('[data-player-bar] [data-action="primary"]');
      if ((await start.count()) > 0 && (await start.first().isEnabled()) && (await page.locator('[data-feedback]').count()) === 0) await press(page, how, '[data-player-bar] [data-action="primary"]');
    } else {
      const ok = await lib.giveAnswer(page, L, step, L.solve(ex), how);
      if (!ok) throw new Error(`Could not give a ${ex.type} answer by ${how}`);
      await press(page, how, '[data-player-bar] [data-action="check"]');
    }
    await page.waitForSelector('[data-feedback]', { timeout: PLAY_TYPES.has(ex.type) ? 60000 : 15000 });
    const tone = await page.getAttribute('[data-feedback]', 'data-feedback');
    const reaction = await page.locator('[data-reaction]').innerText().catch(() => '');
    log.push({ kind: 'exercise', key: step.key, type: ex.type, alternative: step.alternative, tone, reaction });
    if (verbose) console.log(`    ${id}: ${ex.type} -> ${tone}  ${reaction.replace(/\n/g, ' ')}`);
    await press(page, how, '[data-player-bar] [data-action="continue"]');
    await lib.waitForNewStep(page, id);
  }
  throw new Error('The lesson did not end');
}

/** Go back the way a learner would: the shell's Back button where it shows, else the browser's. */
async function goBack(page, how) {
  const back = page.locator('header button[aria-label="Back"]');
  if (how === 'touch' && (await back.count()) > 0 && (await back.first().isVisible())) await back.first().tap();
  else await page.goBack();
}

/** Close the shell's celebration dialogs (a new level, a streak milestone) the way a learner would. */
async function closeDialogs(page) {
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(500);
    if ((await page.locator('[role="dialog"]').count()) === 0) return;
    await page.keyboard.press('Escape');
  }
}

// ── Runs ────────────────────────────────────────────────────────────────────────────────────────

async function runPick() {
  const group = 'pick';
  await withApp({ mobile: true, theme: 'dark' }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'teachers', '[data-teacher="elena"]');
    check(group, 'three teachers, each with a drawn portrait', (await page.locator('[data-teacher] [data-portrait] svg').count()) === 3);
    check(group, 'a new learner is recommended Mia', (await page.getAttribute('[data-recommended]', 'data-recommended')) === 'mia');
    const speak = page.locator('[data-teacher="mia"] [data-speak]');
    check(group, 'a line in her voice can be read aloud on request', (await speak.count()) === 1);
    if (await speak.count()) {
      await speak.tap();
      await page.waitForTimeout(300);
      check(group, 'the read-aloud button turns into Stop while speaking (or the voice is absent)', /Stop|Hear Mia/.test(await speak.innerText()));
      await speak.tap();
    }
    check(group, 'no sideways scroll on the overview', (await overflow(page)) <= 1, await overflow(page));
    await shot(page, 'overview-phone-dark', true);

    // Dev: nothing written yet; says so, shows the plan, offers a way forward.
    await press(page, 'touch', '[data-open-teacher="dev"]');
    await page.waitForSelector('[data-preparing="dev"]', { timeout: 30000 });
    check(group, "Dev's page says his lessons are being written", true);
    check(group, "and lists his course's units from the plan", (await page.locator('[data-upcoming] li').count()) === 12, await page.locator('[data-upcoming] li').count());
    await shot(page, 'dev-phone-dark', true);
    await press(page, 'touch', '[data-switch="mia"]');
    await page.waitForSelector('[data-course-map]', { timeout: 60000 });
    check(group, 'the switcher leads to Mia, whose course map is there', (await page.evaluate(() => location.hash)) === '#teachers--mia');
    check(group, "her map's first lesson is the current one", (await page.locator('[data-node][data-state="current"]').count()) === 1);
    check(group, 'the rest of her plan is listed (11 units still being written)', (await page.locator('[data-upcoming] li').count()) === 11);
    check(group, 'her first lesson is offered in the thumb zone without scrolling', await page.locator('[data-action="next-lesson"]').isVisible());
    const box = await page.locator('[data-action="next-lesson"]').boundingBox();
    check(group, 'and it sits inside the first screen', box && box.y + box.height <= 844 - 70, box && Math.round(box.y));
    await shot(page, 'mia-phone-dark');

    // Back to the overview and start with the recommended teacher.
    await open(page, url, 'teachers', '[data-action="start"]');
    await press(page, 'touch', '[data-action="start"]');
    await page.waitForSelector('[data-teacher-player="mia"]', { timeout: 60000 });
    check(group, '"Start with Mia" opens her first lesson', (await page.evaluate(() => location.hash)) === '#teachers--mia--meet-your-guitar');
    check(group, 'full screen (the shell is in focus mode)', (await page.getAttribute('[data-immersive]', 'data-immersive')) === 'focus');
    check(group, 'no console errors', realErrors(errors).length === 0, realErrors(errors).join(' | '));
  });
}

async function runLesson(L, wav) {
  const group = 'lesson';
  await withApp({ mobile: true, theme: 'dark', fakeAudio: wav }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'teachers--mia--meet-your-guitar', '[data-teacher-player="mia"]');
    await shot(page, 'lesson-card-phone-dark');
    let task = null;
    const log = await playLesson(page, L, {
      how: 'touch',
      onExercise: async (_step, id) => {
        if (id.startsWith('s1:')) await shot(page, 'lesson-exercise-phone-dark');
      },
      onTask: async (id) => {
        if (task) throw new Error('The task card came back after Continue');
        task = { id };
        task.phase = await page.getAttribute('[data-task]', 'data-task-phase');
        task.tool = await page.getAttribute('[data-task]', 'data-task-tool');
        await shot(page, 'task-phone-dark');
        await press(page, 'touch', '[data-player-bar] [data-action="open-task"]');
        await page.waitForFunction(() => location.hash.startsWith('#metronome') || location.hash.startsWith('#play'), null, { timeout: 30000 });
        await page.waitForSelector('main[data-route="metronome"], main[data-route="play"]', { timeout: 60000 });
        task.route = await page.evaluate(() => location.hash);
        await page.waitForTimeout(1500);
        task.toolScreen = await page.getAttribute('main[data-route]', 'data-route');
        await shot(page, 'task-tool-phone-dark');
        // Practice there, recorded through the app's own progress module exactly as that tool
        // records it (a run of the song in the Player; a minute of Metronome), so the check does not
        // depend on playing the whole piece into a fake microphone.
        await page.evaluate(async (hash) => {
          const p = await import('/src/core/progress/index.ts');
          if (hash.startsWith('#play')) p.recordActivity({ kind: 'song', id: 'song:st-open-string-duet', title: 'Open-String Duet', accuracy: 0.9, durationSec: 40, completed: false, progress: 0.25, route: 'play', params: ['st-open-string-duet'] });
          else p.recordActivity({ kind: 'metronome', durationSec: 75, title: 'Metronome: 60 BPM', route: 'metronome' });
        }, task.route);
        await page.waitForTimeout(300);
        await goBack(page, 'touch');
        await page.waitForSelector('[data-task][data-task-phase="back"]', { timeout: 60000 });
        task.backHash = await page.evaluate(() => location.hash);
        task.backId = await lib.stepId(page);
        task.done = await page.locator('[data-task-done]').innerText().catch(() => '');
        task.toast = await page.locator('text=Picked up where you left off').count();
        await shot(page, 'task-back-phone-dark');
        await press(page, 'touch', '[data-player-bar] [data-action="continue"]');
        await lib.waitForNewStep(page, id);
      },
    });
    const cards = log.filter((e) => e.kind === 'card');
    check(group, 'Mia is on every teaching card', cards.length >= 3 && cards.every((c) => c.teacher === 1), JSON.stringify(cards));
    const exercises = log.filter((e) => e.kind === 'exercise');
    check(group, 'every tapped exercise was answered right', exercises.length >= 6 && exercises.filter((e) => !PLAY_TYPES.has(e.type)).every((e) => e.tone === 'ok'), JSON.stringify(exercises.map((e) => `${e.type}:${e.tone}`)));
    check(group, 'after each answer Mia reacts in her own words', exercises.every((e) => /^\s*Mia:/.test(e.reaction)), JSON.stringify(exercises.map((e) => e.reaction)));
    // Each play step, at its last attempt, heard the right note from the microphone. (On a busy
    // machine the tracker can miss a note; the step then comes back, as it would for a learner.)
    const plays = exercises.filter((e) => e.type === 'play-note');
    const lastTry = new Map(plays.map((e) => [e.key, e]));
    check(group, 'the three play steps heard the fake microphone (not the tapping version)', lastTry.size === 3 && [...lastTry.values()].every((e) => e.tone === 'ok' && !e.alternative), JSON.stringify(plays.map((e) => `${e.key}:${e.tone}${e.alternative ? ':alt' : ''}`)));
    if (plays.length > 3) console.log(`  note  [lesson] ${plays.length - 3} play attempt(s) missed by the tracker and came back`);
    check(group, 'the task card offered a tool', task && task.phase === 'ready', JSON.stringify(task));
    check(group, 'it opened the Open-String Duet in the Player, bars 1 to 4 at 75 % (or its fallback tool)', task && (task.route === '#play--st-open-string-duet--m1-4--t75' || task.route === '#metronome') && (task.toolScreen === 'play' || task.toolScreen === 'metronome'), task && `${task.route} ${task.toolScreen}`);
    check(group, 'Back returned to the same lesson, on the same task', task && task.backHash === '#teachers--mia--meet-your-guitar' && task.backId === task.id, JSON.stringify(task));
    check(group, 'the task card says what it saw done there', task && /Open-String Duet: 90% of the notes|Metronome/.test(task.done), task && task.done);
    check(group, 'and does not show the generic "picked up" toast', task && task.toast === 0, task && task.toast);

    await page.waitForSelector('[data-summary="completed"]', { timeout: 30000 });
    check(group, 'the lesson ends completed, with Mia saying a word', (await page.locator('[data-teacher-says]').count()) === 1);
    const xp = await page.locator('[data-stat="xp"]').innerText().catch(() => '');
    check(group, 'the summary shows the XP of a teacher lesson (20 when perfect, 15 otherwise)', plays.length === 3 ? /\+20\b/.test(xp) : /\+15\b/.test(xp), xp.replace(/\n/g, ' '));
    await closeDialogs(page);
    await shot(page, 'summary-phone-dark');
    await page.waitForTimeout(900);
    const progress = await lib.storedProgress(page);
    const skill = progress && progress.skills['teacher:mia:meet-your-guitar'];
    check(group, 'progress: the lesson skill is completed', skill && skill.completed === true, JSON.stringify(skill && { completed: skill.completed }));
    check(group, 'progress: the facts became review cards', progress && progress.srs.items['mia:string-numbers'] && progress.srs.items['mia:open-string'], Object.keys((progress && progress.srs.items) || {}).join(','));
    check(group, 'progress: Mia is now the learner\'s teacher', progress && progress.profile.teacher === 'mia', progress && progress.profile.teacher);
    check(group, 'the pending task is forgotten once the lesson is done', (await page.evaluate(() => localStorage.getItem('ssa:teachers.task'))) === null);
    await closeDialogs(page);
    await press(page, 'touch', '[data-action="next"]');
    await page.waitForTimeout(800);
    check(group, '"Next lesson" opens the next one', (await page.evaluate(() => location.hash)) === '#teachers--mia--sit-and-hold');
    check(group, 'no sideways scroll', (await overflow(page)) <= 1, await overflow(page));
    check(group, 'no console errors', realErrors(errors).length === 0, realErrors(errors).join(' | '));
  });
}

async function runShow(L, wav) {
  const group = 'show';
  await withApp({ theme: 'light', fakeAudio: `${wav}%noloop` }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'teachers--mia--first-week-show', '[data-teacher-player="mia"]');
    const tasks = [];
    let performance = null;
    const log = await playLesson(page, L, {
      how: 'mouse',
      onExercise: async (step, id) => {
        if (await page.locator('[data-performance]').count()) {
          performance = { id, framed: true, words: await page.locator('[data-performance]').innerText() };
          await shot(page, 'show-desktop-light');
        }
      },
      onTask: async (id) => {
        const tool = await page.getAttribute('[data-task]', 'data-task-tool');
        tasks.push(tool);
        if (tool === 'player') {
          await press(page, 'mouse', '[data-player-bar] [data-action="open-task"]');
          await page.waitForSelector('main[data-route="play"]', { timeout: 60000 });
          tasks.push(await page.evaluate(() => location.hash));
          await page.waitForTimeout(1500);
          await page.goBack();
          await page.waitForSelector('[data-task][data-task-phase="back"]', { timeout: 60000 });
          await press(page, 'mouse', '[data-player-bar] [data-action="continue"]');
        } else {
          await press(page, 'mouse', '[data-player-bar] [data-action="skip-task"]');
        }
        await lib.waitForNewStep(page, id);
      },
    });
    check(group, 'the lesson sends the learner to the Tuner, Technique and the Player', ['tuner', 'technique', 'player'].every((t) => tasks.includes(t)), tasks.join(','));
    check(group, 'the Player task opens Hot Cross Buns in flow mode, and Back returns', tasks.includes('#play--hot-cross-buns--flow'), tasks.join(','));
    check(group, 'the performance is framed as the show', performance && performance.framed && /Your show/i.test(performance.words), performance && performance.words);
    const show = log.filter((e) => e.type === 'play-phrase');
    check(group, 'the microphone heard the whole tune (not the tapping version)', show.length >= 1 && show[0].tone === 'ok' && !show[0].alternative, JSON.stringify(show));
    await page.waitForSelector('[data-unit-complete="mia-hello-guitar"]', { timeout: 30000 });
    check(group, 'the unit ends with Mia\'s celebration', true);
    const words = await page.locator('[data-unit-complete]').innerText();
    check(group, 'which names the piece and the unit', /Hot Cross Buns/.test(words) && /Hello, guitar/.test(words) && /Unit 1 complete/i.test(words), words.slice(0, 200));
    check(group, 'and offers to play it with the band and to set a daily goal', (await page.locator('[data-action="perform-band"]').count()) === 1 && (await page.locator('[data-action="daily-goal"]').count()) === 1);
    await page.waitForTimeout(1500);
    await closeDialogs(page);
    await shot(page, 'unit-complete-desktop-light');
    await shot(page, 'unit-complete-desktop-light-full', true);
    const progress = await lib.storedProgress(page);
    check(group, 'progress: the milestone lesson is completed', progress && progress.skills['teacher:mia:first-week-show'] && progress.skills['teacher:mia:first-week-show'].completed === true);
    check(group, 'no sideways scroll', (await overflow(page)) <= 1, await overflow(page));
    check(group, 'no console errors', realErrors(errors).length === 0, realErrors(errors).join(' | '));
  });
}

async function runLooks() {
  const group = 'looks';
  const variants = [
    { name: 'phone-dark', mobile: true, theme: 'dark' },
    { name: 'phone-light', mobile: true, theme: 'light' },
    { name: 'desktop-dark', mobile: false, theme: 'dark' },
    { name: 'desktop-light', mobile: false, theme: 'light' },
  ];
  for (const v of variants) {
    await withApp({ mobile: v.mobile, theme: v.theme }, async ({ page, url, errors }) => {
      await seed(page);
      const views = [
        ['overview', 'teachers', '[data-teacher="elena"]'],
        ['mia', 'teachers--mia', '[data-course-map]'],
        ['dev', 'teachers--dev', '[data-preparing="dev"]'],
        ['card', 'teachers--mia--meet-your-guitar', '[data-teacher-player="mia"]'],
        ['art', 'teachers--mia--hot-cross-buns', '[data-teacher-player="mia"]'],
      ];
      for (const [name, hash, sel] of views) {
        await open(page, url, hash, sel);
        await page.waitForTimeout(600);
        await shot(page, `${name}-${v.name}`, name !== 'card' && name !== 'art');
        check(group, `${v.name}: ${name} is no wider than the screen`, (await overflow(page)) <= 1, await overflow(page));
      }
      // A task card: lesson 3's task, reached by skipping along (Continue on cards, "I don't know" on questions).
      await open(page, url, 'teachers--mia--tune-up', '[data-teacher-player="mia"]');
      for (let i = 0; i < 20 && (await page.locator('[data-task]').count()) === 0; i++) {
        const id = await lib.stepId(page);
        const cont = page.locator('[data-player-bar] [data-action="continue"]');
        if (await cont.count()) await cont.click();
        else {
          await page.locator('[data-action="skip"]').click();
          await page.waitForSelector('[data-feedback]', { timeout: 15000 });
          await page.locator('[data-player-bar] [data-action="continue"]').click();
        }
        await lib.waitForNewStep(page, id);
      }
      check(group, `${v.name}: a task card shows its tool and an Open button`, (await page.locator('[data-player-bar] [data-action="open-task"]').count()) === 1);
      await shot(page, `task-${v.name}`);
      check(group, `${v.name}: the task card is no wider than the screen`, (await overflow(page)) <= 1, await overflow(page));
      // The lesson is saved half-way: the overview offers to pick it up.
      await open(page, url, 'teachers', '[data-teacher="elena"]');
      check(group, `${v.name}: the overview offers to pick up the lesson where it was left`, (await page.locator('[data-resume="tune-up"]').count()) === 1);
      if (v.name === 'phone-light' || v.name === 'desktop-dark') await shot(page, `overview-resume-${v.name}`);
      check(group, `${v.name}: no console errors`, realErrors(errors).length === 0, realErrors(errors).join(' | '));
    });
  }
  // A phone held sideways.
  await withApp({ mobile: true, viewport: { width: 844, height: 390 }, theme: 'dark' }, async ({ page, url, errors }) => {
    await seed(page);
    await open(page, url, 'teachers--mia--meet-your-guitar', '[data-teacher-player="mia"]');
    await shot(page, 'card-phone-sideways');
    const cont = await page.locator('[data-player-bar] [data-action="continue"]').boundingBox();
    check(group, 'sideways: Continue is on screen', cont && cont.y + cont.height <= 390, cont && Math.round(cont.y));
    check(group, 'sideways: no wider than the screen', (await overflow(page)) <= 1, await overflow(page));
    await open(page, url, 'teachers', '[data-teacher="elena"]');
    await shot(page, 'overview-phone-sideways');
    check(group, 'sideways: the overview is no wider than the screen', (await overflow(page)) <= 1, await overflow(page));
    check(group, 'sideways: no console errors', realErrors(errors).length === 0, realErrors(errors).join(' | '));
  });
}

(async () => {
  const L = want('lesson') || want('show') ? await loadTs('/src/lessons/index.ts') : null;
  const strings = path.join(OUT, 'teachers-open-strings.wav');
  const buns = path.join(OUT, 'teachers-hot-cross-buns.wav');
  if (want('lesson')) await makeWav(strings, [[40, 2], [55, 2], [64, 2]], { gap: 0.4, tail: 0.4 });
  if (want('show')) {
    // Hot Cross Buns at 72 BPM (a quarter is 0.83 s), after a breath of silence: B A G, B A G, G G A A, B A G.
    const q = 60 / 72;
    const tune = [[59, q], [57, q], [55, 2 * q], [59, q], [57, q], [55, 2 * q], [55, q], [55, q], [57, q], [57, q], [59, q], [57, q], [55, 2 * q]];
    await makeWav(buns, tune, { lead: 2.5, tail: 2 });
  }
  const runs = [
    ['pick', () => runPick()],
    ['lesson', () => runLesson(L, strings)],
    ['show', () => runShow(L, buns)],
    ['looks', () => runLooks()],
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
