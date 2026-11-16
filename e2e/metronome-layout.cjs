#!/usr/bin/env node
/**
 * Browser check of the Metronome screen's layout and the review fixes (#metronome).
 * Run: node e2e/metronome-layout.cjs
 *
 * The cases that caught real bugs in review, kept so they stay fixed:
 *  - phones with the browser's bars showing (390 x 664, 360 x 640): Start sat half under the tab bar;
 *  - 7/4 on a 360 px phone: the seventh beat pad was cut off; "Subdivision" was cut to "Subdivisi…";
 *  - text at 200 %: the page scrolled sideways and the tiles read "Su…", "So…";
 *  - a phone on its side (667 x 375, 740 x 360): Start ran off the bottom;
 *  - toasts ("Waltz 3/4 is set. Press Start", "Speed trainer off") covered Start / Stop;
 *  - typing a tempo then Enter or Esc dropped keyboard focus on the floor;
 *  - a finished session timer gave no progress until the learner left the screen, and a phone
 *    sent to the background never reported its practice.
 * Also: the desktop settings pane leads with everyday settings, odd meters last.
 * Prints PASSED or FAILED and exits non-zero on failure.
 */
const { withApp } = require('./lib/harness.cjs');

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== '' ? `  (${detail})` : ''}`);
};

const open = async (page, goto) => {
  await goto('metronome');
  await page.waitForSelector('[data-start]', { timeout: 30000 });
  await page.waitForTimeout(300);
};

/** Where Start ends against the bottom of the screen or the top of the tab bar, and the page's sideways overflow. */
const zone = (page) =>
  page.evaluate(() => {
    const start = document.querySelector('[data-start]').getBoundingClientRect();
    const nav = [...document.querySelectorAll('nav')].map((n) => n.getBoundingClientRect()).find((r) => r.height > 0 && r.top > innerHeight / 2);
    const labels = [...document.querySelectorAll('[data-sheet] span span')].filter((s) => s.offsetParent && s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent);
    return { startBottom: Math.round(start.bottom), limit: Math.round(nav ? nav.top : innerHeight), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, cut: labels };
  });

/** True when the first rect sits wholly above the second. */
const above = (a, b) => a && b && a.bottom <= b.top + 1;

(async () => {
  // --- short and narrow phones ------------------------------------------------------------------------------------------
  for (const vp of [{ width: 390, height: 664 }, { width: 360, height: 640 }]) {
    await withApp({ viewport: vp, mobile: true, theme: 'dark' }, async ({ page, goto, errors }) => {
      await open(page, goto);
      const z = await zone(page);
      check(`${vp.width} x ${vp.height}: Start is fully visible above the tab bar`, z.startBottom <= z.limit, `Start ends at ${z.startBottom}, tab bar at ${z.limit}`);
      check(`${vp.width} x ${vp.height}: no sideways scroll, no tile label cut short`, z.overflow <= 1 && z.cut.length === 0, `${z.overflow}px; ${z.cut.join(', ')}`);
      check(`${vp.width} x ${vp.height}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    });
  }

  await withApp({ viewport: { width: 360, height: 740 }, mobile: true, theme: 'light' }, async ({ page, goto }) => {
    await open(page, goto);
    await page.locator('[data-meter-chip="more"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-meter-choice="7/4"]').click();
    await page.waitForTimeout(400);
    if (await page.locator('[role="dialog"]').count()) await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const pads = await page.evaluate(() => {
      const strip = document.querySelector('[data-beat-pad]').parentElement.getBoundingClientRect();
      return [...document.querySelectorAll('[data-beat-pad]')].map((p) => {
        const r = p.getBoundingClientRect();
        return { inside: r.left >= strip.left - 0.5 && r.right <= strip.right + 0.5 && r.right <= innerWidth, w: r.width };
      });
    });
    check('7/4 on a 360 px phone: all seven beat pads are on screen', pads.length === 7 && pads.every((p) => p.inside), pads.map((p) => p.w.toFixed(0)).join(' '));
    check('7/4 on a 360 px phone: each pad is still about a finger wide', pads.every((p) => p.w >= 40), `narrowest ${Math.min(...pads.map((p) => p.w)).toFixed(1)} px`);
    const z = await zone(page);
    check('360 px: every tile label reads in full', z.cut.length === 0, z.cut.join(', '));
  });

  // --- text at 200 % ------------------------------------------------------------------------------------------------------
  await withApp({ mobile: true, theme: 'light' }, async ({ page, goto, errors }) => {
    await open(page, goto);
    for (const size of ['150%', '200%']) {
      await page.evaluate((s) => { document.documentElement.style.fontSize = s; }, size);
      await page.waitForTimeout(500);
      const z = await zone(page);
      check(`text at ${size}: no sideways scroll, no tile label cut short`, z.overflow <= 1 && z.cut.length === 0, `${z.overflow}px; ${z.cut.join(', ')}`);
    }
    check('large text: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  });

  // --- a phone on its side --------------------------------------------------------------------------------------------------
  for (const vp of [{ width: 667, height: 375 }, { width: 740, height: 360 }, { width: 844, height: 390 }]) {
    await withApp({ viewport: vp, mobile: true, theme: 'dark' }, async ({ page, goto }) => {
      await open(page, goto);
      const layout = await page.getAttribute('[data-metronome]', 'data-layout');
      const z = await zone(page);
      check(`sideways ${vp.width} x ${vp.height}: dial beside the controls, Start fully on screen`, layout === 'sideways' && z.startBottom <= z.limit && z.overflow <= 1, `${layout}, Start ends at ${z.startBottom} of ${z.limit}`);
    });
  }

  // --- phone: toasts, typed tempo, practice reports --------------------------------------------------------------------------
  await withApp({ mobile: true, theme: 'light' }, async ({ page, goto, errors }) => {
    await open(page, goto);
    const toastVsControls = () =>
      page.evaluate(() => {
        // The lowest toast on screen is the one that could cover the controls.
        const toasts = [...document.querySelectorAll('ol[aria-label="Notifications"] li')].map((li) => li.getBoundingClientRect()).filter((r) => r.height > 0);
        const t = toasts.sort((a, b) => b.bottom - a.bottom)[0];
        const c = document.querySelector('[data-tempo-step]').getBoundingClientRect();
        const s = document.querySelector('[data-start]').getBoundingClientRect();
        const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
        return { toast: t ? t.toJSON() : null, controls: c.toJSON(), startReachable: !!hit && !!hit.closest('[data-start]') };
      });
    await page.locator('[data-sheet="presets"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-preset="builtin-waltz"]').click();
    await page.waitForTimeout(700);
    let tv = await toastVsControls();
    check('a preset toast ("... is set. Press Start") sits above the tempo buttons and Start', tv.toast && above(tv.toast, tv.controls) && tv.startReachable, tv.toast ? `toast ends ${tv.toast.bottom.toFixed(0)}, controls start ${tv.controls.top.toFixed(0)}` : 'no toast seen');

    await page.locator('[data-sheet="presets"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-preset="builtin-speed-builder"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-start]').click();
    await page.waitForTimeout(1500);
    await page.locator('[data-tempo-step="1"]').click();
    await page.waitForTimeout(600);
    tv = await toastVsControls();
    check('"Speed trainer off" while running sits above the controls, Stop stays tappable', tv.toast && above(tv.toast, tv.controls) && tv.startReachable, tv.toast ? `toast ends ${tv.toast.bottom.toFixed(0)}, controls start ${tv.controls.top.toFixed(0)}` : 'no toast seen');
    await page.locator('[data-start]').click();

    await page.evaluate(() => { location.hash = '#tools'; });
    await page.waitForTimeout(1200);
    check('leaving the screen hands back the toast offset', (await page.evaluate(() => document.documentElement.style.getPropertyValue('--action-bar-h'))) === '');
    await page.evaluate(() => { location.hash = '#metronome'; });
    await page.waitForSelector('[data-start]', { timeout: 30000 });
    await page.waitForTimeout(400);

    // Typing a tempo with the keyboard.
    const bpm = () => page.getAttribute('[data-metronome]', 'data-bpm');
    const before = await bpm();
    await page.locator('[data-metronome-tempo]').click();
    await page.keyboard.type('150');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const focusAfterEsc = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('role'));
    check('typing a tempo then Esc keeps the old tempo and leaves focus on the dial', (await bpm()) === before && focusAfterEsc === 'slider', `${before} -> ${await bpm()}, focus on ${focusAfterEsc}`);
    await page.locator('[data-metronome-tempo]').click();
    await page.keyboard.type('150');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const focusAfterEnter = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('role'));
    check('typing a tempo then Enter sets it and leaves focus on the dial', (await bpm()) === '150' && focusAfterEnter === 'slider', `${await bpm()}, focus on ${focusAfterEnter}`);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    const afterKeys = await page.evaluate(() => ({ ...document.querySelector('[data-metronome]').dataset }));
    check('from there, Up and Space go on working (151 BPM, running)', afterKeys.bpm === '151' && afterKeys.running === 'true', `${afterKeys.bpm}, running ${afterKeys.running}`);
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    // Practice reports. The session's wall clock is moved forward instead of waiting minutes.
    // Newest entry first.
    const log = () => page.evaluate(async () => (await import('/src/core/progress/index.ts')).getProgress().log.filter((e) => e.kind === 'metronome').map((e) => e.durationSec));
    const skip = (sec) =>
      page.evaluate(async (sec) => {
        const s = (await import('/src/features/metronome/model/session.ts')).currentSession();
        const base = s.now;
        s.now = () => base() + sec * 1000;
      }, sec);
    const logBefore = (await log()).length;
    await page.locator('[data-sheet="practice"]').click();
    await page.waitForTimeout(500);
    await page.getByRole('radio', { name: '2 min' }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.locator('[data-start]').click();
    await page.waitForTimeout(400);
    await skip(121);
    await page.waitForTimeout(1200);
    const done = await page.evaluate(() => ({ running: document.querySelector('[data-metronome]').dataset.running, banner: document.body.innerText.includes('2 minutes done') }));
    const afterTimer = await log();
    check('a 2-minute session timer stops the click and says so', done.running === 'false' && done.banner, JSON.stringify(done));
    check('a finished session timer reports its practice at once', afterTimer.length === logBefore + 1 && afterTimer[0] >= 120, `log ${afterTimer.join(', ')}`);

    await page.locator('[data-start]').click();
    await page.waitForTimeout(400);
    await skip(75);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
    });
    await page.waitForTimeout(300);
    const afterHidden = await log();
    check('going to the background reports the practice since the last report', afterHidden.length === logBefore + 2 && afterHidden[0] >= 75 && afterHidden[0] < 120, `log ${afterHidden.join(', ')}`);
    await page.locator('[data-start]').click();
    await page.evaluate(() => { location.hash = '#tools'; });
    await page.waitForTimeout(1000);
    const afterLeave = await log();
    check('leaving right after reports nothing twice', afterLeave.length === afterHidden.length, `log ${afterLeave.join(', ')}`);
    check('phone: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  });

  // --- desktop: everyday settings first --------------------------------------------------------------------------------------
  await withApp({ size: 'desktop', theme: 'light' }, async ({ page, goto, errors }) => {
    await open(page, goto);
    const order = await page.evaluate(() => [...document.querySelectorAll('[data-metronome] h2')].map((h) => h.textContent.trim()));
    check('desktop: the settings pane starts with Subdivision and ends with the odd time signatures', order[0] === 'Subdivision' && order[order.length - 1] === 'More time signatures', order.join(' > '));
    await page.locator('[data-meter-chip="more"]').click();
    await page.waitForTimeout(1200);
    const seen = await page.evaluate(() => {
      const r = document.querySelector('[data-meter-choice="7/8"]').getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    });
    check('desktop: More brings the odd time signatures into view', seen);
    const z = await zone(page);
    check('desktop: Start visible, no sideways scroll, no console errors', z.startBottom <= z.limit && z.overflow <= 1 && errors.length === 0, `${z.startBottom}/${z.limit}, ${z.overflow}px, ${errors.slice(0, 2).join(' | ')}`);
  });
})()
  .catch((e) => check('the check ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : String(e)))
  .finally(() => {
    const failed = checks.filter((c) => !c.ok);
    console.log(`\n${failed.length ? 'FAILED' : 'PASSED'}: ${checks.length - failed.length}/${checks.length} checks`);
    process.exit(failed.length ? 1 : 0);
  });
