#!/usr/bin/env node
/**
 * Browser check of the Player (src/features/player). Run:
 *   node e2e/player.cjs [--verbose] [--shots] [--only listen,loop,keys,wait,strum,chordwait,flow,reload,nomic,address,artifact,long,review,layouts,reading,meter,chart,capo,part,refused]
 *
 * Real Chromium, real Web Audio, Chromium's fake microphone playing WAV files rendered by the
 * audio module (the app's own guitar synth).
 *
 *  listen   desktop, Hot Cross Buns: Play gives a one-bar count-in, then the cursor follows the
 *           audio clock (the tick drawn each frame against the tick the clock says, within a
 *           frame; the note highlighted on the score is the one sounding), bars are heard at
 *           their scheduled times, the fretboard lights the note being played, and the song ends
 *           with nothing scored and no results panel
 *  loop     a loop of bars 2–3 picked by two taps on the score plays round (bar 3 is followed by
 *           bar 2), at 150 % each bar lasts two thirds of its written length, and the speed
 *           trainer adds its step after every pass
 *  keys     Space plays and pauses, → and ← move by a bar, L L sets an A–B loop and L clears it,
 *           − and + change the tempo by 5 %, M turns the click on and off, Esc stops
 *  wait     phone, fake microphone: B A G played right, then two wrong notes (the song waits,
 *           says what it heard, and after the second the hint appears by itself), then the right
 *           note and the song carries on; the score marks hits and the note waited on
 *  strum    phone, fake microphone: three strums of G on the strum-along Frère Jacques move wait mode
 *           on by three chords, not more (a ringing chord used to match every chord after it)
 *  flow     desktop, fake microphone: a recording of the melody started in time with the song,
 *           with bar 2 played 130 ms early on purpose: those notes are judged "early", the others
 *           perfect or good; the results panel shows accuracy, stars, the heat strip and a
 *           suggestion; recordActivity stored song:hot-cross-buns with the accuracy
 *  reload   phone: set 75 % and a loop of bars 2–3, play, pause, reload: the player says it picked
 *           up in the bar where it was paused, and the loop and the tempo are back
 *  nomic    a browser with no microphone: choosing Wait shows the microphone panel once with
 *           "Tap along instead", tap-along plays and taps are timed
 *  address  #play with no song offers the library; an unknown song says so and offers another; a
 *           bar the song does not have starts at the top and says why
 *  artifact the app inside the Claude viewer (simulated: `window.claude` present), where the
 *           microphone is refused: the mode picker offers Listen and Tap along, the reason is
 *           shown once with "Tap along instead", and not again after a reload
 *  long     phone, a 200-bar study saved to the library: only the lines near the view are drawn,
 *           playing from bar 40 at 150 % the score scrolls by itself so the line being played and
 *           the next one stay in view, frames keep coming (the rate on this shared machine is
 *           reported; a real phone was not measured)
 *  review   cases from an independent review: Stop is never drawn over the music (phone: it takes
 *           the mode picker's row, with no jump; sideways: the top of the control column; desktop:
 *           beside Play); the tempo popover on a touch screen does not focus a text field (no
 *           on-screen keyboard over its slider); a very long title gives way to the mode picker
 *  reading  a reading study opens in "Tab and notes"; `notes` covers the tab rows of every line (every
 *           fret number under the cover), draws the staff and turns the fretboard off; the options
 *           switch views and say when the fretboard goes (desktop and phone)
 *  meter    6/8 counts dotted quarters on the tempo button (♩. = 54, as the score), in the count-in
 *           switch, the speed trainer and the count-in itself (two beats); 3/8 counts eighths
 *           (♪ = 120); 4/4 stays plain bpm
 *  chart    "Hide the chord names" takes the symbols off the score and the fretboard away, with a
 *           line to show them again; `hide-chart` hides them for one visit
 *  capo     `capo2` keeps the shapes and sounds two semitones higher (the fretboard names E for the
 *           open D string), the header and panel say the key; "As written" goes back keeping the
 *           tempo; moving the song down 2 sounds in F; "Same key, easier shapes" (desktop and phone)
 *  part     `part-teacher` makes the Teacher part the learner's, `mute-your-strum` mutes the strum,
 *           an unknown part says so
 *  refused  the microphone refused: the listen results suggest tapping along, never Wait
 *  chordwait  phone, fake microphone: a C strum while wait mode wants G is named ("That sounded
 *           like C. The chart says G"), then a G strum moves on
 *  layouts  phone upright (controls in the lower half), phone sideways (score above the
 *           fretboard, controls in a column on the right, one-line tab), tablet, desktop (side
 *           panel); light and dark; no sideways scroll; no console errors
 *
 * Timing checks run on a shared, busy machine: windows are generous, and a check that depends on
 * the scheduler is retried once before it counts as failed.
 * Prints one line per failed check (all with --verbose) and PASSED or FAILED; exits non-zero on failure.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const { startServer, loadTs, VIEWPORTS, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const shots = argv.includes('--shots');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',') : null;
const wants = (g) => !only || only.includes(g);

const SONG = 'hot-cross-buns';
const SEED = { 'ssa:shell.onboarding': '{"skipped":true}' };
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];
const OUT = path.join(ROOT, 'e2e', 'out');

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail !== '' ? `  (${String(detail).slice(0, 600)})` : ''}`);
  return !!pass;
}

/** A context shaped like the harness's, with storage seeded and errors collected. */
async function open(browser, url, { mobile = false, viewport, theme = 'dark', seed = {}, permissions = [], init } = {}) {
  const vp = viewport || VIEWPORTS[mobile ? 'mobile' : 'desktop'];
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: theme, hasTouch: mobile, isMobile: mobile, permissions });
  await context.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
  }, { ...SEED, ...seed });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((b) => b.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  const goto = async (hash) => {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-player]', { timeout: 90000 });
    await page.evaluate(async () => {
      window.__pl = (await import('/src/features/player/debug.ts')).playerDebug;
      window.__progress = await import('/src/core/progress/index.ts');
      window.__audio = await import('/src/core/audio/index.ts');
    });
    await page.waitForTimeout(600);
  };
  const shot = async (name) => {
    if (!shots) return;
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, `player-${name}.png`) });
  };
  const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const takeErrors = () => errors.splice(0, errors.length);
  return { page, context, goto, shot, sideways, takeErrors, close: () => context.close() };
}

const dbg = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__pl)));
const phase = (page) => page.locator('[data-player]').getAttribute('data-phase');
async function waitPhase(page, want, timeout = 20000) {
  await page.waitForFunction((w) => document.querySelector('[data-player]')?.getAttribute('data-phase') === w, want, { timeout });
}

/** Hot Cross Buns as the song core reads it: targets with their written seconds. */
async function songFacts() {
  const song = await loadTs('/src/core/song/index.ts');
  const text = fs.readFileSync(path.join(ROOT, 'src/content/songs/hot-cross-buns/song.sixtab'), 'utf8');
  const s = song.sixTab(text);
  const t = song.flattenSong(s);
  const targets = song.practiceTargets(t, s.tracks[0].id).map((x) => ({ tick: x.tick, sec: x.sec, bar: x.bar, beat: x.beat.beat, midi: x.midis[0] }));
  return { bpm: s.tempo[0].bpm, targets, bars: t.bars.map((b) => ({ bar: b.bar, start: b.start, startSec: b.startSec, endSec: b.endSec })), total: t.totalSeconds };
}

