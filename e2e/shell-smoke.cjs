#!/usr/bin/env node
/**
 * Smoke test of the app shell. Run: node e2e/shell-smoke.cjs [--verbose] [--only route,route]
 *
 * What it checks, on a phone (390 x 844, touch) and on a desktop (1280 x 800):
 *
 *  routes       every route in the registry (src/app/routes.ts) opens: <main data-route="name">
 *               appears, the loading skeleton gives way to a screen, the screen is not the shell's
 *               error panel, the page does not scroll sideways, nothing is logged with
 *               console.error and nothing throws
 *  navigation   phone: the five tabs lead to their screens and mark themselves (aria-current), a
 *               screen inside a section marks its tab, an immersive route hides the tab bar and its
 *               Back button returns. desktop: the sidebar does the same and lists every hub screen
 *  keyboard     the first Tab stop is "Jump to content", and it moves focus to <main>
 *  hubs         each hub links to every screen of its section, and its search finds and opens one
 *  first run    the first-run flow opens by itself on Today for a new learner, traps focus, keeps
 *               the answers, writes them to the profile and never opens again; "Skip for now" and
 *               Escape close it, and #home--setup brings it back
 *  resilience   an address that names no screen lands on Today; a screen that throws shows the
 *               error panel while the navigation keeps working; a screen that loads slowly shows
 *               the skeleton; storage that throws does not stop the app
 *
 * A route that fails is tried once more after a short wait, because other people may be editing a
 * feature while this runs. Prints one line per group and exits non-zero if any check failed.
 *
 * Note on "does not scroll sideways": on a touch viewport Chromium zooms out to fit wide content
 * and reports the wider size as window.innerWidth, so the check compares scrollWidth with
 * documentElement.clientWidth and with the viewport this script asked for.
 */
const { withApp, loadTs, VIEWPORTS } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',') : null;

const SKIP_ONBOARDING = { 'ssa:shell.onboarding': '{"skipped":true}' };
const TABS = [
  ['Today', 'home'],
  ['Learn', 'study'],
  ['Play', 'studio'],
  ['Tools', 'tools'],
  ['Me', 'profile'],
];

/** Console output the browser produces by itself that says nothing about the app. */
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];

