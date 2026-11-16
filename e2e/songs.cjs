#!/usr/bin/env node
/**
 * Browser check of the Songs screen (#songs) and the song library. Run: node e2e/songs.cjs [--verbose]
 *
 * Desktop (1280 x 800, dark):
 *   browse      the built-in songs are listed with thumbnails, level, length and what they hold; the
 *               preview pane shows the top suggestion and follows the pointer; a search and a level
 *               filter narrow the list; "/" focuses the search
 *   import      a MusicXML file and a Guitar Pro file (made here with alphaTab, as the song core's
 *               tests do) through "Add a song"; an ASCII tab pasted into the paste box; a ChordPro
 *               sheet pasted straight onto the page; a SixTab file dropped onto the page. Each shows
 *               the result sheet with the importer's notes (the text tab says its rhythm was estimated)
 *   persist     after a reload the five imported songs are still in "My songs" (IndexedDB)
 *   export      SixTab and MusicXML files download and hold the song
 *   manage      edit details (rename), delete with undo, one click on a row opens #play--<id>
 *   details     a modal song shows its mode ("E Dorian"); a recovered traditional song shows its origin
 *               line ("... as it is commonly sung ..."), and so does the learner's copy of it; the
 *               learner's own song in A Dorian shows "A Dorian", not "A minor"; on desktop and phone
 * Phone (390 x 844, touch, dark and light) and a phone on its side: filters in a bottom sheet, the
 * details sheet, no sideways scroll, no console errors. Screenshots go to e2e/out/songs-*.png.
 *
 * Prints PASSED or FAILED and exits non-zero on failure. `--only details` runs that group alone.
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { withApp, ROOT } = require('./lib/harness.cjs');

const verbose = process.argv.includes('--verbose');
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });
const SEED = { 'ssa:shell.onboarding': '{"skipped":true}' };
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass, detail: detail ? String(detail) : '' });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail && !pass ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}

const ASCII_TAB = `Morning riff
Tuning: standard

e|-----------------|-----------------|
B|-----------------|-----------------|
G|-----------------|-----------------|
D|---------2---4---|---------2---4---|
A|-----2-----------|-----2-----------|
E|-0-------------0-|-0-------------0-|
`;

const CHORDPRO = `{title: Down the Lane}
{key: G}
[G]Walking down the [C]lane today,
[D]sun is on the [G]way.
`;

const SIXTAB = `title: Dropped Tune
composer: Me
difficulty: 1
tempo: 90
time: 4/4
key: C

| "C" q 2:1 2:3 1:0 1:1 | "G" h 1:3 1:0 ||
`;

/** A Guitar Pro 7 file written by alphaTab (the same way the song core's tests build theirs). */
async function guitarProBytes() {
  const at = await import(pathToFileURL(path.join(ROOT, 'node_modules/@coderline/alphatab/dist/alphaTab.core.mjs')).href);
  const tex = String.raw`\title "Riverside Waltz" \artist "Sixstring Academy" \tempo 90
.
\track "Lead Guitar"
\ts (3 4) \chord ("Am" x 0 2 2 1 0) 0.5.4 {ch "Am"} 2.4.4 2.3.4 | 1.2.4 0.1.4 1.2.4 | 2.3.2. |`;
  const score = at.importer.ScoreLoader.loadAlphaTex(tex);
  return Buffer.from(new at.exporter.Gp7Exporter().export(score, new at.Settings()));
}

