#!/usr/bin/env node
/**
 * Browser check of the Reference (`#reference`). Run: node e2e/reference.cjs [--verbose]
 *
 * Phone (390 x 844, touch):
 *   list        #reference lists the nine sections; search finds "maj7" and opens the chord row,
 *               Enter on "drop d" opens the tuning; the result is scrolled into view and flashed;
 *               "7th", "parallel minor" and "dorian b2" find what a learner means
 *   sections    every section opens without the error panel, console errors or sideways scroll
 *   circle      tapping G on the circle selects G major (chords G Am Bm C D Em F♯dim); Play I–IV–V–I
 *               steps through the four chords and the button turns into Stop; Stop, or another
 *               key, also stops the chord highlights
 *   keys        a deep link to F♯ minor opens the three-sharp row with its staff engraved
 *   intervals   tapping P5 selects it; a row low in the table brings its neck shape into view; the
 *               arrows step through intervals; compound rows fit the phone and play
 *   chords      deep links far down the list (m7b5, 13) end with the row on screen
 *   notation    a tab example engraves when scrolled to, and its play button starts and stops
 *   glossary    filtering "barre" leaves the barre entry, linked to its Theory Path lesson
 *   copy        "Copy as text" puts the section on the clipboard as plain text
 * Desktop (1280 x 800):
 *   layout      the section list sits beside the page with the current section marked; "/" focuses
 *               the search; every section opens cleanly in the light theme too
 *   harmony     the minor table has the harmonic V and vii° columns (A minor: E and G♯dim); the
 *               harmonic and melodic minor tables, also from a link
 *   motion      with reduced motion, in-page jumps land at once
 *
 * Prints one line per check, then PASSED or FAILED; exits non-zero on failure. Timing-sensitive
 * waits are generous: the machine is shared.
 */
const { withApp } = require('./lib/harness.cjs');

const verbose = process.argv.includes('--verbose');
const SECTIONS = ['circle', 'keys', 'intervals', 'chords', 'scales', 'harmony', 'notation', 'tunings', 'glossary'];
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];
const results = [];

function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 300)})` : ''}`);
  return !!pass;
}

async function seed(context) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
    } catch {
      /* ignore */
    }
  });
}

/** Open a reference address and wait for the screen (retry once: other agents may be mid-edit). */
async function open(page, url, hash) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
      await page.waitForSelector('main[data-route="reference"] [data-layout]', { timeout: 30000 });
      await page.waitForTimeout(600);
      return true;
    } catch (e) {
      if (attempt === 1) throw e;
      await page.waitForTimeout(3000);
    }
  }
  return false;
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function inView(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const b = el.getBoundingClientRect();
    return b.bottom > 0 && b.top < window.innerHeight;
  }, selector);
}

/** The whole element is on screen (not merely a sliver of it). */
async function fullyInView(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const b = el.getBoundingClientRect();
    return b.top >= 0 && b.bottom <= window.innerHeight;
  }, selector);
}

const realErrors = (errors) => errors.splice(0).filter((e) => !BENIGN.some((p) => p.test(e)));