const results = []; // { group, name, pass, detail }
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass, detail: detail ? String(detail) : '' });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail ? `  (${String(detail).slice(0, 300)})` : ''}`);
  return !!pass;
}

/** Vite echoes browser errors to this terminal; mute that while a step breaks a screen on purpose. */
async function quietly(fn) {
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  const pass = (write) => (chunk, ...rest) => (typeof chunk === 'string' && !/^\s*(ok|FAIL)\s/.test(chunk) && !chunk.startsWith('  ') && !chunk.startsWith('==') ? true : write(chunk, ...rest));
  process.stdout.write = pass(out);
  process.stderr.write = () => true;
  try {
    return await fn();
  } finally {
    // Let the dev server finish printing what it has queued before the terminal is given back.
    await new Promise((resolve) => setTimeout(resolve, 150));
    process.stdout.write = out;
    process.stderr.write = err;
  }
}

/** A browser context shaped like the harness's own, plus error capture and storage seeding. */
async function openContext(browser, url, { mobile, seed = SKIP_ONBOARDING, init, reducedMotion = false }) {
  const viewport = VIEWPORTS[mobile ? 'mobile' : 'desktop'];
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'dark', hasTouch: !!mobile, isMobile: !!mobile, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  if (init) await context.addInitScript(init);
  if (seed) {
    await context.addInitScript((entries) => {
      try {
        for (const [key, value] of Object.entries(entries)) if (localStorage.getItem(key) == null) localStorage.setItem(key, value);
      } catch {
        /* storage is broken on purpose in one of the checks */
      }
    }, seed);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (!BENIGN.some((pattern) => pattern.test(text))) errors.push(`console: ${text}`);
  });
  const goto = async (hash, { settle = 250 } = {}) => {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route]', { timeout: 20000 });
    await page.waitForTimeout(settle);
  };
  /** Wait until the screen for `name` has replaced the loading skeleton. */
  const screenReady = async (name, timeout = 20000) => {
    await page.waitForFunction(
      (route) => {
        const main = document.querySelector(`main[data-route="${route}"]`);
        // The shell's own skeleton, not a screen that marks one of its parts busy.
        return !!main && main.childElementCount > 0 && !main.querySelector('[data-shell-fallback]');
      },
      name,
      { timeout },
    );
  };
  const takeErrors = () => errors.splice(0, errors.length);
  return { context, page, errors, goto, screenReady, takeErrors, viewport, close: () => context.close() };
}

/** What a screen looks like from the shell's side. Runs in the page. */
function inspect(expectedWidth) {
  const root = document.documentElement;
  const main = document.querySelector('main[data-route]');
  const alert = main ? main.querySelector('[role="alert"]') : null;
  const failed = !!alert && /hit a problem|did not load/.test(alert.textContent || '');
  const shell = document.querySelector('[data-layout]');
  return {
    route: main ? main.getAttribute('data-route') : null,
    children: main ? main.childElementCount : 0,
    busy: !!(main && main.querySelector('[data-shell-fallback]')),
    failed,
    failure: failed ? (alert.textContent || '').replace(/\s+/g, ' ').slice(0, 160) : '',
    h1: main ? main.querySelectorAll('h1').length : 0,
    // Wider than the viewport: content sticks out (scrollWidth), or a touch browser zoomed out to fit it (innerWidth).
    overflow: Math.max(root.scrollWidth - root.clientWidth, window.innerWidth - expectedWidth, root.scrollWidth - expectedWidth),
    layout: shell ? shell.getAttribute('data-layout') : null,
    immersive: shell ? shell.getAttribute('data-immersive') : null,
    title: document.title,
  };
}

async function visitRoute(ctx, name) {
  ctx.takeErrors();
  let info = null;
  let problem = '';
  try {
    await ctx.goto(name, { settle: 0 });
    await ctx.screenReady(name);
    await ctx.page.waitForTimeout(350);
    info = await ctx.page.evaluate(inspect, ctx.viewport.width);
  } catch (e) {
    problem = `did not open: ${String(e.message || e).split('\n')[0]}`;
  }
  const errors = ctx.takeErrors();
  if (!problem && info) {
    if (info.route !== name) problem = `main[data-route] is "${info.route}"`;
    else if (info.failed) problem = `error panel: ${info.failure}`;
    else if (info.overflow > 1) problem = `scrolls sideways by ${info.overflow}px`;
  }
  if (!problem && errors.length) problem = errors[0].replace(/\s+/g, ' ').slice(0, 220);
  return { name, ok: !problem, problem, info, errorCount: errors.length };
}

async function sweepRoutes(ctx, label, routes) {
  const failures = [];
  const notes = [];
  let retried = 0;
  for (const route of routes) {
    let result = await visitRoute(ctx, route.name);
    if (!result.ok) {
      // Someone may be mid-edit on that feature: give it one more go.
      await ctx.page.waitForTimeout(1500);
      const again = await visitRoute(ctx, route.name);
      if (again.ok) retried += 1;
      result = again;
    }
    if (!result.ok) failures.push(`${route.name}: ${result.problem}`);
    else if (result.info && result.info.h1 !== 1) notes.push(`${route.name} has ${result.info.h1} h1`);
    if (verbose) console.log(`    ${result.ok ? 'ok  ' : 'FAIL'} ${label} #${route.name}${result.ok ? '' : `  ${result.problem}`}`);
  }
  check('routes', `${label}: ${routes.length - failures.length}/${routes.length} routes open cleanly${retried ? ` (${retried} on a second try)` : ''}`, failures.length === 0, failures.join(' | '));
  return { failures, notes };
}

