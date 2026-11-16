#!/usr/bin/env node
/**
 * Browser check of the Reference (`#reference`). Run: node e2e/reference.cjs [--verbose]
 *
 * Phone (390 x 844, touch):
 *   list        #reference lists the nine sections; search finds "maj7" and opens the chord row,
 *               Enter on "drop d" opens the tuning; the result is scrolled into view and flashed
 *   sections    every section opens without the error panel, console errors or sideways scroll
 *   circle      tapping G on the circle selects G major (chords G Am Bm C D Em F♯dim); Play I–IV–V–I
 *               steps through the four chords and the button turns into Stop
 *   keys        a deep link to F♯ minor opens the three-sharp row with its staff engraved
 *   intervals   tapping P5 selects it, shows its name and draws two shapes on the neck
 *   notation    a tab example engraves when scrolled to, and its play button starts and stops
 *   glossary    filtering "barre" leaves the barre entry, linked to its Theory Path lesson
 *   copy        "Copy as text" puts the section on the clipboard as plain text
 * Desktop (1280 x 800):
 *   layout      the section list sits beside the page with the current section marked; "/" focuses
 *               the search; every section opens cleanly in the light theme too
 *   harmony     the minor table has the harmonic V and vii° columns (A minor: E and G♯dim)
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
    await page.locator('[data-ref-item="p5"] button').click();
    await page.waitForTimeout(300);
    const hero = await page.locator('main').getByText('P5 perfect fifth').count();
    const pressed = await page.locator('[data-ref-item="p5"] button[aria-pressed="true"]').count();
    check('intervals: tapping P5 selects it', hero >= 1 && pressed === 1, `hero=${hero} pressed=${pressed}`);

    await open(page, url, 'reference--intervals--maj9');
    await page.waitForTimeout(1500);
    check('intervals: a deep link to M9 scrolls to the compound row', await inView(page, '[data-ref-item="maj9"]'));

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
        const more = page.getByRole('button', { name: /^Show \d+ more$/ }).first();
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