async function phone() {
  await withApp({ mobile: true, settle: 600 }, async ({ page, context, url, errors }) => {
    await seed(context);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });

    // ── the list and search ────────────────────────────────────────────────────────────
    await open(page, url, 'reference');
    const items = await page.locator('main a[href^="#reference--"]').count();
    check('phone list shows the nine sections', items === 9, `${items} links`);
    const search = page.getByRole('searchbox', { name: 'Search the Reference' }).first();
    await search.fill('maj7');
    await page.waitForSelector('[data-result="chords:maj7"]', { timeout: 10000 });
    check('search "maj7" finds the chord type first', (await page.locator('[data-result]').first().getAttribute('data-result')) === 'chords:maj7');
    await page.click('[data-result="chords:maj7"]');
    await page.waitForFunction(() => location.hash === '#reference--chords--maj7', null, { timeout: 10000 });
    const flashed = await page
      .waitForSelector('[data-ref-item="maj7"][data-flash]', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check('the row is highlighted', flashed);
    await page.waitForTimeout(900);
    check('the chord result opens its row in view', await inView(page, '[data-ref-item="maj7"]'));

    await open(page, url, 'reference');
    await page.getByRole('searchbox', { name: 'Search the Reference' }).first().fill('drop d');
    await page.waitForSelector('[data-result="tunings:drop-d"]', { timeout: 10000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#reference--tunings--drop-d', null, { timeout: 10000 });
    await page.waitForTimeout(1200);
    check('Enter opens the first result (Drop D)', await inView(page, '[data-ref-item="drop-d"]'));

    const nothing = await (async () => {
      await open(page, url, 'reference');
      await page.getByRole('searchbox', { name: 'Search the Reference' }).first().fill('zzqqxx');
      await page.waitForTimeout(400);
      return page.locator('main [role="status"]').first().textContent();
    })();
    check('a search with no match says so', /Nothing found/.test(nothing || ''), nothing);

    // Review: words learners type that used to find nothing.
    const box = page.getByRole('searchbox', { name: 'Search the Reference' }).first();
    await box.fill('7th');
    await page.waitForTimeout(500);
    check('search "7th" finds the seventh chords', (await page.locator('[data-result="chords:7"]').count()) === 1);
    await box.fill('parallel minor');
    await page.waitForTimeout(500);
    const firstTopic = page.locator('[data-result]').first();
    check('search "parallel minor" finds parallel keys', /Parallel keys/.test((await firstTopic.textContent()) || ''));
    await firstTopic.click();
    await page.waitForFunction(() => location.hash === '#reference--circle', null, { timeout: 10000 }).catch(() => {});
    const parallel = await page
      .locator('main')
      .getByRole('button', { name: /^Parallel / })
      .first()
      .waitFor({ timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    check('the topic opens the circle, where every key shows its parallel', parallel);
    await open(page, url, 'reference');
    await page.getByRole('searchbox', { name: 'Search the Reference' }).first().fill('dorian b2');
    await page.waitForTimeout(500);
    check('scale names show ♭ and ♯, not b and #', /Dorian ♭2/.test((await page.locator('[data-result]').first().textContent()) || ''));
    realErrors(errors);

    // ── every section ──────────────────────────────────────────────────────────────────
    for (const s of SECTIONS) {
      await open(page, url, `reference--${s}`);
      await page.waitForTimeout(800);
      const panel = await page.locator('main [role="alert"]').count();
      const over = await overflow(page);
      const errs = realErrors(errors);
      check(`phone: ${s} opens cleanly`, panel === 0 && over <= 1 && errs.length === 0, `alert=${panel} overflow=${over} ${errs.join(' | ')}`);
    }

    // ── circle ─────────────────────────────────────────────────────────────────────────
    await open(page, url, 'reference--circle');
    await page.locator('[role="radio"][data-ring="major"][aria-label^="G"]').first().click();
    await page.waitForSelector('[data-key="g-major"]', { timeout: 5000 });
    const cells = await page.locator('[aria-label^="Chords of G"] [role="listitem"]').allTextContents();
    check('circle: tapping G shows the chords of G major', cells.length === 7 && /G/.test(cells[0]) && /F♯dim/.test(cells[6]), cells.join(' | '));
    const play = page.getByRole('button', { name: /Play I–IV–V–I in G major/ });
    await play.click();
    let steps = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 12000 && steps.size < 4) {
      const v = await page.locator('[data-cadence-step]').first().getAttribute('data-cadence-step');
      if (v !== '-1') steps.add(v);
      await page.waitForTimeout(80);
    }
    check('circle: Play I–IV–V–I steps through four chords', steps.size === 4, [...steps].join(','));
    await page.waitForTimeout(2500);
    check('circle: the progression ends by itself', (await page.locator('[data-cadence-step="-1"]').count()) === 1);

    // Review: the chord highlights are scheduled on the audio clock; after Stop (or a new key)
    // the late ones used to light chords that were no longer sounding.
    await play.click();
    await page.waitForFunction(() => document.querySelector('[data-cadence-step]')?.getAttribute('data-cadence-step') === '0', null, { timeout: 10000 }).catch(() => {});
    await page.getByRole('button', { name: 'Stop' }).first().click();
    // Let the Stop itself render; what matters is that no later step lights a chord.
    await page.waitForFunction(() => document.querySelector('[data-cadence-step]')?.getAttribute('data-cadence-step') === '-1', null, { timeout: 5000 }).catch(() => {});
    const afterStop = new Set();
    for (let i = 0; i < 16; i++) {
      afterStop.add(await page.locator('[data-cadence-step]').first().getAttribute('data-cadence-step'));
      await page.waitForTimeout(200);
    }
    check('circle: Stop also stops the chord highlights', afterStop.size === 1 && afterStop.has('-1'), [...afterStop].join(','));
    await play.click();
    await page.waitForTimeout(400);
    await page.locator('[role="radio"][data-ring="major"][aria-label^="E major"]').first().click();
    await page.waitForFunction(() => document.querySelector('[data-cadence-step]')?.getAttribute('data-cadence-step') === '-1', null, { timeout: 5000 }).catch(() => {});
    const afterSwitch = new Set();
    for (let i = 0; i < 16; i++) {
      afterSwitch.add(await page.locator('[data-cadence-step]').first().getAttribute('data-cadence-step'));
      await page.waitForTimeout(200);
    }
    check('circle: picking another key mid-progression lights nothing in it', afterSwitch.size === 1 && afterSwitch.has('-1'), [...afterSwitch].join(','));
    realErrors(errors);

    // ── keys ───────────────────────────────────────────────────────────────────────────
    await open(page, url, 'reference--keys--f-sharp-minor');
    const expanded = page.locator('[data-ref-item="a-major"] [aria-expanded="true"]');
    check('keys: a deep link to F♯ minor opens the three-sharp row', (await expanded.count()) === 1);
    await page.waitForFunction(() => !!document.querySelector('[data-ref-item="a-major"] svg [class*="stave"], [data-ref-item="a-major"] svg path'), null, { timeout: 20000 }).catch(() => {});
    const engraved = await page.locator('[data-ref-item="a-major"] svg').count();
    check('keys: the staff is engraved', engraved >= 2, `${engraved} svgs`);

    // ── intervals ──────────────────────────────────────────────────────────────────────
    await open(page, url, 'reference--intervals');
    await page.locator('[role="listitem"][data-ref-item="p5"] button').click();
    await page.waitForTimeout(300);
    const hero = await page.locator('main').getByText('P5 perfect fifth').count();
    const pressed = await page.locator('[role="listitem"][data-ref-item="p5"] button[aria-pressed="true"]').count();
    check('intervals: tapping P5 selects it', hero >= 1 && pressed === 1, `hero=${hero} pressed=${pressed}`);

    // Review: a row low in the table was selected with its neck shape far off screen.
    await page.locator('[role="listitem"][data-ref-item="p8"] button').scrollIntoViewIfNeeded();
    await page.locator('[role="listitem"][data-ref-item="p8"] button').click();
    await page.waitForTimeout(1200);
    const heroText = await page.locator('[data-ref-item="p8"]').first().textContent();
    check('intervals: tapping a row brings its neck shape into view', (await fullyInView(page, '[data-ref-item="p8"]')) && /perfect octave/.test(heroText || ''), heroText && heroText.slice(0, 40));
    await page.getByRole('button', { name: 'Smaller interval' }).click();
    await page.waitForTimeout(300);
    check('intervals: the arrows step to the next interval', (await page.locator('main').getByText('M7 major seventh').count()) >= 1);
    await page.getByRole('button', { name: 'Stop' }).first().click().catch(() => {});

    // Review: on a phone the compound table hid its play buttons beyond the right edge.
    const m9 = page.locator('[role="listitem"][data-ref-item="m9"] button');
    await m9.scrollIntoViewIfNeeded();
    const mark = await m9.locator('[class*="ivPlay"]').boundingBox();
    const vw = page.viewportSize().width;
    await m9.click();
    await page.waitForTimeout(300);
    check('intervals: compound rows fit the phone and play when tapped', !!mark && mark.x + mark.width <= vw && (await m9.getAttribute('aria-pressed')) === 'true' && (await overflow(page)) <= 1, mark && `${Math.round(mark.x + mark.width)} of ${vw}`);
    await m9.click();

    await open(page, url, 'reference--intervals--maj9');
    await page.waitForTimeout(1500);
    check('intervals: a deep link to M9 scrolls to the compound row', await inView(page, '[data-ref-item="maj9"]'));

    // Review: deep links far down the chord list used to stop short, the row above the screen,
    // because chord shapes drawn on the way changed the page's height.
    for (const item of ['m7b5', '13']) {
      await open(page, url, `reference--chords--${item}`);
      await page.waitForTimeout(2000);
      check(`chords: a deep link to ${item} ends with the row on screen`, await fullyInView(page, `[data-ref-item="${item}"]`));
    }

    // ── notation ───────────────────────────────────────────────────────────────────────
    await open(page, url, 'reference--notation--hammer-on');
    await page.waitForSelector('[data-ref-item="hammer-on"] [data-tab-view]', { timeout: 20000 });
    check('notation: the hammer-on tab engraves', (await page.locator('[data-ref-item="hammer-on"] [data-tab-view]').count()) === 1);
    const tabPlay = page.locator('[data-ref-item="hammer-on"]').getByRole('button', { name: /Play: Hammer-on/ });
    await tabPlay.click();
    await page.waitForTimeout(500);
    const stop = page.locator('[data-ref-item="hammer-on"]').getByRole('button', { name: 'Stop' });
    check('notation: its play button starts the example', (await stop.count()) === 1);
    if (await stop.count()) await stop.click();
    await page.waitForTimeout(300);
    check('notation: and stops it', (await page.locator('[data-ref-item="hammer-on"]').getByRole('button', { name: /Play: Hammer-on/ }).count()) === 1);
    realErrors(errors);

    // ── glossary ───────────────────────────────────────────────────────────────────────
    await open(page, url, 'reference--glossary');
    await page.getByRole('searchbox', { name: 'Filter the glossary' }).fill('barre');
    await page.waitForTimeout(300);
    const terms = await page.locator('[data-ref-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ref-item')));
    const lesson = await page.locator('[data-ref-item="barre"] a[href^="#learn"]').getAttribute('href');
    check('glossary: filtering "barre" keeps the term, linked to its lesson', terms[0] === 'barre' && lesson === '#learn--caged--the-barre', `${terms.join(',')} ${lesson}`);

    // ── copy ───────────────────────────────────────────────────────────────────────────
    await open(page, url, 'reference--intervals');
    await page.getByRole('button', { name: 'Copy or download this section' }).click();
    await page.getByRole('menuitem', { name: 'Copy as text' }).click();
    await page.waitForTimeout(600);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch((e) => `ERR ${e}`));
    check('copy: the section goes to the clipboard as text', /^INTERVALS/.test(clip) && clip.includes('major third'), clip.slice(0, 80));
    const errs = realErrors(errors);
    check('phone: no console errors along the way', errs.length === 0, errs.join(' | '));
  });
}

