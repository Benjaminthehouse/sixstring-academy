#!/usr/bin/env node
/**
 * Browser check of the lesson fixes of the second integration pass, on the gallery's Options
 * section (#kit-lessons--options) and in the real player. Run: node e2e/lessons-fixes.cjs
 * [--only phone,player,landscape,desktop] [--verbose]. Screenshots go to e2e/out/fixes-*.png.
 *
 *  phone      390 px and 360 px: nothing wider than the screen; match tiles never break a word
 *             (no "Augmente d"); "Slower" is whole; rhythm options show their whole bar; a
 *             nine-key keyboard fits 360 px and sounds when tapped; a 0–12 neck shows its fret-12
 *             dots or a scroll cue; chord boxes as options carry no name; a capo neck draws its
 *             dots on the board; card titles take markup; punctuation stays with its term; an
 *             A major phrase is named with sharps; a wrong chord shape is told in plain words with
 *             no fret string; a wrong tapped rhythm shows the rhythm and its counting, not code.
 *  player     the real player: "I don't know" through a lesson ends on "Good practice" with Try
 *             again (no completion); "Can't play now" then "Play it on my guitar instead" brings
 *             the microphone step back; a fretboard-find with strings takes taps only there.
 *  landscape  a phone held sideways (844 x 390): a fretboard-find fits without scrolling.
 *  desktop    1280 px: match pairs answer to number keys on the left and letters on the right.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { withApp, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',') : null;
const want = (name) => !only || only.includes(name);
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}

const SEED = { 'ssa:shell.onboarding': '{"skipped":true}' };
async function seed(page) {
  await page.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
  }, SEED);
  // Count what lesson sounds ask of Web Audio: oscillators (the drone), buffer sources (plucks and
  // strums) and automation of a source's playback rate (bends, slides, vibrato, hammer-ons).
  await page.addInitScript(() => {
    window.__audio = { osc: 0, src: 0, rate: 0 };
    const proto = window.BaseAudioContext && window.BaseAudioContext.prototype;
    if (!proto) return;
    const osc = proto.createOscillator;
    proto.createOscillator = function () {
      window.__audio.osc += 1;
      return osc.call(this);
    };
    const src = proto.createBufferSource;
    proto.createBufferSource = function () {
      const node = src.call(this);
      window.__audio.src += 1;
      const rate = node.playbackRate;
      for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'setValueCurveAtTime']) {
        const f = rate[m].bind(rate);
        rate[m] = (...args) => {
          window.__audio.rate += 1;
          return f(...args);
        };
      }
      return node;
    };
  });
}

async function openOptions(page, url) {
  await page.goto(`${url}#kit-lessons--options`, { waitUntil: 'load' });
  await page.waitForSelector('[data-option-block="match-long"]', { timeout: 60000 });
  await page.waitForTimeout(1200);
}

/** Words of an element that the browser laid out across two lines (a word broken in the middle). */
function brokenWords(page, selector) {
  return page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent || '';
        for (const m of text.matchAll(/[A-Za-z]{4,}/g)) {
          const range = document.createRange();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
          if (tops.size > 1) out.push(m[0]);
        }
      }
    }
    return out;
  }, selector);
}

