#!/usr/bin/env node
/**
 * Held-out test pages for the notation recognizer, engraved by a DIFFERENT program than the
 * corpus: alphaTab (its own layout engine, Bravura, Guitar Pro conventions: plain treble clef,
 * "Guitar Standard Tuning" above the first staff, dynamics, red bar numbers, triplet brackets).
 * The corpus and the recognizer's templates are all VexFlow; these pages say how far the
 * recognizer generalises to another engraver. Nothing here is used to build templates.
 *
 *   node src/core/omr/notation/tools/alphatab-pages.cjs            # write fixtures/alphatab/
 *   node src/core/omr/notation/tools/alphatab-pages.cjs --only ode # one page
 *
 * Every page is a short guitar piece in alphaTex (fret.string, standard tuning). The ground
 * truth comes from alphaTab itself: its score model (sounding / written MIDI, values, dots,
 * tuplets, ties) and its bounds lookup (note heads, bars), the staff lines and the accidental /
 * rest glyphs from the rendered SVG. It is written in the corpus format (`GroundTruth` of
 * eval/truth.ts) so the corpus degradation and scoring apply unchanged. Music: traditional tunes,
 * Beethoven's Ode to Joy and original exercises only.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const AT = path.join(ROOT, 'node_modules', '@coderline', 'alphatab', 'dist');
const OUT = path.join(ROOT, 'src', 'core', 'omr', 'notation', 'fixtures', 'alphatab');

/**
 * The pages. `dsf` = device pixels per CSS px (alphaTab's staff space is 9 CSS px at scale 1, so
 * the staff space in the image is about 9 * scale * dsf px: 1.2 is a 150-dpi print, 2.4 a 300-dpi one).
 */
