#!/usr/bin/env node
/**
 * Browser check of the scanner's layout where an earlier review found it wanting, plus the
 * unsaved-draft recovery. Run: node e2e/scan-ux.cjs [--only start,proof,title,draft] [--verbose]
 *
 *   start   a phone held sideways (844 x 390): the start button is on screen without scrolling
 *   proof   the proofreader with text at 200 % (phone and desktop): no sideways scroll, the music
 *           keeps a usable share of the screen, Save and the correction panel stay reachable
 *   title   the song title in the proofreader is a button that opens the song details
 *   draft   an unsaved scan survives a reload (and a discarded tab): pages and reading come back
 *           after "Pick up where you left off", a change made before the reload included; "Start
 *           fresh" clears it with Undo; saving the song clears it
 *
 * Screenshots: e2e/out/scan-ux-*.png. Prints one line per check, then PASSED / FAILED.
 */
'use strict';
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
const want = (g) => !only || only.has(g);
const OUT = path.join(ROOT, 'e2e', 'out');
const SEED = { 'ssa:shell.onboarding': '{"skipped":true}' };

let failures = 0;
function check(group, name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${group}] ${name}${!ok || verbose ? (detail !== undefined ? `  -- ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '') : ''}`);
}

const BIG_TEXT = () => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('font-size', '200%', 'important'));

async function newPage(browser, url, opts = {}) {
  const context = opts.context ?? (await browser.newContext({
    viewport: opts.viewport ?? { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: opts.theme ?? 'dark',
    hasTouch: !!opts.mobile,
    isMobile: !!opts.mobile,
  }));
  if (!opts.context) {
    await context.addInitScript((items) => {
      try {
        if (localStorage.getItem('e2e:seeded') != null) return;
        for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
        localStorage.setItem('e2e:seeded', '1');
      } catch {
        /* no storage */
      }
    }, SEED);
    if (opts.init) await context.addInitScript(opts.init);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const goto = async (hash) => {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route]', { timeout: 60000 });
  };
  return { context, page, errors, goto, close: () => (opts.context ? page.close() : context.close()) };
}

const shot = (p, name) => p.page.screenshot({ path: path.join(OUT, `scan-ux-${name}.png`) });
const noSideScroll = (p) => p.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1);

async function openScan(p) {
  await p.goto('scan');
  await p.page.waitForSelector('[data-scan="capture"]', { timeout: 90000 });
}

async function sampleRead(p) {
  await p.page.click('[data-scan-sample]');
  await p.page.waitForFunction(() => {
    const s = window.__ssaScan;
    return s && s.pages.length >= 1 && s.pages.every((x) => x.look);
  }, null, { timeout: 120000 });
  await p.page.click('[data-scan-read]');
  await p.page.waitForFunction(() => {
    const s = window.__ssaScan;
    return s && s.phase === 'music' && s.draft;
  }, null, { timeout: 240000 });
  await p.page.waitForSelector('[data-scan="proof"]', { timeout: 30000 });
  await p.page.waitForTimeout(800);
}

/** Where an element is, relative to the window. */
const rectOf = (p, sel) => p.page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, vh: innerHeight, vw: innerWidth };
}, sel);