async function seed(context) {
  await context.addInitScript((entries) => {
    try {
      for (const [k, v] of Object.entries(entries)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  }, SEED);
}

async function ready(page) {
  await page.waitForSelector('[data-songs-ready="true"]', { timeout: 20000 });
  await page.waitForTimeout(300);
}

const rowIds = (page) => page.$$eval('[data-song-row]', (rows) => rows.map((r) => r.getAttribute('data-song-row')));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const dialog = (page) => page.locator('[role="dialog"]').last();
/** The Add-a-song sheet and the import result sheet (the shell may stack a level-up dialog on top). */
const addSheet = (page) => page.locator('[role="dialog"]', { has: page.locator('[data-add-sheet]') });
const resultSheet = (page) => page.locator('[role="dialog"]', { has: page.locator('[data-import-result]') });
const PANE = 'aside[aria-label="Song details"]';

async function closeDialogs(page) {
  for (let i = 0; i < 4 && (await page.locator('[role="dialog"]').count()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  // Sheets animate out: wait until they have left the page.
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 5000 }).catch(() => {});
}

/** Wait for the import result sheet; returns its text. */
async function importResult(page, timeout = 25000) {
  await page.waitForSelector('[role="dialog"] [data-import-result]', { timeout });
  await page.waitForTimeout(250);
  return (await resultSheet(page).innerText()).replace(/\s+/g, ' ');
}

async function openRowMenu(page, id, item) {
  await page.locator(`[data-song-row="${id}"] button[aria-label^="More for"]`).click();
  await page.getByRole('menuitem', { name: item }).click();
  await page.waitForTimeout(300);
}

async function desktop() {
  const gp = await guitarProBytes();
  await withApp({ size: 'desktop', theme: 'dark' }, async ({ page, context, goto, errors }) => {
    await seed(context);
    await goto('songs');
    await ready(page);

    // ---- browse --------------------------------------------------------------------------------
    const ids = await rowIds(page);
    check('browse', 'the five built-in songs are listed', ['hot-cross-buns', 'frere-jacques', 'st-blues-shuffle-a', 'st-pimami-3-4', 'greensleeves-fingerstyle'].every((id) => ids.includes(id)), ids.join(','));
    await page.waitForSelector('[data-song-row] [data-mini-tab]', { timeout: 10000 });
    const first = page.locator('[data-song-row]').first();
    const firstText = await first.innerText();
    check('browse', 'a row shows level, length and what the song holds', /Level \d/.test(firstText) && /\d:\d\d/.test(firstText) && /Tab|Chords|Lyrics/.test(firstText), firstText.replace(/\s+/g, ' '));
    check('browse', 'a row has a thumbnail of its first bars', (await first.locator('[data-mini-tab] span').count()) > 0 || (await first.locator('[data-mini-tab] i').count()) > 6);
    check('browse', '"Good next songs for you" is the first section', (await page.locator('h2', { hasText: 'Good next songs for you' }).count()) === 1);
    const paneId = await page.getAttribute(`${PANE} [data-song-details]`, 'data-song-details');
    check('browse', 'the preview pane shows the top suggestion', paneId === ids[0], `${paneId} vs ${ids[0]}`);
    check('browse', 'the pane has Play as its main button, leading to the Player', (await page.locator(`${PANE} a`, { hasText: 'Play' }).first().getAttribute('href'))?.endsWith(`#play--${paneId}`));
    await page.locator('[data-song-row="greensleeves-fingerstyle"] > a').hover();
    await page.waitForTimeout(500);
    check('browse', 'hovering a row previews it in the pane', (await page.getAttribute(`${PANE} [data-song-details]`, 'data-song-details')) === 'greensleeves-fingerstyle');
    await page.waitForSelector(`${PANE} [data-song-details] svg`, { timeout: 10000 }).catch(() => {});
    check('browse', 'the pane shows chord diagrams and what the song teaches', (await page.locator(PANE, { hasText: 'The chords' }).count()) === 1 && (await page.locator(PANE, { hasText: 'What you will learn' }).count()) === 1);
    await page.screenshot({ path: path.join(OUT, 'songs-desktop-pane.png') });

    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('/');
    check('browse', '"/" puts the cursor in the search box', await page.evaluate(() => document.activeElement?.getAttribute('type') === 'search'));
    await page.keyboard.type('blues');
    await page.waitForTimeout(300);
    // Authors keep adding songs, so these checks hold for any collection: what they find, not how many.
    const blues = await rowIds(page);
    const allCount = await page.evaluate(() => Number((document.querySelector('[role="radio"]')?.textContent || '').replace(/\D+/g, '')) || 0);
    check('browse', 'searching "blues" finds the 12-bar blues and leaves most songs out', blues.includes('st-blues-shuffle-a') && blues.length < allCount / 2, `${blues.join(',')} of ${allCount}`);
    // Review: from the search box, Down goes into the results and Enter plays the first match.
    await page.keyboard.press('ArrowDown');
    check('browse', 'Down in the search box moves to the first result', await page.evaluate(() => !!document.activeElement?.closest('[data-song-row]')));
    await page.keyboard.press('/');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash.startsWith('#play--'), null, { timeout: 8000 }).catch(() => {});
    check('browse', 'Enter in the search box plays the first match', (await page.evaluate(() => location.hash)) === `#play--${blues[0]}`, await page.evaluate(() => location.hash));
    await goto('songs');
    await ready(page);
    await page.keyboard.press('/');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const total = await page.evaluate(() => Number((document.querySelector('[role="radio"]')?.textContent || '').replace(/\D+/g, '')) || 0);
    await page.getByRole('button', { name: 'Level' }).click();
    await page.getByRole('button', { name: /Intermediate/ }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const inter = await rowIds(page);
    const interLevels = await page.$$eval('[data-song-row]', (rows) => rows.map((r) => Number((/Level (\d+)/.exec(r.textContent || '') || [])[1])));
    check('browse', 'the Intermediate filter keeps levels 4 to 7', inter.includes('st-pimami-3-4') && inter.includes('greensleeves-fingerstyle') && interLevels.every((lv) => lv >= 4 && lv <= 7), `${inter.join(',')} / ${interLevels.join(',')}`);
    check('browse', 'the active filter shows as a removable tag', (await page.getByRole('button', { name: 'Remove the filter Intermediate' }).count()) === 1);
    await page.getByRole('button', { name: 'Clear all' }).click();
    await page.waitForTimeout(300);
    const cleared = await rowIds(page);
    check('browse', '"Clear all" brings every song back', total > 0 && cleared.length === total, `${cleared.length} rows, ${total} songs`);

    await page.getByLabel('Sort').selectOption('length');
    await page.waitForFunction(() => [...document.querySelectorAll('[data-song-row]')].every((r) => /\d+:\d\d/.test(r.textContent || '')), null, { timeout: 20000 }).catch(() => {});
    const lengths = await page.$$eval('[data-song-row]', (rows) => rows.map((r) => { const m = /(\d+):(\d\d)/.exec(r.textContent || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }));
    check('browse', '"Shortest first" sorts every song by its length', lengths.length === total && lengths.every((x, i) => Number.isFinite(x) && (i === 0 || lengths[i - 1] <= x)), lengths.join(','));
    await page.getByLabel('Sort').selectOption('fit');
    await page.waitForTimeout(300);

    await page.locator('[data-song-row] > a').first().focus();
    const before = await page.evaluate(() => document.activeElement?.closest('[data-song-row]')?.getAttribute('data-song-row'));
    await page.keyboard.press('ArrowDown');
    const after = await page.evaluate(() => document.activeElement?.closest('[data-song-row]')?.getAttribute('data-song-row'));
    check('browse', 'the Down arrow moves to the next song', !!before && !!after && before !== after, `${before} -> ${after}`);
    check('browse', 'keyboard focus previews the song', (await page.getAttribute(`${PANE} [data-song-details]`, 'data-song-details')) === after);

    await page.locator(PANE).getByRole('button', { name: 'Add to favourites' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('radio', { name: /Favourites/ }).click();
    await page.waitForTimeout(300);
    check('browse', 'the heart adds a favourite, and "Favourites" shows it', (await rowIds(page)).join(',') === after, (await rowIds(page)).join(','));
    await page.getByRole('radio', { name: /All songs/ }).click();
    await page.waitForTimeout(300);

    // ---- import: MusicXML and Guitar Pro through "Add a song" ----------------------------------------
    await page.locator('[data-add-song]').click();
    await page.waitForSelector('[data-add-sheet]');
    await addSheet(page).locator('input[type="file"]').first().setInputFiles(path.join(ROOT, 'src/core/song/fixtures/greensleeves.musicxml'));
    let text = await importResult(page);
    check('import', 'a MusicXML file is added (result sheet names it)', /Added to your songs/.test(text) && /MusicXML/.test(text), text.slice(0, 300));
    await page.screenshot({ path: path.join(OUT, 'songs-desktop-imported.png') });
    await closeDialogs(page);

    let gpText = '';
    for (let attempt = 0; attempt < 2 && !/Riverside Waltz/.test(gpText); attempt++) {
      // The dev server may reload the page once while it prepares alphaTab: try again then.
      if (attempt) {
        await page.waitForTimeout(3000);
        await ready(page);
        await closeDialogs(page);
      }
      await closeDialogs(page);
      await page.locator('[data-add-song]').click();
      await page.waitForSelector('[data-add-sheet] input[type="file"]', { state: 'attached' });
      await addSheet(page).locator('input[type="file"]').first().setInputFiles({ name: 'riverside-waltz.gp', mimeType: 'application/octet-stream', buffer: gp });
      gpText = await importResult(page, 40000).catch((e) => String(e.message));
      if (verbose) console.log(`    Guitar Pro attempt ${attempt + 1}: ${gpText.slice(0, 160)}`);
    }
    check('import', 'a Guitar Pro file is added', /Added to your songs/.test(gpText) && /Riverside Waltz/.test(gpText) && /Guitar Pro/.test(gpText), gpText.slice(0, 300));
    await closeDialogs(page);

    // ---- import: pasted ASCII tab ----------------------------------------------------------------
    await closeDialogs(page);
    await page.locator('[data-add-song]').click();
    await addSheet(page).getByRole('button', { name: /Paste tab or chords/ }).click();
    await addSheet(page).locator('textarea').fill(ASCII_TAB);
    await page.waitForTimeout(250);
    check('import', 'the paste box recognises text tab as you type', /Looks like text tab/.test(await addSheet(page).innerText()));
    await addSheet(page).getByRole('button', { name: 'Add song' }).click();
    text = await importResult(page);
    check('import', 'pasted text tab is added and says its rhythm was estimated', /Added to your songs/.test(text) && /Morning riff/i.test(text) && /Check the rhythm/i.test(text), text.slice(0, 300));
    await closeDialogs(page);

    // ---- import: ChordPro pasted onto the page -----------------------------------------------------
    await closeDialogs(page);
    await page.evaluate((t) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', t);
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, CHORDPRO);
    await page.waitForSelector('[data-add-sheet] textarea');
    check('import', 'pasting chords onto the page opens the paste box with them', /Down the Lane/.test(await addSheet(page).locator('textarea').inputValue()));
    await addSheet(page).getByRole('button', { name: 'Add song' }).click();
    text = await importResult(page);
    check('import', 'a ChordPro paste is added', /Added to your songs/.test(text) && /Down the Lane/.test(text) && /ChordPro/.test(text), text.slice(0, 300));
    await closeDialogs(page);

    // ---- import: a file dropped onto the page ------------------------------------------------------
    await closeDialogs(page);
    await page.evaluate((t) => {
      const root = document.querySelector('[data-songs-ready]');
      const dt = new DataTransfer();
      dt.items.add(new File([t], 'dropped.sixtab', { type: 'text/plain' }));
      for (const type of ['dragenter', 'dragover', 'drop']) root.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, SIXTAB);
    text = await importResult(page);
    check('import', 'a file dropped on the page is added', /Dropped Tune/.test(text) && /Read cleanly|SixTab/.test(text), text.slice(0, 300));
    await closeDialogs(page);

    // ---- persistence ---------------------------------------------------------------------------------
    await page.getByRole('radio', { name: /My songs/ }).click().catch(async () => page.getByRole('button', { name: /My songs/ }).click());
    await page.waitForTimeout(300);
    const mineBefore = await rowIds(page);
    check('persist', 'five songs in "My songs" after the imports', mineBefore.length === 5, mineBefore.join(','));
    await page.reload({ waitUntil: 'load' });
    await ready(page);
    const mineAfter = await rowIds(page);
    check('persist', 'they are all still there after a reload', mineAfter.length === 5 && mineBefore.every((id) => mineAfter.includes(id)), mineAfter.join(','));
    const where = await page.evaluate(async () => ({
      idb: (await indexedDB.databases()).map((d) => d.name),
      fallback: Object.keys(localStorage).filter((k) => k.startsWith('ssa:library.')),
    }));
    check('persist', 'they are kept in IndexedDB (ssa-library), not the small fallback', where.idb.includes('ssa-library') && where.fallback.length === 0, JSON.stringify(where));
    const gpId = mineAfter.find((id) => id.startsWith('my-riverside-waltz'));
    const asciiId = mineAfter.find((id) => id.startsWith('my-morning-riff'));

    // A learner's song in the pane: where it came from and the importer's notes.
    await page.locator(`[data-song-row="${asciiId}"] > a`).hover();
    await page.waitForTimeout(500);
    const paneText = (await page.locator(PANE).innerText()).replace(/\s+/g, ' ');
    check('import', 'the details of a pasted song say where it came from and to check the rhythm', /Pasted text tab/.test(paneText) && /check the rhythm/i.test(paneText), paneText.slice(0, 300));
    await page.screenshot({ path: path.join(OUT, 'songs-desktop-mine.png') });

    // ---- export ------------------------------------------------------------------------------------
    await closeDialogs(page);
    await openRowMenu(page, gpId, 'Export…');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'songs-desktop-export.png') });
    let [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), dialog(page).getByRole('button', { name: 'Save file' }).click()]);
    let body = fs.readFileSync(await download.path(), 'utf8');
    check('export', 'SixTab export downloads a .sixtab.txt with the song', download.suggestedFilename() === 'riverside-waltz.sixtab.txt' && /title: Riverside Waltz/.test(body) && /\|/.test(body), `${download.suggestedFilename()} ${body.slice(0, 80)}`);
    await page.waitForTimeout(400);
    await openRowMenu(page, gpId, 'Export…');
    await dialog(page).getByText(/^MusicXML/).first().click();
    [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), dialog(page).getByRole('button', { name: 'Save file' }).click()]);
    body = fs.readFileSync(await download.path(), 'utf8');
    check('export', 'MusicXML export downloads a .musicxml score', download.suggestedFilename() === 'riverside-waltz.musicxml' && body.includes('<score-partwise'), download.suggestedFilename());
    await closeDialogs(page);

    // ---- manage: rename, delete + undo ----------------------------------------------------------------
    await openRowMenu(page, asciiId, 'Edit details');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'songs-desktop-edit.png') });
    await dialog(page).getByLabel('Title').fill('Morning Riff in E');
    await dialog(page).getByRole('button', { name: 'Save details' }).click();
    await page.waitForTimeout(600);
    check('manage', 'renaming a song shows the new title in the list', /Morning Riff in E/.test(await page.locator(`[data-song-row="${asciiId}"]`).innerText()));
    await openRowMenu(page, asciiId, 'Delete');
    await dialog(page).getByRole('button', { name: 'Delete song' }).click();
    await page.waitForTimeout(600);
    check('manage', 'a deleted song leaves the list', !(await rowIds(page)).includes(asciiId));
    await page.getByRole('button', { name: 'Undo' }).first().click();
    await page.waitForTimeout(800);
    check('manage', 'Undo brings it back', (await rowIds(page)).includes(asciiId));

    await page.getByRole('radio', { name: /All songs/ }).click();
    await page.waitForTimeout(300);
    await openRowMenu(page, 'hot-cross-buns', 'Copy to my songs');
    await page.waitForTimeout(800);
    check('manage', 'a built-in song can be copied to "My songs"', (await rowIds(page)).some((id) => id.startsWith('my-hot-cross-buns-my-copy')), (await rowIds(page)).join(','));

    await page.locator(`[data-song-row="${gpId}"] > a`).click();
    await page.waitForFunction((id) => location.hash === `#play--${id}`, gpId, { timeout: 5000 }).catch(() => {});
    check('manage', 'one click on a row opens the Player at #play--<id>', (await page.evaluate(() => location.hash)) === `#play--${gpId}`);
    await page.goBack();
    await ready(page);
    check('layout', 'desktop: no sideways scroll', (await overflow(page)) <= 1);
    await page.screenshot({ path: path.join(OUT, 'songs-desktop-dark.png') });
    const errs = errors.filter((e) => !BENIGN.some((b) => b.test(e)));
    check('layout', 'desktop: no console errors', errs.length === 0, errs.join(' | '));
  });

  await withApp({ size: 'desktop', theme: 'light' }, async ({ page, context, goto, errors }) => {
    await seed(context);
    await goto('songs');
    await ready(page);
    await page.waitForSelector('[data-song-row] [data-mini-tab]', { timeout: 10000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'songs-desktop-light.png') });
    check('layout', 'desktop light: renders without errors', errors.filter((e) => !BENIGN.some((b) => b.test(e))).length === 0, errors.join(' | '));
  });
}

