#!/usr/bin/env node
/**
 * Browser check that the learner's Settings reach the engines (`@/core/settings`), in real Chromium
 * with its fake microphone. Run:
 *   node e2e/honour-settings.cjs [--only group,group] [--verbose]
 *
 * Groups:
 *   mic      Settings > Microphone: pick the second fake input and a sensitivity; the level test's
 *            gate line moves with the sensitivity (and a running test restarts with it). Then the
 *            tuner opens that very input (getUserMedia asks for its deviceId) and its pitch tracker
 *            is built with the learner's A4, onset level and note gate (read from the options the
 *            tracker posts to its worker).
 *   sound    the shared guitar and a new metronome follow Settings > Sound (guitar tone, click),
 *            live, and a screen's own choice still wins.
 *   ai       with the AI helper off, `ask` refuses with "disabled" and nothing is fetched; switched
 *            on without a key it says the key is missing (the switch is checked first).
 *   neck     Settings > frets reach the reference circle's neck; "Tab and notation" puts a staff
 *            over the scale exercise's tab.
 *   player   "Tab and notation" reaches a song that was already opened in tab only; a view the
 *            learner picks in the player (More > Score) still wins when the song opens again.
 *
 * Prints one line per failed check (every check with --verbose), then PASSED or FAILED.
 */
'use strict';
const { withApp } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];

let failed = 0;
let passed = 0;
function check(group, name, ok, detail) {
  if (ok) passed++;
  else failed++;
  if (!ok || verbose) console.log(`${ok ? 'ok  ' : 'FAIL'} [${group}] ${name}${detail !== undefined && (!ok || verbose) ? `  -- ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
const want = (g) => !only || only.includes(g);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Skip the first-run flow and record what the page asks of the microphone and the pitch worker. */
function instrument() {
  try {
    localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
  } catch {
    /* storage off: the check that needs it will say so */
  }
  window.__gum = [];
  window.__workerInit = [];
  window.__fetches = [];
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const real = md.getUserMedia.bind(md);
    md.getUserMedia = (constraints) => {
      try {
        window.__gum.push(JSON.parse(JSON.stringify(constraints)));
      } catch {
        window.__gum.push({ unreadable: true });
      }
      return real(constraints);
    };
  }
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (message, ...rest) {
    try {
      if (message && message.type === 'init' && message.options) window.__workerInit.push(JSON.parse(JSON.stringify(message.options)));
    } catch {
      /* not ours */
    }
    return post.call(this, message, ...rest);
  };
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    window.__fetches.push(String(input && input.url ? input.url : input));
    return realFetch(input, init);
  };
}

const setPrefs = (page, patch) => page.evaluate(async (p) => (await import('/src/core/progress/index.ts')).setPrefs(p), patch);
const prefs = (page) => page.evaluate(async () => (await import('/src/core/progress/index.ts')).getProgress().prefs);
const lastInit = (page) => page.evaluate(() => window.__workerInit[window.__workerInit.length - 1] ?? null);
const gateDb = (page) => page.evaluate(() => Number(document.querySelector('[data-settings-mic] [role="img"]')?.getAttribute('data-gate-db')));