async function groupStart(browser, url) {
  const g = 'start';
  for (const [tag, viewport] of [['sideways phone 844x390', { width: 844, height: 390 }], ['sideways small phone 740x360', { width: 740, height: 360 }]]) {
    const p = await newPage(browser, url, { mobile: true, viewport });
    await openScan(p);
    await p.page.waitForTimeout(500);
    await shot(p, `start-${viewport.width}x${viewport.height}`);
    const r = await rectOf(p, '[data-scan-camera]');
    check(g, `${tag}: "Take a photo" is on screen without scrolling`, !!r && r.bottom <= r.vh && r.top >= 0, r);
    const sample = await rectOf(p, '[data-scan-sample]');
    check(g, `${tag}: the sample is within one short scroll`, !!sample && sample.top < sample.vh * 1.6, sample);
    check(g, `${tag}: nothing scrolls sideways`, await noSideScroll(p));
    check(g, `${tag}: no browser errors`, p.errors.length === 0, p.errors.slice(0, 3));
    await p.close();
  }
  // Upright phone and desktop keep the primary action on screen too.
  for (const [tag, viewport, mobile, sel] of [['phone 390x844', { width: 390, height: 844 }, true, '[data-scan-camera]'], ['desktop 1280x800', { width: 1280, height: 800 }, false, '[data-scan-choose]']]) {
    const p = await newPage(browser, url, { mobile, viewport });
    await openScan(p);
    const r = await rectOf(p, sel);
    check(g, `${tag}: the primary action is on screen`, !!r && r.bottom <= r.vh, r);
    await p.close();
  }
}

async function groupProof(browser, url) {
  const g = 'proof';
  for (const [tag, viewport, mobile] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 800 }, false]]) {
    const p = await newPage(browser, url, { mobile, viewport, init: BIG_TEXT });
    await openScan(p);
    await sampleRead(p);
    await shot(p, `proof-200-${tag}`);
    check(g, `${tag}, text at 200 %: nothing scrolls sideways`, await noSideScroll(p));
    const tab = await rectOf(p, '[data-scan-tab]');
    const panel = await rectOf(p, '[data-scan-inspector]');
    // The panel limits the music only when it sits under it (beside it, it does not).
    const under = panel && tab && panel.left < tab.right - 1 && panel.right > tab.left + 1 && panel.top > tab.top;
    const visibleMusic = tab ? Math.max(0, Math.min(tab.bottom, tab.vh, under ? panel.top : Infinity) - Math.max(tab.top, 0)) : 0;
    check(g, `${tag}, text at 200 %: the music keeps a good share of the screen (${Math.round(visibleMusic)} px of ${viewport.height})`, visibleMusic >= viewport.height * 0.4, { tab, panel });
    check(g, `${tag}, text at 200 %: the correction panel leaves room (${panel ? Math.round(panel.height) : '-'} px)`, !!panel && panel.height <= viewport.height * 0.45, panel);
    const save = await p.page.$('[data-scan-save]');
    const saveBox = save ? await save.boundingBox() : null;
    check(g, `${tag}, text at 200 %: "Save and play" is there and fits the width`, !!saveBox && saveBox.x >= 0 && saveBox.x + saveBox.width <= viewport.width + 1, saveBox);
    // Every toolbar control stays inside the window.
    const tools = await p.page.evaluate(() => [...document.querySelectorAll('[role="toolbar"] button')].map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, label: b.getAttribute('aria-label') || b.textContent.trim() }; }));
    const out = tools.filter((t) => t.l < -1 || t.r > viewport.width + 1);
    check(g, `${tag}, text at 200 %: every proofreading tool is inside the window`, out.length === 0, out);
    // The panel can still do its job: open it if it is folded; it shows the fret control.
    const folded = !!(await p.page.$('[data-scan-folded]'));
    if (folded) await p.page.click('[data-scan-panel-toggle]');
    await p.page.waitForTimeout(300);
    const panelText = await p.page.innerText('[data-scan-inspector]').catch(() => '');
    check(g, `${tag}, text at 200 %: the correction panel opens with its fret control${folded ? ' (one tap to unfold)' : ''}`, !(await p.page.$('[data-scan-folded]')) && /Fret|fret/.test(panelText), panelText.slice(0, 120));
    await shot(p, `proof-200-${tag}-panel`);
    check(g, `${tag}, text at 200 %: no browser errors`, p.errors.length === 0, p.errors.slice(0, 3));
    await p.close();
  }
  // Sideways phone at normal text: header and panel side by side.
  const p = await newPage(browser, url, { mobile: true, viewport: { width: 844, height: 390 } });
  await openScan(p);
  await sampleRead(p);
  await shot(p, 'proof-landscape');
  check(g, 'sideways phone: the proofreader fits the width', await noSideScroll(p));
  await p.close();
}

