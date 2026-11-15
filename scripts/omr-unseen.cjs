#!/usr/bin/env node
/**
 * The UNSEEN corpus for the sheet reader: pages engraved independently of the corpus the
 * recognizers were developed on (scripts/omr-fixtures.cjs), to measure overfitting honestly.
 *
 *   node scripts/omr-unseen.cjs                 # rebuild src/core/omr/fixtures-unseen/ (PNG + JSON + manifest)
 *   node scripts/omr-unseen.cjs --only tab      # only pages whose id contains "tab" (manifest merged)
 *   node scripts/omr-unseen.cjs --list          # print the corpus
 *   node scripts/omr-unseen.cjs --overlay       # also write e2e/out/omr/unseen-<id>.png with the truth drawn in
 *
 * Two engravers, neither of them the corpus one:
 *
 * 1. Our own layout engine ("E2", in this file). It uses VexFlow's three music fonts (Bravura,
 *    Gonville, Petaluma; Leland once) only as glyph outlines; spacing, stems, beams, ledger lines,
 *    bar lines, ties, accidentals, key and time signatures, tab staves and numbers are all laid out
 *    here, with knobs the corpus never turned: staff space 7-24 px, staff lines 0.05-0.22 space
 *    thick, spacing 0.65-1.35x, stem length 2.7-4.1 spaces, flat / normal / steep beams, cue-size
 *    notes, ragged last systems, no bar line at the start of single staves. Tab numbers in faces
 *    the digit templates never saw (IPAGothic, WenQuanYi Zen Hei, Unifont, Caladea Italic, a
 *    synthetic condensed and a synthetic heavy face, small digits, and stroke-drawn "handwritten"
 *    digits with seeded jitter), knocked out of the line or struck through by it, tab with rhythm
 *    stems / beams / rests below and a big time signature.
 * 2. alphaTab (`--alphatab` pages, prefix "ua-"): a different engraving program altogether,
 *    tab-only and score + tab, with its own Bravura and layout; served from node_modules, no network.
 *
 * Ground truth is written in the corpus format (`GroundTruth`, src/core/omr/eval/truth.ts) from
 * the drawing itself (glyph bounding boxes from the SVG, text ink boxes from canvas metrics), so
 * the degradation tiers and the scorer apply unchanged. Deterministic (seeded); music is
 * traditional or generated.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'core', 'omr', 'fixtures-unseen');
const AT = path.join(ROOT, 'node_modules', '@coderline', 'alphatab', 'dist');
const nm = (...p) => path.join(ROOT, 'node_modules', ...p);

// ------------------------------------------------------------------------------------------
// Music: parsing, spelling, fretting, generated material
// ------------------------------------------------------------------------------------------

const STEP_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const DUR = { w: ['whole', 3840], h: ['half', 1920], q: ['quarter', 960], 8: ['eighth', 480], 16: ['16th', 240] };
/** Sounding MIDI of the open strings, index 0 = string 1. */
const OPEN = [64, 59, 55, 50, 45, 40];
const KEY_FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, F: -1, Bb: -2, Eb: -3, Am: 0, Em: 1, Bm: 2, Dm: -1, Gm: -2 };
const SHARPS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

function keyAlters(fifths) {
  const out = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  for (let i = 0; i < Math.abs(fifths); i++) out[fifths > 0 ? SHARPS[i] : SHARPS[6 - i]] = fifths > 0 ? 1 : -1;
  return out;
}

