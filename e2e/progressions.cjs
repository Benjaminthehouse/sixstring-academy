#!/usr/bin/env node
/**
 * Browser check of Progressions (#progressions). Run: node e2e/progressions.cjs [--quick] [--only desktop|phone|themes]
 *
 * Everything is driven through the screen (clicks, taps, keys), the way a learner would.
 *
 *  desktop  browse: style filter, level filter, search, a card's preview lights its chords and
 *           stops on a second tap; several progressions open (pop, blues, jazz, flamenco, rhythm
 *           changes, a modal one) with one chart cell per chord and one diagram per distinct chord;
 *           the key picker, ←/→ and a deep link with another spelling change the key; the capo
 *           banner in B♭ switches the diagrams to G shapes behind capo 3; "Hear the chords" lights
 *           the chart as it strums; the jam: Play, the count-in, then the shown chord follows the
 *           band: every chord change the band reports through `onChord` shows the same chord
 *           within a frame or two of the moment it is heard (audio clock), in chart order; the
 *           neck shows the chord's tones and the scale switches; Space pauses; a jam over 20 s is
 *           logged in the progress store when the learner leaves
 *  phone    no sideways page scroll anywhere; the builder: clear, add chords with taps, a
 *           suggestion, a cadence named as it forms, a chord set to two bars, transpose, Play with
 *           the band (the playing chord lights), save with a name, the saved progression survives
 *           a reload and appears under "Yours"; the jam is immersive with a chord name at least
 *           64 px tall, Play in the thumb zone, and a phone held sideways puts chord and neck side
 *           by side
 *  themes   screenshots of browse, a page, the jam (playing) and the builder, phone and desktop,
 *           light and dark (e2e/out/progressions-*.png)
 *
 * Prints one line per check, PASSED or FAILED at the end, and exits non-zero on failure. Timing
 * limits are generous: the machine is shared and busy.
 */
