#!/usr/bin/env node
/**
 * Renders the ground-truth corpus for the sheet-recognition (OMR) module.
 *
 *   node scripts/omr-fixtures.cjs                 # rebuild src/core/omr/fixtures/ (PNG + JSON + manifest)
 *   node scripts/omr-fixtures.cjs --only ode      # only fixtures whose id contains "ode" (manifest untouched)
 *   node scripts/omr-fixtures.cjs --out /tmp/x    # write somewhere else
 *   node scripts/omr-fixtures.cjs --list          # print the corpus without rendering
 *
 * Every score is engraved with VexFlow 4 (SVG backend) inside the pre-installed Playwright
 * Chromium, rasterised to an 8-bit grey PNG, and described by a JSON ground truth read back from
 * the engraving itself: staff lines, bar lines, clef / key / time, every note head (pitch,
 * duration, measure, box), every tab number (string, fret, box) and the text above the staves.
 * Boxes come from the SVG geometry (and canvas text metrics for digits), so they are exact for the
 * pixels that were drawn. All coordinates are in image pixels.
 *
 * Deterministic: the corpus is defined below, random material uses a seeded generator, music
 * glyphs are VexFlow paths and text uses fonts bundled in node_modules, never system fonts.
 * Music: traditional / public-domain tunes and generated exercises only.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'src', 'core', 'omr', 'fixtures');
const nm = (...p) => path.join(ROOT, 'node_modules', ...p);

// ------------------------------------------------------------------------------------------
// Music helpers
// ------------------------------------------------------------------------------------------

const STEP_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ALTER = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 };
const ALTER_NAME = { 0: '', 1: '#', 2: '##', '-1': 'b', '-2': 'bb' };
const DUR_TICKS = { w: 3840, h: 1920, q: 960, 8: 480, 16: 240, 32: 120 };
const DUR_NAME = { w: 'whole', h: 'half', q: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd' };
/** Sounding MIDI of the open strings, index 0 = string 1 (high E). */
const OPEN = [64, 59, 55, 50, 45, 40];
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const KEY_FIFTHS = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5,
  Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, Dm: -1, Gm: -2, Cm: -3, Fm: -4,
};