async function phoneNavigation(ctx) {
  const { page } = ctx;
  const group = 'navigation';
  await ctx.goto('home');
  await ctx.screenReady('home');
  ctx.takeErrors();
  const tabbar = page.locator('nav[aria-label="Main"]');
  const labels = await tabbar.locator('a').allInnerTexts();
  check(group, 'phone: the tab bar has Today, Learn, Play, Tools, Me', labels.map((l) => l.trim()).join(',') === TABS.map((t) => t[0]).join(','), labels.join(','));
  const wrong = [];
  for (const [label, route] of [...TABS.slice(1), TABS[0]]) {
    await tabbar.locator('a', { hasText: label }).click();
    try {
      await ctx.screenReady(route, 10000);
    } catch {
      wrong.push(`${label} did not open #${route}`);
      continue;
    }
    const state = await page.evaluate((text) => {
      const link = [...document.querySelectorAll('nav[aria-label="Main"] a')].find((a) => a.textContent.trim() === text);
      return { current: link ? link.getAttribute('aria-current') : null, marked: document.querySelectorAll('nav[aria-label="Main"] a[aria-current]').length, hash: location.hash, title: document.title };
    }, label);
    if (state.current !== 'page' || state.marked !== 1) wrong.push(`${label}: aria-current="${state.current}", ${state.marked} tabs marked`);
    if (!state.title.startsWith(label === 'Me' ? 'Me' : label)) wrong.push(`${label}: title "${state.title}"`);
  }
  check(group, 'phone: each tab opens its screen and is the one marked aria-current="page"', wrong.length === 0, wrong.join(' | '));

  await ctx.goto('tuner');
  await ctx.screenReady('tuner');
  const inSection = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Main"] a[aria-current]')].map((a) => `${a.textContent.trim()}=${a.getAttribute('aria-current')}`).join(','));
  check(group, 'phone: a screen inside a section marks its tab (Tuner -> Tools)', inSection === 'Tools=true', inSection);

  // Immersive: the player hides the tab bar and offers Back instead.
  await ctx.goto('tools');
  await ctx.screenReady('tools');
  await page.evaluate(() => {
    window.location.hash = '#play';
  });
  await page.waitForSelector('[data-immersive="focus"]', { timeout: 10000 }).catch(() => undefined);
  const immersive = await page.evaluate(() => ({ level: document.querySelector('[data-immersive]')?.getAttribute('data-immersive'), tabs: !!document.querySelector('nav[aria-label="Main"]'), back: !!document.querySelector('header button[aria-label="Back"]') }));
  check(group, 'phone: an immersive route hides the tab bar and shows Back', immersive.level === 'focus' && !immersive.tabs && immersive.back, JSON.stringify(immersive));
  if (immersive.back) {
    await page.locator('header button[aria-label="Back"]').click();
    await page.waitForFunction(() => document.querySelector('main')?.getAttribute('data-route') === 'tools', null, { timeout: 10000 }).catch(() => undefined);
  }
  const after = await page.evaluate(() => ({ route: document.querySelector('main')?.getAttribute('data-route'), tabs: !!document.querySelector('nav[aria-label="Main"]') }));
  check(group, 'phone: Back returns to where the learner came from, with the tab bar', after.route === 'tools' && after.tabs, JSON.stringify(after));

  // The four progress chips open the stats sheet; Escape closes it and focus goes back.
  await ctx.goto('home');
  await ctx.screenReady('home');
  const chip = page.locator('header [role="group"][aria-label="Your progress today"] button').first();
  await chip.click();
  const opened = await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 5000 }).then(() => true, () => false);
  await page.keyboard.press('Escape');
  const closed = await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 5000 }).then(() => true, () => false);
  check(group, 'phone: a progress chip opens the stats sheet and Escape closes it', opened && closed, `opened=${opened} closed=${closed}`);
  const noise = ctx.takeErrors();
  check(group, 'phone: navigating logged no errors', noise.length === 0, noise[0]);
}

