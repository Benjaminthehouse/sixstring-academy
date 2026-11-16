#!/usr/bin/env node
/**
 * Browser check of Scan & Import (#scan). Run: node e2e/scan.cjs [--only a,b] [--verbose]
 *
 * Groups (all in the bundled Chromium against the dev server, pictures uploaded through the file
 * chooser the way a learner picks them):
 *   clean      the sheet reader's fixture pages (tab, notation + tab, notation only, a four-line
 *              bass staff): bars and notes on screen against the ground truth; one note corrected
 *              in the proofreader by keyboard (digit, undo, redo); saved; opened in the Player
 *   degraded   the same pages as scans and phone photos (the reader's own degradation model):
 *              notes read against the truth, the honest verdict, things to check on a bad photo
 *   pages      two pages read as one song, reordered first; crop and turn a page
 *   pdf        a PDF made here with Chromium's page.pdf(): an engraved page (rasterised, read)
 *              and typed tab (straight from its text layer)
 *   text       a photo of a chord sheet (OCR with the vendored Tesseract) and a pasted ASCII tab
 *   ai         "Improve with AI" against a fake Claude (the artifact's `sample` capability)
 *   review     what an independent review found broken, kept fixed: keys before any click, work
 *              kept on leaving and asked about on reload, progress that only moves forward, saving
 *              that keeps every note and survives an impossible fret, 360 px and 200 % text
 *   shots      phone and desktop, dark and light screenshots in e2e/out/scan-*.png
 *
 * Prints one line per check and PASSED / FAILED; exits non-zero on failure.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { withApp, loadTs, VIEWPORTS, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
const want = (g) => !only || only.has(g);

const OUT = path.join(ROOT, 'e2e', 'out');
const FIX = path.join(OUT, 'scan-fixtures');
fs.mkdirSync(FIX, { recursive: true });
const SEED = { 'ssa:shell.onboarding': '{"skipped":true}' };

let failures = 0;
const results = [];
function check(group, name, ok, detail) {
  results.push({ group, name, ok });
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${group}] ${name}${!ok || verbose ? (detail !== undefined ? `  -- ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '') : ''}`);
}

// ------------------------------------------------------------------------------------------------
// Fixtures: pictures written from the sheet reader's corpus, ground truth as note lists per bar
// ------------------------------------------------------------------------------------------------

/** Per bar, per event: the tab notes "string:fret" sorted, from the truth (tab staff if any). */
function truthBars(truth) {
  const bars = [];
  for (const sys of truth.systems) {
    const tab = sys.staves.find((s) => s.kind === 'tab');
    const notation = sys.staves.find((s) => s.kind === 'notation');
    const staff = tab ?? notation;
    for (const m of staff.measures) {
      const events = [];
      const src = tab && notation ? notation.measures.find((x) => x.index === m.index) ?? m : m;
      for (const e of src.events) {
        if (e.type === 'rest') continue;
        events.push({
          frets: e.notes.map((n) => `${n.string}:${n.fret}`).sort(),
          midis: e.notes.map((n) => n.midi).sort((a, b) => a - b),
        });
      }
      bars.push(events);
    }
  }
  return bars;
}

/**
 * Matching notes between the screen's reading and the truth: the longest common subsequence of
 * events over the whole piece (so a missed or extra bar line does not throw everything after it
 * off), plus how many bars come out exactly right.
 */
function compare(draftBars, truth, by) {
  const key = (e) => JSON.stringify(e[by]);
  const d = draftBars.flat();
  const t = truth.flat();
  const n = d.length;
  const m = t.length;
  // dp[i][j]: notes matched between d[i..] and t[j..].
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = key(d[i]) === key(t[j]) ? dp[i + 1][j + 1] + t[j][by].length : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const truthNotes = t.reduce((s, e) => s + e[by].length, 0);
  let exactBars = 0;
  truth.forEach((tb, b) => {
    const db = draftBars[b] ?? [];
    if (tb.length === db.length && tb.every((e, k) => key(e) === key(db[k]))) exactBars++;
  });
  const matched = dp[0][0];
  return { truthNotes, matched, recall: truthNotes ? matched / truthNotes : 1, exactBars, drawnBars: draftBars.length, truthBars: truth.length };
}

async function makeFixtures() {
  const fx = await loadTs('/src/core/omr/eval/fixtures.ts');
  const dg = await loadTs('/src/core/omr/eval/degrade.ts');
  const truthMod = await loadTs('/src/core/omr/eval/truth.ts');
  const pngMod = await loadTs('/src/core/omr/eval/png.ts');
  const jpeg = require(path.join(ROOT, 'node_modules', 'jpeg-js'));
  const made = {};
  const write = (name, img, kind, quality = 88) => {
    const file = path.join(FIX, name);
    if (kind === 'jpeg') {
      const rgba = img.rgba ?? (() => {
        const out = new Uint8Array(img.width * img.height * 4);
        for (let i = 0; i < img.width * img.height; i++) out.set([img.data[i], img.data[i], img.data[i], 255], i * 4);
        return out;
      })();
      fs.writeFileSync(file, jpeg.encode({ data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), width: img.width, height: img.height }, quality).data);
    } else pngMod.writePng(file, img);
    return file;
  };
  const add = (id, tier, seed, opts = {}) => {
    const f = opts.dir ? { gray: pngMod.readPngGray(path.join(opts.dir, `${id}.png`)), truth: truthMod.hydrateTruth(JSON.parse(fs.readFileSync(path.join(opts.dir, `${id}.json`), 'utf8'))) } : fx.loadFixture(id);
    const d = tier === 'clean' ? { width: f.gray.width, height: f.gray.height, data: f.gray.data, truth: f.truth } : dg.degrade(f.gray, f.truth, tier, seed);
    const name = `${id}-${tier}.${tier === 'clean' || tier === 'scan' ? 'png' : 'jpg'}`;
    const file = tier === 'clean' ? write(name, f.gray, 'png') : tier === 'scan' ? write(name, d.gray, 'png') : write(name, d, 'jpeg', opts.quality);
    made[`${id}:${tier}`] = { file, truth: truthBars(d.truth ?? f.truth), width: d.width, height: d.height };
    return made[`${id}:${tier}`];
  };
  add('linked-ode-bravura-150', 'clean');
  add('tab-ode-ls-150', 'clean');
  add('ode-bravura-150', 'clean');
  add('bass-carlito-150', 'clean', 1, { dir: path.join(ROOT, 'src/core/omr/tab/fixtures') });
  add('tab-open-chords-ins-150', 'clean');
  add('tab-ode-ls-150', 'scan', 2);
  add('linked-aura-lee-leland-150', 'photo-good', 3);
  add('page-tab-ls-150', 'photo-good', 1);
  add('linked-aura-lee-leland-150', 'photo-bad', 1);
  add('tab-fingerstyle-bri-150', 'clean');
  add('tab-pentatonic-jbm-150', 'clean');
  // The review's pictures: a bad photo whose bars do not add up, and an unseen tab page whose photo
  // reads two numbers as one fret (92, 48).
  add('tab-rhythm-lsb-150', 'photo-bad', 7, { quality: 80 });
  add('ut-heavy-rhythm-t14', 'photo-good', 7, { quality: 80, dir: path.join(ROOT, 'src/core/omr/fixtures-unseen') });
  return made;
}

// ------------------------------------------------------------------------------------------------
// Driving the screen
// ------------------------------------------------------------------------------------------------

