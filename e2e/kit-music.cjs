#!/usr/bin/env node
/**
 * Browser check of the music UI kit gallery (#kit-music):
 *   - no console or page errors, desktop and phone, dark and light
 *   - nothing is fetched from another host (VexFlow draws glyphs as paths; no fonts from a CDN)
 *   - VexFlow is not loaded by a screen that has no notation, and is loaded by one that has
 *   - no horizontal page scroll at 360 px; frets 0-12 fit a 390 px phone without scrolling
 *   - the tap-the-note board: real buttons, arrow-key focus, right/wrong feedback
 *   - the circle of fifths: click and arrow keys select keys (radio semantics)
 *   - the piano: keys are buttons
 *   - the note-naming setting reaches the components; the notation highlight moves without errors
 * Usage: node e2e/kit-music.cjs
 */
const { withApp } = require('./lib/harness.cjs');

let failures = 0;
function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
}

async function waitForNotation(page) {
  await page.waitForFunction(() => document.querySelectorAll('.vf-stavenote').length > 20, null, { timeout: 30000 });
}

async function desktop() {
  await withApp({ theme: 'dark' }, async ({ page, goto, errors }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));

    // A screen without notation must not pull VexFlow in.
    await goto('kit');
    await page.waitForTimeout(2500);
    check(!requests.some((u) => /vexflow/i.test(u)), 'VexFlow is not loaded on a screen without notation (#kit)');

    await goto('kit-music');
    await waitForNotation(page);
    check(requests.some((u) => /vexflow/i.test(u)), 'VexFlow is loaded on demand by the notation view');
    const origin = new URL(page.url()).origin;
    const foreign = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
    check(foreign.length === 0, `nothing fetched from another host${foreign.length ? `: ${foreign.slice(0, 5).join(', ')}` : ''}`);
    const fontFetches = requests.filter((u) => /\.(woff2?|otf|ttf)(\?|$)/.test(u) && /bravura|gonville|petaluma|leland/i.test(u));
    check(fontFetches.length === 0, 'no music font files fetched (glyphs are paths)');

    // Every notation view engraved, with ink in currentColor.
    const notation = await page.evaluate(() => {
      const svgs = [...document.querySelectorAll('[data-demo] svg')].filter((s) => s.querySelector('.vf-stave'));
      return { count: svgs.length, nan: svgs.filter((s) => /NaN/.test(s.getAttribute('viewBox') || '')).length, black: svgs.filter((s) => s.querySelector('[fill="black"]')).length };
    });
    check(notation.count >= 6 && notation.nan === 0, `notation engraved (${notation.count} staves, ${notation.nan} with NaN geometry)`);
    check(notation.black === 0, 'notation drawn in the theme ink, nothing hard-coded black');

    // Tap the note: buttons with position-only labels, keyboard movement, feedback.
    const board = page.locator('[data-demo="Tap the note"]');
    const cells = board.locator('button[aria-label^="string"]');
    const cellCount = await cells.count();
    check(cellCount === 36, `tap board has a button per string x fret (0-5): ${cellCount}`);
    const firstLabel = await cells.first().getAttribute('aria-label');
    check(!/[A-G]$/.test(firstLabel || ''), `cell labels do not give the note away ("${firstLabel}")`);
    const tabStops = await board.locator('button[aria-label^="string"][tabindex="0"]').count();
    check(tabStops === 1, 'one tab stop in the board (roving focus)');
    await board.locator('button[aria-label="string 1, open"]').focus();
    await page.keyboard.press('ArrowRight');
    let focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    check(focused === 'string 1, fret 1', `ArrowRight moves to the next fret (${focused})`);
    await page.keyboard.press('ArrowDown');
    focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    check(focused === 'string 2, fret 1', `ArrowDown moves to the next string (${focused})`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    let status = await board.locator('[aria-live]').innerText();
    check(/Yes, that is C/.test(status), `pressing the C cell says so ("${status.trim()}")`);
    await board.locator('button[aria-label="string 1, fret 1"]').click();
    await page.waitForTimeout(200);
    status = await board.locator('[aria-live]').innerText();
    check(/That is F/.test(status), `a wrong cell names what was tapped ("${status.trim()}")`);
    const marks = await board.locator('[data-state="hit"], [data-state="miss"]').count();
    check(marks === 2, `hit and miss markers drawn (${marks})`);

    // Circle of fifths: radios, click and arrows.
    const circle = page.locator('[data-demo="Interactive"]');
    await circle.locator('[role="radio"][aria-label^="D major"]').click();
    let checked = await circle.locator('[role="radio"][aria-checked="true"]').getAttribute('aria-label');
    check(/^D major/.test(checked || ''), `clicking a wedge selects it (${checked})`);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    checked = await circle.locator('[role="radio"][aria-checked="true"]').getAttribute('aria-label');
    check(/^A major/.test(checked || ''), `ArrowRight steps a fifth up (${checked})`);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    checked = await circle.locator('[role="radio"][aria-checked="true"]').getAttribute('aria-label');
    check(/^F♯ minor/.test(checked || ''), `ArrowDown moves to the relative minor (${checked})`);
    const chordText = await circle.innerText();
    check(/Chords in F♯ minor/.test(chordText) && /C♯m/.test(chordText), 'the chord list follows the selected key');

    // Piano keys are buttons.
    const piano = page.locator('[data-demo="Tap a key"]');
    await piano.locator('button[aria-label="C4"]').click();
    await page.waitForTimeout(250);
    const pianoStatus = await piano.locator('[aria-live]').innerText();
    check(/You tapped C4/.test(pianoStatus), `piano key press reported ("${pianoStatus.trim()}")`);

    // The naming setting reaches every component.
    await page.getByRole('radio', { name: 'Do Re Mi' }).click();
    await page.waitForTimeout(600);
    const solfege = await page.evaluate(() => ({
      board: [...document.querySelectorAll('[data-demo="C major across the neck"] svg text')].map((t) => t.textContent).join(' '),
      circle: document.querySelector('[data-demo="Interactive"]')?.textContent || '',
      notation: [...document.querySelectorAll('[data-demo="A melody in G"] svg text')].map((t) => t.textContent).join(' '),
    }));
    check(/\bMi\b/.test(solfege.board) && /\bDo\b/.test(solfege.board), 'fretboard labels in solfege');
    check(/Fa♯ minor/.test(solfege.circle), 'circle centre in solfege');
    check(/\bSi\b/.test(solfege.notation), 'notation labels in solfege');
    await page.getByRole('radio', { name: 'C D E' }).click();

    // The notation highlight moves without re-engraving.
    await page.getByRole('button', { name: 'Follow along' }).click();
    await page.waitForTimeout(1200);
    const current = await page.locator('[data-demo="A melody in G"] [data-current]').count();
    check(current >= 1, `the current note is highlighted during playback (${current})`);
    await page.getByRole('button', { name: 'Stop' }).first().click();

    // Left-handed and light, then the errors so far.
    await page.getByRole('switch', { name: 'Left-handed' }).click().catch(async () => page.getByLabel('Left-handed').click());
    await page.getByRole('radio', { name: 'Light' }).click();
    await page.waitForTimeout(800);
    check(errors.length === 0, `no console errors on desktop${errors.length ? `:\n    ${errors.join('\n    ')}` : ''}`);
  });
}