async function micGroup() {
  const g = 'mic';
  await withApp({ fakeDevices: true }, async ({ page, context, goto, errors }) => {
    await context.addInitScript(instrument);
    await goto('profile', 'settings', 'microphone');
    await page.waitForSelector('[data-settings-mic]', { timeout: 30000 });

    // Before the test runs, the line shows the floor of the gate the sensitivity sets.
    await setPrefs(page, { mic: { sensitivity: 0 } });
    await page.waitForFunction(() => document.querySelector('[data-settings-mic] [role="img"]')?.getAttribute('data-gate-db') === '-58', null, { timeout: 10000 }).catch(() => undefined);
    const loudOnly = await gateDb(page);
    await setPrefs(page, { mic: { sensitivity: 1 } });
    await page.waitForFunction(() => document.querySelector('[data-settings-mic] [role="img"]')?.getAttribute('data-gate-db') === '-78', null, { timeout: 10000 }).catch(() => undefined);
    const quiet = await gateDb(page);
    check(g, 'level test: the gate line moves with the sensitivity (-58 dB at 0 %, -78 dB at 100 %)', loudOnly === -58 && quiet === -78, { loudOnly, quiet });

    // Start the test: the browser then names the inputs, and the second fake one can be chosen.
    await page.click('[data-mic-test]');
    await page.waitForSelector('[data-mic-status]:not([data-mic-status="off"])', { timeout: 30000 });
    const options = await page.evaluate(() => [...document.querySelectorAll('[data-settings-mic] select option')].map((o) => ({ value: o.value, label: o.textContent })));
    const pick = options.find((o) => o.value !== '__default__');
    check(g, 'the running test lists the fake inputs by name', !!pick, options);
    if (!pick) return;
    const initsBefore = await page.evaluate(() => window.__workerInit.length);
    await page.locator('[data-settings-mic] select').selectOption(pick.value);
    await page.waitForFunction((n) => window.__workerInit.length > n, initsBefore, { timeout: 20000 }).catch(() => undefined);
    const afterPick = await page.evaluate(() => window.__gum[window.__gum.length - 1]);
    check(g, 'choosing an input restarts the test on that input', JSON.stringify(afterPick).includes(pick.value), afterPick);

    // A new sensitivity while the test runs: it restarts with the new gate once the slider rests.
    const initsMid = await page.evaluate(() => window.__workerInit.length);
    await page.getByRole('slider', { name: /Sensitivity/ }).fill('20');
    await page.waitForFunction((n) => window.__workerInit.length > n, initsMid, { timeout: 20000 }).catch(() => undefined);
    const restarted = await lastInit(page);
    check(g, 'a new sensitivity reaches the running test (it restarts with gate -62 dB, onset -46 dB)', restarted?.tracker?.minGateDb === -62 && restarted?.onset?.minLevelDb === -46, restarted && { tracker: restarted.tracker, onset: restarted.onset });
    await sleep(800);
    const live = await gateDb(page);
    check(g, 'while it runs, the line follows the real gate, never below the sensitivity floor', Number.isFinite(live) && live >= -62 && live <= -32, live);
    await page.click('[data-mic-test]');

    // The tuner: the same input, and the learner's A4, onset level and note gate.
    await setPrefs(page, { a4: 442, mic: { sensitivity: 0.75 } });
    const saved = await prefs(page);
    const gumBefore = await page.evaluate(() => window.__gum.length);
    const initBefore = await page.evaluate(() => window.__workerInit.length);
    await goto('tuner');
    await page.waitForSelector('[data-tuner-readout]', { timeout: 45000 });
    await page.waitForFunction(() => document.querySelector('[data-tuner-readout]')?.dataset.source === 'mic' || !!document.querySelector('[data-tuner-start]'), null, { timeout: 30000 });
    if (await page.locator('[data-tuner-start]').count()) await page.click('[data-tuner-start]');
    await page.waitForFunction((n) => window.__workerInit.length > n, initBefore, { timeout: 30000 }).catch(() => undefined);
    const gum = await page.evaluate((n) => window.__gum.slice(n), gumBefore);
    const init = await lastInit(page);
    check(g, 'the chosen input reached Settings', saved.mic.deviceId === pick.value && saved.mic.sensitivity === 0.75, saved.mic);
    check(g, 'the tuner opens the input chosen in Settings', gum.some((c) => c && c.audio && c.audio.deviceId && c.audio.deviceId.exact === pick.value), gum);
    check(
      g,
      "the tuner's pitch tracker has the learner's A4, onset level and note gate (sensitivity 75 %)",
      init && init.a4 === 442 && init.onset?.minLevelDb === -62 && init.tracker?.minGateDb === -73 && init.tracker?.maxGateDb === -41,
      init && { a4: init.a4, onset: init.onset, tracker: init.tracker },
    );
    const real = errors.filter((e) => !BENIGN.some((b) => b.test(e)));
    check(g, 'no console errors', real.length === 0, real.slice(0, 3));
  });
}