async function newPage(browser, url, opts = {}) {
  const context = await browser.newContext({
    viewport: opts.viewport ?? VIEWPORTS[opts.mobile ? 'mobile' : 'desktop'],
    deviceScaleFactor: 1,
    colorScheme: opts.theme ?? 'dark',
    hasTouch: !!opts.mobile,
    isMobile: !!opts.mobile,
  });
  await context.addInitScript((items) => {
    try {
      if (localStorage.getItem('e2e:seeded') != null) return;
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
      localStorage.setItem('e2e:seeded', '1');
    } catch {
      /* no storage */
    }
  }, SEED);
  if (opts.init) await context.addInitScript(opts.init, opts.initArg);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const goto = async (hash) => {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route]', { timeout: 30000 });
  };
  return { context, page, errors, goto, close: () => context.close() };
}

async function openScan(p) {
  await p.goto('scan');
  // The first visit compiles the screen in the dev server; give it time.
  await p.page.waitForSelector('[data-scan="capture"]', { timeout: 90000 });
}

/** Upload files through the picker the learner uses (desktop: Choose; phone: the camera button). */
async function upload(p, files, opts = {}) {
  const sel = opts.camera ? '[data-scan-camera]' : (await p.page.$('[data-scan-choose]')) ? '[data-scan-choose]' : null;
  const trigger = sel ?? 'button:has-text("Add a page"), button:has-text("Choose photos or a PDF")';
  const [chooser] = await Promise.all([p.page.waitForEvent('filechooser', { timeout: 20000 }), p.page.locator(trigger).first().click()]);
  await chooser.setFiles(files);
}

async function waitLooked(p, count, timeout = 120000) {
  await p.page.waitForFunction((n) => {
    const s = window.__ssaScan;
    return s && s.pages.length >= n && s.pages.every((x) => x.look);
  }, count, { timeout });
}

async function readIt(p, timeout = 240000, shotName = null) {
  await p.page.click('[data-scan-read]');
  if (shotName) {
    await p.page.waitForSelector('[data-scan="reading"]', { timeout: 10000 }).then(() => shot(p, shotName)).catch(() => undefined);
  }
  await p.page.waitForFunction(() => {
    const s = window.__ssaScan;
    return s && (s.phase === 'music' || s.phase === 'text') && (s.draft || s.text);
  }, null, { timeout });
  await p.page.waitForTimeout(800);
}

/** The reading on screen: per bar, per beat with notes, sorted "string:fret" and MIDI. */
async function draftBars(p) {
  return p.page.evaluate(() => {
    const d = window.__ssaScan.draft;
    return d.song.tracks[0].measures.map((m) => m.beats.filter((b) => b.notes.length).map((b) => ({ frets: b.notes.map((n) => `${n.string}:${n.fret}`).sort(), midis: b.notes.map((n) => n.midi).sort((a, b2) => a - b2) })));
  });
}

async function startOver(p) {
  await p.goto('scan');
  await p.page.waitForSelector('[data-scan="capture"]', { timeout: 30000 });
  const btn = p.page.getByRole('button', { name: 'Start over' });
  if (await btn.count()) {
    await btn.first().click();
    // It asks first: the pages (and any reading) would be cleared.
    await p.page.getByRole('alertdialog').or(p.page.getByRole('dialog')).getByRole('button', { name: 'Start over' }).click();
  }
  await p.page.waitForSelector('[data-scan-drop]', { timeout: 15000 });
}

const shot = async (p, name, full = false) => {
  await p.page.screenshot({ path: path.join(OUT, `scan-${name}.png`), fullPage: full });
};

const noHorizontalScroll = (p) => p.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1);

// ------------------------------------------------------------------------------------------------
// Groups
// ------------------------------------------------------------------------------------------------