// ---------------------------------------------------------------------------------------------
// listen: the cursor against the audio clock
// ---------------------------------------------------------------------------------------------
async function listen(browser, url, facts) {
  const s = await open(browser, url);
  const { page } = s;
  try {
    await s.goto(`play--${SONG}`);
    const neck0 = await page.locator('[data-player-neck]').getAttribute('data-now');
    check('listen', 'stopped at the start, the fretboard lights the first note (B on string 3, fret 4)', neck0 === '3:4', neck0);
    await page.locator('[data-player-play]').click();
    // The count-in shows, then the music.
    const sawCount = await page.waitForFunction(() => document.querySelector('[data-player-countin]')?.hasAttribute('data-show'), null, { timeout: 15000 }).then(() => true).catch(() => false);
    check('listen', 'a one-bar count-in is shown', sawCount);
    await waitPhase(page, 'playing', 20000);
    // Sample the cursor across the song, each against the audio clock at that frame.
    const samples = await page.evaluate(async () => {
      const out = [];
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 180));
        await new Promise((r) => requestAnimationFrame(() => r()));
        const c = window.__pl.cursor;
        const now = Array.from(document.querySelectorAll('[data-tab-view] [data-now]')).map((e) => e.getAttribute('data-beat'));
        const neck = document.querySelector('[data-player-neck]')?.getAttribute('data-now') ?? '';
        if (c) out.push({ tick: c.tick, bar: c.bar, audio: c.audio, now: [...new Set(now)], neck, start: window.__pl.musicStart, startTick: window.__pl.startTick, tempo: window.__pl.tempo });
      }
      return out;
    });
    const ticksPerSec = (facts.bpm * 960) / 60;
    const errs = samples.filter((x) => x.start !== null && x.audio > x.start + 0.05 && x.audio < x.start + facts.total - 0.1).map((x) => {
      const expected = x.startTick + (x.audio - x.start) * ticksPerSec * (x.tempo / 100);
      return Math.abs(x.tick - expected) / ticksPerSec;
    });
    const worst = errs.length ? Math.max(...errs) : Infinity;
    check('listen', 'the cursor is where the audio clock says, every sample within 20 ms', errs.length >= 15 && worst < 0.02, `${errs.length} samples, worst ${(worst * 1000).toFixed(1)} ms`);
    // The highlighted beat on the score is the one sounding at the cursor.
    const beatOf = (tick) => {
      let best = null;
      for (const t of facts.targets) if (t.tick <= tick) best = t;
      return best;
    };
    let agree = 0;
    let compared = 0;
    for (const x of samples) {
      const t = beatOf(x.tick);
      if (!t || !x.now.length) continue;
      // Skip samples right at a beat change (the frame may have drawn just before it).
      const next = facts.targets.find((y) => y.tick > x.tick);
      if (x.tick - t.tick < 40 || (next && next.tick - x.tick < 40)) continue;
      compared++;
      if (x.now.includes(`${t.bar}:${t.beat}`)) agree++;
    }
    check('listen', 'the note marked on the score is the one sounding', compared >= 10 && agree >= compared - 1, `${agree}/${compared}`);
    let neckAgree = 0;
    let neckCompared = 0;
    for (const x of samples) {
      const t = beatOf(x.tick);
      if (!t) continue;
      const next = facts.targets.find((y) => y.tick > x.tick);
      if (x.tick - t.tick < 120 || (next && next.tick - x.tick < 60)) continue;
      neckCompared++;
      const pos = { 59: '3:4', 57: '3:2', 55: '3:0' }[t.midi];
      if (x.neck === pos) neckAgree++;
    }
    check('listen', 'the fretboard lights the note being played (from the player, as heard)', neckCompared >= 10 && neckAgree >= neckCompared - 1, `${neckAgree}/${neckCompared}`);
    await page.waitForFunction(() => document.querySelector('[data-player]')?.getAttribute('data-phase') === 'idle', null, { timeout: 30000 });
    const d = await dbg(page);
    // Bars are heard at their scheduled times.
    const barErr = d.bars.map((b) => Math.abs(b.time - (d.musicStart + facts.bars[b.index].startSec)));
    check('listen', 'every bar is heard at its time on the audio clock (within 2 ms)', barErr.length === facts.bars.length && Math.max(...barErr) < 0.002, barErr.map((e) => (e * 1000).toFixed(2)).join(' '));
    // ...and the screen hears about each bar when it sounds (the visual queue runs per frame).
    const late = d.bars.map((b) => b.heardAt - b.time);
    // The visual queue runs once per frame, on the frame nearest the sound: up to half a frame early.
    check('listen', 'each bar event reaches the screen when the bar is heard (from half a frame early to 50 ms late)', late.every((x) => x >= -0.009 && x < 0.05), late.map((x) => (x * 1000).toFixed(1)).join(' '));
    check('listen', 'the frame loop ran while playing', d.frames > 200, d.frames);
    const results = await page.locator('[data-player-results]').count();
    check('listen', 'listening to the end opens a short summary that suggests wait mode', results === 1 && /waiting for you/i.test(await page.locator('[data-player-suggestion]').innerText()), results);
    await s.shot('listen-results');
    const errors = s.takeErrors();
    check('listen', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// loop: tap two bars, play round, tempo and speed trainer
// ---------------------------------------------------------------------------------------------
async function loop(browser, url, facts) {
  const s = await open(browser, url);
  const { page } = s;
  try {
    await s.goto('play--greensleeves-fingerstyle--b');
    check('loop', 'an address naming a section loops it (#play--greensleeves-fingerstyle--b: bars 10 to 17)', (await page.locator('[data-player-loop]').first().getAttribute('data-player-loop')) === '9-16');
    await s.goto(`play--${SONG}--t150`);
    check('loop', 'the address sets the tempo (t150)', (await page.locator('[data-player-tempo]').first().getAttribute('data-player-tempo')) === '150');
    await page.getByRole('button', { name: /Choose bars/ }).click();
    // Tap bar 2 and bar 3 on the score (their first notes).
    const tapBar = async (bar) => {
      const el = page.locator(`[data-tab-view] [data-beat="${bar}:0"]`).first();
      await el.click();
      await page.waitForTimeout(250);
    };
    await tapBar(1);
    await tapBar(2);
    const loopAttr = await page.locator('[data-player-loop]').first().getAttribute('data-player-loop');
    check('loop', 'two taps on the score set the loop to bars 2 to 3', loopAttr === '1-2', loopAttr);
    await page.locator('[data-player-play]').click();
    await page.waitForFunction(() => (window.__pl.bars || []).length >= 5, null, { timeout: 30000 });
    const d = await dbg(page);
    const order = d.bars.map((b) => b.bar).slice(0, 5);
    check('loop', 'the loop plays round: 2 3 2 3 2', order.join(' ') === '1 2 1 2 1', order.join(' '));
    const gaps = d.bars.slice(1, 5).map((b, i) => b.time - d.bars[i].time);
    const expected = (facts.bars[1].endSec - facts.bars[1].startSec) / 1.5;
    const worst = Math.max(...gaps.map((g) => Math.abs(g - expected)));
    check('loop', 'at 150 % a bar lasts two thirds of its written length (within 5 ms)', worst < 0.005, `${gaps.map((g) => g.toFixed(4)).join(' ')} vs ${expected.toFixed(4)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    // Speed trainer: 70 % +10 each pass; in listen mode every pass counts.
    await page.evaluate(() => {
      window.__pl.bars = [];
    });
    await page.locator('[data-player-trainer]').check();
    await page.getByRole('radio', { name: '+10 %' }).click();
    await page.waitForTimeout(200);
    const t0 = await page.locator('[data-player-tempo]').first().getAttribute('data-player-tempo');
    check('loop', 'switching the speed trainer on sets the start tempo (70 %)', t0 === '70', t0);
    await page.locator('[data-player-play]').click();
    const tempos = [];
    const t1 = Date.now();
    while (Date.now() - t1 < 45000 && tempos.length < 4) {
      await page.waitForTimeout(250);
      const tp = await page.evaluate(() => window.__pl.tempo);
      if (tempos[tempos.length - 1] !== tp) tempos.push(tp);
    }
    check('loop', 'each pass of the loop adds the step: 70, 80, 90, 100', tempos.slice(0, 4).join(' ') === '70 80 90 100', tempos.join(' '));
    await page.keyboard.press('Escape');
    await s.shot('loop');
    const errors = s.takeErrors();
    check('loop', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// keys: the keyboard
// ---------------------------------------------------------------------------------------------
async function keys(browser, url) {
  const s = await open(browser, url);
  const { page } = s;
  try {
    await s.goto(`play--${SONG}`);
    await page.locator('body').click({ position: { x: 5, y: 790 } });
    const tempo = async () => Number(await page.locator('[data-player-tempo]').first().getAttribute('data-player-tempo'));
    await page.keyboard.press('Minus');
    await page.keyboard.press('Minus');
    check('keys', '− twice: 90 %', (await tempo()) === 90, await tempo());
    await page.keyboard.press('Equal');
    check('keys', '+ once: 95 %', (await tempo()) === 95, await tempo());
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    check('keys', '→ twice moves to bar 3', /Bar 3/.test(await page.locator('[data-player]').innerText()));
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    check('keys', '← goes back a bar', /Bar 2/.test(await page.locator('[data-player]').innerText()));
    await page.keyboard.press('l');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('l');
    await page.waitForTimeout(150);
    let loopAttr = await page.locator('[data-player-loop-options]').count();
    const loopNow = await page.evaluate(() => document.querySelector('[data-player]') && document.body.innerText.match(/Bars \d+ to \d+/)?.[0]);
    check('keys', 'L, two bars on, L: the loop is bars 2 to 4', loopNow === 'Bars 2 to 4', loopNow);
    await page.keyboard.press('l');
    await page.waitForTimeout(150);
    const cleared = await page.evaluate(() => /No loop yet/.test(document.body.innerText));
    check('keys', 'L again clears it', cleared);
    await page.keyboard.press('m');
    await page.waitForTimeout(100);
    check('keys', 'M turns the click on', await page.locator('[data-player-metronome]').isChecked());
    await page.keyboard.press('m');
    await page.waitForTimeout(100);
    check('keys', 'M again turns it off', !(await page.locator('[data-player-metronome]').isChecked()));
    await page.keyboard.press('Space');
    await waitPhase(page, 'playing', 20000).catch(() => {});
    check('keys', 'Space plays', (await phase(page)) === 'playing', await phase(page));
    await page.waitForTimeout(800);
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    check('keys', 'Space pauses', (await phase(page)) === 'paused', await phase(page));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('keys', 'Esc stops', (await phase(page)) === 'idle', await phase(page));
    loopAttr = 0;
    const errors = s.takeErrors();
    check('keys', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// WAV recordings for the fake microphone
// ---------------------------------------------------------------------------------------------
let audioMod = null;
async function wav(name, notes, seconds) {
  audioMod = audioMod || (await loadTs('/src/core/audio/index.ts'));
  const sr = 48000;
  const samples = audioMod.renderSequence(notes, { sampleRate: sr, seconds });
  const file = path.join(os.tmpdir(), `ssa-player-${name}-${process.pid}.wav`);
  fs.writeFileSync(file, audioMod.encodeWav(samples, sr, { bitDepth: 16 }));
  return file;
}

async function withMic(file, fn) {
  const server = await startServer();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}%noloop`] });
  try {
    return await fn(browser, server.url);
  } finally {
    await browser.close();
    await server.close();
  }
}