async function phone(theme) {
  await withApp({ mobile: true, theme }, async ({ page, context, goto, errors }) => {
    await seed(context);
    await goto('songs');
    await ready(page);
    await page.waitForSelector('[data-next-song] [data-mini-tab]', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    const cards = await page.locator('[data-next-song]').count();
    const rows = await page.locator('[data-song-row]').count();
    check('phone', `${theme}: suggestion cards and rows are shown`, cards >= 2 && cards <= 3 && rows >= 2, `${cards} cards, ${rows} rows`);
    check('phone', `${theme}: no sideways scroll`, (await overflow(page)) <= 1, String(await overflow(page)));
    await page.screenshot({ path: path.join(OUT, `songs-phone-${theme}.png`) });
    await page.screenshot({ path: path.join(OUT, `songs-phone-${theme}-full.png`), fullPage: true });
    if (theme === 'dark') {
      await page.getByRole('button', { name: /^Filters/ }).click();
      await page.waitForSelector('[role="dialog"]');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, 'songs-phone-filters.png') });
      await dialog(page).getByRole('button', { name: /Intermediate/ }).click();
      await page.waitForTimeout(200);
      const label = await dialog(page).getByRole('button', { name: /^Show \d+ songs?$/ }).innerText();
      const promised = Number((/\d+/.exec(label) || [])[0]);
      check('phone', 'the filter sheet says how many songs it will show', promised >= 2, label);
      await dialog(page).getByRole('button', { name: /^Show \d+ songs?$/ }).click();
      await page.waitForTimeout(400);
      const ids = await rowIds(page);
      const levels = await page.$$eval('[data-song-row]', (rows) => rows.map((r) => Number((/Level (\d+)/.exec(r.textContent || '') || [])[1])));
      check('phone', 'filters from the sheet apply to the list (as many as promised, all intermediate)', ids.length === promised && ids.includes('greensleeves-fingerstyle') && levels.every((lv) => lv >= 4 && lv <= 7), `${ids.length} of ${promised}: ${levels.join(',')}`);
      await page.getByRole('button', { name: 'Clear all' }).click();
      await page.waitForTimeout(300);
      await openRowMenu(page, 'greensleeves-fingerstyle', 'About this song');
      await page.waitForSelector('[role="dialog"] [data-song-details]');
      await page.waitForTimeout(1200);
      check('phone', 'the details sheet opens from a row menu, with Play', (await dialog(page).locator('a', { hasText: 'Play' }).count()) >= 1);
      await page.screenshot({ path: path.join(OUT, 'songs-phone-details.png') });
      await closeDialogs(page);
      await page.locator('[data-add-song]').click();
      await page.waitForSelector('[data-add-sheet]');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, 'songs-phone-add.png') });
      await addSheet(page).getByRole('button', { name: /Paste tab or chords/ }).click();
      await addSheet(page).locator('textarea').fill(ASCII_TAB);
      await addSheet(page).getByRole('button', { name: 'Add song' }).click();
      const text = await importResult(page);
      check('phone', 'a paste works on a phone and shows its result', /Added to your songs/.test(text), text.slice(0, 200));
      await page.screenshot({ path: path.join(OUT, 'songs-phone-imported.png') });
      await closeDialogs(page);
      check('phone', 'still no sideways scroll after the sheets', (await overflow(page)) <= 1);
    }
    const errs = errors.filter((e) => !BENIGN.some((b) => b.test(e)));
    check('phone', `${theme}: no console errors`, errs.length === 0, errs.join(' | '));
  });
}

