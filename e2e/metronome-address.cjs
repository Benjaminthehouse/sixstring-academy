#!/usr/bin/env node
/**
 * Browser check of the metronome's address (`#metronome--t50--3-4--accents-2-3-1`): a lesson's link
 * opens the metronome set up, the same as setting it by hand. Run: node e2e/metronome-address.cjs
 *
 *  - a stored setup from earlier (7/8, sixteenths, speed trainer) is replaced by the address's
 *    whole setup: tempo, time signature, accents (beat 2 strong, beat 1 medium), subdivision;
 *  - the learner's own volume survives; a toast says what was set; the setting is stored, so it
 *    is still there after a reload of the plain `#metronome`;
 *  - swing alone means swung eighths; silent bars; 7/8 with its grouping;
 *  - an address it does not know leaves the learner's setup alone; no console errors, no sideways
 *    scroll on a phone.
 */
const { withApp } = require('./lib/harness.cjs');

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail: String(detail) });
  if (!pass) console.log(`    FAIL  ${name}${detail ? `  (${String(detail).slice(0, 300)})` : ''}`);
};
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];

const EARLIER = {
  tempo: 140,
  meter: '7/8(3+2+2)',
  accents: null,
  subdivision: 'sixteenth',
  swing: 2 / 3,
  volume: 0.6,
  countIn: 1,
  trainer: { on: true, start: 100, target: 140, step: 5, every: 4 },
  gap: { on: false, play: 2, mute: 2 },
  timerMinutes: 0,
  visualOnly: false,
  vibrate: false,
};

async function seed(context) {
  await context.addInitScript((earlier) => {
    try {
      if (localStorage.getItem('ssa:shell.onboarding') === null) localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('ssa:metronome.settings', JSON.stringify(earlier));
        sessionStorage.setItem('seeded', '1');
      }
    } catch {
      /* no storage */
    }
  }, EARLIER);
}

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ssa:metronome.settings') || 'null'));
const root = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-metronome]');
    return el ? { bpm: el.getAttribute('data-bpm'), meter: el.getAttribute('data-meter'), sub: el.getAttribute('data-subdivision'), address: el.getAttribute('data-address') } : null;
  });

async function main() {
  await withApp({ mobile: true }, async ({ page, context, goto, errors }) => {
    await seed(context);
    await goto('metronome', 't50', '3-4', 'accents-2-3-1');
    await page.waitForSelector('[data-metronome][data-address]', { timeout: 30000 });
    const r = await root(page);
    check('tempo from the address', r && r.bpm === '50', JSON.stringify(r));
    check('time signature from the address', r && r.meter === '3/4', JSON.stringify(r));
    check('subdivision back to beats only', r && r.sub === 'none', JSON.stringify(r));
    const s = await stored(page);
    check('accents stored: beat 2 strong, beat 1 medium', s && JSON.stringify(s.accents) === '[2,3,1]', JSON.stringify(s && s.accents));
    check('speed trainer switched off', s && s.trainer && s.trainer.on === false, JSON.stringify(s && s.trainer));
    check('the learner’s volume and count-in kept', s && s.volume === 0.6 && s.countIn === 1, JSON.stringify(s));
    const toastText = await page.evaluate(() => document.body.innerText);
    check('a toast says what was set', /Set to 50 BPM · 3\/4/.test(toastText), toastText.slice(0, 200));
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('no sideways scroll on a phone', over <= 1, `${over}px`);
    // The beat strip shows the accents: three beats, the second the strongest.
    const beats = await page.evaluate(() => [...document.querySelectorAll('[data-beat-pad]')].map((b) => b.getAttribute('data-accent')));
    check('beat strip shows the accents', beats.length === 3 && beats.join(',') === '2,3,1', beats.join(','));

    // Stored like a setting made by hand: the plain address opens on it.
    await goto('metronome');
    await page.waitForSelector('[data-metronome]', { timeout: 30000 });
    const plain = await root(page);
    check('still set after opening plain #metronome', plain && plain.bpm === '50' && plain.meter === '3/4' && !plain.address, JSON.stringify(plain));

    await goto('metronome', 'swing-60', 't120');
    await page.waitForSelector('[data-metronome][data-address="swing-60--t120"]', { timeout: 30000 });
    const swing = await root(page);
    const sw = await stored(page);
    check('swing alone means swung eighths', swing && swing.sub === 'swing' && sw.swing === 0.6 && swing.bpm === '120', JSON.stringify({ swing, ratio: sw.swing }));
    check('a new address resets the accents of the last one', sw.accents === null && swing.meter === '4/4', JSON.stringify(sw));

    await goto('metronome', '7-8-3-2-2', 'eighth', 't80', 'gap-1-1');
    await page.waitForSelector('[data-metronome][data-address]', { timeout: 30000 });
    const seven = await root(page);
    const sv = await stored(page);
    check('7/8 grouped 3+2+2 with eighths', seven && seven.meter === '7/8(3+2+2)' && seven.sub === 'eighth' && seven.bpm === '80', JSON.stringify(seven));
    check('silent bars from the address', sv.gap && sv.gap.on && sv.gap.play === 1 && sv.gap.mute === 1, JSON.stringify(sv.gap));

    await goto('metronome', 'nonsense');
    await page.waitForSelector('[data-metronome]', { timeout: 30000 });
    const kept = await root(page);
    check('an address it does not know changes nothing', kept && kept.meter === '7/8(3+2+2)' && kept.bpm === '80' && !kept.address, JSON.stringify(kept));

    const real = errors.filter((e) => !BENIGN.some((b) => b.test(e)));
    check('no console errors', real.length === 0, real.join(' | '));
  });
}

main()
  .catch((e) => check('ran without throwing', false, e && e.stack ? e.stack : e))
  .finally(() => {
    const bad = checks.filter((c) => !c.pass);
    console.log(`${bad.length ? 'FAIL' : 'ok  '}  metronome address: ${checks.length - bad.length}/${checks.length} checks`);
    console.log(bad.length ? 'FAILED' : 'PASSED');
    process.exit(bad.length ? 1 : 0);
  });
