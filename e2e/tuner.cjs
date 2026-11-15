#!/usr/bin/env node
/**
 * Browser check of the Tuner screen (#tuner) in real Chromium. Run:
 *   node e2e/tuner.cjs [--quick] [--only group,group] [--verbose]
 *
 * Microphone recordings are built from the pitch module's own test signals (`@/core/pitch`:
 * pluckedString, concat, silence, addNoise, whiteNoise, encodeWav; see tuner-lib.cjs) and fed to
 * the real screen as the fake microphone. The check
 * reads what the screen mirrors on its readout element (data-state, data-note, data-cents,
 * data-string) over time and cuts that into the notes that were heard.
 *
 * Groups:
 *   standard   every string of standard tuning at -30, +30, -8, +8, -2, +2 and 0 cents: the right
 *              string is named, the settled reading is within 1.5 cents of the truth, "in tune" is
 *              confirmed only inside the tolerance; all six ticked at the end, one tuner activity.
 *              Room noise 30 dB below the playing here (45 dB in the other groups)
 *   tunings    Drop D and Open G chosen through the picker, heard string by string
 *   chromatic  notes that are not strings of the tuning, named in chromatic mode
 *   reference  A4 = 432 Hz from the settings: targets move, the 440 Hz A reads 32 cents sharp
 *   capo       capo on fret 2: targets move up two frets and the screen says so
 *   quiet      silence and steady noise: no note, ever
 *   far        a string a minor third flat: held on the string (or guided) it gives the far-below
 *              warning, never "loosen" for the neighbouring string; in automatic mode the low E
 *              does too, and the A string (whose note lies nearer the low E) makes it ask which
 *              string it is instead of guessing
 *   guide      the first-time flow: Start leads through all six strings to the summary
 *   byear      the microphone refused (declined, and inside the Claude viewer): no dead end, the
 *              reference notes really sound at the right pitch, the by-ear flow reaches its summary
 *   controls   keyboard shortcuts, lock and release, stop and start, tab hidden and back, leaving
 *              the screen releases the microphone; no sideways scroll, no console errors
 *   autostart  the browser's real autoplay policy (the harness normally switches it off): with
 *              permission granted the screen either listens by itself or offers Start, never a
 *              "listening" screen that hears nothing
 *   picker     the tuning picker: search, how to get there from standard, a custom tuning that is
 *              saved, remembered and removed
 *   layout     a short phone (375 x 667) keeps every string above the action bar while listening
 *              (the tab bar steps aside, and comes back on stop); a phone held sideways puts the
 *              strings beside the readout, all on screen
 *   review     cases an independent review caught: ticks kept while a string rings out into room
 *              noise (waveguide strings, 44.1 kHz), no offset number for another string's note,
 *              a first visit shows Guided before Start and keeps Auto when it is chosen
 *
 * A group that fails is run once more (the machine is shared; audio timing can slip under load).
 * Prints one line per check when --verbose, a summary per group, then PASSED or FAILED.
 */
const { chromium } = require('playwright');
const { withApp, startServer } = require('./lib/harness.cjs');
const lib = require('./tuner-lib.cjs');

const argv = process.argv.slice(2);
const quick = argv.includes('--quick');
const verbose = argv.includes('--verbose');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;

const STRINGS = [
  { midi: 40, note: 'E2', string: '6' },
  { midi: 45, note: 'A2', string: '5' },
  { midi: 50, note: 'D3', string: '4' },
  { midi: 55, note: 'G3', string: '3' },
  { midi: 59, note: 'B3', string: '2' },
  { midi: 64, note: 'E4', string: '1' },
];
/** Ends on 0 so every string finishes ticked. */
const OFFSETS = [-30, 30, -8, 8, -2, 2, 0];
const TOLERANCE = 3;
/** The standard-tuning group is heard through a noisier room than the rest (see makeRecording). */
const STANDARD_ROOM_SNR_DB = 30;
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];

