#!/usr/bin/env node
/**
 * Browser check of the Me area (#profile and its parts). Run: node e2e/profile.cjs [--only a,b] [--verbose] [--no-shots]
 *
 * Groups (pick some with --only):
 *
 *  sweep     every part (overview, achievements, shop, settings, data, about) opens for a learner
 *            four months in and for a brand-new one, on a phone (390 x 844) and a desktop
 *            (1280 x 800), dark and light: the right part is shown and marked in the navigation,
 *            there is exactly one h1, the page does not scroll sideways, nothing is logged with
 *            console.error. Each view is saved to e2e/out/profile/ to look at. Also: a phone held
 *            sideways, the back button between parts, and an address that names no part.
 *  overview  the story on the overview matches the seeded state (name, level, streak, charts with
 *            their text equivalents, skills, quests, trophies) and the calendar answers to the keyboard
 *  trophies  achievements: counts, filters, secrets stay hidden, the detail opens, closes, and
 *            opens from its own address
 *  settings  each setting takes effect at once: name on the overview, data-theme, data-motion,
 *            data-accent with the computed accent colour, volume reaching the audio engine, and
 *            every other control reaching the saved state; a reload keeps them
 *  shop      trying on, buying and equipping a cosmetic, failing kindly to afford another, buying
 *            a helper, and the accent taking over the app
 *  data      storage and sync status, export to a file, reset behind the typed word, import with
 *            a preview, and the same progress back; a file that is not a backup is refused
 *  ai        a made-up API key is refused with the bad-key message, is not kept, and is never
 *            printed; a key Anthropic accepts shows only its hint; inside Claude there is no field.
 *            Requests to api.anthropic.com are answered by this script: nothing leaves the machine
 *  about     version, credits for every dependency, what works where, the honest limits
 *
 * Prints one line per group and exits non-zero if any check failed. A failed step is not retried
 * blindly: on a busy machine re-run the script before believing a timeout.
 */
const fs = require('node:fs');
const path = require('node:path');
const { withApp, VIEWPORTS, ROOT } = require('./lib/harness.cjs');
const { buildSeeds, seedContext } = require('./profile-seed.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const shots = !argv.includes('--no-shots');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',') : null;
const wants = (group) => !only || only.includes(group);

const OUT = path.join(ROOT, 'e2e', 'out', 'profile');
if (shots) fs.mkdirSync(OUT, { recursive: true });

const PARTS = [
  { id: 'overview', hash: 'profile', nav: 'Overview' },
  { id: 'achievements', hash: 'profile--achievements', nav: 'Achievements' },
  { id: 'shop', hash: 'profile--shop', nav: 'Shop' },
  { id: 'settings', hash: 'profile--settings', nav: 'Settings' },
  { id: 'data', hash: 'profile--data', nav: 'Your data' },
  { id: 'about', hash: 'profile--about', nav: 'About' },
];

/** Console output the browser produces by itself that says nothing about the app. */
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass, detail: detail ? String(detail) : '' });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail && (!pass || verbose) ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}

/** A browser context with a seeded learner, error capture and helpers. */
async function open(browser, url, { mobile = false, theme = 'dark', saved, viewport, extra, init, acceptDownloads = false, microphone = false } = {}) {
  const size = viewport || VIEWPORTS[mobile ? 'mobile' : 'desktop'];
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, colorScheme: theme, hasTouch: mobile, isMobile: mobile, acceptDownloads, permissions: microphone ? ['microphone'] : [] });
  if (init) await context.addInitScript(init);
  await seedContext(context, saved, extra);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (!BENIGN.some((p) => p.test(text))) errors.push(`console: ${text}`);
  });
  const ready = async (part, timeout = 20000) => {
    await page.waitForFunction(
      (id) => {
        const main = document.querySelector('main[data-route="profile"]');
        const root = main && main.querySelector(`[data-profile-section="${id}"]`);
        return !!root && !main.querySelector('[data-shell-fallback]') && !root.querySelector('[aria-busy="true"]');
      },
      part,
      { timeout },
    );
  };
  const goto = async (hash, part) => {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route]', { timeout: 20000 });
    if (part) await ready(part);
    await page.waitForTimeout(250);
  };
  /** The saved progress state, after the store's debounced save has run. */
  const savedState = async () => {
    await page.waitForTimeout(650);
    return page.evaluate(() => {
      try {
        const raw = JSON.parse(localStorage.getItem('ssa:progress') || 'null');
        return raw ? raw.state : null;
      } catch {
        return null;
      }
    });
  };
  const takeErrors = () => errors.splice(0, errors.length);
  return { context, page, errors, goto, ready, savedState, takeErrors, viewport: size, close: () => context.close() };
}

/** What a part looks like from outside. Runs in the page. */
function inspect(expectedWidth) {
  const root = document.documentElement;
  const main = document.querySelector('main[data-route]');
  const page = main ? main.querySelector('[data-profile-section]') : null;
  const alert = main ? main.querySelector('[role="alert"]') : null;
  const current = [...document.querySelectorAll('nav[aria-label="Me"] a[aria-current="page"]')].map((a) => a.textContent.trim());
  return {
    section: page ? page.getAttribute('data-profile-section') : null,
    h1: main ? [...main.querySelectorAll('h1')].map((h) => h.textContent.trim()) : [],
    failed: !!alert && /hit a problem|did not load/.test(alert.textContent || ''),
    overflow: Math.max(root.scrollWidth - root.clientWidth, window.innerWidth - expectedWidth, root.scrollWidth - expectedWidth),
    current,
    links: document.querySelectorAll('nav[aria-label="Me"] a').length,
    text: page ? page.textContent.length : 0,
    title: document.title,
    hash: location.hash,
  };
}

async function shot(ctx, name, fullPage = true) {
  if (!shots) return;
  await ctx.page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
}

// ---------------------------------------------------------------------------------------------
// sweep
// ---------------------------------------------------------------------------------------------

async function sweep(browser, url, seeds) {
  const group = 'sweep';
  for (const who of ['rich', 'empty']) {
    for (const mobile of [true, false]) {
      for (const theme of ['dark', 'light']) {
        const label = `${who} ${mobile ? 'phone' : 'desktop'} ${theme}`;
        const ctx = await open(browser, url, { mobile, theme, saved: seeds[who].saved });
        const failures = [];
        for (const part of PARTS) {
          let info = null;
          let problem = '';
          try {
            await ctx.goto(part.hash, part.id);
            info = await ctx.page.evaluate(inspect, ctx.viewport.width);
          } catch (e) {
            problem = `did not open: ${String(e.message || e).split('\n')[0]}`;
          }
          const errors = ctx.takeErrors();
          if (!problem && info) {
            if (info.section !== part.id) problem = `shows "${info.section}"`;
            else if (info.failed) problem = 'error panel';
            else if (info.h1.length !== 1) problem = `${info.h1.length} h1`;
            else if (info.overflow > 1) problem = `scrolls sideways by ${info.overflow}px`;
            else if (info.links !== PARTS.length) problem = `${info.links} links in the Me navigation`;
            else if (info.current.join() !== part.nav) problem = `navigation marks "${info.current.join()}"`;
            else if (info.text < 200) problem = `only ${info.text} characters of content`;
            else if (errors.length) problem = errors[0].replace(/\s+/g, ' ').slice(0, 200);
          }
          if (problem) failures.push(`${part.id}: ${problem}`);
          await shot(ctx, `${who}-${part.id}-${mobile ? 'phone' : 'desktop'}-${theme}`);
        }
        check(group, `${label}: all ${PARTS.length} parts open cleanly`, failures.length === 0, failures.join(' | '));
        await ctx.close();
      }
    }
  }

  // A phone held sideways: little height, so nothing may pin itself over the content.
  const land = await open(browser, url, { mobile: true, saved: seeds.rich.saved, viewport: { width: 844, height: 390 } });
  const sideways = [];
  for (const part of PARTS) {
    await land.goto(part.hash, part.id);
    const info = await land.page.evaluate(inspect, 844);
    if (info.overflow > 1) sideways.push(`${part.id} scrolls sideways by ${info.overflow}px`);
    await land.page.evaluate(() => window.scrollTo(0, 600));
    await land.page.waitForTimeout(120);
    const pinned = await land.page.evaluate(() => {
      // Height taken by anything of this screen that stays pinned over the content after scrolling.
      let covered = 0;
      for (const el of document.querySelectorAll('main [data-profile-section] *')) {
        const style = getComputedStyle(el);
        if (style.position !== 'sticky' && style.position !== 'fixed') continue;
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0 && rect.top <= 120) covered += rect.height;
      }
      return covered;
    });
    if (pinned > 100) sideways.push(`${part.id} pins ${Math.round(pinned)}px over a 390px tall screen`);
    await shot(land, `rich-${part.id}-landscape`, false);
  }
  const landErrors = land.takeErrors();
  check(group, 'phone held sideways (844 x 390): no sideways scroll, nothing tall pinned over the content, no errors', sideways.length === 0 && landErrors.length === 0, [...sideways, ...landErrors].join(' | '));
  await land.close();

  // Parts are real addresses: links move, Back and Forward return.
  const nav = await open(browser, url, { mobile: true, saved: seeds.rich.saved });
  await nav.goto('profile', 'overview');
  await nav.page.locator('nav[aria-label="Me"] a', { hasText: 'Shop' }).click();
  await nav.ready('shop');
  await nav.page.locator('nav[aria-label="Me"] a', { hasText: 'Settings' }).click();
  await nav.ready('settings');
  const there = await nav.page.evaluate(() => location.hash);
  await nav.page.goBack();
  await nav.ready('shop');
  const back1 = await nav.page.evaluate(() => location.hash);
  await nav.page.goBack();
  await nav.ready('overview');
  const back2 = await nav.page.evaluate(() => location.hash);
  await nav.page.goForward();
  await nav.ready('shop');
  const forward = await nav.page.evaluate(() => location.hash);
  check(group, 'the parts are addresses: links move, Back and Forward return', there === '#profile--settings' && back1 === '#profile--shop' && back2 === '#profile' && forward === '#profile--shop', `${there} ${back1} ${back2} ${forward}`);

  // The strip of links stays in reach while a long part scrolls (phone, upright).
  await nav.goto('profile--achievements', 'achievements');
  await nav.page.evaluate(() => window.scrollTo(0, 2400));
  await nav.page.waitForTimeout(200);
  const strip = await nav.page.evaluate(() => {
    const el = document.querySelector('nav[aria-label="Me"]');
    const rect = el.getBoundingClientRect();
    const link = el.querySelector('a[aria-current="page"]').getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, linkHeight: link.height, linkVisible: link.left >= 0 && link.right <= window.innerWidth, scrolled: window.scrollY };
  });
  check(group, 'phone: the strip of links stays pinned under the top bar, with 44px links and the current one in view', strip.scrolled > 1000 && strip.top >= 40 && strip.top <= 70 && strip.linkHeight >= 44 && strip.linkVisible, JSON.stringify(strip));
  await shot(nav, 'rich-achievements-phone-scrolled', false);

  await nav.goto('profile--no-such-part', 'overview');
  const fixed = await nav.page.evaluate(() => location.hash);
  check(group, 'an address that names no part shows the overview and fixes the address', fixed === '#profile', fixed);
  const navErrors = nav.takeErrors();
  check(group, 'moving between the parts logged no errors', navErrors.length === 0, navErrors[0]);
  await nav.close();

  // Desktop: the links are a side list beside the part, not a strip above it.
  const wide = await open(browser, url, { saved: seeds.rich.saved });
  await wide.goto('profile', 'overview');
  const side = await wide.page.evaluate(() => {
    const navBox = document.querySelector('nav[aria-label="Me"]').getBoundingClientRect();
    const first = document.querySelector('[data-profile-section] nav[aria-label="Me"] + div').getBoundingClientRect();
    return { navRight: navBox.right, detailLeft: first.left, navTop: navBox.top, detailTop: first.top, detailWidth: first.width };
  });
  check(group, 'desktop: a side list sits beside the part (two panes), and the part uses the width', side.navRight <= side.detailLeft && Math.abs(side.navTop - side.detailTop) < 8 && side.detailWidth > 560, JSON.stringify(side));
  await wide.close();
}