async function desktop() {
  for (const theme of ['dark', 'light']) {
    await withApp({ theme, settle: 600 }, async ({ page, context, url, errors }) => {
      await seed(context);
      await open(page, url, 'reference');
      if (theme === 'dark') {
        const layout = await page.locator('[data-layout]').first().getAttribute('data-layout');
        const current = await page.locator('main nav a[aria-current="page"]').textContent();
        check('desktop: the section list sits beside the circle of fifths', layout === 'wide' && /Circle of fifths/.test(current || ''), `${layout} ${current}`);
        await page.locator('body').click({ position: { x: 900, y: 40 } });
        await page.keyboard.press('/');
        const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('type'));
        check('desktop: "/" focuses the search', focused === 'search', focused);
        await page.keyboard.type('tritone');
        await page.waitForTimeout(400);
        const hits = await page.locator('[data-result]').evaluateAll((els) => els.map((e) => e.getAttribute('data-result')));
        check('desktop: search lists results beside the page', hits.includes('glossary:tritone') && hits.includes('intervals:aug4'), hits.slice(0, 5).join(','));
        await page.keyboard.press('Escape');
        await page.keyboard.type('minor');
        await page.waitForTimeout(500);
        const before = await page.locator('[data-result^="circle:"]').count();
        const more = page.locator('section[aria-label="Circle of fifths"]').getByRole('button', { name: /^Show \d+ more$/ });
        const hasMore = (await more.count()) === 1;
        if (hasMore) await more.click();
        await page.waitForTimeout(200);
        const after = await page.locator('[data-result^="circle:"]').count();
        check('desktop: long result groups open with "Show more"', hasMore && before === 5 && after > before, `${before} -> ${after}`);
        await page.keyboard.press('Escape');

        await open(page, url, 'reference--harmony');
        await page.getByRole('radio', { name: 'Minor keys' }).click();
        await page.waitForTimeout(300);
        const row = await page.locator('[data-ref-item="a-minor"] td').allTextContents();
        check('desktop: minor keys add the harmonic V and vii°', row.length === 9 && row[7] === 'E' && row[8] === 'G♯dim', row.join(' '));
        // Review: the chords of harmonic and melodic minor were missing.
        await page.getByRole('radio', { name: 'Harmonic' }).click();
        await page.waitForTimeout(300);
        const harm = await page.locator('[data-ref-item="a-minor"] td').allTextContents();
        check('desktop: harmonic minor: Am Bdim C+ Dm E F G♯dim', harm.length === 7 && harm[0] === 'Am' && /^C(\+|aug)$/.test(harm[2]) && harm[4] === 'E' && harm[6] === 'G♯dim', harm.join(' '));
        await open(page, url, 'reference--harmony--melodic-minor');
        const mel = await page.locator('[data-ref-item="a-minor"] td').allTextContents();
        const melOn = await page.getByRole('radio', { name: 'Melodic' }).getAttribute('aria-checked');
        check('desktop: a link to melodic minor opens its chords: Am Bm C+ D E F♯dim G♯dim', melOn === 'true' && mel.length === 7 && mel[1] === 'Bm' && mel[3] === 'D' && mel[5] === 'F♯dim', `${melOn} ${mel.join(' ')}`);

        await open(page, url, 'reference--chords--m7b5');
        await page.waitForTimeout(2000);
        check('desktop: a deep link to m7b5 ends with the row on screen', await fullyInView(page, '[data-ref-item="m7b5"]'));

        // Reduced motion: in-page jumps land at once instead of gliding.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await open(page, url, 'reference--notation');
        await page.getByRole('button', { name: 'Tab symbols' }).click();
        await page.waitForTimeout(120);
        const top = await page.evaluate(() => Math.round(document.getElementById('notation-tab').getBoundingClientRect().top));
        check('desktop: with reduced motion, "Tab symbols" jumps straight there', Math.abs(top) < 80, `top=${top}`);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
      for (const s of SECTIONS) {
        await open(page, url, `reference--${s}`);
        await page.waitForTimeout(600);
        const panel = await page.locator('main [role="alert"]').count();
        const over = await overflow(page);
        const errs = realErrors(errors);
        check(`desktop ${theme}: ${s} opens cleanly`, panel === 0 && over <= 1 && errs.length === 0, `alert=${panel} overflow=${over} ${errs.join(' | ')}`);
      }
    });
  }
}

(async () => {
  console.log('Reference: browser check');
  await phone();
  await desktop();
  const failed = results.filter((r) => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  console.log(failed.length ? 'FAILED' : 'PASSED');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  console.log('FAILED');
  process.exit(1);
});