async function groupClean(browser, url, fx) {
  const g = 'clean';
  const p = await newPage(browser, url);
  await openScan(p);
  check(g, 'the screen opens with the honest sentence and a way in', /handwriting is not supported/.test(await p.page.innerText('[data-scan-honest]')) && (await p.page.$('[data-scan-choose]')) !== null);

  // Notation + tab: the whole flow.
  const linked = fx['linked-ode-bravura-150:clean'];
  await upload(p, [linked.file]);
  await waitLooked(p, 1);
  const look = await p.page.evaluate(() => window.__ssaScan.pages[0].look);
  check(g, 'the quick look finds notation and tab, 2 + 2 staves', look.kind === 'both' && look.staves.length === 4, { kind: look.kind, staves: look.staves.length });
  await shot(p, 'desktop-pages');
  await readIt(p);
  const bars = await draftBars(p);
  const c = compare(bars, linked.truth, 'frets');
  check(g, 'notation + tab page: every bar and every note as printed', c.recall === 1 && c.exactBars === c.truthBars && c.drawnBars === c.truthBars, c);
  const glyphs = await p.page.evaluate(() => document.querySelectorAll('[data-scan-tab] [data-tab-view] g[data-beat]').length);
  check(g, 'the tab on screen draws every note', glyphs === c.truthNotes, { glyphs, truth: c.truthNotes });
  const title = await p.page.innerText('[data-scan-title]');
  check(g, 'the title printed on the sheet is read (OCR) and shown', /Ode to Joy/i.test(title), title);
  check(g, 'the picture is shown beside the tab with the bar highlighted', (await p.page.$('[data-scan-source] svg image')) !== null);
  await shot(p, 'desktop-proof');

  // Tap a note on the picture: it is selected (and shown in the correction panel).
  await p.page.getByRole('radio', { name: 'Whole page' }).click();
  await p.page.waitForTimeout(300);
  const target = await p.page.evaluate(() => {
    const d = window.__ssaScan.draft;
    const box = d.marks[2].beats[1].notes[0].boxes[0];
    const svg = document.querySelector('[data-scan-source] svg');
    const m = svg.getScreenCTM();
    const pt = new DOMPoint(box.x + box.w / 2, box.y + box.h / 2).matrixTransform(m);
    return { x: pt.x, y: pt.y };
  });
  await p.page.mouse.click(target.x, target.y);
  await p.page.waitForTimeout(300);
  const picked = await p.page.innerText('[data-scan-inspector]');
  check(g, 'tapping a note on your picture selects it', /Bar 3 · note 2/.test(picked), picked.slice(0, 60));
  await p.page.getByRole('radio', { name: 'Follow' }).click();

  // Correct one note with the keyboard: the first note (B string, open) becomes fret 5.
  await p.page.click('[data-scan-tab] [data-tab-view]', { position: { x: 5, y: 5 } }).catch(() => undefined);
  await p.page.focus('[data-scan-tab] [data-tab-view]');
  const firstFret = () => p.page.evaluate(() => window.__ssaScan.draft.song.tracks[0].measures[0].beats[0].notes[0].fret);
  // Home: the first note of the piece.
  for (let i = 0; i < 40; i++) await p.page.keyboard.press('ArrowLeft');
  await p.page.keyboard.press('5');
  await p.page.waitForTimeout(400);
  const after = await firstFret();
  const fixedState = await p.page.evaluate(() => [...document.querySelectorAll('[data-scan-tab] g[data-beat="0:0"]')].map((n) => n.getAttribute('data-state')));
  check(g, 'typing 5 on the selected note sets its fret (and marks it on the tab)', after === 5 && fixedState.some((s) => s === 'target' || s === 'hit'), { after, fixedState });
  await p.page.keyboard.press('Control+z');
  await p.page.waitForTimeout(250);
  const undone = await firstFret();
  await p.page.keyboard.press('Control+Shift+z');
  await p.page.waitForTimeout(250);
  const redone = await firstFret();
  check(g, 'Ctrl+Z undoes it and Ctrl+Shift+Z brings it back', undone === 0 && redone === 5, { undone, redone });
  await p.page.keyboard.press('ArrowRight');
  await p.page.keyboard.press('Delete');
  await p.page.waitForTimeout(250);
  const deleted = await p.page.evaluate(() => window.__ssaScan.draft.song.tracks[0].measures[0].beats[1].notes.length);
  await p.page.keyboard.press('Control+z');
  await p.page.waitForTimeout(250);
  const back = await p.page.evaluate(() => window.__ssaScan.draft.song.tracks[0].measures[0].beats[1].notes.length);
  check(g, 'Delete removes the selected note (leaving a rest) and undo restores it', deleted === 0 && back === 1, { deleted, back });
  const barText = await p.page.innerText('[data-scan-bar-check]');
  check(g, 'the bar total is checked as you edit', /Bar 1: adds up/.test(barText), barText);

  // Save and open in the Player.
  await p.page.click('[data-scan-save]');
  await p.page.waitForSelector('[data-scan="saved"]', { timeout: 30000 });
  const saved = await p.page.evaluate(() => window.__ssaScan.saved);
  const lib = await p.page.evaluate(async (id) => {
    const m = await import('/src/core/library/index.ts');
    const s = await m.loadSong(id);
    return { fret: s.tracks[0].measures[0].beats[0].notes[0].fret, bars: s.bars.length, title: s.meta.title };
  }, saved.listing.id);
  check(g, 'saved to the library with the correction', lib.fret === 5 && lib.bars === 8 && /Ode to Joy/i.test(lib.title), lib);
  await p.page.waitForTimeout(600);
  await shot(p, 'desktop-saved');
  await p.page.click('[data-scan-open-player]');
  await p.page.waitForFunction((id) => location.hash === `#play--${id}`, saved.listing.id, { timeout: 15000 });
  await p.page.waitForSelector('main[data-route="play"]', { timeout: 30000 });
  await p.page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Ode to Joy'), null, { timeout: 60000 }).catch(() => undefined);
  const inPlayer = await p.page.evaluate(() => ({ route: document.querySelector('main')?.getAttribute('data-route'), text: document.querySelector('main')?.innerText.slice(0, 400) }));
  check(g, '"Play it now" opens the song in the Player', inPlayer.route === 'play' && /Ode to Joy/i.test(inPlayer.text), inPlayer);

  // Tab only, notation only (fingered by the app), bass tab.
  await startOver(p);
  const tabOnly = fx['tab-ode-ls-150:clean'];
  await upload(p, [tabOnly.file]);
  await waitLooked(p, 1);
  await readIt(p);
  const tc = compare(await draftBars(p), tabOnly.truth, 'frets');
  check(g, 'tab-only page: every fret on the right string', tc.recall === 1, tc);

  await startOver(p);
  const notationOnly = fx['ode-bravura-150:clean'];
  await upload(p, [notationOnly.file]);
  await waitLooked(p, 1);
  await readIt(p);
  const nc = compare(await draftBars(p), notationOnly.truth, 'midis');
  const info = await p.page.evaluate(() => ({ notationOnly: window.__ssaScan.draft.notationOnly, maxFret: Math.max(...window.__ssaScan.draft.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.fret)))) }));
  check(g, 'notation-only page: every pitch, fingered by the arranger in open position', nc.recall === 1 && info.notationOnly && info.maxFret <= 5, { ...nc, ...info });
  const note = await p.page.innerText('[data-scan-tab]');
  check(g, 'it says the strings and frets were chosen by the app', /No tab was printed/.test(note));
  // Song details: a new title and tempo, and the music moved up the neck (same pitches).
  const pitchesBefore = await p.page.evaluate(() => window.__ssaScan.draft.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.midi))));
  await p.page.click('[data-scan-details]');
  const sheet = p.page.getByRole('dialog');
  await sheet.waitFor({ timeout: 10000 });
  await sheet.getByLabel('Title').fill('Ode to Joy, my copy');
  await sheet.getByRole('radio', { name: /Up the neck/ }).click();
  await p.page.click('[data-scan-details-apply]');
  await p.page.waitForTimeout(500);
  const moved = await p.page.evaluate(() => {
    const d = window.__ssaScan.draft;
    const notes = d.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    return { title: d.song.meta.title, minFret: Math.min(...notes.map((n) => n.fret)), midis: notes.map((n) => n.midi) };
  });
  check(g, 'song details: renamed, and "Up the neck" fingers it higher with the same pitches', moved.title === 'Ode to Joy, my copy' && moved.minFret >= 4 && JSON.stringify(moved.midis) === JSON.stringify(pitchesBefore), { title: moved.title, minFret: moved.minFret });
  await p.page.click('[data-scan-play]');
  await p.page.waitForFunction(() => /Stop/.test(document.querySelector('[data-scan-play]')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => undefined);
  const playing = await p.page.innerText('[data-scan-play]');
  await p.page.click('[data-scan-play]');
  await p.page.waitForTimeout(300);
  const stopped = await p.page.innerText('[data-scan-play]');
  check(g, 'Play plays the reading from the selected bar, and stops', /Stop/.test(playing) && /Play/.test(stopped), { playing, stopped });

  await startOver(p);
  const bass = fx['bass-carlito-150:clean'];
  await upload(p, [bass.file]);
  await waitLooked(p, 1);
  await readIt(p);
  const bassInfo = await p.page.evaluate(() => ({ tuning: window.__ssaScan.draft.song.tuning, role: window.__ssaScan.draft.song.tracks[0].role, lines: window.__ssaScan.draft.tabLines }));
  check(g, 'a four-line staff is read as bass in E A D G (not guitar tuning)', JSON.stringify(bassInfo.tuning) === '[28,33,38,43]' && bassInfo.role === 'bass' && bassInfo.lines === 4, bassInfo);
  const bc = compare(await draftBars(p), bass.truth, 'frets');
  check(g, 'bass page: frets read', bc.recall >= 0.95, bc);

  // Chord symbols over tab are read with OCR into chords.
  await startOver(p);
  const chordsTab = fx['tab-open-chords-ins-150:clean'];
  await upload(p, [chordsTab.file]);
  await waitLooked(p, 1);
  await readIt(p);
  const chords = await p.page.evaluate(() => window.__ssaScan.draft.song.chords.map((c) => c.symbol));
  check(g, 'chord symbols printed over the tab are read into the song', ['C', 'G', 'Am', 'F', 'Em', 'D'].every((x) => chords.includes(x)), chords);

  check(g, 'no browser errors', p.errors.length === 0, p.errors.slice(0, 3));
  await p.close();
}