/** 'C#4' -> { step, alter, octave, midi (as written), vex: 'c#/4' }. */
function parsePitch(s) {
  const m = /^([A-G])(##|bb|#|b)?(-?\d)$/.exec(s);
  if (!m) throw new Error(`bad pitch "${s}"`);
  const alter = ALTER[m[2] || ''];
  const octave = Number(m[3]);
  return {
    step: m[1], alter, octave,
    midi: STEP_SEMI[m[1]] + alter + (octave + 1) * 12,
    vex: `${m[1].toLowerCase()}${m[2] || ''}/${octave}`,
  };
}

/** Spell a MIDI number with sharps (used for tab-only material, where the tab defines the pitch). */
function spellSharp(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Letter -> alteration for a key signature given as fifths (sharps positive). */
function keyAlters(key) {
  const fifths = KEY_FIFTHS[key];
  if (fifths === undefined) throw new Error(`unknown key ${key}`);
  const out = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  for (let i = 0; i < Math.abs(fifths); i++) {
    if (fifths > 0) out[SHARP_ORDER[i]] = 1; else out[FLAT_ORDER[i]] = -1;
  }
  return out;
}

/** The diatonic note `steps` scale steps above `start` ('E3') in `key`, spelled for the key. */
function diatonic(key, start, steps) {
  const alters = keyAlters(key);
  const p = parsePitch(start);
  const idx = LETTERS.indexOf(p.step) + steps;
  const letter = LETTERS[((idx % 7) + 7) % 7];
  const octave = p.octave + Math.floor(idx / 7);
  return `${letter}${ALTER_NAME[alters[letter]]}${octave}`;
}

/** Deterministic PRNG (mulberry32). */
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

/**
 * Choose { string, fret } for the sounding pitches of one event (highest pitch first), each note
 * on its own string, preferring frets inside the hand position [position, position + 4].
 */
function fretChord(soundingMidis, position) {
  const order = soundingMidis.map((m, i) => ({ m, i })).sort((a, b) => b.m - a.m);
  const out = new Array(soundingMidis.length);
  let minString = 1;
  for (const { m, i } of order) {
    let best = null;
    for (let s = minString; s <= 6; s++) {
      const fret = m - OPEN[s - 1];
      if (fret < 0 || fret > 22) continue;
      const inWindow = fret >= position && fret <= position + 4;
      const cost = (inWindow ? 0 : 100) + (inWindow ? fret - position : Math.abs(fret - position)) + (s - minString) * 0.01;
      if (!best || cost < best.cost) best = { string: s, fret, cost };
    }
    if (!best) throw new Error(`no fret for sounding MIDI ${m}`);
    out[i] = { string: best.string, fret: best.fret };
    minString = Math.min(6, best.string + 1);
  }
  return out;
}

/**
 * Parse the compact score notation used below into measures.
 *   C#4:q   note (written pitch, treble clef)      C4,E4,G4:h   chord        r:8   rest
 *   durations w h q 8 16 32, dots as trailing ".", tie to the next event as trailing "~"
 *   5/3,4/2:q   tab-first event (string/fret); the pitch is derived from standard tuning
 *   "Am"    chord symbol on the next event        3( ... )   eighth/quarter triplet group
 *   |  bar line   ||  double   |]  final   |:  repeat begin   :|  repeat end
 */
function parseScore(src, opts = {}) {
  const position = opts.position || 0;
  const measures = [];
  let cur = { events: [], end: 'single', repeatBegin: false };
  let pendingChord = null;
  let tuplet = null;
  let tupletId = 0;
  const push = (end) => {
    cur.end = end;
    if (cur.events.length) measures.push(cur);
    cur = { events: [], end: 'single', repeatBegin: false };
  };
  for (const tok of src.trim().split(/\s+/)) {
    if (tok === '|') { push('single'); continue; }
    if (tok === '||') { push('double'); continue; }
    if (tok === '|]') { push('end'); continue; }
    if (tok === ':|') { push('repeat-end'); continue; }
    if (tok === '|:') { if (cur.events.length) push('single'); cur.repeatBegin = true; continue; }
    if (tok.startsWith('"')) { pendingChord = tok.replace(/"/g, ''); continue; }
    if (tok === '3(') { tuplet = { id: ++tupletId, num: 3, occ: 2 }; continue; }
    if (tok === ')') { tuplet = null; continue; }
    const m = /^(.+):(w|h|q|8|16|32)(\.*)(~?)$/.exec(tok);
    if (!m) throw new Error(`bad token "${tok}"`);
    const ev = { dur: m[2], dots: m[3].length, tie: m[4] === '~', rest: false, notes: [] };
    if (tuplet) ev.tuplet = { ...tuplet };
    if (pendingChord) { ev.chord = pendingChord; pendingChord = null; }
    let ticks = DUR_TICKS[ev.dur];
    if (ev.dots === 1) ticks *= 1.5; else if (ev.dots === 2) ticks *= 1.75;
    if (ev.tuplet) ticks = (ticks * ev.tuplet.occ) / ev.tuplet.num;
    ev.ticks = Math.round(ticks);
    if (m[1] === 'r') {
      ev.rest = true;
    } else if (m[1].includes('/')) {
      // Tab-first: "string/fret" pairs. Notes are kept sorted low to high like VexFlow sorts keys.
      const tab = m[1].split(',').map((p) => {
        const [s, f] = p.split('/').map(Number);
        return { string: s, fret: f };
      });
      ev.notes = tab.map((t) => {
        const sounding = OPEN[t.string - 1] + t.fret;
        return { ...parsePitch(spellSharp(sounding + 12)), sounding, tab: t };
      }).sort((a, b) => a.midi - b.midi);
    } else {
      const ps = m[1].split(',').map(parsePitch).sort((a, b) => a.midi - b.midi);
      const tabs = fretChord(ps.map((p) => p.midi - 12), position);
      ev.notes = ps.map((p, i) => ({ ...p, sounding: p.midi - 12, tab: tabs[i] }));
    }
    cur.events.push(ev);
  }
  if (cur.events.length) push(cur.end === 'single' ? 'end' : cur.end);
  measures.forEach((mm, i) => { mm.index = i; });
  return measures;
}

// ------------------------------------------------------------------------------------------
// Repertoire (traditional / public domain) and generated exercises
// ------------------------------------------------------------------------------------------

const TUNES = {
  // Beethoven, "Ode to Joy" theme (1824), in G.
  odeG: `B4:q B4:q C5:q D5:q | D5:q C5:q B4:q A4:q | G4:q G4:q A4:q B4:q | B4:q. A4:8 A4:h |
         B4:q B4:q C5:q D5:q | D5:q C5:q B4:q A4:q | G4:q G4:q A4:q B4:q | A4:q. G4:8 G4:h |]`,
  // The same theme an octave area lower in C, for ledger lines below the staff.
  odeC: `E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q. D4:8 D4:h |
         E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q. C4:8 C4:h |]`,
  // "Greensleeves" (trad., 16th c.), A minor, 3/4 with a pickup.
  greenAm: `A4:q | C5:h D5:q | E5:q. F5:8 E5:q | D5:h B4:q | G4:q. A4:8 B4:q | C5:h A4:q |
            A4:q. G#4:8 A4:q | B4:h G#4:q | E4:h A4:q | C5:h D5:q | E5:q. F5:8 E5:q | D5:h B4:q |
            G4:q. A4:8 B4:q | C5:q. B4:8 A4:q | G#4:q. F#4:8 G#4:q | A4:h. |]`,
  // "Greensleeves" in E minor, 6/8: dotted eighths, sixteenths, accidentals.
  green68: `E4:8 | G4:q A4:8 B4:8. C5:16 B4:8 | A4:q F#4:8 D4:8. E4:16 F#4:8 |
            G4:q E4:8 E4:8. D#4:16 E4:8 | F#4:q D#4:8 B3:q E4:8 | G4:q A4:8 B4:8. C5:16 B4:8 |
            A4:q F#4:8 D4:8. E4:16 F#4:8 | G4:8. F#4:16 E4:8 D#4:8. C#4:16 D#4:8 | E4:q. E4:q. |]`,
  // "Amazing Grace" (trad. melody "New Britain", 1829), G, 3/4 with a pickup and ties.
  amazing: `D4:q | G4:h B4:8 G4:8 | B4:h A4:q | G4:h E4:q | D4:h D4:q | G4:h B4:8 G4:8 | B4:h A4:q |
            D5:h.~ | D5:h B4:q | D5:q. B4:8 D5:8 B4:8 | G4:h D4:q | E4:q. G4:8 G4:8 E4:8 | D4:h D4:q |
            G4:h B4:8 G4:8 | B4:h A4:q | G4:h.~ | G4:h r:q |]`,
  // "Scarborough Fair" (trad.), A dorian written with one sharp, 3/4.
  scarborough: `A4:h A4:q | E5:q E5:q E5:q | B4:q. C5:8 B4:q | A4:h.~ | A4:h E5:q | G5:h G5:q |
                A5:h G5:q | E5:q F#5:q D5:q | E5:h.~ | E5:h r:q | A5:h A5:q | G5:h E5:q |
                E5:q D5:q C5:q | B4:q. A4:8 G4:q | A4:h.~ | A4:h. |]`,
  // Beethoven, "Für Elise" opening (1810), right hand only, 3/8.
  elise: `E5:16 D#5:16 | E5:16 D#5:16 E5:16 B4:16 D5:16 C5:16 | A4:8 r:16 C4:16 E4:16 A4:16 |
          B4:8 r:16 E4:16 G#4:16 B4:16 | C5:8 r:16 E4:16 E5:16 D#5:16 |
          E5:16 D#5:16 E5:16 B4:16 D5:16 C5:16 | A4:8 r:16 C4:16 E4:16 A4:16 |
          B4:8 r:16 E4:16 C5:16 B4:16 | A4:q. |]`,
  // Petzold, Minuet in G (from the Anna Magdalena notebook, 1725), first strain.
  minuet: `D5:q G4:8 A4:8 B4:8 C5:8 | D5:q G4:q G4:q | E5:q C5:8 D5:8 E5:8 F#5:8 | G5:q G4:q G4:q |
           C5:q D5:8 C5:8 B4:8 A4:8 | B4:q C5:8 B4:8 A4:8 G4:8 | F#4:q G4:8 A4:8 B4:8 G4:8 | A4:h. |]`,
  // "Aura Lee" (Poulton, 1861), G.
  auraLee: `D4:q G4:q F#4:q G4:q | A4:q E4:q A4:h | G4:q F#4:q E4:q F#4:q | G4:w |
            D4:q G4:q F#4:q G4:q | A4:q E4:q A4:h | G4:q F#4:q E4:q F#4:q | G4:w |]`,
  // "Romance" (anonymous, 19th c.): the melody on string 1 over open B and G, in triplets.
  romance: `3( B5:8 B4:8 G4:8 ) 3( B5:8 B4:8 G4:8 ) 3( B5:8 B4:8 G4:8 ) |
            3( B5:8 B4:8 G4:8 ) 3( A5:8 B4:8 G4:8 ) 3( G5:8 B4:8 G4:8 ) |
            3( G5:8 B4:8 G4:8 ) 3( F#5:8 B4:8 G4:8 ) 3( E5:8 B4:8 G4:8 ) |
            3( E5:8 B4:8 G4:8 ) 3( G5:8 B4:8 G4:8 ) 3( B5:8 B4:8 G4:8 ) | E5:h. |]`,
  // Rhythm study written for this corpus: every value from whole to sixteenth, dots, all rests.
  rhythmF: `F4:w | A4:h C5:h | F4:q G4:q A4:q Bb4:q | C5:8 D5:8 C5:8 Bb4:8 A4:8 G4:8 F4:8 E4:8 |
            F4:16 G4:16 A4:16 Bb4:16 C5:16 Bb4:16 A4:16 G4:16 F4:8 A4:8 C5:q | r:w |
            r:h r:q r:8 F4:8 | A4:h. r:q | C5:q. Bb4:8 A4:8. G4:16 F4:q |
            r:16 F4:16 A4:16 C5:16 F5:8 r:8 F5:h | D5:q.. C5:16 Bb4:h | F4:w |]`,
  // Two- and three-note chords: thirds, sixths, seconds, close triads (C major).
  chordsC: `C4,E4:h D4,F4:h | E4,G4:q F4,A4:q G4,B4:h | C4,E4,G4:h B3,D4,G4:h | C4,E4,G4:w |
            E4,C5:q F4,D5:q G4,E5:q A4,F5:q | G4,B4,D5:h G4,C5,E5:h | F4,A4,C5:q E4,G4,C5:q D4,G4,B4:h |
            A4,B4:h D4,E4:q F4,G4:q | C4,E4,G4,C5:w |]`,
  // Chords with chord symbols and broken-chord eighths (D major).
  chordsD: `"D" D4,F#4,A4:h "A" C#4,E4,A4:h | "Bm" B3,D4,F#4:q D4:8 F#4:8 "G" B3,D4,G4:h |
            "D" F#4,A4:q A4,D5:q "A7" G4,A4,C#5:h | "D" D4,F#4,A4,D5:w |]`,
  // Chromatic line: sharps going up, flats coming down.
  chromatic: `E4:8 F4:8 F#4:8 G4:8 G#4:8 A4:8 A#4:8 B4:8 | C5:8 C#5:8 D5:8 D#5:8 E5:h |
              E5:8 Eb5:8 D5:8 Db5:8 C5:8 B4:8 Bb4:8 A4:8 | Ab4:8 G4:8 Gb4:8 F4:8 E4:h |]`,
};

/** Scale run in eighths from `start`, `count` notes up then back down, closing on a long note. */
function scaleRun(key, start, count, time = 4) {
  const up = [];
  for (let i = 0; i < count; i++) up.push(diatonic(key, start, i));
  const line = up.concat(up.slice(0, -1).reverse());
  const toks = [];
  const perBar = time * 2;
  line.forEach((p, i) => {
    toks.push(`${p}:8`);
    if ((i + 1) % perBar === 0) toks.push('|');
  });
  const rem = line.length % perBar;
  if (rem !== 0) {
    // Fill the last bar with one closing note of the remaining length.
    const left = perBar - rem;
    const fill = { 1: '8', 2: 'q', 3: 'q.', 4: 'h', 5: 'h', 6: 'h.', 7: 'h.' }[left];
    toks.push(`${start}:${fill}`);
    if (left === 5) toks.push('r:8');
    if (left === 7) toks.push('r:8');
  } else {
    toks.push(`${start}:w`);
  }
  toks.push('|]');
  return toks.join(' ');
}

/** Sixteenth-note arpeggio study over the given chords (lists of written pitches, low to high). */
function arpeggios(chords, beats = 4) {
  const toks = [];
  for (const tones of chords) {
    const cyc = tones.concat(tones.slice(1, -1).reverse());
    for (let i = 0; i < beats * 4; i++) toks.push(`${cyc[i % cyc.length]}:16`);
    toks.push('|');
  }
  toks.pop();
  toks.push('|]');
  return toks.join(' ');
}

/** A seeded, stepwise-with-leaps melodic line in `key`: mixed values, rests, a few accidentals. */
function randomLine(seed, key, beatsPerBar, bars, low = 'E3', span = 17) {
  const rnd = rng(seed);
  const cells = [
    ['q'], ['q'], ['8', '8'], ['8', '8'], ['8.', '16'], ['16', '16', '8'], ['8', '16', '16'],
    ['16', '16', '16', '16'], ['h'], ['q.', '8'],
  ];
  const cellBeats = (c) => c.reduce((a, d) => a + ({ q: 1, 8: 0.5, '8.': 0.75, 16: 0.25, h: 2, 'q.': 1.5 }[d]), 0);
  let step = Math.floor(span / 2);
  const toks = [];
  for (let b = 0; b < bars; b++) {
    let left = beatsPerBar;
    while (left > 0) {
      let cell;
      do { cell = cells[Math.floor(rnd() * cells.length)]; } while (cellBeats(cell) > left);
      for (const d of cell) {
        const r = rnd();
        if (r < 0.07 && d !== 'h') { toks.push(`r:${d}`); continue; }
        const move = r < 0.6 ? (rnd() < 0.5 ? -1 : 1) : r < 0.85 ? (rnd() < 0.5 ? -2 : 2) : (rnd() < 0.5 ? -4 : 3);
        step = Math.max(0, Math.min(span, step + move));
        let p = diatonic(key, low, step);
        if (rnd() < 0.08) {
          // Chromatic neighbour: raise a natural note or cancel a key-signature accidental.
          const pp = parsePitch(p);
          p = pp.alter === 0 ? `${pp.step}#${pp.octave}` : `${pp.step}${pp.octave}`;
          if (pp.alter === 0 && (pp.step === 'E' || pp.step === 'B')) p = `${pp.step}b${pp.octave}`;
        }
        toks.push(`${p}:${d}`);
      }
      left -= cellBeats(cell);
    }
    toks.push(b === bars - 1 ? '|]' : '|');
  }
  return toks.join(' ');
}

/** Tab-only: the A minor pentatonic box at the 12th fret, up and down in eighths. */
function pentatonic12() {
  const box = [[6, 12], [6, 15], [5, 12], [5, 14], [4, 12], [4, 14], [3, 12], [3, 14], [2, 12], [2, 15], [1, 12], [1, 15]];
  const line = box.concat(box.slice(0, -1).reverse());
  const toks = [];
  line.forEach(([s, f], i) => { toks.push(`${s}/${f}:8`); if ((i + 1) % 8 === 0) toks.push('|'); });
  toks.push('1/12:8', '|]');
  return toks.join(' ');
}

/** Tab-only: seeded single notes all over the neck, one- and two-digit frets, mixed values. */
function randomTab(seed, bars) {
  const rnd = rng(seed);
  const toks = [];
  for (let b = 0; b < bars; b++) {
    let left = 8; // eighths per 4/4 bar
    while (left > 0) {
      const d = left >= 2 && rnd() < 0.45 ? 2 : 1;
      const s = 1 + Math.floor(rnd() * 6);
      const f = rnd() < 0.45 ? 9 + Math.floor(rnd() * 11) : Math.floor(rnd() * 10);
      if (rnd() < 0.2) {
        const s2 = s < 6 ? s + 1 : s - 1;
        const f2 = Math.max(0, f + Math.floor(rnd() * 5) - 2);
        toks.push(`${s}/${f},${s2}/${f2}:${d === 2 ? 'q' : '8'}`);
      } else {
        toks.push(`${s}/${f}:${d === 2 ? 'q' : '8'}`);
      }
      left -= d;
    }
    toks.push(b === bars - 1 ? '|]' : '|');
  }
  return toks.join(' ');
}

const TAB_TUNES = {
  // Open chords as strums (string/fret stacks) with chord symbols.
  openChords: `"C" 5/3,4/2,3/0,2/1,1/0:h "G" 6/3,5/2,4/0,3/0,2/0,1/3:h |
               "Am" 5/0,4/2,3/2,2/1,1/0:q 5/0,4/2,3/2,2/1,1/0:q "F" 4/3,3/2,2/1,1/1:h |
               "Em" 6/0,5/2,4/2,3/0,2/0,1/0:q 3/0,2/0,1/0:q "D" 4/0,3/2,2/3,1/2:h |
               "G" 6/3,5/2,4/0,3/0,2/0,1/3:q 4/0,3/0,2/0:8 4/0,3/0,2/0:8 "C" 5/3,4/2,3/0,2/1,1/0:h |]`,
  // Barre and power chords up the neck (two-digit stacks).
  highChords: `6/10,5/12,4/12:q 6/10,5/12,4/12:q 6/8,5/10,4/10:h | 5/12,4/14,3/14,2/13:h 5/10,4/12,3/12,2/11:h |
               6/12,5/14,4/14:q 6/15,5/17,4/17:q 6/10,5/12,4/12:h | 1/12,2/13,3/14:w |]`,
  // Fingerstyle pattern in sixteenths (Am - C - G - Em).
  fingerstyle: `5/0:16 3/2:16 2/1:16 1/0:16 2/1:16 3/2:16 4/2:16 3/2:16 5/0:16 3/2:16 2/1:16 1/0:16 2/1:16 3/2:16 4/2:16 3/2:16 |
                5/3:16 3/0:16 2/1:16 1/0:16 2/1:16 3/0:16 4/2:16 3/0:16 5/3:16 3/0:16 2/1:16 1/0:16 2/1:16 3/0:16 4/2:16 3/0:16 |
                6/3:16 3/0:16 2/0:16 1/3:16 2/0:16 3/0:16 4/0:16 3/0:16 6/0:16 3/0:16 2/0:16 1/0:16 2/0:16 3/0:16 4/2:16 3/0:16 |
                5/0,1/0:h r:q 5/0:q |]`,
  // Rhythm reading in tab: every value, rests, a dotted figure.
  rhythm: `6/0:w | 5/2:h 4/2:h | 3/0:q 2/1:q 1/0:q 2/3:q | 1/5:8 1/7:8 1/8:8 1/10:8 1/12:8 1/10:8 1/8:8 1/7:8 |
           r:q 2/5:q. 2/7:8 r:q | 3/9:16 3/11:16 2/10:16 2/12:16 1/10:8 1/12:8 1/15:h | 6/3:q. 5/2:8 4/0:h |]`,
};

// ------------------------------------------------------------------------------------------
// Corpus
// ------------------------------------------------------------------------------------------

const TAB_FONTS = {
  ls: '10pt "Liberation Sans"',
  lsb: 'bold 10pt "Liberation Sans"',
  jbm: '500 10pt "JetBrains Mono"',
  ins: '600 10pt "Instrument Sans"',
  bri: '500 11pt "Bricolage Grotesque"',
};
/** px per staff space at "dpi" for a 7 mm staff (1.75 mm space), VexFlow space = 10 units. */
const scaleFor = (dpi, size) => (1.75 / 25.4) * dpi * 0.1 * size;

/**
 * One corpus entry per rendered image. `variants` lists [dpi, music font, size, tab font] tuples;
 * every variant becomes one PNG, so a score can appear at several resolutions and in several
 * engraving styles without multiplying everything.
 */
const SCORES = [
  // ---- notation only -------------------------------------------------------------------
  { name: 'ode', subset: 'notation', title: 'Ode to Joy', src: TUNES.odeG, key: 'G', time: '4/4',
    variants: [[100, 'Bravura', 1], [150, 'Bravura', 1], [220, 'Bravura', 1]] },
  { name: 'ode-low', subset: 'notation', src: TUNES.odeC, key: 'C', time: '4/4', maxMeasures: 4,
    variants: [[150, 'Petaluma', 1.15]] },
  { name: 'greensleeves', subset: 'notation', title: 'Greensleeves', src: TUNES.greenAm, key: 'Am', time: '3/4', pickup: true, maxMeasures: 9,
    variants: [[150, 'Gonville', 1], [100, 'Gonville', 1.1]] },
  { name: 'greensleeves68', subset: 'notation', src: TUNES.green68, key: 'Em', time: '6/8', pickup: true,
    variants: [[150, 'Petaluma', 1], [220, 'Bravura', 0.9]] },
  { name: 'amazing', subset: 'notation', title: 'Amazing Grace', src: TUNES.amazing, key: 'G', time: '3/4', pickup: true, maxMeasures: 9,
    variants: [[150, 'Leland', 1], [220, 'Gonville', 1]] },
  { name: 'scarborough', subset: 'notation', src: TUNES.scarborough, key: 'G', time: '3/4', maxMeasures: 10, tempo: 'Andante',
    variants: [[100, 'Petaluma', 1.2], [150, 'Bravura', 0.85]] },
  { name: 'elise', subset: 'notation', src: TUNES.elise, key: 'Am', time: '3/8', pickup: true,
    variants: [[150, 'Bravura', 1], [100, 'Leland', 1.15]] },
  { name: 'minuet', subset: 'notation', src: TUNES.minuet, key: 'G', time: '3/4',
    variants: [[150, 'Gonville', 0.9]] },
  { name: 'scale-c', subset: 'notation', src: scaleRun('C', 'C4', 15), key: 'C', time: '4/4',
    variants: [[150, 'Gonville', 1]] },
  { name: 'scale-e', subset: 'notation', src: scaleRun('E', 'E3', 22), key: 'E', time: '4/4',
    variants: [[150, 'Bravura', 1], [220, 'Leland', 0.85]] },
  { name: 'scale-high', subset: 'notation', src: scaleRun('F', 'F5', 9), key: 'F', time: '4/4',
    variants: [[150, 'Petaluma', 1]] },
  { name: 'chromatic', subset: 'notation', src: TUNES.chromatic, key: 'C', time: '4/4',
    variants: [[150, 'Leland', 1]] },
  { name: 'arpeggio16', subset: 'notation',
    src: arpeggios([['A3', 'E4', 'A4', 'C5', 'E5'], ['D4', 'A4', 'D5', 'F5'], ['E3', 'B3', 'E4', 'G#4', 'B4'], ['A3', 'E4', 'A4', 'C5', 'E5']]),
    key: 'Am', time: '4/4', variants: [[100, 'Bravura', 1.1], [220, 'Petaluma', 0.9]] },
  { name: 'rhythm', subset: 'notation', src: TUNES.rhythmF, key: 'F', time: '4/4',
    variants: [[150, 'Bravura', 1], [100, 'Gonville', 1.2]] },
  { name: 'chords', subset: 'notation', src: TUNES.chordsC, key: 'C', time: '4/4',
    variants: [[150, 'Bravura', 1], [220, 'Leland', 0.9], [150, 'Petaluma', 1.1]] },
  { name: 'triplets', subset: 'notation', src: TUNES.romance, key: 'Em', time: '3/4',
    variants: [[150, 'Bravura', 1]] },
  { name: 'random-bb', subset: 'notation', src: randomLine(11, 'Bb', 4, 6, 'F3', 16), key: 'Bb', time: '4/4',
    variants: [[150, 'Gonville', 1]] },
  { name: 'random-a', subset: 'notation', src: randomLine(23, 'A', 2, 8, 'E3', 18), key: 'A', time: '2/4',
    variants: [[150, 'Bravura', 0.9]] },
  { name: 'random-eb', subset: 'notation', src: randomLine(37, 'Eb', 3, 8, 'G3', 15), key: 'Eb', time: '3/4',
    variants: [[220, 'Petaluma', 0.85]] },
  { name: 'random-d', subset: 'notation', src: randomLine(41, 'D', 4, 6, 'A3', 19), key: 'D', time: '4/4',
    variants: [[100, 'Leland', 1.2]] },
  { name: 'page-notation', subset: 'notation', title: 'Three Traditional Tunes', composer: 'Trad.',
    src: [TUNES.greenAm, TUNES.minuet.replace(/F#/g, 'F'), randomLine(5, 'Am', 3, 8, 'A3', 14)].join(' ').replace(/\|\]\s+(?=\S)/g, '|| '),
    key: 'Am', time: '3/4', pickup: true, fullPage: true, tempo: 'Moderato',
    variants: [[150, 'Bravura', 1], [100, 'Gonville', 1]] },

  // ---- tab only ------------------------------------------------------------------------
  { name: 'tab-ode', subset: 'tab', title: 'Ode to Joy', src: TUNES.odeG, time: '4/4',
    variants: [[100, 'Bravura', 1, 'ls'], [150, 'Bravura', 1, 'ls'], [220, 'Bravura', 1, 'lsb']] },
  { name: 'tab-pentatonic', subset: 'tab', src: pentatonic12(), time: '4/4', tabStems: true,
    variants: [[150, 'Bravura', 1, 'jbm'], [100, 'Bravura', 1.15, 'lsb']] },
  { name: 'tab-open-chords', subset: 'tab', src: TAB_TUNES.openChords, time: '4/4',
    variants: [[150, 'Bravura', 1, 'ins'], [220, 'Bravura', 0.9, 'ls']] },
  { name: 'tab-high-chords', subset: 'tab', src: TAB_TUNES.highChords, time: '4/4', tabClef: false,
    variants: [[150, 'Bravura', 1, 'lsb']] },
  { name: 'tab-fingerstyle', subset: 'tab', src: TAB_TUNES.fingerstyle, time: '4/4', tabStems: true,
    variants: [[150, 'Bravura', 1, 'bri'], [220, 'Bravura', 0.85, 'jbm']] },
  { name: 'tab-random', subset: 'tab', src: randomTab(7, 6), time: '4/4', lineThrough: true,
    variants: [[150, 'Bravura', 1, 'ls'], [220, 'Bravura', 1, 'ins']] },
  { name: 'tab-random-stems', subset: 'tab', src: randomTab(19, 6), time: '4/4', tabStems: true, tabSpace: 15,
    variants: [[100, 'Bravura', 1.2, 'ls']] },
  { name: 'tab-rhythm', subset: 'tab', src: TAB_TUNES.rhythm, time: '4/4', tabStems: true, timeSig: true,
    variants: [[150, 'Bravura', 1, 'lsb']] },
  { name: 'page-tab', subset: 'tab', title: 'Position Studies', composer: 'Exercise',
    src: [pentatonic12(), randomTab(3, 8), TAB_TUNES.highChords, randomTab(29, 6)].join(' ').replace(/\|\]\s+(?=\S)/g, '|| '),
    time: '4/4', fullPage: true, variants: [[150, 'Bravura', 1, 'ls']] },

  // ---- notation + tab ------------------------------------------------------------------
  { name: 'linked-ode', subset: 'linked', title: 'Ode to Joy', src: TUNES.odeG, key: 'G', time: '4/4',
    variants: [[100, 'Bravura', 1, 'ls'], [150, 'Bravura', 1, 'ls'], [220, 'Bravura', 1, 'ls']] },
  { name: 'linked-greensleeves', subset: 'linked', src: TUNES.greenAm, key: 'Am', time: '3/4', pickup: true, maxMeasures: 9, connector: 'bracket',
    variants: [[150, 'Gonville', 1, 'jbm']] },
  { name: 'linked-amazing', subset: 'linked', src: TUNES.amazing, key: 'G', time: '3/4', pickup: true, maxMeasures: 9, barThrough: true,
    variants: [[150, 'Petaluma', 1, 'ins']] },
  { name: 'linked-scale-e', subset: 'linked', src: scaleRun('E', 'E3', 22), key: 'E', time: '4/4',
    variants: [[150, 'Leland', 1, 'lsb']] },
  { name: 'linked-chords', subset: 'linked', src: TUNES.chordsD, key: 'D', time: '4/4',
    variants: [[150, 'Bravura', 1, 'ls'], [220, 'Gonville', 0.9, 'bri']] },
  { name: 'linked-arpeggio', subset: 'linked',
    src: arpeggios([['A3', 'E4', 'A4', 'C5', 'E5'], ['E3', 'B3', 'E4', 'G#4', 'B4']]), key: 'Am', time: '4/4',
    variants: [[100, 'Bravura', 1.2, 'ls']] },
  { name: 'linked-aura-lee', subset: 'linked', src: TUNES.auraLee, key: 'G', time: '4/4', tempo: 'Slowly', connector: 'bracket', tabSpace: 15,
    variants: [[150, 'Leland', 1.1, 'ins']] },
  { name: 'linked-random-a', subset: 'linked', src: randomLine(53, 'A', 4, 4, 'E3', 18), key: 'A', time: '4/4', position: 2,
    variants: [[150, 'Petaluma', 1, 'ls']] },
  { name: 'linked-random-high', subset: 'linked', src: randomLine(71, 'G', 3, 6, 'G4', 14), key: 'G', time: '3/4', position: 7, tabStems: true,
    variants: [[220, 'Bravura', 0.85, 'jbm']] },
  { name: 'linked-elise', subset: 'linked', src: TUNES.elise, key: 'Am', time: '3/8', pickup: true, lineThrough: true,
    variants: [[150, 'Bravura', 1, 'lsb']] },
  { name: 'page-linked', subset: 'linked', title: 'Scarborough Fair', composer: 'Traditional',
    src: TUNES.scarborough, key: 'G', time: '3/4', fullPage: true, tempo: 'Andante', position: 0,
    variants: [[150, 'Bravura', 1, 'ls'], [100, 'Gonville', 1, 'lsb']] },
];

/** Expand SCORES into one render spec per image. */
function buildSpecs() {
  const specs = [];
  for (const sc of SCORES) {
    for (const [dpi, font, size, tabFontKey] of sc.variants) {
      const measures = parseScore(sc.src, { position: sc.position || 0 });
      const slice = sc.maxMeasures ? measures.slice(0, sc.maxMeasures) : measures;
      if (sc.maxMeasures && slice.length) slice[slice.length - 1].end = 'end';
      const [num, den] = sc.time.split('/').map(Number);
      const barTicks = (3840 / den) * num;
      const warnings = [];
      slice.forEach((m, i) => {
        const t = m.events.reduce((a, e) => a + e.ticks, 0);
        const pickup = sc.pickup && i === 0;
        if (t !== barTicks && !pickup) warnings.push(`${sc.name}: measure ${i} has ${t} ticks, expected ${barTicks}`);
      });
      const fontTag = font.toLowerCase();
      const id = [sc.name, sc.subset === 'tab' ? tabFontKey : fontTag, String(dpi)].join('-');
      specs.push({
        id,
        name: sc.name,
        subset: sc.subset,
        title: sc.title || null,
        composer: sc.composer || null,
        tempo: sc.tempo || null,
        key: sc.key || 'C',
        fifths: KEY_FIFTHS[sc.key || 'C'],
        time: sc.time,
        pickup: !!sc.pickup,
        dpi,
        size,
        scale: Math.round(scaleFor(dpi, size) * 10000) / 10000,
        font,
        tabFontKey: tabFontKey || 'ls',
        tabFont: TAB_FONTS[tabFontKey || 'ls'],
        textFont: font === 'Petaluma' ? 'Bricolage Grotesque' : font === 'Gonville' ? 'Instrument Sans' : 'Liberation Sans',
        fullPage: !!sc.fullPage,
        tabStems: !!sc.tabStems,
        tabClef: sc.tabClef !== false,
        tabSpace: sc.tabSpace || 13,
        timeSig: sc.subset !== 'tab' || !!sc.timeSig,
        lineThrough: !!sc.lineThrough,
        connector: sc.connector || 'single',
        barThrough: !!sc.barThrough,
        lineThickness: font === 'Gonville' ? 1.2 : font === 'Petaluma' ? 1.4 : 1,
        measures: slice,
        warnings,
      });
    }
  }
  return specs;
}

// ------------------------------------------------------------------------------------------
// In-page engraving (runs inside Chromium; must be self-contained)
// ------------------------------------------------------------------------------------------

/* global Vex, document, getComputedStyle */
function renderInPage(spec) {
  const VF = Vex.Flow;
  const S = spec.scale;
  const linked = spec.subset === 'linked';
  const hasNotation = spec.subset !== 'tab';
  const hasTab = spec.subset !== 'notation';
  const SP = 10; // notation staff space in VexFlow units
  const TSP = spec.tabSpace;
  const DUR_NAME = { w: 'whole', h: 'half', q: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd' };

  VF.setMusicFont(spec.font, 'Bravura', 'Custom');
  VF.STAVE_LINE_THICKNESS = spec.lineThickness;

  // Give un-grouped drawings (accidentals, dots, flags, tuplets) their own SVG group so their
  // boxes can be read back from the DOM. Done once per page.
  if (!VF.__omrPatched) {
    const wrap = (Cls, method, cls) => {
      const orig = Cls.prototype[method];
      if (!orig) return;
      Cls.prototype[method] = function patched(...args) {
        const ctx = this.checkContext();
        const id = this.getAttribute('id') + (method === 'draw' ? '' : `-${cls}`);
        ctx.openGroup(cls, id);
        try { return orig.apply(this, args); } finally { ctx.closeGroup(); }
      };
    };
    wrap(VF.Accidental, 'draw', 'accidental');
    wrap(VF.Dot, 'draw', 'dot');
    wrap(VF.StaveNote, 'drawFlag', 'flag');
    wrap(VF.TabNote, 'drawFlag', 'flag');
    wrap(VF.Tuplet, 'draw', 'tuplet');
    VF.__omrPatched = true;
  }

  // ---- page geometry (VexFlow units) ------------------------------------------------------
  const PAGE_W = Math.round((8.27 * spec.dpi) / S);
  const MARGIN = 62;
  const SYS_W = PAGE_W - 2 * MARGIN;
  const [NUM, DEN] = spec.time.split('/').map(Number);

  const host = document.getElementById('out');
  host.innerHTML = '';
  const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
  renderer.resize(PAGE_W, 4000);
  const ctx = renderer.getContext();
  const svg = host.querySelector('svg');
  const SVGNS = 'http://www.w3.org/2000/svg';

  // ---- helpers: boxes ---------------------------------------------------------------------
  const meas = document.createElement('canvas').getContext('2d');
  /** Ink box of an SVG <text>, from canvas text metrics in the same font. */
  function textInk(t) {
    const cs = getComputedStyle(t);
    meas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = meas.measureText(t.textContent);
    let x = parseFloat(t.getAttribute('x'));
    const y = parseFloat(t.getAttribute('y'));
    if (cs.textAnchor === 'middle') x -= m.width / 2; else if (cs.textAnchor === 'end') x -= m.width;
    return {
      x: x - m.actualBoundingBoxLeft, y: y - m.actualBoundingBoxAscent,
      w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
      h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
    };
  }
  /** Ink box of a leaf shape (stroke width included across the stroke direction). */
  function leafInk(el) {
    if (el.tagName === 'text') return textInk(el);
    const cs = getComputedStyle(el);
    if (el.tagName === 'rect' && (el.getAttribute('fill') === 'white' || cs.fill === 'rgb(255, 255, 255)')) return null;
    const b = el.getBBox();
    let x = b.x, y = b.y, w = b.width, h = b.height;
    if (cs.stroke && cs.stroke !== 'none') {
      const sw = parseFloat(cs.strokeWidth) || 0;
      if (w < 1e-6 && h < 1e-6) return null;
      if (h < 1e-6) { y -= sw / 2; h = sw; } else if (w < 1e-6) { x -= sw / 2; w = sw; } else if (cs.fill === 'none') {
        x -= sw / 2; y -= sw / 2; w += sw; h += sw;
      }
    } else if (w < 1e-6 || h < 1e-6) {
      return null;
    }
    return { x, y, w, h };
  }
  function union(a, b) {
    if (!a) return b;
    if (!b) return a;
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  /** Ink box of everything drawn inside an SVG node. */
  function inkOf(node) {
    if (!node) return null;
    if (node.tagName !== 'g') return leafInk(node);
    let box = null;
    for (const child of node.children) box = union(box, inkOf(child));
    return box;
  }
  /**
   * Ink box of a note head alone. VexFlow draws the modifiers of a head (accidental, dots) inside
   * the head's own group; they were given groups of their own above, so skip nested groups.
   */
  function headInk(node) {
    if (!node) return null;
    let box = null;
    for (const child of node.children) if (child.tagName !== 'g') box = union(box, leafInk(child));
    return box;
  }
  const domOf = (el) => document.getElementById(`vf-${el.getAttribute('id')}`);
  const r2 = (v) => Math.round(v * S * 100) / 100;
  const px = (b) => (b ? [r2(b.x), r2(b.y), r2(b.w), r2(b.h)] : null);

  const texts = [];
  /** Draw a text label of our own and record it. */
  function label(kind, text, x, y, opts) {
    const t = document.createElementNS(SVGNS, 'text');
    t.textContent = text;
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('font-family', `"${opts.family || spec.textFont}"`);
    t.setAttribute('font-size', `${opts.size}px`);
    t.setAttribute('font-weight', String(opts.weight || 400));
    t.setAttribute('font-style', opts.italic ? 'italic' : 'normal');
    t.setAttribute('text-anchor', opts.anchor || 'start');
    t.setAttribute('fill', '#000');
    svg.appendChild(t);
    const rec = { kind, text, bbox: px(textInk(t)) };
    if (opts.system !== undefined) rec.system = opts.system;
    if (opts.measure !== undefined) rec.measure = opts.measure;
    texts.push(rec);
    return rec;
  }

  // ---- line breaking ------------------------------------------------------------------------
  const EV_W = { w: 62, h: 50, q: 40, 8: 31, 16: 25, 32: 22 };
  const sizeBoost = spec.subset === 'tab' ? 0.92 : 1;
  function naturalWidth(m) {
    let w = 26;
    for (const ev of m.events) {
      let e = EV_W[ev.dur] * sizeBoost + ev.dots * 7;
      if (ev.tuplet) e *= 0.82;
      if (!ev.rest && ev.notes.some((n) => n.alter !== 0)) e += 5;
      if (hasTab && !ev.rest && ev.notes.some((n) => n.tab.fret > 9)) e += 4;
      w += e;
    }
    if (m.repeatBegin || m.end === 'repeat-end') w += 14;
    return w;
  }
  const lead = 46 + Math.abs(spec.fifths) * 11 + 8; // clef + key signature (time adds 30 on system 1)
  const systems = [];
  {
    let cur = [];
    let used = 0;
    for (const m of spec.measures) {
      const w = naturalWidth(m);
      const head = cur.length === 0 ? lead + (systems.length === 0 && spec.timeSig ? 30 : 0) : 0;
      if (cur.length && used + w > SYS_W) {
        systems.push(cur);
        cur = [];
        used = 0;
      }
      if (cur.length === 0) used = head || (lead + 0);
      cur.push({ m, w });
      used += w;
    }
    if (cur.length) systems.push(cur);
  }

  // ---- vertical layout ------------------------------------------------------------------------
  let y = 34;
  if (spec.title) {
    label('title', spec.title, PAGE_W / 2, y + 22, { size: 24, weight: 700, anchor: 'middle' });
    y += 44;
    if (spec.composer) {
      label('composer', spec.composer, PAGE_W - MARGIN, y + 4, { size: 12, italic: spec.textFont === 'Liberation Sans', anchor: 'end' });
      y += 14;
    }
  }

  const out = { systems: [], texts };
  const allNoteObjs = []; // for ties: { ev, note, tabNote, sys }
  let prevTied = null;

  systems.forEach((sysMeasures, sysIndex) => {
    const evs = sysMeasures.flatMap((x) => x.m.events);
    const hasChords = evs.some((e) => e.chord);
    const sysHasTempo = sysIndex === 0 && !!spec.tempo;
    // Staff position of the written notes in VexFlow "line" units (bottom line = 1, top = 5).
    const lineOf = (n) => (['C', 'D', 'E', 'F', 'G', 'A', 'B'].indexOf(n.step) + n.octave * 7 - 30) / 2 + 1;
    let maxLine = 5, minLine = 1;
    if (hasNotation) for (const e of evs) for (const n of e.notes) { const l = lineOf(n); if (l > maxLine) maxLine = l; if (l < minLine) minLine = l; }

    let nTop = 0, tTop = 0, sysBottom = 0;
    const labelRoom = (hasChords ? 20 : 0) + (sysHasTempo ? 20 : 0);
    if (hasNotation) {
      const above = 34 + Math.max(0, maxLine - 5) * SP + (maxLine > 5 ? 24 : 0) + labelRoom + (evs.some((e) => e.tuplet) ? 18 : 0);
      nTop = y + above;
      const below = 36 + Math.max(0, 1 - minLine) * SP + (minLine < 1 ? 26 : 0);
      if (hasTab) {
        tTop = nTop + 4 * SP + Math.max(below, 58);
        sysBottom = tTop + 5 * TSP + (spec.tabStems ? 62 : 24);
      } else {
        sysBottom = nTop + 4 * SP + below;
      }
    } else {
      tTop = y + 26 + labelRoom;
      sysBottom = tTop + 5 * TSP + (spec.tabStems ? 62 : 24);
    }
    const labelY = (hasNotation ? nTop - Math.max(0, maxLine - 5) * SP - (maxLine > 5 ? 20 : 0) : tTop) - 14 - (evs.some((e) => e.tuplet) ? 16 : 0);

    // Justify, except a short last system which keeps its natural width (ragged right).
    const head = lead + (sysIndex === 0 && spec.timeSig ? 30 : 0);
    const natural = sysMeasures.reduce((a, x) => a + x.w, 0);
    const last = sysIndex === systems.length - 1;
    const stretch = last && natural + head < SYS_W * 0.72 ? 1.12 : (SYS_W - head) / natural;

    const sysOut = { index: sysIndex, connector: linked ? spec.connector : 'none', barThrough: linked && spec.barThrough, staves: [] };
    const nStaffOut = hasNotation ? { kind: 'notation', lineCount: 5, barlines: [], measures: [], clef: null, key: null, time: null } : null;
    const tStaffOut = hasTab ? { kind: 'tab', lineCount: 6, barlines: [], measures: [], clef: null, time: null, stems: spec.tabStems, lineThrough: spec.lineThrough } : null;

    let x = MARGIN;
    const drawn = []; // per measure: { m, nStave, tStave, nNotes, tNotes }
    const sysTies = [];
    const beamsToDraw = [];
    const tupletsToDraw = [];

    sysMeasures.forEach(({ m, w }, i) => {
      const first = i === 0;
      const width = w * stretch + (first ? head : 0);
      const mk = (top, spacing, lines, Tab) => {
        const st = new (Tab ? VF.TabStave : VF.Stave)(x, top - 4 * spacing, width, {
          spacing_between_lines_px: spacing, space_above_staff_ln: 4, num_lines: lines, fill_style: '#000000',
        });
        st.setDefaultLedgerLineStyle({ strokeStyle: '#000000', lineWidth: 1.3 * spec.lineThickness });
        return st;
      };
      const nStave = hasNotation ? mk(nTop, SP, 5, false) : null;
      const tStave = hasTab ? mk(tTop, TSP, 6, true) : null;
      const BT = VF.Barline.type;
      const endType = { single: BT.SINGLE, double: BT.DOUBLE, end: BT.END, 'repeat-end': BT.REPEAT_END }[m.end];
      for (const st of [nStave, tStave]) {
        if (!st) continue;
        // A single staff starts without a bar line; systems and tab staves start with one.
        const openBar = linked || st === tStave;
        st.setBegBarType(m.repeatBegin ? BT.REPEAT_BEGIN : first && openBar ? BT.SINGLE : BT.NONE);
        st.setEndBarType(endType);
      }
      if (first) {
        if (nStave) {
          nStave.addClef('treble');
          if (spec.fifths !== 0) nStave.addKeySignature(spec.key);
          if (sysIndex === 0) nStave.addTimeSignature(spec.time);
        }
        if (tStave) {
          if (spec.tabClef) tStave.addClef('tab');
          if (sysIndex === 0 && spec.timeSig && !hasNotation) tStave.addTimeSignature(spec.time);
        }
      }
      if (nStave && tStave) {
        const sx = Math.max(nStave.getNoteStartX(), tStave.getNoteStartX());
        nStave.setNoteStartX(sx);
        tStave.setNoteStartX(sx);
      } else if (tStave && first && !spec.tabClef) {
        tStave.setNoteStartX(tStave.getNoteStartX() + 8);
      }
      if (nStave) nStave.setContext(ctx).draw();
      if (tStave) tStave.setContext(ctx).draw();

      // -- notes
      const nNotes = [];
      const tNotes = [];
      for (const ev of m.events) {
        if (nStave) {
          const struct = ev.rest
            ? { keys: [ev.dur === 'w' ? 'd/5' : 'b/4'], duration: `${ev.dur}r`, dots: ev.dots }
            : { keys: ev.notes.map((n) => n.vex), duration: ev.dur, dots: ev.dots, auto_stem: true };
          const sn = new VF.StaveNote(struct);
          for (let d = 0; d < ev.dots; d++) VF.Dot.buildAndAttach([sn], { all: true });
          nNotes.push(sn);
        }
        if (tStave) {
          let tn;
          if (ev.rest) {
            tn = spec.tabStems || !hasNotation
              ? new VF.StaveNote({ keys: [ev.dur === 'w' ? 'd/5' : 'b/4'], duration: `${ev.dur}r`, dots: ev.dots })
              : new VF.GhostNote({ duration: ev.dur, dots: ev.dots });
            if (tn.getCategory() === 'StaveNote') for (let d = 0; d < ev.dots; d++) VF.Dot.buildAndAttach([tn], { all: true });
          } else {
            // VexFlow keeps tab positions in the order given; emit them top string first.
            const pos = ev.notes.map((n) => ({ str: n.tab.string, fret: n.tab.fret })).sort((a, b) => a.str - b.str);
            tn = new VF.TabNote({ positions: pos, duration: ev.dur, dots: ev.dots }, spec.tabStems);
            tn.render_options.font = spec.tabFont;
            if (spec.tabStems) {
              tn.setStemDirection(-1);
              for (let d = 0; d < ev.dots; d++) VF.Dot.buildAndAttach([tn], { all: true });
            }
          }
          tNotes.push(tn);
        }
      }
      // -- tuplets (tick adjustment must happen before formatting)
      const groups = new Map();
      m.events.forEach((ev, k) => {
        if (!ev.tuplet) return;
        if (!groups.has(ev.tuplet.id)) groups.set(ev.tuplet.id, []);
        groups.get(ev.tuplet.id).push(k);
      });
      for (const idxs of groups.values()) {
        const t = m.events[idxs[0]].tuplet;
        if (nStave) tupletsToDraw.push(new VF.Tuplet(idxs.map((k) => nNotes[k]), { num_notes: t.num, notes_occupied: t.occ }));
        if (tStave) {
          const tt = new VF.Tuplet(idxs.map((k) => tNotes[k]), { num_notes: t.num, notes_occupied: t.occ, location: -1 });
          if (spec.tabStems) tupletsToDraw.push(tt);
        }
      }
      const voices = [];
      const mkVoice = (notes) => new VF.Voice({ num_beats: NUM, beat_value: DEN }).setMode(VF.Voice.Mode.SOFT).addTickables(notes);
      let nVoice = null, tVoice = null;
      if (nStave) { nVoice = mkVoice(nNotes); voices.push(nVoice); VF.Accidental.applyAccidentals([nVoice], spec.key); }
      if (tStave) { tVoice = mkVoice(tNotes); voices.push(tVoice); }
      const beamGroups = VF.Beam.getDefaultBeamGroups(spec.time);
      if (nStave) beamsToDraw.push(...VF.Beam.generateBeams(nNotes, { groups: beamGroups }));
      if (tStave && spec.tabStems) beamsToDraw.push(...VF.Beam.generateBeams(tNotes, { groups: beamGroups, stem_direction: -1 }));
      const fmt = new VF.Formatter();
      for (const v of voices) fmt.joinVoices([v]);
      const ref = nStave || tStave;
      fmt.format(voices, ref.getNoteEndX() - ref.getNoteStartX() - 14);
      if (nVoice) nVoice.draw(ctx, nStave);
      if (tVoice) {
        // "Line through" style: the staff line is not blanked behind the digits.
        const clear = ctx.clearRect;
        if (spec.lineThrough) ctx.clearRect = function noop() { return this; };
        tVoice.draw(ctx, tStave);
        ctx.clearRect = clear;
      }

      // -- ties
      m.events.forEach((ev, k) => {
        const rec = { ev, n: nNotes[k] || null, t: tNotes[k] || null };
        if (prevTied && !ev.rest) sysTies.push({ from: prevTied, to: rec });
        prevTied = ev.tie ? { ...rec, sys: sysIndex } : null;
        allNoteObjs.push(rec);
      });

      if (linked && spec.barThrough) {
        new VF.StaveConnector(nStave, tStave).setType(VF.StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();
      }
      drawn.push({ m, nStave, tStave, nNotes, tNotes, x0: x, x1: x + width });
      x += width;
    });

    // Connector at the start of a linked system.
    if (linked) {
      const a = drawn[0].nStave, b = drawn[0].tStave;
      const before = svg.children.length;
      new VF.StaveConnector(a, b).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
      if (spec.connector === 'bracket') new VF.StaveConnector(a, b).setType(VF.StaveConnector.type.BRACKET).setContext(ctx).draw();
      let box = null;
      for (let k = before; k < svg.children.length; k++) box = union(box, inkOf(svg.children[k]));
      sysOut.connectorBox = px(box);
    }

    beamsToDraw.forEach((b) => b.setContext(ctx).draw());
    tupletsToDraw.forEach((t) => t.setContext(ctx).draw());
    // Ties: whole when both ends are in this system, two halves across a system break.
    const tieBoxes = [];
    const drawTie = (TieCls, a, b) => {
      const idx = a ? a.getKeys ? a.getKeys().map((_, i) => i) : a.getPositions().map((_, i) => i) : b.getKeys ? b.getKeys().map((_, i) => i) : b.getPositions().map((_, i) => i);
      const tie = new TieCls({ first_note: a, last_note: b, first_indices: idx, last_indices: idx });
      tie.setContext(ctx).draw();
      return px(inkOf(domOf(tie)));
    };
    for (const { from, to } of sysTies) {
      const same = from.sys === sysIndex;
      if (from.n && to.n) tieBoxes.push({ staff: 'notation', bbox: drawTie(VF.StaveTie, same ? from.n : null, to.n) });
      if (from.t && to.t && from.t.getCategory() === 'TabNote' && to.t.getCategory() === 'TabNote') {
        tieBoxes.push({ staff: 'tab', bbox: drawTie(VF.TabTie, same ? from.t : null, to.t) });
      }
    }
    if (prevTied && prevTied.sys === sysIndex) {
      // Tie leaving the system: draw the open half now (the other half is drawn with the next system).
      if (prevTied.n) tieBoxes.push({ staff: 'notation', bbox: drawTie(VF.StaveTie, prevTied.n, null) });
    }

    // Text above the system.
    if (sysHasTempo) label('tempo', spec.tempo, MARGIN, labelY - (hasChords ? 20 : 0), { size: 13, weight: 700, system: sysIndex });
    for (const d of drawn) {
      d.m.events.forEach((ev, k) => {
        if (!ev.chord) return;
        const note = (d.nNotes[k] || d.tNotes[k]);
        label('chord', ev.chord, note.getAbsoluteX() - 2, labelY, { size: 14, weight: 700, system: sysIndex, measure: d.m.index });
      });
    }

    // ---- read the ground truth back from the engraving ---------------------------------------
    const staffGeom = (staveOf, lines, spacing, kindOut) => {
      const first = staveOf(drawn[0]);
      const lastSt = staveOf(drawn[drawn.length - 1]);
      kindOut.lines = [];
      for (let l = 0; l < lines; l++) kindOut.lines.push(r2(first.getYForLine(l)));
      kindOut.x0 = r2(first.getX());
      kindOut.x1 = r2(lastSt.getX() + lastSt.getWidth());
      kindOut.space = r2(spacing);
      kindOut.lineThickness = r2(spec.lineThickness);
    };
    const barsOf = (staveOf, kindOut) => {
      const seen = [];
      for (const d of drawn) {
        const st = staveOf(d);
        for (const mod of st.getModifiers()) {
          const cat = mod.getCategory();
          const dom = domOf(mod);
          if (cat === 'Barline') {
            const type = mod.getType();
            const BT = VF.Barline.type;
            if (type === BT.NONE) continue;
            const box = inkOf(dom);
            if (!box) continue;
            const name = { [BT.SINGLE]: 'single', [BT.DOUBLE]: 'double', [BT.END]: 'end', [BT.REPEAT_BEGIN]: 'repeat-begin', [BT.REPEAT_END]: 'repeat-end', [BT.REPEAT_BOTH]: 'repeat-both' }[type] || 'single';
            // Shapes inside the group: vertical bars are rects, repeat dots are small paths.
            const strokes = [];
            for (const ch of dom.children) {
              const b = leafInk(ch);
              if (!b) continue;
              if (b.h > 2.5 * b.w && b.h > 20) strokes.push([r2(b.x), r2(b.w)]);
            }
            const bx = px(box);
            const lineBox = strokes.length ? [Math.min(...strokes.map((s) => s[0])), Math.max(...strokes.map((s) => s[0] + s[1]))] : [bx[0], bx[0] + bx[2]];
            seen.push({ type: name, x: Math.round(((lineBox[0] + lineBox[1]) / 2) * 100) / 100, bbox: bx, strokes });
          } else if (cat === 'Clef') {
            kindOut.clef = { type: kindOut.kind === 'tab' ? 'tab' : 'treble', bbox: px(inkOf(dom)) };
          } else if (cat === 'KeySignature') {
            kindOut.key = { name: spec.key, fifths: spec.fifths, bbox: px(inkOf(dom)) };
          } else if (cat === 'TimeSignature') {
            kindOut.time = { num: NUM, den: DEN, bbox: px(inkOf(dom)) };
          }
        }
      }
      seen.sort((a, b) => a.x - b.x);
      kindOut.barlines = seen;
    };

    if (nStaffOut) {
      staffGeom((d) => d.nStave, 5, SP, nStaffOut);
      barsOf((d) => d.nStave, nStaffOut);
      if (!nStaffOut.key) nStaffOut.key = { name: spec.key, fifths: 0, bbox: null };
      for (const d of drawn) {
        const mo = { index: d.m.index, x0: r2(d.x0), x1: r2(d.x1), events: [] };
        d.m.events.forEach((ev, k) => {
          const sn = d.nNotes[k];
          const dom = domOf(sn);
          const e = {
            type: ev.rest ? 'rest' : 'note',
            duration: { value: DUR_NAME[ev.dur], dots: ev.dots, ticks: ev.ticks },
            bbox: px(inkOf(dom)),
            notes: [],
          };
          if (ev.tuplet) e.duration.tuplet = { actual: ev.tuplet.num, normal: ev.tuplet.occ };
          if (ev.chord) e.chord = ev.chord;
          if (ev.rest) {
            const hb = headInk(domOf(sn.noteHeads[0])) || inkOf(dom);
            e.head = px(hb);
            e.x = r2(hb.x + hb.w / 2);
          } else {
            e.stem = sn.hasStem() ? (sn.getStemDirection() === 1 ? 'up' : 'down') : null;
            e.beamed = !!sn.hasBeam();
            e.flagged = !sn.hasBeam() && (ev.dur === '8' || ev.dur === '16' || ev.dur === '32');
            const stemDom = sn.hasStem() && sn.getStem() ? domOf(sn.getStem()) : null;
            e.stemBox = px(inkOf(stemDom));
            const flagDom = document.getElementById(`vf-${sn.getAttribute('id')}-flag`);
            e.flagBox = px(inkOf(flagDom));
            const accs = sn.getModifiersByType('Accidental');
            const dots = sn.getModifiersByType('Dot');
            e.dotBoxes = dots.map((dd) => px(inkOf(domOf(dd)))).filter(Boolean);
            const props = sn.getKeyProps();
            let cx = 0;
            ev.notes.forEach((n, j) => {
              const hb = headInk(domOf(sn.noteHeads[j]));
              cx += hb.x + hb.w / 2;
              const acc = accs.find((a) => a.getIndex() === j);
              const line = props[j].line;
              e.notes.push({
                written: n.midi, midi: n.sounding, step: n.step, alter: n.alter, octave: n.octave,
                pos: Math.round((line - 1) * 2),
                ledger: line <= 0 ? Math.floor(-line) + 1 : line >= 6 ? Math.floor(line) - 5 : 0,
                accidental: acc ? acc.type : null,
                accBox: acc ? px(inkOf(domOf(acc))) : null,
                head: px(hb),
                headType: ev.dur === 'w' ? 'whole' : ev.dur === 'h' ? 'open' : 'filled',
                tieStart: !!ev.tie,
                tieStop: false,
                string: n.tab.string, fret: n.tab.fret,
              });
            });
            e.x = r2(cx / ev.notes.length);
          }
          mo.events.push(e);
        });
        nStaffOut.measures.push(mo);
      }
      nStaffOut.ties = tieBoxes.filter((t) => t.staff === 'notation').map((t) => t.bbox);
      nStaffOut.beams = beamsToDraw.filter((b) => b.getNotes()[0].getCategory() === 'StaveNote' && drawn.some((d) => d.nNotes.includes(b.getNotes()[0]))).map((b) => px(inkOf(domOf(b))));
      nStaffOut.tuplets = tupletsToDraw.map((t) => px(inkOf(domOf(t)))).filter(Boolean);
      sysOut.staves.push(nStaffOut);
    }
    if (tStaffOut) {
      staffGeom((d) => d.tStave, 6, TSP, tStaffOut);
      barsOf((d) => d.tStave, tStaffOut);
      for (const d of drawn) {
        const mo = { index: d.m.index, x0: r2(d.x0), x1: r2(d.x1), events: [] };
        d.m.events.forEach((ev, k) => {
          const tn = d.tNotes[k];
          const cat = tn.getCategory();
          const e = { type: ev.rest ? 'rest' : 'note', duration: { value: DUR_NAME[ev.dur], dots: ev.dots, ticks: ev.ticks }, notes: [] };
          if (ev.tuplet) e.duration.tuplet = { actual: ev.tuplet.num, normal: ev.tuplet.occ };
          if (ev.chord) e.chord = ev.chord;
          if (cat === 'GhostNote') {
            e.hidden = true;
            e.x = r2(tn.getAbsoluteX());
            e.bbox = null;
          } else if (cat === 'StaveNote') {
            const hb = inkOf(domOf(tn));
            e.bbox = px(hb);
            e.x = r2(hb.x + hb.w / 2);
          } else {
            const dom = domOf(tn);
            e.bbox = px(inkOf(dom));
            const textsEls = [...dom.children].filter((c) => c.tagName === 'text');
            const pos = tn.getPositions();
            let cx = 0;
            pos.forEach((p, j) => {
              const tb = textInk(textsEls[j]);
              cx += tb.x + tb.w / 2;
              const src = ev.notes.find((n) => n.tab.string === Number(p.str));
              e.notes.push({ string: Number(p.str), fret: Number(p.fret), bbox: px(tb), midi: src.sounding, written: src.midi, tieStart: !!ev.tie, tieStop: false });
            });
            e.x = r2(cx / pos.length);
            if (spec.tabStems) {
              e.stem = 'down';
              e.beamed = !!tn.hasBeam();
              const stemDom = tn.getStem() ? domOf(tn.getStem()) : null;
              e.stemBox = px(inkOf(stemDom));
            }
          }
          mo.events.push(e);
        });
        tStaffOut.measures.push(mo);
      }
      sysOut.staves.push(tStaffOut);
    }
    // Mark tie ends on the receiving notes.
    for (const { to } of sysTies) to.ev.__tieStop = true;
    out.systems.push(sysOut);
    y = sysBottom + 26;
  });

  // tieStop flags (set after all systems so cross-system ties are covered).
  {
    let k = 0;
    const flat = spec.measures.flatMap((m) => m.events);
    const stops = new Set();
    flat.forEach((ev, i) => { if (ev.tie) { for (let j = i + 1; j < flat.length; j++) { if (!flat[j].rest) { stops.add(j); break; } } } });
    for (const sys of out.systems) {
      const perStaff = sys.staves.map((st) => st.measures.flatMap((m) => m.events));
      const count = perStaff[0].length;
      for (let i = 0; i < count; i++) {
        if (stops.has(k + i)) for (const evs of perStaff) for (const n of evs[i].notes) n.tieStop = true;
      }
      k += count;
    }
  }

  // ---- finish the page --------------------------------------------------------------------
  let pageH = y + 14;
  if (spec.fullPage) pageH = Math.max(pageH, Math.round(PAGE_W * 1.4142));
  const W = Math.round(PAGE_W * S);
  const H = Math.round(pageH * S);
  svg.setAttribute('viewBox', `0 0 ${W / S} ${H / S}`);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.style.width = `${W}px`;
  svg.style.height = `${H}px`;
  svg.style.display = 'block';
  svg.style.background = '#fff';
  out.width = W;
  out.height = H;
  out.staffSpace = Math.round(SP * S * 100) / 100;
  return out;
}

// ------------------------------------------------------------------------------------------
// Rendering driver
// ------------------------------------------------------------------------------------------

function fontFaceCss() {
  const face = (family, file, weight, style, format) => {
    const data = fs.readFileSync(file).toString('base64');
    const mime = format === 'truetype' ? 'font/ttf' : 'font/woff2';
    return `@font-face{font-family:"${family}";src:url(data:${mime};base64,${data}) format("${format}");font-weight:${weight};font-style:${style};}`;
  };
  const pdf = (f) => nm('pdfjs-dist', 'standard_fonts', f);
  return [
    face('Liberation Sans', pdf('LiberationSans-Regular.ttf'), 400, 'normal', 'truetype'),
    face('Liberation Sans', pdf('LiberationSans-Bold.ttf'), 700, 'normal', 'truetype'),
    face('Liberation Sans', pdf('LiberationSans-Italic.ttf'), 400, 'italic', 'truetype'),
    face('JetBrains Mono', nm('@fontsource-variable', 'jetbrains-mono', 'files', 'jetbrains-mono-latin-wght-normal.woff2'), '100 800', 'normal', 'woff2'),
    face('Instrument Sans', nm('@fontsource-variable', 'instrument-sans', 'files', 'instrument-sans-latin-wght-normal.woff2'), '400 700', 'normal', 'woff2'),
    face('Bricolage Grotesque', nm('@fontsource-variable', 'bricolage-grotesque', 'files', 'bricolage-grotesque-latin-wght-normal.woff2'), '200 800', 'normal', 'woff2'),
  ].join('\n');
}

/** RGBA screenshot -> 8-bit grey PNG buffer (smaller, and all the recognizers need). */
function toGreyPng(buf) {
  const src = PNG.sync.read(buf);
  const { width, height, data } = src;
  const grey = Buffer.alloc(width * height);
  for (let i = 0, j = 0; j < grey.length; i += 4, j++) {
    grey[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  const png = new PNG({ width, height, colorType: 0, inputColorType: 0, bitDepth: 8, deflateLevel: 9, filterType: -1 });
  png.data = grey;
  return { png: PNG.sync.write(png, { colorType: 0, inputColorType: 0, bitDepth: 8, deflateLevel: 9 }), grey, width, height };
}

/** Sanity check of the ground truth against the pixels: every box must contain ink. */
function verify(truth, grey, width, height) {
  const problems = [];
  const dark = (b, pad = 1) => {
    const x0 = Math.max(0, Math.floor(b[0] - pad)), y0 = Math.max(0, Math.floor(b[1] - pad));
    const x1 = Math.min(width - 1, Math.ceil(b[0] + b[2] + pad)), y1 = Math.min(height - 1, Math.ceil(b[1] + b[3] + pad));
    let min = 255;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (grey[y * width + x] < min) min = grey[y * width + x];
    return min;
  };
  for (const sys of truth.systems) {
    for (const st of sys.staves) {
      for (const ly of st.lines) {
        // Sample the line at many columns: tab digits blank short stretches of it.
        const y = Math.round(ly);
        let hit = 0;
        const N = 40;
        for (let k = 0; k < N; k++) {
          const x = Math.round(st.x0 + ((st.x1 - st.x0) * (k + 0.5)) / N);
          let min = 255;
          for (let d = -1; d <= 1; d++) min = Math.min(min, grey[(y + d) * width + x]);
          if (min < 200) hit++;
        }
        if (hit < N * 0.6) problems.push(`staff line at y=${ly} not found`);
      }
      for (const bl of st.barlines) if (dark(bl.bbox) > 128) problems.push(`bar line at x=${bl.x} has no ink`);
      for (const m of st.measures) {
        for (const e of m.events) {
          if (e.type === 'rest') { if (e.head && dark(e.head) > 128) problems.push('rest without ink'); continue; }
          for (const n of e.notes) {
            const b = n.head || n.bbox;
            if (!b || b[2] <= 0 || b[3] <= 0) problems.push(`empty box in measure ${m.index}`);
            else if (dark(b, 0) > 140) problems.push(`no ink in box ${b} (measure ${m.index})`);
          }
        }
      }
    }
  }
  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const only = opt('--only');
  const outDir = path.resolve(opt('--out') || DEFAULT_OUT);
  let specs = buildSpecs();
  const all = specs;
  if (only) specs = specs.filter((s) => s.id.includes(only));
  for (const s of all) for (const w of s.warnings) console.warn(`warning: ${w}`);
  if (args.includes('--list')) {
    for (const s of specs) console.log(`${s.id.padEnd(40)} ${s.subset.padEnd(9)} ${String(s.dpi).padStart(3)} dpi  ${s.font.padEnd(9)} ${s.measures.length} measures`);
    console.log(`${specs.length} fixtures`);
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"><div id="out"></div></body></html>');
  await page.addStyleTag({ content: fontFaceCss() });
  await page.addScriptTag({ path: nm('vexflow', 'build', 'cjs', 'vexflow.js') });
  // Make sure every face is loaded before any text is measured or drawn.
  await page.evaluate(async (fonts) => {
    await Promise.all(fonts.map((f) => document.fonts.load(f, '0123456789 TAB')));
    await document.fonts.ready;
  }, [...Object.values(TAB_FONTS), '700 14px "Liberation Sans"', 'italic 12px "Liberation Sans"', '700 14px "Instrument Sans"', '700 14px "Bricolage Grotesque"', '400 14px "Bricolage Grotesque"', '400 14px "Instrument Sans"']);

  const manifest = [];
  let totalBytes = 0;
  let failures = 0;
  for (const spec of specs) {
    let res;
    try {
      res = await page.evaluate(renderInPage, spec);
    } catch (err) {
      failures++;
      console.error(`FAILED ${spec.id}: ${String(err.message).split('\n')[0]}`);
      continue;
    }
    await page.setViewportSize({ width: res.width, height: Math.min(res.height, 4000) });
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: res.width, height: res.height }, fullPage: true });
    const { png, grey, width, height } = toGreyPng(shot);
    const truth = {
      id: spec.id,
      image: `${spec.id}.png`,
      width, height,
      subset: spec.subset,
      title: spec.title,
      dpi: spec.dpi,
      scale: spec.scale,
      staffSpace: res.staffSpace,
      musicFont: spec.font,
      textFont: spec.textFont,
      tabFont: spec.subset === 'notation' ? null : spec.tabFont,
      key: { name: spec.key, fifths: spec.fifths },
      time: { num: Number(spec.time.split('/')[0]), den: Number(spec.time.split('/')[1]) },
      pickup: spec.pickup,
      systems: res.systems,
      texts: res.texts,
    };
    const problems = verify(truth, grey, width, height);
    if (problems.length) {
      failures++;
      console.error(`CHECK ${spec.id}: ${problems.slice(0, 4).join('; ')}${problems.length > 4 ? ` (+${problems.length - 4})` : ''}`);
    }
    fs.writeFileSync(path.join(outDir, `${spec.id}.png`), png);
    fs.writeFileSync(path.join(outDir, `${spec.id}.json`), `${JSON.stringify(truth)}\n`);
    totalBytes += png.length;
    const staves = truth.systems.reduce((a, s) => a + s.staves.length, 0);
    const tags = [];
    if (spec.fullPage) tags.push('page');
    if (spec.tabStems) tags.push('tab-stems');
    if (spec.lineThrough) tags.push('line-through');
    if (!spec.tabClef && spec.subset !== 'notation') tags.push('no-tab-clef');
    if (spec.barThrough) tags.push('bar-through');
    if (spec.connector === 'bracket' && spec.subset === 'linked') tags.push('bracket');
    if (truth.texts.some((t) => t.kind === 'chord')) tags.push('chord-symbols');
    manifest.push({
      id: spec.id, image: `${spec.id}.png`, truth: `${spec.id}.json`, subset: spec.subset, name: spec.name,
      dpi: spec.dpi, size: spec.size, staffSpace: res.staffSpace, musicFont: spec.font,
      tabFont: spec.subset === 'notation' ? null : spec.tabFontKey,
      width, height, systems: truth.systems.length, staves, measures: spec.measures.length, tags, bytes: png.length,
    });
    console.log(`${spec.id.padEnd(40)} ${String(width).padStart(4)}x${String(height).padEnd(4)} ${String(staves).padStart(2)} staves ${(png.length / 1024).toFixed(0).padStart(4)} kB`);
  }
  await browser.close();

  if (!only) {
    // Remove images that are no longer part of the corpus, then write the manifest.
    const keep = new Set(manifest.flatMap((m) => [m.image, m.truth]).concat(['manifest.json']));
    for (const f of fs.readdirSync(outDir)) {
      if (/\.(png|json)$/.test(f) && !keep.has(f)) fs.unlinkSync(path.join(outDir, f));
    }
    const doc = { version: 1, generator: 'scripts/omr-fixtures.cjs', vexflow: '4.2.5', count: manifest.length, fixtures: manifest };
    fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(doc, null, 1)}\n`);
  }
  console.log(`${manifest.length} fixtures, ${(totalBytes / 1e6).toFixed(2)} MB of PNG${failures ? `, ${failures} with problems` : ''}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
