#!/usr/bin/env node
/**
 * Screenshots of the tuner in its states, for looking at the design. Run:
 *   node e2e/tuner-shots.cjs [--only name,name] [--list]
 * Writes e2e/out/tuner-<name>.png. A synthetic plucked string is fed in as the microphone, so the
 * listening states are real: the screen is hearing a string when the picture is taken.
 */
const path = require('node:path');
const { withApp, ROOT } = require('./lib/harness.cjs');
const lib = require('./tuner-lib.cjs');

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const OUT = path.join(ROOT, 'e2e', 'out');

const PHONE = { mobile: true };
const SIDEWAYS = { mobile: true, viewport: { width: 844, height: 390 } };
const SMALL = { mobile: true, viewport: { width: 360, height: 640 } };
const LAPTOP = { viewport: { width: 1366, height: 680 } };

/** A looping recording: one long pluck, a short rest. */
const loop = (midi, cents, extra = {}) => ({ parts: [{ pluck: { midi, cents, dur: 3.2, decay: 0.9, ...extra }, gap: 0.5 }], lead: 0.3, tail: 0.1 });

const state = (page, value, timeout = 30000) => page.waitForSelector(`${lib.READOUT}[data-state="${value}"]`, { timeout });
const hearing = async (page) => {
  await state(page, 'hearing');
  await page.waitForTimeout(700);
};

/** name -> { opts, audio?, seed?, run(page) } */
const SHOTS = {
  'idle-phone': { opts: PHONE },
  'idle-phone-light': { opts: { ...PHONE, theme: 'light' } },
  'idle-desktop': { opts: {} },
  'idle-desktop-light': { opts: { theme: 'light' } },
  'idle-laptop': { opts: LAPTOP },
  'idle-small': { opts: SMALL },
  'idle-sideways': { opts: SIDEWAYS },

  'flat-phone': { opts: PHONE, audio: loop(45, -12), run: hearing },
  'flat-phone-light': { opts: { ...PHONE, theme: 'light' }, audio: loop(45, -12), run: hearing },
  'flat-desktop': { opts: {}, audio: loop(45, -12), run: hearing },
  'flat-desktop-light': { opts: { theme: 'light' }, audio: loop(45, -12), run: hearing },
  'flat-sideways': { opts: SIDEWAYS, audio: loop(45, -12), run: hearing },
  'flat-small': { opts: SMALL, audio: loop(45, -12), run: hearing },
  'flat-laptop': { opts: LAPTOP, audio: loop(45, -12), run: hearing },
  'sharp-phone': { opts: PHONE, audio: loop(59, 34), run: hearing },
  'offscale-phone': { opts: PHONE, audio: loop(55, -75), run: hearing },
  'unsure-phone': { opts: PHONE, audio: loop(42, 0), run: hearing },

  'intune-phone': { opts: PHONE, audio: loop(50, 0.5), run: (page) => state(page, 'in-tune').then(() => page.waitForTimeout(250)) },
  'intune-phone-light': { opts: { ...PHONE, theme: 'light' }, audio: loop(50, 0.5), run: (page) => state(page, 'in-tune').then(() => page.waitForTimeout(250)) },
  'intune-desktop': { opts: {}, audio: loop(50, 0.5), run: (page) => state(page, 'in-tune').then(() => page.waitForTimeout(250)) },
  'intune-desktop-light': { opts: { theme: 'light' }, audio: loop(50, 0.5), run: (page) => state(page, 'in-tune').then(() => page.waitForTimeout(250)) },

  'far-phone': {
    opts: PHONE,
    audio: loop(42, 0),
    run: async (page) => {
      await state(page, 'listening');
      await page.click('[data-string="5"]');
      await page.waitForSelector(`${lib.READOUT}[data-instruction="far-below"]`, { timeout: 30000 });
      await page.waitForTimeout(300);
    },
  },
  'locked-phone': {
    opts: PHONE,
    audio: loop(45, -12),
    run: async (page) => {
      await state(page, 'listening');
      await page.click('[data-string="4"]');
      await page.waitForTimeout(600);
    },
  },
  'chromatic-desktop': {
    opts: {},
    audio: loop(54, 7),
    run: async (page) => {
      await state(page, 'listening');
      await page.getByRole('radio', { name: 'Chromatic' }).click();
      await hearing(page);
    },
  },
  'strobe-phone': { opts: PHONE, audio: loop(45, -6), seed: { options: { display: 'strobe', showHz: true, tolerance: 'fine' } }, run: hearing },
  'strobe-desktop': { opts: {}, audio: loop(45, -6), seed: { options: { display: 'strobe', showHz: true, tolerance: 'fine' } }, run: hearing },

  'guide-phone': {
    opts: PHONE,
    audio: { parts: [{ silence: 30 }], lead: 0.2 },
    run: async (page) => {
      await state(page, 'listening');
      await page.getByRole('radio', { name: 'Guided' }).click();
      await page.waitForTimeout(500);
    },
  },
  'guide-desktop': {
    opts: {},
    audio: { parts: [{ silence: 30 }], lead: 0.2 },
    run: async (page) => {
      await state(page, 'listening');
      await page.getByRole('radio', { name: 'Guided' }).click();
      await page.waitForTimeout(500);
    },
  },
  'summary-phone': {
    opts: PHONE,
    audio: { parts: [40, 45, 50, 55, 59, 64].map((midi) => ({ pluck: { midi, cents: 0.5, dur: 1.5 }, gap: 0.5 })), lead: 4, tail: 20, noloop: true },
    seed: { guideSeen: false },
    run: async (page) => {
      await page.click('[data-tuner-stop]');
      await page.click('[data-tuner-start]');
      await page.waitForSelector('[data-tuner-summary]', { timeout: 40000 });
      await page.waitForTimeout(900);
    },
  },

  'blocked-phone': {
    opts: PHONE,
    run: async (page) => {
      await page.click('[data-tuner-start]');
      await page.waitForSelector('[role="alert"]', { timeout: 15000 });
      await page.waitForTimeout(300);
    },
  },
  'ear-phone': {
    opts: PHONE,
    run: async (page) => {
      await page.click('[data-tuner-by-ear]');
      await page.waitForTimeout(600);
    },
  },
  'ear-phone-light': {
    opts: { ...PHONE, theme: 'light' },
    run: async (page) => {
      await page.click('[data-tuner-by-ear]');
      await page.waitForTimeout(600);
    },
  },
  'ear-desktop': {
    opts: {},
    run: async (page) => {
      await page.click('[data-string="3"]');
      await page.waitForTimeout(600);
    },
  },

  'tunings-phone': {
    opts: PHONE,
    run: async (page) => {
      await page.click('[data-tuner-tuning]');
      await page.waitForTimeout(700);
    },
  },
  'tunings-desktop': {
    opts: {},
    run: async (page) => {
      await page.getByRole('button', { name: 'Change' }).click();
      await page.waitForTimeout(700);
    },
  },
  'dadgad-desktop': {
    opts: { theme: 'light' },
    run: async (page) => {
      await page.getByRole('button', { name: 'Change' }).click();
      await page.getByRole('button', { name: /^DADGAD/ }).click();
      await page.waitForTimeout(700);
    },
  },
  'editor-phone': {
    opts: PHONE,
    run: async (page) => {
      await page.click('[data-tuner-tuning]');
      await page.getByRole('button', { name: 'Make your own tuning' }).click();
      await page.waitForTimeout(700);
    },
  },
  'settings-phone': {
    opts: PHONE,
    run: async (page) => {
      await page.getByRole('button', { name: 'Tuner settings' }).click();
      await page.waitForTimeout(700);
    },
  },
  'capo-phone': {
    opts: PHONE,
    run: async (page) => {
      await page.getByRole('button', { name: 'Tuner settings' }).click();
      await page.getByRole('radio', { name: '432 Hz' }).click();
      const plus = page.getByRole('button', { name: 'Increase Capo on fret' });
      await plus.click();
      await plus.click();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(700);
    },
  },
  'lefty-phone': {
    opts: PHONE,
    audio: loop(40, 6),
    run: async (page) => {
      await page.evaluate(async () => (await import('/src/core/progress/index.ts')).setPrefs({ handedness: 'left' }));
      await hearing(page);
    },
  },
  'alltuned-phone': {
    opts: PHONE,
    audio: { parts: [40, 45, 50, 55, 59, 64].map((midi) => ({ pluck: { midi, cents: 0.5, dur: 1.4 }, gap: 0.5 })), lead: 3, tail: 20, noloop: true },
    run: async (page) => {
      await page.click('[data-tuner-stop]');
      await page.click('[data-tuner-start]');
      await page.waitForSelector(`${lib.READOUT}[data-tuned="6,5,4,3,2,1"]`, { timeout: 40000 });
      await page.waitForTimeout(2600);
    },
  },
  'seven-phone': {
    opts: PHONE,
    run: async (page) => {
      await page.click('[data-tuner-tuning]');
      await page.getByRole('button', { name: /^Seven-string standard/ }).click();
      await page.waitForTimeout(700);
    },
  },
  'ukulele-phone': {
    opts: PHONE,
    run: async (page) => {
      await page.click('[data-tuner-tuning]');
      await page.getByRole('button', { name: /^Ukulele G/ }).click();
      await page.waitForTimeout(700);
    },
  },
};

