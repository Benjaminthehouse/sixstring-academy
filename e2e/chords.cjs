#!/usr/bin/env node
/**
 * Browser check of the Chords screen (#chords) in real Chromium. Run:
 *   node e2e/chords.cjs [--only group,group] [--verbose] [--no-shots]
 *
 * Groups:
 *   pages      chord pages open from their addresses on a phone and a desktop (#chords--g,
 *              #chords--f-sharp-m7, #chords--f-major, a slash chord, a voicing number, a skill-slug
 *              address): the right chord, several shapes, the easier alternative for F, finger tips,
 *              where it is used; arrows step through shapes, Space strums, Enter opens the trainer;
 *              no sideways scroll, no console errors
 *   library    the first-chords path, search by symbol (F#m7b5, Bb/D), by type and by root, and
 *              "I know this chord" ticking the path and My chords (a `chord:` skill in core/progress)
 *   identify   name that shape: opens named (C), taps on the neck build A minor and name it
 *   taps       a full one-minute round counted with taps: score, stars, the trend stored on the
 *              `chord-change:em-am` skill, one chord-change activity
 *   mic        a full one-minute round with a fake microphone playing strummed Em and Am (built from
 *              the pitch module's test signals) with wrong strums mixed in: exactly the clean changes
 *              are counted, the wrong ones are reported as not counted
 *   check      the ring-true check with a fake microphone: a chord with a dead string is held back
 *              with a hint naming the missing note; eight chords later the round ends
 *   miccheck   "Check with the mic" on a chord page: a strum with dead strings gets a hint naming the
 *              missing note, a clean strum passes and counts as chord practice (`chord:g`)
 *   timed      changes in time with the metronome, tapped on the change beats: most changes on time,
 *              the tempo for the next round goes up
 *   nomic      no microphone at all (as in the Claude viewer): choosing the microphone and pressing
 *              Start shows why it failed right where the learner is looking, and "Count with taps
 *              instead" switches to taps and starts cleanly (review: the reason used to render at the
 *              foot of the page, out of sight, so Start looked dead)
 *   layout     a phone held sideways keeps both chords and the tap button on screen during a round;
 *              text at 200 % causes no sideways scroll on a chord page; a dim7 formula reads 𝄫7; the
 *              "leaves out the fifth" line belongs to the shape that leaves it out (review findings)
 *   shots      screenshots in both themes on phone and desktop, written to e2e/out/chords-*.png
 *
 * A group that fails is run once more (the machine is shared; audio timing can slip under load).
 * Prints a line per group, then PASSED or FAILED (exit code 1).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withApp, loadTs, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];
const SKIP_ONBOARDING = { 'ssa:shell.onboarding': '{"skipped":true}' };

let results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: detail ? String(detail) : '' });
  if (verbose || !pass) console.log(`    ${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(context, entries = SKIP_ONBOARDING) {
  await context.addInitScript((items) => {
    try {
      for (const [k, v] of Object.entries(items)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
    } catch {
      /* no storage: the app copes */
    }
  }, entries);
}

async function open(opts, fn) {
  return withApp({ settle: 300, ...opts }, async (ctx) => {
    await seed(ctx.context);
    return fn(ctx);
  });
}

async function go(page, goto, ...route) {
  await goto(...route);
  await page.waitForSelector('[data-chord-page], [data-library], [data-trainer], [data-name-shape], [data-my-chords]', { timeout: 45000 });
  await page.waitForTimeout(300);
}

const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
function noErrors(errors, label = 'no console errors') {
  const real = errors.filter((e) => !BENIGN.some((b) => b.test(e)));
  check(label, real.length === 0, real.join(' | '));
}
const progress = (page) => page.evaluate(async () => (await import('/src/core/progress/index.ts')).getProgress());

// ---------------------------------------------------------------------------------------------
// Fake microphone recordings built from the pitch module's test signals
// ---------------------------------------------------------------------------------------------