const path = require('node:path');
const fs = require('node:fs');
const { withApp, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const quick = argv.includes('--quick');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined && detail !== '' ? `  [${String(detail).slice(0, 300)}]` : ''}`);
};
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, `progressions-${name}.png`), ...opts });

const SEED = () => {
  try {
    localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
  } catch { /* ignore */ }
};

async function open(page, url, hash, selector) {
  await page.goto(url + '#' + hash, { waitUntil: 'load' });
  await page.waitForSelector('main[data-route]', { timeout: 30000 });
  if (selector) await page.waitForSelector(selector, { timeout: 30000 });
  await page.waitForTimeout(500);
}

/** Poll `fn` in the page until it returns a truthy value or time runs out. */
async function until(page, fn, arg, timeout = 10000) {
  const end = Date.now() + timeout;
  let v;
  while (Date.now() < end) {
    v = await page.evaluate(fn, arg);
    if (v) return v;
    await page.waitForTimeout(100);
  }
  return v;
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const attr = (page, sel, name) => page.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [sel, name]);

// ── Desktop ──────────────────────────────────────────────────────────────────────────────────

async function desktop() {
  await withApp({ size: 'desktop', theme: 'dark' }, async ({ page, url, errors }) => {
    await page.addInitScript(SEED);

    // Browse
    await open(page, url, 'progressions', '[data-progressions="browse"]');
    const cards = await page.locator('[data-progression-card]').count();
    check('browse opens with style shelves of cards', cards >= 30, `${cards} cards`);
    await page.getByRole('radio', { name: 'Blues' }).first().click();
    await page.waitForTimeout(400);
    const blues = await page.evaluate(async () => {
      const catalog = await import('/src/content/progressions/index.ts');
      const ids = [...document.querySelectorAll('[data-progression-card]')].map((c) => c.getAttribute('data-progression-card'));
      return { ids, all: ids.every((id) => catalog.getProgression(id)?.styles.includes('blues')) };
    });
    check('the Blues filter shows only blues progressions', blues.ids.length > 10 && blues.all, `${blues.ids.length}: ${blues.ids.slice(0, 5).join(', ')}`);
    await page.getByRole('radio', { name: /Advanced/ }).click();
    await page.waitForTimeout(300);
    const advanced = await page.locator('[data-progression-card]').count();
    check('a level band narrows it further', advanced > 0 && advanced < blues.ids.length, `${advanced}`);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByRole('searchbox', { name: 'Search progressions' }).fill('andalusian');
    await page.waitForTimeout(600);
    const found = await page.evaluate(() => [...document.querySelectorAll('[data-progression-card]')].map((c) => c.getAttribute('data-progression-card')));
    check('search finds the Andalusian cadence', found.includes('flamenco-andalusian'), found.join(', '));
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.waitForTimeout(300);

    // A card's preview
    const card = page.locator('[data-progression-card="pop-axis"]').first();
    await card.getByRole('button', { name: /^Hear / }).click();
    const lit = await until(page, () => {
      const c = document.querySelector('[data-progression-card="pop-axis"]');
      return c && c.querySelector('button[aria-pressed="true"]') && [...c.querySelectorAll('[aria-hidden="true"]')].some((s) => /On/.test(s.className)) ? 'lit' : null;
    }, null, 6000);
    check('tapping a card plays its preview and lights the chord that sounds', lit === 'lit');
    await card.getByRole('button', { name: /^Stop / }).click();
    const stopped = await until(page, () => !document.querySelector('[data-progression-card="pop-axis"] button[aria-pressed="true"]'), null, 3000);
    check('a second tap stops it', stopped);

    // Several progressions
    const ids = quick ? ['blues-12-bar', 'jazz-ii-v-i'] : ['blues-12-bar', 'jazz-ii-v-i', 'flamenco-andalusian', 'jazz-rhythm-changes', 'dorian-i-iv', 'classical-folia'];
    for (const id of ids) {
      await open(page, url, `progressions--${id}`, '[data-progressions="page"]');
      const info = await page.evaluate(() => ({
        bars: document.querySelectorAll('[data-chart] [data-bar]').length,
        slots: document.querySelectorAll('[data-chart] [data-slot]').length,
        shapes: [...document.querySelectorAll('[data-shapes] [data-shape]')].map((b) => b.getAttribute('data-shape')),
        chordsInChart: new Set([...document.querySelectorAll('[data-chart] [data-slot]')].map((b) => b.getAttribute('aria-label').split(': ')[1].split(',')[0])).size,
        why: !!document.evaluate("//h2[text()='Why it works']", document, null, 9, null).singleNodeValue,
        title: document.querySelector('h1')?.textContent ?? '',
      }));
      check(`${id}: chart, one diagram per distinct chord, why it works`, info.bars > 0 && info.slots >= info.bars && info.shapes.length === info.chordsInChart && info.why, `${info.title} · ${info.bars} bars, ${info.slots} chords, ${info.shapes.length} shapes`);
      check(`${id}: no sideways scroll`, (await overflow(page)) <= 1);
    }

    // Keys
    await open(page, url, 'progressions--pop-axis', '[data-progressions="page"]');
    check('the axis progression opens in G', (await attr(page, '[data-progressions="page"]', 'data-tonic')) === 'G');
    await page.keyboard.press('ArrowRight');
    let t = await until(page, () => (document.querySelector('[data-progressions="page"]')?.getAttribute('data-tonic') === 'Ab' ? location.hash : null));
    check('→ raises the key a half step, spelled A♭', !!t && t.endsWith('--ab'), t);
    await page.getByRole('button', { name: 'Key of D' }).click();
    t = await until(page, () => (document.querySelector('[data-progressions="page"]')?.getAttribute('data-tonic') === 'D' ? location.hash : null));
    const dChords = await page.evaluate(() => [...document.querySelectorAll('[data-shapes] [data-shape]')].map((b) => b.getAttribute('data-shape')));
    check('a key chip moves the whole chart (D: D A Bm G)', JSON.stringify(dChords) === JSON.stringify(['D', 'A', 'Bm', 'G']), dChords.join(' '));
    await open(page, url, 'progressions--pop-axis--a-sharp', '[data-progressions="page"]');
    t = await until(page, () => (location.hash.endsWith('--bb') ? location.hash : null));
    check('a deep link spelled A♯ is shown as B♭', !!t, await page.evaluate(() => location.hash));
    const capo = await until(page, () => (document.body.textContent.includes('Capo 3, then play G shapes') ? 'yes' : null), null, 8000);
    check('B♭ offers capo 3 with G shapes', capo === 'yes');
    await page.getByRole('button', { name: 'Show capo shapes' }).click();
    const capoOn = await until(page, () => document.querySelector('[data-progressions="page"]')?.getAttribute('data-capo') === '3' && document.body.textContent.includes('G shape'));
    check('the diagrams switch to G shapes behind capo 3', !!capoOn);
    await page.getByRole('button', { name: 'Hear the chords' }).click();
    const lit2 = await until(page, () => document.querySelector('[data-chart] [data-now="true"]')?.getAttribute('data-slot') ?? null, null, 6000);
    check('"Hear the chords" lights the chart as it strums', !!lit2, lit2);
    await page.keyboard.press(' ');
    const off = await until(page, () => document.querySelector('[data-progressions="page"]')?.getAttribute('data-playing') === 'false');
    check('Space stops it', !!off);

    // Jam
    await page.getByRole('link', { name: 'Jam with the band' }).first().click();
    await page.waitForSelector('[data-jam]', { timeout: 20000 });
    check('the jam opens from the page, in the same key', (await attr(page, '[data-jam]', 'data-tonic')) === 'Bb', await page.evaluate(() => location.hash));
    check('the sidebar folds while jamming', (await page.evaluate(() => document.querySelector('[data-immersive]')?.getAttribute('data-immersive'))) === 'focus');
    await page.keyboard.press('ArrowLeft');
    await until(page, () => document.querySelector('[data-jam]')?.getAttribute('data-tonic') === 'A');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const g = await until(page, () => document.querySelector('[data-jam]')?.getAttribute('data-tonic') === 'G');
    check('←/→ change the jam’s key', !!g, await attr(page, '[data-jam]', 'data-tonic'));

    await page.evaluate(async () => {
      const audio = await import('/src/core/audio/index.ts');
      const bandMod = await import('/src/features/progressions/ui/useBand.ts');
      const P = { audio, bandMod, heard: [], shown: [], hooked: false };
      const root = () => document.querySelector('[data-jam]');
      P.mo = new MutationObserver(() => {
        const r = root();
        if (!r) return;
        P.shown.push({ serial: Number(r.getAttribute('data-serial')), chord: r.getAttribute('data-chord'), band: r.getAttribute('data-band-chord'), bar: Number(r.getAttribute('data-bar')), t: audio.hasEngine() ? audio.audioSoundingNow() : 0, wall: performance.now() });
      });
      P.mo.observe(document.querySelector('main'), { attributes: true, subtree: true, attributeFilter: ['data-serial'] });
      window.__jam = P;
    });
    await page.locator('[data-play]').click();
    await page.evaluate(async () => {
      const P = window.__jam;
      for (let i = 0; i < 100 && !P.bandMod.currentBand(); i++) await new Promise((r) => setTimeout(r, 50));
      const band = P.bandMod.currentBand();
      if (band) {
        P.hooked = true;
        band.onChord((c) => P.heard.push({ symbol: c.segment.chord.symbol, time: c.time, bar: c.segment.bar }));
      }
    });
    const counted = await until(page, () => document.querySelector('[data-jam]')?.getAttribute('data-status') === 'count-in' || Number(document.querySelector('[data-jam]')?.getAttribute('data-serial')) > 0, null, 15000);
    check('Play starts the band (count-in first)', !!counted, await attr(page, '[data-jam]', 'data-status'));
    await page.waitForTimeout(quick ? 7000 : 11000);
    const r = await page.evaluate(() => {
      const P = window.__jam;
      return { hooked: P.hooked, heard: P.heard.slice(), shown: P.shown.slice() };
    });
    const shownChanges = r.shown.filter((s, i, all) => i === 0 || s.serial !== all[i - 1].serial);
    const sameChord = shownChanges.length > 0 && shownChanges.every((s) => s.chord === s.band);
    check('the band reports chord changes through onChord', r.hooked && r.heard.length >= 3, `${r.heard.length} changes: ${r.heard.map((h) => h.symbol).join(' ')}`);
    check('every change shows the chord the band plays', sameChord && shownChanges.length >= 3, shownChanges.map((s) => `${s.chord}/${s.band}`).join(' '));
    const order = shownChanges.map((s) => s.chord);
    const want = ['G', 'D', 'Em', 'C'];
    const inOrder = order.every((c, i) => c === want[(want.indexOf(order[0]) + i) % 4]);
    check('the shown chords follow the chart in order (G D Em C, looping)', inOrder && order.length >= 3, order.join(' '));
    // Timing: the display changes when the change is heard (onChord time on the audio clock).
    const lags = [];
    for (const s of shownChanges) {
      const h = r.heard.filter((x) => x.symbol === s.chord).reduce((best, x) => (!best || Math.abs(x.time - s.t) < Math.abs(best.time - s.t) ? x : best), null);
      if (h) lags.push(s.t - h.time);
    }
    const worst = lags.length ? Math.max(...lags.map((x) => Math.abs(x))) : Infinity;
    check('each chord shows within 0.15 s of the moment the band plays it', worst < 0.15, lags.map((x) => `${Math.round(x * 1000)}ms`).join(' '));
    const neck = await page.evaluate(() => {
      const r = document.querySelector('[data-jam]');
      const board = r.querySelector('[role="img"]');
      return { chord: r.getAttribute('data-chord'), label: board?.getAttribute('aria-label') ?? '', scale: r.getAttribute('data-scale') };
    });
    check('the neck names the chord that sounds and the scale to solo with', neck.label.includes(neck.chord.replace('b', '♭')) && neck.scale === 'G major-pentatonic', `${neck.label} · ${neck.scale}`);
    await page.getByRole('radio', { name: 'Follow the chords' }).click();
    const follow = await until(page, () => {
      const r = document.querySelector('[data-jam]');
      const c = r.getAttribute('data-chord');
      const s = r.getAttribute('data-scale');
      return s && s.split(' ')[0] === c.replace(/m$/, '') ? `${c}: ${s}` : null;
    }, null, 6000);
    check('"Follow the chords" puts each chord’s own scale on the neck', !!follow, follow ?? await attr(page, '[data-jam]', 'data-scale'));
    await shot(page, 'jam-playing-desktop-dark');
    // Focus leaves the scale chips (Space there belongs to the chip), as a click on the stage does.
    await page.locator('[data-now-chord]').click();
    await page.keyboard.press(' ');
    const paused = await until(page, () => document.querySelector('[data-jam]')?.getAttribute('data-status') === 'paused');
    check('Space pauses the band', !!paused);
    await page.keyboard.press(' ');
    const resumed = await until(page, () => document.querySelector('[data-jam]')?.getAttribute('data-status') === 'playing', null, 8000);
    check('Space plays on', !!resumed);
    if (!quick) {
      await page.waitForTimeout(12000);
      await page.getByRole('link', { name: 'Chart' }).click();
      await page.waitForSelector('[data-progressions="page"]', { timeout: 20000 });
      const logged = await until(page, async () => {
        const progress = await import('/src/core/progress/index.ts');
        const s = progress.getProgress();
        const e = s.log.find((x) => x.kind === 'progression');
        return e ? `${e.kind} ${e.title ?? ''} ${e.durationSec ?? e.sec ?? ''}` : null;
      }, null, 6000);
      check('a jam longer than 20 s is logged in the progress store on the way out', !!logged, logged);
    }
    // The builder from the keyboard
    await open(page, url, 'progressions--builder', '[data-progressions="builder"]');
    const slots = () => attr(page, '[data-progressions="builder"]', 'data-slots');
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.locator('h1').click();
    for (const k of ['1', '6', '4', '5']) await page.keyboard.press(k);
    check('number keys add the key’s chords (1 6 4 5 = I vi IV V)', (await slots()) === 'I vi IV V', await slots());
    await page.keyboard.press('Backspace');
    check('Backspace removes the last chord', (await slots()) === 'I vi IV', await slots());
    await page.keyboard.press('ArrowLeft');
    check('← transposes the draft down a half step', (await attr(page, '[data-progressions="builder"]', 'data-tonic')) === 'F#' || (await attr(page, '[data-progressions="builder"]', 'data-tonic')) === 'Gb', await attr(page, '[data-progressions="builder"]', 'data-tonic'));
    await page.keyboard.press('ArrowRight');
    await page.getByRole('switch', { name: 'More colours' }).check();
    const colours = await page.evaluate(() => ({
      borrowed: [...document.querySelectorAll('[data-palette="borrowed"] [data-add]')].map((b) => b.getAttribute('data-add')),
      secondary: [...document.querySelectorAll('[data-palette="secondary"] [data-add]')].map((b) => b.getAttribute('data-add')),
    }));
    check('"More colours" offers borrowed and secondary chords', colours.borrowed.includes('bVII') && colours.secondary.includes('V7/ii'), `${colours.borrowed.join(' ')} | ${colours.secondary.join(' ')}`);
    await page.locator('[data-add="V7/ii"]').click();
    await page.locator('[data-add="ii"]').click();
    const applied = await page.evaluate(() => [...document.querySelectorAll('[data-slot-index]')].map((b) => b.getAttribute('aria-label')).slice(-2).join(' / '));
    check('a secondary dominant resolves to its target (E7 → Am in G)', /E7/.test(applied) && /Am/.test(applied), applied);
    await shot(page, 'builder-desktop-colours', { fullPage: true });
    check('no console errors on desktop', errors.length === 0, errors.join(' | '));
  });
}

// ── Phone ────────────────────────────────────────────────────────────────────────────────────

async function phone() {
  await withApp({ mobile: true, theme: 'dark' }, async ({ page, url, errors, context }) => {
    await page.addInitScript(SEED);
    for (const hash of ['progressions', 'progressions--blues-12-bar', 'progressions--jazz-rhythm-changes--bb', 'progressions--builder', 'progressions--pop-axis--jam']) {
      await open(page, url, hash, '[data-progressions]');
      check(`phone ${hash}: no sideways scroll`, (await overflow(page)) <= 1, await overflow(page));
    }

    // Builder
    await open(page, url, 'progressions--builder', '[data-progressions="builder"]');
    const slots = () => attr(page, '[data-progressions="builder"]', 'data-slots');
    check('the builder opens with a starter loop already there', (await slots()) === 'I vi IV V', await slots());
    await page.getByRole('button', { name: 'Clear' }).click();
    check('Clear empties it (with an undo toast)', (await slots()) === '' && (await page.getByRole('button', { name: 'Undo' }).count()) > 0);
    await page.locator('[data-add="I"]').tap();
    await page.locator('[data-add="IV"]').tap();
    await page.locator('[data-add="V"]').tap();
    check('tapping chords adds them', (await slots()) === 'I IV V', await slots());
    const half = await page.evaluate(() => document.querySelector('[data-cadence-live]')?.textContent ?? '');
    check('a cadence is named as it forms (IV → V: half cadence)', /Half cadence/.test(half), half.slice(0, 80));
    const sug = await page.locator('[data-suggest]').first().getAttribute('data-suggest');
    check('the engine suggests I after V', sug === 'I', sug);
    await page.locator('[data-suggest="I"]').tap();
    await page.waitForTimeout(300);
    const auth = await page.evaluate(() => (document.querySelector('[data-cadence-live]')?.textContent ?? '').includes('Authentic cadence'));
    check('V → I is named an authentic cadence', auth);
    await page.locator('[data-slot-index="0"]').tap();
    await page.getByRole('radio', { name: '2 bars' }).tap();
    const bars = await page.evaluate(() => document.querySelector('[data-progressions="builder"] h2')?.parentElement?.parentElement?.textContent ?? '');
    check('a chord can last two bars (5 bars in all)', /5 bars/.test(bars), bars.slice(0, 80));
    await page.getByRole('button', { name: 'Done' }).tap();
    await page.getByRole('button', { name: /Transpose up a half step/ }).tap();
    check('transpose moves the key (G → A♭) and keeps the numerals', (await attr(page, '[data-progressions="builder"]', 'data-tonic')) === 'Ab' && (await slots()) === 'I IV V I');
    await page.locator('[data-play]').tap();
    const playingSlot = await until(page, () => Number(document.querySelector('[data-progressions="builder"]')?.getAttribute('data-playing-slot')) >= 0, null, 15000);
    check('Play: the band plays the draft and the sounding chord lights up', !!playingSlot);
    await page.locator('[data-play]').tap();
    await page.locator('[data-save]').tap();
    await page.getByRole('textbox', { name: 'Name' }).fill('Campfire cadence');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).tap();
    const savedId = await until(page, () => document.querySelector('[data-progressions="builder"]')?.getAttribute('data-saved-id') || null, null, 5000);
    check('saving with a name gives it an id', !!savedId, savedId);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ssa:progressions.saved') || '[]'));
    check('it is stored under its own key (progressions.saved)', stored.length === 1 && stored[0].name === 'Campfire cadence' && stored[0].tonic === 'Ab', JSON.stringify(stored[0] ?? {}).slice(0, 160));
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-progressions="builder"]', { timeout: 20000 });
    check('the draft survives a reload', (await slots()) === 'I IV V I' && (await attr(page, '[data-progressions="builder"]', 'data-saved-id')) === savedId);
    await open(page, url, 'progressions', '[data-progressions="browse"]');
    const yours = await page.evaluate(() => document.body.textContent.includes('Campfire cadence'));
    check('the saved progression shows under "Yours" in the browser', yours);
    await open(page, url, `progressions--builder--${savedId}`, '[data-progressions="builder"]');
    check('opening it from there loads it into the builder', (await page.evaluate(() => location.hash)) === '#progressions--builder' && (await slots()) === 'I IV V I');
    await shot(page, 'builder-phone-dark', { fullPage: true });

    // Jam on a phone
    await open(page, url, 'progressions--pop-axis--g--jam', '[data-jam]');
    const layout = await page.evaluate(() => {
      const big = document.querySelector('[data-now-chord]');
      const play = document.querySelector('[data-play]').getBoundingClientRect();
      return {
        immersive: document.querySelector('[data-immersive]')?.getAttribute('data-immersive'),
        font: parseFloat(getComputedStyle(big).fontSize),
        playY: play.top + play.height / 2,
        vh: window.innerHeight,
      };
    });
    check('the jam is immersive on a phone', layout.immersive === 'focus', layout.immersive);
    check('the chord name is big enough to read from a metre away (≥ 64 px)', layout.font >= 64, `${layout.font}px`);
    check('Play sits in the thumb zone', layout.playY > layout.vh * 0.6, `${Math.round(layout.playY)} of ${layout.vh}`);
    await page.locator('[data-play]').tap();
    await until(page, () => Number(document.querySelector('[data-jam]')?.getAttribute('data-serial')) >= 2, null, 15000);
    await shot(page, 'jam-playing-phone-dark');
    await page.locator('[data-play]').tap();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(800);
    const side = await page.evaluate(() => {
      const now = document.querySelector('[data-now-chord]').getBoundingClientRect();
      const board = document.querySelector('[data-jam] [role="img"]').getBoundingClientRect();
      const chart = document.querySelector('[data-jam] [data-chart]');
      return { sideBySide: board.left > now.right - 4 && Math.abs(board.top - now.top) < 160, chartHidden: !chart || chart.getBoundingClientRect().height === 0 };
    });
    check('held sideways: chord and neck side by side, chart out of the way', side.sideBySide && side.chartHidden, JSON.stringify(side));
    check('no sideways scroll when held sideways', (await overflow(page)) <= 1);
    await shot(page, 'jam-sideways-phone-dark');
    void context;
    check('no console errors on the phone', errors.length === 0, errors.join(' | '));
  });
}

// ── Screenshots in both themes ───────────────────────────────────────────────────────────────

async function themes() {
  for (const theme of ['light', 'dark']) {
    for (const mobile of [false, true]) {
      await withApp({ mobile, size: mobile ? undefined : 'desktop', theme }, async ({ page, url, errors }) => {
        await page.addInitScript(SEED);
        const tag = `${mobile ? 'phone' : 'desktop'}-${theme}`;
        await open(page, url, 'progressions', '[data-progressions="browse"]');
        await shot(page, `browse-${tag}`);
        await open(page, url, 'progressions--blues-quick-change--a', '[data-progressions="page"]');
        await shot(page, `page-${tag}`, { fullPage: true });
        await open(page, url, 'progressions--blues-quick-change--a--jam', '[data-jam]');
        await page.locator('[data-play]').click();
        await until(page, () => Number(document.querySelector('[data-jam]')?.getAttribute('data-serial')) >= 2, null, 15000);
        await shot(page, `jam-${tag}`);
        await page.locator('[data-play]').click();
        await open(page, url, 'progressions--builder', '[data-progressions="builder"]');
        await shot(page, `builder-${tag}`);
        check(`screenshots ${tag} without console errors`, errors.length === 0, errors.join(' | '));
      });
    }
  }
}

(async () => {
  try {
    if (!only || only === 'desktop') await desktop();
    if (!only || only === 'phone') await phone();
    if (!only || only === 'themes') await themes();
  } catch (e) {
    check('the run finished', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : String(e));
  }
  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  console.log(failed ? 'FAILED' : 'PASSED');
  process.exit(failed ? 1 : 0);
})();
