#!/usr/bin/env node
/**
 * Browser check of Today (#home) for a brand-new learner and for one with a week of use, on a phone
 * and a desktop. Run: node e2e/home.cjs [--verbose]
 *
 * The learners are built with the app's own progress store (loaded through Vite) and handed to
 * the page as saved storage, so the screen reads exactly what the app would have saved:
 *
 *  new       onboarded a minute ago (beginner, Mia, the Regular goal of 20 XP), nothing played.
 *  week      seven days in a row of tuning, a theory lesson, a lesson with Mia, a song and a
 *            planned practice session; review cards due; a song left half-way; today only tuned.
 *
 * For each learner and size it checks: one obvious next step (exactly one primary button, in the
 * hero, visible without scrolling, naming the first open step); nothing empty (plan steps, quests,
 * reviews, the continue or first-look cards and the tip all have content); the plan matches the
 * goal (its minutes are about the goal's ten, the steps' XP covers the goal's 20); Today fetches
 * the practice library (exercises, songs, unit drills) as a lazy chunk of its own; no sideways
 * scroll; no console errors.
 * Screenshots go to e2e/out/home-*.png.
 *
 * Prints PASSED or FAILED and exits non-zero on failure.
 */
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, loadTs, VIEWPORTS, ROOT } = require('./lib/harness.cjs');

const verbose = process.argv.includes('--verbose');
const OUT = path.join(ROOT, 'e2e', 'out');
const DAY = 86_400_000;
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail !== '' ? `  (${String(detail).slice(0, 300)})` : ''}`);
  return !!pass;
}

/** The two learners' save files, made by the progress store itself. */
async function buildSeeds(now) {
  const progress = await loadTs('/src/core/progress/index.ts');
  const make = () => {
    const clock = { t: now, timeZone: 'UTC', now: () => clock.t };
    const storage = progress.memoryStorage();
    const store = progress.createProgressStore({ clock, storage, deviceId: 'e2e-home', timers: { set: () => 0, clear: () => undefined } });
    const actions = progress.createActions(() => store);
    return { clock, store, actions, saved: () => (store.flush(), storage.data.get('progress')) };
  };
  const onboard = (actions) => actions.completeOnboarding({ name: 'Sam', experience: 'beginner', teacher: 'mia', dailyGoalXp: 20, handedness: 'right' });

  const fresh = make();
  fresh.clock.t = now - 60_000;
  onboard(fresh.actions);

  const week = make();
  week.clock.t = now - 7 * DAY - 2 * 3_600_000;
  onboard(week.actions);
  const lessons = ['a-sound-is-a-vibration', 'pitch-high-and-low', 'loud-is-not-high', 'what-a-fret-does', 'octaves', 'naming-the-strings', 'tuning-up'];
  for (let d = 0; d < 7; d++) {
    week.clock.t = now - (7 - d) * DAY + 0;
    const a = week.actions;
    a.recordActivity({ kind: 'tuner', durationSec: 60, route: 'tuner' });
    a.recordActivity({ kind: 'theory-lesson', id: `theory:sound-and-pitch:${lessons[d]}`, title: `Lesson ${d + 1}`, accuracy: 0.9, durationSec: 180, route: 'learn', params: ['sound-and-pitch', lessons[d]] });
    a.recordActivity({ kind: 'teacher-lesson', id: `teacher:mia:lesson-${d + 1}`, title: `Mia, lesson ${d + 1}`, accuracy: 0.85, durationSec: 480, route: 'teachers', params: ['mia'] });
    a.recordActivity({ kind: 'song', id: 'song:hot-cross-buns', title: 'Hot Cross Buns', accuracy: 0.8 + d / 50, durationSec: 240, route: 'play', params: ['hot-cross-buns'] });
    a.recordActivity({ kind: 'practice', title: '10-minute plan', durationSec: 600, route: 'practice', params: [], meta: { blocks: 3, done: 3, plannedMin: 10 } });
  }
  week.actions.addReviewItems(lessons.slice(0, 5).map((l) => ({ id: `theory-path:${l}`, kind: 'theory-fact', ref: l })));
  // A song left half-way two days ago, and today only a tune-up so far.
  week.clock.t = now - 2 * DAY;
  week.actions.recordActivity({ kind: 'song', id: 'song:lightly-row', title: 'Lightly Row', accuracy: 0.6, durationSec: 90, completed: false, progress: 0.5, route: 'play', params: ['lightly-row'] });
  week.clock.t = now - 3_600_000;
  week.actions.recordActivity({ kind: 'tuner', durationSec: 45, route: 'tuner' });
  week.clock.t = now;

  return { new: fresh.saved(), week: week.saved(), streak: progress.selectStreak(week.store.getState()).current };
}

async function openHome(browser, url, saved, { mobile, onResponse }) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[mobile ? 'mobile' : 'desktop'],
    deviceScaleFactor: 1,
    colorScheme: mobile ? 'dark' : 'light',
    hasTouch: !!mobile,
    isMobile: !!mobile,
    timezoneId: 'UTC',
  });
  await context.addInitScript((progress) => {
    try {
      if (localStorage.getItem('e2e:seeded') != null) return;
      localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
      localStorage.setItem('ssa:progress', progress);
      localStorage.setItem('e2e:seeded', '1');
    } catch {
      /* storage blocked */
    }
  }, saved);
  const page = await context.newPage();
  if (onResponse) page.on('response', onResponse);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((re) => re.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  await page.goto(`${url}#home`, { waitUntil: 'load' });
  await page.waitForSelector('main[data-route="home"] [data-home-hero]', { timeout: 30000 });
  return { context, page, errors };
}