async function details() {
  for (const mobile of [false, true]) {
    const tag = mobile ? 'phone' : 'desktop';
    await withApp(mobile ? { mobile: true } : { size: 'desktop' }, async ({ page, context, goto, errors }) => {
      await seed(context);
      await goto('songs');
      await ready(page);
      // Open one song's details: the pane on desktop, the sheet (from the row's menu) on a phone.
      const show = async (id, title) => {
        if (mobile) {
          await closeDialogs(page);
          // Find it by its title, as a learner would.
          if (title) {
            await page.locator('input[type="search"]').first().fill(title);
            await page.waitForTimeout(500);
          }
          await page.locator(`[data-song-row="${id}"]`).scrollIntoViewIfNeeded();
          await openRowMenu(page, id, 'About this song');
          await page.waitForSelector(`[role="dialog"] [data-song-details="${id}"]`, { timeout: 15000 });
        } else {
          await goto('songs', id);
          await ready(page);
          await page.waitForSelector(`${PANE} [data-song-details="${id}"]`, { timeout: 15000 });
        }
        await page.waitForTimeout(1200);
        return page.locator(`[data-song-details="${id}"]`).first();
      };
      let d = await show('drunken-sailor', 'Drunken Sailor');
      check('details', `${tag}: a modal song shows its mode (E Dorian)`, (await d.locator('[data-song-key]').innerText()) === 'E Dorian', await d.locator('[data-song-key]').innerText());
      d = await show('mo-li-hua', 'Mo Li Hua');
      const origin = await d.locator('[data-song-origin]').innerText();
      check('details', `${tag}: a recovered song shows its origin line (as commonly sung today)`, /commonly sung or played today/.test(origin), origin);
      // The learner's own songs: a copy of the recovered song, and a song typed in A Dorian.
      const ids = await page.evaluate(async () => {
        const lib = (await import('/src/core/library/index.ts')).getLibrary();
        const copy = await lib.duplicate('mo-li-hua');
        const typed = await lib.importText('title: Dorian Sketch\ntempo: 90\ntime: 4/4\nkey: A dorian\n| q 3:2 3:4 2:1 2:3 | w 3:2 ||\n', { kind: 'typed' });
        return { copy: copy.id, typed: typed.listing.id, typedKey: typed.listing.key };
      });
      await page.waitForTimeout(800);
      d = await show(ids.copy, 'Mo Li Hua (Jasmine Flower) (my copy)');
      const copyOrigin = await d.locator('[data-song-origin]').innerText();
      check('details', `${tag}: the learner's copy keeps the origin line too`, /Your copy of Mo Li Hua/.test(copyOrigin) && /commonly sung or played today/.test(copyOrigin), copyOrigin);
      d = await show(ids.typed, 'Dorian Sketch');
      const key = await d.locator('[data-song-key]').innerText();
      check('details', `${tag}: the learner's song in A Dorian says A Dorian (the library kept "${ids.typedKey}")`, key === 'A Dorian', key);
      await page.screenshot({ path: path.join(OUT, `songs-${tag}-modal-details.png`) });
      check('details', `${tag}: no sideways scroll`, (await overflow(page)) <= 1);
      const errs = errors.filter((e) => !BENIGN.some((b) => b.test(e)));
      check('details', `${tag}: no console errors`, errs.length === 0, errs.join(' | '));
    });
  }
}

