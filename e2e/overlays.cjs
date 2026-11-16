#!/usr/bin/env node
/**
 * Browser check of the layers above a screen: toasts, sheets and dialogs, the bars at the bottom,
 * and the shell at a large text size. Run: node e2e/overlays.cjs [--verbose] [--only toasts,back]
 *
 * What it checks (phone 390 x 844 unless it says desktop 1280 x 800):
 *  toasts      a moment's rewards never cover an open sheet: they wait and show once it closes,
 *              while a reply to a tap shows at the top edge, clear of the sheet; a lesson's worth of
 *              rewards plus replies never shows more than three toasts, and the rewards share one card
 *  clearance   --action-bar-h is published only while an ActionBar is stuck at the bottom (not for
 *              the tuner's static bar on a desktop, not for a bar boxed mid-screen), the metronome's
 *              controls keep toasts above them through the kit hook, toasts clear a practice session
 *              bar, and an immersive screen does not lift toasts for a tab bar it hides
 *  text 200 %  on 390 and 360 px: the tab bar's labels are whole and on screen, the top bar's chips
 *              stay inside the bar with the title showing, the pill tabs on #chords and the segmented
 *              controls on #tuner and the player never cut a label; at the normal size nothing moved
 *  immersive   no scroll padding is kept for the tab bar an immersive screen hides
 *  back        Back closes an open sheet and stays on the screen (phone and desktop); a link inside a
 *              sheet, then Back, returns to the screen; a sheet opened from the address
 *              (#songs--add) and closed does not come back on Back
 *  keyboard    two Tabs and Enter reach a screen's main action: the practice plan's Start on a desktop
 *              (it took 29 Tabs), the tuner's bar on a phone ("Jump to the main action")
 * Screenshots go to e2e/out/overlays-*.png. Exits non-zero if any check failed.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, ROOT } = require('./lib/harness.cjs');
const { buildSeeds, seedContext } = require('./profile-seed.cjs');

const verbose = process.argv.includes('--verbose');
const onlyArg = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',') : null;
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail !== '' ? `  (${String(detail).slice(0, 300)})` : ''}`);
  return !!pass;
}

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function open(browser, url, { viewport = PHONE, mobile = viewport.width < 900, text = null, saved = null } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'dark', hasTouch: mobile, isMobile: mobile });
  await seedContext(context, saved);
  if (text) await context.addInitScript((size) => document.addEventListener('DOMContentLoaded', () => (document.documentElement.style.fontSize = size)), text);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((b) => b.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  const goto = async (hash, ready = 'main[data-route]', settle = 600) => {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector(ready, { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('[data-shell-fallback]'), null, { timeout: 30000 });
    await page.waitForTimeout(settle);
  };
  const shot = (name) => page.screenshot({ path: path.join(OUT, `overlays-${name}.png`) });
  return { context, page, errors, goto, shot, close: () => context.close() };
}

/** Run app code in the page: the progress store and the toast API are the app's own modules. */
const progress = (page, fn, arg) => page.evaluate(async ([body, a]) => new Function('p', 'a', `return (${body})(p, a)`)(await import('/src/core/progress/index.ts'), a), [fn.toString(), arg]);
const reply = (page, title) => page.evaluate(async (t) => (await import('/src/ui/index.ts')).toast({ title: t }), title);

/** Toasts on screen (not on their way out), with where they are. */
const toastsOnScreen = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-toast]')]
      .filter((el) => getComputedStyle(el).opacity !== '0' && !el.className.includes('leaving'))
      .map((el) => ({ id: el.getAttribute('data-toast'), text: el.textContent.replace(/\s+/g, ' ').trim(), lines: el.querySelectorAll('li').length, ...el.getBoundingClientRect().toJSON() })),
  );
const dialogPanel = (page) => page.evaluate(() => document.querySelector('[role="dialog"]')?.getBoundingClientRect().toJSON() ?? null);
const actionBarH = (page) => page.evaluate(() => document.documentElement.style.getPropertyValue('--action-bar-h'));