async function desktopNavigation(ctx, routes) {
  const { page } = ctx;
  const group = 'navigation';
  await ctx.goto('home');
  await ctx.screenReady('home');
  ctx.takeErrors();
  const layout = await page.evaluate(() => document.querySelector('[data-layout]')?.getAttribute('data-layout'));
  check(group, 'desktop: the sidebar layout is used', layout === 'wide', layout);
  const nav = page.locator('aside nav[aria-label="Main"]');
  const wrong = [];
  for (const [label, route] of [...TABS.slice(1), TABS[0]]) {
    await nav.locator(`a[href="#${route}"]`).click();
    try {
      await ctx.screenReady(route, 10000);
    } catch {
      wrong.push(`${label} did not open #${route}`);
      continue;
    }
    const current = await nav.locator(`a[href="#${route}"]`).getAttribute('aria-current');
    const pages = await nav.locator('a[aria-current="page"]').count();
    if (current !== 'page' || pages !== 1) wrong.push(`${label}: aria-current="${current}", ${pages} links marked as the page`);
  }
  check(group, 'desktop: each sidebar destination opens its screen and is marked aria-current="page"', wrong.length === 0, wrong.join(' | '));

  // Every hub screen is reachable from the sidebar (folded sections are opened first).
  const missing = [];
  for (const toggle of await nav.locator('button[aria-expanded="false"]').all()) await toggle.click();
  const hrefs = await nav.locator('a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  for (const route of routes.filter((r) => r.inHub)) if (!hrefs.includes(`#${route.name}`)) missing.push(route.name);
  check(group, 'desktop: the sidebar lists every hub screen of the registry', missing.length === 0, `missing: ${missing.join(', ')}`);

  const sub = routes.find((r) => r.inHub && r.section === 'tools');
  if (sub) {
    await nav.locator(`a[href="#${sub.name}"]`).click();
    await ctx.screenReady(sub.name, 10000).catch(() => undefined);
    const marks = await nav.locator('a[aria-current]').evaluateAll((links) => links.map((a) => `${a.getAttribute('href')}=${a.getAttribute('aria-current')}`).join(','));
    check(group, `desktop: a screen inside a section marks itself and its section (#${sub.name})`, marks === `#tools=true,#${sub.name}=page`, marks);
  }

  // Keyboard: on a fresh visit the skip link comes first and takes focus to the content.
  await ctx.goto('home');
  await page.reload({ waitUntil: 'load' });
  await ctx.screenReady('home');
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    const rect = el.getBoundingClientRect();
    return { text: (el.textContent || '').trim(), visible: rect.top >= 0 && rect.left >= 0 && rect.width > 0 };
  });
  await page.keyboard.press('Enter');
  const focused = await page.evaluate(() => ({ id: document.activeElement?.id, hash: location.hash }));
  check('keyboard', 'the first Tab stop is a visible "Jump to content" link that moves focus to <main>', first.text === 'Jump to content' && first.visible && focused.id === 'main' && focused.hash === '#home', JSON.stringify({ first, focused }));
  const noise = ctx.takeErrors();
  check(group, 'desktop: navigating logged no errors', noise.length === 0, noise[0]);
}

async function hubs(ctx, routes) {
  const { page } = ctx;
  const group = 'hubs';
  ctx.takeErrors();
  const HUBS = [
    ['study', 'learn'],
    ['studio', 'play'],
    ['tools', 'tools'],
  ];
  const missing = [];
  for (const [hub, section] of HUBS) {
    await ctx.goto(hub);
    await ctx.screenReady(hub);
    const hrefs = await page.locator('main a[href^="#"]').evaluateAll((links) => links.map((a) => a.getAttribute('href').split('--')[0]));
    for (const route of routes.filter((r) => r.inHub && r.section === section)) if (!hrefs.includes(`#${route.name}`)) missing.push(`${hub} -> ${route.name}`);
  }
  check(group, 'each hub links to every screen of its section', missing.length === 0, `missing: ${missing.join(', ')}`);

  await ctx.goto('study');
  await ctx.screenReady('study');
  const search = page.locator('main input[type="search"], main input[role="searchbox"], main input').first();
  await search.fill('tune my guitar');
  await page.waitForTimeout(250);
  const hits = await page.locator('main a[href="#tuner"]').count();
  await search.press('Enter');
  const opened = await ctx.screenReady('tuner', 10000).then(() => true, () => false);
  check(group, 'hub search finds a screen of another section by a plain word and Enter opens it', hits > 0 && opened, `hits=${hits} opened=${opened}`);
  const noise = ctx.takeErrors();
  check(group, 'the hubs logged no errors', noise.length === 0, noise[0]);
}