async function groupDegraded(browser, url, fx) {
  const g = 'degraded';
  const p = await newPage(browser, url);
  await openScan(p);
  for (const [key, min, by] of [['tab-ode-ls-150:scan', 0.97, 'frets'], ['linked-aura-lee-leland-150:photo-good', 0.95, 'frets'], ['page-tab-ls-150:photo-good', 0.9, 'frets']]) {
    await startOver(p);
    const f = fx[key];
    await upload(p, [f.file]);
    await waitLooked(p, 1);
    await readIt(p);
    const c = compare(await draftBars(p), f.truth, by);
    check(g, `${key}: ${Math.round(c.recall * 100)}% of the notes read right (want ${Math.round(min * 100)}%)`, c.recall >= min, c);
    if (key.startsWith('page-tab')) await shot(p, 'desktop-proof-photo');
  }
  // A bad phone photo: read honestly, with doubts marked and the hard picture said plainly.
  await startOver(p);
  const bad = fx['linked-aura-lee-leland-150:photo-bad'];
  await upload(p, [bad.file]);
  await waitLooked(p, 1);
  const look = await p.page.evaluate(() => window.__ssaScan.pages[0].look);
  check(g, 'the quick look on a bad photo finds the paper on the desk and the staves', !!look.paper && look.staves.length >= 2, { paper: look.paper, staves: look.staves.length });
  await readIt(p);
  const c = compare(await draftBars(p), bad.truth, 'frets');
  const left = Number(await p.page.getAttribute('[data-scan-left]', 'data-scan-left'));
  const head = await p.page.innerText('[data-scan="proof"] header');
  check(g, `bad photo: ${Math.round(c.recall * 100)}% read, ${left} things to check, and it says the picture was hard`, c.recall >= 0.4 && left > 0 && /hard picture|doubts/i.test(head), { recall: c.recall, left, head: head.slice(0, 120) });
  // "Next to check" walks to a doubt, "It's right" clears it.
  await p.page.click('[data-scan-next]');
  await p.page.waitForTimeout(300);
  const doubtShown = (await p.page.$('[data-scan-doubt]')) !== null || /Bar \d+:/.test(await p.page.innerText('[data-scan-inspector]'));
  check(g, '"Next to check" selects a doubtful note or a bar that does not add up', doubtShown);
  const confirm = await p.page.$('[data-scan-confirm]');
  if (confirm) {
    await confirm.click();
    await p.page.waitForTimeout(300);
    const left2 = Number(await p.page.getAttribute('[data-scan-left]', 'data-scan-left'));
    check(g, '"It\'s right" takes it off the list', left2 < left, { left, left2 });
  }
  // A bar holding several (missed bar lines) can be split into bars.
  const split = await p.page.evaluate(() => {
    const d = window.__ssaScan.draft;
    return d.song.bars.findIndex((b, i) => d.song.tracks[0].measures[i].beats.reduce((s, x) => s + x.duration, 0) >= 2 * (3840 * b.time.numerator) / b.time.denominator);
  });
  if (split >= 0) {
    const before = await p.page.evaluate(() => window.__ssaScan.draft.song.bars.length);
    // Select that bar from the picture side is hard to aim at; use the keyboard: move right until we are in it.
    await p.page.focus('[data-scan-tab] [data-tab-view]');
    for (let i = 0; i < 60; i++) {
      const at = await p.page.evaluate(() => document.querySelector('[data-scan-inspector]')?.textContent ?? '');
      if (new RegExp(`Bar ${split + 1}\\b`).test(at)) break;
      await p.page.keyboard.press('ArrowRight');
    }
    const btn = await p.page.$('[data-scan-split]');
    if (btn) {
      await btn.click();
      await p.page.waitForTimeout(300);
      const afterBars = await p.page.evaluate(() => window.__ssaScan.draft.song.bars.length);
      check(g, '"Split into bars" turns a bar with missed bar lines into several', afterBars > before, { before, afterBars });
    } else check(g, 'a bar holding several bars offers "Split into bars"', false, 'no split button');
  }
  await shot(p, 'desktop-proof-bad');
  check(g, 'no browser errors', p.errors.length === 0, p.errors.slice(0, 3));
  await p.close();
}

async function groupPages(browser, url, fx) {
  const g = 'pages';
  const p = await newPage(browser, url);
  await openScan(p);
  const a = fx['tab-pentatonic-jbm-150:clean'];
  const b = fx['tab-ode-ls-150:clean'];
  // Added in the wrong order, then put right.
  await upload(p, [b.file, a.file]);
  await waitLooked(p, 2);
  const labels = await p.page.evaluate(() => window.__ssaScan.pages.map((x) => x.label));
  await p.page.locator('[data-scan-page="1"] button[aria-label="Move earlier"]').click();
  await p.page.waitForTimeout(300);
  const labels2 = await p.page.evaluate(() => window.__ssaScan.pages.map((x) => x.label));
  check(g, 'pages can be reordered', labels2[0] === labels[1] && labels2[1] === labels[0], { labels, labels2 });
  await readIt(p);
  const bars = await draftBars(p);
  const c = compare(bars, [...a.truth, ...b.truth], 'frets');
  check(g, 'two pages read as one song, in the chosen order', c.drawnBars === a.truth.length + b.truth.length && c.recall >= 0.97, c);

  // Drop a picture on the screen, then paste another one.
  await startOver(p);
  const dropFile = async (file, how) => {
    const b64 = fs.readFileSync(file).toString('base64');
    await p.page.evaluate(async ({ b64, name, how }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const f = new File([bytes], name, { type: name.endsWith('.png') ? 'image/png' : 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(f);
      if (how === 'drop') {
        const el = document.querySelector('[data-scan="capture"]');
        el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
        el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      } else {
        document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      }
    }, { b64, name: path.basename(file), how });
  };
  await dropFile(a.file, 'drop');
  await waitLooked(p, 1);
  await dropFile(b.file, 'paste');
  await waitLooked(p, 2);
  const dropped = await p.page.evaluate(() => window.__ssaScan.pages.map((x) => x.look.kind));
  check(g, 'a picture dropped on the screen and one pasted both become pages', dropped.length === 2 && dropped.every((k) => k === 'tab'), dropped);
  // Cancel while reading: back to the pages, nothing lost.
  await p.page.click('[data-scan-read]');
  await p.page.waitForSelector('[data-scan-cancel]', { timeout: 15000 });
  await p.page.click('[data-scan-cancel]');
  await p.page.waitForSelector('[data-scan="capture"]', { timeout: 15000 });
  const kept = await p.page.evaluate(() => ({ phase: window.__ssaScan.phase, pages: window.__ssaScan.pages.length }));
  check(g, 'Cancel stops reading and keeps the pages', kept.phase === 'pages' && kept.pages === 2, kept);
  await readIt(p);
  check(g, 'reading again after a cancel works', (await draftBars(p)).length === a.truth.length + b.truth.length);

  // Crop and turn.
  await startOver(p);
  const photo = fx['linked-aura-lee-leland-150:photo-good'];
  await upload(p, [photo.file]);
  await waitLooked(p, 1);
  await p.page.click('[data-scan-page="0"] button[aria-label^="Look closer"]');
  await p.page.waitForSelector('[data-scan-crop]', { timeout: 10000 });
  await shot(p, 'desktop-review');
  const uncropped = await p.page.evaluate(() => window.__ssaScan.pages[0].width);
  await p.page.click('[data-scan-crop]');
  await p.page.click('[data-scan-crop-apply]');
  await p.page.waitForFunction((w) => window.__ssaScan.pages[0].width !== w, uncropped, { timeout: 30000 });
  await waitLooked(p, 1);
  const cropped = await p.page.evaluate(() => window.__ssaScan.pages[0].look);
  check(g, 'cropping to the paper keeps the music readable', cropped && cropped.staves.length === 4, cropped && cropped.staves.length);
  await p.page.keyboard.press('Escape');
  const size0 = await p.page.evaluate(() => [window.__ssaScan.pages[0].width, window.__ssaScan.pages[0].height]);
  await p.page.locator('[data-scan-page="0"] button[aria-label^="More for"]').click();
  await p.page.getByRole('menuitem', { name: 'Turn right' }).click();
  await p.page.waitForFunction((w) => window.__ssaScan.pages[0].width !== w, size0[0], { timeout: 30000 });
  await waitLooked(p, 1);
  const size1 = await p.page.evaluate(() => [window.__ssaScan.pages[0].width, window.__ssaScan.pages[0].height]);
  await p.page.locator('[data-scan-page="0"] button[aria-label^="More for"]').click();
  await p.page.getByRole('menuitem', { name: 'Turn left' }).click();
  await p.page.waitForFunction((w) => window.__ssaScan.pages[0].width !== w, size1[0], { timeout: 30000 });
  await waitLooked(p, 1);
  const back = await p.page.evaluate(() => window.__ssaScan.pages[0]);
  check(g, 'a page can be turned a quarter turn and back, and is looked at again', size1[0] === size0[1] && size1[1] === size0[0] && back.width === size0[0] && back.look.staves.length === 4, { size0, size1, back: [back.width, back.height, back.look.staves.length] });
  check(g, 'no browser errors', p.errors.length === 0, p.errors.slice(0, 3));
  await p.close();
}

async function makePdf(browser, html, file) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({ path: file, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  await ctx.close();
  return file;
}

const ASCII_TAB = ['Riverside Waltz (an exercise)', '', 'e|-----0-----|-----0-----|', 'B|---1---1---|---3---3---|', 'G|-2-------2-|-0-------0-|', 'D|-----------|-----------|', 'A|-3---------|-----------|', 'E|-----------|-3---------|'];

async function groupPdf(browser, url, fx) {
  const g = 'pdf';
  const linked = fx['linked-ode-bravura-150:clean'];
  const png = fs.readFileSync(linked.file).toString('base64');
  const musicPdf = await makePdf(browser, `<html><body style="margin:0"><img src="data:image/png;base64,${png}" style="width:100%"></body></html>`, path.join(FIX, 'engraved.pdf'));
  const textPdf = await makePdf(browser, `<html><body><pre style="font:13px 'DejaVu Sans Mono',monospace">${ASCII_TAB.join('\n')}</pre></body></html>`, path.join(FIX, 'typed-tab.pdf'));
  const p = await newPage(browser, url);
  await openScan(p);
  await upload(p, [musicPdf]);
  await waitLooked(p, 1);
  const pg = await p.page.evaluate(() => window.__ssaScan.pages[0]);
  check(g, 'an engraved PDF page is rendered with pdf.js and found to hold notation and tab', pg.look.kind === 'both' && !pg.pdfText, { kind: pg.look.kind });
  await readIt(p);
  const c = compare(await draftBars(p), linked.truth, 'frets');
  check(g, 'the PDF page reads like the picture: every note', c.recall === 1 && c.drawnBars === linked.truth.length, c);

  await startOver(p);
  await upload(p, [textPdf]);
  await p.page.waitForFunction(() => window.__ssaScan?.pages.length === 1, null, { timeout: 60000 });
  const tp = await p.page.evaluate(() => window.__ssaScan.pages[0]);
  check(g, 'a PDF with typed tab is read from its text layer (no OCR)', !!tp.pdfText && /e\|-----0-----\|/.test(tp.pdfText), tp.pdfText);
  await readIt(p);
  const tx = await p.page.evaluate(() => {
    const t = window.__ssaScan.text;
    const notes = t.reading.result.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => `${n.string}:${n.fret}`)));
    return { format: t.reading.format, notes, source: t.source };
  });
  check(g, 'the typed tab becomes a song with its frets', tx.format === 'ascii-tab' && tx.source === 'pdf' && ['5:3', '3:2', '2:1', '1:0', '6:3', '2:3'].every((x) => tx.notes.includes(x)), tx);
  check(g, 'no browser errors', p.errors.length === 0, p.errors.slice(0, 3));
  await p.close();
}

