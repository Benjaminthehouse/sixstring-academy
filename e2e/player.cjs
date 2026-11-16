#!/usr/bin/env node
/**
 * Browser check of the Player (src/features/player). Run:
 *   node e2e/player.cjs [--verbose] [--shots] [--only listen,loop,keys,wait,flow,reload,nomic,layouts]
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
 *  flow     desktop, fake microphone: a recording of the melody started in time with the song,
 *           with bar 2 played 130 ms early on purpose: those notes are judged "early", the others
 *           perfect or good; the results panel shows accuracy, stars, the heat strip and a
 *           suggestion; recordActivity stored song:hot-cross-buns with the accuracy
 *  reload   phone: play, pause at bar 2 with a loop and 80 % tempo set, reload: the player says
 *           where it picked up, and the bar, the loop and the tempo are back
 *  nomic    a browser with no microphone: choosing Wait shows the microphone panel once with
 *           "Tap along instead", tap-along plays and taps are timed
 *  long     phone, a 200-bar study saved to the library: only the lines near the view are drawn,
 *           playing from bar 40 at 150 % the score scrolls by itself so the line being played and
 *           the next one stay in view, frames keep coming (the rate on this shared machine is
 *           reported; a real phone was not measured)
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
    check('listen', 'each bar event reaches the screen when the bar is heard (within 50 ms, never early)', late.every((x) => x >= -0.002 && x < 0.05), late.map((x) => (x * 1000).toFixed(1)).join(' '));
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
    const banner = await page.evaluate(() => /Bar 40|bar 40/.test(document.body.innerText) || (window.__pl.cursor && window.__pl.cursor.bar === 39));
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
    // A scroll by the learner is respected for a moment.
    await page.locator('[data-player-score]').evaluate((el) => {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
      el.scrollTop = 0;
    });
    await page.waitForTimeout(600);
    const held = await page.locator('[data-player-score]').evaluate((el) => el.scrollTop);
    check('long', 'when the learner scrolls, the view waits before following again', held < 50, held);
    await page.keyboard.press('Escape');
    check('long', 'the address started it at bar 40 at 150 %', banner && (await page.locator('[data-player-tempo]').first().getAttribute('data-player-tempo')) === '150');
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
async function layouts(browser, url) {
  const cases = [
    { name: 'phone-dark', mobile: true, theme: 'dark', want: 'bar' },
    { name: 'phone-light', mobile: true, theme: 'light', want: 'bar' },
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

(async () => {
  const started = Date.now();
  const facts = await songFacts();
  const groups = [
    ['listen', listen],
    ['loop', loop],
    ['keys', keys],
    ['reload', reload],
    ['nomic', nomic],
    ['long', long],
    ['layouts', layouts],
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
  for (const [name, fn] of [['wait', wait], ['flow', () => flow(facts)]]) {
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