async function soundGroup() {
  const g = 'sound';
  await withApp({}, async ({ page, context, goto, errors }) => {
    await context.addInitScript(instrument);
    await goto('metronome');
    const result = await page.evaluate(async () => {
      const progress = await import('/src/core/progress/index.ts');
      const audio = await import('/src/core/audio/index.ts');
      // The app connects the defaults by itself; wait for it as a screen would not have to.
      await audio.connectSoundDefaults();
      progress.setPrefs({ sound: { guitarTone: 'classical', clickSound: 'beep' } });
      const out = { tone: audio.getGuitar().tone, click: audio.soundDefaults().clickSound, metronome: new audio.Metronome().sound };
      progress.setPrefs({ sound: { guitarTone: 'electric', clickSound: 'cowbell' } });
      const m = new audio.Metronome();
      out.toneAfter = audio.getGuitar().tone;
      out.metronomeAfter = m.sound;
      m.sound = 'rim';
      progress.setPrefs({ sound: { clickSound: 'tick' } });
      out.screenWins = m.sound;
      return out;
    });
    check(g, 'Settings > Sound is the guitar tone and click of the shared engine', result.tone === 'nylon' && result.click === 'beep' && result.metronome === 'beep', result);
    check(g, 'a change in Settings applies at once', result.toneAfter === 'clean' && result.metronomeAfter === 'cowbell', result);
    check(g, "a screen's own click still wins", result.screenWins === 'rim', result);
    const real = errors.filter((e) => !BENIGN.some((b) => b.test(e)));
    check(g, 'no console errors', real.length === 0, real.slice(0, 3));
  });
}

async function aiGroup() {
  const g = 'ai';
  await withApp({}, async ({ page, context, goto }) => {
    await context.addInitScript(instrument);
    await goto('profile', 'settings', 'ai');
    const r = await page.evaluate(async () => {
      const platform = await import('/src/core/platform/index.ts');
      const progress = await import('/src/core/progress/index.ts');
      const attempt = async () => {
        try {
          await platform.ask({ prompt: 'Hello?' });
          return 'answered';
        } catch (e) {
          return e && e.kind;
        }
      };
      progress.setPrefs({ ai: { enabled: false } });
      const off = await attempt();
      const status = await platform.aiStatus();
      progress.setPrefs({ ai: { enabled: true } });
      const onNoKey = await attempt();
      progress.setPrefs({ ai: { enabled: false } });
      return { off, status, onNoKey, fetches: window.__fetches.filter((u) => /anthropic|claude/i.test(u)) };
    });
    check(g, 'switched off: ask refuses with "disabled"', r.off === 'disabled', r);
    check(g, 'aiStatus reports the switch apart from the host', r.status.enabled === false && r.status.reason === 'no-key', r.status);
    check(g, 'switched on without a key: "not-available", the next thing in the way', r.onNoKey === 'not-available', r);
    check(g, 'nothing was sent anywhere', r.fetches.length === 0, r.fetches);
  });
}

async function neckGroup() {
  const g = 'neck';
  for (const mobile of [false, true]) {
    await withApp({ mobile }, async ({ page, context, goto, errors }) => {
      await context.addInitScript(instrument);
      await goto('reference', 'circle');
      await setPrefs(page, { fretboard: { frets: 20 } });
      const frets = await page.waitForSelector('[data-neck-frets="20"]', { timeout: 30000 }).then(() => true, () => false);
      const caption = await page.evaluate(() => document.querySelector('[data-neck-frets]')?.closest('section')?.textContent ?? '');
      check(g, `${mobile ? 'phone' : 'desktop'}: the reference circle's neck draws the 20 frets asked for, and says so`, frets && /to fret 20\b/.test(caption), caption.slice(0, 160));
      const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      check(g, `${mobile ? 'phone' : 'desktop'}: no sideways page scroll with a 20-fret neck`, wide);

      if (!mobile) {
        // The jam neck: the learner's tuning (Drop D: two D strings) and, on a wide screen, their frets.
        await setPrefs(page, { tuningId: 'drop-d' });
        await goto('progressions', 'pop-axis', 'g', 'jam');
        const neck = await page
          .waitForFunction(() => {
            const svg = document.querySelector('svg[aria-label*="on the neck"]');
            if (!svg) return null;
            const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent.trim());
            return texts.includes('19') ? texts : null;
          }, null, { timeout: 30000 })
          .then((h) => h.jsonValue(), () => null);
        const strings = neck ? neck.filter((t) => /^[A-G]$/.test(t)) : [];
        check(g, 'desktop: the jam neck follows the tuning (Drop D) and the 20 frets of Settings', !!neck && strings.filter((t) => t === 'D').length >= 2, neck && neck.slice(0, 30));
        // All 20 frets stay in view: a neck that scrolls while the band plays hides notes (and,
        // left-handed, the nut end).
        await setPrefs(page, { handedness: 'left' });
        await page.waitForTimeout(500);
        const hidden = await page.evaluate(() => {
          const svg = document.querySelector('svg[aria-label*="on the neck"]');
          let el = svg && svg.parentElement;
          for (; el && el.tagName !== 'SECTION'; el = el.parentElement) if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible') return `${el.clientWidth}/${el.scrollWidth}`;
          return svg ? null : 'no neck';
        });
        check(g, 'desktop: the 20-fret jam neck fits its panel without scrolling (left-handed too)', hidden === null, hidden);
        await setPrefs(page, { handedness: 'right' });
        await setPrefs(page, { tuningId: 'standard' });
      }

      await setPrefs(page, { notation: 'tab' });
      await goto('scales', 'a', 'minor-pentatonic');
      const tabOnly = await page.waitForSelector('[data-tab-view][aria-label$="written as tab"]', { timeout: 45000 }).then(() => true, () => false);
      await setPrefs(page, { notation: 'tab+notation' });
      const both = await page.waitForSelector('[data-tab-view][aria-label$="written as notation and tab"]', { timeout: 30000 }).then(() => true, () => false);
      check(g, `${mobile ? 'phone' : 'desktop'}: the scale exercise is tab only, then notation and tab with "Tab and notation"`, tabOnly && both, { tabOnly, both });
      const real = errors.filter((e) => !BENIGN.some((b) => b.test(e)));
      check(g, `${mobile ? 'phone' : 'desktop'}: no console errors`, real.length === 0, real.slice(0, 3));
    });
  }
}

