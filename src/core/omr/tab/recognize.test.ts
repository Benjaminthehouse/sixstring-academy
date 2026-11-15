/**
 * The tab reader on synthetic strips (one thing varied at a time) and on real fixture pages run
 * through the whole pipeline.
 */
import { describe, expect, it } from 'vitest';
import { degrade } from '../eval/degrade';
import { loadFixture } from '../eval/fixtures';
import { rate, scorePage } from '../eval/metrics';
import { tierSeed } from '../eval/runner';
import { analyzePage, assemblePage, extractStaff } from '../page';
import type { OmrTabEvent, OmrWarning, StaffReading } from '../types';
import { loadAnyFixture, ownFixtures } from './dev/cache';
import { type SynthItem, synthStaff } from './dev/synth';
import { recognizeTabStaff } from './index';
import { readTabStaff, tuningFor } from './recognize';

/** Frets per column, as "string:fret" lists, left to right. */
function columns(events: OmrTabEvent[]): string[] {
  return events.filter((e) => e.kind === 'tab').map((e) => e.notes.map((n) => `${n.string}:${n.technique === 'x' ? 'x' : n.fret}`).join(' '));
}

const row = (line: number, texts: string[], x0 = 120, step = 70): SynthItem[] => texts.map((text, i) => ({ line, x: x0 + i * step, text }));