const CHORD_SHEET = [
  'Amazing Grace (traditional)',
  '',
  'G              C          G',
  'Amazing grace, how sweet the sound',
  'G                     D',
  'That saved a wretch like me',
  'G              C          G',
  'I once was lost, but now am found',
  'Em         D          G',
  'Was blind, but now I see',
];

async function groupText(browser, url) {
  const g = 'text';
  // A "photo" of a printed chord sheet: rendered in a typewriter face, saved as a JPEG.
  const ctx = await browser.newContext({ viewport: { width: 900, height: 560 }, deviceScaleFactor: 1.5 });
  const pg = await ctx.newPage();
  await pg.setContent(`<html><body style="margin:40px;background:#f4f1ea"><pre style="font:22px/1.5 'DejaVu Sans Mono',monospace;color:#1b1b1b">${CHORD_SHEET.join('\n')}</pre></body></html>`);
  const photo = path.join(FIX, 'chord-sheet-photo.jpg');
  await pg.screenshot({ path: photo, type: 'jpeg', quality: 85 });
  await ctx.close();

  const p = await newPage(browser, url);
  await openScan(p);
  await upload(p, [photo]);
  await waitLooked(p, 1);
  const kind = await p.page.evaluate(() => window.__ssaScan.pages[0].look.kind);
  check(g, 'a photo of a chord sheet is recognised as text', kind === 'text', kind);
  await readIt(p, 240000);
  const t = await p.page.evaluate(() => {
    const s = window.__ssaScan.text;
    return { source: s.source, format: s.reading?.format, chords: s.reading ? s.reading.result.song.chords.map((c) => c.symbol) : [], text: s.text, error: s.error };
  });
  // OCR is not perfect (a lone C can come back as G): most chords, in order, and the place to fix the rest.
  const want = ['G', 'C', 'G', 'D', 'G', 'C', 'G', 'Em', 'D', 'G'];
  const lcs = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    return dp[0][0];
  };
  const right = lcs(t.chords, want);
  check(g, `OCR reads it into a chord sheet: ${right} of ${want.length} chords in order`, t.source === 'ocr' && t.format === 'chord-sheet' && right >= 8, t);
  // Columns kept: the chords of the first line sit within two characters of where they were printed.
  const cols = (line) => [...line.matchAll(/\S+/g)].map((m) => m.index);
  const printed = cols(CHORD_SHEET[2]);
  const read = cols(t.text.split('\n').find((l) => /^[A-G]\S*\s{4,}/.test(l)) ?? '');
  check(g, 'the chords stay over their words (columns kept)', read.length === printed.length && read.every((c, i) => Math.abs(c - printed[i]) <= 2), { printed, read });
  await shot(p, 'desktop-text');
  // Fix a chord in the text and see the song follow.
  const area = p.page.locator('[data-scan-text] textarea, textarea[data-scan-text]').first();
  const fixed = t.text.replace(/^Em/m, 'Am');
  await area.fill(fixed);
  await p.page.waitForTimeout(1200);
  const chords2 = await p.page.evaluate(() => window.__ssaScan.text.reading?.result.song.chords.map((c) => c.symbol) ?? []);
  check(g, 'editing the text updates the song as you type', chords2.includes('Am') && !chords2.includes('Em'), chords2);

  // Paste an ASCII tab.
  await startOver(p);
  await p.page.click('[data-scan-paste]');
  await p.page.fill('[role="dialog"] textarea', ASCII_TAB.join('\n'));
  await p.page.click('[data-scan-paste-use]');
  await p.page.waitForFunction(() => window.__ssaScan?.phase === 'text' && window.__ssaScan.text?.reading, null, { timeout: 30000 });
  const pasted = await p.page.evaluate(() => {
    const s = window.__ssaScan.text;
    return { format: s.reading.format, bars: s.reading.result.song.bars.length, notes: s.reading.result.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes)).length };
  });
  check(g, 'a pasted ASCII tab opens as a song (2 bars, 12 notes)', pasted.format === 'ascii-tab' && pasted.bars === 2 && pasted.notes === 12, pasted);
  await p.page.click('[data-scan-save]');
  await p.page.waitForSelector('[data-scan="saved"]', { timeout: 30000 });
  const id = await p.page.evaluate(() => window.__ssaScan.saved.listing.id);
  await p.page.click('[data-scan-open-player]');
  await p.page.waitForSelector('main[data-route="play"]', { timeout: 30000 });
  check(g, 'saved and opened in the Player', await p.page.evaluate((x) => location.hash === `#play--${x}`, id));
  check(g, 'no browser errors', p.errors.length === 0, p.errors.slice(0, 3));
  await p.close();
}

