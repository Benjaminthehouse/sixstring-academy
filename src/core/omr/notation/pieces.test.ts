import { describe, expect, it } from 'vitest';
import { readHeader } from './header';
import { findHeads } from './heads';
import { analyzeNotationStaff, ledgerSupport, recognizeNotationStaff } from './index';
import { matchAt, searchMatch } from './match';
import { buildChords, readDots, readTails } from './notes';
import { AccidentalState, keyAlterations, pitchOf } from './pitch';
import { type RhythmEvent, inferMeasureTicks, measureTicks, optionTicks, solveMeasure, stepValue } from './rhythm';
import { findStrokes } from './stems';
import { buildStrip, distanceTransform, inkFraction, integralOf, posAt, posY } from './strip';
import { TEMPLATE_SPACE, scaleTemplate, templateGlyphs, templatesOf } from './templates';
import { SynthStrip } from './tools/synth';

describe('templates', () => {
  it('has every glyph in four music fonts at strip resolution', () => {
    expect(TEMPLATE_SPACE).toBe(20);
    const glyphs = templateGlyphs();
    for (const g of ['noteheadBlack', 'noteheadHalf', 'noteheadWhole', 'accidentalSharp', 'accidentalFlat', 'accidentalNatural', 'restQuarter', 'rest8th', 'rest16th', 'restWhole', 'restHalf', 'flag8thUp', 'flag16thDown', 'gClef', 'timeSig4', 'timeSigCommon', 'timeSigCutCommon']) {
      expect(glyphs).toContain(g);
      expect(templatesOf(g).map((t) => t.font).sort()).toEqual(['Bravura', 'Gonville', 'Leland', 'Petaluma']);
    }
    expect(templatesOf('noSuchGlyph')).toEqual([]);
  });

  it('gives note heads about one staff space of height and the right origin', () => {
    for (const t of templatesOf('noteheadBlack')) {
      expect(t.glyphHeight).toBeGreaterThanOrEqual(19);
      expect(t.glyphHeight).toBeLessThanOrEqual(28);
      expect(t.glyphWidth).toBeGreaterThanOrEqual(22);
      expect(t.glyphWidth).toBeLessThanOrEqual(29);
      // SMuFL origin: left edge, vertical centre.
      expect(Math.abs(t.oy - t.pad - t.glyphHeight / 2)).toBeLessThan(2.5);
      expect(Math.abs(t.ox - t.pad)).toBeLessThan(2);
      expect(t.holeArea).toBe(0);
    }
    for (const t of templatesOf('noteheadHalf')) expect(t.holeArea).toBeGreaterThan(20);
    for (const t of templatesOf('noteheadWhole')) expect(t.holeArea).toBeGreaterThan(40);
  });

  it('rescales a template', () => {
    const t = templatesOf('timeSig3')[0];
    const half = scaleTemplate(t, 0.5);
    expect(Math.abs(half.glyphHeight - t.glyphHeight / 2)).toBeLessThanOrEqual(1);
    expect(half.area).toBeGreaterThan(t.area * 0.18);
    expect(half.area).toBeLessThan(t.area * 0.34);
  });
});