async function firstRun(browser, url, mobile) {
  const where = mobile ? 'phone' : 'desktop';
  const group = 'first run';
  const dialog = '[role="dialog"][aria-modal="true"]';

  // --- a new learner goes through all six steps
  const ctx = await openContext(browser, url, { mobile, seed: null });
  const { page } = ctx;
  await ctx.goto('home');
  const opened = await page.waitForSelector(dialog, { timeout: 10000 }).then(() => true, () => false);
  const heading = opened ? await page.locator(`${dialog} h2`).innerText() : '';
  check(group, `${where}: opens by itself on Today for a new learner`, opened && /Welcome/.test(heading), heading);
  if (!opened) {
    await ctx.close();
    return;
  }
  const primary = page.locator(`${dialog} footer button`).last();
  // Focus is inside and Tab cannot leave.
  let escaped = false;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    if (!(await page.evaluate((sel) => !!document.activeElement && !!document.activeElement.closest(sel), dialog))) escaped = true;
  }
  check(group, `${where}: keeps keyboard focus inside the dialog`, !escaped);

  await page.locator(`${dialog} input[type="text"]`).fill('Robin');
  await primary.click(); // -> level
  await page.locator(`${dialog} label`, { hasText: 'I play a bit' }).click();
  const teacher = await page.locator(dialog).innerText();
  await primary.click(); // -> hand
  await page.locator(`${dialog} label`, { hasText: 'Left-handed' }).click();
  await primary.click(); // -> note names
  await page.locator(`${dialog} label`, { hasText: 'Do Re Mi' }).click();
  await primary.click(); // -> goal
  await page.locator(`${dialog} label`, { hasText: 'Serious' }).click();
  await primary.click(); // -> tour
  const last = await page.locator(`${dialog} h2`).innerText();
  const steps = await page.locator(`${dialog} [role="progressbar"]`).getAttribute('aria-label');
  check(group, `${where}: the level picks the teacher and the flow reaches its sixth step`, /Dev Okafor/.test(teacher) && /Step 6 of 6/.test(steps || '') && /What you can do/.test(last), `${steps} / ${last}`);
  const sideways = await page.evaluate(inspect, ctx.viewport.width);
  check(group, `${where}: the flow does not scroll sideways`, sideways.overflow <= 1, `${sideways.overflow}px`);
  await primary.click(); // finish
  const closed = await page.waitForFunction((sel) => !document.querySelector(sel), dialog, { timeout: 5000 }).then(() => true, () => false);
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem('ssa:progress') || 'null');
    } catch {
      /* reported below as "nothing stored" */
    }
    const state = stored && (stored.state || stored.data || stored);
    return {
      greeting: document.querySelector('main h1')?.textContent || '',
      toast: [...document.querySelectorAll('ol[aria-label="Notifications"] li')].map((li) => li.textContent).join(' | '),
      profile: state && state.profile ? { name: state.profile.name, experience: state.profile.experience, teacher: state.profile.teacher, onboarded: state.profile.onboarded } : null,
      prefs: state && state.prefs ? { handedness: state.prefs.handedness, noteNaming: state.prefs.noteNaming, dailyGoalXp: state.prefs.dailyGoalXp } : null,
    };
  });
  check(group, `${where}: finishing closes the flow, greets by name and confirms with a toast`, closed && /Robin/.test(saved.greeting) && /all set/i.test(saved.toast), JSON.stringify({ closed, greeting: saved.greeting, toast: saved.toast.slice(0, 60) }));
  const profileOk = !!saved.profile && saved.profile.name === 'Robin' && saved.profile.experience === 'intermediate' && saved.profile.teacher === 'dev' && saved.profile.onboarded === true;
  const prefsOk = !!saved.prefs && saved.prefs.handedness === 'left' && saved.prefs.noteNaming === 'solfege' && saved.prefs.dailyGoalXp === 30;
  check(group, `${where}: the answers are written to the profile and the preferences`, profileOk && prefsOk, JSON.stringify({ profile: saved.profile, prefs: saved.prefs }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('main[data-route="home"]');
  await page.waitForTimeout(700);
  const again = await page.locator(dialog).count();
  const greeting = await page.locator('main h1').innerText();
  check(group, `${where}: after a reload it stays closed and the name is still there`, again === 0 && /Robin/.test(greeting), `dialogs=${again} greeting="${greeting}"`);
  const noise = ctx.takeErrors();
  check(group, `${where}: the flow logged no errors`, noise.length === 0, noise[0]);
  await ctx.close();

  // --- skipping, and asking for it again
  const skip = await openContext(browser, url, { mobile, seed: null });
  await skip.goto('tuner');
  await skip.page.waitForTimeout(500);
  check(group, `${where}: a link straight to another screen is not interrupted`, (await skip.page.locator(dialog).count()) === 0);
  await skip.goto('home');
  await skip.page.waitForSelector(dialog, { timeout: 10000 }).catch(() => undefined);
  await skip.page.getByRole('button', { name: 'Skip for now' }).click();
  const skipped = await skip.page.waitForFunction((sel) => !document.querySelector(sel), dialog, { timeout: 5000 }).then(() => true, () => false);
  const offer = await skip.page.getByRole('button', { name: /Set it up/ }).count();
  await skip.page.reload({ waitUntil: 'load' });
  await skip.page.waitForSelector('main[data-route="home"]');
  await skip.page.waitForTimeout(700);
  const reopened = await skip.page.locator(dialog).count();
  check(group, `${where}: "Skip for now" closes it for good and Today offers to set up later`, skipped && offer === 1 && reopened === 0, `skipped=${skipped} offer=${offer} reopened=${reopened}`);
  await skip.goto('home--setup');
  const asked = await skip.page.waitForSelector(dialog, { timeout: 10000 }).then(() => true, () => false);
  await skip.page.keyboard.press('Escape');
  const escapedOut = await skip.page.waitForFunction((sel) => !document.querySelector(sel), dialog, { timeout: 5000 }).then(() => true, () => false);
  const hash = await skip.page.evaluate(() => location.hash);
  check(group, `${where}: #home--setup opens it on request, Escape closes it, the address is #home again`, asked && escapedOut && hash === '#home', `asked=${asked} closed=${escapedOut} hash=${hash}`);
  const skipNoise = skip.takeErrors();
  check(group, `${where}: skipping logged no errors`, skipNoise.length === 0, skipNoise[0]);
  await skip.close();
}

async function resilience(browser, url) {
  const group = 'resilience';

  // An address that names no screen.
  const ctx = await openContext(browser, url, { mobile: true });
  await ctx.goto('no-such-screen--x');
  await ctx.screenReady('home').catch(() => undefined);
  const lost = await ctx.page.evaluate(() => ({ route: document.querySelector('main')?.getAttribute('data-route'), hash: location.hash }));
  check(group, 'an address that names no screen lands on Today and fixes the address', lost.route === 'home' && lost.hash === '#home', JSON.stringify(lost));

  // A screen that takes its time shows the skeleton, then the screen.
  await ctx.page.route('**/src/features/metronome/index.tsx*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await ctx.page.evaluate(() => {
    window.location.hash = '#metronome';
  });
  const skeleton = await ctx.page.waitForSelector('main[data-route="metronome"] [data-shell-fallback][aria-busy="true"]', { timeout: 5000 }).then(() => true, () => false);
  const announced = skeleton ? await ctx.page.locator('main [role="status"]').first().innerText().catch(() => '') : '';
  const arrived = await ctx.screenReady('metronome', 15000).then(() => true, () => false);
  check(group, 'a screen that loads slowly shows a labelled skeleton, then itself', skeleton && /Loading/.test(announced) && arrived, `skeleton=${skeleton} status="${announced}" arrived=${arrived}`);
  await ctx.page.unroute('**/src/features/metronome/index.tsx*');
  const calm = ctx.takeErrors();
  check(group, 'neither of those logged an error', calm.length === 0, calm[0]);
  await ctx.close();

  // A screen that throws is contained (its own console noise is expected, so it is not counted).
  await quietly(async () => {
    const broken = await openContext(browser, url, { mobile: true });
    await broken.page.route('**/src/features/rhythm/index.tsx*', (route) => route.fulfill({ contentType: 'application/javascript', body: 'export default function Broken() { throw new Error("shell-smoke: this screen throws on purpose"); }' }));
    await broken.goto('rhythm');
    const panel = await broken.page.waitForSelector('main[data-route="rhythm"] [role="alert"]', { timeout: 10000 }).then(() => true, () => false);
    const text = panel ? await broken.page.locator('main [role="alert"]').innerText() : '';
    const nav = await broken.page.locator('nav[aria-label="Main"] a').count();
    check(group, 'a screen that throws shows the error panel with a way out, and the tab bar stays', panel && /hit a problem/.test(text) && /Try again/.test(text) && /Go back/.test(text) && nav === 5, text.replace(/\s+/g, ' ').slice(0, 120));
    await broken.page.locator('nav[aria-label="Main"] a', { hasText: 'Learn' }).click();
    const moved = await broken.screenReady('study', 10000).then(() => true, () => false);
    const clean = moved ? await broken.page.evaluate(() => !document.querySelector('main [role="alert"]')) : false;
    check(group, 'the rest of the app still works after a screen has failed', moved && clean, `moved=${moved} clean=${clean}`);
    await broken.close();
  });

  // Storage that throws on every access: the app runs from memory and says so.
  const blocked = await openContext(browser, url, {
    mobile: true,
    seed: null,
    init: () => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    },
  });
  await blocked.goto('home');
  const flow = await blocked.page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 10000 }).then(() => true, () => false);
  if (flow) await blocked.page.getByRole('button', { name: 'Skip for now' }).click();
  await blocked.goto('studio');
  const ok = await blocked.screenReady('studio', 10000).then(() => true, () => false);
  const storageErrors = blocked.takeErrors();
  check(group, 'with storage blocked the app still opens, navigates and logs no error', flow && ok && storageErrors.length === 0, storageErrors[0] || `flow=${flow} studio=${ok}`);
  await blocked.close();
}