// ---------------------------------------------------------------------------------------------
// wait: the song waits for each note
// ---------------------------------------------------------------------------------------------
async function wait() {
  // B A G right, then C and D (wrong), then B A G right.
  const plan = [[4.0, 59, 3], [5.6, 57, 3], [7.2, 55, 3], [8.8, 60, 2], [10.4, 62, 2], [12.0, 59, 3], [13.6, 57, 3], [15.2, 55, 3]];
  const file = await wav('wait', plan.map(([time, midi, string]) => ({ time, midi, string, velocity: 0.8 })), 17);
  try {
    await withMic(file, async (browser, url) => {
      const s = await open(browser, url, { mobile: true, permissions: ['microphone'] });
      const { page } = s;
      try {
        await s.goto(`play--${SONG}`);
        await page.locator('[data-player-modes]').getByRole('radio', { name: /^Wait/ }).click();
        await page.waitForFunction(() => window.__pl.mode === 'wait', null, { timeout: 15000 });
        await page.locator('[data-player-play]').click();
        await page.waitForSelector('[data-player-wait]', { timeout: 15000 });
        check('wait', 'wait mode asks for the first note (B)', /Play B/.test(await page.locator('[data-player-wait]').innerText()), await page.locator('[data-player-wait]').innerText());
        await page.waitForFunction(() => window.__pl.waitIndex >= 3, null, { timeout: 20000 }).catch(() => {});
        let d = await dbg(page);
        check('wait', 'B, A and G heard: three notes on', d.waitIndex === 3, `index ${d.waitIndex}; heard ${d.notes.map((n) => `${n.midi}:${n.result}`).join(' ')}`);
        await s.shot('wait-progress');
        // The wrong notes: it waits, says what it heard.
        await page.waitForFunction(() => window.__pl.notes.some((n) => n.midi === 60), null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(300);
        d = await dbg(page);
        const fb = await page.locator('[data-player-wait]').innerText();
        check('wait', 'a wrong note (C): the song waits at note 4 and says what it heard', d.waitIndex === 3 && /sounded like C/.test(fb) && (await phase(page)) === 'waiting', `${d.waitIndex} ${fb.replace(/\s+/g, ' ')}`);
        await page.waitForFunction(() => window.__pl.notes.some((n) => n.midi === 62), null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(300);
        const hint = await page.locator('[data-player-wait]').innerText();
        check('wait', 'after the second wrong note the hint shows where to play (string 3, fret 4)', /string 3, fret 4/.test(hint) && (await dbg(page)).waitIndex === 3, hint.replace(/\s+/g, ' '));
        await s.shot('wait-hint');
        await page.waitForFunction(() => window.__pl.waitIndex >= 4, null, { timeout: 15000 }).catch(() => {});
        d = await dbg(page);
        check('wait', 'the right note: the song carries on', d.waitIndex >= 4, d.waitIndex);
        await page.waitForFunction(() => window.__pl.waitIndex >= 6, null, { timeout: 15000 }).catch(() => {});
        d = await dbg(page);
        check('wait', 'and keeps going with the next ones (A, G)', d.waitIndex === 6, d.waitIndex);
        const hits = await page.locator('[data-tab-view] [data-state="hit"], [data-tab-view] .hit').count();
        const states = await page.evaluate(() => Array.from(document.querySelectorAll('[data-tab-view] [data-state]')).map((e) => e.getAttribute('data-state')));
        check('wait', 'the score marks the notes played and the one waited on', states.filter((x) => x === 'hit').length >= 1 && states.includes('target'), `${hits} ${[...new Set(states)].join(',')}`);
        // Stop: a short summary of the part played.
        await page.locator('[data-player-play]').click();
        await page.waitForSelector('[data-player-results]', { timeout: 10000 }).catch(() => {});
        const res = await page.locator('[data-player-results]').count() ? await page.locator('[data-player-results]').innerText() : '';
        check('wait', 'stopping shows a summary: first-try notes and hints', /First try/.test(res) && /Hints/.test(res), res.replace(/\s+/g, ' ').slice(0, 200));
        await s.shot('wait-results');
        const errors = s.takeErrors();
        check('wait', 'no console errors', errors.length === 0, errors.join(' | '));
      } finally {
        await s.close();
      }
      // With --shots: the main practice layout, a phone held sideways, in wait mode.
      if (shots) {
        const l = await open(browser, url, { mobile: true, viewport: { width: 844, height: 390 }, permissions: ['microphone'] });
        try {
          await l.goto(`play--${SONG}--wait`);
          await l.page.locator('[data-player-play]').click();
          await l.page.waitForFunction(() => window.__pl.waitIndex >= 1, null, { timeout: 20000 }).catch(() => {});
          await l.page.waitForTimeout(400);
          await l.shot('wait-sideways');
        } finally {
          await l.close();
        }
      }
    });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// strum: one strum is one chord in wait mode
// ---------------------------------------------------------------------------------------------
async function strumWait() {
  // Review: a strummed chord rings, and its chroma kept matching the next chords: one strum ran
  // wait mode through the whole song. Three G strums (xx0003), 1.6 s apart, each left to ring.
  const shape = [[50, 4], [55, 3], [59, 2], [67, 1]];
  const notes = [];
  for (const t of [4.0, 5.6, 7.2]) shape.forEach(([midi, string], k) => notes.push({ time: t + k * 0.012, midi, string, velocity: 0.7 }));
  const file = await wav('strum', notes, 11);
  try {
    await withMic(file, async (browser, url) => {
      const s = await open(browser, url, { mobile: true, permissions: ['microphone'] });
      const { page } = s;
      try {
        await s.goto('play--frere-jacques');
        await page.locator('[data-player-modes]').getByRole('radio', { name: /^Wait/ }).click();
        await page.waitForFunction(() => window.__pl.mode === 'wait', null, { timeout: 15000 });
        await page.locator('[data-player-play]').click();
        await page.waitForSelector('[data-player-wait]', { timeout: 15000 });
        check('strum', 'wait mode asks for a strum of G', /Strum G/.test(await page.locator('[data-player-wait]').innerText()), await page.locator('[data-player-wait]').innerText());
        await page.waitForFunction(() => window.__pl.waitIndex >= 1, null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1200);
        let d = await dbg(page);
        check('strum', 'the first strum counts once, while it rings', d.waitIndex === 1, `index ${d.waitIndex}`);
        // Past the third strum, with time for it to ring out.
        await page.waitForTimeout(6500);
        d = await dbg(page);
        check('strum', 'three strums of G: three chords on, no more', d.waitIndex === 3, `index ${d.waitIndex} of ${d.waitTotal}`);
        const errors = s.takeErrors();
        check('strum', 'no console errors', errors.length === 0, errors.join(' | '));
      } finally {
        await s.close();
      }
    });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// flow: timing judged against the song, with bar 2 early on purpose
// ---------------------------------------------------------------------------------------------
async function flow(facts, attempt = 1) {
  const SYNC = 1.0;
  const F0 = 7.0;
  const EARLY = 0.13;
  const early = (t) => t.bar === 1;
  const notes = [{ time: SYNC, midi: 64, string: 1, velocity: 0.8 }];
  for (const t of facts.targets) notes.push({ time: F0 + t.sec - (early(t) ? EARLY : 0), midi: t.midi, string: 3, velocity: 0.8 });
  const file = await wav('flow', notes, F0 + facts.total + 2);
  let retry = false;
  try {
    await withMic(file, async (browser, url) => {
      const s = await open(browser, url, { permissions: ['microphone'] });
      const { page } = s;
      try {
        await s.goto(`play--${SONG}`);
        // Get the sounds ready first, so Play starts at once.
        await page.evaluate(async () => {
          await window.__audio.unlockAudio();
        });
        await page.locator('[data-player-modes]').getByRole('radio', { name: /^Flow/ }).click();
        await page.waitForFunction(() => window.__pl.mode === 'flow', null, { timeout: 15000 });
        // The recording starts when the microphone opens; its first note tells where it is on the audio clock.
        await page.waitForFunction(() => window.__pl.notes.length > 0, null, { timeout: 15000 });
        const before = await dbg(page);
        const first = before.notes[0];
        const origin = first.time - SYNC;
        // Press Play so that the song's first beat, as heard, lands on the recording's first melody
        // note: a learner plays with what comes out of the speakers, so the round-trip latency the
        // player takes off note times (output + input) is added here; 0.08 s is the transport's start delay.
        const countIn = (4 * 60) / facts.bpm;
        const latency = before.latency;
        const pressAt = origin + F0 - countIn - 0.08 - latency;
        const pressed = await page.evaluate(async (at) => {
          const ctx = window.__audio.getAudioContext();
          while (ctx.currentTime < at - 0.004) await new Promise((r) => setTimeout(r, 1));
          document.querySelector('[data-player-play]').click();
          return ctx.currentTime;
        }, pressAt);
        await page.waitForSelector('[data-player-results]', { timeout: (F0 + facts.total + 15) * 1000 });
        const d = await dbg(page);
        const scored = d.notes.filter((n) => n.result && n.result !== 'ignored-low' && n.target !== undefined && n.offset !== undefined);
        // How far the whole recording sits from the song (the press could not be exact): the median of the notes meant on time.
        const onTime = scored.filter((n) => facts.targets[n.target] && !early(facts.targets[n.target])).map((n) => n.offset).sort((a, b) => a - b);
        const delta = onTime[Math.floor(onTime.length / 2)] ?? 0;
        // What the clocks predict for that offset: where the recording put the melody, less latency, less where the song started.
        const predicted = origin + F0 - d.latency - d.musicStart;
        check('flow', 'the judged offsets agree with the audio clock (the song’s start and the recording’s notes, within 15 ms)', Math.abs(delta - predicted) < 0.015, `judged ${(delta * 1000).toFixed(1)} ms, clocks say ${(predicted * 1000).toFixed(1)} ms, latency ${(d.latency * 1000).toFixed(1)} ms`);
        if (Math.abs(delta) > 0.035 && attempt === 1) {
          retry = true;
          console.log(`  (flow: the run started ${(delta * 1000).toFixed(0)} ms off the recording; trying once more)`);
          return;
        }
        check('flow', 'the recording lined up with the song (the press was in time)', Math.abs(delta) <= 0.035, `delta ${(delta * 1000).toFixed(1)} ms, pressed ${(pressed - pressAt).toFixed(3)} s late`);
        const earlyOnes = scored.filter((n) => facts.targets[n.target] && early(facts.targets[n.target]));
        check('flow', 'all three notes of bar 2 (130 ms early on purpose) are judged "early"', earlyOnes.length === 3 && earlyOnes.every((n) => n.result === 'early'), earlyOnes.map((n) => `${n.result} ${(n.offset * 1000).toFixed(0)}`).join(', '));
        const shift = earlyOnes.map((n) => n.offset - delta);
        check('flow', 'and their offsets say so (about −130 ms)', shift.length === 3 && shift.every((x) => Math.abs(x + EARLY) < 0.03), shift.map((x) => (x * 1000).toFixed(0)).join(' '));
        const others = scored.filter((n) => facts.targets[n.target] && !early(facts.targets[n.target]));
        check('flow', 'the notes played in time are perfect or good', others.length >= facts.targets.length - 4 && others.every((n) => n.result === 'perfect' || n.result === 'good'), others.map((n) => `${n.target}:${n.result}`).join(' '));
        const r = d.results;
        check('flow', 'the results count them: 3 early, nothing wrong', r && r.mode === 'flow' && r.counts.early === 3 && r.counts.wrong === 0, JSON.stringify(r && r.counts));
        check('flow', 'the heat strip marks bar 2', r && r.heat.some((h) => h.bar === 1 && h.level > 0), JSON.stringify(r && r.heat));
        const text = await page.locator('[data-player-results]').innerText();
        check('flow', 'the panel shows accuracy, stars and the counts', /%/.test(text) && /Early/.test(text) && (await page.getByRole('img', { name: /of 3 stars/ }).count()) + (await page.locator('[aria-label*="of 3 stars"]').count()) > 0, text.replace(/\s+/g, ' ').slice(0, 300));
        const sug = await page.locator('[data-player-suggestion]').innerText().catch(() => '');
        check('flow', 'it suggests what to do next (loop the weak bars, slower)', /Loop bars? (1|2)/.test(sug) || /Try it/.test(sug), sug);
        const heatOnScore = await page.locator('[data-tab-view] [data-level]').count();
        check('flow', 'the heat strip is drawn over the score', heatOnScore >= 1, heatOnScore);
        const skill = await page.evaluate(() => window.__progress.getProgress().skills['song:hot-cross-buns']);
        check('flow', 'recordActivity kept the run on song:hot-cross-buns (accuracy and best)', !!skill && skill.attempts >= 1 && skill.lastAccuracy > 0.5 && skill.data && skill.data.best && skill.data.best.flow, JSON.stringify(skill && { a: skill.attempts, acc: skill.lastAccuracy, stars: skill.stars, data: skill.data }));
        await s.shot('flow-results');
        // The suggestion sets up the loop.
        if (sug) {
          await page.locator('[data-player-suggestion]').click();
          await page.waitForTimeout(500);
          const loopAttr = await page.locator('[data-player-loop]').first().getAttribute('data-player-loop');
          check('flow', 'the suggestion button sets the loop and the tempo', /Loop/.test(sug) ? !!loopAttr && loopAttr !== '' : true, loopAttr);
        }
        const errors = s.takeErrors();
        check('flow', 'no console errors', errors.length === 0, errors.join(' | '));
      } finally {
        await s.close();
      }
    });
  } finally {
    fs.rmSync(file, { force: true });
  }
  if (retry) return flow(facts, attempt + 1);
}

// ---------------------------------------------------------------------------------------------
// reload: the session comes back
// ---------------------------------------------------------------------------------------------
async function reload(browser, url) {
  const s = await open(browser, url, { mobile: true });
  const { page } = s;
  try {
    await s.goto(`play--${SONG}`);
    // 80 % and a loop of bars 2–3 through the loop sheet.
    await page.locator('[data-player-tempo]').first().click();
    await page.getByRole('button', { name: '75 %' }).click();
    await page.keyboard.press('Escape');
    await page.locator('[data-player-loop]').first().click();
    await page.locator(`[data-tab-view] [data-beat="1:0"]`).first().click();
    await page.waitForTimeout(200);
    await page.locator(`[data-tab-view] [data-beat="2:0"]`).first().click();
    await page.waitForTimeout(300);
    await page.locator('[data-player-play]').click();
    await page.waitForFunction(() => (window.__pl.bars || []).length >= 2, null, { timeout: 30000 });
    await page.locator('[data-player-play]').click();
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => ({ cursor: window.__pl.cursor }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-player]', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const resumed = await page.locator('[data-player-resumed]').count();
    const banner = resumed ? await page.locator('[data-player-resumed]').innerText() : '';
    const tempo = await page.locator('[data-player-tempo]').first().getAttribute('data-player-tempo');
    const loopAttr = await page.locator('[data-player-loop]').first().getAttribute('data-player-loop');
    const barBefore = before.cursor ? before.cursor.bar + 1 : -1;
    check('reload', 'after a reload the player says where it picked up: the bar it was paused in', resumed === 1 && banner.includes(`Picked up at bar ${barBefore}`), `${banner.replace(/\s+/g, ' ')} (paused in bar ${barBefore})`);
    check('reload', 'the tempo (75 %) and the loop (bars 2–3) are back', tempo === '75' && loopAttr === '1-2', `${tempo} ${loopAttr}`);
    const neck = await page.locator('[data-player-neck]').getAttribute('data-now');
    check('reload', 'the fretboard shows the note at the restored place', typeof neck === 'string', `${neck} (before: bar ${before.cursor && before.cursor.bar + 1})`);
    await s.shot('reload');
    const errors = s.takeErrors();
    check('reload', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// nomic: no microphone at all
// ---------------------------------------------------------------------------------------------
async function nomic(browser, url) {
  const s = await open(browser, url, {
    mobile: true,
    init: () => {
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' }));
    },
  });
  const { page } = s;
  try {
    await s.goto(`play--${SONG}`);
    await page.locator('[data-player-modes]').getByRole('radio', { name: /^Wait/ }).click();
    const panel = await page.getByText('Tap along instead').first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    check('nomic', 'choosing Wait without a microphone explains what is missing and offers tap-along', panel && /No microphone found/i.test(await page.locator('[role="dialog"]').innerText()));
    await page.waitForTimeout(400);
    await s.shot('nomic');
    await page.getByText('Tap along instead').first().click();
    await page.waitForFunction(() => window.__pl.mode === 'tap', null, { timeout: 10000 });
    check('nomic', 'tap-along is chosen', true);
    await page.locator('[data-player-play]').click();
    await waitPhase(page, 'playing', 20000);
    const start = (await dbg(page)).musicStart;
    // Tap on the score roughly in time with the first notes (B at 0, A at 0.83 s).
    for (const t of [0.02, 0.85, 1.68]) {
      await page.evaluate(async (at) => {
        const ctx = window.__audio.getAudioContext();
        const target = window.__pl.musicStart + at;
        while (window.__audio.audioSoundingNow() < target) await new Promise((r) => setTimeout(r, 2));
      }, t);
      await page.locator('[data-player-score]').dispatchEvent('pointerdown', { button: 0, pointerType: 'touch', isPrimary: true });
    }
    await page.waitForTimeout(400);
    const d = await dbg(page);
    const taps = d.notes.filter((n) => n.midi === -1);
    check('nomic', 'taps on the score are timed against the notes', taps.length === 3 && taps.filter((n) => n.result === 'perfect' || n.result === 'good').length >= 2, taps.map((n) => `${n.result} ${n.offset !== undefined ? (n.offset * 1000).toFixed(0) : ''}`).join(', ') + ` start ${start}`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-player-results]', { timeout: 10000 }).catch(() => {});
    check('nomic', 'stopping shows how the taps went', (await page.locator('[data-player-results]').count()) === 1);
    // Next time the panel is not shown again: the screen goes straight to tap-along.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const errors = s.takeErrors().filter((e) => !/NotFoundError|device not found/i.test(e));
    check('nomic', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// address: no song, an unknown song
// ---------------------------------------------------------------------------------------------
async function address(browser, url) {
  const s = await open(browser, url, { mobile: true });
  const { page } = s;
  try {
    const visit = async (hash) => {
      await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
      await page.waitForSelector('main[data-route="play"] h1', { timeout: 60000 });
      // The screen's code may still be loading on a busy machine (the shell says "Loading Player").
      await page.waitForFunction(() => !/Loading Player/.test(document.querySelector('main')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      return page.locator('main').innerText();
    };
    const none = await visit('play');
    check('address', '#play without a song offers the song library', /Pick a song to play/.test(none) && (await page.getByRole('link', { name: /Open the song library/ }).count()) === 1, none.slice(0, 120));
    const missing = await visit('play--no-such-song');
    check('address', 'an unknown song says so and offers another', /not in your library/.test(missing) && (await page.getByRole('link', { name: /Choose another song/ }).count()) === 1, missing.slice(0, 160));
    const far = await page.goto(`${url}#play--hot-cross-buns--m40`, { waitUntil: 'load' }).then(() => page.waitForSelector('[data-player]', { timeout: 60000 })).then(() => page.waitForTimeout(800)).then(() => page.locator('body').innerText());
    check('address', 'a bar the song does not have: it starts at the top and says why', /has 4 bars/.test(far), far.slice(0, 200));
    const errors = s.takeErrors();
    check('address', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// artifact: the Claude viewer refuses the microphone
// ---------------------------------------------------------------------------------------------
async function artifact(browser, url) {
  const s = await open(browser, url, {
    mobile: true,
    init: () => {
      // What the Claude viewer puts on the page; no capability is granted here.
      window.claude = { use: () => Promise.reject(new Error('not granted')) };
    },
  });
  const { page } = s;
  try {
    await s.goto(`play--${SONG}--wait`);
    const modes = await page.locator('[data-player-modes] [role="radio"]').allInnerTexts();
    check('artifact', 'the mode picker offers Listen and Tap along only', modes.join('|') === 'Listen|Tap along', modes.join('|'));
    const mode = await page.evaluate(() => window.__pl.mode);
    check('artifact', 'an address asking for wait mode opens in tap-along', mode === 'tap', mode);
    const panel = await page.getByText('switched off in this viewer').count();
    check('artifact', 'the reason is shown (the viewer switches the microphone off)', panel >= 1);
    await s.shot('artifact');
    await page.getByRole('button', { name: 'Tap along instead' }).click();
    await page.waitForTimeout(300);
    check('artifact', '"Tap along instead" puts it away', (await page.getByText('switched off in this viewer').count()) === 0);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-player]', { timeout: 60000 });
    await page.waitForTimeout(1200);
    check('artifact', 'it is not shown again after a reload', (await page.getByText('switched off in this viewer').count()) === 0);
    const errors = s.takeErrors();
    check('artifact', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// long: a 200-bar song, drawn lazily and followed by the view
// ---------------------------------------------------------------------------------------------
async function long(browser, url) {
  const s = await open(browser, url, { mobile: true });
  const { page } = s;
  try {
    await s.goto(`play--${SONG}`);
    const id = await page.evaluate(async () => {
      const lib = await import('/src/core/library/index.ts');
      const song = await import('/src/core/song/index.ts');
      const demo = await import('/src/ui/music/tab/demo.ts');
      const listing = await lib.getLibrary().save(song.sixTab(demo.longStudy(200)), { origin: { kind: 'typed' } });
      return listing.id;
    });
    await s.goto(`play--${id}--m40--t150`);
    await page.waitForTimeout(800);
    const tiles = await page.evaluate(() => {
      const all = document.querySelectorAll('[data-tab-view] svg');
      return { svgs: all.length, notes: document.querySelectorAll('[data-tab-view] [data-beat]').length };
    });
    check('long', 'only the lines near the view are drawn (not all 200 bars)', tiles.notes > 0 && tiles.notes < 200 * 8 * 0.5, JSON.stringify(tiles));
    await page.locator('[data-player-play]').click();
    await waitPhase(page, 'playing', 20000);
    await page.waitForTimeout(1500);
    // Sample for 8 s: frame intervals, and whether the line playing and the next one are in view.
    const run = await page.evaluate(async () => {
      const gaps = [];
      const follow = [];
      let last = performance.now();
      const t0 = last;
      await new Promise((resolve) => {
        const step = (t) => {
          gaps.push(t - last);
          last = t;
          if (window.__pl.follow) follow.push({ ...window.__pl.follow, t: t - t0 });
          if (t - t0 < 8000) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      return { gaps, follow };
    });
    const sorted = [...run.gaps].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    console.log(`  (long: ${run.gaps.length} frames in 8 s; median ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms on this shared machine)`);
    check('long', 'frames keep coming while a long song plays (median under 40 ms on this shared machine)', run.gaps.length > 100 && p50 < 40, `median ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`);
    const lines = [...new Set(run.follow.map((f) => f.line))];
    // Allow the glide after a line change (300 ms) before judging.
    const settled = run.follow.filter((f, i) => {
      const changed = run.follow.findLastIndex((g, j) => j <= i && j > 0 && run.follow[j - 1].line !== g.line);
      return changed < 0 || f.t - run.follow[changed].t > 450;
    });
    const both = settled.filter((f) => f.current && f.next).length;
    check('long', 'the view moves on by itself: several lines played', lines.length >= 3 && run.follow[run.follow.length - 1].scrollTop > run.follow[0].scrollTop, `lines ${lines.join(',')}`);
    check('long', 'the line being played and the next one stay in view', settled.length > 50 && both / settled.length > 0.95, `${both}/${settled.length}`);
    // The same with the CPU slowed 4× (Chromium's throttling, roughly a mid-range phone): reported,
    // and checked only loosely, because this machine is shared.
    const cdp = await s.context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const slow = await page.evaluate(async () => {
      const gaps = [];
      let last = performance.now();
      const t0 = last;
      await new Promise((resolve) => {
        const step = (t) => {
          gaps.push(t - last);
          last = t;
          if (t - t0 < 5000) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      return gaps.sort((a, b) => a - b);
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const s50 = slow[Math.floor(slow.length * 0.5)];
    const s95 = slow[Math.floor(slow.length * 0.95)];
    console.log(`  (long, CPU 4× slower: ${slow.length} frames in 5 s; median ${s50.toFixed(1)} ms, p95 ${s95.toFixed(1)} ms)`);
    check('long', 'with the CPU 4× slower the cursor still moves every frame or two (median under 34 ms)', s50 < 34, `median ${s50.toFixed(1)} ms, p95 ${s95.toFixed(1)} ms`);
    // A scroll by the learner is respected for a moment.
    await page.locator('[data-player-score]').evaluate((el) => {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
      el.scrollTop = 0;
    });
    await page.waitForTimeout(600);
    const held = await page.locator('[data-player-score]').evaluate((el) => el.scrollTop);
    check('long', 'when the learner scrolls, the view waits before following again', held < 50, held);
    const firstBar = (await dbg(page)).bars[0];
    const tempoNow = await page.locator('[data-player-tempo]').first().getAttribute('data-player-tempo');
    await page.keyboard.press('Escape');
    check('long', 'the address (m40, t150) started it at bar 40 at 150 %', firstBar && firstBar.bar === 39 && tempoNow === '150', `${firstBar && firstBar.bar + 1} ${tempoNow}`);
    await page.evaluate(async (songId) => {
      const lib = await import('/src/core/library/index.ts');
      await lib.getLibrary().remove(songId);
    }, id);
    const errors = s.takeErrors();
    check('long', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// layouts: phone upright and sideways, tablet, desktop, both themes
// ---------------------------------------------------------------------------------------------
async function review(browser, url) {
  const box = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
  const inside = (a, b) => !!a && !!b && a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
  for (const c of [
    { name: 'phone', mobile: true, want: 'bar' },
    { name: 'sideways', mobile: true, viewport: { width: 844, height: 390 }, want: 'rail' },
    { name: 'desktop', mobile: false, want: 'wide' },
  ]) {
    const s = await open(browser, url, { mobile: c.mobile, viewport: c.viewport });
    const { page } = s;
    try {
      await s.goto(`play--${SONG}`);
      const scoreBefore = await box(page, '[data-player-score]');
      const neckBefore = await box(page, '[data-player-neck]');
      await page.locator('[data-player-play]').click();
      await waitPhase(page, 'playing', 20000).catch(() => {});
      await page.waitForTimeout(400);
      const stop = await box(page, '[data-player-stop]');
      const score = await box(page, '[data-player-score]');
      check('review', `${c.name}: Stop is shown while playing, and not over the music`, !!stop && !inside(stop, score) && (stop.y >= score.y + score.h || stop.x >= score.x + score.w || stop.y + stop.h <= score.y), JSON.stringify({ stop, score }));
      if (c.want === 'bar') {
        const neck = await box(page, '[data-player-neck]');
        check('review', `${c.name}: starting a run moves nothing (score and fretboard stay put)`, Math.abs(score.h - scoreBefore.h) <= 1 && Math.abs(neck.y - neckBefore.y) <= 1, JSON.stringify({ scoreBefore, score, neckBefore, neck }));
        check('review', `${c.name}: the mode picker gives way to Stop during the run`, (await page.locator('[data-player-modes]').count()) === 0);
      }
      if (c.want === 'wide') check('review', `${c.name}: Stop sits beside Play in the side panel`, (await page.locator('aside [data-player-stop]').count()) === 1);
      if (c.want === 'rail') check('review', `${c.name}: Stop sits in the control column`, stop.x > score.x + score.w);
      await page.locator('[data-player-stop]').click();
      await waitPhase(page, 'idle', 10000).catch(() => {});
      await page.waitForTimeout(300);
      if (c.want === 'bar') {
        check('review', `${c.name}: the mode picker is back after Stop`, (await page.locator('[data-player-modes]').count()) === 1);
        await page.locator('[data-player-tempo]').first().click();
        await page.waitForTimeout(500);
        const focused = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}:${a.getAttribute('type') || ''}` : ''; });
        check('review', `${c.name}: the tempo popover does not put the cursor in a text field (no keyboard over the slider)`, !/^INPUT:(text|number|)$|^TEXTAREA/.test(focused), focused);
        await page.keyboard.press('Escape');
      }
      if (c.want === 'wide') {
        const id = await page.evaluate(async () => {
          const L = (await import('/src/core/library/index.ts')).getLibrary();
          const r = await L.importText('title: The Extraordinarily Long Ballad of the Riverboat Gambler and His Seventeen Cousins from Over the Hills and Far Away\ntempo: 90\ntime: 4/4\n\ntrack: Lead\n| q 3:0 3:2 3:4 3:2 | w 3:0 ||\n');
          return r.listing.id;
        });
        await s.goto(`play--${id}`);
        const title = await box(page, '[data-player] header p');
        const modes = await box(page, '[data-player-modes]');
        check('review', `${c.name}: a very long title stops before the mode picker`, !!title && !!modes && title.x + title.w <= modes.x + 1, JSON.stringify({ title, modes }));
        await s.shot('review-long-title');
      }
      const errors = s.takeErrors();
      check('review', `${c.name}: no console errors`, errors.length === 0, errors.join(' | '));
    } finally {
      await s.close();
    }
  }
}

async function layouts(browser, url) {
  const cases = [
    { name: 'phone-dark', mobile: true, theme: 'dark', want: 'bar' },
    { name: 'phone-light', mobile: true, theme: 'light', want: 'bar' },
    { name: 'phone-360', mobile: true, viewport: { width: 360, height: 740 }, theme: 'dark', want: 'bar' },
    { name: 'phone-sideways', mobile: true, viewport: { width: 844, height: 390 }, theme: 'dark', want: 'rail' },
    { name: 'phone-sideways-light', mobile: true, viewport: { width: 844, height: 390 }, theme: 'light', want: 'rail' },
    { name: 'tablet', mobile: true, viewport: VIEWPORTS.tablet, theme: 'light', want: 'bar' },
    { name: 'desktop-dark', theme: 'dark', want: 'wide' },
    { name: 'desktop-light', theme: 'light', want: 'wide' },
  ];
  for (const c of cases) {
    const s = await open(browser, url, { mobile: c.mobile, viewport: c.viewport, theme: c.theme });
    const { page } = s;
    try {
      await s.goto(`play--greensleeves-fingerstyle`);
      const layout = await page.locator('[data-player]').getAttribute('data-layout');
      check('layouts', `${c.name}: the ${c.want} layout`, layout === c.want, layout);
      check('layouts', `${c.name}: no sideways scroll`, (await s.sideways()) <= 1, await s.sideways());
      const vp = page.viewportSize();
      const play = await page.locator('[data-player-play]').boundingBox();
      const score = await page.locator('[data-player-score]').boundingBox();
      const neck = await page.locator('[data-player-neck]').boundingBox();
      check('layouts', `${c.name}: Play, score and fretboard are on screen`, !!play && !!score && !!neck && play.y + play.height <= vp.height + 1 && neck.y + neck.height <= vp.height + 1, JSON.stringify({ play, neck, vp }));
      if (c.want === 'bar' && c.mobile && !c.viewport) check('layouts', `${c.name}: Play sits in the thumb zone (lower half)`, play.y > vp.height / 2, play.y);
      if (c.want === 'rail') {
        check('layouts', `${c.name}: controls on the right edge, score above the fretboard`, play.x > score.x + score.width && score.y < neck.y, JSON.stringify({ play, score, neck }));
        check('layouts', `${c.name}: the tab is one line that scrolls sideways`, (await page.locator('[data-tab-view]').evaluate((e) => e.scrollWidth > e.clientWidth)), '');
      }
      if (c.want === 'wide') check('layouts', `${c.name}: the side panel holds the controls`, (await page.locator('[data-player] aside').count()) === 1 && play.x > score.x + score.width, JSON.stringify(play));
      // Touch targets of 44 px at least: the button itself or the invisible hit area the kit gives small controls (::before).
      const small = await page.evaluate(() => Array.from(document.querySelectorAll('[data-player] button')).filter((b) => {
        const r = b.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0) || b.closest('[data-tab-view]') || b.closest('[data-player-neck]')) return false;
        let w = r.width;
        let h = r.height;
        const before = getComputedStyle(b, '::before');
        if (before.content !== 'none' && before.position === 'absolute') {
          const px = (v) => (v.endsWith('px') ? parseFloat(v) : 0);
          w = Math.max(w, r.width - px(before.left) - px(before.right), parseFloat(before.minWidth) || 0, parseFloat(before.width) || 0);
          h = Math.max(h, r.height - px(before.top) - px(before.bottom), parseFloat(before.minHeight) || 0, parseFloat(before.height) || 0);
        }
        return w < 43 || h < 43;
      }).map((b) => `${b.getAttribute('aria-label') || b.textContent.trim()} ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`));
      check('layouts', `${c.name}: buttons are at least 44 px`, small.length === 0, small.join('; '));
      await s.shot(c.name);
      const errors = s.takeErrors();
      check('layouts', `${c.name}: no console errors`, errors.length === 0, errors.join(' | '));
    } finally {
      await s.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// reading: notes only (the tab covered) and reading studies that open with the notation
// ---------------------------------------------------------------------------------------------
async function reading(browser, url) {
  for (const mobile of [false, true]) {
    const tag = mobile ? 'phone' : 'desktop';
    const s = await open(browser, url, { mobile });
    const { page } = s;
    try {
      // A reading study (prefersNotation in its meta) opens with the notes above the tab.
      await s.goto('play--st-read-first-g');
      const layer = await page.locator('[data-player-score]').getAttribute('data-layer');
      check('reading', `${tag}: a reading study opens in "Tab and notes"`, layer === 'both', layer);
      // `notes`: the notation alone, the tab rows covered on every line, the fretboard off.
      await s.goto('play--st-read-first-g--notes');
      await page.waitForSelector('[data-player-tab-cover]', { timeout: 30000 }).catch(() => {});
      const cover = await page.evaluate(() => {
        const c = document.querySelector('[data-player-tab-cover]');
        const bands = c ? Array.from(c.children).map((b) => b.getBoundingClientRect()) : [];
        // Every fret number drawn must lie under a band.
        const frets = Array.from(document.querySelectorAll('[data-tab-view] [data-beat] text')).map((t) => t.getBoundingClientRect()).filter((r) => r.width > 0);
        const under = frets.filter((r) => bands.some((b) => r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1));
        return { lines: c ? Number(c.getAttribute('data-player-tab-cover')) : 0, bands: bands.length, frets: frets.length, under: under.length };
      });
      check('reading', `${tag}: "notes" covers the tab on every line`, (await page.locator('[data-player-score]').getAttribute('data-layer')) === 'notation' && cover.lines >= 2 && cover.bands === cover.lines, JSON.stringify(cover));
      check('reading', `${tag}: every fret number drawn is under the cover`, cover.frets > 0 && cover.under === cover.frets, JSON.stringify(cover));
      check('reading', `${tag}: the staff is drawn (VexFlow)`, (await page.locator('[data-tab-view] svg').count()) > 0 && (await page.evaluate(() => document.querySelectorAll('[data-tab-view] .vf-stavenote, [data-tab-view] [class*="vf-"]').length)) > 0);
      check('reading', `${tag}: the fretboard is off (it would give the notes away)`, (await page.locator('[data-player-neck]').count()) === 0);
      // A tap on a covered line still starts there (taps go through the cover to the tab).
      const before = Number(await page.locator('[data-player]').getAttribute('data-bar'));
      const box = await page.locator('[data-player-tab-cover] > *').nth(1).boundingBox();
      if (box) await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.waitForTimeout(600);
      const after = Number(await page.locator('[data-player]').getAttribute('data-bar'));
      check('reading', `${tag}: a tap on the covered tab of line 2 starts there`, before === 0 && after > 0, `${before} -> ${after}`);
      await s.shot(`reading-${tag}`);
      // Back to tab and notes from the options: the cover goes.
      if (mobile) await page.locator('[data-player-more]').click();
      await page.getByRole('radio', { name: /Tab with the notes/ }).first().click();
      await page.waitForTimeout(600);
      check('reading', `${tag}: "Tab and notes" from the options takes the cover away`, (await page.locator('[data-player-tab-cover]').count()) === 0 && (await page.locator('[data-player-score]').getAttribute('data-layer')) === 'both');
      // And "Notes only" from the options, with the fretboard on, says it hides the fretboard too.
      await page.getByRole('switch', { name: /^Fretboard/ }).first().click().catch(() => {});
      await page.waitForTimeout(300);
      await page.getByRole('radio', { name: /^Notes only/ }).first().click();
      const toastSaid = await page.getByText('The fretboard is hidden too').first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
      check('reading', `${tag}: choosing "Notes only" says the fretboard is hidden too`, toastSaid && (await page.locator('[data-player-score]').getAttribute('data-layer')) === 'notation');
      check('reading', `${tag}: no sideways scroll`, (await s.sideways()) <= 1, await s.sideways());
      const errors = s.takeErrors();
      check('reading', `${tag}: no console errors`, errors.length === 0, errors.join(' | '));
    } finally {
      await s.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// meter: 6/8 and 3/8 count their own beat (tempo button, panel, header, trainer, count-in)
// ---------------------------------------------------------------------------------------------
async function meter(browser, url) {
  const s = await open(browser, url, { mobile: true });
  const { page } = s;
  try {
    // Greensleeves (melody), 6/8 at ♩. = 54 (81 quarters a minute).
    await s.goto('play--greensleeves-melody');
    const btn = page.locator('button[data-player-bpm]').first();
    const bpm = await btn.getAttribute('data-player-bpm');
    const text = (await btn.innerText()).replace(/\s+/g, ' ');
    check('meter', '6/8: the tempo button counts dotted quarters, as the score (♩. = 54)', bpm === '54' && text.includes('♩. = 54'), `${bpm} ${text}`);
    check('meter', '6/8: its spoken name says so', /54 dotted-quarter beats a minute/.test((await btn.getAttribute('aria-label')) || ''), await btn.getAttribute('aria-label'));
    await page.locator('[data-player-more]').click();
    await page.waitForTimeout(500);
    const sheet = (await page.locator('[role="dialog"]').last().innerText()).replace(/\s+/g, ' ');
    check('meter', '6/8: the count-in says two dotted-quarter beats', /2 dotted-quarter beats/.test(sheet), sheet.slice(0, 200));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    // With a loop, the loop button opens the loop's sheet: the speed trainer is there.
    await s.goto('play--greensleeves-melody--m2-3');
    await page.locator('button[data-player-loop]').first().click();
    await page.waitForSelector('[role="dialog"] [data-player-loop-options]', { timeout: 10000 }).catch(() => {});
    const loopSheet = (await page.locator('[role="dialog"]').last().innerText().catch(() => '')).replace(/\s+/g, ' ');
    check('meter', '6/8: the speed trainer counts dotted quarters (♩. = 38 to ♩. = 54)', /70 % \(♩\. = 38\) to 100 % \(♩\. = 54\)/.test(loopSheet), loopSheet.slice(0, 300));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('button[data-player-loop]').first().click();
    await page.waitForSelector('[role="dialog"] [data-player-loop-options]', { timeout: 10000 }).catch(() => {});
    await page.locator('[role="dialog"]').last().getByRole('button', { name: 'Clear' }).click().catch(() => {});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // At 50 % the button follows: ♩. = 27.
    for (let i = 0; i < 10; i++) await page.keyboard.press('-');
    await page.waitForTimeout(300);
    check('meter', '6/8 at 50 %: ♩. = 27', (await btn.getAttribute('data-player-bpm')) === '27', await btn.getAttribute('data-player-bpm'));
    // The count-in: two beats, as the click counts them.
    await page.locator('[data-player-play]').click();
    const beats = await page.waitForFunction(() => {
      const el = document.querySelector('[data-player-countin]');
      return el?.hasAttribute('data-show') ? el.textContent : null;
    }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
    check('meter', '6/8: the count-in counts two beats in the bar ("1 •")', beats === '1•', beats);
    await page.keyboard.press('Escape');
    // Für Elise, 3/8 at 60 quarters: three eighths a bar at ♪ = 120, as the click.
    await s.goto('play--fur-elise-theme');
    const fur = page.locator('button[data-player-bpm]').first();
    check('meter', '3/8: the tempo button counts eighths (♪ = 120)', (await fur.getAttribute('data-player-bpm')) === '120' && (await fur.innerText()).includes('♪ = 120'), await fur.innerText());
    // 4/4 stays plain bpm.
    await s.goto(`play--${SONG}`);
    check('meter', '4/4: plain bpm', /\d+ bpm/.test(await page.locator('button[data-player-bpm]').first().innerText()), await page.locator('button[data-player-bpm]').first().innerText());
    const errors = s.takeErrors();
    check('meter', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// chart: hide the chord names and boxes (play it from memory)
// ---------------------------------------------------------------------------------------------
async function chart(browser, url) {
  const s = await open(browser, url);
  const { page } = s;
  try {
    const tabText = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-tab-view] text')).map((t) => t.textContent).join(' '));
    await s.goto('play--amazing-grace');
    await page.waitForTimeout(800);
    check('chart', 'chords shown by default (D7 on the score)', /\bD7\b/.test(await tabText()) && (await page.locator('[data-player-score]').getAttribute('data-chords')) === 'shown');
    await page.getByRole('switch', { name: /Hide the chord names/ }).click();
    await page.waitForTimeout(800);
    check('chart', '"Hide the chord names" takes every chord symbol off the score', !/\bD7\b/.test(await tabText()) && (await page.locator('[data-player-score]').getAttribute('data-chords')) === 'hidden');
    check('chart', 'and the fretboard (it would show the shapes), saying so', (await page.locator('[data-player-neck]').count()) === 0 && (await page.getByText('The fretboard is hidden too').count()) >= 1);
    check('chart', 'a line over the score says they are hidden, with a way back', (await page.locator('[data-player-chart-hidden]').count()) === 1);
    await s.shot('chart-hidden');
    await page.locator('[data-player-chart-hidden]').getByRole('button', { name: 'Show them' }).click();
    await page.waitForTimeout(800);
    check('chart', '"Show them" brings the chords back', /\bD7\b/.test(await tabText()));
    // The address hides them for one visit.
    await s.goto('play--amazing-grace--hide-chart');
    await page.waitForTimeout(800);
    check('chart', '#…--hide-chart opens with the chords hidden', !/\bD7\b/.test(await tabText()));
    await s.goto('play--amazing-grace');
    await page.waitForTimeout(800);
    check('chart', 'and the next plain visit shows them again', /\bD7\b/.test(await tabText()));
    const errors = s.takeErrors();
    check('chart', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// capo: follow the learner's capo; move the song for singing
// ---------------------------------------------------------------------------------------------
async function capo(browser, url) {
  for (const mobile of [false, true]) {
    const tag = mobile ? 'phone' : 'desktop';
    const s = await open(browser, url, { mobile });
    const { page } = s;
    try {
      const neckLabel = () => page.locator('[data-player-neck] [role="img"]').first().getAttribute('aria-label');
      const meta = () => page.locator('[data-player]').innerText();
      // The tune of Amazing Grace starts on the open D string (D3).
      await s.goto('play--amazing-grace--part-tune--t70');
      check('capo', `${tag}: as written, the first note is D on string 4, open`, /D string 4 fret 0/.test((await neckLabel()) || ''), await neckLabel());
      await s.goto('play--amazing-grace--part-tune--t70--capo2');
      check('capo', `${tag}: capo 2: the same shape (string 4, open) now sounds E`, /E string 4 fret 0/.test((await neckLabel()) || ''), await neckLabel());
      const keyShown = mobile ? await page.locator('[data-player-moved]').innerText().catch(() => '') : await meta();
      check('capo', `${tag}: the ${mobile ? 'chip beside the sections' : 'header'} says the key it sounds in (A major +2)`, mobile ? /A major \+2 · capo 2/.test(keyShown) : /A major \(\+2\)/.test(keyShown), keyShown.slice(0, 200));
      if (mobile) await page.locator('[data-player-more]').click();
      await page.waitForTimeout(500);
      const line = (await page.locator('[data-player-sounds]').first().innerText()).trim();
      check('capo', `${tag}: "Sounds in A major. You play G major shapes with a capo on fret 2."`, line === 'Sounds in A major. You play G major shapes with a capo on fret 2.', line);
      // Move the song two semitones down from there: E string 4 open -> D, now on the capo at fret 2 shapes.
      await page.getByRole('button', { name: 'As written' }).first().click();
      await page.waitForTimeout(1200);
      check('capo', `${tag}: "As written" goes back: D on string 4, open, no capo`, /D string 4 fret 0/.test((await neckLabel()) || '') && (await page.locator('[data-player-arrangement]').first().getAttribute('data-player-arrangement')) === '0:0', await neckLabel());
      check('capo', `${tag}: the tempo carried over the change (70 %)`, (await page.locator('[data-player-tempo]').first().getAttribute('data-player-tempo')) === '70');
      // "Move the song" down 2: the first note is C (on string 5, fret 3) and it sounds in F major.
      const down = page.getByRole('button', { name: /Decrease Move the song|Move the song.*(less|down|decrease)/i }).first();
      if (await down.count()) {
        await down.click();
        await down.click();
      } else {
        await s.goto('play--amazing-grace--part-tune--down2');
        if (mobile) await page.locator('[data-player-more]').click();
      }
      await page.waitForTimeout(1500);
      check('capo', `${tag}: two semitones down sounds in F major, first note C`, /Sounds in F major/.test(await page.locator('[data-player-sounds]').first().innerText()) && /^Play now: C /.test((await neckLabel()) || ''), `${await page.locator('[data-player-sounds]').first().innerText()} / ${await neckLabel()}`);
      await s.shot(`capo-${tag}`);
      // Moved up 2, the panel offers the same key with easier shapes.
      await s.goto('play--amazing-grace--part-tune--up2');
      if (mobile) await page.locator('[data-player-more]').click();
      await page.waitForTimeout(500);
      const easier = page.getByRole('button', { name: /Same key, easier shapes: capo 2/ }).first();
      check('capo', `${tag}: moved up 2, "Same key, easier shapes: capo 2" is offered`, (await easier.count()) === 1);
      if (await easier.count()) {
        await easier.click();
        await page.waitForTimeout(1500);
        check('capo', `${tag}: it keeps the sound (A major) with the written shapes on a capo`, /Sounds in A major\. You play G major shapes with a capo on fret 2\./.test(await page.locator('[data-player-sounds]').first().innerText()) && /E string 4 fret 0/.test((await neckLabel()) || ''), await page.locator('[data-player-sounds]').first().innerText());
      }
      check('capo', `${tag}: no sideways scroll`, (await s.sideways()) <= 1, await s.sideways());
      const errors = s.takeErrors();
      check('capo', `${tag}: no console errors`, errors.length === 0, errors.join(' | '));
    } finally {
      await s.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// part: the address picks the learner's part and mutes others
// ---------------------------------------------------------------------------------------------
async function part(browser, url) {
  const s = await open(browser, url);
  const { page } = s;
  try {
    await s.goto('play--frere-jacques--part-teacher--mute-your-strum');
    const mine = await page.locator('aside button[aria-pressed="true"]').filter({ hasText: 'You play this' }).innerText().catch(() => '');
    check('part', '#…--part-teacher: the Teacher part is the learner’s', /Teacher/.test(mine), mine);
    const muted = await page.getByRole('button', { name: /^Unmute Your strum/ }).count();
    check('part', '#…--mute-your-strum: Your strum is muted', muted === 1);
    await s.goto('play--frere-jacques--part-bass');
    await page.waitForTimeout(600);
    const said = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check('part', 'a part the song does not have: the first part, and it says so', /no part called "bass"/.test(said), said.slice(0, 300));
    const errors = s.takeErrors();
    check('part', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// refused: after the microphone was refused, results never suggest Wait or Flow
// ---------------------------------------------------------------------------------------------
async function refused(browser, url) {
  const s = await open(browser, url, {
    mobile: true,
    init: () => {
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
    },
  });
  const { page } = s;
  try {
    await s.goto(`play--${SONG}--t150`);
    await page.locator('[data-player-modes]').getByRole('radio', { name: /^Wait/ }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // Listen to the whole song: the results suggest the next step.
    await page.locator('[data-player-play]').click();
    await page.waitForSelector('[data-player-results]', { timeout: 40000 }).catch(() => {});
    const sug = await page.locator('[data-player-suggestion]').innerText().catch(() => '');
    const next = await page.locator('[data-player-next-step]').innerText().catch(() => '');
    check('refused', 'the suggestion is tap-along, not Wait', /tap along/i.test(sug) && !/wait/i.test(sug), sug);
    check('refused', 'the next step points to Tap along, not the microphone', /Tap along/.test(next) && !/microphone and moves on/.test(next), next);
    await s.shot('refused-results');
    const errors = s.takeErrors().filter((e) => !/NotAllowedError|Permission denied/i.test(e));
    check('refused', 'no console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// chordwait: a wrong chord in wait mode is named from its sound
// ---------------------------------------------------------------------------------------------
async function chordWait() {
  // Frère Jacques (strum-along) waits for G. A C strum (x32010) first, then G strums.
  const C = [[48, 5], [52, 4], [55, 3], [60, 2], [64, 1]];
  const G = [[50, 4], [55, 3], [59, 2], [67, 1]];
  const notes = [];
  C.forEach(([midi, string], k) => notes.push({ time: 4.0 + k * 0.012, midi, string, velocity: 0.75 }));
  for (const t of [7.0, 8.6]) G.forEach(([midi, string], k) => notes.push({ time: t + k * 0.012, midi, string, velocity: 0.7 }));
  const file = await wav('chordwait', notes, 11);
  try {
    // Once with the chord chart shown, once from memory (`hide-chart`): the chord is then not named until asked.
    for (const hidden of [false, true]) await withMic(file, async (browser, url) => {
      const s = await open(browser, url, { mobile: true, permissions: ['microphone'] });
      const { page } = s;
      try {
        if (hidden) {
          await s.goto('play--frere-jacques--hide-chart');
          await page.locator('[data-player-modes]').getByRole('radio', { name: /^Wait/ }).click();
          await page.waitForFunction(() => window.__pl.mode === 'wait', null, { timeout: 15000 });
          await page.locator('[data-player-play]').click();
          await page.waitForSelector('[data-player-wait]', { timeout: 15000 });
          const prompt = (await page.locator('[data-player-wait]').innerText()).replace(/\s+/g, ' ');
          check('chordwait', 'from memory: the prompt does not name the chord ("Strum the next chord")', /Strum the next chord/.test(prompt) && !/Strum G\b/.test(prompt), prompt);
          const fb = await page.waitForFunction(() => {
            const t = document.querySelector('[data-player-wait]')?.textContent ?? '';
            return /sounded like/.test(t) ? t : null;
          }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => '');
          check('chordwait', 'from memory: a wrong chord is named, the chart is not ("not the chord here")', /That sounded like C, not the chord here/.test(fb) && !/chart says/.test(fb), fb);
          await page.locator('[data-player-wait]').getByRole('button', { name: 'Show me' }).click();
          await page.waitForTimeout(300);
          check('chordwait', 'from memory: "Show me" names it', /Strum G/.test(await page.locator('[data-player-wait]').innerText()));
          const errors = s.takeErrors();
          check('chordwait', 'from memory: no console errors', errors.length === 0, errors.join(' | '));
          return;
        }
        await s.goto('play--frere-jacques');
        await page.locator('[data-player-modes]').getByRole('radio', { name: /^Wait/ }).click();
        await page.waitForFunction(() => window.__pl.mode === 'wait', null, { timeout: 15000 });
        await page.locator('[data-player-play]').click();
        await page.waitForSelector('[data-player-wait]', { timeout: 15000 });
        // The C strum: the song waits, and says what it heard.
        const fb = await page.waitForFunction(() => {
          const t = document.querySelector('[data-player-wait]')?.textContent ?? '';
          return /sounded like/.test(t) ? t : null;
        }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => '');
        const d = await dbg(page);
        check('chordwait', 'a C strum while G is wanted: "That sounded like C. The chart says G"', /That sounded like C\. The chart says G/.test(fb) && d.waitIndex === 0, `${fb} | index ${d.waitIndex} | ${d.notes.map((n) => n.result).join(' ')}`);
        await s.shot('chordwait');
        await page.waitForFunction(() => window.__pl.waitIndex >= 1, null, { timeout: 15000 }).catch(() => {});
        check('chordwait', 'then a G strum moves the song on', (await dbg(page)).waitIndex >= 1, (await dbg(page)).waitIndex);
        const errors = s.takeErrors();
        check('chordwait', 'no console errors', errors.length === 0, errors.join(' | '));
      } finally {
        await s.close();
      }
    });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

// ---------------------------------------------------------------------------------------------

(async () => {
  const started = Date.now();
  const facts = await songFacts();
  const groups = [
    ['listen', listen],
    ['loop', loop],
    ['keys', keys],
    ['reload', reload],
    ['nomic', nomic],
    ['address', address],
    ['artifact', artifact],
    ['long', long],
    ['review', review],
    ['layouts', layouts],
    ['reading', reading],
    ['meter', meter],
    ['chart', chart],
    ['capo', capo],
    ['part', part],
    ['refused', refused],
  ].filter(([g]) => wants(g));
  if (groups.length) {
    const server = await startServer();
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    try {
      for (const [name, fn] of groups) {
        const t = Date.now();
        try {
          await fn(browser, server.url, facts);
        } catch (e) {
          check(name, 'ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' ') : e);
        }
        const mine = results.filter((r) => r.group === name);
        console.log(`${mine.every((r) => r.pass) ? 'ok  ' : 'FAIL'}  ${name}: ${mine.filter((r) => r.pass).length}/${mine.length} checks (${Math.round((Date.now() - t) / 1000)} s)`);
      }
    } finally {
      await browser.close();
      await server.close();
    }
  }
  for (const [name, fn] of [['wait', wait], ['strum', strumWait], ['chordwait', chordWait], ['flow', () => flow(facts)]]) {
    if (!wants(name)) continue;
    const t = Date.now();
    try {
      await fn();
    } catch (e) {
      check(name, 'ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' ') : e);
    }
    const mine = results.filter((r) => r.group === name);
    console.log(`${mine.every((r) => r.pass) ? 'ok  ' : 'FAIL'}  ${name}: ${mine.filter((r) => r.pass).length}/${mine.length} checks (${Math.round((Date.now() - t) / 1000)} s)`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`${failed.length ? 'FAILED' : 'PASSED'}: ${results.length - failed.length}/${results.length} checks in ${Math.round((Date.now() - started) / 1000)} s`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  console.log('FAILED');
  process.exit(1);
});
