#!/usr/bin/env node
/**
 * Browser check of Progressions (#progressions). Run: node e2e/progressions.cjs [--quick] [--only desktop|phone|sync|address|themes]
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
 *  sync     independent of the band's reports: the app's real audio output is recorded, each bass
 *           root found by onset and pitch, and the big chord name must change 0–60 ms after it
 *  address  a lesson's jam link sets tempo, style and times through (`--t72--ballad--x2`); the
 *           tempo hint never calls a slower tempo wrong; `--hide-chart` hides every chord name
 *           (big chord, next, chart, title) until "Show the chords"; a new learner gets plain
 *           words (no roman numerals, "E minor with D♯" for harmonic minor), an intermediate one
 *           the numerals
 *  themes   screenshots of browse, a page, the jam (playing) and the builder, phone and desktop,
 *           light and dark (e2e/out/progressions-*.png)
 *
 * Added in review, for bugs it found: shelves fill their rows; no chart chord name is cut short
 * (desktop and 360 px); a three-letter chord shows whole in the jam at 390 px; Space pauses with
 * focus on the scale chip just chosen; saving is not logged as a jam; time played in the builder
 * is, and survives a reload.
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
/** Chart chord names or numerals cut short (an ellipsis): found in review as "Edi…" for Edim7. */
const cutChartNames = (page) => page.evaluate(() => [...document.querySelectorAll('[data-chart] [data-slot] span')]
  .filter((s) => s.scrollWidth > s.clientWidth + 1)
  .map((s) => `${s.closest('[data-slot]').getAttribute('data-slot')} ${s.textContent}`));
const attr = (page, sel, name) => page.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [sel, name]);

// ── Desktop ──────────────────────────────────────────────────────────────────────────────────

async function desktop() {
  await withApp({ size: 'desktop', theme: 'dark' }, async ({ page, url, errors }) => {
    await page.addInitScript(SEED);

    // Browse
    await open(page, url, 'progressions', '[data-progressions="browse"]');
    const cards = await page.locator('[data-progression-card]').count();
    check('browse opens with style shelves of cards', cards >= 30, `${cards} cards`);
    // Found in review: 4 cards on a 3-column shelf left one card alone on every shelf at 1280 px.
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-shelf]')].map((s) => {
      const grid = s.firstElementChild;
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      const shown = [...grid.children].filter((c) => getComputedStyle(c).display !== 'none').length;
      return { id: s.getAttribute('data-shelf'), cols, shown };
    }));
    check('every shelf fills its rows (no card left alone)', rows.length >= 10 && rows.every((r) => r.shown % r.cols === 0 && r.shown >= 4), rows.map((r) => `${r.id} ${r.shown}/${r.cols}`).join(' '));
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
      const cut = await cutChartNames(page);
      check(`${id}: every chord name in the chart is whole`, cut.length === 0, cut.join(', '));
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
    // Found in review: focus stays on the scale chip just clicked, and Space there re-selected
    // the chip instead of pausing. Space on the chip already chosen is play / pause again.
    const onChip = await page.evaluate(() => document.activeElement?.getAttribute('role') === 'radio' && document.activeElement?.getAttribute('aria-checked') === 'true');
    await page.keyboard.press(' ');
    const paused = await until(page, () => document.querySelector('[data-jam]')?.getAttribute('data-status') === 'paused');
    check('Space pauses the band, even with focus on the scale chip just chosen', !!paused && onChip, `focus on chip: ${onChip}`);
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
    // Found in review: on a phone, two chords in a bar were cut to "B…", "E…" (rhythm changes, Bird blues).
    await page.setViewportSize({ width: 360, height: 740 });
    for (const hash of ['progressions--jazz-rhythm-changes--bb', 'progressions--blues-bird--f', 'progressions--blues-bird--f--jam']) {
      await open(page, url, hash, '[data-chart]');
      const cut = await cutChartNames(page);
      check(`360 px ${hash}: every chord name in the chart is whole`, cut.length === 0, cut.join(', '));
    }
    await page.setViewportSize({ width: 390, height: 844 });

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
    // Play along for a while: time played in the builder is a jam too (found in review: it was never logged).
    await page.waitForTimeout(21000);
    await page.locator('[data-play]').tap();
    const progressNow = () => page.evaluate(async () => {
      const progress = await import('/src/core/progress/index.ts');
      const s = progress.getProgress();
      return { xp: s.xp.total, jams: s.log.filter((e) => e.kind === 'progression').map((e) => `${e.title} ${e.durationSec ?? e.sec ?? ''}`) };
    });
    const before = await progressNow();
    await page.locator('[data-save]').tap();
    await page.getByRole('textbox', { name: 'Name' }).fill('Campfire cadence');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).tap();
    const savedId = await until(page, () => document.querySelector('[data-progressions="builder"]')?.getAttribute('data-saved-id') || null, null, 5000);
    check('saving with a name gives it an id', !!savedId, savedId);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ssa:progressions.saved') || '[]'));
    check('it is stored under its own key (progressions.saved)', stored.length === 1 && stored[0].name === 'Campfire cadence' && stored[0].tonic === 'Ab', JSON.stringify(stored[0] ?? {}).slice(0, 160));
    // Found in review: saving was logged as a jam (the "Jam Session" achievement and the daily
    // jam quest without a note played). Saving now earns a small bonus and is no jam.
    const after = await progressNow();
    check('saving earns a few XP but is not logged as a jam', after.xp - before.xp >= 5 && after.jams.length === before.jams.length, `xp ${before.xp} → ${after.xp}, jams ${after.jams.length}`);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-progressions="builder"]', { timeout: 20000 });
    check('the draft survives a reload', (await slots()) === 'I IV V I' && (await attr(page, '[data-progressions="builder"]', 'data-saved-id')) === savedId);
    const jams = (await progressNow()).jams;
    check('the 20 s played along in the builder were logged as a jam, and kept through the reload', jams.length === 1 && /^Jam: /.test(jams[0]), jams.join(' | '));
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
    // Found in review: at 390 px "Dm7" showed as "D…" (the size only followed the screen width).
    await open(page, url, 'progressions--jazz-ii-v-i--c--jam', '[data-jam]');
    await page.locator('[data-play]').tap();
    await until(page, () => Number(document.querySelector('[data-jam]')?.getAttribute('data-serial')) >= 1, null, 15000);
    const fit = await page.evaluate(() => ['[data-now-chord]', '[data-next-chord]'].map((s) => {
      const e = document.querySelector(s);
      return e ? { text: e.textContent, fits: e.scrollWidth <= e.clientWidth + 1, px: parseFloat(getComputedStyle(e).fontSize) } : null;
    }));
    check('a three-letter chord (Dm7) and the next one show whole, and still big', fit.every((f) => f && f.fits) && fit[0].px >= 56, JSON.stringify(fit));
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