let results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: detail ? String(detail) : '' });
  if (verbose || !pass) console.log(`    ${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (page, value, timeout = 30000) => page.waitForSelector(`${lib.READOUT}[data-state="${value}"]`, { timeout });
const attr = (page, name, value, timeout = 15000) => page.waitForSelector(`${lib.READOUT}[data-${name}="${value}"]`, { timeout });

/** Open the tuner with a recording as the microphone. The screen starts listening by itself (permission is granted). */
async function open({ recording, mobile = false, seed = {}, init, fakeDevices = false }, fn) {
  const opts = { mobile };
  if (recording) opts.fakeAudio = recording.fakeAudio;
  if (fakeDevices) opts.fakeDevices = true;
  return withApp(opts, async (ctx) => {
    await lib.seed(ctx.context, lib.seedStorage(seed));
    if (init) await ctx.context.addInitScript(init);
    await ctx.goto('tuner');
    await lib.waitForTuner(ctx.page);
    return fn(ctx);
  });
}

/**
 * Stop the automatic start, let `setup` change settings through the UI, then start again: the
 * recording plays from its beginning each time the microphone is opened.
 */
async function restart(page, setup) {
  await state(page, 'listening');
  await page.click('[data-tuner-stop]');
  await state(page, 'idle');
  if (setup) await setup();
  await lib.startLog(page);
  await page.click('[data-tuner-start]');
  await state(page, 'listening');
}

async function heard(page, recording, extraMs = 400) {
  await sleep(recording.seconds * 1000 + extraMs);
  return lib.episodes(await lib.readLog(page));
}

function noErrors(errors, label = 'no console errors') {
  const real = errors.filter((e) => !BENIGN.some((b) => b.test(e)));
  check(label, real.length === 0, real.join(' | '));
}

/** Tuner activities recorded in the progress store (the same module instance the app uses). */
const tunerCount = (page) => page.evaluate(async () => (await import('/src/core/progress/index.ts')).getProgress().stats['count.tuner'] ?? 0);

async function chooseTuning(page, name) {
  // Phones have the tuning chip in the readout; wide screens a "Change" button on the tuning card.
  if (await page.locator('[data-tuner-tuning]').count()) await page.click('[data-tuner-tuning]');
  else await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('searchbox').fill(name);
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
  await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 });
}

// ---------------------------------------------------------------------------------------------

async function standard() {
  const strings = quick ? [STRINGS[0], STRINGS[5]] : STRINGS;
  const plan = strings.flatMap((s) => OFFSETS.map((cents) => ({ ...s, cents })));
  // Room noise 30 dB below the playing (about -55 dBFS): a phone on a music stand in an ordinary room.
  const recording = await lib.makeRecording('standard', plan.map((p) => ({ pluck: { midi: p.midi, cents: p.cents, dur: 1.5 }, gap: 0.6 })), { lead: 3, roomSnrDb: STANDARD_ROOM_SNR_DB });
  await open({ recording }, async ({ page, errors }) => {
    // Permission is already granted: the screen listens without a tap, in automatic mode.
    await state(page, 'listening');
    check('listens as soon as the screen opens when permission is granted', true);
    check('automatic mode is the default', (await lib.readout(page)).mode === 'auto');
    await restart(page);
    const eps = await heard(page, recording);
    check(`heard ${plan.length} separate notes`, eps.length === plan.length, `${eps.length} episodes: ${eps.map((e) => e.notes.join('/')).join(' ')}`);
    let worst = 0;
    let worstLabel = '';
    plan.forEach((p, i) => {
      const ep = eps[i];
      if (!ep) return;
      const label = `${p.note} at ${p.cents > 0 ? '+' : ''}${p.cents} cents`;
      check(`${label}: names ${p.note} on string ${p.string}`, ep.notes.length === 1 && ep.notes[0] === p.note && ep.strings.length === 1 && ep.strings[0] === p.string, `notes ${ep.notes} strings ${ep.strings}`);
      const error = Math.abs(ep.cents - p.cents);
      if (error > worst) {
        worst = error;
        worstLabel = `${label}, read ${ep.cents}`;
      }
      check(`${label}: reads within 1.5 cents`, error <= 1.5, `read ${ep.cents}`);
      const expectInTune = Math.abs(p.cents) <= TOLERANCE;
      check(`${label}: ${expectInTune ? 'confirmed in tune' : 'not confirmed'}`, ep.inTune === expectInTune, `in tune: ${ep.inTune}, instructions ${ep.instructions}`);
      const want = p.cents < -TOLERANCE ? /tighten/ : p.cents > TOLERANCE ? /loosen/ : /in-tune/;
      check(`${label}: says ${want.source}`, ep.instructions.some((x) => want.test(x)), ep.instructions.join(','));
    });
    console.log(`    largest settled reading error ${worst.toFixed(2)} cents over ${plan.length} notes${worstLabel ? ` (${worstLabel})` : ''}`);
    const final = await lib.readout(page);
    const expectTuned = strings.map((s) => s.string).join(',');
    check('every string ends ticked', final.tuned === expectTuned, `data-tuned="${final.tuned}"`);
    if (!quick) {
      check('says all six strings are in tune', (await page.getByText('All 6 strings are in tune').count()) > 0);
      check('records one tuner activity for the visit', (await tunerCount(page)) === 1, `count.tuner = ${await tunerCount(page)}`);
    }
    noErrors(errors);
  });
}

async function tunings() {
  const cases = [
    { name: 'Drop D', id: 'drop-d', notes: [[38, 'D2', 0], [45, 'A2', -8], [50, 'D3', 2], [55, 'G3', 0], [59, 'B3', 8], [64, 'E4', -2]] },
    { name: 'Open G', id: 'open-g', notes: [[38, 'D2', 1], [43, 'G2', -9], [50, 'D3', -1], [55, 'G3', 12], [59, 'B3', 0], [62, 'D4', 2]] },
  ];
  for (const c of quick ? cases.slice(0, 1) : cases) {
    const recording = await lib.makeRecording(c.id, c.notes.map(([midi, , cents]) => ({ pluck: { midi, cents, dur: 1.5 }, gap: 0.6 })), { lead: 3 });
    await open({ recording }, async ({ page, errors }) => {
      await restart(page, () => chooseTuning(page, c.name));
      check(`${c.name}: the picker applied it`, (await page.getAttribute('[data-tuner-layout]', 'data-tuning')) === c.id);
      const pegs = await page.$$eval('button[data-string][data-note]', (els) => els.map((e) => e.dataset.note).join(' '));
      check(`${c.name}: the strings show its notes`, pegs === c.notes.map((n) => n[1]).join(' '), pegs);
      const eps = await heard(page, recording);
      check(`${c.name}: heard ${c.notes.length} notes`, eps.length === c.notes.length, `${eps.length}: ${eps.map((e) => e.notes.join('/')).join(' ')}`);
      c.notes.forEach(([, note, cents], i) => {
        const ep = eps[i];
        if (!ep) return;
        const string = String(c.notes.length - i);
        check(`${c.name}: ${note} is string ${string}`, ep.notes.join() === note && ep.strings.join() === string, `notes ${ep.notes} strings ${ep.strings}`);
        check(`${c.name}: ${note} reads ${cents} within 1.5 cents`, Math.abs(ep.cents - cents) <= 1.5, `read ${ep.cents}`);
        check(`${c.name}: ${note} ${Math.abs(cents) <= TOLERANCE ? 'confirmed' : 'not confirmed'}`, ep.inTune === (Math.abs(cents) <= TOLERANCE));
      });
      // The choice is remembered.
      await page.reload();
      await lib.waitForTuner(page);
      const pegsAfter = await page.$$eval('button[data-string][data-note]', (els) => els.map((e) => e.dataset.note).join(' '));
      check(`${c.name}: remembered after a reload`, pegsAfter === c.notes.map((n) => n[1]).join(' '), pegsAfter);
      noErrors(errors, `${c.name}: no console errors`);
    });
  }
}

async function chromatic() {
  const notes = [[42, 'F#2', -6], [48, 'C3', 3], [56, 'G#3', 0], [70, 'A#4', 14]];
  const recording = await lib.makeRecording('chromatic', notes.map(([midi, , cents]) => ({ pluck: { midi, cents, dur: 1.5 }, gap: 0.6 })), { lead: 3 });
  await open({ recording }, async ({ page, errors }) => {
    await restart(page);
    await page.keyboard.press('c');
    await attr(page, 'mode', 'chromatic');
    check('the C key switches to chromatic mode', true);
    const eps = await heard(page, recording);
    check(`heard ${notes.length} notes`, eps.length === notes.length, `${eps.length}: ${eps.map((e) => e.notes.join('/')).join(' ')}`);
    notes.forEach(([, note, cents], i) => {
      const ep = eps[i];
      if (!ep) return;
      check(`names ${note}, which is not a string of the tuning`, ep.notes.join() === note && ep.strings.length === 0, `notes ${ep.notes} strings ${ep.strings}`);
      check(`${note} reads ${cents} within 1.5 cents`, Math.abs(ep.cents - cents) <= 1.5, `read ${ep.cents}`);
      check(`${note} ${Math.abs(cents) <= TOLERANCE ? 'confirmed' : 'not confirmed'}`, ep.inTune === (Math.abs(cents) <= TOLERANCE));
    });
    check('no string is ticked by chromatic notes', (await lib.readout(page)).tuned === '');
    await page.keyboard.press('a');
    await attr(page, 'mode', 'auto');
    check('the A key goes back to automatic', true);
    noErrors(errors);
  });
}

async function reference() {
  // A2 and E4 tuned to A4 = 432, then an A2 tuned to 440 (31.8 cents sharp of the 432 target).
  const plan = [
    { midi: 45, a4: 432, cents: 0, note: 'A2', expect: 0 },
    { midi: 64, a4: 432, cents: 8, note: 'E4', expect: 8 },
    { midi: 45, a4: 440, cents: 0, note: 'A2', expect: 1200 * Math.log2(440 / 432) },
  ];
  const recording = await lib.makeRecording('a432', plan.map((p) => ({ pluck: { midi: p.midi, cents: p.cents, a4: p.a4, dur: 1.5 }, gap: 0.6 })), { lead: 3 });
  await open({ recording, mobile: true }, async ({ page, errors }) => {
    await restart(page, async () => {
      await page.getByRole('button', { name: 'Tuner settings' }).click();
      await page.getByRole('radio', { name: '432 Hz' }).click();
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 });
    });
    check('the screen says the reference pitch is 432 Hz', (await page.locator('[data-tuner-a4="432"]').count()) === 1);
    const eps = await heard(page, recording);
    check('heard 3 notes', eps.length === 3, `${eps.length}`);
    plan.forEach((p, i) => {
      const ep = eps[i];
      if (!ep) return;
      const label = `${p.note} tuned to A = ${p.a4}`;
      check(`${label}: named ${p.note}`, ep.notes.join() === p.note, ep.notes.join());
      check(`${label}: reads ${p.expect.toFixed(1)} cents within 1.5`, Math.abs(ep.cents - p.expect) <= 1.5, `read ${ep.cents}`);
      check(`${label}: ${Math.abs(p.expect) <= TOLERANCE ? 'confirmed' : 'not confirmed'}`, ep.inTune === (Math.abs(p.expect) <= TOLERANCE));
    });
    await page.reload();
    await lib.waitForTuner(page);
    check('432 Hz is remembered after a reload', (await page.locator('[data-tuner-a4="432"]').count()) === 1);
    noErrors(errors);
  });
}

async function capo() {
  // With a capo on fret 2 the strings should sound F#2 B2 E3 A3 C#4 F#4.
  const plan = [
    { midi: 42, cents: 0, note: 'F#2', string: '6' },
    { midi: 47, cents: -8, note: 'B2', string: '5' },
    { midi: 57, cents: 2, note: 'A3', string: '3' },
    { midi: 66, cents: 9, note: 'F#4', string: '1' },
  ];
  const recording = await lib.makeRecording('capo', plan.map((p) => ({ pluck: { midi: p.midi, cents: p.cents, dur: 1.5 }, gap: 0.6 })), { lead: 3 });
  await open({ recording, mobile: true }, async ({ page, errors }) => {
    await restart(page, async () => {
      await page.getByRole('button', { name: 'Tuner settings' }).click();
      const plus = page.getByRole('button', { name: 'Increase Capo on fret' });
      await plus.click();
      await plus.click();
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 });
    });
    const flag = await page.locator('[data-tuner-capo="2"]').innerText().catch(() => '');
    check('a label says the capo shifts the targets', /Capo on fret 2/.test(flag) && /F♯ B E A C♯ F♯/.test(flag), flag);
    const eps = await heard(page, recording);
    check(`heard ${plan.length} notes`, eps.length === plan.length, `${eps.length}`);
    plan.forEach((p, i) => {
      const ep = eps[i];
      if (!ep) return;
      check(`capo 2: ${p.note} is string ${p.string}`, ep.notes.join() === p.note && ep.strings.join() === p.string, `notes ${ep.notes} strings ${ep.strings}`);
      check(`capo 2: ${p.note} reads ${p.cents} within 1.5 cents`, Math.abs(ep.cents - p.cents) <= 1.5, `read ${ep.cents}`);
      check(`capo 2: ${p.note} ${Math.abs(p.cents) <= TOLERANCE ? 'confirmed' : 'not confirmed'}`, ep.inTune === (Math.abs(p.cents) <= TOLERANCE));
    });
    noErrors(errors);
  });
}

async function quiet() {
  const recording = await lib.makeRecording('quiet', [{ silence: 4 }, { noise: 5, rms: 0.03 }, { silence: 2 }, { noise: 3, rms: 0.006, seed: 9 }, { silence: 2 }], { lead: 1 });
  await open({ recording }, async ({ page, errors }) => {
    await restart(page);
    await sleep(recording.seconds * 1000 + 300);
    const log = await lib.readLog(page);
    const states = [...new Set(log.map((e) => e.state))];
    const notes = [...new Set(log.map((e) => e.note).filter(Boolean))];
    check('silence and steady noise never leave "listening"', states.every((s) => s === 'listening' || s === 'idle') && states.includes('listening'), states.join(','));
    check('no note is shown', notes.length === 0, notes.join(','));
    check('no string is ticked', (await lib.readout(page)).tuned === '');
    const said = [...new Set(log.map((e) => e.advice).filter((a) => a && a !== 'ok'))];
    console.log(`    input advice shown during noise: ${said.join(', ') || 'none'}`);
    check('never claims the input is too quiet when nothing was played', !said.includes('too-quiet'), said.join(','));
    noErrors(errors);
  });
}

async function far() {
  // F#2 is the A string a minor third flat (heard twice); C#2 is the low E string a minor third flat.
  const LEAD = 3.5;
  const recording = await lib.makeRecording(
    'far',
    [
      { pluck: { midi: 42, cents: 0, dur: 2.2 }, gap: 1.2 },
      { silence: 3 },
      { pluck: { midi: 42, cents: 0, dur: 2.2 }, gap: 1.2 },
      { silence: 5 },
      { pluck: { midi: 37, cents: 0, dur: 2.2 }, gap: 1 },
      { silence: 3 },
      { pluck: { midi: 37, cents: 0, dur: 2.2 }, gap: 1 },
    ],
    { lead: LEAD },
  );
  await open({ recording, mobile: true }, async ({ page, errors }) => {
    await restart(page);
    const t0 = Date.now();
    /** Wait until this many seconds of the recording have played. */
    const until = (seconds) => sleep(Math.max(0, t0 + seconds * 1000 - Date.now()));

    // 1. Automatic mode: the note lies between the E and the A string. The tuner must not guess.
    await until(LEAD + 2.2 + 0.8);
    let eps = lib.episodes(await lib.readLog(page));
    check('automatic: a note between two strings is not blamed on the nearer one', eps.length === 1 && eps[0].instructions.includes('which-string') && !eps[0].instructions.some((x) => /^(loosen|far-above)/.test(x)), eps[0] ? eps[0].instructions.join(',') : 'no note');
    check('automatic: it asks which string it is', (await page.getByText('Which string is this?').count()) > 0 || eps[0].instructions.includes('which-string'));

    // 2. Locked on the A string: same note, now the far-below warning for that string.
    await page.click('[data-string="5"]');
    await attr(page, 'mode', 'locked');
    check('tapping a string locks the tuner onto it', (await lib.readout(page)).target === 'A2');
    await lib.startLog(page);
    await until(LEAD + 2.2 + 1.2 + 3 + 2.2 + 0.8);
    eps = lib.episodes(await lib.readLog(page));
    check('locked on A: the flat string is read as string 5 (A2), not as another string', eps.length === 1 && eps[0].notes.join() === 'A2' && eps[0].strings.join() === '5', JSON.stringify(eps.map((e) => [e.notes, e.strings])));
    check('locked on A: the far-below warning is shown', !!eps[0] && eps[0].instructions.includes('far-below') && !eps[0].instructions.includes('other-string'), eps[0] ? eps[0].instructions.join(',') : '');
    check('locked on A: reads about -300 cents and is not confirmed', !!eps[0] && Math.abs(eps[0].cents + 300) < 3 && !eps[0].inTune, eps[0] ? `read ${eps[0].cents}` : '');

    // 3. Tap the same string again to release, then the guided flow on its first string.
    await page.click('[data-string="5"]');
    await attr(page, 'mode', 'auto');
    check('tapping the locked string again releases it', true);
    await lib.startLog(page);
    await page.keyboard.press('g');
    await attr(page, 'mode', 'guide');
    check('the G key starts the guided flow on the thickest string', (await lib.readout(page)).target === 'E2');
    await until(LEAD + 2.2 + 1.2 + 3 + 2.2 + 1.2 + 5 + 2.2 + 0.8);
    eps = lib.episodes(await lib.readLog(page));
    check('guided: the low E a minor third flat is read as E2', eps.length === 1 && eps[0].notes.join() === 'E2' && eps[0].strings.join() === '6', JSON.stringify(eps.map((e) => [e.notes, e.strings])));
    check('guided: the far-below warning is shown, the guide does not move on', !!eps[0] && eps[0].instructions.includes('far-below') && (await lib.readout(page)).target === 'E2', eps[0] ? eps[0].instructions.join(',') : '');

    // 4. Automatic again, the same flat low E: nothing lies below it, so it can only be that string.
    await page.keyboard.press('a');
    await attr(page, 'mode', 'auto');
    await lib.startLog(page);
    await until(LEAD + 2.2 + 1.2 + 3 + 2.2 + 1.2 + 5 + 2.2 + 1 + 3 + 2.2 + 0.8);
    eps = lib.episodes(await lib.readLog(page));
    check('automatic: the low E a minor third flat is read as E2, string 6', eps.length === 1 && eps[0].notes.join() === 'E2' && eps[0].strings.join() === '6', JSON.stringify(eps.map((e) => [e.notes, e.strings])));
    check('automatic: it warns far below rather than asking or snapping', !!eps[0] && eps[0].instructions.includes('far-below') && !eps[0].instructions.some((x) => /^(which-string|loosen|far-above|other-string)/.test(x)), eps[0] ? eps[0].instructions.join(',') : '');
    check('automatic: reads about -300 cents, not confirmed', !!eps[0] && Math.abs(eps[0].cents + 300) < 3 && !eps[0].inTune, eps[0] ? `read ${eps[0].cents}` : '');
    noErrors(errors);
  });
}

async function guide() {
  const recording = await lib.makeRecording('guide', STRINGS.map((s, i) => ({ pluck: { midi: s.midi, cents: i % 2 ? 1.2 : -1, dur: 1.5, damp: false }, gap: 0.5 })), { lead: 3.5, tail: 6 });
  await open({ recording, mobile: true, seed: { guideSeen: false } }, async ({ page, errors }) => {
    // A first-timer taps Start: the guided flow begins on the thickest string.
    await restart(page);
    await attr(page, 'mode', 'guide');
    const first = await lib.readout(page);
    check('Start leads a first-timer into the guided flow', first.mode === 'guide' && first.target === 'E2');
    check('it says which string to pluck', (await page.getByText('Pluck the thickest string').count()) > 0);
    await page.waitForSelector('[data-tuner-summary]', { timeout: recording.seconds * 1000 + 8000 });
    const summary = await page.getAttribute('[data-tuner-summary]', 'data-tuner-summary');
    check('the guide ends with a summary of all six strings', summary === 'all' && (await page.getByText('All 6 strings are in tune').count()) > 0, summary);
    const log = await lib.readLog(page);
    const targets = [...new Set(log.filter((e) => e.mode === 'guide').map((e) => e.note).filter(Boolean))];
    check('it went thickest to thinnest', targets.join(' ') === 'E2 A2 D3 G3 B3 E4', targets.join(' '));
    const warned = log.some((e) => e.instruction === 'other-string' || e.instruction === 'far-below' || e.instruction === 'far-above');
    check('a string still ringing is never judged against the next one', !warned);
    check('one tuner activity recorded', (await tunerCount(page)) === 1, `count.tuner = ${await tunerCount(page)}`);
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForSelector('[data-tuner-summary]', { state: 'detached', timeout: 5000 });
    check('after the summary the tuner carries on in automatic mode', (await lib.readout(page)).mode === 'auto');
    noErrors(errors);
  });
}

/**
 * Level and pitch of what the app's audio engine is playing, read from its output analyser (after
 * the limiter: this is what reaches the speakers). The analyser only holds audio that passed
 * through it after it was created, so it is given a moment to fill before it is read.
 */
const engineOutput = (page) =>
  page.evaluate(async () => {
    const audio = await import('/src/core/audio/index.ts');
    if (!audio.hasEngine()) return { state: audio.audioState(), rms: 0, hz: 0 };
    const analyser = audio.getAnalyser(16384);
    await new Promise((r) => setTimeout(r, 450));
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += v * v;
    const rms = Math.sqrt(sum / data.length);
    const est = rms > 0.001 ? audio.estimatePitch(data, analyser.context.sampleRate, { length: data.length, minHz: 50, maxHz: 1200 }) : null;
    return { state: audio.audioState(), rms, hz: est ? est.hz : 0 };
  });

const cents = (hz, target) => 1200 * Math.log2(hz / target);

async function byEar() {
  // 1. Permission declined.
  await open(
    {
      init: () => {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
      },
    },
    async ({ page, errors }) => {
      check('without permission the screen waits for a tap', (await lib.readout(page)).state === 'idle' && (await page.locator('[data-tuner-start]').count()) === 1);
      await page.click('[data-tuner-start]');
      await page.waitForSelector('[role="alert"]', { timeout: 15000 });
      const alert = await page.locator('[role="alert"]').first().innerText();
      check('a declined microphone is explained', /declined/i.test(alert) && /by ear/i.test(alert), alert.replace(/\s+/g, ' ').slice(0, 160));
      await page.getByRole('button', { name: 'Tune by ear instead' }).click();
      await attr(page, 'source', 'ear');
      check('"Tune by ear instead" opens the by-ear tuner', (await lib.readout(page)).earNote === 'E2');
      await sleep(900);
      let out = await engineOutput(page);
      check('the reference note really sounds', out.state === 'running' && out.rms > 0.01, JSON.stringify(out));
      check('it is the low E (82.41 Hz) within 3 cents', Math.abs(cents(out.hz, 82.407)) < 3, `${out.hz.toFixed(2)} Hz`);
      check('the readout says which note is playing', (await lib.readout(page)).tone === '40');
      // Another string.
      await page.click('[data-string="1"]');
      await attr(page, 'ear-note', 'E4');
      await sleep(900);
      out = await engineOutput(page);
      check('tapping string 1 plays the high E (329.63 Hz)', out.rms > 0.01 && Math.abs(cents(out.hz, 329.628)) < 3, `${out.hz.toFixed(2)} Hz`);
      // Tap again: it stops.
      await page.click('[data-string="1"]');
      await attr(page, 'tone', '');
      await sleep(1500);
      out = await engineOutput(page);
      check('tapping the string again stops the note', out.rms < 0.002, `rms ${out.rms.toFixed(4)}`);
      // The plucked voice.
      await page.getByRole('radio', { name: 'Plucked string' }).first().click();
      await page.click('[data-string="5"]');
      out = await engineOutput(page);
      check('the plucked-string voice sounds too, at A2 (110 Hz)', out.rms > 0.005 && Math.abs(cents(out.hz, 110)) < 8, `${out.hz.toFixed(2)} Hz rms ${out.rms.toFixed(3)}`);
      await page.click('[data-string="5"]');
      // The by-ear flow reaches its end.
      await page.click('[data-string="6"]');
      for (let i = 0; i < 6; i++) await page.click('[data-tuner-ear-next]');
      await page.waitForSelector('[data-tuner-summary="all"]', { timeout: 5000 });
      check('"Sounds right, next" walks all six strings to a summary', (await page.getByText('All 6 strings matched by ear').count()) > 0);
      check('tuning by ear counts as one tuner activity', (await tunerCount(page)) === 1, `count.tuner = ${await tunerCount(page)}`);
      noErrors(errors, 'declined: no console errors');
    },
  );

  // 2. Inside the Claude viewer: the microphone is never offered, the by-ear tuner is the screen.
  await open(
    {
      mobile: true,
      init: () => {
        window.claude = { use: async () => null };
        navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
      },
    },
    async ({ page, errors }) => {
      const first = await lib.readout(page);
      check('in the Claude viewer the screen opens as the by-ear tuner', first.source === 'ear' && first.earNote === 'E2', JSON.stringify(first));
      const alert = await page.locator('[role="alert"]').first().innerText().catch(() => '');
      check('it explains once that the viewer has no microphone', /switched off in this viewer/i.test(alert), alert.replace(/\s+/g, ' ').slice(0, 120));
      check('there is no Start button to a dead end', (await page.locator('[data-tuner-start]').count()) === 0);
      await page.getByRole('button', { name: 'Tune by ear' }).click();
      await page.waitForSelector('[role="alert"]', { state: 'detached', timeout: 5000 });
      await page.click('[data-tuner-play]');
      await attr(page, 'tone', '40');
      await sleep(900);
      const out = await engineOutput(page);
      check('the play button sounds the low E', out.state === 'running' && out.rms > 0.01 && Math.abs(cents(out.hz, 82.407)) < 3, JSON.stringify(out));
      await page.reload();
      await lib.waitForTuner(page);
      check('the explanation is not repeated on the next visit', (await page.locator('[role="alert"]').count()) === 0 && (await page.getByText('No microphone in this viewer').count()) === 1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check('no sideways scroll on a phone', overflow <= 1, `${overflow}px`);
      noErrors(errors, 'viewer: no console errors');
    },
  );
}

async function controls() {
  const recording = await lib.makeRecording('controls', [{ pluck: { midi: 45, cents: -12, dur: 3, decay: 0.9 }, gap: 0.6 }], { lead: 0.5, tail: 0.2 });
  // The recording loops here: the screen is always hearing the A string a little flat.
  const loop = { ...recording, fakeAudio: recording.file };
  await open(
    {
      recording: loop,
      init: () => {
        // Remember every microphone stream, to check they are released.
        window.__streams = [];
        const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (c) => {
          const s = await real(c);
          window.__streams.push(s);
          return s;
        };
      },
    },
    async ({ page, errors }) => {
      const live = () => page.evaluate(() => window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length);
      await attr(page, 'note', 'A2', 30000);
      check('hears the string', true);
      check('one microphone track is live', (await live()) === 1, `${await live()}`);

      // Space stops and starts.
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press('Space');
      await state(page, 'idle');
      check('Space stops listening and releases the microphone', (await live()) === 0, `${await live()} live`);
      await page.keyboard.press('Space');
      await state(page, 'hearing');
      check('Space starts again', (await live()) === 1);

      // Number keys lock, arrows move, Escape releases.
      await page.keyboard.press('3');
      await attr(page, 'target', 'G3');
      check('the 3 key locks onto string 3', (await lib.readout(page)).mode === 'locked');
      await page.keyboard.press('ArrowLeft');
      await attr(page, 'target', 'D3');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await attr(page, 'target', 'B3');
      check('the arrow keys move between strings', true);
      await page.keyboard.press('Escape');
      await attr(page, 'mode', 'auto');
      check('Escape releases the lock', true);

      // R plays the reference note and pauses the microphone meanwhile.
      await state(page, 'hearing');
      await page.keyboard.press('r');
      await attr(page, 'tone', '45');
      await sleep(600);
      const during = await lib.readout(page);
      const out = await engineOutput(page);
      check('R plays the reference note for the string on the readout', out.rms > 0.01 && Math.abs(cents(out.hz, 110)) < 3, `${out.hz.toFixed(2)} Hz`);
      check('the microphone is ignored while the note plays', during.state === 'listening' && during.note === '', JSON.stringify({ state: during.state, note: during.note }));
      await page.keyboard.press('r');
      await attr(page, 'tone', '');
      await state(page, 'hearing');
      check('listening resumes when the note stops', true);

      // The meter is driven outside React: the marker moves without the readout re-rendering.
      const moved = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const mover = document.querySelector('[data-tuner-readout] [data-live]').querySelector('div > div');
            const seen = new Set();
            let frames = 0;
            const tick = () => {
              seen.add(mover.style.transform);
              if (++frames < 90) requestAnimationFrame(tick);
              else resolve({ frames, positions: seen.size });
            };
            requestAnimationFrame(tick);
          }),
      );
      check('the marker is positioned by a transform', moved.positions >= 1 && moved.frames === 90, JSON.stringify(moved));

      // Hiding the tab releases the microphone; coming back resumes.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await state(page, 'idle');
      check('a hidden tab releases the microphone', (await live()) === 0, `${await live()} live`);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await state(page, 'hearing');
      check('coming back resumes listening', (await live()) === 1);

      // Precision options.
      await page.getByText('Precision and input').click();
      await page.getByRole('radio', { name: 'Within 1 cent' }).click();
      await page.getByRole('radio', { name: 'Strobe' }).click();
      await page.getByRole('switch', { name: /Show the frequency/ }).check();
      await page.waitForSelector(`${lib.READOUT} canvas`, { timeout: 5000 });
      await sleep(1200);
      const hz = await page.evaluate(() => document.querySelector('[data-tuner-readout]').innerText.match(/(\d+\.\d+) Hz of 110\.0 Hz/));
      check('the strobe display and the frequency are offered', !!hz && Math.abs(Number(hz[1]) - 109.24) < 0.2, hz ? hz[0] : 'no Hz text');
      const fine = await page.evaluate(() => document.querySelector('[data-tuner-readout]').innerText.match(/\d+\.\d\s*cents/));
      check('fine tolerance shows tenths of a cent', !!fine, fine ? fine[0] : '');

      // More than one microphone: a picker, and switching keeps listening on exactly one stream.
      const micOptions = await page.getByRole('combobox', { name: 'Microphone' }).locator('option').allInnerTexts().catch(() => []);
      check('a microphone picker appears when there is more than one input', micOptions.length >= 3, micOptions.join(' | '));
      if (micOptions.length >= 3) {
        await page.getByRole('combobox', { name: 'Microphone' }).selectOption({ index: 2 });
        await attr(page, 'note', 'A2', 30000);
        check('switching microphone keeps one live stream and goes on hearing', (await live()) === 1, `${await live()} live`);
        const stored = await page.evaluate(async () => (await import('/src/core/progress/index.ts')).getProgress().prefs.mic.deviceId);
        check('the chosen microphone is remembered', typeof stored === 'string' && stored.length > 0, String(stored));
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check('no sideways scroll on a desktop', overflow <= 1, `${overflow}px`);

      // Leaving the screen releases the microphone.
      await page.evaluate(() => {
        window.location.hash = '#tools';
      });
      await page.waitForSelector('main[data-route="tools"]', { timeout: 15000 });
      await sleep(400);
      check('leaving the screen releases the microphone', (await live()) === 0, `${await live()} live`);
      noErrors(errors);
    },
  );
}

async function autostart() {
  const recording = await lib.makeRecording('autostart', [{ pluck: { midi: 45, cents: 4, dur: 3, decay: 0.9 }, gap: 0.6 }], { lead: 0.5, tail: 0.2 });
  const server = await startServer();
  // No "--autoplay-policy=no-user-gesture-required" here: this is the policy a learner's browser has.
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${recording.file}`] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark', permissions: ['microphone'] });
    await lib.seed(context, lib.seedStorage());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto(`${server.url}#tuner`, { waitUntil: 'load' });
    await lib.waitForTuner(page);
    // Give the automatic start time to succeed, or to notice that audio will not run without a tap.
    await page.waitForFunction((sel) => { const d = document.querySelector(sel).dataset; return d.source === 'mic' || (d.source === 'off' && !!document.querySelector('[data-tuner-start]')); }, lib.READOUT, { timeout: 20000 });
    await sleep(1500);
    const first = await lib.readout(page);
    if (first.source === 'mic') {
      console.log('    this browser runs audio without a tap once the microphone is granted: the screen listens by itself');
      const ok = await attr(page, 'note', 'A2', 12000).then(() => true, () => false);
      check('listening by itself really hears the string', ok, JSON.stringify(await lib.readout(page)));
    } else {
      console.log('    this browser wants a tap before audio runs: the screen offers Start instead of pretending to listen');
      check('it waits with a Start button, without an error', first.state === 'idle' && (await page.locator('[role="alert"]').count()) === 0, JSON.stringify(first));
      await page.click('[data-tuner-start]');
      const ok = await attr(page, 'note', 'A2', 15000).then(() => true, () => false);
      check('a tap on Start then hears the string', ok, JSON.stringify(await lib.readout(page)));
    }
    noErrors(errors);
  } finally {
    await browser.close();
    await server.close();
  }
}