async function groupTitle(browser, url) {
  const g = 'title';
  for (const [tag, viewport, mobile] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 800 }, false]]) {
    const p = await newPage(browser, url, { mobile, viewport });
    await openScan(p);
    await sampleRead(p);
    const info = await p.page.evaluate(() => {
      const t = document.querySelector('[data-scan-title]');
      const btn = t?.closest('button') ?? (t?.tagName === 'BUTTON' ? t : null);
      return { isButton: !!btn, cursor: t ? getComputedStyle(btn ?? t).cursor : null, label: btn?.getAttribute('aria-label') ?? btn?.textContent ?? null };
    });
    check(g, `${tag}: the title is a button with a pointer cursor`, info.isButton && info.cursor === 'pointer', info);
    await p.page.click('[data-scan-title]');
    const opened = await p.page.getByRole('dialog').filter({ hasText: 'Title' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false);
    await shot(p, `title-${tag}`);
    check(g, `${tag}: tapping the title opens the song details`, opened);
    check(g, `${tag}: no browser errors`, p.errors.length === 0, p.errors.slice(0, 3));
    await p.close();
  }
}

async function groupDraft(browser, url) {
  const g = 'draft';
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  await context.addInitScript((items) => {
    try {
      if (localStorage.getItem('e2e:seeded') != null) return;
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
      localStorage.setItem('e2e:seeded', '1');
    } catch {
      /* no storage */
    }
  }, SEED);
  const p = await newPage(browser, url, { context });
  await openScan(p);
  await sampleRead(p);
  // A change, then the tab is reloaded (a phone that discards a background tab does the same).
  await p.page.keyboard.press('ArrowRight');
  await p.page.keyboard.press('7');
  await p.page.waitForTimeout(300);
  const before = await p.page.evaluate(() => {
    const s = window.__ssaScan;
    return { fret: s.draft.song.tracks[0].measures[0].beats[1].notes[0].fret, bars: s.draft.song.bars.length, title: s.draft.song.meta.title, pages: s.pages.length };
  });
  // The draft is written in the background shortly after a change.
  const stored = await p.page.waitForFunction(() => window.__ssaScanDraft?.state === 'saved', null, { timeout: 15000 }).then(() => true, () => false);
  check(g, 'the unsaved reading is kept on the device shortly after a change', stored, await p.page.evaluate(() => window.__ssaScanDraft ?? null));
  let asked = false;
  p.page.once('dialog', (d) => {
    asked = true;
    void d.accept();
  });
  await p.page.reload({ waitUntil: 'load' });
  check(g, 'with the draft kept, a reload does not need to ask first', !asked);
  await p.page.waitForSelector('[data-scan="capture"]', { timeout: 90000 });
  const offer = await p.page.waitForSelector('[data-scan-resume]', { timeout: 20000 }).then(() => true, () => false);
  await shot(p, 'draft-offer');
  const offerText = offer ? await p.page.innerText('[data-scan-resume]') : '';
  check(g, 'after a reload the screen offers to pick up where you left off', offer && /left off/i.test(offerText), offerText.slice(0, 160));
  const resumeBox = await rectOf(p, '[data-scan-resume-go]');
  check(g, 'the offer is on screen without scrolling', !!resumeBox && resumeBox.bottom <= resumeBox.vh, resumeBox);
  await p.page.click('[data-scan-resume-go]');
  await p.page.waitForSelector('[data-scan="proof"]', { timeout: 30000 });
  const after = await p.page.evaluate(() => {
    const s = window.__ssaScan;
    return { fret: s.draft.song.tracks[0].measures[0].beats[1].notes[0].fret, bars: s.draft.song.bars.length, title: s.draft.song.meta.title, pages: s.pages.length, picture: !!document.querySelector('[data-scan-source] svg image') || null };
  });
  check(g, 'the reading comes back as it was, the change included', after.fret === before.fret && after.bars === before.bars && after.title === before.title && after.pages === before.pages, { before, after });
  const undoable = await p.page.isEnabled('[data-scan-undo]');
  check(g, 'Undo still takes the change back after the reload', undoable);
  await p.page.getByRole('radio', { name: 'Your sheet' }).click().catch(() => undefined);
  const pic = await p.page.waitForSelector('[data-scan-source] svg image', { timeout: 10000 }).then(async (el) => {
    const href = await el.getAttribute('href');
    return p.page.evaluate(async (h) => (await fetch(h)).ok, href).catch(() => false);
  }, () => false);
  check(g, 'your picture comes back beside the reading', pic);
  await shot(p, 'draft-resumed');

  // "Start fresh": the offer goes, with Undo; a reload then offers nothing.
  await p.page.reload({ waitUntil: 'load' });
  await p.page.waitForSelector('[data-scan-resume]', { timeout: 60000 });
  await p.page.click('[data-scan-resume-discard]');
  const undoToast = await p.page.getByRole('button', { name: 'Undo' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  check(g, '"Start fresh" clears it and offers Undo', undoToast && !(await p.page.$('[data-scan-resume]')));
  await p.page.getByRole('button', { name: 'Undo' }).first().click();
  const back = await p.page.waitForSelector('[data-scan-resume]', { timeout: 10000 }).then(() => true, () => false);
  check(g, 'Undo brings the offer back', back);

  // Saving the song clears the draft: nothing is offered after the next reload.
  await p.page.click('[data-scan-resume-go]');
  await p.page.waitForSelector('[data-scan="proof"]', { timeout: 30000 });
  await p.page.click('[data-scan-save]');
  const anyway = p.page.getByRole('button', { name: 'Save anyway' });
  if (await anyway.count()) await anyway.click();
  await p.page.waitForSelector('[data-scan="saved"]', { timeout: 30000 });
  await p.page.waitForFunction(() => window.__ssaScanDraft?.state === 'cleared', null, { timeout: 15000 }).catch(() => undefined);
  await p.page.reload({ waitUntil: 'load' });
  await p.page.waitForSelector('[data-scan="capture"]', { timeout: 60000 });
  await p.page.waitForTimeout(2500);
  check(g, 'after saving the song, a reload offers no draft', !(await p.page.$('[data-scan-resume]')));

  // Pages alone (no reading yet) come back too.
  await p.page.click('[data-scan-sample]');
  await p.page.waitForFunction(() => window.__ssaScan?.pages.length === 1 && window.__ssaScan.pages[0].look, null, { timeout: 120000 });
  await p.page.waitForFunction(() => window.__ssaScanDraft?.state === 'saved', null, { timeout: 15000 }).catch(() => undefined);
  await p.page.reload({ waitUntil: 'load' });
  await p.page.waitForSelector('[data-scan-resume]', { timeout: 60000 });
  await p.page.click('[data-scan-resume-go]');
  const pagesBack = await p.page.waitForFunction(() => window.__ssaScan?.pages.length === 1 && window.__ssaScan.pages[0].look, null, { timeout: 60000 }).then(() => true, () => false);
  check(g, 'pages not read yet come back too, looked at again', pagesBack);
  check(g, 'no browser errors', p.errors.length === 0, p.errors.slice(0, 3));
  await context.close();
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const [name, fn] of [['start', groupStart], ['title', groupTitle], ['proof', groupProof], ['draft', groupDraft]]) {
      if (!want(name)) continue;
      try {
        await fn(browser, server.url);
      } catch (e) {
        check(name, 'ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(failures ? `FAILED (${failures})` : 'PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  console.log('FAILED');
  process.exit(1);
});
