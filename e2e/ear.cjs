#!/usr/bin/env node
/**
 * Browser check of Ear Training (src/features/ear). Run:
 *   node e2e/ear.cjs [--verbose] [--shots] [--only screens,rounds,sound,layout,status,mic,review] [--round "phone melody"]
 *
 * Real Chromium, real Web Audio.
 *
 *  screens  the hub, a drill's levels and a level's intro open on a phone and a desktop: one h1, no
 *           sideways scroll, no console errors; the ladder has every drill with "Higher or lower" as
 *           its first rung and "Continue" pointing at it; an address that names nothing lands on a list
 *  rounds   whole rounds: pitch, chord quality and melody playback on a phone by tapping; intervals
 *           going up, melody playback and scale degrees on a desktop with the keyboard; two wrong
 *           answers in each:
 *           every question plays by itself (the plan the app played is the question's own plan), a
 *           right answer says so, a wrong one plays the learner's choice and then the right answer
 *           (the very plans of those two options), the summary shows the score that was earned
 *           (80 %), and the progress store holds the round (skill, best accuracy, confusion record,
 *           recents)
 *  sound    what the engine actually sounded is captured sample by sample (AudioWorklet on the
 *           engine's output) while the app plays a question, and run through the pitch module's
 *           analyze(): the notes it detects are the question's notes (pitch, intervals up and down,
 *           tuning, scales, scale degrees, melody); a tuning question's detune is measured in cents;
 *           a chord question's chroma ranks the right chord above the other options; a progression
 *           with the backing band chosen is played by the band
 *  layout   phone: answers in the lower half, every answer at least 44 px tall, no keyboard hints;
 *           phone held sideways: answers beside the listening area; desktop: keyboard hints shown
 *  status   with the volume at zero a round says "Your sound is off", and one tap turns it back on
 *  pass2    melodic dictation tapped on a neck (right, and an octave off is wrong, with the missed
 *           note shown on the board), a bass line played on the bass and tapped back, modes over a
 *           scheduled drone (and the feedback naming the note to listen for), a catalog progression
 *           opened by #ear--progression--<id> and left back to its page, played through as its own
 *           skill with its own confusion record (none of it shows on the progressions drill or the
 *           hub), a reload on the last answer that still ends and records the round, the chord
 *           shape in feedback explained with its chord box
 *  mic      melody playback answered on the guitar: Chromium's fake microphone plays a WAV of two
 *           guitar notes rendered by the audio module; they fill the melody's slots in order and
 *           are marked against it (the app ignores what it hears while it is playing itself)
 *  review   cases an independent review caught: a level's intro asks that level's own question;
 *           answer labels stay whole inside their buttons (three modes and three progressions at
 *           360 px, scale names at 200 % text) and twelve answers all fit a phone held sideways;
 *           Escape leaves a round; a round left early shows no "Best 0 %"; a reload mid-round
 *           comes back to the same question and the round is recorded once when it ends
 *
 * Prints one line per failed check (all with --verbose) and PASSED or FAILED; exits non-zero on failure.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { withApp, loadTs, VIEWPORTS, ROOT } = require('./lib/harness.cjs');
const { installPageTools } = require('./audio-lib.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const shots = argv.includes('--shots');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',') : null;
const wants = (group) => !only || only.includes(group);

const ONBOARDED = { 'ssa:shell.onboarding': '{"skipped":true}' };
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail !== '' ? `  (${String(detail).slice(0, 500)})` : ''}`);
  return !!pass;
}

/** A browser context shaped like the harness's own, with storage seeded before the app starts. */
async function open(browser, url, { mobile = false, viewport, theme = 'dark', seed = {} } = {}) {
  const context = await browser.newContext({
    viewport: viewport || VIEWPORTS[mobile ? 'mobile' : 'desktop'],
    deviceScaleFactor: 1,
    colorScheme: theme,
    hasTouch: !!mobile,
    isMobile: !!mobile,
  });
  await context.addInitScript((entries) => {
    try {
      for (const [key, value] of Object.entries(entries)) if (localStorage.getItem(key) == null) localStorage.setItem(key, value);
    } catch {
      /* no storage: the app copes */
    }
  }, { ...ONBOARDED, ...seed });
  await installPageTools(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((p) => p.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  const goto = async (hash) => {
    // Going to the address already open would not remount the screen: step out to the hub first.
    if (page.url().endsWith(`#${hash}`)) {
      await page.evaluate(() => (location.hash = '#ear'));
      await page.waitForSelector('[data-ear-continue]', { timeout: 30000 });
    }
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-route="ear"] [data-ui-page]', { timeout: 60000 });
    await page.evaluate(async () => {
      window.__ear = (await import('/src/features/ear/engine/debug.ts')).earDebug;
    });
    await page.waitForTimeout(300);
  };
  const shot = async (name) => {
    if (!shots) return;
    fs.mkdirSync(path.join(ROOT, 'e2e', 'out'), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, 'e2e', 'out', `ear-${name}.png`) });
  };
  return { context, page, errors, goto, shot, takeErrors: () => errors.splice(0, errors.length), close: () => context.close() };
}

/** The shell's XP toasts sit over the bottom of the screen for a few seconds: clear them (and any dialog) before tapping there. */
async function clearToasts(page) {
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 3 && (await page.getByRole('dialog').count()) > 0; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    await page.evaluate(async () => (await import('/src/ui/index.ts')).toast.clear());
    await page.waitForTimeout(250);
    const left = await page.evaluate(() => document.querySelectorAll('[aria-label="Notifications"] > *').length + document.querySelectorAll('[role="dialog"]').length);
    if (left === 0) return;
  }
}

