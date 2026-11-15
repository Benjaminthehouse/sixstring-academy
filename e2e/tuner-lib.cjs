/**
 * Shared pieces of the tuner's browser checks (e2e/tuner.cjs, e2e/tuner-shots.cjs):
 * microphone recordings built from the pitch module's own test signals, and a recorder that
 * follows the readout's data attributes over time.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadTs } = require('./lib/harness.cjs');

const SR = 48000;

let signals = null;
/** The pitch module's signal generators, loaded once (pluckedString, concat, silence, addNoise, whiteNoise, encodeWav). */
async function loadSignals() {
  signals ??= await loadTs('/src/core/pitch/signals.ts');
  return signals;
}

/** Frequency of a MIDI note `cents` away from equal temperament. */
function freqOf(midi, cents = 0, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69 + cents / 100) / 12);
}

/** A realistic plucked string: pick noise, a slightly sharp start, stiff partials, damped at the end. */
function pluck(sig, { midi, cents = 0, a4 = 440, dur = 1.7, amplitude = 0.5, damp = true, decay = 2.2 }) {
  const x = sig.pluckedString({
    freq: freqOf(midi, cents, a4), sampleRate: SR, duration: dur, amplitude,
    attackNoise: 0.3, driftCents: 5, inharmonicity: 4e-5, decay, seed: Math.round(midi * 7 + cents + 100),
  });
  if (damp) {
    const fade = Math.round(0.03 * SR);
    for (let i = 0; i < fade; i++) x[x.length - 1 - i] *= i / fade;
  }
  return x;
}

/**
 * Build a recording from parts and write it as the 16-bit WAV Chromium's fake microphone plays.
 *   parts: { pluck: { midi, cents, a4, dur }, gap } | { silence: seconds } | { noise: seconds, rms }
 * A little room noise (60 dB below the plucks) is added so the input is never digital silence.
 * Returns the path with "%noloop": the file is played once from the moment the microphone opens.
 */
async function makeRecording(name, parts, { lead = 2.5, tail = 1.5, room = true } = {}) {
  const sig = await loadSignals();
  const chunks = [sig.silence(lead, SR)];
  for (const part of parts) {
    if (part.pluck) {
      chunks.push(pluck(sig, part.pluck));
      chunks.push(sig.silence(part.gap ?? 0.7, SR));
    } else if (part.silence) chunks.push(sig.silence(part.silence, SR));
    else if (part.noise) chunks.push(sig.whiteNoise(Math.round(part.noise * SR), part.rms ?? 0.03, part.seed ?? 5));
  }
  chunks.push(sig.silence(tail, SR));
  let x = sig.concat(...chunks);
  if (room) {
    const hiss = sig.whiteNoise(x.length, 0.0004, 11);
    for (let i = 0; i < x.length; i++) x[i] += hiss[i];
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuner-e2e-'));
  const file = path.join(dir, `${name}.wav`);
  fs.writeFileSync(file, Buffer.from(sig.encodeWav(x, SR, { bitDepth: 16 })));
  return { file, fakeAudio: `${file}%noloop`, seconds: x.length / SR };
}

/** Storage that skips the first-run dialog and (by default) the tuner's first-time guided flow. */
function seedStorage({ guideSeen = true, options = {} } = {}) {
  return {
    'ssa:shell.onboarding': '{"skipped":true}',
    'ssa:tuner.options': JSON.stringify({ guideSeen, ...options }),
  };
}

/** Put values into localStorage before the app starts. */
async function seed(context, entries) {
  await context.addInitScript((items) => {
    try {
      for (const [key, value] of Object.entries(items)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    } catch {
      // Storage is not available: the app copes, and so does the test.
    }
  }, entries);
}

const READOUT = '[data-tuner-readout]';

/** Wait for the tuner screen itself (the route is lazy and a busy machine can take a while). */
async function waitForTuner(page, timeout = 45000) {
  await page.waitForSelector(READOUT, { timeout });
}

/**
 * Start logging the readout's data attributes: every change (so no short state is missed) and a
 * sample every 25 ms (so a reading that holds still is weighted by how long it was shown).
 */
async function startLog(page) {
  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const log = [];
    const push = () => {
      const d = el.dataset;
      log.push({ t: performance.now(), state: d.state, note: d.note, cents: d.cents, string: d.string, instruction: d.instruction, tuned: d.tuned, mode: d.mode, advice: d.advice });
    };
    push();
    window.__tunerLog = log;
    window.__tunerObserver?.disconnect();
    clearInterval(window.__tunerTimer);
    window.__tunerObserver = new MutationObserver(push);
    window.__tunerObserver.observe(el, { attributes: true });
    window.__tunerTimer = setInterval(push, 25);
  }, READOUT);
}

/** The log so far. */
function readLog(page) {
  return page.evaluate(() => window.__tunerLog ?? []);
}

/** The readout's attributes right now. */
function readout(page) {
  return page.evaluate((selector) => ({ ...document.querySelector(selector).dataset }), READOUT);
}

/**
 * Cut a log into the notes that were heard: each stretch of `hearing` / `in-tune` between two
 * `listening` stretches. For each: the notes and strings named, whether "in tune" was reached,
 * the instructions shown, and the median cents once settled (0.6 s after the note appeared).
 */
function episodes(log) {
  const out = [];
  let cur = null;
  for (const e of log) {
    const live = e.state === 'hearing' || e.state === 'in-tune';
    if (live) {
      cur ??= { start: e.t, end: e.t, notes: new Set(), strings: new Set(), instructions: new Set(), inTune: false, samples: [] };
      cur.end = e.t;
      if (e.note) cur.notes.add(e.note);
      if (e.string) cur.strings.add(e.string);
      if (e.instruction) cur.instructions.add(e.instruction);
      if (e.state === 'in-tune') cur.inTune = true;
      if (e.cents !== '' && e.cents !== undefined) cur.samples.push({ t: e.t - cur.start, c: Number(e.cents) });
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out.map((ep) => {
    const settled = ep.samples.filter((s) => s.t >= 600).map((s) => s.c).sort((a, b) => a - b);
    return {
      seconds: (ep.end - ep.start) / 1000,
      notes: [...ep.notes],
      strings: [...ep.strings],
      instructions: [...ep.instructions],
      inTune: ep.inTune,
      readings: ep.samples.length,
      cents: settled.length ? settled[settled.length >> 1] : NaN,
    };
  });
}

module.exports = { SR, loadSignals, freqOf, pluck, makeRecording, seedStorage, seed, waitForTuner, startLog, readLog, readout, episodes, READOUT };