const PAGES = [
  {
    id: 'at-ode-c', dsf: 1.6, scale: 1.0, width: 1000,
    tex: String.raw`\title "Ode to Joy" \tempo 96 \staff {score} \ts (4 4)
      :4 0.1 0.1 1.1 3.1 | 3.1 1.1 0.1 3.2 | 1.2 1.2 3.2 0.1 | 0.1 {d} :8 3.2 :2 3.2 |
      :4 0.1 0.1 1.1 3.1 | 3.1 1.1 0.1 3.2 | 1.2 1.2 3.2 0.1 | 3.2 {d} :8 1.2 :2 1.2 |
      :4 3.2 3.2 0.1 1.2 | 3.2 :8 0.1 1.1 :4 0.1 1.2 | 3.2 :8 0.1 1.1 :4 0.1 3.2 | 1.2 3.2 :2 0.3 |
      :4 0.1 0.1 1.1 3.1 | 3.1 1.1 0.1 3.2 | 1.2 1.2 3.2 0.1 | 3.2 {d} :8 1.2 :2 1.2 |`,
  },
  {
    id: 'at-greensleeves-am', dsf: 2.2, scale: 1.0, width: 1050,
    tex: String.raw`\title "Greensleeves" \staff {score} \ts (6 8)
      :4 r {d} :4 r :8 2.3 | :4 1.2 :8 3.2 :8 0.1 {d} :16 1.1 :8 0.1 | :4 3.2 :8 0.2 :8 0.3 {d} :16 2.3 :8 0.2 |
      :4 1.2 :8 2.3 :8 2.3 {d} :16 1.3 :8 2.3 | :4 0.2 :8 1.3 :4 2.4 :8 2.3 | :4 1.2 :8 3.2 :8 0.1 {d} :16 1.1 :8 0.1 |
      :4 3.2 :8 0.2 :8 0.3 {d} :16 2.3 :8 0.2 | :8 1.2 {d} :16 0.2 :8 2.3 :8 1.3 {d} :16 4.4 :8 1.3 | :2 2.3 {d} |
      :4 3.1 {d} :8 3.1 {d} :16 2.1 :8 0.1 | :4 3.2 :8 0.2 :8 0.3 {d} :16 2.3 :8 0.2 | :4 1.2 :8 2.3 :8 2.3 {d} :16 1.3 :8 2.3 |
      :4 0.2 :8 1.3 :4 2.4 {d} | :4 3.1 {d} :8 3.1 {d} :16 2.1 :8 0.1 | :4 3.2 :8 0.2 :8 0.3 {d} :16 2.3 :8 0.2 |
      :8 1.2 {d} :16 0.2 :8 2.3 :8 1.3 {d} :16 4.4 :8 1.3 | :2 2.3 {d} |`,
  },
  {
    id: 'at-romance-em', greyLines: true, dsf: 1.8, scale: 1.0, width: 1000,
    // Romance (anonymous): melody on the first of each group of three, open B and G strings after it.
    tex: String.raw`\title "Romance" \staff {score} \ks (G) \ts (3 4) :8
      7.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 7.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 7.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} |
      7.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 5.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 3.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} |
      3.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 2.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 0.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} |
      0.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 3.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 7.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} |
      12.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 12.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 12.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} |
      12.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 10.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} 8.1 {tu 3} 0.2 {tu 3} 0.3 {tu 3} |
      8.1 {tu 3} 1.2 {tu 3} 0.3 {tu 3} 7.1 {tu 3} 1.2 {tu 3} 0.3 {tu 3} 5.1 {tu 3} 1.2 {tu 3} 0.3 {tu 3} |
      :2 0.1 {d} |`,
  },
  {
    id: 'at-arpeggio16-c', dsf: 2.0, scale: 0.95, width: 1100,
    tex: String.raw`\title "Arpeggio Study" \staff {score} \ts (4 4) :16
      3.5 2.4 0.3 1.2 0.1 1.2 0.3 2.4 3.5 2.4 0.3 1.2 0.1 1.2 0.3 2.4 |
      0.5 2.4 2.3 1.2 0.1 1.2 2.3 2.4 0.5 2.4 2.3 1.2 0.1 1.2 2.3 2.4 |
      0.4 2.3 3.2 1.1 3.2 2.3 0.4 2.3 0.4 2.3 3.2 1.1 3.2 2.3 0.4 2.3 |
      3.6 2.5 0.4 0.3 0.2 1.1 0.2 0.3 3.6 2.5 0.4 0.3 0.2 1.1 0.2 0.3 |
      :1 (3.5 2.4 0.3 1.2 0.1) |`,
  },
  {
    id: 'at-scale-g', dsf: 1.3, scale: 1.0, width: 1000,
    tex: String.raw`\title "G Major Scale" \staff {score} \ks (G) \ts (2 4) :8
      3.6 0.5 2.5 3.5 | 0.4 2.4 4.4 0.3 | 2.3 0.2 1.2 3.2 | 0.1 2.1 3.1 5.1 | 7.1 5.1 :4 3.1 |
      :8 5.1 3.1 2.1 0.1 | 3.2 1.2 0.2 2.3 | 0.3 4.4 2.4 0.4 | 3.5 2.5 0.5 3.6 | :2 3.6 |
      :16 3.6 0.5 2.5 3.5 0.4 2.4 4.4 0.3 | 2.3 0.2 1.2 3.2 0.1 2.1 3.1 5.1 | :4 3.1 r |`,
  },
  {
    id: 'at-rests-d', dsf: 1.7, scale: 1.0, width: 950,
    tex: String.raw`\title "Rests" \staff {score} \ks (D) \ts (4 4)
      :4 3.2 r 2.1 r | :2 5.1 r | :1 r | :8 3.2 r 2.1 r :4 5.1 r |
      :16 3.2 r 0.1 r :4 r :2 2.1 | :4 r {d} :8 5.1 :2 10.1 | :8 r 2.1 r 0.1 :2 3.2 | :1 3.2 |`,
  },
  {
    id: 'at-accidentals-f', dsf: 1.9, scale: 1.0, width: 1000,
    tex: String.raw`\title "Chromatic Study" \staff {score} \ks (F) \ts (4 4)
      :4 1.1 2.1 3.1 4.1 | 5.1 6.1 7.1 8.1 | 8.1 7.1 6.1 5.1 | 4.1 3.1 2.1 1.1 |
      :8 2.1 2.1 3.1 2.1 :4 1.1 3.1 | :8 7.1 8.1 7.1 6.1 :2 5.1 | :4 4.2 3.2 2.2 1.2 | :1 1.1 |`,
  },
  {
    id: 'at-ties-bb', dsf: 1.6, scale: 1.05, width: 1000,
    tex: String.raw`\title "Ties" \staff {score} \ks (Bb) \ts (3 4)
      :4 3.2 1.1 6.1 | :2 -.1 :4 5.1 | :4 3.1 :2 1.1 | :4 -.1 4.2 3.2 | :2 1.2 {d} | :2 -.2 {d} |
      :8 3.2 4.2 :4 1.1 :8 -.1 3.1 | :2 3.3 {d} |`,
  },
  {
    id: 'at-chords-c', dsf: 2.0, scale: 1.0, width: 1050,
    tex: String.raw`\title "Chord Studies" \staff {score} \ts (4 4)
      :2 (3.5 2.4 0.3 1.2 0.1) (0.5 2.4 2.3 1.2 0.1) | :2 (0.4 2.3 3.2 1.1) (3.6 2.5 0.4 0.3 0.2 3.1) |
      :4 (0.6 2.5 2.4 0.3 0.2 0.1) (0.6 2.5 2.4 0.3 0.2 0.1) (0.5 2.4 2.3 0.2 0.1) (0.5 2.4 2.3 2.2 0.1) |
      :1 (3.5 2.4 0.3 3.2 0.1) | :4 (0.4 2.3 3.2 0.1) (0.4 2.3 3.2 2.1) :2 (3.6 2.5 0.4 0.3 0.2 3.1) |
      :4 (3.5 2.4 0.3 1.2 0.1) {d} :8 (3.5 2.4 0.3 1.2 0.1) :2 (3.4 2.3 1.2 1.1) |
      :2 (3.6 2.5 0.4 0.3 0.2 1.1) (3.6 2.5 0.4 0.3 0.2 1.1) | :1 (3.5 2.4 0.3 1.2 0.1) |`,
  },
  {
    id: 'at-twovoice-am', dsf: 1.8, scale: 1.0, width: 1000,
    tex: String.raw`\title "Two Voices" \staff {score} \ts (4 4)
      \voice :4 0.1 1.1 0.1 0.2 | 1.2 0.2 :2 2.3 | :4 0.1 3.1 1.1 0.1 | :2 3.2 1.2 | :1 2.3 |
      \voice :2 0.5 2.4 | 3.5 0.6 | 0.4 0.5 | 3.6 3.5 | :1 0.5 |`,
  },
  {
    id: 'at-high-e', dsf: 1.5, scale: 1.0, width: 1000,
    tex: String.raw`\title "High Positions" \staff {score} \ks (E) \ts (4 4) :8
      12.1 14.1 16.1 14.1 12.1 11.1 9.1 7.1 | 9.1 11.1 12.1 14.1 :2 16.1 | :8 12.1 9.1 7.1 4.1 2.1 0.1 4.2 2.2 |
      :4 0.1 4.1 9.1 12.1 | :8 11.1 12.1 14.1 12.1 :4 11.1 9.1 | :1 12.1 |`,
  },
  {
    id: 'at-dotted-eb', greyLines: true, dsf: 2.4, scale: 0.9, width: 1100,
    tex: String.raw`\title "Dotted Rhythms" \staff {score} \ks (Eb) \ts (4 4)
      :8 4.2 {d} :16 1.1 :8 3.1 {d} :16 4.1 :4 6.1 {d} :8 4.1 | :2 3.1 {d} :4 r | :8 6.1 {d} :16 8.1 :8 10.1 {d} :16 11.1 :2 10.1 |
      :4 8.1 {d} :8 6.1 :4 4.1 3.1 | :4 1.1 {d} :8 3.1 :2 4.2 | :2 1.2 {d} :4 3.3 | :1 4.2 |`,
  },
  {
    id: 'at-waltz-a', greyLines: true, dsf: 1.2, scale: 1.0, width: 1000,
    tex: String.raw`\title "Little Waltz" \staff {score} \ks (A) \ts (3 4)
      :4 2.3 2.2 0.1 | :2 5.1 :4 4.1 | :2 2.1 {d} | :4 0.1 2.1 4.1 | :2 5.1 :4 2.2 | :4 4.1 2.1 0.1 |
      :2 2.2 :4 0.2 | :2 2.3 {d} |`,
  },
  {
    id: 'at-twinkle-d', dsf: 1.4, scale: 1.1, width: 1000,
    tex: String.raw`\title "Twinkle, Twinkle" \staff {score} \ks (D) \ts (2 4) :4
      3.2 3.2 | 5.1 5.1 | 7.1 7.1 | :2 5.1 | :4 3.1 3.1 | 2.1 2.1 | 0.1 0.1 | :2 3.2 |
      :4 5.1 5.1 | 3.1 3.1 | 2.1 2.1 | :2 0.1 | :4 5.1 5.1 | 3.1 3.1 | 2.1 2.1 | :2 0.1 |`,
  },
  {
    id: 'at-ode-scoretab', dsf: 1.6, scale: 1.0, width: 1000, profile: 'ScoreTab',
    tex: String.raw`\title "Ode to Joy (with tab)" \ts (4 4)
      :4 0.1 0.1 1.1 3.1 | 3.1 1.1 0.1 3.2 | 1.2 1.2 3.2 0.1 | 0.1 {d} :8 3.2 :2 3.2 |
      :4 0.1 0.1 1.1 3.1 | 3.1 1.1 0.1 3.2 | 1.2 1.2 3.2 0.1 | 3.2 {d} :8 1.2 :2 1.2 |`,
  },
];