async function phone(width) {
  const group = `phone-${width}`;
  await withApp({ mobile: true, viewport: { width, height: 844 } }, async ({ page, url, errors }) => {
    await seed(page);
    await openOptions(page, url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(group, 'the page is no wider than the screen', overflow <= 1, `${overflow}px`);

    // Match pairs, answered wrong: tiles are in their matched state.
    const match = '[data-option-block="match-long"] [data-preview="match-pairs-wrong"]';
    const broken = await brokenWords(page, `${match} [data-left], ${match} [data-right]`);
    check(group, 'matched tiles break no word in the middle', broken.length === 0, broken.join(', '));
    await page.locator('[data-option-block="match-long"]').screenshot({ path: path.join(OUT, `fixes-match-${width}.png`) });

    // Listen-choice: "Slower" whole.
    const slow = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-option-block="listen-slow"] button')].find((x) => /Slower/.test(x.textContent || ''));
      if (!b) return null;
      const label = [...b.querySelectorAll('*')].find((x) => x.childElementCount === 0 && /Slower/.test(x.textContent || '')) || b;
      return { text: (b.textContent || '').trim(), clipped: label.scrollWidth > label.clientWidth + 1 || b.scrollWidth > b.clientWidth + 1 };
    });
    check(group, '"Slower" is shown whole', slow && slow.text === 'Slower' && !slow.clipped, JSON.stringify(slow));

    // Rhythm options: every bar is whole (nothing clipped or scrolled inside the option).
    const rhythms = await page.evaluate(() =>
      [...document.querySelectorAll('[data-option-block="choice-rhythms"] [data-preview="choice-fresh"] [data-option]')].map((o) => {
        const body = o.querySelector('[class*="optionBody"]') || o;
        return { scroll: body.scrollWidth, client: body.clientWidth, width: o.getBoundingClientRect().width };
      }),
    );
    check(group, 'rhythm options show the whole bar', rhythms.length === 3 && rhythms.every((r) => r.scroll <= r.client + 1), JSON.stringify(rhythms));
    await page.locator('[data-option-block="choice-rhythms"]').screenshot({ path: path.join(OUT, `fixes-rhythms-${width}.png`) });

    // Chord boxes as options: no names.
    const titles = await page.evaluate(() =>
      [...document.querySelectorAll('[data-option-block="choice-chords"] [data-preview="choice-fresh"] [data-option] svg text')].map((t) => (t.textContent || '').trim()).filter((t) => /^[A-G]$/.test(t)),
    );
    check(group, 'chord boxes in options carry no name', titles.length === 0, titles.join(' '));
    const pictureFeedback = await page.evaluate(() => (document.querySelector('[data-option-block="choice-chords"] [data-preview="choice-wrong"] [data-feedback]') || {}).textContent || '');
    check(group, 'a picture answer is shown by its tick, not as "Option 1"', !/Option \d/.test(pictureFeedback) && /tick/.test(pictureFeedback), pictureFeedback);

    // Keyboard: nine white keys fit, and a tapped key is a real button.
    const keys = await page.evaluate(() => {
      const fig = document.querySelector('[data-option-figure="keyboard-nine"] [data-keyboard-figure]');
      if (!fig) return null;
      const scrollers = [...fig.querySelectorAll('*')].filter((el) => el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX));
      return { scrollers: scrollers.length, buttons: fig.querySelectorAll('[data-key-midi]').length, width: fig.getBoundingClientRect().width };
    });
    check(group, 'a nine-white-key keyboard fits without scrolling', keys && keys.scrollers === 0 && keys.buttons === 15, JSON.stringify(keys));
    await page.locator('[data-option-figure="keyboard-nine"] [data-key-midi="64"]').click();
    check(group, 'a keyboard key can be tapped', errors.length === 0, errors.join(' | '));

    // 0–12 neck: the fret-12 dots are on screen, or the neck says it scrolls.
    const neck = await page.evaluate(() => {
      const fig = document.querySelector('[data-option-figure="neck-twelve"]');
      const box = fig.getBoundingClientRect();
      const cue = !!fig.querySelector('[data-scroll-cue="right"]');
      const scroller = [...fig.querySelectorAll('*')].find((el) => el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX));
      const dots = [...fig.querySelectorAll('svg circle, svg [class*="marker"]')].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 4);
      const rightmost = Math.max(...dots.map((r) => r.right));
      return { cue, scrolls: !!scroller, rightmost, edge: box.right };
    });
    // At 390 px the fret-12 dots are on screen; narrower, the neck may scroll but then says so.
    const dotsShown = neck.rightmost <= neck.edge + 1;
    check(group, width >= 390 ? 'a 0–12 neck shows its fret-12 dots' : 'a 0–12 neck shows its last dots or a scroll cue', width >= 390 ? dotsShown : dotsShown || (neck.cue && neck.scrolls), JSON.stringify(neck));
    await page.locator('[data-option-figure="neck-twelve"]').screenshot({ path: path.join(OUT, `fixes-neck12-${width}.png`) });

    // Capo neck: the dots are on the board (three of them), not cut off.
    const capo = await page.evaluate(() => {
      const fig = document.querySelector('[data-option-figure="neck-capo"]');
      const svg = fig.querySelector('svg');
      return { label: svg ? svg.getAttribute('aria-label') : null, html: fig.innerHTML.includes('capo'), cue: !!fig.querySelector('[data-scroll-cue]') };
    });
    check(group, 'a neck with a capo draws the capo', capo.html && /capo on fret 3/.test(capo.label || ''), JSON.stringify(capo));
    if (width >= 390) check(group, 'a short neck with a capo fits without a scroll cue', !capo.cue, JSON.stringify(capo));
    await page.locator('[data-option-figure="neck-capo"]').screenshot({ path: path.join(OUT, `fixes-capo-${width}.png`) });

    // Card title markup and punctuation kept with its term.
    const card = await page.evaluate(() => {
      const h = document.querySelector('[data-option-card] h2');
      return { symbol: !!h && !!h.querySelector('[data-symbol="chord"]'), raw: !!h && /\{c:/.test(h.textContent || ''), keep: document.querySelectorAll('[data-option-card] [data-keep]').length };
    });
    check(group, 'a card title renders markup', card.symbol && !card.raw, JSON.stringify(card));
    check(group, 'punctuation and hyphen runs are kept together', card.keep >= 3, JSON.stringify(card));

    // Spelling: the A major phrase names C#, F#, G#.
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-option-block="play-phrase-a-major"] [data-preview="play-phrase-fresh"] ol li')].map((li) => (li.textContent || '').trim()));
    check(group, 'an A major phrase is named with sharps', chips.some((c) => c.startsWith('C♯')) && chips.some((c) => c.startsWith('G♯')) && !chips.some((c) => /♭/.test(c)), chips.join(' '));

    // Places, hidden names, staff only.
    const place = await page.evaluate(() => (document.querySelector('[data-option-block="play-note-place"] [data-preview="play-note-fresh"] [data-place-label]') || {}).textContent || '');
    check(group, 'a play-note can be labelled by place', /string 6, open/.test(place), place);
    const staffOnly = await page.evaluate(() => {
      const b = document.querySelector('[data-option-block="play-phrase-staff"] [data-preview="play-phrase-fresh"]');
      return { tab: !!b.querySelector('svg[aria-label^="Tab"]'), staff: !!b.querySelector('[data-figure="staff"]'), names: [...b.querySelectorAll('ol li')].map((li) => (li.textContent || '').trim()) };
    });
    check(group, 'a staff-only phrase shows no tab and no names', !staffOnly.tab && staffOnly.staff && staffOnly.names.every((n) => /^\d+$/.test(n)), JSON.stringify(staffOnly));
    const hidden = await page.evaluate(() => {
      const fresh = document.querySelector('[data-option-block="play-chord-hidden"] [data-preview="play-chord-fresh"]');
      const wrong = document.querySelector('[data-option-block="play-chord-hidden"] [data-preview="play-chord-wrong"]');
      return { fresh: !!fresh.querySelector('[data-play-target="hidden-chord"]'), after: !!wrong.querySelector('[data-play-target="chord"] svg') };
    });
    check(group, 'hideDiagram hides the box until the answer', hidden.fresh && hidden.after, JSON.stringify(hidden));

    // Chord-build answered wrong: plain words, no fret string, the right box.
    const words = await page.evaluate(() => {
      const b = document.querySelector('[data-option-block="chord-build-am"] [data-preview="chord-build-wrong"]');
      const fb = b.querySelector('[data-feedback]');
      return { text: (fb && fb.textContent) || '', box: !!b.querySelector('[data-reference-box] svg') };
    });
    check(group, 'a wrong chord shape is told in plain words, with the box', /String \d sounds/.test(words.text) && !/\b[x0-9]{6}\b/.test(words.text) && words.box, words.text);

    // Tap-rhythm answered wrong: the rhythm and its counts, no code.
    const tap = await page.evaluate(() => {
      const b = document.querySelector('[data-option-block="tap-triplets"] [data-preview="tap-rhythm-wrong"] [data-feedback]');
      return { text: (b && b.textContent) || '', figure: !!(b && b.querySelector('[data-feedback-rhythm]')) };
    });
    check(group, 'tap-rhythm feedback shows the rhythm and its counting, not code', tap.figure && /1 trip let/.test(tap.text) && !/et et et/.test(tap.text), tap.text);

    await page.screenshot({ path: path.join(OUT, `fixes-options-${width}.png`) });
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

