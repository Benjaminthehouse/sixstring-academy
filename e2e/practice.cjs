#!/usr/bin/env node
/**
 * Browser check of the Practice Plan (#practice). Run: node e2e/practice.cjs [--verbose]
 *
 * Time is accelerated with Playwright's clock (it drives Date.now and the timers, so the session
 * controller and the progress store both see the injected time). What it proves:
 *
 *  phone, dark   pick 5 minutes -> a 2-block plan that adds up; Start opens the runner with the
 *                first block's countdown; the block's button opens another screen, where the global
 *                bar shows the block and the time running down; pause from the bar stops the clock;
 *                on a second screen the bar moves to block 2 when block 1 runs out; a reload in the
 *                middle of block 2 keeps the session and its time; the bar leads back to the runner;
 *                the session finishes on time and the summary shows the XP. The progress store then
 *                holds exactly one `practice` log entry of 300 s with that XP, today's minutes, and
 *                the journal holds the session with both blocks.
 *  desktop, light  two panes (plan + journal); swap a block, add a minute, remove a block; save
 *                the plan as a routine and find it under Routines; pin a focus goal and see the
 *                next plan give it the first block; Space pauses and resumes, N moves on, Esc asks
 *                before leaving; leaving keeps the session (resume card on #practice, bar on Today
 *                in the bottom-right corner); End asks first and keeps what was practised; feel and
 *                note go into the journal shown in the right pane.
 *  looks         plan, runner and journal on phone and desktop, light and dark, written to
 *                e2e/out/practice-*.png; none scrolls sideways; nothing logs console.error.
 *  edge cases    a 360 px phone keeps every label whole and the tile's check off its number; at
 *                200 % text the ring fits and nothing scrolls sideways; a block left part-way
 *                fills its segment part-way; End says the time in words; the journal sheet names
 *                yesterday and last week correctly; a first-day beginner's plans hold back the
 *                F barre chord and the other later exercises.
 *
 *  library and bar  plans name technique exercises and songs from the app's content and open them
 *                at their own address (#technique--tech-…, #play--…); with a session running, a fresh
 *                load of another screen brings the bar up without fetching the exercise pool, the
 *                planner or any content module.
 *
 * Prints PASSED or FAILED and exits non-zero on failure.
 */
const path = require('node:path');
const { withApp, VIEWPORTS, ROOT } = require('./lib/harness.cjs');