/* global alphaTab, document */
/** Runs in the page: render, then read the model, the bounds and the glyphs (CSS px). */
async function renderInPage(spec) {
  const el = document.getElementById('at');
  el.style.width = `${spec.width}px`;
  const api = new alphaTab.AlphaTabApi(el, {
    core: { fontDirectory: 'http://at.local/dist/font/', useWorkers: false, engine: 'svg', includeNoteBounds: true, enableLazyLoading: false },
    display: { staveProfile: spec.profile || 'Score', layoutMode: 'page', scale: spec.scale, ...(spec.greyLines ? {} : { resources: { staffLineColor: '#000000', barSeparatorColor: '#000000', secondaryGlyphColor: '#000000' } }) },
    player: { enablePlayer: false },
  });
  const done = new Promise((resolve, reject) => {
    api.renderFinished.on(() => resolve());
    api.error.on((e) => reject(new Error(`alphaTab: ${e && (e.message || e)}`)));
    setTimeout(() => reject(new Error('alphaTab: render timeout')), 20000);
  });
  api.tex(spec.tex);
  await done;
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 200));
  // Everything in CSS px of the viewport (the screenshot's frame); the bounds lookup is relative to
  // alphaTab's surface element.
  const origin = { x: 0, y: 0 };
  const surface = (el.querySelector('.at-surface') || el).getBoundingClientRect();
  const rel = (r) => ({ x: r.x - origin.x, y: r.y - origin.y, w: r.width, h: r.height });
  const fromSurface = (b) => [b.x + surface.x, b.y + surface.y, b.w, b.h];
  // Glyphs (SMuFL code points) with their origin point: x = left edge, y = baseline = staff position.
  const glyphs = [];
  for (const t of el.querySelectorAll('svg text')) {
    const code = t.textContent.codePointAt(0);
    if (!code || code < 0xe000) continue;
    const m = t.getScreenCTM();
    const svg = t.ownerSVGElement;
    const p = svg.createSVGPoint();
    p.x = Number(t.getAttribute('x') || 0);
    p.y = Number(t.getAttribute('y') || 0);
    const q = p.matrixTransform(m);
    const r = rel(t.getBoundingClientRect());
    glyphs.push({ code, x: r.x, w: r.w, ox: q.x - origin.x, oy: q.y - origin.y });
  }
  // Thin horizontal rects are staff lines.
  const lines = [];
  for (const r of el.querySelectorAll('svg rect')) {
    const b = rel(r.getBoundingClientRect());
    if (b.h > 0 && b.h <= 2 && b.w > 60) lines.push(b);
  }
  const mb0 = api.score.masterBars[0];
  const bars = [];
  const seen = new Set();
  for (const sys of api.boundsLookup.staffSystems) {
    for (const mbb of sys.bars) {
      for (const bb of mbb.bars) {
        const bar = bb.bar;
        if (bar.staff.showStandardNotation === false) continue;
        // With notation and tab, each bar is listed once per staff renderer: the notation comes first.
        if (bar.staff.index !== 0 || seen.has(bar.index)) continue;
        seen.add(bar.index);
        const beats = [];
        for (const beatB of bb.beats) {
          const b = beatB.beat;
          beats.push({
            voice: b.voice.index,
            duration: b.duration,
            dots: b.dots,
            rest: b.isRest,
            tuplet: b.tupletNumerator > 0 ? [b.tupletNumerator, b.tupletDenominator] : null,
            vb: (([x, y, w, h]) => ({ x, y, w, h }))(fromSurface(beatB.visualBounds)),
            notes: (beatB.notes || []).map((nb) => ({
              real: nb.note.realValue, display: nb.note.displayValue, string: nb.note.string, fret: nb.note.fret,
              tieStart: !!nb.note.isTieOrigin, tieStop: !!nb.note.isTieDestination,
              head: fromSurface(nb.noteHeadBounds),
            })),
          });
        }
        const mb = bar.masterBar;
        bars.push({
          index: bar.index, system: api.boundsLookup.staffSystems.indexOf(sys),
          real: fromSurface(bb.realBounds),
          visual: fromSurface(bb.visualBounds),
          ts: [mb.timeSignatureNumerator, mb.timeSignatureDenominator], key: mb.keySignature, beats,
        });
      }
    }
  }
  const all = el.getBoundingClientRect();
  return { bars, glyphs, lines, width: all.x + all.width, height: all.y + all.height, key: mb0.keySignature, ts: [mb0.timeSignatureNumerator, mb0.timeSignatureDenominator] };
}