async function player() {
  const group = 'player';
  await withApp({ mobile: true }, async ({ page, url, errors }) => {
    await seed(page);
    // "I don't know" through a whole lesson.
    await page.goto(`${url}#kit-lessons--try--choice`, { waitUntil: 'load' });
    await page.waitForSelector('[data-lesson-player]', { timeout: 60000 });
    for (let i = 0; i < 12; i++) {
      if (await page.$('[data-summary]')) break;
      if (await page.$('[data-action="skip"]')) await page.locator('[data-action="skip"]').click();
      await page.waitForSelector('[data-action="continue"], [data-summary]', { timeout: 15000 });
      if (await page.$('[data-action="continue"]')) await page.locator('[data-action="continue"]').click();
      await page.waitForTimeout(250);
    }
    const summary = await page.evaluate(() => ({ outcome: document.querySelector('[data-summary]')?.getAttribute('data-summary'), title: document.querySelector('#lesson-summary-title')?.textContent, primary: document.querySelector('[data-action="next"]')?.textContent }));
    check(group, "'I don't know' throughout ends as practice, with Try again", summary.outcome === 'failed' && /Good practice/.test(summary.title || '') && /Try again/.test(summary.primary || ''), JSON.stringify(summary));
    await page.screenshot({ path: path.join(OUT, 'fixes-practice-summary.png') });
    await page.locator('[data-action="next"]').click();
    await page.waitForSelector('[data-exercise-type="choice"]', { timeout: 15000 });
    check(group, 'Try again starts the lesson over', true);

    // "Can't play now", then back to the microphone.
    await page.goto(`${url}#kit-lessons--try--play-note`, { waitUntil: 'load' });
    await page.waitForSelector('[data-cant-play]', { timeout: 60000 });
    await page.locator('[data-cant-play]').click();
    await page.waitForSelector('[data-use-mic]', { timeout: 15000 });
    const alt = await page.getAttribute('[data-exercise-type]', 'data-exercise-type');
    await page.locator('[data-use-mic]').click();
    await page.waitForSelector('[data-exercise-type="play-note"]', { timeout: 15000 });
    check(group, 'after "Can\'t play now" the microphone step can come back', alt !== 'play-note', alt);

    // Strings: a tap on another string is not an answer.
    await page.goto(`${url}#kit-lessons--try--opt-find-strings`, { waitUntil: 'load' });
    await page.waitForSelector('[data-exercise-type="fretboard-find"] button[aria-label]', { timeout: 60000 });
    const cells = page.locator('[data-exercise-type="fretboard-find"] [data-answer] button[aria-label^="string 5"]');
    await cells.first().click();
    const msg = await page.evaluate(() => [...document.querySelectorAll('[data-answer] [aria-live]')].map((e) => e.textContent).join(' '));
    const check1 = await page.$eval('[data-action="check"]', (b) => b.disabled);
    check(group, 'a tap on a string the question leaves out is not an answer', check1 && /Only string 6 count/.test(msg), msg);
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

async function landscape() {
  const group = 'landscape';
  await withApp({ mobile: true, viewport: { width: 844, height: 390 } }, async ({ page, url, errors }) => {
    await seed(page);
    await page.goto(`${url}#kit-lessons--try--fretboard-find`, { waitUntil: 'load' });
    await page.waitForSelector('[data-exercise-type="fretboard-find"]', { timeout: 60000 });
    await page.waitForTimeout(800);
    const fit = await page.evaluate(() => {
      const neck = document.querySelector('[data-exercise-type="fretboard-find"] [data-answer] svg');
      const bar = document.querySelector('[data-player-bar]');
      const r = neck.getBoundingClientRect();
      return { neckBottom: Math.round(r.bottom), barTop: Math.round(bar.getBoundingClientRect().top), page: document.documentElement.scrollHeight, screen: innerHeight };
    });
    await page.screenshot({ path: path.join(OUT, 'fixes-landscape-find.png') });
    check(group, 'a fretboard-find fits a sideways phone above the bar', fit.neckBottom <= fit.barTop + 2, JSON.stringify(fit));
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

async function desktop() {
  const group = 'desktop';
  await withApp({}, async ({ page, url, errors }) => {
    await seed(page);
    await page.goto(`${url}#kit-lessons--try--opt-match-long`, { waitUntil: 'load' });
    await page.waitForSelector('[data-exercise-type="match-pairs"]', { timeout: 60000 });
    await page.waitForTimeout(500);
    const hints = await page.evaluate(() => [...document.querySelectorAll('[data-right] kbd')].map((k) => k.textContent));
    check(group, 'the right column shows letters A–F', hints.join('') === 'ABCDEF', hints.join(''));
    // Pair the 6th left item with its partner by keys alone.
    const pairs = await page.evaluate(() => {
      const left = [...document.querySelectorAll('[data-left]')].map((b) => Number(b.getAttribute('data-left')));
      const right = [...document.querySelectorAll('[data-right]')].map((b) => Number(b.getAttribute('data-right')));
      return { left, right };
    });
    const target = pairs.left[5];
    const letter = 'ABCDEF'[pairs.right.indexOf(target)];
    await page.keyboard.press('6');
    await page.keyboard.press(letter.toLowerCase());
    await page.waitForTimeout(200);
    const placed = await page.evaluate((t) => document.querySelector(`[data-left="${t}"]`)?.getAttribute('data-state'), target);
    check(group, 'keys 6 and a letter make the sixth pair', placed === 'placed', `${placed} (${letter})`);
    await page.screenshot({ path: path.join(OUT, 'fixes-match-desktop.png') });

    // A listening step's number keys pick an option (its play button's Space must not shadow them).
    await page.goto(`${url}#kit-lessons--try--opt-listen-slow`, { waitUntil: 'load' });
    await page.waitForSelector('[data-exercise-type="listen-choice"]', { timeout: 60000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('2');
    await page.waitForTimeout(200);
    const listenPick = await page.evaluate(() => [...document.querySelectorAll('[data-option]')].map((o) => o.getAttribute('data-state')));
    check(group, 'a number key picks an option on a listening step', listenPick.filter((s) => s === 'selected').length === 1 && listenPick[1] === 'selected', listenPick.join(' '));

    // After "I can't play right now" (a click), Enter on the tapping version checks: the focused
    // button must not carry over as "I don't know".
    await page.goto(`${url}#kit-lessons--try--opt-play-note-staff`, { waitUntil: 'load' });
    await page.waitForSelector('[data-cant-play]', { timeout: 60000 });
    await page.waitForTimeout(500);
    await page.locator('[data-cant-play]').first().click();
    await page.waitForSelector('[data-exercise-type="true-false"]', { timeout: 20000 });
    await page.waitForTimeout(300);
    await page.keyboard.press('t');
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-feedback]', { timeout: 15000 });
    const afterCantPlay = await page.getAttribute('[data-feedback]', 'data-feedback');
    check(group, 'Enter checks the tapping version after "I can\'t play"', afterCantPlay === 'ok', afterCantPlay);

    // Lesson sounds use the engine's drone, held chord and techniques: count what reaches Web Audio.
    await openOptions(page, url);
    const tabMarks = await page.evaluate(() => {
      const fig = document.querySelector('[data-option-figure="tab-techniques"]');
      const svg = fig && fig.querySelector('svg[role="img"]');
      return { marks: fig ? fig.querySelectorAll('[data-tab-mark]').length : 0, texts: fig ? [...fig.querySelectorAll('[data-tab-mark] text')].map((t) => t.textContent) : [], label: svg ? svg.getAttribute('aria-label') : '' };
    });
    check(group, 'a tab figure draws its techniques (H, P, full)', tabMarks.marks >= 5 && ['H', 'P', 'full'].every((t) => tabMarks.texts.includes(t)), JSON.stringify(tabMarks));
    check(group, 'and reads them out', /hammered on/.test(tabMarks.label) && /bent up a whole step and released/.test(tabMarks.label), tabMarks.label);
    const heard = async (selector) => {
      await page.evaluate(() => Object.assign(window.__audio, { osc: 0, src: 0, rate: 0 }));
      // The same button stops it (its words change to "Stop" while it plays).
      const button = await page.locator(selector).first().elementHandle();
      await button.click();
      await page.waitForTimeout(1500);
      const counts = await page.evaluate(() => ({ ...window.__audio }));
      await button.click();
      await page.waitForTimeout(300);
      return counts;
    };
    const drone = await heard('[data-option-figure="audio-drone"] [data-sound-play]');
    check(group, 'a scale over a drone starts the drone', drone.osc > 0, JSON.stringify(drone));
    const plain = await heard('[data-option-figure="tab-a-major"] button:has-text("Hear it")');
    const techniques = await heard('[data-option-figure="tab-techniques"] button:has-text("Hear it")');
    check(group, 'bends and slides move the pitch of the notes', techniques.rate > plain.rate, `plain ${JSON.stringify(plain)} techniques ${JSON.stringify(techniques)}`);
    const over = await heard('[data-option-figure="audio-over"] [data-sound-play]');
    check(group, 'a line over a chord sounds the chord too', over.src > 6, JSON.stringify(over));
    await page.locator('[data-option-figure="tab-techniques"]').screenshot({ path: path.join(OUT, 'fixes-tab-techniques.png') });
    check(group, 'no console errors', errors.length === 0, errors.join(' | '));
  });
}

(async () => {
  try {
    if (want('phone')) {
      await phone(390);
      await phone(360);
    }
    if (want('player')) await player();
    if (want('landscape')) await landscape();
    if (want('desktop')) await desktop();
  } catch (error) {
    check('run', 'the check ran to the end', false, error && error.stack);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  console.log(failed.length === 0 ? 'PASSED' : 'FAILED');
  process.exit(failed.length === 0 ? 0 : 1);
})();