describe('readTabStaff on synthetic strips', () => {
  it('reads every digit and every fret from 10 to 24 in several faces', () => {
    const texts = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const twos = ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'];
    for (const [family, weight] of [['Liberation Sans', 400], ['Liberation Sans', 700], ['DejaVu Serif', 400], ['JetBrains Mono', 500], ['Inter', 600], ['FreeSerif', 700]] as const) {
      const { input } = synthStaff({ family, weight, width: 1300, items: [...row(1, texts), ...row(3, twos.slice(0, 8), 120, 90), ...row(4, twos.slice(8), 120, 90)] });
      const { reading } = readTabStaff(input);
      const got = reading.events.flatMap((e) => e.notes.map((q) => `${q.string}:${q.fret}`)).sort();
      const want = [...texts.map((t) => `2:${t}`), ...twos.slice(0, 8).map((t) => `4:${t}`), ...twos.slice(8).map((t) => `5:${t}`)].sort();
      expect(got, `${family} ${weight}`).toEqual(want);
      for (const e of reading.events) expect(e.confidence, `${family} ${weight} ${columns([e])[0]}`).toBeGreaterThan(0.5);
    }
  });

  it('assigns numbers to strings and groups numbers printed above one another into one event', () => {
    const { input } = synthStaff({
      items: [
        { line: 0, x: 200, text: '0' }, { line: 1, x: 200, text: '1' }, { line: 2, x: 200, text: '0' }, { line: 3, x: 200, text: '2' }, { line: 4, x: 200, text: '3' },
        { line: 5, x: 320, text: '3' },
        { line: 2, x: 430, text: '12' }, { line: 3, x: 430, text: '14' }, { line: 4, x: 436, text: '9' },
        { line: 0, x: 560, text: '5' }, { line: 1, x: 600, text: '7' },
      ],
    });
    const { reading } = readTabStaff(input);
    expect(columns(reading.events)).toEqual(['1:0 2:1 3:0 4:2 5:3', '6:3', '3:12 4:14 5:9', '1:5', '2:7']);
    // Events come in time order with their position exposed for alignment with a notation staff.
    const xs = reading.events.map((e) => e.x);
    expect(xs).toEqual(xs.slice().sort((a, b) => a - b));
    expect(reading.events[0].notes[0].midi).toBe(64);
    expect(reading.events[1].notes[0].midi).toBe(43);
  });

  it('reads numbers the staff line strikes through', () => {
    const texts = ['0', '1', '2', '3', '4', '5', '7', '9', '10', '12', '15', '17'];
    for (const [family, weight] of [['Liberation Sans', 400], ['Inter', 600]] as const) {
      const { input } = synthStaff({ family, weight, lineThrough: true, width: 1100, items: row(2, texts, 120, 75) });
      const { reading, debug } = readTabStaff(input);
      expect(debug.lineThrough).toBe(true);
      expect(columns(reading.events), `${family} ${weight}`).toEqual(texts.map((t) => `3:${t}`));
    }
  });

  it('cuts touching digits apart and keeps a wide digit whole', () => {
    // No space at all between the two digits of each number.
    const { input } = synthStaff({ weight: 700, spacing: -0.03, items: row(2, ['10', '11', '12', '17', '21', '0', '8', '4']) });
    const { reading, debug } = readTabStaff(input);
    expect(columns(reading.events)).toEqual(['3:10', '3:11', '3:12', '3:17', '3:21', '3:0', '3:8', '3:4']);
    expect(debug.glyphs.some((g) => g.split)).toBe(true);
  });

  it('tells a two-digit fret from two notes by the gap, and says so when the gap is in between', () => {
    const { input } = synthStaff({ items: [{ line: 1, x: 150, text: '10' }, { line: 1, x: 300, text: '1' }, { line: 1, x: 300 + 9 + 19, text: '0' }] });
    const { reading } = readTabStaff(input);
    expect(columns(reading.events)).toEqual(['2:10', '2:1', '2:0']);
    const borderline = synthStaff({ spacing: 0.3, items: [{ line: 1, x: 150, text: '12' }] });
    const note = readTabStaff(borderline.input).reading.events[0].notes[0];
    expect(note.fret).toBe(12);
    expect(note.alternatives?.map((a) => a.value)).toEqual(expect.arrayContaining([1, 2]));
    expect(note.confidence).toBeLessThan(0.9);
  });

  it('ignores the TAB letters, bar lines and dirt, and keeps numbers next to a bar line', () => {
    const { input } = synthStaff({
      bars: [400],
      items: [{ line: 2, x: 130, text: '7' }, { line: 2, x: 372, text: '5' }, { line: 4, x: 414, text: '3' }],
      draw: (ink, g) => {
        // Three block letters at the start of the staff and a few specks.
        for (let k = 0; k < 3; k++) for (let y = 0; y < 34; y++) for (let x = 0; x < 20; x++) if (y < 5 || (x > 7 && x < 13) || k > 0) ink(40 + x, g.lineYs[0] + 4 + k * 40 + y);
        for (const [x, y] of [[250, g.lineYs[1] - 6], [520, g.lineYs[3] + 9], [640, g.lineYs[5] - 3]]) for (let d = 0; d < 3; d++) ink(x + d, y);
      },
    });
    const { reading } = readTabStaff(input);
    expect(columns(reading.events)).toEqual(['3:7', '3:5', '5:3']);
    expect(reading.events.map((e) => e.measureIndex)).toEqual([0, 0, 1]);
  });

  it('degrades with blur by lowering confidence before it starts misreading', () => {
    const texts = ['0', '2', '3', '5', '7', '8', '10', '12'];
    const sharp = readTabStaff(synthStaff({ items: row(2, texts, 120, 80) }).input).reading;
    const soft = readTabStaff(synthStaff({ items: row(2, texts, 120, 80), blur: 1.6 }).input).reading;
    expect(columns(sharp.events)).toEqual(texts.map((t) => `3:${t}`));
    expect(columns(soft.events)).toEqual(texts.map((t) => `3:${t}`));
    expect(soft.confidence).toBeLessThanOrEqual(sharp.confidence + 1e-6);
  });

  it('calls frets above 24 implausible instead of reporting them as fact', () => {
    const { input } = synthStaff({ items: [{ line: 3, x: 200, text: '29' }, { line: 3, x: 330, text: '12' }] });
    const first = readTabStaff(input).reading.events[0].notes[0];
    expect(first.confidence).toBeLessThan(0.5);
    // The printed digits stay available: either as the reading or among the alternatives.
    expect([first.fret, ...(first.alternatives ?? []).map((a) => a.value)]).toContain(29);
  });

  it('reads a four-line (bass) staff', () => {
    const { input } = synthStaff({ lines: 4, items: [{ line: 0, x: 150, text: '5' }, { line: 3, x: 230, text: '3' }, { line: 1, x: 310, text: '12' }, { line: 2, x: 310, text: '10' }] });
    const reading = readTabStaff(input, { tuning: [28, 33, 38, 43] }).reading;
    expect(columns(reading.events)).toEqual(['1:5', '4:3', '2:12 3:10']);
    expect(reading.events[0].notes[0].midi).toBe(48);
    expect(reading.events[1].notes[0].midi).toBe(31);
  });

  it('reads a four-line staff as bass without being told, and says so', () => {
    const { input } = synthStaff({ lines: 4, items: [{ line: 0, x: 150, text: '5' }, { line: 3, x: 230, text: '3' }] });
    const reading = readTabStaff(input).reading;
    expect(reading.events.map((e) => e.notes[0].midi)).toEqual([48, 31]);
    expect(reading.warnings?.some((w) => /bass/.test(w.message))).toBe(true);
    // A tuning with the wrong number of strings is not applied blindly.
    const warnings: OmrWarning[] = [];
    expect(tuningFor(4, [40, 45, 50, 55, 59, 64], warnings)).toEqual([28, 33, 38, 43]);
    expect(warnings).toHaveLength(1);
    expect(tuningFor(6, undefined, [])).toEqual([40, 45, 50, 55, 59, 64]);
    expect(tuningFor(7, undefined, [])[0]).toBe(35);
  });

  it('chooses the blur of a soft staff that holds only two-digit frets', () => {
    // A riff at the 12th fret: no lone digit to judge the blur by.
    const twos = ['12', '15', '12', '14', '12', '14', '17', '15', '12', '14', '15', '17'];
    const { input } = synthStaff({ weight: 700, blur: 2.2, width: 1300, items: [...row(1, twos.slice(0, 6), 120, 180), ...row(2, twos.slice(6), 210, 180)] });
    const { reading, debug } = readTabStaff(input);
    expect(debug.blurLevel).toBeGreaterThanOrEqual(2);
    expect(reading.events.flatMap((e) => e.notes.map((q) => q.fret))).toEqual([12, 17, 15, 15, 12, 12, 14, 14, 12, 15, 14, 17]);
  });

  it('marks a staff of nothing but lone 1s as doubtful (strokes, not frets)', () => {
    const { input } = synthStaff({ items: row(2, ['1', '1', '1', '1', '1', '1']).concat(row(4, ['1', '1'], 160)) });
    const { reading } = readTabStaff(input);
    const notes = reading.events.flatMap((e) => e.notes);
    expect(notes.length).toBe(8);
    expect(notes.every((q) => q.fret === 1 && q.confidence < 0.5)).toBe(true);
    expect(reading.warnings?.some((w) => /1/.test(w.message))).toBe(true);
  });

  it('returns an empty, calm reading for an empty staff', () => {
    const reading = readTabStaff(synthStaff({ items: [] }).input).reading;
    expect(reading.events).toEqual([]);
    expect(reading.warnings ?? []).toEqual([]);
  });
});

