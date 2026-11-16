#!/usr/bin/env node
/**
 * Browser check of the fretboard trainer (src/features/fretboard). Run:
 *   node e2e/fretboard.cjs [--verbose] [--shots] [--only screens,phone,desktop,every,address,sprint,learned,layout,mic,nomic,review,micrelease]
 *
 * Real Chromium, real Web Audio.
 *
 *  screens  the hub on a phone and a desktop: one h1, no sideways scroll, no console errors; the
 *           next step is step 1 for a new learner and links to it; ten steps, five drills, the neck
 *           map; a step's intro teaches with a picture; an address that names nothing lands on the hub
 *  phone    a whole step of the method (the low E string) played by tapping on a phone: the letter
 *           pad for "name it", the neck for "find it"; two answers wrong on purpose. Right answers
 *           say so and move on, a wrong one explains itself (what it is, from which landmark) and
 *           waits for "Next"; the summary shows the score earned, the step passes, "Next" leads to
 *           step 2; the progress store holds the round (skill, accuracy, the neck map, recents)
 *  desktop  "Name the note" with all twelve notes on a desktop, answered from the keyboard: letters,
 *           Shift for sharps, Space to show the answer, Enter to go on, Escape to leave
 *  every    "Find every one": tap every place a note lives, one wrong tap on the way
 *  address  a lesson's link sets a drill up: `--strings-6-5--note-c` stores the strings and asks
 *           only for C on them; `--note-f-sharp` asks one "find every F♯" question, then the summary
 *  sprint   the one-minute sprint counts down and counts the notes named
 *  layout   phone: the pad keys are at least 44 px and sit in the lower half; a phone held sideways
 *           shows frets 0 to 12 without scrolling and the pad without scrolling the page; desktop
 *           shows the keyboard letters on the keys
 *  learned  the last missing note of a string answered: the summary says the string is learned, the
 *           progress store marks fretboard:string-6 and the "One String Down" achievement unlocks
 *  mic      "Play it" with Chromium's fake microphone playing a WAV rendered by the audio module (a
 *           wrong note, then the right one, again and again): the wrong note is named, the right one
 *           is heard, the rounds count it (octave policy "exact pitch")
 *  nomic    without a microphone, "Play it" explains what is missing and offers the tap version,
 *           which starts at once and works
 *  review   cases that caught real bugs in the review: step 1's pad has no sharps; a miss draws the
 *           landmark its explanation names (and none when the note sits on one); a reload in the
 *           middle of a round keeps the neck map, and the hub heat map shows each place's answers;
 *           a round left part-way shows no "Best 0%"; a phone held sideways shows the whole
 *           explanation and "Next" after a miss
 *  micrelease  the microphone is released after "Play it", also when the learner leaves while it
 *           is still opening (fake devices, a slowed permission prompt)
 *
 * Prints one line per failed check (all with --verbose) and PASSED or FAILED; exits non-zero on failure.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { withApp, loadTs, VIEWPORTS, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const shots = argv.includes('--shots');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',') : null;
const wants = (group) => !only || only.includes(group);

const ONBOARDED = { 'ssa:shell.onboarding': '{"skipped":true}' };
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];
const OUT = path.join(ROOT, 'e2e', 'out');

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail !== '' ? `  (${String(detail).slice(0, 500)})` : ''}`);
  return !!pass;
}

/** A browser context shaped like the harness's own, with storage seeded before the app starts. */
async function open(browser, url, { mobile = false, viewport, theme = 'dark', seed = {}, permissions = [] } = {}) {
  const vp = viewport || VIEWPORTS[mobile ? 'mobile' : 'desktop'];
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: theme, hasTouch: mobile, isMobile: mobile, permissions });
  await context.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
  }, { ...ONBOARDED, ...seed });
  const page = await context.newPage();
  return wrap(page, url, context, vp);
}

function wrap(page, url, context, viewport) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((b) => b.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  const goto = async (hash) => {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route]', { timeout: 30000 });
    await page.waitForFunction(() => {
      const main = document.querySelector('main[data-route]');
      return !!main && main.childElementCount > 0 && !main.querySelector('[data-shell-fallback]');
    }, null, { timeout: 45000 });
    await page.evaluate(async () => {
      window.__fb = (await import('/src/features/fretboard/ui/debug.ts')).fretboardDebug;
      window.__progress = await import('/src/core/progress/index.ts');
    });
    await page.waitForTimeout(300);
  };
  const shot = async (name, full = false) => {
    if (!shots) return;
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, `fretboard-${name}.png`), fullPage: full });
  };
  const takeErrors = () => errors.splice(0, errors.length);
  const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return { page, context, goto, shot, takeErrors, sideways, viewport, close: () => context.close() };
}

/** The question on screen, from the trainer's debug record. */
const question = (page) => page.evaluate(() => window.__fb.question);
/** Wait until question number `index` (0-based) is on screen and open. */
async function waitQuestion(page, index, timeout = 20000) {
  await page.waitForFunction((i) => window.__fb.question && window.__fb.question.index === i && document.querySelector('[data-fb-round]')?.getAttribute('data-phase') === 'asking', index, { timeout });
  return question(page);
}
const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const cellLabel = (p) => (p.fret === 0 ? `string ${p.string}, open` : `string ${p.string}, fret ${p.fret}`);
/** Pitch class at a place in standard tuning. */
const pcAt = (p) => ([64, 59, 55, 50, 45, 40][p.string - 1] + p.fret) % 12;

