#!/usr/bin/env node
/**
 * Browser check of the Scale Arcade (#arcade). Run: node e2e/arcade.cjs [--verbose] [--skip-mic] [--skip-shots] [--only taps,nomic,shots,mic]
 *
 * What it does, in real Chromium through e2e/lib/harness.cjs:
 *
 *  taps        on a phone (390 x 844, touch), one round of every game is played to its summary
 *              by tapping: Note Hunt, Shape Builder, Run the Scale (taps timed against the audio
 *              clock), Degree Darts, Mode Match, Lick Echo, Fretboard Sprint. Each summary must
 *              show stars, the round must reach core/progress (skill scale:<scale>:<shape>,
 *              count.scale-game) and the arcade's own records (level stars, best score, level 2
 *              opened). Then today's challenge is played through (three games, one summary).
 *  no mic      the host refuses the microphone (an artifact viewer is emulated): choosing "Play my
 *              guitar" shows the kit's MediaBlocked panel once, "Tap the notes instead" switches
 *              to taps and the round plays; the next round falls back to taps without the panel.
 *  fake mic    a recording made with the app's own guitar (core/audio renderSequence) is played as
 *              the microphone:
 *                Note Hunt: three right notes quickly, a wrong note, the right one, two slow
 *                ones, then four quick ones; the round's per-note verdicts must read
 *                fast fast fast / retry / slow slow / fast …, and the summary 90 %.
 *                Run the Scale: the start note, then six notes on the beat, a wrong note in
 *                place of the seventh, and five notes 200 ms late; the strip must read
 *                on-time ×6, missed, late ×5.
 *  shots       every game in play, the hub and a game screen, phone in both themes and desktop
 *              (dark, light), written to e2e/out/arcade-*.png for a person to look at.
 *
 * Prints one line per check, then PASSED or FAILED; exits non-zero on failure. A step that fails
 * on a busy machine is tried once more (see "The build machine is shared" in CLAUDE.md).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withApp, loadTs, ROOT, VIEWPORTS } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const skipMic = argv.includes('--skip-mic');
const skipShots = argv.includes('--skip-shots');
// --only taps,nomic,shots,mic runs just those parts (for working on one of them).
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const want = (part) => !only || only.includes(part);
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });

const SEED = 20261115;
const FOCUS = 'a-minor-pentatonic--box-1';
const SEEDED = { 'ssa:shell.onboarding': '{"skipped":true}', 'ssa:arcade.test-seed': String(SEED) };

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}

const label = (key) => {
  const [s, f] = key.split(':');
  return f === '0' ? `string ${s}, open` : `string ${s}, fret ${f}`;
};
const cell = (page, key) => page.locator(`[data-arcade-round] button[aria-label="${label(key)}"]`).first();
const attr = (page, name) => page.getAttribute('[data-arcade-round]', `data-arcade-${name}`).catch(() => null);

/** A fresh context shaped like the harness's, seeded, with optional extra init script. */
async function openContext(browser, { mobile = true, theme = 'dark', viewport, init, fake = false } = {}) {
  const vp = viewport || VIEWPORTS[mobile ? 'mobile' : 'desktop'];
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: theme, hasTouch: mobile, isMobile: mobile, permissions: fake ? ['microphone'] : [] });
  await context.addInitScript((entries) => {
    try {
      for (const [k, v] of Object.entries(entries)) if (localStorage.getItem(k) === null || k.endsWith('test-seed')) localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  }, SEEDED);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|React DevTools/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return { context, page, errors };
}

async function open(page, url, ...parts) {
  await page.goto(`${url}#${parts.join('--')}`, { waitUntil: 'load' });
  await page.waitForSelector('main[data-route]', { timeout: 30000 });
  await page.waitForTimeout(300);
  await dismissShell(page);
}

