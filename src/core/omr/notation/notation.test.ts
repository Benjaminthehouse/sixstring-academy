import { describe, expect, it } from 'vitest';
import type { DegradeTier } from '../eval/degrade';
import { type PageScore, addScore, emptyScore, f1, precision, rate, recall, scorePage } from '../eval/metrics';
import { assemblePage, recognizePage } from '../page';
import type { OmrNotationEvent, OmrVisionModel, StaffReading } from '../types';
import { analyzeNotationStaff, createNotationRecognizer, recognizeNotationStaff, refineWithModel, toReading } from './index';
import { SynthStrip } from './tools/synth';
import { checkExtra, loadExtraIndex } from './tools/extra';
import { loadDevPage } from './tools/strips';

/** Recognize the notation staves of a fixture at a tier and score the page. */
function run(id: string, tier: DegradeTier): { score: PageScore; ms: number[] } {
  const page = loadDevPage(id, tier);
  const readings: (StaffReading | null)[] = page.analysis.layout.staves.map(() => null);
  const ms: number[] = [];
  for (const st of page.strips) {
    const t0 = performance.now();
    readings[st.staffIndex] = toReading(analyzeNotationStaff(st.input));
    ms.push(performance.now() - t0);
  }
  return { score: scorePage(assemblePage(page.analysis, readings), page.truth), ms };
}

function total(ids: string[], tier: DegradeTier): PageScore {
  const sum = emptyScore();
  for (const id of ids) addScore(sum, run(id, tier).score);
  return sum;
}

// A spread over fonts, resolutions and material (melody, chords, rhythm study, accidentals, 6/8, triplets).
const SAMPLE = ['ode-bravura-150', 'greensleeves68-petaluma-150', 'chromatic-leland-150', 'rhythm-gonville-100', 'chords-bravura-150', 'triplets-bravura-150', 'random-bb-gonville-150', 'linked-amazing-petaluma-150'];