const SR = 48000;
let sig = null;
let voicings = null;
async function loadSig() {
  sig ??= await loadTs('/src/core/pitch/index.ts');
  voicings ??= await loadTs('/src/features/chords/model/voicings.ts');
  return sig;
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
function midiOf(symbol) {
  return [...voicings.defaultVoicing(symbol).midi].sort((a, b) => a - b);
}

/**
 * parts: { strum: midi[], dur } | { silence: s }. Room noise 40 dB under the playing; the file is
 * padded with quiet hiss to `total` seconds so the fake microphone never runs out mid-round.
 */
async function makeRecording(name, parts, total) {
  const s = await loadSig();
  const chunks = [];
  let seed = 3;
  for (const p of parts) {
    if (p.silence) chunks.push(s.silence(p.silence, SR));
    else chunks.push(s.strum({ freqs: p.strum.map(hz), sampleRate: SR, duration: p.dur ?? 1.4, attackNoise: 0.2, amplitude: 0.5, seed: seed++ }));
  }
  let x = s.concat(...chunks);
  if (total && x.length < total * SR) x = s.concat(x, s.silence(total - x.length / SR, SR));
  x = s.addNoise(x, 40, 11);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chords-e2e-'));
  const file = path.join(dir, `${name}.wav`);
  fs.writeFileSync(file, Buffer.from(s.encodeWav(x, SR, { bitDepth: 16 })));
  return { file, fakeAudio: `${file}%noloop`, seconds: x.length / SR };
}

// ---------------------------------------------------------------------------------------------

async function pages() {
  const cases = [
    { route: ['chords', 'g'], symbol: 'G' },
    { route: ['chords', 'f-sharp-m7'], symbol: 'F#m7' },
    { route: ['chords', 'f-major'], symbol: 'F' },
    { route: ['chords', 'bb-major-over-d'], symbol: 'Bb/D' },
    { route: ['chords', 'c-major', '2'], symbol: 'C', voicing: 2 },
    { route: ['chords', 'b-flat-m7'], symbol: 'Bbm7' },
    { route: ['chords', 'c-7sharp9'], symbol: 'C7#9' },
  ];
  for (const mobile of [true, false]) {
    await open({ mobile }, async ({ page, goto, errors }) => {
      const tag = mobile ? 'phone' : 'desktop';
      for (const c of cases) {
        await go(page, goto, ...c.route);
        const got = await page.getAttribute('[data-chord-page]', 'data-chord-page');
        check(`${tag}: #${c.route.join('--')} opens ${c.symbol}`, got === c.symbol, got);
        const shapes = await page.locator('[data-index]').count();
        check(`${tag}: ${c.symbol} shows several shapes`, shapes >= 3, `${shapes}`);
        if (c.voicing) {
          const pressed = await page.getAttribute('[data-index][aria-pressed="true"]', 'data-index');
          check(`${tag}: the address picks shape ${c.voicing}`, Number(pressed) === c.voicing - 1, pressed);
        }
        check(`${tag}: ${c.symbol} has finger tips for a change`, (await page.locator('[data-change-tips]').count()) === 1);
        const over = await sideways(page);
        check(`${tag}: ${c.symbol} no sideways scroll`, over <= 1, `${over}px`);
      }
      // F: the easier alternatives (small F, Fmaj7, capo).
      await go(page, goto, 'chords', 'f-major');
      const alts = await page.locator('[data-alternatives] h3').allTextContents();
      check(`${tag}: F offers the small F and Fmaj7`, alts.some((t) => /small F/.test(t)) && alts.some((t) => /Fmaj7/.test(t)), alts.join(' | '));
      check(`${tag}: F opens on the small F (xx3211)`, (await page.getAttribute('[data-voicing]', 'data-voicing'))?.endsWith('xx3211'), await page.getAttribute('[data-voicing]', 'data-voicing'));
      if (!mobile) {
        const before = await page.getAttribute('[data-voicing]', 'data-voicing');
        await page.locator('h1').click();
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(250);
        const after = await page.getAttribute('[data-voicing]', 'data-voicing');
        check('desktop: → steps to the next shape', before !== after, `${before} -> ${after}`);
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(250);
        check('desktop: ← steps back', (await page.getAttribute('[data-voicing]', 'data-voicing')) === before);
        await page.keyboard.press('Space');
        await page.waitForTimeout(200);
        const scrolled = await page.evaluate(() => window.scrollY);
        check('desktop: Space strums instead of scrolling the page', scrolled === 0, `${scrolled}`);
        await page.keyboard.press('Enter');
        await page.waitForSelector('[data-trainer][data-phase="setup"]', { timeout: 20000 });
        check('desktop: Enter opens the trainer with F and a partner', /chord-change:.*f/.test((await page.getAttribute('[data-trainer]', 'data-skill')) ?? ''), await page.getAttribute('[data-trainer]', 'data-skill'));
      }
      noErrors(errors, `${tag}: no console errors`);
    });
  }
}

async function library() {
  await open({ mobile: false }, async ({ page, goto, errors }) => {
    await go(page, goto, 'chords');
    const path = await page.locator('[data-library] [data-chord]').evaluateAll((els) => els.slice(0, 9).map((e) => e.getAttribute('data-chord')));
    check('the path starts Em Am E A D G C Dm F', path.join(' ') === 'Em Am E A D G C Dm F', path.join(' '));
    await page.fill('[data-library] input[type="search"]', 'F#m7b5');
    await page.waitForTimeout(300);
    check('search "F#m7b5" finds it first', (await page.locator('[data-library] [data-chord]').first().getAttribute('data-chord')) === 'F#m7b5');
    await page.fill('[data-library] input[type="search"]', 'bb/d');
    await page.waitForTimeout(300);
    check('search "bb/d" finds Bb/D', (await page.locator('[data-library] [data-chord]').first().getAttribute('data-chord')) === 'Bb/D');
    await page.locator('[data-library] [data-chord]').first().click();
    await page.waitForSelector('[data-chord-page="Bb/D"]', { timeout: 20000 });
    check('a search result opens its page', true);
    await page.fill('[data-library] input[type="search"]', '');
    await page.getByRole('tab', { name: /type/i }).click();
    await page.getByRole('radio', { name: 'm7', exact: true }).click();
    await page.waitForTimeout(400);
    const m7 = await page.locator('[data-library] [data-chord]').evaluateAll((els) => els.map((e) => e.getAttribute('data-chord')));
    check('by type: m7 lists twelve minor sevenths', m7.length === 12 && m7.includes('C#m7') && m7.includes('Bbm7'), m7.join(' '));
    await page.getByRole('tab', { name: /root/i }).click();
    await page.getByRole('radio', { name: 'F♯', exact: true }).click();
    await page.waitForTimeout(400);
    const fs_ = await page.locator('[data-library] [data-chord]').evaluateAll((els) => els.map((e) => e.getAttribute('data-chord')));
    check('by root: F♯ lists F# chords', fs_.includes('F#') && fs_.includes('F#m7') && fs_.every((s) => s.startsWith('F#')), fs_.slice(0, 8).join(' '));
    // Mark G as known on its page.
    await go(page, goto, 'chords', 'g-major');
    await page.click('[data-known-toggle]');
    await page.waitForTimeout(300);
    const p = await progress(page);
    check('"I know this chord" completes the chord:g skill', p.skills['chord:g']?.completed === true, JSON.stringify(p.skills['chord:g'] ?? null).slice(0, 120));
    await go(page, goto, 'chords');
    await page.getByRole('tab', { name: /first/i }).click();
    check('the path ticks G', (await page.locator('[data-library] [data-chord="G"][data-known]').count()) >= 1);
    await go(page, goto, 'chords', 'mine');
    check('My chords lists G', ((await page.getAttribute('[data-my-chords]', 'data-my-chords')) ?? '').split(',').includes('G'));
    // Take the mark back.
    await go(page, goto, 'chords', 'g-major');
    await page.click('[data-known-toggle]');
    await page.waitForTimeout(300);
    await go(page, goto, 'chords', 'mine');
    check('taking the mark back removes G', !((await page.getAttribute('[data-my-chords]', 'data-my-chords')) ?? '').split(',').includes('G'));
    noErrors(errors);
  });
}

async function identify() {
  await open({ mobile: false }, async ({ page, goto, errors }) => {
    await go(page, goto, 'chords', 'identify');
    check('opens on an example the app names: C', (await page.getAttribute('[data-name-shape]', 'data-symbol')) === 'C');
    await page.getByRole('button', { name: 'Clear' }).click();
    check('clear empties the neck', (await page.getAttribute('[data-name-shape]', 'data-frets')) === 'xxxxxx');
    const cell = (label) => page.locator(`[data-name-shape] button[aria-label^="${label}"]`).first();
    for (const l of ['string 5, open', 'string 4, fret 2', 'string 3, fret 2', 'string 2, fret 1', 'string 1, open']) await cell(l).click();
    await page.waitForTimeout(200);
    const frets = await page.getAttribute('[data-name-shape]', 'data-frets');
    const symbol = await page.getAttribute('[data-name-shape]', 'data-symbol');
    check('taps build x02210 and the app names it Am', frets === 'x02210' && symbol === 'Am', `${frets} ${symbol}`);
    await cell('string 2, fret 1').click();
    await page.waitForTimeout(200);
    check('tapping a dot again mutes its string', (await page.getAttribute('[data-name-shape]', 'data-frets')) === 'x022x0');
    await go(page, goto, 'chords', 'identify', 'xx0212');
    check('a shape in the address is named: D7', (await page.getAttribute('[data-name-shape]', 'data-symbol')) === 'D7');
    noErrors(errors);
  });
  await open({ mobile: true }, async ({ page, goto, errors }) => {
    await go(page, goto, 'chords', 'identify');
    check('phone: name that shape opens named', (await page.getAttribute('[data-name-shape]', 'data-symbol')) === 'C');
    const over = await sideways(page);
    check('phone: no sideways scroll', over <= 1, `${over}px`);
    noErrors(errors, 'phone: no console errors');
  });
}

async function startRound(page) {
  await page.waitForSelector('[data-start]', { timeout: 30000 });
  await page.click('[data-start]');
  await page.waitForSelector('[data-trainer-run]', { timeout: 30000 });
}

async function taps() {
  await open({ mobile: true }, async ({ page, goto, errors }) => {
    await go(page, goto, 'chords', 'trainer', 'em', 'am');
    check('the trainer opens on Em and Am', (await page.getAttribute('[data-trainer]', 'data-skill')) === 'chord-change:em-am');
    await page.waitForSelector('[data-start]', { timeout: 30000 });
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-trainer-run]', { timeout: 30000 });
    check('Enter starts the round', true);
    await page.waitForSelector('[data-trainer-run="minute"][data-phase="go"]', { timeout: 15000 });
    const immersive = await page.getAttribute('[data-immersive]', 'data-immersive');
    check('the running round hides the tab bar (focus)', immersive === 'focus', immersive);
    const TAPS = 21;
    for (let i = 0; i < TAPS; i++) {
      await page.click('[data-tap]');
      await sleep(250);
    }
    check('every tap counted', Number(await page.getAttribute('[data-trainer-run]', 'data-count')) === TAPS, await page.getAttribute('[data-trainer-run]', 'data-count'));
    await page.waitForSelector('[data-trainer][data-phase="results"]', { timeout: 75000 });
    const score = Number(await page.getAttribute('[data-trainer]', 'data-score'));
    check('the result after a full minute is the number of changes', score === TAPS, `${score}`);
    const p = await progress(page);
    const skill = p.skills['chord-change:em-am'];
    check('one chord-change activity on chord-change:em-am', skill?.attempts === 1 && skill?.completions === 1, JSON.stringify(skill ?? null).slice(0, 200));
    const trend = skill?.data?.trend ?? [];
    check('the score is stored in the trend for today', trend.length === 1 && trend[0].best === TAPS && trend[0].day === p.meta.today, JSON.stringify(trend));
    check('the trend chart is drawn', (await page.getAttribute('[data-trend]', 'data-trend')) === String(TAPS));
    await page.screenshot({ path: path.join(OUT, 'chords-results-phone.png') });
    check('results: no sideways scroll', (await sideways(page)) <= 1);
    noErrors(errors);
  });
}

