#!/usr/bin/env node
/**
 * Browser checks of the music kit fixes (#kit-music), phone and desktop, light and dark:
 *   - fretboard: `orientation="auto"` stands frets 0-12 up on an upright phone (no sideways scroll,
 *     44 px cells) and lies down on a desktop; the behind-the-nut area is light in the light theme
 *     and the open-string rings use page ink; the screen-reader description lists every marker;
 *     a target pulses with an HTML ring (transform/opacity only), never an SVG animation
 *   - rhythm: eighths are beamed (no flags), a tie is a second note head with an arc, the counting
 *     keeps an eighth's "&" beside triplets, and both bars of a swing figure are bracketed alike
 *   - rhythm and strumming bars fit a phone (steps narrow to a floor instead of scrolling sideways)
 *   - circle of fifths: "1 sharp", never "1 sharps"
 *   - tab: one "let ring" / "P.M." per stretch, held notes shown once per bar
 *   - no console errors, no horizontal page scroll at 360 and 390 px
 * Usage: node e2e/kit-music-fixes.cjs
 */
const { withApp } = require('./lib/harness.cjs');

let failures = 0;
function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
}

const demo = (title) => `[data-demo="${title}"]`;

async function settle(page) {
  await page.waitForFunction(() => document.querySelectorAll('[data-demo]').length > 30, null, { timeout: 30000 });
  await page.waitForTimeout(800);
}

/** Luminance (0-1) of a computed CSS colour like `rgb(1, 2, 3)` or `color(srgb 0.1 0.2 0.3)`. */
const LUMINANCE = `(c) => {
  const nums = (c.match(/[\\d.]+/g) || []).map(Number);
  const [r, g, b] = c.startsWith('color(') ? nums.slice(0, 3).map((v) => v * 255) : nums.slice(0, 3);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}`;

async function fretboardChecks(page, label, { phone, theme }) {
  const upright = await page.evaluate((sel) => {
    const boards = [...document.querySelectorAll(`${sel} [data-orientation]`)];
    const tap = boards[0];
    const scroller = tap?.firstElementChild;
    const cells = [...(tap?.querySelectorAll('button[aria-label^="string"]') ?? [])];
    const small = cells.filter((b) => { const r = b.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).length;
    return { orientation: tap?.getAttribute('data-orientation'), compact: tap?.hasAttribute('data-compact'), sideways: scroller ? scroller.scrollWidth - scroller.clientWidth : -1, cells: cells.length, small, second: boards[1]?.getAttribute('data-orientation') };
  }, demo('Twelve frets, standing up'));
  if (phone) {
    check(upright.orientation === 'vertical' && upright.compact, `${label}: frets 0-12 stand up on an upright phone (${upright.orientation}${upright.compact ? ', compact' : ''})`);
    check(upright.sideways <= 1, `${label}: the standing board needs no sideways scroll (${upright.sideways} px)`);
  } else {
    check(upright.orientation === 'horizontal', `${label}: the same board lies down on a desktop (${upright.orientation})`);
  }
  check(upright.cells === 78 && upright.small === 0, `${label}: 78 tap cells, all at least 44 x 44 (${upright.cells}, ${upright.small} smaller)`);
  check(upright.second === 'vertical', `${label}: the compact vertical board is drawn standing up`);

  // Behind the nut: page-coloured in both themes (light in the light theme), open rings in page ink.
  const head = await page.evaluate(`(() => {
    const lum = ${LUMINANCE};
    const board = document.querySelector('${demo('G major, open')} [data-orientation]');
    const stop = board.querySelector('linearGradient[id$="-head"] stop:nth-child(2)');
    const ring = board.querySelector('[data-open][data-shape="ring"] text');
    return { head: lum(getComputedStyle(stop).stopColor), ring: ring ? lum(getComputedStyle(ring).fill) : null };
  })()`);
  if (theme === 'light') {
    check(head.head > 0.4, `${label}: the area behind the nut is light in the light theme (luminance ${head.head.toFixed(2)})`);
    check(head.ring !== null && head.ring < 0.2, `${label}: open-string rings are labelled in dark page ink (luminance ${head.ring?.toFixed(2)})`);
  } else {
    check(head.head < 0.1, `${label}: the area behind the nut stays dark in the dark theme (luminance ${head.head.toFixed(2)})`);
    check(head.ring !== null && head.ring > 0.6, `${label}: open-string rings are labelled in light page ink (luminance ${head.ring?.toFixed(2)})`);
  }

  // The target pulse is an HTML ring animating transform and opacity; no SVG animates for ever.
  const pulse = await page.evaluate(() => {
    const anims = document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations === Infinity);
    const svgLoops = anims.filter((a) => a.effect.target instanceof SVGElement && a.effect.target.closest('[data-orientation]')).length;
    const rings = anims.filter((a) => a.effect.target instanceof HTMLElement && /pulse/.test(a.effect.target.className));
    const props = new Set(rings.flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p)))));
    return { svgLoops, rings: rings.length, props: [...props] };
  });
  check(pulse.svgLoops === 0, `${label}: no SVG element of a fretboard animates for ever (${pulse.svgLoops})`);
  check(pulse.rings >= 2 && pulse.props.every((p) => p === 'transform' || p === 'opacity'), `${label}: targets pulse with HTML rings, transform and opacity only (${pulse.rings} rings: ${pulse.props.join(', ')})`);

  // The screen-reader description lists every marker of a 24-fret scale.
  await page.locator(demo('C major across the neck')).getByRole('radio', { name: '0–24' }).click();
  await page.waitForTimeout(400);
  const desc = await page.evaluate((sel) => {
    const svg = document.querySelector(`${sel} svg[role="img"]`);
    const text = svg?.querySelector('desc')?.textContent ?? '';
    return { text, count: (svg?.getAttribute('aria-label') ?? '').match(/(\d+) notes marked/)?.[1] };
  }, demo('C major across the neck'));
  const listed = desc.text ? desc.text.split('; ').length : 0;
  check(Number(desc.count) > 48 && listed === Number(desc.count) && !/more/.test(desc.text), `${label}: the description reads all ${desc.count} markers (${listed} listed)`);
  await page.locator(demo('C major across the neck')).getByRole('radio', { name: '0–12' }).click();
}