/** The fake Claude: answers each page-reading question with the truth of the systems it was shown. */
function fakeClaude(arg) {
  const calls = [];
  window.__aiCalls = calls;
  const sample = async () => ({ text: '{}', truncated: false });
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 5000000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'] }, modelTiers: ['quick', 'default', 'complex'] });
  sample.json = async (input, opts) => {
    const prompt = typeof input === 'string' ? input : input[input.length - 1].content;
    calls.push({ images: opts?.images?.length ?? 0, prompt: prompt.slice(0, 200) });
    await new Promise((r) => setTimeout(r, 300));
    return /song sheet/.test(prompt) ? { text: arg.sheet } : arg.answer;
  };
  window.claude = { use: async (name) => (name === 'sample' ? sample : null) };
}

/** The AI's answer for a notation + tab page, from the ground truth (written pitch and tab). */
function aiAnswerFromTruth(truthJson) {
  const name = (n) => `${n.step}${n.alter > 0 ? '#'.repeat(n.alter) : n.alter < 0 ? 'b'.repeat(-n.alter) : ''}${n.octave}`;
  return {
    title: null,
    composer: null,
    tempo: null,
    systems: truthJson.systems.map((sys) => {
      const notation = sys.staves.find((s) => s.kind === 'notation');
      return {
        key: { fifths: truthJson.key.fifths },
        time: { beats: truthJson.time.num, beatValue: truthJson.time.den },
        measures: notation.measures.map((m) => ({
          chords: [],
          lyrics: null,
          doubts: null,
          events: m.events.map((e) => ({ rest: e.type === 'rest', duration: e.duration.value, dots: e.duration.dots, triplet: !!e.duration.tuplet, uncertain: false, notes: e.notes.map((n) => ({ pitch: name(n), string: n.string, fret: n.fret, tie: !!n.tieStart })) })),
        })),
      };
    }),
  };
}

async function groupAi(browser, url, fx) {
  const g = 'ai';
  const truthJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/core/omr/fixtures/linked-aura-lee-leland-150.json'), 'utf8'));
  const p = await newPage(browser, url, { init: fakeClaude, initArg: { answer: aiAnswerFromTruth(truthJson), sheet: CHORD_SHEET.join('\n') } });
  await openScan(p);
  // The helper is off until the learner turns it on: the screen says so and sends nothing.
  const bad = fx['linked-aura-lee-leland-150:photo-bad'];
  await upload(p, [bad.file]);
  await waitLooked(p, 1);
  await readIt(p);
  await p.page.waitForSelector('[data-scan-ai]', { timeout: 15000 });
  const offState = await p.page.getAttribute('[data-scan-ai]', 'data-scan-ai');
  const offText = await p.page.innerText('[data-scan-ai]');
  check(g, 'AI help off in Settings: it says what turning it on would do, links to Settings, sends nothing', offState === 'settings' && /Settings/.test(offText) && (await p.page.evaluate(() => window.__aiCalls.length)) === 0, { offState, offText });
  // Turn it on (as the learner would in Settings) and come back.
  await p.page.evaluate(async () => (await import('/src/core/progress/index.ts')).setPrefs({ ai: { enabled: true } }));
  await p.page.evaluate(() => history.back());
  await p.page.waitForSelector('[data-scan="capture"]', { timeout: 15000 });
  await p.page.getByRole('button', { name: 'Continue checking' }).click();
  await p.page.waitForSelector('[data-scan-ai="ready"]', { timeout: 15000 });
  const before = compare(await draftBars(p), bad.truth, 'frets');
  const leftBefore = Number(await p.page.getAttribute('[data-scan-left]', 'data-scan-left'));
  await p.page.click('[data-scan-ai-run]');
  const dialog = p.page.getByRole('alertdialog').or(p.page.getByRole('dialog'));
  await dialog.waitFor({ timeout: 10000 });
  const consent = await dialog.innerText();
  check(g, 'before anything is sent it asks, saying what is sent', /sends a picture of each line of music to Claude/.test(consent) && (await p.page.evaluate(() => window.__aiCalls.length)) === 0, consent.slice(0, 160));
  await p.page.getByRole('button', { name: 'Send and compare' }).click();
  await p.page.waitForFunction(() => window.__aiCalls.length > 0, null, { timeout: 30000 });
  await p.page.waitForFunction(() => !document.querySelector('[data-scan-ai="busy"]'), null, { timeout: 120000 });
  await p.page.waitForTimeout(500);
  const calls = await p.page.evaluate(() => window.__aiCalls);
  const msg = await p.page.innerText('[data-scan-ai]');
  const after = compare(await draftBars(p), bad.truth, 'frets');
  const leftAfter = Number(await p.page.getAttribute('[data-scan-left]', 'data-scan-left'));
  check(g, 'the picture goes to the AI with the reading prompt (images attached)', calls.length >= 1 && calls[0].images >= 1, calls);
  check(g, `its answer is merged by the reader's rules: ${Math.round(before.recall * 100)}% -> ${Math.round(after.recall * 100)}% right, ${leftBefore} -> ${leftAfter} to check`, after.recall >= before.recall && /agreed on \d+/.test(msg), { before: before.recall, after: after.recall, leftBefore, leftAfter, msg });
  await p.page.click('[data-scan-undo]');
  await p.page.waitForTimeout(300);
  const undone = compare(await draftBars(p), bad.truth, 'frets');
  check(g, 'Undo takes the AI reading back off', Math.abs(undone.recall - before.recall) < 1e-9, { undone: undone.recall, before: before.recall });
  await shot(p, 'desktop-ai');

  // Inside Claude there is no OCR: a photo of a chord sheet opens the text view saying so, and the
  // AI helper (asked first) types it out.
  await startOver(p);
  const photo = path.join(FIX, 'chord-sheet-photo.jpg');
  if (fs.existsSync(photo)) {
    await upload(p, [photo]);
    await waitLooked(p, 1);
    await p.page.click('[data-scan-read]');
    await p.page.waitForFunction(() => window.__ssaScan?.phase === 'text', null, { timeout: 60000 });
    const why = await p.page.innerText('[data-scan="text"]');
    check(g, 'no OCR inside Claude: the text view says so and offers the AI helper', /not part of this version/.test(why) && (await p.page.$('[data-scan-ai="ready"]')) !== null, why.slice(0, 200));
    const before2 = await p.page.evaluate(() => window.__aiCalls.length);
    await p.page.click('[data-scan-ai-run]');
    await p.page.getByRole('button', { name: 'Send the picture' }).click();
    await p.page.waitForFunction(() => window.__ssaScan?.text?.reading, null, { timeout: 60000 });
    const typed = await p.page.evaluate(() => ({ source: window.__ssaScan.text.source, chords: window.__ssaScan.text.reading.result.song.chords.map((c) => c.symbol).join(' ') }));
    const calls2 = await p.page.evaluate(() => window.__aiCalls.slice(-1)[0]);
    check(g, 'the AI helper types the sheet out from the picture into a chord sheet', typed.source === 'ai' && typed.chords === 'G C G D G C G Em D G' && calls2.images === 1 && (await p.page.evaluate(() => window.__aiCalls.length)) === before2 + 1, { typed, calls2 });
  }
  const relevant = p.errors.filter((e) => !/Failed to load resource/.test(e));
  check(g, 'no browser errors', relevant.length === 0, relevant.slice(0, 3));
  await p.close();
}

