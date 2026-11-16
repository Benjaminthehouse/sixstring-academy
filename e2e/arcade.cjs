#!/usr/bin/env node
/**
 * Browser check of the Scale Arcade (#arcade). Run: node e2e/arcade.cjs [--verbose] [--skip-mic] [--skip-shots] [--only taps,nomic,review,shots,mic,lost]
 *
 * Added by the review (each was a real bug):
 *  review      the keyboard alone (focus on the ready card, then on the neck; a whole round by
 *              arrows and Enter), Space starting Run the Scale's count-in, a hidden tab pausing the
 *              clock and counting in again, a run called off in its count-in staying off, Lick Echo
 *              keeping "Next phrase" through a pause, and no round recorded after the learner left.
 *  lost        the microphone stops mid-round: the round says so, goes on by tapping, and the
 *              device is released.
 *  daily       "Next:" between the challenge's games names the game that really comes next.
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
    await dismissShell(page);
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
  let promised = null;
  const upNextRight = [];
  for (let stage = 0; stage < 3; stage++) {
    await page.waitForSelector('[data-arcade-ready]', { timeout: 20000 });
    const game = await page.evaluate(() => document.querySelector('[data-arcade-round]')?.getAttribute('data-arcade-game'));
    if (promised !== null) upNextRight.push(`${promised}=${game}`);
    await startRound(page);
    const played = await playByTaps(page, game);
    dailyOk = played && dailyOk;
    if (stage < 2) {
      const between = await page.waitForSelector('[data-arcade-between]', { timeout: 30000 }).then(() => true, () => false);
      if (!between) {
        await page.screenshot({ path: path.join(OUT, 'arcade-debug-daily.png') });
        console.log(`  daily stage ${stage} (${game}) played=${played}; on screen: ${await page.evaluate(() => `${location.hash} :: ${(document.querySelector('main')?.innerText || '').slice(0, 300).replace(/\s+/g, ' ')}`)}`);
        dailyOk = false;
        break;
      }
      await page.waitForTimeout(300);
      await dismissShell(page);
      promised = await page.getAttribute('[data-arcade-up-next]', 'data-arcade-up-next').catch(() => null);
      await page.click('[data-arcade-daily-continue]');
    }
  }
  await page.waitForSelector('[data-arcade-daily-summary]', { timeout: 20000 }).catch(() => (dailyOk = false));
  check('daily', "today's challenge plays three games to one summary", dailyOk);
  check('daily', 'between games, "Next:" names the game that comes next', upNextRight.length === 2 && upNextRight.every((p) => p.split('=')[0] === p.split('=')[1]), upNextRight.join(', '));
  await page.waitForTimeout(600);
  await dismissShell(page);
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
  // "Tap the notes instead" starts the round by tapping at once: no second Start to find.
  const started = await page.waitForSelector('[data-arcade-phase="count"], [data-arcade-phase="play"]', { timeout: 15000 }).then(() => true, () => false);
  const tapInput = await page.getAttribute('[data-arcade-input]', 'data-arcade-input').catch(() => null);
  check('no mic', '"Tap the notes instead" starts the round by tapping straight away', started && tapInput === 'tap', `started=${started}, input=${tapInput}`);
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

/** Hide or show the tab the way a phone does when the learner switches apps. Runs in the page. */
function setHidden(hidden) {
  Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

const focusInfo = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return {
      tag: a ? a.tagName : null,
      label: a ? a.getAttribute('aria-label') || '' : '',
      ready: !!(a && a.closest && a.closest('[data-arcade-ready]')),
      inRound: !!(a && a.closest && a.closest('[data-arcade-round]')),
      body: a === document.body,
    };
  });

/** Move the keyboard focus on the neck to `key` ("string:fret") with the arrow keys. */
async function arrowTo(page, key) {
  const [ts, tf] = key.split(':').map(Number);
  const where = async () => {
    const m = /string (\d), (?:fret (\d+)|open)/.exec((await focusInfo(page)).label);
    return m ? { s: Number(m[1]), f: m[2] ? Number(m[2]) : 0 } : null;
  };
  for (let i = 0; i < 40; i++) {
    const at = await where();
    if (!at) return false;
    if (at.s === ts && at.f === tf) return true;
    let k;
    if (at.s !== ts) k = at.s > ts ? 'ArrowUp' : 'ArrowDown';
    else k = at.f < tf ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.press(k);
    const after = await where();
    // The neck may map up and down the other way round (left-handed, vertical): try the opposite key.
    if (after && after.s === at.s && after.f === at.f) await page.keyboard.press({ ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp', ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' }[k]);
  }
  return false;
}