describe('notation recognizer on the fixture corpus', () => {
  it('reads clean renders essentially without mistakes', () => {
    const s = total(SAMPLE, 'clean');
    expect(s.notes.tp).toBeGreaterThan(250);
    expect(recall(s.notes)).toBeGreaterThanOrEqual(0.99);
    expect(precision(s.notes)).toBeGreaterThanOrEqual(0.99);
    expect(rate(s.pitch)).toBeGreaterThanOrEqual(0.99);
    expect(rate(s.duration)).toBeGreaterThanOrEqual(0.98);
    expect(f1(s.rests)).toBeGreaterThanOrEqual(0.95);
    expect(rate(s.accidentals)).toBeGreaterThanOrEqual(0.95);
    expect(rate(s.key)).toBe(1);
    expect(rate(s.time)).toBe(1);
    expect(rate(s.measureExact)).toBeGreaterThanOrEqual(0.95);
  });

  it('holds up on simulated scans', () => {
    const s = total(SAMPLE, 'scan');
    expect(recall(s.notes)).toBeGreaterThanOrEqual(0.98);
    expect(precision(s.notes)).toBeGreaterThanOrEqual(0.98);
    expect(rate(s.pitch)).toBeGreaterThanOrEqual(0.98);
    expect(rate(s.duration)).toBeGreaterThanOrEqual(0.95);
    expect(rate(s.key)).toBeGreaterThanOrEqual(0.95);
    expect(rate(s.time)).toBeGreaterThanOrEqual(0.95);
    expect(rate(s.measureExact)).toBeGreaterThanOrEqual(0.9);
  });

  it('keeps pitch on good phone photos', () => {
    const s = total(SAMPLE.slice(0, 5), 'photo-good');
    expect(recall(s.notes)).toBeGreaterThanOrEqual(0.95);
    expect(rate(s.pitch)).toBeGreaterThanOrEqual(0.95);
    expect(rate(s.duration)).toBeGreaterThanOrEqual(0.9);
  });

  it('spells pitches with key signature, accidentals and ties, sounding an octave below', () => {
    const page = loadDevPage('chromatic-leland-150', 'clean');
    const st = page.strips[0];
    const reading = recognizeNotationStaff(st.input) as StaffReading<OmrNotationEvent>;
    const truth = st.truth?.measures.flatMap((m) => m.events) ?? [];
    expect(reading.events.length).toBe(truth.length);
    reading.events.forEach((e, i) => {
      const t = truth[i].notes[0];
      const n = e.notes[0];
      expect(n.pitch.midi).toBe(t.midi);
      expect(n.pitch.written).toBe(t.midi + 12);
      expect(`${n.pitch.step}${n.pitch.alter}`).toBe(`${t.step}${t.alter}`);
      expect(n.staffPosition).toBe(t.pos);
      expect(!!n.accidental).toBe(!!t.accidental);
    });
    expect(reading.clef?.type).toBe('treble-8vb');
    expect(reading.keySignature?.fifths).toBe(0);
    expect(reading.timeSignature).toMatchObject({ beats: 4, beatValue: 4 });
  });

  it('returns boxes on the page, confidences and alternatives', () => {
    const page = loadDevPage('rhythm-bravura-150', 'clean');
    for (const st of page.strips) {
      const reading = recognizeNotationStaff(st.input) as StaffReading<OmrNotationEvent>;
      expect(reading.confidence).toBeGreaterThan(0.8);
      const geom = page.analysis.page.systems[st.staffIndex].staves[0].geometry;
      for (const e of reading.events) {
        expect(e.confidence).toBeGreaterThan(0);
        expect(e.confidence).toBeLessThanOrEqual(1);
        expect(e.duration.confidence).toBeGreaterThan(0);
        expect(e.duration.ticks).toBeGreaterThan(0);
        // Inside the page and close to the staff it belongs to.
        expect(e.bbox.x).toBeGreaterThanOrEqual(geom.x0 - 2 * geom.space);
        expect(e.bbox.x + e.bbox.w).toBeLessThanOrEqual(geom.x1 + 2 * geom.space);
        expect(e.bbox.y + e.bbox.h).toBeGreaterThan(geom.bbox.y - 8 * geom.space);
        expect(e.bbox.y).toBeLessThan(geom.bbox.y + geom.bbox.h + 8 * geom.space);
        expect(e.x).toBeGreaterThanOrEqual(e.bbox.x - 1);
        expect(e.x).toBeLessThanOrEqual(e.bbox.x + e.bbox.w + 1);
        for (const n of e.notes) {
          expect(n.bbox.w).toBeGreaterThan(0.8 * geom.space);
          expect(n.bbox.w).toBeLessThan(2.2 * geom.space);
        }
        if (e.kind === 'chord') expect(e.duration.alternatives?.length).toBeGreaterThan(0);
      }
    }
  });

  it('reports text above the staff as regions and never as notes', () => {
    // Title, tempo word and chord symbols sit right above these staves.
    const page = loadDevPage('linked-chords-bravura-150', 'clean');
    const st = page.strips[0];
    const reading = recognizeNotationStaff(st.input) as StaffReading<OmrNotationEvent>;
    expect(reading.texts?.length).toBeGreaterThanOrEqual(4);
    for (const t of reading.texts ?? []) {
      expect(t.text).toBe('');
      expect(t.confidence).toBe(0);
      expect(t.bbox.w).toBeGreaterThan(0);
    }
    const heads = st.truth?.measures.flatMap((m) => m.events.flatMap((e) => e.notes)).length ?? 0;
    expect(reading.events.reduce((a, e) => a + e.notes.length, 0)).toBe(heads);
  });

  it('remembers the time signature from system to system when asked to', async () => {
    const page = loadDevPage('rhythm-bravura-150', 'clean');
    const second = page.strips[1].input;
    const fresh = recognizeNotationStaff(second) as StaffReading<OmrNotationEvent>;
    expect(fresh.timeSignature).toBeUndefined();
    const recognizer = createNotationRecognizer();
    await recognizer(page.strips[0].input);
    const withMemory = (await recognizer(second)) as StaffReading<OmrNotationEvent>;
    // The reading itself is the same music; the context is what the measure check ran against.
    expect(withMemory.events.length).toBe(fresh.events.length);
    const viaPage = await recognizePage(page.gray, { notation: createNotationRecognizer() });
    expect(viaPage.systems.length).toBe(3);
    expect(viaPage.systems.every((s) => s.staves[0].measures.every((m) => m.events.length > 0))).toBe(true);
  });

  it('is fast enough for interactive use', () => {
    const { ms } = run('page-notation-bravura-150', 'clean');
    ms.sort((a, b) => a - b);
    // Generous: the build machine runs many jobs at once.
    expect(ms[ms.length >> 1]).toBeLessThan(1500);
  });
});