const VALUE = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd' };
const TICKS = { whole: 3840, half: 1920, quarter: 960, eighth: 480, '16th': 240, '32nd': 120 };
const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const KEY_NAMES = { '-3': 'Eb', '-2': 'Bb', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E' };
const ACC_CODES = { 0xe260: 'b', 0xe261: 'n', 0xe262: '#', 0xe263: '##', 0xe264: 'bb' };
const REST_CODES = new Set([0xe4e3, 0xe4e4, 0xe4e5, 0xe4e6, 0xe4e7, 0xe4e8]);

function ticksOf(value, dots, tuplet) {
  let t = TICKS[value];
  if (dots === 1) t *= 1.5; else if (dots === 2) t *= 1.75;
  if (tuplet) t = (t * tuplet.normal) / tuplet.actual;
  return Math.round(t);
}

/** Ink box of the pixels in a column range, skipping the staff-line rows (image px). */
function inkBox(img, x0, x1, y0, y1, skipRows) {
  let bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, Math.ceil(y1)); y++) {
    if (skipRows.has(y)) continue;
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.width, Math.ceil(x1)); x++) {
      if (img.data[y * img.width + x] < 128) {
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    }
  }
  return bx1 < 0 ? null : [bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1];
}

/** Staff lines (image px) in a region: rows dark across most of it, merged into lines. */
function staffLinesAt(img, x0, x1, y0, y1) {
  const lines = [];
  let run = null;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, Math.ceil(y1)); y++) {
    let dark = 0;
    let ink = 0;
    let first = -1;
    let last = -1;
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const v = img.data[y * img.width + x];
      if (v < 225) {
        dark++;
        if (first < 0) first = x;
        last = x;
      }
      ink += 255 - v;
    }
    if (dark > 0.6 * (x1 - x0)) {
      if (run && run.y1 === y - 1) {
        run.y1 = y;
        run.w += ink;
        run.wy += ink * y;
        run.x0 = Math.min(run.x0, first);
        run.x1 = Math.max(run.x1, last + 1);
      } else {
        run = { y0: y, y1: y, w: ink, wy: ink * y, x0: first, x1: last + 1 };
        lines.push(run);
      }
    }
  }
  return lines.map((r) => ({ y: r.wy / r.w + 0.5, h: r.y1 - r.y0 + 1, x0: r.x0, x1: r.x1 }));
}