async function closeDialogs(page) {
  for (let i = 0; i < 4 && (await page.locator('[role="dialog"]').count()) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  }
}

// -----------------------------------------------------------------------------------------------
async function toasts(browser, url) {
  const group = 'toasts';
  const ctx = await open(browser, url);
  const { page } = ctx;
  await ctx.goto('tuner', '[data-ui-action-bar]');
  // A sheet is open (the daily goal, from the top bar) when a moment's rewards arrive.
  await page.locator('header [data-chip="goal"]').click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(400);
  await progress(page, (p) => p.recordActivity({ kind: 'tuner', durationSec: 120, route: 'tuner' }));
  await page.waitForTimeout(700);
  const whileOpen = await toastsOnScreen(page);
  check(group, 'rewards that arrive while a sheet is open do not cover it', whileOpen.length === 0, JSON.stringify(whileOpen.map((t) => t.text)));
  await reply(page, 'Copied');
  await page.waitForTimeout(500);
  const panel = await dialogPanel(page);
  const replyToast = (await toastsOnScreen(page)).find((t) => t.text.includes('Copied'));
  check(group, 'a reply to a tap still shows, at the top edge, clear of the sheet', replyToast && panel && replyToast.top < 80 && replyToast.bottom <= panel.top + 1, JSON.stringify({ toast: replyToast && [replyToast.top, replyToast.bottom], panelTop: panel && panel.top }));
  await ctx.shot('reply-over-sheet-phone');
  await closeDialogs(page);
  await page.waitForTimeout(600);
  const after = await toastsOnScreen(page);
  check(group, 'once the sheet closes, the rewards show (they are still felt)', after.some((t) => /XP/.test(t.text)), JSON.stringify(after.map((t) => t.text)));
  await ctx.shot('rewards-after-sheet-phone');

  // A sheet that reaches the top of the screen (the tuner's Tuning sheet): a reply goes under its
  // header, so the title and the Close button stay clear.
  await page.locator('main').getByRole('button', { name: /tuning|standard/i }).first().click();
  await page.waitForSelector('[role="dialog"] [data-ui-dialog-header]');
  await page.waitForTimeout(600);
  await reply(page, 'Copied');
  await page.waitForTimeout(500);
  const tall = await page.evaluate(() => {
    const t = document.querySelector('[data-toast]')?.getBoundingClientRect();
    const d = document.querySelector('[role="dialog"]');
    const head = d.querySelector('[data-ui-dialog-header]').getBoundingClientRect();
    const close = d.querySelector('button[aria-label="Close"]').getBoundingClientRect();
    return { toast: t && [Math.round(t.top), Math.round(t.bottom)], panelTop: Math.round(d.getBoundingClientRect().top), head: [Math.round(head.top), Math.round(head.bottom)], close: Math.round(close.bottom) };
  });
  check(group, 'a tall sheet: a reply sits under its header, clear of the title and Close', tall.toast && tall.panelTop < 100 && tall.toast[0] >= tall.head[1] && tall.toast[0] >= tall.close, JSON.stringify(tall));
  await ctx.shot('reply-over-tall-sheet-phone');
  await closeDialogs(page);
  await ctx.close();

  // A finished lesson: XP, a first achievement or three, a crown, maybe a level, plus replies.
  const big = await open(browser, url);
  await big.goto('home');
  await progress(big.page, (p) => {
    p.recordActivity({ kind: 'theory-lesson', id: 'theory:sound-and-pitch:a-sound-is-a-vibration', title: 'A sound is a vibration', accuracy: 1, perfect: true, mistakes: 0, durationSec: 240, route: 'learn' });
  });
  for (const t of ['Saved', 'Added to your songs', 'Copied']) await reply(big.page, t);
  let most = 0;
  let card = null;
  for (let i = 0; i < 30; i++) {
    if ((await big.page.locator('[role="dialog"]').count()) > 0) {
      // A level-up dialog comes first; the toasts wait behind it.
      const behind = await toastsOnScreen(big.page);
      most = Math.max(most, behind.length);
      await big.page.getByRole('button', { name: /Keep going|Next/ }).first().click();
    }
    const now = await toastsOnScreen(big.page);
    most = Math.max(most, now.length);
    card = card || now.find((t) => t.lines > 0) || null;
    if (i === 6) await big.shot('lesson-rewards-phone');
    await big.page.waitForTimeout(200);
  }
  check(group, 'never more than three toasts at once, even at the end of a lesson with replies on top', most <= 3, most);
  check(group, "a lesson's rewards share one card, a line for each piece of news", !!card, card ? card.text.slice(0, 120) : 'no card with lines');
  check(group, 'no console errors', ctx.errors.length + big.errors.length === 0, [...ctx.errors, ...big.errors].slice(0, 2).join(' | '));
  await big.close();
}