async function mic() {
  await loadSig();
  const em = midiOf('Em');
  const am = midiOf('Am');
  const d = midiOf('D');
  const amDead = am.filter((m) => m % 12 !== 0); // the C on string 2 does not sound
  // The microphone opens on Start; counting begins after a 3-second count-in.
  const plan = [
    { silence: 4.2 },
    { strum: em }, // held: not a change
    { strum: am }, // 1
    { strum: am }, // re-strum of the held chord
    { strum: em }, // 2
    { strum: d }, // wrong chord: not counted
    { strum: am }, // 3
    { strum: em }, // 4
    { strum: amDead }, // a dead string: not counted
    { strum: am }, // 5
    { strum: em }, // 6
  ];
  const rec = await makeRecording('em-am', plan, 70);
  await open({ mobile: false, fakeAudio: rec.fakeAudio }, async ({ page, goto, errors }) => {
    await go(page, goto, 'chords', 'trainer', 'em', 'am');
    await page.getByRole('radio', { name: /Microphone/ }).click();
    await startRound(page);
    await page.waitForSelector('[data-listening]', { timeout: 15000 });
    check('the microphone is listening', true);
    await page.waitForSelector('[data-trainer][data-phase="results"]', { timeout: 90000 });
    const score = Number(await page.getAttribute('[data-trainer]', 'data-score'));
    check('exactly the six clean changes are counted', score === 6, `${score}`);
    const badges = (await page.locator('[data-trainer] [aria-live] ').allTextContents()).join(' ');
    const notCounted = /(\d+) not counted/.exec(badges);
    check('the wrong strums are reported as not counted', !!notCounted && Number(notCounted[1]) >= 1 && Number(notCounted[1]) <= 3, notCounted?.[0] ?? badges.slice(0, 200));
    const p = await progress(page);
    check('the mic round is stored on chord-change:em-am', p.skills['chord-change:em-am']?.data?.trend?.[0]?.best === 6, JSON.stringify(p.skills['chord-change:em-am']?.data ?? null));
    noErrors(errors);
  });
}