async function picker() {
  await open({ mobile: true }, async ({ page, errors }) => {
    const pegs = () => page.$$eval('button[data-string][data-note]', (els) => els.map((e) => e.dataset.note).join(' '));
    await page.click('[data-tuner-tuning]');
    const dialog = page.getByRole('dialog');
    const groups = await dialog.locator('h3').allInnerTexts();
    check('the picker groups the catalog', ['Standard', 'Drop tunings', 'Open and modal', 'Bass', 'Ukulele'].every((g) => groups.includes(g)), groups.join(' | '));
    const count = await dialog.locator('li button').count();
    check('it lists the whole catalog', count >= 26, `${count} tunings`);
    await page.getByRole('searchbox').fill('dadgad');
    check('search narrows the list', (await dialog.locator('li button').count()) === 1);
    await dialog.locator('li button').first().click();
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 });
    check('choosing DADGAD changes the strings', (await pegs()) === 'D2 A2 D3 G3 A3 D4', await pegs());
    await page.click('[data-tuner-tuning]');
    const inUse = await page.getByRole('dialog').getByLabel('Tuning in use').innerText();
    check('it says how to get there from standard', /3 of 6 strings change/.test(inUse) && /Lower string 6 from E to D: a whole step \(2 frets\)\./.test(inUse) && /Lower string 2 from B to A/.test(inUse), inUse.replace(/\s+/g, ' ').slice(0, 200));

    // A tuning of the learner's own: DADGAD with the fifth string down to G as well.
    await page.getByRole('button', { name: 'Make your own tuning' }).click();
    await page.getByRole('button', { name: 'String 5: one fret lower' }).click();
    await page.getByRole('button', { name: 'String 5: one fret lower' }).click();
    await page.getByLabel('Name').fill('Low and slow');
    await page.getByRole('button', { name: 'Use this tuning' }).click();
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 });
    check('a custom tuning can be made and used', (await pegs()) === 'D2 G2 D3 G3 A3 D4', await pegs());
    await page.reload();
    await lib.waitForTuner(page);
    check('the custom tuning is remembered after a reload', (await pegs()) === 'D2 G2 D3 G3 A3 D4' && /Low and slow/.test(await page.locator('[data-tuner-tuning]').innerText()), await pegs());
    await page.click('[data-tuner-tuning]');
    check('it is listed under "Your tunings"', (await page.getByRole('dialog').locator('h3').first().innerText()) === 'Your tunings');
    await page.getByRole('button', { name: 'Remove from your tunings' }).click();
    await sleep(300);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 });
    check('removing it goes back to standard', (await pegs()) === 'E2 A2 D3 G3 B3 E4', await pegs());

    // An editor result that is a catalog tuning is recognised rather than duplicated.
    await page.click('[data-tuner-tuning]');
    await page.getByRole('button', { name: 'Make your own tuning' }).click();
    await page.getByRole('button', { name: 'String 6: one fret lower' }).click();
    await page.getByRole('button', { name: 'String 6: one fret lower' }).click();
    check('the editor recognises Drop D', (await page.getByText('These strings are Drop D').count()) === 1);
    await page.getByRole('button', { name: 'Use this tuning' }).click();
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 });
    check('and chooses the catalog tuning', (await page.getAttribute('[data-tuner-layout]', 'data-tuning')) === 'drop-d');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('no sideways scroll', overflow <= 1, `${overflow}px`);
    noErrors(errors);
  });
}