async function main() {
  const started = Date.now();
  const registry = await loadTs('/src/app/routes.ts');
  const all = registry.ROUTES.map((r) => ({ name: r.name, section: r.section, inHub: r.inHub, title: r.title }));
  const routes = only ? all.filter((r) => only.includes(r.name)) : all;
  console.log(`shell smoke: ${routes.length} routes x 2 viewports`);

  let notes = [];
  await withApp({}, async ({ browser, url }) => {
    for (const mobile of [true, false]) {
      const label = mobile ? 'phone 390x844' : 'desktop 1280x800';
      const ctx = await openContext(browser, url, { mobile });
      const swept = await sweepRoutes(ctx, label, routes);
      notes = notes.concat(swept.notes.map((n) => `${label}: ${n}`));
      if (!only) {
        if (mobile) await phoneNavigation(ctx);
        else {
          await desktopNavigation(ctx, all);
          await hubs(ctx, all);
        }
      }
      await ctx.close();
      if (!only) await firstRun(browser, url, mobile);
    }
    if (!only) await resilience(browser, url);
  });

  // ---- summary
  const groups = [...new Set(results.map((r) => r.group))];
  const failed = results.filter((r) => !r.pass);
  console.log('');
  for (const group of groups) {
    const mine = results.filter((r) => r.group === group);
    const bad = mine.filter((r) => !r.pass);
    console.log(`${bad.length ? 'FAIL' : 'ok  '}  ${group.padEnd(11)} ${mine.length - bad.length}/${mine.length}`);
  }
  const uniqueNotes = [...new Set(notes.map((n) => n.replace(/^(phone|desktop) [0-9x]+: /, '')))];
  if (uniqueNotes.length) console.log(`note  screens without exactly one h1: ${uniqueNotes.join('; ')}`);
  console.log(`\n${failed.length ? `FAILED: ${failed.length} of ${results.length} checks` : `PASSED: ${results.length} checks`} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (failed.length) {
    for (const f of failed) console.log(`  - [${f.group}] ${f.name}${f.detail ? `: ${f.detail.slice(0, 400)}` : ''}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