function parsePitch(s) {
  const m = /^([A-G])(#|b|n)?(\d)$/.exec(s);
  if (!m) throw new Error(`bad pitch ${s}`);
  const alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = Number(m[3]);
  return { step: m[1], alter, octave, written: (octave + 1) * 12 + STEP_SEMI[m[1]] + alter, pos: octave * 7 + LETTERS.indexOf(m[1]) - 30 };
}

/** Pitches written as letters get the key signature unless they carry #, b or n. */
function pitchInKey(s, fifths) {
  const p = parsePitch(s);
  if (!/[#bn]/.test(s.slice(1, -1))) {
    p.alter = keyAlters(fifths)[p.step];
    p.written = (p.octave + 1) * 12 + STEP_SEMI[p.step] + p.alter;
  }
  return p;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Strings and frets for sounding pitches (high to low), lowest frets near `position` first. */
function fretChord(sounding, position) {
  const order = sounding.map((m, i) => ({ m, i })).sort((a, b) => b.m - a.m);
  const out = [];
  let minString = 1;
  for (const { m, i } of order) {
    let best = null;
    for (let s = minString; s <= 6; s++) {
      const f = m - OPEN[s - 1];
      if (f < 0 || f > 19) continue;
      const cost = (f >= position && f <= position + 4 ? 0 : 50 + Math.abs(f - position)) + 0.2 * f + 0.01 * s;
      if (!best || cost < best.cost) best = { string: s, fret: f, cost };
    }
    if (!best) throw new Error(`cannot fret ${m}`);
    out[i] = { string: best.string, fret: best.fret };
    minString = best.string + 1;
  }
  return out;
}

/**
 * Score text: bars separated by "|" ("||" double, "|]" end); events "B4:q", "C4+E4:h.", "r:8",
 * "D5:q~" (tie to the next), tab-first "2/3+3/0:q" (string/fret), "3[ A4:8 B4:8 C5:8 ]" triplets,
 * "\"G\"" chord symbol for the next event. Letters follow the key unless they carry # b n.
 */
function parseScore(src, fifths, position = 0) {
  const measures = [];
  let cur = [];
  let chord = null;
  let tuplet = false;
  let end = 'single';
  const close = (type) => {
    if (cur.length) measures.push({ events: cur, end: type });
    cur = [];
  };
  for (const tok of src.trim().split(/\s+/)) {
    if (tok === '|') { close('single'); continue; }
    if (tok === '||') { close('double'); continue; }
    if (tok === '|]') { close('end'); end = 'end'; continue; }
    if (tok.startsWith('"')) { chord = tok.replace(/"/g, ''); continue; }
    if (tok === '3[') { tuplet = true; continue; }
    if (tok === ']') { tuplet = false; continue; }
    const m = /^(.+):(w|h|q|8|16)(\.?)(~?)$/.exec(tok);
    if (!m) throw new Error(`bad token ${tok}`);
    const [value, base] = DUR[m[2]];
    const dots = m[3] ? 1 : 0;
    let ticks = base * (dots ? 1.5 : 1);
    if (tuplet) ticks = (ticks * 2) / 3;
    const ev = { value, dots, ticks: Math.round(ticks), tuplet: tuplet ? { actual: 3, normal: 2 } : undefined, rest: m[1] === 'r', tie: m[4] === '~', notes: [], chord };
    chord = null;
    if (!ev.rest) {
      if (m[1].includes('/')) {
        ev.notes = m[1].split('+').map((p) => {
          const [s, f] = p.split('/').map(Number);
          const sounding = OPEN[s - 1] + f;
          return { ...spellMidi(sounding + 12, fifths), sounding, string: s, fret: f };
        });
      } else {
        const ps = m[1].split('+').map((p) => pitchInKey(p, fifths));
        const tab = fretChord(ps.map((p) => p.written - 12), position);
        ev.notes = ps.map((p, i) => ({ ...p, sounding: p.written - 12, string: tab[i].string, fret: tab[i].fret }));
      }
      ev.notes.sort((a, b) => a.written - b.written);
    }
    cur.push(ev);
  }
  close(end === 'end' ? 'end' : 'end');
  if (measures.length) measures[measures.length - 1].end = 'end';
  return measures;
}

/** Spell a written MIDI number in a key (diatonic first, else sharps / flats by key direction). */
function spellMidi(written, fifths) {
  const pc = ((written % 12) + 12) % 12;
  const ka = keyAlters(fifths);
  let best = null;
  for (const step of LETTERS) {
    for (const alter of [-1, 0, 1]) {
      if ((((STEP_SEMI[step] + alter) % 12) + 12) % 12 !== pc) continue;
      const cost = alter === ka[step] ? 0 : alter === 0 ? 1 : alter === (fifths < 0 ? -1 : 1) ? 2 : 3;
      if (!best || cost < best.cost) best = { step, alter, cost };
    }
  }
  const octave = Math.floor((written - best.alter - STEP_SEMI[best.step]) / 12) - 1;
  return { step: best.step, alter: best.alter, octave, written, pos: octave * 7 + LETTERS.indexOf(best.step) - 30 };
}

/** A melodic line: a walk on the scale with leaps, rests, dotted rhythms, ties and passing accidentals. */
function walk(seed, key, beats, beatValue, bars, low, span, opts = {}) {
  const r = rng(seed);
  const fifths = KEY_FIFTHS[key];
  const lowP = parsePitch(low);
  const lowD = lowP.octave * 7 + LETTERS.indexOf(lowP.step);
  const compound = beatValue === 8 && beats % 3 === 0;
  const beatTicks = compound ? 1440 : 3840 / beatValue;
  const nBeats = compound ? beats / 3 : beats;
  const patterns = compound
    ? [['q', '8'], ['8', '8', '8'], ['q.'], ['8.', '16', '8'], ['16', '16', '8', '8']]
    : beatValue === 4
      ? [['q'], ['8', '8'], ['8.', '16'], ['16', '16', '8'], ['8', '16', '16'], ['16', '16', '16', '16'], ['q'], ['8', '8']]
      : [['8'], ['16', '16']];
  let d = lowD + Math.floor(span / 2);
  const out = [];
  for (let b = 0; b < bars; b++) {
    const bar = [];
    let k = 0;
    while (k < nBeats) {
      const left = nBeats - k;
      if (!compound && beatValue === 4 && left >= 2 && r() < 0.14) {
        bar.push(r() < 0.3 && left >= 3 ? 'h.' : 'h');
        k += bar[bar.length - 1] === 'h.' ? 3 : 2;
        continue;
      }
      if (opts.triplets && !compound && beatValue === 4 && r() < 0.18) {
        bar.push('3[', '8', '8', '8', ']');
        k++;
        continue;
      }
      for (const p of patterns[Math.floor(r() * patterns.length)]) bar.push(p);
      k++;
    }
    const toks = [];
    for (const dur of bar) {
      if (dur === '3[' || dur === ']') { toks.push(dur); continue; }
      if (r() < (opts.rests ?? 0.08) && toks.length) { toks.push(`r:${dur}`); continue; }
      const step = r() < 0.2 ? Math.floor(r() * 7) - 3 : Math.floor(r() * 3) - 1;
      d = Math.max(lowD, Math.min(lowD + span, d + (step === 0 ? 1 : step)));
      const letter = LETTERS[((d % 7) + 7) % 7];
      const octave = Math.floor(d / 7);
      let acc = '';
      if (r() < (opts.accidentals ?? 0.07)) acc = keyAlters(fifths)[letter] === 1 ? 'n' : keyAlters(fifths)[letter] === -1 ? 'n' : r() < 0.5 ? '#' : 'b';
      let tok = `${letter}${acc}${octave}`;
      if (opts.chords && r() < opts.chords) {
        const d2 = d - 2;
        const l2 = LETTERS[((d2 % 7) + 7) % 7];
        tok += `+${l2}${Math.floor(d2 / 7)}`;
        if (r() < 0.4) {
          const d3 = d - 4;
          tok += `+${LETTERS[((d3 % 7) + 7) % 7]}${Math.floor(d3 / 7)}`;
        }
      }
      toks.push(`${tok}:${dur}`);
    }
    out.push(toks.join(' '));
    void beatTicks;
  }
  return `${out.join(' | ')} |]`;
}

/** Tab-first material: positions, chord grips, open strings, two-digit frets. */
function tabWalk(seed, bars, beats = 4, opts = {}) {
  const r = rng(seed);
  const shapes = [
    ['3/0', '2/1', '4/2', '5/3'], ['1/0', '2/0', '3/1', '4/2', '5/2', '6/0'], ['2/3', '3/2', '4/0', '5/0'],
  ];
  let pos = opts.position ?? 5;
  const out = [];
  for (let b = 0; b < bars; b++) {
    const toks = [];
    let k = 0;
    while (k < beats) {
      const roll = r();
      if (opts.chords && roll < opts.chords) {
        const shape = shapes[Math.floor(r() * shapes.length)];
        const n = 2 + Math.floor(r() * (shape.length - 1));
        const strings = new Set();
        const notes = [];
        for (const s of shape.slice(0, n)) {
          const [st, f] = s.split('/').map(Number);
          if (strings.has(st)) continue;
          strings.add(st);
          notes.push(`${st}/${f + (r() < 0.5 ? 0 : pos)}`);
        }
        toks.push(`${notes.join('+')}:${r() < 0.3 && beats - k >= 2 ? 'h' : 'q'}`);
        k += toks[toks.length - 1].endsWith(':h') ? 2 : 1;
        continue;
      }
      const durs = opts.sixteenths && r() < 0.3 ? ['16', '16', '16', '16'] : r() < 0.55 ? ['8', '8'] : ['q'];
      for (const d of durs) {
        if (opts.rests && r() < opts.rests && toks.length) { toks.push(`r:${d}`); continue; }
        const s = 1 + Math.floor(r() * 6);
        let f = pos + Math.floor(r() * 5) - 1;
        if (r() < 0.12) f = 0;
        if (r() < 0.12) f = Math.min(19, f + 7);
        toks.push(`${s}/${Math.max(0, f)}:${d}`);
      }
      k++;
    }
    if (r() < 0.3) pos = Math.max(0, Math.min(14, pos + Math.floor(r() * 7) - 3));
    out.push(toks.join(' '));
  }
  return `${out.join(' | ')} |]`;
}

const TUNES = {
  // "When the Saints Go Marching In" (trad.).
  saints: `r:q C4:q E4:q F4:q | G4:w | r:q C4:q E4:q F4:q | G4:w | r:q C4:q E4:q F4:q | G4:h E4:h | C4:h E4:h | D4:w |
           r:q E4:q E4:q D4:q | C4:h. C4:q | E4:h G4:q G4:q | G4:q F4:h. | r:q E4:q F4:q G4:q | E4:h C4:h | D4:h. D4:q | C4:w |]`,
  // An air in D (written for this corpus), with a pickup and ties.
  airD: `"D" D4:q | "G" G4:q. G4:8 G4:q A4:q | B4:q C5:q E5:q D5:q | "G" B4:8 A4:8 G4:h. | "Em" G4:q A4:q B4:h~ |
           "A" B4:q A4:q G4:q E4:8 D4:8~ | "D" D4:h r:q D4:q | "G" G4:h. A4:q | B4:h. G4:8 E4:8 | "D" D4:q E4:q G4:h |]`,
  // "Simple Gifts" (Joseph Brackett, 1848), in F.
  gifts: `C4:8 C4:8 | "F" F4:q F4:8 G4:8 A4:8 F4:8 A4:8 Bb4:8 | C5:q C5:8 Bb4:8 A4:q G4:8 F4:8 | "C" G4:q G4:q G4:8 A4:8 G4:8 E4:8 |
           C4:q C4:8 C4:8 C4:8 E4:8 G4:8 C5:8 | "F" A4:q. G4:8 F4:q A4:8 Bb4:8 | C5:q C5:8 Bb4:8 A4:q G4:8 F4:8 | "C" G4:q G4:8 A4:8 G4:q F4:q | "F" F4:h. r:q |]`,
  // An air in A, 3/4 (written for this corpus).
  airA: `E4:q | "A" A4:h B4:q | C5:q. B4:8 A4:q | "D" F#4:h. | F#4:h E4:q | "A" A4:h B4:q | C5:h E5:q | "E" B4:h. | r:h E4:q |
           "A" A4:h B4:q | C5:q. B4:8 A4:q | "D" D5:h C5:q | "E" B4:h A4:q | C5:q B4:q A4:q | B4:h E4:q | "A" A4:h |]`,
};

// ------------------------------------------------------------------------------------------
// The pages
// ------------------------------------------------------------------------------------------

/** Digit faces for tab numbers that no template was drawn from. */
const TAB_FACES = {
  ipag: { family: 'IPAGothic', weight: 400, style: 'normal' },
  wqy: { family: 'WenQuanYi Zen Hei', weight: 400, style: 'normal' },
  unifont: { family: 'Unifont', weight: 400, style: 'normal' },
  caladeaItalic: { family: 'Caladea', weight: 400, style: 'italic' },
  carlitoCond: { family: 'Carlito', weight: 700, style: 'normal', condense: 0.7 },
  heavy: { family: 'Liberation Sans', weight: 700, style: 'normal', heavy: 0.09 },
  serifSmall: { family: 'Liberation Serif', weight: 400, style: 'normal' },
  hand: { hand: true },
};

/**
 * Engraving knobs: space = notation staff space px; tab = tab line distance px; line = staff line
 * thickness (spaces); spacing factor; stem length (spaces); beams 'flat' | 'normal' | 'steep';
 * cue = note size factor; digit = tab digit height (tab spaces); mode 'knock' | 'through'.
 */
const PAGES = [
  // ---- notation only ----
  { id: 'un-walk-gonville-s9', kind: 'notation', font: 'Gonville', key: 'D', time: '4/4', src: () => walk(101, 'D', 4, 4, 10, 'D4', 11), space: 9, line: 0.06, spacing: 0.7, stem: 3.0, beams: 'flat', width: 1100 },
  { id: 'un-walk-petaluma-s17', kind: 'notation', font: 'Petaluma', key: 'Bb', time: '3/4', src: () => walk(202, 'Bb', 3, 4, 8, 'F4', 10), space: 17, line: 0.2, spacing: 1.25, stem: 3.9, beams: 'steep', width: 1700 },
  { id: 'un-cue-bravura-s12', kind: 'notation', font: 'Bravura', key: 'Em', time: '6/8', src: () => walk(303, 'Em', 6, 8, 8, 'E4', 9), space: 12, line: 0.1, spacing: 1.0, stem: 3.4, beams: 'normal', cue: 0.72, width: 1250 },
  { id: 'un-saints-bravura-s8', kind: 'notation', font: 'Bravura', key: 'C', time: '4/4', title: 'When the Saints Go Marching In', src: () => TUNES.saints, space: 8, line: 0.12, spacing: 0.8, stem: 3.5, beams: 'normal', width: 900 },
  { id: 'un-air-gonville-s14', kind: 'notation', font: 'Gonville', key: 'D', time: '4/4', title: 'Air in D', src: () => TUNES.airD, space: 14, line: 0.14, spacing: 1.0, stem: 3.3, beams: 'normal', width: 1500, pickup: true },
  { id: 'un-chords-petaluma-s11', kind: 'notation', font: 'Petaluma', key: 'A', time: '4/4', src: () => walk(404, 'A', 4, 4, 8, 'A4', 7, { chords: 0.45, rests: 0.04 }), space: 11, line: 0.1, spacing: 0.85, stem: 3.6, beams: 'normal', width: 1250 },
  { id: 'un-triplets-leland-s13', kind: 'notation', font: 'Leland', key: 'G', time: '4/4', src: () => walk(505, 'G', 4, 4, 8, 'D4', 10, { triplets: true }), space: 13, line: 0.08, spacing: 1.1, stem: 2.8, beams: 'steep', width: 1400 },
  { id: 'un-page-gifts-bravura-s10', kind: 'notation', font: 'Bravura', key: 'F', time: '4/4', title: 'Simple Gifts', composer: 'Joseph Brackett, 1848', tempo: 'Moderato', page: true, pickup: true,
    src: () => `${TUNES.gifts.replace('|]', '||')} ${walk(606, 'F', 4, 4, 12, 'C4', 10)}`, space: 10, line: 0.11, spacing: 0.95, stem: 3.2, beams: 'normal', width: 1240, height: 1754 },

  // ---- tab only ----
  { id: 'ut-ipag-knock-t12', kind: 'tab', face: 'ipag', mode: 'knock', digit: 0.95, time: '4/4', src: () => tabWalk(11, 8, 4, { chords: 0.25 }), tab: 12, line: 0.08, spacing: 1.0, width: 1150, tabClef: true },
  { id: 'ut-hand-through-t14', kind: 'tab', face: 'hand', mode: 'through', digit: 0.95, time: '4/4', src: () => tabWalk(22, 8, 4, { chords: 0.2 }), tab: 14, line: 0.07, spacing: 1.1, width: 1300, tabClef: true },
  { id: 'ut-condensed-knock-t10', kind: 'tab', face: 'carlitoCond', mode: 'knock', digit: 1.0, time: '4/4', src: () => tabWalk(33, 8, 4, { position: 9, chords: 0.2 }), tab: 10, line: 0.1, spacing: 0.85, width: 1000, tabClef: false },
  { id: 'ut-italic-through-t13', kind: 'tab', face: 'caladeaItalic', mode: 'through', digit: 1.0, time: '4/4', src: () => tabWalk(44, 8, 4, { position: 2 }), tab: 13, line: 0.09, spacing: 1.0, width: 1250, tabClef: true },
  { id: 'ut-small-knock-t16', kind: 'tab', face: 'serifSmall', mode: 'knock', digit: 0.72, time: '4/4', src: () => tabWalk(55, 8, 4, { chords: 0.3 }), tab: 16, line: 0.06, spacing: 1.0, width: 1450, tabClef: true },
  { id: 'ut-unifont-knock-t15', kind: 'tab', face: 'unifont', mode: 'knock', digit: 0.95, time: '4/4', src: () => tabWalk(66, 8, 4, { position: 7 }), tab: 15, line: 0.1, spacing: 1.0, width: 1400, tabClef: true },
  { id: 'ut-wqy-rhythm-t12', kind: 'tab', face: 'wqy', mode: 'knock', digit: 0.95, time: '4/4', src: () => tabWalk(77, 8, 4, { rests: 0.08, sixteenths: true }), tab: 12, line: 0.08, spacing: 1.05, width: 1250, tabClef: true, rhythm: true, timeSig: true, stem: 2.6 },
  { id: 'ut-heavy-rhythm-t14', kind: 'tab', face: 'heavy', mode: 'through', digit: 0.95, time: '3/4', src: () => tabWalk(88, 8, 3, { rests: 0.06 }), tab: 14, line: 0.12, spacing: 1.0, width: 1300, tabClef: true, rhythm: true, timeSig: true, stem: 2.2 },
  { id: 'ut-page-hand-t11', kind: 'tab', face: 'hand', mode: 'knock', digit: 0.9, time: '4/4', title: 'Position Etudes', page: true, src: () => tabWalk(99, 24, 4, { chords: 0.2, position: 3 }), tab: 11, line: 0.08, spacing: 1.0, width: 1240, height: 1754, tabClef: true },

  // ---- notation + tab ----
  { id: 'ul-walk-gonville-ipag', kind: 'linked', font: 'Gonville', key: 'G', time: '4/4', src: () => walk(111, 'G', 4, 4, 8, 'D4', 10), space: 11, tab: 15, face: 'ipag', mode: 'knock', digit: 0.95, line: 0.09, spacing: 1.0, stem: 3.3, beams: 'normal', width: 1300, barThrough: false },
  { id: 'ul-air-petaluma-hand', kind: 'linked', font: 'Petaluma', key: 'D', time: '4/4', title: 'Air in D', src: () => TUNES.airD, space: 12, tab: 16, face: 'hand', mode: 'through', digit: 0.95, line: 0.13, spacing: 1.05, stem: 3.6, beams: 'steep', width: 1400, barThrough: true, pickup: true },
  { id: 'ul-chords-bravura-cond', kind: 'linked', font: 'Bravura', key: 'C', time: '3/4', src: () => walk(222, 'C', 3, 4, 8, 'G4', 7, { chords: 0.4 }), space: 9, tab: 13, face: 'carlitoCond', mode: 'knock', digit: 1.0, line: 0.07, spacing: 0.75, stem: 3.0, beams: 'flat', width: 1100, barThrough: false },
  { id: 'ul-cue-bravura-italic', kind: 'linked', font: 'Bravura', key: 'E', time: '4/4', src: () => walk(333, 'E', 4, 4, 6, 'E4', 11), space: 13, tab: 17, face: 'caladeaItalic', mode: 'knock', digit: 1.0, line: 0.1, spacing: 1.1, stem: 3.5, beams: 'normal', cue: 0.75, width: 1400, barThrough: true },
  { id: 'ul-air-a-gonville-wqy', kind: 'linked', font: 'Gonville', key: 'A', time: '3/4', title: 'Air in A', src: () => TUNES.airA, space: 10, tab: 14, face: 'wqy', mode: 'through', digit: 1.0, line: 0.16, spacing: 0.9, stem: 3.4, beams: 'normal', width: 1240, barThrough: true, pickup: true },
  { id: 'ul-page-petaluma-small', kind: 'linked', font: 'Petaluma', key: 'Am', time: '4/4', title: 'Study in A Minor', tempo: 'Andante', page: true, src: () => walk(444, 'Am', 4, 4, 14, 'A3', 12), space: 9, tab: 13, face: 'serifSmall', mode: 'knock', digit: 0.75, line: 0.1, spacing: 0.95, stem: 3.3, beams: 'normal', width: 1240, height: 1754, barThrough: false },
];

// ------------------------------------------------------------------------------------------
// In-page engraver (self-contained: runs inside Chromium with VexFlow loaded)
// ------------------------------------------------------------------------------------------

/* global Vex, document */
function engravePage(spec) {
  const VF = Vex.Flow;
  VF.setMusicFont(spec.font || 'Bravura');
  const out = document.getElementById('out');
  out.innerHTML = '';
  const renderer = new VF.Renderer(out, VF.Renderer.Backends.SVG);
  const W = spec.width;
  const H0 = spec.height || 4000;
  renderer.resize(W, H0);
  const ctx = renderer.getContext();
  const svg = out.querySelector('svg');
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent = svg) => {
    const e = document.createElementNS(NS, tag);
    // VexFlow's root sets a thin black stroke that every child would inherit (grey outlines on knock-outs).
    if (tag !== 'g' && attrs.stroke === undefined) e.setAttribute('stroke', 'none');
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    parent.appendChild(e);
    return e;
  };
  el('rect', { x: 0, y: 0, width: W, height: H0, fill: '#fff' });
  const r = (() => {
    let a = spec.seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const box = (b) => [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100);
  const meas = document.createElement('canvas').getContext('2d');

  const hasN = spec.kind !== 'tab';
  const hasT = spec.kind !== 'notation';
  const S = spec.space || 10;
  const T = spec.tab || 13;
  const point = 3.857 * S;
  const cue = spec.cue || 1;
  const lineW = Math.max(0.6, spec.line * (hasN ? S : T));
  const stemW = Math.max(0.8, 0.11 * S * cue);
  const barW = Math.max(0.9, 0.16 * (hasN ? S : T));

  /** Draw a music glyph and return its SVG bounding box. */
  const glyph = (code, x, y, pt = point) => {
    const g = ctx.openGroup('glyph');
    VF.Glyph.renderGlyph(ctx, x, y, pt, code);
    ctx.closeGroup();
    return g.getBBox();
  };
  const glyphWidth = (code, pt = point) => VF.Glyph.getWidth(code, pt);
  /** Point size at which a time-signature digit is `h` px tall (the fonts draw them at different sizes). */
  const tsPoint = (h) => {
    const g = ctx.openGroup('probe');
    VF.Glyph.renderGlyph(ctx, -500, -500, 100, 'timeSig0');
    ctx.closeGroup();
    const bh = g.getBBox().height;
    g.remove();
    return (100 * h) / bh;
  };

  // ---------------- layout of the music into systems ----------------
  const measures = spec.measures;
  const [beats, beatValue] = spec.time.split('/').map(Number);
  const fifths = spec.fifths;
  const margin = Math.round(0.07 * W);
  const usable = W - 2 * margin;
  const sp = spec.spacing;
  // Column width of an event, in px: grows with the log of its length.
  const unit = hasN ? S : 0.8 * T;
  const evWidth = (ev) => {
    const w = unit * sp * (1.15 + 0.95 * Math.log2(ev.ticks / 240 + 1));
    const acc = hasN && ev.accCount ? 1.2 * S * cue : 0;
    const wideFret = hasT && ev.notes.some((n) => n.fret >= 10) ? 0.4 * T : 0;
    return Math.max(w, (hasT ? 1.4 * T : 0) + wideFret) + acc + (ev.dots ? 0.5 * S : 0);
  };
  // Accidentals printed (key signature + bar-scoped state; ties carry).
  const keyAlt = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  const SH = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  for (let i = 0; i < Math.abs(fifths); i++) keyAlt[fifths > 0 ? SH[i] : SH[6 - i]] = fifths > 0 ? 1 : -1;
  let prevTied = new Set();
  for (const m of measures) {
    const state = {};
    for (const ev of m.events) {
      ev.accCount = 0;
      const tiedNow = new Set();
      for (const n of ev.notes) {
        const k = `${n.step}${n.octave}`;
        const cur = state[k] !== undefined ? state[k] : keyAlt[n.step];
        n.printed = null;
        if (prevTied.has(n.written)) {
          state[k] = n.alter;
        } else if (cur !== n.alter) {
          n.printed = n.alter === 1 ? '#' : n.alter === -1 ? 'b' : 'n';
          state[k] = n.alter;
          ev.accCount++;
        }
        if (ev.tie) tiedNow.add(n.written);
      }
      prevTied = tiedNow;
    }
  }
  // Header widths from the glyphs themselves (music fonts differ a lot: Petaluma's sharps are twice Bravura's).
  const clefW = hasN ? glyphWidth('gClef') : 0;
  const keyWidth = hasN ? Math.abs(fifths) * (glyphWidth(fifths > 0 ? 'accidentalSharp' : 'accidentalFlat') + 0.25 * S) : 0;
  const tsP = hasN ? tsPoint(2 * S) : 0;
  const timeW = hasN ? Math.max(glyphWidth(`timeSig${beats}`, tsP), glyphWidth(`timeSig${beatValue}`, tsP)) : 0;
  const headerN = (first) => 1.2 * S + clefW + keyWidth + (first || spec.timeEverySystem ? 0.6 * S + timeW : 0) + 1.3 * S;
  const headerT = (first) => (spec.tabClef ? 2.2 * T : 0.6 * T) + (spec.timeSig && first ? 2.4 * T : 0) + 0.4 * T;
  const header = (first) => Math.max(hasN ? headerN(first) : 0, hasT ? headerT(first) : 0);
  const mWidth = (m) => 1.0 * unit + m.events.reduce((a, e) => a + evWidth(e), 0) + 0.4 * unit;
  const systems = [];
  let cur = [];
  let curW = 0;
  measures.forEach((m) => {
    const w = mWidth(m);
    const avail = usable - header(systems.length === 0);
    if (cur.length && curW + w > avail) {
      systems.push(cur);
      cur = [];
      curW = 0;
    }
    cur.push(m);
    curW += w;
  });
  if (cur.length) systems.push(cur);

  // ---------------- vertical geometry ----------------
  const truthSystems = [];
  const texts = [];
  let y = margin * 0.6;
  if (spec.title) {
    const size = Math.round((hasN ? S : T) * 2.1);
    const t = el('text', { x: W / 2, y: y + size, 'font-family': 'Liberation Serif', 'font-size': size, 'font-weight': 700, 'text-anchor': 'middle' });
    t.textContent = spec.title;
    const b = t.getBBox();
    texts.push({ kind: 'title', text: spec.title, bbox: box(b) });
    y += size * 1.8;
    if (spec.composer) {
      const c = el('text', { x: W - margin, y, 'font-family': 'Liberation Serif', 'font-size': Math.round(size * 0.5), 'font-style': 'italic', 'text-anchor': 'end' });
      c.textContent = spec.composer;
      texts.push({ kind: 'composer', text: spec.composer, bbox: box(c.getBBox()) });
      y += size * 0.6;
    }
  }
  const notationTop = (sy) => sy;
  const nLineY = (sy, l) => notationTop(sy) + l * S;
  const posY = (sy, pos) => notationTop(sy) + 4 * S - (pos * S) / 2;

  const drawStaffLines = (x0, x1, ys) => {
    for (const ly of ys) el('rect', { x: x0, y: ly - lineW / 2, width: x1 - x0, height: lineW, fill: '#000' });
  };

  systems.forEach((sysMeasures, si) => {
    const first = si === 0;
    const last = si === systems.length - 1;
    const hdr = header(first);
    // Justify (the last system stays at its natural width when it is short).
    const natural = sysMeasures.reduce((a, m) => a + mWidth(m), 0);
    const avail = usable - hdr;
    const stretch = last && natural < 0.72 * avail ? 1 : avail / natural;
    const x0 = margin;
    const x1 = last && stretch === 1 ? margin + hdr + natural : W - margin;
    // Vertical: chord symbols / ledger room above, notation, gap, tab, rhythm room below.
    const above = hasN ? 4.2 * S : 2.2 * T;
    if (spec.tempo && first) y += 1.5 * (hasN ? S : T);
    const nTop = y + above;
    const tTop = hasN ? nTop + 4 * S + Math.max(5.5 * S, 3.4 * T) : nTop;
    const tLines = hasT ? [0, 1, 2, 3, 4, 5].map((l) => tTop + l * T) : [];
    const nLines = hasN ? [0, 1, 2, 3, 4].map((l) => nLineY(nTop, l)) : [];
    const bottom = hasT ? tLines[5] + (spec.rhythm ? 3.6 * T : 2.2 * T) : nLines[4] + 4.5 * S;
    if (spec.tempo && first) {
      const t = el('text', { x: x0, y: (hasN ? nTop - 3.2 * S : tTop - 2.4 * T), 'font-family': 'Liberation Sans', 'font-size': Math.round(1.5 * (hasN ? S : T)), 'font-weight': 700 });
      t.textContent = spec.tempo;
      texts.push({ kind: 'tempo', text: spec.tempo, bbox: box(t.getBBox()) });
    }
    if (hasN) drawStaffLines(x0, x1, nLines);
    if (hasT) drawStaffLines(x0, x1, tLines);

    // Header glyphs.
    const nStaff = hasN ? { kind: 'notation', lineCount: 5, lines: nLines, x0, x1, space: S, lineThickness: lineW, clef: null, time: null, key: null, barlines: [], measures: [], ties: [], beams: [] } : null;
    const tStaff = hasT ? { kind: 'tab', lineCount: 6, lines: tLines, x0, x1, space: T, lineThickness: lineW, clef: null, time: null, stems: !!spec.rhythm, lineThrough: spec.mode === 'through', barlines: [], measures: [] } : null;
    if (hasN) {
      const cb = glyph('gClef', x0 + 0.6 * S, posY(nTop, 2));
      nStaff.clef = { type: 'treble', bbox: box(cb) };
      let kx = cb.x + cb.width + 0.6 * S;
      const sharpPos = [8, 5, 9, 6, 3, 7, 4];
      const flatPos = [4, 7, 3, 6, 2, 5, 1];
      let kb = null;
      for (let i = 0; i < Math.abs(fifths); i++) {
        const b = glyph(fifths > 0 ? 'accidentalSharp' : 'accidentalFlat', kx, posY(nTop, (fifths > 0 ? sharpPos : flatPos)[i]));
        kb = kb ? { x: Math.min(kb.x, b.x), y: Math.min(kb.y, b.y), x2: Math.max(kb.x2, b.x + b.width), y2: Math.max(kb.y2, b.y + b.height) } : { x: b.x, y: b.y, x2: b.x + b.width, y2: b.y + b.height };
        kx += b.width + 0.25 * S;
      }
      nStaff.key = { name: spec.key, fifths, bbox: kb ? [kb.x, kb.y, kb.x2 - kb.x, kb.y2 - kb.y].map((v) => Math.round(v * 100) / 100) : null };
      if (first || spec.timeEverySystem) {
        const tx = kx + 0.6 * S;
        const tp = tsPoint(2 * S);
        const b1 = glyph(`timeSig${beats}`, tx, posY(nTop, 6), tp);
        const b2 = glyph(`timeSig${beatValue}`, tx, posY(nTop, 2), tp);
        const bx0 = Math.min(b1.x, b2.x);
        const by0 = Math.min(b1.y, b2.y);
        nStaff.time = { num: beats, den: beatValue, bbox: [bx0, by0, Math.max(b1.x + b1.width, b2.x + b2.width) - bx0, Math.max(b1.y + b1.height, b2.y + b2.height) - by0].map((v) => Math.round(v * 100) / 100) };
      }
    }
    if (hasT) {
      if (spec.tabClef) {
        const size = 1.25 * T;
        const letters = ['T', 'A', 'B'];
        let bb = null;
        letters.forEach((L, i) => {
          const t = el('text', { x: x0 + 0.9 * T, y: tLines[0] + (i + 0.95) * 1.6 * T + 0.2 * T, 'font-family': 'Liberation Sans', 'font-size': size, 'font-weight': 700, 'text-anchor': 'middle' });
          t.textContent = L;
          const b = t.getBBox();
          bb = bb ? { x: Math.min(bb.x, b.x), y: Math.min(bb.y, b.y), x2: Math.max(bb.x2, b.x + b.width), y2: Math.max(bb.y2, b.y + b.height) } : { x: b.x, y: b.y, x2: b.x + b.width, y2: b.y + b.height };
        });
        tStaff.clef = { type: 'tab', bbox: [bb.x, bb.y, bb.x2 - bb.x, bb.y2 - bb.y].map((v) => Math.round(v * 100) / 100) };
      }
      if (spec.timeSig && first) {
        const tx = x0 + (spec.tabClef ? 2.2 * T : 0.6 * T);
        const pt = tsPoint(2.4 * T);
        const mid = (tLines[0] + tLines[5]) / 2;
        const b1 = glyph(`timeSig${beats}`, tx, mid - 1.25 * T, pt);
        const b2 = glyph(`timeSig${beatValue}`, tx, mid + 1.25 * T, pt);
        const bx0 = Math.min(b1.x, b2.x);
        const by0 = Math.min(b1.y, b2.y);
        tStaff.time = { num: beats, den: beatValue, bbox: [bx0, by0, Math.max(b1.x + b1.width, b2.x + b2.width) - bx0, Math.max(b1.y + b1.height, b2.y + b2.height) - by0].map((v) => Math.round(v * 100) / 100) };
      }
    }

    // Opening line: joins the staves of a linked system; single staves have none.
    const barlineTruth = (staff, x, type, strokes, yTop, yBot) => {
      const xs = strokes.map((s) => s[0]);
      const x0b = Math.min(...xs);
      const x1b = Math.max(...strokes.map((s) => s[0] + s[1]));
      staff.barlines.push({ type, x: Math.round(((x0b + x1b) / 2) * 100) / 100, bbox: [x0b, yTop, x1b - x0b, yBot - yTop].map((v) => Math.round(v * 100) / 100), strokes: strokes.map(([a, w]) => [Math.round(a * 100) / 100, Math.round(w * 100) / 100]) });
    };
    const drawBar = (x, type) => {
      const strokes = [];
      if (type === 'single') strokes.push([x - barW / 2, barW]);
      else if (type === 'double') strokes.push([x - 0.5 * S - barW, barW], [x - barW, barW]);
      else if (type === 'end') {
        const thick = 0.5 * (hasN ? S : T);
        strokes.push([x - thick - 0.45 * (hasN ? S : T) - barW, barW], [x - thick, thick]);
      }
      const spans = [];
      if (hasN && hasT && spec.barThrough) spans.push([nLines[0], tLines[5], [nStaff, tStaff]]);
      else {
        if (hasN) spans.push([nLines[0], nLines[4], [nStaff]]);
        if (hasT) spans.push([tLines[0], tLines[5], [tStaff]]);
      }
      for (const [ya, yb, staves] of spans) {
        for (const [sx, sw] of strokes) el('rect', { x: sx, y: ya - lineW / 2, width: sw, height: yb - ya + lineW, fill: '#000' });
        for (const st of staves) {
          const top = st.lines[0] - lineW / 2;
          const bot = st.lines[st.lines.length - 1] + lineW / 2;
          barlineTruth(st, x, type, strokes, top, bot);
        }
      }
    };
    if (hasN && hasT) {
      el('rect', { x: x0, y: nLines[0] - lineW / 2, width: barW, height: tLines[5] - nLines[0] + lineW, fill: '#000' });
      for (const st of [nStaff, tStaff]) barlineTruth(st, x0, 'single', [[x0, barW]], st.lines[0] - lineW / 2, st.lines[st.lines.length - 1] + lineW / 2);
    }

    // ---------------- measures and events ----------------
    let x = x0 + hdr;
    const allEvents = [];
    sysMeasures.forEach((m, mi) => {
      const mx0 = mi === 0 ? x0 : x;
      let ex = x + 1.0 * unit * stretch;
      const nEvents = [];
      const tEvents = [];
      for (const ev of m.events) {
        const w = evWidth(ev) * stretch;
        const accRoom = hasN && ev.accCount ? 1.2 * S * cue : 0;
        ev.x = ex + accRoom + 0.5 * Math.min(w - accRoom, 1.6 * unit);
        ev.system = si;
        allEvents.push(ev);
        ex += w;
      }
      x = ex + 0.4 * unit * stretch;
      const mx1 = x;
      const endType = last && mi === sysMeasures.length - 1 ? (m.end === 'end' ? 'end' : m.end) : m.end === 'end' ? 'single' : m.end;
      drawBar(mx1, endType === 'double' || endType === 'end' ? endType : 'single');
      for (const st of [nStaff, tStaff]) if (st) st.measures.push({ index: m.index, x0: mx0, x1: mx1, events: st === nStaff ? nEvents : tEvents });
      m.nEvents = nEvents;
      m.tEvents = tEvents;
    });
    // Align the staff ends with the last bar line.
    const xEnd = x;
    if (Math.abs(xEnd - x1) > 0.5) {
      for (const st of [nStaff, tStaff]) if (st) st.x1 = xEnd;
    }

    // ---------------- notation ----------------
    if (hasN) {
      const headCode = (ev) => (ev.value === 'whole' ? 'noteheadWhole' : ev.value === 'half' ? 'noteheadHalf' : 'noteheadBlack');
      const hw = glyphWidth('noteheadBlack', point * cue);
      // Beam groups: eighths and shorter within one beat (dotted quarter in compound time).
      const compound = beatValue === 8 && beats % 3 === 0;
      const groupTicks = compound ? 1440 : 3840 / beatValue === 480 ? 1440 : 960;
      const groups = [];
      for (const m of sysMeasures) {
        let t = 0;
        let g = [];
        for (const ev of m.events) {
          const beam = !ev.rest && (ev.value === 'eighth' || ev.value === '16th');
          const gi = Math.floor(t / groupTicks);
          if (!beam || (g.length && Math.floor(g[0].t / groupTicks) !== gi)) {
            if (g.length) groups.push(g);
            g = [];
          }
          if (beam) g.push({ ev, t });
          t += ev.ticks;
        }
        if (g.length) groups.push(g);
      }
      for (const g of groups) for (const it of g) it.ev.group = g.length > 1 ? g : null;
      // Stem direction and heads.
      for (const ev of allEvents) {
        const nEv = { type: ev.rest ? 'rest' : 'note', x: 0, duration: { value: ev.value, dots: ev.dots, ticks: ev.ticks, ...(ev.tuplet ? { tuplet: ev.tuplet } : {}) }, bbox: null, notes: [], stem: null, beamed: false, flagged: false, dotBoxes: [] };
        ev.nEv = nEv;
        if (ev.chord) {
          const t = el('text', { x: ev.x, y: nTop - 2.4 * S, 'font-family': spec.font === 'Petaluma' ? 'Bricolage Grotesque' : 'Liberation Sans', 'font-size': Math.round(1.55 * S), 'text-anchor': 'middle' });
          t.textContent = ev.chord;
          const b = t.getBBox();
          texts.push({ kind: 'chord', text: ev.chord, bbox: box(b), system: si, measure: ev.measureIndex });
          nEv.chord = ev.chord;
        }
        if (ev.rest) {
          const code = { whole: 'restWhole', half: 'restHalf', quarter: 'restQuarter', eighth: 'rest8th', '16th': 'rest16th' }[ev.value];
          const pos = ev.value === 'whole' ? 6 : 4;
          const w = glyphWidth(code);
          const b = glyph(code, ev.x - w / 2, posY(nTop, pos));
          nEv.head = box(b);
          nEv.bbox = box(b);
          nEv.x = Math.round((b.x + b.width / 2) * 100) / 100;
          if (ev.dots) {
            const db = glyph('augmentationDot', b.x + b.width + 0.3 * S, posY(nTop, 5));
            nEv.dotBoxes.push(box(db));
          }
          continue;
        }
        const poss = ev.notes.map((n) => n.pos);
        const mean = poss.reduce((a, b) => a + b, 0) / poss.length;
        const groupMean = ev.group ? ev.group.flatMap((it) => it.ev.notes.map((n) => n.pos)).reduce((a, b, _, arr) => a + b / arr.length, 0) : mean;
        ev.up = (ev.group ? groupMean : mean) < 4;
        if (ev.value === 'whole') ev.up = null;
      }
      // Draw heads, accidentals, dots, ledger lines.
      for (const ev of allEvents) {
        if (ev.rest) continue;
        const nEv = ev.nEv;
        const code = ev.value === 'whole' ? 'noteheadWhole' : ev.value === 'half' ? 'noteheadHalf' : 'noteheadBlack';
        const w = glyphWidth(code, point * cue);
        const notes = ev.notes.slice().sort((a, b) => a.pos - b.pos);
        // Seconds: one of the two heads goes to the other side of the stem.
        const shift = new Map();
        if (ev.up !== false) {
          for (let i = 1; i < notes.length; i++) if (notes[i].pos - notes[i - 1].pos === 1 && !shift.get(notes[i - 1])) shift.set(notes[i], 1);
        } else {
          for (let i = notes.length - 2; i >= 0; i--) if (notes[i + 1].pos - notes[i].pos === 1 && !shift.get(notes[i + 1])) shift.set(notes[i], -1);
        }
        const baseX = ev.x - w / 2;
        let minX = Infinity;
        let maxX = -Infinity;
        for (const n of notes) {
          const hx = baseX + (shift.get(n) || 0) * (w - stemW * 0.5);
          const b = glyph(code, hx, posY(nTop, n.pos), point * cue);
          n.head = box(b);
          minX = Math.min(minX, b.x);
          maxX = Math.max(maxX, b.x + b.width);
          // Ledger lines.
          const ledgers = [];
          if (n.pos <= -2) for (let p = -2; p >= n.pos; p -= 2) ledgers.push(p);
          if (n.pos >= 10) for (let p = 10; p <= n.pos; p += 2) ledgers.push(p);
          for (const p of ledgers) {
            const lw = w * 1.55;
            el('rect', { x: hx + w / 2 - lw / 2, y: posY(nTop, p) - lineW * 0.6, width: lw, height: lineW * 1.2, fill: '#000' });
          }
          n.ledger = ledgers.length;
        }
        // Accidentals, staggered when they would collide.
        let accX = minX - 0.25 * S * cue;
        let lastAccPos = null;
        for (const n of notes.slice().reverse()) {
          if (!n.printed) continue;
          const code2 = n.printed === '#' ? 'accidentalSharp' : n.printed === 'b' ? 'accidentalFlat' : 'accidentalNatural';
          const aw = glyphWidth(code2, point * cue);
          if (lastAccPos !== null && lastAccPos - n.pos < 6) accX -= aw + 0.15 * S;
          const b = glyph(code2, accX - aw, posY(nTop, n.pos), point * cue);
          n.accBox = box(b);
          lastAccPos = n.pos;
        }
        if (ev.dots) {
          for (const n of notes) {
            const dp = n.pos % 2 === 0 ? n.pos + 1 : n.pos;
            const db = glyph('augmentationDot', maxX + 0.35 * S, posY(nTop, dp), point * cue);
            nEv.dotBoxes.push(box(db));
          }
        }
        ev.headMinX = minX;
        ev.headMaxX = maxX;
        ev.headW = w;
        nEv.x = Math.round((notes.reduce((a, n) => a + n.head[0] + n.head[2] / 2, 0) / notes.length) * 100) / 100;
        nEv.notes = notes.map((n) => ({
          written: n.written, midi: n.written - 12, step: n.step, alter: n.alter, octave: n.octave, pos: n.pos, ledger: n.ledger,
          accidental: n.printed, accBox: n.accBox || null, head: n.head, headType: ev.value === 'whole' ? 'whole' : ev.value === 'half' ? 'open' : 'filled',
          tieStart: !!ev.tie, tieStop: !!n.tieStop, string: n.string, fret: n.fret,
        }));
      }
      // Stems, beams, flags.
      const L = spec.stem * S * (cue < 1 ? 0.8 : 1);
      const stemOf = (ev) => {
        const notes = ev.notes;
        const lo = Math.min(...notes.map((n) => n.pos));
        const hi = Math.max(...notes.map((n) => n.pos));
        const sx = ev.up ? ev.x - ev.headW / 2 + ev.headW - stemW / 2 : ev.x - ev.headW / 2 + stemW / 2;
        const yFar = ev.up ? posY(nTop, lo) - 0.15 * S : posY(nTop, hi) + 0.15 * S;
        const yNear = ev.up ? posY(nTop, hi) : posY(nTop, lo);
        return { sx, yFar, yNear };
      };
      const doneGroups = new Set();
      for (const ev of allEvents) {
        if (ev.rest || ev.value === 'whole') continue;
        if (ev.group && !doneGroups.has(ev.group)) {
          const g = ev.group;
          doneGroups.add(g);
          const up = g[0].ev.up;
          const st = g.map((it) => ({ ev: it.ev, ...stemOf(it.ev) }));
          const a = st[0];
          const b = st[st.length - 1];
          const contour = (posY(nTop, b.ev.notes[0].pos) - posY(nTop, a.ev.notes[0].pos)) / Math.max(1, b.sx - a.sx);
          const maxSlope = spec.beams === 'flat' ? 0 : spec.beams === 'steep' ? 0.6 : 0.18;
          const k = Math.max(-maxSlope, Math.min(maxSlope, contour * (spec.beams === 'steep' ? 1 : 0.5)));
          // Beam line y = c + k * x, every stem at least L long.
          let c = up ? Infinity : -Infinity;
          for (const s of st) {
            const want = up ? s.yNear - L - k * s.sx : s.yNear + L - k * s.sx;
            c = up ? Math.min(c, want) : Math.max(c, want);
          }
          // Keep beams off the far side of the staff.
          const beamTh = 0.5 * S * cue;
          for (const s of st) {
            const yb = c + k * s.sx;
            el('rect', { x: s.sx - stemW / 2, y: Math.min(yb, s.yFar), width: stemW, height: Math.abs(s.yFar - yb), fill: '#000' });
            s.ev.nEv.stem = up ? 'up' : 'down';
            s.ev.nEv.beamed = true;
          }
          const beamPoly = (xa, xb, off) => {
            const ya = c + k * xa + off;
            const yb = c + k * xb + off;
            const d = up ? beamTh : -beamTh;
            const p = el('path', { d: `M${xa - stemW / 2},${ya} L${xb + stemW / 2},${yb} L${xb + stemW / 2},${yb + d} L${xa - stemW / 2},${ya + d} Z`, fill: '#000' });
            nStaff.beams.push(box(p.getBBox()));
          };
          beamPoly(a.sx, b.sx, 0);
          // Second beam for sixteenths: across neighbours, or a short hook.
          const off2 = (up ? 1 : -1) * (beamTh + 0.25 * S * cue);
          for (let i = 0; i < st.length; i++) {
            if (st[i].ev.value !== '16th') continue;
            let j = i;
            while (j + 1 < st.length && st[j + 1].ev.value === '16th') j++;
            if (j > i) beamPoly(st[i].sx, st[j].sx, off2);
            else {
              const dir = i > 0 ? -1 : 1;
              const xa = dir < 0 ? st[i].sx - 0.9 * S : st[i].sx;
              const xb = dir < 0 ? st[i].sx : st[i].sx + 0.9 * S;
              beamPoly(xa, xb, off2);
            }
            i = j;
          }
          continue;
        }
        if (ev.group) continue;
        const s = stemOf(ev);
        const yTip = ev.up ? s.yNear - L : s.yNear + L;
        el('rect', { x: s.sx - stemW / 2, y: Math.min(yTip, s.yFar), width: stemW, height: Math.abs(yTip - s.yFar), fill: '#000' });
        ev.nEv.stem = ev.up ? 'up' : 'down';
        if (ev.value === 'eighth' || ev.value === '16th') {
          const code = `flag${ev.value === 'eighth' ? '8th' : '16th'}${ev.up ? 'Up' : 'Down'}`;
          const fb = glyph(code, s.sx - stemW / 2, yTip, point * cue);
          ev.nEv.flagged = true;
          ev.nEv.flagBox = box(fb);
        }
      }
      // Ties: arcs to the next event's same pitch.
      for (let i = 0; i < allEvents.length; i++) {
        const a = allEvents[i];
        if (!a.tie || a.rest) continue;
        const b = allEvents[i + 1];
        for (const n of a.notes) {
          const m = b ? b.notes.find((q) => q.written === n.written) : { head: [xEnd - 0.2 * S, 0, 0, 0] };
          if (!m) continue;
          const below = a.up !== false;
          const ya = posY(nTop, n.pos) + (below ? 0.55 : -0.55) * S;
          const xa = n.head[0] + n.head[2] + 0.1 * S;
          const xb = m.head[0] - 0.1 * S;
          const h = Math.min(1.2 * S, 0.15 * (xb - xa) + 0.4 * S) * (below ? 1 : -1);
          const th = 0.16 * S * (below ? 1 : -1);
          const p = el('path', { d: `M${xa},${ya} Q${(xa + xb) / 2},${ya + 2 * h} ${xb},${ya} Q${(xa + xb) / 2},${ya + 2 * h - 2 * th} ${xa},${ya} Z`, fill: '#000' });
          nStaff.ties.push(box(p.getBBox()));
          const tn = b ? b.nEv.notes.find((q) => q.written === n.written) : null;
          if (tn) tn.tieStop = true;
        }
      }
      // Triplet brackets with an italic 3.
      for (let i = 0; i < allEvents.length; i++) {
        const ev = allEvents[i];
        if (!ev.tuplet || ev.tupletDone) continue;
        const grp = allEvents.slice(i, i + 3);
        grp.forEach((g) => { g.tupletDone = true; });
        const up = grp.some((g) => g.up !== false);
        const ys = grp.flatMap((g) => g.notes.map((n) => posY(nTop, n.pos)));
        // Just beyond the beam (or the stem ends), on the stem side.
        const yb = up ? Math.min(...ys) - (spec.stem + 0.9) * S : Math.max(...ys) + (spec.stem + 1.1) * S;
        const xa = grp[0].x - 0.6 * S;
        const xb = grp[grp.length - 1].x + 0.6 * S;
        const t = el('text', { x: (xa + xb) / 2, y: yb + 0.5 * S, 'font-family': 'Liberation Serif', 'font-size': Math.round(1.4 * S), 'font-style': 'italic', 'font-weight': 700, 'text-anchor': 'middle' });
        t.textContent = '3';
        nStaff.tuplets = nStaff.tuplets || [];
        nStaff.tuplets.push(box(t.getBBox()));
      }
      for (const ev of allEvents) {
        const nEv = ev.nEv;
        const parts = [...(nEv.notes || []).map((n) => n.head), ...(nEv.dotBoxes || [])];
        if (nEv.head) parts.push(nEv.head);
        if (parts.length && !nEv.bbox) {
          const bx0 = Math.min(...parts.map((p) => p[0]));
          const by0 = Math.min(...parts.map((p) => p[1]));
          nEv.bbox = [bx0, by0, Math.max(...parts.map((p) => p[0] + p[2])) - bx0, Math.max(...parts.map((p) => p[1] + p[3])) - by0].map((v) => Math.round(v * 100) / 100);
        }
      }
    }

    // ---------------- tab ----------------
    if (hasT) {
      const face = spec.faceDef;
      const digitH = spec.digit * T;
      const handDigit = (ch, cx, cy, h) => {
        // Stroke-drawn digits, unit box 0.6 x 1 (y down), jittered.
        const D = {
          0: [[[0.3, 0], [0.08, 0.15], [0.03, 0.5], [0.1, 0.88], [0.3, 1], [0.5, 0.88], [0.57, 0.5], [0.52, 0.15], [0.3, 0]]],
          1: [[[0.12, 0.2], [0.33, 0], [0.33, 1]]],
          2: [[[0.05, 0.22], [0.2, 0.03], [0.4, 0.02], [0.54, 0.2], [0.45, 0.48], [0.05, 0.98], [0.58, 0.98]]],
          3: [[[0.05, 0.1], [0.3, 0], [0.52, 0.13], [0.48, 0.36], [0.24, 0.47]], [[0.24, 0.47], [0.52, 0.6], [0.55, 0.83], [0.32, 1], [0.03, 0.92]]],
          4: [[[0.44, 1], [0.44, 0]], [[0.44, 0], [0.02, 0.68], [0.6, 0.68]]],
          5: [[[0.55, 0.01], [0.12, 0.01], [0.08, 0.43], [0.32, 0.38], [0.53, 0.5], [0.56, 0.77], [0.4, 0.97], [0.18, 0.99], [0.03, 0.88]]],
          6: [[[0.5, 0.04], [0.3, 0], [0.1, 0.2], [0.03, 0.6], [0.1, 0.92], [0.3, 1], [0.5, 0.9], [0.55, 0.7], [0.45, 0.52], [0.25, 0.48], [0.07, 0.6]]],
          7: [[[0.03, 0.01], [0.58, 0.01], [0.32, 0.55], [0.22, 1]]],
          8: [[[0.3, 0.47], [0.1, 0.36], [0.1, 0.12], [0.3, 0], [0.5, 0.12], [0.5, 0.36], [0.3, 0.47], [0.06, 0.6], [0.05, 0.86], [0.3, 1], [0.55, 0.86], [0.54, 0.6], [0.3, 0.47]]],
          9: [[[0.53, 0.4], [0.3, 0.5], [0.08, 0.4], [0.05, 0.18], [0.22, 0.02], [0.42, 0.01], [0.56, 0.16], [0.55, 0.45], [0.48, 0.78], [0.28, 1], [0.06, 0.92]]],
        };
        const slant = (r() - 0.5) * 0.16;
        const sc = h * (0.94 + 0.12 * r());
        const strokes = D[ch];
        let d = '';
        for (const s of strokes) {
          const pts = s.map(([px, py]) => [cx + (px - 0.3 + slant * (0.5 - py) + (r() - 0.5) * 0.05) * sc, cy + (py - 0.5 + (r() - 0.5) * 0.04) * sc]);
          d += `M${pts[0][0]},${pts[0][1]}`;
          for (let i = 1; i < pts.length; i++) {
            const p0 = pts[Math.max(0, i - 2)];
            const p1 = pts[i - 1];
            const p2 = pts[i];
            const p3 = pts[Math.min(pts.length - 1, i + 1)];
            const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
            const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
            d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
          }
        }
        return { d, width: 0.62 * sc, stroke: 0.11 * h };
      };
      const drawNumber = (text, cx, cy) => {
        // Returns the ink box; draws the knock-out first when asked.
        const g = el('g', {});
        let ink;
        if (face.hand) {
          const h = digitH;
          const parts = [];
          let total = 0;
          for (const ch of text) {
            const p = handDigit(ch, 0, 0, h);
            parts.push(p);
            total += p.width + 0.08 * h;
          }
          total -= 0.08 * h;
          let xx = cx - total / 2;
          const paths = [];
          for (const [i, ch] of [...text].entries()) {
            const p = handDigit(ch, xx + parts[i].width / 2, cy, h);
            paths.push(el('path', { d: p.d, fill: 'none', stroke: '#000', 'stroke-width': p.stroke, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g));
            xx += parts[i].width + 0.08 * h;
          }
          const bbs = paths.map((p) => p.getBBox());
          const pad = 0.055 * h;
          const x0b = Math.min(...bbs.map((b) => b.x)) - pad;
          const y0b = Math.min(...bbs.map((b) => b.y)) - pad;
          ink = [x0b, y0b, Math.max(...bbs.map((b) => b.x + b.width)) + pad - x0b, Math.max(...bbs.map((b) => b.y + b.height)) + pad - y0b];
        } else {
          meas.font = `${face.style} ${face.weight} 100px "${face.family}"`;
          const m0 = meas.measureText('0123456789');
          const capH = m0.actualBoundingBoxAscent + m0.actualBoundingBoxDescent;
          const size = (digitH / capH) * 100;
          meas.font = `${face.style} ${face.weight} ${size}px "${face.family}"`;
          const mm = meas.measureText(text);
          const cond = face.condense || 1;
          const left = cx - (mm.width / 2) * 1;
          const inkL = left - mm.actualBoundingBoxLeft;
          const inkR = left + mm.actualBoundingBoxRight;
          const base = cy + (mm.actualBoundingBoxAscent - mm.actualBoundingBoxDescent) / 2;
          const attrs = { x: cx, y: base, 'font-family': face.family, 'font-size': size, 'font-weight': face.weight, 'font-style': face.style, 'text-anchor': 'middle' };
          if (cond !== 1) attrs.transform = `translate(${cx},0) scale(${cond},1) translate(${-cx},0)`;
          if (face.heavy) Object.assign(attrs, { stroke: '#000', 'stroke-width': face.heavy * size, 'stroke-linejoin': 'round' });
          const t = el('text', attrs, g);
          t.textContent = text;
          const grow = face.heavy ? (face.heavy * size) / 2 : 0;
          const l = cx + (inkL - cx) * cond - grow;
          const rr = cx + (inkR - cx) * cond + grow;
          ink = [l, base - mm.actualBoundingBoxAscent - grow, rr - l, mm.actualBoundingBoxAscent + mm.actualBoundingBoxDescent + 2 * grow];
        }
        if (spec.mode === 'knock') {
          const pad = 0.14 * T;
          const rect = document.createElementNS(NS, 'rect');
          const ky0 = Math.max(cy - 0.5 * T + lineW, ink[1] - 0.06 * T);
          const ky1 = Math.min(cy + 0.5 * T - lineW, ink[1] + ink[3] + 0.06 * T);
          for (const [k, v] of Object.entries({ x: ink[0] - pad, y: Math.min(ky0, cy - lineW), width: ink[2] + 2 * pad, height: Math.max(ky1, cy + lineW) - Math.min(ky0, cy - lineW), fill: '#fff', stroke: 'none' })) rect.setAttribute(k, String(v));
          g.insertBefore(rect, g.firstChild);
        }
        return ink.map((v) => Math.round(v * 100) / 100);
      };
      for (const ev of allEvents) {
        const tEv = { type: ev.rest ? 'rest' : 'note', x: Math.round(ev.x * 100) / 100, duration: { value: ev.value, dots: ev.dots, ticks: ev.ticks, ...(ev.tuplet ? { tuplet: ev.tuplet } : {}) }, bbox: null, notes: [], stem: spec.rhythm ? 'down' : null, beamed: false };
        ev.tEv = tEv;
        if (ev.rest) {
          if (spec.rhythm) {
            const code = { whole: 'restWhole', half: 'restHalf', quarter: 'restQuarter', eighth: 'rest8th', '16th': 'rest16th' }[ev.value];
            const pt = 3.857 * T * 0.9;
            const w = glyphWidth(code, pt);
            const b = glyph(code, ev.x - w / 2, (tLines[2] + tLines[3]) / 2, pt);
            tEv.bbox = box(b);
            tEv.x = Math.round((b.x + b.width / 2) * 100) / 100;
          } else tEv.hidden = true;
          continue;
        }
        const notes = [];
        for (const n of ev.notes) {
          if (n.tieStop && !spec.rhythm && hasN) {
            // Tied-to notes are left out of the tab under notation.
          }
          const ink = drawNumber(String(n.fret), ev.x, tLines[n.string - 1]);
          notes.push({ string: n.string, fret: n.fret, bbox: ink, midi: n.written - 12, written: n.written, tieStart: !!ev.tie, tieStop: !!n.tieStop });
        }
        tEv.notes = notes.sort((a, b) => a.string - b.string);
        const bx0 = Math.min(...notes.map((n) => n.bbox[0]));
        const by0 = Math.min(...notes.map((n) => n.bbox[1]));
        tEv.bbox = [bx0, by0, Math.max(...notes.map((n) => n.bbox[0] + n.bbox[2])) - bx0, Math.max(...notes.map((n) => n.bbox[1] + n.bbox[3])) - by0].map((v) => Math.round(v * 100) / 100);
        tEv.x = Math.round((bx0 + tEv.bbox[2] / 2) * 100) / 100;
      }
      // Rhythm under the tab: stems, beams, flags (eighths and sixteenths), half notes on short stems.
      if (spec.rhythm) {
        const top = tLines[5] + 0.7 * T;
        const L = spec.stem * T;
        const bottomY = top + L;
        const sw = Math.max(0.8, 0.09 * T);
        const groupTicks = 960;
        const runs = [];
        for (const m of sysMeasures) {
          let t = 0;
          let g = [];
          for (const ev of m.events) {
            const beam = !ev.rest && (ev.value === 'eighth' || ev.value === '16th');
            if (!beam || (g.length && Math.floor(g[0].t / groupTicks) !== Math.floor(t / groupTicks))) {
              if (g.length) runs.push(g);
              g = [];
            }
            if (beam) g.push({ ev, t });
            t += ev.ticks;
          }
          if (g.length) runs.push(g);
        }
        for (const ev of allEvents) {
          if (ev.rest || ev.value === 'whole') continue;
          const yTop = ev.value === 'half' ? bottomY - 0.5 * L : top;
          el('rect', { x: ev.x - sw / 2, y: yTop, width: sw, height: bottomY - yTop, fill: '#000' });
          ev.tEv.stemBox = [ev.x - sw / 2, yTop, sw, bottomY - yTop].map((v) => Math.round(v * 100) / 100);
          if (ev.dots) el('circle', { cx: ev.x + 0.45 * T, cy: bottomY - 0.35 * T, r: 0.13 * T, fill: '#000' });
        }
        const bt = 0.36 * T;
        for (const g of runs) {
          if (g.length === 1) {
            const ev = g[0].ev;
            const code = ev.value === 'eighth' ? 'flag8thDown' : 'flag16thDown';
            glyph(code, ev.x - sw / 2, bottomY, 3.857 * T * 0.85);
            continue;
          }
          const xa = g[0].ev.x;
          const xb = g[g.length - 1].ev.x;
          el('rect', { x: xa - sw / 2, y: bottomY - bt, width: xb - xa + sw, height: bt, fill: '#000' });
          for (let i = 0; i < g.length; i++) {
            if (g[i].ev.value !== '16th') continue;
            let j = i;
            while (j + 1 < g.length && g[j + 1].ev.value === '16th') j++;
            const a = j > i ? g[i].ev.x : i > 0 ? g[i].ev.x - 0.8 * T : g[i].ev.x;
            const b = j > i ? g[j].ev.x : i > 0 ? g[i].ev.x : g[i].ev.x + 0.8 * T;
            el('rect', { x: a - sw / 2, y: bottomY - 2 * bt - 0.22 * T, width: b - a + sw, height: bt, fill: '#000' });
            i = j;
          }
          for (const it of g) it.ev.tEv.beamed = true;
        }
      }
    }

    // ---------------- truth of the system ----------------
    for (const m of sysMeasures) {
      for (const ev of m.events) {
        if (hasN) nStaff.measures.find((q) => q.index === m.index).events.push(ev.nEv);
        if (hasT) tStaff.measures.find((q) => q.index === m.index).events.push(ev.tEv);
      }
    }
    const staves = [];
    if (nStaff) staves.push(nStaff);
    if (tStaff) staves.push(tStaff);
    for (const st of staves) {
      st.lines = st.lines.map((v) => Math.round(v * 100) / 100);
      st.x0 = Math.round(st.x0 * 100) / 100;
      st.x1 = Math.round(st.x1 * 100) / 100;
      if (st.ties && !st.ties.length) delete st.ties;
    }
    truthSystems.push({ index: si, connector: hasN && hasT ? 'single' : 'none', barThrough: !!(hasN && hasT && spec.barThrough), staves });
    y = bottom + (hasN ? 2.2 * S : 1.6 * T);
  });
  const height = Math.ceil(spec.height || y + margin * 0.5);
  renderer.resize(W, height);
  svg.querySelector('rect').setAttribute('height', String(height));
  return { width: W, height, systems: truthSystems, texts, staffSpace: hasN ? S : T };
}

// ------------------------------------------------------------------------------------------
// alphaTab pages (a second engraver)
// ------------------------------------------------------------------------------------------

/** alphaTex pages; `staff` is the alphaTab staff option ({tabs}, {score tabs}). */
const AT_PAGES = [
  { id: 'ua-tab-rhythm-c', dsf: 1.5, scale: 1.0, width: 1000, profile: 'Tab', staff: 'tabs', rhythm: true,
    tex: String.raw`\title "Etude in C" \ts (4 4) :8 3.5 2.4 0.3 1.2 0.1 1.2 0.3 2.4 | 0.5 2.4 2.3 1.2 :4 0.1 1.2 | :8 3.6 2.5 0.4 0.3 :4 0.2 1.1 | :8 3.5 2.4 0.3 1.2 :2 (3.5 2.4 0.3 1.2) |
      :8 1.1 3.1 5.1 3.1 1.1 0.1 3.2 1.2 | :4 0.2 2.3 :8 0.3 2.3 :4 0.2 | :16 0.1 1.1 3.1 1.1 0.1 1.1 0.1 3.2 :4 1.2 0.2 | :1 (3.5 2.4 0.3 1.2 0.1) |` },
  { id: 'ua-tab-plain-e', dsf: 1.3, scale: 1.0, width: 1000, profile: 'Tab', staff: 'tabs', rhythm: false,
    tex: String.raw`\title "Riffs in E" \ts (4 4) :8 0.6 2.6 3.6 2.6 0.6 2.6 0.5 2.5 | 0.6 3.6 5.6 3.6 :4 (0.6 2.5 2.4) | :8 7.5 5.5 7.5 9.5 :4 7.4 5.4 | :8 0.6 0.6 3.6 0.6 :2 (0.6 2.5 2.4 1.3 0.2 0.1) |
      :8 12.1 10.1 12.1 15.1 :4 12.2 10.2 | :8 9.3 11.3 9.3 7.3 :4 9.4 7.4 | :8 7.5 9.5 7.5 5.5 :4 7.6 5.6 | :1 (0.6 2.5 2.4 1.3 0.2 0.1) |` },
  { id: 'ua-scoretab-dance-g', dsf: 1.8, scale: 1.0, width: 1050, profile: 'ScoreTab', staff: 'score tabs', rhythm: false,
    tex: String.raw`\title "Country Dance" \ks (G) \ts (3 4) :4 3.6 0.4 0.3 | 2.5 0.4 2.4 | :8 0.3 2.3 0.2 1.2 :4 3.2 | :2 0.3 {d} |
      :4 0.2 0.3 2.4 | :8 0.4 2.4 0.3 2.3 :4 0.2 | :4 3.2 1.2 0.2 | :2 0.3 {d} |` },
  { id: 'ua-scoretab-air-d', dsf: 1.4, scale: 1.1, width: 1000, profile: 'ScoreTab', staff: 'score tabs', rhythm: false,
    tex: String.raw`\title "Air" \ks (D) \ts (4 4) :4 0.4 2.4 4.4 0.3 | :2 2.3 :4 0.2 2.2 | :4 3.2 2.2 0.2 2.3 | :1 0.3 |
      :8 2.2 3.2 :4 2.2 0.2 2.3 | :4 4.4 2.3 :2 0.4 | :4 0.2 2.2 3.2 2.1 | :1 2.3 |` },
];

async function renderAlphaTabInPage(spec) {
  const el = document.getElementById('at');
  el.innerHTML = '';
  el.style.width = `${spec.width}px`;
  const api = new alphaTab.AlphaTabApi(el, {
    core: { fontDirectory: 'http://at.local/dist/font/', useWorkers: false, engine: 'svg', includeNoteBounds: true, enableLazyLoading: false },
    display: { staveProfile: spec.profile, layoutMode: 'page', scale: spec.scale, resources: { staffLineColor: '#000000', barSeparatorColor: '#000000', secondaryGlyphColor: '#000000' } },
    notation: { rhythmMode: spec.rhythm ? 1 : 0 },
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
  const surface = (el.querySelector('.at-surface') || el).getBoundingClientRect();
  const fromSurface = (b) => [b.x + surface.x, b.y + surface.y, b.w, b.h];
  const bars = [];
  for (const sys of api.boundsLookup.staffSystems) {
    for (const mbb of sys.bars) {
      mbb.bars.forEach((bb, k) => {
        const bar = bb.bar;
        bars.push({
          index: bar.index, system: api.boundsLookup.staffSystems.indexOf(sys), renderer: k,
          real: fromSurface(bb.realBounds), visual: fromSurface(bb.visualBounds),
          ts: [bar.masterBar.timeSignatureNumerator, bar.masterBar.timeSignatureDenominator], key: bar.masterBar.keySignature,
          beats: bb.beats.map((beatB) => {
            const b = beatB.beat;
            return {
              duration: b.duration, dots: b.dots, rest: b.isRest, tuplet: b.tupletNumerator > 0 ? [b.tupletNumerator, b.tupletDenominator] : null,
              vb: fromSurface(beatB.visualBounds),
              notes: (beatB.notes || []).map((nb) => ({ real: nb.note.realValue, display: nb.note.displayValue, string: nb.note.string, fret: nb.note.fret, tieStart: !!nb.note.isTieOrigin, tieStop: !!nb.note.isTieDestination, head: fromSurface(nb.noteHeadBounds) })),
            };
          }),
        });
      });
    }
  }
  const glyphs = [];
  for (const t of el.querySelectorAll('svg text')) {
    const code = (t.textContent || '').codePointAt(0);
    if (!code || code < 0xe000) continue;
    const r = t.getBoundingClientRect();
    glyphs.push({ code, x: r.x, y: r.y, w: r.width, h: r.height });
  }
  const all = el.getBoundingClientRect();
  return { bars, glyphs, width: all.x + all.width, height: all.y + all.height };
}

const AT_VALUE = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd' };
const AT_TICKS = { whole: 3840, half: 1920, quarter: 960, eighth: 480, '16th': 240, '32nd': 120 };
const NOTE_STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];

/** Staff lines (image px) in a region: rows dark across most of it. */
function linesAt(img, x0, x1, y0, y1) {
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
    if (dark > 0.55 * (x1 - x0)) {
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

function inkBox(img, x0, x1, y0, y1, skip) {
  let bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, Math.ceil(y1)); y++) {
    if (skip && skip.has(y)) continue;
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

const ACC_CODES = { 0xe260: 'b', 0xe261: 'n', 0xe262: '#' };
const REST_CODES = new Set([0xe4e3, 0xe4e4, 0xe4e5, 0xe4e6, 0xe4e7, 0xe4e8]);

/** Ground truth (corpus format, image px) of an alphaTab page: notation staff and / or tab staff per system. */
function alphaTabTruth(spec, r, gray) {
  const k = spec.dsf;
  const sc = (v) => v * k;
  const box = (b) => [sc(b[0]), sc(b[1]), sc(b[2]), sc(b[3])].map((v) => Math.round(v * 100) / 100);
  const withScore = spec.staff.includes('score');
  const systems = [];
  const sysIdx = [...new Set(r.bars.map((b) => b.system))].sort((a, b) => a - b);
  let lastTs = null;
  for (const si of sysIdx) {
    const bars = r.bars.filter((b) => b.system === si);
    const staves = [];
    const renderers = [...new Set(bars.map((b) => b.renderer))].sort((a, b) => a - b);
    for (const rk of renderers) {
      const kind = withScore && rk === 0 ? 'notation' : 'tab';
      const own = bars.filter((b) => b.renderer === rk).sort((a, b) => a.index - b.index);
      const xa = sc(own[0].real[0]);
      const xb = sc(own[own.length - 1].real[0] + own[own.length - 1].real[2]);
      const g = linesAt(gray, xa + 2, xb - 2, sc(own[0].real[1]) - 6, sc(own[0].real[1] + own[0].real[3]) + 6);
      const want = kind === 'notation' ? 5 : 6;
      if (g.length !== want) throw new Error(`${spec.id}: ${g.length} lines in system ${si} (${kind})`);
      const lineYs = g.map((l) => Math.round(l.y * 100) / 100);
      const space = (lineYs[want - 1] - lineYs[0]) / (want - 1);
      const skip = new Set();
      for (const l of g) for (let yy = Math.floor(l.y - l.h); yy <= Math.ceil(l.y + l.h); yy++) skip.add(yy);
      const measures = [];
      // alphaTab opens every staff with a bar line (joined across the staves of a system).
      const barlines = [{ type: 'single', x: g[0].x0 + 0.5, bbox: [g[0].x0, lineYs[0], 1.5, lineYs[want - 1] - lineYs[0]], strokes: [[g[0].x0, 1]] }];
      for (const b of own) {
        const events = [];
        for (const bt of b.beats) {
          const value = AT_VALUE[bt.duration];
          const tuplet = bt.tuplet ? { actual: bt.tuplet[0], normal: bt.tuplet[1] } : undefined;
          let ticks = AT_TICKS[value] * (bt.dots === 1 ? 1.5 : bt.dots === 2 ? 1.75 : 1);
          if (tuplet) ticks = (ticks * tuplet.normal) / tuplet.actual;
          const duration = { value, dots: bt.dots, ticks: Math.round(ticks), ...(tuplet ? { tuplet } : {}) };
          if (bt.rest) {
            if (kind === 'notation') {
              const glyph = r.glyphs.find((q) => REST_CODES.has(q.code) && q.x >= bt.vb[0] - 2 && q.x <= bt.vb[0] + bt.vb[2] + 2 && sc(q.y) > lineYs[0] - 3 * space && sc(q.y) < lineYs[4] + 3 * space);
              const gx0 = sc(glyph ? glyph.x : bt.vb[0]);
              const gx1 = sc(glyph ? glyph.x + glyph.w : bt.vb[0] + bt.vb[2]);
              const head = inkBox(gray, gx0, gx1, lineYs[0] - 2.5 * space, lineYs[4] + 2.5 * space, skip);
              events.push({ type: 'rest', x: head ? head[0] + head[2] / 2 : (gx0 + gx1) / 2, duration, bbox: head, notes: [], head });
            } else {
              events.push({ type: 'rest', x: sc(bt.vb[0] + bt.vb[2] / 2), duration, bbox: null, notes: [], hidden: true });
            }
            continue;
          }
          if (kind === 'notation') {
            const notes = bt.notes.map((n) => {
              const head = box(n.head);
              const yc = head[1] + head[3] / 2;
              const pos = Math.round((lineYs[4] - yc) / (space / 2));
              const acc = r.glyphs.find((q) => ACC_CODES[q.code] && Math.abs(sc(q.y + q.h / 2) - yc) < 1.2 * space && sc(q.x + q.w) <= head[0] + 0.3 * space && sc(q.x + q.w) >= head[0] - 2.8 * space);
              const written = n.display;
              return {
                written, midi: n.real, step: NOTE_STEPS[((written % 12) + 12) % 12], alter: 0, octave: Math.floor(written / 12) - 1, pos,
                ledger: pos >= 10 ? Math.floor((pos - 8) / 2) : pos <= -2 ? Math.floor(-pos / 2) : 0,
                accidental: acc ? ACC_CODES[acc.code] : null, accBox: acc ? [sc(acc.x), yc - space, sc(acc.w), 2 * space] : null,
                head, headType: value === 'whole' ? 'whole' : value === 'half' ? 'open' : 'filled', tieStart: n.tieStart, tieStop: n.tieStop, string: n.string, fret: n.fret,
              };
            }).sort((p, q) => p.written - q.written);
            const x = notes.reduce((t, n) => t + n.head[0] + n.head[2] / 2, 0) / notes.length;
            events.push({ type: 'note', x, duration, bbox: null, notes });
          } else {
            // alphaTab strings count from the lowest (1 = low E); the corpus counts from the top line.
            const notes = bt.notes.map((n) => {
              const b = box(n.head);
              const ink = inkBox(gray, b[0] - 1, b[0] + b[2] + 1, b[1] - 1, b[1] + b[3] + 1, null) || b;
              return { string: 7 - n.string, fret: n.fret, bbox: ink, midi: n.real, written: n.real + 12, tieStart: n.tieStart, tieStop: n.tieStop };
            }).sort((p, q) => p.string - q.string);
            const bx0 = Math.min(...notes.map((n) => n.bbox[0]));
            const by0 = Math.min(...notes.map((n) => n.bbox[1]));
            const bbox = [bx0, by0, Math.max(...notes.map((n) => n.bbox[0] + n.bbox[2])) - bx0, Math.max(...notes.map((n) => n.bbox[1] + n.bbox[3])) - by0];
            events.push({ type: 'note', x: bx0 + bbox[2] / 2, duration, bbox, notes, stem: spec.rhythm ? 'down' : null });
          }
        }
        events.sort((p, q) => p.x - q.x);
        const mx0 = sc(b.real[0]);
        const mx1 = sc(b.real[0] + b.real[2]);
        measures.push({ index: b.index, x0: mx0, x1: mx1, events });
        const lastBar = b === own[own.length - 1] && si === sysIdx[sysIdx.length - 1];
        barlines.push({ type: lastBar ? 'end' : 'single', x: mx1, bbox: [mx1 - 2, lineYs[0], 4, lineYs[want - 1] - lineYs[0]], strokes: [[mx1, 1]] });
      }
      const ts = own[0].ts;
      const showTime = !lastTs || lastTs[0] !== ts[0] || lastTs[1] !== ts[1];
      const base = { lineCount: want, lines: lineYs, x0: g[0].x0, x1: g[0].x1, space, lineThickness: g[0].h, barlines, measures };
      if (kind === 'notation') staves.push({ ...base, kind, clef: { type: 'treble', bbox: null }, time: showTime ? { num: ts[0], den: ts[1], bbox: null } : null, key: { name: String(own[0].key), fifths: own[0].key, bbox: null } });
      else staves.push({ ...base, kind, clef: { type: 'tab', bbox: null }, time: null, stems: !!spec.rhythm, lineThrough: false });
    }
    lastTs = bars[0].ts;
    systems.push({ index: systems.length, connector: staves.length > 1 ? 'single' : 'none', barThrough: false, staves });
  }
  const first = systems[0].staves[0];
  return {
    id: spec.id, image: `${spec.id}.png`, width: gray.width, height: gray.height, subset: withScore ? 'linked' : 'tab', title: null,
    dpi: Math.round((first.kind === 'notation' ? first.space : first.space / 1.4) / 1.75 * 25.4), scale: first.space / 10, staffSpace: first.space,
    musicFont: 'Bravura (alphaTab)', textFont: 'alphaTab', tabFont: 'alphaTab', key: { name: String(r.bars[0].key), fifths: r.bars[0].key },
    time: { num: r.bars[0].ts[0], den: r.bars[0].ts[1] }, pickup: false, systems, texts: [],
  };
}

// ------------------------------------------------------------------------------------------
// Driver
// ------------------------------------------------------------------------------------------

function fontFaceCss() {
  const face = (family, file, weight, style, format) => `@font-face{font-family:"${family}";src:url(data:${format === 'truetype' ? 'font/ttf' : format === 'opentype' ? 'font/otf' : 'font/woff2'};base64,${fs.readFileSync(file).toString('base64')}) format("${format}");font-weight:${weight};font-style:${style};}`;
  const pdf = (f) => nm('pdfjs-dist', 'standard_fonts', f);
  const list = [
    face('Liberation Sans', pdf('LiberationSans-Regular.ttf'), 400, 'normal', 'truetype'),
    face('Liberation Sans', pdf('LiberationSans-Bold.ttf'), 700, 'normal', 'truetype'),
    face('Bricolage Grotesque', nm('@fontsource-variable', 'bricolage-grotesque', 'files', 'bricolage-grotesque-latin-wght-normal.woff2'), '200 800', 'normal', 'woff2'),
  ];
  // System faces, embedded so the rendering does not depend on font matching.
  const sys = [
    ['IPAGothic', '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', 400, 'normal', 'truetype'],
    ['Caladea', '/usr/share/fonts/truetype/crosextra/Caladea-Italic.ttf', 400, 'italic', 'truetype'],
    ['Carlito', '/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf', 700, 'normal', 'truetype'],
    ['Unifont', '/usr/share/fonts/opentype/unifont/unifont.otf', 400, 'normal', 'opentype'],
  ];
  for (const [fam, file, w, st, fmt] of sys) if (fs.existsSync(file)) list.push(face(fam, file, w, st, fmt));
  return list.join('\n');
}

function toGrey(buf) {
  const src = PNG.sync.read(buf);
  const grey = new Uint8Array(src.width * src.height);
  for (let i = 0, j = 0; j < grey.length; i += 4, j++) grey[j] = Math.round(0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]);
  return { width: src.width, height: src.height, data: grey };
}

function writeGreyPng(file, img) {
  const png = new PNG({ width: img.width, height: img.height, colorType: 0, inputColorType: 0, bitDepth: 8 });
  png.data = Buffer.from(img.data);
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: 0, inputColorType: 0, bitDepth: 8, deflateLevel: 9 }));
}

/** Every truth box must hold ink; every staff line must be dark along most of its length. */
function verify(truth, img) {
  const problems = [];
  const dark = (b, pad = 1) => {
    let min = 255;
    for (let y = Math.max(0, Math.floor(b[1] - pad)); y <= Math.min(img.height - 1, Math.ceil(b[1] + b[3] + pad)); y++) {
      for (let x = Math.max(0, Math.floor(b[0] - pad)); x <= Math.min(img.width - 1, Math.ceil(b[0] + b[2] + pad)); x++) min = Math.min(min, img.data[y * img.width + x]);
    }
    return min;
  };
  for (const sys of truth.systems) {
    for (const st of sys.staves) {
      for (const ly of st.lines) {
        let hit = 0;
        for (let k = 0; k < 40; k++) {
          const x = Math.round(st.x0 + ((st.x1 - st.x0) * (k + 0.5)) / 40);
          let min = 255;
          for (let d = -1; d <= 1; d++) min = Math.min(min, img.data[(Math.round(ly) + d) * img.width + x]);
          if (min < 200) hit++;
        }
        if (hit < 24) problems.push(`staff line y=${ly} faint`);
      }
      for (const m of st.measures) {
        for (const e of m.events) {
          for (const n of e.notes) {
            const b = n.head || n.bbox;
            if (!b || b[2] <= 0 || dark(b, 0) > 150) problems.push(`no ink at ${b} (measure ${m.index})`);
          }
        }
      }
    }
  }
  return problems;
}

/** Draw the truth over the picture (boxes) for a visual check. */
function overlay(img, truth, file) {
  const png = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.data.length; i++) {
    png.data[4 * i] = png.data[4 * i + 1] = png.data[4 * i + 2] = img.data[i];
    png.data[4 * i + 3] = 255;
  }
  const rect = (b, c) => {
    if (!b) return;
    const [x0, y0, w, h] = b.map(Math.round);
    for (let x = x0; x <= x0 + w; x++) for (const y of [y0, y0 + h]) if (x >= 0 && y >= 0 && x < img.width && y < img.height) png.data.set(c, 4 * (y * img.width + x));
    for (let y = y0; y <= y0 + h; y++) for (const x of [x0, x0 + w]) if (x >= 0 && y >= 0 && x < img.width && y < img.height) png.data.set(c, 4 * (y * img.width + x));
  };
  for (const sys of truth.systems) {
    for (const st of sys.staves) {
      for (const b of st.barlines) rect(b.bbox, [0, 160, 0, 255]);
      for (const m of st.measures) for (const e of m.events) {
        if (e.type === 'rest' && e.head) rect(e.head, [200, 0, 200, 255]);
        for (const n of e.notes) {
          rect(n.head || n.bbox, [220, 0, 0, 255]);
          if (n.accBox) rect(n.accBox, [0, 0, 220, 255]);
        }
      }
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

function specFor(p) {
  const fifths = KEY_FIFTHS[p.key || 'C'] ?? 0;
  const measures = parseScore(p.src(), fifths, p.kind === 'notation' ? 0 : 0);
  measures.forEach((m, i) => {
    m.index = i;
    for (const e of m.events) e.measureIndex = i;
  });
  // Tie stops for the truth.
  const flat = measures.flatMap((m) => m.events);
  for (let i = 0; i + 1 < flat.length; i++) {
    if (!flat[i].tie) continue;
    for (const n of flat[i].notes) {
      const m = flat[i + 1].notes.find((q) => q.written === n.written);
      if (m) m.tieStop = true;
    }
  }
  const [num, den] = p.time.split('/').map(Number);
  const bar = (3840 / den) * num;
  measures.forEach((m, i) => {
    const t = m.events.reduce((a, e) => a + e.ticks, 0);
    if (t !== bar && !(p.pickup && (i === 0 || i === measures.length - 1))) console.warn(`warning: ${p.id} measure ${i} has ${t} ticks (bar ${bar})`);
  });
  return { ...p, fifths, measures, faceDef: p.face ? TAB_FACES[p.face] : null, seed: [...p.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const pages = PAGES.filter((p) => !only || p.id.includes(only));
  const atPages = AT_PAGES.filter((p) => !only || p.id.includes(only));
  if (args.includes('--list')) {
    for (const p of pages) console.log(`${p.id.padEnd(32)} ${p.kind.padEnd(9)} ${p.font || ''} ${p.face || ''}`);
    for (const p of atPages) console.log(`${p.id.padEnd(32)} alphaTab ${p.staff}`);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const manifestPath = path.join(OUT, 'manifest.json');
  const old = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).fixtures : [];
  const entries = new Map(old.map((e) => [e.id, e]));
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
  let failures = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"><div id="out"></div></body></html>');
    await page.addStyleTag({ content: fontFaceCss() });
    await page.addScriptTag({ path: nm('vexflow', 'build', 'cjs', 'vexflow.js') });
    await page.evaluate(async () => {
      for (const f of ['400 20px "IPAGothic"', '400 20px "WenQuanYi Zen Hei"', '400 20px "Unifont"', 'italic 400 20px "Caladea"', '700 20px "Carlito"', '700 20px "Liberation Sans"', '400 20px "Liberation Serif"', '400 20px "Liberation Sans"', 'italic 700 20px "Liberation Serif"']) await document.fonts.load(f, '0123456789');
      await document.fonts.ready;
    });
    for (const p of pages) {
      const spec = specFor(p);
      let res;
      try {
        res = await page.evaluate(engravePage, JSON.parse(JSON.stringify(spec, (k, v) => (typeof v === 'function' ? undefined : v))));
      } catch (err) {
        failures++;
        console.error(`FAILED ${p.id}: ${String(err.message).split('\n')[0]}`);
        continue;
      }
      await page.setViewportSize({ width: res.width, height: Math.min(res.height, 4000) });
      const shot = await page.screenshot({ clip: { x: 0, y: 0, width: res.width, height: res.height }, fullPage: true });
      const img = toGrey(shot);
      const subset = p.kind === 'linked' ? 'linked' : p.kind;
      const truth = {
        id: p.id, image: `${p.id}.png`, width: img.width, height: img.height, subset, title: p.title || null,
        dpi: Math.round(((p.kind === 'tab' ? p.tab / 1.4 : p.space) / 1.75) * 25.4), scale: res.staffSpace / 10, staffSpace: res.staffSpace,
        musicFont: p.font || 'none', textFont: 'Liberation', tabFont: p.face || null, key: { name: p.key || 'C', fifths: spec.fifths },
        time: { num: Number(p.time.split('/')[0]), den: Number(p.time.split('/')[1]) }, pickup: !!p.pickup, systems: res.systems, texts: res.texts,
      };
      const problems = verify(truth, img);
      if (problems.length) {
        failures++;
        console.error(`CHECK ${p.id}: ${problems.slice(0, 4).join('; ')}${problems.length > 4 ? ` (+${problems.length - 4})` : ''}`);
      }
      writeGreyPng(path.join(OUT, `${p.id}.png`), img);
      fs.writeFileSync(path.join(OUT, `${p.id}.json`), `${JSON.stringify(truth)}\n`);
      if (args.includes('--overlay')) overlay(img, truth, path.join(ROOT, 'e2e', 'out', 'omr', `unseen-${p.id}.png`));
      const tags = ['engraver-e2'];
      if (p.cue) tags.push('cue');
      if (p.page) tags.push('page');
      if (p.rhythm) tags.push('tab-stems');
      if (p.mode === 'through') tags.push('line-through');
      if (p.face) tags.push(`face-${p.face}`);
      if (p.font) tags.push(`font-${p.font.toLowerCase()}`);
      const counts = countTruth(truth);
      entries.set(p.id, { id: p.id, image: `${p.id}.png`, truth: `${p.id}.json`, subset, name: p.id.split('-').slice(1, 3).join('-'), dpi: truth.dpi, size: 1, staffSpace: res.staffSpace, musicFont: truth.musicFont, tabFont: truth.tabFont, width: img.width, height: img.height, systems: truth.systems.length, staves: counts.staves, measures: counts.measures, tags, bytes: fs.statSync(path.join(OUT, `${p.id}.png`)).size });
      console.log(`${p.id.padEnd(32)} ${img.width}x${img.height} staves ${counts.staves} heads ${counts.heads} tab ${counts.tab}${problems.length ? ' (CHECK)' : ''}`);
    }
    await page.close();
    // alphaTab pages.
    for (const p of atPages) {
      const pg = await browser.newPage({ viewport: { width: p.width + 40, height: 2000 }, deviceScaleFactor: p.dsf });
      pg.on('pageerror', (e) => console.error(`${p.id}: ${e.message}`));
      await pg.route('http://at.local/**', async (route) => {
        const u = new URL(route.request().url());
        if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#fff"><div id="at"></div></body></html>' });
        const f = path.join(AT, u.pathname.replace(/^\/dist\//, ''));
        if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
        const ct = f.endsWith('.js') || f.endsWith('.mjs') ? 'application/javascript' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.woff') ? 'font/woff' : f.endsWith('.otf') ? 'font/otf' : 'application/octet-stream';
        return route.fulfill({ body: fs.readFileSync(f), contentType: ct });
      });
      await pg.goto('http://at.local/');
      await pg.addScriptTag({ url: 'http://at.local/dist/alphaTab.js' });
      let r;
      try {
        r = await pg.evaluate(renderAlphaTabInPage, { ...p, tex: p.tex.replace(/\s+/g, ' ') });
      } catch (err) {
        failures++;
        console.error(`FAILED ${p.id}: ${String(err.message).split('\n')[0]}`);
        await pg.close();
        continue;
      }
      const shot = await pg.screenshot({ clip: { x: 0, y: 0, width: p.width + 20, height: Math.ceil(r.height) + 20 } });
      await pg.close();
      const img = toGrey(shot);
      let truth;
      try {
        truth = alphaTabTruth(p, r, img);
      } catch (err) {
        failures++;
        console.error(`TRUTH ${p.id}: ${err.message}`);
        continue;
      }
      const problems = verify(truth, img);
      if (problems.length) {
        failures++;
        console.error(`CHECK ${p.id}: ${problems.slice(0, 4).join('; ')}`);
      }
      writeGreyPng(path.join(OUT, `${p.id}.png`), img);
      fs.writeFileSync(path.join(OUT, `${p.id}.json`), `${JSON.stringify(truth)}\n`);
      if (args.includes('--overlay')) overlay(img, truth, path.join(ROOT, 'e2e', 'out', 'omr', `unseen-${p.id}.png`));
      const counts = countTruth(truth);
      entries.set(p.id, { id: p.id, image: `${p.id}.png`, truth: `${p.id}.json`, subset: truth.subset, name: p.id, dpi: truth.dpi, size: 1, staffSpace: truth.staffSpace, musicFont: truth.musicFont, tabFont: 'alphaTab', width: img.width, height: img.height, systems: truth.systems.length, staves: counts.staves, measures: counts.measures, tags: ['engraver-alphatab', ...(p.rhythm ? ['tab-stems'] : [])], bytes: fs.statSync(path.join(OUT, `${p.id}.png`)).size });
      console.log(`${p.id.padEnd(32)} ${img.width}x${img.height} staves ${counts.staves} heads ${counts.heads} tab ${counts.tab}${problems.length ? ' (CHECK)' : ''}`);
    }
  } finally {
    await browser.close();
  }
  const order = [...PAGES.map((p) => p.id), ...AT_PAGES.map((p) => p.id)];
  const fixtures = order.filter((id) => entries.has(id)).map((id) => entries.get(id));
  fs.writeFileSync(manifestPath, `${JSON.stringify({ version: 1, generator: 'scripts/omr-unseen.cjs', count: fixtures.length, fixtures }, null, 1)}\n`);
  console.log(`${fixtures.length} pages in ${path.relative(ROOT, OUT)}${failures ? `, ${failures} with problems` : ''}`);
  if (failures) process.exitCode = 1;
}

function countTruth(truth) {
  let staves = 0, measures = 0, heads = 0, tab = 0;
  for (const s of truth.systems) for (const st of s.staves) {
    staves++;
    measures += st.measures.length;
    for (const m of st.measures) for (const e of m.events) {
      if (st.kind === 'notation') heads += e.notes.length;
      else tab += e.notes.length;
    }
  }
  return { staves, measures, heads, tab };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