/** Where the strings and the action bar are, and what the shell is showing. */
const layoutOf = (page) =>
  page.evaluate(() => {
    const box = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom };
    };
    const bar = document.querySelector('[data-tuner-stop], [data-tuner-start]')?.parentElement;
    const barBox = bar ? bar.getBoundingClientRect() : null;
    return {
      strip: box('[role="group"][aria-label^="Strings"]'),
      bar: barBox ? { top: barBox.top, bottom: barBox.bottom } : null,
      immersive: document.querySelector('[data-immersive]')?.dataset.immersive ?? '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      height: innerHeight,
    };
  });

async function layout() {
  const recording = await lib.makeRecording('layout', [{ pluck: { midi: 45, cents: -12, dur: 3, decay: 0.9 }, gap: 0.6 }], { lead: 0.5, tail: 0.2 });
  const loop = { ...recording, fakeAudio: recording.file };
  // A short phone (iPhone SE): while listening the tab bar steps aside so the strings stay in view.
  await withApp({ mobile: true, viewport: { width: 375, height: 667 }, fakeAudio: loop.fakeAudio }, async ({ page, context, goto, errors }) => {
    await lib.seed(context, lib.seedStorage());
    await goto('tuner');
    await lib.waitForTuner(page);
    await state(page, 'hearing');
    await sleep(400);
    let l = await layoutOf(page);
    check('short phone, listening: the tab bar steps aside', l.immersive === 'focus', l.immersive);
    check('short phone, listening: every string is above the action bar', !!l.strip && !!l.bar && l.strip.bottom <= l.bar.top + 1 && l.strip.top >= 0, JSON.stringify(l));
    await page.click('[data-tuner-stop]');
    await state(page, 'idle');
    await sleep(400);
    l = await layoutOf(page);
    check('short phone, stopped: the tab bar comes back', l.immersive === 'none', l.immersive);
    check('short phone: no sideways scroll', l.overflow <= 1, `${l.overflow}px`);
    noErrors(errors, 'short phone: no console errors');
  });
  // A phone held sideways: readout and strings side by side, both inside the screen.
  await withApp({ mobile: true, viewport: { width: 844, height: 390 }, fakeAudio: loop.fakeAudio }, async ({ page, context, goto, errors }) => {
    await lib.seed(context, lib.seedStorage());
    await goto('tuner');
    await lib.waitForTuner(page);
    await state(page, 'hearing');
    await sleep(400);
    const l = await layoutOf(page);
    const readout = await page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { left: b.left, right: b.right, bottom: b.bottom }; }, lib.READOUT);
    check('sideways: the shell steps aside', l.immersive === 'focus', l.immersive);
    check('sideways: the readout fits the screen height', readout.bottom <= l.height + 1, JSON.stringify(readout));
    check('sideways: the strings sit beside the readout, on screen', !!l.strip && l.strip.bottom <= l.height + 1 && (await page.evaluate(() => document.querySelector('[role="group"][aria-label^="Strings"]').getBoundingClientRect().left)) >= readout.right, JSON.stringify(l.strip));
    check('sideways: no sideways scroll', l.overflow <= 1, `${l.overflow}px`);
    noErrors(errors, 'sideways: no console errors');
  });
}