/** What the player's score shows, from its label ("…: notation and tab." / "…: tab."). */
const scoreLayer = (page) =>
  page
    .waitForSelector('[data-player-score] [data-tab-view]', { timeout: 90000 })
    .then(() => page.locator('[data-player-score] [data-tab-view]').first().getAttribute('aria-label'))
    .then((label) => (/notation and tab/.test(label ?? '') ? 'both' : /: tab\b/.test(label ?? '') ? 'tab' : `? ${label}`));

async function playerGroup() {
  const g = 'player';
  await withApp({}, async ({ page, context, goto, errors }) => {
    await context.addInitScript(instrument);
    await goto('profile');
    // Opened once in tab only: the player saves its session for the song (the layer with it).
    await setPrefs(page, { notation: 'tab' });
    await goto('play', 'amazing-grace');
    const first = await scoreLayer(page);
    await page.waitForFunction(() => !!localStorage.getItem('ssa:player.session.amazing-grace'), null, { timeout: 15000 }).catch(() => undefined);
    // Then Settings > "Tab and notation": the same song must show the staff now.
    await goto('profile');
    await setPrefs(page, { notation: 'tab+notation' });
    await goto('play', 'amazing-grace');
    const after = await scoreLayer(page);
    check(g, 'a song opened before "Tab and notation" was turned on shows notation and tab afterwards', first === 'tab' && after === 'both', { first, after });
    // The learner picks "Tab" in the player itself (beside the score on a wide screen, under More
    // on a narrow one): that choice is theirs for this song.
    const more = page.locator('[data-player-more]');
    if (await more.count()) await more.first().click();
    await page.getByRole('radiogroup', { name: 'Score' }).getByRole('radio', { name: 'Tab', exact: true }).click();
    if (await more.count()) await page.keyboard.press('Escape');
    const picked = await scoreLayer(page);
    await page.waitForFunction(() => /"layerPicked":true/.test(localStorage.getItem('ssa:player.session.amazing-grace') ?? ''), null, { timeout: 15000 }).catch(() => undefined);
    await goto('profile');
    await goto('play', 'amazing-grace');
    const reopened = await scoreLayer(page);
    check(g, "a view picked in the player wins over Settings when the song is opened again", picked === 'tab' && reopened === 'tab', { picked, reopened });
    const real = errors.filter((e) => !BENIGN.some((b) => b.test(e)));
    check(g, 'no console errors', real.length === 0, real.slice(0, 3));
  });
}

(async () => {
  const groups = { mic: micGroup, sound: soundGroup, ai: aiGroup, neck: neckGroup, player: playerGroup };
  for (const [name, run] of Object.entries(groups)) {
    if (!want(name)) continue;
    try {
      await run();
    } catch (err) {
      check(name, 'ran to the end', false, String(err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err));
    }
  }
  console.log(`${passed} passed, ${failed} failed`);
  console.log(failed ? 'FAILED' : 'PASSED');
  process.exit(failed ? 1 : 0);
})();
