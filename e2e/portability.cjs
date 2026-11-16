#!/usr/bin/env node
/**
 * Browser check that "your data" is complete. Run: node e2e/portability.cjs [--verbose] [--no-shots]
 *
 * A learner four months in builds up, through each feature's own module (the code the screens
 * use): three practice journal entries, arcade records, a saved progression, a rhythm calibration
 * and one of their own songs (imported as text tab), plus an API key and a device notice that must
 * never travel. Then, on Me > Your data:
 *
 *  holds     "What a backup holds" counts each of them
 *  export    the file is a version-3 backup with the progress, every one of those keys and the
 *            song, and nothing secret
 *  reset     with "Also delete my songs" everything is gone (storage, the song library, the
 *            journal and song screens), the AI key and the device notice stay; the page reloads
 *            and a toast offers Undo
 *  import    Replace shows "now / after" lines for each thing, then everything is back exactly
 *            (same stored values, same song id and notes, same progress), on the screens too
 *  merge     a journal changed here (one entry deleted, one added) merged with the file: the
 *            preview says 3 now, 4 after, and Undo puts this device back as it was
 *  phone     the same screen at 390 px: no sideways scroll, the preview and the reset dialog fit
 *
 * Prints one line per group and exits non-zero if a check failed. On a busy machine, re-run
 * before believing a timeout.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withApp, VIEWPORTS, ROOT } = require('./lib/harness.cjs');
const { buildSeeds, seedContext } = require('./profile-seed.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const shots = !argv.includes('--no-shots');
const OUT = path.join(ROOT, 'e2e', 'out', 'portability');
if (shots) fs.mkdirSync(OUT, { recursive: true });

const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];
const KEYS = ['practice.data', 'arcade', 'progressions.saved', 'rhythm.calibration'];
const SECRET = 'sk-ant-api03-PORTABILITY-check-key-never-exported-0123456789abcdef';
const TAB = `Portable riff

e|-----------------|-----------------|
B|-----------------|-----------------|
G|-----------------|-----------------|
D|---------2---4---|---------2---4---|
A|-----2-----------|-----2-----------|
E|-0-------------0-|-0-------------0-|
`;

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass, detail: detail ? String(detail) : '' });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail && (!pass || verbose) ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}

async function open(browser, url, { mobile = false, saved } = {}) {
  const viewport = VIEWPORTS[mobile ? 'mobile' : 'desktop'];
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'dark', hasTouch: mobile, isMobile: mobile, acceptDownloads: true });
  await seedContext(context, saved);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((p) => p.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  const ready = async () => {
    await page.waitForSelector('main[data-route]', { timeout: 20000 });
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-profile-section="data"]');
      return !!root && !document.querySelector('[data-shell-fallback]') && !!root.querySelector('[data-card="included"] [data-line="progress"]');
    }, null, { timeout: 20000 });
    await page.waitForTimeout(300);
  };
  const goto = async (hash) => {
    // A fresh document every time: going to the address the page is already on would not remount the screen.
    await page.goto('about:blank');
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route]', { timeout: 20000 });
    if (hash === 'profile--data') await ready();
    else await page.waitForTimeout(1200);
  };
  return { context, page, errors, ready, goto, close: () => context.close() };
}

/** Values the features keep, the learner's songs and a few facts, read in the page. */
async function look(page) {
  return page.evaluate(async (keys) => {
    const library = await import('/src/core/library/index.ts');
    const lib = library.getLibrary();
    const mine = (await lib.list()).filter((s) => s.source === 'mine');
    const songs = [];
    for (const s of mine) songs.push({ id: s.id, title: s.title, notes: s.notes || '', json: JSON.stringify((await lib.load(s.id)).tracks) });
    const values = {};
    for (const key of keys) values[key] = localStorage.getItem(`ssa:${key}`);
    let progress = null;
    try {
      progress = JSON.parse(localStorage.getItem('ssa:progress') || 'null')?.state ?? null;
    } catch {
      progress = null;
    }
    return { values, songs, aiKey: localStorage.getItem('ssa:ai.anthropic-key'), notice: localStorage.getItem('ssa:player.micNotice'), progress };
  }, KEYS);
}