/** Whole pages take a second or two each; allow for a busy machine. */
const PIPELINE_TIMEOUT = 180_000;

describe('recognizeTabStaff in the page pipeline', () => {
  async function run(gray: Parameters<typeof analyzePage>[0]): Promise<ReturnType<typeof assemblePage>> {
    const analysis = analyzePage(gray);
    const readings: (StaffReading | null)[] = [];
    for (const st of analysis.layout.staves) readings.push(st.kind === 'tab' ? await recognizeTabStaff(extractStaff(analysis, st.index)) : null);
    return assemblePage(analysis, readings);
  }

  it('reads corpus pages cleanly rendered and scanned', async () => {
    for (const id of ['tab-ode-ls-150', 'tab-high-chords-lsb-150', 'tab-fingerstyle-bri-150', 'linked-chords-gonville-220']) {
      const fx = loadFixture(id);
      for (const tier of ['clean', 'scan'] as const) {
        const d = degrade(fx.gray, fx.truth, tier, tierSeed(id, tier, 1));
        const score = scorePage(await run(d.gray), d.truth!);
        expect(score.tabNotes.fn + score.tabNotes.fp, `${id} ${tier} misses / extras`).toBe(0);
        expect(rate(score.fret), `${id} ${tier} frets`).toBe(1);
        expect(rate(score.string), `${id} ${tier} strings`).toBe(1);
      }
    }
  }, PIPELINE_TIMEOUT);

  it('reads numbers with the line struck through them', async () => {
    const fx = loadFixture('tab-random-ls-150');
    const score = scorePage(await run(fx.gray), fx.truth);
    expect(score.tabNotes.fn + score.tabNotes.fp).toBe(0);
    expect(rate(score.fret)).toBe(1);
  }, PIPELINE_TIMEOUT);

  it('reads the rhythm from stems, beams, flags and rests, and the time signature', async () => {
    const fx = loadFixture('tab-rhythm-lsb-150');
    const page = await run(fx.gray);
    const score = scorePage(page, fx.truth);
    expect(rate(score.tabDuration)).toBe(1);
    const staff = page.systems[0].staves[0];
    expect(staff.timeSignature).toMatchObject({ beats: 4, beatValue: 4 });
    expect(staff.clef?.type).toBe('tab');
    const rests = staff.measures.flatMap((m) => m.events).filter((e) => e.kind === 'tab-rest');
    expect(rests.length).toBe(2);
    expect(rests.every((r) => r.duration?.value === 'quarter')).toBe(true);
    // Half notes look like quarters in this engraving: they are inferred from the measure, and say so.
    const halves = staff.measures[1].events.filter((e) => e.kind === 'tab');
    expect(halves.map((e) => e.duration?.value)).toEqual(['half', 'half']);
    expect(halves.every((e) => (e.duration?.confidence ?? 1) < 0.75)).toBe(true);
  }, PIPELINE_TIMEOUT);

  it('survives a careful phone photo', async () => {
    const id = 'tab-open-chords-ls-220';
    const fx = loadFixture(id);
    const d = degrade(fx.gray, fx.truth, 'photo-good', tierSeed(id, 'photo-good', 1));
    const score = scorePage(await run(d.gray), d.truth!);
    expect(score.tabNotes.tp / (score.tabNotes.tp + score.tabNotes.fn)).toBeGreaterThanOrEqual(0.98);
    expect(rate(score.fret)).toBeGreaterThanOrEqual(0.97);
    expect(rate(score.string)).toBe(1);
  }, PIPELINE_TIMEOUT);

  it('reads faces it has no templates of, and a bass staff', async () => {
    for (const id of ['heldout-carlito-150', 'heldout-caladea-150', 'heldout-caladea-bold-220', 'bass-carlito-150']) {
      const meta = ownFixtures().find((m) => m.id === id)!;
      const fx = loadAnyFixture(meta);
      const score = scorePage(await run(fx.gray), fx.truth);
      expect(score.tabNotes.fn + score.tabNotes.fp, `${id} misses / extras`).toBe(0);
      expect(rate(score.fret), `${id} frets`).toBe(1);
      expect(rate(score.string), `${id} strings`).toBe(1);
    }
  }, PIPELINE_TIMEOUT);

  it('reads technique marks: dead notes, brackets, ties, slurs, slides, bends, typewriter letters', async () => {
    const want: Record<string, number> = { 'tech-marks-dejavu-150': 19, 'tech-marks-freeserif-300': 20, 'tech-ascii-jbm-220': 13 };
    for (const [id, least] of Object.entries(want)) {
      const meta = ownFixtures().find((m) => m.id === id)!;
      const fx = loadAnyFixture(meta);
      const page = await run(fx.gray);
      const notes = page.systems.flatMap((s) => s.staves).flatMap((st) => st.measures).flatMap((m) => m.events).flatMap((e) => (e.kind === 'tab' ? e.notes : []));
      interface MarkedNote { bbox: [number, number, number, number]; dead?: boolean; paren?: boolean; harmonic?: boolean; tieStop?: boolean; mark?: string | null }
      const truth: MarkedNote[] = [];
      for (const sys of fx.truth.systems) for (const st of sys.staves) for (const m of st.measures) for (const e of m.events) truth.push(...(e.notes as unknown as MarkedNote[]));
      let right = 0;
      let wrong = 0;
      for (const t of truth) {
        const cx = t.bbox[0] + t.bbox[2] / 2;
        const cy = t.bbox[1] + t.bbox[3] / 2;
        const n = notes.find((q) => Math.hypot(q.bbox.x + q.bbox.w / 2 - cx, q.bbox.y + q.bbox.h / 2 - cy) < 6);
        expect(n, `${id}: a number at ${Math.round(cx)},${Math.round(cy)}`).toBeTruthy();
        if (!n) continue;
        const expected = `${t.dead ? 'x' : ''}${t.paren ? '()' : ''}${t.harmonic ? '<>' : ''}${t.tieStop ? 't' : ''}${t.mark && t.mark !== 't' ? t.mark : ''}`;
        const got = `${n.technique?.includes('x') ? 'x' : ''}${n.parenthesized ? '()' : ''}${n.technique?.includes('<>') ? '<>' : ''}${n.tieStop ? 't' : ''}${(n.technique ?? '').replace('x', '').replace('<>', '')}`;
        if (expected && expected === got) right++;
        else if (got && got !== expected) wrong++;
      }
      expect(right, `${id}: marks read`).toBeGreaterThanOrEqual(least);
      expect(wrong, `${id}: marks invented or misread`).toBe(0);
    }
  }, PIPELINE_TIMEOUT);
});
