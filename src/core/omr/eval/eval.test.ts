import { describe, expect, it } from 'vitest';
import { resizeGray } from '../image/gray';
import { analyzePage, assemblePage, extractStaff } from '../page';
import { recognizePage } from '../pipeline';
import type { OmrNotationEvent, OmrPage, OmrTabEvent, StaffReading } from '../types';
import { isNotationEvent, isTabEvent, midiAtFret, pitchAtStaffPosition } from '../types';
import { TIERS, degrade, hashString } from './degrade';
import { Canvas, COLORS } from './draw';
import { defaultSample, loadFixture, loadManifest, selectFixtures } from './fixtures';
import { f1, precision, rate, recall, scorePage } from './metrics';
import { oracleRecognizers } from './oracle';
import { formatReport, runEvaluation, runFixture, tierSeed } from './runner';
import { stripAccuracy } from './strips';
import { polylineY } from './truth';

describe('fixture corpus', () => {
  it('has a manifest that matches the files', () => {
    const all = loadManifest();
    expect(all.length).toBeGreaterThanOrEqual(40);
    expect(all.length).toBeLessThanOrEqual(80);
    for (const subset of ['notation', 'tab', 'linked'] as const) expect(selectFixtures({ subset }).length).toBeGreaterThan(8);
    expect(new Set(all.map((m) => m.musicFont)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(all.map((m) => m.dpi))).toEqual(new Set([100, 150, 220]));
    expect(all.reduce((a, m) => a + m.bytes, 0)).toBeLessThan(4e6);
    const fx = loadFixture(all[0]);
    expect(fx.gray.width).toBe(all[0].width);
    expect(fx.truth.systems.length).toBe(all[0].systems);
  });

  it('has ground truth that sits on the ink', () => {
    for (const id of ['ode-bravura-150', 'chromatic-leland-150', 'tab-pentatonic-jbm-150', 'linked-chords-gonville-220']) {
      const { gray, truth } = loadFixture(id);
      for (const sys of truth.systems) {
        for (const st of sys.staves) {
          // Staff lines are dark at their stated position.
          for (const line of st.lines) {
            let dark = 0;
            for (let k = 2; k < line.length - 2; k++) {
              const x = Math.round(line[k].x);
              const y = Math.round(line[k].y - 0.5);
              if (Math.min(gray.data[y * gray.width + x], gray.data[(y + 1) * gray.width + x], gray.data[(y - 1) * gray.width + x]) < 160) dark++;
            }
            expect(dark).toBeGreaterThan((line.length - 4) * 0.6);
          }
          for (const m of st.measures) {
            for (const e of m.events) {
              for (const n of e.notes) {
                const b = 'head' in n ? n.head : n.bbox;
                // Boxes are tight: head-sized, and dark in the middle or along their outline.
                expect(b[2]).toBeGreaterThan(0.4 * st.space);
                expect(b[2]).toBeLessThan(2.2 * st.space);
                expect(b[3]).toBeLessThan(1.5 * st.space);
                let min = 255;
                for (let y = Math.floor(b[1]); y < b[1] + b[3]; y++) for (let x = Math.floor(b[0]); x < b[0] + b[2]; x++) min = Math.min(min, gray.data[y * gray.width + x]);
                expect(min).toBeLessThan(100);
              }
            }
          }
        }
      }
    }
  });

  it('spells pitches, tab positions and durations consistently', () => {
    const { truth } = loadFixture('linked-scale-e-leland-150');
    for (const sys of truth.systems) {
      const [notation, tab] = sys.staves;
      if (notation.kind !== 'notation' || tab.kind !== 'tab') throw new Error('fixture changed');
      notation.measures.forEach((m, mi) => {
        m.events.forEach((e, ei) => {
          for (const n of e.notes) {
            // The staff position gives the written pitch once the key signature and accidental are applied.
            const p = pitchAtStaffPosition(n.pos, n.alter);
            expect(p.written).toBe(n.written);
            expect(p.midi).toBe(n.midi);
            expect(p.step).toBe(n.step);
            // The tab staff plays the same pitch.
            expect(midiAtFret(n.string, n.fret)).toBe(n.midi);
            const t = tab.measures[mi].events[ei].notes.find((q) => q.string === n.string);
            expect(t?.fret).toBe(n.fret);
          }
        });
        const ticks = m.events.reduce((a, e) => a + e.duration.ticks, 0);
        expect(ticks).toBe(3840);
      });
    }
  });
});

describe('degradation model', () => {
  it('is deterministic and moves the ground truth with the picture', () => {
    const fx = loadFixture('ode-bravura-150');
    const a = degrade(fx.gray, fx.truth, 'photo-good', 42);
    const b = degrade(fx.gray, fx.truth, 'photo-good', 42);
    const c = degrade(fx.gray, fx.truth, 'photo-good', 43);
    expect(Buffer.from(a.rgba.buffer).equals(Buffer.from(b.rgba.buffer))).toBe(true);
    expect(Buffer.from(a.rgba.buffer).equals(Buffer.from(c.rgba.buffer))).toBe(false);
    expect(a.params.perspective).toBeGreaterThan(0);
    // Forward and backward maps are inverses.
    const p = a.forward({ x: 400, y: 150 });
    const q = a.backward(p);
    expect(q.x).toBeCloseTo(400, 2);
    expect(q.y).toBeCloseTo(150, 2);
    // The transformed staff lines lie on darker pixels than the spaces between them.
    const truth = a.truth;
    if (!truth) throw new Error('no truth');
    const st = truth.systems[0].staves[0];
    let onLine = 0;
    let between = 0;
    let n = 0;
    for (let l = 0; l + 1 < st.lines.length; l++) {
      for (let k = 4; k < st.lines[l].length - 4; k++) {
        const x = Math.round(st.lines[l][k].x);
        const y = st.lines[l][k].y;
        const y2 = (y + polylineY(st.lines[l + 1], x)) / 2;
        onLine += a.gray.data[Math.round(y - 0.5) * a.width + x];
        between += a.gray.data[Math.round(y2 - 0.5) * a.width + x];
        n++;
      }
    }
    expect(between / n - onLine / n).toBeGreaterThan(15);
    // Paper tint: the capture is not neutral grey.
    expect(a.rgba[0]).not.toBe(a.rgba[2]);
  });

  it('leaves a clean page untouched', () => {
    const fx = loadFixture('tab-ode-ls-100');
    const d = degrade(fx.gray, fx.truth, 'clean', 1);
    expect(Array.from(d.gray.data.subarray(0, 5000))).toEqual(Array.from(fx.gray.data.subarray(0, 5000)));
    expect(d.truth).toBe(fx.truth);
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('metrics', () => {
  const read = async (id: string): Promise<{ page: OmrPage; truth: ReturnType<typeof loadFixture>['truth'] }> => {
    const fx = loadFixture(id);
    return { page: await recognizePage(fx.gray, oracleRecognizers(fx.truth)), truth: fx.truth };
  };

  it('scores a perfect reading as perfect and links notation to tab', async () => {
    const { page, truth } = await read('linked-chords-bravura-150');
    const s = scorePage(page, truth);
    expect(s.stavesMatched).toBe(s.stavesTruth);
    expect(f1(s.barlines)).toBe(1);
    expect([precision(s.notes), recall(s.notes), rate(s.pitch), rate(s.duration), rate(s.accidentals)]).toEqual([1, 1, 1, 1, 1]);
    expect([precision(s.tabNotes), recall(s.tabNotes), rate(s.fret), rate(s.string)]).toEqual([1, 1, 1, 1]);
    expect(rate(s.measureExact)).toBe(1);
    expect(rate(s.tabMeasureExact)).toBe(1);
    expect(rate(s.key)).toBe(1);
    expect(rate(s.time)).toBe(1);
    expect(s.notes.tp).toBeGreaterThan(20);
    // Every chord got its strings and frets from the tab staff below, and the tab got the rhythm.
    const [notation, tab] = page.systems[0].staves;
    expect(notation.linkedStaffId).toBe(tab.id);
    const gt = truth.systems[0].staves[0];
    if (gt.kind !== 'notation') throw new Error('fixture changed');
    notation.measures.forEach((m, mi) => {
      const chords = m.events.filter(isNotationEvent).filter((e) => e.kind === 'chord');
      chords.forEach((e, ei) => {
        expect(e.linkedEventId).toBeDefined();
        const want = gt.measures[mi].events.filter((x) => x.type === 'note')[ei].notes;
        expect(e.notes.map((n) => `${n.string}/${n.fret}`).sort()).toEqual(want.map((n) => `${n.string}/${n.fret}`).sort());
      });
    });
    for (const m of tab.measures) for (const e of m.events.filter(isTabEvent)) if (e.kind === 'tab') expect(e.duration).toBeDefined();
    // Ids are unique across the page.
    const ids = page.systems.flatMap((sys) => sys.staves.flatMap((st) => st.measures.flatMap((m) => m.events.flatMap((e) => [e.id, ...e.notes.map((n) => n.id)]))));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('notices wrong pitches, durations, frets and missing notes', async () => {
    const { page, truth } = await read('linked-ode-bravura-150');
    const notation = page.systems[0].staves[0].measures[1].events as OmrNotationEvent[];
    const tab = page.systems[0].staves[1].measures[1].events as OmrTabEvent[];
    notation[0].notes[0].pitch = { ...notation[0].notes[0].pitch, midi: notation[0].notes[0].pitch.midi + 2 };
    notation[1].duration = { ...notation[1].duration, value: 'half' };
    notation.pop();
    tab[0].notes[0].fret += 1;
    tab[1].notes[0].string = 6;
    const s = scorePage(page, truth);
    expect(s.pitch.total - s.pitch.correct).toBe(1);
    expect(s.duration.total - s.duration.correct).toBe(1);
    expect(s.notes.fn).toBe(1);
    expect(s.notes.fp).toBe(0);
    expect(s.fret.total - s.fret.correct).toBe(1);
    expect(s.string.total - s.string.correct).toBe(1);
    expect(s.measureExact.total - s.measureExact.correct).toBe(1);
    expect(s.tabMeasureExact.total - s.tabMeasureExact.correct).toBe(1);
    expect(f1(s.barlines)).toBe(1);
  });

  it('counts everything on a missed staff as missed', () => {
    const fx = loadFixture('ode-bravura-150');
    const page = analyzePage(fx.gray).page;
    page.systems.pop();
    const s = scorePage(page, fx.truth);
    expect(s.stavesMatched).toBe(1);
    expect(s.stavesTruth).toBe(2);
    expect(s.barlines.fn).toBeGreaterThan(0);
    expect(s.notes.fn).toBeGreaterThan(5);
  });
});

describe('staff strips', () => {
  it('puts every true note head and tab number where the strip geometry says', () => {
    for (const [id, tier] of [['linked-greensleeves-gonville-150', 'clean'], ['scale-e-bravura-150', 'scan'], ['linked-aura-lee-leland-150', 'photo-good']] as const) {
      const fx = loadFixture(id);
      const d = degrade(fx.gray, fx.truth, tier, tierSeed(id, tier));
      const analysis = analyzePage(d.gray);
      const acc = stripAccuracy(analysis, d.truth as NonNullable<typeof d.truth>);
      expect(acc.heads).toBeGreaterThan(10);
      expect(acc.headsOnPosition).toBe(acc.heads);
      expect(acc.headError).toBeLessThan(0.12);
      expect(acc.digitsOnLine).toBe(acc.digits);
      expect(acc.roundTrip).toBeLessThan(0.05);
    }
  });

  it('cuts strips with level, evenly spaced lines and a line-free copy', () => {
    const fx = loadFixture('linked-ode-bravura-150');
    const d = degrade(fx.gray, fx.truth, 'photo-good', tierSeed('linked-ode-bravura-150', 'photo-good'));
    const analysis = analyzePage(d.gray);
    const notation = extractStaff(analysis, 0);
    const tab = extractStaff(analysis, 1, { space: 30 });
    expect(notation.kind).toBe('notation');
    expect(notation.space).toBe(20);
    expect(notation.lineYs.length).toBe(5);
    expect(tab.space).toBe(30);
    expect(tab.lineYs[5] - tab.lineYs[0]).toBe(150);
    expect(tab.partnerIndex).toBe(0);
    expect(notation.measures.length).toBe(fx.truth.systems[0].staves[0].measures.length);
    for (const strip of [notation, tab]) {
      const { width: w, data } = strip.binary;
      // Each line row is ink across most of the staff; the rows midway between lines are mostly paper.
      for (let l = 0; l < strip.lineCount; l++) {
        let on = 0;
        let off = 0;
        const y = Math.round(strip.lineYs[l] - 0.5);
        const mid = Math.round(strip.lineYs[l] + strip.space / 2 - 0.5);
        for (let x = Math.round(strip.x0) + 5; x < strip.x1 - 5; x++) {
          on += data[y * w + x] | data[(y - 1) * w + x] | data[(y + 1) * w + x];
          if (l + 1 < strip.lineCount) off += data[mid * w + x];
        }
        const len = strip.x1 - strip.x0 - 10;
        expect(on / len).toBeGreaterThan(0.85);
        expect(off / len).toBeLessThan(0.3);
        // ... and the line-free copy has (almost) nothing left on the line rows.
        let left = 0;
        for (let x = Math.round(strip.x0) + 5; x < strip.x1 - 5; x++) left += strip.noLines.data[y * w + x];
        expect(left / len).toBeLessThan(0.3);
      }
      const p = strip.toPage(strip.x0 + 100, strip.lineYs[2]);
      const q = strip.fromPage(p.x, p.y);
      expect(q.x).toBeCloseTo(strip.x0 + 100, 1);
      expect(q.y).toBeCloseTo(strip.lineYs[2], 1);
      const box = strip.toPageBox(strip.x0, strip.lineYs[0], 40, 40);
      expect(box.w).toBeGreaterThan(5);
    }
  });
});

describe('assembling readings', () => {
  it('puts events into measures by position and skips staves without a reading', () => {
    const fx = loadFixture('ode-bravura-150');
    const analysis = analyzePage(fx.gray);
    const rec = oracleRecognizers(fx.truth);
    const first = rec.notation?.(extractStaff(analysis, 0)) as StaffReading;
    const page = assemblePage(analysis, [first, null]);
    const gt = fx.truth.systems[0].staves[0];
    expect(page.systems[0].staves[0].measures.map((m) => m.events.length)).toEqual(gt.measures.map((m) => m.events.length));
    expect(page.systems[1].staves[0].measures.every((m) => m.events.length === 0)).toBe(true);
    expect(page.systems[0].staves[0].keySignature?.fifths).toBe(1);
    expect(page.systems[0].staves[0].timeSignature?.beats).toBe(4);
    // The analysis itself is not modified by assembling.
    expect(analysis.page.systems[0].staves[0].measures.every((m) => m.events.length === 0)).toBe(true);
  });

  it('drops the empty stretch between the clef and a repeat sign', async () => {
    const fx = loadFixture('repeats-bravura-150');
    // Layout alone sees one "measure" more: clef, key and time signature in front of the repeat sign.
    expect(analyzePage(fx.gray).page.systems[0].staves[0].measures.length).toBe(6);
    const page = await recognizePage(fx.gray, oracleRecognizers(fx.truth));
    const staff = page.systems[0].staves[0];
    expect(staff.measures.map((m) => m.index)).toEqual([0, 1, 2, 3, 4]);
    expect(staff.measures.map((m) => m.events.length)).toEqual(fx.truth.systems[0].staves[0].measures.map((m) => m.events.length));
    expect(rate(scorePage(page, fx.truth).measureExact)).toBe(1);
  });
});

describe('evaluation runner', () => {
  const sample = defaultSample();

  it('meets the layout targets on every tier', async () => {
    const report = await runEvaluation({ fixtures: sample, tiers: TIERS, strips: false });
    const row = (tier: string): (typeof report.rows)[number] => report.rows.find((r) => r.tier === tier && r.subset === 'all') as (typeof report.rows)[number];
    for (const tier of ['clean', 'scan'] as const) {
      const s = row(tier).score;
      expect(s.stavesMatched).toBe(s.stavesTruth);
      expect(s.stavesDetected).toBe(s.stavesTruth);
      expect(rate(s.kind)).toBe(1);
      expect(rate(s.systems)).toBe(1);
      expect(f1(s.barlines)).toBeGreaterThanOrEqual(0.99);
      expect(s.lineErrorMax).toBeLessThan(0.05);
      expect(s.lineErrorSum / s.stavesMatched).toBeLessThan(0.02);
    }
    const good = row('photo-good').score;
    expect(good.stavesMatched / good.stavesTruth).toBeGreaterThanOrEqual(0.97);
    expect(rate(good.kind)).toBe(1);
    expect(f1(good.barlines)).toBeGreaterThanOrEqual(0.95);
    expect(good.lineErrorSum / good.stavesMatched).toBeLessThan(0.025);
    const bad = row('photo-bad').score;
    expect(bad.stavesMatched / bad.stavesTruth).toBeGreaterThanOrEqual(0.7);
    expect(bad.stavesMatched / Math.max(1, bad.stavesDetected)).toBeGreaterThanOrEqual(0.85);
    expect(precision(bad.barlines)).toBeGreaterThanOrEqual(0.9);
    const text = formatReport(report);
    expect(text).toContain('photo-bad');
    expect(text).toContain('barF1');
    if (process.env.OMR_REPORT === '1') console.log(`\n${text}`);
  }, process.env.OMR_FULL === '1' ? 1_200_000 : 240_000);

  it('degrades the same way every time', async () => {
    const a = await runFixture('tab-ode-ls-150', 'photo-good');
    const b = await runFixture('tab-ode-ls-150', 'photo-good');
    expect(a.page.systems.map((s) => s.bbox)).toEqual(b.page.systems.map((s) => s.bbox));
    expect(tierSeed('x', 'scan')).toBe(hashString('x|scan') + 1);
  });

  it('analyses a full 300 dpi page quickly', () => {
    const fx = loadFixture('page-linked-bravura-150');
    const big = resizeGray(fx.gray, 2480, 3508);
    analyzePage(resizeGray(fx.gray, 620, 877)); // warm up the JIT
    const t0 = performance.now();
    const analysis = analyzePage(big);
    const ms = performance.now() - t0;
    expect(analysis.layout.staves.length).toBe(6);
    // About 0.6 s on an idle laptop core; the bound leaves room for a busy CI machine.
    expect(ms).toBeLessThan(4000);
  }, 60_000);
});

describe('debug drawing', () => {
  it('draws labels and shapes', () => {
    const c = new Canvas(40, 20);
    c.text(1, 1, 'M12', COLORS.red, 1, null);
    c.rect(2, 10, 10, 6, COLORS.blue);
    let coloured = 0;
    for (let i = 0; i < c.data.length; i += 4) if (c.data[i] !== 255 || c.data[i + 1] !== 255 || c.data[i + 2] !== 255) coloured++;
    expect(coloured).toBeGreaterThan(40);
  });
});