/** Click something that makes the app reload itself, and wait for the page to come back. */
async function clickAndReload(ctx, locator) {
  try {
    await Promise.all([ctx.page.waitForEvent('load', { timeout: 30000 }), locator.click()]);
  } catch (e) {
    if (shots) await ctx.page.screenshot({ path: path.join(OUT, 'failed-reload.png') }).catch(() => undefined);
    const notice = await ctx.page.evaluate(() => localStorage.getItem('ssa:data.notice')).catch(() => null);
    throw new Error(`the page did not reload: ${e.message.split('\n')[0]} (message left for after the reload: ${notice}) ${ctx.errors.join(' / ')}`);
  }
  await ctx.ready();
}

async function toastText(page) {
  await page.waitForSelector('[data-toast]', { timeout: 10000 }).catch(() => undefined);
  return (await page.locator('[data-toast]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
}

async function shot(ctx, name, fullPage = false) {
  if (shots) await ctx.page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
}

async function screenText(ctx, hash, waitFor) {
  await ctx.goto(hash);
  if (waitFor) await ctx.page.waitForFunction((t) => document.querySelector('main')?.innerText.includes(t), waitFor, { timeout: 8000 }).catch(() => undefined);
  return ctx.page.locator('main').innerText();
}

async function desktop(browser, url, seeds) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-portability-'));
  const ctx = await open(browser, url, { saved: seeds.rich.saved });
  const { page } = ctx;
  await ctx.goto('profile--data');

  // --- the learner builds things up, through each feature's own module
  const made = await page.evaluate(
    async ({ tab, secret }) => {
      const practice = await import('/src/features/practice/model/store.ts');
      const arcade = await import('/src/features/arcade/ui/store.ts');
      const saved = await import('/src/features/progressions/model/saved.ts');
      const builder = await import('/src/features/progressions/model/builder.ts');
      const calibration = await import('/src/features/rhythm/core/calibration.ts');
      const library = await import('/src/core/library/index.ts');
      const storage = await import('/src/core/platform/storage.ts');
      const now = Date.now();
      const day = new Date(now).toISOString().slice(0, 10);
      for (let i = 0; i < 3; i++) {
        const endedAt = now - i * 3_600_000;
        practice.addJournalEntry({ id: `e2e-entry-${i}`, startedAt: endedAt - 900_000, endedAt, day, title: `Evening practice ${i + 1}`, plannedSec: 900, practisedSec: 900, blocks: [], xp: 12, feel: 4, note: i === 0 ? 'Barre chords felt cleaner' : '', endedEarly: false });
      }
      arcade.updateRecords((r) => ({ ...r, levels: { ...r.levels, 'note-hunt': { 'minor-pentatonic': { 1: { stars: 3, best: 940, plays: 4, at: now }, 2: { stars: 1, best: 310, plays: 1, at: now } } } }, dailyBest: 520 }));
      saved.saveDraft({ ...builder.STARTER_DRAFT, name: 'Portable blues' }, { now });
      calibration.saveCalibration({ tapMs: 42, tapAt: now, offered: true });
      const lib = library.getLibrary();
      const song = await lib.importText(tab, { title: 'Portable riff' });
      await lib.update(song.listing.id, { notes: 'Palm-mute the low E' });
      storage.writeRaw('ai.anthropic-key', secret);
      storage.writeJSON('player.micNotice', true);
      return { songId: song.listing.id };
    },
    { tab: TAB, secret: SECRET },
  );
  await page.waitForTimeout(800);
  await ctx.goto('profile--data');
  const before = await look(page);
  check('holds', 'the learner has built things up in five features', KEYS.every((k) => before.values[k]) && before.songs.length === 1 && before.songs[0].id === made.songId, JSON.stringify(Object.keys(before.values).filter((k) => !before.values[k])));

  const held = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-included] [data-line]')].map((li) => [li.getAttribute('data-line'), li.textContent.replace(/\s+/g, ' ').trim()])));
  check(
    'holds',
    '"What a backup holds" counts each thing: 3 journal entries, 2 arcade levels, 1 progression, 1 calibration, 1 song',
    /3 entries/.test(held.journal || '') && /2 levels played/.test(held.arcade || '') && /1 progression/.test(held.progressions || '') && /1 measurement/.test(held.calibration || '') && /1 song/.test(held.songs || '') && /level \d+/.test(held.progress || ''),
    JSON.stringify(held),
  );
  const stays = await page.locator('[data-stays]').innerText();
  check('holds', 'the API key is listed under "Stays on this device"', /Your API key/.test(stays), stays.slice(0, 120));
  await shot(ctx, 'holds-desktop', true);

  // --- export
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('[data-card="export"]').getByRole('button', { name: 'Export to a file' }).click()]);
  const file = path.join(dir, download.suggestedFilename());
  await download.saveAs(file);
  const text = fs.readFileSync(file, 'utf8');
  const exported = JSON.parse(text);
  const exportedKeys = Object.keys(exported.data || {});
  check(
    'export',
    'the file is a version-3 backup with the progress, every feature key and the song',
    exported.kind === 'backup' && exported.v === 3 && exported.progress?.state?.xp?.total === seeds.rich.state.xp.total && KEYS.every((k) => exportedKeys.includes(k)) && exported.songs?.length === 1 && exported.songs[0].listing.id === made.songId && exported.songs[0].listing.notes === 'Palm-mute the low E',
    `${download.suggestedFilename()} keys=${exportedKeys.join(',')} songs=${exported.songs?.length}`,
  );
  check('export', 'nothing secret or device-only is in it', !text.includes('sk-ant') && !text.includes('micNotice') && !exportedKeys.some((k) => /^(ai\.|sync\.|data\.|shell\.)/.test(k)), exportedKeys.join(','));

  // --- reset, songs too
  await page.locator('[data-card="reset"]').getByRole('button', { name: 'Reset everything' }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.waitFor({ timeout: 5000 });
  const erases = await dialog.locator('[data-reset-erases]').innerText();
  const keeps = await dialog.locator('[data-reset-keeps]').innerText();
  check('reset', 'the dialog names what goes (journal, records, saved things) and what stays (songs, the API key)', /practice journal \(3 entries\)/.test(erases) && /arcade records/.test(erases) && /saved progressions/.test(erases) && /1 own song/.test(keeps) && /API key/.test(keeps), `${erases} || ${keeps}`);
  await dialog.getByRole('checkbox', { name: /Also delete my 1 song/ }).check();
  const keepsAfterTick = await dialog.locator('[data-reset-keeps]').innerText();
  await dialog.locator('[data-reset-input]').fill('RESET');
  await shot(ctx, 'reset-dialog-desktop');
  await clickAndReload(ctx, dialog.locator('[data-reset-confirm]'));
  const resetToast = await toastText(page);
  const gone = await look(page);
  check('reset', 'ticking "Also delete my songs" moves the songs from "Kept" to the erased list', !/own song/.test(keepsAfterTick), keepsAfterTick);
  check('reset', 'after the reload everything is gone: the four keys, the song, the progress', KEYS.every((k) => gone.values[k] === null) && gone.songs.length === 0 && gone.progress && gone.progress.xp.total === 0, JSON.stringify({ values: gone.values, songs: gone.songs.length, xp: gone.progress?.xp?.total }));
  check('reset', 'the AI key and the device notice stay', gone.aiKey === SECRET && gone.notice === 'true', `${!!gone.aiKey} ${gone.notice}`);
  check('reset', 'a toast says so and offers Undo', /Everything was erased/.test(resetToast) && /Undo/.test(resetToast), resetToast);
  const records = await page.evaluate(async () => (await import('/src/features/arcade/ui/store.ts')).getRecords().levels['note-hunt'] ?? null);
  check('reset', 'the arcade, read through its own store after the reload, has no records', records === null, JSON.stringify(records));
  const later = await page.locator('[data-included-later]').innerText().catch(() => '');
  check('reset', '"What a backup holds" now names those things as "as soon as you have any"', /practice journal/.test(later) && /arcade records/.test(later) && /your own songs/.test(later), later);
  const journalGone = await screenText(ctx, 'practice--journal');
  const songsGone = await screenText(ctx, 'songs');
  check('reset', 'the journal and song screens no longer show them', !/Evening practice/.test(journalGone) && !/Portable riff/.test(songsGone), '');

  // --- import with Replace
  await ctx.goto('profile--data');
  await page.locator('[data-card="import"] input[type="file"]').setInputFiles(file);
  await dialog.waitFor({ timeout: 10000 });
  await dialog.getByRole('radio', { name: /Replace/ }).check();
  await page.waitForTimeout(300);
  const rows = await dialog.evaluate((el) => Object.fromEntries([...el.querySelectorAll('[data-import-preview="data"] tbody tr')].map((tr) => [tr.getAttribute('data-row'), [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())])));
  check(
    'import',
    'the preview says what comes back: journal 0 → 3 entries, arcade, progression, calibration, songs 0 → 1',
    rows['data-journal']?.join('|') === '0 entries|3 entries' && rows['data-arcade']?.[1] === '2 levels played' && rows['data-progressions']?.[1] === '1 progression' && rows['data-calibration']?.[1] === '1 measurement' && rows.songs?.join('|') === '0 songs|1 song',
    JSON.stringify(rows),
  );
  const note = await dialog.locator('[data-import-note]').innerText();
  check('import', 'and how: Replace makes it exactly the file, and never deletes a song', /exactly what the file holds/.test(note) && /never deletes a song/.test(note), note);
  await shot(ctx, 'import-preview-desktop');
  await clickAndReload(ctx, dialog.locator('[data-import-confirm]'));
  const importToast = await toastText(page);
  const back = await look(page);
  check('import', 'everything is back exactly: the stored values of every feature', KEYS.every((k) => back.values[k] === before.values[k]), JSON.stringify(KEYS.filter((k) => back.values[k] !== before.values[k])));
  check('import', 'the song is back with its id, notes and notes on the staff', back.songs.length === 1 && back.songs[0].id === made.songId && back.songs[0].notes === 'Palm-mute the low E' && back.songs[0].json === before.songs[0].json, JSON.stringify(back.songs.map((s) => [s.id, s.notes])));
  check('import', 'the progress is back', back.progress && seeds.fingerprint(back.progress) === seeds.fingerprint(before.progress), `xp=${back.progress?.xp?.total}`);
  check('import', 'a toast confirms it, with Undo', /Backup imported/.test(importToast) && /Undo/.test(importToast), importToast);
  const recordsBack = await page.evaluate(async () => (await import('/src/features/arcade/ui/store.ts')).getRecords().levels['note-hunt']?.['minor-pentatonic']?.['1']?.best ?? null);
  const calibrationBack = await page.evaluate(async () => (await import('/src/features/rhythm/core/calibration.ts')).loadCalibration().tapMs);
  check('import', 'the features read it back through their own code (arcade best 940, calibration 42 ms)', recordsBack === 940 && calibrationBack === 42, `${recordsBack} ${calibrationBack}`);
  const journalBack = await screenText(ctx, 'practice--journal', 'Evening practice 1');
  const songsBack = await screenText(ctx, 'songs', 'Portable riff');
  const progressionsBack = await screenText(ctx, 'progressions', 'Portable blues');
  check('import', 'the journal, song and progression screens show them again', /Evening practice 1/.test(journalBack) && /Portable riff/.test(songsBack) && /Portable blues/.test(progressionsBack), '');

  // --- merge: a journal changed here meets the file
  await ctx.goto('profile--data');
  await page.evaluate(async () => {
    const practice = await import('/src/features/practice/model/store.ts');
    practice.removeJournalEntry('e2e-entry-2');
    const now = Date.now();
    practice.addJournalEntry({ id: 'e2e-entry-new', startedAt: now - 600_000, endedAt: now, day: new Date(now).toISOString().slice(0, 10), title: 'Morning scales', plannedSec: 600, practisedSec: 600, blocks: [], xp: 8, feel: 3, note: '', endedEarly: false });
  });
  await ctx.goto('profile--data');
  const local = await look(page);
  await page.locator('[data-card="import"] input[type="file"]').setInputFiles(file);
  await dialog.waitFor({ timeout: 10000 });
  const mergeRows = await dialog.evaluate((el) => Object.fromEntries([...el.querySelectorAll('[data-import-preview="data"] tbody tr')].map((tr) => [tr.getAttribute('data-row'), [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())])));
  const mergeNote = await dialog.locator('[data-import-note]').innerText();
  check('merge', 'Merge is offered first and its preview says "3 entries now, 4 after"', mergeRows['data-journal']?.join('|') === '3 entries|4 entries' && /Lists are joined/.test(mergeNote), JSON.stringify(mergeRows['data-journal']));
  await clickAndReload(ctx, dialog.locator('[data-import-confirm]'));
  const mergeToast = await toastText(page);
  const merged = await page.evaluate(() => JSON.parse(localStorage.getItem('ssa:practice.data') || 'null')?.journal?.map((e) => e.id).sort());
  check('merge', 'a toast confirms the merge, with Undo', /Backup merged/.test(mergeToast) && /Undo/.test(mergeToast), mergeToast);
  check('merge', 'after merging the journal holds both sides: 4 entries', JSON.stringify(merged) === JSON.stringify(['e2e-entry-0', 'e2e-entry-1', 'e2e-entry-2', 'e2e-entry-new']), JSON.stringify(merged));
  await clickAndReload(ctx, page.locator('[data-toast]').getByRole('button', { name: 'Undo' }));
  const undone = await look(page);
  const undoneToast = await toastText(page);
  check('merge', 'Undo puts this device back exactly as it was before the merge', KEYS.every((k) => undone.values[k] === local.values[k]) && /Undone/.test(undoneToast), undoneToast);

  const noise = ctx.errors.splice(0);
  check('desktop', 'the whole round trip logged no errors', noise.length === 0, noise[0]);
  await ctx.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return file;
}