/** What the screen shows, read in one go. */
function readHome(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main[data-route="home"]');
    const hero = main.querySelector('[data-home-hero]');
    const primaries = [...main.querySelectorAll('[data-ui-primary]')].filter((el) => el.getBoundingClientRect().height > 0);
    const next = main.querySelector('[data-home-next]');
    const plan = main.querySelector('[data-home-plan]');
    const steps = plan
      ? [...plan.children].map((li) => ({ text: li.textContent.replace(/\s+/g, ' ').trim(), href: li.querySelector('a')?.getAttribute('href') ?? '', done: !!li.querySelector('[aria-label="Done"]') }))
      : [];
    const sections = [...main.querySelectorAll('section')].map((s) => ({ title: s.querySelector('h2,h3')?.textContent?.trim() ?? '', text: s.textContent.replace(/\s+/g, ' ').trim() }));
    const r = next?.getBoundingClientRect();
    return {
      title: document.querySelector('h1')?.textContent?.trim() ?? '',
      heroText: hero?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      primaries: primaries.length,
      primaryInHero: primaries.length === 1 && hero.contains(primaries[0]),
      nextText: next?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      nextVisible: !!r && r.top >= 0 && r.bottom <= window.innerHeight,
      steps,
      planMinutes: Number(plan?.getAttribute('data-minutes') ?? NaN),
      sections,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function checkLearner(browser, url, seeds, who, mobile) {
  const group = `${who} ${mobile ? 'phone' : 'desktop'}`;
  const started = Date.now();
  let libraryAt = 0;
  const { context, page, errors } = await openHome(browser, url, seeds[who], { mobile, onResponse: (r) => {
    if (!libraryAt && /practice\/model\/library\.ts/.test(r.url())) libraryAt = Date.now();
  } });
  try {
    const first = (await readHome(page)).steps.map((st) => st.href);
    // The practice library (exercises, songs, unit drills) is a lazy chunk Today asks for itself.
    for (let i = 0; i < 60 && !libraryAt; i++) await page.waitForTimeout(250);
    await page.waitForTimeout(500);
    const s = await readHome(page);
    check(group, 'Today loads the practice library as its own lazy chunk', libraryAt > 0, libraryAt ? `${libraryAt - started} ms after navigation` : 'never requested');
    if (verbose) console.log(`        plan at first paint: ${first.join(' ')}; with the library: ${s.steps.map((st) => st.href).join(' ')}`);
    check(group, 'greets the learner by name', s.title.includes('Sam'), s.title);
    check(group, 'exactly one primary button, and it is the hero’s', s.primaries === 1 && s.primaryInHero, `${s.primaries} primary`);
    check(group, 'the next step is visible without scrolling', s.nextVisible, s.nextText);
    check(group, 'the hero names a real step of the plan', s.steps.some((st) => st.text.includes(s.nextText.replace(/^(Start|Next): /, '').slice(0, 20))), `${s.nextText} | ${s.steps.map((st) => st.text.slice(0, 50)).join(' | ')}`);
    const own = s.steps.filter((st) => !/Review \d+ cards?/.test(st.text));
    check(group, 'three steps for the Regular goal (plus due reviews), each a link', own.length === 3 && s.steps.every((st) => st.href.startsWith('#')), s.steps.map((st) => st.href).join(' '));
    check(group, 'the plan comes to about the goal’s 10 minutes', Math.abs(s.planMinutes - 10) <= 2 || (who === 'week' && s.planMinutes <= 10), `${s.planMinutes} min`);
    const xp = s.steps.reduce((sum, st) => sum + Number(/(\d+) XP/.exec(st.text)?.[1] ?? 0), 0);
    check(group, 'the steps earn at least the goal’s 20 XP', xp >= 20, `${xp} XP`);
    const byTitle = (t) => s.sections.find((x) => x.title.startsWith(t));
    check(group, 'daily quests are listed', /\d \/ \d/.test(byTitle('Daily quests')?.text ?? ''), byTitle('Daily quests')?.text);
    check(group, 'reviews say something useful', (byTitle('Reviews')?.text.length ?? 0) > 30, byTitle('Reviews')?.text);
    const more = who === 'new' ? byTitle('Worth a first look') : byTitle('Continue');
    check(group, who === 'new' ? 'a new learner gets first-look cards' : 'a returning learner gets Continue cards', (more?.text.length ?? 0) > 40, more?.text);
    check(group, 'no sideways scroll', s.sideways <= 1, `${s.sideways}px`);
    if (who === 'week') {
      check(group, 'the streak shows', s.heroText.includes(`${seeds.streak} day streak`), s.heroText);
      check(group, 'tuning is ticked and the hero moves on to the next step', /Next: /.test(s.nextText) && s.steps[0].done && !s.nextText.includes('Tune up'), `${s.nextText} | ${s.steps[0]?.text}`);
      check(group, 'due cards come into the plan', s.steps.some((st) => /Review \d+ cards?/.test(st.text)), s.steps.map((st) => st.text.slice(0, 40)).join(' | '));
      const cont = byTitle('Continue')?.text ?? '';
      check(group, 'Continue puts the half-played song first', /left off\.\s*Lightly Row/.test(cont), cont);
      check(group, 'Continue leaves out bare tool visits (the tuner, the practice screen)', !/Tuner ·|Practice session ·/.test(cont) && cont.includes('Hot Cross Buns'), cont);
    } else {
      check(group, 'a new learner starts with tuning', /^Start: Tune up/.test(s.nextText), s.nextText);
    }
    await page.screenshot({ path: path.join(OUT, `home-${who}-${mobile ? 'phone' : 'desktop'}.png`), fullPage: true });
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}

(async () => {
  const now = Date.now();
  const seeds = await buildSeeds(now);
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const who of ['new', 'week']) {
      for (const mobile of [true, false]) {
        try {
          await checkLearner(browser, server.url, seeds, who, mobile);
        } catch (e) {
          check(`${who} ${mobile ? 'phone' : 'desktop'}`, 'ran without throwing', false, e && e.stack);
        }
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  console.log(failed.length ? 'FAILED' : 'PASSED');
  process.exit(failed.length ? 1 : 0);
})();
