#!/usr/bin/env node
/**
 * Browser check of the Scales explorer (#scales). Run: node e2e/scales.cjs [--quick]
 *
 * Everything is driven through the screen (clicks, keys, the sheets), the way a learner would.
 *
 *  desktop  deep links (root + scale, + shape, the one-piece slug, a bad address, bare #scales)
 *           open the right scale and shape; F♯ major is spelled with E♯; prev / next and the arrow
 *           keys move the shape and the root and rewrite the address; Play sounds the shape and the
 *           lit dot follows what is heard: every note the player handed to the engine is found in the
 *           engine's real output (recorded after the limiter), and the lit dot changed within a frame
 *           or two of each note's audio time; Space stops it and the light goes out; tapping a dot
 *           plays it and names it; Connect, Compare (minor pentatonic against the blues scale), the
 *           picker's search, marking a shape learnt (a crown in core/progress), a capo (frets count
 *           from the capo, notes stay spelled) and left-handed (the drawing mirrors); screenshots in
 *           both themes
 *  phone    no sideways page scroll; the neck scrolls inside its own frame and centres the shape,
 *           and moves when the shape changes; Play sits in the thumb zone; the picker opens as a
 *           sheet and Esc closes it; a phone on its side shows more frets; screenshots in both themes
 *
 * Prints one line per check, PASSED or FAILED at the end, and exits non-zero on failure.
 * Timing limits are generous: the machine is shared and busy.
 */
const path = require('node:path');
const fs = require('node:fs');
const { withApp, ROOT } = require('./lib/harness.cjs');
const { installPageTools, printChecks } = require('./audio-lib.cjs');

const quick = process.argv.includes('--quick');
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, `scales-${name}.png`), ...opts });

/** What the screen says about itself (the root mirrors its state in data attributes). */
const state = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-scales]');
    if (!el) return null;
    return {
      scale: el.dataset.scale,
      tonic: el.dataset.tonic,
      shape: el.dataset.shape,
      view: el.dataset.view,
      playing: el.dataset.playing === 'true',
      step: Number(el.dataset.step),
      lit: el.dataset.lit,
      layout: el.dataset.layout,
      title: document.querySelector('h1')?.textContent ?? '',
      hash: location.hash,
    };
  });

async function open(page, goto, hash) {
  await goto('scales', ...hash.split('--').filter(Boolean));
  await page.waitForSelector('[data-scales]', { timeout: 20000 });
  await page.waitForTimeout(400);
}

/** Wait until the screen's state satisfies `fn` (polling), or time out and return the last state. */
async function waitState(page, fn, timeout = 8000) {
  const end = Date.now() + timeout;
  let s = await state(page);
  while (Date.now() < end) {
    if (s && fn(s)) return s;
    await page.waitForTimeout(100);
    s = await state(page);
  }
  return s;
}

/**
 * Counts which function components React renders while `window.__renders.on` is true, through a
 * minimal DevTools hook (installed before the app loads). After each commit it walks the fibers React
 * worked on: a component rendered when its fiber has PerformedWork (flag 1); a subtree React did not
 * visit keeps its old child pointer and is skipped. Used to prove a heard note re-renders the neck,
 * not the whole page (that made a slow phone skip lit notes at fast tempos).
 */
function renderProbe() {
  const counts = new Map();
  window.__renders = { counts, on: false };
  const nameOf = (t) => {
    if (!t) return null;
    if (typeof t === 'function') return t.displayName || t.name || null;
    if (t.render) return t.render.displayName || t.render.name || null;
    return t.type ? nameOf(t.type) : null;
  };
  const walk = (fiber) => {
    for (let f = fiber; f; f = f.sibling) {
      if ([0, 11, 14, 15].includes(f.tag) && f.flags & 1 && window.__renders.on) {
        const n = nameOf(f.type);
        if (n) counts.set(n, (counts.get(n) || 0) + 1);
      }
      if (f.child && !(f.alternate && f.alternate.child === f.child)) walk(f.child);
    }
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(r) { this.renderers.set(this.renderers.size + 1, r); return this.renderers.size; },
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id, root) { try { walk(root.current.child); } catch { /* never break the app */ } },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
}
/** Sections and controls that must not re-render because a note was heard. */
const STILL_WHILE_PLAYING = ['HearPanel', 'PracticePanel', 'ComparePanel', 'FormulaSection', 'IntervalsSection', 'ChordsSection', 'RelativesSection', 'MoodSection', 'StaffSection', 'ShapePicker', 'NeckOptions', 'ScalePicker', 'PickerBody', 'ChipGroup', 'SegmentedControl', 'CellLayer'];