async function checkMode() {
  await loadSig();
  const em = midiOf('Em');
  const am = midiOf('Am');
  const amDead = am.filter((m) => m % 12 !== 0);
  const plan = [{ silence: 2.5 }, { strum: em }, { strum: amDead, dur: 2.2 }, { strum: am }, { strum: em }, { strum: am }, { strum: em }, { strum: am }, { strum: em }, { strum: am }, { silence: 2 }];
  const rec = await makeRecording('check', plan, 30);
  await open({ mobile: true, fakeAudio: rec.fakeAudio }, async ({ page, goto, errors }) => {
    await go(page, goto, 'chords', 'trainer', 'em', 'am');
    await page.getByRole('radio', { name: /Ring-true check/ }).click();
    await startRound(page);
    let hint = '';
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline) {
      if (await page.locator('[data-trainer][data-phase="results"]').count()) break;
      const text = (await page.locator('[data-trainer-run="check"] [role="status"], [data-trainer-run="check"] [aria-live]').allTextContents()).join(' ');
      if (/could not hear/.test(text)) hint = text;
      await sleep(150);
    }
    check('a dead string gives a hint naming the missing note', /could not hear the C/.test(hint), hint.slice(0, 200));
    await page.waitForSelector('[data-trainer][data-phase="results"]', { timeout: 20000 });
    const score = Number(await page.getAttribute('[data-trainer]', 'data-score'));
    check('seven of eight chords rang true on the first strum', score === 7, `${score}`);
    noErrors(errors);
  });
}