async function rhythmChecks(page, label, { phone } = {}) {
  if (phone) {
    // Every rhythm and strumming bar fits the phone: steps narrow (down to a floor) rather than scroll sideways.
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll('[role="group"][aria-label^="Rhythm"], [role="group"][aria-label^="Strumming"]')]
        .filter((g) => g.scrollWidth - g.clientWidth > 1)
        .map((g) => `${g.closest('[data-demo]')?.getAttribute('data-demo')}: ${g.scrollWidth - g.clientWidth} px`),
    );
    check(wide.length === 0, `${label}: every rhythm and strumming bar fits without sideways scrolling${wide.length ? ` (${wide.join('; ')})` : ''}`);
  }
  const r = await page.evaluate(() => {
    const q = (t) => document.querySelector(`[data-demo="${t}"]`);
    const eighths = q('Quarters and eighths');
    const beamedGlyphs = [...eighths.querySelectorAll('[data-beamed] svg')];
    const flagsOnBeamed = beamedGlyphs.reduce((n, s) => n + s.querySelectorAll('path').length, 0);
    const beams = eighths.querySelectorAll('[class*="beam"]').length;
    const tie = q('A tie and a dotted note');
    const tied = tie.querySelector('[data-tied]');
    const tiedHead = tied?.querySelector('svg ellipse');
    const arc = tied?.querySelector('svg[data-kind="prev"]');
    const mixed = q('Eighths beside triplets');
    const played = [...mixed.querySelectorAll('[data-played]')].map((s) => s.textContent);
    const swing = q('Swing figures over two bars');
    const bars = [...swing.querySelectorAll('[class*="_bar_"]')].map((b) => [...b.querySelectorAll('[data-onset]')].map((s) => {
      const t = s.querySelector('[class*="tuplet"]');
      return t ? `${t.hasAttribute('data-bracket') ? '[3]' : '3'}@${Math.round(t.getBoundingClientRect().width)}` : '-';
    }).join(' '));
    return { beamed: beamedGlyphs.length, flagsOnBeamed, beams, tiedHead: !!tiedHead, arc: !!arc, played, bars };
  });
  check(r.beamed === 2 && r.flagsOnBeamed === 0 && r.beams === 1, `${label}: two eighths share one beam and carry no flags (${r.beamed} beamed, ${r.beams} beam, ${r.flagsOnBeamed} flag paths)`);
  check(r.tiedHead && r.arc, `${label}: a tie is a second note head joined by an arc (head ${r.tiedHead}, arc ${r.arc})`);
  check(r.played.join(' ') === '1 & 2 trip let 3 4 &', `${label}: an eighth's "&" stays "&" beside triplets ("${r.played.join(' ')}")`);
  check(r.bars.length === 2 && r.bars[0] === r.bars[1] && /\[3\]/.test(r.bars[0]), `${label}: both bars of the swing figure are bracketed alike ("${r.bars[0]}" / "${r.bars[1]}")`);
}