describe('notation recognizer: what the shared corpus does not cover', () => {
  const pages = loadExtraIndex();
  const byId = (id: string) => {
    const p = pages.find((q) => q.id === id);
    if (!p) throw new Error(`no extra page ${id}`);
    return p;
  };

  it('has the extra pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });

  it('separates two voices by stem direction', async () => {
    for (const id of ['voices-44-bravura', 'voices-34-gonville', 'voices-44-leland']) {
      const r = await checkExtra(byId(id), recognizeNotationStaff);
      expect(r.diffs).toEqual([]);
      expect(r.measuresExact).toBe(r.measures);
      const events = r.page.systems[0].staves[0].measures.flatMap((m) => m.events) as OmrNotationEvent[];
      expect(events.some((e) => e.voice === 2)).toBe(true);
    }
  });

  it('reads C and cut-C time signatures', async () => {
    for (const id of ['common-time-bravura', 'cut-time-leland', 'cut-time-gonville']) {
      const r = await checkExtra(byId(id), recognizeNotationStaff);
      expect(r.timeOk).toBe(true);
      expect(r.measuresExact).toBe(r.measures);
    }
  });

  it('reads triplets with and without a bracket', async () => {
    for (const id of ['tuplets-bravura', 'tuplets-petaluma']) {
      const r = await checkExtra(byId(id), recognizeNotationStaff);
      expect(r.diffs).toEqual([]);
    }
  });

  it('ignores grace notes and reads the bass clef at pitch', async () => {
    const grace = await checkExtra(byId('grace-bravura'), recognizeNotationStaff);
    expect(grace.diffs).toEqual([]);
    const bass = await checkExtra(byId('bass-clef-bravura'), recognizeNotationStaff);
    expect(bass.clefOk).toBe(true);
    expect(bass.diffs).toEqual([]);
  });
});

describe('second opinion from a vision model', () => {
  // The middle measure lost its dot: q. e h reads as q e h (3.5 of 4 beats).
  const build = () => {
    const s = new SynthStrip(1100);
    s.glyph('gClef', 30, s.y(2));
    s.glyph('timeSig4', 100, s.y(6));
    s.glyph('timeSig4', 100, s.y(2));
    s.note(220, 4, { head: 'noteheadWhole', stem: null });
    s.barline(320);
    s.note(400, 3);
    const f = s.note(480, 4, { stem: 'down' });
    s.glyph('flag8thDown', f.stemX - 1.5, f.tipY);
    s.note(560, 5, { head: 'noteheadHalf', stem: 'down' });
    s.barline(650);
    s.note(730, 2, { head: 'noteheadWhole', stem: null });
    s.barline(830);
    s.note(900, 2, { head: 'noteheadWhole', stem: null });
    return s.input();
  };

  it('repairs or flags the measure by itself, and marks what it changed as uncertain', () => {
    const a = analyzeNotationStaff(build());
    expect(a.measureTicks).toBe(3840);
    const reading = toReading(a);
    const m1 = reading.events.filter((e) => e.measureIndex === 1);
    expect(m1.length).toBe(3);
    if (a.measureOk[1]) {
      // Repaired by the cheapest change: that event is a guess and keeps its first reading as an alternative.
      const changed = m1.filter((e) => e.duration.confidence < 0.6);
      expect(changed.length).toBeGreaterThan(0);
      expect(changed[0].duration.alternatives?.length).toBeGreaterThan(0);
      expect(m1.reduce((t, e) => t + e.duration.ticks, 0)).toBe(3840);
    } else {
      expect(reading.warnings?.some((w) => w.code === 'measure-mismatch')).toBe(true);
      expect(m1.every((e) => e.duration.confidence < 0.5)).toBe(true);
    }
    // The measures that add up are confident.
    expect(reading.events.filter((e) => e.measureIndex !== 1).every((e) => e.duration.confidence > 0.9)).toBe(true);
  });

  it('accepts an answer only when it fits the measure', async () => {
    const a = analyzeNotationStaff(build());
    // Force the situation the model is for: an unexplained measure.
    for (const e of a.events.filter((q) => q.measure === 1)) e.rhythm.chosen = 0;
    a.measureOk[1] = false;
    a.mismatches = [{ measure: 1, voice: 1, message: 'Measure 2 of this staff does not add up.' }];
    const asked: string[] = [];
    const wrong: OmrVisionModel = { ask: async (_img, prompt) => { asked.push(prompt); return { events: [{ type: 'note', value: 'quarter', dots: 0 }, { type: 'note', value: 'quarter', dots: 0 }] }; } };
    expect(await refineWithModel(a, wrong)).toBe(0);
    expect(asked[0]).toContain('4/4');
    expect(a.mismatches.length).toBe(1);
    const short: OmrVisionModel = { ask: async () => ({ events: [{ type: 'note', value: 'quarter', dots: 0 }, { type: 'note', value: 'eighth', dots: 0 }, { type: 'note', value: 'half', dots: 0 }] }) };
    expect(await refineWithModel(a, short)).toBe(0);
    const broken: OmrVisionModel = { ask: async () => { throw new Error('offline'); } };
    expect(await refineWithModel(a, broken)).toBe(0);
    const good: OmrVisionModel = { ask: async () => ({ events: [{ type: 'note', value: 'quarter', dots: 1 }, { type: 'note', value: 'eighth', dots: 0 }, { type: 'note', value: 'half', dots: 0 }] }) };
    expect(await refineWithModel(a, good)).toBe(1);
    expect(a.mismatches.length).toBe(0);
    const reading = toReading(a);
    const first = reading.events.filter((e) => e.measureIndex === 1)[0];
    expect(first.duration).toMatchObject({ value: 'quarter', dots: 1, ticks: 1440 });
    expect(first.duration.confidence).toBeLessThanOrEqual(0.6);
    expect(first.source).toBe('merged');
    expect(reading.warnings).toBeUndefined();
  });

  it('is asked through the recognizer options and is optional', async () => {
    const input = build();
    let calls = 0;
    const ai: OmrVisionModel = { ask: async () => { calls++; return null; } };
    const withAi = await recognizeNotationStaff(input, { ai });
    const without = await recognizeNotationStaff(input);
    expect(withAi.events.length).toBe(without.events.length);
    // Asked at most once per unexplained measure, and a missing answer changes nothing.
    expect(calls).toBeLessThanOrEqual(1);
    expect(withAi.events.map((e) => e.duration.value)).toEqual(without.events.map((e) => e.duration.value));
  });
});