async function micCheck() {
  await loadSig();
  const g = midiOf('G');
  const gDead = g.filter((m) => m % 12 !== 11); // both B strings dead
  const rec = await makeRecording('g-check', [{ silence: 2.5 }, { strum: gDead, dur: 2 }, { strum: g, dur: 2 }, { silence: 2 }], 12);
  await open({ mobile: true, fakeAudio: rec.fakeAudio }, async ({ page, goto, errors }) => {
    await go(page, goto, 'chords', 'g');
    // Mark G known and take the mark back: a chord played cleanly for the microphone must rejoin.
    await page.click('[data-known-toggle]');
    await page.waitForTimeout(250);
    await page.click('[data-known-toggle]');
    await page.waitForTimeout(250);
    check('taking the mark back stores known: false', (await progress(page)).skills['chord:g']?.data?.known === false);
    await page.click('[data-mic-check]');
    await page.getByRole('button', { name: 'Start listening' }).click();
    let hint = '';
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if ((await page.getAttribute('[data-mic-sheet]', 'data-phase')) === 'ok') break;
      const text = (await page.locator('[data-mic-sheet]').allTextContents()).join(' ');
      if (/could not hear/.test(text)) hint = text;
      await sleep(150);
    }
    check('the dead B strings are named in a hint', /could not hear the B/.test(hint), hint.slice(0, 160));
    check('the clean strum passes the check', (await page.getAttribute('[data-mic-sheet]', 'data-phase')) === 'ok');
    const p = await progress(page);
    check('a passed check is chord practice on chord:g', p.skills['chord:g']?.attempts === 1 && p.skills['chord:g']?.completed === true, JSON.stringify(p.skills['chord:g'] ?? null).slice(0, 160));
    check('a passed check puts G back in My chords', p.skills['chord:g']?.data?.known === true, JSON.stringify(p.skills['chord:g']?.data ?? null));
    noErrors(errors);
  });
}