// -----------------------------------------------------------------------------------------------
async function clearance(browser, url) {
  const group = 'clearance';
  const desk = await open(browser, url, { viewport: DESKTOP });
  await desk.goto('tuner', '[data-ui-action-bar]');
  check(group, 'desktop #tuner: its bar is static beside the meter, so nothing is published', (await actionBarH(desk.page)) === '', await actionBarH(desk.page));
  await reply(desk.page, 'Tuning saved');
  await desk.page.waitForTimeout(500);
  const t = (await toastsOnScreen(desk.page))[0];
  check(group, 'desktop #tuner: the toast sits in the corner, not lifted', t && t.bottom >= DESKTOP.height - 40, t && t.bottom);
  await desk.shot('tuner-toast-desktop');
  await desk.close();

  const phone = await open(browser, url);
  await phone.goto('tuner', '[data-ui-action-bar]');
  const stuck = parseFloat(await actionBarH(phone.page)) || 0;
  await reply(phone.page, 'Tuning saved');
  await phone.page.waitForTimeout(500);
  const bar = await phone.page.evaluate(() => document.querySelector('[data-ui-action-bar]').getBoundingClientRect().toJSON());
  const pt = (await toastsOnScreen(phone.page))[0];
  check(group, 'phone #tuner: the stuck bar is published and the toast sits above it', stuck > 40 && pt && pt.bottom <= bar.top + 1, JSON.stringify({ stuck, toast: pt && pt.bottom, bar: bar.top }));
  await phone.shot('tuner-toast-phone');

  await phone.goto('kit--layout', '[data-ui-action-bar]');
  await phone.page.evaluate(() => window.scrollTo(0, 0));
  await phone.page.waitForTimeout(400);
  const boxed = await phone.page.evaluate(() => document.querySelector('[data-ui-action-bar]').getBoundingClientRect().toJSON());
  check(group, 'a bar that sits mid-screen (boxed in the kit gallery) publishes nothing', boxed.bottom < 844 - 160 ? (await actionBarH(phone.page)) === '' : true, JSON.stringify({ bottom: boxed.bottom, published: await actionBarH(phone.page) }));

  await phone.goto('metronome', '[data-start]');
  const metro = parseFloat(await actionBarH(phone.page)) || 0;
  await reply(phone.page, 'Waltz 3/4 is set. Press Start');
  await phone.page.waitForTimeout(500);
  const m = await phone.page.evaluate(() => ({ step: document.querySelector('[data-tempo-step]').getBoundingClientRect().top, start: document.querySelector('[data-start]').getBoundingClientRect().toJSON() }));
  const mt = (await toastsOnScreen(phone.page))[0];
  check(group, 'metronome (kit hook): toasts sit above the tempo buttons and Start', metro > 0 && mt && mt.bottom <= m.step + 1, JSON.stringify({ metro, toast: mt && mt.bottom, controls: m.step }));
  await phone.shot('metronome-toast-phone');

  // A practice session running: its bar floats at the bottom of every other screen.
  await phone.goto('home');
  await phone.page.evaluate(() => {
    const fake = document.createElement('div');
    fake.setAttribute('data-practice-bar', '');
    document.body.appendChild(fake);
  });
  await reply(phone.page, 'Saved');
  await phone.page.waitForTimeout(500);
  const space = await phone.page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;height:var(--practice-bar-space,0px)';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return { space: h, nav: document.querySelector('nav[aria-label="Main"]').getBoundingClientRect().top };
  });
  const st = (await toastsOnScreen(phone.page))[0];
  // The session bar ends 8 px above the tab bar and is 3.75rem tall.
  check(group, 'a practice session bar at the bottom: toasts sit above it, not on it', space.space > 40 && st && st.bottom <= space.nav - 8 - 60 + 1, JSON.stringify({ ...space, toast: st && st.bottom }));
  await phone.page.evaluate(() => document.querySelector('[data-practice-bar]')?.remove());

  // A lesson: immersive, with its ActionBar at the bottom.
  await phone.goto('learn--sound-and-pitch--a-sound-is-a-vibration', '[data-ui-action-bar]', 1500);
  const imm = await phone.page.evaluate(() => ({ immersive: document.querySelector('[data-immersive]').dataset.immersive, nav: getComputedStyle(document.documentElement).getPropertyValue('--nav-h').trim(), bottom: parseFloat(getComputedStyle(document.querySelector('ol[aria-label="Notifications"]')).bottom), bar: parseFloat(document.documentElement.style.getPropertyValue('--action-bar-h')) || 0 }));
  check(group, 'immersive screen: toasts are not lifted for the tab bar it hides', imm.immersive !== 'none' && imm.nav === '0px' && imm.bar > 0 && imm.bottom <= imm.bar + 20, JSON.stringify(imm));

  // The player: immersive, its transport at the bottom is not an ActionBar. Toasts go to the top,
  // under the slim top bar, instead of over Play.
  await phone.goto('play--hot-cross-buns', 'main[data-route="play"] [data-ui-primary]', 1500);
  await reply(phone.page, 'Loop set');
  await phone.page.waitForTimeout(600);
  const player = await phone.page.evaluate(() => {
    const t = document.querySelector('[data-toast]')?.getBoundingClientRect();
    const header = document.querySelector('header')?.getBoundingClientRect();
    const covered = [...document.querySelectorAll('main button, main [role="radio"]')]
      .filter((b) => b.getClientRects().length)
      .map((b) => ({ b: b.getBoundingClientRect(), name: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 24) }))
      .filter(({ b }) => t && Math.min(b.right, t.right) - Math.max(b.left, t.left) > 4 && Math.min(b.bottom, t.bottom) - Math.max(b.top, t.top) > 4)
      .map(({ name }) => name);
    return { toast: t && [Math.round(t.top), Math.round(t.bottom)], header: header && Math.round(header.bottom), covered, marked: document.documentElement.hasAttribute('data-ui-bottom-controls') };
  });
  check(group, 'player (no ActionBar): a toast goes under the top bar and covers none of its controls', player.toast && !player.marked && player.toast[0] >= (player.header || 0) && player.covered.length === 0, JSON.stringify(player));
  await phone.shot('player-toast-phone');
  check(group, 'no console errors', phone.errors.length === 0, phone.errors.slice(0, 2).join(' | '));
  await phone.close();
}