/** Close the shell's own dialogs (a new level, an achievement) the way a learner would: with their button. */
async function dismissShell(page) {
  for (let i = 0; i < 4; i++) {
    const dialog = page.locator('[role="dialog"][aria-modal="true"]').last();
    if (!(await dialog.count())) return;
    const close = dialog.getByRole('button', { name: /^(Close|Keep going|Continue|Got it|Nice|OK)/i }).first();
    if (await close.count()) await close.click().catch(() => {});
    else await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** Start the round from its ready card (tap input unless told otherwise). */
async function startRound(page, { mic = false } = {}) {
  await page.waitForSelector('[data-arcade-ready]', { timeout: 30000 }).catch(async (e) => {
    await page.screenshot({ path: path.join(OUT, 'arcade-debug-noready.png') });
    console.log('  no ready card at', await page.evaluate(() => `${location.hash} :: ${document.querySelector('main')?.innerText.slice(0, 300).replace(/\s+/g, ' ')}`));
    throw e;
  });
  await page.waitForTimeout(250);
  await dismissShell(page);
  const choice = page.getByRole('radio', { name: mic ? /Play my guitar/ : /Tap the screen/ });
  if (await choice.count()) await choice.first().click();
  await page.click('[data-arcade-go]');
}

async function waitPlay(page) {
  await page.waitForSelector('[data-arcade-phase="play"]', { timeout: 20000 });
}

const summaryVisible = (page) => page.locator('[data-arcade-summary], [data-arcade-between], [data-arcade-daily-summary]').count();

/** Play whatever game is on screen, by taps, until its round ends. */
async function playByTaps(page, game, { maxMs = 150000 } = {}) {
  const until = Date.now() + maxMs;
  await waitPlay(page);
  if (game === 'run-the-scale') await page.evaluate(async () => { window.__arcadeAudio = await import('/src/core/audio/index.ts'); });
  while (Date.now() < until) {
    if (await summaryVisible(page)) return true;
    if (game === 'note-hunt' || game === 'degree-darts') {
      const answers = await attr(page, 'answers');
      if (answers) await cell(page, answers.split(' ')[0]).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(140);
    } else if (game === 'shape-builder') {
      const build = page.locator('[data-arcade-build]');
      if (await build.count()) {
        await build.click();
        await page.waitForTimeout(200);
        continue;
      }
      const todo = await attr(page, 'todo');
      if (todo) await cell(page, todo.split(' ')[0]).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(90);
    } else if (game === 'fretboard-sprint') {
      const todo = await attr(page, 'todo');
      if (todo) await cell(page, todo.split(' ')[0]).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(90);
    } else if (game === 'mode-match') {
      const answer = await attr(page, 'answer');
      const btn = page.locator(`[data-mode="${answer}"]:not([disabled])`);
      if (answer && (await btn.count())) await btn.click().catch(() => {});
      await page.waitForTimeout(400);
    } else if (game === 'lick-echo') {
      const index = await attr(page, 'index');
      const answers = await attr(page, 'answers');
      const entered = await page.getAttribute('[data-arcade-entered]', 'data-arcade-entered').catch(() => '');
      const next = page.locator('[data-arcade-next]');
      if (await next.count()) {
        await next.click().catch(() => {});
        await page.waitForTimeout(300);
        continue;
      }
      if (answers && !entered) {
        for (const k of answers.split(' ')) {
          await cell(page, k).click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(60);
        }
      }
      // Wait for the next phrase (or the summary).
      for (let i = 0; i < 40 && (await attr(page, 'index')) === index && !(await summaryVisible(page)); i++) await page.waitForTimeout(100);
    } else if (game === 'run-the-scale') {
      const start = page.locator('[data-arcade-start]:not([disabled])');
      if (await start.count()) {
        await start.click();
        await page.waitForTimeout(300);
        continue;
      }
      const due = Number(await attr(page, 'due'));
      const current = await attr(page, 'current');
      if (!due || !current) {
        await page.waitForTimeout(30);
        continue;
      }
      const now = await page.evaluate(() => window.__arcadeAudio.audioSoundingNow());
      if (now < due - 0.035) {
        await page.waitForTimeout(Math.min(200, Math.max(5, (due - 0.035 - now) * 1000 - 15)));
        continue;
      }
      await cell(page, current).click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(60);
    }
  }
  return false;
}

const GAMES = [
  { id: 'note-hunt', level: 1 },
  { id: 'shape-builder', level: 1 },
  { id: 'run-the-scale', level: 1 },
  { id: 'degree-darts', level: 1 },
  { id: 'mode-match', level: 1 },
  { id: 'lick-echo', level: 1 },
  { id: 'fretboard-sprint', level: 1 },
];

/** Every game by taps on a phone, then the daily challenge. */
async function tapRounds(browser, url) {
  const { context, page, errors } = await openContext(browser, { mobile: true });
  for (const g of GAMES) {
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      if (attempt) await page.goto('about:blank');
      await open(page, url, 'arcade', g.id, FOCUS, `level-${g.level}`);
      await startRound(page);
      ok = await playByTaps(page, g.id);
    }
    check('taps', `${g.id}: a round played by tapping reaches the summary`, ok);
    const stars = Number(await page.getAttribute('[data-arcade-summary]', 'data-stars').catch(() => -1));
    const accuracy = Number(await page.getAttribute('[data-arcade-summary]', 'data-accuracy').catch(() => -1));
    // Taps are exact for every game but Run the Scale, whose taps are timed by a test script.
    check('taps', `${g.id}: stars on the summary`, g.id === 'run-the-scale' ? stars >= 0 && accuracy >= 40 : stars >= 2, `stars ${stars}, accuracy ${accuracy}%`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `arcade-summary-${g.id}.png`) });
  }
  const stored = await page.evaluate(() => ({ progress: JSON.parse(localStorage.getItem('ssa:progress') || '{}'), arcade: JSON.parse(localStorage.getItem('ssa:arcade') || '{}') }));
  const skills = stored.progress?.state?.skills ?? stored.progress?.skills ?? {};
  const box1 = skills['scale:a-minor-pentatonic:box-1'];
  check('progress', 'rounds are recorded on the shape skill scale:a-minor-pentatonic:box-1', box1 && box1.attempts >= 4, JSON.stringify(box1 ?? null).slice(0, 200));
  check('progress', 'Mode Match records arcade:mode-match:level-1', !!skills['arcade:mode-match:level-1']);
  check('progress', 'Fretboard Sprint records scale:a-minor-pentatonic:neck', !!skills['scale:a-minor-pentatonic:neck']);
  check('progress', 'stars reach the store', Object.values(skills).some((s) => s.stars >= 1));
  const lv = stored.arcade?.levels ?? {};
  check('records', 'level stars kept per game and scale', (lv['note-hunt']?.['minor-pentatonic']?.['1']?.stars ?? 0) >= 2, JSON.stringify(lv['note-hunt'] ?? null));
  check('records', 'personal bests kept per game', GAMES.every((g) => (stored.arcade?.bests?.[g.id]?.score ?? 0) > 0 || g.id === 'run-the-scale'));

  // The game screen now shows level 2 open.
  await open(page, url, 'arcade', 'note-hunt');
  await page.waitForSelector('[data-arcade-levels]', { timeout: 20000 });
  const locked2 = await page.getAttribute('[data-arcade-level="2"]', 'data-locked').catch(() => 'missing');
  check('records', 'a star on level 1 opens level 2', locked2 === null, `data-locked=${locked2}`);

  // Today's challenge: three short rounds, then one summary.
  await open(page, url, 'arcade');
  await page.waitForSelector('[data-arcade-daily]', { timeout: 20000 });
  await dismissShell(page);
  await page.click('[data-arcade-daily]');
  let dailyOk = true;
  for (let stage = 0; stage < 3; stage++) {
    await page.waitForSelector('[data-arcade-ready]', { timeout: 20000 });
    const game = await page.evaluate(() => document.querySelector('[data-arcade-round]')?.getAttribute('data-arcade-game'));
    await startRound(page);
    dailyOk = (await playByTaps(page, game)) && dailyOk;
    if (stage < 2) {
      await page.waitForSelector('[data-arcade-between]', { timeout: 20000 });
      await page.waitForTimeout(300);
      await dismissShell(page);
      await page.click('[data-arcade-daily-continue]');
    }
  }
  await page.waitForSelector('[data-arcade-daily-summary]', { timeout: 20000 }).catch(() => (dailyOk = false));
  check('daily', "today's challenge plays three games to one summary", dailyOk);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'arcade-daily-summary.png') });
  const daily = await page.evaluate(() => JSON.parse(localStorage.getItem('ssa:arcade') || '{}').daily);
  check('daily', 'the day is recorded as done', daily && daily.done === true, JSON.stringify(daily));

  await open(page, url, 'arcade');
  await page.waitForSelector('[data-arcade-game="note-hunt"]', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'arcade-hub-after.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('layout', 'the hub never scrolls sideways on a phone', overflow <= 1, `${overflow}px`);
  check('errors', 'no console errors while playing', errors.length === 0, errors.join(' | '));
  await context.close();
}