async function timed() {
  await open({ mobile: false }, async ({ page, goto, errors }) => {
    await go(page, goto, 'chords', 'trainer', 'em', 'am');
    await page.getByRole('radio', { name: /Changes in time/ }).click();
    const bpmBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('ssa:chords.trainer') || '{}').bpm ?? 60);
    await startRound(page);
    // Tap as soon as each change beat is shown (k = 4, 8, … with four beats a chord).
    let tapped = 0;
    const deadline = Date.now() + 70000;
    let lastK = -1;
    while (Date.now() < deadline && tapped < 8) {
      if (await page.locator('[data-trainer][data-phase="results"]').count()) break;
      const k = Number(await page.getAttribute('[data-trainer-run="timed"]', 'data-k').catch(() => '-1'));
      if (k !== lastK && k > 0 && k % 4 === 0) {
        await page.keyboard.press('Space');
        tapped++;
      }
      lastK = k;
      await sleep(20);
    }
    await page.waitForSelector('[data-trainer][data-phase="results"]', { timeout: 30000 });
    const clean = Number(await page.getAttribute('[data-trainer]', 'data-score'));
    check('taps on the change beats are on time', clean >= 6, `${clean} of 8 (tapped ${tapped})`);
    const bpmAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('ssa:chords.trainer') || '{}').bpm);
    if (clean >= 8) check('a clean round raises the tempo for the next one', bpmAfter > bpmBefore, `${bpmBefore} -> ${bpmAfter}`);
    noErrors(errors);
  });
}

async function noMic() {
  // No fake devices: getUserMedia fails, as it does wherever the host gives the page no microphone.
  await open({ mobile: true }, async ({ page, goto, errors }) => {
    await go(page, goto, 'chords', 'trainer', 'em', 'am');
    await page.getByRole('radio', { name: /Microphone/ }).click();
    await page.click('[data-start]');
    await page.waitForSelector('[data-mic-status="failed"]', { timeout: 20000 });
    await page.waitForTimeout(800);
    const box = await page.locator('[data-mic-status="failed"]').boundingBox();
    const vh = page.viewportSize().height;
    check('the reason the microphone failed is on screen after Start', !!box && box.y >= 0 && box.y + box.height <= vh, box ? `${Math.round(box.y)}..${Math.round(box.y + box.height)} of ${vh}` : 'no box');
    check('it says what to do', /Count with taps instead/.test(await page.locator('[data-mic-status="failed"]').innerText()));
    await page.getByRole('button', { name: 'Count with taps instead' }).click();
    await page.waitForTimeout(300);
    const input = await page.evaluate(() => JSON.parse(localStorage.getItem('ssa:chords.trainer') || '{}').input);
    check('"Count with taps instead" switches to taps', input === 'tap', input);
    check('and the failure goes away', (await page.locator('[data-mic-status="failed"]').count()) === 0);
    await startRound(page);
    await page.waitForSelector('[data-trainer-run="minute"] [data-tap]', { timeout: 15000 });
    check('a tap round starts', true);
    noErrors(errors);
  });
}