/** Answer the open question right or wrong by tapping (pad or neck). Returns what was asked. */
async function answerByTap(page, q, right) {
  if (q.kind === 'name') {
    const pc = right ? q.pc : NATURALS.find((n) => n !== q.pc && Math.abs(n - q.pc) > 1) ?? (q.pc + 2) % 12;
    await page.locator(`[data-fb-key="${pc}"]`).click();
    return;
  }
  if (q.kind === 'every') {
    for (const t of q.targets) await page.locator(`[data-fb-board] button[aria-label="${cellLabel(t)}"]`).click();
    return;
  }
  const targets = q.targets && q.targets.length ? q.targets : [q.pos];
  let at = targets[0];
  if (!right) {
    // Another note on the same string.
    const string = q.string ?? at.string;
    for (let f = 1; f <= 11; f++) {
      const cand = { string, fret: (at.fret + f) % 12 };
      if (pcAt(cand) !== q.pc) {
        at = cand;
        break;
      }
    }
  }
  await page.locator(`[data-fb-board] button[aria-label="${cellLabel(at)}"]`).click();
}

// ---------------------------------------------------------------------------------------------
// screens
// ---------------------------------------------------------------------------------------------
async function screens(browser, url) {
  for (const mobile of [true, false]) {
    const tag = mobile ? 'phone' : 'desktop';
    const s = await open(browser, url, { mobile });
    try {
      await s.goto('fretboard');
      const h1 = await s.page.locator('main h1').allTextContents();
      check('screens', `${tag}: hub has one h1 "Fretboard"`, h1.length === 1 && h1[0] === 'Fretboard', h1.join(' | '));
      check('screens', `${tag}: no sideways scroll`, (await s.sideways()) <= 1);
      const next = await s.page.getAttribute('[data-fb-next-step]', 'data-fb-next-step');
      const href = await s.page.getAttribute('[data-fb-continue-button]', 'href');
      check('screens', `${tag}: a new learner starts at step 1`, next === 'open-strings' && /#fretboard--stage--open-strings$/.test(href || ''), `${next} ${href}`);
      check('screens', `${tag}: ten steps, five drills, a neck map`, (await s.page.locator('[data-fb-step]').count()) === 10 && (await s.page.locator('[data-fb-drill]').count()) === 5 && (await s.page.locator('[data-fb-map]').count()) === 1);
      await s.shot(`hub-${tag}`, true);
      await s.goto('fretboard--stage--octaves-4-and-3');
      const intro = await s.page.locator('main').innerText();
      check('screens', `${tag}: a step teaches before it asks (octave shapes, computed for the tuning)`, /two strings up, two frets up/.test(intro) && /G at fret 3 becomes G at fret 5/.test(intro), intro.slice(0, 300));
      check('screens', `${tag}: the step draws its shapes on a neck`, (await s.page.locator('main svg[role="img"]').count()) >= 1);
      await s.shot(`intro-${tag}`);
      await s.goto('fretboard--nothing-here');
      await s.page.waitForFunction(() => location.hash === '#fretboard', null, { timeout: 10000 }).catch(() => {});
      check('screens', `${tag}: an address that names nothing lands on the hub`, (await s.page.evaluate(() => location.hash)) === '#fretboard');
      const errs = s.takeErrors();
      check('screens', `${tag}: no console errors`, errs.length === 0, errs.join(' | '));
    } finally {
      await s.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// phone: a whole step by tapping
// ---------------------------------------------------------------------------------------------
async function phone(browser, url) {
  const s = await open(browser, url, { mobile: true });
  const { page } = s;
  try {
    await s.goto('fretboard--stage--string-6-naturals');
    await page.locator('[data-fb-start]').click();
    const kinds = new Set();
    const wrongAt = new Set([2, 7]);
    let explained = 0;
    let saidRight = 0;
    for (let i = 0; i < 12; i++) {
      const q = await waitQuestion(page, i);
      kinds.add(q.kind);
      const right = !wrongAt.has(i);
      await answerByTap(page, q, right);
      await page.waitForSelector(`[data-fb-feedback="${right ? 'ok' : 'bad'}"]`, { timeout: 5000 });
      const fb = await page.locator('[data-fb-feedback]').innerText();
      if (right && /^Right/.test(fb.trim())) saidRight++;
      if (!right) {
        // What it is, and how to work it out from a landmark you can see.
        const named = q.kind === 'name' ? /This is [A-G]/.test(fb) : /on this string: (open|fret \d+)/.test(fb);
        const anchored = /(open string|dot at fret \d+|double dot at fret 12|sits on the)/.test(fb);
        if (named && anchored) explained++;
        else console.log(`    feedback after a miss: ${fb.replace(/\s+/g, ' ')}`);
        if (i === 2) await s.shot('phone-miss');
        check('phone', `a miss waits for "Next" (question ${i + 1})`, (await page.locator('[data-fb-continue]').count()) === 1);
        await page.locator('[data-fb-continue]').click();
      } else if (i === 0) await s.shot('phone-right');
    }
    check('phone', 'the step mixes "name it" and "find it"', kinds.has('name') && kinds.has('find'), [...kinds].join(','));
    check('phone', 'right answers say so', saidRight === 10, `${saidRight} of 10`);
    check('phone', 'every miss names the note and works it out from a landmark', explained === 2, `${explained} of 2`);
    await page.waitForSelector('[data-fb-summary]', { timeout: 15000 });
    const summary = await page.locator('[data-fb-summary]').innerText();
    check('phone', 'the summary shows the score earned (10/12, 83%)', /83%/.test(summary) && /10\/12/.test(summary), summary.slice(0, 200));
    check('phone', 'the step passes and "Next" leads to step 3', /Step 2 passed/.test(summary) && /#fretboard--stage--string-5-naturals$/.test((await page.getAttribute('[data-fb-next]', 'href')) || ''));
    const store = await page.evaluate(() => {
      const st = window.__progress.getProgress();
      const skill = st.skills['fretboard:string-6-naturals'];
      const map = st.skills['fretboard:map'];
      return { attempts: skill?.attempts, best: skill?.bestAccuracy, mapData: map?.data, recent: st.recents.find((r) => r.route === 'fretboard'), stat: st.stats?.counters?.['fretboard.notes'] ?? st.stats?.['fretboard.notes'] };
    });
    check('phone', 'the progress store holds the round', store.attempts === 1 && Math.abs(store.best - 10 / 12) < 0.01, JSON.stringify({ a: store.attempts, b: store.best }));
    const tried = store.mapData && store.mapData.s && store.mapData.s['6'] ? store.mapData.s['6'].split(',').length : 0;
    check('phone', 'and the neck map of string 6', tried >= 5, JSON.stringify(store.mapData));
    check('phone', 'and a "continue" entry for this step', store.recent && store.recent.params.join('--') === 'stage--string-6-naturals', JSON.stringify(store.recent));
    await s.shot('phone-summary', true);
    // The hub now shows the next step and the map.
    await s.goto('fretboard');
    await s.shot('hub-after-phone', true);
    await page.locator('[data-fb-map]').getByRole('radio', { name: 'Speed' }).click();
    await page.waitForTimeout(300);
    const speedLabels = await page.locator('[data-fb-map] svg text').allTextContents();
    check('phone', "the map's speed view labels places with seconds", speedLabels.some((t) => /^\d+\.\d$/.test(t.trim())), speedLabels.slice(0, 20).join(' '));
    await page.locator('[data-fb-map]').scrollIntoViewIfNeeded();
    await s.shot('map-speed-phone');
    check('phone', 'the hub moves on to step 1 (still not passed) and marks step 2 passed', (await page.getAttribute('[data-fb-next-step]', 'data-fb-next-step')) === 'open-strings' && (await page.locator('[data-fb-step="string-6-naturals"] [class*="stepPassed"]').count()) === 1);
    const errs = s.takeErrors();
    check('phone', 'no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// desktop: name the note from the keyboard
// ---------------------------------------------------------------------------------------------
const LETTER = { 0: 'c', 2: 'd', 4: 'e', 5: 'f', 7: 'g', 9: 'a', 11: 'b' };
async function desktop(browser, url) {
  const s = await open(browser, url, { seed: { 'ssa:fretboard.settings': JSON.stringify({ v: 1, frets: [0, 12], strings: [1, 2, 3, 4, 5, 6], notes: 'all', findWhere: 'string', playOctaves: 'exact' }) } });
  const { page } = s;
  try {
    await page.goto(`${url}#home`);
    await page.evaluate(async () => (await import('/src/core/progress/index.ts')).setPrefs({ accidentals: 'sharps' }));
    await s.goto('fretboard--drill--name-the-note');
    await page.keyboard.press('Enter');
    let right = 0;
    for (let i = 0; i < 12; i++) {
      const q = await waitQuestion(page, i);
      if (i === 4) {
        await page.keyboard.press('Space');
        await page.waitForSelector('[data-fb-feedback="info"]', { timeout: 5000 });
        const fb = await page.locator('[data-fb-feedback]').innerText();
        check('desktop', 'Space shows the answer', /It is [A-G]/.test(fb), fb);
        await page.keyboard.press('Enter');
        continue;
      }
      // Natural: its letter; sharp: Shift + the letter below.
      const natural = LETTER[q.pc];
      const key = natural ? natural : `Shift+${LETTER[(q.pc + 11) % 12]}`;
      await page.keyboard.press(key);
      await page.waitForSelector('[data-fb-feedback="ok"], [data-fb-feedback="bad"]', { timeout: 5000 });
      if ((await page.getAttribute('[data-fb-feedback]', 'data-fb-feedback')) === 'ok') right++;
      else {
        console.log(`    key ${key} for ${q.name} was marked wrong`);
        await page.keyboard.press('Enter');
      }
    }
    check('desktop', 'letters and Shift name every note right from the keyboard', right === 11, `${right} of 11`);
    await page.waitForSelector('[data-fb-summary]', { timeout: 15000 });
    const sum = await page.locator('[data-fb-summary]').innerText();
    check('desktop', 'the summary counts the shown answer as a miss (11/12)', /11\/12/.test(sum), sum.slice(0, 160));
    // Escape leaves a round part-way and keeps what was answered.
    await page.locator('[data-fb-again]').click();
    await waitQuestion(page, 0);
    for (let i = 0; i < 3; i++) {
      const q = await waitQuestion(page, i);
      await page.keyboard.press(LETTER[q.pc] ?? `Shift+${LETTER[(q.pc + 11) % 12]}`);
      await page.waitForSelector('[data-fb-feedback="ok"]', { timeout: 5000 });
    }
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => location.hash === '#fretboard', null, { timeout: 10000 });
    const attempts = await page.evaluate(() => window.__progress.getProgress().skills['fretboard:name-the-note']?.attempts);
    check('desktop', 'Escape leaves the round and keeps it (as an unfinished attempt)', attempts === 2, `attempts ${attempts}`);
    const errs = s.takeErrors();
    check('desktop', 'no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// every: find every place a note lives
// ---------------------------------------------------------------------------------------------
async function every(browser, url) {
  const s = await open(browser, url);
  const { page } = s;
  try {
    await s.goto('fretboard--drill--find-every-note');
    await page.locator('[data-fb-start]').click();
    const q = await waitQuestion(page, 0);
    check('every', 'asks for every place of a note across the neck', q.kind === 'every' && q.targets.length >= 6, `${q.kind} ${q.targets?.length}`);
    // One wrong tap first.
    const wrong = { string: 1, fret: [1, 2, 3, 4, 5].find((f) => pcAt({ string: 1, fret: f }) !== q.pc) };
    await page.locator(`[data-fb-board] button[aria-label="${cellLabel(wrong)}"]`).click();
    await page.waitForSelector('[data-fb-feedback="bad"]', { timeout: 5000 });
    const fb = await page.locator('[data-fb-feedback]').innerText();
    check('every', 'a wrong tap names the note tapped and keeps the question open', /That one is/.test(fb) && (await page.getAttribute('[data-fb-round]', 'data-phase')) === 'asking', fb);
    for (const [i, t] of q.targets.entries()) {
      await page.locator(`[data-fb-board] button[aria-label="${cellLabel(t)}"]`).click();
      if (i === 1) {
        const txt = await page.locator('[data-fb-feedback]').innerText();
        check('every', 'each find is counted', new RegExp(`2 found, ${q.targets.length - 2} to go`).test(txt), txt);
      }
    }
    await page.waitForFunction(() => document.querySelector('[data-fb-round]')?.getAttribute('data-phase') === 'answered', null, { timeout: 5000 });
    const res = await page.evaluate(() => window.__fb.results[0]);
    check('every', 'all found with one wrong tap scores places ÷ (places + wrong taps)', Math.abs(res.score - q.targets.length / (q.targets.length + 1)) < 1e-6, JSON.stringify(res.score));
    await s.shot('every-desktop');
    const errs = s.takeErrors();
    check('every', 'no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// address: a lesson's link sets the drill up
// ---------------------------------------------------------------------------------------------
async function address(browser, url) {
  const s = await open(browser, url, { mobile: true });
  const { page } = s;
  try {
    // "Find C on strings 6 and 5": the strings are stored as the drill's settings, the note is this round's.
    await s.goto('fretboard--drill--find-the-note--strings-6-5--note-c');
    const h1 = (await page.locator('main h1').first().textContent()) || '';
    check('address', 'the title names the note', h1.trim() === 'Find the note: C', h1);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ssa:fretboard.settings') || '{}'));
    check('address', 'strings 6 and 5 are stored as the drill settings', JSON.stringify(stored.strings) === '[5,6]', JSON.stringify(stored));
    const how = (await page.locator('main').innerText()) || '';
    check('address', 'the intro says it is one note and which strings', /One note this round: C/.test(how) && /strings 5, 6/.test(how), how.slice(0, 400));
    check('address', 'no sideways scroll', (await s.sideways()) <= 1);
    await page.locator('[data-fb-start]').click();
    const asked = [];
    for (let i = 0; i < 4; i++) {
      const q = await waitQuestion(page, i);
      asked.push(q);
      await answerByTap(page, q, true);
      await page.waitForFunction(() => ['answered', 'asking'].includes(document.querySelector('[data-fb-round]')?.getAttribute('data-phase')), null, { timeout: 5000 });
      if ((await page.getAttribute('[data-fb-round]', 'data-phase')) === 'answered') await page.keyboard.press('Enter');
    }
    check('address', 'every question asks for C on string 6 or 5', asked.every((q) => q.kind === 'find' && q.pc === 0 && (q.string === 6 || q.string === 5)), JSON.stringify(asked.map((q) => [q.kind, q.name, q.string])));
    await page.keyboard.press('Escape');

    // "Find every F sharp": not a natural note, but named, it is the note of the round; one question.
    await s.goto('fretboard--drill--find-every-note--note-f-sharp--strings-1-2-3-4-5-6');
    const h1b = (await page.locator('main h1').first().textContent()) || '';
    check('address', 'find every F♯: the title', h1b.trim() === 'Find every one: F♯', h1b);
    await page.locator('[data-fb-start]').click();
    const q = await waitQuestion(page, 0);
    check('address', 'find every F♯: asks for F♯ everywhere', q.kind === 'every' && q.pc === 6 && q.targets.length >= 6, `${q.kind} ${q.pc} ${q.targets?.length}`);
    await answerByTap(page, q, true);
    await page.waitForFunction(() => document.querySelector('[data-fb-round]')?.getAttribute('data-phase') === 'answered', null, { timeout: 5000 });
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-passed]', { timeout: 10000 });
    check('address', 'find every F♯: one question, then the summary', (await page.evaluate(() => window.__fb.results.length)) === 1);
    const errs = s.takeErrors();
    check('address', 'no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// sprint
// ---------------------------------------------------------------------------------------------
async function sprint(browser, url) {
  const s = await open(browser, url, { mobile: true });
  const { page } = s;
  try {
    await s.goto('fretboard--drill--sprint');
    await page.locator('[data-fb-start]').click();
    for (let i = 0; i < 5; i++) {
      const q = await waitQuestion(page, i);
      await answerByTap(page, q, true);
    }
    await page.waitForTimeout(500);
    const score = await page.locator('[class*="sprintNumber"]').innerText();
    const ring = await page.locator('[class*="sprintTop"] [role="timer"], [class*="sprintTop"] [aria-label="Time left"]').count();
    check('sprint', 'the sprint counts notes named and shows a clock', score.trim() === '5' && ring >= 1, `score ${score}, clock ${ring}`);
    await s.shot('sprint-phone');
    const errs = s.takeErrors();
    check('sprint', 'no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// learned: a string's last note
// ---------------------------------------------------------------------------------------------
async function learned(browser, url) {
  // Every note of the low E string already learned except C at fret 8, which has two right answers.
  const parts = [];
  for (let f = 0; f < 12; f++) parts.push(f === 8 ? '8:2.2.15' : `${f}:3.3.15`);
  const s = await open(browser, url, { seed: { 'ssa:fretboard.settings': JSON.stringify({ v: 1, frets: [8, 8], strings: [6], notes: 'naturals', findWhere: 'string', playOctaves: 'exact' }) } });
  const { page } = s;
  try {
    await s.goto('fretboard');
    await page.evaluate((text) => window.__progress.setSkillData('fretboard:map', { v: 1, s: { 6: text } }), parts.join(','));
    await s.goto('fretboard--drill--find-the-note');
    await page.locator('[data-fb-start]').click();
    for (let i = 0; i < 12; i++) {
      const q = await waitQuestion(page, i);
      await answerByTap(page, q, true);
    }
    await page.waitForSelector('[data-fb-summary]', { timeout: 15000 });
    const text = await page.locator('[data-fb-summary]').innerText();
    check('learned', 'the summary says the low E string is learned', /You know every note on the low E string/.test(text), text.slice(0, 300));
    const st = await page.evaluate(() => ({ done: window.__progress.getProgress().skills['fretboard:string-6']?.completed }));
    check('learned', 'the progress store marks fretboard:string-6 completed', st.done === true, JSON.stringify(st));
    const ach = await page.evaluate(() => window.__progress.selectAchievements(window.__progress.getProgress()).list.find((a) => a.id === 'string-1'));
    check('learned', 'and "One String Down" is unlocked', !!ach && ach.unlocked === true, JSON.stringify(ach));
    await s.shot('learned-desktop', true);
    const errs = s.takeErrors();
    check('learned', 'no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------------------------
async function layout(browser, url) {
  // Phone, portrait: the pad sits where the thumb is.
  {
    const s = await open(browser, url, { mobile: true });
    try {
      await s.goto('fretboard--drill--name-the-note');
      await s.page.locator('[data-fb-start]').click();
      await waitQuestion(s.page, 0);
      const keys = await s.page.locator('[data-fb-key]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ h: r.height, w: r.width, top: r.top })));
      const vh = s.viewport.height;
      check('layout', 'phone: every key at least 44 px', keys.length === 7 && keys.every((k) => k.h >= 44 && k.w >= 44), JSON.stringify(keys[0]));
      check('layout', 'phone: the pad is in the lower half', keys.every((k) => k.top > vh / 2), `${keys[0]?.top} of ${vh}`);
      check('layout', 'phone: no sideways scroll in a round', (await s.sideways()) <= 1);
      check('layout', 'phone: no keyboard letters on the keys', (await s.page.locator('[data-fb-key] [class*="keyHint"]').count()) === 0);
      await s.shot('name-phone');
    } finally {
      await s.close();
    }
  }
  // Phone held sideways: the whole neck and the answer controls without scrolling, for both kinds of question.
  for (const [drill, what] of [['name-the-note', 'pad'], ['find-the-note', 'neck']]) {
    const s = await open(browser, url, { mobile: true, viewport: { width: 844, height: 390 }, seed: { 'ssa:fretboard.settings': JSON.stringify({ v: 1, frets: [0, 12], strings: [1, 2, 3, 4, 5, 6], notes: 'all', findWhere: 'string', playOctaves: 'exact' }) } });
    try {
      await s.goto(`fretboard--drill--${drill}`);
      await s.page.locator('[data-fb-start]').click();
      const q = await waitQuestion(s.page, 0);
      const fit = await s.page.evaluate(() => {
        const board = document.querySelector('[data-fb-board] [data-orientation] > div');
        const pad = document.querySelector('[data-fb-pad]') || document.querySelector('[data-fb-skip]');
        const r = pad ? pad.getBoundingClientRect() : null;
        return { scrolls: board ? board.scrollWidth - board.clientWidth : -1, padBottom: r ? r.bottom : -1, vh: innerHeight };
      });
      check('layout', `sideways (${what}): frets 0 to 12 without scrolling the neck`, fit.scrolls <= 1, JSON.stringify(fit));
      check('layout', `sideways (${what}): the answer controls are on screen`, fit.padBottom > 0 && fit.padBottom <= fit.vh + 1, JSON.stringify(fit));
      await s.shot(`sideways-${q.kind}`);
    } finally {
      await s.close();
    }
  }
  // Desktop: keyboard letters on the keys.
  {
    const s = await open(browser, url);
    try {
      await s.goto('fretboard--drill--name-the-note');
      await s.page.locator('[data-fb-start]').click();
      await waitQuestion(s.page, 0);
      check('layout', 'desktop: keyboard letters on the keys', (await s.page.locator('[data-fb-key] [class*="keyHint"]').count()) === 7);
      await s.shot('name-desktop');
    } finally {
      await s.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// mic: play it on the guitar (fake microphone)
// ---------------------------------------------------------------------------------------------
async function mic() {
  const audio = await loadTs('/src/core/audio/index.ts');
  const sr = 48000;
  // A wrong note (D4), then C4 (string 3, fret 5) again and again, each let ring for a moment.
  const notes = [{ time: 1.5, midi: 62, string: 3 }];
  for (let i = 0; i < 7; i++) notes.push({ time: 3.2 + i * 1.7, midi: 60, string: 3 });
  const samples = audio.renderSequence(notes, { sampleRate: sr, seconds: 16 });
  const wav = path.join(os.tmpdir(), `ssa-fretboard-c4-${process.pid}.wav`);
  fs.writeFileSync(wav, audio.encodeWav(samples, sr, { bitDepth: 16 }));
  try {
    await withApp({ fakeAudio: `${wav}%noloop`, mobile: true }, async ({ page, context, url }) => {
      await context.addInitScript((entries) => {
        for (const [k, v] of Object.entries(entries)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
      }, { ...ONBOARDED, 'ssa:fretboard.settings': JSON.stringify({ v: 1, frets: [5, 5], strings: [3], notes: 'naturals', findWhere: 'string', playOctaves: 'exact' }) });
      const s = wrap(page, url, context, VIEWPORTS.mobile);
      await s.goto('fretboard--drill--play-the-note');
      const intro = await page.locator('main').innerText();
      check('mic', 'the octave policy is stated before starting', /exact pitch of that place on the neck/.test(intro));
      await page.locator('[data-fb-start]').click();
      const q = await waitQuestion(page, 0, 30000);
      const prompt = await page.locator('[data-fb-prompt]').innerText();
      check('mic', 'asks to play C on the G string, listening for C4', q.kind === 'play' && q.midis.join() === '60' && /Play C on the G string/.test(prompt) && /Listening for C4/.test(await page.locator('main').innerText()), `${prompt} ${JSON.stringify(q.midis)}`);
      await page.waitForSelector('[data-fb-listening]', { timeout: 15000 });
      const heardWrong = await page.waitForFunction(() => /That sounded like D/.test(document.querySelector('[data-fb-feedback]')?.textContent || ''), null, { timeout: 15000 }).then(() => true).catch(() => false);
      check('mic', 'a wrong note is named', heardWrong);
      await s.shot('mic-wrong');
      await page.waitForFunction(() => window.__fb.results.length >= 3, null, { timeout: 30000 }).catch(() => {});
      const res = await page.evaluate(() => window.__fb.results.map((r) => ({ kind: r.kind, right: r.right })));
      check('mic', 'the right note is heard, question after question', res.length >= 3 && res.every((r) => r.kind === 'play' && r.right), JSON.stringify(res));
      await s.shot('mic-heard');
      await page.locator('[data-fb-end]').click();
      await page.waitForFunction(() => location.hash === '#fretboard', null, { timeout: 10000 });
      const map = await page.evaluate(() => window.__progress.getProgress().skills['fretboard:map']?.data);
      check('mic', 'what was played is kept on the neck map (string 3, fret 5)', !!map && /(^|,)5:\d+\.\d+/.test(map.s?.['3'] || ''), JSON.stringify(map));
      const errs = s.takeErrors();
      check('mic', 'no console errors', errs.length === 0, errs.join(' | '));
    });
  } finally {
    fs.rmSync(wav, { force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// nomic: no microphone, the tap version
// ---------------------------------------------------------------------------------------------
async function nomic(browser, url) {
  const s = await open(browser, url, { mobile: true });
  const { page } = s;
  try {
    // A browser with no microphone at all.
    await s.context.addInitScript(() => {
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' }));
    });
    await s.goto('fretboard--drill--play-the-note');
    await page.locator('[data-fb-start]').click();
    const blocked = await page.getByText('Tap the notes instead').first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    const text = await page.locator('main').innerText();
    check('nomic', 'explains what is missing and offers the tap version', blocked && /No microphone found|microphone/i.test(text), text.slice(0, 300));
    await s.shot('nomic-phone');
    // "Tap the notes instead" starts the tap round at once: no second "Start" to find.
    await page.getByText('Tap the notes instead').first().click();
    const q = await waitQuestion(page, 0);
    check('nomic', 'the tap version starts at once and asks to find the note on its string', q.kind === 'find');
    await answerByTap(page, q, true);
    await page.waitForSelector('[data-fb-feedback="ok"]', { timeout: 5000 });
    check('nomic', 'and a tap answers it', true);
    const errs = s.takeErrors().filter((e) => !/NotFoundError|device not found/i.test(e));
    check('nomic', 'no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// review: the cases that caught real bugs in the independent review
// ---------------------------------------------------------------------------------------------
const LANDMARKS = new Set([0, 3, 5, 7, 9, 12, 15]);
const boardDesc = (page) => page.evaluate(() => document.querySelector('[data-fb-board] svg desc')?.textContent || '');
const feedbackText = async (page) => (await page.locator('[data-fb-feedback]').innerText()).replace(/\s+/g, ' ');

async function review(browser, url) {
  // Step 1 on a phone: seven letters, and a miss on the open string draws no other landmark.
  {
    const s = await open(browser, url, { mobile: true });
    const { page } = s;
    try {
      await s.goto('fretboard--stage--open-strings');
      await page.locator('[data-fb-start]').click();
      await waitQuestion(page, 0);
      check('review', 'step 1: the pad has the seven letters only (no sharp or flat can come up)', (await page.locator('[data-fb-key]').count()) === 7, String(await page.locator('[data-fb-key]').count()));
      let seen = false;
      for (let i = 0; i < 10 && !seen; i++) {
        const q = await waitQuestion(page, i);
        const open = q.pos.fret === 0;
        // Wrong on purpose with the next letter up: it sits a fret or two up, never on the dot at 3.
        if (open) await page.locator(`[data-fb-key="${NATURALS.find((n) => n > q.pc) ?? 0}"]`).click();
        else await answerByTap(page, q, true);
        await page.waitForSelector(`[data-fb-feedback="${open ? 'bad' : 'ok'}"]`, { timeout: 5000 });
        if (!open) continue;
        seen = true;
        const fb = await feedbackText(page);
        const desc = await boardDesc(page);
        check('review', 'a miss on an open string says so, and the board rings no other landmark', /It is the open string/.test(fb) && !/landmark/.test(desc), `${fb} | ${desc}`);
      }
      if (!seen) check('review', 'a miss on an open string says so, and the board rings no other landmark', false, 'no open string came up in ten questions');
    } finally {
      await s.close();
    }
  }
  // Step 2: a miss rings the landmark its explanation names.
  {
    const s = await open(browser, url, { mobile: true });
    const { page } = s;
    try {
      await s.goto('fretboard--stage--string-6-naturals');
      await page.locator('[data-fb-start]').click();
      let done = false;
      for (let i = 0; i < 12 && !done; i++) {
        const q = await waitQuestion(page, i);
        const target = q.kind === 'find' ? q.targets[0] : q.pos;
        const off = !LANDMARKS.has(target.fret);
        await answerByTap(page, q, !off);
        await page.waitForSelector(`[data-fb-feedback="${off ? 'bad' : 'ok'}"]`, { timeout: 5000 });
        if (!off) continue;
        done = true;
        const fb = await feedbackText(page);
        const m = /(?:The (?:double )?dot at fret (\d+)|The open string) is ([A-G])/.exec(fb);
        const desc = await boardDesc(page);
        const fret = m ? (m[1] ? Number(m[1]) : 0) : -1;
        const where = fret === 0 ? 'string 6 open' : `string 6 fret ${fret}`;
        // A wrong tap on the landmark itself stays drawn as the wrong tap.
        const tappedThere = new RegExp(`on ${where} \\([^)]*\\), miss`).test(desc);
        check('review', `the landmark in the explanation is the one ringed on the board (${q.kind})`, !!m && (desc.includes(`${m[2]} on ${where} (landmark)`) || tappedThere), `${fb} | ${desc}`);
      }
      if (!done) check('review', 'the landmark in the explanation is the one ringed on the board', false, 'no question off a landmark came up');
    } finally {
      await s.close();
    }
  }
  // A reload in the middle of a round keeps the answers; the hub heat map shows each place's answers.
  {
    const s = await open(browser, url, { mobile: true });
    const { page } = s;
    try {
      await s.goto('fretboard--stage--string-5-naturals');
      await page.locator('[data-fb-start]').click();
      const tally = new Map();
      for (let i = 0; i < 5; i++) {
        const q = await waitQuestion(page, i);
        const right = i !== 1 && i !== 3;
        await answerByTap(page, q, right);
        await page.waitForSelector(`[data-fb-feedback="${right ? 'ok' : 'bad'}"]`, { timeout: 5000 });
        // A right "find" is credited to the place tapped (the first target here), anything else to the place asked.
        const at = right && q.kind === 'find' && q.targets.length ? q.targets[0] : q.pos;
        const k = `${at.string}:${at.fret}`;
        const e = tally.get(k) || { n: 0, ok: 0, fret: at.fret };
        e.n++;
        if (right) e.ok++;
        tally.set(k, e);
        if (!right && i < 4) await page.locator('[data-fb-continue]').click();
      }
      const open = await page.evaluate(() => document.querySelector('[data-fb-round]') !== null && !document.querySelector('[data-fb-summary]'));
      await page.waitForTimeout(900);
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('main[data-route]', { timeout: 30000 });
      await page.evaluate(async () => {
        window.__progress = await import('/src/core/progress/index.ts');
      });
      const stored = await page.evaluate(() => window.__progress.getProgress().skills['fretboard:map']?.data?.s?.['5'] || '');
      const kept = [...tally.entries()].every(([k, e]) => new RegExp(`(^|,)${k.split(':')[1]}:${e.n}\\.${e.ok}\\.`).test(stored));
      check('review', 'a reload in the middle of a round keeps every answer on the neck map', open && kept, `round open: ${open}; ${stored} vs ${JSON.stringify([...tally])}`);
      await s.goto('fretboard');
      const mapDesc = await page.evaluate(() => document.querySelector('[data-fb-map] svg desc')?.textContent || '');
      const wrongPlaces = [];
      for (const [k, e] of tally) {
        const where = e.fret === 0 ? 'string 5 open' : `string 5 fret ${e.fret}`;
        if (!mapDesc.includes(`on ${where} (${e.ok} of ${e.n} right`)) wrongPlaces.push(`${k} ${e.ok}/${e.n}`);
      }
      check('review', 'the hub heat map shows each place with exactly its answers', wrongPlaces.length === 0, `${wrongPlaces.join(', ')} | ${mapDesc.slice(0, 400)}`);
      const errs = s.takeErrors();
      check('review', 'no console errors (reload)', errs.length === 0, errs.join(' | '));
    } finally {
      await s.close();
    }
  }
  // A round left part-way is an attempt, not a best: no "Best 0%" anywhere.
  {
    const s = await open(browser, url);
    const { page } = s;
    try {
      await s.goto('fretboard--drill--name-the-note');
      await page.keyboard.press('Enter');
      for (let i = 0; i < 3; i++) {
        const q = await waitQuestion(page, i);
        await page.keyboard.press(LETTER[q.pc] ?? `Shift+${LETTER[(q.pc + 11) % 12]}`);
        await page.waitForSelector('[data-fb-feedback="ok"]', { timeout: 5000 });
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => location.hash === '#fretboard', null, { timeout: 10000 });
      await page.waitForTimeout(300);
      const card = await page.locator('[data-fb-drill="name-the-note"]').innerText();
      check('review', 'hub: a round left part-way shows no "Best 0%"', !/Best/.test(card), card);
      await s.goto('fretboard--drill--name-the-note');
      const intro = await page.locator('main').innerText();
      check('review', 'intro: no "Best 0%" either', !/Best: 0%/.test(intro), intro.slice(0, 200));
    } finally {
      await s.close();
    }
  }
  // A phone held sideways: after a miss the whole explanation and "Next" are on screen.
  {
    const s = await open(browser, url, { mobile: true, viewport: { width: 844, height: 390 } });
    const { page } = s;
    try {
      await s.goto('fretboard--stage--string-6-naturals');
      await page.locator('[data-fb-start]').click();
      let checked = false;
      for (let i = 0; i < 6 && !checked; i++) {
        const q = await waitQuestion(page, i);
        if (q.kind !== 'find') {
          await answerByTap(page, q, true);
          await page.waitForSelector('[data-fb-feedback="ok"]', { timeout: 5000 });
          continue;
        }
        await answerByTap(page, q, false);
        await page.waitForSelector('[data-fb-continue]', { timeout: 5000 });
        await page.waitForTimeout(900);
        const fit = await page.evaluate(() => {
          const lines = [...document.querySelectorAll('[data-fb-feedback] > *')].map((e) => e.getBoundingClientRect().bottom);
          return { last: Math.max(...lines), next: document.querySelector('[data-fb-continue]').getBoundingClientRect().bottom, vh: innerHeight };
        });
        check('review', 'sideways: the whole explanation and "Next" are on screen after a miss', fit.last <= fit.vh + 1 && fit.next <= fit.vh + 1, JSON.stringify(fit));
        await s.shot('sideways-miss');
        checked = true;
      }
      if (!checked) check('review', 'sideways: the whole explanation and "Next" are on screen after a miss', false, 'no find question came up');
    } finally {
      await s.close();
    }
  }
}

/**
 * The microphone is released when "Play it" is left: after a round, and also when the learner
 * leaves while the microphone is still opening (the permission prompt is up).
 */
async function micRelease() {
  await withApp({ fakeDevices: true, mobile: true }, async ({ page, context, url }) => {
    await context.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
      // Every stream handed out, and a slow "permission prompt" when the test asks for one.
      window.__streams = [];
      const md = navigator.mediaDevices;
      const orig = md.getUserMedia.bind(md);
      md.getUserMedia = async (c) => {
        const delay = Number(sessionStorage.getItem('micDelay') || 0);
        if (delay) await new Promise((r) => setTimeout(r, delay));
        const st = await orig(c);
        window.__streams.push(st);
        return st;
      };
    }, ONBOARDED);
    const s = wrap(page, url, context, VIEWPORTS.mobile);
    const live = () => page.evaluate(() => window.__streams.flatMap((st) => st.getTracks()).filter((t) => t.readyState === 'live').length);
    const opened = () => page.evaluate(() => window.__streams.length);
    // Normal: listening, then the round's X.
    await s.goto('fretboard--drill--play-the-note');
    await page.locator('[data-fb-start]').click();
    await page.waitForSelector('[data-fb-listening]', { timeout: 20000 });
    check('micrelease', 'the microphone is open while listening', (await live()) >= 1, String(await live()));
    await page.locator('[data-fb-end]').click();
    await page.waitForFunction(() => location.hash === '#fretboard', null, { timeout: 10000 });
    await page.waitForTimeout(800);
    check('micrelease', 'ending the round releases the microphone', (await live()) === 0, `${await live()} live tracks`);
    // Leaving while the microphone is still opening.
    await page.evaluate(() => sessionStorage.setItem('micDelay', '1500'));
    await s.goto('fretboard--drill--play-the-note');
    const before = await opened();
    await page.locator('[data-fb-start]').click();
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      location.hash = '#fretboard';
    });
    await page.waitForTimeout(3500);
    const after = await opened();
    check('micrelease', 'leaving while the microphone opens leaves it closed', after > before && (await live()) === 0, `opened ${after - before}, live ${await live()}`);
    const errs = s.takeErrors();
    check('micrelease', 'no console errors', errs.length === 0, errs.join(' | '));
  });
}

/** Light-theme screenshots of the main screens (only with --shots). */
async function lightShots(browser, url) {
  if (!shots) return;
  for (const mobile of [true, false]) {
    const s = await open(browser, url, { mobile, theme: 'light' });
    try {
      await s.goto('fretboard');
      await s.shot(`hub-${mobile ? 'phone' : 'desktop'}-light`, true);
      await s.goto('fretboard--stage--roots-6-and-5');
      await s.shot(`intro-${mobile ? 'phone' : 'desktop'}-light`);
      await s.page.locator('[data-fb-start]').click();
      const q = await waitQuestion(s.page, 0);
      await s.shot(`round-${mobile ? 'phone' : 'desktop'}-light`);
      await answerByTap(s.page, q, false);
      await s.page.waitForSelector('[data-fb-feedback="bad"]', { timeout: 5000 });
      await s.shot(`miss-${mobile ? 'phone' : 'desktop'}-light`);
    } finally {
      await s.close();
    }
  }
}

withApp({}, async ({ browser, url }) => {
  const groups = [
    ['screens', screens],
    ['phone', phone],
    ['desktop', desktop],
    ['every', every],
    ['address', address],
    ['sprint', sprint],
    ['learned', learned],
    ['layout', layout],
    ['nomic', nomic],
    ['review', review],
    ['shots', lightShots],
  ];
  for (const [name, fn] of groups) {
    if (name !== 'shots' && !wants(name)) continue;
    const t = Date.now();
    try {
      await fn(browser, url);
    } catch (e) {
      check(name, 'ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e);
    }
    const mine = results.filter((r) => r.group === name);
    if (mine.length) console.log(`${mine.every((r) => r.pass) ? 'ok  ' : 'FAIL'}  ${name}: ${mine.filter((r) => r.pass).length}/${mine.length} checks (${Math.round((Date.now() - t) / 1000)} s)`);
  }
})
  .then(async () => {
    if (wants('mic')) {
      const t = Date.now();
      try {
        await mic();
      } catch (e) {
        check('mic', 'ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e);
      }
      const mine = results.filter((r) => r.group === 'mic');
      console.log(`${mine.every((r) => r.pass) ? 'ok  ' : 'FAIL'}  mic: ${mine.filter((r) => r.pass).length}/${mine.length} checks (${Math.round((Date.now() - t) / 1000)} s)`);
    }
    if (wants('micrelease')) {
      const t = Date.now();
      try {
        await micRelease();
      } catch (e) {
        check('micrelease', 'ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e);
      }
      const mine = results.filter((r) => r.group === 'micrelease');
      console.log(`${mine.every((r) => r.pass) ? 'ok  ' : 'FAIL'}  micrelease: ${mine.filter((r) => r.pass).length}/${mine.length} checks (${Math.round((Date.now() - t) / 1000)} s)`);
    }
    const failed = results.filter((r) => !r.pass);
    console.log(failed.length ? `FAILED (${failed.length} of ${results.length} checks)` : `PASSED (${results.length} checks)`);
    process.exit(failed.length ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    console.log('FAILED');
    process.exit(1);
  });