async function sideways() {
  await withApp({ mobile: true, viewport: { width: 844, height: 390 } }, async ({ page, context, goto, errors }) => {
    await seed(context);
    await goto('songs');
    await ready(page);
    await page.waitForTimeout(600);
    check('phone', 'sideways: no sideways scroll', (await overflow(page)) <= 1);
    await page.screenshot({ path: path.join(OUT, 'songs-phone-sideways.png') });
    check('phone', 'sideways: no console errors', errors.filter((e) => !BENIGN.some((b) => b.test(e))).length === 0, errors.join(' | '));
  });
}

(async () => {
  const started = Date.now();
  try {
    if (process.argv.includes('--only')) {
      if (process.argv[process.argv.indexOf('--only') + 1] === 'details') await details();
    } else {
      await desktop();
      await details();
      await phone('dark');
      await phone('light');
      await sideways();
    }
  } catch (e) {
    check('run', 'the script ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
  }
  const failed = results.filter((r) => !r.pass);
  const groups = [...new Set(results.map((r) => r.group))];
  for (const g of groups) {
    const rs = results.filter((r) => r.group === g);
    console.log(`${rs.every((r) => r.pass) ? 'ok  ' : 'FAIL'}  ${g}: ${rs.filter((r) => r.pass).length}/${rs.length}`);
  }
  console.log(`${failed.length ? 'FAILED' : 'PASSED'}  songs: ${results.length - failed.length}/${results.length} checks in ${Math.round((Date.now() - started) / 1000)} s; screenshots in e2e/out/songs-*.png`);
  process.exit(failed.length ? 1 : 0);
})();