/**
 * Cases an independent review of the screen caught, each one first seen by using it:
 *  - a string confirmed in tune lost its tick as it rang out: the last tenth of a second of a
 *    string sinking into room noise can read 15 to 20 cents flat. Strings here come from a second
 *    string model (the audio engine's waveguide guitar, 44.1 kHz) under pink noise 28 dB down;
 *  - held on the low E, an A string's note showed "505 cents high" with the marker pinned at the
 *    sharp end, inviting a learner to slacken the wrong string by five frets;
 *  - a first visit showed "Auto" chosen, then Start went into the guided flow, and choosing Auto
 *    before Start was ignored.
 */
async function review() {
  // Cents from 440 Hz; the tuner is set to A = 442 Hz (7.85 cents higher), the setting this was seen with.
  const notes = [
    { string: 6, cents: -17, ring: 3.2 },
    { string: 5, cents: 5, ring: 3.2 },
    { string: 4, cents: 8, ring: 3.2 },
    { string: 5, cents: 9, ring: 3.2 },
    { string: 5, cents: 5, ring: 3.2 },
    { string: 5, cents: 7, ring: 3.2 },
  ];
  const recording = await lib.makeEngineRecording('review-fade', notes, { lead: 3 });
  await open({ recording }, async ({ page, errors }) => {
    await restart(page, () => page.getByRole('radio', { name: '442 Hz' }).click());
    await sleep(recording.seconds * 1000 + 600);
    const log = await lib.readLog(page);
    for (const n of [notes[1], notes[2]]) {
      const s = String(n.string);
      const has = (e) => (e.tuned || '').split(',').includes(s);
      const first = log.findIndex(has);
      const lost = first >= 0 ? log.slice(first).find((e) => !has(e)) : null;
      check(`string ${s} is ticked and keeps its tick while it rings out`, first >= 0 && !lost, first < 0 ? 'never ticked' : lost ? `lost while showing ${lost.state} ${lost.note} ${lost.cents}` : '');
    }

    // Held on the low E while the A string plays: no number, the marker rests.
    await page.click('[data-tuner-stop]');
    await state(page, 'idle');
    await page.click('[data-tuner-start]');
    await state(page, 'listening');
    await page.click('[data-string="6"]');
    await attr(page, 'mode', 'locked');
    await attr(page, 'instruction', 'other-string', 15000);
    await sleep(300);
    const shown = await page.evaluate((sel) => {
      const root = document.querySelector(sel);
      const unit = root.querySelector('button[aria-label^="cents"]');
      return { parked: root.querySelector('[data-parked]')?.dataset.parked, numberVisible: unit ? getComputedStyle(unit.parentElement).visibility !== 'hidden' : null, text: root.innerText.replace(/\s+/g, ' ') };
    }, lib.READOUT);
    check('held on E, the A string: says it is another string', /Is that the right string\?/.test(shown.text), shown.text.slice(0, 160));
    check('held on E, the A string: no offset number, the marker rests in the middle', shown.parked === 'true' && shown.numberVisible === false, JSON.stringify({ parked: shown.parked, numberVisible: shown.numberVisible }));
    noErrors(errors);
  });

  // A first visit, microphone not yet allowed (the browser asks; the fake prompt says yes).
  const quietRec = await lib.makeRecording('review-quiet', [{ silence: 4 }], { lead: 0.5, tail: 0.5 });
  const server = await startServer();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${quietRec.file}`] });
  try {
    for (const pick of [null, 'Auto']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark', permissions: [] });
      await lib.seed(context, lib.seedStorage({ guideSeen: false }));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      await page.goto(`${server.url}#tuner`, { waitUntil: 'load' });
      await lib.waitForTuner(page);
      await sleep(500);
      const checked = () => page.evaluate(() => document.querySelector('[role="radiogroup"][aria-label^="How the tuner"] [aria-checked="true"]')?.textContent.trim() ?? '');
      if (!pick) {
        check('first visit: the mode control shows Guided before Start', (await checked()) === 'Guided', await checked());
        // The mode the readout reports must never be "auto" on the way into the guided flow.
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          window.__modes = [];
          new MutationObserver(() => window.__modes.push(el.dataset.source + ':' + el.dataset.mode)).observe(el, { attributes: true });
        }, lib.READOUT);
        await page.click('[data-tuner-start]');
        await state(page, 'listening');
        const modes = await page.evaluate(() => window.__modes);
        check('first visit: Start goes straight into the guided flow', (await lib.readout(page)).mode === 'guide' && !modes.some((m) => /^(starting|mic):auto$/.test(m)), modes.join(' '));
      } else {
        await page.getByRole('radio', { name: pick }).click();
        check('first visit: Auto can be chosen before Start', (await checked()) === pick, await checked());
        await page.click('[data-tuner-start]');
        await state(page, 'listening');
        await sleep(300);
        check('first visit: Auto chosen before Start is kept', (await lib.readout(page)).mode === 'auto', (await lib.readout(page)).mode);
      }
      noErrors(errors, `first visit${pick ? `, ${pick} chosen` : ''}: no console errors`);
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