/** Cell button of a position (frets counted from the capo, as the board labels them). */
const cell = (page, string, fret) => page.locator(`[data-neck] button[aria-label^="string ${string}, ${fret === 0 ? 'open' : `fret ${fret},`}"]`).first();

async function desktop(theme) {
  await withApp({ size: 'desktop', theme }, async ({ page, goto, errors }) => {
    await installPageTools(page);
    await page.addInitScript(renderProbe);
    const dark = theme === 'dark';

    // ── deep links ───────────────────────────────────────────────────────────────────────
    await open(page, goto, 'a--minor-pentatonic');
    let s = await state(page);
    if (dark) {
      check('a deep link opens A minor pentatonic, box 1 chosen', s && s.scale === 'minor-pentatonic' && s.tonic === 'A' && s.shape === 'box-1' && /A minor pentatonic/.test(s.title), JSON.stringify(s));
      check('two columns of details on a 1280 px screen', s.layout === 'two-columns', s.layout);
      const playBox = await page.locator('[data-play]').first().boundingBox();
      check('Play is visible without scrolling', playBox && playBox.y + playBox.height <= 800 && playBox.y >= 0, JSON.stringify(playBox));
      const labels = await page.locator('[data-neck] svg').first().evaluate((svg) => [...svg.querySelectorAll('[data-state] text')].map((t) => t.textContent));
      check('the shape is drawn with its notes (A C D E G only)', ['A', 'C', 'D', 'E', 'G'].every((n) => labels.includes(n)) && !labels.some((l) => ['B', 'F', 'F♯', 'B♭'].includes(l)), labels.join(' '));
      await shot(page, 'desktop-dark');

      await open(page, goto, 'a--minor-pentatonic--box-2');
      s = await state(page);
      check('a shape in the address opens that shape', s.shape === 'box-2', JSON.stringify(s));

      await open(page, goto, 'a-minor-pentatonic--box-3');
      s = await state(page);
      check('the one-piece scale slug works too', s.scale === 'minor-pentatonic' && s.tonic === 'A' && s.shape === 'box-3', JSON.stringify(s));

      await open(page, goto, 'f-sharp--major');
      s = await state(page);
      const formula = await page.locator('ol[aria-label^="Notes of the scale"]').innerText();
      check('F♯ major opens on CAGED shapes and is spelled with E♯, not F', s.title.includes('F♯ major') && /E♯/.test(formula) && !/\bF\b(?!♯)/.test(formula.replace(/F♯/g, '')) && s.shape.startsWith('caged-'), `${s.title} | ${formula.replace(/\s+/g, ' ')}`);

      await open(page, goto, 'c--major--3nps-4');
      s = await state(page);
      check('a 3-notes-per-string shape opens from its address', s.shape === '3nps-4' && s.scale === 'major', JSON.stringify(s));

      await open(page, goto, 'h--nonsense');
      s = await waitState(page, (x) => x.hash.startsWith('#scales--c--major'));
      check('an address that names no scale falls back to the last scale and rewrites the address', s.hash.startsWith('#scales--c--major') && s.scale === 'major', s.hash);

      await open(page, goto, '');
      s = await waitState(page, (x) => x.hash !== '#scales');
      check('bare #scales reopens the last scale', s.scale === 'major' && s.hash.startsWith('#scales--c--major'), s.hash);

      // Review: a shape id the scale does not have used to leave "No shape" and a disabled Play
      // (3nps-9 on a pentatonic), or show one shape while the address named another.
      await open(page, goto, 'a--minor-pentatonic--3nps-9');
      s = await waitState(page, (x) => x.hash === '#scales--a--minor-pentatonic--box-1');
      const playOk = await page.locator('[data-play]').first().isEnabled();
      check('a shape the scale does not have opens a real shape instead (Play works) and the address names it', s.shape === 'box-1' && s.hash === '#scales--a--minor-pentatonic--box-1' && playOk, `${s.hash} shape=${s.shape} play enabled=${playOk}`);
      await open(page, goto, 'a--major--box-9');
      s = await waitState(page, (x) => x.hash !== '#scales--a--major--box-9');
      const boxChip = await page.getByRole('radio', { name: 'Boxes' }).count();
      check('a pentatonic box id on the major scale falls back to its own shapes (no stray "Boxes")', s.shape.startsWith('caged-') && s.hash === `#scales--a--major--${s.shape}` && boxChip === 0, `${s.hash} Boxes chips: ${boxChip}`);

      // ── every scale in the catalog opens (on a black-key root, to stress spelling) ──────
      const sweep = await page.evaluate(async () => {
        const theory = await import('/src/core/theory/index.ts');
        const bad = [];
        let opened = 0;
        for (const s of theory.SCALES) {
          const tonic = theory.simplestTonic(theory.chroma('F#'), s.id);
          location.hash = `#scales--${theory.noteSlug(tonic)}--${s.id}`;
          const start = performance.now();
          let el = null;
          while (performance.now() - start < 5000) {
            el = document.querySelector('[data-scales]');
            if (el && el.dataset.scale === s.id && el.dataset.tonic === tonic) break;
            await new Promise((r) => setTimeout(r, 30));
          }
          if (!el || el.dataset.scale !== s.id) bad.push(`${s.id}: did not open`);
          else if (!el.dataset.shape) bad.push(`${s.id}: no shape`);
          else if (document.querySelectorAll('[data-neck] [data-state]').length < s.size) bad.push(`${s.id}: too few dots`);
          else opened++;
        }
        return { opened, bad, total: theory.SCALES.length };
      });
      await page.waitForTimeout(500);
      check('every scale in the catalog opens on F♯/G♭ with a shape on the neck and no error', sweep.opened === sweep.total && errors.length === 0, `${sweep.opened}/${sweep.total} ${sweep.bad.slice(0, 4).join('; ')} ${errors.slice(0, 2).join(' | ')}`);

      // ── moving around ──────────────────────────────────────────────────────────────────
      await open(page, goto, 'a--minor-pentatonic--box-1');
      await page.getByRole('button', { name: 'Next shape' }).first().click();
      s = await waitState(page, (x) => x.shape === 'box-2');
      check('Next shape moves to box 2 and writes it in the address', s.shape === 'box-2' && s.hash === '#scales--a--minor-pentatonic--box-2', s.hash);
      await page.locator('h1').click();
      await page.keyboard.press('ArrowRight');
      s = await waitState(page, (x) => x.shape === 'box-3');
      check('→ moves to the next shape', s.shape === 'box-3', s.shape);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      s = await waitState(page, (x) => x.shape === 'box-1');
      check('← moves back', s.shape === 'box-1', s.shape);
      await page.keyboard.press('ArrowUp');
      s = await waitState(page, (x) => x.tonic === 'Bb');
      check('↑ raises the root a semitone, spelled B♭ (not A♯), keeping the shape', s.tonic === 'Bb' && s.shape === 'box-1' && s.title.includes('B♭'), `${s.tonic} ${s.title}`);
      await page.keyboard.press('ArrowDown');
      s = await waitState(page, (x) => x.tonic === 'A');
      check('↓ lowers it again', s.tonic === 'A', s.tonic);

      // ── play: the lit dot follows the sound ────────────────────────────────────────────
      await page.getByRole('radio', { name: 'Nothing' }).click();
      const probe = await page.evaluate(async () => {
        const audio = await import('/src/core/audio/index.ts');
        const players = await import('/src/features/scales/audio/player.ts');
        const P = { audio, notes: [], shown: [], rec: null };
        const p = players.currentPlayer();
        if (!p) return false;
        p.onNote((n) => P.notes.push(n));
        const root = document.querySelector('[data-scales]');
        P.mo = new MutationObserver(() => {
          const step = Number(root.getAttribute('data-step'));
          if (audio.hasEngine()) P.shown.push({ step, lit: root.getAttribute('data-lit'), t: audio.audioSoundingNow(), targets: document.querySelectorAll('[data-neck] [data-state="target"]').length });
        });
        P.mo.observe(root, { attributes: true, attributeFilter: ['data-step'] });
        window.__scalesProbe = P;
        return true;
      });
      check('the screen has a player the check can listen to', probe);
      await page.locator('[data-play]').first().click();
      await page.evaluate(async () => {
        const P = window.__scalesProbe;
        await P.audio.unlockAudio();
        P.rec = await window.__audioTools.recorder(P.audio.getAudioContext(), P.audio.getEngine().output);
        P.stop = P.rec.capture();
      });
      s = await waitState(page, (x) => x.playing && x.step >= 0, 6000);
      check('Play starts the shape and lights the first note', s.playing && s.step >= 0 && s.lit !== '', JSON.stringify(s));
      await page.evaluate(() => { window.__renders.counts.clear(); window.__renders.on = true; });
      await page.waitForTimeout(quick ? 3500 : 6000);
      const renders = await page.evaluate(() => { window.__renders.on = false; return Object.fromEntries(window.__renders.counts); });
      const busy = STILL_WHILE_PLAYING.filter((n) => renders[n]).map((n) => `${n} ${renders[n]}x`);
      check('a heard note re-renders the neck, not the page’s sections and controls', (renders.Neck ?? 0) >= 5 && busy.length === 0, `Neck ${renders.Neck ?? 0}x; ${busy.length ? `also: ${busy.join(', ')}` : 'nothing else from the list'}`);
      const r = await page.evaluate(() => {
        const P = window.__scalesProbe;
        const cap = P.stop();
        const ctx = P.audio.getAudioContext();
        const fsr = ctx.sampleRate;
        // Plucks overlap (strings ring on), so look for the attack itself: the energy of the signal's
        // first difference (its bright, broadband part) jumps when a string is struck.
        const x = cap.samples;
        const energy = (t0, t1) => {
          const a = Math.max(1, Math.round(t0 * fsr) - cap.start);
          const b = Math.min(x.length, Math.round(t1 * fsr) - cap.start);
          let e = 0;
          for (let i = a; i < b; i++) e += (x[i] - x[i - 1]) ** 2;
          return b > a ? e / (b - a) : 0;
        };
        const rise = (t) => energy(t, t + 0.015) / Math.max(1e-12, energy(t - 0.03, t - 0.008));
        const from = cap.start / fsr;
        const to = (cap.start + x.length) / fsr;
        const notes = P.notes.slice();
        const inside = notes.filter((n) => n.time > from + 0.05 && n.time < to - 0.05);
        const atNotes = inside.map((n) => rise(n.time));
        // Control: the same measure halfway between notes, where nothing is struck.
        const between = inside.slice(1).map((n, i) => rise((n.time + inside[i].time) / 2));
        return { notes, shown: P.shown.slice(), atNotes, between, from, to };
      });
      // Every note handed to the engine (inside the recording) is struck at its time in the output.
      const struck = r.atNotes.filter((x) => x > 2).length;
      check('every scheduled note is struck at its time in the real output', r.atNotes.length >= 8 && struck >= r.atNotes.length * 0.9 && median(r.atNotes) > 4 * median(r.between), `${struck}/${r.atNotes.length} attacks at their times (median rise ${median(r.atNotes).toFixed(1)}x; between notes ${median(r.between).toFixed(1)}x)`);
      // The lit dot changes when its note is heard.
      const lags = [];
      const wrongPlace = [];
      for (const sh of r.shown) {
        if (sh.step < 0) continue;
        const note = [...r.notes].reverse().find((n) => n.index === sh.step && n.time <= sh.t + 0.05);
        if (!note) continue;
        lags.push(sh.t - note.time);
        if (sh.lit !== `${note.string}:${note.fret}` || sh.targets !== 1) wrongPlace.push(`${sh.lit} vs ${note.string}:${note.fret} (${sh.targets})`);
      }
      const late = lags.filter((l) => l > 0.06 || l < -0.03);
      check('the lit dot moves with the sound (each change within a few frames of its note being heard)', lags.length >= 8 && late.length <= Math.ceil(lags.length * 0.1), `${lags.length} changes, median ${(median(lags) * 1000).toFixed(1)} ms, ${late.length} outside -30..+60 ms${late.length ? ` (${late.map((l) => Math.round(l * 1000)).join(', ')} ms)` : ''}`);
      check('the lit dot is the note being played, and only one dot is lit', wrongPlace.length === 0, wrongPlace.slice(0, 3).join('; '));
      await shot(page, 'desktop-playing');
      await page.locator('h1').click();
      await page.keyboard.press(' ');
      s = await waitState(page, (x) => !x.playing);
      const targetsAfter = await page.locator('[data-neck] [data-state="target"]').count();
      check('Space stops it and the light goes out', !s.playing && s.step === -1 && targetsAfter === 0, JSON.stringify({ playing: s.playing, step: s.step, targetsAfter }));

      // ── over the backing band ──────────────────────────────────────────────────────────
      await page.getByRole('radio', { name: 'Band' }).click();
      const vampText = await page.getByText(/Drums, bass and keys/).innerText().catch(() => '');
      await page.evaluate(() => {
        const P = window.__scalesProbe;
        P.notes.length = 0;
        P.shown.length = 0;
        P.levels = [];
        P.meter = setInterval(() => P.levels.push(P.audio.getOutputLevel().peak), 50);
      });
      const bandStart = Date.now();
      await page.locator('[data-play]').first().click();
      s = await waitState(page, (x) => x.playing && x.step >= 0, 9000);
      const firstLit = Date.now() - bandStart;
      await page.waitForTimeout(3000);
      const band = await page.evaluate(() => {
        const P = window.__scalesProbe;
        clearInterval(P.meter);
        return { notes: P.notes.slice(), shown: P.shown.slice(), peak: Math.max(0, ...P.levels) };
      });
      const bandLags = band.shown.filter((x) => x.step >= 0).map((sh) => {
        const note = [...band.notes].reverse().find((n) => n.index === sh.step && n.time <= sh.t + 0.05);
        return note ? sh.t - note.time : 1;
      });
      check('Band plays a vamp that fits (A minor pentatonic over Am7) with a count-in, and the lit dot still follows the line', /Am7/.test(vampText) && s.playing && firstLit > 1200 && band.peak > 0.05 && bandLags.length >= 4 && bandLags.filter((l) => l > 0.06 || l < -0.03).length <= 1, `${vampText.replace(/\s+/g, ' ').slice(0, 60)} | first note lit after ${firstLit} ms | peak ${band.peak.toFixed(2)} | lags ${bandLags.map((l) => Math.round(l * 1000)).join(',')}`);
      await page.locator('[data-play]').first().click();
      s = await waitState(page, (x) => !x.playing);
      check('Stop stops the band too', !s.playing);
      await page.getByRole('radio', { name: 'Nothing' }).click();

      // ── an exercise as tab ─────────────────────────────────────────────────────────────
      const exercise = page.getByRole('button', { name: 'Play this exercise' });
      await exercise.scrollIntoViewIfNeeded();
      await exercise.click();
      s = await waitState(page, (x) => x.playing && x.step >= 2, 8000);
      const stopLabel = await page.getByRole('button', { name: 'Stop the exercise' }).count();
      const tabLines = await page.locator('[aria-label$="written as tab"]').count();
      check('Play this exercise plays the sequence written in the tab (in thirds)', s.playing && s.step >= 2 && stopLabel === 1 && tabLines > 0, JSON.stringify({ step: s.step, stopLabel, tabLines }));
      await page.getByRole('button', { name: 'Stop the exercise' }).click();
      s = await waitState(page, (x) => !x.playing);

      // ── the learner's tuning ───────────────────────────────────────────────────────────
      await page.evaluate(async () => (await import('/src/core/progress/index.ts')).setPrefs({ tuningId: 'drop-d' }));
      await page.waitForTimeout(500);
      const dropD = await cell(page, 6, 2).getAttribute('aria-label').catch(() => null);
      await page.evaluate(async () => (await import('/src/core/progress/index.ts')).setPrefs({ tuningId: 'standard' }));
      await page.waitForTimeout(300);
      check('the neck follows the tuning in Settings (drop D: string 6, fret 2 is E)', dropD === 'string 6, fret 2, E', dropD);

      // ── tap a note ─────────────────────────────────────────────────────────────────────
      await cell(page, 6, 5).click();
      await page.waitForTimeout(150);
      const heard = await page.locator('[data-scales] [aria-live="polite"]').filter({ hasText: 'root' }).count();
      check('tapping a dot plays it and names it ("A: the root")', heard > 0);
      await cell(page, 6, 6).click();
      await page.waitForTimeout(150);
      const outside = await page.getByText('not in this scale').count();
      check('a note outside the scale says so', outside > 0);

      // ── connect and compare ────────────────────────────────────────────────────────────
      await page.getByRole('radio', { name: 'Connect' }).click();
      s = await waitState(page, (x) => x.view === 'connect');
      const boxLabel = await page.locator('[data-neck] svg text').filter({ hasText: '+' }).count();
      const squares = await page.getByText('Squares are in both').count();
      check('Connect shows the shape and its neighbour, with the shared notes explained', s.view === 'connect' && boxLabel > 0 && squares > 0, `${s.view} ${boxLabel} ${squares}`);
      if (dark) await shot(page, 'desktop-connect');
      await page.getByRole('radio', { name: 'Shape', exact: true }).click();
      await page.getByRole('radio', { name: 'minor blues' }).click();
      s = await waitState(page, (x) => x.view === 'compare');
      const legend = await page.locator('[aria-live="polite"]').filter({ hasText: 'Only in' }).innerText().catch(() => '');
      check('Compare puts the blues scale on the same neck and names the blue note (♭5)', s.view === 'compare' && /♭5/.test(legend), legend.replace(/\s+/g, ' '));
      if (dark) {
        await page.locator('[data-neck]').scrollIntoViewIfNeeded();
        await shot(page, 'desktop-compare');
      }
      await page.getByRole('button', { name: 'Stop comparing' }).first().click();
      s = await waitState(page, (x) => x.view !== 'compare');
      check('Stop comparing returns to the shape', s.view === 'shape', s.view);

      // ── the picker ─────────────────────────────────────────────────────────────────────
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('button', { name: 'Change scale' }).click();
      await page.waitForSelector('[role="dialog"]');
      const groups = await page.locator('[role="dialog"] h3').allInnerTexts();
      check('the picker shows the Essentials first, and every group', groups[0] === 'Essentials' && groups.includes('Modes') && groups.includes('World and exotic') && groups.includes('Jazz and bebop'), groups.join(' | '));
      await page.locator('[role="dialog"] input[type="search"], [role="dialog"] input').first().fill('spanish');
      await page.waitForTimeout(250);
      const spanish = await page.locator('[role="dialog"] li').allInnerTexts();
      check('searching "spanish" finds Phrygian dominant', spanish.some((t) => /Phrygian dominant/.test(t)), spanish.slice(0, 3).join(' | ').replace(/\s+/g, ' '));
      await page.locator('[role="dialog"] input').first().fill('dorian');
      await page.waitForTimeout(250);
      await page.locator('[role="dialog"] li').first().locator('a, button').first().click();
      s = await waitState(page, (x) => x.scale === 'dorian');
      await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 3000 }).catch(() => undefined);
      check('picking a scale opens it on the same root and closes the sheet', s.scale === 'dorian' && s.tonic === 'A' && s.hash === '#scales--a--dorian' && (await page.locator('[role="dialog"]').count()) === 0, s.hash);

      // ── mark learnt ────────────────────────────────────────────────────────────────────
      const markButton = page.getByRole('button', { name: 'Mark as learnt' });
      await markButton.scrollIntoViewIfNeeded();
      await markButton.click();
      await page.waitForTimeout(400);
      const skill = await page.evaluate(async (id) => {
        const progress = await import('/src/core/progress/index.ts');
        const rec = progress.getProgress().skills[id];
        return rec ? { mastery: rec.mastery, completed: rec.completed } : null;
      }, `scale:a-dorian:${s.shape}`);
      const youKnow = await page.getByText(/You know /).count();
      check('Mark as learnt gives the shape its first crown in core/progress (scale:<scale>:<shape>)', skill && skill.mastery >= 1 && skill.completed && youKnow > 0, JSON.stringify(skill));

      // ── capo and left-handed ───────────────────────────────────────────────────────────
      await open(page, goto, 'a--minor-pentatonic--box-1');
      await page.getByRole('button', { name: /Neck options/ }).click();
      await page.waitForSelector('[role="dialog"]');
      const capo = page.locator('[role="dialog"]').getByRole('spinbutton', { name: /Capo/ });
      await capo.click();
      await capo.press('ArrowUp');
      await capo.press('ArrowUp');
      await page.waitForTimeout(200);
      const lefty = page.locator('[role="dialog"]').getByRole('switch', { name: /Left-handed/ });
      await lefty.check();
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      // With a capo on 2, box 1 starts two frets lower (counted from the capo); A is still A.
      const rootCell = await cell(page, 6, 3).getAttribute('aria-label').catch(() => null);
      const capoDrawn = await page.locator('[data-neck] svg[aria-label*="capo on fret 2"]').count();
      check('a capo moves the shape: box 1 root at fret 3 from the capo, still spelled A', rootCell === 'string 6, fret 3, A' && capoDrawn > 0, `${rootCell} capo drawn: ${capoDrawn}`);
      const mirror = await page.evaluate(() => {
        const at = (f) => document.querySelector(`[data-neck] button[aria-label^="string 1, fret ${f},"]`)?.getBoundingClientRect().left ?? null;
        return { low: at(1), high: at(10) };
      });
      check('left-handed mirrors the neck (high frets on the left)', mirror.low !== null && mirror.high !== null && mirror.high < mirror.low, JSON.stringify(mirror));
      await shot(page, `desktop-capo-lefty-${theme}`);
      // Put both back.
      await page.getByRole('button', { name: /Neck options/ }).click();
      await page.waitForSelector('[role="dialog"]');
      const capo2 = page.locator('[role="dialog"]').getByRole('spinbutton', { name: /Capo/ });
      await capo2.click();
      await capo2.press('ArrowDown');
      await capo2.press('ArrowDown');
      await page.locator('[role="dialog"]').getByRole('switch', { name: /Left-handed/ }).uncheck();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      // ── practice is logged when the learner leaves ─────────────────────────────────────
      if (!quick) {
        const before = await page.evaluate(async () => (await import('/src/core/progress/index.ts')).getProgress().log.length);
        await page.locator('[data-play]').first().click();
        await page.waitForTimeout(22000);
        await goto('home');
        await page.waitForTimeout(800);
        const entry = await page.evaluate(async () => {
          const log = (await import('/src/core/progress/index.ts')).getProgress().log;
          return { n: log.length, last: log[0] ?? null };
        });
        check('playing for 20 s or more is logged as scale practice when you leave', entry.n > before && JSON.stringify(entry.last).includes('scale-practice'), JSON.stringify(entry.last).slice(0, 200));
        await open(page, goto, 'a--minor-pentatonic--box-1');
      }
    } else {
      await shot(page, 'desktop-light');
      await page.locator('h2', { hasText: 'Hear it' }).scrollIntoViewIfNeeded();
      await shot(page, 'desktop-light-details');
    }

    await page.locator('h2', { hasText: 'Notes and formula' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await shot(page, `desktop-details-${theme}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`desktop ${theme}: no sideways page scroll`, overflow <= 1, overflow);
    check(`desktop ${theme}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  });
}

async function phone(theme) {
  await withApp({ mobile: true, theme }, async ({ page, goto, errors }) => {
    await open(page, goto, 'a--minor-pentatonic--box-2');
    await page.waitForTimeout(800);
    let s = await state(page);
    const geo = await page.evaluate(() => {
      const root = document.documentElement;
      const neck = document.querySelector('[data-neck]');
      let scroller = null;
      for (const el of neck.querySelectorAll('div')) if (el.scrollWidth > el.clientWidth + 2) { scroller = el; break; }
      const boxCells = [...neck.querySelectorAll('button[aria-label^="string 1, fret 7,"], button[aria-label^="string 1, fret 10,"]')].map((b) => b.getBoundingClientRect());
      const frame = scroller?.getBoundingClientRect();
      const play = document.querySelector('[data-play]')?.getBoundingClientRect();
      return {
        overflow: root.scrollWidth - root.clientWidth,
        scrolls: !!scroller,
        scrollLeft: scroller?.scrollLeft ?? 0,
        boxInView: !!frame && boxCells.length === 2 && boxCells.every((r) => r.left >= frame.left - 1 && r.right <= frame.right + 1),
        play: play ? { top: play.top, bottom: play.bottom } : null,
        vh: innerHeight,
        neckBottom: neck.getBoundingClientRect().bottom,
      };
    });
    if (theme === 'dark') {
      check('phone: a deep link opens box 2', s.shape === 'box-2' && s.layout === 'phone', JSON.stringify(s));
      check('phone: the page never scrolls sideways', geo.overflow <= 1, geo.overflow);
      check('phone: the neck scrolls inside its own frame and centres the shape (frets 7–10 in view)', geo.scrolls && geo.scrollLeft > 0 && geo.boxInView, JSON.stringify(geo));
      check('phone: Play sits in the thumb zone (lower half)', geo.play && geo.play.top > geo.vh / 2 && geo.play.bottom <= geo.vh, JSON.stringify(geo.play));
      check('phone: the whole neck is above the action bar on first sight', geo.play && geo.neckBottom <= geo.play.top, `${geo.neckBottom} vs ${geo.play?.top}`);
      await shot(page, 'phone-dark');
      await page.getByRole('button', { name: 'Next shape' }).first().click();
      s = await waitState(page, (x) => x.shape === 'box-3');
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => {
        for (const el of document.querySelector('[data-neck]').querySelectorAll('div')) if (el.scrollWidth > el.clientWidth + 2) return el.scrollLeft;
        return 0;
      });
      check('phone: the next shape glides into view', s.shape === 'box-3' && after > geo.scrollLeft, `${geo.scrollLeft} -> ${after}`);
      await page.getByRole('button', { name: 'Scale' }).first().click();
      await page.waitForSelector('[role="dialog"]');
      await page.waitForTimeout(400);
      await shot(page, 'phone-picker');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      check('phone: the picker opens as a sheet and Esc closes it', (await page.locator('[role="dialog"]').count()) === 0);
      await page.locator('h2', { hasText: 'Hear it' }).scrollIntoViewIfNeeded();
      await shot(page, 'phone-hear');
      await page.locator('h2', { hasText: 'Notes and formula' }).scrollIntoViewIfNeeded();
      await shot(page, 'phone-formula');
      await page.locator('h2', { hasText: 'Practise it' }).scrollIntoViewIfNeeded();
      await shot(page, 'phone-practice');
      await page.locator('h2', { hasText: 'Relatives' }).scrollIntoViewIfNeeded();
      await shot(page, 'phone-relatives');
    } else {
      check('phone light: no sideways page scroll', geo.overflow <= 1, geo.overflow);
      await shot(page, 'phone-light');
      await page.locator('h2', { hasText: 'Chords it fits' }).scrollIntoViewIfNeeded();
      await shot(page, 'phone-light-chords');
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`phone ${theme}: still no sideways scroll after scrolling the page`, overflow <= 1, overflow);
    check(`phone ${theme}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  });
}

async function sideways() {
  const count = async (viewport) =>
    withApp({ mobile: true, viewport, theme: 'dark' }, async ({ page, goto }) => {
      await open(page, goto, 'a--minor-pentatonic--box-1');
      await page.waitForTimeout(800);
      const n = await page.evaluate(() => {
        const neck = document.querySelector('[data-neck]');
        let frame = null;
        for (const el of neck.querySelectorAll('div')) if (el.scrollWidth > el.clientWidth + 2) { frame = el.getBoundingClientRect(); break; }
        frame = frame ?? neck.getBoundingClientRect();
        return [...neck.querySelectorAll('button[aria-label^="string 1,"]')].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.left >= frame.left - 1 && r.right <= frame.right + 1;
        }).length;
      });
      if (viewport.width > viewport.height) await shot(page, 'phone-sideways');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      return { n, overflow };
    });
  const upright = await count({ width: 390, height: 844 });
  const side = await count({ width: 844, height: 390 });
  check('a phone on its side shows more frets than upright', side.n > upright.n, `${upright.n} -> ${side.n} frets in view`);
  check('a phone on its side does not scroll the page sideways', side.overflow <= 1, side.overflow);
}

function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

(async () => {
  try {
    await desktop('dark');
    await desktop('light');
    await phone('dark');
    await phone('light');
    await sideways();
  } catch (e) {
    check('the check ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' / ') : e);
  }
  const failed = printChecks(checks);
  console.log(failed ? `FAILED (${failed} of ${checks.length})` : `PASSED (${checks.length} checks)`);
  process.exit(failed ? 1 : 0);
})();
