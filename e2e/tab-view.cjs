#!/usr/bin/env node
/**
 * Browser check for the engraved tab view (TabView in @/ui/music/tab) on #kit-music: drawing a
 * long song in tiles, scrolling, selection and loops with mouse and keyboard, and the play-along
 * cursor. Prints "all passed" and exits 0, or lists failures and exits 1.
 *
 *   node e2e/tab-view.cjs
 */
const { withApp } = require('./lib/harness.cjs');
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };
const demo = (t) => `[data-kit-group="tab"] [data-demo="${t}"]`;

withApp({ theme: 'dark', viewport: { width: 1280, height: 900 } }, async ({ page, goto, errors }) => {
  await goto('kit-music');
  await page.waitForSelector(demo('A long piece'), { timeout: 20000 });

  // ── long piece: virtualised, smooth scrolling ─────────────────────────────────
  const long = demo('A long piece');
  await page.$eval(long, (el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(800);
  const counts = await page.$eval(long, (el) => {
    const root = el.querySelector('[data-tab-view]');
    return { all: root.querySelectorAll(':scope > div > div[class]').length, drawn: root.querySelectorAll('[data-tile]').length, h: root.scrollHeight };
  });
  check(counts.drawn > 0 && counts.drawn < 20, `200 bars: ${counts.drawn} of ~${counts.all} system tiles drawn, content ${counts.h}px tall`);
  const perf = await page.$eval(long, async (el) => {
    const root = el.querySelector('[data-tab-view]');
    const deltas = [];
    let last = performance.now();
    const start = last;
    await new Promise((resolve) => {
      const step = (t) => {
        deltas.push(t - last);
        last = t;
        root.scrollTop += 60;
        if (t - start < 3000 && root.scrollTop + root.clientHeight < root.scrollHeight - 2) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    deltas.shift();
    deltas.sort((a, b) => a - b);
    const p = (q) => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * q))];
    return { frames: deltas.length, p50: p(0.5), p95: p(0.95), max: deltas[deltas.length - 1], end: root.scrollTop, drawn: root.querySelectorAll('[data-tile]').length };
  });
  check(perf.p95 < 40, `scrolling 200 bars: ${perf.frames} frames, p50 ${perf.p50.toFixed(1)} ms, p95 ${perf.p95.toFixed(1)} ms, max ${perf.max.toFixed(1)} ms; ${perf.drawn} tiles drawn at the end`);
  await page.waitForTimeout(300);
  const lastBar = await page.$eval(long, (el) => [...el.querySelectorAll('[data-tile] svg')].map((s) => s.getAttribute('aria-label')).pop());
  check(/200/.test(lastBar || ''), `the last system is drawn after scrolling to the end (${lastBar})`);

  // ── selection by mouse drag and keyboard ──────────────────────────────────────
  await page.$eval(long, (el) => (el.querySelector('[data-tab-view]').scrollTop = 0));
  await page.waitForTimeout(400);
  const box = await (await page.$(`${long} [data-tile="0"] svg`)).boundingBox();
  await page.mouse.move(box.x + 120, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 90, { steps: 8 });
  await page.mouse.move(box.x + 900, box.y + 90, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const sel = await page.$eval(long, (el) => [...el.querySelectorAll('div[class*="selection"]')].length);
  check(sel >= 1, `dragging across bars selects them (${sel} selection rects)`);
  await page.focus(`${long} [data-tab-view]`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const selAfterEsc = await page.$eval(long, (el) => el.querySelectorAll('div[class*="selection"]').length);
  check(selAfterEsc === 0, 'Escape clears the selection');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(150);
  const selKb = await page.$eval(long, (el) => el.querySelectorAll('div[class*="selection"]').length);
  check(selKb >= 1, 'Shift+arrows select bars from the keyboard');

  // ── play-along: cursor per frame without re-rendering the SVG ─────────────────
  const pa = demo('Play-along line');
  await page.$eval(pa, (el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  await page.$eval(pa, (el) => {
    const tiles = el.querySelector('[data-tab-view] > div');
    window.__mut = { nodes: 0, attrs: 0, cursorMoves: 0 };
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') window.__mut.nodes += m.addedNodes.length + m.removedNodes.length;
        else if (m.attributeName === 'style' && String(m.target.className).includes('cursor')) window.__mut.cursorMoves++;
        else window.__mut.attrs++;
      }
    }).observe(tiles, { subtree: true, childList: true, attributes: true });
  });
  const cursorX = () => page.$eval(pa, (el) => { const c = el.querySelector('div[class*="cursor"]'); return { t: c.style.transform, o: c.style.opacity }; });
  await (await page.$(`${pa} button:has-text("Play along")`)).click();
  await page.waitForTimeout(1500);
  const a = await cursorX();
  await page.waitForTimeout(800);
  const b = await cursorX();
  const mut = await page.evaluate(() => window.__mut);
  const xa = Number((a.t.match(/translate3d\(([\d.]+)px/) || [])[1]);
  const xb = Number((b.t.match(/translate3d\(([\d.]+)px/) || [])[1]);
  check(b.o === '1' && xb > xa, `the cursor moves while playing (${xa.toFixed(0)} -> ${xb.toFixed(0)} px)`);
  check(mut.cursorMoves > 60, `cursor moved ${mut.cursorMoves} times in ~2.3 s (per frame)`);
  check(mut.nodes < mut.cursorMoves / 2, `SVG nodes added/removed while playing: ${mut.nodes} (only when beats change state), attribute changes ${mut.attrs}`);
  const scrollLeft = await page.$eval(pa, (el) => el.querySelector('[data-tab-view]').scrollLeft);
  await (await page.$(`${pa} button:has-text("Pause")`)).click();
  const states = await page.$eval(pa, (el) => ({ hit: el.querySelectorAll('[data-state="hit"]').length, miss: el.querySelectorAll('[data-state="miss"]').length, target: el.querySelectorAll('[data-state="target"]').length, now: el.querySelectorAll('[data-now]').length }));
  check(states.hit > 0 && states.target > 0, `practice states shown: ${JSON.stringify(states)}`);
  check(scrollLeft >= 0, `line scroll position ${scrollLeft}`);

  // Seek: click a note in bar 2.
  await page.$eval(pa, (el) => (el.querySelector('[data-tab-view]').scrollLeft = 0));
  await page.waitForTimeout(300);
  const note = await page.$(`${pa} [data-beat="1:3"] text`);
  const nb = await note.boundingBox();
  await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.waitForTimeout(200);
  const seekNow = await page.$eval(pa, (el) => [...el.querySelectorAll('[data-now]')].map((n) => n.getAttribute('data-beat')));
  check(seekNow.includes('1:3'), `clicking a note seeks there (current beat ${seekNow[0]})`);

  // Loop handle: drag the end handle one bar to the right.
  const handle = await page.$(`${pa} button[data-edge="end"]`);
  const before = await handle.getAttribute('aria-label');
  const hb = await handle.boundingBox();
  const bar5 = await page.$eval(pa, (el) => {
    const svg = el.querySelector('[data-tile="0"] svg');
    return svg.getBoundingClientRect().width;
  });
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 30);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 200, hb.y + 30, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const after = await (await page.$(`${pa} button[data-edge="end"]`)).getAttribute('aria-label');
  check(before !== after, `dragging the loop end handle moves it ("${before}" -> "${after}")`);
  await (await page.$(`${pa} button[data-edge="end"]`)).focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  const afterKey = await (await page.$(`${pa} button[data-edge="end"]`)).getAttribute('aria-label');
  check(afterKey !== after, `arrow keys move a loop handle ("${afterKey}")`);
  void bar5;

  // Tap to loop: two taps set the range.
  await (await page.$(`${pa} [role="radio"]:has-text("Tap to loop")`)).click();
  const n1 = await (await page.$(`${pa} [data-beat="1:0"] text`)).boundingBox();
  const n2 = await (await page.$(`${pa} [data-beat="2:0"] text`)).boundingBox();
  await page.mouse.click(n1.x + 3, n1.y + 3);
  await page.waitForTimeout(150);
  await page.mouse.click(n2.x + 3, n2.y + 3);
  await page.waitForTimeout(200);
  const loopLabels = await page.$$eval(`${pa} button[data-edge]`, (bs) => bs.map((b) => b.getAttribute('aria-label')));
  check(loopLabels.some((l) => /starts at bar 2/.test(l)) && loopLabels.some((l) => /ends after bar 3/.test(l)), `two taps set the loop: ${loopLabels.join(' | ')}`);

  // ── snippet: play moves only the cursor and the current-beat marks ────────────
  const sn = demo('A snippet in lesson text');
  await page.$eval(sn, (el) => el.scrollIntoView({ block: 'center' }));
  await page.$eval(sn, (el) => {
    window.__snip = { nodes: 0, other: 0 };
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') window.__snip.nodes += m.addedNodes.length + m.removedNodes.length;
        else if (m.attributeName !== 'data-now') window.__snip.other++;
      }
    }).observe(el.querySelector('[data-tile]'), { subtree: true, childList: true, attributes: true });
  });
  await (await page.$(`${sn} button[aria-label="Play this example"]`)).click();
  await page.waitForTimeout(1500);
  const snip = await page.evaluate(() => window.__snip);
  check(snip.nodes === 0 && snip.other === 0, `snippet playback changes no SVG nodes (${JSON.stringify(snip)})`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `no horizontal page scroll (${overflow})`);
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
}).then(() => { console.log(failures ? `${failures} failed` : 'all passed'); process.exit(failures ? 1 : 0); }).catch((e) => { console.error(e); process.exit(1); });