describe('strip helpers', () => {
  it('computes exact distances to the paper', () => {
    const w = 41;
    const h = 31;
    const bin = new Uint8Array(w * h);
    for (let y = 5; y < 26; y++) for (let x = 10; x < 31; x++) bin[y * w + x] = 1; // 21 x 21 square
    const dt = distanceTransform(bin, w, h);
    expect(dt[0]).toBe(0);
    expect(dt[15 * w + 20]).toBeCloseTo(11, 5); // centre: 11 px to the first paper pixel
    expect(dt[5 * w + 10]).toBeCloseTo(1, 5); // corner pixel
    expect(dt[15 * w + 12]).toBeCloseTo(3, 5);
    // The image border counts as paper.
    const full = new Uint8Array(9).fill(1);
    expect(distanceTransform(full, 3, 3)[4]).toBeCloseTo(2, 5);
  });

  it('counts ink through the integral image and maps staff positions', () => {
    const s = new SynthStrip(300);
    s.rect(100, 150, 110, 170);
    const strip = buildStrip(s.input());
    expect(inkFraction(strip, 100, 150, 110, 170)).toBe(1);
    expect(inkFraction(strip, 90, 150, 110, 170)).toBeCloseTo(0.5, 5);
    const I = integralOf(strip.nl, strip.w, strip.h);
    expect(I[I.length - 1]).toBe(200);
    expect(posY(strip, 0)).toBe(220);
    expect(posY(strip, 8)).toBe(140);
    expect(posAt(strip, 170)).toBe(5);
    // Rows on a staff line (and where ledger lines run) weigh less in matching.
    expect(strip.rowWeight[180]).toBeLessThan(1);
    expect(strip.rowWeight[100]).toBeLessThan(1);
    expect(strip.rowWeight[170]).toBe(1);
  });

  it('removes line remnants a little thicker than a line but keeps a beam on a line', () => {
    const s = new SynthStrip(300);
    const input = s.input();
    // A remnant one pixel thicker than the 3 px line on the middle line, and a 9 px beam on the line above.
    for (let x = 60; x < 120; x++) for (let y = 178; y < 182; y++) input.noLines.data[y * 300 + x] = 1;
    for (let x = 150; x < 220; x++) for (let y = 156; y < 165; y++) input.noLines.data[y * 300 + x] = 1;
    const strip = buildStrip(input);
    expect(strip.nl[180 * 300 + 90]).toBe(0);
    expect(strip.nl[160 * 300 + 180]).toBe(1);
  });
});

describe('template matching', () => {
  it('scores a glyph on itself near 1 and elsewhere low', () => {
    const s = new SynthStrip(400);
    s.glyph('accidentalSharp', 100, s.y(4));
    s.glyph('restQuarter', 250, s.y(4));
    const strip = buildStrip(s.input());
    const sharp = templatesOf('accidentalSharp')[0];
    const flat = templatesOf('accidentalFlat')[0];
    expect(matchAt(strip, sharp, 100, s.y(4))).toBeGreaterThan(0.9);
    expect(matchAt(strip, flat, 100, s.y(4))).toBeLessThan(0.5);
    expect(matchAt(strip, sharp, 250, s.y(4))).toBeLessThan(0.5);
    expect(matchAt(strip, sharp, 320, s.y(4))).toBe(0); // blank paper
    const found = searchMatch(strip, sharp, 103, s.y(4) + 2, 4, 3);
    expect(found.score).toBeGreaterThan(0.9);
    expect(Math.abs(found.x - 100)).toBeLessThanOrEqual(1);
    expect(Math.abs(found.y - s.y(4))).toBeLessThanOrEqual(1);
  });
});