// ---------------------------------------------------------------------------------------------
// overview
// ---------------------------------------------------------------------------------------------

async function overview(browser, url, seeds) {
  const group = 'overview';
  const facts = seeds.rich.facts;
  const ctx = await open(browser, url, { mobile: true, saved: seeds.rich.saved });
  const { page } = ctx;
  await ctx.goto('profile', 'overview');

  const story = await page.evaluate(() => {
    const root = document.querySelector('[data-profile-section="overview"]');
    const text = (sel) => (root.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      h1: text('h1'),
      all: root.textContent.replace(/\s+/g, ' '),
      bars: [...root.querySelectorAll('ol[aria-label^="Minutes practised"] li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
      detail: text('#heat-detail'),
      cells: root.querySelectorAll('[data-day]').length,
      levels: [...new Set([...root.querySelectorAll('[data-day]')].map((c) => c.getAttribute('data-level')))].sort().join(''),
      months: [...root.querySelectorAll('details table tbody tr')].length,
      kinds: [...root.querySelectorAll('ul[aria-label^="Time per activity"] li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
      crowns: [...root.querySelectorAll('[role="img"][aria-label$="crowns"]')].map((c) => c.getAttribute('aria-label')),
      quests: root.querySelectorAll('h2').length,
      trophies: root.querySelectorAll('a[href^="#profile--achievements--"]').length,
      primary: [...root.querySelectorAll('a')].filter((a) => /Keep playing|Finish today|Start today/.test(a.textContent)).map((a) => a.getAttribute('href')),
    };
  });
  check(group, 'who: the name is the page title, with level, title and teacher on the page', story.h1 === 'Robin' && story.all.includes(`Level ${facts.level}`) && story.all.includes(facts.title) && story.all.includes('Learning with Dev Okafor'), `${story.h1} / level ${facts.level} ${facts.title}`);
  check(group, 'streak: the count of the store is written out', story.all.includes(`${facts.streak} days in a row`), `${facts.streak}`);
  const barMinutes = story.bars.map((b) => parseInt(b, 10));
  check(group, 'this week: seven columns whose numbers are the store’s minutes per day', story.bars.length === 7 && barMinutes.join() === facts.weekMinutes.join(), `${barMinutes.join()} vs ${facts.weekMinutes.join()}`);
  check(group, 'calendar: one square per day in several intensities, with the month table as its text equivalent', story.cells >= 16 * 7 - 6 && story.levels.length >= 3 && story.months >= 3 && /You practised on \d+ of the last \d+ days/.test(story.all), `cells=${story.cells} levels=${story.levels} months=${story.months}`);
  check(group, 'time by activity: labelled bars with minutes, longest first', story.kinds.length >= 3 && story.kinds.every((k) => /\d+ (min|h)/.test(k)), story.kinds.join(' | '));
  check(group, 'skills: strongest and rustiest are listed with their crowns in words', story.crowns.length >= 5 && story.all.includes('Getting rusty') && /rusty ·/.test(story.all), story.crowns.slice(0, 3).join(','));
  check(group, 'quests and trophies: today’s quests, the weekly one and recent achievements link to the cabinet', story.all.includes('This week') && story.trophies >= 4 && story.all.includes(`${facts.unlocked} of ${facts.total} earned`), `trophies=${story.trophies}`);
  check(group, 'one primary action leads on to practice', story.primary.length === 1 && /^#(home|studio)$/.test(story.primary[0]), story.primary.join());

  // The calendar answers to the keyboard, and says the day it is on.
  const calendar = page.locator('[role="group"][aria-label^="Practice calendar"]');
  await calendar.focus();
  const before = await page.locator('#heat-detail').innerText();
  await page.keyboard.press('ArrowLeft');
  const weekBack = await page.locator('#heat-detail').innerText();
  await page.keyboard.press('ArrowUp');
  const dayBack = await page.locator('#heat-detail').innerText();
  await page.keyboard.press('End');
  const end = await page.locator('#heat-detail').innerText();
  check(group, 'calendar: arrow keys move through the days and the day is named', /^Today/.test(before) && weekBack !== before && dayBack !== weekBack && end === before && /XP|no practice|freeze/.test(weekBack), `${before} | ${weekBack} | ${dayBack}`);

  // A tap on a square names that day too.
  const square = page.locator('[data-day]').nth(10);
  const day = await square.getAttribute('data-day');
  await square.click();
  const tapped = await page.locator('#heat-detail').innerText();
  check(group, 'calendar: tapping a square names that day', tapped !== end && tapped.length > 10, `${day}: ${tapped}`);

  await page.getByRole('radio', { name: 'All time' }).click();
  await page.waitForTimeout(150);
  const allTime = await page.locator('ul[aria-label="Time per activity, all time"] li').count();
  check(group, 'time by activity: switching to "All time" redraws the bars', allTime >= 3, `${allTime} rows`);
  const noise = ctx.takeErrors();
  check(group, 'the overview logged no errors', noise.length === 0, noise[0]);
  await ctx.close();

  // A brand-new learner: no empty shell.
  const fresh = await open(browser, url, { mobile: true, saved: seeds.empty.saved });
  await fresh.goto('profile', 'overview');
  const blank = await fresh.page.evaluate(() => {
    const root = document.querySelector('[data-profile-section="overview"]');
    return { h1: root.querySelector('h1').textContent.trim(), all: root.textContent.replace(/\s+/g, ' '), links: [...root.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')) };
  });
  check(
    group,
    'a new learner sees level 1, an empty calendar that explains itself, first achievements to aim for and ways to start',
    blank.h1 === 'Me' && blank.all.includes('Level 1') && blank.all.includes('Open String') && /No practice in the last \d+ days yet/.test(blank.all) && blank.all.includes('No crowns yet') && blank.all.includes('Good ones to start with') && blank.all.includes('In Tune') && blank.links.includes('#home') && blank.links.includes('#studio') && blank.links.includes('#tuner'),
    blank.all.slice(0, 200),
  );
  await fresh.close();
}

// ---------------------------------------------------------------------------------------------
// trophies
// ---------------------------------------------------------------------------------------------

async function trophies(browser, url, seeds) {
  const group = 'trophies';
  const facts = seeds.rich.facts;
  const ctx = await open(browser, url, { saved: seeds.rich.saved });
  const { page } = ctx;
  await ctx.goto('profile--achievements', 'achievements');

  const cabinet = await page.evaluate(() => {
    const root = document.querySelector('[data-profile-section="achievements"]');
    const tiles = [...root.querySelectorAll('[data-achievement]')];
    return {
      tiles: tiles.length,
      earned: tiles.filter((t) => t.hasAttribute('data-earned')).length,
      groups: root.querySelectorAll('h2').length,
      text: root.textContent,
      secret: tiles.filter((t) => /^Secret/.test(t.textContent.trim())).length,
    };
  });
  check(group, 'all achievements are there, grouped, and the earned count matches the store', cabinet.tiles === facts.total && cabinet.earned === facts.unlocked && cabinet.groups >= 10 && cabinet.text.includes(`${facts.unlocked} of ${facts.total}`), JSON.stringify({ tiles: cabinet.tiles, earned: cabinet.earned, groups: cabinet.groups }));
  const leaked = facts.hiddenNames.filter((name) => cabinet.text.includes(name));
  check(group, 'secrets that are not earned show as "Secret": their names appear nowhere', cabinet.secret === facts.hiddenNames.length && leaked.length === 0, `secret tiles=${cabinet.secret}, hidden=${facts.hiddenNames.length}, leaked=${leaked.join()}`);

  await page.getByRole('radio', { name: /^Earned/ }).or(page.getByRole('button', { name: /^Earned/ })).first().click();
  await page.waitForTimeout(150);
  const onlyEarned = await page.evaluate(() => ({ tiles: document.querySelectorAll('[data-achievement]').length, earned: document.querySelectorAll('[data-achievement][data-earned]').length }));
  check(group, 'the "Earned" filter shows exactly the earned ones', onlyEarned.tiles === facts.unlocked && onlyEarned.earned === facts.unlocked, JSON.stringify(onlyEarned));
  await page.getByRole('radio', { name: /^In progress/ }).or(page.getByRole('button', { name: /^In progress/ })).first().click();
  await page.waitForTimeout(150);
  const inProgress = await page.evaluate(() => ({ tiles: document.querySelectorAll('[data-achievement]').length, earned: document.querySelectorAll('[data-achievement][data-earned]').length, bars: [...document.querySelectorAll('[data-achievement]')].every((t) => /of|%|Level/.test(t.textContent)) }));
  check(group, 'the "In progress" filter shows locked ones with how far along they are', inProgress.tiles > 0 && inProgress.earned === 0 && inProgress.bars, JSON.stringify(inProgress));
  await page.getByRole('radio', { name: /^All/ }).or(page.getByRole('button', { name: /^All/ })).first().click();

  // The detail of an earned one.
  await page.locator('[data-achievement="first-tune"]').click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.waitFor({ timeout: 5000 });
  const earnedDetail = (await dialog.innerText()).replace(/\s+/g, ' ');
  await page.waitForTimeout(350);
  await shot(ctx, 'detail-earned-desktop', false);
  await page.keyboard.press('Escape');
  const closed = await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 5000 }).then(() => true, () => false);
  const focusBack = await page.evaluate(() => document.activeElement?.getAttribute('data-achievement'));
  check(group, 'an earned achievement opens with what it was for and when it was earned; Escape closes it and focus returns', /In Tune/.test(earnedDetail) && /Tune your guitar with the tuner\./.test(earnedDetail) && /Earned on \d+ \w+ \d{4}/.test(earnedDetail) && /Bronze/.test(earnedDetail) && closed && focusBack === 'first-tune', `${earnedDetail.slice(0, 120)} focus=${focusBack}`);

  // A locked one opens from its own address, with progress and the way to earn it.
  await ctx.goto('profile--achievements--streak-14', 'achievements');
  await dialog.waitFor({ timeout: 5000 });
  const locked = (await dialog.innerText()).replace(/\s+/g, ' ');
  const way = await dialog.locator('a').first().getAttribute('href');
  await dialog.getByRole('button', { name: 'Close' }).last().click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 5000 }).catch(() => undefined);
  const after = await page.evaluate(() => location.hash);
  check(group, 'a locked achievement opens from its address with progress and a link to earn it; closing fixes the address', /Fortnight/.test(locked) && /Reach a 14-day streak\./.test(locked) && new RegExp(`${facts.streak} of 14`).test(locked) && way === '#home' && after === '#profile--achievements', `${locked.slice(0, 120)} way=${way} after=${after}`);

  // A secret gives nothing away.
  await page.locator('[data-achievement]', { hasText: 'Secret' }).first().click();
  await dialog.waitFor({ timeout: 5000 });
  const secret = (await dialog.innerText()).replace(/\s+/g, ' ');
  await page.keyboard.press('Escape');
  check(group, 'a secret opens without a name, a hint or a link', /Secret achievement/.test(secret) && /no hint/.test(secret) && !facts.hiddenNames.some((n) => secret.includes(n)), secret.slice(0, 120));
  const noise = ctx.takeErrors();
  check(group, 'the cabinet logged no errors', noise.length === 0, noise[0]);
  await ctx.close();

  const fresh = await open(browser, url, { mobile: true, saved: seeds.empty.saved });
  await fresh.goto('profile--achievements', 'achievements');
  await fresh.page.getByRole('radio', { name: /^Earned/ }).or(fresh.page.getByRole('button', { name: /^Earned/ })).first().click();
  await fresh.page.waitForTimeout(150);
  const none = await fresh.page.evaluate(() => document.querySelector('[data-profile-section]').textContent);
  await fresh.page.getByRole('button', { name: /Show all/ }).click();
  await fresh.page.waitForTimeout(150);
  const again = await fresh.page.locator('[data-achievement]').count();
  check(group, 'a new learner’s "Earned" list explains itself and leads back to the full list', /No achievements yet/.test(none) && again === seeds.empty.facts.total, `again=${again}`);
  await fresh.close();
}

// ---------------------------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------------------------

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};

/** The accent in effect: the token on <html>, and the colour a real element paints with it. */
function accentNow() {
  const style = getComputedStyle(document.documentElement);
  const link = document.querySelector('nav[aria-label="Me"] a[aria-current="page"]');
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    motion: document.documentElement.getAttribute('data-motion'),
    attr: document.documentElement.getAttribute('data-accent'),
    accent: style.getPropertyValue('--accent').trim(),
    bg: style.getPropertyValue('--bg').trim(),
    linkColor: link ? getComputedStyle(link).color : '',
    linkBackground: link ? getComputedStyle(link).backgroundColor : '',
  };
}

async function settings(browser, url, seeds, accents) {
  const group = 'settings';
  const ctx = await open(browser, url, { saved: seeds.rich.saved, theme: 'dark', microphone: true });
  const { page } = ctx;
  await ctx.goto('profile--settings', 'settings');
  const groupOf = (id) => page.locator(`[data-settings-group="${id}"]`);
  const segment = (label, option) => page.locator(`[role="radiogroup"][aria-label="${label}"]`).getByRole('radio', { name: option, exact: true });

  const saveButtons = await page.getByRole('button', { name: /^(Save|Apply)( changes| settings)?$/ }).count();
  check(group, 'there is no Save button: the page says changes apply straight away', saveButtons === 0 && /applies straight away/.test(await page.locator('[data-profile-section]').innerText()));

  // --- name, typed with a space in it, shows on the overview
  const name = page.locator('[data-settings-name]');
  await name.fill('');
  await name.pressSequentially('Robin Smith', { delay: 15 });
  const typed = await name.inputValue();
  await page.locator('nav[aria-label="Me"] a', { hasText: 'Overview' }).click();
  await ctx.ready('overview');
  const shown = await page.locator('[data-profile-name]').innerText();
  check(group, 'name: typed with a space, it is on the overview at once', typed === 'Robin Smith' && shown === 'Robin Smith', `typed="${typed}" shown="${shown}"`);
  await page.goBack();
  await ctx.ready('settings');

  // --- theme
  await segment('Theme', 'Light').click();
  const light = await page.evaluate(accentNow);
  await segment('Theme', 'Dark').click();
  const dark = await page.evaluate(accentNow);
  await segment('Theme', 'Device').click();
  const device = await page.evaluate(accentNow);
  check(group, 'theme: Light and Dark set data-theme and repaint the page; Device removes it', light.theme === 'light' && light.bg === '#f1f4f3' && dark.theme === 'dark' && dark.bg === '#0d1214' && device.theme === null && device.bg === '#0d1214', JSON.stringify({ light: [light.theme, light.bg], dark: [dark.theme, dark.bg], device: [device.theme, device.bg] }));

  // --- motion
  await segment('Motion', 'Reduced').click();
  const reduced = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-motion'), duration: getComputedStyle(document.querySelector('nav[aria-label="Me"] a')).transitionDuration }));
  await segment('Motion', 'Full').click();
  const full = await page.evaluate(() => document.documentElement.getAttribute('data-motion'));
  await segment('Motion', 'Device').click();
  const motionOff = await page.evaluate(() => document.documentElement.getAttribute('data-motion'));
  check(group, 'motion: Reduced sets data-motion and stills the transitions; Device removes it', reduced.attr === 'reduce' && parseFloat(reduced.duration) < 0.001 && full === 'full' && motionOff === null, JSON.stringify({ reduced, full, motionOff }));

  // --- accent (Robin owns Ocean)
  const amber = await page.evaluate(accentNow);
  await page.locator('[data-accent-choice="ocean"]').click();
  // The link's colour eases over 120 ms: read it once it has arrived.
  await page.waitForTimeout(400);
  const oceanDark = await page.evaluate(accentNow);
  await segment('Theme', 'Light').click();
  await page.waitForTimeout(400);
  const oceanLight = await page.evaluate(accentNow);
  await segment('Theme', 'Device').click();
  check(
    group,
    'accent: Ocean sets data-accent and the computed accent is the one in accents.css, in dark and in light',
    amber.attr === null && amber.accent === '#f5ae2e' && oceanDark.attr === 'ocean' && oceanDark.accent === accents.ocean.dark['--accent'] && oceanDark.linkColor === rgb(accents.ocean.dark['--accent-text']) && oceanDark.linkBackground === rgb(accents.ocean.dark['--accent-soft']) && oceanLight.accent === accents.ocean.light['--accent'] && oceanLight.linkColor === rgb(accents.ocean.light['--accent-text']),
    JSON.stringify({ amber: [amber.attr, amber.accent], oceanDark: [oceanDark.attr, oceanDark.accent, oceanDark.linkColor], oceanLight: [oceanLight.accent, oceanLight.linkColor] }),
  );
  await shot(ctx, 'settings-ocean-desktop-dark', false);
  await page.locator('[data-accent-choice="sunburst"]').click();
  const back = await page.evaluate(accentNow);
  check(group, 'accent: back to Sunburst removes data-accent and the amber returns', back.attr === null && back.accent === '#f5ae2e', JSON.stringify([back.attr, back.accent]));

  // --- sound: the volume reaches the audio engine
  const slider = groupOf('sound').locator('input[type="range"]');
  await slider.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const engineVolume = await page.evaluate(async () => (await import('/src/core/audio/index.ts')).getMasterVolume());
  const afterVolume = await ctx.savedState();
  check(group, 'volume: the slider at 30% is saved and has reached the audio engine', afterVolume.prefs.sound.volume === 0.3 && Math.abs(engineVolume - 0.3) < 1e-6, `saved=${afterVolume.prefs.sound.volume} engine=${engineVolume}`);

  // --- sound: the test buttons make sound
  const heard = async (button) => {
    await button.click();
    return page
      .waitForFunction(async () => (await import('/src/core/audio/index.ts')).getOutputLevel().peak > 0.001, null, { timeout: 8000, polling: 100 })
      .then(() => true, () => false);
  };
  const quiet = async () => {
    await page.evaluate(async () => (await import('/src/core/audio/index.ts')).stopAll());
    await page.waitForFunction(async () => (await import('/src/core/audio/index.ts')).getOutputLevel().peak < 0.0005, null, { timeout: 8000, polling: 100 }).catch(() => undefined);
  };
  const toneHeard = await heard(groupOf('sound').getByRole('button', { name: 'Play a chord in this guitar sound' }));
  await quiet();
  const clickHeard = await heard(groupOf('sound').getByRole('button', { name: 'Play one bar of this click' }));
  await page.waitForTimeout(2200);
  await quiet();
  const uiHeard = await heard(groupOf('sound').getByRole('button', { name: 'Play the sound of a right answer' }));
  await quiet();
  const volumeHeard = await heard(groupOf('sound').getByRole('button', { name: 'Play a chord at this volume' }));
  await quiet();
  check(group, 'sound: each Test button (volume, guitar sound, click, interface sounds) is heard at the output', toneHeard && clickHeard && uiHeard && volumeHeard, JSON.stringify({ toneHeard, clickHeard, uiHeard, volumeHeard }));

  await groupOf('sound').locator('select').nth(0).selectOption('nylon');
  await groupOf('sound').locator('select').nth(1).selectOption('clave');
  await groupOf('sound').getByRole('switch', { name: /Interface sounds/ }).click();
  const uiTestOff = await groupOf('sound').getByRole('button', { name: 'Play the sound of a right answer' }).isDisabled();
  const afterSound = await ctx.savedState();
  check(group, 'sound: guitar sound, click and interface sounds are saved as chosen; with interface sounds off their test is off too', afterSound.prefs.sound.guitarTone === 'nylon' && afterSound.prefs.sound.clickSound === 'clave' && afterSound.prefs.sound.uiSounds === false && uiTestOff, JSON.stringify(afterSound.prefs.sound));
  await quiet();

  // --- the choices that change how things are drawn and taught
  await page.locator('[role="radiogroup"][aria-label="Your level"]').getByRole('radio', { name: 'Expert' }).click();
  const afterLevel = await ctx.savedState();
  await groupOf('you').getByRole('radio', { name: /Mia Brooks/ }).check();
  await groupOf('you').getByRole('radio', { name: 'Rocket' }).click();
  await segment('Playing hand', 'Left-handed').click();
  await groupOf('playing').getByRole('radio', { name: /Do Re Mi/ }).check();
  await groupOf('goal').getByRole('radio', { name: /Serious/ }).check();
  await groupOf('instrument').locator('select').selectOption('drop-d');
  const tuningHint = await groupOf('instrument').innerText();
  await groupOf('instrument').getByRole('button', { name: /Increase/ }).click();
  await groupOf('instrument').getByRole('button', { name: /Increase/ }).click();
  const a4Hint = await groupOf('instrument').innerText();
  await groupOf('hearts').getByRole('switch', { name: /Relaxed mode/ }).click();
  await groupOf('speech').getByRole('switch', { name: /Read explanations aloud/ }).click({ force: true }).catch(() => undefined);
  await segment('Sharps or flats', 'Flats ♭').click();
  await segment('Dots on the fretboard show', 'Scale degrees').click();
  await segment('Songs and exercises show', 'Tab and notation').click();
  await segment('Week starts on', 'Sunday').click();
  await groupOf('more').getByRole('switch', { name: /Mirror the camera/ }).click();
  const s = await ctx.savedState();
  const speechStored = await page.evaluate(() => localStorage.getItem('ssa:prefs.speech'));
  const speechAvailable = await page.evaluate(() => 'speechSynthesis' in window);
  check(group, 'level and teacher: a level picks its teacher, and any teacher can still be chosen', afterLevel.profile.experience === 'expert' && afterLevel.profile.teacher === 'elena' && s.profile.teacher === 'mia' && s.profile.experience === 'expert' && s.profile.avatar === 'rocket', JSON.stringify(s.profile));
  check(
    group,
    'hand, note names, goal, tuning, reference pitch, hearts and the finer options all reach the saved state',
    s.prefs.handedness === 'left' && s.prefs.noteNaming === 'solfege' && s.prefs.dailyGoalXp === 30 && s.prefs.tuningId === 'drop-d' && s.prefs.a4 === 442 && s.prefs.unlimitedHearts === true && s.prefs.accidentals === 'flats' && s.prefs.fretboard.labels === 'degrees' && s.prefs.notation === 'tab+notation' && s.prefs.weekStart === 'sunday' && s.prefs.camera.mirrored === false,
    JSON.stringify({ hand: s.prefs.handedness, naming: s.prefs.noteNaming, goal: s.prefs.dailyGoalXp, tuning: s.prefs.tuningId, a4: s.prefs.a4, hearts: s.prefs.unlimitedHearts, acc: s.prefs.accidentals, labels: s.prefs.fretboard.labels, notation: s.prefs.notation, week: s.prefs.weekStart, mirror: s.prefs.camera.mirrored }),
  );
  check(group, 'tuning and reference pitch explain themselves in words', /D A D G B E/.test(tuningHint) && /2 Hz above concert pitch/.test(a4Hint), a4Hint.replace(/\s+/g, ' ').slice(0, 160));
  check(group, 'spoken explanations: the switch is remembered (or says there is no voice here)', speechAvailable ? speechStored === 'false' : /no voice/.test(await groupOf('speech').innerText()), `stored=${speechStored} available=${speechAvailable}`);
  const referenceHeard = await heard(groupOf('instrument').getByRole('button', { name: /Play the note A at 442 hertz/ }));
  await quiet();
  check(group, 'reference pitch: its Test button plays the note', referenceHeard);
  await groupOf('instrument').getByRole('button', { name: 'Back to 440' }).click();
  const reset440 = (await ctx.savedState()).prefs.a4;
  check(group, 'reference pitch: "Back to 440" restores concert pitch', reset440 === 440, reset440);

  // --- left-handed flips the neck in the shop preview
  await ctx.goto('profile--shop', 'shop');
  const flipped = await page.locator('[data-stage] svg g').first().getAttribute('transform');
  check(group, 'playing hand: left-handed flips the neck drawn in the shop', /scale\(-1 1\)/.test(flipped || ''), flipped);

  // --- a reload keeps everything
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-probe', '1');
  });
  await ctx.goto('profile--settings', 'settings');
  await segment('Theme', 'Light').click();
  await page.locator('[data-accent-choice="ocean"]').click();
  await page.waitForTimeout(700);
  await page.reload({ waitUntil: 'load' });
  await ctx.ready('settings');
  const kept = await page.evaluate(accentNow);
  const keptName = await page.locator('[data-settings-name]').inputValue();
  const keptVolume = await groupOf('sound').locator('input[type="range"]').inputValue();
  check(group, 'after a reload the theme, the accent, the name and the volume are as they were left', kept.theme === 'light' && kept.attr === 'ocean' && kept.accent === accents.ocean.light['--accent'] && keptName === 'Robin Smith' && keptVolume === '30', JSON.stringify({ theme: kept.theme, attr: kept.attr, accent: kept.accent, keptName, keptVolume }));

  // --- a link to one group lands on it
  await ctx.goto('profile--settings--sound', 'settings');
  await page.waitForTimeout(400);
  const landed = await page.evaluate(() => {
    const rect = document.querySelector('[data-settings-group="sound"]').getBoundingClientRect();
    return { top: Math.round(rect.top), scrolled: Math.round(window.scrollY) };
  });
  check(group, 'the address #profile--settings--sound opens on the Sound group', landed.scrolled > 300 && landed.top >= 0 && landed.top < 200, JSON.stringify(landed));
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  const jumped = await page
    .waitForFunction(() => {
      const top = document.querySelector('[data-settings-group="look"]').getBoundingClientRect().top;
      return top >= 0 && top < 200;
    }, null, { timeout: 5000 })
    .then(() => true, () => false);
  const focused = await page.evaluate(() => document.activeElement?.id);
  check(group, 'the shortcut row jumps to a group and moves focus to its heading', jumped && focused === 'settings-look-title', `jumped=${jumped} focus=${focused}`);

  // --- microphone: the picker fills in and the level test moves (the browser supplies a fake microphone)
  await ctx.goto('profile--settings--microphone', 'settings');
  const mic = page.locator('[data-settings-mic]');
  await mic.locator('[data-mic-test]').click();
  const running = await page.waitForFunction(() => {
    const status = document.querySelector('[data-mic-status]');
    const fill = document.querySelector('[data-settings-mic] [role="img"] span');
    const moved = fill && fill.style.transform && fill.style.transform !== 'scaleX(0)' && fill.style.transform !== 'scaleX(0.000)';
    return status && status.getAttribute('data-mic-status') !== 'off' && moved;
  }, null, { timeout: 15000 }).then(() => true, () => false);
  const micState = await page.evaluate(() => ({ status: document.querySelector('[data-mic-status]')?.getAttribute('data-mic-status'), text: document.querySelector('[data-mic-status]')?.textContent, options: document.querySelectorAll('[data-settings-mic] select option').length, alert: document.querySelector('[data-settings-mic] [role="alert"]')?.textContent || '' }));
  await shot(ctx, 'settings-mic-test-desktop', false);
  await mic.locator('[data-mic-test]').click();
  const stopped = await page.waitForFunction(() => document.querySelector('[data-mic-status]')?.getAttribute('data-mic-status') === 'off', null, { timeout: 5000 }).then(() => true, () => false);
  check(group, 'microphone: the test starts, the level moves, the inputs are listed by name, and Stop releases it', running && micState.options >= 2 && stopped, JSON.stringify(micState).slice(0, 300));

  const noise = ctx.takeErrors();
  check(group, 'changing the settings logged no errors', noise.length === 0, noise[0]);
  await ctx.close();

  // --- phone: the same controls fit and can be reached
  const phone = await open(browser, url, { mobile: true, saved: seeds.empty.saved, theme: 'light' });
  await phone.goto('profile--settings', 'settings');
  const small = await phone.page.evaluate(() => {
    const tooSmall = [];
    for (const el of document.querySelectorAll('[data-profile-section] button, [data-profile-section] select, [data-profile-section] input[type="text"], [data-profile-section] a[href]')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // The target is what can be hit: the control, an invisible area a pseudo-element adds around
      // it (the kit's small buttons), or the bordered box a field's input sits in.
      let height = rect.height;
      for (const pseudo of ['::before', '::after']) {
        const style = getComputedStyle(el, pseudo);
        if (style.content === 'none' || style.position !== 'absolute') continue;
        height = Math.max(height, rect.height - (parseFloat(style.top) || 0) - (parseFloat(style.bottom) || 0));
      }
      if (el.matches('input, select') && el.parentElement) height = Math.max(height, el.parentElement.getBoundingClientRect().height);
      const inRow = el.closest('[role="radiogroup"]') || el.closest('label') || el.closest('p');
      if (height < 43.5 && !inRow) tooSmall.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(height)}px`);
    }
    return { tooSmall, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check(group, 'phone: nothing scrolls sideways and stand-alone buttons are tall enough to tap', small.overflow <= 1 && small.tooSmall.length === 0, `${small.overflow}px; ${small.tooSmall.slice(0, 6).join(' | ')}`);
  await phone.page.locator('[role="radiogroup"][aria-label="Theme"]').getByRole('radio', { name: 'Dark', exact: true }).tap();
  const phoneTheme = await phone.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check(group, 'phone: a tap on Dark changes the theme at once', phoneTheme === 'dark', phoneTheme);
  await phone.close();
}

// ---------------------------------------------------------------------------------------------
// shop
// ---------------------------------------------------------------------------------------------

async function shop(browser, url, seeds, accents) {
  const group = 'shop';
  const start = seeds.rich.state.gems.balance;
  const ctx = await open(browser, url, { mobile: true, saved: seeds.rich.saved });
  const { page } = ctx;
  await ctx.goto('profile--shop', 'shop');
  const stage = page.locator('[data-stage]');
  const tile = (id) => page.locator(`[data-item="${id}"]`);
  const bar = page.locator('[data-shop-action]');
  const toastText = async () => (await page.locator('[data-toast]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');

  const shown = await page.locator('[data-profile-section] header').innerText();
  check(group, 'the gem balance of the store is in the header', shown.includes(String(start)), `${start} in "${shown.replace(/\s+/g, ' ')}"`);

  // --- try on, buy, and it is equipped
  await tile('wood-ebony').click();
  const trying = { wood: await stage.getAttribute('data-look-wood'), action: await bar.getAttribute('data-shop-action'), text: (await bar.innerText()).replace(/\s+/g, ' '), pressed: await tile('wood-ebony').getAttribute('aria-pressed') };
  const untouched = await ctx.savedState();
  check(group, 'tapping a wood tries it on in the stage with a clear price, and nothing is bought yet', trying.wood === 'wood-ebony' && trying.action === 'buy' && /Ebony costs 150 gems/.test(trying.text) && /Buy for 150/.test(trying.text) && trying.pressed === 'true' && untouched.gems.balance === start && !untouched.cosmetics.includes('wood-ebony'), JSON.stringify(trying));
  await shot(ctx, 'shop-trying-ebony-phone', false);
  const stagePinned = await page.evaluate(() => {
    const rect = document.querySelector('[data-stage]').getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  });
  check(group, 'the stage stays in view while the shelves scroll', stagePinned);
  await bar.getByRole('button', { name: /Buy for 150/ }).click();
  await page.waitForTimeout(200);
  const bought = await ctx.savedState();
  const afterBuy = { toast: await toastText(), equipped: await tile('wood-ebony').getAttribute('data-equipped'), bar: await bar.count(), wood: await stage.getAttribute('data-look-wood') };
  check(
    group,
    'buying takes the price off the balance, owns the item and equips it',
    bought.gems.balance === start - 150 && bought.cosmetics.includes('wood-ebony') && bought.prefs.fretboard.wood === 'wood-ebony' && /Ebony is yours, and it is on/.test(afterBuy.toast) && afterBuy.equipped !== null && afterBuy.bar === 0 && afterBuy.wood === 'wood-ebony',
    JSON.stringify({ balance: bought.gems.balance, wood: bought.prefs.fretboard.wood, ...afterBuy }),
  );

  // --- an owned item offers Equip
  await tile('wood-rosewood').click();
  const owned = { action: await bar.getAttribute('data-shop-action'), text: (await bar.innerText()).replace(/\s+/g, ' ') };
  await bar.getByRole('button', { name: 'Equip' }).click();
  const equipped = await ctx.savedState();
  check(group, 'an owned item offers "Equip", and equipping costs nothing', owned.action === 'equip' && /Rosewood is yours/.test(owned.text) && equipped.prefs.fretboard.wood === 'wood-rosewood' && equipped.gems.balance === start - 150, JSON.stringify({ owned, wood: equipped.prefs.fretboard.wood, balance: equipped.gems.balance }));

  // --- one that cannot be afforded
  await tile('inlay-vine').click();
  const short = { action: await bar.getAttribute('data-shop-action'), text: (await bar.innerText()).replace(/\s+/g, ' '), buy: await bar.getByRole('button', { name: /Buy/ }).count(), way: await bar.locator('a').getAttribute('href'), inlay: await stage.getAttribute('data-look-inlay') };
  const missing = 400 - (start - 150);
  const afterShort = await ctx.savedState();
  check(
    group,
    'an item out of reach can still be tried on, says kindly how many gems are missing and where to earn them, and offers no Buy',
    short.action === 'short' && short.inlay === 'inlay-vine' && short.text.includes(`${missing} more gems will do it`) && /daily quests pay/.test(short.text) && short.buy === 0 && short.way === '#home' && afterShort.gems.balance === start - 150 && !afterShort.cosmetics.includes('inlay-vine'),
    JSON.stringify(short),
  );
  await shot(ctx, 'shop-cannot-afford-phone', false);
  await bar.getByRole('button', { name: 'Take it off' }).click();
  const off = { bar: await bar.count(), inlay: await stage.getAttribute('data-look-inlay') };
  check(group, '"Take it off" returns the stage to the equipped look', off.bar === 0 && off.inlay === 'inlay-dots', JSON.stringify(off));

  // --- an accent is previewed inside the stage only, then takes over the app when equipped
  await tile('accent-ocean').click();
  const preview = await page.evaluate(() => {
    const sample = document.querySelector('[data-stage] [data-accent-scope]');
    return { scope: sample.getAttribute('data-accent-scope'), inside: getComputedStyle(sample).getPropertyValue('--accent').trim(), root: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), attr: document.documentElement.getAttribute('data-accent'), button: getComputedStyle(sample.firstElementChild).backgroundColor };
  });
  await bar.getByRole('button', { name: 'Equip' }).click();
  await page.waitForTimeout(400);
  const worn = await page.evaluate(accentNow);
  const primary = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent)';
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
  check(
    group,
    'an accent is previewed inside the stage without touching the app, and once equipped the whole app wears it',
    preview.scope === 'ocean' && preview.inside === accents.ocean.dark['--accent'] && preview.root === '#f5ae2e' && preview.attr === null && preview.button === rgb(accents.ocean.dark['--accent']) && worn.attr === 'ocean' && worn.accent === accents.ocean.dark['--accent'] && primary === rgb(accents.ocean.dark['--accent']),
    JSON.stringify({ preview, worn: [worn.attr, worn.accent], primary }),
  );
  await shot(ctx, 'shop-ocean-equipped-phone', false);

  // --- helpers
  await tile('heart-refill').getByRole('button').click();
  await page.waitForTimeout(200);
  const refilled = await ctx.savedState();
  const refillRow = { text: (await tile('heart-refill').innerText()).replace(/\s+/g, ' '), disabled: await tile('heart-refill').getByRole('button').isDisabled() };
  check(group, 'a heart refill costs 20 gems, fills the hearts, and then says they are full', refilled.gems.balance === start - 170 && refilled.hearts.count === 5 && /5 of 5 hearts/.test(refillRow.text) && /Your hearts are full/.test(refillRow.text) && refillRow.disabled, JSON.stringify({ balance: refilled.gems.balance, hearts: refilled.hearts.count, ...refillRow }));
  await tile('streak-freeze').getByRole('button').click();
  await page.waitForTimeout(200);
  const frozen = await ctx.savedState();
  const freezeRow = (await tile('streak-freeze').innerText()).replace(/\s+/g, ' ');
  check(group, 'a streak freeze costs 60 gems and the row counts what is held', frozen.gems.balance === start - 230 && frozen.streak.freezes === 2 && /2 of 2 held/.test(freezeRow) && /most you can keep/.test(freezeRow), `${frozen.gems.balance} ${freezeRow}`);
  const noise = ctx.takeErrors();
  check(group, 'shopping logged no errors', noise.length === 0, noise[0]);
  await ctx.close();

  // --- a learner with no gems
  const poor = await open(browser, url, { saved: seeds.empty.saved, theme: 'light' });
  await poor.goto('profile--shop', 'shop');
  await poor.page.locator('[data-item="streak-freeze"]').getByRole('button').click();
  await poor.page.waitForTimeout(250);
  const kind = (await poor.page.locator('[data-toast]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
  const role = await poor.page.locator('[data-toast]').first().getAttribute('role');
  await poor.page.locator('[data-item="accent-cherry"]').click();
  const cherry = (await poor.page.locator('[data-shop-action]').innerText()).replace(/\s+/g, ' ');
  const poorState = await poor.savedState();
  await shot(poor, 'shop-no-gems-desktop-light', false);
  check(group, 'with no gems a tap on a helper answers kindly (a notice, not an error) and nothing changes', /Not quite enough gems for Streak freeze/.test(kind) && /You need 60 more gems/.test(kind) && role === 'status' && /200 more gems will do it/.test(cherry) && (poorState === null || (poorState.gems.balance === 0 && poorState.streak.freezes === 0)), `${kind} / ${cherry}`);
  const poorNoise = poor.takeErrors();
  check(group, 'being short of gems logged no errors', poorNoise.length === 0, poorNoise[0]);
  await poor.close();
}

// ---------------------------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------------------------

async function data(browser, url, seeds) {
  const group = 'data';
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-profile-'));
  const ctx = await open(browser, url, { saved: seeds.rich.saved, acceptDownloads: true });
  const { page } = ctx;
  await ctx.goto('profile--data', 'data');
  const fingerprint = seeds.fingerprint;

  const status = await page.evaluate(() => ({
    storage: document.querySelector('[data-status="storage"]')?.getAttribute('data-tone'),
    storageText: document.querySelector('[data-status="storage"]')?.textContent,
    sync: document.querySelector('[data-status="sync"]')?.textContent,
    syncButton: document.querySelectorAll('[data-status="sync"] button').length,
  }));
  check(group, 'storage: progress is reported as saved on this device, with the time of the last save', status.storage === 'ok' && /Saved on this device/.test(status.storageText) && /Last saved \d+ \w+ \d{4}, \d\d:\d\d/.test(status.storageText), status.storageText);
  check(group, 'cloud sync: the standalone app says sync is off here and offers no "Sync now"', /Cloud sync is off here/.test(status.sync) && /inside Claude/.test(status.sync) && status.syncButton === 0, status.sync);

  // --- export
  const before = await ctx.savedState();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('[data-card="export"]').getByRole('button', { name: 'Export to a file' }).click()]);
  const fileName = download.suggestedFilename();
  const file = path.join(dir, fileName);
  await download.saveAs(file);
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(group, 'export: a .json file named after the learner and the day, holding the whole state', /^sixstring-progress-robin-\d{4}-\d\d-\d\d\.json$/.test(fileName) && exported.app === 'sixstring-academy' && exported.kind === 'progress-export' && exported.state.xp.total === seeds.rich.state.xp.total && fingerprint(exported.state) === fingerprint(before), `${fileName} xp=${exported.state?.xp?.total}`);

  // --- reset behind the typed word
  await page.locator('[data-card="reset"]').getByRole('button', { name: 'Reset everything' }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.waitFor({ timeout: 5000 });
  const confirm = dialog.locator('[data-reset-confirm]');
  const lockedAtFirst = await confirm.isDisabled();
  await dialog.locator('[data-reset-input]').fill('delete');
  const lockedWrong = await confirm.isDisabled();
  await page.waitForTimeout(700);
  const stillThere = (await ctx.savedState()).xp.total;
  await page.waitForTimeout(350);
  await shot(ctx, 'data-reset-dialog-desktop', false);
  await dialog.locator('[data-reset-input]').fill('RESET');
  const unlocked = await confirm.isEnabled();
  await confirm.click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 5000 }).catch(() => undefined);
  const wiped = await ctx.savedState();
  const wipedToast = (await page.locator('[data-toast]').allInnerTexts()).join(' | ');
  check(group, 'reset: locked until the word is typed exactly, then everything is erased and a toast offers Undo', lockedAtFirst && lockedWrong && stillThere === seeds.rich.state.xp.total && unlocked && wiped.xp.total === 0 && wiped.profile.name === '' && Object.keys(wiped.achievements).length === 0 && /Everything was erased/.test(wipedToast) && /Undo/.test(wipedToast), JSON.stringify({ lockedAtFirst, lockedWrong, unlocked, xp: wiped.xp.total, toast: wipedToast.slice(0, 80) }));

  // --- undo brings it straight back
  await page.locator('[data-toast]').getByRole('button', { name: 'Undo' }).click();
  const undone = await ctx.savedState();
  check(group, 'reset: Undo brings back exactly what was there', fingerprint(undone) === fingerprint(before), `xp=${undone.xp.total}`);

  // --- reset again, then import the exported file
  await page.locator('[data-card="reset"]').getByRole('button', { name: 'Reset everything' }).click();
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-reset-input]').fill('reset');
  await dialog.locator('[data-reset-input]').press('Enter');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 5000 }).catch(() => undefined);
  const wipedAgain = await ctx.savedState();
  await page.locator('[data-card="import"] input[type="file"]').setInputFiles(file);
  await dialog.waitFor({ timeout: 10000 });
  const merge = await dialog.evaluate((el) => ({
    text: el.textContent.replace(/\s+/g, ' '),
    strategy: el.querySelector('[data-import-preview]')?.getAttribute('data-import-preview'),
    rows: [...el.querySelectorAll('[data-import-preview] tbody tr')].map((tr) => [tr.querySelector('th').textContent, ...[...tr.querySelectorAll('td')].map((td) => td.textContent.trim()), tr.getAttribute('data-change')]),
  }));
  const xpRow = merge.rows.find((r) => r[0] === 'Total XP');
  const nameRow = merge.rows.find((r) => r[0] === 'Name');
  await page.waitForTimeout(350);
  await shot(ctx, 'data-import-preview-desktop', false);
  check(group, 'import: the file is read and a preview shows now and after for each number before anything changes', wipedAgain.xp.total === 0 && merge.strategy === 'newest-wins' && xpRow && xpRow[1] === '0' && xpRow[2].startsWith(String(seeds.rich.state.xp.total).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) && xpRow[3] === 'up' && nameRow && nameRow[2].startsWith('Robin') && (await ctx.savedState()).xp.total === 0, JSON.stringify({ xpRow, nameRow, strategy: merge.strategy }));
  await dialog.getByRole('radio', { name: /Replace/ }).check();
  const replaceLabel = await dialog.locator('[data-import-confirm]').innerText();
  await dialog.locator('[data-import-confirm]').click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 5000 }).catch(() => undefined);
  const restored = await ctx.savedState();
  check(group, 'export, reset, import (replace): the same progress is back', /Replace my progress/.test(replaceLabel) && fingerprint(restored) === fingerprint(before), `xp=${restored.xp.total} achievements=${Object.keys(restored.achievements).length}`);
  await ctx.goto('profile', 'overview');
  const overviewName = await page.locator('[data-profile-name]').innerText();
  check(group, 'after the import the overview shows the learner again', overviewName === 'Robin', overviewName);

  // --- merge keeps the best of both
  await ctx.goto('profile--settings', 'settings');
  await page.locator('[data-settings-name]').fill('Robin the Second');
  await ctx.goto('profile--data', 'data');
  const renamed = await ctx.savedState();
  await page.locator('[data-card="import"] input[type="file"]').setInputFiles(file);
  await dialog.waitFor({ timeout: 10000 });
  const sameRows = await dialog.evaluate((el) => [...el.querySelectorAll('[data-import-preview] tbody tr')].filter((tr) => tr.getAttribute('data-change') === 'down').length);
  await dialog.locator('[data-import-confirm]').click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 5000 }).catch(() => undefined);
  const merged = await ctx.savedState();
  check(group, 'import (merge): nothing goes down, and the newer name on this device is kept', sameRows === 0 && merged.xp.total === renamed.xp.total && merged.profile.name === 'Robin the Second' && Object.keys(merged.achievements).length >= Object.keys(renamed.achievements).length, `${merged.profile.name} xp=${merged.xp.total}`);

  // --- a file that is not a backup
  const stranger = path.join(dir, 'recipe.json');
  fs.writeFileSync(stranger, JSON.stringify({ title: 'Pancakes', flour: '200 g' }));
  await page.locator('[data-card="import"] input[type="file"]').setInputFiles(stranger);
  const refused = await page.locator('[data-card="import"] [role="alert"]').innerText({ timeout: 10000 }).catch(() => '');
  const garbage = path.join(dir, 'broken.json');
  fs.writeFileSync(garbage, '{"app":"sixstring-academy","v":2,"state":{"profile":');
  await page.locator('[data-card="import"] input[type="file"]').setInputFiles(garbage);
  await page.waitForTimeout(400);
  const broken = await page.locator('[data-card="import"] [role="alert"]').innerText({ timeout: 10000 }).catch(() => '');
  const unharmed = await ctx.savedState();
  check(group, 'a file that is not a backup, or a damaged one, is refused in plain words and nothing changes', /not a Sixstring Academy backup/.test(refused) && /could not be read/.test(broken) && /Nothing was changed/.test(broken) && (await dialog.count()) === 0 && fingerprint(unharmed) === fingerprint(merged), `${refused.slice(0, 60)} / ${broken.slice(0, 60)}`);

  // --- keep the settings
  await page.locator('[data-card="reset"]').getByRole('button', { name: 'Reset everything' }).click();
  await dialog.waitFor({ timeout: 5000 });
  await dialog.getByRole('checkbox', { name: /Keep my name and settings/ }).check();
  await dialog.locator('[data-reset-input]').fill('RESET');
  await dialog.locator('[data-reset-confirm]').click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 5000 }).catch(() => undefined);
  const kept = await ctx.savedState();
  check(group, 'reset with "Keep my name and settings": the progress goes, the name stays', kept.xp.total === 0 && kept.profile.name === 'Robin the Second', `${kept.profile.name} xp=${kept.xp.total}`);
  const noise = ctx.takeErrors();
  check(group, 'export, reset and import logged no errors', noise.length === 0, noise[0]);
  await ctx.close();

  // --- storage that cannot keep anything says so
  const blocked = await open(browser, url, {
    mobile: true,
    saved: null,
    init: () => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    },
  });
  await blocked.goto('profile--data', 'data');
  const warning = await blocked.page.evaluate(() => ({ tone: document.querySelector('[data-status="storage"]')?.getAttribute('data-tone'), text: document.querySelector('[data-status="storage"]')?.textContent }));
  await shot(blocked, 'data-storage-blocked-phone', false);
  const blockedNoise = blocked.takeErrors();
  check(group, 'with storage blocked the page says progress is not being saved and points at Export', warning.tone === 'bad' && /not being saved/.test(warning.text) && /Export a backup/.test(warning.text) && blockedNoise.length === 0, `${warning.text} ${blockedNoise[0] || ''}`);
  await blocked.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------
// ai
// ---------------------------------------------------------------------------------------------

async function ai(browser, url, seeds) {
  const group = 'ai';
  const KEY = 'sk-ant-api03-MADE-UP-KEY-for-the-browser-check-0123456789abcdefQQ7x';
  const GOOD = 'sk-ant-api03-ANOTHER-made-up-key-that-the-fake-server-accepts-Zk9w';
  const ctx = await open(browser, url, { mobile: true, saved: seeds.rich.saved });
  const { page } = ctx;
  // Everything the page prints or sends is collected, to prove the key shows up nowhere it should not.
  const printed = [];
  page.on('console', (m) => printed.push(m.text()));
  const sent = [];
  page.on('request', (request) => {
    const blob = `${request.url()} ${JSON.stringify(request.headers())} ${request.postData() || ''}`;
    if (blob.includes(KEY) || blob.includes(GOOD)) sent.push(new URL(request.url()).host);
  });
  let calls = 0;
  let accept = false;
  await page.route('https://api.anthropic.com/**', async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    calls += 1;
    if (accept) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', content: [], stop_reason: 'max_tokens', usage: { input_tokens: 8, output_tokens: 0 } }) });
    return route.fulfill({ status: 401, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
  });

  await ctx.goto('profile--settings--ai', 'settings');
  const box = page.locator('[data-ai="standalone"]');
  const words = (await box.innerText()).replace(/\s+/g, ' ');
  check(group, 'it says what the helper is for, that it is optional, and where the key is kept and sent', /reads photographed sheet music/.test(words) && /explains a mistake/.test(words) && /optional/.test(words) && /stored in this browser only and is sent only to Anthropic/.test(words), words.slice(0, 200));
  const field = box.locator('input[type="password"]');
  const masked = (await field.count()) === 1;

  // --- something that is not a key at all: refused without a request
  await field.fill('hello world');
  await box.getByRole('button', { name: 'Save and check the key' }).click();
  await page.waitForTimeout(300);
  const shape = (await box.innerText()).replace(/\s+/g, ' ');
  check(group, 'the field hides what is typed, and text that is not a key is refused on the spot, without a request', masked && /no spaces|does not look like an Anthropic API key/.test(shape) && calls === 0, shape.slice(-160));

  // --- a made-up key: Anthropic says no
  await field.fill(KEY);
  await box.getByRole('button', { name: 'Save and check the key' }).click();
  const problem = await page.locator('[data-ai-problem="bad-key"]').innerText({ timeout: 20000 }).catch(() => '');
  await page.waitForTimeout(200);
  const afterBad = await page.evaluate((key) => {
    const everything = document.documentElement.outerHTML;
    const values = [...document.querySelectorAll('input, textarea')].map((el) => el.value);
    const stored = Object.keys(localStorage).filter((k) => (localStorage.getItem(k) || '').includes(key));
    return { inPage: everything.includes(key), inFields: values.some((v) => v.includes(key)), tail: everything.includes(key.slice(-8)), stored, keyState: document.querySelector('[data-ai]')?.getAttribute('data-ai-key'), fieldEmpty: document.querySelector('[data-ai] input[type="password"]')?.value === '' };
  }, KEY);
  await shot(ctx, 'settings-ai-bad-key-phone', false);
  check(group, 'a made-up key gets the bad-key message', /was not accepted/.test(problem) && /mistyped, expired or revoked/.test(problem) && /not saved/.test(problem), problem.replace(/\s+/g, ' ').slice(0, 200));
  check(group, 'the key is printed nowhere: not on the page, not in a field, not in the console, and it is not kept', !afterBad.inPage && !afterBad.inFields && !afterBad.tail && afterBad.stored.length === 0 && afterBad.keyState === 'none' && afterBad.fieldEmpty && !printed.some((line) => line.includes(KEY) || line.includes(KEY.slice(-8))), JSON.stringify(afterBad));
  check(group, 'the key was sent to api.anthropic.com and to no other host', calls === 1 && sent.length > 0 && sent.every((host) => host === 'api.anthropic.com'), `calls=${calls} hosts=${[...new Set(sent)].join()}`);
  const helperOff = (await ctx.savedState()).prefs.ai.enabled;
  check(group, 'after a rejected key the helper stays switched off', helperOff === false, helperOff);

  // --- a key that is accepted: only its hint is shown
  accept = true;
  await field.fill(GOOD);
  await box.getByRole('button', { name: 'Save and check the key' }).click();
  await page.getByText('Key works').waitFor({ timeout: 20000 }).catch(() => undefined);
  const good = await page.evaluate((key) => {
    const box = document.querySelector('[data-ai]');
    return { hint: box.querySelector('[data-ai-hint]')?.textContent.trim(), text: box.textContent.replace(/\s+/g, ' '), inPage: document.documentElement.outerHTML.includes(key), field: box.querySelectorAll('input[type="password"]').length, keyState: box.getAttribute('data-ai-key') };
  }, GOOD);
  const on = (await ctx.savedState()).prefs.ai.enabled;
  await shot(ctx, 'settings-ai-key-works-phone', false);
  check(group, 'an accepted key shows "Key works" and only a hint of the key (its last four characters); the helper switches on', /Key works/.test(good.text) && good.hint === `sk-ant-…${GOOD.slice(-4)}` && !good.inPage && good.field === 0 && good.keyState === 'stored' && on === true, JSON.stringify({ hint: good.hint, inPage: good.inPage, on }));
  const exportHasKey = await page.evaluate(async (key) => JSON.stringify((await import('/src/core/progress/index.ts')).exportProgress()).includes(key), GOOD);
  check(group, 'the key is not part of the progress export', exportHasKey === false, exportHasKey);

  // --- remove it
  await box.locator('[data-ai-remove]').click();
  const sure = page.locator('[role="dialog"], [role="alertdialog"]');
  await sure.waitFor({ timeout: 5000 });
  await sure.getByRole('button', { name: 'Remove the key' }).click();
  await page.waitForTimeout(400);
  const removed = await page.evaluate((key) => ({ stored: Object.keys(localStorage).filter((k) => (localStorage.getItem(k) || '').includes(key)).length, field: document.querySelectorAll('[data-ai] input[type="password"]').length, keyState: document.querySelector('[data-ai]').getAttribute('data-ai-key') }), GOOD);
  const offAgain = (await ctx.savedState()).prefs.ai.enabled;
  check(group, 'removing the key deletes it from the browser, brings the field back and switches the helper off', removed.stored === 0 && removed.field === 1 && removed.keyState === 'none' && offAgain === false, JSON.stringify({ ...removed, offAgain }));
  // Console noise from the 401 itself (the browser logs failed requests) is expected; app errors are not.
  const noise = ctx.takeErrors().filter((line) => !/401|Failed to load resource/.test(line));
  check(group, 'the key flow logged no app errors', noise.length === 0, noise[0]);
  await ctx.close();

  // --- inside Claude: built in, no field
  const inside = await open(browser, url, {
    mobile: true,
    saved: seeds.rich.saved,
    init: () => {
      const sample = async () => ({ text: '' });
      sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4 } });
      window.claude = { use: async (name) => (name === 'sample' ? sample : null) };
      // The viewer's frame refuses the microphone and the camera for every page.
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    },
  });
  await inside.goto('profile--settings--ai', 'settings');
  await inside.page.locator('[data-ai="artifact"][data-ai-available]').waitFor({ timeout: 15000 }).catch(() => undefined);
  const builtIn = await inside.page.evaluate(() => {
    const box = document.querySelector('[data-ai]');
    return { kind: box?.getAttribute('data-ai'), available: box?.getAttribute('data-ai-available'), text: (box?.textContent || '').replace(/\s+/g, ' '), fields: document.querySelectorAll('[data-ai] input[type="password"], [data-ai] input[type="text"]').length };
  });
  await shot(inside, 'settings-ai-inside-claude-phone', false);
  check(group, 'inside Claude: "Built in", no key field, and the same two sentences about what it is for', builtIn.kind === 'artifact' && builtIn.available === 'true' && /Built in/.test(builtIn.text) && /no key to enter/.test(builtIn.text) && /optional/.test(builtIn.text) && builtIn.fields === 0, JSON.stringify(builtIn).slice(0, 300));
  await inside.goto('profile--about', 'about');
  const about = await inside.page.evaluate(() => ({ host: document.querySelector('[data-about-host]')?.getAttribute('data-about-host'), text: document.querySelector('[data-profile-section]').textContent.replace(/\s+/g, ' ') }));
  await shot(inside, 'about-inside-claude-phone', false);
  check(group, 'inside Claude: About says kindly that the microphone and camera need the standalone app, and what works instead', about.host === 'artifact' && /The microphone and camera need the standalone app/.test(about.text) && /tap the answer/.test(about.text) && /you are here/.test(about.text), about.text.slice(0, 200));
  await inside.goto('profile--data', 'data');
  const sync = await inside.page.evaluate(() => document.querySelector('[data-status="sync"]')?.textContent || '');
  check(group, 'inside Claude without a database: sync says it is not available in this view', /not available in this view|off here/.test(sync), sync);
  await inside.goto('profile--settings--microphone', 'settings');
  await inside.page.locator('[data-mic-test]').click();
  const blockedMic = await inside.page.locator('[data-settings-mic] [role="alert"]').innerText({ timeout: 15000 }).catch(() => '');
  check(group, 'inside Claude: the microphone test explains that the viewer keeps it off and what still works', /switched off in this viewer/.test(blockedMic) && /tap the answers/.test(blockedMic), blockedMic.replace(/\s+/g, ' ').slice(0, 200));
  const insideNoise = inside.takeErrors();
  check(group, 'inside Claude the Me area logged no errors', insideNoise.length === 0, insideNoise[0]);
  await inside.close();
}

// ---------------------------------------------------------------------------------------------
// about
// ---------------------------------------------------------------------------------------------

async function about(browser, url, seeds) {
  const group = 'about';
  const pkg = require(path.join(ROOT, 'package.json'));
  const ctx = await open(browser, url, { saved: seeds.rich.saved });
  await ctx.goto('profile--about', 'about');
  const info = await ctx.page.evaluate(() => ({
    version: document.querySelector('[data-about-version]')?.textContent,
    host: document.querySelector('[data-about-host]')?.getAttribute('data-about-host'),
    credits: [...document.querySelectorAll('[data-credit]')].map((li) => [li.getAttribute('data-credit'), li.textContent]),
    rows: [...document.querySelectorAll('[data-capability]')].map((li) => [li.getAttribute('data-capability'), li.textContent.replace(/\s+/g, ' ')]),
    text: document.querySelector('[data-profile-section]').textContent.replace(/\s+/g, ' '),
    external: [...document.querySelectorAll('[data-credit] a')].every((a) => a.target === '_blank' && /noopener/.test(a.rel) && /^https:/.test(a.href)),
  }));
  check(group, 'the version is the one in package.json, and the host is named', info.version === pkg.version && info.host === 'standalone', `${info.version} ${info.host}`);
  const missing = Object.keys(pkg.dependencies).filter((name) => !info.credits.some(([id]) => id === name));
  check(group, 'every dependency in package.json is credited with a licence, and the links open safely in a new tab', missing.length === 0 && info.credits.every(([, text]) => /MIT|ISC|Apache-2\.0|MPL-2\.0|OFL-1\.1/.test(text)) && info.external, `missing: ${missing.join()}`);
  const mic = info.rows.find(([id]) => id === 'mic');
  const camera = info.rows.find(([id]) => id === 'camera');
  check(group, 'what works where: the microphone and the camera work in the standalone app and not inside Claude, said kindly', !!mic && /Works/.test(mic[1]) && /Not here/.test(mic[1]) && /instead/.test(mic[1]) && !!camera && /Not here/.test(camera[1]), mic ? mic[1].slice(0, 200) : 'no row');
  check(group, 'the honest limits of the camera and of sheet reading are stated', /Honest limits/.test(info.text) && /a fret off/.test(info.text) && /handwriting, dense notation and blurry photos/.test(info.text));
  await ctx.page.getByRole('button', { name: 'Show the welcome tour again' }).click();
  const tour = await ctx.page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 8000 }).then(() => true, () => false);
  await ctx.page.keyboard.press('Escape');
  check(group, 'the welcome tour can be opened again from here', tour);
  const noise = ctx.takeErrors();
  check(group, 'About logged no errors', noise.length === 0, noise[0]);
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

/** The accent tokens of src/ui/accents.css by name and theme, read with the app's own CSS reader. */
async function readAccents() {
  const { loadTs } = require('./lib/harness.cjs');
  const reader = await loadTs('/src/features/profile/contrast.ts');
  const rules = reader.parseCssRules(fs.readFileSync(path.join(ROOT, 'src', 'ui', 'accents.css'), 'utf8'));
  const out = {};
  for (const rule of rules) {
    const name = /data-accent='([a-z-]+)'/.exec(rule.selectors.join(' '))?.[1];
    if (!name) continue;
    out[name] = out[name] || {};
    out[name][rule.selectors.some((s) => /data-theme/.test(s)) ? 'dark' : 'light'] = rule.declarations;
  }
  return out;
}

async function main() {
  const started = Date.now();
  console.log('profile: building the learner states');
  const seeds = await buildSeeds();
  const accents = await readAccents();
  // One browser with a fake microphone (a steady tone), so the level test in the settings has something to hear.
  await withApp({ fakeDevices: true }, async ({ browser, url }) => {
    const run = async (name, fn) => {
      if (!wants(name)) return;
      const before = results.length;
      try {
        await fn();
      } catch (e) {
        check(name, 'ran to the end', false, String(e && e.message ? e.message : e).split('\n').slice(0, 3).join(' '));
      }
      if (verbose) console.log(`  -- ${name}: ${results.length - before} checks`);
    };
    await run('sweep', () => sweep(browser, url, seeds));
    await run('overview', () => overview(browser, url, seeds));
    await run('trophies', () => trophies(browser, url, seeds));
    await run('settings', () => settings(browser, url, seeds, accents));
    await run('shop', () => shop(browser, url, seeds, accents));
    await run('data', () => data(browser, url, seeds));
    await run('ai', () => ai(browser, url, seeds));
    await run('about', () => about(browser, url, seeds));
  });

  const groups = [...new Set(results.map((r) => r.group))];
  const failed = results.filter((r) => !r.pass);
  console.log('');
  for (const group of groups) {
    const mine = results.filter((r) => r.group === group);
    const bad = mine.filter((r) => !r.pass);
    console.log(`${bad.length ? 'FAIL' : 'ok  '}  ${group.padEnd(9)} ${mine.length - bad.length}/${mine.length}`);
  }
  if (shots) console.log(`screenshots: ${path.relative(ROOT, OUT)}/`);
  console.log(`\n${failed.length ? `FAILED: ${failed.length} of ${results.length} checks` : `PASSED: ${results.length} checks`} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (failed.length) {
    for (const f of failed) console.log(`  - [${f.group}] ${f.name}${f.detail ? `: ${f.detail.slice(0, 500)}` : ''}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