// -----------------------------------------------------------------------------------------------
async function largeText(browser, url, seeds) {
  const group = 'text 200 %';
  for (const width of [390, 360]) {
    const ctx = await open(browser, url, { viewport: { width, height: 844 }, text: '200%', saved: seeds.rich.saved });
    const { page } = ctx;
    await ctx.goto('home');
    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll('nav[aria-label="Main"] a')].map((a) => {
        const label = a.lastElementChild;
        return { text: label.textContent, cut: label.scrollWidth > label.clientWidth + 1, bottom: label.getBoundingClientRect().bottom };
      }),
    );
    check(group, `${width} px: the tab bar's labels are whole and on screen`, tabs.length === 5 && tabs.every((t) => !t.cut && t.bottom <= 844 + 0.5), JSON.stringify(tabs));
    if (width === 390) await ctx.shot('home-200-phone');

    await ctx.goto('scales');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    const top = await page.evaluate(() => {
      const bar = document.querySelector('header').getBoundingClientRect();
      const chips = [...document.querySelectorAll('header [data-chip]')].filter((c) => getComputedStyle(c).visibility !== 'hidden').map((c) => c.getBoundingClientRect());
      return { right: Math.max(...chips.map((c) => c.right)), left: Math.min(...chips.map((c) => c.left)), barRight: bar.right, shown: chips.length, fit: document.querySelector('header').dataset.fit };
    });
    check(group, `${width} px: the top bar's chips stay inside the bar, title or not`, top.right <= top.barRight + 0.5 && top.left >= 0 && top.shown >= 3, JSON.stringify(top));
    if (width === 390) await ctx.shot('scales-200-scrolled-phone');

    await ctx.goto('chords', '[role="tablist"]');
    const pills = await page.evaluate(() => [...document.querySelectorAll('[role="tablist"]')].map((l) => ({ sw: l.scrollWidth, cw: l.clientWidth })));
    check(group, `${width} px: the pill tabs on #chords wrap instead of running off`, pills.length > 0 && pills.every((p) => p.sw <= p.cw + 1), JSON.stringify(pills));
    if (width === 390) await ctx.shot('chords-200-phone');

    for (const [route, ready] of [
      ['tuner', '[role="radiogroup"]'],
      ['play--hot-cross-buns', '[role="radiogroup"]'],
    ]) {
      await ctx.goto(route, ready, 1200);
      const segs = await page.evaluate(() =>
        [...document.querySelectorAll('[role="radiogroup"]')]
          .filter((g) => g.offsetParent)
          .map((g) => {
            const spans = [...g.querySelectorAll('[role="radio"] span')].filter((s) => s.firstChild && s.firstChild.nodeType === 3);
            // Cut short (an ellipsis) or broken inside a word ("List|en"): a word that takes two boxes.
            const broken = spans.filter((s) => {
              const text = s.firstChild.textContent;
              let at = 0;
              return text.split(' ').some((word) => {
                const range = document.createRange();
                range.setStart(s.firstChild, at);
                range.setEnd(s.firstChild, at + word.length);
                at += word.length + 1;
                return word.length > 0 && new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size > 1;
              });
            });
            const cut = spans.filter((s) => s.scrollWidth > s.clientWidth + 1 || broken.includes(s)).map((s) => s.textContent);
            return { label: g.getAttribute('aria-label'), right: g.getBoundingClientRect().right, cut };
          }),
      );
      check(group, `${width} px #${route}: no segmented label is cut short or broken inside a word, none runs off the page`, segs.every((s) => s.cut.length === 0 && s.right <= width + 0.5), JSON.stringify(segs.filter((s) => s.cut.length || s.right > width)));
      if (width === 390) await ctx.shot(`${route.split('--')[0]}-200-phone`);
    }
    check(group, `${width} px: no console errors`, ctx.errors.length === 0, ctx.errors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // The normal size is untouched: one row of segments, a 60 px tab bar, every chip and the brand.
  const normal = await open(browser, url, { saved: seeds.rich.saved });
  await normal.goto('tuner', '[role="radiogroup"]');
  const rows = await normal.page.evaluate(() => {
    const g = document.querySelector('[role="radiogroup"]');
    return new Set([...g.querySelectorAll('[role="radio"]')].map((r) => Math.round(r.getBoundingClientRect().top))).size;
  });
  const shell = await normal.page.evaluate(() => ({ nav: document.querySelector('nav[aria-label="Main"]').getBoundingClientRect().height, fit: document.querySelector('header').dataset.fit }));
  check('normal text', 'segments share one row, the tab bar is 60 px, the top bar shows everything', rows === 1 && Math.round(shell.nav) === 60 && shell.fit === 'all', JSON.stringify({ rows, ...shell }));
  await normal.close();
}