/**
 * What an independent review found broken, kept fixed: keys that did nothing until something was
 * clicked, work lost on leaving the screen or reloading, a progress bar that ran backwards, saving
 * that cut away notes or failed on an impossible fret, and phone layouts at 360 px and large text.
 */
async function groupReview(browser, url, fx) {
  const g = 'review';
  // Count the picture URLs the screen makes and frees.
  const p = await newPage(browser, url, {
    init: () => {
      const live = new Set();
      window.__liveUrls = live;
      const make = URL.createObjectURL.bind(URL);
      const free = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (o) => {
        const u = make(o);
        live.add(u);
        return u;
      };
      URL.revokeObjectURL = (u) => {
        live.delete(u);
        free(u);
      };
    },
  });
  await openScan(p);
  const menu = async (index, item) => {
    await p.page.locator(`[data-scan-page="${index}"]`).getByRole('button', { name: /^More for/ }).click();
    await p.page.getByRole('menuitem', { name: item }).click();
  };
  // A page removed while it is still being looked at, then put back: it is looked at again.
  await p.page.click('[data-scan-sample]');
  await p.page.waitForSelector('[data-scan-page="0"]');
  await menu(0, 'Remove this page');
  await p.page.getByRole('button', { name: 'Undo' }).click();
  await waitLooked(p, 1, 60000).catch(() => undefined);
  const restored = await p.page.evaluate(() => window.__ssaScan.pages.map((x) => !!x.look));
  check(g, 'a page put back with Undo is looked at, so Read does not wait forever', restored.length === 1 && restored[0] && (await p.page.isEnabled('[data-scan-read]')), restored);
  // Pictures are freed: a page turned twice, a page removed for good, then Start over.
  await startOver(p);
  await p.page.click('[data-scan-sample]');
  await waitLooked(p, 1);
  await menu(0, 'Turn right');
  await menu(0, 'Turn left');
  await waitLooked(p, 1);
  await menu(0, 'Remove this page');
  await p.page.waitForTimeout(300);
  await p.page.click('[data-scan-sample]');
  await waitLooked(p, 1);
  await startOver(p);
  await p.page.waitForTimeout(500);
  const leaked = await p.page.evaluate(() => window.__liveUrls.size);
  check(g, 'after Start over every picture the screen made is freed (removed and turned pages too)', leaked === 0, leaked);

  await p.page.click('[data-scan-sample]');
  await waitLooked(p, 1);
  // The progress bar only moves forward (the chord names are read after the music).
  await p.page.evaluate(() => {
    window.__progress = [];
    new MutationObserver(() => {
      const bar = document.querySelector('[data-scan="reading"] [role="progressbar"]');
      const v = bar ? Number(bar.getAttribute('aria-valuenow')) : NaN;
      if (Number.isFinite(v) && window.__progress[window.__progress.length - 1] !== v) window.__progress.push(v);
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  await readIt(p);
  const progress = await p.page.evaluate(() => window.__progress);
  check(g, 'the reading progress never runs backwards', progress.length >= 2 && progress.every((v, i) => i === 0 || v >= progress[i - 1]), progress);

  // Keys work straight after reading, before anything was clicked (focus is on the page body).
  const focus = await p.page.evaluate(() => document.activeElement?.tagName);
  await p.page.keyboard.press('ArrowRight');
  await p.page.keyboard.press('7');
  await p.page.waitForTimeout(400);
  const fret = await p.page.evaluate(() => window.__ssaScan.draft.song.tracks[0].measures[0].beats[1].notes[0].fret);
  check(g, 'arrow keys and digits work without clicking first', fret === 7, { focus, fret });

  // Leaving the screen keeps the reading and the change; reading again asks first.
  await p.page.evaluate(() => { location.hash = '#home'; });
  await p.page.waitForSelector('main[data-route="home"]', { timeout: 30000 });
  await p.page.evaluate(() => { location.hash = '#scan'; });
  await p.page.waitForSelector('[data-scan="capture"]', { timeout: 60000 });
  const back = await p.page.evaluate(() => ({ text: document.querySelector('main').innerText, continueIsPrimary: !!document.querySelector('[data-scan-continue]') }));
  check(g, 'leave the screen and come back: the reading is still there, "Continue checking" first', /is still here/.test(back.text) && back.continueIsPrimary, back.text.slice(0, 200));
  await p.page.click('[data-scan-read]');
  const asked = await p.page.getByRole('alertdialog').or(p.page.getByRole('dialog')).filter({ hasText: 'Read the pages again?' }).count();
  check(g, '"Read again" asks before replacing a reading with changes', asked === 1);
  await p.page.getByRole('button', { name: 'Keep my changes' }).click();
  await p.page.click('[data-scan-continue]');
  await p.page.waitForSelector('[data-scan="proof"]', { timeout: 30000 });
  const kept = await p.page.evaluate(() => window.__ssaScan.draft.song.tracks[0].measures[0].beats[1].notes[0].fret);
  check(g, '"Continue checking" brings the change back, with Undo', kept === 7 && (await p.page.isEnabled('[data-scan-undo]')), kept);

  // Turning the page after reading must not blank the picture beside the reading being checked.
  await p.page.evaluate(() => history.back());
  await p.page.waitForSelector('[data-scan="capture"]', { timeout: 30000 });
  await menu(0, 'Turn right');
  await waitLooked(p, 1);
  await p.page.click('[data-scan-continue]');
  await p.page.waitForSelector('[data-scan-source] svg image', { timeout: 30000 });
  const picture = await p.page.evaluate(async () => {
    const href = document.querySelector('[data-scan-source] svg image').getAttribute('href');
    try {
      return (await fetch(href)).ok;
    } catch {
      return false;
    }
  });
  check(g, 'after turning the page, the reading still shows the picture it was read from', picture);

  // A reload asks first while there are changes.
  let dialog = null;
  p.page.once('dialog', (d) => {
    dialog = d.type();
    void d.dismiss();
  });
  await p.page.reload({ timeout: 4000 }).catch(() => undefined);
  await p.page.waitForTimeout(300);
  check(g, 'a reload asks first and, when the learner stays, the work stays', dialog === 'beforeunload' && (await p.page.$('[data-scan="proof"]')) !== null, dialog);

  // Saving a bad photo keeps every note the reader found (bars that do not add up were cut before).
  await startOver(p);
  await upload(p, [fx['tab-rhythm-lsb-150:photo-bad'].file]);
  await waitLooked(p, 1);
  await readIt(p);
  const readNotes = await p.page.evaluate(() => window.__ssaScan.draft.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes)).length);
  await p.page.click('[data-scan-save]');
  await p.page.getByRole('button', { name: 'Save anyway' }).click();
  await p.page.waitForSelector('[data-scan="saved"]', { timeout: 30000 });
  const savedId = (await p.page.getAttribute('[data-scan-open-player]', 'href')).split('#play--')[1];
  const savedSong = await p.page.evaluate(async (id) => {
    const lib = await import('/src/core/library/index.ts');
    const song = await lib.loadSong(id);
    return { notes: song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes)).length, bars: song.bars.length };
  }, savedId);
  check(g, `a bad photo saved anyway keeps every note it read (${readNotes} read, ${savedSong.notes} saved)`, savedSong.notes === readNotes, { readNotes, savedSong });

  // A photo that read "9" "2" as fret 92: the fret is a marked guess on the neck, and the song saves.
  await startOver(p);
  await upload(p, [fx['ut-heavy-rhythm-t14:photo-good'].file]);
  await waitLooked(p, 1);
  await readIt(p);
  const frets = await p.page.evaluate(() => {
    const d = window.__ssaScan.draft;
    const marks = d.marks.flatMap((b) => b.beats.flatMap((x) => x.notes));
    return { max: Math.max(...d.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.fret)))), past: marks.filter((m) => /past the last fret/.test(m.reasons[0] ?? '')).length };
  });
  check(g, 'frets read past the last fret become marked guesses on the neck', frets.max <= 24 && frets.past > 0, frets);
  await p.page.click('[data-scan-save]');
  const anyway = p.page.getByRole('button', { name: 'Save anyway' });
  if (await anyway.count()) await anyway.click();
  const savedOk = await p.page.waitForSelector('[data-scan="saved"]', { timeout: 30000 }).then(() => true, () => false);
  check(g, 'that photo can be saved (the library refused it before)', savedOk);
  // Two saves earn a new level: the shell's dialog for it closes with Escape.
  for (let i = 0; i < 3 && (await p.page.$('[role="dialog"]')); i++) {
    await p.page.keyboard.press('Escape');
    await p.page.waitForTimeout(400);
  }
  await startOver(p);
  await p.page.waitForTimeout(500);
  const leakedAtEnd = await p.page.evaluate(() => window.__liveUrls.size);
  check(g, 'after readings, a turned page, saves and Start over, no picture is left behind', leakedAtEnd === 0, leakedAtEnd);
  check(g, 'desktop: no browser errors', p.errors.length === 0, p.errors.slice(0, 3));
  await p.close();

  // Pasted tab: it has no pages, so the way back after leaving is in the banner; tab text shows
  // every character (a font ligature drew "|-" as one glyph).
  {
    const t = await newPage(browser, url, { mobile: true });
    await openScan(t);
    await t.page.click('[data-scan-paste]');
    await t.page.getByRole('textbox', { name: 'Tab or chords' }).fill(ASCII_TAB.join('\n'));
    const ligPaste = await t.page.evaluate(() => getComputedStyle(document.querySelector('[role="dialog"] textarea')).fontVariantLigatures);
    await t.page.click('[data-scan-paste-use]');
    await t.page.waitForSelector('[data-scan="text"]', { timeout: 60000 });
    await t.page.getByRole('radio', { name: 'Text' }).click();
    const ligText = await t.page.evaluate(() => getComputedStyle(document.querySelector('[data-scan="text"] textarea')).fontVariantLigatures);
    check(g, 'tab text is shown without ligatures, in the paste sheet and the text view', ligPaste === 'none' && ligText === 'none', { ligPaste, ligText });
    await t.page.evaluate(() => { location.hash = '#home'; });
    await t.page.waitForSelector('main[data-route="home"]', { timeout: 30000 });
    await t.page.evaluate(() => { location.hash = '#scan'; });
    await t.page.waitForSelector('[data-scan="capture"]', { timeout: 60000 });
    const way = await t.page.$('[data-scan-continue]');
    if (way) await way.click();
    const back = await t.page.waitForSelector('[data-scan="text"]', { timeout: 15000 }).then(() => true, () => false);
    check(g, 'pasted text: leave and come back, "Continue checking" brings it back', !!way && back);
    check(g, 'pasted text: no browser errors', t.errors.length === 0, t.errors.slice(0, 3));
    await t.close();
  }

  // The narrowest phone, and a phone with text at 200 %: nothing scrolls sideways.
  for (const [tag, opts] of [['360 px', { viewport: { width: 360, height: 740 }, mobile: true }], ['text at 200 %', { mobile: true, init: () => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('font-size', '200%', 'important')) }]]) {
    const q = await newPage(browser, url, opts);
    await openScan(q);
    await q.page.click('[data-scan-sample]');
    await waitLooked(q, 1);
    const tray = await noHorizontalScroll(q);
    await readIt(q);
    const proof = await noHorizontalScroll(q);
    await q.page.click('[data-scan-save]');
    await q.page.waitForSelector('[data-scan="saved"]', { timeout: 30000 });
    await q.page.waitForTimeout(600);
    const saved = await noHorizontalScroll(q);
    check(g, `${tag}: the pages, the proofreader and the saved screen fit the width`, tray && proof && saved, { tray, proof, saved });
    check(g, `${tag}: no browser errors`, q.errors.length === 0, q.errors.slice(0, 3));
    await q.close();
  }
}