/** The host refuses the microphone (an artifact viewer): MediaBlocked once, then taps. */
async function noMic(browser, url) {
  const init = () => {
    window.claude = { use: async () => null };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  };
  const { context, page, errors } = await openContext(browser, { mobile: true, init });
  await open(page, url, 'arcade', 'note-hunt', FOCUS, 'level-1');
  await startRound(page, { mic: true });
  const blocked = page.getByRole('button', { name: 'Tap the notes instead' });
  await blocked.waitFor({ timeout: 15000 }).catch(() => {});
  check('no mic', 'choosing the guitar where the host refuses the mic shows MediaBlocked', (await blocked.count()) > 0);
  await page.screenshot({ path: path.join(OUT, 'arcade-nomic-blocked.png') });
  if (await blocked.count()) await blocked.click();
  const tapSelected = await page.getByRole('radio', { name: /Tap the screen/ }).getAttribute('aria-checked').catch(() => null);
  check('no mic', '"Tap the notes instead" switches the round to taps', tapSelected === 'true', `aria-checked=${tapSelected}`);
  await page.click('[data-arcade-go]');
  const played = await playByTaps(page, 'note-hunt');
  check('no mic', 'the round is played to its summary by taps', played);
  // Second round in the same visit (no reload), guitar chosen again: no panel, it quietly uses taps.
  await page.evaluate((f) => { location.hash = `#arcade--degree-darts--${f}--level-1`; }, FOCUS);
  await startRound(page, { mic: true });
  await page.waitForSelector('[data-arcade-phase="count"], [data-arcade-phase="play"], [data-arcade-ready] [role="alert"]', { timeout: 15000 }).catch(() => {});
  const input = await page.getAttribute('[data-arcade-input]', 'data-arcade-input').catch(() => null);
  const panelAgain = await page.getByRole('button', { name: 'Tap the notes instead' }).count();
  check('no mic', 'later rounds in the visit fall back to taps without the panel', input === 'tap' && panelAgain === 0, `input=${input}, panel=${panelAgain}`);
  check('no mic', 'no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

/** Write a fake microphone recording made with the app's guitar. */
async function makeRecording(file, notes, seconds) {
  const audio = await loadTs('/src/core/audio/index.ts');
  const SR = 48000;
  const x = audio.renderSequence(notes.map((n) => ({ velocity: 0.8, duration: 0.7, ...n })), { sampleRate: SR, seconds, tone: 'steel' });
  fs.writeFileSync(file, Buffer.from(audio.encodeWav(x, SR, { bitDepth: 16 })));
}

/** Note Hunt and Run the Scale with a recording as the microphone. */
async function fakeMic() {
  const core = await loadTs('/src/features/arcade/core/index.ts');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-mic-'));
  const pattern = core.patternOf(core.DEFAULT_FOCUS);

  // --- Note Hunt, level 1, the test seed: right ×3 fast, wrong, right, slow ×2, fast ×4.
  const hunt = core.makeNoteHuntRound(pattern, core.NOTE_HUNT_LEVELS[0], SEED);
  const t = hunt.targets.map((x) => x.lit);
  const at = [4.5, 5.5, 6.5, 8.6, 12.3, 15.9, 16.9, 17.9, 18.9, 19.9];
  const huntNotes = t.map((n, i) => ({ time: at[i], midi: n.midi, string: n.string }));
  huntNotes.push({ time: 7.6, midi: 61, string: 2 }); // C sharp: not in A minor pentatonic
  const huntWav = path.join(tmp, 'hunt.wav');
  await makeRecording(huntWav, huntNotes, 26);
  // The first note's time counts from when the round started, which depends on how fast the
  // microphone opened: fast or good are both right there. Every later one is fixed by the recording.
  const expectHunt = /^first:(fast|good) first:fast first:fast retry:good first:slow first:slow first:fast first:fast first:fast first:fast$/;

  let huntOk = false;
  for (let attempt = 0; attempt < 2 && !huntOk; attempt++) {
    await withApp({ mobile: true, fakeAudio: `${huntWav}%noloop`, settle: 300 }, async ({ page, goto, errors }) => {
      await page.addInitScript((e) => { for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, SEEDED);
      await goto('arcade', 'note-hunt', FOCUS, 'level-1');
      await startRound(page, { mic: true });
      await page.waitForSelector('[data-arcade-mic="on"]', { timeout: 20000 }).catch(() => {});
      const micOn = (await page.locator('[data-arcade-mic="on"]').count()) > 0;
      await page.waitForSelector('[data-arcade-summary]', { timeout: 45000 }).catch(() => {});
      const found = await attr(page, 'found');
      const summary = await page.locator('[data-arcade-summary]').count();
      const accuracy = await page.getAttribute('[data-arcade-summary]', 'data-accuracy').catch(() => null);
      const verdicts = await page.getAttribute('[data-arcade-summary]', 'data-verdicts').catch(() => null);
      huntOk = summary > 0 && expectHunt.test(verdicts ?? '');
      if (huntOk || attempt === 1) {
        check('fake mic', 'Note Hunt: the microphone opens on the recording', micOn);
        check('fake mic', 'Note Hunt: the round ends by playing alone', summary > 0, found);
        check('fake mic', 'Note Hunt: fast, wrong-then-right and slow notes are judged so', expectHunt.test(verdicts ?? ''), `got "${verdicts}"`);
        check('fake mic', 'Note Hunt: 9 of 10 at the first try = 90 %', accuracy === '90', `accuracy ${accuracy}`);
        check('fake mic', 'Note Hunt: no console errors', errors.length === 0, errors.join(' | '));
        await page.screenshot({ path: path.join(OUT, 'arcade-mic-note-hunt.png') });
      }
    });
  }

  // --- Run the Scale, level 1 (box 1 up, 60 BPM): start note, 6 on time, a wrong note, 5 late.
  const run = core.runNotes(pattern, core.RUN_LEVELS[0]);
  const ready = 5.5;
  const beat = 1;
  const first = ready + beat + 4 * beat; // the lead (one beat at 60 BPM) and the four-click count-in
  const runNotes = [{ time: ready, midi: run[0].midi, string: run[0].string }];
  run.forEach((n, k) => {
    if (k < 6) runNotes.push({ time: first + k * beat, midi: n.midi, string: n.string });
    else if (k === 6) runNotes.push({ time: first + k * beat, midi: 61, string: 2 });
    else runNotes.push({ time: first + k * beat + 0.2, midi: n.midi, string: n.string });
  });
  const runWav = path.join(tmp, 'run.wav');
  await makeRecording(runWav, runNotes, first + run.length * beat + 6);
  const expectRun = ['on-time', 'on-time', 'on-time', 'on-time', 'on-time', 'on-time', 'missed', 'late', 'late', 'late', 'late', 'late'].join(',');

  let runOk = false;
  for (let attempt = 0; attempt < 2 && !runOk; attempt++) {
    await withApp({ mobile: true, fakeAudio: `${runWav}%noloop`, settle: 300 }, async ({ page, goto, errors }) => {
      await page.addInitScript((e) => { for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, SEEDED);
      await goto('arcade', 'run-the-scale', FOCUS, 'level-1');
      await startRound(page, { mic: true });
      // The run's own phase (not the 3-2-1 before the round): the start note must start its count-in.
      const counted = await page.waitForSelector('[data-arcade-round][data-arcade-phase="count"], [data-arcade-round][data-arcade-phase="run"]', { timeout: 30000 }).then(() => true, () => false);
      await page.waitForSelector('[data-arcade-round][data-arcade-phase="run"]', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(OUT, 'arcade-mic-run.png') });
      await page.waitForSelector('[data-arcade-round][data-arcade-phase="between"]', { timeout: 40000 }).catch(() => {});
      const judged = await page.getAttribute('[data-arcade-judgements]', 'data-arcade-judgements').catch(() => null);
      const status = await page.textContent('[data-arcade-status]').catch(() => '');
      runOk = judged === expectRun;
      if (runOk || attempt === 1) {
        check('fake mic', 'Run the Scale: playing the start note starts the count-in', counted);
        check('fake mic', 'Run the Scale: on time ×6, a wrong note (missed), late ×5', judged === expectRun, `got "${judged}"`);
        check('fake mic', 'Run the Scale: a messy run keeps the tempo', /Same tempo/.test(status ?? ''), status);
        check('fake mic', 'Run the Scale: no console errors', errors.length === 0, errors.join(' | '));
      }
    });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

/** Screenshots of every game in play, the hub and a game screen. */
async function shots(browser, url) {
  const sets = [
    { tag: 'phone-dark', mobile: true, theme: 'dark' },
    { tag: 'phone-light', mobile: true, theme: 'light' },
    { tag: 'desktop-dark', mobile: false, theme: 'dark' },
    { tag: 'desktop-light', mobile: false, theme: 'light' },
  ];
  const levels = { 'note-hunt': 3, 'shape-builder': 2, 'run-the-scale': 2, 'degree-darts': 2, 'mode-match': 3, 'lick-echo': 1, 'fretboard-sprint': 3 };
  for (const s of sets) {
    const { context, page, errors } = await openContext(browser, { mobile: s.mobile, theme: s.theme });
    await open(page, url, 'arcade');
    await page.waitForSelector('[data-arcade-game]', { timeout: 30000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `arcade-${s.tag}-hub.png`), fullPage: true });
    await open(page, url, 'arcade', 'shape-builder');
    await page.waitForSelector('[data-arcade-levels]', { timeout: 30000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `arcade-${s.tag}-levels.png`) });
    for (const [game, level] of Object.entries(levels)) {
      await open(page, url, 'arcade', game, FOCUS, `level-${level}`);
      await startRound(page);
      await waitPlay(page).catch(() => {});
      await page.waitForTimeout(game === 'mode-match' ? 1500 : 700);
      await page.screenshot({ path: path.join(OUT, `arcade-${s.tag}-${game}.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check('layout', `${s.tag} ${game}: no sideways scroll`, overflow <= 1, `${overflow}px`);
    }
    check('errors', `${s.tag}: no console errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  // A phone held sideways: the neck takes the width.
  const { context, page } = await openContext(browser, { mobile: true, viewport: { width: 844, height: 390 } });
  for (const game of ['note-hunt', 'run-the-scale', 'fretboard-sprint']) {
    await open(page, url, 'arcade', game, FOCUS, `level-${levels[game]}`);
    await startRound(page);
    await waitPlay(page).catch(() => {});
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `arcade-landscape-${game}.png`) });
    const fits = await page.evaluate(() => {
      const b = document.querySelector('[data-arcade-round] svg')?.getBoundingClientRect();
      return b ? b.bottom <= window.innerHeight + 2 && b.width >= 480 : false;
    });
    check('layout', `landscape ${game}: the neck is wide and fully on screen`, fits);
  }
  await context.close();
}

(async () => {
  console.log('Scale Arcade browser check');
  if (want('taps') || want('nomic') || (want('shots') && !skipShots)) {
    await withApp({ mobile: true, settle: 300 }, async ({ browser, url }) => {
      if (want('taps')) await tapRounds(browser, url);
      if (want('nomic')) await noMic(browser, url);
      if (want('shots') && !skipShots) await shots(browser, url);
    });
  }
  if (want('mic') && !skipMic) await fakeMic();
  const groups = [...new Set(results.map((r) => r.group))];
  for (const g of groups) {
    const rs = results.filter((r) => r.group === g);
    const failed = rs.filter((r) => !r.pass).length;
    console.log(`${failed ? 'FAIL' : 'ok  '}  ${g}: ${rs.length - failed}/${rs.length}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `FAILED (${failed.length} of ${results.length} checks)` : `PASSED (${results.length} checks)`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  console.log('FAILED');
  process.exit(1);
});