const verbose = process.argv.includes('--verbose');
const OUT = path.join(ROOT, 'e2e', 'out');
const START = new Date('2026-11-16T17:00:00Z');
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail !== '' ? `  (${String(detail).slice(0, 300)})` : ''}`);
  return !!pass;
}

/** "4:35" -> 275 */
const seconds = (text) => {
  const m = /(\d+):(\d{2})/.exec(text || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

async function openPage(browser, url, { mobile, theme, viewport }) {
  const context = await browser.newContext({
    viewport: viewport || VIEWPORTS[mobile ? 'mobile' : 'desktop'],
    deviceScaleFactor: 1,
    colorScheme: theme,
    hasTouch: !!mobile,
    isMobile: !!mobile,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
    } catch {
      /* storage may be blocked */
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((re) => re.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  await page.clock.install({ time: START });
  const go = async (hash) => {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route]', { timeout: 20000 });
    // The screen itself, not the shell's loading skeleton (the route is a lazy chunk).
    await page.waitForSelector('main[data-route] [data-ui-page]:not([data-shell-fallback])', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(350);
  };
  return { context, page, errors, go };
}

async function route(page) {
  return page.evaluate(() => location.hash);
}

async function noSideways(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function shot(page, name, group) {
  await page.screenshot({ path: path.join(OUT, `practice-${name}.png`) });
  const over = await noSideways(page);
  check(group, `${name}: no sideways scroll`, over <= 1, `${over}px`);
}

async function progressState(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ssa:progress');
    return raw ? JSON.parse(raw).state : null;
  });
}

async function practiceData(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ssa:practice.data') || 'null'));
}

async function dismissToasts(page) {
  const close = page.locator('ol[aria-label="Notifications"] button[aria-label="Dismiss"]');
  for (let i = 0; i < 6 && (await close.count()) > 0; i++) {
    await close.first().click();
    await page.waitForTimeout(250);
  }
}

async function closeShellDialogs(page) {
  for (let i = 0; i < 4; i++) {
    if ((await page.locator('[role="dialog"]').count()) === 0) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

// ---------------------------------------------------------------------------------------------
// Phone: a five-minute session across two screens, a reload, the log and the XP
// ---------------------------------------------------------------------------------------------

async function phoneSession(browser, url) {
  const G = 'phone session';
  const { context, page, errors, go } = await openPage(browser, url, { mobile: true, theme: 'dark' });
  await go('practice');
  await shot(page, 'plan-phone-dark', 'looks');

  await page.locator('[data-minutes="5"]').click();
  await page.waitForTimeout(250);
  const blocks = page.locator('li[data-block]');
  check(G, '5 minutes gives two blocks', (await blocks.count()) === 2, await blocks.count());
  const minutes = await page.locator('li[data-block] [class*="blockMinutes"]').allTextContents();
  const sum = minutes.reduce((s, t) => s + parseInt(t, 10), 0);
  check(G, 'the blocks add up to 5 minutes', sum === 5, minutes.join(' + '));
  check(G, 'Start sits in the bottom action bar', await page.locator('[data-practice-start]').isVisible());

  await page.locator('[data-practice-start]').first().click();
  await page.waitForFunction(() => location.hash === '#practice--session', null, { timeout: 5000 });
  await page.waitForTimeout(300);
  const first = seconds(await page.locator('[data-practice-time]').textContent());
  check(G, 'the runner counts down the first block (1:00)', first === 60, first);
  check(G, 'the runner hides the tab bar (immersive)', (await page.locator('[data-immersive="focus"]').count()) === 1);

  await page.clock.runFor(20_000);
  await page.waitForTimeout(300);
  const after20 = seconds(await page.locator('[data-practice-time]').textContent());
  check(G, 'twenty injected seconds later it shows about 0:40', after20 >= 37 && after20 <= 40, after20);
  await shot(page, 'runner-phone-dark', 'looks');

  // Screen one: whatever the block opens.
  await page.locator('[data-practice-open]').click();
  await page.waitForFunction(() => !location.hash.startsWith('#practice'), null, { timeout: 5000 });
  await page.waitForTimeout(500);
  const screen1 = (await route(page)).slice(1).split('--')[0];
  const bar = page.locator('[data-practice-bar]');
  check(G, `the global bar shows on #${screen1}`, await bar.isVisible());
  const t1 = seconds(await page.locator('[data-practice-bar-time]').textContent());
  await page.clock.runFor(10_000);
  await page.waitForTimeout(300);
  const t2 = seconds(await page.locator('[data-practice-bar-time]').textContent());
  check(G, 'the bar counts down on another screen', t1 - t2 >= 9 && t1 - t2 <= 12, `${t1} -> ${t2}`);
  const box = await bar.boundingBox();
  const tabbar = await page.locator('nav[aria-label="Main"]').last().boundingBox();
  check(G, 'the bar floats above the tab bar', box && tabbar && box.y + box.height <= tabbar.y + 1, JSON.stringify({ box, tabbar }));
  await shot(page, 'bar-phone-dark', 'looks');

  await page.locator('[data-practice-bar-toggle]').click();
  await page.waitForTimeout(200);
  check(G, 'pause from the bar', (await bar.getAttribute('data-practice-bar')) === 'paused');
  const p1 = seconds(await page.locator('[data-practice-bar-time]').textContent());
  await page.clock.runFor(60_000);
  await page.waitForTimeout(300);
  const p2 = seconds(await page.locator('[data-practice-bar-time]').textContent());
  check(G, 'paused time does not count', p1 === p2, `${p1} -> ${p2}`);
  await page.locator('[data-practice-bar-toggle]').click();
  await page.waitForTimeout(200);
  check(G, 'resume from the bar', (await bar.getAttribute('data-practice-bar')) === 'running');

  // Screen two.
  const screen2 = screen1 === 'chords' ? 'rhythm' : 'chords';
  await page.evaluate((r) => {
    location.hash = `#${r}`;
  }, screen2);
  await page.waitForSelector(`main[data-route="${screen2}"]`);
  await page.clock.runFor(40_000);
  await page.waitForTimeout(400);
  const meta2 = await bar.textContent();
  check(G, `on #${screen2} the bar moved on to block 2 when block 1 ran out`, /2 of 2/.test(meta2 || ''), meta2);
  const before = seconds(await page.locator('[data-practice-bar-time]').textContent());
  const clockBefore = await page.evaluate(() => Date.now());
  const saved = await page.evaluate(() => localStorage.getItem('ssa:practice.session'));
  check(G, 'the session is saved while it runs', !!saved && JSON.parse(saved).index === 1);

  // Reload in the middle of block 2.
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('main[data-route]');
  await page.waitForSelector('[data-practice-bar]', { timeout: 15000 });
  await page.waitForTimeout(500);
  const afterReload = seconds(await page.locator('[data-practice-bar-time]').textContent());
  // Playwright's clock moves on by the real time the earlier runFor calls took when the page
  // reloads (tens of seconds on a busy machine): the session must count exactly what the page's
  // clock says passed, no more and no less.
  const passed = Math.round(((await page.evaluate(() => Date.now())) - clockBefore) / 1000);
  check(G, 'after a reload the bar is back on the same block', /2 of 2/.test((await bar.textContent()) || ''));
  check(G, 'after a reload the time carried on from where it was', afterReload <= before && Math.abs(before - afterReload - passed) <= 3, `${before} -> ${afterReload}, the clock moved ${passed} s`);

  await page.locator('[data-practice-bar-link]').click();
  await page.waitForFunction(() => location.hash === '#practice--session');
  const runner = await page.waitForSelector('[data-practice-time]', { timeout: 20000 }).then(() => true).catch(() => false);
  check(G, 'the bar leads back to the runner', runner && (await page.locator('[data-practice-time]').count()) === 1);
  check(G, 'no bar on the practice screen itself', (await page.locator('[data-practice-bar]').count()) === 0);

  await page.clock.runFor(5 * 60_000);
  await page.waitForTimeout(800);
  await closeShellDialogs(page);
  const heading = await page.locator('h1').first().textContent();
  check(G, 'the session finishes and shows its summary', /Session complete/.test(heading || ''), heading);
  await page.clock.runFor(2_000); // let the debounced progress save run
  await page.waitForTimeout(300);
  await shot(page, 'summary-phone-dark', 'looks');

  const state = await progressState(page);
  const logged = (state?.log || []).filter((e) => e.kind === 'practice');
  check(G, 'exactly one practice session in the progress log', logged.length === 1, logged.length);
  const entry = logged[0] || {};
  check(G, 'the log entry is the 300 s practised (the paused minute left out)', entry.durationSec === 300, entry.durationSec);
  check(G, 'it earned the practice XP (2 a minute: 10, so the minutes of a goal meet it)', entry.xp === 10, entry.xp);
  check(G, 'total XP went up by it', state?.xp?.total >= 8, state?.xp?.total);
  const summaryText = await page.locator('main').textContent();
  check(G, 'the summary shows the same XP', summaryText.includes(`+${entry.xp}`), summaryText.slice(0, 200));
  const today = state?.meta?.today;
  check(G, "today's minutes include the session", state?.days?.[today]?.kinds?.practice === 300, JSON.stringify(state?.days?.[today]?.kinds));
  const data = await practiceData(page);
  const j = data?.journal?.[0];
  check(G, 'the journal holds the session with both blocks', j && j.practisedSec === 300 && j.blocks.length === 2 && j.blocks.every((b) => b.outcome === 'done'), JSON.stringify(j && { s: j.practisedSec, b: j.blocks.map((b) => b.outcome) }));

  // The shell's "+8 XP" toast sits over the bottom bar on phones for a few seconds (and a hovering
  // pointer pauses it): close it the way a learner would.
  await dismissToasts(page);
  await page.locator('[data-practice-done]').click();
  await page.waitForFunction(() => location.hash === '#practice');
  check(G, 'Done goes back to the plan', true);
  check(G, 'no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// Desktop: editing, routines, goals, keys, leaving and ending early
// ---------------------------------------------------------------------------------------------

async function desktopFlows(browser, url) {
  const G = 'desktop';
  const { context, page, errors, go } = await openPage(browser, url, { mobile: false, theme: 'light' });
  await go('practice');
  const panes = await page.waitForSelector('aside[aria-label="Practice journal"]', { state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  check(G, 'two panes: the journal beside the plan', panes);
  await page.locator('[data-minutes="10"]').click();
  await page.waitForTimeout(250);
  const summary = () => page.locator('[class*="summary"]').first().textContent();
  check(G, '10 minutes', /^10 min/.test((await summary()) || ''), await summary());

  // Swap block 2.
  const titles = async () => page.locator('li[data-block] [class*="blockTitle"]').allTextContents();
  const before = await titles();
  await page.locator('li[data-block]').nth(1).getByRole('button', { name: /^Swap/ }).click();
  await page.waitForSelector('[role="dialog"]');
  await page.locator('[role="dialog"] li button, [role="dialog"] [role="listitem"] button').first().click();
  await page.waitForTimeout(400);
  const swapped = await titles();
  check(G, 'Swap replaces the block', swapped[1] !== before[1] && swapped.length === before.length, `${before[1]} -> ${swapped[1]}`);
  check(G, 'a swap keeps the total', /^10 min/.test((await summary()) || ''));

  // A minute more on block 1, then remove the last block.
  await page.locator('li[data-block]').first().getByRole('button', { name: /increase|more|\+|Increase/i }).first().click();
  await page.waitForTimeout(200);
  check(G, 'the stepper adds a minute', /^11 min/.test((await summary()) || ''), await summary());
  const count = await page.locator('li[data-block]').count();
  await page.locator('li[data-block]').last().getByRole('button', { name: /^More for/ }).click();
  await page.getByRole('menuitem', { name: 'Remove block' }).click();
  await page.waitForTimeout(300);
  check(G, 'Remove takes the block out (with an undo toast)', (await page.locator('li[data-block]').count()) === count - 1 && (await page.getByText(/^Removed “/).count()) > 0);

  // Save as routine.
  await page.getByRole('button', { name: 'Save as routine' }).click();
  await page.getByLabel('Routine name').fill('Evening routine');
  await page.getByRole('button', { name: 'Save routine' }).click();
  await page.waitForTimeout(300);
  await go('practice--routines');
  check(G, 'the saved routine is under Routines', (await page.getByRole('heading', { name: 'Evening routine' }).count()) === 1);
  check(G, 'the built-in routines are there', (await page.getByRole('heading', { name: '10-minute daily maintenance' }).count()) === 1 && (await page.getByRole('heading', { name: 'Chord change bootcamp' }).count()) === 1 && (await page.getByRole('heading', { name: 'Lead guitar warm-up' }).count()) === 1);

  // Duplicate a built-in routine, change it in the planner, save the change.
  await page.getByRole('button', { name: 'More for Lead guitar warm-up' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate to change it' }).click();
  await page.waitForFunction(() => location.hash === '#practice');
  await page.waitForTimeout(300);
  check(G, 'Duplicate opens the copy in the planner', /Routine: Lead guitar warm-up \(copy\)/.test((await page.locator('main').textContent()) || ''));
  await page.locator('li[data-block]').first().getByRole('button', { name: /^Increase/ }).click();
  await page.getByRole('button', { name: 'Save changes to routine' }).click();
  await page.waitForTimeout(300);
  await go('practice--routines');
  const copy = page.locator('article', { has: page.getByRole('heading', { name: 'Lead guitar warm-up (copy)' }) });
  check(G, 'the edited copy is saved with its new length (16 min)', /16 min/.test((await copy.textContent()) || ''), await copy.textContent());

  // Pin a focus goal; the next plan gives it time first.
  await go('practice--goals');
  await page.locator('[data-goal-add]').first().click();
  await page.getByLabel('Goal', { exact: true }).fill('Clean F barre chord');
  await page.locator('[data-goal-save]').click();
  await page.waitForTimeout(300);
  check(G, 'the goal is pinned', (await page.locator('[data-goal]').count()) === 1);
  const slider = page.getByRole('slider', { name: 'Progress' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const goals = (await practiceData(page))?.goals || [];
  check(G, 'progress is marked on the goal (20%)', goals[0]?.progress === 20, JSON.stringify(goals.map((g) => g.progress)));
  await go('practice');
  await page.locator('[data-minutes="15"]').click();
  await page.waitForTimeout(300);
  const second = await page.locator('li[data-block]').nth(1).textContent();
  check(G, 'the plan gives the goal the first block after the warm-up', /Clean F barre chord/.test(second || '') && /Your focus goal/.test(second || ''), second);
  await shot(page, 'plan-desktop-light', 'looks');

  // Runner keys.
  await page.locator('[data-practice-start]').first().click();
  await page.waitForFunction(() => location.hash === '#practice--session');
  await page.waitForTimeout(300);
  await page.locator('h1').first().click(); // focus on the page, not on a button
  const time = async () => seconds(await page.locator('[data-practice-time]').textContent());
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const paused = await time();
  await page.clock.runFor(30_000);
  await page.waitForTimeout(250);
  check(G, 'Space pauses', (await time()) === paused && /Resume/.test((await page.locator('[data-practice-toggle]').textContent()) || ''));
  await page.keyboard.press('Space');
  await page.clock.runFor(5_000);
  await page.waitForTimeout(250);
  check(G, 'Space resumes', (await time()) < paused);
  await page.keyboard.press('n');
  await page.waitForTimeout(300);
  check(G, 'N moves to the next block', /Block 2 of/.test((await page.locator('main').textContent()) || ''));
  await page.clock.runFor(40_000);
  await page.waitForTimeout(250);
  await shot(page, 'runner-desktop-light', 'looks');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]');
  check(G, 'Esc asks before leaving', (await page.getByRole('heading', { name: 'Leave the session?' }).count()) === 1);
  await page.getByRole('button', { name: 'Leave, keep timing' }).click();
  await page.waitForFunction(() => location.hash === '#practice');
  await page.waitForTimeout(300);
  check(G, 'leaving keeps the session: a resume card on the plan', await page.locator('[data-practice-resume]').isVisible());
  await go('home');
  const bar = page.locator('[data-practice-bar]');
  check(G, 'the bar shows on Today', await bar.isVisible());
  const b = await bar.boundingBox();
  check(G, 'on a wide screen it sits in the bottom-right corner', b && b.x > 1280 / 2 && b.y + b.height > 800 - 60, JSON.stringify(b));
  await shot(page, 'bar-desktop-light', 'looks');

  // End early.
  await page.locator('[data-practice-bar-link]').click();
  await page.waitForFunction(() => location.hash === '#practice--session');
  await page.locator('[data-practice-end]').click();
  await page.getByRole('button', { name: 'End and save' }).click();
  await page.waitForTimeout(500);
  await closeShellDialogs(page);
  check(G, 'End asks first and shows "Session ended"', /Session ended/.test((await page.locator('h1').first().textContent()) || ''));
  await page.getByRole('radio', { name: /Good/ }).click();
  await page.getByLabel('A note for next time').fill('Barre is getting there.');
  await page.clock.runFor(1_500);
  await page.waitForTimeout(300);
  await page.locator('[data-practice-done]').click();
  await page.waitForFunction(() => location.hash === '#practice');
  await page.waitForTimeout(400);
  const pane = (await page.locator('aside[aria-label="Practice journal"]').textContent()) || '';
  check(G, 'the journal pane lists the session with its feel and note', /Good/.test(pane) && /Barre is getting there\./.test(pane), pane.slice(0, 240));
  await page.clock.runFor(2_000);
  const state = await progressState(page);
  const logged = (state?.log || []).filter((e) => e.kind === 'practice');
  const data = await practiceData(page);
  check(G, 'the early end is logged once, with the time practised', logged.length === 1 && logged[0].durationSec === data?.journal?.[0]?.practisedSec && logged[0].durationSec > 30, JSON.stringify(logged.map((l) => l.durationSec)));
  await shot(page, 'journal-desktop-light', 'looks');
  check(G, 'no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// The other two theme/size combinations
// ---------------------------------------------------------------------------------------------

async function otherLooks(browser, url) {
  for (const [mobile, theme] of [
    [true, 'light'],
    [false, 'dark'],
  ]) {
    const name = `${mobile ? 'phone' : 'desktop'}-${theme}`;
    const { context, page, errors, go } = await openPage(browser, url, { mobile, theme });
    await go('practice');
    await shot(page, `plan-${name}`, 'looks');
    await page.locator('[data-practice-start]').first().click();
    await page.waitForFunction(() => location.hash === '#practice--session');
    await page.clock.runFor(30_000);
    await page.waitForTimeout(300);
    await shot(page, `runner-${name}`, 'looks');
    await go(mobile ? 'practice--journal' : 'practice--goals');
    await shot(page, `${mobile ? 'journal' : 'goals'}-${name}`, 'looks');
    check('looks', `${name}: no console errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Edge cases that once failed: a 360 px phone, 200 % text, the journal's day labels, a beginner's
// first plans, the End dialog's wording and a block left part-way
// ---------------------------------------------------------------------------------------------

/** True when an element's text is cut short (an ellipsis or a clipped label). */
async function clipped(locator) {
  return locator.evaluate((el) => [el, ...el.querySelectorAll('span')].some((n) => n.scrollWidth > n.clientWidth + 1));
}

async function edgeCases(browser, url) {
  const G = 'edge cases';

  // 360 px: every label whole, the selected tile's check clear of its number.
  {
    const { context, page, errors, go } = await openPage(browser, url, { mobile: true, theme: 'light', viewport: { width: 360, height: 740 } });
    await go('practice');
    check(G, '360: "New mix" keeps its label', !(await clipped(page.getByRole('button', { name: 'New mix' }))));
    const overlap = await page.evaluate(() => {
      const tile = document.querySelector('[role="radio"][aria-checked="true"][data-minutes]');
      const check = tile && tile.querySelector('span[aria-hidden="true"]:has(svg)');
      const num = tile && [...tile.querySelectorAll('span')].find((s) => /^\d+$/.test(s.textContent.trim()));
      if (!check || !num) return 'missing';
      const a = check.getBoundingClientRect();
      const b = num.getBoundingClientRect();
      return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    });
    check(G, '360: the selected tile’s check does not cover its number', overlap === 0, overlap);
    await page.locator('[data-practice-start]').first().click();
    await page.waitForFunction(() => location.hash === '#practice--session');
    await page.waitForTimeout(300);
    for (const sel of ['[data-practice-toggle]', '[data-practice-next]']) check(G, `360: ${sel} label is whole`, !(await clipped(page.locator(sel))), await page.locator(sel).textContent());
    check(G, '360: runner does not scroll sideways', (await noSideways(page)) <= 1);
    // A block left part-way shows how far it got on the strip, not a full bar.
    await page.clock.runFor(30_000);
    await page.waitForTimeout(200);
    await page.locator('[data-practice-next]').click();
    await page.waitForTimeout(300);
    const fill = await page.evaluate(() => {
      const f = document.querySelector('[data-outcome]');
      return f ? { outcome: f.getAttribute('data-outcome'), width: parseFloat(f.style.width) } : null;
    });
    check(G, 'a block left part-way fills its segment part-way', fill && fill.outcome === 'partial' && fill.width > 0 && fill.width < 100, JSON.stringify(fill));
    // End asks in words: "40 seconds", not "0:40", which reads like a time of day.
    await page.clock.runFor(10_000);
    await page.locator('[data-practice-end]').first().click();
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]').last();
    await dialog.waitFor();
    const text = await dialog.innerText();
    check(G, 'End says the time practised in words', /practised \d+ seconds\./.test(text) && !/\d:\d\d/.test(text), text.replace(/\n+/g, ' | '));
    await page.getByRole('button', { name: 'Keep going' }).click();
    check(G, '360: no console errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // 200 % text on a phone: the ring fits, the controls keep their words, nothing scrolls sideways.
  {
    const { context, page, errors, go } = await openPage(browser, url, { mobile: true, theme: 'dark' });
    const big = () => page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await go('practice');
    await big();
    await page.locator('[data-practice-start]').first().click();
    await page.waitForFunction(() => location.hash === '#practice--session');
    await page.waitForTimeout(500);
    check(G, '200 %: runner does not scroll sideways', (await noSideways(page)) <= 1, `${await noSideways(page)}px`);
    const ring = await page.$eval('[data-practice-time]', (e) => {
      const r = e.closest('[role="progressbar"]').getBoundingClientRect();
      return { left: r.left, right: r.right, vw: document.documentElement.clientWidth };
    });
    check(G, '200 %: the countdown ring stays on screen', ring.left >= 0 && ring.right <= ring.vw, JSON.stringify(ring));
    for (const sel of ['[data-practice-toggle]', '[data-practice-next]']) check(G, `200 %: ${sel} label is whole`, !(await clipped(page.locator(sel))), await page.locator(sel).textContent());
    await page.screenshot({ path: path.join(OUT, 'practice-runner-text-200.png') });
    await go('home');
    await big();
    await page.waitForTimeout(400);
    check(G, '200 %: the bar does not push Today sideways', (await noSideways(page)) <= 1);
    check(G, '200 %: no console errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // The journal names each entry's day; opening last week's entry must not call it "Today".
  {
    const { context, page, errors, go } = await openPage(browser, url, { mobile: true, theme: 'dark' });
    await go('practice');
    const today = await page.evaluate(() => JSON.parse(localStorage.getItem('ssa:progress') || 'null')?.state?.meta?.today);
    const day = (offset) => {
      const d = new Date(`${today || '2026-11-16'}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const at = (offset) => START.getTime() + offset * 86_400_000;
    const entry = (id, offset) => ({ id, startedAt: at(offset) - 600_000, endedAt: at(offset), day: day(offset), title: `Plan ${id}`, plannedSec: 600, practisedSec: 600, blocks: [{ area: 'chords', title: 'G to C', plannedSec: 600, spentSec: 600, outcome: 'done' }], xp: 15, feel: null, note: '', endedEarly: false });
    await page.evaluate((data) => localStorage.setItem('ssa:practice.data', JSON.stringify(data)), { v: 1, routines: [], goals: [], weeklyGoalMin: null, journal: [entry('yday', -1), entry('older', -6)] });
    // A new hash alone is a same-page navigation: reload so the practice store reads the seed.
    await go('practice--journal');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-journal-entry="yday"]', { timeout: 20000 });
    const labelOf = async (id) => {
      await page.locator(`[data-journal-entry="${id}"]`).click();
      const sheet = page.locator('[role="dialog"]').last();
      await sheet.waitFor();
      const text = await sheet.innerText();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      return text;
    };
    const y = await labelOf('yday');
    check(G, 'journal sheet: yesterday’s entry says "Yesterday"', /Yesterday,/.test(y) && !/Today,/.test(y), y.split('\n').slice(0, 3).join(' | '));
    const o = await labelOf('older');
    check(G, 'journal sheet: last week’s entry names its date', !/Today,|Yesterday,/.test(o) && /\b\d{1,2} [A-Z][a-z]{2}\b/.test(o), o.split('\n').slice(0, 3).join(' | '));
    check(G, 'journal: no console errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // A brand-new beginner is not handed the F barre chord (or the other later exercises) on day one.
  {
    const { context, page, errors, go } = await openPage(browser, url, { mobile: false, theme: 'light' });
    await go('practice');
    const later = /F barre chord|A minor pentatonic, box 1|G major scale, two octaves|Hammer-ons and pull-offs/;
    const seen = new Set();
    for (const minutes of [5, 10, 15, 30, 45, 60]) {
      await page.locator(`[role="radio"][data-minutes="${minutes}"]`).click();
      for (let mix = 0; mix < 3; mix++) {
        await page.waitForTimeout(150);
        for (const t of await page.locator('ol li[data-block] p').allInnerTexts()) seen.add(t.replace(/^Block \d+: /, '').trim());
        await page.getByRole('button', { name: 'New mix' }).click();
      }
    }
    const early = [...seen].filter((t) => later.test(t));
    check(G, 'a first-day beginner’s 18 plans hold back the later exercises', seen.size > 10 && early.length === 0, early.join(', ') || `${seen.size} distinct lines`);
    check(G, 'beginner plans: no console errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------
// The content library in plans, and what the session bar loads on other screens
// ---------------------------------------------------------------------------------------------

async function libraryAndLightBar(browser, url) {
  const G = 'library and bar';
  const { context, page, errors, go } = await openPage(browser, url, { mobile: false, theme: 'dark' });
  await go('practice');
  await page.waitForSelector('[data-practice-start]', { timeout: 20000 });
  // Over a few plans, blocks name real exercises and songs and open them at their own address.
  const deep = new Set();
  for (const minutes of [15, 30, 45, 60]) {
    await page.locator(`[role="radio"][data-minutes="${minutes}"]`).click();
    for (let mix = 0; mix < 3; mix++) {
      await page.waitForTimeout(200);
      const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('ssa:practice.draft') || 'null'));
      for (const b of draft?.blocks ?? []) {
        if (/^(technique|song):/.test(b.itemId ?? '') && b.target?.params?.length) deep.add(`#${b.target.route}--${b.target.params.join('--')}`);
      }
      await page.getByRole('button', { name: 'New mix' }).click();
    }
  }
  check(G, 'plans draw technique exercises and songs from the app’s content, each with its own address', [...deep].some((h) => h.startsWith('#technique--')) && [...deep].some((h) => h.startsWith('#play--')), [...deep].slice(0, 8).join(' '));

  // A running session, then a fresh load of another screen: the bar comes up without the pool.
  await page.locator('[role="radio"][data-minutes="10"]').click();
  await page.locator('[data-practice-start]').first().click();
  await page.waitForFunction(() => location.hash === '#practice--session');
  const requested = [];
  page.on('request', (r) => requested.push(r.url()));
  await page.goto(`${url}#tuner`, { waitUntil: 'load' });
  const bar = await page.waitForSelector('[data-practice-bar]', { timeout: 20000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(1500);
  check(G, 'the session bar shows on another screen after a fresh load', bar);
  const heavy = requested.filter((u) => /features\/practice\/model\/(content|planner|library|routines|signals)\.ts|\/src\/content\//.test(u));
  check(G, 'the bar loads no exercise pool, planner or content', heavy.length === 0, heavy.map((u) => u.replace(url, '')).join(' '));
  check(G, 'no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

withApp({}, async ({ browser, url }) => {
  const steps = [
    ['phone session', () => phoneSession(browser, url)],
    ['desktop', () => desktopFlows(browser, url)],
    ['looks', () => otherLooks(browser, url)],
    ['edge cases', () => edgeCases(browser, url)],
    ['library and bar', () => libraryAndLightBar(browser, url)],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (e) {
      check(name, 'ran to the end', false, e && e.message);
    }
  }
})
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    const groups = [...new Set(results.map((r) => r.group))];
    for (const g of groups) {
      const list = results.filter((r) => r.group === g);
      console.log(`${list.every((r) => r.pass) ? 'ok  ' : 'FAIL'}  ${g}: ${list.filter((r) => r.pass).length}/${list.length}`);
    }
    console.log(failed.length === 0 ? `PASSED (${results.length} checks)` : `FAILED (${failed.length} of ${results.length} checks)`);
    process.exit(failed.length === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    console.log('FAILED');
    process.exit(1);
  });