/**
 * Cases found in the review (each was a real bug): the keyboard alone, Space in Run the Scale, a
 * hidden tab mid-round, leaving right after the last answer, and Lick Echo resuming a marked phrase.
 */
async function reviewCases(browser, url) {
  // --- Keyboard alone, on a desktop: Enter on the level link, Enter on the card, arrows + Enter on the neck.
  {
    const { context, page, errors } = await openContext(browser, { mobile: false });
    await open(page, url, 'arcade', 'note-hunt', FOCUS);
    await page.waitForSelector('[data-arcade-play]', { timeout: 20000 });
    await page.focus('[data-arcade-play]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-arcade-ready]', { timeout: 20000 });
    await page.waitForTimeout(300);
    const onCard = await focusInfo(page);
    check('review', 'keyboard: the ready card takes the focus (not the page body)', onCard.ready, JSON.stringify(onCard));
    await page.keyboard.press('Tab');
    const firstTab = await focusInfo(page);
    check('review', 'keyboard: Tab stays in the card, never on the board hidden behind it', firstTab.ready && !/^string /.test(firstTab.label), JSON.stringify(firstTab));
    // Tab on to Start (as a keyboard user would) and press it.
    for (let i = 0; i < 8 && !(await page.evaluate(() => document.activeElement?.hasAttribute('data-arcade-go'))); i++) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await waitPlay(page);
    await page.waitForTimeout(300);
    const inPlay = await focusInfo(page);
    check('review', 'keyboard: once the round starts the focus is on the neck', inPlay.inRound && /^string /.test(inPlay.label), JSON.stringify(inPlay));
    let ok = true;
    for (let n = 0; n < 12 && !(await summaryVisible(page)); n++) {
      const answers = await attr(page, 'answers');
      if (!answers) break;
      ok = (await arrowTo(page, answers.split(' ')[0])) && ok;
      await page.keyboard.press('Enter');
      await page.waitForTimeout(250);
    }
    await page.waitForSelector('[data-arcade-summary]', { timeout: 15000 }).catch(() => {});
    const stars = Number(await page.getAttribute('[data-arcade-summary]', 'data-stars').catch(() => -1));
    check('review', 'keyboard: a whole Note Hunt round is played with the arrows and Enter', ok && stars === 3, `arrows ok=${ok}, stars=${stars}`);
    check('review', 'keyboard: no console errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // --- Run the Scale: Space starts the count-in, as its hint says, with the focus on the neck.
  {
    const { context, page, errors } = await openContext(browser, { mobile: false });
    await open(page, url, 'arcade', 'run-the-scale', FOCUS, 'level-1');
    await startRound(page);
    await waitPlay(page);
    await page.waitForTimeout(300);
    await page.keyboard.press(' ');
    const counting = await page.waitForSelector('[data-arcade-round][data-arcade-phase="count"]', { timeout: 5000 }).then(() => true, () => false);
    check('review', 'Run the Scale: Space starts the count-in', counting);
    // Hidden mid-run: the run is called off (not judged against clicks nobody heard).
    await page.waitForSelector('[data-arcade-round][data-arcade-phase="run"]', { timeout: 10000 }).catch(() => {});
    await page.evaluate(setHidden, true);
    await page.waitForTimeout(1500);
    const pausedPhase = await page.getAttribute('[data-arcade-round]', 'data-arcade-phase').catch(() => null);
    const pausedText = await page.textContent('[data-arcade-status]').catch(() => '');
    await page.evaluate(setHidden, false);
    await page.waitForSelector('[data-arcade-phase="play"]', { timeout: 10000 }).catch(() => {});
    const startBack = await page.locator('[data-arcade-start]:not([disabled])').count();
    check('review', 'Run the Scale: a hidden tab calls the run off; Start is there again on return', pausedPhase === 'ready' && /Paused/.test(pausedText ?? '') && startBack > 0, `phase=${pausedPhase}, start=${startBack}, "${pausedText}"`);
    // Hidden for a moment during the count-in: the called-off run's own cues must not wake it up
    // later (it used to switch to "run" with nothing to judge, and no Start button).
    await page.waitForTimeout(300);
    await page.keyboard.press(' ');
    await page.waitForSelector('[data-arcade-round][data-arcade-phase="count"]', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate(setHidden, true);
    await page.waitForTimeout(300);
    await page.evaluate(setHidden, false);
    await page.waitForSelector('[data-arcade-phase="play"]', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const laterPhase = await page.getAttribute('[data-arcade-round]', 'data-arcade-phase').catch(() => null);
    const laterStart = await page.locator('[data-arcade-start]:not([disabled])').count();
    check('review', 'Run the Scale: a run called off in its count-in stays off (Start waits)', laterPhase === 'ready' && laterStart > 0, `phase=${laterPhase}, start=${laterStart}`);
    check('review', 'Run the Scale: no console errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // --- A hidden tab pauses the clock and counts in again on return (Fretboard Sprint).
  {
    const { context, page, errors } = await openContext(browser, { mobile: true });
    await open(page, url, 'arcade', 'fretboard-sprint', FOCUS, 'level-1');
    await startRound(page);
    await waitPlay(page);
    await page.waitForTimeout(1200);
    const left = () => page.getAttribute('[data-arcade-round] [role="timer"]', 'aria-label').then((s) => Number(/(\d+) seconds/.exec(s ?? '')?.[1] ?? NaN));
    const before = await left();
    await page.evaluate(setHidden, true);
    await page.waitForTimeout(4000);
    const hiddenLeft = await left();
    await page.evaluate(setHidden, false);
    const recount = await page.waitForSelector('[data-arcade-phase="count"]', { timeout: 3000 }).then(() => true, () => false);
    await waitPlay(page);
    check('review', 'hidden tab: the clock stands still while away', Number.isFinite(before) && hiddenLeft >= before - 1, `before ${before}, after 4 s hidden ${hiddenLeft}`);
    check('review', 'hidden tab: coming back counts 3-2-1 before play resumes', recount);
    check('review', 'hidden tab: no console errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // --- Lick Echo: a phrase marked wrong keeps its Next button through a pause (it used to get stuck).
  {
    const { context, page, errors } = await openContext(browser, { mobile: true });
    await open(page, url, 'arcade', 'lick-echo', FOCUS, 'level-1');
    await startRound(page);
    await waitPlay(page);
    await page.waitForSelector('[data-arcade-round][data-arcade-phase="answer"]', { timeout: 15000 }).catch(() => {});
    const answers = (await attr(page, 'answers')) ?? '';
    const keys = answers.split(' ');
    // Three taps, the middle one wrong: the phrase is marked "Close" and waits for Next.
    const wrong = await page.evaluate((right) => [...document.querySelectorAll('[data-arcade-round] button[aria-label^="string "]')].map((b) => b.getAttribute('aria-label')).find((l) => l !== right), label(keys[1]));
    await cell(page, keys[0]).click();
    await page.locator(`[data-arcade-round] button[aria-label="${wrong}"]`).first().click();
    await cell(page, keys[2]).click();
    await page.waitForSelector('[data-arcade-next]', { timeout: 5000 }).catch(() => {});
    await page.evaluate(setHidden, true);
    await page.waitForTimeout(600);
    await page.evaluate(setHidden, false);
    await waitPlay(page);
    await page.waitForTimeout(800);
    const nextThere = await page.locator('[data-arcade-next]').count();
    check('review', 'Lick Echo: after a pause, a marked phrase still offers Next phrase', nextThere > 0);
    if (nextThere) await page.click('[data-arcade-next]');
    const moved = await page.waitForFunction(() => document.querySelector('[data-arcade-round]')?.getAttribute('data-arcade-index') === '1', null, { timeout: 5000 }).then(() => true, () => false);
    check('review', 'Lick Echo: Next phrase moves on', moved);
    check('review', 'Lick Echo: no console errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // --- Leaving right after the last answer does not record the round afterwards (Mode Match).
  {
    const { context, page, errors } = await openContext(browser, { mobile: true });
    await open(page, url, 'arcade', 'mode-match', FOCUS, 'level-1');
    await startRound(page);
    await waitPlay(page);
    // Level 1 asks 8 questions; answer them all right, and leave the moment the 8th is in.
    const QUESTIONS = 8;
    let answered = 0;
    for (let i = 0; i < 60 && answered < QUESTIONS; i++) {
      const index = Number(await attr(page, 'index'));
      const answer = await attr(page, 'answer');
      const btn = page.locator(`[data-mode="${answer}"]:not([disabled])`);
      if (index !== answered || !answer || !(await btn.count())) {
        await page.waitForTimeout(200);
        continue;
      }
      await btn.click();
      answered++;
      // Out of the round before its summary arrives.
      if (answered === QUESTIONS) await page.evaluate(() => { location.hash = '#arcade'; });
    }
    check('review', 'leaving before the summary: all the questions were answered first', answered === QUESTIONS, `answered ${answered}`);
    await page.waitForTimeout(2500);
    const recorded = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('ssa:progress') || '{}');
      const st = raw.state ?? raw;
      return (st.skills || {})['arcade:mode-match:level-1']?.attempts ?? 0;
    });
    check('review', 'leaving before the summary: the round is not recorded behind the learner’s back', recorded === 0, `attempts ${recorded}`);
    check('review', 'leaving before the summary: no console errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }
  // --- A shape named by the Scales screen is the same box in the same octave: box 4 of A minor
  //     pentatonic climbs to the 12th fret there, so it does here (not the open-position copy).
  {
    const { context, page, errors } = await openContext(browser, { mobile: false });
    await open(page, url, 'arcade', 'a-minor-pentatonic', 'box-4');
    await page.waitForFunction(() => /Box 4/.test(document.querySelector('main')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
    const text = await page.evaluate(() => document.querySelector('main')?.textContent ?? '');
    check('review', 'a Scales link to box 4 shows box 4 at the 12th fret, as the Scales screen does', /Box 4 · 12th position/.test(text), (/Box 4[^·]*·[^A-Z]{0,30}/.exec(text) || [''])[0]);
    check('review', 'shape link: no console errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }
}

/** The microphone stops mid-round (unplugged): the round says so and goes on by tapping. */
async function micLost() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-lost-'));
  const quiet = path.join(tmp, 'quiet.wav');
  // A quiet room: two seconds of near silence, looped.
  const SR = 48000;
  const n = SR * 2;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round((Math.random() - 0.5) * 40), 44 + i * 2);
  fs.writeFileSync(quiet, buf);
  await withApp({ mobile: true, fakeAudio: quiet, settle: 300 }, async ({ page, goto, errors }) => {
    await page.addInitScript((e) => { for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, SEEDED);
    await page.addInitScript(() => {
      const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.__arcadeTracks = [];
      navigator.mediaDevices.getUserMedia = async (c) => { const s = await g(c); window.__arcadeTracks.push(...s.getTracks()); return s; };
    });
    await goto('arcade', 'note-hunt', FOCUS, 'level-1');
    await startRound(page, { mic: true });
    await page.waitForSelector('[data-arcade-mic="on"]', { timeout: 20000 }).catch(() => {});
    await waitPlay(page);
    await page.evaluate(() => { for (const t of window.__arcadeTracks) { t.stop(); t.dispatchEvent(new Event('ended')); } });
    const fellBack = await page.waitForSelector('[data-arcade-input="tap"]', { timeout: 8000 }).then(() => true, () => false);
    const banner = await page.locator('text=The microphone stopped').count();
    check('mic lost', 'the round switches to taps and says why', fellBack && banner > 0, `tap=${fellBack}, banner=${banner}`);
    const played = await playByTaps(page, 'note-hunt', { maxMs: 60000 });
    check('mic lost', 'the round is finished by tapping', played);
    const released = await page.evaluate(() => window.__arcadeTracks.every((t) => t.readyState === 'ended'));
    check('mic lost', 'the microphone is released', released);
    check('mic lost', 'no console errors', errors.length === 0, errors.join(' | '));
  });
  fs.rmSync(tmp, { recursive: true, force: true });
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
      // The fretboard is the largest drawing in the round.
      const svgs = [...document.querySelectorAll('[data-arcade-round] svg')].map((el) => el.getBoundingClientRect());
      const b = svgs.sort((x, y) => y.width * y.height - x.width * x.height)[0];
      return b ? b.bottom <= window.innerHeight + 2 && b.width >= 480 : false;
    });
    check('layout', `landscape ${game}: the neck is wide and fully on screen`, fits);
  }
  await context.close();
}

(async () => {
  console.log('Scale Arcade browser check');
  if (want('taps') || want('nomic') || want('review') || (want('shots') && !skipShots)) {
    await withApp({ mobile: true, settle: 300 }, async ({ browser, url }) => {
      if (want('taps')) await tapRounds(browser, url);
      if (want('nomic')) await noMic(browser, url);
      if (want('review')) await reviewCases(browser, url);
      if (want('shots') && !skipShots) await shots(browser, url);
    });
  }
  if (want('mic') && !skipMic) await fakeMic();
  if (want('lost') && !skipMic) await micLost();
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