describe('stems, heads and chords on synthetic strips', () => {
  it('finds stems but not heads or beams as strokes', () => {
    const s = new SynthStrip(500);
    const a = s.note(100, 2);
    const b = s.note(180, 9, { stem: 'down' });
    s.barline(260);
    const strip = buildStrip(s.input());
    const strokes = findStrokes(strip, 30, 480);
    expect(strokes.length).toBe(3);
    expect(Math.abs(strokes[0].x - a.stemX)).toBeLessThan(1.5);
    expect(Math.abs(strokes[0].top - a.tipY)).toBeLessThanOrEqual(2);
    expect(Math.abs(strokes[1].x - b.stemX)).toBeLessThan(1.5);
    expect(strokes[0].barline).toBe(false);
    expect(strokes[2].barline).toBe(true);
  });

  it('reads filled, half and whole heads at their staff positions, with ledger lines', () => {
    const s = new SynthStrip(700);
    s.note(100, 0);
    s.note(180, 5, { head: 'noteheadHalf' });
    s.note(260, 3, { head: 'noteheadWhole', stem: null });
    s.note(340, -4);
    s.note(420, 12, { stem: 'down' });
    s.note(500, 4, { head: 'noteheadHalf', stem: 'down' });
    const strip = buildStrip(s.input());
    const heads = findHeads(strip, 30, 680, { strokes: findStrokes(strip, 30, 680) });
    expect(heads.map((h) => h.pos)).toEqual([0, 5, 3, -4, 12, 4]);
    expect(heads.map((h) => h.kind)).toEqual(['filled', 'open', 'whole', 'filled', 'filled', 'open']);
    for (const h of heads) {
      expect(h.score).toBeGreaterThan(0.8);
      expect(ledgerSupport(strip, h)).toBe(1);
    }
    expect(Math.abs(heads[0].x - 100)).toBeLessThan(2);
    // The same head without its ledger lines is not supported.
    const bare = new SynthStrip(300);
    bare.glyph('noteheadBlack', 100, bare.y(-4));
    const strip2 = buildStrip(bare.input());
    const lone = findHeads(strip2, 30, 280);
    expect(lone.length).toBe(1);
    expect(ledgerSupport(strip2, lone[0])).toBe(0);
  });

  it('groups chord heads on one stem and counts beams, flags and dots', () => {
    const s = new SynthStrip(900);
    // A triad on one stem.
    s.note(100, 0, { length: 5.5 });
    s.note(100, 2, { length: 4.5 });
    s.note(100, 4);
    // Two beamed eighths, then two beamed sixteenths.
    const e1 = s.note(220, 1);
    const e2 = s.note(280, 1);
    s.beam(e1, e2, 'up');
    const x1 = s.note(380, 7, { stem: 'down' });
    const x2 = s.note(440, 7, { stem: 'down' });
    s.beam(x1, x2, 'down');
    s.beam(x1, x2, 'down', 1);
    // A flagged eighth and a dotted quarter.
    const f = s.note(560, 3);
    s.glyph('flag8thUp', f.stemX - 1.5, f.tipY);
    s.note(680, 3);
    s.glyph('augmentationDot', 680 + 12 + 6, s.y(3));
    const strip = buildStrip(s.input());
    const strokes = findStrokes(strip, 30, 880);
    const heads = findHeads(strip, 30, 880, { strokes });
    const chords = buildChords(strip, heads, strokes);
    readTails(strip, chords);
    readDots(strip, chords);
    expect(chords.length).toBe(7);
    expect(chords[0].heads.map((h) => h.pos)).toEqual([0, 2, 4]);
    expect(chords[0].dir).toBe('up');
    expect(chords.map((c) => c.beams)).toEqual([0, 1, 1, 2, 2, 0, 0]);
    expect(chords[1].beamRight && chords[2].beamLeft).toBe(true);
    expect(chords[3].dir).toBe('down');
    expect(chords.map((c) => c.flags)).toEqual([0, 0, 0, 0, 0, 1, 0]);
    expect(chords.map((c) => c.dots)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });
});

describe('header', () => {
  it('reads clef, key signature and time signature', () => {
    for (const font of ['Bravura', 'Gonville', 'Leland']) {
      const s = new SynthStrip(600, font);
      s.glyph('gClef', 30, s.y(2));
      s.glyph('accidentalSharp', 100, s.y(8));
      s.glyph('accidentalSharp', 122, s.y(5));
      s.glyph('timeSig3', 160, s.y(6));
      s.glyph('timeSig4', 160, s.y(2));
      s.note(300, 4);
      const header = readHeader(buildStrip(s.input()));
      expect(header.clef?.value).toBe('treble-8vb');
      expect(header.key?.value).toBe(2);
      expect(header.time?.value).toMatchObject({ beats: 3, beatValue: 4 });
      expect(header.endX).toBeGreaterThan(180);
      expect(header.endX).toBeLessThan(280);
    }
  });

  it('reads flats, common time, and a staff with no key or time', () => {
    const s = new SynthStrip(600);
    s.glyph('gClef', 30, s.y(2));
    s.glyph('accidentalFlat', 100, s.y(4));
    s.glyph('accidentalFlat', 120, s.y(7));
    s.glyph('accidentalFlat', 140, s.y(3));
    s.glyph('timeSigCommon', 180, s.y(4));
    s.note(320, 4);
    const header = readHeader(buildStrip(s.input()));
    expect(header.key?.value).toBe(-3);
    expect(header.time?.value).toMatchObject({ beats: 4, beatValue: 4, symbol: 'common' });
    const plain = new SynthStrip(500);
    plain.glyph('gClef', 30, plain.y(2));
    plain.note(200, 4, { head: 'noteheadHalf', stem: 'down' });
    const h2 = readHeader(buildStrip(plain.input()));
    expect(h2.clef?.value).toBe('treble-8vb');
    expect(h2.key).toBeNull();
    expect(h2.time).toBeNull();
  });

  it('tells a note with an accidental from a key signature, and the bass clef', () => {
    const s = new SynthStrip(500);
    s.glyph('gClef', 30, s.y(2));
    // F sharp as the first note: the sharp sits where a one-sharp key signature would be.
    s.glyph('accidentalSharp', 100, s.y(8));
    s.note(100 + 20 + 6 + 12, 8, { stem: 'down' });
    expect(readHeader(buildStrip(s.input())).key).toBeNull();
    const b = new SynthStrip(500);
    b.glyph('fClef', 30, b.y(6));
    b.note(250, 4);
    expect(readHeader(buildStrip(b.input())).clef?.value).toBe('bass');
  });
});

describe('pitch', () => {
  it('spells staff positions in treble clef an octave down, and in bass clef at pitch', () => {
    expect(pitchOf(0, 0, 'treble-8vb')).toMatchObject({ step: 'E', octave: 4, written: 64, midi: 52 });
    expect(pitchOf(-7, 0, 'treble-8vb').midi).toBe(40); // low E string
    expect(pitchOf(6, 1, 'treble')).toMatchObject({ step: 'D', alter: 1, midi: 63 });
    expect(pitchOf(0, 0, 'bass')).toMatchObject({ step: 'G', octave: 2, midi: 43 });
  });

  it('applies the key signature', () => {
    expect(keyAlterations(3)).toMatchObject({ F: 1, C: 1, G: 1, D: 0 });
    expect(keyAlterations(-2)).toMatchObject({ B: -1, E: -1, A: 0 });
    const st = new AccidentalState(1, 'treble-8vb');
    expect(st.read(1, null, false, false).midi).toBe(54); // F4 -> F#4 written, F#3 sounding
    expect(st.read(8, null, false, false).alter).toBe(1); // every octave
  });

  it('keeps an accidental for the rest of the bar at its own position only', () => {
    const st = new AccidentalState(0, 'treble-8vb');
    expect(st.read(3, 'sharp', false, false).alter).toBe(1);
    expect(st.read(3, null, false, false).alter).toBe(1);
    expect(st.read(10, null, false, false).alter).toBe(0); // the A an octave higher is not affected
    expect(st.read(3, 'natural', false, false).alter).toBe(0);
    expect(st.read(3, null, false, false).alter).toBe(0);
    st.read(3, 'flat', false, false);
    st.newBar();
    expect(st.read(3, null, false, false).alter).toBe(0);
  });

  it('carries an accidental across a tie over the bar line', () => {
    const st = new AccidentalState(0, 'treble-8vb');
    expect(st.read(5, 'sharp', false, true).alter).toBe(1);
    st.newBar();
    expect(st.read(5, null, true, false).alter).toBe(1);
    // The next untied C in that bar is natural again.
    expect(st.read(5, null, false, false).alter).toBe(0);
  });
});

describe('rhythm solver', () => {
  const ev = (options: [string, number, number][], dropCost = Infinity): RhythmEvent => ({
    options: options.map(([value, dots, cost]) => ({ value: value as 'quarter', dots: dots as 0 | 1 | 2, cost })),
    chosen: 0, group: -1, dropCost, dropped: false,
  });

  it('knows bar lengths and value steps', () => {
    expect(measureTicks(4, 4)).toBe(3840);
    expect(measureTicks(6, 8)).toBe(2880);
    expect(measureTicks(2, 2)).toBe(3840);
    expect(stepValue('quarter', 1)).toBe('eighth');
    expect(stepValue('whole', -1)).toBeNull();
    expect(optionTicks({ value: 'eighth', dots: 0, tuplet: { actual: 3, normal: 2 }, cost: 0 })).toBe(320);
  });

  it('leaves a measure that adds up alone', () => {
    const m = [ev([['quarter', 0, 0], ['quarter', 1, 1]]), ev([['half', 0, 0]]), ev([['quarter', 0, 0]])];
    const sol = solveMeasure(m, 3840);
    expect(sol).toMatchObject({ consistent: true, changed: 0 });
  });

  it('restores a missed dot where it is cheapest', () => {
    // q. e h was read as q e h: the first quarter has the cheaper dot.
    const m = [ev([['quarter', 0, 0], ['quarter', 1, 0.7]]), ev([['eighth', 0, 0], ['eighth', 1, 2.5]]), ev([['half', 0, 0], ['half', 1, 2.5]])];
    const sol = solveMeasure(m, 3840);
    expect(sol.consistent).toBe(true);
    expect(sol.changed).toBe(1);
    expect(m[0].chosen).toBe(1);
    expect(m[1].chosen).toBe(0);
  });

  it('fixes a flag miscount and drops a doubtful extra', () => {
    const flags = [ev([['eighth', 0, 0], ['16th', 0, 1.2]]), ev([['16th', 0, 0], ['eighth', 0, 1.2]]), ev([['quarter', 0, 0]]), ev([['half', 0, 0]])];
    expect(solveMeasure(flags, 3840).consistent).toBe(true);
    expect(flags.filter((e) => e.chosen !== 0).length).toBe(1);
    const extra = [ev([['half', 0, 0]]), ev([['half', 0, 0]]), ev([['quarter', 0, 0]], 2)];
    const sol = solveMeasure(extra, 3840);
    expect(sol.consistent).toBe(true);
    expect(extra[2].dropped).toBe(true);
  });

  it('reports a measure it cannot explain and treats a lone whole rest as a full bar', () => {
    const bad = [ev([['quarter', 0, 0]]), ev([['quarter', 0, 0]])];
    expect(solveMeasure(bad, 3840).consistent).toBe(false);
    const rest = [{ ...ev([['whole', 0, 0]]), measureRest: true }];
    expect(solveMeasure(rest, 2880)).toMatchObject({ consistent: true, after: 2880 });
  });

  it('infers the bar length from the measures that agree', () => {
    expect(inferMeasureTicks([2880, 2880, 2400, 2880])).toBe(2880);
    expect(inferMeasureTicks([960, 2880, 3840])).toBe(0);
    expect(inferMeasureTicks([])).toBe(0);
  });
});

describe('whole staff on a synthetic strip', () => {
  it('reads a melody with key, time, accidentals, rests and a tie', () => {
    const s = new SynthStrip(1400);
    s.glyph('gClef', 30, s.y(2));
    s.glyph('accidentalSharp', 100, s.y(8));
    s.glyph('timeSig4', 150, s.y(6));
    s.glyph('timeSig4', 150, s.y(2));
    // | G4 q  A4 q  F#4(key) q  rest q | C#5 h  C5(still sharp) q  rest 8  D5 8 | G4 w |
    s.note(260, 2);
    s.note(340, 3);
    s.note(420, 1);
    s.glyph('restQuarter', 500, s.y(4));
    s.barline(580);
    s.glyph('accidentalSharp', 610, s.y(5));
    s.note(650, 5, { head: 'noteheadHalf', stem: 'down' });
    s.note(780, 5, { stem: 'down' });
    s.glyph('rest8th', 860, s.y(4));
    const f = s.note(940, 6, { stem: 'down' });
    s.glyph('flag8thDown', f.stemX - 1.5, f.tipY);
    s.barline(1040);
    s.note(1120, 2, { head: 'noteheadWhole', stem: null });
    const input = s.input();
    const a = analyzeNotationStaff(input);
    expect(a.header.key?.value).toBe(1);
    expect(a.header.time?.value).toMatchObject({ beats: 4, beatValue: 4 });
    expect(a.measureOk).toEqual([true, true, true]);
    const reading = recognizeNotationStaff(input) as ReturnType<typeof recognizeNotationStaff> & { events: unknown[] };
    const events = (reading as { events: { kind: string; notes: { pitch: { midi: number; step: string; alter: number } }[]; duration: { value: string; dots: number }; measureIndex?: number }[] }).events;
    expect(events.map((e) => `${e.kind === 'rest' ? 'r' : e.notes.map((n) => n.pitch.midi).join('+')}:${e.duration.value}`)).toEqual([
      '55:quarter', '57:quarter', '54:quarter', 'r:quarter', '61:half', '61:quarter', 'r:eighth', '62:eighth', '55:whole',
    ]);
    expect(events.map((e) => e.measureIndex)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2]);
    expect(events[2].notes[0].pitch).toMatchObject({ step: 'F', alter: 1 });
  });
});