async function phone(browser, url, seeds) {
  const ctx = await open(browser, url, { mobile: true, saved: seeds.rich.saved });
  const { page } = ctx;
  await ctx.goto('profile--data');
  await page.evaluate(async () => {
    const practice = await import('/src/features/practice/model/store.ts');
    const now = Date.now();
    for (let i = 0; i < 2; i++) practice.addJournalEntry({ id: `phone-${i}`, startedAt: now - 900_000, endedAt: now - i, day: new Date(now).toISOString().slice(0, 10), title: 'Practice', plannedSec: 900, practisedSec: 900, blocks: [], xp: 10, feel: null, note: '', endedEarly: false });
  });
  await ctx.goto('profile--data');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('phone', 'Your data fits a 390 px phone with no sideways scroll', wide <= 1, `${wide}px`);
  await shot(ctx, 'holds-phone', true);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('[data-card="export"]').getByRole('button', { name: 'Export to a file' }).click()]);
  const file = path.join(os.tmpdir(), `ssa-phone-${process.pid}.json`);
  await download.saveAs(file);
  await page.locator('[data-card="import"] input[type="file"]').setInputFiles(file);
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  const fits = await dialog.evaluate((el) => {
    const tables = [...el.querySelectorAll('table')];
    return tables.every((t) => t.getBoundingClientRect().right <= window.innerWidth + 1);
  });
  check('phone', 'the import preview tables fit the screen', fits, '');
  await shot(ctx, 'import-preview-phone');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('[data-card="reset"]').getByRole('button', { name: 'Reset everything' }).click();
  await dialog.waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  await shot(ctx, 'reset-dialog-phone');
  const noise = ctx.errors.splice(0);
  check('phone', 'no errors on the phone', noise.length === 0, noise[0]);
  fs.rmSync(file, { force: true });
  await ctx.close();
}

async function main() {
  const started = Date.now();
  console.log('portability: building the learner');
  const seeds = await buildSeeds();
  await withApp({}, async ({ browser, url }) => {
    for (const [name, fn] of [
      ['desktop', () => desktop(browser, url, seeds)],
      ['phone', () => phone(browser, url, seeds)],
    ]) {
      try {
        await fn();
      } catch (e) {
        check(name, 'ran to the end', false, String(e && e.message ? e.message : e).split('\n').slice(0, 3).join(' '));
      }
    }
  });
  const groups = [...new Set(results.map((r) => r.group))];
  const failed = results.filter((r) => !r.pass);
  console.log('');
  for (const group of groups) {
    const mine = results.filter((r) => r.group === group);
    const bad = mine.filter((r) => !r.pass);
    console.log(`${bad.length ? 'FAIL' : 'ok  '}  ${group.padEnd(8)} ${mine.length - bad.length}/${mine.length}`);
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