async function phone(width) {
  await withApp({ mobile: true, viewport: { width, height: 800 }, theme: 'light' }, async ({ page, goto, errors }) => {
    await goto('kit-music');
    await waitForNotation(page);
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, `${width} px: no horizontal page scroll (${overflow} px)`);
    const neck = await page.evaluate(() => {
      const demo = document.querySelector('[data-demo="C major across the neck"]');
      const scroller = demo?.querySelector('svg')?.parentElement?.parentElement;
      return scroller ? { scroll: scroller.scrollWidth, client: scroller.clientWidth } : null;
    });
    if (width >= 390) check(!!neck && neck.scroll <= neck.client + 1, `${width} px: frets 0-12 fit without scrolling (${neck && `${neck.scroll}/${neck.client}`})`);
    else check(!!neck, `${width} px: frets 0-12 scroll inside their own box if they must (${neck && `${neck.scroll}/${neck.client}`})`);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[data-demo="Tap the note"] button[aria-label^="string"]')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width < 43.5 || r.height < 43.5;
      }).length,
    );
    check(small === 0, `${width} px: every tap cell is at least 44 x 44 (${small} smaller)`);
    check(errors.length === 0, `${width} px: no console errors${errors.length ? `:\n    ${errors.join('\n    ')}` : ''}`);
  });
}

(async () => {
  await desktop();
  await phone(390);
  await phone(360);
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