describe('robustness', () => {
  it('returns an empty reading for a blank staff and for a staff with only a clef', () => {
    const blank = new SynthStrip(400);
    const r = recognizeNotationStaff(blank.input()) as { events: unknown[]; confidence: number; clef?: unknown };
    expect(r.events).toEqual([]);
    expect(r.clef).toBeUndefined();
    expect(r.confidence).toBe(0);
    const clefOnly = new SynthStrip(400);
    clefOnly.glyph('gClef', 30, clefOnly.y(2));
    const r2 = recognizeNotationStaff(clefOnly.input()) as { events: unknown[]; clef?: { type: string }; keySignature?: { fifths: number } };
    expect(r2.events).toEqual([]);
    expect(r2.clef?.type).toBe('treble-8vb');
    expect(r2.keySignature?.fifths).toBe(0);
  });

  it('does not read a number above the staff, a bar or a stray blob as notes', () => {
    const s = new SynthStrip(700);
    s.glyph('gClef', 30, s.y(2));
    // A digit where a high note could be, a solid blob without a stem, a thick bar.
    s.glyph('timeSig3', 200, s.y(11));
    s.glyph('timeSig0', 300, s.y(13));
    s.rect(400, 172, 416, 188);
    s.rect(500, 140, 510, 221);
    const a = analyzeNotationStaff(s.input());
    expect(a.events.filter((e) => e.kind === 'chord')).toEqual([]);
  });

  it('keeps a measure that a missed bar line doubled, and a pickup, untouched', () => {
    const s = new SynthStrip(1300);
    s.glyph('gClef', 30, s.y(2));
    s.glyph('timeSig2', 100, s.y(6));
    s.glyph('timeSig4', 100, s.y(2));
    s.note(200, 3); // pickup: one quarter
    s.barline(260);
    for (let k = 0; k < 4; k++) s.note(330 + 80 * k, 2 + k); // two 2/4 measures without the bar line between them
    s.barline(660);
    s.note(730, 4, { head: 'noteheadHalf', stem: 'down' });
    s.barline(820);
    s.note(890, 4, { head: 'noteheadHalf', stem: 'down' });
    const a = analyzeNotationStaff(s.input());
    expect(a.measureTicks).toBe(1920);
    expect(a.mismatches).toEqual([]);
    expect(a.events.map((e) => e.rhythm.chosen)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(a.events.map((e) => e.rhythm.options[0].value)).toEqual(['quarter', 'quarter', 'quarter', 'quarter', 'quarter', 'half', 'half']);
  });
});