// -----------------------------------------------------------------------------------------------
async function immersive(browser, url) {
  const ctx = await open(browser, url);
  await ctx.goto('home');
  const home = await ctx.page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom));
  await ctx.goto('play--hot-cross-buns', 'main[data-route="play"]', 1200);
  const play = await ctx.page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom));
  check('immersive', 'scroll padding follows the tab bar: kept on Today, gone on the player', home >= 60 && play <= 20, JSON.stringify({ home, play }));
  // Screens that put data-layout="phone" on their own elements (scales, reference) are not
  // immersive: the tab bar stays its full height and everything keeps clear of it.
  for (const route of ['scales--c--major', 'reference']) {
    await ctx.goto(route, 'main[data-route] [data-layout="phone"]', 800);
    const bar = await ctx.page.evaluate(() => ({
      immersive: document.querySelector('[data-immersive]').dataset.immersive,
      tabbar: Math.round(document.querySelector('nav[aria-label="Main"]')?.getBoundingClientRect().height ?? 0),
      padding: parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom),
      scroll: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
    }));
    check('immersive', `#${route}: a screen's own data-layout="phone" does not hide the tab bar`, bar.immersive === 'none' && bar.tabbar >= 60 && bar.padding >= 60 && bar.scroll >= 60, JSON.stringify(bar));
  }
  await ctx.close();
}