async function noSideways(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** The question on screen, as plain data. */
async function currentQuestion(page) {
  return page.evaluate(() => {
    const q = window.__ear.question;
    if (!q) return null;
    return JSON.parse(JSON.stringify(q));
  });
}

// ---------------------------------------------------------------------------------------------
// screens
// ---------------------------------------------------------------------------------------------
async function screens(browser, url) {
  for (const mobile of [true, false]) {
    const tag = mobile ? 'phone' : 'desktop';
    const s = await open(browser, url, { mobile });
    try {
      for (const hash of ['ear', 'ear--intervals-up', 'ear--chords--2', 'ear--melody--1']) {
        await s.goto(hash);
        const h1 = await s.page.locator('h1').count();
        check('screens', `${tag} #${hash}: one h1`, h1 === 1, h1);
        const over = await noSideways(s.page);
        check('screens', `${tag} #${hash}: no sideways scroll`, over <= 1, `${over}px`);
        const errs = s.takeErrors();
        check('screens', `${tag} #${hash}: no console errors`, errs.length === 0, errs.join(' | '));
        await s.shot(`${hash}-${tag}`);
      }
      await s.goto('ear');
      const rungs = await s.page.locator('[data-ear-rung]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ear-rung')));
      check('screens', `${tag}: the ladder lists every drill, "Higher or lower" first`, rungs.length === 14 && rungs[0] === 'pitch' && ['dictation', 'bass', 'modes'].every((d) => rungs.includes(d)), rungs.join(','));
      const cont = await s.page.getAttribute('[data-ear-continue]', 'data-ear-continue');
      check('screens', `${tag}: Continue points at the first step`, cont === 'pitch:1', cont);
      if (!mobile) {
        // The first rung sits at the bottom of the ladder.
        const ys = await s.page.locator('[data-ear-rung]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
        check('screens', 'desktop: rung 1 is drawn at the bottom of the ladder', ys[0] > ys[ys.length - 1], ys.slice(0, 2).join(','));
      }
      await s.goto('ear--no-such-drill');
      await s.page.waitForTimeout(500);
      const hash = await s.page.evaluate(() => location.hash);
      check('screens', `${tag}: an unknown drill lands on the hub`, hash === '#ear', hash);
      await s.goto('ear--pitch--99');
      await s.page.waitForTimeout(500);
      check('screens', `${tag}: an unknown level lands on the drill`, (await s.page.evaluate(() => location.hash)) === '#ear--pitch', await s.page.evaluate(() => location.hash));
    } finally {
      await s.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// rounds
// ---------------------------------------------------------------------------------------------
/** Play a whole round. `wrongAt`: question indexes answered wrongly on purpose. */
const roundFilter = argv.includes('--round') ? argv[argv.indexOf('--round') + 1] : null;

async function playRound(s, { drill, level, mobile, wrongAt, label }) {
  if (roundFilter && !label.includes(roundFilter)) return null;
  const { page } = s;
  const keys = !mobile;
  const group = 'rounds';
  await s.goto(`ear--${drill}--${level}`);
  await clearToasts(page);
  if (keys) await page.keyboard.press('Enter');
  else await page.locator('[data-ear-start]').click();
  await page.waitForSelector('[data-ear-phase="asking"]', { timeout: 30000 });
  const total = await page.evaluate(() => Number(document.querySelector('[data-ear-question]') && document.querySelector('[aria-label^="Question "]').getAttribute('aria-label').split(' of ')[1]));
  let rightCount = 0;
  let autoPlayed = 0;
  let compared = 0;
  for (let i = 0; i < total; i++) {
    await page.waitForFunction((n) => window.__ear.question && window.__ear.question.index === n && document.querySelector('[data-ear-phase="asking"]'), i, { timeout: 30000 });
    const q = await currentQuestion(page);
    // The question plays by itself after a short beat, and what plays is the question's own plan.
    const played = await page
      .waitForFunction(
        (id) => {
          const cur = window.__ear.question;
          if (!cur || cur.id !== id) return false;
          const plan = JSON.stringify(cur.plan);
          return window.__ear.plays.some((p) => p.label === 'question' && JSON.stringify(p.plan) === plan);
        },
        q.id,
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false);
    if (played) autoPlayed++;
    if (i === 1 && keys) {
      const before = await page.evaluate(() => window.__ear.played);
      await page.keyboard.press(' ');
      const replayed = await page.waitForFunction((n) => window.__ear.plays.some((p) => p.seq > n && p.label === 'question:normal'), before, { timeout: 10000 }).then(() => true).catch(() => false);
      check(group, `${label}: Space plays the question again`, replayed);
    }
    if (i === 1 && q.canSlow && !keys) {
      await page.locator('[data-ear-slower]').click();
      const slow = await page.waitForFunction(() => window.__ear.plays.some((p) => p.label === 'question:slower'), null, { timeout: 10000 }).then(() => true).catch(() => false);
      check(group, `${label}: "Slower" plays a slower version`, slow);
    }
    const wrong = wrongAt.includes(i);
    const mark = await page.evaluate(() => window.__ear.played);
    let chosen;
    if (q.kind === 'choice') {
      const ids = q.options.map((o) => o.id);
      chosen = wrong ? ids.find((id) => id !== q.answer) : q.answer;
      if (keys) await page.keyboard.press(KEYS[ids.indexOf(chosen)]);
      else await page.locator(`[data-ear-answer="${chosen}"]`).click();
    } else {
      const seq = q.target.slice(q.given);
      if (wrong) seq[seq.length - 1] = q.keys.find((k) => k.id !== seq[seq.length - 1]).id;
      chosen = seq;
      for (const id of seq) {
        if (keys) await page.keyboard.press(KEYS[q.keys.findIndex((k) => k.id === id)]);
        else await page.locator(`[data-ear-key="${id}"]`).click();
        await page.waitForTimeout(60);
      }
    }
    const status = await page.waitForSelector(`[data-ear-status="${wrong ? 'wrong' : 'right'}"]`, { timeout: 15000 }).then(() => true).catch(() => false);
    if (!status) check(group, `${label}: question ${i + 1} is marked ${wrong ? 'wrong' : 'right'}`, false, await page.evaluate(() => document.querySelector('[data-ear-status]')?.getAttribute('data-ear-status')));
    if (!wrong) rightCount++;
    if (wrong) {
      if (i === wrongAt[0]) await s.shot(`${drill}-wrong-${mobile ? 'phone' : 'desktop'}`);
      // Wrong: the learner's choice plays, then the right answer: the exact plans of those two options.
      const ok = await page
        .waitForFunction((m) => {
          const fresh = window.__ear.plays.filter((p) => p.seq > m);
          return fresh.some((p) => p.label.startsWith('compare:answer')) && fresh.some((p) => p.label.startsWith('compare:chosen'));
        }, mark, { timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      if (ok) {
        const order = await page.evaluate((m) => {
          const q = window.__ear.question;
          const plays = window.__ear.plays.filter((p) => p.seq > m);
          const ci = plays.findIndex((p) => p.label.startsWith('compare:chosen'));
          const ai = plays.findIndex((p) => p.label.startsWith('compare:answer'));
          if (q.kind !== 'choice') return { order: ci < ai, plans: JSON.stringify(plays[ai].plan.events.map((e) => e.midis)) === JSON.stringify(q.plan.events.map((e) => e.midis)) };
          const chosenId = plays[ci].label.split(':')[2];
          const answerId = plays[ai].label.split(':')[2];
          const chosenPlan = q.options.find((o) => o.id === chosenId).plan;
          const answerPlan = q.options.find((o) => o.id === q.answer).plan;
          return { order: ci < ai, plans: answerId === q.answer && JSON.stringify(plays[ci].plan) === JSON.stringify(chosenPlan) && JSON.stringify(plays[ai].plan) === JSON.stringify(answerPlan) };
        }, mark);
        if (order.order && order.plans) compared++;
        else check(group, `${label}: question ${i + 1}: comparison plays your choice, then the answer`, false, JSON.stringify(order));
      } else check(group, `${label}: question ${i + 1}: comparison played`, false, await page.evaluate((m) => window.__ear.plays.filter((p) => p.seq > m).map((p) => p.label).join(', ') + ' | chosen ' + JSON.stringify(window.__ear.question && window.__ear.question.target), mark));
      const labels = await page.locator('[data-ear-hear]').count();
      if (labels !== 2) check(group, `${label}: two labelled replay buttons after a wrong answer`, false, labels);
      if (keys) await page.keyboard.press('Enter');
      else await page.locator('[data-ear-next]').click();
    } else if (i % 3 === 0) {
      // Right answers move on by themselves; now and then the learner is quicker.
      if (keys) await page.keyboard.press('Enter');
      else await page.locator('[data-ear-next]').click().catch(() => undefined);
    }
  }
  await page.waitForSelector('[data-ear-summary]', { timeout: 20000 });
  check(group, `${label}: every question played by itself, as generated`, autoPlayed === total, `${autoPlayed}/${total}`);
  check(group, `${label}: every wrong answer played both sides`, compared === wrongAt.length, `${compared}/${wrongAt.length}`);
  const acc = Number(await page.getAttribute('[data-ear-summary]', 'data-accuracy'));
  const expected = Math.round((rightCount / total) * 100);
  check(group, `${label}: the summary shows the score earned`, acc === expected, `${acc} vs ${expected}`);
  await clearToasts(page);
  await s.shot(`${drill}-summary-${mobile ? 'phone' : 'desktop'}`);
  const stored = await page.evaluate(async ({ drill, level }) => {
    const p = await import('/src/core/progress/index.ts');
    const st = p.getProgress();
    const skill = st.skills[`ear:${drill}:${level}`];
    const rec = st.skills[`ear:${drill}`];
    return { best: skill?.bestAccuracy, attempts: skill?.attempts, mix: rec?.data?.mix ? Object.keys(rec.data.mix).length : 0, recent: st.recents.some((r) => r.route === 'ear'), stars: skill?.stars };
  }, { drill, level });
  check(group, `${label}: the round is recorded (skill, best ${expected}%, confusions, recents)`, stored.attempts >= 1 && Math.round(stored.best * 100) === expected && stored.mix >= 1 && stored.recent, JSON.stringify(stored));
  const nextStep = await page.locator('[data-ear-next-step]').count();
  if (expected >= 80) check(group, `${label}: a passed round offers the next step`, nextStep === 1);
  return { total, rightCount };
}

async function rounds(browser, url) {
  const phone = await open(browser, url, { mobile: true });
  try {
    await playRound(phone, { drill: 'pitch', level: 1, mobile: true, wrongAt: [1, 4], label: 'phone pitch' });
    await playRound(phone, { drill: 'chords', level: 1, mobile: true, wrongAt: [0, 5], label: 'phone chords' });
    await playRound(phone, { drill: 'melody', level: 2, mobile: true, wrongAt: [2, 3], label: 'phone melody' });
    const errs = phone.takeErrors();
    check('rounds', 'phone: no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await phone.close();
  }
  const desk = await open(browser, url, { mobile: false });
  try {
    await playRound(desk, { drill: 'intervals-up', level: 3, mobile: false, wrongAt: [3, 7], label: 'desktop intervals' });
    await playRound(desk, { drill: 'melody', level: 1, mobile: false, wrongAt: [0, 6], label: 'desktop melody' });
    await playRound(desk, { drill: 'degrees', level: 2, mobile: false, wrongAt: [5, 9], label: 'desktop degrees' });
    if (!roundFilter) {
      // After passing level 3 the drill page offers level 4.
      await desk.goto('ear--intervals-up');
      const next = await desk.page.getAttribute('[data-ear-play-level]', 'data-ear-play-level');
      check('rounds', 'desktop: passing a level opens the next', next === '4', next);
    }
    const errs = desk.takeErrors();
    check('rounds', 'desktop: no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await desk.close();
  }
}

// ---------------------------------------------------------------------------------------------
// sound: what the engine sounded, through the pitch module
// ---------------------------------------------------------------------------------------------
/** Capture the engine's output while the app replays the question on screen, and analyse it. */
async function captureQuestion(page, { chord = false } = {}) {
  return page.evaluate(async ({ chord }) => {
    const audio = await import('/src/core/audio/index.ts');
    const pitch = await import('/src/core/pitch/index.ts');
    const engine = audio.getEngine();
    const ctx = audio.getAudioContext();
    const q = window.__ear.question;
    // Let the question's own first hearing ring out, so the capture holds only the replay.
    const first = [...window.__ear.plays].reverse().find((p) => p.label === 'question');
    if (first) while (ctx.currentTime < first.t0 + first.plan.length + 1.2) await new Promise((r) => setTimeout(r, 50));
    const recorder = await window.__audioTools.recorder(ctx, engine.output);
    const stop = recorder.capture();
    const before = window.__ear.played;
    document.querySelector('[data-ear-replay]').click();
    const t0 = Date.now();
    while (window.__ear.played <= before && Date.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 20));
    const play = window.__ear.plays[window.__ear.plays.length - 1];
    while (ctx.currentTime < play.t0 + play.plan.length + 0.4) await new Promise((r) => setTimeout(r, 50));
    const cap = stop();
    recorder.dispose();
    const fs = ctx.sampleRate;
    const zero = Math.round(play.t0 * fs) - cap.start; // sample index of the plan's zero
    const events = pitch.analyze(cap.samples, fs);
    const noteons = events.filter((e) => e.type === 'noteon').map((e) => ({ midi: e.midi, t: e.time - zero / fs, retrigger: !!e.retrigger })).filter((n) => n.t > -0.05);
    const readings = events.filter((e) => e.type === 'pitch').map((e) => ({ t: e.time - zero / fs, freq: e.freq, clarity: e.clarity }));
    let ranking = null;
    if (chord && q.kind === 'choice') {
      // Chroma of the strum, ranked against every option's own notes: the right chord must win.
      const from = Math.max(0, zero + Math.round(0.25 * fs));
      const frame = pitch.computeChroma(cap.samples.subarray(from, from + Math.round(0.5 * fs)), fs);
      const candidates = q.options.map((o) => {
        const midis = o.plan.events.flatMap((e) => e.midis);
        return { name: o.id, pcs: [...new Set(midis.map((m) => m % 12))], bass: Math.min(...midis) % 12 };
      });
      ranking = pitch.rankChords(frame, candidates).map((r) => r.name ?? r.chord?.name);
    }
    return { subject: q.subject, plan: q.plan, truth: q.truth, kind: q.kind, answer: q.answer, noteons, readings, ranking, gaps: cap.gaps, sampleRate: fs };
  }, { chord });
}

/** Median frequency of the readings between two times. */
function medianFreq(readings, from, to) {
  const xs = readings.filter((r) => r.t >= from && r.t < to && r.clarity > 0.8).map((r) => r.freq).sort((a, b) => a - b);
  return xs.length ? xs[Math.floor(xs.length / 2)] : NaN;
}

async function sound(browser, url) {
  const s = await open(browser, url, { mobile: false });
  const cases = [
    { hash: 'ear--pitch--3', name: 'higher or lower' },
    { hash: 'ear--intervals-up--8', name: 'interval going up (all twelve)' },
    { hash: 'ear--intervals-down--5', name: 'interval going down' },
    { hash: 'ear--compound--4', name: 'compound interval' },
    { hash: 'ear--scales--9', name: 'scale' },
    { hash: 'ear--melody--5', name: 'melody' },
    { hash: 'ear--tuning--3', name: 'tuning', tuning: true },
    { hash: 'ear--degrees--4', name: 'scale degree after a cadence', last: true },
    { hash: 'ear--chords--1', name: 'chord quality', chord: true },
  ];
  try {
    for (const c of cases) {
      let ok = false;
      let detail = '';
      // A capture disturbed by load (a dropped block) is tried once more before it counts.
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        await s.goto(c.hash);
        await s.page.locator('[data-ear-start]').click();
        await s.page.waitForSelector('[data-ear-phase="asking"]', { timeout: 30000 });
        await s.page.waitForFunction(() => window.__ear.plays.some((p) => p.label === 'question'), null, { timeout: 15000 });
        await s.page.waitForTimeout(400);
        if (c.tuning) {
          // Measure a detuned question: answer in-tune ones and move on until one is flat or sharp.
          for (let k = 0; k < 8 && Number((await currentQuestion(s.page)).truth.cents) === 0; k++) {
            const q = await currentQuestion(s.page);
            await s.page.locator(`[data-ear-answer="${q.answer}"]`).click();
            await s.page.locator('[data-ear-next]').click().catch(() => undefined);
            await s.page.waitForFunction((id) => window.__ear.question && window.__ear.question.id !== id && window.__ear.plays.some((p) => p.label === 'question' && JSON.stringify(p.plan) === JSON.stringify(window.__ear.question.plan)), q.id, { timeout: 15000 });
          }
        }
        const r = await captureQuestion(s.page, { chord: c.chord });
        const heard = r.noteons.map((n) => n.midi);
        if (c.chord) {
          ok = r.ranking && r.ranking[0] === r.answer;
          detail = `answer ${r.answer}, ranked ${JSON.stringify(r.ranking)}, notes ${JSON.stringify(r.subject)}`;
        } else if (c.last) {
          // After the cadence's chords, the last note detected is the question's note.
          ok = heard.length > 0 && heard[heard.length - 1] === r.subject[r.subject.length - 1];
          detail = `heard ${heard.join(' ')} expected last ${r.subject.at(-1)}`;
        } else {
          ok = JSON.stringify(heard) === JSON.stringify(r.subject);
          detail = `heard ${heard.join(' ')} expected ${r.subject.join(' ')} gaps ${r.gaps}`;
          if (ok && c.tuning) {
            const [a, b] = r.plan.events.map((e) => e.at);
            const f1 = medianFreq(r.readings, a + 0.15, b - 0.05);
            const f2 = medianFreq(r.readings, b + 0.15, b + 1.0);
            const cents = 1200 * Math.log2(f2 / f1);
            ok = Math.abs(cents - Number(r.truth.cents)) < 4;
            detail = `measured ${cents.toFixed(1)} cents, question says ${r.truth.cents}`;
          }
        }
        if (!ok && verbose) console.log(`        retry ${c.name}: ${detail}`);
      }
      check('sound', `${c.name}: what sounded is the question's notes`, ok, detail);
    }
    const errs = s.takeErrors();
    check('sound', 'no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await s.close();
  }
  // A progression with the backing band chosen: the band plays it (and something comes out).
  const b = await open(browser, url, { mobile: false, seed: { 'ssa:ear.settings': JSON.stringify({ progressionSound: 'band' }) } });
  try {
    await b.goto('ear--progressions--1');
    await b.page.locator('[data-ear-start]').click();
    const res = await b.page.evaluate(async () => {
      const audio = await import('/src/core/audio/index.ts');
      const t0 = Date.now();
      while (!window.__ear.plays.some((p) => p.band && p.label === 'question') && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 50));
      const played = window.__ear.plays.some((p) => p.band && p.label === 'question');
      let rms = 0;
      for (let i = 0; i < 60; i++) {
        rms = Math.max(rms, audio.getOutputLevel().rms);
        await new Promise((r) => setTimeout(r, 50));
      }
      return { played, rms };
    });
    check('sound', 'progressions: the backing band plays the question when chosen', res.played && res.rms > 0.01, JSON.stringify(res));
    const errs = b.takeErrors();
    check('sound', 'band: no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await b.close();
  }
}

// ---------------------------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------------------------
async function layout(browser, url) {
  const phone = await open(browser, url, { mobile: true });
  try {
    for (const hash of ['ear--intervals-up--8', 'ear--pitch--2']) {
      await phone.goto(hash);
      await phone.page.locator('[data-ear-start]').click();
      await phone.page.waitForSelector('[data-ear-pad]', { timeout: 30000 });
      await phone.page.waitForTimeout(400);
      const box = await phone.page.locator('[data-ear-pad]').boundingBox();
      const vh = VIEWPORTS.mobile.height;
      check('layout', `phone ${hash}: answers sit in the lower half`, box.y > vh * 0.45 && box.y + box.height <= vh + 1, `${Math.round(box.y)}..${Math.round(box.y + box.height)} of ${vh}`);
      const heights = await phone.page.locator('[data-ear-answer]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      check('layout', `phone ${hash}: every answer is at least 44 px tall`, Math.min(...heights) >= 44, Math.min(...heights));
      const hint = await phone.page.locator('kbd').first().isVisible().catch(() => false);
      check('layout', `phone ${hash}: no keyboard hints on a touch screen`, !hint);
      check('layout', `phone ${hash}: no sideways scroll`, (await noSideways(phone.page)) <= 1);
      await phone.shot(`${hash}-asking-phone`);
    }
  } finally {
    await phone.close();
  }
  const sideways = await open(browser, url, { mobile: true, viewport: { width: 844, height: 390 } });
  try {
    await sideways.goto('ear--pitch--2');
    await sideways.page.locator('[data-ear-start]').click();
    await sideways.page.waitForSelector('[data-ear-pad]', { timeout: 30000 });
    await sideways.page.waitForTimeout(400);
    const pad = await sideways.page.locator('[data-ear-pad]').boundingBox();
    const play = await sideways.page.locator('[data-ear-replay]').boundingBox();
    check('layout', 'phone sideways: answers beside the replay control, both on screen', pad.x > play.x + play.width && pad.y + pad.height <= 390 + 1 && play.y + play.height <= 390 + 1, JSON.stringify({ pad, play }));
    check('layout', 'phone sideways: no sideways scroll', (await noSideways(sideways.page)) <= 1);
    await sideways.shot('asking-sideways');
  } finally {
    await sideways.close();
  }
  const desk = await open(browser, url, { mobile: false, theme: 'light' });
  try {
    await desk.goto('ear--chords--7');
    await desk.page.locator('[data-ear-start]').click();
    await desk.page.waitForSelector('[data-ear-pad]', { timeout: 30000 });
    await desk.page.waitForTimeout(400);
    const hint = await desk.page.locator('kbd').first().isVisible();
    check('layout', 'desktop: keyboard hints are shown', hint);
    const pad = await desk.page.locator('[data-ear-pad]').boundingBox();
    const play = await desk.page.locator('[data-ear-replay]').boundingBox();
    check('layout', 'desktop: two panes, answers beside the listening area', pad.x > play.x + play.width, JSON.stringify({ pad: Math.round(pad.x), play: Math.round(play.x) }));
    await desk.shot('asking-desktop-light');
  } finally {
    await desk.close();
  }
}

// ---------------------------------------------------------------------------------------------
// status: sound off
// ---------------------------------------------------------------------------------------------
async function status(browser, url) {
  const s = await open(browser, url, { mobile: true });
  try {
    await s.goto('ear--pitch--1');
    await s.page.evaluate(async () => (await import('/src/core/progress/index.ts')).setPrefs({ sound: { volume: 0 } }));
    await s.page.locator('[data-ear-start]').click();
    const banner = await s.page.waitForSelector('[data-ear-fix-sound]', { timeout: 10000 }).then(() => true).catch(() => false);
    check('status', 'volume at zero: the round says the sound is off', banner && (await s.page.getByText('Your sound is off').count()) > 0);
    await s.shot('sound-off-phone');
    if (banner) await s.page.locator('[data-ear-fix-sound]').click();
    await s.page.waitForTimeout(1200);
    const vol = await s.page.evaluate(async () => (await import('/src/core/progress/index.ts')).getProgress().prefs.sound.volume);
    const gone = (await s.page.locator('[data-ear-fix-sound]').count()) === 0;
    check('status', 'one tap turns it back on', vol > 0 && gone, `volume ${vol}`);
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------------------------------------
// review: cases an independent review caught
// ---------------------------------------------------------------------------------------------
/** Every answer label inside its button, on one line when it is a single word. */
async function labelsWhole(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const btn of document.querySelectorAll('[data-ear-answer]')) {
      const label = btn.querySelector('span:not([aria-hidden])') || btn;
      const b = btn.getBoundingClientRect();
      const l = label.getBoundingClientRect();
      const text = label.textContent.trim();
      if (l.left < b.left - 0.5 || l.right > b.right + 0.5) bad.push(`${text} runs out of its button`);
      const range = document.createRange();
      range.selectNodeContents(label);
      const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
      if (!/\s/.test(text) && lines.size > 1) bad.push(`${text} breaks inside the word`);
    }
    return bad;
  });
}

/** Skill record of a level, from the live store. */
async function levelSkill(page, drill, level) {
  return page.evaluate(async ([d, l]) => {
    const p = await import('/src/core/progress/index.ts');
    const s = p.getProgress().skills[`ear:${d}:${l}`];
    return s ? { attempts: s.attempts, completions: s.completions } : null;
  }, [drill, level]);
}

/** Answer the question on screen correctly with the keyboard and wait for the next one. */
async function answerRight(page) {
  const q = await currentQuestion(page);
  await page.keyboard.press(KEYS[q.options.findIndex((o) => o.id === q.answer)]);
  await page.waitForFunction((id) => window.__ear.question && window.__ear.question.id !== id, q.id, { timeout: 20000 });
}

async function review(browser, url) {
  const phone = await open(browser, url, { mobile: true, viewport: { width: 360, height: 780 } });
  try {
    await phone.goto('ear--pitch--1');
    await phone.page.waitForSelector('[data-ear-intro]', { timeout: 30000 });
    const sub = await phone.page.locator('main header, main [data-ui-page]').first().innerText();
    check('review', 'intro: level 1 asks its own question (same or different), not "higher or lower"', /same note twice/i.test(sub) && !/higher or lower\?/i.test(sub), sub.slice(0, 160));
    for (const hash of ['ear--scales--5', 'ear--progressions--2', 'ear--progressions--3', 'ear--chords--10']) {
      await phone.goto(hash);
      await phone.page.locator('[data-ear-start]').click();
      await phone.page.waitForSelector('[data-ear-pad]', { timeout: 30000 });
      await phone.page.waitForTimeout(300);
      const bad = await labelsWhole(phone.page);
      check('review', `360 px ${hash}: every answer label whole and inside its button`, bad.length === 0, bad.join('; '));
      check('review', `360 px ${hash}: no sideways scroll`, (await noSideways(phone.page)) <= 1);
      await phone.shot(`review-${hash}-360`);
    }
    // 200 % text: the learner's own text size (the pad works in rem).
    await phone.goto('ear--scales--5');
    await phone.page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await phone.page.locator('[data-ear-start]').click();
    await phone.page.waitForSelector('[data-ear-pad]', { timeout: 30000 });
    await phone.page.waitForTimeout(300);
    const big = await labelsWhole(phone.page);
    check('review', '200 % text: scale names stay whole (one column instead of syllables)', big.length === 0, big.join('; '));
    check('review', '200 % text: no sideways scroll', (await noSideways(phone.page)) <= 1);
    await phone.shot('review-text200');
    await phone.page.evaluate(() => (document.documentElement.style.fontSize = ''));
    const errs = phone.takeErrors();
    check('review', 'phone: no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await phone.close();
  }

  const sideways = await open(browser, url, { mobile: true, viewport: { width: 667, height: 375 } });
  try {
    await sideways.goto('ear--intervals-up--8');
    await sideways.page.locator('[data-ear-start]').click();
    await sideways.page.waitForSelector('[data-ear-pad]', { timeout: 30000 });
    await sideways.page.waitForTimeout(400);
    const boxes = await sideways.page.locator('[data-ear-answer]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
    check('review', 'small phone held sideways: all twelve intervals on screen', boxes.length === 12 && Math.max(...boxes) <= 375 + 1, `lowest answer ends at ${Math.round(Math.max(...boxes))} of 375`);
    await sideways.shot('review-sideways-12');
  } finally {
    await sideways.close();
  }

  const desk = await open(browser, url, { mobile: false });
  try {
    // Escape leaves a round; what was answered is kept as a round left early, with no score shown.
    await desk.goto('ear--intervals-up--1');
    await desk.page.locator('[data-ear-start]').click();
    await desk.page.waitForFunction(() => window.__ear.question, null, { timeout: 20000 });
    for (let i = 0; i < 3; i++) await answerRight(desk.page);
    await clearToasts(desk.page);
    await desk.page.keyboard.press('Escape');
    await desk.page.waitForSelector('[data-ear-play-level]', { timeout: 20000 }).catch(() => null);
    check('review', 'Escape leaves the round for the drill page', desk.page.url().endsWith('#ear--intervals-up'), desk.page.url());
    const left = await levelSkill(desk.page, 'intervals-up', 1);
    check('review', 'a round left early is recorded (an attempt, not a completion)', left && left.attempts === 1 && left.completions === 0, JSON.stringify(left));
    const row = await desk.page.locator('[data-ear-level="1"]').innerText();
    check('review', 'and its level shows no "Best 0 %"', !/Best 0\s*%/.test(row), row.replace(/\s+/g, ' '));
    const intro = await (async () => {
      await desk.goto('ear--intervals-up--1');
      return desk.page.locator('[data-ear-intro]').innerText();
    })();
    check('review', 'nor does its intro', !/Best 0\s*%/.test(intro) && /New level/.test(intro), intro.replace(/\s+/g, ' ').slice(0, 200));

    // A reload mid-round picks the round up where it was (pass 2: it used to end the round).
    await desk.goto('ear--intervals-down--1');
    await desk.page.locator('[data-ear-start]').click();
    await desk.page.waitForFunction(() => window.__ear.question, null, { timeout: 20000 });
    for (let i = 0; i < 3; i++) await answerRight(desk.page);
    const before = await currentQuestion(desk.page);
    await desk.page.reload({ waitUntil: 'load' });
    await desk.page.waitForSelector('main[data-route="ear"] [data-ui-page]', { timeout: 60000 });
    await desk.page.evaluate(async () => {
      window.__ear = (await import('/src/features/ear/engine/debug.ts')).earDebug;
    });
    await desk.page.waitForSelector('[data-ear-phase]', { timeout: 20000 });
    const same = await desk.page.getAttribute('[data-ear-phase]', 'data-ear-question');
    const count = (await desk.page.locator('[aria-label^="Question "]').first().innerText()).trim();
    const notice = await desk.page.locator('[data-ear-resumed]').count();
    check('review', 'a reload mid-round comes back to the same question, 4 of 10, and says so', same === before.id && count === '4/10' && notice === 1, `${same} vs ${before.id}, ${count}, notice ${notice}`);
    const midway = await levelSkill(desk.page, 'intervals-down', 1);
    check('review', '...and nothing is recorded twice: the round is not over', midway === null || (midway.attempts === 0 && midway.completions === 0), JSON.stringify(midway));
    // Hear it again (one tap), then finish the round: one completed round with all ten answers.
    await desk.page.locator('[data-ear-replay]').click();
    const heard = await desk.page.waitForFunction(() => window.__ear.plays.some((p) => p.label === 'question:normal'), null, { timeout: 20000 }).then(() => true).catch(() => false);
    const labels = await desk.page.evaluate(() => window.__ear.plays.map((p) => p.label).join(','));
    check('review', 'one tap on Play again plays the resumed question', heard, labels);
    await desk.page.waitForFunction(() => window.__ear.question, null, { timeout: 20000 });
    for (let i = 3; i < 10; i++) {
      const q = await currentQuestion(desk.page);
      await desk.page.keyboard.press(KEYS[q.options.findIndex((o) => o.id === q.answer)]);
      if (i < 9) await desk.page.waitForFunction((id) => window.__ear.question && window.__ear.question.id !== id, q.id, { timeout: 20000 });
    }
    await desk.page.waitForSelector('[data-ear-next]', { timeout: 20000 });
    await desk.page.keyboard.press('Enter');
    await desk.page.waitForSelector('[data-ear-summary]', { timeout: 20000 });
    const summary = await desk.page.locator('[data-ear-summary]').innerText();
    const done = await levelSkill(desk.page, 'intervals-down', 1);
    check('review', 'the resumed round finishes with all ten answers and is recorded once', /10 of 10 right/.test(summary) && done && done.attempts === 1 && done.completions === 1, `${summary.replace(/\s+/g, ' ').slice(0, 120)} ${JSON.stringify(done)}`);
    const leftover = await desk.page.evaluate(async () => (await import('/src/core/platform/index.ts')).readJSON('ear.round', null));
    check('review', '...and leaves nothing to pick up', leftover === null, JSON.stringify(leftover).slice(0, 80));
    const errs = desk.takeErrors();
    check('review', 'desktop: no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await desk.close();
  }
}

// ---------------------------------------------------------------------------------------------
// pass2: dictation on the neck, bass lines, modes over a drone, a catalog progression by its
// link, the chord-shape explanation
// ---------------------------------------------------------------------------------------------
const OPEN_STRINGS = [64, 59, 55, 50, 45, 40];
/** A place on the neck for a pitch inside frets [lo, hi]: the lowest fret. */
function placeOf(midi, lo, hi) {
  let best = null;
  for (let string = 6; string >= 1; string--) {
    const fret = midi - OPEN_STRINGS[string - 1];
    if (fret >= lo && fret <= hi && (!best || fret < best.fret)) best = { string, fret };
  }
  return best;
}

async function tapNeck(page, q, ids) {
  const [lo, hi] = q.neck.frets;
  for (const id of ids) {
    const key = q.keys.find((k) => k.id === id);
    const at = placeOf(key.midi, lo, hi);
    await page.getByRole('button', { name: at.fret === 0 ? `string ${at.string}, open` : `string ${at.string}, fret ${at.fret}`, exact: true }).click();
    await page.waitForTimeout(120);
  }
}

async function pass2(browser, url) {
  const phone = await open(browser, url, { mobile: true });
  try {
    // Melodic dictation: tap the phrase on the neck.
    await phone.goto('ear--dictation--2');
    await clearToasts(phone.page);
    await phone.page.locator('[data-ear-start]').click();
    await phone.page.waitForSelector('[data-ear-neck]', { timeout: 30000 });
    await phone.page.waitForFunction(() => window.__ear.plays.some((p) => p.label === 'question'), null, { timeout: 20000 });
    let q = await currentQuestion(phone.page);
    check('pass2', 'dictation: the phrase plays and is answered on a neck (frets 0 to 5)', q.input === 'neck' && q.neck.frets.join() === '0,5', JSON.stringify(q.neck));
    check('pass2', 'dictation: every cell has a position name, not a note name (no give-away)', (await phone.page.getByRole('button', { name: 'string 6, open', exact: true }).count()) === 1 && (await phone.page.getByRole('button', { name: 'string 6, fret 3', exact: true }).count()) === 1);
    await tapNeck(phone.page, q, q.target.slice(q.given));
    await phone.page.waitForSelector('[data-ear-status="right"]', { timeout: 10000 }).catch(() => null);
    check('pass2', 'dictation: the right notes, tapped in order, are right', (await phone.page.getAttribute('[data-ear-status]', 'data-ear-status')) === 'right');
    await phone.shot('dictation-right-phone');
    await phone.page.waitForFunction((id) => window.__ear.question && window.__ear.question.id !== id, q.id, { timeout: 20000 });
    q = await currentQuestion(phone.page);
    // The second note an octave too high: wrong, and its right place is shown.
    const wrong = q.target.slice(q.given).map((id, i) => (i === 0 ? q.keys.find((k) => k.midi === q.keys.find((x) => x.id === id).midi + 12)?.id ?? q.keys.find((k) => k.midi === q.keys.find((x) => x.id === id).midi - 12).id : id));
    await tapNeck(phone.page, q, wrong);
    await phone.page.waitForSelector('[data-ear-status="wrong"]', { timeout: 10000 }).catch(() => null);
    check('pass2', 'dictation: a note an octave off is wrong', (await phone.page.getAttribute('[data-ear-status]', 'data-ear-status')) === 'wrong');
    // (The board's own description lists its marks: the missed second note is shown where it is.)
    const board = (await phone.page.locator('[data-ear-neck] svg desc').allTextContents().catch(() => [])).join(' ');
    await phone.shot('dictation-wrong-phone');
    check('pass2', 'dictation: the board shows where the missed note is', /note 2 is here/.test(board), board.slice(0, 300));
    check('pass2', 'dictation: no sideways scroll at phone width', (await noSideways(phone.page)) <= 1);

    // Bass lines: played on the bass, an octave and more below the guitar drills.
    await phone.goto('ear--bass--1');
    await clearToasts(phone.page);
    const seen = await phone.page.evaluate(() => window.__ear.played);
    await phone.page.locator('[data-ear-start]').click();
    await phone.page.waitForFunction((n) => window.__ear.plays.some((p) => p.label === 'question' && p.seq > n), seen, { timeout: 30000 });
    const played = await phone.page.evaluate(() => JSON.parse(JSON.stringify(window.__ear.plays.filter((p) => p.label === 'question').pop().plan)));
    q = await currentQuestion(phone.page);
    check('pass2', 'bass: every note of the question is played on the bass, below A3', played.events.every((e) => e.tone === 'bass-finger') && Math.max(...played.events.flatMap((e) => e.midis)) <= 57, JSON.stringify(played.events.map((e) => [e.midis[0], e.tone])));
    for (const id of q.target.slice(q.given)) await phone.page.locator(`[data-ear-key="${id}"]`).click();
    await phone.page.waitForSelector('[data-ear-status="right"]', { timeout: 10000 }).catch(() => null);
    check('pass2', 'bass: the line tapped on the row is right', (await phone.page.getAttribute('[data-ear-status]', 'data-ear-status')) === 'right');
    await phone.shot('bass-phone');
    const errs = phone.takeErrors();
    check('pass2', 'phone: no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await phone.close();
  }

  const desk = await open(browser, url, { mobile: false });
  try {
    // Modes over a drone: the drone is scheduled with the phrase.
    await desk.goto('ear--modes--2');
    await clearToasts(desk.page);
    const before = await desk.page.evaluate(() => window.__ear.played);
    await desk.page.locator('[data-ear-start]').click();
    await desk.page.waitForFunction((n) => window.__ear.plays.some((p) => p.label === 'question' && p.seq > n), before, { timeout: 30000 });
    let q = await currentQuestion(desk.page);
    const plan = await desk.page.evaluate(() => JSON.parse(JSON.stringify(window.__ear.plays.filter((p) => p.label === 'question').pop().plan)));
    check('pass2', 'modes: a drone an octave under the tonic sounds from before the phrase to its end', plan.drone && plan.drone.midi === q.truth.tonic - 12 && plan.drone.from === 0 && Math.abs(plan.drone.to - plan.length) < 1e-6 && Math.min(...plan.events.map((e) => e.at)) >= 1, JSON.stringify(plan.drone));
    check('pass2', 'modes: Dorian or Aeolian are the choices', q.options.map((o) => o.label).join(',') === 'Aeolian,Dorian', q.options.map((o) => o.label).join(','));
    // Wrong on purpose: the feedback names the note to listen for.
    await desk.page.keyboard.press(KEYS[q.options.findIndex((o) => o.id !== q.answer)]);
    await desk.page.waitForSelector('[data-ear-status="wrong"]', { timeout: 10000 });
    const hint = await desk.page.locator('[data-ear-mode-hint]').innerText().catch(() => '');
    check('pass2', 'modes: a wrong answer names the note that tells them apart', /6 where .* has ♭6|♭6 where .* has 6/.test(hint), hint);
    await desk.shot('modes-wrong-desktop');
    await desk.page.keyboard.press('Escape');

    // A progression of the catalog by its link, and back to its page.
    await desk.goto('ear--progression--pop-axis');
    const title = await desk.page.locator('main h1').first().innerText();
    check('pass2', 'catalog link: #ear--progression--pop-axis opens a round for that progression', /axis/i.test(title), title);
    const intro = await desk.page.locator('[data-ear-new-level]').innerText().catch(() => '');
    check('pass2', 'catalog link: its intro promises no next level to open (there is none)', /you know it by ear/.test(intro) && !/next one/.test(intro), intro);
    await desk.page.locator('[data-ear-start]').click();
    await desk.page.waitForFunction(() => window.__ear.question, null, { timeout: 30000 });
    q = await currentQuestion(desk.page);
    check('pass2', 'catalog link: the progression is one of the choices, with look-alikes', q.options[0].id === 'pop-axis' && q.options.length >= 2, q.options.map((o) => o.id).join(','));
    await desk.shot('catalog-round-desktop');
    await answerRight(desk.page).catch(() => null);
    await clearToasts(desk.page);
    await desk.page.keyboard.press('Escape');
    await desk.page.waitForFunction(() => location.hash.startsWith('#progressions'), null, { timeout: 20000 }).catch(() => null);
    check('pass2', 'catalog link: leaving goes back to the progression\'s page', desk.page.url().endsWith('#progressions--pop-axis'), desk.page.url());
    // A whole catalog round, every answer wrong: recorded as its own skill, its confusions kept in a
    // record of their own. (They used to land in the progressions drill's record, and its page and
    // the hub then said "you often hear pop-vi-iv-i-v as pop-axis".)
    // Straight back to it: a fresh start (the screen left is kept, hidden, while the progression page
    // loads, and used to come back as the old round with nothing behind it: answers did nothing).
    await desk.goto('ear--progression--pop-axis');
    const fresh = await desk.page.waitForSelector('[data-ear-start]', { timeout: 30000 }).then(() => true).catch(() => false);
    check('pass2', 'catalog link: coming straight back after leaving starts afresh (found in review)', fresh, (await desk.page.locator('main').innerText()).slice(0, 160).replace(/\s+/g, ' '));
    await clearToasts(desk.page);
    await desk.page.locator('[data-ear-start]').click();
    for (let i = 0; i < 6; i++) {
      await desk.page.waitForFunction((n) => window.__ear.question && window.__ear.question.index === n && document.querySelector('[data-ear-phase="asking"]'), i, { timeout: 30000 });
      const cur = await currentQuestion(desk.page);
      await desk.page.keyboard.press(KEYS[cur.options.findIndex((o) => o.id !== cur.answer)]);
      await desk.page.waitForSelector('[data-ear-phase="answered"]', { timeout: 10000 });
      await desk.page.waitForTimeout(150);
      await desk.page.keyboard.press('Enter');
    }
    const ended = await desk.page.waitForFunction(() => /round complete/i.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 20000 }).then(() => true).catch(() => false);
    const rec = await desk.page.evaluate(async () => {
      const p = await import('/src/core/progress/index.ts');
      const skills = p.getProgress().skills;
      const own = skills['ear:progression:pop-axis'];
      return { own: own ? { attempts: own.attempts, completions: own.completions } : null, catalog: Object.keys(skills['ear:progression']?.data?.mix ?? {}), drill: Object.keys(skills['ear:progressions']?.data?.items ?? {}) };
    });
    check('pass2', 'catalog link: a whole round is its own skill (no level of the progressions drill)', ended && rec.own && rec.own.attempts === 1 && rec.own.completions === 1 && !(await levelSkill(desk.page, 'progressions', 1)), JSON.stringify(rec));
    check('pass2', 'catalog link: its confusions are kept apart from the progressions drill (found in review)', rec.catalog.length > 0 && rec.drill.every((id) => !/^pop-|-progression/.test(id)), JSON.stringify(rec));
    await desk.goto('ear--progressions');
    const drillText = await desk.page.locator('main').innerText();
    await desk.goto('ear');
    const hubText = await desk.page.locator('main').innerText();
    check('pass2', 'catalog link: no catalog id shows up as a weak spot on the drill page or the hub', !/often hear[^\n]*pop-/.test(drillText + hubText), (drillText + hubText).match(/often hear[^\n]*/g)?.join(' | ') ?? 'none');
    await desk.goto('ear--progression--no-such-thing');
    await desk.page.waitForFunction(() => location.hash === '#ear--progressions', null, { timeout: 20000 }).catch(() => null);
    check('pass2', 'catalog link: an unknown id lands on the progressions drill', desk.page.url().endsWith('#ear--progressions'), desk.page.url());

    // A reload on the feedback of the last question (answered wrong, waiting for Next) used to lose
    // the whole round: nothing was recorded and it was not picked up again.
    await desk.goto('ear--pitch--1');
    await clearToasts(desk.page);
    await desk.page.locator('[data-ear-start]').click();
    const total = await desk.page.evaluate(async () => {
      for (let i = 0; i < 100 && !(await import('/src/core/platform/index.ts')).readJSON('ear.round', null); i++) await new Promise((r) => setTimeout(r, 50));
      return (await import('/src/core/platform/index.ts')).readJSON('ear.round', null)?.total ?? 0;
    });
    for (let i = 0; i < total; i++) {
      await desk.page.waitForFunction((n) => window.__ear.question && window.__ear.question.index === n && document.querySelector('[data-ear-phase="asking"]'), i, { timeout: 30000 });
      const cur = await currentQuestion(desk.page);
      const last = i === total - 1;
      await desk.page.keyboard.press(KEYS[cur.options.findIndex((o) => (last ? o.id !== cur.answer : o.id === cur.answer))]);
      await desk.page.waitForSelector('[data-ear-phase="answered"]', { timeout: 10000 });
      if (!last) {
        await desk.page.waitForTimeout(150);
        await desk.page.keyboard.press('Enter');
      }
    }
    await desk.page.waitForTimeout(300);
    await desk.page.reload({ waitUntil: 'load' });
    await desk.page.waitForSelector('main[data-route="ear"] [data-ui-page]', { timeout: 60000 });
    const back = await desk.page.waitForSelector('[data-ear-status="wrong"]', { timeout: 15000 }).then(() => true).catch(() => false);
    check('pass2', 'a reload on the last answer comes back to it (it used to drop the round)', back, await desk.page.locator('main').innerText().then((t) => t.slice(0, 120)).catch(() => ''));
    await clearToasts(desk.page);
    await desk.page.keyboard.press('Enter');
    const done = await desk.page.waitForFunction(() => /round complete/i.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 15000 }).then(() => true).catch(() => false);
    const lastSkill = await levelSkill(desk.page, 'pitch', 1);
    const leftover = await desk.page.evaluate(async () => (await import('/src/core/platform/index.ts')).readJSON('ear.round', null));
    check('pass2', 'and Next ends it: recorded once as a finished round, nothing left to resume', done && lastSkill && lastSkill.attempts === 1 && lastSkill.completions === 1 && leftover === null, `${done} ${JSON.stringify(lastSkill)} ${JSON.stringify(leftover)}`);

    // The chord shape in the feedback explains itself.
    await desk.goto('ear--chords--1');
    await clearToasts(desk.page);
    await desk.page.locator('[data-ear-start]').click();
    await desk.page.waitForFunction(() => window.__ear.question, null, { timeout: 30000 });
    let shown = false;
    for (let i = 0; i < 6 && !shown; i++) {
      q = await currentQuestion(desk.page);
      if (q.truth.frets) {
        await desk.page.keyboard.press(KEYS[q.options.findIndex((o) => o.id !== q.answer)]);
        await desk.page.waitForSelector('[data-ear-shape]', { timeout: 10000 });
        await desk.page.locator('[data-ear-shape]').click();
        shown = await desk.page.waitForSelector('[data-ear-shape-help]', { timeout: 5000 }).then(() => true).catch(() => false);
        const text = shown ? await desk.page.locator('[data-ear-shape-help]').innerText() : '';
        check('pass2', 'chords: the shape in the feedback opens an explanation with its chord box', shown && /thick low E/.test(text) && /open string/.test(text) && (await desk.page.locator('[data-ear-shape-help] svg').count()) > 0, text.slice(0, 160));
        await desk.shot('chord-shape-help-desktop');
        await desk.page.keyboard.press('Escape');
      } else {
        await answerRight(desk.page);
      }
    }
    check('pass2', 'chords: a question with a library shape came up', shown);
    const errs = desk.takeErrors();
    check('pass2', 'desktop: no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await desk.close();
  }
}

// ---------------------------------------------------------------------------------------------
// mic: play the melody back on the guitar (a fake microphone plays D4 then E4)
// ---------------------------------------------------------------------------------------------
async function mic() {
  const audio = await loadTs('/src/core/audio/index.ts');
  const sr = 48000;
  // Three seconds of quiet (the app's own question plays then), then 2 and 3 of C major on the guitar.
  const samples = audio.renderSequence([{ time: 3.0, midi: 62, string: 2 }, { time: 3.8, midi: 64, string: 1 }], { sampleRate: sr, seconds: 6 });
  const wav = path.join(os.tmpdir(), `ssa-ear-melody-${process.pid}.wav`);
  fs.writeFileSync(wav, audio.encodeWav(samples, sr, { bitDepth: 16 }));
  try {
    await withApp({ fakeAudio: `${wav}%noloop` }, async ({ browser, url }) => {
      const s = await open(browser, url, { mobile: true, seed: { 'ssa:ear.settings': JSON.stringify({ root: 'fixed', fixedRoot: 0 }) } });
      await s.context.grantPermissions(['microphone']);
      try {
        await s.goto('ear--melody--1');
        await s.page.locator('[data-ear-start]').click();
        await s.page.waitForFunction(() => window.__ear.plays.some((p) => p.label === 'question'), null, { timeout: 20000 });
        await s.page.waitForTimeout(2500);
        const q = await currentQuestion(s.page);
        await s.page.locator('[data-ear-mic]').click();
        const on = await s.page.getByText('Listening to your guitar').waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
        check('mic', 'the microphone starts from "Play it on my guitar"', on);
        const done = await s.page.waitForSelector('[data-ear-status="right"], [data-ear-status="wrong"]', { timeout: 20000 }).then(() => true).catch(() => false);
        const slots = await s.page.locator('[data-ear-slots] [role="listitem"]').evaluateAll((els) => els.map((e) => e.textContent.trim().slice(0, 1)));
        check('mic', 'notes played on the guitar fill the melody, in order', done && slots.join(' ') === '1 2 3', slots.join(' '));
        const status = await s.page.getAttribute('[data-ear-status]', 'data-ear-status');
        const expected = q.target.join(' ') === '1 2 3' ? 'right' : 'wrong';
        check('mic', 'and are marked against the melody', status === expected, `${status}, melody ${q.target.join(' ')}`);
        await s.shot('mic-phone');
        const errs = s.takeErrors();
        check('mic', 'no console errors', errs.length === 0, errs.join(' | '));
      } finally {
        await s.close();
      }
    });
  } finally {
    fs.rmSync(wav, { force: true });
  }
}

withApp({}, async ({ browser, url }) => {
  const groups = [
    ['screens', screens],
    ['rounds', rounds],
    ['sound', sound],
    ['layout', layout],
    ['status', status],
    ['review', review],
    ['pass2', pass2],
  ];
  for (const [name, fn] of groups) {
    if (!wants(name)) continue;
    const t = Date.now();
    try {
      await fn(browser, url);
    } catch (e) {
      check(name, 'ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e);
    }
    const mine = results.filter((r) => r.group === name);
    console.log(`${mine.every((r) => r.pass) ? 'ok  ' : 'FAIL'}  ${name}: ${mine.filter((r) => r.pass).length}/${mine.length} checks (${Math.round((Date.now() - t) / 1000)} s)`);
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
    const failed = results.filter((r) => !r.pass);
    console.log(failed.length ? `FAILED (${failed.length} of ${results.length} checks)` : `PASSED (${results.length} checks)`);
    process.exit(failed.length ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    console.log('FAILED');
    process.exit(1);
  });