async function groupShots(browser, url, fx) {
  const g = 'shots';
  for (const [mobile, theme] of [[true, 'light'], [true, 'dark'], [false, 'light']]) {
    const tag = `${mobile ? 'phone' : 'desktop'}-${theme}`;
    const p = await newPage(browser, url, { mobile, theme });
    await openScan(p);
    await p.page.waitForTimeout(500);
    await shot(p, `${tag}-start`);
    check(g, `${tag}: the start fits the width`, await noHorizontalScroll(p));
    if (mobile) check(g, `${tag}: "Take a photo" is the first action`, (await p.page.$('[data-scan-camera]')) !== null);
    const file = fx['linked-aura-lee-leland-150:photo-good'].file;
    await upload(p, [file], { camera: mobile });
    await waitLooked(p, 1);
    await shot(p, `${tag}-pages`);
    await readIt(p, 240000, `${tag}-reading`);
    await shot(p, `${tag}-proof`);
    check(g, `${tag}: the proofreader fits the width`, await noHorizontalScroll(p));
    if (mobile) {
      await p.page.getByRole('radio', { name: 'Your sheet' }).click();
      await p.page.waitForTimeout(600);
      await shot(p, `${tag}-sheet`);
      await p.page.getByRole('radio', { name: 'Tab' }).click();
      const panel = await p.page.evaluate(() => document.querySelector('[data-scan-inspector]')?.getBoundingClientRect().height ?? 999);
      check(g, `${tag}: the correction panel leaves room for the music (${Math.round(panel)} px)`, panel < 260, panel);
      // Phone held sideways.
      await p.page.setViewportSize({ width: 844, height: 390 });
      await p.page.waitForTimeout(600);
      await shot(p, `${tag}-landscape`);
      check(g, `${tag}: sideways it still fits`, await noHorizontalScroll(p));
      await p.page.setViewportSize(VIEWPORTS.mobile);
    }
    await p.page.click('[data-scan-save]');
    await p.page.waitForSelector('[data-scan="saved"]', { timeout: 30000 });
    await p.page.waitForTimeout(900);
    await shot(p, `${tag}-saved`);
    check(g, `${tag}: no browser errors`, p.errors.length === 0, p.errors.slice(0, 3));
    await p.close();
  }
}

(async () => {
  const fx = await makeFixtures();
  await withApp({}, async ({ browser, url }) => {
    const groups = [['clean', groupClean], ['degraded', groupDegraded], ['pages', groupPages], ['pdf', groupPdf], ['text', groupText], ['ai', groupAi], ['review', groupReview], ['shots', groupShots]];
    for (const [name, fn] of groups) {
      if (!want(name)) continue;
      const t0 = Date.now();
      try {
        await fn(browser, url, fx);
      } catch (e) {
        check(name, 'ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
      }
      if (verbose) console.log(`  (${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  });
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  console.log(failures ? 'FAILED' : 'PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  console.log('FAILED');
  process.exit(1);
});