// -----------------------------------------------------------------------------------------------
async function back(browser, url) {
  const group = 'back';
  for (const viewport of [PHONE, DESKTOP]) {
    const where = viewport === PHONE ? 'phone' : 'desktop';
    const ctx = await open(browser, url, { viewport });
    const { page } = ctx;
    await ctx.goto('home');
    await page.evaluate(() => (location.hash = '#tuner'));
    await page.waitForSelector('main[data-route="tuner"] [data-ui-action-bar]', { timeout: 30000 });
    await page.waitForTimeout(500);
    const chip = viewport === PHONE ? 'header [data-chip="goal"]' : 'aside [data-chip="goal"]';
    await page.locator(chip).click();
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(400);
    await page.goBack();
    await page.waitForTimeout(600);
    const state = await page.evaluate(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, hash: location.hash }));
    check(group, `${where}: Back closes the open sheet and stays on the screen`, state.dialogs === 0 && state.hash === '#tuner', JSON.stringify(state));
    await page.goBack();
    await page.waitForTimeout(600);
    check(group, `${where}: the next Back leaves the screen as before`, (await page.evaluate(() => location.hash)) === '#home');

    if (viewport === PHONE) {
      // A link inside a sheet, then Back: the screen behind the sheet, and the one before it.
      await page.evaluate(() => (location.hash = '#tuner'));
      await page.waitForSelector('main[data-route="tuner"] [data-ui-action-bar]');
      await page.waitForTimeout(400);
      await page.locator(chip).click();
      await page.waitForSelector('[role="dialog"]');
      await page.waitForTimeout(400);
      await page.locator('[role="dialog"] a', { hasText: 'All your progress' }).click();
      await page.waitForSelector('main[data-route="profile"]');
      await page.waitForTimeout(600);
      await page.goBack();
      await page.waitForTimeout(700);
      const one = await page.evaluate(() => ({ hash: location.hash, dialogs: document.querySelectorAll('[role="dialog"]').length }));
      await page.goBack();
      await page.waitForTimeout(700);
      const two = await page.evaluate(() => location.hash);
      check(group, 'a link inside a sheet, then Back: the screen behind it, then the one before (no dead Back press)', one.hash === '#tuner' && one.dialogs === 0 && two === '#home', JSON.stringify({ one, two }));

      // A sheet opened from the address, closed with its button: Back does not bring it back.
      await page.evaluate(() => (location.hash = '#songs--add'));
      await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
      await page.waitForTimeout(600);
      await page.locator('[role="dialog"] button[aria-label="Close"]').click();
      await page.waitForTimeout(800);
      const closed = await page.evaluate(() => ({ hash: location.hash, dialogs: document.querySelectorAll('[role="dialog"]').length }));
      await page.goBack();
      await page.waitForTimeout(800);
      const after = await page.evaluate(() => ({ hash: location.hash, dialogs: document.querySelectorAll('[role="dialog"]').length }));
      check(group, '#songs--add: closing the sheet lands on #songs, and Back then leaves (the sheet does not come back)', closed.hash === '#songs' && closed.dialogs === 0 && after.hash === '#home' && after.dialogs === 0, JSON.stringify({ closed, after }));
    }
    check(group, `${where}: no console errors`, ctx.errors.length === 0, ctx.errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

// -----------------------------------------------------------------------------------------------
async function keyboard(browser, url) {
  const group = 'keyboard';
  // Desktop #practice has no ActionBar: Start is the plan's primary button (29 Tabs away before).
  for (const [route, ready, viewport, want] of [
    ['practice', '[data-practice-start]', DESKTOP, /^Start/],
    ['tuner', '[data-ui-action-bar]', PHONE, /./],
  ]) {
    const where = viewport === PHONE ? 'phone' : 'desktop';
    const ctx = await open(browser, url, { viewport });
    const { page } = ctx;
    await ctx.goto(route, ready, 1200);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement.textContent.trim());
    await page.keyboard.press('Tab');
    const second = await page.evaluate(() => {
      const el = document.activeElement;
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim(), visible: r.width > 0 && r.top >= 0 };
    });
    if (route === 'practice') await ctx.shot('jump-to-action-desktop');
    await page.keyboard.press('Enter');
    const landed = await page.evaluate(() => ({ text: document.activeElement.textContent.trim(), tag: document.activeElement.tagName, primary: document.activeElement.hasAttribute('data-ui-primary'), inBar: !!document.activeElement.closest('[data-ui-action-bar]') }));
    const named = second.text.startsWith('Jump to') && (landed.text.length > 32 || second.text.includes(landed.text));
    check(group, `${where} #${route}: Tab, Tab, Enter reaches the main action ("Jump to content", then "${second.text}")`, first === 'Jump to content' && second.visible && named && want.test(landed.text) && (landed.inBar || landed.primary), JSON.stringify({ first, second, landed }));
    check(group, `${where} #${route}: no console errors`, ctx.errors.length === 0, ctx.errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

(async () => {
  const seeds = await buildSeeds();
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const [name, fn] of [
      ['toasts', () => toasts(browser, server.url)],
      ['clearance', () => clearance(browser, server.url)],
      ['text', () => largeText(browser, server.url, seeds)],
      ['immersive', () => immersive(browser, server.url)],
      ['back', () => back(browser, server.url)],
      ['keyboard', () => keyboard(browser, server.url)],
    ]) {
      if (only && !only.includes(name)) continue;
      try {
        await fn();
      } catch (e) {
        check(name, 'ran to the end', false, String(e && e.message ? e.message : e).split('\n')[0]);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  const groups = [...new Set(results.map((r) => r.group))];
  for (const g of groups) {
    const rs = results.filter((r) => r.group === g);
    console.log(`${rs.every((r) => r.pass) ? 'ok  ' : 'FAIL'}  ${g}: ${rs.filter((r) => r.pass).length}/${rs.length}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(failed ? `FAILED (${failed} of ${results.length})` : `PASSED (${results.length} checks)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