async function layout() {
  await open({ mobile: true, viewport: { width: 844, height: 390 } }, async ({ page, goto, errors }) => {
    await go(page, goto, 'chords', 'trainer', 'g', 'c');
    await startRound(page);
    await page.waitForSelector('[data-trainer-run="minute"][data-phase="go"]', { timeout: 15000 });
    const over = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    check('sideways phone: the round fits the screen', over <= 1, `${over}px`);
    const cards = await page.locator('[data-trainer-run] [data-role]').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
    const bar = await page.locator('[data-tap]').boundingBox();
    check('sideways phone: the chords end above the tap button', cards <= bar.y + 1, `cards end ${Math.round(cards)}, button at ${Math.round(bar.y)}`);
    await page.screenshot({ path: path.join(OUT, 'chords-run-sideways.png') });
    noErrors(errors, 'sideways: no console errors');
  });
  await open({ mobile: true }, async ({ page, goto, errors }) => {
    await go(page, goto, 'chords', 'f-major');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await page.waitForTimeout(500);
    // Only the screen's own content: the shell's tab bar is not this screen's to fix.
    const spill = await page.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const main = document.querySelector('main');
      const out = [];
      for (const el of main.querySelectorAll('*')) {
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 || rc.right <= W + 1) continue;
        let contained = false;
        for (let p = el.parentElement; p && p !== main; p = p.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) contained = true;
        if (!contained) out.push(`${el.tagName}.${String(el.className).slice(0, 30)} ${Math.round(rc.right)}px`);
      }
      return out;
    });
    check('text at 200 %: nothing on the F page spills sideways', spill.length === 0, spill.slice(0, 4).join(' | '));
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    await go(page, goto, 'chords', 'cdim7');
    const formula = await page.locator('[data-formula]').innerText();
    check('Cdim7 formula reads 1 – ♭3 – ♭5 – 𝄫7', /𝄫7/.test(formula) && !/♭b/.test(formula), formula);
    await go(page, goto, 'chords', 'c7');
    check('the open C7 says it leaves out the fifth', /leaves out the fifth/.test((await page.locator('[data-shape-note]').allTextContents()).join(' ')));
    await page.locator('[data-index][aria-label^="A-shape barre"]').first().click();
    await page.waitForTimeout(300);
    check('the A-shape barre C7 (with its fifth) says nothing of the kind', (await page.locator('[data-shape-note]').count()) === 0, await page.getAttribute('[data-voicing]', 'data-voicing'));
    noErrors(errors, 'phone: no console errors');
  });
}

async function shots() {
  const list = [
    ['chords', [], 'library'],
    ['chords', ['f-major'], 'f'],
    ['chords', ['f-sharp-m7b5'], 'f-sharp-m7b5'],
    ['chords', ['trainer'], 'trainer'],
    ['chords', ['identify'], 'identify'],
    ['chords', ['mine'], 'mine'],
  ];
  for (const mobile of [true, false]) {
    for (const theme of ['dark', 'light']) {
      await open({ mobile, theme }, async ({ page, goto, errors }) => {
        for (const [route, params, name] of list) {
          await go(page, goto, route, ...params);
          await page.waitForTimeout(600);
          await page.screenshot({ path: path.join(OUT, `chords-${name}-${mobile ? 'phone' : 'desktop'}-${theme}.png`), fullPage: !mobile });
          const over = await sideways(page);
          check(`${mobile ? 'phone' : 'desktop'} ${theme} ${name}: no sideways scroll`, over <= 1, `${over}px`);
        }
        noErrors(errors, `${mobile ? 'phone' : 'desktop'} ${theme}: no console errors`);
      });
    }
  }
}

const GROUPS = { pages, library, identify, taps, mic, check: checkMode, miccheck: micCheck, timed, nomic: noMic, layout, shots };

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(GROUPS)) {
    if (only && !only.includes(name)) continue;
    if (!only && name === 'shots' && argv.includes('--no-shots')) continue;
    let ok = false;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      results = [];
      const t0 = Date.now();
      try {
        await fn();
      } catch (e) {
        check(`${name} ran without throwing`, false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e);
      }
      const bad = results.filter((r) => !r.pass);
      ok = bad.length === 0;
      console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}: ${results.length - bad.length}/${results.length} checks (${((Date.now() - t0) / 1000).toFixed(0)} s)${!ok && attempt === 1 ? ', trying once more' : ''}`);
      if (!ok && attempt === 2) for (const b of bad) console.log(`        ${b.name}${b.detail ? `: ${b.detail.slice(0, 300)}` : ''}`);
    }
    if (!ok) failed++;
  }
  console.log(failed ? 'FAILED' : 'PASSED');
  process.exit(failed ? 1 : 0);
})();