async function circleAndTabChecks(page, label) {
  const circle = await page.evaluate(() => [...document.querySelectorAll('[data-demo="Interactive"] [role="radio"]')].map((r) => r.getAttribute('aria-label')));
  check(circle.some((l) => /^G major, 1 sharp\b/.test(l)) && !circle.some((l) => /\b1 (sharps|flats)\b/.test(l)), `${label}: the circle says "1 sharp" ("${circle.find((l) => /^G major/.test(l))}")`);
  const tab = await page.evaluate(() => {
    const held = document.querySelector('[data-demo="Let ring and held notes"]');
    const labels = [...held.querySelectorAll('text')].map((t) => t.textContent);
    const systems = held.querySelectorAll('svg[class*="tile"], [class*="_tile_"] > svg').length;
    const blues = document.querySelector('[data-demo="A blues with its blue note"]');
    const pm = [...blues.querySelectorAll('text')].filter((t) => t.textContent === 'P.M.').length;
    const bluesSystems = blues.querySelectorAll('[class*="_tile_"] > svg').length;
    const parens = [...held.querySelectorAll('g')].filter((g) => g.querySelector(':scope > path[class*="paren"]')).length;
    return { letRing: labels.filter((t) => t === 'let ring').length, systems, pm, bluesSystems, parens };
  });
  check(tab.letRing >= 1 && tab.letRing <= Math.max(1, tab.systems), `${label}: "let ring" once per stretch (${tab.letRing} on ${tab.systems} systems)`);
  check(tab.pm >= 1 && tab.pm <= Math.max(1, tab.bluesSystems), `${label}: the thumb's "P.M." once per stretch (${tab.pm} on ${tab.bluesSystems} systems)`);
  check(tab.parens === 2, `${label}: each held bass shown once per bar in parentheses, not a run of them (${tab.parens})`);
}

async function run({ phone, width, theme }) {
  const label = `${phone ? `${width} px` : 'desktop'} ${theme}`;
  await withApp(phone ? { mobile: true, viewport: { width, height: 860 }, theme } : { theme }, async ({ page, goto, errors }) => {
    await goto('kit-music');
    await settle(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, `${label}: no horizontal page scroll (${overflow} px)`);
    await fretboardChecks(page, label, { phone, theme });
    await rhythmChecks(page, label, { phone });
    await circleAndTabChecks(page, label);
    check(errors.length === 0, `${label}: no console errors${errors.length ? `:\n    ${errors.join('\n    ')}` : ''}`);
  });
}

/** A lesson card on a 360 px phone is narrower than the kit's demos: its rhythm figures fit too, with legible counts. */
async function lessonFigureChecks() {
  await withApp({ mobile: true, viewport: { width: 360, height: 800 }, theme: 'dark' }, async ({ page, goto, errors }) => {
    await goto('learn', 'triplets-swing-syncopation', 'swing');
    await page.waitForSelector('[role="group"][aria-label^="Rhythm"]', { timeout: 30000 });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const g = document.querySelector('[role="group"][aria-label^="Rhythm"]');
      // The ink of each count label (not its grid cell), left to right.
      const boxes = [...g.querySelectorAll('[class*="count"]')]
        .filter((c) => c.textContent)
        .map((c) => { const range = document.createRange(); range.selectNodeContents(c); const b = range.getBoundingClientRect(); return { t: c.textContent, l: b.left, r: b.right }; })
        .sort((a, b) => a.l - b.l);
      const touching = [];
      for (let i = 1; i < boxes.length; i++) if (boxes[i].l - boxes[i - 1].r < 1) touching.push(`${boxes[i - 1].t}|${boxes[i].t}`);
      return { scroll: g.scrollWidth - g.clientWidth, width: g.clientWidth, touching };
    });
    check(r.scroll <= 1, `lesson at 360 px: the swing figure fits its ${r.width} px card (${r.scroll} px sideways)`);
    check(r.touching.length === 0, `lesson at 360 px: no two counts run together ("trip let", not "triplet")${r.touching.length ? `: ${r.touching.join(', ')}` : ''}`);
    check(errors.length === 0, `lesson at 360 px: no console errors${errors.length ? `:\n    ${errors.join('\n    ')}` : ''}`);
  });
}

(async () => {
  await lessonFigureChecks();
  await run({ phone: false, theme: 'dark' });
  await run({ phone: false, theme: 'light' });
  await run({ phone: true, width: 390, theme: 'light' });
  await run({ phone: true, width: 360, theme: 'dark' });
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