// ── The display against the real output ──────────────────────────────────────────────────────

/**
 * Independent of the band's own reports: record what the app actually sends to the speakers (an
 * AudioWorklet on the engine's final node), find each bass note's onset and pitch by
 * autocorrelation, and compare the moment each new root is heard with the moment the big chord
 * name changes on screen (on the audio clock, latency included). Only the bass plays, so its root
 * on the downbeat marks the change.
 */
async function sync() {
  await withApp({ size: 'desktop', theme: 'dark' }, async ({ page, url, errors }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
      localStorage.setItem('ssa:progressions.jam', JSON.stringify({ countIn: 1, loop: true, choruses: 2, muted: { drums: true, bass: false, keys: true, guitar: true }, scale: 'tip-0' }));
    });
    await open(page, url, 'progressions--pop-axis--g--jam', '[data-jam]');
    await page.locator('[data-play]').click();
    await page.evaluate(async () => {
      const audio = await import('/src/core/audio/index.ts');
      for (let i = 0; i < 100 && !audio.hasEngine(); i++) await new Promise((r) => setTimeout(r, 20));
      const ctx = audio.getAudioContext();
      const src = `class Rec extends AudioWorkletProcessor {
        constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; this.f0 = 0; }
        process(inputs) {
          const ch = (inputs[0] && inputs[0][0]) || new Float32Array(128);
          if (this.n === 0) this.f0 = currentFrame;
          this.buf.set(ch, this.n); this.n += ch.length;
          if (this.n >= 2048) { this.port.postMessage({ frame: this.f0, data: this.buf.slice(0) }); this.n = 0; }
          return true;
        }
      }
      registerProcessor('progressions-rec', Rec);`;
      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
      const node = new AudioWorkletNode(ctx, 'progressions-rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
      const sink = ctx.createGain();
      sink.gain.value = 0;
      audio.getEngine().output.connect(node);
      node.connect(sink).connect(ctx.destination);
      const R = { chunks: [], shown: [], sr: ctx.sampleRate };
      node.port.onmessage = (e) => R.chunks.push(e.data);
      const jam = document.querySelector('[data-jam]');
      let last = '';
      new MutationObserver(() => {
        const text = jam.querySelector('[data-now-chord]')?.textContent ?? '';
        if (text === last) return;
        last = text;
        R.shown.push({ chord: jam.getAttribute('data-chord'), status: jam.getAttribute('data-status'), t: audio.audioSoundingNow() });
      }).observe(jam, { subtree: true, childList: true, characterData: true });
      window.__sync = R;
    });
    await page.waitForTimeout(quick ? 10000 : 14000);
    const r = await page.evaluate(() => {
      const R = window.__sync;
      if (!R.chunks.length) return { notes: [], shown: R.shown };
      const f0 = R.chunks[0].frame;
      const end = R.chunks[R.chunks.length - 1];
      const x = new Float32Array(end.frame + end.data.length - f0);
      for (const c of R.chunks) x.set(c.data, c.frame - f0);
      const sr = R.sr, hop = 256, env = [];
      for (let i = 0; i + hop <= x.length; i += hop) {
        let s = 0;
        for (let j = 0; j < hop; j++) s += x[i + j] * x[i + j];
        env.push(Math.sqrt(s / hop));
      }
      const peak = Math.max(...env);
      const notes = [];
      let lastOnset = -99;
      for (let i = 8; i < env.length; i++) {
        let prev = 0;
        for (let k = 1; k <= 6; k++) prev += env[i - k];
        prev /= 6;
        if (!(env[i] > peak * 0.06 && env[i] > prev * 1.8 && i - lastOnset > 12)) continue;
        lastOnset = i;
        // Autocorrelation 30 ms after the onset, 60 ms long, 35–400 Hz.
        const start = i * hop + Math.floor(sr * 0.03), n = Math.floor(sr * 0.06);
        if (start + n + Math.ceil(sr / 35) >= x.length) continue;
        let best = 0, lagBest = 0;
        for (let lag = Math.floor(sr / 400); lag <= Math.ceil(sr / 35); lag++) {
          let s = 0, e1 = 0, e2 = 0;
          for (let j = 0; j < n; j++) { const a = x[start + j], b = x[start + j + lag]; s += a * b; e1 += a * a; e2 += b * b; }
          const c = s / Math.sqrt(e1 * e2 + 1e-12);
          if (c > best) { best = c; lagBest = lag; }
        }
        if (best >= 0.6) notes.push({ t: (f0 + i * hop) / sr, pc: (((Math.round(12 * Math.log2(sr / lagBest / 440) + 69)) % 12) + 12) % 12 });
      }
      return { notes, shown: R.shown };
    });
    const ROOT = { G: 7, D: 2, Em: 4, C: 0 };
    const lags = [];
    const missing = [];
    for (const s of r.shown) {
      if (s.status === 'count-in' || ROOT[s.chord] === undefined) continue;
      // The nearest note of the new root, then back to the first of its run: the arrival.
      let k = -1;
      r.notes.forEach((n, i) => {
        if (n.pc === ROOT[s.chord] && Math.abs(n.t - s.t) < 0.6 && (k < 0 || Math.abs(n.t - s.t) < Math.abs(r.notes[k].t - s.t))) k = i;
      });
      if (k < 0) { missing.push(s.chord); continue; }
      while (k > 0 && r.notes[k - 1].pc === r.notes[k].pc && r.notes[k].t - r.notes[k - 1].t < 0.6) k--;
      lags.push({ chord: s.chord, ms: Math.round((s.t - r.notes[k].t) * 1000) });
    }
    check('the recorded output has a bass note on each new root the screen shows', lags.length >= 4 && missing.length === 0, `${r.notes.length} bass notes; missing: ${missing.join(' ') || 'none'}`);
    check('each chord name changes within 60 ms after its root is heard, never before it', lags.length >= 4 && lags.every((l) => l.ms >= -10 && l.ms <= 60), lags.map((l) => `${l.chord} ${l.ms}ms`).join(', '));
    check('no console errors while recording', errors.length === 0, errors.join(' | '));
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

// ── Addresses, chords by ear, plain words ────────────────────────────────────────────────────

const NUMERAL = /(^|[\s(–·-])[b♭#♯]?(?:iii|ii|iv|vii|vi|v|i|III|II|IV|VII|VI|V|I)(?:°|ø|\+|maj|m|\d)*(?=$|[\s)–·\-/,:.])/;

async function address() {
  await withApp({ size: 'desktop', theme: 'dark' }, async ({ page, url, errors }) => {
    await page.addInitScript(SEED);
    // A fresh profile is a beginner: plain words. A lesson's link sets the band up.
    await open(page, url, 'progressions--classical-minor-cadence--e--jam--t72--ballad--x2', '[data-jam]');
    await page.waitForTimeout(400);
    check('address: tempo 72 and the ballad style', (await attr(page, '[data-jam]', 'data-tempo')) === '72' && (await attr(page, '[data-jam]', 'data-style')) === 'ballad',
      `${await attr(page, '[data-jam]', 'data-tempo')} ${await attr(page, '[data-jam]', 'data-style')}`);
    const stored = await page.evaluate(() => ({ jam: JSON.parse(localStorage.getItem('ssa:progressions.jam') || '{}'), memory: JSON.parse(localStorage.getItem('ssa:progressions.memory') || '{}') }));
    check('address: the tempo is remembered for this progression, like a choice by hand', stored.memory['classical-minor-cadence']?.tempo === 72, JSON.stringify(stored));
    // `x2` is for this visit: the band sheet shows two times through, and nothing is stored, so a
    // later jam without it still loops (review: it used to turn looping off for every jam after).
    const bandSheet = async () => {
      await page.getByRole('button', { name: 'Band', exact: true }).click();
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      const out = await page.evaluate(() => {
        const sw = document.querySelector('[role="dialog"] [data-loop] input, [role="dialog"] input[data-loop], [role="dialog"] [data-loop]');
        const input = sw && (sw.matches('input') ? sw : sw.querySelector('input,[role="switch"]'));
        const loopOn = input ? (input.getAttribute('aria-checked') ?? String(input.checked)) === 'true' : null;
        const times = [...document.querySelectorAll('[role="dialog"] input[role="spinbutton"]')].find((i) => /times through/i.test(document.getElementById(i.getAttribute('aria-labelledby') || '')?.textContent || ''));
        const text = document.querySelector('[role="dialog"]').textContent;
        const order = ['Loop until I stop', 'Times through', 'Hide the chord names'].map((t) => text.indexOf(t));
        return { loopOn, times: times ? times.value : null, order };
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      return out;
    };
    const twice = await bandSheet();
    check('address: x2 plays two times through (Loop off, Times through 2)', twice.loopOn === false && twice.times === '2', JSON.stringify(twice));
    // Times through sits right under the Loop switch it belongs to (the hide switch used to sit between).
    check('band sheet: Loop, then Times through, then Hide the chord names', twice.order[0] >= 0 && twice.order[0] < twice.order[1] && twice.order[1] < twice.order[2], JSON.stringify(twice.order));
    check('address: x2 is not stored as the learner’s loop setting', stored.jam.loop !== false, JSON.stringify(stored.jam));
    await open(page, url, 'progressions--pop-axis--g--jam', '[data-jam]');
    await page.waitForTimeout(400);
    const later = await bandSheet();
    check('address: a later jam without x2 still loops', later.loopOn === true, JSON.stringify(later));
    await open(page, url, 'progressions--classical-minor-cadence--e--jam--t72--ballad--x2', '[data-jam]');
    await page.waitForTimeout(400);
    check('address: kept in the address after the key is read', (await page.evaluate(() => location.hash)) === '#progressions--classical-minor-cadence--e--jam--t72--ballad--x2', await page.evaluate(() => location.hash));

    check('plain words: on for a new learner', (await attr(page, '[data-jam]', 'data-plain')) === 'true');
    const title = await page.textContent('[data-jam-title]');
    check('plain words: the title has no roman numerals', title === 'Minor cadence', title);
    // The heading a screen reader hears says the same (it used to read "Minor cadence (i–iv–V7–i)").
    const h1 = await page.textContent('main h1');
    check('plain words: the screen-reader heading has no roman numerals either', h1 === 'Minor cadence', h1);
    const role = (await page.textContent('[data-now-role]')) || '';
    check('plain words: the first chord is called the home chord, not i', role.trim() === 'Home chord', role);
    const chart = (await page.textContent('[data-chart]')) || '';
    check('plain words: the chart shows chords without numerals', !NUMERAL.test(chart.replace(/[A-G][♯♭]?(?:m|7|maj7|dim|sus\d)*/g, ' ')) && /Em/.test(chart), chart);
    const chips = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Scale to solo with"] [role="radio"], [aria-label="Scale to solo with"] button')].map((b) => b.textContent.trim()));
    check('plain words: no "Harmonic minor"; E minor with D♯ instead', chips.length > 0 && !chips.some((c) => /harmonic/i.test(c)) && chips.some((c) => c === 'E minor with D♯'), chips.join(' | '));
    const hint = (await page.textContent('[data-scale-hint]')) || '';
    check('plain words: the scale hint has no "harmonic"', !/harmonic/i.test(hint), hint);

    // The tempo hint never says a slower tempo asked for by a lesson is wrong.
    await open(page, url, 'progressions--minor-i-bvi-bvii--a--jam--t72', '[data-jam]');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Band', exact: true }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    const sheet = (await page.textContent('[role="dialog"]')) || '';
    check('tempo hint: below the usual range is "how you learn it", never "sits best"', /Usually 90 to 140 BPM\. Slower is how you learn it/.test(sheet) && !/sits best/.test(sheet), sheet.slice(0, 400));
    await page.keyboard.press('Escape');
    // Closing a sheet steps history back a moment later (src/ui/API.md): let that land before the
    // next address, or it undoes the navigation and the old jam stays on screen.
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(800);

    // Chords by ear: names hidden until the learner shows them.
    await open(page, url, 'progressions--pop-axis--g--jam--hide-chart', '[data-jam]');
    await page.waitForTimeout(400);
    const hiddenState = await page.evaluate(() => ({
      hidden: document.querySelector('[data-jam]').getAttribute('data-hidden'),
      big: document.querySelector('[data-now-chord]').textContent,
      next: document.querySelector('[data-next-chord]')?.textContent,
      chart: document.querySelector('[data-chart]').textContent,
      masked: document.querySelector('[data-chart]').getAttribute('data-masked'),
      title: document.querySelector('[data-jam-title]').textContent,
      role: document.querySelector('[data-now-role]').textContent,
      h1: document.querySelector('main h1').textContent,
    }));
    check('hide-chart: the screen-reader heading does not give the chords away', hiddenState.h1 === 'Chords by ear', hiddenState.h1);
    check('hide-chart: every chord name hidden', hiddenState.hidden === 'true' && hiddenState.big === '?' && hiddenState.next === '?' && hiddenState.masked === 'true' && !/[A-G]/.test(hiddenState.chart) && hiddenState.title === 'Chords by ear', JSON.stringify(hiddenState));
    check('hide-chart: the bar number instead of the chord', /^Bar 1 of 4$/.test(hiddenState.role.trim()), hiddenState.role);
    await page.locator('[data-play]').click();
    await until(page, () => Number(document.querySelector('[data-jam]')?.getAttribute('data-serial')) >= 2, null, 20000);
    const playing = await page.evaluate(() => ({ big: document.querySelector('[data-now-chord]').textContent, band: document.querySelector('[data-jam]').getAttribute('data-band-chord') }));
    check('hide-chart: still hidden while the band plays', playing.big === '?' && !!playing.band, JSON.stringify(playing));
    await page.locator('[data-play]').click();
    await page.locator('[data-reveal]').click();
    await page.waitForTimeout(300);
    const shown = await page.evaluate(() => ({ hidden: document.querySelector('[data-jam]').getAttribute('data-hidden'), chart: document.querySelector('[data-chart]').textContent, big: document.querySelector('[data-now-chord]').textContent }));
    check('hide-chart: "Show the chords" reveals them', shown.hidden === 'false' && /G/.test(shown.chart) && /D/.test(shown.chart) && shown.big !== '?', JSON.stringify(shown));

    // A learner past the beginner course sees the numerals and the real scale names.
    await page.evaluate(async () => (await import('/src/core/progress/index.ts')).setProfile({ experience: 'intermediate' }));
    await open(page, url, 'progressions--classical-minor-cadence--e--jam', '[data-jam]');
    await page.waitForTimeout(400);
    const expert = await page.evaluate(() => ({
      plain: document.querySelector('[data-jam]').getAttribute('data-plain'),
      role: document.querySelector('[data-now-role]').textContent,
      chips: [...document.querySelectorAll('[aria-label="Scale to solo with"] [role="radio"], [aria-label="Scale to solo with"] button')].map((b) => b.textContent.trim()),
    }));
    check('intermediate learner: numerals and scale names as before', expert.plain === 'false' && expert.role.trim() === 'i' && expert.chips.some((c) => /harmonic minor/i.test(c)), JSON.stringify(expert));
    check('address checks without console errors', errors.length === 0, errors.join(' | '));
  });
}

(async () => {
  try {
    if (!only || only === 'desktop') await desktop();
    if (!only || only === 'phone') await phone();
    if (!only || only === 'sync') await sync();
    if (!only || only === 'address') await address();
    if (!only || only === 'themes') await themes();
  } catch (e) {
    check('the run finished', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : String(e));
  }
  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  console.log(failed ? 'FAILED' : 'PASSED');
  process.exit(failed ? 1 : 0);
})();