/** Build the ground truth (corpus format, image px) of one rendered page. */
function buildTruth(spec, r, gray) {
  const k = spec.dsf;
  const sc = (v) => v * k;
  const box = (b) => [sc(b[0]), sc(b[1]), sc(b[2]), sc(b[3])];
  const systems = [];
  const bySystem = new Map();
  for (const b of r.bars) {
    if (!bySystem.has(b.system)) bySystem.set(b.system, []);
    bySystem.get(b.system).push(b);
  }
  let lastTs = null;
  [...bySystem.keys()].sort((a, b) => a - b).forEach((sysIndex, si) => {
    const bars = bySystem.get(sysIndex);
    // The staff lines of this system, from the picture: rows that are dark across the bars.
    const g = staffLinesAt(gray, sc(bars[0].real[0]), sc(bars[bars.length - 1].real[0] + bars[bars.length - 1].real[2]), sc(bars[0].real[1] - 4), sc(bars[0].real[1] + bars[0].real[3] + 4));
    if (g.length !== 5) throw new Error(`${spec.id}: ${g.length} staff lines in system ${si}`);
    const space = (g[4].y - g[0].y) / 4;
    const lineYs = g.map((l) => l.y);
    const bottom = lineYs[4];
    const posOf = (yc) => Math.round((bottom - yc) / (space / 2));
    const skipRows = new Set();
    for (const l of g) for (let y = Math.floor(l.y - l.h); y <= Math.ceil(l.y + l.h); y++) skipRows.add(y);
    const accGlyphs = r.glyphs.filter((q) => ACC_CODES[q.code]);
    const restGlyphs = r.glyphs.filter((q) => REST_CODES.has(q.code));
    const measures = [];
    const barlines = [];
    for (const b of bars) {
      const events = [];
      for (const bt of b.beats.slice().sort((p, q) => p.voice - q.voice || p.vb.x - q.vb.x)) {
        const value = VALUE[bt.duration];
        if (!value) throw new Error(`${spec.id}: duration ${bt.duration}`);
        const tuplet = bt.tuplet ? { actual: bt.tuplet[0], normal: bt.tuplet[1] } : undefined;
        const duration = { value, dots: bt.dots, ticks: ticksOf(value, bt.dots, tuplet), ...(tuplet ? { tuplet } : {}) };
        if (bt.rest) {
          // The rest glyph inside the beat's bounds; its ink gives the box.
          const glyph = restGlyphs.find((q) => q.x >= bt.vb.x - 2 && q.x <= bt.vb.x + bt.vb.w + 2);
          const gx0 = sc(glyph ? glyph.x : bt.vb.x);
          const gx1 = sc(glyph ? glyph.x + glyph.w : bt.vb.x + bt.vb.w);
          const head = inkBox(gray, gx0, gx1, lineYs[0] - 2.5 * space, lineYs[4] + 2.5 * space, skipRows);
          events.push({ type: 'rest', x: head ? head[0] + head[2] / 2 : (gx0 + gx1) / 2, duration, bbox: head, notes: [], head });
          continue;
        }
        const notes = bt.notes.map((n) => {
          const head = box(n.head);
          const yc = head[1] + head[3] / 2;
          const pos = posOf(yc);
          // A printed accidental: its origin sits on the head's staff position, just left of it.
          const acc = accGlyphs.find((q) => Math.abs(sc(q.oy) - yc) < 0.3 * space && sc(q.x + q.w) <= head[0] + 0.3 * space && sc(q.x + q.w) >= head[0] - 2.8 * space && sc(q.x) > sc(b.real[0]));
          const written = n.display;
          return {
            written, midi: n.real, step: STEPS[((written % 12) + 12) % 12], alter: 0, octave: Math.floor(written / 12) - 1,
            pos, ledger: pos >= 10 ? Math.floor((pos - 8) / 2) : pos <= -2 ? Math.floor(-pos / 2) : 0,
            accidental: acc ? ACC_CODES[acc.code] : null, accBox: acc ? [sc(acc.x), yc - space, sc(acc.w), 2 * space] : null,
            head, headType: value === 'whole' ? 'whole' : value === 'half' ? 'open' : 'filled',
            tieStart: n.tieStart, tieStop: n.tieStop, string: n.string, fret: n.fret,
          };
        }).sort((p, q) => p.written - q.written);
        const x = notes.reduce((t, n) => t + n.head[0] + n.head[2] / 2, 0) / notes.length;
        events.push({ type: 'note', x, duration, bbox: null, notes });
      }
      // Time order like the page assembler's (by x; the order of two voices struck together is arbitrary).
      events.sort((p, q) => p.x - q.x);
      const x0 = sc(b.real[0]);
      const x1 = sc(b.real[0] + b.real[2]);
      measures.push({ index: b.index, x0, x1, events });
      barlines.push({ type: b === bars[bars.length - 1] && sysIndex === Math.max(...bySystem.keys()) ? 'end' : 'single', x: x1, bbox: [x1 - 2, lineYs[0], 4, lineYs[4] - lineYs[0]], strokes: [[x1, 1]] });
    }
    const ts = bars[0].ts;
    const showTime = !lastTs || lastTs[0] !== ts[0] || lastTs[1] !== ts[1];
    lastTs = ts;
    const key = bars[0].key;
    systems.push({
      index: si, connector: 'none', barThrough: false,
      staves: [{
        kind: 'notation', lineCount: 5, lines: lineYs, x0: g[0].x0, x1: g[0].x1, space, lineThickness: g[0].h,
        clef: { type: 'treble', bbox: null }, time: showTime ? { num: ts[0], den: ts[1], bbox: null } : null,
        key: { name: KEY_NAMES[key] ?? String(key), fifths: key, bbox: null }, barlines, measures,
      }],
    });
  });
  const staffSpace = systems[0].staves[0].space;
  return {
    id: spec.id, image: `${spec.id}.png`, width: gray.width, height: gray.height, subset: 'notation', title: null,
    dpi: Math.round(staffSpace / 1.75 * 25.4), scale: staffSpace / 10, staffSpace, musicFont: 'Bravura (alphaTab)', textFont: 'alphaTab', tabFont: null,
    key: { name: KEY_NAMES[r.key] ?? String(r.key), fifths: r.key }, time: { num: r.ts[0], den: r.ts[1] }, pickup: false, systems, texts: [],
  };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
  const index = [];
  try {
    for (const spec of PAGES) {
      if (only && !spec.id.includes(only)) continue;
      const page = await browser.newPage({ viewport: { width: spec.width + 40, height: 2000 }, deviceScaleFactor: spec.dsf });
      page.on('pageerror', (e) => console.error(`${spec.id}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && /alphaTex|diagnostic/i.test(m.text())) console.error(`${spec.id}: ${m.text()}`); });
      await page.route('http://at.local/**', async (route) => {
        const u = new URL(route.request().url());
        if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#fff"><div id="at"></div></body></html>' });
        const f = path.join(AT, u.pathname.replace(/^\/dist\//, ''));
        const ct = f.endsWith('.js') ? 'application/javascript' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.woff') ? 'font/woff' : f.endsWith('.otf') ? 'font/otf' : 'application/octet-stream';
        return route.fulfill({ body: fs.readFileSync(f), contentType: ct });
      });
      await page.goto('http://at.local/');
      await page.addScriptTag({ url: 'http://at.local/dist/alphaTab.js' });
      const r = await page.evaluate(renderInPage, { ...spec, tex: spec.tex.replace(/\s+/g, ' ') });
      const png = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: spec.width + 20, height: Math.ceil(r.height) + 20 } }));
      await page.close();
      const gray = { width: png.width, height: png.height, data: new Uint8Array(png.width * png.height) };
      for (let i = 0; i < gray.data.length; i++) gray.data[i] = Math.round(0.299 * png.data[4 * i] + 0.587 * png.data[4 * i + 1] + 0.114 * png.data[4 * i + 2]);
      const out = new PNG({ width: gray.width, height: gray.height, colorType: 0, inputColorType: 0, bitDepth: 8 });
      out.data = Buffer.from(gray.data);
      fs.writeFileSync(path.join(OUT, `${spec.id}.png`), PNG.sync.write(out, { colorType: 0, inputColorType: 0 }));
      const truth = buildTruth(spec, r, gray);
      const round = (_, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v);
      fs.writeFileSync(path.join(OUT, `${spec.id}.json`), `${JSON.stringify(truth, round)}\n`);
      const heads = truth.systems.reduce((t, s) => t + s.staves[0].measures.reduce((u, m) => u + m.events.reduce((v, e) => v + e.notes.length, 0), 0), 0);
      index.push({ id: spec.id, staves: truth.systems.length, heads, staffSpace: Math.round(truth.staffSpace * 10) / 10, dpi: truth.dpi });
      console.log(`${spec.id.padEnd(22)} ${gray.width}x${gray.height} staves ${truth.systems.length} heads ${heads} space ${truth.staffSpace.toFixed(1)} px (~${truth.dpi} dpi)`);
    }
  } finally {
    await browser.close();
  }
  if (!only) fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify({ generator: 'src/core/omr/notation/tools/alphatab-pages.cjs', pages: index }, null, 1)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