const GROUPS = { standard, tunings, chromatic, reference, capo, quiet, far, guide, byear: byEar, controls, autostart, picker, layout, review };

(async () => {
  let failedGroups = 0;
  let total = 0;
  const started = Date.now();
  for (const [name, run] of Object.entries(GROUPS)) {
    if (only && !only.includes(name)) continue;
    let outcome = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      results = [];
      console.log(`== ${name}${attempt > 1 ? ' (second try)' : ''}`);
      try {
        await run();
      } catch (err) {
        check(`${name} ran to the end`, false, err && err.message ? err.message.split('\n')[0] : String(err));
      }
      const failed = results.filter((r) => !r.pass);
      outcome = { checks: results.length, failed };
      if (failed.length === 0) break;
    }
    total += outcome.checks;
    console.log(`   ${outcome.failed.length === 0 ? 'ok' : 'FAILED'}: ${outcome.checks - outcome.failed.length} of ${outcome.checks} checks`);
    if (outcome.failed.length) failedGroups++;
  }
  console.log(`\n${failedGroups === 0 ? 'PASSED' : 'FAILED'}: ${total} checks in ${Math.round((Date.now() - started) / 1000)} s${quick ? ' (quick)' : ''}`);
  process.exit(failedGroups === 0 ? 0 : 1);
})();