if (argv.includes('--list')) {
  console.log(Object.keys(SHOTS).join('\n'));
  process.exit(0);
}

(async () => {
  let failed = 0;
  for (const [name, shot] of Object.entries(SHOTS)) {
    if (only && !only.some((o) => name === o || name.startsWith(o))) continue;
    try {
      const opts = { ...shot.opts };
      if (shot.audio) {
        const rec = await lib.makeRecording(`shot-${name}`, shot.audio.parts, { lead: shot.audio.lead, tail: shot.audio.tail });
        opts.fakeAudio = shot.audio.noloop ? rec.fakeAudio : rec.file;
      }
      await withApp(opts, async ({ page, context, goto, errors }) => {
        await lib.seed(context, lib.seedStorage(shot.seed ?? {}));
        await goto('tuner');
        await lib.waitForTuner(page);
        await page.waitForTimeout(500);
        if (shot.run) await shot.run(page);
        const file = path.join(OUT, `tuner-${name}.png`);
        await page.screenshot({ path: file });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const tall = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
        console.log(`${name}: ${file}${overflow > 1 ? `  SIDEWAYS SCROLL ${overflow}px` : ''}  (page is ${tall}px taller than the screen)${errors.length ? `\n  errors: ${errors.join('\n  ')}` : ''}`);
      });
    } catch (err) {
      failed++;
      console.log(`${name}: FAILED ${String(err && err.message ? err.message : err).split('\n')[0]}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
